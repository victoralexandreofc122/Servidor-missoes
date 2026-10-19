import { randomUUID } from 'node:crypto';
import { REALTIME, type RealtimeConfig } from '../../src/realtime/config.js';
import { GameWorld, type Connection, type Progression } from '../../src/realtime/gameWorld.js';

/** Conexão falsa: guarda o que o servidor mandou e como fechou. */
export class FakeConn implements Connection {
  readonly sent: any[] = [];
  closed?: { code: number; reason: string };
  bufferedAmount = 0;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code: number, reason: string) {
    this.closed ??= { code, reason };
  }
  of(type: string) {
    return this.sent.filter((m) => m.type === type);
  }
  last(type: string) {
    return this.of(type).at(-1);
  }
  clear() {
    this.sent.length = 0;
  }
}

/** Config com N monstros (0 = mundo sem monstros, para testes de movimento e chat). */
export function withMonsters(count: number, base: RealtimeConfig = REALTIME): RealtimeConfig {
  return { ...base, combat: { ...base.combat, monsters: { ...base.combat.monsters, count } } };
}

/** Sorteio previsível (LCG) para os testes. */
export function seededRandom(seed = 42) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function setupWorld(config: RealtimeConfig = withMonsters(0), progression?: Progression) {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const world = new GameWorld(config, clock.now, undefined, { random: seededRandom(), ...(progression ? { progression } : {}) });
  const connect = (username: string, extra: { xp?: number } = {}) => {
    const conn = new FakeConn();
    const id = randomUUID();
    const handle = world.join({ id, username, ...extra }, conn);
    const send = (msg: unknown) => handle.receive(JSON.stringify(msg));
    return { id, conn, handle, send };
  };
  /** Roda o game loop por `ms` (ticks de 50 ms). */
  const run = (ms: number) => {
    for (let x = 0; x < ms; x += config.tickMs) {
      clock.advance(config.tickMs);
      world.tick();
    }
  };
  const pos = (id: string) => {
    const p = world.players().find((q) => q.id === id)!;
    return { x: p.x, y: p.y };
  };
  return { world, clock, connect, run, pos, config };
}
