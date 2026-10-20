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
psql "$DATABASE_URL" -f db/schema_v4_npc_missions.sql   # migração v4: NPC Mestre
psql "$DATABASE_URL" -f db/schema_v5_atributos.sql      # migração v5: nível, atributos, kits
psql "$DATABASE_URL" -f db/schema_v6_aparencia.sql      # migração v6: visual do personagem
# opcional, só para testes: deixa a conta "Victor" como Hokage
psql "$DATABASE_URL" -f db/promote_victor.sql
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
então não precisa de CORS. São seis arquivos (`index.html`, `game.js`, `targeting.js`, `village.js`, `character.js`, `styles.css`), sem bibliotecas,
servidos de uma lista fechada com CSP (`script-src 'self'`) e ETag.

- **Tela:** login e cadastro.
- **Mapa:** canvas que se ajusta à tela, com a câmera seguindo o jogador.
- **Mapa:** grade sobre o chão verde, desenhado em blocos guardados em memória (poucas imagens por quadro).
- **Personagem:** círculo com a inicial do nome.
- **Controles:** joystick flutuante à esquerda (nasce onde o polegar toca) e 7 habilidades à direita, cada uma com uma animação.
- **Chat:** botão 💬 no topo abre a barra de digitação; as mensagens aparecem na tela e somem em ~6 s.
- **🎯 Alvo (foco):** foca o monstro vivo mais perto (até 10 casas); tocar de novo passa para o próximo
  (ciclo). A câmera desliza para o meio do caminho e afasta o zoom só o necessário para os dois caberem
  (no máximo 5 casas de deslocamento e zoom 0,6). Andar para mais de 12 casas perde o foco.
  A lógica fica em `public/targeting.js` (funções puras, testadas em `test/targeting.test.ts`).
- **🧘 Meditar:** liga/desliga a meditação (aura azul).
- **📜 Missões (Sala de Missões):** botão no topo que mostra o progresso (ex.: `2/5`, depois `Pronta!`). Abre um
  painel com o sensei, o objetivo, a barra de progresso, o que falta e a recompensa. Só exibe o que o
  servidor manda.
- **Mestre (NPC):** desenhado ao lado do renascimento com um marcador: `!` tem missão, `?` cinza em
  andamento, `?` dourado pronta para entregar. Perto dele aparece **💬 Falar**. Com a missão pronta e o
  Mestre fora da tela, uma seta na borda aponta para ele.
- **Combate estilo MOBA** (canto de baixo à direita), com a recarga em sombra girando + segundos:
  - 🗡️ Ataque Básico, o maior botão;
  - as 4 habilidades do kit ativo em semicírculo;
  - 🧘 acima, 🏃 abaixo, 🔄 trocar de kit e 🎯 foco acima das habilidades;
  - 💬 aparece perto do NPC.

  Os botões respondem no toque (`pointerdown`), então dá para focar e atacar segurando o joystick.
- **📊 Ficha:** nível, XP do nível, pontos e "+" nos 6 atributos; a aba Kits monta os 2 kits.
- **Tocar em outro jogador:** abre o menu dele (Criar Missão para Chunin+, Entregar missão para o aprendiz).
- **No computador:**

  | Ação | Tecla |
  |---|---|
  | Andar | WASD ou setas |
  | Ataque Básico | Espaço |
  | Habilidades | 1 a 4 |
  | Trocar de kit | Q |
  | Correr | R |
  | Meditar | M |
  | Foco | T |
  | Ficha | C |
  | Configurações / editar layout | botão ⚙️ |
  | Falar com o NPC | E |
  | Missões | J |
  | Chat | Enter |

O token fica no `localStorage` e vai no subprotocolo do WebSocket, nunca na URL.

## Tempo real (WebSocket)

`wss://<servidor>/game`, na mesma porta da API pública. O JWT é validado antes do upgrade: token
ausente, inválido ou vencido recebe HTTP 401 e não conecta. O token pode vir:

- pelo subprotocolo `nin.v1, jwt.<JWT>` (cliente web);
- por `Authorization: Bearer` (apps nativos);
- por `?token=` (só para teste manual).

