import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { JUTSUS } from '../src/realtime/jutsus.js';
import { CLANS, CLAN_NOVOS_CODES, CLAN_PASSIVE, CLAN_TREE, clanJutsusFor } from '../src/realtime/jutsusClasses.js';
import { RELICS } from '../src/realtime/loot.js';
import { blocked } from '../src/realtime/movement.js';
import { placeIn, setupWorld } from './support/world.js';

/*
 * v63 (Fase 3, Etapa 4; migração v38): os 4 clãs novos com as escolhas do Victor (15/11/2026):
 *   Bastião 1A 2A 3A 4C · Áspide 1B 2A 3B 4B · Garra 1A 2A 3C 4A · Zéfiro 1A 2B 3A 4B; relíquias: todas da opção A.
 */
const SK = REALTIME.combat.skills;
const FOREST = REALTIME.maps.map_2;
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

function config(): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat, damageScale: { jutsu: 1, basic: 1 },
      monsters: { ...REALTIME.combat.monsters, count: 0, attackDamage: 0 },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
    },
  };
}

function openRow(len: number): { x: number; y: number } {
  const free = (x: number, y: number) => [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3].every((d) => !blocked(x, y + d, FOREST.walls));
  for (let y = 22; y < 90; y += 1) for (let x = 8; x < 90 - len; x += 1) {
    let ok = true;
    for (let k = -6; k <= len && ok; k += 0.25) ok = free(x + k, y);
    if (ok) return { x, y };
  }
  throw new Error('sem trecho livre');
}

/** Ninja na Floresta olhando para a direita, do clã dado, com o jutsu no kit; monstros parados nas posições. */
function scene(skill: string, clan: string | null, monsters: [number, number][] = []) {
  const w = setupWorld(config());
  const world: any = w.world;
  const a = w.connect('kaito');
  const row = openRow(10);
  placeIn(world, a.id, 'map_2', row.x, row.y);
  const s = world.sessions.get(a.id);
  Object.assign(s, { fx: 1, fy: 0, chakra: 1000, cooldowns: {}, tutorial: 4, clan });
  s.jutsus.set(skill, 0);
  s.kits[s.activeKit] = [skill];
  const ms = monsters.map(([dx, dy]) => {
    const mm = world.monsters.get(world.spawnMonster({ x: row.x + dx, y: row.y + dy }, undefined, 'map_2', 'lodo_sombrio').id);
    mm.hp = mm.maxHp = 100_000;
    mm.speed = 0;
    return mm;
  });
  const cast = (extra: Record<string, unknown> = {}) => { a.send({ type: 'cast', skill, ...extra }); w.run((SK[skill as 'fire']?.castMs ?? 0) + 60); };
  const ally = (name: string, dx: number) => {
    const b = w.connect(name);
    placeIn(world, b.id, 'map_2', row.x + dx, row.y);
    const sb = world.sessions.get(b.id);
    Object.assign(sb, { tutorial: 4, x: row.x + dx, y: row.y });
    return { ...b, s: sb };
  };
  const me = () => ({ kind: 'player', id: s.id, x: s.x, y: s.y, session: s });
  const mon = (m: any) => ({ kind: 'monster', id: m.id, x: m.x, y: m.y, monster: m });
  return { ...w, world, a, s, ms, m: ms[0], row, cast, ally, me, mon, t: () => w.clock.now() };
}

