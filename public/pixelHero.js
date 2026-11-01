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
const part = (name, layer, mask, pal, o = {}) => ({ name, layer, mask, pal, group: o.group ?? name, shade: o.shade ?? {}, sep: o.sep ?? true, recv: o.recv ?? false, marks: o.marks ?? [], strokes: o.strokes ?? [], subs: o.subs ?? [] });

// ---------------------------------------------------------------- corpo, roupa (comum aos 3 penteados)

function bodyParts() {
  const P = [];
  // Capuz caído nas costas: um rolo grosso e macio atrás do pescoço que sobe pelos lados até a altura do queixo,
  // com o forro escuro aparecendo atrás da nuca.
  const capuz = or(ell(32, 49.6, 10.6, 3.4), ell(25, 48.6, 4.2, 3), ell(39, 48.6, 4.2, 3));
  P.push(part('capuz', 'casaco', capuz, PAL.casaco, { shade: { l: [-1, -2], s: [2, 2], d: [1, 1] }, group: 'capuz', strokes: [[2, [[22, 47], [24, 49]]], [2, [[42, 47], [40, 49]]]] }));
  P.push(part('capuz_forro', 'casaco', ell(32, 47.8, 6.4, 2.6), [PAL.casaco[3], PAL.casaco[3], PAL.casaco[3], PAL.casaco[3]], { group: 'capuz', sep: false }));

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
  P.push(part('camisa', 'camisa', sym([[32, 47.6], [27.6, 47.6], [24, 50], [24.4, 64.5], [32, 64.5]]), PAL.camisa,
    { shade: { l: [-2, -1], s: [2, 1], d: [1, 1] }, recv: true, marks: [[30, 53, 2], [33, 57, 2]] }));
  P.push(part('gola', 'camisa', sym([[32, 46.6], [28.4, 46.6], [28.4, 49.4], [32, 50.2]]), PAL.camisa, { shade: { l: [0, -1], s: [0, 1] }, group: 'gola' }));
  P.push(part('faixa', 'acessorio', poly([[23.5, 62.6], [40.5, 62.6], [40.5, 65.4], [23.5, 65.4]]), PAL.faixa, { shade: { l: [0, -1], s: [0, 1] } }));
  P.push(part('no_faixa', 'acessorio', or(poly([[33, 62], [36, 62], [36, 66], [33, 66]]), poly([[33.6, 65], [35.6, 65], [36.6, 70.4], [34.2, 70.4]])), PAL.faixa,
    { shade: { l: [-1, -1], s: [1, 1] }, group: 'no' }));

  // Casaco: ombros redondos e caídos, aberto na frente (V até a faixa, abre de novo embaixo), barra em duas abas.
  // Tecido fosco: luz só no alto dos ombros e das mangas, sombra larga do lado direito.
  const fora = [[32, 47.4], [26.6, 47.4], [23.4, 48.4], [21.6, 50.6], [21.6, 55], [22.4, 62], [22, 70], [32, 70]];
  const abertura = poly([[27.6, 47], [36.4, 47], [34.4, 56], [33.6, 63], [36, 71], [28, 71], [30.4, 63], [29.6, 56]]);
  P.push(part('casaco', 'casaco', minus(sym(fora), abertura), PAL.casaco,
    { shade: { l: [-1, -3], s: [4, 0], d: [1, 1] }, recv: true }));
  // Lapelas: dobra do tecido ao longo da abertura, com o vinco escuro do lado de dentro.
  const lapE = [[25, 47.4], [27.8, 47], [29.8, 56], [29.2, 59], [26.8, 52]];
  P.push(part('lapela_e', 'casaco', poly(lapE), PAL.casaco, { shade: { l: [0, -2], d: [1, 0] }, group: 'casaco', sep: false }));
  P.push(part('lapela_d', 'casaco', poly(mir(lapE)), PAL.casaco, { shade: { s: [1, 0], d: [-1, 0] }, group: 'casaco', sep: false }));
  // Barra: duas abas soltas e um pouco abertas em sino (cada uma vai balançar sozinha nas animações).
  const abaE = [[22.4, 64.6], [30.6, 64.6], [30, 82.4], [23.4, 83.2], [15.6, 84.2], [18.6, 75]];
  P.push(part('aba_e', 'casaco', poly(abaE), PAL.casaco, { shade: { l: [-1, 0], s: [4, 0], d: [1, 1] }, group: 'casaco', sep: false }));
  P.push(part('aba_d', 'casaco', poly(mir(abaE)), PAL.casaco, { shade: { s: [4, 0], d: [1, 1] }, group: 'casaco', sep: false }));

  // Braços: mangas largas e fofas, com a dobra do cotovelo, punho dobrado e a mão fechada.
  const mangaE = [[22.6, 48.6], [25, 51], [24.6, 58], [24.2, 63.6], [18.6, 63.6], [18.6, 56.6], [20, 50.6]];
  P.push(part('manga_e', 'casaco', poly(mangaE), PAL.casaco, { shade: { l: [-1, -2], s: [3, 1], d: [1, 1] }, group: 'manga' }));
  P.push(part('manga_d', 'casaco', poly(mir(mangaE)), PAL.casaco, { shade: { l: [0, -2], s: [4, 1], d: [1, 1] }, group: 'manga' }));
  const punhoMangaE = [[18.4, 62.6], [24.4, 62.6], [24.6, 66], [18, 66]];
  P.push(part('punho_e', 'casaco', poly(punhoMangaE), PAL.casaco, { shade: { l: [0, -1], s: [2, 1], d: [0, 1] }, group: 'punho' }));
  P.push(part('punho_d', 'casaco', poly(mir(punhoMangaE)), PAL.casaco, { shade: { l: [0, -1], s: [2, 1], d: [0, 1] }, group: 'punho' }));
  P.push(part('mao_e', 'corpo', ell(21.2, 68.2, 2.9, 2.8), PAL.pele, { shade: { l: [-1, -1], s: [2, 1], d: [1, 1] }, group: 'mao', recv: true }));
  P.push(part('mao_d', 'corpo', ell(42.8, 68.2, 2.9, 2.8), PAL.pele, { shade: { l: [-1, -1], s: [2, 1], d: [1, 1] }, group: 'mao', recv: true }));

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

// O cabelo é UMA massa só na frente (topo, tufos, franja e laterais juntos), sombreada de uma vez: assim não há
// borda de "capacete" entre a calota e a franja. As mechas aparecem pelos fios (traços de sombra que saem do
// redemoinho e descem até o vão entre as pontas) e pelas pontas da silhueta e da franja.
const FIO = '#161f38';
const back = (ry = 14.6) => part('cabelo_tras', 'cabelo', or(ell(32, 31, 16.4, ry), sym([[32, 30], [15.6, 32], [16.4, 43.6], [19.4, 45.4], [20, 38]])), PAL.cabelo,
  { shade: { l: [-2, -2], s: [3, 1], d: [1, 1] }, group: 'cabelo', sep: false });
function hairFront({ dome = [32, 30.6, 16.6, 14.2], tufts, fringe, sides, strands, lights = [], crown = CROWN }) {
  const mask = or(and(ell(...dome), rows(0, 27)), ...tufts.map(poly), poly(fringe), ...sides.map(poly));
  const subs = [...tufts, ...crown, ...sides].map(poly);
  return part('cabelo', 'cabelo', mask, PAL.cabelo, {
    shade: { l: [-2, -3], s: [3, 2], d: [1, 1] }, group: 'cabelo', sep: true,
    strokes: [...strands.map((pts) => [FIO, pts]), ...lights.map((pts) => [0, pts])], subs,
  });
}
// Laterais: 2 mechas de cada lado, a de fora mais comprida, pontas virando para fora.
const SIDES = [
  [[14.6, 26], [19.4, 27], [19, 36], [16.6, 45], [14.2, 38.4], [14.4, 31]],
  [[18, 27], [22, 27], [21.6, 34], [20.2, 42.4], [18.4, 36]],
  [[49.4, 26], [44.6, 27], [45, 36], [47.4, 44.4], [49.8, 38], [49.6, 31]],
  [[46, 27], [42, 27], [42.4, 34], [43.8, 41.6], [45.6, 36]],
];
// Mechas do topo, uma por cima da outra, saindo do redemoinho (à direita do centro).
const CROWN = [
  [[19, 25], [22, 18.4], [28, 15.4], [26.4, 20], [24, 26]],
  [[25, 26], [27.4, 18.6], [33.4, 14.6], [32.6, 20.4], [30.6, 27]],
  [[31.4, 27], [33, 19.4], [37.6, 15.4], [40.2, 19.6], [37.6, 27]],
  [[37.6, 26.4], [40.4, 19.6], [45, 18.6], [45.6, 23.6], [43, 27.6]],
];
const SIDE_STRANDS = [];

/** Três propostas: { tras: atrás da cabeça, frente: na frente }. */
export const HAIR = {
  // A: como a referência: volume redondo, pontas macias varridas para a direita, franja em mechas até os olhos
  // com uma mecha comprida entre eles, laterais até o queixo.
  A: () => ({
    tras: [back()],
    frente: [hairFront({
      tufts: [
        [[17, 27], [12.2, 25.6], [14.6, 23.8], [12.6, 20.4], [17.4, 21], [19, 18], [22, 22]],
        [[19, 22], [19.6, 15.6], [23, 16.2], [24.4, 12.4], [28, 15.4], [31, 14], [31, 20]],
        [[30, 17], [35, 11.2], [37.4, 14], [42.6, 12.6], [44, 18], [40, 21]],
        [[42, 19], [48.6, 17.4], [51.8, 14.6], [51, 20], [53.2, 23.6], [48, 26.4]],
      ],
      fringe: [[16.6, 24], [47.4, 24], [47.6, 29], [45.6, 33.8], [43.8, 30.4], [41.4, 35.4], [39.2, 30.8], [35.4, 36.2], [34.4, 31.2], [32.2, 39],
        [30.4, 31.4], [28.2, 35.8], [26, 30.6], [23.4, 35.6], [21.8, 30.6], [19.6, 33], [17.4, 29]],
      sides: SIDES,
      strands: [[[33, 17], [26, 22], [21.8, 30]], [[33, 17], [28, 23], [26, 30]], [[34, 18], [31, 25], [30.4, 31]], [[35, 18], [35, 25], [34.4, 31]],
        [[36, 18], [38.6, 24], [39.2, 30]], [[37, 17], [42, 22], [43.8, 30]], [[30, 16], [24, 18], [19, 23]], [[38, 16], [44, 17], [49, 21]], ...SIDE_STRANDS],
      lights: [[[22, 26], [21, 28]], [[27, 26], [26, 28]], [[32, 27], [32, 30]], [[37, 26], [37, 28]]],
    })],
  }),
  // B: mais solto e comprido: franja varrida para a esquerda em 3 mechas largas, topo redondo com 2 redemoinhos.
  B: () => ({
    tras: [back(14.6)],
    frente: [hairFront({
      dome: [32, 30.4, 16.8, 14],
      tufts: [
        [[18, 27], [11.6, 27.4], [14, 24.6], [12, 21.6], [18, 22]],
        [[20, 21], [21.4, 15], [26.4, 13.6], [25.6, 16.4], [30, 18]],
        [[29, 18], [32.6, 12.8], [38.6, 13.2], [36.6, 15.4], [42.6, 17.6], [44, 22]],
        [[43, 21], [49.6, 20.4], [52, 24.8], [48.6, 27.6]],
      ],
      fringe: [[16.6, 24], [47.4, 24], [47.4, 30], [45.8, 34], [44.6, 30.6], [40.6, 33.6], [38.6, 30.6], [33.6, 35.6], [31.6, 31.4], [26.6, 37.4],
        [26.6, 31.6], [22.4, 35.4], [21.6, 31], [18.8, 33.4], [17.4, 29]],
      sides: SIDES,
      strands: [[[38, 17], [33, 22], [26.6, 31.6]], [[39, 18], [36, 24], [31.6, 31.4]], [[40, 18], [40, 24], [38.6, 30.6]], [[41, 19], [44, 24], [44.6, 30.6]],
        [[37, 17], [29, 20], [21.6, 31]], [[30, 16], [24, 18], [18, 24]], ...SIDE_STRANDS],
      lights: [[[24, 26], [23, 28]], [[30, 25], [28, 28]], [[36, 26], [35, 28]], [[42, 26], [42, 28]]],
    })],
  }),
  // C: espetado: pontas mais altas e finas no alto, franja mais curta em 5 mechas.
  C: () => ({
    tras: [back(14)],
    frente: [hairFront({
      dome: [32, 31, 16.4, 13.8],
      tufts: [
        [[17, 28], [11, 23.4], [16, 23.6], [14.4, 17.4], [21, 21]],
        [[20, 21], [20.4, 12.6], [25, 17], [26.6, 9.6], [30, 17]],
        [[29, 18], [33.4, 8.4], [36, 15.4], [40.6, 10.6], [41, 19]],
        [[40, 20], [47.6, 14.4], [47, 19], [53, 20.6], [47.6, 27]],
      ],
      fringe: [[16.6, 24], [47.4, 24], [47.4, 29], [45.4, 33.4], [43, 30], [40.4, 34.6], [38.4, 30], [35.2, 35.2], [33.4, 30.4], [30.6, 36],
        [29, 30.4], [26.2, 34.6], [24.6, 30], [21.8, 34], [20.8, 30], [18.8, 32.4], [17.4, 29]],
      sides: SIDES,
      strands: [[[33, 18], [25, 23], [20.8, 30]], [[33, 18], [27, 24], [24.6, 30]], [[33, 18], [30, 25], [29, 30.4]], [[34, 18], [34, 25], [33.4, 30.4]],
        [[35, 18], [38, 24], [38.4, 30]], [[36, 18], [42, 23], [43, 30]], [[31, 17], [24, 14.6]], [[35, 17], [40, 12.6]], ...SIDE_STRANDS],
      lights: [[[23, 26], [22, 28]], [[28, 26], [27, 28]], [[36, 26], [36, 28]], [[41, 26], [41, 28]]],
    })],
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
    // Sub-mechas: cada uma ganha luz em cima/esquerda e sombra embaixo/direita dentro da massa, sem traço escuro.
    for (const sm of p.subs) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!sm[i] || own[i] !== pi || tone[i] === 3) continue;
      let t = -1;
      if (!at(sm, x - 1, y - 1)) t = 0;
      if (!at(sm, x + 2, y + 1) || !at(sm, x + 1, y + 2)) t = 2;
      if (t >= 0) { col[i] = p.pal[t]; tone[i] = t; }
    }
    // Traços (fios do cabelo, dobras): linha de pixels num tom, só sobre a própria peça.
    for (const [t, pts] of p.strokes) for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let q = 0; q <= n; q++) {
        const x = Math.round(x0 + ((x1 - x0) * q) / n), y = Math.round(y0 + ((y1 - y0) * q) / n), i = y * W + x;
        if (own[i] === pi) { col[i] = typeof t === 'string' ? t : p.pal[t]; tone[i] = typeof t === 'string' ? 2 : t; }
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
    if (r >= 11.6 && r < 12.8 && a > -140 && a < -70 && ((Math.floor(a / 7) % 3) !== 2)) col[i] = PAL.brilho;
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
