/*
 * Boneco Base (Base Mesh) do Herança do Fogo: 64x96, linha dos pés em Y=92.
 * Gera matrizes de pixels por camada (paper doll). Funciona no navegador (window.BonecoBase)
 * e no Node (require). Nada aqui é usado pelo jogo ainda: é a prancha de aprovação.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BonecoBase = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const W = 64, H = 96, FEET_Y = 92;

  // Índices de cor. A pele usa exatamente 4 tons: contorno, sombra, base e luz.
  const LINE = 1, SHADE = 2, BASE = 3, LIGHT = 4;
  const U_LINE = 5, U_SHADE = 6, U_BASE = 7;
  const EYE_DARK = 8, EYE_IRIS = 9, EYE_SHINE = 10, SHADOW = 11, EYE_SHADE = 12, STEEL_LINE = 13, STEEL = 14, HILT = 15;

  const PALETTE = {
    [LINE]: '#5a2a1c', [SHADE]: '#d98a5f', [BASE]: '#f6b98c', [LIGHT]: '#ffdcb9',
    [U_LINE]: '#5b6072', [U_SHADE]: '#b3b8c7', [U_BASE]: '#e6e8ef',
    [EYE_DARK]: '#1b1e33', [EYE_SHADE]: '#2f3f86', [EYE_IRIS]: '#5f7fd6', [EYE_SHINE]: '#ffffff',
    [SHADOW]: 'rgba(20,12,10,0.28)',
    [STEEL_LINE]: '#3b4252', [STEEL]: '#dfe5ee', [HILT]: '#6b4226',
  };
  // Sem roupa, as partes do corpo têm a cor da pele; cabelo, bandana e acessório têm uma cor padrão.
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].forEach((pt) => [0, 1, 2, 3].forEach((k) => {
    PALETTE[20 + pt * 4 + k] = pt <= 9 ? PALETTE[1 + k] : null;
  }));

  // Ordem de desenho, de baixo para cima. `corpo`, `cabeca` e `bracos` formam o corpo-base, separados
  // para a roupa do tronco passar por baixo do braço e para animar cada parte.
  const LAYERS = ['sombra', 'tras', 'costas_tras', 'cabelo_tras', 'corpo', 'inferior', 'superior', 'estampa', 'roupa', 'cabeca', 'rosto', 'cabelo', 'bandana',
    'acessorio', 'bracos', 'arma', 'efeito'];
  // Camadas presas à cabeça: andam junto com ela em toda pose.
  const HEAD_LAYERS = ['cabeca', 'rosto', 'cabelo', 'cabelo_tras', 'bandana', 'acessorio'];

  /*
   * Partes. Cada pixel de pele do corpo guarda a parte a que pertence; a roupa é uma troca de cor por parte, então
   * acompanha todas as poses sem desalinhar. O índice gravado é 20 + parte * 4 + tom (0 contorno, 1 sombra, 2 base, 3 luz).
   * Cabelo, bandana e acessório usam o mesmo esquema (partes 10, 11 e 12) para poderem trocar de cor.
   */
  const PART = { pescoco: 1, tronco: 2, coxa: 3, canela: 4, pe: 5, braco: 6, antebraco: 7, mao: 8, quadril: 9, cabelo: 10, bandana: 11, acessorio: 12, estampa: 13, peca: 14 };
  const TECIDOS = {
    preto: ['#14161c', '#23262f', '#33384a', '#4a5068'], cinza: ['#2a2d36', '#555b6b', '#868da0', '#b4bac8'],
    branco: ['#5b6072', '#b3b8c7', '#e6e8ef', '#ffffff'], azul: ['#17223f', '#24407a', '#3560b0', '#5a88d8'],
    vermelho: ['#4a1014', '#8a1f24', '#c23a34', '#e8695a'], verde: ['#12301c', '#1f5a34', '#2f8a4c', '#58b874'],
    laranja: ['#5a2408', '#b3520f', '#ea7d1c', '#ffab52'], amarelo: ['#5a4208', '#b38a12', '#e6bc2a', '#ffe06a'],
    roxo: ['#2a1440', '#4d2a7a', '#7646b0', '#a274dc'], marrom: ['#2e1a0e', '#5a3418', '#86522a', '#b27a46'],
  };
  // Registro de peças. Toda peça entra por `definirPeca` e segue o mesmo formato (ver arte/boneco-base/PADRAO.md).
  const PECAS = {};
  const TIPOS = ['cabelo', 'bandana', 'acessorio', 'superior', 'inferior', 'pes', 'maos', 'tronco', 'estampa'];
  function definirPeca(pc) {
    if (!pc.id || PECAS[pc.id]) throw new Error('peça sem id ou repetida: ' + pc.id);
    if (!TIPOS.includes(pc.tipo)) throw new Error(pc.id + ': tipo inválido');
    if (!['cor', 'forma', 'estampa'].includes(pc.modo)) throw new Error(pc.id + ': modo deve ser cor, forma ou estampa');
    PECAS[pc.id] = pc;
  }
  [[10, 'marrom'], [11, 'azul'], [12, 'preto'], [13, 'branco'], [14, 'cinza']].forEach(([pt, cor]) => [0, 1, 2, 3].forEach((k) => { PALETTE[20 + pt * 4 + k] = TECIDOS[cor][k]; }));
  // Marca os pixels de pele (tons 1 a 4) de uma camada com a parte devolvida por fn(x, y).
  function tag(grid, fn) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = grid[y * W + x];
      if (v < 1 || v > 4) continue;
      const pt = fn(x, y);
      if (pt) grid[y * W + x] = 20 + pt * 4 + v - 1;
    }
  }
  // Visual: quais partes trocam de cor, quais camadas somem (a roupa íntima debaixo da roupa) e as peças da cabeça.
  function resolveLook(look) {
    const k = look || {}; const cores = {}; const hide = {};
    const set = (parts, cor) => { if (TECIDOS[cor]) parts.forEach((pt) => { cores[pt] = TECIDOS[cor]; }); };
    const sup = PECAS[k.superior]; const inf = PECAS[k.inferior];
    if (sup && sup.modo === 'cor') { set(sup.partes, k.corSuperior || 'azul'); hide.superior = true; }
    if (inf && inf.modo === 'cor') { set(inf.partes, k.corInferior || 'preto'); hide.inferior = true; }
    if (k.pes) set(PECAS.calcado.partes, k.pes);
    if (k.maos) set(PECAS.luvas.partes, k.maos);
    set([10], k.corCabelo || 'marrom'); set([11], k.bandana || 'azul'); set([12], k.corAcessorio || 'preto'); {
      // A estampa precisa contrastar com a roupa: se as cores forem parecidas, troca por branco ou preto.
      const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
      let ce = k.corEstampa || 'branco';
      const fundo = TECIDOS[k.corSuperior || 'azul'];
      if (TECIDOS[ce] && fundo && Math.abs(lum(TECIDOS[ce][2]) - lum(fundo[2])) < 0.3) ce = lum(fundo[2]) < 0.5 ? 'branco' : 'preto';
      set([13], ce);
    } set([14], k.corPeca || 'cinza');
    return { cores, hide };
  }
  function colorOf(v, res) {
    if (v >= 20 && res && res.cores) { const pal = res.cores[Math.floor((v - 20) / 4)]; if (pal) return pal[(v - 20) % 4]; }
    return PALETTE[v];
  }

  // ---------- máscaras ----------
  const key = (x, y) => y * W + x;
  function newMask() { return new Uint8Array(W * H); }
  function rows(mask, y0, list) {
    list.forEach((r, i) => { if (!r) return; for (let x = r[0]; x <= r[1]; x++) mask[key(x, y0 + i)] = 1; });
    return mask;
  }
  // Linhas simétricas: meia largura por linha, em volta do eixo entre x=31 e x=32.
  function sym(mask, y0, hws) { return rows(mask, y0, hws.map((h) => (h > 0 ? [32 - h, 31 + h] : null))); }
  function mirror(mask) {
    const out = newMask();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[key(x, y)]) out[key(W - 1 - x, y)] = 1;
    return out;
  }
  function union(a, b) { const o = newMask(); for (let i = 0; i < o.length; i++) o[i] = a[i] | b[i]; return o; }
  function inter(a, b) { const o = newMask(); for (let i = 0; i < o.length; i++) o[i] = a[i] & b[i]; return o; }
  const has = (m, x, y) => x >= 0 && y >= 0 && x < W && y < H && m[key(x, y)] === 1;
  function run(m, x, y, dx, dy) { let n = 0; while (has(m, x + dx * (n + 1), y + dy * (n + 1))) n++; return n; }

  /*
   * Pinta uma máscara: contorno na borda, depois as faixas de luz e sombra.
   * `rule(c)` devolve LIGHT, SHADE ou nada (fica a cor base). c traz x, y, ax (distância do eixo),
   * dT/dB/dL/dR (quantos pixels da peça existem acima, abaixo, à esquerda e à direita).
   */
  // Regra: nada com ponta totalmente quadrada. Antes de pintar, tira o pixel de cada canto convexo em L
  // (só onde a borda continua por pelo menos 3 pixels nos dois sentidos, para não comer peças finas).
  function roundCorners(mask) {
    const o = mask.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask[key(x, y)]) continue;
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        if (!has(mask, x - sx, y) && !has(mask, x, y - sy) && has(mask, x + 2 * sx, y) && has(mask, x, y + 2 * sy)
          && has(mask, x + sx, y + sy)) { o[key(x, y)] = 0; break; }
      }
    }
    return o;
  }
  function paint(grid, mask, tones, rule) {
    mask = roundCorners(mask);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask[key(x, y)]) continue;
      const edge = !has(mask, x - 1, y) || !has(mask, x + 1, y) || !has(mask, x, y - 1) || !has(mask, x, y + 1);
      if (edge) { grid[key(x, y)] = tones.line; continue; }
      const c = {
        x, y, ax: x < 32 ? 31 - x : x - 32,
        dT: run(mask, x, y, 0, -1), dB: run(mask, x, y, 0, 1), dL: run(mask, x, y, -1, 0), dR: run(mask, x, y, 1, 0),
      };
      const t = rule ? rule(c) : null;
      grid[key(x, y)] = t === LIGHT ? tones.light : t === SHADE ? tones.shade : tones.base;
    }
  }
  const SKIN = { line: LINE, shade: SHADE, base: BASE, light: LIGHT };
  const UNDER = { line: U_LINE, shade: U_SHADE, base: U_BASE, light: U_BASE };
  function px(grid, list, tone) { list.forEach(([x, y]) => { grid[key(x, y)] = tone; }); }
  // Pinta os pontos e o espelho deles (mantém a frente simétrica).
  function pxSym(grid, list, tone) { list.forEach(([x, y]) => { grid[key(x, y)] = tone; grid[key(W - 1 - x, y)] = tone; }); }
  function span(x0, x1, y) { const o = []; for (let x = x0; x <= x1; x++) o.push([x, y]); return o; }

  // Pose: A é o membro do lado direito da imagem (frente e costas) ou o de perto (lado); B é o outro.
  // bob desce o tronco e a cabeça; leg/arm são o balanço em pixels na ponta (negativo = para a frente, de lado);
  // lift levanta o pé.
  // lean inclina o tronco para a frente (de lado); dx empurra o corpo todo para trás (de lado); rot deita o corpo (graus);
  // seal põe as mãos juntas na frente do peito (1 e 2 são duas formas de mão); punch 2 estende o braço A num soco.
  const NEUTRAL = { bob: 0, legA: 0, legB: 0, liftA: 0, liftB: 0, armA: 0, armB: 0, lean: 0, dx: 0, rot: 0, seal: 0, punch: 0 };
  function shiftG(src, dx, dy) {
    if (!dx && !dy) return src;
    const o = newMask();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = src[key(x, y)];
      if (v && x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H) o[key(x + dx, y + dy)] = v;
    }
    return o;
  }
  // Membro por segmentos: linha grossa passando pelos pontos (ombro, cotovelo, mão ou quadril, joelho, pé).
  function limb(mask, pts, t) {
    const h0 = Math.floor((t - 1) / 2); const h1 = t - 1 - h0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i]; const [x1, y1] = pts[i + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= n; k++) {
        const x = Math.round(x0 + ((x1 - x0) * k) / n); const y = Math.round(y0 + ((y1 - y0) * k) / n);
        for (let yy = y - h0; yy <= y + h1; yy++) for (let xx = x - h0; xx <= x + h1; xx++) {
          if (xx >= 0 && xx < W && yy >= 0 && yy < H) mask[key(xx, yy)] = 1;
        }
      }
    }
    return mask;
  }
  const rel = (pts, o) => pts.map(([x, y]) => [o[0] + x, o[1] + y]);
  // Armas. Lâmina: linha de aço da mão até a ponta, com o cabo nos dois primeiros pixels.
  const METAL = { line: STEEL_LINE, shade: STEEL, base: STEEL, light: STEEL };
  function blade(layer, from, to) {
    paint(layer, limb(newMask(), [from, to], 3), METAL, null);
    const n = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]), 1);
    for (let k = 0; k <= 3; k++) {
      const x = Math.round(from[0] + ((to[0] - from[0]) * k) / n); const y = Math.round(from[1] + ((to[1] - from[1]) * k) / n);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (x + i >= 0 && x + i < W && y + j >= 0 && y + j < H) layer[key(x + i, y + j)] = HILT;
    }
  }
  // Shuriken: estrela de 4 pontas em duas posições de giro (em cruz e em X).
  function star(layer, cx, cy, rot) {
    const d = rot ? [[1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const put = (x, y, v) => { if (x >= 0 && x < W && y >= 0 && y < H) layer[key(x, y)] = v; };
    d.forEach(([i, j]) => { put(cx + i, cy + j, STEEL); put(cx + 2 * i, cy + 2 * j, STEEL); put(cx + 3 * i, cy + 3 * j, STEEL_LINE); });
    if (!rot) [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([i, j]) => put(cx + i, cy + j, STEEL_LINE));
    put(cx, cy, STEEL_LINE);
  }
  const LIMB = (c) => (c.dT === 1 ? LIGHT : c.dB === 1 ? SHADE : null);
  // Copia para `dst` os pixels de `src` com x entre x0 e x1 e y entre y0 e y1, deslocados em dy.
  function blit(dst, src, x0, x1, y0, y1, dy) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const v = src[key(x, y)];
      if (v && y + dy >= 0 && y + dy < H) dst[key(x, y + dy)] = v;
    }
    return dst;
  }
  const moved = (src, dy) => (dy ? blit(newMask(), src, 0, W - 1, 0, H - 1, dy) : src);

  function shadowLayer() {
    const g = newMask();
    rows(g, 91, [[22, 41], [18, 45], [18, 45], [22, 41]]);
    for (let i = 0; i < g.length; i++) if (g[i]) g[i] = SHADOW;
    return g;
  }

  // ---------- medidas ----------
  // Proporção do desenho de referência (decisão do Victor, 12/11/2026): cabeça 27 (y 31 a 57), pescoço 2 (58 e 59),
  // tronco 17 (60 a 76) e pernas 16 (77 a 92). O boneco tem 62 de altura; acima ficam 31 linhas para cabelo e chapéu.
  const HY = 31;                                                     // topo da cabeça
  const HEAD_HW = [6, 9, 11, 12, 13, 14, 14, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 14, 14, 13, 12, 10, 7];
  // Perna: [última linha, x de dentro, x de fora]. Coxa, joelho, panturrilha, tornozelo, peito do pé e pé.
  const SHAPE = {
    m: {
      torso: [9, 11, 11, 11, 11, 11, 11, 10, 10, 9, 9, 9, 9, 10, 10, 10, 10],
      arm: [42, 5],
      leg: [[82, 33, 41], [84, 34, 40], [87, 34, 41], [89, 34, 39], [90, 34, 41], [92, 33, 42]],
    },
    f: {
      torso: [8, 10, 10, 10, 10, 10, 10, 9, 8, 7, 7, 7, 8, 10, 11, 11, 11],
      arm: [41, 4],
      leg: [[82, 33, 42], [84, 34, 40], [87, 34, 40], [89, 34, 38], [90, 34, 40], [92, 33, 41]],
    },
  };
  // Âncoras iguais para os dois modelos (lado direito da imagem; o esquerdo é o espelho).
  const A_FRONT = {
    cabeca_topo: [32, 31], cabeca_centro: [32, 44], olhos: [32, 48], pescoco: [32, 59],
    ombro_d: [43, 62], cotovelo_d: [45, 68], mao_d: [46, 75], cintura: [32, 71], quadril: [32, 76],
    joelho_d: [37, 84], pe_d: [37, FEET_Y],
  };
  const A_SIDE = {
    cabeca_topo: [32, 31], cabeca_centro: [32, 44], olhos: [21, 48], pescoco: [31, 59],
    ombro: [35, 62], cotovelo: [36, 68], mao: [35, 75], cintura: [31, 71], quadril: [31, 76],
    joelho: [31, 84], pe: [30, FEET_Y],
  };

  function headMask() {
    const m = sym(newMask(), HY, HEAD_HW);
    const ear = rows(newMask(), HY + 12, [[47, 47], [47, 48], [47, 48], [47, 48], [47, 48], [47, 48], [47, 48], [47, 47]]);
    return union(m, union(ear, mirror(ear)));
  }

  function trunkMask(s) {
    const m = sym(newMask(), 57, [4, 4, 4]);
    sym(m, 60, s.torso);
    const leg = newMask();
    for (let y = 77; y <= 92; y++) {
      const t = s.leg.find((r) => y <= r[0]);
      rows(leg, y, [[y <= 79 ? 32 : t[1], t[2]]]);   // até a linha 79 as pernas ficam unidas
    }
    return union(m, union(leg, mirror(leg)));
  }

  // Ombro, braço, cotovelo para fora, antebraço aberto e mão arredondada longe do quadril.
  function armMask(a, w) {
    const m = newMask();
    rows(m, 61, [[a, a + w - 2]]);
    for (let y = 62; y <= 66; y++) rows(m, y, [[a, a + w - 1]]);
    rows(m, 67, [[a + 1, a + w + 1], [a + 1, a + w + 1]]);
    for (let y = 69; y <= 72; y++) rows(m, y, [[a + 2, a + w + 1]]);
    rows(m, 73, [[a + 2, a + w + 2], [a + 2, a + w + 2], [a + 2, a + w + 2], [a + 2, a + w + 2], [a + 3, a + w + 1]]);
    return m;
  }

  // Perfil da cabeça de lado (olhando para a esquerda): [x da frente, x de trás] por linha.
  const HEAD_SIDE = [
    [26, 38], [23, 41], [21, 43], [20, 44], [19, 45], [19, 45], [18, 46], [18, 46], [18, 46], [18, 46], [18, 46], [18, 46],
    [18, 46], [18, 46], [18, 46], [18, 46], [18, 46], [17, 46], [17, 46], [18, 46], [18, 46], [18, 45], [19, 45], [19, 44],
    [20, 42], [22, 40], [25, 36],
  ];

  // ---------- peças ----------
  // Ferramentas que toda peça de forma recebe. As coordenadas são as do boneco parado (cabeça de y 31 a 57).
  const KIT = {
    HY, HEAD_HW, HEAD_SIDE, W, H,
    nova: newMask,
    // Mecha: sai da base (x, y) na direção do ângulo (graus; -90 = para cima, 0 = para a direita), afinando de
    // `largura` até a ponta em `comprimento` pixels. `curva` entorta a mecha (graus somados ao longo dela).
    mecha(m, x, y, angulo, comprimento, largura, curva) {
      // Exportando para a pxl: só anota a mecha (a pxl a desenha); a máscara fica só com a base.
      if (KIT._rec) { KIT._rec.push({ m, a: [x, y, angulo, comprimento, largura, curva || 0] }); return m; }
      const passos = comprimento * 3;
      // A ponta termina com 2 pixels de espessura (nunca um fiapo de 1 pixel de contorno).
      for (let i = 0; i <= Math.round(passos * 0.9); i++) {
        const t = i / passos;
        const a = ((angulo + (curva || 0) * t) * Math.PI) / 180;
        const cx = x + Math.cos(a) * comprimento * t; const cy = y + Math.sin(a) * comprimento * t;
        const r = Math.max((largura / 2) * (1 - t) ** 0.8, 1.6);
        for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
          if (xx >= 0 && xx < W && yy >= 0 && yy < H && (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r + 0.25) m[key(xx, yy)] = 1;
        }
      }
      return m;
    },
    // Várias mechas: lista de [x, y, ângulo, comprimento, largura, curva].
    mechas(m, lista) { lista.forEach((q) => this.mecha(m, ...q)); return m; },
    // Na vista de frente e de costas, espelha cada mecha (a lista descreve só o lado direito da imagem).
    mechasSim(m, lista) { lista.forEach(([x, y, a, c, l, cv]) => { this.mecha(m, x, y, a, c, l, cv); this.mecha(m, 63 - x, y, 180 - a, c, l, -(cv || 0)); }); return m; },
    apagar(m, y0, list) { list.forEach((r, i) => { for (let x = r[0]; x <= r[1]; x++) m[key(x, y0 + i)] = 0; }); return m; },
    linhas: rows,                                   // linhas(m, y0, [[x0, x1], ...]): uma faixa por linha
    simetrico: sym,                                 // simetrico(m, y0, [meiaLargura, ...]): frente e costas
    // Linha i da cabeça (0 a 26) com `folga` pixels a mais de cada lado; i = -1 é a linha acima do topo.
    cabeca(m, view, i, folga) {
      const j = Math.max(i, 0); const corte = i < 0 ? 2 : 0;
      if (view === 'lado') rows(m, HY + i, [[HEAD_SIDE[j][0] - folga + corte, HEAD_SIDE[j][1] + folga - corte]]);
      else sym(m, HY + i, [HEAD_HW[j] + folga - corte]);
      return m;
    },
  };
  // Desenhos feitos na pxl (arte/boneco-base/pxl/), importados por importar-pxl.mjs. Cada direção é uma grade 64 x 96
  // de tons (0 vazio, 1 contorno, 2 sombra, 3 base, 4 luz), comprimida.
  const PXL_ARTE = {};
  // <pxl:pecas>
  Object.assign(PXL_ARTE, {"curto":{"frente":"1947.10k52.2k10b2k47.3k14b3k42.2k6b4lb4l5b2k39.k5blb4lb4lb2l5bk37.k3b3lb4lb4lb4lbl3bk35.k28bk34.k28bk33.kb2s3b5s2b4sbsb3s3b3sbk32.k4s2b5sb12s2b4sk32.ks2k4s3k3s4k3s3k4s2ksk31.ksk2.k2sk3.ksk4.ksk3.k2sk2.ksk30.ksk3.2k5.k6.k5.2k3.ksk31.k30.k3344.","costas":"1947.10k52.2k10b2k47.3k14b3k42.2k6b4lb4l5b2k39.k5blb4lb4lb2l5bk37.k3b3lb4lb4lb4lbl3bk35.k28bk34.k28bk33.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.ks3bs3bs3bs3bs3bs3bs3b2sk32.k30sk33.k28sk35.28k2706.","lado":"1947.11k51.2k11b2k46.3k15b3k41.2k6b4lb4l6b2k38.k5blb4lb4lb3l5bk36.k3b3lb4lb4lb4lb2l3bk35.k27bk34.k29bk33.kb5s3bs3bs3bs3bs3bs3bk33.k7s2b3sbs3bs3bs3bs3bk33.k2s4k8sb5sbs3bs3bk34.2k4.k2s3k10s3bs3bk41.2k3.k2s5ks3bs3bsk47.2k5.ks2bs3bsk54.ks2bs3bsk55.k2bs3bsk55.k2bs3bsk55.k2bs3bsk55.ksbs3bsk55.k3s2bsbk56.k6sk57.2k4sk59.4k2769."},"espetado":{"frente":"1505.k59.k2.kbk57.ksk.kbk6.k43.k5.kbsk.kbsk4.kbk41.ksk4.kls2kblsk3.kbsk41.kbsk2.kbl2skblsk3.kbsk41.kl2sk.kbl2sklb2sk.kblsk4.k31.2k3.kl2sk.klb2sblb2s2kblbsk3.kbk29.k2sk.kbl3skblb3s2b2sbkbl2sk2.klsk29.kb2s2kl2bsk13blb3s2klbsk29.klb2sklk6b4lb4l4b2sblb2sk29.klb2sk5blb4lb4lb2l6b2sk31.kl2k3b3lb4lb4lb4lbl3bksk31.klk28bk33.2k28bk33.kb2s3b5s2b4sbsb3s3b3sbk32.k4s2b5sb12s2b4sk32.ks2k4s3k3s4k3s3k4s2ksk31.ksk2.k2sk3.ksk4.ksk3.k2sk2.ksk30.ksk3.2k5.k6.k5.2k3.ksk31.k30.k3344.","costas":"1505.k59.k2.kbk57.ksk.kbk6.k43.k5.kbsk.kbsk4.kbk41.ksk4.kls2kblsk3.kbsk41.kbsk2.kbl2skblsk3.kbsk41.kl2sk.kbl2sklb2sk.kblsk4.k31.2k3.kl2sk.klb2sblb2s2kblbsk3.kbk29.k2sk.kbl3skblb3s2b2sbkbl2sk2.klsk29.kb2s2kl2bsk13blb3s2klbsk29.klb2sklk6b4lb4l4b2sblb2sk29.klb2sk5blb4lb4lb2l6b2sk31.kl2k3b3lb4lb4lb4lbl3bksk31.klk28bk33.2k28bk33.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.ks3bs3bs3bs3bs3bs3bs3b2sk32.k30sk33.k28sk35.28k2706.","lado":"1566.k7.2k53.ksk5.kbsk44.2k5.kbsk4.k2bsk43.kbsk4.klsk4.kl2sk5.k37.kbsk3.kbl2sk2.klb2sk3.2kbk36.kl2sk2.kbl2sk.kblb2sk2.k2bsk36.klbsk2.klb2s2kblb3sk.kbl2sk36.klb2s2kblb3s4b3s2k2lbsk36.kl2b2s13b2skl2b2sk36.klk6b4lb4l6b3sk36.k5blb4lb4lb3l3b2sk36.k3b3lb4lb4lb4lb2lbsbk35.k27bk34.k29bk33.kb5s3bs3bs3bs3bs3bs3bk33.k7s2b3sbs3bs3bs3bs3bk33.k2s4k8sb5sbs3bs3bk34.2k4.k2s3k10s3bs3bk41.2k3.k2s5ks3bs3bsk47.2k5.ks2bs3bsk54.ks2bs3bsk55.k2bs3bsk55.k2bs3bsk55.k2bs3bsk55.ksbs3bsk55.k3s2bsbk56.k6sk57.2k4sk59.4k2769."},"longo":{"frente":"1947.10k52.2k10b2k47.3k14b3k42.2k6b4lb4l5b2k39.k5blb4lb4lb2l5bk37.k3b3lb4lb4lb4lbl3bk35.k28bk34.kbs2b2s2bl2s2bl2s3b2s3bsblbk33.kb2sblbsbsl2sbsl2sbsl2s2blsblsbk32.k3sl2bsbl3sbl3sbl3sblbsbl2sk32.ksksl3sblk2sbl2k2slskskl3slksk31.k2s2bk2s3k.ksbl2kblsk.k.k4s2bsk30.k2s2bl2k5.ksk2.3k5.2k2s2bsk30.k2s2blk7.k12.k2s2blk30.k2s2blk20.k2s2blk30.k2s2blk20.k2s2blk30.k2sblk22.ksbklk31.ksblk22.ksblk32.ksblk22.ksblk32.ksblk22.ksblk32.ksblk22.ksblk32.ksbk23.ksbk33.ksk24.ksbk33.ksk25.kbk33.ksk25.kbk34.k26.ksk62.k2514.","frente_tras":"2641.30k33.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk32.k30sk33.k28sk35.k26sk36.k26sk37.26k1555.","costas":"1947.10k52.2k10b2k47.3k14b3k42.2k6b4lb4l5b2k39.k5blb4lb4lb2l5bk37.k3b3lb4lb4lb4lbl3bk35.k28bk34.k28bk33.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.ks3bs3bs3bs3bs3bs3bs3b2sk32.ks3bs3bs3bs3bs3bs3bs3b2sk33.ks2bs3bs3bs3bs3bs3bs3bsk34.ks2bs3bs3bs3bs3bs3bs3bsk35.k2bs3bs3bs3bs3bs3bs3bk36.k2bs3bs3bs3bs3bs3bs3bk36.kbs3bs3bs3bs3bs3bs3bsk36.kbs3bs3bs3bs3bs3bs3bsk36.kbs3bs3bs3bs3bs3bs3bsk36.kbs3bs3bs3bs3bs3bs3bsk36.kbs3bs3bs3bs3bs3bs3bsk36.kbs3bs3bs3bs3bs3bs3bsk36.kbs3bs3bs3bs3bs3bs3bsk36.ks3bs3bs3bs3bs3bs3bsbk36.ks3bs3bs3bs3bs3bs3bsbk36.ks3bs3bs3bs3bs3bs3bsbk36.ks3bs3bs3bs3bs3bs3b2sk36.k2s2bs3bs3bs3bs3bs3b2sk37.ks2bs3bs3bs3bs3bs3bsk39.k22sk40.k22sk41.22k1557.","lado":"1947.11k51.2k11b2k46.3k15b3k41.2k6b4lb4l6b2k38.k5blb4lb4lb3l5bk36.k3b3lb4lb4lb4lb2l3bk35.k27bk34.k29bk33.kb5s3bs3bs3bs3bs3bs3bk33.k7s2b3sbs3bs3bs3bs3bk33.k2s4k8sb5sbs3bs3bk34.2k4.k2s3k10s3bs3bk41.2k3.k2s5ks3bs3bsk47.2k5.ks2bs3bsk54.ks2bs3bsk55.k2bs3bsk55.k2bs3bsk55.k2bs3bsk55.k2bs3bsk55.kbs3bsbk55.kbs3bsbk55.kbs3bsbk55.kbs3bsbk55.kbs3bsbk55.kbs3bsbk55.kbs3bsbk55.ks3bs2bk55.ks3bs2bk55.ks3bs2bk55.ks3bs2bk55.ks3bs2bk55.ks3bs2bk55.ks3bs2bk55.k3bs3bk55.k3bs3bk55.k3bs3bk55.k3bs2bsk55.ks2bsb2sk55.k2sb3sk57.k4sk59.k2sk61.2k1556."},"ourico":{"frente":"1565.k62.kbk.2k58.kb2kbsk49.2k6.kbskbsk5.3k40.kbsk4.kblsblsk4.k2bsk39.kb2s2k2.klb2sl2sk2.kbl2sk40.kl3sk.klb2sb2s3k2lbsk41.klb3skl2b2sb3sbl2b2sk41.kl2bs14b3sk33.9kl6b4lb4l3b2s8k25.k8sbl3blb4lb4lb2l4b5l2bk25.k2b5s2b3lb4lb4lb4lbl5b2sk27.2kl2bs26b3sk30.kl27b3sk31.klb2sb2sb5sbsl2s3b3s2bl3sbk32.kl3sbsbl4sbl3sbsl3sblb4sk31.2ks2k3sl3k2sbl2k2sls3kbl2s2ksk29.2k2sk2.ksbk3.ksbk.ksksk2.k3sk.k2l2k26.k4sk3.2k5.2k3.k.k4.3k2.k2b2lk24.k5bk27.k4sk25.2k2lbk27.k2s2k28.2klk28.2k32.k3183.","costas":"1565.k62.kbk.2k58.kb2kbsk49.2k6.kbskbsk5.3k40.kbsk4.kblsblsk4.k2bsk39.kb2s2k2.klb2sl2sk2.kbl2sk40.kl3sk.klb2sb2s3k2lbsk41.klb3skl2b2sb3sbl2b2sk41.kl2bs14b3sk33.9kl6b4lb4l3b2s8k25.k8sbl3blb4lb4lb2l4b5l2bk25.k2b5s2b3lb4lb4lb4lbl5b2sk27.2kl2bs26b3sk30.kl27b3sk31.kl2bs3bs3bs3bs3bs3bs3bsbsbk32.klbs3bs3bs3bs3bs3bs3bs3bk31.2k2bs3bs3bs3bs3bs3bs3bs3bk28.3k2s2bs3bs3bs3bs3bs3bs3bs2b2l3k24.k5sbs3bs3bs3bs3bs3bs3bs5b3lk22.k7bs3bs3bs3bs3bs3bs3bs3b5sk23.2k2l3bs3bs3bs3bs3bs3bs3bs3b2s3k26.2k2lbs3bs3bs3bs3bs3bs3bs3bsk31.2kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk31.k3s3bs3bs3bs3bs3bs3bs3blk30.k2s4bs3bs3bs3bs3bs3bs5blk28.ks6bs3bs3bs3bs3bs3bs2b3sblk28.2k3l28s2k31.2k28sk35.6k2sb2k2s2blk2s2bl6k42.ksbl2ksblklksblk48.kslk.ksb2lk.kblk48.kbk3.kb2k2.ksk50.k5.k5.k2458.","lado":"1629.k62.kbk7.k46.k5.k2bk6.kbk44.kbk4.klbsk4.kbsk44.kbsk3.klbsk2.2kblsk45.klsk2.klb2s2kb2l2sk45.kl2s2kl2b2s2bl2b2sk6.k38.klbs2bl8b3sb6kbk36.2kl5b4lb4l2s4b3lsk35.k5blb4lb4lb3lb2lb2sk35.k3b3lb4lb4lb4l3b2sbk34.k2s22b2s2bk34.ks24bs3bk32.ks3b3s3bs3bs3bs3bs3bs3bk33.k3l4s2b3sbs3bs3bs3bs3bk33.k2sks2k8sb5sbs3bsb2l3k32.3kbklk2s3k10s3bs3b3lk34.klk.2k3.k2s5ks3bs2b5sk35.k8.2k5.ks2bs2b2s3k52.ks2bs3bsk55.k2bs3bsk55.k2bs3bsk55.k2bs3blk55.ksbs2bsblk54.k3sb4slk54.k6s2k56.2k4sk59.4k2769."},"topete_torto":{"frente":"1444.3k53.2k3.3k2bsk50.2kbsk.kbl2bsk50.k2bs3kblb3sk2.5k42.kblbskb2lb3s4k2l2bsk40.kbl3sbl2b3s2kb2l2b3sk39.kblb2sbl2b4sb2l2b3s2k38.2kbl2b2sk3b2s2bl3b3sk39.kbkl2b3s2kb4s3b4sk39.kbs2k2b3s4b3s2b5s10k29.kbls4kb2s5bs3b4skb6l3bk28.kblsk6b4lb4lb2s7b3s2k29.klb2s3blb4lb4lb2ls4b4s2k30.kblbsb3lb4lb4lb4lblb4sk32.kl25b3sk34.k18bs9bk31.3kb2s3b5s2b4sb2sb2s3b3sb2k28.k7s2b5sb2sb4s2bsls2b3sb2l2k26.kb3s2k4s3k3sbklk2sb2lk4s2k3b2lk25.k2lbk2.k2sk3.ks2kl2ksbl2k.k2sk.k6sk25.2klk3.2k5.k2.k2.3k4.2k2.k2s4k28.k29.2k3344.","costas":"1432.3k60.kb2s3k3.2k53.kb4sk.kbs2k44.5k3.k2b3s3kb2sk42.kb4s4k3b4s2kb2sk42.k2b5s2kl2b4sklb2sk42.k3b5sl3b4sl2b2sk42.kl2b6s3b3sl2b3sk42.kl3b3sl3b2s2klb4s2k31.11kl3bs2bl6bl2bs3kbk29.k11sl6bl6bl2b4klsk29.2k3b5skbl4b4lb4l6bl2sk30.2kl3b2s3b2lb4lb4lb2l3blb2sk32.k2l4b3lb4lb4lb4lb2lb2sk33.kbl26b2sk33.kbl26bk32.2k2bs3bs3bs3bs3bs3bs3bs3b3k26.3k3sbs3bs3bs3bs3bs3bs3bs3b3lk24.k6sbs3bs3bs3bs3bs3bs3bs4b2sk23.k8bs3bs3bs3bs3bs3bs3bs3b2sk25.3k2l2bs3bs3bs3bs3bs3bs3bs3bs2k29.2k2ls3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.ks3b2s2bs3bs3bs3bs3bs3b2sk32.k7sb13s2bl6sk33.k5s2bsl11s2bl5sk35.4ksbkl11ksbl6k39.ksblk11.kslk45.3k13.2k2584.","lado":"1565.2k6.3k51.2kbsk2.3kb2sk49.k2bsk.2kbl2s2k49.kblbs2k2blbsk50.kbl3skb2lb2sk49.kblb2skblb3sk.7k41.kbl2b2skl2b3s2k2b3lbsk40.kl2b3s3b3s2b3lb4sk40.2k2b3s4b2s5b3s2k39.2k5b2s3lbls2lb4sb2k38.k5blb4lb4lbl3s4bk36.k3b3lb4lb4lb3l2slb3l3k33.ks26b3lk31.kbs25b5sk30.ks3b2s3bs3bs3bs3bs3b4s3k31.k3s2l2s2b3sbs3bs3bs3b2s2bk33.ks2l3k8sb5sbs3bs3bk34.3k3.k2s3k10s3bs3bk41.2k3.k2s5ks3bs3bsk47.2k5.ks2bs3bsk54.ks2bs3bl2k54.k2bs2bsb2lk53.k2bs2b3sk54.k2bs3bsk55.ksbs3bsk55.k3s2bsbk56.k6sk57.2k4sk59.4k2769."},"juba":{"frente":"1693.2k.2k50.2k6.kbskbsk5.3k40.kbsk5.klsklsk4.k2bsk39.kb2s2k2.klbslbsk3.kbl2sk40.kl3sk.klb2sb2s3k2l2sk41.klb3skl2b6sbl2b2sk41.kl2bs14b3sk34.8kl6b4lb4l3b2s8k26.k7sbl3blb4lb4lb2l4b5l2bk26.k2b4s2b3lb4lb4lb4lbl4b3sk28.kl2bs26b3sk30.kl27b3sk31.klb2s3b5s2b4sbsb3s3b3sbk31.2kl3s2b5sb12s2b4sk30.k3s3b3s3k3s4k3s3k5s3bk27.2k4s2bk2sk3.ksk4.ksk3.k4s3b3k24.k6s2bl2k5.k6.k5.2k2s3b3lk22.ks3b3s2blk20.k2s2bsl2sk23.2k2lb2s2blk20.k2s2bsl2k26.2kl2sblk21.k2s2bklk29.k2sblk21.k2s2bklk29.k2sblk21.k2s2bklk29.k2sblk22.ks2blk30.k2sblk22.ks2blk30.ks2blk22.k2sblk30.ksblk23.k2sblk30.ksblk23.k2sblk30.ksblk24.ksblk30.ksblk24.ksblk30.ksbk25.ksbk31.ksbk25.ksbk31.kbk27.ksk31.kbk27.ksk32.k28.ksk62.k2257.","frente_tras":"2190.2k.k27.k.2k28.k2sksk25.ksk2sk26.k6s2k21.2k5sk25.k9sk19.k8sk24.k10s2k15.2k10sk22.k13sk13.k13sk21.k14s2k9.2k14sk20.k17sk7.k17sk19.k18s2k3.2k18sk18.k21s3k21sk17.k45sk16.k46sk16.k47sk15.k5sk34sk6sk14.k5s2k35sk6sk13.k4sk.k17sk17s2k5sk13.k4sk.k17sk17sk.k4sk13.k3sk2.k16sk.k16sk2.k3sk13.k2sk3.k16sk.k16sk2.k3sk13.k2sk3.k6sk8sk2.k9sk6sk3.k2sk13.ksk4.k5s2k8sk3.k8sk6sk4.ksk13.ksk4.k4sk.k8sk3.k8s2k5sk4.ksk14.k5.k4sk.k7sk4.k8sk.k4sk5.k21.k3sk2.k7sk5.k7sk2.k3sk27.k3sk2.k7sk5.k6sk3.k2sk29.k2sk3.k5sk6.k6sk3.k2sk29.k2sk3.k5sk7.k5sk3.k2sk29.k2sk3.k5sk7.k5sk3.ksk31.2k4.k4sk9.k4sk4.k38.k4sk9.k4sk43.k4sk9.k3sk45.k3sk9.k3sk45.k3sk9.k3sk45.k2sk10.k3sk45.k2sk11.k2sk45.k2sk11.k2sk45.ksk12.ksk47.k14.k1561.","costas":"1631.k62.kbk61.kbsk48.k10.k2bsk10.k36.ks3k6.2klb2s3k4.3kbk36.kb2s6k2blb2s3b4k2lbsk36.k2b4s4bl2b3s4b2l2b2sk36.k2b5s3bl2b3s3bl3b2sk38.k3l3b6l4b5l3bk35.k2.k4lb15l4bk34.ks2kb21l4bk.3k28.k3s3bl20bs3bk2blk26.k4s32blk23.2k6s31blk22.kb6s27bs5blk21.k5sbs26b2s5blk21.k4sb3s28bs4blk20.k3s2b5s27bs3blk20.k2s3b6s19bs6bls3blk18.k2s3b9s15bs8bl2s2blk18.k2s3b12s7b3s11bl3s2blk16.k2s4b5sb5sb5s16bl4s2bk16.ks3bkl5sb5sb5s5bs5bl4bl4s2bk16.ks2bkl6sb5sb5s5bs5bl4blsk3sbk16.ks2bk6s2b5sb5s5bl5bls3bl2sk2sbk16.ksbk7s2b5sb5s4bsl5bls4bl2sksbk16.kbk7s3b5s2b4s4bsl5bls4bl2sk2sk16.kb8s3b5s2b4s4bls4bl3s3bl3sksk17.k8s3b5s2b4s4bls4bl3s3bl4sk17.k9s3b5s2b4s4bls4bl3s3bl4sk17.k9s3b5s2b4s4bls4bl3s3bl5sk15.k9s4bk3s3b4s3bsls4bl3s3bl5sk14.k6s2k2s3bkl3s4b3s3bl3s3bl4s2bl6sk12.k5s2k.k2s3bkl3s4b3s3bl3s3blk3s2b4k4sk10.k5sk3.k2s3blk3s4b3s3bl3s3blk3s2bk3.k4sk8.k3s3k4.k2s2b3k3s4b3s3bl3s2blk.k2s2bk4.2k3sk6.ks3k7.k2s2bk.k3s4b3s3bl3s2blk.k2sbk7.3ksk6.k11.ksbk2.k3s3b4s2bl4s2blk.k2sbk10.k19.ksbk3.k2s3bl3s2blk3s2blk2.ksbk30.ksbk3.k2s3bl3s2blk3s2blk2.ksbk30.ksbk3.k2s2b5s2b2k3s2bk3.ksbk30.ksbk3.k2s2bk4s2bk.k2s2bk3.ksbk30.ksk4.k2s2bk4s2bk.k2s2bk3.ksk32.k5.k2s2bk4sbk2.k2sbk5.k40.ks2bk4sbk2.k2sbk46.ks2bk4sbk2.k2sbk46.ks2bk4sbk2.k2sbk47.kb2k4sbk2.ksbk48.ks2k2sksbk3.kbk48.ks2k2sksk4.kbk48.ks2k2s2k6.k50.k.ksk61.ksk62.k1123.","lado":"1506.k62.kbk51.k8.2kbk50.kbk6.k2bsk50.kbsk5.klb2sk8.2k39.kb2sk3.kblb2sk4.4kbsk38.klb2sk.kblb3sk.3kb2lbsk39.klb3s2kblb3s2k2b2lb3sk39.klb4sbl2b4sb2l2b3sk40.k3l12b3lbl2bk38.2kbl4b4lb4l2bl2b3lbk36.k5blb4lb4lb3l2b2lblbk34.k3b3lb4lb4lb3l2bs4b2l3k31.k29b2lbk29.k24b2s5bl2sk28.kb5s3bs3bs3bs6b3s5b2lk28.k7s2b3sbs3bs6b2s4bl3blk27.k2s4k8sb5s4b2s4bls3bk28.2k4.k2s3k8s4bs6bls2bk35.2k3.k2s5k5bs5blbsbk41.2k4.k4b3s5blsbk46.ks3b2s7bl2sbk44.k2s3bs9bl2sk45.ks2bs10bl2sk46.k3s8bl2blsk45.k4s2bs5bl2blsk43.2k3s3b3s5bl2blk42.k5s2b4s5bl2blk42.k5s2b5s4bl2b2sk41.k5s3b5s3bl3bsk41.k5s4b5s3bl2bsk42.k5s4b5s2bl2bsk42.k5s4bl4s2blsbsk42.k5s4blb3s2blsbsk43.k4s4blb4s2blbsk43.k4s4blsb3s2bl2sk43.k4s3bl2sb3s2blsk45.k3s3bl2s2b2s2b2k46.k3s3bl2s2b3sbk47.k3s3bl2s3b2sbk47.k3s3bl2s3b2sbk47.k3s3bl3s2bksbk47.k3s3bl3s2bksbk48.k2s3blk2s2b2kbk48.k2s3blk2s2b2kbk48.k2s2b3k2sbk2.k50.ks2bk2.ksbk53.ks2bk2.ksbk53.ks2bk3.2k54.ks2bk59.ks2bk59.ksbk61.kbk61.kbk62.k1175."},"hime":{"frente":"1947.10k52.2k10b2k47.3k14b3k42.2k6b4lb4l5b2k39.k5blb4lb4lb2l5bk37.k3b3lb4lb4lb4lbl3bk35.k28bk34.k2b2s2b2s2b2s2bl2b2s2b2s2bl2bk33.ksblbsbslsbslsbsl2blsbsls2blsblk31.2ksl3sbl2sbslsblsbslsbslsbl2sblk30.k3s3b2slksbl2sblsbl2sblksb3s3bk30.k2s3b2s2ksklskblskl2skl2k4s2bsk30.k2s3blk2.k.2k.2ks4k.k2.k3s2blk30.k2s2bklk9.k8.k3s2blk30.k2s2bklk19.k2s2blk30.k2s2blk20.k2s2blk30.k2s2blk20.k2s2blk30.k2s2blk20.k2s2blk30.k2s2blk20.k2sblk31.k2s2blk20.k2sblk31.k2sbklk20.k2sblk31.k2sblk22.ksblk31.k2sblk22.ksblk32.ksblk22.ksblk32.ksblk22.ksblk32.ksbk23.ksbk33.ksbk23.ksbk33.ksk25.kbk33.ksk25.kbk33.kbk25.kbk33.kbk25.ksk33.kbk25.ksk34.k27.k2130.","frente_tras":"2640.32k31.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk30.k32sk31.5k4sk10s2k4s6k37.k2sk.k4sk4sk.k2sk43.ksk3.k2sk.k2sk2.ksk45.k4.ksk2.ksk4.k52.k4.k1182.","costas":"1947.10k52.2k10b2k47.3k14b3k42.2k6b4lb4l5b2k39.k5blb4lb4lb2l5bk37.k3b3lb4lb4lb4lbl3bk35.k28bk34.k28bk33.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.k3bs3bs3bs3bs3bs3bs3bs2bk32.k3bs3bs3bs3bs3bs3bs3bs2bk32.k3bs3bs3bs3bs3bs3bs3bs2bk32.k3bs3bs3bs3bs3bs3bs3bs2bk32.k3bs3bs3bs3bs3bs3bs3bs2bk32.k3bs3bs3bs3bs3bs3bs3bs2bk32.k3bs3bs3bs3bs3bs3bs3bs2bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.k30sk31.k3s2bsl21s2bsk32.k2s2bl3s2b3s6b2s3bk2s2blk32.k2sbkl3s2bk2s2bslbkls2bkl2sblk34.ksbl2k2s2bl2sbslbkl2s2bl2ksblk35.3k2.ksbklksblsbl2ksblk.ks2k41.ksk.2ks2ks2k.ks2k3.k44.k4.k2.k4.k1114.","lado":"1947.11k51.2k11b2k46.3k15b3k41.2k6b4lb4l6b2k38.k5blb4lb4lb3l5bk36.k3b3lb4lb4lb4lb2l3bk35.k27bk34.k29bk33.kb2sb2s3bs3bs3bs3bs3bs3bk33.k3sbl2s2b3sbs3bs3bs3bs3bk33.k3sblk8sb5sbs3bs3bk34.ksblk.k2s3k10s3bs3bk35.kblk2.2k3.k2s5ks3bs3bsk36.2k9.2k5.k3bs3bsbk53.k3bs3bsbk53.k3bs3bsbk53.k3bs3bsbk53.k3bs3bsbk53.k3bs3bsbk53.k2bs3bs2bk53.k2bs3bs2bk53.k2bs3bs2bk53.k2bs3bs2bk53.k2bs3bs2bk53.k2bs3bs2bk53.k2bs3bs2bk53.kbs3bs3bk53.kbs3bs3bk53.kbs3bs3bk53.kbs3bs3bk53.kbs3bs3bk53.kbs3bs3bk53.kbs3bs3bk53.ks3bs3bsk53.ks3bs3bsk53.ks3bs3bsk53.ks3bs3bsk53.ks3bs3bsk53.ks3bs3bsk53.ks3bs3bsk53.k3bs3bsbk52.2k9sk51.k2s2b2s3b2sk51.k2sbkls2bklk53.ksbl2s2blk54.kbklksblk56.k.2ks2k61.k1173."},"chiquinhas":{"frente":"1947.10k52.2k10b2k47.3k14b3k37.3k2.2k6b4lb4l5b2k2.3k27.k.k2lb2k5blb4lb4lb2l5b2k2lb2k24.ksk3l5b3lb4lb4lb4lbl3b3l3bk22.k3s37bk22.k3s6b2s2b2s2b2s2bl2b2s2b2s2bl8bk21.k4sbs2blbsbslsbslsbsl2blsbsls2bl2sbs4blk20.k4s4b3sbl2sbslsblsbslsbslsbl5s4blk20.k3s4blk3slksbl2sblsbl2sblksbl5s4blk19.k4s4bl2k2s2ksklskblskl2skl2k2s2k4s3blk19.k4s3bklk.2k2.k.2k.2ks4k.k2.2k2.k3s3blk19.k3s4blk13.k12.k4s2blk19.k3s3bklk27.k3s2blk19.k3s3bklk27.k3s3blk18.k3s2bklk28.k3s3blk18.k3s2bklk29.k2s3blk18.k2s3bklk29.k3s2blk18.k2s2bklk31.k2s2blk18.k2s2bklk31.k2s2blk18.k2s2bklk31.k2s2blk18.k2s2blk32.k2s2blk19.ks2blk32.k2sb2k20.ksb2k34.ksbk21.ksbk35.ksbk21.ksbk35.ksbk21.ksbk35.ksbk21.ksbk35.kbk23.ksk35.kbk23.ksk35.kbk23.ksk36.k25.k2163.","costas":"1947.10k52.2k10b2k47.3k14b3k37.3k2.2k6b4lb4l5b2k2.3k27.k.k2lb2k5blb4lb4lb2l5b2k2lb2k24.ksk3l5b3lb4lb4lb4lbl3b3l3bk22.k3s37bk22.k3s38bk21.k4sbs2bs3bs3bs3bs3bs3bs3b3sbs4blk20.k4s4bs3bs3bs3bs3bs3bs3b5s4blk20.k3s5bs3bs3bs3bs3bs3bs3b5s4blk19.k4s4bls3bs3bs3bs3bs3bs3bsb4s3blk19.k4s4bl3bs3bs3bs3bs3bs3bs3b3s3blk19.k3s4bls3bs3bs3bs3bs3bs3bs3b4s2blk19.k3s3bkls3bs3bs3bs3bs3bs3bs3b4s2blk19.k3s3bkls3bs3bs3bs3bs3bs3bs3b4s3blk18.k3s2bklbs3bs3bs3bs3bs3bs3bs3b4s3blk18.k3s2bklbs3bs3bs3bs3bs3bs3bs3bsk2s3blk18.k2s3bklbs3bs3bs3bs3bs3bs3bs3bsk3s2blk18.k2s2bklks3bs3bs3bs3bs3bs3bs3bsb2k2s2blk18.k2s2bklks3bs3bs3bs3bs3bs3bs3b2s2k2s2blk18.k2s2bklk30s2k2s2blk18.k2s2blk.k28sk.k2s2blk19.ks2blk2.28k2.k2sb2k20.ksb2k34.ksbk21.ksbk35.ksbk21.ksbk35.ksbk21.ksbk35.ksbk21.ksbk35.kbk23.ksk35.kbk23.ksk35.kbk23.ksk36.k25.k2163.","lado":"1947.11k51.2k11b2k46.3k15b3k2.k38.2k6b4lb4l6b2kbk36.k5blb4lb4lb3l7b2k33.k3b3lb4lb4lb4lbls5blk32.k22b3s4blk31.k22b4s4blk31.kb2sb2s3bs3bs3bs3bsb4s3blk31.k3sbl2s2b3sbs3bs3bsb5s3blk30.k3sblk8sb5sbs2b4s3blk31.ksblk.k2s3k10s3b4s2blk32.kblk2.2k3.k2s5ks3b5s2blk33.2k9.2k5.ks2bsb3s2blk51.ks2bsb3s2blk52.k2bs2b2s2blk52.k2bs2b2s2blk52.k2bs2b3s2blk51.ksbs2b3s2blk51.k3s2b3s2blk52.k7s2blk53.2k5sb2k56.3k2sbk59.k2sbk59.ksbk60.ksbk60.ksbk60.kbk61.kbk61.kbk60.kbk62.k2194.","lado_tras":"2089.k62.ksk59.2k2sk58.k5sk56.k6sk55.k8sk55.k7sk55.k7sk56.k6sk56.k6sk57.k5sk57.k5sk57.k5sk57.k5sk57.k5sk58.k4sk58.k3sk59.k3sk59.k3sk58.k3sk59.k3sk59.k2sk60.k2sk60.k2sk59.k2sk60.ksk60.ksk62.k2330."},"coque_duplo":{"frente":"1620.5k14.5k39.k5bk12.k5bk37.k7bk10.k7bk35.k2b3l4bk8.k2b3l4bk33.k3b3l5bk6.k3b3l5bk32.k3b3l5b8k3b3l5bk32.k30bk32.k30bk32.k11b4lb3l11bk33.k9s4lb4lb9sk35.k7s4lb4lb2l7sk35.k4bs18bs4bk34.k2b2s2b2s2b2s2bl2b2s2b2s2bl2bk33.ksblbsbslsbslsbsl2blsbsls2blsblk32.ksl3sbl2sbslsblsbslsbslsbl2sblk32.kslk3slksbl2sblsbl2sblksblskblk31.k2s2bk2s2ksklskblskl2skl2k4s2bsk30.k2sbkl2k2.k.2k.2ks4k.k2.2k2sbklk31.ksbklk10.k10.ksbklk31.ksblk22.ksblk32.ksblk22.ksblk32.ksblk22.ksklk33.3k23.ks2k61.k3027.","costas":"1620.5k14.5k39.k5bk12.k5bk37.k7bk10.k7bk35.k2b3l4bk8.k2b3l4bk33.k3b3l5bk6.k3b3l5bk32.k3b3l5b8k3b3l5bk32.k30bk32.k30bk32.k11b4lb3l11bk33.k9s4lb4lb9sk35.k7s4lb4lb2l7sk35.k4bs18bs4bk34.k28bk33.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.ks3bs3bs3bs3bs3bs3bs3b2sk32.k6s2bl14s2bl4sk33.k5sbl4s2bl2s2bl3sbl4sk35.4ksbl2k2sblk2sbl3ksbl4k39.ks2k2.ksbl2ksblk2.3k44.k5.3k.ks2k61.k2526.","lado":"1570.5k58.k5bk56.k7bk54.k2b3l4bk52.k3b3l5bk51.k3b3l5bk48.4k11bk46.2k15bk43.3k17bk41.2k6b4l9s2b2k38.k5blb4lbl7s5bk36.k3b3lb4lb3l2bs2blb2l3bk35.k27bk34.k29bk33.kb2sb2s3bs3bs3bs3bs3bs3bk33.k3sbl2s2b3sbs3bs3bs3bs3bk33.k3sblk8sb5sbs3bs3bk34.ksblk.k2s3k10s3bs3bk35.kblk2.2k3.k2s5ks3bs3bsk36.2k9.2k5.ks2bs3bsk54.ks2bs3bsk55.k2bs4bk55.k2bsbs2blk54.k2bsb2sblk54.ksbs2bsblk54.k3s2blsk56.k2s2blsk57.ksbl2sk58.ksl2k60.2k2707."},"rabo_alto":{"frente":"1947.10k52.2k10b2k47.3k14b3k42.2k6b4lb4l5b2k39.k5blb4lb4lb2l5bk37.k3b3lb4lb4lb4lbl3bk35.k28bk34.k2b2s2b2s2b2s2bl2b2s2b2s2bl2bk33.ksblbsbslsbslsbsl2blsbsls2blsblk32.ksl3sbl2sbslsblsbslsbslsbl2sblk32.kslk3slksbl2sblsbl2sblksblskblk31.k2s2bk2s2ksklskblskl2skl2k4s2bsk30.k2sbkl2k2.k.2k.2ks4k.k2.2k2sbklk31.ksbklk10.k10.ksbklk31.ksblk22.ksblk32.ksblk22.ksblk32.ksblk22.ksklk33.kbk23.ks2k34.kbk23.ksk36.k24.ksk62.k2899.","frente_tras":"2843.10k53.k10sk52.k10sk52.k10sk52.k10sk53.k8sk54.k8sk54.k8sk54.k8sk54.k8sk55.k6sk56.k6sk56.k6sk56.k6sk56.k6sk57.k4sk58.k4sk58.k4sk58.k4sk58.k4sk59.k2sk60.k2sk60.k2sk60.k2sk60.k2sk61.2k1695.","costas":"1947.10k52.2k10b2k47.3k14b3k42.2k6b4lb4l5b2k39.k5bl5s6b2l5bk37.k3b3lb5s6b3lbl3bk35.k8b5s15bk34.k8b5s5b2l8bk33.k2bs3bs2b5s5b2lbs3bs3bk32.k2bs3bs3b4s5b2lbs3bs3bk32.k2bs3bs3b4s4b2l2bs3bs3bk32.k2bs3bs3b4s4b2l2bs3bs3bk32.kbs3bs3b5s4b2lbs3bs3bsk32.kbs3bs3b5s4b2lbs3bs3bsk32.kbs3bs3b5s4b2lbs3bs3bsk32.kbs3bs3b5s4b2lbs3bs3bsk32.kbs3bs3bsb3s3b2l2bs3bs3bsk32.kbs3bs3bsb3s3b2l2bs3bs3bsk32.kbs3bs3bsb3s3b2l2bs3bs3bsk32.ks3bs3bs2b3s3b2lbs3bs3bsbk32.ks3bs3bs2b3s3b2lbs3bs3b2sk32.k14s3b2l11sk33.k13s2b2l11sk35.11k2s2b2l11k46.k2s2b2lk56.k2s3bk57.k2s3bk57.k2s3bk57.k2s2bk59.ks2bk59.ks2bk59.ks2bk59.ks2bk59.ks2bk59.ks2bk59.k2sk61.2k1888.","lado":"1835.3k59.2k2bl3k42.11k2.k5bl2bk39.2k11b2k.k5bl2bk35.3k15b2k6bl2bk32.2k6b4lb4l11bl3bk30.k5blb4lb4lb3l3b6sl3bk28.k3b3lb4lb4lb4lb2lb6sl3bk27.k25b7sl3bk25.k27b7sl3bk24.kb2sb2s3bs3bs3bs3bs3bs3b2k4sl2bk24.k3sbl2s2b3sbs3bs3bs3bs3bk.2k2sl2bk24.k3sblk8sb5sbs3bs3bk3.k2slbk25.ksblk.k2s3k10s3bs3bk3.k2sblk26.kblk2.2k3.k2s5ks3bs3bsk4.ks2blk26.2k9.2k5.ks2bs3bsk4.k2sbk45.ks2bs3bsk4.k2sbk46.k2bs3bsk5.ksbk46.k2bs3bsk5.ksbk46.k2bs3bsk4.k2sbk46.ksbs3bsk4.k2sk47.k3s2bsbk4.ksbk48.k6sk4.ksk50.2k4sk3.ksbk52.4k4.ksk61.kbk60.ksbk59.ksbk60.ksk60.ksk62.k2382."},"franja_lado":{"frente":"1947.10k52.2k10b2k47.3k14b3k42.2k6b4lb4l2bs2b2k39.k5blb4lb4lbl3s3bk37.k3b3lb4lb4lbl5s3bk35.k19b6s3bk34.k18b6s4bk33.kb2s3b5s2b4sb6s6bk30.3k4s2b5sb10s7bs2k28.k3s3b4s3k3s4k4s5b3s3bk28.k2s3bl2sk3.ksk2.k4s6b3s2bk29.k2s2bkl2k5.k2.k4s5b2lk2s2blk28.k2s2blk9.k4s4b2l3k2s2blk28.k2s2blk8.k3s4b2l2k2.k2s2blk28.k2s2blk6.2k2s3bk2l2k4.k2sblk29.k2s2blk5.k2s3b2k.2k6.k2sblk30.ksblk7.5k11.k2sblk30.ksblk24.ksblk30.ksbk25.ksbk31.ksk26.ksbk31.ksk27.kbk31.ksk27.kbk31.ksk28.k33.k2671.","costas":"1947.10k52.2k10b2k47.3k14b3k42.2k6b4lb4l5b2k39.k5blb4lb4lb2l5bk37.k3b3lb4lb4lb4lbl3bk35.k28bk34.k28bk33.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.k2bs3bs3bs3bs3bs3bs3bs3bk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.kbs3bs3bs3bs3bs3bs3bs3bsk32.ks3bs3bs3bs3bs3bs3bs3bsbk32.ks3bs3bs3bs3bs3bs3bs3b2sk32.k30sk31.k2s2bl24s2bk32.ksbl2k2s2blk2s2bl2blk2s2blk2sbklk31.ksbl2k2sbl2k2sblsbl2k2sblk.ksblk33.ksk2.ksblk.ksblsblk.ksblk.kbklk34.k4.3k2.ks2ks2k2.ks2k3.k.k46.k2.k5.k2457.","lado":"1947.11k51.2k11b2k45.4k15b3k41.ks6b4lb4l6b2k38.k3s2blb4lb4lb3l5bk36.k4s3b4lb4lb4lb2l3bk34.k4s24bk33.2k3s26bk31.k4s5b2ls3bs3bs3bs3bs3bk30.k3s4b3l2b3sbs3bs3bs3bs3bk29.ks4bs2l2k8sb5sbs3bs3bk30.8k2.k2s3k10s3bs3bk41.2k3.k2s5ks3bs3bsk47.2k5.k3bs3bsk54.k3bs3bsk54.k3bs3bsk54.k3bs3bsk54.k3bs3bsk54.k3bs3bsk54.k2bs3bsbk54.k2bs3bsbk54.k8sk53.k2s2b2s2bsk53.k2sbkls2blk54.ksblksblk55.kbklks2k57.k.k.k2516."},"repicado":{"frente":"1945.14k48.2k14b2k43.3k18b3k38.2k5b2lb4lb4lbl5b2k35.k5b3lb4lb4lb4l5bk33.k4b4lb4lb4lb4lb3l3bk31.k32bk30.k32bk29.ks3bs3bs3bs3bs3bs3bs3bs3bsbk28.ks3bs3bs3bs3bs3bs3bs3bs3bsbk28.ks3b2s2b3sb5sb3sb3s3b2s2bsbk28.ks2b4sb18sb4sbsbk28.ks2bs2k3s2k2s3k2s2k2s3k3s2k2sbsk28.k3sk2.ksk2.2k3.2k2.2k3.ksk2.k3sk29.k2sk3.k18.k3.k2sk31.2k28.2k3216.","costas":"1945.14k48.2k14b2k43.3k18b3k38.2k5b2lb4lb4lbl5b2k35.k5b3lb4lb4lb4l5bk33.k4b4lb4lb4lb4lb3l3bk31.k32bk30.k32bk29.ks3bs3bs3bs3bs3bs3bs3bs3bsbk28.ks3bs3bs3bs3bs3bs3bs3bs3bsbk28.ks3bs3bs3bs3bs3bs3bs3bs3bsbk28.ks3bs3bs3bs3bs3bs3bs3bs3bsbk28.k3bs3bs3bs3bs3bs3bs3bs3bs2bk28.k3bs3bs3bs3bs3bs3bs3bs3bs2bk28.k3bs3bs3bs3bs3bs3bs3bs3bs2bk28.k3bs3bs3bs3bs3bs3bs3bs3bs2bk28.k3bs3bs3bs3bs3bs3bs3bs3bs2bk28.k3bs3bs3bs3bs3bs3bs3bs3bs2bk28.k3bs3bs3bs3bs3bs3bs3bs3bs2bk28.k2bs3bs3bs3bs3bs3bs3bs3bs3bk28.ksbs3bs3bs3bs3bs3bs3bs3bs2bsk28.ksbs3bs3bs3bs3bs3bs3bs3bs2bsk29.k2s3bs3bs3bs3bs3bs3bs3bsbsk30.k3s2bs2b2sbsb2s2bs2b2sbsb2s2b3sk31.k30sk33.2k2sk2sk2sk2sk2sk2sk2sk2sk2s2k36.2k.2k.2k.2k.2k.2k.2k.2k.2k2515.","lado":"1945.15k47.2k15b2k42.3k19b3k37.2k5b2lb4lb4lb2l5b2k34.k5b3lb4lb4lb4l6bk32.k4b4lb4lb4lb4lb4l3bk31.k31bk30.k33bk29.k3bs3bs3bs3bs3bs3bs3bs3bsbk29.k3bs3bs3bs3bs3bs3bs3bs3bsbk29.k2sbs3b15sbs3bs3bsbk29.k4s2b18s3bs3bsbk30.2k5s15ks3bs3bs2bk32.k3sk15.k3bs3bs2bk33.3k16.k3bs3bs2bk52.k3bs3bs2bk52.k3bs3bs2bk52.k3bs3bs2bk52.k3bs3bs2bk52.k2bs3bs3bk52.k2bs3bs2bsk52.ksb2s2bs2bsk52.k9sk54.k2sk2sk2sk55.2k.2k.2k2640."},"bandana":{"frente":"2385.30k33.k30lk32.k30sk33.30k3537.","costas":"2385.30k33.k30lk32.k13s4b13sk33.13k4s13k47.4k59.k4.k57.klk2.klk56.kbk2.kbk56.kbk2.kbk56.kbk2.kbk56.kbk2.kbk56.ksk2.ksk57.k4.k2973.","lado":"2386.30k33.k30lk32.k26s2bsblk32.26k2sksbk58.2k.kbk61.kbk61.kbk61.kbk61.kbk61.kbk61.kbk61.ksk62.k2959."},"mascara":{"frente":"3218.28k35.ks26lsk35.k26bk36.ks24bsk37.k2s20b2sk39.2k3s14b3s2k42.3k14s3k47.14k2457.","costas":"6144.","lado":"3219.8k55.k8l3k52.ks7b3l3k50.k10b3l3k47.k2s11b3l3k45.2k3s11bl2sk46.3k12s2k50.12k2459."},"cachecol":{"frente":"3608.16k47.k16lk46.k16bk46.k16bk46.k12s4bk47.12ks2bsk59.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2sk61.2k1625.","costas":"3608.16k47.k16lk46.k16bk46.k16bk46.ks4b11sk47.ks2bs11k49.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2sk61.2k1444.","lado":"3610.12k51.k12lk50.k12bk50.k12bk50.k11sbk51.11ksk62.klk61.kblk60.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2bk60.k2sk61.2k1432."},"colete":{"frente":"3862.8k4.8k43.k7lsk2.ks7lk41.kl7bk4.k7blk40.k8bk4.k8bk40.k8bk4.k8bk40.k8bk4.k8bk40.k8bk4.k8bk40.k8bk4.k8bk40.k8bk4.k8bk40.k8bk4.k8bk40.k8bk4.k8bk40.k8bk4.k8bk40.k8bk4.k8bk40.k8sk4.k8sk41.8k6.8k1365.","costas":"3862.20k43.k20lk41.kl20blk40.k22bk40.k22bk40.k22bk40.k22bk40.k22bk40.k22bk40.k22bk40.k22bk40.k22bk40.k22bk40.k22sk41.22k1365.","lado":"3866.12k51.k12lk50.k12bk50.k12bk50.k12bk50.k12bk50.k12bk50.k12bk50.k12bk50.k12bk50.k12bk50.k12bk50.k12bk50.k12sk51.12k1370."},"capa":{"frente":"3803.10k53.k10sk53.10k2203.","frente_tras":"3924.24k39.k24sk38.k24sk38.k24sk38.k24sk38.k24sk38.k24sk38.k24sk38.k24sk37.k26sk36.k26sk36.k26sk36.k26sk36.k26sk36.k26sk36.k26sk36.k26sk36.k26sk35.k28sk34.k28sk34.k28sk34.k28sk34.k28sk34.k28sk34.k28sk35.28k594.","costas":"3797.22k41.k22lk40.k22bk40.k22bk40.k22bk40.k22bk40.k22bk40.k22bk40.k22bk39.kl22blk38.k24bk38.k24bk38.k24bk38.k24bk38.k24bk38.k24bk38.k24bk38.k24bk37.kl24blk36.k26bk36.k26bk36.k26bk36.k26bk36.k26bk36.k26bk36.k26bk36.k26sk37.26k595.","lado":"3805.7k56.k7sk56.7k2204.","lado_tras":"3876.5k58.k5sk57.k5sk57.k5sk57.k5sk57.k5sk57.k5sk57.k5sk57.k5sk57.k6sk56.k6sk56.k6sk56.k6sk56.k6sk56.k6sk56.k6sk56.k6sk56.k6sk56.k7sk55.k7sk55.k7sk55.k7sk55.k7sk55.k7sk55.k7sk55.k7sk56.7k597."}});
  // </pxl:pecas>
  function arteDaPxl(peca, view) {
    const s = PXL_ARTE[peca] && PXL_ARTE[peca][view];
    if (!s) return null;
    // Cada trecho é uma contagem (opcional) e uma letra: . vazio, k contorno, s sombra, b base, l luz.
    const g = newMask(); let i = 0; const re = /(\d*)([.ksbl])/g; let mt;
    while ((mt = re.exec(s))) { const t = '.ksbl'.indexOf(mt[2]); const n = mt[1] ? +mt[1] : 1; for (let k = 0; k < n; k++) g[i++] = t; }
    return g;
  }
  const SOMBRA_PADRAO = (c) => (c.dB <= 1 ? SHADE : c.dT >= 2 && c.dT <= 3 && c.y <= HY + 6 ? LIGHT : null);
  // Cabelo: sombra embaixo, faixa de luz no topo, mechas em sombra subindo da ponta e pontos de brilho entre elas.
  // Fios: anel de brilho no alto da cabeça, fios finos de sombra descendo e pontas escuras.
  const SOMBRA_FIOS = (c) => {
    if (c.dB <= 1) return SHADE;
    if (c.y >= HY + 3 && c.y <= HY + 4 && c.dT >= 2 && (c.x + c.y) % 5 !== 0) return LIGHT;
    if (c.y > HY + 6 && (c.x + Math.floor(c.y / 7)) % 4 === 0) return SHADE;
    if (c.y > HY + 8 && (c.x + Math.floor(c.y / 7)) % 4 === 2 && c.dT % 6 < 2) return LIGHT;
    return null;
  };
  const SOMBRA_CABELO = (c) => {
    if (c.dB <= 1) return SHADE;
    if (c.dT >= 2 && c.dT <= 3 && c.y <= HY + 6) return LIGHT;
    if ((c.ax + (c.y >> 1)) % 5 === 0 && c.dB >= 2 && c.dB <= 7) return SHADE;
    if ((c.ax + (c.y >> 1)) % 5 === 2 && c.dT >= 5 && c.dT <= 6 && c.y <= HY + 12) return LIGHT;
    return null;
  };

  // Roupas coladas ao corpo (modo cor): só dizem quais partes mudam de cor.
  definirPeca({ id: 'regata', tipo: 'superior', modo: 'cor', partes: [PART.tronco] });
  definirPeca({ id: 'camiseta', tipo: 'superior', modo: 'cor', partes: [PART.tronco, PART.braco] });
  definirPeca({ id: 'manga_longa', tipo: 'superior', modo: 'cor', partes: [PART.tronco, PART.braco, PART.antebraco] });
  definirPeca({ id: 'shorts', tipo: 'inferior', modo: 'cor', partes: [PART.quadril, PART.coxa] });
  definirPeca({ id: 'calca', tipo: 'inferior', modo: 'cor', partes: [PART.quadril, PART.coxa, PART.canela] });
  definirPeca({ id: 'calcado', tipo: 'pes', modo: 'cor', partes: [PART.pe] });
  definirPeca({ id: 'luvas', tipo: 'maos', modo: 'cor', partes: [PART.mao] });

  // Peças com forma própria (modo forma): desenham uma máscara por direção. `desenho(view, k)` devolve
  // { frente, tras, metal }: frente fica na camada da peça, tras atrás do corpo, metal é pintado em aço.
  function cabeloBase(view, k) {
    const m = k.nova();
    for (let i = -1; i <= (view === 'costas' ? 22 : 9); i++) k.cabeca(m, view, i, 1);
    if (view === 'lado') {
      // Em volta da orelha o cabelo desce em escadinha: têmpora na frente, contorno por cima e nuca atrás.
      const de = { 10: 27, 11: 30, 12: 38, 13: 38, 19: 40, 20: 41, 21: 43 };
      for (let i = 10; i <= 21; i++) k.linhas(m, HY + i, [[de[i] || 39, HEAD_SIDE[i][1] + 1]]);
      k.linhas(m, HY + 12, [[31, 32], [32, 32]]);                                             // costeleta
      k.linhas(m, HY + 10, [[18, 19], [18, 18]]); k.linhas(m, HY + 10, [[24, 26], [25, 26], [25, 25]]); // franja
    } else if (view === 'frente') {
      [[2, 4], [8, 11], [14, 16]].forEach(([a, b]) => { for (let y = HY + 10; y <= HY + 11; y++) { k.linhas(m, y, [[32 + a, 31 + b + 1]]); k.linhas(m, y, [[31 - b, 31 - a]]); } }); // franja
      for (let y = HY + 12; y <= HY + 15; y++) { k.linhas(m, y, [[46, 47]]); k.linhas(m, y, [[16, 17]]); } // costeletas
    }
    return m;
  }
  definirPeca({ id: 'curto', tipo: 'cabelo', modo: 'forma', camada: 'cabelo', parte: PART.cabelo, sombra: SOMBRA_CABELO,
    desenho: (view, k) => ({ frente: cabeloBase(view, k) }) });
  definirPeca({ id: 'espetado', tipo: 'cabelo', modo: 'forma', camada: 'cabelo', parte: PART.cabelo, sombra: SOMBRA_CABELO,
    desenho(view, k) {
      const m = cabeloBase(view, k); const lado = view === 'lado';
      // Pontas em mechas que saem de dentro da calota (assim ficam presas à cabeça, sem flutuar).
      if (lado) k.mechas(m, [[23, HY + 2, -100, 8, 7], [30, HY + 1, -88, 9, 7], [37, HY + 1, -72, 9, 7], [43, HY + 3, -55, 8, 7]]);
      else k.mechasSim(m, [[34, HY + 1, -92, 9, 7], [40, HY + 2, -75, 8, 7], [45, HY + 4, -55, 7, 6]]);
      return { frente: m };
    } });
  definirPeca({ id: 'longo', tipo: 'cabelo', modo: 'forma', camada: 'cabelo', parte: PART.cabelo, sombra: SOMBRA_FIOS,
    desenho(view, k) {
      const m = cabeloBase(view, k); const tras = k.nova();
      if (view === 'lado') {
        // Desce atrás da orelha sem degrau: a borda da frente fica em 39 desde a orelha e a ponta afina no fim.
        for (let y = HY + 14; y <= HY + 40; y++) {
          const fim = HY + 40 - y;
          k.linhas(m, y, [[39 + (fim < 3 ? 3 - fim : 0), 47 - (fim < 4 ? 4 - fim : 0)]]);
        }
      }
      else if (view === 'costas') for (let y = HY + 23; y <= HY + 40; y++) k.simetrico(m, y, [y > HY + 37 ? 12 : 14]);
      else {
        for (let y = HY + 10; y <= HY + 40; y++) k.simetrico(tras, y, [y > HY + 37 ? 14 : 16]);    // por trás do corpo
        k.mechasSim(m, [[45, HY + 10, 92, 16, 6, -4]]);                                          // mechas do rosto
      }
      if (view === 'frente') k.mechasSim(m, [[34, HY + 6, 96, 7, 5], [39, HY + 6, 92, 6, 5], [43, HY + 6, 88, 6, 4]]); // franja em fios
      return { frente: m, tras };
    } });
  // ---- Cabelos de mechas (inspirados em estilos de anime ninja, desenho próprio). Nomes são códigos provisórios.
  // Ouriço: curto e cheio de pontas grossas em volta de toda a cabeça, franja em pontas até a sobrancelha.
  definirPeca({ id: 'ourico', tipo: 'cabelo', modo: 'forma', camada: 'cabelo', parte: PART.cabelo, sombra: SOMBRA_CABELO,
    desenho(view, k) {
      const m = cabeloBase(view, k);
      if (view === 'lado') k.mechas(m, [[24, HY + 2, -115, 7, 6], [30, HY + 1, -95, 8, 7], [36, HY + 2, -70, 8, 7, 10], [42, HY + 5, -40, 8, 7, 10],
        [45, HY + 11, -10, 7, 6, 15], [45, HY + 17, 20, 6, 5, 10], [20, HY + 6, 160, 5, 5, -20], [22, HY + 9, 120, 4, 4]]);
      else if (view === 'costas') k.mechasSim(m, [[33, HY + 1, -88, 8, 7], [39, HY + 2, -60, 8, 7, 8], [44, HY + 6, -30, 8, 7, 10], [46, HY + 12, -5, 7, 6, 10],
        [45, HY + 18, 30, 6, 5], [37, HY + 22, 80, 5, 5], [32, HY + 22, 95, 5, 5]]);
      else k.mechasSim(m, [[33, HY + 1, -88, 8, 7], [39, HY + 2, -60, 8, 7, 8], [44, HY + 6, -30, 8, 7, 10], [46, HY + 12, -5, 6, 6, 10],
        [34, HY + 7, 95, 5, 5], [40, HY + 7, 80, 5, 5]]);
      return { frente: m };
    } });
  // Topete torto: alto e jogado para um lado, como se o vento empurrasse; uma mecha cai sobre a testa.
  definirPeca({ id: 'topete_torto', tipo: 'cabelo', modo: 'forma', camada: 'cabelo', parte: PART.cabelo, sombra: SOMBRA_CABELO,
    desenho(view, k) {
      const m = cabeloBase(view, k);
      const dir = view === 'costas' ? -1 : 1;                          // de costas o lado inverte
      const L = (x, y, a, c, l, cv) => [32 + dir * (x - 32), y, dir === 1 ? a : 180 - a, c, l, dir === 1 ? cv : -(cv || 0)];
      if (view === 'lado') k.mechas(m, [[26, HY + 2, -80, 11, 8, 25], [32, HY + 1, -60, 12, 8, 20], [38, HY + 3, -40, 11, 8, 15], [43, HY + 7, -15, 9, 7, 10],
        [45, HY + 14, 15, 6, 5], [21, HY + 6, 140, 6, 5, -10]]);
      else {
        k.mechas(m, [L(20, HY + 5, -110, 7, 7, 30), L(25, HY + 1, -80, 11, 8, 25), L(31, HY, -62, 13, 9, 20), L(37, HY + 1, -45, 13, 9, 15),
          L(43, HY + 4, -25, 11, 8, 10), L(46, HY + 10, -5, 8, 6, 10), L(17, HY + 10, 200, 5, 5)]);
        if (view === 'frente') k.mechas(m, [L(38, HY + 7, 125, 7, 5, 10), L(31, HY + 8, 110, 5, 4)]);   // mecha sobre a testa
        else k.mechas(m, [L(40, HY + 20, 70, 6, 6), L(26, HY + 20, 100, 6, 6)]);
      }
      return { frente: m };
    } });
  // Juba: volume revolto em cima e uma juba longa e grossa descendo pelas costas até a cintura, com pontas soltas.
  // Juba: cabeleira enorme e revolta, em leque de pontas grossas que desce pelas costas até a cintura;
  // em cima, pontas curtas espetadas; na frente, duas mechas grossas emoldurando o rosto até o peito.
  definirPeca({ id: 'juba', tipo: 'cabelo', modo: 'forma', camada: 'cabelo', parte: PART.cabelo, sombra: SOMBRA_CABELO,
    desenho(view, k) {
      const m = cabeloBase(view, k); const tras = k.nova();
      const topo = [[33, HY + 1, -90, 7, 7], [39, HY + 2, -62, 8, 7, 10], [44, HY + 6, -32, 8, 7, 10], [46, HY + 12, -8, 7, 6, 15]];
      // De lado e de costas a juba é o desenho feito na pxl (arte/boneco-base/pxl/juba.px.js) sobre a calota do gerador.
      if (view === 'lado') {
        k.mechas(m, [[26, HY + 1, -105, 6, 6], [33, HY, -78, 8, 7, 10], [40, HY + 2, -50, 9, 7, 10], [45, HY + 6, -22, 9, 7, 15]]);
        // Leque de pontas saindo da nuca, da mais alta (quase na horizontal) à mais baixa (descendo pelas costas).
        k.mechas(m, [[44, HY + 8, 10, 13, 10, 30], [44, HY + 12, 35, 18, 11, 25], [43, HY + 15, 58, 24, 12, 18],
          [42, HY + 17, 75, 28, 12, 10], [40, HY + 19, 88, 30, 11, 4], [45, HY + 20, 65, 22, 9, 15]]);
        k.mecha(m, 22, HY + 8, 100, 18, 6, -6);                                                  // mecha da frente
      } else if (view === 'costas') {
        k.mechasSim(m, topo);
        k.mechasSim(m, [[33, HY + 12, 90, 32, 14, -3], [38, HY + 11, 78, 30, 13, 8], [43, HY + 10, 62, 26, 12, 15],
          [46, HY + 9, 42, 20, 10, 25], [47, HY + 8, 20, 14, 8, 30]]);
      } else {
        k.mechasSim(m, topo);
        k.mechasSim(m, [[45, HY + 9, 90, 24, 7, -6]]);                                            // mechas do rosto até o peito
        k.mechasSim(tras, [[40, HY + 8, 55, 26, 15, 18], [45, HY + 8, 30, 22, 12, 30], [36, HY + 12, 78, 30, 14, 6]]);
      }
      return { frente: m, tras };
    } });
  // ---- Cabelos femininos (referência de padrões: franja em fios, mechas do rosto, penteados, anel de brilho).
  const FRANJA_FIOS = [[33, HY + 6, 94, 7, 5], [37, HY + 6, 90, 7, 5], [41, HY + 6, 86, 6, 5], [45, HY + 7, 88, 5, 4]];
  const fem = (id, desenho) => definirPeca({ id, tipo: 'cabelo', modo: 'forma', camada: 'cabelo', parte: PART.cabelo, sombra: SOMBRA_FIOS, desenho });
  // Hime: liso e longo, franja reta em fios, mechas do rosto até o peito e cabelo descendo pelas costas.
  fem('hime', (view, k) => {
    const m = cabeloBase(view, k); const tras = k.nova();
    if (view === 'frente') {
      k.mechasSim(m, FRANJA_FIOS); k.mechasSim(m, [[45, HY + 9, 91, 24, 7, -3]]);
      for (let y = HY + 10; y <= HY + 42; y++) k.simetrico(tras, y, [17]);
      k.mechasSim(tras, [[40, HY + 40, 92, 6, 8], [34, HY + 41, 90, 6, 8]]);
    } else if (view === 'costas') {
      for (let y = HY + 10; y <= HY + 42; y++) k.simetrico(m, y, [16]);
      k.mechasSim(m, [[44, HY + 41, 95, 6, 7], [38, HY + 42, 92, 6, 8], [33, HY + 42, 90, 6, 7]]);
    } else {
      for (let y = HY + 12; y <= HY + 42; y++) k.linhas(m, y, [[38, 48]]);
      k.mechas(m, [[43, HY + 41, 95, 6, 8], [39, HY + 41, 100, 5, 6], [21, HY + 7, 100, 8, 5]]);
    }
    return { frente: m, tras };
  });
  // Chiquinhas: franja em fios e duas caudas presas no alto, abrindo para fora e descendo até o peito.
  fem('chiquinhas', (view, k) => {
    const m = cabeloBase(view, k); const tras = k.nova();
    if (view === 'lado') {
      k.mecha(m, 21, HY + 7, 100, 8, 5);
      k.mecha(m, 43, HY + 4, 55, 28, 10, 30);                                                    // cauda de perto
      k.mecha(tras, 39, HY + 4, 60, 26, 9, 35);                                                  // cauda de trás
    } else {
      if (view === 'frente') k.mechasSim(m, FRANJA_FIOS);
      k.mechasSim(m, [[47, HY + 6, 62, 27, 10, 22]]);                                            // as duas caudas
      k.mechasSim(m, [[47, HY + 5, 0, 2, 6]]);                                                   // nó das caudas
    }
    return { frente: m, tras };
  });
  // Coque duplo: dois coques redondos no alto, franja em fios e pontas curtas na nuca.
  fem('coque_duplo', (view, k) => {
    const m = cabeloBase(view, k);
    if (view === 'lado') { k.mecha(m, 36, HY - 1, 0, 1, 12); k.mecha(m, 21, HY + 7, 100, 8, 5); k.mechas(m, [[43, HY + 18, 80, 6, 6], [45, HY + 15, 60, 6, 5]]); }
    else {
      k.mechasSim(m, [[41, HY, 0, 1, 12]]);
      if (view === 'frente') k.mechasSim(m, FRANJA_FIOS.concat([[45, HY + 10, 92, 9, 5]]));
      else k.mechasSim(m, [[34, HY + 21, 92, 5, 6], [40, HY + 20, 88, 5, 6]]);
    }
    return { frente: m };
  });
  // Rabo alto: preso no topo de trás, sobe um pouco e cai em curva até as costas; franja em fios.
  fem('rabo_alto', (view, k) => {
    const m = cabeloBase(view, k); const tras = k.nova();
    if (view === 'lado') { k.mecha(m, 43, HY + 3, -20, 27, 11, 100); k.mecha(m, 21, HY + 7, 100, 8, 5); }
    else if (view === 'costas') { k.mecha(m, 32, HY + 3, 90, 34, 12, 0); k.mecha(m, 31, HY + 3, 90, 34, 12, 0); }
    else { k.mechasSim(m, FRANJA_FIOS); k.mechasSim(m, [[45, HY + 10, 92, 10, 5]]); k.mecha(tras, 32, HY + 14, 90, 26, 12); }
    return { frente: m, tras };
  });
  // Franja de lado: chanel até o queixo com uma franja grande varrida para o lado, cobrindo um olho.
  fem('franja_lado', (view, k) => {
    const m = cabeloBase(view, k);
    if (view === 'frente') {
      k.mecha(m, 43, HY + 5, 128, 21, 11, 18);                                                   // franja cobrindo o olho
      k.mechasSim(m, [[46, HY + 9, 94, 15, 7, -6]]);
    } else if (view === 'costas') {
      for (let y = HY + 10; y <= HY + 22; y++) k.simetrico(m, y, [15]);
      k.mechasSim(m, [[45, HY + 21, 100, 5, 6], [39, HY + 22, 92, 5, 6], [33, HY + 22, 90, 5, 6]]);
    } else {
      for (let y = HY + 12; y <= HY + 22; y++) k.linhas(m, y, [[38, 47]]);
      k.mechas(m, [[44, HY + 21, 95, 5, 7], [40, HY + 21, 100, 5, 6], [24, HY + 4, 130, 12, 9, 20]]);
    }
    return { frente: m };
  });

  // Referência Graal: volume que passa do crânio, borda feita de pontas de mecha (serrilhada), franja em mechas
  // pontudas cobrindo a testa até a sobrancelha e sombra separando as mechas.
  definirPeca({ id: 'repicado', tipo: 'cabelo', modo: 'forma', camada: 'cabelo', parte: PART.cabelo, sombra: SOMBRA_CABELO,
    desenho(view, k) {
      const m = k.nova(); const lado = view === 'lado';
      const fim = view === 'costas' ? 24 : lado ? 22 : 13;
      for (let i = -3; i <= fim; i++) k.cabeca(m, view, Math.max(i, -1), i < -1 ? 1 : 3);
      // Borda de baixo e das laterais em pontas: uma mecha a cada 3 pixels, ponta de 2 linhas.
      const ys = []; for (let y = HY + fim - 1; y <= HY + fim + 2; y++) ys.push(y);
      for (let x = 10; x <= 54; x++) {
        const dente = x % 3;
        if (dente === 0) continue;
        for (let y = HY + fim + 1; y <= HY + fim + (dente === 1 ? 2 : 1); y++) if (m[(HY + fim) * k.W + x]) m[y * k.W + x] = 1;
      }
      if (view === 'frente') {
        // Rosto livre de y +12 para baixo, entre as costeletas; franja em 5 mechas pontudas.
        for (let y = HY + 12; y <= HY + fim + 3; y++) k.apagar(m, y, [[19, 44]]);
        [[20, 24], [25, 29], [30, 33], [34, 38], [39, 43]].forEach(([a, b], n) => {
          for (let j = 0; j <= 3; j++) k.linhas(m, HY + 10 + j, [[a + Math.ceil(j / 2), b - Math.floor(j / 2) - (n % 2)]]);
        });
      }
      if (lado) {
        for (let y = HY + 12; y <= HY + fim + 3; y++) k.apagar(m, y, [[10, 37]]);
        for (let j = 0; j <= 3; j++) k.linhas(m, HY + 10 + j, [[16 + j, 24 - j]]);           // mecha da franja
      }
      return { frente: m };
    } });
  definirPeca({ id: 'bandana', tipo: 'bandana', modo: 'forma', camada: 'bandana', parte: PART.bandana,
    sombra: (c) => (c.dB === 1 ? SHADE : null),
    desenho(view, k) {
      const m = k.nova();
      for (let i = 6; i <= 9; i++) k.cabeca(m, view, i, 1);
      if (view === 'costas') { k.linhas(m, HY + 8, [[30, 33], [30, 33], [30, 33]]); for (let y = HY + 11; y <= HY + 18; y++) { k.linhas(m, y, [[28, 30]]); k.linhas(m, y, [[33, 35]]); } }
      if (view === 'lado') { k.linhas(m, HY + 7, [[47, 49], [47, 49], [47, 49]]); for (let y = HY + 10; y <= HY + 18; y++) k.linhas(m, y, [[47, 49]]); for (let y = HY + 10; y <= HY + 15; y++) k.linhas(m, y, [[44, 45]]); }
      // Placa de metal na testa (de costas não aparece).
      const metal = view === 'costas' ? null : k.linhas(k.nova(), HY + 6, [0, 1, 2, 3].map(() => (view === 'lado' ? [17, 23] : [26, 37])));
      return { frente: m, metal };
    } });
  definirPeca({ id: 'mascara', tipo: 'acessorio', modo: 'forma', camada: 'acessorio', parte: PART.acessorio,
    sombra: (c) => (c.dB <= 1 ? SHADE : null),
    desenho(view, k) {
      const m = k.nova();
      if (view === 'lado') {
        // De lado a borda de cima desce um degrau a cada 3 pixels, do nariz até sumir na nuca.
        for (let i = 19; i <= 26; i++) k.linhas(m, HY + i, [[HEAD_SIDE[i][0], Math.min(HEAD_SIDE[i][1], 26 + 3 * (i - 19))]]);
      }
      else for (let i = 19; i <= (view === 'costas' ? 20 : 26); i++) k.simetrico(m, HY + i, [HEAD_HW[i]]);
      return { frente: m };
    } });
  definirPeca({ id: 'cachecol', tipo: 'acessorio', modo: 'forma', camada: 'acessorio', parte: PART.acessorio,
    sombra: (c) => (c.dB <= 1 || c.y === 59 ? SHADE : null),
    desenho(view, k) {
      const m = k.nova();
      if (view === 'lado') { for (let y = 56; y <= 61; y++) k.linhas(m, y, [[25, 38]]); for (let y = 62; y <= 73; y++) k.linhas(m, y, [[37, 40]]); }
      else { for (let y = 56; y <= 61; y++) k.simetrico(m, y, [9]); for (let y = 62; y <= (view === 'costas' ? 73 : 70); y++) k.linhas(m, y, [view === 'costas' ? [25, 28] : [36, 39]]); }
      return { frente: m };
    } });

  // Peças de forma presas ao tronco: desenhadas para o boneco parado (tronco de y 60 a 76), o gerador move com o corpo.
  definirPeca({ id: 'colete', tipo: 'tronco', modo: 'forma', camada: 'roupa', camadaTras: 'costas_tras', parte: PART.peca,
    sombra: (c) => (c.dB <= 1 || (c.ax === 2 && c.y >= 62) ? SHADE : c.dT === 1 ? LIGHT : null),
    desenho(view, k) {
      const m = k.nova();
      if (view === 'lado') for (let y = 60; y <= 74; y++) k.linhas(m, y, [[25, 38]]);
      else {
        for (let y = 60; y <= 74; y++) k.simetrico(m, y, [y === 60 ? 10 : 12]);
        if (view === 'frente') for (let y = 62; y <= 74; y++) k.apagar(m, y, [[30, 33]]);     // aberto na frente
      }
      return { frente: m };
    } });
  definirPeca({ id: 'capa', tipo: 'tronco', modo: 'forma', camada: 'roupa', camadaTras: 'costas_tras', parte: PART.peca,
    sombra: (c) => (c.dB <= 2 || c.ax % 6 === 5 ? SHADE : null),
    desenho(view, k) {
      const m = k.nova(); const tras = k.nova();
      if (view === 'lado') {
        for (let y = 60; y <= 86; y++) k.linhas(tras, y, [[35, 41 + Math.floor((y - 60) / 9)]]);
        for (let y = 59; y <= 61; y++) k.linhas(m, y, [[28, 36]]);                            // gola
      } else if (view === 'costas') for (let y = 59; y <= 86; y++) k.simetrico(m, y, [12 + Math.floor((y - 59) / 9)]);
      else {
        for (let y = 61; y <= 86; y++) k.simetrico(tras, y, [13 + Math.floor((y - 61) / 9)]);
        for (let y = 59; y <= 61; y++) k.simetrico(m, y, [6]);                                // gola
      }
      return { frente: m, tras };
    } });

  // Estampas: desenho chapado sobre a roupa de cima, numa cor só. Só aparece onde existe tronco.
  definirPeca({ id: 'espiral', tipo: 'estampa', modo: 'estampa',
    desenho(view, k) {
      const m = k.nova();
      if (view === 'lado') return { frente: m };
      // Anel grande no meio do peito (ou das costas), ponto no centro e a cauda saindo para a direita.
      const cx = 31.5; const cy = 66.5; const r = 4.6;
      for (let y = 60; y <= 74; y++) for (let x = 20; x <= 44; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if ((d <= r && d >= r - 1.3) || d < 1) m[y * k.W + x] = 1;
      }
      k.linhas(m, 66, [[32, 35], [32, 35]]);
      return { frente: m };
    } });
  definirPeca({ id: 'listra', tipo: 'estampa', modo: 'estampa',
    desenho: (view, k) => ({ frente: k.linhas(k.nova(), 66, [[10, 54], [10, 54]]) }) });
  definirPeca({ id: 'chama', tipo: 'estampa', modo: 'estampa',
    desenho(view, k) {
      const m = k.nova();
      for (let x = 10; x <= 54; x++) { m[71 * k.W + x] = 1; m[70 * k.W + x] = 1; if (x % 4 < 2) m[69 * k.W + x] = 1; if (x % 4 === 0) m[68 * k.W + x] = 1; }
      return { frente: m };
    } });

  const CATALOGO = { cores: Object.keys(TECIDOS) };
  TIPOS.forEach((t) => { CATALOGO[t] = ['nenhum'].concat(Object.keys(PECAS).filter((id) => PECAS[id].tipo === t)); });

  // Confere todas as peças contra o padrão. Devolve a lista de problemas (vazia quando está tudo certo).
  function validarPecas() {
    const erros = [];
    Object.keys(PECAS).forEach((id) => {
      const pc = PECAS[id];
      if (pc.modo === 'cor') {
        if (!Array.isArray(pc.partes) || !pc.partes.length || pc.partes.some((x) => x < 1 || x > 9)) erros.push(id + ': partes devem ser do corpo (1 a 9)');
        return;
      }
      if (pc.modo === 'estampa') {
        const algum = ['frente', 'costas', 'lado'].some((view) => { const d = pc.desenho(view, KIT); return d && d.frente && d.frente.some((v) => v); });
        if (!algum) erros.push(id + ': estampa sem desenho em nenhuma direção');
        return;
      }
      if (!LAYERS.includes(pc.camada)) erros.push(id + ': camada desconhecida');
      if (![PART.cabelo, PART.bandana, PART.acessorio, PART.peca].includes(pc.parte)) erros.push(id + ': parte de cor inválida');
      ['frente', 'costas', 'lado'].forEach((view) => {
        let d;
        try { d = pc.desenho(view, KIT); } catch (e) { erros.push(id + ' (' + view + '): ' + e.message); return; }
        const cheio = (g) => g && g.length === W * H && g.some((v) => v);
        if (!d || (!cheio(d.frente) && !cheio(d.tras))) erros.push(id + ' (' + view + '): falta o desenho desta direção');
      });
    });
    return erros;
  }

  // Desenha peças de forma: `frente` na camada da peça, `tras` na camada de trás dela, `metal` em aço.
  function shapePieces(L, view, ids) {
    ids.forEach((id) => {
      const pc = PECAS[id];
      if (!pc || pc.modo !== 'forma') return;
      const d = pc.desenho(view, KIT) || {};
      const back = pc.camadaTras || 'cabelo_tras';
      // Toda peça desenhada passa pela pxl: quando há arte importada para esta direção, ela substitui o desenho do gerador.
      const arte = arteDaPxl(id, view); const arteT = arteDaPxl(id, view + '_tras');
      if (arte || arteT) {
        [[arte, L[pc.camada]], [arteT, L[back]]].forEach(([a, g]) => {
          if (!a) return;
          for (let i = 0; i < g.length; i++) if (a[i]) g[i] = a[i];
          tag(g, () => pc.parte);
        });
        if (d.metal) paint(L[pc.camada], d.metal, METAL, null);
        return;
      }
      if (d.frente) { paint(L[pc.camada], d.frente, SKIN, pc.sombra || SOMBRA_PADRAO); tag(L[pc.camada], () => pc.parte); }
      if (d.tras) { paint(L[back], d.tras, SKIN, pc.sombra || SOMBRA_PADRAO); tag(L[back], () => pc.parte); }
      if (d.metal) paint(L[pc.camada], d.metal, METAL, null);
      // Desenho pronto (vindo da pxl): já tem contorno e tons; só ganha a parte, para trocar de cor.
    });
  }
  // Balanço: o cabelo abaixo da linha da orelha entorta, mais na ponta que na raiz. `amt` em pixels na ponta
  // (de lado, positivo = para trás; de frente, positivo = para a direita da imagem).
  function bendHair(g, amt) {
    if (!amt) return g;
    const o = newMask(); const piv = HY + 9;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = g[key(x, y)];
      if (!v) continue;
      const d = y - piv;
      const nx = x + (d > 0 ? Math.round(amt * Math.min(1, d / 26) ** 1.3) : 0);
      if (nx >= 0 && nx < W) o[key(nx, y)] = v;
    }
    return o;
  }
  function headExtras(L, view, look, P) {
    if (!look) return;
    shapePieces(L, view, [look.cabelo, look.bandana ? 'bandana' : null, look.acessorio]);
    const amt = P ? (view === 'lado' ? P.hair : P.hairX) || 0 : 0;
    ['cabelo', 'cabelo_tras'].forEach((n) => { L[n] = bendHair(L[n], amt); });
  }
  // Peça do tronco e estampa, desenhadas para o boneco parado e deslocadas (dx, dy) junto com o tronco.
  // A estampa só fica onde há tronco vestível por baixo (parte tronco do corpo, fora do contorno).
  const BODY_LAYERS = ['roupa', 'costas_tras', 'estampa'];
  // Nada do corpo passa da linha dos pés (uma capa num corpo agachado, por exemplo).
  function clipFloor(g) { for (let y = FEET_Y + 1; y < H; y++) for (let x = 0; x < W; x++) g[key(x, y)] = 0; return g; }
  function bodyExtras(L, view, look, dx, dy) {
    if (!look) return;
    shapePieces(L, view, [look.peca]);
    BODY_LAYERS.forEach((n) => { L[n] = clipFloor(shiftG(L[n], dx, dy)); });
    const pc = PECAS[look.estampa];
    if (pc && pc.modo === 'estampa') {
      const d = shiftG((pc.desenho(view, KIT) || {}).frente || newMask(), dx, dy);
      const lo = 20 + PART.tronco * 4;
      for (let i = 0; i < d.length; i++) if (d[i] && L.corpo[i] > lo && L.corpo[i] <= lo + 3) L.estampa[i] = 20 + PART.estampa * 4 + 2;
    }
  }

  // ---------- frente e costas ----------
  function frontOrBack(sex, back, P, look) {
    const s = SHAPE[sex];
    const L = {}; LAYERS.forEach((n) => { L[n] = newMask(); });
    L.sombra = shadowLayer();

    const trunk = trunkMask(s);
    paint(L.corpo, trunk, SKIN, (c) => {
      const inner = (c.x >= 32 ? c.dL : c.dR) === 1;
      if (c.y <= 59) return SHADE;                                   // sombra do queixo no pescoço
      if (c.y <= 62 && c.dT <= 2) return LIGHT;                      // ombros
      if (c.y >= 80 && c.y <= 81) return SHADE;                      // sombra da roupa nas coxas
      if (!back && c.y === 83 && c.ax >= 4 && c.ax <= 6) return LIGHT; // joelho
      if (c.y === 84 && c.ax >= 3 && c.ax <= 7) return SHADE;        // dobra do joelho
      if (back && c.y >= 85 && c.y <= 87 && c.ax >= 4 && c.ax <= 7) return SHADE; // panturrilha
      if (c.y >= 82 && inner) return SHADE;                          // lado de dentro da perna
      if (c.y === 91) return SHADE;                                  // sola
      if (!back && c.y === 90 && c.ax >= 3 && c.ax <= 8) return LIGHT; // peito do pé
      if (c.y >= 67 && c.y <= 76 && (c.dL === 1 || c.dR === 1)) return SHADE; // lateral do tronco
      return null;
    });
    // Com roupa de cima, o tecido fica liso: some a musculatura; no feminino fica só a sombra embaixo do busto.
    const vestido = !!(look && PECAS[look.superior] && PECAS[look.superior].modo === 'cor');
    if (vestido) {
      if (!back && sex === 'f') pxSym(L.corpo, [[34, 66], [35, 67], [36, 67], [37, 67], [38, 66]], SHADE);
    } else if (!back) {
      if (sex === 'm') {
        // Peitoral: arco embaixo de cada lado (mais baixo no meio do músculo), esterno curto e brilho pequeno em cima.
        pxSym(L.corpo, [[33, 66], [34, 67], [35, 67], [36, 67], [37, 67], [38, 67], [39, 66], [40, 65], [41, 64]], SHADE);
        pxSym(L.corpo, [[32, 65]], SHADE);
        pxSym(L.corpo, span(35, 38, 63).concat(span(36, 37, 64)), LIGHT);
        pxSym(L.corpo, [[32, 70]], SHADE);                           // umbigo
      } else {
        pxSym(L.corpo, span(33, 36, 62), LIGHT);                     // colo
        pxSym(L.corpo, [[32, 70]], SHADE);
      }
    } else {
      pxSym(L.corpo, [[32, 65], [32, 66], [32, 67], [32, 68], [32, 69], [32, 70]], SHADE); // coluna
      pxSym(L.corpo, [[35, 64], [36, 64], [37, 65], [38, 65], [39, 65]], SHADE); // escápulas
    }

    tag(L.corpo, (x, y) => (y <= 59 ? 1 : y <= 71 ? 2 : y <= 76 ? 9 : y <= 84 ? 3 : y <= 89 ? 4 : 5));
    const briefs = inter(sym(newMask(), 72, [12, 12, 12, 12, 12, 9, 7, 5, 3]), trunk);
    paint(L.inferior, briefs, UNDER, (c) => {
      if (c.y === 73) return null;
      if (back) return (c.ax === 0 && c.y >= 75) || c.dB <= 1 ? SHADE : null;
      return c.dB <= 1 || c.dL === 1 || c.dR === 1 ? SHADE : null;
    });
    if (sex === 'f') {
      let top;
      if (back) top = inter(sym(newMask(), 64, [12, 12, 12, 12]), trunk);
      else {
        // Decote em curva, base arredondada com um recorte no meio: lê como dois volumes, não dois quadrados.
        top = sym(newMask(), 64, [10, 10, 10, 9]);
        [[32, 64], [33, 64], [32, 67]].forEach(([x, y]) => { top[key(x, y)] = 0; top[key(W - 1 - x, y)] = 0; });
        pxSym(top, [[37, 63], [38, 63], [39, 63]], 1);
        top = inter(top, trunk);
      }
      paint(L.superior, top, UNDER, (c) => {
        if (back) return c.dB <= 1 ? SHADE : null;
        return c.y === 66 && (c.ax <= 1 || c.ax >= 7) ? SHADE : null; // sombra só na curva de baixo
      });
      pxSym(L.superior, [[38, 61], [38, 62]], U_LINE);               // alças
    }

    const head = headMask();
    paint(L.cabeca, head, SKIN, (c) => {
      if (c.ax >= 15) return SHADE;                                  // dentro da orelha
      if (c.y <= HY + 8 && c.dT >= 1 && c.dT <= 4 && c.ax <= 11) return LIGHT; // topo da cabeça
      if (c.y >= HY + 22 && c.dB <= 2) return SHADE;                 // queixo
      if (back && c.y >= HY + 20 && c.dB <= 4) return SHADE;         // nuca
      return null;
    });

    if (!back) {
      pxSym(L.rosto, span(35, 39, HY + 11), LINE);                   // sobrancelha
      pxSym(L.rosto, span(36, 39, HY + 14), EYE_DARK);               // olho grande, cantos arredondados
      for (let y = HY + 15; y <= HY + 19; y++) pxSym(L.rosto, span(35, 40, y), EYE_DARK);
      pxSym(L.rosto, span(36, 39, HY + 20), EYE_DARK);
      // Olho em 4 tons, como a pele: contorno, sombra da pálpebra, íris e brilho.
      for (let y = HY + 15; y <= HY + 16; y++) pxSym(L.rosto, span(36, 39, y), EYE_SHADE);
      for (let y = HY + 17; y <= HY + 19; y++) pxSym(L.rosto, span(36, 39, y), EYE_IRIS);
      pxSym(L.rosto, [[37, HY + 15], [38, HY + 15], [37, HY + 16], [38, HY + 16]], EYE_SHINE);
      pxSym(L.rosto, [[32, HY + 21]], SHADE);                        // nariz
      pxSym(L.rosto, [[32, HY + 23]], LINE);                         // boca
    }

    const arm = armMask(s.arm[0], s.arm[1]);
    paint(L.bracos, union(arm, mirror(arm)), SKIN, (c) => {
      if (c.y <= 64) return LIGHT;                                   // ombro
      if (c.y === 68) return SHADE;                                  // cotovelo
      if (c.y >= 76) return SHADE;                                   // debaixo da mão
      if (c.y >= 65 && c.y <= 72 && (c.x >= 32 ? c.dL : c.dR) === 1) return SHADE; // lado de dentro
      return null;
    });

    const anchors = {};
    Object.keys(A_FRONT).forEach((k) => {
      const [x, y] = A_FRONT[k];
      const yy = y <= 76 ? y + P.bob : y;
      anchors[k] = [x, yy];
      if (k.endsWith('_d')) anchors[k.slice(0, -1) + 'e'] = [W - 1 - x, yy];
    });

    headExtras(L, back ? 'costas' : 'frente', look, back ? Object.assign({}, P, { hairX: -(P.hairX || 0) }) : P);
    bodyExtras(L, back ? 'costas' : 'frente', look, 0, 0);
    const cut = (m, yMax) => blit(newMask(), m, 0, W - 1, 0, yMax, 0);
    const bothArms = union(arm, mirror(arm));
    if (P.noArms) L.bracos = newMask();
    else if (P.seal) {
      // Selo: braço até o cotovelo, antebraço subindo em diagonal para o meio do peito e as mãos juntas.
      let R = cut(arm, 68);
      if (!back) R = limb(R, [[s.arm[0] + 3, 68], [36, 66]], 3);
      L.bracos = newMask();
      paint(L.bracos, union(R, mirror(R)), SKIN, LIMB);
      if (!back) {
        // Seis selos diferentes, cada um com silhueta própria: [linha, x de, x até].
        const hands = newMask();
        SEALS[P.seal].forEach(([y, x0, x1]) => rows(hands, y, [[x0, x1]]));
        paint(L.bracos, hands, SKIN, (c) => {
          if (P.seal === 2 || P.seal === 3) return c.y <= 63 ? LIGHT : c.ax === 0 ? SHADE : null;
          if (P.seal === 4) return c.ax <= 1 ? SHADE : null;
          return c.dB === 1 || c.ax === 0 ? SHADE : c.dT === 1 ? LIGHT : null;
        });
        if (P.fx) pxSym(L.efeito, [[39, 61], [40, 60], [39, 70], [40, 71], [41, 65]], EYE_SHINE); // risco de velocidade
      }
    } else if (P.wf) {
      // Arma vista de frente (ou de costas): o braço A sobe até a mão, que segura a espada ou solta a shuriken.
      const [hx, hy] = P.wf.hand;
      L.bracos = newMask();
      if (P.wf.two) {
        // Duas mãos no cabo: os dois braços saem dos ombros e se encontram na empunhadura.
        if (back) paint(L.bracos, cut(bothArms, 66), SKIN, LIMB);
        else {
          const two = limb(limb(newMask(), [[43, 63], [hx + 2, hy]], 4), [[20, 63], [hx - 2, hy]], 4);
          rows(two, hy - 3, [0, 1, 2, 3, 4, 5, 6].map(() => [hx - 4, hx + 4]));
          paint(L.bracos, two, SKIN, (c) => (c.dB === 1 || (c.x === hx && Math.abs(c.y - hy) <= 2) ? SHADE : c.dT === 1 ? LIGHT : null));
        }
      } else {
        const R = cut(arm, Math.min(66, hy));
        if (!back) rows(R, hy - 3, [0, 1, 2, 3, 4, 5, 6].map(() => [hx - 3, hx + 3]));
        paint(L.bracos, union(R, mirror(arm)), SKIN, LIMB);
      }
      const wl = back ? L.tras : L.arma;                             // de costas a arma fica atrás do corpo
      if (P.wf.tip) blade(wl, P.wf.hand, P.wf.tip);
      if (P.wf.star) star(wl, P.wf.star[0], P.wf.star[1], P.wf.star[2]);
      if (P.wf.arc && !back) paint(L.efeito, limb(newMask(), P.wf.arc, 2), { line: EYE_SHINE, shade: EYE_SHINE, base: EYE_SHINE, light: EYE_SHINE }, null);
    } else if (P.punch === 2) {
      // Soco visto de frente: o braço vem na direção da câmera e vira um punho na frente do ombro.
      const R = cut(arm, back ? 66 : 64);
      if (!back) rows(R, 61, [0, 1, 2, 3, 4, 5, 6, 7].map(() => [36, 44]));
      if (!back && P.fx) px(L.efeito, [[34, 59], [33, 58], [46, 59], [47, 58], [34, 70], [33, 71], [46, 70], [47, 71]], EYE_SHINE);
      L.bracos = newMask();
      paint(L.bracos, union(R, mirror(arm)), SKIN, LIMB);
    } else if (P.ninja && !back) {
      // Corrida ninja de frente: os braços vão para trás e só os ombros aparecem.
      L.bracos = newMask();
      paint(L.bracos, cut(bothArms, 66), SKIN, LIMB);
    }
    tag(L.bracos, (x, y) => {
      if (!back && P.seal && x >= 26 && x <= 37 && y >= 59) return 8;
      if (P.wf && !back) {
        const [hx, hy] = P.wf.hand;
        if (Math.abs(x - hx) <= 4 && Math.abs(y - hy) <= 3) return 8;
        if (P.wf.two) return Math.abs(x - hx) > 7 ? 6 : 7;
      }
      if (!back && P.punch === 2 && x >= 36 && x <= 44 && y >= 61 && y <= 68) return 8;
      if (!back && P.seal) return (x < 24 || x > 39) && y <= 67 ? 6 : 7;
      return y <= 67 ? 6 : y <= 72 ? 7 : 8;
    });
    if (P.kick && !back) {
      // Chute visto de frente: a perna sobe do quadril em linha reta até o pé na altura do ombro, vinda na direção da câmera.
      // Embaixo a coxa (larga), no meio o joelho e a canela, em cima o pé grande com a sola em sombra e os dedos.
      const leg = newMask();
      for (let y = 66; y <= 79; y++) rows(leg, y, [[y >= 74 ? 34 : 35, y >= 74 ? 43 : 42]]);   // coxa e joelho
      for (let y = 62; y <= 65; y++) rows(leg, y, [[35, 42]]);                                  // canela e tornozelo
      for (let y = 57; y <= 61; y++) rows(leg, y, [[33, 43]]);                                  // pé (sola)
      const kl = newMask();
      paint(kl, leg, SKIN, (c) => {
        if (c.y <= 60) return SHADE;                                  // sola, em sombra
        if (c.y === 61) return c.dL >= 2 && c.dR >= 2 ? LIGHT : null; // dedos
        if (c.y >= 69 && c.y <= 71 && c.ax >= 4 && c.ax <= 8) return LIGHT; // joelho
        if (c.y >= 72 && (c.x >= 41)) return SHADE;                   // lado de fora da coxa
        return null;
      });
      tag(kl, (x, y) => (y <= 61 ? 5 : y <= 69 ? 4 : 3));
      for (let i = 0; i < kl.length; i++) if (kl[i]) L.bracos[i] = kl[i];
    }
    if (P.eyes === 'closed' && !back) {
      for (let i = 0; i < L.rosto.length; i++) if ([EYE_DARK, EYE_IRIS, EYE_SHINE, EYE_SHADE].includes(L.rosto[i])) L.rosto[i] = 0;
      pxSym(L.rosto, span(35, 40, HY + 19), EYE_DARK);
    }

    // Pose: o desenho neutro é recortado e deslocado. Pernas: da linha 80 para baixo, cada lado sobe o seu `lift`.
    // Tronco, roupa, cabeça e rosto descem o `bob`. Cada braço sobe um pixel quando vai para a frente.
    const body = newMask();
    blit(body, L.corpo, 0, W - 1, 77, 79, 0);
    // De costas, no limite do chute, a perna que chuta some atrás do corpo.
    if (!P.kick) blit(body, L.corpo, 32, W - 1, 80 + P.liftA, 92, -P.liftA);
    blit(body, L.corpo, 0, 31, 80 + P.liftB, 92, -P.liftB);
    blit(body, L.corpo, 0, W - 1, 0, 76, P.bob);
    L.corpo = body;
    ['inferior', 'superior'].concat(BODY_LAYERS).forEach((n) => { L[n] = clipFloor(moved(L[n], P.bob)); });
    HEAD_LAYERS.forEach((n) => { L[n] = moved(L[n], P.bob + (P.ninja ? 2 : 0)); }); // cabeça baixa na corrida
    const arms = newMask();
    blit(arms, L.bracos, 32, W - 1, 0, H - 1, P.bob + (P.armA < 0 ? -1 : 0));
    blit(arms, L.bracos, 0, 31, 0, H - 1, P.bob + (P.armB < 0 ? -1 : 0));
    L.bracos = arms;
    return { layers: L, anchors };
  }

  // ---------- lado (olhando para a esquerda) ----------
  // De lado o corpo é mais fino que de frente (magro e forte): tronco com 11 a 12 de profundidade.
  const SIDE = {
    m: {
      torso: [[28, 35], [27, 36], [26, 37], [26, 37], [26, 37], [26, 37], [26, 37], [27, 37], [27, 36], [27, 36], [27, 36],
        [27, 36], [27, 37], [27, 37], [27, 37], [27, 37], [27, 37]],
      leg: [[81, 27, 37], [84, 28, 36], [87, 28, 36], [88, 28, 35], [89, 28, 34], [90, 26, 34], [92, 23, 35]],
      arm: 5,
    },
    f: {
      torso: [[29, 35], [28, 36], [26, 36], [25, 36], [25, 36], [25, 36], [26, 36], [27, 35], [28, 35], [28, 35], [28, 35],
        [28, 36], [27, 37], [27, 38], [27, 38], [27, 38], [27, 38]],
      leg: [[81, 27, 38], [82, 27, 37], [84, 28, 36], [87, 28, 35], [88, 28, 34], [89, 28, 33], [90, 26, 33], [92, 24, 34]],
      arm: 4,
    },
  };
  // Braço de lado: x da frente por linha. Desce inclinado para trás até o cotovelo (que passa um pixel das costas)
  // e volta para a frente até a mão: curva leve, separada do corpo.
  const ARM_SIDE_X = [33, 33, 33, 33, 34, 34, 34, 35, 35, 34, 34, 33, 33, 33, 33, 33, 34];

  function side(sex, P, look) {
    const s = SIDE[sex];
    const L = {}; LAYERS.forEach((n) => { L[n] = newMask(); });
    L.sombra = shadowLayer();

    const bob = P.bob;
    // Perna: gira em volta do quadril (cada linha anda um pouco mais que a de cima) e encurta quando o pé sobe.
    function legRows(mask, swing, lift) {
      for (let y = 77; y <= 92 - lift; y++) {
        const ys = y <= 79 ? y : y + lift;
        const t = s.leg.find((r) => ys <= r[0]);
        const dx = Math.round((swing * (y - 77)) / 15);
        rows(mask, y, [[t[1] + dx, t[2] + dx]]);
      }
      return mask;
    }
    const lean = P.lean;
    const trunk = rows(newMask(), 57 + bob, [0, 1, 2].map(() => [29 - lean, 34 - lean]));
    rows(trunk, 60 + bob, s.torso.map(([a, b], i) => { const d = Math.round((lean * (16 - i)) / 16); return [a - d, b - d]; }));
    const torsoM = trunk.slice();
    // Perna por segmentos (quadril, joelho, pé), usada na corrida e no chute.
    const HIP = [32, 78];
    const segLeg = (pts) => {
      const a = rel(pts, HIP);
      const m = limb(newMask(), a, 6);
      const F = a[a.length - 1];
      if (!P.noToe) rows(m, F[1] + 2, [[F[0] - 5, F[0]], [F[0] - 5, F[0]]]); // ponta do pé
      return m;
    };
    if (P.legPts) { const m = segLeg(P.legPts); for (let i = 0; i < m.length; i++) trunk[i] |= m[i]; } else legRows(trunk, P.legA, P.liftA);
    paint(L.corpo, trunk, SKIN, (c) => {
      const y = c.y <= 76 + bob ? c.y - bob : c.y >= 80 ? c.y + P.liftA : c.y;
      if (P.legPts && c.y > 76 + bob) return c.dR <= 1 || c.dB <= 1 ? SHADE : null;
      if (y <= 59) return SHADE;
      if (y <= 62 && c.dT <= 2) return LIGHT;
      if (y >= 80 && y <= 81) return SHADE;
      if (y === 84 && c.dL >= 1 && c.dL <= 4) return SHADE;          // joelho
      if (y >= 63 && c.dR <= 2) return SHADE;                        // costas e parte de trás da perna
      if (y === 91) return SHADE;
      if (y === 90 && c.dL >= 1 && c.dL <= 6) return LIGHT;          // peito do pé
      if (y === 83 && c.dL >= 2 && c.dL <= 4) return LIGHT;
      if (sex === 'm' && y === 66 && c.dL <= 5 && !(look && PECAS[look.superior])) return SHADE; // debaixo do peitoral
      return null;
    });
    // Perna e braço de trás: mesma forma, só contorno e sombra, numa camada abaixo do corpo.
    paint(L.tras, P.legPtsB ? segLeg(P.legPtsB) : legRows(newMask(), P.legB, P.liftB), SKIN, () => SHADE);
    const legPart = (pts, lift) => {
      if (!pts) return (x, y) => { const yy = y >= 80 ? y + lift : y; return yy <= 84 ? 3 : yy <= 89 ? 4 : 5; };
      const a = rel(pts, HIP); const thigh = limb(newMask(), [a[0], a[1]], 6); const F = a[a.length - 1];
      return (x, y) => (x >= F[0] - 5 && x <= F[0] + 3 && y >= F[1] - 2 && y <= F[1] + 3 ? 5 : thigh[key(x, y)] ? 3 : 4);
    };
    const nearLeg = legPart(P.legPts, P.liftA);
    tag(L.corpo, (x, y) => (torsoM[key(x, y)] ? (y - bob <= 59 ? 1 : y - bob <= 71 ? 2 : 9) : nearLeg(x, y)));
    tag(L.tras, legPart(P.legPtsB, P.liftB));

    // Com perna por segmentos a roupa fica só no quadril (senão pintaria a perna estendida do chute).
    const wide = (n) => Array.from({ length: n }, () => (P.legPts ? [25 - lean, 40] : [16, 48]));
    const briefs = inter(rows(newMask(), 72 + bob, wide(8).concat([[30, 48]])), trunk);
    paint(L.inferior, briefs, UNDER, (c) => (c.y !== 73 + bob && (c.dB <= 1 || c.dR <= 2) ? SHADE : null));
    if (sex === 'f') {
      const top = inter(rows(newMask(), 63 + bob, wide(5)), trunk);
      paint(L.superior, top, UNDER, (c) => (c.dB <= 1 || c.dR <= 2 ? SHADE : null));
    }

    const head = rows(newMask(), HY, HEAD_SIDE);
    paint(L.cabeca, head, SKIN, (c) => {
      if (c.y <= HY + 8 && c.dT >= 1 && c.dT <= 4 && c.x >= 21 && c.x <= 42) return LIGHT;
      if (c.y >= HY + 22 && c.dB <= 2) return SHADE;
      if (c.y >= HY + 18 && c.dR <= 3 && c.dB <= 5) return SHADE;    // nuca
      return null;
    });
    const up = (list) => list.map(([x, y]) => [x, y + HY - 16]);
    px(L.cabeca, up([[35, 28], [36, 28], [34, 29], [34, 30], [34, 31], [34, 32], [34, 33], [34, 34], [37, 29], [37, 30], [37, 31], [37, 32], [37, 33], [37, 34], [35, 35], [36, 35]]), LINE);
    px(L.cabeca, up([[35, 29], [36, 29], [35, 30], [35, 31], [35, 32], [35, 33], [35, 34], [36, 34]]), SHADE); // orelha

    px(L.rosto, span(19, 23, HY + 11), LINE);
    px(L.rosto, span(20, 22, HY + 14), EYE_DARK);
    for (let y = HY + 15; y <= HY + 19; y++) px(L.rosto, span(20, 23, y), EYE_DARK);
    px(L.rosto, span(20, 22, HY + 20), EYE_DARK);
    for (let y = HY + 15; y <= HY + 16; y++) px(L.rosto, span(21, 22, y), EYE_SHADE);
    for (let y = HY + 17; y <= HY + 19; y++) px(L.rosto, span(21, 22, y), EYE_IRIS);
    px(L.rosto, [[21, HY + 15], [21, HY + 16]], EYE_SHINE);
    px(L.rosto, [[19, HY + 23], [20, HY + 23]], LINE);

    function armRows(swing) {
      const m = newMask();
      ARM_SIDE_X.forEach((x, i) => {
        const w = i === 0 ? s.arm - 1 : i === 16 ? s.arm - 2 : s.arm; // ombro e ponta da mão arredondados
        // Balançando, o braço fica reto (a curva do repouso somada ao giro vira um zigue-zague).
        const x0 = swing ? 33 + Math.round((swing * i) / 16) : x;
        rows(m, 61 + bob + i, [[x0 - lean, x0 - lean + w - 1]]);
      });
      return m;
    }
    // Braço por segmentos (ombro, cotovelo, mão) quando a pose traz os pontos; senão, o braço solto que balança.
    const SH = [34 - lean, 63 + bob];
    const custom = !!P.armPts;
    let arm; let E = null;
    if (custom) {
      const t = s.arm - 1;
      const a = rel(P.armPts, SH);
      arm = limb(newMask(), a, t);
      E = a[a.length - 1];
      if (P.fist) rows(arm, E[1] - 3, [0, 1, 2, 3, 4, 5, 6].map(() => [E[0] - 3, E[0] + 3]));
      const armPart = (pts) => {
        const q = rel(pts, SH); const mid = q.length > 2 ? q[1] : [Math.round((q[0][0] + q[1][0]) / 2), Math.round((q[0][1] + q[1][1]) / 2)];
        const upper = limb(newMask(), [q[0], mid], t); const En = q[q.length - 1];
        return (x, y) => (Math.abs(x - En[0]) <= 3 && Math.abs(y - En[1]) <= 3 ? 8 : upper[key(x, y)] ? 6 : 7);
      };
      paint(L.tras, limb(newMask(), rel(P.armPtsB || P.armPts, SH), t), SKIN, () => SHADE);
      tag(L.tras, armPart(P.armPtsB || P.armPts));
      paint(L.bracos, arm, SKIN, LIMB);
      tag(L.bracos, armPart(P.armPts));
      if (P.seal) {
        // Mãos do selo na ponta do antebraço: punhos (sombra embaixo), abrindo, ou palmas erguidas (claro).
        const up = { 1: 2, 2: 6, 3: 6, 4: 1, 5: 5, 6: 3 }[P.seal];
        const wd = { 2: 2, 3: 2, 5: 2 }[P.seal] || 3;
        const hand = newMask();
        for (let y = E[1] - up; y <= E[1] + 2; y++) rows(hand, y, [[E[0] - wd, E[0] + 1]]);
        paint(L.bracos, hand, SKIN, (c) => (P.seal === 1 || P.seal === 4 ? (c.y >= E[1] ? SHADE : null) : P.seal === 2 || P.seal === 3 ? LIGHT : null));
        if (P.fx) px(L.efeito, [[E[0] - 5, E[1] - 5], [E[0] - 6, E[1] - 6], [E[0] - 5, E[1] + 4], [E[0] - 6, E[1] + 5], [E[0] + 3, E[1] - 7]], EYE_SHINE);
      }
    } else {
      paint(L.tras, armRows(P.armB), SKIN, () => SHADE);
      tag(L.tras, (x, y) => (y - bob <= 67 ? 6 : y - bob <= 72 ? 7 : 8));
      arm = armRows(P.armA);
      paint(L.bracos, arm, SKIN, (c) => {
        if (c.y - bob <= 64 && c.dL >= 2) return LIGHT;
        if (c.y - bob >= 76) return SHADE;
        return null;
      });
    }
    // Contorno escuro só atrás e na mão. Na frente e no ombro, onde o braço encosta no tronco, a borda vira sombra:
    // o braço deixa de parecer uma peça colada por cima.
    for (let y = 61 + bob; y <= (P.armA || custom || lean ? 0 : 72 + bob); y++) for (let x = 0; x < W; x++) {
      if (!arm[key(x, y)] || !trunk[key(x, y)]) continue;
      const front = !has(arm, x - 1, y) || !has(arm, x, y - 1);
      if (front && has(arm, x + 1, y)) L.bracos[key(x, y)] = SHADE;
    }

    tag(L.bracos, custom ? () => 8 : (x, y) => (y - bob <= 67 ? 6 : y - bob <= 72 ? 7 : 8));
    headExtras(L, 'lado', look, P);
    bodyExtras(L, 'lado', look, -Math.round(lean * 0.6), bob);
    L.cabeca = shiftG(L.cabeca, -lean, bob);
    // Espada na mão, rastro do corte em arco em volta do ombro e shuriken no ar com rastro.
    if (P.weapon && E) blade(L.arma, E, [E[0] + P.weapon[0], E[1] + P.weapon[1]]);
    if (P.arc) {
      const [a0, a1, rad] = P.arc;
      for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a += 2) for (let k = 0; k < 2; k++) {
        const x = Math.round(SH[0] + (rad - k) * Math.cos((a * Math.PI) / 180)); const y = Math.round(SH[1] + (rad - k) * Math.sin((a * Math.PI) / 180));
        if (x >= 0 && x < W && y >= 0 && y < H) L.efeito[key(x, y)] = EYE_SHINE;
      }
    }
    if (P.star) {
      star(L.arma, SH[0] + P.star[0], SH[1] + P.star[1], P.star[2]);
      if (P.star[3]) px(L.efeito, span(SH[0] + P.star[0] + 5, Math.min(W - 1, SH[0] + P.star[0] + 5 + P.star[3]), SH[1] + P.star[1]), EYE_SHINE);
    }
    // Riscos brancos atrás do braço no soco.
    if (P.fx && P.punch === 2) px(L.efeito, span(SH[0] - 9, SH[0] + 7, SH[1] - 4).concat(span(SH[0] - 5, SH[0] + 10, SH[1] + 4), span(SH[0] - 2, SH[0] + 5, SH[1] - 6)), EYE_SHINE);
    if (P.eyes === 'closed') {
      for (let i = 0; i < L.rosto.length; i++) if ([EYE_DARK, EYE_IRIS, EYE_SHINE, EYE_SHADE].includes(L.rosto[i])) L.rosto[i] = 0;
      px(L.rosto, span(20, 23, HY + 19), EYE_DARK);
    }
    L.rosto = shiftG(L.rosto, -lean, bob);
    ['cabelo', 'cabelo_tras', 'bandana', 'acessorio'].forEach((n) => { L[n] = shiftG(L[n], -lean, bob); });
    if (P.dx) LAYERS.forEach((n) => { if (n !== 'sombra') L[n] = shiftG(L[n], P.dx, 0); });
    const anchors = {};
    Object.keys(A_SIDE).forEach((k) => { const [x, y] = A_SIDE[k]; anchors[k] = [x, y <= 76 ? y + bob : y]; });
    return { layers: L, anchors };
  }

  // A direita é a esquerda espelhada: o corpo-base é simétrico e a luz vem de cima, então nada muda de lado.
  // Peças com lado próprio (arma na mão, franja, emblema) terão desenho próprio por direção.
  function flip(r) {
    const layers = {}; const anchors = {};
    Object.keys(r.layers).forEach((n) => {
      const g = r.layers[n]; const o = newMask();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[key(W - 1 - x, y)] = g[key(x, y)];
      layers[n] = o;
    });
    Object.keys(r.anchors).forEach((k) => { anchors[k] = [W - 1 - r.anchors[k][0], r.anchors[k][1]]; });
    return { layers, anchors };
  }

  const VIEWS = ['frente', 'costas', 'esquerda', 'direita'];
  const SEXES = ['m', 'f'];

  // Deita o corpo: gira todas as camadas (menos a sombra) em volta do centro e encosta o resultado no chão (Y=92).
  function rotate(r, deg) {
    const a = (deg * Math.PI) / 180; const cos = Math.cos(a); const sin = Math.sin(a);
    const names = LAYERS.filter((n) => n !== 'sombra');
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    names.forEach((n) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (r.layers[n][key(x, y)]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
    const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
    const pts = {}; let bx0 = 999, bx1 = -999, by1 = -999;
    names.forEach((n) => {
      pts[n] = [];
      for (let y = -40; y < H + 40; y++) for (let x = -40; x < W + 40; x++) {
        const sx = Math.round(cx + (x - cx) * cos + (y - cy) * sin);
        const sy = Math.round(cy - (x - cx) * sin + (y - cy) * cos);
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
        const v = r.layers[n][key(sx, sy)];
        if (!v) continue;
        pts[n].push([x, y, v]); bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y);
      }
    });
    const dx = Math.round(31.5 - (bx0 + bx1) / 2); const dy = FEET_Y - by1;
    names.forEach((n) => {
      const g = newMask();
      pts[n].forEach(([x, y, v]) => { const X = x + dx; const Y = y + dy; if (X >= 0 && X < W && Y >= 0 && Y < H) g[key(X, Y)] = v; });
      r.layers[n] = g;
    });
    return r;
  }

  // Animações: lista de poses por quadro. `andar` tem 6 quadros: contato, passagem e impulso de cada perna.
  const walk = (i) => ({
    bob: [1, 0, 0, 1, 0, 0][i],
    legA: [-4, -2, 2, 4, 2, -2][i], legB: [4, 2, -2, -4, -2, 2][i],
    liftA: [0, 0, 0, 0, 2, 2][i], liftB: [0, 2, 2, 0, 0, 0][i],
    armA: [3, 2, -2, -3, -2, 2][i], armB: [-3, -2, 2, 3, 2, -2][i],
  });
  // Selos de frente: seis formas de mão no meio do peito.
  const SEALS = {
    1: [63, 64, 65, 66, 67, 68].map((y) => [y, 29, 34]),                                  // punhos lado a lado
    2: [59, 60, 61, 62, 63].map((y) => [y, 31, 32]).concat([64, 65, 66, 67, 68].map((y) => [y, 29, 34])), // dois dedos erguidos
    3: [59, 60, 61, 62, 63, 64, 65, 66, 67].map((y) => [y, 30, 33]),                      // palma com palma
    4: [66, 67, 68, 69].map((y) => [y, 26, 37]),                                          // mãos cruzadas, baixas
    5: [60, 61, 62, 63, 64].map((y) => [y, 30, 34]).concat([65, 66, 67, 68, 69].map((y) => [y, 29, 33])), // punhos empilhados
    6: [62, 63, 64, 65, 66, 67, 68].map((y) => [y, 28, 35]),                              // mãos abertas, entrelaçadas
  };
  // Corrida: joelho e pé em relação ao quadril, em 6 fases (contato, apoio, impulso, calcanhar atrás, passagem, alcance).
  const RUN = [
    [[0, 0], [-4, 5], [-7, 11]], [[0, 0], [-1, 6], [0, 11]], [[0, 0], [3, 6], [6, 11]],
    [[0, 0], [4, 5], [9, 5]], [[0, 0], [-3, 5], [2, 8]], [[0, 0], [-6, 3], [-6, 8]],
  ];
  const ANIMS = {
    parado: { fps: 3, frames: [0, 0, 1, 1].map((bob) => Object.assign({}, NEUTRAL, { bob })) },
    andar: { fps: 9, frames: [0, 1, 2, 3, 4, 5].map(walk) },
    // Correr (corrida ninja): tronco bem inclinado, os dois braços retos para trás e parados; só as pernas correm.
    correr: { fps: 14, frames: [0, 1, 2, 3, 4, 5].map((i) => ({
      ninja: 1, lean: 4, bob: i % 3 === 0 ? 2 : 1,
      legPts: RUN[i], legPtsB: RUN[(i + 3) % 6],
      armPts: [[0, 0], [12, 5]], armPtsB: [[0, -2], [12, 2]],
      liftA: i >= 3 ? 3 : 0, liftB: i < 3 ? 3 : 0,
    })) },
    // Selos: oito selos diferentes em sequência rápida, com riscos de velocidade nos quadros ímpares.
    selos: { fps: 14, frames: [1, 4, 2, 5, 3, 6, 4, 2].map((seal, i) => ({
      seal, fx: i % 2, bob: i % 4 === 1 ? 1 : 0, armPts: [[0, 0], [-1, 6], [-8, 3 + [0, 2, -1, 1, -2, 0, 2, -1][i]]],
    })) },
    // Soco: recua e abaixa, dispara com um passo largo e o tronco jogado à frente, segura com riscos de velocidade, volta.
    soco: { fps: 16, frames: [
      { lean: -2, dx: 1, bob: 2, armPts: [[0, 0], [6, 1], [2, 3]], armPtsB: [[0, 1], [-4, 4], [-7, 1]] },
      { punch: 2, fist: 1, fx: 1, lean: 4, dx: -5, bob: 2, legA: -5, legB: 5, armPts: [[0, 0], [-15, -1]], armPtsB: [[0, 1], [7, 3]] },
      { punch: 2, fist: 1, fx: 1, lean: 4, dx: -6, bob: 2, legA: -5, legB: 5, armPts: [[0, 0], [-15, -1]], armPtsB: [[0, 1], [7, 3]] },
      { lean: 2, dx: -3, bob: 1, legA: -3, legB: 3, armPts: [[0, 0], [-6, 3], [-9, 0]], armPtsB: [[0, 1], [3, 5]] },
      {},
    ] },
    // Chute alto: sobe o joelho, estende a perna na altura do ombro com o tronco jogado para trás, segura, recolhe e volta.
    chute: { fps: 14, frames: [
      { lean: -1, liftA: 4, legPts: [[0, 0], [-6, -2], [-4, 5]], noToe: 1, armPts: [[0, 0], [-3, 5], [-6, 2]] },
      { kick: 1, lean: -4, dx: -1, liftA: 5, legPts: [[0, 0], [-5, -6], [-11, -13]], noToe: 1, armPts: [[0, 0], [2, 5], [-2, 4]] },
      { kick: 1, lean: -4, dx: -2, liftA: 5, legPts: [[0, 0], [-5, -6], [-12, -14]], noToe: 1, armPts: [[0, 0], [2, 5], [-2, 4]] },
      { lean: -1, liftA: 4, legPts: [[0, 0], [-6, -2], [-4, 5]], noToe: 1, armPts: [[0, 0], [-3, 5], [-6, 2]] },
      {},
    ] },
    // Espada (duas mãos no cabo): ergue a lâmina para trás, corta de cima para baixo com um passo e o rastro em arco,
    // segura e volta. O braço de trás acompanha o da frente até a empunhadura.
    espada: { fps: 14, frames: [
      { lean: -1, bob: 1, fist: 1, armPts: [[0, 0], [3, -5], [2, -10]], armPtsB: [[0, 1], [6, -3], [3, -9]], weapon: [5, -14],
        wf: { two: 1, hand: [37, 57], tip: [43, 39] } },
      { lean: 2, dx: -2, legA: -3, legB: 3, fist: 1, armPts: [[0, 0], [-7, -6]], armPtsB: [[0, 1], [-2, -3], [-7, -5]], weapon: [-13, -8], arc: [215, 288, 25],
        wf: { two: 1, hand: [34, 61], tip: [22, 49], arc: [[43, 40], [26, 46]] } },
      { lean: 3, dx: -4, bob: 1, legA: -5, legB: 5, fist: 1, armPts: [[0, 0], [-9, 3]], armPtsB: [[0, 1], [-3, 5], [-9, 4]], weapon: [-14, 5], arc: [160, 250, 25],
        wf: { two: 1, hand: [32, 69], tip: [18, 81], arc: [[22, 48], [15, 76]] } },
      { lean: 3, dx: -4, bob: 1, legA: -5, legB: 5, fist: 1, armPts: [[0, 0], [-9, 3]], armPtsB: [[0, 1], [-3, 5], [-9, 4]], weapon: [-14, 5],
        wf: { two: 1, hand: [32, 69], tip: [18, 81] } },
      {},
    ] },
    // Shuriken: leva a mão para trás, estende o braço e solta; a estrela gira e segue em frente com um rastro.
    shuriken: { fps: 14, frames: [
      { lean: -1, bob: 1, armPts: [[0, 0], [5, -2], [8, -6]], armPtsB: [[0, 1], [-4, 4], [-7, 1]], star: [9, -9, 0],
        wf: { hand: [42, 58], star: [42, 54, 0] } },
      { lean: 2, dx: -1, legA: -2, legB: 2, armPts: [[0, 0], [-12, -2]], armPtsB: [[0, 1], [5, 4]], star: [-18, -2, 1, 4],
        wf: { hand: [40, 64], star: [40, 70, 1] } },
      { lean: 2, dx: -1, legA: -2, legB: 2, armPts: [[0, 0], [-9, 4]], armPtsB: [[0, 1], [5, 4]], star: [-27, -2, 0, 8],
        wf: { hand: [39, 68], star: [38, 80, 0] } },
      { lean: 1, armPts: [[0, 0], [-5, 5]] },
      {},
    ] },
    levar_golpe: { fps: 8, frames: [
      { dx: 3, lean: -2, bob: 1, armA: -3, armB: -3 }, { dx: 2, lean: -1, armA: -2, armB: -2 }, {},
    ] },
    // Cair (derrotado): recua, os joelhos cedem, desaba e fica deitado de lado, olhos fechados, mão apoiada no chão.
    cair: { fps: 8, frames: [
      { dx: 2, lean: -2, bob: 1, armA: -3, armB: -3 },
      { bob: 4, lean: -1, armA: -2, armB: -2, eyes: 'closed' },
      { bob: 8, lean: 2, eyes: 'closed' },
      { lying: 1 }, { lying: 1 }, { lying: 1 }, { lying: 1 },
    ] },
  };
  // Balanço do cabelo por quadro. De lado: para trás quando o corpo vai para a frente, para a frente quando é empurrado.
  // De frente e de costas: um pouco de lado a lado no ritmo do passo.
  const HAIR_LADO = {
    parado: [0, 0, 1, 1], andar: [1, 2, 1, 1, 2, 1], correr: [5, 6, 5, 5, 6, 5], selos: [0, 1, 0, 1, 0, 1, 0, 1],
    levar_golpe: [-4, -2, 1], cair: [-3, 2, 4, 0, 0, 0, 0],
  };
  const HAIR_FRENTE = { andar: [1, 0, -1, -1, 0, 1], correr: [2, 0, -2, -2, 0, 2], levar_golpe: [2, 1, 0], cair: [2, 1, 0, 0, 0, 0, 0] };
  Object.keys(ANIMS).forEach((n) => ANIMS[n].frames.forEach((f, i) => {
    if (f.hair === undefined) f.hair = HAIR_LADO[n] ? HAIR_LADO[n][i] : Math.max(0, Math.round((f.lean || 0) * 1.5));
    if (f.hairX === undefined) f.hairX = HAIR_FRENTE[n] ? HAIR_FRENTE[n][i] : 0;
  }));

  // Deitado (derrotado): de bruços, com o rosto afundado no chão. A cabeça é vista por trás, com a parte de baixo
  // enterrada 4 linhas; o corpo fica estendido atrás dela, um braço dobrado com a mão no chão.
  function lying(sex, look) {
    const r = frontOrBack(sex, true, Object.assign({}, NEUTRAL, { noArms: 1 }), look);
    const L = r.layers;
    ['corpo', 'inferior', 'superior', 'tras', 'rosto', 'efeito'].concat(BODY_LAYERS).forEach((n) => { L[n] = newMask(); });
    HEAD_LAYERS.forEach((n) => {
      L[n] = shiftG(L[n], -13, FEET_Y + 4 - (HY + 26));
      for (let y = FEET_Y + 1; y < H; y++) for (let x = 0; x < W; x++) L[n][key(x, y)] = 0;   // parte enterrada
    });
    const torso = limb(newMask(), [[30, 87], [45, 87]], sex === 'm' ? 11 : 10);
    const body = limb(union(torso, newMask()), [[45, 89], [57, 89]], 6);
    rows(body, 88, [[57, 61], [57, 62], [57, 62], [57, 62], [57, 61]]);  // pé
    paint(L.corpo, body, SKIN, (c) => (c.dB <= 2 ? SHADE : c.dT === 1 ? LIGHT : null));
    paint(L.tras, limb(newMask(), [[45, 86], [56, 84], [61, 86]], 6), SKIN, () => SHADE); // outra perna
    tag(L.corpo, (x) => (x >= 58 ? 5 : x >= 52 ? 4 : x >= 46 ? 3 : x >= 41 ? 9 : 2));
    tag(L.tras, (x) => (x >= 58 ? 5 : x >= 52 ? 4 : 3));
    paint(L.inferior, inter(rows(newMask(), 78, Array.from({ length: 15 }, () => [41, 48])), body), UNDER, (c) => (c.dB <= 2 ? SHADE : null));
    if (sex === 'f') paint(L.superior, inter(rows(newMask(), 78, Array.from({ length: 15 }, () => [34, 38])), torso), UNDER, (c) => (c.dB <= 2 ? SHADE : null));
    const arm = limb(newMask(), [[36, 84], [41, 80], [37, 89]], 4);
    rows(arm, 89, [[33, 39], [32, 39], [32, 39], [33, 39]]);         // mão espalmada no chão
    paint(L.bracos, arm, SKIN, LIMB);
    tag(L.bracos, (x, y) => (y >= 88 && x <= 39 ? 8 : y <= 83 ? 6 : 7));
    // Chão afundado em volta do rosto: sombra mais larga e dois torrões levantados.
    L.sombra = newMask();
    rows(L.sombra, 90, [[1, 37], [0, 62], [0, 63], [0, 63], [2, 61]]);
    for (let i = 0; i < L.sombra.length; i++) if (L.sombra[i]) L.sombra[i] = SHADOW;
    px(L.efeito, [[1, 89], [2, 88], [37, 89], [38, 88], [39, 89]], LINE);
    return r;
  }

  function build(sex, view, pose, look) {
    const P = Object.assign({}, NEUTRAL, pose || {});
    const lado = view === 'esquerda' || view === 'direita';
    let r = P.lying ? lying(sex, look) : lado ? side(sex, P, look) : frontOrBack(sex, view === 'costas', P, look);
    if (P.rot) r = rotate(r, P.rot);
    if (view === 'direita') r = flip(r);
    return { sex, view, width: W, height: H, feetY: FEET_Y, layers: r.layers, anchors: r.anchors, look: resolveLook(look) };
  }

  // Junta as camadas pedidas numa matriz só (a de cima cobre a de baixo).
  function flatten(model, names) {
    const out = newMask();
    const hide = (model.look && model.look.hide) || {};
    (names || LAYERS).forEach((n) => { if (hide[n]) return; const g = model.layers[n]; for (let i = 0; i < g.length; i++) if (g[i]) out[i] = g[i]; });
    return out;
  }

  // Desenha num contexto de canvas 2D, na posição e na escala pedidas.
  // `flat`: cor única para todos os pixels (silhueta).
  function draw(ctx, model, ox, oy, scale, names, flat) {
    const g = flatten(model, names);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = g[key(x, y)];
      if (!v) continue;
      ctx.fillStyle = flat && v !== SHADOW ? flat : colorOf(v, model.look);
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }

  // Para o exportador da pxl: roda o desenho de uma peça anotando as mechas em vez de desenhá-las.
  function gravarPeca(id, view) {
    KIT._rec = [];
    try {
      const d = PECAS[id].desenho(view, KIT) || {};
      const rec = KIT._rec;
      return { d, mechas: rec.map((r) => ({ alvo: r.m === d.tras ? 'tras' : r.m === d.frente ? 'frente' : 'outro', a: r.a })) };
    } finally { KIT._rec = null; }
  }
  return { gravarPeca, PXL_ARTE, HY, HEAD_HW, HEAD_SIDE, W, H, FEET_Y, PALETTE, LAYERS, VIEWS, SEXES, ANIMS, CATALOGO, TECIDOS, PART, PECAS, TIPOS, definirPeca, validarPecas, colorOf, build, flatten, draw, tones: { LINE, SHADE, BASE, LIGHT } };
});
