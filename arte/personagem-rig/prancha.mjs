// Prancha do boneco novo (rig.js + rigArt.js) em PNG, para conferir a arte sem abrir o jogo.
//
//   node arte/personagem-rig/prancha.mjs saida.png [conjunto]
//
// Conjuntos: visuais (vários visuais, parado, 4 direções), anim (todas as animações), giro (virando em 16 passos),
// capas, camadas (cada camada sozinha). Escala 3 (cada pixel do boneco vira 3 x 3).

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { ANIMS, YAW_OF_DIR, poseOf } from '../../public/rig.js';
import { renderFigure } from '../../public/rigArt.js';

const [, , out = 'prancha.png', set = 'visuais', scaleArg] = process.argv;
const SC = Number(scaleArg) || 3;
const CW = 64, CH = 96;

const BASE = { v: 2, gender: 'm', skin: 'claro', hairStyle: 'espetado', hairColor: 'castanho', eyeStyle: 'masculino', eyeColor: 'azul',
  outfit: 'basica', shirtColor: 'azul_marinho', pantsColor: 'cinza', bandana: true, village: 'vila_1', shoes: 'sandalia_ninja' };
const DIRS = [0, 1, 3, 2];

function cells() {
  const list = [];
  if (set === 'visuais') {
    const looks = [
      BASE,
      { ...BASE, outfit: 'vila', hairColor: 'loiro', eyeColor: 'azul_claro' },
      { ...BASE, gender: 'f', hairStyle: 'longo_lateral', eyeStyle: 'cilios', hairColor: 'rosa', eyeColor: 'verde', skin: 'pessego', shirtColor: 'vermelho', pantsColor: 'preto', bandana: false, shoes: 'botas_ninja' },
      { ...BASE, gender: 'f', hairStyle: 'longo_lateral', eyeStyle: 'cilios', hairColor: 'preto', skin: 'caramelo', outfit: 'vila', village: 'vila_3' },
      { ...BASE, skin: 'ebano', hairColor: 'branco', eyeColor: 'vermelho', outfit: 'vila', village: 'vila_5', shoes: 'botas_viagem' },
    ];
    for (const look of looks) list.push(DIRS.map((d) => ({ look, anim: 'parado', t: 0.1, yaw: YAW_OF_DIR[d] })));
  } else if (set === 'anim') {
    for (const anim of Object.keys(ANIMS)) {
      for (const d of [0, 1]) {
        const n = 8;
        list.push(Array.from({ length: n }, (_, k) => ({ look: BASE, anim, t: ANIMS[anim].loop ? k / n : k / (n - 1), yaw: YAW_OF_DIR[d] })));
      }
    }
  } else if (set === 'giro') {
    list.push(Array.from({ length: 8 }, (_, k) => ({ look: BASE, anim: 'parado', t: 0.1, yaw: (k / 16) * Math.PI * 2 })));
    list.push(Array.from({ length: 8 }, (_, k) => ({ look: BASE, anim: 'parado', t: 0.1, yaw: ((k + 8) / 16) * Math.PI * 2 })));
  } else if (set === 'capas') {
    for (const cape of ['capa_viagem', 'manto_kage', 'manto_akatsuki', 'manto_campeao', 'capa_vila']) {
      list.push([...DIRS.map((d) => ({ look: BASE, anim: 'parado', t: 0.1, yaw: YAW_OF_DIR[d], opts: { cape } })),
        ...[1, 3].map((d) => ({ look: BASE, anim: 'correr', t: 0.25, yaw: YAW_OF_DIR[d], opts: { cape, flow: 1, phase: 0.25 } }))]);
    }
  } else if (set === 'camadas') {
    // Cada camada sozinha (presa nos mesmos ossos do corpo base) e o boneco montado, de frente, de lado e de costas.
    const look = { ...BASE, outfit: 'vila', shoes: 'sandalia_ninja' };
    const opts = { cape: 'capa_vila' };
    const layers = [['corpo'], ['olhos', 'boca'], ['cabelo'], ['chapeu'], ['camisa'], ['calca'], ['conjunto'], ['acessorio'], ['sapato'], ['capa'], null];
    for (const d of [0, 1, 3]) {
      list.push(layers.map((only) => ({ look, anim: 'parado', t: 0.1, yaw: YAW_OF_DIR[d], opts: { ...opts, only: only || undefined, noAnchor: true } })));
    }
    const fem = { ...look, gender: 'f', hairStyle: 'longo_lateral', eyeStyle: 'cilios', outfit: 'basica', bandana: false, hairColor: 'preto', shoes: 'botas_viagem' };
    list.push(layers.map((only) => ({ look: fem, anim: 'parado', t: 0.1, yaw: YAW_OF_DIR[0], opts: { only: only || undefined, noAnchor: true } })));
  } else if (set === 'olhos') {
    for (const eyes of ['abertos', 'fechados', 'foco', 'dor']) {
      for (const mouth of ['calma', 'grito', 'dentes']) {
        list.push([0, 2].map((d) => ({ look: BASE, anim: 'parado', t: 0.1, yaw: YAW_OF_DIR[d], patch: { eyes, mouth } })));
      }
    }
  }
  return list;
}

