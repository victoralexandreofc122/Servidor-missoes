import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { DAY_MS } from '../src/realtime/calendar.js';
import type { ChampionKind, ChampionPending, ChampionStore, ChampionTournament } from '../src/realtime/championStore.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { DUEL } from '../src/realtime/duel.js';
import { GameWorld } from '../src/realtime/gameWorld.js';
import type { SeasonView } from '../src/realtime/seasonStore.js';
import type { BracketMatch } from '../src/realtime/tournament.js';
import { FakeConn, seededRandom } from './support/world.js';

/* v55: Torneio dos Heróis e dos Vilões no servidor (com um banco falso em memória, as mesmas regras de chave). */

type Row = BracketMatch & { kind: ChampionKind; village: string };
function fakeStore(slots: Map<string, { kind: ChampionKind; village: string }>) {
  const tours = new Map<string, ChampionTournament>();
  const entries = new Map<string, string[]>();
  const rows: Row[] = [];
  const crowned: { kind: ChampionKind; village: string; id: string }[] = [];
  const key = (k: string, v: string) => `${k}|${v}`;
  const store: ChampionStore = {
    async available() { return true; },
    async slot(id, kind) { const s = slots.get(id); return s && s.kind === kind ? s.village : null; },
    async join(id, kind) {
      const s = slots.get(id);
      if (!s || s.kind !== kind) return { ok: false, code: 'not_eligible' };
      const k = key(kind, s.village);
      if (!tours.has(k)) tours.set(k, { kind, village: s.village, bracketAt: null, closedAt: null, championId: null, entries: 0 });
      if (tours.get(k)!.bracketAt) return { ok: false, code: 'closed' };
      const list = entries.get(k) ?? [];
      if (!list.includes(id)) list.push(id);
      entries.set(k, list);
      tours.get(k)!.entries = list.length;
      return { ok: true, village: s.village };
    },
    async tournaments() { return [...tours.values()]; },
    async entries(_e, kind, village) { return [...(entries.get(key(kind, village)) ?? [])]; },
    async saveBracket(_e, kind, village, matches, now) {
      for (const m of matches) rows.push({ ...m, kind, village });
      tours.get(key(kind, village))!.bracketAt = now;
    },
    async pending() {
      return rows.filter((r) => !r.winner && r.a && r.b).map((r): ChampionPending => ({ kind: r.kind, village: r.village, a: r.a!, b: r.b!, round: r.round, rounds: r.rounds }));
    },
    async result(kind, w, l) {
      const m = rows.find((r) => r.kind === kind && !r.winner && ((r.a === w && r.b === l) || (r.a === l && r.b === w)));
      if (!m) return undefined;
      m.winner = w;
      if (m.round < m.rounds) {
        const slot = Math.ceil(m.slot / 2);
        let next = rows.find((r) => r.kind === kind && r.village === m.village && r.round === m.round + 1 && r.slot === slot);
        if (!next) { next = { kind, village: m.village, round: m.round + 1, slot, rounds: m.rounds, a: null, b: null, winner: null }; rows.push(next); }
        if (m.slot % 2 === 1) next.a = w; else next.b = w;
        return null;
      }
      crowned.push({ kind, village: m.village, id: w });
      return w;
    },
    async crown(_e, kind, village, id) { crowned.push({ kind, village, id }); },
    async champions() { return []; },
  };
  return { store, crowned, rows };
}

const cfg: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12, attackDamage: 0 } } };
const T0 = Date.UTC(2026, 10, 1);
const era = (stage: SeasonView['stage']): SeasonView => ({
  id: 1, startsAt: new Date(T0), endsAt: new Date(T0 + 60 * DAY_MS), stage, finalReady: true,
  jounin: { startsAt: new Date(T0 + 14 * DAY_MS), endsAt: new Date(T0 + 24 * DAY_MS) },
});