describe('v63: os 4 clãs novos (catálogo)', () => {
  it('7 linhagens; cada clã novo tem 4 jutsus próprios (tiers 1 a 4, sem classe) com os nomes escolhidos', () => {
    assert.deepEqual([...CLANS], ['rubro', 'umbra', 'andarilho', 'bastiao', 'aspide', 'garra', 'zefiro']);
    const names = (clan: string) => CLAN_TREE[clan as 'garra'].map((c) => JUTSUS.find((j) => j.code === c)!.name);
    assert.deepEqual(names('bastiao'), ['Muralha Interior', 'Guarda Compartilhada', 'Muro que Responde', 'Juramento do Escudo']);
    assert.deepEqual(names('aspide'), ['Cuspe da Áspide', 'Névoa Tóxica', 'Constrição', 'Ninho de Áspides']);
    assert.deepEqual(names('garra'), ['Chamado da Matilha', 'Uivo de Comando', 'Troca Instintiva', 'Rei da Matilha']);
    assert.deepEqual(names('zefiro'), ['Passo do Vento', 'Véu de Ar', 'Eco do Vento', 'Mil Passos']);
    for (const code of CLAN_NOVOS_CODES) {
      const j = JUTSUS.find((x) => x.code === code)!;
      assert.equal(j.class, null, code);
      assert.ok(j.clan && CLAN_TREE[j.clan].includes(code), code);
    }
    assert.deepEqual(clanJutsusFor('zefiro', 11), ['zefiro_passo']);
    assert.deepEqual(clanJutsusFor('garra', 40), ['garra_matilha', 'garra_uivo', 'garra_troca']);
    assert.equal(clanJutsusFor('aspide', 60).length, 4);
  });

  it('marca no Criador e desperta no Rito do Despertar como o Rubro e o Umbra', () => {
    const { world, a, s } = scene('garra_matilha', null);
    Object.assign(s, { rank: { code: 'GENIN', name: 'Genin' }, level: 11, jutsus: new Map() });
    a.send({ type: 'clan', clan: 'garra' });
    assert.equal(s.clanMark, 'garra');
    assert.equal(s.clan, null);
    world.riteTalk(s, () => {});
    for (let i = 0; i < 10; i += 1) world.riteKill(s, 'lodo_escuro');
    world.riteTalk(s, () => {});
    assert.equal(s.clan, 'garra');
    assert.ok(s.jutsus.has('garra_matilha') && !s.jutsus.has('garra_uivo'));
    assert.match(a.conn.of('notice').map((n: any) => n.text).join(' '), /Clã Garra/);
  });
});

describe('v63: Clã Bastião', () => {
  it('passiva: controle em você dura 15% menos; o escudo dura 2 s a mais', () => {
    const { world, s, me, cast, t } = scene('bastiao_muralha', 'bastiao');
    assert.equal(world.fase3Cc(me(), 1000, undefined, t()), 850);
    s.clan = null;
    assert.equal(world.fase3Cc(me(), 1000, undefined, t()), 1000);
    s.clan = 'bastiao';
    const t0 = t();
    cast();
    assert.ok(s.absorb && s.absorb.hp >= 40);
    assert.equal(s.absorb.until - t0, 4000 + CLAN_PASSIVE.bastiao.shieldMs);
  });

  it('Muralha Interior: quem bate de perto leva 20% do golpe de volta; de longe, não', () => {
    const { world, s, ms, cast, t } = scene('bastiao_muralha', 'bastiao', [[1, 0], [4, 0]]);
    cast();
    s.absorb = undefined;
    world.damagePlayer(s, 50, t(), ms[0]);
    world.damagePlayer(s, 50, t(), ms[1]);
    const back = 100_000 - ms[0].hp;   // 20% de 50 = 10, com o que o dano em monstro soma (o mesmo de qualquer golpe dele)
    assert.ok(back >= 10 && back <= 15, `devolveu ${back}`);
    assert.equal(100_000 - ms[1].hp, 0);
  });

  it('Guarda Compartilhada: escudo em você e no aliado mirado', () => {
    const { s, cast, ally } = scene('bastiao_guarda', 'bastiao');
    const b = ally('mei', 3);
    cast({ targetId: b.id });
    assert.ok(s.absorb?.hp >= 35);
    assert.ok(b.s.absorb?.hp >= 35);
    assert.equal(b.s.absorb.until, s.absorb.until);
  });

  it('Muro que Responde: por 2 s, quem te acerta é empurrado e fica lento', () => {
    const { world, s, m, cast, t, run } = scene('bastiao_resposta', 'bastiao', [[1, 0]]);
    cast();
    const x0 = m.x;
    world.damagePlayer(s, 10, t(), m);
    assert.ok(m.x - x0 >= 1.5, `empurrou ${m.x - x0}`);
    assert.ok(m.effects.get('lentidao')?.until > t());
    run(2100);
    const x1 = m.x;
    world.damagePlayer(s, 10, t(), m);
    assert.equal(m.x, x1, 'acabou a resposta');
  });

  it('Juramento do Escudo: -50% de dano em você; metade do dano do aliado perto vem para você', () => {
    const { world, s, m, cast, ally, t } = scene('bastiao_juramento', 'bastiao', [[8, 0]]);
    const b = ally('mei', 3);
    cast();
    const [ha, hb] = [s.hp, b.s.hp];
    world.damagePlayer(b.s, 40, t(), m);
    assert.equal(hb - b.s.hp, 20, 'o aliado leva metade');
    assert.equal(ha - s.hp, 10, 'o Bastião leva a outra metade, com a redução de 50%');
    world.damagePlayer(s, 40, t(), m);
    assert.equal(ha - s.hp, 30);
  });
});

