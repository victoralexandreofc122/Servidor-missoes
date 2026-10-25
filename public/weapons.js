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

/**
 * Ícone do item (inventário e espaços do equipamento): a arma na diagonal (ou o pergaminho de frente), recortada no
 * que tem desenho e ampliada por um número inteiro (o pixel art não borra), no meio de w x h. false: ainda sem arte.
 */
const iconCache = new Map();
export function drawWeaponIcon(g, code, w, h) {
  let icon = iconCache.get(weaponArt(code));
  if (!icon) {
    const a = sheetOf(code, 'mao') || sheetOf(code, 'costas');
    const img = a && imgs[a.arquivo];
    if (!img) return false;
    const [fw, fh] = a.quadro;
    const frame = a.angulos ? angleFrame(315) : 0;
    const tmp = document.createElement('canvas');
    tmp.width = fw;
    tmp.height = fh;
    const t = tmp.getContext('2d');
    t.drawImage(img, frame * fw, 0, fw, fh, 0, 0, fw, fh);
    const px = t.getImageData(0, 0, fw, fh).data;
    let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (px[(y * fw + x) * 4 + 3] < 16) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 < 0) return false;
    icon = { canvas: tmp, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    iconCache.set(weaponArt(code), icon);
  }
  const s = Math.max(1, Math.floor(Math.min(w / icon.w, h / icon.h)));
  g.imageSmoothingEnabled = false;
  g.drawImage(icon.canvas, icon.x, icon.y, icon.w, icon.h, Math.round((w - icon.w * s) / 2), Math.round((h - icon.h * s) / 2), icon.w * s, icon.h * s);
  return true;
}
