/*
 * Efeitos com tempo (v18, docs/habilidades.md): a base para os jutsus de dano ao longo do tempo, cura ao longo do tempo,
 * controle (silêncio, sono), penalidades (ferida, lentidão) e os combos entre elementos. Valem em ninjas e monstros; o
 * SERVIDOR aplica, faz o pulso e tira; o cliente só mostra o ícone.
 *
 *   molhado      marca da Água (4 s): o Relâmpago num alvo molhado bate 30% mais forte e o seca (combo)
 *   queimadura   dano a cada 1 s (DoT)
 *   regeneracao  cura a cada 1 s (HoT)
 *   silencio     não usa jutsu (o Ataque Básico continua)
 *   sono         não anda, não ataca, não usa nada; ACORDA ao apanhar
 *   ferida       a cura recebida cai pela metade (anti-cura)
 *   lentidao     anda a 60% da velocidade
 *   paralisia    o Relâmpago deixa o corpo dormente: anda a 70% e leva um choque (0,25 s parado) a cada 1 s
 *
 * O atordoamento e a prisão (Relâmpago, Ilusão, Sombra) continuam como estão (`stunnedUntil`, `rootedUntil`, com o teto
 * de controle no PvP). Funções puras aqui; o mundo (gameWorld.ts) avisa todos e aplica dano, cura e bloqueios.
 */

export const EFFECT_CODES = ['molhado', 'queimadura', 'regeneracao', 'silencio', 'sono', 'ferida', 'lentidao', 'paralisia'] as const;
export type EffectCode = (typeof EFFECT_CODES)[number];

export interface EffectRule {
  name: string;
  icon: string;
  /** buff = bom para quem tem; debuff = ruim; cc = controle. */
  kind: 'buff' | 'debuff' | 'cc';
  /** Duração e força padrão (dano ou cura por pulso), quando quem aplica não diz. */
  defaultMs: number;
  amount?: number;
  /** Pulso (DoT, HoT, choque): de quanto em quanto tempo e o que faz. No choque, `amount` = ms parado. */
  tick?: { everyMs: number; kind: 'damage' | 'heal' | 'stun' };
  /** Silêncio: sem jutsu. Sono: sem nada (nem andar). */
  blocksJutsu?: boolean;
  blocksAll?: boolean;
  /** Sono: apanhar acorda. */
  breaksOnDamage?: boolean;
  /** Lentidão: velocidade x isto. */
  speed?: number;
  /** Ferida: cura recebida x isto. */
  healTaken?: number;
}

export const EFFECTS: Readonly<Record<EffectCode, EffectRule>> = {
  molhado: { name: 'Molhado', icon: '💧', kind: 'debuff', defaultMs: 4000 },
  queimadura: { name: 'Queimadura', icon: '🔥', kind: 'debuff', defaultMs: 3000, amount: 4, tick: { everyMs: 1000, kind: 'damage' } },
  regeneracao: { name: 'Regeneração', icon: '💚', kind: 'buff', defaultMs: 5000, amount: 5, tick: { everyMs: 1000, kind: 'heal' } },
  silencio: { name: 'Silêncio', icon: '🤐', kind: 'cc', defaultMs: 3000, blocksJutsu: true },
  sono: { name: 'Sono', icon: '💤', kind: 'cc', defaultMs: 4000, blocksAll: true, breaksOnDamage: true },
  ferida: { name: 'Ferida', icon: '🩸', kind: 'debuff', defaultMs: 6000, healTaken: 0.5 },
  lentidao: { name: 'Lentidão', icon: '🐌', kind: 'debuff', defaultMs: 3000, speed: 0.6 },
  paralisia: { name: 'Paralisia', icon: '💫', kind: 'cc', defaultMs: 2000, amount: 250, speed: 0.7, tick: { everyMs: 1000, kind: 'stun' } },
};

/** Combo Água + Relâmpago: o choque num alvo molhado bate 30% mais forte (e seca o alvo). */
export const WET_LIGHTNING_BONUS = 1.3;

