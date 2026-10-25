import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TokenIssuer } from '../auth/issueToken.js';
import { dummyPasswordHash, verifyPassword } from '../auth/password.js';
import { AUTH_SQL, type PlayerRow } from '../auth/sql.js';
import type { Db } from '../db.js';
import { AppError } from '../errors/AppError.js';
import { SERVER_ERRORS } from '../errors/errorTranslator.js';
import { parseOrThrow, requirePlayerId, type PlayerRequest } from '../http.js';
import { makeRateLimit } from '../plugins/rateLimit.js';
import type { SiteStore } from './siteStore.js';

/*
 * API do site do jogo (Floot), em /site/*, na porta pública. Quem chama é o SERVIDOR do site, nunca o navegador:
 *  - toda rota exige o segredo compartilhado no cabeçalho x-site-token (SITE_TOKEN, só no Render e no Floot);
 *  - fica fora do limite global por IP (todas as visitas chegam do mesmo IP do Floot);
 *  - o login usa o IP do visitante, que o site manda em x-site-client-ip, para o limite de tentativas;
 *  - rotas do jogador: o JWT do jogo em Authorization (o site guarda o token do login, igual ao cliente do jogo).
 * Sem SITE_TOKEN configurado, nada disto existe (404).
 */

export const SITE_TOKEN_HEADER = 'x-site-token';
export const SITE_CLIENT_IP_HEADER = 'x-site-client-ip';

/** Rotas do site, para o limite global por IP pular (o padrão de URL do Fastify). */
export const SITE_ROUTES = [
  '/site/login', '/site/overview', '/site/elections', '/site/ranking/pvp', '/site/ranking/ranks',
  '/site/players/:username', '/site/me', '/site/kage/vote', '/site/admin/live',
] as const;

/** Login do site: por IP do visitante e por conta (quem chuta a senha de uma conta só). */
export const SITE_LOGIN_LIMITS = { perIp: 5, perAccount: 10, windowMs: 10 * 60_000 } as const;

export interface SiteDeps {
  token: string;
  store: SiteStore;
  db: Db;
  issueToken: TokenIssuer;
  authenticate: (request: PlayerRequest) => Promise<void>;
  /** Estado ao vivo do servidor (mundo e saúde). undefined enquanto o mundo não subiu. */
  live: () => object | undefined;
  /** Senha errada no login do site (o sentinela conta tentativas por conta). */
  onFailedLogin?: (login: string, clientIp: string) => void;
  now?: () => number;
}

