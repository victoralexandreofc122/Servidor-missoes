// Herói em pixel art desenhado à mão (proposta v28): pose parada de frente, 3 penteados.
//
// Quadro 64 x 96, personagem de ~48 x 72, pés na linha 88. Cada peça é uma forma em pixels (elipse ou polígono)
// numa camada (corpo, olhos, boca, cabelo, camisa, casaco, calca, acessorio, sapato). O sombreado é em faixas, com
// a luz de cima à esquerda: a borda de baixo/direita de cada peça ganha sombra e sombra profunda, a de cima/esquerda
// ganha luz. Peças da frente ganham um traço interno no tom mais escuro do próprio material onde encostam em outra
// peça (braço na frente do casaco, mecha na frente de mecha). Por fora, contorno de 1 px em azul-noite.
//
// Coordenadas contínuas: o pixel i tem centro em i + 0,5; o eixo do corpo é x = 32 (espelho: x -> 64 - x).

export const W = 64, H = 96, FOOT_Y = 88;
export const OUTLINE = '#14182b';

/** Rampas de 4 tons: luz, base, sombra, sombra profunda. */
export const PAL = {
  pele: ['#ffe4cc', '#f5c6a2', '#d99784', '#a5636e'],
  cabelo: ['#3e5c8a', '#1f2a44', '#10172b', '#10172b'],
  brilho: '#7fa3d1',
  casaco: ['#4fb3bf', '#1f7f8f', '#145561', '#0d3a44'],
  camisa: ['#9c3a50', '#7a2438', '#4d1424', '#330c19'],
  calca: ['#565b6e', '#3b3f50', '#292c3a', '#1b1d28'],
  sapato: ['#4d505e', '#33353f', '#23242c', '#16161d'],
  faixa: ['#4a3a4f', '#2e2433', '#201824', '#150f18'],
  olho: { K: '#14182b', P: '#14284f', D: '#2f6db5', L: '#6fb4e8', H: '#ffffff' },
  boca: '#8c3f45',
  blush: '#ec9a8f',
};

// ---------------------------------------------------------------- formas

