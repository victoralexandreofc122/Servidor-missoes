import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { EFFECT_CODES } from '../src/realtime/effects.js';
import { CLASSES, JUTSUS, JUTSU_BY_CODE, MASTERY, masteryOf, withMastery, type JutsuForm } from '../src/realtime/jutsus.js';
import { CLAN_TREE } from '../src/realtime/jutsusClasses.js';
import { VALE } from '../src/realtime/maps.js';
import { aimShapeOf } from '../src/realtime/protocol.js';
import { CC_BUDGET, SAFETY_NET } from '../src/realtime/pvpBalance.js';
import { NO_ATTRIBUTES } from '../src/realtime/stats.js';
import { FakeConn, placeIn, setupWorld } from './support/world.js';

/*
 * v45: auditoria dos 100 jutsus para o Teste Alpha de PvP. Cada jutsu é LANÇADO de verdade, na arena da vila (tabela do
 * PvP) contra outro ninja e na Floresta contra um monstro, no nível de uso 1 e no 4, e o mundo roda 20 s. O teste
 * confere: sai sem erro, cobra, entra em recarga, acerta quem está na frente, não passa do teto de controle nem da rede
 * de segurança, não deixa nada para trás (zona, aviso, projétil, muro, invocação, efeito) e não prende quem lança.
 */
const C = REALTIME.combat;
const ARENA = { x: 66, y: 47 };          // meio da arena da Chama Eterna
const FOREST = { x: 51, y: 10 };         // clareira da Floresta
const { aimPaths } = await import(new URL('../public/aim.js', import.meta.url).href);
const pub = (f: string) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');

function config(): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...C, monsters: { ...C.monsters, count: 0, stepMs: 1e12, attackDamage: 0 }, player: { ...C.player, hpRegenPerSec: 0 },
      // o monstro do teste não bate (senão interrompe os selos e esconde a cura)
      monsterTypes: { ...C.monsterTypes, lodo_sombrio: { ...C.monsterTypes.lodo_sombrio!, attackDamage: 0, attackRange: 0, stationary: true } },
    },
  };
}

interface Run {
  failed?: string; cost: number; cd: number; dmg: number; maxWin: number; maxHp: number; ccMs: number; longest: number;
  eff: Record<string, number>; status: Record<string, number>; selfStuck: number; heal: number; left: number; endEffects: string[];
  ground: { kind: string; r: number; ms: number }[]; casterMoved: number; freeAtEnd: boolean; barrier?: { hp: number; ms: number }; summon?: { hp: number; ms: number };
}

