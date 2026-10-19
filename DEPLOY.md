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
7. E a do NPC Mestre: apague o editor, cole o arquivo `db/schema_v4_npc_missions.sql` inteiro e toque em **Run**.
   Também pode rodar de novo sem erro.

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

   Toque em **Connect**. Chega um `welcome` com `"x":50,"y":50` (centro do mapa), `"players":[]`, os monstros e os dados do mapa.
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

1. Entre no jogo (Passo 8). Você nasce no **centro do mapa**, onde as estradas se cruzam. Ali é área segura.
2. Ande alguns passos para qualquer lado: os **monstros** (círculos vermelhos com "M") ficam num anel em
   volta do centro. São sempre 5.
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
