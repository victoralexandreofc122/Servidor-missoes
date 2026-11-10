# servidor-missoes

Servidor e cliente web do **Herança do Fogo** (antes Vontade do Fogo), um MMORPG ninja 2D em pixel art para o celular.

API do ciclo de missões de sensei (Fastify + TypeScript + `pg`, SQL puro).
O banco (`db/schema_ranks_missoes_sensei.sql`, v2) valida as regras de negócio;
o servidor valida **quem está chamando** e traduz os erros para português.

**Deploy pelo celular (Neon + GitHub + Render): veja [DEPLOY.md](DEPLOY.md).**

**Design do jogo:** [docs/design-do-jogo.md](docs/design-do-jogo.md) (visão, sistemas, progressão, economia, PvP,
arte, UI e roadmap) · **História:** [docs/historia/arco-1.md](docs/historia/arco-1.md) (Arco 1).

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
psql "$DATABASE_URL" -f db/schema_v10_design.sql        # migração v10: proteção contra azar na Extração (opcional)
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

Mensagens de combate (o servidor decide tudo; o cliente só pede `cast`, `attack` e `respawn`):
`stats` (vida/chakra do dono), `player_hp`, `cast` / `cast_failed`, `projectile` / `impact` (Fogo e Kunais voando),
`dash` (avanço do Taijutsu), `hit` (número flutuante), `monsters_moved`, `monster_spawned`, `monster_status`,
`player_status` (PvP), `monster_died`, `player_died`, `player_respawned`, `xp`, `announce`.

### Combate PvE (valores em `src/realtime/config.ts` → `combat`)

Cada golpe tem uma **hitbox geométrica** (`src/realtime/combat.ts`: `isInArc`, `isInCone`, `isInCircle`,
`lineIntersects`, `firstOnLine`). O servidor calcula quem foi atingido com as posições dele; o cliente só desenha.

| Habilidade | Chakra | Recarga | Hitbox | Efeito |
|---|---|---|---|---|
| Ataque Básico | 0 | 0,6 s (x a arma) | arco na direção do alvo: 90° e 1,6 casa sem arma (cada arma tem o seu, veja a v15) | 12 de dano + a arma equipada, em todos no arco |
| Ataque Básico com a Shuriken Gigante | 0 | 3 s (5x) | arremesso: projétil de 6 casas (9 casas/s) que atravessa todos, linha de 0,8 casa | (12 + 22) x 2,5 = 85 em cada um |
| Fogo (`fire`) | 20 | 1,5 s | projétil reto na direção do inimigo (9 casas, 14 casas/s) + círculo de 2 casas onde ele bate | 25 de dano na explosão |
| Água (`water`) | 15 | 1 s | cone de 90° e 4 casas, para onde o jogador olha (ou no alvo focado) | 20 de dano e empurra 1,5 casa |
| Taijutsu (`taijutsu`) | 5 | 0,5 s | avanço até o mais perto (alcance 2,5) + círculo de 1 casa na frente | 35 de dano |
| Ilusão (`illusion`) | 30 | 4 s | círculo de 3 casas em volta do jogador | atordoa todos por 3 s |
| Sombra (`shadow`) | 25 | 6 s | linha instantânea de 4 casas: o primeiro que ela encosta | prende por 5 s (não anda, mas ataca) |
| Relâmpago (`lightning`) | 20 | 2 s | linha instantânea de 4,5 casas: o primeiro que ela encosta | 30 de dano e choque de 0,4 s |
| Armas (`weapons`) | 10 | 1,2 s | 3 kunais (projéteis) lado a lado, em trilhas paralelas a 0,7 casa, 4 casas | 18 + arma em cada alvo (no máximo 1 kunai por alvo) |
| Pedra (`stone`) | 15 | 6 s | em si mesmo | escudo: o próximo dano cai pela metade |
| Cura (`heal`) | 30 | 4 s | no aliado focado (até 3 casas), em si mesmo ou no aliado mais ferido perto | +30 de vida |

- **Mira:** com alvo focado, Fogo, Água, Sombra, Relâmpago e Armas mandam `targetId` e o servidor vira o
  jogador para ele, mesmo longe (o jutsu sai na direção dele e pode não chegar). Sem foco, as formas estreitas
  (linha, avanço, projétil) miram o mais perto no alcance; a Água vai para onde o jogador olha.
- **Sem alvo, o golpe sai assim mesmo (v18):** Ataque Básico, Taijutsu, Ilusão, Sombra, Relâmpago e Kunais não
  dependem de ter alguém perto. Saem para a frente, gastam chakra e recarga e podem errar: no PvP, acertar é
  questão de apertar na hora certa. Só a Cura (ninguém ferido), a Pedra e a Substituição já ativas e o Teleporte
  sem espaço falham sem gastar.
- **Paredes:** linhas e projéteis param na parede (árvore, casa): atrás dela, o golpe erra. O avanço do
  Taijutsu e o empurrão da Água também param antes de vão no chão.
- **PvP:** só na **arena de cada vila** (v15), entre os ninjas dela. O PvP aberto (`combat.pvp`, para a fronteira
  do Arco 2) continua desligado e nunca vale em mapa de vila. Atordoado não anda nem ataca (`STUNNED`); preso não
  anda. Fora da arena, todo jogador é aliado e a Cura pega quem estiver perto.

- **Jogador:** 100 de vida (regenera 1/s) e 100 de chakra (regenera 5/s). Sem alvo, com vida cheia ou com
  escudo ativo, a habilidade falha sem gastar chakra.
- **Monstros:** 10 vivos na Floresta (`slime`, 60 de vida), mais 3 por jogador lá (até 40), fora das árvores e da
  clareira de entrada; a Vila é área segura. Andam 1 casa por ~1 s e batem 10 em quem estiver a até 1,2 casa, a cada 2 s.
  Num mapa sem ninguém, os monstros esperam (nada a calcular nem a enviar).
- **Derrota:** com vida 0, o jogador não anda nem usa habilidade. Depois de 5 s pode pedir `respawn` e
  volta à avenida da Vila, em frente à sede, com vida e chakra cheios (de qualquer mapa). Reconectar não cura.
- **Alcance:** com alvo focado longe demais (Fogo 5, Água 4, Sombra 4, Relâmpago 4,5, Armas 4), o servidor
  responde `OUT_OF_RANGE` sem gastar chakra.
- **Efeitos visuais:** folhas de sprite em `public/assets/vfx/` (4 a 8 quadros, pixel art no estilo do boneco),
  tocadas pelo `VFXManager` (`public/vfx.js`) na posição que o servidor mandou. As armas equipadas são
  desenhadas no boneco (`public/weapons.js`, artes em `public/assets/weapons/`) na ordem do paperdoll.
  Tudo é gerado por `arte/armas-vfx/` (veja o LEIAME de lá).
- **Arma equipada:** só uma de ataque por vez (kunai, espada curta, espada longa ou Shuriken Gigante); o pergaminho
  é à parte. Com arma, o Ataque Básico é um golpe com ela (animação `golpe`): a kunai já fica na mão; a espada longa
  sai das costas para a mão no golpe e volta depois.
- **Shuriken Gigante (arremesso):** fica enorme nas costas e troca o Ataque Básico por um lançamento dela
  (`ItemDef.throw` em `items.ts`): alcance maior, atravessa todos no caminho com uma hitbox mais grossa, dano 2,5x,
  mas recarga 5x mais lenta (a Agilidade ainda reduz). O `attack` traz `throw` e a recarga (`cd`); o voo é um
  `projectile` com `weapon`.
- **Meditação** (`{"type":"meditate","active":true}`): parado, chakra 3x mais rápido (15/s). Tentar andar,
  tentar usar habilidade ou apanhar de monstro encerra na hora (`meditation` com `reason`). Morto não medita.
- **XP:** cada monstro dá 20 de XP para quem deu o último golpe e para quem tirou pelo menos 20% da vida dele (v15). O XP é gravado em `game.players.total_xp`
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

## Continuar em outra janela (estado em 8/11/2026)

- **Relatório completo** (versão final, progresso, pendências e como continuar): `docs/relatorio-final-e-progresso-2026-11.md`
  e o PDF `docs/relatorio-final-e-progresso-2026-11.pdf`.
- **Versão publicada:** v29 (`main`). **Pronto para publicar (aguarda o Victor), no branch:** correção do rankeado,
  Jutsus v2 entrega 2 (Fogo) com a v16, Fase 1 dos nomes (Herança do Fogo) com a v17, as outras 8 classes com a v18,
  os clãs com a v19 e a Fase 0 (Extração nova e maestria por jutsu) com a v20.
  Ordem no Neon: v16, v17, v18, v19, v20; depois o código na `main` (DEPLOY.md, passos 31 a 35).
- **Antes de qualquer commit:** `npm run verify` (639 testes hoje). Migrações: sem `DO $$`, em `BEGIN; ... COMMIT;`.
- **Visão do endgame (documento canônico):** `docs/endgame-visao.md`.

## Roadmap (documento canônico, `docs/endgame-visao.md` seção 13)

- **Fase 0 (feita no branch):** Jutsus v2 entrega 2 + conjuração no Fogo + v16; Extração do design final e maestria por
  jutsu (v20).
- **Fase 1 (antes de monetizar):** renomeação. Já feito: Herança do Fogo na UI e nos docs, as 4 aldeias e o Vale dos
  Guardiões (v17); Os Cinzas, Arena das Quatro Heranças e 38 jutsus renomeados (v21). Os clãs já são Rubro e Umbra e o Soco Tsunade já é
  Punho Sísmico. A ordem Nuvem/Areia foi corrigida na v22 (`docs/fase1-renomeacao.md`).
