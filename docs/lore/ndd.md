# Documento de Design Narrativo (NDD): Herança do Fogo

* **Status:** 15/11/2026. Livro de regras da história interativa. O mundo está em `biblia-do-mundo.md`; as vozes, em
  `personagens.md`; os textos que o jogo mostra, em `dialogos.csv`.
* **Método:** os 5 passos do NDD do "Manual Definitivo de Design Narrativo": premissa e pilares, espinha autoral, ramos e
  nós de decisão, pontos ambientais, regras sistêmicas.

---

## 1. Premissa e pilares

**Premissa (uma frase).** Um cadete da Aldeia da Chama Eterna descobre que a Chama que todos herdaram foi dividida a um
preço que ninguém conta, e precisa decidir, Era após Era, o que fazer com a parte que ficou com ele.

**Pilares** (toda decisão de história passa por eles; o que não cabe em nenhum, sai):

| # | Pilar | O que significa na prática | O que ele recusa |
|---|---|---|---|
| 1 | **Herdar é escolher** | Toda progressão é uma herança com escolha: classe, linhagem, kit, aldeia, Kage, renegado. | Poder que cai do céu sem custo nem escolha. |
| 2 | **O mundo responde ao que os jogadores fazem** | Eleições, Portadores, rankings, renegados e a Progressão de Mundo são história jogada; a lore dá sentido a elas. | Cutscene que contradiz o que aconteceu no servidor. |
| 3 | **Pequeno e preciso** | Cada página da caixa de conversa tem até 3 linhas, mas a cena tem quantas páginas precisar para dar contexto e emoção (v71, pedido do Victor de 17/11); capítulos curtos, um mistério por vez. Celular, sessões de 5 a 15 minutos. | Info-dump; páginas de lore antes de jogar. |
| 4 | **O espaço conta** | A Floresta, o Poço, a Clareira e as fronteiras mostram o passado em objetos, marcas e luz. | Explicar em texto o que o cenário pode mostrar. |
| 5 | **Personagem acima de lore** | A lore só aparece pela boca, pelas mãos ou pelos objetos de alguém (um professor, um patrulheiro, um renegado). | Enciclopédia sem dono. |

---

## 2. A Linha Contada/Jogada do jogo

```
[ Contada ] ------------------------------------------------------------------- [ Jogada ]
 Crônica das Eras   Arco 1 (falas,   Falas dos NPCs   Fragmentos do   Rito, Extração,   Eleição do Kage, Portadores,
 (Cronista)          escolhas)        (barks)          Códice          maestria          rankeado, guerras, renegados
```

- **Narrativa embutida:** a Crônica (6 capítulos), o roteiro do Arco 1, as falas dos professores e lojistas, os 17
  fragmentos achados pelo mapa, as descrições de jutsu, relíquia e criatura.
- **Narrativa emergente:** quem vira Portador da Chama Eterna nesta Era; o Kage eleito por um voto; a aldeia que perdeu a
  guerra final para os renegados; o jogador que voltou ao Refúgio pela terceira vez. O jogo **guarda** essas histórias
  (títulos com a Era, registro dos Portadores, histórico de Jounin) para que elas virem lore dos próximos jogadores.

---

## 3. A espinha autoral (o que acontece sempre)

| Momento | O que é fixo | Onde está |
|---|---|---|
| Prólogo | A Academia: 4 salas, 4 professores, a primeira promessa da história (o tronco da Substituição) | Jogo (tutorial) e `docs/lore/tutorial.md` |
| Ato I do Arco 1 | Um lodo dentro da Vila; as Pedras da Vigília; "quem apagou conhece o selo" | `docs/historia/arco-1.md` |
| Ato II | Os Cinzas; o pergaminho roubado na Noite das Lanternas (Missão de Genin) | idem |
| Ato III | O falso professor; a quinta pedra; o chefe; o olho sob a Praça | idem |
| A cada Era (60 dias) | Kage, torneios, Titãs nos 10 primeiros dias, guerras, a Era vira história | Jogo (endgame) |
| Marcos do mundo (30, 60, 100, 150, 250 jogadores) | Um capítulo novo da Crônica e regiões novas | Jogo (Progressão de Mundo) |

