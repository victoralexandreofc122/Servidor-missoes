// Visual do personagem: as opções do Criador, a validação do visual que vem da rede, as cores das amostras e a escala
// do boneco na tela. O boneco em si é desenhado por código (v25): esqueleto 3D animado em rig.js, pixel art com as
// camadas em rigArt.js e o cache de quadros no navegador em figure.js.
//
// Tudo aqui é puro (testado no Node em test/sprites.test.ts), menos o ícone do sapato, que usa o canvas.

import { SPRITES } from './spriteData.js';
import { SHOES } from './rigArt.js';
import { figureCanvas } from './figure.js';

export { SHOES };

const P = SPRITES.paletas;
const VILAS = SPRITES.vilas;
const METAIS = new Set(['aco', 'ouro', 'bronze']);

/** Opções do Criador (mesmos nomes que o servidor aceita, em src/realtime/appearance.ts). */
export const OPTIONS = {
  gender: ['m', 'f'],
  skin: Object.keys(P.pele),
  hairStyle: ['espetado', 'longo_lateral'],
  hairColor: Object.keys(P.cabelo),
  eyeStyle: ['masculino', 'cilios'],
  eyeColor: Object.keys(P.olho),
  outfit: ['basica', 'vila'],
  shirtColor: Object.keys(P.roupa).filter((n) => !METAIS.has(n)),
  pantsColor: Object.keys(P.roupa).filter((n) => !METAIS.has(n)),
  bandana: [true, false],
  village: Object.keys(VILAS),
};

export const DEFAULT_APPEARANCE = Object.freeze({
  v: 2, gender: 'm', skin: 'claro', hairStyle: 'espetado', hairColor: 'castanho_escuro', eyeStyle: 'masculino',
  eyeColor: 'castanho', outfit: 'basica', shirtColor: 'azul_marinho', pantsColor: 'cinza', bandana: false, village: 'vila_1',
});

/** O sapato de quem não diz o que calça (NPCs, prévia do Criador): o mesmo com que todo ninja começa. */
export const DEFAULT_SHOES = 'sandalia_ninja';

const HEX = /^#[0-9a-f]{6}$/i;
const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** Nome da rampa cuja cor base (tom do meio) fica mais perto da cor "#rrggbb". */
function nearest(table, hex, baseIndex = 2) {
  const [r, g, b] = rgbOf(hex);
  let best = null, bestD = Infinity;
  for (const [name, ramp] of Object.entries(table)) {
    if (METAIS.has(name)) continue;
    const [r2, g2, b2] = rgbOf(ramp[baseIndex]);
    const d = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

/**
 * Visual vindo da rede -> visual válido (nada estranho chega ao canvas). Aceita o formato antigo
 * (5 cores "#rrggbb") e converte para as cores da paleta mais parecidas, como o servidor faz.
 */
export function normalizeLook(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_APPEARANCE };
  if (raw.v !== 2 && HEX.test(raw.skin) && HEX.test(raw.hair) && HEX.test(raw.shirt) && HEX.test(raw.pants)) {
    return { ...DEFAULT_APPEARANCE, skin: nearest(P.pele, raw.skin), hairColor: nearest(P.cabelo, raw.hair),
      shirtColor: nearest(P.roupa, raw.shirt), pantsColor: nearest(P.roupa, raw.pants) };
  }
  const out = { v: 2 };
  for (const [field, values] of Object.entries(OPTIONS)) {
    out[field] = values.includes(raw[field]) ? raw[field] : DEFAULT_APPEARANCE[field];
  }
  return out;
}

/** Cores "#rrggbb" do visual para o boneco antigo de retângulos (só se o desenho por código falhar). */
export function fallbackColors(look) {
  const vila = VILAS[look.village] || VILAS.vila_1;
  const vest = look.outfit === 'vila';
  return {
    skin: P.pele[look.skin][2], hair: P.cabelo[look.hairColor][2],
    shirt: P.roupa[vest ? vila.conjunto[0] : look.shirtColor][2], pants: P.roupa[vest ? vila.conjunto[1] : look.pantsColor][2],
    cape: P.roupa[vila.bandana][1],
  };
}

/**
 * Camadas do boneco para este visual (cada uma é um conjunto de formas presas nos ossos, em rigArt.js): corpo, olhos,
 * boca e cabelo sempre; camisa e calça (básica) ou conjunto da vila; bandana; sapato só calçado.
 */
export function layersFor(look) {
  const basic = look.outfit !== 'vila';
  return ['corpo', 'olhos', 'boca', 'cabelo', ...(basic ? ['camisa', 'calca'] : ['camisa', 'calca', 'conjunto', 'acessorio']),
    ...(look.bandana ? ['chapeu'] : []), ...(SHOES[look.shoes] ? ['sapato'] : [])];
}

/** Cor da amostra de uma opção do Criador (o tom do meio da rampa; vila = cor da bandana). */
export function swatchOf(field, value) {
  switch (field) {
    case 'skin': return P.pele[value]?.[2];
    case 'hairColor': return P.cabelo[value]?.[2];
    case 'eyeColor': return P.olho[value]?.[2];
    case 'shirtColor': case 'pantsColor': return P.roupa[value]?.[2];
    case 'village': return P.roupa[VILAS[value]?.bandana]?.[3];
    default: return undefined;
  }
}

/** Quantos tiles de altura o boneco ocupa no mapa (a escala é sempre inteira em pixels do aparelho). */
export const SPRITE_TILES = 1.5;

/**
 * Escala (px CSS por pixel do sprite). A partir de 2 px do aparelho por pixel, arredonda para inteiro (o pixel
 * art não borra); abaixo disso (tela pequena, câmera afastada) usa a escala exata, para o boneco não ficar
 * enorme perto do mapa.
 */
export function spriteScale(T, dpr) {
  const raw = (T * dpr * SPRITE_TILES) / 92;
  return (raw >= 2 ? Math.round(raw) : raw) / dpr;
}

/**
 * Ícone de um sapato: a própria camada "sapato" do boneco (de lado, parado), recortada e ampliada em escala inteira.
 * false = não é sapato (quem chama desenha outra coisa).
 */
export function drawShoeIcon(g, code, w, h) {
  if (!SHOES[code]) return false;
  const c = figureCanvas({ ...DEFAULT_APPEARANCE, shoes: code }, { only: ['sapato'], dir: 2 });
  const px = c.getContext('2d').getImageData(0, 0, 64, 96).data;
  let x0 = 64, y0 = 96, x1 = -1, y1 = -1;
  for (let y = 0; y < 96; y++) for (let x = 0; x < 64; x++) {
    if (!px[(y * 64 + x) * 4 + 3]) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return false;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const s = Math.max(1, Math.floor(Math.min((w * 0.8) / bw, (h * 0.8) / bh)));
  g.imageSmoothingEnabled = false;
  g.drawImage(c, x0, y0, bw, bh, Math.round((w - bw * s) / 2), Math.round((h - bh * s) / 2), bw * s, bh * s);
  return true;
}
