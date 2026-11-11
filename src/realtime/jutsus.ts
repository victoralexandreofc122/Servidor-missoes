/*
 * Classes e jutsus do Multiverso Ninja: o CATÁLOGO (fonte única). O servidor usa para o
 * combate; a migração v7 tem a mesma lista em game.classes / game.jutsus (o teste confere).
 *
 *  - 9 classes. Cada uma tem 4 jutsus, um por TIER (1 a 4). O tier 1 de cada classe tem o
 *    mesmo código da classe ('fire', 'water'...: os 7 jutsus que já existiam continuam iguais);
 *    os outros são '<classe>_2', '_3', '_4'.
 *  - 2 jutsus da Academia (tier 0, sem classe): Teleporte Curto e Substituição.
 *  - Cada jutsu tem uma MECÂNICA (a regra de combate em gameWorld.ts). Os tiers maiores usam a
 *    mesma mecânica do tier 1 da classe, com números maiores.
 *  - Nível do jutsu por USO (contado só pelo servidor): 100 usos = Nv 2, 500 = Nv 3, 2000 = Nv 4.
 */
import type { SkillConfig } from './config.js';
import { CAST_OF_EXISTING, CLAN_CODES, CLAN_JUTSUS, CLASS_V2, CLASS_V2_CODES } from './jutsusClasses.js';
import { FASE25, FASE25_CODES, FASE25_MASTERY } from './jutsusFase25.js';
import { MEC, MEC_CODES, MEC_MASTERY } from './jutsusMecanicas.js';

export const CLASSES = ['heal', 'shadow', 'illusion', 'stone', 'fire', 'water', 'taijutsu', 'weapons', 'lightning', 'wind'] as const;
export type ClassCode = (typeof CLASSES)[number];

export const CLASS_INFO: Readonly<Record<ClassCode, { name: string; icon: string; desc: string }>> = {
  heal: { name: 'Cura', icon: '✚', desc: 'Fecha feridas e mantém o grupo de pé.' },
  shadow: { name: 'Sombra', icon: '🌑', desc: 'Uma linha de sombra prende no chão o primeiro inimigo que toca.' },
  illusion: { name: 'Ilusão', icon: '🌀', desc: 'Engana a mente: todos em volta de você ficam atordoados. Do Labirinto Mental em diante, depois ficam em silêncio (sem jutsu).' },
  stone: { name: 'Pedra', icon: '⛰', desc: 'Pele de rocha: o próximo golpe perde força.' },
  fire: { name: 'Fogo', icon: '🔥', desc: 'Bola de fogo de longo alcance que explode no primeiro inimigo, queimando quem está perto.' },
  water: { name: 'Água', icon: '💧', desc: 'Jatos em cone que empurram e deixam o inimigo molhado (o Relâmpago num alvo molhado bate mais forte).' },
  taijutsu: { name: 'Taijutsu', icon: '👊', desc: 'Avança até o inimigo e golpeia: socos e chutes devastadores.' },
  weapons: { name: 'Armas', icon: '🗡️', desc: 'Kunais em leque: o atributo Armas aumenta o dano.' },
  lightning: { name: 'Relâmpago', icon: '⚡', desc: 'Raio em linha reta que paralisa o primeiro inimigo por um instante. Num alvo molhado: combo, 30% a mais.' },
  // v30: a classe nova da adaptação (revisao_egm/jutsus/adapt_raiton_futon.md)
  wind: { name: 'Vento', icon: '🌪️', desc: 'Empurra, corta de longe e joga o inimigo para o alto. Rajadas rápidas e escudo contra tiros.' },
};

/** Regras de combate. Os jutsus de classe usam a do tier 1; os da Academia têm as próprias. */
export type Mechanic = ClassCode | 'teleport' | 'substitution';

/**
 * v29 (Jutsus v2, entrega 0): a FORMA do jutsu (como ele sai e o que acerta). Hoje cada classe tem uma forma só; os
 * jutsus novos do docs/jutsus-v2.md escolhem a sua (cone, anel, zona no chão, leque, buff, escudo, avanço, aviso...).
 */
