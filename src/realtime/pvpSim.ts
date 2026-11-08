/*
 * Simulador de duelos (passo 1g do plano do duelo, `concepts_brief.md`, objetivo 6). Usa as MESMAS funções do
 * servidor (stats.ts, jutsus.ts, pvpBalance.ts) e luta dos dois lados ao mesmo tempo:
 *
 *  1. 5 builds no nível 60 (59 pontos), cada uma com 2 kits (8 jutsus: os 4 tiers de 2 classes, nível de uso 4) e a
 *     Espada Longa;
 *  2. os dois começam com vida e chakra cheios e agem a cada 0,4 s (um toque), sem errar;
 *  3. em cada toque: o jutsu que mais dá dano, pronto e que caiba no chakra; senão o Ataque Básico (se a recarga
 *     deixar); o chakra não volta sozinho (v29, decisão do Victor); atordoado não age;
 *  4. o controle passa pelo orçamento de controle (pvpBalance.ts);
 *  5. vence quem zera a vida do outro primeiro; diferença menor que 0,4 s = empate.
 *  6. v29 (Jutsus v2): jutsu com números próprios usa a base dele; o leque acerta no máximo 2, a Chuva de Meteoros os 3
 *     que caem no ponto mirado (METEOR_ON_SPOT); os selos (castMs) atrasam o golpe, o aviso no chão também, e um
 *     atordoamento no meio dos selos interrompe (metade do chakra, recarga de 1,5 s, 3 s de Concentração).
 *
 * Mede ANTES da rede de segurança e do orçamento: o maior dano em 2 s e o controle pedido.
 */
import { REALTIME } from './config.js';
import { BASE_SKILLS, CAST_RULES, JUTSU_BY_CODE, skillConfig, type ClassCode } from './jutsus.js';
import { ccAllow, pvpCostCooldown, pvpHitDamage, type CcEntry, type HitInfo } from './pvpBalance.js';
import { NO_ATTRIBUTES, derivedStats, type Attributes, type DerivedStats } from './stats.js';

export const SIM_TAP_MS = 400;
const STEP_MS = 50;
const KATANA = 28;
const LIMIT_MS = 120_000;
/** v29 (decisão do Victor): no rankeado o chakra NÃO volta sozinho (só meditando, e meditar no meio da luta não dá). */
const CHAKRA_REGEN = 0;

export interface SimBuild { name: string; attributes: Partial<Attributes>; kits: [ClassCode, ClassCode] }

export const SIM_BUILDS: readonly SimBuild[] = [
  { name: 'Tanque', attributes: { vitality: 59 }, kits: ['fire', 'water'] },
  { name: 'Meio a meio', attributes: { vitality: 30, ninjutsu: 29 }, kits: ['fire', 'lightning'] },
  { name: 'Dano de Ninjutsu', attributes: { ninjutsu: 59 }, kits: ['lightning', 'fire'] },
  { name: 'Dano de Taijutsu', attributes: { taijutsu: 59 }, kits: ['taijutsu', 'lightning'] },
  { name: 'Dano de Armas', attributes: { weapons: 59 }, kits: ['weapons', 'taijutsu'] },
];

/** Meteoros que caem no ponto mirado (gameWorld.ts, forma 'meteoros'): quem não sai das marcas leva estes. */
export const METEOR_ON_SPOT = 3;

interface Move {
  code: string; hit: HitInfo; cost: number; cooldownMs: number; stunMs: number; paralysisMs: number; ready: number;
  /** Golpes que acertam o mesmo alvo (leque, meteoros); selos; atraso do aviso no chão. */
  hits: number; castMs: number; delayMs: number;
}

interface Fighter {
  stats: DerivedStats;
  hp: number;
  chakra: number;
  moves: Move[];
  basicReady: number;
  stunnedUntil: number;
  paralysisUntil: number;
  nextShock: number;
  nextTap: number;
  burns: { until: number; next: number; per: number }[];
  /** Selos em andamento e golpes avisados a caminho (v29). */
  casting: { move: Move; until: number } | null;
  concentrationUntil: number;
  incoming: { at: number; dmg: number; move: Move }[];
  ccLog: CcEntry[];
  /** Golpes que levou (para o maior dano em 2 s, antes da rede). */
  taken: { t: number; dmg: number }[];
  ccWanted: number;
  ccCuts: number;
}

function statsOf(b: SimBuild): DerivedStats {
  const C = REALTIME.combat;
  return derivedStats({
    maxHp: C.player.maxHp, maxChakra: C.player.maxChakra, meditationChakraPerSec: C.player.chakraRegenPerSec * C.player.meditationRegenMultiplier,
    walkSpeed: 0, runSpeed: 0, attackCooldownMs: C.basicAttack.cooldownMs,
  }, C.attributes, { ...NO_ATTRIBUTES, ...b.attributes }, 60);
}