describe('v63: Clã Áspide', () => {
  it('passiva: o veneno novo pulsa já no 1º segundo e corta 30% da cura de quem está envenenado', () => {
    const { world, s, m, mon, ally, t } = scene('aspide_cuspe', 'aspide', [[3, 0]]);
    world.poisonOn(mon(m), s, 3, 3, 6000, t());
    const e = m.effects.get('veneno');
    assert.equal(e.nextTickAt, t());
    assert.equal(e.healCut, CLAN_PASSIVE.aspide.healCut);
    const b = ally('mei', 2);
    b.s.hp = 10;
    world.poisonOn({ kind: 'player', id: b.id, x: b.s.x, y: b.s.y, session: b.s }, s, 1, 1, 6000, t());
    assert.equal(world.healPlayer(b.s, 100, t()), 70);
    s.clan = null;
    const other = world.monsters.get(world.spawnMonster({ x: m.x, y: m.y + 2 }, undefined, 'map_2', 'lodo_sombrio').id);
    world.poisonOn(mon(other), s, 3, 3, 6000, t());
    assert.ok(other.effects.get('veneno').nextTickAt > t());
    assert.equal(other.effects.get('veneno').healCut, undefined);
  });

  it('Cuspe da Áspide: projétil que envenena e deixa lento', () => {
    const { m, cast, run } = scene('aspide_cuspe', 'aspide', [[3, 0]]);
    cast();
    run(500);
    assert.ok(m.effects.has('veneno') && m.effects.has('lentidao'));
  });

  it('Névoa Tóxica: zona de veneno onde mira; quem fica ganha cargas', () => {
    const { world, m, cast, run } = scene('aspide_nevoa', 'aspide', [[3, 0]]);
    cast();
    assert.equal(world.zones.at(-1).kind, 'veneno');
    run(2100);
    assert.ok((m.effects.get('veneno')?.stacks ?? 0) >= 2);
  });

  it('Constrição: prende e envenena forte', () => {
    const { m, cast, t } = scene('aspide_constricao', 'aspide', [[3, 0]]);
    cast();
    assert.ok(m.rootedUntil > t());
    assert.ok(m.effects.get('veneno')?.amount >= 6);
  });

  it('Ninho de Áspides: 3 serpentes que mordem e envenenam', () => {
    const { world, s, m, cast, run } = scene('aspide_ninho', 'aspide', [[2, 0]]);
    cast();
    const snakes = [...world.monsters.values()].filter((x: any) => x.ownerId === s.id);
    assert.equal(snakes.length, 3);
    assert.ok(snakes.every((x: any) => x.type === 'serpente_aspide' && x.punch?.poison));
    run(3000);
    assert.ok(m.effects.has('veneno'));
    assert.ok(m.hp < 100_000);
  });
});

