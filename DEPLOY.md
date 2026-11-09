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
| 8 | Jogar pelo navegador do celular | ~5 min |
| 9 | Testar o combate | ~5 min |
| 10 | Testar foco (🎯) e meditação (🧘) | ~5 min |
| 11 | Atualização v4: NPC Mestre e Sala de Missões (rodar 1 SQL no Neon e testar) | ~10 min |
| 12 | Atualização v5: nível, atributos, corrida, kits, layout MOBA e missão entre jogadores | ~15 min |
| 13 | Atualização v6: Criador de Personagem, boneco modular, ⚙️ layout da HUD e conta Hokage de teste | ~10 min |
| 14 | Atualização v7: movimento sem atraso (predição no cliente + correção pelo servidor), sem SQL | ~5 min |
| 15 | Atualização v8: mapas Vila e Floresta com passagem pelas bordas, sem SQL | ~5 min |
| 16 | Atualização v9: Vila 80x80 com muralha, portão sul e praça segura, sem SQL | ~5 min |
| 17 | Atualização v10: lojas com interior, fade entre mapas e Floresta escura, sem SQL | ~5 min |
| 18 | Atualização v11: progressão (níveis 60, classes, Academia, Extração), com SQL | ~10 min |
| 19 | Atualização v12: Modo Administrador, atributo Chakra, chat com histórico, Sala de Missões e Academia nova, com SQL | ~15 min |
| 20 | Atualização v13: personagem em sprites (gênero, cabelo, olhos, roupa e vila), com SQL | ~10 min |
| 21 | Atualização v14: hitboxes, efeitos dos golpes e armas no boneco, sem SQL | ~10 min |
| 22 | Atualização v15: nome Herança do Fogo, arena da vila e design geral, com SQL opcional | ~10 min |
| 23 | Atualização v16: fim de jogo (vilas, Kage, PvP, renegados, Akatsuki, capas), com SQL opcional | ~15 min |
| 24 | Atualização v18: sapatos (equipamento dos pés), tela de equipamentos e `/admin ryo`, com SQL **antes** do deploy | ~10 min |
| 25 | Atualização v19: Rei Lodo, silêncio da Ilusão, números de PvP e Painel do Admin, **sem SQL** | ~5 min |

**Regra de ouro:** senha do banco, `JWT_SECRET` e `SERVICE_TOKEN` só vão no painel do Render.
Nunca no GitHub, nunca num arquivo, nunca num print compartilhado.

## Regras para as migrações (SQL do Neon)

O Victor roda as migrações colando o arquivo no **SQL Editor do Neon**, pelo celular. Esse editor
divide o texto em comandos sozinho, e isso impõe regras a todo arquivo novo em `db/`:

1. **Nada de blocos `DO $$ ... $$`.** O editor corta o bloco no primeiro `;` de dentro e dá
   `unterminated dollar-quoted string` (aconteceu na v8, em 22/10/2026). `CREATE FUNCTION ... AS $$ ... $$`
   funciona; `DO` não.
2. **Para "fazer só se ainda não foi feito"**, use `IF NOT EXISTS` / `IF EXISTS` (`ADD COLUMN`, `CREATE TABLE`,
   `CREATE INDEX`, `DROP ... IF EXISTS`), `CREATE OR REPLACE FUNCTION` e `INSERT ... ON CONFLICT`. Se precisar
   mesmo de lógica condicional, crie uma função (`CREATE OR REPLACE FUNCTION game._migrar_vN() ...`), chame com
   `SELECT game._migrar_vN();` e apague com `DROP FUNCTION game._migrar_vN();`.
3. **Tudo dentro de `BEGIN; ... COMMIT;`.** Se um comando falhar, o editor mostra "Failed transaction:
   ROLLBACK required": tocar em ROLLBACK desfaz tudo e o banco fica como estava.
4. **O branch principal do Neon se chama `production`.** Antes de rodar, confira no seletor do SQL Editor que é
   ele (depois de criar um branch de backup, o editor pode ficar apontando para o backup).
5. **Antes de toda migração que renomeia ou apaga colunas:** crie um branch de backup do `production` e mude o
   "Expires" dele para **Never** (o Neon apaga branches com ampulheta).
6. **Ordem do deploy:** migração no Neon primeiro, depois o código na `main`. Se o Render publicar antes, o
   servidor não sobe e a versão anterior continua no ar; depois da migração, use **Manual Deploy**.

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
7. E a do NPC Mestre: apague o editor, cole o arquivo `db/schema_v4_npc_missions.sql` inteiro e toque em **Run**.
   Também pode rodar de novo sem erro.
8. E a de nível e atributos: cole o arquivo `db/schema_v5_atributos.sql` inteiro e toque em **Run** (pode repetir).
9. E a do visual do personagem: cole o arquivo `db/schema_v6_aparencia.sql` inteiro e toque em **Run** (pode repetir).

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

   Toque em **Connect**. Chega um `welcome` com `"x":40,"y":34` (avenida da Vila), `"players":[]`, `"monsters":[]` (a Vila não tem monstros) e os dados dos mapas.
4. **Jogador 2**: abra **outra aba** do navegador no Hoppscotch e conecte com o token da Mei.
   A Mei recebe `welcome` com o Kaito na lista. Na aba do Kaito, aparece `player_joined`.
5. Na aba do Kaito, envie (campo de mensagem → **Send**):

   | Envie | O que aparece |
   |---|---|
   | `{"type":"move","dx":1,"dy":0}` | nas duas abas: vários `player_moved` com x subindo (5 casas por segundo) |
   | `{"type":"move","dx":0,"dy":0}` | o personagem para (os `player_moved` param) |
   | `{"type":"chat","message":"Olá!"}` | `chat` nas duas abas |
   | `{"type":"cast","skill":"fire"}` | nada: habilidade aceita (ainda sem efeito no jogo) |
   | `{"type":"move","dx":9,"dy":0}` | `error` com `"code":"INVALID_MESSAGE"` (direção vai de -1 a 1: speed hack não existe) |
   | `oi` (texto que não é JSON) | `error` com `"code":"INVALID_MESSAGE"` |

6. Toque em **Disconnect** na aba do Kaito: na aba da Mei aparece `player_left`.
7. **Token inválido**: conecte com `?token=abc`. A conexão falha na hora (o servidor responde 401 e não abre o WebSocket).

Se algo falhar, copie a mensagem do Hoppscotch e o trecho do log do Render e mande para o Claude.
O log mostra entradas e saídas só com o `playerId`: nunca o token nem o texto do chat.

---

## Passo 8 — Jogar pelo navegador do celular

O próprio servidor entrega o jogo: não precisa instalar nada.

1. Abra `https://SEU-SERVICO.onrender.com/` no navegador do celular (Chrome no Android, Safari no iPhone).
   Se demorar, o servidor estava dormindo: espere até 1 minuto.
2. Toque em **Não tem conta? Criar conta**, preencha nome, e-mail e senha (10+ caracteres, com maiúscula,
   minúscula e número) e toque em **Criar conta e entrar**. Nas próximas vezes, use **Entrar**.
3. Deite o celular. No Android o jogo tenta abrir em tela cheia na horizontal; no iPhone aparece a dica
   (dá para tocar em **Jogar assim mesmo** e jogar em pé).
4. **Andar**: encoste o polegar em qualquer lugar da metade esquerda de baixo da tela e arraste. O joystick
   nasce onde você tocou. Quanto mais longe do centro, mais rápido.
5. **Habilidades**: 7 botões no canto inferior direito (Fogo, Água, Taijutsu, Ilusão, Sombra, Pedra, Cura).
   Cada uma tem uma animação no mapa e o botão escurece por um instante. Funciona junto com o joystick (um dedo em cada).
6. **Chat**: toque em 💬, escreva e toque em **Enviar**. A mensagem aparece na tela (some sozinha em ~6 s)
   e num balão sobre o personagem.
7. **Com outra pessoa**: abra o mesmo endereço em outro celular (ou numa aba anônima) com **outra conta**.
   Cada um vê o outro andar e falar. A mesma conta em dois lugares derruba o primeiro.
8. **Sair** (canto superior direito) apaga o login deste aparelho.

Ver o `console.log` das habilidades: no computador, abra o jogo, pressione F12 e veja a aba Console
(no computador: WASD ou setas andam, teclas 1 a 7 soltam as habilidades, Enter abre o chat).
No celular não há console; o anel na tela confirma o toque.

---

## Passo 9 — Testar o combate

Nada novo para configurar: o XP vai para a coluna `total_xp` que já existe no banco.

