import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/*
 * Lógica de foco (🎯) e câmera do CLIENTE (public/targeting.js), testada fora do navegador.
 * O import é dinâmico: o arquivo é JavaScript puro servido ao celular, sem tipos.
 */
const T: any = await import(new URL('../public/targeting.js', import.meta.url).href);
const me = { x: 50, y: 50 };
const mon = (id: string, x: number, y: number, hp = 60, diedAt = 0) => ({ id, x, y, hp, diedAt });

describe('cliente: foco (soft targeting)', () => {
  const monsters = [mon('m1', 53, 50), mon('m2', 51, 51), mon('m3', 50, 58), mon('m4', 70, 50)];

  it('sem foco: pega o mais perto dentro de 10 casas', () => {
    assert.equal(T.nextTarget(me, monsters, null), 'm2');
  });

  it('com foco: passa para o próximo mais perto e volta ao primeiro no fim (ciclo)', () => {
    const seq: string[] = [];
    let id: string | null = null;
    for (let i = 0; i < 4; i++) seq.push((id = T.nextTarget(me, monsters, id)));
    assert.deepEqual(seq, ['m2', 'm1', 'm3', 'm2'], 'm4 (20 casas) fica fora');
  });

  it('ignora mortos e os que estão morrendo; ninguém perto: null', () => {
    assert.equal(T.nextTarget(me, [mon('m1', 51, 50, 0), mon('m2', 52, 50, 60, 123)], null), null);
    assert.equal(T.nextTarget(me, [mon('m9', 70, 70)], null), null);
    assert.equal(T.nextTarget(me, [], 'm1'), null);
  });

  it('foco que saiu da lista (morreu/longe): o próximo toque volta para o mais perto', () => {
    assert.equal(T.nextTarget(me, monsters, 'm99'), 'm2');
  });

  it('um alvo só: tocar de novo mantém o mesmo', () => {
    assert.equal(T.nextTarget(me, [mon('m1', 52, 50)], 'm1'), 'm1');
  });

  it('empate de distância: ordem estável pelo id (o ciclo não "pula")', () => {
    const tie = [mon('m7', 52, 50), mon('m3', 48, 50)];
    assert.equal(T.nextTarget(me, tie, null), 'm3');
    assert.equal(T.nextTarget(me, tie, 'm3'), 'm7');
  });

  it('perde o foco: alvo morto ou jogador a mais de 12 casas', () => {
    assert.equal(T.keepFocus(me, mon('m1', 61, 50)), true);
    assert.equal(T.keepFocus(me, mon('m1', 62.5, 50)), false);
    assert.equal(T.keepFocus(me, mon('m1', 52, 50, 0)), false);
    assert.equal(T.keepFocus(me, undefined), false);
  });
});

describe('cliente: câmera com alvo', () => {
  const visible = (cam: any, p: { x: number; y: number }, viewW: number, viewH: number, tile: number) => {
    const t = tile * cam.scale;
    const sx = (p.x - (me.x + cam.ox)) * t + viewW / 2;
    const sy = (p.y - (me.y + cam.oy)) * t + viewH / 2;
    return sx >= 0 && sx <= viewW && sy >= 0 && sy <= viewH;
  };

  it('sem alvo: centrada no jogador, sem zoom', () => {
    assert.deepEqual(T.frameCamera(me, null, 844, 390, 35), { ox: 0, oy: 0, scale: 1 });
  });

  it('alvo perto: meio do caminho, sem zoom', () => {
    const c = T.frameCamera(me, { x: 54, y: 50 }, 844, 390, 35);
    assert.deepEqual(c, { ox: 2, oy: 0, scale: 1 });
  });

  it('jogador e alvo SEMPRE visíveis, em pé e deitado, para qualquer direção até o limite do foco (12)', () => {
    for (const [w, h, tile] of [[844, 390, 35], [390, 844, 35], [667, 375, 34], [360, 740, 33]] as const) {
      for (let a = 0; a < 360; a += 15) {
        for (const d of [3, 6, 10, 12]) {
          const target = { x: me.x + Math.cos((a * Math.PI) / 180) * d, y: me.y + Math.sin((a * Math.PI) / 180) * d };
          const cam = T.frameCamera(me, target, w, h, tile);
          assert.ok(visible(cam, me, w, h, tile), `jogador fora da tela ${w}x${h} a=${a} d=${d}`);
          assert.ok(visible(cam, target, w, h, tile), `alvo fora da tela ${w}x${h} a=${a} d=${d}`);
        }
      }
    }
  });

  it('não revela o mapa: deslocamento nunca passa de 5 casas e o zoom nunca abaixo de 0,6', () => {
    for (const d of [8, 12, 30, 100]) {
      const c = T.frameCamera(me, { x: me.x + d, y: me.y + d }, 390, 844, 35);
      assert.ok(Math.hypot(c.ox, c.oy) <= T.CAMERA.maxOffset + 1e-9);
      assert.ok(c.scale >= T.CAMERA.minScale && c.scale <= 1);
    }
  });

  it('transição suave (lerp): mesmo caminho a 60 e a 120 quadros por segundo', () => {
    const run = (fps: number) => {
      let v = 0;
      for (let i = 0; i < fps / 2; i++) v += (10 - v) * T.smoothing(1 / fps, T.CAMERA.followRate);   // meio segundo
      return v;
    };
    const at60 = run(60), at120 = run(120);
    assert.ok(at60 > 9 && at60 < 10, `chega perto sem pular: ${at60}`);
    assert.ok(Math.abs(at60 - at120) < 0.01);
    assert.ok(T.smoothing(1 / 60, T.CAMERA.followRate) < 0.15, 'cada quadro anda só um pouco (sem salto)');
  });
});
