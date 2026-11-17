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
// Toda peça precisa passar no padrão antes de qualquer arquivo ser gerado.
const problemas = B.validarPecas();
if (problemas.length) { console.error('Peças fora do padrão:\n- ' + problemas.join('\n- ')); process.exit(1); }
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
    rgba(B.colorOf(t, m.look)).forEach((val, i) => { sheet[o + i] = val; });
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
    const [r, gg, b, al] = rgba(B.colorOf(tone, model.look));
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

// GIF animado de cada animação: os dois modelos nas 4 direções, 2x, sobre grama.
function lzw(min, idx) {
  const clear = 1 << min, eoi = clear + 1;
  let size = min + 1, next = eoi + 1, dict = new Map(), cur = 0, bits = 0;
  const outB = [];
  const emit = (c) => { cur |= c << bits; bits += size; while (bits >= 8) { outB.push(cur & 255); cur >>>= 8; bits -= 8; } };
  emit(clear);
  let pfx = idx[0];
  for (let k = 1; k < idx.length; k++) {
    const kk = pfx * 256 + idx[k];
    if (dict.has(kk)) { pfx = dict.get(kk); continue; }
    emit(pfx);
    if (next < 4096) { dict.set(kk, next++); if (next > (1 << size) && size < 12) size++; }
    else { emit(clear); dict = new Map(); size = min + 1; next = eoi + 1; }
    pfx = idx[k];
  }
  emit(pfx); emit(eoi);
  if (bits > 0) outB.push(cur & 255);
  return outB;
}
function gif(w, h, frames, fps) {
  const colors = new Map();
  const indexed = frames.map((px) => {
    const idx = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) {
      const c = (px[k * 4] << 16) | (px[k * 4 + 1] << 8) | px[k * 4 + 2];
      if (!colors.has(c)) colors.set(c, colors.size);
      idx[k] = colors.get(c);
    }
    return idx;
  });
  if (colors.size > 256) throw new Error('GIF: mais de 256 cores');
  const table = Buffer.alloc(768);
  colors.forEach((n, c) => { table[n * 3] = c >> 16; table[n * 3 + 1] = (c >> 8) & 255; table[n * 3 + 2] = c & 255; });
  const u16 = (n) => [n & 255, n >> 8];
  const parts = [Buffer.from('GIF89a'), Buffer.from([...u16(w), ...u16(h), 0xf7, 0, 0]), table,
    Buffer.from([0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0])];
  indexed.forEach((idx) => {
    parts.push(Buffer.from([0x21, 0xf9, 4, 4, ...u16(Math.round(100 / fps)), 0, 0]));
    parts.push(Buffer.from([0x2c, 0, 0, 0, 0, ...u16(w), ...u16(h), 0, 8]));
    const data = lzw(8, idx);
    for (let k = 0; k < data.length; k += 255) { const sl = data.slice(k, k + 255); parts.push(Buffer.from([sl.length, ...sl])); }
    parts.push(Buffer.from([0]));
  });
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}
mkdirSync(join(out, 'gif'), { recursive: true });
Object.keys(B.ANIMS).forEach((n) => {
  const sc = 2, w = B.W * sc * 4, h = B.H * sc * 2;
  const frames = B.ANIMS[n].frames.map((pose) => {
    const buf = Buffer.alloc(w * h * 4);
    for (let k = 0; k < w * h; k++) { buf[k * 4] = 63; buf[k * 4 + 1] = 125; buf[k * 4 + 2] = 58; buf[k * 4 + 3] = 255; }
    B.SEXES.forEach((sx, r) => B.VIEWS.forEach((v, c) => put(buf, w, B.build(sx, v, pose), c * B.W * sc, r * B.H * sc, sc)));
    return buf;
  });
  writeFileSync(join(out, 'gif', `${n}.gif`), gif(w, h, frames, B.ANIMS[n].fps));
});

