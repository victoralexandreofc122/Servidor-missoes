# Bíblia do Mundo: Herança do Fogo

* **Status:** fonte única de verdade da lore (15/11/2026). Quando um texto do jogo, um roteiro (`docs/historia/`) ou um
  documento de design disser outra coisa, vale o que está aqui; a contradição vai para a seção 9 até ser corrigida.
* **Regra de nomes (CLAUDE.md, 09/11/2026):** esta bíblia **não cria nome próprio novo**. Onde o mundo precisa de um nome
  que ainda não existe, ele aparece descrito ("a guerra dos fundadores") e entra em `propostas-de-nomes.md`, com 3
  opções, para o Victor escolher.
* **Base:** o que já está no jogo (mapas, NPCs, classes, clãs, Titãs, Vínculo, relíquias, a Crônica das Eras do
  Cronista), o roteiro do Arco 1 (`docs/historia/arco-1.md`) e o endgame canônico (`docs/endgame-visao.md`).
* **Método:** o "Manual Definitivo de Design Narrativo" enviado pelo Victor: as 8 seções da Bíblia de Mundo, causa e
  efeito na história, regras e limites claros para o sistema especulativo (Primeira Lei de Sanderson) e "personagem
  acima de lore".

---

## 1. Visão geral do mundo

**O conceito em três frases.** No começo havia só a Chama. Quatro clãs fundadores a dividiram em quatro heranças, e cada
herança virou uma aldeia ninja; o preço foi prender sob a terra as forças que lutaram contra essa divisão. Hoje cada
ninja carrega uma brasa dessa Chama no corpo (o chakra), e cada geração decide se a herança é para guardar, disputar ou
queimar.

**O tema central.** *Herdar é escolher o que fazer com o que não foi você que acendeu.* Tudo no jogo passa por isso: o
cadete herda os jutsus da Academia; o Genin desperta (ou não) o sangue da linhagem; o Portador carrega um pedaço de um
Titã por uma Era; o Kage herda a aldeia por uma temporada e não pode herdá-la de novo; o renegado recusa a herança e
risca a bandana.

**O tom.** Fantasia ninja de aldeias, calorosa no cotidiano e dura nas bordas. A Praça tem lanternas, lojistas que
fofocam e professores que torcem pelo aluno; a Floresta, o subsolo e as fronteiras guardam o que os fundadores
preferiram esquecer. Humor leve dentro da aldeia, mistério na mata, peso nas guerras. Nada de crueldade gratuita: a
violência tem custo (a bandana queimada, a Era que acaba, o título que vira história).

**Âncoras para a equipe.**
- **Visual:** pixel art chibi, contorno escuro, 2 a 3 tons por cor, tons dourados nos lugares seguros (a Praça, a
  Academia) e frios nos perigosos (o Poço, a Caverna). Ver `arte/personagem-rig/LEIAME.md`.
- **Estrutura social:** aldeias como cidades-escola. A patente (Academia, Genin, Chunin, Jounin, ANBU, Kage) é ao mesmo
  tempo posto militar e etapa da vida.
- **Proibido:** nomes, símbolos e frases da série que inspirou o gênero (ver `docs/fase1-renomeacao.md`).

**A Linha Contada/Jogada deste mundo.** A história contada é pequena e precisa (a Crônica das Eras, o Arco 1, as falas
dos NPCs, os fragmentos achados pelo mapa). A história jogada é grande: eleições de Kage, Portadores, rankeado, guerras,
renegados. A lore existe para dar sentido ao que os jogadores fazem uns com os outros, não para competir com isso.

---

## 2. Geografia e meio ambiente

O mundo conhecido é uma bacia de terra fértil cortada por um rio que corre por baixo da Floresta. As quatro aldeias
ficam nas bordas da bacia, cada uma na paisagem que combina com a sua herança; o meio é a terra que ninguém aceitou
dividir.

