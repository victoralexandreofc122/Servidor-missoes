// O boneco novo no navegador (rig.js + rigArt.js): cada quadro é desenhado UMA vez e guardado em canvas; o boneco vira
// suave entre as 4 direções (16 passos de giro), mistura a pose na troca de animação e encaixa a arma da mão e os
// itens das costas na profundidade certa (o boneco é cortado em fatias: o que está atrás da arma, a arma, o que está
// na frente dela).
//
// As partes sem DOM (quadro de cada instante, giro, chave do cache) são puras e testadas no Node.

import { renderFigure } from './rigArt.js';
import { ANIMS, YAW_OF_DIR, blendPose, pickAnim, poseOf } from './rig.js';

/** Quadros por ciclo (animação em laço) ou por golpe. Mais quadros = mais suave (cada um é desenhado uma vez só). */
export const FRAMES = { parado: 20, andar: 12, correr: 12, meditar: 16, morto: 1, soco: 10, chute: 12, jutsu: 12, golpe: 12, dano: 8 };
/** Passos do giro (16 = de 22,5° em 22,5°). */
export const YAW_STEPS = 16;
/** Velocidade do giro (rad/ms): 90° em ~110 ms. */
const TURN_SPEED = Math.PI / 2 / 110;
/** Duração da mistura de poses na troca de animação. */
export const BLEND_MS = 120;

const TAU = Math.PI * 2;
const wrap = (a) => { let v = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; if (v <= -Math.PI) v += TAU; return v; };

/** Instante t (0..1) -> índice do quadro guardado. */
export function frameIndex(anim, t) {
  const n = FRAMES[anim] || 12;
  if (n <= 1) return 0;
  return ANIMS[anim]?.loop ? Math.floor(t * n) % n : Math.min(n - 1, Math.round(t * (n - 1)));
}
/** Índice do quadro -> instante t. */
export function frameTime(anim, i) {
  const n = FRAMES[anim] || 12;
  if (n <= 1) return 0;
  return ANIMS[anim]?.loop ? i / n : i / (n - 1);
}
/** Ângulo -> passo do giro (0..15). */
export const yawIndex = (yaw) => ((Math.round(wrap(yaw) / (TAU / YAW_STEPS)) % YAW_STEPS) + YAW_STEPS) % YAW_STEPS;
export const yawOfIndex = (i) => wrap((i * TAU) / YAW_STEPS);

/**
 * Gira de `cur` para `target` em `dt` ms pelo caminho mais curto; meia-volta (esquerda <-> direita) passa pela frente.
 */
export function stepYaw(cur, target, dt) {
  let d = wrap(target - cur);
  if (Math.abs(Math.abs(d) - Math.PI) < 0.02 || Math.abs(wrap(cur + d / 2)) > Math.PI / 2 + 0.02) {
    const alt = d > 0 ? d - TAU : d + TAU;
    if (Math.abs(wrap(cur + alt / 2)) < Math.abs(wrap(cur + d / 2))) d = alt;
  }
  const step = TURN_SPEED * Math.max(0, dt);
  if (Math.abs(d) <= step) return wrap(target);
  return wrap(cur + Math.sign(d) * step);
}

/** Quanto a capa e as pontas da bandana voam para trás em cada animação. */
export const flowOf = (anim) => (anim === 'correr' ? 1 : anim === 'andar' ? 0.35 : anim === 'golpe' || anim === 'chute' ? 0.3 : 0.06);

/** Só o que muda o desenho do boneco (a chave do cache). */
export function lookKey(look, opts = {}) {
  return [look.gender, look.skin, look.hairStyle, look.hairColor, look.eyeStyle, look.eyeColor, look.outfit, look.shirtColor,
    look.pantsColor, look.bandana ? 1 : 0, look.village, look.shoes || '-', opts.cape || '-', opts.cape ? opts.capeVillage || '-' : '-',
    opts.renegade ? 1 : 0].join('|');
}

// ------------------------------------------------------------------ navegador: cache de quadros e desenho

const CACHE_MAX = 900;
const cache = new Map();
let budget = { at: -1, ms: 0 };

function sliceCanvas(fig, lo, hi) {
  let x0 = 64, y0 = 96, x1 = -1, y1 = -1;
  const { rgba, depth } = fig;
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 64; x++) {
      const i = y * 64 + x;
      if (!rgba[i * 4 + 3] || depth[i] <= lo || depth[i] > hi) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y0 + y) * 64 + x0 + x;
      if (!rgba[i * 4 + 3] || depth[i] <= lo || depth[i] > hi) continue;
      const o = (y * w + x) * 4;
      img.data[o] = rgba[i * 4]; img.data[o + 1] = rgba[i * 4 + 1]; img.data[o + 2] = rgba[i * 4 + 2]; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { c, x: x0, y: y0, w, h };
}

