import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { REALTIME } from '../src/realtime/config.js';
import { GameWorld } from '../src/realtime/gameWorld.js';
import type { WorldWatch } from '../src/realtime/watch.js';
import { makeSiteLink, scrub, Sentinel, SUSPICION, Telemetry, TELEMETRY, type Alert } from '../src/site/telemetry.js';
import { FakeConn } from './support/world.js';

/*
 * v20: saúde do servidor e alertas para o site do jogo. Nada aqui fala com a rede de verdade: o envio é um falso que
 * guarda o que receberia.
 */

function fakeLink(ok = true) {
  const sent: { path: string; body: any }[] = [];
  return { sent, link: { enabled: true, async post(path: string, body: unknown) { sent.push({ path, body }); return ok; } } };
}

function setup(opts: { ok?: boolean; db?: () => Promise<number>; online?: number } = {}) {
  let t = 1_000_000;
  const { sent, link } = fakeLink(opts.ok ?? true);
  const telemetry = new Telemetry({
    link, budgetMs: 50, secrets: ['postgres://u:senhaSecreta@host/db', 'segredo-do-jwt-com-32-caracteres!!'], version: 'abc1234def',
    live: () => ({ online: opts.online ?? 3, byMap: { map_1: 2, map_2: 1 }, players: [], monsters: 7 }),
    dbPing: opts.db ?? (async () => 12), now: () => t,
  });
  const alerts = () => sent.filter((s) => s.path === '/_api/game/alerts').flatMap((s) => s.body.alerts as Alert[]);
  return { telemetry, sent, alerts, advance: (ms: number) => { t += ms; }, now: () => t };
}

const settle = () => new Promise((r) => setImmediate(r));

