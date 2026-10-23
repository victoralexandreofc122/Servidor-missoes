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
psql "$DATABASE_URL" -f db/schema_v7_progressao.sql     # migração v7: níveis 60, classes, Academia, loja
psql "$DATABASE_URL" -f db/schema_v8_admin_chat.sql     # migração v8: admin, chat, atributo Chakra, Sala de Missões
psql "$DATABASE_URL" -f db/schema_v9_visual_sprites.sql # migração v9: personagem em sprites (gênero, cabelo, olhos, roupa, vila)
# opcional, só para testes: deixa a conta "Victor" como Hokage e administradora
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
então não precisa de CORS. São estes arquivos (`index.html`, `game.js`, `targeting.js`, `world.js`, `movement.js`, `prediction.js`, `character.js`, `styles.css`), sem bibliotecas,
servidos de uma lista fechada com CSP (`script-src 'self'`) e ETag.

- **Tela:** login e cadastro.
- **Mapa:** canvas que se ajusta à tela, com a câmera seguindo o jogador.
- **Mapa:** grade sobre o chão verde, desenhado em blocos guardados em memória (poucas imagens por quadro).
- **Personagem:** círculo com a inicial do nome.
- **Controles:** joystick flutuante à esquerda (nasce onde o polegar toca) e 7 habilidades à direita, cada uma com uma animação.
- **Chat:** botão 💬 no topo abre a barra de digitação; as mensagens aparecem na tela e somem em ~6 s.
  `/g texto` fala com todos os mapas, `/w Nome texto` sussurra; o 🕘 abre o histórico (últimas 100, 24 h).
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
  | Histórico do chat | H |

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
| troca de mapa | `map_changed {map,x,y,a,players,monsters,reason}` só para quem trocou (`walk` ou `respawn`) |
| falou com o lojista | `shop_open {shop,npcId}` só para quem falou (perto do balcão, dentro da loja) |
| a cada tick (50 ms) | `player_moved {playerId,x,y,d,a}` para quem está no MESMO mapa, inclusive quem andou (`d` = direção do boneco; `a` = última entrada aplicada, para a reconciliação) |
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
- **Monstros:** 10 sempre vivos na Floresta (`slime`, 60 de vida), fora das árvores e da clareira de
  entrada; a Vila é área segura. Andam 1 casa por ~1 s e batem 10 em quem estiver a até 1,2 casa, a cada 2 s.
  Num mapa sem ninguém, os monstros esperam (nada a calcular nem a enviar).
- **Derrota:** com vida 0, o jogador não anda nem usa habilidade. Depois de 5 s pode pedir `respawn` e
  volta à avenida da Vila, em frente à sede, com vida e chakra cheios (de qualquer mapa). Reconectar não cura.
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

### v13: personagem em sprites (migração `db/schema_v9_visual_sprites.sql`)

Rodar no Neon depois da v8 (pode rodar de novo). Sem ela o servidor não sobe e o log diz que falta a v9.

O boneco de retângulos virou o **personagem chibi em camadas** de `arte/personagem-chibi/` (LEIAME lá):
masculino e feminino, 4 direções (o lado direito é o lado esquerdo espelhado) e as animações parado, andar,
correr (corrida ninja) e ataque (soco e chute alternados; jutsu mostra a guarda).

- **Visual = nomes de paleta, nunca cor livre** (`src/realtime/appearance.ts`): gênero, pele (10 tons reais, do
  mais escuro ao mais claro), cabelo (espetado ou longo) e cor (16), olhos (com ou sem cílios) e cor (14), vila,
  roupa (camisa e calça nas 18 cores, ou o **conjunto da vila**), e bandana. Conjunto e bandana têm as cores da
  vila, travadas. O banco confere o formato (`game.valid_appearance`, v9).
- **Visual antigo** (5 cores, da v6): continua valendo no banco; o servidor converte para a cor da paleta mais
  parecida quando o jogador entra (e o cliente em cache que mandar o formato antigo também é aceito).
