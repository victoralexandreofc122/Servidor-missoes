# Brainstorm: PvP rankeado, Campo de Guerra, invocações, classes e mapas

Pedido do Victor (nov/2026): invocações no estilo Naruto, Campo de Guerra, PvP rankeado 1x1 e 3x3 com fila,
espectadores e mapa exclusivo no Vale do Fim, mapas melhores sem perder a identidade, arena de treino maior, pelo
menos 4 habilidades distintas por classe e um PvP **fluido, rápido, estratégico e divertido**.

Este documento é proposta: nada aqui está no jogo. Os números são ponto de partida para testar, não verdade. Base do
que já existe: `docs/endgame.md` (Zona de Conflito, MMR, temporadas), `docs/habilidades.md` (efeitos, teto de
controle, mira em 4 direções), `docs/design-do-jogo.md` 7.2 a 7.5 (classes, atributos, armas) e `docs/netcode.md`
(compensação de lag).

---

## 0. Pilares do PvP (a régua de todas as decisões)

| Pilar | O que significa na prática | Como medir |
|---|---|---|
| **Fluido** | o golpe sai no toque, a esquiva funciona, nada trava | 95% dos comandos respondidos em < 120 ms no servidor; zero "teleporte" visível |
| **Rápido** | partidas curtas, fila curta, voltar a jogar é 1 toque | 1x1: 1,5 a 3 min; 3x3: 4 a 6 min; espera na fila < 90 s com 20 pessoas online |
| **Estratégico** | escolher kit, posição e hora de gastar o recurso decide mais que o atributo | taxa de vitória por classe entre 45% e 55%; vence quem acerta mais, não quem tem mais nível |
| **Divertido** | toda luta tem virada possível e momento de "uau" | % de partidas decididas nos últimos 20 s; replays compartilhados; volta à fila depois de perder |

Regras que já existem e continuam: **tempo para matar de 6 a 10 s** entre iguais, **sem golpe que mate de uma vez**,
**teto de controle** (atordoar/prender de novo dura metade, um quarto, depois nada), **nunca vender poder**.

---

## 1. PvP Rankeado no Vale do Fim

### 1.1 Fluxo do jogador (do botão à recompensa)

1. Em qualquer vila, o **Posto de Viagem** (ou um botão "Batalhar" no menu) leva ao **Vale do Fim**, um mapa só de PvP.
2. Lá existe um **mirante** (zona segura, arquibancada nas encostas) onde todos esperam.
3. O jogador toca em **Batalhar** e escolhe **1x1** ou **3x3** (3x3: sozinho ou com grupo de 2 ou 3).
4. Entra na **fila**. Enquanto espera, **assiste** às partidas em andamento (lista de lutas ao vivo, câmera livre).
5. Partida encontrada: aviso com som e vibração, **10 s para aceitar**. Quem recusa ou deixa passar fica 2 min fora da
   fila (e a fila do outro volta ao começo, sem perder posição).
6. **Preparação (15 s):** vê a classe dos adversários e troca de kit (só os 2 kits que já tem).
7. **Partida** numa **instância** própria do vale (o mapa da luta é uma cópia; o mirante continua lotado).
8. **Resultado:** MMR que subiu ou caiu, estatísticas (dano, cura, controle, acertos), botão "Jogar de novo".

### 1.2 Formatos

| | 1x1 (Duelo) | 3x3 (Equipe) |
|---|---|---|
| Vitória | melhor de 3 rodadas | melhor de 3 rodadas |
| Rodada | até um cair; teto de 75 s | até uma equipe cair inteira; teto de 120 s |
| Desempate no teto | a **água sobe** no vale (ver 1.4): a área encolhe a cada 5 s | igual, e depois vence quem tiver mais vida somada |
| Entre rodadas | 5 s, vida e chakra cheios, tempo de recarga zerados | igual |
| Invocações | **não** (1x1 é o teste puro de habilidade) | **sim**, 1 por jogador (ver seção 3) |
| Meditação | **desligada** (o chakra volta 2% por segundo sozinho na arena) | igual |
| Itens de cura | desligados | desligados |

Por que melhor de 3: uma rodada é rápida o bastante para não cansar, e a segunda dá chance de virar depois de entender
o adversário. É o que faz a luta ser estratégica sem ficar longa.

### 1.3 Igualdade (o rankeado mede habilidade, não tempo de jogo)

