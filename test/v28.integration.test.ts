import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeAdminStore } from '../src/realtime/admin.js';
import { REALTIME } from '../src/realtime/config.js';
import { DUEL } from '../src/realtime/duel.js';
import { makeEndgameStore } from '../src/realtime/endgameStore.js';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { GameWorld } from '../src/realtime/gameWorld.js';
import { FakeConn, seededRandom } from './support/world.js';
import { makeProgression } from '../src/realtime/progression.js';
import { makeSeasonStore } from '../src/realtime/seasonStore.js';
import { levelStart } from '../src/realtime/stats.js';
import { bracketChampion, bracketEntrants, jouninOfEra, makeBracket, makeGroups } from '../src/realtime/tournament.js';
import { createTestDatabase } from './support/testDb.js';

/* v28: Fase Final do Torneio da Temporada com o banco de verdade: grupos, chaves, encerramento e a trava de vila. */
const noDatabase = !process.env.TEST_DATABASE_URL;

describe('v28 no banco: fase final do Torneio da Temporada', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  let store: ReturnType<typeof makeSeasonStore>;
  before(async () => { t = await createTestDatabase(); store = makeSeasonStore(t.db); });
  after(async () => { await t?.drop(); });
  const one = async (sql: string, p: unknown[] = []) => (await t.pool.query(sql, p)).rows[0];
  const ids: string[] = [];           // os 22 da vila_1 que jogaram 15+, do melhor para o pior
  let outsider = '';                  // jogou 3 partidas: fora do placar
  const now = () => new Date();

  it('a migração roda duas vezes; a era continua na etapa de pontos', async () => {
    await t.pool.query(readFileSync(new URL('../db/schema_v28_fase_final.sql', import.meta.url), 'utf8'));
    const era = (await store.current())!;
    assert.deepEqual([era.stage, era.finalReady], ['pontos', true]);
  });

  it('prepara: 22 ninjas com 15+ partidas e 1 com 3; abre o Torneio (10 vagas, corte no 20º)', async () => {
    for (let i = 0; i < 23; i++) {
      const id = await t.createPlayer(`f${String(i + 1).padStart(2, '0')}`, 'CHUNIN');
      await makeProgression(t.db).grantXp(id, levelStart(40));
      await t.pool.query('UPDATE game.players SET last_seen_at = now(), tutorial_step = 4 WHERE id = $1', [id]);
      if (i < 22) ids.push(id); else outsider = id;
    }
    const era = (await store.current())!;
    await store.openJounin(new Date(era.startsAt.getTime() + 1), new Date(Date.now() + 5 * 86_400_000));
    for (let i = 0; i < 22; i++) {
      await t.pool.query(`INSERT INTO game.jounin_points (season_id, player_id, village, points, wins, losses) VALUES (1, $1, 'vila_1', $2, 16, 2)`, [ids[i], 900 - i * 10]);
    }
    await t.pool.query(`INSERT INTO game.jounin_points (season_id, player_id, village, points, wins, losses) VALUES (1, $1, 'vila_1', 60, 2, 1)`, [outsider]);
    assert.equal((await store.slots(1)).vila_1!.slots, 10);
  });

  it('trava de vila: com o Torneio aberto ninguém troca de vila (a mensagem é a do jogo); admin de teste passa', async () => {
    const eg = makeEndgameStore(t.db);
    await t.pool.query(`UPDATE game.endgame_modules SET mode = 'on'`).catch(() => undefined);
    await assert.rejects(t.pool.query(`UPDATE game.players SET village = 'vila_3' WHERE id = $1`, [ids[0]]), (e: any) => e.constraint === 'rule_village_locked');
    const r = await eg.chooseVillage(ids[0]!, 'vila_3');
    assert.equal(r.ok, false);
    assert.equal((await one('SELECT village FROM game.players WHERE id = $1', [ids[0]])).village, 'vila_1');
    await t.pool.query('UPDATE game.players SET is_admin = true WHERE id = $1', [outsider]);
    await t.pool.query(`UPDATE game.players SET village = 'vila_3' WHERE id = $1`, [outsider]);
    await t.pool.query(`UPDATE game.players SET village = 'vila_1' WHERE id = $1`, [outsider]);
    await t.pool.query('UPDATE game.players SET is_admin = false WHERE id = $1', [outsider]);
  });

  it('fase de pontos: o banco recusa partida entre vilas diferentes', async () => {
    const other = await t.createPlayer('outra_vila', 'CHUNIN');
    await makeProgression(t.db).grantXp(other, levelStart(40));
    await t.pool.query(`UPDATE game.players SET is_admin = true WHERE id = $1`, [other]);
    await t.pool.query(`UPDATE game.players SET village = 'vila_3' WHERE id = $1`, [other]);
    await t.pool.query(`UPDATE game.players SET is_admin = false WHERE id = $1`, [other]);
    await assert.rejects(t.pool.query('SELECT * FROM game.jounin_result($1, $2, $3, $4)', [ids[0], other, 'ko', 1000]), (e: any) => e.constraint === 'rule_jounin_village');
  });

  it('fechar os pontos monta os grupos: 20 finalistas em 4 grupos de 5, na mesma cobrinha do servidor; 10 jogos por grupo', async () => {
    assert.equal(await store.startGroups(now()), 1);
    assert.equal((await store.current())!.stage, 'grupos');
    const table = await store.groupTable(1, 'vila_1');
    assert.equal(table.length, 20);
    const expected = makeGroups(20);
    for (let g = 0; g < 4; g++) {
      assert.deepEqual(table.filter((r) => r.groupNo === g + 1).map((r) => r.seed).sort((a, b) => a - b), expected[g]);
    }
    assert.ok(table.every((r) => r.pending === 4 && r.wins === 0));
    assert.equal((await one('SELECT count(*)::int AS n FROM game.tournament_group_matches')).n, 40);
    const st = await store.finalState(1);
    assert.deepEqual([st.pending.length, st.finalists.size, st.finalists.has(ids[20]!), st.finalists.has(outsider)], [40, 20, false, false]);
    // a fase de pontos fechou de vez
    assert.deepEqual(await store.result(ids[0]!, ids[1]!, 'ko', 1000), { ok: false, code: 'closed' });
  });

  it('jogos de grupo: só entre quem tem jogo pendente; a tabela ordena por vitórias e passam 2 por grupo', async () => {
    const seedOf = new Map((await store.groupTable(1, 'vila_1')).map((r) => [r.playerId, r] as const));
    assert.equal(await store.finalResult('grupos', ids[0]!, ids[1]!, 2, 0, 'rounds', now()), false, 'grupos diferentes: não há jogo');
    const { pending } = await store.finalState(1);
    let left = 0;
    for (const m of pending) {
      const a = seedOf.get(m.a)!, b = seedOf.get(m.b)!;
      if (a.groupNo === 4 && b.groupNo === 4 && (a.seed === 20 || b.seed === 20)) { left++; continue; }   // o cabeça 20 não aparece: W.O.
      const [w, l] = a.seed < b.seed ? [m.a, m.b] : [m.b, m.a];
      assert.equal(await store.finalResult('grupos', w, l, 2, 1, 'rounds', now()), true);
    }
    assert.equal(left, 4);
    assert.equal(await store.finalResult('grupos', ids[0]!, ids[7]!, 2, 0, 'rounds', now()), false, 'o mesmo jogo não vale duas vezes');
    assert.equal(await store.closeGroups(now()), 1);
    const table = await store.groupTable(1, 'vila_1');
    assert.deepEqual(table.filter((r) => r.advanced).map((r) => r.seed).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
    const last = table.find((r) => r.seed === 20)!;
    assert.deepEqual([last.wins, last.losses, last.pending, last.position], [0, 4, 0, 5], 'W.O.: derrota em todos');
    assert.equal((await store.current())!.stage, 'chaves');
  });

  it('chave de 8: 1º de grupo contra 2º, vencedor sobe de rodada, e a final decide o campeão', async () => {
    const table = await store.groupTable(1, 'vila_1');
    const entrants = bracketEntrants(table).map((r) => r.playerId);
    await store.saveBracket(1, 'vila_1', makeBracket(entrants));
    await store.saveBracket(1, 'vila_1', makeBracket(entrants));   // de novo: não duplica
    let b = await store.bracket(1, 'vila_1');
    assert.deepEqual([b.length, b[0]!.rounds, b[0]!.aName, b[0]!.bName], [4, 3, 'f01', 'f05']);
    const seed = new Map(table.map((r) => [r.playerId, r.seed] as const));
    for (let round = 1; round <= 3; round++) {
      const { pending } = await store.finalState(1);
      assert.equal(pending.length, 2 ** (3 - round));
      for (const m of pending) {
        const [w, l] = seed.get(m.a)! < seed.get(m.b)! ? [m.a, m.b] : [m.b, m.a];
        assert.equal(await store.finalResult('chaves', w, l, 2, 0, 'rounds', now()), true);
      }
    }
    b = await store.bracket(1, 'vila_1');
    assert.equal(b.length, 7);
    assert.equal(bracketChampion(b), ids[0]);
    assert.equal((await store.finalState(1)).pending.length, 0);
  });

  it('encerramento: 10 Jounin (8 da chave + 2 melhores terceiros) com patente e registro; consolação só para quem ficou fora da fase final', async () => {
    const table = await store.groupTable(1, 'vila_1'), bracket = await store.bracket(1, 'vila_1');
    const jounin = jouninOfEra(10, table, bracket);
    assert.equal(jounin.length, 10);
    assert.deepEqual(jounin.slice(0, 2), [ids[0], ids[1]], 'campeão e vice');
    // o banco confere: quem não disputou a fase final não entra; posição acima das vagas não entra
    await assert.rejects(store.finish([outsider], [1], now()), (e: any) => e.constraint === 'rule_tournament_list');
    await assert.rejects(store.finish([jounin[0]!], [11], now()), (e: any) => e.constraint === 'rule_tournament_list');
    const ryoBefore = Number((await one('SELECT ryo FROM game.players WHERE id = $1', [ids[21]])).ryo);
    assert.deepEqual(await store.finish(jounin, jounin.map((_, i) => i + 1), now()), { jounin: 10, consoled: 3 });
    const era = await store.era(1);
    assert.deepEqual(era.map((e) => e.playerId), jounin);
    assert.equal((await one(`SELECT r.code FROM game.players p JOIN game.ranks r ON r.id = p.current_rank_id WHERE p.id = $1`, [ids[0]])).code, 'JONIN');
    assert.equal(await store.eligible(ids[0]!), false, 'Jounin não disputa de novo');
    // fora do corte (21º, 22º e o de 3 partidas): 200 ryō e o título; eliminado nos grupos: nada (regra do Victor)
    assert.equal(Number((await one('SELECT ryo FROM game.players WHERE id = $1', [ids[21]])).ryo) - ryoBefore, 200);
    const titled = (await t.pool.query(`SELECT pt.player_id FROM game.player_titles pt JOIN game.titles ti ON ti.id = pt.title_id WHERE ti.code = 'SEREI_O_PROXIMO_JOUNIN'`)).rows.map((r) => r.player_id).sort();
    assert.deepEqual(titled, [ids[20], ids[21], outsider].sort());
    assert.equal((await store.current())!.stage, 'encerrado');
    await assert.rejects(store.finish(jounin, jounin.map((_, i) => i + 1), now()), (e: any) => e.constraint === 'rule_tournament_stage');
    // encerrado: a troca de vila volta a ser possível
    await t.pool.query(`UPDATE game.players SET village = 'vila_3' WHERE id = $1`, [ids[21]]);
  });
});

