import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VILLAGES, type Village } from '../src/realtime/appearance.js';
import { activeModules, dueModules, type ModuleRow } from '../src/realtime/endgame.js';
import { REALTIME } from '../src/realtime/config.js';
import { WORLD_MAPS } from '../src/realtime/maps.js';
import { moveStep } from '../src/realtime/movement.js';
import {
  alliesOf, conflictHostile, mapAllowed, priceFactor, relationOf, type Diplomacy, type RelationRow, type WorldEvent,
} from '../src/realtime/villages.js';
// @ts-expect-error módulo JS do cliente (sem tipos)
import * as clientPolitics from '../public/politics.js';
// @ts-expect-error módulo JS do cliente (sem tipos)
import * as clientEndgame from '../public/endgame.js';
// @ts-expect-error módulo JS do cliente (sem tipos)
import { moveStep as clientMoveStep } from '../public/movement.js';

/*
 * Fim de jogo (v16): as contas PURAS da política. O servidor (villages.ts, endgame.ts) e o cliente (politics.js,
 * endgame.js) têm a MESMA conta: aqui se sorteiam estados e se compara o resultado dos dois. O cliente só usa para
 * desenhar (nome em vermelho, mapa travado na predição, preço); quem decide é o servidor.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)]!;

function randomDiplomacy(r: () => number, now: number): Diplomacy {
  const relations: RelationRow[] = [];
  for (let i = 0; i < VILLAGES.length; i++) {
    for (let j = i + 1; j < VILLAGES.length; j++) {
      const x = r();
      if (x < 0.3) relations.push({ a: VILLAGES[i]!, b: VILLAGES[j]!, state: 'guerra', declaredBy: VILLAGES[i]! });
      else if (x < 0.5) relations.push({ a: VILLAGES[i]!, b: VILLAGES[j]!, state: 'alianca', declaredBy: VILLAGES[j]! });
    }
  }
  const events: WorldEvent[] = [];
  if (r() < 0.3) events.push({ kind: 'tregua', a: null, b: null, startsAt: now - 1000, endsAt: r() < 0.5 ? now + 1000 : now - 1 });
  if (r() < 0.4) {
    const [a, b] = [pick(r, VILLAGES), pick(r, VILLAGES)].sort() as [Village, Village];
    if (a !== b) events.push({ kind: r() < 0.5 ? 'guerra' : 'tregua', a, b, startsAt: now - 10, endsAt: now + 10 });
  }
  return { relations, events };
}

describe('fim de jogo: módulos pela população', () => {
  const rows = (activated: string[], modes: Record<string, ModuleRow['mode']> = {}): ModuleRow[] =>
    (['vilas', 'pvp', 'renegados', 'akatsuki'] as const).map((code) => ({ code, mode: modes[code] ?? 'auto', activatedAt: activated.includes(code) ? 'x' : null }));

  it('um módulo só vale com os anteriores ligados; "on" do admin força, "off" desliga dali para a frente', () => {
    assert.deepEqual([...activeModules(rows(['vilas', 'pvp']))], ['vilas', 'pvp']);
    assert.deepEqual([...activeModules(rows(['pvp', 'renegados']))], [], 'sem vilas, nada');
    assert.deepEqual([...activeModules(rows([], { vilas: 'on', pvp: 'on' }))], ['vilas', 'pvp']);
    assert.deepEqual([...activeModules(rows(['vilas', 'pvp', 'renegados'], { pvp: 'off' }))], ['vilas']);
  });

  it('a população liga os que alcançou, em ordem, uma vez só (e nunca o que o admin desligou)', () => {
    const t = REALTIME.endgame.thresholds;
    assert.deepEqual(dueModules(rows([]), t.pvp, t), ['vilas', 'pvp']);
    assert.deepEqual(dueModules(rows(['vilas']), t.pvp, t), ['pvp']);
    assert.deepEqual(dueModules(rows([], { vilas: 'off' }), 1000, t), ['pvp', 'renegados', 'akatsuki']);
    assert.deepEqual(dueModules(rows([]), t.vilas - 1, t), []);
  });
});

describe('fim de jogo: cliente e servidor com a mesma conta', () => {
  it('relação, inimigo na Zona, aliados e preço: 400 estados sorteados', () => {
    const r = rng(7);
    const now = 1_000_000;
    for (let k = 0; k < 400; k++) {
      const d = randomDiplomacy(r, now);
      const a = r() < 0.15 ? null : pick(r, VILLAGES);
      const b = r() < 0.15 ? null : pick(r, VILLAGES);
      assert.equal(clientPolitics.relationOf(a, b, d, now), relationOf(a, b, d, now));
      const fa = { village: a, akatsuki: r() < 0.2 };
      const fb = { village: b, akatsuki: r() < 0.2 };
      assert.equal(clientPolitics.conflictHostile(fa, fb, d, now), conflictHostile(fa, fb, d, now));
      assert.deepEqual(clientPolitics.alliesOf(a, [...VILLAGES], d, now), alliesOf(a, d, now));
      assert.equal(clientPolitics.priceFactor(a, [...VILLAGES], d, now), priceFactor(a, d, now));
    }
  });

  it('acesso aos mapas: vila (dela e aliadas), Refúgio (só renegado); sem módulo, tudo aberto', () => {
    const access = { village: 'vila_3' as Village, allies: ['vila_1' as Village] };
    for (const layout of Object.values(WORLD_MAPS)) {
      assert.equal(clientPolitics.mapAllowed(layout, access), mapAllowed(layout, access), layout.id);
      assert.equal(clientPolitics.mapAllowed(layout, { village: null, allies: [] }), mapAllowed(layout, { village: null, allies: [] }));
      assert.equal(clientPolitics.mapAllowed(layout, undefined), true);
    }
    assert.equal(mapAllowed(WORLD_MAPS.map_1, access), true);
    assert.equal(mapAllowed(WORLD_MAPS.vila_nuvem, access), false);
    assert.equal(mapAllowed(WORLD_MAPS.refugio, access), false);
    assert.equal(mapAllowed(WORLD_MAPS.refugio, { village: null, allies: [] }), true);
  });

  it('a predição do cliente trava a mesma saída que o servidor (borda norte da Floresta para quem não é da Folha)', () => {
    const view = { modules: ['vilas'], relations: [], events: [], villages: [] };
    const access = clientEndgame.mapAccess(view, { village: 'vila_3' }, 0);
    assert.deepEqual(access, { village: 'vila_3', allies: [] });
    const gates = { tutorial: 4, access };
    const server = moveStep(WORLD_MAPS, 'map_2', 40, 0.4, 0, -1, 0.3, { tutorial: 4, access: { village: 'vila_3', allies: [] } });
    const client = clientMoveStep(WORLD_MAPS, 'map_2', 40, 0.4, 0, -1, 0.3, gates);
    assert.deepEqual(client, server);
    assert.equal(server[0], 'map_2');
    assert.equal(clientEndgame.mapAccess({ modules: [] }, { village: 'vila_3' }, 0), undefined);
  });

  it('nome e foco na Zona: inimigo, aliado, Akatsuki entre si; acampamento não', () => {
    const view = { modules: ['vilas', 'pvp'], relations: [{ a: 'vila_1', b: 'vila_4', state: 'alianca', declaredBy: 'vila_1' }], events: [], villages: [] };
    const map = WORLD_MAPS.zona_conflito;
    const safe = (x: number, y: number) => map.safeZones.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
    const me = { x: 40, y: 30, faction: { village: 'vila_1' } };
    const ally = { x: 41, y: 30, faction: { village: 'vila_4' } };
    const foe = { x: 41, y: 31, faction: { village: 'vila_3' } };
    const renegade = { x: 41, y: 32, faction: { village: null, bounty: 300 } };
    assert.equal(clientEndgame.zoneFoe(view, map, me, ally, safe), false);
    assert.equal(clientEndgame.zoneFoe(view, map, me, foe, safe), true);
    assert.equal(clientEndgame.zoneFoe(view, map, me, renegade, safe), true);
    assert.equal(clientEndgame.zoneFoe(view, map, me, { ...foe, x: 14, y: 12 }, safe), false, 'no acampamento');
    assert.equal(clientEndgame.zoneFoe(view, map, { ...me, faction: { village: null, akatsuki: 3 } }, { ...renegade, faction: { village: null, akatsuki: 5 } }, safe), false);
    assert.equal(clientEndgame.zoneFoe({ ...view, modules: ['vilas'] }, map, me, foe, safe), false, 'sem o módulo pvp');
    assert.equal(clientEndgame.factionStyle(view, me, renegade, true).bounty, 300);
    assert.equal(clientEndgame.factionStyle(view, me, ally, true).color, '#8fe08a');
    assert.equal(clientEndgame.factionStyle(view, me, { faction: { village: 'vila_1', kage: 'vila_1' } }, false).prefix, '👑 ');
  });

  it('capa e bandana riscada: camadas do boneco nas 4 direções, com o emblema nas costas e o risco na placa', async () => {
    const RIG = await import(new URL('../public/rig.js', import.meta.url).href);
    const ART = await import(new URL('../public/rigArt.js', import.meta.url).href);
    const look = { v: 2, gender: 'm', skin: 'claro', hairStyle: 'espetado', hairColor: 'preto', eyeStyle: 'masculino', eyeColor: 'azul',
      outfit: 'basica', shirtColor: 'azul_marinho', pantsColor: 'cinza', bandana: true, village: 'vila_3' };
    const count = (f: any, hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      let n = 0;
      for (let i = 0; i < f.rgba.length; i += 4) if (f.rgba[i + 3] && f.rgba[i] === r && f.rgba[i + 1] === g && f.rgba[i + 2] === b) n++;
      return n;
    };
    const px = (f: any) => { let n = 0; for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i]) n++; return n; };
    for (const cape of ['capa_viagem', 'capa_vila', 'manto_kage', 'manto_akatsuki', 'manto_campeao']) {
      for (const dir of [0, 1, 2, 3]) {
        const only = ART.renderFigure(look, RIG.poseOf('andar', 0.25), RIG.YAW_OF_DIR[dir], { cape, capeVillage: 'vila_3', only: ['capa'], flow: 0.35 });
        assert.ok(px(only) > 20, `${cape} na direção ${dir}`);
      }
    }
    // De costas: as brasas do Manto Cinza aparecem; a capa cobre as costas e os ombros.
    const back = ART.renderFigure(look, RIG.poseOf('parado', 0.1), RIG.YAW_OF_DIR[3], { cape: 'manto_akatsuki' });
    assert.ok(count(back, '#d9772b') > 10, 'brasas do Manto Cinza');
    // Renegado: a placa da bandana ganha o risco escuro (de frente).
    const scratch = (renegade: boolean) => count(ART.renderFigure(look, RIG.poseOf('parado', 0.1), 0, { renegade }), '#1b1512');
    assert.ok(scratch(true) >= 4 && scratch(false) === 0);
  });

  it('o preço da vila no cliente é o do banco (guerra +10%, aliança −5%)', () => {
    const view = { modules: ['vilas'], relations: [{ a: 'vila_1', b: 'vila_4', state: 'guerra', declaredBy: 'vila_1' }, { a: 'vila_1', b: 'vila_3', state: 'alianca', declaredBy: 'vila_1' }], events: [] };
    assert.equal(clientEndgame.shopFactor(view, { village: 'vila_1' }, 0), 1.1 * 0.95);
    assert.equal(clientEndgame.shopFactor(view, { village: null }, 0), 1);
    assert.equal(clientEndgame.shopFactor({ modules: [] }, { village: 'vila_1' }, 0), 1);
  });
});

describe('v13: só quatro vilas (a Pedra saiu)', () => {
  it('servidor, cliente, sprites, mapas e Zona de Conflito têm as mesmas: Folha, Névoa, Nuvem e Areia', async () => {
    const { VILLAGE_INFO } = await import('../src/realtime/villages.js');
    const { CONFLICT, VILLAGE_MAPS } = await import('../src/realtime/maps.js');
    // @ts-expect-error módulo JS do cliente (sem tipos)
    const { SPRITES } = await import('../public/spriteData.js');
    const four = ['vila_1', 'vila_3', 'vila_4', 'vila_5'];
    assert.deepEqual([...VILLAGES], four);
    assert.deepEqual(Object.keys(VILLAGE_INFO), four);
    assert.deepEqual(clientEndgame.VILLAGE_CODES, four);
    assert.deepEqual(Object.keys(clientEndgame.VILLAGE_COLORS), four);
    assert.deepEqual(clientEndgame.VILLAGE_NAMES, Object.fromEntries(four.map((v) => [v, VILLAGE_INFO[v as Village].name])), 'o nome no Criador é o do servidor');
    assert.deepEqual(Object.keys(SPRITES.vilas), four, 'o Criador só oferece estas');
    assert.deepEqual(VILLAGE_MAPS.map((m) => m.village), four);
    assert.deepEqual(CONFLICT.camps.map((c) => c.who), [...four, 'renegados'].sort((a, b) => (a === 'renegados' ? 1 : b === 'renegados' ? -1 : a.localeCompare(b))));
    assert.equal(Object.keys(WORLD_MAPS).some((id) => id.includes('pedra')), false);
  });
});