- **Nível nivelado:** dentro da partida todo mundo luta como nível 60, com os **próprios pontos de atributo
  redistribuídos proporcionalmente** (quem é nível 30 com 60% em Ninjutsu vira nível 60 com 60% em Ninjutsu).
- **Jutsus:** liberados todos os tiers que o jogador já aprendeu; quem não tem o tier 4 luta com o que tem. Alternativa
  a decidir: no rankeado, todo mundo tem os 4 jutsus da própria classe (a Extração vira só para o mundo aberto).
- **Armas e roupas:** armas mantêm o *jeito* (arco, alcance, recarga), mas o dano é igualado ao da Espada Curta.
  Roupas são só visuais (já é a regra).
- **Entrada:** a partir do nível 20 (já tem classe e kit montado) e com as 10 primeiras partidas de colocação.

### 1.4 O mapa: Vale do Fim (versão de arena)

Inspirado no vale do anime: duas estátuas gigantes frente a frente, uma cachoeira no meio e o rio entre elas. A arena
é **simétrica** (ninguém começa com vantagem) e **otimizada para leitura**: chão claro, poucos detalhes no caminho.

```
 1x1: 22 x 16 casas            3x3: 30 x 22 casas (o mesmo vale, mais largo)

  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓       ▓ = paredão (borda)
  ▓ A .  ▲  . ≈≈ .  ▲  . B ▓   A/B = nascimento de cada lado
  ▓ . .  .  . ≈≈ .  .  . . ▓   ▲ = pedra (cobertura: para linha e projétil)
  ▓ ■ .  .  . ≈≈ .  .  . ■ ▓   ■ = cabeça caída de estátua (cobertura grande)
  ▓ . .  ▲  . ≈≈ .  ▲  . . ▓   ≈ = rio raso (anda a 80%; Água +10% de dano dentro)
  ▓ . . ═══════════════ . . ▓   ═ = ponte de pedra (anda normal sobre o rio)
  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
```

- **Cobertura:** 4 pedras e 2 cabeças de estátua quebradas. As habilidades em linha param na pedra (a linha de
  visão já existe no jogo). Cobertura é o que deixa o PvP estratégico: dá para escapar de um Relâmpago, mas quem
  se esconde demais toma Fogo em área.
- **Rio no meio:** atravessar custa tempo (80% de velocidade) e a ponte é o caminho rápido, mas é estreita e
  previsível. Cria decisão: arriscar a ponte ou molhar os pés.
- **Água que sobe (fim da rodada):** a partir do teto de tempo, o rio transborda do centro para fora; quem fica na
  água transbordada perde 4% da vida por segundo. Obriga o encontro, sem tirar a chance de virar.
- **Mirante (fora da instância):** as encostas com as estátuas inteiras ao fundo, arquibancada, o painel da fila, o
  quadro do ranking da temporada e um NPC "Juiz do Vale".

### 1.5 Fila e pareamento (matchmaking)

- **Por MMR da temporada** (o que já existe), separado por formato: MMR 1x1 e MMR 3x3.
- A janela começa em ±100 de MMR e **abre 50 a cada 15 s** de espera, até ±400. Depois de 90 s, aceita qualquer um
  (com MMR que vale menos: perde e ganha metade).
- **3x3:** a soma do MMR das equipes; grupo pré-formado ganha +50 de MMR "de grupo" (time combinado é mais forte).
- **Contra trapaça** (reaproveita as regras da Zona de Conflito): a mesma dupla conta no máximo 3 vezes por dia,
  conta de admin fora do ranking, e quem **sai no meio** perde como derrota e fica 5 min fora da fila (10, 20, 40 se
  repetir no dia).
- **Elo:** K = 32 nas 10 primeiras partidas, depois 20. Vitória por 2 x 0 vale 15% a mais.

### 1.6 Espectadores

- No mirante, um painel lista as **lutas ao vivo** (formato, nomes, classes, MMR, placar de rodadas).
- Tocar numa luta entra como **espectador**: câmera livre dentro da instância, sem colisão e invisível.
- **Atraso de 3 s** no que o espectador vê (para ninguém passar informação a um amigo que está lutando).
- Chat dos espectadores separado do chat dos lutadores; reações rápidas (👏🔥😮) que aparecem para quem assiste.
- Técnica: o servidor já manda o estado de cada mapa; o espectador vira um "cliente sem corpo" que só recebe o
  estado da instância, guardado 3 s num anel de quadros.

### 1.7 Recompensas

