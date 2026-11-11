// v48: desenhos próprios dos jutsus mais marcantes e dos efeitos no alvo (Opção C). Só visual, só no cliente.
//
// Desenhados por código no Canvas, com contorno escuro e 2 ou 3 tons (o jeito do boneco): meteoro em chamas com
// sombra e cratera, relâmpago ramificado que muda a cada quadro, poça com ondas e bolhas, redemoinho, domínio de
// sombras, santuário de penas, lâminas girando, disco de vento, círculo de cura, lamaçal; e, em quem está com o
// efeito: chamas (queimadura), gotas de sangue (ferida), faíscas (paralisia), lama nos pés (lentidão), selo (silêncio),
// correntes (preso), estrelas (atordoado), gotas (molhado). Funções puras: recebem o contexto e posições em px.

const OUT = 'rgba(20, 14, 10, 0.9)';
/** Sorteio fixo por (semente, índice): o desenho treme de propósito, mas não depende de Math.random. */
export const rnd = (seed, i = 0) => { const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); };

/** Zonas com desenho próprio (pelo jutsu que criou a zona). */
export const ZONE_ART = {
  water_xarope: 'poca', water_4: 'vortice', stone_2: 'lama', shadow_4: 'dominio', shadow_armadilha: 'armadilha', illusion_templo: 'santuario',
  weapons_2: 'laminas', weapons_4: 'laminas', heal_3: 'cura', heal_aura: 'cura', water_nevoa: 'bruma', umbra_noite: 'bruma',
};
/** Golpes avisados com desenho próprio enquanto o aviso corre (e o que fica quando cai). */
export const STRIKE_ART = { fire_4: 'meteoro', lightning_4: 'trovao', wind_3: 'tornado', weapons_kunai: 'kunai', weapons_dragoes: 'armas', rubro_completo: 'onda' };
/** Efeitos no alvo que têm desenho. */
export const STATUS_ART = ['queimadura', 'ferida', 'paralisia', 'lentidao', 'silencio', 'molhado', 'sono', 'invertido'];

// ------------------------------------------------------------------ relâmpago desenhado

/** Caminho em zigue-zague de a até b; muda a cada `frame`. Devolve os pontos (para o tronco e os galhos). */
export function boltPath(x0, y0, x1, y1, seed, frame, jag = 0.16) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1, n = Math.max(3, Math.round(len / 22));
  const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
  const pts = [[x0, y0]];
  for (let i = 1; i < n; i++) {
    const k = i / n, off = (rnd(seed + frame * 7.13, i) - 0.5) * 2 * jag * Math.min(len, 160) * Math.sin(k * Math.PI);
    pts.push([x0 + (x1 - x0) * k + nx * off, y0 + (y1 - y0) * k + ny * off]);
  }
  pts.push([x1, y1]);
  return pts;
}