export type JutsuForm =
  | 'linha_explode'   // projétil em linha que explode no primeiro alvo (Bola de Fogo)
  | 'cone'            // cone na frente (Jato d'Água)
  | 'avanco'          // avança até o alvo e golpeia (Taijutsu)
  | 'anel'            // círculo em volta de quem lança (Ilusão)
  | 'linha_prende'    // linha que prende o primeiro alvo (Sombra)
  | 'escudo'          // protege quem lança (Pedra)
  | 'cura'            // cura si ou um aliado (Cura)
  | 'trilhas'         // projéteis em trilhas paralelas (Kunais)
  | 'linha_raio'      // linha instantânea (Relâmpago)
  | 'teleporte' | 'substituicao'
  // v29 (Jutsus v2, Fogo)
  | 'cone_fogo'       // cone que queima (Karyū Endan, Gōka Messhitsu)
  | 'linha_fogo'      // linha instantânea que acerta o primeiro (Hibashiri, Ryūka)
  | 'leque'           // 3 ou 4 projéteis em leque (Hōsenka)
  | 'aviso_em_volta'  // aviso no chão em volta de quem lança, detona depois (Haisekishō)
  | 'nuvem_detona'    // nuvem que detona ao acabar (Kasumi Enbu)
  | 'buff_basico'     // Ataque Básico mais forte por um tempo (Lâmina de Fogo, Punho de Rocha, Despertar do Corpo)
  | 'meteoros'        // vários golpes avisados numa área (Chuva de Meteoros)
  // v30 (as outras classes, jutsusClasses.ts)
  | 'projetil'        // projétil reto que acerta o primeiro (Dragão d'Água, Shuriken do Trovão)
  | 'linha'           // linha instantânea que acerta o primeiro, com efeito (Estaca, Cárcere Líquido)
  | 'alvo'            // o alvo focado ou o mais perto no alcance (Prisão de Pilares, Ciclo Sem Fim)
  | 'anel_golpe'      // círculo em volta com dano e efeito (Onda de Choque, Chute Ciclone)
  | 'cone_golpe'      // cone na frente com dano, vários golpes e efeito (Rasteira, Punho do Céu)
  | 'zona'            // zona no chão por um tempo (Xarope, Pântano, Domínio das Sombras, Lâminas Flutuantes)
  | 'investida'       // avança e golpeia na chegada, com efeito (Investida Elétrica, Chute Ascendente)
  | 'recuo'           // avanço sem dano, para a frente ou para trás (Impulso Estático, Reflexo Tático)
  | 'aviso'           // golpe avisado no chão onde se mira (Julgamento do Trovão, Kunai Explosiva)
  | 'limpeza'         // tira efeitos de si (Desintoxicação, Dissipação)
  | 'cura_tempo'      // cura ao longo do tempo em si (Renovação Celular)
  | 'impacto'         // soco colado: o alvo leva tudo, quem está em volta metade (Punho Sísmico)
  | 'ricochete'       // linha que salta para o próximo alvo (Lança Saltadora)
  | 'agarre'          // linha que prende vários alvos (Rede de Sombra)
  | 'palma'           // canalização: cura o aliado colado (ou a si, pela metade) no fim (Palma Curadora)
  | 'bumerangue'      // projétil que vai, atravessa e volta para a mão (Shuriken Colossal)
  | 'faixa'           // linha larga: acerta todos numa faixa (Lâmina em Arco)
  | 'escudo_vida'     // escudo com vida (absorve dano), um por vez, até 25% da vida (Véu de Vento)
  | 'transformacao'   // escudo + buff de Básico por um tempo e um golpe no fim (Colosso Espectral)
  | 'invocacao'       // invocação aliada à frente (Duplo de Água, Golem de Terra)
  | 'marca'           // v35: marca um alvo; o próximo golpe de quem marcou dói mais e deixa lento (Sombra Faminta)
  | 'forma_sombra'    // v35: vira sombra: ignora projéteis, mais rápido, quem ele atravessa leva dano e fica lento (Forma Umbral)
  | 'contra'          // v51: guarda de contra-ataque: anula o próximo golpe e devolve dano e atordoamento (Resposta da Montanha)
  | 'reflexo'         // v51: devolve o primeiro projétil que bater (Espelho de Ar)
  | 'muro';           // muro à frente: bloqueia passagem e projéteis, tem vida (Muralha de Terra, Muro de Água)

export const FORM_OF_MECHANIC: Readonly<Record<Mechanic, JutsuForm>> = {
  fire: 'linha_explode', water: 'cone', taijutsu: 'avanco', illusion: 'anel', shadow: 'linha_prende', stone: 'escudo',
  heal: 'cura', weapons: 'trilhas', lightning: 'linha_raio', teleport: 'teleporte', substitution: 'substituicao',
  wind: 'cone_golpe',   // v30: Rajada Aberta (cone curto que empurra)
};

export interface JutsuDef {
  code: JutsuCode;
  name: string;
  /** null = jutsu da Academia (todo mundo aprende). */
  class: ClassCode | null;
  /** 0 = Academia; 1 a 4 = tier da classe (nível de Extração que ensina). */
  tier: 0 | 1 | 2 | 3 | 4;
  mechanic: Mechanic;
  /** Como ele sai (v29). Os de hoje seguem a forma da mecânica. */
  form: JutsuForm;
  /** v30: jutsu de clã (linhagem): não sai na Extração, chega pelo nível depois do despertar. */
  clan?: 'rubro' | 'umbra';
  /**
   * Números próprios deste jutsu (v29). Sem eles, o tier 2 a 4 é o tier 1 da classe mais forte (`skillConfig`).
   * Com eles, valem estes (os jutsus novos do docs/jutsus-v2.md).
   */
  numbers?: Partial<SkillConfig>;
}

/** Nomes originais (tier 1 a 4) de cada classe. */
const NAMES: Readonly<Record<ClassCode, readonly [string, string, string, string]>> = {
  heal: ['Cura', 'Bálsamo Verde', 'Fonte Serena', 'Toque da Vida'],
  shadow: ['Sombra', 'Teia das Sombras', 'Mãos da Noite', 'Eclipse'],
  illusion: ['Ilusão', 'Névoa Hipnótica', 'Labirinto Mental', 'Cárcere dos Sonhos'],
  stone: ['Pedra', 'Pele de Granito', 'Muralha de Rocha', 'Coração de Montanha'],
  fire: ['Fogo', 'Muralha de Chamas', 'Fênix Ardente', 'Inferno Escarlate'],
  water: ['Água', 'Onda Gêmea', 'Fúria do Oceano', 'Maré Sem Fim'],
  taijutsu: ['Taijutsu', 'Chute Ciclone', 'Cem Golpes', 'Punho do Céu'],
  weapons: ['Chuva de Kunais', 'Leque de Shurikens', 'Tempestade de Lâminas', 'Arsenal Celeste'],
  lightning: ['Faísca Rasante', 'Lança Trovão', 'Corrente Elétrica', 'Julgamento do Raio'],
  wind: ['Rajada Aberta', 'Balas de Vento', 'Tornado Cortante', 'Disco do Furacão'],
};

export const ACADEMY_JUTSUS = ['teleport', 'substitution'] as const;
/** Código de jutsu: os 2 da Academia, o tier 1 de cada classe ('fire') e os tiers 2 a 4 ('fire_2'). */
export type JutsuCode = (typeof ACADEMY_JUTSUS)[number] | ClassCode | `${ClassCode}_${2 | 3 | 4}` | (typeof V2_CODES)[number] | (typeof CLASS_V2_CODES)[number] | (typeof CLAN_CODES)[number] | (typeof FASE25_CODES)[number] | (typeof MEC_CODES)[number];