- **Temporada** (60 dias, já existe): títulos e Manto do Campeão continuam, agora por formato (1x1 e 3x3).
- **Faixas de MMR com nome** (mostradas no perfil e sobre o nome no Vale): Aspirante, Genin de Arena, Chunin de
  Arena, Jonin de Arena, Elite, Sannin (top 10). Cada uma dá uma moldura de retrato e uma pose de vitória.
- **Por partida:** um pouco de ryō (só se a partida tiver mais de 60 s, para não farmar desistência) e nada que dê
  poder. Nunca XP de combate nem pergaminho.

---

## 2. Campo de Guerra (batalha em larga escala)

O rankeado é a luta pequena e justa. O **Campo de Guerra** é a guerra grande e caótica, o evento da semana.

- **Quando:** sábado e domingo, 2 janelas de 1 hora, anunciadas no jogo (como os eventos globais do `endgame.md`).
- **Quem:** duas alianças de vilas (pelo estado da diplomacia), até 20 por lado. Sem nível nivelado: aqui o progresso
  conta, e o pareamento equilibra pelo número e pela soma de níveis.
- **Mapa:** um campo largo (por exemplo 80 x 60 casas) com **3 Selos de Chakra** para capturar (ficar perto deles por
  10 s sem inimigo). Cada selo dominado soma pontos por segundo; o lado que chegar a 1.000 vence.
- **Ritmo:** renasce na base em 8 s; a base tem uma barreira que só os donos atravessam.
- **Onde as invocações brilham:** no Campo de Guerra vale a **Grande Invocação** (seção 3.4), uma por lado por vez.
- **Recompensa:** ryō e reputação da vila (conta para a política e para o Kage), nunca poder.

---

## 3. Invocações (estilo Naruto)

### 3.1 Ideia

Cada ninja pode firmar **um contrato** com uma família de animais. A invocação é um **5º botão** (não ocupa slot do
kit): selos de mão (0,6 s, interrompível) + um corte no dedo (custa 5% da vida) e o animal aparece ao lado. Ela tem
vida própria, segue o dono e tem 2 ações. Não substitui o jogador: é um parceiro de papel definido.

### 3.2 As famílias (nomes genéricos de animal, sem risco de marca)

| Família | Papel | Ação automática | Ação comandada (toque no botão de novo) |
|---|---|---|---|
| **Sapo** | linha de frente | provoca: inimigos a 2 casas batem nele por 1,5 s | **Óleo**: cone que deixa o chão escorregadio (lentidão 40%, 3 s); Fogo no óleo explode |
| **Cobra** | controle | morde e aplica **veneno** (dano no tempo + `ferida`, cura pela metade) | **Bote**: linha de 4 casas que prende o primeiro inimigo por 1 s (entra no teto de controle) |
| **Lesma** | suporte | regeneração de 2% por segundo no dono e aliados a 2 casas | **Dividir**: a lesma se parte e põe um pedaço em cada aliado (escudo pequeno) |
| **Cão ninja** | caçador | persegue o alvo focado e **marca** (revela quem ficou invisível ou usou Substituição) | **Faro**: mostra no mapa por 4 s todos os inimigos a 12 casas |
| **Falcão** | batedor e dano de longe | voa por cima da cobertura e bica de longe | **Mergulho**: avança em linha 6 casas e empurra o atingido |
| **Tartaruga** | proteção | fica parada e vira muro (bloqueia linha e projétil) | **Casco**: o dono entra no casco 1,5 s (imune, sem agir) |

### 3.3 Regras para não quebrar o PvP

- **1 invocação por vez**, duração de **20 s** ou até cair; recarga de **40 s** a partir de quando some.
- A invocação tem **30% da vida do dono** e causa no máximo **25% do dano por segundo do dono**: ajuda, não decide.
- Pode ser **alvo** (morrer cedo é jogada válida do adversário); controlar a invocação **não** gasta o teto de
  controle do dono.
- **1x1 rankeado: proibido.** **3x3 rankeado: permitido**, e a fase de preparação mostra o contrato de cada um.
- O cliente desenha o animal com o mesmo esqueleto palito (rig 3D) de 4 patas ou de voo; o servidor só simula um
  "monstro aliado" (a máquina de estados dos monstros já existe: parado, persegue, ataca, volta).

### 3.4 Grande Invocação (só no Campo de Guerra e em chefes)