- **Cliente** (`public/sprites.js`): 2 atlas pequenos (`public/sprites/chibi_*.png`, mapas de índice) + dados
  (`public/spriteData.js`, gerado). Cada célula é recolorida uma vez por visual (cache), desenhada plano a plano;
  escala inteira em pixels do aparelho a partir de 2x (pixel art sem borrar). Até os atlas chegarem, o boneco antigo.
- **Criador** novo: botões e amostras de cor no lugar dos seletores de cor livre.
- Regerar a arte: `python3 arte/personagem-chibi/gerador/export.py` e `.../export_game.py` (precisa de numpy e Pillow).

### v12: polimento, Modo Administrador e Academia nova (migração `db/schema_v8_admin_chat.sql`)

Rodar no Neon depois da v7 (pode rodar de novo). Sem ela o servidor não sobe e o log diz qual migração falta.

**1. Modo Administrador (God Mode)** — `players.is_admin` (falso para todos; a migração e o
`db/promote_victor.sql` ligam só a conta `Victor`). Comandos no chat, que **nunca** viram mensagem:

| Comando | O que faz |
|---|---|
| `/admin level <nome> <nível>` | nível 1 a 60 (XP no começo do nível; pontos recalculados, atributos zerados se não couberem) |
| `/admin spawn <slime\|dummy\|sparring> <qtd>` | 1 a 20 monstros em volta do admin |
| `/admin givejutsu <nome> <jutsu> <nível>` | ensina o jutsu ou sobe o uso até o nível 1 a 4 (o uso nunca desce) |
| `/admin giveitem <nome> <item> <qtd>` | 1 a 999 itens no inventário |
| `/admin resetstats <nome>` | devolve os pontos de atributo, sem custo |

- **Restrito:** o servidor só aceita de quem entrou com `is_admin`; cada função do banco (`game.admin_*`)
  confere `is_admin` de novo. Quem não é admin recebe só "Comando desconhecido" (e o servidor registra no log).
- **Auditoria:** `game.admin_audit_log` (só INSERT: editar ou apagar é recusado pelo banco), com
  comando, alvo, argumentos e se deu certo, inclusive as recusas.
- **Sem efeitos colaterais:** nada de admin dispara anúncio, XP de abate, rank, título ou missão. O nível
  passa pela flag local `game.admin_action` (só dentro da transação); os monstros invocados não dão XP,
  ryō, pergaminho, progresso de missão nem de tutorial, e não renascem.
- Sem `is_admin` (padrão), o jogo e os testes se comportam exatamente como antes.

**2. Atributos: "Chakra" único, sem teto e com rendimento decrescente** (`src/realtime/stats.ts`)

- Chakra Máximo + Regen Chakra viraram **Chakra** (`attr_chakra`; a migração soma os pontos das duas
  colunas). Cada ponto dá chakra máximo **e** meditação mais rápida.
- **Sem o teto de 10 pontos.** O ponto investido quando já há `n` pontos vale `base / (1 + n × 0,05)`:
  Vitalidade +10 no 1º ponto, +6,9 no 10º, +2,9 no 50º; nível 60 com tudo em Vitalidade = 379 de vida (e não 690).
  A velocidade tem teto de +5 casas/s (o movimento com predição conta com passos curtos).
- **O servidor calcula tudo:** a ficha recebe o resultado (`derived`) e quanto o próximo ponto rende (`nextGain`).
- **Redefinir Atributos** (📊, dois toques): 500 ryō, devolve todos os pontos (`game.reset_attributes`;
  custo decidido pelo servidor, saldo conferido pelo banco).