/** v29 (Jutsus v2): jutsus novos (códigos novos). Os de hoje mantêm os códigos (o banco e os kits guardam). */
export const V2_CODES = ['fire_endan', 'fire_kasumi', 'fire_hibashiri', 'fire_ryuka', 'fire_haiseki', 'fire_lamina', 'fire_hotan'] as const;

const P = (tier: number) => [1, 1.45, 2, 2.8][tier - 1]!;   // TIER.power (o dano contra monstros = base x isto)
const dmgOf = (base: number, tier: number) => Math.round(base * P(tier));

/**
 * v29 (Jutsus v2, entrega 2): o Fogo inteiro do documento do Victor (revisao_egm/jutsus/adapt_katon_suiton.md e
 * conjuracao_tempos.md). Os tiers 2 a 4 de hoje (fire_2..4) viram jutsus próprios (o código fica: o banco e os kits
 * guardam); 7 códigos novos. Os nomes visíveis são os em português da adaptação (o nome da série fica no comentário):
 * a Fase 1 do roadmap tira os nomes da série do jogo, então os jutsus novos já nascem sem eles.
 * `castMs` = selos (conjuracao_tempos.md); a recompensa da conjuração entra em `skillConfig` (castReward).
 */
const FIRE_V2: Readonly<Record<string, Pick<JutsuDef, 'name' | 'tier' | 'form' | 'numbers'>>> = {
  // Karyū Endan: cone curto que queima
  fire_endan: { name: 'Sopro Incinerador', tier: 1, form: 'cone_fogo',
    numbers: { base: 20, damage: dmgOf(20, 1), cost: 15, cooldownMs: 1500, range: 3, coneDeg: 70, burn: 2, burnMs: 2000, radius: undefined, speed: undefined } },
  // Kasumi Enbu no Jutsu: névoa à frente que detona sozinha no fim
  fire_kasumi: { name: 'Névoa Inflamável', tier: 1, form: 'nuvem_detona',
    numbers: { base: 18, damage: dmgOf(18, 1), cost: 20, cooldownMs: 8000, radius: 2.5, durationMs: 3000, castMs: 200, burn: 0, range: 0 } },
  // Hibashiri: chama rasteira em linha, acerta o primeiro
  fire_hibashiri: { name: 'Linha de Fogo Rasante', tier: 1, form: 'linha_fogo',
    numbers: { base: 22, damage: dmgOf(22, 1), cost: 15, cooldownMs: 2000, range: 5, burn: 0, radius: 0 } },
  // Hōsenka no Jutsu: leque de 3 bolas (4 no nível 2); cada alvo leva no máximo 2
  fire_2: { name: 'Revoada de Brasas', tier: 2, form: 'leque',
    numbers: { base: 10, damage: dmgOf(10, 2), cost: 27, cooldownMs: 2300, range: 7, shots: 3, speed: 14, radius: 0, burn: 0, castMs: 200 } },
  // Ryūka no Jutsu: raio de fogo instantâneo em linha 8
  fire_ryuka: { name: 'Lança de Fogo', tier: 2, form: 'linha_fogo',
    numbers: { base: 26, damage: dmgOf(26, 2), cost: 27, cooldownMs: 3000, range: 8, burn: 0, radius: 0, castMs: 300 } },
  // Haisekishō: cinzas em volta de quem lança; detonam depois de 1 s (o aviso já é o tempo de reação: sem selos)
  fire_haiseki: { name: 'Cinzas Detonantes', tier: 2, form: 'aviso_em_volta',
    numbers: { base: 24, damage: dmgOf(24, 2), cost: 30, cooldownMs: 7000, radius: 2, durationMs: 1000, burn: 0, range: 0 } },
  // Katon: Lâmina de Fogo: o buff de Básico (um por vez, +15%, 5 s)
  fire_lamina: { name: 'Lâmina de Fogo', tier: 2, form: 'buff_basico',
    numbers: { cost: 20, cooldownMs: 15_000, durationMs: 5000, basicBuff: 0.15, damage: 0, burn: 0, range: 0, radius: 0 } },
  // Gōka Messhitsu: onda frontal larga. Custo 30 (o tier dava 34), ajustado pelo simulador: no duelo sem chakra
  // voltando, com 34 o Dano de Armas passava a vencer todas as builds (pvpSim, critério "ninguém vence todas").
  fire_3: { name: 'Varredura Flamejante', tier: 3, form: 'cone_fogo',
    numbers: { base: 28, damage: dmgOf(28, 3), cost: 30, cooldownMs: 6000, range: 5, coneDeg: 120, burn: 0, radius: undefined, speed: undefined, castMs: 600 } },
  // Karyū Hōtan: projétil grande e lento que explode
  fire_hotan: { name: 'Projétil Dracônico', tier: 3, form: 'linha_explode',
    numbers: { base: 30, damage: dmgOf(30, 3), cost: 34, cooldownMs: 6000, range: 9, radius: 2, speed: 8, burn: 0, castMs: 600 } },
  // Tenrai Gōen: 5 meteoros com aviso de 0,8 s; o dano do tier (30 de base) dividido entre os 5. Selos parado.
  fire_4: { name: 'Chuva de Meteoros', tier: 4, form: 'meteoros',
    numbers: { base: 6, damage: dmgOf(6, 4), shots: 5, cost: 44, cooldownMs: 12_000, radius: 4, range: 7, durationMs: 800, burn: 0, castMs: 500, castSlow: 0 } },
};

/**
 * Recompensa da conjuração (conjuracao_tempos.md, seção 1): médio (0,5-0,6 s) +5% de dano, longo (0,8-1,0 s) +10%,
 * ritual (1,2 s) +15%; e toda conjuração de 0,5 s ou mais tem recarga 10% menor (o tempo parado já é custo).
 */
