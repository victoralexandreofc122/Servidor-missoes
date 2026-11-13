import { buildInternalApp, buildPublicApp } from './app.js';
import type { AppSettings } from './appSetup.js';
import { makeAuthenticate, type JwtOptions } from './auth/authenticate.js';
import { makeTokenIssuer } from './auth/issueToken.js';
import { AUTH_SQL } from './auth/sql.js';
import { makeRequireServiceToken } from './auth/requireServiceToken.js';
import { describeBootError } from './bootErrors.js';
import { makeFindPlayer } from './realtime/findPlayer.js';
import { makeAdminStore } from './realtime/admin.js';
import { ENDGAME_SQL, makeEndgameStore } from './realtime/endgameStore.js';
import { RANKED_SQL, makeRankedStore } from './realtime/rankedStore.js';
import { makeSeasonStore } from './realtime/seasonStore.js';
import { makeChampionStore } from './realtime/championStore.js';
import { makeXpBonusStore } from './realtime/xpBonus.js';
import { CHAT_SQL, makeChatLog } from './realtime/chatLog.js';
import { attachGameGateway } from './realtime/gateway.js';
import { makeMissions, MISSIONS_SQL, NPC_MISSION, NPC_SENSEI_ID } from './realtime/missions.js';
import { makeNinjaStore, NINJA_SQL } from './realtime/ninjaStore.js';
import { bootCheckV9, makeProfile, PROFILE_SQL } from './realtime/profile.js';
import { makeProgression } from './realtime/progression.js';
import { loadPublicFiles, type StaticFile } from './web/staticFiles.js';
import { makeSiteStore } from './site/siteStore.js';
import { makeSiteLink, Sentinel, Telemetry } from './site/telemetry.js';
import { translateError } from './errors/errorTranslator.js';
import type { Gateway } from './realtime/gateway.js';
import { loadConfig, trustProxyWarning, type Config } from './config.js';
import { createDb, createPool } from './db.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

// Variável faltando ou curta: mensagem clara no log do Render e saída imediata.
let config: Config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`[boot] ${(err as Error).message}. Confira as variáveis em Environment no painel do Render.`);
  process.exit(1);
}

const pool = createPool(config.DATABASE_URL, {
  // Conexão ociosa caiu (Neon suspendeu o banco, rede). Sem este handler o processo morreria.
  // Só é chamado depois que já existem conexões, ou seja, depois de publicApp existir.
  onIdleClientError: (err) => publicApp.log.error({ err }, 'conexão ociosa do banco caiu'),
});
const db = createDb(pool);

const settings: AppSettings = {
  allowedOrigins: config.ALLOWED_ORIGINS,
  trustProxy: config.TRUST_PROXY,
  rateLimit: {
    globalMax: config.RATE_LIMIT_GLOBAL_MAX,
    sensitiveMax: config.RATE_LIMIT_SENSITIVE_MAX,
    authMax: config.RATE_LIMIT_AUTH_MAX,
    windowMs: config.RATE_LIMIT_WINDOW_MS,
  },
};

// Quem emite (login) e quem confere (authenticate) usam as MESMAS opções de JWT.
const jwtOptions: JwtOptions = {
  secret: config.JWT_SECRET,
  ...(config.JWT_ISSUER ? { issuer: config.JWT_ISSUER } : {}),
  ...(config.JWT_AUDIENCE ? { audience: config.JWT_AUDIENCE } : {}),
};

// Cliente web (public/): lido uma vez na subida. Faltando arquivo, para com mensagem clara.
let publicFiles: StaticFile[];
try {
  publicFiles = loadPublicFiles();
} catch (err) {
  console.error(`[boot] ${(err as Error).message}`);
  process.exit(1);
}

const authenticate = makeAuthenticate(jwtOptions);
const issueToken = makeTokenIssuer(jwtOptions);
const endgame = makeEndgameStore(db);

