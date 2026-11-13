import type { Queryable } from '../db.js';
import { isSkillList, type JoiningPlayer } from './gameWorld.js';
import { CLASSES, type ClassCode } from './jutsus.js';
import { normalizeAppearance } from './appearance.js';
import { CLANS, type Clan } from './jutsusClasses.js';

const isClass = (c: unknown): c is ClassCode => typeof c === 'string' && (CLASSES as readonly string[]).includes(c);

/** Tudo que o jogo precisa do jogador. Uma consulta por conexão, nunca por passo. */
export const FIND_PLAYER_SQL = `
  SELECT p.id, p.username, p.total_xp, r.code AS rank_code, r.name AS rank_name, r.can_be_sensei,
         p.level, p.stat_points, p.attr_vitality, p.attr_chakra, p.is_admin,
         p.attr_agility, p.attr_taijutsu, p.attr_ninjutsu, p.attr_weapons, p.kit_a, p.kit_b, p.appearance, p.clan, p.clan_mark, p.rite_progress,
         p.tutorial_step, p.ryo, p.equipped_weapon, p.equipped_scroll, p.equipped_shoes, p.equipped_accessory, c.primary_class, c.secondary_class,
         COALESCE((SELECT json_object_agg(j.jutsu_code, j.usage_count) FROM game.player_jutsus j WHERE j.player_id = p.id), '{}'::json) AS jutsus,
         COALESCE((SELECT json_object_agg(i.item_code, i.quantity) FROM game.player_items i WHERE i.player_id = p.id), '{}'::json) AS items,
         EXISTS (SELECT 1 FROM game.hokage_candidates h WHERE h.player_id = p.id) AS kage_candidate
    FROM game.players p
    JOIN game.ranks r ON r.id = p.current_rank_id
    LEFT JOIN game.player_classes c ON c.player_id = p.id
   WHERE p.id = $1`;

export const MANUAL_SQL = `SELECT chapter, read_at IS NOT NULL AS read FROM game.player_tutorial WHERE player_id = $1`;

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
  attr_chakra: number;
  is_admin: boolean;
  attr_agility: number;
  attr_taijutsu: number;
  attr_ninjutsu: number;
  attr_weapons: number;
  clan?: string | null;
  clan_mark?: string | null;
  rite_progress?: number | null;
  kit_a: string[];
  kit_b: string[];
  appearance: unknown;
  tutorial_step: number;
  ryo: string;
  equipped_weapon: string | null;
  equipped_scroll: string | null;
  equipped_shoes: string | null;
  equipped_accessory: string | null;
  primary_class: string | null;
  secondary_class: string | null;
  jutsus: Record<string, number>;
  items: Record<string, number>;
  kage_candidate: boolean;
}

export function makeFindPlayer(db: Queryable) {
  return async (playerId: string): Promise<JoiningPlayer | undefined> => {
    const { rows } = await db.query<Row>(FIND_PLAYER_SQL, [playerId]);
    const row = rows[0];
    if (!row) return undefined;
    // v38 (migração v26): o Pergaminho do Mestre. Sem a tabela ainda (banco antes da v26): tudo fechado, o jogo segue.
    const manual = await db.query<{ chapter: string; read: boolean }>(MANUAL_SQL, [playerId])
      .then((r) => ({ unlocked: r.rows.map((x) => x.chapter), read: r.rows.filter((x) => x.read).map((x) => x.chapter) }))
      .catch((err: { code?: string }) => { if (err?.code === '42P01') return undefined; throw err; });
    return {
      ...(manual ? { manual } : {}),
      id: row.id,
      username: row.username,
      xp: Number(row.total_xp),
      rank: { code: row.rank_code, name: row.rank_name },
      canBeSensei: row.can_be_sensei,
      level: row.level,
      statPoints: row.stat_points,
      attributes: {
        vitality: row.attr_vitality,
        chakra: row.attr_chakra,
        taijutsu: row.attr_taijutsu + (row.attr_agility ?? 0),   // v53: a Agilidade virou Taijutsu
        ninjutsu: row.attr_ninjutsu,
        weapons: row.attr_weapons,
      },
      // O banco já garante (ck_players_kits); a checagem aqui só protege o tipo.
      kits: { A: isSkillList(row.kit_a) ? row.kit_a : [], B: isSkillList(row.kit_b) ? row.kit_b : [] },
      // NULL = ainda não criou o personagem (o cliente abre o Criador). Visual antigo (5 cores, até a v8): convertido.
      appearance: row.appearance == null ? null : normalizeAppearance(row.appearance),
      // v7: tutorial, ryō, inventário, classes e jutsus (uso de cada um).
      tutorialStep: row.tutorial_step,
      ryo: Number(row.ryo),
      items: { ...row.items },
      equipped: row.equipped_weapon,
      equippedScroll: row.equipped_scroll,
      // v12: sapato calçado (null = descalço).
      equippedShoes: row.equipped_shoes,
      // v14: acessório por cima da roupa (o casaco).
      equippedAccessory: row.equipped_accessory,
      // v8: Modo Administrador (só por SQL; os comandos /admin conferem de novo no banco).
      isAdmin: row.is_admin,
      classes: { primary: isClass(row.primary_class) ? row.primary_class : null, secondary: isClass(row.secondary_class) ? row.secondary_class : null },
      jutsus: { ...row.jutsus },
      kageCandidate: row.kage_candidate,
      // v30 (migração v19): a linhagem (null = ainda não despertou)
      clan: (CLANS as readonly string[]).includes(row.clan ?? '') ? (row.clan as Clan) : null,
      clanMark: (CLANS as readonly string[]).includes(row.clan_mark ?? '') ? (row.clan_mark as Clan) : null,
      riteProgress: typeof row.rite_progress === 'number' ? row.rite_progress : null,
    };
  };
}
