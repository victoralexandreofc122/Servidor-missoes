import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildPublicApp } from '../src/app.js';
import { DEFAULT_SETTINGS } from '../src/appSetup.js';
import { makeAuthenticate } from '../src/auth/authenticate.js';
import { makeTokenIssuer } from '../src/auth/issueToken.js';
import { hashPassword } from '../src/auth/password.js';
import { DEFAULT_APPEARANCE } from '../src/realtime/appearance.js';
import { makeEndgameStore } from '../src/realtime/endgameStore.js';
import { makeNinjaStore } from '../src/realtime/ninjaStore.js';
import { makeProgression } from '../src/realtime/progression.js';
import { levelStart } from '../src/realtime/stats.js';
import { SITE_CLIENT_IP_HEADER, SITE_LOGIN_LIMITS, SITE_TOKEN_HEADER } from '../src/site/siteRoutes.js';
import { makeSiteStore } from '../src/site/siteStore.js';
import { JWT_SECRET } from './support/harness.js';
import { createTestDatabase } from './support/testDb.js';

/*
 * v20 no PostgreSQL de verdade: a API do site do jogo (/site/*) com o Fastify real. Segredo do site, limite global
 * fora, login com limite por IP do visitante, rankings sem admin, eleição com votos ao vivo e o voto pelas regras do
 * banco, perfil e o painel ao vivo só para o admin.
 */

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';

const SITE_TOKEN = 'token-do-site-de-teste-com-mais-de-32-caracteres!';
const SENHA = 'Kunai-de-Bronze-42';