// Site do jogo (Floot): saúde, bugs e alertas vão para SITE_URL; as rotas /site/* existem com SITE_TOKEN.
// Sem as duas variáveis, o jogo roda igual (só não manda nada).
let gatewayRef: Gateway | undefined;
const telemetry = new Telemetry({
  link: makeSiteLink(config.SITE_URL, config.SITE_TOKEN),
  budgetMs: 50,
  secrets: [config.DATABASE_URL, config.JWT_SECRET, config.SERVICE_TOKEN, config.SITE_TOKEN ?? ''],
  version: process.env.RENDER_GIT_COMMIT ?? null,                 // o Render preenche com o commit publicado
  live: () => gatewayRef?.world.liveStats(),
  dbPing: async () => {
    const t0 = performance.now();
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('o banco não respondeu em 3 s')), 3_000).unref()),
    ]);
    return performance.now() - t0;
  },
});
const sentinel = new Sentinel(telemetry);

const publicApp = buildPublicApp({
  db,
  authenticate,
  issueToken,
  publicFiles,
  onFailedLogin: (login) => sentinel.failedLogin(login),
  ...(config.SITE_TOKEN ? {
    site: {
      token: config.SITE_TOKEN, store: makeSiteStore(db, endgame), db, issueToken, authenticate,
      live: () => telemetry.current(),
      onFailedLogin: (login: string) => sentinel.failedLogin(login),
    },
  } : {}),
}, settings);

// Erro 500 em qualquer rota: vira alerta no painel do site (sem segredo; a resposta ao cliente não muda).
publicApp.addHook('onError', async (request, _reply, err) => {
  if (translateError(err).status >= 500) telemetry.error('http', err, `${request.method} ${request.routeOptions.url ?? request.url.split('?')[0]}`);
});

/** O log do mundo: o mesmo do Fastify, e o que for erro (com `err`) também vira alerta para o admin. */
const gameLog = {
  info: (obj: object, msg?: string) => publicApp.log.info(obj, msg),
  warn: (obj: object, msg?: string) => {
    publicApp.log.warn(obj, msg);
    const err = (obj as { err?: unknown }).err;
    if (err !== undefined) telemetry.error('jogo', err, msg);
  },
  error: (obj: object, msg?: string) => {
    publicApp.log.error(obj, msg);
    telemetry.error('jogo', (obj as { err?: unknown }).err ?? msg ?? 'erro', msg);
  },
};

// Tempo real: WebSocket em /game na MESMA porta pública, com o MESMO authenticate do HTTP.
const gateway = attachGameGateway(publicApp.server, {
  authenticate,
  findPlayer: makeFindPlayer(db),
  progression: makeProgression(db),                               // XP e ryō do combate vão para game.players
  missions: makeMissions(db),                                     // NPC Mestre + abates em game.sensei_missions
  profile: makeProfile(db),                                       // pontos de atributo, redefinir e kits (v5/v8)
  store: makeNinjaStore(db),                                      // jutsus, tutorial, classes, loja, Extração (v7)
  chatLog: makeChatLog(db),                                       // histórico do chat, 24 h (v8)
  admin: makeAdminStore(db),                                      // comandos /admin auditados (v8)
  endgame,                                                        // vilas, Kage, PvP, renegados, Akatsuki (v11, opcional)
  xpBonus: makeXpBonusStore(db),                                  // bônus de XP do admin (v29, opcional)
  season: makeSeasonStore(db),                                    // eras e Torneio da Temporada (v27, opcional)
  champion: makeChampionStore(db),                                // Torneio dos Heróis e dos Vilões (v33, opcional)
  ranked: makeRankedStore(db),                                    // pontos e temporadas do rankeado (v15, opcional)
  watch: sentinel,                                                // site do jogo: tempo do loop, bugs, suspeitas
  log: gameLog,
});
gatewayRef = gateway;
const internalApp = buildInternalApp({ db, requireServiceToken: makeRequireServiceToken(config.SERVICE_TOKEN) }, settings);

const proxyWarning = trustProxyWarning(config);
if (proxyWarning) publicApp.log.warn(proxyWarning);

async function closeAll() {
  await gateway.flush().catch(() => undefined);   // grava o uso de jutsus que ainda estava em memória
  gateway.close();   // avisa os jogadores (1001) antes de fechar o servidor
  await Promise.allSettled([publicApp.close(), internalApp.close()]);
  await pool.end().catch(() => undefined);
}

