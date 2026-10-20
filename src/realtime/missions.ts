import { withTransaction, type Db, type Queryable } from '../db.js';
import { CONSTRAINT_ERRORS } from '../errors/errorTranslator.js';
import { SQL } from '../missions/sql.js';
import type { XpResult } from './gameWorld.js';
import type { MissionView, SenseiDifficulty } from './protocol.js';
import { GRANT_XP_SQL, grantResult, type GrantRow } from './progression.js';

/*
 * Missões de sensei no tempo real: o NPC Mestre e a contagem de abates.
 *
 * Tudo passa pelo ciclo do schema v2 (game.sensei_missions e companhia), com os MESMOS
 * comandos das rotas HTTP (src/missions/sql.ts) e os MESMOS triggers:
 *
 *   NPC atribui ........ SQL.createMission     (sensei = o NPC; XP e título vêm do catálogo)
 *   abate de monstro ... RECORD_KILL_SQL       (só missão 'active' do tipo DEFEAT_MONSTER)
 *   sensei jogador ..... SQL.createMission     (Chunin+ toca em outro jogador: "Criar Missão")
 *   aprendiz entrega ... SQL.submitMission     (tocando no sensei que criou; o trigger confere a meta)
 *   sensei avalia ...... SQL.insertEvaluation  (aprovou: o trigger emite o pergaminho)
 *   volta ao NPC ....... SQL.submitMission     (o trigger recusa objetivo incompleto)
 *                        SQL.insertEvaluation  (o NPC aprova: o trigger emite o pergaminho)
 *                        SQL.insertRedemption  (o trigger credita XP e título e conclui)
 *
 * O cliente nunca informa progresso: o único jeito de avançar é o servidor ver o monstro morrer.
 */

/** Mesmo id da migração db/schema_v4_npc_missions.sql. */
export const NPC_SENSEI_ID = '00000000-0000-7000-8000-00000000a001';

/** A missão que o Mestre passa. Códigos do catálogo da migração v4. */
export const NPC_MISSION = {
  missionType: 'DEFEAT_MONSTER',
  difficulty: 'NPC_TRAINING',
  targetCode: 'slime',
  targetQuantity: 5,
  feedback: 'Treino concluído com honra.',
} as const;

const MISSION_COLUMNS = `
  m.id, m.status, m.sensei_id, s.username AS sensei_name, t.code AS type_code, t.name AS type_name,
  m.target_code, m.target_quantity, m.progress_quantity, m.xp_reward, ti.name AS title_name, m.expires_at`;

const MISSION_JOINS = `
  JOIN game.players       s  ON s.id  = m.sensei_id
  JOIN game.mission_types t  ON t.id  = m.mission_type_id
  LEFT JOIN game.titles   ti ON ti.id = m.reward_title_id`;

