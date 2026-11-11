/*
 * v50: jutsus de MECÂNICA INÉDITA (nomes da opção B, escolha do Victor em 11/11/2026). Entram como o 5º jutsu do tier da
 * classe, além dos 4 da Fase 2.5. Em três pacotes: recursos (este), reação e posição.
 *
 * Pacote de recursos:
 *  - roubo de vida (`lifesteal`): parte do dano que entrou volta como cura; no máximo 10% da vida por lançamento;
 *  - veneno que acumula (`poison`): cada acerto soma uma carga (até `poisonMax`) e renova o tempo (`poisonMs`);
 *  - dano por vida perdida (`lowHpBonus`): bônus inteiro com 25% da vida ou menos;
 *  - queima de chakra (`chakraBurn`): tira chakra do alvo e causa dano pelo que tirou.
 */
import type { ClassJutsu } from './jutsusClasses.js';
import type { MasteryGain } from './jutsus.js';

const POWER = [1, 1.45, 2, 2.8] as const;
const dmg = (base: number, tier: number) => Math.round(base * POWER[tier - 1]!);
const CLEAN = { coneDeg: undefined, push: undefined, stunMs: undefined, rootMs: undefined, paralysisMs: undefined, laneGap: undefined, burn: undefined, heal: undefined, reduction: undefined } as const;

export const MEC_CODES = ['shadow_beijo', 'weapons_peconha', 'taijutsu_furia', 'heal_meridianos'] as const;

export const MEC: Readonly<Record<string, ClassJutsu>> = {
  // Roubo de vida: linha que acerta o primeiro; metade do dano volta como cura
  shadow_beijo: { name: 'Beijo do Breu', class: 'shadow', tier: 2, form: 'linha',
    numbers: { ...CLEAN, base: 20, damage: dmg(20, 2), cost: 34, cooldownMs: 9000, range: 5, lifesteal: 0.5, castMs: 200 } },
  // Veneno que acumula: projétil fraco e rápido de lançar; paga o próprio custo no PvP (senão as cargas nunca somariam)
  weapons_peconha: { name: 'Fio Peçonhento', class: 'weapons', tier: 1, form: 'projetil',
    numbers: { ...CLEAN, base: 6, damage: dmg(6, 1), cost: 12, cooldownMs: 2500, range: 6, speed: 15, radius: 0, shots: 1, poison: 2, poisonMax: 5, poisonMs: 6000 } },
  // Dano por vida perdida: avanço curto; até 40% a mais com 25% da vida ou menos
  taijutsu_furia: { name: 'Fúria do Encurralado', class: 'taijutsu', tier: 4, form: 'investida',
    numbers: { ...CLEAN, base: 28, damage: dmg(28, 4), cost: 30, cooldownMs: 12_000, range: 3, radius: 1, lowHpBonus: 0.4, castMs: 200, castSlow: 0 } },
  // Queima de chakra: no alvo focado; tira até 25 de chakra e causa 0,8 de dano por ponto tirado
  heal_meridianos: { name: 'Selo dos Meridianos', class: 'heal', tier: 3, form: 'alvo',
    numbers: { ...CLEAN, base: 10, damage: dmg(10, 3), cost: 40, cooldownMs: 12_000, range: 5, radius: undefined, chakraBurn: 25, chakraBurnRatio: 0.8, castMs: 300 } },
};

export const MEC_MASTERY: Readonly<Record<string, readonly MasteryGain[]>> = {
  shadow_beijo: ['dano', 'recarga'],
  weapons_peconha: ['efeito', 'recarga'],  // o veneno dura mais sem novo acerto (o dano dele é o das cargas)
  taijutsu_furia: ['dano', 'recarga'],
  heal_meridianos: ['recarga'],            // o dano vem do chakra tirado: só a recarga melhora
};

export const MEC_TEXT: Readonly<Record<string, { icon: string; text: string }>> = {
  shadow_beijo: { icon: '🧛', text: 'Sombra em linha ({range} casas): fere o primeiro inimigo e {lifesteal} do dano volta como cura para você (até 10% da sua vida).' },
  weapons_peconha: { icon: '☠️', text: 'Lâmina envenenada em linha ({range} casas): cada acerto soma uma carga de veneno (até {poisonMax}), {poison} de dano por segundo por carga. As cargas somem {poisonMs} depois do último acerto.' },
  taijutsu_furia: { icon: '😤', text: 'Avanço de até {range} casas: quanto menos vida você tem, mais bate (até {lowHpBonus} a mais com 25% da vida ou menos).' },
  heal_meridianos: { icon: '🈲', text: 'Sela os pontos de chakra do alvo (até {range} casas): tira até {chakraBurn} de chakra dele e causa dano pelo que tirou.' },
};
