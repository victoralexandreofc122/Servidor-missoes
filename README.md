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

## Cliente web (public/)

`GET /` abre o jogo no navegador (celular ou computador), servido pela própria API: mesma origem,
então não precisa de CORS. São três arquivos (`index.html`, `game.js`, `styles.css`), sem bibliotecas,
servidos de uma lista fechada com CSP (`script-src 'self'`) e ETag.

- **Tela:** login e cadastro.
- **Mapa:** canvas que se ajusta à tela, com a câmera seguindo o jogador.
- **Mapa:** grade sobre o chão verde, desenhado em blocos guardados em memória (poucas imagens por quadro).
- **Personagem:** círculo com a inicial do nome.
- **Controles:** joystick flutuante à esquerda (nasce onde o polegar toca) e 7 habilidades à direita, cada uma com uma animação.
- **Chat:** botão 💬 no topo abre a barra de digitação; as mensagens aparecem na tela e somem em ~6 s.
- **No computador:** WASD ou setas para andar, 1 a 7 para as habilidades, Enter para o chat.

O token fica no `localStorage` e vai no subprotocolo do WebSocket, nunca na URL.

## Tempo real (WebSocket)

`wss://<servidor>/game`, na mesma porta da API pública. O JWT é validado antes do upgrade: token
ausente, inválido ou vencido recebe HTTP 401 e não conecta. O token pode vir:

- pelo subprotocolo `nin.v1, jwt.<JWT>` (cliente web);
- por `Authorization: Bearer` (apps nativos);
- por `?token=` (só para teste manual).

| Direção | Mensagem |
|---|---|
| cliente → servidor | `{"type":"move","dx":0.5,"dy":-0.5}` (joystick, -1 a 1; `0,0` para) · `{"type":"cast","skill":"fire"}` · `{"type":"chat","message":"Olá!"}` |
| ao conectar | `welcome {you, players (os outros), world {width,height,speed,tickMs}}` |
| a cada tick (50 ms) | `player_moved {playerId,x,y}` para todos, inclusive quem andou |
| entradas e saídas | `player_joined` · `player_left` |
| para todos | `chat {playerId,username,message}` |
| só para quem enviou | `error {code,message}` |

Habilidades: `fire`, `water`, `taijutsu`, `illusion`, `shadow`, `stone`, `heal` (Fogo, Água, Taijutsu, Ilusão,
Sombra, Pedra, Cura). Hoje só são validadas, sem efeito no jogo; a animação é só no cliente.

Regras (em `src/realtime/config.ts`):

- **Movimento autoritativo:** o cliente manda só a direção e o servidor anda 5 casas/s. Speed hack não existe.
- **Mapa:** 100 × 100 casas, nascimento em (10, 10).
- **Anti-flood:** 20 mensagens/s, com rajada de 30. Mais de 100 descartadas em 1 s fecha a conexão (1008).
- **Chat:** 1 mensagem/s (rajada de 3), até 200 caracteres.
- **Tamanho:** mensagem acima de 1 KiB fecha a conexão (1009).
- **Mesma conta:** conectando de novo, derruba a conexão antiga (4000).

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