| Direção | Mensagem |
|---|---|
| cliente → servidor | `{"type":"input","seq":41,"inputs":[[1,0],[0.7,-0.7]]}` (entradas numeradas, 1 por tick de 50 ms, eixos -1 a 1; 1 a 10 por mensagem) · `{"type":"move","dx":0.5,"dy":-0.5}` (direção segurada, antiga: só para teste manual) · `{"type":"cast","skill":"fire"}` · `{"type":"talk","npcId":"sensei"}` · `{"type":"missions"}` · `{"type":"chat","message":"Olá!"}` |
| ao conectar | `welcome {you, players (os outros), world {width,height,speed,tickMs}}` |
| a cada tick (50 ms) | `player_moved {playerId,x,y,d,a}` para todos, inclusive quem andou (`d` = direção do boneco; `a` = última entrada aplicada, para a reconciliação) |
| entradas e saídas | `player_joined` · `player_left` |
| para todos | `chat {playerId,username,message}` |
| só para quem enviou | `error {code,message}` |

Mensagens de combate (o servidor decide tudo; o cliente só pede `cast` e `respawn`):
`stats` (vida/chakra do dono), `player_hp`, `cast` / `cast_failed`, `hit` (número flutuante), `monsters_moved`,
`monster_spawned`, `monster_status`, `monster_died`, `player_died`, `player_respawned`, `xp`, `announce`.

### Combate PvE (valores em `src/realtime/config.ts` → `combat`)

| Habilidade | Chakra | Recarga | Efeito |
|---|---|---|---|
| Fogo (`fire`) | 20 | 1,5 s | 25 de dano em todos a até 3 casas |
| Água (`water`) | 15 | 1 s | 20 de dano num cone de 90° e 4 casas, para onde o jogador olhou por último |
| Taijutsu (`taijutsu`) | 5 | 0,5 s | 35 de dano no monstro mais perto, a até 1,5 casa |
| Ilusão (`illusion`) | 30 | 4 s | atordoa o mais perto (até 5 casas) por 3 s: não anda nem ataca |
| Sombra (`shadow`) | 25 | 6 s | prende o mais perto (até 5 casas) por 5 s: não anda, mas ataca |
| Pedra (`stone`) | 15 | 6 s | escudo: o próximo dano cai pela metade |
| Cura (`heal`) | 30 | 4 s | +30 de vida (até 100) |

- **Jogador:** 100 de vida (regenera 1/s) e 100 de chakra (regenera 5/s). Sem alvo, com vida cheia ou com
  escudo ativo, a habilidade falha sem gastar chakra.
- **Monstros:** 5 sempre vivos (`slime`, 60 de vida), num anel de 5 a 16 casas em volta do centro (o centro
  é área segura). Andam 1 casa por ~1 s e batem 10 em quem estiver a até 1,2 casa, a cada 2 s.
- **Derrota:** com vida 0, o jogador não anda nem usa habilidade. Depois de 5 s pode pedir `respawn` e
  volta ao centro com vida e chakra cheios. Reconectar não cura.
- **Jutsus direcionados:** com alvo focado, Fogo, Água, Ilusão e Sombra mandam `targetId`. O servidor
  vira o jogador para o alvo (a Água sai na direção dele) e confere o alcance (Fogo 3, Água 4, Ilusão e
  Sombra 5): longe demais = `OUT_OF_RANGE`, sem gastar chakra.
- **Meditação** (`{"type":"meditate","active":true}`): parado, chakra 3x mais rápido (15/s). Tentar andar,
  tentar usar habilidade ou apanhar de monstro encerra na hora (`meditation` com `reason`). Morto não medita.
- **XP:** cada monstro dá 20 de XP para quem deu o último golpe. O XP é gravado em `game.players.total_xp`
  num SQL atômico (`src/realtime/progression.ts`). Aos 100 XP, Academia sobe para Genin no banco, com
  histórico em `player_rank_changes` e aviso para todos.

Regras (em `src/realtime/config.ts`):

- **Movimento autoritativo:** o cliente manda só a direção e o servidor anda 5 casas/s. Speed hack não existe.
- **Mapa:** 100 × 100 casas; nasce e renasce no centro (50, 50).
- **Anti-flood:** 20 mensagens/s, com rajada de 30. Mais de 100 descartadas em 1 s fecha a conexão (1008).
- **Chat:** 1 mensagem/s (rajada de 3), até 200 caracteres.
- **Tamanho:** mensagem acima de 1 KiB fecha a conexão (1009).
- **Mesma conta:** conectando de novo, derruba a conexão antiga (4000).

O estado fica em memória: reinício ou deploy do Render desconecta todos e as posições voltam ao início.

### v7: movimento com predição no cliente e reconciliação

Com ~200 ms de ida e volta, esperar o servidor para andar dá atraso no joystick. Agora:

- **Predição (`public/prediction.js`):** a cada tick de 50 ms com o joystick inclinado, o cliente
  cria uma entrada numerada `{seq, dx, dy}` e anda na hora. Ele usa a **mesma função** do servidor
  (`public/movement.js` = `src/realtime/movement.ts`, com o mesmo arredondamento e as mesmas paredes,
  as casas da vila). Um teste compara as duas em 10 mil passos aleatórios.
- **Envio leve:** as entradas vão em lotes de 2 (cerca de 10 mensagens/s andando; nada parado).
- **Reconciliação:** cada `player_moved` traz `a`, a última entrada aplicada. O cliente:
  - descarta as entradas confirmadas;
  - refaz as que faltam a partir da posição oficial;
  - corrige uma diferença pequena com suavidade em ~0,1 s;
  - corrige uma diferença maior que 1,5 casa (trapaça, teleporte, posição forçada) com um pulo na hora.
- **Outros jogadores:** são desenhados ~100 ms no passado, entre duas posições que já chegaram.
  Sem teletransporte entre avisos e sem voltar para trás. Os monstros continuam com suavização.
- **O servidor continua a autoridade:**
  - cada entrada anda no máximo `velocidade × 50 ms`;
  - quem manda entradas mais rápido que o relógio não ganha nada: o orçamento de tempo tem folga de
    250 ms e a fila tem limite de 20, com o excesso descartado e confirmado;
  - colide com as casas;
  - ignora entradas repetidas ou inválidas;
  - morto não anda.
- **Modo de teste:** no console do navegador, `localStorage.setItem('nin.debug','1')` e recarregar.
  `ninDebug.stats()` mostra as correções. `ninDebug.cheatSpeed(3)` e `ninDebug.cheatTeleport(8,0)`
  simulam um cliente adulterado, para ver o servidor corrigindo. Nada de token no `ninDebug`.

### v6: paperdoll, dano por tipo e Agilidade no ataque

- **Dano por tipo:**

  | O que bate | Atributo que escala |
  |---|---|
  | Corpo a corpo: Ataque Básico e a habilidade Taijutsu 👊 | Taijutsu |
  | Jutsus elementais: Fogo, Água | Ninjutsu |

  O tipo de cada habilidade fica em `config.skills.*.scaling`.
- **Agilidade:** além da velocidade, cada ponto corta 4% da recarga do Ataque Básico (de 600 ms até
  no mínimo 360 ms). O valor vai pronto para o cliente em `progress.derived.attackCooldownMs`.
- **Visual:**
  - `{"type":"set_appearance","appearance":{skin,hair,shirt,pants,cape}}` grava em
    `game.players.appearance` (só cores `#rrggbb`, conferidas pelo Zod e pelo banco);
  - todos recebem `player_appearance`;
  - `appearance` NULL = o cliente abre o Criador de Personagem.
- **Direção:** `player_moved` leva `d` (0 baixo, 1 esquerda, 2 direita, 3 cima).
- **Boneco** (`public/character.js`):
  - cabeça, cabelo, tronco, braços, pernas e capa em retângulos e 1 círculo, sem gradiente;
  - até ~20 operações de desenho por boneco;
  - a caminhada balança pernas e braços com `Math.sin`.
- **HUD** (só neste aparelho, `localStorage` `nin.hud.v1`):
  - tamanho e opacidade dos botões e das barras;
  - posição de cada botão, do joystick e das barras, separada para deitado e em pé;
  - arrastar só no modo **Editar layout** do ⚙️, com o combate travado.
- **Fila de gravações:** gravações da ficha (ponto, kits, visual) entram numa fila por jogador, 1 a cada 250 ms.
  Nada se perde, e acima de 5 pedidos o servidor responde `PROFILE_BUSY`.

### v5: energia, atributos, corrida, kits e missão entre jogadores

As contas ficam em `src/realtime/stats.ts` (funções puras). O cliente só mostra o que o servidor manda.

- **Energia:**
  - o chakra **não** regenera sozinho, só meditando (15/s, mais o atributo Regen Chakra);
  - a vida regenera 1/s **só** com o chakra no máximo.
- **Ataque Básico** (`{"type":"attack","targetId?"}`):
  - não gasta chakra; 12 de dano, alcance 1,6, recarga 0,6 s;
  - acerta o alvo focado (se estiver no alcance) ou o mais perto;
  - dano **físico**: usa o multiplicador de Taijutsu.