**3. Equipamento no boneco** (`public/character.js`, `gear` em cada jogador, `player_gear` para todos):
Kunai, Kunai de Treino e **Espada Curta** na mão (só com a outra mão livre); **Espada Longa** e Shuriken
Gigante nas costas; pergaminho de jutsu nas costas (🎒 → "Nas costas"). As costas ficam atrás do tronco
e à frente da capa (de costas, por cima da capa). Espada Curta (600 ryō) e Espada Longa (2000) na Armaria.

**4. Chat com histórico** (`src/realtime/chatLog.ts`, `game.chat_logs`, retenção de 24 h):
fala local (o mapa), `/g texto` (global) e `/w Nome texto` (sussurro, só os dois). O 🕘 mostra as últimas
100 do jogador (global, sussurros dele e a fala do mapa atual), com abas; ao abrir o jogo elas já chegam.

**5. Sala de Missões em cartões:** falar com o Mestre abre um modal com 3 cartões (título, descrição,
recompensa do catálogo do banco e dificuldade: Treino Leve 3 slimes / 30 XP, Treino do Mestre 5 / 50 XP +
título, Treino Pesado 10 / 150 XP). O botão **Entregar** fica verde com a missão completa; senão, cinza com
o que falta ("Faltam 3 monstros"). Mensagens: `accept_mission`, `deliver_npc_mission`, `mission_board`.

**6. Academia em 4 etapas, linear** (salas fechadas: o servidor leva o jogador de uma para a outra):

| Etapa | Sala | O que fazer | Interface |
|---|---|---|---|
| 1 | Taijutsu | destruir 3 bonecos só com o Ataque Básico | jutsus e 🧘 ocultos (o servidor recusa jutsu: `TUTORIAL_LOCKED`) |
| 2 | Controle | um campo drena o chakra (6/s): meditar até encher | 🧘 aparece |
| 3 | Jutsus | Teleporte Curto **por cima do vão** + Substituição contra a armadilha | jutsus aparecem |
| 4 | Armas | ganha a Kunai de Treino: 🎒 (brilha), equipar e acertar o boneco com o Ataque Básico | |

Concluiu: +100 ryō, +50 XP e o servidor leva para a **Praça da Vila** (40, 66). Ninguém pula etapa nem sai
antes: não há porta entre as salas, a saída só abre no passo 4 e morrer renasce na sala da etapa.

### v11: progressão (níveis até 60, ranks, classes, Academia, Extração e armas)

Migração `db/schema_v7_progressao.sql` (rodar no Neon, depois da v6). As regras ficam **no banco**
(funções e triggers); o servidor só chama, e o cliente só pede.

- **Níveis até 60** com mais XP: do nível N para o N+1 são `100·N + 25·N·(N-1)`
  (nível 11 = 13.750 XP · 40 = 572.000 · 60 = 1.888.000). `levelStart` em `stats.ts` = `game.level_start` (o teste compara os 60).
- **Ranks:** o XP não promove mais ninguém.
  | Nível | Rank | Como |
  |---|---|---|
  | 1 a 10 | Academia | tutorial (4 salas) e caça |
  | 11 | Genin | **Missão de Genin** com o Diretor da Academia: escolhe a classe Primária e ganha 1 pergaminho dela |
  | 40 | Chunin | **Exame Chunin**: um Chunin+ cria a missão "Exame Chunin" (Criar Missão), o aprendiz cumpre e o sensei aprova; o trigger promove. Depois, classe Secundária com o Diretor |
  | 60 | candidato a Hokage | candidatura registrada com o Diretor (eleição numa versão futura) |
- **9 classes** (Cura, Sombra, Ilusão, Pedra, Fogo, Água, Taijutsu, Armas, Relâmpago), 4 jutsus cada
  (tier 1 a 4) + 2 da Academia = **38 jutsus** (`src/realtime/jutsus.ts` = `game.jutsus`). Quem já
  jogava mantém os 7 de antes; jutsu novo só da própria classe, pela Extração.
