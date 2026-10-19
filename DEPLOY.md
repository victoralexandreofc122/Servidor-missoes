# Deploy pelo celular: Neon + GitHub + Render

No fim você terá a API no ar num endereço como `https://servidor-missoes.onrender.com`,
e `https://servidor-missoes.onrender.com/health` mostrando `{"status":"ok"}`.

| Passo | O que é | Tempo |
|---|---|---|
| 1 | Neon: criar o banco e rodar o schema | ~15 min |
| 2 | GitHub: colocar o código num repositório privado | ~5 min (opção A) |
| 3 | Render: criar o serviço | ~15 min (inclui ~5 min de build) |
| 4 | Verificar | ~5 min |
| 5 | Pós-deploy: o que fazer e o que não fazer | leitura |
| 6 | Atualização v3: login (para quem já está no ar) | ~5 min |
| 7 | Testar o tempo real (WebSocket) pelo Hoppscotch | ~10 min |

**Regra de ouro:** senha do banco, `JWT_SECRET` e `SERVICE_TOKEN` só vão no painel do Render.
Nunca no GitHub, nunca num arquivo, nunca num print compartilhado.

---

## Passo 1 — Neon (banco de dados)

1. Abra **neon.tech** e toque em **Sign up**. Pode usar **Continue with GitHub**.
2. Crie o projeto:
   - **Project name:** `nin-online`
   - **Postgres version:** deixe a padrão
   - **Region:** **AWS US East 2 (Ohio)** (a mesma região do Render, para o banco responder rápido)
   - Toque em **Create project**.
3. Copie a connection string **direta**:
   - Toque em **Connect** (no topo do painel do projeto).
   - **Desligue** a chave **Connection pooling**.
   - Confira: o endereço depois do `@` **não** pode ter `-pooler`.
     Certo: `...@ep-algo-123456.us-east-2.aws.neon.tech/neondb?sslmode=require`
     Errado: `...@ep-algo-123456-pooler.us-east-2.aws.neon.tech/...`
   - Copie e guarde num lugar privado (ela contém a senha do banco).
     Se vier `&channel_binding=require` no fim, pode deixar.
4. Rode o schema:
   - Abra o arquivo `db/schema_ranks_missoes_sensei.sql` (está no zip e no projeto "Nin Online Mobile" do Claude) num app de texto. Selecione tudo e copie.
   - No Neon, abra **SQL Editor**, apague o que estiver lá, cole o arquivo inteiro e toque em **Run**.
5. Confirme. Apague o editor, cole a linha abaixo e toque em **Run**:

   ```
   SELECT count(*) FROM information_schema.tables WHERE table_schema = 'game';
   ```

   Tem que aparecer **11**. Depois teste esta:

   ```
   SELECT code, name FROM game.ranks ORDER BY tier;
   ```

   Tem que aparecer 5 linhas: Academia, Genin, Chunin, Jonin, Specialized Jonin.

   - Erro com **"already exists"**: o schema já tinha sido aplicado. Não rode de novo; siga em frente.
   - Qualquer outro erro: copie a mensagem e mande para o Claude antes de seguir.
6. Rode também a migração do login: apague o editor, cole o arquivo `db/schema_v3_auth.sql` inteiro e toque em **Run**.
   Esta pode rodar de novo sem erro.

---

## Passo 2 — GitHub (código)

### Opção A (recomendada): o Claude envia o código

1. No **github.com**, toque em **+** → **New repository**.
2. **Repository name:** `servidor-missoes` · marque **Private** · **não** marque README, .gitignore nem license (o repositório precisa nascer vazio) · **Create repository**.
3. Volte para a conversa com o Claude e escreva: *"criei o repositório servidor-missoes, pode enviar"*.
   O Claude envia todos os arquivos e confirma o que chegou.

### Opção B: Codespaces (um terminal dentro do navegador)