export interface ActiveEffect {
  until: number;
  /** Dano ou cura por pulso (DoT, HoT). */
  amount: number;
  nextTickAt: number;
  /** Quem aplicou (o abate de um monstro que morre de queimadura vai para ele). */
  sourceId: string | null;
}
export type EffectBag = Map<EffectCode, ActiveEffect>;

/** Aplica ou renova: fica o tempo e a força maiores; o pulso continua no ritmo de antes. */
export function addEffect(bag: EffectBag, code: EffectCode, t: number, ms?: number, amount?: number, sourceId: string | null = null): ActiveEffect {
  const rule = EFFECTS[code];
  const until = t + Math.max(0, ms ?? rule.defaultMs);
  const power = amount ?? rule.amount ?? 0;
  const cur = bag.get(code);
  if (cur && cur.until > t) {
    cur.until = Math.max(cur.until, until);
    cur.amount = Math.max(cur.amount, power);
    if (sourceId) cur.sourceId = sourceId;
    return cur;
  }
  const fresh: ActiveEffect = { until, amount: power, nextTickAt: t + (rule.tick?.everyMs ?? 0), sourceId };
  bag.set(code, fresh);
  return fresh;
}

/** O efeito está valendo agora? */
export const hasEffect = (bag: EffectBag, code: EffectCode, t: number): boolean => (bag.get(code)?.until ?? 0) > t;

/** Pulso devido de um DoT/HoT. */
export interface Pulse {
  code: EffectCode;
  kind: 'damage' | 'heal' | 'stun';
  amount: number;
  sourceId: string | null;
}

/**
 * Anda os efeitos até `t`: os pulsos devidos (um por intervalo, no máximo até o fim do efeito) e os que acabaram (saem
 * da bolsa). Um pulso que cai exatamente no fim ainda vale (3 s de queimadura = 3 pulsos).
 */
export function stepEffects(bag: EffectBag, t: number): { pulses: Pulse[]; expired: EffectCode[] } {
  const pulses: Pulse[] = [];
  const expired: EffectCode[] = [];
  for (const [code, e] of bag) {
    const tick = EFFECTS[code].tick;
    if (tick) {
      while (e.nextTickAt <= t && e.nextTickAt <= e.until) {
        pulses.push({ code, kind: tick.kind, amount: e.amount, sourceId: e.sourceId });
        e.nextTickAt += tick.everyMs;
      }
    }
    if (e.until <= t) {
      bag.delete(code);
      expired.push(code);
    }
  }
  return { pulses, expired };
}

/** Velocidade x isto (lentidão). */
export function speedFactor(bag: EffectBag, t: number): number {
  let f = 1;
  for (const [code, e] of bag) if (e.until > t && EFFECTS[code].speed !== undefined) f = Math.min(f, EFFECTS[code].speed!);
  return f;
}

/** Cura recebida x isto (ferida). */
export function healFactor(bag: EffectBag, t: number): number {
  let f = 1;
  for (const [code, e] of bag) if (e.until > t && EFFECTS[code].healTaken !== undefined) f = Math.min(f, EFFECTS[code].healTaken!);
  return f;
}

/** Bloqueado por efeito: 'all' (sono), 'jutsu' (silêncio) ou null. */
export function effectBlock(bag: EffectBag, t: number): 'all' | 'jutsu' | null {
  let out: 'all' | 'jutsu' | null = null;
  for (const [code, e] of bag) {
    if (e.until <= t) continue;
    if (EFFECTS[code].blocksAll) return 'all';
    if (EFFECTS[code].blocksJutsu) out = 'jutsu';
  }
  return out;
}

/** Apanhou: os efeitos que acordam (sono) saem. Devolve quais saíram. */
export function breakOnDamage(bag: EffectBag, t: number): EffectCode[] {
  const out: EffectCode[] = [];
  for (const [code, e] of bag) {
    if (e.until > t && EFFECTS[code].breaksOnDamage) {
      bag.delete(code);
      out.push(code);
    }
  }
  return out;
}
