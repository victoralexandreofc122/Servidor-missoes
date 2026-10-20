// Predição no cliente + reconciliação com o servidor (movimento do próprio jogador).
//
// Com ~200 ms de ida e volta até o servidor, esperar a resposta para andar dá "input lag".
// Então o cliente anda NA HORA, com a mesma função do servidor (movement.js), e guarda as
// entradas que o servidor ainda não confirmou:
//
//   1. a cada tick (50 ms, igual ao servidor) com o joystick inclinado, cria uma ENTRADA
//      numerada {seq, dx, dy}, aplica na posição prevista e põe na fila de pendentes;
//   2. manda as entradas em lotes de 2 (10 mensagens/s andando; nada parado);
//   3. quando chega a posição oficial com `ack` (última entrada aplicada pelo servidor),
//      descarta as pendentes confirmadas e REFAZ as que faltam a partir da posição oficial;
//   4. diferença pequena (atraso de rede, arredondamento): some suave em ~0,1 s;
//      diferença grande (servidor recusou: parede, trapaça, teleporte): pula na hora.
//
// Sem DOM: o jogo usa no navegador e os testes ligam isto a um servidor de verdade.

import { replay, stepMove } from './movement.js';

/** Acima disto (casas) a correção é imediata; abaixo, suave. */
export const SNAP_DISTANCE = 1.5;
/** Velocidade com que a correção suave some (por segundo). */
export const SMOOTH_RATE = 12;
/** Entradas por mensagem (o servidor aceita até 10). */
export const BATCH = 2;
/** Fila de pendentes nunca passa disto (sem conexão, não cresce sem fim). */
export const MAX_PENDING = 200;

/** Joystick em passos de 0,05 (e sem "-0"): o que vai para o servidor é o que o cliente simulou. */
export const quantize = (v) => Math.round(v * 20) / 20 || 0;

export class Predictor {
  constructor() {
    this.reset(0, 0);
  }

  /** Posição oficial nova sem histórico (entrou, reconectou, renasceu). */
  reset(x, y) {
    this.x = x;
    this.y = y;
    this.seq = 0;
    this.pending = [];
    this.outbox = [];
    this.acc = 0;
    this.offX = 0;
    this.offY = 0;
    this.stats = { smooth: 0, snap: 0, maxError: 0, lastError: 0 };
  }

  /** Recomeça só a posição (renascer), mantendo a numeração (o servidor confirma as antigas). */
  teleport(x, y) {
    this.x = x;
    this.y = y;
    this.pending = [];
    this.outbox = [];
    this.offX = 0;
    this.offY = 0;
  }

  /**
   * Avança o relógio do cliente. A cada tick completo com direção: cria a entrada, ANDA
   * (predição) e põe no lote. Devolve as mensagens para mandar ao servidor (pode ser []).
   * world = { width, height, walls, tickMs }; speed = a velocidade que o servidor mandou.
   */
  advance(dtMs, dx, dy, speed, world, canMove) {
    const out = [];
    const moving = canMove && (dx !== 0 || dy !== 0);
    this.acc = Math.min(this.acc + dtMs, world.tickMs * 5);   // aba em segundo plano não acumula sem fim
    while (this.acc >= world.tickMs) {
      this.acc -= world.tickMs;
      if (!moving) continue;
      const input = { seq: ++this.seq, dx, dy, dist: (speed * world.tickMs) / 1000 };
      [this.x, this.y] = stepMove(this.x, this.y, dx, dy, input.dist, world.width, world.height, world.walls);
      this.pending.push(input);
      this.outbox.push(input);
      if (this.outbox.length >= BATCH) out.push(this.flush());
    }
    if (this.outbox.length > 0 && !moving) out.push(this.flush());   // soltou: manda já o que sobrou
    if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
    return out;
  }

  flush() {
    const msg = { type: 'input', seq: this.outbox[0].seq, inputs: this.outbox.map((i) => [i.dx, i.dy]) };
    this.outbox = [];
    return msg;
  }

  /**
   * Reconciliação. (sx, sy) = posição OFICIAL depois da entrada `ack`.
   * Devolve 'none' (previsão certa), 'smooth' (corrigiu suave) ou 'snap' (pulou).
   */
  reconcile(sx, sy, ack, world) {
    let i = 0;
    while (i < this.pending.length && this.pending[i].seq <= ack) i++;
    if (i > 0) this.pending.splice(0, i);
    const [rx, ry] = replay(sx, sy, this.pending, (p) => p.dist, world.width, world.height, world.walls);
    const ex = this.x - rx, ey = this.y - ry;
    const err = Math.sqrt(ex * ex + ey * ey);
    this.stats.lastError = err;
    if (err > this.stats.maxError) this.stats.maxError = err;
    this.x = rx;
    this.y = ry;
    if (err > SNAP_DISTANCE) {               // servidor recusou de verdade: vai direto para lá
      this.offX = 0;
      this.offY = 0;
      this.stats.snap += 1;
      return 'snap';
    }
    if (err > 0.0005) {                      // diferença pequena: o desenho continua de onde estava e escorrega
      this.offX += ex;
      this.offY += ey;
      this.stats.smooth += 1;
      return 'smooth';
    }
    return 'none';
  }

  /**
   * Onde desenhar o boneco AGORA: a posição prevista + o pedaço do tick em andamento
   * (resposta no mesmo quadro em que o polegar mexe) + a correção suave, que vai sumindo.
   */
  view(dtMs, dx, dy, speed, world, canMove) {
    const k = Math.exp((-dtMs / 1000) * SMOOTH_RATE);
    this.offX *= k;
    this.offY *= k;
    if (Math.abs(this.offX) < 0.0005) this.offX = 0;
    if (Math.abs(this.offY) < 0.0005) this.offY = 0;
    let vx = this.x, vy = this.y;
    if (canMove && (dx !== 0 || dy !== 0) && this.acc > 0) {
      [vx, vy] = stepMove(this.x, this.y, dx, dy, (speed * this.acc) / 1000, world.width, world.height, world.walls);
    }
    return [vx + this.offX, vy + this.offY];
  }
}

/**
 * Interpolação dos OUTROS jogadores: desenha cada um ~100 ms no passado, entre duas
 * posições que já chegaram do servidor (nunca "teleporta" entre um aviso e outro).
 */
export const INTERP_DELAY_MS = 100;

export function pushSnapshot(buf, t, x, y, tickMs) {
  const last = buf[buf.length - 1];
  // Estava parado há tempo: âncora 1 tick antes, para o movimento começar do lugar certo.
  if (last && t - last.t > INTERP_DELAY_MS * 2.5) buf.push({ t: t - tickMs, x: last.x, y: last.y });
  buf.push({ t, x, y });
  while (buf.length > 2 && buf[1].t < t - 1000) buf.shift();   // guarda ~1 s
  if (buf.length > 30) buf.splice(0, buf.length - 30);
}

/** Posição para desenhar no instante `t` (já com o atraso de interpolação aplicado). */
export function sampleSnapshots(buf, t) {
  if (buf.length === 0) return null;
  const rt = t - INTERP_DELAY_MS;
  if (rt <= buf[0].t) return [buf[0].x, buf[0].y];
  for (let i = buf.length - 1; i > 0; i--) {
    const a = buf[i - 1], b = buf[i];
    if (rt >= a.t) {
      if (rt >= b.t) return [b.x, b.y];        // chegou na última posição: espera a próxima
      const f = (rt - a.t) / (b.t - a.t || 1);
      return [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f];
    }
  }
  return [buf[0].x, buf[0].y];
}