- **Fase 2 (endgame sobre a base):** Torneio da Temporada, ANBU, torneios de campeão, Terra Sem Lei e Caçada, guerras
  20v20 e final, balanceamento populacional, infiltração, mentoria.
- **Fase 2.5: 74 jutsus novos** para fechar 4 jutsus por classe por tier (4/4/4/4 nas 10 classes = 160). É a maior frente
  de conteúdo; **não começar sem o Victor pedir**. Hoje a distribuição varia (a Cura tem 5 no tier 1; o Fogo, 4/4/2/1).
- **Fase 3 (conteúdo):** 2ª classe no nível 40, mapas temáticos, social com mentoria, Arco 1, clãs novos (um por
  aldeia), mapa-múndi contínuo.

### v43: Fase 2, passo 4: a Fase Final do Torneio da Temporada (migração v28, `db/schema_v28_fase_final.sql`)

- **Trava de vila:** do começo do Torneio até o encerramento ninguém troca de uma vila para outra (banco e servidor).
- **Grupos:** `/admin torneio fechar` fecha os pontos e põe os finalistas (2x as vagas) em grupos de até 5, com os cabeças
  de chave espalhados em cobrinha. Todos contra todos, melhor de 3 rodadas; passam os 2 primeiros.
- **Eliminatória:** `/admin torneio chaves` fecha os grupos (jogo que faltou = derrota dos dois) e monta a chave (16, 8, 4,
  2), com folga para os melhores quando a conta não fecha e sem repetir o colega de grupo na 1ª rodada.
- **Jogos:** fila da Fase Final na Arena: a luta sai quando dois finalistas com jogo pendente entre si estão na fila; têm a
  vez sobre o rankeado. `/admin torneio wo <nome>` dá W.O. a quem não apareceu.
- **Encerramento:** `/admin torneio encerrar` grava os Jounin da era (quem entrou na chave e, sobrando vaga, os melhores
  terceiros), dá a patente, paga 200 ryō e o título "Serei o próximo Jounin" a quem ficou fora da Fase Final e fecha o Torneio.
- **Tela:** o botão da Arena vira "Fase Final: Grupos", "Fase Final: Chaves" e "Jounin da Era"; o painel mostra os seus
  jogos pendentes, o seu grupo e os outros, a chave e, no fim, o campeão e os Jounin da era.
- Regras em `src/realtime/tournament.ts`. Arenas simultâneas e calendário automático ficam para depois (hoje é uma arena e
  as etapas avançam por comando de admin).

### v42: Fase 2, passo 3: a tela do Torneio da Temporada (sem migração)

- Na Arena, botão **Torneio da Temporada** (fechado: "🔒 Torneio Fechado"). O painel mostra "Partidas jogadas: X/15", "Seus
  Pontos", o top 10 da vila, a linha de corte (2x as vagas) e quanto falta para entrar na zona de classificação, e o botão
  "Entrar na Fila do Torneio" (desligado, com o motivo, para quem não pode disputar).
- Fim da partida: "+30 Pontos de Torneio" ou "-10 Pontos de Torneio", com o ryō. O chat chama a partida de Torneio da Temporada.
- `/admin torneio abrir` avisa todos no chat e na tela.
- Servidor: mensagem `jounin_board` (o placar nunca manda o id dos outros jogadores).
- A decidir na v28: o que acontece com os pontos de quem troca de vila no meio do Torneio (hoje ficam na vila antiga).

### v41: Fase 2, passo 2: a fila do Torneio da Temporada no servidor (sem migração)

- Modo novo do duelo (`mode: 'jounin'`) na Arena, só na janela da fase de pontos. Fila própria, e a partida só une ninjas
  **da mesma vila** (`takeVillageMatch` em `duel.ts`). A arena é uma só: entre o rankeado e o Torneio, luta primeiro quem
  espera há mais tempo. Uma fila por vez.
- Quem entra: nível 40+, com vila, sem patente de Jounin, ANBU ou Kage, e que nunca foi Jounin (o banco confere).
- Fim da partida: `game.jounin_result` grava (+30, -10 com piso 0; ryō +100 e +30); o MMR do rankeado não muda.
- Admin: `/admin torneio abrir [dias]` (padrão 10), `/admin torneio fechar`, `/admin torneio` (status e vagas por vila).
- Pendente para a v28 (com a fase final): a conferência de "mesma vila" também dentro do banco. Hoje ela é do servidor.

### v40: Fase 2, entrega 1: eras e a fase de pontos do Torneio da Temporada (migração v27, `db/schema_v27_temporadas.sql`)

- `game.seasons` (a era de 60 dias), vagas de Jounin por vila (1 a cada 50 ativos, mínimo 10, máximo 60), pontos do Torneio
  (+30 vitória, -10 derrota, nunca abaixo de 0; ryō +100 e +30), histórico de partidas, classificação por vila (15 partidas
  mínimas; finalistas = 2x as vagas) e o registro permanente `game.jounin_era`.
- Modo separado do rankeado: não mexe no MMR. **Ainda não ligado ao jogo**: é a base de banco e de servidor
  (`src/realtime/seasonStore.ts`). Plano completo da Fase 2 em `docs/fase2-plano.md`.

### v39: faixa do Andarilho nova (sem migração)

- A faixa cobre o braço esquerdo do ombro ao cotovelo, na cor da capa da aldeia (verde, azul, vinho ou areia), com um nó
  do lado de fora e duas pontas soltas que balançam com o passo e a corrida (a mesma física das pontas da bandana).
- Prancha: `node arte/personagem-rig/prancha.mjs saida.png faixa` (andando, correndo e nas 4 aldeias).
### v38: Pergaminho do Mestre, nota do Pré-Alpha e Feedback no jogo (migração v26, `db/schema_v26_tutorial_feedback.sql`)

- **Pergaminho do Mestre:** tutorial paginado em estilo pergaminho (tela escurecida, "Página anterior", "Próxima página" e
  "Fechar (já entendi)"; não fecha sozinho). Abre na primeira chegada, logo depois do Criador e da nota do Pré-Alpha.
- **Capítulos:** Boas-vindas (sempre), Missão de Genin (nível 10), Rito do Despertar (11), Pergaminhos e Extração (primeiro
  pergaminho), Lutar contra ninjas (primeira luta PvP) e Classe Secundária (40). O servidor decide quando abrem; capítulo
  novo faz o ☰ e o botão Manual piscarem, sem pop-up.
- **Manual do Ninja** (Menu ☰ → Manual): relê os capítulos abertos; os fechados mostram quando abrem.
- **Prêmio:** fechar um capítulo pela primeira vez dá 50 ryō e 100 XP, uma vez só (gravado em `game.player_tutorial`).
- **Nota do Pré-Alpha:** a versão (`GAME_VERSION` em `src/realtime/manual.ts`), o que está em teste, como testar e onde
  mandar bugs.
- **Feedback** (Menu ☰ → Feedback): categoria (Bug, Sugestão, Balanceamento, Outro) e texto até 1.500 letras; o servidor
  junta nome, nível, patente, classes, linhagem, mapa, posição e versão, e o cliente a tela aberta, o aparelho e o tamanho
  da tela. Um a cada 20 s por jogador. Grava em `game.feedback`.
- **Painel do Admin, aba Feedback:** lista os relatos (novos primeiro) com os dados capturados e "Marcar como lido/resolvido".
- Correção: os avisos do Rito apontavam "☰ → Aparência", que não existe; agora "☰ → Config. → Mudar visual do personagem".

**Teste Alpha:** o checklist para os jogadores está em [`docs/checklist-teste-alpha.md`](docs/checklist-teste-alpha.md).

### v37: Rito do Despertar à prova de travar e o visual das linhagens no jogo (sem migração)

- Teste de ponta a ponta do Rito com o banco de verdade (`test/rito.integration.test.ts`): marcar, Diretor, 10 Lodos
  Escuros em combate, sair e voltar no meio, despertar; quem passou do 11 sem fazer o Rito; Caverna do Lodo conta.
- Correção (podia travar o jogador): as gravações do Rito e da linhagem não são mais descartadas quando a fila de
  gravação do jogador está cheia (combate intenso). O progresso do Rito só se apaga depois que o despertar foi gravado;
  se o banco falhar, o jogador continua com o Rito completo e só fala com o Diretor de novo.
- Correção: o olho do Rubro, a névoa do Umbra e a faixa do Andarilho só apareciam depois de alguém subir de nível; agora
  aparecem ao entrar no jogo e no mapa.
- Correção: no desligamento (cada deploy no Render), o servidor espera as gravações pendentes de cada jogador (até 5 s)
  antes de sair; antes, o que estava na fila no último segundo podia se perder.
- Correção: refazer a Missão de Genin com outra classe (admin) deixava os jutsus da classe antiga no kit, escondidos da
  aba Kits e ocupando os 4 espaços. Agora saem do kit na hora (continuam aprendidos no perfil) e o kit limpo é gravado; a
  aba Kits também mostra, com cadeado, qualquer jutsu fora da classe que ainda esteja no kit, para poder tirar.
