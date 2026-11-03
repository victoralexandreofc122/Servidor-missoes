/*
 * Catálogo de peças dos mapas feitos por código (v29, piloto na Floresta). Cada peça é definida UMA vez e dela sai
 * tudo: o PÉ (a única parte que colide, uma caixa pequena no chão) e o desenho (o cliente desenha o corpo e o topo a
 * partir do mesmo ponto do pé). Assim o que se vê e o que bloqueia não se separam.
 *
 *   tree   árvore de copa redonda: pé = o tronco (0,3 x tamanho de largura); a copa não colide e fica translúcida com
 *          o ninja atrás dela
 *
 * A mata fechada (`thicket`) é a massa de árvores que não se atravessa: colide inteira, e as árvores da borda dela
 * (peças) têm o pé exatamente na linha da colisão. O ninja para onde está o tronco, e não antes nem depois.
 */
import type { Box } from './movement.js';

export type PieceKind = 'tree' | 'pine';

export interface Piece {
  k: PieceKind;
  /** O pé: centro em x, base (chão) em y. */
  x: number;
  y: number;
  /** Tamanho em casas (a árvore tem a copa com ~`size` casas de largura). */
  size: number;
  /** Semente do desenho (variação de cor e forma). */
  seed: number;
  /** Na borda da mata fechada: o pé fica dentro da colisão da mata (não gera parede própria). */
  edge?: boolean;
}

/** Pé de cada peça (casas): largura em fração do tamanho e altura fixa. */
export const PIECE_FOOT: Readonly<Record<PieceKind, { w: number; h: number }>> = {
  tree: { w: 0.18, h: 0.35 },   // o tronco desenhado tem 0,16 x tamanho de largura
  pine: { w: 0.14, h: 0.3 },
};

/** A caixa do pé (a colisão da peça). */
export function footBox(p: Piece): Box {
  const f = PIECE_FOOT[p.k];
  const w = Math.round(f.w * p.size * 100) / 100;
  return { x: Math.round((p.x - w / 2) * 100) / 100, y: Math.round((p.y - f.h) * 100) / 100, w, h: f.h };
}

/** Sorteio previsível (a mesma Floresta em todo servidor). */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const inside = (b: Box, x: number, y: number) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;

/**
 * Árvores na borda da mata fechada: em cada lado de um bloco da mata que dá para um lugar aberto, uma fileira de
 * árvores com o pé na linha da colisão (a parte de baixo do tronco encosta na borda do bloco). As copas passam para o
 * lado aberto e não colidem.
 */
export function thicketEdge(blocks: readonly Box[], solid: readonly Box[], W: number, H: number, seed = 7): Piece[] {
  const r = seeded(seed);
  const out: Piece[] = [];
  const free = (x: number, y: number) => x > 0 && y > 0 && x < W && y < H && !solid.some((b) => inside(b, x, y));
  const put = (x: number, y: number) => out.push({ k: 'tree', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, size: Math.round((1.7 + r() * 0.6) * 10) / 10, seed: Math.floor(r() * 1000), edge: true });
  for (const b of blocks) {
    const step = () => 1.5 + r() * 0.5;
    // embaixo (o lado aberto está ao sul): o pé na borda de baixo; a copa sobe para dentro da mata
    for (let x = b.x + 0.7; x < b.x + b.w - 0.5; x += step()) if (free(x, b.y + b.h + 0.3)) put(x, b.y + b.h);
    // em cima (aberto ao norte): o pé logo dentro da borda; a copa passa por cima do caminho
    for (let x = b.x + 0.7; x < b.x + b.w - 0.5; x += step()) if (free(x, b.y - 0.3)) put(x, b.y + 0.05);   // tronco NA linha (sem parede antes dele)
    // dos lados: o tronco encostado na borda
    for (let y = b.y + 1.2; y < b.y + b.h - 0.2; y += step()) {
      if (free(b.x - 0.3, y)) put(b.x + 0.25, y);
      if (free(b.x + b.w + 0.3, y)) put(b.x + b.w - 0.25, y);
    }
  }
  return out;
}

/** Árvores soltas num lugar aberto, longe das paredes e dos caminhos: estas colidem só no pé (o tronco). */
export function looseTrees(spots: readonly Box[], avoid: readonly Box[], count: number, seed = 11): Piece[] {
  const r = seeded(seed);
  const out: Piece[] = [];
  const clear = (x: number, y: number) => !avoid.some((b) => x > b.x - 4 && x < b.x + b.w + 4 && y > b.y - 4 && y < b.y + b.h + 5)
    && !out.some((p) => Math.hypot(p.x - x, p.y - y) < 4);
  for (let i = 0; i < count * 30 && out.length < count; i++) {
    const s = spots[Math.floor(r() * spots.length)]!;
    const x = s.x + 2 + r() * Math.max(0, s.w - 4), y = s.y + 2.5 + r() * Math.max(0, s.h - 4);
    if (clear(x, y)) out.push({ k: 'tree', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, size: Math.round((1.6 + r() * 0.5) * 10) / 10, seed: Math.floor(r() * 1000) });
  }
  return out;
}

