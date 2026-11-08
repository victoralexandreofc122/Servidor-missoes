# Endgame: a visão final (referência)

* **Fonte:** decisões do Victor nas sessões de design do endgame (Pendências 1 a 6), registradas em 08/11/2026.
* **Status:** referência canônica do endgame. **Nada daqui é implementado sem o OK do Victor**; a ordem está no
  roadmap (seção 13). O que está em aberto está na seção 12 e não se implementa sem decisão.
* O endgame que já existe no jogo (Kage eleito, diplomacia, Zona de Conflito, renegados, Akatsuki) está em
  `docs/endgame.md`; este documento é para onde ele vai.

## 1. Identidade e nomes

- **Nome do jogo:** Herança do Fogo (antes "Vontade do Fogo"). A troca em toda a UI, docs e textos é da Fase 1.
- **4 aldeias** (substituem Folha, Névoa, Nuvem e Areia):

| Aldeia | Tema | Passiva |
|---|---|---|
| Aldeia da Chama Eterna | fogo, combate | **Brasa Viva:** o dano sobe com o tempo em combate, até um teto |
| Aldeia da Maré Oculta | água, espionagem | **Corrente Silenciosa:** bônus em infiltração e resistência a ser infiltrado |
| Aldeia do Vento Cortante | vento, velocidade | **Passo do Vendaval:** recarga menor na mobilidade e mais velocidade no mapa |
| Aldeia da Rocha Antiga | terra, defesa | **Muralha:** menos dano recebido e bônus de recompensa em chefes |

- **Akatsuki:** fica só como nome interno (docs e código). O nome que o jogador vê está em aberto.
- **ANBU:** mantido (decisão do Victor, ciente do risco).
- **Nomes da série que ainda estão no jogo** (frente própria, com migração versionada, antes de qualquer item pago):
  clãs Uchiha e Nara, Vale dos Guardiões, Soco Tsunade e os jutsus com nomes japoneses da série. É a Fase 1.

## 2. Progressão (mantida)

- Nível 1 a 10 Academia, 10 Genin, 40 Chunin, 60 candidato a Kage.
- 9 classes; a 2ª classe abre no nível 40 (build dupla).
- O Kage é obrigatoriamente Jounin.

## 3. Hierarquia por temporada (60 dias)

### Torneio da Temporada: forma os Jounin

- Entrada: nível 40 ou mais, menos quem já é Jounin.
- Modo separado (não usa o ranqueado 1x1 comum).
- Fase de pontos: vitória +30, derrota -10. Ryō: +100 na vitória, +30 na derrota (nunca ryō negativo).
- Mínimo de 15 partidas para se classificar.
- Fase final com 2x o número de vagas, em 2 etapas (grupos, depois eliminatória), com chaves simultâneas em arenas
  diferentes, reduzindo para 1 luta por vez, com público, conforme avança.
- Vagas: 1 a cada 50 ativos da vila, mínimo 10, máximo 60. Com menos de 10 elegíveis, entram quantos houver.
- O título de Jounin é **permanente**; o que muda é o registro da era (Jounin da Era 1, Era 3...).
- Os Jounin eleitos formam o **Colégio da próxima era**.
- Título "Serei o próximo Jounin": permanente e equipável.

### Torneio dos Heróis: "Herói da Vila X"

- Só os Jounin do Colégio da era atual (menos o Kage). Melhor de 3.

### Torneio dos Vilões: "Vilão Mais Forte da Era"

- Só os vilões da temporada (menos o Maior Vilão). Melhor de 3.

### Torneio dos Renegados: "O Maior Vilão"

- Todos os renegados. Melhor de 3.
- O Maior Vilão escolhe os 10 a 60 vilões da temporada.

O Kage e o Maior Vilão **não** entram nos torneios de campeão (já têm a passiva do cargo).

## 4. Eleição do Kage

- Voto ponderado por rank: Chunin 1, Jounin 2, ANBU 3. Votam todos os Chunin, Jounin e ANBU vivos.
- Candidatos: todos os Jounin vivos (Colégio atual e veteranos).
- Voto secreto: só o total ponderado é divulgado.
- **Reeleição proibida, para sempre:** cria uma linhagem de ex-líderes.
- **Ex-Kage:** passiva permanente de +200 de vida, fixa (não acumula). Não vale em PvP competitivo (ranqueado e guerra
  20v20); vale em PvE, mundo aberto e infiltração.
