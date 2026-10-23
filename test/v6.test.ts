import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { DEFAULT_APPEARANCE, dirOf } from '../src/realtime/gameWorld.js';
import { makeFindPlayer } from '../src/realtime/findPlayer.js';
import { makeProfile, type Profile } from '../src/realtime/profile.js';
import { NO_ATTRIBUTES, scaledDamage } from '../src/realtime/stats.js';
import { createTestDatabase } from './support/testDb.js';
import { setupWorld } from './support/world.js';

const S = REALTIME.spawn;
const M = REALTIME.combat.monsters;
const SK = REALTIME.combat.skills;
const config: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...M, count: 0, stepMs: 1e12 } } };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const monsterHp = (world: any, id: string) => world.monsterList().find((m: any) => m.id === id)?.hp;
// v9: o visual são nomes de paleta (appearance.ts); o formato antigo de 5 cores é testado em v9.test.ts.
const LOOK = {
  v: 2, gender: 'f', skin: 'canela', hairStyle: 'longo_lateral', hairColor: 'preto', eyeStyle: 'cilios', eyeColor: 'verde',
  outfit: 'vila', shirtColor: 'azul_marinho', pantsColor: 'cinza', bandana: true, village: 'vila_2',
} as const;

class Conn {
  sent: any[] = [];
  bufferedAmount = 0;
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() {}
  last(type: string) { return this.sent.filter((m) => m.type === type).at(-1); }
}

describe('v6: dano por tipo (Taijutsu x Ninjutsu)', () => {
  it('soco (habilidade Taijutsu 👊) escala com Taijutsu; Fogo e Água com Ninjutsu', () => {
    const { world, run } = setupWorld(config);
    const join = (id: string, attrs: Partial<typeof NO_ATTRIBUTES>) => {
      const c = new Conn();
      const h = world.join({ id, username: id, attributes: { ...NO_ATTRIBUTES, ...attrs } }, c);
      return (msg: unknown) => h.receive(JSON.stringify(msg));
    };
    const tai = join('tai', { taijutsu: 4 });       // +18,7% corpo a corpo (4 pontos com soft cap)
    const nin = join('nin', { ninjutsu: 4 });       // +18,7% elemental
    const hit = (who: (m: unknown) => void, skill: string) => {
      const m = world.spawnMonster({ x: S.x + 1, y: S.y });
      who({ type: 'cast', skill, targetId: m.id });   // a Água mira no alvo
      run(300);                                       // o Fogo é um projétil: o dano chega quando ele bate
      const hp = monsterHp(world, m.id);
      (world as any).monsters.delete(m.id);
      return M.maxHp - hp;
    };
    assert.equal(hit(tai, 'taijutsu'), scaledDamage(SK.taijutsu.damage!, 1.187), 'soco: 35 -> 42 com Taijutsu');
    assert.equal(hit(nin, 'taijutsu'), SK.taijutsu.damage, 'Ninjutsu NÃO sobe o soco');
    assert.equal(hit(nin, 'fire'), scaledDamage(SK.fire.damage!, 1.187), 'Fogo: 25 -> 30 com Ninjutsu');
    assert.equal(hit(tai, 'fire'), SK.fire.damage, 'Taijutsu NÃO sobe o Fogo');
    assert.equal(hit(nin, 'water'), scaledDamage(SK.water.damage!, 1.187), 'Água também é Ninjutsu');
  });
});

