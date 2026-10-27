// Prancha do ESQUELETO de palito: cada animação em 4 direções, vários instantes. Gera RGBA cru para o Python salvar PNG.
//   node arte/personagem-rig/prancha_esqueleto.mjs <saida.rgba>   (imprime largura e altura)
import { writeFileSync } from 'node:fs';
import { ANIMS, BONES, YAW_OF_DIR, poseOf, solve } from '../../public/rig.js';

const SC = 3;                     // pixels por pixel da célula
const COLS = 8;                   // instantes por animação
const anims = Object.keys(ANIMS);
const dirs = [0, 1, 3, 2];        // frente, esquerda, costas, direita
const cw = 64 * SC, ch = 96 * SC;
const W = cw * COLS, H = ch * anims.length * dirs.length;
const buf = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < buf.length; i += 4) { buf[i] = 236; buf[i + 1] = 238; buf[i + 2] = 244; buf[i + 3] = 255; }
const px = (x, y, c) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
};
const line = (x0, y0, x1, y1, c, w = 2) => {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
    for (let dx = -w / 2; dx < w / 2; dx++) for (let dy = -w / 2; dy < w / 2; dy++) px(x + dx, y + dy, c);
  }
};
const circle = (cx, cy, r, c) => { for (let a = 0; a < 200; a++) px(cx + Math.cos(a / 31.8) * r, cy + Math.sin(a / 31.8) * r, c); };
let row = 0;
for (const anim of anims) {
  for (const d of dirs) {
    for (let col = 0; col < COLS; col++) {
      const t = col / COLS;
      const S = solve(poseOf(anim, t), YAW_OF_DIR[d], 'm');
      const ox = col * cw, oy = row * ch;
      line(ox, oy + 92 * SC, ox + cw, oy + 92 * SC, [190, 196, 210], 1);
      const P = (k) => [ox + S.P[k][0] * SC, oy + S.P[k][1] * SC, S.P[k][2]];
      // Mais longe primeiro (mais claro), mais perto por cima (mais escuro): dá para ver o 3D.
      const bones = BONES.map(([a, b]) => [a, b, (P(a)[2] + P(b)[2]) / 2]).sort((x, y) => x[2] - y[2]);
      for (const [a, b, z] of bones) {
        const left = a.endsWith('L') || b.endsWith('L');
        const right = a.endsWith('R') || b.endsWith('R');
        const shade = Math.max(0, Math.min(1, (z + 8) / 16));
        const base = left ? [40, 110, 220] : right ? [220, 70, 60] : [40, 40, 50];
        const c = base.map((v) => Math.round(v * (0.55 + 0.45 * shade) + 120 * (1 - shade) * 0.6));
        line(P(a)[0], P(a)[1], P(b)[0], P(b)[1], c, 3);
      }
      const hd = P('head');
      circle(hd[0], hd[1], S.B.head * SC, [40, 40, 50]);
      const nose = S.P.head;
      // nariz: um tracinho para frente (mostra para onde a cabeça olha)
      const f = [S.J.head[0] + 0, S.J.head[1], S.J.head[2]];
      for (const k of ['handL', 'handR']) { const h = P(k); circle(h[0], h[1], 1.6 * SC, k === 'handL' ? [40, 110, 220] : [220, 70, 60]); }
    }
    row++;
  }
}
writeFileSync(process.argv[2], buf);
console.log(W, H, anims.join(','));
