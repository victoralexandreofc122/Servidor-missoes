import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { parseAdminCommand } from '../src/realtime/admin.js';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { GameWorld, type Progression } from '../src/realtime/gameWorld.js';
import { bonusesFor, xpWithBonus, type XpBonus } from '../src/realtime/xpBonus.js';
import { FakeConn, placeIn, seededRandom } from './support/world.js';

/* v44: bônus de XP do admin (global, mapa, tipo de monstro, aldeia), com prazo e remoção. */
const NOW = 1_000_000;
const b = (scope: XpBonus['scope'], target: string, percent: number, endsAt = NOW + 60_000): XpBonus => ({ scope, target, percent, endsAt });
const ctx = { map: 'map_2', monster: 'slime', village: 'vila_1' };

describe('v44: contas do bônus de XP', () => {
  it('cada alvo vale só onde deve; os bônus somam; vencido não vale', () => {
    assert.equal(xpWithBonus(100, [b('global', '', 50)], ctx, NOW), 150);
    assert.equal(xpWithBonus(100, [b('mapa', 'map_2', 100)], ctx, NOW), 200);
    assert.equal(xpWithBonus(100, [b('mapa', 'caverna_lodo', 100)], ctx, NOW), 100);
    assert.equal(xpWithBonus(100, [b('monstro', 'slime', 30)], ctx, NOW), 130);
    assert.equal(xpWithBonus(100, [b('monstro', 'lodo_escuro', 30)], ctx, NOW), 100);
    assert.equal(xpWithBonus(100, [b('vila', 'vila_1', 20)], ctx, NOW), 120);
    assert.equal(xpWithBonus(100, [b('vila', 'vila_3', 20)], ctx, NOW), 100);
    assert.equal(xpWithBonus(100, [b('vila', 'vila_1', 20)], { ...ctx, village: null }, NOW), 100, 'renegado não tem vila');
    assert.equal(xpWithBonus(100, [b('global', '', 50), b('mapa', 'map_2', 50), b('monstro', 'slime', 25)], ctx, NOW), 225);
    assert.equal(xpWithBonus(100, [b('global', '', 50, NOW)], ctx, NOW), 100, 'acabou neste instante');
    assert.equal(xpWithBonus(7, [b('global', '', 10)], ctx, NOW), 8);
    assert.equal(bonusesFor([b('global', '', 50), b('mapa', 'x', 50)], ctx, NOW).length, 1);
  });
});

describe('v44: /admin bonusxp', () => {
  const cmd = (text: string) => parseAdminCommand(`/admin ${text}`, ['slime', 'lodo_escuro']);
  it('ligar: global, mapa, monstro e vila, com % e minutos (padrão 60)', () => {
    assert.deepEqual(cmd('bonusxp global 50'), { ok: true, command: { cmd: 'bonusxp', action: 'set', scope: 'global', target: '', percent: 50, minutes: 60 } });
    assert.deepEqual(cmd('bonusxp mapa map_2 100 30'), { ok: true, command: { cmd: 'bonusxp', action: 'set', scope: 'mapa', target: 'map_2', percent: 100, minutes: 30 } });
    assert.deepEqual(cmd('bonusxp monstro lodo_escuro 25 120'), { ok: true, command: { cmd: 'bonusxp', action: 'set', scope: 'monstro', target: 'lodo_escuro', percent: 25, minutes: 120 } });
    assert.deepEqual(cmd('bonusxp vila chama 20 1440'), { ok: true, command: { cmd: 'bonusxp', action: 'set', scope: 'vila', target: 'vila_1', percent: 20, minutes: 1440 } });
  });
  it('remover um alvo ou tudo; sem nada: lista; fora dos limites: recusado', () => {
    assert.deepEqual(cmd('bonusxp remover global'), { ok: true, command: { cmd: 'bonusxp', action: 'remove', scope: 'global', target: '', percent: 0, minutes: 0 } });
    assert.deepEqual(cmd('bonusxp remover mapa map_2'), { ok: true, command: { cmd: 'bonusxp', action: 'remove', scope: 'mapa', target: 'map_2', percent: 0, minutes: 0 } });
    assert.deepEqual(cmd('bonusxp remover tudo'), { ok: true, command: { cmd: 'bonusxp', action: 'remove', scope: 'tudo', target: '', percent: 0, minutes: 0 } });
    assert.equal((cmd('bonusxp') as any).command.action, 'list');
    for (const bad of ['bonusxp global', 'bonusxp global 0', 'bonusxp global 501', 'bonusxp global 50 0', 'bonusxp global 50 99999', 'bonusxp mapa 50', 'bonusxp vila marte 50', 'bonusxp lugar x 50']) {
      assert.equal(cmd(bad).ok, false, bad);
    }
  });
});

const cfg: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, perPlayer: 0, attackDamage: 0 } } };
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };

