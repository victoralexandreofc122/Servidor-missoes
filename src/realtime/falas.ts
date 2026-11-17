/*
 * v64: as falas dos professores da Academia (docs/lore/personagens.md e docs/lore/tutorial.md).
 *
 * O tutorial segue o método em 3 etapas do guia de design narrativo (Unity): cada fala de etapa APRESENTA a habilidade (o
 * professor mostra), diz que ali é ESPAÇO SEGURO para praticar (o boneco não revida, o campo não fere, a armadilha só tira
 * o golpe que a Substituição anula) e aponta o PORTÃO (a porta da sala abre quando ele prova). Depois da Academia, cada
 * professor fala com a própria voz, em rodízio, e planta as pistas do prólogo do Arco 1 (docs/historia/arco-1.md).
 *
 * Cada fala tem o ID da planilha docs/lore/dialogos.csv (scripts/gerar-dialogos.ts). v71: a fala aparece na caixa de
 * conversa, em páginas; uma linha em branco (\n\n) abre página nova e cada página tem até 160 caracteres (3 linhas; o
 * teste confere). A cena pode ter quantas páginas precisar (pedido do Victor de 17/11).
 */

export interface Fala { id: string; text: string }

/** A fala da etapa (passo do tutorial = a sala) e o que o professor diz a quem ainda não chegou ou já passou. */
export const TUTOR_STEP: Readonly<Record<string, { step: number; now: Fala; done: Fala }>> = {
  tutor_dummies: {
    step: 0,
    now: { id: 'TUT_AYA_01', text: 'Ei, cadete novo! Chega mais perto. Mais! Aqui ninguém morde... ainda.\n\nGolpe curto, de perto: é o 🗡️ Ataque Básico. Esses bonecos não revidam, então erre à vontade. Errar aqui é de graça.\n\nDerrube 3 e a porta abre. Eu já fui a mais rápida das quatro aldeias, sabia? Quero ver você me alcançar um dia!' },
    done: { id: 'TUT_AYA_02', text: 'Já passou daqui! Agora é ir em frente.\n\nE não corra no corredor. Quer dizer... corra. Mas não conte ao Diretor que eu deixei.' },
  },
  tutor_meditation: {
    step: 1,
    now: { id: 'TUT_DAICHI_01', text: 'Entre devagar. Esta sala não tem pressa nenhuma, e você também não deveria ter.\n\nO chão daqui bebe chakra, como a raiz bebe a chuva. Pare e respire: 🧘 Meditar. Aqui nada te fere.\n\nQuando a barra encher, a porta abre. Fui patrulheiro por vinte anos. Aprendi que quem para a tempo volta para casa.' },
    done: { id: 'TUT_DAICHI_02', text: 'Sua brasa está em ordem. O caminho segue para o leste.\n\nVá com calma. O corredor não vai fugir, e o resto da vida também não.' },
  },
  tutor_jutsu: {
    step: 2,
    now: { id: 'TUT_KENJI_01', text: 'Olha onde vai pousar! Eu sempre digo isso ANTES do salto. Aprendi do jeito difícil. A Aya ainda está brava comigo.\n\n💨 Teleporte por cima do vão. Do outro lado, arme a 🪵 Substituição e deixe a armadilha te pegar: o tronco leva o golpe por você.\n\nÉ o melhor truque do mundo. Use bem. Use para voltar, não para sumir.' },
    done: { id: 'TUT_KENJI_02', text: 'Saltou bonito! A Professora Mei espera na Sala de Armas.\n\nDica de amigo: ela não ri das minhas piadas, então não conte nenhuma. E conte as kunais duas vezes, que ela gosta.' },
  },
  tutor_weapons: {
    step: 3,
    now: { id: 'TUT_MEI_01', text: 'Kunai de Treino na mochila 🎒. Equipe. Um golpe no boneco com o 🗡️ Ataque Básico. Só isso.\n\nArma na mochila não conta. Arma na mão conta. Respire. Mire. Solte. Nessa ordem.' },
    done: { id: 'TUT_MEI_02', text: 'Academia concluída. Saída embaixo. Nível 11: Diretor.\n\nUm número a mais, já que você acertou: 4 salas, 3 bonecos, 1 Diretor. O Diretor é o mais difícil dos três.' },
  },
};

/**
 * Depois da Academia: cada professor em rodízio, EM ORDEM (cada visita é a próxima conversa; v71: a história de cada um,
 * docs/lore/personagens.md, vai aparecendo aos poucos). Algumas falas plantam o Arco 1.
 */
