import { solve, basePose, poseOf, YAW_OF_DIR } from './rig.js';

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
const part = (name, layer, mask, pal, o = {}) => ({ name, layer, mask, pal, group: o.group ?? name, shade: o.shade ?? {}, sep: o.sep ?? true, recv: o.recv ?? false, marks: o.marks ?? [], strokes: o.strokes ?? [], subs: o.subs ?? [], sepTone: o.sepTone, subLight: o.subLight, shadeAlso: o.shadeAlso ?? [] });


/**
 * Pernas e botas de frente ou de costas, uma peça por lado (para animar), mas sombreadas como um conjunto
 * (shadeAlso), para a pose neutra sair idêntica à V28.
 */
function legsFB(botaE, botaD, knees) {
  const P = [];
  const quadril = poly([[24, 63], [40, 63], [40.3, 71], [23.7, 71]]);
  const half = (x0, x1) => inside((x) => x >= x0 && x < x1);
  const pernas = or(quadril, poly([[23.7, 70], [31.9, 70], [31.6, 83], [24.5, 83]]), poly([[33, 70], [40.3, 70], [39.5, 83], [33, 83]]));
  const sh = { l: [-3, 0], s: [1, 0], d: [1, 1] };
  P.push(part('perna_e', 'calca', and(pernas, half(0, 32)), PAL.calca, { shade: sh, recv: true, group: 'calca', shadeAlso: ['perna_d'], marks: knees ? knees[0] : [] }));
  P.push(part('perna_d', 'calca', and(pernas, half(32, 64)), PAL.calca, { shade: sh, recv: true, group: 'calca', shadeAlso: ['perna_e'], marks: knees ? knees[1] : [] }));
  const SOLA = ['#7a6a6c', '#5a4c4f', '#5a4c4f', '#3a3033'];
  for (const [k, b, pu, o] of [['e', botaE, [[23.4, 79], [31.9, 79], [31.9, 81.4], [23.4, 81.4]], 'd'], ['d', botaD, [[33, 79], [40.6, 79], [40.6, 81.4], [33, 81.4]], 'e']]) {
    P.push(part(`bota_${k}`, 'sapato', poly(b), PAL.sapato, { shade: { l: [-2, -1], s: [2, 0], d: [1, 0] }, recv: true, group: 'bota', shadeAlso: [`bota_${o}`] }));
    P.push(part(`sola_${k}`, 'sapato', and(poly(b), rows(87.6, 90)), SOLA, { shade: { l: [-1, 0] }, group: 'sola', sep: false, shadeAlso: [`sola_${o}`] }));
  }
  for (const [k, pu, o] of [['e', [[23.4, 79], [31.9, 79], [31.9, 81.4], [23.4, 81.4]], 'd'], ['d', [[33, 79], [40.6, 79], [40.6, 81.4], [33, 81.4]], 'e']]) {
    P.push(part(`punho_bota_${k}`, 'sapato', poly(pu), PAL.sapato, { shade: { l: [-2, -1], s: [1, 0], d: [0, 1] }, group: 'punho_bota', shadeAlso: [`punho_bota_${o}`] }));
  }
  return P;
}

// ---------------------------------------------------------------- corpo, roupa (comum aos 3 penteados)

function bodyParts() {
  const P = [];
  // Capuz caído nas costas: um rolo grosso e macio atrás do pescoço que sobe pelos lados até a altura do queixo,
  // com o forro escuro aparecendo atrás da nuca.
  const capuz = or(ell(32, 49.6, 10.6, 3.4), ell(25, 48.6, 4.2, 3), ell(39, 48.6, 4.2, 3));
  P.push(part('capuz', 'casaco', capuz, PAL.casaco, { shade: { l: [-1, -2], s: [2, 2], d: [1, 1] }, group: 'capuz', strokes: [[2, [[22, 47], [24, 49]]], [2, [[42, 47], [40, 49]]]] }));
  P.push(part('capuz_forro', 'casaco', ell(32, 47.8, 6.4, 2.6), [PAL.casaco[3], PAL.casaco[3], PAL.casaco[3], PAL.casaco[3]], { group: 'capuz', sep: false }));

  // Pernas (calça larga presa na bota) e botas (cano com punho, bico para fora, a direita um pouco diferente).
  P.push(...legsFB([[24, 80], [31.9, 80], [31.9, 89], [21.2, 89], [21.6, 86.4], [23.6, 85.2]], [[33, 80], [40, 80], [40.6, 85.4], [42.4, 86.6], [43, 89], [33, 89]],
    [[[26, 75, 0], [27, 75, 0], [27, 76, 0], [28, 77, 2], [29, 77, 2]], [[35, 75, 0], [36, 75, 0], [36, 76, 0], [37, 77, 2], [38, 77, 2]]]));

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
  const abertura = poly([[27.6, 47], [36.4, 47], [34.4, 56], [33.6, 63], [34.4, 71], [29.6, 71], [30.4, 63], [29.6, 56]]);
  P.push(part('casaco', 'casaco', minus(sym(fora), abertura), PAL.casaco,
    { shade: { l: [-1, -3], s: [2, 0], d: [1, 1] }, recv: true }));
  // Lapelas: dobra do tecido ao longo da abertura, com o vinco escuro do lado de dentro.
  const lapE = [[25, 47.4], [27.8, 47], [29.8, 56], [29.2, 59], [26.8, 52]];
  P.push(part('lapela_e', 'casaco', poly(lapE), PAL.casaco, { shade: { l: [0, -2], d: [1, 0] }, group: 'casaco', sep: false }));
  P.push(part('lapela_d', 'casaco', poly(mir(lapE)), PAL.casaco, { shade: { s: [1, 0], d: [-1, 0] }, group: 'casaco', sep: false }));
  // Barra: duas abas soltas e um pouco abertas em sino (cada uma vai balançar sozinha nas animações).
  const abaE = [[22.4, 64.6], [30.6, 64.6], [29.6, 70], [28, 76], [26, 82.6], [21, 83.4], [15.6, 84.2], [18.6, 75]];
  P.push(part('aba_e', 'casaco', poly(abaE), PAL.casaco, { shade: { l: [-1, 0], s: [2, 0], d: [1, 1] }, group: 'casaco', sep: false }));
  P.push(part('aba_d', 'casaco', poly(mir(abaE)), PAL.casaco, { shade: { l: [-1, 0], s: [2, 0], d: [1, 1] }, group: 'casaco', sep: false }));

  // Braços: mangas largas e fofas, com a dobra do cotovelo, punho dobrado e a mão fechada.
  const mangaE = [[22.6, 48.2], [25.2, 50.4], [24.6, 57], [24.8, 63.6], [17.8, 63.6], [18.6, 56.6], [19.4, 50.4]];
  P.push(part('manga_e', 'casaco', poly(mangaE), PAL.casaco, { shade: { l: [-1, -2], s: [2, 1], d: [1, 1] }, group: 'manga', strokes: [[2, [[19, 55], [21, 57]]], [2, [[22, 58], [23, 60]]]] }));
  P.push(part('manga_d', 'casaco', poly(mir(mangaE)), PAL.casaco, { shade: { l: [-1, -2], s: [2, 1], d: [1, 1] }, group: 'manga', strokes: [[2, [[44, 55], [42, 57]]], [2, [[41, 58], [40, 60]]]] }));
  const punhoMangaE = [[17.8, 62.6], [25, 62.6], [25.4, 66], [17.4, 66]];
  P.push(part('punho_e', 'casaco', poly(punhoMangaE), PAL.casaco, { shade: { l: [0, -1], s: [2, 1], d: [0, 1] }, group: 'punho' }));
  P.push(part('punho_d', 'casaco', poly(mir(punhoMangaE)), PAL.casaco, { shade: { l: [0, -1], s: [2, 1], d: [0, 1] }, group: 'punho' }));
  P.push(part('mao_e', 'corpo', ell(21.3, 68.4, 3.1, 3), PAL.pele, { shade: { l: [-1, -1], s: [2, 1], d: [1, 1] }, group: 'mao', recv: true, marks: [[22, 67, 0]] }));
  P.push(part('mao_d', 'corpo', ell(42.7, 68.4, 3.1, 3), PAL.pele, { shade: { l: [-1, -1], s: [2, 1], d: [1, 1] }, group: 'mao', recv: true, marks: [[41, 67, 0]] }));

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
  put('boca', 32, 43, PAL.pele[2]); put('boca', 31, 42, PAL.pele[0]); // nariz: sombra embaixo/direita e luz em cima
  put('boca', 30, 44, PAL.boca); put('boca', 31, 45, PAL.boca); put('boca', 32, 45, PAL.boca); put('boca', 33, 44, PAL.boca); put('boca', 31, 46, PAL.pele[2]); put('boca', 32, 46, PAL.pele[2]);
  for (const [x, y] of [[21, 43], [22, 43], [41, 43], [42, 43]]) put('boca', x, y, PAL.blush);
  return px;
}