describe('v20: telemetria do servidor', () => {
  it('scrub tira a URL do banco, JWT, Bearer, token na URL e os segredos do .env', () => {
    const text = 'falhou postgres://user:abc@ep-x.neon.tech/db com Bearer abc.def e eyJhbGciOi.eyJzdWIi.c2ln em /x?token=123&a=1 (segredo-do-jwt-com-32-caracteres!!)';
    const out = scrub(text, ['segredo-do-jwt-com-32-caracteres!!']);
    assert.doesNotMatch(out, /abc@|eyJ|token=123|segredo-do-jwt/);
    assert.match(out, /postgres:\/\/\*\*\*/);
    assert.match(out, /Bearer \*\*\*/);
    assert.match(out, /token=\*\*\*&a=1/);
  });

  it('ligou e desligando: avisam na hora, com a versão e o motivo', async () => {
    const { telemetry, alerts } = setup();
    telemetry.start();
    await settle();
    await telemetry.stop('Recebeu SIGTERM: deploy novo.');
    const list = alerts();
    assert.deepEqual(list.map((a) => [a.kind, a.severity]), [['ligou', 'info'], ['desligando', 'aviso']]);
    assert.match(list[0]!.detail, /abc1234/);
    assert.match(list[1]!.detail, /SIGTERM/);
  });

  it('o mesmo erro em rajada: o primeiro sai na hora, os outros viram contagem no batimento seguinte', async () => {
    const { telemetry, alerts, advance } = setup();
    for (let i = 0; i < 5; i++) telemetry.error('jogo', new Error('boom em postgres://u:senhaSecreta@host/db'));
    await settle();
    assert.equal(alerts().length, 1);
    assert.equal(alerts()[0]!.count, 1);
    assert.doesNotMatch(JSON.stringify(alerts()), /senhaSecreta/);
    advance(30_000);
    await telemetry.beat();
    const all = alerts();
    assert.equal(all.length, 2);
    assert.equal(all[1]!.count, 4, 'os 4 repetidos');
    assert.equal(all[1]!.key, all[0]!.key);
  });

  it('batimento: online por mapa, loop do jogo, memória, banco e erros; e os limites viram "instável"', async () => {
    const { telemetry, sent, alerts } = setup({ db: async () => { throw new Error('Connection terminated'); } });
    for (let i = 0; i < 10; i++) telemetry.recordTick(i < 5 ? 80 : 10);      // média 45 ms, metade acima de 50
    const hb = await telemetry.beat();
    assert.equal(hb.online, 3);
    assert.deepEqual(hb.byMap, { map_1: 2, map_2: 1 });
    assert.deepEqual(hb.tick, { avgMs: 45, maxMs: 80, overruns: 5, budgetMs: 50 });
    assert.deepEqual(hb.db, { ok: false, ms: null, error: 'Connection terminated' });
    assert.ok(sent.some((s) => s.path === '/_api/game/heartbeat' && s.body.bootId === telemetry.bootId));
    const kinds = alerts().map((a) => a.key);
    assert.ok(kinds.includes('instavel:tick'), 'mais de 10% dos passos passou do limite');
    assert.ok(kinds.includes('instavel:banco'));
    assert.equal(alerts().find((a) => a.key === 'instavel:banco')!.severity, 'grave');
  });

  it('site fora do ar: os alertas esperam na fila e saem quando ele volta', async () => {
    let ok = false;
    const sent: any[] = [];
    const telemetry = new Telemetry({
      link: { enabled: true, async post(path, body) { if (ok) sent.push({ path, body }); return ok; } },
      budgetMs: 50, secrets: [], version: null, live: () => undefined, dbPing: async () => 5,
    });
    telemetry.alert({ kind: 'suspeito', severity: 'aviso', title: 'x', detail: 'y', key: 'k1' });
    await settle();
    assert.equal(sent.length, 0);
    ok = true;
    await telemetry.beat();
    assert.equal(sent.filter((s) => s.path === '/_api/game/alerts').flatMap((s) => s.body.alerts).length, 1);
  });

  it('makeSiteLink: sem URL ou segredo não manda nada; com eles, POST com o segredo no cabeçalho', async () => {
    assert.equal(makeSiteLink(undefined, 'x').enabled, false);
    const calls: [string, RequestInit][] = [];
    const link = makeSiteLink('https://site.exemplo', 's'.repeat(32), (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch);
    assert.equal(await link.post('/_api/game/heartbeat', { a: 1 }), true);
    assert.equal(calls[0]![0], 'https://site.exemplo/_api/game/heartbeat');
    assert.equal((calls[0]![1].headers as Record<string, string>)['x-site-token'], 's'.repeat(32));
  });
});

describe('v20: sentinela (comportamento suspeito)', () => {
  it('mensagens inválidas, troca de vitórias, senha errada e ganho rápido: um alerta quando passa do limite', async () => {
    const { telemetry, alerts, now } = setup();
    const s = new Sentinel(telemetry, now);
    for (let i = 0; i < SUSPICION.invalidPerMinute; i++) s.invalidMessage('hacker');
    for (let i = 0; i < SUSPICION.samePairPerDay; i++) s.pvpKill('alfa', 'beta');
    for (let i = 0; i < SUSPICION.failedLoginsPer10Min; i++) s.failedLogin('Victor@Teste.dev');
    s.rewards('farm', 100, 2_000);
    s.rewards('farm', 100, 1_500);
    s.floodKick('bot');
    await settle();
    const byKey = new Map(alerts().map((a) => [a.key, a]));
    assert.ok(byKey.has('suspeito:invalidas:hacker'));
    assert.match(byKey.get('suspeito:par:alfa>beta')!.title, /troca de vitórias/);
    assert.equal(byKey.get('suspeito:senha:victor@teste.dev')!.severity, 'grave');
    assert.match(byKey.get('suspeito:ryo:farm')!.detail, /3500 ryō/);
    assert.ok(byKey.has('suspeito:flood:bot'));
    assert.equal(alerts().length, 5, 'um por sinal');
  });

  it('bugs do cliente: no máximo 5 por jogador por minuto, sem segredo', async () => {
    const { telemetry, alerts, now } = setup();
    const s = new Sentinel(telemetry, now);
    for (let i = 0; i < 9; i++) s.clientError('kaito', { message: `Cannot read x ${i}`, source: 'https://jogo/game.js', line: 10 + i });
    await settle();
    assert.equal(alerts().length, SUSPICION.clientErrorsPerMinute);
    assert.match(alerts()[0]!.title, /game\.js:10/);
    assert.equal(alerts()[0]!.kind, 'bug');
  });
});

describe('v20: o mundo avisa o vigia', () => {
  it('tempo do loop, mensagem inválida, erro do cliente e flood chegam ao WorldWatch', () => {
    const seen: string[] = [];
    const watch: WorldWatch = {
      tick: () => seen.push('tick'),
      invalidMessage: (u) => seen.push(`invalida:${u}`),
      clientError: (u, r) => seen.push(`bug:${u}:${r.message}`),
      floodKick: (u) => seen.push(`flood:${u}`),
    };
    const world = new GameWorld({ ...REALTIME, messageBurst: 3, messagesPerSecond: 1, maxDroppedPerSecond: 2 }, () => 1_000, undefined, { watch });
    const conn = new FakeConn();
    const h = world.join({ id: randomUUID(), username: 'kaito' }, conn);
    h.receive('isto não é json');
    h.receive(JSON.stringify({ type: 'client_error', message: 'x is undefined', source: 'game.js', line: 3 }));
    for (let i = 0; i < 6; i++) h.receive(JSON.stringify({ type: 'sync', id: i }));
    assert.deepEqual(seen.filter((s) => s !== 'tick'), ['invalida:kaito', 'bug:kaito:x is undefined', 'flood:kaito']);
  });
});

describe('v20: configuração do site', () => {
  const base = { DATABASE_URL: 'postgres://x', JWT_SECRET: 'j'.repeat(32), SERVICE_TOKEN: 's'.repeat(32) };
  it('SITE_TOKEN e SITE_URL são opcionais (vazio = desligado) e o segredo não pode repetir os outros', () => {
    assert.equal(loadConfig({ ...base, SITE_TOKEN: '', SITE_URL: '' }).SITE_TOKEN, undefined);
    const c = loadConfig({ ...base, SITE_TOKEN: 't'.repeat(32), SITE_URL: 'https://vontade.floot.app' });
    assert.equal(c.SITE_URL, 'https://vontade.floot.app');
    assert.throws(() => loadConfig({ ...base, SITE_TOKEN: 'j'.repeat(32) }), /SITE_TOKEN precisa ser diferente/);
    assert.throws(() => loadConfig({ ...base, SITE_TOKEN: 'curto' }), /SITE_TOKEN/);
    assert.throws(() => loadConfig({ ...base, SITE_URL: 'https://vontade.floot.app/' }), /SITE_URL/);
  });

  it('os limites são os documentados', () => {
    assert.equal(TELEMETRY.heartbeatMs, 60_000);
    assert.equal(SUSPICION.samePairPerDay, 4);
  });
});
