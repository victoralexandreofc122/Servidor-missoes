/*
 * v61 (migração v36): os Titãs Ancestrais e os Portadores, o evento "Cinturão da Era". Nomes do Victor (15/11/2026).
 *
 *  - 10 Titãs acordam, um por dia, nos 10 primeiros dias da Era (dia 1: o 1º, ...). Cada um fica acordado até o dia
 *    seguinte; quem não cair volta a dormir (sem Portador naquela Era).
 *  - A vida é GLOBAL (uma só no servidor, gravada no banco).
 *  - Quem deu mais dano (MVP) vira o Portador: título e passiva até o fim da Era (60 dias). Um Titã por ninja por Era.
 *  - REGRA DE OURO: as passivas e a Habilidade Suprema do Portador valem em TODOS os modos (PvE, PvP, Guerras).
 *  - Habilidade Suprema: botão no HUD; o efeito dura 1 minuto (salvo o que diz outro tempo); recarga de 20 minutos.
 *  - Só acordam com a Progressão de Mundo no marco de 150 jogadores (worldProgress.ts), ou forçados pelo admin.
 */

export const TITAN_CODES = ['chama_eterna', 'mare_de_sangue', 'trovao_ancestral', 'vento_cortante', 'rocha_antiga',
  'noite_eterna', 'pesadelo', 'corpo_fechado', 'mil_laminas', 'vida'] as const;
export type TitanCode = (typeof TITAN_CODES)[number];

export interface TitanInfo {
  code: TitanCode;
  /** 1 a 10: o dia da Era em que acorda */
  index: number;
  name: string;
  /** "Portador da ..." (o título no banco) */
  title: string;
  icon: string;
  color: string;
  passive: string;
  active: string;
}

const T = (code: TitanCode, name: string, title: string, icon: string, color: string, passive: string, active: string): TitanInfo =>
  ({ code, index: TITAN_CODES.indexOf(code) + 1, name, title, icon, color, passive, active });

export const TITANS: readonly TitanInfo[] = [
  T('chama_eterna', 'Chama Eterna', 'Portador da Chama Eterna', '🔥', '#ff6a2a', 'Ataques Básicos queimam o alvo (3 s).', 'Explosão gigante em volta (5 casas).'),
  T('mare_de_sangue', 'Maré de Sangue', 'Portador da Maré de Sangue', '🌊', '#c8243c', 'Jutsus de Água curam 20% do dano que causam.', 'Cura toda a vida e limpa os efeitos ruins.'),
  T('trovao_ancestral', 'Trovão Ancestral', 'Portador do Trovão Ancestral', '⚡', '#ffe14a', '10% de chance de paralisar o alvo (0,5 s) a cada golpe.', 'Atordoa todos em volta (2 s) e o raio salta em cadeia.'),
  T('vento_cortante', 'Vento Cortante', 'Portador do Vento Cortante', '🌪️', '#8fe8c8', '+20% de velocidade e -10% de recarga nos jutsus.', 'Invisível e +100% de velocidade por 5 s.'),
  T('rocha_antiga', 'Rocha Antiga', 'Portador da Rocha Antiga', '🪨', '#c9a678', 'Escudo de 15% da vida, que volta a cada 10 s.', 'Imune a controle e escudo de 50% da vida (1 min).'),
  T('noite_eterna', 'Noite Eterna', 'Portador da Noite Eterna', '🌑', '#6a4aa8', 'Dano x1,5 em quem está de costas para você.', 'Executa um inimigo perto com menos de 20% de vida.'),
  T('pesadelo', 'Pesadelo', 'Portador do Pesadelo', '👁️', '#b05ad8', 'Seus controles (atordoar, prender, sono...) duram +20%.', 'Inverte os controles de todos em volta por 3 s.'),
  T('corpo_fechado', 'Corpo Fechado', 'Portador do Corpo Fechado', '👊', '#e8a23a', '+30% de dano no Ataque Básico e no Taijutsu.', 'Golpe maciço em cone à sua frente.'),
  T('mil_laminas', 'Mil Lâminas', 'Portador das Mil Lâminas', '🗡️', '#d0d8e4', 'Jutsus de Armas com +1 casa de alcance.', 'Rajada de 16 lâminas em volta (360º).'),
  T('vida', 'Vida', 'Portador da Vida', '🌿', '#6fd17a', 'Fora de combate, regenera 1% da vida por segundo.', 'Cura toda a vida de todos os aliados na tela.'),
];

export const TITAN_BY_INDEX: ReadonlyMap<number, TitanInfo> = new Map(TITANS.map((t) => [t.index, t]));
export const titleCode = (t: TitanInfo) => `TITA_${t.code.toUpperCase()}`;

export const TITAN_EVENT = {
  /** Quantos dias de Era têm Titã (um por dia). */
  days: 10,
  /** Vida de cada Titã: cresce do 1º ao 10º. */
  hp: (index: number) => 40_000 + (index - 1) * 8_000,
  /** Onde acordam: o centro da Clareira Queimada. */
  map: 'clareira_queimada' as const,
  at: { x: 22, y: 20 },
  /** Gravar a vida e o dano no banco a cada 15 s (um reinício perde no máximo isso). */
  saveEveryMs: 15_000,
  /** Habilidade Suprema: efeito de 1 minuto, recarga de 20 minutos. */
  activeMs: 60_000,
  activeCooldownMs: 20 * 60_000,
  /** Quem tirou pelo menos 5% da vida do chefe rola o loot (loot.ts). */
  lootShare: 0.05,
} as const;

/** Números das passivas e das Habilidades Supremas. */
export const BEARER = {
  burnMs: 3_000,
  waterHeal: 0.2,
  paralyzeChance: 0.1,
  paralyzeMs: 500,
  windSpeed: 1.2,
  windCooldown: 0.9,
  rockShieldPct: 0.15,
  rockShieldEveryMs: 10_000,
  backstab: 1.5,
  nightmareCc: 1.2,
  closedBody: 1.3,
  bladesRange: 1,
  lifeRegenPct: 0.01,
  lifeCalmMs: 5_000,
  // Supremas
  blast: { radius: 5, mult: 6 },
  chain: { radius: 5, stunMs: 2_000, jumps: 5, mult: 2 },
  windActive: { ms: 5_000, speed: 2 },
  rockActive: { shieldPct: 0.5 },
  execute: { range: 3, below: 0.2 },
  invert: { radius: 6, ms: 3_000 },
  cone: { range: 4, arcDeg: 100, mult: 8 },
  blades: { count: 16, range: 7, speed: 14, mult: 1.5 },
  heal: { radius: 12 },
} as const;

/** Que Titã acorda neste momento da Era (1 a 10), ou null (passou dos 10 dias). */
export function titanOfDay(eraStartMs: number, now: number): number | null {
  const day = Math.floor((now - eraStartMs) / 86_400_000);
  return day >= 0 && day < TITAN_EVENT.days ? day + 1 : null;
}

/** Até quando o Titã do dia fica acordado (o começo do dia seguinte da Era). */
export const titanSleepsAt = (eraStartMs: number, index: number) => eraStartMs + index * 86_400_000;

/** De costas: o alvo olha para longe de quem bate (ângulo entre o olhar dele e a direção do atacante > 90°). */
export function isBehind(target: { x: number; y: number; fx: number; fy: number }, attacker: { x: number; y: number }): boolean {
  const dx = attacker.x - target.x, dy = attacker.y - target.y;
  const d = Math.hypot(dx, dy) || 1;
  return (target.fx * dx + target.fy * dy) / d < -0.2;
}
