// Arte do mapa (pixel art vista de cima, em 3/4): muralha, prédios, montanha, árvores,
// boneco de treino e enfeites. Tudo é desenhado UMA vez nos blocos de chão em cache (chunks,
// ver game.js), na resolução da pixel art (16 px por casa), e depois só copiado a cada quadro.
// O único elemento desenhado todo quadro é o telhado do portão (passa POR CIMA dos jogadores).
//
// Cada função recebe a posição e o tamanho em PIXELS do bloco (x, y, w, h); o que sai da caixa
// é cortado pelo próprio canvas do chunk, e como o desenho é determinístico (sorteio com
// semente pela posição), um prédio dividido entre dois chunks emenda certinho.

/** Sorteio com semente (o mesmo desenho em todo chunk e em todo celular). */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const rect = (g, color, x, y, w, h) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

// ------------------------------------------------------------------ muralha e portão

/**
 * Muralha de pedra: face de cima mais clara (nas laterais, uma faixa clara por todo o
 * comprimento), tijolos desencontrados e contorno escuro.
 */
function drawRampart(g, x, y, w, h) {
  rect(g, '#3f3c38', x, y, w, h);
  rect(g, '#6b6760', x + 1, y + 1, w - 2, h - 2);
  if (w >= h) rect(g, '#8a857c', x + 1, y + 1, w - 2, Math.max(3, Math.floor((h - 2) * 0.35)));   // topo iluminado
  else rect(g, '#8a857c', x + Math.floor(w * 0.3), y + 1, Math.max(3, Math.floor(w * 0.4)), h - 2);
  g.fillStyle = '#4f4c47';
  for (let ly = y + 8, row = 0; ly < y + h - 1; ly += 8, row++) {
    g.fillRect(x + 1, ly, w - 2, 1);                                                  // fiadas
    for (let lx = x + (row % 2 ? 6 : 1); lx < x + w - 1; lx += 12) g.fillRect(lx, ly - 7, 1, 7);
  }
}

/** Pilar vermelho do portão, com capitel escuro. */
function drawGatePost(g, x, y, w, h) {
  rect(g, 'rgba(0,0,0,0.3)', x + 3, y + 4, w, h);
  rect(g, '#4a120e', x + 4, y, w - 8, h);
  rect(g, '#a52f25', x + 6, y + 1, w - 12, h - 2);
  rect(g, '#c8473a', x + 6, y + 1, 2, h - 2);
  rect(g, '#2b2b33', x, y, w, 5);                                                     // capitel
}

/**
 * Telhado do portão principal: desenhado POR CIMA dos jogadores (quem passa fica embaixo).
 * Telhas escuras, viga vermelha e uma placa clara no meio. Coordenadas de tela.
 */
export function drawGateRoof(ctx, x, y, w, h) {
  const t = h / 2;                                   // h = 2 casas
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 4, y + h * 0.75, w, h * 0.35);
  ctx.fillStyle = '#1f2633';
  ctx.fillRect(x, y, w, h * 0.7);
  ctx.fillStyle = '#34405a';
  for (let i = 0; i < w; i += Math.max(4, t / 4)) ctx.fillRect(x + i, y + 2, Math.max(2, t / 8), h * 0.62);   // telhas
  ctx.fillStyle = '#4b5a7c';
  ctx.fillRect(x, y, w, Math.max(2, h * 0.08));                                         // cumeeira
  ctx.fillStyle = '#9e2a22';
  ctx.fillRect(x + t * 0.3, y + h * 0.7, w - t * 0.6, h * 0.18);                       // viga
  ctx.fillStyle = '#e9dcbc';
  ctx.fillRect(x + w / 2 - t * 0.9, y + h * 0.22, t * 1.8, h * 0.34);                 // placa
  ctx.fillStyle = '#5a3a1e';
  ctx.fillRect(x + w / 2 - t * 0.6, y + h * 0.33, t * 1.2, Math.max(1, h * 0.05));
}

// ------------------------------------------------------------------ montanha

