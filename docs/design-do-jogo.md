# Vontade do Fogo: design geral do jogo

Este é o documento de design (GDD) do jogo. Ele diz **o que** o jogo é, **por que** cada sistema existe e **para
onde** ele vai. Os detalhes técnicos ficam em outros lugares:

| Documento | O que tem |
|---|---|
| este | visão, pilares, loops, sistemas, progressão, economia, social, PvP, arte, UI, monetização e roadmap |
| [historia/arco-1.md](historia/arco-1.md) | roteiro e missões do Arco 1, A Chama Apagada |
| [../README.md](../README.md) | como cada sistema funciona no código, versão por versão |
| [../DEPLOY.md](../DEPLOY.md) | como publicar (Neon e Render) |

**Etiquetas** usadas no documento:

- **[existe]**: já está no jogo, na `main`.
- **[parcial]**: existe uma parte; o resto está descrito aqui.
- **[proposta]**: o design recomenda, mas ainda não está feito.
- **[decidir]**: precisa de uma decisão do Victor (lista completa na seção 21).

**v15 (24/10/2026):** o Victor aprovou as ideias, escolheu o nome **Vontade do Fogo** e pediu uma **arena em cada
vila** para os ninjas da mesma vila treinarem PvP. O que entrou no jogo nessa versão está marcado como [existe]
(veja também o README, seção v15).

---

## 1. Em uma frase

Um MMORPG ninja em pixel art chibi, feito para o celular, em que você entra na Academia como cadete sem bandana,
sobe de rank com cerimônia, aprende com outros jogadores e ensina os novatos, até se candidatar a líder da vila.

---

## 2. Ficha do projeto

| | |
|---|---|
| **Nome** | **Vontade do Fogo** (decidido; veja a nota sobre o nome na seção 22) |
| **Gênero** | MMORPG de ação 2D, combate em tempo real, progressão por rank |
| **Plataforma principal** | navegador no celular, **deitado** (paisagem) |
| **Outras plataformas** | computador no navegador (teclado já mapeado); app nativo no futuro, com o mesmo protocolo (o servidor já aceita `Authorization: Bearer`) |
| **Perspectiva** | de cima, levemente inclinada, 4 direções no boneco |
| **Tecnologia** | servidor autoritativo em Node e TypeScript (Fastify, WebSocket), Postgres (Neon), cliente em Canvas 2D sem engine |
| **Público** | fãs de anime ninja no Brasil, de 13 a 25 anos, que jogam no celular em intervalos |
| **Classificação indicativa alvo** | 12 anos: luta com fantasia, sem sangue, com chat entre jogadores [proposta] |
| **Idioma** | português do Brasil primeiro |
| **Referência principal** | Nin Online (Hitspark): mundo em salas, vilas, ranks ninja e título de líder da vila |
| **Monetização** | sem venda por enquanto; loja só de cosméticos mais tarde (seção 16) |

---

## 3. Diagnóstico: o que o design precisa resolver

A base técnica é forte. O servidor decide tudo, o combate tem hitboxes de verdade, a progressão mora no banco e a
arte tem um estilo próprio. O que falta é o **motivo para voltar amanhã**: história em andamento, metas de médio
prazo e uma vida social que vá além do chat.

Os problemas que este documento resolve:

1. **Um único lugar de caça.** A Floresta com slimes é a única fonte de XP do nível 1 ao 60.
2. **A curva de XP não tem fontes que a acompanhem.** O nível 40 pede 572.000 XP, e um slime dá 20 (seção 8).
3. **XP só para quem dá o último golpe.** Num MMO isso gera roubo de abate e briga pelos 10 slimes. *(Resolvido na
   v15: XP por participação e monstros por jogador, seção 8.4.)*
4. **O maior diferencial não recompensa quem o faz.** A missão de sensei dá XP, título e pergaminho ao aprendiz.
   O sensei não ganha nada além de ajudar, então haverá poucos senseis.
5. **A escolha de vila não tem consequência.** O Criador oferece 5 vilas, mas todos nascem na mesma Vila, e o
   Arco 1 trata o jogador como cria dela. *(Resolvido na v15: as outras 4 ficam travadas até o Arco 2, seção 11.1.)*
6. **O PvP está pronto no código, mas não tem lugar nem regra** no design. *(Resolvido na v15: a arena de cada
   vila, seção 11.2.)*
7. **O ryō tem poucas saídas e nenhum plano.** Sem plano, a moeda perde valor ou fica sem uso.
8. **O nome e alguns termos têm risco de propriedade intelectual** (seção 22).

---

## 4. Pilares

Toda funcionalidade nova precisa servir a pelo menos um pilar e não ferir nenhum. Se não serve, não entra.

### P1. Do cadete ao líder da vila

- **O que é:** subir de rank é um acontecimento, não um número. Genin, Chunin e candidato a líder vêm de uma
  prova, com cerimônia e testemunhas.
- **Na prática:** o XP não promove ninguém [existe]. A Missão de Genin, o Exame Chunin e a candidatura são
  marcos [existe]. A promoção é anunciada para todos [existe].
- **O que não fazemos:** vender rank, pular prova ou dar promoção automática por tempo de jogo.

### P2. Aprender com quem veio antes

- **O que é:** o jogo foi feito para jogadores ensinarem jogadores. O Chunin que cria uma missão para um Genin é o
  coração social do jogo.
- **Na prática:** missão de sensei [existe], Exame Chunin aplicado por um Chunin+ [existe]. Recompensa do sensei e
  Equipes [proposta, seção 10].
- **O que não fazemos:** sistemas que tornem os outros jogadores desnecessários, como subir de rank só contra NPC.

### P3. Combate legível no polegar

- **O que é:** todo golpe tem uma forma que dá para ver e entender: arco, cone, linha, círculo. O que a tela
  mostra é o que o servidor calculou.
- **Na prática:** hitboxes geométricas no servidor [existe], efeitos desenhados no tamanho da hitbox [existe], um
  botão grande de ataque, 4 jutsus e 2 de movimento [existe].
- **O que não fazemos:** golpes invisíveis, mais de 4 jutsus na tela ao mesmo tempo, ataques fortes sem aviso.

### P4. Minha vila, minha bandana

- **O que é:** a vila é a identidade do jogador. A bandana, o conjunto da vila e a rivalidade com as outras vilas
  dizem quem ele é.
- **Na prática:** conjunto e bandana nas cores da vila [existe]. Vilas com nome, lugar e PvP entre elas
  [proposta, seção 11].
- **O que não fazemos:** PvP em todo lugar. A rivalidade tem lugar, hora e regra.

### P5. Cabe no intervalo

- **O que é:** uma sessão de 5 a 15 minutos sempre fecha alguma coisa: uma missão, um nível, uma compra, uma
  conversa.
- **Na prática:** cada missão do Arco 1 cabe em 5 a 15 minutos e termina com um gancho [roteiro pronto]. A Vila é
  segura e tem tudo perto: lojas, Mestre e Academia [existe].
- **O que não fazemos:** atividade que exige 1 hora seguida, punição por sair no meio, energia que acaba e obriga a
  esperar.

