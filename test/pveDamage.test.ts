import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { NO_ATTRIBUTES, type Attributes } from '../src/realtime/stats.js';
import { placeIn, setupWorld } from './support/world.js';

/*
 * Passo 1a do plano do duelo (`concepts_brief.md`): trava o dano CONTRA MONSTROS de hoje, golpe por golpe, antes de
 * mexer no equilíbrio. Cada caso lança o golpe de verdade no servidor, num monstro parado, sem clima e sem passiva de
 * vila, e confere o número que saiu. Quando o passo 1b mudar o dano base de propósito, esta tabela muda junto.
 */

const F = { x: 51, y: 10 };                                       // clareira da Floresta (fora da zona segura)
const USES = { 1: 0, 4: 2000 } as const;                          // contador de usos do nível de uso 1 e do 4

function config(): RealtimeConfig {
  return {
    ...REALTIME,
    combat: {
      ...REALTIME.combat,
      monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 },
      player: { ...REALTIME.combat.player, hpRegenPerSec: 0 },
    },
  };
}

interface Golpe {
  /** Jutsu (código do catálogo) ou o Ataque Básico. */
  skill: string | 'attack';
  attributes?: Partial<Attributes>;
  useLevel?: 1 | 4;
  weapon?: string | null;
  /** Distância do monstro, em casas, na frente do ninja. */
  dist?: number;
}

/** Lança o golpe num monstro parado e devolve o dano direto e o da queimadura (soma dos pulsos). */
function golpear(g: Golpe): { dano: number; queimadura: number } {
  const { world, connect, run } = setupWorld(config());
  const w = world as any;
  w.skyEffectsAt = () => null;                                   // sem clima e sem hora do dia
  const a = connect('ninja');
  placeIn(world, a.id, 'map_2', F.x, F.y);
  const s = w.sessions.get(a.id);
  s.village = null;                                              // sem passiva de vila
  s.attributes = { ...NO_ATTRIBUTES, ...(g.attributes ?? {}) };
  s.stats = w.statsFor(s.village, s.attributes);
  s.equipped = g.weapon ?? null;
  s.fx = 1;
  s.fy = 0;
  s.cooldowns = {};
  s.chakra = 1000;
  if (g.skill !== 'attack') {
    s.jutsus.set(g.skill, USES[g.useLevel ?? 1]);
    s.kits[s.activeKit] = [...s.kits[s.activeKit].slice(0, 3), g.skill];
  }
  const m = world.spawnMonster({ x: F.x + (g.dist ?? 2), y: F.y }, undefined, 'map_2');
  const mm = w.monsters.get(m.id);
  mm.hp = mm.maxHp = 100_000;
  a.send(g.skill === 'attack' ? { type: 'attack' } : { type: 'cast', skill: g.skill });
  assert.equal(a.conn.last('cast_failed'), undefined, `${g.skill} falhou: ${JSON.stringify(a.conn.last('cast_failed'))}`);
  // v29 (Jutsus v2): os selos (castMs) e o aviso no chão (Chuva de Meteoros: 0,8 s) vêm antes do golpe
  const cfg = g.skill === 'attack' ? undefined : w.config.combat.skills[g.skill];
  run(600 + (cfg?.castMs ?? 0) + (cfg?.zone ? cfg.zone.tickMs ?? 1000 : cfg?.durationMs && (cfg.shots || cfg.radius) ? cfg.durationMs : 0));
  const hits = () => a.conn.of('hit').filter((h: any) => h.target === 'monster' && h.id === m.id && h.kind === 'damage');
  const diretos = hits().length;
  assert.ok(diretos >= 1, `${g.skill}: o golpe não acertou o monstro`);
  const dano = hits()[0].amount;
  run(3600);
  const queimadura = hits().slice(1).reduce((t: number, h: any) => t + h.amount, 0);
  return { dano, queimadura };
}

/**
 * Dano contra monstros na v28 (passo 1b: jutsus x0,4; Ataque Básico e arma x0,5; o bônus de Armas vale pela metade
 * no Ataque Básico). Antes da v28 era, por exemplo, Fogo 25+9 / 218+75 e Ataque Básico com Espada Longa 40 / 79.
 * Cada linha: pontos no atributo do golpe, tier, nível de uso e "dano direto + queimadura somada nos 3 s". Contra um
 * monstro, sem clima e sem passiva de vila. Os jutsus de Armas usam a Kunai de Treino (+10 de dano base).
 */
