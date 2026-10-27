import { z } from 'zod';

/*
 * Visual do personagem (v9: sprites em camadas, pasta arte/personagem-chibi).
 *
 * O jogador escolhe NOMES de paleta, nunca cor livre: pele só em tons reais (do mais escuro ao mais
 * claro), cabelo, olhos e roupas nas cores prontas. O cliente tem as rampas de cada nome
 * (public/spriteData.js); aqui ficam só os nomes válidos e a cor base de cada um (para converter o
 * visual antigo de 5 cores "#rrggbb", gravado até a v8).
 *
 * Conjunto da vila e bandana: as cores são as da VILA (travadas; o jogador escolhe a vila, não a cor).
 */

export const SKIN_BASE = {
  ebano: '#543426',
  cacau: '#6e4630',
  castanho: '#8c5c3e',
  canela: '#aa744e',
  caramelo: '#c68e62',
  oliva: '#d4a676',
  mel: '#e6ba8c',
  pessego: '#f4cea6',
  claro: '#fdddb8',
  porcelana: '#ffecdc',
} as const;

export const HAIR_BASE = {
  castanho: '#8e4e36',
  preto: '#262a36',
  castanho_escuro: '#58362a',
  ruivo: '#b24628',
  laranja: '#e47a30',
  loiro: '#e2b85c',
  platinado: '#eee0ba',
  branco: '#e8e8f2',
  cinza: '#9292a0',
  azul: '#3e68ce',
  azul_marinho: '#2c3874',
  verde: '#489854',
  rosa: '#ec84ac',
  roxo: '#8052b6',
  vermelho: '#c02a34',
  turquesa: '#2caaac',
} as const;

export const EYE_BASE = {
  azul: '#2c62b4',
  azul_claro: '#4898de',
  verde: '#349652',
  esmeralda: '#168e70',
  avela: '#927a3a',
  castanho: '#7c4a2a',
  castanho_escuro: '#4e2e22',
  ambar: '#d49628',
  vermelho: '#ca2a2a',
  roxo: '#843eb6',
  rosa: '#de5c98',
  cinza: '#848a98',
  preto: '#34303e',
  turquesa: '#1eaab6',
} as const;

/** Cores novas da v26 (o casaco da referência): fora da conversão do visual antigo. */
export const V26_CLOTH: readonly string[] = ['petroleo', 'ameixa'];

/** Cores de roupa que o jogador escolhe (camisa e calça básicas). Os metais ficam só para itens. */
export const CLOTH_BASE = {
  azul_marinho: '#363e6e',
  verde_colete: '#607e3e',
  creme: '#eae4d8',
  vermelho: '#c02e32',
  vinho: '#7c2036',
  laranja: '#e87a2a',
  amarelo: '#eac23a',
  verde: '#60ac46',
  verde_escuro: '#2a6040',
  azul: '#3470d2',
  azul_celeste: '#68ace6',
  roxo: '#7a48ac',
  rosa: '#e67aa2',
  marrom: '#7c5234',
  branco: '#ececf2',
  cinza: '#80828e',
  preto: '#34323e',
  turquesa: '#28a0a0',
  petroleo: '#2a6a82',
  ameixa: '#5a2a41',
} as const;

type Names<T> = [keyof T & string, ...(keyof T & string)[]];
const names = <T extends object>(o: T) => Object.keys(o) as Names<T>;

export const SKIN_TONES = names(SKIN_BASE);
export const HAIR_COLORS = names(HAIR_BASE);
export const EYE_COLORS = names(EYE_BASE);
export const CLOTH_COLORS = names(CLOTH_BASE);
export const GENDERS = ['m', 'f'] as const;
export const HAIR_STYLES = ['espetado', 'longo_lateral', 'baguncado'] as const;
export const EYE_STYLES = ['masculino', 'cilios'] as const;
/**
 * basica = camisa + calça nas cores do jogador; vila = conjunto da vila (cores da vila); casaco = casaco com capuz na
 * cor da camisa, com a blusa de dentro cor de ameixa e a calça na cor da calça (v26).
 */
