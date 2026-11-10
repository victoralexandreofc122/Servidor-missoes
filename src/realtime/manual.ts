/*
 * v38: Pergaminho do Mestre (tutorial paginado) e Manual do Ninja.
 *
 * O SERVIDOR decide quando cada capítulo abre e paga o prêmio (uma vez por capítulo, gravado em game.player_tutorial,
 * migração v26). Os textos ficam no cliente (public/manual.js): aqui só os códigos e as regras de desbloqueio.
 */
import type { ClassCode } from './jutsus.js';

/** Versão que o jogo mostra na nota do Pré-Alpha. */
export const GAME_VERSION = 'v38';

export const MANUAL_CHAPTERS = ['boas_vindas', 'classe', 'rito', 'pergaminho', 'pvp', 'secundaria'] as const;
export type ManualChapter = (typeof MANUAL_CHAPTERS)[number];
export const isManualChapter = (c: unknown): c is ManualChapter => typeof c === 'string' && (MANUAL_CHAPTERS as readonly string[]).includes(c);

/** O prêmio de ler um capítulo pela primeira vez (ao fechar). */
export const MANUAL_REWARD = { ryo: 50, xp: 100 } as const;

export interface ManualState {
  unlocked: Set<ManualChapter>;
  read: Set<ManualChapter>;
  /** Já entrou em PvP (Zona de Conflito, Arena ou golpe entre jogadores): abre o capítulo do PvP. */
  pvpSeen: boolean;
}

export interface ManualFacts {
  level: number;
  items: Readonly<Record<string, number>>;
  /** Jutsus aprendidos de classe (tier 1+), além da Academia. */
  learnedClassJutsu: boolean;
  classes: { primary: ClassCode | null };
  pvpSeen: boolean;
}

/** Os capítulos que a ficha já abre. */
export function chaptersOpen(f: ManualFacts): ManualChapter[] {
  const open: ManualChapter[] = ['boas_vindas'];
  if (f.level >= 10) open.push('classe');
  if (f.level >= 11) open.push('rito');
  const scroll = Object.entries(f.items).some(([code, n]) => code.startsWith('scroll_') && n > 0);
  if (scroll || f.learnedClassJutsu || f.classes.primary !== null) open.push('pergaminho');
  if (f.pvpSeen) open.push('pvp');
  if (f.level >= 40) open.push('secundaria');
  return open;
}

export function manualFrom(saved: { unlocked: readonly string[]; read: readonly string[] } | undefined): ManualState {
  const unlocked = new Set((saved?.unlocked ?? []).filter(isManualChapter));
  const read = new Set((saved?.read ?? []).filter(isManualChapter));
  for (const c of read) unlocked.add(c);
  return { unlocked, read, pvpSeen: unlocked.has('pvp') };
}

export const manualView = (m: ManualState) => ({
  unlocked: MANUAL_CHAPTERS.filter((c) => m.unlocked.has(c)),
  read: MANUAL_CHAPTERS.filter((c) => m.read.has(c)),
});