A espinha cabe nos mapas que existem hoje: Aldeia, Academia, Floresta (carvalho, acampamento, beira do rio), Caverna do
Lodo, Clareira Queimada e Poço sob a Praça.

---

## 4. Ramos e nós de decisão (hub-and-spoke)

O Arco 1 já segue o modelo eixo e raios: as escolhas abrem caminhos curtos que voltam a um eixo antes da próxima grande
decisão. Classificação de cada escolha:

| Escolha | Onde | Tipo | O que muda | Reconverge em |
|---|---|---|---|---|
| "Prometo." / "Cada um cuida da sua missão." | Arco 1, M3 | **Real** | A Akane entra na luta final já na fase 1 e cura (ou só na fase 2); a fala dela | M14 (o chefe acontece igual) |
| Contar ou não ao "Kenji" onde fica a Pedra 3 | Arco 1, M8 | **Real** | Pedra 3 apagada e luta mais dura; falas em M10, M11 e M14 | M10 (o rastro segue igual) |
| "Vou contar ao Mestre." / "Fica entre nós." | Arco 1, M12 | **Real (adiada)** | A confiança do Mestre e do Diretor no Arco 2 | Arco 2 |
| Classe Primária e Secundária | Missão de Genin, nível 40 | **Real (sistêmica)** | Jutsus, kit, papel no grupo | Toda a progressão |
| Linhagem no Criador | Criador e Rito do Despertar | **Real (sistêmica)** | Passiva e 4 jutsus de clã | Rito (o mesmo para todas) |
| Virar renegado / voltar | Endgame | **Real (sistêmica)** | Mapa, inimigos, recompensa, títulos | Fim da Era |
| Tom nas conversas com os professores e lojistas | Falas do jogo | **Textura** | Só a reação imediata | Na hora |

**Regra de escopo:** no máximo 3 ou 4 escolhas grandes por arco; o resto é textura. Nenhuma escolha bloqueia o arco.

---

## 5. Pontos ambientais (o que cada região conta sem palavras)

Os 17 fragmentos do Códice (`public/lore.js`) foram colocados nestes pontos. Cada um é um objeto que conta uma história
curta; o brilho dourado é a luz como ponto focal (princípio 2 da orientação visual).

| Região | O que o espaço deve mostrar | Fragmento |
|---|---|---|
| Academia | A ordem e a promessa: a sala do Diretor é a mais alta e a mais iluminada | Regimento da Noite das Lanternas; Bilhete na mesa do Professor Kenji |
| Praça da Chama Eterna | O canal que vem da Floresta passa por baixo da Praça; a grade é o único ponto sujo da aldeia | Placa junto à grade do canal |
| Armaria | Ordem e contagem (kunais numeradas) | Recibo de kunais |
| Casa dos Pergaminhos | Papel e silêncio | Anotação do Sábio Ren sobre o pergaminho liso |
| Floresta: velho carvalho | Uma chama entalhada no tronco, antiga, e marcas de patrulha | Marcas no velho carvalho |
| Floresta: acampamento | Fogueira apagada, tecido cinza, pressa | Bilhete chamuscado |
| Floresta: beira do rio | A água aflora e o chão brilha de lodo | Diário de um patrulheiro |
| Caverna do Lodo | Marcas de contagem na parede; alguém esteve preso | Riscos na parede da caverna |
| Clareira Queimada | O círculo onde nada cresce; cinzas que não esfriam | O círculo de cinzas |
| Poço sob a Praça | Frio, escuro, uma pedra que pisca | A pedra fria |
| Zona de Conflito | Um marco de fronteira derrubado com os quatro símbolos riscados | O marco derrubado |
| Refúgio dos Renegados | Bandanas riscadas pregadas como troféus | A bandana pregada |
| As outras três aldeias | O jeito de cada povo: carta cifrada, canção, juramento na muralha | Um fragmento em cada |
| Arena das Quatro Heranças | As estátuas e a inscrição na base | A inscrição das heranças |

---

## 6. Regras sistêmicas e reatividade

