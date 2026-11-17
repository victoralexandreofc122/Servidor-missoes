// v64: lore no jogo (docs/lore/). Fragmentos da Crônica espalhados pelos mapas (narrativa ambiental: quem explora acha),
// as falas dos lojistas, as dicas que aparecem só na hora (tutorial contextual) e a folha de controles.
//
// Cada texto tem um ID: é a mesma chave da planilha de diálogos (docs/lore/dialogos.csv, gerada por
// scripts/gerar-dialogos.ts; o teste test/lore.test.ts confere que a planilha está igual ao jogo).
// Nomes próprios: só os que já existem no jogo e os que o Victor escolheu em 15/11/2026 (docs/lore/propostas-de-nomes.md).

/**
 * Fragmentos da Crônica: objetos e documentos achados pelo mundo. `x`, `y` = onde brilham (chão livre, conferido no
 * teste); `lugar` = o nome do mapa (igual ao do servidor, conferido); `por` = quem escreveu (a voz; docs/lore/artefatos.md).
 */
export const FRAGMENTS = [
  { id: 'FRG_01', map: 'academy_interior', lugar: 'Academia', x: 60, y: 6, title: 'Regimento da Academia (cópia na parede)', por: 'O Diretor da Academia',
    text: "Artigo 7. Na Noite das Lanternas, a cada formatura, o Diretor reacenderá as Pedras da Vigília com o Pergaminho em Chamas. Onde ficam as pedras não será escrito, ensinado nem perguntado.\n\nParágrafo único: o cadete que perguntar será lembrado de que perguntar também é uma forma de procurar.\n\nNa margem, a lápis, numa letra de criança que alguém tentou apagar: \"E se a pedra apagar quando o Diretor estiver dormindo?\" Embaixo, em tinta, na letra firme do Diretor: \"Então alguém terá de estar acordado.\"" },
  { id: 'FRG_02', map: 'academy_interior', lugar: 'Academia', x: 38, y: 13.5, title: 'Bilhete na mesa da Sala de Jutsus', por: 'Professor Kenji',
    text: "Lembrete para mim mesmo: gritar \"Olha onde vai pousar!\" ANTES do aluno saltar o vão, não depois. A Aya ainda está brava comigo por causa da semana passada. Ninguém se machucou. Quase ninguém.\n\nOutro lembrete: parar de olhar para o pote. O tronco lá dentro não vai responder, e o menino que o deixou ali também não.\n\nÚltimo lembrete: comprar flores para a Aya. Dizer que são do Daichi. Ela aceita mais fácil. K." },
  { id: 'FRG_03', map: 'map_1', lugar: 'Aldeia da Chama Eterna', x: 33, y: 25.6, title: 'Placa junto à grade do canal', por: 'A guarda da aldeia',
    text: "AVISO. A água deste canal vem do Rio das Raízes, por baixo da Floresta. Não beber. Não pescar. Não descer. A grade é verificada toda manhã pela guarda do portão sul.\n\nEmbaixo, riscado à mão, com pressa: \"Hoje ninguém verificou. A grade está torta. Do lado de dentro.\"\n\nE mais embaixo ainda, numa letra trêmula: \"Do lado de DENTRO. Alguém me escute.\"" },
  { id: 'FRG_04', map: 'interior_weapons', lugar: 'Armaria', x: 12, y: 8.5, title: 'Recibo esquecido no balcão', por: 'Ferreiro Tetsu',
    text: "Saída: 30 kunais de treino, para a Academia. Assinatura: ilegível. Papel: de pergaminho, do bom, coisa que a Academia nunca usou para recibo.\n\nAnotação do ferreiro, em letra grossa: conferir com a Professora Mei. Conferir DE NOVO. A Mei conta tudo duas vezes; se ela não sabe dessas trinta, ninguém sabe.\n\nNo verso, um borrão de cera de vela e o desenho de uma flor, apagado com o polegar." },
  { id: 'FRG_05', map: 'interior_scrolls', lugar: 'Casa dos Pergaminhos', x: 12, y: 8, title: 'Anotação sobre o pergaminho liso', por: 'Sábio Ren',
    text: "O pergaminho liso não ensina: ele lê. A fibra guarda o formato da brasa de quem o abre e devolve o jutsu que essa brasa já sabia fazer sem saber. Por isso não sai jutsu de outra classe. E por isso quem erra e tenta de novo acerta mais: o papel aprende.\n\nPergunta que ninguém me deixa fazer em voz alta: se o papel lê a brasa de quem o abre, o que leria se alguém o abrisse em cima de uma Pedra da Vigília?\n\n(Riscado com força) Não escrever isso. O Diretor lê tudo o que eu escrevo." },
  { id: 'FRG_06', map: 'map_2', lugar: 'Floresta', x: 32, y: 42.5, title: 'Marcas no velho carvalho', por: 'O próprio lugar',
    text: "No tronco do velho carvalho, uma chama entalhada há muito tempo, quase fechada pela casca, como uma ferida que a árvore tentou esconder.\n\nEmbaixo, riscos de patrulha, um por noite, em fileiras de dez. Centenas. Anos de gente passando ali no escuro e deixando a marca de que voltou.\n\nOs riscos param no meio de uma fileira, como se a última pessoa a contar tivesse ido embora e não voltado. O chão em volta está frio, mesmo ao meio-dia." },
  { id: 'FRG_07', map: 'map_2', lugar: 'Floresta', x: 20, y: 56, title: 'Bilhete chamuscado no acampamento', por: 'Alguém de capa cinza',
    text: "Três noites aqui. Fogueira pequena, ninguém da aldeia vem tão fundo. O chefe quer o mapa até a lua cheia. Diz que a gente vai devolver a Chama a quem ela pertence.\n\nEu não sei a quem ela pertence. Sei que me pagam em moeda nova e que me deram uma capa cinza que cheira a fumaça. Fui expulso da Maré por roubar redes. Roubava para comer.\n\nEu só quero a minha bandana de volta. Queimem este papel. Se alguém achar, não fui eu que escrevi." },
  { id: 'FRG_08', map: 'map_2', lugar: 'Floresta', x: 80, y: 40, title: 'Diário de um patrulheiro', por: 'Um patrulheiro da Chama Eterna',
    text: "Dia 12. Mãe, a Hana lê isto para a senhora, então não chore na frente dela, que ela conta para a aldeia inteira.\n\nOs lodos escuros nascem onde a água aflora. Não são bichos: furei um e ele virou chakra no chão, quente, como sangue. Disseram que é normal. Normal era um por semana. Hoje contei nove.\n\nPedi reforço. Responderam que é normal. O velho Daichi foi o único que não riu. Ele ficou olhando para o chão, mãe, como quem escuta alguém que a gente não ouve." },
  { id: 'FRG_09', map: 'caverna_lodo', lugar: 'Caverna do Lodo', x: 28, y: 14.5, title: 'Escrito na pedra da caverna', por: 'Mãos de duas épocas',
    text: "Em letra antiga, funda na pedra, feita com ferramenta e paciência: AQUI O RIO DESCE. NÃO SIGA O RIO.\n\nEmbaixo, em letra nova, riscada às pressas com a ponta de uma kunai: \"seguimos\".\n\nDo lado, três marcas de mão em lodo seco, de tamanhos diferentes. A menor é de criança. Depois disso, ninguém escreveu mais nada, e a pedra está quente ao toque." },
  { id: 'FRG_10', map: 'clareira_queimada', lugar: 'Clareira Queimada', x: 18.5, y: 19.5, title: 'O círculo de cinzas', por: 'O próprio lugar',
    text: "Nada cresce dentro do círculo. As cinzas não esfriam, nem na chuva. Os pássaros contornam a clareira no ar, como se houvesse uma parede que só eles veem.\n\nQuem encosta a mão no chão sente um pulso, lento, de alguma coisa enorme lá embaixo. Uma batida a cada muitos segundos, como quem dorme fundo.\n\nNo centro, uma pedra com uma chama gravada, rachada ao meio. Alguém deixou ao lado dela uma flor de papel, nova." },
  { id: 'FRG_11', map: 'poco', lugar: 'Poço sob a Praça', x: 12, y: 4.5, title: 'A pedra fria', por: 'O próprio lugar',
    text: "No fundo do poço, uma pedra com uma chama gravada, maior que as outras. Fria, como as outras ficariam se apagassem. Embaixo da chama há um segundo símbolo, uma espiral que não é de nenhuma das quatro aldeias.\n\nDe tempos em tempos ela pisca uma vez só, devagar, como um olho que se fecha.\n\nQuem fica muito tempo ali jura ouvir, por baixo da pedra, um som de respiração. Não de lodo. De outra coisa." },
  { id: 'FRG_12', map: 'zona_conflito', lugar: 'Zona de Conflito', x: 55, y: 40, title: 'O marco derrubado', por: 'O próprio lugar',
    text: "Um marco de fronteira caído, com os símbolos das quatro aldeias: a chama, a onda, o redemoinho de vento, a montanha. Cada um foi riscado por uma mão diferente, com uma arma diferente.\n\nNinguém nunca o pôs de pé. Quem levanta o marco aceita a divisão, e ninguém aqui aceita. Mas também ninguém o quebra: quebrar seria admitir que não há nada a dividir.\n\nEmbaixo dele, a terra está mais fria. Os mais velhos dizem que é porque o meio do mundo guarda o que os fundadores prenderam." },
  { id: 'FRG_13', map: 'refugio', lugar: 'Refúgio dos Renegados', x: 13, y: 25, title: 'A bandana pregada na parede', por: 'Um renegado',
    text: "Uma bandana com um risco fundo de lâmina sobre o símbolo, pregada na parede como troféu.\n\nEmbaixo, a giz: \"Risquei a minha com a minha mão. Ninguém queimou nada meu. Lembre a diferença.\"\n\nMais embaixo, a giz mais apagado, de outro dia: \"Risquei por alguém de outra aldeia. Vinte anos. Ela nunca veio. Mesmo assim, foi a única coisa que eu escolhi sozinho na vida. Não me arrependo. Quase nunca.\"" },
  { id: 'FRG_14', map: 'vila_nevoa', lugar: 'Aldeia da Maré Oculta', x: 30, y: 25.5, title: 'Carta cifrada, já decifrada', por: 'A escuta do porto da Maré Oculta',
    text: "Ao Conselho. A névoa trouxe notícias da Chama Eterna: um lodo dentro da aldeia deles, dizem os pescadores. Recomendo silêncio e atenção. Quem guarda um selo sozinho guarda também um segredo sozinho.\n\nAnotação pessoal, fora da cifra, depois apagada (mas não o bastante): moro aqui há seis anos vendendo chá. As crianças da Praça me chamam de tia. Se o Conselho mandar eu fazer mal a esta aldeia, não sei se obedeço.\n\nRespeitosamente." },
  { id: 'FRG_15', map: 'vila_nuvem', lugar: 'Aldeia do Vento Cortante', x: 30, y: 25.5, title: 'Canção dos carregadores', por: 'O povo do Vento Cortante',
    text: "Corre, que o vento não espera, / corre, que a pedra não te ama. / Quem repartiu a Chama inteira / deixou pra nós só uma brasa.\n\nCorre até o sol cair: / a terra do meio não é de ninguém, / mas é de quem chegar primeiro, / e quem chega primeiro não volta mais.\n\n(Verso que as crianças cantam e os adultos mandam calar): / lá no alto, onde o vento nasce, / um grito dorme num ninho de pedra. / Quando ele acordar, / o vento vai parar." },
  { id: 'FRG_16', map: 'vila_areia', lugar: 'Aldeia da Rocha Antiga', x: 22, y: 42, title: 'Juramento gravado na muralha', por: 'O povo da Rocha Antiga',
    text: "Gravado na pedra, sob centenas de nomes: \"Seguramos o que caiu sobre nós. Seguraremos o que cair sobre os nossos filhos. A pedra não esquece, e nós somos a pedra.\"\n\nAo lado, no meio dos nomes mais antigos, um trecho liso, raspado. A pedra ali é mais clara, como pele onde ficou um anel por muitos anos.\n\nAlguém passou a mão tantas vezes nesse trecho que ele ficou polido." },
  { id: 'FRG_17', map: 'vale_estatuas', lugar: 'Arena das Quatro Heranças', x: 4, y: 11, title: 'Inscrição na base das estátuas', por: 'Quem ergueu a Arena',
    text: "Quatro heranças, uma Chama. Aqui se luta para medir, não para tomar. Quem vence leva a honra; quem perde leva a lição; quem mata um aliado leva a bandana queimada.\n\nEm cada estátua, alguém deixou uma oferenda: uma lanterna apagada na da Chama, uma concha na da Maré, uma pena na do Vento, uma lasca de pedra na da Rocha.\n\nNa base, quase apagado: \"Que um dia as quatro voltem a ser uma. Mas não à força.\"" },
];

