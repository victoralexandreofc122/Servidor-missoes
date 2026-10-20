import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { makeAuthenticate } from '../src/auth/authenticate.js';
import { makeTokenIssuer, TOKEN_TTL_SECONDS } from '../src/auth/issueToken.js';
import { dummyPasswordHash, hashPassword, SCRYPT_PARAMS, verifyPassword } from '../src/auth/password.js';
import { LoginBody, RegisterBody } from '../src/auth/schemas.js';
import { describeBootError } from '../src/bootErrors.js';
import { parseOrThrow, type PlayerRequest } from '../src/http.js';
import { JWT_SECRET } from './support/harness.js';

const SENHA = 'Kunai-Dourada-2026';

describe('senha (scrypt nativo)', () => {
  it('hash no formato $scrypt$ (o que o banco exige), sem a senha dentro, com sal novo a cada vez', async () => {
    const a = await hashPassword(SENHA);
    const b = await hashPassword(SENHA);
    const { ln, r, p } = SCRYPT_PARAMS;
    assert.match(a, new RegExp(`^\\$scrypt\\$ln=${ln},r=${r},p=${p}\\$[A-Za-z0-9+/]+\\$[A-Za-z0-9+/]+$`));
    assert.ok(!a.includes(SENHA) && !a.toLowerCase().includes('kunai'));
    assert.notEqual(a, b, 'mesmo texto, hashes diferentes (sal aleatório)');
  });

  it('confere a senha certa e recusa a errada', async () => {
    const h = await hashPassword(SENHA);
    assert.equal(await verifyPassword(SENHA, h), true);
    assert.equal(await verifyPassword('Kunai-Dourada-2025', h), false);
    assert.equal(await verifyPassword(SENHA.toLowerCase(), h), false);
    assert.equal(await verifyPassword('', h), false);
  });

  it('acentos: "é" composto e decomposto valem a mesma senha (NFC)', async () => {
    const h = await hashPassword('Café-Ninja-2026');
    assert.equal(await verifyPassword('Café-Ninja-2026', h), true);
  });

  it('hash adulterado, truncado ou com custo absurdo é "senha errada", nunca exceção', async () => {
    const h = await hashPassword(SENHA);
    for (const bad of ['', SENHA, 'scrypt$x', h.slice(0, -10), h.replace('ln=14', 'ln=30'), h.replace('p=5', 'p=99'), h.replace('$scrypt$', '$bcrypt$')]) {
      assert.equal(await verifyPassword(SENHA, bad), false, bad);
    }
  });

  it('hash descartável do login (conta inexistente) é calculado uma vez e nunca bate', async () => {
    const [a, b] = await Promise.all([dummyPasswordHash(), dummyPasswordHash()]);
    assert.equal(a, b);
    assert.equal(await verifyPassword(SENHA, a), false);
  });
});

describe('JWT emitido no login', () => {
  const req = (token: string): PlayerRequest => ({ params: {}, body: {}, headers: { authorization: `Bearer ${token}` } });

  it('é aceito pelo authenticate que já existe: sub vira request.player.id', async () => {
    const id = randomUUID();
    const { token } = await makeTokenIssuer({ secret: JWT_SECRET })(id);
    const r = req(token);
    await makeAuthenticate({ secret: JWT_SECRET })(r);
    assert.equal(r.player?.id, id);
  });

  it('HS256, exp em 7 dias, iat presente', async () => {
    const before = Math.floor(Date.now() / 1000);
    const { token, expiresAt } = await makeTokenIssuer({ secret: JWT_SECRET })(randomUUID());
    assert.equal(decodeProtectedHeader(token).alg, 'HS256');
    const claims = decodeJwt(token);
    assert.equal(TOKEN_TTL_SECONDS, 604_800);
    assert.equal(claims.exp! - claims.iat!, TOKEN_TTL_SECONDS);
    assert.ok(claims.iat! >= before && claims.iat! <= before + 2);
    assert.equal(expiresAt.getTime(), claims.exp! * 1000);
  });

  it('com JWT_ISSUER/JWT_AUDIENCE: o emissor põe iss/aud e o authenticate configurado igual aceita', async () => {
    const opts = { secret: JWT_SECRET, issuer: 'nin-online-auth', audience: 'nin-online-game' };
    const { token } = await makeTokenIssuer(opts)(randomUUID());
    await makeAuthenticate(opts)(req(token));
    // emissor sem iss/aud + authenticate exigindo iss/aud: recusado (401)
    const { token: semIss } = await makeTokenIssuer({ secret: JWT_SECRET })(randomUUID());
    await assert.rejects(makeAuthenticate(opts)(req(semIss)), (e: any) => e.status === 401);
  });

  it('segredo curto é recusado na criação, como no authenticate', () => {
    assert.throws(() => makeTokenIssuer({ secret: 'curto' }), /32 caracteres/);
  });
});

