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
   vira um golpe com ela (recua, estoca, desce). Equipe a Espada Longa: a kunai sai da mão e a espada fica grande na
   lombar; no 🗡️ ela sai das costas para a mão, corta e volta (a bainha vazia fica nas costas). O pergaminho
   continua nas costas com qualquer arma.
7. **Shuriken Gigante:** equipada, fica enorme nas costas (de frente, as lâminas saem dos lados da cintura). O 🗡️
   vira um arremesso: ela sai girando até 6 casas, atravessa todos os slimes na linha (85 de dano em cada) e volta
   para as costas. A recarga é bem lenta (3 s, contando no botão).
8. **Admin (conta Victor):** `/admin spawn slime 4` em volta, para testar vários de uma vez;
   `/admin giveitem Victor fuma_shuriken 1` para ganhar a Shuriken Gigante.