/**
 * v29 (pedido do Victor): árvores ESPALHADAS ao acaso dentro das regiões de mata, nunca muito juntas (`minDist` casas
 * entre os troncos), para dar para passar entre elas. Cada uma colide só no tronco. Evita as caixas de `avoid` (com
 * folga de `margin`) e os lugares abertos `keepOpen` (clareiras e trilhas ficam livres).
 */
export function scatterTrees(regions: readonly Box[], keepOpen: readonly Box[], avoid: readonly Box[], minDist: number, seed = 13, margin = 1.5): Piece[] {
  const r = seeded(seed);
  const out: Piece[] = [];
  const area = regions.reduce((s, b) => s + b.w * b.h, 0);
  const tries = Math.ceil(area / (minDist * minDist)) * 12;
  const total = regions.reduce((s, b) => s + b.w * b.h, 0);
  for (let i = 0; i < tries; i++) {
    // sorteia uma região pelo tamanho e um ponto nela
    let pick = r() * total, b = regions[0]!;
    for (const reg of regions) { pick -= reg.w * reg.h; if (pick <= 0) { b = reg; break; } }
    const x = b.x + r() * b.w, y = b.y + 0.5 + r() * Math.max(0, b.h - 0.5);
    if (keepOpen.some((o) => x > o.x - 0.6 && x < o.x + o.w + 0.6 && y > o.y - 0.3 && y < o.y + o.h + 1.2)) continue;
    if (avoid.some((o) => x > o.x - margin && x < o.x + o.w + margin && y > o.y - margin && y < o.y + o.h + margin + 1)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < minDist)) continue;
    const pine = r() < 0.3;                                    // v29: 30% de pinheiros, mais altos e finos
    out.push({ k: pine ? 'pine' : 'tree', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, size: Math.round(((pine ? 3.6 : 3.2) + r() * 0.9) * 10) / 10, seed: Math.floor(r() * 1000) });   // v29: bem maiores que o ninja
  }
  return out;
}

/**
 * v29 (revisão EGM, rodada 3): a borda da mata fechada vira ÁRVORES INTEIRAS (tronco e copa), em 2 fileiras tortas,
 * no lugar do bloco reto de copas. O pé fica dentro da colisão da mata (a fileira da frente com o tronco na linha da
 * borda); o miolo da mata segue escuro. `edge` marca que a árvore não tem colisão própria.
 */
export function thicketRows(blocks: readonly Box[], solid: readonly Box[], W: number, H: number, seed = 29): Piece[] {
  const r = seeded(seed);
  const out: Piece[] = [];
  const free = (x: number, y: number) => x > 0 && y > 0 && x < W && y < H && !solid.some((b) => inside(b, x, y));
  const put = (x: number, y: number, b: Box) => {
    if (!inside(b, x, y - 0.01) && !(y === b.y + b.h)) return;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 1.5)) return;
    const pine = r() < 0.35;
    out.push({ k: pine ? 'pine' : 'tree', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, size: Math.round(((pine ? 3.4 : 3) + r() * 0.8) * 10) / 10, seed: Math.floor(r() * 1000), edge: true });
  };
  for (const b of blocks) {
    const step = () => 1.7 + r() * 0.7;
    for (const [depth, off] of [[0.15, 0], [1.9, 0.9]] as const) {
      // embaixo (aberto ao sul): a fileira da frente com o pé na borda
      for (let x = b.x + 0.5 + off; x < b.x + b.w - 0.3; x += step()) if (free(x, b.y + b.h + 0.4)) put(x + (r() - 0.5) * 0.5, b.y + b.h - depth + (r() - 0.5) * 0.3, b);
      // em cima (aberto ao norte)
      for (let x = b.x + 0.5 + off; x < b.x + b.w - 0.3; x += step()) if (free(x, b.y - 0.4)) put(x + (r() - 0.5) * 0.5, b.y + 0.3 + depth, b);
      // dos lados
      for (let y = b.y + 1 + off; y < b.y + b.h; y += step()) {
        if (free(b.x - 0.4, y)) put(b.x + 0.3 + depth, y, b);
        if (free(b.x + b.w + 0.4, y)) put(b.x + b.w - 0.3 - depth, y, b);
      }
    }
  }
  return out;
}