function fighter(b: SimBuild): Fighter {
  const stats = statsOf(b);
  const moves: Move[] = b.kits.flatMap((cls) => [cls, `${cls}_2`, `${cls}_3`, `${cls}_4`]).map((code) => {
    const j = JUTSU_BY_CODE.get(code as never)!;
    const cfg = skillConfig(j);
    const base1 = BASE_SKILLS[j.mechanic];
    const price = pvpCostCooldown(j.mechanic, cfg.cost, cfg.cooldownMs);
    // a mesma conta do servidor (gameWorld.cast): jutsu com números próprios usa a base e a queimadura dele
    const own = !!j.numbers;
    const base = own ? (cfg.base ?? 0) : (base1.damage ?? 0);
    const burn = own ? (cfg.burn ?? 0) : (base1.burn ?? 0);
    const hits = j.form === 'leque' ? Math.min(2, cfg.shots ?? 3) : j.form === 'meteoros' ? Math.min(METEOR_ON_SPOT, cfg.shots ?? 5) : 1;
    const delayMs = j.form === 'meteoros' || j.form === 'aviso_em_volta' || j.form === 'nuvem_detona' ? cfg.durationMs ?? 0 : 0;
    return {
      code, cost: price.cost, cooldownMs: price.cooldownMs, stunMs: cfg.stunMs ?? 0, paralysisMs: cfg.paralysisMs ?? 0, ready: 0,
      hits, castMs: cfg.castMs ?? 0, delayMs,
      hit: {
        base, tier: j.tier, useLevel: 4, weapon: j.mechanic === 'weapons' ? KATANA : 0,
        scaling: cfg.scaling ?? 'ninjutsu', passive: 1, sky: 1,
        ...(burn ? { burn: { base: burn, ms: cfg.burnMs ?? 3000 } } : {}),
      },
    };
  });
  return {
    stats, hp: stats.maxHp, chakra: stats.maxChakra, moves, basicReady: 0, stunnedUntil: 0, paralysisUntil: 0, nextShock: 0,
    nextTap: 0, burns: [], ccLog: [], taken: [], ccWanted: 0, ccCuts: 0, casting: null, concentrationUntil: 0, incoming: [],
  };
}

const scale = () => REALTIME.combat.damageScale;
const basicDamage = (s: DerivedStats) => Math.round(REALTIME.combat.basicAttack.damage * scale().basic * s.physicalMultiplier
  + KATANA * scale().basic * (1 + (s.weaponMultiplier - 1) / 2));

function control(target: Fighter, kind: 'stunned' | 'shock', ms: number, t: number): void {
  target.ccWanted += ms;
  target.ccLog = target.ccLog.filter((e) => e.until > t - 15_000);
  const got = ccAllow(target.ccLog, t, kind, ms);
  if (got < ms) target.ccCuts += 1;
  if (got <= 0) return;
  target.ccLog.push({ kind, startedAt: t, until: t + got, weight: 1, sourceId: null });
  target.stunnedUntil = Math.max(target.stunnedUntil, t + got);
  // controle duro no meio dos selos: interrompe (o choque da paralisia também é atordoamento)
  if (target.casting && t >= target.concentrationUntil) {
    target.chakra = Math.max(0, target.chakra - Math.round(target.casting.move.cost / 2));
    target.casting.move.ready = Math.max(target.casting.move.ready, t + CAST_RULES.interruptCooldownMs);
    target.casting = null;
    target.concentrationUntil = t + CAST_RULES.concentrationMs;
  }
}

function hurt(target: Fighter, dmg: number, t: number): void {
  target.hp -= dmg;
  target.taken.push({ t, dmg });
}

/** O golpe sai (na hora, no fim dos selos ou quando o aviso no chão cai). */
function land(m: Move, dmg: number, foe: Fighter, t: number): void {
  hurt(foe, dmg, t);
  if (m.hit.burn) {
    const per = Math.max(1, Math.round(dmg * m.hit.burn.base / m.hit.base));
    foe.burns.push({ until: t + m.hit.burn.ms, next: t + 1000, per });
  }
  if (m.stunMs) control(foe, 'stunned', m.stunMs, t);
  if (m.paralysisMs) { foe.paralysisUntil = Math.max(foe.paralysisUntil, t + m.paralysisMs); foe.nextShock = t + 1000; }
}

/** Os selos acabaram: cobra, põe na recarga e solta (os meteoros caem um depois do outro, a cada 0,25 s). */
function release(me: Fighter, foe: Fighter, m: Move, t: number): void {
  me.chakra -= m.cost;
  m.ready = t + m.cooldownMs;
  const dmg = pvpHitDamage(m.hit, me.stats, scale());
  for (let i = 0; i < m.hits; i++) {
    const at = t + m.delayMs + (m.hits > 1 && m.delayMs > 0 ? i * 250 : 0);
    if (at <= t) land(m, dmg, foe, t);
    else foe.incoming.push({ at, dmg, move: m });
  }
}

