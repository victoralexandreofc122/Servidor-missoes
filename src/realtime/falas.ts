/*
 * v64: as falas dos professores da Academia (docs/lore/personagens.md e docs/lore/tutorial.md).
 *
 * O tutorial segue o método em 3 etapas do guia de design narrativo (Unity): cada fala de etapa APRESENTA a habilidade (o
 * professor mostra), diz que ali é ESPAÇO SEGURO para praticar (o boneco não revida, o campo não fere, a armadilha só tira
 * o golpe que a Substituição anula) e aponta o PORTÃO (a porta da sala abre quando ele prova). Depois da Academia, cada
 * professor fala com a própria voz, em rodízio, e planta as pistas do prólogo do Arco 1 (docs/historia/arco-1.md).
 *
 * Cada fala tem o ID da planilha docs/lore/dialogos.csv (scripts/gerar-dialogos.ts). Até 160 caracteres (3 linhas na
 * caixa de diálogo; o teste confere).
 */

export interface Fala { id: string; text: string }

/** A fala da etapa (passo do tutorial = a sala) e o que o professor diz a quem ainda não chegou ou já passou. */
export const TUTOR_STEP: Readonly<Record<string, { step: number; now: Fala; done: Fala }>> = {
  tutor_dummies: {
    step: 0,
    now: { id: 'TUT_AYA_01', text: 'Olha só: golpe curto, de perto! 🗡️ Ataque Básico. O boneco não revida, erre à vontade. Derrube 3 e a porta abre!' },
    done: { id: 'TUT_AYA_02', text: 'Já passou daqui! Agora é ir em frente. E não corra no corredor.' },
  },
  tutor_meditation: {
    step: 1,
    now: { id: 'TUT_DAICHI_01', text: 'Esta sala bebe chakra, como a raiz bebe a chuva. Pare e respire: 🧘 Meditar. Aqui nada te fere. Com a barra cheia, a porta abre.' },
    done: { id: 'TUT_DAICHI_02', text: 'Sua brasa está em ordem. O caminho segue para o leste.' },
  },
  tutor_jutsu: {
    step: 2,
    now: { id: 'TUT_KENJI_01', text: 'Olha onde vai pousar! 💨 Teleporte por cima do vão. Lá, arme a 🪵 Substituição e deixe a armadilha te pegar: o tronco leva o golpe.' },
    done: { id: 'TUT_KENJI_02', text: 'Saltou bonito! A Professora Mei espera na Sala de Armas. Ela não ri das minhas piadas.' },
  },
  tutor_weapons: {
    step: 3,
    now: { id: 'TUT_MEI_01', text: 'Kunai de Treino na mochila 🎒. Equipe. Um golpe no boneco com o 🗡️ Ataque Básico. Só isso.' },
    done: { id: 'TUT_MEI_02', text: 'Academia concluída. Saída embaixo. Nível 11: Diretor.' },
  },
};

/** Depois da Academia: cada professor em rodízio (a voz dele; algumas falas plantam o Arco 1). */
export const TUTOR_BARKS: Readonly<Record<string, readonly Fala[]>> = {
  tutor_dummies: [
    { id: 'TUT_AYA_10', text: 'Voltou para treinar? É assim que se fala! De novo, de novo, de novo!' },
    { id: 'TUT_AYA_11', text: 'Na Floresta os lodos revidam. Aqui não. Aproveite enquanto é de graça!' },
    { id: 'TUT_AYA_12', text: 'Ganhei da turma do Vento Cortante na corrida do ano passado. Eles ainda negam.' },
  ],
  tutor_meditation: [
    { id: 'TUT_DAICHI_10', text: 'A brasa volta para quem para. Na luta, medite onde ninguém te alcança.' },
    { id: 'TUT_DAICHI_11', text: 'O rio não briga com a pedra: contorna. Seu chakra também pode.' },
    { id: 'TUT_DAICHI_12', text: 'O chão anda mais frio esta semana. Deve ser o inverno. Deve ser.' },
  ],
  tutor_jutsu: [
    { id: 'TUT_KENJI_10', text: 'O melhor truque do mundo: deixar um tronco no seu lugar e ninguém perceber.' },
    { id: 'TUT_KENJI_11', text: 'Olha onde vai pousar! Sempre. Inclusive na vida.' },
    { id: 'TUT_KENJI_12', text: 'A Substituição anula um golpe. Um! Arme na hora certa, não na hora do medo.' },
  ],
  tutor_weapons: [
    { id: 'TUT_MEI_10', text: 'Trinta kunais sumiram do estoque. Contei duas vezes.' },
    { id: 'TUT_MEI_11', text: 'Arma equipada conta no golpe. Arma na mochila não conta.' },
    { id: 'TUT_MEI_12', text: 'Na Arena ninguém fica parado como o boneco. Treine o alvo que se mexe.' },
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
  { id: 'CRN_F_00', min: 0, text: 'Sente-se, ninja. Pedaços da Crônica se perderam pelo mundo; um brilho dourado marca cada um. Traga-os na memória.' },
  { id: 'CRN_F_01', min: 1, text: 'Você já leu {n} dos {total} pedaços perdidos. Cada um conta o que os livros calam.' },
  { id: 'CRN_F_06', min: 6, text: '{n} de {total}. Poucos leem tanto do mundo. O resto está onde o mapa é mais duro.' },
  { id: 'CRN_F_12', min: 12, text: '{n} de {total}. Faltam os das outras aldeias e das terras sem dono. A Crônica quase cabe nas suas mãos.' },
  { id: 'CRN_F_17', min: 17, text: 'Todos os {total}. A Crônica está inteira com você, ninja. Guarde-a melhor do que nós guardamos.' },
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