1. Entre no jogo (Passo 8). Você nasce na avenida da **Vila**, em frente à sede.
2. Desça pela avenida até o portão (embaixo, no centro) e entre na **Floresta**. Os **monstros** (slimes) ficam
   lá. São sempre 10.
3. Embaixo da tela ficam a barra **vermelha** (vida), a **azul** (chakra) e a linha de rank/XP.
   O número no topo de cada botão é o custo em chakra; sem chakra, o botão apaga.
4. Chegue perto de um monstro e use:
   - **Taijutsu** colado nele (dano alto, custa só 5);
   - **Fogo** com ele a até 3 casas (pega todos em volta);
   - **Água**: ande na direção dele e solte (cone para onde você olhou por último).
   Os números de dano sobem sobre o monstro.
5. **Ilusão** faz estrelinhas girarem sobre o monstro (3 s parado, sem atacar). **Sombra** prende ele no chão
   (5 s, mas ainda ataca). **Pedra** põe um anel marrom em você (o próximo golpe tira metade). **Cura** devolve 30.
6. Ficar colado num monstro tira vida a cada 2 s (números vermelhos sobre você e a tela pisca).
   Com vida 0 aparece **"Você foi derrotado"**; depois de 5 s, toque em **Renascer** e você volta ao centro.
7. Cada monstro derrotado dá **+20 XP** a quem deu o último golpe. Com **100 XP**, Academia vira **Genin**
   (aviso para todos no chat). Para conferir no banco, no SQL Editor do Neon:

   ```
   SELECT p.username, p.total_xp, r.name FROM game.players p JOIN game.ranks r ON r.id = p.current_rank_id ORDER BY p.total_xp DESC LIMIT 10;
   ```

---

## Passo 10 — Testar foco (🎯) e meditação (🧘)

Os dois botões ficam logo acima das habilidades.

1. **Foco:** perto de 2 ou 3 monstros, toque em **🎯 Alvo**. O mais perto ganha um anel laranja tracejado e
   uma seta em cima, e aparece uma linha pontilhada até ele. A câmera desliza para mostrar você e ele juntos.
2. Toque **🎯** de novo: o foco passa para o próximo mais perto. Depois do último, volta ao primeiro.
3. **Jutsu direcionado:** com foco, vire para o lado contrário (ande um pouco para longe) e solte **Água**:
   o cone sai na direção do alvo. **Ilusão** e **Sombra** pegam o focado, não o mais perto.
4. **Alcance:** foque um monstro longe (mais de 4 casas) e solte Água: aparece **"Alvo fora de alcance"**
   e o chakra não cai.
5. **Perder o foco:** ande para longe do alvo (mais de 12 casas). O botão 🎯 apaga e a câmera volta para você.
6. **Meditar:** com pouco chakra, toque **🧘 Meditar**. Aparece a aura azul, a barra de chakra brilha e
   enche 3x mais rápido. O joystick mostra 🧘.
7. Mexer o joystick ou tocar numa habilidade encerra a meditação ("Meditação encerrada").
8. **Sem trapaça:** medite colado num monstro. No primeiro golpe aparece **"Meditação interrompida!"** e o
   chakra volta à velocidade normal.

---

## Passo 11 — Atualização v4: NPC Mestre e Sala de Missões

A v4 coloca o **Mestre** (um sensei NPC) ao lado do ponto de renascimento. Ele passa missões que usam o
mesmo ciclo do banco das missões entre jogadores (`game.sensei_missions`, avaliação, pergaminho, resgate).

1. **Banco (uma vez).** No Neon, abra o **SQL Editor**, cole o arquivo `db/schema_v4_npc_missions.sql`
   inteiro e toque em **Run**. Pode rodar de novo sem erro. Ele só INSERE catálogo e o jogador NPC:
   - tipo `DEFEAT_MONSTER`;
   - dificuldade `NPC_TRAINING` (50 XP + título);
   - título "Discípulo do Mestre";
   - o NPC "Sensei Mestre", sem e-mail nem senha, então ninguém entra com ele.
2. **Servidor.** Não precisa reiniciar nem mexer no Render. Se o código subir antes do SQL, o jogo
   funciona normal, o log mostra `[boot] NPC Mestre sem missões: rode db/schema_v4_npc_missions.sql`
   e o Mestre responde "A Sala de Missões ainda não abriu" até o SQL rodar.
3. **Conferir (opcional).** No Neon:

   ```
   SELECT username FROM game.players WHERE id = '00000000-0000-7000-8000-00000000a001';
   ```

   Tem que aparecer `Sensei Mestre`.

### Testar no celular

1. Entre no jogo. Ao lado do seu boneco está o **Mestre**: manto roxo com 師 e um **!** amarelo em cima.
   Perto dele aparece o botão **💬 Falar**, acima das habilidades.
2. Toque **💬 Falar**. O Mestre responde num balão ("derrote 5 slimes e volte aqui"), o botão do topo
   vira **📜 0/5** e o **!** vira um **?** cinza.
3. Toque **📜** para abrir a **Sala de Missões**. Ela mostra:
   - "Missão do Sensei Mestre";
   - "Derrotar 5 slimes";
   - a barra 0 / 5;
   - a recompensa: 50 XP e o título "Discípulo do Mestre".

   Feche no ✕.
4. **Tente trapacear:** fale com o Mestre antes de terminar. Ele diz quanto falta e nada é entregue.
5. Mate slimes. A cada um aparece **📜 1/5, 2/5…** sobre você e no botão do topo.
6. No 5º, o botão fica amarelo **📜 Pronta!**, aparece "Missão completa! Volte ao Mestre" e o celular
   vibra. Se o Mestre estiver fora da tela, uma **seta com ?** na borda aponta para ele.
7. Volte e toque **💬 Falar**:
   - aparece "Pergaminho entregue! +50 XP · Título: Discípulo do Mestre";
   - o XP sobe na linha de baixo;
   - a Sala de Missões mostra "Última entrega".
8. Fale de novo para pegar outro treino. O título não se repete; da segunda vez em diante vem só o XP.

No Neon, a missão concluída aparece assim:

```
SELECT status, progress_quantity FROM game.sensei_missions ORDER BY created_at DESC LIMIT 1;
```

O resultado esperado é `completed | 5`.

---

## Passo 12 — Atualização v5: nível, atributos, corrida, kits e layout MOBA

### 1. Banco primeiro (obrigatório)

No Neon, abra o **SQL Editor**, cole o arquivo `db/schema_v5_atributos.sql` inteiro e toque em **Run**.
Pode rodar de novo sem erro. Ele:

- adiciona em `game.players`: `level`, `stat_points`, os 6 atributos e os 2 kits;
- dá o nível e os pontos certos para quem já tinha XP;
- cria o trigger que sobe o nível sozinho quando o XP muda.

O servidor novo **não sobe sem a v5**: o log do Render mostra `Falta a migração v5`, e a versão
anterior continua no ar. Se o deploy falhou antes do SQL, rode o SQL e depois toque em
**Manual Deploy → Deploy latest commit**.

Conferência (opcional):

```
SELECT username, total_xp, level, stat_points, kit_a FROM game.players ORDER BY total_xp DESC LIMIT 5;
```

### 2. Para testar a missão entre jogadores: um sensei

Só Chunin ou acima cria missão. No jogo ninguém chega a Chunin ainda, então promova uma conta de teste:

```
UPDATE game.players SET current_rank_id = (SELECT id FROM game.ranks WHERE code = 'CHUNIN')
 WHERE username = 'SEU_NOME_DE_TESTE';
```

Depois saia e entre de novo com essa conta, porque o rank é lido ao conectar.

### 3. Testar no celular (deitado)

1. **Botões novos, no canto de baixo à direita:**
   - 🗡️ grande: Ataque Básico, sem gastar chakra;
   - em volta dele, as 4 habilidades do kit;
   - 🧘 acima e 🏃 abaixo;
   - 🔄 embaixo à esquerda (letra do kit);
   - 🎯 no alto.
2. **Ataque Básico:** perto de um slime, toque 🗡️. Sai o número de dano, o chakra não cai e o
   botão mostra a recarga girando.
3. **Chakra:** use o 🔥 Fogo e repare que o chakra **não volta sozinho**. Toque 🧘 para encher (15/s).
   A vida só volta com o chakra cheio.
4. **Correr:** toque 🏃, que fica verde, e ande: você vai mais rápido (8 em vez de 5). Toque de novo para voltar a andar.
5. **Foco andando:** segure o joystick com o polegar esquerdo e toque 🎯 com o direito. O alvo
   troca e você não para.
