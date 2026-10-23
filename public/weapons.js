/*
 * Armas no boneco em pixel art (public/assets/weapons/, geradas por arte/armas-vfx; números em weaponData.js).
 *
 * - Na mão (kunai de treino, kunai, espada curta): 16 ângulos já desenhados. O meio do cabo vai na âncora da
 *   mão e a lâmina segue o antebraço (ângulo que vem com a âncora de cada quadro da animação).
 * - Nas costas (espada longa, Shuriken Gigante, pergaminho): uma arte por vista (frente, lado, costas), com o
 *   meio na âncora das costas mais um deslocamento. De lado olhando para a direita, tudo é espelhado.
 * A ordem de desenho (atrás do corpo, por baixo do cabelo, por cima da mão) é decidida por quem chama.
 */
import { ARMAS } from './weaponData.js';

const imgs = {};
let loading = null;

export function loadWeapons() {
  if (loading) return loading;
  loading = Promise.all(Object.entries(ARMAS.armas).map(([code, a]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { imgs[code] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = `/${a.arquivo}`;
  })));
  return loading;
}

/** Código do item -> arte (todos os pergaminhos de classe usam a mesma). */
export const weaponArt = (code) => (code && code.startsWith('scroll_') ? 'scroll' : code);

/** A arte deste item já carregou? (Senão, o boneco usa o desenho antigo, de retângulos.) */
export const weaponReady = (code) => Boolean(code && imgs[weaponArt(code)]);

/** Onde o item vai: 'mao' ou 'costas' (undefined = item sem arte). */
export const weaponSlot = (code) => ARMAS.armas[weaponArt(code)]?.onde;

/** Quadro do ângulo mais perto (0° = para a direita, sentido horário na tela). */
export function angleFrame(deg) {
  return Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
}

/**
 * Arma na mão: o meio do cabo em (x, y) da tela, apontando para `deg` graus. s = escala do boneco (tela por
 * pixel do boneco). flip: o boneco está espelhado (de lado, olhando para a direita): o ângulo espelha também.
 */
export function drawHandWeapon(g, code, x, y, s, deg, flip, dpr) {
  const a = ARMAS.armas[weaponArt(code)];
  const img = imgs[weaponArt(code)];
  if (!a || !img || a.onde !== 'mao') return;
  const frame = angleFrame(flip ? 180 - deg : deg);
  const [w, h] = a.quadro;
  const [ax, ay] = a.ancora;
  g.drawImage(img, frame * w, 0, w, h, snap(x - ax * s, dpr), snap(y - ay * s, dpr), w * s, h * s);
}

/** Item nas costas: o meio em (x, y) da tela (âncora das costas) + o deslocamento da vista (0 frente, 1 lado, 2 costas). */
export function drawBackWeapon(g, code, x, y, s, view, flip, dpr) {
  const a = ARMAS.armas[weaponArt(code)];
  const img = imgs[weaponArt(code)];
  if (!a || !img || a.onde !== 'costas') return;
  const [w, h] = a.quadro;
  const [ax, ay] = a.ancora;
  const [dx, dy] = a.desloc[view];
  const cx = x + (flip ? -dx : dx) * s;
  const top = snap(y + dy * s - ay * s, dpr);
  if (flip) {
    g.save();
    g.translate(snap(cx + ax * s, dpr), top);
    g.scale(-1, 1);
    g.drawImage(img, view * w, 0, w, h, 0, 0, w * s, h * s);
    g.restore();
  } else {
    g.drawImage(img, view * w, 0, w, h, snap(cx - ax * s, dpr), top, w * s, h * s);
  }
}

const snap = (v, dpr) => Math.round(v * dpr) / dpr;
