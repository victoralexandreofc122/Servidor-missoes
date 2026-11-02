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
  run(600);
  const hits = () => a.conn.of('hit').filter((h: any) => h.target === 'monster' && h.id === m.id && h.kind === 'damage');
  const diretos = hits().length;
  assert.ok(diretos >= 1, `${g.skill}: o golpe não acertou o monstro`);
  const dano = hits()[0].amount;
  run(3600);
  const queimadura = hits().slice(1).reduce((t: number, h: any) => t + h.amount, 0);
  return { dano, queimadura };
}

/**
 * Dano de hoje (antes do passo 1b). Cada linha: pontos no atributo do golpe, tier, nível de uso e
 * "dano direto + queimadura somada nos 3 s". Contra um monstro, sem clima e sem passiva de vila.
 * Os jutsus de Armas usam a Kunai de Treino (+10 de dano base).
 */
const ESPERADO: Record<string, string[]> = {
  fire: ['0 T1 U1 25+9', '0 T1 U4 33+12', '0 T4 U1 70+24', '0 T4 U4 91+30', '59 T1 U1 60+21', '59 T1 U4 78+27', '59 T4 U1 168+57', '59 T4 U4 218+75'],
  water: ['0 T1 U1 20+0', '0 T1 U4 26+0', '0 T4 U1 56+0', '0 T4 U4 73+0', '59 T1 U1 48+0', '59 T1 U4 62+0', '59 T4 U1 134+0', '59 T4 U4 174+0'],
  lightning: ['0 T1 U1 30+0', '0 T1 U4 39+0', '0 T4 U1 84+0', '0 T4 U4 109+0', '59 T1 U1 72+0', '59 T1 U4 93+0', '59 T4 U1 201+0', '59 T4 U4 261+0'],
  taijutsu: ['0 T1 U1 35+0', '0 T1 U4 46+0', '0 T4 U1 98+0', '0 T4 U4 127+0', '59 T1 U1 84+0', '59 T1 U4 109+0', '59 T4 U1 235+0', '59 T4 U4 305+0'],
  weapons: ['0 T1 U1 28+0', '0 T1 U4 36+0', '0 T4 U1 60+0', '0 T4 U4 78+0', '59 T1 U1 67+0', '59 T1 U4 87+0', '59 T4 U1 144+0', '59 T4 U4 187+0'],
  attack: [
    'sem arma {} 12', 'sem arma {"taijutsu":59} 29', 'sem arma {"weapons":59} 12',
    'kunai_training {} 22', 'kunai_training {"taijutsu":59} 39', 'kunai_training {"weapons":59} 36',
    'katana {} 40', 'katana {"taijutsu":59} 57', 'katana {"weapons":59} 79',
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

describe('passo 1a: dano contra monstros de hoje (trava antes do equilíbrio)', () => {
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

