import { buildInternalApp, buildPublicApp } from './app.js';
import type { AppSettings } from './appSetup.js';
import { makeAuthenticate, type JwtOptions } from './auth/authenticate.js';
import { makeTokenIssuer } from './auth/issueToken.js';
import { AUTH_SQL } from './auth/sql.js';
import { makeRequireServiceToken } from './auth/requireServiceToken.js';
import { describeBootError } from './bootErrors.js';
import { makeFindPlayer } from './realtime/findPlayer.js';
import { REALTIME } from './realtime/config.js';
import { attachGameGateway } from './realtime/gateway.js';
import { makeProgression } from './realtime/progression.js';
import { loadPublicFiles, type StaticFile } from './web/staticFiles.js';
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
const publicApp = buildPublicApp({
  db,
  authenticate,
  issueToken: makeTokenIssuer(jwtOptions),
  publicFiles,
}, settings);

// Tempo real: WebSocket em /game na MESMA porta pública, com o MESMO authenticate do HTTP.
const gateway = attachGameGateway(publicApp.server, {
  authenticate,
  findPlayer: makeFindPlayer(db),
  progression: makeProgression(db, REALTIME.combat.promotion),   // XP do combate vai para game.players
  log: publicApp.log,
});
const internalApp = buildInternalApp({ db, requireServiceToken: makeRequireServiceToken(config.SERVICE_TOKEN) }, settings);

const proxyWarning = trustProxyWarning(config);
if (proxyWarning) publicApp.log.warn(proxyWarning);

async function closeAll() {
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
  await closeAll();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  // Falha cedo, com instrução no log: banco inacessível ou schema não aplicado
  // derrubam a subida (o Render mantém a versão anterior), não a 1ª requisição.
  await db.query('SELECT 1 FROM game.ranks LIMIT 1');   // schema v2
  await db.query(AUTH_SQL.bootCheck);                    // migração v3 (login)
  await internalApp.listen({ host: config.INTERNAL_HOST, port: config.INTERNAL_PORT });
  await publicApp.listen({ host: config.PUBLIC_HOST, port: config.PORT });
} catch (err) {
  publicApp.log.fatal({ err }, `[boot] ${describeBootError(err)}`);
  await closeAll();
  process.exit(1);
}