O animal **gigante** da família, 6 x 6 casas, ocupa o centro da batalha por 25 s e faz um golpe marcado no chão
(círculo de aviso de 1 s, como o Lodo Escuro). Exige 3 aliados canalizando juntos por 2 s (interrompível). É o
"momento uau" do fim de semana.

### 3.5 Como se consegue

- **Missão de contrato** (uma por família, a partir do Chunin): um pequeno arco onde o animal testa o ninja (o Sapo
  pede força, a Lesma pede cuidar de aliados, o Cão pede encontrar alguém escondido...).
- **Trocar de contrato:** custa ryō e 7 dias de espera (decisão com peso, sem trancar ninguém para sempre).
- Sobe de nível pelo uso, como os jutsus da Academia (100, 500 e 2.000 usos), com +10% por nível.

---

## 4. Classes: 4 habilidades distintas em cada uma

Hoje cada classe tem 4 jutsus, mas os 4 tiers usam **a mesma mecânica** (o tier só aumenta os números). A proposta é
cada tier virar uma **habilidade diferente**, com papel próprio no kit. O padrão para todas:

| Slot | Função | Recarga típica |
|---|---|---|
| **1. Base** | o golpe de assinatura, dano confiável | 2 a 4 s |
| **2. Movimento ou defesa** | entrar, sair ou aguentar | 8 a 12 s |
| **3. Controle ou utilidade** | criar a janela | 10 a 14 s |
| **4. Técnica final** | o momento decisivo, com conjuração de 0,8 s (selos), interrompível | 30 a 45 s |

Os nomes são de trabalho; o que importa é o comportamento.

| Classe | 1. Base | 2. Movimento/defesa | 3. Controle/utilidade | 4. Final (selos 0,8 s) |
|---|---|---|---|---|
| **Fogo** | Bola de Fogo (linha, explode, queimadura) | Passo em Chamas: avanço curto que deixa rastro de fogo | Muralha de Fogo: parede de 3 casas por 3 s que queima e bloqueia passagem | Dragão de Fogo: linha larga que deixa o chão em chamas 3 s (kunais que passam viram de fogo) |
| **Água** | Jato em cone (empurra, molha) | Clone de Água: fica no lugar e você recua 3 casas; o clone recebe o próximo golpe | Prisão de Água: esfera que segura o alvo 1,2 s (o dono não pode andar enquanto segura) | Onda: cone grande que empurra todos e molha (prepara o combo com Relâmpago) |
| **Relâmpago** | Raio em linha (paralisia, combo molhado) | Corrida Relâmpago: 3 casas instantâneas na direção | Rede Elétrica: área que paralisa quem entrar em 1,5 s | Lança do Trovão: linha de alcance máximo que atravessa todos; dobra no molhado |
| **Pedra** | Punho de Rocha: golpe curto que derruba (atordoa 0,4 s) | Pele de Pedra: escudo (o que já existe) | Muro de Terra: ergue uma pedra (cobertura temporária, 4 s) | Prisão de Terra: cúpula em volta de um alvo por 2 s (ninguém entra, ninguém sai) |
| **Sombra** | Linha de Sombra (prende o primeiro) | Passo na Sombra: troca de lugar com a própria sombra marcada antes | Sombra que Estrangula: o preso perde 3% da vida por segundo e fica lento | Teia de Sombras: prende todos numa área de 3 casas por 1,5 s (no teto de controle) |
| **Ilusão** | Olhar Hipnótico: cone curto que atordoa | Desaparecer: invisível 2 s (quebra ao atacar; o Cão revela) | Labirinto: silêncio em área (já existe no tier 3) | Mundo Falso: o alvo vê os controles invertidos por 2 s |
| **Taijutsu** | Investida e golpe (o que já existe) | Esquiva: 1 golpe evitado nos próximos 1,5 s | Chute Ascendente: joga o alvo para cima (atordoa 0,6 s) e prepara combo | Portões: 6 s com +30% de velocidade e dano, perdendo 2% da vida por segundo |
| **Armas** | Kunais (3 trilhas paralelas) | Kunai Marcada: arremessa e teleporta para ela até 4 s depois | Armadilha de Fios: fio no chão que prende quem passar | Chuva de Lâminas: área grande depois de 0,8 s de aviso no chão |
| **Cura** | Palma Curadora (cura o foco) | Passo de Socorro: avança até um aliado e dá escudo | Selo de Dissipação: tira 1 efeito ruim do aliado ou 1 bom do inimigo | Renascer: o próximo aliado que cairia em 6 s fica com 1 de vida e 2 s imune |

