// Boneco do jogo em ESQUELETO 3D (palito): cabeça, tronco, braços e pernas com articulações, animado por código e
// desenhado em pixel art pelo próprio aparelho (rigArt.js preenche o corpo e as camadas em cima dos ossos).
//
// Por que um esqueleto 3D: uma animação só serve para as 4 direções (e para virar suave entre elas). O boneco gira
// (yaw) e a câmera vê de frente com um pouco de cima (3/4), então o pé que está mais perto da câmera aparece um pouco
// mais embaixo e as partes de trás ficam atrás.
//
// Espaço do boneco (unidades = pixels da célula 64 x 96): Y para cima, Z para a frente (para onde ele olha) e X para a
// ESQUERDA dele (sistema de mão direita). O chão é Y = 0. A tela: x para a direita, y para baixo; o pé fica em
// (32, 92) da célula.
//
// Tudo aqui é PURO (sem DOM): o jogo usa no navegador e os testes e a prancha de arte usam no Node.

export const CELL = { w: 64, h: 96, footX: 32, footY: 92 };
/** Quanto o que está perto da câmera desce na tela (a câmera vê um pouco de cima). */
export const TILT = 0.18;

// ------------------------------------------------------------------ matrizes 3x3 (linha a linha)

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function mul(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}
export const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Gira em volta de X: positivo inclina o "para cima" para a FRENTE (curvar, acenar com a cabeça). */
const rx = (t) => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; };
/** Gira em volta de Y (vertical): virar. */
const ry = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
/** Gira em volta de Z (para a frente): inclinar para o lado / abrir o braço. */
const rz = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
/** Transposta (= inversa de uma rotação). */
export const inv = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

// ------------------------------------------------------------------ proporções (chibi: cabeça grande)

/**
 * Medidas do corpo por gênero (chibi, no tamanho do boneco antigo: ~78 px até a ponta do cabelo). Pernas 18,4
 * (coxa + canela + tornozelo), tronco 15, pescoço 3 e cabeça de raio 17 (a cabeça é quase metade da altura).
 */
export const BODY = {
  m: { hip: 3.7, thigh: 8.9, shin: 7.9, ankle: 1.6, foot: 5, chest: 14.4, shoulder: 7.4, shoulderY: 12.6, upper: 8.2, fore: 7.4, neck: 3, head: 17, headY: 15 },
  f: { hip: 3.9, thigh: 8.7, shin: 7.7, ankle: 1.6, foot: 4.6, chest: 13.8, shoulder: 6.6, shoulderY: 12, upper: 7.8, fore: 7.1, neck: 3, head: 16.8, headY: 14.8 },
};

// ------------------------------------------------------------------ poses

/** A pose neutra (em pé, braços soltos). Ângulos em radianos. L = lado esquerdo do boneco (+X), R = direito. */
export function basePose() {
  return {
    root: { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 },
    spine: { pitch: 0, yaw: 0, roll: 0 },
    head: { pitch: 0, yaw: 0, roll: 0 },
    armL: { fwd: 0.06, out: 0.16, twist: 0, elbow: 0.25 },
    armR: { fwd: 0.06, out: 0.16, twist: 0, elbow: 0.25 },
    legL: { fwd: 0, out: 0.06, knee: 0.06, foot: 0 },
    legR: { fwd: 0, out: 0.06, knee: 0.06, foot: 0 },
    /** Altura acima do chão (o pé mais baixo encosta no chão, e isto levanta o corpo: o voo da corrida). */
    air: 0,
    /** Mãos: 'solta', 'punho', 'selo' (juntas no peito) ou 'aberta'. */
    hands: 'solta',
    /** Olhos: 'abertos', 'fechados', 'foco' (semicerrados), 'dor' (> <). Boca: 'calma', 'grito', 'dentes', 'sorriso'. */
    eyes: 'abertos',
    mouth: 'calma',
    /** Graus a mais na lâmina da arma da mão (além da direção do antebraço). */
    blade: 0,
  };
}

const lerp = (a, b, k) => a + (b - a) * k;
/** Suave nas pontas (começa e termina devagar). */
export const ease = (k) => k * k * (3 - 2 * k);

