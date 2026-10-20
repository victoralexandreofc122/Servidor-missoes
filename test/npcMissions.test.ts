import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REALTIME, type RealtimeConfig } from '../src/realtime/config.js';
import { npcLine } from '../src/realtime/gameWorld.js';
import type { Missions, TalkOutcome } from '../src/realtime/missions.js';
import type { MissionView } from '../src/realtime/protocol.js';
import { FakeConn, setupWorld } from './support/world.js';

const NPC = REALTIME.npcs[0]!;
const SK = REALTIME.combat.skills;

/** Monstros parados e posicionados à mão. */
const config: RealtimeConfig = { ...REALTIME, combat: { ...REALTIME.combat, monsters: { ...REALTIME.combat.monsters, count: 0, stepMs: 1e12 } } };

const flush = () => new Promise((resolve) => setImmediate(resolve));

function mission(progress: number, extra: Partial<MissionView> = {}): MissionView {
  return {
    id: '0199a000-0000-7000-8000-000000000001', status: 'active', senseiName: 'Mestre', senseiId: '00000000-0000-7000-8000-00000000a001', fromNpc: true,
    type: { code: 'DEFEAT_MONSTER', name: 'Derrotar monstros' }, target: { code: 'slime', quantity: 5 },
    progress, reward: { xp: 50, title: 'Discípulo do Mestre' }, expiresAt: null, ready: progress >= 5, ...extra,
  };
}

/** Serviço de missões falso: registra as chamadas e devolve o que o teste mandar. */
function fakeMissions() {
  const calls = { talk: [] as string[], current: [] as string[], kills: [] as [string, string][] };
  const state = {
    current: null as MissionView | null,
    next: { kind: 'assigned', mission: mission(0) } as TalkOutcome,
    kill: null as MissionView | null,
    fail: false,
    /** talk só responde quando o teste mandar (para simular o banco demorando). */
    hold: undefined as undefined | Promise<void>,
  };
  const missions: Missions = {
    async current(id) {
      calls.current.push(id);
      return state.current;
    },
    async talk(id) {
      calls.talk.push(id);
      if (state.hold) await state.hold;
      if (state.fail) throw new Error('banco fora do ar');
      return state.next;
    },
    async recordKill(id, type) {
      calls.kills.push([id, type]);
      return state.kill;
    },
    async create() { return { kind: 'refused', text: 'não usado aqui' }; },
    async deliver() { return { kind: 'no_mission' }; },
    async evaluate() { return { kind: 'refused', text: 'não usado aqui' }; },
    async pendingEvaluations() { return []; },
    async senseiOptions() { return []; },
  };
  return { missions, calls, state };
}

function setup() {
  const fake = fakeMissions();
  const env = setupWorld(config, undefined, fake.missions);
  return { ...env, ...fake };
}

const session = (world: any, id: string) => world.sessions.get(id);