describe('v43 no banco: a Fase Final pelo jogo (fila, Arena e comandos de admin)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });
  const one = async (sql: string, p: unknown[] = []) => (await t.pool.query(sql, p)).rows[0];
  const wait = async (ok: () => boolean) => { for (let i = 0; i < 150 && !ok(); i++) await new Promise((r) => setTimeout(r, 20)); assert.ok(ok(), 'esperei demais'); };

  it('fechar monta os grupos; dois finalistas lutam o jogo do grupo; W.O. do resto; chaves; encerrar promove os Jounin', async () => {
    const store = makeSeasonStore(t.db);
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = await t.createPlayer(`nin${i + 1}`, 'CHUNIN');
      await makeProgression(t.db).grantXp(id, levelStart(40));
      await t.pool.query('UPDATE game.players SET last_seen_at = now(), tutorial_step = 4 WHERE id = $1', [id]);
      ids.push(id);
    }
    const adm = await t.createPlayer('chefe', 'CHUNIN');
    await t.pool.query('UPDATE game.players SET is_admin = true, tutorial_step = 4 WHERE id = $1', [adm]);
    const era = (await store.current())!;
    await store.openJounin(new Date(era.startsAt.getTime() + 1), new Date(Date.now() + 5 * 86_400_000));
    for (let i = 0; i < 6; i++) await t.pool.query(`INSERT INTO game.jounin_points (season_id, player_id, village, points, wins, losses) VALUES (1, $1, 'vila_1', $2, 15, 1)`, [ids[i], 600 - i * 10]);

    const cfg = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 } } };
    let now = Date.now() + 1000;
    const w = new GameWorld(cfg, () => now, undefined, { random: seededRandom(), season: store, admin: makeAdminStore(t.db) });
    await w.seasonMaintenance();
    const enter = async (id: string) => {
      const conn = new FakeConn();
      const h = w.join((await makeFindPlayer(t.db)(id))!, conn);
      const send = (m: unknown) => h.receive(JSON.stringify(m));
      send({ type: 'ranked', action: 'enter' });
      return { id, conn, send };
    };
    const run = (ms: number) => { for (let x = 0; x < ms; x += cfg.tickMs) { now += cfg.tickMs; w.tick(); } };
    const s = (id: string) => (w as any).sessions.get(id);
    const boss = await enter(adm);
    const admin = async (cmd: string, done: RegExp) => {
      boss.conn.clear();
      run(1000);
      boss.send({ type: 'chat', message: `/admin torneio ${cmd}` });
      await wait(() => boss.conn.of('notice').some((n: any) => done.test(n.text)));
      return boss.conn.of('notice').map((n: any) => n.text).join(' | ');
    };

    // 6 finalistas: 2 grupos de 3 (cobrinha: [1,4,5] e [2,3,6])
    assert.match(await admin('fechar', /grupos montados/), /6 finalistas em 2 grupos/);
    assert.match(await admin('encerrar', /pendente|eliminatória/), /jogo\(s\) pendente/);
    const a = await enter(ids[0]!), b = await enter(ids[3]!), c = await enter(ids[1]!);
    await wait(() => a.conn.last('jounin_state')?.stage === 'grupos');
    assert.equal(a.conn.last('jounin_state').finalist, true);
    // nin1 e nin2 são de grupos diferentes: não há jogo entre eles; nin1 e nin4 são do mesmo grupo
    for (const p of [a, c]) p.send({ type: 'ranked', action: 'final_queue' });
    run(cfg.tickMs * 3);
    assert.equal((w as any).duel, null);
    b.send({ type: 'ranked', action: 'final_queue' });
    run(cfg.tickMs + DUEL.prepMs);
    const st = a.conn.last('duel_state');
    assert.deepEqual([st.mode, st.a.name, st.b.name], ['final', 'nin1', 'nin4']);
    for (let r = 0; r < 2; r++) {
      s(b.id).hp = 0.5;
      (w as any).damagePlayer(s(b.id), 5, now, undefined, s(a.id), 'attack');
      run(DUEL.intervalMs + cfg.tickMs);
    }
    await wait(() => !!a.conn.last('duel_rating'));
    assert.deepEqual(a.conn.last('duel_rating'), { type: 'duel_rating', mode: 'final', counted: true, delta: 0, mmr: 0, won: true, ryo: 0 });
    assert.deepEqual(await one('SELECT winner_id, a_rounds + b_rounds AS r FROM game.tournament_group_matches WHERE winner_id IS NOT NULL'), { winner_id: ids[0], r: 2 });
    run(DUEL.endMs + cfg.tickMs);
    // o placar do grupo para o jogador
    run(1000);
    a.send({ type: 'ranked', action: 'final_board' });
    await wait(() => !!a.conn.last('final_board'));
    const board = a.conn.last('final_board');
    assert.deepEqual([board.stage, board.groups.length, board.finalist, board.pending], ['grupos', 2, true, ['nin5']]);
    assert.deepEqual(board.groups[0].rows[0], { position: 1, username: 'nin1', wins: 1, losses: 0, roundsFor: 2, roundsAgainst: 0, pending: 1, advanced: true, me: true });

    // W.O. num jogo, fecha os grupos (o que faltou vira derrota dos dois) e monta a chave de 4
    assert.match(await admin('wo nin5', /W\.O\. aplicado/), /nin5 perdeu/);
    assert.match(await admin('chaves', /eliminatória montada/), /chave de 4/);
    assert.equal((await store.current())!.stage, 'chaves');
    // a chave inteira por W.O. do pior cabeça de chave de cada jogo, até sair o campeão
    for (let i = 0; i < 3; i++) {
      const { pending } = await store.finalState(1);
      if (!pending.length) break;
      const seed = new Map((await store.groupTable(1, 'vila_1')).map((r) => [r.playerId, r] as const));
      for (const m of pending) {
        const loser = seed.get(m.a)!.seed > seed.get(m.b)!.seed ? seed.get(m.a)! : seed.get(m.b)!;
        await admin(`wo ${loser.username}`, /W\.O\. aplicado/);
      }
    }
    const text = await admin('encerrar', /Torneio encerrado/);
    assert.match(text, /6 Jounin registrados, 0 prêmios de consolação.*campeão: nin1/);
    assert.deepEqual(s(a.id).rank, { code: 'JONIN', name: 'Jonin' });
    assert.match(a.conn.of('notice').map((n: any) => n.text).join(' | '), /Você é Jounin da Era 1/);
    assert.equal((await one('SELECT count(*)::int AS n FROM game.jounin_era')).n, 6);
    run(1000);
    a.send({ type: 'ranked', action: 'final_board' });
    await wait(() => a.conn.last('final_board')?.stage === 'encerrado');
    const end = a.conn.last('final_board');
    assert.deepEqual([end.champion, end.era[0]], ['nin1', { position: 1, username: 'nin1', me: true }]);
    w.close();
  });
});
