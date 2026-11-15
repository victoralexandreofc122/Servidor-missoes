# Artefatos do mundo (documentos in-world)

* **O que são:** a lore profunda entregue como coisas que existem dentro do mundo (regimento, bilhete, diário, carta,
  canção, juramento, inscrição), espalhadas pelos mapas e achadas explorando. É a resposta do guia ao "info-dump": a
  Bíblia não aparece inteira para o jogador; aparece em pedaços, cada um com dono.
* **No jogo:** 17 fragmentos (`public/lore.js`, `FRAGMENTS`). Um brilho dourado no chão marca cada um (a luz como ponto
  focal); quem chega perto lê o texto, e ele fica guardado no **Manual → Fragmentos** (o Códice). Só aparecem depois da
  Academia, para não interromper o tutorial.
* **Regra de voz:** cada documento reflete o autor: o que ele sabe, o que esconde, o jeito de escrever. O texto exato
  está em `dialogos.csv` (linhas `FRG_*`).
* **Nomes:** os textos usam só o que existe no jogo e os nomes escolhidos pelo Victor em 15/11/2026 (Pergaminho em
  Chamas, Pedras da Vigília, Noite das Lanternas, Rio das Raízes...; ver `propostas-de-nomes.md`).

| ID | Onde | Artefato | Autor (voz) | O que revela | O que esconde |
|---|---|---|---|---|---|
| FRG_01 | Academia, sala do Diretor | Regimento da Academia | O Diretor (jurídico, formal) | A Noite das Lanternas reacende as pedras; ninguém pode perguntar onde ficam | Onde ficam |
| FRG_02 | Academia, Sala de Jutsus | Bilhete na mesa | Professor Kenji (brincalhão) | O bordão verdadeiro dele ("Olha onde vai pousar!") | Nada: é a pista para o Arco 1 |
| FRG_03 | Praça da Chama Eterna, junto ao canal | Placa junto à grade | A guarda (aviso seco) | O canal vem da Floresta por baixo da terra | Que alguém mexeu na grade |
| FRG_04 | Armaria | Recibo esquecido | Ferreiro Tetsu (contas) | Sumiram 30 kunais, recibo em papel de pergaminho | Quem assinou |
| FRG_05 | Casa dos Pergaminhos | Anotação sobre o pergaminho liso | Sábio Ren (erudito) | Como a Extração funciona na lore | — |
| FRG_06 | Floresta, velho carvalho | Marcas no carvalho | O lugar | Patrulhas antigas; a última não voltou | O que aconteceu com ela |
| FRG_07 | Floresta, acampamento | Bilhete chamuscado | Alguém de capa cinza (mercenário) | Os Cinzas acampam na Floresta e querem um mapa | O nome do chefe |
| FRG_08 | Floresta, beira do rio | Diário de um patrulheiro | Patrulheiro (cansado) | Os lodos são chakra e estão aumentando | Que os superiores sabem |
| FRG_09 | Caverna do Lodo | Escrito na pedra | Duas épocas | O rio desce para o selo; alguém seguiu | Quem |
| FRG_10 | Clareira Queimada, junto ao selo | O círculo de cinzas | O lugar | Algo enorme dorme embaixo e conta os dias (os Titãs) | — |
| FRG_11 | Poço sob a Praça | A pedra fria | O lugar | A quinta pedra pisca "como um olho" | O que ela prende (Arco 2) |
| FRG_12 | Zona de Conflito | O marco derrubado | O lugar | Por que a terra do meio não tem dono | — |
| FRG_13 | Refúgio dos Renegados | A bandana pregada | Um renegado | A diferença entre riscar e queimar a bandana | — |
| FRG_14 | Aldeia da Maré Oculta | Carta cifrada | A escuta do porto (diplomática) | As outras aldeias sabem do lodo na Chama Eterna | Se acreditam |
| FRG_15 | Aldeia do Vento Cortante | Canção dos carregadores | O povo (canção) | A divisão vista de baixo: "deixou pra nós só uma brasa" | — |
| FRG_16 | Aldeia da Rocha Antiga | Juramento na muralha | O povo (solene) | A Rocha Antiga segura o que cai (o Titã da pedra) | — |
| FRG_17 | Arena das Quatro Heranças | Inscrição nas estátuas | Quem ergueu a Arena | A regra da Arena: medir, não tomar | — |

**Ordem natural de descoberta** (a Progressão de Mundo e o nível levam o jogador por ela): Academia e Praça (nível 1 a
10) → Floresta (5 a 15) → Caverna e Clareira (Rito, 11+) → Zona de Conflito e Arena (PvP) → Refúgio e as outras aldeias
(endgame e viagem). A história se monta do pequeno (um recibo) ao grande (os Titãs), sem spoiler do Arco 1: os
fragmentos levantam as perguntas que o arco responde.

**Próximos artefatos** (quando os sistemas existirem): um fragmento por linhagem (a origem de cada clã), cartas dos
Portadores de cada Era (gravadas no banco, escritas pelo servidor com o nome de quem venceu), e o registro do Kage de cada
Era na Academia (narrativa emergente virando lore).
