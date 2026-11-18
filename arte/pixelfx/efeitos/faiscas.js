// Herança do Fogo: faíscas elétricas que estalam em volta do corpo (laço). Complementa as folhas de Relâmpago do
// Victor (as mãos de trovão, a armadura, as correntes): arcos curtos e quebrados, a ponta branca, gotas de faísca que caem.
import { fit, cycle, bolt, rng, clamp, TAU } from "../../core/index.js";

export const meta = {
  name: "Faíscas", desc: "Short jagged arcs snap on and off around a body, white-hot at the core and tinted at the edge, each flinging a couple of sparks that drop and bounce.",
  tags: ["lightning", "sparks", "loop", "heranca"], size: [96, 84], origin: [48, 70], duration: 1.2, loop: true, fps: 30, bg: "ground",
  options: { palette: ["#0a1840", "#0040a0", "#0080f0", "#00a0f0", "#70c8ff", "#f0f040", "#f0f0a0", "#fffff0", "#ffffff"], rx: 15, ry: 22, cy: -22, count: 15, seed: 5 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 9), P = meta.duration;
  cycle(t, P, o.count, o.seed, (g) => g.range(0.1, 0.18), (age, L, g, i) => {
    const u = age / L, a = g.range(0, TAU), len = g.range(7, 15), ta = a + g.range(-1.2, 1.2);
    const x0 = Math.cos(a) * o.rx * g.range(0.7, 1.1), y0 = o.cy + Math.sin(a) * o.ry * g.range(0.7, 1.1);
    const x1 = x0 + Math.cos(ta) * len, y1 = y0 + Math.sin(ta) * len;
    const pts = bolt(rng(o.seed, i, Math.floor(age * 30)), x0, y0, x1, y1, { jag: 0.3, depth: 3 });
    const core = u < 0.5 ? C[8] : C[6], edge = u < 0.5 ? C[4] : C[2];
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
      p.line(ax + 1, ay, bx + 1, by, edge);
      p.line(ax, ay, bx, by, core);
    }
    // um galho curto saindo do meio do arco
    const [mx, my] = pts[Math.floor(pts.length / 2)], fa = ta + (g.next() < 0.5 ? 0.9 : -0.9);
    const br = bolt(rng(o.seed, i, 77 + Math.floor(age * 30)), mx, my, mx + Math.cos(fa) * len * 0.45, my + Math.sin(fa) * len * 0.45, { jag: 0.35, depth: 2 });
    for (let k = 1; k < br.length; k++) p.line(br[k - 1][0], br[k - 1][1], br[k][0], br[k][1], edge);
    p.glow((x0 + x1) / 2, (y0 + y1) / 2, len * 0.9, C[4], 0.3 * (1 - u));
    p.light(x1, y1, C[5], 0.5 * (1 - u));
  });
  // gotas de faísca: saltam do arco, caem e quicam no chão
  cycle(t, P, o.count * 2, o.seed + 11, (g) => g.range(0.25, 0.45), (age, L, g) => {
    const u = age / L, a = g.range(0, TAU), x0 = Math.cos(a) * o.rx, y0 = o.cy + Math.sin(a) * o.ry;
    const vx = Math.cos(a) * g.range(40, 90), vy = g.range(-70, -10);
    let x = x0 + vx * age, y = y0 + vy * age + 0.5 * 600 * age * age;
    if (y > 0) y = -Math.abs(Math.sin(age * 20)) * 2;
    const c = C[clamp(8 - Math.floor(u * 5), 3, 8)];
    p.px(x, y, c);
    if (u < 0.4) p.px(x - vx * 0.012, y - (vy + 600 * age) * 0.012, C[5]);
    p.light(x, y, C[4], 0.3 * (1 - u));
  });
}