const inside = (fn) => { const m = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fn(x + 0.5, y + 0.5)) m[y * W + x] = 1; return m; };
const ell = (cx, cy, rx, ry) => inside((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
function polyTest(pts) {
  return (x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
}
const poly = (pts) => inside(polyTest(pts));
const mir = (pts) => pts.map(([x, y]) => [64 - x, y]);
/** Metade esquerda, de cima para baixo pelo lado de fora; completa com o espelho. */
const sym = (half) => poly([...half, ...mir(half).reverse()]);
const or = (...ms) => { const r = new Uint8Array(W * H); for (const m of ms) for (let i = 0; i < r.length; i++) r[i] |= m[i]; return r; };
const minus = (a, b) => a.map((v, i) => (v && !b[i] ? 1 : 0));
const and = (a, b) => a.map((v, i) => (v && b[i] ? 1 : 0));
const rows = (y0, y1) => inside((x, y) => y >= y0 && y < y1);

/**
 * Peça: forma, camada, rampa e sombreado. shade: deslocamentos (em px) para testar se o vizinho sai da forma:
 * d = sombra profunda, s = sombra, l = luz. sep: traço interno onde a peça fica na frente de outra.
 * recv: recebe sombra projetada das peças da frente (de cima/esquerda).
 */
const part = (name, layer, mask, pal, o = {}) => ({ name, layer, mask, pal, group: o.group ?? name, shade: o.shade ?? {}, sep: o.sep ?? true, recv: o.recv ?? false, marks: o.marks ?? [], strokes: o.strokes ?? [] });

// ---------------------------------------------------------------- corpo, roupa (comum aos 3 penteados)

function bodyParts() {
  const P = [];
  // Capuz caído nas costas: aparece como gola grossa em volta do pescoço.
  P.push(part('capuz', 'casaco', or(ell(32, 50, 11.5, 4.6), sym([[32, 44.5], [24, 45.5], [21, 49]])), [PAL.casaco[1], PAL.casaco[2], PAL.casaco[3], PAL.casaco[3]],
    { shade: { l: [0, -2], s: [0, 2], d: [1, 1] }, group: 'capuz' }));

  // Pernas (calça larga presa na bota), com a fenda entre elas.
  const quadril = poly([[24, 63], [40, 63], [40.3, 71], [23.7, 71]]);
  const pernaE = poly([[23.7, 70], [31.4, 70], [31, 83], [24.5, 83]]);
  P.push(part('calca', 'calca', or(quadril, pernaE, poly(mir([[23.7, 70], [31.4, 70], [31, 83], [24.5, 83]])).map((v) => v)), PAL.calca,
    { shade: { l: [-2, -1], s: [2, 0], d: [1, 0] }, recv: true, marks: [[27, 75, 2], [28, 76, 2], [36, 74, 2], [37, 75, 2]] }));

  // Botas: cano com punho dobrado, bico para fora, sola escura.
  const botaE = [[24, 80], [31.4, 80], [31.4, 89], [21.2, 89], [21.6, 86.4], [23.6, 85.2]];
  P.push(part('bota', 'sapato', or(poly(botaE), poly(mir(botaE))), PAL.sapato,
    { shade: { l: [-1, -2], s: [2, 1], d: [0, 1] }, recv: true }));
  const punhoE = [[23.4, 79], [31.6, 79], [31.6, 81.4], [23.4, 81.4]];
  P.push(part('punho_bota', 'sapato', or(poly(punhoE), poly(mir(punhoE))), PAL.sapato,
    { shade: { l: [0, -1], s: [2, 0] }, group: 'punho_bota' }));

  // Pescoço e tronco (camisa vinho com gola alta), faixa na cintura.
  P.push(part('pescoco', 'corpo', poly([[28, 44], [36, 44], [36, 51], [28, 51]]), PAL.pele, { shade: { s: [2, 0] }, recv: true, group: 'pele' }));
  P.push(part('camisa', 'camisa', sym([[32, 47.6], [27.6, 47.6], [23, 50], [23.6, 64.5], [32, 64.5]]), PAL.camisa,
    { shade: { l: [-2, -1], s: [2, 1], d: [1, 1] }, recv: true, marks: [[30, 53, 2], [33, 57, 2]] }));
  P.push(part('gola', 'camisa', sym([[32, 46.6], [28.4, 46.6], [28.4, 49.4], [32, 50.2]]), PAL.camisa, { shade: { l: [0, -1], s: [0, 1] }, group: 'gola' }));
  P.push(part('faixa', 'acessorio', poly([[23.5, 62.6], [40.5, 62.6], [40.5, 65.4], [23.5, 65.4]]), PAL.faixa, { shade: { l: [0, -1], s: [0, 1] } }));
  P.push(part('no_faixa', 'acessorio', or(poly([[33, 62], [36, 62], [36, 66], [33, 66]]), poly([[33.6, 65], [35.6, 65], [36.6, 70.4], [34.2, 70.4]])), PAL.faixa,
    { shade: { l: [-1, -1], s: [1, 1] }, group: 'no' }));

  // Casaco: silhueta aberta na frente (V até a faixa, abre de novo embaixo), barra em duas pontas separadas.
  const fora = [[32, 47.4], [25, 47.4], [21.4, 49.6], [20.4, 53], [20.6, 64], [20, 70], [32, 70]];
  const abertura = poly([[27.8, 47], [36.2, 47], [34.4, 56], [33.6, 63], [36, 71], [28, 71], [30.4, 63], [29.6, 56]]);
  P.push(part('casaco', 'casaco', minus(sym(fora), abertura), PAL.casaco,
    { shade: { l: [-2, -2], s: [3, 1], d: [1, 1] }, recv: true,
      marks: [[23, 50, 3], [24, 51, 3], [25, 50, 2], [40, 50, 3], [39, 51, 3], [38, 50, 2], [26, 60, 2], [26, 61, 2], [37, 59, 2], [37, 60, 2]] }));
  // Lapelas: tira clara ao longo da abertura.
  const lapE = [[25.4, 47], [28, 47], [29.8, 56], [29, 59], [27, 52]];
  P.push(part('lapela_e', 'casaco', poly(lapE), PAL.casaco, { shade: { l: [-1, 0], s: [2, 1] }, group: 'lapela' }));
  P.push(part('lapela_d', 'casaco', poly(mir(lapE)), PAL.casaco, { shade: { l: [-1, 0], s: [1, 1], d: [1, 0] }, group: 'lapela' }));
  // Barra: duas abas soltas (cada uma vai balançar sozinha nas animações).
  const abaE = [[20.4, 65.6], [30.6, 65.6], [28.8, 73], [24.6, 73.6], [18.6, 75.2], [19.6, 70]];
  P.push(part('aba_e', 'casaco', poly(abaE), PAL.casaco, { shade: { l: [-2, -1], s: [3, 1], d: [1, 1] }, group: 'aba_e', marks: [[24, 69, 2], [24, 70, 2], [23, 71, 2]] }));
  P.push(part('aba_d', 'casaco', poly(mir(abaE)), PAL.casaco, { shade: { l: [-1, -1], s: [3, 1], d: [1, 1] }, group: 'aba_d', marks: [[39, 69, 2], [39, 70, 2], [40, 71, 3]] }));

  // Braços: mangas largas com punho dobrado e o punho fechado.
  const mangaE = [[22.6, 49], [25, 51.4], [24.8, 58], [24.2, 63.6], [17.2, 63.6], [17.6, 57], [19.4, 51]];
  P.push(part('manga_e', 'casaco', poly(mangaE), PAL.casaco, { shade: { l: [-2, -2], s: [2, 1], d: [1, 1] }, group: 'manga', marks: [[22, 56, 2], [21, 57, 2]] }));
  P.push(part('manga_d', 'casaco', poly(mir(mangaE)), PAL.casaco, { shade: { l: [-1, -2], s: [3, 1], d: [1, 1] }, group: 'manga', marks: [[42, 56, 3], [43, 57, 3]] }));
  const punhoMangaE = [[17.2, 62.6], [24.4, 62.6], [24.6, 66], [16.8, 66]];
  P.push(part('punho_e', 'casaco', poly(punhoMangaE), PAL.casaco, { shade: { l: [0, -1], s: [2, 1], d: [0, 1] }, group: 'punho' }));
  P.push(part('punho_d', 'casaco', poly(mir(punhoMangaE)), PAL.casaco, { shade: { l: [0, -1], s: [2, 1], d: [0, 1] }, group: 'punho' }));
  P.push(part('mao_e', 'corpo', ell(20.4, 68.2, 3.1, 2.9), PAL.pele, { shade: { l: [-1, -1], s: [2, 1], d: [1, 1] }, group: 'mao', recv: true }));
  P.push(part('mao_d', 'corpo', ell(43.6, 68.2, 3.1, 2.9), PAL.pele, { shade: { l: [-1, -1], s: [2, 1], d: [1, 1] }, group: 'mao', recv: true }));

  // Cabeça: crânio largo e queixo macio; orelhas.
  // Orelhas: ficam sob as mechas laterais na vista de frente (entram nas vistas de lado/3/4).
  if (false) P.push(part('orelha_e', 'corpo', ell(18.6, 39.5, 2.2, 3), PAL.pele, { shade: { l: [-1, -1], s: [1, 1] }, group: 'orelha' }));
  if (false) P.push(part('orelha_d', 'corpo', ell(45.4, 39.5, 2.2, 3), PAL.pele, { shade: { s: [1, 0], d: [1, 1] }, group: 'orelha' }));
  const cabeca = or(ell(32, 34.4, 13.6, 12.4), sym([[32, 37], [18.6, 37], [21.6, 43.4], [26.6, 47], [29.6, 48.2], [32, 48.2]]));
  P.push(part('cabeca', 'corpo', cabeca, PAL.pele, { shade: { l: [-3, -3], s: [2, 0], d: [1, 1] }, recv: true, group: 'pele' }));
  return P;
}

// ---------------------------------------------------------------- rosto (carimbos)

// Olho 5 x 6: K traço, P pupila, D íris escura, L íris clara, H brilho.
const OLHO = ['KKKKK', 'KHDPK', 'KDPPK', 'KLPLK', 'KLLLK', '.KKK.'];
export function faceStamps() {
  const px = [];
  const put = (layer, x, y, c) => px.push({ layer, x, y, c });
  for (const [ox, flip] of [[23, false], [36, true]]) {
    OLHO.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      // O brilho fica no canto de cima à esquerda nos dois olhos (a luz é uma só).
      put('olhos', ox + x, 36 + y, PAL.olho[ch]);
    }));
    void flip;
  }
  // Sobrancelhas de 1 px, levemente arqueadas.
  for (const [x, y] of [[23, 34], [24, 33], [25, 33], [26, 33], [37, 33], [38, 33], [39, 33], [40, 34]]) put('olhos', x, y, PAL.cabelo[2]);
  put('boca', 32, 43, PAL.pele[2]); // nariz: 1 px de sombra
  put('boca', 31, 45, PAL.boca); put('boca', 32, 45, PAL.boca); put('boca', 33, 45, PAL.pele[3]);
  for (const [x, y] of [[21, 43], [22, 43], [41, 43], [42, 43]]) put('boca', x, y, PAL.blush);
  return px;
}

