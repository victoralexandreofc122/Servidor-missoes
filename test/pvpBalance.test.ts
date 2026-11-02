import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { BASE_SKILLS } from '../src/realtime/jutsus.js';
import { PVP_BALANCE_VERSION, PVP_SHIELD, ccAllow, safetyNet, ccUsed, pvpBurnPerTick, pvpCostCooldown, pvpHeal, pvpHitDamage, type CcEntry, type CcKind, type HitInfo } from '../src/realtime/pvpBalance.js';
import { NO_ATTRIBUTES, derivedStats, type Attributes } from '../src/realtime/stats.js';
import { simulateAll } from '../src/realtime/pvpSim.js';
import { FakeConn, placeIn, setupWorld } from './support/world.js';

/*
 * Passo 1d do plano do duelo: tabela de equilíbrio do PvP (pvpBalance.ts). Os números da coluna "contra jogador" do
 * plano (nível 60, tier 4, nível de uso 4, 59 pontos no atributo) e o uso dela no jogo, na arena das vilas.
 */

const C = REALTIME.combat;
const SCALE = C.damageScale;
const base = {
  maxHp: C.player.maxHp, maxChakra: C.player.maxChakra, meditationChakraPerSec: 15,
  walkSpeed: 0, runSpeed: 0, attackCooldownMs: C.basicAttack.cooldownMs,
};
const stats = (a: Partial<Attributes>) => derivedStats(base, C.attributes, { ...NO_ATTRIBUTES, ...a }, 60);
const hit = (mechanic: keyof typeof BASE_SKILLS, extra: Partial<HitInfo> = {}): HitInfo => ({
  base: BASE_SKILLS[mechanic].damage ?? 0, tier: 4, useLevel: 4, weapon: 0, scaling: BASE_SKILLS[mechanic].scaling ?? 'ninjutsu',
  passive: 1, sky: 1, ...(BASE_SKILLS[mechanic].burn ? { burn: { base: BASE_SKILLS[mechanic].burn!, ms: 3000 } } : {}), ...extra,
});

describe('pvpBalance: números do plano (nível 60, tier 4, nível de uso 4, 59 pontos)', () => {
  it('dano contra jogador: Fogo 40 + 15, Água 32, Relâmpago 48, Soco 56, Kunai com Espada Longa 67', () => {
    const nin = stats({ ninjutsu: 59 });
    assert.equal(pvpHitDamage(hit('fire'), nin, SCALE), 40);
    assert.equal(pvpBurnPerTick(hit('fire'), nin, SCALE) * 3, 15);
    assert.equal(pvpHitDamage(hit('water'), nin, SCALE), 32);
    assert.equal(pvpHitDamage(hit('lightning'), nin, SCALE), 48);
    assert.equal(pvpHitDamage(hit('taijutsu'), stats({ taijutsu: 59 }), SCALE), 56);
    assert.equal(pvpHitDamage(hit('weapons', { weapon: 28 }), stats({ weapons: 59 }), SCALE), 67);
  });

  it('nível 1 (tier 1, nível de uso 1, sem pontos): a curva achatada não mexe no tier 1', () => {
    const zero = stats({});
    assert.equal(pvpHitDamage(hit('fire', { tier: 1, useLevel: 1 }), zero, SCALE), 10);
    assert.equal(pvpHitDamage(hit('lightning', { tier: 1, useLevel: 1 }), zero, SCALE), 12);
  });

  it('custo e recarga: Taijutsu x4 e Armas x2,5; o resto igual', () => {
    assert.deepEqual(pvpCostCooldown('taijutsu', 5, 500), { cost: 20, cooldownMs: 2000 });
    assert.deepEqual(pvpCostCooldown('weapons', 10, 1200), { cost: 25, cooldownMs: 3000 });
    assert.deepEqual(pvpCostCooldown('fire', 20, 1500), { cost: 20, cooldownMs: 1500 });
  });

  it('escudo da Pedra 0,5 / 0,55 / 0,6 / 0,65; cura com a curva achatada e o bônus de uso do PvP', () => {
    assert.deepEqual([...PVP_SHIELD], [0.5, 0.55, 0.6, 0.65]);
    assert.equal(Math.round(pvpHeal(30, 4, 4, 1)), 50);                       // 30 x 1,45 x 1,15
    assert.equal(pvpHeal(30, 1, 1, 1), 30);
  });
});

// ---------------------------------------------------------------- no jogo: arena da Folha
const IN = { x: 66, y: 47 };                                       // meio da arena (test/v15.test.ts)
const F = { x: 51, y: 10 };                                        // clareira da Floresta