const rows = cells();
const cols = Math.max(...rows.map((r) => r.length));
const PW = cols * CW * SC + (cols + 1) * 6, PH = rows.length * CH * SC + (rows.length + 1) * 6;
const img = new Uint8Array(PW * PH * 4);
for (let i = 0; i < PW * PH; i++) { img[i * 4] = 232; img[i * 4 + 1] = 234; img[i * 4 + 2] = 240; img[i * 4 + 3] = 255; }
let ms = 0, count = 0;
rows.forEach((row, r) => row.forEach((c, k) => {
  const pose = { ...poseOf(c.anim, c.t), ...(c.patch || {}) };
  const flow = c.anim === 'correr' ? 1 : c.anim === 'andar' ? 0.35 : 0;
  const t0 = performance.now();
  const fig = renderFigure(c.look, pose, c.yaw, { flow, phase: c.t, ...(c.opts || {}) });
  ms += performance.now() - t0; count++;
  const ox = 6 + k * (CW * SC + 6), oy = 6 + r * (CH * SC + 6);
  for (let y = 0; y < CH * SC; y++) for (let x = 0; x < CW * SC; x++) {
    const o = ((oy + y) * PW + ox + x) * 4;
    const ground = Math.floor(y / SC) === 92;
    img[o] = ground ? 200 : 214; img[o + 1] = ground ? 204 : 220; img[o + 2] = ground ? 214 : 232;
  }
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const i = (y * CW + x) * 4;
    if (!fig.rgba[i + 3]) continue;
    for (let dy = 0; dy < SC; dy++) for (let dx = 0; dx < SC; dx++) {
      const o = ((oy + y * SC + dy) * PW + ox + x * SC + dx) * 4;
      img[o] = fig.rgba[i]; img[o + 1] = fig.rgba[i + 1]; img[o + 2] = fig.rgba[i + 2];
    }
  }
  // mão da arma (âncora) e a direção da lâmina, em vermelho
  const [hx, hy, , deg] = fig.anchors.hand;
  for (let s = 0; s < 18; s += 0.5) {
    const x = Math.round((hx + Math.cos((deg * Math.PI) / 180) * s) * SC), y = Math.round((hy + Math.sin((deg * Math.PI) / 180) * s) * SC);
    if (x < 0 || y < 0 || x >= CW * SC || y >= CH * SC || c.opts?.noAnchor) continue;
    const o = ((oy + y) * PW + ox + x) * 4;
    img[o] = 230; img[o + 1] = 40; img[o + 2] = 40;
  }
}));
console.log(`${count} bonecos, ${(ms / count).toFixed(2)} ms cada`);

function png(w, h, rgba) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8);
    b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length);
    return b;
  };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync(out, png(PW, PH, img));
