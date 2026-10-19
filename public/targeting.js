// Foco suave (soft targeting) e enquadramento da câmera.
// Funções PURAS (sem DOM, sem rede): o jogo usa no navegador e os testes usam no Node.
// Unidades: casas (tiles) para posições; pixels para o tamanho da tela.

/** Raio em que o botão 🎯 procura alvos. */
export const FOCUS_RANGE = 10;
/** Passou disso (andando para longe), o foco se perde. */
export const LOSE_RANGE = 12;

export const CAMERA = {
  /** A câmera nunca se afasta mais que isto do jogador (não revela o mapa). */
  maxOffset: 5,
  /** Zoom mínimo ao enquadrar jogador + alvo (1 = normal). */
  minScale: 0.6,
  /** Folga em volta de cada um (casas): cabe o nome e a barra de vida. */
  margin: 1.2,
  /** Velocidade do lerp (maior = chega mais rápido). */
  followRate: 6,
};

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const alive = (m) => !!m && m.hp > 0 && !m.diedAt;

/**
 * Próximo alvo do botão 🎯. Lista os monstros vivos a até `range` casas, do mais perto
 * para o mais longe. Sem foco (ou foco fora da lista): o mais perto. Com foco: o seguinte
 * da lista, voltando ao primeiro no fim (ciclo). Ninguém por perto: null.
 */
export function nextTarget(me, monsters, currentId, range = FOCUS_RANGE) {
  const list = [];
  for (const m of monsters) {
    if (!alive(m)) continue;
    const d = distance(me, m);
    if (d <= range) list.push({ id: m.id, d });
  }
  if (list.length === 0) return null;
  list.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const i = list.findIndex((e) => e.id === currentId);
  return list[(i + 1) % list.length].id;
}

/** O foco continua valendo? (alvo vivo e não mais longe que `loseRange`) */
export function keepFocus(me, monster, loseRange = LOSE_RANGE) {
  return alive(monster) && distance(me, monster) <= loseRange;
}

/**
 * Enquadramento da câmera. Sem alvo: centrada no jogador, zoom normal.
 * Com alvo: centro no meio do caminho entre os dois (deslocamento máximo `maxOffset`)
 * e zoom só o necessário para os DOIS caberem na tela com folga, nunca abaixo de `minScale`.
 * Devolve o deslocamento (casas, a partir do jogador) e a escala.
 */
export function frameCamera(me, target, viewW, viewH, baseTile, opts = CAMERA) {
  if (!target) return { ox: 0, oy: 0, scale: 1 };
  const dx = target.x - me.x;
  const dy = target.y - me.y;
  let ox = dx / 2;
  let oy = dy / 2;
  const len = Math.hypot(ox, oy);
  if (len > opts.maxOffset) {
    ox *= opts.maxOffset / len;
    oy *= opts.maxOffset / len;
  }
  // Quanto precisa aparecer para cada lado do centro (jogador ou alvo, o que estiver mais longe).
  const halfX = Math.max(Math.abs(ox), Math.abs(dx - ox)) + opts.margin;
  const halfY = Math.max(Math.abs(oy), Math.abs(dy - oy)) + opts.margin;
  const tilesHalfW = viewW / baseTile / 2;
  const tilesHalfH = viewH / baseTile / 2;
  const scale = Math.max(opts.minScale, Math.min(1, tilesHalfW / halfX, tilesHalfH / halfY));
  return { ox, oy, scale };
}

/** Fator de lerp independente da taxa de quadros (60 ou 120 Hz andam igual). */
export function smoothing(dt, rate) {
  return 1 - Math.exp(-dt * rate);
}