export const OUTFITS = ['basica', 'vila', 'casaco'] as const;
/** As quatro vilas: Folha, Névoa, Nuvem e Areia. A Pedra (vila_2) saiu na v13; os códigos das outras não mudaram. */
export const VILLAGES = ['vila_1', 'vila_3', 'vila_4', 'vila_5'] as const;
export type Village = (typeof VILLAGES)[number];
/**
 * Vilas que dá para escolher no Criador (design, seção 11.1): só a do Arco 1 até o Arco 2 abrir as outras,
 * cada uma com o seu mapa. Quem já tinha escolhido outra continua com ela.
 */
export const OPEN_VILLAGES: readonly Village[] = ['vila_1'];

/** A vila pode ir no visual? Aberta, ou a que o jogador já tinha (escolhida antes de travar). */
export function villageAllowed(village: Village, current: Village | undefined): boolean {
  return OPEN_VILLAGES.includes(village) || village === current;
}

export const AppearanceSchema = z.object({
  v: z.literal(2),
  gender: z.enum(GENDERS),
  skin: z.enum(SKIN_TONES),
  hairStyle: z.enum(HAIR_STYLES),
  hairColor: z.enum(HAIR_COLORS),
  eyeStyle: z.enum(EYE_STYLES),
  eyeColor: z.enum(EYE_COLORS),
  outfit: z.enum(OUTFITS),
  shirtColor: z.enum(CLOTH_COLORS),
  pantsColor: z.enum(CLOTH_COLORS),
  bandana: z.boolean(),
  village: z.enum(VILLAGES),
}).strict();
export type Appearance = z.infer<typeof AppearanceSchema>;

/** Cor "#rrggbb" do visual antigo (o <input type="color"> mandava assim). */
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((c) => c.toLowerCase());
/** Visual antigo (até a v8): 5 cores livres. Ainda aceito, e convertido para o mais parecido. */
export const LegacyAppearanceSchema = z.object({ skin: hexColor, hair: hexColor, shirt: hexColor, pants: hexColor, cape: hexColor }).strict();
export type LegacyAppearance = z.infer<typeof LegacyAppearanceSchema>;

/** Visual de quem ainda não criou o personagem (os outros veem este boneco). */
export const DEFAULT_APPEARANCE: Readonly<Appearance> = {
  v: 2, gender: 'm', skin: 'claro', hairStyle: 'espetado', hairColor: 'castanho_escuro', eyeStyle: 'masculino',
  eyeColor: 'castanho', outfit: 'basica', shirtColor: 'azul_marinho', pantsColor: 'cinza', bandana: false, village: 'vila_1',
};

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Nome da paleta com a cor base mais perto de `hex` (distância RGB com peso de luminância). */
export function nearestName<T extends Record<string, string>>(table: T, hex: string): keyof T & string {
  const [r, g, b] = rgb(hex);
  let best = '';
  let bestD = Infinity;
  for (const [name, base] of Object.entries(table)) {
    const [r2, g2, b2] = rgb(base);
    const d = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best as keyof T & string;
}

/** Visual antigo (5 cores) -> visual novo, com as cores da paleta mais parecidas. A capa não existe mais. */
/** Cores de roupa da conversão do visual antigo: as de antes da v26 (as novas não mudam quem já foi convertido). */
const LEGACY_CLOTH = Object.fromEntries(Object.entries(CLOTH_BASE).filter(([name]) => !V26_CLOTH.includes(name))) as Record<string, string>;

export function fromLegacy(old: LegacyAppearance): Appearance {
  return {
    ...DEFAULT_APPEARANCE,
    skin: nearestName(SKIN_BASE, old.skin),
    hairColor: nearestName(HAIR_BASE, old.hair),
    shirtColor: nearestName(LEGACY_CLOTH, old.shirt) as Appearance['shirtColor'],
    pantsColor: nearestName(LEGACY_CLOTH, old.pants) as Appearance['pantsColor'],
  };
}

/** O que veio do banco ou do cliente (novo OU antigo) -> visual novo; inválido -> null. */
export function normalizeAppearance(raw: unknown): Appearance | null {
  const now = AppearanceSchema.safeParse(raw);
  if (now.success) return now.data;
  const old = LegacyAppearanceSchema.safeParse(raw);
  return old.success ? fromLegacy(old.data) : null;
}

/** set_appearance: aceita o visual novo e, por um tempo, o antigo (cliente em cache); grava sempre o novo. */
export const IncomingAppearanceSchema = z.union([AppearanceSchema, LegacyAppearanceSchema.transform(fromLegacy)]);
