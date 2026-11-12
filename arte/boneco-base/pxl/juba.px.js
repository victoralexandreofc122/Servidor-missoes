// Juba (cabelo inspirado em mestre sábio de cabelo longo): desenhada na pxl, no quadro do boneco (64 x 96).
// Cabeça de y 31 a 57; de lado o rosto olha para a esquerda. Exportada para o gerador por importar-pxl.mjs.
// Tons: k contorno, s sombra, b base, l luz (o gerador troca as cores pela cor de cabelo escolhida).
pal({ k: "#3b4252", s: "#9aa3b5", b: "#dfe5ee", l: "#ffffff" })
ramps("ksbl")

const HY = 31
// Mecha: polígono afinando da base até a ponta, com curva. Devolve os pontos das duas bordas.
function mecha(x, y, ang, len, larg, curva = 0) {
  const esq = [], dir = [], n = 10
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = ((ang + curva * t) * Math.PI) / 180
    const cx = x + Math.cos(a) * len * t, cy = y + Math.sin(a) * len * t
    const r = (larg / 2) * (1 - t) ** 0.9
    esq.push([cx + Math.cos(a - Math.PI / 2) * r, cy + Math.sin(a - Math.PI / 2) * r])
    dir.push([cx + Math.cos(a + Math.PI / 2) * r, cy + Math.sin(a + Math.PI / 2) * r])
  }
  return { esq, dir, base: [x, y] }
}
const flat = (pts) => pts.flatMap(([a, b]) => [Math.round(a), Math.round(b)])
// Uma mecha pintada: corpo em base, metade da sombra (lado direito do sentido dela), um fio de luz na borda esquerda
// e a sombra da raiz. Mechas de trás saem um tom mais escuras.
function pinta(m, tras) {
  const meio = m.esq.map((p, i) => [(p[0] + m.dir[i][0]) / 2, (p[1] + m.dir[i][1]) / 2])
  const ops = [poly(flat([...m.esq, ...m.dir.slice().reverse()]), tras ? "s" : "b"),
    poly(flat([...meio, ...m.dir.slice().reverse()]), "s")]
  if (!tras) ops.push(line(...flat([m.esq[1], m.esq[6]]), "l"))
  return ops
}

// ---- costas: leque de mechas saindo do meio da cabeça, das de trás (mais escuras) para as da frente.
const COSTAS_TRAS = [[24, HY + 10, 120, 30, 13, 15], [40, HY + 10, 60, 30, 13, -15], [32, HY + 12, 92, 36, 14, 4]]
const COSTAS_FRENTE = [
  [19, HY + 8, 150, 18, 10, -25], [45, HY + 8, 30, 18, 10, 25],
  [22, HY + 12, 118, 26, 12, -18], [42, HY + 12, 62, 26, 12, 18],
  [27, HY + 14, 100, 32, 12, -8], [37, HY + 14, 80, 32, 12, 8],
  [32, HY + 15, 90, 30, 10, 0],
]
const TOPO = [[32, HY + 3, -90, 8, 8], [24, HY + 4, -125, 8, 8, -10], [40, HY + 4, -55, 8, 8, 10],
  [18, HY + 9, -165, 7, 7, -10], [46, HY + 9, -15, 7, 7, 10]]
sprite("juba_costas", { w: 64, h: 96, outline: "k" },
  ...COSTAS_TRAS.flatMap((q) => pinta(mecha(...q), true)),
  ellipse(32, HY + 12, 15, 13, "b"),                     // massa sobre a cabeça
  ...TOPO.flatMap((q) => pinta(mecha(...q))),
  ...COSTAS_FRENTE.flatMap((q) => pinta(mecha(...q))),
  light([20, HY + 2, 24, 3]),                            // anel de brilho no alto
)

// ---- lado: a juba sai da nuca e cai em leque para trás e para baixo; topo espetado; mecha da frente.
const LADO_TRAS = [[42, HY + 12, 70, 30, 12, 12], [44, HY + 10, 30, 22, 10, 30]]
const LADO_FRENTE = [
  [42, HY + 6, 5, 16, 10, 35], [43, HY + 11, 35, 22, 12, 25], [41, HY + 15, 62, 28, 12, 15],
  [39, HY + 18, 82, 30, 11, 6], [44, HY + 17, 50, 22, 9, 20],
]
const TOPO_LADO = [[26, HY + 2, -105, 7, 7, -5], [33, HY + 1, -80, 8, 8, 5], [40, HY + 3, -50, 9, 8, 12], [45, HY + 7, -20, 8, 7, 15]]
sprite("juba_lado", { w: 64, h: 96, outline: "k" },
  ...LADO_TRAS.flatMap((q) => pinta(mecha(...q), true)),
  ellipse(43, HY + 11, 5, 10, "b"),                      // massa atrás da orelha (a calota vem do gerador)
  ...TOPO_LADO.flatMap((q) => pinta(mecha(...q))),
  ...LADO_FRENTE.flatMap((q) => pinta(mecha(...q))),
  light([24, HY + 1, 20, 3]),
)
