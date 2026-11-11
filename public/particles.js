// v47: partículas dos jutsus (Opção A: procedurais). Só visual: o servidor não sabe de nada disto.
//
// Um sistema só para os 100 jutsus: cada ELEMENTO tem o seu jeito (fogo: brasas que sobem; água: gotas que caem; raio:
// riscos elétricos; terra: poeira e pedras; vento: riscos claros e folhas; sombra e ilusão: fumaça escura e roxa; cura:
// brilhos verdes; taijutsu: poeira e onda de choque; armas: faíscas de metal) e cada FORMA do jutsu escolhe o emissor
// (estouro, rastro, cone, linha, anel, aura, zona). Unidades: casas e segundos. Funções puras (sem DOM): o jogo usa no
// navegador e os testes no Node; o desenho recebe o contexto do canvas.

/** Teto de partículas vivas por qualidade (celular fraco: 'low' ou 'off' em Config.). */
export const PARTICLE_CAP = { full: 520, low: 180, off: 0 };
const RATE = { full: 1, low: 0.4, off: 0 };
/** Ajuste geral (conferido no jogo: com menos que isto os efeitos quase não se viam no celular). */
const SIZE = 1.7, LIFE = 1.45;

/**
 * Cada elemento: cores, a forma da partícula, para onde ela tende (g > 0 cai, g < 0 sobe), quanto dura e se brilha.
 * shape: dot (ponto), spark (risco curto na direção do movimento), streak (risco longo), smoke (bola que cresce e some),
 * bolt (zigue-zague elétrico), leaf (folha girando), rock (pedra), plus (cruz de cura).
 */
export const ELEMENTS = {
  fire: { colors: ['#ffd27a', '#ff9a3c', '#ff5a1f', '#c8320a'], shape: 'dot', g: -2.2, life: [0.35, 0.8], size: [0.07, 0.16], speed: [0.6, 2.4], glow: true, extra: { shape: 'smoke', colors: ['#3a2a24'], share: 0.18 } },
  water: { colors: ['#d6f0ff', '#7cc8ff', '#3ca6ff', '#1f6fd0'], shape: 'dot', g: 5.5, life: [0.35, 0.75], size: [0.06, 0.13], speed: [1.2, 3.4], glow: false, extra: { shape: 'spark', colors: ['#bfe6ff'], share: 0.3 } },
  lightning: { colors: ['#ffffff', '#fff27a', '#9fd4ff'], shape: 'bolt', g: 0, life: [0.16, 0.36], size: [0.3, 0.7], speed: [0.4, 2], glow: true, extra: { shape: 'dot', colors: ['#fff9c4'], share: 0.35 } },
  stone: { colors: ['#c9a678', '#9a7448', '#6e5334'], shape: 'rock', g: 7, life: [0.4, 0.8], size: [0.07, 0.15], speed: [1.2, 3.2], glow: false, extra: { shape: 'smoke', colors: ['#bfa98a'], share: 0.4 } },
  wind: { colors: ['#ffffff', '#d8fff0', '#9fe8c8'], shape: 'streak', g: 0, life: [0.2, 0.45], size: [0.3, 0.7], speed: [2.5, 5.5], glow: false, extra: { shape: 'leaf', colors: ['#7fd08a', '#b7e08a'], share: 0.22 } },
  shadow: { colors: ['#2a2140', '#3b2a5c', '#120c1e'], shape: 'smoke', g: -0.6, life: [0.5, 1.1], size: [0.12, 0.24], speed: [0.3, 1.3], glow: false, extra: { shape: 'dot', colors: ['#8b7ad8'], share: 0.2 } },
  illusion: { colors: ['#c9a8ff', '#a072ff', '#5a2fb0'], shape: 'smoke', g: -0.9, life: [0.45, 1], size: [0.12, 0.28], speed: [0.4, 1.6], glow: true, extra: { shape: 'dot', colors: ['#f0d8ff'], share: 0.35 } },
  heal: { colors: ['#d8ffe0', '#8cf0a0', '#5fe07a'], shape: 'plus', g: -1.6, life: [0.5, 1], size: [0.08, 0.16], speed: [0.2, 1], glow: true, extra: { shape: 'dot', colors: ['#eafff0'], share: 0.4 } },
  taijutsu: { colors: ['#fff3c4', '#f2b13a', '#d98a1e'], shape: 'spark', g: 1.5, life: [0.15, 0.35], size: [0.2, 0.45], speed: [2.5, 5], glow: true, extra: { shape: 'smoke', colors: ['#cdbb9a'], share: 0.3 } },
  weapons: { colors: ['#ffffff', '#e6edf2', '#ffd27a'], shape: 'spark', g: 3, life: [0.12, 0.3], size: [0.16, 0.36], speed: [2.5, 5.5], glow: true, extra: { shape: 'dot', colors: ['#c9d2da'], share: 0.2 } },
  neutral: { colors: ['#ffffff', '#fff3c4'], shape: 'spark', g: 1, life: [0.12, 0.28], size: [0.16, 0.34], speed: [2, 4.5], glow: true },
};