- **Jutsus da Academia, nível pelo uso** (`game.player_jutsus.usage_count`, contado SÓ pelo servidor
  a cada uso aceito; `level` é coluna gerada; o uso só sobe):
  | | Nv 1 | Nv 2 (100 usos) | Nv 3 (500) | Nv 4 (2000) |
  |---|---|---|---|---|
  | Teleporte Curto | 3 casas | 4 | 5 | 6 |
  | Substituição (5 s armada; anula o próximo golpe, deixa um tronco e aparece atrás do atacante) | recarga 30 s | 25 s | 20 s | 15 s e atrás do alvo **focado** |
  O Teleporte vai na direção do joystick e para antes da primeira parede (nunca atravessa). Jutsus de classe: +10% de efeito por nível.
- **Tutorial da Academia** (`academy_interior`, 4 salas de 16x16): conta nova nasce na Sala 1. Cada
  porta só abre quando o **servidor** vê a sala concluída (`players.tutorial_step`, a mesma trava na
  predição do cliente). Sala 1: 3 bonecos com o Ataque Básico · Sala 2: meditar até o chakra encher ·
  Sala 3: Teleporte + Substituição (boneco que bate) · Sala 4: equipar a Kunai de Treino. A saída só
  abre no passo 4 (+100 ryō, +50 XP). O prédio da Academia na Vila leva à Sala 4 (Diretor).
- **Extração** (Casa dos Pergaminhos): nível 1/2/3/4 gasta 1/2/4/8 pergaminhos da classe com 80/60/40/20%
  de chance de aprender um jutsu do tier. O sorteio é do servidor (`crypto`), a função `game.extract_jutsu`
  confere classe, nível e pergaminhos e gasta mesmo na falha. Pergaminhos: compra (150 ryō) ou drop de monstro (4%, Genin+).
- **Inventário e ryō:** monstros dão 5 a 15 ryō; Armaria vende Kunai (14 de dano, 300) e Shuriken Gigante
  (22, 1200). A arma equipada soma ao Ataque Básico; o novo atributo **Armas** dá +5% por ponto (Kunai de Treino: +10).

Mensagens novas: cliente `choose_class`, `extract`, `buy`, `equip`, `hokage_apply` e `cast` com `dir`
(Teleporte); servidor `tutorial`, `inventory`, `classes`, `jutsus`, `jutsu_level`, `class_choice`,
`extract_result`, `teleport`, `substitution`.

### v10: lojas com interior, fade entre mapas e Floresta escura

- **Coordenadas da passagem:**
  - portão da Vila (y 79/80) → Floresta em (x, 0); no centro do portão, (40, 0);
  - borda de cima da Floresta → Vila em (x, 75), dentro da praça;
  - `Exit.arrive` em `maps.ts` diz a que profundidade se chega.
- **Fade:** ao trocar de mapa, a tela escurece em 0,14 s, troca o mapa no escuro e clareia em 0,26 s.
  A predição e o servidor trocam na hora; só o desenho espera os 0,14 s (medido: troca ~0,15 s
  depois de atravessar, antes de o servidor confirmar).
