// V39: galeria de visuais com as camadas completas e as âncoras das armas, para a prancha (visuais.py).
//   node arte/personagem-pixel/visuais.mjs pasta visuais.json
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import * as m from '../../public/pixelHero.js';
const out = process.argv[2]; mkdirSync(out, { recursive: true });
function png(w, h, rgba) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const LOOKS = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const meta = {};
LOOKS.forEach((look, i) => {
  for (const v of m.VIEWS) {
    const f = m.renderHero('C', v, null, { look, segmentos: i === 0 });
    writeFileSync(`${out}/l${i}_${v}.png`, png(64, 96, f.rgba));
    meta[`l${i}_${v}`] = f.ancoras;
    if (f.segmentos) { meta[`seg_${v}`] = f.segmentos.map((g) => g.camada); f.segmentos.forEach((g) => writeFileSync(`${out}/seg_${v}_${g.ordem}.png`, png(64, 96, g.rgba))); }
    for (let k = 0; k < 6; k++) {
      const a = m.renderHero('C', v, { skel: { anim: 'andar', t: k / 6, bob: true }, limpeza: true }, { look });
      writeFileSync(`${out}/a${i}_${v}_${k}.png`, png(64, 96, a.rgba)); meta[`a${i}_${v}_${k}`] = a.ancoras;
    }
  }
});
writeFileSync(`${out}/meta.json`, JSON.stringify({ meta, looks: LOOKS }));
console.log('ok');