| Região | Onde e como é | O que a geografia causa |
|---|---|---|
| **Aldeia da Chama Eterna** | Ao norte da Floresta. Praça com lanternas, Academia, Armaria, Alfaiataria, Casa dos Pergaminhos, campo de treino com arena. Um canal leva água da Floresta por baixo da Praça. | É a aldeia mais perto da Floresta e do selo: por isso guarda a Academia e a Cerimônia. O canal é o caminho por onde o perigo sobe (Arco 1). |
| **Aldeia da Maré Oculta** | Litoral de névoa, casas sobre a água. | Névoa e maré escondem quem chega: a aldeia vive de informação (passiva Corrente Silenciosa). |
| **Aldeia do Vento Cortante** | Planalto alto e aberto, ventos fortes o ano inteiro. | Distâncias grandes e nada para se esconder: a aldeia valoriza velocidade (passiva Passo do Vendaval). |
| **Aldeia da Rocha Antiga** | Desfiladeiro de pedra antiga, muralhas talhadas na rocha. | Fácil de defender, difícil de abastecer: a aldeia valoriza resistência e cerco (passiva Muralha). |
| **Floresta** | Ao sul da Chama Eterna, 100 x 100 casas. Lago, velho carvalho, acampamento antigo, leito seco e a beira do rio. | O rio subterrâneo carrega o chakra derretido do Lodo: os lodos brotam onde a água aflora (beira, leito). |
| **Caverna do Lodo** | Uma boca de caverna além de um abismo da Floresta. | Fica perto do selo: lá os Lodos Escuros são mais densos. |
| **Clareira Queimada** | O coração da Floresta, um círculo de terra queimada onde nada cresce. | É o lugar mais perto da superfície do que dorme embaixo: é onde os Titãs acordam a cada Era. |
| **Poço sob a Praça** | Debaixo da Praça da Chama Eterna, ligado ao canal. | Guarda a quinta Pedra-Selo, que não prende o Lodo (Arco 1, gancho do Arco 2). |
| **Zona de Conflito** | Entre as quatro aldeias, com um acampamento de cada uma. | Terra sem dono: ali a lei das aldeias não chega e só a lâmina decide (PvP livre, MMR, temporadas). |
| **Refúgio dos Renegados** | Longe das quatro aldeias, abrigo dos que riscaram a bandana. | Ninguém manda ali: quem não é renegado entra como intruso. |
| **Arena das Quatro Heranças** | Um vale com as estátuas das quatro heranças em volta de um campo de duelo. | O único lugar onde as aldeias aceitam se medir sem guerra: duelos de honra, rankeado e torneios. |
| **Terra Sem Lei, ilhas, cavernas profundas** | Ainda não alcançadas (marcos 150 e 250 da Progressão de Mundo). | Só abrem quando há gente bastante para carregar a Chama até lá (ver seção 6). |

**Clima e estações.** Chuva, neblina, vento e calor mudam o combate (`docs/clima.md`). Na lore, o clima é a Chama
"respirando": dias quentes reforçam o fogo, a chuva molha e conduz o raio. O dia e a noite mudam o humor das aldeias e
a coragem dos lodos.

**Recursos naturais.** Papel de pergaminho (fibra de árvore da Floresta, prensada na Casa dos Pergaminhos), metal para
kunais (trazido da Rocha Antiga), tecido (da Maré Oculta), e o próprio chakra, que é o recurso que importa.

---

## 3. História e cronologia

A história funciona por causa e efeito: cada era abre o problema da seguinte. A Crônica das Eras (o Cronista, na
Academia) conta a mesma linha em seis capítulos, abertos pela Progressão de Mundo.

