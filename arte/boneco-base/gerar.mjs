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
console.log('ok: arte/boneco-base.html, saida/boneco-base-sheet.png, saida/ancoras.json');
