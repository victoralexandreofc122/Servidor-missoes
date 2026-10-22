import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { ADMIN_HELP, parseAdminCommand, type AdminStore } from '../src/realtime/admin.js';
import { CHAT_HISTORY, memoryChatLog } from '../src/realtime/chatLog.js';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { GameWorld, type JoiningPlayer, type Progression, type WorldLogger } from '../src/realtime/gameWorld.js';
import { gearOf } from '../src/realtime/items.js';
import type { Missions } from '../src/realtime/missions.js';
import type { Profile } from '../src/realtime/profile.js';
import {
  derivedStats, effectivePoints, NO_ATTRIBUTES, nextPointGains, pointGain, type Attributes,
} from '../src/realtime/stats.js';
import { FakeConn, seededRandom } from './support/world.js';
import { fakeNinjaStore } from './support/ninjaStore.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const RULES = REALTIME.combat.attributes;
const S = REALTIME.spawn;
/** Monstros parados e posicionados à mão. */
const config: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12 } } };

interface Opts {
  profile?: Profile;
  admin?: AdminStore;
  progression?: Progression;
  missions?: Missions;
  log?: WorldLogger;
  store?: ReturnType<typeof fakeNinjaStore>['store'];
}

function setup(opts: Opts = {}) {
  let t = 1_000_000;
  const now = () => t;
  const chatLog = memoryChatLog(now);
  const world = new GameWorld(config, now, opts.log, {
    random: seededRandom(), chatLog,
    ...(opts.profile ? { profile: opts.profile } : {}),
    ...(opts.admin ? { admin: opts.admin } : {}),
    ...(opts.progression ? { progression: opts.progression } : {}),
    ...(opts.missions ? { missions: opts.missions } : {}),
    ...(opts.store ? { store: opts.store } : {}),
  });
  const join = (username: string, extra: Partial<JoiningPlayer> = {}) => {
    const conn = new FakeConn();
    const id = extra.id ?? randomUUID();
    const handle = world.join({ id, username, ...extra }, conn);
    return { id, conn, send: (m: unknown) => handle.receive(JSON.stringify(m)), leave: () => handle.leave() };
  };
  const run = (ms: number) => {
    for (let x = 0; x < ms; x += config.tickMs) {
      t += config.tickMs;
      world.tick();
    }
  };
  const sess = (id: string) => (world as any).sessions.get(id);
  return { world, join, run, sess, chatLog, advance: (ms: number) => { t += ms; } };
}

/** Logger que guarda tudo (para conferir que tentativas de admin ficam registradas). */
function memoryLogger() {
  const lines: { level: string; obj: object; msg?: string }[] = [];
  const log: WorldLogger = {
    info: (obj, msg) => lines.push({ level: 'info', obj, ...(msg ? { msg } : {}) }),
    warn: (obj, msg) => lines.push({ level: 'warn', obj, ...(msg ? { msg } : {}) }),
  };
  return { log, lines };
}