/** Mistura duas poses (os números; o resto vem da que pesa mais). */
export function blendPose(a, b, k) {
  const out = {};
  for (const key of Object.keys(a)) {
    const va = a[key], vb = b[key];
    if (typeof va === 'number') out[key] = lerp(va, vb ?? va, k);
    else if (va && typeof va === 'object') out[key] = blendPose(va, vb ?? va, k);
    else out[key] = k < 0.5 ? va : vb ?? va;
  }
  return out;
}

/** Aplica mudanças (só os campos dados) em cima de uma pose. */
function over(pose, patch) {
  const out = { ...pose };
  for (const [k, v] of Object.entries(patch)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...pose[k], ...v } : v;
  return out;
}

/** Quadros-chave [instante 0..1, mudanças] -> pose no instante t (suave entre eles). */
function keyed(keys, t) {
  const poses = keys.map(([at, patch]) => [at, over(basePose(), patch)]);
  if (t <= poses[0][0]) return poses[0][1];
  for (let i = 1; i < poses.length; i++) {
    const [t1, p1] = poses[i];
    if (t <= t1) {
      const [t0, p0] = poses[i - 1];
      return blendPose(p0, p1, ease((t - t0) / Math.max(1e-6, t1 - t0)));
    }
  }
  return poses[poses.length - 1][1];
}

const TAU = Math.PI * 2;
const pos = (v) => Math.max(0, v);

/**
 * As animações. `loop` = ciclo (t de 0 a 1 se repete; `ms` é o ciclo); ação = vai de 0 a 1 uma vez em `ms`.
 * Estilo ninja do Naruto: corrida com o corpo inclinado e os braços esticados para trás, guarda de luta, selos de mão.
 */
