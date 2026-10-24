import type { Village } from '../../src/realtime/appearance.js';
import type { EndgameModule } from '../../src/realtime/endgame.js';
import { SHOW_ALL, type EndgamePlayer, type EndgameStore, type Politics, type PvpKill } from '../../src/realtime/endgameStore.js';

/**
 * Banco do fim de jogo em memória para os testes do mundo: o estado político e os jogadores ficam em objetos que o
 * teste muda à vontade; cada chamada fica em `calls`. As REGRAS do banco têm o próprio teste (v11.integration).
 */
export function fakeEndgame(modules: EndgameModule[] = ['vilas', 'pvp', 'renegados', 'akatsuki']) {
  const politics: Politics = {
    modules: (['vilas', 'pvp', 'renegados', 'akatsuki'] as const).map((code) => ({
      code, mode: 'auto' as const, activatedAt: modules.includes(code) ? '2026-01-01T00:00:00Z' : null,
    })),
    kages: [], relations: [], events: [], elections: [], akatsuki: [], season: { id: 1, startsAt: 0, endsAt: 9e15 },
  };
  const players = new Map<string, EndgamePlayer>();
  const calls: [string, ...unknown[]][] = [];
  let population = 0;
  let pvp: Partial<PvpKill> = {};
  const ok = <T extends object>(v: T) => Promise.resolve({ ok: true as const, ...v });
  const player = (id: string): EndgamePlayer => {
    let p = players.get(id);
    if (!p) players.set(id, (p = { village: 'vila_1', renegadeFrom: null, bounty: 0, kageOf: null, akatsukiSlot: null, cape: null, display: { ...SHOW_ALL }, villageSwitches: 0 }));
    return p;
  };
  const store: EndgameStore = {
    available: async () => true,
    touch: async (id) => void calls.push(['touch', id]),
    population: async () => population,
    activate: async (code) => {
      calls.push(['activate', code]);
      const row = politics.modules.find((m) => m.code === code)!;
      if (row.activatedAt) return false;
      row.activatedAt = '2026-02-01T00:00:00Z';
      return true;
    },
    politics: async () => structuredClone(politics),
    player: async (id) => ({ ...player(id), display: { ...player(id).display } }),
    tick: async () => [],
    chooseVillage: async (id, village) => {
      calls.push(['chooseVillage', id, village]);
      player(id).village = village;
      return ok({ village });
    },
    villagePanel: async (_id, village) => ({ village, election: null, proposals: [], reports: [], log: [] }),
    vote: async (voter, candidate) => (calls.push(['vote', voter, candidate]), ok({})),
    kageAction: async (kage, action, target) => (calls.push(['kageAction', kage, action, target]), ok({})),
    kageAnswer: async (kage, proposal, accept) => (calls.push(['kageAnswer', kage, proposal, accept]), ok({ kind: 'alianca' })),
    exile: async (kage, name, reason) => (calls.push(['exile', kage, name, reason]), ok({ targetId: name, username: name })),
    report: async (reporter, name, reason) => (calls.push(['report', reporter, name, reason]), ok({})),
    decideReport: async (kage, report, approve) => (calls.push(['decideReport', kage, report, approve]), ok({ targetId: '' })),
    pvpKill: async (winner, loser) => {
      calls.push(['pvpKill', winner, loser]);
      return {
        counted: true, winnerDelta: 16, loserDelta: -16, winnerMmr: 1016, loserMmr: 984, lootRyo: 0, becameRenegade: false, bountyPaid: 0,
        winnerBounty: 0, loserBounty: 0, kageHunted: null, ryoWinner: 0, ...pvp,
      };
    },
    ranking: async () => ({ season: politics.season, top: [], global: [], me: { mmr: 1000, wins: 0, losses: 0, seasonMmr: null, seasonWins: 0, seasonLosses: 0, position: null } }),
    akatsukiInvite: async (leader, name, slot) => (calls.push(['akatsukiInvite', leader, name, slot]), ok({ targetId: name, username: name })),
    akatsukiAccept: async (id) => (calls.push(['akatsukiAccept', id]), ok({ slot: 4 })),
    akatsukiDecline: async (id) => void calls.push(['akatsukiDecline', id]),
    akatsukiExpel: async (leader, name) => (calls.push(['akatsukiExpel', leader, name]), ok({ targetId: name, username: name })),
    akatsukiLeave: async (id) => (calls.push(['akatsukiLeave', id]), ok({})),
    akatsukiInviteOf: async () => null,
    equipCape: async (id, cape) => (calls.push(['equipCape', id, cape]), ok({ cape })),
    setDisplay: async (id, display) => void calls.push(['setDisplay', id, display]),
    payTravel: async (id, village) => (calls.push(['payTravel', id, village]), ok({ ryo: 950 })),
  };
  return {
    store, politics, players, calls, player,
    setPopulation: (n: number) => void (population = n),
    setPvp: (r: Partial<PvpKill>) => void (pvp = r),
    /** Muda a vila de alguém "no banco" (renegado: village null). */
    setVillage: (id: string, village: Village | null, from: Village | null = null) => {
      const p = player(id);
      p.village = village;
      p.renegadeFrom = village === null ? from : null;
    },
  };
}
