import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeProgression } from '../src/realtime/progression.js';
import { JOUNIN_RULES, jouninSlots, makeSeasonStore } from '../src/realtime/seasonStore.js';
import { levelStart } from '../src/realtime/stats.js';
import { createTestDatabase } from './support/testDb.js';

/* v27: eras e a fase de pontos do Torneio da Temporada, com o banco de verdade. */
const noDatabase = !process.env.TEST_DATABASE_URL;

describe('v27 no banco: eras e Torneio da Temporada (fase de pontos)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  let store: ReturnType<typeof makeSeasonStore>;
  before(async () => { t = await createTestDatabase(); store = makeSeasonStore(t.db); });
  after(async () => { await t?.drop(); });
  const one = async (sql: string, p: unknown[] = []) => (await t.pool.query(sql, p)).rows[0];
  const DAY = 86_400_000;
  let n = 0;
  async function ninja(level: number, opts: { rank?: string; village?: string | null; admin?: boolean } = {}) {
    const id = await t.createPlayer(`n${++n}_${level}`, opts.rank ?? 'CHUNIN');
    await makeProgression(t.db).grantXp(id, levelStart(level));
    await t.pool.query('UPDATE game.players SET last_seen_at = now(), tutorial_step = 4, is_admin = $2 WHERE id = $1', [id, !!opts.admin]);
    if (opts.village === null) await t.pool.query('UPDATE game.players SET village = NULL, renegade_at = now() WHERE id = $1', [id]);
    else if (opts.village) await t.pool.query('UPDATE game.players SET village = $2 WHERE id = $1', [id, opts.village]);
    return id;
  }

  it('a migração roda duas vezes; a Era 1 nasce aberta, junto com a temporada do rankeado; as vagas batem com o servidor', async () => {
    const sql = readFileSync(new URL('../db/schema_v27_temporadas.sql', import.meta.url), 'utf8');
    await t.pool.query(sql);
    assert.equal(await store.available(), true);
    const era = (await store.current())!;
    assert.equal(era.id, 1);
    assert.equal(era.jounin, null);
    const ranked = await one('SELECT starts_at, ends_at FROM game.ranked_seasons WHERE closed_at IS NULL');
    assert.equal(era.endsAt.getTime(), new Date(ranked.ends_at).getTime());
    for (const a of [0, 49, 500, 550, 1000, 3000, 99_999]) {
      assert.equal((await one('SELECT game.jounin_slots_for($1) AS s', [a])).s, jouninSlots(a), `ativos ${a}`);
    }
  });

  it('antes de abrir o Torneio: partida recusada e nada gravado', async () => {
    const a = await ninja(40), b = await ninja(45);
    assert.deepEqual(await store.result(a, b, 'ko', 60_000), { ok: false, code: 'closed' });
    assert.equal((await one('SELECT count(*)::int AS n FROM game.jounin_matches')).n, 0);
  });

  it('abrir o Torneio congela as vagas por vila (mínimo 10) e não recalcula ao chamar de novo', async () => {
    const era = (await store.current())!;
    const from = new Date(era.startsAt.getTime() + 1), to = new Date(Math.min(Date.now() + 10 * DAY, era.endsAt.getTime()));
    assert.equal(await store.openJounin(from, to), 1);
    const slots = await store.slots(1);
    assert.equal(slots.vila_1!.slots, 10);
    assert.ok(slots.vila_1!.active >= 2);
    const before = slots.vila_1!.active;
    await ninja(40);
    await store.openJounin(from, to);
    assert.equal((await store.slots(1)).vila_1!.active, before, 'vagas congeladas');
  });

  it('quem pode: nível 40+, com vila, e que não seja Jounin, ANBU ou Kage', async () => {
    const ok = await ninja(40), low = await ninja(39), jonin = await ninja(50, { rank: 'JONIN' }), anbu = await ninja(50, { rank: 'ANBU' }), ren = await ninja(50, { village: null });
    assert.deepEqual(await Promise.all([ok, low, jonin, anbu, ren].map((id) => store.eligible(id))), [true, false, false, false, false]);
    const other = await ninja(41);
    for (const bad of [low, jonin, anbu, ren]) {
      assert.deepEqual(await store.result(other, bad, 'ko', 1000), { ok: false, code: 'not_eligible' });
      assert.deepEqual(await store.result(bad, other, 'ko', 1000), { ok: false, code: 'not_eligible' });
    }
    assert.deepEqual(await store.result(ok, ok, 'ko', 1000), { ok: false, code: 'not_eligible' });
    // quem já está no registro de uma era (título permanente) não disputa de novo
    await t.pool.query(`INSERT INTO game.jounin_era (season_id, player_id, village, position) VALUES (1, $1, 'vila_1', 1)`, [ok]);
    assert.equal(await store.eligible(ok), false);
    await t.pool.query('DELETE FROM game.jounin_era');
  });

  it('pontos: +30 e -10 (nunca abaixo de 0); ryō +100 e +30; não mexe no MMR do rankeado', async () => {
    const a = await ninja(40), b = await ninja(44);
    const ryo = async (id: string) => Number((await one('SELECT ryo FROM game.players WHERE id = $1', [id])).ryo);
    const [ra, rb] = [await ryo(a), await ryo(b)];
    const r1 = await store.result(a, b, 'ko', 90_000);
    assert.ok(r1.ok);
    assert.deepEqual(r1.result, { counted: true, winnerDelta: 30, loserDelta: 0, winnerPoints: 30, loserPoints: 0, winnerRyo: 100, loserRyo: 30, seasonId: 1 });
    const r2 = await store.result(b, a, 'ko', 90_000);
    assert.ok(r2.ok);
    assert.deepEqual([r2.result.winnerDelta, r2.result.loserDelta, r2.result.winnerPoints, r2.result.loserPoints], [30, -10, 30, 20]);
    assert.deepEqual([await ryo(a) - ra, await ryo(b) - rb], [130, 130]);
    assert.equal((await one('SELECT count(*)::int AS n FROM game.ranked_matches')).n, 0);
  });

  it('o mesmo par conta 3 partidas em 24 h; a 4ª fica no histórico valendo 0; admin nunca conta', async () => {
    const a = await ninja(40), b = await ninja(40), adm = await ninja(40, { admin: true });
    for (let i = 0; i < 3; i++) assert.equal(((await store.result(a, b, 'ko', 1000)) as any).result.counted, true);
    const r4 = (await store.result(a, b, 'ko', 1000)) as any;
    assert.deepEqual([r4.result.counted, r4.result.winnerDelta, r4.result.winnerRyo, r4.result.winnerPoints], [false, 0, 0, 90]);
    const r5 = (await store.result(a, adm, 'ko', 1000)) as any;
    assert.equal(r5.result.counted, false);
    assert.equal((await one('SELECT count(*)::int AS n FROM game.jounin_matches WHERE winner_id = $1', [a])).n, 5);
  });

  it('classificação da vila: só quem tem 15 partidas entra; finalistas = 2x as vagas; admin fora', async () => {
    const mk = async (points: number, wins: number, losses: number, admin = false) => {
      const id = await ninja(40, { village: 'vila_3', admin });
      await t.pool.query(`INSERT INTO game.jounin_points (season_id, player_id, village, points, wins, losses) VALUES (1, $1, 'vila_3', $2, $3, $4)`, [id, points, wins, losses]);
      return id;
    };
    const top = await mk(400, 14, 2), few = await mk(900, 14, 0), mid = await mk(200, 8, 8);
    await mk(999, 30, 0, true);
    const many: string[] = [];
    for (let i = 0; i < 20; i++) many.push(await mk(100 - i, 5, 10));
    const rows = await store.standings(1, 'vila_3');
    assert.equal(rows.find((r) => r.playerId === few)!.position, null, 'menos de 15 partidas: fora da ordem');
    assert.equal(rows.find((r) => r.playerId === few)!.finalist, false);
    assert.equal(rows[0]!.playerId, top);
    assert.equal(rows[1]!.playerId, mid);
    assert.equal(rows.filter((r) => r.finalist).length, 2 * JOUNIN_RULES.minSlots);
    assert.equal(rows.find((r) => r.playerId === many[19])!.finalist, false, 'o 22º fica de fora');
    assert.equal(rows.length, 23, 'admin não aparece');
  });

  it('depois que a janela fecha: recusado', async () => {
    const a = await ninja(40), b = await ninja(40);
    const era = (await store.current())!;
    assert.deepEqual(await store.result(a, b, 'ko', 1000, new Date(era.jounin!.endsAt.getTime() + 1000)), { ok: false, code: 'closed' });
  });
});