function launch(code: string, level: 1 | 4, pve = false): Run {
  const w = setupWorld(config());
  const world = w.world as any;
  world.skyEffectsAt = () => null;
  const join = (username: string) => {
    const conn = new FakeConn();
    const id = randomUUID();
    const h = w.world.join({ id, username, appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn);
    return { id, conn, send: (m: unknown) => h.receive(JSON.stringify(m)) };
  };
  const a = join('kaito'), b = join('mei');
  const j = JUTSU_BY_CODE.get(code)!;
  const cfg = withMastery(C.skills[code as 'fire'], code, level) as any;
  const dist = j.form === 'avanco' || j.form === 'investida' ? 2 : 1.3;
  const map = pve ? 'map_2' : 'map_1';
  const P = pve ? FOREST : ARENA;
  placeIn(w.world, a.id, map, P.x, P.y);
  placeIn(w.world, b.id, map, pve ? P.x + 30 : P.x + dist, pve ? P.y + 30 : P.y);
  const sa = world.sessions.get(a.id), sb = world.sessions.get(b.id);
  for (const s of [sa, sb]) {
    s.attributes = { ...NO_ATTRIBUTES, ninjutsu: 20, taijutsu: 20, weapons: 19 };
    s.level = 60;
    s.stats = world.statsFor(s.village, s.attributes, 60);
    Object.assign(s, { hp: s.stats.maxHp, chakra: s.stats.maxChakra, tutorial: 4 });
  }
  Object.assign(sa, { x: P.x, y: P.y, fx: 0, fy: 1, cooldowns: {} });        // olhando para BAIXO: o alvo está à direita
  sa.jutsus.set(code, level === 4 ? 2000 : 0);
  sa.kits[sa.activeKit] = [code];
  let mon: any;
  if (pve) {
    mon = world.monsters.get(world.spawnMonster({ x: P.x + dist, y: P.y }, undefined, map, 'lodo_sombrio').id);
    mon.hp = mon.maxHp = 100_000;
    mon.speed = 0;
  } else Object.assign(sb, { x: P.x + dist, y: P.y, fx: -1, fy: 0 });
  const tgt = pve ? mon : sb;
  if (cfg.needsRooted) tgt.rootedUntil = w.clock.now() + 1000;
  const heals = ['cura', 'palma', 'cura_tempo', 'limpeza'].includes(j.form) || !!cfg.zone?.heal;
  if (heals) sa.hp = Math.round(sa.stats.maxHp * 0.4);
  const hpA0 = sa.hp, hp0 = tgt.hp, ch0 = sa.chakra, pos0 = { x: sa.x, y: sa.y };
  a.conn.clear();
  b.conn.clear();
  a.send({ type: 'cast', skill: code, targetId: pve ? mon.id : b.id });
  let ccMs = 0, longest = 0, cur = 0, selfStuck = 0, last = tgt.hp, healed = Math.max(0, sa.hp - hpA0), lastA = sa.hp;
  const hits: [number, number][] = [];
  if (hp0 > tgt.hp) hits.push([w.clock.now(), hp0 - tgt.hp]);
  for (let x = 0; x < 20_000; x += 50) {
    w.clock.advance(50);
    world.tick();
    const t = w.clock.now();
    const hard = t < tgt.stunnedUntil || t < tgt.rootedUntil || (tgt.effects.get('sono')?.until ?? 0) > t || (tgt.effects.get('invertido')?.until ?? 0) > t;
    if (hard && !(cfg.needsRooted && x < 1000)) { ccMs += 50; cur += 50; longest = Math.max(longest, cur); } else cur = 0;
    if (tgt.hp < last) hits.push([t, last - tgt.hp]);
    last = tgt.hp;
    if (sa.hp > lastA) healed += sa.hp - lastA;
    lastA = sa.hp;
    if (sa.casting || t < sa.rootedUntil || t < sa.stunnedUntil) selfStuck += 50;
  }
  let maxWin = 0;
  for (const [t] of hits) maxWin = Math.max(maxWin, hits.filter(([u]) => u >= t && u < t + SAFETY_NET.windowMs).reduce((s, h) => s + h[1], 0));
  const id = pve ? mon.id : b.id;
  const eff: Record<string, number> = {}, status: Record<string, number> = {};
  for (const m of a.conn.of('effect')) if (m.id === id && m.ms > 0) eff[m.effect] = Math.max(eff[m.effect] ?? 0, m.ms);
  for (const m of [...a.conn.of('player_status'), ...a.conn.of('monster_status')]) if ((m.playerId ?? m.id) === id) status[m.status] = Math.max(status[m.status] ?? 0, m.ms);
  const cast = a.conn.last('cast');
  const casterMoved = Math.hypot(sa.x - pos0.x, sa.y - pos0.y);
  // no fim, quem lançou anda normalmente
  const before = { x: sa.x, y: sa.y };
  a.send({ type: 'move', dx: 0, dy: -1 });
  for (let x = 0; x < 400; x += 50) { w.clock.advance(50); world.tick(); }
  if (Math.hypot(sa.x - before.x, sa.y - before.y) <= 0.5) {          // parou na cerca da arena: tenta para o outro lado
    a.send({ type: 'move', dx: 0, dy: 1 });
    for (let x = 0; x < 400; x += 50) { w.clock.advance(50); world.tick(); }
  }
  const bar = a.conn.last('barrier'), sum = a.conn.last('summon');
  return {
    failed: a.conn.last('cast_failed')?.reason, cost: ch0 - sa.chakra, cd: cast?.cd ?? 0, dmg: hp0 - tgt.hp, maxWin, maxHp: tgt.stats?.maxHp ?? tgt.maxHp,
    ccMs, longest, eff, status, selfStuck, heal: healed, endEffects: [...tgt.effects.keys()],
    left: world.zones.length + world.strikes.length + world.projectiles.length + world.barriers.length + [...world.monsters.values()].filter((m: any) => m.ownerId).length,
    ground: a.conn.of('ground').map((g: any) => ({ kind: g.kind, r: g.r, ms: g.ms })), casterMoved,
    freeAtEnd: Math.hypot(sa.x - before.x, sa.y - before.y) > 0.5 && !sa.casting,
    ...(bar ? { barrier: { hp: bar.hp, ms: bar.ms } } : {}), ...(sum ? { summon: { hp: sum.hp, ms: sum.ms } } : {}),
  };
}

const ALL = JUTSUS.map((j) => j.code);
const cache = new Map<string, Run>();
const get = (code: string, level: 1 | 4, pve = false) => {
  const k = `${code}:${level}:${pve}`;
  if (!cache.has(k)) cache.set(k, launch(code, level, pve));
  return cache.get(k)!;
};
/** Jutsus que só acertam depois (o Umbra precisa atravessar o alvo) ou que não tiram vida de ninguém. */
const NO_DIRECT_DAMAGE = new Set(['umbra_forma', 'stone_resposta']);   // (o contra-ataque só bate quando apanha)

describe('v45: auditoria dos 100 jutsus (catálogo)', () => {
  it('100 jutsus; cada classe tem jutsu nos 4 tiers; as linhagens têm os 4 tiers; todos têm números e forma', () => {
    assert.equal(JUTSUS.length, 186);   // v49 (Fase 2.5): 100 + 74
    assert.equal(new Set(ALL).size, 186, 'nenhum código repetido');
    // Fase 2.5: toda classe tem pelo menos 4 jutsus em cada tier
    for (const c of CLASSES) for (const tier of [1, 2, 3, 4]) assert.ok(JUTSUS.filter((j) => j.class === c && j.tier === tier).length >= 4, `${c} tier ${tier}`);
    for (const c of CLASSES) {
      const mine = JUTSUS.filter((j) => j.class === c);
      for (const tier of [1, 2, 3, 4]) assert.ok(mine.some((j) => j.tier === tier), `${c} sem jutsu de tier ${tier}`);
      assert.ok(mine.length >= 8, `${c} com só ${mine.length} jutsus`);
    }
    for (const clan of ['rubro', 'umbra'] as const) {
      assert.deepEqual(CLAN_TREE[clan].map((code) => JUTSU_BY_CODE.get(code)!.tier), [1, 2, 3, 4], clan);
    }
    for (const j of JUTSUS) {
      const v = C.skills[j.code];
      assert.ok(v && v.cooldownMs > 0 && v.cost >= 0, j.code);
      assert.ok(j.name.length > 2 && j.form, j.code);
      if (j.tier > 0) assert.ok(MASTERY[j.code], `${j.code} sem regra de maestria`);
    }
  });
});

describe('v45: auditoria dos 100 jutsus (PvP, na arena)', () => {
  it('todos saem, cobram o chakra, entram em recarga e não deixam erro', () => {
    for (const code of ALL) for (const level of [1, 4] as const) {
      const r = get(code, level);
      assert.equal(r.failed, undefined, `${code} nível ${level}: ${r.failed}`);
      assert.ok(r.cd > 0, `${code}: sem recarga`);
      if (C.skills[code as 'fire'].cost > 0) assert.ok(r.cost > 0, `${code}: não cobrou chakra`);
    }
  });

  it('todo jutsu de dano acerta o ninja na frente (com o foco nele, mesmo olhando para outro lado)', () => {
    for (const j of JUTSUS) {
      if (!(C.skills[j.code].damage ?? 0) || NO_DIRECT_DAMAGE.has(j.code)) continue;
      assert.ok(get(j.code, 1).dmg > 0, `${j.code} (${j.form}) não acertou`);
    }
  });

  it('nenhum passa do teto de controle (2,5 s por golpe; 5 s em 15 s) nem da rede de segurança (50% da vida em 2 s)', () => {
    for (const code of ALL) for (const level of [1, 4] as const) {
      const r = get(code, level);
      assert.ok(r.longest <= CC_BUDGET.perApplyMs + 50, `${code} nível ${level}: prendeu ${r.longest} ms seguidos`);
      assert.ok(r.ccMs <= CC_BUDGET.maxMs + 100, `${code} nível ${level}: ${r.ccMs} ms de controle`);
      assert.ok(r.maxWin <= Math.floor(r.maxHp * SAFETY_NET.maxShare), `${code} nível ${level}: ${r.maxWin} de dano em 2 s (vida ${r.maxHp})`);
      assert.ok(r.dmg < r.maxHp * 0.5, `${code} nível ${level}: ${r.dmg} de dano num lançamento só`);
    }
  });

  it('nada fica para trás (zona, aviso, projétil, muro, invocação, efeito) e quem lança não fica preso', () => {
    for (const code of ALL) for (const level of [1, 4] as const) {
      const r = get(code, level);
      assert.equal(r.left, 0, `${code}: sobrou algo no campo depois de 20 s`);
      assert.deepEqual(r.endEffects, [], `${code}: efeito que não acaba`);
      assert.ok(r.freeAtEnd, `${code}: quem lançou não consegue andar no fim`);
      const v = C.skills[code as 'fire'];
      assert.ok(r.selfStuck <= (v.castMs ?? 0) + (v.selfRootMs ?? 0) + 150, `${code}: quem lançou ficou ${r.selfStuck} ms preso`);
    }
  });

  it('efeitos: cada um dura o que o jutsu diz (dentro do teto do PvP) e some sozinho', () => {
    const want: [string, string, 'eff' | 'status'][] = [
      ['burnMs', 'queimadura', 'eff'], ['paralysisMs', 'paralisia', 'eff'], ['silenceMs', 'silencio', 'eff'], ['slowMs', 'lentidao', 'eff'],
      ['woundMs', 'ferida', 'eff'], ['darkMs', 'escuridao', 'eff'], ['invertMs', 'invertido', 'eff'], ['dotMs', 'queimadura', 'eff'],
      ['rootMs', 'rooted', 'status'], ['stunMs', 'stunned', 'status'], ['liftMs', 'stunned', 'status'],
      ['sleepMs', 'sono', 'eff'],   // v49: Canção de Ninar
    ];
    let checked = 0;
    for (const j of JUTSUS) {
      if (j.form === 'buff_basico' || j.form === 'forma_sombra' || j.form === 'recuo' || j.form === 'marca') continue;   // o efeito vem no golpe seguinte
      for (const level of [1, 4] as const) {
        const cfg = withMastery(C.skills[j.code], j.code, level) as any;
        const r = get(j.code, level);
        for (const [key, name, where] of want) {
          const ms = cfg[key];
          if (!ms || (key === 'burnMs' && !cfg.burn) || (key === 'dotMs' && !cfg.dotAmount)) continue;
          const got = r[where][name];
          assert.ok(got, `${j.code}: ${name} não foi aplicado`);
          const cap = where === 'status' || name === 'invertido' || name === 'sono' ? Math.min(ms, CC_BUDGET.perApplyMs) : name === 'silencio' ? Math.min(ms, CC_BUDGET.perApplyMs * 2) : ms;
          assert.ok(Math.abs(got - cap) <= 60 || (name === 'silencio' && got >= cap), `${j.code} nível ${level}: ${name} durou ${got} ms, esperado ${cap}`);
          checked++;
        }
        if (cfg.wet) assert.equal(r.eff.molhado, 4000, `${j.code}: molhado`);
      }
    }
    assert.ok(checked > 60, `só ${checked} efeitos conferidos`);
    for (const e of EFFECT_CODES) assert.ok(typeof e === 'string');
  });
});

describe('v45: auditoria dos 100 jutsus (maestria, níveis 1 e 4)', () => {
  it('cada ganho da tabela aparece NO JOGO: dano, efeito, cura, alcance, recarga, duração e proteção', () => {
    for (const j of JUTSUS) {
      if (j.tier === 0) continue;
      const v1 = C.skills[j.code] as any;
      for (const gain of masteryOf(j.code)) {
        const pvp1 = get(j.code, 1), pvp4 = get(j.code, 4), pve1 = get(j.code, 1, true), pve4 = get(j.code, 4, true);
        const tag = `${j.code}: ${gain}`;
        if (gain === 'recarga' && j.form === 'retorno') {
          // dois toques: o 1º toque mostra só a janela de volta; a recarga de verdade (com a maestria) começa na volta
          assert.ok(withMastery(v1, j.code, 4).cooldownMs < v1.cooldownMs, tag);
        } else if (gain === 'recarga') {
          assert.ok(Math.abs(pvp4.cd / pvp1.cd - 0.85) < 0.005, `${tag}: recarga ${pvp1.cd} -> ${pvp4.cd}`);
        } else if (gain === 'dano' && !NO_DIRECT_DAMAGE.has(j.code)) {
          assert.ok(pve4.dmg >= pve1.dmg * 1.22 || pve4.dmg >= Math.round((pve1.dmg - 0.5) * 1.3 - 0.5), `${tag} (monstro): ${pve1.dmg} -> ${pve4.dmg}`);   // (dano pequeno: o arredondamento come 1)
          assert.ok(pvp4.dmg > pvp1.dmg, `${tag} (PvP): ${pvp1.dmg} -> ${pvp4.dmg}`);
          assert.ok(pvp4.dmg <= Math.ceil(pvp1.dmg * 1.3) + 1, `${tag} (PvP): cresceu demais, ${pvp1.dmg} -> ${pvp4.dmg}`);
        } else if (gain === 'cura') {
          assert.ok(pve4.heal > pve1.heal, `${tag}: ${pve1.heal} -> ${pve4.heal}`);
        } else if (gain === 'efeito') {
          const longer = (a: Run, b: Run) => Object.keys({ ...b.eff, ...b.status }).some((k) => (b.eff[k] ?? b.status[k] ?? 0) > (a.eff[k] ?? a.status[k] ?? 0) * 1.2);
          const ownEffect = ['stunMs', 'rootMs', 'silenceMs', 'paralysisMs', 'burnMs', 'slowMs', 'darkMs', 'invertMs', 'woundMs', 'dotMs', 'liftMs'].some((k) => v1[k]) || v1.zone?.firstRootMs || v1.zone?.endStunMs;
          if (ownEffect && j.form !== 'buff_basico') assert.ok(longer(pve1, pve4) || longer(pvp1, pvp4), `${tag}: nada durou mais no nível 4`);
        } else if (gain === 'duracao') {
          const a = withMastery(v1, j.code, 1), b = withMastery(v1, j.code, 4);
          assert.ok((b.durationMs ?? 0) > (a.durationMs ?? 0) || (b.zone?.ms ?? 0) > (a.zone?.ms ?? 0), tag);
          if (v1.zone) assert.ok(Math.max(...pvp4.ground.map((g) => g.ms)) > Math.max(...pvp1.ground.map((g) => g.ms)) * 1.25, `${tag}: a zona não durou mais`);
          if (pvp1.summon) assert.ok(pvp4.summon!.ms > pvp1.summon.ms * 1.25, `${tag}: a invocação não durou mais`);
        } else if (gain === 'protecao') {
          if (pvp1.barrier) assert.ok(pvp4.barrier!.hp > pvp1.barrier.hp * 1.25, `${tag}: muro ${pvp1.barrier.hp} -> ${pvp4.barrier!.hp}`);
          if (pvp1.summon) assert.ok(pvp4.summon!.hp > pvp1.summon.hp * 1.25, `${tag}: invocação`);
        } else if (gain === 'alcance') {
          const a = withMastery(v1, j.code, 1), b = withMastery(v1, j.code, 4);
          assert.ok(Math.abs((b.range ?? 0) / (a.range ?? 1) - 1.15) < 0.01, tag);
          if (j.form === 'recuo') assert.ok(pvp4.casterMoved > pvp1.casterMoved * 1.09, `${tag}: andou ${pvp1.casterMoved} -> ${pvp4.casterMoved}`);
        }
      }
    }
  });
});

describe('v45: mira e prévia', () => {
  const AIMED: Partial<Record<JutsuForm, 'line' | 'cone' | 'area'>> = {
    linha: 'line', linha_prende: 'line', linha_raio: 'line', linha_explode: 'line', linha_fogo: undefined, projetil: 'line', trilhas: 'line', leque: 'line',
    ricochete: 'line', agarre: 'line', faixa: 'line', investida: 'line', avanco: 'line', bumerangue: 'line', muro: 'line', recuo: 'line',
    cone: 'cone', cone_golpe: 'cone', impacto: 'area', aviso: 'area',
  };
  it('toda forma que sai numa direção tem mira (linha, cone ou área); as travadas no alvo e as de si mesmo, não', () => {
    for (const j of JUTSUS) {
      const shape = aimShapeOf(j.form, C.skills[j.code]);
      if (j.form in AIMED && AIMED[j.form]) assert.equal(shape, AIMED[j.form], j.code);
      if (['alvo', 'marca', 'escudo', 'cura', 'anel', 'anel_golpe', 'buff_basico', 'limpeza', 'cura_tempo', 'palma', 'escudo_vida', 'transformacao', 'invocacao', 'forma_sombra', 'contra', 'reflexo', 'retorno'].includes(j.form)) {
        assert.equal(shape, undefined, `${j.code} não devia ter mira`);
      }
      if (j.form === 'zona') assert.equal(shape, C.skills[j.code].zone?.self || !C.skills[j.code].range ? undefined : 'area', j.code);
    }
  });

  it('mirando (arrastar o botão): o jutsu sai na direção escolhida, não na do alvo mais perto', () => {
    // o alvo está à direita; mirando para a ESQUERDA nenhum jutsu de linha, cone ou área lançada pode acertá-lo
    for (const j of JUTSUS) {
      const shape = aimShapeOf(j.form, C.skills[j.code]);
      if (!shape || j.form === 'muro' || j.form === 'recuo' || !(C.skills[j.code].damage ?? 0)) continue;
      const w = setupWorld(config());
      const world = w.world as any;
      world.skyEffectsAt = () => null;
      const mk = (u: string) => { const conn = new FakeConn(); const id = randomUUID(); const h = w.world.join({ id, username: u, appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn); return { id, conn, send: (m: unknown) => h.receive(JSON.stringify(m)), s: world.sessions.get(id) }; };
      const a = mk('kaito'), b = mk('mei');
      placeIn(w.world, a.id, 'map_1', ARENA.x, ARENA.y);
      placeIn(w.world, b.id, 'map_1', ARENA.x + 2.2, ARENA.y);
      Object.assign(a.s, { x: ARENA.x, y: ARENA.y, fx: 1, fy: 0, chakra: 500, tutorial: 4, cooldowns: {} });
      Object.assign(b.s, { x: ARENA.x + 2.2, y: ARENA.y, tutorial: 4 });
      a.s.jutsus.set(j.code, 0);
      a.s.kits[a.s.activeKit] = [j.code];
      const hp = b.s.hp;
      a.send({ type: 'cast', skill: j.code, targetId: b.id, dir: [-1, 0] });
      w.run(6000);
      assert.equal(a.conn.last('cast_failed'), undefined, j.code);
      const cast = a.conn.last('cast');
      assert.ok(cast.fx < -0.9, `${j.code}: saiu para ${cast.fx},${cast.fy}`);
      // (o que cai em volta de quem lança ou volta, como o bumerangue, pode alcançar; o resto não)
      if (!['bumerangue'].includes(j.form) && (C.skills[j.code].radius ?? 0) < 2 && j.form !== 'cone_golpe' && j.form !== 'cone') assert.equal(b.s.hp, hp, `${j.code}: acertou quem estava atrás`);
    }
  });

  it('prévia do leque abre em ângulo (como o servidor) e a do resto continua em trilhas; o cliente manda o foco em todo jutsu', () => {
    const me = { x: 10, y: 10 };
    const fan = aimPaths(me, [1, 0], { range: 6, shots: 3, fan: 0.22 }, [], [], 40, 40);
    assert.equal(fan.paths.length, 3);
    assert.ok(Math.abs(fan.paths[0].to.y - 10) < 1e-6, 'o do meio vai reto');
    const ys = fan.paths.slice(1).map((p: any) => Math.round((p.to.y - 10) * 100) / 100).sort();
    assert.deepEqual(ys, [-Math.round(Math.sin(0.22) * 600) / 100, Math.round(Math.sin(0.22) * 600) / 100]);
    for (const p of fan.paths) assert.deepEqual(p.from, me, 'todos saem do ninja');
    const lanes = aimPaths(me, [1, 0], { range: 4, shots: 3, laneGap: 0.7 }, [], [], 40, 40);
    assert.deepEqual(lanes.paths.map((p: any) => p.from.y), [10, 9.3, 10.7]);
    const js = pub('game.js');
    assert.match(js, /const targetId = state\.focusId \|\| undefined;/);
    assert.match(js, /case 'cooldowns_reset':/);
  });

  it('cliente: toda forma tem desenho próprio no lançamento ou vem do chão/projétil (nenhuma cai no desenho errado da classe)', () => {
    const js = pub('game.js');
    const start = js.indexOf("case 'cast': {"), end = js.indexOf("case 'projectile': {");
    const block = js.slice(start, end);
    const own = ['cone_fogo', 'linha_fogo', 'cone_golpe', 'linha', 'ricochete', 'agarre', 'faixa', 'anel_golpe', 'impacto', 'alvo', 'marca', 'escudo_vida', 'transformacao',
      'forma_sombra', 'contra', 'reflexo', 'retorno', 'muro', 'invocacao', 'zona', 'aviso', 'recuo', 'limpeza', 'cura_tempo', 'projetil', 'investida', 'buff_basico', 'leque', 'palma'];
    for (const f of own) assert.ok(block.includes(`'${f}'`), `forma ${f} sem desenho no cliente`);
    // as que sobram usam o desenho da mecânica de propósito (tier 1 de cada classe) ou o chão / o projétil
    const byMechanic = new Set<JutsuForm>(['linha_explode', 'cone', 'avanco', 'anel', 'linha_prende', 'escudo', 'cura', 'trilhas', 'linha_raio', 'teleporte', 'substituicao',
      'aviso_em_volta', 'nuvem_detona', 'meteoros', 'bumerangue']);
    for (const j of JUTSUS) assert.ok(own.includes(j.form) || byMechanic.has(j.form), `${j.code}: forma ${j.form} sem desenho`);
  });
});

describe('v45: duelo (rankeado e Torneio): campo limpo e recargas zeradas a cada rodada', () => {
  it('armadilha, invocação, muro, aviso e projétil da rodada anterior somem; a recarga volta a zero e o cliente é avisado', () => {
    const w = setupWorld(config());
    const world = w.world as any;
    world.skyEffectsAt = () => null;
    const mk = (u: string) => { const conn = new FakeConn(); const id = randomUUID(); const h = w.world.join({ id, username: u, appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn); return { id, conn, send: (m: unknown) => h.receive(JSON.stringify(m)), s: world.sessions.get(id) }; };
    const a = mk('kaito'), b = mk('mei');
    for (const p of [a, b]) { p.s.tutorial = 4; p.s.level = 20; p.send({ type: 'ranked', action: 'enter' }); p.send({ type: 'ranked', action: 'queue' }); }
    w.run(200);
    assert.equal(world.duels.get('vale_estatuas')?.phase, 'prep');
    const kit = ['shadow_armadilha', 'stone_golem', 'stone_muralha', 'rubro_completo'];
    for (const k of kit) a.s.jutsus.set(k, 0);
    a.s.kits[a.s.activeKit] = kit;
    a.s.chakra = 1000;
    // na preparação: deixa a armadilha, o Golem, o muro e o Colosso no campo
    for (const k of kit) { a.send({ type: 'cast', skill: k }); w.run(1400); }
    assert.ok(world.zones.length + world.strikes.length > 0 && world.barriers.length > 0, 'ficaram no campo durante a preparação');
    assert.ok([...world.monsters.values()].some((m: any) => m.ownerId === a.id));
    a.conn.clear();
    w.run(10_000);                                   // a rodada começa
    assert.equal(world.duels.get('vale_estatuas').phase, 'round');
    assert.equal(world.zones.length + world.strikes.length + world.barriers.length + world.projectiles.length, 0, 'campo limpo no começo da rodada');
    assert.equal([...world.monsters.values()].filter((m: any) => m.ownerId).length, 0);
    assert.deepEqual(a.s.cooldowns, {}, 'recargas zeradas');
    assert.ok(a.conn.of('cooldowns_reset').length >= 1);
    assert.deepEqual([a.s.x, a.s.y], [VALE.start.a.x, VALE.start.a.y]);
    // na rodada: armadilha de novo; a rodada acaba; no intervalo e na rodada 2 ela não está mais lá
    a.s.chakra = 1000;
    a.send({ type: 'cast', skill: 'shadow_armadilha' });
    w.run(100);
    assert.equal(world.zones.length, 1);
    world.duelRoundOver(world.duels.get('vale_estatuas'), 'a', w.clock.now());
    assert.equal(world.zones.length, 0, 'o campo fica limpo já no intervalo');
    w.run(5200);
    assert.equal(world.duels.get('vale_estatuas').phase, 'round');
    assert.equal(world.duels.get('vale_estatuas').round, 2);
    const hp = b.s.hp;
    w.run(3000);
    assert.equal(b.s.hp, hp, 'nada da rodada 1 acerta na rodada 2');
    assert.equal(b.s.rootedUntil, 0);
  });

  it('quem assiste da arquibancada não lança nada no campo', () => {
    const w = setupWorld(config());
    const world = w.world as any;
    const conn = new FakeConn();
    const id = randomUUID();
    const h = w.world.join({ id, username: 'plateia', appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn);
    const s = world.sessions.get(id);
    s.tutorial = 4;
    h.receive(JSON.stringify({ type: 'ranked', action: 'enter' }));
    for (const k of ['stone_muralha', 'water_nevoa', 'fire']) {
      s.jutsus.set(k, 0);
      s.kits[s.activeKit] = [k];
      s.chakra = 100;
      conn.clear();
      h.receive(JSON.stringify({ type: 'cast', skill: k }));
      assert.equal(conn.last('cast_failed')?.reason, 'SAFE_ZONE', k);
    }
    assert.equal(world.barriers.length + world.zones.length + world.projectiles.length, 0);
  });
});