6. **Kits:** toque 🔄. A letra vira B e os botões viram Ilusão, Sombra, Pedra e Cura.
7. **Nível e atributos:**
   - mate 5 slimes (100 XP): aparece "Nível 2! +1 ponto" e o botão 📊 do topo fica verde (**Nv 2 +1**);
   - toque 📊 e depois o **+** de Vitalidade: a vida máxima vira 110;
   - na aba **Kits**, monte os seus 2 kits (até 4 cada) e toque **Salvar kits**.
8. **Vila:** chão de pedra com prédios. Os slimes ficam na Floresta, depois do portão (v8/v9).

### 4. Missão entre jogadores (2 celulares, um deles Chunin)

1. **Criar:** com o sensei, toque no boneco do outro jogador (até 3 casas de distância). No menu, toque
   **📜 Criar Missão**, escolha 3, 5 ou 10 slimes e a dificuldade, e toque **Criar missão**.
2. O aprendiz recebe o aviso e o 📜 dele vira **0/3**.
3. **Entregar:** o aprendiz mata os slimes (**Pronta!**), chega perto do sensei, toca nele e toca
   **📜 Entregar missão**.
4. **Avaliar:** no celular do sensei aparece **Avaliar missão**. Escolha a nota e toque **Aprovar**.
   Se tocar **Reprovar**, o progresso do aprendiz volta a zero.
5. **Resgatar:** o aprendiz fala com o **Mestre** (Sala de Missões) e recebe o XP do pergaminho.

---

## Passo 13 — Atualização v6: Criador de Personagem, boneco modular e layout da HUD

### 1. Banco primeiro (obrigatório)

No Neon, abra o **SQL Editor**, cole o arquivo `db/schema_v6_aparencia.sql` inteiro e toque em **Run**.
Pode rodar de novo sem erro. Ele:

- adiciona a coluna `appearance` em `game.players`, com as cores das partes do boneco;
- faz o banco recusar qualquer valor fora do formato `#rrggbb`.

O servidor novo **não sobe sem a v6**: o log mostra `Falta a migração v6`, e a versão anterior continua no ar.
Se o deploy falhou antes do SQL, rode o SQL e depois toque em **Manual Deploy → Deploy latest commit**.

### 2. Conta Hokage para testes (opcional)

1. Crie no jogo uma conta com o nome **Victor**.
2. No SQL Editor do Neon, cole o arquivo `db/promote_victor.sql` inteiro e toque em **Run**.
   Ele cria o rank **HOKAGE** (o mais alto, com permissão de sensei) e promove essa conta.
   Pode rodar de novo sem erro.
3. Saia do jogo e entre de novo, porque o rank é lido ao conectar.

Com o Hokage você cria missões para qualquer jogador de rank menor. O NPC Mestre fica abaixo dele,
então para essa conta ele responde "Seu rank já passou dos meus treinos".

### 3. Testar no celular

1. **Criador:** entre com uma conta e a tela **Crie seu ninja** abre sozinha. Isso vale na primeira
   vez, inclusive para contas antigas.
   - escolha as 5 cores (pele, cabelo, camisa, calça, capa) ou uma das combinações prontas;
   - **↻ Girar** mostra o boneco de lado e de costas;
   - toque **Começar a jogar**.
2. **Boneco:** ande e repare que ele vira para a direção do joystick e mexe pernas e braços.
   Num segundo celular, o seu boneco aparece com as suas cores.
3. **Em pé:** as barras de vida e chakra ficam no topo, logo abaixo dos botões, e o chat aparece embaixo delas.
4. **⚙️ Configurações:**
   - mexa nos sliders de tamanho e transparência dos botões e das barras;
   - toque **✏️ Editar layout**: aparece a faixa amarela e os botões ganham contorno tracejado;
   - arraste o Ataque, as habilidades, o joystick e as barras para onde quiser;
   - toque **Concluir**.

   Durante a edição o combate fica parado: tocar num botão não ataca. Fora da edição, nada se
   arrasta. O layout fica salvo no celular, separado para deitado e em pé. **Restaurar** volta ao padrão.
5. **🎨 Mudar visual** (dentro do ⚙️) reabre o Criador a qualquer hora.

## Passo 14 — Atualização v7: movimento sem atraso (predição + reconciliação)

**Banco:** nada a rodar (sem SQL nesta versão). **Render:** o push na `main` já faz o deploy.

### Testar no celular

1. **Resposta imediata:** mexa o joystick. O boneco sai no mesmo instante, mesmo com internet móvel lenta.
2. **Outros jogadores:** com 2 celulares, ande com um e olhe no outro. O boneco desliza liso,
   sem saltos entre um aviso e outro.
3. **Paredes:** ande contra uma casa da vila. O boneco para na parede, sem tremer nem voltar.
4. **Servidor corrigindo (opcional, no navegador do computador):**
   - abra o console;
   - rode `localStorage.setItem('nin.debug','1')` e recarregue;
   - rode `ninDebug.cheatSpeed(3)` e ande. O boneco tenta correr 3× mais rápido e é puxado de volta;
   - `ninDebug.stats()` mostra as correções;
   - `ninDebug.cheatSpeed(1)` volta ao normal;
   - para desligar: `localStorage.removeItem('nin.debug')`.

## Passo 15 — Atualização v8: mapas Vila e Floresta

**Banco:** nada a rodar (sem SQL nesta versão). **Render:** o push na `main` já faz o deploy.

### Testar no celular

1. **Vila:** entre no jogo.
   - Você nasce na praça, com chão de pedra cinza e casas marrons em volta, fechando a vila.
   - O topo mostra `online · Vila · N jogadores`.
   - Não há monstros na Vila.
2. **Portão leste:** siga a rua de terra para a direita. No fim dela, entre as casas, fica o portão, e
   já dá para ver a trilha e as árvores da Floresta do outro lado.
3. **Passagem:** continue andando. O boneco entra na Floresta sem parar e sem saltar:
   - a tela escurece de leve e aparece **Floresta**;
   - a Vila fica visível atrás;
   - logo aparecem os slimes (10) e quem estiver por lá.
4. **Árvores:** ande contra uma árvore. Ela bloqueia como as casas.
5. **Volta:** ande para a esquerda pela trilha até a borda. Você volta para a Vila pelo portão.
6. **Parede:** na Vila, encoste nas casas da borda direita, longe do portão, e empurre. Nada acontece:
   só o portão leva à Floresta.
7. **Dois celulares:** um fica na Vila e o outro vai para a Floresta.
   - Quem ficou deixa de ver quem foi (e os monstros de lá).
   - O chat também é por mapa.
8. **Morrer na Floresta:** depois do **Renascer**, você volta para a Vila.

> Na v9 a Vila cresceu (80x80) e o portão passou para o sul: veja o Passo 16.

## Passo 16 — Atualização v9: a Vila nova (80x80)

**Banco:** nada a rodar (sem SQL nesta versão). **Render:** o push na `main` já faz o deploy.

### Testar no celular

1. **Chegada:** você aparece na avenida, em frente à sede (o prédio grande de telhado vermelho
   vivo, no topo), com o Mestre ao lado. Atrás da sede fica a montanha de rocha.
2. **Muralha:** ande até qualquer borda da Vila. A muralha de pedra não deixa passar.
3. **Prédios e ruas:**
   - hospital à esquerda (placa com cruz verde) e academia à direita (placa azul);
   - as três lojas no meio, com canais na frente;
   - entre os prédios há ruas largas e becos estreitos, e um beco atrás da sede;
   - à esquerda, o rio com duas pontes de madeira.
4. **Praça (zona segura):** desça pela avenida até a praça, logo acima do portão.
   - O topo mostra `Vila · zona segura`.
   - Os botões de combate apagam; tocar em Ataque ou numa habilidade mostra "Zona segura: sem combate".
   - Os bancos e vasos são enfeites.
5. **Campo de treino:** à direita da praça fica a área de areia, com o boneco de madeira.
6. **Portão:** continue descendo pelo portão (no centro, embaixo). O telhado do portão passa por cima
   do boneco e você entra na Floresta sem parar. Para voltar, suba pela trilha até a borda de cima.

## Passo 17 — Atualização v10: lojas com interior

**Banco:** nada a rodar (sem SQL nesta versão). **Render:** o push na `main` já faz o deploy.

### Testar no celular

1. **Floresta:** desça pelo portão da Vila.
   - A tela escurece e clareia rapidinho (fade) e você chega na Floresta, de grama escura, no alto do mapa.
   - Suba de volta pela borda de cima: você reaparece dentro da praça da Vila.
2. **Entrar numa loja:** as 3 lojas ficam no meio da Vila, com canais na frente.
   - Vá até a frente de uma loja, no capacho embaixo da porta, e empurre o joystick para cima.
   - Fade, e você está dentro da sala, com assoalho, balcão e o lojista atrás dele.
   - O topo mostra o nome da loja e "zona segura".