- Mira em todas as classes: segurar e arrastar o botão agora vale pela FORMA do jutsu, não só no Fogo, Sombra, Raio,
  Armas e Vento. Linha, projétil, leque, avanço, salto e muro mostram o caminho; cone mostra o leque; zona e aviso
  lançados mostram o círculo onde caem (no primeiro inimigo da direção ou no fim do alcance). Escudo, buff, cura, zona
  em volta de si e jutsu travado no alvo continuam de toque (não têm direção). `aimShapeOf` em `protocol.ts`.
- A névoa do Umbra ficou mais densa (no chão do jogo a de antes sumia); a faixa do Andarilho ficou clara e mais larga.

### v36: Fase 1.5, maestria em todos os jutsus (sem migração)

- Os 98 jutsus de classe e de clã agora evoluem pela maestria do design final (antes só os 11 do Fogo). Cada jutsu ganha no
  máximo 2 coisas, as que fazem sentido para ele (tabela `MASTERY` em `src/realtime/jutsus.ts`, com o motivo de cada um):
  dano, efeito (duração do controle ou status), cura, alcance, recarga e, novos, **duração** (buff, zona de suporte,
  invocação) e **proteção** (escudo, muro, vida da invocação). No nível 4: +30% (dano, efeito, cura, duração, proteção),
  +15% de alcance, -15% de recarga. O teto de controle do PvP e o teto de 25% do escudo continuam valendo.
- A cura da maestria vale para toda cura (zona, contínua, Palma); o alcance também alonga o avanço e o recuo.
- Correção: o efeito do projétil (prender, deixar lento, ferir) agora usa os números com a maestria de quem lançou.
- Correção: na aba Jutsus, os jutsus de clã mostram o clã (antes apareciam como "Academia").
- Teleporte e Substituição (Academia) continuam com a evolução própria. Nenhum jutsu novo.

### v35: linhagem no Criador, Rito do Despertar e os 4 jutsus do Clã Umbra (migração v25, `db/schema_v25_linhagem.sql`)

- A linhagem (Clã Rubro, Clã Umbra, Andarilho) é **marcada no Criador de Personagem** e **desperta no Rito do Despertar**: no rank
  Genin (nível 11), fale com o Diretor da Academia, derrote 10 Lodos Escuros na Floresta e volte. A árvore do clã só abre depois.
- Clã Umbra com 4 jutsus próprios: Deslize Noturno (T1), Sombra Faminta (T2), Noite Fechada (T3) e Forma Umbral (T4).
- Visual: olho Rubro com íris vermelha que brilha mais a cada tier; névoa escura nos pés do Umbra; faixa no braço esquerdo do Andarilho.
- Catálogo com 100 jutsus. Quem já tinha linhagem fica com ela (a marca é preenchida pela própria v25).

### v34: pergaminho único, jutsu só da sua classe e reset de classes do admin (migração v24, `db/schema_v24_pergaminho_unico.sql`)

- **Um pergaminho só ("Pergaminho", `scroll_liso`):** serve para a Extração de qualquer classe sua (Primária ou Secundária). A loja vende só
  ele; a Missão de Genin, o drop dos monstros e o prêmio do PvP dão ele. A v24 soma os pergaminhos de classe de cada jogador no novo (nada
  se perde) e troca o das costas. Os de classe ficam no catálogo como "(antigo)", sem venda e sem dono.
- **Conferido (pedido do Victor):** jogador comum que entrou depois da v7 só aprende jutsu da própria classe (a Extração confere no banco).
  Mas havia duas brechas: **contas de antes da v7** ganharam os 7 jutsus de todas as classes, e **admin** (darjutsu, Missão de Genin
  repetida) também ficava com jutsus de outras classes. As duas permitiam montar o kit com vários elementos.
- **Corrigido no servidor:** só entra no kit, e só sai em combate, jutsu da Academia, da classe Primária, da Secundária ou da linhagem (o Clã
  Rubro e a árvore de sombra da Umbra). Vale para todo mundo, admin incluso. O jutsu de outra classe continua aprendido (nada se apaga), mas
  sai do kit ao entrar e não volta (`NOT_YOUR_CLASS`). A aba Kits mostra só os que podem ir para o kit.
- **`/admin resetarclasses <nome|eu>` (só em conta de admin):** volta à Academia sem classe, sem linhagem e sem os jutsus de classe e de clã
  (os da Academia ficam), para testar a escolha de classes e as builds do zero. Nível, itens e ryō ficam. Conta comum é recusada. Também no
  Painel do Admin (Jogador → Patente → Resetar classes).

### v33: o admin muda a patente de qualquer um, ele mesmo incluso (migração v23, `db/schema_v23_admin_patente.sql`)

- **`/admin patente <nome|eu> <academia|genin|chunin|jounin|anbu|kage>`** (e o Painel do Admin, aba Jogador, seção Patente). Sobe **ou desce**,
  em qualquer jogador e em si mesmo (`eu`). O alvo online vê a patente nova na hora (barra de XP, convite de sensei, os outros no mapa) e
  recebe um aviso; sem anúncio global e sem XP. Auditado como `rank`. O nome antigo `/admin rank` também vale.
- **É só o título:** não mexe em nível, classe, jutsus, vila nem no cargo de Kage da aldeia (esse continua sendo o `/admin kage <vila> <nome>`).
  "Kage" aqui é a patente `HOKAGE` (que aparece como Kage na tela).
- **ANBU entrou como patente** (tier 55, entre o Jonin e o Kage; pode ser sensei). As regras do ANBU (indicação do Kage, armas, máscaras,
  missões) são da Fase 2. O nome que a tela mostra do `JONIN` continua "Jonin" (o `docs/endgame-visao.md` chama de Jounin: renomear é decisão do Victor).
- **Missão de Genin repetível para o admin (testes):** o admin que voltou à Academia (`/admin patente eu academia`) faz a Missão de Genin com o
  Diretor quantas vezes quiser. Cada vez a classe Primária é trocada pela escolhida, a Secundária é limpa (não pode ser igual à Primária) e ele
  ganha de novo 1 pergaminho da classe. Jutsus, itens, nível e linhagem ficam. **Quem não é admin continua com uma vez só.**
- **Migração v23:** a patente ANBU em `game.ranks`, a função `game.admin_set_rank` (confere `is_admin`, grava a auditoria e o histórico de
  patentes) e a `game.become_genin` com o ramo do admin. Sem a v23, o comando avisa "Rode a migração v23". Pode rodar de novo.

### v32b: aldeias Nuvem e Areia corrigidas (migração v22, `db/schema_v22_aldeias.sql`)

- Decisão do Victor: vale o documento canônico. **Nuvem (`vila_4`) = Aldeia do Vento Cortante** e **Areia (`vila_5`) = Aldeia da Rocha Antiga**
  (a v17 tinha trocado as duas). Mudou: `VILLAGE_INFO` (nome e atalho do `/admin vila`: `vento` é a Nuvem, `rocha` é a Areia), nomes dos
  mapas, textos do cliente, testes e a tabela `game.villages` (v11 e v17 também ficaram certas para banco novo).
- **O que NÃO mudou:** os códigos das vilas, a arte (a vila de nuvens é Vento Cortante, o deserto é Rocha Antiga) e as passivas de teste
  (+10% de dano de jutsu na `vila_4`, +10% de dano de armas na `vila_5`: continuam presas ao código; as passivas finais do documento
  canônico são da Fase 2). Ninguém muda de vila, de Kage ou de diplomacia.
- **Migração v22:** o nome da vila é único no banco, então a troca passa por nomes temporários (dentro da mesma transação). Não faz nada
  num banco sem a v11. Pode rodar de novo.

### v32: Fase 1, os nomes originais (migração v21, `db/schema_v21_nomes_jutsus.sql`)

- **Só trocou nomes** (nenhuma mecânica nova). Auditoria e as 3 opções de cada nome: `docs/fase1-renomeacao.md`; aprovado: a opção recomendada.
- **A organização vilanesca** passou a se chamar **Os Cinzas** na tela (aba, convite, avisos, erros, painel do admin); o **Manto da Akatsuki**
  virou **Manto Cinza** (ícone 🌑 e brasas laranja no lugar das nuvens vermelhas). Os **10 poderes** têm nomes novos (Gravidade Invertida,
  Lâmina Faminta, Pacto de Sangue, Escultura Detonante, Fios do Titereiro, Revoada Sombria, Vidas Costuradas, Passo Radicular,
  Tempestade de Páginas, Forma Fantasma). Os IDs e o nome interno (`akatsuki`) não mudam.
- **38 jutsus** (tradução direta de golpes da série) com nome original, por exemplo Chamas Negras → Brasa Sem Luz, Lua Ilusória → Mundo Espelhado,
  Dragão d’Água → Serpente d’Água, Estrela Espiral → Disco do Furacão. Os códigos não mudam (ninguém perde jutsu, uso, nível ou kit).
- **Arena das Quatro Heranças** (era Vale dos Guardiões; o ID `vale_estatuas` fica). Clã Rubro, Linhagem Umbra e Punho Sísmico ficam.
- **Teste `test/nomes.test.ts`:** trava nomes da série em jutsus, itens, poderes, mapas e NPCs, e nomes de jutsu repetidos.
- **Migração v21:** um UPDATE por jutsu em `game.jutsus.name` e o nome do manto em `game.items`. Rodar a v16, v18, v19 ou v20 de novo devolve
  nomes antigos: se rodar, rode a v21 outra vez.
- **Ainda não:** os selos dos jutsus de tier 1 (ficam para a Fase 2) e a limpeza dos
  documentos internos de design.

### v31: Fase 0, a Extração do design final e a maestria por jutsu (migração v20, `db/schema_v20_extracao.sql`)

