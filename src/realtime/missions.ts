import { withTransaction, type Db, type Queryable } from '../db.js';
import { SQL } from '../missions/sql.js';
import type { CombatConfig } from './config.js';
import type { MissionView, RankView } from './protocol.js';
import { GRANT_XP_SQL } from './progression.js';

/*
 * Missões de sensei no tempo real: o NPC Mestre e a contagem de abates.
 *
 * Tudo passa pelo ciclo do schema v2 (game.sensei_missions e companhia), com os MESMOS
 * comandos das rotas HTTP (src/missions/sql.ts) e os MESMOS triggers:
 *
 *   NPC atribui ........ SQL.createMission     (sensei = o NPC; XP e título vêm do catálogo)
 *   abate de monstro ... RECORD_KILL_SQL       (só missão 'active' do tipo DEFEAT_MONSTER)
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
  /** Pergaminho(s) entregue(s): XP e título já gravados. `mission` = o que ainda estiver em aberto. */
  | { kind: 'rewarded'; rewards: MissionReward[]; totalXp: number; rank: RankView; promoted: boolean; mission: MissionView | null }
  /** Rank do jogador não está abaixo do Mestre (regra rule_trainee_rank). */
  | { kind: 'rank_too_high' }
  /** Migração v4 não aplicada (sem NPC ou sem catálogo). */
  | { kind: 'unavailable' };

/** O que o GameWorld usa. Implementação com banco: makeMissions. */
export interface Missions {
  current(playerId: string): Promise<MissionView | null>;
  /** Conversa com o NPC Mestre (atribuir, ver progresso, concluir e entregar). */
  talk(playerId: string): Promise<TalkOutcome>;
  /** Abate de monstro. Devolve a missão atualizada, ou null se nenhuma missão contou o abate. */
  recordKill(playerId: string, monsterType: string): Promise<MissionView | null>;
}

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

export function makeMissions(db: Db, promotion: CombatConfig['promotion']): Missions {
  const byId = async (q: Queryable, id: string) => missionView((await q.query<MissionRow>(MISSIONS_SQL.byId, [id])).rows[0]!);

  async function talkOnce(playerId: string): Promise<TalkOutcome> {
    return withTransaction(db, async (tx) => {
      const open = (await tx.query<{ id: string; sensei_id: string; status: string; progress_quantity: number; target_quantity: number }>(
        MISSIONS_SQL.lockOpen, [playerId])).rows[0];

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
        // O resgate soma XP sem mexer no rank: aplica a mesma promoção do combate (soma 0).
        const p = (await tx.query<{ total_xp: string; rank_code: string; rank_name: string; promoted: boolean }>(
          GRANT_XP_SQL, [playerId, 0, promotion.fromRank, promotion.toRank, promotion.xp])).rows[0]!;
        return {
          kind: 'rewarded', rewards, totalXp: Number(p.total_xp), rank: { code: p.rank_code, name: p.rank_name }, promoted: p.promoted,
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
  };
}
