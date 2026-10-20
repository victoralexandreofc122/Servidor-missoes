import type { NinjaStore, Inventory, Classes } from '../../src/realtime/ninjaStore.js';
import { EXTRACTION, JUTSUS, type ClassCode } from '../../src/realtime/jutsus.js';
import { ITEM_BY_CODE } from '../../src/realtime/items.js';

/**
 * NinjaStore em memória para os testes do mundo (as MESMAS regras das funções da v7, de forma
 * simplificada). Guarda cada chamada para o teste conferir o que o servidor pediu ao "banco".
 */
export function fakeNinjaStore(seed: { ryo?: number; items?: Inventory; classes?: Classes; level?: number } = {}) {
  const calls: unknown[][] = [];
  const state = {
    tutorial: new Map<string, number>(),
    ryo: seed.ryo ?? 0,
    items: { ...(seed.items ?? {}) } as Inventory,
    classes: { ...(seed.classes ?? { primary: null, secondary: null }) } as Classes,
    learned: new Set<string>(),
    usage: new Map<string, number>(),
    xp: 0,
  };
  const store: NinjaStore = {
    async flushUsage(id, uses) {
      calls.push(['flushUsage', id, uses.map(([c, n]) => [c, n])]);
      for (const [c, n] of uses) state.usage.set(c, (state.usage.get(c) ?? 0) + n);
    },
    async advanceTutorial(id, to) {
      calls.push(['advanceTutorial', id, to]);
      const cur = state.tutorial.get(id) ?? to - 1;
      if (cur !== to - 1) return null;
      state.tutorial.set(id, to);
      if (to === 3) state.items.kunai_training = 1;
      if (to === 4) { state.ryo += 100; state.xp += 50; }
      return { step: to, totalXp: state.xp, level: 1, statPoints: 0, ryo: state.ryo, items: { ...state.items } };
    },
    async becomeGenin(id, cls) {
      calls.push(['becomeGenin', id, cls]);
      if ((seed.level ?? 1) < 11) return { ok: false, text: 'A Missão de Genin é a partir do nível 11.' };
      state.classes = { primary: cls, secondary: null };
      state.items[`scroll_${cls}`] = (state.items[`scroll_${cls}`] ?? 0) + 1;
      return { ok: true, rank: { code: 'GENIN', name: 'Genin' }, canBeSensei: false, classes: { ...state.classes }, items: { ...state.items } };
    },
    async chooseSecondary(id, cls) {
      calls.push(['chooseSecondary', id, cls]);
      return { ok: false, text: 'A classe Secundária é para Chunin de nível 40, diferente da Primária e escolhida uma vez só.' };
    },
    async extract(id, cls, level, roll, pick) {
      calls.push(['extract', id, cls, level, roll, pick]);
      if (cls !== state.classes.primary && cls !== state.classes.secondary) return { ok: false, text: 'Você só aprende jutsus da sua classe.' };
      const rule = EXTRACTION.find((e) => e.level === level)!;
      const have = state.items[`scroll_${cls}`] ?? 0;
      const pool = JUTSUS.filter((j) => j.class === cls && j.tier === level && !state.learned.has(j.code));
      if (pool.length === 0) return { ok: true, outcome: 'all_learned', jutsu: null, consumed: 0, scrollsLeft: have, items: { ...state.items } };
      if (have < rule.scrolls) return { ok: true, outcome: 'no_scrolls', jutsu: null, consumed: 0, scrollsLeft: have, items: { ...state.items } };
      state.items[`scroll_${cls}`] = have - rule.scrolls;
      if (state.items[`scroll_${cls}`] === 0) delete state.items[`scroll_${cls}`];
      if (roll >= rule.chance) return { ok: true, outcome: 'failed', jutsu: null, consumed: rule.scrolls, scrollsLeft: have - rule.scrolls, items: { ...state.items } };
      const code = pool[Math.floor(pick * pool.length)]!.code;
      state.learned.add(code);
      return { ok: true, outcome: 'success', jutsu: code, consumed: rule.scrolls, scrollsLeft: have - rule.scrolls, items: { ...state.items } };
    },
    async buy(id, item, qty) {
      calls.push(['buy', id, item, qty]);
      const price = ITEM_BY_CODE.get(item)?.price;
      if (!price) return { ok: false, text: 'Esse item não está à venda.' };
      if (state.ryo < price * qty) return { ok: false, text: 'Ryō insuficiente.' };
      state.ryo -= price * qty;
      state.items[item] = (state.items[item] ?? 0) + qty;
      return { ok: true, ryo: state.ryo, items: { ...state.items } };
    },
    async equip(id, item) {
      calls.push(['equip', id, item]);
      if (item && !state.items[item]) return { ok: false, text: 'Só dá para equipar uma arma do seu inventário.' };
      return { ok: true, equipped: item };
    },
    async applyHokage(id) {
      calls.push(['applyHokage', id]);
      return { ok: true, already: false };
    },
    async addItem(id, item, qty) {
      calls.push(['addItem', id, item, qty]);
      state.items[item] = (state.items[item] ?? 0) + qty;
      return { ...state.items };
    },
    async rankOf() {
      return undefined;
    },
  };
  return { store, calls, state };
}

export type FakeClass = ClassCode;
