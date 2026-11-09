// O boneco em PIXEL ART desenhado por código em cima do esqueleto 3D (rig.js).
//
// Estilo (v26, da folha de referência do Victor): chibi de cabeça grande e olhos grandes, traço escuro grosso em volta
// de tudo (por fora e entre as peças), cor chapada com um tom de sombra e um pouco de luz onde bate de frente, e brilho
// só no cabelo, nos olhos e no metal.
//
// Cada parte do corpo é uma forma 3D simples presa num osso: elipsoides (cabeça, tronco, quadril, mãos, pés) e tubos
// (braços, pernas, mechas de cabelo). As camadas são as MESMAS formas um pouco maiores, presas nos mesmos ossos: por isso
// cabem certinho no corpo em qualquer pose e em qualquer direção. Camadas: corpo (o boneco base inteiro, com a roupa de
// baixo), olhos, boca, cabelo, camisa (a veste de cima de dentro), casaco, conjunto (o colete da vila), calca, sapato,
// acessorio, chapeu (a bandana) e capa. A arma é a arte de weapons.js, presa na âncora da mão (anchors.hand).
//
// O desenho é feito pixel a pixel numa célula 64 x 96 (sem borrar):
//   1. cada forma marca, em cada pixel que cobre, a profundidade, a normal e o material (fica a mais perto da câmera);
//   2. a luz (de cima, da esquerda e da frente) escolhe o tom: base ou sombra, e luz só onde bate bem de frente;
//   3. olhos, boca, nariz e símbolos são carimbos de pixel art (desenhados à mão, nunca deformados) no lugar certo;
//   4. o traço: por fora do boneco e por dentro, onde uma peça passa na frente da outra.
//
// Tudo aqui é PURO (sem DOM): o jogo usa no navegador (figure.js guarda o resultado em canvas) e a prancha de arte e os
// testes usam no Node.

import { CELL, TILT, solve, apply } from './rig.js';
import { SPRITES } from './spriteData.js';

const W = CELL.w, H = CELL.h, FX = CELL.footX, FY = CELL.footY;
const PAL = SPRITES.paletas;
const VILAS = SPRITES.vilas;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ vetores

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Ponto do mundo -> [x, y, profundidade] na célula (o mesmo de rig.js). */
const proj = (v) => [FX + v[0], FY - v[1] + v[2] * TILT, v[2]];
/** Para onde a câmera está (de um ponto da cena): a direção dos raios de cada pixel, ao contrário. */
const VIEW = norm([0, TILT, 1]);
/** A luz: de cima, da esquerda da tela e da frente. */
const LIGHT = norm([-0.55, 0.62, 0.56]);

// ------------------------------------------------------------------ cores