const ESPERADO: Record<string, string[]> = {
  // v30: os tier 4 das outras classes viraram os da adaptação: Prisão do Vórtice (2 pulsos), Julgamento do Trovão (aviso),
  // Punho do Céu (5 socos no monstro), Dança dos Mil Cortes (8 cortes); o "+" soma os golpes depois do primeiro.
  // v29 (Jutsus v2): o tier 4 do Fogo virou a Chuva de Meteoros: o 1º meteoro + os outros 2 que caem no ponto mirado
  // (antes, o Inferno Escarlate: 28+9 / 36+12 / 67+24 / 87+30).
  fire: ['0 T1 U1 10+3', '0 T1 U4 13+6', '0 T4 U1 7+14', '0 T4 U4 9+18', '59 T1 U1 24+9', '59 T1 U4 31+12', '59 T4 U1 17+34', '59 T4 U4 22+44'],
  // v45: os pulsos de um jutsu dividido somam o dano exato do jutsu (antes cada pulso arredondava por conta própria)
  water: ['0 T1 U1 8+0', '0 T1 U4 10+0', '0 T4 U1 17+17', '0 T4 U4 22+22', '59 T1 U1 19+0', '59 T1 U4 25+0', '59 T4 U1 40+40', '59 T4 U4 53+52'],
  lightning: ['0 T1 U1 12+0', '0 T1 U4 16+0', '0 T4 U1 37+0', '0 T4 U4 48+0', '59 T1 U1 29+0', '59 T1 U4 37+0', '59 T4 U1 88+0', '59 T4 U4 114+0'],
  taijutsu: ['0 T1 U1 14+0', '0 T1 U4 18+0', '0 T4 U1 7+28', '0 T4 U4 9+36', '59 T1 U1 34+0', '59 T1 U4 44+0', '59 T4 U1 17+68', '59 T4 U4 22+88'],
  weapons: ['0 T1 U1 12+0', '0 T1 U4 16+0', '0 T4 U1 4+26', '0 T4 U4 5+34', '59 T1 U1 29+0', '59 T1 U4 38+0', '59 T4 U1 9+63', '59 T4 U4 12+82'],
  attack: [
    'sem arma {} 6', 'sem arma {"taijutsu":59} 14', 'sem arma {"weapons":59} 6',
    'kunai_training {} 11', 'kunai_training {"taijutsu":59} 19', 'kunai_training {"weapons":59} 14',
    'katana {} 20', 'katana {"taijutsu":59} 28', 'katana {"weapons":59} 30',
  ],
};

const N59 = { ninjutsu: 59 };
const T59 = { taijutsu: 59 };
const W59 = { weapons: 59 };

/** Classe, atributo que escala o dano e a distância do monstro (em casas) para o golpe acertar. */
const JUTSUS: [classe: string, atributo: Partial<Attributes>, dist: number][] = [
  ['fire', N59, 2],
  ['water', N59, 2],
  ['lightning', N59, 2],
  ['taijutsu', T59, 1.5],
  ['weapons', W59, 2],
];

describe('dano contra monstros (passos 1a e 1b do duelo)', () => {
  for (const [classe, attr, dist] of JUTSUS) {
    it(`${classe}: tiers 1 e 4, níveis de uso 1 e 4, com 0 e 59 pontos`, () => {
      const linhas: string[] = [];
      for (const pontos of [{}, attr]) {
        for (const tier of [1, 4] as const) {
          for (const useLevel of [1, 4] as const) {
            const skill = tier === 1 ? classe : `${classe}_4`;
            const r = golpear({ skill, attributes: pontos, useLevel, dist, weapon: classe === 'weapons' ? 'kunai_training' : null });
            linhas.push(`${Object.keys(pontos).length ? 59 : 0} T${tier} U${useLevel} ${r.dano}+${r.queimadura}`);
          }
        }
      }
      assert.deepEqual(linhas, ESPERADO[classe]);
    });
  }

  it('Ataque Básico: sem arma, Kunai de Treino e Espada Longa, com 0 e 59 pontos em Taijutsu e em Armas', () => {
    const linhas: string[] = [];
    for (const weapon of [null, 'kunai_training', 'katana']) {
      for (const attributes of [{}, T59, W59]) {
        const r = golpear({ skill: 'attack', attributes, weapon, dist: 1 });
        linhas.push(`${weapon ?? 'sem arma'} ${JSON.stringify(attributes)} ${r.dano}`);
      }
    }
    assert.deepEqual(linhas, ESPERADO.attack);
  });
});


describe('vida por nível (passo 1c do duelo)', () => {
  it('+6 de vida por nível acima do 1, somada à Vitalidade: nível 60 com 59 de Vitalidade = 733', () => {
    const { world, connect } = setupWorld(config());
    const w = world as any;
    const vida = (level: number, vitality: number) => w.statsFor(null, { ...NO_ATTRIBUTES, vitality }, level).maxHp;
    assert.equal(vida(1, 0), 100);
    assert.equal(vida(2, 0), 106);
    assert.equal(vida(60, 0), 454);
    assert.equal(vida(60, 59), 733);
    const a = connect('ninja', {});
    const s = w.sessions.get(a.id);
    assert.equal(s.stats.maxHp, 100, 'nível 1 entra com 100');
  });

  it('subir de nível soma 6 na vida máxima e na atual', () => {
    const { world, connect } = setupWorld(config());
    const w = world as any;
    const a = connect('ninja');
    const s = w.sessions.get(a.id);
    s.hp = 50;
    w.applyXp(a.id, 'ninja', 100, { totalXp: 100, rank: s.rank, promoted: false, level: 2, levelsGained: 1, statPoints: 1 });
    assert.equal(s.stats.maxHp, 106);
    assert.equal(s.hp, 56);
  });
});