/**
 * Paredão de rocha no topo da Vila: massa cinza-escura com cristas, facetas claras, rachaduras
 * e manchas (textura de pedra). Sem rostos: é uma montanha comum.
 */
function drawRock(g, x, y, w, h, seed) {
  const r = rng(seed);
  // silhueta: cristas irregulares em cima, base reta
  g.fillStyle = '#2c2a28';
  g.beginPath();
  g.moveTo(x, y + h);
  const peaks = Math.max(4, Math.round(w / 40));
  for (let i = 0; i <= peaks; i++) {
    const px = x + (w * i) / peaks;
    const py = y + (i % 2 ? 6 + r() * h * 0.25 : r() * 6);
    g.lineTo(px, py);
  }
  g.lineTo(x + w, y + h);
  g.closePath();
  g.fill();
  // corpo
  g.save();
  g.clip();
  rect(g, '#4a4744', x, y, w, h);
  for (let i = 0; i < w * h / 180; i++) {            // manchas e facetas
    const cx = x + r() * w, cy = y + r() * h, rad = 3 + r() * 10;
    g.fillStyle = r() < 0.5 ? '#5b5753' : '#3d3a37';
    g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#6f6a64';
  for (let i = 0; i < w / 14; i++) {                 // facetas iluminadas (luz de cima à esquerda)
    const cx = x + r() * w, cy = y + r() * h * 0.7;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 10 + r() * 14, cy + 4); g.lineTo(cx + 4, cy + 12 + r() * 10); g.closePath(); g.fill();
  }
  g.fillStyle = '#25231f';
  for (let i = 0; i < w / 18; i++) {                 // rachaduras
    let cx = x + r() * w, cy = y + r() * h * 0.6;
    for (let k = 0; k < 6; k++) { g.fillRect(cx, cy, 1, 3); cx += r() < 0.5 ? -1 : 1; cy += 3; }
  }
  rect(g, 'rgba(0,0,0,0.28)', x, y + h - 6, w, 6);   // pé da montanha (sombra)
  g.restore();
}

// ------------------------------------------------------------------ prédios

const ROOF = {
  leader: ['#5e1712', '#a3302a', '#c2463b'],         // [sombra, telhado, brilho]
  default: ['#4a1411', '#7d2420', '#94342c'],
};
const WALLS = { wood: ['#5c3a1c', '#9b6a3c'], beige: ['#7a5c36', '#d9c49a'] };

/** Placa sobre a porta: ícone simples do que o prédio é. */
function drawSign(g, cx, y, style) {
  const s = 12;
  if (style === 'hospital') {
    rect(g, '#f2efe6', cx - s / 2, y, s, s);
    rect(g, '#2f9a4a', cx - 1.5, y + 2, 3, s - 4);   // cruz verde
    rect(g, '#2f9a4a', cx - s / 2 + 2, y + s / 2 - 1.5, s - 4, 3);
    return;
  }
  rect(g, '#4a2e17', cx - s / 2 - 1, y - 1, s + 2, s + 2);
  rect(g, style === 'academy' ? '#2f5d8a' : '#e9dcbc', cx - s / 2, y, s, s);
  if (style === 'shop_weapon') { rect(g, '#7c8794', cx - 1, y + 2, 2, 7); rect(g, '#5a3a1e', cx - 3, y + 8, 6, 1); rect(g, '#5a3a1e', cx - 1, y + 9, 2, 2); }
  else if (style === 'shop_cloth') { rect(g, '#2f6fb5', cx - 4, y + 3, 8, 7); rect(g, '#2f6fb5', cx - 5, y + 3, 10, 3); rect(g, '#e9dcbc', cx - 1, y + 3, 2, 2); }
  else if (style === 'shop_scroll') { rect(g, '#c9a96e', cx - 4, y + 3, 8, 6); rect(g, '#7a4e22', cx - 5, y + 3, 1, 6); rect(g, '#7a4e22', cx + 4, y + 3, 1, 6); }
  else if (style === 'academy') { rect(g, '#f2e6c4', cx - 3, y + 3, 6, 6); rect(g, '#2f5d8a', cx - 1, y + 4, 2, 4); }
}