// ---------------------------------------------------------------- cabelos

// O cabelo é UMA massa só na frente (topo, tufos, franja e laterais juntos), sombreada de uma vez: assim não há
// borda de "capacete" entre a calota e a franja. As mechas aparecem pelos fios (traços de sombra que saem do
// redemoinho e descem até o vão entre as pontas) e pelas pontas da silhueta e da franja.
const FIO = '#161f38';
const back = (ry = 14.6) => part('cabelo_tras', 'cabelo', or(ell(32, 31, 16.4, ry), sym([[32, 30], [15.6, 32], [16.4, 43.6], [19.4, 45.4], [20, 38]])),
  [PAL.cabelo[1], PAL.cabelo[2], PAL.cabelo[2], PAL.cabelo[2]],
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
        [[35, 18], [38, 24], [38.4, 30]], [[36, 18], [42, 23], [43, 30]], ...SIDE_STRANDS],
      lights: [[[23, 26], [22, 28]], [[28, 26], [27, 28]], [[36, 26], [36, 28]], [[41, 26], [41, 28]]],
    })],
  }),
};

// ---------------------------------------------------------------- costas e lado (cabelo C, referência V28)
//
// Regras da ficha (docs/ficha-tecnica-heroi.md): mesma escala, mesmas rampas, mesma luz (de cima à esquerda da TELA
// em toda vista), mesmos pés na linha 88. As 4 pontas do topo do cabelo C são silhueta permanente: aparecem nas 4
// vistas (espelhadas de costas, porque a cabeça é vista do outro lado). Franja só existe de frente e de lado.

const C_TUFTS = [
  [[17, 28], [11, 23.4], [16, 23.6], [14.4, 17.4], [21, 21]],
  [[20, 21], [20.4, 12.6], [25, 17], [26.6, 9.6], [30, 17]],
  [[29, 18], [33.4, 8.4], [36, 15.4], [40.6, 10.6], [41, 19]],
  [[40, 20], [47.6, 14.4], [47, 19], [53, 20.6], [47.6, 27]],
];
const pal4 = (c) => [c, c, c, c];
const darker = (pal) => [pal[1], pal[2], pal[2], pal[3]];

/** Pernas, botas e solas: de frente/costas (lado a lado) ou de lado (uma atrás da outra). */
function legsAndBoots(view) {
  const P = [];
  if (view === 'costas') return legsFB([[24, 80], [31.9, 80], [31.9, 89], [23.2, 89], [23.2, 85]], [[33, 80], [40.4, 80], [41, 89], [33, 89]]);
  // De lado (virado para a direita): a perna de trás é um tom mais escura, a da frente fica um pouco adiante.
  P.push(part('perna_t', 'calca', poly([[24.6, 66], [30.6, 66], [30.4, 83], [25.4, 83]]), darker(PAL.calca), { shade: { s: [1, 0] }, group: 'perna_tras' }));
  const bT = [[25, 80], [31, 80], [31, 85.4], [34.4, 86.2], [34.8, 89], [24.6, 89]];
  P.push(part('bota_t', 'sapato', poly(bT), darker(PAL.sapato), { shade: { s: [1, 0], d: [0, 1] }, group: 'perna_tras' }));
  P.push(part('sola_t', 'sapato', and(poly(bT), rows(87.6, 90)), pal4('#4a3e41'), { group: 'perna_tras', sep: false }));
  P.push(part('quadril', 'calca', poly([[27, 63], [37.4, 63], [37.6, 71], [27, 71]]), PAL.calca, { shade: { l: [-3, 0], s: [1, 0], d: [1, 1] }, recv: true, group: 'calca', shadeAlso: ['perna_f'] }));
  P.push(part('perna_f', 'calca', poly([[31, 70], [37.6, 70], [37.2, 83], [31.4, 83]]), PAL.calca,
    { shade: { l: [-3, 0], s: [1, 0], d: [1, 1] }, recv: true, group: 'calca', shadeAlso: ['quadril'], marks: [[33, 75, 0], [34, 75, 0], [35, 76, 2], [36, 76, 2]] }));
  const bF = [[31.4, 80], [37.8, 80], [38, 85], [42.4, 85.8], [43, 89], [31.2, 89]];
  P.push(part('bota_f', 'sapato', poly(bF), PAL.sapato, { shade: { l: [-2, -1], s: [2, 0], d: [1, 0] }, recv: true, group: 'bota' }));
  P.push(part('sola_f', 'sapato', and(poly(bF), rows(87.6, 90)), ['#7a6a6c', '#5a4c4f', '#5a4c4f', '#3a3033'], { shade: { l: [-1, 0] }, group: 'sola', sep: false }));
  P.push(part('punho_bota_f', 'sapato', poly([[31, 79], [38.2, 79], [38.2, 81.4], [31, 81.4]]), PAL.sapato, { shade: { l: [-2, -1], s: [1, 0], d: [0, 1] }, group: 'punho_bota' }));
  return P;
}

