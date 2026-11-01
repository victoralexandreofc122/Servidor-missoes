// Quadros da caminhada das versões congeladas (v29/, v29_1/codigo/) e da atual, para comparar.
//   node arte/personagem-pixel/andar_quadros.mjs pasta_de_saida
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import * as atual from '../../public/pixelHero.js';
import * as v29 from './v29/pixelHero.v29.js';
import * as v291 from './v29_1/codigo/pixelHero.v29_1.js';

const out = process.argv[2] || 'saida';
mkdirSync(out, { recursive: true });
function png(w, h, rgba) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const [tag, m] of [['v29', v29], ['v291', v291], ['atual', atual]]) {
  for (const v of m.VIEWS) for (let k = 0; k < m.WALK.length; k++) {
    const f = m.renderHero('C', v, m.walkPose(v, k));
    writeFileSync(`${out}/${tag}_${v}_${k}.png`, png(f.w, f.h, f.rgba));
  }
}
for (const v of atual.VIEWS) for (let k = 0; k < atual.RUN.length; k++) {
  const f = atual.renderHero('C', v, atual.runPose(v, k));
  writeFileSync(`${out}/correr_${v}_${k}.png`, png(f.w, f.h, f.rgba));
}
console.log('ok');