describe('v20 no banco: API do site do jogo', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  const ids: Record<string, string> = {};
  const failed: string[] = [];

  async function ninja(name: string, opts: { level?: number; rank?: string; village?: string; admin?: boolean; fresh?: boolean; email?: string } = {}) {
    const id = await t.createPlayer(name, opts.rank ?? 'GENIN');
    for (let s = 1; s <= 4; s++) await t.pool.query('SELECT game.advance_tutorial($1, $2)', [id, s]);
    if ((opts.level ?? 1) > 1) await makeProgression(t.db).grantXp(id, levelStart(opts.level!));
    await t.pool.query(`UPDATE game.players SET village = $2, appearance = $3::jsonb, is_admin = $4, email = $6, password_hash = $7,
                          created_at = CASE WHEN $5 THEN now() ELSE now() - interval '30 days' END WHERE id = $1`,
    [id, opts.village ?? 'vila_1', JSON.stringify({ ...DEFAULT_APPEARANCE, village: opts.village ?? 'vila_1' }), opts.admin ?? false, opts.fresh ?? false,
      opts.email ?? `${name}@teste.dev`, await hashPassword(SENHA)]);
    if (opts.rank && opts.rank !== 'GENIN') await t.setRank(id, opts.rank);
    ids[name] = id;
    return id;
  }

  const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url, headers: { [SITE_TOKEN_HEADER]: SITE_TOKEN, ...headers } });
  const post = (url: string, payload: object, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, payload, headers: { [SITE_TOKEN_HEADER]: SITE_TOKEN, ...headers } });
  const login = async (who: string, ip = '10.0.0.1') => (await post('/site/login', { login: who, password: SENHA }, { [SITE_CLIENT_IP_HEADER]: ip })).json().token as string;
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  before(async () => {
    t = await createTestDatabase();
    await t.pool.query(`UPDATE game.endgame_modules SET mode = 'on'`);
    const issueToken = makeTokenIssuer({ secret: JWT_SECRET });
    const authenticate = makeAuthenticate({ secret: JWT_SECRET });
    const endgame = makeEndgameStore(t.db);
    app = buildPublicApp({
      db: t.db, authenticate, issueToken,
      site: {
        token: SITE_TOKEN, store: makeSiteStore(t.db, endgame), db: t.db, issueToken, authenticate,
        live: () => ({ online: 2, byMap: { map_1: 2 }, players: [] }),
        onFailedLogin: (who) => failed.push(who),
      },
    }, { ...DEFAULT_SETTINGS, rateLimit: { ...DEFAULT_SETTINGS.rateLimit, globalMax: 3 } }, { logger: false });
    await app.ready();

    await ninja('victor', { admin: true, level: 30, email: 'victor@teste.dev' });
    await ninja('cand_a', { level: 60, village: 'vila_3' });
    await ninja('cand_b', { level: 60, village: 'vila_3' });
    await ninja('kiri', { village: 'vila_3', rank: 'CHUNIN', level: 20 });
    await ninja('calouro', { village: 'vila_3', fresh: true });
    await ninja('aluno', { village: 'vila_3', rank: 'ACADEMY' });
    await ninja('kaito', { village: 'vila_1', level: 25, email: 'kaito@teste.dev' });
    const ns = makeNinjaStore(t.db);
    await ns.applyKage(ids.cand_a!);
    await ns.applyKage(ids.cand_b!);
    await t.pool.query(`SELECT * FROM game.endgame_tick(now())`);            // abre as eleições e a temporada 1
    await endgame.pvpKill(ids.kaito!, ids.kiri!);
    await endgame.pvpKill(ids.victor!, ids.kiri!);                            // admin: nunca entra em ranking
  });
  after(async () => {
    await app?.close();
    await t?.drop();
  });

  it('sem o segredo do site: 401 em toda rota; com ele, fora do limite global por IP', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/site/overview' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: '/site/overview', headers: { [SITE_TOKEN_HEADER]: 'errado' } })).statusCode, 401);
    for (let i = 0; i < 6; i++) assert.equal((await get('/site/overview')).statusCode, 200, `pedido ${i + 1} (o limite global é 3)`);
  });

  it('visão geral: módulos, vilas com membros e Kage, temporada e quantos estão online', async () => {
    const o = (await get('/site/overview')).json();
    assert.deepEqual(o.modules.map((m: any) => [m.code, m.on]), [['vilas', true], ['pvp', true], ['renegados', true], ['akatsuki', true]]);
    assert.deepEqual(o.villages.map((v: any) => v.name), ['Folha', 'Névoa', 'Nuvem', 'Areia']);
    assert.equal(o.villages.find((v: any) => v.code === 'vila_3').members, 5);
    assert.equal(o.villages.find((v: any) => v.code === 'vila_1').members, 1, 'o admin não conta');
    assert.equal(o.villages[0].passive, '+10% de cura');
    assert.equal(o.season.id, 1);
    assert.equal(o.online, 2);
  });

  it('ranking PvP (temporada e geral) e ranks ninja: sem admin, do maior para o menor', async () => {
    const season = (await get('/site/ranking/pvp?scope=season')).json();
    assert.deepEqual(season.rows.map((r: any) => [r.position, r.username]), [[1, 'kaito'], [2, 'kiri']]);
    assert.equal(season.rows[0].mmr > season.rows[1].mmr, true);
    const global = (await get('/site/ranking/pvp?scope=global&limit=1')).json();
    assert.deepEqual(global.rows.map((r: any) => r.username), ['kaito']);
    assert.equal((await get('/site/ranking/pvp?scope=tudo')).statusCode, 400);
    const ranks = (await get('/site/ranking/ranks')).json();
    assert.equal(ranks.rows[0].rank_code, 'CHUNIN');
    assert.ok(!ranks.rows.some((r: any) => r.username === 'victor'));
    assert.equal(ranks.distribution.find((d: any) => d.code === 'GENIN').players, 4);
  });

  it('perfil público por nome; admin e quem não existe: 404', async () => {
    const p = (await get('/site/players/KAITO')).json();
    assert.equal(p.username, 'kaito');
    assert.deepEqual(p.village, { code: 'vila_1', name: 'Folha' });
    assert.equal(p.pvp.wins, 1);
    assert.equal(p.season.wins, 1);
    assert.equal((await get('/site/players/victor')).statusCode, 404);
    assert.equal((await get('/site/players/ninguem')).statusCode, 404);
  });

  it('login do site: por nome ou e-mail; senha errada conta para o sentinela; 5 por IP a cada 10 min', async () => {
    const ok = (await post('/site/login', { login: 'Victor@Teste.dev', password: SENHA }, { [SITE_CLIENT_IP_HEADER]: '1.1.1.1' })).json();
    assert.equal(ok.player.username, 'victor');
    assert.equal(ok.player.isAdmin, true);
    assert.ok(ok.token.length > 20);
    const bad = await post('/site/login', { login: 'kaito', password: 'errada' }, { [SITE_CLIENT_IP_HEADER]: '2.2.2.2' });
    assert.equal(bad.statusCode, 401);
    assert.deepEqual(failed, ['kaito']);
    for (let i = 1; i < SITE_LOGIN_LIMITS.perIp; i++) await post('/site/login', { login: 'kaito', password: SENHA }, { [SITE_CLIENT_IP_HEADER]: '2.2.2.2' });
    assert.equal((await post('/site/login', { login: 'kaito', password: SENHA }, { [SITE_CLIENT_IP_HEADER]: '2.2.2.2' })).statusCode, 429);
    assert.equal((await post('/site/login', { login: 'kaito', password: SENHA }, { [SITE_CLIENT_IP_HEADER]: '3.3.3.3' })).statusCode, 200, 'outro visitante entra');
  });

  it('eleição ao vivo: candidatos com votos; votar pelas regras do banco; o voto aparece em "me"', async () => {
    const token = await login('kiri', '4.4.4.4');
    const me = (await get('/site/me', bearer(token))).json();
    assert.equal(me.profile.username, 'kiri');
    assert.equal(me.vote.allowed, true);
    assert.deepEqual(me.election.candidates.map((c: any) => [c.username, c.votes]), [['cand_a', 0], ['cand_b', 0]]);
    const voted = await post('/site/kage/vote', { candidateId: ids.cand_b }, bearer(token));
    assert.equal(voted.statusCode, 200);
    assert.equal(voted.json().me.election.myVote, ids.cand_b);
    assert.deepEqual(voted.json().me.vote, { allowed: false, reason: 'Você já votou nesta eleição.' });
    const again = await post('/site/kage/vote', { candidateId: ids.cand_a }, bearer(token));
    assert.equal(again.statusCode, 409);
    assert.match(again.json().error.message, /votou/i);
    const elections = (await get('/site/elections')).json();
    const nevoa = elections.open.find((e: any) => e.village === 'vila_3');
    assert.deepEqual(nevoa.candidates.map((c: any) => [c.username, c.votes]), [['cand_a', 0], ['cand_b', 1]]);
    assert.equal(nevoa.totalVotes, 1);
    assert.equal(elections.open.find((e: any) => e.village === 'vila_1').candidates.length, 0);
  });

  it('quem não pode votar vê o motivo (conta nova, Academia) e o banco recusa do mesmo jeito', async () => {
    const novo = await login('calouro', '5.5.5.5');
    assert.deepEqual((await get('/site/me', bearer(novo))).json().vote, { allowed: false, reason: 'A conta precisa ter mais de 7 dias para votar.' });
    assert.equal((await post('/site/kage/vote', { candidateId: ids.cand_a }, bearer(novo))).statusCode, 409);
    const aluno = await login('aluno', '5.5.5.6');
    assert.deepEqual((await get('/site/me', bearer(aluno))).json().vote, { allowed: false, reason: 'Só Genin ou acima votam.' });
    assert.equal((await get('/site/me')).statusCode, 401, 'sem o token do jogador');
  });

  it('painel ao vivo: só o admin', async () => {
    assert.equal((await get('/site/admin/live', bearer(await login('kaito', '6.6.6.6')))).statusCode, 403);
    const live = await get('/site/admin/live', bearer(await login('victor', '6.6.6.7')));
    assert.equal(live.statusCode, 200);
    assert.deepEqual(live.json().byMap, { map_1: 2 });
  });
});
