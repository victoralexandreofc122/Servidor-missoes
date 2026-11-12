// Gera arte/boneco-base.html (página de teste, arquivo único), a prancha PNG e o JSON das âncoras.
// Uso: node arte/boneco-base/gerar.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(here, 'boneco-base.js'), 'utf8');
// O pacote é ESM; o arquivo é UMD (serve o navegador), então é avaliado com um `module` próprio.
const B = new Function('module', `${js}\nreturn module.exports;`)({ exports: {} });
const html = readFileSync(join(here, 'modelo.html'), 'utf8').replace('/*BONECO_BASE_JS*/', () => js);
writeFileSync(join(here, '..', 'boneco-base.html'), html);

function rgba(css) {
  if (css.startsWith('#')) return [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16)).concat(255);
  const m = css.match(/[\d.]+/g).map(Number);
  return [m[0], m[1], m[2], Math.round(m[3] * 255)];
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc(buf) { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}
function png(w, h, pixels) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) pixels.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Prancha: 3 colunas (frente, esquerda, costas) por 2 linhas (masculino, feminino), fundo transparente.
const out = join(here, 'saida');
mkdirSync(out, { recursive: true });
const cols = B.VIEWS.length, rowsN = B.SEXES.length;
const sheet = Buffer.alloc(B.W * cols * B.H * rowsN * 4);
const anchors = {};
B.SEXES.forEach((sx, r) => B.VIEWS.forEach((v, c) => {
  const m = B.build(sx, v);
  anchors[`${sx}_${v}`] = m.anchors;
  const g = B.flatten(m);
  for (let y = 0; y < B.H; y++) for (let x = 0; x < B.W; x++) {
    const t = g[y * B.W + x];
    if (!t) continue;
    const o = ((r * B.H + y) * B.W * cols + c * B.W + x) * 4;
    rgba(B.PALETTE[t]).forEach((val, i) => { sheet[o + i] = val; });
  }
}));
writeFileSync(join(out, 'boneco-base-sheet.png'), png(B.W * cols, B.H * rowsN, sheet));
writeFileSync(join(out, 'ancoras.json'), JSON.stringify({ largura: B.W, altura: B.H, linhaDosPes: B.FEET_Y, camadas: B.LAYERS, ancoras: anchors }, null, 2) + '\n');

// Sheet de animação por modelo: uma linha por direção, uma coluna por quadro (parado e depois andar).
const cells = [];
const meta = {};
Object.keys(B.ANIMS).forEach((n) => {
  meta[n] = { fps: B.ANIMS[n].fps, colunas: B.ANIMS[n].frames.map((_, k) => cells.length + k) };
  B.ANIMS[n].frames.forEach((f) => cells.push(f));
});
function put(buf, bw, model, ox, oy, sc) {
  const grid = B.flatten(model);
  for (let y = 0; y < B.H; y++) for (let x = 0; x < B.W; x++) {
    const tone = grid[y * B.W + x];
    if (!tone) continue;
    const [r, gg, b, al] = rgba(B.PALETTE[tone]);
    for (let j = 0; j < sc; j++) for (let k = 0; k < sc; k++) {
      const o = ((oy + y * sc + j) * bw + ox + x * sc + k) * 4;
      const a0 = al / 255;
      buf[o] = Math.round(r * a0 + buf[o] * (1 - a0)); buf[o + 1] = Math.round(gg * a0 + buf[o + 1] * (1 - a0));
      buf[o + 2] = Math.round(b * a0 + buf[o + 2] * (1 - a0)); buf[o + 3] = Math.max(buf[o + 3], al);
    }
  }
}
B.SEXES.forEach((sx) => {
  const w = B.W * cells.length, h = B.H * B.VIEWS.length;
  const buf = Buffer.alloc(w * h * 4);
  B.VIEWS.forEach((v, r) => cells.forEach((pose, c) => put(buf, w, B.build(sx, v, pose), c * B.W, r * B.H, 1)));
  writeFileSync(join(out, `boneco-${sx}-animacoes.png`), png(w, h, buf));
});
writeFileSync(join(out, 'animacoes.json'), JSON.stringify({ quadro: [B.W, B.H], linhas: B.VIEWS, animacoes: meta }, null, 2) + '\n');

// Prévia animada (APNG): os dois modelos nas 4 direções, 3x, sobre grama.
function apng(w, h, frames, fps) {
  let seq = 0;
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 6;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('acTL', Buffer.concat([u32(frames.length), u32(0)]))];
  frames.forEach((px, i) => {
    const fc = Buffer.alloc(26);
    fc.writeUInt32BE(seq++, 0); fc.writeUInt32BE(w, 4); fc.writeUInt32BE(h, 8);
    fc.writeUInt16BE(1, 20); fc.writeUInt16BE(fps, 22);
    parts.push(chunk('fcTL', fc));
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    const data = deflateSync(raw);
    parts.push(i === 0 ? chunk('IDAT', data) : chunk('fdAT', Buffer.concat([u32(seq++), data])));
  });
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
Object.keys(B.ANIMS).forEach((n) => {
  const sc = 3, w = B.W * sc * 4, h = B.H * sc * 2;
  const frames = B.ANIMS[n].frames.map((pose) => {
    const buf = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) { buf[i * 4] = 63; buf[i * 4 + 1] = 125; buf[i * 4 + 2] = 58; buf[i * 4 + 3] = 255; }
    B.SEXES.forEach((sx, r) => B.VIEWS.forEach((v, c) => put(buf, w, B.build(sx, v, pose), c * B.W * sc, r * B.H * sc, sc)));
    return buf;
  });
  writeFileSync(join(out, `previa-${n}.png`), apng(w, h, frames, B.ANIMS[n].fps));
});
console.log('ok: arte/boneco-base.html, saida/boneco-base-sheet.png, saida/ancoras.json');