- **Extração:** tier 1 = 1 pergaminho, as 2 primeiras de cada classe garantidas e depois 90%; tier 2 = 2 pergaminhos, 80%;
  tier 3 = 3, 60%; tier 4 = 4, 40% (antes 1/2/4/8 e 80/60/40/20%). A proteção contra azar continua: +10 pontos por falha
  seguida, até 100% (no tier 4, a 7ª tentativa seguida é certa). "Garantida" = o jogador sabe menos de 2 jutsus de
  tier 1 daquela classe. A Casa dos Pergaminhos mostra "garantida: N de 2 ainda".
- **Maestria por jutsu:** os 4 níveis de uso (0/100/500/2000) melhoram o que faz sentido para cada jutsu: dano (+10% por
  nível), efeito (+10% na duração de atordoar, prender, silenciar, queimar...), cura (+10%), alcance (+5%) ou recarga
  (-5%). **Feito no Fogo (os 11 jutsus)**, tabela `MASTERY` em `src/realtime/jutsus.ts`: Fogo e Sopro Incinerador =
  dano + efeito (queimadura); Linha de Fogo Rasante = dano + alcance; Névoa Inflamável, Nuvem de Cinzas e Chuva de
  Meteoros = dano + recarga; Lâmina de Fogo = recarga; os demais = dano. **Os outros 85 jutsus continuam com a regra
  antiga (dano e cura) e serão ajustados aos poucos**, classe por classe. A aba Jutsus mostra o bônus de cada um, e o
  servidor manda a recarga de verdade em cada jutsu (o cliente não adivinha).
- **A v20 também põe no banco o que faltou na v19:** a Lua Ilusória e o Guardião Espectral Completo (Clã Rubro, nível
  60) em `game.jutsus`, e `game.valid_kit` com os 96 códigos.
- Testes de banco consertados: rodar a v11 ou a v12 de novo depois da v14 quebrava a regra dos tipos de item (faltava o
  acessório).

### v29: Jutsus v2, entrega 2 (o Fogo novo) e a conjuração (migração v16, `db/schema_v16_jutsus_fogo.sql`)

- **11 jutsus de Fogo** (antes 4): tier 1 Bola de Fogo, Sopro Incinerador (cone que queima), Névoa Inflamável (nuvem
  que detona em 3 s), Linha de Fogo Rasante; tier 2 Chamas da Fênix (leque de 3 bolas, cada alvo leva no máximo 2),
  Chamas do Dragão Guiado (linha instantânea), Nuvem de Cinzas Ardentes (aviso em volta, cai em 1 s), Lâmina de Fogo
  (Ataque Básico +15% por 5 s); tier 3 Destruição Magnífica (onda em cone 120°), Míssil Dragão de Fogo (projétil lento
  que explode); tier 4 Chuva de Meteoros (5 avisos de 0,8 s; 3 caem no ponto mirado).
- Os códigos `fire_2`, `fire_3` e `fire_4` ficam (quem tinha continua com eles, com o uso e o nível); só o jutsu muda.
  Os nomes visíveis são os em português da adaptação (a Fase 1 do roadmap tira os nomes da série).
- **Conjuração (selos):** barra na cor do elemento sobre a cabeça e uma maior perto dos botões. Anda a 50% (longo e a
  Chuva de Meteoros: parado). Nenhum outro jutsu nem o Básico sai durante os selos; Substituição e Teleporte cancelam
  (metade do chakra). Atordoar, silêncio, sono e empurrão de 1,5 casa **interrompem** ("Interrompido!"): metade do
  chakra, recarga de 1,5 s e 3 s de Concentração (a próxima não se interrompe). Dano comum não interrompe; controle e
  fim dos selos no mesmo tick: o controle vence. Recompensa: 0,5 s ou mais = +5% de dano e -10% de recarga.
- **Simulador (`pvpSim`)** agora conhece a base própria dos jutsus novos, os golpes por forma (leque 2, meteoros 3),
  os selos e a interrupção. Para passar no critério "ninguém vence todas", a Destruição Magnífica custa 30 (o tier
  dava 34).
- **Migração v16:** os 7 jutsus novos e os nomes novos em `game.jutsus`, e a regra dos kits (`game.valid_kit`) aceitando
  os códigos novos (sem ela, salvar um kit com jutsu novo dá erro).

### v30: Fase 1 (nomes) e as outras 8 classes (migrações v17 e v18)

- **Herança do Fogo** (antes Vontade do Fogo). Aldeias: Chama Eterna (era Folha), Maré Oculta (Névoa), Vento Cortante
  (Nuvem), Rocha Antiga (Areia) (a v17 trocou Nuvem e Areia; corrigido na v22); Vale dos Guardiões (era Vale das Estátuas). Os códigos das vilas não mudam.
  `/admin vila` e `/admin kage` aceitam chama|mare|rocha|vento (os nomes antigos ainda valem). Migração v17.
- **72 jutsus** (antes 45): Água, Relâmpago, Terra, Médico, Armas, Ilusão, Taijutsu e Sombra ganharam os jutsus da
  adaptação (27 códigos novos; os tiers 2 a 4 de cada classe viraram os da adaptação, com o mesmo código). Catálogo em
  `src/realtime/jutsusClasses.ts`. Formas novas: linha com efeito, alvo único, anel, cone com vários golpes, zona (em
  pulsos, que anda junto, que puxa, que prende o 1º que entra, golpe no fim), investida, recuo, aviso em ondas,
  limpeza, cura ao longo do tempo, impacto, ricochete e agarre.
- **Sistemas próprios (pedido do Victor, 08/11):** escuridão (a tela escurece em volta), controles invertidos,
  armadilha, canalização (Palma Mística), bumerangue, muros (Muralha de Terra, Muro de Água: bloqueiam passagem e
  projéteis, têm vida), invocações (Clone de Água, Golem de Terra Titânico: monstro com dono, sem XP, some no fim), a
  classe **Vento** (10ª classe, 8 jutsus, escudo com vida) e os **clãs**: `/linhagem rubro|umbra|andarilho` a partir de
  Genin (nível 11), uma vez só; os jutsus do clã chegam nos níveis 11, 20, 40 e 60 (Clã Rubro: 4 jutsus novos; Clã
  Umbra: a árvore das sombras e +10% de alcance; Andarilho: Substituição 15% mais rápida). Migração v19.
- **Controle mais forte:** 2,5 s por golpe e 5 s a cada 15 s (eram 1,5 e 2,5); todo controle dos jutsus x1,6; o choque
  da paralisia pesa metade.
- **Depois, no mesmo branch:** monstros atraídos pelas invocações; Lua Ilusória e Guardião Espectral Completo (Clã Rubro,
  nível 60). **Ainda não:** a escolha da linhagem no Criador, a missão de despertar com objetivo, o olho do Clã Rubro
  que muda de visual, a conversão da classe Sombra em Clã Umbra. Cura, Ilusão e Possessão da Sombra (tier 1) continuam
  sem selos.
- **Equilíbrio:** jutsu com números próprios paga o próprio custo no PvP (o x4 era do Golpe Avançado); as Armas novas
  pagam o x2,5 e usam as bases da adaptação x0,72 (o atributo e a arma somam por cima). O simulador escolhe pelo dano
  por tempo gasto (toque + selos). Todos os critérios do `pvpSim` passam.
- **Migração v18:** os jutsus em `game.jutsus` e `game.valid_kit` com os 72 códigos.

### Correção do rankeado (sem migração)

- O perdedor da rodada 1 não voltava na rodada 2 e apanhava parado. Causa: a queimadura do último golpe continuava no
  intervalo, com a vida já em 0, e matava de verdade; na rodada 2 o cliente nunca recebia o "reviveu". Agora, no Vale,
  ninguém apanha nem ganha efeito fora da rodada, o fim da rodada apaga os efeitos, o começo da rodada zera atordoado e
  preso, e quem estiver morto recebe `player_respawned`.

### v29: modo rankeado (migração v15, `db/schema_v15_rankeado.sql`)

- **Vale dos Guardiões:** botão **Rankeado** no menu (lá vira **Voltar**). Mapa comum a todas as vilas: arena fechada no
  meio, arquibancadas dos dois lados (dá para **sentar** e, sentado, **assistir** a luta), estátuas das 4 vilas.
- **Fila do Desafio** (`src/realtime/duel.ts`): quem entrou primeiro luta primeiro; o adversário sai das 4 pessoas
  seguintes (nível parecido); ninguém é passado mais de 2 vezes; evita repetir a dupla. O adversário só aparece na
  preparação.
- **Partida:** melhor de 3, preparação de 10 s, rodadas de até 50 s, ninguém morre; sem passiva da vila nem clima.
- **Pontos (v15):** Elo K = 24 com fator do novato, temporadas de 60 dias, 30/10 ryō por partida, recompensas no fim
  da temporada, painel **Ranking** com faixas (Bronze a Lenda). Contra abuso: quem sai fica fora da fila (1 min,
  dobra), sair na preparação cancela, partida sem dano não conta, admin não conta, 3 partidas por dia por dupla.
- **Jogo todo:** a vida só volta com o chakra cheio e 7 s sem apanhar nem gastar chakra.

### v28: equilíbrio do PvP, passo 1 do duelo (sem migração)

Plano completo em `concepts_brief.md` (revisado pelo método EGM; relatórios em `revisao_egm/`).

