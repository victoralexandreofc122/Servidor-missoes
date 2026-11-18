// Herança do Fogo: cruzes de cura e pontinhos de luz que sobem do chão em volta de quem está sendo curado (laço).
// Complementa as folhas de Cura do Victor (a casca, a renovação, o santuário): leve, para durar o tempo do efeito.
import { fit, cycle, clamp, TAU } from "../../core/index.js";

export const meta = {
  name: "Cruzes de cura", desc: "Little plus signs and motes of green light rise off a soft ring at the feet, swaying and twinkling as they go, and wink out near head height.",
  tags: ["heal", "holy", "loop", "heranca"], size: [72, 92], origin: [36, 82], duration: 2.4, loop: true, fps: 30, bg: "ground",
  options: { palette: ["#0a3018", "#106a28", "#10a030", "#30b050", "#50d070", "#70f080", "#a0f0a0", "#d0f0d0", "#ffffff"], spread: 16, count: 9, seed: 4 },
};

const PLUS5 = [[0, -2], [0, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [0, 1], [0, 2]];
const PLUS3 = [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]];

export function draw(p, t, o) {
  const C = fit(o.palette, 9), R = o.spread, P = meta.duration;
  // o anel suave nos pés, pulsando
  const pulse = 0.5 + 0.5 * Math.sin((t / P) * TAU * 2);
  for (let a = 0; a < TAU; a += TAU / 64) {
    const x = Math.cos(a) * R * (0.95 + 0.08 * pulse), y = Math.sin(a) * R * 0.32;
    if (Math.sin(a + t * 3) > -0.3) p.dot(x, y, C[5], 0.55 + 0.35 * pulse);
  }
  p.glow(0, 0, R * 1.2, C[4], 0.12 + 0.08 * pulse);
  // as cruzes: sobem devagar, balançam, piscam e somem
  cycle(t, P, o.count, o.seed, (g) => g.range(1.3, 2.2), (age, L, g) => {
    const u = age / L, x0 = g.range(-R, R) * 0.9, ph = g.range(0, TAU), big = g.next() < 0.4;
    const x = x0 + Math.sin(ph + u * 4) * 2.5, y = -2 - u * g.range(40, 64);
    if (u > 0.8 && (Math.floor(age * 20) & 1)) return;
    const body = u < 0.25 ? C[8] : u < 0.6 ? C[6] : C[4];
    for (const [dx, dy] of big ? PLUS5 : PLUS3) p.px(x + dx, y + dy, dx === 0 && dy === 0 ? C[8] : body);
    if (big) for (const [dx, dy] of PLUS5) if (dx || dy) p.px(x + dx + 1, y + dy + 1, C[2]);   // a sombra de baixo, para ler no chão claro
    p.light(x, y, C[5], 0.45 * (1 - u));
  });
  // os pontinhos: espiralam para cima, mais rápidos
  cycle(t, P, o.count * 2, o.seed + 9, (g) => g.range(0.7, 1.3), (age, L, g) => {
    const u = age / L, a0 = g.range(0, TAU), r = R * g.range(0.5, 1);
    const x = Math.cos(a0 + u * 5) * r * (1 - u * 0.5), y = Math.sin(a0 + u * 5) * r * 0.3 - u * g.range(30, 70);
    p.px(x, y, C[clamp(8 - Math.floor(u * 5), 4, 8)]);
    p.light(x, y, C[6], 0.3 * (1 - u));
  });
}
