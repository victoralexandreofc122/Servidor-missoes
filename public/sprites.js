// Personagem em sprites (arte/personagem-chibi): camadas em mapa de índices, recoloridas no aparelho.
//
// Cada célula 64x96 (vista x quadro) de cada item (corpo, olhos, boca, cabelo, chapéu, conjunto, camisa,
// calça, sapato) está no atlas do gênero, recortada no que tem pixel. Cada pixel do atlas guarda canal + tom; a cor
// vem das paletas (spriteData.js). A cor final de cada célula é montada UMA vez por visual e fica em cache.
//
// Ordem de desenho (igual à do jogo): plano a plano (trás, corpo, frente, topo) e, dentro do plano, os slots
// na ordem de SPRITES.slots. De lado o atlas olha para a esquerda; para a direita, espelha.
//
// Partes sem DOM (validar o visual, escolher animação e quadro, cores de cada item) são funções puras
// testadas no Node (test/sprites.test.ts). O resto só roda no navegador.

import { SPRITES } from './spriteData.js';

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

/** Cores "#rrggbb" do visual para o boneco antigo de retângulos (enquanto os sprites carregam). */
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
 * Itens de cada slot para este visual (o símbolo da vila vai por cima da bandana e da camisa). `look.shoes` é o
 * sapato calçado (código do item; null = descalço), que vem do equipamento, não do Criador.
 */
export function itemsFor(look) {
  const vila = VILAS[look.village] || VILAS.vila_1;
  const basic = look.outfit !== 'vila';
  const shoe = SHOES[look.shoes];
  return {
    corpo: ['base'],
    olhos: [look.eyeStyle],
    boca: ['sorriso'],
    cabelo: [look.hairStyle],
    chapeu: look.bandana ? ['bandana', `simbolo_${vila.simbolo}`] : [],
    conjunto: basic ? [] : ['vila'],
    camisa: basic ? ['basica', `simbolo_${vila.simbolo}`] : [],
    calca: basic ? ['basica'] : [],
    sapato: shoe ? [shoe.sprite] : [],
  };
}

/**
 * Rampas de cor de um slot: canal (1 fixo, 2 pele, 3 cabelo, 4 olho, 5-7 cor1-3) -> lista "#rrggbb".
 * Conjunto e bandana usam as cores da VILA (travadas); camisa e calça, as do jogador.
 */
export function rampsFor(look, slot) {
  const vila = VILAS[look.village] || VILAS.vila_1;
  const cloth = {
    chapeu: [vila.bandana, 'aco', 'aco'],
    conjunto: vila.conjunto,
    camisa: [look.shirtColor, vila.logo, 'creme'],
    calca: [look.pantsColor, 'creme', 'marrom'],
    sapato: SHOES[look.shoes]?.colors,
  }[slot] || ['cinza', 'cinza', 'cinza'];
  return {
    1: P.fixo, 2: P.pele[look.skin], 3: P.cabelo[look.hairColor], 4: P.olho[look.eyeColor],
    5: P.roupa[cloth[0]], 6: P.roupa[cloth[1]], 7: P.roupa[cloth[2]],
  };
}

/** Chave do cache de cor: só o que muda a cor deste slot. */
export function colorKey(look, slot) {
  const vila = look.village;
  switch (slot) {
    case 'corpo': case 'boca': return look.skin;
    case 'olhos': return `${look.skin}|${look.eyeColor}`;
    case 'cabelo': return `${look.skin}|${look.hairColor}`;
    case 'chapeu': case 'conjunto': return `${look.skin}|${vila}`;
    case 'camisa': return `${look.skin}|${look.shirtColor}|${vila}`;
    case 'calca': return `${look.skin}|${look.pantsColor}`;
    case 'sapato': return `${look.skin}|${look.shoes}`;
    default: return look.skin;
  }
}

/** Direção do jogo (0 baixo, 1 esquerda, 2 direita, 3 cima) -> [vista do atlas, espelhar?]. */
export function viewOf(dir) {
  return dir === 3 ? [2, false] : dir === 1 ? [1, false] : dir === 2 ? [1, true] : [0, false];
}