| Quando | Era | O que aconteceu | O que isso causou |
|---|---|---|---|
| Antes de tudo | **A Primeira Chama** | Só havia a Chama, uma força viva sem forma. | Quem tocava a Chama ganhava poder, mas ela não tinha dono. |
| Séculos atrás | **A divisão** | Quatro clãs fundadores dividiram a Chama em quatro heranças e ergueram as quatro aldeias. Dez forças antigas, os Titãs, lutaram contra a divisão. | Os fundadores prenderam os Titãs sob a terra para fazer o mundo como ele é. Quem chegou mais perto deles na luta ficou marcado no sangue: são as linhagens (seção 4). |
| Logo depois | **A guerra dos fundadores** | A paz entre as quatro heranças não durou: as aldeias guerrearam pela terra do meio. | O sangue e o chakra derramados envenenaram o rio que corre sob a Floresta. Do rio envenenado nasceu o Lodo Ancestral. A terra do meio ficou sem dono: é a Zona de Conflito. |
| Gerações de paz armada | **As aldeias crescem** | Cada aldeia se fechou na sua herança. A Chama Eterna fundou a Academia e guardou a brasa que sobrou da Primeira Chama no Pergaminho em Chamas. | A Arena das Quatro Heranças vira o lugar dos duelos de honra, no lugar da guerra aberta. |
| Há 50 anos | **O selamento** | O Lodo Ancestral acordou sob a Floresta. A geração que fundou a Academia o prendeu com cinco Pedras-Selo, acesas pela chama do Pergaminho em Chamas. | Nasce a Cerimônia da Chama: a cada formatura, o Diretor reacende as pedras. Os lodos da Floresta são as gotas de chakra que vazam pelo selo; o Rei Lodo é o maior pedaço que escapou. |
| Uma geração atrás | **As primeiras bandanas queimadas** | A aldeia passou a expulsar quem matava aliados ou traía a herança, queimando a bandana na expulsão. Outros saíram por conta própria, riscando a bandana. | Os expulsos se juntam como **Os Cinzas**; os que saíram por escolha vivem no **Refúgio dos Renegados**. A aldeia passa a eleger um Kage por Era, e toda eleição faz descontentes. |
| Hoje (a Era Fundadora, Temporada 1) | **O jogador** | Um cadete entra na Academia da Chama Eterna. Na noite da formatura, um lodo aparece dentro da Vila, onde lodo nenhum entra. | Começa o Arco 1 (`docs/historia/arco-1.md`). Ao mesmo tempo, as Eras de 60 dias começam a girar: Kage, torneios, guerras, e os Titãs acordando um por dia nos 10 primeiros dias de cada Era. |
| O que vem | **Além do mar e abaixo da pedra** | Os Titãs caídos abrem passagens fechadas desde a Primeira Chama. | Ilhas e cavernas profundas (marco 250). |

**O que o jogador sabe e quando.** O cadete sabe o que a Academia ensina (seção 4: o juramento da formatura). O resto chega
em pedaços: o Cronista conta a Crônica até o marco do mundo; os fragmentos achados pelo mapa mostram o que os livros não
contam; o Arco 1 revela o selo e a quinta pedra.

---

## 4. Culturas, sociedades e religião

### A fé da Chama

As quatro aldeias acreditam na mesma coisa de jeitos diferentes: a Chama é a origem de todo chakra, e cada ninja carrega
uma brasa dela. Não há deuses com rosto; há a Chama, os fundadores (lembrados como antepassados, não como divindades) e
os Titãs (temidos como forças da natureza, não adorados).

- **O juramento da formatura** (nome próprio em aberto, ver `propostas-de-nomes.md`): o cadete promete guardar a brasa
  que recebeu e passá-la adiante.
- **A Cerimônia da Chama:** a cada formatura, o Diretor reacende as Pedras-Selo com o Pergaminho em Chamas. Só o Diretor
  sabe onde ficam as cinco.
- **A bandana:** é o corpo da promessa. Queimar a bandana é a pena máxima (expulsão); riscar a bandana é renunciar.
- **Heresias e costumes:** os Cinzas dizem que a Chama nunca devia ter sido dividida e que os fundadores roubaram o que
  era de todos. No cotidiano: acender uma lanterna na janela na noite da Cerimônia; não dizer o nome de um Titã em voz
  alta no dia em que ele acorda; tocar o chão antes de um duelo na Arena.

### As quatro aldeias

| Aldeia | Valor que ensina | Rito de passagem | Como o povo é |
|---|---|---|---|
| Chama Eterna | Coragem e dever | A formatura na Academia e a Cerimônia | Calorosa, barulhenta, orgulhosa da Academia; conta histórias na Praça. |
| Maré Oculta | Paciência e segredo | Passar uma noite inteira na névoa sem ser visto | Educada e reservada; fala pouco, escuta muito, escreve tudo em cifra. |
| Vento Cortante | Liberdade e rapidez | Atravessar o planalto de uma ponta à outra antes do sol se pôr | Direta, inquieta, canta enquanto trabalha; despreza muros. |
| Rocha Antiga | Paciência e resistência | Gravar o próprio nome na muralha depois do primeiro cerco | Lenta para confiar, leal para sempre; mede tudo em gerações. |

### Classes: o que cada uma é na cultura

