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
  const EYE_DARK = 8, EYE_IRIS = 9, EYE_SHINE = 10, SHADOW = 11;

  const PALETTE = {
    [LINE]: '#5a2a1c', [SHADE]: '#d98a5f', [BASE]: '#f6b98c', [LIGHT]: '#ffdcb9',
    [U_LINE]: '#5b6072', [U_SHADE]: '#b3b8c7', [U_BASE]: '#e6e8ef',
    [EYE_DARK]: '#1d2136', [EYE_IRIS]: '#4a63b8', [EYE_SHINE]: '#ffffff',
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
  // O canvas tem 96 de altura; o boneco ocupa y 16 a 92 (77 linhas): cabeça 27 (16 a 42), pescoço 3 (43 a 45),
  // tronco 22 (46 a 67) e pernas 25 (68 a 92). Acima ficam 16 linhas para cabelo; abaixo, 3 para a sombra.
  // Cabeça mais larga (30) que alta (27), com as laterais cheias até a bochecha.
  const HEAD_HW = [6, 9, 11, 12, 13, 14, 14, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 14, 14, 13, 12, 10, 7];
  // Perna: [última linha, x de dentro, x de fora]. Coxa, joelho, panturrilha, tornozelo, peito do pé e pé.
  const SHAPE = {
    m: {
      torso: [9, 11, 11, 11, 11, 11, 11, 11, 10, 10, 10, 9, 9, 9, 9, 9, 9, 10, 10, 10, 10, 10],
      arm: [42, 5],
      leg: [[76, 33, 41], [79, 33, 40], [81, 34, 40], [85, 34, 41], [88, 34, 39], [89, 34, 41], [92, 33, 42]],
    },
    f: {
      torso: [8, 10, 10, 10, 10, 10, 10, 10, 9, 8, 8, 7, 7, 7, 8, 9, 10, 11, 11, 11, 11, 11],
      arm: [41, 4],
      leg: [[76, 33, 42], [79, 33, 41], [81, 34, 40], [85, 34, 40], [88, 34, 38], [89, 34, 40], [92, 33, 41]],
    },
  };
  // Âncoras iguais para os dois modelos (lado direito da imagem; o esquerdo é o espelho).
  const A_FRONT = {
    cabeca_topo: [32, 16], cabeca_centro: [32, 29], olhos: [32, 33], pescoco: [32, 45],
    ombro_d: [43, 48], cotovelo_d: [44, 56], mao_d: [45, 65], cintura: [32, 62], quadril: [32, 67],
    joelho_d: [37, 81], pe_d: [37, FEET_Y],
  };
  const A_SIDE = {
    cabeca_topo: [32, 16], cabeca_centro: [32, 29], olhos: [21, 33], pescoco: [31, 45],
    ombro: [31, 48], cotovelo: [32, 56], mao: [30, 65], cintura: [31, 62], quadril: [31, 67],
    joelho: [31, 81], pe: [30, FEET_Y],
  };

  function headMask() {
    const m = sym(newMask(), 16, HEAD_HW);
    const ear = rows(newMask(), 29, [[47, 47], [47, 48], [47, 48], [47, 48], [47, 48], [47, 48], [47, 47]]);
    return union(m, union(ear, mirror(ear)));
  }

  function trunkMask(s) {
    const m = sym(newMask(), 42, [4, 4, 4, 4]);
    sym(m, 46, s.torso);
    const leg = newMask();
    for (let y = 68; y <= 92; y++) {
      const t = s.leg.find((r) => y <= r[0]);
      rows(leg, y, [[y <= 70 ? 32 : t[1], t[2]]]);   // até a linha 70 as pernas ficam unidas
    }
    return union(m, union(leg, mirror(leg)));
  }

  // Ombro, braço, cotovelo saliente para fora, antebraço e mão arredondada.
  function armMask(a, w) {
    const m = newMask();
    rows(m, 47, [[a, a + w - 2]]);
    for (let y = 48; y <= 54; y++) rows(m, y, [[a, a + w - 1]]);
    rows(m, 55, [[a, a + w], [a, a + w]]);
    for (let y = 57; y <= 62; y++) rows(m, y, [[a + 1, a + w]]);
    rows(m, 63, [[a + 1, a + w + 1], [a + 1, a + w + 1], [a + 1, a + w + 1], [a + 1, a + w + 1], [a + 2, a + w]]);
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
      if (c.y <= 45) return SHADE;                                   // sombra do queixo no pescoço
      if (c.y <= 48 && c.dT <= 2) return LIGHT;                      // ombros
      if (c.y >= 71 && c.y <= 72) return SHADE;                      // sombra da roupa nas coxas
      if (!back && c.y >= 74 && c.y <= 78 && c.ax >= 5 && c.ax <= 6) return LIGHT; // frente da coxa
      if (!back && c.y === 80 && c.ax >= 4 && c.ax <= 6) return LIGHT; // joelho
      if (c.y === 81 && c.ax >= 3 && c.ax <= 7) return SHADE;        // dobra do joelho
      if (back && c.y >= 83 && c.y <= 85 && c.ax >= 4 && c.ax <= 7) return SHADE; // panturrilha
      if (c.y >= 73 && inner) return SHADE;                          // lado de dentro da perna
      if (c.y === 91) return SHADE;                                  // sola
      if (!back && c.y === 90 && c.ax >= 3 && c.ax <= 8) return LIGHT; // peito do pé
      if (c.y >= 56 && c.y <= 67 && (c.dL === 1 || c.dR === 1)) return SHADE; // lateral do tronco
      return null;
    });
    if (!back) {
      if (sex === 'm') {
        pxSym(L.corpo, span(33, 40, 54), SHADE);                     // linha do peitoral
        pxSym(L.corpo, [[41, 53], [32, 52], [32, 53]], SHADE);
        pxSym(L.corpo, span(34, 39, 50), LIGHT);                     // volume do peito
        pxSym(L.corpo, [[32, 61]], SHADE);                           // umbigo
      } else {
        pxSym(L.corpo, span(33, 36, 48), LIGHT);                     // colo
        pxSym(L.corpo, [[32, 61]], SHADE);
      }
    } else {
      pxSym(L.corpo, span(32, 32, 52).concat([[32, 53], [32, 54], [32, 55], [32, 56], [32, 57], [32, 58], [32, 59]]), SHADE); // coluna
      pxSym(L.corpo, [[35, 51], [36, 51], [37, 52], [38, 52], [39, 52]], SHADE); // escápulas
    }

    const briefs = inter(sym(newMask(), 63, [12, 12, 12, 12, 12, 9, 7, 5, 3]), trunk);
    paint(L.inferior, briefs, UNDER, (c) => {
      if (c.y === 64) return null;
      if (back) return (c.ax === 0 && c.y >= 66) || c.dB <= 1 ? SHADE : null;
      return c.dB <= 1 || c.dL === 1 || c.dR === 1 ? SHADE : null;
    });
    if (sex === 'f') {
      const top = inter(sym(newMask(), 49, [12, 12, 12, 12, 12, 12, 12]), trunk);
      paint(L.superior, top, UNDER, (c) => {
        if (back) return c.dB <= 1 ? SHADE : null;
        return c.dB <= 1 || c.ax === 0 || (c.y === 53 && c.ax >= 2 && c.ax <= 6) ? SHADE : null; // busto discreto
      });
      pxSym(L.superior, [[38, 47], [38, 48]], U_LINE);               // alças
    }

    const head = headMask();
    paint(L.cabeca, head, SKIN, (c) => {
      if (c.ax >= 15) return SHADE;                                  // dentro da orelha
      if (c.y <= 24 && c.dT >= 1 && c.dT <= 4 && c.ax <= 11) return LIGHT; // topo da cabeça
      if (c.y >= 38 && c.dB <= 2) return SHADE;                      // queixo
      if (back && c.y >= 36 && c.dB <= 4) return SHADE;              // nuca
      return null;
    });

    if (!back) {
      pxSym(L.rosto, span(35, 39, 27), LINE);                        // sobrancelha
      pxSym(L.rosto, span(36, 39, 30), EYE_DARK);                    // olho grande, cantos arredondados
      for (let y = 31; y <= 35; y++) pxSym(L.rosto, span(35, 40, y), EYE_DARK);
      pxSym(L.rosto, span(36, 39, 36), EYE_DARK);
      for (let y = 33; y <= 35; y++) pxSym(L.rosto, span(36, 39, y), EYE_IRIS);
      pxSym(L.rosto, [[37, 31], [38, 31], [37, 32], [38, 32]], EYE_SHINE);
      pxSym(L.rosto, [[32, 39]], LINE);                              // boca
    }

    const arm = armMask(s.arm[0], s.arm[1]);
    paint(L.bracos, union(arm, mirror(arm)), SKIN, (c) => {
      if (c.y <= 50) return LIGHT;                                   // ombro
      if (c.y === 56) return SHADE;                                  // cotovelo
      if (c.y >= 66) return SHADE;                                   // debaixo da mão
      if (c.y >= 52 && c.y <= 62 && (c.x >= 32 ? c.dL : c.dR) === 1) return SHADE; // lado de dentro
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
  const SIDE = {
    m: {
      torso: [[27, 36], [25, 38], [24, 38], [24, 38], [24, 38], [24, 38], [24, 38], [24, 38], [25, 38], [25, 38], [25, 38],
        [25, 38], [25, 38], [25, 38], [25, 38], [25, 38], [25, 39], [25, 39], [25, 39], [25, 39], [25, 39], [25, 39]],
      leg: [[76, 25, 38], [79, 26, 37], [81, 26, 36], [85, 27, 38], [88, 27, 35], [89, 25, 35], [92, 22, 36]],
      arm: [29, 34],
    },
    f: {
      torso: [[28, 36], [26, 37], [25, 37], [24, 37], [23, 37], [23, 37], [23, 37], [24, 37], [25, 36], [26, 36], [26, 36],
        [26, 36], [26, 36], [26, 36], [26, 37], [25, 38], [25, 39], [25, 40], [25, 40], [25, 40], [25, 40], [25, 40]],
      leg: [[76, 25, 39], [79, 26, 37], [81, 26, 36], [85, 27, 37], [88, 27, 34], [89, 25, 34], [92, 23, 35]],
      arm: [29, 33],
    },
  };

  function side(sex) {
    const s = SIDE[sex];
    const L = {}; LAYERS.forEach((n) => { L[n] = newMask(); });
    L.sombra = shadowLayer();

    const trunk = rows(newMask(), 42, [[28, 35], [28, 35], [28, 35], [28, 35]]);
    rows(trunk, 46, s.torso);
    for (let y = 68; y <= 92; y++) {
      const t = s.leg.find((r) => y <= r[0]);
      rows(trunk, y, [[t[1], t[2]]]);
    }
    paint(L.corpo, trunk, SKIN, (c) => {
      if (c.y <= 45) return SHADE;
      if (c.y <= 48 && c.dT <= 2) return LIGHT;
      if (c.y >= 71 && c.y <= 72) return SHADE;
      if (c.y === 81 && c.dL >= 1 && c.dL <= 4) return SHADE;        // joelho
      if (c.y >= 49 && c.dR <= 2) return SHADE;                      // costas e parte de trás da perna
      if (c.y === 91) return SHADE;
      if (c.y === 90 && c.dL >= 1 && c.dL <= 6) return LIGHT;        // peito do pé
      if (c.y >= 74 && c.y <= 78 && c.dL >= 2 && c.dL <= 3) return LIGHT;
      if (sex === 'm' && c.y === 54 && c.dL <= 5) return SHADE;      // debaixo do peitoral
      return null;
    });

    const wide = (n) => Array.from({ length: n }, () => [16, 48]);
    const briefs = inter(rows(newMask(), 63, wide(7).concat([[30, 48]])), trunk);
    paint(L.inferior, briefs, UNDER, (c) => (c.y !== 64 && (c.dB <= 1 || c.dR <= 2) ? SHADE : null));
    if (sex === 'f') {
      const top = inter(rows(newMask(), 49, wide(7)), trunk);
      paint(L.superior, top, UNDER, (c) => (c.dB <= 1 || c.dR <= 2 ? SHADE : null));
    }

    const head = rows(newMask(), 16, HEAD_SIDE);
    paint(L.cabeca, head, SKIN, (c) => {
      if (c.y <= 24 && c.dT >= 1 && c.dT <= 4 && c.x >= 21 && c.x <= 42) return LIGHT;
      if (c.y >= 38 && c.dB <= 2) return SHADE;
      if (c.y >= 34 && c.dR <= 3 && c.dB <= 5) return SHADE;         // nuca
      return null;
    });
    px(L.cabeca, [[35, 29], [36, 29], [34, 30], [34, 31], [34, 32], [34, 33], [34, 34], [37, 30], [37, 31], [37, 32], [37, 33], [37, 34], [35, 35], [36, 35]], LINE);
    px(L.cabeca, [[35, 30], [36, 30], [35, 31], [35, 32], [35, 33], [35, 34], [36, 34]], SHADE); // orelha

    px(L.rosto, span(19, 23, 27), LINE);
    px(L.rosto, span(20, 22, 30), EYE_DARK);
    for (let y = 31; y <= 35; y++) px(L.rosto, span(20, 23, y), EYE_DARK);
    px(L.rosto, span(20, 22, 36), EYE_DARK);
    for (let y = 33; y <= 35; y++) px(L.rosto, span(20, 22, y), EYE_IRIS);
    px(L.rosto, [[21, 31], [21, 32]], EYE_SHINE);
    px(L.rosto, [[19, 39], [20, 39]], LINE);

    const [a, b] = s.arm;
    const arm = rows(newMask(), 47, [[a + 1, b - 1]]);
    for (let y = 48; y <= 54; y++) rows(arm, y, [[a, b]]);
    rows(arm, 55, [[a, b + 1], [a, b + 1]]);                         // cotovelo para trás
    for (let y = 57; y <= 62; y++) rows(arm, y, [[a - 1, b]]);       // antebraço um pixel à frente
    rows(arm, 63, [[a - 2, b], [a - 2, b], [a - 2, b], [a - 2, b], [a - 1, b - 1]]);
    paint(L.bracos, arm, SKIN, (c) => {
      if (c.y <= 50) return LIGHT;
      if (c.y === 56) return SHADE;
      if (c.y >= 66) return SHADE;
      return null;
    });

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