export const ANIMS = {
  // Parado: em guarda leve (joelhos um pouco dobrados), respirando, piscando de vez em quando.
  parado: {
    loop: true, ms: 2600,
    pose(t) {
      const b = Math.sin(t * TAU);
      return over(basePose(), {
        spine: { pitch: 0.03 + 0.02 * b, yaw: 0, roll: 0 },
        head: { pitch: -0.02 - 0.02 * b, yaw: 0.05 * Math.sin(t * TAU * 0.5), roll: 0.02 * b },
        armL: { fwd: 0.08, out: 0.2 + 0.02 * b, twist: 0, elbow: 0.42 },
        armR: { fwd: 0.08, out: 0.2 + 0.02 * b, twist: 0, elbow: 0.42 },
        legL: { fwd: 0.04, out: 0.1, knee: 0.16, foot: 0 },
        legR: { fwd: -0.04, out: 0.1, knee: 0.16, foot: 0 },
        hands: 'punho',
        eyes: t > 0.6 && t < 0.64 ? 'fechados' : 'abertos',
      });
    },
  },
  // Andar: passo leve, braços balançando ao contrário das pernas, ombros girando contra o quadril.
  andar: {
    loop: true, ms: 680,
    pose(t) {
      const a = t * TAU, s = Math.sin(a), c = Math.cos(a);
      return over(basePose(), {
        root: { x: 0.5 * s, y: 0, z: 0, pitch: 0.04, yaw: 0.12 * s, roll: 0.03 * s },
        spine: { pitch: 0.06, yaw: -0.2 * s, roll: -0.03 * s },
        head: { pitch: -0.06, yaw: 0.08 * s, roll: 0 },
        legL: { fwd: 0.5 * s, out: 0.05, knee: 0.08 + 0.9 * pos(c) ** 1.4, foot: 0.32 * s },
        legR: { fwd: -0.5 * s, out: 0.05, knee: 0.08 + 0.9 * pos(-c) ** 1.4, foot: -0.32 * s },
        armL: { fwd: -0.45 * s, out: 0.15, twist: 0, elbow: 0.35 + 0.35 * pos(-s) },
        armR: { fwd: 0.45 * s, out: 0.15, twist: 0, elbow: 0.35 + 0.35 * pos(s) },
        hands: 'solta',
      });
    },
  },
  // Correr (ninja): tronco bem inclinado, cabeça erguida olhando à frente, braços esticados para trás, passada longa
  // com o joelho subindo e um instante no ar.
  correr: {
    loop: true, ms: 440,
    pose(t) {
      const a = t * TAU, s = Math.sin(a), c = Math.cos(a);
      return over(basePose(), {
        root: { x: 0, y: 0, z: 0, pitch: 0.1, yaw: 0.1 * s, roll: 0 },
        spine: { pitch: 0.34 + 0.03 * Math.sin(2 * a), yaw: -0.08 * s, roll: 0 },
        head: { pitch: -0.4, yaw: 0, roll: 0 },
        armL: { fwd: -1.0 + 0.06 * Math.sin(2 * a), out: 0.34, twist: 0, elbow: 0.1 },
        armR: { fwd: -1.0 + 0.06 * Math.sin(2 * a + 1), out: 0.34, twist: 0, elbow: 0.1 },
        legL: { fwd: 0.16 + 0.95 * s, out: 0.04, knee: 0.15 + 1.55 * pos(c) ** 1.1, foot: 0.4 * s - 0.15 },
        legR: { fwd: 0.16 - 0.95 * s, out: 0.04, knee: 0.15 + 1.55 * pos(-c) ** 1.1, foot: -0.4 * s - 0.15 },
        air: 1.6 * pos(-Math.cos(2 * a)),
        hands: 'aberta',
        eyes: 'foco',
      });
    },
  },
  // Soco: guarda (punho armado), soco reto com o giro do tronco e um passo à frente, volta.
  soco: {
    ms: 360,
    pose: (t) => keyed([
      [0, { spine: { pitch: 0.06, yaw: -0.35, roll: 0 }, armR: { fwd: 0.45, out: 0.1, twist: 0, elbow: 1.9 }, armL: { fwd: 0.95, out: 0.05, twist: 0, elbow: 1.7 }, legL: { fwd: 0.32, out: 0.12, knee: 0.3, foot: 0 }, legR: { fwd: -0.32, out: 0.1, knee: 0.25, foot: 0 }, hands: 'punho', eyes: 'foco' }],
      [0.35, { root: { x: 0, y: 0, z: 1.6, pitch: 0.14, yaw: 0, roll: 0 }, spine: { pitch: 0.12, yaw: 0.5, roll: 0 }, armR: { fwd: 1.55, out: 0.02, twist: 0, elbow: 0.04 }, armL: { fwd: 0.4, out: 0.1, twist: 0, elbow: 1.95 }, legL: { fwd: 0.45, out: 0.12, knee: 0.35, foot: 0 }, legR: { fwd: -0.45, out: 0.1, knee: 0.15, foot: -0.2 }, hands: 'punho', eyes: 'foco', mouth: 'grito' }],
      [1, { spine: { pitch: 0.05, yaw: 0, roll: 0 }, armR: { fwd: 0.3, out: 0.15, twist: 0, elbow: 1.2 }, armL: { fwd: 0.3, out: 0.15, twist: 0, elbow: 1.2 }, legL: { fwd: 0.1, out: 0.1, knee: 0.2, foot: 0 }, legR: { fwd: -0.1, out: 0.1, knee: 0.2, foot: 0 }, hands: 'punho' }],
    ], t),
  },
  // Chute: guarda, chute alto com a perna direita esticada (o corpo vai para trás para equilibrar), volta.
  chute: {
    ms: 420,
    pose: (t) => keyed([
      [0, { spine: { pitch: 0.06, yaw: -0.2, roll: 0 }, armR: { fwd: 0.8, out: 0.1, twist: 0, elbow: 1.7 }, armL: { fwd: 0.9, out: 0.05, twist: 0, elbow: 1.7 }, legL: { fwd: 0.2, out: 0.1, knee: 0.35, foot: 0 }, legR: { fwd: -0.25, out: 0.1, knee: 0.4, foot: 0 }, hands: 'punho', eyes: 'foco' }],
      [0.25, { legR: { fwd: 0.9, out: 0.06, knee: 1.7, foot: 0.2 }, legL: { fwd: -0.05, out: 0.08, knee: 0.3, foot: 0 }, spine: { pitch: -0.05, yaw: 0, roll: 0 }, armR: { fwd: 0.6, out: 0.4, twist: 0, elbow: 1.2 }, armL: { fwd: 0.8, out: 0.3, twist: 0, elbow: 1.3 }, hands: 'punho', eyes: 'foco' }],
      [0.5, { root: { x: 0, y: 0, z: 0.8, pitch: -0.22, yaw: 0.15, roll: 0 }, spine: { pitch: -0.12, yaw: 0.2, roll: 0 }, legR: { fwd: 1.6, out: 0.05, knee: 0.05, foot: -0.4 }, legL: { fwd: -0.1, out: 0.08, knee: 0.25, foot: 0 }, armR: { fwd: -0.5, out: 0.55, twist: 0, elbow: 0.5 }, armL: { fwd: 0.6, out: 0.55, twist: 0, elbow: 0.8 }, hands: 'punho', eyes: 'foco', mouth: 'grito' }],
      [1, { spine: { pitch: 0.05, yaw: 0, roll: 0 }, armR: { fwd: 0.3, out: 0.15, twist: 0, elbow: 1.1 }, armL: { fwd: 0.3, out: 0.15, twist: 0, elbow: 1.1 }, legL: { fwd: 0.08, out: 0.1, knee: 0.2, foot: 0 }, legR: { fwd: -0.08, out: 0.1, knee: 0.2, foot: 0 }, hands: 'punho' }],
    ], t),
  },
  // Jutsu: selo de mão (as duas mãos juntas na frente do peito, base firme), solta o jutsu com as palmas para a frente
  // e um grito, volta.
  jutsu: {
    ms: 420,
    pose: (t) => keyed([
      [0, { root: { x: 0, y: 0, z: 0, pitch: 0.04, yaw: 0, roll: 0 }, spine: { pitch: 0.08, yaw: 0, roll: 0 }, head: { pitch: 0.12, yaw: 0, roll: 0 }, armL: { fwd: 0.5, out: -0.45, twist: 0, elbow: 1.65 }, armR: { fwd: 0.5, out: -0.45, twist: 0, elbow: 1.65 }, legL: { fwd: 0.12, out: 0.22, knee: 0.45, foot: 0 }, legR: { fwd: -0.12, out: 0.22, knee: 0.45, foot: 0 }, hands: 'selo', eyes: 'foco' }],
      [0.4, { root: { x: 0, y: 0, z: 1.2, pitch: 0.12, yaw: 0, roll: 0 }, spine: { pitch: 0.22, yaw: 0, roll: 0 }, head: { pitch: -0.12, yaw: 0, roll: 0 }, armL: { fwd: 1.42, out: -0.1, twist: 0, elbow: 0.12 }, armR: { fwd: 1.42, out: -0.1, twist: 0, elbow: 0.12 }, legL: { fwd: 0.38, out: 0.2, knee: 0.45, foot: 0 }, legR: { fwd: -0.38, out: 0.2, knee: 0.2, foot: -0.2 }, hands: 'aberta', eyes: 'foco', mouth: 'grito' }],
      [1, { spine: { pitch: 0.05, yaw: 0, roll: 0 }, armL: { fwd: 0.5, out: 0.1, twist: 0, elbow: 0.9 }, armR: { fwd: 0.5, out: 0.1, twist: 0, elbow: 0.9 }, legL: { fwd: 0.1, out: 0.14, knee: 0.25, foot: 0 }, legR: { fwd: -0.1, out: 0.14, knee: 0.25, foot: 0 }, hands: 'aberta' }],
    ], t),
  },
  // Meditar (carregar chakra): agachado na base larga, selo de mão no peito, olhos fechados, respirando devagar.
  meditar: {
    loop: true, ms: 2400,
    pose(t) {
      const b = Math.sin(t * TAU);
      return over(basePose(), {
        root: { x: 0, y: 0, z: 0, pitch: 0.14, yaw: 0, roll: 0 },
        spine: { pitch: 0.12 + 0.03 * b, yaw: 0, roll: 0 },
        head: { pitch: 0.1, yaw: 0, roll: 0 },
        armL: { fwd: 0.5, out: -0.45, twist: 0, elbow: 1.65 },
        armR: { fwd: 0.5, out: -0.45, twist: 0, elbow: 1.65 },
        legL: { fwd: 1.05, out: 0.48, knee: 1.55 + 0.04 * b, foot: 0.1 },
        legR: { fwd: 1.05, out: 0.48, knee: 1.55 + 0.04 * b, foot: 0.1 },
        hands: 'selo',
        eyes: 'fechados',
      });
    },
  },
  // Golpe com arma: prepara (arma lá atrás, acima do ombro), corta na diagonal com o giro do corpo e termina embaixo.
  golpe: {
    ms: 380,
    pose: (t) => keyed([
      [0, { spine: { pitch: -0.04, yaw: -0.45, roll: 0.05 }, armR: { fwd: 2.6, out: 0.3, twist: 0, elbow: 0.95 }, armL: { fwd: 0.7, out: 0.25, twist: 0, elbow: 1.2 }, legL: { fwd: 0.3, out: 0.14, knee: 0.3, foot: 0 }, legR: { fwd: -0.3, out: 0.12, knee: 0.3, foot: 0 }, hands: 'punho', eyes: 'foco', blade: -30 }],
      [0.38, { root: { x: 0, y: 0, z: 1.6, pitch: 0.16, yaw: 0, roll: 0 }, spine: { pitch: 0.2, yaw: 0.5, roll: -0.05 }, armR: { fwd: 1.05, out: -0.25, twist: 0, elbow: 0.08 }, armL: { fwd: 0.2, out: 0.3, twist: 0, elbow: 0.9 }, legL: { fwd: 0.48, out: 0.14, knee: 0.4, foot: 0 }, legR: { fwd: -0.45, out: 0.12, knee: 0.15, foot: -0.2 }, hands: 'punho', eyes: 'foco', mouth: 'grito' }],
      [1, { spine: { pitch: 0.1, yaw: 0.3, roll: 0 }, armR: { fwd: 0.35, out: -0.3, twist: 0, elbow: 0.3 }, armL: { fwd: 0.2, out: 0.2, twist: 0, elbow: 0.7 }, legL: { fwd: 0.25, out: 0.12, knee: 0.3, foot: 0 }, legR: { fwd: -0.25, out: 0.12, knee: 0.2, foot: 0 }, hands: 'punho' }],
    ], t),
  },
  // Dano: o golpe joga o corpo para trás e a cabeça balança; volta à guarda.
  dano: {
    ms: 320,
    pose: (t) => keyed([
      [0, {}],
      [0.25, { root: { x: 0, y: 0, z: -0.6, pitch: -0.06, yaw: 0, roll: 0.05 }, spine: { pitch: -0.1, yaw: 0.15, roll: 0 }, head: { pitch: -0.16, yaw: 0, roll: 0.1 }, armL: { fwd: 0.5, out: 0.55, twist: 0, elbow: 0.9 }, armR: { fwd: 0.5, out: 0.55, twist: 0, elbow: 0.9 }, legL: { fwd: 0.3, out: 0.1, knee: 0.3, foot: 0.2 }, legR: { fwd: -0.15, out: 0.1, knee: 0.4, foot: 0 }, eyes: 'dor', mouth: 'dentes' }],
      [1, { legL: { fwd: 0.04, out: 0.1, knee: 0.16, foot: 0 }, legR: { fwd: -0.04, out: 0.1, knee: 0.16, foot: 0 }, armL: { fwd: 0.08, out: 0.2, twist: 0, elbow: 0.42 }, armR: { fwd: 0.08, out: 0.2, twist: 0, elbow: 0.42 }, hands: 'punho' }],
    ], t),
  },
  // Caído: de joelhos no chão, o corpo largado para a frente e a cabeça baixa.
  morto: {
    loop: true, ms: 1000,
    pose: () => over(basePose(), {
      root: { x: 0, y: 0, z: -4.5, pitch: 0.12, yaw: 0, roll: 0.04 },
      spine: { pitch: 0.3, yaw: 0, roll: 0.05 },
      head: { pitch: 0.45, yaw: 0, roll: 0.12 },
      armL: { fwd: 0.25, out: 0.2, twist: 0, elbow: 0.35 },
      armR: { fwd: 0.25, out: 0.2, twist: 0, elbow: 0.35 },
      legL: { fwd: 0.15, out: 0.14, knee: 1.75, foot: -0.6 },
      legR: { fwd: 0.15, out: 0.14, knee: 1.75, foot: -0.6 },
      eyes: 'fechados',
      mouth: 'calma',
    }),
  },
};