/** Zona no chão (mensagem `ground`) -> elemento. O 'aviso' usa o elemento do jutsu que avisou. */
export const GROUND_ELEMENT = { fogo: 'fire', lama: 'stone', cura: 'heal', agua: 'water', sombra: 'shadow', ilusao: 'illusion', armas: 'weapons', raio: 'lightning', vento: 'wind' };

/** O elemento de um jutsu: a mecânica dele (clãs: Rubro = fogo, Umbra = sombra); o que não tem, neutro. */
export function elementOf(mechanic) {
  return ELEMENTS[mechanic] ? mechanic : mechanic === 'teleport' || mechanic === 'substitution' ? 'wind' : 'neutral';
}

const lerp = (a, b, k) => a + (b - a) * k;
/** Formas compridas: o tamanho delas é um comprimento; o ponto ou a fumaça do mesmo elemento sai bem menor. */
const LONG = new Set(['bolt', 'streak', 'spark']);

export class Particles {
  constructor(random = Math.random) {
    this.random = random;
    this.list = [];
    this.quality = 'full';
    /** Sobra do ritmo dos emissores contínuos (aura, zona, rastro), por chave. */
    this.debt = new Map();
  }

  setQuality(q) {
    this.quality = PARTICLE_CAP[q] !== undefined ? q : 'full';
    if (this.quality === 'off') this.clear();
  }

  clear() {
    this.list.length = 0;
    this.debt.clear();
  }

  get count() { return this.list.length; }

  /** Quantas sair, respeitando a qualidade e o teto. */
  amount(n) {
    const want = Math.round(n * RATE[this.quality]);
    return Math.max(0, Math.min(want, PARTICLE_CAP[this.quality] - this.list.length));
  }

  /** Emissor contínuo: `perSecond` partículas por segundo, sem depender do ritmo dos quadros. */
  flow(key, perSecond, dt) {
    const total = (this.debt.get(key) ?? 0) + perSecond * dt * RATE[this.quality];
    const n = Math.floor(total);
    this.debt.set(key, total - n);
    return Math.max(0, Math.min(n, PARTICLE_CAP[this.quality] - this.list.length));
  }

  /** Uma partícula do elemento em (x, y), saindo no ângulo `a` (radianos) com a força `k`. */
  one(element, x, y, a, k = 1, over = {}) {
    const e = ELEMENTS[element] ?? ELEMENTS.neutral;
    const r = this.random;
    const useExtra = e.extra && r() < e.extra.share;
    const colors = useExtra ? e.extra.colors : e.colors;
    const shape = over.shape ?? (useExtra ? e.extra.shape : e.shape);
    const speed = lerp(e.speed[0], e.speed[1], r()) * k * (shape === 'smoke' ? 0.5 : 1);
    this.list.push({
      x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, g: over.g ?? (shape === 'smoke' ? -0.5 : e.g),
      age: 0, life: lerp(e.life[0], e.life[1], r()) * (over.life ?? 1) * LIFE, size: lerp(e.size[0], e.size[1], r()) * (over.size ?? 1) * SIZE * (shape === 'leaf' ? 0.35 : LONG.has(e.shape) && !LONG.has(shape) ? 0.28 : 1),
      color: over.color ?? colors[Math.floor(r() * colors.length) % colors.length], shape, glow: over.glow ?? (e.glow && shape !== 'smoke'),
      rot: r() * Math.PI * 2, spin: (r() - 0.5) * 8, seed: r(),
    });
  }