/** Costas: casaco fechado com a fenda atrás, capuz caído sobre as costas, cabelo inteiro cobrindo a cabeça. */
function backParts() {
  const P = legsAndBoots('costas');
  P.push(part('pescoco', 'corpo', poly([[28.6, 44], [35.4, 44], [35.4, 50], [28.6, 50]]), darker(PAL.pele), { shade: { s: [2, 0] }, recv: true, group: 'pele' }));
  // Casaco de costas: a mesma silhueta da frente (ombros, corpo, barra em sino), inteiro, com a fenda no meio da barra.
  const fora = [[32, 47.4], [26.6, 47.4], [23.4, 48.4], [21.6, 50.6], [21.6, 55], [22.4, 62], [22, 70], [32, 70]];
  const abaE = [[22.4, 64.6], [32, 64.6], [32, 84], [21, 83.4], [15.6, 84.2], [18.6, 75]];
  const corpo = or(sym(fora), poly(abaE), poly(mir(abaE)));
  const fenda = poly([[31.8, 76], [32.2, 76], [33.6, 84.6], [30.4, 84.6]]);
  const inteiro = minus(corpo, fenda), sh = { l: [-1, -3], s: [2, 0], d: [1, 1] };
  const baixo = rows(66, 96), esq = inside((x) => x < 32);
  P.push(part('casaco', 'casaco', minus(inteiro, baixo), PAL.casaco, { shade: sh, recv: true, shadeAlso: ['aba_e', 'aba_d'] }));
  P.push(part('aba_e', 'casaco', and(and(inteiro, baixo), esq), PAL.casaco, { shade: sh, recv: true, group: 'casaco', shadeAlso: ['casaco', 'aba_d'],
    strokes: [[2, [[26, 66], [25, 75]]]] }));
  P.push(part('aba_d', 'casaco', minus(and(inteiro, baixo), esq), PAL.casaco, { shade: sh, recv: true, group: 'casaco', shadeAlso: ['casaco', 'aba_e'],
    strokes: [[2, [[32, 66], [32, 75]]], [2, [[38, 67], [39, 76]]]] }));
  const mangaE = [[22.6, 48.2], [25.2, 50.4], [24.6, 57], [24.8, 63.6], [17.8, 63.6], [18.6, 56.6], [19.4, 50.4]];
  P.push(part('manga_e', 'casaco', poly(mangaE), PAL.casaco, { shade: { l: [-1, -2], s: [2, 1], d: [1, 1] }, group: 'manga', strokes: [[2, [[19, 55], [21, 57]]]] }));
  P.push(part('manga_d', 'casaco', poly(mir(mangaE)), PAL.casaco, { shade: { l: [-1, -2], s: [2, 1], d: [1, 1] }, group: 'manga', strokes: [[2, [[44, 55], [42, 57]]]] }));
  const punho = [[17.8, 62.6], [25, 62.6], [25.4, 66], [17.4, 66]];
  P.push(part('punho_e', 'casaco', poly(punho), PAL.casaco, { shade: { l: [0, -1], s: [2, 1], d: [0, 1] }, group: 'punho' }));
  P.push(part('punho_d', 'casaco', poly(mir(punho)), PAL.casaco, { shade: { l: [0, -1], s: [2, 1], d: [0, 1] }, group: 'punho' }));
  P.push(part('mao_e', 'corpo', ell(21.3, 68.4, 3.1, 3), PAL.pele, { shade: { l: [-1, -1], s: [2, 1], d: [1, 1] }, group: 'mao', recv: true }));
  P.push(part('mao_d', 'corpo', ell(42.7, 68.4, 3.1, 3), PAL.pele, { shade: { l: [-1, -1], s: [2, 1], d: [1, 1] }, group: 'mao', recv: true }));
  // Capuz caído: um saco de pano pendurado da gola até o meio das costas, com a boca (forro escuro) para cima.
  // V29: tecido de fora em gota com a ponta embaixo, forro escuro na boca do capuz, gola do casaco por cima e 2 dobras.
  const capuz = sym([[32, 46], [25.4, 46.6], [23.2, 49.4], [24, 54], [26.6, 58], [30, 61.4], [32, 62.6]]);
  P.push(part('capuz', 'casaco', capuz, PAL.casaco, { shade: { l: [-2, -2], s: [2, 1], d: [1, 1] }, group: 'capuz',
    strokes: [[2, [[27, 52], [28, 55], [31, 59]]], [0, [[26, 52], [27, 55]]], [2, [[37, 52], [36, 55], [34, 58]]]] }));
  P.push(part('capuz_forro', 'casaco', and(ell(32, 49, 6.2, 3), rows(46, 53)), [PAL.casaco[2], PAL.casaco[3], PAL.casaco[3], PAL.casaco[3]],
    { shade: { l: [0, -1] }, group: 'capuz', sep: false }));
  P.push(part('gola_casaco', 'casaco', sym([[32, 44.8], [27, 45], [24.4, 46.4], [25, 48.4], [28.4, 47.8], [32, 47.8]]), PAL.casaco,
    { shade: { l: [0, -1], s: [0, 1] }, group: 'gola_casaco' }));
  // Cabelo inteiro: cúpula até a nuca, as 4 pontas do topo (espelhadas) e a nuca em mechas que descem.
  const tufts = C_TUFTS.map(mir);
  const nuca = [[15.6, 28], [48.4, 28], [48.6, 37], [46.6, 43.6], [44.4, 39.6], [41.6, 45.4], [38.8, 40.6], [35.6, 46.4], [33, 41.4], [30, 46.4],
    [27.4, 40.8], [24.2, 45.6], [21.6, 40], [19, 44], [16, 37]];
  // Mechas da nuca: cada uma sai do redemoinho em ponta e desce até a ponta de baixo (sem borda reta no meio).
  const cols = [[[18, 27], [21.6, 33], [21.6, 40], [19, 44], [16, 37]], [[22, 26], [27.4, 32], [27.4, 40.8], [24.2, 45.6], [21.6, 40], [21.6, 32]],
    [[28, 25], [33, 31], [33, 41.4], [30, 46.4], [27.4, 40.8], [27.4, 31]], [[33.4, 25], [38.8, 31], [38.8, 40.6], [35.6, 46.4], [33, 41.4], [33, 31]],
    [[39, 26], [44.4, 32], [44.4, 39.6], [41.6, 45.4], [38.8, 40.6], [38.8, 32]], [[45, 27], [48.4, 33], [48.6, 37], [46.6, 43.6], [44.4, 39.6], [44.4, 33]]];
  const crown = CROWN.map(mir);
  P.push(part('cabelo', 'cabelo', or(ell(32, 31, 16.4, 13.8), ...tufts.map(poly), poly(nuca)), PAL.cabelo, {
    shade: { l: [-2, -3], s: [3, 2], d: [1, 1] }, group: 'cabelo', sep: true,
    subs: [...tufts, ...crown, ...cols].map(poly), subLight: 'nuca',
    strokes: [[FIO, [[31, 18], [24, 26], [21.6, 33]]], [FIO, [[31, 18], [28, 27], [27.4, 34]]], [FIO, [[31, 18], [33, 34]]], [FIO, [[32, 18], [37, 26], [38.8, 33]]], [FIO, [[33, 18], [42, 26], [44.4, 33]]]],
  }));
  return P;
}