// Visuais de exemplo: prancha parada e GIFs vestidos (as peças acompanham as animações).
const VISUAIS = [
  { cabelo: 'ourico', corCabelo: 'laranja', bandana: 'azul', superior: 'camiseta', corSuperior: 'laranja', estampa: 'espiral', corEstampa: 'vermelho', inferior: 'calca', corInferior: 'laranja', pes: 'azul' },
  { cabelo: 'juba', corCabelo: 'branco', acessorio: 'cachecol', corAcessorio: 'vermelho', superior: 'manga_longa', corSuperior: 'roxo', estampa: 'listra', corEstampa: 'branco', inferior: 'shorts', corInferior: 'preto', pes: 'preto', maos: 'preto' },
  { cabelo: 'topete_torto', corCabelo: 'cinza', bandana: 'preto', acessorio: 'mascara', corAcessorio: 'azul', superior: 'manga_longa', corSuperior: 'azul', peca: 'colete', corPeca: 'verde', inferior: 'calca', corInferior: 'azul', pes: 'azul', maos: 'azul' },
  { cabelo: 'curto', corCabelo: 'vermelho', superior: 'camiseta', corSuperior: 'preto', estampa: 'chama', corEstampa: 'laranja', peca: 'capa', corPeca: 'vermelho', inferior: 'calca', corInferior: 'preto', pes: 'marrom' },
];
{
  const sc = 2, w = B.W * sc * 8, h = B.H * sc * VISUAIS.length;
  const buf = Buffer.alloc(w * h * 4);
  for (let k = 0; k < w * h; k++) { buf[k * 4] = 63; buf[k * 4 + 1] = 125; buf[k * 4 + 2] = 58; buf[k * 4 + 3] = 255; }
  VISUAIS.forEach((look, r) => B.SEXES.forEach((sx, si) => B.VIEWS.forEach((v, c) => put(buf, w, B.build(sx, v, null, look), (si * 4 + c) * B.W * sc, r * B.H * sc, sc))));
  writeFileSync(join(out, 'visuais.png'), png(w, h, buf));
}
// As 10 cores na mesma roupa (camiseta, calça e calçado), de frente.
{
  const sc = 2, w = B.W * sc * 10, h = B.H * sc * 2;
  const buf = Buffer.alloc(w * h * 4);
  for (let k = 0; k < w * h; k++) { buf[k * 4] = 63; buf[k * 4 + 1] = 125; buf[k * 4 + 2] = 58; buf[k * 4 + 3] = 255; }
  B.CATALOGO.cores.forEach((cor, c) => B.SEXES.forEach((sx, r) => put(buf, w, B.build(sx, 'frente', null, { cabelo: 'curto', superior: 'camiseta', corSuperior: cor, inferior: 'calca', corInferior: cor, pes: 'preto' }), c * B.W * sc, r * B.H * sc, sc)));
  writeFileSync(join(out, 'cores.png'), png(w, h, buf));
}
// Cabelos femininos e a juba, andando e correndo (GIF por animação).
const CABELOS = [['hime', 'roxo'], ['chiquinhas', 'vermelho'], ['coque_duplo', 'marrom'], ['rabo_alto', 'amarelo'], ['franja_lado', 'preto'], ['juba', 'branco'], ['longo', 'azul']];
['parado', 'andar', 'correr'].forEach((n) => {
  const sc = 2, w = B.W * sc * 4, h = B.H * sc * CABELOS.length;
  const frames = B.ANIMS[n].frames.map((pose) => {
    const buf = Buffer.alloc(w * h * 4);
    for (let k = 0; k < w * h; k++) { buf[k * 4] = 63; buf[k * 4 + 1] = 125; buf[k * 4 + 2] = 58; buf[k * 4 + 3] = 255; }
    CABELOS.forEach(([cab, cor], r) => B.VIEWS.forEach((v, c) => put(buf, w, B.build(cab === 'juba' ? 'm' : 'f', v, pose, { cabelo: cab, corCabelo: cor, superior: 'camiseta', corSuperior: 'branco', inferior: 'calca', corInferior: 'azul', pes: 'preto' }), c * B.W * sc, r * B.H * sc, sc)));
    return buf;
  });
  writeFileSync(join(out, 'gif', `cabelos-${n}.gif`), gif(w, h, frames, B.ANIMS[n].fps));
});
['andar', 'correr', 'selos', 'espada', 'cair'].forEach((n) => {
  const sc = 2, w = B.W * sc * 4, h = B.H * sc * 2;
  const frames = B.ANIMS[n].frames.map((pose) => {
    const buf = Buffer.alloc(w * h * 4);
    for (let k = 0; k < w * h; k++) { buf[k * 4] = 63; buf[k * 4 + 1] = 125; buf[k * 4 + 2] = 58; buf[k * 4 + 3] = 255; }
    B.SEXES.forEach((sx, r) => B.VIEWS.forEach((v, c) => put(buf, w, B.build(sx, v, pose, VISUAIS[r * 2 + (n === 'correr' || n === 'cair' ? 1 : 0)]), c * B.W * sc, r * B.H * sc, sc)));
    return buf;
  });
  writeFileSync(join(out, 'gif', `vestido-${n}.gif`), gif(w, h, frames, B.ANIMS[n].fps));
});
console.log('ok: arte/boneco-base.html, saida/boneco-base-sheet.png, saida/ancoras.json');