As 10 classes são os caminhos de treino que a Academia reconhece. Na lore, cada uma é um jeito de usar a brasa: Fogo,
Água, Raio, Vento e Terra moldam o chakra em elemento; Ilusão engana a mente; Sombra prende pelo chão; Cura devolve o
chakra ao corpo; Taijutsu e Armas usam o chakra para reforçar o corpo e a lâmina. Um ninja domina no máximo duas (a
Primária no Genin, a Secundária no Chunin): a brasa de uma pessoa não alimenta mais do que dois caminhos.

### Linhagens (os clãs do sangue)

As linhagens são famílias marcadas no sangue desde a divisão: os antepassados delas lutaram perto dos Titãs, e um pouco
daquela força ficou. Por isso a linhagem **desperta** (Rito do Despertar), não se aprende. O vínculo de cada linhagem com
os Titãs é a leitura canônica, e o Cronista pode contá-la em um capítulo futuro:

| Linhagem | Herança no sangue | De onde vem (cânone) |
|---|---|---|
| Clã Rubro | Olhos que leem o golpe; chama que não apaga | De quem lutou contra a Chama Eterna, o Titã do fogo |
| Clã Umbra | Somem na sombra e marcam a presa | De quem lutou contra a Noite Eterna |
| Clã Bastião | Escudos que duram, controle que pega menos | De quem segurou a Rocha Antiga, o Titã da pedra |
| Clã Áspide | Veneno que morde no primeiro instante e corta a cura | De quem sobreviveu à Maré de Sangue |
| Clã Garra | Feras ao lado, corpo mais rápido | De quem caçou com as criaturas antigas na luta contra a Vida |
| Clã Zéfiro | Esquiva no vento e volta no tempo | De quem correu com o Vento Cortante |
| Andarilho | Sem sangue antigo | Gente de todas as aldeias; a Substituição deles volta mais rápido, porque nunca contaram com nada além do treino |

### O Vínculo Ancestral

As oito criaturas (Sapo, Lobo, Águia, Gato, Lesma, Aranha, Tartaruga, Tigre) são mais velhas que as aldeias. O Vínculo é
um pacto com a terra viva: a criatura atende quem cria afinidade com ela, e no **Estado Primal** o ninja empresta a
natureza dela por um tempo. A regra do pacto (e do jogo): as criaturas atendem no mundo aberto, mas **não entram em
disputas de honra nem em guerras de bandeira** (rankeado, torneios, guerras). Elas lutam contra o que ameaça a terra, não
nas brigas das aldeias.

---

## 5. Governo e política

- **A aldeia:** cada aldeia é governada por um **Kage**, eleito por uma Era (60 dias) entre os Jounin, com voto ponderado
  (Chunin 1, Jounin 2, ANBU 3), secreto e **sem reeleição, para sempre**. Na lore: a Chama não pode ter dono, então
  ninguém a guarda duas vezes.
- **A hierarquia:** Academia, Genin (nível 11, a 1ª classe), Chunin (nível 40, a 2ª classe), Jounin (o Torneio da
  Temporada), ANBU (indicação do Kage, de 1 a 10), Kage. O Diretor da Academia não é Kage: guarda a Academia, a
  Cerimônia e o segredo das pedras, acima das eleições.
- **Lei e punição:** matar aliado, quebrar as regras ou desafiar o Kage leva à expulsão (bandana queimada). Renegados
  podem voltar duas vezes por Era, só no fim dela, com o aval do Maior Vilão e do Kage.
- **Entre as aldeias:** guerra, aliança ou trégua, decididas pelo Kage (diplomacia do endgame). A guerra semanal 20v20 e
  a Guerra Final são o jeito "civilizado" de disputar a terra do meio.
- **Fora das aldeias:** na Terra Sem Lei manda o **Maior Vilão**, eleito no Torneio dos Renegados, que escolhe a lei da
  Era ("Todos por si" ou "Paz armada"). O nome que o jogador vê para a organização de elite deles é **Os Cinzas**.
- **Tensões ativas quando o jogador começa:** as Pedras-Selo estão sendo apagadas por alguém de dentro (Arco 1); os
  Titãs voltam a acordar a cada Era; as aldeias disputam a Zona de Conflito; a primeira Era (a Era Fundadora) ainda não
  tem Jounin nem Kage.

---