export function castReward(castMs: number | undefined): { damage: number; cooldown: number } {
  const ms = castMs ?? 0;
  if (ms >= 1200) return { damage: 1.15, cooldown: 0.9 };
  if (ms >= 800) return { damage: 1.1, cooldown: 0.9 };
  if (ms >= 500) return { damage: 1.05, cooldown: 0.9 };
  return { damage: 1, cooldown: 1 };
}

/** Interrupção dos selos (conjuracao_interromper.md): recarga curta, Concentração e o empurrão que interrompe. */
export const CAST_RULES = { interruptCooldownMs: 1500, concentrationMs: 3000, pushInterrupts: 1.5 } as const;

/** Selos: anda a 50% nos rápidos e médios; parado nos longos e rituais (ou o que o jutsu disser em `castSlow`). */
export const castSlowOf = (cfg: { castMs?: number; castSlow?: number }) => cfg.castSlow ?? ((cfg.castMs ?? 0) >= 800 ? 0 : 0.5);

export const JUTSUS: readonly JutsuDef[] = [
  { code: 'teleport', name: 'Teleporte Curto', class: null, tier: 0, mechanic: 'teleport', form: 'teleporte' },
  { code: 'substitution', name: 'Substituição', class: null, tier: 0, mechanic: 'substitution', form: 'substituicao' },
  ...CLASSES.flatMap((c) => NAMES[c].map((name, i): JutsuDef => ({
    code: i === 0 ? c : (`${c}_${i + 1}` as JutsuCode),
    name,
    class: c,
    tier: (i + 1) as 1 | 2 | 3 | 4,
    mechanic: c,
    form: FORM_OF_MECHANIC[c],
  }))).map((j) => {
    const v2 = FIRE_V2[j.code] ?? CLASS_V2[j.code];
    return v2 ? { ...j, name: v2.name, tier: v2.tier, form: v2.form, numbers: v2.numbers } : j;
  }),
  // v29: os jutsus novos do Fogo; v30: os das outras classes (códigos novos, depois dos de hoje)
  ...V2_CODES.map((code): JutsuDef => ({ code, class: 'fire', mechanic: 'fire', ...FIRE_V2[code]! } as JutsuDef)),
  ...CLASS_V2_CODES.map((code): JutsuDef => {
    const v = CLASS_V2[code]!;
    return { code, name: v.name, class: v.class, tier: v.tier, mechanic: v.class, form: v.form, numbers: v.numbers };
  }),
  // v30: os jutsus do Clã Rubro (sem classe: vêm da linhagem; a mecânica do Fogo dá a cor e o custo)
  ...CLAN_CODES.map((code): JutsuDef => {
    const v = CLAN_JUTSUS[code]!;
    return { code, name: v.name, class: null, tier: v.tier, mechanic: v.class, form: v.form, numbers: v.numbers, clan: v.clan };
  }),
  // v49 (Fase 2.5): os 74 que fecham 4 jutsus por classe por tier (códigos novos, no fim: o banco e os kits guardam os de antes)
  ...FASE25_CODES.map((code): JutsuDef => {
    const v = FASE25[code]!;
    return { code, name: v.name, class: v.class, tier: v.tier, mechanic: v.class, form: v.form, numbers: v.numbers };
  }),
  // v50: mecânicas inéditas (o 5º jutsu do tier)
  ...MEC_CODES.map((code): JutsuDef => {
    const v = MEC[code]!;
    return { code, name: v.name, class: v.class, tier: v.tier, mechanic: v.class, form: v.form, numbers: v.numbers };
  }),
];

export const JUTSU_CODES = JUTSUS.map((j) => j.code) as unknown as readonly [JutsuCode, ...JutsuCode[]];
export const JUTSU_BY_CODE: ReadonlyMap<string, JutsuDef> = new Map(JUTSUS.map((j) => [j.code, j]));

/** Os 7 jutsus de antes da v7 (quem já jogava continua com eles). */
export const LEGACY_JUTSUS = ['fire', 'water', 'taijutsu', 'illusion', 'shadow', 'stone', 'heal'] as const;

// ------------------------------------------------------------------ nível por uso

/** Usos para chegar a cada nível (índice = nível - 1). MESMA conta da coluna gerada player_jutsus.level. */
export const JUTSU_LEVEL_USES = [0, 100, 500, 2000] as const;
export const MAX_JUTSU_LEVEL = 4;

export function jutsuLevel(uses: number): number {
  let level = 1;
  for (let i = 1; i < JUTSU_LEVEL_USES.length; i++) if (uses >= JUTSU_LEVEL_USES[i]!) level = i + 1;
  return level;
}

/** Usos que faltam para o próximo nível (null = nível máximo). */
export function usesToNext(uses: number): number | null {
  const next = JUTSU_LEVEL_USES.find((n) => n > uses);
  return next === undefined ? null : next;
}

/** Teleporte: alcance 3, 4, 5, 6 casas nos níveis 1 a 4. */
export const teleportRange = (level: number) => 2 + Math.max(1, Math.min(4, level));
/** Substituição: recarga 30, 25, 20, 15 s nos níveis 1 a 4 (no 4, aparece atrás do alvo FOCADO). */
export const substitutionCooldownMs = (level: number) => (35 - 5 * Math.max(1, Math.min(4, level))) * 1000;
/** Jutsu de classe: +10% de efeito (dano, cura) por nível acima do 1. */
export const jutsuPower = (level: number) => 1 + 0.1 * (Math.max(1, Math.min(4, level)) - 1);

