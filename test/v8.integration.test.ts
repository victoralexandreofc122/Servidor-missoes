import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { makeAdminStore } from '../src/realtime/admin.js';
import { makeChatLog } from '../src/realtime/chatLog.js';
import { REALTIME } from '../src/realtime/config.js';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { GameWorld } from '../src/realtime/gameWorld.js';
import { makeMissions } from '../src/realtime/missions.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { makeProfile } from '../src/realtime/profile.js';
import { makeProgression } from '../src/realtime/progression.js';
import { levelStart } from '../src/realtime/stats.js';
import { MIGRATIONS, createTestDatabase } from './support/testDb.js';
import { FakeConn, seededRandom } from './support/world.js';

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';
const V8 = readFileSync(new URL('../db/schema_v8_admin_chat.sql', import.meta.url), 'utf8');
const V12 = readFileSync(new URL('../db/schema_v12_sapatos.sql', import.meta.url), 'utf8');
/** As colunas que o findPlayer lê hoje: o acessório (v14) e a linhagem (v19). */
const V14_V19 = ['schema_v14_acessorio.sql', 'schema_v19_clas.sql'].map((f) => readFileSync(new URL(`../db/${f}`, import.meta.url), 'utf8')).join('\n')
  + '\nALTER TABLE game.players ADD COLUMN IF NOT EXISTS clan_mark text, ADD COLUMN IF NOT EXISTS rite_progress smallint;';   // v35 (v25)