export const MISSIONS_SQL = {
  /** Migração v4 aplicada? (NPC, tipo e dificuldade). Usado só no boot, para avisar no log. */
  bootCheck: `
    SELECT 1
      FROM game.players p
     WHERE p.id = $1
       AND EXISTS (SELECT 1 FROM game.mission_types        WHERE code = $2)
       AND EXISTS (SELECT 1 FROM game.mission_difficulties WHERE code = $3)`,

  /**
   * Missão mostrada na Sala de Missões: a em aberto (active/submitted, no máximo 1 pelo
   * índice ux_sensei_missions_trainee_open) ou, se não houver, o pergaminho aprovado à espera.
   */
  current: `
    SELECT ${MISSION_COLUMNS}
      FROM game.sensei_missions m ${MISSION_JOINS}
     WHERE m.trainee_id = $1 AND m.status IN ('active', 'submitted', 'approved')
     ORDER BY m.status = 'approved', m.created_at DESC
     LIMIT 1`,

  byId: `
    SELECT ${MISSION_COLUMNS}
      FROM game.sensei_missions m ${MISSION_JOINS}
     WHERE m.id = $1`,

  /**
   * +1 abate. Só conta para missão em andamento, do tipo DEFEAT_MONSTER, do monstro certo,
   * no prazo e ainda incompleta (o abate número 6 de 5 não faz nada). Um comando só:
   * a linha fica travada durante o UPDATE, então dois abates ao mesmo tempo somam 2.
   * O CTE devolve os valores NOVOS (um SELECT na tabela, no mesmo comando, veria os antigos).
   */
  recordKill: `
    WITH u AS (
      UPDATE game.sensei_missions m
         SET progress_quantity = m.progress_quantity + 1
        FROM game.mission_types t
       WHERE m.trainee_id = $1
         AND m.status = 'active'
         AND t.id = m.mission_type_id AND t.code = 'DEFEAT_MONSTER'
         AND m.target_code = $2
         AND m.progress_quantity < m.target_quantity
         AND (m.expires_at IS NULL OR m.expires_at > now())
      RETURNING m.*
    )
    SELECT ${MISSION_COLUMNS}
      FROM u m ${MISSION_JOINS}`,

  playerLevel: `SELECT level FROM game.players WHERE id = $1`,

  /** Missões entregues esperando a avaliação deste sensei (reenviadas quando ele conecta). */
  pendingEvaluations: `
    SELECT ${MISSION_COLUMNS}, m.trainee_id, tp.username AS trainee_name
      FROM game.sensei_missions m ${MISSION_JOINS}
      JOIN game.players tp ON tp.id = m.trainee_id
     WHERE m.sensei_id = $1 AND m.status = 'submitted'
     ORDER BY m.submitted_at
     LIMIT 10`,

  /** Aprendiz e sensei de uma missão (depois da avaliação: para avisar o aprendiz). */
  missionPeople: `
    SELECT m.trainee_id, m.sensei_id, r.code AS rank_code, r.name AS rank_name, r.can_be_sensei
      FROM game.sensei_missions m
      JOIN game.players p ON p.id = m.trainee_id
      JOIN game.ranks r ON r.id = p.current_rank_id
     WHERE m.id = $1`,

  /** Dificuldades que um sensei jogador pode escolher (o Treino do Mestre é só do NPC). */
  senseiOptions: `
    SELECT d.code, d.name, d.xp_reward, t.name AS title_name
      FROM game.mission_difficulties d
      LEFT JOIN game.titles t ON t.id = d.title_id
     WHERE d.is_active AND d.code <> $1
     ORDER BY d.tier`,

  /** Volta ao NPC: trava a missão em aberto do aprendiz até o fim da transação. */
  lockOpen: `
    SELECT id, sensei_id, status, progress_quantity, target_quantity
      FROM game.sensei_missions
     WHERE trainee_id = $1 AND status IN ('active', 'submitted')
       FOR UPDATE`,

  /**
   * Pergaminhos aprovados à espera de entrega (de QUALQUER sensei: o Mestre é a Sala de
   * Missões). FOR UPDATE OF m: dois toques ao mesmo tempo não entregam o mesmo pergaminho.
   */
  approvedScrolls: `
    SELECT sc.id AS scroll_id, m.id AS mission_id, m.sensei_id, sp.username AS sensei_name,
           m.xp_reward, ti.name AS title_name
      FROM game.sensei_missions m
      JOIN game.mission_evaluations e  ON e.mission_id = m.id AND e.is_approved
      JOIN game.completion_scrolls  sc ON sc.evaluation_id = e.id
      JOIN game.players             sp ON sp.id = m.sensei_id
      LEFT JOIN game.titles         ti ON ti.id = m.reward_title_id
     WHERE m.trainee_id = $1 AND m.status = 'approved'
     ORDER BY m.created_at
       FOR UPDATE OF m`,
} as const;

interface MissionRow {
  id: string;
  status: MissionView['status'];
  sensei_id: string;
  sensei_name: string;
  type_code: string;
  type_name: string;
  target_code: string;
  target_quantity: number;
  progress_quantity: number;
  xp_reward: number;
  title_name: string | null;
  expires_at: Date | null;
}

export function missionView(row: MissionRow): MissionView {
  return {
    id: row.id,
    status: row.status,
    senseiName: row.sensei_id === NPC_SENSEI_ID ? 'Mestre' : row.sensei_name,
    senseiId: row.sensei_id,
    fromNpc: row.sensei_id === NPC_SENSEI_ID,
    type: { code: row.type_code, name: row.type_name },
    target: { code: row.target_code, quantity: row.target_quantity },
    progress: row.progress_quantity,
    reward: { xp: row.xp_reward, title: row.title_name },
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    // Pronta para entregar: objetivo completo (falta voltar ao sensei) ou pergaminho aprovado.
    ready: row.status === 'approved' || (row.status === 'active' && row.progress_quantity >= row.target_quantity),
  };
}