**Combos entre classes** (já começaram com Água + Relâmpago): Fogo + Óleo do Sapo, Água apaga a queimadura, Sombra +
Ilusão (preso e atordoado fica lento), Pedra + Fogo (o muro em chamas vira parede que queima). Combos são o que faz o
3x3 ser estratégico: a composição da equipe importa.

---

## 5. Equilíbrio: dano, atributos, pontos e hitbox

### 5.1 Orçamento de dano (para comparar classes com uma régua só)

- **Vida de referência:** a de um nível 60 com distribuição média (o nivelamento do rankeado usa essa base).
- **Tempo para matar:** 6 a 10 s de dano sustentado de um contra um, sem esquiva. Cada classe recebe um **orçamento
  de dano por segundo**: as de dano à distância perto de 1,0, as de perto 1,1 (correm mais risco), as de controle
  0,8, as de proteção 0,7.
- **Teto de explosão:** nenhuma sequência de 2 s pode tirar mais de **45% da vida** (garante que sempre há tempo de
  reagir). Isso vira um teste automático: simular as sequências de cada kit contra o boneco de referência.
- **Controle:** cada classe tem um "orçamento" de no máximo ~2,5 s de controle duro a cada 15 s. O teto de controle
  que já existe impede a soma de dois controladores virar prisão eterna.

### 5.2 Atributos e pontos

- Os 6 atributos continuam (Vitalidade, Chakra, Agilidade, Taijutsu, Ninjutsu, Armas), com rendimento decrescente.
- **Regra de design que já existe:** para cada classe, pelo menos duas distribuições boas. Proposta de teste: para
  cada classe, montar 3 distribuições (ofensiva, equilibrada, resistente) e conferir no simulador que a melhor não vence
  as outras com mais de 60%.
- **Agilidade:** hoje dá velocidade (com teto). No PvP a velocidade é o atributo mais perigoso (decide quem alcança e
  quem foge). Proposta: no rankeado a velocidade é igual para todos e a Agilidade vira **recarga de movimento** (o
  slot 2 volta mais rápido) e **chance de esquiva de projétil de 5% a 10%**, sem teto absurdo.
- **Redefinir pontos** (500 ryō, já existe): grátis uma vez por temporada, para quem quer experimentar no rankeado.

### 5.3 Hitbox e acerto

- **Corpo do ninja:** círculo de 0,45 casa de raio, igual para todos, qualquer visual (roupa larga ou arma grande
  nunca aumentam o alvo). O sprite novo (pés na linha 88, 64 x 96) usa o mesmo círculo nos pés.
- **Projétil em linha:** largura de 0,6 casa (um pouco generosa: no celular, errar por 1 pixel frustra). A prévia em
  ciano já mostra a largura exata.
- **Golpe corpo a corpo:** arco e alcance da arma (já existe), conferidos com a compensação de lag até 150 ms; acima
  disso, vale onde o alvo estava há 150 ms (protege quem tem boa conexão).
- **Aviso no chão:** todo golpe que tira mais de 25% mostra a área por pelo menos 0,5 s (regra que já existe no PvE,
  vira regra também para as técnicas finais).

### 5.4 Como afinar depois de lançar

- Registrar por partida: classe, kit, invocação, dano, cura, controle aplicado e sofrido, acertos e erros de cada
  habilidade, quem venceu.
- Painel do Admin: taxa de vitória por classe e por faixa de MMR, habilidade mais usada e menos usada, partidas que
  chegaram ao teto de tempo.
- **Ajuste a cada 2 semanas**, em passos pequenos (5% a 10%), com uma nota de atualização curta no jogo.

---

## 6. Mapas melhores feitos com o Claude

### 6.1 O processo (sem perder a identidade)

1. **Folha de identidade por região** antes de mexer: paleta, materiais, silhueta dos prédios e elementos marcantes
   (Folha: madeira clara, telhados vermelhos e verdes, árvores enormes e o paredão com rostos de pedra; Névoa: tábuas
   molhadas, neblina e lagoas; Areia: arenito e cúpulas; Nuvem: pedra cinza e pontes no alto).
2. **Planta em código** (o servidor já pega tudo da planta: paredes, arena, zona segura): o Claude propõe a planta
   nova, roda os testes de caminho (toda área alcançável, nada preso) e mostra a prévia.
