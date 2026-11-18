# Fichas de personagem

Toda pessoa que fala no jogo tem ficha, até quem aparece uma vez só (pedido do Victor de 17/11/2026: "cada um deve ter
uma história profunda, até mesmo o menor NPC"). A ficha diz quem a pessoa é, o que viveu, o que quer, o que teme, o que
esconde e como fala. Toda fala nova passa por ela antes de entrar no jogo.

## Como usar

- **A regra das falas (v71):** a fala aparece na caixa de conversa, embaixo da tela. Cada página tem até 3 linhas (160
  caracteres; o teste `test/lore.test.ts` confere), mas a cena tem quantas páginas precisar. Uma linha em branco no texto
  abre página nova. Conversa curta demais deixa o jogador perdido: dê contexto, emoção e o jeito de falar da pessoa.
- **Antes de escrever, confira:** a fala soa como essa pessoa (ritmo, palavras, tiques)? Ela revela um pedaço do passado
  ou do que a pessoa quer? Muda conforme o jogador já conhece a pessoa (primeira vez, de novo, depois do Genin)?
- **Nomes:** quem ainda não tem nome aparece pelo papel (a Diretora da Maré, o Velho das Pipas). Nome novo só com a escolha
  do Victor entre 3 opções (regra do CLAUDE.md). As histórias citam parentes e conhecidos sem nome pelo mesmo motivo.
- **Uma pessoa, um papel:** o Mestre que dá as missões em cada aldeia é a mesma pessoa que guia o Arco 1 dela. Na Maré, é
  o Mestre das Cifras; no Vento, a Mestra das Caravanas; na Rocha, o Chefe dos Mineiros. Na Chama, o Mestre da Praça.

Fontes: os NPCs do jogo (`src/realtime/config.ts`, `src/realtime/maps.ts`), os roteiros (`docs/historia/arco-1*.md`), a
Bíblia do Mundo (`biblia-do-mundo.md`) e a proposta do mundo aberto (`mundo-aberto-proposta.md`).

---

# Parte 1: quem está no jogo hoje

## Academia da Chama Eterna

### Diretor da Academia
- **Quem é:** um velho magro e reto, de cabelo branco preso, que anda devagar e nunca se apoia em nada. Dirige a
  Academia há trinta anos. Guarda o Pergaminho em Chamas e reacende as Pedras da Vigília na Noite das Lanternas.
- **Passado:** foi cadete na geração que prendeu o Lodo Ancestral na Noite das Cinco Pedras. Era o mais novo do grupo e o
  único que voltou sem ferimento, porque o mandaram ficar de guarda no poço debaixo da Praça. Ele nunca soube se foi
  proteção ou desconfiança, e passou a vida tentando merecer aquela noite. Anos depois teve o melhor aluno que a Academia
  já viu, um menino que aprendia qualquer jutsu na primeira tentativa. Quando o pegou tentando beber o chakra de uma Pedra
  da Vigília, queimou a bandana dele com a própria mão, diante de todos. Esse aluno é o Kagerō. O Diretor não se arrepende
  e não se perdoa: as duas coisas ao mesmo tempo.
- **O que quer:** que o selo aguente até ele encontrar alguém digno de guardar o segredo da quinta pedra.
- **O que teme:** morrer com o segredo e deixar a aldeia sem saber o que dorme debaixo dela. Teme ainda mais contar e ver
  outro aluno virar o Kagerō.
- **O que esconde:** a quinta pedra não prende o Lodo. Prende outra coisa (Arco 2).
- **Como fala:** frases curtas, formais, sem adjetivo. Pausas que pesam ("..."). Faz perguntas no lugar de responder.
  **Nunca responde "por quê"**: troca de assunto ou diz "não hoje". Chama o jogador de "cadete" e, depois do Genin, de
  "Genin", sem o nome.
- **Nunca diz:** "eu errei"; o nome do Kagerō antes do Arco 1 revelar.
- **Com o jogador:** no começo, distante e exigente. Depois da Missão de Genin, uma frase de aprovação seca vale mais que
  um discurso. Se o jogador fala com ele muitas vezes, ele começa a perguntar da família do cadete (o único sinal de
  afeto que sabe dar).
- **Com os outros:** respeita o Daichi como igual; acha o Ren falador demais; protege o Kenji sem que ele perceba.
- **Sabe:** onde ficam as cinco pedras e o que a quinta prende. **Não sabe:** que o Kagerō voltou (até o Arco 1).
- **Exemplo (na caixa):** "Você veio sozinho." / "Bom. Quem precisa de companhia para ouvir um velho ainda não está pronto
  para o que eu tenho a dizer." / "Sente. Não... de pé está melhor. Ninja cansado senta; ninja atento, não."
- **Onde aparece:** Missão de Genin, Rito do Despertar e Exame Chunin (`talkDirector`); o Regimento (`FRG_01`); Arco 1.

### Professora Aya (Sala de Taijutsu)
- **Quem é:** trinta e poucos anos, cabelo vermelho preso no alto, bandana na testa e uma faixa no joelho esquerdo que
  ela jura que é só enfeite. A professora de corpo a corpo.
- **Passado:** foi a campeã das corridas entre aldeias por quatro anos seguidos, coisa que ninguém da Chama tinha feito.
  Na quinta corrida, no planalto do Vento Cortante, caiu numa ravina tentando cortar caminho e machucou o joelho para
  sempre. Ficou um ano sem conseguir subir uma escada. Quem a tirou da cama foi o Daichi, que aparecia todo dia com uma
  xícara de chá e não dizia nada. Ela voltou para a Academia jurando que nenhum aluno dela teria medo de chegar perto de
  um inimigo, porque o medo dela, naquela ravina, foi de nunca mais correr.
- **O que quer:** ver um aluno vencer a corrida do planalto (que ela perdeu).
- **O que teme:** ficar parada. Ser "a professora que já foi alguém".
- **O que esconde:** o joelho dói todo dia; ela treina de manhã cedo para ninguém ver que manca.
- **Como fala:** alto, com exclamação, frases curtas de treino ("De novo!", "É assim que se fala!", "Mais perto!").
  Competitiva e brincalhona; transforma tudo em desafio. Quando o assunto é sério, fala baixo de repente, e isso assusta
  mais que o grito.
- **Nunca diz:** "não consigo"; termos técnicos de chakra (ela não tem paciência).
- **Com o jogador:** provoca no primeiro dia, torce no segundo e, depois do Genin, chama para correr com ela ("Sem
  atalho!").
- **Com os outros:** implica com o Kenji (são amigos de infância); deve a vida ao Daichi e não admite.
- **Sabe:** quem treina e quem desiste. **Não sabe:** nada sobre o selo.
- **Exemplo:** "Voltou para treinar? É assim que se fala!" / "Sabe por que eu treino vocês nesta sala, e não lá fora?
  Porque lá fora os lodos revidam. Aqui, o único que revida é o meu orgulho quando alguém desiste." / "Então: de novo!"
- **Onde aparece:** `TUT_AYA_*`.

### Professor Daichi (Sala de Controle)
- **Quem é:** o mais velho dos professores, quase da idade do Diretor; barba branca curta, mãos grossas de quem
  trabalhou com terra. Ensina a meditar e a controlar o chakra.
- **Passado:** foi patrulheiro da Floresta por vinte anos, no tempo em que os lodos eram raros. Na véspera da Noite das
  Cinco Pedras, estava de ronda e sentiu o chão esfriar debaixo dos pés, como se a terra tivesse prendido a respiração. Ele
  avisou e ninguém acreditou até ser tarde; três patrulheiros morreram naquela noite, e um era o irmão dele. Desde então,
  ensina que o corpo sabe antes da cabeça e que a pressa mata mais ninjas que os inimigos. Cultiva um jardim de musgo atrás
  da Academia e conversa com ele.
- **O que quer:** que os alunos aprendam a parar e escutar. Que o próximo aviso não chegue tarde.
- **O que teme:** que o chão esteja esfriando de novo. (Está.)
- **O que esconde:** sente o selo enfraquecer há meses e não sabe a quem contar sem parecer um velho assustado outra vez.
- **Como fala:** devagar, calmo, com metáforas da natureza (raiz, rio, chuva, brasa, estação). Nunca exclama. Deixa
  silêncios. Responde pergunta com outra pergunta gentil.
- **Nunca diz:** gíria; nada com pressa; o nome do irmão (dói).
- **Com o jogador:** paciente sempre. Depois de algumas visitas, conta histórias da patrulha. Depois do Genin, confia ao
  cadete o que sente no chão.
- **Com os outros:** cuidou da Aya quando ela se machucou e nunca cobrou nada; é o único que o Diretor escuta.
- **Sabe:** que o chão anda mais frio. **Não diz:** por quê (planta o Arco 1, `TUT_DAICHI_12`).
- **Exemplo:** "Sente o chão?" / "Não com as mãos. Com a respiração. A terra também respira, devagar, como quem dorme." /
  "Ultimamente... ela anda respirando como quem sonha mal."
- **Onde aparece:** `TUT_DAICHI_*`.

### Professor Kenji (Sala de Jutsus)
- **Quem é:** quarenta anos, cabelo preto espetado, camisa roxa, sempre sorrindo. Ensina o Teleporte e a Substituição.
- **Passado:** cresceu na Praça, filho de um contador de histórias de feira, e aprendeu cedo que fazer as pessoas rirem
  era o jeito mais rápido de fazer elas prestarem atenção. Virou o professor mais querido da Academia. Há quinze anos teve
  um aluno brilhante, quieto, que treinava a Substituição até de madrugada. Kenji ficou orgulhoso. Esse aluno é o Kagerō.
  Quando a bandana dele foi queimada, Kenji passou uma semana sem contar piada, e nunca mais ensinou a Substituição sem
  perguntar ao aluno, de brincadeira, "e você vai usar isso pra quê?".
- **O que quer:** que os alunos se divirtam aprendendo e voltem vivos.
- **O que teme:** ter ensinado o truque à pessoa errada. Esconde esse medo em piada.
- **O que esconde:** guarda num pote, na mesa, o primeiro tronco de Substituição do Kagerō.
- **Como fala:** brincalhão, piadas ruins de propósito, trocadilho com tronco e pouso. Bordão: **"Olha onde vai pousar!"**.
  Quando fica sério, a frase sai pela metade e ele completa com uma piada.
- **Nunca diz:** "Ninguém olha para o tronco." (é a frase do impostor no Arco 1; a pista depende disso).
- **Com o jogador:** amigo desde o primeiro dia. Depois do Genin, conta (rindo, sem graça) que já teve um aluno melhor
  que todos e que "ele foi pousar longe demais".
- **Com os outros:** melhor amigo da Aya desde crianças (brigam como irmãos); morre de medo do Diretor.
- **Sabe:** o truque do tronco melhor que ninguém. **Não sabe:** que o Kagerō voltou.
- **Exemplo:** "Olha onde vai pousar!" / "Não, sério. Metade dos meus alunos aprendeu o Teleporte direitinho... e pousou
  num poço. A outra metade pousou em mim." / "Você vai ser da terceira metade. A que pousa onde quer."
- **Onde aparece:** `TUT_KENJI_*`; o bilhete do fragmento `FRG_02`; Arco 1 (o verdadeiro e o falso).

### Professora Mei (Sala de Armas)
- **Quem é:** cabelo preto longo de lado, bandana, postura reta. Cuida do estoque de armas da Academia e ensina a lançar.
- **Passado:** filha de uma família de ferreiros da Rocha Antiga que se mudou para a Chama quando ela tinha oito anos.
  Cresceu ouvindo que "quem conta duas vezes não perde nada" e conta tudo duas vezes até hoje. Foi da guarda da aldeia
  e, numa patrulha, errou o lançamento que teria salvado um colega; o colega sobreviveu, mas com uma cicatriz no rosto que
  ela vê toda vez que ele passa na Praça. Trocou a patrulha pela Academia para que ninguém mais erre aquele lançamento.
- **O que quer:** precisão. Um golpe certo vale mais que dez errados.
- **O que teme:** que um aluno dela erre quando importa.
- **O que esconde:** sumiram trinta kunais do estoque e ela já contou três vezes; acha que a culpa é dela (Arco 1, M6).
- **Como fala:** séria, frases curtas, números exatos. Sem enfeite, sem exclamação. Elogio raro e curto ("Certo.").
- **Nunca diz:** "mais ou menos"; elogio longo; o nome do colega da cicatriz.
- **Com o jogador:** fria no começo, porque respeito se conquista acertando. Depois de um bom treino, diz um número a
  mais do que o necessário (o jeito dela de conversar).
- **Com os outros:** a única que o Ferreiro Tetsu trata com respeito; acha o Kenji irresponsável e gosta dele mesmo assim.
- **Sabe:** quantas armas tem a Academia, uma a uma. **Não sabe:** quem levou as trinta kunais.
- **Exemplo:** "Três bonecos. Três kunais. Não quatro." / "A quarta é a que você lança com raiva, e essa sempre erra." /
  "Respire. Mire. Solte. Nessa ordem."
- **Onde aparece:** `TUT_MEI_*`; Arco 1 (M6).

### O Cronista (Academia)
- **Quem é:** um homem de idade impossível de dizer, de túnica cinza manchada de tinta, que vive numa sala sem janela no
  fundo da Academia. Guarda a Crônica das Eras.
- **Passado:** ninguém lembra de quando ele chegou. Os registros mais antigos da Academia já citam "o Cronista", e a letra
  é a mesma de hoje. Ele diz que só escreve; que a Crônica é que se lembra. Quem passa a noite na sala dele jura ouvir a
  pena escrevendo sozinha. Toda vez que um Titã cai, ele chora uma lágrima só, sem explicar.
- **O que quer:** que nada do que os jogadores fazem se perca. Registra cada Portador, cada Kage, cada Era.
- **O que teme:** a página em branco do fim (uma Era que ninguém registre).
- **O que esconde:** sabe mais da Crônica do que o mundo já alcançou; as páginas "borradas" são as que ele ainda não pode
  mostrar (Progressão de Mundo).
- **Como fala:** solene, no tempo da história ("Antes das aldeias...", "Toda escolha divide"). Nunca toma partido. Usa
  "nós" para falar da humanidade e "você" para o jogador, como se o jogador já estivesse escrito.
- **Nunca diz:** opinião sobre o certo e o errado; o próprio passado.
- **Com o jogador:** trata cada visita como um capítulo. Quando o jogador traz fragmentos, agradece como quem recebe
  páginas perdidas de um livro que escreveu.
- **Sabe:** a Crônica até onde o mundo cresceu. **Não sabe (ou não diz):** o resto.
- **Exemplo:** "Você trouxe uma página que eu não tinha." / "Não a escrevi. Mas a reconheço: é a letra de alguém que
  estava com medo." / "Sente-se. Toda página com medo merece ser lida devagar."
- **Onde aparece:** `CRN_I` a `CRN_VI`; as falas dos fragmentos (`cronistaFala`).

## Praça e lojas da Chama Eterna

### Mestre da Praça (Chama Eterna)
- **Quem é:** ninja veterano de cabelo branco, capa da aldeia e uma cicatriz no queixo. Cuida da Sala de Missões e dá os
  trabalhos aos cadetes. Guia o jogador no Arco 1.
- **Passado:** foi jounin de patrulha de fronteira por vinte anos, nos Marcos da Fronteira, onde viu mais emboscada do
  que batalha. Perdeu dois aprendizes para os Cinzas numa noite de neblina e pediu para voltar à aldeia "para formar
  ninjas que voltam". A cicatriz no queixo é da professora Mei, de um treino de juventude; ele conta uma versão diferente
  cada vez que perguntam.
- **O que quer:** formar ninjas úteis, não heróis. Herói morre cedo.
- **O que teme:** mandar um cadete numa missão fácil que não era fácil.
- **O que esconde:** guarda as bandanas dos dois aprendizes numa gaveta da Sala de Missões.
- **Como fala:** direto, humor seco, frases de quartel. Chama todo mundo de "cadete" (no jogo hoje: "jovem ninja").
  Explica a missão em ordem: o quê, onde, quantos, e um conselho no fim.
- **Nunca diz:** "boa sorte" (diz que sorte é para quem não treinou).
- **Com o jogador:** exigente e protetor. Depois do Genin, chama pelo título e conta da noite de neblina.
- **Sabe:** onde os lodos aparecem e quais caminhos são seguros. **Não sabe:** do selo (descobre no Arco 1).
- **Exemplo:** "Cadete. Cinco Lodos Verdes na beira do rio." / "Lodo verde não morde forte, mas morde junto. Não deixe três
  te cercarem." / "Volte com os cinco. E volte inteiro, que é a parte que importa."
- **Onde aparece:** `npcLine` em `gameWorld.ts` (missões); Arco 1.

### Ferreiro Tetsu (Armaria)
- **Quem é:** um homem largo, de braços queimados e avental de couro, que trabalha na Armaria da Praça há trinta anos.
- **Passado:** aprendeu o ofício na Rocha Antiga, com o pai, e veio para a Chama atrás de uma moça que vendia flores na
  Praça. Casou com ela. Ela morreu há dez anos, e desde então ele só resmunga, mas toda manhã põe uma flor no balcão. O
  metal ainda vem da Rocha, do Ferreiro das Quatro Aldeias, que foi aprendiz do pai dele.
- **O que quer:** que ninguém morra por causa de uma lâmina mal feita.
- **O que teme:** que o metal que chega da Rocha esteja indo também para quem não devia (está: Arco 1, M6, e Arco da Rocha).
- **O que esconde:** a flor no balcão. Se alguém comenta, ele diz que é para espantar mosquito.
- **Como fala:** resmunga, frases que começam com "Hmpf." Chama o jogador de "garoto" ou "garota" (o jogo troca pelo
  visual: `{garoto}`). Fala de aço como quem fala de gente ("essa lâmina é teimosa").
- **Nunca diz:** "obrigado" sem resmungar antes; o nome da esposa.
- **Com o jogador:** desconfiado até a terceira compra; depois, dá desconto sem dizer que deu.
- **Sabe:** as contas da Armaria; o recibo estranho em papel de pergaminho (Arco 1, M6; `FRG_04`).
- **Exemplo:** "Hmpf. Quer uma kunai, {garoto}?" / "Kunai não é brinquedo. É a última coisa entre você e um lodo com fome."
  / "Essa aqui é boa. Teimosa, mas boa. Igual a mim."
- **Onde aparece:** `LOJ_TETSU_*`; Arco 1 (M6).

### Costureira Hana (Alfaiataria)
- **Quem é:** uma senhora miúda e rápida, de óculos na ponta do nariz e alfinetes presos na manga. Faz as roupas e as
  capas da aldeia inteira.
- **Passado:** criou sozinha três filhos costurando para fora. Os três viraram ninjas e moram em aldeias diferentes, por
  isso ela sabe das notícias das quatro antes de todo mundo: as cartas chegam primeiro à Alfaiataria. Descobriu que saber
  é poder, e que contar na hora certa vale mais que saber.
- **O que quer:** saber primeiro; contar depois. E que os filhos escrevam mais.
- **O que teme:** a próxima guerra entre aldeias, porque cada filho está de um lado.
- **O que esconde:** costura bandanas de graça para cadetes pobres e finge que foi engano no troco.
- **Como fala:** rápido, simpática, fofoqueira; frases que viram outras frases; chama o jogador de "querido" ou "querida"
  (`{querido}`). Repete a palavra mais importante em tom de segredo ("Fumaça, querido! Fumaça!").
- **Nunca diz:** que é fofoca ("é informação, querido").
- **Com o jogador:** adota no primeiro dia. Depois de algumas visitas, conta uma notícia de outra aldeia a cada conversa.
- **Sabe:** quem comprou tecido cinza (Arco 1, M7). **Não sabe:** guardar segredo por mais de uma semana.
- **Exemplo:** "Ah, {querido}! Entra, entra, não repara a bagunça." / "Sabia que a filha do vendedor de chá vai casar com
  um rapaz da Maré? Da MARÉ!" / "Agora me diz: que capa você quer? Uma que assuste ou uma que encante?"
- **Onde aparece:** `LOJ_HANA_*`; Arco 1 (M7).

### Sábio Ren (Casa dos Pergaminhos)
- **Quem é:** um homem alto e curvado, de cabelo branco comprido e dedos manchados de tinta. Guarda o saber dos selos e
  faz os pergaminhos lisos da Extração.
- **Passado:** foi o aluno mais estudioso da geração do Kenji e da Aya, e o único que nunca conseguiu fazer a
  Substituição. Trocou a luta pelos livros e virou a maior memória viva de selos da aldeia. Quando era jovem, achou na
  Casa dos Pergaminhos um mapa com cinco pontos e perguntou ao Diretor o que era; o Diretor tirou o mapa da mão dele e
  nunca devolveu. Ele passou trinta anos tentando lembrar dos pontos.
- **O que quer:** entender. Tudo. Principalmente o que o Diretor não conta.
- **O que teme:** que o saber se perca porque ninguém quis ouvir um velho falador.
- **O que esconde:** desenhou de memória três dos cinco pontos daquele mapa e guarda o desenho numa gaveta trancada.
- **Como fala:** erudito, frases completas, explica demais; cita livros que ninguém leu. **Sussurra** quando o assunto é
  sério ("(baixinho)").
- **Nunca diz:** "não sei" (diz "ainda não sei").
- **Com o jogador:** ensina de graça a quem pergunta. Depois do Genin, mostra o desenho dos três pontos (Arco 1).
- **Sabe:** como a Extração funciona; que existem cinco pedras. **Não sabe:** onde ficam todas. É a pista falsa do Arco 1
  (é inocente).
- **Exemplo:** "Ah, um leitor. Raro, hoje em dia." / "Este pergaminho parece liso, não parece? (baixinho) Nenhum
  pergaminho é liso. Só está esperando a pergunta certa." / "A Extração é isso: fazer a pergunta certa a um papel."
- **Onde aparece:** `LOJ_REN_*`; o fragmento `FRG_05`; Arco 1 (M4, M15).

### Guia do Posto de Viagem (há um em cada Posto)
- **Quem é:** os Postos de Viagem são cuidados por guias da guilda de mensageiros, gente das quatro aldeias que jurou não
  tomar partido. Usam capa de viagem marrom e um pergaminho de rotas nas costas.
- **Passado (o guia do Posto da Chama):** nasceu no Vento Cortante, filho de caravaneiros, e cresceu sem casa fixa. Entrou
  para os mensageiros porque era o único trabalho em que todas as aldeias abriam a porta. Já levou recado de paz e de
  guerra no mesmo dia e aprendeu a não perguntar o que está escrito.
- **O que quer:** que as estradas fiquem abertas. Estrada fechada é o primeiro sinal de guerra.
- **O que teme:** o dia em que uma aldeia pedir para ele levar uma faca em vez de um recado.
- **Como fala:** prático, simpático, fala de distância em "sóis" e "luas"; termina com um provérbio de estrada.
- **Nunca diz:** o que leva nos recados; de que lado está.
- **Exemplo:** "Para onde vai, viajante?" / "A Zona fica a meio sol daqui, se o vento ajudar. Se não ajudar, a gente vai
  assim mesmo." / "Estrada boa é estrada que volta."
- **Onde aparece:** os Postos de Viagem (hoje sem fala; só a lista de destinos).

## Os Mestres das outras aldeias (a mesma pessoa que guia o Arco 1 de cada uma)

O Mestre da Maré Oculta é o **Mestre das Cifras**, a Mestra do Vento Cortante é a **Mestra das Caravanas** e o Mestre da
Rocha Antiga é o **Chefe dos Mineiros**. As fichas estão na Parte 2, junto com o arco de cada aldeia.

## Vozes dos fragmentos

Os 17 fragmentos da Crônica espalhados pelo mapa são escritos por pessoas. Cada voz tem dono, passado e limite (o que não
sabe).

| Voz | Quem é | Passado | Registro | O que não sabe |
|---|---|---|---|---|
| A guarda da aldeia (`FRG_03`) | A sentinela do portão sul, de turno da noite | Está na guarda há 12 anos; nunca viu um lodo passar do portão até agora | Aviso público, imperativo, seco | Por que a grade do canal está suja |
| Um patrulheiro da Chama Eterna (`FRG_08`) | Patrulheiro jovem da Floresta, do grupo que o Daichi treinou | Escreve um diário para a mãe que não sabe ler; quem lê para ela é a Hana | Diário cansado, honesto, datado | Que os superiores sabem e escondem |
| Alguém de capa cinza (`FRG_07`) | Um mercenário dos Cinzas, contratado, não fiel | Expulso da Maré por roubar redes; vende serviço a quem pagar | Bilhete rápido, irônico | O plano inteiro do chefe |
| Um renegado (`FRG_13`) | Um velho renegado do Refúgio | Riscou a bandana há 20 anos por amor a alguém de outra aldeia; nunca soube se valeu a pena | Orgulho amargo, a giz | O que acontece com quem volta |
| A escuta do porto da Maré Oculta (`FRG_14`) | Uma informante da Maré disfarçada de vendedora de chá na Chama | Mora há 6 anos na Chama; gosta da aldeia mais do que deveria | Carta diplomática, educada, cifrada | Se o boato é verdade |
| O povo do Vento Cortante (`FRG_15`) | Uma canção de caravana | Cantada há séculos; cada geração muda um verso | Rima solta de trabalho | História; só o que o povo canta |
| O povo da Rocha Antiga (`FRG_16`) | O juramento gravado na muralha | Dito por quem sobrevive ao primeiro cerco | Solene e lento | Nada: é promessa, não informação |
| O próprio lugar (`FRG_06`, `FRG_10`, `FRG_11`, `FRG_12`) | O narrador do cenário | — | Sensorial: cheiro, frio, som | Tudo o que não se vê |

---

# Parte 2: quem está nos roteiros (ainda não no jogo)

## Arco 1 da Chama Eterna (`docs/historia/arco-1.md`)

### Akane
- **Quem é:** colega de turma do jogador, rival amigável, cabelo curto e joelhos sempre ralados.
- **Passado:** filha de um patrulheiro que morreu numa missão quando ela tinha seis anos. A mãe trabalha de noite na
  cozinha do Hospital, e a Akane cresceu sozinha na Praça, desafiando todo mundo para corrida para não ficar em casa vazia.
  Quer ser a primeira da turma porque acha que, se for boa o bastante, ninguém vai deixá-la sozinha de novo.
- **O que quer:** ganhar. E ter alguém que volte por ela.
- **O que teme:** ser deixada para trás.
- **O que esconde:** chora quando perde, escondida atrás da Academia.
- **Como fala:** impulsiva, provocadora, rápida; desafia ("Aposto que..."); quando está com medo, fala mais alto.
- **Exemplo:** "Você é o cadete que o Mestre escolheu? Hm." / "Aposto que derrubo oito lodos antes de você. E se eu
  ganhar, você me conta tudo o que o Mestre te disse."
- **Onde aparece:** Arco 1 (M3, M9, M14, M15).

### Kagerō
- **Quem é:** ex-aluno da Academia, líder dos Cinzas neste arco. Magro, calmo, de capa cinza e bandana queimada no pulso.
- **Passado:** o melhor aluno que o Diretor teve, aluno favorito do Kenji. Órfão, criado pela Academia, acreditava que o
  chakra das Pedras da Vigília era desperdiçado prendendo um monstro que podia ser usado para proteger a aldeia. Tentou
  provar isso sozinho, foi pego e teve a bandana queimada diante de todos. Na mesma noite, o Diretor disse a ele: "um
  dia você vai entender". Ele nunca entendeu, e quer que o Diretor explique, nem que seja com a aldeia em chamas.
- **O que quer:** o chakra do Lodo, e uma resposta do Diretor.
- **O que teme:** estar errado esse tempo todo.
- **Como fala:** calmo, educado, irônico; nunca levanta a voz. Bordão: **"Ninguém olha para o tronco."**
- **Exemplo:** "A Vila te ensinou a confiar. Eu vim te ensinar o resto."
- **Onde aparece:** Arco 1 (M7 a M14, como o falso Kenji e como ele mesmo).

## Arco 1 da Maré Oculta: Maré Baixa (`docs/historia/arco-1-mare.md`)

### Diretora da Academia da Maré
- **Quem é:** muito velha, cega de um olho, conhece todo mundo pela voz e pelo jeito de pisar na madeira.
- **Passado:** perdeu a vista do olho esquerdo num naufrágio na névoa, aos vinte anos, quando o farol apagou por uma
  noite. Desde então só confia no que ouve. Expulsou a Umiko, a melhor aluna de cifras que já teve, e se pergunta todo dia
  se errou.
- **O que quer:** que nenhuma noite de névoa fique sem farol.
- **Como fala:** responde com perguntas, nunca afirma ("Quem disse que você está pronto?").
- **Onde aparece:** Arco da Maré (M5, M9, M12).

### Mestre das Cifras (o Mestre da Maré Oculta)
- **Quem é:** professor de cifras e quem dá as missões na Maré. Magro, de dedos sempre sujos de tinta azul.
- **Passado:** foi decifrador da guerra das marés, quando a Maré quase brigou com a Chama por causa de uma carta mal
  lida. Uma vírgula fora do lugar quase matou duzentas pessoas. Desde então termina tudo o que escreve com a **onda dupla**,
  para que ninguém confunda a letra dele com a de mais ninguém.
- **O que quer:** que nenhuma mensagem seja lida errado.
- **Como fala:** pouco; desenha no ar o que pensa enquanto fala; frases incompletas que o desenho termina.
- **Onde aparece:** Missões da Maré; Arco da Maré.

### Guardiã do Farol
- **Quem é:** cuida do farol há trinta anos; seca, prática, de mãos rachadas pelo sal.
- **Passado:** filha do faroleiro da noite em que o farol apagou e a Diretora perdeu o olho. O pai dela morreu tentando
  reacender a luz. Ela jurou que o farol nunca mais apagaria enquanto ela vivesse.
- **Como fala:** conta tudo em marés ("três marés atrás"); não perde tempo com gentileza.
- **Onde aparece:** Arco da Maré (M4, M8, M13); volta no arco regional (Namiko).

### Vendedora de Redes
- **Quem é:** tem barraca no cais; ouve as fofocas dos pescadores.
- **Passado:** viúva de pescador que sumiu na névoa; vende as redes que o marido fazia e ouve tudo o que os pescadores
  contam esperando um dia ouvir o nome dele.
- **Como fala:** rápido e baixinho, olhando para os lados.
- **Onde aparece:** Arco da Maré (M6).

### Mio (escolha 29A)
- **Quem é:** colega de turma, rival amigável; calada e competitiva.
- **Passado:** gêmea do Kai. Os dois cresceram trocando bilhetes cifrados por baixo da porta do quarto, numa cifra só
  deles. Ela sempre foi a mais forte; ele, o mais esperto. Quando o Kai foi adiantado um ano na Academia, ela sentiu que
  ficou para trás e passou a treinar o dobro. Responde em uma palavra porque, se falar mais, a voz treme.
- **O que quer:** o irmão de volta, e provar que não precisa dele (as duas coisas).
- **Como fala:** uma palavra por vez ("Hm.", "Empate."); quando se abre, fala tudo de uma vez.
- **Onde aparece:** Arco da Maré.

### Kai (escolha 30B)
- **Quem é:** irmão gêmeo da Mio, adiantado um ano na Academia; gentil.
- **Passado:** o melhor aluno de cifras da turma dele, o que chamou a atenção da Umiko. Gagueja quando está nervoso desde
  pequeno; na cifra, nunca gagueja, por isso ama escrever.
- **Como fala:** gentil, gagueja nas primeiras palavras quando está com medo.
- **Onde aparece:** Arco da Maré (M11, M15).

### Umiko, a Voz da Névoa (escolha 26C)
- **Quem é:** ex-aluna da Academia da Maré, contrabandista das Cinzas. Doce, educada, canta baixinho.
- **Passado:** filha de uma cantora de taverna do cais, aprendeu a imitar qualquer voz para fazer a mãe rir. Na Academia,
  era a melhor em cifras, mas pobre; vendeu uma cifra velha para pagar o remédio da mãe. Foi expulsa na semana em que a
  mãe morreu. Para ela, a aldeia que guarda segredos deixou a mãe morrer por causa de um segredo.
- **O que quer:** vender todos os segredos da Maré, um por um.
- **Como fala:** doce, educada, sempre agradece; canta entre as frases.
- **Exemplo:** "Você seguiu cada garrafa, Genin. Obrigada pela companhia."
- **Onde aparece:** Arco da Maré (M11 a M14).

## Arco 1 do Vento Cortante: Livre como o Vento (`docs/historia/arco-1-vento.md`)

### Diretor da Academia do Vento
- **Quem é:** ex-corredor, nunca para quieto; termina tudo com "vai, vai".
- **Passado:** venceu a corrida do planalto aos quinze anos, o mais novo da história. Expulsou o Jinto quando um dos três
  alunos que ele levou atrás do ninho não voltou. Desde então, é a primeira vez que ele fica parado (M11).
- **Onde aparece:** Arco do Vento (M5, M9, M11, M12).

### Mestra das Caravanas (a Mestra do Vento Cortante)
- **Quem é:** comanda as caravanas do planalto e dá as missões no Vento. Canta enquanto trabalha.
- **Passado:** nasceu numa carroça, no meio de uma tempestade, e diz que por isso não tem medo de vento. Perdeu uma
  caravana inteira para bandidos aos vinte e cinco anos e canta para não lembrar.
- **Como fala:** direta; mistura instrução com versos de canção ("♪ quem quer o caminho... ♪").
- **Onde aparece:** Missões do Vento; Arco do Vento; arco regional (Jinra).

### Velho das Pipas
- **Quem é:** cuida da Pedra das Pipas há cinquenta anos.
- **Passado:** era o melhor fazedor de pipas do planalto. Viu o vento parar um dia inteiro há trinta anos e ninguém
  acreditou nele. Desde então anota o vento todo dia num caderno.
- **Como fala:** devagar, com histórias antigas; chama todo mundo de "menino" ou "menina".
- **Onde aparece:** Arco do Vento (M2, M15); arco regional.

### Rai (escolha 31A)
- **Quem é:** o cadete mais rápido da turma; convencido, provoca, ri alto; usa uma tornozeleira de sinos.
- **Passado:** filho caçula de uma família de corredores; os três irmãos mais velhos venceram a corrida do planalto. Ele
  precisa vencer para ser alguém em casa. A tornozeleira era do avô, o primeiro corredor da família.
- **O que teme:** ser o único da família que perdeu. (Perde, por sabotagem, na M9.)
- **Como fala:** convencido, ri alto, provoca; quando perde, fica sério e seco.
- **Onde aparece:** Arco do Vento; é "o cadete que falhou no rito" do arco regional.

### Jinto, o Instrutor Caído (escolha 27C)
- **Quem é:** ex-instrutor de pipas e de corrida da Academia do Vento, chefe do bando do planalto.
- **Passado:** cresceu ouvindo a lenda do Grito do Céu e acreditava que a ave era real. Como instrutor, levou três alunos
  atrás do ninho; voltaram dois. Expulso, tomou para si o nome da ave da lenda (por isso Jinto soa como Jinra) e passou a
  oferecer aos cadetes "o que a Academia não dá": liberdade sem regra.
- **Como fala:** animado, simpático, fala de liberdade como quem vende.
- **Exemplo:** "A Academia te ensinou a correr. Eu vim te ensinar a voar."
- **Onde aparece:** Arco do Vento (M8 a M14).

## Arco 1 da Rocha Antiga: A Primeira Pedra (`docs/historia/arco-1-rocha.md`)

### Guardiã da Muralha
- **Quem é:** muito velha; dirige a Academia da Muralha e cuida da muralha dos nomes. Conta tudo em gerações.
- **Passado:** quando jovem, raspou o nome da família do Gendoumaru da muralha, certa de que o pai dele abriu o portão
  num cerco. Quarenta anos depois, ainda passa a mão no trecho liso.
- **Como fala:** devagar; "no tempo da minha avó..."
- **Onde aparece:** Arco da Rocha; arco regional (O Colosso dos Nomes).

### Chefe dos Mineiros (o Mestre da Rocha Antiga)
- **Quem é:** cuida das minas e dá as missões na Rocha; rude, honesto, grita por cima do barulho.
- **Passado:** ficou soterrado três dias numa galeria aos dezoito anos e sobreviveu cantando para não dormir. Desde
  então fala alto porque acha que, debaixo da terra, quem fala baixo morre esquecido.
- **Como fala:** grita, depois repete baixo; xinga em voz baixa.
- **Onde aparece:** Missões da Rocha; Arco da Rocha; arco regional.

### Ferreiro das Quatro Aldeias
- **Quem é:** vende kunais para as quatro aldeias; fala de negócios até em velório.
- **Passado:** foi aprendiz do pai do Ferreiro Tetsu. Neutro por profissão: vende a todos para que ninguém precise roubar.
- **Como fala:** tudo vira negócio ("péssimo para os negócios").
- **Onde aparece:** Arco da Rocha; arco regional.

### Ganrou (escolha 32B)
- **Quem é:** neto de uma família com dez nomes na muralha; orgulhoso, formal.
- **Passado:** criado ouvindo as histórias dos dez antepassados; acha que tem de merecer o próprio nome antes de gravá-lo.
  No desabamento da M9, pela primeira vez, sente que a muralha pode cair, e isso o muda.
- **Como fala:** formal, fala dos antepassados; não admite ajuda, mas aceita.
- **Onde aparece:** Arco da Rocha; o nome dele é o primeiro a sumir da muralha (gancho do arco regional).

### Gendoumaru, o Engenheiro (escolha 28A)
- **Quem é:** o engenheiro-chefe da muralha, amado pela aldeia; gentil e paciente; bate três vezes na pedra antes de
  trabalhar.
- **Passado:** tinha a idade do jogador quando rasparam o nome da família dele da muralha, acusada de abrir o portão
  num cerco. O pai jurou inocência até morrer. O menino virou o melhor engenheiro da aldeia e passou quarenta anos
  consertando a muralha que apagou o nome dele, esperando a hora de derrubá-la.
- **Como fala:** gentil, ensina tudo, nunca levanta a voz; "pedra tem paciência; eu também".
- **Onde aparece:** Arco da Rocha (M2 a M14).