- **Dano base menor no jogo todo:** jutsus e poderes da Akatsuki a 40%; Ataque Básico e arma a 50%
  (`combat.damageScale`). O bônus do atributo Armas vale pela metade no Ataque Básico. A cura não muda. Os monstros
  ficaram com a vida de antes (o Slime cai com 6 golpes no nível 1). O boneco da Academia tem 12 de vida (2 golpes).
- **Vida por nível:** +6 de vida por nível acima do 1, somada à Vitalidade (nível 60: até 733).
- **Tabela de equilíbrio do PvP** (`src/realtime/pvpBalance.ts`), só nas áreas de PvP (arena das vilas e Zona de
  Conflito) e só de jogador em jogador: curva de tier achatada (tier 4 = 1,45x), nível de uso +0/+5/+10/+15%,
  Taijutsu x4, Armas x2,5 e Relâmpago x2 no custo e na recarga, escudo da Pedra 50 a 65%, cura com a curva achatada.
- **Orçamento de controle:** de jogador em jogador, no máximo 1,5 s por golpe e 2,5 s sem agir a cada 15 s (silêncio
  pela metade). Controle de monstro segue o teto de antes.
- **Rede de segurança:** um ninja tira de outro no máximo 50% da vida em 2 s; os cortes aparecem no Painel do Admin.
- **Simulador de duelos** (`src/realtime/pvpSim.ts`) no `npm run verify`: 5 builds no nível 60, duelos de 6 a 30 s,
  nenhuma build vence todas, o atordoamento sempre pega.

### v27: o casaco com capuz vira acessório (migração `db/schema_v14_acessorio.sql`, ANTES do deploy)

- O casaco com capuz saiu das roupas do Criador e virou item do espaço **Acessório** na Tela de Equipamentos (que
  perdeu o cadeado). Ele fica por cima da roupa equipada (camisa e calça ou o conjunto da vila), é uma peça só nas
  costas e todos veem.
- Quatro casacos na Alfaiataria: petróleo, preto, vinho e verde (1.200 ryō cada).
- Quem usava o casaco como roupa (v26) ganha o casaco da mesma cor, já equipado; a roupa volta para "Camisa e calça".
- Boneco: olhos, nariz e boca no meio do rosto, franja mais curta e o casaco sem a costura no meio das costas.
- Passo a passo no DEPLOY.md (Passo 29).

### v26: boneco no estilo da folha de referência (sem migração)

- Estilo novo em todos os visuais: contorno escuro uniforme por fora e por dentro (onde uma peça passa na frente da
  outra), sombreado em faixas de 2 a 3 tons, cabeça e olhos grandes. Detalhes em
  [arte/personagem-rig/LEIAME.md](arte/personagem-rig/LEIAME.md).
- Novo no Criador: o cabelo **Bagunçado** (mechas em lâmina, franja em mechas de comprimentos diferentes, mechas na
  frente da orelha até a bochecha) e a roupa **Casaco com capuz** (casaco aberto na cor escolhida, blusa ameixa no V,
  faixa preta na cintura, capuz caído nas costas, calça larga presa na bota). As abas do casaco têm física: parado
  caem retas, andando abrem e correndo voam para trás.
- Cores novas de roupa: petróleo e ameixa. As botas ninja ficaram escuras, com a sola clara.
- Olhos redesenhados: abertos e calmos, com o brilho logo abaixo do cílio. No perfil, o olho fica recuado da borda do
  rosto. No "foco", a pálpebra abaixa.
- Acabamento: o desenho fecha furinhos vazios dentro do traço e apaga pontas de mecha soltas em todo quadro. Um teste
  confere todas as animações, o giro, os 3 cabelos e a capa.
- Correção: andando para cima, o boneco não virava de costas (o giro de frente para costas trocava de sentido a cada
  quadro). Agora ele vira em ~0,2 s.
- Sem migração: o banco só confere o formato dos nomes e as 12 chaves do visual.

### v25: boneco novo desenhado por código, com esqueleto 3D, camadas e física do pano (sem migração)

- O personagem não é mais um atlas de imagens. O aparelho desenha cada quadro em pixel art a partir de um esqueleto
  3D animado (`public/rig.js`), com o corpo base e as camadas presas nos mesmos ossos (`public/rigArt.js`), e guarda
  o quadro (`public/figure.js`). Detalhes em [arte/personagem-rig/LEIAME.md](arte/personagem-rig/LEIAME.md).
- As animações são mais suaves: 12 a 20 quadros por ciclo, contra 3 antes. O boneco gira suave entre as direções e
  mistura a pose na troca de animação. As animações novas são corrida ninja, meditar, tranco ao levar golpe e caído
  de joelhos.
- Camadas: corpo, olhos, boca, cabelo, bandana, camisa, calça, conjunto, acessórios (porta-kunai, bolsa), sapatos,
  capa e as armas na mão e nas costas, na profundidade certa. Os visuais, cores e estilos são os mesmos de antes.
- A capa tem física: fica presa por cima dos ombros, cai pelas costas e se dobra por cima do braço e do joelho que vão
  para trás. As pontas da bandana e o cabelo longo pendem e balançam com o movimento.
- Os atlas `public/sprites/chibi_*.png` saíram. `public/spriteData.js` agora só guarda as paletas.

### v24: habilidades em linha só nas 4 direções, mira com prévia e ✕ do foco (sem migração)

- Fogo, Sombra, Relâmpago e Kunais (todos os tiers) só saem para cima, baixo, esquerda ou direita. Segurar e arrastar
  o botão escolhe a direção, com a prévia em ciano (caminho, casas, alvo) só para quem mira; toque rápido mira no
  foco; arrastar e voltar ao meio cancela; no computador, segurar 1 a 4 mira com o mouse (docs/habilidades.md, 2b).
- As Kunais saem em 3 trilhas paralelas (antes, leque de 45°).
- Com foco, um ✕ ao lado do quadro do alvo para de focar (tecla X).

### v23: mapas com a imagem gerada por IA (piloto: Poço; sem migração)

- Um mapa com `art` no layout é desenhado com a própria imagem da IA, cortada em blocos de 8 x 8 casas
  (`public/mapas/<art>/`, feitos por `arte/mapas/fatiar.py`); as paredes do layout seguem o desenho e só dão
  colisão (confira com `arte/mapas/sobrepor.py`). Como fazer: docs/mapas.md, 6.1.
- **Poço sob a Praça:** primeiro mapa em imagem; passou a 24 x 18 (a proporção da imagem), com as tochas do desenho
  acendendo no escuro da caverna (`lights`).
- **Armaria e Casa dos Pergaminhos:** salas em imagem de 17 x 13, cada uma com a sua planta (`shopRoom()`: lojista,
  frente do balcão, chegada e saída). A Alfaiataria segue na sala 15 x 15 por código até ter imagem.
- **Aldeia da Chama Eterna:** em imagem, ampliada 4x com o Real-ESRGAN (`arte/mapas/ampliar.py`), em 78 x 60 casas. Cada vila
  em imagem tem a sua planta (`villagePlan()`: renascimento, Mestre, praça, Posto de Viagem, portão, lojas, Academia,
  arena); NPCs, renascimento, viagem e o fim do tutorial saem dela. A borda norte da Floresta só atravessa no trecho
  do portão da Folha.
- **Névoa e Nuvem:** em imagem também. A IA desenhou as duas sobre a planta da Folha: `arte/mapas/alinhar.py` mede a
  conta entre as imagens e `retrace()` reaproveita a planta e as colisões, trocando só o que muda (bambuzais na Névoa,
  mastros das bandeiras na Nuvem). A Areia segue na planta 80 x 80 por código até a imagem nova dela.
- **Floresta:** em imagem, 100 x 75. Os lugares das missões foram para onde o desenho os mostra (docs/mapas.md, 3.x);
  a Folha liga com a entrada deslocada 9,5 casas. O abismo do desenho é largo demais para o Teleporte: na beira,
  virado para a saliência, o Teleporte salta até ela (`leaps`). O Posto de Viagem da Floresta fica na clareira da
  entrada (54,5; 8,5).
- **Zona de Conflito:** em imagem, mantida em 110 x 80 (a imagem esticada 2,8% na largura). Os acampamentos ficam
  onde o desenho põe as fogueiras e bandeiras; a ruína do meio com os pilares e as lajes.

### v22: Névoa, Nuvem e Areia com o desenho das artes (sem migração)

- A mesma planta nas quatro vilas, com o desenho do tema (docs/mapas.md, 7.1; referências e prévias em `arte/vilas/`).
- **Areia:** prédios redondos de arenito (`drawSandBuilding` em `public/mapArt.js`: cúpula da sede com janelas e torres,
  hospital claro, Academia de duas torres com ponte, lojas com toldos e mercadoria, casas em torre), cânion no lugar da
  muralha, mesa de arenito, chão de deserto, pontes de pedra, palmeiras, cactos, vasos de barro e arena de terra batida.
- **Névoa:** bambu no lugar das cerejeiras, grama úmida e poças. **Nuvem:** nuvens no morro e bandeiras da vila
  (enfeite `flag`, sem colisão).
- O cache dos objetos altos (árvores) agora separa por tema: antes, viajar entre vilas reaproveitava o desenho de outra.

### v21: site do jogo no Floot (API `/site/*`, saúde e alertas; sem migração)

O site (ranking PvP e MMR, ranks, vilas e eleição do Kage, notícias, votação de atualizações e o painel do admin ao
vivo) roda no Floot e conversa com este servidor por duas vias. As duas só existem com `SITE_TOKEN` (32+ caracteres,
diferente de `JWT_SECRET` e `SERVICE_TOKEN`) e `SITE_URL` (o endereço do site, sem `/` no fim) no Render.