describe('v6: Agilidade também acelera o Ataque Básico', () => {
  it('recarga 600 ms -> 4% a menos por ponto efetivo (5 pontos com soft cap: 490 ms), nunca abaixo de 60%', () => {
    const { world, clock } = setupWorld(config);
    const c = new Conn();
    const h = world.join({ id: 'agil', username: 'agil', attributes: { ...NO_ATTRIBUTES, agility: 5 } }, c);
    assert.equal(c.sent[0].progress.derived.attackCooldownMs, 490);
    world.spawnMonster({ x: S.x + 1, y: S.y });
    h.receive(JSON.stringify({ type: 'attack' }));
    clock.advance(490);
    h.receive(JSON.stringify({ type: 'attack' }));
    assert.equal(c.sent.filter((m) => m.type === 'attack').length, 2, 'com 490 ms já ataca de novo');
    clock.advance(489);
    h.receive(JSON.stringify({ type: 'attack' }));
    assert.equal(c.last('attack_failed').reason, 'COOLDOWN');
    const max = new Conn();
    world.join({ id: 'max', username: 'max', attributes: { ...NO_ATTRIBUTES, agility: 20 } }, max);
    assert.equal(max.sent[0].progress.derived.attackCooldownMs, 360, '20 pontos: no piso de 60% de 600');
  });
});

describe('v6: visual do personagem e direção', () => {
  function fakeProfile() {
    const saved: unknown[] = [];
    const profile: Profile = {
      async spendPoint() { return { ok: false, reason: 'NO_POINTS' }; },
      async saveLoadout() {},
      async saveAppearance(_id, a) { saved.push(a); },
      async resetAttributes() { return { ok: false, text: 'sem banco' }; },
    };
    return { profile, saved };
  }

  it('sem visual salvo: appearanceSet false (o cliente abre o Criador) e os outros veem o padrão', () => {
    const { connect } = setupWorld(config);
    const a = connect('kaito');
    const b = connect('mei');
    assert.equal(a.conn.last('welcome').you.appearanceSet, false);
    assert.deepEqual(b.conn.last('welcome').players[0].appearance, DEFAULT_APPEARANCE);
  });

  it('set_appearance: grava, e todos recebem o boneco novo; nome fora da paleta ou chave extra: recusado', async () => {
    const { profile, saved } = fakeProfile();
    const { connect, clock } = setupWorld(config, undefined, undefined, profile);
    const a = connect('kaito');
    const b = connect('mei');
    a.send({ type: 'set_appearance', appearance: LOOK });
    await flush();
    assert.deepEqual(saved, [LOOK]);
    assert.deepEqual(b.conn.last('player_appearance'), { type: 'player_appearance', playerId: a.id, appearance: LOOK });
    assert.deepEqual(a.conn.last('player_appearance').appearance, LOOK, 'o dono recebe a confirmação');
    clock.advance(1000);
    for (const bad of [{ ...LOOK, skin: 'red' }, { ...LOOK, hat: 'bandana' }, { skin: 'claro' }, { ...LOOK, village: 'url(javascript:1)' },
      { ...LOOK, bandana: 'sim' }, { ...LOOK, v: 3 }, { ...LOOK, hairColor: '#000000' }]) {
      a.send({ type: 'set_appearance', appearance: bad });
      assert.equal(a.conn.last('error').code, 'INVALID_MESSAGE', JSON.stringify(bad));
    }
    const c = connect('rin');
    assert.deepEqual(c.conn.last('welcome').players.find((p: any) => p.id === a.id).appearance, LOOK, 'quem chega depois vê o visual');
  });

  it('fila de gravações: "+" e "Salvar kits" em seguida, os dois são gravados (nada é descartado)', async () => {
    const calls: string[] = [];
    const profile: Profile = {
      async spendPoint() { calls.push('ponto'); return { ok: true, statPoints: 0, attributes: { ...NO_ATTRIBUTES, vitality: 1 } }; },
      async saveLoadout() { calls.push('kits'); },
      async saveAppearance() { calls.push('visual'); },
      async resetAttributes() { return { ok: false, text: 'sem banco' }; },
    };
    const { world, connect } = setupWorld(config, undefined, undefined, profile);
    const a = connect('kaito');
    (world as any).sessions.get(a.id).statPoints = 1;
    a.send({ type: 'spend_point', attribute: 'vitality' });
    a.send({ type: 'set_loadout', kitA: ['fire'], kitB: [] });
    a.send({ type: 'set_appearance', appearance: LOOK });
    await new Promise((r) => setTimeout(r, 700));     // 1 gravação a cada 250 ms
    assert.deepEqual(calls, ['ponto', 'kits', 'visual'], 'na ordem, todos');
    for (let i = 0; i < 8; i++) a.send({ type: 'set_loadout', kitA: ['fire'], kitB: [] });
    assert.equal(a.conn.last('error').code, 'PROFILE_BUSY', 'acima de 5 na fila: recusa');
  });

  it('direção do boneco: vai junto em player_moved (0 baixo, 1 esquerda, 2 direita, 3 cima)', () => {
    assert.deepEqual([dirOf(0, 1), dirOf(-1, 0), dirOf(1, 0), dirOf(0, -1), dirOf(0.7, 0.71)], [0, 1, 2, 3, 0]);
    const { connect, run } = setupWorld(config);
    const a = connect('kaito');
    const b = connect('mei');
    a.send({ type: 'move', dx: -1, dy: 0 });
    run(100);
    assert.equal(b.conn.last('player_moved').d, 1);
    a.send({ type: 'move', dx: 0, dy: -1 });
    run(100);
    assert.equal(b.conn.last('player_moved').d, 3);
  });
});