/**
 * Maestria (design final; Fase 0 no Fogo, Fase 1.5 em todos): cada nível de uso acima do 1 melhora o que faz sentido
 * para AQUELE jutsu, não necessariamente tudo (no máximo 2 coisas por jutsu):
 *  - dano: +10% de dano por nível;
 *  - efeito: +10% na duração do que ele causa (atordoa, prende, silencia, queima, arremessa, marca, deixa lento...);
 *  - cura: +10% de cura por nível (cura direta, em área, contínua e da zona);
 *  - alcance: +5% de alcance (e do avanço ou recuo) por nível;
 *  - recarga: -5% de recarga por nível (o jutsu de recarga longa);
 *  - duracao: +10% na duração do buff, da zona de suporte ou da invocação (Fase 1.5);
 *  - protecao: +10% no escudo, no muro ou na vida da invocação (Fase 1.5).
 * No nível 4: +30% de dano/efeito/cura/duração/proteção, +15% de alcance, -15% de recarga. O controle continua dentro do
 * orçamento (pvpBalance CC_BUDGET), então a duração maior nunca passa do teto; o escudo continua com o teto de 25% da vida.
 * Teleporte e Substituição (Academia) evoluem do jeito deles (teleportRange, substitutionCooldownMs).
 */
export type MasteryGain = 'dano' | 'efeito' | 'cura' | 'alcance' | 'recarga' | 'duracao' | 'protecao';
export const MASTERY_STEP: Readonly<Record<MasteryGain, number>> = { dano: 0.1, efeito: 0.1, cura: 0.1, alcance: 0.05, recarga: 0.05, duracao: 0.1, protecao: 0.1 };
const MASTERY_DEFAULT: readonly MasteryGain[] = ['dano', 'cura'];
export const MASTERY: Readonly<Record<string, readonly MasteryGain[]>> = {
  // Fogo (Fase 0)
  fire: ['dano', 'efeito'],               // Fogo: projétil que queima; a queimadura dura mais
  fire_endan: ['dano', 'efeito'],         // Sopro Incinerador: cone curto que queima
  fire_hibashiri: ['dano', 'alcance'],    // Linha de Fogo Rasante: a linha vai mais longe
  fire_kasumi: ['dano', 'recarga'],       // Névoa Inflamável: recarga de 8 s
  fire_2: ['dano'],                       // Revoada de Brasas: dano puro
  fire_ryuka: ['dano'],                   // Lança de Fogo: dano puro
  fire_haiseki: ['dano', 'recarga'],      // Cinzas Detonantes: recarga de 7 s
  fire_lamina: ['recarga'],               // Lâmina de Fogo (buff): sem dano próprio, volta mais rápido
  fire_3: ['dano'],                       // Varredura Flamejante: dano puro
  fire_hotan: ['dano'],                   // Projétil Dracônico: dano puro
  fire_4: ['dano', 'recarga'],            // Chuva de Meteoros: recarga de 12 s
  // Cura (Fase 1.5)
  heal: ['cura'],                         // Cura: cura em área
  heal_2: ['dano', 'efeito'],             // Punho Sísmico: arremessa por mais tempo
  heal_3: ['cura', 'recarga'],            // Regeneração de Área: recarga de 27 s
  heal_4: ['cura', 'recarga'],            // Renovação Celular: recarga de 54 s
  heal_desintox: ['cura', 'recarga'],     // Desintoxicação Celular: limpa e cura; recarga de 12 s
  heal_bisturi: ['duracao', 'recarga'],   // Corte Cirúrgico (buff do básico)
  heal_aura: ['cura'],                    // Aura de Regeneração: cura contínua
  heal_disturbio: ['dano', 'efeito'],     // Descontrole Muscular: o controle invertido dura mais
  heal_palma: ['cura'],                   // Palma Curadora
  // Ilusão
  illusion: ['efeito'],                   // Ilusão: atordoa em volta
  illusion_2: ['efeito'],                 // Visão do Abismo: atordoa na linha
  illusion_3: ['dano', 'efeito'],         // Raízes do Pesadelo
  illusion_4: ['efeito', 'recarga'],      // Ciclo Sem Fim: só controle, recarga de 13,5 s
  illusion_kai: ['recarga'],              // Dissipação: limpeza
  illusion_estaca: ['dano', 'efeito'],    // Estaca da Ilusão
  illusion_templo: ['dano', 'efeito'],    // Santuário das Penas: o atordoamento do fim dura mais
  illusion_noite: ['efeito'],             // Noite Eterna: a escuridão dura mais
  // Sombra
  shadow: ['efeito'],                     // Sombra: prende
  shadow_2: ['dano', 'efeito'],           // Agulhas de Sombra
  shadow_3: ['dano', 'efeito'],           // Lâmina Umbral
  shadow_4: ['dano', 'efeito'],           // Domínio das Sombras
  shadow_recuo: ['alcance', 'recarga'],   // Reflexo Tático: recua mais longe
  shadow_estrangular: ['dano'],           // Garrote de Sombra
  shadow_agarre: ['dano', 'efeito'],      // Rede de Sombra
  shadow_armadilha: ['dano', 'efeito'],   // Sombra Oculta: a armadilha prende por mais tempo
  // Terra
  stone: ['recarga'],                     // Pedra: escudo (a redução fica igual)
  stone_2: ['dano', 'recarga'],           // Lamaçal Profundo: recarga de 14,4 s
  stone_3: ['dano', 'efeito'],            // Esmagamento de Paredes
  stone_4: ['recarga'],                   // Coração de Montanha: escudo (a redução fica igual)
  stone_pilares: ['dano', 'efeito'],      // Prisão de Pilares
  stone_rocha: ['dano', 'efeito'],        // Projétil de Rocha: a lentidão dura mais
  stone_toupeira: ['dano', 'efeito'],     // Escavação Furtiva: arremessa por mais tempo
  stone_punho: ['duracao', 'recarga'],    // Punho de Rocha (buff do básico)
  stone_muralha: ['protecao', 'recarga'], // Muralha de Terra: muro mais forte
  stone_golem: ['dano', 'recarga'],       // Golem de Terra Titânico: recarga de 40,5 s
  // Água
  water: ['dano', 'alcance'],             // Água: o cone vai mais longe
  water_2: ['dano'],                      // Estouro de Maré
  water_3: ['dano', 'efeito'],            // Cárcere Líquido: o alvo fica preso mais tempo (você não)
  water_4: ['dano', 'recarga'],           // Prisão do Vórtice: recarga de 12,6 s
  water_dragao: ['dano'],                 // Serpente d’Água
  water_xarope: ['duracao'],              // Poça Viscosa: a poça dura mais
  water_nevoa: ['duracao', 'recarga'],    // Véu de Bruma
  water_muro: ['protecao', 'recarga'],    // Muro de Água
  water_clone: ['duracao', 'protecao'],   // Duplo de Água: dura mais e aguenta mais
  // Taijutsu
  taijutsu: ['dano'],
  taijutsu_2: ['dano'],                   // Chute Ciclone
  taijutsu_3: ['dano'],                   // Cem Golpes
  taijutsu_4: ['dano', 'recarga'],        // Punho do Céu: recarga de 10,8 s
  taijutsu_rasteira: ['dano', 'efeito'],  // Rasteira Baixa: a lentidão dura mais
  taijutsu_ascendente: ['dano', 'efeito'],// Chute Ascendente: arremessa por mais tempo
  taijutsu_lotus: ['dano', 'efeito'],     // Mergulho Esmagador
  taijutsu_portoes: ['duracao', 'recarga'], // Despertar do Corpo (buff)
  // Armas
  weapons: ['dano'],                      // Chuva de Kunais
  weapons_2: ['dano'],                    // Lâminas Flutuantes
  weapons_3: ['dano'],                    // Corte Relâmpago
  weapons_4: ['dano', 'recarga'],         // Dança dos Mil Cortes: recarga de 10,8 s
  weapons_multi: ['dano'],                // Shuriken Espelhada
  weapons_kunai: ['dano', 'efeito'],      // Kunai Explosiva
  weapons_dragoes: ['dano'],              // Ascensão Dupla
  weapons_gigante: ['dano'],              // Shuriken Colossal
  // Raio
  lightning: ['dano', 'efeito'],          // Faísca Rasante
  lightning_2: ['dano'],                  // Farpas de Trovão
  lightning_3: ['dano', 'efeito'],        // Investida Elétrica
  lightning_4: ['dano', 'recarga'],       // Julgamento do Trovão: recarga de 27 s
  lightning_corrente: ['dano'],           // Corrente Rasteira
  lightning_shuriken: ['dano'],           // Shuriken do Trovão
  lightning_impulso: ['alcance', 'recarga'], // Impulso Estático: recua mais longe
  lightning_raio: ['dano'],               // Lança Saltadora
  lightning_fluxo: ['dano', 'efeito'],    // Descarga Envolvente: a paralisia dura mais
  // Vento
  wind: ['dano'],                         // Rajada Aberta
  wind_2: ['dano'],                       // Balas de Vento
  wind_3: ['dano', 'efeito'],             // Tornado Cortante
  wind_4: ['dano', 'recarga'],            // Disco do Furacão: recarga de 27 s
  wind_shuriken: ['dano'],                // Shuriken do Vento
  wind_veu: ['protecao', 'recarga'],      // Véu de Vento: escudo maior
  wind_salto: ['alcance', 'recarga'],     // Passo Aéreo: salta mais longe
  wind_arco: ['dano'],                    // Lâmina em Arco
  // Clã Rubro
  rubro_olho: ['recarga'],                // Olhar Rubro: escudo (a redução fica igual)
  rubro_transe: ['dano', 'efeito'],       // Transe Ocular
  rubro_chamas: ['dano', 'efeito'],       // Brasa Sem Luz: a queimadura dura mais
  rubro_guardiao: ['dano', 'protecao'],   // Sentinela Espectral: escudo maior (teto de 25%)
  rubro_lua: ['dano', 'recarga'],         // Mundo Espelhado: recarga de 27 s
  rubro_completo: ['dano', 'recarga'],    // Colosso Espectral: recarga de 27 s
  // Clã Umbra
  umbra_deslize: ['efeito', 'recarga'],   // Deslize Noturno: some e fortalece o golpe por mais tempo
  umbra_faminta: ['efeito'],              // Sombra Faminta: a marca dura mais
  umbra_noite: ['duracao', 'recarga'],    // Noite Fechada
  umbra_forma: ['dano', 'duracao'],       // Forma Umbral: a forma dura mais
  ...FASE25_MASTERY,                      // v49 (Fase 2.5)
  ...MEC_MASTERY,                         // v50 (mecânicas inéditas)
};
/** O que o jutsu ganha com a maestria. */
export const masteryOf = (code: string): readonly MasteryGain[] => MASTERY[code] ?? MASTERY_DEFAULT;
/** Bônus da maestria (0 no nível 1; 0,3 no nível 4 para dano/efeito/cura/duração/proteção). */
export function masteryBonus(code: string, gain: MasteryGain, level: number): number {
  return masteryOf(code).includes(gain) ? MASTERY_STEP[gain] * (Math.max(1, Math.min(4, level)) - 1) : 0;
}
/** O nível de uso que conta no dano (ou na cura) do PvP: 1 quando a maestria do jutsu não melhora isso. */
export const masteryUseLevel = (code: string, gain: 'dano' | 'cura', level: number) => (masteryOf(code).includes(gain) ? level : 1);

