/*
 * Ativação dos módulos de fim de jogo pela população (docs/endgame.md, seção 0). Funções puras: o servidor lê o
 * banco (game.endgame_modules e game.active_population) e decide aqui o que liga.
 *
 *   vilas (30 ativos) -> pvp (60) -> renegados (100) -> akatsuki (150)
 *
 * Um módulo vale se ele e os anteriores estão ligados: modo "on" (forçado pelo admin) ou "auto" já ativado pela
 * população. Ativou uma vez, fica ativado (o mundo não desfaz vilas e Kages se a população cair).
 */

export const ENDGAME_MODULES = ['vilas', 'pvp', 'renegados', 'akatsuki'] as const;
export type EndgameModule = (typeof ENDGAME_MODULES)[number];

export interface ModuleRow {
  code: EndgameModule;
  mode: 'auto' | 'on' | 'off';
  activatedAt: string | null;
}

/** Os módulos que valem agora (a mesma conta de game.endgame_active). */
export function activeModules(rows: readonly ModuleRow[]): Set<EndgameModule> {
  const out = new Set<EndgameModule>();
  for (const code of ENDGAME_MODULES) {
    const row = rows.find((r) => r.code === code);
    const on = !!row && (row.mode === 'on' || (row.mode === 'auto' && row.activatedAt !== null));
    if (!on) break;                     // os seguintes dependem deste
    out.add(code);
  }
  return out;
}

/** Quais módulos a população acabou de alcançar (em modo auto, ainda não ativados). Em ordem. */
export function dueModules(rows: readonly ModuleRow[], population: number, thresholds: Readonly<Record<EndgameModule, number>>): EndgameModule[] {
  return ENDGAME_MODULES.filter((code) => {
    const row = rows.find((r) => r.code === code);
    return !!row && row.mode === 'auto' && row.activatedAt === null && population >= thresholds[code];
  });
}