## 6. O sistema especulativo: chakra, jutsu e as regras do mundo

A Primeira Lei de Sanderson: um conflito só pode ser resolvido com poder na medida em que o jogador entende as regras
desse poder. As regras abaixo são **as mesmas do jogo**; se uma mecânica mudar, esta seção muda junto.

**A fonte.** O chakra é a brasa da Primeira Chama que todo corpo carrega. Ela cresce com o treino (nível e atributos) e
se gasta em cada jutsu.

**Os custos.**
- Cada jutsu gasta chakra; sem chakra, não há jutsu. A brasa volta devagar sozinha e depressa com a **meditação** (parado,
  sem apanhar).
- Jutsus fortes pedem **selos** (tempo de conjuração). Quem é atordoado, empurrado, silenciado ou adormecido nos selos
  perde o jutsu e parte do chakra: a brasa escapa.
- A brasa de uma pessoa alimenta no máximo **duas classes**.

**O que o chakra não faz.**
- Não traz mortos de volta. A única exceção é uma relíquia lendária (Coração da Fênix Cinza), que salva uma vez por Era,
  e por isso é lendária.
- Não cura do nada: a cura gasta chakra de quem cura e é mais fraca sob ferida ou veneno.
- Não atravessa paredes: o Teleporte salta vãos, nunca muros.
- Não prende para sempre: todo controle tem teto (no PvP, 2,5 s por golpe e 5 s a cada 15 s). Na lore: a brasa de quem é
  preso reage e rompe o controle.
- Não escolhe o sangue: a linhagem desperta uma vez e não troca.

**Como se aprende.**
- **A Academia** ensina o Teleporte Curto e a Substituição a todos.
- **A Extração:** o pergaminho liso, feito na Casa dos Pergaminhos, "lê" a brasa de quem o abre e revela um jutsu da
  classe daquela pessoa. Tiers mais altos pedem mais pergaminhos; quem erra tem mais chance na próxima, porque o papel
  aprende o formato da brasa.
- **A maestria:** a brasa se acostuma ao que repete. Quanto mais um jutsu é usado, mais ele rende (dano, efeito, alcance,
  recarga).
- **A linhagem:** desperta no Rito do Despertar (Genin, nível 11), derrotando Lodos Escuros, porque o sangue antigo
  responde ao chakra que vazou do selo. Os jutsus do clã chegam nos níveis 11, 20, 40 e 60.

**As forças maiores.**
- **Os Titãs** (Chama Eterna, Maré de Sangue, Trovão Ancestral, Vento Cortante, Rocha Antiga, Noite Eterna, Pesadelo,
  Corpo Fechado, Mil Lâminas, Vida): acordam um por dia nos 10 primeiros dias da Era, na Clareira Queimada, com uma vida
  só para o mundo inteiro. Quem mais fere um Titã carrega um pedaço dele até a Era acabar: o **Portador**, com uma passiva
  e uma Habilidade Suprema (1 minuto de efeito, 20 de recarga). Um Titã por ninja por Era: a brasa não aguenta dois.
- **As relíquias:** pedaços do que os chefes engoliram (o Rei Lodo, os Titãs). Valem só de ter na mochila; várias iguais
  não somam. Do mais comum ao mais raro: Amuletos, Selos, as épicas (Presa Rubra, Último Fôlego, Fluxo Sereno) e as
  lendárias (Coração da Fênix Cinza, Punho da Chama Antiga).
- **A Progressão de Mundo:** o mundo se abre conforme há gente carregando a Chama (a população ativa dos últimos 7
  dias). Mapa ainda trancado aparece como **névoa** na saída e some do Posto de Viagem; os capítulos da Crônica ainda não
  alcançados estão "borrados". O marco alcançado nunca volta atrás.

**O impacto social.** O chakra decide quem governa (só Jounin viram Kage), quem é temido (Portadores, Maior Vilão) e quem
é caçado (renegados com recompensa). A aldeia mede o valor de alguém pela patente e pela história que ele carrega
(títulos: "Jounin da Era 3", "Guardião da Chama", "Portador do Vento Cortante").

---

## 7. Economia e comércio

- **Moeda:** o **ryō**, cunhado pelas aldeias e aceito em todas. Ganha-se caçando, com missões da Sala de Missões, nos
  torneios e com a recompensa por renegados; gasta-se nas lojas (preço muda com a diplomacia: guerra +10%, aliança −5%).