3. **Arte por blocos** (o chão já é desenhado em blocos de 8 x 8 casas): cada bloco novo comparado lado a lado com o
   antigo e com a folha de identidade, como foi feito com o boneco.
4. **Leitura de jogo primeiro:** chão do caminho mais claro e liso que a decoração; obstáculos com contorno; nada que
   pareça parede sem ser.

### 6.2 Arena de treino maior em cada vila

| | Hoje | Proposta |
|---|---|---|
| Área de luta | ~16 x 15 casas (cerca de 17 x 16) | **28 x 22 casas** |
| Cobertura | 2 pilares | 4 pilares + 2 pedras baixas (param projétil, não bloqueiam a visão) |
| Extras | | **bonecos de treino** com a vida de referência (mostram o dano por segundo), **raia de mira** com alvos em 4 direções, **quadro de duelo**: desafiar alguém para 1x1 de treino (não conta MMR) |
| Entradas | 2 de 3 casas | 3 de 4 casas e uma arquibancada para quem assiste |

Na Folha o campo de treino é no canto de baixo à direita (mapa de 80 x 80): dá para crescer para dentro do campo sem
mexer em ruas. Cada vila ganha a sua arena com o tema dela (terra batida na Areia, deque sobre a água na Névoa...).

---

## 7. Ordem sugerida (do que dá mais retorno para o PvP primeiro)

| Fase | O que entra | Por quê primeiro |
|---|---|---|
| **1. Base do rankeado** | arena de treino maior, bonecos com dano por segundo, hitbox única, orçamento de dano, registro das lutas | sem números e testes, qualquer equilíbrio é chute |
| **2. Duelo 1x1 rankeado** | Vale do Fim (instância 1x1), fila, MMR do formato, melhor de 3, nível nivelado, espectador | o formato mais simples de equilibrar e de testar com poucos jogadores |
| **3. Classes com 4 habilidades** | o kit novo de cada classe, uma classe por vez, testada no 1x1 | o 1x1 mostra rápido o que está forte demais |
| **4. Equipe 3x3** | instância maior, pareamento de grupo, combos | depende das classes estarem estáveis |
| **5. Invocações** | contratos, famílias, missão de contrato, só no 3x3 e no mundo | camada nova em cima de um PvP que já funciona |
| **6. Campo de Guerra** | mapa grande, selos, Grande Invocação, evento de fim de semana | precisa de gente online (a ativação por população do `endgame.md` decide quando abre) |
| **7. Mapas** | revisão das vilas e regiões, uma por vez | em paralelo, sem bloquear o PvP |

---

## 8. Riscos

- **População:** fila 3x3 precisa de pelo menos 6 pessoas ao mesmo tempo na mesma faixa de MMR. Com pouca gente, o
  1x1 vem antes e o 3x3 abre por horário (por exemplo, à noite).
- **Escopo:** 36 habilidades novas (9 classes x 4) é muito. Fazer uma classe por vez e manter as antigas até a nova
  passar no teste.
- **Celular:** 3x3 com 6 bonecos, invocações e efeitos pesa no aparelho. Limite de partículas por partida e
  invocações desenhadas em cache (como o boneco).
- **Propriedade intelectual:** "Vale do Fim", contratos de animais e a Grande Invocação deixam o jogo ainda mais
  perto de Naruto. Como hoje: nomes num lugar só, fáceis de trocar ("Vale dos Guardiões", por exemplo).
- **Trapaça:** o servidor já é autoritativo (dano, alcance e acerto são dele); falta só o registro das partidas para
  achar padrões estranhos.

---

## 9. Decisões do Victor (nov/2026)

- **Jutsus no rankeado:** cada um luta com os tiers que **já aprendeu** (sem liberar tudo na partida).
- **Formato:** **melhor de 3 rodadas**.
- **Ordem:** seguir as fases da seção 7.
- Próximo passo: passar este brainstorm pelo método EGM (esclarecimento, revisão por "Goldfish" em contexto limpo e
  `concepts_brief.md`).

## 9b. Decisões ainda abertas

2. **1x1 com ou sem invocação?** (proposta: sem)
4. **Agilidade sem velocidade no rankeado** (vira recarga de movimento e esquiva)?
5. **Quais famílias de invocação** entram primeiro (proposta: Sapo, Cobra e Lesma, um de cada papel)?
6. **Campo de Guerra** só no fim de semana ou todo dia num horário fixo?
7. **Ordem das fases** acima, ou alguma outra prioridade (por exemplo, invocações antes do 3x3)?