function strokePath(g, pts, width, color) {
  g.lineWidth = width; g.strokeStyle = color;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

/** Relâmpago: contorno escuro, borda azul, miolo amarelo e branco, com galhos. `fade` 1 a 0. */
export function drawBolt(g, x0, y0, x1, y1, T, now, seed, fade = 1, power = 1) {
  const frame = Math.floor(now / 55);
  const main = boltPath(x0, y0, x1, y1, seed, frame);
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = Math.max(0, Math.min(1, fade));
  const w = T * 0.11 * power;
  const branches = [];
  for (let b = 0; b < 3 * power; b++) {
    const i = 1 + Math.floor(rnd(seed + frame, 20 + b) * (main.length - 2));
    const [bx, by] = main[i], a = Math.atan2(y1 - y0, x1 - x0) + (rnd(seed + frame, 30 + b) - 0.5) * 2.2, L = T * (0.5 + rnd(seed, 40 + b) * 0.8) * power;
    branches.push(boltPath(bx, by, bx + Math.cos(a) * L, by + Math.sin(a) * L, seed + b * 3.7, frame, 0.3));
  }
  for (const p of [main, ...branches]) strokePath(g, p, (p === main ? w : w * 0.55) + T * 0.09, OUT);
  for (const p of [main, ...branches]) strokePath(g, p, (p === main ? w : w * 0.55) + T * 0.04, '#5aa8ff');
  for (const p of [main, ...branches]) strokePath(g, p, p === main ? w : w * 0.5, '#fff27a');
  strokePath(g, main, w * 0.4, '#ffffff');
  g.restore();
}

// ------------------------------------------------------------------ golpes avisados

/** Meteoro caindo: sombra que cresce no chão, pedra em chamas com contorno vindo do alto, rastro. k = 0 a 1. */
function meteor(g, sx, sy, r, T, k, now, seed) {
  g.save();
  // sombra do meteoro no chão
  g.fillStyle = `rgba(20, 8, 4, ${0.15 + 0.4 * k})`;
  g.beginPath(); g.ellipse(sx, sy, r * (0.25 + 0.6 * k), r * (0.2 + 0.5 * k) * 0.8, 0, 0, Math.PI * 2); g.fill();
  const h = (1 - k) * T * 7, mx = sx + h * 0.35, my = sy - h;
  const R = Math.max(5, T * 0.34);
  // rastro de fogo (3 tons)
  for (const [len, wid, color] of [[3.2, 1.25, 'rgba(200, 50, 10, 0.75)'], [2.4, 0.9, '#ff8a2a'], [1.5, 0.5, '#ffe08a']]) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(mx - R * wid * 0.7, my + R * wid * 0.25); g.lineTo(mx + R * len * 0.35 + Math.sin(now / 40 + seed) * 2, my - R * len);
    g.lineTo(mx + R * wid * 0.7, my - R * wid * 0.25); g.closePath(); g.fill();
  }
  // a pedra: contorno, corpo, luz embaixo (o lado que queima) e crateras
  g.fillStyle = OUT; g.beginPath(); g.arc(mx, my, R + 2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6a3b22'; g.beginPath(); g.arc(mx, my, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3d2014'; g.beginPath(); g.arc(mx + R * 0.25, my - R * 0.25, R * 0.72, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffb347'; g.beginPath(); g.arc(mx - R * 0.2, my + R * 0.3, R * 0.55, 0.3, Math.PI * 1.1); g.fill();
  g.fillStyle = '#24120b';
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(mx + (rnd(seed, i) - 0.5) * R, my + (rnd(seed, i + 5) - 0.6) * R, R * 0.16, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

/** Trovão do céu: nuvem escura em cima do círculo e faíscas descendo; cai no fim (o raio grande é o `impacto`). */
function thunderWarn(g, sx, sy, r, T, k, now, seed) {
  g.save();
  const cy = sy - T * 4.2;
  g.fillStyle = `rgba(30, 34, 52, ${0.5 + 0.4 * k})`;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(sx + (i - 2) * r * 0.32, cy + Math.sin(i * 1.7) * T * 0.15, r * 0.34, 0, Math.PI * 2); g.fill(); }
  g.restore();
  if (rnd(seed, Math.floor(now / 110)) < 0.35 + 0.5 * k) {
    const a = rnd(seed + 3, Math.floor(now / 110)) * Math.PI * 2, d = r * 0.7 * rnd(seed + 9, Math.floor(now / 110));
    drawBolt(g, sx + Math.cos(a) * d * 0.4, cy + T * 0.2, sx + Math.cos(a) * d, sy + Math.sin(a) * d * 0.8, T, now, seed + 11, 0.7, 0.55);
  }
}

/** Tornado: fitas claras girando num funil. */
function tornado(g, sx, sy, r, T, k, now) {
  g.save(); g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const t = i / 6, y = sy - t * T * 2.6, w = r * (0.25 + 0.75 * t) * (0.6 + 0.4 * k), ph = now / 90 + i * 0.9;
    for (const [lw, c] of [[T * 0.14, OUT], [T * 0.08, i % 2 ? '#d8fff0' : '#9fe8c8']]) {
      g.lineWidth = lw; g.strokeStyle = c; g.globalAlpha = 0.85;
      g.beginPath(); g.ellipse(sx + Math.sin(ph) * w * 0.12, y, w, w * 0.3, 0, ph, ph + Math.PI * 1.25); g.stroke();
    }
  }
  g.restore();
}

/** Arma caindo (kunai com selo, lanças): do alto até o centro; k = 0 a 1. */
function fallingBlade(g, sx, sy, T, k, big) {
  const h = (1 - k) * T * 5.5, L = T * (big ? 0.95 : 0.7);
  g.save(); g.translate(sx, sy - h); g.lineJoin = 'round';
  g.fillStyle = OUT; g.beginPath(); g.moveTo(0, 3); g.lineTo(-L * 0.2 - 2, -L * 0.55); g.lineTo(0, -L - 3); g.lineTo(L * 0.2 + 2, -L * 0.55); g.closePath(); g.fill();
  g.fillStyle = '#dfe6ec'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-L * 0.2, -L * 0.55); g.lineTo(0, -L * 0.75); g.closePath(); g.fill();
  g.fillStyle = '#8f9aa6'; g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.2, -L * 0.55); g.lineTo(0, -L * 0.75); g.closePath(); g.fill();
  g.fillStyle = '#5a3a22'; g.fillRect(-L * 0.06, -L, L * 0.12, L * 0.28);
  if (!big) { g.fillStyle = '#f4ecd8'; g.fillRect(L * 0.06, -L * 0.98, L * 0.3, L * 0.2); g.fillStyle = '#c8321a'; g.fillRect(L * 0.12, -L * 0.93, L * 0.18, L * 0.04); }
  g.restore();
}