/** Uma recompensa entregue na Sala de Missões. */
export interface MissionReward {
  missionId: string;
  senseiName: string;
  fromNpc: boolean;
  xp: number;
  /** Título da missão (null = a dificuldade não dá título). */
  title: string | null;
  /** false = o jogador já tinha o título: veio só o XP. */
  titleNew: boolean;
}

export type TalkOutcome =
  /** Não tinha missão: o Mestre passou uma nova. */
  | { kind: 'assigned'; mission: MissionView }
  /** Missão do Mestre ainda incompleta. */
  | { kind: 'in_progress'; mission: MissionView }
  /** Missão de OUTRO sensei (jogador) em aberto: só ele avalia. */
  | { kind: 'other_sensei'; mission: MissionView }
  /** Pergaminho(s) entregue(s): XP e título já gravados (e o nível, pelo trigger da v5). */
  | ({ kind: 'rewarded'; rewards: MissionReward[]; mission: MissionView | null } & XpResult)
  /** Rank do jogador não está abaixo do Mestre (regra rule_trainee_rank). */
  | { kind: 'rank_too_high' }
  /** Migração v4 não aplicada (sem NPC ou sem catálogo). */
  | { kind: 'unavailable' };

/** Recusa com o texto público da regra do banco (o nome da constraint nunca sai para o jogador). */
export type Refused = { kind: 'refused'; text: string };

export type CreateOutcome = { kind: 'created'; mission: MissionView } | Refused;
export type DeliverOutcome =
  | { kind: 'submitted'; mission: MissionView }
  | { kind: 'incomplete'; mission: MissionView }
  | { kind: 'already_submitted'; mission: MissionView }
  | { kind: 'no_mission' }
  | Refused;
export type EvaluateOutcome =
  | { kind: 'evaluated'; approved: boolean; traineeId: string; mission: MissionView; traineeRank: { code: string; name: string; canBeSensei: boolean } }
  | Refused;

export interface PendingEvaluation {
  missionId: string;
  trainee: { id: string; username: string };
  mission: MissionView;
}

/** O que o GameWorld usa. Implementação com banco: makeMissions. */
export interface Missions {
  current(playerId: string): Promise<MissionView | null>;
  /** Conversa com o NPC Mestre (atribuir, ver progresso, concluir e entregar). */
  talk(playerId: string): Promise<TalkOutcome>;
  /** Abate de monstro. Devolve a missão atualizada, ou null se nenhuma missão contou o abate. */
  recordKill(playerId: string, monsterType: string): Promise<MissionView | null>;
  /** Sensei jogador cria a missão (o banco confere rank do sensei e do aprendiz). */
  create(senseiId: string, traineeId: string, difficulty: string, quantity: number): Promise<CreateOutcome>;
  /** Aprendiz entrega ao sensei que criou a missão. */
  deliver(traineeId: string, senseiId: string): Promise<DeliverOutcome>;
  /** Sensei avalia (o banco confere quem pode avaliar). */
  evaluate(evaluatorId: string, missionId: string, approved: boolean, score: number): Promise<EvaluateOutcome>;
  pendingEvaluations(senseiId: string): Promise<PendingEvaluation[]>;
  senseiOptions(): Promise<SenseiDifficulty[]>;
}

/** Erro do banco por regra conhecida vira recusa com texto; o resto sobe (erro do servidor). */
function refusal(err: unknown): Refused {
  const e = pgError(err);
  const known = e.constraint ? CONSTRAINT_ERRORS[e.constraint] : undefined;
  if (known) return { kind: 'refused', text: known.message };
  if (e.code === '23503') return { kind: 'refused', text: 'Missão ou jogador não encontrado.' };
  throw err;
}

/** Opções da missão entre jogadores (tipo e alvo fixos: só abate de slime o jogo sabe contar). */
export const PLAYER_MISSION = { missionType: 'DEFEAT_MONSTER', targetCode: 'slime' } as const;

