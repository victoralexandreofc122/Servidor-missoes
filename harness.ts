import { SignJWT } from 'jose';
import type { Db, Queryable, TxClient } from '../../src/db.js';
import { sendError } from '../../src/errors/sendError.js';
import type { PlayerRequest, ReplyLike } from '../../src/http.js';

export const JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
export const SERVICE_TOKEN = 'token-de-servico-de-teste-com-32-caracteres+';

export async function playerToken(sub: string, opts: { secret?: string; expiresIn?: string; alg?: string } = {}) {
  return new SignJWT({})
    .setProtectedHeader({ alg: opts.alg ?? 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '5m')
    .sign(new TextEncoder().encode(opts.secret ?? JWT_SECRET));
}

/** Imita o FastifyReply: guarda status e o corpo já serializado em JSON. */
export class FakeReply implements ReplyLike {
  statusCode = 200;
  payload: any;
  sent = false;
  readonly headers: Record<string, string> = {};
  code(statusCode: number) {
    this.statusCode = statusCode;
    return this;
  }
  header(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }
  send(payload?: unknown) {
    this.payload = payload === undefined ? undefined : JSON.parse(JSON.stringify(payload));
    this.sent = true;
    return this;
  }
}

type Hook = (request: PlayerRequest) => Promise<void>;
type Handler = (request: PlayerRequest, reply: ReplyLike) => Promise<unknown>;

const silentLog = { error() {}, info() {} };

/**
 * Executa como o Fastify faria: hooks (preHandler) -> handler; qualquer erro vai
 * para o mesmo sendError do setErrorHandler. Devolve { status, body } como o cliente veria.
 */
export async function call(handler: Handler, request: Partial<PlayerRequest>, hooks: Hook[] = []) {
  const req: PlayerRequest = { params: {}, body: {}, headers: {}, ...request };
  const reply = new FakeReply();
  try {
    for (const hook of hooks) await hook(req);
    await handler(req, reply);
  } catch (err) {
    sendError(err, reply, silentLog);
  }
  return { status: reply.statusCode, body: reply.payload };
}

/** Db que registra cada SQL executado (para provar o que chegou ou não ao banco). */
export function spyDb(inner: Db) {
  const statements: string[] = [];
  const wrap = (q: Queryable): Queryable => ({
    query(text, values) {
      statements.push(text.replace(/\s+/g, ' ').trim());
      return q.query(text, values);
    },
  });
  const db: Db = {
    ...wrap(inner),
    async connect(): Promise<TxClient> {
      const client = await inner.connect();
      return { ...wrap(client), release: () => client.release() };
    },
  };
  return { db, statements };
}