| Estado do jogador ou do mundo | O que o jogo faz com ele (hoje) | O que a narrativa promete (próximos passos) |
|---|---|---|
| Passo do tutorial (0 a 4) | As salas, as portas e as falas dos professores mudam | — |
| Nível, patente, classe | Capítulos do Pergaminho do Mestre; Missão de Genin; Rito | Falas do Mestre e do Diretor que reconhecem a patente |
| Linhagem desperta | Passiva, jutsus de clã, marca no corpo (Rubro, Umbra, Andarilho) | Um capítulo da Crônica por linhagem |
| Marco do mundo | Capítulos da Crônica, névoa nos mapas trancados | Fragmentos que só aparecem depois de cada marco |
| Portador de Titã | Título, passiva e Suprema por uma Era | O nome do Portador gravado na Crônica da Era |
| Renegado | Refúgio, recompensa, inimigo das aldeias | Falas dos lojistas que estranham quem volta |
| Fragmentos achados (Códice) | Guardados no aparelho do jogador | Recompensa e falas do Cronista por fragmento (pede gravar no banco: proposta) |

---

## 7. Alinhamento ludonarrativo (o verbo é a história)

A mecânica central de cada sistema tem de ser o verbo da história. Onde havia risco de dissonância, a justificativa já
está no mundo:

| Mecânica | O verbo | Como a história sustenta |
|---|---|---|
| Caçar lodos sem parar | **Devolver** o chakra que vazou | Lodos não são bichos: são gotas do Lodo Ancestral. Caçá-los é manter o selo. O Rito usa os Lodos Escuros porque o sangue responde a esse chakra. |
| Extração por pergaminho | **Ler** a própria brasa | O pergaminho liso revela o que a brasa de quem o abre já sabe fazer; por isso só sai jutsu da sua classe. |
| Maestria | **Repetir** | A brasa se acostuma ao que repete. |
| Meditar | **Respirar** a Chama | A brasa volta parada; apanhar corta (a Sala de Controle ensina, o Arco 1 transforma em tensão na M13). |
| Substituição | **Confiar** (e ser enganado) | O tema do Arco 1: o professor ensina o tronco e é trocado por um. |
| PvP entre aldeias | **Disputar** a terra que ninguém aceitou dividir | A Zona de Conflito existe por causa da guerra dos fundadores. |
| Matar um aliado | **Romper** a promessa | A pena é a bandana queimada: vira renegado. O sistema pune o que a história condena. |
| Kage sem reeleição | **Passar adiante** | "A Chama não pode ter dono." |
| Vínculo fora do PvP de honra | **Pactuar** com a terra | As criaturas lutam pela terra, não nas brigas das aldeias. |
| Portador por uma Era | **Carregar** e devolver | A brasa não aguenta dois Titãs; a Era acaba e o pedaço volta a dormir. |
| Mapas trancados por população | **Abrir caminho** juntos | O mundo cresce quando há gente bastante carregando a Chama; a névoa é a Crônica ainda borrada. |

**Risco resolvido (v65):** o jogo chamava o monstro de caça de "slime" e o cânone é **lodo**. Por escolha do Victor, ele
agora se chama **Lodo Verde** em tudo que o jogador vê (falas do Mestre, missões, janela do alvo, painel do admin).

---

## 8. Erros comuns: como este projeto evita cada um

| Erro | O que fizemos |
|---|---|
| Explosão de ramificações | Hub-and-spoke no Arco 1; 3 escolhas reais. |
| Páginas longas demais | Teste automático: nenhuma página da caixa de conversa passa de 3 linhas (160 caracteres); a cena pode ter várias páginas (v71). |
| Personagens inconsistentes | `personagens.md`: ficha de cada NPC com vocabulário, bordões e limites. |
| Cutscenes que se pulam | Nenhuma cutscene longa; a exposição vai para fragmentos e cenário. |
| Escolhas falsas | Tom = textura (reação na hora); escolha real muda flag e cena. |
| Dissonância ludonarrativa | Tabela da seção 7, revisada a cada sistema novo. |
| Info-dump | Lore em 17 fragmentos achados explorando, capítulos abertos por marco. |
| Tutorial intrusivo | Método em 3 etapas, dicas só na hora e desligáveis (`tutorial.md`). |