export const TUTOR_BARKS: Readonly<Record<string, readonly Fala[]>> = {
  tutor_dummies: [
    { id: 'TUT_AYA_10', text: 'Voltou para treinar? É assim que se fala!\n\nDe novo, de novo, de novo! Até o corpo fazer sozinho, sem você precisar pensar.' },
    { id: 'TUT_AYA_11', text: 'Na Floresta os lodos revidam. Aqui não.\n\nSabe por que eu treino vocês nesta sala, e não lá fora? Porque lá fora o único professor é o erro. E ele cobra caro.' },
    { id: 'TUT_AYA_12', text: 'Ganhei a corrida das quatro aldeias quatro anos seguidos. A turma do Vento Cortante até hoje jura que eu cortei caminho.\n\n(mais baixo) Na quinta corrida eu cortei caminho de verdade. Caí numa ravina. O joelho nunca mais foi o mesmo.' },
    { id: 'TUT_AYA_13', text: 'Sabe quem me tirou da cama depois da queda? O Daichi. Todo dia, uma xícara de chá e nenhuma palavra.\n\nNão conte para ele que eu falei. Ele vai fazer aquela cara de raiz velha satisfeita.' },
    { id: 'TUT_AYA_14', text: 'Um dia você vai correr no planalto do Vento. Promete uma coisa?\n\nSem atalho. Atalho é para quem tem medo de chegar atrasado. Ninja de verdade chega na hora pelo caminho certo.' },
  ],
  tutor_meditation: [
    { id: 'TUT_DAICHI_10', text: 'A brasa volta para quem para.\n\nNa luta, medite onde ninguém te alcança. Um ninja cansado é só um alvo bem treinado.' },
    { id: 'TUT_DAICHI_11', text: 'O rio não briga com a pedra: contorna.\n\nSeu chakra também pode. Quem força a passagem gasta a brasa; quem contorna chega com ela inteira.' },
    { id: 'TUT_DAICHI_12', text: 'O chão anda mais frio esta semana. Deve ser o inverno. Deve ser.\n\n(ele olha para baixo, como quem escuta) Da outra vez que o chão esfriou assim, eu também disse que devia ser o inverno.' },
    { id: 'TUT_DAICHI_13', text: 'Fui patrulheiro da Floresta por vinte anos. No meu tempo se via um lodo por semana, se tanto.\n\nHoje os patrulheiros novos contam nove numa noite e dizem que é normal. (silêncio) Não é.' },
    { id: 'TUT_DAICHI_14', text: 'Na Noite das Cinco Pedras eu estava de ronda. Senti a terra prender a respiração e avisei. Ninguém acreditou a tempo.\n\nPerdi alguém naquela noite. Se um dia você sentir o chão frio, cadete, não espere ninguém acreditar. Corra e avise.' },
  ],
  tutor_jutsu: [
    { id: 'TUT_KENJI_10', text: 'O melhor truque do mundo: deixar um tronco no seu lugar e ninguém perceber.\n\nGuarde essa frase. Ela serve para a luta... e serve para entender as pessoas também.' },
    { id: 'TUT_KENJI_11', text: 'Olha onde vai pousar! Sempre. Inclusive na vida.\n\nMetade dos meus alunos pousou num poço. A outra metade pousou em mim. Você vai ser da terceira metade.' },
    { id: 'TUT_KENJI_12', text: 'A Substituição anula um golpe. Um! Arme na hora certa, não na hora do medo.\n\nQuem arma com medo arma cedo. E o golpe de verdade chega quando o tronco já foi embora.' },
    { id: 'TUT_KENJI_13', text: 'Já tive um aluno melhor que todos. Aprendia qualquer jutsu na primeira tentativa e treinava a Substituição até de madrugada.\n\nEle foi pousar longe demais. (ele ri, mas não é engraçado) Olha onde vai pousar, tá? Promete?' },
    { id: 'TUT_KENJI_14', text: 'Sabe o pote na minha mesa? Tem um tronco dentro. O primeiro que um aluno meu trocou de lugar com ele mesmo.\n\nNão, não vou dizer quem. Tem coisa que a gente guarda para lembrar de não esquecer.' },
  ],
  tutor_weapons: [
    { id: 'TUT_MEI_10', text: 'Trinta kunais sumiram do estoque. Contei duas vezes.\n\nContei três. Trinta. Com recibo assinado. Ninguém da Academia assina com aquela letra.' },
    { id: 'TUT_MEI_11', text: 'Arma equipada conta no golpe. Arma na mochila não conta.\n\nParece óbvio. Você não imagina quantos ninjas caíram por causa do óbvio.' },
    { id: 'TUT_MEI_12', text: 'Na Arena ninguém fica parado como o boneco. Treine o alvo que se mexe.\n\nO boneco perdoa. O inimigo não.' },
    { id: 'TUT_MEI_13', text: 'Minha família é de ferreiros da Rocha Antiga. Lá se diz: quem conta duas vezes não perde nada.\n\nNuma patrulha, contei uma vez só e errei um lançamento. Um colega carrega a cicatriz até hoje. Conte duas vezes.' },
    { id: 'TUT_MEI_14', text: 'Você melhorou. 11% mais preciso que na semana passada. Não perguntei a ninguém: eu medi.\n\nIsso foi um elogio. Não se acostume.' },
  ],
};

