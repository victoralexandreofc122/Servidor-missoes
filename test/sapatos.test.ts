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

  it('o cliente desenha cada sapato com o mesmo desenho e as mesmas cores do servidor, e o desenho existe no atlas', () => {
    assert.deepEqual(S.SHOES, Object.fromEntries(SHOES.map((i) => [i.code, { sprite: i.look!.sprite, colors: [...i.look!.colors] }])));
    assert.equal(S.DEFAULT_SHOES, STARTER_SHOES);
    assert.ok(SPRITES.slots.indexOf('sapato') > SPRITES.slots.indexOf('conjunto'), 'o sapato vem depois da roupa (a bota cobre a barra)');
    for (const { sprite, colors } of Object.values(S.SHOES) as { sprite: string; colors: string[] }[]) {
      for (const g of ['m', 'f']) {
        assert.ok(SPRITES.generos[g].celulas[`parado/sapato/${sprite}/1/0/0`], `${sprite} (${g}) no atlas`);
        assert.ok(SPRITES.generos[g].celulas[`andar/sapato/${sprite}/1/1/1`], `${sprite} (${g}) andando de lado`);
      }
      for (const c of colors) assert.ok(SPRITES.paletas.roupa[c], `cor ${c}`);
    }
  });

  it('a roupa não tem mais sandália: sem sapato o pé fica descalço; com sapato, a camada "sapato" com as cores dele', () => {
    const look = { ...S.DEFAULT_APPEARANCE, outfit: 'vila' };
    assert.deepEqual(S.itemsFor(look).sapato, [], 'descalço');
    assert.deepEqual(S.itemsFor({ ...look, shoes: 'botas_viagem' }).sapato, ['bota']);
    assert.deepEqual(S.itemsFor({ ...look, shoes: 'sandalia_couro' }).sapato, ['sandalia']);
    assert.deepEqual(S.itemsFor({ ...look, shoes: 'tamanco_falso' }).sapato, [], 'código estranho: descalço');
    const ramps = S.rampsFor({ ...look, shoes: 'botas_ninja' }, 'sapato');
    assert.deepEqual([ramps[5], ramps[6], ramps[7]], [SPRITES.paletas.roupa.preto, SPRITES.paletas.roupa.cinza, SPRITES.paletas.roupa.marrom]);
    assert.notEqual(S.colorKey({ ...look, shoes: 'botas_ninja' }, 'sapato'), S.colorKey({ ...look, shoes: 'botas_viagem' }, 'sapato'));
  });

  it('gearOf: o sapato vai nos pés; outro tipo de item não vira sapato', () => {
    assert.deepEqual(gearOf(null, null, 'botas_viagem'), { hand: null, back: null, scroll: null, feet: 'botas_viagem' });
    assert.deepEqual(gearOf('kunai', null, 'kunai'), { hand: 'kunai', back: null, scroll: null, feet: null });
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
    assert.deepEqual(b.conn.last('player_gear'), { type: 'player_gear', playerId: a.id, gear: { hand: null, back: null, scroll: null, feet: 'botas_viagem' } });
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