/**
 * Ações: [animação, quadro, ms]. O ataque básico alterna soco e chute (com a guarda antes e depois); o jutsu
 * faz a preparação, o lançamento e volta (A -> B -> A, quadros 1 e 2 da animação "jutsu").
 */
export const ACTIONS = {
  soco: [['ataque', 1, 80], ['ataque', 0, 170], ['ataque', 1, 110]],
  chute: [['ataque', 1, 80], ['ataque', 2, 230], ['ataque', 1, 110]],
  jutsu: [['jutsu', 1, 110], ['jutsu', 2, 170], ['jutsu', 1, 110]],
  // Ataque Básico com arma equipada: prepara (arma lá atrás), corta e termina o golpe.
  golpe: [['golpe', 0, 90], ['golpe', 1, 120], ['golpe', 2, 150]],
};

/**
 * Animação e quadro do boneco agora. state: { dead, meditating, moving, running, walk (fase da caminhada,
 * rad), act: { kind, start } | null, seed (atraso do "parado", para os bonecos não respirarem juntos) }.
 * Meditando: a pose de carregar chakra (quadro 0 do jutsu), parada.
 */
export function pickFrame(state, now) {
  if (state.dead) return { anim: 'parado', frame: 0 };
  const act = state.act && ACTIONS[state.act.kind];
  if (act) {
    let t = now - state.act.start;
    for (const [anim, frame, ms] of act) {
      if (t < ms) return { anim, frame };
      t -= ms;
    }
  }
  if (state.meditating) return { anim: 'jutsu', frame: 0 };
  if (state.moving) {
    const seq = SPRITES.animacoes.andar.sequencia;
    const step = Math.floor((state.walk || 0) / Math.PI) % seq.length;
    return { anim: state.running ? 'correr' : 'andar', frame: seq[(step + seq.length) % seq.length] };
  }
  const idle = SPRITES.animacoes.parado;
  const total = idle.ms.reduce((a, b) => a + b, 0);
  let t = ((now + (state.seed || 0)) % total + total) % total;
  for (let i = 0; i < idle.sequencia.length; i++) {
    if (t < idle.ms[i]) return { anim: 'parado', frame: idle.sequencia[i] };
    t -= idle.ms[i];
  }
  return { anim: 'parado', frame: 0 };
}

/** Âncoras (pixels da célula 64x96): mão que segura a arma e meio das costas. */
export function anchorsOf(gender, anim, view, frame) {
  return SPRITES.generos[gender]?.ancoras[`${anim}/${view}/${frame}`] || null;
}

// ------------------------------------------------------------------ navegador: atlas, cor e desenho

const atlases = {};           // gênero -> { bytes: Uint8Array, w, h } (canal << 4 | tom por pixel)
let loading = null;

/** Começa a baixar os 2 atlas (uma vez). O jogo desenha o boneco antigo até eles chegarem. */
export function loadSprites(base = '') {
  if (loading || typeof Image === 'undefined') return loading;
  loading = Promise.all(Object.entries(SPRITES.generos).map(([g, info]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0);
        const px = x.getImageData(0, 0, c.width, c.height).data;
        const bytes = new Uint8Array(c.width * c.height);
        for (let i = 0, j = 0; j < bytes.length; i += 4, j++) {
          if (px[i + 3] > 0) bytes[j] = (Math.round(px[i] / 32) << 4) | Math.round(px[i + 1] / 16);
        }
        atlases[g] = { bytes, w: c.width, h: c.height };
      } catch { /* sem canvas: fica no boneco antigo */ }
      resolve();
    };
    img.onerror = () => resolve();
    img.src = base + info.atlas;
  })));
  return loading;
}

export function spritesReady(gender) {
  return !!atlases[gender];
}

const CACHE_MAX = 700;
const cache = new Map();      // célula + cores -> canvas pintado

