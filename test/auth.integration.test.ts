import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { decodeJwt } from 'jose';
import { makeAuthenticate } from '../src/auth/authenticate.js';
import { makeLogin } from '../src/auth/handlers/login.js';
import { makeRegister } from '../src/auth/handlers/register.js';
import { makeTokenIssuer, TOKEN_TTL_SECONDS } from '../src/auth/issueToken.js';
import { makeCreateMission } from '../src/missions/handlers/createMission.js';
import { call, captureLog, JWT_SECRET } from './support/harness.js';
import { createTestDatabase } from './support/testDb.js';

const LEAK = /\b(rule_|ux_|ck_|game\.|constraint|violates|password_hash|scrypt)/i;
const authenticate = makeAuthenticate({ secret: JWT_SECRET });

const noDatabase = process.env.TEST_DATABASE_URL
  ? false
  : 'TEST_DATABASE_URL não definida: integração com PostgreSQL pulada';

describe('cadastro e login (PostgreSQL real, schema v2 + migração v3)', { skip: noDatabase }, () => {
  let t: Awaited<ReturnType<typeof createTestDatabase>>;
  let register: ReturnType<typeof makeRegister>;
  let login: ReturnType<typeof makeLogin>;
  const SENHA = 'Shuriken-de-Prata-7';
  const capture = captureLog();
  const passwordsUsed = new Set<string>([SENHA]);
  const bodies: unknown[] = [];

  async function post(handler: any, body: Record<string, unknown>) {
    if (typeof body.password === 'string') passwordsUsed.add(body.password);
    const res = await call(handler, { body }, [], capture.log);
    bodies.push(res.body);
    return res;
  }

  before(async () => {
    t = await createTestDatabase();
    const deps = { db: t.db, issueToken: makeTokenIssuer({ secret: JWT_SECRET }) };
    register = makeRegister(deps);
    login = makeLogin(deps);
  });

  after(async () => {
    await t?.drop();
  });

  describe('POST /auth/register', () => {
    let kaitoId: string;

    it('sucesso: 201 com dados públicos; nada de senha, hash ou e-mail na resposta', async () => {
      const r = await post(register, { username: 'Kaito', email: '  Kaito@Exemplo.com ', password: SENHA });
      assert.equal(r.status, 201);
      assert.deepEqual(Object.keys(r.body.player).sort(), ['created_at', 'id', 'rank', 'total_xp', 'username']);
      assert.equal(r.body.player.username, 'Kaito');
      assert.deepEqual(r.body.player.rank, { code: 'ACADEMY', name: 'Academia' });
      assert.equal(r.body.player.total_xp, '0');
      assert.match(r.body.player.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/, 'id continua UUIDv7');
      kaitoId = r.body.player.id;
    });

    it('no banco: e-mail normalizado e só o hash scrypt (a senha não está em lugar nenhum da linha)', async () => {
      const { rows } = await t.pool.query('SELECT email, password_hash, row_to_json(p)::text AS linha FROM game.players p WHERE id = $1', [kaitoId]);
      assert.equal(rows[0].email, 'kaito@exemplo.com');
      assert.match(rows[0].password_hash, /^\$scrypt\$ln=14,r=8,p=5\$/);
      assert.ok(!rows[0].linha.includes(SENHA));
    });

    it('e-mail duplicado (mesmo com outra caixa): 409 EMAIL_TAKEN', async () => {
      const r = await post(register, { username: 'Outro_Nome', email: 'KAITO@exemplo.com', password: SENHA });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'EMAIL_TAKEN');
    });

    it('nome duplicado (sem diferenciar maiúsculas): 409 USERNAME_TAKEN', async () => {
      const r = await post(register, { username: 'kaito', email: 'outro@exemplo.com', password: SENHA });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'USERNAME_TAKEN');
    });

    it('senha fraca: 400 INVALID_INPUT com o problema em details, e nada é gravado', async () => {
      const before = (await t.pool.query('SELECT count(*)::int AS n FROM game.players')).rows[0].n;
      const r = await post(register, { username: 'Mei', email: 'mei@exemplo.com', password: 'senha123' });
      assert.equal(r.status, 400);
      assert.equal(r.body.error.code, 'INVALID_INPUT');
      assert.ok(r.body.error.details.every((d: any) => d.field === 'password'));
      assert.ok(r.body.error.details.some((d: any) => /maiúscula/.test(d.problem)));
      assert.ok(r.body.error.details.some((d: any) => /mínimo de 10/.test(d.problem)));
      const after = (await t.pool.query('SELECT count(*)::int AS n FROM game.players')).rows[0].n;
      assert.equal(after, before);
    });

    it('dois cadastros simultâneos com o mesmo e-mail: um 201 e um 409 (o índice único decide)', async () => {
      const [a, b] = await Promise.all([
        post(register, { username: 'Gemeo_A', email: 'gemeos@exemplo.com', password: SENHA }),
        post(register, { username: 'Gemeo_B', email: 'gemeos@exemplo.com', password: SENHA }),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [201, 409]);
      assert.equal((a.status === 409 ? a : b).body.error.code, 'EMAIL_TAKEN');
    });
  });

  describe('POST /auth/login', () => {
    let token: string;
    let kaitoId: string;

    it('sucesso por e-mail (qualquer caixa): 200 { token, expires_at, player }', async () => {
      const r = await post(login, { email: 'KAITO@exemplo.com', password: SENHA });
      assert.equal(r.status, 200);
      assert.deepEqual(Object.keys(r.body).sort(), ['expires_at', 'player', 'token']);
      assert.equal(r.body.player.username, 'Kaito');
      assert.ok(!('password_hash' in r.body.player) && !('email' in r.body.player));
      token = r.body.token;
      kaitoId = r.body.player.id;
    });

    it('sucesso por nome de usuário (sem diferenciar maiúsculas)', async () => {
      const r = await post(login, { username: 'KAITO', password: SENHA });
      assert.equal(r.status, 200);
      assert.equal(r.body.player.id, kaitoId);
    });

    it('JWT: sub = id do jogador, validade de 7 dias, aceito pelo authenticate', async () => {
      const claims = decodeJwt(token);
      assert.equal(claims.sub, kaitoId);
      assert.equal(claims.exp! - claims.iat!, TOKEN_TTL_SECONDS);
      const req = { params: {}, body: {}, headers: { authorization: `Bearer ${token}` } } as any;
      await authenticate(req);
      assert.equal(req.player.id, kaitoId);
    });

    it('o token abre uma rota protegida de verdade (Academia não cria missão: 403, não 401)', async () => {
      const outro = await t.createPlayer('aprendiz_qualquer');
      const r = await call(makeCreateMission({ db: t.db }), {
        headers: { authorization: `Bearer ${token}` },
        body: { trainee_id: outro, mission_type: 'DEFEAT_BOSS', difficulty: 'BASIC', target_code: 'boss_x' },
      }, [authenticate]);
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, 'SENSEI_RANK_REQUIRED');
    });

    it('senha errada: 401 INVALID_CREDENTIALS, sem token', async () => {
      const r = await post(login, { email: 'kaito@exemplo.com', password: 'Shuriken-de-Prata-8' });
      assert.equal(r.status, 401);
      assert.equal(r.body.error.code, 'INVALID_CREDENTIALS');
      assert.equal(r.body.token, undefined);
    });

    it('conta inexistente e conta antiga sem senha: MESMA resposta da senha errada', async () => {
      await t.createPlayer('antigo_sem_login');
      const wrong = await post(login, { email: 'kaito@exemplo.com', password: 'Senha-Errada-123' });
      const ghost = await post(login, { email: 'ninguem@exemplo.com', password: 'Senha-Errada-123' });
      const legacy = await post(login, { username: 'antigo_sem_login', password: 'Senha-Errada-123' });
      assert.deepEqual(ghost, wrong);
      assert.deepEqual(legacy, wrong);
    });
  });

  it('nenhuma senha em texto puro nos logs; nenhuma resposta vaza constraint, hash ou schema', () => {
    const logs = capture.lines.join('\n');
    assert.ok(capture.lines.length > 0, 'os erros passaram pelo logger');
    for (const pw of passwordsUsed) assert.ok(!logs.includes(pw), `senha no log: ${pw}`);
    for (const b of bodies) assert.doesNotMatch(JSON.stringify(b), LEAK);
  });

  it('migração v3 é idempotente: rodar de novo não dá erro nem mexe nos dados', async () => {
    const antes = (await t.pool.query('SELECT count(*)::int AS n FROM game.players WHERE password_hash IS NOT NULL')).rows[0].n;
    await t.pool.query(readFileSync(new URL('../db/schema_v3_auth.sql', import.meta.url), 'utf8'));
    const depois = (await t.pool.query('SELECT count(*)::int AS n FROM game.players WHERE password_hash IS NOT NULL')).rows[0].n;
    assert.equal(depois, antes);
  });
});
