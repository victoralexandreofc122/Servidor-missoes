// Juba, parte desenhada à mão na pxl: o leque de mechas de costas e de lado. Não é um arquivo solto: o exportador
// (exportar-para-pxl.mjs) o inclui em pecas.px.js, que traz a paleta, HY, mecha() e pinta().
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
sprite("_juba_mao_costas", { w: 64, h: 96 },
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
sprite("_juba_mao_lado", { w: 64, h: 96 },
  ...LADO_TRAS.flatMap((q) => pinta(mecha(...q), true)),
  ellipse(43, HY + 11, 5, 10, "b"),                      // massa atrás da orelha (a calota vem do gerador)
  ...TOPO_LADO.flatMap((q) => pinta(mecha(...q))),
  ...LADO_FRENTE.flatMap((q) => pinta(mecha(...q))),
  light([24, HY + 1, 20, 3]),
)
