import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { CLASSES, CLASS_INFO, JUTSUS, LEGACY_JUTSUS } from '../src/realtime/jutsus.js';
import { ITEMS } from '../src/realtime/items.js';
import { makeMissions } from '../src/realtime/missions.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { makeProgression } from '../src/realtime/progression.js';
import { levelForXp, levelStart } from '../src/realtime/stats.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V7 = readFileSync(new URL('../db/schema_v7_progressao.sql', import.meta.url), 'utf8');
const V8 = readFileSync(new URL('../db/schema_v8_admin_chat.sql', import.meta.url), 'utf8');
const V12 = readFileSync(new URL('../db/schema_v12_sapatos.sql', import.meta.url), 'utf8');
/** As colunas que o findPlayer lê hoje: o acessório (v14) e a linhagem (v19). */
const V14_V19 = ['schema_v14_acessorio.sql', 'schema_v19_clas.sql'].map((f) => readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8')).join('\n');
const rule = (name: string) => (e: { constraint?: string }) => e.constraint === name;

describe('v7 no banco: progressão (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });
  const one = async (sql: string, p: unknown[] = []) => (await t.pool.query(sql, p)).rows[0];
  const toLevel = (id: string, level: number) => makeProgression(t.db).grantXp(id, levelStart(level));
  const finishTutorial = async (id: string) => {
    for (let s = 1; s <= 4; s++) await t.pool.query('SELECT game.advance_tutorial($1, $2)', [id, s]);
  };

  it('curva: game.level_start / level_for_xp == stats.ts em todos os 60 níveis; nível máximo 60', async () => {
    const { rows } = await t.pool.query(`SELECT l, game.level_start(l)::int AS start FROM generate_series(1, 60) l`);
    assert.deepEqual(rows.map((r) => r.start), Array.from({ length: 60 }, (_, i) => levelStart(i + 1)));
    for (const xp of [0, 99, 100, 13_749, 13_750, 571_999, 572_000, 1_888_000, 50_000_000]) {
      assert.equal((await one('SELECT game.level_for_xp($1) AS l', [xp])).l, levelForXp(xp), `xp ${xp}`);
    }
  });

  it('catálogo do banco == catálogo do servidor (10 classes, todos os jutsus com a v16 e a v18, itens)', async () => {
    const classes = (await t.pool.query('SELECT code, name, icon FROM game.classes ORDER BY sort_order')).rows;
    assert.deepEqual(classes, CLASSES.map((c) => ({ code: c, name: CLASS_INFO[c].name, icon: CLASS_INFO[c].icon })));
    const jutsus = (await t.pool.query('SELECT code, name, class_code, tier FROM game.jutsus ORDER BY code')).rows;
    assert.deepEqual(jutsus, JUTSUS.map((j) => ({ code: j.code, name: j.name, class_code: j.class, tier: j.tier })).sort((a, b) => (a.code < b.code ? -1 : 1)));
    const items = (await t.pool.query('SELECT code, name, kind, class_code, damage, price_ryo, shop FROM game.items ORDER BY code')).rows;
    assert.deepEqual(items, ITEMS.map((i) => ({
      code: i.code, name: i.name, kind: i.kind, class_code: i.class ?? null, damage: i.damage ?? null, price_ryo: i.price, shop: i.shop,
    })).sort((a, b) => (a.code < b.code ? -1 : 1)));
  });

  it('uso de jutsu: só sobe; o nível é calculado pelo banco (100 = Nv 2, 500 = Nv 3, 2000 = Nv 4)', async () => {
    const id = await t.createPlayer('usuario');
    const store = makeNinjaStore(t.db);
    await store.flushUsage(id, [['teleport', 99], ['fire', 5]]);       // fire: não aprendido, nada acontece
    assert.deepEqual(await one(`SELECT usage_count, level FROM game.player_jutsus WHERE player_id = $1 AND jutsu_code = 'teleport'`, [id]), { usage_count: 99, level: 1 });
    await store.flushUsage(id, [['teleport', 1]]);
    assert.equal((await one(`SELECT level FROM game.player_jutsus WHERE player_id = $1 AND jutsu_code = 'teleport'`, [id])).level, 2);
    await store.flushUsage(id, [['teleport', 1900]]);
    assert.equal((await one(`SELECT level FROM game.player_jutsus WHERE player_id = $1 AND jutsu_code = 'teleport'`, [id])).level, 4);
    assert.equal((await one(`SELECT count(*)::int AS n FROM game.player_jutsus WHERE player_id = $1`, [id])).n, 2);
    await assert.rejects(t.pool.query(`UPDATE game.player_jutsus SET usage_count = 0 WHERE player_id = $1`, [id]), rule('rule_usage_only_up'));
    await assert.rejects(t.pool.query(`UPDATE game.player_jutsus SET level = 4 WHERE player_id = $1`, [id]));
  });

  it('tutorial: um passo por vez; Kunai de Treino no passo 3; +100 ryō e +50 XP no 4; não volta nem pula', async () => {
    const id = await t.createPlayer('aluno');
    const store = makeNinjaStore(t.db);
    assert.equal(await store.advanceTutorial(id, 2), null, 'não pula');
    assert.equal((await store.advanceTutorial(id, 1))!.step, 1);
    assert.equal(await store.advanceTutorial(id, 1), null, 'não repete');
    await store.advanceTutorial(id, 2);
    assert.deepEqual((await store.advanceTutorial(id, 3))!.items, { kunai_training: 1, sandalia_ninja: 1 });
    const done = await store.advanceTutorial(id, 4);
    assert.deepEqual([done!.step, done!.ryo, done!.totalXp], [4, 100, 50]);
    await assert.rejects(t.pool.query('UPDATE game.players SET tutorial_step = 9 WHERE id = $1', [id]), rule('ck_players_tutorial'));
  });

  it('Missão de Genin: tutorial antes, nível 11, uma vez só; vira Genin com a classe e 1 pergaminho', async () => {
    const id = await t.createPlayer('genin');
    const store = makeNinjaStore(t.db);
    assert.deepEqual(await store.becomeGenin(id, 'fire'), { ok: false, text: 'Conclua o tutorial da Academia primeiro.' });
    await finishTutorial(id);
    assert.deepEqual(await store.becomeGenin(id, 'fire'), { ok: false, text: 'A Missão de Genin é a partir do nível 11.' });
    await toLevel(id, 11);
    const r = await store.becomeGenin(id, 'fire');
    assert.ok(r.ok);
    assert.deepEqual([r.rank, r.classes, r.items], [{ code: 'GENIN', name: 'Genin' }, { primary: 'fire', secondary: null }, { kunai_training: 1, sandalia_ninja: 1, scroll_liso: 1 }]);
    assert.equal((await store.becomeGenin(id, 'water')).ok, false, 'uma vez só');
    const found = await makeFindPlayer(t.db)(id);
    assert.deepEqual(found!.classes, { primary: 'fire', secondary: null });
    assert.deepEqual(await store.chooseSecondary(id, 'water'), { ok: false, text: 'A classe Secundária é para Chunin de nível 40, diferente da Primária e escolhida uma vez só.' });
  });

  it('Extração (v20): só da própria classe; custo 1/2/3/4; falha gasta os pergaminhos; sucesso ensina um jutsu do tier', async () => {
    const id = await t.createPlayer('extrator');
    const store = makeNinjaStore(t.db);
    await finishTutorial(id);
    await toLevel(id, 11);
    await store.becomeGenin(id, 'water');                                 // ganha 1 pergaminho de Água
    assert.deepEqual(await store.extract(id, 'fire', 1, 0, 0), { ok: false, text: 'Você só aprende jutsus da sua classe.' });
    assert.equal((await store.extract(id, 'water', 2, 0, 0) as { outcome: string }).outcome, 'no_scrolls', '2 pergaminhos para o nível 2');
    await assert.rejects(t.pool.query('SELECT * FROM game.extract_jutsu($1, $2, 5, 0, 0)', [id, 'water']), rule('rule_extraction_input'));
    await assert.rejects(t.pool.query('SELECT * FROM game.extract_jutsu($1, $2, 1, 1.5, 0)', [id, 'water']), rule('rule_extraction_input'));
    await store.addItem(id, 'scroll_liso', 1);
    const failed = await store.extract(id, 'water', 2, 0.8, 0);         // 0,8 >= 80%: falha
    assert.ok(failed.ok && failed.outcome === 'failed' && failed.consumed === 2 && failed.scrollsLeft === 0);
    await store.addItem(id, 'scroll_liso', 3);
    const ok = await store.extract(id, 'water', 2, 0.79, 0);              // < 80% (+10 da falha): sucesso
    assert.ok(ok.ok && ok.outcome === 'success' && ok.jutsu === 'water_2' && ok.scrollsLeft === 1);
    // v30: o tier 2 da Água tem vários jutsus: cada Extração dá um que falta, até acabarem
    const tier2: string[] = JUTSUS.filter((j) => j.class === 'water' && j.tier === 2).map((j) => j.code).sort();
    for (let i = 1; i < tier2.length; i++) {
      await store.addItem(id, 'scroll_liso', 2);
      const next = await store.extract(id, 'water', 2, 0, 0);
      assert.ok(next.ok && next.outcome === 'success' && tier2.includes(next.jutsu!));
    }
    await store.addItem(id, 'scroll_liso', 2);
    assert.equal((await store.extract(id, 'water', 2, 0, 0) as { outcome: string }).outcome, 'all_learned');
    // tier 1: as 2 primeiras são garantidas (até com o pior sorteio); a 3ª volta para 90%
    const g1 = await store.extract(id, 'water', 1, 0.999999, 0);
    const g2 = await store.extract(id, 'water', 1, 0.999999, 0);
    assert.ok(g1.ok && g1.outcome === 'success' && g1.jutsu === 'water' && g1.consumed === 1);
    assert.ok(g2.ok && g2.outcome === 'success' && g2.jutsu === 'water_dragao');
    const third = await store.extract(id, 'water', 1, 0.95, 0);
    assert.ok(third.ok && third.outcome === 'failed' && third.scrollsLeft === 0, '0,95 >= 90%: a 3ª pode falhar');
    assert.deepEqual(Object.keys((await makeFindPlayer(t.db)(id))!.jutsus!).sort(), ['substitution', 'teleport', 'water', 'water_dragao', ...tier2].sort());
    await store.addItem(id, 'scroll_liso', 2);
    assert.equal((await store.extract(id, 'water', 3, 0, 0) as { outcome: string }).outcome, 'no_scrolls', '3 pergaminhos para o nível 3');
  });

  it('loja: preço do catálogo, ryō não fica negativo, item fora da loja recusado; equipar só o que tem', async () => {
    const id = await t.createPlayer('freguês');
    const store = makeNinjaStore(t.db);
    assert.deepEqual(await store.buy(id, 'kunai', 1), { ok: false, text: 'Ryō insuficiente.' });
    await makeProgression(t.db).grantXp(id, 0, 500);
    assert.deepEqual(await store.buy(id, 'kunai', 1), { ok: true, ryo: 200, items: { kunai: 1, sandalia_ninja: 1 } });
    assert.deepEqual(await store.buy(id, 'kunai_training', 1), { ok: false, text: 'Esse item não está à venda.' });
    assert.deepEqual(await store.equip(id, 'fuma_shuriken'), { ok: false, text: 'Só dá para equipar uma arma do seu inventário.' });
    assert.deepEqual(await store.equip(id, 'kunai'), { ok: true, equipped: 'kunai' });
    await assert.rejects(t.pool.query('UPDATE game.players SET ryo = -1 WHERE id = $1', [id]), rule('ck_players_ryo'));
  });

  it('Kage: candidatura só no nível 60; registrar de novo não duplica', async () => {
    const id = await t.createPlayer('kage');
    const store = makeNinjaStore(t.db);
    assert.deepEqual(await store.applyKage(id), { ok: false, text: 'Só um ninja de nível 60 pode se candidatar a Kage.' });
    await toLevel(id, 60);
    assert.deepEqual(await store.applyKage(id), { ok: true, already: false });
    assert.deepEqual(await store.applyKage(id), { ok: true, already: true });
    assert.equal((await makeFindPlayer(t.db)(id))!.kageCandidate, true);
  });

  it('Exame Chunin: só para Genin de nível 40; aprovado por um Chunin+, o aprendiz vira Chunin', async () => {
    const missions = makeMissions(t.db);
    const sensei = await t.createPlayer('examinador', 'CHUNIN');
    const young = await t.createPlayer('jovem', 'GENIN');
    await toLevel(young, 39);
    assert.deepEqual(await missions.create(sensei, young, 'CHUNIN_EXAM', 3), { kind: 'refused', text: 'O Exame Chunin é para Genin de nível 40.' });
    const trainee = await t.createPlayer('candidato', 'GENIN');
    await toLevel(trainee, 40);
    const created = await missions.create(sensei, trainee, 'CHUNIN_EXAM', 3);
    assert.equal(created.kind, 'created');
    for (let i = 0; i < 3; i++) await missions.recordKill(trainee, 'slime');
    assert.equal((await missions.deliver(trainee, sensei)).kind, 'submitted');
    const evaluated = await missions.evaluate(sensei, (created as { mission: { id: string } }).mission.id, true, 5);
    assert.ok(evaluated.kind === 'evaluated');
    assert.deepEqual(evaluated.traineeRank, { code: 'CHUNIN', name: 'Chunin', canBeSensei: true });
  });
});