- **O site pergunta** (`src/site/siteRoutes.ts`, `siteStore.ts`): toda rota pede o segredo em `x-site-token`. Quem
  chama é o servidor do site, nunca o navegador, então as rotas ficam fora do limite global por IP.
  - `POST /site/login` `{ login, password }` (e-mail ou nome): devolve o mesmo JWT do jogo. Limite por IP do visitante
    (`x-site-client-ip`, 5 em 10 min) e por conta (10 em 10 min).
  - `GET /site/overview` (módulos, população, vilas com Kage e passiva, temporada, guerras e alianças, online),
    `/site/elections` (abertas com votos e histórico), `/site/ranking/pvp?scope=season|global&limit`,
    `/site/ranking/ranks?limit`, `/site/players/:username` (admins não aparecem).
  - Com o JWT em `Authorization`: `GET /site/me` (perfil, eleição da vila e se pode votar, com o motivo) e
    `POST /site/kage/vote` `{ candidateId }` (mesmas regras do jogo; recusa = 409 `VOTE_REFUSED`).
  - `GET /site/admin/live` (só admin): o retrato ao vivo do mundo.
- **O servidor avisa** (`src/site/telemetry.ts`): um batimento a cada 60 s em `{SITE_URL}/_api/game/heartbeat`
  (online por mapa, jogadores, loop do jogo, atraso do Node, memória, banco, erros) e alertas em
  `/_api/game/alerts`: `ligou`, `desligando` (SIGTERM: deploy ou o Render pondo para dormir), `erro` (500 e exceções),
  `bug` (erros do navegador do jogador, mensagem `client_error`, até 3 por minuto por cliente), `instavel` (loop lento,
  atraso acima de 250 ms, memória acima de 420 MB, banco fora ou lento) e `suspeito` (o `Sentinel`: 30 mensagens
  inválidas por minuto, flood, 3000 ryō ou 15000 XP em 10 min, a mesma dupla vencendo 4 vezes em 24 h, 8 senhas erradas
  em 10 min). O mesmo alerta em rajada sai uma vez e vira contagem; o texto passa por `scrub` (sem URL do banco, JWT,
  Bearer nem os segredos). Batimentos e alertas não acordam o Render (é ele que manda); as páginas do site que
  perguntam ao jogo (`/site/*`) acordam, como qualquer visita.
- No site, queda = silêncio com gente jogando (o alarme do Floot dispara 2,5 min depois do último batimento e pergunta
  ao `/health` o motivo); silêncio depois de `desligando` ou com 0 jogadores é "dormindo".

### v20: a Vila da Pedra sai do jogo (migração `db/schema_v13_sem_pedra.sql`, ANTES do deploy)

- **Quatro vilas:** Folha, Névoa, Nuvem e Areia (decisão do Victor, 25/10/2026). Os códigos não mudaram (`vila_1`,
  `vila_3`, `vila_4`, `vila_5`); a `vila_2` sumiu do servidor (`VILLAGES`, `villages.ts`, mapa `vila_pedra`), do
  cliente (`endgame.js`, temas em `mapArt.js` e `game.js`), do Criador (`spriteData.js`) e da Zona de Conflito, que
  agora tem cinco acampamentos (quatro vilas e os renegados).
- **Migração v13:** quem estiver na Pedra vai para a Folha com a troca de vila de volta; Kage, eleição, diplomacia,
  eventos, denúncias e o registro do Kage da Pedra são apagados, e a vila também. A v11 não cria mais a Pedra (rodar
  a v11 de novo não a traz de volta).
- **Criador:** os botões de vila mostram o nome (Folha, Névoa...) em vez de "Vila 1".
- A passiva de vida (+10%, só da Pedra) saiu junto.
- **Tela do jogo:** chat com letra menor e translúcido (opaco ao tocar nele ou escrever: `.chat-box.active` e
  `:focus-within`); o botão do Admin virou um ícone do menu ☰ (não cobre mais o chat); o status fica no canto, curto no
  celular ("1 jogador · 212 ms", o mapa só no PC: `.st-detail`).

### v19: Rei Lodo, silêncio da Ilusão, números de PvP e Painel do Admin (sem migração)

- **Painel do Admin** (`public/adminPanel.js`): o botão 🛡️ só aparece para quem tem `is_admin`.
  - Em cima, o **jogador alvo** (a lista sugere quem está online; "eu" põe o seu nome).
  - Abas:
    - **Jogador:** ryō, nível, zerar pontos, efeito, vila, Kage, renegado e Akatsuki;
    - **Itens** e **Jutsus:** tocar no item ou no jutsu dá ao alvo;
    - **Monstros:** tocar invoca em volta;
    - **Mundo:** ir para um mapa, clima e hora;
    - **Fim de jogo:** ligar, desligar ou deixar no automático cada módulo, eleição, evento e temporada;
    - **PvP:** os números.
  - Cada toque manda `{ type: "admin", command }`, o mesmo texto do chat, com ritmo próprio (5 seguidos, depois 3 por
    segundo) fora do chat. O servidor confere tudo de novo, como no `/admin`. O catálogo (`admin_catalog`: online,
    monstros e mapas) só vai para admin.
  - O que não volta atrás pede um segundo toque. O rodapé mostra o comando de chat equivalente e a resposta.
- **Comandos de admin em português:** `ajuda`, `nivel`, `invocar`, `darjutsu`, `daritem`, `ryo`, `zerarpontos`, `pvp`,
  `ir`, `clima`, `hora`, `efeito`, `fimdejogo <módulo> <ligar|desligar|auto>`, `vila`, `kage`, `eleicao`, `evento`,
  `renegado <nome> <sim|nao>`, `akatsuki`, `temporada`. Os nomes antigos continuam valendo, e a auditoria guarda os
  mesmos nomes internos de antes.
- **Números de PvP** (`pvpStats.ts`, `/admin pvp [dias]` ou a aba PvP):
  - **desde que o servidor ligou:** lutas (arena, Zona de Conflito e aberto); vitórias, derrotas, % e dano por classe
    Primária; dano, acertos, dano por acerto e abates por golpe (jutsu, Ataque Básico, arma lançada, poder da Akatsuki
    e queimadura);
  - **do banco:** a Zona de Conflito por classe nos últimos N dias (padrão 7, até 90). É só leitura em
    `game.pvp_matches`, sem migração.

- **Rei Lodo, o primeiro chefe** (Caverna do Lodo, canto leste da câmara do lago, longe do fundo da M11):
  - 1000 de vida, coroa e tamanho 2,3x; nasce com o servidor e volta 5 min depois de morrer;
  - quem chega perto vê a **barra do chefe** no topo, com as marcas das fases;
  - tem o golpe marcado (círculo vermelho de 2,2 casas, 32 de dano, de 6 em 6 s);
  - **65% da vida:** "O Rei Lodo chama os filhos!": 4 slimes nascem em volta e vão atrás do alvo dele;
  - **30%:** "O Rei Lodo está furioso!": bate 30% mais rápido e libera o **Esmagar**, um círculo **roxo** pequeno
    (1,2 casa) só no alvo, que cai 1,5 s depois com 60 de dano. Pede a Pedra, a Substituição ou sair correndo;
  - cada fase acontece uma vez só. Se todos fugirem (corda de 3 casas fora da zona dele), ele volta para casa com a
    vida toda, as fases recomeçam e os filhos vão embora;
  - na morte: 400 de XP e 120 a 200 ryō para cada participante, e um anúncio para o servidor todo;
  - os números ficam em `config.ts` (`rei_lodo`). São para um grupo de 3 ou 4 ninjas dos níveis da caverna (11 a 13).
- **Monstros em sprites** (estilo "tinta e brasa", [arte/monstros](arte/monstros/LEIAME.md)): Slime verde, Lodo
  Escuro roxo, Lodo Sombrio de fumaça e Rei Lodo (gigante preto de coroa). Cada um tem parado, ataque, golpe recebido
  e morte; o Lodo Escuro e o Rei Lodo agacham no golpe marcado e caem no pulo; o Rei chama os filhos, fica furioso
  (olhos em brasa) e ergue os punhos no Esmagar.
  - O servidor manda `monster_attack` (`id`, `targetId`) quando um monstro bate, e o cliente vira o monstro para o
    alvo; o resto vem das mensagens que já existiam (golpe marcado, fases, morte).
  - Um atlas WebP por tipo (`public/assets/monsters`), gerado por `arte/monstros/recortar.py`. Até carregar, o jogo
    desenha os slimes antigos.
- **Ilusão tier 3 e 4:** depois do atordoamento, o alvo fica **em silêncio** (sem jutsu; o Ataque Básico continua):
  mais 3 s no tier 3 e 4,5 s no tier 4.

### v18: sapatos, tela de equipamentos e `/admin ryo` (migração `db/schema_v12_sapatos.sql`, ANTES do deploy)

- **Sapatos (equipamento dos pés):** o sapato saiu da roupa e virou uma camada própria do boneco (`sapato` nos
  sprites, desenhada depois da roupa: a bota cobre a barra da calça). Sem sapato, o pé fica descalço.
  - Itens do tipo `shoes` na Alfaiataria: Sandália Ninja (80), Sandália de Couro (250), Botas de Viagem (500) e
    Botas Ninja (900). O desenho e as cores de cada um ficam em `items.ts` (`look`) e em `public/sprites.js`
    (`SHOES`); o teste confere que são iguais.
  - Todo ninja tem a Sandália Ninja calçada (a migração dá a quem já existe; o banco dá a toda conta nova).
  - `{ type: "equip", item, slot: "feet" }` (item null = descalçar). O banco só deixa calçar um sapato que o jogador
    tem (`rule_equip_shoes_owned`). Todos veem (`gear.feet`); esconder a arma no ⚙️ não tira o sapato.
