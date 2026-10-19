import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { SQL } from '../src/missions/sql.js';
import { REALTIME } from '../src/realtime/config.js';
import { makeMissions, MISSIONS_SQL, NPC_MISSION, NPC_SENSEI_ID, type Missions } from '../src/realtime/missions.js';
import { makeProgression } from '../src/realtime/progression.js';
import { createTestDatabase, MIGRATIONS } from './support/testDb.js';

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';

const promotion = REALTIME.combat.promotion;

describe('Missões do NPC Mestre no banco (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  let missions: Missions;
  before(async () => {
    t = await createTestDatabase();
    missions = makeMissions(t.db, promotion);
  });
  after(async () => { await t?.drop(); });

  const row = async (sql: string, params: unknown[]) => (await t.pool.query(sql, params)).rows[0];
  const killSlimes = async (id: string, n: number) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(await missions.recordKill(id, 'slime'));
    return out;
  };

  it('a migração v4 roda de novo sem erro e cria o NPC sem login, com o rank mais alto', async () => {
    await t.pool.query(readFileSync(new URL('../db/schema_v4_npc_missions.sql', import.meta.url), 'utf8'));
    const npc = await row(
      `SELECT p.username, p.email, p.password_hash, r.code FROM game.players p JOIN game.ranks r ON r.id = p.current_rank_id WHERE p.id = $1`, [NPC_SENSEI_ID]);
    assert.deepEqual(npc, { username: 'Sensei Mestre', email: null, password_hash: null, code: 'S_JONIN' });
    const check = await t.pool.query(MISSIONS_SQL.bootCheck, [NPC_SENSEI_ID, NPC_MISSION.missionType, NPC_MISSION.difficulty]);
    assert.equal(check.rows.length, 1);
  });

  it('ciclo completo: atribui, conta 5 abates (o 6º não conta), entrega e credita XP + título', async () => {
    const id = await t.createPlayer('kaito');
    assert.equal(await missions.current(id), null);

    const first = await missions.talk(id);
    assert.equal(first.kind, 'assigned');
    const mission = first.kind === 'assigned' ? first.mission : undefined!;
    assert.deepEqual(
      { ...mission, id: 'x' },
      {
        id: 'x', status: 'active', senseiName: 'Mestre', fromNpc: true,
        type: { code: 'DEFEAT_MONSTER', name: 'Derrotar monstros' }, target: { code: 'slime', quantity: 5 },
        progress: 0, reward: { xp: 50, title: 'Discípulo do Mestre' }, expiresAt: null, ready: false,
      },
    );
    // Gravada no ciclo de sensei_missions: o NPC é o sensei (FK para game.players).
    assert.deepEqual(await row('SELECT sensei_id, trainee_id, status FROM game.sensei_missions WHERE id = $1', [mission.id]),
      { sensei_id: NPC_SENSEI_ID, trainee_id: id, status: 'active' });

    const again = await missions.talk(id);
    assert.equal(again.kind, 'in_progress', 'falar de novo não cria outra missão');

    assert.equal(await missions.recordKill(id, 'goblin'), null, 'monstro de outro tipo não conta');
    const kills = await killSlimes(id, 6);
    assert.deepEqual(kills.map((m) => m && [m.progress, m.ready]), [[1, false], [2, false], [3, false], [4, false], [5, true], null]);
    assert.equal((await missions.current(id))!.progress, 5);

    const done = await missions.talk(id);
    assert.equal(done.kind, 'rewarded');
    if (done.kind !== 'rewarded') return;
    assert.deepEqual(done.rewards.map(({ missionId: _, ...r }) => r), [
      { senseiName: 'Mestre', fromNpc: true, xp: 50, title: 'Discípulo do Mestre', titleNew: true },
    ]);
    assert.equal(done.totalXp, 50);
    assert.equal(done.mission, null);

    // O banco registrou o ciclo inteiro: entrega, avaliação do NPC, pergaminho, resgate e título.
    const cycle = await row(`
      SELECT m.status, m.submitted_at IS NOT NULL AS submitted, e.evaluated_by, e.is_approved,
             (SELECT count(*)::int FROM game.scroll_redemptions r WHERE r.scroll_id = s.id) AS redemptions,
             (SELECT t.code FROM game.player_titles pt JOIN game.titles t ON t.id = pt.title_id WHERE pt.player_id = m.trainee_id) AS title
        FROM game.sensei_missions m
        JOIN game.mission_evaluations e ON e.mission_id = m.id
        JOIN game.completion_scrolls s ON s.evaluation_id = e.id
       WHERE m.id = $1`, [mission.id]);
    assert.deepEqual(cycle, { status: 'completed', submitted: true, evaluated_by: NPC_SENSEI_ID, is_approved: true, redemptions: 1, title: 'MASTER_DISCIPLE' });
    assert.equal(await missions.current(id), null);

    // Segunda rodada: missão nova; o título não se repete, só o XP.
    assert.equal((await missions.talk(id)).kind, 'assigned');
    await killSlimes(id, 5);
    const second = await missions.talk(id);
    assert.ok(second.kind === 'rewarded');
    assert.equal(second.rewards[0]!.titleNew, false);
    assert.equal(second.totalXp, 100);
  });

  it('o cliente não forja a conclusão: com 2/5, falar com o Mestre não entrega e o banco recusa o submit', async () => {
    const id = await t.createPlayer('mei');
    const assigned = await missions.talk(id);
    assert.ok(assigned.kind === 'assigned');
    await killSlimes(id, 2);
    const talk = await missions.talk(id);
    assert.ok(talk.kind === 'in_progress');
    assert.equal(talk.mission.progress, 2);
    // Mesmo indo direto ao banco (como faria POST /missions/:id/submit), o trigger barra.
    await assert.rejects(t.pool.query(SQL.submitMission, [assigned.mission.id]), (err: { constraint?: string }) => err.constraint === 'rule_mission_incomplete');
    const xp = await row('SELECT total_xp FROM game.players WHERE id = $1', [id]);
    assert.equal(xp.total_xp, '0');
  });

  it('entregar o pergaminho promove Academia -> Genin quando passa de 100 XP', async () => {
    const id = await t.createPlayer('rin');
    await makeProgression(t.db, promotion).grantXp(id, 80);
    await missions.talk(id);
    await killSlimes(id, 5);
    const done = await missions.talk(id);
    assert.ok(done.kind === 'rewarded');
    assert.deepEqual([done.totalXp, done.rank.code, done.promoted], [130, 'GENIN', true]);
  });

  it('missão de um sensei jogador: o Mestre não avalia, os abates contam e o pergaminho aprovado é entregue na Sala', async () => {
    const sensei = await t.createPlayer('obito', 'CHUNIN');
    const id = await t.createPlayer('naruto');
    const created = await row(SQL.createMission, [sensei, id, 'DEFEAT_MONSTER', 'BASIC', 'slime', 2, null]);

    const talk = await missions.talk(id);
    assert.ok(talk.kind === 'other_sensei');
    assert.equal(talk.mission.senseiName, 'obito');
    assert.equal(talk.mission.fromNpc, false);

    const kills = await killSlimes(id, 2);
    assert.equal(kills[1]!.ready, true);
    assert.equal((await missions.talk(id)).kind, 'other_sensei', 'completa, mas quem avalia é o sensei dele');

    // O aprendiz entrega ao sensei (HTTP) e o sensei aprova: o pergaminho fica pendente.
    await t.pool.query(SQL.submitMission, [created.id]);
    await t.pool.query(SQL.insertEvaluation, [created.id, sensei, true, 4, null]);
    assert.equal((await missions.current(id))!.status, 'approved');

    const done = await missions.talk(id);
    assert.ok(done.kind === 'rewarded');
    assert.deepEqual(done.rewards.map((r) => [r.senseiName, r.xp, r.title]), [['obito', 100, null]]);
    assert.equal(done.totalXp, 100);
  });

  it('rank acima do Mestre: ele recusa sem criar nada', async () => {
    const id = await t.createPlayer('kakashi', 'S_JONIN');
    assert.deepEqual(await missions.talk(id), { kind: 'rank_too_high' });
    assert.equal(await missions.current(id), null);
  });

  it('toques simultâneos: uma missão só, e a recompensa sai uma vez', async () => {
    const id = await t.createPlayer('sakura');
    const firsts = await Promise.all([missions.talk(id), missions.talk(id), missions.talk(id)]);
    assert.equal(firsts.filter((o) => o.kind === 'assigned').length, 1);
    assert.ok(firsts.every((o) => o.kind === 'assigned' || o.kind === 'in_progress'));
    const open = await row(`SELECT count(*)::int AS n FROM game.sensei_missions WHERE trainee_id = $1`, [id]);
    assert.equal(open.n, 1);

    // 5 abates ao mesmo tempo: nenhum se perde.
    await Promise.all(Array.from({ length: 5 }, () => missions.recordKill(id, 'slime')));
    assert.equal((await missions.current(id))!.progress, 5);

    const turnIns = await Promise.all([missions.talk(id), missions.talk(id)]);
    assert.equal(turnIns.filter((o) => o.kind === 'rewarded').length, 1, 'só um toque entrega o pergaminho');
    const xp = await row('SELECT total_xp FROM game.players WHERE id = $1', [id]);
    assert.equal(xp.total_xp, '50');
  });
});

describe('Banco SEM a migração v4', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(MIGRATIONS.slice(0, 2)); });
  after(async () => { await t?.drop(); });

  it('o Mestre responde "indisponível" (o jogo segue) e o boot check acusa', async () => {
    const id = await t.createPlayer('hinata');
    assert.deepEqual(await makeMissions(t.db, promotion).talk(id), { kind: 'unavailable' });
    const check = await t.pool.query(MISSIONS_SQL.bootCheck, [NPC_SENSEI_ID, NPC_MISSION.missionType, NPC_MISSION.difficulty]);
    assert.equal(check.rows.length, 0);
  });
});
