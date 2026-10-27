// O boneco em PIXEL ART desenhado por código em cima do esqueleto 3D (rig.js).
//
// Cada parte do corpo é uma forma 3D simples presa num osso: elipsoides (cabeça, tronco, quadril, mãos, pés) e tubos
// (braços, pernas, mechas de cabelo). As camadas (roupa, sapato, cabelo, bandana, capa, acessórios) são as MESMAS formas
// um pouco maiores, presas nos mesmos ossos: por isso cabem certinho no corpo em qualquer pose e em qualquer direção.
//
// O desenho é feito pixel a pixel numa célula 64 x 96 (sem borrar):
//   1. cada forma marca, em cada pixel que cobre, a profundidade, a normal e o material (fica a mais perto da câmera);
//   2. a luz (de cima, da esquerda e da frente) escolhe o tom da rampa do material (luz, base, sombra), em faixas;
//   3. olhos, boca e símbolos são carimbos de pixel art (desenhados à mão, nunca deformados) no lugar certo do rosto;
//   4. contorno escuro por fora e linhas por dentro onde uma parte passa na frente da outra (o "traço" de anime).
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

/**
 * Material: os tons [fundo, sombra, base, luz, brilho] e o contorno. `hi` = a partir de que luz usa o brilho (só no
 * cabelo e no metal). Os limites das faixas: luz acima de `lt`, sombra abaixo de `sh`, fundo abaixo de `dp`.
 */
function material(tones, out, extra = {}) {
  return { rgb: tones.map(rgbOf), out: rgbOf(out), lt: 0.6, sh: -0.02, dp: -0.62, hi: 2, ...extra };
}

