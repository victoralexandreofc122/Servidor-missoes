import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME } from '../src/realtime/config.js';

// Módulo do cliente (JavaScript puro): importado direto de public/.
const { HOUSES, houseAt, housesOf, isVillage } = await import(new URL('../public/village.js', import.meta.url).href);

const village = { x: REALTIME.spawn.x, y: REALTIME.spawn.y, radius: REALTIME.village.radius };

describe('vila (cliente)', () => {
  it('chão de pedra num raio de 10 casas do centro; fora dele, grama', () => {
    assert.equal(isVillage(50, 50, village), true);
    assert.equal(isVillage(59, 50, village), true);
    assert.equal(isVillage(60, 50, village), false);
    assert.equal(isVillage(56, 56, village), true);   // ~9,2 na diagonal
    assert.equal(isVillage(57, 57, village), false);  // ~10,6
  });

  it('casas: todas dentro da pedra, fora do renascimento, do Mestre e das estradas', () => {
    const houses = housesOf(village);
    assert.equal(houses.length, HOUSES.length);
    const npc = REALTIME.npcs[0]!;
    assert.equal(houseAt(Math.floor(village.x), Math.floor(village.y), houses), false, 'renascimento livre');
    assert.equal(houseAt(Math.floor(npc.x), Math.floor(npc.y), houses), false, 'Mestre livre');
    for (const h of houses) {
      for (let x = h.x; x < h.x + h.w; x++) {
        for (let y = h.y; y < h.y + h.h; y++) {
          assert.ok(isVillage(x, y, village), `casa fora da vila em ${x},${y}`);
          assert.ok(x !== village.x && y !== village.y, `casa na estrada em ${x},${y}`);
        }
      }
    }
  });

  it('monstros não nascem na vila (área segura maior que o raio de pedra)', () => {
    assert.ok(REALTIME.combat.monsters.safeRadius > REALTIME.village.radius);
  });
});