const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hexOf = (c) => `#${c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
/** Clareia (k > 0) ou escurece (k < 0) uma cor, puxando a sombra para o azul e a luz para o amarelo. */
function tint(hex, k) {
  const [r, g, b] = rgbOf(hex);
  if (k >= 0) return hexOf([r + (255 - r) * k, g + (250 - g) * k, b + (225 - b) * k * 0.85]);
  const d = 1 + k;
  return hexOf([r * d * 0.96, g * d * 0.98, b * d + 18 * -k]);
}
/** Rampa de 5 tons [contorno, sombra, base, luz, brilho] a partir de uma cor "#rrggbb" (capas). */
export const rampFromHex = (hex) => [tint(hex, -0.62), tint(hex, -0.28), hex, tint(hex, 0.13), tint(hex, 0.3)];

/** O traço (por fora e por dentro): quase preto, puxado para o azul, como o da referência. */
export const OUTLINE = '#15121d';

/**
 * Material: os tons [fundo, sombra, base, luz, brilho]. `hi` = a partir de que luz usa o brilho (só no cabelo e no
 * metal). Os limites das faixas: luz acima de `lt`, sombra abaixo de `sh`, fundo abaixo de `dp`. O padrão é o "cel" da
 * referência: quase tudo na base, a sombra do lado de lá e a luz só onde bate bem de frente.
 */
function material(tones, extra = {}) {
  return { rgb: tones.map(rgbOf), out: rgbOf(OUTLINE), lt: 0.8, sh: 0.08, dp: -2, hi: 2, ...extra };
}

/** Materiais de um visual: pele, cabelo, olhos, roupas (cores do jogador e da vila), metal, capa. */
export function materialsFor(look, opts = {}) {
  const skin = PAL.pele[look.skin] || PAL.pele.claro;
  const hair = PAL.cabelo[look.hairColor] || PAL.cabelo.castanho;
  const vila = VILAS[look.village] || VILAS.vila_1;
  const ramp = (name) => PAL.roupa[name] || PAL.roupa.cinza;
  const cloth = (name) => { const r = ramp(name); return material([r[1], r[1], r[2], r[3], r[4]]); };
  /** Forro (o lado de dentro do pano): um tom abaixo, sem luz. */
  const lining = (name) => { const r = ramp(name); return material([r[0], r[0], r[1], r[1], r[1]], { lt: 2 }); };
  const shoe = SHOES[look.shoes];
  const m = {
    pele: material([skin[3], skin[3], skin[2], skin[1], skin[0]], { lt: 2, sh: 0.02 }),
    rosto: material([skin[3], skin[3], skin[2], skin[1], skin[0]], { lt: 2, sh: -0.42 }),
    cabelo: material([hair[1], hair[1], hair[2], hair[3], hair[4]], { lt: 0.72, sh: -0.06, hi: 0.95 }),
    cabeloDentro: material([hair[1], hair[1], hair[1], hair[2], hair[2]], { lt: 2 }),
    cueca: cloth('cinza'),
    camisa: cloth(look.shirtColor),
    logo: cloth(vila.logo),
    gola: cloth('creme'),
    calca: cloth(look.pantsColor),
    faixa: cloth('creme'),
    faixaAndarilho: cloth('marrom'),
    colete: cloth(vila.conjunto[0]),
    terno: cloth(vila.conjunto[1]),
    faixa_vila: cloth(vila.conjunto[2]),
    bandana: cloth(vila.bandana),
    aco: (() => { const r = ramp('aco'); return material([r[1], r[1], r[2], r[3], r[4]], { lt: 0.45, sh: -0.2, hi: 0.82 }); })(),
    couro: cloth('marrom'),
    preto: cloth('preto'),
  };
  // Casaco com capuz (acessório, v27): o casaco na cor do item, o forro um tom abaixo.
  const acc = ACCESSORIES[look.accessory];
  if (acc) { m.casaco = cloth(acc.color); m.casacoForro = lining(acc.color); }
  // Sapato de couro: um tom mais escuro que o pano da mesma cor (a bota preta se separa da calça preta).
  const leather = (name) => { const r = ramp(name); return material([r[0], r[0], r[1], r[2], r[3]]); };
  if (shoe) { m.sapato = leather(shoe.colors[0]); m.sapato2 = leather(shoe.colors[1]); m.sola = cloth(shoe.colors[2]); }
  if (opts.cape) {
    const [c, dark, trim] = capeColors(opts.cape, opts.capeVillage ?? look.village);
    const r = rampFromHex(c), d = rampFromHex(dark), t = rampFromHex(trim);
    m.capa = material([r[1], r[1], r[2], r[3], r[4]], { sh: -0.2 });
    m.forro = material([d[0], d[1], d[1], d[2], d[2]], { lt: 2 });
    m.barra = material([t[1], t[1], t[2], t[3], t[4]]);
  }
  return m;
}

/**
 * Sapatos (equipamento dos pés, camada "sapato"): o item calçado -> desenho e cores 1-3. Mesma tabela do servidor
 * (`look` em src/realtime/items.ts; o teste confere). Sem sapato (null), o pé fica descalço.
 */
export const SHOES = {
  sandalia_ninja: { sprite: 'sandalia', colors: ['azul_marinho', 'creme', 'preto'] },
  sandalia_couro: { sprite: 'sandalia', colors: ['marrom', 'creme', 'preto'] },
  botas_viagem: { sprite: 'bota', colors: ['marrom', 'creme', 'preto'] },
  botas_ninja: { sprite: 'bota', colors: ['preto', 'preto', 'cinza'] },
};

/**
 * Acessórios (slot Acessório, camada "casaco"): o item equipado -> desenho e cor. Ficam POR CIMA da roupa equipada
 * (camisa e calça ou o conjunto da vila). Mesma tabela do servidor (`coat` em src/realtime/items.ts; o teste confere).
 */
export const ACCESSORIES = {
  casaco_petroleo: { kind: 'casaco', color: 'petroleo' },
  casaco_preto: { kind: 'casaco', color: 'preto' },
  casaco_vinho: { kind: 'casaco', color: 'vinho' },
  casaco_verde: { kind: 'casaco', color: 'verde_escuro' },
};

/** Capas do fim de jogo: [pano, forro, barra]. A da vila usa a cor da vila. Mesmas cores de endgame.js. */
const CAPE_COLORS = {
  capa_viagem: ['#7a5a3a', '#5a4029', '#c9a46a'],
  manto_kage: ['#eeeae0', '#c9c3b4', '#c8321e'],
  manto_akatsuki: ['#3a393f', '#222126', '#d9772b'],
  manto_campeao: ['#4b2a7a', '#341c56', '#e8c66a'],
};
const VILLAGE_CAPE = { vila_1: '#3f7d3a', vila_3: '#4f9cc4', vila_4: '#7a2a3a', vila_5: '#c9822e' };
function capeColors(cape, village) {
  if (cape === 'capa_vila') { const c = VILLAGE_CAPE[village] || '#555555'; return [c, tint(c, -0.3), '#f4ead8']; }
  return CAPE_COLORS[cape] || CAPE_COLORS.capa_viagem;
}

// ------------------------------------------------------------------ rasterização

function newBuffer() {
  const n = W * H;
  return {
    z: new Float32Array(n).fill(-1e9), nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n),
    mat: new Array(n).fill(null), part: new Int16Array(n).fill(-1), tone: new Int8Array(n).fill(-1), lb: new Float32Array(n),
  };
}

function put(buf, i, z, zb, n0, n1, n2, prim, mat, tone, lb = 0) {
  // zb: vantagem só no teste de profundidade (a bandana ganha da franja que encosta nela).
  if (z + zb <= buf.z[i]) return;
  buf.z[i] = z + zb;
  const l = Math.sqrt(n0 * n0 + n1 * n1 + n2 * n2) || 1;
  buf.nx[i] = n0 / l; buf.ny[i] = n1 / l; buf.nz[i] = n2 / l;
  buf.part[i] = prim.id;
  buf.mat[i] = mat;
  buf.tone[i] = tone;
  buf.lb[i] = lb;
}

/** Elipsoide: centro c, rotação m (local -> mundo), raios r. clip(q local) decide se o ponto da frente fica. */
function drawEllipsoid(buf, p) {
  const { c, m, r } = p;
  const [cx, cy] = proj(c);
  const rm = Math.max(r[0], r[1], r[2]) + 1;
  const x0 = Math.max(0, Math.floor(cx - rm)), x1 = Math.min(W - 1, Math.ceil(cx + rm));
  const y0 = Math.max(0, Math.floor(cy - rm * (1 + TILT))), y1 = Math.min(H - 1, Math.ceil(cy + rm * (1 + TILT)));
  // Raio de cada pixel: P(t) = P0 + t·(0, TILT, 1). No espaço da esfera unitária: a + t·b.
  const b0 = (m[3] * TILT + m[6]) / r[0], b1 = (m[4] * TILT + m[7]) / r[1], b2 = (m[5] * TILT + m[8]) / r[2];
  const A = b0 * b0 + b1 * b1 + b2 * b2;
  const Z = -c[2];
  for (let py = y0; py <= y1; py++) {
    const Y = FY - (py + 0.5) - c[1];
    for (let px = x0; px <= x1; px++) {
      const X = px + 0.5 - FX - c[0];
      const a0 = (m[0] * X + m[3] * Y + m[6] * Z) / r[0];
      const a1 = (m[1] * X + m[4] * Y + m[7] * Z) / r[1];
      const a2 = (m[2] * X + m[5] * Y + m[8] * Z) / r[2];
      const B = a0 * b0 + a1 * b1 + a2 * b2, C = a0 * a0 + a1 * a1 + a2 * a2 - 1;
      const disc = B * B - A * C;
      if (disc < 0) continue;
      const t = (-B + Math.sqrt(disc)) / A;
      const u0 = a0 + t * b0, u1 = a1 + t * b1, u2 = a2 + t * b2;
      const q = [u0 * r[0], u1 * r[1], u2 * r[2]];
      if (p.clip && !p.clip(q)) continue;
      const n = apply(m, [u0 / r[0], u1 / r[1], u2 / r[2]]);
      let mat = p.mat, tone = -1;
      if (p.paint) {
        const got = p.paint(q, n);
        if (got === false) continue;
        if (got) { if (got[0]) mat = got[0]; tone = got[1] ?? -1; }
      }
      put(buf, py * W + px, t, p.zb || 0, n[0], n[1], n[2], p, mat, tone, p.tex ? p.tex(q) : 0);
    }
  }
}

/**
 * Tubo (osso com carne): de a até b, raio ra -> rb, redondo visto de qualquer lado. paint(k ao longo do tubo, n) pode
 * trocar o material ou fixar o tom (faixas, listras).
 */
function drawTube(buf, p) {
  const A = proj(p.a), B = proj(p.b);
  const rm = Math.max(p.ra, p.rb) + 1;
  const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0]) - rm)), x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0]) + rm));
  const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1]) - rm)), y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1]) + rm));
  const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const sx = px + 0.5, sy = py + 0.5;
      const k = l2 < 1e-9 ? 0 : clamp(((sx - A[0]) * dx + (sy - A[1]) * dy) / l2, 0, 1);
      const r = p.ra + (p.rb - p.ra) * k;
      const ex = sx - (A[0] + dx * k), ey = sy - (A[1] + dy * k);
      const d2 = ex * ex + ey * ey;
      if (d2 > r * r) continue;
      const h = Math.sqrt(r * r - d2);
      const z = A[2] + (B[2] - A[2]) * k + h;
      let n0 = ex / r, n1 = -ey / r, n2 = h / r;
      if (p.radial) {
        // Cabelo: a normal puxa para "de dentro da cabeça para fora" (a luz fica inteira no cabelo, não em cada mecha).
        const wx = sx - FX - p.radial[0], wy = FY - sy + z * TILT - p.radial[1], wz = z - p.radial[2];
        const wl = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1, k2 = p.radialK ?? 0.65;
        n0 = n0 * (1 - k2) + (wx / wl) * k2; n1 = n1 * (1 - k2) + (wy / wl) * k2; n2 = n2 * (1 - k2) + (wz / wl) * k2;
      }
      let mat = p.mat, tone = -1;
      if (p.paint) {
        const got = p.paint(k, [n0, n1, n2]);
        if (got === false) continue;
        if (got) { if (got[0]) mat = got[0]; tone = got[1] ?? -1; }
      }
      put(buf, py * W + px, z, p.zb || 0, n0, n1, n2, p, mat, tone);
    }
  }
}

/** Triângulo (pano da capa): v = 3 pontos do mundo, uv nos vértices; o lado de fora usa `mat`, o de dentro `back`. */
function drawTriangle(buf, p) {
  const P = p.v.map(proj);
  const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
  const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
  const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
  if (Math.abs(area) < 1e-6) return;
  let n = norm(cross(sub(p.v[1], p.v[0]), sub(p.v[2], p.v[0])));
  if (dot(n, p.out) < 0) n = scl(n, -1);              // normal para o lado de fora
  const outside = dot(n, VIEW) >= 0;
  const mat = outside ? p.mat : p.back;
  const nn = outside ? n : scl(n, -1);
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const sx = px + 0.5, sy = py + 0.5;
      const w0 = ((P[1][0] - sx) * (P[2][1] - sy) - (P[2][0] - sx) * (P[1][1] - sy)) / area;
      const w1 = ((P[2][0] - sx) * (P[0][1] - sy) - (P[0][0] - sx) * (P[2][1] - sy)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2];
      let nx = nn[0], ny = nn[1], nz = nn[2];
      if (p.vn) {
        // Normal suave (interpolada dos vértices): o pano dobra sem "costura" de luz entre os triângulos.
        const sg = outside ? 1 : -1;
        nx = sg * (w0 * p.vn[0][0] + w1 * p.vn[1][0] + w2 * p.vn[2][0]);
        ny = sg * (w0 * p.vn[0][1] + w1 * p.vn[1][1] + w2 * p.vn[2][1]);
        nz = sg * (w0 * p.vn[0][2] + w1 * p.vn[1][2] + w2 * p.vn[2][2]);
      }
      let m = mat, tone = -1;
      if (outside && p.paint) {
        const u = w0 * p.uv[0][0] + w1 * p.uv[1][0] + w2 * p.uv[2][0];
        const v = w0 * p.uv[0][1] + w1 * p.uv[1][1] + w2 * p.uv[2][1];
        const got = p.paint(u, v);
        if (got) { if (got[0]) m = got[0]; tone = got[1] ?? -1; }
      }
      put(buf, py * W + px, z, p.zb || 0, nx, ny, nz, p, m, tone);
    }
  }
}

// ------------------------------------------------------------------ cena: o boneco base e as camadas

/**
 * Monta as formas de um boneco já resolvido (S = solve(pose, yaw, gênero)). Cada forma: { k: 'e'|'t'|'tri', mat,
 * grp (grupo: o traço por dentro aparece entre grupos diferentes), layer (a camada), ... }.
 * opts: { cape, capeVillage, renegade, flow (0 parado .. 1 correndo: pano e cabelo vão para trás), phase (0..1) }.
 *
 * Camada a camada, na ordem em que se veste: o boneco base inteiro (com a roupa de baixo), a camisa (veste de cima de
 * dentro), o colete do conjunto da vila, o casaco com capuz, a calça, os acessórios, os sapatos, o cabelo, a bandana
 * e a capa. Olhos e boca são carimbos (fim do arquivo).
 */
export function buildScene(S, look, mats, opts = {}) {
  const c = sceneContext(S, look, mats, opts);
  bodyLayer(c);
  c.colliders = bodyColliders(c);
  shirtLayer(c);
  vestLayer(c);
  coatLayer(c);
  pantsLayer(c);
  accessoryLayer(c);
  shoesLayer(c);
  hairLayer(c);
  hatLayer(c);
  if (opts.cape) capeLayer(c);
  c.stamps.push({ layer: 'olhos', kind: 'olhos' }, { layer: 'boca', kind: 'boca' });
  return { prims: c.prims, stamps: c.stamps, head: c.head, hx: c.hx, hy: c.hy, hz: c.hz };
}

const add3 = (r, d) => [r[0] + d, r[1] + d, r[2] + d];
/** Braços, pernas, mãos e pés: traço por dentro mesmo quando passam só um pouco na frente do corpo. */
const LIMB = { lineThr: 0.5 };
const DEG = Math.PI / 180;

/** Medidas e ajudantes de uma cena (as camadas usam as mesmas medidas do corpo base, para caberem nele). */
function sceneContext(S, look, mats, opts) {
  const { J, R, B } = S;
  const fem = look.gender === 'f';
  const prims = [], stamps = [];
  let gid = 0;
  const c = { S, J, R, B, look, mats, opts, fem, prims, stamps, outfit: look.outfit, coat: ACCESSORIES[look.accessory]?.kind === 'casaco', flow: opts.flow || 0, phase: opts.phase || 0, g: {} };
  c.G = () => ++gid;
  c.P = (o) => { o.id = prims.length; prims.push(o); return o; };
  c.ell = (layer, grp, mat, ctr, m, r, extra) => c.P({ k: 'e', layer, grp, mat, c: ctr, m, r, ...extra });
  c.tube = (layer, grp, mat, a, b, ra, rb, extra) => c.P({ k: 't', layer, grp, mat, a, b, ra, rb, ...extra });
  c.at = (base, rot, v) => add(base, apply(rot, v));
  c.hx = B.head * 0.97; c.hy = B.head; c.hz = B.head * 0.92;
  c.headC = J.head; c.headR = R.head;
  c.chestC = c.at(J.chest, R.chest, [0, 1.3, 0]);
  c.chestR = fem ? [6.6, 6.4, 4.4] : [7.3, 6.6, 4.5];
  c.bellyC = c.at(J.waist, R.chest, [0, 3.2, 0.2]);
  c.bellyR = fem ? [5.5, 4.8, 4.0] : [6.0, 4.8, 4.1];
  c.pelvisC = c.at(J.pelvis, R.pelvis, [0, -0.4, 0]);
  c.pelvisR = fem ? [6.7, 4.6, 4.4] : [6.3, 4.4, 4.3];
  c.rArm = { up: fem ? [2.7, 2.3] : [3.0, 2.5], fore: fem ? [2.3, 1.9] : [2.5, 2.1] };
  c.rLeg = { thigh: [fem ? 4.0 : 3.9, 3.0], shin: [3.0, 2.1] };
  c.footC = (key) => c.at(J[`ankle${key}`], R[`foot${key}`], [0, -B.ankle + 1.6, (B.foot - 1.6) / 2]);
  c.footLen = (B.foot + 1.6) / 2 + 0.6;
  return c;
}

/** O boneco base inteiro: cabeça (crânio + queixo), orelhas, pescoço, tronco, braços, mãos, pernas, pés e a roupa de baixo. */
function bodyLayer(c) {
  const { J, R, mats, ell, tube, at, G, hx, hy, hz, headC, headR, g } = c;
  g.head = G(); g.ear = G(); g.torso = G(); g.under = G();
  // Cabeça: crânio redondo e o queixo mais estreito embaixo (o rosto afina, como na referência).
  c.head = ell('corpo', g.head, mats.rosto, at(headC, headR, [0, 1.5, -0.3]), headR, [hx, hy * 0.92, hz], { face: true });
  ell('corpo', g.head, mats.rosto, at(headC, headR, [0, -hy * 0.46, hz * 0.13]), headR, [hx * 0.68, hy * 0.56, hz * 0.8], { face: true });
  for (const side of [1, -1]) {
    // Orelha com a concha (um tom de sombra no meio).
    ell('corpo', g.ear, mats.pele, at(headC, headR, [side * hx * 0.93, -hy * 0.18, -hz * 0.1]), headR, [1.8, 3.2, 2.4],
      { lineThr: 0.3, paint: (q) => (q[0] * side > 0.9 && Math.abs(q[1]) < 1.8 && Math.abs(q[2]) < 1.1 ? [null, 1] : null) });
  }
  // Pescoço (na sombra da cabeça), tronco e quadril.
  tube('corpo', g.torso, mats.pele, J.neck, at(J.headBase, headR, [0, 3, -0.6]), c.fem ? 2.3 : 2.6, c.fem ? 2.2 : 2.5, { bias: -0.6 });
  ell('corpo', g.torso, mats.pele, c.chestC, R.chest, c.chestR);
  ell('corpo', g.torso, mats.pele, c.bellyC, R.chest, c.bellyR);
  ell('corpo', g.torso, mats.pele, c.pelvisC, R.pelvis, c.pelvisR);
  // Roupa de baixo (o boneco base nunca fica pelado): quadril e o comecinho das coxas.
  ell('corpo', g.under, mats.cueca, c.pelvisC, R.pelvis, add3(c.pelvisR, 0.35), { clip: (q) => q[1] < 1.6 });
  for (const key of ['L', 'R']) {
    g[`arm${key}`] = G(); g[`hand${key}`] = G();
    const sh = J[`shoulder${key}`], el = J[`elbow${key}`], wr = J[`wrist${key}`], hd = J[`hand${key}`];
    ell('corpo', g.torso, mats.pele, sh, R.chest, [3.2, 3.1, 3.1]);
    tube('corpo', g[`arm${key}`], mats.pele, sh, el, ...c.rArm.up, LIMB);
    tube('corpo', g[`arm${key}`], mats.pele, el, wr, ...c.rArm.fore, LIMB);
    const fore = R[`fore${key}`];
    if (c.S.pose.hands === 'aberta') ell('corpo', g[`hand${key}`], mats.pele, mix(wr, hd, 0.7), fore, [2.9, 3.4, 1.7], LIMB);
    // Punho fechado, com a dobra dos dedos.
    else ell('corpo', g[`hand${key}`], mats.pele, mix(wr, hd, 0.7), fore, [2.9, 3.0, 2.8], { ...LIMB, paint: (q) => (q[2] > 1.5 && Math.abs(q[1] + 0.5) < 0.42 ? [null, 1] : null) });
  }
  for (const key of ['L', 'R']) {
    g[`leg${key}`] = G(); g[`foot${key}`] = G();
    const hp = J[`hip${key}`], kn = J[`knee${key}`], an = J[`ankle${key}`];
    tube('corpo', g[`leg${key}`], mats.pele, hp, kn, ...c.rLeg.thigh, LIMB);
    tube('corpo', g[`leg${key}`], mats.pele, kn, an, ...c.rLeg.shin, LIMB);
    ell('corpo', g.under, mats.cueca, hp, R[`thigh${key}`], [4.3, 3.2, 4.3], { clip: (q) => q[1] > -2.2 });
    ell('corpo', g[`foot${key}`], mats.pele, c.footC(key), R[`foot${key}`], [2.4, 1.7, c.footLen], LIMB);
  }
}

/** O corpo (com a roupa por cima) para o pano encostar: capa, abas do casaco e pontas da bandana são empurradas para fora. */
function bodyColliders(c) {
  const { J, R } = c;
  const thick = (c.outfit === 'vila' ? 1 : 0) + (c.coat ? 1.5 : 0);
  const skirt = c.coat ? 1.6 : 0;                         // as abas do casaco em volta das pernas
  const list = [
    { k: 'e', c: c.headC, m: c.headR, r: [c.hx + 2.6, c.hy + 2.6, c.hz + 2.6] },
    { k: 'e', c: c.chestC, m: R.chest, r: add3(c.chestR, 1 + thick) },
    { k: 'e', c: c.bellyC, m: R.chest, r: add3(c.bellyR, 1 + thick) },
    { k: 'e', c: c.pelvisC, m: R.pelvis, r: add3(c.pelvisR, 1.2 + skirt) },
  ];
  for (const key of ['L', 'R']) {
    const a = thick * 0.4;
    list.push({ k: 't', a: J[`shoulder${key}`], b: J[`shoulder${key}`], ra: 4.1 + a, rb: 4.1 + a });
    list.push({ k: 't', a: J[`shoulder${key}`], b: J[`elbow${key}`], ra: 3.7 + a, rb: 3.3 + a });
    list.push({ k: 't', a: J[`elbow${key}`], b: J[`hand${key}`], ra: 3.3 + a, rb: 3.2 });
    list.push({ k: 't', a: J[`hip${key}`], b: J[`knee${key}`], ra: 4.9 + skirt * 0.8, rb: 4.0 + skirt * 0.6 });
    list.push({ k: 't', a: J[`knee${key}`], b: J[`ankle${key}`], ra: 4.0, rb: 3.2 });
    list.push({ k: 't', a: J[`heel${key}`], b: J[`toe${key}`], ra: 2.8, rb: 2.8 });
  }
  return list;
}

/** Camisa (a veste de cima de dentro): básica ou a blusa do conjunto da vila. */
function shirtLayer(c) {
  const { J, R, mats, ell, tube, at, G, g } = c;
  g.shirt = G();
  const vest = c.outfit === 'vila';
  const top = vest ? mats.terno : mats.camisa;
  ell('camisa', g.shirt, top, c.chestC, R.chest, add3(c.chestR, 0.6));
  ell('camisa', g.shirt, top, c.bellyC, R.chest, add3(c.bellyR, 0.6));
  // A barra da camisa cai por cima da calça (um degrau: o traço da cintura aparece).
  ell('camisa', g.shirt, top, c.pelvisC, R.pelvis, add3(c.pelvisR, 1.25), { clip: (q) => q[1] > 0.2 });
  for (const key of ['L', 'R']) {
    const sh = J[`shoulder${key}`], el = J[`elbow${key}`], wr = J[`wrist${key}`];
    const gs = (g[`sleeve${key}`] = G());
    ell('camisa', g.shirt, top, sh, R.chest, [3.8, 3.7, 3.7]);
    // v35: a faixa do Andarilho no braço esquerdo (por cima da manga)
    const band = key === 'L' && c.look.lineage && c.look.lineage.clan === 'andarilho';
    tube('camisa', gs, top, sh, el, c.rArm.up[0] + 0.6, c.rArm.up[1] + 0.55, band ? { ...LIMB, paint: (k) => (k > 0.42 && k < 0.64 ? [mats.faixaAndarilho, 1] : null) } : LIMB);
    tube('camisa', gs, top, el, mix(el, wr, 0.82), c.rArm.fore[0] + 0.55, c.rArm.fore[1] + 0.6,
      { ...LIMB, paint: (k) => (k > 0.86 ? [vest ? mats.terno : mats.gola, 1] : null) });
  }
  // Gola: um anel em volta da base do pescoço.
  g.collar = G();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    ell('camisa', g.collar, vest ? mats.colete : mats.gola, at(J.neck, R.chest, [Math.sin(a) * 3.0, -0.6, Math.cos(a) * 2.5 - 0.2]), R.chest,
      vest ? [2.2, 2.0, 2.2] : [1.5, 1.3, 1.5]);
  }
  if (!vest) c.stamps.push({ layer: 'camisa', kind: 'simbolo', at: at(c.chestC, R.chest, [3.6, 1.2, c.chestR[2] + 0.4]), mat: mats.logo, normal: apply(R.chest, [0.35, 0, 0.94]), size: 'p' });
}

/** Colete do conjunto da vila: por cima da camisa, com bolsos no peito, zíper, gola alta e o símbolo nas costas. */
function vestLayer(c) {
  if (c.outfit !== 'vila') return;
  const { J, R, mats, ell, at, G } = c;
  const gv = G();
  const pockets = (q) => {
    if (q[2] < 1) return null;
    const ax = Math.abs(q[0]);
    if (ax < 0.7) return [null, 5];                                       // zíper
    const inX = ax > 1.6 && ax < 6.4, inY = q[1] > -3.2 && q[1] < 3.4;
    if (inX && inY && (Math.abs(q[1] - 3.4) < 0.6 || Math.abs(q[1] + 3.2) < 0.6 || Math.abs(ax - 1.6) < 0.55 || Math.abs(ax - 6.4) < 0.55)) return [null, 1];
    if (inX && Math.abs(q[1] - 1.4) < 0.5) return [null, 1];               // tampa do bolso
    return null;
  };
  ell('conjunto', gv, mats.colete, c.chestC, R.chest, add3(c.chestR, 1.5), { paint: pockets });
  ell('conjunto', gv, mats.colete, c.bellyC, R.chest, add3(c.bellyR, 1.5), { paint: (q) => (q[2] > 1 && Math.abs(q[0]) < 0.7 ? [null, 5] : null), clip: (q) => q[1] > -3 });
  for (const key of ['L', 'R']) ell('conjunto', gv, mats.colete, J[`shoulder${key}`], R.chest, [3.4, 4.2, 4.4], { clip: (q) => q[1] > -0.5 });
  c.stamps.push({ layer: 'conjunto', kind: 'simbolo', at: at(c.chestC, R.chest, [0, 0.5, -(c.chestR[2] + 1.6)]), mat: mats.logo, normal: apply(R.chest, [0, 0, -1]), size: 'g' });
}

/**
 * Casaco com capuz (v26, a roupa da referência): aberto na frente (lapelas mais claras, a blusa e a faixa aparecem no
 * V), mangas largas com o punho dobrado, o capuz caído atrás do pescoço e as abas de pano da cintura até o joelho,
 * com física (balançam no passo, voam para trás na corrida e se dobram por cima da perna).
 */
function coatLayer(c) {
  if (!c.coat) return;
  const { J, R, mats, ell, tube, at, G, g } = c;
  g.coat = G(); g.hood = G();
  // Por cima do colete da vila, o casaco fica um pouco mais largo.
  const over = c.outfit === 'vila' ? 0.9 : 0;
  // Abertura da frente: em V no peito (mais aberta em cima), estreita na barriga.
  const open = (q, r) => lerp(2.3, 4.9, clamp((q[1] + r[1]) / (2 * r[1]), 0, 1));
  const front = (r, chest) => {
    const w = (q) => (chest ? open(q, r) : 2.3);
    return {
      clip: (q) => !(q[2] > 0 && Math.abs(q[0]) < w(q)),
      paint: (q) => {
        if (q[2] > 0 && Math.abs(q[0]) < w(q) + 1.15) return [null, 3];                 // lapela (dobra mais clara)
        return null;
      },
    };
  };
  const cr = add3(c.chestR, 1.3 + over), br = add3(c.bellyR, 1.3 + over);
  ell('casaco', g.coat, mats.casaco, c.chestC, R.chest, cr, front(cr, true));
  ell('casaco', g.coat, mats.casaco, c.bellyC, R.chest, br, front(br, false));
  for (const key of ['L', 'R']) {
    const sh = J[`shoulder${key}`], el = J[`elbow${key}`], wr = J[`wrist${key}`];
    const gs = (g[`coatArm${key}`] = G());
    ell('casaco', g.coat, mats.casaco, sh, R.chest, [4.4, 4.3, 4.4]);
    const bandC = key === 'L' && c.look.lineage && c.look.lineage.clan === 'andarilho';
    tube('casaco', gs, mats.casaco, sh, el, c.rArm.up[0] + 1.2 + over * 0.5, c.rArm.up[1] + 1.25 + over * 0.5, bandC ? { ...LIMB, paint: (k) => (k > 0.42 && k < 0.64 ? [mats.faixaAndarilho, 1] : null) } : LIMB);
    // A manga alarga no punho e o punho é dobrado (um tom de sombra).
    tube('casaco', gs, mats.casaco, el, mix(el, wr, 0.96), c.rArm.fore[0] + 1.25, c.rArm.fore[1] + 1.6, { ...LIMB, paint: (k) => (k > 0.8 ? [null, 1] : null) });
  }
  // Capuz caído: um rolo grosso atrás do pescoço que sobe dos dois lados, com o lado de dentro na sombra.
  ell('casaco', g.hood, mats.casaco, at(J.neck, R.chest, [0, 0.8, -3.0]), R.chest, [7.0, 4.4, 3.9],
    { lineThr: 0.4, paint: (q) => (q[1] > 0.6 && q[2] > -1.2 ? [mats.casacoForro, 1] : null) });
  ell('casaco', g.hood, mats.casaco, at(J.neck, R.chest, [0, 3.2, -4.6]), R.chest, [5.2, 3.0, 2.7], { lineThr: 0.4 });
  // Abas: pano em volta da cintura (aberto na frente), caindo até o joelho.
  const NU = 12, NV = 5;
  const ring = [], radial = [];
  const ringY = c.pelvisR[1] * 0.55 + 0.4;
  for (let i = 0; i <= NU; i++) {
    const th = lerp(22 * DEG, 338 * DEG, i / NU);
    ring.push(at(c.pelvisC, R.pelvis, [Math.sin(th) * (c.pelvisR[0] + 1.7), ringY, Math.cos(th) * (c.pelvisR[2] + 1.7)]));
    radial.push(norm(apply(R.pelvis, [Math.sin(th), 0, Math.cos(th)])));
  }
  const kneeY = Math.min(J.kneeL[1], J.kneeR[1]);
  const L = Math.max(5, ring[NU >> 1][1] - (kneeY - 0.6));
  const ls = (L / NV) * 1.04;
  // As abas encostam no quadril e nas pernas com a calça (não nos braços: as mãos passam por fora delas).
  const legs = [{ k: 'e', c: c.pelvisC, m: R.pelvis, r: add3(c.pelvisR, 1.4) }];
  for (const key of ['L', 'R']) {
    legs.push({ k: 't', a: J[`hip${key}`], b: J[`knee${key}`], ra: c.rLeg.thigh[0] + 1.5, rb: c.rLeg.thigh[1] + 1.4 });
    legs.push({ k: 't', a: J[`knee${key}`], b: J[`ankle${key}`], ra: c.rLeg.shin[0] + 1.3, rb: c.rLeg.shin[1] + 1.3 });
  }
  const back = scl(norm([R.pelvis[2], 0, R.pelvis[8]]), -1);
  const grid = drape(c.S, ring, radial, NV, ls, legs, back, {
    flow: Math.min(1.85, c.flow * 1.85), phase: c.phase, spread: 1.6, open: (j) => (j === 0 ? 0 : 0.6 * j),
    // A frente cai reta (perto das pernas); a parte de trás abre só um pouco (parado, o casaco cai reto, sem virar
    // sino) e é um pouco mais comprida (a cauda do casaco). Andando e correndo, quem leva a aba para trás é o vento.
    fan: (u) => { const back = 0.5 - 0.5 * Math.cos(u * TAU); return 0.08 + 0.12 * back; },
    longer: (u) => 1 + 0.14 * (0.5 - 0.5 * Math.cos(u * TAU)),
  });
  // Bolsos (a abertura, um traço) e a barra (um tom de sombra).
  const paint = (u, v) => {
    if (v > 0.86) return [null, 1];
    const pu = Math.min(Math.abs(u - 0.16), Math.abs(u - 0.84));
    if (pu < 0.055 && v > 0.22 && v < 0.3) return [null, 5];
    return null;
  };
  emitCloth(c, grid, { layer: 'casaco', grp: G(), mat: mats.casaco, back: mats.casacoForro, paint });
}

/** Calça: básica (até o meio da canela, com faixas) ou a do conjunto (inteira, com faixas). */
function pantsLayer(c) {
  const { J, R, mats, ell, tube, G, g } = c;
  g.pants = G();
  const vest = c.outfit === 'vila';
  const legsMat = vest ? mats.terno : mats.calca;
  ell('calca', g.pants, legsMat, c.pelvisC, R.pelvis, add3(c.pelvisR, 0.7), { clip: (q) => q[1] < 1.5 });
  for (const key of ['L', 'R']) {
    const hp = J[`hip${key}`], kn = J[`knee${key}`], an = J[`ankle${key}`];
    const gl = (g[`pants${key}`] = G());
    tube('calca', gl, legsMat, hp, kn, c.rLeg.thigh[0] + 0.7, c.rLeg.thigh[1] + 0.7, LIMB);
    const cut = vest ? 0.7 : 0.5;
    tube('calca', gl, legsMat, kn, mix(kn, an, cut), c.rLeg.shin[0] + 0.7, lerp(c.rLeg.shin[0], c.rLeg.shin[1], cut) + 0.75, LIMB);
    const wrap = vest ? mats.faixa_vila : mats.faixa;
    tube('calca', gl, wrap, mix(kn, an, cut - 0.08), an, lerp(c.rLeg.shin[0], c.rLeg.shin[1], cut) + 0.3, c.rLeg.shin[1] + 0.45,
      { ...LIMB, paint: (k) => (Math.floor(k * 6) % 2 ? [null, 1] : null) });
  }
}

/** Acessórios do conjunto da vila: porta-kunai na coxa e bolsinha na cintura. */
function accessoryLayer(c) {
  const { J, R, mats, ell, tube, at, G, g } = c;
  if (c.outfit === 'vila') {
    const kn = J.kneeR, hp = J.hipR, tr = R.thighR;
    const mid = mix(hp, kn, 0.55);
    ell('acessorio', g.pantsR, mats.faixa_vila, mid, tr, [4.5, 1.6, 4.5], { paint: (q) => (Math.abs(q[1]) > 0.8 ? [null, 1] : null) });
    ell('acessorio', G(), mats.preto, at(mid, tr, [-4.2, -0.4, 0.6]), tr, [1.5, 2.8, 2.5]);
    ell('acessorio', G(), mats.couro, at(c.pelvisC, R.pelvis, [0, 0.8, -(c.pelvisR[2] + 0.6)]), R.pelvis, [3.6, 2.0, 1.8]);
  }
}

/** Sapatos: sandália ninja (dedos de fora, sobe um pouco no tornozelo) ou bota (cano até o meio da canela, com a dobra). */
function shoesLayer(c) {
  const shoe = SHOES[c.look.shoes];
  if (!shoe) return;
  const { J, R, mats, ell, tube, at, g } = c;
  for (const key of ['L', 'R']) {
    const an = J[`ankle${key}`], kn = J[`knee${key}`], fr = R[`foot${key}`];
    const fc = c.footC(key), fl = c.footLen;
    const gf = g[`foot${key}`], gl = g[`leg${key}`];
    if (shoe.sprite === 'bota') {
      // Bota grossa: o pé largo com a sola clara e o cano até o meio da canela, com a borda dobrada.
      ell('sapato', gf, mats.sapato, at(fc, fr, [0, 0.25, 0.2]), fr, [3.4, 2.7, fl + 0.9], { ...LIMB, paint: (q) => (q[1] < -1.55 ? [mats.sola, null] : null) });
      tube('sapato', gl, mats.sapato, an, mix(an, kn, 0.5), c.rLeg.shin[1] + 1.7, lerp(c.rLeg.shin[1], c.rLeg.shin[0], 0.5) + 1.6,
        { ...LIMB, paint: (k) => (k > 0.88 ? [mats.sapato2, null] : null) });
    } else {
      ell('sapato', gf, mats.sapato, fc, fr, [2.8, 2.1, fl + 0.4],
        { ...LIMB, clip: (q) => q[2] < fl * 0.25 || q[1] < -1.1, paint: (q) => (q[1] < -1.1 ? [mats.sola, null] : null) });
      tube('sapato', gl, mats.sapato, an, mix(an, kn, 0.16), c.rLeg.shin[1] + 0.6, c.rLeg.shin[1] + 0.9);
    }
  }
}

/** Cabelo: a calota (até a linha do cabelo) e as mechas do penteado (cada mecha com o seu traço) ou os mantos (liso). */
function hairLayer(c) {
  const { S, mats, ell, tube, at, G, hx, hy, hz, headC, headR } = c;
  const hair = hairShapes(c.look.hairStyle, hx, hy, hz);
  // A calota e as mechas de trás são um grupo só: o traço aparece só onde uma mecha passa na frente da outra (como na
  // referência), não em volta de cada mecha. A franja tem o seu grupo (traço em cima do rosto).
  const gHair = G(), gBangs = G();
  ell('cabelo', gHair, mats.cabelo, headC, headR, [hx + 1.4, hy + 1.4, hz + 1.4],
    { clip: (q) => q[1] > hair.line(q[2] / (hz + 1.4), q[0] / (hx + 1.4)), tex: (q) => strands(Math.atan2(q[0], q[2]) * 3.2 + q[1] * 0.05) * 0.6 });
  for (const lock of hair.locks) {
    const pts = lock.pts.map((v) => at(headC, headR, v));
    for (let i = 0; i + 1 < pts.length; i++) {
      tube('cabelo', lock.front ? gBangs : gHair, mats.cabelo, pts[i], pts[i + 1], lock.r[i], lock.r[i + 1], { lineThr: lock.front ? 0.9 : 1.3, radial: headC, radialK: 0.45 });
    }
  }
  // Mechas em lâmina (a ponta afiada do anime): duas metades com uma crista no meio, cada uma com o seu traço.
  for (const b of hair.blades || []) {
    const geo = bladeGeometry(b, hx, hy, hz);
    const grp = G();
    const W3 = (v) => at(headC, headR, v);
    const N = (v) => norm(apply(headR, v));
    const base = { layer: 'cabelo', grp, mat: mats.cabelo, back: mats.cabeloDentro, lineThr: b.front ? 0.6 : 0.7 };
    for (let i = 0; i + 1 < geo.ridge.length; i++) {
      const out = N(geo.n[i]);
      for (const [e, en] of [[geo.left, geo.nl], [geo.right, geo.nr]]) {
        c.P({ k: 'tri', ...base, v: [W3(geo.ridge[i]), W3(e[i]), W3(geo.ridge[i + 1])], uv: [[0, 0], [0, 0], [0, 0]], vn: [N(geo.n[i]), N(en[i]), N(geo.n[i + 1])], out });
        c.P({ k: 'tri', ...base, v: [W3(e[i]), W3(e[i + 1]), W3(geo.ridge[i + 1])], uv: [[0, 0], [0, 0], [0, 0]], vn: [N(en[i]), N(en[i + 1]), N(geo.n[i + 1])], out });
      }
    }
  }
  for (const sh of hair.sheets || []) {
    let ctr = at(headC, headR, sh.c), m = headR;
    if (sh.hang) {
      // Mecha que pende: presa no alto dela, cai na direção da gravidade (para trás com o vento, balançando no passo).
      const top = at(headC, headR, [sh.c[0], sh.c[1] + sh.r[1] * 0.55, sh.c[2]]);
      const sway = Math.sin(c.phase * TAU * (c.flow > 0.2 ? 2 : 1)) * (0.04 + c.flow * 0.1);
      const down = swingDir(S, c.flow * 0.5, sway, sh.c[0] > 0 ? -0.15 : sh.c[0] < 0 ? 0.15 : 0);
      const yh = scl(down, -1);
      const hxv = apply(headR, [1, 0, 0]);
      const xh = norm(sub(hxv, scl(yh, dot(hxv, yh))));
      const zh = cross(xh, yh);
      m = [xh[0], yh[0], zh[0], xh[1], yh[1], zh[1], xh[2], yh[2], zh[2]];
      ctr = add(top, scl(down, sh.r[1] * 0.55));
    }
    ell('cabelo', G(), mats.cabelo, ctr, m, sh.r, { clip: sh.clip, paint: sh.paint, lineThr: sh.front ? 0.8 : 2.4, tex: (q) => strands(q[0] / 2.4 + q[1] * 0.04 + sh.c[0]) });
  }
}

/** Bandana: faixa, placa de metal (símbolo da vila gravado, rebites; riscada no renegado), nó e as duas pontas com física. */
function hatLayer(c) {
  if (!c.look.bandana) return;
  const { S, mats, ell, tube, at, G, hx, hy, hz, headC, headR } = c;
  const gb = G(), gp = G();
  ell('chapeu', gb, mats.bandana, headC, headR, [hx + 2.0, hy + 2.0, hz + 2.0], { clip: (q) => q[1] > hy * 0.16 && q[1] < hy * 0.42, zb: 3 });
  ell('chapeu', gp, mats.aco, headC, headR, [hx + 2.7, hy + 2.7, hz + 2.7],
    { clip: (q) => q[1] > hy * 0.13 && q[1] < hy * 0.45 && q[2] > 0 && Math.abs(q[0]) < hx * 0.36, zb: 3, lineThr: 0.25 });
  const plate = (x) => ({ layer: 'chapeu', at: at(headC, headR, [x, hy * 0.29, hz + 2.7]), normal: apply(headR, [0, 0.25, 0.97]), mat: mats.aco });
  c.stamps.push({ ...plate(0), kind: 'placa', village: c.look.village, scratch: !!c.opts.renegade });
  for (const s of [1, -1]) c.stamps.push({ ...plate(s * hx * 0.29), kind: 'rebite' });
  const knot = at(headC, headR, [0, hy * 0.3, -(hz + 3.6)]);
  ell('chapeu', gb, mats.bandana, knot, headR, [2.4, 2.0, 1.8], { zb: 2 });
  // Pontas: duas correntinhas de pano caindo do nó, por cima do cabelo.
  const tailBack = norm(sub(knot, headC));
  const hairy = [{ k: 'e', c: headC, m: headR, r: [hx + 4.2, hy + 4.2, hz + 4.2] }, ...c.colliders.slice(1)];
  for (const side of [1, -1]) {
    const start = add(knot, apply(headR, [side * 1.2, -0.6, 0]));
    const flutter = Math.sin((c.phase * 2 + side * 0.23) * TAU) * (0.15 + c.flow * 0.4);
    const pts = hangChain(start, 5, 2.2, swingDir(S, c.flow, flutter, side * 0.25), hairy, tailBack);
    for (let i = 0; i + 1 < pts.length; i++) tube('chapeu', gb, mats.bandana, pts[i], pts[i + 1], lerp(1.4, 0.9, i / 4), lerp(1.4, 0.9, (i + 1) / 4), { zb: 2 });
  }
}

/** Capa: presa por cima dos ombros, cai pelas costas até o meio da canela (física do pano), com a barra e o emblema. */
function capeLayer(c) {
  const { J, R, B, mats, opts } = c;
  const NU = 10, NV = 9;
  const back = scl(norm([R.pelvis[2], 0, R.pelvis[8]]), -1);
  const thick = Math.max(c.outfit === 'vila' ? 1 : 0, c.coat ? 1.6 : 0);
  const back3 = c.chestR[2] + 1.2 + thick;
  const collar = [], radial = [];
  for (let i = 0; i <= NU; i++) {
    const u = 2 * (i / NU) - 1, u2 = u * u;
    const local = [-u * (B.shoulder + 3.2 + thick * 0.5), lerp(B.chest + 0.7 + thick * 0.5, B.shoulderY + 3.2 + thick * 0.5, u2), lerp(-back3, 0.4, u2 * u2)];
    collar.push(add(J.waist, apply(R.chest, local)));
    radial.push(norm(apply(R.chest, [local[0] * 0.7, 0, local[2] - 1])));
  }
  const L = Math.max(10, collar[NU >> 1][1] - 7);
  const ls = (L / NV) * 1.1;
  const grid = drape(c.S, collar, radial, NV, ls, c.colliders, back, { flow: c.flow, phase: c.phase, fan: 0.16, spread: 2.1 });
  const vn = emitCloth(c, grid, { layer: 'capa', grp: c.G(), mat: mats.capa, back: mats.forro, paint: (u, v) => (v > 0.9 ? [mats.barra, null] : null) });
  // Emblema nas costas (só aparece se o lado de fora estiver virado para a câmera ali).
  const point = (u, v) => {
    const fi = u * NU, fj = v * NV, i = Math.min(NU - 1, Math.floor(fi)), j = Math.min(NV - 1, Math.floor(fj));
    const ku = fi - i, kv = fj - j;
    const p = mix(mix(grid[j][i], grid[j][i + 1], ku), mix(grid[j + 1][i], grid[j + 1][i + 1], ku), kv);
    const n = norm(mix(mix(vn[j][i], vn[j][i + 1], ku), mix(vn[j + 1][i], vn[j + 1][i + 1], ku), kv));
    return [add(p, scl(n, 0.3)), n];
  };
  const emblem = { manto_akatsuki: [[0.4, 0.34, 'brasa'], [0.6, 0.52, 'brasa'], [0.43, 0.72, 'brasa']], manto_kage: [[0.5, 0.45, 'kage']],
    manto_campeao: [[0.5, 0.42, 'circulo']], capa_vila: [[0.5, 0.42, 'circulo_vila']] }[opts.cape] || [];
  for (const [u, v, kind] of emblem) {
    const [p, n] = point(u, v);
    c.stamps.push({ layer: 'capa', kind: 'capa', emblem: kind, at: p, normal: n, mat: mats.barra, cape: opts.cape });
  }
}

/** Fios do cabelo: listras de luz e sombra (o brilho do cabelo fica quebrado em mechas, como no anime). */
const strands = (t) => { const f = t - Math.floor(t); return f < 0.18 ? -0.22 : f < 0.5 ? 0.06 : 0; };

/**
 * Mecha em lâmina, no espaço da cabeça: sai da base (az0, el0) e vai até a ponta (az1, el1), `out` px para fora do
 * cabelo, curvando `bend` px para fora no meio. Larga na base (`w`), afina até a ponta (0), com uma crista no meio
 * (`ridge`) que divide a luz: um lado claro, o outro na sombra.
 */
function bladeGeometry(b, hx, hy, hz) {
  const R = [hx + 1.4, hy + 1.4, hz + 1.4];
  const S = (az, el, out = 0) => {
    const a = az * DEG, e = el * DEG;
    return [Math.sin(a) * Math.cos(e) * (R[0] + out), Math.sin(e) * (R[1] + out), Math.cos(a) * Math.cos(e) * (R[2] + out)];
  };
  const lift = b.lift ?? 0.7;
  const p0 = S(b.a0, b.e0, lift - 1.2), p2 = S(b.a1, b.e1, b.out);
  const p1 = S((b.a0 + b.a1) / 2 + (b.twist || 0), (b.e0 + b.e1) / 2, lift + (b.bend ?? 1.2));
  const ridge = [], left = [], right = [], n = [], nl = [], nr = [];
  const NS = 6;
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, u = 1 - t;
    const B = [0, 1, 2].map((k) => u * u * p0[k] + 2 * u * t * p1[k] + t * t * p2[k]);
    const T = norm([0, 1, 2].map((k) => 2 * u * (p1[k] - p0[k]) + 2 * t * (p2[k] - p1[k])));
    const n0 = norm([B[0] / (R[0] * R[0]), B[1] / (R[1] * R[1]), B[2] / (R[2] * R[2])]);
    let side = cross(T, n0);
    if (len(side) < 0.2) side = cross(T, [0, 0, 1]);
    side = norm(side);
    const w = b.w * Math.pow(u, 0.9), h = (b.ridge ?? 1.2) * Math.pow(u, 0.7);
    ridge.push(add(B, scl(n0, h)));
    left.push(sub(B, scl(side, w)));
    right.push(add(B, scl(side, w)));
    n.push(n0);
    nl.push(norm(sub(scl(n0, 0.55), scl(side, 0.85))));
    nr.push(norm(add(scl(n0, 0.55), scl(side, 0.85))));
  }
  return { ridge, left, right, n, nl, nr };
}

/**
 * Formas de cada penteado, no espaço da cabeça (x esquerda, y cima, z frente): `line(f, s)` = altura da linha do
 * cabelo (f: 1 frente, -1 nuca; s: lado), as mechas (tubos com 3 pontos e raios) e os mantos (cabelo liso).
 */
function hairShapes(style, hx, hy, hz) {
  const R = [hx + 0.6, hy + 0.6, hz + 0.6];
  // Ponto na superfície da cabeça: az (graus; 0 = frente, +90 = esquerda dele), el (graus; 90 = topo), + fora.
  const S = (az, el, out = 0) => {
    const a = az * DEG, e = el * DEG;
    return [Math.sin(a) * Math.cos(e) * (R[0] + out), Math.sin(e) * (R[1] + out), Math.cos(a) * Math.cos(e) * (R[2] + out)];
  };
  const locks = [];
  // Mecha: da base (az, el) até a ponta na direção (az2, el2) a `len` px da cabeça, curvando (`bend`, para fora).
  const spike = (az, el, az2, el2, ln, rb, bend = 1.2, tip = 0.45) => {
    const base = S(az, el, -1.6);
    const end = S(az2, el2, ln);
    const mid = add(mix(base, end, 0.5), scl(norm(S(az2, el2, 0)), bend));
    locks.push({ pts: [base, mid, end], r: [rb, rb * 0.62, tip] });
  };
  // Franja: da base no alto da testa até a ponta na frente do rosto (rente à cabeça).
  const bang = (az, el, az2, el2, rb, out = 1.6) => {
    const base = S(az, el, -1.2);
    const end = S(az2, el2, out);
    const mid = S((az + az2) / 2, (el + el2) / 2, out + 1.6);
    locks.push({ pts: [base, mid, end], r: [rb, rb * 0.62, 0.4], front: true });
  };
  if (style === 'longo_lateral') {
    // Liso e comprido: franja de lado com as pontas recortadas, duas mechas emoldurando o rosto até o peito e a
    // cortina de trás até as costas (mantos lisos, que pendem com a gravidade).
    const tri = (t) => Math.abs((((t % 1) + 1) % 1) - 0.5) * 2;
    const teeth = (x, w = 3.4, h = 2.2) => h * tri(x / w + 0.25);
    const fr = [hx + 2.0, hy + 2.0, hz + 2.0];
    const sheets = [
      { c: [0, 0, 0], r: fr, front: true, clip: (q) => q[2] > hz * 0.1 && q[1] > hy * (0.1 - 0.2 * (q[0] / fr[0])) + teeth(q[0] + 40) },
    ];
    for (const s of [1, -1]) {
      const r = [4.4, hy * 0.98, hz * 0.6];
      sheets.push({ c: [s * hx * 0.8, -hy * 0.55, -hz * 0.1], r, front: true, hang: true,
        clip: (q) => q[1] > -r[1] * 0.97 + teeth(q[2] + 20, 3, 3.2) && s * q[0] > -r[0] * 0.55 });
    }
    const br = [hx * 0.96, hy * 1.06, hz * 0.62];
    sheets.push({ c: [0, -hy * 0.46, -hz * 0.42], r: br, hang: true,
      clip: (q) => q[1] > -br[1] * 0.97 + teeth(q[0] + 11, 3.2, 3.4),
      paint: (q) => (q[1] < -hy * 0.15 && tri(q[0] / 3.1) < 0.16 ? [null, 1] : null) });
    return { line: (f) => (f > 0 ? hy * (0.05 + 0.2 * f) : hy * (0.05 - 0.95 * -f)), locks, sheets };
  }
  if (style === 'baguncado') {
    // Bagunçado (o da referência): mechas em lâmina saindo do redemoinho (atrás, no alto): a franja cheia caindo
    // sobre a testa até a sobrancelha (a do meio desce entre os olhos), mechas para os lados, na frente das orelhas,
    // algumas pontas espetadas para cima e para trás e a nuca.
    const blades = [];
    const B = (a0, e0, a1, e1, out, w, extra = {}) => blades.push({ a0, e0, a1, e1, out, w, ...extra });
    // franja: poucas mechas largas, de comprimentos diferentes (a do meio desce entre os olhos; entre elas aparece a
    // testa); as de fora param acima do olho, para o perfil mostrar o rosto
    B(-2, 68, -6, -8, 1.1, 5.6, { front: true, bend: 1.9 });
    B(28, 64, 40, -2, 1.1, 5.2, { front: true, bend: 1.7 });
    B(-32, 64, -42, 0, 1.1, 5.2, { front: true, bend: 1.7 });
    B(54, 58, 62, 2, 1.3, 4.4, { front: true, bend: 1.5 });
    B(-56, 58, -62, 4, 1.3, 4.4, { front: true, bend: 1.5 });
    // lados: na frente da orelha, descendo até a bochecha, e as laterais abrindo para fora
    B(-76, 52, -84, -30, 1.3, 4.2, { front: true });
    B(78, 52, 86, -28, 1.3, 4.2, { front: true });
    B(-96, 62, -114, 18, 4.4, 5.6, { bend: 1.8 });
    B(98, 62, 116, 20, 4.4, 5.6, { bend: 1.8 });
    // topo: mechas deitadas que levantam na ponta (volume), e para trás
    B(170, 82, 40, 64, 1.0, 7.0, { bend: 2.0 });
    B(-170, 82, -48, 62, 0.9, 7.0, { bend: 1.8 });
    B(120, 70, 70, 40, 2.4, 6.0, { bend: 1.8 });                // volume do topo, abrindo para os lados
    B(-120, 70, -72, 40, 2.4, 6.0, { bend: 1.8 });
    B(172, 76, 128, 58, 5.0, 5.6, { bend: 2.4 });
    B(-172, 76, -132, 56, 5.0, 5.6, { bend: 2.4 });
    // trás e nuca
    B(178, 72, 172, 30, 6.0, 6.0, { bend: 2.2 });
    B(150, 58, 138, 12, 5.0, 5.2, { bend: 1.8 });
    B(-150, 58, -140, 14, 5.0, 5.2, { bend: 1.8 });
    B(176, 42, 182, -16, 2.6, 5.2);
    B(128, 32, 122, -12, 2.2, 4.4);
    B(-130, 32, -124, -10, 2.2, 4.4);
    return { line: (f) => (f > 0 ? hy * (0.06 + 0.16 * f) : hy * (0.06 - 0.82 * -f)), locks, blades };
  }
  // Espetado (estilo Naruto): coroa de pontas em cone, para cima, para os lados e para trás, e a franja em lâminas.
  spike(0, 58, 0, 80, 7.5, 4.6, 1.2, 0.3);
  for (const s of [1, -1]) {
    spike(s * 34, 52, s * 42, 66, 8.5, 4.6, 1.2, 0.3);
    spike(s * 70, 36, s * 84, 40, 8, 4.4, 1.2, 0.3);
    spike(s * 112, 34, s * 120, 34, 8, 4.4, 1.2, 0.3);
    spike(s * 148, 26, s * 154, 18, 7.5, 4.4, 1.2, 0.3);
    spike(s * 100, 6, s * 108, -8, 6, 3.6, 1.2, 0.3);
    spike(s * 160, -2, s * 164, -18, 6, 3.8, 1.2, 0.3);
  }
  spike(180, 48, 180, 54, 8, 4.6, 1.2, 0.3);
  spike(180, 8, 180, -10, 6.5, 4.2, 1.2, 0.3);
  const blades = [];
  for (const [a0, e0, a1, e1, w] of [[0, 62, 2, -2, 5.4], [26, 60, 30, 2, 5.0], [-26, 60, -30, 2, 5.0], [50, 54, 60, -4, 4.6], [-50, 54, -60, -4, 4.6]]) {
    blades.push({ a0, e0, a1, e1, out: 1.4, w, front: true, bend: 1.6 });
  }
  for (const s of [1, -1]) blades.push({ a0: s * 72, e0: 44, a1: s * 78, e1: -20, out: 1.2, w: 3.8, front: true });
  return { line: (f) => (f > 0 ? hy * (0.06 + 0.16 * f) : hy * (0.06 - 0.8 * -f)), locks, blades };
}

// ------------------------------------------------------------------ física do pano (capa, abas do casaco, pontas)
//
// O pano é uma grade de pontos ligados (colunas que caem de uma borda presa no corpo). A cada quadro ele é resolvido do
// zero (o quadro fica guardado, então a física tem de sair só da pose): a gravidade puxa cada ponto (para trás também,
// com o vento de andar e correr), cada ponto fica a uma distância fixa do de cima (o pano não estica), as colunas
// vizinhas não se afastam mais do que o pano deixa, e cada ponto é empurrado para fora do corpo (cabeça com o cabelo,
// tronco com a roupa, ombros, braços, quadril, coxas, canelas e pés). Repetindo isso algumas vezes, o pano assenta e se
// dobra por cima do braço e do joelho que vão para trás, em vez de ser atravessado por eles.

const MARGIN = 0.7;

/** Empurra o ponto para fora de cada forma do corpo (com uma folga para o pano não encostar no pixel). */
function collide(p, colliders, fallback) {
  for (const c of colliders) {
    if (c.k === 'e') {
      const d = sub(p, c.c);
      const q = [c.m[0] * d[0] + c.m[3] * d[1] + c.m[6] * d[2], c.m[1] * d[0] + c.m[4] * d[1] + c.m[7] * d[2], c.m[2] * d[0] + c.m[5] * d[1] + c.m[8] * d[2]];
      const r0 = c.r[0] + MARGIN, r1 = c.r[1] + MARGIN, r2 = c.r[2] + MARGIN;
      const k = Math.sqrt((q[0] / r0) ** 2 + (q[1] / r1) ** 2 + (q[2] / r2) ** 2);
      if (k >= 1) continue;
      if (k < 1e-6) { p = add(c.c, scl(fallback, r2)); continue; }
      p = add(c.c, apply(c.m, [q[0] / k, q[1] / k, q[2] / k]));
    } else {
      const ab = sub(c.b, c.a), l2 = dot(ab, ab);
      const k = l2 < 1e-9 ? 0 : clamp(dot(sub(p, c.a), ab) / l2, 0, 1);
      const cp = add(c.a, scl(ab, k));
      const r = c.ra + (c.rb - c.ra) * k + MARGIN;
      const d = sub(p, cp), dl = len(d);
      if (dl >= r) continue;
      p = add(cp, scl(dl < 1e-6 ? fallback : scl(d, 1 / dl), r));
    }
  }
  if (p[1] < 0.5) p = [p[0], 0.5, p[2]];                                   // chão
  return p;
}

/** Direção da "gravidade" do pano: para baixo, inclinando para trás com o vento (flow) e balançando (flutter). */
function swingDir(S, flow, flutter = 0, sideK = 0) {
  const fwd = norm([S.R.pelvis[2], 0, S.R.pelvis[8]]);
  const back = scl(fwd, -1), side = norm(cross([0, 1, 0], fwd));
  const ang = 0.04 + flow * 0.95 + flutter;
  return norm(add(add(scl([0, -1, 0], Math.cos(ang)), scl(back, Math.sin(ang))), scl(side, sideK * (0.2 + flow * 0.3))));
}

/** Uma corrente de `n` elos de `ls` px pendurada em `start` (pontas da bandana, pontas da faixa). */
function hangChain(start, n, ls, dir, colliders, fallback) {
  const pts = [start];
  for (let i = 1; i <= n; i++) pts.push(add(start, scl(dir, ls * i)));
  for (let it = 0; it < 8; it++) {
    for (let i = 1; i <= n; i++) {
      let p = add(pts[i], scl(dir, ls * 0.5));
      p = add(pts[i - 1], scl(norm(sub(p, pts[i - 1])), ls));
      pts[i] = collide(p, colliders, fallback);
    }
  }
  return pts;
}

/**
 * Pano pendurado numa borda (`ring`: os pontos presos, `radial`: para fora em cada um): NV fileiras de elos de `ls` px.
 * o: { flow, phase, fan (abre em leque), spread (quanto a barra pode abrir em relação à borda), open (afastamento inicial) }.
 */
function drape(S, ring, radial, NV, ls, colliders, fallback, o = {}) {
  const NU = ring.length - 1;
  const flow = o.flow || 0, phase = o.phase || 0, spread = o.spread ?? 2;
  // Leque e comprimento podem mudar por coluna (a parte de trás do casaco abre mais e é mais comprida).
  const fanOf = (i) => (typeof o.fan === 'function' ? o.fan(i / NU) : o.fan ?? 0.16);
  const lsOf = (i) => ls * (o.longer ? o.longer(i / NU) : 1);
  const open = o.open || ((j) => (j === 0 ? 0 : 0.8 + 0.4 * j));
  const grid = [];
  for (let j = 0; j <= NV; j++) grid.push(ring.map((p, i) => add(add(p, scl(radial[i], open(j))), [0, -lsOf(i) * j * 0.9, 0])));
  const pull = grid.map((row, j) => row.map((_, i) => {
    const flutter = Math.sin((phase * 2 + (i / NU) * 0.7 + (j / NV) * 0.5) * TAU) * (0.05 + flow * 0.22) * (j / NV);
    return scl(norm(add(swingDir(S, flow, flutter), scl(radial[i], fanOf(i)))), lsOf(i) * 0.45);
  }));
  const rest = ring.slice(0, NU).map((p, i) => len(sub(ring[i + 1], p)));
  for (let it = 0; it < 9; it++) {
    for (let j = 1; j <= NV; j++) {
      const v = j / NV;
      for (let i = 0; i <= NU; i++) {
        let p = add(grid[j][i], pull[j][i]);
        const up = grid[j - 1][i];
        p = add(up, scl(norm(sub(p, up)), lsOf(i)));
        grid[j][i] = collide(p, colliders, fallback);
      }
      // O pano não abre mais do que a largura dele (as colunas vizinhas se puxam).
      for (let i = 0; i < NU; i++) {
        const wmax = rest[i] * lerp(1.05, spread, v);
        const a = grid[j][i], b = grid[j][i + 1], d = sub(b, a), dl = len(d);
        if (dl <= wmax) continue;
        const fix = scl(d, (dl - wmax) / dl / 2);
        grid[j][i] = add(a, fix);
        grid[j][i + 1] = sub(b, fix);
      }
    }
  }
  for (let j = 1; j <= NV; j++) for (let i = 0; i <= NU; i++) grid[j][i] = collide(grid[j][i], colliders, fallback);
  return grid;
}

/**
 * O pano em triângulos com a normal suave (virada para fora: para longe da linha da coluna do boneco). Por fora `mat`
 * (com `paint(u, v)`), por dentro `back` (o forro). Devolve as normais dos vértices.
 */
function emitCloth(c, grid, base) {
  const { J } = c;
  const NV = grid.length - 1, NU = grid[0].length - 1;
  const spineA = J.pelvis, spineB = J.neck;
  const outOf = (p) => {
    const ab = sub(spineB, spineA), k = clamp(dot(sub(p, spineA), ab) / dot(ab, ab), 0, 1.2);
    return norm(sub(p, add(spineA, scl(ab, k))));
  };
  const vn = grid.map((row, j) => row.map((p, i) => {
    const tu = sub(grid[j][Math.min(NU, i + 1)], grid[j][Math.max(0, i - 1)]);
    const tv = sub(grid[Math.min(NV, j + 1)][i], grid[Math.max(0, j - 1)][i]);
    const n = norm(cross(tu, tv));
    return dot(n, outOf(p)) < 0 ? scl(n, -1) : n;
  }));
  const uv = (ii, jj) => [ii / NU, jj / NV];
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const a = grid[j][i], b = grid[j][i + 1], d0 = grid[j + 1][i], d1 = grid[j + 1][i + 1];
      const out1 = norm(add(add(vn[j][i], vn[j][i + 1]), vn[j + 1][i]));
      const out2 = norm(add(add(vn[j][i + 1], vn[j + 1][i + 1]), vn[j + 1][i]));
      c.P({ k: 'tri', ...base, v: [a, b, d0], uv: [uv(i, j), uv(i + 1, j), uv(i, j + 1)], vn: [vn[j][i], vn[j][i + 1], vn[j + 1][i]], out: out1 });
      c.P({ k: 'tri', ...base, v: [b, d1, d0], uv: [uv(i + 1, j), uv(i + 1, j + 1), uv(i, j + 1)], vn: [vn[j][i + 1], vn[j + 1][i + 1], vn[j + 1][i]], out: out2 });
    }
  }
  return vn;
}

// ------------------------------------------------------------------ carimbos (rosto, símbolos)

/**
 * Olhos (base: os aprovados do boneco antigo, redesenhados no estilo da referência): de frente (o olho que fica à
 * esquerda da tela; o outro é o espelho) e de perfil (olhando para a esquerda). Letras: K traço, P pupila, W branco,
 * H brilho, 1-3 íris (escuro -> claro). As linhas 0-2 são a sobrancelha: o masculino não tem (fica sob a franja, como
 * na referência); a do `foco` entra por cima. O cílio de cima sobe para o canto de fora e o brilho fica logo abaixo
 * dele: o olho fica aberto e calmo (com a pupila colada no cílio, ele parecia caído e com sono).
 */
const EYES = {
  masculino: {
    frente: ['........', '........', '........', '...KKKKK', 'KKKKKKKK', '.K1HH1PK', '.W1HPP1W', '.W11PP2W', '.W12223W', '..W233W.'],
    lado: ['.......', '.......', '.......', '..KKKKK', 'KKKKKKK', '.KHP11W', '.KPP12W', '.W1122W', '..1223.', '..W33..'],
  },
  cilios: {
    frente: ['...KKKK..', '..K....K.', '.........', '....KKKKK', 'KKKKKKKKK', 'KKK1HH1PK', '.KW1HPP1W', '..W11PP2W', '..W12223W', '.KKW233W.'],
    lado: ['..KKKK.', '.K....K', 'KK.....', 'KKKKKKK', 'KKKKKKK', 'KKHP11W', '.KPP12W', '.W1122W', '..1223.', '.KW33..'],
  },
};
/** Expressões: trocam as linhas do olho (a partir da 3) mantendo o tamanho. */
const EXPR = {
  fechados: { frente: ['........', '........', '........', '........', 'K......K', '.KKKKKK.'], lado: ['.......', '.......', '.......', '.......', 'K.....K', '.KKKKK.'] },
  dor: { frente: ['........', '........', 'KK......', '..KKK...', '.....KK.', '..KKK...', 'KK......'], lado: ['.......', '.......', 'KK.....', '..KKK..', '....KK.', '..KKK..', 'KK.....'] },
};
const BROW_FOCO = { frente: ['.KK.....', '...KKKK.', '......KK'], lado: ['KK.....', '.KKKK..', '....KK.'] };
/** Bocas: a = tom da boca, b = tom escuro da boca, K traço, t língua, W dentes. */
const MOUTHS = {
  calma: { frente: ['.bbb.'], lado: ['bb'] },
  sorriso: { frente: ['a...a', '.bbb.'], lado: ['ba'] },
  grito: { frente: ['.bbb.', 'bKKKb', 'bKtKb', '.bbb.'], lado: ['bb', 'Kb', 'tb', 'bb'] },
  dentes: { frente: ['bbbbb', 'bWWWb', 'bbbbb'], lado: ['bb', 'Wb', 'bb'] },
};
/** Símbolos das vilas (gravados na placa da bandana e no peito). 5 x 5 e 3 x 3. */
const SYMBOLS = {
  vila_1: { g: ['.KKK.', 'K...K', 'K.K.K', 'K..K.', '.KK..'], p: ['KKK', 'K.K', 'KK.'] },          // folha (espiral)
  vila_3: { g: ['K.K.K', '.....', 'K.K.K', '.....', 'K.K.K'], p: ['K.K', '...', 'K.K'] },          // névoa (gotas)
  vila_4: { g: ['.KK..', 'KKKK.', 'KKKKK', '.....', 'KKKKK'], p: ['.K.', 'KKK', '...'] },          // nuvem
  vila_5: { g: ['KKKKK', '.K.K.', '..K..', '.K.K.', 'KKKKK'], p: ['KKK', '.K.', 'KKK'] },          // areia (ampulheta)
};
const CAPE_EMBLEMS = {
  brasa: ['...R...', '..RRR..', '.RRWRR.', 'RRWWWRR', '.RRWRR.', '..RRR..', '...R...'],
  kage: ['...R...', 'RRRRRRR', '.R.R.R.', '.RRRRR.', '..R.R..', '.RRRRR.', 'R.R.R.R', '..R.R..'],
  circulo: ['..RRR..', '.RRRRR.', 'RRR.RRR', 'RR...RR', 'RRR.RRR', '.RRRRR.', '..RRR..'],
  circulo_vila: ['..RRR..', '.RRRRR.', 'RRRRRRR', 'RRRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..'],
};

// ------------------------------------------------------------------ desenho final

/**
 * Desenha o boneco. look: visual normalizado (+ `shoes`); pose: rig.poseOf(...); yaw: direção (0 = de frente).
 * opts: { cape, capeVillage, renegade, flow, phase }.
 * Devolve { rgba (64 x 96 x 4), depth (profundidade de cada pixel; -Infinity = vazio), top (linha mais alta pintada),
 * mirror, anchors: { hand: [x, y, profundidade, graus], back: [x, y, profundidade], view, flip } }.
 * Olhando para a esquerda (yaw < 0), desenha o lado direito e espelha (como o boneco antigo): a arma fica sempre na mão
 * de perto.
 */
export function renderFigure(look, pose, yaw, opts = {}) {
  let y = ((yaw % TAU) + TAU) % TAU;
  if (y > Math.PI + 1e-9) y -= TAU;
  const mirror = y < -1e-6;
  const S = solve(pose, mirror ? -y : y, look.gender);
  const mats = materialsFor(look, opts);
  const scene = buildScene(S, look, mats, opts);
  if (opts.only) {
    // Só algumas camadas (ícone do sapato, prancha das camadas separadas).
    // (olhos e boca precisam da cabeça para saber onde ficam: ela é desenhada, mas não sai na imagem)
    const face = opts.only.includes('olhos') || opts.only.includes('boca');
    for (const p of scene.prims) {
      p.skip = !opts.only.includes(p.layer);
      p.support = p.skip && face && p.face;
    }
    scene.stamps = scene.stamps.filter((st) => opts.only.includes(st.layer));
  }
  const buf = newBuffer();
  for (const p of scene.prims) {
    if (p.skip && !p.support) continue;
    if (p.k === 'e') drawEllipsoid(buf, p);
    else if (p.k === 't') drawTube(buf, p);
    else drawTriangle(buf, p);
  }
  const col = new Int32Array(W * H).fill(-1);
  shade(buf, scene, col);
  for (const st of scene.stamps) stamp(buf, scene, col, st, S, look, pose, mats);
  const depth = outline(buf, scene, col);
  if (opts.only) {
    for (let i = 0; i < W * H; i++) if (buf.part[i] >= 0 && scene.prims[buf.part[i]].support && !buf.stamped?.[i]) { col[i] = -1; depth[i] = -Infinity; }
  }
  closePockets(col, depth);
  if (!opts.only) dropSpecks(col, depth);            // camadas soltas (prancha, ícone) têm peças pequenas de verdade: a boca
  const rgba = new Uint8ClampedArray(W * H * 4);
  let top = H;
  for (let i = 0; i < W * H; i++) {
    const c = col[i];
    if (c < 0) continue;
    const o = i * 4;
    rgba[o] = (c >> 16) & 255; rgba[o + 1] = (c >> 8) & 255; rgba[o + 2] = c & 255; rgba[o + 3] = 255;
    const py = (i / W) | 0;
    if (py < top) top = py;
  }
  const anchors = anchorsOf(S, opts, mirror ? -y : y);
  if (mirror) {
    flipX(rgba, 4); flipX(depth, 1);
    anchors.hand[0] = W - anchors.hand[0];
    anchors.hand[3] = (540 - anchors.hand[3]) % 360;
    anchors.back[0] = W - anchors.back[0];
    anchors.flip = !anchors.flip;
  }
  return { rgba, depth, top, mirror, anchors };
}

/**
 * Bolsões: 1 px vazio cercado pelos 4 lados (ou 2 px vazios em linha, cercados) vira traço. Eles aparecem onde a ponta
 * fina de uma mecha ou de um pano quase encosta em outra peça e, de longe, parecem pontinhos soltos (na pixel art feita
 * à mão não existem). Um vão de verdade (entre o braço e o corpo, entre as pernas) é mais largo ou aberto de um lado.
 */
function closePockets(col, depth) {
  const ink = pack(rgbOf(OUTLINE));
  const on = (j) => (col[j] >= 0 ? 1 : 0);
  const fill = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (col[i] >= 0) continue;
      const n = on(i - 1) + on(i + 1) + on(i - W) + on(i + W);
      if (n === 4) { fill.push(i); continue; }
      if (n !== 3) continue;
      // par: o vizinho vazio também só tem uma saída (de volta para este)
      const j = !on(i - 1) ? i - 1 : !on(i + 1) ? i + 1 : !on(i - W) ? i - W : i + W;
      const jx = j % W, jy = (j / W) | 0;
      if (jx < 1 || jy < 1 || jx >= W - 1 || jy >= H - 1) continue;
      if (on(j - 1) + on(j + 1) + on(j - W) + on(j + W) === 3) fill.push(i);
    }
  }
  for (const i of fill) {
    let z = Infinity;
    for (const j of [i - 1, i + 1, i - W, i + W]) if (col[j] >= 0 && depth[j] < z) z = depth[j];
    col[i] = ink;
    depth[i] = z;
  }
}

/**
 * Ciscos: pedacinho solto (até 10 px, contando o traço) longe do resto do boneco. É a ponta de uma mecha fina que o
 * desenho perdeu no meio: sozinha, vira uma cruzinha de traço flutuando perto da cabeça.
 */
function dropSpecks(col, depth) {
  const seen = new Uint8Array(W * H), stack = new Int32Array(W * H), piece = new Int32Array(11);
  for (let s = 0; s < W * H; s++) {
    if (col[s] < 0 || seen[s]) continue;
    let top = 0, n = 0;
    stack[top++] = s; seen[s] = 1;
    while (top) {
      const i = stack[--top];
      if (n < 11) piece[n] = i;
      n++;
      const x = i % W, y = (i / W) | 0;
      for (let b = Math.max(0, y - 1); b <= Math.min(H - 1, y + 1); b++) {
        for (let a = Math.max(0, x - 1); a <= Math.min(W - 1, x + 1); a++) {
          const j = b * W + a;
          if (col[j] >= 0 && !seen[j]) { seen[j] = 1; stack[top++] = j; }
        }
      }
    }
    if (n <= 10) for (let k = 0; k < n; k++) { col[piece[k]] = -1; depth[piece[k]] = -Infinity; }
  }
}

function flipX(arr, k) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W / 2; x++) {
      const a = (y * W + x) * k, b = (y * W + (W - 1 - x)) * k;
      for (let j = 0; j < k; j++) { const t = arr[a + j]; arr[a + j] = arr[b + j]; arr[b + j] = t; }
    }
  }
}

const pack = (c) => (c[0] << 16) | (c[1] << 8) | c[2];

/** Luz -> tom de cada pixel (em faixas, sem degradê). */
function shade(buf, scene, col) {
  const { prims } = scene;
  for (let i = 0; i < W * H; i++) {
    const p = buf.part[i];
    if (p < 0) continue;
    const m = buf.mat[i];
    let t = buf.tone[i];
    if (t < 0) {
      const s = buf.nx[i] * LIGHT[0] + buf.ny[i] * LIGHT[1] + buf.nz[i] * LIGHT[2] + (prims[p].bias || 0) + buf.lb[i];
      t = s >= m.hi ? 4 : s >= m.lt ? 3 : s >= m.sh ? 2 : s >= m.dp ? 1 : 0;
      // Sombra do cabelo / da bandana no rosto: 2 px embaixo da franja ficam na sombra.
      if (prims[p].face && t > 1) {
        for (const up of [1]) {
          const j = i - up * W;
          if (j >= 0 && buf.part[j] >= 0 && prims[buf.part[j]].grp !== prims[p].grp && buf.z[j] > buf.z[i] + 0.5) { t = 1; break; }
        }
      }
    }
    col[i] = pack(t === 5 ? m.out : m.rgb[t]);
  }
}

/** Ponto do mundo visível? (o pixel dele é da forma `prim` ou de uma forma do mesmo grupo, perto da profundidade.) */
function visibleAt(buf, scene, x, y, grp, z, tol = 2.5) {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const i = y * W + x;
  const p = buf.part[i];
  if (p < 0 || scene.prims[p].grp !== grp) return false;
  return z === undefined || Math.abs(buf.z[i] - z) < tol;
}

function stamp(buf, scene, col, st, S, look, pose, mats) {
  if (st.kind === 'olhos' || st.kind === 'boca') return face(buf, scene, col, S, look, pose, st.kind);
  if (dot(st.normal, VIEW) < 0.2) return;                              // virado para longe da câmera
  const [cx, cy] = proj(st.at);
  const at = buf.part[clamp(Math.round(cy - 0.5), 0, H - 1) * W + clamp(Math.round(cx - 0.5), 0, W - 1)];
  if (at < 0) return;
  const grp = scene.prims[at].grp;
  let rows, colors;
  if (st.kind === 'placa') {
    rows = (SYMBOLS[st.village] || SYMBOLS.vila_1).g;
    colors = { K: pack(st.mat.rgb[0]) };
    if (st.scratch) {                                                    // renegado: um risco por cima do símbolo
      rows = rows.map((r, j) => r.split('').map((ch, i) => (i === j || i === j + 1 ? 'S' : ch)).join(''));
      colors.S = 0x1b1512;
    }
  } else if (st.kind === 'simbolo') {
    rows = (SYMBOLS[look.village] || SYMBOLS.vila_1)[st.size];
    colors = { K: pack(st.mat.rgb[2]) };
  } else if (st.kind === 'rebite') {
    rows = ['K'];
    colors = { K: pack(st.mat.rgb[0]) };
  } else if (st.kind === 'capa') {
    rows = CAPE_EMBLEMS[st.emblem];
    colors = { R: pack(st.emblem === 'brasa' ? rgbOf('#d9772b') : st.mat.rgb[2]), W: pack(rgbOf('#f4ead8')) };
  }
  if (!rows) return;
  const h = rows.length, w = rows[0].length;
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const ch = rows[j][i];
      if (ch === '.' || colors[ch] === undefined) continue;
      if (!visibleAt(buf, scene, x0 + i, y0 + j, grp)) continue;
      col[(y0 + j) * W + x0 + i] = colors[ch];
    }
  }
}

/** Olhos, sobrancelhas e boca no lugar certo da cabeça (de frente, de lado ou nada, se estiver de costas). */
/**
 * v35: o olho do Clã Rubro (opção B do Victor): íris vermelha com brilho que cresce a cada tier despertado (1 a 4). Só visual.
 * [pupila, íris escura, íris, íris clara] como a paleta dos olhos.
 */
const RUBRO_EYES = [
  ['#2a0608', '#6e1414', '#9a1e1e', '#b83030'],
  ['#300608', '#861616', '#b82020', '#d84040'],
  ['#38060a', '#a01818', '#d82424', '#f45a48'],
  ['#42060a', '#b81818', '#f02a2a', '#ff8a6e'],
];

function face(buf, scene, col, S, look, pose, part) {
  const { head, hx, hy, hz } = scene;
  const R = S.R.head, C = S.J.head;
  const fwd = apply(R, [0, 0, 1]);
  if (dot(fwd, VIEW) < -0.1) return;                                   // de costas
  const side = Math.abs(fwd[0]) > 0.62;                                 // de perfil
  const rubroTier = look.lineage && look.lineage.clan === 'rubro' ? Math.max(1, Math.min(4, look.lineage.tier || 1)) : 0;
  const eyePal = rubroTier ? RUBRO_EYES[rubroTier - 1] : PAL.olho[look.eyeColor] || PAL.olho.azul;
  const skin = PAL.pele[look.skin] || PAL.pele.claro;
  const colors = {
    K: pack(rgbOf(OUTLINE)), W: 0xf4f6fa, H: rubroTier >= 3 ? pack(rgbOf('#ffd2c2')) : 0xffffff, P: pack(rgbOf(eyePal[0])), 1: pack(rgbOf(eyePal[1])), 2: pack(rgbOf(eyePal[2])), 3: pack(rgbOf(eyePal[3])),
    a: pack(rgbOf(skin[8])), b: pack(rgbOf(skin[9])), t: pack(rgbOf(skin[7])), s: pack(rgbOf(skin[3])),
  };
  const style = EYES[look.eyeStyle] || EYES.masculino;
  const view = side ? 'lado' : 'frente';
  let rows = style[view].slice();
  const e = EXPR[pose.eyes];
  if (e) rows = rows.map((r, j) => (j >= 3 ? (e[view][j - 3] ?? '.'.repeat(r.length)).padEnd(r.length, '.').slice(0, r.length) : r));
  // Foco: sobrancelha franzida e a pálpebra de cima abaixada (cobre o alto da íris): o olhar fica estreito e firme.
  if (pose.eyes === 'foco') rows = rows.map((r, j) => (j < 3 ? BROW_FOCO[view][j].padEnd(r.length, '.').slice(0, r.length) : j < 5 ? '.'.repeat(r.length) : j === 5 ? 'K'.repeat(r.length) : r));
  const surf = (x, y) => {
    const k = 1 - (x / hx) ** 2 - (y / hy) ** 2;
    return [x, y, hz * Math.sqrt(Math.max(0, k))];
  };
  const put = (local, pat, flipH) => {
    const wp = add(C, apply(R, local));
    const n = norm(apply(R, [local[0] / (hx * hx), local[1] / (hy * hy), local[2] / (hz * hz)]));
    if (dot(n, VIEW) < 0.12) return;
    const [cx, cy, cz] = proj(wp);
    const h = pat.length, w = pat[0].length;
    const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const ch = pat[j][flipH ? w - 1 - i : i];
        if (ch === '.' || colors[ch] === undefined) continue;
        if (!visibleAt(buf, scene, x0 + i, y0 + j, head.grp, cz, 5)) continue;
        col[(y0 + j) * W + x0 + i] = colors[ch];
        (buf.stamped ||= new Uint8Array(W * H))[(y0 + j) * W + x0 + i] = 1;
      }
    }
  };
  const ey = -hy * 0.32, ex = hx * 0.5;                                // olhos no meio do rosto (mais para baixo parecia caído)
  const mouth = (MOUTHS[pose.mouth] || MOUTHS.calma)[view];
  if (side) {
    // O olho de perto (o de longe some atrás do nariz); olhando para a direita, espelha o desenho.
    const toRight = fwd[0] > 0;
    const near = apply(R, [1, 0, 0])[2] > 0 ? 1 : -1;
    // Recuado da borda do rosto, como na referência; o cabelo longo cobre o lado do rosto, então ali ele fica na frente.
    const back = look.hairStyle === 'longo_lateral' ? 0.92 : 1.45;
    if (part === 'olhos') put(surf(near * ex * back, ey), rows, toRight);
    else put(surf(near * hx * 0.12, -hy * 0.8), mouth, toRight);
  } else if (part === 'olhos') {
    put(surf(-ex, ey), rows, false);
    put(surf(ex, ey), rows, true);
  } else {
    put(surf(0, -hy * 0.74), mouth, false);
    put(surf(hx * 0.05, -hy * 0.55), ['s'], false);                     // nariz: um pontinho de sombra
  }
}

/** A partir de quanto uma peça de outro grupo precisa passar na frente para ganhar o traço por dentro. */
const LINE_T = 0.35;

/**
 * Traço: por fora (o pixel vazio encostado no boneco) e por dentro (onde uma peça de outro grupo passa na frente). Devolve a profundidade de cada pixel (o contorno pega a do
 * vizinho), para fatiar o boneco na frente/atrás da arma.
 */
function outline(buf, scene, col) {
  const { prims } = scene;
  const depth = new Float32Array(W * H).fill(-Infinity);
  const inner = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const p = buf.part[i];
      if (p >= 0) {
        depth[i] = buf.z[i];
        const me = prims[p];
        const thr = me.lineThr ?? LINE_T;
        for (let d = 0; d < 4; d++) {
          const j = d === 0 ? (y > 0 ? i - W : -1) : d === 1 ? (y < H - 1 ? i + W : -1) : d === 2 ? (x > 0 ? i - 1 : -1) : x < W - 1 ? i + 1 : -1;
          if (j < 0) continue;
          const q = buf.part[j];
          if (q < 0 || q === p) continue;
          const them = prims[q];
          if (them.grp === me.grp && !(me.k === 't' && them.k === 't' && me.layer === 'cabelo' && them.layer === 'cabelo')) continue;
          if (buf.z[j] - buf.z[i] > (them.lineThr ?? thr)) { inner.push(i); break; }
        }
        continue;
      }
      let best = -1, bz = -Infinity;
      for (let d = 0; d < 4; d++) {
        const j = d === 0 ? (y > 0 ? i - W : -1) : d === 1 ? (y < H - 1 ? i + W : -1) : d === 2 ? (x > 0 ? i - 1 : -1) : x < W - 1 ? i + 1 : -1;
        if (j < 0 || buf.part[j] < 0 || prims[buf.part[j]].support) continue;
        if (buf.z[j] > bz) { bz = buf.z[j]; best = j; }
      }
      if (best >= 0) { col[i] = pack(buf.mat[best].out); depth[i] = bz; }
    }
  }
  for (const i of inner) col[i] = pack(buf.mat[i].out);
  return depth;
}

/**
 * Âncoras para o que o jogo desenha junto do boneco: a mão da arma (a direita dele: de lado é a de perto) com o ângulo
 * da lâmina (0° = direita, sentido horário) e o meio das costas (itens nas costas). `view`/`flip` = a arte das costas
 * (0 frente, 1 lado, 2 costas; espelhar).
 */
function anchorsOf(S, opts, yaw) {
  const { J, R, pose } = S;
  const hp = proj(J.handR);
  const b = (pose.blade || 0) * Math.PI / 180;
  // A lâmina continua a linha do antebraço, um pouco para a frente (como quem segura a kunai pronta para cortar).
  const blade3 = apply(R.foreR, norm([0, -Math.cos(b) - 0.4 * Math.sin(b), -Math.sin(b) + 0.4 * Math.cos(b)]));
  const tip = proj(add(J.handR, scl(blade3, 6)));
  const deg = (Math.atan2(tip[1] - hp[1], tip[0] - hp[0]) * 180) / Math.PI;
  const backPt = add(J.chest, apply(R.chest, [0, 0.4, -4.8]));
  const bp = proj(backPt);
  const a = ((yaw % TAU) + TAU) % TAU;
  const dir = Math.round(a / (Math.PI / 2)) % 4;                        // 0 frente, 1 direita, 2 costas, 3 esquerda
  const view = dir === 0 ? 0 : dir === 2 ? 2 : 1;
  return {
    hand: [hp[0], hp[1], hp[2] - 0.6, ((deg % 360) + 360) % 360],
    back: [bp[0], bp[1], bp[2] + (opts.cape ? 3.2 : 1.2)],
    view,
    flip: dir === 1,
  };
}