// ---------------------------------------------------------------- cabelos

const HS = { l: [-1, -1], s: [2, 1], d: [1, 1] };
const lock = (name, pts, o = {}) => part(name, 'cabelo', poly(pts), PAL.cabelo, { shade: HS, group: 'cabelo', sep: false, ...o });
const fr = (name, pts, o = {}) => lock(name, pts, { group: 'franja', sep: true, shade: { l: [-1, -2], s: [2, 1], d: [1, 1] }, ...o });
const back = (ry = 14.6) => part('cabelo_tras', 'cabelo', or(ell(32, 31, 16.4, ry), sym([[32, 30], [15.6, 32], [16.4, 43.6], [19.4, 45.4], [20, 38]])), PAL.cabelo,
  { shade: { l: [-2, -2], s: [3, 1], d: [1, 1] }, group: 'cabelo', sep: false });
/** Calota: a massa do alto da cabeça, na frente do crânio, até a linha do cabelo. */
const cap = (strokes, cy = 31, ry = 13.6) => part('calota', 'cabelo', and(ell(32, cy, 16, ry), rows(0, 27.5)), PAL.cabelo,
  { shade: { l: [-3, -3], s: [3, 2], d: [1, 1] }, group: 'cabelo', sep: false, strokes });
const lados = () => [
  fr('lat_e', [[15.4, 27], [21.6, 27], [20.8, 36], [19.8, 45], [17.4, 39.6], [15.6, 35]], { shade: { l: [-2, -1], s: [2, 1], d: [1, 1] } }),
  fr('lat_d', [[48.6, 27], [42.4, 27], [43.2, 36], [44.8, 44.6], [46.8, 39], [48.4, 34]], { shade: { l: [-1, -1], s: [1, 1], d: [1, 0] } }),
];