// O Render manda SIGTERM ao reciclar ou fazer deploy (e espera até 30 s).
// Fechamos as duas instâncias e o pool em até 10 s; depois disso, saída forçada.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  publicApp.log.info({ signal }, 'encerrando');
  setTimeout(() => {
    publicApp.log.error('encerramento passou do prazo; saindo à força');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
  await telemetry.stop(`Recebeu ${signal}: deploy novo, reinício pelo Render ou servidor parado à mão.`);
  await closeAll();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

// Exceção que ninguém pegou: o processo vai cair (como antes), mas antes o site fica sabendo o motivo.
async function crash(kind: string, err: unknown) {
  publicApp.log.fatal({ err }, kind);
  telemetry.error('processo', err, `${kind}: o servidor vai reiniciar.`);
  await Promise.race([telemetry.flush(), new Promise((r) => setTimeout(r, 2_000).unref())]);
  process.exit(1);
}
process.on('uncaughtException', (err) => void crash('exceção não tratada', err));
process.on('unhandledRejection', (err) => void crash('promessa rejeitada sem tratamento', err));

try {
  // Falha cedo, com instrução no log: banco inacessível ou schema não aplicado
  // derrubam a subida (o Render mantém a versão anterior), não a 1ª requisição.
  await db.query('SELECT 1 FROM game.ranks LIMIT 1');   // schema v2
  await db.query(AUTH_SQL.bootCheck);                    // migração v3 (login)
  await db.query(PROFILE_SQL.bootCheck);                 // migração v5 (nível, atributos, kits)
  await db.query(PROFILE_SQL.bootCheckV6);               // migração v6 (visual do personagem)
  await db.query(NINJA_SQL.bootCheck);                   // migração v7 (progressão: tutorial, ryō, armas)
  await db.query(PROFILE_SQL.bootCheckV8);               // migração v8 (atributo Chakra, admin, pergaminho nas costas)
  await db.query(CHAT_SQL.bootCheck);                    // migração v8 (histórico do chat)
  await bootCheckV9(db);                                 // migração v9 (visual em sprites)
  await db.query(NINJA_SQL.bootCheckV12);                // migração v12 (sapatos: equipamento dos pés)
  await db.query(NINJA_SQL.bootCheckV14);                // migração v14 (acessório: o casaco com capuz)
  // Migração v10 (proteção contra azar na Extração): opcional, sem ela a Extração usa a chance de sempre.
  const v10 = await db.query<{ ok: boolean }>(NINJA_SQL.bootCheckV10);
  if (!v10.rows[0]?.ok) publicApp.log.warn('[boot] Extração sem a proteção contra azar: rode db/schema_v10_design.sql no SQL Editor do Neon (não precisa reiniciar).');
  // Migração v11 (fim de jogo): opcional; sem ela vilas, PvP, renegados e Akatsuki ficam desligados. O servidor confere
  // de novo a cada minuto: aplicar no Neon não precisa reiniciar.
  const v11 = await db.query<{ ok: boolean }>(ENDGAME_SQL.available);
  if (!v11.rows[0]?.ok) publicApp.log.warn('[boot] Fim de jogo desligado: rode db/schema_v11_endgame.sql no SQL Editor do Neon (não precisa reiniciar).');
  // Migração v15 (rankeado): opcional; sem ela as partidas acontecem, só não contam pontos.
  const v15 = await db.query<{ ok: boolean }>(RANKED_SQL.available);
  if (!v15.rows[0]?.ok) publicApp.log.warn('[boot] Rankeado sem pontos: rode db/schema_v15_rankeado.sql no SQL Editor do Neon (não precisa reiniciar).');
  // Migração v4 (NPC Mestre): sem ela o jogo sobe igual, só o Mestre não passa missões.
  const v4 = await db.query(MISSIONS_SQL.bootCheck, [NPC_SENSEI_ID, NPC_MISSION.missionType, NPC_MISSION.difficulty]);
  if (v4.rows.length === 0) publicApp.log.warn('[boot] NPC Mestre sem missões: rode db/schema_v4_npc_missions.sql no SQL Editor do Neon (não precisa reiniciar).');
  await internalApp.listen({ host: config.INTERNAL_HOST, port: config.INTERNAL_PORT });
  await publicApp.listen({ host: config.PUBLIC_HOST, port: config.PORT });
  telemetry.start();
  if (!config.SITE_URL || !config.SITE_TOKEN) publicApp.log.info('[boot] Site do jogo desligado: SITE_URL e SITE_TOKEN vazios (o jogo roda igual).');
} catch (err) {
  publicApp.log.fatal({ err }, `[boot] ${describeBootError(err)}`);
  await closeAll();
  process.exit(1);
}