- **Começo do jogo:** a Temporada 1 é a Era Fundadora: primeiro os Jounin, depois o Kage, depois os Heróis.

## 5. ANBU

- Só Jounin, escolhidos a dedo pelo Kage.
- Quantidade, poderes e missões exclusivas: em aberto (Pendência 7).

## 6. Calendário da temporada (60 dias)

| Semana | O que acontece |
|---|---|
| 1 | Eleição do Kage, posse, escolha dos ANBU |
| 1 a 2 | Torneio dos Renegados: Maior Vilão |
| 2 | O Maior Vilão escolhe os vilões |
| 2 a 3 | Torneio dos Heróis e Torneio dos Vilões |
| 3 a 4 | Torneio da Temporada: Jounin (Colégio da próxima era) |
| 3 a 8 | Guerras semanais 20v20 (buffs e recompensas) |
| 8 | Guerra final (a última semanal), recompensas e reset |

## 7. Renegados

- São jogadores banidos da vila (matar aliados, quebrar regras, desafiar o Kage). Vivem na **Terra Sem Lei**.
- O Torneio dos Renegados define o Maior Vilão da era, que decide os vilões e a lei da Terra Sem Lei: "todos por si"
  (PvP livre entre renegados) ou "paz armada" (matar renegado é punido).
- Os vilões da temporada e o Maior Vilão são intocáveis por outros renegados, menos em arena de treino ou desafio aceito.
- **Caçada:** a recompensa pela cabeça sobe com abates e tempo vivo, cai a cada morte, com piso de 10 ryō.
- Renegados entram na guerra semanal. Se vencerem, todas as aldeias levam um debuff (recompensa maior para renegado que
  mata ninja de aldeia).
- Renda semanal em ryō proporcional à recompensa pela cabeça.

## 8. Guerra semanal 20v20

- Todos os níveis; times mistos por composição (10, 20, 40, 60 juntos) para a luta ser justa.
- Define status, buffs e bônus de recompensa da aldeia. Renegados participam.

## 9. Balanceamento das aldeias

- Divisões próximas entre as 4 aldeias. Vila cheia: o jogador não cria ninja nela.
- Bônus de XP para quem cria em outra vila.

## 10. Infiltração e mentoria

- **Infiltração:** qualquer ninja pode se infiltrar numa vila sem paz com a sua. O Kage escolhe a vila alvo; o Maior
  Vilão distribui as infiltrações dos renegados.
- **Mentoria:** jogadores de nível alto dão missões aos de nível baixo; o Kage pode dar missões a todos abaixo dele.

## 11. Monetização (regra inegociável)

- Sem pay-to-win. Só cosméticos e conveniência. Itens e roupas também se conseguem com a moeda do jogo.

## 12. Em aberto (não implementar sem decisão)

1. Nome in-game da organização vilanesca (Akatsuki é só interno).
2. Quantidade, poderes e missões exclusivas da ANBU.
3. Regras da Terra Sem Lei (paz armada: qual punição; arena; desafio).
4. Teto, decaimento e reset da recompensa do renegado.
5. Matchmaking, papéis e escalação da guerra 20v20.
6. Critério de "vila cheia" e tamanho e duração do bônus de XP.
7. Detecção, objetivos e punições da infiltração.
8. Limites e recompensas da mentoria.
9. Renegado pode voltar para a aldeia? Como?
10. Detalhes das chaves simultâneas (quando chegar a hora).

## 13. Roadmap (não começar sem o OK do Victor)

- **Fase 1, nomes** (antes de qualquer monetização): migração dos nomes (aldeias, clãs, jutsus, Vale dos Guardiões,
  Soco Tsunade) e Herança do Fogo no título, na UI e nos docs.
- **Fase 2, endgame sobre a base de hoje:** Kage exige Jounin + Torneio da Temporada; ANBU; Torneios dos Heróis e dos
  Vilões; Torneio dos Renegados e Maior Vilão; Terra Sem Lei e recompensa; guerra semanal 20v20 com buffs, debuffs e
  renegados; balanceamento das aldeias e bônus de XP; infiltração e mentoria.
- **Fase 3, conteúdo:** 2ª classe no nível 40; mapas temáticos por aldeia; social (grupo, amigos, sensei, junto com a
  mentoria); Arco 1.

## 14. Stack

Em avaliação pelo Victor: migrar para C/C++. **Nada a fazer até ele decidir.** A stack atual (Node/TypeScript,
Postgres no Neon, Canvas 2D) continua.