/** Ações (golpes) do jogo -> animação. As mesmas chaves que o jogo usa em `act.kind`. */
export const ACTION_ANIMS = { soco: 'soco', chute: 'chute', jutsu: 'jutsu', golpe: 'golpe', dano: 'dano' };

/**
 * Animação e instante (0..1) do boneco agora. state: { dead, meditating, moving, running, walk (fase da caminhada,
 * rad), act: { kind, start } | null, seed }.
 */
export function pickAnim(state, now) {
  if (state.dead) return { anim: 'morto', t: 0 };
  const act = state.act && ACTION_ANIMS[state.act.kind];
  if (act) {
    const k = (now - state.act.start) / ANIMS[act].ms;
    if (k >= 0 && k < 1) return { anim: act, t: k };
  }
  if (state.meditating || state.sitting) return { anim: 'meditar',   // v29: sentado na arquibancada usa a mesma pose
    t: (((now + (state.seed || 0)) / ANIMS.meditar.ms) % 1 + 1) % 1 };
  if (state.moving) {
    // A fase vem da distância andada (o passo acompanha a velocidade de verdade): 1 ciclo = 2 passos.
    const t = (((state.walk || 0) / (Math.PI * 4)) % 1 + 1) % 1;
    return { anim: state.running ? 'correr' : 'andar', t };
  }
  return { anim: 'parado', t: (((now + (state.seed || 0)) / ANIMS.parado.ms) % 1 + 1) % 1 };
}

