// Importa os desenhos feitos na pxl para o gerador: lê os PNGs que `pxl build` gera e grava as grades (comprimidas)
// no bloco marcado de boneco-base.js. Uso: node arte/boneco-base/pxl/importar-pxl.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const PXL = join(homedir(), '.claude/skills/pxl-pixel-art/bin/pxl.js');
// Todas as peças vêm de pecas.px.js (gerado por exportar-para-pxl.mjs). Sprites <peça>_<direção>[_tras].
const FONTE = join(here, 'pecas.px.js');
// Tom de cada cor da paleta (1 contorno, 2 sombra, 3 base, 4 luz), lido do pal() do arquivo.
const TOM = { k: 1, s: 2, b: 3, l: 4 };

function lerPNG(arq) {
  const buf = readFileSync(arq);
  let pos = 8, w = 0, h = 0, tipo = 0; const idat = []; let plte = null, trns = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const t = buf.toString('ascii', pos + 4, pos + 8); const d = buf.subarray(pos + 8, pos + 8 + len);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); tipo = d[9]; if (d[8] !== 8) throw new Error('PNG de 8 bits apenas'); }
    if (t === 'PLTE') plte = d; if (t === 'tRNS') trns = d; if (t === 'IDAT') idat.push(d);
    pos += 12 + len;
  }
  const bpp = { 6: 4, 2: 3, 3: 1, 0: 1, 4: 2 }[tipo]; const raw = inflateSync(Buffer.concat(idat)); const st = w * bpp;
  const px = Buffer.alloc(w * h * 4); let prev = Buffer.alloc(st);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)]; const row = Buffer.from(raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)));
    for (let i = 0; i < st; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      row[i] = (row[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (tipo === 6) row.copy(px, o, x * 4, x * 4 + 4);
      else if (tipo === 2) { row.copy(px, o, x * 3, x * 3 + 3); px[o + 3] = 255; }
      else if (tipo === 3) { const k = row[x]; plte.copy(px, o, k * 3, k * 3 + 3); px[o + 3] = trns && k < trns.length ? trns[k] : 255; }
      else throw new Error('tipo de PNG não suportado: ' + tipo);
    }
    prev = row;
  }
  return { w, h, px };
}

let js = readFileSync(join(here, '..', 'boneco-base.js'), 'utf8');
execFileSync('node', [PXL, 'build', FONTE, '--out', join(here, 'out')], { stdio: 'pipe' });
const texto = readFileSync(FONTE, 'utf8');
const pal = JSON.parse(texto.match(/pal\((\{[^)]*\})\)/)[1].replace(/(\w+):/g, '"$1":'));
const corTom = Object.fromEntries(Object.entries(pal).map(([k, hex]) => [hex.toLowerCase(), TOM[k]]));
const dados = {};
const nomes = [...texto.matchAll(/^sprite\("([a-z][a-z0-9_]*?)_(frente|costas|lado)(_tras)?"/gm)];
for (const [, peca, view, tras] of nomes) {
  const d = view + (tras || '');
  const { w, h, px } = lerPNG(join(here, 'out', 'sprites', `${peca}_${d}.png`));
  // O contorno da pxl cresce 1 pixel de cada lado: um sprite de 64 x 96 sai com 66 x 98.
  const m = w === 66 && h === 98 ? 1 : 0;
  if (w - 2 * m !== 64 || h - 2 * m !== 96) throw new Error(`${peca}_${d}: o quadro precisa ser 64 x 96, veio ${w} x ${h}`);
  let s = '';
  for (let i = 0; i < 64 * 96; i++) {
    const o = (((i / 64) | 0) + m) * w * 4 + ((i % 64) + m) * 4;
    if (px[o + 3] < 128) { s += '.'; continue; }
    const hex = '#' + [0, 1, 2].map((k) => px[o + k].toString(16).padStart(2, '0')).join('');
    const t = corTom[hex];
    if (!t) throw new Error(`${peca}_${d}: cor fora da paleta ${hex}`);
    s += '.ksbl'[t];
  }
  (dados[peca] = dados[peca] || {})[d] = s.replace(/(.)\1*/g, (r, c) => (r.length > 1 ? r.length : '') + c);
}
const ini = '// <pxl:pecas>', fim = '// </pxl:pecas>';
const a = js.indexOf(ini), b = js.indexOf(fim);
if (a < 0 || b < 0) throw new Error('bloco // <pxl:pecas> não encontrado em boneco-base.js');
js = js.slice(0, a) + `${ini}\n  Object.assign(PXL_ARTE, ${JSON.stringify(dados)});\n  ${fim}` + js.slice(b + fim.length);
writeFileSync(join(here, '..', 'boneco-base.js'), js);
console.log(`importado: ${nomes.length} desenhos de ${Object.keys(dados).length} peças`);