/** Materiais de um visual: pele, cabelo, olhos, roupas (cores do jogador e da vila), metal, capa. */
export function materialsFor(look, opts = {}) {
  const skin = PAL.pele[look.skin] || PAL.pele.claro;
  const hair = PAL.cabelo[look.hairColor] || PAL.cabelo.castanho;
  const vila = VILAS[look.village] || VILAS.vila_1;
  const cloth = (name) => { const r = PAL.roupa[name] || PAL.roupa.cinza; return material([r[1], r[1], r[2], r[3], r[4]], r[0]); };
  const shoe = SHOES[look.shoes];
  const m = {
    pele: material([skin[4], skin[3], skin[2], skin[1], skin[0]], skin[6], { lt: 0.72, sh: -0.12, dp: -0.7 }),
    rosto: material([skin[3], skin[3], skin[2], skin[1], skin[0]], skin[6], { lt: 2, sh: -0.3, dp: -2 }),
    cabelo: material([hair[1], hair[1], hair[2], hair[3], hair[4]], hair[0], { lt: 0.56, sh: -0.08, hi: 0.93 }),
    cueca: cloth('cinza'),
    camisa: cloth(look.shirtColor),
    logo: cloth(vila.logo),
    gola: cloth('creme'),
    calca: cloth(look.pantsColor),
    faixa: cloth('creme'),
    colete: cloth(vila.conjunto[0]),
    terno: cloth(vila.conjunto[1]),
    faixa_vila: cloth(vila.conjunto[2]),
    bandana: cloth(vila.bandana),
    aco: (() => { const r = PAL.roupa.aco; return material([r[1], r[1], r[2], r[3], r[4]], r[0], { lt: 0.45, sh: -0.2, hi: 0.82 }); })(),
    couro: cloth('marrom'),
    preto: cloth('preto'),
  };
  if (shoe) { m.sapato = cloth(shoe.colors[0]); m.sapato2 = cloth(shoe.colors[1]); m.sola = cloth(shoe.colors[2]); }
  if (opts.cape) {
    const [c, dark, trim] = capeColors(opts.cape, opts.capeVillage ?? look.village);
    const r = rampFromHex(c), d = rampFromHex(dark), t = rampFromHex(trim);
    m.capa = material([r[1], r[1], r[2], r[3], r[4]], r[0], { lt: 0.78, sh: -0.3 });
    m.forro = material([d[0], d[1], d[1], d[2], d[2]], d[0]);
    m.barra = material([t[1], t[1], t[2], t[3], t[4]], t[0]);
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
  botas_ninja: { sprite: 'bota', colors: ['preto', 'cinza', 'marrom'] },
};

/** Capas do fim de jogo: [pano, forro, barra]. A da vila usa a cor da vila. Mesmas cores de endgame.js. */
const CAPE_COLORS = {
  capa_viagem: ['#7a5a3a', '#5a4029', '#c9a46a'],
  manto_kage: ['#eeeae0', '#c9c3b4', '#c8321e'],
  manto_akatsuki: ['#1d1a22', '#0f0d12', '#c8261e'],
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

// ------------------------------------------------------------------ cena: corpo e camadas

/**
 * Monta as formas de um boneco já resolvido (S = solve(pose, yaw, gênero)). Cada forma: { k: 'e'|'t'|'tri', mat,
 * grp (grupo: o traço por dentro só aparece entre grupos diferentes), layer (a camada), ... }.
 * opts: { cape, capeVillage, flow (0 parado .. 1 correndo: a capa e a faixa da bandana vão para trás), phase (0..1) }.
 */
export function buildScene(S, look, mats, opts = {}) {
  const { J, R, B } = S;
  const prims = [];
  const stamps = [];
  const fem = look.gender === 'f';
  let gid = 0;
  const G = () => ++gid;
  const P = (o) => { o.id = prims.length; prims.push(o); return o; };
  const ell = (layer, grp, mat, c, m, r, extra) => P({ k: 'e', layer, grp, mat, c, m, r, ...extra });
  const tube = (layer, grp, mat, a, b, ra, rb, extra) => P({ k: 't', layer, grp, mat, a, b, ra, rb, ...extra });
  const at = (base, rot, v) => add(base, apply(rot, v));
  const flow = opts.flow || 0;
  const phase = opts.phase || 0;

  // ---- cabeça (o rosto e as orelhas)
  const hx = B.head * 0.97, hy = B.head, hz = B.head * 0.92;
  const headR = R.head, headC = J.head;
  const gHead = G();
  const head = ell('corpo', gHead, mats.rosto, headC, headR, [hx, hy, hz], { face: true });
  for (const side of [1, -1]) ell('corpo', gHead, mats.pele, at(headC, headR, [side * hx * 0.94, -hy * 0.16, -hz * 0.08]), headR, [1.7, 3.2, 2.4], { ear: side });
  // ---- pescoço, tronco, quadril
  const gTorso = G();
  const neckTop = at(J.headBase, headR, [0, 3, -0.6]);
  tube('corpo', gTorso, mats.pele, J.neck, neckTop, fem ? 2.3 : 2.6, fem ? 2.2 : 2.5, { bias: -0.55 });
  const chestC = at(J.chest, R.chest, [0, 1.3, 0]);
  const chestR = fem ? [6.6, 6.4, 4.4] : [7.3, 6.6, 4.5];
  const bellyC = at(J.waist, R.chest, [0, 3.2, 0.2]);
  const bellyR = fem ? [5.5, 4.8, 4.0] : [6.0, 4.8, 4.1];
  const pelvisC = at(J.pelvis, R.pelvis, [0, -0.4, 0]);
  const pelvisR = fem ? [6.7, 4.6, 4.4] : [6.3, 4.4, 4.3];
  ell('corpo', gTorso, mats.pele, chestC, R.chest, chestR);
  ell('corpo', gTorso, mats.pele, bellyC, R.chest, bellyR);
  ell('corpo', gTorso, mats.pele, pelvisC, R.pelvis, pelvisR);
  // Roupa de baixo (o corpo base nunca fica pelado): quadril e o comecinho das coxas.
  ell('corpo', gTorso, mats.cueca, pelvisC, R.pelvis, add3(pelvisR, 0.35), { clip: (q) => q[1] < 1.6 });
  // ---- braços e mãos
  const limbs = {};
  for (const [side, key] of [[1, 'L'], [-1, 'R']]) {
    const g = G();
    limbs[`arm${key}`] = g;
    const sh = J[`shoulder${key}`], el = J[`elbow${key}`], wr = J[`wrist${key}`], hd = J[`hand${key}`];
    ell('corpo', gTorso, mats.pele, sh, R.chest, [3.2, 3.1, 3.1]);
    tube('corpo', g, mats.pele, sh, el, fem ? 2.7 : 3.0, fem ? 2.3 : 2.5, LIMB);
    tube('corpo', g, mats.pele, el, wr, fem ? 2.3 : 2.5, fem ? 1.9 : 2.1, LIMB);
    const hands = S.pose.hands;
    const gh = G();
    if (hands === 'aberta') {
      ell('corpo', gh, mats.pele, mix(wr, hd, 0.7), R[`fore${key}`], [2.9, 3.4, 1.7], LIMB);
    } else {
      ell('corpo', gh, mats.pele, mix(wr, hd, 0.7), R[`fore${key}`], [2.9, 3.0, 2.8], LIMB);
    }
  }
  // ---- pernas e pés
  for (const [side, key] of [[1, 'L'], [-1, 'R']]) {
    const g = G();
    limbs[`leg${key}`] = g;
    const hp = J[`hip${key}`], kn = J[`knee${key}`], an = J[`ankle${key}`];
    tube('corpo', g, mats.pele, hp, kn, fem ? 4.0 : 3.9, 3.0, LIMB);
    tube('corpo', g, mats.pele, kn, an, 3.0, 2.1, LIMB);
    ell('corpo', g, mats.cueca, hp, R[`thigh${key}`], [4.3, 3.2, 4.3], { clip: (q) => q[1] > -2.2 });
    const gf = G();
    limbs[`foot${key}`] = gf;
    const fr = R[`foot${key}`];
    ell('corpo', gf, mats.pele, at(an, fr, [0, -B.ankle + 1.6, (B.foot - 1.6) / 2]), fr, [2.4, 1.7, (B.foot + 1.6) / 2 + 0.6], LIMB);
  }

  // Corpo (com a roupa por cima) para o pano encostar: capa e pontas da bandana são empurradas para fora dele.
  const vestOn = look.outfit === 'vila' ? 1 : 0;
  const colliders = [
    { k: 'e', c: headC, m: headR, r: [hx + 2.6, hy + 2.6, hz + 2.6] },
    { k: 'e', c: chestC, m: R.chest, r: add3(chestR, 1 + vestOn) },
    { k: 'e', c: bellyC, m: R.chest, r: add3(bellyR, 1 + vestOn) },
    { k: 'e', c: pelvisC, m: R.pelvis, r: add3(pelvisR, 1.2) },
  ];
  for (const key of ['L', 'R']) {
    colliders.push({ k: 't', a: J[`shoulder${key}`], b: J[`shoulder${key}`], ra: 4.1, rb: 4.1 });
    colliders.push({ k: 't', a: J[`shoulder${key}`], b: J[`elbow${key}`], ra: 3.7, rb: 3.3 });
    colliders.push({ k: 't', a: J[`elbow${key}`], b: J[`hand${key}`], ra: 3.3, rb: 3.2 });
    colliders.push({ k: 't', a: J[`hip${key}`], b: J[`knee${key}`], ra: 4.9, rb: 4.0 });
    colliders.push({ k: 't', a: J[`knee${key}`], b: J[`ankle${key}`], ra: 4.0, rb: 3.2 });
    colliders.push({ k: 't', a: J[`heel${key}`], b: J[`toe${key}`], ra: 2.8, rb: 2.8 });
  }

  // ---- roupas (as mesmas formas, um pouco maiores)
  const vest = look.outfit === 'vila';
  const top = vest ? mats.terno : mats.camisa;
  const legs = vest ? mats.terno : mats.calca;
  // Camisa (básica: manga comprida, gola creme e o símbolo no peito) ou o macacão escuro do conjunto da vila.
  ell('camisa', gTorso, top, chestC, R.chest, add3(chestR, 0.6));
  ell('camisa', gTorso, top, bellyC, R.chest, add3(bellyR, 0.6));
  ell('camisa', gTorso, top, pelvisC, R.pelvis, add3(pelvisR, 0.95), { clip: (q) => q[1] > 0.4 });
  for (const key of ['L', 'R']) {
    const sh = J[`shoulder${key}`], el = J[`elbow${key}`], wr = J[`wrist${key}`];
    ell('camisa', gTorso, top, sh, R.chest, [3.8, 3.7, 3.7]);
    tube('camisa', limbs[`arm${key}`], top, sh, el, (fem ? 2.7 : 3.0) + 0.6, (fem ? 2.3 : 2.5) + 0.55, LIMB);
    tube('camisa', limbs[`arm${key}`], top, el, mix(el, wr, 0.82), (fem ? 2.3 : 2.5) + 0.55, (fem ? 1.9 : 2.1) + 0.6,
      { ...LIMB, paint: (k) => (k > 0.86 ? [vest ? mats.terno : mats.gola, 1] : null) });
  }
  // Gola: um anel em volta da base do pescoço.
  const gGola = G();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    ell('camisa', gGola, vest ? mats.colete : mats.gola, at(J.neck, R.chest, [Math.sin(a) * 3.0, -0.6, Math.cos(a) * 2.5 - 0.2]), R.chest,
      vest ? [2.2, 2.0, 2.2] : [1.5, 1.3, 1.5]);
  }
  if (!vest) stamps.push({ layer: 'camisa', kind: 'simbolo', at: at(chestC, R.chest, [3.6, 1.2, chestR[2] + 0.4]), mat: mats.logo, normal: apply(R.chest, [0.35, 0, 0.94]), size: 'p' });
  // Colete do conjunto da vila: por cima da camisa, com bolsos no peito, zíper e o símbolo nas costas.
  if (vest) {
    const gv = G();
    const pockets = (q) => {
      if (q[2] < 1) return null;
      const ax = Math.abs(q[0]);
      if (ax < 0.7) return [null, 0];                                      // zíper
      const inX = ax > 1.6 && ax < 6.4, inY = q[1] > -3.2 && q[1] < 3.4;
      if (inX && inY && (Math.abs(q[1] - 3.4) < 0.65 || Math.abs(q[1] + 3.2) < 0.65 || Math.abs(ax - 1.6) < 0.6 || Math.abs(ax - 6.4) < 0.6)) return [null, 1];
      if (inX && Math.abs(q[1] - 1.4) < 0.55) return [null, 1];             // tampa do bolso
      return null;
    };
    ell('conjunto', gv, mats.colete, chestC, R.chest, add3(chestR, 1.5), { paint: pockets });
    ell('conjunto', gv, mats.colete, bellyC, R.chest, add3(bellyR, 1.5), { paint: (q) => (q[2] > 1 && Math.abs(q[0]) < 0.7 ? [null, 0] : null), clip: (q) => q[1] > -3 });
    for (const key of ['L', 'R']) ell('conjunto', gv, mats.colete, J[`shoulder${key}`], R.chest, [3.4, 4.2, 4.4], { clip: (q) => q[1] > -0.5 });
    stamps.push({ layer: 'conjunto', kind: 'simbolo', at: at(chestC, R.chest, [0, 0.5, -(chestR[2] + 1.6)]), mat: mats.logo, normal: apply(R.chest, [0, 0, -1]), size: 'g' });
  }
  // Calça (básica: até o meio da canela, com faixas creme até o tornozelo; da vila: inteira, com faixas embaixo).
  ell('calca', gTorso, legs, pelvisC, R.pelvis, add3(pelvisR, 0.7), { clip: (q) => q[1] < 1.5 });
  for (const key of ['L', 'R']) {
    const hp = J[`hip${key}`], kn = J[`knee${key}`], an = J[`ankle${key}`];
    const g = limbs[`leg${key}`];
    const cut = vest ? 0.7 : 0.5;
    tube('calca', g, legs, hp, kn, (fem ? 4.0 : 3.9) + 0.7, 3.0 + 0.7, LIMB);
    tube('calca', g, legs, kn, mix(kn, an, cut), 3.0 + 0.7, lerp(3.0, 2.1, cut) + 0.75, LIMB);
    const wrap = vest ? mats.faixa_vila : mats.faixa;
    tube('calca', g, wrap, mix(kn, an, cut - 0.08), an, lerp(3.0, 2.1, cut) + 0.3, 2.1 + 0.45,
      { ...LIMB, paint: (k) => (Math.floor(k * 6) % 2 ? [null, 1] : null) });
  }
  // Acessório do conjunto: porta-kunai preso na coxa direita (com a faixa) e a bolsinha atrás da cintura.
  if (vest) {
    const kn = J.kneeR, hp = J.hipR, tr = R.thighR;
    const ga = G();
    const mid = mix(hp, kn, 0.55);
    ell('acessorio', limbs.legR, mats.faixa_vila, mid, tr, [4.5, 1.6, 4.5], { paint: (q) => (Math.abs(q[1]) > 0.8 ? [null, 1] : null) });
    ell('acessorio', ga, mats.preto, at(mid, tr, [-4.2, -0.4, 0.6]), tr, [1.5, 2.8, 2.5]);
    ell('acessorio', G(), mats.couro, at(pelvisC, R.pelvis, [0, 0.8, -(pelvisR[2] + 0.6)]), R.pelvis, [3.6, 2.0, 1.8]);
  }
  // Sapatos.
  const shoe = SHOES[look.shoes];
  if (shoe) {
    for (const key of ['L', 'R']) {
      const an = J[`ankle${key}`], kn = J[`knee${key}`], fr = R[`foot${key}`];
      const fc = at(an, fr, [0, -B.ankle + 1.6, (B.foot - 1.6) / 2]);
      const fl = (B.foot + 1.6) / 2 + 0.6;
      const g = limbs[`foot${key}`];
      if (shoe.sprite === 'bota') {
        ell('sapato', g, mats.sapato, fc, fr, [2.9, 2.2, fl + 0.5], { ...LIMB, paint: (q) => (q[1] < -1.2 ? [mats.sola, null] : null) });
        tube('sapato', limbs[`leg${key}`], mats.sapato, an, mix(an, kn, 0.5), 2.1 + 0.8, lerp(2.1, 3.0, 0.5) + 0.8,
          { paint: (k) => (k > 0.82 ? [mats.sapato2, null] : null) });
      } else {
        // Sandália ninja: sola, calcanhar e peito do pé fechados, dedos de fora; sobe um pouco no tornozelo.
        ell('sapato', g, mats.sapato, fc, fr, [2.8, 2.1, fl + 0.4],
          { ...LIMB, clip: (q) => q[2] < fl * 0.25 || q[1] < -1.1, paint: (q) => (q[1] < -1.1 ? [mats.sola, null] : null) });
        tube('sapato', limbs[`leg${key}`], mats.sapato, an, mix(an, kn, 0.16), 2.1 + 0.6, 2.4 + 0.6);
      }
    }
  }

  // ---- cabelo
  const hair = hairShapes(look.hairStyle, hx, hy, hz);
  const gHair = G();
  const hairline = hair.line;
  ell('cabelo', gHair, mats.cabelo, headC, headR, [hx + 1.4, hy + 1.4, hz + 1.4],
    { clip: (q) => q[1] > hairline(q[2] / (hz + 1.4), q[0] / (hx + 1.4)), tex: (q) => strands(Math.atan2(q[0], q[2]) * 5.2 + q[1] * 0.05) });
  for (const lock of hair.locks) {
    const g = lock.front ? G() : gHair;
    const pts = lock.pts.map((v) => at(headC, headR, v));
    for (let i = 0; i + 1 < pts.length; i++) {
      tube('cabelo', g, mats.cabelo, pts[i], pts[i + 1], lock.r[i], lock.r[i + 1], { lineThr: lock.front ? 1.2 : 2.4, radial: headC });
    }
  }
  // Mantos de cabelo (cabelo liso): elipsoides presos na cabeça, com as pontas recortadas.
  for (const sh of hair.sheets || []) {
    let c = at(headC, headR, sh.c), m = headR;
    if (sh.hang) {
      // Mecha que pende: presa no alto dela (na cabeça), cai na direção da gravidade (para trás com o vento da corrida,
      // balançando com o passo), não na direção da cabeça.
      const top = at(headC, headR, [sh.c[0], sh.c[1] + sh.r[1] * 0.55, sh.c[2]]);
      const sway = Math.sin(phase * TAU * (flow > 0.2 ? 2 : 1)) * (0.04 + flow * 0.1);
      const down = scl(swingDir(S, flow * 0.5, sway, sh.c[0] > 0 ? -0.15 : sh.c[0] < 0 ? 0.15 : 0), 1);
      const yh = scl(down, -1);
      const hxv = apply(headR, [1, 0, 0]);
      const xh = norm(sub(hxv, scl(yh, dot(hxv, yh))));
      const zh = cross(xh, yh);
      m = [xh[0], yh[0], zh[0], xh[1], yh[1], zh[1], xh[2], yh[2], zh[2]];
      c = add(top, scl(down, sh.r[1] * 0.55));
    }
    ell('cabelo', sh.front ? G() : gHair, mats.cabelo, c, m, sh.r,
      { clip: sh.clip, paint: sh.paint, lineThr: sh.front ? 1 : 2.4, tex: (q) => strands(q[0] / 2.4 + q[1] * 0.04 + sh.c[0]) });
  }

  // ---- bandana (faixa, placa de metal com o símbolo e o nó com as pontas atrás)
  if (look.bandana) {
    const gb = G();
    const band = (q) => q[1] > hy * 0.16 && q[1] < hy * 0.42;
    ell('chapeu', gb, mats.bandana, headC, headR, [hx + 2.0, hy + 2.0, hz + 2.0], { clip: band, zb: 3 });
    const gp = G();
    ell('chapeu', gp, mats.aco, headC, headR, [hx + 2.7, hy + 2.7, hz + 2.7],
      { clip: (q) => q[1] > hy * 0.13 && q[1] < hy * 0.45 && q[2] > 0 && Math.abs(q[0]) < hx * 0.36, zb: 3, lineThr: 0.25 });
    stamps.push({ layer: 'chapeu', kind: 'placa', at: at(headC, headR, [0, hy * 0.29, hz + 2.7]), normal: apply(headR, [0, 0.25, 0.97]), village: look.village, scratch: !!opts.renegade, mat: mats.aco });
    const knot = at(headC, headR, [0, hy * 0.3, -(hz + 3.6)]);
    ell('chapeu', gb, mats.bandana, knot, headR, [2.4, 2.0, 1.8], { zb: 2 });
    // Pontas da bandana: duas correntinhas de pano caindo do nó (gravidade, vento da corrida e encostando na cabeça e
    // nas costas).
    const tailBack = norm(sub(knot, headC));
    for (const side of [1, -1]) {
      const start = add(knot, apply(headR, [side * 1.2, -0.6, 0]));
      const flutter = Math.sin((phase * 2 + side * 0.23) * TAU) * (0.15 + flow * 0.4);
      // (a cabeça, para as pontas, é a cabeça com o volume do cabelo: elas caem por cima dele)
      const hairy = [{ k: 'e', c: headC, m: headR, r: [hx + 4.2, hy + 4.2, hz + 4.2] }, ...colliders.slice(1)];
      const pts = hangChain(start, 5, 2.2, swingDir(S, flow, flutter, side * 0.25), hairy, tailBack);
      for (let i = 0; i + 1 < pts.length; i++) {
        tube('chapeu', gb, mats.bandana, pts[i], pts[i + 1], lerp(1.4, 0.9, i / 4), lerp(1.4, 0.9, (i + 1) / 4), { zb: 2 });
      }
    }
  }

  // ---- capa
  if (opts.cape) capeShapes({ ...S, chestBack: chestR[2] + 1.2 + vestOn }, mats, opts, P, stamps, G(), colliders);

  // ---- rosto: olhos, sobrancelhas e boca (carimbos)
  stamps.push({ layer: 'olhos', kind: 'olhos', head, hx, hy, hz }, { layer: 'boca', kind: 'boca', head, hx, hy, hz });
  return { prims, stamps, head, hx, hy, hz };
}

const add3 = (r, d) => [r[0] + d, r[1] + d, r[2] + d];
/** Fios do cabelo: listras de luz e sombra (o brilho do cabelo fica quebrado em mechas, como no anime). */
const strands = (t) => { const f = t - Math.floor(t); return f < 0.18 ? -0.22 : f < 0.5 ? 0.06 : 0; };
/** Braços, pernas, mãos e pés: traço por dentro mesmo quando passam só um pouco na frente do corpo. */
const LIMB = { lineThr: 0.6 };

/**
 * Formas de cada penteado, no espaço da cabeça (x esquerda, y cima, z frente): `line(f, s)` = altura da linha do
 * cabelo (f: 1 frente, -1 nuca; s: lado) e as mechas (tubos com 2 ou 3 pontos e raios).
 */
function hairShapes(style, hx, hy, hz) {
  const R = [hx + 0.6, hy + 0.6, hz + 0.6];
  // Ponto na superfície da cabeça: az (graus; 0 = frente, +90 = esquerda dele), el (graus; 90 = topo), + fora.
  const S = (az, el, out = 0) => {
    const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
    return [Math.sin(a) * Math.cos(e) * (R[0] + out), Math.sin(e) * (R[1] + out), Math.cos(a) * Math.cos(e) * (R[2] + out)];
  };
  const locks = [];
  // Mecha espetada: da base (az, el) até a ponta na direção (az2, el2) a `len` px da cabeça, curvando um pouco.
  const spike = (az, el, az2, el2, ln, rb, bend = 1.2) => {
    const base = S(az, el, -1.6);
    const tip = S(az2, el2, ln);
    const mid = add(mix(base, tip, 0.5), scl(norm(S(az2, el2, 0)), bend));
    locks.push({ pts: [base, mid, tip], r: [rb, rb * 0.6, 0.45] });
  };
  // Franja: da base no alto da testa até a ponta na frente do rosto (rente à cabeça).
  const bang = (az, el, az2, el2, rb, out = 1.6) => {
    const base = S(az, el, -1.2);
    const tip = S(az2, el2, out);
    const mid = S((az + az2) / 2, (el + el2) / 2, out + 1.6);
    locks.push({ pts: [base, mid, tip], r: [rb, rb * 0.7, 0.5], front: true });
  };
  if (style === 'longo_lateral') {
    // Liso e comprido (como o antigo): franja de lado com as pontas recortadas, duas mechas emoldurando o rosto até o
    // peito e a cortina de trás até as costas. As mechas são mantos lisos (elipsoides), não tubos.
    const tri = (t) => Math.abs((((t % 1) + 1) % 1) - 0.5) * 2;
    const teeth = (x, w = 3.4, h = 2.2) => h * tri(x / w + 0.25);
    const fr = [hx + 2.0, hy + 2.0, hz + 2.0];
    const sheets = [
      { c: [0, 0, 0], r: fr, front: true,
        clip: (q) => q[2] > hz * 0.1 && q[1] > hy * (0.1 - 0.2 * (q[0] / fr[0])) + teeth(q[0] + 40) },
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
  // Espetado (padrão): coroa de pontas para cima e para trás, franja em pontas sobre a testa.
  spike(0, 58, 0, 80, 7.5, 4.6);
  for (const s of [1, -1]) {
    spike(s * 34, 52, s * 42, 66, 8.5, 4.6);
    spike(s * 70, 36, s * 84, 40, 8, 4.4);
    spike(s * 112, 34, s * 120, 34, 8, 4.4);
    spike(s * 148, 26, s * 154, 18, 7.5, 4.4);
    spike(s * 100, 6, s * 108, -8, 6, 3.6);
    spike(s * 160, -2, s * 164, -18, 6, 3.8);
  }
  spike(180, 48, 180, 54, 8, 4.6);
  spike(180, 8, 180, -10, 6.5, 4.2);
  for (const [az, el, az2, el2, rb] of [[0, 46, 0, 2, 4.2], [24, 44, 28, 0, 4.0], [-24, 44, -28, 0, 4.0], [50, 38, 58, -4, 3.8], [-50, 38, -58, -4, 3.8]]) bang(az, el, az2, el2, rb);
  for (const s of [1, -1]) bang(s * 66, 24, s * 72, -22, 3.2, 1.2);
  return { line: (f) => (f > 0 ? hy * (0.06 + 0.16 * f) : hy * (0.06 - 0.8 * -f)), locks };
}

// ------------------------------------------------------------------ física do pano (capa, pontas da bandana)
//
// O pano é uma grade de pontos ligados (colunas que caem da gola). A cada quadro ele é resolvido do zero (o quadro fica
// guardado, então a física tem de sair só da pose): a gravidade puxa cada ponto (para trás também, com o vento de
// andar e correr), cada ponto fica a uma distância fixa do de cima (o pano não estica) e é empurrado para fora do corpo
// (cabeça com o cabelo, tronco com a roupa, ombros, braços, coxas, canelas e pés). Repetindo isso algumas vezes, o pano
// assenta nos ombros, cai pelas costas e se dobra por cima do braço e do joelho que vão para trás, em vez de ser
// atravessado por eles.

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

/** Uma corrente de `n` elos de `ls` px pendurada em `start` (pontas da bandana). */
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
 * Capa: presa numa gola em volta da base do pescoço, assenta por cima dos ombros, cai pelas costas até o meio da canela
 * e encosta no corpo (física acima). Desenhada em triângulos com a normal suave; por fora a cor da capa (com a barra e
 * o emblema), por dentro o forro.
 */
function capeShapes(S, mats, opts, P, stamps, grp, colliders) {
  const { J, R, B } = S;
  const flow = opts.flow || 0, phase = opts.phase || 0;
  const NU = 10, NV = 9;
  const fwd = norm([R.pelvis[2], 0, R.pelvis[8]]);
  const back = scl(fwd, -1);
  // Borda de cima: presa por cima dos ombros (de uma ponta do ombro à outra, passando atrás do pescoço), como um manto.
  const back3 = S.chestBack ?? 5.6;
  const collar = [], radial = [];
  for (let i = 0; i <= NU; i++) {
    const c = 2 * (i / NU) - 1, c2 = c * c;
    const local = [-c * (B.shoulder + 3.2), lerp(B.chest + 0.7, B.shoulderY + 3.2, c2), lerp(-back3, 0.4, c2 * c2)];
    collar.push(add(J.waist, apply(R.chest, local)));
    radial.push(norm(apply(R.chest, [local[0] * 0.7, 0, local[2] - 1])));
  }
  const L = Math.max(10, collar[NU >> 1][1] - 7);
  const ls = (L / NV) * 1.1;
  // Ponto de partida: abre a partir da gola (por cima dos ombros) e desce.
  const grid = [];
  for (let j = 0; j <= NV; j++) {
    const row = [];
    for (let i = 0; i <= NU; i++) {
      const open = j === 0 ? 0 : 0.8 + 0.4 * j;
      row.push(add(add(collar[i], scl(radial[i], open)), [0, -ls * j * 0.9, 0]));
    }
    grid.push(row);
  }
  // Física: gravidade (com vento e um leque para os lados), comprimento fixo de cada elo, corpo e chão.
  const pull = grid.map((row, j) => row.map((_, i) => {
    const flutter = Math.sin((phase * 2 + (i / NU) * 0.7 + (j / NV) * 0.5) * TAU) * (0.05 + flow * 0.22) * (j / NV);
    return scl(norm(add(swingDir(S, flow, flutter), scl(radial[i], 0.16))), ls * 0.45);
  }));
  for (let it = 0; it < 9; it++) {
    for (let j = 1; j <= NV; j++) {
      const v = j / NV;
      for (let i = 0; i <= NU; i++) {
        let p = add(grid[j][i], pull[j][i]);
        const up = grid[j - 1][i];
        p = add(up, scl(norm(sub(p, up)), ls));
        grid[j][i] = collide(p, colliders, back);
      }
      // O pano não abre mais do que a largura dele (as colunas vizinhas se puxam).
      const wmax = lerp(ls * 0.9, ls * 1.25, v);
      for (let i = 0; i < NU; i++) {
        const a = grid[j][i], b = grid[j][i + 1], d = sub(b, a), dl = len(d);
        if (dl <= wmax) continue;
        const fix = scl(d, (dl - wmax) / dl / 2);
        grid[j][i] = add(a, fix);
        grid[j][i + 1] = sub(b, fix);
      }
    }
  }
  for (let j = 1; j <= NV; j++) for (let i = 0; i <= NU; i++) grid[j][i] = collide(grid[j][i], colliders, back);
  // Normais suaves, viradas para fora (para longe da linha da coluna do boneco).
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
  const paint = (u, v) => (v > 0.9 ? [mats.barra, null] : null);
  const uv = (ii, jj) => [ii / NU, jj / NV];
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
      const out1 = norm(add(add(vn[j][i], vn[j][i + 1]), vn[j + 1][i]));
      const out2 = norm(add(add(vn[j][i + 1], vn[j + 1][i + 1]), vn[j + 1][i]));
      P({ k: 'tri', layer: 'capa', grp, mat: mats.capa, back: mats.forro, v: [a, b, c], uv: [uv(i, j), uv(i + 1, j), uv(i, j + 1)],
        vn: [vn[j][i], vn[j][i + 1], vn[j + 1][i]], out: out1, paint });
      P({ k: 'tri', layer: 'capa', grp, mat: mats.capa, back: mats.forro, v: [b, d, c], uv: [uv(i + 1, j), uv(i + 1, j + 1), uv(i, j + 1)],
        vn: [vn[j][i + 1], vn[j + 1][i + 1], vn[j + 1][i]], out: out2, paint });
    }
  }
  // Emblema nas costas (só aparece se o lado de fora estiver virado para a câmera ali).
  const at = (u, v) => {
    const fi = u * NU, fj = v * NV, i = Math.min(NU - 1, Math.floor(fi)), j = Math.min(NV - 1, Math.floor(fj));
    const ku = fi - i, kv = fj - j;
    const p = mix(mix(grid[j][i], grid[j][i + 1], ku), mix(grid[j + 1][i], grid[j + 1][i + 1], ku), kv);
    const n = norm(mix(mix(vn[j][i], vn[j][i + 1], ku), mix(vn[j + 1][i], vn[j + 1][i + 1], ku), kv));
    return [add(p, scl(n, 0.3)), n];
  };
  const emblem = { manto_akatsuki: [[0.4, 0.34, 'nuvem'], [0.6, 0.52, 'nuvem'], [0.43, 0.72, 'nuvem']], manto_kage: [[0.5, 0.45, 'kage']],
    manto_campeao: [[0.5, 0.42, 'circulo']], capa_vila: [[0.5, 0.42, 'circulo_vila']] }[opts.cape] || [];
  for (const [u, v, kind] of emblem) {
    const [p, n] = at(u, v);
    stamps.push({ layer: 'capa', kind: 'capa', emblem: kind, at: p, normal: n, mat: mats.barra, cape: opts.cape });
  }
}

// ------------------------------------------------------------------ carimbos (rosto, símbolos)

/**
 * Olhos tirados do boneco antigo (aprovados): de frente (o olho que fica à esquerda da tela; o outro é o espelho) e de
 * lado (olhando para a esquerda). Letras: K contorno, P pupila, W branco, 1-3 íris (escuro -> claro).
 * As linhas 0-1 são a sobrancelha.
 */
const EYES = {
  masculino: {
    frente: ['..KKKKK.', '.KK...K.', '........', '..KKKK..', 'KKKKKKK.', 'KKKKKKKK', '.KPWPPPW', '.WPPPPPW', '.WP111PW', '..W2222W', '...232..', '....22..'],
    lado: ['.KKKKK.', 'KK.....', '.......', '.KKKK..', 'KKKKKKK', '.KPWPWK', '.KPPPWK', '.K11PW.', '..22PW.', '..232..', '...22..'],
  },
  cilios: {
    frente: ['...KKKK..', '..K....K.', '.........', '...KKKK..', '.KKKKKKK.', 'KKKKKKKKK', 'KKKPWPPPW', '..WPPPPPW', '..WP111PW', '...W2222W', '....232..', '.....22..'],
    lado: ['..KKKK.', '.K....K', 'KK.....', '.KKKKK.', '.KKKKKKK', '..KPWPWK', '..KPPPWK', '..K11PW.', '...22PW.', '...232..', '....22..'],
  },
};
/** Expressões: trocam as linhas do olho (a partir da 3) mantendo o tamanho. */
const EXPR = {
  fechados: { frente: ['........', '........', '........', '........', 'K......K', '.KKKKKK.'], lado: ['.......', '.......', '.......', '.......', 'K.....K', '.KKKKK.'] },
  dor: { frente: ['........', '........', 'KK......', '..KKK...', '.....KK.', '..KKK...', 'KK......'], lado: ['.......', '.......', 'KK.....', '..KKK..', '....KK.', '..KKK..', 'KK.....'] },
};
const BROW_FOCO = { frente: ['.KK.....', '...KKKK.', '......KK'], lado: ['KK.....', '.KKKK..', '....KK.'] };
const MOUTHS = {
  calma: { frente: ['a..a', '.bb.'], lado: ['ba'] },
  sorriso: { frente: ['a..a', '.bb.'], lado: ['ba'] },
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
  nuvem: ['..WWW....', '.WRRRWWW.', 'WRRRRRRRW', 'WRRRRRRRW', '.WWWWWWW.'],
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
  } else if (st.kind === 'capa') {
    rows = CAPE_EMBLEMS[st.emblem];
    colors = { R: pack(st.emblem === 'nuvem' ? rgbOf('#c8261e') : st.mat.rgb[2]), W: pack(rgbOf('#f4ead8')) };
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
function face(buf, scene, col, S, look, pose, part) {
  const { head, hx, hy, hz } = scene;
  const R = S.R.head, C = S.J.head;
  const fwd = apply(R, [0, 0, 1]);
  if (dot(fwd, VIEW) < -0.1) return;                                   // de costas
  const side = Math.abs(fwd[0]) > 0.62;                                 // de perfil
  const eyePal = PAL.olho[look.eyeColor] || PAL.olho.azul;
  const skin = PAL.pele[look.skin] || PAL.pele.claro;
  const colors = {
    K: 0x141022, W: 0xfcfcff, P: pack(rgbOf(eyePal[0])), 1: pack(rgbOf(eyePal[1])), 2: pack(rgbOf(eyePal[2])), 3: pack(rgbOf(eyePal[3])),
    a: pack(rgbOf(skin[8])), b: pack(rgbOf(skin[9])), t: pack(rgbOf(skin[7])),
  };
  const style = EYES[look.eyeStyle] || EYES.masculino;
  const view = side ? 'lado' : 'frente';
  let rows = style[view].slice();
  const e = EXPR[pose.eyes];
  if (e) rows = rows.map((r, j) => (j >= 3 ? (e[view][j - 3] ?? '.'.repeat(r.length)).padEnd(r.length, '.').slice(0, r.length) : r));
  if (pose.eyes === 'foco') rows = rows.map((r, j) => (j < 3 ? BROW_FOCO[view][j].padEnd(r.length, '.').slice(0, r.length) : j === 6 ? 'K'.repeat(r.length) : r));
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
  const ey = -hy * 0.42, ex = hx * 0.5;
  const mouth = (MOUTHS[pose.mouth] || MOUTHS.calma)[view];
  if (side) {
    // O olho de perto (o de longe some atrás do nariz); olhando para a direita, espelha o desenho.
    const toRight = fwd[0] > 0;
    const near = apply(R, [1, 0, 0])[2] > 0 ? 1 : -1;
    if (part === 'olhos') put(surf(near * ex * 0.92, ey), rows, toRight);
    else put(surf(near * hx * 0.12, -hy * 0.8), mouth, toRight);
  } else if (part === 'olhos') {
    put(surf(-ex, ey), rows, false);
    put(surf(ex, ey), rows, true);
  } else {
    put(surf(0, -hy * 0.8), mouth, false);
  }
}

/**
 * Contorno: por fora (o pixel vazio encostado no boneco pega a cor de contorno de quem está mais perto) e por dentro
 * (onde uma parte de outro grupo passa bem na frente). Devolve a profundidade de cada pixel (o contorno pega a do
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
        const thr = me.lineThr ?? 1.8;
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
