import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { MONSTER_ART_TYPES, loadPublicFiles } from '../src/web/staticFiles.js';
// @ts-expect-error: módulo do cliente em JavaScript puro (os dados gerados pelo recortar.py)
import { MONSTER_ART, PX_PER_TILE } from '../public/monsterData.js';
import { placeIn, setupWorld } from './support/world.js';

/*
 * v19: monstros em sprites (arte/monstros/recortar.py, estilo "tinta e brasa"). Os dados batem com os atlas, cada
 * habilidade que o servidor tem tem a sua animação, e o servidor avisa quando o monstro bate (monster_attack).
 */

/** Largura e altura de um WebP (cabeçalho VP8X, VP8L ou VP8). */
function webpSize(buf: Buffer): [number, number] {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
  }
  return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
}

const art = MONSTER_ART as Record<string, { file: string; height: number; frames: number[][]; anims: Record<string, { frames: number[]; fps: number; loop: boolean }> }>;
const TYPES = REALTIME.combat.monsterTypes;

describe('sprites dos monstros', () => {
  it('um atlas por monstro de caça (e o chefe), servido como image/webp; nenhum a mais', () => {
    const fighters = [REALTIME.combat.monsters.type, ...Object.keys(TYPES)].filter((t) => t !== 'dummy' && t !== 'sparring');
    assert.deepEqual(Object.keys(art).sort(), [...new Set(fighters)].sort());
    assert.deepEqual([...MONSTER_ART_TYPES].sort(), Object.keys(art).sort());
    const files = loadPublicFiles();
    const served = files.filter((f) => f.route.startsWith('/assets/monsters/'));
    assert.deepEqual(served.map((f) => f.route).sort(), Object.values(art).map((a) => `/${a.file}`).sort());
    for (const f of served) assert.equal(f.contentType, 'image/webp', f.route);
    for (const route of ['/monsterSprites.js', '/monsterData.js']) assert.ok(files.some((f) => f.route === route), route);
    for (const f of served) assert.ok((f.body as Buffer).length < 700 * 1024, `${f.route}: atlas leve para o celular`);
  });

  it('cada quadro cabe no atlas e tem o pé dentro (ou logo abaixo, no pulo)', () => {
    for (const [type, a] of Object.entries(art)) {
      const [W, H] = webpSize(readFileSync(new URL(`../public/${a.file}`, import.meta.url)));
      for (const [i, frame] of a.frames.entries()) {
        const [x, y, w, h, ax, ay] = frame as [number, number, number, number, number, number];
        assert.ok(x >= 0 && y >= 0 && x + w <= W && y + h <= H, `${type}#${i} fora do atlas`);
        assert.ok(ax >= -w && ax <= 2 * w, `${type}#${i}: pé x`);
        assert.ok(ay > 0 && ay <= h + PX_PER_TILE, `${type}#${i}: pé y`);
      }
      for (const [name, anim] of Object.entries(a.anims)) {
        assert.ok(anim.fps > 0 && anim.frames.length > 0, `${type}.${name}`);
        for (const f of anim.frames) assert.ok(f >= 0 && f < a.frames.length, `${type}.${name}: quadro ${f}`);
      }
    }
  });

  it('cada coisa que o monstro faz no servidor tem animação: parado, ataque, morte, golpe marcado e as fases do chefe', () => {
    for (const [type, a] of Object.entries(art)) {
      for (const need of ['idle', 'attack', 'death']) assert.ok(a.anims[need], `${type}: ${need}`);
      assert.equal(a.anims.idle!.loop, true);
      assert.equal(a.anims.death!.loop, false);
      const cfg = TYPES[type];
      if (cfg?.slam) for (const need of ['leap_windup', 'leap_land']) assert.ok(a.anims[need], `${type}: ${need} (golpe marcado)`);
      if (cfg?.boss) for (const need of ['summon', 'fury', 'fury_idle', 'crush_windup', 'crush_hit']) assert.ok(a.anims[need], `${type}: ${need} (fases)`);
    }
    assert.ok(art.rei_lodo!.height > art.lodo_escuro!.height && art.lodo_escuro!.height > art.slime!.height, 'o chefe é o maior');
  });

  it('o servidor avisa quando o monstro bate (monster_attack), antes do dano', () => {
    const config: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0 } } };
    const w = setupWorld(config);
    const a = w.connect('kaito');
    placeIn(w.world, a.id, 'map_2', 40, 50);
    const m = w.world.spawnMonster({ x: 41, y: 50 }, undefined, 'map_2', 'slime');
    w.run(2000);
    const att = a.conn.of('monster_attack');
    assert.ok(att.length >= 1, 'bateu');
    assert.deepEqual(att[0], { type: 'monster_attack', id: m.id, targetId: a.id });
    const kinds = a.conn.sent.map((x: any) => x.type);
    assert.ok(kinds.indexOf('monster_attack') < kinds.lastIndexOf('hit'), 'a animação chega antes do número de dano');
  });
});