describe('v63: Clã Garra', () => {
  it('passiva: invocações com +30% de vida e o mestre 10% mais rápido', () => {
    const { world, s, cast } = scene('garra_matilha', 'garra');
    const base = world.speedOf({ ...s, clan: null });
    assert.ok(Math.abs(world.speedOf(s) - base * 1.1) < 0.02);
    cast();
    const fera = [...world.monsters.values()].find((x: any) => x.ownerId === s.id);
    assert.equal(fera.type, 'fera_garra');
    assert.equal(fera.maxHp, Math.round(s.stats.maxHp * 0.12 * 1.3));
  });

  it('Uivo de Comando: atordoa o alvo e as invocações saltam nele', () => {
    const { world, s, m, cast, t, a, w } = scene('garra_matilha', 'garra', [[6, 0]]) as any;
    cast();
    s.jutsus.set('garra_uivo', 0);
    s.kits[s.activeKit] = ['garra_uivo'];
    a.send({ type: 'cast', skill: 'garra_uivo', targetId: m.id });
    w?.run?.(60);
    const fera = [...world.monsters.values()].find((x: any) => x.ownerId === s.id);
    assert.ok(m.stunnedUntil > t() - 60);
    assert.ok(Math.hypot(fera.x - m.x, fera.y - m.y) < 1.3, 'a fera saltou no alvo');
    assert.ok(m.hp < 100_000);
  });

  it('Troca Instintiva: sem invocação não sai; com ela, trocam de lugar', () => {
    const { world, s, a, row, cast } = scene('garra_troca', 'garra');
    cast();
    assert.equal(a.conn.last('cast_failed')?.reason, 'NO_SUMMON');
    const m = world.monsters.get(world.spawnMonster({ x: row.x + 5, y: row.y }, undefined, 'map_2', 'fera_garra', true).id);
    Object.assign(m, { ownerId: s.id, summonUntil: Number.MAX_SAFE_INTEGER });
    s.cooldowns = {};
    const was = { x: s.x, y: s.y };
    cast();
    assert.ok(s.x - was.x > 4, `foi para ${s.x}`);           // (a fera já andou um pouco para perto do dono)
    assert.ok(Math.abs(m.x - was.x) < 0.8, `a fera foi para ${m.x}`);   // (e já volta andando para perto do dono)
  });

  it('Rei da Matilha: a fera grande com 40% da vida (+30% do Garra)', () => {
    const { world, s, cast } = scene('garra_rei', 'garra');
    cast();
    const rei = [...world.monsters.values()].find((x: any) => x.ownerId === s.id);
    assert.equal(rei.type, 'fera_rei');
    assert.equal(rei.maxHp, Math.round(s.stats.maxHp * 0.4 * 1.3));
  });
});

describe('v63: Clã Zéfiro', () => {
  it('Passo do Vento: avança 3 casas e esquiva tudo por 0,5 s; a mobilidade recarrega 15% mais rápido', () => {
    const { world, s, m, cast, a, t, row } = scene('zefiro_passo', 'zefiro', [[8, 0]]);
    cast();
    assert.ok(s.x - row.x > 2.5);
    assert.equal(a.conn.last('cast').cd, Math.round(7000 * CLAN_PASSIVE.zefiro.mobilityCd));
    const hp = s.hp;
    world.damagePlayer(s, 50, t(), m);
    assert.equal(s.hp, hp);
    assert.equal(a.conn.last('clan_fx').kind, 'esquiva');
  });

  it('esquiva natural (5%) e o Véu de Ar (+25%): só golpe direto; veneno e queimadura não', () => {
    const { world, s, m, cast, t } = scene('zefiro_veu', 'zefiro', [[8, 0]]);
    world.random = () => 0.04;
    let hp = s.hp;
    world.damagePlayer(s, 20, t(), m);
    assert.equal(s.hp, hp, '5% do clã');
    world.random = () => 0.2;
    world.damagePlayer(s, 20, t(), m);
    assert.ok(s.hp < hp);
    cast();
    hp = s.hp;
    world.damagePlayer(s, 20, t(), m);
    assert.equal(s.hp, hp, 'com o Véu: 30%');
    world.damagePlayer(s, 20, t(), undefined, undefined, 'efeito:veneno');
    assert.ok(s.hp < hp, 'o veneno não se esquiva');
  });

  it('Eco do Vento: volta para onde estava 3 s atrás', () => {
    const { s, row, cast, run } = scene('zefiro_eco', 'zefiro');
    run(1000);
    Object.assign(s, { x: row.x + 5 });
    run(2500);
    cast();
    assert.ok(Math.abs(s.x - row.x) < 0.3, `voltou para ${s.x} (começo ${row.x})`);
  });

  it('Mil Passos: golpeia até 5 inimigos em volta e termina ao lado do último', () => {
    const { ms, cast, s } = scene('zefiro_mil', 'zefiro', [[2, 0], [-2, 0], [0, 2], [3, 1], [9, 0]]);
    cast();
    assert.equal(ms.slice(0, 4).filter((m: any) => m.hp < 100_000).length, 4);
    assert.equal(ms[4].hp, 100_000, 'longe demais');
    assert.ok(s.evadeUntil > 0);
  });
});

