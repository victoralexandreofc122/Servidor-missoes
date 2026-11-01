import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { ITEMS, gearOf } from '../src/realtime/items.js';
import { OUTFITS } from '../src/realtime/appearance.js';
import { FakeConn, setupWorld } from './support/world.js';

/*
 * Acessório (v27, migração v14): o casaco com capuz deixou de ser roupa do Criador e virou item do slot Acessório. Ele
 * fica POR CIMA da roupa equipada (camisa e calça ou o conjunto da vila), é uma peça só e todos veem.
 */

const S = await import(new URL('../public/sprites.js', import.meta.url).href);
const ART = await import(new URL('../public/rigArt.js', import.meta.url).href);
const ACC = ITEMS.filter((i) => i.kind === 'accessory');

function join(w: ReturnType<typeof setupWorld>, username: string, extra: Record<string, unknown> = {}) {
  const conn = new FakeConn();
  const id = randomUUID();
  const handle = w.world.join({ id, username, ...extra }, conn);
  return { id, conn, send: (msg: unknown) => handle.receive(JSON.stringify(msg)) };
}

describe('acessório: o casaco com capuz', () => {
  it('quatro casacos na Alfaiataria; o cliente desenha cada um na mesma cor do servidor; não é mais roupa do Criador', () => {
    assert.deepEqual(ACC.map((i) => i.code), ['casaco_petroleo', 'casaco_preto', 'casaco_vinho', 'casaco_verde']);
    assert.ok(ACC.every((i) => i.shop === 'clothes' && i.price! > 0 && i.hold === 'body' && i.coat));
    assert.deepEqual(ART.ACCESSORIES, Object.fromEntries(ACC.map((i) => [i.code, { kind: 'casaco', color: i.coat }])));
    assert.deepEqual([...OUTFITS], ['basica', 'vila']);
    assert.deepEqual(S.OPTIONS.outfit, ['basica', 'vila']);
    assert.equal(gearOf(null, null, null, 'casaco_preto').body, 'casaco_preto');
    assert.equal(gearOf(null, null, null, 'kunai').body, null, 'só acessório vai no slot');
  });

  it('vestir troca o boneco para todos; tirar volta à roupa; só acessório e só um que ele tem', () => {
    const w = setupWorld();
    const a = join(w, 'kaito', { items: { casaco_vinho: 1, kunai: 1 } });
    const b = join(w, 'mei');
    a.send({ type: 'equip', item: 'casaco_vinho', slot: 'body' });
    assert.equal(b.conn.last('player_gear').gear.body, 'casaco_vinho');
    assert.equal(a.conn.last('inventory').equippedAccessory, 'casaco_vinho');
    const c = join(w, 'hana');
    assert.equal(c.conn.last('welcome').players.find((p: any) => p.id === a.id).gear.body, 'casaco_vinho', 'quem chega depois já vê');
    a.send({ type: 'equip', item: null, slot: 'body' });
    assert.equal(b.conn.last('player_gear').gear.body, null);
    a.send({ type: 'equip', item: 'kunai', slot: 'body' });
    assert.equal(a.conn.last('error').code, 'NOT_ACCESSORY');
    a.send({ type: 'equip', item: 'casaco_preto', slot: 'body' });
    assert.equal(a.conn.last('error').code, 'ITEM_NOT_OWNED');
  });
});