3. **Decoração:**
   - Armaria: espadas na parede, lanças e escudos;
   - Alfaiataria: manequins e roupas dobradas;
   - Casa dos Pergaminhos: estantes de pergaminhos e uma mesa.
4. **Falar com o lojista:** suba até o balcão. O botão vira 🛒. Toque nele e o painel da loja abre,
   com a vitrine dos itens ("Em breve"). Afastando-se do balcão, o painel fecha sozinho.
5. **Sair:** desça até a porta, embaixo no meio, e continue descendo. Você volta para a Vila, na
   frente da loja, andando para longe da porta.
6. **Lojista só dentro da loja:** na Vila ele não aparece, e falar com ele de fora não funciona.

## Passo 18 — Atualização v11: progressão (níveis 60, classes, Academia, Extração)

**Banco (obrigatório, ANTES do deploy):** no Neon → **SQL Editor**, cole e rode o arquivo
`db/schema_v7_progressao.sql` inteiro. Pode rodar de novo sem erro. Ele:

- recalcula o nível de todo mundo pela curva nova (até 60). Se alguém tinha mais pontos gastos do que o
  nível novo dá, os atributos voltam a zero e os pontos ficam livres para redistribuir;
- deixa quem já jogava com o tutorial **concluído** e os 7 jutsus de antes; contas novas começam na Academia;
- cria classes, jutsus, itens, inventário, ryō e as regras de Genin, Chunin, Extração, loja e Hokage.

Conferência (opcional, no mesmo SQL Editor):

```sql
SELECT count(*) FROM game.jutsus;                      -- 38
SELECT code, min_level FROM game.ranks ORDER BY tier;  -- GENIN 11, CHUNIN 40, HOKAGE 60
```

Sem a migração, o servidor **não sobe** (o log do Render diz qual coluna falta) e a versão anterior
continua no ar. **Render:** o push na `main` já faz o deploy. Nenhuma variável nova.

### Testar no celular

1. **Conta nova:** crie uma conta. Você nasce na **Academia, Sala 1**; o cartão verde no alto diz o que fazer.
2. **Sala 1:** tente passar pela porta da direita: está trancada. Destrua 3 bonecos com o 🗡️ Ataque
   Básico (chegue perto). A tranca vermelha some e a porta abre.
3. **Sala 2:** medite 🧘 até a barra azul encher.
4. **Sala 3:** incline o joystick e toque no 💨 (Teleporte Curto): você salta 3 casas. Toque no 🪵
   (Substituição) perto do boneco que bate: no golpe aparece um tronco e você surge atrás dele, sem perder vida.
5. **Sala 4:** abra o 🎒, toque em **Equipar** na Kunai de Treino. Tutorial concluído (+100 ryō, +50 XP).
   Desça pela porta de baixo: você sai na frente da Academia, na Vila.
6. **Ficha 📊 → Jutsus:** cada jutsu com o nível e os usos (100 = Nível 2).
7. **Nível 11:** entre na Academia (porta do prédio na Vila) e fale com o **Diretor**. Escolha a classe:
   você vira Genin e ganha 1 pergaminho. Na **Casa dos Pergaminhos**, fale com o lojista: compre
   pergaminhos e use a **Extração**.
8. **Chunin (nível 40):** um Chunin toca em você → Criar Missão → **Exame Chunin**. Cumpra, entregue, ele aprova.

## Passo 19 — Atualização v12: admin, atributos, chat, Sala de Missões e Academia nova

**Banco (obrigatório, ANTES do deploy):** no Neon → **SQL Editor**, cole e rode o arquivo
`db/schema_v8_admin_chat.sql` inteiro. Ele:

> **Já aplicada no `production` em 22/10/2026.** O arquivo tem um bloco `DO $$` que o SQL Editor do Neon não
> aceita (veja "Regras para as migrações"). Ela foi rodada com esse bloco trocado por três comandos diretos
> (`UPDATE` que soma os pontos, `RENAME COLUMN`, `DROP COLUMN`). Para um banco novo, use `psql` ou faça a mesma troca.


- cria `is_admin` (falso para todos) e liga só a conta **Victor**; cria a auditoria `game.admin_audit_log`;
- junta Chakra Máximo + Regen Chakra em **Chakra** (soma os pontos, nada se perde) e tira o teto de 10 pontos;
- cria o histórico do chat (`game.chat_logs`, 24 h), os treinos novos do Mestre e as espadas da Armaria.

Depois dela, **não rode a v5 nem a v7 de novo** (elas citam as colunas antigas de chakra).
Sem a migração, o servidor **não sobe** (o log do Render diz que falta a v8) e a versão anterior continua no ar.

Conferência (opcional):

```sql
SELECT username, is_admin FROM game.players WHERE is_admin;     -- Victor
SELECT code, xp_reward FROM game.mission_difficulties WHERE code LIKE 'NPC_%';
```

### Testar no celular

1. **Conta nova:** você nasce na **Sala de Taijutsu**. Só o 🗡️ aparece: destrua 3 bonecos. O servidor te leva
   para a **Sala de Controle**: o chakra cai sozinho (campo roxo). Toque em 🧘 até encher.
2. **Sala de Jutsus:** ande até o vão (você para na beira), incline o joystick para ele e toque em 💨: você
   salta por cima. Do outro lado, toque em 🪵 perto da armadilha: o golpe acerta um tronco.
3. **Sala de Armas:** a 🎒 brilha. Equipe a Kunai de Treino e acerte o boneco. Você aparece na **Praça da Vila**.
4. **Sala de Missões:** fale com o Mestre: escolha um dos 3 cartões. O botão Entregar fica cinza
   ("Faltam 3 monstros") até completar; depois, verde.
5. **Ficha 📊:** o atributo **Chakra** e "próximo ponto: +X". **Redefinir Atributos** (2 toques, 500 ryō).
6. **Chat:** `/g olá` fala com todos; `/w Nome oi` sussurra. O 🕘 mostra o histórico.
7. **Admin (conta Victor, depois de sair e entrar):** `/admin giveitem Victor katana 1`, equipe a Espada Longa
   (aparece nas costas) e `/admin spawn slime 3`. Tudo fica em `game.admin_audit_log`.

## Passo 20 — Atualização v13: personagem em sprites

**Banco (obrigatório, ANTES do deploy):** no Neon → **SQL Editor** (confira que o branch é o `production`),
cole e rode o arquivo `db/schema_v9_visual_sprites.sql` inteiro. Ele só troca a função que confere o visual
(`game.valid_appearance`): passa a aceitar o visual novo, feito de nomes de paleta, e continua aceitando o antigo
(5 cores). Nenhum visual gravado muda. Não tem bloco `DO $$` e pode rodar de novo.

Sem a migração, o servidor **não sobe** (o log do Render diz que falta a v9) e a versão anterior continua no ar.
Se o Render publicar antes de você rodar o SQL, rode e depois toque em **Manual Deploy**.

Conferência (opcional), as duas linhas devem dar `true`:

```sql
SELECT game.valid_appearance('{"v":2,"gender":"f","skin":"canela","hairStyle":"longo_lateral","hairColor":"preto","eyeStyle":"cilios","eyeColor":"verde","outfit":"vila","shirtColor":"azul_marinho","pantsColor":"cinza","bandana":true,"village":"vila_1"}'::jsonb);
SELECT game.valid_appearance('{"skin":"#f1c9a0","hair":"#2b2118","shirt":"#2f5d8a","pants":"#2a2a33","cape":"#8a2b2b"}'::jsonb);
```

### Testar no celular

1. **Conta nova:** o Criador abre com a prévia em sprite. Toque em **Feminino**: os olhos ganham cílios e o cabelo
   fica longo (dá para trocar). Escolha a pele, o cabelo, os olhos, a vila e a roupa (**Camisa e calça** com as
   cores que quiser, ou **Conjunto da vila** com as cores da vila) e a bandana. **↻ Girar** mostra os 4 lados.
2. **Conta antiga:** entra com o visual de antes convertido para as cores mais parecidas (a capa sumiu).
   Abra ⚙️ → **🎨 Mudar visual** para escolher o novo.
3. **No mapa:** ande (as pernas acompanham o passo), toque em 🏃 (corrida ninja, braços para trás), ataque
   (soco e chute alternados), use um jutsu (mãos juntas, palmas para frente e volta) e medite (🧘: agachado, com o selo do carneiro). Para a direita, o boneco é o de lado espelhado.