function setup() {
  let t = NOW;
  const xp: [string, number][] = [];
  const progression: Progression = { async grantXp(id, amount) { xp.push([id, amount]); return { totalXp: amount, rank: { code: 'GENIN', name: 'Genin' }, promoted: false }; } };
  const w = new GameWorld(cfg, () => t, undefined, { random: seededRandom(), progression });
  const join = (username: string, opts: { admin?: boolean; village?: 'vila_1' | 'vila_3' } = {}) => {
    const conn = new FakeConn();
    const id = randomUUID();
    const h = w.join({ id, username, isAdmin: !!opts.admin, tutorialStep: 4, appearance: { ...DEFAULT_APPEARANCE, village: opts.village ?? 'vila_1' } }, conn);
    return { id, conn, send: (m: unknown) => h.receive(JSON.stringify(m)) };
  };
  const run = (ms: number) => { for (let x = 0; x < ms; x += cfg.tickMs) { t += cfg.tickMs; w.tick(); } };
  /** O jogador derrota um monstro do tipo no mapa; devolve o XP que o servidor mandou gravar. */
  const kill = async (p: { id: string }, map: string, type: string) => {
    placeIn(w, p.id, map, 30, 30);
    const s = (w as any).sessions.get(p.id);
    const m = (w as any).monsters.get((w as any).spawnMonster({ x: s.x + 1, y: s.y }, undefined, map, type).id);
    xp.length = 0;
    (w as any).killMonster(m, s, t, 'attack');
    await flush();
    return xp.find(([id]) => id === p.id)?.[1];
  };
  const admin = async (p: ReturnType<typeof join>, text: string) => { run(1000); p.send({ type: 'chat', message: `/admin ${text}` }); await flush(); return p.conn.last('notice')?.text as string; };
  const base = (type: string) => (type === 'slime' ? cfg.combat.monsters.xp : cfg.combat.monsterTypes[type]!.xp);
  return { w, join, run, kill, admin, base, advance: (ms: number) => { t += ms; } };
}

describe('v44: bônus de XP no jogo', () => {
  it('global: todos ganham mais; avisa todo mundo; remover volta ao normal; só admin liga', async () => {
    const { join, kill, admin, base } = setup();
    const adm = join('chefe', { admin: true }), a = join('kaito');
    assert.equal(await kill(a, 'map_2', 'slime'), base('slime'));
    assert.match(await admin(a, 'bonusxp global 50'), /Comando desconhecido/);
    assert.equal(await kill(a, 'map_2', 'slime'), base('slime'), 'quem não é admin não liga nada');
    assert.match(await admin(adm, 'bonusxp global 50 30'), /bônus ligado: \+50% de XP em todo o jogo por 30 min/);
    assert.match(a.conn.last('announce').message, /Bônus de XP: \+50% de XP em todo o jogo por 30 min/);
    assert.equal(await kill(a, 'map_2', 'slime'), Math.round(base('slime') * 1.5));
    assert.match(await admin(adm, 'bonusxp'), /ativos: \+50% de XP em todo o jogo/);
    assert.match(await admin(adm, 'bonusxp remover global'), /1 bônus de XP removido/);
    assert.match(a.conn.last('announce').message, /O bônus de XP acabou/);
    assert.equal(await kill(a, 'map_2', 'slime'), base('slime'));
  });

  it('mapa, monstro e vila: cada um só no seu alvo, e somam', async () => {
    const { join, kill, admin, base } = setup();
    const adm = join('chefe', { admin: true }), a = join('kaito', { village: 'vila_1' }), c = join('mei', { village: 'vila_3' });
    assert.match(await admin(adm, 'bonusxp mapa lua 50'), /mapa "lua" não existe/);
    assert.match(await admin(adm, 'bonusxp monstro dragao 50'), /monstro "dragao" não existe/);
    await admin(adm, 'bonusxp mapa map_2 100');
    assert.equal(await kill(a, 'map_2', 'slime'), base('slime') * 2);
    assert.equal(await kill(a, 'caverna_lodo', 'lodo_escuro'), base('lodo_escuro'), 'outro mapa: normal');
    await admin(adm, 'bonusxp monstro lodo_escuro 50');
    assert.equal(await kill(a, 'caverna_lodo', 'lodo_escuro'), Math.round(base('lodo_escuro') * 1.5));
    assert.equal(await kill(a, 'map_2', 'lodo_escuro'), Math.round(base('lodo_escuro') * 2.5), 'mapa + monstro somam');
    await admin(adm, 'bonusxp vila mare 20');
    assert.equal(await kill(c, 'caverna_lodo', 'slime'), Math.round(base('slime') * 1.2), 'a vila vale em qualquer lugar');
    assert.equal(await kill(a, 'caverna_lodo', 'slime'), base('slime'), 'outra vila: normal');
    assert.match(await admin(adm, 'bonusxp remover tudo'), /3 bônus de XP removido/);
    assert.equal(await kill(a, 'map_2', 'lodo_escuro'), base('lodo_escuro'));
  });

  it('o prazo acaba sozinho (com aviso); ligar de novo o mesmo alvo troca o valor; quem entra é avisado', async () => {
    const { w, join, kill, admin, base, advance } = setup();
    const adm = join('chefe', { admin: true }), a = join('kaito');
    await admin(adm, 'bonusxp global 50 10');
    await admin(adm, 'bonusxp global 200 5');
    assert.equal(await kill(a, 'map_2', 'slime'), base('slime') * 3, 'troca, não soma com o anterior');
    const late = join('rin');
    assert.match(late.conn.last('notice').text, /Bônus de XP ativo: \+200% de XP em todo o jogo \(mais 5 min\)/);
    advance(5 * 60_000 + 1000);
    assert.equal(await kill(a, 'map_2', 'slime'), base('slime'), 'venceu: já não vale, mesmo antes da limpeza');
    await w.xpBonusMaintenance();
    assert.match(a.conn.last('announce').message, /O bônus de XP acabou: \+200% de XP em todo o jogo/);
    assert.match(await admin(adm, 'bonusxp'), /nenhum bônus de XP ativo/);
  });
});
