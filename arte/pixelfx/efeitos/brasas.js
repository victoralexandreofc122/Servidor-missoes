// Herança do Fogo: brasas que sobem do chão em volta de quem queima (laço). Camada que complementa as folhas de Fogo
// desenhadas pelo Victor (a lâmina na mão, o chão incandescente, a marca): só pontos de luz, sem chama cheia.
import { fit, cycle, clamp, TAU } from "../../core/index.js";

export const meta = {
  name: "Brasas", desc: "Embers drift up off a hot spot on the floor, wandering and cooling from white-yellow to dark red, with a few licks of flame at the floor and a warm glow.",
  tags: ["fire", "embers", "loop", "heranca"], size: [72, 84], origin: [36, 74], duration: 2, loop: true, fps: 30, bg: "ground",
  options: { palette: ["#3a0800", "#7a1000", "#c81800", "#f04000", "#f07000", "#f0a000", "#f0d020", "#fff4a0", "#ffffff"], spread: 18, count: 26, seed: 3 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 9), R = o.spread, P = meta.duration;
  // o brilho quente no chão, respirando
  const breathe = 0.75 + 0.25 * Math.sin((t / P) * TAU * 2);
  p.glow(0, -2, R * 1.4, C[5], 0.18 * breathe);
  // lambidas baixas de chama no chão (curtas, piscam)
  cycle(t, P, 9, o.seed + 7, (g) => g.range(0.25, 0.45), (age, L, g) => {
    const u = age / L, x = g.range(-R, R) * 0.9, y = g.range(-3, 3) * 0.35;
    const h = Math.round((1 - Math.abs(u * 2 - 1)) * g.range(3, 7));
    for (let k = 0; k < h; k++) p.px(x + Math.sin(k * 0.9 + u * 6) * 0.6, y - k, C[clamp(7 - Math.floor((k / Math.max(1, h)) * 4) - (u > 0.6 ? 2 : 0), 2, 8)]);
    p.light(x, y - 1, C[5], 0.25);
  });
  // as brasas: sobem, ondulam e esfriam
  cycle(t, P, o.count, o.seed, (g) => g.range(0.9, 1.9), (age, L, g) => {
    const u = age / L, x0 = g.range(-R, R), rise = g.range(28, 62), sway = g.range(2, 5), ph = g.range(0, TAU);
    const x = x0 + Math.sin(ph + u * 5) * sway * u, y = -u * rise - g.range(0, 4);
    const c = C[clamp(8 - Math.floor(u * 7.5), 1, 8)];
    if (u > 0.85 && (Math.floor(age * 30) & 1)) return;   // pisca antes de apagar
    p.px(x, y, c);
    if (g.next() < 0.35 && u < 0.5) p.px(x, y + 1, C[clamp(6 - Math.floor(u * 6), 1, 8)]);
    p.light(x, y, C[6], 0.35 * (1 - u));
  });
}