interface PgError {
  code?: string;
  constraint?: string;
}
const pgError = (err: unknown): PgError => (typeof err === 'object' && err !== null ? (err as PgError) : {});

/** Sinaliza, de dentro da transação, um resultado que não é erro do servidor. */
class Outcome extends Error {
  constructor(readonly outcome: TalkOutcome) {
    super(outcome.kind);
  }
}

export function makeMissions(db: Db): Missions {
  let optionsCache: { at: number; list: SenseiDifficulty[] } | undefined;
  const byId = async (q: Queryable, id: string) => missionView((await q.query<MissionRow>(MISSIONS_SQL.byId, [id])).rows[0]!);

  async function talkOnce(playerId: string): Promise<TalkOutcome> {
    return withTransaction(db, async (tx) => {
      const open = (await tx.query<{ id: string; sensei_id: string; status: string; progress_quantity: number; target_quantity: number }>(
        MISSIONS_SQL.lockOpen, [playerId])).rows[0];
      const levelBefore = (await tx.query<{ level: number }>(MISSIONS_SQL.playerLevel, [playerId])).rows[0]?.level ?? 1;

      // 1. Missão do Mestre com o objetivo completo: entrega (submit) e o Mestre aprova.
      //    O trigger do submit confere o progresso de novo: o banco é a última palavra.
      let finishedNpcMission = false;
      if (open && open.sensei_id === NPC_SENSEI_ID && (open.status === 'submitted' || open.progress_quantity >= open.target_quantity)) {
        if (open.status === 'active') await tx.query(SQL.submitMission, [open.id]);
        await tx.query(SQL.insertEvaluation, [open.id, NPC_SENSEI_ID, true, 5, NPC_MISSION.feedback]);
        finishedNpcMission = true;
      }

      // 2. Sala de Missões: entrega todo pergaminho aprovado (XP e título pelo trigger do resgate).
      const scrolls = (await tx.query<{ scroll_id: string; mission_id: string; sensei_id: string; sensei_name: string; xp_reward: number; title_name: string | null }>(
        MISSIONS_SQL.approvedScrolls, [playerId])).rows;
      const rewards: MissionReward[] = [];
      for (const s of scrolls) {
        const redemption = (await tx.query<{ id: string }>(SQL.insertRedemption, [s.scroll_id])).rows[0]!;
        const credited = (await tx.query<{ title_name: string | null }>(SQL.redemptionReward, [s.mission_id, redemption.id])).rows[0];
        const fromNpc = s.sensei_id === NPC_SENSEI_ID;
        rewards.push({
          missionId: s.mission_id,
          senseiName: fromNpc ? 'Mestre' : s.sensei_name,
          fromNpc,
          xp: s.xp_reward,
          title: s.title_name,
          titleNew: credited?.title_name != null,
        });
      }

      const stillOpen = open && !finishedNpcMission ? open : undefined;
      if (rewards.length > 0) {
        // O resgate já somou o XP (trigger): aqui só lê o resultado (soma 0 de XP e de ryō).
        // levels_gained aqui sai 0: o trigger já subiu o nível no resgate. Comparamos com o de antes.
        const p = (await tx.query<GrantRow>(GRANT_XP_SQL, [playerId, 0, 0])).rows[0]!;
        return {
          kind: 'rewarded', rewards, ...grantResult(p), levelsGained: p.level - levelBefore,
          mission: stillOpen ? await byId(tx, stillOpen.id) : null,
        };
      }
      if (stillOpen) {
        return { kind: stillOpen.sensei_id === NPC_SENSEI_ID ? 'in_progress' : 'other_sensei', mission: await byId(tx, stillOpen.id) };
      }

      // 3. Sem missão: o Mestre cria uma (mesmo INSERT do POST /missions, com ele de sensei).
      try {
        const created = (await tx.query<{ id: string }>(SQL.createMission, [
          NPC_SENSEI_ID, playerId, NPC_MISSION.missionType, NPC_MISSION.difficulty,
          NPC_MISSION.targetCode, NPC_MISSION.targetQuantity, null,
        ])).rows[0]!;
        return { kind: 'assigned', mission: await byId(tx, created.id) };
      } catch (err) {
        const e = pgError(err);
        if (e.constraint === 'rule_trainee_rank') throw new Outcome({ kind: 'rank_too_high' });
        // NPC ausente (FK) ou catálogo ausente: a migração v4 não rodou.
        if (e.constraint === 'rule_catalog_active' || e.code === '23503') throw new Outcome({ kind: 'unavailable' });
        throw err;
      }
    });
  }

  return {
    async current(playerId) {
      const row = (await db.query<MissionRow>(MISSIONS_SQL.current, [playerId])).rows[0];
      return row ? missionView(row) : null;
    },

    async talk(playerId) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await talkOnce(playerId);
        } catch (err) {
          if (err instanceof Outcome) return err.outcome;
          // Dois toques ao mesmo tempo (ex.: duas abas) criaram a missão juntos: o índice
          // ux_sensei_missions_trainee_open barrou o segundo. Tenta de novo: agora ela existe.
          if (pgError(err).constraint === 'ux_sensei_missions_trainee_open' && attempt === 0) continue;
          throw err;
        }
      }
    },

    async recordKill(playerId, monsterType) {
      const row = (await db.query<MissionRow>(MISSIONS_SQL.recordKill, [playerId, monsterType])).rows[0];
      return row ? missionView(row) : null;
    },

    async create(senseiId, traineeId, difficulty, quantity) {
      try {
        const created = (await db.query<{ id: string }>(SQL.createMission, [
          senseiId, traineeId, PLAYER_MISSION.missionType, difficulty, PLAYER_MISSION.targetCode, quantity, null,
        ])).rows[0]!;
        return { kind: 'created', mission: await byId(db, created.id) };
      } catch (err) {
        return refusal(err);
      }
    },

    async deliver(traineeId, senseiId) {
      try {
        return await withTransaction(db, async (tx): Promise<DeliverOutcome> => {
          const open = (await tx.query<{ id: string; sensei_id: string; status: string; progress_quantity: number; target_quantity: number }>(
            MISSIONS_SQL.lockOpen, [traineeId])).rows[0];
          if (!open || open.sensei_id !== senseiId) return { kind: 'no_mission' };
          if (open.status === 'submitted') return { kind: 'already_submitted', mission: await byId(tx, open.id) };
          if (open.progress_quantity < open.target_quantity) return { kind: 'incomplete', mission: await byId(tx, open.id) };
          await tx.query(SQL.submitMission, [open.id]);   // o trigger confere meta e prazo de novo
          return { kind: 'submitted', mission: await byId(tx, open.id) };
        });
      } catch (err) {
        return refusal(err);
      }
    },

    async evaluate(evaluatorId, missionId, approved, score) {
      try {
        return await withTransaction(db, async (tx): Promise<EvaluateOutcome> => {
          await tx.query(SQL.insertEvaluation, [missionId, evaluatorId, approved, score, null]);
          // Exame Chunin aprovado: o trigger da v7 já promoveu o aprendiz. Devolve o rank de agora.
          const people = (await tx.query<{ trainee_id: string; rank_code: string; rank_name: string; can_be_sensei: boolean }>(
            MISSIONS_SQL.missionPeople, [missionId])).rows[0]!;
          return {
            kind: 'evaluated', approved, traineeId: people.trainee_id, mission: await byId(tx, missionId),
            traineeRank: { code: people.rank_code, name: people.rank_name, canBeSensei: people.can_be_sensei },
          };
        });
      } catch (err) {
        return refusal(err);
      }
    },

    async pendingEvaluations(senseiId) {
      const { rows } = await db.query<MissionRow & { trainee_id: string; trainee_name: string }>(MISSIONS_SQL.pendingEvaluations, [senseiId]);
      return rows.map((r) => ({ missionId: r.id, trainee: { id: r.trainee_id, username: r.trainee_name }, mission: missionView(r) }));
    },

    async senseiOptions() {
      if (!optionsCache || Date.now() - optionsCache.at > 5 * 60_000) {
        const { rows } = await db.query<{ code: string; name: string; xp_reward: number; title_name: string | null }>(
          MISSIONS_SQL.senseiOptions, [NPC_MISSION.difficulty]);
        optionsCache = { at: Date.now(), list: rows.map((r) => ({ code: r.code, name: r.name, xp: r.xp_reward, title: r.title_name })) };
      }
      return optionsCache.list.map((d) => ({ ...d }));
    },
  };
}
