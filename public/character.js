// Boneco modular (paperdoll) com placeholders geométricos: cabeça, cabelo, tronco, braços,
// pernas e capa, cada parte com a sua cor. Leve de propósito: só retângulos e 1 círculo,
// sem gradiente nem sombra (dá para dezenas de jogadores na tela a 60 quadros/s).
// Sem DOM: o jogo desenha no canvas e os testes contam as operações num contexto falso.
//
// Equipamento (v8, o SERVIDOR diz o quê: gear = { hand, back, scroll }):
//  - mão: kunais e espadas curtas, na mão da frente (o servidor só manda se a outra mão estiver livre);
//  - costas: espadas longas, a Shuriken Gigante e o pergaminho de jutsu, ATRÁS do tronco e À FRENTE
//    da capa. De frente e de lado, a capa vem antes, o item das costas depois e o tronco por cima
//    (aparece o cabo sobre o ombro); de costas, o item vai por cima da capa.

/** Visual padrão (o mesmo do servidor) e paletas prontas do Criador. */
export const DEFAULT_LOOK = { skin: '#f1c9a0', hair: '#2b2118', shirt: '#2f5d8a', pants: '#2a2a33', cape: '#8a2b2b' };
export const PARTS = ['skin', 'hair', 'shirt', 'pants', 'cape'];
export const PRESETS = [
  { skin: '#f1c9a0', hair: '#2b2118', shirt: '#2f5d8a', pants: '#2a2a33', cape: '#8a2b2b' },
  { skin: '#c68642', hair: '#f2c94c', shirt: '#e8572f', pants: '#1f2a44', cape: '#2e8b57' },
  { skin: '#8d5524', hair: '#111111', shirt: '#3a3a3a', pants: '#1a1a1a', cape: '#6b4fa0' },
  { skin: '#ffdbac', hair: '#d94848', shirt: '#2e8b57', pants: '#3b2f2f', cape: '#f0a03c' },
  { skin: '#e0ac69', hair: '#5a3b8c', shirt: '#f5f0e1', pants: '#2f5d8a', cape: '#1f1b2e' },
];

/** Direção: 0 baixo, 1 esquerda, 2 direita, 3 cima (igual ao servidor). */
export function dirFrom(fx, fy) {
  if (Math.abs(fx) > Math.abs(fy)) return fx < 0 ? 1 : 2;
  return fy < 0 ? 3 : 0;
}