describe('NPC Mestre: no mapa e conversa', () => {
  it('welcome traz o NPC (posição e alcance) e, logo depois, a missão atual (Sala de Missões)', async () => {
    const { connect, state, calls } = setup();
    state.current = mission(2);
    const a = connect('kaito');
    assert.deepEqual(a.conn.of('welcome')[0].world.npcs[0], { id: 'sensei', name: 'Mestre', map: 'map_1', x: 42, y: 33, range: 2.5 });
    assert.ok(a.conn.of('welcome')[0].world.npcs.slice(1).every((n: any) => n.shop && n.map.startsWith('interior_')), 'os outros são lojistas, dentro das lojas');
    await flush();
    assert.deepEqual(calls.current, [a.id]);
    assert.deepEqual(a.conn.last('mission'), { type: 'mission', mission: mission(2), reason: 'sync' });
  });

  it('perto do Mestre (o renascimento fica a 2,2 casas): atribui a missão, fala e manda a missão', async () => {
    const { connect, calls } = setup();
    const a = connect('kaito');
    a.send({ type: 'talk', npcId: 'sensei' });
    await flush();
    assert.deepEqual(calls.talk, [a.id]);
    assert.deepEqual(a.conn.last('npc_say'), { type: 'npc_say', npcId: 'sensei', text: 'Prove seu valor, jovem ninja: derrote 5 slimes e volte aqui.' });
    assert.deepEqual(a.conn.last('mission'), { type: 'mission', mission: mission(0), reason: 'assigned' });
  });

  it('distância é a do SERVIDOR: longe = NPC_TOO_FAR sem tocar no banco; morto, NPC inexistente e id inválido também não', async () => {
    const { world, connect, calls } = setup();
    const a = connect('kaito');
    Object.assign(session(world, a.id), { x: NPC.x, y: NPC.y + NPC.range + 0.1 });   // 2,6 casas: o cliente pode até "achar" que está perto
    a.send({ type: 'talk', npcId: 'sensei' });
    assert.equal(a.conn.last('error').code, 'NPC_TOO_FAR');

    Object.assign(session(world, a.id), { x: NPC.x, y: NPC.y + NPC.range });          // exatamente no limite: pode
    a.send({ type: 'talk', npcId: 'ninja' });
    assert.equal(a.conn.last('error').code, 'UNKNOWN_NPC');
    a.send({ type: 'talk', npcId: 'Sensei!' });
    assert.equal(a.conn.last('error').code, 'INVALID_MESSAGE');

    session(world, a.id).dead = true;
    a.send({ type: 'talk', npcId: 'sensei' });
    assert.equal(a.conn.last('error').code, 'CANNOT_TALK');
    await flush();
    assert.deepEqual(calls.talk, []);
  });

  it('toque repetido: um pedido ao banco por vez e no máximo 1 a cada 400 ms', async () => {
    const { connect, calls, clock, state } = setup();
    let release!: () => void;
    state.hold = new Promise((r) => { release = r; });
    const a = connect('kaito');
    for (let i = 0; i < 5; i++) a.send({ type: 'talk', npcId: 'sensei' });
    clock.advance(1000);
    a.send({ type: 'talk', npcId: 'sensei' });           // ainda esperando o banco: ignorado
    assert.equal(calls.talk.length, 1);
    release();
    await flush();
    a.send({ type: 'talk', npcId: 'sensei' });           // banco respondeu e já passou o intervalo
    assert.equal(calls.talk.length, 2);
    a.send({ type: 'missions' });                        // < 400 ms depois do anterior: ignorado
    await flush();
    assert.equal(calls.current.length, 1, 'só a leitura do welcome');
  });

  it('banco fora do ar: MISSIONS_UNAVAILABLE, o jogo segue e o próximo pedido funciona', async () => {
    const { connect, clock, state, calls } = setup();
    const a = connect('kaito');
    state.fail = true;
    a.send({ type: 'talk', npcId: 'sensei' });
    await flush();
    assert.equal(a.conn.last('error').code, 'MISSIONS_UNAVAILABLE');
    state.fail = false;
    clock.advance(500);
    a.send({ type: 'talk', npcId: 'sensei' });
    await flush();
    assert.equal(calls.talk.length, 2);
    assert.equal(a.conn.last('mission').reason, 'assigned');
  });

  it('sem serviço de missões: o NPC aparece, mas falar dá MISSIONS_UNAVAILABLE', () => {
    const { connect } = setupWorld(config);
    const a = connect('kaito');
    a.send({ type: 'talk', npcId: 'sensei' });
    assert.equal(a.conn.last('error').code, 'MISSIONS_UNAVAILABLE');
  });

  it('abrir a Sala de Missões ({"type":"missions"}) relê a missão do banco', async () => {
    const { connect, clock, state } = setup();
    const a = connect('kaito');
    await flush();
    state.current = mission(3);
    clock.advance(500);
    a.send({ type: 'missions' });
    await flush();
    assert.deepEqual(a.conn.last('mission'), { type: 'mission', mission: mission(3), reason: 'sync' });
  });
});

