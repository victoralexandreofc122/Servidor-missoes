/*
 * Armas no boneco em pixel art (public/assets/weapons/, geradas por arte/armas-vfx; números em weaponData.js).
 *
 * Cada arma tem a arte de onde ela fica parada (`onde`: mão ou costas):
 * - `mao`: 16 ângulos já desenhados; o centro do quadro é o punho (vai na âncora da mão) e a lâmina aponta para o
 *   ângulo que vem com a âncora de cada quadro da animação.
 * - `costas`: uma arte por vista (frente, lado, costas), com o meio na âncora das costas mais um deslocamento.
 * As armas das costas também têm `mao` (a espada desembainhada, a Shuriken Gigante na mão) para o golpe, e a
 * espada tem a `bainha` vazia, que fica nas costas enquanto ela está na mão.
 * De lado olhando para a direita, tudo é espelhado. A ordem de desenho (atrás do corpo, debaixo do braço) é
 * decidida por quem chama.
 */
import { ARMAS } from './weaponData.js';

const imgs = {};
let loading = null;

export function loadWeapons() {
  if (loading) return loading;
  const sheets = [];
  for (const a of Object.values(ARMAS.armas)) for (const k of ['mao', 'costas', 'bainha']) if (a[k]) sheets.push(a[k].arquivo);
  loading = Promise.all(sheets.map((file) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { imgs[file] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = `/${file}`;
  })));
  return loading;
}

/** Código do item -> arte (todos os pergaminhos de classe usam a mesma). */
export const weaponArt = (code) => (code && code.startsWith('scroll_') ? 'scroll' : code);

const sheetOf = (code, kind) => ARMAS.armas[weaponArt(code)]?.[kind];

/** A arte deste item (na mão ou nas costas) já carregou? Senão, o boneco usa o desenho antigo, de retângulos. */
export function weaponReady(code, kind) {
  const a = code && ARMAS.armas[weaponArt(code)];
  const sheet = a && a[kind ?? (a.onde === 'mao' ? 'mao' : 'costas')];
  return Boolean(sheet && imgs[sheet.arquivo]);
}

/** Onde o item fica parado: 'mao' ou 'costas' (undefined = item sem arte). */
export const weaponSlot = (code) => ARMAS.armas[weaponArt(code)]?.onde;

/** A arma das costas vai para a mão no golpe? (espada, Shuriken Gigante; o pergaminho, não) */
export const drawnForStrike = (code) => Boolean(sheetOf(code, 'mao')) && weaponSlot(code) === 'costas';

/** Arma de arremesso (Shuriken Gigante): sai da mão no lançamento e some das costas enquanto voa. */
export const isThrown = (code) => Boolean(code && ARMAS.armas[weaponArt(code)]?.lanca);

/** Quadro do ângulo mais perto (0° = para a direita, sentido horário na tela). */
export function angleFrame(deg) {
  return Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
}

/**
 * Arma na mão: o punho em (x, y) da tela, a lâmina apontando para `deg` graus. s = escala do boneco (tela por
 * pixel do boneco). flip: o boneco está espelhado (de lado, olhando para a direita): o ângulo espelha também.
 */
export function drawHandWeapon(g, code, x, y, s, deg, flip, dpr) {
  const a = sheetOf(code, 'mao');
  const img = a && imgs[a.arquivo];
  if (!img) return;
  const frame = angleFrame(flip ? 180 - deg : deg);
  const [w, h] = a.quadro;
  const [ax, ay] = a.ancora;
  g.drawImage(img, frame * w, 0, w, h, snap(x - ax * s, dpr), snap(y - ay * s, dpr), w * s, h * s);
}

/**
 * Item nas costas: o meio em (x, y) da tela (âncora das costas) + o deslocamento da vista (0 frente, 1 lado,
 * 2 costas). empty: só a bainha (a espada está na mão).
 */
export function drawBackWeapon(g, code, x, y, s, view, flip, dpr, empty = false) {
  const a = sheetOf(code, empty ? 'bainha' : 'costas');
  const img = a && imgs[a.arquivo];
  if (!img) return;
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
