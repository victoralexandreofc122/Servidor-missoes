import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { makeAuthenticate } from '../src/auth/authenticate.js';
import { makeRequireServiceToken, SERVICE_TOKEN_HEADER } from '../src/auth/requireServiceToken.js';
import { SignJWT } from 'jose';
import type { PlayerRequest, ReplyLike } from '../src/http.js';
import { call, JWT_SECRET, playerToken, SERVICE_TOKEN } from './support/harness.js';

const authenticate = makeAuthenticate({ secret: JWT_SECRET });
/** Handler mínimo de rota protegida: responde 200 com o id autenticado. */
const echo = async (request: PlayerRequest, reply: ReplyLike) => reply.code(200).send({ player: request.player?.id });
const requireServiceToken = makeRequireServiceToken(SERVICE_TOKEN);
const req = (headers: PlayerRequest['headers']): PlayerRequest => ({ params: {}, body: {}, headers });

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (err: any) => err.code === code && err.status === 401);
}

describe('authenticate (JWT de jogador)', () => {
  it('token válido coloca o sub em request.player.id', async () => {
    const id = randomUUID();
    const r = req({ authorization: `Bearer ${await playerToken(id)}` });
    await authenticate(r);
    assert.equal(r.player?.id, id);
  });

  it('sem header, header sem Bearer ou token vazio: 401', async () => {
    await rejectsWith(authenticate(req({})), 'UNAUTHENTICATED');
    await rejectsWith(authenticate(req({ authorization: 'Basic abc' })), 'UNAUTHENTICATED');
    await rejectsWith(authenticate(req({ authorization: 'Bearer ' })), 'UNAUTHENTICATED');
  });

  it('assinado com outro segredo: 401', async () => {
    const t = await playerToken(randomUUID(), { secret: 'outro-segredo-qualquer-com-32-caracteres!' });
    await rejectsWith(authenticate(req({ authorization: `Bearer ${t}` })), 'UNAUTHENTICATED');
  });

  it('expirado (além da folga de 5 s): 401', async () => {
    const t = await playerToken(randomUUID(), { expiresIn: '-10s' });
    await rejectsWith(authenticate(req({ authorization: `Bearer ${t}` })), 'UNAUTHENTICATED');
  });

  it('algoritmo diferente de HS256 (troca de algoritmo): 401', async () => {
    const t = await playerToken(randomUUID(), { alg: 'HS512' });
    await rejectsWith(authenticate(req({ authorization: `Bearer ${t}` })), 'UNAUTHENTICATED');
  });

  it('alg "none" (token sem assinatura): 401', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const t = `${b64({ alg: 'none' })}.${b64({ sub: randomUUID(), exp: Math.floor(Date.now() / 1000) + 60 })}.`;
    await rejectsWith(authenticate(req({ authorization: `Bearer ${t}` })), 'UNAUTHENTICATED');
  });

  it('sub que não é UUID: 401', async () => {
    const t = await playerToken('admin');
    await rejectsWith(authenticate(req({ authorization: `Bearer ${t}` })), 'UNAUTHENTICATED');
  });

  it('recusa configurar segredo com menos de 32 caracteres (e aceita exatamente 32)', () => {
    assert.throws(() => makeAuthenticate({ secret: 'curto' }), /pelo menos 32 caracteres/);
    assert.throws(() => makeAuthenticate({ secret: 'x'.repeat(31) }), /pelo menos 32 caracteres/);
    assert.doesNotThrow(() => makeAuthenticate({ secret: 'x'.repeat(32) }));
  });

  // ---- correção 2: esquema case-insensitive (RFC 7235)
  it('"bearer" minúsculo passa (200); "Basic <jwt válido>" continua 401', async () => {
    const token = await playerToken(randomUUID());
    const ok = await call(echo, { headers: { authorization: `bearer ${token}` } }, [authenticate]);
    assert.equal(ok.status, 200);
    const upper = await call(echo, { headers: { authorization: `BEARER ${token}` } }, [authenticate]);
    assert.equal(upper.status, 200);
    const basic = await call(echo, { headers: { authorization: `Basic ${token}` } }, [authenticate]);
    assert.equal(basic.status, 401);
    assert.equal(basic.body.error.code, 'UNAUTHENTICATED');
  });

  it('"Bearer  <jwt>" com dois espaços passa (o trim resolve)', async () => {
    const token = await playerToken(randomUUID());
    const r = await call(echo, { headers: { authorization: `Bearer  ${token}` } }, [authenticate]);
    assert.equal(r.status, 200);
  });

  // ---- correção 3: erro que não é do jose também vira 401, não 500
  it('erro inesperado dentro do verificador vira 401 (e o original fica só em cause)', async () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'alg')");
    const broken = makeAuthenticate({ secret: JWT_SECRET }, async () => { throw bug; });
    await assert.rejects(broken(req({ authorization: `Bearer ${await playerToken(randomUUID())}` })),
      (e: any) => e.status === 401 && e.code === 'UNAUTHENTICATED' && e.cause === bug);
    const r = await call(echo, { headers: { authorization: 'Bearer qualquer' } }, [broken]);
    assert.equal(r.status, 401);
    assert.doesNotMatch(JSON.stringify(r.body), /TypeError|Cannot read|alg/);
  });

  // ---- correção 4: clockTolerance de 5 s
  it('tolera 5 s de relógio: 3 s fora passa, 10 s fora não', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = (claims: { iat: number; nbf?: number; exp: number }) => {
      const jwt = new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(randomUUID())
        .setIssuedAt(claims.iat).setExpirationTime(claims.exp);
      if (claims.nbf !== undefined) jwt.setNotBefore(claims.nbf);
      return jwt.sign(new TextEncoder().encode(JWT_SECRET));
    };
    const tryToken = async (t: string) => (await call(echo, { headers: { authorization: `Bearer ${t}` } }, [authenticate])).status;

    // emissor 3 s adiantado: iat/nbf 3 s no futuro
    assert.equal(await tryToken(await token({ iat: now + 3, nbf: now + 3, exp: now + 300 })), 200);
    // token que venceu há 3 s
    assert.equal(await tryToken(await token({ iat: now - 300, exp: now - 3 })), 200);
    // fora da folga: continua recusado
    assert.equal(await tryToken(await token({ iat: now + 10, nbf: now + 10, exp: now + 300 })), 401);
    assert.equal(await tryToken(await token({ iat: now - 300, exp: now - 10 })), 401);
  });

  it('issuer/audience configurados são exigidos', async () => {
    const strict = makeAuthenticate({ secret: JWT_SECRET, issuer: 'auth', audience: 'game' });
    await rejectsWith(strict(req({ authorization: `Bearer ${await playerToken(randomUUID())}` })), 'UNAUTHENTICATED');
  });
});

describe('requireServiceToken (rotas /internal)', () => {
  it('token certo passa', async () => {
    await requireServiceToken(req({ [SERVICE_TOKEN_HEADER]: SERVICE_TOKEN }));
  });

  it('token errado, ausente ou JWT de jogador: 401', async () => {
    await assert.rejects(requireServiceToken(req({ [SERVICE_TOKEN_HEADER]: SERVICE_TOKEN + 'x' })), (e: any) => e.code === 'SERVICE_UNAUTHORIZED');
    await assert.rejects(requireServiceToken(req({})), (e: any) => e.code === 'SERVICE_UNAUTHORIZED');
    const jwt = await playerToken(randomUUID());
    await assert.rejects(requireServiceToken(req({ authorization: `Bearer ${jwt}` })), (e: any) => e.code === 'SERVICE_UNAUTHORIZED');
  });

  it('recusa configurar token curto', () => {
    assert.throws(() => makeRequireServiceToken('curto'));
  });
});
