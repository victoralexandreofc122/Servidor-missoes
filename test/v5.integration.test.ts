import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { REALTIME } from '../src/realtime/config.js';
import { makeMissions } from '../src/realtime/missions.js';
import { makeProfile } from '../src/realtime/profile.js';
import { makeProgression } from '../src/realtime/progression.js';
import { createTestDatabase } from './support/testDb.js';

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';

const promotion = REALTIME.combat.promotion;

describe('v5 no banco: nível, pontos e kits (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });
  const row = async (sql: string, p: unknown[]) => (await t.pool.query(sql, p)).rows[0];

  it('XP sobe o nível pelo trigger (+1 ponto por nível) e os pontos gastos ficam no banco', async () => {
    const id = await t.createPlayer('kaito');
    const profile = makeProfile(t.db, 10);
    assert.deepEqual(await profile.spendPoint(id, 'vitality'), { ok: false, reason: 'NO_POINTS' });
    const r = await makeProgression(t.db, promotion).grantXp(id, 300);
    assert.deepEqual([r!.level, r!.statPoints, r!.levelsGained], [3, 2, 2]);
    const spent = await profile.spendPoint(id, 'ninjutsu');
    assert.ok(spent.ok && spent.statPoints === 1 && spent.attributes.ninjutsu === 1);
    await profile.spendPoint(id, 'taijutsu');
    assert.deepEqual(await profile.spendPoint(id, 'taijutsu'), { ok: false, reason: 'NO_POINTS' });
    assert.deepEqual(await row('SELECT level, stat_points, attr_ninjutsu, attr_taijutsu FROM game.players WHERE id = $1', [id]),
      { level: 3, stat_points: 0, attr_ninjutsu: 1, attr_taijutsu: 1 });
  });

  it('atributo no máximo (10): MAXED; dois toques com 1 ponto só gastam 1', async () => {
    const id = await t.createPlayer('mei');
    const profile = makeProfile(t.db, 10);
    await makeProgression(t.db, promotion).grantXp(id, 6600);      // nível 12: 11 pontos
    for (let i = 0; i < 10; i++) assert.equal((await profile.spendPoint(id, 'agility')).ok, true);
    assert.deepEqual(await profile.spendPoint(id, 'agility'), { ok: false, reason: 'MAXED' });
    const both = await Promise.all([profile.spendPoint(id, 'vitality'), profile.spendPoint(id, 'chakraMax')]);
    assert.equal(both.filter((b) => b.ok).length, 1, 'o último ponto só sai uma vez');
  });

  it('ninguém forja: ponto inventado, nível mudado na mão e kit inválido são recusados pelo próprio banco', async () => {
    const id = await t.createPlayer('rin');
    await assert.rejects(t.pool.query('UPDATE game.players SET stat_points = 5 WHERE id = $1', [id]), (e: { constraint?: string }) => e.constraint === 'ck_players_stat_points');
    await assert.rejects(t.pool.query('UPDATE game.players SET level = 9 WHERE id = $1', [id]), (e: { constraint?: string }) => e.constraint === 'rule_level_from_xp');
    const profile = makeProfile(t.db, 10);
    await assert.rejects(profile.saveLoadout(id, ['fire', 'fire'], []), (e: { constraint?: string }) => e.constraint === 'ck_players_kits');
    await assert.rejects(profile.saveLoadout(id, ['fire', 'water', 'heal', 'stone', 'shadow'], []), (e: { constraint?: string }) => e.constraint === 'ck_players_kits');
    await profile.saveLoadout(id, ['shadow', 'fire'], ['heal']);
    assert.deepEqual(await row('SELECT kit_a, kit_b FROM game.players WHERE id = $1', [id]), { kit_a: ['shadow', 'fire'], kit_b: ['heal'] });
  });
});

describe('v5 no banco: missão entre jogadores (sensei Chunin -> aprendiz)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('ciclo completo: criar, contar abates, entregar ao sensei, reprovar, refazer, aprovar e resgatar no Mestre', async () => {
    const missions = makeMissions(t.db, promotion);
    const sensei = await t.createPlayer('obito', 'CHUNIN');
    const other = await t.createPlayer('kakashi', 'JONIN');
    const trainee = await t.createPlayer('naruto');
    const genin = await t.createPlayer('sakura');

    assert.deepEqual(await missions.create(genin, trainee, 'BASIC', 3), { kind: 'refused', text: 'Seu rank ainda não permite criar missões de sensei.' });
    assert.deepEqual(await missions.create(sensei, other, 'BASIC', 3), { kind: 'refused', text: 'O aprendiz precisa ter um rank abaixo do seu.' });
    assert.deepEqual(await missions.create(sensei, trainee, 'NOPE', 3), { kind: 'refused', text: 'Esse tipo de missão ou essa dificuldade não está disponível.' });

    const created = await missions.create(sensei, trainee, 'BASIC', 3);
    assert.ok(created.kind === 'created');
    assert.deepEqual([created.mission.senseiName, created.mission.target, created.mission.reward.xp], ['obito', { code: 'slime', quantity: 3 }, 100]);
    assert.deepEqual(await missions.create(other, trainee, 'BASIC', 3), { kind: 'refused', text: 'Esse aprendiz já está com uma missão de sensei em aberto.' });

    assert.equal((await missions.deliver(trainee, other)).kind, 'no_mission', 'só ao sensei que criou');
    assert.equal((await missions.deliver(trainee, sensei)).kind, 'incomplete');
    for (let i = 0; i < 3; i++) await missions.recordKill(trainee, 'slime');
    const delivered = await missions.deliver(trainee, sensei);
    assert.ok(delivered.kind === 'submitted' && delivered.mission.status === 'submitted');
    assert.equal((await missions.deliver(trainee, sensei)).kind, 'already_submitted');
    const pending = await missions.pendingEvaluations(sensei);
    assert.deepEqual(pending.map((p) => p.trainee.username), ['naruto']);

    assert.deepEqual(await missions.evaluate(other, created.mission.id, true, 5), { kind: 'refused', text: 'Só o sensei desta missão pode avaliá-la.' });
    const rejected = await missions.evaluate(sensei, created.mission.id, false, 2);
    assert.ok(rejected.kind === 'evaluated' && rejected.traineeId === trainee);
    assert.deepEqual([rejected.mission.status, rejected.mission.progress], ['active', 0], 'reprovada: refaz do zero');

    for (let i = 0; i < 3; i++) await missions.recordKill(trainee, 'slime');
    assert.equal((await missions.deliver(trainee, sensei)).kind, 'submitted');
    const approved = await missions.evaluate(sensei, created.mission.id, true, 5);
    assert.ok(approved.kind === 'evaluated' && approved.mission.status === 'approved' && approved.mission.ready);

    // O pergaminho vai para a Sala de Missões (o Mestre): XP no banco e o nível sobe pelo trigger.
    const redeemed = await missions.talk(trainee);
    assert.ok(redeemed.kind === 'rewarded');
    assert.deepEqual(redeemed.rewards.map((r) => [r.senseiName, r.xp]), [['obito', 100]]);
    assert.deepEqual([redeemed.totalXp, redeemed.level, redeemed.statPoints, redeemed.levelsGained], [100, 2, 1, 1]);
  });

  it('opções do sensei: as dificuldades do catálogo, sem o Treino do Mestre (só do NPC)', async () => {
    const options = await makeMissions(t.db, promotion).senseiOptions();
    assert.deepEqual(options.map((o) => o.code), ['BASIC', 'STANDARD', 'ADVANCED', 'MASTER']);
    assert.equal(options[2]!.title, 'Aprendiz Dedicado');
  });
});