/** O desenho de um aviso enquanto ele corre. Devolve true se desenhou. */
export function drawStrikeArt(g, skill, sx, sy, r, T, k, now, seed) {
  switch (STRIKE_ART[skill]) {
    case 'meteoro': meteor(g, sx, sy, r, T, k, now, seed); return true;
    case 'trovao': thunderWarn(g, sx, sy, r, T, k, now, seed); return true;
    case 'tornado': tornado(g, sx, sy, r, T, k, now); return true;
    case 'kunai': fallingBlade(g, sx, sy, T, k, false); return true;
    case 'armas': for (let i = 0; i < 3; i++) fallingBlade(g, sx + (i - 1) * r * 0.45, sy + (i % 2 ? -1 : 1) * r * 0.2, T, Math.min(1, k * (1 + i * 0.12)), true); return true;
    case 'onda': {
      g.save(); g.strokeStyle = 'rgba(255, 90, 40, 0.8)'; g.lineWidth = Math.max(2, T * 0.1);
      for (let i = 0; i < 3; i++) { g.globalAlpha = 0.25 + 0.5 * k; g.beginPath(); g.ellipse(sx, sy, r * ((k * 1.2 + i / 3) % 1), r * 0.85 * ((k * 1.2 + i / 3) % 1), 0, 0, Math.PI * 2); g.stroke(); }
      g.restore(); return true;
    }
    default: return false;
  }
}

