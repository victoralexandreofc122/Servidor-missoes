/*
 * Ciclo de dia e noite e clima (docs/clima.md). O SERVIDOR decide, igual para todos:
 *
 *   - Hora: um ciclo próprio (48 min de verdade por dia do jogo), contado a partir do relógio do servidor. Não
 *     depende de quando o servidor subiu: reiniciar não volta para o amanhecer.
 *       amanhecer 0..8% · dia 8..58% · entardecer 58..67% · noite 67..100%
 *   - Clima: normal, dia quente (só de dia), chuva ou neblina. Muda a cada 8 a 15 min (sorteio com peso); a
 *     neblina sai mais de madrugada e de noite. Quando escurece, o dia quente vira normal.
 *
 * Bônus (só AO AR LIVRE: vilas, Floresta, mapas abertos; dentro de casa e na caverna não vale):
 *   dia quente  Fogo +20% de dano, Água −10%
 *   chuva       Água +20%, Raio +15%, Fogo −20%
 *   neblina     Ilusão: o atordoamento dura 30% a mais
 *   noite       Sombra: prende 30% a mais; Ilusão: atordoa 15% a mais
 * Os de dano multiplicam o dano do jutsu (antes do alvo); os de efeito, o tempo de atordoar e de prender.
 */

import type { Mechanic } from './jutsus.js';

export const WEATHERS = ['normal', 'quente', 'chuva', 'neblina'] as const;
export type Weather = (typeof WEATHERS)[number];
export const DAY_PHASES = ['amanhecer', 'dia', 'entardecer', 'noite'] as const;
export type DayPhase = (typeof DAY_PHASES)[number];

export interface SkyConfig {
  /** Um dia inteiro do jogo, em ms de verdade. */
  cycleMs: number;
  /** Onde cada fase começa, em fração do ciclo (em ordem). */
  phaseStarts: Readonly<Record<DayPhase, number>>;
  /** Quanto um clima dura (sorteado entre os dois). */
  weatherMinMs: number;
  weatherMaxMs: number;
  /** Peso de cada clima no sorteio (a neblina ganha `fogNightBonus` de madrugada e de noite). */
  weights: Readonly<Record<Weather, number>>;
  fogNightBonus: number;
}

export const SKY: Readonly<SkyConfig> = {
  cycleMs: 48 * 60_000,
  phaseStarts: { amanhecer: 0, dia: 0.08, entardecer: 0.58, noite: 0.67 },
  weatherMinMs: 8 * 60_000,
  weatherMaxMs: 15 * 60_000,
  weights: { normal: 45, quente: 20, chuva: 20, neblina: 15 },
  fogNightBonus: 15,
};

/** Fase do dia e onde o ciclo está (0..1) no instante `t` (ms do relógio do servidor) com o ajuste `offsetMs`. */
export function dayPhase(t: number, offsetMs = 0, cfg: SkyConfig = SKY): { phase: DayPhase; progress: number } {
  const progress = ((((t + offsetMs) % cfg.cycleMs) + cfg.cycleMs) % cfg.cycleMs) / cfg.cycleMs;
  let phase: DayPhase = 'amanhecer';
  for (const p of DAY_PHASES) if (progress >= cfg.phaseStarts[p]) phase = p;
  return { phase, progress };
}

/** O ajuste do relógio para a fase `phase` começar em `t` (admin: "/admin hora noite"). */
export function offsetFor(phase: DayPhase, t: number, cfg: SkyConfig = SKY): number {
  const want = cfg.phaseStarts[phase] * cfg.cycleMs;
  return (((want - t) % cfg.cycleMs) + cfg.cycleMs) % cfg.cycleMs;
}

/** O clima pode acontecer nesta fase? (Dia quente, só de dia.) */
export const weatherFits = (w: Weather, phase: DayPhase) => w !== 'quente' || phase === 'dia';

/** Sorteia o próximo clima (diferente do atual quando dá) com os pesos; `random` em [0, 1). */
export function pickWeather(random: () => number, phase: DayPhase, current: Weather | null, cfg: SkyConfig = SKY): Weather {
  const options = WEATHERS.filter((w) => weatherFits(w, phase) && w !== current);
  const weight = (w: Weather) => cfg.weights[w] + (w === 'neblina' && (phase === 'noite' || phase === 'amanhecer') ? cfg.fogNightBonus : 0);
  const total = options.reduce((sum, w) => sum + weight(w), 0);
  let roll = random() * total;
  for (const w of options) {
    roll -= weight(w);
    if (roll < 0) return w;
  }
  return options[options.length - 1] ?? 'normal';
}

/** O que o clima e a hora mudam: multiplicadores de dano e de duração de efeito por mecânica de jutsu. */
export interface SkyEffects {
  damage: Partial<Record<Mechanic, number>>;
  status: Partial<Record<Mechanic, number>>;
}

const WEATHER_EFFECTS: Readonly<Record<Weather, SkyEffects>> = {
  normal: { damage: {}, status: {} },
  quente: { damage: { fire: 1.2, water: 0.9 }, status: {} },
  chuva: { damage: { water: 1.2, lightning: 1.15, fire: 0.8 }, status: {} },
  neblina: { damage: {}, status: { illusion: 1.3 } },
};
const PHASE_EFFECTS: Readonly<Record<DayPhase, SkyEffects>> = {
  amanhecer: { damage: {}, status: {} },
  dia: { damage: {}, status: {} },
  entardecer: { damage: {}, status: {} },
  noite: { damage: {}, status: { shadow: 1.3, illusion: 1.15 } },
};

/** Clima + hora juntos (os dois multiplicam, arredondado em 2 casas). */
export function skyEffects(phase: DayPhase, weather: Weather): SkyEffects {
  const out: SkyEffects = { damage: {}, status: {} };
  for (const part of ['damage', 'status'] as const) {
    for (const src of [WEATHER_EFFECTS[weather][part], PHASE_EFFECTS[phase][part]]) {
      for (const [k, v] of Object.entries(src) as [Mechanic, number][]) out[part][k] = Math.round((out[part][k] ?? 1) * v * 100) / 100;
    }
  }
  return out;
}

/** Mapas onde o clima vale (ao ar livre). Dentro de casa e na caverna, não. */
export const outdoors = (kind: string) => kind === 'village' || kind === 'forest' || kind === 'wild';
