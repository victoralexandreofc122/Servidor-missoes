/*
 * Sprites desenhados pelo Victor para 6 jutsus (Academia e Fogo T1), 3 quadros cada, em public/assets/vfx/<nome>_0N.png:
 *
 *   quadro 1: o lançamento (na mão de quem lançou)
 *   quadro 2: o golpe ativo (o projétil voando, o cone, a linha, a nuvem, a fumaça)
 *   quadro 3: o fim (explosão, brasas apagando, o tronco no chão)
 *
 * SÓ VISUAL, como o vfx.js: o servidor decide quem acerta; aqui só se toca o quadro certo na hora certa. Cada sprite
 * tem o tamanho em CASAS (o mesmo em qualquer tela) e um modo de mistura: 'glow' desenha normal e soma um brilho por
 * cima (fogo, faísca); 'screen' clareia (fumaça, névoa); o resto é normal. Faltou carregar: quem chamou desenha o antigo.
 * As partículas (brasas no voo, fumaça e faíscas no impacto) continuam vindo do particles.js.
 */

/** Os quadros: [largura em casas, âncora x, âncora y (em pixels da imagem; null = centro), mistura]. */
export const FRAMES = {
  fogo_01: { casas: 0.75, blend: 'glow' },
  fogo_02: { casas: 1.25, ancora: [41, 7], arte: -0.675, blend: 'glow' },     // a arte aponta para cima e à direita
  fogo_03: { casas: 2.6, blend: 'glow' },
  sopro_01: { casas: 0.5, blend: 'glow' },
  sopro_02: { casas: 3, ancora: [0, 44], arte: 0, blend: 'glow' },           // cone com a ponta na mão
  sopro_03: { casas: 2.4, ancora: [0, 22], arte: 0, blend: 'screen' },
  nevoa_01: { casas: 4.4, blend: 'screen', alpha: 0.85 },
  nevoa_02: { casas: 4.4, blend: 'screen', alpha: 0.95 },
  nevoa_03: { casas: 5.6, blend: 'glow' },
  linha_01: { casas: 0.35, blend: 'glow' },
  linha_02: { casas: 2.2, blend: 'glow', pe: true },                          // em pé, repetida ao longo da linha
  linha_03: { casas: 1.8, blend: 'screen', pe: true },
  teleporte_01: { casas: 0.7, blend: 'screen' },
  teleporte_02: { casas: 1.6, blend: 'screen' },
  teleporte_03: { casas: 2.1, blend: 'lighter' },
  substituicao_01: { casas: 2.3, blend: 'normal' },
  substituicao_02: { casas: 2, blend: 'normal' },
  substituicao_03: { casas: 1.8, blend: 'normal', pe: true },
};

const imgs = {};
let loading = null;

/** Preload: todos os quadros, uma vez (o jogo segue enquanto chegam). */
export function loadJutsuSprites() {
  if (loading) return loading;
  loading = Promise.all(Object.keys(FRAMES).map((name) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { imgs[name] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = `/assets/vfx/${name}.png`;
  })));
  return loading;
}

/** Os 3 quadros daquele jutsu chegaram? */
export const jutsuSpritesReady = (base) => [1, 2, 3].every((i) => imgs[`${base}_0${i}`]);

/** Quadros por segundo da tremida (o mesmo quadro espelhado e balançando, para o fogo não ficar parado). */
export const FLICKER_FPS = 12;

export class JutsuSprites {
  constructor() {
    /** { name, x, y, angle, scale, start, end, fadeIn, fadeOut, flicker, layer } */
    this.list = [];
    /** projéteis com sprite: id -> { name, x, y, fx, fy, speed, range, start, until } */
    this.shots = new Map();
  }

  clear() { this.list.length = 0; this.shots.clear(); }

  /** Toca um quadro em (x, y) (casas) de `start` até `start + ms`. */
  show(name, x, y, start, ms, opts = {}) {
    if (!imgs[name]) return false;
    this.list.push({ name, x, y, start, end: start + ms, angle: opts.angle ?? 0, scale: opts.scale ?? 1, fadeIn: opts.fadeIn ?? 60, fadeOut: opts.fadeOut ?? 120,
      flicker: opts.flicker ?? false, grow: opts.grow ?? 0, layer: opts.layer ?? 'top' });
    return true;
  }

  launch(id, name, x, y, fx, fy, speed, range, start) {
    if (!imgs[name]) return false;
    this.shots.set(id, { name, x, y, fx, fy, speed, range, start, until: start + (range / Math.max(0.1, speed)) * 1000 + 400 });
    return true;
  }

  /** Onde o projétil está agora (para a explosão sair do lugar certo se o impacto não trouxer posição). */
  land(id) { this.shots.delete(id); }

  draw(g, layer, toX, toY, T, now) {
    let alive = 0;
    for (const s of this.list) {
      if (now >= s.end) continue;
      this.list[alive++] = s;
      if (s.layer !== layer || now < s.start) continue;
      const k = Math.min(1, (now - s.start) / Math.max(1, s.fadeIn), (s.end - now) / Math.max(1, s.fadeOut));
      const life = (now - s.start) / Math.max(1, s.end - s.start);
      drawSprite(g, s.name, toX(s.x), toY(s.y), T, s.angle, s.scale * (1 + s.grow * life), Math.max(0, k), s.flicker ? now : 0);
    }
    this.list.length = alive;
    if (layer !== 'top') return;
    for (const [id, p] of this.shots) {
      if (now > p.until) { this.shots.delete(id); continue; }
      const d = Math.min(p.range, (p.speed * Math.max(0, now - p.start)) / 1000);
      drawSprite(g, p.name, toX(p.x + p.fx * d), toY(p.y + p.fy * d), T, Math.atan2(p.fy, p.fx), 1, 1, now);
    }
  }
}

/**
 * Um quadro. angle: para onde o golpe vai (radianos; a arte é girada a partir da direção em que foi desenhada).
 * flickerNow: > 0 faz o fogo "respirar" (escala e espelho a FLICKER_FPS), já que cada fase tem um quadro só.
 */
function drawSprite(g, name, sx, sy, T, angle, scale, alpha, flickerNow) {
  const img = imgs[name];
  const f = FRAMES[name];
  if (!img || !f || alpha <= 0) return;
  const w = f.casas * T * scale;
  const k = w / img.width;
  const h = img.height * k;
  const [ax, ay] = f.ancora ?? [img.width / 2, f.pe ? img.height : img.height / 2];
  let sxk = 1, syk = 1;
  if (flickerNow) {
    const step = Math.floor(flickerNow / (1000 / FLICKER_FPS));
    syk = 1 + ((step % 3) - 1) * 0.06;
    sxk = 1 - ((step % 3) - 1) * 0.03;
  }
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(sx, sy);
  if (f.arte !== undefined) {
    g.rotate(angle - f.arte);
    // apontando para a esquerda: espelha em vez de ficar de cabeça para baixo
    if (Math.cos(angle) < -0.01 && f.arte === 0) g.scale(1, -1);
  }
  g.scale(sxk, syk);
  const pass = (mode, a) => {
    g.globalCompositeOperation = mode;
    g.globalAlpha = a;
    g.drawImage(img, -ax * k, -ay * k, w, h);
  };
  const a = alpha * (f.alpha ?? 1);
  if (f.blend === 'glow') { pass('source-over', a); pass('lighter', a * 0.35); }
  else if (f.blend === 'screen') pass('screen', a);
  else if (f.blend === 'lighter') pass('lighter', a);
  else pass('source-over', a);
  g.restore();
}