/** O que fica no chão depois: cratera rachada (meteoro, soco do Golem), marca de queimado (trovão). t = 0 a 1 (some). */
export function drawDecal(g, kind, sx, sy, r, T, t, seed) {
  g.save(); g.globalAlpha = Math.max(0, 1 - t * t);
  if (kind === 'cratera') {
    g.fillStyle = 'rgba(30, 16, 10, 0.55)'; g.beginPath(); g.ellipse(sx, sy, r, r * 0.75, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(12, 6, 4, 0.6)'; g.beginPath(); g.ellipse(sx, sy + r * 0.08, r * 0.6, r * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(15, 8, 5, 0.85)'; g.lineWidth = Math.max(1.5, T * 0.05); g.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd(seed, i), L = r * (1.1 + rnd(seed, i + 9) * 0.7);
      g.beginPath(); g.moveTo(sx + Math.cos(a) * r * 0.5, sy + Math.sin(a) * r * 0.38);
      g.lineTo(sx + Math.cos(a + 0.2) * L * 0.75, sy + Math.sin(a + 0.2) * L * 0.56); g.lineTo(sx + Math.cos(a - 0.1) * L, sy + Math.sin(a - 0.1) * L * 0.75); g.stroke();
    }
    if (t < 0.35) { g.fillStyle = `rgba(255, 140, 50, ${0.5 * (1 - t / 0.35)})`; g.beginPath(); g.ellipse(sx, sy, r * 0.5, r * 0.36, 0, 0, Math.PI * 2); g.fill(); }
  } else {
    g.fillStyle = 'rgba(18, 16, 24, 0.5)'; g.beginPath(); g.ellipse(sx, sy, r, r * 0.75, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ------------------------------------------------------------------ zonas

function puddle(g, sx, sy, r, T, now, seed, mud) {
  const [dark, mid, light, shine] = mud ? ['#2e2014', '#5a4028', '#7a5a3a', 'rgba(210, 180, 140, 0.55)'] : ['#1d4a86', '#3c8fd8', '#7cc8ff', 'rgba(255, 255, 255, 0.7)'];
  g.save();
  // borda irregular: contorno escuro, corpo e a parte clara por dentro
  const blob = (k, fill) => {
    g.fillStyle = fill; g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2, w = 1 + 0.08 * Math.sin(a * 3 + seed) + 0.05 * Math.sin(a * 5 + now / 700 + seed * 2);
      const x = sx + Math.cos(a) * r * k * w, y = sy + Math.sin(a) * r * k * w * 0.82;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath(); g.fill();
  };
  g.globalAlpha = 0.92;
  blob(1.04, OUT); blob(1, dark); blob(0.9, mid); blob(0.62, light);
  // ondas que abrem
  g.strokeStyle = shine; g.lineWidth = Math.max(1, T * 0.035);
  for (let i = 0; i < 3; i++) {
    const k = ((now / 1400 + i / 3) % 1);
    g.globalAlpha = 0.6 * (1 - k);
    g.beginPath(); g.ellipse(sx + (rnd(seed, i) - 0.5) * r * 0.5, sy + (rnd(seed, i + 4) - 0.5) * r * 0.4, r * 0.5 * k, r * 0.34 * k, 0, 0, Math.PI * 2); g.stroke();
  }
  // bolhas que crescem e estouram
  for (let i = 0; i < 6; i++) {
    const k = ((now / (900 + i * 130) + rnd(seed, 20 + i)) % 1), a = rnd(seed, 30 + i) * Math.PI * 2, d = r * 0.7 * rnd(seed, 40 + i);
    const bx = sx + Math.cos(a) * d, by = sy + Math.sin(a) * d * 0.8, br = T * (0.05 + 0.09 * k);
    g.globalAlpha = k < 0.85 ? 0.9 : 0.9 * (1 - (k - 0.85) / 0.15);
    g.fillStyle = OUT; g.beginPath(); g.arc(bx, by, br + 1.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = light; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
    g.fillStyle = shine; g.beginPath(); g.arc(bx - br * 0.3, by - br * 0.3, br * 0.35, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function vortex(g, sx, sy, r, T, now) {
  g.save();
  g.fillStyle = 'rgba(18, 52, 110, 0.6)'; g.beginPath(); g.ellipse(sx, sy, r, r * 0.85, 0, 0, Math.PI * 2); g.fill();
  g.lineCap = 'round';
  for (let arm = 0; arm < 4; arm++) {
    for (const [lw, c] of [[T * 0.2, OUT], [T * 0.13, '#3c8fd8'], [T * 0.05, '#d6f0ff']]) {
      g.strokeStyle = c; g.lineWidth = lw; g.beginPath();
      for (let i = 0; i <= 18; i++) {
        const k = i / 18, a = arm * (Math.PI / 2) + k * 3.6 - now / 260, d = r * (1 - k * 0.92);
        const x = sx + Math.cos(a) * d, y = sy + Math.sin(a) * d * 0.85;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
  }
  g.fillStyle = '#0c2040'; g.beginPath(); g.ellipse(sx, sy, r * 0.12, r * 0.1, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

function shadowDomain(g, sx, sy, r, T, now, seed, trap) {
  g.save();
  const grad = g.createRadialGradient(sx, sy, r * 0.1, sx, sy, r);
  grad.addColorStop(0, 'rgba(8, 4, 16, 0.85)'); grad.addColorStop(0.8, 'rgba(26, 14, 48, 0.7)'); grad.addColorStop(1, 'rgba(26, 14, 48, 0)');
  g.fillStyle = grad; g.beginPath(); g.ellipse(sx, sy, r, r * 0.85, 0, 0, Math.PI * 2); g.fill();
  // mãos de sombra saindo do chão
  const n = trap ? 3 : 9;
  for (let i = 0; i < n; i++) {
    const a = rnd(seed, i) * Math.PI * 2, d = r * (trap ? 0.3 : 0.25 + 0.6 * rnd(seed, i + 12)), bx = sx + Math.cos(a) * d, by = sy + Math.sin(a) * d * 0.8;
    const h = T * (0.45 + 0.35 * Math.sin(now / 320 + i * 1.9)), sway = Math.sin(now / 260 + i) * T * 0.1;
    g.lineCap = 'round';
    for (const [lw, c] of [[T * 0.17, OUT], [T * 0.1, '#3b2a5c']]) {
      g.strokeStyle = c; g.lineWidth = lw;
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + sway, by - h * 0.6, bx + sway * 1.6, by - h); g.stroke();
      for (const f of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(bx + sway * 1.6, by - h); g.lineTo(bx + sway * 1.6 + f * T * 0.16, by - h - T * 0.14); g.stroke(); }
    }
  }
  g.strokeStyle = 'rgba(139, 122, 216, 0.75)'; g.lineWidth = 2; g.setLineDash([5, 6]); g.lineDashOffset = now / 70;
  g.beginPath(); g.ellipse(sx, sy, r, r * 0.85, 0, 0, Math.PI * 2); g.stroke();
  g.restore();
}

function sanctuary(g, sx, sy, r, T, k, now, seed) {
  g.save();
  g.fillStyle = 'rgba(90, 47, 176, 0.28)'; g.beginPath(); g.ellipse(sx, sy, r, r * 0.85, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#c9a8ff'; g.lineWidth = Math.max(1.5, T * 0.05);
  for (const s of [1, 0.66]) { g.beginPath(); g.ellipse(sx, sy, r * s, r * 0.85 * s, 0, 0, Math.PI * 2); g.stroke(); }
  // penas girando e caindo
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + now / 1300, d = r * (0.3 + 0.6 * rnd(seed, i)), fall = ((now / 1600 + rnd(seed, i + 7)) % 1);
    const fx = sx + Math.cos(a) * d, fy = sy + Math.sin(a) * d * 0.8 - (1 - fall) * T * 1.6, L = T * 0.32;
    g.save(); g.translate(fx, fy); g.rotate(Math.sin(now / 300 + i) * 0.7 + 0.6); g.globalAlpha = 0.35 + 0.65 * fall;
    g.fillStyle = OUT; g.beginPath(); g.ellipse(0, 0, L * 0.3 + 1.5, L + 1.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f0e6ff'; g.beginPath(); g.ellipse(0, 0, L * 0.3, L, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a072ff'; g.beginPath(); g.ellipse(L * 0.1, 0, L * 0.12, L * 0.9, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  if (k > 0.75) { g.globalAlpha = (k - 0.75) * 2.4; g.fillStyle = 'rgba(240, 216, 255, 0.5)'; g.beginPath(); g.ellipse(sx, sy, r, r * 0.85, 0, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

function blades(g, sx, sy, r, T, now) {
  g.save();
  g.strokeStyle = 'rgba(201, 210, 218, 0.35)'; g.lineWidth = 2; g.beginPath(); g.ellipse(sx, sy, r, r * 0.85, 0, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + now / 170, bx = sx + Math.cos(a) * r * 0.86, by = sy + Math.sin(a) * r * 0.73, L = T * 0.42;
    g.save(); g.translate(bx, by); g.rotate(a + Math.PI / 2 + now / 60);
    g.fillStyle = OUT; g.beginPath(); g.moveTo(0, -L - 2); g.lineTo(L * 0.3 + 2, 0); g.lineTo(0, L + 2); g.lineTo(-L * 0.3 - 2, 0); g.closePath(); g.fill();
    g.fillStyle = '#e6edf2'; g.beginPath(); g.moveTo(0, -L); g.lineTo(L * 0.3, 0); g.lineTo(0, L); g.closePath(); g.fill();
    g.fillStyle = '#8f9aa6'; g.beginPath(); g.moveTo(0, -L); g.lineTo(-L * 0.3, 0); g.lineTo(0, L); g.closePath(); g.fill();
    g.restore();
    // o risco do corte atrás da lâmina
    g.strokeStyle = 'rgba(255, 255, 255, 0.5)'; g.lineWidth = Math.max(1.5, T * 0.05);
    g.beginPath(); g.ellipse(sx, sy, r * 0.86, r * 0.73, 0, a - 0.5, a); g.stroke();
  }
  g.restore();
}

function healCircle(g, sx, sy, r, T, now) {
  g.save();
  g.fillStyle = 'rgba(60, 190, 100, 0.2)'; g.beginPath(); g.ellipse(sx, sy, r, r * 0.85, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#8cf0a0'; g.lineWidth = Math.max(1.5, T * 0.05);
  g.beginPath(); g.ellipse(sx, sy, r, r * 0.85, 0, 0, Math.PI * 2); g.stroke();
  g.setLineDash([T * 0.18, T * 0.14]); g.lineDashOffset = -now / 50;
  g.beginPath(); g.ellipse(sx, sy, r * 0.72, r * 0.61, 0, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  // a cruz no centro e folhas em volta
  const c = Math.min(r * 0.3, T * 0.5), w = c * 0.36, pulse = 0.75 + 0.25 * Math.sin(now / 240);
  g.globalAlpha = pulse;
  g.fillStyle = OUT; g.fillRect(sx - w / 2 - 2, sy - c - 2, w + 4, c * 2 + 4); g.fillRect(sx - c - 2, sy - w / 2 - 2, c * 2 + 4, w + 4);
  g.fillStyle = '#d8ffe0'; g.fillRect(sx - w / 2, sy - c, w, c * 2); g.fillRect(sx - c, sy - w / 2, c * 2, w);
  g.globalAlpha = 1;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - now / 900, lx = sx + Math.cos(a) * r * 0.86, ly = sy + Math.sin(a) * r * 0.73;
    g.save(); g.translate(lx, ly); g.rotate(a);
    g.fillStyle = OUT; g.beginPath(); g.ellipse(0, 0, T * 0.17, T * 0.09, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5fe07a'; g.beginPath(); g.ellipse(0, 0, T * 0.14, T * 0.065, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.restore();
}

function mist(g, sx, sy, r, T, now, seed) {
  g.save();
  for (let i = 0; i < 9; i++) {
    const a = rnd(seed, i) * Math.PI * 2 + now / (2600 + i * 200), d = r * 0.6 * rnd(seed, i + 9);
    g.fillStyle = `rgba(20, 22, 34, ${0.22 + 0.1 * Math.sin(now / 500 + i)})`;
    g.beginPath(); g.ellipse(sx + Math.cos(a) * d, sy + Math.sin(a) * d * 0.8, r * 0.5, r * 0.36, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

/** O desenho próprio de uma zona. Devolve true se desenhou (quem chama não desenha o círculo genérico). */
export function drawZoneArt(g, skill, sx, sy, r, T, k, now, seed) {
  switch (ZONE_ART[skill]) {
    case 'poca': puddle(g, sx, sy, r, T, now, seed, false); return true;
    case 'lama': puddle(g, sx, sy, r, T, now, seed, true); return true;
    case 'vortice': vortex(g, sx, sy, r, T, now); return true;
    case 'dominio': shadowDomain(g, sx, sy, r, T, now, seed, false); return true;
    case 'armadilha': shadowDomain(g, sx, sy, r, T, now, seed, true); return true;
    case 'santuario': sanctuary(g, sx, sy, r, T, k, now, seed); return true;
    case 'laminas': blades(g, sx, sy, r, T, now); return true;
    case 'cura': healCircle(g, sx, sy, r, T, now); return true;
    case 'bruma': mist(g, sx, sy, r, T, now, seed); return true;
    default: return false;
  }
}

/** Disco do Furacão voando: anéis girando com lâminas de vento. */
export function drawWindDisc(g, sx, sy, T, now) {
  g.save(); g.translate(sx, sy);
  const R = T * 0.5;
  g.fillStyle = OUT; g.beginPath(); g.ellipse(0, 0, R + 2, R * 0.7 + 2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9fe8c8'; g.beginPath(); g.ellipse(0, 0, R, R * 0.7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8fff6'; g.beginPath(); g.ellipse(0, 0, R * 0.55, R * 0.38, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = OUT; g.lineWidth = Math.max(1.5, T * 0.05); g.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const a = now / 45 + i * (Math.PI / 2); g.beginPath(); g.ellipse(0, 0, R * 0.8, R * 0.56, 0, a, a + 0.9); g.stroke(); }
  g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1, T * 0.03);
  for (let i = 0; i < 4; i++) { const a = now / 45 + i * (Math.PI / 2) + 0.2; g.beginPath(); g.ellipse(0, 0, R * 1.25, R * 0.9, 0, a, a + 0.7); g.stroke(); }
  g.restore();
}

// ------------------------------------------------------------------ efeitos no alvo

function flame(g, x, y, h, now, ph) {
  const f = 0.8 + 0.2 * Math.sin(now / 70 + ph), w = h * 0.42;
  for (const [k, c] of [[1.18, OUT], [1, '#e8421a'], [0.7, '#ff9a3c'], [0.4, '#ffe08a']]) {
    g.fillStyle = c; g.beginPath();
    g.moveTo(x - w * k, y); g.quadraticCurveTo(x - w * k * 1.1, y - h * k * 0.55 * f, x + Math.sin(now / 90 + ph) * w * 0.4, y - h * k * f);
    g.quadraticCurveTo(x + w * k * 1.1, y - h * k * 0.55 * f, x + w * k, y); g.closePath(); g.fill();
  }
}

function drop(g, x, y, s, color, light) {
  g.fillStyle = OUT; g.beginPath(); g.moveTo(x, y - s * 1.5 - 1.5); g.quadraticCurveTo(x + s + 1.5, y, x, y + s + 1.5); g.quadraticCurveTo(x - s - 1.5, y, x, y - s * 1.5 - 1.5); g.fill();
  g.fillStyle = color; g.beginPath(); g.moveTo(x, y - s * 1.5); g.quadraticCurveTo(x + s, y, x, y + s); g.quadraticCurveTo(x - s, y, x, y - s * 1.5); g.fill();
  g.fillStyle = light; g.beginPath(); g.arc(x - s * 0.25, y + s * 0.1, s * 0.3, 0, Math.PI * 2); g.fill();
}

/**
 * Os efeitos que o alvo tem agora, desenhados nele. `fx` = { efeito: até quando }; `rooted`/`stunned` = preso/atordoado.
 * (sx, sy) = centro do corpo na tela. Devolve quantos desenhou.
 */
export function drawStatusArt(g, fx, rooted, stunned, sx, sy, T, now, seed) {
  const on = (code) => fx && fx[code] > now;
  let n = 0;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  if (on('lentidao')) {                                   // lama nos pés
    n++;
    g.fillStyle = OUT; g.beginPath(); g.ellipse(sx, sy + T * 0.42, T * 0.44, T * 0.17, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a4028'; g.beginPath(); g.ellipse(sx, sy + T * 0.42, T * 0.4, T * 0.14, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a5a3a';
    for (let i = 0; i < 3; i++) { const k = ((now / 700 + i / 3) % 1); g.beginPath(); g.arc(sx + (i - 1) * T * 0.2, sy + T * 0.4 - k * T * 0.12, T * 0.05 * (1 - k * 0.5), 0, Math.PI * 2); g.fill(); }
  }
  if (rooted) {                                           // correntes de sombra nos pés
    n++;
    for (let i = 0; i < 2; i++) {
      for (const [lw, c] of [[T * 0.13, OUT], [T * 0.07, '#8b7ad8']]) {
        g.strokeStyle = c; g.lineWidth = lw;
        g.beginPath(); g.ellipse(sx, sy + T * (0.2 + i * 0.17), T * 0.3, T * 0.1, 0, i ? Math.PI : 0, i ? Math.PI * 2 : Math.PI); g.stroke();
      }
    }
  }
  if (on('queimadura')) {                                 // chamas no corpo
    n++;
    for (let i = 0; i < 3; i++) flame(g, sx + (i - 1) * T * 0.2, sy + T * (0.12 - (i === 1 ? 0.5 : 0.1)), T * (0.3 + 0.08 * (i === 1)), now, seed + i * 2.1);
  }
  if (on('ferida')) {                                     // sangrando: gotas vermelhas que pingam
    n++;
    for (let i = 0; i < 3; i++) {
      const k = ((now / 800 + i / 3 + rnd(seed, i)) % 1);
      g.globalAlpha = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
      drop(g, sx + (i - 1) * T * 0.17 + T * 0.05, sy - T * 0.1 + k * T * 0.55, T * 0.055, '#c8201a', '#ff8a7a');
    }
    g.globalAlpha = 1;
  }
  if (on('molhado')) {                                    // gotas azuis escorrendo
    n++;
    for (let i = 0; i < 2; i++) {
      const k = ((now / 900 + i / 2 + rnd(seed, i + 3)) % 1);
      g.globalAlpha = 1 - k * 0.6;
      drop(g, sx + (i ? 1 : -1) * T * 0.24, sy - T * 0.3 + k * T * 0.6, T * 0.045, '#3c8fd8', '#d6f0ff');
    }
    g.globalAlpha = 1;
  }
  if (on('paralisia')) {                                  // faíscas correndo pelo corpo
    n++;
    for (let i = 0; i < 2; i++) {
      const f = Math.floor(now / 90) + i * 5, a = rnd(seed, f) * Math.PI * 2, x0 = sx + Math.cos(a) * T * 0.3, y0 = sy + Math.sin(a) * T * 0.4;
      drawBolt(g, x0, y0, x0 + (rnd(seed, f + 1) - 0.5) * T * 0.5, y0 + (rnd(seed, f + 2) - 0.5) * T * 0.5, T, now, seed + i, 0.9, 0.4);
    }
  }
  if (on('silencio')) {                                   // selo em cima da cabeça
    n++;
    const y = sy - T * 0.95 + Math.sin(now / 300) * T * 0.03, w = T * 0.3, h = T * 0.36;
    g.fillStyle = OUT; g.fillRect(sx - w / 2 - 1.5, y - h / 2 - 1.5, w + 3, h + 3);
    g.fillStyle = '#f4ecd8'; g.fillRect(sx - w / 2, y - h / 2, w, h);
    g.strokeStyle = '#c8321a'; g.lineWidth = Math.max(1.5, T * 0.05);
    g.beginPath(); g.moveTo(sx - w * 0.28, y - h * 0.28); g.lineTo(sx + w * 0.28, y + h * 0.28); g.moveTo(sx + w * 0.28, y - h * 0.28); g.lineTo(sx - w * 0.28, y + h * 0.28); g.stroke();
  }
  if (stunned || on('invertido')) {                       // estrelas girando em cima da cabeça
    n++;
    for (let i = 0; i < 3; i++) {
      const a = now / 240 + i * ((Math.PI * 2) / 3), x = sx + Math.cos(a) * T * 0.3, y = sy - T * 0.92 + Math.sin(a) * T * 0.09, s = T * 0.075;
      g.fillStyle = OUT; g.beginPath(); g.arc(x, y, s + 1.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = on('invertido') ? '#c9a8ff' : '#ffe08a';
      g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.35, y - s * 0.3); g.lineTo(x + s, y); g.lineTo(x + s * 0.35, y + s * 0.3); g.lineTo(x, y + s); g.lineTo(x - s * 0.35, y + s * 0.3); g.lineTo(x - s, y); g.lineTo(x - s * 0.35, y - s * 0.3); g.closePath(); g.fill();
    }
  }
  if (on('sono')) {                                       // Z subindo
    n++;
    g.font = `800 ${Math.round(T * 0.3)}px system-ui, sans-serif`; g.textAlign = 'center';
    for (let i = 0; i < 2; i++) {
      const k = ((now / 1400 + i / 2) % 1);
      g.globalAlpha = 1 - k; g.lineWidth = 3; g.strokeStyle = OUT; g.fillStyle = '#d6efff';
      g.strokeText('z', sx + T * 0.3 + k * T * 0.2, sy - T * 0.6 - k * T * 0.5); g.fillText('z', sx + T * 0.3 + k * T * 0.2, sy - T * 0.6 - k * T * 0.5);
    }
  }
  g.restore();
  return n;
}