/** AdminStore em memória: as MESMAS regras das funções game.admin_* (simplificadas) + a auditoria. */
function fakeAdmin(players: Record<string, { id: string; admin?: boolean }>) {
  const audit: { adminId: string; command: string; targetId: string | null; ok: boolean }[] = [];
  const state = new Map<string, { totalXp: number; level: number; statPoints: number; attributes: Attributes; items: Record<string, number>; jutsus: Record<string, number> }>();
  const of = (id: string) => {
    let s = state.get(id);
    if (!s) state.set(id, (s = { totalXp: 0, level: 1, statPoints: 0, attributes: { ...NO_ATTRIBUTES }, items: {}, jutsus: {} }));
    return s;
  };
  const isAdmin = (id: string) => Object.values(players).some((p) => p.id === id && p.admin);
  const refuse = (adminId: string, command: string, targetId: string) => {
    audit.push({ adminId, command, targetId, ok: false });
    return { ok: false as const, text: 'Comando restrito ao administrador.' };
  };
  const store: AdminStore = {
    async findPlayer(username) {
      const key = Object.keys(players).find((k) => k.toLowerCase() === username.toLowerCase());
      return key ? { id: players[key]!.id, username: key } : undefined;
    },
    async setLevel(adminId, targetId, level) {
      if (!isAdmin(adminId)) return refuse(adminId, 'level', targetId);
      const s = of(targetId);
      Object.assign(s, { level, totalXp: 50 * level * (level - 1), statPoints: level - 1, attributes: { ...NO_ATTRIBUTES } });
      audit.push({ adminId, command: 'level', targetId, ok: true });
      return { ok: true, totalXp: s.totalXp, level: s.level, statPoints: s.statPoints, attributes: { ...s.attributes } };
    },
    async giveJutsu(adminId, targetId, jutsu, level) {
      if (!isAdmin(adminId)) return refuse(adminId, 'givejutsu', targetId);
      const uses = [0, 100, 500, 2000][level - 1]!;
      const s = of(targetId);
      s.jutsus[jutsu] = Math.max(s.jutsus[jutsu] ?? 0, uses);
      audit.push({ adminId, command: 'givejutsu', targetId, ok: true });
      return { ok: true, uses: s.jutsus[jutsu]! };
    },
    async giveItem(adminId, targetId, item, quantity) {
      if (!isAdmin(adminId)) return refuse(adminId, 'giveitem', targetId);
      const s = of(targetId);
      s.items[item] = (s.items[item] ?? 0) + quantity;
      audit.push({ adminId, command: 'giveitem', targetId, ok: true });
      return { ok: true, items: { ...s.items } };
    },
    async resetStats(adminId, targetId) {
      if (!isAdmin(adminId)) return refuse(adminId, 'resetstats', targetId);
      const s = of(targetId);
      const spent = Object.values(s.attributes).reduce((a, b) => a + b, 0);
      Object.assign(s, { statPoints: s.statPoints + spent, attributes: { ...NO_ATTRIBUTES } });
      audit.push({ adminId, command: 'resetstats', targetId, ok: true });
      return { ok: true, totalXp: s.totalXp, level: s.level, statPoints: s.statPoints, attributes: { ...s.attributes } };
    },
    async log(adminId, command, targetId, _args, ok) {
      audit.push({ adminId, command, targetId, ok });
    },
  };
  return { store, audit, state };
}

// ======================================================================= 2. atributos