- **Lojas com interior** (`interior_weapons`, `interior_clothes`, `interior_scrolls`, 15x15):
  - **Portas:** `Door` em `maps.ts`, com a regra `useDoor` em `movement.ts`/`movement.js`, a mesma no
    cliente e no servidor.
    - Na Vila, a porta é a faixa de 3 casas logo abaixo da fachada de cada loja (o capacho):
      empurrando para cima, entra.
    - Na sala, o vão da porta tem 3 casas e a saída é o capacho inteiro (x 5,5 a 9,5): empurrando
      para baixo ali, até encostado na parede ao lado do vão, volta para a frente da loja.
    - As chegadas ficam fora da porta do outro lado, então ninguém entra e sai sozinho.
  - **Sala:**
    - assoalho, paredes e balcão no meio, com divisórias: ninguém passa para trás;
    - o **lojista** fica atrás do balcão, e dá para falar com ele da frente do balcão (alcance 3,3 casas);
    - cada loja tem a sua decoração: espadas, lanças e escudos na Armaria; manequins e roupas
      dobradas na Alfaiataria; estantes e mesa de pergaminhos na Casa dos Pergaminhos.
  - **Lojistas** (NPCs `shop_weapons`, `shop_clothes`, `shop_scrolls`) só existem no mapa da loja:
    - o cliente só desenha NPCs do mapa atual;
    - o servidor recusa `talk` de outro mapa (`NPC_TOO_FAR`).
  - **Abrir a loja:** perto do lojista, o botão vira 🛒. O cliente pede `talk` e o servidor confere
    mapa e distância e responde `{"type":"shop_open","shop":"weapons","npcId":"shop_weapons"}`. O painel
    é um placeholder (vitrine com 3 itens "Em breve") e fecha ao se afastar do balcão, ao trocar de
    mapa, no ✕ ou com Esc.
  - **Ninguém fica preso:**
    - o teste confere que, de qualquer ponto alcançável da sala, se chega à porta de saída;
    - no E2E, quatro cantos diferentes saem;
    - renascer leva sempre à Vila.
  - **Dentro da loja não há combate:** a sala inteira é zona segura.

### v9: a Vila 80x80 (planta baixa da arte conceitual)

O `map_1` foi refeito a partir da arte de referência (`village()` em `src/realtime/maps.ts`):

- **Muralha:** perímetro sólido de 2 casas de espessura. A única abertura é o **portão principal** no
  sul, centralizado (x 35 a 45, y 78 a 80), sem colisão nenhuma: os pilares vermelhos ficam fora do vão.
  O portão leva à Floresta, que agora tem a entrada no **norte** (x 45 a 55, a mesma faixa + 10).
- **Prédios (colisão no servidor):**
  - sede da vila no topo, no eixo da avenida;
  - hospital à esquerda e academia à direita;
  - três lojas no meio (armas, roupas, pergaminhos), com canais na frente;
  - casas e cabanas nos cantos;
  - um paredão de rocha no topo (montanha).
- **Ruas e becos:** de 2 a 4 casas de largura entre as colisões. O teste mede: do renascimento, um
  corpo de 2 casas chega ao portão, à praça, à frente de cada prédio, ao campo de treino, ao beco
  atrás da sede e ao outro lado do rio. Os becos de 1 casa (atrás das cabanas, ao lado da muralha)
  servem de esconderijo.
- **Rio** à esquerda com duas pontes de madeira; **campo de treino** de areia no canto inferior
  direito, com um boneco de madeira (colisão).
- **Praça social (zona segura)** logo acima do portão (x 28 a 52, y 55 a 78):
  - `safeZones` no layout; nenhuma habilidade nem ataque (nem cura) sai ali;
  - o servidor responde `cast_failed`/`attack_failed` com `SAFE_ZONE`, sem cobrar chakra;
  - monstro não bate em quem está na zona;
  - o cliente apaga os botões e o topo mostra "zona segura";
  - bancos, vasos e a rosa dos ventos são só desenho.
- **Desenho** (`public/mapArt.js` + `public/game.js`):
  - pedra cinza-clara nas ruas e na praça;
  - telhados vermelho-escuros e fachadas bege (madeira nas cabanas); a sede em vermelho vivo, com 2 andares;
  - montanha cinza-escura com manchas e rachaduras;
  - rio azul com pontes marrons e areia no campo de treino;
  - o telhado do portão é desenhado por cima de quem passa.
- **Desempenho:**
  - tudo é pré-desenhado em blocos de 16x16 casas (chunks, cerca de 3 ms cada); por quadro só se copiam os blocos visíveis;
  - no máximo 2 blocos novos por quadro: entrar no mapa não trava;
  - com folga, os blocos em volta da tela são montados antes de o jogador chegar lá;
  - no teste andando pela Vila, quadro p95 de ~21 ms e o pior de ~25 ms no Chromium sem GPU do servidor de testes.