/** Cor mais escura (perna e braço de trás, sombra da capa). Guardada por cor: conta 1 vez só. */
const shadeCache = new Map();
export function shade(hex, amount = 0.28) {
  const key = hex + amount;
  let out = shadeCache.get(key);
  if (!out) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.round(v * (1 - amount))).toString(16).padStart(2, '0');
    out = `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
    shadeCache.set(key, out);
  }
  return out;
}

/** Uma cor "#rrggbb" válida ou a do padrão (nada estranho chega ao fillStyle). */
const HEX = /^#[0-9a-f]{6}$/i;
export function safeLook(look) {
  const out = {};
  for (const p of PARTS) out[p] = look && HEX.test(look[p]) ? look[p] : DEFAULT_LOOK[p];
  return out;
}

/** Como cada item aparece no boneco (cor da lâmina, do cabo e o tamanho). Item desconhecido: nada. */
export const GEAR_LOOK = {
  kunai_training: { kind: 'blade', blade: '#9aa3ad', grip: '#6b4423', len: 3.2 },
  kunai: { kind: 'blade', blade: '#c9d1d9', grip: '#2b2118', len: 3.4 },
  tanto: { kind: 'blade', blade: '#dfe6ee', grip: '#7a2e1e', len: 4.6 },
  katana: { kind: 'long', blade: '#e6edf3', grip: '#1f1b2e', len: 11 },
  fuma_shuriken: { kind: 'star', blade: '#8a96a3', grip: '#3b3b44', len: 6 },
  scroll: { kind: 'scroll', blade: '#efe3c2', grip: '#8a2b2b', len: 7 },
};
const gearLook = (code) => (code && (GEAR_LOOK[code] || (code.startsWith('scroll_') ? GEAR_LOOK.scroll : undefined))) || undefined;

/**
 * Item nas costas (espada longa na diagonal, Shuriken Gigante, pergaminho atravessado). Um pouco
 * maior que o tronco: de frente, o cabo e a guarda aparecem sobre o ombro e a ponta no quadril.
 */
export function drawBackItem(R, x, torsoY, u, dir, code) {
  const gl = gearLook(code);
  if (!gl) return;
  if (gl.kind === 'long') {
    // Cabo sobre um ombro, ponta no quadril do outro lado (de lado: tudo atrás das costas).
    const s = dir === 0 ? -1 : 1;
    const back = dir === 1 ? 1 : -1;
    const side = dir === 1 || dir === 2;
    const x0 = side ? x + back * 3.4 * u : x + s * 3.6 * u, y0 = torsoY - 3.8 * u;
    const x1 = side ? x + back * 2.6 * u : x - s * 4.8 * u, y1 = torsoY + 7.2 * u;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      R(x0 + (x1 - x0) * t - 0.65 * u, y0 + 2.6 * u + (y1 - y0 - 2.6 * u) * t, 1.3 * u, 2.4 * u, gl.blade);
    }
    R(x0 - 0.8 * u, y0, 1.6 * u, 2.4 * u, gl.grip);                 // cabo
    R(x0 - 1.4 * u, y0 + 2.2 * u, 2.8 * u, 0.8 * u, '#c9a227');      // guarda (tsuba)
  } else if (gl.kind === 'star') {
    R(x - 6 * u, torsoY + 0.8 * u, 12 * u, 1.6 * u, gl.blade);       // grande: as pontas passam dos braços
    R(x - 0.8 * u, torsoY - 4.6 * u, 1.6 * u, 11 * u, gl.blade);
    R(x - 1.2 * u, torsoY + 0.4 * u, 2.4 * u, 2.4 * u, gl.grip);
  } else if (gl.kind === 'scroll') {
    R(x - 4.6 * u, torsoY + 3.4 * u, 9.2 * u, 1.5 * u, gl.blade);
    R(x - 5.1 * u, torsoY + 3.1 * u, 1.1 * u, 2.1 * u, gl.grip);
    R(x + 4 * u, torsoY + 3.1 * u, 1.1 * u, 2.1 * u, gl.grip);
  }
}

/** Arma na mão da frente: lâmina curta saindo da mão, para baixo e um pouco para fora. */
export function drawHandItem(R, handX, handY, u, dir, code) {
  const gl = gearLook(code);
  if (!gl || gl.kind !== 'blade') return;
  const out = dir === 1 ? -1 : 1;
  R(handX + (out > 0 ? 1.6 * u : -0.6 * u), handY + 0.2 * u, u, 1.2 * u, gl.grip);
  R(handX + (out > 0 ? 1.8 * u : -0.4 * u), handY + 1.2 * u, 0.8 * u, gl.len * u, gl.blade);
}

/**
 * Desenha o boneco com os pés em (sx, sy + 0,42·T). T = tamanho da casa em pixels.
 * dir: 0 baixo, 1 esquerda, 2 direita, 3 cima. phase: fase da caminhada (radianos);
 * moving: anda (pernas e braços balançam, corpo sobe e desce) ou parado.
 * gear (opcional): { hand, back, scroll } do servidor.
 */
export function drawCharacter(g, sx, sy, T, look, dir, phase, moving, gear) {
  const u = T / 16;                                   // 1 "pixel" do boneco
  const swing = moving ? Math.sin(phase) : 0;
  const bob = moving ? Math.abs(Math.cos(phase)) * u * 0.8 : 0;
  const x = Math.round(sx);
  const feet = Math.round(sy + T * 0.42);
  const top = feet - Math.round(15 * u + bob);        // topo da cabeça
  const R = (px, py, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(px), Math.round(py), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
  const side = dir === 1 || dir === 2;
  const face = dir === 1 ? -1 : 1;                    // lado para onde olha (perfil)

  const torsoY = top + 6 * u;
  const torsoW = side ? 5 * u : 7 * u;
  const legY = torsoY + 5 * u;
  const legH = feet - legY;

  // Capa ATRÁS do corpo (de frente e de lado). De costas, ela vai por cima, no fim.
  if (dir !== 3) {
    const cx = side ? x - face * 2.5 * u : x;
    const flutter = moving ? Math.sin(phase * 0.5) * u * 0.8 : 0;
    R(cx - (side ? 2 : 4.5) * u, torsoY - u, (side ? 4 : 9) * u, 9 * u + flutter, shade(look.cape, 0.12));
    // Costas: atrás do tronco (desenhado depois), à frente da capa (desenhada antes).
    if (gear) {
      drawBackItem(R, x, torsoY, u, dir, gear.back);
      drawBackItem(R, x, torsoY, u, dir, gear.scroll);
    }
  }

  // Pernas: balançam em sentidos opostos (de frente: sobe/desce; de lado: vai/volta).
  if (side) {
    R(x - 1.5 * u - swing * 1.5 * u * face, legY, 3 * u, legH, shade(look.pants));
    R(x - 1.5 * u + swing * 1.5 * u * face, legY, 3 * u, legH, look.pants);
  } else {
    R(x - 3 * u, legY, 2.6 * u, legH - Math.max(0, swing) * 1.5 * u, look.pants);
    R(x + 0.4 * u, legY, 2.6 * u, legH - Math.max(0, -swing) * 1.5 * u, look.pants);
  }

  // Braço de trás (perfil), tronco e braço da frente.
  if (side) R(x - 1 * u - swing * 1.2 * u * face, torsoY + u, 2 * u, 4.5 * u, shade(look.shirt));
  R(x - torsoW / 2, torsoY, torsoW, 5.5 * u, look.shirt);
  if (side) {
    R(x - 1 * u + swing * 1.2 * u * face, torsoY + u, 2 * u, 4.5 * u, look.shirt);
    R(x - 1 * u + swing * 1.2 * u * face, torsoY + 5.5 * u, 2 * u, 1.2 * u, look.skin);   // mão
    if (gear && gear.hand) drawHandItem(R, x - 1 * u + swing * 1.2 * u * face, torsoY + 5.5 * u, u, dir, gear.hand);
  } else {
    R(x - torsoW / 2 - 2 * u, torsoY + u + swing * u, 2 * u, 4 * u, look.shirt);
    R(x + torsoW / 2, torsoY + u - swing * u, 2 * u, 4 * u, look.shirt);
    R(x - torsoW / 2 - 2 * u, torsoY + 5 * u + swing * u, 2 * u, 1.2 * u, look.skin);
    R(x + torsoW / 2, torsoY + 5 * u - swing * u, 2 * u, 1.2 * u, look.skin);
    // De frente: a arma na mão direita do boneco (esquerda da tela). De costas, a mão fica escondida.
    if (gear && gear.hand && dir === 0) drawHandItem(R, x - torsoW / 2 - 2 * u, torsoY + 5 * u + swing * u, u, 1, gear.hand);
  }

  // Cabeça (círculo de pele) e cabelo: de costas cobre tudo; de lado, a nuca.
  const hr = 3.6 * u;
  const hy = top + hr;
  g.fillStyle = look.skin;
  g.beginPath();
  g.arc(x, hy, hr, 0, Math.PI * 2);
  g.fill();
  if (dir === 3) {
    R(x - hr, hy - hr, hr * 2, hr * 1.7, look.hair);
  } else if (side) {
    R(x - hr, hy - hr, hr * 2, hr * 0.9, look.hair);
    R(x - face * hr * 0.2 - (face > 0 ? hr * 0.8 : 0), hy - hr * 0.2, hr, hr * 0.9, look.hair);
    R(x + face * hr * 0.45 - 0.5 * u, hy, 1.2 * u, 1.2 * u, '#1b1410');           // olho
  } else {
    R(x - hr, hy - hr, hr * 2, hr * 0.85, look.hair);
    R(x - hr, hy - hr * 0.3, u * 1.2, hr * 0.9, look.hair);
    R(x + hr - u * 1.2, hy - hr * 0.3, u * 1.2, hr * 0.9, look.hair);
    R(x - 1.8 * u, hy + 0.2 * u, 1.2 * u, 1.2 * u, '#1b1410');                       // olhos
    R(x + 0.6 * u, hy + 0.2 * u, 1.2 * u, 1.2 * u, '#1b1410');
  }

  // De costas: a capa cobre as costas por cima do tronco, e o que vai nas costas por cima da capa.
  if (dir === 3) {
    const flutter = moving ? Math.sin(phase * 0.5) * u * 0.8 : 0;
    R(x - 4.5 * u, torsoY - 0.5 * u, 9 * u, 9 * u + flutter, look.cape);
    R(x - 4.5 * u, torsoY - 0.5 * u, 9 * u, u, shade(look.cape));
    if (gear) {
      drawBackItem(R, x, torsoY, u, dir, gear.back);
      drawBackItem(R, x, torsoY, u, dir, gear.scroll);
    }
  }
  return top;   // topo da cabeça (para o nome e a barra de vida)
}