- **Tela de equipamentos:** sem Pescoço, Anéis e Brincos. No lugar, **Máscara** e **Acessório** (com cadeado até os
  itens chegarem) e o espaço **Pés** funcionando.
- **`/admin ryo <nome> <quantidade>`** (ou `giveryo`): dá de 1 a 1.000.000 ryō, pela função `game.admin_give_ryo`
  (confere `is_admin` e grava a auditoria).
- **Clima:** cada bônus de clima e de hora do dia vale no máximo **5%** (e a soma também; `SKY_CAP`).
- **Combate:**
  - o Ataque Básico, o Taijutsu e a Ilusão (e a Sombra, o Relâmpago e as Kunais) saem mesmo sem ninguém perto e
    podem errar; no PvP, acertar é questão de tempo;
  - o **Fogo** vai a 9 casas (eram 5) na direção do inimigo;
  - a **Água** empurra quem ela acerta (1,5 casa; mais no tier 2 em diante), parando antes da parede. Boneco de treino
    não sai do lugar; o ninja empurrado recebe `pushed` e todos veem ele escorregar;
  - na **zona segura** o Ataque Básico anima, sem dano (os jutsus continuam recusados);
  - o **🎯 foca aliados** também: primeiro os inimigos (monstros e, na arena e na Zona de Conflito, os ninjas
    inimigos), do mais perto ao mais longe; depois os aliados (anel e ficha verdes). Com um aliado focado, a **Cura**
    vai nele (longe demais: `OUT_OF_RANGE`, sem gastar).
- **Compensação de lag no PvP** ([docs/netcode.md](docs/netcode.md)): o servidor mede o ping de cada um (`sync` a
  cada 2 s; aparece no topo) e confere os golpes instantâneos onde o outro ninja estava na tela de quem bateu
  (ping + 100 ms de interpolação, teto de 300 ms). Projéteis continuam em tempo real.
- **Monstros com estados** (`monsterAi.ts`, docs/netcode.md):
  - param, notam quem chega no raio de aggro (ou quem bate neles) e perseguem; aparece um "!" vermelho;
  - batem quando encostam;
  - fugir além da corda faz o monstro desistir e voltar para a zona, onde recupera a vida toda;
  - slime: aggro 3,5 casas, 2,5 casas/s; Lodo Escuro: 5 e 3; lodo sombrio: 6 e 3,4. O ninja anda a 5.
- **Efeitos com tempo** (`effects.ts`, [docs/habilidades.md](docs/habilidades.md)): molhado, queimadura, regeneração,
  silêncio, sono (acorda ao apanhar), ferida (metade da cura) e lentidão, em ninjas e monstros, com ícone em cima da
  cabeça.
  - No jogo já: a **Água molha** e o **Relâmpago num alvo molhado** dá combo, 30% a mais ("Combo! ⚡💧").
  - O **Fogo queima** em todos os tiers (3 s; 3, 4, 6 e 8 por segundo nos tiers 1 a 4, com o Ninjutsu).
  - O **Relâmpago paralisa** (2 a 3,4 s): anda a 70% e leva um choque de 0,25 s por segundo.
  - Os outros efeitos são a base dos próximos jutsus; o admin testa com `/admin efeito <nome> <efeito|limpar> [seg]`.
- **Golpe marcado do Lodo Escuro:**
  - ele marca no chão um círculo vermelho onde o alvo está e, 1 s depois, pula ali (28 de dano);
  - quem sai a tempo escapa;
  - atordoar o Lodo no preparo interrompe o golpe.
- **Deploy:** a migração v12 é obrigatória. O servidor novo não sobe sem ela (o log do Render avisa) e o Render mantém
  a versão anterior no ar. Rodar no Neon primeiro, depois a `main` (DEPLOY.md, passo 24).

### v17: arte nova, HUD do desenho, mapas do Arco 1 e clima (sem migração)

- **Direção de arte** ([docs/arte.md](docs/arte.md)):
  - azul-noite e ouro na interface, com a fonte Barlow Condensed (OFL), servida pelo próprio servidor;
  - luz e cor por mapa: sombras das copas, faixas de sol, pólen, brasas, esporos e vinheta;
  - contorno, sombra e anel no chão de quem luta, e plaquinha de nome;
  - slime e Lodo Escuro chibi no lugar do círculo com "M"; o Mestre e o Posto de Viagem viraram bonecos chibi.
- **HUD** (`public/hud.css`):
  - retrato com nível, Vida e Chakra com ryō e efeitos, e a janela do alvo;
  - minimapa redondo com moldura dourada e missões em andamento;
  - chat em painel (abas Chat e Missões), menu em ícones redondos e faixa de XP;
  - computador: barra de ações embaixo, no meio; celular: arco do polegar, menu no ☰ e a câmera mais longe, com
    "Distância da câmera" no ⚙️.
- **Equipamentos de Shinobi** (a 🎒 Mochila):
  - o boneco grande, com os espaços em volta (os que o jogo ainda não tem ficam travados);
  - rank, atributos e barras;
  - grade do inventário com ícones em pixel art (armas, pergaminhos com o selo da classe, capas). Equipar só pede ao
    servidor.
- **Mapas do Arco 1** ([docs/mapas.md](docs/mapas.md)):
  - a Floresta por regiões: Pedras-Selo, Velho Carvalho, cachoeira seca, Acampamento Queimado, abismo e a boca da
    Caverna do Lodo;
  - trilhas e riacho em curva, mato e paredões de pedra;
  - a Caverna do Lodo, a Clareira Queimada e o Poço, lacrados até a história;
  - zonas de caça por nível e o Lodo Escuro;
  - `/admin ir <mapa> [x y]` para visitar.
- **Arena da Vila:** ardósia com frisos dourados, mureta com lanternas e holofotes.
- **Vila:** telhados japoneses, fachadas com janelas de papel, cerejeiras, lanternas de pedra e montanha com mata.
- **Ciclo de dia e noite e clima** ([docs/clima.md](docs/clima.md), `src/realtime/weather.ts`):
  - o servidor decide a hora (48 min por dia) e o clima (normal, dia quente, chuva, neblina), iguais para todos;
  - ao ar livre, dão bônus de no máximo 5% aos elementos: Fogo no dia quente, Água e Raio na chuva, Ilusão na
    neblina, Sombra de noite;
  - noite com luz em volta do jogador, das lanternas e das janelas;
  - `/admin clima` e `/admin hora`;
  - mensagem nova: `sky` (e `WorldInfo.sky`).

### v16: fim de jogo (migração opcional `db/schema_v11_endgame.sql`, [docs/endgame.md](docs/endgame.md))

Seis módulos que ligam **com a população** (jogadores ativos na semana): vilas 30 → PvP 60 → renegados 100 →
Akatsuki 150 (`config.endgame.thresholds`; `src/realtime/endgame.ts`). Ligou, fica ligado. O admin força com
`/admin fimdejogo <módulo> <ligar|desligar|auto>`. **O banco é a autoridade** de quem é de qual vila, de quem é Kage, das
guerras, alianças, renegados, ranking e Akatsuki (funções `game.*` da v11, com trava de linha); o mundo guarda uma
cópia (`politics`, relida a cada mudança e a cada minuto) para decidir na hora mapa, PvP e passivas. **A v11 é
opcional:** sem ela tudo fica desligado, e aplicar no Neon não precisa reiniciar (a manutenção procura a v11).

- **Vilas** (`villages.ts`): Folha (+10% cura), Névoa (+10% velocidade), Nuvem (+10% dano de
  jutsu), Areia (+10% dano com armas). A vila do jogador (`players.village`) vem do banco no `join` (o gateway lê
  antes do welcome) e decide onde nasce e renasce. Cada vila tem o seu mapa (a mesma planta, `theme` próprio), o seu
  Mestre e o seu **Posto de Viagem** (`travel_options` / `travel`: casa, Floresta, Zona, vila aliada por 50 ryō via
  `game.pay_travel`). Lojas e Academia são salas compartilhadas: a porta de saída leva de volta (`doorBack`).
  - **Acesso** (`mapAllowed`, a mesma conta no cliente em `politics.js`): vila só para quem é dela ou aliada; Refúgio só
    para renegado. A saída para um mapa proibido é parede (servidor e predição). Perdeu o acesso dentro do mapa
    (aliança desfeita, virou renegado): volta para casa (`map_changed` com `reason: 'exiled'`).
  - **Kage:** candidatura com o Diretor (nível 60), eleição de 7 dias por vila, mandato de 28 dias. O painel 🏯
    (`village_panel`) mostra eleição, diplomacia e o histórico; o Kage declara guerra, encerra, propõe aliança/paz,
    responde e desfaz (`kage_action`, `kage_answer`). Guerra: lojas +10% e espólio na Zona; aliança: −5% e viagem.
  - **Eventos globais** (`/admin evento`): guerra ou trégua forçada com hora para acabar.
