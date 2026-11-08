/*
 * v30 (Jutsus v2, entrega 5): as outras 8 classes da adaptação (revisao_egm/jutsus/adapt_*.md), com os tempos de
 * conjuração de revisao_egm/jutsus/conjuracao_tempos.md. Os tiers 2 a 4 de hoje (water_2...) viram os jutsus da adaptação
 * (o código fica: o banco e os kits guardam); os códigos novos estão em CLASS_V2_CODES.
 *
 * Nomes em português (Fase 1 do roadmap: nenhum nome da série). Ficaram de fora, esperando um sistema próprio (como a
 * revisão mandou): muros (Muro de Água, Muralha de Terra), invocações (Clone de Água, Golem), canalização (Palma
 * Mística), armadilha (Sombra Oculta), controles invertidos (Distúrbio Nervoso), escuridão (Ocultação na Névoa, Noite
 * Eterna), o bumerangue (Shuriken Gigante de chakra) e a classe Vento. Os clãs vêm com o sistema de linhagem.
 *
 * `base` = dano equivalente de tier 1 (o PvP usa com a curva achatada); `damage` = base x a curva do tier (monstros).
 */
import type { SkillConfig } from './config.js';
import type { ClassCode, JutsuForm } from './jutsus.js';

const POWER = [1, 1.45, 2, 2.8] as const;
const dmg = (base: number, tier: number) => Math.round(base * POWER[tier - 1]!);

export interface ClassJutsu {
  name: string;
  class: ClassCode;
  tier: 1 | 2 | 3 | 4;
  form: JutsuForm;
  numbers: Partial<SkillConfig>;
}

/** Os 27 códigos novos (depois do Fogo). v30: todo controle x1,6 (pedido do Victor), até 2,5 s por golpe. */
export const CLASS_V2_CODES = [
  'water_dragao', 'water_xarope',
  'lightning_corrente', 'lightning_shuriken', 'lightning_impulso', 'lightning_raio', 'lightning_fluxo',
  'stone_pilares', 'stone_rocha', 'stone_toupeira', 'stone_punho',
  'heal_desintox', 'heal_bisturi', 'heal_aura',
  'weapons_multi', 'weapons_kunai', 'weapons_dragoes',
  'illusion_kai', 'illusion_estaca', 'illusion_templo',
  'taijutsu_rasteira', 'taijutsu_ascendente', 'taijutsu_lotus', 'taijutsu_portoes',
  'shadow_recuo', 'shadow_estrangular', 'shadow_agarre',
  // v30, os de sistema próprio (escuridão, controles invertidos, armadilha, canalização, bumerangue)
  'water_nevoa', 'illusion_noite', 'heal_disturbio', 'shadow_armadilha', 'heal_palma', 'weapons_gigante',
] as const;

/** Apaga o que vem da mecânica e não vale para o jutsu novo (undefined apaga o número do fundo). */
const CLEAN = { coneDeg: undefined, push: undefined, stunMs: undefined, rootMs: undefined, paralysisMs: undefined, laneGap: undefined, burn: undefined, heal: undefined, reduction: undefined } as const;