/** Durações de efeito (no alvo) que a maestria "efeito" alonga. */
const EFFECT_KEYS = ['stunMs', 'rootMs', 'silenceMs', 'paralysisMs', 'burnMs', 'slowMs', 'darkMs', 'invertMs', 'woundMs', 'dotMs', 'firstStunMs',
  'liftMs', 'markMs', 'markSlowMs', 'stealthMs', 'nextHitMs', 'sleepMs', 'poisonMs', 'brandMs'] as const;
const ZONE_EFFECT_KEYS = ['firstRootMs', 'endStunMs'] as const;
const PROTECTION_KEYS = ['shieldShare', 'wallHp', 'wallHpShare', 'summonHp'] as const;

/** Os números do jutsu no nível de uso `level`, com a maestria de efeito, cura, alcance, recarga, duração e proteção (dano: no golpe). */
export function withMastery<T extends SkillConfig>(cfg: T, code: string, level: number): T {
  if (!MASTERY[code] || level <= 1) return cfg;
  const out: T = { ...cfg };
  const zone = cfg.zone ? { ...cfg.zone } : undefined;
  if (zone) out.zone = zone;
  const effect = 1 + masteryBonus(code, 'efeito', level);
  if (effect !== 1) {
    for (const k of EFFECT_KEYS) if (typeof out[k] === 'number') out[k] = Math.round(out[k]! * effect);
    if (zone) for (const k of ZONE_EFFECT_KEYS) if (typeof zone[k] === 'number') zone[k] = Math.round(zone[k]! * effect);
  }
  const heal = 1 + masteryBonus(code, 'cura', level);
  if (heal !== 1) {
    if (typeof out.heal === 'number') out.heal = Math.round(out.heal * heal * 100) / 100;
    if (typeof out.hot === 'number') out.hot = Math.round(out.hot * heal * 10_000) / 10_000;
    if (zone && typeof zone.heal === 'number') zone.heal = Math.round(zone.heal * heal * 100) / 100;
  }
  const cd = 1 - masteryBonus(code, 'recarga', level);
  if (cd !== 1) out.cooldownMs = Math.round(out.cooldownMs * cd);
  const reach = 1 + masteryBonus(code, 'alcance', level);
  if (reach !== 1) {
    if (out.range !== undefined) out.range = Math.round(out.range * reach * 100) / 100;
    if (out.dash !== undefined) out.dash = Math.round(out.dash * reach * 100) / 100;
  }
  const lasts = 1 + masteryBonus(code, 'duracao', level);
  if (lasts !== 1) {
    if (typeof out.durationMs === 'number') out.durationMs = Math.round(out.durationMs * lasts);
    if (zone) zone.ms = Math.round(zone.ms * lasts);
  }
  const guard = 1 + masteryBonus(code, 'protecao', level);
  if (guard !== 1) for (const k of PROTECTION_KEYS) if (typeof out[k] === 'number') out[k] = Math.round(out[k]! * guard * 10_000) / 10_000;
  return out;
}

