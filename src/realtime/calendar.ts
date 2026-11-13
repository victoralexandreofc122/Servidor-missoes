/*
 * v55 (pedido do Victor, Fase 2 continuação): o calendário automático da Era (60 dias). Só contas, sem banco e sem relógio:
 * o servidor chama `calendarStep` a cada minuto e faz o que ela mandar (as mesmas ações do /admin torneio, que continua
 * valendo para forçar em teste).
 *
 *  - Semana 3 (dia 14): abre a fase de pontos do Torneio da Temporada por 10 dias.
 *  - Fim da fase de pontos (dia 24, semana 4): fecha os pontos e monta os grupos da Fase Final.
 *  - Grupos: até 3 dias (antes, se todos os jogos acabarem). Jogo que não aconteceu = derrota dos dois (regra da v28).
 *  - Eliminatória: até 3 dias (antes, se todas as chaves tiverem campeão). No prazo, jogo pendente = W.O. a favor do
 *    melhor cabeça de chave (o lado `a`), e o Torneio é encerrado (Jounin da era, consolação).
 *  - Junto com a Fase Final (mesma semana) abrem o Torneio dos Heróis e o Torneio dos Vilões (`championStep`).
 *  - Dia 60: a Era fecha e a próxima começa (o rankeado tem o relógio próprio de 60 dias, que fecha junto).
 */

export const DAY_MS = 86_400_000;

export const CALENDAR = {
  /** Dia da Era (contado do início) em que a fase de pontos abre: começo da semana 3. */
  pointsStartDay: 14,
  pointsDays: 10,
  groupsDays: 3,
  bracketDays: 3,
  /** Torneios dos Heróis e dos Vilões: inscrições abertas por 1 dia a partir do começo da Fase Final; chaves por até 5. */
  championSignupDays: 1,
  championBracketDays: 5,
} as const;

export type CalendarRules = { [K in keyof typeof CALENDAR]: number };

export interface EraView {
  startsAt: number;
  endsAt: number;
  /** A janela da fase de pontos desta Era (null: ainda não abriu). */
  jounin: { startsAt: number; endsAt: number } | null;
  stage: 'pontos' | 'grupos' | 'chaves' | 'encerrado';
  /** A migração v28 (Fase Final) está no banco. */
  finalReady: boolean;
  /** Jogos da etapa atual que ainda podem acontecer (grupos ou chaves). */
  pending: number;
}

export type CalendarAction =
  | { kind: 'open_points'; endsAt: number }
  | { kind: 'start_groups' }
  | { kind: 'start_bracket' }
  | { kind: 'finish'; wo: boolean }
  | { kind: 'close_era' }
  | null;

/** O que o calendário manda fazer agora (uma ação por vez; o servidor chama de novo no minuto seguinte). */
export function calendarStep(era: EraView, now: number, rules: CalendarRules = CALENDAR): CalendarAction {
  const pointsOpen = era.startsAt + rules.pointsStartDay * DAY_MS;
  const pointsEnd = pointsOpen + rules.pointsDays * DAY_MS;
  // a Fase Final em andamento termina primeiro (mesmo depois do fim da Era)
  if (era.jounin && era.finalReady) {
    const groupsEnd = era.jounin.endsAt + rules.groupsDays * DAY_MS;
    const bracketEnd = groupsEnd + rules.bracketDays * DAY_MS;
    if (era.stage === 'grupos' && (era.pending === 0 || now >= groupsEnd || now >= era.endsAt)) return { kind: 'start_bracket' };
    if (era.stage === 'chaves') {
      if (era.pending === 0) return { kind: 'finish', wo: false };
      if (now >= bracketEnd || now >= era.endsAt) return { kind: 'finish', wo: true };
      return null;
    }
    if (era.stage === 'pontos' && now >= era.jounin.endsAt) return { kind: 'start_groups' };
  }
  if (now >= era.endsAt) return { kind: 'close_era' };
  if (!era.jounin && now >= pointsOpen && now < pointsEnd) return { kind: 'open_points', endsAt: Math.min(pointsEnd, era.endsAt) };
  return null;
}

/** Os torneios de campeão (Heróis e Vilões): em que etapa devem estar agora. */
export type ChampionPhase = 'fechado' | 'inscricoes' | 'chaves' | 'encerrado';

/**
 * Etapa do Torneio dos Heróis e do Torneio dos Vilões: abrem junto com a Fase Final do Torneio da Temporada (o fim da fase
 * de pontos), ficam 1 dia em inscrições e depois até 5 dias nas chaves. `openedAt` = quando as inscrições abriram (null:
 * ainda não abriram nesta Era).
 */
export function championPhase(era: EraView, openedAt: number | null, champion: boolean, now: number, rules: CalendarRules = CALENDAR): ChampionPhase {
  if (champion) return 'encerrado';
  if (openedAt === null) return era.jounin && era.stage !== 'pontos' && now < era.endsAt ? 'inscricoes' : 'fechado';
  const signupEnd = openedAt + rules.championSignupDays * DAY_MS;
  if (now < signupEnd) return 'inscricoes';
  return now < signupEnd + rules.championBracketDays * DAY_MS ? 'chaves' : 'encerrado';
}
