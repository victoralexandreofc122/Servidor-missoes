# servidor-missoes

API do ciclo de missões de sensei (Fastify + TypeScript + `pg`, SQL puro).
O banco (`db/schema_ranks_missoes_sensei.sql`, v2) valida as regras de negócio;
o servidor valida **quem está chamando** e traduz os erros para português.

**Deploy pelo celular (Neon + GitHub + Render): veja [DEPLOY.md](DEPLOY.md).**

## Rodar (com terminal)

```bash
npm install
cp .env.example .env              # preencha os segredos
psql "$DATABASE_URL" -f db/schema_ranks_missoes_sensei.sql
psql "$DATABASE_URL" -f db/schema_v3_auth.sql      # migração v3: login
npm run dev
```

- API pública: `PUBLIC_HOST:PORT` (cliente do jogo, JWT de jogador). `GET /health` responde sem banco.
- API interna: `INTERNAL_HOST:INTERNAL_PORT` (servidor de jogo, header `x-service-token`).
  Fica em 127.0.0.1: nunca exponha esta porta para a internet.

## Endpoints

| Método e rota | Quem chama | Auth |
|---|---|---|
| `GET /health` | Render (health check) | nenhuma |
| `POST /auth/register` | jogador novo | nenhuma (limite: 5/min por IP) |
| `POST /auth/login` | jogador | nenhuma (limite: 5/min por IP) → devolve o JWT |
| `POST /missions` | sensei | JWT (sensei = `sub`) |
| `PATCH /internal/missions/:id/progress` | servidor de jogo | token de serviço |
| `POST /missions/:id/submit` | aprendiz | JWT + `assertMissionTrainee` |
| `POST /missions/:id/evaluate` | sensei ou substituto Chunin+ | JWT (avaliador = `sub`) |
| `POST /scrolls/:id/redeem` | aprendiz | JWT + checagem do aprendiz |

Erros sempre no formato `{ "error": { "code": "TRAINEE_BUSY", "message": "..." } }`.

### Cadastro e login

```http
POST /auth/register
{ "username": "Kaito", "email": "kaito@exemplo.com", "password": "Shuriken-de-Prata-7" }
-> 201 { "player": { "id", "username", "rank": { "code", "name" }, "total_xp", "created_at" } }

POST /auth/login
{ "email": "kaito@exemplo.com", "password": "..." }      (ou { "username": "Kaito", "password": "..." })
-> 200 { "token": "<JWT>", "expires_at": "...", "player": { ... } }
```

- Senha: 10 a 128 caracteres, com minúscula, maiúscula e número, sem conter o nome de usuário.
- Nome: 3 a 24 caracteres, letras sem acento, números ou `_`. E-mail e nome são únicos (sem diferenciar maiúsculas).
- A senha vira hash scrypt (`node:crypto`, sem dependência nova). O JWT vale 7 dias e vai no header
  `Authorization: Bearer <token>` das outras rotas.
- Erros: `EMAIL_TAKEN` e `USERNAME_TAKEN` (409), `INVALID_INPUT` (400), `INVALID_CREDENTIALS` (401, a mesma
  resposta para conta inexistente e senha errada), `RATE_LIMITED` (429).

## Tempo real (WebSocket)

`wss://<servidor>/game?token=<JWT do login>`, na mesma porta da API pública. O JWT é validado antes
do upgrade: token ausente, inválido ou vencido recebe HTTP 401 e não conecta.

| Direção | Mensagem |
|---|---|
| cliente → servidor | `{"type":"move","x":11,"y":10}` · `{"type":"chat","message":"Olá!"}` |
| ao conectar | `{"type":"welcome","you":{id,username,x,y},"players":[...os outros online]}` |
| para os outros | `player_joined` · `player_moved {playerId,x,y}` (a cada tick de 50 ms) · `player_left {playerId}` |
| para todos | `chat {playerId,username,message}` |
| só para quem enviou | `move_rejected {x,y,reason}` (`TOO_FAST`, `OUT_OF_BOUNDS`) · `error {code,message}` |

Regras (em `src/realtime/config.ts`):

- Mapa de 100 × 100 casas, nascimento em (10, 10).
- Até 5 casas por segundo, com folga de 5.
- Anti-flood: 20 mensagens/s, com rajada de 30. Mais de 100 descartadas em 1 s fecha a conexão (1008).
- Chat: 1 mensagem/s (rajada de 3), até 200 caracteres.
- Mensagem acima de 1 KiB fecha a conexão (1009).
- O mesmo jogador conectando de novo derruba a conexão antiga (4000).

O estado fica em memória: reinício ou deploy do Render desconecta todos e as posições voltam ao início.

## Scripts

| Script | O que faz |
|---|---|
| `npm test` | Todos os testes. A integração com PostgreSQL só roda com `TEST_DATABASE_URL` |
| `npm run build` | Compila `src/` para `dist/` |
| `npm start` | Sobe `dist/server.js` |
| `npm run verify` | Typecheck + testes + build (é o que o Render roda no deploy) |

## Testes com banco

```bash
TEST_DATABASE_URL=postgres://usuario:senha@localhost:5432/postgres npm test
```

O role precisa de `CREATEDB`: cada execução cria um banco novo, aplica o schema e apaga no fim.