function config(): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      monsters: { ...C.monsters, count: 0, stepMs: 1e12, attackDamage: 0 },
      player: { ...C.player, hpRegenPerSec: 0 },
    },
  };
}

function arena() {
  const w = setupWorld(config());
  const world = w.world as any;
  world.skyEffectsAt = () => null;
  const join = (username: string) => {
    const conn = new FakeConn();
    const id = randomUUID();
    const h = w.world.join({ id, username, appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn);
    return { id, conn, send: (msg: unknown) => h.receive(JSON.stringify(msg)) };
  };
  const at = (p: { id: string }, map: string, x: number, y: number) => {
    placeIn(w.world, p.id, map, x, y);
    Object.assign(world.sessions.get(p.id), { x, y, fx: 1, fy: 0 });
  };
  const ses = (id: string) => world.sessions.get(id);
  return { ...w, world, join, at, ses };
}

describe('pvpBalance no jogo (arena das vilas)', () => {
  it('Taijutsu na arena custa 20 de chakra (x4) e recarrega em 2 s; fora dela, 5 e 0,5 s; o welcome manda os números', () => {
    const { join, at, ses, clock } = arena();
    const a = join('kaito');
    assert.deepEqual(a.conn.last('welcome').world.pvpSkills.taijutsu, { cost: 20, cooldownMs: 2000 });
    at(a, 'map_1', IN.x, IN.y);
    Object.assign(ses(a.id), { chakra: 100, cooldowns: {} });
    a.send({ type: 'cast', skill: 'taijutsu' });
    assert.equal(a.conn.last('cast_failed'), undefined);
    assert.equal(ses(a.id).chakra, 80);
    assert.equal(ses(a.id).cooldowns.taijutsu - clock.now(), 2000);
    at(a, 'map_2', F.x, F.y);
    Object.assign(ses(a.id), { chakra: 100, cooldowns: {} });
    a.send({ type: 'cast', skill: 'taijutsu' });
    assert.equal(ses(a.id).chakra, 95, 'na Floresta, o custo de sempre');
  });

  it('Relâmpago tier 4 num ninja na arena sai da tabela do PvP; no monstro, o dano de fora', () => {
    const { world, join, at, ses } = arena();
    const a = join('kaito');
    const b = join('mei');
    at(a, 'map_1', IN.x, IN.y);
    at(b, 'map_1', IN.x + 2, IN.y);
    const s = ses(a.id);
    s.attributes = { ...NO_ATTRIBUTES, ninjutsu: 59 };
    s.stats = world.statsFor(s.village, s.attributes, 60);
    s.jutsus.set('lightning_4', 2000);
    s.kits[s.activeKit] = [...s.kits[s.activeKit].slice(0, 3), 'lightning_4'];
    Object.assign(s, { chakra: 1000, cooldowns: {} });
    const hpBefore = ses(b.id).hp = 1000;
    a.send({ type: 'cast', skill: 'lightning_4', targetId: b.id });
    assert.equal(a.conn.last('cast_failed'), undefined);
    const esperado = pvpHitDamage(hit('lightning', { passive: world.passive(s, 'jutsu') }), s.stats, SCALE);
    assert.equal(hpBefore - ses(b.id).hp, esperado, `PvP: ${esperado}`);
    assert.ok(esperado < 60, 'bem abaixo dos 105 contra monstro');
  });
});

describe('orçamento de controle (passo 1e)', () => {
  const e = (kind: CcKind, startedAt: number, until: number): CcEntry => ({ kind, startedAt, until, weight: kind === 'silencio' ? 0.5 : 1, sourceId: null });

  it('no máximo 1,5 s por aplicação; o resto do orçamento (2,5 s) pega em parte; sobra menor que 0,2 s não pega', () => {
    assert.equal(ccAllow([], 0, 'stunned', 5100), 1500);
    const log = [e('stunned', 0, 1500)];
    assert.equal(ccAllow(log, 2000, 'rooted', 5000), 1000, 'sobra 1 s');
    log.push(e('rooted', 2000, 2900));
    assert.equal(ccAllow(log, 3000, 'stunned', 400), 0, 'sobra 0,1 s: não pega');
  });

  it('a janela de 15 s anda: depois dela, pega inteiro', () => {
    const log = [e('stunned', 0, 1500), e('rooted', 2000, 3000)];
    assert.equal(ccAllow(log, 10_000, 'stunned', 1000), 0);
    assert.equal(ccAllow(log, 18_100, 'stunned', 1000), 1000);
  });

  it('dois controles juntos contam o de maior peso; o silêncio pesa a metade (exemplo da Ilusão tier 4)', () => {
    assert.equal(ccUsed([e('stunned', 0, 1000), e('silencio', 0, 3000)], -15_000), 2000, '1 s cheio + 2 s pela metade');
    const log = [e('stunned', 0, 1500)];
    assert.equal(ccAllow(log, 0, 'silencio', 9600), 3000, 'silêncio: 1,5 s de peso no máximo = 3 s reais');
  });
});

describe('rede de segurança (passo 1f)', () => {
  it('um atacante tira no máximo 50% da vida em 2 s; o que passa é cortado; a janela anda; outro atacante não soma', () => {
    assert.deepEqual(safetyNet([], 0, 454, 300), { allowed: 227, cut: 73 });
    assert.deepEqual(safetyNet([{ t: 0, dmg: 200 }], 1000, 454, 100), { allowed: 27, cut: 73 });
    assert.deepEqual(safetyNet([{ t: 0, dmg: 227 }], 2001, 454, 100), { allowed: 100, cut: 0 }, 'passou de 2 s');
  });

  it('no jogo (arena): o golpe que passaria de 50% é cortado, conta depois do escudo e entra no relatório do admin', () => {
    const { world, join, at, ses, clock } = arena();
    const a = join('kaito');
    const b = join('mei');
    const c = join('rin');
    at(a, 'map_1', IN.x, IN.y);
    at(b, 'map_1', IN.x + 1, IN.y);
    at(c, 'map_1', IN.x, IN.y + 1);
    const vb = ses(b.id);
    vb.stats = { ...vb.stats, maxHp: 400 };                    // vida grande: o teste é o corte, não a morte
    const half = Math.floor(vb.stats.maxHp / 2);
    vb.hp = vb.stats.maxHp;
    world.damagePlayer(vb, half - 10, clock.now(), ses(a.id), ses(a.id), 'attack');
    world.damagePlayer(vb, 40, clock.now(), ses(a.id), ses(a.id), 'attack');
    assert.equal(vb.stats.maxHp - vb.hp, half, 'o segundo golpe só tira 10');
    world.damagePlayer(vb, 15, clock.now(), ses(c.id), ses(c.id), 'attack');
    assert.equal(vb.stats.maxHp - vb.hp, half + 15, 'outro atacante não soma');
    vb.shield = 0.5;
    clock.advance(2001);
    world.damagePlayer(vb, 100, clock.now(), ses(a.id), ses(a.id), 'attack');
    assert.equal(vb.stats.maxHp - vb.hp, half + 15 + 50, 'escudo antes: 100 vira 50, sem corte');
    const r = world.pvpStats.report(clock.now());
    assert.equal(r.safety.cuts, 1);
    assert.equal(r.safety.damage, 30);
    assert.equal(r.safety.version, PVP_BALANCE_VERSION);
  });
});

describe('simulador de duelos (passo 1g)', () => {
  const rs = simulateAll();
  const tabela = rs.map((r) => `${r.a} x ${r.b}: ${r.winner} em ${r.seconds.toFixed(1)} s (pico ${Math.round(r.peakA * 100)}%/${Math.round(r.peakB * 100)}%)`).join('\n');

  it('todo duelo dura de 6 a 30 s; meio a meio contra meio a meio, de 12 a 20 s', () => {
    for (const r of rs) assert.ok(r.seconds >= 6 && r.seconds <= 30, `${r.a} x ${r.b}: ${r.seconds} s\n${tabela}`);
    const mm = rs.find((r) => r.a === 'Meio a meio' && r.b === 'Meio a meio')!;
    assert.ok(mm.seconds >= 12 && mm.seconds <= 20, String(mm.seconds));
  });

  it('ninguém tira 50% da vida em 2 s (antes da rede de segurança)', () => {
    for (const r of rs) assert.ok(r.peakA < 0.5 && r.peakB < 0.5, `${r.a} x ${r.b}\n${tabela}`);
  });

  // Critérios do plano que ainda falham com os números de hoje (decisão do Victor pendente, ver concepts_brief.md):
  //  - nenhuma build vence todas as outras: o Meio a meio vence as 4;
  //  - o orçamento corta no máximo 1 controle por luta: o Relâmpago faz o orçamento cortar até 4.
  it('pendente: quem vence quem e cortes do orçamento (registrado, ainda sem critério)', () => {
    const wins = new Map<string, number>();
    for (const r of rs) if (r.a !== r.b && r.winner !== 'empate') { const w = r.winner === 'a' ? r.a : r.b; wins.set(w, (wins.get(w) ?? 0) + 1); }
    assert.equal(wins.get('Meio a meio'), 4, 'se isto mudar, atualizar o plano e ligar o critério');
  });
});
