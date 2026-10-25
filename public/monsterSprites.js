// Monstros em sprites (v19): um atlas por tipo (arte/monstros/recortar.py, estilo "tinta e brasa") e a animação que
// toca agora. O servidor manda os fatos (bateu, marcou o golpe, caiu, mudou de fase, morreu); aqui só se escolhe o
// quadro. Enquanto o atlas não carrega (ou num tipo sem arte), o jogo desenha o slime antigo.
//
// Animações (nem todo tipo tem todas): idle, move, attack, hit, death, leap_windup / leap_land (golpe marcado),
// summon, fury, fury_idle, crush_windup / crush_hit (Rei Lodo). O desenho olha para a direita; virado = espelhado.

import { MONSTER_ART, PX_PER_TILE } from './monsterData.js';

const sheets = new Map();

/** Começa a carregar os atlas (uma vez). */
export function loadMonsterSprites() {
  for (const [type, art] of Object.entries(MONSTER_ART)) {
    if (sheets.has(type)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = `/${art.file}`;
    sheets.set(type, img);
  }
}

/** Arte pronta para desenhar este tipo? */
export function monsterArtReady(type) {
  const img = sheets.get(type);
  return !!(img && img.complete && img.naturalWidth > 0 && MONSTER_ART[type]);
}

const animMs = (a) => (a.frames.length * 1000) / a.fps;

/**
 * Toca uma animação no monstro. `holdMs`: as que seguram um quadro (o preparo do golpe marcado) duram isso; as outras
 * tocam uma vez e voltam para o parado. Uma animação que o tipo não tem é ignorada.
 */
export function playMonster(m, name, now, holdMs = 0) {
  const a = MONSTER_ART[m.type]?.anims[name];
  if (!a) return false;
  m.anim = { name, start: now, until: now + (a.loop ? holdMs : animMs(a)) };
  return true;
}

/** Quanto tempo o corpo fica na tela depois de morrer (a animação e o sumiço). */
export function monsterDeathMs(type) {
  const a = MONSTER_ART[type]?.anims.death;
  return monsterArtReady(type) && a ? animMs(a) + 400 : 450;
}

/** Quadro (índice no atlas) e transparência para agora. */
function pick(m, art, now) {
  const at = (name, start, loop) => {
    const a = art.anims[name];
    const k = Math.floor(((now - start) * a.fps) / 1000);
    return a.frames[loop ? ((k % a.frames.length) + a.frames.length) % a.frames.length : Math.min(a.frames.length - 1, Math.max(0, k))];
  };
  if (m.diedAt && art.anims.death) {
    const fade = Math.max(0, now - m.diedAt - animMs(art.anims.death));
    return { frame: at('death', m.diedAt, false), alpha: Math.max(0, 1 - fade / 400) };
  }
  if (m.anim && now < m.anim.until && art.anims[m.anim.name]) return { frame: at(m.anim.name, m.anim.start, art.anims[m.anim.name].loop), alpha: 1 };
  const moving = Math.hypot((m.tx ?? m.x) - m.x, (m.ty ?? m.y) - m.y) > 0.04;
  // Fase própria por monstro: dois slimes lado a lado não respiram juntos.
  const phase = (m.seed || 0) * 137;
  if (moving && art.anims.move) return { frame: at('move', -phase, true), alpha: 1 };
  if (m.furious && art.anims.fury_idle) return { frame: at('fury_idle', -phase, true), alpha: 1 };
  return { frame: at('idle', -phase, true), alpha: 1 };
}

/**
 * Desenha o monstro com o pé em (sx, groundY). `T` = pixels de uma casa na tela; `grow` = 0 a 1 (nascendo).
 * Devolve a altura da arte na tela (para a barra de vida e os ícones) ou null sem arte.
 */
export function drawMonsterArt(ctx, m, sx, groundY, T, now, grow = 1) {
  const art = MONSTER_ART[m.type];
  if (!art || !monsterArtReady(m.type)) return null;
  const img = sheets.get(m.type);
  const { frame, alpha } = pick(m, art, now);
  const [x, y, w, h, ax, ay] = art.frames[frame];
  const k = (T / PX_PER_TILE) * grow;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(Math.round(sx), Math.round(groundY));
  ctx.scale((m.face || 1) * k, k);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, x, y, w, h, -ax, -ay, w, h);
  ctx.restore();
  return art.height * T * grow;
}

/** O retrato do alvo focado: o quadro parado de frente, centrado no canvas. */
export function drawMonsterPortrait(g, type, size) {
  const art = MONSTER_ART[type];
  if (!art || !monsterArtReady(type)) return false;
  const [x, y, w, h] = art.frames[art.anims.idle.frames[0]];
  const k = (size * 0.86) / Math.max(w, h);
  g.imageSmoothingEnabled = true;
  g.drawImage(sheets.get(type), x, y, w, h, (size - w * k) / 2, (size - h * k) / 2 + size * 0.04, w * k, h * k);
  return true;
}