/** Três propostas: { tras: peças atrás da cabeça, frente: peças na frente }. 5 a 7 mechas, franja e 2 laterais. */
export const HAIR = {
  // A: bagunçado como a referência: tufos em leque para os lados e para cima, franja em 4 pontas.
  A: () => ({
    tras: [back(),
      lock('m1', [[20, 30], [12.6, 27.6], [15.4, 25.4], [13.2, 20.4], [18.6, 21.4], [22, 25]]),
      lock('m2', [[19.4, 22], [20.4, 15.2], [25.8, 13.2], [24.8, 16.6], [31, 16.2], [30, 21]]),
      lock('m3', [[28, 18], [33.6, 12.2], [40.8, 11.8], [37.6, 14.6], [43, 17.4], [40, 22]]),
      lock('m4', [[40, 20], [47.6, 18.4], [52, 15.4], [50.4, 21.4], [52.8, 25], [46, 28]]),
      lock('m5', [[44, 27], [50.6, 30.4], [47, 33]])],
    frente: [cap([[2, [[34, 18], [27, 21], [22, 26]]], [2, [[34, 18], [31, 22], [28, 27]]], [2, [[35, 18], [39, 21], [42, 26]]], [2, [[36, 18], [36, 22], [35, 27]]]]),
      fr('f1', [[18.4, 25], [27.4, 25], [27, 30], [24.6, 36.6], [22.4, 32.4], [19.4, 33.4], [19.6, 29]]),
      fr('f2', [[24.6, 25], [34, 25], [33, 30.4], [30.6, 37.2], [28.4, 32]]),
      fr('f3', [[31, 25], [41, 25], [39.6, 30], [39.6, 36], [36.6, 31.6], [34.4, 33.6]]),
      fr('f4', [[38, 25], [45.8, 25.6], [45, 30], [45.6, 35], [42.4, 31.4]]),
      ...lados()],
  }),
  // B: franja longa varrida de lado (da esquerda para a direita), coroa mais lisa com 2 redemoinhos.
  B: () => ({
    tras: [back(14),
      lock('m1', [[17, 28], [12.4, 21.6], [20, 21.4]]),
      lock('m2', [[22, 21], [24.6, 12.6], [29, 18.6]]),
      lock('m3', [[29, 18], [35.4, 11.6], [37.4, 19]]),
      lock('m4', [[38, 19], [46.6, 15.6], [44.6, 24]]),
      lock('m5', [[44, 24], [51.6, 24.6], [47.4, 31]])],
    frente: [cap([[2, [[33, 18], [26, 22], [21, 27]]], [2, [[33, 18], [38, 22], [41, 27]]]], 30.6, 13.4),
      fr('f1', [[18.4, 25.6], [30, 23.6], [36.4, 25.4], [32, 29.4], [28.6, 34], [25.8, 37.8], [25.2, 31.6], [21.6, 34.2], [21.4, 29.8]]),
      fr('f2', [[30, 24], [42, 24.4], [43, 27], [38.6, 29.4], [35.4, 34.2], [34.6, 29.6]]),
      fr('f3', [[40, 25], [46, 26.4], [45, 31.6], [43, 35.2], [41.8, 29.8]]),
      ...lados()],
  }),
  // C: espetado para cima, 7 pontas na coroa, franja curta em 5 pontas retas.
  C: () => ({
    tras: [back(14),
      lock('m1', [[17, 29], [10.6, 22], [20, 23]]),
      lock('m2', [[18.6, 24], [15.6, 13.6], [25, 21]]),
      lock('m3', [[23, 21], [24.4, 9.6], [30, 19.6]]),
      lock('m4', [[28, 20], [32.6, 7.4], [36.6, 20]]),
      lock('m5', [[34, 20], [40.6, 9.6], [41.6, 21.6]]),
      lock('m6', [[39.4, 21.6], [48.6, 13.6], [46, 25]]),
      lock('m7', [[44.6, 25], [53.4, 22], [47.6, 30.6]])],
    frente: [cap([[2, [[32, 20], [25, 24], [22, 27]]], [2, [[32, 20], [31, 27]]], [2, [[33, 20], [40, 24], [42, 27]]]], 31.4, 13.2),
      fr('f1', [[18.4, 25.2], [26, 25], [25, 29], [23.4, 34.6], [20.6, 30]]),
      fr('f2', [[23, 25], [31, 25], [29.6, 30], [27.6, 35.6], [25.6, 30]]),
      fr('f3', [[28.4, 25], [36, 25], [34.4, 30], [32.4, 36.2], [30.6, 30]]),
      fr('f4', [[33.6, 25], [41, 25], [39.6, 30], [37.8, 35.4], [36, 30]]),
      fr('f5', [[38.6, 25], [45.8, 25.6], [44.6, 30], [43, 34.6], [41, 30]]),
      ...lados()],
  }),
};

