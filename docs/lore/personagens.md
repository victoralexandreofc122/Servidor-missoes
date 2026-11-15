# Fichas de personagem (Character Briefs)

* **Para que serve:** o guia aponta "personagens inconsistentes" (diálogos escritos por pessoas diferentes ou em épocas
  diferentes) como um erro comum. Toda fala nova de um NPC passa por esta ficha: histórico, motivação, como fala, o que
  nunca diz e o que sabe (ou não sabe).
* **Fonte:** os NPCs que existem no jogo (`src/realtime/config.ts`, `src/realtime/maps.ts`) e as vozes do roteiro do Arco
  1 (`docs/historia/arco-1.md`). As falas que o jogo já mostra estão em `dialogos.csv`.
* **Regra das falas:** até 3 linhas na caixa de diálogo (160 caracteres no máximo; o teste `test/lore.test.ts` confere),
  a informação importante primeiro.

---

## Academia

### Professora Aya (Sala de Taijutsu)
- **Histórico:** ex-campeã das corridas entre aldeias; voltou para ensinar quando machucou o joelho e nunca admite que dói.
- **Motivação:** que nenhum aluno saia da Academia com medo de chegar perto.
- **Como fala:** alto, com exclamação, frases de treino ("De novo!", "É assim que se fala!"). Competitiva e brincalhona.
- **Nunca diz:** termos técnicos de chakra; "não consigo".
- **Sabe:** quem treina e quem desiste. **Não sabe:** nada sobre o selo.
- **No tutorial (etapa 1):** apresenta o Ataque Básico, garante que o boneco não revida e aponta a porta.
- **Falas:** `TUT_AYA_*`.

### Professor Daichi (Sala de Controle)
- **Histórico:** o mais velho dos professores; foi patrulheiro da Floresta antes do selamento.
- **Motivação:** ensinar a parar. Acha que a pressa mata mais ninjas do que os inimigos.
- **Como fala:** calmo, devagar, metáforas da natureza (raiz, rio, chuva, brasa). Nunca exclama.
- **Nunca diz:** gíria; nada com pressa.
- **Sabe:** que o chão anda mais frio (sente o selo enfraquecer). **Não diz:** por quê. Planta o Arco 1 (`TUT_DAICHI_12`).
- **Falas:** `TUT_DAICHI_*`.

### Professor Kenji (Sala de Jutsus)
- **Histórico:** ensinou o Teleporte e a Substituição a gerações de cadetes, inclusive a quem viria a ser o vilão do
  Arco 1.
- **Motivação:** que os alunos se divirtam aprendendo; tem medo (que esconde em piada) de ter ensinado alguém errado.
- **Como fala:** brincalhão, piadas ruins, bordão **"Olha onde vai pousar!"**.
- **Nunca diz:** "Ninguém olha para o tronco." (é a frase do impostor no Arco 1: a pista depende disso).
- **Sabe:** o truque do tronco melhor do que ninguém.
- **Falas:** `TUT_KENJI_*`; o bilhete do fragmento `FRG_02`.
- **Inconsistência a corrigir (arte):** o NPC "Professor Kenji" está desenhado com o visual feminino e a "Professora Mei"
  com o masculino (`public/game.js`, a lista de visuais da Academia: `tutor_jutsu` tem `gender: 'f'`, `tutor_weapons` usa
  o padrão masculino). Parece uma troca. Não mexi: arte é do Victor. Trocar os dois visuais resolve sem mudar nome.

### Professora Mei (Sala de Armas)
- **Histórico:** cuida do estoque de armas da Academia; conta tudo duas vezes.
- **Motivação:** precisão. Um golpe certo vale mais que dez errados.
- **Como fala:** séria, frases curtas, números. Sem enfeite, sem exclamação.
- **Nunca diz:** "mais ou menos"; elogio longo.
- **Sabe:** que sumiram trinta kunais (planta a M6 do Arco 1). **Não sabe:** quem levou.
- **Falas:** `TUT_MEI_*`.

### Diretor da Academia
- **Histórico:** velho; guarda a Academia, a Cerimônia e o segredo das cinco pedras. Queimou a bandana do melhor aluno que
  já teve (Arco 1).