/** Lado direito (perfil): cabeça de perfil com orelha, cabelo com as mesmas 4 pontas, casaco aberto na frente. */
function sideParts(bracoAtras = false) {
  const P = [];
  // Capuz atrás do pescoço (nas costas do perfil) e a perna/bota de trás.
  P.push(part('capuz', 'casaco', or(ell(25.4, 49.4, 5.4, 4), poly([[21.6, 47], [28, 46.4], [29, 52], [26, 57], [22, 54.6]])), PAL.casaco,
    { shade: { l: [-1, -2], s: [2, 1], d: [1, 1] }, group: 'capuz', strokes: [[2, [[23, 51], [25, 55]]]] }));
  P.push(part('capuz_forro', 'casaco', ell(27.6, 47.4, 2.8, 1.8), pal4(PAL.casaco[3]), { group: 'capuz', sep: false }));
  P.push(...legsAndBoots('direita'));
  P.push(part('pescoco', 'corpo', poly([[29, 44], [35, 44], [35, 51], [29, 51]]), PAL.pele, { shade: { s: [2, 0] }, recv: true, group: 'pele' }));
  // Camisa: só a faixa da frente aparece pela abertura do casaco.
  P.push(part('camisa', 'camisa', poly([[33, 47.6], [37, 47.8], [38.6, 50], [38.8, 56], [38, 64.5], [33, 64.5]]), PAL.camisa, { shade: { l: [-1, -1], s: [1, 1] }, recv: true }));
  P.push(part('gola', 'camisa', poly([[31.6, 46.4], [36.4, 46.6], [36.6, 49.4], [31.6, 49.8]]), PAL.camisa, { shade: { l: [0, -1], s: [0, 1] }, group: 'gola' }));
  P.push(part('faixa', 'acessorio', poly([[30, 62.6], [39.2, 62.6], [39.2, 65.4], [30, 65.4]]), PAL.faixa, { shade: { l: [0, -1], s: [0, 1] } }));
  P.push(part('no_faixa', 'acessorio', or(poly([[37.4, 62.4], [39.6, 62.4], [39.6, 65.6], [37.4, 65.6]]), poly([[37.8, 65], [39.2, 65], [39.8, 68.4], [38.4, 68.4]])), PAL.faixa,
    { shade: { l: [-1, -1], s: [1, 1] }, group: 'no' }));
  // Casaco de perfil: costas retas, frente aberta (borda em x ~36), barra abrindo para trás.
  const corpo = poly([[26.6, 47.4], [33, 47.4], [36, 49], [36.2, 56], [35.6, 63], [35.4, 64.6], [26, 64.6], [25.4, 56], [25.6, 50]]);
  const aba = poly([[25.8, 64], [35.6, 64], [35, 70], [34.6, 77], [34.6, 84.2], [27, 84.4], [19.6, 85], [22.6, 74]]);
  P.push(part('casaco', 'casaco', corpo, PAL.casaco, { shade: { l: [-1, -3], s: [2, 0], d: [1, 1] }, recv: true, shadeAlso: ['aba'] }));
  P.push(part('aba', 'casaco', minus(aba, corpo), PAL.casaco, { shade: { l: [-1, -3], s: [2, 0], d: [1, 1] }, recv: true, group: 'casaco', shadeAlso: ['casaco'],
    strokes: [[2, [[27, 68], [25, 78]]], [2, [[31, 70], [30, 80]]]] }));
  P.push(part('lapela', 'casaco', poly([[33, 47.4], [35.6, 48.6], [36.4, 55], [35, 58], [34, 52]]), PAL.casaco, { shade: { l: [0, -2], d: [1, 0] }, group: 'casaco', sep: false }));
  // Braço (o de perto): manga larga pendendo ao lado do corpo, dobra no cotovelo, punho em sino, mão.
  if (bracoAtras) {
    // Corrida ninja: braço esticado para trás a partir do ombro, quase na horizontal, mão aberta atrás das costas.
    P.push(part('manga', 'casaco', poly([[33.4, 48.6], [28, 48.2], [22, 50.6], [17.4, 53.4], [18.6, 57.6], [23.4, 56], [29, 54.6], [33.4, 54]]), PAL.casaco,
      { shade: { l: [-1, -2], s: [1, 2], d: [1, 1] }, group: 'manga', strokes: [[2, [[25, 53], [23, 54]]]] }));
    P.push(part('punho', 'casaco', poly([[14.4, 52.6], [19.2, 52], [20.2, 58.2], [15.2, 59.4]]), PAL.casaco, { shade: { l: [-1, -1], s: [1, 1], d: [0, 1] }, group: 'punho' }));
    P.push(part('mao', 'corpo', ell(12.6, 56.4, 2.6, 2.8), PAL.pele, { shade: { l: [-1, -1], s: [1, 1], d: [1, 1] }, group: 'mao', recv: true }));
  } else {
  P.push(part('manga', 'casaco', poly([[27.6, 48.4], [32.4, 48.6], [34, 52], [33.8, 57], [34.4, 63.6], [27.2, 63.6], [27.6, 56.6], [26.8, 51]]), PAL.casaco,
    { shade: { l: [-1, -2], s: [2, 1], d: [1, 1] }, group: 'manga', strokes: [[2, [[29, 56], [31, 58]]], [2, [[32, 58], [33, 60]]]] }));
  P.push(part('punho', 'casaco', poly([[26.8, 62.6], [34.6, 62.6], [35, 66], [26.4, 66]]), PAL.casaco, { shade: { l: [0, -1], s: [2, 1], d: [0, 1] }, group: 'punho' }));
  P.push(part('mao', 'corpo', ell(31, 68.4, 3.1, 3), PAL.pele, { shade: { l: [-1, -1], s: [2, 1], d: [1, 1] }, group: 'mao', recv: true, marks: [[33, 67, 0]] }));
  }
  // Cabelo de trás (nuca), depois a cabeça de perfil com nariz e queixo, a orelha, e o cabelo da frente.
  P.push(part('cabelo_tras', 'cabelo', or(ell(29, 32, 14.6, 13.6), poly([[15.6, 32], [26, 30], [27.4, 45.6], [22, 44], [17.6, 41]])), [PAL.cabelo[1], PAL.cabelo[2], PAL.cabelo[2], PAL.cabelo[2]],
    { shade: { l: [-2, -2], s: [3, 1], d: [1, 1] }, group: 'cabelo', sep: false }));
  const cabeca = or(ell(32.6, 34.4, 12.2, 12.4), poly([[36, 37], [44.6, 37.6], [44.4, 41.6], [42.6, 44.6], [39, 47.4], [33.6, 48.2], [30.4, 46]]),
    poly([[43.6, 40.6], [45.8, 42], [44.4, 43.4]]));
  P.push(part('cabeca', 'corpo', cabeca, PAL.pele, { shade: { l: [-3, -3], s: [2, 0], d: [1, 1] }, recv: true, group: 'pele' }));
  P.push(part('orelha', 'corpo', ell(28.4, 39.4, 2.2, 3), PAL.pele, { shade: { l: [-1, -1], s: [1, 1], d: [1, 1] }, group: 'orelha', marks: [[28, 39, 2], [28, 40, 2]] }));
  const tufts = [[[18, 30], [9.4, 27.4], [14.6, 25], [11.6, 19], [21, 21.6]], C_TUFTS[1], C_TUFTS[2], [[40, 20], [47.6, 15], [46.8, 19.4], [52, 22], [46, 27]]];
  const franja = [[33, 23.6], [46.4, 25.6], [47, 30], [45.4, 33], [43.6, 30.4], [41.4, 34.4], [39.4, 30.6], [37, 35.4], [35.6, 31], [33.4, 33.6], [31.6, 28]];
  const costeleta = [[30.6, 27], [35, 27], [35, 33], [33.8, 39.4], [32.4, 34]];
  const crown = [[[20, 25], [23, 18.4], [29, 15.4], [27.4, 20], [25, 26]], [[26, 26], [28.4, 18.6], [34.4, 14.6], [33.6, 20.4], [31.6, 27]], [[32.4, 27], [34, 19.4], [38.6, 15.4], [41.2, 19.6], [38.6, 27]]];
  const mass = or(and(ell(31, 30.6, 16, 14), rows(0, 27.5)), poly([[15.2, 27], [27.6, 27], [27.4, 34], [23, 41], [17, 38]]), ...tufts.map(poly), poly(franja), poly(costeleta));
  P.push(part('cabelo', 'cabelo', mass, PAL.cabelo, {
    shade: { l: [-2, -3], s: [3, 2], d: [1, 1] }, group: 'cabelo', sep: true,
    subs: [...tufts, ...crown, costeleta, [[33, 24], [40, 25], [37, 35.4]], [[39, 25], [47, 26], [45.4, 33]]].map(poly),
    strokes: [[FIO, [[30, 18], [35, 24], [37, 33]]], [FIO, [[31, 18], [39, 24], [41.4, 32]]], [FIO, [[29, 18], [32, 24], [33.4, 31]]], [FIO, [[28, 19], [22, 27], [20, 34]]]],
  }));
  return P;
}

/** Rosto de perfil: um olho mais estreito virado para a direita, sobrancelha, boca e bochecha. */
const OLHO_LADO = ['KKKK', 'KHDP', 'KDPP', 'KLPL', 'KLLL', '.KKK'];
function sideStamps() {
  const px = [];
  const put = (layer, x, y, c) => px.push({ layer, x, y, c });
  OLHO_LADO.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') put('olhos', 38 + x, 36 + y, PAL.olho[ch]); }));
  for (const [x, y] of [[38, 33], [39, 33], [40, 33], [41, 34]]) put('olhos', x, y, PAL.cabelo[2]);
  put('boca', 41, 45, PAL.boca); put('boca', 42, 45, PAL.boca); put('boca', 43, 44, PAL.boca); put('boca', 41, 46, PAL.pele[2]);
  put('boca', 44, 43, PAL.pele[2]); put('boca', 44, 41, PAL.pele[0]);
  for (const [x, y] of [[38, 43], [39, 43]]) put('boca', x, y, PAL.blush);
  return px;
}

// ---------------------------------------------------------------- animação (pose por segmento)
//
// Cada peça pertence a um segmento: corpo, cabelo, braco_e/d (ou braco), perna_e/d (ou perna_f/t), aba_e/d (ou aba).
// Uma pose desloca cada segmento em pixels inteiros (dx, dy) e pode inclinar as abas (sh: quanto a barra anda em x,
// crescendo de 0 no alto da aba até sh na ponta). Pixels inteiros: nada de rotação, para não sujar o pixel art.

export function segmentOf(name) {
  let m = /^(perna|bota|sola|punho_bota)_([edft])$/.exec(name);
  if (m) return `perna_${m[2]}`;
  m = /^(manga|punho|mao)(?:_([ed]))?$/.exec(name);
  if (m) return m[2] ? `braco_${m[2]}` : 'braco';
  m = /^aba(?:_([ed]))?$/.exec(name);
  if (m) return m[1] ? `aba_${m[1]}` : 'aba';
  if (name.startsWith('cabelo')) return 'cabelo';
  return 'corpo';
}

/**
 * Desloca uma máscara. sh inclina: a linha shTop fica parada e a partir de shBot o deslocamento é sh inteiro (sem
 * shTop/shBot, vale o alto e o pé da própria máscara). tip: as linhas acima de tip.y andam tip.dy a mais (movimento
 * secundário das pontas do cabelo); para cima, a ponta estica (fica também onde estava), sem abrir buraco.
 */