const LoginBody = z.object({
  login: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
}).strict();
const VoteBody = z.object({ candidateId: z.string().uuid() }).strict();
const RankingQuery = z.object({
  scope: z.enum(['season', 'global']).default('season'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const LimitQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });
const UsernameParams = z.object({ username: z.string().trim().min(1).max(32) });

const digest = (value: string) => createHash('sha256').update(value).digest();

export function registerSiteRoutes(app: FastifyInstance, deps: SiteDeps): void {
  if (deps.token.length < 32) throw new Error('SITE_TOKEN precisa de pelo menos 32 caracteres');
  const expected = digest(deps.token);
  const now = deps.now ?? Date.now;
  const ipLimit = makeRateLimit({ max: SITE_LOGIN_LIMITS.perIp, timeWindowMs: SITE_LOGIN_LIMITS.windowMs, now });
  const accountLimit = makeRateLimit({ max: SITE_LOGIN_LIMITS.perAccount, timeWindowMs: SITE_LOGIN_LIMITS.windowMs, now });
  app.addHook('onClose', async () => {
    ipLimit.close();
    accountLimit.close();
  });

  const requireSite = async (request: FastifyRequest) => {
    const received = request.headers[SITE_TOKEN_HEADER];
    if (typeof received !== 'string' || received.length === 0 || !timingSafeEqual(digest(received), expected)) {
      throw new AppError(SERVER_ERRORS.service_unauthorized);
    }
  };
  const player = async (request: FastifyRequest) => {
    await deps.authenticate(request as unknown as PlayerRequest);
    return requirePlayerId(request as unknown as PlayerRequest);
  };
  const site = { onRequest: requireSite };

  app.post('/site/login', site, async (request, reply) => {
    const body = parseOrThrow(LoginBody, request.body);
    const ip = String(request.headers[SITE_CLIENT_IP_HEADER] ?? 'desconhecido').slice(0, 64);
    // O limite conta TODA tentativa (a certa também): 5 por IP e 10 por conta a cada 10 min.
    for (const [limit, key] of [[ipLimit, `ip:${ip}`], [accountLimit, `conta:${body.login.toLowerCase()}`]] as const) {
      await limit({ ip: key, routeOptions: { url: '/site/login' } }, reply);
      if (reply.sent) return reply;
    }
    const byEmail = body.login.includes('@');
    const { rows } = await deps.db.query<PlayerRow & { password_hash: string | null }>(
      byEmail ? AUTH_SQL.loginByEmail : AUTH_SQL.loginByUsername, [byEmail ? body.login.toLowerCase() : body.login]);
    const row = rows[0];
    const ok = await verifyPassword(body.password, row?.password_hash ?? (await dummyPasswordHash()));
    if (!row || !row.password_hash || !ok) {
      deps.onFailedLogin?.(body.login, ip);
      throw new AppError(SERVER_ERRORS.invalid_credentials);
    }
    const admin = (await deps.db.query<{ is_admin: boolean }>(`SELECT is_admin FROM game.players WHERE id = $1`, [row.id])).rows[0];
    const { token, expiresAt } = await deps.issueToken(row.id);
    return reply.code(200).send({
      token, expiresAt: expiresAt.toISOString(),
      player: { id: row.id, username: row.username, rank: { code: row.rank_code, name: row.rank_name }, isAdmin: admin?.is_admin === true },
    });
  });

  app.get('/site/overview', site, async () => {
    const live = deps.live() as { online?: number } | undefined;
    return { ...(await deps.store.overview()), online: live?.online ?? null, at: new Date(now()).toISOString() };
  });

  app.get('/site/elections', site, async () => deps.store.elections());

  app.get('/site/ranking/pvp', site, async (request) => {
    const q = parseOrThrow(RankingQuery, request.query);
    return deps.store.pvpRanking(q.scope, q.limit);
  });

  app.get('/site/ranking/ranks', site, async (request) => deps.store.ranks(parseOrThrow(LimitQuery, request.query).limit));

  app.get('/site/players/:username', site, async (request, reply) => {
    const { username } = parseOrThrow(UsernameParams, request.params);
    const profile = await deps.store.profile(username);
    if (!profile) return notFound(reply, 'Ninja não encontrado.');
    return profile;
  });

  app.get('/site/me', site, async (request, reply) => {
    const me = await deps.store.me(await player(request));
    if (!me) throw new AppError(SERVER_ERRORS.unauthenticated);
    return reply.send(me);
  });

  app.post('/site/kage/vote', site, async (request, reply) => {
    const id = await player(request);
    const { candidateId } = parseOrThrow(VoteBody, request.body);
    const r = await deps.store.vote(id, candidateId);
    if (!r.ok) return reply.code(409).send({ error: { code: 'VOTE_REFUSED', message: r.text } });
    return { ok: true, me: await deps.store.me(id) };
  });

  app.get('/site/admin/live', site, async (request, reply) => {
    const id = await player(request);
    const admin = (await deps.db.query<{ is_admin: boolean }>(`SELECT is_admin FROM game.players WHERE id = $1`, [id])).rows[0];
    if (admin?.is_admin !== true) return reply.code(403).send({ error: { code: 'ADMIN_ONLY', message: 'Só o administrador vê isto.' } });
    return deps.live() ?? { online: 0, starting: true };
  });
}

function notFound(reply: FastifyReply, message: string) {
  return reply.code(404).send({ error: { code: 'NOT_FOUND', message } });
}
