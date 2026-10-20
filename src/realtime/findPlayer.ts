import type { Queryable } from '../db.js';
import { isSkillList, type JoiningPlayer } from './gameWorld.js';
import { CLASSES, type ClassCode } from './jutsus.js';
import { AppearanceSchema } from './protocol.js';

const isClass = (c: unknown): c is ClassCode => typeof c === 'string' && (CLASSES as readonly string[]).includes(c);

/** Tudo que o jogo precisa do jogador. Uma consulta por conexão, nunca por passo. */
export const FIND_PLAYER_SQL = `
  SELECT p.id, p.username, p.total_xp, r.code AS rank_code, r.name AS rank_name, r.can_be_sensei,
         p.level, p.stat_points, p.attr_vitality, p.attr_chakra_max, p.attr_chakra_regen,
         p.attr_agility, p.attr_taijutsu, p.attr_ninjutsu, p.attr_weapons, p.kit_a, p.kit_b, p.appearance,
         p.tutorial_step, p.ryo, p.equipped_weapon, c.primary_class, c.secondary_class,
         COALESCE((SELECT json_object_agg(j.jutsu_code, j.usage_count) FROM game.player_jutsus j WHERE j.player_id = p.id), '{}'::json) AS jutsus,
         COALESCE((SELECT json_object_agg(i.item_code, i.quantity) FROM game.player_items i WHERE i.player_id = p.id), '{}'::json) AS items,
         EXISTS (SELECT 1 FROM game.hokage_candidates h WHERE h.player_id = p.id) AS hokage_candidate
    FROM game.players p
    JOIN game.ranks r ON r.id = p.current_rank_id
    LEFT JOIN game.player_classes c ON c.player_id = p.id
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
  attr_weapons: number;
  kit_a: string[];
  kit_b: string[];
  appearance: unknown;
  tutorial_step: number;
  ryo: string;
  equipped_weapon: string | null;
  primary_class: string | null;
  secondary_class: string | null;
  jutsus: Record<string, number>;
  items: Record<string, number>;
  hokage_candidate: boolean;
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
        weapons: row.attr_weapons,
      },
      // O banco já garante (ck_players_kits); a checagem aqui só protege o tipo.
      kits: { A: isSkillList(row.kit_a) ? row.kit_a : [], B: isSkillList(row.kit_b) ? row.kit_b : [] },
      // NULL = ainda não criou o personagem (o cliente abre o Criador).
      appearance: row.appearance == null ? null : (AppearanceSchema.safeParse(row.appearance).data ?? null),
      // v7: tutorial, ryō, inventário, classes e jutsus (uso de cada um).
      tutorialStep: row.tutorial_step,
      ryo: Number(row.ryo),
      items: { ...row.items },
      equipped: row.equipped_weapon,
      classes: { primary: isClass(row.primary_class) ? row.primary_class : null, secondary: isClass(row.secondary_class) ? row.secondary_class : null },
      jutsus: { ...row.jutsus },
      hokageCandidate: row.hokage_candidate,
    };
  };
}