export const CLASS_V2: Readonly<Record<string, ClassJutsu>> = {
  // ------------------------------------------------------------------ Água
  water_dragao: { name: 'Dragão d’Água', class: 'water', tier: 1, form: 'projetil',
    numbers: { ...CLEAN, base: 18, damage: dmg(18, 1), cost: 15, cooldownMs: 1500, range: 8, speed: 12, radius: 0, wet: true } },
  water_nevoa: { name: 'Ocultação na Névoa', class: 'water', tier: 1, form: 'zona',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 20, cooldownMs: 12_000, range: 0, radius: 3,
      zone: { ms: 4000, kind: 'agua', self: true, dark: true } } },
  water_2: { name: 'Onda de Choque Aquática', class: 'water', tier: 2, form: 'anel_golpe',
    numbers: { ...CLEAN, base: 20, damage: dmg(20, 2), cost: 27, cooldownMs: 6000, radius: 3.5, range: undefined, push: 2, wet: true } },
  water_xarope: { name: 'Xarope Pegajoso', class: 'water', tier: 2, form: 'zona',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 25, cooldownMs: 10_000, range: 4, radius: 1.5, castMs: 200,
      zone: { ms: 4000, kind: 'agua', slow: true } } },
  water_3: { name: 'Prisão de Água', class: 'water', tier: 3, form: 'linha',
    numbers: { ...CLEAN, base: 18, damage: dmg(18, 3), cost: 34, cooldownMs: 10_000, range: 4, rootMs: 2400, selfRootMs: 2400, castMs: 600, wet: true } },
  water_4: { name: 'Prisão do Vórtice', class: 'water', tier: 4, form: 'zona',
    numbers: { ...CLEAN, base: 26, damage: dmg(26, 4), cost: 44, cooldownMs: 14_000, range: 6, radius: 4, castMs: 1200, castSlow: 0,
      zone: { ms: 2000, kind: 'agua', slow: true, pull: 0.75, split: 2 } } },

  // ------------------------------------------------------------------ Relâmpago
  lightning_corrente: { name: 'Corrente Rasteira', class: 'lightning', tier: 1, form: 'linha',
    numbers: { ...CLEAN, base: 22, damage: dmg(22, 1), cost: 18, cooldownMs: 4000, range: 6 } },
  lightning_shuriken: { name: 'Shuriken do Trovão', class: 'lightning', tier: 1, form: 'projetil',
    numbers: { ...CLEAN, base: 24, damage: dmg(24, 1), cost: 15, cooldownMs: 3000, range: 7, speed: 16, radius: 0 } },
  lightning_impulso: { name: 'Impulso Estático', class: 'lightning', tier: 1, form: 'recuo',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 15, cooldownMs: 8000, range: 4, dash: 4 } },
  lightning_2: { name: 'Agulhas de Trovão', class: 'lightning', tier: 2, form: 'leque',
    numbers: { ...CLEAN, base: 6, damage: dmg(6, 2), cost: 20, cooldownMs: 5000, range: 6, speed: 16, radius: 0, shots: 5, cap: 5, castMs: 200 } },
  lightning_raio: { name: 'Lança Saltadora', class: 'lightning', tier: 2, form: 'ricochete',
    numbers: { ...CLEAN, base: 26, damage: dmg(26, 2), cost: 25, cooldownMs: 7000, range: 7, bounce: 1, castMs: 200 } },
  lightning_fluxo: { name: 'Fluxo Elétrico', class: 'lightning', tier: 2, form: 'anel_golpe',
    numbers: { ...CLEAN, base: 20, damage: dmg(20, 2), cost: 25, cooldownMs: 12_000, radius: 2, range: undefined, paralysisMs: 1000 } },
  lightning_3: { name: 'Investida Elétrica', class: 'lightning', tier: 3, form: 'investida',
    numbers: { ...CLEAN, base: 30, damage: dmg(30, 3), cost: 30, cooldownMs: 9000, range: 5, radius: 1, stunMs: 800, castMs: 500, castSlow: 0 } },
  lightning_4: { name: 'Dragão do Trovão', class: 'lightning', tier: 4, form: 'aviso',
    numbers: { ...CLEAN, base: 30, damage: dmg(30, 4), cost: 45, cooldownMs: 30_000, range: 7, radius: 3.5, durationMs: 1000, stunMs: 1000, castMs: 800, castSlow: 0 } },

  // ------------------------------------------------------------------ Terra (classe Pedra)
  stone_pilares: { name: 'Prisão de Pilares', class: 'stone', tier: 1, form: 'alvo',
    numbers: { ...CLEAN, base: 18, damage: dmg(18, 1), cost: 20, cooldownMs: 9000, range: 6, rootMs: 1600, castMs: 300 } },
  stone_rocha: { name: 'Projétil de Rocha', class: 'stone', tier: 1, form: 'projetil',
    numbers: { ...CLEAN, base: 12, damage: dmg(12, 1), cost: 18, cooldownMs: 3000, range: 8, speed: 13, radius: 0, shots: 2, slowMs: 2000 } },
  stone_toupeira: { name: 'Toupeira Oculta', class: 'stone', tier: 1, form: 'investida',
    numbers: { ...CLEAN, base: 18, damage: dmg(18, 1), cost: 20, cooldownMs: 10_000, range: 5, radius: 1, liftMs: 500, dr: 0.5, durationMs: 500 } },
  stone_2: { name: 'Pântano do Submundo', class: 'stone', tier: 2, form: 'zona',
    numbers: { ...CLEAN, base: 18, damage: dmg(18, 2), cost: 27, cooldownMs: 16_000, range: 6, radius: 3, castMs: 500,
      zone: { ms: 4000, kind: 'lama', slow: true, split: 4 } } },
  stone_punho: { name: 'Punho de Rocha', class: 'stone', tier: 2, form: 'buff_basico',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 20, cooldownMs: 15_000, durationMs: 5000, basicBuff: 0.15, firstStunMs: 800, range: 0 } },
  stone_3: { name: 'Esmagamento de Paredes', class: 'stone', tier: 3, form: 'alvo',
    numbers: { ...CLEAN, base: 28, damage: dmg(28, 3), cost: 34, cooldownMs: 12_000, range: 5, rootMs: 1600, castMs: 600 } },

  // ------------------------------------------------------------------ Médico (classe Cura)
  heal_desintox: { name: 'Desintoxicação Celular', class: 'heal', tier: 1, form: 'limpeza',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 15, cooldownMs: 12_000, heal: 10, cleanse: ['queimadura', 'ferida'] } },
  heal_bisturi: { name: 'Bisturi de Chakra', class: 'heal', tier: 1, form: 'buff_basico',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 20, cooldownMs: 15_000, durationMs: 5000, basicBuff: 0.15, firstBleed: 2 } },
  heal_aura: { name: 'Aura de Regeneração', class: 'heal', tier: 1, form: 'zona',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 20, cooldownMs: 12_000, range: 0, radius: 2,
      zone: { ms: 3000, kind: 'cura', heal: 4, follow: true, self: true } } },
  heal_palma: { name: 'Palma Mística', class: 'heal', tier: 1, form: 'palma',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 25, cooldownMs: 8000, range: 1.5, heal: 30, castMs: 2000, castSlow: 0.4 } },
  heal_disturbio: { name: 'Distúrbio Nervoso', class: 'heal', tier: 2, form: 'alvo',
    numbers: { ...CLEAN, base: 18, damage: dmg(18, 2), cost: 27, cooldownMs: 14_000, range: 5, invertMs: 1600, castMs: 300 } },
  heal_2: { name: 'Punho Sísmico', class: 'heal', tier: 2, form: 'impacto',
    numbers: { ...CLEAN, base: 26, damage: dmg(26, 2), cost: 27, cooldownMs: 9000, range: 1.5, radius: 1.5, liftMs: 800, castMs: 300, castSlow: 0 } },
  heal_3: { name: 'Regeneração de Área', class: 'heal', tier: 3, form: 'zona',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 51, cooldownMs: 30_000, range: 0, radius: 4, castMs: 800, castSlow: 0,
      zone: { ms: 4000, kind: 'cura', heal: 25, self: true } } },
  heal_4: { name: 'Regeneração Mitótica', class: 'heal', tier: 4, form: 'cura_tempo',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 66, cooldownMs: 60_000, durationMs: 10_000, hot: 0.03, castMs: 1000, castSlow: 0 } },

  // ------------------------------------------------------------------ Armas (escalam com o atributo Armas e a arma; PvP x2,5)
  // As bases da adaptação x0,72 (18/25: a mesma proporção da Chuva de Kunais para a Bola de Fogo), porque o atributo Armas
  // e a arma equipada somam por cima; sem isso o Dano de Armas vencia todas as builds no simulador.
  weapons_multi: { name: 'Shuriken Multiplicada', class: 'weapons', tier: 1, form: 'leque',
    numbers: { ...CLEAN, base: 7.9, damage: dmg(7.9, 1), cost: 12, cooldownMs: 1800, range: 7, speed: 16, radius: 0, shots: 2, cap: 1, pvpScale: true } },
  weapons_2: { name: 'Lâminas Flutuantes', class: 'weapons', tier: 2, form: 'zona',
    numbers: { ...CLEAN, base: 17.3, damage: dmg(17.3, 2), cost: 14, cooldownMs: 4000, range: 0, radius: 1.5, pvpScale: true,
      zone: { ms: 3000, kind: 'armas', follow: true, self: true, split: 3 } } },
  weapons_gigante: { name: 'Shuriken Gigante de Chakra', class: 'weapons', tier: 2, form: 'bumerangue',
    numbers: { ...CLEAN, base: 10.1, damage: dmg(10.1, 2), returnBase: 7.2, returnDamage: dmg(7.2, 2), cost: 14, cooldownMs: 4000, range: 8, speed: 12, radius: 0, castMs: 200, pvpScale: true } },
  weapons_3: { name: 'Corte Relâmpago', class: 'weapons', tier: 3, form: 'investida',
    numbers: { ...CLEAN, base: 20.2, damage: dmg(20.2, 3), cost: 17, cooldownMs: 6000, range: 4, radius: 1, pierce: true, castMs: 200, castSlow: 0, pvpScale: true } },
  weapons_kunai: { name: 'Kunai Explosiva', class: 'weapons', tier: 3, form: 'aviso',
    numbers: { ...CLEAN, base: 18.7, damage: dmg(18.7, 3), cost: 17, cooldownMs: 5000, range: 6, radius: 2, durationMs: 800, stunMs: 800, pvpScale: true } },
  weapons_4: { name: 'Dança dos Mil Cortes', class: 'weapons', tier: 4, form: 'zona',
    numbers: { ...CLEAN, base: 21.6, damage: dmg(21.6, 4), cost: 22, cooldownMs: 12_000, range: 0, radius: 1.5, castMs: 500, castSlow: 0, dr: 0.5, durationMs: 1600, pvpScale: true,
      zone: { ms: 1600, tickMs: 200, kind: 'armas', follow: true, self: true, split: 8 } } },
  weapons_dragoes: { name: 'Dragões Gêmeos', class: 'weapons', tier: 4, form: 'aviso',
    numbers: { ...CLEAN, base: 5.4, damage: dmg(5.4, 4), cost: 22, cooldownMs: 12_000, range: 6, radius: 3, durationMs: 1000, waves: 4, slowMs: 1000, castMs: 500, castSlow: 0, pvpScale: true } },

  // ------------------------------------------------------------------ Ilusão
  illusion_kai: { name: 'Dissipação', class: 'illusion', tier: 1, form: 'limpeza',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 20, cooldownMs: 14_000, radius: undefined, cleanse: ['lentidao', 'silencio', 'sono'], ignoresSilence: true } },
  illusion_2: { name: 'Visão do Abismo', class: 'illusion', tier: 2, form: 'linha',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 41, cooldownMs: 4600, range: 5, radius: undefined, stunMs: 1600, drain: 10, castMs: 300 } },
  illusion_estaca: { name: 'Estaca da Ilusão', class: 'illusion', tier: 2, form: 'linha',
    numbers: { ...CLEAN, base: 18, damage: dmg(18, 2), cost: 41, cooldownMs: 6000, range: 6, radius: undefined, rootMs: 1600, castMs: 300 } },
  illusion_noite: { name: 'Noite Eterna', class: 'illusion', tier: 3, form: 'alvo',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 51, cooldownMs: 9000, range: 6, radius: undefined, darkMs: 3000, castMs: 500 } },
  illusion_3: { name: 'Árvore Prendedora', class: 'illusion', tier: 3, form: 'alvo',
    numbers: { ...CLEAN, base: 22, damage: dmg(22, 3), cost: 51, cooldownMs: 9000, range: 5, radius: undefined, rootMs: 1900, strikeDelayMs: 1200, castMs: 600 } },
  illusion_4: { name: 'Laço do Destino', class: 'illusion', tier: 4, form: 'alvo',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 66, cooldownMs: 15_000, range: 5, radius: undefined, rootMs: 2400, silenceMs: 2500, slowMs: 2000, castMs: 1000, castSlow: 0 } },
  illusion_templo: { name: 'Templo do Nirvana', class: 'illusion', tier: 4, form: 'zona',
    numbers: { ...CLEAN, base: 20, damage: dmg(20, 4), cost: 66, cooldownMs: 15_000, range: 5, radius: 4, castMs: 1000, castSlow: 0,
      zone: { ms: 3000, kind: 'ilusao', slow: true, endHit: true, endStunMs: 1300 } } },

  // ------------------------------------------------------------------ Taijutsu (o PvP x4 fica só no Golpe Avançado)
  taijutsu_rasteira: { name: 'Rasteira Baixa', class: 'taijutsu', tier: 1, form: 'cone_golpe',
    numbers: { ...CLEAN, base: 20, damage: dmg(20, 1), cost: 10, cooldownMs: 4000, range: 1.5, radius: undefined, coneDeg: 120, slowMs: 1000 } },
  taijutsu_2: { name: 'Chute Ciclone', class: 'taijutsu', tier: 2, form: 'anel_golpe',
    numbers: { ...CLEAN, base: 24, damage: dmg(24, 2), cost: 14, cooldownMs: 5000, radius: 1.5, range: undefined, push: 1.5 } },
  taijutsu_ascendente: { name: 'Chute Ascendente', class: 'taijutsu', tier: 2, form: 'investida',
    numbers: { ...CLEAN, base: 22, damage: dmg(22, 2), cost: 20, cooldownMs: 8000, range: 4, radius: 1, liftMs: 1000, castMs: 200 } },
  taijutsu_3: { name: 'Cem Golpes', class: 'taijutsu', tier: 3, form: 'cone_golpe',
    numbers: { ...CLEAN, base: 8, damage: dmg(8, 3), cost: 24, cooldownMs: 7000, range: 1.5, radius: undefined, coneDeg: 90, hits: 3, push: 2 } },
  taijutsu_lotus: { name: 'Mergulho Esmagador', class: 'taijutsu', tier: 3, form: 'investida',
    numbers: { ...CLEAN, base: 28, damage: dmg(28, 3), cost: 20, cooldownMs: 12_000, range: 3, radius: 1, liftMs: 1300, hpCost: 0.05, castMs: 300, castSlow: 0 } },
  taijutsu_portoes: { name: 'Despertar do Corpo', class: 'taijutsu', tier: 4, form: 'buff_basico',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 0, cooldownMs: 20_000, durationMs: 5000, basicBuff: 0.15, speedBuff: 0.15, hpCost: 0.1, castMs: 500, castSlow: 0, range: 0 } },
  taijutsu_4: { name: 'Punho do Céu', class: 'taijutsu', tier: 4, form: 'cone_golpe',
    numbers: { ...CLEAN, base: 6, damage: dmg(6, 4), cost: 30, cooldownMs: 12_000, range: 3, radius: undefined, coneDeg: 90, hits: 3, hitsPve: 5, hpCost: 0.05, castMs: 600, castSlow: 0 } },

  // ------------------------------------------------------------------ Sombra
  shadow_recuo: { name: 'Reflexo Tático', class: 'shadow', tier: 1, form: 'recuo',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 15, cooldownMs: 8000, range: 3, dash: -3 } },
  shadow_2: { name: 'Costura de Sombra', class: 'shadow', tier: 2, form: 'leque',
    numbers: { ...CLEAN, base: 8, damage: dmg(8, 2), cost: 34, cooldownMs: 6900, range: 5, speed: 14, radius: 0, shots: 3, cap: 1, rootMs: 1300, castMs: 300 } },
  shadow_armadilha: { name: 'Sombra Oculta', class: 'shadow', tier: 2, form: 'zona',
    numbers: { ...CLEAN, base: 18, damage: dmg(18, 2), cost: 34, cooldownMs: 10_000, range: 4, radius: 1,
      zone: { ms: 10_000, tickMs: 200, kind: 'sombra', trap: true, firstRootMs: 1300 } } },
  shadow_estrangular: { name: 'Estrangulamento da Sombra', class: 'shadow', tier: 3, form: 'alvo',
    numbers: { ...CLEAN, base: 16, damage: dmg(16, 3), cost: 43, cooldownMs: 9000, range: 5, needsRooted: true } },
  shadow_3: { name: 'Shuriken de Sombra', class: 'shadow', tier: 3, form: 'projetil',
    numbers: { ...CLEAN, base: 20, damage: dmg(20, 3), cost: 43, cooldownMs: 9000, range: 10, speed: 16, radius: 0, rootMs: 1600, castMs: 500 } },
  shadow_agarre: { name: 'Agarre Múltiplo', class: 'shadow', tier: 4, form: 'agarre',
    numbers: { ...CLEAN, base: 22, damage: dmg(22, 4), cost: 55, cooldownMs: 12_000, range: 6, targets: 2, rootMs: 1600, castMs: 800, castSlow: 0 } },
  shadow_4: { name: 'Domínio das Sombras', class: 'shadow', tier: 4, form: 'zona',
    numbers: { ...CLEAN, base: 20, damage: dmg(20, 4), cost: 55, cooldownMs: 13_500, range: 0, radius: 5, castMs: 1000, castSlow: 0,
      zone: { ms: 4000, kind: 'sombra', slow: true, self: true, endHit: true, firstRootMs: 1300 } } },
};

/**
 * Selos dos jutsus de tier 1 que já existiam. A tabela (conjuracao_tempos.md) dá Cura 0,3 s, Ilusão 0,5 s e Possessão
 * da Sombra 0,3 s, mas eles são a base do rankeado de hoje: ficam instantâneos até o Victor decidir (só mudar aqui).
 */
export const CAST_OF_EXISTING: Readonly<Record<string, number>> = {};