4. **Outro jogador** (outro celular ou aba anônima) vê o seu visual igual, e a mudança aparece na hora quando você salva no Criador.


## Passo 21 — Atualização v14: hitboxes, efeitos dos golpes e armas no boneco

**Banco:** nada a rodar no Neon (nenhuma migração). O Render publica a `main` sozinho.

O que muda:

- **Hitboxes:** cada golpe acerta pela forma, com as posições do servidor: Ataque Básico em arco, Fogo como
  bola que voa e explode (raio 2), Água em cone, Taijutsu com avanço, Ilusão em volta, Sombra e Relâmpago em
  linha (o primeiro que ela encosta), Kunais em leque de 3. Paredes e árvores param linhas e projéteis.
- **Efeitos** em pixel art e **armas** desenhadas no boneco (kunai e espada curta na mão; espada longa, Shuriken
  Gigante e pergaminho nas costas).
- **PvP preparado, desligado:** só liga trocando `pvp: false` para `true` em `src/realtime/config.ts`.

### Testar no celular

1. **Floresta:** toque em 🗡️ perto de 2 slimes lado a lado: o corte em arco pega os dois.
2. **🔥 Fogo:** a bola sai voando até o slime mais perto e explode; o dano aparece quando ela bate. Atrás de uma
   árvore, ela explode no tronco.
3. **💧 Água:** o cone sai para onde você olha (ou para o alvo focado 🎯).
4. **👊 Taijutsu:** com um slime a 2 casas, o ninja avança até ele e dá o golpe (poeira onde saiu).
5. **Kit B:** 🌀 Ilusão (espiral em volta: atordoa todos a até 3 casas) e 🌑 Sombra (linha no chão até o primeiro
   slime, que fica preso).
6. **Armas (uma de ataque por vez):** equipe a Kunai na 🎒: ela fica na mão, com o punho fechado no cabo, e o 🗡️
   vira um golpe com ela (recua, estoca, desce). Equipe a Espada Longa: a kunai sai da mão e a espada fica deitada no
   cinto, passando dos dois lados do corpo; no 🗡️ ela sai para a mão, corta e volta (a bainha vazia fica no cinto). O pergaminho
   continua nas costas com qualquer arma.
7. **Shuriken Gigante:** equipada, fica enorme nas costas (de frente, as lâminas saem dos lados da cintura). O 🗡️
   vira um arremesso: ela sai girando até 6 casas, atravessa todos os slimes na linha (85 de dano em cada) e volta
   para as costas. A recarga é bem lenta (3 s, contando no botão).
8. **Admin (conta Victor):** `/admin spawn slime 4` em volta, para testar vários de uma vez;
   `/admin giveitem Victor fuma_shuriken 1` para ganhar a Shuriken Gigante.


## Passo 22 — Atualização v15: Herança do Fogo, arena da vila e o design geral

**Banco (opcional, pode ser antes ou depois do deploy):** no Neon → **SQL Editor** (confira que o branch é o
`production`), cole e rode o arquivo `db/schema_v10_design.sql` inteiro. Ele cria a tabela das falhas seguidas na
Extração e troca a função da Extração pela versão com a proteção contra azar. Não tem bloco `DO $$`, fica dentro de
`BEGIN; ... COMMIT;` e pode rodar de novo.

Desta vez o servidor **sobe sem a migração**: a Extração só fica sem a proteção contra azar, e o log do Render avisa
(`Extração sem a proteção contra azar`). Depois de rodar o SQL não precisa reiniciar.

Conferência (opcional), deve dar `2`:

```sql
SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'game' AND table_name = 'player_extraction_pity')
     + (SELECT count(*) FROM pg_proc WHERE proname = 'extraction_failures');
```

### Testar no celular

1. **Nome:** a tela de login mostra **Herança do Fogo**. Adicionando à tela inicial, o atalho também.
2. **Arena:** na Vila, desça a avenida, siga a rua de baixo para a direita e entre pela abertura da cerca de madeira
   (no antigo campo de treino). O topo mostra **⚔️ arena**. Com outra conta da mesma vila lá dentro, toque em 🎯: o
   foco vai nela (nome vermelho) e o 🗡️ e os jutsus acertam. Quem perde volta em 3 s na entrada oeste, sem perder
   nada, e todos na Vila veem no chat "⚔️ Arena: fulano venceu ciclano.". Fora da cerca, ninguém acerta ninguém.
3. **Floresta com 2 contas:** batam juntos no mesmo slime: os dois ganham o XP (quem tirou pelo menos 20% da vida).
   Com mais gente na Floresta, aparecem mais slimes.
4. **Armas:** com a Kunai, o 🗡️ recarrega mais rápido (e o corte é menor); com a Espada Longa, mais devagar, com um
   corte maior que pega quem está do lado.
