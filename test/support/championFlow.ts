import type { ChampionKind, ChampionStore } from '../../src/realtime/championStore.js';
import { makeBracket } from '../../src/realtime/tournament.js';

/** Monta a chave como o servidor monta (makeBracket, a mesma conta do Torneio da Temporada) e grava. */
export function makeTournamentLike(store: ChampionStore, era: number) {
  return {
    async bracket(kind: ChampionKind, village: string, entrants: string[]) {
      await store.saveBracket(era, kind, village, makeBracket(entrants), new Date());
    },
  };
}
