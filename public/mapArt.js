// Arte do mapa (pixel art vista de cima, em 3/4): muralha, prédios, montanha, árvores,
// boneco de treino e enfeites. Tudo é desenhado UMA vez nos blocos de chão em cache (chunks,
// ver game.js), na resolução da pixel art (16 px por casa), e depois só copiado a cada quadro.
// O único elemento desenhado todo quadro é o telhado do portão (passa POR CIMA dos jogadores).
//
// Cada função recebe a posição e o tamanho em PIXELS do bloco (x, y, w, h); o que sai da caixa
// é cortado pelo próprio canvas do chunk, e como o desenho é determinístico (sorteio com
// semente pela posição), um prédio dividido entre dois chunks emenda certinho.

/**
 * Resolução da arte do mapa: cada unidade de desenho (16 por casa) vira ART pixels de verdade. A arte antiga desenha
 * em unidades inteiras; a nova usa frações para o detalhe fino (1/ART = 1 pixel), perto da densidade dos bonecos.
 */
export const ART = 3;
const FINE = 1 / ART;
/** Retângulo com detalhe fino (arredonda para o pixel de verdade, não para a unidade). */
const fr = (g, color, x, y, w, h) => {
  g.fillStyle = color;
  g.fillRect(Math.round(x * ART) / ART, Math.round(y * ART) / ART, Math.max(FINE, Math.round(w * ART) / ART), Math.max(FINE, Math.round(h * ART) / ART));
};

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
export function drawGateRoof(ctx, x, y, w, h, theme) {
  if (theme === 'areia') return drawSandLintel(ctx, x, y, w, h);
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
/** Cores da rocha: [contorno, corpo, mancha clara, mancha escura, faceta, rachadura]. A da caverna é arroxeada. */
const ROCK = ['#2c2a28', '#4a4744', '#5b5753', '#3d3a37', '#6f6a64', '#25231f'];
const CAVE_ROCK = ['#1a1520', '#2f2838', '#3b3346', '#262030', '#4d4460', '#14101a'];

function drawRock(g, x, y, w, h, seed, pal = ROCK) {
  const r = rng(seed);
  // silhueta: cristas irregulares em cima, base reta
  g.fillStyle = pal[0];
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
  rect(g, pal[1], x, y, w, h);
  for (let i = 0; i < w * h / 180; i++) {            // manchas e facetas
    const cx = x + r() * w, cy = y + r() * h, rad = 3 + r() * 10;
    g.fillStyle = r() < 0.5 ? pal[2] : pal[3];
    g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = pal[4];
  for (let i = 0; i < w / 14; i++) {                 // facetas iluminadas (luz de cima à esquerda)
    const cx = x + r() * w, cy = y + r() * h * 0.7;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 10 + r() * 14, cy + 4); g.lineTo(cx + 4, cy + 12 + r() * 10); g.closePath(); g.fill();
  }
  g.fillStyle = pal[5];
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
/** Telhados de cada vila (v16): a mesma planta, cores diferentes. [sombra, telhado, brilho]; leader = a sede. */
const THEME_ROOF = {
  nevoa: { default: ['#1b3a48', '#2f6378', '#4a8aa2'], leader: ['#173544', '#3a7a92', '#5aa2bd'] },
  nuvem: { default: ['#3b1520', '#6b2836', '#86404c'], leader: ['#2e1018', '#7e2f3e', '#9c4a58'] },
  areia: { default: ['#7a4a1e', '#b9773a', '#d39a55'], leader: ['#6e3f18', '#c8863e', '#e0aa62'] },
  refugio: { default: ['#2a2018', '#4a3a2a', '#5e4a36'], leader: ['#2a2018', '#4a3a2a', '#5e4a36'] },
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
 * Onde ficam a porta, as janelas e a lanterna da fachada de um prédio (unidades, a partir do canto da caixa). O
 * desenho e as luzes da noite usam a mesma conta.
 */
function facadeLayout(w, h, style) {
  const rh = Math.round(h * 0.58), fh = h - rh;
  const door = Math.min(16, Math.max(9, Math.round(w * 0.12)));
  const dx = w / 2 - door / 2;
  const posts = [];
  const span = 22;
  const n = Math.max(2, Math.round((w - 8) / span));
  for (let i = 0; i <= n; i++) posts.push(4 + ((w - 10) * i) / n);
  const windows = [];
  const ww = style === 'hut' ? 9 : 12, wh = Math.min(10, Math.max(6, Math.round(fh * 0.34)));
  for (let i = 0; i < posts.length - 1; i++) {
    const cx = (posts[i] + posts[i + 1]) / 2 + 1;
    if (Math.abs(cx - w / 2) < door / 2 + ww / 2 + 2) continue;
    windows.push({ x: cx - ww / 2, y: rh + 4, w: ww, h: wh });
  }
  const shop = style !== 'hut' && style !== 'home';
  return { rh, fh, door, dx, posts, windows, lantern: shop ? { x: dx - 6, y: rh + 3 } : null };
}

/**
 * Luzes da noite de um prédio (em casas): as janelas de papel e a lanterna da porta. O cliente acende de noite.
 */
export function buildingLights(wall) {
  const U = 16, f = facadeLayout(wall.w * U, wall.h * U, wall.s || 'home');
  const out = f.windows.map((wd) => ({ x: wall.x + (wd.x + wd.w / 2) / U, y: wall.y + (wd.y + wd.h / 2) / U, kind: 'window' }));
  if (f.lantern) out.push({ x: wall.x + (f.lantern.x + 2) / U, y: wall.y + (f.lantern.y + 4) / U, kind: 'lantern' });
  return out;
}

/** Cor mais clara/escura (para tirar mais tons da paleta do telhado da vila). */
function mix(hex, to, k) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const c = (sh) => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k);
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

/**
 * Telhado japonês visto de cima em 3/4: a água de trás (estreita, mais escura), a da frente (grande) com as fileiras
 * de telha e as pontinhas redondas, a cumeeira com as pontas curvadas para cima e o beiral passando da parede, com
 * sombra embaixo e os cantos levantados.
 */
function drawRoof(g, x, y, w, rh, pal, over = 3) {
  const [shade, roof, light] = pal;
  const ridgeY = y + Math.round(rh * 0.3), hip = Math.min(w * 0.18, 26);
  const ex = x - over, ew = w + over * 2, ey = y + rh;
  // contorno e a água de trás
  g.fillStyle = mix(shade, '#000000', 0.35);
  roundedPath(g, ex - 0.6, y - 0.6, ew + 1.2, rh + 1.2, 5, 5, 2, 2); g.fill();
  g.fillStyle = mix(roof, '#000000', 0.25);
  roundedPath(g, x + 1, y, w - 2, ridgeY - y + 2, 5, 5, 0, 0); g.fill();
  for (let ty = y + 3; ty < ridgeY; ty += 3.5) fr(g, mix(roof, '#000000', 0.38), x + 3, ty, w - 6, FINE * 2);
  // a água da frente: trapézio do pé da cumeeira até o beiral, clareando para cima
  const grad = g.createLinearGradient(0, ridgeY, 0, ey);
  grad.addColorStop(0, light);
  grad.addColorStop(0.45, roof);
  grad.addColorStop(1, mix(roof, shade, 0.6));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x + hip, ridgeY); g.lineTo(x + w - hip, ridgeY); g.lineTo(ex + ew, ey - 2); g.lineTo(ex, ey - 2); g.closePath(); g.fill();
  // as águas dos lados (quadris), um pouco mais escuras
  g.fillStyle = mix(roof, '#000000', 0.18);
  g.beginPath(); g.moveTo(x + 1, y + 3); g.lineTo(x + hip, ridgeY); g.lineTo(ex, ey - 2); g.lineTo(ex, y + 6); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(x + w - 1, y + 3); g.lineTo(x + w - hip, ridgeY); g.lineTo(ex + ew, ey - 2); g.lineTo(ex + ew, y + 6); g.closePath(); g.fill();
  // fileiras de telha (na frente): linha escura e as pontinhas redondas de cada telha
  for (let ty = ridgeY + 4; ty < ey - 4; ty += 4.5) {
    const k = (ty - ridgeY) / (ey - ridgeY), lx = x + hip + (ex - x - hip) * k, rx = x + w - hip + (ex + ew - (x + w - hip)) * k;
    fr(g, mix(roof, '#000000', 0.42), lx, ty, rx - lx, FINE * 2);
    g.fillStyle = mix(roof, '#000000', 0.3);
    for (let tx = lx + 1.5 + (Math.round(ty) % 2) * 1.5; tx < rx - 1; tx += 3.2) { g.beginPath(); g.arc(tx, ty + 0.6, 0.9, 0, Math.PI); g.fill(); }
    fr(g, mix(light, '#ffffff', 0.15), lx, ty - FINE * 2, rx - lx, FINE);
  }
  // as linhas dos quadris
  g.strokeStyle = mix(light, '#ffffff', 0.25); g.lineWidth = 1;
  g.beginPath(); g.moveTo(x + hip, ridgeY); g.lineTo(ex + 1, ey - 3); g.moveTo(x + w - hip, ridgeY); g.lineTo(ex + ew - 1, ey - 3); g.stroke();
  // a cumeeira, com as pontas curvadas
  fr(g, mix(shade, '#000000', 0.3), x + hip - 3, ridgeY - 3, w - hip * 2 + 6, 4.5);
  fr(g, mix(light, '#ffffff', 0.2), x + hip - 3, ridgeY - 3, w - hip * 2 + 6, FINE * 2);
  for (const sx of [x + hip - 3, x + w - hip + 3]) {
    g.fillStyle = mix(shade, '#000000', 0.3);
    g.beginPath(); g.arc(sx, ridgeY - 2.5, 2.8, 0, Math.PI * 2); g.fill();
    g.fillStyle = mix(light, '#ffffff', 0.3);
    g.beginPath(); g.arc(sx - 0.6, ridgeY - 3.2, 1, 0, Math.PI * 2); g.fill();
  }
  // o beiral: a faixa da borda e os cantos levantados
  fr(g, mix(shade, '#000000', 0.2), ex, ey - 3.5, ew, 3.5);
  fr(g, mix(light, '#ffffff', 0.1), ex, ey - 3.5, ew, FINE * 2);
  g.fillStyle = mix(shade, '#000000', 0.2);
  for (const [cx, dir] of [[ex, -1], [ex + ew, 1]]) {
    g.beginPath(); g.moveTo(cx - dir * 3, ey - 3.5); g.lineTo(cx + dir * 2.5, ey - 7); g.lineTo(cx + dir * 1, ey - 1); g.closePath(); g.fill();
  }
}

/**
 * Prédio em 3/4: o telhado japonês (cores da vila; a sede em dois andares) em cima e a fachada embaixo: base de
 * pedra, reboco (ou tábuas, nas casas) com vigas de madeira, janelas de papel com treliça, porta (cortina noren nas
 * lojas, porta de correr nas casas), a lanterna vermelha das lojas e a placa.
 */
function drawBuilding(g, x, y, w, h, style, seed, theme) {
  const r = rng(seed);
  const pal = (THEME_ROOF[theme] || ROOF)[style === 'leader' ? 'leader' : 'default'];
  const wood = style === 'hut' || style === 'home';
  const f = facadeLayout(w, h, style);
  const fy = y + f.rh, fh = f.fh;
  const beam = wood ? '#3e2614' : '#4a2e17', wallc = wood ? '#9b6a3c' : '#e6d8b8';
  g.fillStyle = 'rgba(10, 12, 8, 0.28)';                                            // sombra
  roundedPath(g, x + 5, y + 8, w, h - 2, 6); g.fill();
  // fachada
  fr(g, beam, x + 1, fy - 3, w - 2, fh + 1);
  fr(g, wallc, x + 3, fy, w - 6, fh - 6);
  if (wood) for (let px = x + 5; px < x + w - 4; px += 3.5) fr(g, mix(wallc, '#000000', 0.22), px, fy, FINE * 2, fh - 6);   // tábuas
  else for (let i = 0; i < w * fh / 60; i++) fr(g, r() < 0.5 ? '#d9caa8' : '#efe4c8', x + 4 + r() * (w - 8), fy + 1 + r() * (fh - 9), 1 + r() * 2, FINE * 2);   // reboco
  for (const px of f.posts) fr(g, beam, x + px, fy, 2.5, fh - 6);                    // pilares
  fr(g, beam, x + 3, fy + Math.round((fh - 6) * 0.62), w - 6, 1.6);                  // viga do meio
  fr(g, '#6d6a64', x + 1, y + h - 6, w - 2, 6);                                     // base de pedra
  for (let px = x + 2; px < x + w - 3; px += 5 + r() * 3) fr(g, r() < 0.5 ? '#8d8a84' : '#7d7a73', px, y + h - 5.5, 3.5 + r() * 2, 2.5);
  fr(g, '#4e4b46', x + 1, y + h - 1.5, w - 2, 1.5);
  for (const wd of f.windows) {                                                     // janelas de papel (shoji)
    const wx = x + wd.x, wy = y + wd.y;
    fr(g, beam, wx - 1, wy - 1, wd.w + 2, wd.h + 2);
    fr(g, style === 'hut' ? '#d9b97a' : '#f4ecd8', wx, wy, wd.w, wd.h);
    fr(g, 'rgba(255, 220, 150, 0.35)', wx, wy + wd.h * 0.5, wd.w, wd.h * 0.5);
    for (let k = 1; k < 3; k++) fr(g, '#8a6a44', wx + (wd.w * k) / 3, wy, FINE * 2, wd.h);
    fr(g, '#8a6a44', wx, wy + wd.h / 2, wd.w, FINE * 2);
    fr(g, mix(beam, '#000000', 0.2), wx - 1.5, wy + wd.h + 0.5, wd.w + 3, 1.5);     // peitoril
  }
  const dx = x + f.dx, dy = fy + 2, dh = fh - 8;                                   // a porta
  fr(g, '#1a1008', dx - 1, dy - 1, f.door + 2, dh + 1);
  if (wood) {
    fr(g, '#6e4a2a', dx, dy, f.door, dh);
    for (let k = 1; k < 3; k++) fr(g, '#3e2614', dx + (f.door * k) / 3, dy, FINE * 2, dh);
    fr(g, '#d9b97a', dx + 1, dy + 1.5, f.door - 2, dh * 0.4);
  } else {
    fr(g, '#2b1a0e', dx, dy, f.door, dh);
    const cloth = mix(pal[1], '#000000', 0.15);                                     // a cortina noren (3 tiras)
    for (let k = 0; k < 3; k++) fr(g, cloth, dx + 0.5 + k * (f.door / 3), dy, f.door / 3 - 1, dh * 0.55);
    fr(g, mix(pal[2], '#ffffff', 0.5), dx + f.door / 2 - 1.2, dy + dh * 0.18, 2.4, 2.4);
  }
  if (f.lantern) {                                                                  // a lanterna vermelha das lojas
    const lx = x + f.lantern.x, ly = y + f.lantern.y;
    fr(g, '#1a1008', lx + 1.5, ly - 2, FINE * 2, 2);
    g.fillStyle = '#1a1008';
    g.beginPath(); g.ellipse(lx + 2, ly + 4, 3, 4.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d23a2a';
    g.beginPath(); g.ellipse(lx + 2, ly + 4, 2.4, 3.6, 0, 0, Math.PI * 2); g.fill();
    fr(g, '#ff8a6a', lx + 0.6, ly + 2.2, 1, 3);
    fr(g, '#1a1008', lx + 0.4, ly + 0.4, 3.2, 0.8);
    fr(g, '#1a1008', lx + 0.4, ly + 7.2, 3.2, 0.8);
  }
  // telhado (a sede: o segundo andar menor por cima, pilares vermelhos e o emblema)
  drawRoof(g, x, y, w, f.rh, pal);
  if (style === 'leader') {
    const uw = Math.round(w * 0.56), ux = x + Math.round((w - uw) / 2), uh = Math.round(f.rh * 0.55);
    g.fillStyle = 'rgba(10, 12, 8, 0.3)';
    g.fillRect(ux + 3, y + uh - 1, uw, 5);
    drawRoof(g, ux, y - 4, uw, uh, pal, 4);
    g.fillStyle = '#1a1008';
    g.beginPath(); g.arc(x + w / 2, y + uh + 12, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e9dcbc';
    g.beginPath(); g.arc(x + w / 2, y + uh + 12, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c8261e';                                                         // a chama do emblema
    g.beginPath(); g.moveTo(x + w / 2, y + uh + 6.5); g.quadraticCurveTo(x + w / 2 + 5, y + uh + 12, x + w / 2, y + uh + 17); g.quadraticCurveTo(x + w / 2 - 5, y + uh + 12, x + w / 2, y + uh + 6.5); g.fill();
    g.fillStyle = '#f2a33a';
    g.beginPath(); g.ellipse(x + w / 2, y + uh + 13, 1.8, 3, 0, 0, Math.PI * 2); g.fill();
    for (const px of [x + f.dx - 5, x + f.dx + f.door + 2]) { fr(g, '#5e1712', px, fy - 3, 3.5, fh - 4); fr(g, '#a52f25', px + 0.5, fy - 3, 2, fh - 4); }
  }
  if (!wood) drawSign(g, x + w / 2, fy + 1, style);
}

// ------------------------------------------------------------------ vilas com tema (Névoa, Nuvem e Areia)
//
// As quatro vilas têm a mesma planta (as colisões são as mesmas); o desenho muda com o tema do mapa (`wall.t`,
// `d.t`). Referência: as artes de cada vila (Névoa com bambu e poças, Nuvem com bandeiras e nuvens no morro, Areia
// de arenito, com cúpulas, torres redondas, cânion, palmeiras e cactos).

/** Arenito da Areia: contorno, sombra funda, sombra, parede, luz, faixas, topo e brilho do topo. O hospital é claro. */
const SAND = { edge: '#4a2c12', dark: '#8a5a2c', shade: '#b07a42', wall: '#d6a462', light: '#ecc488', band: '#a8723e', top: '#e2b676', topLight: '#f6d9a8' };
const SAND_PALE = { edge: '#5a4632', dark: '#a89270', shade: '#c9b796', wall: '#e8dcc3', light: '#f6eedc', band: '#c2b08e', top: '#efe4cd', topLight: '#fffaf0' };
/** Pedregulho de arenito (o pé do cânion e do morro). */
const SAND_ROCK = { edge: '#4a2c12', dark: '#9a6634', mid: '#c48a4c', light: '#e6b678', crack: '#7a4a22' };
/** Toldos das lojas da Areia: [pano, listra]. */
const AWNINGS = {
  shop_weapon: [['#b8402e', '#e0a040'], ['#3f7a52', '#7cb06a']],
  shop_cloth: [['#3a64a8', '#7aa0d8'], ['#7a3f8a', '#b07ac0']],
  shop_scroll: [['#6a3a7a', '#c8a04a'], ['#3f7a52', '#a8c070']],
};

/**
 * Cilindro de arenito visto em 3/4: o corpo (luz na esquerda, sombra na direita), duas faixas que seguem a curva e o
 * pé arredondado; em cima, cúpula (`dome`, altura `domeH`) ou teto plano com mureta (`flat`). `bottom` = o ponto mais
 * baixo da frente, no chão.
 */
function sandCylinder(g, cx, rw, top, bottom, roof, pal = SAND, domeH = rw * 0.75, seed = 1) {
  const r = rng(seed);
  const ry = Math.min(rw * 0.4, 22), by = bottom - ry;
  const body = (k) => {
    g.beginPath();
    g.moveTo(cx - rw - k, top);
    g.lineTo(cx - rw - k, by);
    g.ellipse(cx, by, rw + k, ry + k, 0, Math.PI, 0, true);
    g.lineTo(cx + rw + k, top);
    g.closePath();
  };
  g.fillStyle = 'rgba(50, 26, 6, 0.3)';                                           // sombra no chão
  g.beginPath(); g.ellipse(cx + rw * 0.2, by + 3, rw * 1.05, ry * 0.95, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = pal.edge; body(0.8); g.fill();
  const grad = g.createLinearGradient(cx - rw, 0, cx + rw, 0);
  grad.addColorStop(0, pal.shade); grad.addColorStop(0.18, pal.light); grad.addColorStop(0.55, pal.wall); grad.addColorStop(1, pal.dark);
  g.fillStyle = grad; body(0); g.fill();
  g.save(); body(0); g.clip();
  for (let i = 0; i < rw * (by - top) / 40; i++) fr(g, r() < 0.5 ? pal.shade : pal.light, cx - rw + r() * rw * 2, top + r() * (by - top + ry), 1 + r() * 1.5, FINE * 2);
  g.restore();
  g.strokeStyle = pal.band; g.lineWidth = 1.3;                                    // faixas
  for (const k of [0.3, 0.7]) { g.beginPath(); g.ellipse(cx, top + (by - top) * k, rw, ry, 0, 0.05, Math.PI - 0.05); g.stroke(); }
  g.strokeStyle = pal.dark; g.lineWidth = 2;                                      // rodapé
  g.beginPath(); g.ellipse(cx, by - 2, rw, ry, 0, 0.1, Math.PI - 0.1); g.stroke();
  if (roof === 'flat') {
    g.fillStyle = pal.edge; g.beginPath(); g.ellipse(cx, top, rw + 0.8, ry + 0.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = pal.top; g.beginPath(); g.ellipse(cx, top, rw, ry, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = pal.dark; g.beginPath(); g.ellipse(cx, top + 0.8, rw - 3.2, ry - 2.6, 0, 0, Math.PI * 2); g.fill();   // dentro da mureta
    g.fillStyle = pal.shade; g.beginPath(); g.ellipse(cx, top + 1.8, rw - 4, ry - 3.6, 0, 0, Math.PI * 2); g.fill();    // o piso do terraço
    g.strokeStyle = pal.topLight; g.lineWidth = 1;
    g.beginPath(); g.ellipse(cx, top, rw - 0.6, ry - 0.6, 0, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
    return;
  }
  g.fillStyle = pal.edge;                                                         // cúpula
  g.beginPath(); g.ellipse(cx, top, rw + 0.8, domeH + 0.8, 0, Math.PI, Math.PI * 2); g.ellipse(cx, top, rw + 0.8, ry + 0.8, 0, 0, Math.PI); g.fill();
  const dg = g.createRadialGradient(cx - rw * 0.35, top - domeH * 0.65, 1, cx, top - domeH * 0.2, rw * 1.15);
  dg.addColorStop(0, pal.topLight); dg.addColorStop(0.4, pal.top); dg.addColorStop(1, pal.shade);
  g.fillStyle = dg;
  g.beginPath(); g.ellipse(cx, top, rw, domeH, 0, Math.PI, Math.PI * 2); g.ellipse(cx, top, rw, ry, 0, 0, Math.PI); g.fill();
  g.strokeStyle = pal.band; g.lineWidth = 2;                                      // aro da cúpula
  g.beginPath(); g.ellipse(cx, top, rw, ry, 0, 0.02, Math.PI - 0.02); g.stroke();
  g.strokeStyle = pal.topLight; g.lineWidth = 1;
  g.beginPath(); g.ellipse(cx, top, rw - 3, ry - 2, 0, 0.15, Math.PI - 0.15); g.stroke();
}

/** Porta em arco, no chão (`bottom`), com o batente de arenito. */
function sandDoor(g, cx, bottom, dw, dh, pal = SAND) {
  const x = cx - dw / 2, top = bottom - dh;
  g.fillStyle = pal.dark;
  g.beginPath(); g.moveTo(x - 1.5, bottom); g.lineTo(x - 1.5, top + dw / 2); g.arc(cx, top + dw / 2, dw / 2 + 1.5, Math.PI, 0); g.lineTo(x + dw + 1.5, bottom); g.closePath(); g.fill();
  g.fillStyle = '#1a0e06';
  g.beginPath(); g.moveTo(x, bottom); g.lineTo(x, top + dw / 2); g.arc(cx, top + dw / 2, dw / 2, Math.PI, 0); g.lineTo(x + dw, bottom); g.closePath(); g.fill();
  fr(g, 'rgba(255, 190, 110, 0.18)', x + 1, bottom - dh * 0.35, dw - 2, dh * 0.35);   // luz de dentro
}

/** Janela pequena de arco (onde a fachada comum teria a janela de papel: as luzes da noite caem no mesmo lugar). */
function sandWindow(g, wd, x, y) {
  const cx = x + wd.x + wd.w / 2, ww = Math.max(4, wd.w * 0.45), top = y + wd.y, wh = Math.max(5, wd.h * 0.9);
  g.fillStyle = SAND.edge;
  g.beginPath(); g.moveTo(cx - ww / 2 - 0.8, top + wh); g.lineTo(cx - ww / 2 - 0.8, top + ww / 2); g.arc(cx, top + ww / 2, ww / 2 + 0.8, Math.PI, 0); g.lineTo(cx + ww / 2 + 0.8, top + wh); g.closePath(); g.fill();
  g.fillStyle = '#2a170a';
  g.beginPath(); g.moveTo(cx - ww / 2, top + wh); g.lineTo(cx - ww / 2, top + ww / 2); g.arc(cx, top + ww / 2, ww / 2, Math.PI, 0); g.lineTo(cx + ww / 2, top + wh); g.closePath(); g.fill();
  fr(g, SAND.light, cx - ww / 2 - 1, top + wh, ww + 2, 1.2);                       // peitoril
}

/** Toldo de pano listrado sobre a porta ou ao lado (lojas da Areia), com as varas. */
function sandAwning(g, x, y, w, h, colors) {
  const [cloth, stripe] = colors;
  fr(g, 'rgba(40, 20, 5, 0.3)', x + 2, y + h + 1, w, 3);
  g.fillStyle = mix(cloth, '#000000', 0.45);
  g.beginPath(); g.moveTo(x + 2, y); g.lineTo(x + w - 2, y); g.lineTo(x + w + 1, y + h); g.lineTo(x - 1, y + h); g.closePath(); g.fill();
  g.save(); g.clip();
  for (let sx = x - 2, i = 0; sx < x + w + 2; sx += 3, i++) fr(g, i % 2 ? stripe : cloth, sx, y, 3, h);
  fr(g, 'rgba(255, 255, 255, 0.18)', x, y, w, 1.2);
  g.restore();
  for (let sx = x, i = 0; sx < x + w; sx += 3, i++) {                              // franja de pontas
    g.fillStyle = i % 2 ? stripe : cloth;
    g.beginPath(); g.moveTo(sx - 1, y + h); g.lineTo(sx + 2, y + h); g.lineTo(sx + 0.5, y + h + 1.8); g.closePath(); g.fill();
  }
  fr(g, '#3a2410', x - 1, y + h, 1, 6);                                            // varas
  fr(g, '#3a2410', x + w, y + h, 1, 6);
}

/** O que cada loja da Areia expõe na porta (sem placa escrita): armas no tapete, panos dobrados, pergaminhos. */
function sandShopGoods(g, style, cx, bottom) {
  const y = bottom + 1;
  if (style === 'shop_weapon') {
    fr(g, '#8a2e22', cx - 12, y, 7, 4); fr(g, '#c9a050', cx - 12, y, 7, FINE * 2);   // tapete com kunais e katana
    fr(g, '#c8ccd2', cx - 11, y + 1.5, 5, 0.7); fr(g, '#c8ccd2', cx - 10, y + 2.6, 4, 0.7);
    fr(g, '#3a2410', cx + 6, y - 9, 1.2, 10);                                      // suporte de lanças
    fr(g, '#c8ccd2', cx + 5.6, y - 11, 2, 2.4); fr(g, '#3a2410', cx + 9, y - 8, 1.2, 9); fr(g, '#c8ccd2', cx + 8.6, y - 10, 2, 2.4);
  } else if (style === 'shop_cloth') {
    for (const [dx, c] of [[-12, '#3a64a8'], [-9, '#b8402e'], [-6, '#e0a040']]) { fr(g, c, cx + dx, y, 3, 4); fr(g, mix(c, '#ffffff', 0.3), cx + dx, y, 3, 0.8); }
    fr(g, '#7a3f8a', cx + 5, y + 0.5, 8, 3.5); for (let k = 0; k < 4; k++) fr(g, '#c8a04a', cx + 5 + k * 2, y + 0.5, 0.8, 3.5);
  } else {
    fr(g, '#6a4422', cx - 13, y - 2, 8, 6); fr(g, '#8a5a2e', cx - 12.5, y - 1.5, 7, 1.2);   // caixote com rolos
    for (let k = 0; k < 3; k++) { fr(g, '#efe1bd', cx - 12 + k * 2.3, y - 4, 2, 3); fr(g, '#b8402e', cx - 12 + k * 2.3, y - 2.6, 2, 0.6); }
    fr(g, '#efe1bd', cx + 6, y + 1, 7, 2); fr(g, '#7a4e22', cx + 5.5, y + 0.6, 1, 2.8); fr(g, '#7a4e22', cx + 12.5, y + 0.6, 1, 2.8);
  }
}

/** Lâmpada de latão pendurada (a "lanterna" das lojas da Areia; acende de noite no mesmo lugar). */
function sandLamp(g, lx, ly) {
  fr(g, '#3a2410', lx + 1.6, ly - 2, FINE * 2, 2.5);
  g.fillStyle = '#6a4a1c'; g.beginPath(); g.ellipse(lx + 2, ly + 3.5, 2.6, 3.4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f2c060'; g.beginPath(); g.ellipse(lx + 2, ly + 3.5, 1.7, 2.5, 0, 0, Math.PI * 2); g.fill();
  fr(g, '#fff0c4', lx + 1.4, ly + 2.3, 0.8, 1.4);
}

/**
 * Prédios da Vila da Areia, na mesma caixa (e com a porta no mesmo lugar) dos da Folha: a sede é uma cúpula quase
 * redonda com faixa de janelas e duas torres na frente; o hospital, uma cúpula clara com cruz vermelha; a Academia,
 * duas torres ligadas por uma ponte de pedra; as lojas, redondas e baixas com toldos; as casas, torres de cúpula ou de
 * terraço.
 */
function drawSandBuilding(g, x, y, w, h, style, seed) {
  const f = facadeLayout(w, h, style);
  const cx = x + w / 2, bottom = y + h;
  const door = (dw, dh, pal) => sandDoor(g, cx, bottom - 0.5, dw, dh, pal);
  if (style === 'leader') {
    const rw = w * 0.36, top = y + h * 0.5, domeH = h * 0.42;
    sandCylinder(g, cx, rw, top, bottom, 'dome', SAND, domeH, seed);
    for (let i = 0; i < 11; i++) {                                                 // faixa de janelas redondas na cúpula
      const t = Math.PI * (1.12 + (0.76 * i) / 10);
      const wx = cx + Math.cos(t) * rw * 0.86, wy = top - domeH * 0.38 + Math.sin(t) * domeH * 0.16;
      g.fillStyle = SAND.edge; g.beginPath(); g.arc(wx, wy, 2.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5f9fc8'; g.beginPath(); g.arc(wx, wy, 1.8, 0, Math.PI * 2); g.fill();
      fr(g, '#bfe2f2', wx - 1, wy - 1, 0.8, 0.8);
    }
    g.strokeStyle = SAND.band; g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(cx, top - domeH * 0.38, rw * 0.94, domeH * 0.24, 0, Math.PI * 1.05, Math.PI * 1.95, false); g.stroke();
    const ey = top + (h * 0.13);                                                   // emblema: o redemoinho do vento
    g.fillStyle = SAND.edge; g.beginPath(); g.arc(cx, ey, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9a3a22'; g.beginPath(); g.arc(cx, ey, 8, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f2c98a'; g.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(cx, ey, 2 + k * 2, k * 2.1, k * 2.1 + Math.PI * 1.3); g.stroke(); }
    for (const tx of [x + w * 0.17, x + w * 0.83]) sandCylinder(g, tx, w * 0.1, y + h * 0.66, bottom - 1, 'flat', SAND, 0, seed + Math.round(tx));
    door(Math.max(12, f.door), h * 0.2);
  } else if (style === 'academy') {
    const tw = w * 0.2, lx = x + w * 0.21, rx = x + w * 0.79;
    fr(g, SAND.edge, lx, y + h * 0.48 - 0.8, rx - lx, h * 0.52 + 0.8);              // a parede do meio, com a porta
    fr(g, SAND.wall, lx, y + h * 0.48, rx - lx, h * 0.52 - 1);
    fr(g, SAND.top, lx, y + h * 0.48, rx - lx, 3);
    fr(g, SAND.band, lx, y + h * 0.66, rx - lx, 1.2);
    for (const tx of [lx, rx]) sandCylinder(g, tx, tw, y + h * 0.24, bottom - 1, 'flat', SAND, 0, seed + Math.round(tx));
    const by = y + h * 0.27, bh = 8;                                               // a ponte de pedra lá em cima
    fr(g, '#5a4a3a', lx + tw - 2, by - 0.8, rx - lx - tw * 2 + 4, bh + 1.6);
    fr(g, '#b8ab98', lx + tw - 2, by, rx - lx - tw * 2 + 4, bh);
    fr(g, '#d6cbb8', lx + tw - 2, by, rx - lx - tw * 2 + 4, 1.4);
    for (let sx = lx + tw; sx < rx - tw; sx += 5) fr(g, '#8a7e6c', sx, by + 2, FINE * 2, bh - 2);
    g.fillStyle = 'rgba(40, 24, 10, 0.55)';                                        // o arco embaixo da ponte
    g.beginPath(); g.ellipse(cx, by + bh + 0.5, (rx - lx - tw * 2) * 0.42, 4, 0, Math.PI, 0); g.fill();
    door(Math.max(11, f.door), h * 0.24);
  } else if (style === 'hospital') {
    sandCylinder(g, cx, w / 2 - 3, y + h * 0.42, bottom, 'dome', SAND_PALE, h * 0.34, seed);
    const sy = y + h * 0.5;                                                        // a cruz vermelha na parede
    fr(g, SAND_PALE.edge, cx - 6.6, sy - 0.6, 13.2, 13.2);
    fr(g, '#f6eedc', cx - 6, sy, 12, 12);
    fr(g, '#c8261e', cx - 1.6, sy + 2, 3.2, 8); fr(g, '#c8261e', cx - 4, sy + 4.4, 8, 3.2);
    door(Math.max(11, f.door), h * 0.22, SAND_PALE);
  } else if (style === 'hut' || style === 'home') {
    const tall = style === 'home';
    sandCylinder(g, cx, w / 2 - 2.5, y + h * (tall ? 0.34 : 0.3), bottom, tall ? 'dome' : 'flat', SAND, h * 0.3, seed);
    door(10, h * 0.32);
  } else {                                                                        // lojas: redondas, baixas, com toldos
    sandCylinder(g, cx, w / 2 - 6, y + h * 0.34, bottom - 1, 'flat', SAND, 0, seed);
    const [a, b] = AWNINGS[style] || AWNINGS.shop_weapon;
    sandAwning(g, x + 1, y + h * 0.55, w * 0.3, h * 0.2, a);
    sandAwning(g, x + w * 0.69, y + h * 0.55, w * 0.3, h * 0.2, b);
    door(Math.max(12, f.door), h * 0.3);
    sandShopGoods(g, style, cx, bottom - 6);
    if (f.lantern) sandLamp(g, x + f.lantern.x, y + f.lantern.y);
  }
  if (style !== 'leader' && style !== 'academy') for (const wd of f.windows) sandWindow(g, wd, x, y);
  else {
    // sede e Academia: só as janelas que caem numa parede (corpo da cúpula ou torre), longe da porta
    const walls = style === 'leader' ? [[cx, w * 0.33], [x + w * 0.17, w * 0.08], [x + w * 0.83, w * 0.08]] : [[x + w * 0.21, w * 0.17], [x + w * 0.79, w * 0.17]];
    for (const wd of f.windows) {
      const wx = x + wd.x + wd.w / 2;
      if (Math.abs(wx - cx) > f.door && walls.some(([c, half]) => Math.abs(wx - c) < half)) sandWindow(g, wd, x, y);
    }
  }
}

/**
 * Borda da Areia: paredão de cânion em vez de muralha. Na horizontal, o alto plano e a face com camadas; na vertical,
 * o alto com sombra dos dois lados.
 */
function drawCanyonWall(g, x, y, w, h, seed) {
  const r = rng(seed);
  rect(g, SAND.edge, x, y, w, h);
  if (w >= h) {
    const topH = h * 0.42;
    fr(g, SAND.top, x, y, w, topH);
    for (let i = 0; i < w * topH / 30; i++) fr(g, r() < 0.5 ? SAND.light : SAND.shade, x + r() * w, y + r() * topH, 1 + r() * 2, FINE * 2);
    const tones = ['#c88c4e', '#b47a42', '#d09858', '#a8703a'];
    for (let yy = y + topH, i = 0; yy < y + h; i++) {
      const bh = 2.5 + r() * 3;
      fr(g, tones[i % 4], x, yy, w, Math.min(bh, y + h - yy));
      fr(g, '#8a5a2c', x, yy + bh - FINE * 2, w, FINE * 2);
      yy += bh;
    }
    for (let i = 0; i < w / 10; i++) { const gx = x + r() * w; fr(g, 'rgba(90, 50, 20, 0.4)', gx, y + topH + 1, 1, (h - topH) * (0.4 + r() * 0.5)); }
    fr(g, SAND.topLight, x, y + topH - 1.2, w, 1.2);
    fr(g, 'rgba(70, 40, 15, 0.45)', x, y + topH, w, 1.5);
  } else {
    fr(g, SAND.top, x + 1, y, w - 2, h);
    for (let i = 0; i < w * h / 30; i++) fr(g, r() < 0.5 ? SAND.light : SAND.shade, x + r() * w, y + r() * h, FINE * 2, 1 + r() * 2);
    fr(g, SAND.dark, x + w - 3, y, 2, h);
    fr(g, SAND.topLight, x + 1.5, y, 1.2, h);
  }
}

/** Pilar do portão da Areia: rocha de arenito com camadas e o alto claro. */
function drawSandPost(g, x, y, w, h) {
  rect(g, 'rgba(0,0,0,0.25)', x + 3, y + 4, w, h);
  g.fillStyle = SAND.edge; roundedPath(g, x + 1, y - 3, w - 2, h + 3, 5, 5, 2, 2); g.fill();
  g.fillStyle = SAND.wall; roundedPath(g, x + 2, y - 2, w - 4, h + 1, 4, 4, 2, 2); g.fill();
  for (let yy = y + 4; yy < y + h - 1; yy += 4) fr(g, SAND.band, x + 2, yy, w - 4, FINE * 3);
  fr(g, SAND.topLight, x + 3, y - 2, w - 6, 3);
  fr(g, SAND.light, x + 2.5, y, 1.2, h - 2);
}

/** O morro atrás da sede na Areia: uma mesa de arenito, alto plano e face em camadas com sulcos de erosão. */
function drawMesa(g, x, y, w, h, seed) {
  const r = rng(seed);
  const face = Math.min(h * 0.55, 80), top = h - face, fy = y + top;
  g.fillStyle = 'rgba(60, 30, 8, 0.32)';
  roundedPath(g, x + 2, y + h - 4, w - 2, 9, 4); g.fill();
  g.save();
  roundedPath(g, x, y, w, h + 3, 22, 22, 10, 10);
  g.clip();
  g.fillStyle = SAND.edge; g.fillRect(x, y, w, h + 3);
  const tones = ['#c98d4f', '#b77c42', '#d39c5c', '#a96f3a', '#c28750'];
  for (let yy = fy - 2, i = 0; yy < y + h + 3; i++) {
    const bh = 4 + r() * 6;
    fr(g, tones[i % tones.length], x, yy, w, bh);
    fr(g, '#8e5a2c', x, yy + bh - FINE * 2, w, FINE * 2);
    fr(g, 'rgba(255, 225, 170, 0.25)', x, yy, w, FINE * 2);
    yy += bh;
  }
  for (let i = 0; i < w / 12; i++) {                                               // sulcos de erosão
    const gx = x + r() * w, gl = face * (0.35 + r() * 0.55);
    fr(g, 'rgba(90, 50, 20, 0.38)', gx, fy + 1, 1.4, gl);
    fr(g, 'rgba(255, 220, 160, 0.22)', gx - 1.2, fy + 1, 1, gl * 0.7);
  }
  const grad = g.createLinearGradient(0, y, 0, fy);
  grad.addColorStop(0, '#d2a062'); grad.addColorStop(1, '#ecc489');
  g.fillStyle = grad; g.fillRect(x, y, w, top);
  for (let i = 0; i < (w * top) / 26; i++) fr(g, r() < 0.5 ? '#c4935a' : '#f2d29c', x + r() * w, y + r() * top, 1 + r() * 2, FINE * 2);
  fr(g, SAND.topLight, x, fy - 2.2, w, 1.4);
  fr(g, 'rgba(70, 40, 15, 0.45)', x, fy - 0.8, w, 2);
  g.restore();
  for (let bx = x + 6; bx < x + w - 4; bx += 12 + r() * 14) if (r() < 0.6) boulder(g, bx, y + h - 1 + r() * 1.5, 2.6 + r() * 2.6, 1.8 + r() * 1.6, SAND_ROCK);
}

/** Nuvens no morro da Vila da Nuvem: tufos brancos com a sombra azulada embaixo. */
function drawCloudBank(g, x, y, w, h, seed) {
  const r = rng(seed);
  const puffs = [[0.08, 0.3, 1.1], [0.26, 0.1, 1.4], [0.47, 0.2, 1.2], [0.68, 0.06, 1.5], [0.88, 0.22, 1.2], [0.37, 0.5, 0.9], [0.8, 0.55, 0.8]];
  for (const [px, py, s] of puffs) {
    const cx = x + w * px, cy = y + h * py, R = 11 * s;
    const blobs = [[-1.6, 0.3, 0.8], [-0.7, -0.2, 1], [0.4, -0.35, 1.1], [1.4, 0.1, 0.85], [0.2, 0.4, 0.9]];
    g.fillStyle = 'rgba(60, 70, 100, 0.25)';
    g.beginPath(); g.ellipse(cx + 2, cy + R * 1.1, R * 2.6, R * 0.55, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8e97ad';
    for (const [bx, by, br] of blobs) { g.beginPath(); g.arc(cx + bx * R, cy + by * R, br * R + 0.8, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#c9d0de';
    for (const [bx, by, br] of blobs) { g.beginPath(); g.arc(cx + bx * R, cy + by * R, br * R, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f4f6fb';
    for (const [bx, by, br] of blobs) { g.beginPath(); g.arc(cx + bx * R - 0.6, cy + by * R - 1.2, br * R * 0.8, 0, Math.PI * 2); g.fill(); }
    fr(g, '#ffffff', cx - R * 0.6, cy - R * 0.9, R * 0.5, 1);
    if (r() < 0.5) fr(g, '#ffffff', cx + R * 0.5, cy - R * 0.7, R * 0.3, FINE * 2);
  }
}

/** Touceira de bambu (Névoa, no lugar das cerejeiras): colmos com nós, folhas finas no alto. */
function drawBamboo(g, baseX, baseY, size, seed, tile) {
  const r = rng(seed);
  const n = 8 + Math.floor(r() * 4), spread = tile * size * 0.48;
  g.fillStyle = 'rgba(0, 0, 0, 0.24)';
  g.beginPath(); g.ellipse(baseX + 3, baseY - 1, spread * 1.4, spread * 0.45, 0, 0, Math.PI * 2); g.fill();
  const stalks = [];
  for (let i = 0; i < n; i++) stalks.push({ x: baseX + (r() - 0.5) * spread * 2, by: baseY - r() * 4, h: tile * (2.1 + r() * 1.1) * (0.5 + size / 4), lean: (r() - 0.5) * 6, w: 2.2 + r() * 0.9 });
  stalks.sort((a, b) => a.by - b.by);
  for (const s of stalks) {
    const tx = s.x + s.lean, ty = s.by - s.h;
    g.strokeStyle = '#2f5222'; g.lineWidth = s.w + 0.8;
    g.beginPath(); g.moveTo(s.x, s.by); g.lineTo(tx, ty); g.stroke();
    g.strokeStyle = '#6a9a3e'; g.lineWidth = s.w;
    g.beginPath(); g.moveTo(s.x, s.by); g.lineTo(tx, ty); g.stroke();
    g.strokeStyle = '#a2c86a'; g.lineWidth = s.w * 0.3;
    g.beginPath(); g.moveTo(s.x - s.w * 0.25, s.by); g.lineTo(tx - s.w * 0.25, ty); g.stroke();
    for (let t = 0.12; t < 1; t += 0.16 + r() * 0.05) {                            // nós
      const nx = s.x + (tx - s.x) * t, ny = s.by + (ty - s.by) * t;
      fr(g, '#2f5222', nx - s.w / 2 - 0.3, ny, s.w + 0.6, 0.8);
      fr(g, '#c2dc8a', nx - s.w / 2, ny - 0.5, s.w, FINE * 2);
    }
    for (let k = 0; k < 9; k++) {                                                   // folhas na metade de cima
      const t = 0.45 + r() * 0.55, lx = s.x + (tx - s.x) * t, ly = s.by + (ty - s.by) * t, side = r() < 0.5 ? -1 : 1;
      g.fillStyle = '#2f5a24';
      g.beginPath(); g.ellipse(lx + side * 3.6, ly + 1.4, 4.6, 1.3, side * 0.45, 0, Math.PI * 2); g.fill();
      g.fillStyle = r() < 0.5 ? '#4f8a3a' : '#78b04f';
      g.beginPath(); g.ellipse(lx + side * 3.4, ly + 1, 4.2, 1, side * 0.45, 0, Math.PI * 2); g.fill();
    }
  }
}

/** Palmeira (Areia, perto da água): tronco em anéis, curvado, e as folhas caindo em leque, com cocos. */
function drawPalm(g, baseX, baseY, size, seed, tile) {
  const r = rng(seed);
  const hgt = tile * (1.7 + r() * 0.5) * (0.55 + size / 4), bend = (r() < 0.5 ? -1 : 1) * (3 + r() * 4);
  const topX = baseX + bend, topY = baseY - hgt;
  g.fillStyle = 'rgba(50, 26, 6, 0.26)';
  g.beginPath(); g.ellipse(baseX + 6, baseY - 1, tile * 0.9, tile * 0.28, 0, 0, Math.PI * 2); g.fill();
  for (let t = 0; t <= 1; t += 0.07) {                                              // tronco em anéis
    const px = baseX + bend * t * t, py = baseY - hgt * t, tw = 3.6 - t * 1.3;
    fr(g, '#4a2e14', px - tw / 2 - 0.4, py - 2.2, tw + 0.8, 2.6);
    fr(g, '#8a6034', px - tw / 2, py - 2, tw, 2);
    fr(g, '#b08250', px - tw / 2, py - 2, tw * 0.35, 2);
  }
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {                                                // folhas em leque
    const a = Math.PI * (1.05 + (0.9 * i) / (fronds - 1)) + (r() - 0.5) * 0.15;
    const L = tile * (0.85 + r() * 0.25) * (0.6 + size / 4);
    const ex = topX + Math.cos(a) * L, ey = topY + Math.sin(a) * L * 0.55 + L * 0.35;
    const mx = topX + Math.cos(a) * L * 0.55, my = topY + Math.sin(a) * L * 0.5 - 2;
    g.strokeStyle = '#1f4a1c'; g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(topX, topY); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
    g.strokeStyle = i % 2 ? '#3f8a35' : '#4f9a3e'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(topX, topY); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
    g.strokeStyle = '#8ac860'; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(topX, topY - 0.6); g.quadraticCurveTo(mx, my - 0.8, ex, ey - 0.6); g.stroke();
  }
  for (const [dx, dy] of [[-1.6, 1.4], [1.4, 1.6], [0, 2.6]]) {                     // cocos
    g.fillStyle = '#4a2e14'; g.beginPath(); g.arc(topX + dx, topY + dy, 1.4, 0, Math.PI * 2); g.fill();
    fr(g, '#7a5530', topX + dx - 0.6, topY + dy - 0.8, 0.6, 0.6);
  }
}

/** Cacto de braços (Areia): corpo com gomos, braços, espinhos claros e, às vezes, uma flor. */
function drawCactus(g, baseX, baseY, size, seed, tile) {
  const r = rng(seed);
  const hgt = tile * (0.85 + r() * 0.35) * (0.6 + size * 0.4), cw = tile * 0.3 * (0.7 + size * 0.2);
  g.fillStyle = 'rgba(50, 26, 6, 0.26)';
  g.beginPath(); g.ellipse(baseX + 3, baseY - 0.5, cw * 1.4, cw * 0.4, 0, 0, Math.PI * 2); g.fill();
  const limb = (lx, ly, lw, lh) => {
    g.fillStyle = '#1f3d18'; roundedPath(g, lx - 0.6, ly - 0.6, lw + 1.2, lh + 1.2, lw / 2 + 0.6, lw / 2 + 0.6, 1, 1); g.fill();
    g.fillStyle = '#4a8a3a'; roundedPath(g, lx, ly, lw, lh, lw / 2, lw / 2, 1, 1); g.fill();
    fr(g, '#7ab55a', lx + lw * 0.2, ly + lw * 0.4, lw * 0.22, lh - lw * 0.6);
    fr(g, '#356a2c', lx + lw * 0.68, ly + lw * 0.4, lw * 0.14, lh - lw * 0.6);
  };
  const aw = cw * 0.62;
  if (size >= 1) {                                                                  // braço esquerdo e direito
    limb(baseX - cw / 2 - aw * 1.3, baseY - hgt * 0.62, aw, hgt * 0.3);
    fr(g, '#4a8a3a', baseX - cw / 2 - aw * 0.8, baseY - hgt * 0.38, aw * 1.1, aw * 0.8);
    if (r() < 0.7) {
      limb(baseX + cw / 2 + aw * 0.3, baseY - hgt * 0.78, aw, hgt * 0.32);
      fr(g, '#4a8a3a', baseX + cw / 2 - 0.5, baseY - hgt * 0.5, aw * 1.1, aw * 0.8);
    }
  }
  limb(baseX - cw / 2, baseY - hgt, cw, hgt);
  for (let i = 0; i < hgt / 2; i++) fr(g, '#ece6b8', baseX - cw / 2 + r() * cw, baseY - hgt + 2 + r() * (hgt - 3), FINE * 2, FINE * 2);
  if (r() < 0.35) { g.fillStyle = '#f06a8a'; g.beginPath(); g.arc(baseX, baseY - hgt - 0.5, 1.4, 0, Math.PI * 2); g.fill(); }
}

/** Vaso de barro com planta do deserto (Areia): cacto redondo, cacto de coluna ou babosa, conforme a semente. */
function drawClayPot(g, cx, by, size, seed) {
  const r = rng(seed), pw = size * 1.6, ph = size * 1.3;
  g.fillStyle = 'rgba(40, 20, 5, 0.3)'; g.beginPath(); g.ellipse(cx + 1, by, pw * 0.75, 1.4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a2a14'; roundedPath(g, cx - pw / 2 - 0.6, by - ph - 0.6, pw + 1.2, ph + 0.6, 1, 1, ph * 0.4, ph * 0.4); g.fill();
  g.fillStyle = '#b8582e'; roundedPath(g, cx - pw / 2, by - ph, pw, ph, 1, 1, ph * 0.4, ph * 0.4); g.fill();
  fr(g, '#d8794a', cx - pw / 2 + 0.6, by - ph + 1, pw * 0.25, ph - 2);
  fr(g, '#8a3e1e', cx - pw / 2 - 0.6, by - ph - 0.4, pw + 1.2, 1.2);              // a boca do vaso
  const kind = seed % 3;
  if (kind === 0) {                                                                 // cacto redondo
    g.fillStyle = '#2a5222'; g.beginPath(); g.arc(cx, by - ph - size * 0.6, size * 0.8 + 0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a9a44'; g.beginPath(); g.arc(cx, by - ph - size * 0.6, size * 0.8, 0, Math.PI * 2); g.fill();
    for (let k = -1; k <= 1; k++) fr(g, '#3d7032', cx + k * size * 0.35, by - ph - size * 1.2, FINE * 2, size * 1.1);
    fr(g, '#f06a8a', cx - 0.6, by - ph - size * 1.45, 1.2, 1);
  } else if (kind === 1) {                                                          // cacto de coluna
    g.fillStyle = '#2a5222'; roundedPath(g, cx - size * 0.45 - 0.5, by - ph - size * 2.2, size * 0.9 + 1, size * 2.2, size * 0.45, size * 0.45, 0, 0); g.fill();
    g.fillStyle = '#4f8a3a'; roundedPath(g, cx - size * 0.45, by - ph - size * 2.1, size * 0.9, size * 2.1, size * 0.45, size * 0.45, 0, 0); g.fill();
    fr(g, '#7ab55a', cx - size * 0.25, by - ph - size * 1.8, size * 0.2, size * 1.6);
  } else {                                                                          // babosa (folhas pontudas)
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * (1.15 + 0.7 * (k / 5)) + (r() - 0.5) * 0.1, L = size * (1.4 + r() * 0.5);
      g.strokeStyle = k % 2 ? '#4f8a3a' : '#6aa64a'; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(cx, by - ph); g.lineTo(cx + Math.cos(a) * L, by - ph + Math.sin(a) * L); g.stroke();
    }
  }
}

/** Telhado do portão da Areia: uma viga de arenito sobre a fenda do cânion (POR CIMA dos jogadores). */
function drawSandLintel(ctx, x, y, w, h) {
  const t = h / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 4, y + h * 0.75, w, h * 0.3);
  ctx.fillStyle = SAND.edge;
  ctx.fillRect(x, y, w, h * 0.72);
  ctx.fillStyle = SAND.wall;
  ctx.fillRect(x + t * 0.08, y + t * 0.08, w - t * 0.16, h * 0.6);
  ctx.fillStyle = SAND.top;
  ctx.fillRect(x + t * 0.08, y + t * 0.08, w - t * 0.16, h * 0.18);
  ctx.fillStyle = SAND.band;
  for (let i = 1; i < 3; i++) ctx.fillRect(x + t * 0.08, y + h * (0.18 + i * 0.16), w - t * 0.16, Math.max(1, h * 0.03));
  ctx.fillStyle = '#9a3a22';                                                         // o emblema do vento no meio
  ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.38, t * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f2c98a'; ctx.lineWidth = Math.max(1, t * 0.08);
  ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.38, t * 0.22, 0, Math.PI * 1.4); ctx.stroke();
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

// ------------------------------------------------------------------ arena da vila

// Arena da Vila (estilo da prova de arte): ardósia azulada, frisos dourados, lanternas de luz quente.
const SLATE = { cap: '#5b6585', capLight: '#7883a6', face: '#2f3549', faceLight: '#3d4560', joint: '#232838', edge: '#191c27' };
const STONE_SLATE = SLATE;
/** A mureta da arena na Areia: arenito (as mesmas peças da ardósia). */
const SAND_SLATE = { cap: '#d6a462', capLight: '#f2cf96', face: '#a8723e', faceLight: '#c48a4c', joint: '#7a4a22', edge: '#4a2c12' };
const GOLD = { dark: '#7a5a22', mid: '#c49a45', light: '#f2d58c' };

/**
 * Lanternas da mureta da arena, em casas (o desenho fixo e a luz de cada quadro usam a mesma conta). Na horizontal,
 * das pontas para dentro; na vertical, só no meio (as pontas encostam nas muretas de cima e de baixo).
 */
export function fenceLanterns(wall) {
  const horiz = wall.w >= wall.h, len = horiz ? wall.w : wall.h;
  const a = horiz ? 0.45 : 1.5, b = horiz ? len - 0.45 : len - 1.5;
  if (b < a) return [];
  const n = Math.max(1, Math.round((b - a) / 4));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = a + (i * (b - a)) / n;
    out.push(horiz ? { x: wall.x + t, y: wall.y + wall.h / 2 } : { x: wall.x + wall.w / 2, y: wall.y + t });
  }
  return out;
}

/** Lanterna de pedra com a luz acesa (o brilho no chão vem a cada quadro, à parte). cx, by: centro e pé, em unidades. */
function drawLantern(g, cx, by) {
  fr(g, 'rgba(0,0,0,0.3)', cx - 4, by - 1, 9, 3);
  fr(g, SLATE.edge, cx - 3.5, by - 15, 7, 15);                                   // coluna
  fr(g, SLATE.face, cx - 2.5, by - 14, 5, 13);
  fr(g, SLATE.faceLight, cx - 2.5, by - 14, 1.5, 13);
  fr(g, GOLD.mid, cx - 3.5, by - 15, 7, 1);
  fr(g, '#1a1712', cx - 4, by - 24, 8, 9);                                       // a caixa da luz
  fr(g, '#ffb84d', cx - 3, by - 23, 6, 7);
  fr(g, '#ffe7a6', cx - 2, by - 22, 4, 5);
  fr(g, '#fff8e0', cx - 1, by - 21, 2, 3);
  fr(g, '#1a1712', cx - 0.5, by - 23, 1, 7);                                     // a grade na frente
  fr(g, '#2a2620', cx - 5, by - 26, 10, 2.5);                                    // telhadinho
  fr(g, GOLD.mid, cx - 5, by - 26, 10, FINE * 2);
  fr(g, GOLD.light, cx - 1, by - 28, 2, 2);                                      // a ponta dourada
}

/**
 * Mureta de pedra da arena (vista de cima em 3/4): na horizontal, o tampo claro em cima e a face de blocos na frente,
 * com o friso dourado entre os dois; na vertical, só o tampo (e a face na ponta de baixo). Lanternas a cada ~4 casas.
 */
function drawFence(g, x, y, w, h, tile, wall) {
  const U = tile, H = 10;                                                       // altura da mureta
  const SLATE = wall.t === 'areia' ? SAND_SLATE : STONE_SLATE;
  if (w >= h) {
    fr(g, 'rgba(10, 12, 20, 0.35)', x, y + h, w, 4);                            // sombra no chão
    fr(g, SLATE.edge, x, y - H - 1, w, h + H + 1);
    fr(g, SLATE.face, x + 0.5, y - 2, w - 1, h + 1.5);                          // face da frente
    for (let row = 0; row < 2; row++) {                                          // blocos
      const ry = y - 2 + row * 4.5;
      fr(g, SLATE.joint, x + 0.5, ry + 4.2, w - 1, FINE * 2);
      for (let bx = x + (row ? 6 : 2); bx < x + w - 1; bx += 8) fr(g, SLATE.joint, bx, ry, FINE * 2, 4.3);
    }
    fr(g, SLATE.faceLight, x + 0.5, y - 2, w - 1, FINE * 2);
    fr(g, SLATE.cap, x + 0.5, y - H, w - 1, H - 2);                             // tampo
    fr(g, SLATE.capLight, x + 0.5, y - H, w - 1, FINE * 2);
    fr(g, GOLD.dark, x + 0.5, y - 2.6, w - 1, 1.2);                             // friso dourado
    fr(g, GOLD.mid, x + 0.5, y - 2.6, w - 1, 0.8);
    fr(g, GOLD.light, x + 0.5, y - 2.6, w - 1, FINE);
  } else {
    fr(g, 'rgba(10, 12, 20, 0.35)', x + w, y - H + 3, 3, h);                   // sombra à direita
    fr(g, SLATE.edge, x - 0.5, y - H - 1, w + 1, h + 1);
    fr(g, SLATE.cap, x, y - H, w, h - 1);
    fr(g, SLATE.capLight, x, y - H, FINE * 2, h - 1);
    fr(g, GOLD.mid, x + 1, y - H + 1, FINE * 2, h - 3);
    fr(g, GOLD.mid, x + w - 1 - FINE * 2, y - H + 1, FINE * 2, h - 3);
    for (let py = y - H + 6; py < y + h - H - 2; py += 8) fr(g, SLATE.joint, x + 1.5, py, w - 3, FINE * 2);
    fr(g, SLATE.face, x, y + h - H - 1, w, H + 1);                              // a face na ponta de baixo
    fr(g, GOLD.mid, x, y + h - H - 1, w, 0.8);
  }
  for (const l of fenceLanterns(wall)) {
    const lx = x + (l.x - wall.x) * U, ly = y + (l.y - wall.y) * U;
    drawLantern(g, lx, (w >= h ? y + h : ly + 4));
  }
}

/** Bloco de ardósia da arena (cobertura): tampo com moldura dourada embutida, face escura e uma rachadura. */
function drawArenaBlock(g, x, y, w, h, SLATE = STONE_SLATE) {
  const H = 12;
  g.fillStyle = 'rgba(10, 12, 20, 0.35)';
  g.beginPath(); g.ellipse(x + w / 2 + 2, y + h + 1, w / 2 + 3, 4, 0, 0, Math.PI * 2); g.fill();
  fr(g, SLATE.edge, x - 0.5, y - H - 0.5, w + 1, h + H + 1);
  fr(g, SLATE.face, x, y + h - H, w, H);                                       // face da frente
  fr(g, SLATE.faceLight, x, y + h - H, w, FINE * 2);
  fr(g, SLATE.joint, x + w * 0.55, y + h - H + 2, FINE * 2, H - 3);
  fr(g, SLATE === STONE_SLATE ? '#4c5677' : SLATE.cap, x, y - H, w, h);         // tampo
  fr(g, SLATE.capLight, x, y - H, w, FINE * 2);
  fr(g, SLATE.capLight, x, y - H, FINE * 2, h);
  const i = 2.5;                                                                // moldura dourada
  g.strokeStyle = GOLD.dark; g.lineWidth = 1.2;
  g.strokeRect(x + i + 0.3, y - H + i + 0.4, w - 2 * i, h - 2 * i);
  g.strokeStyle = GOLD.mid; g.lineWidth = 0.8;
  g.strokeRect(x + i, y - H + i, w - 2 * i, h - 2 * i);
  fr(g, GOLD.light, x + i - 0.4, y - H + i - 0.4, w - 2 * i, FINE);
  g.strokeStyle = 'rgba(25, 28, 40, 0.8)'; g.lineWidth = FINE * 2;               // rachadura
  g.beginPath(); g.moveTo(x + w * 0.2, y - H + h * 0.35); g.lineTo(x + w * 0.32, y - H + h * 0.5); g.lineTo(x + w * 0.26, y - H + h * 0.66); g.stroke();
}

/**
 * Frisos dourados embutidos no piso da arena: a moldura, a linha do meio, o círculo central com o medalhão e os dois
 * círculos de começo de luta, e cantoneiras nos quatro cantos.
 */
function drawArenaInlay(g, x, y, w, h) {
  const gold = (path, wd = 1.5, alpha = 1) => {
    g.save();
    g.globalAlpha = alpha;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(12, 10, 8, 0.55)'; g.lineWidth = wd + 1.2;
    g.translate(0, 0.5); path(); g.stroke(); g.translate(0, -0.5);
    g.strokeStyle = GOLD.mid; g.lineWidth = wd; path(); g.stroke();
    g.strokeStyle = 'rgba(255, 232, 160, 0.9)'; g.lineWidth = FINE;
    g.translate(-FINE, -FINE); path(); g.stroke();
    g.restore();
  };
  const m = 9, cx = x + w / 2, cy = y + h / 2;
  gold(() => { g.beginPath(); g.rect(x + m, y + m, w - 2 * m, h - 2 * m); });
  gold(() => { g.beginPath(); g.moveTo(cx, y + m); g.lineTo(cx, cy - 40); g.moveTo(cx, cy + 40); g.lineTo(cx, y + h - m); }, 1.2);
  gold(() => { g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); }, 1.8);
  gold(() => { g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); }, 0.7, 0.7);
  for (const dx of [-w * 0.3, w * 0.3]) gold(() => { g.beginPath(); g.arc(cx + dx, cy, 22, 0, Math.PI * 2); }, 1, 0.55);
  // medalhão do meio: disco de ardósia com aro dourado e a estrela de quatro pontas
  g.fillStyle = 'rgba(12, 10, 8, 0.4)';
  g.beginPath(); g.arc(cx + 0.5, cy + 1, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#56618a';
  g.beginPath(); g.arc(cx, cy, 12, 0, Math.PI * 2); g.fill();
  gold(() => { g.beginPath(); g.arc(cx, cy, 12, 0, Math.PI * 2); }, 1.6);
  g.fillStyle = GOLD.mid;
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? 2.4 : 8;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
  g.fillStyle = GOLD.light;
  g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 1.2, cy - 1.2); g.lineTo(cx - 1.2, cy - 1.2); g.closePath(); g.fill();
  // cantoneiras
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const ox = sx > 0 ? x + m + 5 : x + w - m - 5, oy = sy > 0 ? y + m + 5 : y + h - m - 5;
    gold(() => { g.beginPath(); g.moveTo(ox, oy + sy * 9); g.lineTo(ox, oy); g.lineTo(ox + sx * 9, oy); }, 1.1);
    g.fillStyle = GOLD.light;
    g.beginPath(); g.moveTo(ox + sx * 3, oy + sy * 1); g.lineTo(ox + sx * 4.5, oy + sy * 3); g.lineTo(ox + sx * 3, oy + sy * 5); g.lineTo(ox + sx * 1.5, oy + sy * 3); g.closePath(); g.fill();
  }
}

/** Pilar de pedra (cobertura dentro da arena): sobe acima da casa (3/4), com o topo mais claro e rachaduras. */
function drawPillar(g, x, y, w, h) {
  rect(g, 'rgba(0,0,0,0.3)', x + 2, y + h - 3, w, 5);
  rect(g, '#3e3b37', x, y - 10, w, h + 10);
  rect(g, '#8d8a84', x + 1, y - 5, w - 2, h + 4);
  rect(g, '#6d6a64', x + 1, y + h - 4, w - 2, 3);                          // base
  rect(g, '#b8b4aa', x + 1, y - 9, w - 2, 4);                              // topo
  rect(g, '#d8d4ca', x + 2, y - 9, w - 4, 1);
  g.fillStyle = '#5d5a55';
  g.fillRect(x + 4, y - 2, 1, 5); g.fillRect(x + 5, y + 3, 2, 1); g.fillRect(x + w - 5, y + 1, 1, 4);
}

/** Desenha uma parede (colisão) conforme o tipo. Água fica só no chão (o tile já é o rio). */
export function drawWall(g, wall, x, y, w, h, tile) {
  const seed = (wall.x * 73856093) ^ (wall.y * 19349663);
  switch (wall.k) {
    case 'wall': return wall.t === 'areia' ? drawCanyonWall(g, x, y, w, h, Math.abs(seed)) : drawRampart(g, x, y, w, h);
    case 'gatepost': return wall.t === 'areia' ? drawSandPost(g, x, y, w, h) : drawGatePost(g, x, y, w, h);
    case 'rock':
      if (wall.s !== 'mountain') return drawRock(g, x, y, w, h, seed);
      if (wall.t === 'areia') return drawMesa(g, x, y, w, h, Math.abs(seed));
      drawMountain(g, x, y, w, h, Math.abs(seed), tile);
      return wall.t === 'nuvem' ? drawCloudBank(g, x, y, w, h, Math.abs(seed)) : undefined;
    case 'house': return wall.t === 'areia' ? drawSandBuilding(g, x, y, w, h, wall.s || 'home', Math.abs(seed)) : drawBuilding(g, x, y, w, h, wall.s || 'home', seed, wall.t);
    case 'tree': return drawTrees(g, x, y, w, h, Math.abs(seed) % 97, tile);
    case 'dummy': return drawDummy(g, x, y, w, h);
    case 'iwall': return drawInteriorWall(g, x, y, w, h, tile);
    case 'counter': return drawCounter(g, x, y, w, h);
    case 'furniture': return drawFurniture(g, x, y, w, h, wall.s, Math.abs(seed));
    case 'pit': return wall.s === 'chasm' ? drawChasm(g, x, y, w, h, Math.abs(seed)) : drawPit(g, x, y, w, h);
    case 'fence': return drawFence(g, x, y, w, h, tile, wall);
    case 'pillar': return wall.s === 'arena' ? drawArenaBlock(g, x, y, w, h, wall.t === 'areia' ? SAND_SLATE : STONE_SLATE) : drawPillar(g, x, y, w, h);
    case 'gate': return drawClosedGate(g, x, y, w, h);
    // Arco 1 (docs/mapas.md)
    case 'seal': return drawSeal(g, x, y, w, h, wall.s !== 'out');
    case 'oak': return drawOakTrunk(g, x, y, w, h);
    case 'cliff': return wall.s === 'fall' ? drawDryFall(g, x, y, w, h, seed) : drawCliff(g, x, y, w, h, Math.abs(seed));
    case 'tent': return drawTent(g, x, y, w, h, Math.abs(seed));
    case 'cave': return wall.s === 'mouth' ? drawCaveMouth(g, x, y, w, h, Math.abs(seed)) : drawCaveWall(g, x, y, w, h, Math.abs(seed));
    case 'deadtree': return drawDeadTrees(g, x, y, w, h, Math.abs(seed), tile);
    case 'logs': return drawLogs(g, x, y, w, h);
    case 'sink': return drawSink(g, x, y, w, h);
    case 'pool': return drawPool(g, x, y, w, h, Math.abs(seed));
    case 'thicket': return drawThicket(g, wall, x, y, w, h, tile);
    default: return undefined;   // 'foot': só colisão (o desenho é da peça)
  }
}

/**
 * v29: a mata fechada vista de cima: um tapete de copas (tufos sobrepostos, escuros embaixo e com luz em cima à
 * esquerda). Não tem tronco: os troncos são das árvores da borda (peças), com o pé na linha da colisão.
 */
function drawThicket(g, wall, x, y, w, h, tile) {
  // Grade do MAPA (casas), não do bloco: dois blocos vizinhos desenham os mesmos tufos na emenda (sem linha reta).
  g.fillStyle = '#1c2414';
  g.fillRect(x, y, w, h);
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  const SX = 0.85, SY = 0.6;
  const px = (wx) => x + (wx - wall.x) * tile, py = (wy) => y + (wy - wall.y) * tile;
  for (let j = Math.floor((wall.y - 1.2) / SY); j * SY < wall.y + wall.h + 1.2; j++) {
    for (let i = Math.floor((wall.x - 1.2) / SX); i * SX < wall.x + wall.w + 1.2; i++) {
      const r = rng(((i * 73856093) ^ (j * 19349663)) >>> 0);
      const pal = LEAVES[Math.floor(r() * LEAVES.length)];
      const cx = px(i * SX + (j % 2 ? SX / 2 : 0) + (r() - 0.5) * 0.3), cy = py(j * SY + (r() - 0.5) * 0.2);
      const R = tile * (0.52 + r() * 0.18);
      g.fillStyle = pal[0]; g.beginPath(); g.arc(cx, cy + R * 0.12, R * 1.04, 0, Math.PI * 2); g.fill();
      g.fillStyle = pal[1]; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
      g.fillStyle = pal[2]; g.beginPath(); g.arc(cx - R * 0.18, cy - R * 0.2, R * 0.72, 0, Math.PI * 2); g.fill();
      g.fillStyle = pal[3]; g.beginPath(); g.arc(cx - R * 0.32, cy - R * 0.38, R * 0.36, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}

// ------------------------------------------------------------------ objetos com altura (camada de cima)

/**
 * Árvores, pedras altas e barracas têm ALTURA: são desenhadas por cima do chão, na mesma ordem dos bonecos (quem está
 * atrás fica atrás da copa). `propExtent` diz quanto o desenho passa da caixa de colisão (em casas).
 */
export const PROP_KINDS = new Set(['tree', 'deadtree', 'oak', 'seal', 'tent']);

export function propExtent(wall) {
  switch (wall.k) {
    // a copa cresce com o tamanho da árvore (as peças do catálogo vão até ~4 casas)
    case 'tree': { const s = Math.max(wall.w, wall.h); return s > 2.5 ? { left: s * 0.3, right: s * 0.3, top: s * 0.9, bottom: 0.4 } : { left: 0.6, right: 0.6, top: 1.7, bottom: 0.4 }; }
    case 'deadtree': return { left: 0.4, right: 0.4, top: 1.4, bottom: 0.3 };
    case 'oak': return { left: 4, right: 4, top: 12, bottom: 0.6 };   // v29: a copa enorme do Velho Carvalho
    case 'seal': return { left: 0.3, right: 0.3, top: 1.0, bottom: 0.3 };
    case 'tent': return { left: 0.4, right: 0.5, top: 0.3, bottom: 0.45 };
    default: return { left: 0.2, right: 0.2, top: 0.5, bottom: 0.3 };
  }
}

/** Desenha um objeto alto inteiro (com o que passa da caixa). Coordenadas em unidades (16 por casa). */
export function drawProp(g, wall, x, y, w, h, tile) {
  const seed = (wall.x * 73856093) ^ (wall.y * 19349663);
  switch (wall.k) {
    case 'tree': return drawTreeGroup(g, x, y, w, h, Math.abs(seed), tile, wall.s, wall.t);
    case 'deadtree': return drawDeadTrees(g, x, y, w, h, Math.abs(seed), tile);
    case 'oak': return drawGiantOak(g, x, y, w, h, tile);
    case 'seal': return drawSeal(g, x, y, w, h, wall.s !== 'out');
    case 'tent': return drawTent(g, x, y, w, h, Math.abs(seed));
    default: return undefined;
  }
}

/** Cores das copas: [contorno, sombra, meio, luz, brilho]. Três verdes para a mata não parecer carimbada. */
// v29: verde-oliva escuro e terroso, como a referência da Floresta (antes: verdes saturados e frios).
const LEAVES = [
  ['#141a0d', '#2f3d1f', '#4e5a2a', '#6f7a38', '#a3a85a'],
  ['#12190f', '#283a22', '#3f5530', '#5c7240', '#93a463'],
  ['#1a1a0c', '#3a3c1c', '#5a5a28', '#7f7c3a', '#b3ab5c'],
];

/**
 * Uma árvore em 3/4, no estilo dos bonecos chibi: tronco curto e grosso embaixo, copa redonda e fofa em cima (sombra
 * embaixo à direita, luz em cima à esquerda, folhas em tufos). `baseX, baseY` = o pé do tronco; `size` em casas.
 */
/** Cerejeira (sakura): copa rosa nos gramados da vila. */
const SAKURA = ['#5a2a3a', '#c76a8a', '#e88aa8', '#f6b4c8', '#ffe2ec'];

function drawTree(g, baseX, baseY, size, seed, tile, palette) {
  const r = rng(seed);
  const pal = palette || LEAVES[seed % 3];
  const R = tile * 0.5 * size * (0.92 + r() * 0.12);     // raio da copa
  const tw = tile * 0.16 * size, th = tile * 0.42 * size;
  // sombra no chão (para baixo e à direita: luz de cima à esquerda)
  g.fillStyle = 'rgba(0, 0, 0, 0.26)';
  g.beginPath(); g.ellipse(baseX + R * 0.25, baseY - 1, R * 0.95, R * 0.34, 0, 0, Math.PI * 2); g.fill();
  // tronco com raízes
  fr(g, '#3b2412', baseX - tw / 2 - 1, baseY - th, tw + 2, th);
  fr(g, '#6b4423', baseX - tw / 2, baseY - th, tw, th - 1);
  fr(g, '#8a5a2e', baseX - tw / 2 + FINE, baseY - th, tw * 0.3, th - 1);
  fr(g, '#4a2e17', baseX + tw * 0.15, baseY - th * 0.7, FINE * 2, th * 0.5);
  fr(g, '#3b2412', baseX - tw / 2 - 2, baseY - 2, 2.5, 1.6);
  fr(g, '#3b2412', baseX + tw / 2 - 0.5, baseY - 2, 2.5, 1.6);
  // copa: bolhas sobrepostas
  const cx = baseX, cy = baseY - th - R * 0.62;
  const blobs = [[0, 0.05, 0.78], [-0.52, 0.22, 0.56], [0.52, 0.22, 0.56], [-0.3, -0.38, 0.58], [0.32, -0.36, 0.56], [0, 0.42, 0.6], [0.02, -0.6, 0.42]];
  const disk = (dx, dy, rr) => { g.beginPath(); g.arc(cx + dx * R, cy + dy * R, rr, 0, Math.PI * 2); g.fill(); };
  g.fillStyle = pal[0];
  for (const [bx, by, br] of blobs) disk(bx, by, br * R + 1.2);
  g.fillStyle = pal[1];
  for (const [bx, by, br] of blobs) disk(bx, by, br * R);
  g.fillStyle = pal[2];
  for (const [bx, by, br] of blobs) disk(bx - 0.06, by - 0.1, br * R * 0.86);
  g.fillStyle = pal[3];
  for (const [bx, by, br] of blobs) if (by < 0.3) disk(bx - 0.14, by - 0.2, br * R * 0.5);
  // tufos de folha (textura) e brilhos
  for (let i = 0; i < 10 + size * 4; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.85;
    const lx = cx + Math.cos(a) * d, ly = cy + Math.sin(a) * d * 0.9;
    const up = ly < cy;
    g.fillStyle = up ? pal[3] : pal[1];
    g.beginPath(); g.arc(lx, ly, 1.1 + r() * 0.9, Math.PI, Math.PI * 2); g.fill();
    if (up && r() < 0.5) fr(g, pal[4], lx - 0.5, ly - 1, FINE * 2, FINE * 2);
  }
  fr(g, pal[4], cx - R * 0.45, cy - R * 0.5, 1.4, 1);
  fr(g, pal[4], cx - R * 0.3, cy - R * 0.62, 1, FINE * 2);
  if (palette === SAKURA) {                                                          // pétalas caídas em volta
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = R * (0.4 + r() * 0.9);
      fr(g, r() < 0.5 ? '#f6b4c8' : '#e88aa8', baseX + Math.cos(a) * d, baseY - 1 + Math.sin(a) * d * 0.35, 1, FINE * 2);
    }
  }
}

/**
 * Bloco de árvores (a parede `tree`): uma árvore só nos blocos pequenos; fileiras desencontradas nas bordas da mata
 * (de trás para a frente, para a de trás ficar atrás).
 */
function drawTreeGroup(g, x, y, w, h, seed, tile, style, theme) {
  const wt = w / tile, ht = h / tile;
  if ((wt <= 3.2 && ht <= 3.2) || (wt <= 4.6 && Math.abs(wt - ht) < 0.01)) {   // v29: árvore sozinha (as do catálogo vão até ~4 casas)
    const bx = x + w / 2, by = y + h - tile * 0.15, size = Math.min(wt, ht);
    // Areia: palmeira no lugar da cerejeira e das árvores grandes (um cacto grande em algumas), cacto nas pequenas.
    if (theme === 'areia') return size < 1.5 ? drawCactus(g, bx, by, size, seed, tile) : style === 'sakura' || seed % 3 ? drawPalm(g, bx, by, size, seed, tile) : drawCactus(g, bx, by, size, seed, tile);
    if (theme === 'nevoa' && style === 'sakura') return drawBamboo(g, bx, by, size, seed, tile);   // Névoa: bambu
    return drawTree(g, bx, by, size, seed, tile, style === 'sakura' ? SAKURA : undefined);
  }
  const r = rng(seed);
  const trees = [];
  if (wt >= ht) {
    const rows = ht >= 2 ? 2 : 1;
    for (let row = 0; row < rows; row++) {
      const by = y + h * (rows === 1 ? 0.92 : row === 0 ? 0.5 : 0.98);
      for (let tx = x + tile * (row ? 0.9 : 0.1); tx < x + w + tile * 0.4; tx += tile * (1.45 + r() * 0.35)) trees.push([tx, by + (r() - 0.5) * 2]);
    }
  } else {
    for (let ty = y + tile * 0.9; ty < y + h + tile * 0.5; ty += tile * (1.3 + r() * 0.3)) {
      trees.push([x + w * (0.3 + r() * 0.4), ty]);
      if (wt >= 2 && r() < 0.5) trees.push([x + w * (r() < 0.5 ? 0.1 : 0.9), ty + tile * 0.5]);
    }
  }
  trees.sort((a, b) => a[1] - b[1]);
  for (const [tx, ty] of trees) drawTree(g, tx, ty, 1.6 + r() * 0.5, (seed + Math.round(tx * 7 + ty * 13)) >>> 0, tile);
}

// ------------------------------------------------------------------ Arco 1: Floresta, Caverna, Clareira (docs/mapas.md)

/**
 * Pedra-Selo: pedra alta com uma chama gravada. Acesa = pedra quente e a chama laranja (o brilho que pulsa é
 * desenhado a cada quadro, em drawSealGlow); apagada = cinza-azulada, chama escura e fria.
 */
function drawSeal(g, x, y, w, h, lit) {
  const cx = x + w / 2, sw = w * 0.62, top = y - 10;
  rect(g, 'rgba(0,0,0,0.3)', cx - sw / 2 - 2, y + h - 5, sw + 8, 6);                 // sombra
  rect(g, '#3b5a2a', cx - sw / 2 - 3, y + h - 6, sw + 6, 4);                         // musgo na base
  const [edge, body, light] = lit ? ['#3a342c', '#8a8172', '#a89e8c'] : ['#2b313a', '#66707c', '#7d8794'];
  g.fillStyle = edge;
  g.beginPath();
  g.moveTo(cx - sw / 2, y + h - 3); g.lineTo(cx - sw / 2 + 2, top + 8); g.quadraticCurveTo(cx, top - 4, cx + sw / 2 - 2, top + 8);
  g.lineTo(cx + sw / 2, y + h - 3); g.closePath(); g.fill();
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(cx - sw / 2 + 2, y + h - 4); g.lineTo(cx - sw / 2 + 4, top + 9); g.quadraticCurveTo(cx, top - 1, cx + sw / 2 - 4, top + 9);
  g.lineTo(cx + sw / 2 - 2, y + h - 4); g.closePath(); g.fill();
  rect(g, light, cx - sw / 2 + 5, top + 9, 3, h - 2);                                 // luz de cima à esquerda
  // a chama gravada
  const fy = y + h * 0.35;
  g.fillStyle = lit ? '#ff8a2a' : '#3f4752';
  g.beginPath(); g.moveTo(cx, fy - 9); g.quadraticCurveTo(cx + 7, fy, cx + 3, fy + 8); g.lineTo(cx - 3, fy + 8); g.quadraticCurveTo(cx - 7, fy, cx, fy - 9); g.fill();
  if (lit) {
    g.fillStyle = '#ffe08a';
    g.beginPath(); g.moveTo(cx, fy - 3); g.quadraticCurveTo(cx + 3, fy + 2, cx + 1, fy + 6); g.lineTo(cx - 1, fy + 6); g.quadraticCurveTo(cx - 3, fy + 2, cx, fy - 3); g.fill();
  } else {
    g.fillStyle = '#9fb4c8';                                                          // geada fina: a pedra fria
    for (const [dx, dy] of [[-6, -4], [5, 6], [-3, 10], [6, -7]]) g.fillRect(Math.round(cx + dx), Math.round(fy + dy), 1, 1);
  }
}

/** Brilho da Pedra-Selo acesa (a cada quadro, por cima do chão): um halo laranja que respira. Coordenadas de tela. */
export function drawSealGlow(ctx, x, y, w, h, now) {
  const cx = x + w / 2, cy = y + h * 0.4, r = Math.max(w, h) * 1.4;
  const pulse = 0.55 + 0.45 * Math.sin(now / 520);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, `rgba(255, 170, 60, ${0.35 * pulse})`);
  grad.addColorStop(1, 'rgba(255, 140, 40, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

/** Tronco do Velho Carvalho: largo, casca com veios e raízes que abrem na base (a copa vem por cima, à parte). */
/**
 * v29: o Velho Carvalho como peça do catálogo (referência da Floresta): uma árvore enorme, no mesmo estilo das outras,
 * com o tronco largo e as raízes abertas sobre a caixa de colisão (o tronco é o que bloqueia) e a copa bem acima.
 */
const OAK_LEAVES = ['#1c2410', '#33421c', '#4b5e26', '#6a7d34', '#9aa851'];
function drawGiantOak(g, x, y, w, h, tile) {
  const cx = x + w / 2, base = y + h;
  // raízes: dedos grossos que se abrem no chão
  g.fillStyle = '#2b1a0e';
  for (const [dx, reach] of [[-0.48, 0.5], [-0.32, 0.85], [-0.12, 0.6], [0.12, 0.6], [0.32, 0.85], [0.48, 0.5]]) {
    g.beginPath();
    g.moveTo(cx + dx * w * 0.35, base - h * 0.7);
    g.quadraticCurveTo(cx + dx * w * 0.8, base - h * 0.2, cx + dx * w * (0.75 + reach * 0.2), base);
    g.lineTo(cx + dx * w * (0.62 + reach * 0.2), base);
    g.quadraticCurveTo(cx + dx * w * 0.5, base - h * 0.3, cx + dx * w * 0.2, base - h * 0.7);
    g.closePath(); g.fill();
  }
  // o tronco: largo embaixo, com sombra à direita e luz à esquerda
  const tw = w * 0.36;
  g.fillStyle = '#14182b';
  g.beginPath(); g.moveTo(cx - tw * 0.62, base - h * 0.1); g.lineTo(cx - tw * 0.4, y - tile * 3.2); g.lineTo(cx + tw * 0.4, y - tile * 3.2); g.lineTo(cx + tw * 0.62, base - h * 0.1); g.closePath(); g.fill();
  g.fillStyle = '#4a2e16';
  g.beginPath(); g.moveTo(cx - tw * 0.56, base - h * 0.12); g.lineTo(cx - tw * 0.36, y - tile * 3.2); g.lineTo(cx + tw * 0.36, y - tile * 3.2); g.lineTo(cx + tw * 0.56, base - h * 0.12); g.closePath(); g.fill();
  g.fillStyle = '#6b4424';
  g.beginPath(); g.moveTo(cx - tw * 0.5, base - h * 0.14); g.lineTo(cx - tw * 0.32, y - tile * 3.2); g.lineTo(cx - tw * 0.08, y - tile * 3.2); g.lineTo(cx - tw * 0.14, base - h * 0.14); g.closePath(); g.fill();
  // a copa: tufos grandes em camadas (escuro embaixo, luz em cima à esquerda)
  const r = rng(4242);
  const R = tile * 2.1, top = y - tile * 6.2;
  const blobs = [];
  for (let i = 0; i < 16; i++) blobs.push([cx + (r() - 0.5) * w * 1.15, top + (r() - 0.5) * tile * 5.2, R * (0.7 + r() * 0.45)]);
  blobs.sort((a, b) => a[1] - b[1]);
  for (const [bx, by, br] of blobs) { g.fillStyle = OAK_LEAVES[0]; g.beginPath(); g.arc(bx, by + br * 0.1, br * 1.05, 0, Math.PI * 2); g.fill(); }
  for (const [bx, by, br] of blobs) {
    g.fillStyle = OAK_LEAVES[1]; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
    g.fillStyle = OAK_LEAVES[2]; g.beginPath(); g.arc(bx - br * 0.18, by - br * 0.2, br * 0.7, 0, Math.PI * 2); g.fill();
    g.fillStyle = OAK_LEAVES[3]; g.beginPath(); g.arc(bx - br * 0.34, by - br * 0.38, br * 0.34, 0, Math.PI * 2); g.fill();
  }
}

function drawOakTrunk(g, x, y, w, h) {
  rect(g, 'rgba(0,0,0,0.3)', x + 4, y + h - 4, w, 6);
  g.fillStyle = '#3a2412';
  g.beginPath();
  g.moveTo(x + w * 0.12, y); g.lineTo(x + w * 0.88, y);
  g.lineTo(x + w * 0.92, y + h * 0.75); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.lineTo(x + w * 0.08, y + h * 0.75); g.closePath();
  g.fill();
  rect(g, '#5a3a1e', x + w * 0.18, y, w * 0.64, h - 3);
  g.fillStyle = '#6e4825';
  for (let i = 0; i < 5; i++) g.fillRect(Math.round(x + w * (0.24 + i * 0.12)), y + 2, 2, h - 8);      // veios da casca
  g.fillStyle = '#2a190c';
  g.fillRect(Math.round(x + w * 0.45), Math.round(y + h * 0.35), 6, 8);                                 // oco no tronco
}

/**
 * Copa do Velho Carvalho (passa POR CIMA de quem anda embaixo): a maior copa da Floresta, no mesmo estilo das outras
 * árvores (contorno, sombra, meio, luz e tufos de folha), desenhada uma vez (cache) em unidades: `w, h` = o tamanho.
 */
export function drawOakCanopy(g, w, h) {
  const r = rng(4242);
  const pal = LEAVES[0];
  const blobs = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, d = 0.3 + r() * 0.12;
    blobs.push([0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d * 0.9, 0.17 + r() * 0.05]);
  }
  blobs.push([0.5, 0.48, 0.34], [0.38, 0.4, 0.22], [0.62, 0.4, 0.22], [0.5, 0.3, 0.22]);
  const R = Math.min(w, h);
  const disk = (bx, by, rr, dx = 0, dy = 0) => { g.beginPath(); g.arc(bx * w + dx, by * h + dy, rr, 0, Math.PI * 2); g.fill(); };
  g.fillStyle = 'rgba(0, 0, 0, 0.22)';
  for (const [bx, by, br] of blobs) disk(bx, by, br * R, 6, 9);
  g.fillStyle = pal[0];
  for (const [bx, by, br] of blobs) disk(bx, by, br * R + 1.4);
  g.fillStyle = pal[1];
  for (const [bx, by, br] of blobs) disk(bx, by, br * R);
  g.fillStyle = pal[2];
  for (const [bx, by, br] of blobs) disk(bx, by, br * R * 0.86, -R * 0.02, -R * 0.03);
  g.fillStyle = pal[3];
  for (const [bx, by, br] of blobs) if (by < 0.55) disk(bx, by, br * R * 0.5, -R * 0.05, -R * 0.06);
  for (let i = 0; i < 160; i++) {                                                    // tufos de folha
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.42;
    const lx = w * (0.5 + Math.cos(a) * d), ly = h * (0.5 + Math.sin(a) * d * 0.9);
    const up = ly < h * 0.5;
    g.fillStyle = up ? pal[3] : pal[1];
    g.beginPath(); g.arc(lx, ly, 1.2 + r() * 1.1, Math.PI, Math.PI * 2); g.fill();
    if (up && r() < 0.4) fr(g, pal[4], lx - 0.5, ly - 1.1, FINE * 2, FINE * 2);
  }
  for (let i = 0; i < 6; i++) {                                                      // frutinhas (bolotas)
    const a = r() * Math.PI * 2, d = 0.15 + r() * 0.25;
    const bx = w * (0.5 + Math.cos(a) * d), by = h * (0.5 + Math.sin(a) * d * 0.9);
    fr(g, '#8a5a2e', bx, by, 1, 1.2);
    fr(g, '#5a3a1e', bx, by - FINE, 1, FINE * 2);
  }
}

/**
 * A montanha atrás da sede da vila: o paredão de pedra (colunas, platô, cipós) bem alto, com a mata em cima (copas
 * pequenas de árvore no platô, de trás para a frente) para parecer uma serra, não um monte de pedras.
 */
function drawMountain(g, x, y, w, h, seed, tile) {
  drawCliff(g, x, y, w, h, seed, { face: Math.min(h * 0.55, 92), round: 22 });
  const r = rng(seed + 3);
  const top = h - Math.min(h * 0.55, 92);
  const trees = [];
  for (let ty = y + 8; ty < y + top - 6; ty += 9 + r() * 4) {
    for (let tx = x + 10 + r() * 10; tx < x + w - 10; tx += 16 + r() * 14) trees.push([tx, ty + (r() - 0.5) * 3]);
  }
  for (const [tx, ty] of trees) drawTree(g, tx, ty + tile * 0.6, 0.9 + r() * 0.5, (seed + Math.round(tx * 5 + ty * 3)) >>> 0, tile);
}

/** Caminho de retângulo com cantos redondos (raio por canto: cima-esq, cima-dir, baixo-dir, baixo-esq). */
function roundedPath(g, x, y, w, h, r1, r2 = r1, r3 = r2, r4 = r1) {
  g.beginPath();
  g.moveTo(x + r1, y);
  g.lineTo(x + w - r2, y); g.quadraticCurveTo(x + w, y, x + w, y + r2);
  g.lineTo(x + w, y + h - r3); g.quadraticCurveTo(x + w, y + h, x + w - r3, y + h);
  g.lineTo(x + r4, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r4);
  g.lineTo(x, y + r1); g.quadraticCurveTo(x, y, x + r1, y);
  g.closePath();
}

/** Pedregulho redondo com luz em cima à esquerda e contorno escuro (pé do paredão, cortinas da fresta). */
function boulder(g, cx, cy, rx, ry, pal = ROCK_WARM) {
  g.fillStyle = 'rgba(12, 16, 10, 0.35)';
  g.beginPath(); g.ellipse(cx + 1, cy + ry * 0.7, rx * 1.05, ry * 0.45, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = pal.edge;
  g.beginPath(); g.ellipse(cx, cy, rx + 0.6, ry + 0.6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = pal.dark;
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = pal.mid;
  g.beginPath(); g.ellipse(cx - rx * 0.12, cy - ry * 0.16, rx * 0.82, ry * 0.74, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = pal.light;
  g.beginPath(); g.ellipse(cx - rx * 0.35, cy - ry * 0.42, rx * 0.36, ry * 0.24, -0.3, 0, Math.PI * 2); g.fill();
}

/** Pedra da Floresta: cinza quente (o roxo fica para a caverna). */
const ROCK_WARM = { edge: '#211d19', dark: '#4f4740', mid: '#6d645a', light: '#948a7c', crack: '#2c2723' };
const GRASS_TOP = { back: '#24502a', base: '#2f6a33', light: '#3f8040', tip: '#6aa85a', dark: '#1f4a24' };

/**
 * Paredão de pedra (vista de cima em 3/4): em cima, o platô de grama com a beirada caindo por cima da rocha; na
 * frente, colunas de pedra arredondadas (luz da esquerda), fendas escuras entre elas, musgo e cipós descendo, e
 * pedregulhos no pé. Os cantos são redondos: de longe, um morro de pedra, não uma caixa. Caixas pequenas (as
 * cortinas da fresta) viram um monte de pedregulhos.
 */
function drawCliff(g, x, y, w, h, seed, opts = {}) {
  const r = rng(seed);
  if (w * h <= 16 * 16 * 3) {                                                       // cortina: pedregulhos
    const n = Math.max(2, Math.round(w / 12));
    for (let i = 0; i < n; i++) boulder(g, x + (i + 0.5) * (w / n) + (r() - 0.5) * 2, y + h * 0.35 + r() * 2, w / n * 0.62, Math.min(h * 0.75, 7) + r() * 2);
    return;
  }
  const face = Math.min(h * 0.6, opts.face ?? 56), top = h - face, fy = y + top;
  const rad = Math.min(opts.round ?? 12, w / 2.5, h / 2.5);
  // sombra no pé
  g.fillStyle = 'rgba(10, 14, 8, 0.32)';
  roundedPath(g, x + 2, y + h - 4, w - 2, 9, 4); g.fill();
  g.save();
  roundedPath(g, x, y, w, h + 3, rad, rad, rad * 0.6, rad * 0.6);
  g.clip();
  g.fillStyle = ROCK_WARM.edge;
  g.fillRect(x, y, w, h + 3);
  // a face: colunas de pedra com o pé arredondado
  let cx = x + 0.5;
  while (cx < x + w - 1) {
    const cw = Math.min(x + w - 0.5 - cx, 13 + r() * 13);
    const bottom = y + h - 1 - r() * 2.5, tone = [ROCK_WARM.mid, '#665d54', '#736a5f'][Math.floor(r() * 3)];
    g.fillStyle = tone;
    roundedPath(g, cx, fy - 3, cw - 1.2, bottom - fy + 3, 3, 3, 5, 5); g.fill();
    fr(g, ROCK_WARM.light, cx + 0.8, fy - 1, 2, bottom - fy - 3);                   // luz na quina esquerda
    fr(g, '#5a524a', cx + cw - 4.2, fy, 3, bottom - fy - 2);                         // sombra na direita
    for (let k = 0; k < 2; k++) {                                                    // rachaduras deitadas
      const ky = fy + 6 + r() * (bottom - fy - 12);
      fr(g, ROCK_WARM.crack, cx + 3 + r() * 3, ky, cw * (0.3 + r() * 0.35), FINE * 2);
    }
    for (let k = 0; k < cw / 4; k++) fr(g, r() < 0.5 ? '#7e7468' : '#5c544c', cx + 2 + r() * (cw - 5), fy + 2 + r() * (bottom - fy - 6), FINE * 2, FINE * 2);
    if (r() < 0.55) {                                                                // musgo no alto da coluna
      g.fillStyle = 'rgba(70, 120, 50, 0.75)';
      g.beginPath(); g.ellipse(cx + cw * (0.3 + r() * 0.4), fy + 3 + r() * 4, 2.5 + r() * 3, 1.6 + r(), 0, 0, Math.PI * 2); g.fill();
    }
    cx += cw;
  }
  // o platô de grama em cima, mais escuro no fundo
  const grad = g.createLinearGradient(0, y, 0, fy);
  grad.addColorStop(0, GRASS_TOP.back);
  grad.addColorStop(1, GRASS_TOP.base);
  g.fillStyle = grad;
  g.fillRect(x, y, w, top);
  for (let i = 0; i < (w * top) / 22; i++) {
    const px = x + r() * w, py = y + r() * top;
    fr(g, r() < 0.5 ? GRASS_TOP.light : GRASS_TOP.dark, px, py, FINE, FINE * (2 + Math.floor(r() * 3)));
  }
  if (top > 40) {                                                                   // platô alto: a borda dos lados também é pedra
    fr(g, ROCK_WARM.dark, x, y + rad, 2.5, top - rad);
    fr(g, ROCK_WARM.dark, x + w - 2.5, y + rad, 2.5, top - rad);
    fr(g, ROCK_WARM.light, x + 0.5, y + rad, FINE * 2, top - rad);
  }
  // a beirada: a grama cai por cima da pedra, com sombra embaixo
  for (let bx = x - 2; bx < x + w + 2; bx += 4 + r() * 3) {
    const rr = 2.6 + r() * 2.4;
    g.fillStyle = 'rgba(15, 12, 8, 0.5)';
    g.beginPath(); g.ellipse(bx, fy + rr * 0.9, rr, rr * 0.7, 0, 0, Math.PI * 2); g.fill();
  }
  for (let bx = x - 2; bx < x + w + 2; bx += 4 + r() * 3) {
    const rr = 2.6 + r() * 2.4;
    g.fillStyle = GRASS_TOP.base;
    g.beginPath(); g.ellipse(bx, fy - 0.5 + rr * 0.3, rr, rr * 0.75, 0, 0, Math.PI * 2); g.fill();
    fr(g, GRASS_TOP.tip, bx - rr * 0.4, fy - rr * 0.3, FINE * 2, FINE * 3);
  }
  for (let i = 0; i < w / 34; i++) {                                                  // cipós descendo
    let vx = x + 6 + r() * (w - 12), vy = fy + 1;
    const len = 8 + r() * (face * 0.45), pts = [[vx, vy]];
    for (let t = 0; t < len; t += 3) { vx += Math.sin(t * 0.7 + i) * 0.8; vy += 3; pts.push([vx, vy]); }
    g.strokeStyle = '#2b5226'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts) g.lineTo(q[0], q[1]); g.stroke();
    for (let k = 1; k < pts.length; k++) {
      g.fillStyle = r() < 0.5 ? '#4a8a3a' : '#3b6e2f';
      g.beginPath(); g.ellipse(pts[k][0] + (k % 2 ? -1.3 : 1.3), pts[k][1], 1.4, 0.8, k % 2 ? 0.5 : -0.5, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
  // pedregulhos e capim no pé
  for (let bx = x + 5; bx < x + w - 4; bx += 10 + r() * 12) {
    if (r() < 0.55) boulder(g, bx, y + h - 1 + r() * 1.5, 2.4 + r() * 2.6, 1.8 + r() * 1.6);
    else for (let k = -1; k <= 1; k++) fr(g, k ? '#3d6b2a' : '#5c9a44', bx + k * 1.1, y + h - 2.8 + Math.abs(k), FINE * 2, 3 - Math.abs(k));
  }
}

/**
 * Boca da Caverna do Lodo: o morro de pedra (paredão de cantos bem redondos) com um arco escuro no meio da face,
 * pedras em volta do arco, dentes de pedra pendurados, o brilho roxo do lodo lá no fundo e uma poça escorrendo para
 * fora. A porta é exatamente o arco (x do meio, 3 casas).
 */
function drawCaveMouth(g, x, y, w, h, seed) {
  drawCliff(g, x, y, w, h, seed, { round: 26, face: 60 });
  const r = rng(seed + 7);
  const ax = x + w / 2, aw = 23, ab = y + h, atop = ab - 46;
  const arch = (grow) => {
    g.beginPath();
    g.moveTo(ax - aw - grow, ab + 1);
    g.lineTo(ax - aw - grow, atop + aw);
    g.arc(ax, atop + aw, aw + grow, Math.PI, 0);
    g.lineTo(ax + aw + grow, ab + 1);
    g.closePath();
  };
  // as pedras da moldura (um anel de blocos em volta do arco)
  for (let a = Math.PI * 1.02; a <= Math.PI * 1.98; a += 0.24) {
    const px = ax + Math.cos(a) * (aw + 4), py = atop + aw + Math.sin(a) * (aw + 4);
    boulder(g, px, py, 4.2, 3.4);
  }
  for (const side of [-1, 1]) for (let py = atop + aw + 3; py < ab - 2; py += 7) boulder(g, ax + side * (aw + 4), py, 3.6, 3.6);
  // a escuridão de dentro, com o roxo do lodo no fundo
  arch(0);
  const dark = g.createRadialGradient(ax, ab - 4, 2, ax, ab - 14, 52);
  dark.addColorStop(0, '#4a1d66');
  dark.addColorStop(0.35, '#1c0b28');
  dark.addColorStop(1, '#050308');
  g.fillStyle = dark;
  g.fill();
  arch(-5);                                                                           // a segunda curva, mais funda
  g.fillStyle = 'rgba(0, 0, 0, 0.35)';
  g.fill();
  g.fillStyle = 'rgba(190, 120, 255, 0.22)';                                          // o brilho no chão de dentro
  g.beginPath(); g.ellipse(ax, ab - 5, aw * 0.75, 5, 0, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 7; i++) {                                                       // dentes de pedra pendurados
    const t = (i + 0.5) / 7, a = Math.PI + t * Math.PI;
    const px = ax + Math.cos(a) * (aw - 1), py = atop + aw + Math.sin(a) * (aw - 1);
    const len = 3 + r() * 5;
    g.fillStyle = ROCK_WARM.dark;
    g.beginPath(); g.moveTo(px - 2, py); g.lineTo(px + 2, py); g.lineTo(px + (r() - 0.5), py + len); g.closePath(); g.fill();
    fr(g, ROCK_WARM.mid, px - 1.5, py, FINE * 2, len * 0.6);
  }
  g.fillStyle = '#d7a8ff';                                                            // dois olhinhos lá no fundo
  for (const dx of [-3, 3]) { g.beginPath(); g.ellipse(ax + 5 + dx, ab - 20, 1.1, 0.7, 0, 0, Math.PI * 2); g.fill(); }
  // lodo escorrendo pela borda do arco e a poça na soleira
  for (const [dx, len] of [[-aw + 2, 7], [-aw * 0.3, 4], [aw * 0.55, 6]]) {
    g.fillStyle = '#5e2a86';
    fr(g, '#5e2a86', ax + dx, atop + aw - Math.sqrt(Math.max(0, aw * aw - dx * dx)) + 1, 1.6, len);
    g.beginPath(); g.ellipse(ax + dx + 0.8, atop + aw - Math.sqrt(Math.max(0, aw * aw - dx * dx)) + 1 + len, 1.4, 1.8, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#3b1856';
  g.beginPath(); g.ellipse(ax + 2, ab + 2.5, aw * 0.9, 4.2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6e3a96';
  g.beginPath(); g.ellipse(ax, ab + 2, aw * 0.7, 3, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(215, 168, 255, 0.7)';
  g.beginPath(); g.ellipse(ax - aw * 0.3, ab + 1.2, 3, 0.8, 0, 0, Math.PI * 2); g.fill();
}

/**
 * A cachoeira seca: a borda de pedra lá em cima, o canal liso e claro por onde a água descia (gasto, com riscos
 * verticais e a mancha escura do que secou), musgo nas laterais e seixos embaixo.
 */
function drawDryFall(g, x, y, w, h, seed) {
  const r = rng(seed);
  rect(g, '#2e2a26', x, y, w, h);
  rect(g, '#6d655b', x + 1, y + 1, w - 2, h - 2);
  const cx = x + w * 0.3, cw = w * 0.4;
  g.fillStyle = '#b8b0a0';                                                          // o canal liso
  g.beginPath(); g.moveTo(cx, y + 2); g.lineTo(cx + cw, y + 2); g.lineTo(cx + cw + 2, y + h); g.lineTo(cx - 2, y + h); g.closePath(); g.fill();
  for (let i = 0; i < 9; i++) fr(g, i % 2 ? '#a39b8b' : '#cfc7b6', cx + 1 + r() * (cw - 2), y + 3 + r() * 4, FINE, h - 8);   // riscos da água
  fr(g, 'rgba(60, 50, 40, 0.35)', cx + cw * 0.38, y + 2, cw * 0.24, h - 3);         // a mancha do que secou
  fr(g, '#8e8478', x + 1, y + 1, w - 2, 2);                                          // a borda de cima
  fr(g, '#a9a092', x + 1, y + 1, w - 2, FINE * 2);
  for (const side of [x + 2, x + w - 6]) for (let i = 0; i < 3; i++) fr(g, '#4a7a35', side + r() * 3, y + 4 + r() * (h - 8), 2, 1.4);   // musgo
  for (let i = 0; i < 14; i++) {                                                     // seixos embaixo
    const px = x + 3 + r() * (w - 6), py = y + h - 3 + r() * 2.5;
    fr(g, '#7d7568', px, py, 1.6, 1.2);
    fr(g, '#b3ab9b', px, py, FINE * 2, FINE);
  }
}

/**
 * Parede de caverna: rocha escura arroxeada com o topo iluminado (vista em 3/4), estratos e rachaduras na frente,
 * a borda de baixo irregular (calombos sobre o chão) e uns cristais roxos encravados.
 */
function drawCaveWall(g, x, y, w, h, seed) {
  const r = rng(seed);
  const topH = Math.min(h * 0.45, 12);
  // silhueta com calombos na borda de baixo
  g.fillStyle = '#150f1b';
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w, y + h);
  for (let bx = x + w; bx > x; bx -= 6 + r() * 6) g.quadraticCurveTo(bx - 3, y + h + 1.5 + r() * 2, Math.max(x, bx - 6 - r() * 4), y + h);
  g.closePath();
  g.fill();
  fr(g, '#2a2233', x + 1, y + topH, w - 2, h - topH - 1);                           // frente
  g.fillStyle = '#1d1726';
  for (let ly = y + topH + 4; ly < y + h - 2; ly += 5 + r() * 3) g.fillRect(x + 1, ly, w - 2, FINE * 2);   // estratos
  for (let i = 0; i < w / 14; i++) {                                                   // rachaduras
    let cx = x + 3 + r() * (w - 6), cy = y + topH + 1;
    for (let k = 0; k < (h - topH) / 3; k++) { fr(g, '#120d17', cx, cy, FINE * 2, 3); cx += (r() - 0.5) * 1.4; cy += 3; }
  }
  fr(g, '#3a3146', x + 1, y + 1, w - 2, topH);                                        // topo iluminado
  for (let i = 0; i < (w * topH) / 40; i++) fr(g, r() < 0.5 ? '#443a52' : '#302839', x + 1 + r() * (w - 3), y + 1 + r() * (topH - 2), 1 + r() * 2, FINE * 3);
  fr(g, '#5a4d6e', x + 1, y + 1, w - 2, FINE * 2);                                    // brilho da borda
  fr(g, '#211a29', x + 1, y + topH, w - 2, FINE * 2);                                  // a quina do topo
  for (let i = 0; i < w * h / 900; i++) {                                              // cristais roxos
    const cx = x + 4 + r() * (w - 8), cy = y + topH + 3 + r() * Math.max(1, h - topH - 6);
    g.fillStyle = '#5a2f80';
    g.beginPath(); g.moveTo(cx - 1, cy + 1); g.lineTo(cx, cy - 2.2); g.lineTo(cx + 1, cy + 1); g.closePath(); g.fill();
    fr(g, '#c79ae8', cx - FINE, cy - 1.6, FINE, 1.6);
  }
}

/**
 * Barraca de lona (vista de cima em 3/4): as duas águas do telhado subindo para o fundo, o triângulo da frente com a
 * entrada aberta e a aba solta, a vara na ponta, cordas até as estacas. Queimada: fuligem embaixo, buracos com a
 * borda chamuscada e um rasgo.
 */
function drawTent(g, x, y, w, h, seed) {
  const r = rng(seed);
  const cx = x + w / 2, D = h * 0.38, F = { x: cx, y: y + D }, B = { x: cx, y: y };
  const base = y + h - 1;
  g.fillStyle = 'rgba(10, 8, 4, 0.35)';
  g.beginPath(); g.ellipse(cx + 3, base + 1, w / 2 + 3, 5, 0, 0, Math.PI * 2); g.fill();
  const poly = (pts, color) => { g.fillStyle = color; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) g.lineTo(q[0], q[1]); g.closePath(); g.fill(); };
  poly([[B.x, B.y - 1], [x - 1, base - D], [x - 1, base + 0.5], [F.x, F.y - 1]], '#2a2016');               // contorno
  poly([[B.x, B.y - 1], [x + w + 1, base - D], [x + w + 1, base + 0.5], [F.x, F.y - 1]], '#2a2016');
  poly([[B.x, B.y], [x, base - D], [x, base], [F.x, F.y]], '#b9a684');                                       // água da esquerda (luz)
  poly([[B.x, B.y], [x + w, base - D], [x + w, base], [F.x, F.y]], '#8d7c60');                               // água da direita (sombra)
  g.strokeStyle = 'rgba(60, 45, 30, 0.45)'; g.lineWidth = FINE * 2;                                          // costuras da lona
  for (const t of [0.33, 0.66]) {
    g.beginPath(); g.moveTo(B.x + (x - B.x) * t, B.y + (base - D - B.y) * t); g.lineTo(F.x + (x - F.x) * t, F.y + (base - F.y) * t); g.stroke();
    g.beginPath(); g.moveTo(B.x + (x + w - B.x) * t, B.y + (base - D - B.y) * t); g.lineTo(F.x + (x + w - F.x) * t, F.y + (base - F.y) * t); g.stroke();
  }
  poly([[F.x, F.y], [x + 1.5, base], [x + w - 1.5, base]], '#a8956f');                                       // a frente
  poly([[F.x, F.y + 4], [cx - w * 0.2, base], [cx + w * 0.2, base]], '#1b130c');                             // a entrada
  poly([[F.x, F.y + 4], [cx + w * 0.2, base], [cx + w * 0.3, base - 2]], '#c8b693');                         // a aba dobrada
  fr(g, '#5a3a1e', F.x - 0.8, F.y - 3, 1.6, 4);                                                               // vara
  fr(g, '#3a2614', F.x - 0.4, F.y - 4, 0.8, 1.2);
  g.strokeStyle = 'rgba(70, 55, 35, 0.8)'; g.lineWidth = FINE * 2;                                           // cordas e estacas
  for (const [sx, ex] of [[x + 2, x - 4], [x + w - 2, x + w + 4]]) {
    g.beginPath(); g.moveTo(sx, base - D * 0.5); g.lineTo(ex, base + 1); g.stroke();
    fr(g, '#4a3420', ex - 0.6, base, 1.2, 2);
  }
  // queimado: fuligem subindo da base, buracos e um rasgo
  const soot = g.createLinearGradient(0, base - h * 0.6, 0, base);
  soot.addColorStop(0, 'rgba(25, 18, 12, 0)');
  soot.addColorStop(1, 'rgba(25, 18, 12, 0.55)');
  poly([[B.x, B.y + D * 0.6], [x, base - D * 0.6], [x, base], [x + w, base], [x + w, base - D * 0.6]], soot);
  for (let i = 0; i < 4; i++) {
    const bx = x + 5 + r() * (w - 10), by = y + D * 0.6 + r() * (h - D - 4), br = 1.6 + r() * 2.2;
    g.fillStyle = '#6a3a18';
    g.beginPath(); g.ellipse(bx, by, br + 0.9, br * 0.8 + 0.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#140d08';
    g.beginPath(); g.ellipse(bx, by, br, br * 0.8, 0, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#140d08'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x + w * 0.72, base - D * 0.9); g.lineTo(x + w * 0.78, base - D * 0.5); g.lineTo(x + w * 0.74, base - 2); g.stroke();
}

/** Árvores mortas (Clareira Queimada): troncos cinzentos e galhos secos, sem folha. */
function drawDeadTrees(g, x, y, w, h, seed, tile) {
  const n = Math.max(1, Math.round((w * h) / (tile * tile * 3)));
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const cx = x + 4 + r() * (w - 8), cy = y + 4 + r() * (h - 8);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(cx + 2, cy + 6, 6, 3, 0, 0, Math.PI * 2); g.fill();
    rect(g, '#2a2420', cx - 2, cy - 10, 4, 16);
    rect(g, '#4a403a', cx - 1, cy - 10, 2, 15);
    g.strokeStyle = '#2a2420';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx, cy - 6); g.lineTo(cx - 7, cy - 13);
    g.moveTo(cx, cy - 3); g.lineTo(cx + 7, cy - 11);
    g.moveTo(cx - 4, cy - 10); g.lineTo(cx - 5, cy - 16);
    g.stroke();
  }
}

/** Troncos queimados empilhados atravessando a passagem (lacrada até a história abrir). */
function drawLogs(g, x, y, w, h) {
  rect(g, 'rgba(0,0,0,0.3)', x + 3, y + h - 2, w, 5);
  const rows = 2, rh = h / rows;
  for (let i = 0; i < rows; i++) {
    const ly = y + i * rh, lx = x + (i % 2 ? 6 : 0), lw = w - 6;
    rect(g, '#1f1712', lx, ly + 1, lw, rh - 2);
    rect(g, '#3b2a1e', lx + 1, ly + 2, lw - 2, rh - 5);
    rect(g, '#5a3f2a', lx + 1, ly + 2, lw - 2, 2);
    g.fillStyle = '#c8461e';                                                          // brasas na casca
    for (let k = lx + 8; k < lx + lw - 6; k += 17) g.fillRect(k, ly + rh / 2, 2, 1);
    g.fillStyle = '#6b4a30';
    g.beginPath(); g.ellipse(lx + lw - 2, ly + rh / 2, 3, rh / 2 - 2, 0, 0, Math.PI * 2); g.fill();     // ponta cortada
  }
}

/**
 * Sumidouro: a água do riacho escorre por um funil de pedra e some no escuro (é a água que sobe no canal da Vila).
 * Pedras arredondadas em volta, a água girando em espiral e escurecendo até o fundo.
 */
function drawSink(g, x, y, w, h) {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2 - 2, ry = h / 2 - 3;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(cx + 1, cy + 2, rx + 2, ry + 2, 0, 0, Math.PI * 2); g.fill();
  const grad = g.createRadialGradient(cx, cy, 1, cx, cy, rx);
  grad.addColorStop(0, '#05070a');
  grad.addColorStop(0.55, '#16324e');
  grad.addColorStop(1, '#3a78c4');
  g.fillStyle = grad;
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(200, 230, 255, 0.55)';                                        // a espiral da água
  g.lineWidth = FINE * 2;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let t = 0; t < Math.PI * 1.6; t += 0.2) {
      const rr = (1 - t / (Math.PI * 2)) * 0.85;
      const px = cx + Math.cos(t + k * 2.1) * rx * rr, py = cy + Math.sin(t + k * 2.1) * ry * rr;
      if (t === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }
  const r = rng(Math.round(x * 13 + y * 7));                                         // pedras arredondadas na borda
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + r() * 0.3;
    const px = cx + Math.cos(a) * (rx + 1), py = cy + Math.sin(a) * (ry + 1);
    const pr = 1.6 + r() * 1.4;
    g.fillStyle = '#4a4744';
    g.beginPath(); g.ellipse(px, py + 0.5, pr, pr * 0.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8d8a84';
    g.beginPath(); g.ellipse(px - 0.3, py - 0.2, pr * 0.8, pr * 0.6, 0, 0, Math.PI * 2); g.fill();
    fr(g, '#b8b4aa', px - pr * 0.5, py - pr * 0.4, pr * 0.6, FINE * 2);
  }
}

/** Lago de lodo (Caverna): chakra derretido, roxo, com bolhas claras. */
function drawPool(g, x, y, w, h, seed) {
  const r = rng(seed);
  g.fillStyle = '#1d0f26';
  g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4a2266';
  g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2 - 4, h / 2 - 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6e3a92';
  g.beginPath(); g.ellipse(x + w / 2 - w * 0.1, y + h / 2 - h * 0.1, w * 0.28, h * 0.22, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c79ae8';
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.8;
    g.beginPath(); g.arc(x + w / 2 + Math.cos(a) * d * (w / 2 - 8), y + h / 2 + Math.sin(a) * d * (h / 2 - 8), 1 + r() * 2, 0, Math.PI * 2); g.fill();
  }
}

/** Portão fechado (as vilas sem saída a pé): duas folhas de madeira escura com cintas de ferro e a tranca. */
function drawClosedGate(g, x, y, w, h) {
  rect(g, 'rgba(0,0,0,0.3)', x + 2, y + 4, w, h);
  rect(g, '#2b1a0e', x, y, w, h);
  rect(g, '#5c3a1c', x + 1, y + 1, w - 2, h - 2);
  g.fillStyle = '#4a2e17';
  for (let px = x + 5; px < x + w - 2; px += 6) g.fillRect(px, y + 1, 1, h - 2);          // tábuas
  rect(g, '#3a3a40', x + 1, y + Math.round(h * 0.25), w - 2, 3);                          // cintas de ferro
  rect(g, '#3a3a40', x + 1, y + Math.round(h * 0.7), w - 2, 3);
  rect(g, '#1d1208', x + w / 2 - 1, y + 1, 2, h - 2);                                     // emenda das folhas
  rect(g, '#8a6a2a', x + w / 2 - 6, y + h / 2 - 2, 12, 4);                                // tranca
  rect(g, '#c9a24a', x + w / 2 - 6, y + h / 2 - 2, 12, 1);
}

/** Caminho suave (Catmull-Rom) pelos pontos [[x, y], ...]. */
function smoothPath(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
}

/** Pontos ao longo do mesmo caminho suave, a cada ~`step` unidades, com a direção (tx, ty) e a normal (nx, ny). */
function sampleSmooth(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, u = 1 - t;
      const x = u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0];
      const y = u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1];
      const dx = 3 * u * u * (c1[0] - p1[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p2[0] - c2[0]);
      const dy = 3 * u * u * (c1[1] - p1[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p2[1] - c2[1]);
      const len = Math.hypot(dx, dy) || 1;
      out.push({ x, y, tx: dx / len, ty: dy / len, nx: -dy / len, ny: dx / len });
    }
  }
  return out;
}

/** Pedrinha redonda com luz em cima à esquerda. */
function pebble(g, px, py, rad, base, light) {
  g.fillStyle = 'rgba(20, 16, 10, 0.45)';
  g.beginPath(); g.ellipse(px + 0.3, py + 0.5, rad, rad * 0.75, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = base;
  g.beginPath(); g.ellipse(px, py, rad, rad * 0.75, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = light;
  g.beginPath(); g.ellipse(px - rad * 0.3, py - rad * 0.25, rad * 0.45, rad * 0.3, 0, 0, Math.PI * 2); g.fill();
}

/**
 * Riacho: uma faixa curva pela linha do enfeite (d.p, meia largura d.r). Margem de terra molhada com pedrinhas e
 * capim, água funda nas bordas e clara no meio, riscos da correnteza e espuma junto das pedras. Mesmo sorteio em
 * todo chunk (a semente vem da posição do enfeite): emenda sem costura.
 */
function drawStream(g, d, x, y, w) {
  const U = w / d.w, R = d.r * U;
  const pts = [];
  for (let i = 0; i < d.p.length; i += 2) pts.push([x + d.p[i] * U, y + d.p[i + 1] * U]);
  const r = rng(Math.round(d.x * 31 + d.y * 17));
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const stroke = (color, width) => { g.strokeStyle = color; g.lineWidth = width; smoothPath(g, pts); g.stroke(); };
  stroke('rgba(16, 28, 12, 0.35)', R * 2 + 11);      // a grama úmida em volta
  stroke('#5b4b34', R * 2 + 6.5);                    // a margem de terra molhada
  stroke('#3e3323', R * 2 + 2.6);
  stroke('#1f5277', R * 2);                          // água funda junto da margem
  stroke('#2a6c9b', R * 1.6);
  stroke('#3485b8', R * 1.05);                       // o meio, mais claro
  stroke('rgba(140, 205, 235, 0.3)', R * 0.4);
  const S = sampleSmooth(pts, 2.5);
  for (const q of S) {                               // pedrinhas e capim nas duas margens
    for (const side of [-1, 1]) {
      if (r() < 0.5) {
        const off = R + 1.6 + r() * 2.8;
        pebble(g, q.x + q.nx * off * side, q.y + q.ny * off * side, 0.8 + r() * 1.3, r() < 0.5 ? '#77716a' : '#66615a', '#aaa498');
      }
      if (r() < 0.22) {
        const off = R + 3.8 + r() * 2, bx = q.x + q.nx * off * side, by = q.y + q.ny * off * side;
        for (let k = -1; k <= 1; k++) fr(g, k ? '#3f7a32' : '#5c9a44', bx + k * 0.8, by - 2.4 + Math.abs(k) * 0.8, FINE * 2, 2.4 - Math.abs(k) * 0.8);
      }
    }
  }
  g.lineWidth = FINE * 2;
  for (let i = 0; i < S.length; i++) {               // riscos da correnteza (seguem a direção da água)
    if (r() > 0.55) continue;
    const q = S[i], off = (r() - 0.5) * R * 1.5, len = 2 + r() * 4;
    const sx = q.x + q.nx * off, sy = q.y + q.ny * off;
    g.strokeStyle = r() < 0.5 ? 'rgba(210, 240, 255, 0.55)' : 'rgba(120, 190, 230, 0.6)';
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + q.tx * len, sy + q.ty * len); g.stroke();
  }
  for (let i = 0; i < S.length; i++) {               // espuma junto da margem
    if (r() > 0.4) continue;
    const q = S[i], side = r() < 0.5 ? -1 : 1, off = R - 0.6 - r() * 0.8;
    fr(g, 'rgba(230, 245, 255, 0.75)', q.x + q.nx * off * side, q.y + q.ny * off * side, FINE * (2 + Math.round(r() * 3)), FINE * 2);
  }
  for (let i = 6; i < S.length - 6; i += 9 + Math.floor(r() * 8)) {   // pedras no meio da água, com espuma atrás
    const q = S[i], off = (r() - 0.5) * R * 0.9, px = q.x + q.nx * off, py = q.y + q.ny * off, rad = 1.3 + r() * 1.2;
    g.strokeStyle = 'rgba(225, 242, 255, 0.7)';
    g.lineWidth = FINE * 2;
    g.beginPath(); g.ellipse(px - q.tx * 0.6, py - q.ty * 0.6, rad + 0.8, rad * 0.75 + 0.6, Math.atan2(q.ty, q.tx), -1.2, 1.2); g.stroke();
    pebble(g, px, py, rad, '#6d6860', '#a49e92');
  }
  g.restore();
}

/**
 * Trilhas de terra da Floresta, desenhadas JUNTAS (cada camada em todas antes da próxima): assim, onde uma trilha
 * encontra a outra, a terra emenda sem a borda de uma cortar a outra. A faixa curva com a beira mais escura, o meio
 * gasto, dois sulcos, pedrinhas e o capim invadindo as beiradas. `list`: [{ d, x, y, w }] (o enfeite e a caixa dele
 * em unidades do bloco).
 */
export function drawTrails(g, list) {
  const lim = (g.canvas?.width || 4096) / ART + 24;
  const vis = (q) => q.x > -24 && q.y > -24 && q.x < lim && q.y < lim;
  const trails = list.map(({ d, x, y, w }) => {
    const U = w / d.w, pts = [];
    for (let i = 0; i < d.p.length; i += 2) pts.push([x + d.p[i] * U, y + d.p[i + 1] * U]);
    return { d, pts, R: d.r * U, S: sampleSmooth(pts, 2.4), r: rng(Math.round(d.x * 37 + d.y * 11 + d.w * 7)) };
  });
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [color, grow] of [['rgba(16, 28, 12, 0.3)', 5], ['#6e5a3c', 1.5], ['#8f7550', 0], ['#a48862', -1]]) {
    for (const t of trails) {
      g.strokeStyle = color;
      g.lineWidth = grow >= 0 ? t.R * 2 + grow : t.R * 1.15;
      smoothPath(g, t.pts);
      g.stroke();
    }
  }
  for (const { S, R, r } of trails) {                // sulcos, pedrinhas e marcas
    for (const q of S) {
      const a = r(), b = r(), c = r(), e = r();
      if (!vis(q)) continue;
      for (const side of [-0.42, 0.42]) {
        if (a < 0.7) fr(g, 'rgba(90, 70, 44, 0.45)', q.x + q.nx * R * side - q.tx, q.y + q.ny * R * side - q.ty, FINE * 3 + Math.abs(q.tx) * 2, FINE * 3 + Math.abs(q.ty) * 2);
      }
      if (b < 0.35) pebble(g, q.x + q.nx * (c - 0.5) * R * 1.6, q.y + q.ny * (c - 0.5) * R * 1.6, 0.6 + e * 0.8, '#7d6a50', '#b8a07a');
    }
  }
  const onTrail = (px, py, self) => trails.some((t) => t !== self && t.S.some((q) => Math.hypot(q.x - px, q.y - py) < t.R));
  for (const t of trails) {                          // o capim invadindo as beiradas (menos no meio de outra trilha)
    for (const q of t.S) {
      const side = t.r() < 0.5 ? -1 : 1, n = t.r(), m = t.r(), tall = 1.6 + t.r() * 1.8;
      if (!vis(q) || n > 0.75) continue;
      const bx = q.x + q.nx * side * (t.R - 0.4 + m * 1.6), by = q.y + q.ny * side * (t.R - 0.4 + m * 1.6);
      if (onTrail(bx, by, t)) continue;
      for (let k = -1; k <= 1; k++) fr(g, k ? '#2f6a33' : '#4f8f3e', bx + k * 0.8, by - tall + Math.abs(k) * 0.7, FINE * 2, tall - Math.abs(k) * 0.7);
    }
  }
  g.restore();
}

/** Leito seco: o caminho que o riacho fazia até a cachoeira. Areia clara, seixos, lama rachada e capim seco. */
function drawDryBed(g, d, x, y, w) {
  const U = w / d.w, R = d.r * U;
  const pts = [];
  for (let i = 0; i < d.p.length; i += 2) pts.push([x + d.p[i] * U, y + d.p[i + 1] * U]);
  const r = rng(Math.round(d.x * 29 + d.y * 13));
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const stroke = (color, width) => { g.strokeStyle = color; g.lineWidth = width; smoothPath(g, pts); g.stroke(); };
  stroke('rgba(20, 24, 12, 0.28)', R * 2 + 7);
  stroke('#6c6352', R * 2 + 3);                      // a beira de seixos escuros
  stroke('#9a8f76', R * 2);                          // areia seca
  stroke('#ab9f83', R * 1.2);
  stroke('rgba(90, 76, 56, 0.35)', R * 0.35);        // o fio escuro do que secou por último
  const S = sampleSmooth(pts, 2.2);
  g.strokeStyle = 'rgba(70, 58, 40, 0.55)';           // lama rachada
  g.lineWidth = FINE * 2;
  for (let i = 0; i < S.length; i += 3) {
    if (r() > 0.6) continue;
    const q = S[i], off = (r() - 0.5) * R * 1.2;
    let cx = q.x + q.nx * off, cy = q.y + q.ny * off;
    g.beginPath(); g.moveTo(cx, cy);
    for (let k = 0; k < 3; k++) { cx += (r() - 0.5) * 3.2; cy += (r() - 0.5) * 3.2; g.lineTo(cx, cy); }
    g.stroke();
  }
  const tones = [['#857e70', '#b5ad9c'], ['#6f695e', '#9e978a'], ['#948b78', '#c4baa4']];
  for (const q of S) {                               // seixos
    for (let k = 0; k < 2; k++) {
      if (r() > 0.75) continue;
      const off = (r() * 2 - 1) * (R + 1), [b, l] = tones[Math.floor(r() * tones.length)];
      pebble(g, q.x + q.nx * off, q.y + q.ny * off, 0.6 + r() * 1.2, b, l);
    }
    if (r() < 0.12) {                                // capim seco na beira
      const side = r() < 0.5 ? -1 : 1, off = R + 1.5, bx = q.x + q.nx * off * side, by = q.y + q.ny * off * side;
      for (let k = -1; k <= 1; k++) fr(g, k ? '#8a7a4a' : '#a8955a', bx + k * 0.9, by - 2.6 + Math.abs(k), FINE * 2, 2.6 - Math.abs(k));
    }
  }
  g.restore();
}

/**
 * Abismo da Floresta: as bordas de pedra e terra quebradas, raízes penduradas, e o fundo que escurece até o preto
 * (com uma névoa fina no meio). Só o Teleporte passa.
 */
function drawChasm(g, x, y, w, h, seed) {
  const r = rng(seed);
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, '#2a2018');
  grad.addColorStop(0.35, '#0b0907');
  grad.addColorStop(1, '#14100c');
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  fr(g, 'rgba(150, 160, 170, 0.10)', x, y + h * 0.45, w, h * 0.18);                 // névoa lá embaixo
  // borda de cima (a beira de onde se pula): terra e pedra quebradas, com raízes penduradas
  for (let bx = x; bx < x + w; bx += 2 + r() * 3) {
    const bw = 2 + r() * 3, bh = 1.6 + r() * 2.4;
    fr(g, '#4a3a2a', bx, y, bw, bh);
    fr(g, '#6b5640', bx, y, bw, FINE * 2);
    if (r() < 0.18) {
      g.strokeStyle = '#3a2614';
      g.lineWidth = FINE * 2;
      g.beginPath(); g.moveTo(bx + 1, y + bh); g.quadraticCurveTo(bx + 2, y + bh + 2, bx + 1.4, y + bh + 3 + r() * 3); g.stroke();
    }
  }
  // borda de baixo (o outro lado): a face de pedra vista de frente
  for (let bx = x; bx < x + w; bx += 2 + r() * 3) {
    const bw = 2 + r() * 3, bh = 1.2 + r() * 1.8;
    fr(g, '#2e2620', bx, y + h - bh, bw, bh);
    fr(g, '#5a4c3c', bx, y + h - bh, bw, FINE * 2);
  }
}

/** Vão no chão da Academia (Sala de Jutsus): bordas de madeira quebrada e o fundo escuro. Só o Teleporte passa. */
function drawPit(g, x, y, w, h) {
  rect(g, '#120d09', x, y, w, h);
  rect(g, '#1d1510', x, y + h * 0.35, w, h * 0.3);
  rect(g, '#5c3a1c', x, y, w, 2);                       // borda de cima (tábuas)
  rect(g, '#3b2414', x, y + h - 2, w, 2);
  g.fillStyle = '#7a5230';
  for (let i = x + 3; i < x + w - 2; i += 7) g.fillRect(i, y + 2, 3, 2);   // lascas
}

/**
 * Campo que drena chakra (Sala de Controle): véu roxo pulsando e símbolos subindo. Desenhado a
 * cada quadro (não fica no bloco do chão) porque pulsa.
 */
export function drawChakraField(g, x, y, w, h, now) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 420);
  g.globalAlpha = 0.10 + 0.08 * pulse;
  rect(g, '#7b3fbf', x, y, w, h);
  g.globalAlpha = 0.35 + 0.25 * pulse;
  g.strokeStyle = '#b48cff';
  g.lineWidth = 2;
  g.setLineDash([8, 6]);
  g.lineDashOffset = -now / 60;
  g.strokeRect(Math.round(x) + 1, Math.round(y) + 1, Math.round(w) - 2, Math.round(h) - 2);
  g.setLineDash([]);
  g.fillStyle = '#d8c2ff';
  for (let i = 0; i < 6; i++) {
    const px = x + ((i * 0.37 + 0.11) % 1) * w;
    const py = y + h - (((now / 2600) + i / 6) % 1) * h;
    g.fillRect(Math.round(px), Math.round(py), 3, 3);
  }
  g.globalAlpha = 1;
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
      if (d.t === 'areia') return drawClayPot(g, cx, y + h - 1, 4.5, Math.round(d.x * 13 + d.y * 7));
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
    case 'ring': return drawArenaInlay(g, x, y, w, h);   // arena: frisos dourados no piso
    case 'fire': {                                    // fogueira (acampamentos da Zona, Refúgio): pedras em roda, lenha e chama
      const cx = Math.round(x + w / 2), cy = Math.round(y + h / 2);
      rect(g, 'rgba(0,0,0,0.25)', cx - 9, cy + 3, 18, 5);
      g.fillStyle = '#6d6a64';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillRect(Math.round(cx + Math.cos(a) * 8) - 2, Math.round(cy + Math.sin(a) * 5) - 1, 4, 3);
      }
      rect(g, '#5c3a1c', cx - 6, cy - 1, 12, 2);
      rect(g, '#4a2e17', cx - 1, cy - 4, 2, 7);
      rect(g, '#e8572f', cx - 4, cy - 7, 8, 6);
      rect(g, '#ffb13b', cx - 2, cy - 9, 4, 6);
      rect(g, '#fff1a8', cx - 1, cy - 6, 2, 3);
      return;
    }
    case 'bones': {                                   // ossos espalhados (Zona de Conflito, Refúgio)
      g.fillStyle = '#e9e1cc';
      const bone = (bx, by, len, vertical) => {
        if (vertical) { g.fillRect(bx, by, 2, len); g.fillRect(bx - 1, by, 4, 2); g.fillRect(bx - 1, by + len - 2, 4, 2); }
        else { g.fillRect(bx, by, len, 2); g.fillRect(bx, by - 1, 2, 4); g.fillRect(bx + len - 2, by - 1, 2, 4); }
      };
      bone(Math.round(x + 3), Math.round(y + h / 2), Math.round(w * 0.45), false);
      bone(Math.round(x + w * 0.62), Math.round(y + 2), Math.round(h * 0.7), true);
      g.fillStyle = '#d8cfb6';
      g.fillRect(Math.round(x + w * 0.8), Math.round(y + h * 0.6), 5, 4);                  // crânio pequeno
      g.fillStyle = '#3a332a';
      g.fillRect(Math.round(x + w * 0.8) + 1, Math.round(y + h * 0.6) + 1, 1, 1);
      g.fillRect(Math.round(x + w * 0.8) + 3, Math.round(y + h * 0.6) + 1, 1, 1);
      return;
    }
    case 'signpost': {                                // placa da trilha: poste e três setas
      const px = Math.round(x + w / 2);
      rect(g, 'rgba(0,0,0,0.3)', px - 2, y + h - 2, 7, 3);
      rect(g, '#3b2414', px - 1, y - 6, 3, h + 6);
      for (const [dy, dir] of [[-5, 1], [0, -1], [5, 1]]) {
        const bx = dir > 0 ? px + 2 : px - 13;
        rect(g, '#7a5530', bx, y + dy, 11, 4);
        rect(g, '#9a6f40', bx, y + dy, 11, 1);
        g.fillStyle = '#7a5530';
        g.beginPath();
        if (dir > 0) { g.moveTo(bx + 11, y + dy); g.lineTo(bx + 14, y + dy + 2); g.lineTo(bx + 11, y + dy + 4); }
        else { g.moveTo(bx, y + dy); g.lineTo(bx - 3, y + dy + 2); g.lineTo(bx, y + dy + 4); }
        g.fill();
      }
      return;
    }
    case 'roots': {                                   // raízes grossas saindo do pé do tronco e afundando na terra
      const cx = x + w / 2;
      const roots = [[-0.26, 0.5], [-0.16, 0.85], [-0.06, 0.65], [0.07, 0.8], [0.17, 0.55], [0.27, 0.7]];
      for (const [t, reach] of roots) {
        const ex = cx + t * w, ey = y + h * reach;
        const mx = cx + t * w * 0.45, my = y + h * 0.25;
        for (const [width, color] of [[3.4, '#2e1c0e'], [2.4, '#5a3a1e'], [1, '#7a5230']]) {
          g.strokeStyle = color;
          g.lineWidth = width;
          g.lineCap = 'round';
          g.beginPath(); g.moveTo(cx + t * 8, y); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
        }
        g.fillStyle = 'rgba(30, 50, 20, 0.6)';                                       // onde a raiz afunda
        g.beginPath(); g.ellipse(ex, ey, 2, 1, 0, 0, Math.PI * 2); g.fill();
      }
      g.lineCap = 'butt';
      return;
    }
    case 'kunai': {                                   // kunai cravada no chão, inclinada
      const px = Math.round(x + w / 2), py = Math.round(y + h / 2);
      rect(g, 'rgba(0,0,0,0.3)', px - 1, py + 3, 6, 2);
      g.strokeStyle = '#c9ced6';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(px, py + 3); g.lineTo(px + 5, py - 4); g.stroke();
      rect(g, '#2b2b33', px + 4, py - 8, 3, 4);                                      // cabo
      g.strokeStyle = '#8a1e14';
      g.lineWidth = 1;
      g.beginPath(); g.arc(px + 7, py - 9, 2, 0, Math.PI * 2); g.stroke();              // argola com a fita das Cinzas
      return;
    }
    case 'embers': {                                  // cinzas com brasas (fogueira apagada, chão queimado)
      const cx = x + w / 2, cy = y + h / 2;
      if (w >= 40) {                                    // a fogueira do acampamento: roda de pedras, lenha queimada
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath(); g.ellipse(cx + 1, cy + 2, w * 0.36, h * 0.3, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3a3634';
        g.beginPath(); g.ellipse(cx, cy, w * 0.3, h * 0.26, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#5c5955';
        g.beginPath(); g.ellipse(cx - 1, cy - 1, w * 0.2, h * 0.16, 0, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const sx = cx + Math.cos(a) * w * 0.33, sy = cy + Math.sin(a) * h * 0.3;
          fr(g, '#4a4744', sx - 1.6, sy - 1, 3.2, 2.2);
          fr(g, '#8d8a84', sx - 1.6, sy - 1, 3.2, FINE * 2);
        }
        for (const [a, len] of [[0.5, 0.28], [-0.6, 0.26], [2.2, 0.22]]) {
          g.save(); g.translate(cx, cy); g.rotate(a);
          fr(g, '#1a1410', -w * len / 2, -1, w * len, 2);
          fr(g, '#3a2a1e', -w * len / 2, -1, w * len, FINE * 2);
          g.restore();
        }
        for (let i = 0; i < 6; i++) fr(g, i % 2 ? '#ffb13b' : '#d2541f', cx - 4 + ((i * 37) % 9), cy - 2 + ((i * 53) % 5), FINE * 2, FINE * 2);
        return;
      }
      g.fillStyle = '#3a3634';
      g.beginPath(); g.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5c5955';
      g.beginPath(); g.ellipse(cx - 2, cy - 1, w / 3, h / 3, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d2541f';
      for (const [dx, dy] of [[-0.2, 0.1], [0.15, -0.15], [0.05, 0.2], [0.3, 0.05]]) g.fillRect(Math.round(cx + dx * w), Math.round(cy + dy * h), 2, 2);
      g.fillStyle = '#ffb13b';
      g.fillRect(Math.round(cx), Math.round(cy), 1, 1);
      return;
    }
    case 'crate': {                                   // caixote de madeira chamuscado, com uma tábua quebrada
      const H = h * 0.35;
      fr(g, 'rgba(10, 8, 4, 0.35)', x + 1.5, y + h - 1, w, 2.5);
      fr(g, '#2a1a0e', x - 0.5, y - 0.5, w + 1, h + 1);
      fr(g, '#8a6438', x, y, w, h - H);                                         // tampo
      for (let py = y + 3.5; py < y + h - H - 1; py += 3.5) fr(g, '#6e4e2a', x, py, w, FINE * 2);
      fr(g, '#a8804c', x, y, w, FINE * 2);
      fr(g, '#5c3e20', x, y + h - H, w, H);                                     // frente
      fr(g, '#3e2a16', x + 1.5, y + h - H + 1, FINE * 2, H - 2);
      fr(g, '#3e2a16', x + w - 2, y + h - H + 1, FINE * 2, H - 2);
      fr(g, '#1a120a', x + w * 0.45, y + 1, w * 0.3, 2.4);                       // a tábua quebrada (buraco)
      g.fillStyle = 'rgba(20, 14, 8, 0.55)';                                    // fuligem
      g.beginPath(); g.ellipse(x + w * 0.25, y + h - 3, w * 0.3, 3, 0, 0, Math.PI * 2); g.fill();
      return;
    }
    case 'pot': {                                     // panela de ferro no tripé, perto da fogueira
      const cx = x + w / 2, by = y + h;
      fr(g, 'rgba(10, 8, 4, 0.35)', cx - 7, by - 2, 14, 3);
      g.strokeStyle = '#3a2614'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(cx, y); g.lineTo(cx - 8, by); g.moveTo(cx, y); g.lineTo(cx + 8, by); g.moveTo(cx, y); g.lineTo(cx + 1, by + 1); g.stroke();
      fr(g, '#2a2a2e', cx - 0.4, y + 1, 0.8, 5);                                 // a corrente
      g.fillStyle = '#16161a';
      g.beginPath(); g.ellipse(cx, y + h * 0.62, 6, 5.2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2e2e34';
      g.beginPath(); g.ellipse(cx - 1, y + h * 0.58, 4.6, 3.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0c0c0e';                                                   // a boca da panela
      g.beginPath(); g.ellipse(cx, y + h * 0.4, 5.4, 1.6, 0, 0, Math.PI * 2); g.fill();
      fr(g, '#6a6a74', cx - 3.5, y + h * 0.5, 2, FINE * 2);
      return;
    }
    case 'bedroll': {                                 // esteira de dormir enrolada pela metade, com a ponta queimada
      fr(g, 'rgba(10, 8, 4, 0.3)', x + 1, y + h - 1, w, 2);
      g.fillStyle = '#6e3a2a';
      roundedPath(g, x, y + 1, w * 0.72, h - 2, 2); g.fill();
      for (let px = x + 2; px < x + w * 0.7; px += 4) fr(g, '#8e5040', px, y + 1.5, 1.4, h - 3);
      g.fillStyle = '#4a2418';                                                    // o rolo
      g.beginPath(); g.ellipse(x + w * 0.8, y + h / 2, w * 0.14, h / 2, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#8e5040'; g.lineWidth = FINE * 2;
      g.beginPath(); g.ellipse(x + w * 0.8, y + h / 2, w * 0.07, h / 4, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#1a120c';                                                    // a ponta queimada
      g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + 5, y + 1); g.lineTo(x + 3, y + h / 2); g.lineTo(x + 6, y + h - 1); g.lineTo(x, y + h - 1); g.closePath(); g.fill();
      fr(g, '#a8501c', x + 4.5, y + h / 2 - 1, 1, 1);
      return;
    }
    case 'scroll_drop': {                             // pergaminho caído, meio aberto, com a fita vermelha
      fr(g, 'rgba(10, 8, 4, 0.3)', x + 1, y + h - 1, w, 1.6);
      fr(g, '#e8dcb8', x + 2, y + 1, w - 5, h - 3);
      for (let ly = y + 2.5; ly < y + h - 3; ly += 2) fr(g, '#8a7a5a', x + 4, ly, (w - 9) * (0.6 + ((ly * 7) % 4) / 10), FINE * 2);
      fr(g, '#6a4a2a', x, y, 3, h - 1);                                          // o rolo
      fr(g, '#8a6a42', x + 0.8, y, 1, h - 1);
      fr(g, '#b3261e', x + w - 4, y + 1, 2.2, h - 2);                             // a fita
      fr(g, '#e0453a', x + w - 4, y + 1, 0.8, h - 2);
      return;
    }
    case 'trail': return drawTrails(g, [{ d, x, y, w }]);   // sozinha (o bloco do chão desenha todas juntas)
    case 'toro': {                                    // lanterna de pedra: base, coluna, a casinha da luz e o telhadinho
      const cx = x + w / 2, by = y + h;
      fr(g, 'rgba(10, 12, 8, 0.3)', cx - 6, by - 2, 13, 3.5);
      fr(g, '#5a5650', cx - 5, by - 4, 10, 4);                                   // base
      fr(g, '#8d8a84', cx - 4.5, by - 4, 9, 1.2);
      fr(g, '#6d6a64', cx - 2, by - 12, 4, 8);                                   // coluna
      fr(g, '#8d8a84', cx - 2, by - 12, 1.2, 8);
      fr(g, '#5a5650', cx - 4.5, by - 14, 9, 2.5);                               // apoio
      fr(g, '#3e3b36', cx - 3.5, by - 19.5, 7, 5.5);                             // a casinha da luz
      fr(g, '#ffd27a', cx - 2.2, by - 18.5, 4.4, 3.5);
      fr(g, '#fff1c4', cx - 1, by - 18, 2, 2);
      fr(g, '#3e3b36', cx - 0.3, by - 19.5, 0.6, 5.5);
      g.fillStyle = '#4a4742';                                                   // o telhadinho
      g.beginPath(); g.moveTo(cx - 7, by - 19); g.lineTo(cx, by - 24); g.lineTo(cx + 7, by - 19); g.closePath(); g.fill();
      fr(g, '#8d8a84', cx - 6.5, by - 19.5, 13, FINE * 2);
      fr(g, '#6d6a64', cx - 1, by - 26, 2, 2.5);                                 // a ponta
      return;
    }
    case 'planter': {                                 // vaso comprido de madeira com flores
      if (d.t === 'areia') {                          // Areia: dois vasos de barro com cactos e babosa
        const seed = Math.round(d.x * 13 + d.y * 7);
        drawClayPot(g, x + w * 0.28, y + h, 3.4, seed);
        drawClayPot(g, x + w * 0.74, y + h, 3, seed + 5);
        return;
      }
      fr(g, 'rgba(10, 12, 8, 0.28)', x + 1, y + h - 1, w, 2.5);
      fr(g, '#4a2e17', x, y + h * 0.35, w, h * 0.65);
      fr(g, '#7a5230', x + 0.8, y + h * 0.35 + 0.8, w - 1.6, h * 0.65 - 2);
      fr(g, '#a8713a', x + 0.8, y + h * 0.35 + 0.8, w - 1.6, FINE * 2);
      const r = rng(Math.round(d.x * 13 + d.y * 7));
      for (let i = 0; i < w / 2.2; i++) {
        const fx = x + 2 + r() * (w - 4), fy = y + h * 0.3 - r() * 3;
        fr(g, '#2f6a33', fx, fy, FINE * 2, 3);
        g.fillStyle = ['#f48aa0', '#f2d25a', '#f4efe0', '#c9a6e8'][i % 4];
        g.beginPath(); g.arc(fx + 0.3, fy, 1.2, 0, Math.PI * 2); g.fill();
        fr(g, '#e0882a', fx, fy - 0.3, FINE * 2, FINE * 2);
      }
      return;
    }
    case 'stream': return drawStream(g, d, x, y, w);
    case 'drybed': return drawDryBed(g, d, x, y, w);
    case 'scorch': {                                  // chão chamuscado: mancha redonda de queimado, com rachaduras e brasas
      const cx = x + w / 2, cy = y + h / 2;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
      grad.addColorStop(0, 'rgba(30, 26, 22, 0.85)');
      grad.addColorStop(0.55, 'rgba(50, 44, 38, 0.6)');
      grad.addColorStop(1, 'rgba(50, 44, 38, 0)');
      g.fillStyle = grad;
      g.save();
      g.translate(cx, cy);
      g.scale(1, h / w);
      g.translate(-cx, -cy);
      g.beginPath(); g.arc(cx, cy, w / 2, 0, Math.PI * 2); g.fill();
      g.restore();
      const r = rng(Math.round(x * 7 + y * 11));
      g.strokeStyle = 'rgba(10, 8, 6, 0.6)';                                         // rachaduras saindo do meio
      g.lineWidth = FINE * 2;
      g.strokeStyle = 'rgba(10, 8, 6, 0.4)';
      g.lineWidth = FINE;
      for (let i = 0; i < 10; i++) {
        const a = r() * Math.PI * 2;
        let px = cx + Math.cos(a) * w * 0.12, py = cy + Math.sin(a) * h * 0.12;
        g.beginPath(); g.moveTo(px, py);
        for (let k = 0; k < 4; k++) { px += Math.cos(a + (r() - 0.5)) * 2.4; py += Math.sin(a + (r() - 0.5)) * 2.4; g.lineTo(px, py); }
        g.stroke();
      }
      for (let i = 0; i < 22; i++) {                                                 // cinza clara e brasas
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.45;
        fr(g, r() < 0.2 ? '#d2541f' : 'rgba(120, 116, 110, 0.6)', cx + Math.cos(a) * w * d, cy + Math.sin(a) * h * d, FINE * 2, FINE * 2);
      }
      return;
    }
    case 'grate': {                                   // grade de ferro onde o rio passa por baixo da muralha
      rect(g, '#1d1a18', x, y, w, h);
      g.fillStyle = '#5c5f66';
      for (let bx = x + 2; bx < x + w - 1; bx += 5) g.fillRect(Math.round(bx), y, 2, h);
      rect(g, '#7a7e86', x, y, w, 2);
      rect(g, '#5c5f66', x, y + h - 2, w, 2);
      return;
    }
    case 'well_lid': {                                // tampa de pedra do poço da Praça, com o selo gravado
      const cx = x + w / 2, cy = y + h / 2;
      g.fillStyle = '#5d5a55';
      g.beginPath(); g.arc(cx, cy, w / 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8d8a84';
      g.beginPath(); g.arc(cx, cy, w / 2 - 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#5d5a55';
      g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, w / 2 - 8, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#6d4a2a';                                                         // a chama do selo, gravada
      g.beginPath(); g.moveTo(cx, cy - 6); g.quadraticCurveTo(cx + 5, cy, cx + 2, cy + 5); g.lineTo(cx - 2, cy + 5); g.quadraticCurveTo(cx - 5, cy, cx, cy - 6); g.fill();
      g.fillStyle = '#3d3a37';
      g.fillRect(Math.round(cx + w * 0.18), Math.round(cy - w * 0.3), 1, 6);              // rachadura
      return;
    }
    case 'stalagmite': {                              // estalagmite (caverna)
      const cx = x + w / 2;
      rect(g, 'rgba(0,0,0,0.3)', cx - 6, y + h - 2, 13, 4);
      g.fillStyle = '#1a1520';
      g.beginPath(); g.moveTo(cx - 7, y + h); g.lineTo(cx, y - 8); g.lineTo(cx + 7, y + h); g.closePath(); g.fill();
      g.fillStyle = '#4d4460';
      g.beginPath(); g.moveTo(cx - 5, y + h - 1); g.lineTo(cx - 1, y - 4); g.lineTo(cx + 1, y + h - 1); g.closePath(); g.fill();
      return;
    }
    case 'footprints': {                              // pegadas indo até a beira (e sumindo)
      g.fillStyle = 'rgba(40, 28, 18, 0.55)';
      for (let i = 0; i < 4; i++) {
        const px = x + 4 + i * (w - 8) / 3, py = y + h - 4 - i * (h - 8) / 3;
        g.beginPath(); g.ellipse(px, py, 2, 3, -0.4, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(px + 5, py + 2, 2, 3, -0.4, 0, Math.PI * 2); g.fill();
      }
      return;
    }
    case 'ladder': {                                  // escada que desce do poço
      rect(g, '#3b2414', x + 3, y, 3, h);
      rect(g, '#3b2414', x + w - 6, y, 3, h);
      g.fillStyle = '#7a5530';
      for (let ly = y + 3; ly < y + h - 1; ly += 6) g.fillRect(x + 3, ly, w - 6, 2);
      return;
    }
    case 'flag': {                                    // bandeira da Vila da Nuvem: pano vinho com a nuvem branca
      const px = x + w / 2;
      fr(g, 'rgba(0,0,0,0.3)', px - 3, y + h - 1.5, 9, 3);
      fr(g, '#2a1a0e', px - 1, y - 24, 2.4, h + 24);                          // mastro
      fr(g, '#6b4423', px - 0.4, y - 24, 1, h + 22);
      g.fillStyle = GOLD.mid; g.beginPath(); g.arc(px + 0.2, y - 25, 1.8, 0, Math.PI * 2); g.fill();
      fr(g, GOLD.light, px - 0.6, y - 26, 0.8, 0.8);
      fr(g, '#2e1018', px + 1.4, y - 22, 12, 19);                              // pano (contorno)
      fr(g, '#7e2f3e', px + 2.2, y - 21.2, 10.4, 17.4);
      fr(g, '#9c4a58', px + 2.2, y - 21.2, 2.6, 17.4);                         // luz na dobra
      g.fillStyle = '#7e2f3e';                                                  // ponta em rabo de andorinha
      g.beginPath(); g.moveTo(px + 2.2, y - 3.8); g.lineTo(px + 7.4, y - 3.8); g.lineTo(px + 4.8, y); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(px + 7.4, y - 3.8); g.lineTo(px + 12.6, y - 3.8); g.lineTo(px + 10, y); g.closePath(); g.fill();
      g.fillStyle = '#f4f6fb';                                                  // a nuvem
      for (const [cx, cy, rr] of [[5.6, -12, 2.2], [8.6, -13, 2.8], [11, -11.6, 2]]) { g.beginPath(); g.arc(px + cx, y + cy, rr, 0, Math.PI * 2); g.fill(); }
      fr(g, '#f4f6fb', px + 4.2, y - 11.6, 8, 2.4);
      fr(g, '#c9d0de', px + 4.2, y - 9.6, 8, 0.8);
      return;
    }
    case 'banner': {                                  // estandarte azul-noite com borda e emblema dourados
      const px = x + w / 2;
      fr(g, 'rgba(0,0,0,0.3)', px - 4, y + h - 2, 10, 3);
      fr(g, '#2a1a0e', px - 1, y - 20, 2.5, h + 20);                          // mastro
      fr(g, '#5c3a1c', px - 0.5, y - 20, 1, h + 18);
      fr(g, GOLD.mid, px - 2, y - 23, 4.5, 3);                                 // ponta dourada
      fr(g, GOLD.light, px - 1, y - 23, 2, 1);
      fr(g, '#0f1424', px + 1.5, y - 19, 12, 20);                              // pano (contorno)
      fr(g, '#22305a', px + 2.5, y - 18, 10, 18);
      fr(g, '#2d3e72', px + 2.5, y - 18, 3, 18);                               // luz na dobra
      fr(g, GOLD.mid, px + 2.5, y - 18, 10, 1);                                // borda dourada
      fr(g, GOLD.mid, px + 2.5, y - 1.5, 10, 1);
      g.fillStyle = '#22305a';                                                  // ponta do pano em V
      g.beginPath(); g.moveTo(px + 2.5, y); g.lineTo(px + 12.5, y); g.lineTo(px + 7.5, y + 3); g.closePath(); g.fill();
      g.strokeStyle = GOLD.light; g.lineWidth = 1;                              // emblema: duas lâminas cruzadas
      g.beginPath(); g.moveTo(px + 4.5, y - 14); g.lineTo(px + 10.5, y - 7); g.moveTo(px + 10.5, y - 14); g.lineTo(px + 4.5, y - 7); g.stroke();
      g.fillStyle = GOLD.mid;
      g.beginPath(); g.arc(px + 7.5, y - 10.5, 1.6, 0, Math.PI * 2); g.fill();
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
