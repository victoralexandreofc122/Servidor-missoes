import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { GameWorld, RITE } from '../src/realtime/gameWorld.js';
import { ACADEMY } from '../src/realtime/maps.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { makeProgression } from '../src/realtime/progression.js';
import { levelStart } from '../src/realtime/stats.js';
import { createTestDatabase } from './support/testDb.js';
import { FakeConn, placeIn, seededRandom } from './support/world.js';

/*
 * v35: o Rito do Despertar de ponta a ponta, com o banco de verdade (todas as migrações até a v25):
 * marcar no Criador -> falar com o Diretor -> derrotar 10 Lodos Escuros em combate -> sair e voltar no meio (o progresso
 * fica salvo) -> voltar ao Diretor -> despertar (linhagem e jutsu do tier 1 no banco). Ninguém pode ficar travado no 11.
 */
const noDatabase = !process.env.TEST_DATABASE_URL;

function config(): RealtimeConfig {
  return {
    ...REALTIME,
    combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, perPlayer: 0, attackDamage: 0 } },
  };
}

describe('Rito do Despertar de ponta a ponta (banco)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });
  const one = async (sql: string, p: unknown[] = []) => (await t.pool.query(sql, p)).rows[0];
  /** Espera a fila de gravação do jogador esvaziar (uma gravação a cada 250 ms de relógio de verdade). */
  let current: GameWorld | undefined;
  const settle = async () => {
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 20));
      const busy = [...((current as any)?.sessions.values() ?? [])].some((s: any) => s.profileBusy || s.profileQueue.length > 0);
      if (!busy) return;
    }
    throw new Error('a fila de gravação não esvaziou');
  };

  /** Genin de nível `level` com a classe Sombra, pronto para o Rito (tutorial feito). */
  async function genin(name: string, level: number) {
    const id = await t.createPlayer(name);
    for (let s = 1; s <= 4; s++) await t.pool.query('SELECT game.advance_tutorial($1, $2)', [id, s]);
    await makeProgression(t.db).grantXp(id, levelStart(level));
    assert.ok((await makeNinjaStore(t.db).becomeGenin(id, 'shadow')).ok);
    return id;
  }

  function world() {
    let now = 5_000_000;
    const cfg = config();
    const w = new GameWorld(cfg, () => now, undefined, {
      random: seededRandom(), store: makeNinjaStore(t.db), progression: makeProgression(t.db),
    });
    const run = (ms: number) => { for (let x = 0; x < ms; x += cfg.tickMs) { now += cfg.tickMs; w.tick(); } };
    current = w;
    return { w, run };
  }

  async function enter(w: GameWorld, id: string) {
    const conn = new FakeConn();
    const handle = w.join((await makeFindPlayer(t.db)(id))!, conn);
    const send = (m: unknown) => handle.receive(JSON.stringify(m));
    const s = (w as any).sessions.get(id);
    return { conn, send, s, handle };
  }

  const toDirector = (w: GameWorld, id: string) => placeIn(w, id, 'academy_interior', ACADEMY.director.x, ACADEMY.director.y + 2);

  /** Derrota `n` Lodos Escuros na Floresta no soco (ataque básico de verdade, com o tick do jogo). */
  function hunt(w: GameWorld, run: (ms: number) => void, p: Awaited<ReturnType<typeof enter>>, n: number, type: string = RITE.monster) {
    placeIn(w, p.s.id, 'map_2', 70, 40);              // a beira do rio: onde os Lodos Escuros nascem
    for (let i = 0; i < n; i++) {
      const m = (w as any).monsters.get((w as any).spawnMonster({ x: p.s.x + 1, y: p.s.y }, undefined, 'map_2', type).id);
      m.hp = 1;
      m.speed = 0;
      Object.assign(p.s, { fx: 1, fy: 0, cooldowns: {}, attackReadyAt: 0 });
      p.send({ type: 'attack', targetId: m.id });
      run(600);
      assert.ok(!(w as any).monsters.has(m.id) || m.hp <= 0, `o ${type} ${i + 1} caiu`);
    }
  }

  it('marca -> Diretor -> 10 Lodos Escuros (saindo e voltando no meio) -> desperta, tudo salvo no banco', async () => {
    const id = await genin('rito_e2e', 11);
    let { w, run } = world();
    let p = await enter(w, id);

    // 1. Marca no Criador (só marca; não desperta).
    p.send({ type: 'clan', clan: 'umbra' });
    await settle();
    assert.equal(p.conn.last('clan_mark').clan, 'umbra');
    assert.deepEqual(await one('SELECT clan, clan_mark FROM game.players WHERE id = $1', [id]), { clan: null, clan_mark: 'umbra' });

    // 2. O Diretor passa o Rito.
    toDirector(w, id);
    p.send({ type: 'talk', npcId: 'director' });
    await settle();
    assert.match(p.conn.last('npc_say').text, /Rito do Despertar \(Clã Umbra\): derrote 10 Lodos Escuros/);
    assert.deepEqual(p.conn.last('rite'), { type: 'rite', progress: 0, count: 10 });

    // 3. Caça: 4 Lodos Escuros; um Slime não conta.
    hunt(w, run, p, 4);
    hunt(w, run, p, 1, 'slime');
    await settle();
    assert.equal(p.s.riteProgress, 4);
    assert.equal((await one('SELECT rite_progress FROM game.players WHERE id = $1', [id])).rite_progress, 4);

    // 4. Sai do jogo e volta (servidor novo): o progresso continua.
    w.close();
    ({ w, run } = world());
    p = await enter(w, id);
    assert.equal(p.s.riteProgress, 4);
    assert.equal(p.s.clanMark, 'umbra');
    hunt(w, run, p, 6);
    await settle();
    assert.equal(p.s.riteProgress, 10);
    assert.match(p.conn.of('notice').map((n: any) => n.text).join(' | '), /10\/10! Volte ao Diretor/);

    // 5. Mais Lodos depois de completar não passam de 10.
    hunt(w, run, p, 1);
    assert.equal(p.s.riteProgress, 10);

    // 6. Volta ao Diretor: desperta.
    toDirector(w, id);
    p.send({ type: 'talk', npcId: 'director' });
    await settle();
    assert.equal(p.s.clan, 'umbra');
    assert.equal(p.s.riteProgress, null);
    assert.ok(p.s.jutsus.has('umbra_deslize'), 'o jutsu do tier 1 chega no despertar');
    assert.ok(!p.s.jutsus.has('umbra_faminta'), 'o tier 2 só no nível 20');
    const row = await one('SELECT clan, clan_mark, rite_progress FROM game.players WHERE id = $1', [id]);
    assert.deepEqual(row, { clan: 'umbra', clan_mark: 'umbra', rite_progress: null });
    assert.equal((await one(`SELECT count(*)::int AS n FROM game.player_jutsus WHERE player_id = $1 AND jutsu_code = 'umbra_deslize'`, [id])).n, 1);

    // 7. Depois de desperto: o Diretor não fala mais do Rito e a linhagem não muda.
    p.send({ type: 'clan', clan: 'rubro' });
    await settle();
    assert.equal((await one('SELECT clan FROM game.players WHERE id = $1', [id])).clan, 'umbra');
    const before = p.conn.of('npc_say').length;
    p.send({ type: 'talk', npcId: 'director' });
    for (const m of p.conn.of('npc_say').slice(before)) assert.doesNotMatch(m.text, /Rito/);

    // 8. Entrar de novo: a linhagem e o jutsu continuam.
    w.close();
    ({ w, run } = world());
    p = await enter(w, id);
    assert.equal(p.s.clan, 'umbra');
    assert.ok(p.s.jutsus.has('umbra_deslize'));
    w.close();
  });

  it('ninguém trava: sem marca o Diretor explica; quem passou do 11 sem fazer o Rito faz igual e recebe os tiers do nível', async () => {
    const id = await genin('rito_tarde', 25);
    const { w, run } = world();
    const p = await enter(w, id);
    toDirector(w, id);
    p.send({ type: 'talk', npcId: 'director' });
    assert.match(p.conn.last('npc_say').text, /Criador de Personagem/, 'sem marca: diz onde marcar');
    assert.equal(p.s.riteProgress, null);

    p.send({ type: 'clan', clan: 'rubro' });
    await settle();
    run(2000);                                         // o jogador abre o Criador, marca e volta a falar
    p.send({ type: 'talk', npcId: 'director' });
    await settle();
    assert.equal(p.s.riteProgress, 0, JSON.stringify({ mark: p.s.clanMark, map: p.s.map, rank: p.s.rank, level: p.s.level, say: p.conn.of('npc_say').map((m: any) => m.text), err: p.conn.of('error'), notice: p.conn.of('notice').map((m: any) => m.text) }));
    hunt(w, run, p, 10);
    await settle();
    assert.equal(p.s.riteProgress, 10);
    toDirector(w, id);
    p.send({ type: 'talk', npcId: 'director' });
    await settle();
    assert.equal(p.s.clan, 'rubro', p.conn.of('npc_say').map((m: any) => m.text).join(' | '));
    assert.ok(p.s.jutsus.has('rubro_olho') && p.s.jutsus.has('rubro_transe'), 'nível 25: tiers 1 e 2 de uma vez');
    assert.ok(!p.s.jutsus.has('rubro_chamas'));
    w.close();
  });

  it('fila de gravação cheia (combate intenso) no despertar: a linhagem e o jutsu chegam ao banco mesmo assim', async () => {
    const id = await genin('rito_fila', 11);
    const { w, run } = world();
    const p = await enter(w, id);
    p.send({ type: 'clan', clan: 'rubro' });
    await settle();
    toDirector(w, id);
    p.send({ type: 'talk', npcId: 'director' });
    await settle();
    hunt(w, run, p, 10);
    await settle();
    toDirector(w, id);
    run(2000);
    // 5 gravações lentas na fila (o limite): antes da v36, o despertar seria descartado com PROFILE_BUSY
    for (let i = 0; i < 5; i++) (w as any).queueTask(p.s, () => new Promise((r) => setTimeout(r, 5)));
    p.send({ type: 'talk', npcId: 'director' });
    await settle();
    assert.equal(p.conn.of('error').filter((e: any) => e.code === 'PROFILE_BUSY').length, 0);
    assert.deepEqual(await one('SELECT clan, rite_progress FROM game.players WHERE id = $1', [id]), { clan: 'rubro', rite_progress: null });
    assert.equal((await one(`SELECT count(*)::int AS n FROM game.player_jutsus WHERE player_id = $1 AND jutsu_code = 'rubro_olho'`, [id])).n, 1);
    w.close();
  });

  it('se o banco recusar o despertar, ninguém perde o Rito: volta a "não desperto" e basta falar com o Diretor de novo', async () => {
    const id = await genin('rito_falha', 11);
    const { w, run } = world();
    const p = await enter(w, id);
    p.send({ type: 'clan', clan: 'umbra' });
    await settle();
    toDirector(w, id);
    p.send({ type: 'talk', npcId: 'director' });
    await settle();
    hunt(w, run, p, 10);
    await settle();
    const store = (w as any).store;
    const real = store.chooseClan;
    store.chooseClan = () => Promise.reject(new Error('banco fora do ar'));
    (w as any).log = { warn() {}, info() {}, error() {} };
    toDirector(w, id);
    run(2000);
    p.send({ type: 'talk', npcId: 'director' });
    await settle();
    assert.equal(p.s.clan, null, 'não ficou meio desperto');
    assert.equal(p.s.riteProgress, 10, 'o Rito completo continua');
    assert.equal((await one('SELECT rite_progress FROM game.players WHERE id = $1', [id])).rite_progress, 10);
    store.chooseClan = real;
    run(2000);
    p.send({ type: 'talk', npcId: 'director' });
    await settle();
    assert.equal(p.s.clan, 'umbra');
    assert.equal((await one('SELECT clan FROM game.players WHERE id = $1', [id])).clan, 'umbra');
    w.close();
  });

  it('deploy no meio do Rito: o desligamento espera a fila de gravação e o progresso não se perde', async () => {
    const id = await genin('rito_deploy', 11);
    const { w, run } = world();
    const p = await enter(w, id);
    p.send({ type: 'clan', clan: 'rubro' });
    await settle();
    toDirector(w, id);
    p.send({ type: 'talk', npcId: 'director' });
    await settle();
    hunt(w, run, p, 3);                                 // 3 gravações na fila, uma a cada 250 ms
    await w.flushAll();                                 // o que o servidor faz ao receber SIGTERM
    assert.equal((await one('SELECT rite_progress FROM game.players WHERE id = $1', [id])).rite_progress, 3);
    w.close();
  });

  it('a Caverna do Lodo também conta (o Lodo Escuro nasce lá) e o Lodo Sombrio não', async () => {
    const id = await genin('rito_caverna', 11);
    const { w, run } = world();
    const p = await enter(w, id);
    p.send({ type: 'clan', clan: 'andarilho' });
    await settle();
    toDirector(w, id);
    p.send({ type: 'talk', npcId: 'director' });
    await settle();
    hunt(w, run, p, 2, 'lodo_sombrio');
    assert.equal(p.s.riteProgress, 0);
    placeIn(w, id, 'caverna_lodo', 28, 30);
    const m = (w as any).monsters.get((w as any).spawnMonster({ x: p.s.x + 1, y: p.s.y }, undefined, 'caverna_lodo', 'lodo_escuro').id);
    m.hp = 1;
    m.speed = 0;
    Object.assign(p.s, { fx: 1, fy: 0, cooldowns: {}, attackReadyAt: 0 });
    p.send({ type: 'attack', targetId: m.id });
    run(600);
    assert.equal(p.s.riteProgress, 1);
    w.close();
  });
});
