/*
 * Os 10 poderes da Akatsuki (docs/endgame.md, seção 4): um por vaga, um botão a mais na tela, só dos membros.
 * Os números ficam aqui; quem aplica é o mundo (gameWorld.power), sempre na posição do SERVIDOR, com as mesmas
 * hitboxes dos jutsus (combat.ts). O cliente só mostra o nome, a recarga e a animação.
 */

export type PowerKind = 'pull' | 'drain' | 'lifesteal' | 'blast' | 'strings' | 'crows' | 'hearts' | 'roots' | 'paper' | 'mask';

export interface PowerDef {
  slot: number;
  code: PowerKind;
  name: string;
  /** Texto curto do botão (o que faz). */
  text: string;
  cooldownMs: number;
  /** Chakra gasto. */
  cost: number;
  /** Alcance (casas): linha, projétil, teleporte, leque. */
  range?: number;
  /** Raio (casas): área em volta de si ou da explosão. */
  radius?: number;
  damage?: number;
  /** Duração do efeito (ms): atordoar, prender, buff, intangível. */
  ms?: number;
  /** Lâmina Sanguessuga: chakra drenado por golpe. Foice: fração do dano que cura. Raízes: bônus de velocidade. */
  amount?: number;
  /** Fios: quanto puxa (casas). Cinco Corações: cargas. Chuva de Papel: lâminas. */
  count?: number;
  /** Chuva de Papel: abertura do leque (graus). */
  arcDeg?: number;
}

export const POWERS: readonly PowerDef[] = [
  { slot: 1, code: 'pull', name: 'Atração do Vazio', text: 'Puxa os inimigos perto e atordoa', cooldownMs: 18_000, cost: 30, radius: 4, ms: 1000 },
  { slot: 2, code: 'drain', name: 'Lâmina Sanguessuga', text: 'Golpes drenam chakra por 12 s', cooldownMs: 25_000, cost: 20, ms: 12_000, amount: 12 },
  { slot: 3, code: 'lifesteal', name: 'Foice do Pacto', text: 'Golpes curam 40% do dano por 12 s', cooldownMs: 25_000, cost: 20, ms: 12_000, amount: 0.4 },
  { slot: 4, code: 'blast', name: 'Argila Viva', text: 'Projétil que explode em área', cooldownMs: 14_000, cost: 35, range: 7, radius: 2.5, damage: 45 },
  { slot: 5, code: 'strings', name: 'Fios de Marionete', text: 'Prende o primeiro e puxa', cooldownMs: 16_000, cost: 25, range: 6, ms: 3000, count: 2 },
  { slot: 6, code: 'crows', name: 'Corvos da Ilusão', text: 'Atordoa todos em volta', cooldownMs: 20_000, cost: 35, radius: 3.5, ms: 2000 },
  { slot: 7, code: 'hearts', name: 'Cinco Corações', text: 'Os próximos 3 golpes perdem metade', cooldownMs: 22_000, cost: 25, count: 3, amount: 0.5 },
  { slot: 8, code: 'roots', name: 'Raízes Gêmeas', text: 'Teleporte longo e +20% de velocidade', cooldownMs: 15_000, cost: 25, range: 9, ms: 4000, amount: 0.2 },
  { slot: 9, code: 'paper', name: 'Chuva de Papel', text: '7 lâminas em leque', cooldownMs: 12_000, cost: 30, range: 5, damage: 20, count: 7, arcDeg: 100 },
  { slot: 10, code: 'mask', name: 'Máscara Intangível', text: '2,5 s sem dano nem atordoamento', cooldownMs: 24_000, cost: 30, ms: 2500 },
];

export const POWER_BY_SLOT: ReadonlyMap<number, PowerDef> = new Map(POWERS.map((p) => [p.slot, p]));