/** Distância (casas) para achar um fragmento. */
export const FRAGMENT_REACH = 1.6;

/**
 * Falas dos lojistas (uma por vez, em rodízio, ao abrir a loja). `{garoto}` e `{querido}` seguem o visual do jogador.
 * As vozes estão em docs/lore/personagens.md.
 */
export const SHOP_BARKS = {
  weapons: [
    { id: 'LOJ_TETSU_01', text: "Hmpf. Kunai boa não se escolhe pela cor, {garoto}. Se escolhe pelo peso.\n\nPega essa. Sente? Teimosa. Vai te obedecer quando você parar de brigar com ela. Igual a mim." },
    { id: 'LOJ_TETSU_02', text: "Trinta kunais de treino sumiram. Com recibo! Desde quando ladrão dá recibo?\n\nE em papel de pergaminho, {garoto}. Do bom. Alguém de dentro, ouve o que eu digo. Alguém de dentro." },
    { id: 'LOJ_TETSU_03', text: "O metal vem da Rocha Antiga. Aprendi a bater ferro lá, com meu pai, antes de vir atrás de uma moça que vendia flores na Praça.\n\nCasei com ela. (ele olha para a flor no balcão) Guerra sobe, preço sobe. Não reclame comigo." },
    { id: 'LOJ_TETSU_04', text: "Quebrou? Volte. Perdeu? Não volte.\n\nBrincadeira. Volte. Ninja sem arma é ninja que eu não vejo mais. E eu já não vejo gente demais, {garoto}." },
  ],
  clothes: [
    { id: 'LOJ_HANA_01', text: "Entra, {querido}! Não repara a bagunça. Capa nova e fofoca nova: a fofoca é de graça, a capa não.\n\nAgora me diz: você quer uma capa que assuste ou uma que encante?" },
    { id: 'LOJ_HANA_02', text: "Um homem comprou tecido cinza. MUITO tecido cinza. Pagou com moeda novinha e cheirava a fumaça, {querido}. Fumaça!\n\nQuem é que precisa de tanto cinza? Gente triste ou gente que quer sumir. E triste não paga adiantado." },
    { id: 'LOJ_HANA_03', text: "O melhor tecido vem da Maré Oculta, e vem sempre com perguntas junto. Meu filho do meio mora lá, sabia?\n\nOs três viraram ninjas, cada um numa aldeia. Escrevem pouco. Se você for para lá, diz que a mãe mandou escrever." },
    { id: 'LOJ_HANA_04', text: "Cinza, {querido}, é a cor de quem foi embora. Escolha outra.\n\n(ela baixa a voz) Se faltar dinheiro para a bandana, me avisa. Eu erro no troco. Erro muito no troco." },
  ],
  scrolls: [
    { id: 'LOJ_REN_01', text: "Ah, um leitor. Raro, hoje em dia.\n\nO pergaminho liso não ensina: ele lê. Sente-se e deixe que ele leia você. Nenhum pergaminho é liso, só está esperando a pergunta certa." },
    { id: 'LOJ_REN_02', text: "Errou a Extração? O papel aprendeu um pouco do seu formato. Tente de novo.\n\nEu nunca consegui fazer a Substituição, sabia? Troquei a luta pelos livros. O papel nunca riu de mim." },
    { id: 'LOJ_REN_03', text: "(baixinho) Se ouvir falar de pedras que esfriam sozinhas... conte só para mim.\n\nUma vez achei um mapa com cinco pontos. O Diretor tirou da minha mão. Faz trinta anos que eu tento lembrar onde ficavam." },
    { id: 'LOJ_REN_04', text: "Cada tier pede mais papel porque pede mais de você.\n\nO papel não é caro. Caro é o que ele te pede de volta: atenção. A Extração é fazer a pergunta certa a um papel." },
  ],
};

