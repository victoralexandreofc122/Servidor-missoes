/*
 * Efeitos visuais dos golpes (VFX): folhas de sprite em public/assets/vfx/, geradas por arte/armas-vfx
 * (os números de cada folha ficam em vfxData.js).
 *
 * SÓ VISUAL. Quem acertou quem é sempre o servidor (hitboxes em src/realtime/combat.ts). O cliente toca
 * o efeito quando a mensagem chega (cast, attack, projectile, impact...), na posição que o servidor mandou.
 *
 * - Pixel art: cada pixel do efeito vale `px` pixels do boneco, na mesma escala dele (spriteScale).
 * - Efeitos com direção (corte, água, raio, sombra, projéteis) são desenhados apontando para a DIREITA e
 *   girados aqui. Raio e Sombra (`linha`) são cortados no comprimento real, até onde bateram.
 * - Projéteis: andam sozinhos na tela (velocidade e alcance do servidor) até chegar o `impact`.
 */
import { VFX } from './vfxData.js';
import { spriteScale } from './sprites.js';

const sheets = {};
let loading = null;

/** Carrega todas as folhas (uma vez). Falhou alguma: o jogo usa os efeitos desenhados à mão. */
export function loadVfx() {
  if (loading) return loading;
  loading = Promise.all(Object.entries(VFX.efeitos).map(([name, e]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { sheets[name] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = `/${e.arquivo}`;
  })));
  return loading;
}

export const vfxReady = (name) => Boolean(sheets[name]);

/** Duração de um efeito (ms): quadros x tempo de cada quadro. */
export const vfxDuration = (name) => (VFX.efeitos[name] ? VFX.efeitos[name].quadros * VFX.efeitos[name].ms : 0);

/** Pés do boneco: meia casa abaixo do centro (efeitos de chão: poeira, cura, pedra, amarra). */
const FEET = 0.42;

export class VFXManager {
  constructor() {
    /** { name, x, y, angle, scale, length, layer, start, end } */
    this.list = [];
    /** id do servidor -> projétil voando */
    this.shots = new Map();
  }

  clear() {
    this.list.length = 0;
    this.shots.clear();
  }

  /**
   * Toca um efeito em (x, y), em casas. Opções: start (ms), angle (radianos), scale, length (casas, só
   * nos de linha), layer ('ground' por baixo dos bonecos, 'top' por cima), feet (no pé), delay (ms).
   * Devolve false se a folha não carregou (quem chamou desenha o efeito antigo).
   */
  play(name, x, y, opts = {}) {
    const e = VFX.efeitos[name];
    if (!e || !sheets[name]) return false;
    const start = (opts.start ?? performance.now()) + (opts.delay ?? 0);
    this.list.push({
      name, x, y: y + (opts.feet ? FEET : 0), angle: opts.angle ?? 0, scale: opts.scale ?? 1, length: opts.length,
      layer: opts.layer ?? 'top', start, end: start + e.quadros * e.ms,
    });
    return true;
  }

  /** Projétil saindo (mensagem `projectile`): voa na direção (fx, fy) até o alcance ou o `impact`. */
  launch(id, name, x, y, fx, fy, speed, range, start, scale = 1) {
    if (!sheets[name]) return false;
    this.shots.set(id, { name, x, y, fx, fy, speed, range, start, scale, until: start + (range / Math.max(0.1, speed)) * 1000 + 400 });
    return true;
  }

  /** O servidor disse que o projétil bateu: some (quem chamou toca a explosão ou a faísca). */
  land(id) {
    this.shots.delete(id);
  }

  /** Desenha os efeitos de uma camada. toX/toY: casa -> tela. T: casa em px. */
  draw(g, layer, toX, toY, T, dpr, now) {
    const s = spriteScale(T, dpr);
    let alive = 0;
    for (const fx of this.list) {
      if (now >= fx.end) continue;
      this.list[alive++] = fx;
      if (fx.layer !== layer || now < fx.start) continue;
      const e = VFX.efeitos[fx.name];
      const frame = Math.min(e.quadros - 1, Math.floor((now - fx.start) / e.ms));
      drawFrame(g, sheets[fx.name], e, frame, toX(fx.x), toY(fx.y), s * e.px * fx.scale, fx.angle, dpr, fx.length);
    }
    this.list.length = alive;
    if (layer !== 'top') return;
    for (const [id, p] of this.shots) {
      if (now > p.until) { this.shots.delete(id); continue; }
      const e = VFX.efeitos[p.name];
      const d = Math.min(p.range, (p.speed * Math.max(0, now - p.start)) / 1000);
      const frame = Math.floor(Math.max(0, now - p.start) / e.ms) % e.quadros;
      drawFrame(g, sheets[p.name], e, frame, toX(p.x + p.fx * d), toY(p.y + p.fy * d), s * e.px * (p.scale ?? 1), Math.atan2(p.fy, p.fx), dpr);
    }
  }
}

/** Um quadro da folha com a âncora em (sx, sy). k = pixels de tela por pixel do efeito. */
function drawFrame(g, img, e, frame, sx, sy, k, angle, dpr, length) {
  const [w, h] = e.quadro;
  const [ax, ay] = e.ancora;
  // Linha (Raio, Sombra): corta a folha no comprimento real, em pixels do efeito.
  const cw = e.linha && length !== undefined ? Math.max(1, Math.min(w, Math.round((length * VFX.casaPx) / e.px) + 2)) : w;
  if (e.gira && Math.abs(angle) > 1e-3) {
    g.save();
    g.translate(sx, sy);
    g.rotate(angle);
    g.drawImage(img, frame * w, 0, cw, h, -ax * k, -ay * k, cw * k, h * k);
    g.restore();
    return;
  }
  // Sem girar: canto no pixel do aparelho (pixel art sem borrar).
  const left = Math.round((sx - ax * k) * dpr) / dpr;
  const top = Math.round((sy - ay * k) * dpr) / dpr;
  g.drawImage(img, frame * w, 0, cw, h, left, top, cw * k, h * k);
}
