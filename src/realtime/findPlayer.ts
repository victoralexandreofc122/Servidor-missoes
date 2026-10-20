import type { Queryable } from '../db.js';
import { isSkillList, type JoiningPlayer } from './gameWorld.js';

/** Tudo que o jogo precisa do jogador. Uma consulta por conexão, nunca por passo. */
export const FIND_PLAYER_SQL = `
  SELECT p.id, p.username, p.total_xp, r.code AS rank_code, r.name AS rank_name, r.can_be_sensei,
         p.level, p.stat_points, p.attr_vitality, p.attr_chakra_max, p.attr_chakra_regen,
         p.attr_agility, p.attr_taijutsu, p.attr_ninjutsu, p.kit_a, p.kit_b
    FROM game.players p
    JOIN game.ranks r ON r.id = p.current_rank_id
   WHERE p.id = $1`;

interface Row {
  id: string;
  username: string;
  total_xp: string;
  rank_code: string;
  rank_name: string;
  can_be_sensei: boolean;
  level: number;
  stat_points: number;
  attr_vitality: number;
  attr_chakra_max: number;
  attr_chakra_regen: number;
  attr_agility: number;
  attr_taijutsu: number;
  attr_ninjutsu: number;
  kit_a: string[];
  kit_b: string[];
}

export function makeFindPlayer(db: Queryable) {
  return async (playerId: string): Promise<JoiningPlayer | undefined> => {
    const { rows } = await db.query<Row>(FIND_PLAYER_SQL, [playerId]);
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      username: row.username,
      xp: Number(row.total_xp),
      rank: { code: row.rank_code, name: row.rank_name },
      canBeSensei: row.can_be_sensei,
      level: row.level,
      statPoints: row.stat_points,
      attributes: {
        vitality: row.attr_vitality,
        chakraMax: row.attr_chakra_max,
        chakraRegen: row.attr_chakra_regen,
        agility: row.attr_agility,
        taijutsu: row.attr_taijutsu,
        ninjutsu: row.attr_ninjutsu,
      },
      // O banco já garante (ck_players_kits); a checagem aqui só protege o tipo.
      kits: { A: isSkillList(row.kit_a) ? row.kit_a : [], B: isSkillList(row.kit_b) ? row.kit_b : [] },
    };
  };
}
