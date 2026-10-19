import { FakeReply } from './harness.js';

type Hook = (request: any, reply: any, payload?: unknown) => Promise<unknown> | unknown;
interface Route { method: string; url: string; onRequest: Hook[]; preHandler: Hook[]; handler: Hook }

export interface InjectOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  payload?: unknown;
  remoteAddress?: string;
}

/**
 * Imitação mínima do FastifyInstance para testar a MONTAGEM das instâncias sem o
 * Fastify instalado. Segue a ordem do Fastify:
 *   onRequest da instância -> roteamento (404 se não achar) -> onRequest da rota ->
 *   preHandler da rota -> handler; qualquer erro vai para o setErrorHandler; se um
 *   hook já respondeu (reply.send), o resto do ciclo é pulado; onSend roda sempre
 *   antes de devolver a resposta. O app.inject.test.ts confirma o mesmo com o Fastify real.
 */
export class FakeFastify {
  readonly hooks: { name: string; fn: Hook }[] = [];
  readonly routes: Route[] = [];
  errorHandler?: (err: unknown, request: any, reply: any) => unknown;
  notFoundHandler?: Hook;
  readonly log = { error() {}, info() {}, warn() {}, debug() {} };

  addHook(name: string, fn: Hook) { this.hooks.push({ name, fn }); return this; }
  setErrorHandler(fn: FakeFastify['errorHandler']) { this.errorHandler = fn; return this; }
  setNotFoundHandler(fn: Hook) { this.notFoundHandler = fn; return this; }

  private add(method: string, url: string, a: any, b?: any) {
    const opts = b ? a : {};
    const handler = b ?? a;
    const list = (x: unknown): Hook[] => (x ? ([] as Hook[]).concat(x as Hook) : []);
    this.routes.push({ method, url, onRequest: list(opts.onRequest), preHandler: list(opts.preHandler), handler });
    return this;
  }
  get(url: string, a: any, b?: any) { return this.add('GET', url, a, b); }
  post(url: string, a: any, b?: any) { return this.add('POST', url, a, b); }
  patch(url: string, a: any, b?: any) { return this.add('PATCH', url, a, b); }

  private match(method: string, url: string) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const names: string[] = [];
      const re = new RegExp('^' + r.url.replace(/:([a-z_]+)/g, (_m, n) => (names.push(n), '([^/]+)')) + '$');
      const m = url.match(re);
      if (m) return { route: r, params: Object.fromEntries(names.map((n, i) => [n, m[i + 1]])) };
    }
    return undefined;
  }

  private named(name: string) { return this.hooks.filter((x) => x.name === name).map((x) => x.fn); }

  async inject(opts: InjectOptions) {
    const reply = new FakeReply();
    const found = this.match(opts.method, opts.url);
    const request = {
      method: opts.method, url: opts.url, headers: opts.headers ?? {}, body: opts.payload,
      params: found?.params ?? {}, log: this.log,
      ip: opts.remoteAddress ?? '127.0.0.1',
      routeOptions: { url: found?.route.url },
    };
    let handlerCalled = false;
    try {
      const stages: Hook[] = [...this.named('onRequest')];
      for (const h of stages) { await h(request, reply); if (reply.sent) break; }
      if (!reply.sent) {
        if (!found) {
          if (!this.notFoundHandler) return { statusCode: 404, headers: reply.headers, handlerCalled, json: () => ({ semNotFoundHandler: true }) };
          await this.notFoundHandler(request, reply);
        } else {
          for (const h of [...found.route.onRequest, ...found.route.preHandler]) { await h(request, reply); if (reply.sent) break; }
          if (!reply.sent) { handlerCalled = true; await found.route.handler(request, reply); }
        }
      }
    } catch (err) {
      if (!this.errorHandler) return { statusCode: 500, headers: reply.headers, handlerCalled, json: () => ({ semErrorHandler: true }) };
      await this.errorHandler(err, request, reply);
    }
    for (const h of this.named('onSend')) await h(request, reply, reply.payload);
    return { statusCode: reply.statusCode, headers: reply.headers, handlerCalled, json: () => reply.payload };
  }
}