function act(me: Fighter, foe: Fighter, t: number): void {
  if (me.casting) {
    if (t >= me.casting.until) { const m = me.casting.move; me.casting = null; release(me, foe, m, t); }
    return;
  }
  if (t < me.nextTap || t < me.stunnedUntil) return;
  const move = me.moves.filter((m) => m.ready <= t && m.cost <= me.chakra && m.hit.base > 0)
    .map((m) => ({ m, dmg: pvpHitDamage(m.hit, me.stats, scale()) * m.hits }))
    .sort((a, b) => b.dmg - a.dmg)[0];
  if (move) {
    if (move.m.castMs > 0) me.casting = { move: move.m, until: t + move.m.castMs };
    else release(me, foe, move.m, t);
    me.nextTap = t + SIM_TAP_MS;
  } else if (t >= me.basicReady) {
    hurt(foe, basicDamage(me.stats), t);
    me.basicReady = t + Math.round(me.stats.attackCooldownMs * 1.15);    // Espada Longa
    me.nextTap = t + SIM_TAP_MS;
  }
}

function pulses(f: Fighter, t: number): void {
  for (const b of f.burns) if (t >= b.next && b.next <= b.until) { hurt(f, b.per, t); b.next += 1000; }
  const due = f.incoming.filter((x) => x.at <= t);
  if (due.length) { f.incoming = f.incoming.filter((x) => x.at > t); for (const x of due) land(x.move, x.dmg, f, t); }
  if (t < f.paralysisUntil && t >= f.nextShock) { control(f, 'shock', 250, t); f.nextShock += 1000; }
}

function peak2s(f: Fighter): number {
  let best = 0;
  for (const h of f.taken) best = Math.max(best, f.taken.filter((x) => x.t >= h.t && x.t < h.t + 2000).reduce((s, x) => s + x.dmg, 0));
  return best / f.stats.maxHp;
}

export interface SimResult {
  a: string; b: string;
  /** Quando cada um zerou a vida do outro (ms); null = não zerou no limite. */
  aKillsAt: number | null; bKillsAt: number | null;
  /** 'a', 'b' ou 'empate'. */
  winner: 'a' | 'b' | 'empate';
  /** Duração da luta (s): até a primeira vida zerar. */
  seconds: number;
  /** Maior parte da vida tirada em 2 s (0 a 1), antes da rede de segurança. */
  peakA: number; peakB: number;
  /** Controles cortados pelo orçamento. */
  ccCutsA: number; ccCutsB: number;
}

/** Uma luta; `aFirst` = quem age primeiro no primeiro passo (depois alterna). */
function fight(A: SimBuild, B: SimBuild, aFirst: boolean) {
  const a = fighter(A);
  const b = fighter(B);
  let aKillsAt: number | null = null;
  let bKillsAt: number | null = null;
  // Cada um luta até zerar o outro (o morto continua "agindo" para medir quando ele mataria: empate justo).
  for (let t = 0; t <= LIMIT_MS && (aKillsAt === null || bKillsAt === null); t += STEP_MS) {
    pulses(a, t);
    pulses(b, t);
    // Quem age primeiro alterna a cada passo (sem vantagem fixa para um lado).
    if (((t / STEP_MS) % 2 === 0) === aFirst) { act(a, b, t); act(b, a, t); } else { act(b, a, t); act(a, b, t); }
    a.chakra = Math.min(a.stats.maxChakra, a.chakra + CHAKRA_REGEN * STEP_MS / 1000);
    b.chakra = Math.min(b.stats.maxChakra, b.chakra + CHAKRA_REGEN * STEP_MS / 1000);
    if (aKillsAt === null && b.hp <= 0) aKillsAt = t;
    if (bKillsAt === null && a.hp <= 0) bKillsAt = t;
  }
  return { aKillsAt, bKillsAt, peakA: peak2s(a), peakB: peak2s(b), ccCutsA: a.ccCuts, ccCutsB: b.ccCuts };
}

const avg = (x: number | null, y: number | null) => (x === null || y === null ? null : (x + y) / 2);

/** A luta dos dois jeitos (cada um agindo primeiro) e a média: sem vantagem de quem começa. */
export function simulate(A: SimBuild, B: SimBuild): SimResult {
  const r1 = fight(A, B, true);
  const r2 = fight(A, B, false);
  const aKillsAt = avg(r1.aKillsAt, r2.aKillsAt);
  const bKillsAt = avg(r1.bKillsAt, r2.bKillsAt);
  const ta = aKillsAt ?? Infinity;
  const tb = bKillsAt ?? Infinity;
  const winner = Math.abs(ta - tb) < SIM_TAP_MS ? 'empate' : ta < tb ? 'a' : 'b';
  return {
    a: A.name, b: B.name, aKillsAt, bKillsAt, winner, seconds: Math.min(ta, tb) / 1000,
    peakA: Math.max(r1.peakA, r2.peakA), peakB: Math.max(r1.peakB, r2.peakB),
    ccCutsA: Math.max(r1.ccCutsA, r2.ccCutsA), ccCutsB: Math.max(r1.ccCutsB, r2.ccCutsB),
  };
}

/** Todos contra todos (inclusive o espelho). */
export function simulateAll(builds: readonly SimBuild[] = SIM_BUILDS): SimResult[] {
  const out: SimResult[] = [];
  for (let i = 0; i < builds.length; i++) for (let j = i; j < builds.length; j++) out.push(simulate(builds[i]!, builds[j]!));
  return out;
}