function setup() {
  let t = T0 + 24 * DAY_MS + 60_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const slots = new Map<string, { kind: ChampionKind; village: string }>();
  const fake = fakeStore(slots);
  const world = new GameWorld(cfg, clock.now, undefined, { random: seededRandom(), champion: fake.store });
  const join = (username: string, kind: ChampionKind | null) => {
    const conn = new FakeConn();
    const id = randomUUID();
    if (kind) slots.set(id, { kind, village: kind === 'herois' ? 'vila_1' : '' });
    const h = world.join({ id, username, appearance: { ...DEFAULT_APPEARANCE, village: 'vila_1' } }, conn);
    const send = (msg: unknown) => h.receive(JSON.stringify(msg));
    send({ type: 'ranked', action: 'enter' });
    return { id, conn, send };
  };
  const run = (ms: number) => { for (let x = 0; x < ms; x += cfg.tickMs) { clock.advance(cfg.tickMs); world.tick(); } };
  const flush = () => new Promise((r) => setImmediate(r));
  return { world: world as any, clock, join, run, flush, ...fake };
}

describe('v55: Torneio dos Heróis e dos Vilões (servidor)', () => {
  it('abre com a Fase Final: inscrição, chave, fila nas arenas, final sozinha e o campeão anunciado', async () => {
    const { world, clock, join, run, flush, crowned } = setup();
    const herois = ['kaito', 'mei', 'rin', 'sora'].map((n) => join(n, 'herois'));
    const chunin = join('tomo', null);
    await world.championMaintenance(era('grupos'), clock.now());
    assert.equal(world.champPhase, 'inscricoes');
    assert.match(herois[0]!.conn.last('announce').message, /Inscrições abertas/);
    for (const h of herois) h.send({ type: 'ranked', action: 'champion_join' });
    chunin.send({ type: 'ranked', action: 'champion_join' });
    await flush(); await flush();
    assert.match(chunin.conn.last('notice').text, /só Jounin/);
    assert.match(herois[0]!.conn.last('notice').text, /Inscrito no Torneio dos Heróis/);
    // 1 dia depois: a chave de 4 sai (2 semifinais)
    clock.advance(DAY_MS);
    await world.championMaintenance(era('grupos'), clock.now());
    assert.equal(world.champPhase, 'chaves');
    assert.equal(world.champPending.length, 2);
    for (const h of herois) h.send({ type: 'ranked', action: 'champion_queue' });
    await flush(); await flush();
    run(REALTIME.tickMs);
    const first = [...world.duels.values()];
    assert.equal(first.length, 1, 'semifinal: uma por vez, na arena principal');
    assert.ok(first[0].big);
    assert.match(first[0].label, /Semifinal do Torneio dos Heróis/);
    // a semifinal acaba (o lado a vence) e a próxima começa
    const finishOne = async () => {
      const d = [...world.duels.values()][0];
      run(DUEL.prepMs);
      for (let r = 0; r < 2; r++) {
        const loser = world.sessions.get(d.b);
        loser.hp = 1;
        world.damagePlayer(loser, 10, world.now(), world.sessions.get(d.a), world.sessions.get(d.a));
        run(DUEL.intervalMs + REALTIME.tickMs);
      }
      await flush(); await flush();
      run(DUEL.endMs + REALTIME.tickMs * 2);
      return d;
    };
    const s1 = await finishOne();
    assert.ok(world.champQueue.includes(s1.a), 'o vencedor volta sozinho para a fila');
    run(REALTIME.tickMs);
    await finishOne();
    run(REALTIME.tickMs);
    const fin = [...world.duels.values()][0];
    assert.match(fin.label, /Grande Final do Torneio dos Heróis/);
    await finishOne();
    assert.equal(crowned.length, 1);
    assert.equal(crowned[0]!.id, fin.a);
    assert.ok(herois.some((h) => /é o Herói da/.test(h.conn.last('announce')?.message ?? '')), 'campeão anunciado para o servidor');
  });

  it('no prazo (5 dias de chave), o jogo que faltou é W.O. para o melhor cabeça de chave', async () => {
    const { world, clock, join, crowned } = setup();
    const v = ['vilao1', 'vilao2'].map((n) => join(n, 'viloes'));
    await world.championMaintenance(era('grupos'), clock.now());
    for (const x of v) x.send({ type: 'ranked', action: 'champion_join' });
    await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    clock.advance(DAY_MS);
    await world.championMaintenance(era('chaves'), clock.now());
    assert.equal(world.champPending.length, 1, 'a final dos vilões');
    clock.advance(5 * DAY_MS);
    await world.championMaintenance(era('chaves'), clock.now());
    assert.equal(crowned.length, 1);
    assert.equal(crowned[0]!.kind, 'viloes');
  });
});
