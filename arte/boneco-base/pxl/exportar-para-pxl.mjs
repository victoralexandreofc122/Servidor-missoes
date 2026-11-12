// Exporta todas as peças desenhadas (cabelos, bandana, acessórios, peças do tronco) para pecas.px.js, onde a pxl as
// desenha num estilo só. Depois, importar-pxl.mjs traz o resultado de volta para o gerador.
// Uso: node arte/boneco-base/pxl/exportar-para-pxl.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(here, '..', 'boneco-base.js'), 'utf8');
const B = new Function('module', `${js}\nreturn module.exports;`)({ exports: {} });
const VIEWS = ['frente', 'costas', 'lado'];
// Direções com desenho à mão (em <peça>.px.js, sprite _<peça>_mao_<direção>): entram por cima da base, sem as mechas do gerador.
const MAO = { juba: ['costas', 'lado'] };

// A pxl contorna por fora (cresce 1 pixel); o gerador contornava por dentro. Para manter o tamanho, a base perde 1 pixel
// de borda e as mechas ficam um pouco mais finas e curtas.
function corroer(m) {
  const o = new Uint8Array(m.length);
  const em = (x, y) => x >= 0 && y >= 0 && x < 64 && y < 96 && m[y * 64 + x];
  for (let y = 0; y < 96; y++) for (let x = 0; x < 64; x++) {
    if (em(x, y) && em(x - 1, y) && em(x + 1, y) && em(x, y - 1) && em(x, y + 1)) o[y * 64 + x] = 1;
  }
  return o;
}
function faixas(m) {
  const r = [];
  for (let y = 0; y < 96; y++) {
    let x = 0;
    while (x < 64) {
      if (!m[y * 64 + x]) { x++; continue; }
      const a = x; while (x < 64 && m[y * 64 + x]) x++;
      r.push([y, a, x - 1]);
    }
  }
  return r;
}
const fmt = (a) => a.map((v) => Math.round(v * 10) / 10);

let out = `// GERADO por exportar-para-pxl.mjs a partir das peças do gerador. Não edite à mão: mude a peça no gerador (ou o
// desenho à mão em <peça>.px.js) e exporte de novo. Estilo único para todas as peças:
// base em tom médio, sombra de 1 ou 2 linhas embaixo, luz em cima (no cabelo, um anel de brilho e fios de sombra);
// cada mecha com metade em sombra e um fio de luz na borda; mechas e cabelo de trás um tom mais escuros; contorno da pxl.
pal({ k: "#3b4252", s: "#9aa3b5", b: "#dfe5ee", l: "#ffffff" })
ramps("ksbl")
const HY = ${B.HY}

function mecha(x, y, ang, len, larg, curva = 0) {
  const esq = [], dir = [], n = 10
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = ((ang + curva * t) * Math.PI) / 180
    const cx = x + Math.cos(a) * len * t, cy = y + Math.sin(a) * len * t
    const r = (larg / 2) * (1 - t) ** 0.9
    esq.push([cx + Math.cos(a - Math.PI / 2) * r, cy + Math.sin(a - Math.PI / 2) * r])
    dir.push([cx + Math.cos(a + Math.PI / 2) * r, cy + Math.sin(a + Math.PI / 2) * r])
  }
  return { esq, dir }
}
const flat = (pts) => pts.flatMap(([a, b]) => [Math.round(a), Math.round(b)])
function pinta(m, tras) {
  const meio = m.esq.map((p, i) => [(p[0] + m.dir[i][0]) / 2, (p[1] + m.dir[i][1]) / 2])
  const ops = [poly(flat([...m.esq, ...m.dir.slice().reverse()]), tras ? "s" : "b"),
    poly(flat([...meio, ...m.dir.slice().reverse()]), "s")]
  if (!tras) ops.push(line(...flat([m.esq[1], m.esq[6]]), "l"))
  return ops
}
// Mecha vinda do gerador: um pouco mais fina e curta, porque o contorno da pxl cresce por fora.
// Uma mecha bem curta e larga é uma bola (coque, nó): vira uma elipse com sombra embaixo e luz em cima.
const M = (x, y, ang, len, larg, curva, tras) => len <= 2
  ? [ellipse(x, y, larg / 2 - 1, larg / 2 - 1, tras ? "s" : "b"),
     shade((px, py) => (px - x) ** 2 + (py - y) ** 2 <= (larg / 2 - 1) ** 2 && py >= y + larg / 4),
     light((px, py) => (px - x + 1) ** 2 + (py - y + 2) ** 2 <= 2)]
  : pinta(mecha(x, y, ang, Math.max(2, len - 1), Math.max(2.5, larg - 1.5), curva), tras)
// Base (forma lisa) em faixas [y, x0, x1].
function base(R, { cabelo, tras }) {
  const S = new Set(); for (const [y, a, b] of R) for (let x = a; x <= b; x++) S.add(y * 64 + x)
  const em = (x, y) => S.has(y * 64 + x)
  const ops = R.map(([y, a, b]) => rect(a, y, b - a + 1, 1, tras ? "s" : "b"))
  if (tras) return ops
  const embaixo = (x, y) => !em(x, y + 1) || (cabelo && !em(x, y + 2))
  const fios = (x, y) => cabelo && y > HY + 6 && (x + Math.floor(y / 7)) % 4 === 0
  ops.push(shade((x, y) => em(x, y) && (embaixo(x, y) || fios(x, y))))
  ops.push(light((x, y) => em(x, y) && !embaixo(x, y) && (cabelo
    ? y >= HY + 2 && y <= HY + 4 && em(x, y - 2) && (x + y) % 5 !== 0
    : !em(x, y - 1))))
  return ops
}

`;
for (const id of Object.keys(MAO)) out += readFileSync(join(here, `${id}.px.js`), 'utf8') + '\n';
let n = 0;
for (const id of Object.keys(B.PECAS)) {
  const pc = B.PECAS[id];
  if (pc.modo !== 'forma') continue;
  const cabelo = pc.tipo === 'cabelo';
  for (const view of VIEWS) {
    const { d, mechas } = B.gravarPeca(id, view);
    for (const alvo of ['frente', 'tras']) {
      const m = d[alvo]; const ms = mechas.filter((q) => q.alvo === alvo);
      const mao = alvo === 'frente' && (MAO[id] || []).includes(view);
      if (!(m && m.some((v) => v)) && !ms.length && !mao) continue;
      const R = m ? faixas(corroer(m)) : [];
      const nome = `${id}_${view}${alvo === 'tras' ? '_tras' : ''}`;
      out += `sprite("${nome}", { w: 64, h: 96, outline: "k" },\n`;
      out += `  ...base(${JSON.stringify(R)}, { cabelo: ${cabelo}, tras: ${alvo === 'tras'} }),\n`;
      if (!mao) for (const q of ms) out += `  ...M(${fmt(q.a).join(', ')}, ${alvo === 'tras'}),\n`;
      if (mao) out += `  stamp("_${id}_mao_${view}", 0, 0),\n`;
      out += `)\n`;
      n++;
    }
  }
}
writeFileSync(join(here, 'pecas.px.js'), out);
console.log(`pecas.px.js: ${n} desenhos`);