describe('validação do cadastro e do login (Zod)', () => {
  const problems = (body: unknown) => {
    try {
      parseOrThrow(RegisterBody, body);
      return [];
    } catch (err: any) {
      assert.equal(err.status, 400);
      return err.details as { field: string; problem: string }[];
    }
  };
  const ok = { username: 'kaito_99', email: 'Kaito@Exemplo.com ', password: SENHA };

  it('aceita o corpo válido e normaliza o e-mail (minúsculo, sem espaço)', () => {
    assert.deepEqual(parseOrThrow(RegisterBody, ok), { username: 'kaito_99', email: 'kaito@exemplo.com', password: SENHA });
  });

  it('senha fraca: cada regra que falta aparece em details, e a senha nunca aparece na mensagem', () => {
    const casos: [string, RegExp][] = [
      ['Curta1', /mínimo de 10/],
      ['semmaiuscula123', /maiúscula/],
      ['SEMMINUSCULA123', /minúscula/],
      ['SemNumeroNenhum', /número/],
      ['Kaito_99-Forte1', /nome de usuário/],
      ['A1' + 'a'.repeat(130), /máximo de 128/],
    ];
    for (const [password, esperado] of casos) {
      const d = problems({ ...ok, password });
      assert.ok(d.length > 0, password);
      assert.ok(d.every((x) => x.field === 'password'), password);
      assert.ok(d.some((x) => esperado.test(x.problem)), `${password}: ${JSON.stringify(d)}`);
      assert.ok(!JSON.stringify(d).includes(password), 'a senha não volta na resposta');
    }
  });

  it('username e e-mail inválidos', () => {
    assert.deepEqual(problems({ ...ok, username: 'ab' }).map((x) => x.field), ['username']);
    assert.deepEqual(problems({ ...ok, username: 'nome com espaço' }).map((x) => x.field), ['username']);
    assert.deepEqual(problems({ ...ok, email: 'nao-e-email' }).map((x) => x.field), ['email']);
    assert.deepEqual(problems({ username: 'kaito_99' }).map((x) => x.field).sort(), ['email', 'password']);
  });

  it('login: e-mail OU username (exatamente um) + senha', () => {
    assert.equal(parseOrThrow(LoginBody, { email: ' A@B.com', password: 'x' }).email, 'a@b.com');
    assert.equal(parseOrThrow(LoginBody, { username: 'kaito_99', password: 'x' }).username, 'kaito_99');
    assert.throws(() => parseOrThrow(LoginBody, { password: 'x' }), (e: any) => e.status === 400);
    assert.throws(() => parseOrThrow(LoginBody, { email: 'a@b.com', username: 'kaito_99', password: 'x' }), (e: any) => e.status === 400);
    assert.throws(() => parseOrThrow(LoginBody, { email: 'a@b.com' }), (e: any) => e.status === 400);
  });

  it('boot sem a migração v3: instrução clara no log do Render', () => {
    const msg = describeBootError({ code: '42703', message: 'column "email" does not exist' });
    assert.match(msg, /db\/schema_v3_auth\.sql/);
    assert.match(msg, /Manual Deploy/);
  });

  it('boot sem a migração v6: aponta o arquivo do visual', () => {
    const msg = describeBootError({ code: '42703', message: 'column "appearance" does not exist' });
    assert.match(msg, /db\/schema_v6_aparencia\.sql/);
  });

  it('boot sem a migração v5: aponta o arquivo certo (nível, atributos e kits)', () => {
    const msg = describeBootError({ code: '42703', message: 'column "level" does not exist' });
    assert.match(msg, /db\/schema_v5_atributos\.sql/);
    assert.match(msg, /Manual Deploy/);
  });
});