1. Crie o repositório como na opção A.
2. Na página do repositório: **Code** → **Codespaces** → **Create codespace on main**. Abre um editor com terminal.
3. Arraste o `servidor-missoes.zip` para a lista de arquivos do editor (ou botão direito → **Upload...**).
4. No terminal, rode:

   ```
   unzip servidor-missoes.zip && cp -r servidor-missoes/. . && rm -rf servidor-missoes servidor-missoes.zip
   git add . && git commit -m "API do ciclo de missões" && git push
   ```

5. Bônus: no mesmo terminal, `npm install && npm test` roda os testes com o Fastify de verdade antes do deploy.
6. Feche o codespace quando terminar (o plano grátis tem horas limitadas por mês).

### Opção C: manual, sem terminal (mais demorada)

- O GitHub **não descompacta zip**. Extraia antes: no Android, com **ZArchiver** ou **RAR**; no iPhone, toque no zip no app **Arquivos**.
- O navegador do celular **não envia pastas**, só arquivos. Para cada pasta, use **Add file → Create new file** e digite o caminho com barras (ex.: `src/auth/authenticate.ts`), cole o conteúdo e salve. Depois de a pasta existir, entre nela e use **Add file → Upload files** para os demais arquivos daquela pasta.
- Pastas do projeto: `db`, `src`, `src/auth`, `src/errors`, `src/missions`, `src/missions/handlers`, `src/plugins`, `src/routes`, `src/types`, `test`, `test/support`.
- Arquivos que começam com ponto (`.gitignore`, `.node-version`, `.env.example`) costumam ficar escondidos no seletor de arquivos: crie cada um com **Create new file** e cole o conteúdo.

### Confira (qualquer opção)

Na página do repositório, **na raiz** (não dentro de outra pasta), devem aparecer:
`package.json`, `render.yaml`, `DEPLOY.md`, `.node-version`, `.gitignore`, `db/`, `src/`, `test/`.
**Não** pode aparecer `.env`, `node_modules/` nem `dist/`.

---

## Passo 3 — Render (servidor)

### Opção A (recomendada): Blueprint

1. Abra **render.com** → **Get Started** → entre com o **GitHub**.
   Quando o GitHub perguntar, dê acesso ao repositório `servidor-missoes` (pode escolher **Only select repositories**).
2. Toque em **New** (ou **+**) → **Blueprint** → escolha `servidor-missoes`.
   O Render lê o arquivo `render.yaml` e já preenche: plano **Free**, região **Ohio**, comandos de build e start, health check `/health`.
3. Ele vai pedir **DATABASE_URL**: cole a connection string direta do Passo 1.
4. `JWT_SECRET` e `SERVICE_TOKEN` são gerados pelo próprio Render. Não precisa fazer nada.
5. Confirme (**Apply** / **Deploy Blueprint**). O primeiro build leva uns 5 minutos.

### Opção B: Web Service manual (se o Blueprint não aparecer)

**New** → **Web Service** → escolha `servidor-missoes` e preencha **exatamente**:

| Campo | Valor |
|---|---|
| Name | `servidor-missoes` |
| Region | `Ohio (US East)` |
| Branch | `main` |
| Language / Runtime | `Node` |
| Build Command | `npm install --include=dev && npm run verify` |
| Start Command | `npm start` |
| Instance Type | `Free` |
| Health Check Path (em Advanced) | `/health` |

Variáveis (**Environment** → **Add Environment Variable**, uma por uma):

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |
| `DATABASE_URL` | a connection string direta do Passo 1 |
| `JWT_SECRET` | use o botão **Generate** se aparecer; senão, uma senha aleatória de 40+ letras e números de um gerador (ex.: Bitwarden) |
| `SERVICE_TOKEN` | outro valor gerado, **diferente** do `JWT_SECRET` |

**Não crie** `PORT` (o Render define sozinho) nem `ALLOWED_ORIGINS` (fica vazio de propósito).