---

## 5. Fantasia e emoção

**Fantasia central:** *"Sou um ninja de verdade da minha vila. Comecei sem bandana, fiquei forte, ensinei os
novatos e hoje a vila confia em mim."*

| Fase | Rank | Níveis | Emoção que o jogo busca | O que o jogador sente que conquistou |
|---|---|---|---|---|
| Cadete | Academia | 1 a 10 | descoberta, "eu consigo" | o primeiro jutsu, a primeira arma |
| Ninja | Genin | 11 a 39 | pertencer, ter uma especialidade | a bandana, a classe Primária, o Arco 1 |
| Líder de equipe | Chunin | 40 a 59 | responsabilidade, prestígio | aprendizes, a classe Secundária, jutsus fortes |
| Referência | candidato a líder | 60 | liderança, legado | a candidatura, o voto da vila |

---

## 6. Loops de jogo

### Momento (segundos): lutar

**Mirar → golpear → ver o acerto → recarga → reposicionar ou meditar.**

- **Ação:** o toque responde no `pointerdown`, sem esperar soltar [existe].
- **Resposta:** o servidor diz quem foi acertado, e o efeito é tocado no lugar certo [existe].
- **Recompensa:** o número de dano, o monstro caindo, o XP subindo [existe].
- **Respiro:** o chakra só volta meditando [existe]. Isso cria um ritmo de lutar, recuar e meditar, que é a cara
  do jogo.

### Sessão (5 a 15 minutos): uma missão

```
  Vila (segura)                                 Zona de missão
  ┌──────────────────────┐                      ┌──────────────────────┐
  │ pegar missão         │ ───── portão ──────▶ │ cumprir o objetivo   │
  │ (Mestre, história,   │                      │ (caçar, ir até,      │
  │  sensei)             │                      │  coletar, chefe...)  │
  │                      │ ◀──── voltar ─────── │                      │
  │ entregar · loja ·    │                      └──────────────────────┘
  │ Extração · ficha     │
  └──────────┬───────────┘
             ▼
     gancho: a próxima pergunta, o próximo item, o próximo nível
```

### Dia e semana: motivos para voltar [proposta]

- **Sala de Missões** com 3 cartões que mudam todo dia, na faixa de nível do jogador.
- **Sensei e aprendizes:** a missão aberta tem prazo, então o aprendiz volta para entregar e o sensei para avaliar.
- **Evento semanal da vila:** uma meta coletiva (ex.: "a vila derrota 2.000 lodos"), com recompensa cosmética
  para todos que participaram.

### Longo prazo (semanas e meses)

**Nível → rank → classe Secundária → jutsus de tier 4 → títulos → candidatura → arcos novos.**

---

## 7. Mapa dos sistemas

| Sistema | Estado | Onde está | Seção |
|---|---|---|---|
| Mundo em salas: Vila, Floresta, Academia, lojas | [existe] | `maps.ts` | 7.1 |
| Movimento com predição e reconciliação | [existe] | `movement.ts`, `prediction.js` | 7.1 |
| Combate com hitboxes, efeitos e status | [existe] | `combat.ts`, `gameWorld.ts` | 7.2 |
| 9 classes, 38 jutsus, Extração | [existe] | `jutsus.ts`, banco v7 | 7.3 |
| 6 atributos com rendimento decrescente | [existe] | `stats.ts` | 7.4 |
| Armas no boneco, arma de arremesso | [existe] | `items.ts`, `weapons.js` | 7.5 |
| Academia (tutorial em 4 salas) | [existe] | banco v7 e v8 | 7.6 |
| Sala de Missões (Mestre) | [existe] | `missions.ts` | 6 e 8.3 |
| Missão de sensei e Exame Chunin | [existe] | banco v2 e v7 | 10 |
| Ranks e títulos | [existe] | banco | 7.7 |
| Chat local, global e sussurro, com histórico | [existe] | `chatLog.ts` | 10 |
| Modo Administrador com auditoria | [existe] | `admin.ts` | n/a |
| Arena de treino de PvP na Vila (só entre ninjas da vila) | [existe] v15 | `maps.ts` (`VILLAGE_ARENA`), `canHurt` | 11.2 |
| XP por participação e monstros por jogador no mapa | [existe] v15 | `killMonster`, `adjustDensity` | 8.4 |
| Teto de atordoar e prender em jogadores | [existe] v15 | `applyStatus`, `config.controlDr` | 7.2 |
| Jeito de lutar de cada arma | [existe] v15 | `items.ts` (`swing`) | 7.5 |
| Proteção contra azar na Extração | [existe] v15 | banco v10, `extractionChance` | 7.3 |
| Vilas travadas no Criador até o Arco 2 | [existe] v15 | `OPEN_VILLAGES` | 11.1 |
| Missões de história (arcos) | [proposta] | roteiro em `historia/` | 12 |
| Grupo, amigos e Equipes | [proposta] | n/a | 10 |
| Vilas com identidade e PvP entre vilas (fronteira) | [proposta] | `canHurt` pronto, `pvp: false` | 11 |
| Eleição do líder da vila | [proposta] | candidatura [existe] | 11 |
| Som | [proposta] | não há áudio hoje | 15 |

### 7.1 Mundo

- **Salas, não um mapa aberto** [existe]. Cada mapa é pequeno (a Vila tem 80 x 80 casas, a Floresta 100 x 100),
  carrega rápido e tem identidade. Na borda já se vê o pedaço do mapa vizinho, e a troca escurece a tela por 0,14 s.
- **A Vila é o centro** [existe]. É segura, tem lojas, Mestre, Academia, hospital e sede. Tudo que não é luta
  acontece nela.
- **Regra de design para mapas novos** [proposta]:
  - cada arco abre de 1 a 3 mapas, com uma faixa de nível;
  - o nome do mapa e o nível recomendado aparecem na troca de mapa;
  - todo mapa de luta tem uma clareira segura na entrada (a Floresta já tem);
  - a densidade de monstros cresce com o número de jogadores no mapa (seção 8.4).

### 7.2 Combate

**O que existe:** Ataque Básico em arco (ou arremesso, com a Shuriken Gigante), jutsus em linha, cone, círculo,
projétil e avanço, atordoar, prender, escudo e cura. Chakra que só volta meditando. Paredes que bloqueiam golpes.
Zona segura. Tudo calculado pelo servidor (tabela completa no README).

**Papéis das classes** [proposta: orienta o balanceamento]:

| Papel | Classes | O que faz no grupo |
|---|---|---|
| Dano à distância | Fogo, Relâmpago, Armas | causa dano de longe, em área ou na linha |
| Dano de perto | Taijutsu, Água | entra na luta, avança, acerta em cone |
| Controle | Sombra, Ilusão | prende e atordoa, abre janelas para o grupo |
| Proteção | Pedra, Cura | segura o dano e mantém o grupo de pé |

A classe Secundária (no Chunin) serve para cruzar papéis: Fogo com Cura, Sombra com Taijutsu. Assim um jogador
sozinho também se vira.

**Regras de combate** [proposta]:

1. **Aviso antes de golpe forte.** Ataque de monstro que tira mais de 25% da vida mostra a área no chão por pelo
   menos 0,5 s antes. Com cerca de 200 ms de ida e volta no celular, menos que isso não dá tempo de reagir.
2. **Tempo para matar no PvE:** monstro comum cai em 3 a 6 golpes no nível certo. Chefe, em 60 a 120 segundos.
3. **Tempo para matar no PvP:** de 6 a 10 segundos entre jogadores do mesmo nível, sem golpe que mate de uma vez.
   Assim dá tempo de usar a Substituição, fugir ou contra-atacar.
4. **Status com teto** [existe, em jogadores]: atordoar ou prender o mesmo jogador de novo em menos de 8 s dura a
   metade, depois um quarto, e na 4ª vez não pega até a janela passar. Sem isso, dois jogadores de controle prendem
   alguém para sempre. Monstros não têm teto: o controle no PvE vale inteiro.
5. **Cada inimigo ensina uma coisa.** O Lodo ensina a bater; o Batedor das Cinzas, a desviar de kunai; o Eco de
   Kagerō, que nem tudo é real.

### 7.3 Classes e jutsus

- **9 classes**, cada uma com 4 jutsus (tier 1 a 4), e mais 2 jutsus da Academia: 38 ao todo [existe].
- **Primária** no Genin, com 1 pergaminho dela; **Secundária** no Chunin [existe].
- **Jutsus da Academia** sobem pelo uso: 100, 500 e 2.000 usos [existe]. **Jutsus de classe:** +10% de efeito por
  nível [existe].
- **Kits:** 2 kits de 4 jutsus, com troca rápida [existe].

**Extração:** quanto custa, em média, aprender cada tier (150 ryō por pergaminho).

| Tier | Pergaminhos por tentativa | Chance | Pergaminhos em média | Ryō em média | Chance de falhar 5 vezes seguidas |
|---|---|---|---|---|---|
| 1 | 1 | 80% | 1,25 | ~190 | 0,03% |
| 2 | 2 | 60% | 3,3 | ~500 | 1% |
| 3 | 4 | 40% | 10 | 1.500 | 8% |
| 4 | 8 | 20% | 40 | 6.000 | 33% |

**Problema:** no tier 4, um em cada três jogadores falha 5 vezes seguidas e perde 40 pergaminhos sem nada. É o tipo
de azar que faz alguém desistir do jogo.