function moveMask(m, dx, dy, sh, shTop, shBot, tip) {
  if (!dx && !dy && !sh && !(tip && (tip.dy || tip.dx))) return m;
  let y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const top = shTop ?? y0, bot = shBot ?? y1;
  const r = new Uint8Array(W * H);
  const put = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) r[y * W + x] = 1; };
  for (let y = 0; y < H; y++) {
    const sx = sh ? Math.round(sh * Math.max(0, Math.min(1, (y - top) / (bot - top || 1)))) : 0; // bot < top: inclina para cima
    for (let x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      if (tip && (tip.dy || tip.dx) && y < tip.y) {
        put(x + dx + sx + (tip.dx || 0), y + dy + (tip.dy || 0));
        if ((tip.dy || 0) < 0 || tip.dx) put(x + dx + sx, y + dy);
      } else put(x + dx + sx, y + dy);
    }
  }
  return r;
}

/** Aplica a pose: { segmento: { dx, dy, sh } }. O corpo leva o rosto junto. */
function posed({ parts, stamps }, pose) {
  const T = (seg) => pose[seg] ?? {};
  const moved = parts.map((p) => {
    const { dx = 0, dy = 0, sh = 0, shTop, shBot, tip } = T(segmentOf(p.name));
    if (!dx && !dy && !sh && !(tip && (tip.dy || tip.dx))) return p;
    const mv = (pts) => pts.map(([x, y]) => [x + dx, y + dy]);
    const mm = (m) => moveMask(m, dx, dy, sh, shTop, shBot, tip);
    return { ...p, mask: mm(p.mask), subs: p.subs.map(mm),
      marks: p.marks.map(([x, y, t]) => [x + dx, y + dy, t]), strokes: p.strokes.map(([t, pts]) => [t, mv(pts)]) };
  });
  // O rosto acompanha o corpo, inclusive a inclinação do tronco (na altura do rosto ela já é inteira).
  const { dx = 0, dy = 0, sh = 0, shTop, shBot } = T('corpo');
  const lean = (y) => (sh && shTop !== undefined ? Math.round(sh * Math.max(0, Math.min(1, (y - shTop) / (shBot - shTop)))) : 0);
  return { parts: moved, stamps: stamps.map((q) => ({ ...q, x: q.x + dx + lean(q.y), y: q.y + dy })) };
}

/**
 * Caminhada em 6 quadros (V29.1): contato, descida, passagem, contato do outro pé, descida, passagem.
 * Uma tabela só para as 4 vistas: mesmo ritmo, mesmo sobe-e-desce, mesma duração do passo.
 *   [A avanço, A ergue, B avanço, B ergue, corpo dy]
 * A = perna da esquerda da tela (frente/costas) ou a de perto (lado); B = a outra. "Ergue" é o calcanhar/pé saindo do
 * chão: 1 px no contato (o pé de trás levanta o calcanhar) e 2 px na descida; o pé de apoio fica na linha 88.
 */
export const WALK = [
  [3, 0, -3, 1, 0],
  [1, 0, -1, 2, 1],
  [-1, 0, 1, 1, -1],
  [-3, 1, 3, 0, 0],
  [-1, 2, 1, 0, 1],
  [1, 1, -1, 0, -1],
];
export const WALK_MS = 125; // por quadro: 750 ms por ciclo (escolha do Victor; 660 e 840 ms arquivados em v29_1/arquivo)

export function walkPose(view, k) {
  const n = WALK.length;
  const [aX, aY, bX, bY, bob] = WALK[k % n];
  const prev = WALK[(k + n - 1) % n][4];
  // Cabelo: a massa vai junto com a cabeça (a franja não desliza); só as pontas do alto atrasam 1 px.
  const P = { corpo: { dy: bob }, cabelo: { dy: bob, tip: { y: 17, dy: bob > prev ? -1 : bob < prev ? 1 : 0 } } };
  if (view === 'direita' || view === 'esquerda') {
    const f = view === 'direita' ? 1 : -1;
    // Pernas giram no quadril (inclinação, não deslocamento): o alto da coxa fica escondido sob o casaco e o pé
    // vai 3 px para a frente ou para trás. A bota (linha 80 para baixo) anda inteira.
    P.perna_f = { sh: f * aX, shTop: 66, shBot: 80, dy: -aY };
    P.perna_t = { sh: f * bX, shTop: 66, shBot: 80, dy: -bY };
    // Braço gira no ombro, ao contrário da perna de perto; punho e mão andam inteiros.
    P.braco = { sh: -f * Math.round((aX * 2) / 3), shTop: 50, shBot: 63, dy: bob };
    P.aba = { dy: bob, sh: -f * (bob === -1 ? 2 : 1) };
    return P;
  }
  // De frente e de costas (e/d = lados da TELA), V29.2.
  //  - Contato: as pernas abrem 1 px cada (passada) e as duas abas abrem 1 px na barra, mostrando os pés.
  //  - Descida: o pé de trás sai 2 px do chão e a aba do lado dele abre 1 px.
  //  - Passagem: o pé de trás desce para 1 px, abas fechadas.
  //  Assim os pés nunca encostam (o vão é de no mínimo 1 px e de 3 px no contato) e cada passo tem um lado claro.
  const q = k % n, contato = q === 0 || q === 3;
  P.perna_e = { dx: contato ? -1 : 0, dy: -aY };
  P.perna_d = { dx: contato ? 1 : 0, dy: -bY };
  const aFrente = aX > 0, bFrente = bX > 0;           // qual perna está à frente neste quadro
  P.braco_e = { dx: bFrente ? 1 : 0, dy: bob + (bFrente ? 1 : 0) };
  P.braco_d = { dx: aFrente ? -1 : 0, dy: bob + (aFrente ? 1 : 0) };
  P.aba_e = { dy: bob, sh: contato || aY === 2 ? -1 : 0 };
  P.aba_d = { dy: bob, sh: contato || bY === 2 ? 1 : 0 };
  return P;
}

/**
 * Corrida ninja em 6 quadros (V30.1), igual à corrida do boneco anterior (rig v27, `correr` em public/rig.js):
 * tronco bem inclinado com a cabeça à frente, os DOIS braços esticados para trás (não balançam), passada longa com o
 * joelho subindo, um instante no ar, a barra do casaco voando para trás. Ciclo de 440 ms, como o anterior.
 *   [A avanço, A ergue, B avanço, B ergue, corpo dy]  (A = perna da esquerda da tela / a de perto de lado)
 */
export const RUN = [
  [6, 0, -6, 2, 0],
  [3, 0, -4, 4, 1],
  [-2, 2, 4, 5, -2],
  [-6, 2, 6, 0, 0],
  [-4, 4, 3, 0, 1],
  [4, 5, -2, 2, -2],
];
export const RUN_MS = [70, 80, 70, 70, 80, 70]; // 440 ms por ciclo, como o `correr` do rig (ms: 440)

export function runPose(view, k) {
  const n = RUN.length, q = k % n;
  const [aX, aY, bX, bY, bob] = RUN[q];
  const prev = RUN[(q + n - 1) % n][4];
  const lag = bob > prev ? -1 : bob < prev ? 1 : 0;   // pontas do cabelo atrasam o sobe-e-desce
  const tremor = q % 3 === 1 ? 1 : 0;                  // braços quase parados: só 1 px de tranco no "recolhe"
  if (view === 'direita' || view === 'esquerda') {
    const f = view === 'direita' ? 1 : -1;
    const L = 8 * f;                                   // inclinação: cabeça e ombros 8 px à frente do quadril e 3 px abaixo
    return {
      corpo: { dy: bob + 3, sh: L, shTop: 66, shBot: 50 },
      cabelo: { dx: L, dy: bob + 3, tip: { y: 17, dy: lag, dx: -2 * f } },
      perna_f: { sh: f * aX, shTop: 66, shBot: 80, dy: -aY },
      perna_t: { sh: f * bX, shTop: 66, shBot: 80, dy: -bY },
      // Braço esticado para trás a partir do ombro (que foi junto com o tronco): a mão fica atrás do quadril.
      // Braço esticado para trás (desenho próprio, sideParts(true)); só acompanha o ombro e dá 1 px de tranco.
      bracoAtras: true, limpeza: true,
      braco: { dx: L, dy: bob + 3 - tremor },
      aba: { dy: bob, sh: -f * (bob === -2 ? 7 : 6) },
    };
  }
  // De frente e de costas: o tronco inclinado aparece como cabeça e peito 2 px mais baixos; os braços vão para trás e
  // para fora (as mãos abrem 2 px dos lados do corpo e sobem 1 px); joelhos sobem bem (até 5 px); abas voam abertas.
  const contato = q === 0 || q === 3;
  return {
    limpeza: true,
    corpo: { dy: bob + 2 },
    cabelo: { dy: bob + 2, tip: { y: 17, dy: lag } },
    perna_e: { dx: contato ? -1 : 0, dy: -aY },
    perna_d: { dx: contato ? 1 : 0, dy: -bY },
    braco_e: { dx: -2, dy: bob + 1 - tremor },
    braco_d: { dx: 2, dy: bob + 1 - tremor },
    aba_e: { dy: bob, sh: contato ? -3 : -2 },
    aba_d: { dy: bob, sh: contato ? 3 : 2 },
  };
}