- **Jutsus** (as 7 habilidades): dano de **jutsu**, com o multiplicador de Ninjutsu.
- **Corrida** (`{"type":"run","active":true}`):
  - andar 5 e correr 8 casas/s, mais 0,5 por ponto de Agilidade;
  - o cliente só manda direção e liga/desliga: velocidade e posição são do servidor.
- **Nível:**
  - do nível N para o N+1 são N × 100 XP (nível 2 aos 100, 3 aos 300, 4 aos 600…);
  - na tela o XP "zera" a cada nível; no banco o `total_xp` continua somando;
  - o trigger `trg_players_level_from_xp` sobe o nível e dá +1 ponto por nível, para XP de monstro ou de missão;
  - o banco garante `pontos livres + gastos = nível − 1`.
- **Atributos** (`{"type":"spend_point","attribute":".."}`): máximo de 10 pontos cada.

  | Atributo | Cada ponto dá |
  |---|---|
  | Vitalidade | +10 de vida |
  | Chakra Máximo | +10 de chakra |
  | Regen Chakra | +1/s meditando |
  | Agilidade | +0,5 de velocidade |
  | Taijutsu | +5% no Ataque Básico |
  | Ninjutsu | +5% nos jutsus |
- **Kits:**
  - 2 kits de até 4 habilidades, gravados em `kit_a` / `kit_b` com `{"type":"set_loadout"}`;
  - só valem as habilidades do kit **ativo** (`NOT_EQUIPPED`);
  - a troca é `{"type":"switch_kit","kit":"B"}`, e o cliente só muda os botões quando o servidor confirma.
- **Missão entre jogadores:** valida a distância (até 3 casas) e o resto fica com o banco (rank do sensei, rank do aprendiz, uma missão aberta, quem avalia).

  | Passo | Quem | Mensagem |
  |---|---|---|
  | Criar | Chunin+ toca no outro jogador | `{"type":"create_mission","traineeId","difficulty","quantity"}` |
  | Entregar | Aprendiz toca no sensei que criou | `{"type":"deliver_mission","senseiId"}` |
  | Avaliar | Sensei | `{"type":"evaluate_mission","missionId","approved","score"}` |

  Aprovar emite o pergaminho, que o aprendiz resgata no Mestre.
- **Vila:**
  - chão de pedra num raio de 10 casas, com casas marrons (`public/village.js`, só visual);
  - os monstros ficam no anel de 11 a 20 casas.

### NPC Mestre e Sala de Missões (`src/realtime/missions.ts`)

O Mestre fica parado em (52, 49), ao lado do renascimento, na área segura. Ele é um jogador de verdade em
`game.players` (id fixo, sem login, criado pela migração `db/schema_v4_npc_missions.sql`) e é o
`sensei_id` das missões que passa. Tudo usa o ciclo do schema v2 e os mesmos comandos das rotas HTTP
(`src/missions/sql.ts`):

| Momento | O que acontece no banco |
|---|---|
| `{"type":"talk","npcId":"sensei"}` sem missão | `createMission`: DEFEAT_MONSTER, `slime` × 5, dificuldade NPC_TRAINING (50 XP + título) |
| monstro morto pelo servidor | +1 só em missão `active`, DEFEAT_MONSTER, do monstro certo, no prazo e incompleta (o 6º de 5 não conta) |
| `talk` com 5/5 | `submitMission` → `insertEvaluation` (o NPC aprova) → `insertRedemption` (XP + título pelo trigger), numa transação |
| `talk` com pergaminho aprovado de um sensei jogador | entregue também: o Mestre é a Sala de Missões |
| `{"type":"missions"}` | relê a missão atual (no máximo 1 pedido a cada 400 ms por jogador) |

- **Autoridade:** a distância até o NPC é a do servidor (até 2,5 casas). Morto não conversa. O cliente
  não tem mensagem de progresso nem de conclusão; o trigger do `submit` ainda confere a meta.
- **Toques simultâneos** (duas abas): `FOR UPDATE` na missão e o índice `ux_sensei_missions_trainee_open`
  garantem uma missão só e uma recompensa só.
- **Mensagens:**
  - `mission {mission, reason}`: `reason` é sync, assigned, progress, ready ou completed;
  - `npc_say {npcId, text}`;
  - `mission_reward {rewards, totalXp, rank, promoted}`;
  - `xp`, para atualizar a barra.
- **Sem a migração v4:** o jogo sobe igual. O Mestre aparece e responde que a Sala ainda não abriu, e o
  boot avisa no log.

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