5. **Criador** (⚙️ → **🎨 Mudar visual**): só a Vila 1 dá para escolher; as outras têm cadeado.
6. **Extração** (depois da v10): falhando, a Casa dos Pergaminhos mostra a chance maior na próxima ("40% + 10% de
   sorte acumulada").

## Passo 23 — Atualização v16: fim de jogo (vilas, Kage, PvP, renegados, Akatsuki, capas)

**Banco (opcional, pode ser antes ou depois do deploy):** no Neon → **SQL Editor** (confira que o branch é o
`production`), cole e rode o arquivo `db/schema_v11_endgame.sql` inteiro. É grande (as regras do fim de jogo moram no
banco), mas segue as regras de sempre: sem bloco `DO $$`, tudo dentro de `BEGIN; ... COMMIT;`, e pode rodar de novo.
Ele não apaga nem renomeia nada: só cria tabelas, colunas novas e funções. Todo mundo continua na Folha.

O servidor **sobe sem a migração**: os módulos ficam desligados e o log do Render avisa (`Fim de jogo desligado`).
Depois de rodar o SQL **não precisa reiniciar**: o servidor confere a cada minuto e liga sozinho.

Conferência (opcional), deve dar `5 | 4 | 5`:

```sql
SELECT (SELECT count(*) FROM game.villages), (SELECT count(*) FROM game.endgame_modules),
       (SELECT count(*) FROM game.items WHERE kind = 'cape');
```

### Os módulos ligam com a população

Cada módulo liga sozinho quando o servidor tem gente ativa na semana (entrou nos últimos 7 dias): **vilas 30**,
**PvP 60**, **renegados 100**, **Akatsuki 150**. Ligou, fica ligado. Para testar antes (ou desligar), o admin manda no
chat (só a conta com `is_admin`; tudo vai para a auditoria e ninguém vê anúncio):

- `/admin endgame vilas on` liga as vilas; `/admin endgame akatsuki on` liga os quatro (liga os anteriores junto).
- `/admin endgame vilas auto` devolve ao automático; `off` desliga (e os que dependem dele).

### Testar no celular (com 2 contas)

1. **Ligar:** com o Victor, `/admin endgame akatsuki on`. Aparece o botão **🏯** no topo.
2. **Vilas:** com a outra conta, ⚙️ → **🎨 Mudar visual**: agora as quatro vilas abrem. Escolher outra (só 1 troca
   depois de criado) leva para a praça dela, com o chão e os telhados da vila. A passiva aparece no 🏯.
3. **Posto de Viagem** (NPC verde 旅, perto do portão de cada vila): Floresta, Zona de Conflito e as vilas aliadas
   (50 ryō). Quem não é da Folha não entra na Folha a pé: a saída da Floresta vira parede.
4. **Kage:** `/admin kage folha Victor` (ou a eleição: candidatura com o Diretor no nível 60, voto no 🏯 por 7 dias).
   No 🏯 → aba **Kage**: declarar guerra, propor aliança, aceitar, desfazer, expulsar e decidir denúncias.
5. **Zona de Conflito:** pelo Posto. Fora do acampamento é PvP livre (menos aliados). A vitória conta no ranking
   (🏯 → **Ranking**), menos para contas de admin.
6. **Renegado:** `/admin renegado <nome> on` (e `off` desfaz: é a única forma). Ele vai para o Refúgio dos Renegados,
   com a bandana riscada; o Posto de lá só vai para a Zona.
7. **Akatsuki:** `/admin akatsuki lider <nome>`. O líder convida no 🏯 → **Akatsuki**; o membro ganha o botão ☁️ do
   poder da vaga (com recarga).
8. **Capas:** a Alfaiataria vende a Capa de Viagem e a Capa da Vila. 🎒 → **Vestir**. ⚙️ → "O que os outros veem no
   seu boneco": esconder capa, arma ou pergaminho.

## Passo 24 — Atualização v18: sapatos, tela de equipamentos e `/admin ryo`

**Banco (OBRIGATÓRIO e ANTES do deploy):** no Neon → **SQL Editor** (confira que o branch é o `production`), cole e
rode o arquivo `db/schema_v12_sapatos.sql` inteiro. Segue as regras de sempre (sem bloco `DO $$`, tudo dentro de
`BEGIN; ... COMMIT;`) e pode rodar de novo. Ele:

- cria os sapatos no catálogo (Sandália Ninja, Sandália de Couro, Botas de Viagem e Botas Ninja, na Alfaiataria);
- cria a coluna do sapato calçado e dá a **Sandália Ninja** (no inventário e calçada) a todo mundo que já existe e a
  toda conta nova;
- cria a função do `/admin ryo`.

Só **depois** publique o código na `main`. Sem a migração, o servidor novo não sobe: o log do Render diz
`Falta a migração v12` e o Render mantém a versão anterior no ar (aí é só rodar o SQL e fazer "Manual Deploy").

Conferência (opcional), deve dar `4 | 0`:

```sql
SELECT (SELECT count(*) FROM game.items WHERE kind = 'shoes'),
       (SELECT count(*) FROM game.players WHERE equipped_shoes IS NULL);
```

### Testar no celular

1. **Sapato:** todo mundo aparece de Sandália Ninja. 🎒 → espaço **Pés**. Na Alfaiataria, comprar as **Botas de
   Viagem**; na 🎒, escolher as botas na grade e tocar em **Calçar**. O boneco troca para todos no mapa. **Descalçar**
   deixa o pé de fora.
2. **Tela de equipamentos:** não tem mais Pescoço, Anéis e Brincos. No lugar: **Máscara** e **Acessório** (com
   cadeado até chegarem os itens) e o **Pés** funcionando.
3. **`/admin ryo <nome> <quantidade>`** (de 1 a 1.000.000): o ryō chega na hora (o jogador online vê o aviso) e fica
   na auditoria (`game.admin_audit_log`, comando `giveryo`).
4. **Combate:** sem nenhum monstro perto, o 🗡️, o 👊 e a Ilusão saem assim mesmo (e erram). O 🔥 vai bem mais
   longe (9 casas). O 💧 empurra o monstro. Na praça (zona segura) o 🗡️ anima, sem dano. Com outro ninja perto, o
   🎯 foca ele também (anel verde), e a Cura vai nele.
5. **Clima:** os bônus agora são de no máximo **5%** (Fogo +5% no dia quente, Água +5% na chuva, Sombra +5% de
   noite...). `/admin clima chuva` e tocar no ícone 🌧️ embaixo das barras mostra o bônus.

## Passo 25 — Atualização v19: Rei Lodo, números de PvP e Painel do Admin

**Banco:** nada a rodar. Os números de PvP só **leem** a tabela `game.pvp_matches` (criada na v11). Basta publicar a
`main` (o Render faz o deploy sozinho).

### Testar no celular

1. **Painel do Admin (conta Victor):** no menu ☰ aparece o ícone **Admin** (quem não é admin não vê; desde a v20 ele fica no menu, não mais solto em cima do chat).
   - **Jogador alvo** em cima (o "eu" põe o seu nome; a lista sugere quem está online).
   - Abas **Jogador** (ryō, nível, zerar pontos, efeito, vila, Kage, renegado, Akatsuki), **Itens** e **Jutsus** (é
     só tocar no item ou no jutsu), **Monstros**, **Mundo** (ir para um mapa, clima, hora), **Fim de jogo** e **PvP**.
   - O que não volta atrás (zerar pontos, renegado, remover da Akatsuki, fechar eleição ou temporada) pede um
     segundo toque.
   - O rodapé mostra o comando de chat equivalente (ex.: `/admin ryo Victor 1000`) e a resposta do servidor.
2. **Comandos em português:** `/admin ajuda` lista todos (`nivel`, `invocar`, `darjutsu`, `daritem`, `ryo`,
   `zerarpontos`, `pvp`, `ir`, `clima`, `hora`, `efeito`, `fimdejogo`, `vila`, `kage`, `eleicao`, `evento`,
   `renegado`, `akatsuki`, `temporada`). Os nomes antigos (`level`, `spawn`, `givejutsu`...) continuam valendo.
3. **Rei Lodo:** na Caverna do Lodo, canto leste da câmara do lago (ou `/admin invocar rei_lodo 1`). Barra do chefe
   no topo; em 65% ele chama 4 slimes; em 30% fica furioso e marca o **Esmagar** roxo no alvo (sair do círculo).
4. **PvP:** depois de algumas lutas, 🛡️ → **PvP** → **Ver números**: vitórias e derrotas por classe, dano por golpe e,
   do banco, a Zona de Conflito dos últimos dias.
5. **Ilusão tier 3 e 4:** quem é atingido fica atordoado e, depois, em silêncio (ícone 🤐, sem jutsu) por mais 3 s ou
   4,5 s.

---

## Passo 26 — Atualização v20: a Vila da Pedra sai do jogo

**Banco primeiro.** No Neon, abra o **SQL Editor**, confira no seletor que o branch é o `production` e rode o arquivo
`db/schema_v13_sem_pedra.sql` inteiro. Ele apaga linhas (da Pedra), então antes crie um branch de backup do
`production` e mude o "Expires" dele para **Never**. A migração segue as regras de sempre (sem bloco `DO $$`, tudo
dentro de `BEGIN; ... COMMIT;`) e pode rodar de novo. Ela:

- passa quem for da Pedra para a Folha e devolve a troca de vila (hoje ninguém é da Pedra, então não muda ninguém);
- apaga o Kage, a eleição, a diplomacia, os eventos, as denúncias e o registro do Kage da Pedra;
- apaga a Vila da Pedra.

Para conferir depois: `SELECT name FROM game.villages ORDER BY sort_order;` tem que mostrar Folha, Névoa, Nuvem e Areia.

**Deu `column "village" does not exist`?** Então o banco ainda não tem a v11 (Passo 23): toque em **ROLLBACK** (nada
foi gravado) e rode `db/schema_v11_endgame.sql` no lugar desta. A v11 atual já cria só as quatro vilas, então a v13 não
faz falta (se rodar depois, não muda nada). O servidor acha a v11 sozinho em até 1 minuto, sem deploy.

**Depois o código:** publique a `main` (o Render faz o deploy sozinho).

### Testar no celular

1. **Criador:** ⚙️ → **🎨 Mudar visual do personagem**. Na linha **Vila** aparecem Folha, Névoa, Nuvem e Areia (com o
   módulo de vilas desligado, só a Folha abre; as outras ficam com cadeado).
2. **Admin:** `/admin vila <nome> pedra` responde com o uso: `<folha|nevoa|nuvem|areia>`.
3. **Zona de Conflito** (com o módulo de PvP ligado): cinco acampamentos, sem o do meio de cima.
4. **Tela do jogo (celular deitado):** o chat tem letra menor e fica translúcido; toque nele (ou no campo de escrever) e
   ele fica opaco, toque fora e volta a ficar translúcido. O botão Admin saiu de cima do chat e está no menu ☰. O status
   (jogadores e ping) fica pequeno no alto, à esquerda do ☰, em vez de no meio da tela.

---

## Passo 27 — O site do jogo (Floot)

O site mostra ranking PvP e MMR, ranks, vilas e eleição do Kage (com voto), notícias, votação de atualizações e o
painel do admin ao vivo, com push no celular quando algo dá errado. Não tem migração no Neon: o site tem o próprio
banco no Floot. O código do jogo que fala com o site já está na `main`; ele só liga quando os dois segredos abaixo
existirem no Render.

### 1. Criar o segredo do site

Gere uma senha aleatória de **40 caracteres** (letras e números) no gerenciador de senhas do celular. Ela é o
`SITE_TOKEN`: precisa ser **diferente** do `JWT_SECRET` e do `SERVICE_TOKEN`. Não mande por chat nem cole em lugar
nenhum além dos dois painéis abaixo.

### 2. Render

**servidor-missoes → Environment → Add Environment Variable:**

- `SITE_TOKEN` = o segredo do item 1;
- `SITE_URL` = o endereço do site publicado no Floot (o que aparece ao publicar, algo como
  `https://….floot.app`), **sem `/` no fim**.

Salve. O Render reinicia o servidor sozinho.

### 3. Floot

No projeto **Herança do Fogo**, conecte a credencial que o site pede (o Floot mostra um link para isso):

- `GAME_URL` = `https://servidor-missoes-ffb4.onrender.com`;
- `SITE_TOKEN` = o **mesmo** segredo do item 1.

### 4. Testar no celular

1. Abra o jogo e entre (isso acorda o servidor). Em até 1 minuto o selo no alto do site muda para **Online** com o
   número de jogadores.
2. **Entrar** no site com a conta do jogo. No ranking, a sua linha aparece destacada.
3. **Vilas e Kage:** com eleição aberta na sua vila, o botão de votar aparece (ou o motivo de não poder votar).
4. **Painel** (só admin): aba **Ao vivo** com os números do último batimento; os gráficos enchem com o tempo.
5. Aba **Notificações → Ligar push aqui** e **Mandar um teste**: a notificação chega no celular. No iPhone, antes,
   abra o site no Safari → Compartilhar → **Adicionar à Tela de Início** e use o site pelo ícone.

### Bom saber

- **Alarme de queda:** usa uma tarefa agendada do Floot, que só existe no plano **Pro**. Sem ele, o selo vira
  "Sem sinal" 3 minutos depois do último batimento, mas o push de "queda" não sai (os outros alertas saem normalmente).
- **E-mail dos alertas:** sem um domínio verificado na aba Email do Floot, o e-mail só chega ao dono da conta do Floot.
- **Servidor dormindo:** o selo e o painel só recebem e nunca acordam o Render. Já as páginas de ranking, vilas e
  perfil perguntam ao jogo, e essa pergunta acorda o servidor: na primeira visita com ele dormindo a página avisa que o
  jogo está acordando, e um minuto depois os dados aparecem.

---

## Passo 28 — Atualização v22: Névoa, Nuvem e Areia com o desenho delas

**Banco:** nada a rodar. Publique a `main` (o Render faz o deploy sozinho).

### Testar no celular

Use o admin para ir a cada vila (`/admin ir vila_areia 40 52`, `vila_nevoa`, `vila_nuvem`):

1. **Areia:** prédios redondos de arenito, cânion em volta, palmeiras e cactos, chão de areia, pontes de pedra e a
   arena de terra batida. As portas das lojas e da Academia continuam funcionando no mesmo lugar.
2. **Névoa:** bambu perto das lojas e da praça, grama mais fria e poças no chão.
3. **Nuvem:** nuvens no alto do morro e bandeiras vinho na praça; dá para andar por cima delas (são enfeite).
4. Viaje de uma vila para a outra e volte: cada vila mantém as árvores dela (sem palmeira na Névoa, por exemplo).

---

## Passo 29 — Atualização v27: o casaco com capuz vira acessório (SQL **antes** do deploy)

**Banco primeiro.** No Neon, abra o **SQL Editor**, confira no seletor que o branch é o `production` e rode o arquivo
`db/schema_v14_acessorio.sql` inteiro. Ele segue as regras de sempre (sem bloco `DO $$`, tudo dentro de
`BEGIN; ... COMMIT;`) e pode rodar de novo. Ela:

- cria o tipo de item `accessory` e os quatro casacos com capuz na Alfaiataria (petróleo, preto, vinho e verde, 1.200 ryō);
- cria `players.equipped_accessory` (o acessório equipado, só um que o jogador tem);
- quem tinha escolhido "Casaco com capuz" como roupa no Criador ganha o casaco da mesma cor, já equipado, e a roupa
  volta para "Camisa e calça".

Para conferir depois: `SELECT code FROM game.items WHERE kind = 'accessory';` mostra os quatro casacos.

**Depois o código:** publique a `main` (o Render faz o deploy sozinho). Sem a migração, o servidor novo não sobe: o
log do Render pede para rodar este arquivo e o Render mantém a versão anterior no ar.

### Testar no celular

1. **Alfaiataria:** os quatro casacos com capuz aparecem à venda, com "acessório (por cima da roupa)".
2. **Equipamentos:** o espaço **Acessório** não tem mais cadeado. Vista um casaco: ele aparece por cima da camisa e
   calça (ou do conjunto da vila), é uma peça só nas costas e todos veem. **Tirar** volta à roupa.
3. **Criador:** a linha **Roupa** só tem "Camisa e calça" e "Conjunto da vila".

## Passo 30 — Atualização v29: modo rankeado (SQL **antes** do deploy, mas opcional)

**Banco primeiro.** No Neon, abra o **SQL Editor**, confira no seletor que o branch é o `production` e rode o arquivo
`db/schema_v15_rankeado.sql` inteiro. Ele segue as regras de sempre (sem bloco `DO $$`, tudo dentro de
`BEGIN; ... COMMIT;`), só cria coisas novas e pode rodar de novo. Ele cria:

- as temporadas do rankeado (60 dias; a 1ª começa na hora em que você roda), separadas das da Zona de Conflito;
- os pontos de cada ninja (começa em 1000), gerais e por temporada;
- o registro de cada partida (placar, motivo, duração, rodadas, versão da tabela de equilíbrio);
- `game.ranked_result` (grava a partida e mexe nos pontos: K = 24, fator do novato nas 30 primeiras partidas, até 15
  níveis de diferença, até 3 partidas por dia da mesma dupla, conta de admin fora);
- `game.close_ranked_season` (o servidor fecha a temporada sozinho e paga as recompensas).

Para conferir depois: `SELECT id, ends_at FROM game.ranked_seasons;` mostra a temporada 1 aberta.

**Depois o código:** publique a `main`. Sem a migração o servidor sobe igual (o log avisa): o rankeado funciona, só não
conta pontos, e o painel de Ranking diz que falta a v15. Rodando a migração depois, o servidor acha sozinho em até 1
minuto (não precisa reiniciar).

### Testar no celular

1. **Menu → Rankeado:** vai para o Vale dos Guardiões (o botão vira **Voltar**, que devolve para onde você estava).
2. **⚔️ Desafio** (embaixo, no meio): entra na fila; o botão mostra a posição. Com 2 na fila, a preparação começa e o
   placar no alto mostra os nomes. Rodadas de até 50 s, melhor de 3; ninguém morre.
3. No fim, aparece "+N pontos" para os dois; **🏆 Ranking** mostra a temporada, o top 50 e a sua posição.
4. Conta de admin não ganha nem perde pontos (o chat avisa "não contou").

## Passo 31 — Atualização v29: Jutsus v2, o Fogo novo e a conjuração (SQL v16)

**Banco e código em seguida, sem intervalo.** No Neon, abra o **SQL Editor**, confira no seletor que o branch é o
`production` e rode o arquivo `db/schema_v16_jutsus_fogo.sql` inteiro. Ele segue as regras de sempre (sem bloco `DO $$`,
tudo dentro de `BEGIN; ... COMMIT;`) e pode rodar de novo. Ele:

- coloca os 7 jutsus de Fogo novos em `game.jutsus` e troca os nomes de `fire_2`, `fire_3` e `fire_4` (os códigos ficam:
  ninguém perde jutsu, uso nem nível);
- troca a regra dos kits (`game.valid_kit`) para aceitar os códigos novos.

**Logo depois, o código:** mescle na `main` (o Render publica sozinho). Entre a migração e o deploy, quem fizer uma
Extração de Fogo pode ganhar um jutsu que o servidor antigo ainda não conhece; por isso as duas coisas em seguida.
(O código novo sem a migração funciona: só não sorteia os jutsus novos.)

Para conferir: `SELECT tier, count(*) FROM game.jutsus WHERE class_code = 'fire' GROUP BY tier ORDER BY tier;` mostra
1: 4, 2: 4, 3: 2, 4: 1.

### Testar no celular

1. **Fogo:** um ninja de Fogo com os jutsus novos (Extração de Fogo nos tiers 1 a 3) vê a barra de selos sobre a cabeça
   e perto dos botões nos jutsus com conjuração (Chamas da Fênix, Dragão Guiado, Destruição Magnífica, Míssil Dragão,
   Chuva de Meteoros).
2. **Interromper:** na arena, um ninja de Relâmpago acerta o de Fogo no meio dos selos: aparece "Interrompido!".
3. **Rankeado:** perca a rodada 1 com o adversário queimando você: no intervalo não aparece a tela de derrota e na
   rodada 2 você volta com a vida cheia e consegue lutar.

## Passo 32 — Fase 1: Herança do Fogo e as aldeias (SQL v17)

Rode `db/schema_v17_nomes.sql` inteiro no SQL Editor do Neon (branch `production`). Só troca os nomes das vilas em
`game.villages` (Chama Eterna, Maré Oculta, Vento Cortante, Rocha Antiga; a ordem Nuvem/Areia foi corrigida na v22); ninguém muda de vila. Pode rodar de novo.
Para conferir: `SELECT code, name FROM game.villages ORDER BY sort_order;`

## Passo 33 — As outras 8 classes (SQL v18)

Rode `db/schema_v18_jutsus_classes.sql` inteiro no SQL Editor do Neon (branch `production`), **depois da v16**. Ele põe
os jutsus de Água, Relâmpago, Terra, Médico, Armas, Ilusão, Taijutsu e Sombra em `game.jutsus` (27 novos e os nomes novos
dos tiers 2 a 4) e deixa a regra dos kits aceitar os 72 códigos. Pode rodar de novo.

**Depois das três (v16, v17, v18), o código:** mescle o branch na `main` logo em seguida (o Render publica sozinho).
Entre as migrações e o deploy, uma Extração pode dar um jutsu que o servidor antigo ainda não conhece.

Para conferir: `SELECT count(*) FROM game.jutsus;` mostra 72.

### Testar no celular

1. Tela de entrada e título: **Herança do Fogo**. No chat, as mensagens dizem "Aldeia da Chama Eterna" etc.
2. Extração de qualquer classe: os jutsus novos aparecem; no kit, cada um sai com o desenho da forma dele (linha, anel,
   cone, zona no chão, aviso).

## Passo 34 — Os clãs (SQL v19)

Rode `db/schema_v19_clas.sql` inteiro no SQL Editor do Neon (branch `production`), **depois da v18**. Ela cria a coluna
da linhagem (`game.players.clan`), marca jutsu de clã em `game.jutsus` (`clan_code`) e põe os 4 jutsus do Clã Rubro.
Pode rodar de novo. **O código novo precisa da v19** (ele lê a linhagem ao entrar): rode as migrações antes de mesclar.

Para conferir: `SELECT code, tier FROM game.jutsus WHERE clan_code = 'rubro' ORDER BY tier;` mostra 4 linhas.

### Testar no celular

1. Um ninja Genin (nível 11 ou mais) recebe o aviso da linhagem; no chat: `/linhagem rubro`, `/linhagem umbra` ou
   `/linhagem andarilho`. Uma vez só.
2. Rubro: o Olho da Percepção aparece nos jutsus; os outros chegam nos níveis 20, 40 e 60.

## Passo 35 — Fase 0: a Extração nova e a maestria (SQL v20)

Rode `db/schema_v20_extracao.sql` inteiro no SQL Editor do Neon (branch `production`), **depois da v19**. Ela troca a
função da Extração (`game.extract_jutsu`: 1/2/3/4 pergaminhos; tier 1 com as 2 primeiras garantidas e 90% depois;
80/60/40%), põe a Lua Ilusória e o Guardião Espectral Completo no catálogo e atualiza a regra dos kits. Pode rodar de
novo. **Não rode a v10 de novo depois dela** (a v10 volta a Extração para a tabela antiga; se rodar, rode a v20 outra vez).

Sem a v20 o jogo funciona, mas a Extração continua com os números antigos (a tela mostraria os novos).

Para conferir: `SELECT count(*) FROM game.jutsus;` dá 96.

### Testar no celular

1. Um ninja Genin abre a Casa dos Pergaminhos, tier 1: "chance de 100% (garantida: 2 de 2 ainda)" e custa 1 pergaminho.
2. Duas Extrações de tier 1 dão jutsu sempre; a 3ª mostra 90%. Tier 3 custa 3 pergaminhos e mostra 60%.
3. ☰ → Perfil → Jutsus: cada jutsu do Fogo mostra a linha "Maestria" (ex.: Chuva de Meteoros: "dano +0% · recarga −0%"
   no nível 1; "dano +30% · recarga −15%" no nível 4).

## Passo 36 — Fase 1: nomes originais (SQL v21)

Rode `db/schema_v21_nomes_jutsus.sql` inteiro no SQL Editor do Neon (branch `production`), **depois da v20**. Ela só troca nomes exibidos:
38 jutsus em `game.jutsus` e o nome do manto em `game.items`. Ninguém perde nada (os códigos não mudam). Pode rodar de novo.
**Se você rodar a v16, a v18, a v19 ou a v20 de novo depois, rode a v21 outra vez** (elas devolvem os nomes antigos).

Para conferir: `SELECT name FROM game.items WHERE code = 'manto_akatsuki';` mostra Manto Cinza.

### Testar no celular

1. ☰ → Perfil → Jutsus: nomes novos (por exemplo "Revoada de Brasas", "Disco do Furacão").
2. Botão do Rankeado: o lugar se chama Arena das Quatro Heranças.
3. Com o módulo ligado: o painel da vila tem a aba **Cinzas** e o convite diz "Convite dos Cinzas".

## Passo 37 — Aldeias Nuvem e Areia corrigidas (SQL v22)

Rode `db/schema_v22_aldeias.sql` inteiro no SQL Editor do Neon (branch `production`), **depois da v21**. Ela corrige os nomes de duas aldeias
(a v17 tinha trocado): `vila_4` (Nuvem) vira **Vento Cortante** e `vila_5` (Areia) vira **Rocha Antiga**. Ninguém muda de vila. Pode rodar
de novo. Sem a v11 (o fim de jogo) ela não faz nada, e o jogo funciona do mesmo jeito (os nomes vêm do código).

Para conferir (só com a v11): `SELECT code, name FROM game.villages ORDER BY sort_order;` mostra Chama Eterna, Maré Oculta, Vento Cortante, Rocha Antiga.

### Testar no celular

1. Na aldeia das nuvens (a que tem as bandeiras com nuvem branca): o nome é **Aldeia do Vento Cortante**.
2. Na aldeia do deserto: **Aldeia da Rocha Antiga**.
3. `/admin vila <nome> vento` leva para a aldeia das nuvens; `rocha` para a do deserto.

## Passo 38 — O admin muda a patente (SQL v23)

Rode `db/schema_v23_admin_patente.sql` inteiro no SQL Editor do Neon (branch `production`), **depois da v22**. Ela cria a patente ANBU
(`game.ranks`), a função `game.admin_set_rank` e deixa o admin refazer a Missão de Genin (`game.become_genin`; quem não é admin continua com uma vez só). Pode rodar de novo. Sem ela o jogo funciona, mas `/admin patente` avisa "Rode a migração v23".
Se o editor mostrar "In transaction" no fim, rode `COMMIT;` sozinho (aconteceu na v10 a v22).

Para conferir: `SELECT code, name, tier FROM game.ranks ORDER BY tier;` mostra Academia, Genin, Chunin, Jonin, Specialized Jonin, **ANBU**, Kage.

### Testar no celular

1. Conta admin: `/admin patente eu anbu` → a barra de baixo mostra "ANBU · NV ...".
2. `/admin patente <outro jogador> academia` → ele recebe o aviso e vê "ACADEMIA". `/admin patente eu kage` volta o seu.
3. Missão de Genin repetida: `/admin patente eu academia`, fale com o Diretor, escolha uma classe → vira Genin de novo (classe trocada, +1 pergaminho).
4. 🛡️ Painel do Admin → Jogador → Patente → escolha e "Mudar patente" (o campo "eu" vale).

## Passo 39 — Pergaminho único e reset de classes do admin (SQL v24)

Rode `db/schema_v24_pergaminho_unico.sql` inteiro no SQL Editor do Neon (branch `production`), **depois da v23**. Ela cria o pergaminho
único, soma nele os pergaminhos de classe de todo mundo (nada se perde), troca o das costas, tira os de classe da loja, troca a Extração, a
Missão de Genin e o prêmio do PvP para o pergaminho novo e cria o reset de classes do admin. Pode rodar de novo.
**Rode a v24 antes de mesclar o código**: o código novo vende e usa só o pergaminho único.
Se o editor mostrar "In transaction" no fim, rode `COMMIT;` sozinho.

Para conferir: `SELECT count(*) FROM game.player_items WHERE item_code LIKE 'scroll_%' AND item_code <> 'scroll_liso';` dá 0.

### Testar no celular

1. Casa dos Pergaminhos: a loja mostra só "Pergaminho"; a Extração diz "Você tem N" (o mesmo para todas as suas classes).
2. ☰ → Perfil → Kits: só aparecem jutsus da Academia, das suas classes e da sua linhagem.
3. Conta admin: `/admin resetarclasses eu` → Academia, sem classe; fale com o Diretor e escolha a classe de novo.

## Passo 40 — Linhagem e Rito do Despertar (SQL v25)

Rode `db/schema_v25_linhagem.sql` inteiro no SQL Editor do Neon (branch `production`), **depois da v24**, e só então mescle o código.
Ela cria `players.clan_mark` e `players.rite_progress`, cadastra os 4 jutsus do Clã Umbra e atualiza `valid_kit` e `admin_reset_classes`.
Pode rodar de novo sem erro. Conferência: `SELECT count(*) FROM game.jutsus;` deve dar 100.