- **Motivação:** manter o selo de pé, mesmo que isso custe a verdade.
- **Como fala:** frases curtas, formais. **Nunca responde "por quê".**
- **Sabe:** onde ficam as pedras; o que a quinta prende. **Nunca conta** (até o Arco 2).
- **Falas no jogo:** Missão de Genin, Rito do Despertar e Exame Chunin (`gameWorld.ts`, `talkDirector`); o Regimento
  (`FRG_01`).

### O Cronista (Academia)
- **Histórico:** guarda a Crônica das Eras; ninguém sabe a idade dele.
- **Motivação:** que nada do que os jogadores fazem se perca. Registra Portadores, Kages e Eras.
- **Como fala:** solene, no tempo da história ("Antes das aldeias...", "Toda escolha divide"). Nunca toma partido.
- **Sabe:** a Crônica até onde o mundo cresceu; o resto está "borrado" (Progressão de Mundo).
- **Falas:** `CRN_I` a `CRN_VI`.

## Praça e lojas

### Mestre (Praça; há um em cada aldeia)
- **Histórico:** ninja veterano; dá as missões da Sala de Missões.
- **Motivação:** formar ninjas úteis, não heróis.
- **Como fala:** direto, humor seco, chama todo mundo de "cadete" (no jogo hoje: "jovem ninja").
- **Falas no jogo:** `npcLine` em `gameWorld.ts` (missões).
- **Proposta:** trocar "slime" por "lodo verde" nas falas dele (nome de monstro: precisa do OK, ver `propostas-de-nomes.md`).

### Ferreiro Tetsu (Armaria)
- **Histórico:** ferreiro há trinta anos; o metal vem da Rocha Antiga.
- **Motivação:** que ninguém morra por causa de uma lâmina mal feita.
- **Como fala:** resmunga; chama o jogador de "garoto" ou "garota" (o jogo troca pelo visual: `{garoto}`).
- **Nunca diz:** "obrigado" sem resmungar antes.
- **Sabe:** as contas da Armaria; o recibo estranho em papel de pergaminho (Arco 1, M6; fragmento `FRG_04`).
- **Falas:** `LOJ_TETSU_*`.

### Costureira Hana (Alfaiataria)
- **Histórico:** sabe de tudo que acontece na aldeia, porque todo mundo passa pela Alfaiataria.
- **Motivação:** saber primeiro; contar depois.
- **Como fala:** rápido, simpática, fofoqueira; chama o jogador de "querido" ou "querida" (`{querido}`).
- **Sabe:** quem comprou tecido cinza (Arco 1, M7).
- **Falas:** `LOJ_HANA_*`.

### Sábio Ren (Casa dos Pergaminhos)
- **Histórico:** guarda o saber dos selos e faz os pergaminhos lisos.
- **Motivação:** entender. Sabe muito e fala demais (o Diretor reclama disso).
- **Como fala:** erudito, frases completas; **sussurra** quando o assunto é sério ("(baixinho)").
- **Sabe:** como a Extração funciona; que existem cinco pedras. **Não sabe:** onde ficam. É a pista falsa do Arco 1 (é
  inocente).
- **Falas:** `LOJ_REN_*`; a anotação do fragmento `FRG_05`.

## Vozes sem rosto (fragmentos)

| Voz | Registro | O que ela não sabe (o limite do autor) |
|---|---|---|
| A guarda da aldeia (`FRG_03`) | Aviso público, imperativo, seco | Por que a grade está suja |
| Um patrulheiro da Chama Eterna (`FRG_08`) | Diário cansado, honesto, datado | Que os superiores sabem e escondem |
| Alguém de capa cinza (`FRG_07`) | Bilhete rápido de mercenário, irônico | O plano inteiro do chefe |
| Um renegado (`FRG_13`) | Orgulho amargo, a giz | O que acontece com quem volta |
| A escuta do porto da Maré Oculta (`FRG_14`) | Carta diplomática, educada, cifrada | Se o boato é verdade |
| O povo do Vento Cortante (`FRG_15`) | Canção de trabalho, rima solta | História; só o que o povo canta |
| O povo da Rocha Antiga (`FRG_16`) | Juramento solene, lento | Nada: é promessa, não informação |
| O próprio lugar (`FRG_06`, `FRG_10`, `FRG_11`, `FRG_12`) | Narrador do cenário, sensorial | Tudo que não se vê |
