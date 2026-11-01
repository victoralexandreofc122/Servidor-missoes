import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { ITEMS, STARTER_SHOES, gearOf } from '../src/realtime/items.js';
import { FakeConn, setupWorld } from './support/world.js';

/*
 * Sapatos (v18, migração v12): equipamento dos pés, camada própria do boneco ("sapato" nos sprites). Todo ninja
 * começa com a Sandália Ninja calçada; sem sapato, o pé fica descalço. Todos veem o sapato de todos.
 */

const S = await import(new URL('../public/sprites.js', import.meta.url).href);
const { SPRITES } = await import(new URL('../public/spriteData.js', import.meta.url).href);
const RIG = await import(new URL('../public/rig.js', import.meta.url).href);
const ART = await import(new URL('../public/rigArt.js', import.meta.url).href);
const SHOES = ITEMS.filter((i) => i.kind === 'shoes');

function join(w: ReturnType<typeof setupWorld>, username: string, extra: Record<string, unknown> = {}) {
  const conn = new FakeConn();
  const id = randomUUID();
  const handle = w.world.join({ id, username, ...extra }, conn);
  return { id, conn, send: (msg: unknown) => handle.receive(JSON.stringify(msg)) };
}

describe('sapatos: catálogo e desenho', () => {
  it('quatro sapatos na Alfaiataria (sandálias e botas); a Sandália Ninja é a de quem começa', () => {
    assert.deepEqual(SHOES.map((i) => i.code), ['sandalia_ninja', 'sandalia_couro', 'botas_viagem', 'botas_ninja']);
    assert.ok(SHOES.every((i) => i.shop === 'clothes' && i.price! > 0 && i.hold === 'feet' && i.look));
    assert.equal(STARTER_SHOES, 'sandalia_ninja');
  });

  it('o cliente desenha cada sapato com o mesmo desenho e as mesmas cores do servidor, como camada própria do boneco', () => {
    assert.deepEqual(S.SHOES, Object.fromEntries(SHOES.map((i) => [i.code, { sprite: i.look!.sprite, colors: [...i.look!.colors] }])));
    assert.equal(S.DEFAULT_SHOES, STARTER_SHOES);
    const pixels = (code: string, only?: string[]) => {
      const f = ART.renderFigure({ ...S.DEFAULT_APPEARANCE, shoes: code }, RIG.poseOf('parado', 0.1), RIG.YAW_OF_DIR[2], { only });
      let n = 0;
      for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i]) n++;
      return n;
    };
    for (const { sprite, colors } of Object.values(S.SHOES) as { sprite: string; colors: string[] }[]) {
      for (const c of colors) assert.ok(SPRITES.paletas.roupa[c], `cor ${c}`);
      assert.ok(['sandalia', 'bota'].includes(sprite), sprite);
    }
    for (const code of Object.keys(S.SHOES)) assert.ok(pixels(code, ['sapato']) > 30, `${code}: a camada sozinha tem desenho`);
    assert.ok(pixels('botas_viagem', ['sapato']) > pixels('sandalia_ninja', ['sapato']), 'a bota sobe pela canela; a sandália deixa os dedos de fora');
    assert.equal(pixels('tamanco_falso', ['sapato']), 0, 'código estranho: descalço');
  });

  it('a roupa não tem mais sandália: sem sapato o pé fica descalço; com sapato, a camada "sapato" com as cores dele', () => {
    const look = { ...S.DEFAULT_APPEARANCE, outfit: 'vila' };
    assert.equal(S.layersFor(look).includes('sapato'), false, 'descalço');
    assert.equal(S.layersFor({ ...look, shoes: 'botas_viagem' }).includes('sapato'), true);
    assert.equal(S.layersFor({ ...look, shoes: 'tamanco_falso' }).includes('sapato'), false, 'código estranho: descalço');
    const m = ART.materialsFor({ ...look, shoes: 'botas_ninja' });
    const tone = (name: string, i: number) => SPRITES.paletas.roupa[name][i];
    const hex = (rgb: number[]) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    // Couro (sapato e detalhe) é um tom mais escuro que o pano da mesma cor; a sola é a cor 3 (cinza clara na Bota Ninja).
    assert.deepEqual([m.sapato, m.sapato2, m.sola].map((x: any) => hex(x.rgb[2])), [tone('preto', 1), tone('preto', 1), tone('cinza', 2)]);
    assert.equal(ART.materialsFor(look).sapato, undefined);
  });

  it('gearOf: o sapato vai nos pés; outro tipo de item não vira sapato', () => {
    assert.deepEqual(gearOf(null, null, 'botas_viagem'), { hand: null, back: null, scroll: null, feet: 'botas_viagem', body: null });
    assert.deepEqual(gearOf('kunai', null, 'kunai'), { hand: 'kunai', back: null, scroll: null, feet: null, body: null });
    assert.equal(gearOf(null, null).feet, null);
  });
});

describe('sapatos no jogo: calçar, descalçar e todos veem', () => {
  it('calçar troca o boneco para todos; descalçar deixa o pé de fora; quem chega depois já vê', async () => {
    const w = setupWorld();
    const a = join(w, 'kaito', { items: { sandalia_ninja: 1, botas_viagem: 1 }, equippedShoes: 'sandalia_ninja' });
    const b = join(w, 'mei');
    assert.equal(b.conn.last('welcome').players.find((p: any) => p.id === a.id).gear.feet, 'sandalia_ninja');
    a.send({ type: 'equip', item: 'botas_viagem', slot: 'feet' });
    assert.deepEqual(b.conn.last('player_gear'), { type: 'player_gear', playerId: a.id, gear: { hand: null, back: null, scroll: null, feet: 'botas_viagem', body: null } });
    assert.equal(a.conn.last('inventory').equippedShoes, 'botas_viagem');
    a.send({ type: 'equip', item: null, slot: 'feet' });
    assert.equal(b.conn.last('player_gear').gear.feet, null, 'descalço');
    assert.equal(a.conn.last('inventory').equippedShoes, null);
    a.send({ type: 'equip', item: 'sandalia_ninja', slot: 'feet' });
    const c = join(w, 'hana');
    assert.equal(c.conn.last('welcome').players.find((p: any) => p.id === a.id).gear.feet, 'sandalia_ninja');
  });

  it('só sapato vai nos pés, e só um que ele tem; esconder a arma (⚙️) não tira o sapato', () => {
    const w = setupWorld();
    const a = join(w, 'kaito', { items: { kunai: 1, sandalia_ninja: 1 }, equippedShoes: 'sandalia_ninja' });
    a.send({ type: 'equip', item: 'kunai', slot: 'feet' });
    assert.equal(a.conn.last('error').code, 'NOT_SHOES');
    a.send({ type: 'equip', item: 'botas_ninja', slot: 'feet' });
    assert.equal(a.conn.last('error').code, 'ITEM_NOT_OWNED');
    a.send({ type: 'equip', item: 'sandalia_ninja', slot: 'weapon' });
    assert.equal(a.conn.last('error').code, 'NOT_A_WEAPON');
    a.send({ type: 'set_display', cape: false, weapon: false, scroll: false });
    const b = join(w, 'mei');
    assert.equal(b.conn.last('welcome').players.find((p: any) => p.id === a.id).gear.feet, 'sandalia_ninja');
  });
});