// ---------------------------------------------------------------- montagem

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

/** Monta o boneco. Devolve { w, h, rgba, layers: { nome: rgba } }. */
export function renderHeroFront(hairKey = 'A') {
  const parts = [...bodyParts()];
  // O cabelo de trás vai antes da cabeça; mechas e franja, depois.
  const hair = HAIR[hairKey]();
  const head = parts.findIndex((p) => p.name === 'cabeca');
  parts.splice(head, 0, ...hair.tras);
  parts.push(...hair.frente);

  const col = new Array(W * H).fill(null);
  const own = new Int16Array(W * H).fill(-1);
  const tone = new Int8Array(W * H).fill(-1);
  const at = (m, x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x];

  parts.forEach((p, pi) => {
    const { l, s, d } = p.shade;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!p.mask[y * W + x]) continue;
      let t = 1;
      if (l && !at(p.mask, x + l[0], y + l[1])) t = 0;
      if (s && !at(p.mask, x + s[0], y + s[1])) t = 2;
      if (d && !at(p.mask, x + d[0], y + d[1])) t = 3;
      const i = y * W + x;
      col[i] = p.pal[t]; own[i] = pi; tone[i] = t;
    }
    for (const [x, y, t] of p.marks) { const i = y * W + x; if (own[i] === pi) { col[i] = p.pal[t]; tone[i] = t; } }
    // Traços (fios do cabelo, dobras): linha de pixels num tom, só sobre a própria peça.
    for (const [t, pts] of p.strokes) for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let q = 0; q <= n; q++) {
        const x = Math.round(x0 + ((x1 - x0) * q) / n), y = Math.round(y0 + ((y1 - y0) * q) / n), i = y * W + x;
        if (own[i] === pi) { col[i] = p.pal[t]; tone[i] = t; }
      }
    }
  });

  const grp = (i) => (own[i] < 0 ? null : parts[own[i]].group);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // Sombra projetada: a peça da frente (desenhada depois) faz sombra embaixo/à direita dela.
  const cast = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, pi = own[i];
    if (pi < 0 || !parts[pi].recv) continue;
    for (const [dx, dy] of [[0, -1], [-1, -1], [0, -2]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0) continue;
      const j = yy * W + xx;
      if (own[j] > pi && grp(j) !== parts[pi].group) { cast.push([i, Math.max(tone[i], 2)]); break; }
    }
  }
  for (const [i, t] of cast) { col[i] = parts[own[i]].pal[t]; tone[i] = t; }
  // Traço interno: a borda da peça da frente, onde encosta em peça de trás de outro grupo.
  const seps = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, pi = own[i];
    if (pi < 0 || !parts[pi].sep) continue;
    for (const [dx, dy] of N4) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (own[j] >= 0 && own[j] < pi && grp(j) !== parts[pi].group) { seps.push(i); break; }
    }
  }
  for (const i of seps) { col[i] = parts[own[i]].pal[3]; tone[i] = 3; }

  // Brilho do cabelo: arco de 2 px acompanhando a curva do alto da cabeça (só no tom de luz/base).
  const layerOf = new Array(W * H).fill(null);
  for (let i = 0; i < W * H; i++) if (own[i] >= 0) layerOf[i] = parts[own[i]].layer;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (layerOf[i] !== 'cabelo' || tone[i] > 1) continue;
    const dx = x + 0.5 - 31, dy = y + 0.5 - 31, r = Math.hypot(dx, dy), a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (r >= 11.2 && r < 13.2 && a > -150 && a < -62 && ((Math.floor(a / 9) & 3) !== 3)) col[i] = PAL.brilho;
  }

  // Rosto por cima da cabeça, só onde a pele aparece.
  for (const { layer, x, y, c } of faceStamps()) {
    const i = y * W + x;
    if (own[i] >= 0 && parts[own[i]].group === 'pele' && seps.indexOf(i) < 0) { col[i] = c; layerOf[i] = layer; }
  }

  // Contorno externo de 1 px (vizinho em cruz), herdando a camada da peça vizinha.
  const outl = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (col[i]) continue;
    for (const [dx, dy] of N4) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (col[yy * W + xx]) { outl.push([i, layerOf[yy * W + xx]]); break; }
    }
  }
  for (const [i, L] of outl) { col[i] = OUTLINE; layerOf[i] = L; }

  const rgba = new Uint8Array(W * H * 4);
  const layers = {};
  for (let i = 0; i < W * H; i++) {
    if (!col[i]) continue;
    const [r, g, b] = hex(col[i]);
    rgba.set([r, g, b, 255], i * 4);
    const L = layerOf[i];
    (layers[L] ??= new Uint8Array(W * H * 4)).set([r, g, b, 255], i * 4);
  }
  return { w: W, h: H, rgba, layers };
}