- **Recursos escassos:** pergaminhos lisos (a Extração), kunais e shurikens (a Armaria), relíquias (só dos chefes) e
  vagas de Jounin (1 a cada 50 ativos por aldeia).
- **Quem tem o quê:** a Chama Eterna tem a Academia e os pergaminhos; a Rocha Antiga, o metal; a Maré Oculta, o tecido e
  a informação; o Vento Cortante, as rotas. Na Terra Sem Lei, a moeda é a recompensa pela cabeça dos outros.
- **Regra do jogo que é regra do mundo:** nada se compra com dinheiro de fora (free-to-play, sem pay-to-win). Na lore:
  a brasa não se vende.

---

## 8. Linguagens e nomenclaturas

Convenções para qualquer nome novo (que só entra depois da escolha do Victor):

| O quê | Padrão | Exemplos que já existem |
|---|---|---|
| Pessoas da Chama Eterna | Nome curto de 2 sílabas, sonoridade japonesa suave, sem nome da série | Kenji, Mei, Aya, Daichi, Tetsu, Hana, Ren |
| Profissão + nome | Como o povo chama quem atende | Ferreiro Tetsu, Costureira Hana, Sábio Ren, Professora Aya |
| Lugares | Português descritivo, com artigo | Clareira Queimada, Poço sob a Praça, Zona de Conflito |
| Aldeias | "Aldeia da/do" + força + qualidade | Aldeia da Chama Eterna, da Maré Oculta, do Vento Cortante, da Rocha Antiga |
| Jutsus | Português, imagem concreta + ação | Cuspe da Áspide, Muralha Interior, Passo do Vento |
| Clãs | Uma palavra em português, forte e curta | Rubro, Umbra, Bastião, Áspide, Garra, Zéfiro |
| Títulos | Fórmula fixa | "Portador da/do ...", "Jounin da Era N", "Herói da Vila X" |
| Organizações | Plural com artigo | Os Cinzas |

Ainda sem padrão definido (pedem a escolha do Victor): nomes de pessoas das outras três aldeias (sugestão em
`propostas-de-nomes.md`: cada aldeia com a sua sonoridade) e nomes dos fundadores.

---

## 9. Contradições encontradas e como ficaram

| Onde | O que dizia | Como fica (cânone) |
|---|---|---|
| Crônica, cap. II (jogo) × Arco 1, M4 | A Crônica: o Rei Lodo "é o que restou de um rio envenenado pela guerra dos fundadores". O Arco 1: "há cinquenta anos, os fundadores prenderam algo debaixo da Floresta". | As duas valem em sequência: a guerra dos fundadores envenenou o rio (séculos atrás); do rio nasceu o Lodo Ancestral; **há 50 anos a geração que fundou a Academia** o selou com as cinco pedras. O texto do capítulo II no jogo foi ajustado; no Arco 1, "os fundadores" passa a ser lido como "os fundadores da Academia" (ajustar a fala da M4 e da M9 quando o arco for implementado). |
| Crônica, cap. I × "clãs" do jogo | "Os quatro clãs fundadores" dividiram a Chama. O jogo chama de clã as linhagens (Rubro, Umbra...). | Os **clãs fundadores** são as quatro casas que ergueram as aldeias; as **linhagens** são famílias marcadas pelos Titãs. Nos textos novos, "clã fundador" sempre com "fundador". |
| Crônica, cap. IV × endgame | "Os que riscaram a bandana fugiram para o Refúgio" × "Os Cinzas: expulsos, bandana queimada". | Riscar = sair por escolha (renegado, Refúgio). Queimar = expulsão (Os Cinzas). As duas coisas existem. |
| Arco 1 × mapa | O Arco 1 fala do "Acampamento Queimado" e do "velho carvalho" como áreas novas. | Já existem como zonas da Floresta ("acampamento" e "carvalho" em `src/realtime/maps.ts`); os fragmentos do Códice usam esses lugares. |
| Tutorial × Arco 1 | O Arco 1 pede três falas do Kenji e do Diretor no prólogo. | Entraram nas falas novas dos professores (`src/realtime/falas.ts`), sem citar nomes que ainda não existem no jogo. |