describe('NPC Mestre: rastreamento e conclusão', () => {
  it('matar um monstro conta para a missão do MATADOR; ao chegar em 5/5, reason "ready"', async () => {
    const { world, connect, calls, state } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    await flush();
    for (let i = 1; i <= 5; i++) {
      const m = world.spawnMonster({ x: REALTIME.spawn.x + 0.5, y: REALTIME.spawn.y });
      (world as any).monsters.get(m.id).hp = 1;
      state.kill = mission(i);
      session(world, a.id).cooldowns = {};
      a.send({ type: 'cast', skill: 'taijutsu' });
      await flush();
      assert.deepEqual(a.conn.last('mission'), { type: 'mission', mission: mission(i), reason: i === 5 ? 'ready' : 'progress' });
    }
    assert.deepEqual(calls.kills, Array.from({ length: 5 }, () => [a.id, 'slime']));
    assert.equal(b.conn.of('mission').length, 1, 'o outro jogador só recebeu a própria sincronização');
    assert.ok(SK.taijutsu.damage! > 1);
  });

  it('abate que não conta (sem missão, outro monstro): o banco devolve null e nada é enviado', async () => {
    const { world, connect, state } = setup();
    const a = connect('kaito');
    await flush();
    a.conn.clear();
    const m = world.spawnMonster({ x: REALTIME.spawn.x + 0.5, y: REALTIME.spawn.y });
    (world as any).monsters.get(m.id).hp = 1;
    state.kill = null;
    a.send({ type: 'cast', skill: 'taijutsu' });
    await flush();
    assert.equal(a.conn.of('mission').length, 0);
  });

  it('volta ao Mestre com 5/5: recompensa (XP + título), XP atualizado, missão encerrada e anúncio de promoção', async () => {
    const { world, connect, state } = setup();
    const a = connect('kaito');
    const b = connect('mei');
    await flush();
    state.next = {
      kind: 'rewarded',
      rewards: [{ missionId: 'm', senseiName: 'Mestre', fromNpc: true, xp: 50, title: 'Discípulo do Mestre', titleNew: true }],
      totalXp: 130, rank: { code: 'GENIN', name: 'Genin' }, promoted: true, mission: null,
    };
    a.send({ type: 'talk', npcId: 'sensei' });
    await flush();
    assert.deepEqual(a.conn.last('mission_reward'), {
      type: 'mission_reward', rewards: [{ senseiName: 'Mestre', xp: 50, title: 'Discípulo do Mestre', titleNew: true }],
      totalXp: 130, rank: { code: 'GENIN', name: 'Genin' }, promoted: true,
    });
    assert.deepEqual(a.conn.last('xp'), { type: 'xp', gained: 50, totalXp: 130, rank: { code: 'GENIN', name: 'Genin' }, promoted: true });
    assert.deepEqual(a.conn.last('mission'), { type: 'mission', mission: null, reason: 'completed' });
    assert.equal(a.conn.last('npc_say').text, 'Excelente! Pergaminho entregue: +50 XP e o título “Discípulo do Mestre”. Fale comigo de novo para outro treino.');
    assert.equal(b.conn.last('announce').message, 'kaito subiu para Genin!');
    assert.equal(b.conn.of('mission_reward').length, 0, 'recompensa é só do dono');
    assert.equal(session(world, a.id).xp, 130);
  });

  it('o cliente não forja nada: mensagens de progresso/conclusão são recusadas e campos extras ignorados', async () => {
    const { connect, calls, clock } = setup();
    const a = connect('kaito');
    await flush();
    for (const msg of [
      { type: 'mission_progress', amount: 5 },
      { type: 'complete_mission' },
      { type: 'redeem', scrollId: 'x' },
    ]) {
      a.send(msg);
      assert.equal(a.conn.last('error').code, 'INVALID_MESSAGE');
    }
    clock.advance(500);
    a.send({ type: 'talk', npcId: 'sensei', progress: 5, complete: true });
    await flush();
    assert.deepEqual(calls.talk, [a.id], 'talk recebe só o id do jogador');
    assert.deepEqual(calls.kills, [], 'progresso só nasce de monstro morto pelo servidor');
  });

  it('reconectou no meio do pedido: a resposta vai para a conexão nova', async () => {
    const { world, calls, state } = setup();
    let release!: () => void;
    state.hold = new Promise((r) => { release = r; });
    const first = new FakeConn();
    const handle = world.join({ id: 'p1', username: 'kaito' }, first);
    handle.receive(JSON.stringify({ type: 'talk', npcId: 'sensei' }));
    const second = new FakeConn();
    world.join({ id: 'p1', username: 'kaito' }, second);
    release();
    await flush();
    assert.equal(calls.talk.length, 1);
    assert.equal(second.last('mission').reason, 'assigned');
    assert.equal(first.of('npc_say').length, 0);
  });

  it('falas: quanto falta (singular/plural) e missão de outro sensei', () => {
    assert.equal(npcLine.inProgress(mission(2)), 'Ainda faltam 3 slimes. Eles rondam em volta da vila.');
    assert.equal(npcLine.inProgress(mission(4)), 'Ainda falta 1 slime. Eles rondam em volta da vila.');
    assert.equal(npcLine.otherSensei(mission(0, { senseiName: 'obito', fromNpc: false })), 'Você está treinando com o sensei obito. Termine essa missão primeiro.');
    assert.equal(npcLine.otherSensei(mission(5, { status: 'submitted', senseiName: 'obito' })), 'Sua missão está com o sensei obito, esperando a avaliação.');
    assert.equal(npcLine.rewarded([{ xp: 50, title: 'Discípulo do Mestre', titleNew: false }]), 'Excelente! Pergaminho entregue: +50 XP. Fale comigo de novo para outro treino.');
  });
});