describe('v8: atributos com rendimento decrescente (soft cap) e sem teto', () => {
  it('fórmula: o ponto investido com n pontos já no atributo vale base / (1 + n x 0,05)', () => {
    assert.equal(RULES.softCap, 0.05);
    const vit = RULES.perPoint.vitality;
    assert.equal(vit, 10);
    assert.equal(pointGain(vit, 0, RULES.softCap), 10, '1º ponto: +10 (diferença imediata)');
    assert.equal(Math.round(pointGain(vit, 9, RULES.softCap) * 10) / 10, 6.9, '10º ponto: +6,9');
    assert.equal(Math.round(pointGain(vit, 49, RULES.softCap) * 10) / 10, 2.9, '50º ponto: +2,9');
    assert.equal(effectivePoints(0, 0.05), 0);
    assert.equal(effectivePoints(1, 0.05), 1);
    assert.ok(Math.abs(effectivePoints(3, 0.05) - (1 + 1 / 1.05 + 1 / 1.1)) < 1e-12);
  });

  it('nível 60 com tudo em Vitalidade: 379 de vida (e não 690); velocidade com teto de +5', () => {
    const base = { maxHp: 100, maxChakra: 100, meditationChakraPerSec: 15, walkSpeed: 5, runSpeed: 8, attackCooldownMs: 600 };
    assert.equal(derivedStats(base, RULES, { ...NO_ATTRIBUTES, vitality: 59 }).maxHp, 379);
    const fast = derivedStats(base, RULES, { ...NO_ATTRIBUTES, agility: 59 });
    assert.deepEqual([fast.walkSpeed, fast.runSpeed, fast.attackCooldownMs], [10, 13, 360]);
    // Mais pontos sempre rendem MAIS (nunca menos), só cada vez menos por ponto.
    let last = 0;
    for (let n = 1; n <= 59; n++) {
      const hp = derivedStats(base, RULES, { ...NO_ATTRIBUTES, vitality: n }).maxHp;
      assert.ok(hp >= last, `vida não cai com ${n} pontos`);
      last = hp;
    }
  });

  it('"Chakra" (um atributo só) dá chakra máximo E regeneração meditando', () => {
    const base = { maxHp: 100, maxChakra: 100, meditationChakraPerSec: 15, walkSpeed: 5, runSpeed: 8, attackCooldownMs: 600 };
    const d = derivedStats(base, RULES, { ...NO_ATTRIBUTES, chakra: 1 });
    assert.deepEqual([d.maxChakra, d.meditationChakraPerSec], [110, 16]);
    assert.deepEqual(Object.keys(NO_ATTRIBUTES), ['vitality', 'chakra', 'agility', 'taijutsu', 'ninjutsu', 'weapons']);
  });

  it('o SERVIDOR manda o ganho do próximo ponto (nextGain) e o custo de redefinir; não existe mais "máximo de pontos"', () => {
    const { join } = setup();
    const p = join('kaito', { attributes: { ...NO_ATTRIBUTES, vitality: 9 }, level: 10, statPoints: 0 });
    const pr = p.conn.last('welcome').progress;
    assert.equal(pr.maxPoints, undefined);
    assert.equal(pr.resetCost, 500);
    assert.deepEqual(pr.nextGain, nextPointGains(RULES, { ...NO_ATTRIBUTES, vitality: 9 }));
    assert.equal(pr.nextGain.vitality, 6.897, '10º ponto de Vitalidade');
    assert.equal(pr.nextGain.chakra, 10, '1º ponto de Chakra');
  });

  it('gastar o 11º ponto no mesmo atributo funciona (sem ATTRIBUTE_MAXED) e a vida sobe pela curva', async () => {
    const attrs = { ...NO_ATTRIBUTES, vitality: 10 };
    let points = 1;
    const profile: Profile = {
      async spendPoint(_id, a) {
        if (points <= 0) return { ok: false, reason: 'NO_POINTS' };
        points -= 1;
        attrs[a] += 1;
        return { ok: true, statPoints: points, attributes: { ...attrs } };
      },
      async saveLoadout() {}, async saveAppearance() {},
      async resetAttributes() { return { ok: false, text: 'não usado' }; },
    };
    const { join, sess } = setup({ profile });
    const p = join('kaito', { attributes: { ...NO_ATTRIBUTES, vitality: 10 }, statPoints: 1, level: 11 });
    const before = sess(p.id).stats.maxHp;
    p.send({ type: 'spend_point', attribute: 'vitality', amount: 50 });   // campo extra: ignorado
    await flush();
    const after = p.conn.last('progress');
    assert.equal(after.attributes.vitality, 11);
    assert.equal(after.derived.maxHp - before, Math.round(100 + 10 * effectivePoints(11, 0.05)) - before, 'o servidor calcula o ganho');
    p.send({ type: 'spend_point', attribute: 'chakraMax' });
    assert.equal(p.conn.last('error').code, 'INVALID_MESSAGE', 'os atributos antigos não existem mais');
  });

  it('"Redefinir Atributos": custa 500 ryō (o custo é do servidor), devolve os pontos e a vida não passa do máximo novo', async () => {
    const calls: [string, number][] = [];
    const profile: Profile = {
      async spendPoint() { return { ok: false, reason: 'NO_POINTS' }; },
      async saveLoadout() {}, async saveAppearance() {},
      async resetAttributes(id, cost) {
        calls.push([id, cost]);
        return { ok: true, statPoints: 6, attributes: { ...NO_ATTRIBUTES }, ryo: 700 - cost };
      },
    };
    const { join, sess } = setup({ profile });
    const pobre = join('pobre', { attributes: { ...NO_ATTRIBUTES, vitality: 6 }, level: 7, ryo: 100 });
    pobre.send({ type: 'reset_attributes', cost: 0 });
    assert.match(pobre.conn.last('notice').text, /500 ryō/);
    const zerado = join('zerado', { ryo: 900 });
    zerado.send({ type: 'reset_attributes' });
    assert.equal(zerado.conn.last('notice').text, 'Você ainda não investiu nenhum ponto.');
    await flush();
    assert.deepEqual(calls, [], 'recusas óbvias nem chegam ao banco');

    const p = join('kaito', { attributes: { ...NO_ATTRIBUTES, vitality: 6 }, level: 7, ryo: 700 });
    const s = sess(p.id);
    assert.equal(s.hp, s.stats.maxHp);
    p.send({ type: 'reset_attributes', cost: 1 });                     // o cliente não escolhe o custo
    await flush();
    assert.deepEqual(calls, [[p.id, 500]]);
    assert.deepEqual([p.conn.last('progress').statPoints, p.conn.last('progress').attributes.vitality], [6, 0]);
    assert.equal(s.stats.maxHp, 100);
    assert.equal(s.hp, 100, 'vida cortada no máximo novo');
    assert.equal(p.conn.last('inventory').ryo, 200);
    assert.match(p.conn.last('notice').text, /Atributos redefinidos \(-500 ryō\)/);
  });
});