/** Quadro pronto: as fatias (de trás para a frente) e a ordem dos itens entre elas. */
function buildFrame(look, pose, yaw, opts, cuts, flow, phase) {
  const fig = renderFigure(look, pose, yaw, { cape: opts.cape, capeVillage: opts.capeVillage, renegade: opts.renegade, flow, phase });
  const depthOf = { hand: fig.anchors.hand[2], back: fig.anchors.back[2] };
  const order = cuts.filter((k) => depthOf[k] !== undefined).sort((a, b) => depthOf[a] - depthOf[b]);
  const bounds = [-Infinity, ...order.map((k) => depthOf[k]), Infinity];
  const slices = [];
  for (let i = 0; i + 1 < bounds.length; i++) slices.push(sliceCanvas(fig, bounds[i], bounds[i + 1]));
  return { slices, order, anchors: fig.anchors, top: fig.top };
}

function cached(key, make) {
  let f = cache.get(key);
  if (f) {
    cache.delete(key);
    cache.set(key, f);
    return f;
  }
  f = make();
  cache.set(key, f);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return f;
}

/**
 * Desenha o boneco com o canto de cima-esquerda da célula 64 x 96 em (left, top), `s` px de tela por pixel do boneco.
 * p: o estado de quem é desenhado (moving, running, walk, act, meditating, dead, seed); o giro e a mistura ficam em
 * `p._fig`. look: visual (+ shoes). dir: 0 baixo, 1 esquerda, 2 direita, 3 cima.
 * opts: { cape, capeVillage, renegade, instant (sem giro suave), hand(x, y, graus), back(x, y, vista, espelhar) }.
 * As posições passadas para hand/back já estão na tela. Devolve { top: linha mais alta (tela), anim }.
 */
export function drawFigure(g, p, left, top, s, look, dir, now, opts = {}) {
  const { anim, t } = pickAnim(p, now);
  const target = YAW_OF_DIR[dir] ?? 0;
  const f = p._fig || (p._fig = { yaw: target, at: now, anim, t, from: null });
  f.yaw = opts.instant ? target : stepYaw(f.yaw, target, now - f.at);
  f.at = now;
  if (f.anim !== anim) {
    f.from = { anim: f.anim, t: f.t, start: now };
    f.anim = anim;
  }
  f.t = t;
  const yi = yawIndex(f.yaw);
  const fi = frameIndex(anim, t);
  const cuts = [];
  if (opts.back) cuts.push('back');
  if (opts.hand) cuts.push('hand');
  const flow = flowOf(anim);
  const lk = lookKey(look, opts);
  if (budget.at !== now) budget = { at: now, ms: 0 };
  let frame = null;
  // Troca de animação: alguns quadros misturando a pose de antes com a nova (desenhados na hora, sem guardar).
  if (f.from && now - f.from.start < BLEND_MS && !opts.instant && budget.ms < 6 && f.from.anim !== 'morto' && anim !== 'morto') {
    const k = (now - f.from.start) / BLEND_MS;
    const pose = blendPose(poseOf(f.from.anim, f.from.t), poseOf(anim, frameTime(anim, fi)), k * k * (3 - 2 * k));
    const t0 = performance.now();
    frame = buildFrame(look, pose, yawOfIndex(yi), opts, cuts, flow, t);
    budget.ms += performance.now() - t0;
  }
  if (!frame) {
    if (f.from && now - f.from.start >= BLEND_MS) f.from = null;
    const key = `${lk}#${anim}:${fi}:${yi}:${cuts.join('')}`;
    frame = cached(key, () => {
      const t0 = performance.now();
      const out = buildFrame(look, poseOf(anim, frameTime(anim, fi)), yawOfIndex(yi), opts, cuts, flow, frameTime(anim, fi));
      budget.ms += performance.now() - t0;
      return out;
    });
  }
  const an = frame.anchors;
  const items = {
    hand: () => opts.hand(left + an.hand[0] * s, top + an.hand[1] * s, an.hand[3]),
    back: () => opts.back(left + an.back[0] * s, top + an.back[1] * s, an.view, an.flip),
  };
  frame.slices.forEach((sl, i) => {
    if (i > 0) items[frame.order[i - 1]]();
    if (sl) g.drawImage(sl.c, left + sl.x * s, top + sl.y * s, sl.w * s, sl.h * s);
  });
  return { top: top + frame.top * s, anim };
}

/** Boneco parado de frente num canvas próprio (retrato, ícones do visual): a célula inteira, escala 1. */
export function figureCanvas(look, opts = {}) {
  const key = `${lookKey(look, opts)}#estatico:${opts.dir ?? 0}:${opts.only ? opts.only.join('+') : ''}`;
  return cached(key, () => {
    const fig = renderFigure(look, poseOf('parado', 0.1), YAW_OF_DIR[opts.dir ?? 0], { cape: opts.cape, capeVillage: opts.capeVillage, only: opts.only });
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 96;
    const g = c.getContext('2d');
    const img = g.createImageData(64, 96);
    img.data.set(fig.rgba);
    g.putImageData(img, 0, 0);
    return { slices: [{ c, x: 0, y: 0, w: 64, h: 96 }], order: [], anchors: fig.anchors, top: fig.top, canvas: c };
  }).canvas;
}