// ------------------------------------------------------------------ números de combate

/** Tier 1 de cada mecânica (os 7 antigos com os MESMOS números de antes). */
export const BASE_SKILLS: Readonly<Record<Mechanic, SkillConfig>> = {
  // Fogo, Sombra, Relâmpago e Armas são habilidades EM LINHA: só saem nas 4 direções (cima, baixo, esquerda, direita).
  // Fogo: projétil em linha reta (9 casas) na direção do inimigo, que explode no primeiro alvo (ou na parede/no fim):
  // círculo de 2. Quem a explosão pega fica queimando: 3 por segundo, por 3 s (mais forte nos tiers altos).
  fire: { cost: 20, cooldownMs: 1500, damage: 25, range: 9, radius: 2, speed: 14, burn: 3, burnMs: 3000 },
  // Água: cone de 90° e 4 casas na direção em que o jogador olha (ou no alvo focado); empurra quem acerta 1,5 casa.
  water: { cost: 15, cooldownMs: 1000, damage: 20, range: 4, coneDeg: 90, push: 1.5 },
  // Taijutsu: avança até o mais perto (alcance 2,5) e acerta um círculo de 1 casa na frente.
  taijutsu: { cost: 5, cooldownMs: 500, damage: 35, range: 2.5, radius: 1, scaling: 'taijutsu' },
  // Ilusão: atordoa todos num círculo de 3 casas em volta do jogador.
  illusion: { cost: 30, cooldownMs: 4000, radius: 3, stunMs: 3000 },
  // Sombra: linha de 4 casas; prende o primeiro que ela encosta.
  shadow: { cost: 25, cooldownMs: 6000, range: 4, rootMs: 5000 },
  stone: { cost: 15, cooldownMs: 6000, reduction: 0.5 },
  // Cura: em si mesmo ou num aliado a até 3 casas.
  heal: { cost: 30, cooldownMs: 4000, heal: 30, radius: 3 },
  // Armas: 3 kunais lado a lado (trilhas paralelas a 0,7 casa), 4 casas; cada alvo leva no máximo 1 kunai por
  // arremesso. Escala com o atributo Armas (+ a arma equipada).
  weapons: { cost: 10, cooldownMs: 1200, damage: 18, range: 4, shots: 3, laneGap: 0.7, speed: 16, scaling: 'weapons' },
  // Relâmpago: linha instantânea de 4,5 casas; o primeiro alvo leva dano alto, um choque rápido e fica paralisado 2 s
  // (anda a 70% e leva um choque de 0,25 s por segundo; mais tempo nos tiers altos).
  lightning: { cost: 20, cooldownMs: 2000, damage: 30, range: 4.5, stunMs: 600, paralysisMs: 2000 },   // v30: atordoa 0,6 s (era 0,4)
  // v30, Vento: Rajada Aberta: cone curto de 2 casas (60°) que empurra 2 casas.
  wind: { cost: 15, cooldownMs: 4000, damage: 18, range: 2, coneDeg: 60, push: 2 },
  // Academia: o alcance e a recarga reais vêm do NÍVEL do jutsu (teleportRange, substitutionCooldownMs).
  teleport: { cost: 10, cooldownMs: 1500, range: 3 },
  substitution: { cost: 20, cooldownMs: 30_000, durationMs: 5000 },
};

