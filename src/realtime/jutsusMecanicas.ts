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

export const MEC_CODES = ['shadow_beijo', 'weapons_peconha', 'taijutsu_furia', 'heal_meridianos',
  // v51: pacote de reação
  'stone_resposta', 'wind_espelho', 'fire_marca', 'illusion_emprestimo',
  // v52: pacote de posição
  'shadow_troca', 'water_laco', 'lightning_volta', 'illusion_voz'] as const;

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
  // ------------------------------------------------------------------ v51: pacote de reação
  // Contra-ataque: 1,5 s em guarda; o próximo golpe direto é anulado e quem bateu leva o troco e fica atordoado
  stone_resposta: { name: 'Resposta da Montanha', class: 'stone', tier: 3, form: 'contra',
    numbers: { ...CLEAN, base: 26, damage: dmg(26, 3), cost: 30, cooldownMs: 14_000, range: 0, counterMs: 1500, counterStunMs: 1000 } },
  // Reflexo: por 2 s, o primeiro projétil que bater volta para quem lançou
  wind_espelho: { name: 'Espelho de Ar', class: 'wind', tier: 2, form: 'reflexo',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 22, cooldownMs: 14_000, range: 0, reflectMs: 2000 } },
  // Marca que detona: linha fraca que marca o alvo por 5 s; o seu próximo jutsu nele explode a marca (60% do dano dele a mais)
  fire_marca: { name: 'Marca Incandescente', class: 'fire', tier: 2, form: 'linha',
    numbers: { ...CLEAN, base: 12, damage: dmg(12, 2), cost: 25, cooldownMs: 9000, range: 7, radius: undefined, burnMs: undefined, speed: undefined, brandMs: 5000, brandBonus: 0.6, castMs: 200 } },
  // Roubo de buff: no alvo focado; o escudo e os bônus ativos dele passam para você
  illusion_emprestimo: { name: 'Empréstimo Forçado', class: 'illusion', tier: 3, form: 'alvo',
    numbers: { ...CLEAN, base: 12, damage: dmg(12, 3), cost: 45, cooldownMs: 16_000, range: 5, radius: undefined, stealBuff: true, castMs: 300 } },
  // ------------------------------------------------------------------ v52: pacote de posição
  // Troca de lugar: você e o alvo focado (ou o mais perto) trocam de posição
  shadow_troca: { name: 'Passo Trocado', class: 'shadow', tier: 3, form: 'alvo',
    numbers: { ...CLEAN, base: 14, damage: dmg(14, 3), cost: 43, cooldownMs: 14_000, range: 6, swap: true, castMs: 200 } },
  // Gancho: linha que puxa o primeiro inimigo até ficar a 1 casa de você
  water_laco: { name: 'Laço da Correnteza', class: 'water', tier: 2, form: 'linha',
    numbers: { ...CLEAN, base: 16, damage: dmg(16, 2), cost: 27, cooldownMs: 10_000, range: 6, hook: true, wet: true, castMs: 200 } },
  // Dois toques: o 1º marca o lugar; o 2º, em até 4 s, teleporta de volta
  lightning_volta: { name: 'Ida e Volta', class: 'lightning', tier: 2, form: 'retorno',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 20, cooldownMs: 12_000, range: 0, returnMs: 4000 } },
  // Clone que repete: copia, do lugar dele, o seu próximo jutsu em linha, com metade do dano (uma vez)
  illusion_voz: { name: 'Segunda Voz', class: 'illusion', tier: 4, form: 'invocacao',
    numbers: { ...CLEAN, base: 0, damage: 0, cost: 60, cooldownMs: 25_000, range: 0, radius: undefined, summonType: 'clone_agua', summonHp: 0.2, durationMs: 8000, echo: 0.5, castMs: 500 } },
};

export const MEC_MASTERY: Readonly<Record<string, readonly MasteryGain[]>> = {
  shadow_beijo: ['dano', 'recarga'],
  weapons_peconha: ['efeito', 'recarga'],  // o veneno dura mais sem novo acerto (o dano dele é o das cargas)
  taijutsu_furia: ['dano', 'recarga'],
  stone_resposta: ['dano', 'recarga'],
  wind_espelho: ['recarga'],
  fire_marca: ['dano', 'efeito'],          // a marca dura mais
  illusion_emprestimo: ['dano', 'recarga'],
  shadow_troca: ['dano', 'recarga'],
  water_laco: ['dano', 'recarga'],
  lightning_volta: ['recarga'],
  illusion_voz: ['duracao', 'protecao'],
  heal_meridianos: ['recarga'],            // o dano vem do chakra tirado: só a recarga melhora
};

export const MEC_TEXT: Readonly<Record<string, { icon: string; text: string }>> = {
  shadow_beijo: { icon: '🧛', text: 'Sombra em linha ({range} casas): fere o primeiro inimigo e {lifesteal} do dano volta como cura para você (até 10% da sua vida).' },
  weapons_peconha: { icon: '☠️', text: 'Lâmina envenenada em linha ({range} casas): cada acerto soma uma carga de veneno (até {poisonMax}), {poison} de dano por segundo por carga. As cargas somem {poisonMs} depois do último acerto.' },
  taijutsu_furia: { icon: '😤', text: 'Avanço de até {range} casas: quanto menos vida você tem, mais bate (até {lowHpBonus} a mais com 25% da vida ou menos).' },
  stone_resposta: { icon: '🔁', text: 'Fica em guarda por {counterMs}: o próximo golpe direto é anulado, e o ninja que bateu leva o troco e fica atordoado por {counterStunMs}. Se ninguém bater, o jutsu se perde.' },
  wind_espelho: { icon: '🏓', text: 'Por {reflectMs}, o primeiro projétil que bater em você volta para quem lançou.' },
  fire_marca: { icon: '🔶', text: 'Chama em linha ({range} casas) que marca o primeiro inimigo por {brandMs}: o seu próximo jutsu nele explode a marca, com {brandBonus} do dano a mais.' },
  illusion_emprestimo: { icon: '🤏', text: 'No alvo (até {range} casas): dano leve, e o escudo e os bônus ativos dele (Básico, velocidade) passam para você pelo tempo que faltava.' },
  shadow_troca: { icon: '🔃', text: 'Você e o alvo (focado ou o mais perto, até {range} casas) trocam de lugar, e ele leva dano leve.' },
  water_laco: { icon: '🎣', text: 'Laço em linha ({range} casas): fere o primeiro inimigo, deixa molhado e puxa ele até você.' },
  lightning_volta: { icon: '⏪', text: 'Dois toques: o primeiro marca o lugar onde você está; o segundo, em até {returnMs}, teleporta você de volta. A recarga começa na volta.' },
  illusion_voz: { icon: '🗣️', text: 'Cria um clone ao seu lado por {durationMs}: ele repete, do lugar dele, o seu próximo jutsu em linha, com {echo} do dano.' },
  heal_meridianos: { icon: '🈲', text: 'Sela os pontos de chakra do alvo (até {range} casas): tira até {chakraBurn} de chakra dele e causa dano pelo que tirou.' },
};