describe('v7 no banco: migração sobre quem já jogava', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  // Banco parado na v6 (antes da v7 e da v8): roda a v7 sobre quem já jogava, de novo, e depois a v8.
  before(async () => { t = await createTestDatabase(MIGRATIONS.slice(0, MIGRATIONS.indexOf('schema_v7_progressao.sql'))); });
  after(async () => { await t?.drop(); });

  it('veterano: tutorial concluído, os 7 jutsus de antes, nível pela curva nova; rodar de novo não mexe em nada', async () => {
    const id = await t.createPlayer('veterano');
    await t.pool.query('UPDATE game.players SET total_xp = 5000 WHERE id = $1', [id]);          // v5: nível 10
    await t.pool.query(`UPDATE game.players SET stat_points = stat_points - 9, attr_vitality = 9 WHERE id = $1`, [id]);
    await t.pool.query(V7);
    const novo = await t.createPlayer('novato');
    await t.pool.query(V7);                                                                       // de novo: sem erro
    await t.pool.query(V8);                                                                       // e a v8 e a v12 (findPlayer lê as colunas delas)
    await t.pool.query(V12);
    await t.pool.query(V14_V19);
    const found = await makeFindPlayer(t.db)(id);
    assert.equal(found!.tutorialStep, 4);
    assert.equal(found!.level, levelForXp(5000));
    assert.deepEqual(Object.keys(found!.jutsus!).sort(), [...LEGACY_JUTSUS, 'substitution', 'teleport'].sort());
    assert.deepEqual(found!.attributes!.vitality + found!.statPoints!, found!.level! - 1, 'pontos redistribuídos dentro do nível novo');
    assert.equal((await makeFindPlayer(t.db)(novo))!.tutorialStep, 0, 'conta nova continua no tutorial');
    assert.equal((await makeFindPlayer(t.db)(id))!.tutorialStep, 4);
  });
});