**Proteção contra azar** [existe, migração v10]: cada falha soma +10 pontos percentuais à próxima tentativa
do mesmo tier, e o bônus zera quando acerta. No tier 4, isso garante o jutsu em no máximo 9 tentativas, e a média
cai de 5 para cerca de 3 tentativas (de 40 para 24 pergaminhos). Se o tier 4 ficar barato demais, sobe o número
de pergaminhos por tentativa; o que importa é o pior caso deixar de ser sem fim. A conta vale por classe e por tier,
mora no banco (`game.extract_jutsu`), e a Casa dos Pergaminhos mostra a chance de verdade ("40% + 20% de sorte
acumulada").

**Regra fixa:** pergaminho e Extração **nunca** são vendidos por dinheiro de verdade. Um sorteio pago vira caixa
de recompensa, proibida pelo ECA Digital (seção 16).

### 7.4 Atributos

Vitalidade, Chakra, Agilidade, Taijutsu, Ninjutsu e Armas [existe]. Cada ponto rende menos que o anterior, sem
teto (só a velocidade tem teto). Redefinir custa 500 ryō [existe].

**Regra de design:** nenhum atributo é obrigatório para todas as classes. O teste é este: para cada classe, pelo
menos duas distribuições de pontos diferentes precisam ser boas.

### 7.5 Armas e equipamento

Cada arma muda o **jeito** de lutar, não só o dano [existe, v15]. Antes, fora a Shuriken, a arma só mudava o dano,
e a melhor era sempre a mais cara.

| Arma | Dano | Preço | Onde fica | Golpe | Dano por segundo num alvo (sem atributos) |
|---|---|---|---|---|---|
| Sem arma | 0 | n/a | n/a | soco: recarga 0,6 s, arco de 90°, 1,6 casa | 20 |
| Kunai de Treino | 10 | Academia | mão | rápida: recarga 0,85x, arco de 70°, 1,5 casa | 43 |
| Kunai | 14 | 300 | mão | rápida: recarga 0,85x, arco de 70°, 1,5 casa | 51 |
| Espada Curta | 18 | 600 | mão | equilibrada: recarga 0,9x, arco de 90°, 1,6 casa | 56 |
| Espada Longa | 28 | 2.000 | cintura e costas | lenta e larga: recarga 1,15x, arco de 140°, 2 casas | 58 (e pega mais gente) |
| Shuriken Gigante | 22 | 1.200 | costas, enorme | arremesso: 6 casas, atravessa todos, dano 2,5x, recarga 5x | 28 (em cada um da linha) |

- Uma arma de Ataque Básico por vez; o pergaminho fica à parte [existe].
- O corte é desenhado do tamanho do golpe de cada arma (o servidor manda o alcance e a abertura no `attack`).

- **Roupas** (Alfaiataria) são só visuais [existe o visual; a loja é proposta]. Roupa nunca dá atributo, para que a
  aparência seja livre.

### 7.6 Academia (tutorial)

4 salas em ordem: Taijutsu, Controle, Jutsus e Armas [existe]. Cada sala ensina uma mecânica com um objetivo só, e
o servidor não deixa pular. No fim: 100 ryō, 50 XP e a Praça.

**O que medir:** quantos jogadores terminam cada sala (seção 19). A sala onde mais gente para é a primeira a
melhorar.

### 7.7 Ranks e títulos

| Rank | Nível | Como chega | Marca |
|---|---|---|---|
| Academia | 1 a 10 | começa aqui | sem bandana |
| Genin | 11 | Missão de Genin com o Diretor (no Arco 1, a Cerimônia da Chama) | bandana e classe Primária |
| Chunin | 40 | Exame Chunin aplicado por um Chunin+ | classe Secundária, pode ser sensei |
| candidato a líder | 60 | candidatura com o Diretor | eleição (seção 11) |

**Títulos** [existe]: Discípulo do Mestre, Aprendiz Dedicado, Sombra Ascendente, Aprovado no Exame Chunin. O Arco 1
acrescenta Rastreador e Guardião da Chama. **Proposta:** o título escolhido aparece embaixo do nome, em letra menor.
É a vitrine de status do jogo e não custa nada.

---

## 8. Progressão

### 8.1 A curva (existe)

Do nível N para o N+1 são `100·N + 25·N·(N−1)` XP.

| Nível | XP para subir dele | XP total para chegar nele |
|---|---|---|
| 1 | 100 | 0 |
| 5 | 1.000 | 1.500 |
| 10 | 3.250 | 10.500 |
| 11 (Genin) | 3.850 | 13.750 |
| 15 (fim do Arco 1) | 6.750 | 33.250 |
| 20 | 11.500 | 76.000 |
| 30 | 24.750 | 246.500 |
| 40 (Chunin) | 43.000 | 572.000 |
| 50 | 66.250 | 1.102.500 |
| 60 | n/a | 1.888.000 |

### 8.2 Tempo-alvo por nível [proposta]

A curva fica como está, porque já mora no banco. O que se ajusta são as **fontes** de XP. O alvo é o tempo de jogo
para subir cada nível, crescendo de 3 minutos no nível 1 até 3 horas no 59.

| Nível | Tempo para subir | XP por minuto necessário |
|---|---|---|
| 1 | 3 min | 33 |
| 5 | 15 min | 66 |
| 10 | 30 min | 107 |
| 15 | 45 min | 148 |
| 20 | 1 h | 189 |
| 30 | 1 h 30 | 271 |
| 40 | 2 h | 353 |
| 50 | 2 h 30 | 435 |
| 59 | 3 h | 508 |

Isso dá, somando:

- **Genin** com cerca de **3 horas**;
- **fim do Arco 1** (nível 15) com cerca de **5 a 6 horas**;
- **Chunin** com cerca de **40 horas**;
- **nível 60** com cerca de **90 horas**.

São alvos para calibrar com dados reais (seção 19), não promessas.

### 8.3 De onde vem o XP [proposta]

A meta é não depender só de caçar. Divisão de cada faixa:

| Fonte | Níveis 1 a 15 | 15 a 40 | 40 a 60 |
|---|---|---|---|
| Missões de história | 40% | 30% | 25% |
| Sala de Missões (diárias) | 20% | 25% | 25% |
| Caça | 30% | 30% | 25% |
| Missões de sensei e Equipe | 10% | 15% | 25% |

**XP de monstro por zona:** um monstro comum dá cerca de **2 x o nível recomendado da zona**, com mínimo de 20.
O slime (20 XP) já está certo para uma zona de nível 10. No começo ele paga mais que isso, e é bom que seja assim:
os primeiros níveis precisam ser rápidos. Um monstro de zona 30 daria 60; de zona 50, 100.

A conta: um abate a cada 15 s, contando a caminhada, a 80% do ritmo da tabela 8.2.

### 8.4 Caça justa num MMO [existe, v15]

- **XP por participação, não pelo último golpe.** O último golpe e todo jogador (ainda no mapa) que tirou pelo
  menos 20% da vida do monstro ganham o XP inteiro, cada um com o seu ryō, a sua chance de pergaminho e o abate da
  missão. Antes, o XP ia só para quem dava o último golpe, o que estimulava roubar abate. O bônus de grupo vem com o
  sistema de grupo (seção 10).
- **Monstros por jogador.** Mapa de caça com N jogadores tem `10 + 3·N` monstros, até 40. Faltando, nasce 1 por
  segundo; quando o mapa esvazia, some 1 por segundo, só monstro com a vida cheia e longe de todo mundo (ninguém vê
  sumir).

---

## 9. Economia

### 9.1 Entradas e saídas de ryō

| Entra (fontes) | Quanto | Estado |
|---|---|---|
| Monstro | 5 a 15 (média 10) | [existe] |
| Fim da Academia | 100 | [existe] |
| Sala de Missões | 20 a 100, por dificuldade | [proposta] |
| Missões de história | recompensa fixa por missão | [proposta] |

| Sai (sumidouros) | Quanto | Estado |
|---|---|---|
| Armas | 300 a 2.000 | [existe] |
| Pergaminhos (Extração) | 150 cada | [existe] |
| Redefinir atributos | 500 | [existe] |
| Roupas e tintas na Alfaiataria | 100 a 1.000 | [proposta] |
| Viagem entre vilas | 50 a 200 | [proposta, Arco 2] |
| Taxa do mercado | 5% da venda | [proposta, fase 4] |

**Ritmo:** caçando, entra cerca de 40 ryō por minuto. A Espada Longa custa 50 minutos de caça; um jutsu de tier 4,
cerca de 2 h 30 (com a proteção contra azar, 1 h 30). Esses números estão bons para o começo.

### 9.2 Regras

1. **O preço é do servidor.** O cliente só pede; o banco confere o saldo [existe].
2. **Sem troca entre jogadores no lançamento** [proposta]. Troca livre traz venda de moeda por dinheiro real, robôs
   e golpes. Quando houver gente suficiente, abre-se um **mercado** com taxa (que também é sumidouro).
3. **Medir toda semana** o ryō que entrou e o que saiu (seção 19). Se entra muito mais do que sai, os preços perdem
   sentido.
4. **Nada de manutenção chata.** Sumidouro bom é o que o jogador quer gastar (roupa, jutsu), e não um castigo como
   arma que quebra.

---

## 10. Social

### 10.1 O que existe

- Chat local (o mapa), global (`/g`) e sussurro (`/w`), com histórico de 24 h [existe].
- Tocar em outro jogador abre o menu dele: Criar Missão (Chunin+) e Entregar [existe].
- Missão de sensei: o Chunin+ cria, o aprendiz cumpre, o sensei avalia e aprova, e o aprendiz resgata o pergaminho
  no Mestre [existe].

### 10.2 Sensei de verdade [proposta]

O sensei precisa ganhar algo, ou ninguém vai querer ensinar.

- **Pontos de Ensino:** cada missão aprovada dá ao sensei pontos que compram cosméticos de sensei (capa, bandana
  com borda, efeito de meditação) e liberam títulos: Sensei, Mestre de Muitos, Lenda da Academia.
- **Contra abuso:**
  - no máximo 3 missões avaliadas por dia;
  - o mesmo par sensei e aprendiz rende pontos 1 vez por dia;
  - pontos só quando o aprendiz realmente fez o objetivo (o servidor já confere);
  - conta nova (menos de 2 dias) não gera pontos para ninguém.

### 10.3 Equipes [proposta]

Uma **Equipe** é 1 sensei Chunin+ e até 3 aprendizes, fixa até alguém sair.

- Com a Equipe junta (no mesmo mapa, a até 10 casas), todos ganham +10% de XP.
- O sensei vê o nível e a missão de cada aprendiz.
- Quando um aprendiz vira Chunin, a Equipe ganha um título coletivo e o aprendiz pode formar a dele.

Esse sistema transforma o P2 (aprender com quem veio antes) em rotina, e não em favor.

### 10.4 Grupo e amigos [proposta]

- **Grupo** de até 4 pessoas, temporário: XP e ryō divididos entre quem está perto, com +10% por membro.
- **Lista de amigos:** quem está online, em que mapa está, e um botão para sussurrar.

### 10.5 Moderação [proposta]

O público tem menores, então a moderação não é opcional.

- Botões **Denunciar** e **Silenciar** no menu do jogador.
- Filtro de palavras no servidor e limite de mensagens [o limite existe].
- O histórico de 24 h que já existe serve de prova numa denúncia.
- Contas novas falam no chat global só depois de terminar a Academia.

---

## 11. Vilas, PvP e liderança

### 11.1 Vilas

O Criador já tem 5 vilas provisórias (`vila_1` a `vila_5`), com cores travadas. Falta dar nome, lugar e sentido.

**Problema:** hoje todos moram na mesma Vila, qualquer que seja a vila escolhida. O Arco 1 conta a história *desta*
Vila. Quando o PvP entre vilas chegar, os jogadores já terão escolhido sem saber o que isso significa.

**Opções:**

- **A (segura):** só uma vila no lançamento. O Criador mostra as outras 4 travadas, com "em breve". Elas abrem no
  Arco 2, cada uma com o seu mapa.
- **B (criativa):** as 5 vilas existem desde já como **origem**. Todos estudam nesta Vila como intercâmbio, e no
  Arco 2 cada um pode voltar à vila de origem.
- **C (experimental):** a vila não é escolhida no Criador. O jogador ganha a vila no fim do Arco 1, conforme as
  escolhas que fez.

**Decidido: A** [existe, v15]. É a mais simples de explicar e de fazer, combina com o Arco 1 e permite abrir cada
vila só quando ela tiver mapa e conteúdo. Além disso, controla a população: quem abrir a segunda vila pode ganhar um
incentivo para equilibrar. No jogo, o Criador mostra a Vila 1 e as outras 3 com cadeado ("abre com o Arco 2"), e o
servidor recusa vila travada (`VILLAGE_LOCKED`). Quem já tinha escolhido outra continua com ela.

**Nomes:** decididos pelo Victor (v16): **Folha, Névoa, Nuvem e Areia**, cada uma com uma passiva de +10%. A Pedra
existiu até a v13, quando o Victor decidiu que o jogo só terá estas quatro (25/10/2026).
As outras três vilas abrem com o módulo de vilas do fim de jogo (30 jogadores ativos na semana, ou o admin), cada
uma com o seu mapa, o seu Mestre e o seu Posto de Viagem [existe, v16]. Até lá, a decisão A acima continua valendo.
Detalhes em [endgame.md](endgame.md).

### 11.2 PvP em fases

| Fase | Onde | Como | Quando |
|---|---|---|---|
| 1. Arena da vila | arena cercada no campo de treino de cada vila | só entre ninjas DA vila; entrar é aceitar; perder não custa nada; placar de vitórias | **[existe, v15]** |
| 2. Zona de Conflito | um mapa de PvP livre, com um acampamento seguro por vila | todos contra todos, menos aliados; ranking por Elo (global e por temporada de 60 dias); morrer leva de volta para a vila, sem perder itens | **[existe, v16]**, liga com 60 ativos ([endgame.md](endgame.md)) |
| 3. Disputa de vilas | evento semanal com hora marcada | as vilas disputam pontos de controle; recompensa coletiva e cosmética | depois do Arco 2 |

**A arena da vila** (pedido do Victor, v15):

- **Onde:** o campo de treino da Vila virou uma arena de terra batida, com cerca de madeira, duas entradas (norte e
  oeste), dois pilares de pedra que servem de cobertura (param linhas e projéteis), estandartes e bancos para quem
  assiste. Cada vila nova terá a sua.
- **Quem luta:** só os ninjas da vila dona da arena, os dois dentro da cerca. Ninja de outra vila (ou quem ainda não
  criou o personagem) entra e assiste, sem bater nem apanhar. Ninguém acerta através da cerca.
- **Perder:** é treino. Sem XP, sem ryō, sem perder nada. Quem perde volta em 3 s (e não 5) na entrada oeste, com
  vida e chakra cheios, e fica 5 s sem apanhar de jogador.
- **Placar:** todos no mapa veem "⚔️ Arena: Kaito venceu Sakura." no chat, e quem lutou vê as vitórias e derrotas
  no topo da tela (desde que o servidor subiu; um ranking gravado no banco fica para depois).
- **Na tela:** entrando, o topo mostra "⚔️ arena", o 🎯 passa a focar os ninjas da vila, e os nomes e as barras de
  vida deles ficam vermelhos.

**Regras fixas:**

1. Fora da arena, a Vila, a Academia e as lojas nunca têm PvP [existe]. Mesmo com o PvP aberto ligado
   (`pvp: true`, para a fronteira do Arco 2), mapa de vila não tem PvP.
2. Ninguém perde item, ryō ou XP por morrer em PvP [existe].
3. Quem renasce fica 5 s intocável [existe].
4. Nível muito diferente (mais de 10) não ganha pontos de disputa ao derrotar alguém mais fraco.

### 11.3 Líder da vila: o Kage [existe, v16]

Decidido pelo Victor: o líder se chama **Kage** e tem poder de **diplomacia** (guerra, aliança, paz) e de
**expulsar** ninjas da vila (viram renegados). Isso muda a recomendação "só prestígio" de antes; para o poder não
virar abuso, o banco põe limites: justificativa obrigatória, no máximo 5 expulsões por semana por vila, 24 h entre
mudanças com a mesma vila, mandato de 28 dias, auditoria de tudo e a expulsão só desfeita pelo admin. As regras
completas estão em [endgame.md](endgame.md). O texto abaixo é a proposta original:

- **Mandato** de 4 semanas por vila.
- **Votam** os Genin+ da vila, um voto por conta com mais de 7 dias de jogo.
- **O líder ganha:** título, roupa de líder, uma estátua na Praça durante o mandato e o direito de escolher a meta
  do evento semanal da vila.
- **O líder não ganha:** poder sobre outros jogadores (banir, expulsar, tirar itens) nem vantagem de combate.
  Poder sobre pessoas vira abuso; prestígio, não.

**Nome do título:** [decidir] (seção 21; o risco está na seção 22).

---

## 12. Conteúdo e história

### 12.1 Estrutura dos arcos

Cada arco segue o molde do Arco 1:

- de 10 a 15 missões principais, cada uma de 5 a 15 minutos;
- uma faixa de níveis e de 1 a 3 mapas novos;
- um chefe, um título e de 3 a 4 escolhas com consequência;
- a história é **por jogador**, em fase: cada um vê o próprio arco, e a Vila continua igual para os outros.

| Arco | Níveis | Marco de rank | Estado |
|---|---|---|---|
| 1 · A Chama Apagada | 1 a 15 | Genin (M9, a Cerimônia da Chama) | [roteiro pronto] |
| 2 | 15 a 25 | primeira viagem; a segunda vila | [proposta] |
| 3 | 25 a 40 | **o Exame Chunin** como clímax | [proposta] |
| 4 | 40 a 50 | o jogador vira sensei na história | [proposta] |
| 5 | 50 a 60 | candidatura e eleição | [proposta] |

**Ganchos que o Arco 1 deixa para o Arco 2:** o que a quinta pedra prende, o que o Diretor fez com Kagerō e de que
vila é o símbolo no mapa queimado.

### 12.2 O que o sistema de história precisa ter

Vem do roteiro do Arco 1 (detalhes lá):

- progresso e flags por jogador, gravados no banco;
- caixa de diálogo com nome, expressão e até 3 escolhas;
- 8 tipos de objetivo: IR ATÉ, COLETAR, ENTREGAR, MEDITAR EM, USAR JUTSU, DEFENDER, CHEFE e ESCOLHA;
- cenas curtas: escurecer a tela, câmera parada, um som;
- um NPC que luta junto.

### 12.3 Inimigos

| Regra | Por quê |
|---|---|
| Cada inimigo tem **uma** ideia que se lê pela silhueta | na tela pequena, o jogador precisa reconhecer de longe |
| Ataque forte tem aviso no chão (seção 7.2) | justiça com a latência do celular |
| Inimigo de zona nova paga mais XP (seção 8.3) | caçar tem que valer a pena na faixa certa |
| Chefe tem fases, e cada fase muda uma regra | é o que torna o chefe memorável, e não só mais vida |

---

## 13. Direção de arte

### 13.1 Conceito: tinta e brasa

O mundo é **pixel art chibi** quente, com contorno escuro. A interface é **papel e tinta**: painéis escuros como
tinta, texto cor de papel e acento âmbar de brasa. A brasa é o Pergaminho em Chamas, o logo do jogo e o centro do
Arco 1.

**Por que funciona:**

- o chibi lê bem pequeno: cabeça grande, expressão clara e silhueta simples, num celular a meio metro do rosto;
- a interface escura não briga com o mundo colorido, e o âmbar só aparece onde há algo para fazer;
- a chama amarra a arte à história.

### 13.2 Referência → princípio → adaptação

| Referência | Princípio | Como fica no nosso jogo |
|---|---|---|
| Nin Online: mundo em salas | mapas pequenos carregam rápido e cada um tem identidade | salas com transição curta e o nome do mapa [existe]; prévia do mapa vizinho na borda [existe] |
| Estudo de ARPG no celular ([arXiv 2110.08753](https://arxiv.org/pdf/2110.08753)): o joystick é o controle mais usado; habilidades em arco na borda; recarga visível | o polegar esquerdo precisa de liberdade; o direito, de alvos grandes e previsíveis | joystick flutuante [existe]; ataque e jutsus em semicírculo [existe]; recarga em sombra girando e segundos [existe] |
| HUD de jogos complexos no celular ([Ocean View Games](https://oceanviewgames.co.uk/blog/posts/mobile-ui-design-complex-games)): HUD muda com o contexto; transição acima de 150 ms parece lenta em combate | mostrar só o que serve agora; responder rápido | na zona segura os botões de luta apagam [existe]; **proposta:** modo Vila (lojas, social) e modo luta (jutsus); animação de UI em combate ≤ 150 ms |
| Guia de HUD de MOBA ([Boostroom](https://boostroom.com/blog/hud-layout-tips-set-your-controls-like-a-pro)) | o mais usado fica sob o polegar, com espaço entre botões | Ataque Básico de 88 px, jutsus de 64, utilitários de 52 [existe]; **regra:** pelo menos 8 px entre alvos |

### 13.3 Cores

**Interface** (tokens do `public/styles.css` [existe]):

| Token | Cor | Uso |
|---|---|---|
| `--ink` | `#14110d` | fundo, tinta |
| `--panel` | `rgba(20,17,13,.78)` | painéis sobre o mundo |
| `--text` | `#f4ead8` | texto (papel) |
| `--muted` | `#b7a98f` | texto secundário |
| `--accent` | `#f0a03c` | ação principal, destaque, recompensa (brasa) |
| `--danger` | `#ff7a6b` | erro, dano, ação destrutiva |

**Função** (cada cor tem um significado e só um):

| Significado | Cor | Exemplos |
|---|---|---|
| Ação e recompensa | âmbar `#f0a03c` | botão principal, XP, ryō, "pronta para entregar" |
| Perigo e dano | vermelho `#ff7a6b` | dano recebido, vida baixa, erro |
| Cura e sucesso | verde `#4fbf6a` | cura, missão concluída, compra feita |
| Chakra e informação | azul `#3c9be0` | barra de chakra, dicas |
| Raridade e poder | roxo `#9a6be0` | jutsu de tier 4, título raro |

**Classes:** cada uma tem a sua cor (`--fire`, `--water` e as outras) [existe]. Ela aparece no ícone, no efeito do
jutsu e na borda do pergaminho.

### 13.4 Pixel art

Regras que já valem na arte do jogo (LEIAMEs em `arte/`):

- contorno escuro `#141022` em bonecos, armas e efeitos;
- escala inteira (2x, 3x...), sem suavizar; o canto do quadro cai no pixel do aparelho;
- efeitos com até 8 quadros e pixel de 1 ou 2;
- sumir com ruído (dissolver), nunca xadrez de pontinhos; cores em faixas, sem degradê liso;
- o efeito tem o tamanho da hitbox do servidor (a explosão do Fogo tem 2 casas de raio, no desenho e no cálculo).

### 13.5 Tipografia

Hoje a interface usa a fonte do sistema.

**Recomendação** [proposta]:

- **Texto e números da interface:** continuar com a fonte do sistema. Ela é a mais legível em cada aparelho e não
  pesa no carregamento.
- **Títulos** (nome do mapa, promoção, nome de missão): uma fonte **pixel** própria, desenhada no estilo do jogo,
  servida do próprio servidor (a CSP só aceita arquivos do jogo).
- **Números de dano:** fonte pixel com contorno escuro, de 16 a 20 px, legível sobre qualquer chão.

**Tamanhos mínimos no celular:** corpo 14 px, legenda 12 px, botão 16 px, título 20 px.

### 13.6 Ícones

**Problema:** os botões usam emoji (🗡️ 🔥 💧 🧘). O emoji muda de desenho em cada aparelho (Android, iPhone,
Windows), não segue o estilo pixel e alguns aparelhos antigos nem têm todos.

**Recomendação** [proposta]: um conjunto de ícones pixel de 16 x 16, desenhado em 2x ou 3x, com o mesmo contorno
`#141022`, gerado pelo mesmo processo da arte das armas.

- **Prioridade 1:** as 9 classes, o Ataque Básico, meditar, correr, trocar de kit e foco.
- **Prioridade 2:** missões, ficha, chat, configurações, inventário e loja.
- **Estados:** normal, apertado, em recarga, sem chakra (azul apagado) e travado (cadeado).

### 13.7 Botões no toque

| Estado | Como aparece |
|---|---|
| Normal | ícone com borda clara |
| Apertado | encolhe para 94% e escurece, em até 80 ms |
| Ativo (meditando, correndo) | borda âmbar acesa |
| Em recarga | sombra girando e segundos [existe] |
| Sem chakra | ícone apagado com um traço azul embaixo |
| Travado (tutorial, rank) | cadeado; tocar explica o motivo |
| Zona segura | apagado, e o topo diz "zona segura" [existe] |
| Destrutivo (redefinir atributos) | vermelho e dois toques [existe] |

---

## 14. Interface e HUD

### 14.1 Hierarquia

| Nível | O que é | Onde |
|---|---|---|
| 1 · crítico | vida, chakra, alvo focado, botões de luta, aviso de ataque no chão | sempre visível, nas bordas |
| 2 · importante | recargas, missão atual e progresso, XP | sempre visível, menor |
| 3 · secundário | chat, nome do mapa, títulos | aparece e some |
| 4 · contexto | zona segura, NPC por perto (💬), seta para o Mestre | só quando importa |

### 14.2 Tela de jogo, deitado

```
┌───────────────────────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓░░ vida        Floresta           📜 2/5   🕘  💬  📊  ⚙️ │
│ ▓▓▓▓▓░░░░░ chakra                                                 │
│ ▓▓▓▓▓▓▓░░░ alvo: Lodo                                             │
│                                                                   │
│                           (mundo)                                 │
│                                                                   │
│ chat: some em 6 s                                    🎯     🔄    │
│                                                  ②    ③          │
│                                               ①          ④       │
│   ◯ joystick                                     ( 🗡️ )   🧘      │
│     (nasce onde o polegar toca)                            🏃     │
└───────────────────────────────────────────────────────────────────┘
```

- **Margem segura:** o layout respeita `env(safe-area-inset-*)` (entalhe e barra) [existe].
- **Editável:** tamanho, opacidade e posição de cada botão, separados para deitado e em pé [existe].
- **Em pé:** funciona, mas o jogo é desenhado para deitado. Em pé, a recomendação é usar para menus e chat.

### 14.3 Telas

| Tela | Estado | Observação |
|---|---|---|
| Login e cadastro | [existe] | |
| Criador de personagem | [existe] | vilas travadas, se a opção A da seção 11.1 for escolhida |
| HUD de luta | [existe] | |
| Ficha (atributos e kits) | [existe] | |
| Inventário (🎒) | [existe] | |
| Lojas | [existe] | |
| Sala de Missões (cartões) | [existe] | |
| Painel de missões (📜) | [existe] | ganha a aba História |
| Histórico do chat | [existe] | |
| Caixa de diálogo da história | [proposta] | abaixo |
| Perfil e títulos | [proposta] | escolher o título exibido |
| Amigos, grupo e Equipe | [proposta] | |
| Mapa do mundo | [proposta] | quando houver mais de 3 mapas de luta |

### 14.4 Caixa de diálogo [proposta]

- Embaixo da tela, sobre o joystick (que fica travado durante a fala).
- Retrato do personagem com a expressão, o nome na cor dele e até 3 linhas (cerca de 120 caracteres).
- Tocar avança; segurar 1 s pula a cena. Escolhas em até 3 botões grandes, um por linha.
- O texto aparece de uma vez (sem letra por letra) quando "Reduzir movimento" está ligado.

---

## 15. Feedback e sensação de jogo

| Evento | Visual | Som [proposta] | Vibração (Android) |
|---|---|---|---|
| Acertar | número de dano e efeito do golpe [existe]; o alvo pisca branco 1 quadro [proposta] | golpe curto | nenhuma |
| Levar dano | número vermelho [existe]; borda da tela vermelha com vida abaixo de 25% [proposta] | grave | curta |
| Sem chakra, recarga, bloqueado | o botão treme e mostra o motivo [proposta] | clique seco | nenhuma |
| Subir de nível | coluna de luz no boneco e texto grande [proposta] | fanfarra curta | dupla |
| Subir de rank | cena: tela escurece, bandana, anúncio para todos [anúncio existe] | tema da vila | longa |
| Missão concluída | carimbo no pergaminho da missão [proposta] | carimbo | curta |
| Compra | o item voa para a 🎒 [proposta] | moedas | nenhuma |
| Morrer | a tela perde a cor e mostra a contagem de 5 s [proposta] | tambor | longa |

- **Som:** o jogo não tem áudio hoje. A recomendação é começar com 12 a 15 efeitos curtos e uma música por mapa,
  com volume separado para efeitos e música, e tudo desligado até o primeiro toque (regra dos navegadores).
- **Vibração:** só funciona no Android (o Safari do iPhone não vibra). Ela é um reforço, nunca a única pista.
- **Tremida de tela:** no máximo 2 px e 120 ms, só no dano recebido forte e na explosão do chefe.

---

## 16. Monetização

Antes das opções, as **regras fixas**, que valem em qualquer caso:

1. **Nunca vender poder:** XP, ryō, pergaminhos, jutsus, atributos e armas não se compram com dinheiro.
2. **Nunca caixa de recompensa paga.** O ECA Digital (Lei 15.211/2025) proíbe caixas de recompensa em jogos para
   menores de 18 anos ou com acesso provável por eles (art. 20, regulamentado pelo Decreto 12.880/2026), e já
   vale desde 17 de março de 2026 ([TecMundo](https://www.tecmundo.com.br/voxel/502437-loot-boxes-serao-proibidas-no-brasil-apos-sancao-de-lula-entenda-impacto-da-lei-felca-nos-games.htm),
   [Machado Meyer](https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/direito-digital/estatuto-digital-da-crianca-e-do-adolescente-lei-n-15-211-2025-entra-em-vigor-em-17-de-marco-de-2026)).
   O público deste jogo inclui adolescentes, então isso é obrigatório.
3. **Preço em reais, à vista.** O jogador vê quanto custa o que vai comprar, sem moeda intermediária que esconda o
   valor.
4. **Consentimento dos pais** em compras de menores, como pede o Marco Legal dos Jogos Eletrônicos
   (Lei 14.852/2024).
5. **Conferir com um advogado** antes de vender qualquer coisa. Este documento não é parecer jurídico.

**Opções:**

- **A (segura): sem venda.** O jogo é gratuito, com apoio voluntário (Pix ou financiamento coletivo) e o título
  cosmético "Apoiador". Risco legal mínimo, receita baixa.
- **B (criativa): loja de cosméticos.** Roupas, cores especiais, efeitos de meditação, molduras de nome e poses,
  com preço fixo e o item mostrado no boneco antes da compra. Pode ter um **passe de temporada cosmético** que não
  some: o que não foi pego volta depois, na loja.
- **C (experimental): assinatura de apoiador.** Um valor mensal que dá 1 cosmético por mês e conveniências que não
  afetam o combate (mais espaço no histórico do chat, mais cores salvas no Criador).

**Recomendação: começar com A e passar para B quando houver jogadores fiéis** (fase 4 do roadmap). O jogo roda
no navegador, então não paga a taxa das lojas de aplicativo, e um pagamento por Pix com um provedor brasileiro já
resolve. Cosmético combina com o pilar P4: a roupa e a bandana são a identidade do jogador.

**Como a loja aparece** [proposta]: um botão na Alfaiataria e no menu, nunca um aviso que se abre sozinho no meio
da luta. Sem contagem regressiva falsa nem "só hoje".

---

## 17. Acessibilidade

| Necessidade | Solução | Estado |
|---|---|---|
| Mãos e telas diferentes | HUD editável: tamanho, opacidade, posição | [existe] |
| Daltonismo | nenhuma informação só por cor: vida baixa tem ícone; inimigo tem marca no chão; recarga tem número | [parcial] |
| Baixa visão | escala do texto de 100% a 150%; números de dano com contorno | [proposta] |
| Movimento e enjoo | opção "Reduzir movimento": sem tremida, sem flashes, texto de uma vez | [proposta] |
| Fotossensibilidade | no máximo 3 flashes por segundo em qualquer efeito | [proposta, regra para a arte] |
| Surdez | todo som importante tem sinal visual; diálogos são texto | [existe o texto] |
| Teclado no computador | todas as ações com tecla | [existe] |

---

## 18. Desempenho

O jogador está num celular comum, muitas vezes com bateria e internet fracas.

| Item | Orçamento | Estado |
|---|---|---|
| Quadro | p95 até 21 ms andando na Vila (medido no Chromium sem GPU) | [existe] |
| Mundo | blocos de 16 x 16 casas pré-desenhados; no máximo 2 novos por quadro | [existe] |
| Bonecos | 2 atlas pequenos, recolor em cache por visual | [existe] |
| Efeitos | até 8 quadros; **proposta:** no máximo 40 efeitos ao mesmo tempo, os mais antigos somem | [parcial] |
| Rede | entradas em lotes (cerca de 10 mensagens/s andando, nada parado); `welcome` de ~7 KB | [existe] |
| Bateria | parar de desenhar com a aba escondida; 30 fps em "economia de bateria" | [proposta] |
| Carregamento | jogo jogável em até 5 s no 4G; arte carrega depois, com o desenho simples no lugar | [parcial] |

---

## 19. Métricas

O que medir para saber se o design funciona. Só números agregados e o mínimo de dados pessoais (LGPD): nada de
e-mail ou conversa na telemetria.

| Pergunta | Métrica |
|---|---|
| O tutorial funciona? | % que termina cada sala da Academia (`tutorial_step` já existe) |
| O jogador volta? | retenção no dia 1, 7 e 30 |
| A curva está certa? | tempo real por nível contra a tabela 8.2 |
| A história prende? | % que conclui cada missão do Arco; onde abandona; mortes por missão |
| A economia está saudável? | ryō que entrou e saiu por dia; preço médio pago por item |
| O social funciona? | % de Genin com sensei; missões de sensei por semana; tamanho médio das Equipes |
| O PvP é justo? | duelos por dia; vitórias por classe; denúncias por PvP |

---

## 20. Roadmap

| Fase | Objetivo | Conteúdo | Pronto quando |
|---|---|---|---|
| 0 · Base | o jogo roda | servidor, combate, Academia, lojas, arte chibi, armas e efeitos | [feito] |
| 1 · Arco 1 jogável | motivo para voltar | sistema de história, diálogo, 8 objetivos, inimigos e mapas do Arco 1, Tsubaki e Kagerō, ícones pixel. **Já feito (v15):** XP por participação, monstros por jogador, armas com jeito próprio, proteção contra azar, teto de controle, vilas travadas, arena da vila | um jogador novo vai do login ao título Guardião da Chama sem ajuda, em 5 a 6 horas |
| 2 · Social | jogar junto | grupo, amigos, recompensa do sensei, Equipes, ranking da arena gravado, denunciar e silenciar, som | metade dos Genin tem sensei ou grupo na primeira semana |
| 3 · Arco 2 e vilas | rivalidade | **já feito (v16, liga com a população):** quatro vilas (a Pedra saiu na v13) e viagem, Kage eleito, diplomacia, Zona de Conflito, renegados, Akatsuki. Falta: a história do Arco 2 | a primeira eleição acontece e a Zona tem gente toda semana |
| 4 · Temporadas | durar | **já feito (v16):** temporadas de PvP de 60 dias com recompensas e capas. Falta: evento semanal da vila, disputa de vilas, loja de cosméticos (se B), mercado | retenção de 30 dias estável por 3 meses |

**Antes de abrir para o público:** busca do nome no INPI (seção 22), termos de uso, política de privacidade e
classificação indicativa.

---

## 21. Decisões

| # | Decisão | Opções | Estado |
|---|---|---|---|
| 1 | Nome do jogo | manter "Nin Online Mobile" / nome próprio | **decidido: Vontade do Fogo** (nota na seção 22) |
| 2 | Título do líder da vila | "Hokage" / título próprio | **decidido: Kage** (Victor, v16; risco na seção 22) |
| 3 | Nomes das vilas | a criar | **decidido: Folha, Névoa, Nuvem e Areia** (Victor, v16; a Pedra saiu na v13; risco na seção 22) |
| 4 | Vila no Criador | A travar / B origem / C ganhar no Arco 1 | **decidido e feito: A** (seção 11.1) |
| 5 | Modelo de PvP | arena da vila, depois fronteira e disputa / PvP livre / sem PvP | **decidido e feito: arena em cada vila (v15) e a Zona de Conflito com ranking e temporadas (v16)** |
| 6 | Monetização | A / B / C | **decidido: A agora, B depois** |
| 7 | XP do abate | último golpe / participação | **decidido e feito: participação** |
| 8 | Troca entre jogadores | livre / nenhuma / mercado depois | **decidido: nenhuma no lançamento; mercado na fase 4** |
| 9 | Proteção contra azar na Extração | sim / não | **decidido e feito: +10 pontos por falha** (migração v10) |
| 10 | Identidade das armas | só dano / jeito de lutar | **decidido e feito: jeito de lutar** (seção 7.5) |
| 11 | Poder do líder da vila | prestígio / poder sobre jogadores | **mudou (Victor, v16): diplomacia e expulsão, com limites no banco** (seção 11.3) |

---

## 22. Riscos

| Risco | Por que importa | Como reduzir |
|---|---|---|
| **Nome** | O nome antigo, "Nin Online", é de um jogo de outra empresa (Hitspark), na Steam desde junho de 2025 ([Steambase](https://steambase.io/games/nin-online/info), [itch.io](https://ninonline.itch.io/nin-online)); por isso virou **Vontade do Fogo**. O nome novo tem um risco menor, mas existe: "Vontade do Fogo" é como a dublagem brasileira de Naruto traduz "Will of Fire", um conceito central da série | antes de abrir ao público, buscar o nome no INPI e, se possível, registrar a marca; evitar no jogo o símbolo e o discurso da "Vontade do Fogo" de Naruto (a nossa vontade é a chama do Pergaminho em Chamas) |
| **Termos de outras obras** | Kage, Akatsuki, renegado, Folha, Areia, Névoa e Nuvem (v16) vêm de Naruto. Genin, Chunin e Jonin são ranks ninja históricos, com menos risco | para jogar entre amigos, sem cobrar, o risco é baixo; antes de abrir ao público, trocar os nomes, que ficam num lugar só (`villages.ts`, `akatsuki.ts` e o catálogo do banco) |
| **MMO vazio** | com poucos jogadores online, PvP e sensei não acontecem | tudo do Arco 1 dá para fazer sozinho; o NPC luta junto; monstros escalam com o mapa; um servidor só |
| **Estado em memória** | um deploy derruba todos e a posição volta ao início | publicar fora do horário de pico; avisar no chat antes; no futuro, gravar o mapa e a posição |
| **Chat e menores** | toxicidade e contato indevido | moderação da seção 10.5 desde a fase 2 |
| **Escopo** | uma pessoa (com IA) fazendo um MMO | seguir as fases, uma de cada vez; cada fase tem um "pronto quando" |
| **Trapaça** | robôs e programas de velocidade | o servidor decide movimento, dano e preço [existe]; sem troca no lançamento |
