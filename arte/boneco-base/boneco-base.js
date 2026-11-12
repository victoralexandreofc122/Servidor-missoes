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
  const EYE_DARK = 8, EYE_IRIS = 9, EYE_SHINE = 10, SHADOW = 11, EYE_SHADE = 12;

  const PALETTE = {
    [LINE]: '#5a2a1c', [SHADE]: '#d98a5f', [BASE]: '#f6b98c', [LIGHT]: '#ffdcb9',
    [U_LINE]: '#5b6072', [U_SHADE]: '#b3b8c7', [U_BASE]: '#e6e8ef',
    [EYE_DARK]: '#1b1e33', [EYE_SHADE]: '#2f3f86', [EYE_IRIS]: '#5f7fd6', [EYE_SHINE]: '#ffffff',
    [SHADOW]: 'rgba(20,12,10,0.28)',
  };

  // Ordem de desenho, de baixo para cima. `corpo`, `cabeca` e `bracos` formam o corpo-base, separados
  // para a roupa do tronco passar por baixo do braço e para animar cada parte.
  const LAYERS = ['sombra', 'corpo', 'inferior', 'superior', 'cabeca', 'rosto', 'bracos'];

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
  function paint(grid, mask, tones, rule) {
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

  // ---------- frente e costas ----------
  function frontOrBack(sex, back) {
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
    if (!back) {
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
      anchors[k] = [x, y];
      if (k.endsWith('_d')) anchors[k.slice(0, -1) + 'e'] = [W - 1 - x, y];
    });
    return { layers: L, anchors };
  }

  // ---------- lado (olhando para a esquerda) ----------
  const HEAD_SIDE = [
    [26, 38], [23, 41], [21, 43], [20, 44], [19, 45], [19, 45], [18, 46], [18, 46], [18, 46], [18, 46], [18, 46], [18, 46],
    [18, 46], [18, 46], [18, 46], [18, 46], [18, 46], [17, 46], [17, 46], [18, 46], [18, 46], [18, 45], [19, 45], [19, 44],
    [20, 42], [22, 40], [25, 36],
  ];
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

  function side(sex) {
    const s = SIDE[sex];
    const L = {}; LAYERS.forEach((n) => { L[n] = newMask(); });
    L.sombra = shadowLayer();

    const trunk = rows(newMask(), 57, [[29, 34], [29, 34], [29, 34]]);
    rows(trunk, 60, s.torso);
    for (let y = 77; y <= 92; y++) {
      const t = s.leg.find((r) => y <= r[0]);
      rows(trunk, y, [[t[1], t[2]]]);
    }
    paint(L.corpo, trunk, SKIN, (c) => {
      if (c.y <= 59) return SHADE;
      if (c.y <= 62 && c.dT <= 2) return LIGHT;
      if (c.y >= 80 && c.y <= 81) return SHADE;
      if (c.y === 84 && c.dL >= 1 && c.dL <= 4) return SHADE;        // joelho
      if (c.y >= 63 && c.dR <= 2) return SHADE;                      // costas e parte de trás da perna
      if (c.y === 91) return SHADE;
      if (c.y === 90 && c.dL >= 1 && c.dL <= 6) return LIGHT;        // peito do pé
      if (c.y === 83 && c.dL >= 2 && c.dL <= 4) return LIGHT;
      if (sex === 'm' && c.y === 66 && c.dL <= 5) return SHADE;      // debaixo do peitoral
      return null;
    });

    const wide = (n) => Array.from({ length: n }, () => [16, 48]);
    const briefs = inter(rows(newMask(), 72, wide(8).concat([[30, 48]])), trunk);
    paint(L.inferior, briefs, UNDER, (c) => (c.y !== 73 && (c.dB <= 1 || c.dR <= 2) ? SHADE : null));
    if (sex === 'f') {
      const top = inter(rows(newMask(), 63, wide(5)), trunk);
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

    const arm = newMask();
    ARM_SIDE_X.forEach((x, i) => {
      const w = i === 0 ? s.arm - 1 : i === 16 ? s.arm - 2 : s.arm;  // ombro e ponta da mão arredondados
      rows(arm, 61 + i, [[x, x + w - 1]]);
    });
    paint(L.bracos, arm, SKIN, (c) => {
      if (c.y <= 64 && c.dL >= 2) return LIGHT;
      if (c.y >= 76) return SHADE;
      return null;
    });
    // Contorno escuro só atrás e na mão. Na frente e no ombro, onde o braço encosta no tronco, a borda vira sombra:
    // o braço deixa de parecer uma peça colada por cima.
    for (let y = 61; y <= 72; y++) for (let x = 0; x < W; x++) {
      if (!arm[key(x, y)] || !trunk[key(x, y)]) continue;
      const front = !has(arm, x - 1, y) || !has(arm, x, y - 1);
      if (front && has(arm, x + 1, y)) L.bracos[key(x, y)] = SHADE;
    }

    const anchors = {};
    Object.keys(A_SIDE).forEach((k) => { anchors[k] = A_SIDE[k].slice(); });
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

  function build(sex, view) {
    const r = view === 'esquerda' ? side(sex) : view === 'direita' ? flip(side(sex)) : frontOrBack(sex, view === 'costas');
    return { sex, view, width: W, height: H, feetY: FEET_Y, layers: r.layers, anchors: r.anchors };
  }

  // Junta as camadas pedidas numa matriz só (a de cima cobre a de baixo).
  function flatten(model, names) {
    const out = newMask();
    (names || LAYERS).forEach((n) => { const g = model.layers[n]; for (let i = 0; i < g.length; i++) if (g[i]) out[i] = g[i]; });
    return out;
  }

  // Desenha num contexto de canvas 2D, na posição e na escala pedidas.
  // `flat`: cor única para todos os pixels (silhueta).
  function draw(ctx, model, ox, oy, scale, names, flat) {
    const g = flatten(model, names);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = g[key(x, y)];
      if (!v) continue;
      ctx.fillStyle = flat && v !== SHADOW ? flat : PALETTE[v];
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }

  return { W, H, FEET_Y, PALETTE, LAYERS, VIEWS, SEXES, build, flatten, draw, tones: { LINE, SHADE, BASE, LIGHT } };
});