const rule = (name: string) => (e: { constraint?: string }) => e.constraint === name;
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('v8 no banco: Modo Administrador (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });
  const one = async (sql: string, p: unknown[] = []) => (await t.pool.query(sql, p)).rows[0];

  it('is_admin começa falso para todos; a migração (e o promote_victor.sql) ligam só a conta "Victor"', async () => {
    const victor = await t.createPlayer('Victor');
    const kaito = await t.createPlayer('kaito');
    assert.equal((await makeFindPlayer(t.db)(victor))!.isAdmin, false);
    await t.pool.query(V8);                                   // rodar de novo: sem erro, e agora o Victor existe
    await t.pool.query(readFileSync(new URL('../db/promote_victor.sql', import.meta.url), 'utf8'));
    assert.equal((await makeFindPlayer(t.db)(victor))!.isAdmin, true);
    assert.equal((await makeFindPlayer(t.db)(kaito))!.isAdmin, false);
  });

  it('só admin: as funções game.admin_* conferem is_admin no banco; quem não é admin é recusado', async () => {
    const admin = makeAdminStore(t.db);
    const kaito = await t.createPlayer('kaito2');
    const mei = await t.createPlayer('mei2');
    assert.deepEqual(await admin.setLevel(kaito, mei, 30), { ok: false, text: 'Comando restrito ao administrador.' });
    await assert.rejects(t.pool.query('SELECT game.admin_give_item($1, $2, $3, $4)', [kaito, mei, 'kunai', 5]), rule('rule_admin_only'));
    assert.equal((await one('SELECT level FROM game.players WHERE id = $1', [mei])).level, 1);
  });

  it('level: XP no começo do nível, pontos recalculados (atributos zerados se não cabem), sem rank nem histórico de rank; auditado', async () => {
    const admin = makeAdminStore(t.db);
    const adm = await t.createPlayer('adm_level');
    await t.pool.query('UPDATE game.players SET is_admin = true WHERE id = $1', [adm]);
    const alvo = await t.createPlayer('alvo_level');
    const ranksBefore = (await one('SELECT count(*)::int AS n FROM game.player_rank_changes WHERE player_id = $1', [alvo])).n;

    const up = await admin.setLevel(adm, alvo, 30);
    assert.ok(up.ok);
    assert.deepEqual([up.level, up.totalXp, up.statPoints], [30, levelStart(30), 29]);
    await makeProfile(t.db).spendPoint(alvo, 'vitality');
    const down = await admin.setLevel(adm, alvo, 1);
    assert.ok(down.ok && down.level === 1 && down.statPoints === 0 && down.attributes.vitality === 0, 'nível 1: pontos gastos voltam a zero');
    const row = await one('SELECT r.code FROM game.players p JOIN game.ranks r ON r.id = p.current_rank_id WHERE p.id = $1', [alvo]);
    assert.equal(row.code, 'ACADEMY', 'o rank não muda');
    assert.equal((await one('SELECT count(*)::int AS n FROM game.player_rank_changes WHERE player_id = $1', [alvo])).n, ranksBefore);
    assert.deepEqual(await admin.setLevel(adm, alvo, 61), { ok: false, text: 'O nível vai de 1 a 60.' });
    // Fora do comando de admin, o nível continua só vindo do XP.
    await assert.rejects(t.pool.query('UPDATE game.players SET level = 9 WHERE id = $1', [alvo]), rule('rule_level_from_xp'));
    const audit = (await t.pool.query(`SELECT command, ok, args FROM game.admin_audit_log WHERE admin_id = $1 ORDER BY id`, [adm])).rows;
    assert.deepEqual(audit.map((a) => [a.command, a.ok]), [['level', true], ['level', true], ['level', false]]);
    assert.deepEqual(audit[0].args, { level: 30 });
  });

  it('givejutsu (só sobe o uso), giveitem e resetstats; a auditoria não se edita nem se apaga', async () => {
    const admin = makeAdminStore(t.db);
    const adm = await t.createPlayer('adm_misc');
    await t.pool.query('UPDATE game.players SET is_admin = true WHERE id = $1', [adm]);
    const alvo = await t.createPlayer('alvo_misc');
    assert.deepEqual(await admin.giveJutsu(adm, alvo, 'fire_3', 3), { ok: true, uses: 500 });
    assert.deepEqual(await admin.giveJutsu(adm, alvo, 'fire_3', 1), { ok: true, uses: 500 }, 'nunca desce');
    assert.equal((await one(`SELECT level FROM game.player_jutsus WHERE player_id = $1 AND jutsu_code = 'fire_3'`, [alvo])).level, 3);
    assert.deepEqual(await admin.giveJutsu(adm, alvo, 'nao_existe', 1), { ok: false, text: 'Jogador, jutsu ou item inexistente.' });
    const items = await admin.giveItem(adm, alvo, 'katana', 2);
    assert.ok(items.ok && items.items.katana === 2);
    await makeProgression(t.db).grantXp(alvo, levelStart(5));
    await makeProfile(t.db).spendPoint(alvo, 'chakra');
    const reset = await admin.resetStats(adm, alvo);
    assert.ok(reset.ok && reset.attributes.chakra === 0 && reset.statPoints === 4);
    assert.equal((await one('SELECT ryo FROM game.players WHERE id = $1', [alvo])).ryo, '0', 'admin redefine de graça');
    await admin.log(adm, 'spawn', null, { monster: 'slime', qty: 3 }, true, null);
    await assert.rejects(t.pool.query('UPDATE game.admin_audit_log SET ok = false WHERE admin_id = $1', [adm]), rule('rule_append_only'));
    await assert.rejects(t.pool.query('DELETE FROM game.admin_audit_log WHERE admin_id = $1', [adm]), rule('rule_append_only'));
    const n = (await one('SELECT count(*)::int AS n FROM game.admin_audit_log WHERE admin_id = $1', [adm])).n;
    assert.equal(n, 6);
  });

  it('patente (v23): o admin sobe e desce qualquer um, ele mesmo incluso; ANBU existe; histórico e auditoria; quem não é admin é recusado', async () => {
    const admin = makeAdminStore(t.db);
    const adm = await t.createPlayer('adm_rank');
    await t.pool.query('UPDATE game.players SET is_admin = true WHERE id = $1', [adm]);
    const alvo = await t.createPlayer('alvo_rank');
    const rank = async (id: string) => (await one('SELECT r.code, r.name FROM game.players p JOIN game.ranks r ON r.id = p.current_rank_id WHERE p.id = $1', [id]));
    assert.deepEqual((await t.pool.query(`SELECT code, name, tier FROM game.ranks WHERE code = 'ANBU'`)).rows, [{ code: 'ANBU', name: 'ANBU', tier: 55 }], 'ANBU: entre o Jonin e o Kage');
    for (const [code, name] of [['JONIN', 'Jonin'], ['ANBU', 'ANBU'], ['HOKAGE', 'Kage'], ['CHUNIN', 'Chunin'], ['GENIN', 'Genin'], ['ACADEMY', 'Academia']] as const) {
      const r = await admin.setRank(adm, alvo, code);
      assert.ok(r.ok && r.rank.code === code && r.rank.name === name, code);
      assert.deepEqual(await rank(alvo), { code, name });
    }
    const self = await admin.setRank(adm, adm, 'HOKAGE');
    assert.ok(self.ok && self.canBeSensei === true, 'o admin muda a própria patente');
    assert.equal((await rank(adm)).code, 'HOKAGE');
    assert.equal((await one('SELECT count(*)::int AS n FROM game.player_rank_changes WHERE player_id = $1', [alvo])).n >= 6, true, 'o histórico de patentes foi gravado');
    // só as seis patentes; nível, classe e cargo de Kage não mudam
    await assert.rejects(t.pool.query(`SELECT * FROM game.admin_set_rank($1, $2, 'S_JONIN')`, [adm, alvo]), rule('rule_admin_rank'));
    assert.equal((await one('SELECT level FROM game.players WHERE id = $1', [alvo])).level, 1, 'o nível não mexe');
    assert.equal((await one('SELECT count(*)::int AS n FROM game.village_kages WHERE player_id = $1', [adm])).n, 0, 'patente Kage não vira o cargo de Kage da aldeia');
    // quem não é admin é recusado (e nada muda)
    const comum = await t.createPlayer('comum_rank');
    assert.deepEqual(await admin.setRank(comum, alvo, 'ANBU'), { ok: false, text: 'Comando restrito ao administrador.' });
    assert.equal((await rank(alvo)).code, 'ACADEMY');
    const audit = (await t.pool.query(`SELECT command, ok, args FROM game.admin_audit_log WHERE admin_id = $1 AND command = 'rank' ORDER BY id`, [adm])).rows;
    assert.equal(audit.length, 7);
    assert.deepEqual(audit[1].args, { rank: 'ANBU' });
  });

  it('Missão de Genin (v23): o admin que voltou à Academia refaz quantas vezes quiser (troca a classe, ganha o pergaminho); quem não é admin, uma vez só', async () => {
    const admin = makeAdminStore(t.db);
    const store = makeNinjaStore(t.db);
    const adm = await t.createPlayer('adm_genin');
    await t.pool.query('UPDATE game.players SET is_admin = true WHERE id = $1', [adm]);
    for (let s = 1; s <= 4; s++) await t.pool.query('SELECT game.advance_tutorial($1, $2)', [adm, s]);
    await makeProgression(t.db).grantXp(adm, levelStart(11));
    const first = await store.becomeGenin(adm, 'fire');
    assert.ok(first.ok && first.classes.primary === 'fire' && first.rank.code === 'GENIN');
    // ainda Genin: não repete (só a Academia faz a missão)
    assert.equal((await store.becomeGenin(adm, 'water')).ok, false);
    // volta à Academia pelo /admin patente: pode de novo, com outra classe; a Secundária é limpa
    await t.pool.query(`UPDATE game.player_classes SET secondary_class = 'water', secondary_at = now() WHERE player_id = $1`, [adm]);
    assert.ok((await admin.setRank(adm, adm, 'ACADEMY')).ok);
    const second = await store.becomeGenin(adm, 'water');
    assert.ok(second.ok && second.classes.primary === 'water' && second.classes.secondary === null && second.rank.code === 'GENIN');
    assert.equal(second.items.scroll_liso, 2, 'v24: um pergaminho só; o da primeira vez fica e soma o novo');
    // e de novo com a mesma classe: ganha mais um pergaminho
    assert.ok((await admin.setRank(adm, adm, 'ACADEMY')).ok);
    const third = await store.becomeGenin(adm, 'water');
    assert.ok(third.ok && third.items.scroll_liso === 3);
    // quem NÃO é admin: uma vez só (nada mudou)
    const comum = await t.createPlayer('comum_genin');
    for (let s = 1; s <= 4; s++) await t.pool.query('SELECT game.advance_tutorial($1, $2)', [comum, s]);
    await makeProgression(t.db).grantXp(comum, levelStart(11));
    assert.ok((await store.becomeGenin(comum, 'fire')).ok);
    await t.pool.query(`UPDATE game.players SET current_rank_id = (SELECT id FROM game.ranks WHERE code = 'ACADEMY') WHERE id = $1`, [comum]);
    assert.equal((await store.becomeGenin(comum, 'water')).ok, false, 'a classe Primária só se escolhe uma vez');
    assert.equal((await one('SELECT primary_class FROM game.player_classes WHERE player_id = $1', [comum])).primary_class, 'fire');
  });

  it('de ponta a ponta: o admin digita "/admin giveitem" no chat e o item chega ao banco e ao alvo online', async () => {
    const adm = await t.createPlayer('adm_e2e');
    await t.pool.query('UPDATE game.players SET is_admin = true WHERE id = $1', [adm]);
    const alvo = await t.createPlayer('alvo_e2e');
    const find = makeFindPlayer(t.db);
    const world = new GameWorld(REALTIME, Date.now, undefined, {
      random: seededRandom(), admin: makeAdminStore(t.db), chatLog: makeChatLog(t.db), store: makeNinjaStore(t.db),
    });
    const a = new FakeConn();
    const b = new FakeConn();
    const ha = world.join((await find(adm))!, a);
    world.join((await find(alvo))!, b);
    ha.receive(JSON.stringify({ type: 'chat', message: '/admin giveitem alvo_e2e tanto 1' }));
    for (let i = 0; i < 20 && !b.last('inventory'); i++) await new Promise((r) => setTimeout(r, 25));
    assert.equal(b.last('inventory').items.tanto, 1);
    assert.equal((await one(`SELECT quantity FROM game.player_items WHERE player_id = $1 AND item_code = 'tanto'`, [alvo])).quantity, 1);
    assert.equal((await one(`SELECT count(*)::int AS n FROM game.chat_logs WHERE sender_id = $1`, [adm])).n, 0, 'comando de admin não vira chat');
    world.close();
  });
});