/** Pose de uma animação no instante t (0..1). */
export function poseOf(anim, t) {
  return (ANIMS[anim] || ANIMS.parado).pose(t);
}

// ------------------------------------------------------------------ esqueleto: cinemática direta e projeção

/** Direção do jogo (0 baixo, 1 esquerda, 2 direita, 3 cima) -> ângulo (yaw) do boneco no mundo. */
export const YAW_OF_DIR = [0, -Math.PI / 2, Math.PI / 2, Math.PI];

/**
 * Resolve a pose: cada junta em 3D (espaço do mundo, já girado pelo yaw) e na tela da célula (x, y, profundidade:
 * maior = mais perto da câmera). Também devolve as rotações (para a cabeça, o tronco e os membros) que as camadas
 * usam para desenhar em cima dos ossos.
 */
export function solve(pose, yaw, gender = 'm') {
  const B = BODY[gender] || BODY.m;
  const world = ry(yaw);
  const r = pose.root;
  const pelvisRot = mul(world, mul(ry(r.yaw), mul(rx(r.pitch), rz(r.roll))));
  const legH = B.thigh + B.shin + B.ankle;
  const pelvis = add(apply(world, [r.x, legH + 1 + r.y, r.z]), [0, 0, 0]);
  const J = {};
  const R = {};
  J.pelvis = pelvis;
  R.pelvis = pelvisRot;
  // Tronco (curva na cintura), pescoço e cabeça.
  const s = pose.spine;
  const chestRot = mul(pelvisRot, mul(rx(s.pitch), mul(ry(s.yaw), rz(s.roll))));
  R.chest = chestRot;
  J.waist = add(pelvis, apply(pelvisRot, [0, 1.5, 0]));
  J.chest = add(J.waist, apply(chestRot, [0, B.chest * 0.55, 0]));
  J.neck = add(J.waist, apply(chestRot, [0, B.chest + 0.6, -0.2]));
  const h = pose.head;
  const headRot = mul(chestRot, mul(rx(h.pitch), mul(ry(h.yaw), rz(h.roll))));
  R.head = headRot;
  J.headBase = add(J.neck, apply(chestRot, [0, B.neck, 0]));
  J.head = add(J.headBase, apply(headRot, [0, B.headY, 0.6]));
  // Braços: L (+X) e R (-X).
  for (const [side, key] of [[1, 'L'], [-1, 'R']]) {
    const a = pose[`arm${key}`];
    const shoulder = add(J.waist, apply(chestRot, [side * B.shoulder, B.shoulderY, -0.4]));
    const upRot = mul(chestRot, mul(rz(side * a.out), mul(rx(-a.fwd), ry(side * a.twist))));
    const elbow = add(shoulder, apply(upRot, [0, -B.upper, 0]));
    const foreRot = mul(upRot, rx(-a.elbow));
    const wrist = add(elbow, apply(foreRot, [0, -B.fore, 0]));
    const hand = add(wrist, apply(foreRot, [0, -1.6, 0.2]));
    J[`shoulder${key}`] = shoulder; J[`elbow${key}`] = elbow; J[`wrist${key}`] = wrist; J[`hand${key}`] = hand;
    R[`upper${key}`] = upRot; R[`fore${key}`] = foreRot;
  }
  // Pernas.
  for (const [side, key] of [[1, 'L'], [-1, 'R']]) {
    const l = pose[`leg${key}`];
    const hip = add(pelvis, apply(pelvisRot, [side * B.hip, -1, 0]));
    const thighRot = mul(pelvisRot, mul(rz(side * l.out), rx(-l.fwd)));
    const knee = add(hip, apply(thighRot, [0, -B.thigh, 0]));
    const shinRot = mul(thighRot, rx(l.knee));
    const ankle = add(knee, apply(shinRot, [0, -B.shin, 0]));
    // O pé fica na horizontal do corpo (não da canela), com a ponta girando pelo tornozelo.
    const footRot = mul(pelvisRot, mul(rz(side * l.out * 0.5), rx(-l.foot - (l.fwd - l.knee) * 0.15)));
    const heel = add(ankle, apply(footRot, [0, -B.ankle, -1.2]));
    const toe = add(ankle, apply(footRot, [0, -B.ankle, B.foot]));
    J[`hip${key}`] = hip; J[`knee${key}`] = knee; J[`ankle${key}`] = ankle; J[`heel${key}`] = heel; J[`toe${key}`] = toe;
    R[`thigh${key}`] = thighRot; R[`shin${key}`] = shinRot; R[`foot${key}`] = footRot;
  }
  // No chão: o ponto mais baixo dos pés encosta em Y = 0; `air` levanta.
  const low = Math.min(J.heelL[1], J.toeL[1], J.heelR[1], J.toeR[1]);
  const lift = -low + (pose.air || 0);
  for (const k of Object.keys(J)) J[k] = [J[k][0], J[k][1] + lift, J[k][2]];
  // Tela: x, y (com a câmera um pouco de cima) e a profundidade.
  const P = {};
  for (const [k, v] of Object.entries(J)) P[k] = project(v);
  return { J, P, R, B, yaw, world, pose };
}

/** Ponto 3D (mundo) -> [x, y, profundidade] na célula. */
export function project(v) {
  return [CELL.footX + v[0], CELL.footY - v[1] + v[2] * TILT, v[2]];
}

/** Os ossos do palito (para a prancha do esqueleto e para depurar). */
export const BONES = [
  ['pelvis', 'waist'], ['waist', 'chest'], ['chest', 'neck'], ['neck', 'headBase'],
  ['shoulderL', 'elbowL'], ['elbowL', 'wristL'], ['shoulderR', 'elbowR'], ['elbowR', 'wristR'],
  ['shoulderL', 'shoulderR'], ['hipL', 'hipR'],
  ['hipL', 'kneeL'], ['kneeL', 'ankleL'], ['ankleL', 'toeL'], ['hipR', 'kneeR'], ['kneeR', 'ankleR'], ['ankleR', 'toeR'],
];