// ======================================================================= 1. administrador

describe('v8: Modo Administrador', () => {
  it('parseAdminCommand: formatos, faixas e códigos conhecidos (nada além disso chega ao banco)', () => {
    const types = ['slime', 'dummy', 'sparring'];
    assert.deepEqual(parseAdminCommand('/admin level Victor 25', types), { ok: true, command: { cmd: 'level', username: 'Victor', level: 25 } });
    assert.deepEqual(parseAdminCommand('/ADMIN spawn SLIME 3', types), { ok: true, command: { cmd: 'spawn', monster: 'slime', quantity: 3 } });
    assert.deepEqual(parseAdminCommand('/admin givejutsu kaito fire_2 4', types), { ok: true, command: { cmd: 'givejutsu', username: 'kaito', jutsu: 'fire_2', level: 4 } });
    assert.deepEqual(parseAdminCommand('/admin giveitem kaito kunai 2', types), { ok: true, command: { cmd: 'giveitem', username: 'kaito', item: 'kunai', quantity: 2 } });
    assert.deepEqual(parseAdminCommand('/admin resetstats kaito', types), { ok: true, command: { cmd: 'resetstats', username: 'kaito' } });
    assert.deepEqual(parseAdminCommand('/admin', types), { ok: true, command: { cmd: 'help' } });
    for (const bad of [
      '/admin level kaito 61', '/admin level kaito 0', '/admin level ka 5', "/admin level kaito' 5", '/admin level kaito 5 extra',
      '/admin spawn dragao 1', '/admin spawn slime 21', '/admin spawn slime -1',
      '/admin givejutsu kaito rasengan 1', '/admin givejutsu kaito fire 5',
      '/admin giveitem kaito espada_lendaria 1', '/admin giveitem kaito kunai 1000', '/admin resetstats',
    ]) {
      const r = parseAdminCommand(bad, types);
      assert.equal(r.ok, false, bad);
      assert.match((r as { text: string }).text, /^Uso: \/admin/, bad);
    }
    assert.deepEqual(parseAdminCommand('/admin explodir tudo', types), { ok: false, command: 'unknown', text: ADMIN_HELP });
  });

  it('quem NÃO é admin: "/admin ..." vira só "Comando desconhecido" (nunca chat, nunca banco) e fica no log', async () => {
    const { log, lines } = memoryLogger();
    const admin = fakeAdmin({ kaito: { id: 'k1' } });
    const { join } = setup({ admin: admin.store, log });
    const a = join('kaito', { id: 'k1' });
    const b = join('mei');
    a.send({ type: 'chat', message: '/admin level kaito 60' });
    await flush();
    assert.equal(a.conn.last('notice').text, 'Comando desconhecido.');
    assert.equal(b.conn.of('chat').length, 0, 'o comando não vaza para o chat');
    assert.equal(a.conn.of('chat').length, 0);
    assert.equal(admin.state.size, 0, 'nada chegou ao "banco"');
    assert.ok(lines.some((l) => l.level === 'warn' && /não é administrador/.test(l.msg ?? '')));
    assert.equal(a.conn.last('welcome').ninja.isAdmin, false);
  });

  it('admin: /admin level atualiza o alvo online (progress, nível sobre o boneco) SEM xp, anúncio ou promoção; tudo auditado', async () => {
    const admin = fakeAdmin({ Victor: { id: 'v1', admin: true }, kaito: { id: 'k1' } });
    const { join, sess, run } = setup({ admin: admin.store });
    const v = join('Victor', { id: 'v1', isAdmin: true });
    const k = join('kaito', { id: 'k1' });
    const other = join('mei');
    assert.equal(v.conn.last('welcome').ninja.isAdmin, true);
    v.send({ type: 'chat', message: '/admin level kaito 30' });
    run(300);                                       // a fila de gravações espera o ritmo dela
    await flush(); await flush();
    const s = sess('k1');
    assert.deepEqual([s.level, s.statPoints, s.xp], [30, 29, 50 * 30 * 29]);
    assert.equal(k.conn.last('progress').level, 30);
    assert.equal(k.conn.of('xp').length, 0, 'sem "+XP" (não é XP ganho)');
    assert.equal(other.conn.of('announce').length, 0, 'sem anúncio');
    assert.deepEqual(other.conn.last('player_rank'), { type: 'player_rank', playerId: 'k1', rank: s.rank, level: 30 });
    assert.equal(s.rank.code, 'ACADEMY', 'rank não muda por comando de admin');
    assert.match(v.conn.last('notice').text, /kaito agora está no nível 30/);
    assert.deepEqual(admin.audit, [{ adminId: 'v1', command: 'level', targetId: 'k1', ok: true }]);
    assert.equal(other.conn.of('chat').length, 0);
  });

  it('admin: givejutsu, giveitem e resetstats chegam ao alvo online; jogador inexistente e erro de uso também auditados', async () => {
    const admin = fakeAdmin({ Victor: { id: 'v1', admin: true }, kaito: { id: 'k1' } });
    const { join, sess, run } = setup({ admin: admin.store });
    const v = join('Victor', { id: 'v1', isAdmin: true });
    const k = join('kaito', { id: 'k1', attributes: { ...NO_ATTRIBUTES, vitality: 3 }, level: 4 });
    const go = async (message: string) => {
      v.send({ type: 'chat', message });
      run(1000);                                    // o chat (e o /admin) é 1 por segundo
      await flush(); await flush();
    };
    await go('/admin givejutsu kaito fire_2 3');
    assert.equal(sess('k1').jutsus.get('fire_2'), 500);
    assert.equal(k.conn.last('jutsus').jutsus.fire_2, 500);
    await go('/admin giveitem kaito katana 1');
    assert.equal(sess('k1').items.katana, 1);
    assert.equal(k.conn.last('inventory').items.katana, 1);
    await go('/admin resetstats kaito');
    assert.equal(k.conn.last('progress').attributes.vitality, 0);
    await go('/admin level ninguem_aqui 5');
    assert.match(v.conn.last('notice').text, /não encontrado/);
    await go('/admin level kaito 99');
    assert.match(v.conn.last('notice').text, /^Uso: \/admin level/);
    assert.deepEqual(admin.audit.map((a) => [a.command, a.ok]), [
      ['givejutsu', true], ['giveitem', true], ['resetstats', true], ['level', false], ['level', false],
    ]);
  });

  it('admin revogado no banco depois de entrar: a função do banco recusa (e a recusa é auditada)', async () => {
    const admin = fakeAdmin({ Victor: { id: 'v1', admin: false }, kaito: { id: 'k1' } });
    const { join, run } = setup({ admin: admin.store });
    const v = join('Victor', { id: 'v1', isAdmin: true });     // a sessão achava que era admin
    join('kaito', { id: 'k1' });
    v.send({ type: 'chat', message: '/admin giveitem kaito kunai 5' });
    run(300);
    await flush(); await flush();
    assert.match(v.conn.last('notice').text, /restrito ao administrador/);
    assert.equal(admin.state.get('k1')?.items.kunai, undefined);
    assert.deepEqual(admin.audit, [{ adminId: 'v1', command: 'giveitem', targetId: 'k1', ok: false }]);
  });

  it('/admin spawn: monstros em volta do admin, que NÃO dão XP, ryō, drop nem missão (e não renascem)', async () => {
    const xp: unknown[] = [];
    const kills: unknown[] = [];
    const progression: Progression = { async grantXp(...args) { xp.push(args); return undefined; } };
    const missions = { async recordKill(...args: unknown[]) { kills.push(args); return null; }, async current() { return null; } } as unknown as Missions;
    const admin = fakeAdmin({ Victor: { id: 'v1', admin: true } });
    const { join, world, sess } = setup({ admin: admin.store, progression, missions });
    const v = join('Victor', { id: 'v1', isAdmin: true });
    const s = sess('v1');
    (world as any).transfer(s, 'map_2', 40, 20, 'walk');
    v.send({ type: 'chat', message: '/admin spawn slime 4' });
    const spawned = world.monsterList().filter((m) => (world as any).monsters.get(m.id).admin);
    assert.equal(spawned.length, 4);
    for (const m of spawned) assert.ok(Math.hypot(m.x - 40, m.y - 20) <= 5.01, 'em volta do admin');
    assert.match(v.conn.last('notice').text, /4x slime invocado/);
    for (const m of spawned) {
      (world as any).monsters.get(m.id).hp = 1;
      Object.assign(s, { x: m.x, y: m.y + 0.5, cooldowns: {} });
      v.send({ type: 'attack', targetId: m.id });
    }
    await flush();
    assert.equal(world.monsterList().filter((m) => (world as any).monsters.get(m.id).map === 'map_2').length, 0, 'mortos e sem reposição');
    assert.deepEqual([xp.length, kills.length], [0, 0], 'nenhuma recompensa nem progresso de missão');
    assert.deepEqual(admin.audit, [{ adminId: 'v1', command: 'spawn', targetId: null, ok: true }]);
  });

  it('sem banco de admin: só o /admin spawn funciona (os outros avisam)', () => {
    const { join, world } = setup();
    const v = join('Victor', { isAdmin: true });
    v.send({ type: 'chat', message: '/admin level Victor 10' });
    assert.match(v.conn.last('notice').text, /sem banco/);
    v.send({ type: 'chat', message: '/admin spawn dummy 2' });
    assert.equal(world.monsterList().filter((m) => m.type === 'dummy' && (world as any).monsters.get(m.id).admin).length, 2);
  });
});