describe('v8 no banco: atributos, redefinição, chat, missões e equipamento', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });
  const one = async (sql: string, p: unknown[] = []) => (await t.pool.query(sql, p)).rows[0];

  it('sem teto: 40 pontos no mesmo atributo; nunca negativo; pontos nunca inventados', async () => {
    const id = await t.createPlayer('tanque');
    await makeProgression(t.db).grantXp(id, levelStart(41));
    const profile = makeProfile(t.db);
    for (let i = 0; i < 40; i++) assert.equal((await profile.spendPoint(id, 'vitality')).ok, true);
    assert.equal((await one('SELECT attr_vitality FROM game.players WHERE id = $1', [id])).attr_vitality, 40);
    await assert.rejects(t.pool.query('UPDATE game.players SET attr_chakra = -1, stat_points = stat_points + 1 WHERE id = $1', [id]), rule('ck_players_attributes'));
    await assert.rejects(t.pool.query('UPDATE game.players SET attr_chakra = 3 WHERE id = $1', [id]), rule('ck_players_stat_points'));
  });

  it('redefinir: cobra o custo, devolve tudo; sem ryō ou sem pontos investidos: recusado e nada muda', async () => {
    const id = await t.createPlayer('redefine');
    const profile = makeProfile(t.db);
    assert.deepEqual(await profile.resetAttributes(id, 500), { ok: false, text: 'Você ainda não investiu nenhum ponto.' });
    await makeProgression(t.db).grantXp(id, levelStart(4), 300);
    await profile.spendPoint(id, 'agility');
    await profile.spendPoint(id, 'chakra');
    assert.deepEqual(await profile.resetAttributes(id, 500), { ok: false, text: 'Ryō insuficiente.' });
    assert.equal((await one('SELECT attr_agility FROM game.players WHERE id = $1', [id])).attr_agility, 1, 'recusa não mexe em nada');
    await t.pool.query('UPDATE game.players SET ryo = 650 WHERE id = $1', [id]);
    const r = await profile.resetAttributes(id, 500);
    assert.ok(r.ok);
    assert.deepEqual([r.ryo, r.statPoints, r.attributes.agility, r.attributes.chakra], [150, 3, 0, 0]);
    await assert.rejects(t.pool.query('SELECT game.reset_attributes($1, -10)', [id]), rule('rule_reset_cost'));
  });

  it('chat: global e sussurros do próprio + fala do mapa; 100 no máximo; retenção de 24 h', async () => {
    const log = makeChatLog(t.db);
    const a = await t.createPlayer('chat_a');
    const b = await t.createPlayer('chat_b');
    const c = await t.createPlayer('chat_c');
    await log.record({ channel: 'local', senderId: a, senderName: 'chat_a', map: 'map_1', message: 'na vila' });
    await log.record({ channel: 'local', senderId: a, senderName: 'chat_a', map: 'map_2', message: 'na floresta' });
    await log.record({ channel: 'global', senderId: a, senderName: 'chat_a', message: 'todo mundo' });
    await log.record({ channel: 'whisper', senderId: a, senderName: 'chat_a', recipientId: b, recipientName: 'chat_b', message: 'segredo' });
    assert.deepEqual((await log.history(b, 'map_1')).map((m) => [m.channel, m.message, m.to ?? null]),
      [['local', 'na vila', null], ['global', 'todo mundo', null], ['whisper', 'segredo', 'chat_b']]);
    assert.deepEqual((await log.history(c, 'map_2')).map((m) => m.message), ['na floresta', 'todo mundo'], 'sussurro alheio não aparece');
    for (let i = 0; i < 120; i++) await log.record({ channel: 'global', senderId: c, senderName: 'chat_c', message: `g${i}` });
    const h = await log.history(c, 'map_2');
    assert.equal(h.length, 100);
    assert.equal(h.at(-1)!.message, 'g119');
    await t.pool.query(`UPDATE game.chat_logs SET created_at = now() - interval '25 hours' WHERE sender_id IN ($1, $2)`, [a, c]);
    assert.equal((await log.history(b, 'map_1')).length, 0, 'mais de 24 h: fora do histórico');
    assert.equal(await log.purge(), 124, 'a limpeza apaga as 4 + 120 antigas');
    await assert.rejects(log.record({ channel: 'whisper', senderId: a, senderName: 'chat_a', message: 'sem destino' }), rule('ck_chat_logs_whisper'));
    await assert.rejects(log.record({ channel: 'global', senderId: a, senderName: 'chat_a', message: 'x'.repeat(201) }));
  });

  it('Sala de Missões: 3 cartões com recompensa do catálogo; o cartão escolhido vira a missão; "Entregar" sem missão não cria nada', async () => {
    const missions = makeMissions(t.db);
    const board = await missions.board();
    assert.deepEqual(board.map((o) => [o.code, o.difficulty, o.target.quantity, o.reward.xp, o.reward.title]), [
      ['NPC_EASY', 'Fácil', 3, 30, null], ['NPC_TRAINING', 'Normal', 5, 50, 'Discípulo do Mestre'], ['NPC_HARD', 'Difícil', 10, 150, null],
    ]);
    const id = await t.createPlayer('cartoes');
    assert.deepEqual(await missions.talk(id, null), { kind: 'none' });
    const got = await missions.talk(id, 'NPC_EASY');
    assert.ok(got.kind === 'assigned');
    assert.deepEqual([got.mission.target.quantity, got.mission.reward.xp], [3, 30]);
    const again = await missions.talk(id, 'NPC_HARD');
    assert.equal(again.kind, 'in_progress', 'uma missão por vez');
    for (let i = 0; i < 3; i++) await missions.recordKill(id, 'slime');
    const done = await missions.talk(id, null);
    assert.ok(done.kind === 'rewarded' && done.rewards[0]!.xp === 30);
    const senseiOptions = await missions.senseiOptions();
    assert.ok(!senseiOptions.some((d) => d.code.startsWith('NPC_')), 'os treinos do Mestre não aparecem para sensei jogador');
  });

  it('equipamento: espadas na Armaria; pergaminho nas costas só se tiver; gastou o último na Extração, sai das costas', async () => {
    const store = makeNinjaStore(t.db);
    const id = await t.createPlayer('mochileiro');
    assert.deepEqual(await store.equip(id, 'scroll_liso', 'scroll'), { ok: false, text: 'Só dá para levar nas costas um pergaminho do seu inventário.' });
    await t.pool.query(`INSERT INTO game.player_classes (player_id, primary_class) VALUES ($1, 'fire')`, [id]);
    await store.addItem(id, 'scroll_liso', 1);
    assert.deepEqual(await store.equip(id, 'scroll_liso', 'scroll'), { ok: true, equipped: 'scroll_liso' });
    assert.equal((await makeFindPlayer(t.db)(id))!.equippedScroll, 'scroll_liso');
    const r = await store.extract(id, 'fire', 1, 0.99, 0);                      // gasta o único pergaminho (v20: a 1ª é garantida)
    assert.ok(r.ok && r.outcome === 'success' && r.equippedScroll === null);
    assert.equal((await one('SELECT equipped_scroll FROM game.players WHERE id = $1', [id])).equipped_scroll, null);
    await t.pool.query('UPDATE game.players SET ryo = 5000 WHERE id = $1', [id]);
    assert.ok((await store.buy(id, 'katana', 1)).ok);
    assert.deepEqual(await store.equip(id, 'katana'), { ok: true, equipped: 'katana' });
  });
});

describe('v8 no banco: migração sobre quem já jogava (Chakra Máximo + Regen viram Chakra)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(MIGRATIONS.slice(0, MIGRATIONS.indexOf('schema_v8_admin_chat.sql'))); });
  after(async () => { await t?.drop(); });

  it('os pontos das duas colunas são somados (nada se perde) e rodar de novo não soma outra vez', async () => {
    const id = await t.createPlayer('veterano8');
    await makeProgression(t.db).grantXp(id, levelStart(8));
    await t.pool.query(`UPDATE game.players SET stat_points = stat_points - 5, attr_chakra_max = 2, attr_chakra_regen = 3 WHERE id = $1`, [id]);
    await t.pool.query(V8);
    await t.pool.query(V8);
    await t.pool.query(V12);                                              // findPlayer lê a coluna do sapato (v12)
    await t.pool.query(V14_V19);
    const found = await makeFindPlayer(t.db)(id);
    assert.equal(found!.attributes!.chakra, 5);
    assert.equal(found!.statPoints, 2);
    const cols = (await t.pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'game' AND table_name = 'players' AND column_name LIKE 'attr_chakra%'`)).rows;
    assert.deepEqual(cols.map((c) => c.column_name), ['attr_chakra']);
    await flush();
  });
});