const noDatabase = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';

describe('v6 no banco: visual e script do Hokage (PostgreSQL real)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  before(async () => { t = await createTestDatabase(); });
  after(async () => { await t?.drop(); });

  it('appearance: NULL até criar; salva e volta ao conectar; o banco recusa formato errado', async () => {
    const id = await t.createPlayer('kaito');
    const find = makeFindPlayer(t.db);
    assert.equal((await find(id))!.appearance, null);
    await makeProfile(t.db).saveAppearance(id, LOOK);
    assert.deepEqual((await find(id))!.appearance, LOOK);
    for (const bad of [{ ...LOOK, skin: 'Red!' }, { ...LOOK, extra: 'x' }, { skin: 'claro' }, { ...LOOK, bandana: 'sim' },
      { ...LOOK, gender: 'x' }, { ...LOOK, v: 3 }, [1], 'texto']) {
      await assert.rejects(
        t.pool.query('UPDATE game.players SET appearance = $2::jsonb WHERE id = $1', [id, JSON.stringify(bad)]),
        (e: { constraint?: string }) => e.constraint === 'ck_players_appearance',
        JSON.stringify(bad),
      );
    }
  });

  it('promote_victor.sql: cria HOKAGE acima de todos, promove "Victor" (com histórico) e pode rodar de novo', async () => {
    const id = await t.createPlayer('Victor', 'GENIN');
    const sql = readFileSync(new URL('../db/promote_victor.sql', import.meta.url), 'utf8');
    await t.pool.query(sql);
    await t.pool.query(sql);
    const row = (await t.pool.query(
      `SELECT r.code, r.can_be_sensei, r.tier = (SELECT max(tier) FROM game.ranks) AS top
         FROM game.players p JOIN game.ranks r ON r.id = p.current_rank_id WHERE p.id = $1`, [id])).rows[0];
    assert.deepEqual(row, { code: 'HOKAGE', can_be_sensei: true, top: true });
    const hokages = (await t.pool.query(`SELECT count(*)::int AS n FROM game.ranks WHERE code = 'HOKAGE'`)).rows[0].n;
    assert.equal(hokages, 1);
    const history = (await t.pool.query(
      `SELECT r.code FROM game.player_rank_changes c JOIN game.ranks r ON r.id = c.rank_id WHERE c.player_id = $1 ORDER BY c.changed_at, c.id`, [id])).rows;
    assert.deepEqual(history.map((h) => h.code), ['GENIN', 'HOKAGE']);
    assert.equal((await makeFindPlayer(t.db)(id))!.canBeSensei, true);
  });
});