- **PvP e temporadas:** **Zona de Conflito** (110x80, `zona_conflito`) com um acampamento seguro por vila e o dos
  renegados. PvP livre, menos aliados, trégua e Akatsuki entre si (`conflictHostile`). A vitória vai para
  `game.pvp_kill` (Elo K=32 global e da temporada, 3 por dupla por dia, nível até 10 de diferença, nada de admin):
  `pvp_result` para o mapa. Temporadas de 60 dias fecham e abrem sozinhas na manutenção, com títulos, ryō e o Manto
  do Campeão. Ranking: `ranking` (aba do 🏯). A arena da vila continua treino e não conta.
- **Renegados:** expulsão do Kage (`kage_exile`, justificativa, 5 por semana), denúncia de rank igual ou maior
  (`report_player` → `kage_report`) e karma (20 da própria vila na Zona, sem aviso). Irreversível (trigger no banco),
  menos por `/admin renegado <nome> nao`. Renegado mora no **Refúgio** (`refugio`), sem passiva, bandana riscada, e a
  recompensa pela cabeça aparece sobre o nome na Zona.
- **Akatsuki** (`akatsuki.ts`): 10 vagas, líder pelo admin, convites só do líder (`akatsuki_invite` / `_answer`,
  aceitar vira renegado), expulsar e sair. Cada vaga tem um poder (`power`, botão ☁️): Atração do Vazio, Lâmina
  Sanguessuga, Foice do Pacto, Argila Viva, Fios de Marionete, Corvos da Ilusão, Cinco Corações, Raízes Gêmeas,
  Chuva de Papel e Máscara Intangível. Membro que derrota um Kage na Zona: 3.000 ryō e anúncio.
- **Capas e paperdoll** (`endgame.js` no cliente): camada de capa no boneco (3 vistas, segue a âncora das costas em
  todas as animações): Capa de Viagem e Capa da Vila (Alfaiataria), Manto do Kage, da Akatsuki e do Campeão
  (`equip` com `slot: 'cape'`). ⚙️ → mostrar ou esconder capa, arma e pergaminho (`set_display`; só o que os outros
  veem).
- **Admin** (só `is_admin`, auditado, sem anúncio): `/admin fimdejogo`, `vila`, `kage`, `eleicao`, `evento`,
  `renegado`, `akatsuki`, `temporada fechar`. Nenhum mexe no MMR.
- Mensagens novas: `endgame`, `player_faction`, `village_panel`, `travel_options`, `ranking`, `pvp_result`,
  `akatsuki_invite`, `power` / `power_failed`; `PlayerView.faction` e `SelfView.doorBack`.

### v15: design geral, nome Herança do Fogo e arena da vila (migração opcional `db/schema_v10_design.sql`)

Primeira leva do [design geral](docs/design-do-jogo.md). O jogo passou a se chamar **Herança do Fogo**.

- **Arena da Vila** (`VILLAGE_ARENA` em `maps.ts`): o campo de treino virou uma arena de terra batida com cerca de
  madeira, entradas ao norte e a oeste, dois pilares de pedra (cobertura: param linhas e projéteis), estandartes e
  bancos. Dentro da cerca, os ninjas **da vila dona da arena** lutam entre si (`canHurt`); quem é de outra vila só
  assiste. Fora da arena, a Vila nunca tem PvP, nem com `pvp: true`.
  - Perder é treino: sem custo, renasce em 3 s na entrada oeste (`combat.arena.respawnMs`), com vida e chakra cheios.
  - Quem renasce (em qualquer lugar) fica 5 s sem apanhar de jogador (`combat.arena.protectMs`).
  - Placar em memória: `arena_result {winnerId, winner, loserId, loser, winnerRecord, loserRecord}` para todos no
    mapa; o cliente mostra no chat e o placar de quem lutou no topo.
  - Cliente: o topo mostra "⚔️ arena"; o 🎯 foca os ninjas da vila; nomes e barras deles em vermelho; a derrota avisa
    que se volta na entrada da arena. `player_died` traz `arena: true`.
- **XP por participação:** o último golpe e todo jogador que tirou pelo menos 20% da vida do monstro (`combat.participation`)
  ganham XP, ryō (cada um o seu), chance de pergaminho e o abate da missão.
- **Monstros por jogador:** `10 + 3 x jogadores no mapa`, até 40 (`monsters.perPlayer`, `maxCount`). Falta: nasce 1 por
  segundo. Sobra: some 1 por segundo, só com a vida cheia e longe de todos (`monster_gone`). `count: 0` desliga.
- **Teto de controle em jogadores** (`combat.controlDr`): atordoar ou prender o mesmo jogador de novo em 8 s dura a
  metade, depois um quarto, e na 4ª não pega. Monstros não têm teto.
- **Jeito de lutar de cada arma** (`ItemDef.swing`): Kunai (e a de Treino) recarga 0,85x, arco de 70°, 1,5 casa;
  Espada Curta 0,9x, 90°, 1,6; Espada Longa 1,15x, 140°, 2 casas. O `attack` traz `r` e `arc` (o corte é desenhado
  desse tamanho).
- **Vilas travadas no Criador** (`OPEN_VILLAGES`): só a Vila 1 até o Arco 2; as outras aparecem com cadeado e o
  servidor recusa (`VILLAGE_LOCKED`). Quem já tinha outra continua com ela.
- **Proteção contra azar na Extração** (migração v10): cada falha seguida na mesma classe e no mesmo tier soma +10
  pontos na chance (`game.player_extraction_pity`, `game.extraction_failures`). A Casa dos Pergaminhos mostra a
  chance de verdade (`extract_odds`). **A v10 é opcional:** sem ela o servidor sobe, avisa no log e a Extração usa a
  chance de sempre.

### v13: personagem em sprites (migração `db/schema_v9_visual_sprites.sql`)

Rodar no Neon depois da v8 (pode rodar de novo). Sem ela o servidor não sobe e o log diz que falta a v9.

O boneco de retângulos virou o **personagem chibi em camadas** de `arte/personagem-chibi/` (LEIAME lá):
masculino e feminino, 4 direções (o lado direito é o lado esquerdo espelhado) e as animações parado, andar,
correr (corrida ninja), ataque (soco e chute alternados) e jutsu (preparação, lançamento e volta; meditando,
o boneco fica na pose de carregar chakra, com o selo do carneiro).

- **Visual = nomes de paleta, nunca cor livre** (`src/realtime/appearance.ts`): gênero, pele (10 tons reais, do
  mais escuro ao mais claro), cabelo (espetado ou longo) e cor (16), olhos (com ou sem cílios) e cor (14), vila,
  roupa (camisa e calça nas 18 cores, ou o **conjunto da vila**), e bandana. Conjunto e bandana têm as cores da
  vila, travadas. O banco confere o formato (`game.valid_appearance`, v9).
- **Visual antigo** (5 cores, da v6): continua valendo no banco; o servidor converte para a cor da paleta mais
  parecida quando o jogador entra (e o cliente em cache que mandar o formato antigo também é aceito).
- **Cliente** (`public/sprites.js`): 2 atlas pequenos (`public/sprites/chibi_*.png`, mapas de índice) + dados
  (`public/spriteData.js`, gerado). Cada célula é recolorida uma vez por visual (cache), desenhada plano a plano;
  escala inteira em pixels do aparelho a partir de 2x (pixel art sem borrar). Até os atlas chegarem, o boneco antigo.
  (Desde a v25 o boneco é desenhado por código, sem atlas: veja a v25.)
- **Criador** novo: botões e amostras de cor no lugar dos seletores de cor livre.
- Regerar a arte: `python3 arte/personagem-chibi/gerador/export.py` e `.../export_game.py` (precisa de numpy e Pillow).

### v12: polimento, Modo Administrador e Academia nova (migração `db/schema_v8_admin_chat.sql`)

Rodar no Neon depois da v7 (pode rodar de novo). Sem ela o servidor não sobe e o log diz qual migração falta.

**1. Modo Administrador (God Mode)** — `players.is_admin` (falso para todos; a migração e o
`db/promote_victor.sql` ligam só a conta `Victor`). Comandos no chat, que **nunca** viram mensagem:

| Comando | O que faz |
|---|---|
| `/admin nivel <nome> <nível>` | nível 1 a 60 (XP no começo do nível; pontos recalculados, atributos zerados se não couberem) |
| `/admin invocar <monstro> [qtd]` | 1 a 20 monstros em volta do admin |
| `/admin darjutsu <nome> <jutsu> [nível]` | ensina o jutsu ou sobe o uso até o nível 1 a 4 (o uso nunca desce) |
| `/admin daritem <nome> <item> [qtd]` | 1 a 999 itens no inventário |
| `/admin ryo <nome> <qtd>` | dá de 1 a 1.000.000 ryō (v18, migração v12) |
| `/admin zerarpontos <nome>` | devolve os pontos de atributo, sem custo |
| `/admin patente <nome\|eu> <academia\|genin\|chunin\|jounin\|anbu\|kage>` | muda a patente (sobe ou desce) de qualquer jogador, o admin incluso (v33, migração v23). Só o título |
| `/admin pvp [dias]` | números do PvP por classe e por golpe (v19) |

Desde a v19 os comandos são em português, e o mesmo vale pelo **Painel do Admin** (🛡️). Os nomes antigos (`level`,
`spawn`, `givejutsu`, `giveitem`, `giveryo`, `resetstats`, `endgame`) continuam valendo.

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
  - `safeZones` no layout; nenhum jutsu (nem cura) sai ali: o servidor responde `cast_failed` com `SAFE_ZONE`, sem
    cobrar chakra;
  - o Ataque Básico sai (todos veem o golpe), mas não acerta ninguém (v18);
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