// ---------------------------------------------------------------- animação pelo esqueleto palito 3D (V31)
//
// O esqueleto de public/rig.js (o mesmo das animações do boneco anterior) dá, a cada quadro, onde cada junta está na
// tela. Cada peça desenhada à mão anda presa a um osso: tronco (cintura -> pescoço), braço (ombro -> cotovelo),
// antebraço (cotovelo -> pulso), coxa (quadril -> joelho), canela (joelho -> tornozelo) e pé (tornozelo -> ponta).
// Do osso vêm o giro (diferença de ângulo na tela entre a pose e a pose neutra) e o encurtamento (o osso que aponta
// para a câmera fica mais curto na tela). Braços e pernas são cortados no cotovelo e no joelho (com 1 linha de
// sobra, para a junta não abrir). A forma é girada, e SÓ DEPOIS vêm o sombreado, os traços e o contorno: a luz e o
// traço continuam limpos em qualquer ângulo. A cabeça não gira (o rosto é desenhado à mão): só anda com o pescoço.

const SK = 1.1; // px do herói por px do esqueleto (pernas: 18 px aqui, ~16,8 no rig)

/** Juntas do herói (pose neutra, coordenadas contínuas) por vista. e/d = lado da TELA; f/t = perto/longe (perfil). */
const PIVOTS = {
  frente: { cintura: [32, 64], pescoco: [32, 47],
    e: { ombro: [21.6, 50], cotovelo: [21.2, 57], pulso: [21.2, 64], quadril: [28, 66], joelho: [28, 76], tornozelo: [27.6, 84], ponta: [23, 87] },
    d: { ombro: [42.4, 50], cotovelo: [42.8, 57], pulso: [42.8, 64], quadril: [36, 66], joelho: [36, 76], tornozelo: [36.4, 84], ponta: [41, 87] } },
  direita: { cintura: [31, 64], pescoco: [32, 47],
    f: { ombro: [30.4, 50], cotovelo: [30.8, 57], pulso: [31, 64], quadril: [34.4, 66], joelho: [34.4, 76], tornozelo: [34.6, 84], ponta: [41, 87] },
    t: { ombro: [30.4, 50], cotovelo: [30.8, 57], pulso: [31, 64], quadril: [28, 66], joelho: [27.8, 76], tornozelo: [28, 84], ponta: [33.6, 87] } },
};
PIVOTS.costas = PIVOTS.frente;

/** Osso de cada peça: [lado, membro] ou 'tronco' / 'cabeca' / 'pelve'. */
function boneOf(name) {
  if (name.startsWith('cabelo') || name === 'cabeca' || name === 'orelha') return ['cabeca'];
  let m = /^(perna)_([edft])$/.exec(name); if (m) return [m[2], 'perna'];
  m = /^(bota|sola|punho_bota)_([edft])$/.exec(name); if (m) return [m[2], 'pe'];
  m = /^(manga|punho|mao)(?:_([ed]))?$/.exec(name); if (m) return [m[2] || 'f', m[1] === 'manga' ? 'braco' : 'mao'];
  m = /^aba(?:_([ed]))?$/.exec(name); if (m) return [m[1] || 'f', 'aba'];
  if (name === 'quadril') return ['pelve'];
  return ['tronco'];
}

// Afim 2D: p -> o + M (p - c). M = [a, b, c, d] (linha a linha).
const rotM = (t) => [Math.cos(t), -Math.sin(t), Math.sin(t), Math.cos(t)];
const mulM = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
const apM = (M, v) => [M[0] * v[0] + M[1] * v[1], M[2] * v[0] + M[3] * v[1]];
const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Giro + encurtamento ao longo do osso: leva o osso neutro (a->b) ao osso da pose (a2->b2). */
function boneM(a, b, a2, b2, minR = 0.45) {
  const u = [Math.cos(ang(a, b)), Math.sin(ang(a, b))];
  const raw = len(a2, b2) / Math.max(0.01, len(a, b));
  const r = Math.max(minR, Math.min(1.25, raw));
  const S = [1 + (r - 1) * u[0] * u[0], (r - 1) * u[0] * u[1], (r - 1) * u[0] * u[1], 1 + (r - 1) * u[1] * u[1]];
  // Osso quase apontando para a câmera: o ângulo na tela fica instável (um palito de 1 px pode apontar para qualquer
  // lado). Quanto mais curto na tela, menos ele gira; abaixo de 25% do comprimento, não gira.
  let d = ang(a2, b2) - ang(a, b); d = Math.atan2(Math.sin(d), Math.cos(d));
  const w = Math.max(0, Math.min(1, (raw - 0.25) / 0.5));
  return mulM(rotM(d * w), S);
}
const T = (o, M, c) => ({ o, M, c });
const fwd = (t, p) => { const v = apM(t.M, [p[0] - t.c[0], p[1] - t.c[1]]); return [t.o[0] + v[0], t.o[1] + v[1]]; };
function inverseOf(M) { const det = M[0] * M[3] - M[1] * M[2]; return [M[3] / det, -M[1] / det, -M[2] / det, M[0] / det]; }

/** Aplica o afim a uma máscara (amostra de trás para a frente: cada pixel de destino busca a origem). */
function affineMask(m, t, dx = 0, dy = 0) {
  const Mi = inverseOf(t.M), r = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = [x + 0.5 - dx - t.o[0], y + 0.5 - dy - t.o[1]];
    const v = apM(Mi, q), sx = Math.floor(t.c[0] + v[0]), sy = Math.floor(t.c[1] + v[1]);
    if (sx >= 0 && sy >= 0 && sx < W && sy < H && m[sy * W + sx]) r[y * W + x] = 1;
  }
  return r;
}