/** Troca o gênero das falas pelo do visual do jogador ('f' = feminino). */
export function personalize(text, gender) {
  const f = gender === 'f';
  return text.replace(/\{garoto\}/g, f ? 'garota' : 'garoto').replace(/\{querido\}/g, f ? 'querida' : 'querido');
}

/**
 * Dicas na hora (tutorial contextual: o guia pede pistas que surgem no momento exato da ação, não um tutorial longo).
 * Cada uma aparece UMA vez por aparelho; o jogador pode desligar todas em Config. `quando` documenta o gatilho
 * (o código que dispara está em game.js, com o mesmo ID).
 */
export const HINTS = [
  { id: 'DCA_FLORESTA', quando: 'Primeira vez na Floresta', text: 'Floresta! Os Lodos Verdes ficam perto do portão; os Escuros, na beira do rio. Fique perto da saída até o nível 5.' },
  { id: 'DCA_VIDA_BAIXA', quando: 'Vida abaixo de 35% fora da zona segura', text: 'Vida baixa! Afaste-se e medite 🧘 (apanhar corta a meditação) ou volte para a aldeia.' },
  { id: 'DCA_SEM_CHAKRA', quando: 'Jutsu recusado por falta de chakra', text: 'Sem chakra para esse jutsu. Medite 🧘: é bem mais rápido do que esperar.' },
  { id: 'DCA_PONTOS', quando: 'Subiu de nível com pontos para gastar', text: 'Você tem pontos de atributo! Gaste no Perfil (botão do seu retrato).' },
  { id: 'DCA_MORTE', quando: 'Primeira queda', text: 'Caiu? Acontece. Você volta na praça. A 🪵 Substituição anula um golpe: arme antes do perigo.' },
  { id: 'DCA_PERGAMINHO', quando: 'Primeiro pergaminho na mochila', text: 'Você tem um pergaminho! Leve à Casa dos Pergaminhos, na aldeia, para a Extração.' },
  { id: 'DCA_JUTSU_NOVO', quando: 'Aprendeu um jutsu de classe', text: 'Jutsu novo! Ponha no kit: Menu ☰ → Perfil → Kits → Salvar kits.' },
  { id: 'DCA_SELOS', quando: 'Primeiros selos interrompidos', text: 'Seus selos foram cortados. Lance os jutsus fortes longe de quem atordoa, empurra ou silencia.' },
  { id: 'DCA_ZONA', quando: 'Primeira vez na Zona de Conflito', text: 'Zona de Conflito: ninjas de outras aldeias podem te atacar. O acampamento da sua aldeia é seguro.' },
  { id: 'DCA_ARENA', quando: 'Primeira vez na Arena das Quatro Heranças', text: 'Arena das Quatro Heranças: aqui as lutas valem pontos da temporada. Ninguém morre de verdade.' },
  { id: 'DCA_VIAGEM', quando: 'Primeira vez no Posto de Viagem', text: 'Posto de Viagem: daqui você vai a outras regiões. Lugares em névoa abrem quando o mundo crescer.' },
  { id: 'DCA_FRAGMENTO', quando: 'Primeiro fragmento achado', text: 'Você achou um fragmento da Crônica! Os achados ficam no Manual, em Fragmentos.' },
  { id: 'DCA_RELIQUIA', quando: 'Primeira relíquia', text: 'Relíquia! Ela vale só de estar na mochila. Veja o efeito na mochila 🎒.' },
];
export const HINT_BY_ID = new Map(HINTS.map((h) => [h.id, h]));

/** Folha de controles (referência rápida, sempre aberta no Manual). [ação, computador, celular] */
export const CONTROLS = [
  ['Andar', 'W A S D ou setas', 'Joystick à esquerda'],
  ['Correr', 'R', 'Botão 🏃'],
  ['Ataque Básico', 'Espaço', 'Botão da espada 🗡️'],
  ['Jutsus', '1, 2, 3, 4 (segure para mirar)', 'Botões redondos (arraste para mirar)'],
  ['Cancelar a mira', 'Esc', 'Volte o dedo para o meio'],
  ['Trocar o alvo', 'T ou Tab (X tira o foco)', 'Toque no inimigo'],
  ['Trocar o kit A/B', 'Q', 'Botão de troca de kit'],
  ['Meditar', 'M', 'Botão 🧘'],
  ['Falar com quem está perto', 'E', 'Toque no NPC'],
  ['Mochila', 'I', 'Botão 🎒'],
  ['Perfil e atributos', 'C', 'Botão do seu retrato'],
  ['Missões', 'J', 'Aba Missões do chat'],
  ['Conversar', 'Enter', 'Campo do chat'],
];