describe('v63: migração v38, relíquias e cliente', () => {
  it('a v38 roda no Neon (sem DO, dentro de BEGIN/COMMIT), aceita os clãs e tem os 16 jutsus e os 202 códigos no kit', () => {
    const sql = read('db/schema_v38_clas_novos.sql');
    assert.doesNotMatch(sql, /DO \$\$/);
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^COMMIT;/m);
    for (const c of ['bastiao', 'aspide', 'garra', 'zefiro']) assert.ok((sql.match(new RegExp(`'${c}'`, 'g')) ?? []).length >= 7, c);
    for (const j of JUTSUS) assert.ok(sql.includes(`'${j.code}'`), j.code);
    for (const code of CLAN_NOVOS_CODES) assert.match(sql, new RegExp(`\\('${code}', '${JUTSUS.find((j) => j.code === code)!.name}', NULL, '\\w+', \\d\\)`));
    // as migrações antigas não podem desfazer: as listas de clãs e dos kits também têm os novos
    assert.match(read('db/schema_v19_clas.sql'), /'zefiro'/);
    assert.match(read('db/schema_v25_linhagem.sql'), /'zefiro'/);
    for (const v of ['v16_jutsus_fogo', 'v18_jutsus_classes', 'v20_extracao', 'v25_linhagem', 'v30_fase25', 'v31_mecanicas']) assert.match(read(`db/schema_${v}.sql`), /'zefiro_mil'/, v);
  });

  it('relíquias com os nomes da opção A, iguais no jogo, na v37 e na v38', () => {
    assert.deepEqual(RELICS.map((r) => r.name), ['Amuleto do Fôlego', 'Amuleto da Corrente', 'Amuleto do Punho', 'Selo da Firmeza', 'Selo da Couraça',
      'Selo do Vigor', 'Presa Rubra', 'Último Fôlego', 'Fluxo Sereno', 'Coração da Fênix Cinza', 'Punho da Chama Antiga']);
    for (const r of RELICS) {
      assert.ok(read('db/schema_v37_mundo_loot.sql').includes(`('${r.code}', '${r.name}', 'relic')`), r.code);
      assert.ok(read('db/schema_v38_clas_novos.sql').includes(`('${r.code}', '${r.name}')`), r.code);
    }
  });

  it('cliente: os 7 no Criador, as feras e serpentes desenhadas, os efeitos dos clãs e a Névoa Tóxica no chão', () => {
    const js = read('public/game.js');
    assert.match(js, /const LINEAGE_ORDER = \['rubro', 'umbra', 'bastiao', 'aspide', 'garra', 'zefiro', 'andarilho'\];/);
    assert.match(js, /kind === 'serpente_aspide'/);
    assert.match(js, /kind === 'fera_garra' \|\| kind === 'fera_rei'/);
    assert.match(js, /case 'clan_fx':/);
    assert.match(js, /veneno: \['rgba/);
    assert.match(js, /if \(sk\.clan\) return sk\.clan === clan;/);
    assert.match(read('public/adminPanel.js'), /zefiro: 'Clã Zéfiro'/);
  });
});