/** Transformações de cada osso do herói num quadro. */
export function skeletonFrame(view, anim, t) {
  const mirror = view === 'esquerda';
  const v = mirror ? 'direita' : view;
  const yaw = YAW_OF_DIR[{ frente: 0, costas: 3, direita: 2 }[v]];
  const R0 = solve(basePose(), yaw), R1 = solve(anim ? poseOf(anim, t) : basePose(), yaw);
  const P0 = R0.P, P1 = R1.P;
  const piv = PIVOTS[v];
  // Qual lado do esqueleto (L/R) é cada lado do herói: pela posição na tela (frente/costas) ou pela profundidade (perfil).
  const sides = v === 'direita'
    ? (P0.hipL[2] > P0.hipR[2] ? { f: 'L', t: 'R' } : { f: 'R', t: 'L' })
    : (P0.hipL[0] < P0.hipR[0] ? { e: 'L', d: 'R' } : { e: 'R', d: 'L' });
  const sc = (a, b) => [(b[0] - a[0]) * SK, (b[1] - a[1]) * SK];
  const plus = (p, d) => [p[0] + d[0], p[1] + d[1]];
  const dPelvis = sc(P0.pelvis, P1.pelvis);
  const cintura2 = plus(piv.cintura, dPelvis);
  const tronco = T(cintura2, rotM(ang(P1.waist, P1.neck) - ang(P0.waist, P0.neck)), piv.cintura);
  const pescoco2 = fwd(tronco, piv.pescoco);
  const X = { tronco, pelve: T(cintura2, [1, 0, 0, 1], piv.cintura), cabeca: T(pescoco2, [1, 0, 0, 1], piv.pescoco), lados: {} };
  for (const [k, S] of Object.entries(sides)) {
    const J = piv[k];
    const ombro2 = fwd(tronco, J.ombro);
    const braco = T(ombro2, boneM(P0[`shoulder${S}`], P0[`elbow${S}`], P1[`shoulder${S}`], P1[`elbow${S}`]), J.ombro);
    const cot2 = fwd(braco, J.cotovelo);
    const mao = T(cot2, boneM(P0[`elbow${S}`], P0[`wrist${S}`], P1[`elbow${S}`], P1[`wrist${S}`]), J.cotovelo);
    const quad2 = plus(J.quadril, sc(P0[`hip${S}`], P1[`hip${S}`]));
    const coxa = T(quad2, boneM(P0[`hip${S}`], P0[`knee${S}`], P1[`hip${S}`], P1[`knee${S}`]), J.quadril);
    const joe2 = fwd(coxa, J.joelho);
    const canela = T(joe2, boneM(P0[`knee${S}`], P0[`ankle${S}`], P1[`knee${S}`], P1[`ankle${S}`]), J.joelho);
    const tor2 = fwd(canela, J.tornozelo);
    // O pé não encolhe nem estica (bota rígida); de lado, gira com o osso do pé.
    const pe = T(tor2, v === 'direita' ? rotM(ang(P1[`ankle${S}`], P1[`toe${S}`]) - ang(P0[`ankle${S}`], P0[`toe${S}`])) : [1, 0, 0, 1], J.tornozelo);
    // Aba do casaco: presa na cintura, acompanha metade do giro da coxa do mesmo lado.
    // Mais o vento: a barra vai para trás (de lado) ou abre (de frente/costas), mais na corrida.
    const flow = anim === 'correr' ? 1 : anim === 'andar' ? 0.35 : 0;
    const vento = v === 'direita' ? 0.32 * flow : (k === 'e' ? 0.14 : -0.14) * flow;
    const aba = T(cintura2, rotM(0.5 * (ang(P1[`hip${S}`], P1[`knee${S}`]) - ang(P0[`hip${S}`], P0[`knee${S}`])) + vento), piv.cintura);
    // Braço atrás do tronco (de frente/costas, na corrida ninja): vai para trás das outras peças.
    const atras = v !== 'direita' && P1[`elbow${S}`][2] < P1.chest[2] - 1.5;
    X.lados[k] = { braco, mao, coxa, canela, pe, aba, joelhoY: J.joelho[1], cotoveloY: J.cotovelo[1], atras,
      juntas: [ombro2, cot2, fwd(mao, J.pulso), quad2, joe2, tor2, fwd(pe, J.ponta)] };
  }
  X.ar = Math.round(((R1.pose.air || 0) * SK)); // px no ar (os dois pés fora do chão)
  X.mirror = mirror;
  return X;
}

/** Pose pelo esqueleto: { anim, t, flow } -> peças giradas. */
function skeletonPosed({ parts, stamps }, view, { anim, t }) {
  const X = skeletonFrame(view, anim, t);
  const mir = (tr) => (X.mirror ? { o: [64 - tr.o[0], tr.o[1]], c: [64 - tr.c[0], tr.c[1]], M: [tr.M[0], -tr.M[1], -tr.M[2], tr.M[3]] } : tr);
  const side = (k) => X.lados[X.mirror ? k : k] || X.lados.f;
  const out = [];
  const pieces = new Map(); // nome original -> nomes das peças
  const plan = (p) => {
    const [k, limb] = boneOf(p.name);
    if (k === 'tronco') return [[p.mask, X.tronco, '']];
    if (k === 'pelve') return [[p.mask, X.pelve, '']];
    if (k === 'cabeca') return [[p.mask, X.cabeca, '']];
    const L = side(k);
    if (limb === 'pe') return [[p.mask, L.pe, '']];
    if (limb === 'mao') return [[p.mask, L.mao, '']];
    if (limb === 'aba') return [[p.mask, L.aba, '']];
    // Braço e perna: corta no cotovelo/joelho, com 1 linha de sobra de cada lado.
    const cut = limb === 'braco' ? L.cotoveloY : L.joelhoY;
    const [A, B] = limb === 'braco' ? [L.braco, L.mao] : [L.coxa, L.canela];
    return [[and(p.mask, rows(0, cut + 1)), A, ''], [and(p.mask, rows(cut - 1, 96)), B, '~2']];
  };
  for (const p of parts) {
    const pl = plan(p);
    pieces.set(p.name, pl.map(([, , suf]) => p.name + suf));
    for (const [mask, tr0] of pl) void mask, void tr0;
  }
  for (const p of parts) {
    for (const [mask, tr0, suf] of plan(p)) {
      const tr = mir(tr0);
      const fm = (pt) => fwd(tr, [pt[0] + 0.5, pt[1] + 0.5]).map(Math.floor);
      const sib = [...p.shadeAlso.flatMap((n) => pieces.get(n) || [n]), ...pieces.get(p.name).filter((n) => n !== p.name + suf)];
      // Sola girada vira uma escada fina: a luz de 1 px na ponta de cada degrau sobraria solta. Girada, fica lisa.
      const shade = /^sola/.test(p.name) && Math.abs(tr.M[2]) > 0.05 ? {} : p.shade;
      out.push({ ...p, shade, name: p.name + suf, mask: affineMask(mask, tr), subs: p.subs.map((m) => affineMask(m, tr)),
        marks: p.marks.map(([x, y, tt]) => [...fm([x, y]), tt]),
        strokes: p.strokes.map(([tt, pts]) => [tt, pts.map((q) => fwd(tr, q))]), shadeAlso: sib, origin: p.name });
    }
  }
  // A barra do casaco girando pela cintura não pode passar do chão (a ponta de fora desceria abaixo dos pés).
  for (const q of out) if (boneOf(q.origin)[1] === 'aba') q.mask = and(q.mask, rows(0, 86));
  // Ordem por profundidade: braço que foi para trás do tronco é desenhado antes de tudo.
  const behind = out.filter((q) => { const [k, limb] = boneOf(q.origin); return (limb === 'braco' || limb === 'mao') && side(k)?.atras; });
  if (behind.length) { const rest = out.filter((q) => !behind.includes(q)); out.length = 0; out.push(...behind, ...rest); }
  // Chão: o pé mais baixo volta para a linha 88 (no ar, os dois ficam acima).
  let low = 0;
  for (const q of out) if (/^(bota|sola)_/.test(q.origin)) for (let i = q.mask.length - 1; i >= 0; i--) if (q.mask[i]) { low = Math.max(low, Math.floor(i / W)); break; }
  const dy = 88 - X.ar - low;
  const cab = mir(X.cabeca);
  const shifted = dy ? out.map((q) => ({ ...q, mask: moveMask(q.mask, 0, dy, 0), subs: q.subs.map((m) => moveMask(m, 0, dy, 0)),
    marks: q.marks.map(([x, y, tt]) => [x, y + dy, tt]), strokes: q.strokes.map(([tt, pts]) => [tt, pts.map(([x, y]) => [x, y + dy])]) })) : out;
  const hx = Math.round(cab.o[0] - cab.c[0]), hy = Math.round(cab.o[1] - cab.c[1]) + dy;
  // Movimento secundário: as pontas do alto do cabelo atrasam 1 px em relação ao sobe-e-desce da cabeça.
  if (anim) {
    const P = skeletonFrame(view, anim, t - 1 / 6).cabeca, C = X.cabeca;
    const lag = Math.sign(Math.round((P.o[1] - C.o[1]) * 2) / 2);
    if (lag) for (const q of shifted) if (q.origin.startsWith('cabelo')) { q.mask = moveMask(q.mask, 0, 0, 0, undefined, undefined, { y: 17 + hy, dy: lag }); }
  }
  // Palito (para a prancha): as juntas do herói nesta pose, já no chão.
  const mj = (q) => [X.mirror ? 64 - q[0] : q[0], q[1] + dy];
  const juntas = { tronco: [mj(X.tronco.o), mj(fwd(X.tronco, PIVOTS[view === 'esquerda' ? 'direita' : view].pescoco))],
    lados: Object.values(X.lados).map((L) => L.juntas.map(mj)) };
  return { parts: shifted, stamps: stamps.map((q) => ({ ...q, x: q.x + hx, y: q.y + hy })), juntas };
}

// ---------------------------------------------------------------- montagem

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

export function renderHeroFront(hairKey = 'A') { return renderHero(hairKey, 'frente'); }

