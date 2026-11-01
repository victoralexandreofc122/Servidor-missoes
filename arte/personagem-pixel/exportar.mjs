// Exporta o herói em pixel art (public/pixelHero.js) em PNG 1x, por penteado e por camada, mais o boneco atual
// (rig v27) na mesma pose, para a prancha de comparação (prancha.py).
//
//   node arte/personagem-pixel/exportar.mjs pasta_de_saida
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { renderHeroFront, renderHero, HAIR, VIEWS } from '../../public/pixelHero.js';
import { YAW_OF_DIR, poseOf } from '../../public/rig.js';
import { renderFigure } from '../../public/rigArt.js';

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

for (const k of Object.keys(HAIR)) {
  const f = renderHeroFront(k);
  writeFileSync(`${out}/frente_${k}.png`, png(f.w, f.h, f.rgba));
  for (const [L, buf] of Object.entries(f.layers)) writeFileSync(`${out}/camada_${k}_${L}.png`, png(f.w, f.h, buf));
}
for (const v of VIEWS) {
  const f = renderHero('C', v);
  writeFileSync(`${out}/C_${v}.png`, png(f.w, f.h, f.rgba));
}
const REF = { v: 2, gender: 'm', skin: 'pessego', hairStyle: 'baguncado', hairColor: 'preto', eyeStyle: 'masculino', eyeColor: 'azul_claro',
  outfit: 'basica', shirtColor: 'vinho', pantsColor: 'preto', bandana: false, village: 'vila_1', shoes: 'botas_ninja', accessory: 'casaco_petroleo' };
const dirs = { atual: 0, atual_frente: 0, atual_costas: 3, atual_direita: 2, atual_esquerda: 1 };
for (const [name, d] of Object.entries(dirs)) {
  const fig = renderFigure(REF, poseOf('parado', 0.1), YAW_OF_DIR[d], { noAnchor: true });
  const rgba = fig.rgba ?? fig.data ?? fig.pixels;
  writeFileSync(`${out}/${name}.png`, png(fig.w ?? 64, fig.h ?? 96, new Uint8Array(rgba.buffer ?? rgba)));
}
console.log('ok');

// Caminhada: 6 quadros por vista (WALK em public/pixelHero.js), um PNG por quadro.
import { walkPose, WALK } from '../../public/pixelHero.js';
for (const v of VIEWS) for (let k = 0; k < WALK.length; k++) {
  const f = renderHero('C', v, walkPose(v, k));
  writeFileSync(`${out}/andar_${v}_${k}.png`, png(f.w, f.h, f.rgba));
}