> Por que `--include=dev` no build? Com `NODE_ENV=production`, o Render não instala as
> `devDependencies` (TypeScript, tsx, tipos) e o build quebraria com `tsc: not found`.

---

## Passo 4 — Verificar

1. No painel do serviço, abra **Logs**.
   - No build: os testes aparecem com `# pass` e `# fail 0`. Dois grupos aparecem como `# SKIP` com o motivo: a integração com PostgreSQL (não há banco de teste no build) e, só se o Fastify não carregar, o grupo do Fastify real.
   - Na subida: uma linha com `Server listening at http://0.0.0.0:10000` (a porta pode variar).
2. No navegador do celular, abra o endereço do serviço (aparece no topo do painel, `https://...onrender.com`) com `/health` no fim. Tem que mostrar:

   ```
   {"status":"ok"}
   ```

3. Se der errado, procure no log:

| No log aparece | O que fazer |
|---|---|
| `O schema do jogo não existe` | Faça o Passo 1.4 e depois **Manual Deploy → Deploy latest commit** |
| `Falta a migração v3 (login)` | Faça o Passo 6.1 e depois **Manual Deploy → Deploy latest commit** |
| `desligue "Connection pooling"` | Copie a string **sem** `-pooler` (Passo 1.3) e troque `DATABASE_URL` em **Environment** |
| `usuário ou senha` | Copie a connection string de novo no Neon e troque `DATABASE_URL` |
| `Não consegui alcançar o banco` | Confira o host na `DATABASE_URL`; se o Neon estava dormindo, o Render tenta de novo sozinho |
| `Configuração inválida: ...` | Falta uma variável ou ela é curta: confira **Environment** |
| `tsc: not found` ou `Cannot find module 'typescript'` | O Build Command está sem `--include=dev` |
| `not ok` ou `# fail 1` (ou mais) no build | Um teste falhou e o deploy foi barrado (a versão anterior continua no ar). Copie o trecho e mande para o Claude |
| `SECURITY WARNING: The SSL modes 'prefer', 'require'...` | Aviso inofensivo do driver. A conexão está com SSL e certificado verificado. Pode ignorar |

Trocou uma variável? Em **Environment**, use **Save, rebuild, and deploy**.

---

## Passo 5 — Pós-deploy

**Não faça ainda:**

- Não preencha `ALLOWED_ORIGINS`. O app mobile nativo não manda `Origin` e funciona com ela vazia. Só preencha se houver uma versão web em outro domínio, ou se o app virar híbrido (WebView, Capacitor), que manda `Origin`.
- Não mude `TRUST_PROXY`. O Render fica atrás de proxy. Se um dia hospedar num lugar **sem** proxy na frente, aí sim troque para `false`.
- Não rode o schema de novo no Neon (dá "already exists").
- Não coloque segredo nenhum no GitHub.

**Plano grátis:**

- O Render **dorme depois de 15 minutos** sem acesso; o primeiro acesso depois disso demora cerca de 1 minuto.
- O Neon também suspende o banco quando fica ocioso; a primeira consulta depois disso demora um pouco mais.
- Antes de testar com amigos, abra o `/health` 1 ou 2 minutos antes para "acordar" o servidor.
- Limites de horas, memória e espaço mudam com o tempo: confira na página de preços de cada serviço.

**O que ainda não existe (próximas etapas):**

- O servidor de jogo que chama a rota interna `/internal/...`. A porta interna fica em 127.0.0.1 de propósito e não é acessível pela internet.

---

## Passo 6 — Atualização v3: login

Vale para quem já fez os passos 1 a 5. A v3 adiciona cadastro (`POST /auth/register`) e login
(`POST /auth/login`, que devolve o JWT de 7 dias).