// ======================================================================= 4. chat

describe('v8: chat com canais e histórico persistente', () => {
  it('local (mapa), "/g" global (todos os mapas) e "/w" sussurro (só os dois); "/" desconhecido mostra a ajuda', () => {
    const { join, world, sess } = setup();
    const a = join('kaito');
    const b = join('mei');
    const c = join('rin');
    (world as any).transfer(sess(c.id), 'map_2', 40, 20, 'walk');
    a.send({ type: 'chat', message: 'oi, vila' });
    assert.equal(b.conn.last('chat').channel, 'local');
    assert.equal(c.conn.of('chat').length, 0, 'fala local não sai do mapa');
    a.send({ type: 'chat', message: '/g alguém na floresta?' });
    assert.deepEqual(c.conn.last('chat'), { type: 'chat', playerId: a.id, username: 'kaito', message: 'alguém na floresta?', channel: 'global' });
    a.send({ type: 'chat', message: '/w RIN segredo' });
    const w = { type: 'chat', playerId: a.id, username: 'kaito', message: 'segredo', channel: 'whisper', to: 'rin' };
    assert.deepEqual(c.conn.last('chat'), w);
    assert.deepEqual(a.conn.last('chat'), w, 'quem mandou também vê');
    assert.equal(b.conn.of('chat').filter((m: any) => m.channel === 'whisper').length, 0, 'o terceiro não vê o sussurro');
  });

  it('sussurro para quem está offline ou para si mesmo: aviso, nada enviado; comando desconhecido: ajuda', () => {
    const { join, advance } = setup();
    const a = join('kaito');
    a.send({ type: 'chat', message: '/w fantasma oi' });
    assert.equal(a.conn.last('notice').text, 'fantasma não está online.');
    advance(1000);
    a.send({ type: 'chat', message: '/w kaito oi' });
    assert.match(a.conn.last('notice').text, /si mesmo/);
    advance(1000);
    a.send({ type: 'chat', message: '/dance' });
    assert.match(a.conn.last('notice').text, /\/g mensagem/);
    assert.equal(a.conn.of('chat').length, 0);
  });

  it('histórico: ao entrar e no 🕘 (1 pedido a cada 2 s); global + sussurros do próprio + fala do mapa atual', async () => {
    const { join, advance } = setup();
    const a = join('kaito');
    const b = join('mei');
    const c = join('rin');
    a.send({ type: 'chat', message: 'oi pessoal' });
    a.send({ type: 'chat', message: '/g global!' });
    a.send({ type: 'chat', message: '/w mei só pra você' });
    await flush();
    const d = join('naruto');
    await flush();
    const hist = d.conn.last('chat_history').messages;
    assert.deepEqual(hist.map((m: any) => [m.channel, m.message]), [['local', 'oi pessoal'], ['global', 'global!']], 'o sussurro dos outros não aparece');
    assert.ok(hist.every((m: any) => typeof m.at === 'string'));
    advance(CHAT_HISTORY.requestEveryMs);
    b.send({ type: 'chat_history' });
    await flush();
    assert.deepEqual(b.conn.last('chat_history').messages.map((m: any) => m.message), ['oi pessoal', 'global!', 'só pra você']);
    b.send({ type: 'chat_history' });                                // < 2 s: ignorado
    await flush();
    assert.equal(b.conn.of('chat_history').length, 2, 'o do welcome e o pedido');
    assert.equal(c.conn.of('chat_history').length, 1);
  });

  it('retenção de 24 h e no máximo 100 mensagens por histórico', async () => {
    let t = 0;
    const log = memoryChatLog(() => t);
    for (let i = 0; i < 150; i++) await log.record({ channel: 'global', senderId: 'a', senderName: 'kaito', message: `m${i}` });
    const h = await log.history('b', 'map_1');
    assert.equal(h.length, 100);
    assert.deepEqual([h[0]!.message, h[99]!.message], ['m50', 'm149'], 'as 100 mais novas, da mais antiga para a mais nova');
    t += CHAT_HISTORY.retentionMs + 1;
    await log.record({ channel: 'global', senderId: 'a', senderName: 'kaito', message: 'nova' });
    assert.deepEqual((await log.history('b', 'map_1')).map((m) => m.message), ['nova']);
    assert.equal(await log.purge(), 0, 'as velhas já tinham saído');
  });

  it('o administrador não interfere no chat normal: mensagem comum de admin é chat comum', () => {
    const { join } = setup();
    const v = join('Victor', { isAdmin: true });
    const b = join('mei');
    v.send({ type: 'chat', message: 'bom dia, vila' });
    assert.equal(b.conn.last('chat').message, 'bom dia, vila');
  });
});