  /** Estouro em todas as direções (impacto, explosão, acerto). `power` 1 = golpe comum; 2 a 3 = explosão. */
  burst(element, x, y, power = 1, radius = 0) {
    const n = this.amount(16 * power + radius * 9);
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2, d = radius * Math.sqrt(this.random());
      this.one(element, x + Math.cos(a) * d * 0.5, y + Math.sin(a) * d * 0.5, a, 0.7 + power * 0.35);
    }
  }

  /** Faísca de acerto: curta, forte, para o lado contrário de quem bateu (ou para todos os lados). */
  spark(element, x, y, fromX, fromY) {
    const n = this.amount(14);
    const base = fromX === undefined ? null : Math.atan2(y - fromY, x - fromX);
    for (let i = 0; i < n; i++) {
      const a = base === null ? this.random() * Math.PI * 2 : base + (this.random() - 0.5) * 1.7;
      this.one(element, x, y, a, 1.25, { shape: i % 3 === 0 ? undefined : 'spark', life: 0.7 });
    }
    // o clarão no alvo (o "flash" de quem levou o golpe)
    if (this.quality !== 'off') this.list.push({ x, y, vx: 0, vy: 0, g: 0, age: 0, life: 0.18, size: 0.7, color: '#ffffff', shape: 'flash', glow: true, rot: 0, spin: 0, seed: 0 });
  }

  /** Rastro de um projétil voando: poucas partículas para trás, a cada quadro. */
  trail(element, x, y, fx, fy, dt, key = 'trail') {
    const n = this.flow(key, 38, dt);
    const back = Math.atan2(-fy, -fx);
    for (let i = 0; i < n; i++) this.one(element, x + (this.random() - 0.5) * 0.25, y + (this.random() - 0.5) * 0.25, back + (this.random() - 0.5) * 1.1, 0.45, { life: 0.7 });
  }

  /** Cone à frente (sopro, rajada, rasteira): partículas saindo no leque. */
  cone(element, x, y, fx, fy, range, deg) {
    const n = this.amount(24 + range * 8);
    const a0 = Math.atan2(fy, fx), half = ((deg || 90) * Math.PI) / 360;
    for (let i = 0; i < n; i++) {
      const a = a0 + (this.random() * 2 - 1) * half, d = this.random() * range * 0.45;
      this.one(element, x + Math.cos(a) * d, y + Math.sin(a) * d, a, 1 + range * 0.18);
    }
  }

  /** Linha de (x, y) a (tx, ty): partículas ao longo dela, saindo para os lados. */
  line(element, x, y, tx, ty, width = 0) {
    const len = Math.hypot(tx - x, ty - y);
    const n = this.amount(12 + len * 8 + width * 8);
    const dir = Math.atan2(ty - y, tx - x);
    for (let i = 0; i < n; i++) {
      const k = this.random(), side = (this.random() - 0.5) * width;
      this.one(element, lerp(x, tx, k) - Math.sin(dir) * side, lerp(y, ty, k) + Math.cos(dir) * side, dir + (this.random() < 0.5 ? 1 : -1) * (Math.PI / 2) + (this.random() - 0.5) * 0.8, 0.5);
    }
  }

  /** Anel em volta de (x, y): partículas na borda do raio, indo para fora. */
  ring(element, x, y, radius) {
    const n = this.amount(18 + radius * 10);
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + this.random() * 0.3, d = radius * (0.55 + 0.45 * this.random());
      this.one(element, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85, a, 0.7);
    }
  }

  /** Aura dos selos: partículas subindo em volta de quem conjura (a cada quadro). */
  aura(element, x, y, dt, key) {
    const n = this.flow(key, 26, dt);
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2, d = 0.3 + this.random() * 0.25;
      this.one(element, x + Math.cos(a) * d, y + 0.35 + Math.sin(a) * d * 0.4, -Math.PI / 2 + (this.random() - 0.5) * 0.7, 0.55, { g: -1.4, life: 0.9, size: 0.8 });
    }
  }

  /** Zona no chão ou aviso: partículas soltas dentro do círculo (a cada quadro). */
  zone(element, x, y, radius, dt, key) {
    const n = this.flow(key, 6 + radius * radius * 2.2, dt);
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2, d = radius * Math.sqrt(this.random());
      this.one(element, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85, -Math.PI / 2 + (this.random() - 0.5) * 1.6, 0.4, { life: 0.9 });
    }
  }

  /** Anda o tempo: gravidade, atrito e fim da vida. */
  step(dt) {
    let alive = 0;
    for (const p of this.list) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vy += p.g * dt;
      const drag = p.shape === 'smoke' ? 0.9 : 0.985;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      this.list[alive++] = p;
    }
    this.list.length = alive;
    if (this.debt.size > 200) this.debt.clear();
  }

  /** Desenha tudo. toX/toY: casa -> tela; T: casa em px. As que brilham somam luz ('lighter'). */
  draw(g, toX, toY, T, viewW = Infinity, viewH = Infinity) {
    if (this.list.length === 0) return;
    g.save();
    g.lineCap = 'round';
    for (const pass of [false, true]) {
      g.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (const p of this.list) {
        if (p.glow !== pass) continue;
        const sx = toX(p.x), sy = toY(p.y);
        if (sx < -T || sy < -T || sx > viewW + T || sy > viewH + T) continue;
        const k = p.age / p.life, fade = 1 - k, s = p.size * T;
        g.globalAlpha = Math.max(0, Math.min(1, fade * (p.shape === 'smoke' ? 0.42 : 1)));
        g.fillStyle = g.strokeStyle = p.color;
        switch (p.shape) {
          case 'flash': {
            const r = s * (0.7 + k * 0.9);
            const grad = g.createRadialGradient(sx, sy, 0, sx, sy, r);
            grad.addColorStop(0, 'rgba(255,255,255,0.95)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grad;
            g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
            break;
          }
          case 'smoke':
            g.beginPath(); g.arc(sx, sy, s * (0.6 + k * 0.9), 0, Math.PI * 2); g.fill();
            break;
          case 'spark':
          case 'streak': {
            const len = Math.hypot(p.vx, p.vy) || 1, L = s * (p.shape === 'streak' ? 1.4 : 1) * fade;
            g.lineWidth = Math.max(1, T * (p.shape === 'streak' ? 0.035 : 0.05));
            g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx - (p.vx / len) * L, sy - (p.vy / len) * L); g.stroke();
            break;
          }
          case 'bolt': {
            // zigue-zague curto: 3 trechos com desvio fixo por partícula
            g.lineWidth = Math.max(1, T * 0.05);
            g.beginPath(); g.moveTo(sx, sy);
            let x = sx, y = sy;
            for (let i = 0; i < 3; i++) {
              const a = p.rot + Math.sin((p.seed + i) * 12.9898) * 1.3;
              x += Math.cos(a) * s * 0.4; y += Math.sin(a) * s * 0.4;
              g.lineTo(x, y);
            }
            g.stroke();
            break;
          }
          case 'leaf':
            g.save(); g.translate(sx, sy); g.rotate(p.rot);
            g.beginPath(); g.ellipse(0, 0, s * 0.7, s * 0.3, 0, 0, Math.PI * 2); g.fill();
            g.restore();
            break;
          case 'rock': {
            const r = Math.max(1.5, s * 0.6);
            g.fillRect(Math.round(sx - r), Math.round(sy - r), Math.round(r * 2), Math.round(r * 2));
            break;
          }
          case 'plus': {
            const r = s * 0.7, w = Math.max(1.5, s * 0.3);
            g.fillRect(sx - w / 2, sy - r, w, r * 2);
            g.fillRect(sx - r, sy - w / 2, r * 2, w);
            break;
          }
          default: {
            const r = Math.max(1, s * (0.5 + fade * 0.5));
            g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
          }
        }
      }
    }
    g.restore();
  }
}