1. **Primeiro o banco.** No Neon, abra o **SQL Editor**, cole o arquivo `db/schema_v3_auth.sql` inteiro e toque em **Run**.
   Ele só adiciona as colunas `email` e `password_hash`; o servidor que está no ar continua funcionando.
   Confira com:

   ```
   SELECT column_name FROM information_schema.columns WHERE table_schema = 'game' AND table_name = 'players' AND column_name IN ('email', 'password_hash');
   ```

   Tem que aparecer **2** linhas.
2. **Depois o código.** O Render faz o deploy sozinho quando o código chega no GitHub.
   Se o deploy rodou antes do passo 1, ele falha com `Falta a migração v3 (login)` e a versão anterior
   continua no ar: faça o passo 1 e toque em **Manual Deploy → Deploy latest commit**.
3. **Teste pelo navegador do celular não dá** (são POST). Use um app de requisições HTTP, ou peça ao
   Claude um comando `curl` pronto. Cadastro:

   ```
   POST https://SEU-SERVICO.onrender.com/auth/register
   Content-Type: application/json

   {"username":"Kaito","email":"kaito@exemplo.com","password":"Shuriken-de-Prata-7"}
   ```

   Login: mesmo endereço com `/auth/login` e `{"email":"kaito@exemplo.com","password":"Shuriken-de-Prata-7"}`.
   A resposta traz `token`; nas outras rotas, mande o header `Authorization: Bearer <token>`.

Não precisa criar variável nova no Render. Opcional: `RATE_LIMIT_AUTH_MAX` (padrão 5 tentativas por minuto por IP).

---

## Passo 7 — Testar o tempo real (WebSocket)

Não precisa de nada novo no Render nem no Neon: o WebSocket usa a mesma porta e o mesmo `JWT_SECRET`.
Depois do deploy, use o **Hoppscotch** (hoppscotch.io) no navegador do celular.

1. **Acorde o servidor**: abra `https://SEU-SERVICO.onrender.com/health` e espere o `{"status":"ok"}`.
2. **Duas contas**: em Hoppscotch → **REST**, faça `POST /auth/register` duas vezes, com nomes e e-mails diferentes
   (ex.: `Kaito` e `Mei`), e depois `POST /auth/login` de cada uma. Guarde os dois `token`.
   Tem que ser duas contas: a mesma conta conectando de novo derruba a primeira conexão (código 4000).
3. **Jogador 1**: Hoppscotch → **Realtime** → **WebSocket**. No endereço:

   ```
   wss://SEU-SERVICO.onrender.com/game?token=TOKEN_DO_KAITO
   ```

   Toque em **Connect**. Chega um `welcome` com `"x":10,"y":10` e `"players":[]`.
4. **Jogador 2**: abra **outra aba** do navegador no Hoppscotch e conecte com o token da Mei.
   A Mei recebe `welcome` com o Kaito na lista. Na aba do Kaito, aparece `player_joined`.
5. Na aba do Kaito, envie (campo de mensagem → **Send**):

   | Envie | O que aparece |
   |---|---|
   | `{"type":"move","x":11,"y":10}` | na aba da Mei: `player_moved` com x 11 |
   | `{"type":"chat","message":"Olá!"}` | `chat` nas duas abas |
   | `{"type":"move","x":90,"y":90}` | só na aba do Kaito: `move_rejected` com `"reason":"TOO_FAST"` (anti speed hack) |
   | `{"type":"move","x":-1,"y":10}` | `move_rejected` com `"reason":"OUT_OF_BOUNDS"` |
   | `oi` (texto que não é JSON) | `error` com `"code":"INVALID_MESSAGE"` |

6. Toque em **Disconnect** na aba do Kaito: na aba da Mei aparece `player_left`.
7. **Token inválido**: conecte com `?token=abc`. A conexão falha na hora (o servidor responde 401 e não abre o WebSocket).

Se algo falhar, copie a mensagem do Hoppscotch e o trecho do log do Render e mande para o Claude.
O log mostra entradas e saídas só com o `playerId`: nunca o token nem o texto do chat.