// ======================================================================= 3. equipamento visível

describe('v8: equipamento visível no boneco (paperdoll)', () => {
  it('gearOf: kunai e espada curta na mão; espada longa e Shuriken Gigante nas costas; pergaminho nas costas', () => {
    assert.deepEqual(gearOf('kunai', null), { hand: 'kunai', back: null, scroll: null });
    assert.deepEqual(gearOf('tanto', 'scroll_fire'), { hand: 'tanto', back: null, scroll: 'scroll_fire' });
    assert.deepEqual(gearOf('katana', null), { hand: null, back: 'katana', scroll: null });
    assert.deepEqual(gearOf('fuma_shuriken', null), { hand: null, back: 'fuma_shuriken', scroll: null }, 'duas mãos: nada na mão');
    assert.deepEqual(gearOf('scroll_fire', 'kunai'), { hand: null, back: null, scroll: null }, 'tipos trocados não aparecem');
    assert.deepEqual(gearOf(null, null), { hand: null, back: null, scroll: null });
  });

  it('equipar muda o boneco para TODOS no mapa (player_gear) e quem chega depois já vê', async () => {
    const fake = fakeNinjaStore({ items: { kunai: 1, katana: 1, scroll_fire: 2 } });
    const { join } = setup({ store: fake.store });
    const a = join('kaito', { items: { kunai: 1, katana: 1, scroll_fire: 2 } });
    const b = join('mei');
    a.send({ type: 'equip', item: 'kunai' });
    await flush();
    assert.deepEqual(b.conn.last('player_gear'), { type: 'player_gear', playerId: a.id, gear: { hand: 'kunai', back: null, scroll: null } });
    a.send({ type: 'equip', item: 'scroll_fire', slot: 'scroll' });
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(b.conn.last('player_gear').gear, { hand: 'kunai', back: null, scroll: 'scroll_fire' });
    assert.equal(a.conn.last('inventory').equippedScroll, 'scroll_fire');
    a.send({ type: 'equip', item: 'katana' });
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(b.conn.last('player_gear').gear, { hand: null, back: 'katana', scroll: 'scroll_fire' });
    const c = join('rin');
    assert.deepEqual(c.conn.last('welcome').players.find((p: any) => p.id === a.id).gear, { hand: null, back: 'katana', scroll: 'scroll_fire' });
  });

  it('slot errado ou item que não tem: recusado sem tocar no banco', async () => {
    const fake = fakeNinjaStore();
    const { join } = setup({ store: fake.store });
    const a = join('kaito', { items: { scroll_fire: 1 } });
    a.send({ type: 'equip', item: 'scroll_fire' });
    assert.equal(a.conn.last('error').code, 'NOT_A_WEAPON');
    a.send({ type: 'equip', item: 'kunai', slot: 'scroll' });
    assert.equal(a.conn.last('error').code, 'NOT_A_SCROLL');
    a.send({ type: 'equip', item: 'scroll_water', slot: 'scroll' });
    assert.equal(a.conn.last('error').code, 'ITEM_NOT_OWNED');
    await flush();
    assert.equal(fake.calls.filter((c) => c[0] === 'equip').length, 0);
  });

  it('o tutorial e o admin nunca deixam o admin "padrão": conta comum entra sem Modo Administrador', () => {
    const { join } = setup();
    const p = join('novato', { tutorialStep: 0 });
    assert.equal(p.conn.last('welcome').ninja.isAdmin, false);
    assert.equal(p.conn.last('welcome').world.map, 'academy_interior');
    assert.equal(S.x > 0, true);
  });
});