const TIER = {
  power: [1, 1.45, 2, 2.8],
  reach: [0, 0.5, 1, 1.5],
  cost: [1, 1.35, 1.7, 2.2],
  cooldown: [1, 1.15, 1.3, 1.5],
  control: [1, 1.2, 1.4, 1.7],
  shield: [0.5, 0.6, 0.7, 0.8],
} as const;

/** Números de um jutsu (tier 1 = BASE_SKILLS; tiers 2 a 4 = a mesma mecânica, mais forte). */
export function skillConfig(j: JutsuDef): SkillConfig & { mechanic: Mechanic } {
  if (j.numbers) {
    // jutsu com números próprios: os da mecânica como fundo, os dele por cima (undefined apaga o do fundo)
    const out: Record<string, unknown> = { ...BASE_SKILLS[j.mechanic], mechanic: j.mechanic };
    for (const [k, v] of Object.entries(j.numbers)) if (v === undefined) delete out[k]; else out[k] = v;
    const reward = castReward(j.numbers.castMs);
    if (reward.damage !== 1) {
      if (typeof out.damage === 'number') out.damage = Math.round(out.damage * reward.damage);
      if (typeof out.base === 'number') out.base = Math.round(out.base * reward.damage * 10) / 10;
    }
    if (reward.cooldown !== 1) out.cooldownMs = Math.round((out.cooldownMs as number) * reward.cooldown);
    return out as unknown as SkillConfig & { mechanic: Mechanic };
  }
  const base = BASE_SKILLS[j.mechanic];
  if (j.tier <= 1) {
    // v30: os selos dos tier 1 que já existiam (Cura, Ilusão, Possessão da Sombra), com a recompensa da conjuração
    const castMs = CAST_OF_EXISTING[j.code];
    if (!castMs) return { ...base, mechanic: j.mechanic };
    return { ...base, mechanic: j.mechanic, castMs, cooldownMs: Math.round(base.cooldownMs * castReward(castMs).cooldown) };
  }
  const t = j.tier - 1;
  const r = (n: number | undefined, k: number) => (n === undefined ? undefined : Math.round(n * k));
  const out: SkillConfig & { mechanic: Mechanic } = {
    ...base,
    mechanic: j.mechanic,
    cost: Math.round(base.cost * TIER.cost[t]!),
    cooldownMs: Math.round(base.cooldownMs * TIER.cooldown[t]!),
  };
  if (base.damage !== undefined) out.damage = r(base.damage, TIER.power[t]!)!;
  if (base.heal !== undefined) out.heal = r(base.heal, TIER.power[t]!)!;
  if (base.radius !== undefined) out.radius = base.radius + TIER.reach[t]!;
  if (base.range !== undefined) out.range = base.range + TIER.reach[t]!;
  if (base.push !== undefined) out.push = base.push + TIER.reach[t]!;
  if (base.burn !== undefined) out.burn = r(base.burn, TIER.power[t]!)!;
  if (base.paralysisMs !== undefined) out.paralysisMs = r(base.paralysisMs, TIER.control[t]!)!;
  // Ilusão: o Labirinto Mental (tier 3) e o Cárcere dos Sonhos (tier 4) também silenciam depois do atordoamento.
  if (j.mechanic === 'illusion' && j.tier >= 3) out.silenceMs = j.tier === 3 ? 3000 : 4500;
  if (base.stunMs !== undefined) out.stunMs = r(base.stunMs, TIER.control[t]!)!;
  if (base.rootMs !== undefined) out.rootMs = r(base.rootMs, TIER.control[t]!)!;
  if (base.reduction !== undefined) out.reduction = TIER.shield[t]!;
  return out;
}

/** Tabela completa: código -> números (o servidor usa; o welcome manda custo, recarga e alcance). */
export function buildSkills(): Record<JutsuCode, SkillConfig & { mechanic: Mechanic }> {
  return Object.fromEntries(JUTSUS.map((j) => [j.code, skillConfig(j)])) as Record<JutsuCode, SkillConfig & { mechanic: Mechanic }>;
}

// ------------------------------------------------------------------ Extração (gacha)

/**
 * Nível de Extração 1 a 4: pergaminhos gastos e chance de sucesso (o BANCO usa a mesma tabela, v20).
 * v31 (design final): 1, 2, 3 e 4 pergaminhos; 90%, 80%, 60% e 40%. No tier 1, as 2 primeiras Extrações de cada classe
 * são garantidas (`guaranteed`: enquanto o jogador sabe menos de 2 jutsus de tier 1 da classe, a chance é 100%).
 */
export const EXTRACTION: readonly { level: number; scrolls: number; chance: number; guaranteed?: number }[] = [
  { level: 1, scrolls: 1, chance: 0.9, guaranteed: 2 },
  { level: 2, scrolls: 2, chance: 0.8 },
  { level: 3, scrolls: 3, chance: 0.6 },
  { level: 4, scrolls: 4, chance: 0.4 },
];

/**
 * Proteção contra azar (v10, design 7.3): cada falha seguida na mesma classe e no mesmo tier soma isto à
 * chance da próxima; acertou, zera. A MESMA conta está em game.extract_jutsu (db/schema_v20_extracao.sql).
 * O limite é 100%: no tier 4 (40%), a 7ª tentativa seguida é certa.
 */
export const EXTRACTION_PITY_STEP = 0.1;

/**
 * Chance da próxima Extração do tier `level` depois de `failures` falhas seguidas (0 a 1). `learned` = quantos jutsus
 * daquele tier e daquela classe o jogador já sabe (o tier 1 garante as 2 primeiras).
 */
export function extractionChance(level: number, failures: number, learned = Infinity): number {
  const rule = EXTRACTION.find((e) => e.level === level);
  if (!rule) return 0;
  if (rule.guaranteed !== undefined && learned < rule.guaranteed) return 1;
  return Math.min(1, rule.chance + EXTRACTION_PITY_STEP * Math.max(0, failures));
}