/**
 * A fala do professor `npcId` para quem está no passo `step` do tutorial. Na sala da vez: a fala da etapa; antes dela
 * (ainda não chegou), a mesma fala; depois: "já passou" enquanto o tutorial dura e, no fim, o rodízio (`turn` escolhe).
 */
export function tutorFala(npcId: string, step: number, turn = 0): Fala {
  const t = TUTOR_STEP[npcId];
  if (!t) return { id: 'TUT_GERAL', text: 'Continue treinando.' };
  if (step <= t.step) return t.now;
  if (step < 4) return t.done;
  const barks = TUTOR_BARKS[npcId] ?? [];
  return barks.length > 0 ? barks[Math.abs(turn) % barks.length]! : t.done;
}

/**
 * v65: o Cronista conta quantos fragmentos da Crônica o ninja já trouxe (os fragmentos gravados no banco, migração v39).
 * `min` = a partir de quantos achados a fala vale (a de maior `min` que couber).
 */
export const CRONISTA_FRAGMENTOS: readonly (Fala & { min: number })[] = [
  { id: 'CRN_F_00', min: 0, text: 'Sente-se, ninja. Não, aí não: essa cadeira range, e esta sala detesta barulho.\n\nPedaços da Crônica se perderam pelo mundo. Um brilho dourado marca cada um: um bilhete, uma pedra riscada, uma canção.\n\nTraga-os na memória. Toda página perdida é alguém que tentou ser lembrado.' },
  { id: 'CRN_F_01', min: 1, text: 'Você já leu {n} dos {total} pedaços perdidos.\n\nCada um conta o que os livros da Academia calam. Os livros falam de heróis. Os pedaços falam de gente com medo, e isso é mais verdadeiro.' },
  { id: 'CRN_F_06', min: 6, text: '{n} de {total}. Poucos leem tanto do mundo.\n\nO resto está onde o mapa é mais duro: nas outras aldeias e na terra que ninguém quis dividir.\n\nCuidado. Há páginas que não querem ser achadas.' },
  { id: 'CRN_F_12', min: 12, text: '{n} de {total}. Faltam os das terras sem dono.\n\nA Crônica quase cabe nas suas mãos. Sinto a pena escrever mais rápido quando você entra. Não sei se isso me alegra ou me assusta.' },
  { id: 'CRN_F_17', min: 17, text: 'Todos os {total}. A Crônica está inteira com você, ninja.\n\nNenhum de nós guardou tão bem o que aconteceu. Nem eu, e eu estava lá em quase tudo.\n\nGuarde-a melhor do que nós guardamos.' },
];

/** A fala do Cronista para quem achou `n` de `total` fragmentos. */
export function cronistaFala(n: number, total: number): Fala {
  const f = [...CRONISTA_FRAGMENTOS].reverse().find((x) => n >= Math.min(x.min, total)) ?? CRONISTA_FRAGMENTOS[0]!;
  return { id: f.id, text: f.text.replace('{n}', String(n)).replace('{total}', String(total)) };
}

/** Todas as falas deste arquivo (a planilha e o teste usam). */
export function todasAsFalas(): (Fala & { npc: string; quando: string })[] {
  const out: (Fala & { npc: string; quando: string })[] = [];
  for (const [npc, t] of Object.entries(TUTOR_STEP)) {
    out.push({ ...t.now, npc, quando: `tutorial == ${t.step}` }, { ...t.done, npc, quando: `${t.step} < tutorial < 4` });
    for (const b of TUTOR_BARKS[npc] ?? []) out.push({ ...b, npc, quando: 'tutorial == 4 (rodízio)' });
  }
  for (const c of CRONISTA_FRAGMENTOS) out.push({ id: c.id, text: c.text, npc: 'cronista', quando: `fragmentos achados >= ${c.min}` });
  return out;
}