/**
 * Prédio em 3/4: telhado (vermelho-escuro; a sede em vermelho vivo e com 2 andares) em cima e
 * a fachada (bege, ou madeira nas cabanas) embaixo, com porta, janelas, vigas e placa.
 */
function drawBuilding(g, x, y, w, h, style, seed) {
  const r = rng(seed);
  const [shade, roof, light] = ROOF[style === 'leader' ? 'leader' : 'default'];
  const [beam, wallc] = style === 'hut' || style === 'home' ? WALLS.wood : WALLS.beige;
  const rh = Math.round(h * 0.6), fh = h - rh;
  rect(g, 'rgba(0,0,0,0.25)', x + 4, y + 6, w, h);                                    // sombra
  // fachada
  rect(g, beam, x + 2, y + rh - 2, w - 4, fh + 2);
  rect(g, wallc, x + 4, y + rh, w - 8, fh - 3);
  for (let bx = x + 4; bx < x + w - 6; bx += 24) rect(g, beam, bx, y + rh, 2, fh - 3);   // vigas
  rect(g, beam, x + 4, y + h - 5, w - 8, 2);                                           // rodapé
  const door = Math.min(14, Math.max(8, Math.round(w * 0.12)));
  rect(g, '#2b1a0e', x + w / 2 - door / 2, y + h - fh + 4, door, fh - 7);               // porta
  rect(g, '#4a2e17', x + w / 2 - door / 2, y + h - fh + 4, door, 2);
  for (let wx = x + 12; wx < x + w - 18; wx += 26) {                                    // janelas
    if (Math.abs(wx + 4 - (x + w / 2)) < door) continue;
    rect(g, '#3b2a1a', wx, y + rh + 4, 9, 7);
    rect(g, style === 'hut' ? '#c9a96e' : '#6f8fa3', wx + 1, y + rh + 5, 7, 5);
    rect(g, '#3b2a1a', wx + 4, y + rh + 5, 1, 5);
  }
  // telhado
  rect(g, shade, x, y, w, rh);
  rect(g, roof, x + 2, y + 2, w - 4, rh - 6);
  g.fillStyle = shade;
  for (let tx = x + 5; tx < x + w - 4; tx += 5) g.fillRect(tx, y + 3, 1, rh - 8);      // telhas
  rect(g, light, x + 2, y + Math.floor(rh * 0.42), w - 4, 2);                          // cumeeira
  rect(g, shade, x - 2, y + rh - 5, w + 4, 4);                                         // beiral
  if (style === 'leader') {
    // segundo andar: telhado menor em cima, pilares vermelhos na entrada e um emblema redondo
    const uw = Math.round(w * 0.56), ux = x + Math.round((w - uw) / 2), uh = Math.round(rh * 0.5);
    rect(g, 'rgba(0,0,0,0.25)', ux + 3, y + 4 + uh, uw, 4);
    rect(g, shade, ux, y + 3, uw, uh);
    rect(g, roof, ux + 2, y + 5, uw - 4, uh - 5);
    rect(g, light, ux + 2, y + 3 + Math.floor(uh * 0.4), uw - 4, 2);
    rect(g, shade, ux - 2, y + uh, uw + 4, 3);
    g.fillStyle = '#e9dcbc';
    g.beginPath(); g.arc(x + w / 2, y + uh + 12, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c99a2e';
    g.beginPath(); g.arc(x + w / 2, y + uh + 12, 3, 0, Math.PI * 2); g.fill();
    for (const px of [x + w / 2 - door - 4, x + w / 2 + door + 1]) rect(g, '#a52f25', px, y + rh - 2, 3, fh - 2);
  }
  if (style !== 'hut' && style !== 'home') drawSign(g, x + w / 2, y + rh + 2, style);
  if (style === 'hut') rect(g, '#6b4423', x + 6 + Math.floor(r() * 4), y + h - 8, 6, 4);   // caixote
}

// ------------------------------------------------------------------ árvores e boneco

/**
 * Árvores vistas de cima: uma copa verde-escura a cada ~2 casas do bloco, com sombra,
 * contorno e brilho. Um bloco comprido (mata da borda) vira uma fileira.
 */
function drawTrees(g, x, y, w, h, seed, tile) {
  const nx = Math.max(1, Math.round(w / (2 * tile))), ny = Math.max(1, Math.round(h / (2 * tile)));
  const cw = w / nx, ch = h / ny;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = x + cw * (i + 0.5), cy = y + ch * (j + 0.5);
      const r = Math.min(cw, ch) / 2;
      const k = (seed + i * 7 + j * 13) % 3;
      g.fillStyle = 'rgba(0, 0, 0, 0.28)';
      g.beginPath(); g.arc(cx + 2, cy + 3, r - 1, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#123312';
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = k === 0 ? '#1f5a1f' : k === 1 ? '#226322' : '#1c531c';
      g.beginPath(); g.arc(cx, cy, r - 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2f7d2c';
      g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.3, r * 0.45, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3d9637';
      g.fillRect(Math.round(cx - r * 0.45), Math.round(cy - r * 0.5), 2, 2);
    }
  }
}

/** Boneco de treino de madeira: poste, braço cruzado e cabeça de palha. */
function drawDummy(g, x, y, w, h) {
  const cx = x + w / 2;
  rect(g, 'rgba(0,0,0,0.3)', cx - 5, y + h - 3, 12, 4);
  rect(g, '#5c3a1c', cx - 2, y + 4, 4, h - 4);
  rect(g, '#7a5230', cx - 7, y + 7, 14, 3);
  g.fillStyle = '#d2b07a';
  g.beginPath(); g.arc(cx, y + 3, 4, 0, Math.PI * 2); g.fill();
  rect(g, '#a8803f', cx - 3, y + 3, 6, 1);
}

// ------------------------------------------------------------------ interiores (lojas)

/**
 * Parede de interior em 3/4: arremate escuro em cima, reboco bege e rodapé de madeira. As
 * paredes finas (laterais e da frente) viram uma viga de madeira escura.
 */
function drawInteriorWall(g, x, y, w, h, tile) {
  if (h >= tile * 2 && w > h) {                      // parede do fundo: dá para ver a face
    rect(g, '#3b2414', x, y, w, h);
    rect(g, '#d8c49a', x, y + 6, w, h - 16);
    rect(g, '#c4ad80', x, y + 6, w, 2);
    for (let bx = x + 20; bx < x + w - 4; bx += 40) rect(g, '#7a5230', bx, y + 6, 3, h - 16);   // pilares
    rect(g, '#8b5a2b', x, y + h - 10, w, 10);         // rodapé
    rect(g, '#5c3a1c', x, y + h - 10, w, 2);
    return;
  }
  rect(g, '#2b1a0e', x, y, w, h);
  rect(g, '#5c3a1c', x + 2, y + 2, w - 4, h - 4);
  rect(g, '#7a5230', x + 2, y + 2, w - 4, 2);
}

/** Balcão de madeira: tampo claro com borda, frente em painéis; um caixinha de moedas no meio. */
function drawCounter(g, x, y, w, h) {
  rect(g, 'rgba(0,0,0,0.3)', x + 2, y + 4, w, h);
  rect(g, '#4a2e17', x, y, w, h);
  rect(g, '#b07a42', x + 1, y + 1, w - 2, Math.round(h * 0.45));          // tampo
  rect(g, '#c99257', x + 1, y + 1, w - 2, 2);
  rect(g, '#7a4c22', x + 1, y + Math.round(h * 0.45) + 1, w - 2, h - Math.round(h * 0.45) - 2);   // frente
  g.fillStyle = '#5c3a1c';
  for (let px = x + 10; px < x + w - 4; px += 16) g.fillRect(px, y + Math.round(h * 0.45) + 2, 1, h - Math.round(h * 0.45) - 4);
  if (w > 64) {
    rect(g, '#3b2414', x + w / 2 - 5, y + 2, 10, 5);                       // caixa de moedas
    rect(g, '#e9c74a', x + w / 2 - 3, y + 3, 6, 2);
  }
}

/** Prateleira de madeira (fundo) com o que estiver em cima, desenhado por `item(cx, cy)`. */
function shelf(g, x, y, w, h, rows, cols, item) {
  rect(g, 'rgba(0,0,0,0.25)', x + 2, y + 3, w, h);
  rect(g, '#4a2e17', x, y, w, h);
  rect(g, '#6b4423', x + 2, y + 2, w - 4, h - 4);
  const rh = (h - 4) / rows, cw = (w - 4) / cols;
  for (let r = 0; r < rows; r++) {
    rect(g, '#3b2414', x + 2, y + 2 + rh * (r + 1) - 2, w - 4, 2);           // tábua
    for (let c = 0; c < cols; c++) item(x + 2 + cw * (c + 0.5), y + 2 + rh * r + rh / 2, cw, rh, r * cols + c);
  }
}

const CLOTH = ['#c94f7c', '#2f6fb5', '#3b6e4f', '#e8c66a', '#7a3b1e', '#e9dcbc'];

/** Móveis das lojas: cada loja tem os seus (o servidor colide com eles). */
function drawFurniture(g, x, y, w, h, kind, seed) {
  const r = rng(seed);
  switch (kind) {
    case 'sword_rack':                                // painel com espadas penduradas
      rect(g, '#4a2e17', x, y, w, h);
      rect(g, '#7a5230', x + 2, y + 2, w - 4, h - 4);
      for (let sx = x + 8; sx < x + w - 6; sx += 12) {
        rect(g, '#b8c2cc', sx, y + 6, 3, h - 18);      // lâmina
        rect(g, '#e6edf2', sx, y + 6, 1, h - 18);
        rect(g, '#3b2414', sx - 3, y + h - 12, 9, 2);   // guarda
        rect(g, '#7a2e1e', sx, y + h - 10, 3, 6);       // cabo
      }
      return;
    case 'spear_rack':                                // lanças em pé
      rect(g, '#4a2e17', x, y + h - 6, w, 6);
      for (let i = 0; i < 3; i++) {
        const sx = x + 3 + i * Math.max(3, (w - 8) / 2);
        rect(g, '#7a5230', sx, y + 6, 2, h - 10);
        rect(g, '#c9d2da', sx - 1, y, 4, 7);
      }
      return;
    case 'shield_rack':                               // escudos redondos empilhados na parede
      rect(g, '#4a2e17', x + w / 2 - 2, y, 4, h);
      for (let sy = y + 8; sy < y + h - 4; sy += 16) {
        g.fillStyle = '#3b2414'; g.beginPath(); g.arc(x + w / 2, sy, 7, 0, Math.PI * 2); g.fill();
        g.fillStyle = r() < 0.5 ? '#9e2a22' : '#2f5d8a'; g.beginPath(); g.arc(x + w / 2, sy, 5, 0, Math.PI * 2); g.fill();
        rect(g, '#c9d2da', x + w / 2 - 1, sy - 1, 2, 2);
      }
      return;
    case 'barrel':
      g.fillStyle = '#4a2e17'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8b5a2b'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2 - 2, 0, Math.PI * 2); g.fill();
      rect(g, '#5d5a55', x + 1, y + h / 2 - 1, w - 2, 2);
      return;
    case 'mannequin': {                               // manequim de roupa: suporte, corpo vestido, cabeça
      const cx = x + w / 2, color = CLOTH[Math.floor(r() * CLOTH.length)];
      rect(g, 'rgba(0,0,0,0.3)', cx - 6, y + h - 3, 13, 4);
      rect(g, '#5c3a1c', cx - 1, y + h - 6, 2, 5);
      rect(g, '#3b2414', cx - 7, y + 3, 14, h - 8);
      rect(g, color, cx - 6, y + 4, 12, h - 10);
      rect(g, '#2b2118', cx - 6, y + h / 2, 12, 2);   // faixa
      g.fillStyle = '#e6d3b3'; g.beginPath(); g.arc(cx, y + 2, 4, 0, Math.PI * 2); g.fill();
      return;
    }
    case 'cloth_shelf':                               // roupas dobradas, pilhas coloridas
      return shelf(g, x, y, w, h, 2, Math.max(2, Math.round(w / 14)), (cx, cy, cw, rh, i) => {
        for (let k = 0; k < 3; k++) rect(g, CLOTH[(i + k) % CLOTH.length], cx - cw * 0.35, cy + rh * 0.2 - k * 4, cw * 0.7, 3);
      });
    case 'scroll_shelf':                              // pergaminhos enrolados com fita vermelha
      return shelf(g, x, y, w, h, Math.max(2, Math.round(h / 14)), Math.max(1, Math.round(w / 12)), (cx, cy, cw) => {
        for (let k = -1; k <= 1; k++) {
          rect(g, '#e9dcbc', cx + k * Math.min(5, cw / 3) - 2, cy - 4, 4, 9);
          rect(g, '#9e2a22', cx + k * Math.min(5, cw / 3) - 2, cy, 4, 1);
        }
      });
    case 'scroll_table':                              // mesa com um pergaminho aberto e pincel
      rect(g, 'rgba(0,0,0,0.3)', x + 2, y + 3, w, h);
      rect(g, '#4a2e17', x, y, w, h);
      rect(g, '#8b5a2b', x + 1, y + 1, w - 2, h - 2);
      rect(g, '#efe3c2', x + 4, y + 3, w - 8, h - 7);
      rect(g, '#3b2414', x + 7, y + 5, w - 14, 1);
      rect(g, '#3b2414', x + 7, y + 8, w - 18, 1);
      rect(g, '#2b2118', x + w - 6, y + 2, 1, 8);
      return;
    default:
      return undefined;
  }
}

/** Desenha uma parede (colisão) conforme o tipo. Água fica só no chão (o tile já é o rio). */
export function drawWall(g, wall, x, y, w, h, tile) {
  const seed = (wall.x * 73856093) ^ (wall.y * 19349663);
  switch (wall.k) {
    case 'wall': return drawRampart(g, x, y, w, h);
    case 'gatepost': return drawGatePost(g, x, y, w, h);
    case 'rock': return drawRock(g, x, y, w, h, seed);
    case 'house': return drawBuilding(g, x, y, w, h, wall.s || 'home', seed);
    case 'tree': return drawTrees(g, x, y, w, h, Math.abs(seed) % 97, tile);
    case 'dummy': return drawDummy(g, x, y, w, h);
    case 'iwall': return drawInteriorWall(g, x, y, w, h, tile);
    case 'counter': return drawCounter(g, x, y, w, h);
    case 'furniture': return drawFurniture(g, x, y, w, h, wall.s, Math.abs(seed));
    default: return undefined;
  }
}

// ------------------------------------------------------------------ enfeites (sem colisão)

/** Bancos, rosa dos ventos no chão, lanternas de pedra, vasos, tapete e capacho. O telhado do portão é à parte. */
export function drawDeco(g, d, x, y, w, h) {
  switch (d.k) {
    case 'rug': {                                     // tapete vermelho com barra dourada
      rect(g, '#5e1712', x, y, w, h);
      rect(g, '#9e2a22', x + 3, y + 3, w - 6, h - 6);
      g.strokeStyle = '#d9a441';
      g.lineWidth = 1;
      g.strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
      rect(g, '#d9a441', x + w / 2 - 3, y + h / 2 - 3, 6, 6);
      return;
    }
    case 'mat':                                       // capacho na porta
      rect(g, '#5c3a1c', x, y, w, h);
      g.fillStyle = '#8b5a2b';
      for (let i = x + 2; i < x + w - 1; i += 3) g.fillRect(i, y + 1, 1, h - 2);
      return;
    case 'bench': {
      rect(g, 'rgba(0,0,0,0.25)', x + 2, y + 3, w, h);
      rect(g, '#5c3a1c', x + 1, y + 2, w - 2, h - 4);
      rect(g, '#8b5a2b', x + 2, y + 3, w - 4, h - 6);
      g.fillStyle = '#6b4423';
      if (w >= h) for (let i = x + 5; i < x + w - 3; i += 5) g.fillRect(i, y + 3, 1, h - 6);
      else for (let i = y + 5; i < y + h - 3; i += 5) g.fillRect(x + 2, i, w - 4, 1);
      return;
    }
    case 'rosette': {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 - 1;
      g.fillStyle = '#9d998f'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#dcd8ce'; g.beginPath(); g.arc(cx, cy, r - 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#8a867c';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
      }
      g.stroke();
      g.beginPath(); g.arc(cx, cy, r * 0.45, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#9d998f'; g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
      return;
    }
    case 'lamp': {
      const cx = x + w / 2;
      rect(g, 'rgba(0,0,0,0.25)', cx - 3, y + h - 4, 9, 4);
      rect(g, '#6f6b64', cx - 4, y + h - 5, 8, 4);
      rect(g, '#8a857c', cx - 2, y + 6, 4, h - 10);
      rect(g, '#5d5a55', cx - 6, y + 2, 12, 5);
      rect(g, '#f6d77a', cx - 3, y + 7, 6, 4);
      return;
    }
    case 'plant': {
      const cx = x + w / 2;
      rect(g, '#7a4c22', cx - 4, y + h - 7, 8, 6);
      g.fillStyle = '#2f7d2c'; g.beginPath(); g.arc(cx, y + h - 9, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3d9637'; g.beginPath(); g.arc(cx - 2, y + h - 11, 2, 0, Math.PI * 2); g.fill();
      return;
    }
    case 'cushion': {                                 // almofada de meditação (Academia, sala 2)
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(cx + 1, cy + 2, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3b2f6e'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5a4aa0'; g.beginPath(); g.arc(cx, cy, r - 3, 0, Math.PI * 2); g.fill();
      rect(g, '#e8c66a', cx - 1, cy - 1, 2, 2);
      return;
    }
    case 'board': {                                   // quadro de lições pendurado na parede
      rect(g, '#3b2414', x, y, w, h);
      rect(g, '#2d4a3a', x + 2, y + 2, w - 4, h - 4);
      g.fillStyle = '#e9dcbc';
      for (let ly = y + 5; ly < y + h - 4; ly += 4) g.fillRect(x + 6, ly, (w - 12) * (0.5 + ((ly * 7) % 5) / 10), 1);
      return;
    }
    default:
      return undefined;
  }
}

/**
 * Porta de correr da Academia (desenhada a cada quadro, por cima do chão): FECHADA (painéis de
 * papel com uma tranca vermelha) enquanto o tutorial do jogador não chegou no passo dela;
 * ABERTA (painéis recolhidos) depois. Coordenadas de tela; `vertical` = porta numa parede lateral.
 */
export function drawAcademyDoor(g, x, y, w, h, open, vertical, now) {
  if (open) {
    rect(g, 'rgba(120, 220, 140, 0.18)', x, y, w, h);
    g.strokeStyle = 'rgba(140, 240, 160, 0.55)';
    g.lineWidth = 2;
    g.strokeRect(Math.round(x) + 1, Math.round(y) + 1, Math.round(w) - 2, Math.round(h) - 2);
    return;
  }
  rect(g, '#3b2414', x, y, w, h);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const px = vertical ? x + 2 : x + 2 + ((w - 4) / n) * i;
    const py = vertical ? y + 2 + ((h - 4) / n) * i : y + 2;
    const pw = vertical ? w - 4 : (w - 4) / n - 1;
    const ph = vertical ? (h - 4) / n - 1 : h - 4;
    rect(g, '#efe3c2', px, py, pw, ph);
  }
  const pulse = 0.65 + 0.35 * Math.sin(now / 300);
  g.globalAlpha = pulse;
  rect(g, '#b3261e', x + w / 2 - 4, y + h / 2 - 4, 8, 8);    // tranca
  g.globalAlpha = 1;
}