/** Peças (de trás para a frente) e carimbos do rosto de uma vista. */
function viewParts(hairKey, view, opts = {}) {
  if (view === 'esquerda') {
    // Lado esquerdo: a geometria do direito espelhada ANTES do sombreado, para a luz continuar vindo da esquerda.
    const { parts, stamps } = viewParts(hairKey, 'direita', opts);
    const mm = (m) => { const r = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) r[y * W + x] = m[y * W + (W - 1 - x)]; return r; };
    return {
      parts: parts.map((p) => ({ ...p, mask: mm(p.mask), subs: p.subs.map(mm), marks: p.marks.map(([x, y, t]) => [W - 1 - x, y, t]),
        strokes: p.strokes.map(([t, pts]) => [t, pts.map(([x, y]) => [W - 1 - x, y])]) })),
      stamps: stamps.map((q) => ({ ...q, x: W - 1 - q.x })),
    };
  }
  if (view === 'costas') return { parts: backParts(), stamps: [] };
  if (view === 'direita') return { parts: sideParts(opts.bracoAtras), stamps: sideStamps() };
  const parts = [...bodyParts()];
  // O cabelo de trás vai antes da cabeça; mechas e franja, depois.
  const hair = HAIR[hairKey]();
  const head = parts.findIndex((p) => p.name === 'cabeca');
  parts.splice(head, 0, ...hair.tras);
  parts.push(...hair.frente);
  return { parts, stamps: faceStamps() };
}

export const VIEWS = ['frente', 'costas', 'direita', 'esquerda'];

/** Monta o boneco numa vista. Devolve { w, h, rgba, layers: { nome: rgba } }. */
export function renderHero(hairKey = 'C', view = 'frente', pose = null) {
  const base = viewParts(hairKey, view, { bracoAtras: !!(pose && pose.bracoAtras) });
  const posedRes = pose ? (pose.skel ? skeletonPosed(base, view, pose.skel) : posed(base, pose)) : base;
  const { parts, stamps } = posedRes;
  // Sombreado em conjunto: peças separadas para animar (pernas, botas) testam a luz contra a união com as irmãs.
  const byName = new Map(parts.map((p) => [p.name, p]));
  for (const p of parts) p.shadeMask = p.shadeAlso.length ? or(p.mask, ...p.shadeAlso.map((n) => byName.get(n)?.mask).filter(Boolean)) : p.mask;
  const col = new Array(W * H).fill(null);
  const own = new Int16Array(W * H).fill(-1);
  const tone = new Int8Array(W * H).fill(-1);
  const at = (m, x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x];

  const keep = new Set(); // pixels desenhados de propósito (fios, vincos): a limpeza não mexe
  parts.forEach((p, pi) => {
    const { l, s, d } = p.shade;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!p.mask[y * W + x]) continue;
      let t = 1;
      if (l && !at(p.shadeMask, x + l[0], y + l[1])) t = 0;
      if (s && !at(p.shadeMask, x + s[0], y + s[1])) t = 2;
      if (d && !at(p.shadeMask, x + d[0], y + d[1])) t = 3;
      const i = y * W + x;
      col[i] = p.pal[t]; own[i] = pi; tone[i] = t;
    }
    for (const [x, y, t] of p.marks) { const i = y * W + x; if (own[i] === pi) { col[i] = p.pal[t]; tone[i] = t; } }
    // Sub-mechas: cada uma ganha luz em cima/esquerda e sombra embaixo/direita dentro da massa, sem traço escuro.
    for (const sm of p.subs) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!sm[i] || own[i] !== pi || tone[i] === 3) continue;
      let t = -1;
      if (!at(sm, x - 1, y - 1) || (!at(sm, x - 2, y) && y < 30) || (p.subLight === 'nuca' && y >= 30 && y < 41 && (!at(sm, x - 1, y) || !at(sm, x - 2, y)))) t = 0;
      if (!at(sm, x + 1, y + 1)) t = 2;
      if (t >= 0) { col[i] = p.pal[t]; tone[i] = t; }
    }
    // Traços (fios do cabelo, dobras): linha de pixels num tom, só sobre a própria peça.
    for (const [t, pts] of p.strokes) for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let q = 0; q <= n; q++) {
        const x = Math.round(x0 + ((x1 - x0) * q) / n), y = Math.round(y0 + ((y1 - y0) * q) / n), i = y * W + x;
        if (own[i] === pi) { col[i] = typeof t === 'string' ? t : p.pal[t]; tone[i] = typeof t === 'string' ? 2 : t; keep.add(i); }
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
  for (const i of seps) { const t = parts[own[i]].sepTone ?? 2; col[i] = parts[own[i]].pal[t]; tone[i] = t; }

  // Sombra interna do casaco: a borda que dá para a abertura (camisa, faixa, calça) fica no tom de sombra.
  const inner = new Set(['camisa', 'calca', 'acessorio']);
  const fill = [];
  for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (own[i] < 0 || parts[own[i]].group !== 'casaco' || tone[i] === 3) continue;
    for (const dx of [-1, 1]) { const j = i + dx; if (own[j] >= 0 && inner.has(parts[own[j]].layer)) { fill.push(i); break; } }
  }
  for (const i of fill) { col[i] = parts[own[i]].pal[2]; tone[i] = 2; }

  // Peças irmãs (shadeAlso) contam como a mesma peça na limpeza, como eram antes de separar para animar.
  const same = (a, b) => a === b || (a >= 0 && b >= 0 && parts[b].shadeAlso.includes(parts[a].name));
  // Limpeza: pixel isolado (cor diferente dos 4 vizinhos, 3 deles iguais entre si e da mesma peça) vira o vizinho.
  for (let pass = 0; pass < 2; pass++) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (!col[i] || keep.has(i)) continue;
    const nb = [i - 1, i + 1, i - W, i + W];
    if (nb.some((j) => col[j] === col[i])) continue;
    const cnt = {}; for (const j of nb) if (col[j] && same(own[j], own[i])) cnt[col[j]] = (cnt[col[j]] || 0) + 1;
    const best = Object.entries(cnt).sort((a, b) => b[1] - a[1]).find(([, n]) => n >= (parts[own[i]].layer === 'cabelo' ? 2 : 3));
    if (best) { col[i] = best[0]; tone[i] = parts[own[i]].pal.indexOf(best[0]); }
  }

  // Limpeza extra das poses inclinadas (corrida): a borda inclinada em degraus deixa pixels sem nenhum vizinho da mesma
  // cor, nem na diagonal. Viram a cor mais comum entre os vizinhos em cruz da mesma peça. Não roda na pose parada nem
  // na caminhada oficial (congelada).
  if (pose && pose.limpeza) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (!col[i] || keep.has(i)) continue;
    let alone = true;
    for (let dy = -1; dy <= 1 && alone; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && col[i + dy * W + dx] === col[i]) { alone = false; break; }
    if (!alone) continue;
    const cnt = {}; for (const j of [i - 1, i + 1, i - W, i + W]) if (col[j] && same(own[j], own[i])) cnt[col[j]] = (cnt[col[j]] || 0) + 1;
    const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2) { col[i] = best[0]; tone[i] = parts[own[i]].pal.indexOf(best[0]); }
    // Degrau solto numa borda inclinada: sombra profunda vira sombra, luz vira base (um tom mais perto do vizinho).
    else if (own[i] >= 0 && (tone[i] === 3 || tone[i] === 0)) { const t2 = tone[i] === 3 ? 2 : 1; col[i] = parts[own[i]].pal[t2]; tone[i] = t2; }
  }

  // Brilho do cabelo: arco de 2 px acompanhando a curva do alto da cabeça (só no tom de luz/base).
  const layerOf = new Array(W * H).fill(null);
  for (let i = 0; i < W * H; i++) if (own[i] >= 0) layerOf[i] = parts[own[i]].layer;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (layerOf[i] !== 'cabelo' || tone[i] > 1) continue;
    const dx = x + 0.5 - 31, dy = y + 0.5 - 31, r = Math.hypot(dx, dy), a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (r >= 11.6 && r < 12.8 && a > -140 && a < -70 && ((Math.floor(a / 7) % 3) !== 2)) col[i] = PAL.brilho;
  }

  // Rosto por cima da cabeça, só onde a pele aparece.
  for (const { layer, x, y, c } of stamps) {
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
  return { w: W, h: H, rgba, layers, juntas: posedRes.juntas };
}