function cellCanvas(gender, key, rect, ramps, ck) {
  const id = `${gender}/${key}#${ck}`;
  let c = cache.get(id);
  if (c) {                    // usado agora: vai para o fim (o mais antigo sai primeiro)
    cache.delete(id);
    cache.set(id, c);
    return c;
  }
  const atlas = atlases[gender];
  const [x0, y0, w, h] = rect;
  c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const rgb = {};
  for (const [ch, ramp] of Object.entries(ramps)) rgb[ch] = ramp.map(rgbOf);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const b = atlas.bytes[(y0 + y) * atlas.w + x0 + x];
      if (!b) continue;
      const col = rgb[b >> 4]?.[b & 15];
      if (!col) continue;
      const o = (y * w + x) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  cache.set(id, c);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return c;
}

/**
 * Desenha o boneco com o canto de cima-esquerda da célula 64x96 em (left, top) e `scale` px de tela por
 * pixel do sprite. flip = olhando para a direita. onPlane(plano): chamado antes de cada plano e no fim (4),
 * para pôr a arma atrás ou na frente do corpo. Devolve a linha mais alta desenhada (topo da cabeça, em
 * pixels da célula), ou null se o atlas do gênero ainda não chegou.
 */
export function drawCell(g, left, top, scale, look, view, flip, anim, frame, onPlane) {
  const atlas = atlases[look.gender];
  if (!atlas) return null;
  let minY = 96;
  const cells = SPRITES.generos[look.gender].celulas;
  const items = itemsFor(look);
  for (let plane = 0; plane < 4; plane++) {
    if (onPlane) onPlane(plane);
    for (const slot of SPRITES.slots) {
      const list = items[slot];
      if (!list || !list.length) continue;
      let ramps = null, ck = null;
      for (const item of list) {
        const key = `${anim}/${slot}/${item}/${plane}/${view}/${frame}`;
        const rect = cells[key];
        if (!rect) continue;
        if (!ramps) { ramps = rampsFor(look, slot); ck = colorKey(look, slot); }
        const c = cellCanvas(look.gender, key, rect, ramps, ck);
        const [, , w, h, ox, oy] = rect;
        if (oy < minY) minY = oy;
        if (flip) {
          g.save();
          g.translate(left + 64 * scale, top);
          g.scale(-1, 1);
          g.drawImage(c, ox * scale, oy * scale, w * scale, h * scale);
          g.restore();
        } else {
          g.drawImage(c, left + ox * scale, top + oy * scale, w * scale, h * scale);
        }
      }
    }
  }
  if (onPlane) onPlane(4);
  return minY;
}

/**
 * Ícone de um sapato: a própria camada "sapato" do boneco (de lado, parado), recortada e ampliada em escala inteira.
 * false = não é sapato ou o atlas ainda não chegou (quem chama desenha outra coisa).
 */
export function drawShoeIcon(g, code, w, h) {
  const shoe = SHOES[code];
  const gender = 'm';
  if (!shoe || !atlases[gender]) return false;
  const look = { ...DEFAULT_APPEARANCE, shoes: code };
  const cells = SPRITES.generos[gender].celulas;
  const parts = [];
  let x0 = 64, y0 = 96, x1 = 0, y1 = 0;
  for (let plane = 0; plane < 4; plane++) {
    const key = `parado/sapato/${shoe.sprite}/${plane}/1/0`;
    const rect = cells[key];
    if (!rect) continue;
    const [, , rw, rh, ox, oy] = rect;
    parts.push([cellCanvas(gender, key, rect, rampsFor(look, 'sapato'), colorKey(look, 'sapato')), ox, oy]);
    x0 = Math.min(x0, ox); y0 = Math.min(y0, oy); x1 = Math.max(x1, ox + rw); y1 = Math.max(y1, oy + rh);
  }
  if (!parts.length) return false;
  const bw = x1 - x0, bh = y1 - y0;
  const s = Math.max(1, Math.floor(Math.min((w * 0.8) / bw, (h * 0.8) / bh)));
  const left = Math.round((w - bw * s) / 2), top = Math.round((h - bh * s) / 2);
  g.imageSmoothingEnabled = false;
  for (const [c, ox, oy] of parts) g.drawImage(c, left + (ox - x0) * s, top + (oy - y0) * s, c.width * s, c.height * s);
  return true;
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