- O renascimento fica na avenida, em frente à sede (40, 34), com o Mestre ao lado. Fica fora da praça
  porque lá não se luta.

### v8: mapas (Vila e Floresta) e transição pelas bordas

O mundo deixou de ser um mapa só de 100x100. Agora são salas, como no Nin Online
(`src/realtime/maps.ts`):

| Mapa | Tamanho | Chão e paredes | Monstros | Saída |
|---|---|---|---|---|
| `map_1` Vila | 80 x 80 (v9) | muralha de pedra; sede, hospital, academia, lojas, rio, praça segura e campo de treino | nenhum | portão sul (x 35 a 45) |
| `map_2` Floresta | 100 x 100 | grama escura (v10); mata fechada nas bordas e árvores espalhadas (obstáculos) | 10 slimes | entrada norte (x 35 a 45) |

- **Transição** (desde a v10): quem chega na borda sul da Vila (y = 80), dentro do portão (x 35 a 45)
  e empurrando para o sul, vai para a Floresta em (x, 0). Pela borda norte da Floresta volta para a
  Vila em (x, 75), dentro da praça. (Na v8 o portão ficava a leste; na v9 a Floresta usava x + 10.)
  - Chegando na Floresta ainda indo para o sul, não volta (sem pingue-pongue).
  - Morreu na Floresta: renasce na Vila.
- **O servidor valida a passagem:**
  - a regra é `crossExit`/`moveStep` em `movement.ts`, com a mesma cópia no cliente;
  - só passa quem está de fato na borda (posição do servidor, depois da colisão) e empurrando para fora;
  - só dentro do trecho do portão, e com a chegada livre;
  - como as casas fecham a borda, ninguém atravessa parede para mudar de mapa: nem forçando a posição
    em x = 50 fora do portão.
- **Envio só para o mesmo mapa:** posição, monstros, combate, chat (fala local) e entradas/saídas vão só
  para quem está no mapa.
  - Trocou de mapa: o dono recebe `map_changed` com os jogadores e monstros de lá; quem ficou recebe
    `player_left`; quem está no mapa novo recebe `player_joined`.
  - `announce` (promoção) vai para todos.
  - O `welcome` traz o mapa atual e o layout de todos os mapas (cerca de 7 KB: 47 casas e 132 árvores).
- **No cliente** (`public/world.js`):
  - o chão e as paredes vêm do layout do servidor: pedra e casas na Vila, grama e copas de árvore na
    Floresta, mata fechada fora do mundo;
  - além de cada saída, o cliente desenha o pedaço do mapa vizinho no lugar certo: no portão já se vê a
    trilha da Floresta e, depois de atravessar, a Vila continua visível atrás;
  - a predição atravessa na hora, sem esperar o servidor; o boneco não para nem salta;
  - a tela troca de mapa (somem os jogadores, monstros e efeitos do mapa antigo), escurece de leve por
    0,35 s e mostra o nome do mapa;
  - quando o servidor confirma, chegam os que estão lá.
- **Banco:** nada muda (a posição e o mapa não são gravados; conectar sempre começa na Vila).

### v7: movimento com predição no cliente e reconciliação

Com ~200 ms de ida e volta, esperar o servidor para andar dá atraso no joystick. Agora:

- **Predição (`public/prediction.js`):** a cada tick de 50 ms com o joystick inclinado, o cliente
  cria uma entrada numerada `{seq, dx, dy}` e anda na hora. Ele usa a **mesma função** do servidor
  (`public/movement.js` = `src/realtime/movement.ts`, com o mesmo arredondamento e as mesmas paredes,
  as casas e as árvores do mapa). Um teste compara as duas em 10 mil passos aleatórios.
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
- **Vila:** é o mapa `map_1` (ver a seção v8, mapas).

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
