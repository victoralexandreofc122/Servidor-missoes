# Herança do Fogo: documento canônico do endgame

* **Fonte:** decisões do Victor nas sessões de design do endgame, fechadas e enviadas como documento canônico em
  08/11/2026 (substitui a versão anterior deste arquivo).
* **Status:** referência oficial. **Nada daqui é implementado sem o OK do Victor**; a ordem está no roadmap (seção 16).
  O que está em aberto (seção 15) não se implementa sem decisão.
* O endgame que já existe no jogo (Kage eleito, diplomacia, Zona de Conflito, renegados, Akatsuki) está em
  `docs/endgame.md`; este documento é para onde ele vai.

## 1. Identidade

- **Nome:** Herança do Fogo (antes "Vontade do Fogo"; trocar em toda UI, docs e textos visíveis).
- **Modelo:** free-to-play, sem pay-to-win.
- **Akatsuki:** nome só interno (docs e código). O nome in-game está em aberto: não implementar nome visível.
- **ANBU:** mantido (decisão do autor).
- **Nomes da série** (clãs Uchiha e Nara, Vale das Estátuas, Soco Tsunade, os jutsus com nome da série): renomear antes
  de monetizar (Fase 1).

## 2. As 4 aldeias

| Aldeia | Tema | Passiva |
|---|---|---|
| Aldeia da Chama Eterna | fogo, combate | **Brasa Viva:** o dano escala com o tempo em combate, até um teto |
| Aldeia da Maré Oculta | água, espionagem | **Corrente Silenciosa:** bônus em infiltração e resistência a ser infiltrado |
| Aldeia do Vento Cortante | vento, velocidade | **Passo do Vendaval:** recarga menor na mobilidade e mais velocidade no mapa |
| Aldeia da Rocha Antiga | terra, defesa | **Muralha:** menos dano recebido e bônus de recompensa em chefes |

## 3. Progressão

- Academia (1 a 10) → Genin (10, 1ª classe) → Chunin (40, 2ª classe) → Candidato a Kage (60, exige Jounin).
- Temporada: 60 dias.

## 4. Classes e builds

- **10 classes:** Cura, Sombra, Ilusão, Pedra, Fogo, Água, Taijutsu, Armas, Relâmpago e Vento.
- Pool de jutsus maior que 4; kit equipado de até 4; dois kits, com troca em combate.
- As duas classes têm passiva; o jogador escolhe qual é a principal. Sem sinergias entre classes.
- Troca de classe: custo alto em ryō, só no nível 60.
- Qualquer aldeia, qualquer classe, exceto os clãs (únicos por aldeia, expansão futura).
- **Clãs hoje:** Clã Rubro, Linhagem Umbra e Andarilho ficam como estão. Clãs novos entram com o tempo, um por aldeia.
  Não expandir agora.
- **Distribuição alvo:** 4 jutsus por classe por tier (4/4/4/4). Hoje é variável; completar é a Fase 2.5 (74 jutsus
  novos).

### Extração

| Tier | Pergaminhos | Chance |
|---|---|---|
| 1 | 1 | as 2 primeiras garantidas; depois 90% |
| 2 | 2 | 80% |
| 3 | 3 | 60% |
| 4 | 4 | 40% |

Proteção contra azar: +10 pontos por falha seguida, até o limite (100%). Feito na Fase 0 (migração v20).

### Maestria

- 4 níveis por uso: 0, 100, 500 e 2.000 usos.
- Sobe usando: dano conta ao acertar; cura conta ao curar a si ou a um aliado.
- Dá dano, efeito e recarga, **não obrigatoriamente os três**: cada jutsu evolui o que faz sentido para ele (dano puro
  evolui dano; controle evolui a duração do efeito; suporte evolui cura ou alcance; recarga longa pode evoluir a
  recarga). Feito no Fogo na Fase 0; os demais jutsus são ajustados aos poucos.

## 5. Hierarquia da aldeia

Academia → Genin → Chunin → Jounin (torneio) → ANBU (indicação do Kage) → Kage (votação, exige Jounin).

### Jounin

- Torneio da Temporada: nível 40 ou mais, menos os Jounin atuais. Modo separado do ranqueado comum.
- 1 vaga a cada 50 ativos por vila (mínimo 10, máximo 60).
- Título permanente, com registro da era (Jounin da Era 3...). Os eleitos formam o Colégio da próxima era.
- Pontos: vitória +30, derrota -10. Ryō: +100 na vitória, +30 na derrota (nunca ryō negativo). Mínimo de 15 partidas.
- Fase final com 2x as vagas, em 2 etapas (grupos, depois eliminatória), com chaves simultâneas e depois uma luta por
  vez, com público.
- Quem não se classifica: 200 ryō e o título "Serei o próximo Jounin" (permanente).

### Kage

- Obrigatoriamente Jounin.
- Voto ponderado: Chunin 1, Jounin 2, ANBU 3. Votam todos os Chunin, Jounin e ANBU vivos. Candidatos: todos os Jounin
  vivos.
- Voto secreto: só o total ponderado é divulgado.
- Reeleição proibida, para sempre.
- **Ex-Kage:** passiva de +200 de vida (não acumula; não vale no ranqueado nem na guerra 20v20; vale em PvE, mundo
  aberto e infiltração).
- Começo: a Temporada 1 é a Era Fundadora (primeiro os Jounin).

### ANBU

- De 1 a 10, escolhidos a dedo pelo Kage (mínimo 1). Só Jounin.
- 10 armas por vila (uma por ANBU), exclusivas do cargo; voltam ao pool quando o ANBU sai. Cada arma tem um efeito
  único de PvP (sem atributo extra).
- Máscaras escondem nome e clã (exclusivo de ANBU e Akatsuki); as roupas diferenciam vila e Akatsuki na guerra. Skins de
  máscara são 100% cosméticas.
- Dura até a troca de Kage (o novo Kage decide manter ou trocar; o padrão é permanecer). O Kage pode demitir; o ANBU
  pode renunciar (o peso do voto cai de 3 para 2 e ele perde armas, roupas e máscara).
- Traição: vira renegado e ganha bônus de caça ao Kage.
- Missões: caçar renegado, infiltração profunda e contraespionagem; recompensa em ryō.
- **Interregno** (só no fim da era): os ANBU governam por votação; empate decidido pelo Rank de Jounin; sem ANBU, o
  Jounin de maior Rank assume.

## 6. Torneios de campeão

| Torneio | Quem entra | Título | Formato |
|---|---|---|---|
| Torneio dos Heróis | Jounin do Colégio (menos o Kage) | "Herói da Vila X" | melhor de 3 |
| Torneio dos Vilões | vilões da temporada (menos o Maior Vilão) | "Vilão Mais Forte da Era" | melhor de 3 |
| Torneio dos Renegados | todos os renegados | "O Maior Vilão" | melhor de 3 |

O Maior Vilão escolhe os 10 a 60 vilões da temporada.

## 7. Calendário da temporada (60 dias)

| Semana | O que acontece |
|---|---|
| 1 | Eleição do Kage, posse e escolha dos ANBU |
| 1 a 2 | Torneio dos Renegados: O Maior Vilão |
| 2 | O Maior Vilão escolhe os vilões |
| 2 a 3 | Torneio dos Heróis e Torneio dos Vilões |
| 3 a 4 | Torneio da Temporada: Jounin |
| 3 a 8 | Guerras semanais 20v20 (fonte de buffs e recompensas) |
| 8 | Guerra final (= a última guerra semanal), recompensas e reset |

## 8. Renegados e Terra Sem Lei

- Renegados são jogadores banidos por matar aliados, quebrar regras ou desafiar o Kage. Vivem na Terra Sem Lei e não são
  obrigados a ser aliados entre si.
- O Maior Vilão define a lei uma vez por era, com aviso de 24 h: **"Todos por si"** (PvP livre) ou **"Paz armada"**
  (matar não rende o valor da vítima e dá a marca "criminoso").
- Os vilões da temporada e o Maior Vilão são intocáveis (exceto na arena de treino ou em desafio aceito).
- **Arena:** aberta a qualquer jogador; só duelos formais; morte sem consequência; a elite pode ser atacada.
- O aldeão desafia renegados comuns, não a elite; pode caçar todos no território.
- **Desafio à elite:** só renegados; a elite pode recusar; o desafiante escolhe o formato; vale a recompensa da caçada;
  3 por dia por pessoa.
- Zona segura: hospital (renascimento), lojas e sala de missões.
- O aldeão entra marcado como inimigo; os renegados recebem aviso de intruso. O renegado sai livremente.
- **Volta à vila:** 2 por era, só para a vila de origem; o pedido passa do renegado ao Maior Vilão e ao Kage; só no fim
  da era. A recompensa zera (vira histórico); o título de vilão vira histórico; o Jounin volta como Chunin (pode tentar
  de novo); não pode se candidatar a Kage na mesma era. Voltar a ser renegado tem punição crescente (1ª normal; 2ª
  recompensa mínima e sem novo perdão; 3ª permanente). Pode voltar à Terra Sem Lei como aldeão inimigo.

### Sistema de Caçada

- Sobe matando aldeões (escalado pela dificuldade da vítima) e com o tempo vivo. Não sobe matando renegados.
- Cai 10% do valor atual a cada morte. Piso de 10 ryō. Teto relativo (escala com a economia) e teto por era.
- Zera a cada era. Conta nova (menos de 4 h jogadas) não conta. A marca "criminoso" é permissão, não aumenta a
  recompensa.
- Visibilidade: ranking público (sem mapa) e aviso global ao entrar no top 10. Limite por IP por dia.

| Recompensa | Renda semanal (ryō) |
|---|---|
| 10 a 500 | 50 |
| 501 a 1.500 | 150 |
| 1.501 a 3.000 | 300 |
| 3.001 a 6.000 | 500 |
| 6.001 a 10.000 | 800 |
| acima de 10.000 | 1.200 |

## 9. Akatsuki (nome in-game em aberto)

- 10 membros, cada um com habilidade especial ou arma única; 10 armas (simétrico ao ANBU).
- Recrutamento: o Maior Vilão escolhe a dedo. Máscaras escondem nome e clã. Proteção da Terra Sem Lei.

## 10. Guerra semanal 20v20

- Aldeia contra aldeia (sem renegados). Times mistos: soma dos níveis de no máximo 800 por time de 20.
- Capitães: o Kage nomeia 1; o outro é o ANBU de maior Rank de Jounin. Draft com regra de composição; evento assistível.
  Os capitães entram na batalha se forem escolhidos.
- Formato MOBA: 3 rotas com 3 áreas de captura; selva entre as rotas com monstros; chefe épico no centro.
- Duração de 10 a 25 min. Vitória: 700 pontos ou o tempo máximo de 20 min. Pontuação pelo controle contínuo das áreas.
- Renascimento de 3 s a 20 s, crescente.
- Chefes aleatórios (um por vez): dano (2 min), vida, recuperação de chakra na meditação, renascimento mais rápido dos
  aliados (2 min).
- Buffs de vitória: só de recompensa (drop, XP, ryō).

## 11. Guerra final

- 4 aldeias + renegados (5 times de 20 = 100 jogadores); o MVP pode começar com 10 por aldeia.
- Todos contra todos (sem aliança). Mapa maior, uma rota por aldeia (4 rotas + 1 ponto central).
- Vitória: 700 pontos ou 20 min. Servidor isolado com modo espectador.
- Se os renegados vencerem: todas as aldeias recebem um debuff (recompensas maiores para renegados).

## 12. Balanceamento populacional

- Vila cheia: 20% acima da média das 4 aldeias. Reabre (histerese) em 5% acima da média.
- Bloqueio total; convite de amigo ou mentor libera.
- Bônus de XP de +20% até o nível 40, e reabertura automática com bônus para quem entra em vila em recuperação.
- Transparência: a tela de criação mostra a vila cheia e o bônus antes de criar.

## 13. Infiltração e mentoria

### Infiltração

- Entrada por viagem física até a vila alvo. Até 5 infiltrados ao mesmo tempo por vila. Nível mínimo 25.
- Modo furtivo: menos velocidade, sem nome no mapa, sem jutsu chamativo.
- Objetivos (todos): A reconhecimento, B sabotagem, C roubo, D assassinato de NPC. Exclusivo de ANBU: F infiltração
  profunda. Fora: E assassinato de jogador.
- Detecção: NPCs com chance, ANBU caçando infiltrados e sistema de suspeita.
- Punição: perde a recompensa, marca "capturado" por 15 min e sem espionagem até ela sumir.
- Recompensa: 100% (completou e saiu), 50% (completou e foi pego na saída), 0% (pego antes ou desistiu).
- Quem define o alvo: o Kage (aldeias) e o Maior Vilão (renegados). Sem restrição de online: mapa maior e rotas
  furtivas.

### Mentoria

- Mentor: nível 40 ou mais (Chunin, Jounin, ANBU, Kage). Mentorado: qualquer nível abaixo do mentor.
- Limite: Chunin 2, Jounin 5, ANBU 8, Kage 10.
- Missões emprestadas, treino e formatura. Recompensa do mentor: ryō, XP e cosméticos (títulos e roupas por marcos de
  formados).
- Fim: nível 40 com formatura, decisão de qualquer um ou 30 dias de inatividade.
- Anti-farm: XP só na formatura, teto diário e bônus decrescente. Prioridade na fila para mentorados de nível baixo.
  O bônus de XP e a mentoria acumulam.

## 14. Monetização (regra inegociável)

- Sem pay-to-win. Só cosméticos (roupas, skins, máscaras cosméticas). Itens e roupas também com a moeda do jogo.
- Esconder nome e clã nunca é vendido: é exclusivo de ANBU e Akatsuki.

## 15. Pendências em aberto (não implementar)

1. Nome in-game da organização vilanesca.
2. Detalhamento das chaves simultâneas do Torneio da Temporada.
3. Modo separado do ranqueado de Jounin (a detalhar na implementação).
4. Clãs futuros (únicos por aldeia).
5. Mapa-múndi contínuo.
6. Migração C/C++ e empacotamento nativo (estacionado).
7. Fase 2.5: 74 jutsus novos para completar 4 por classe por tier.

## 16. Roadmap (não começar uma fase sem o OK do Victor)

- **Fase 0 (agora):** terminar Jutsus v2 (entrega 2, conjuração no Fogo, migração v16, verify), corrigir a Extração e
  ajustar a maestria. **Feita no branch** (Extração e maestria com a migração v20).
- **Fase 1 (antes de monetizar):** renomeação: Herança do Fogo na UI e nos docs, as 4 aldeias, clãs, Vale das Estátuas,
  Soco Tsunade e os jutsus com nomes originais. Parte já feita (v17: nome do jogo, aldeias e Vale dos Guardiões).
- **Fase 2 (endgame sobre a base):** Torneio da Temporada (modo separado), ANBU, Torneios dos Heróis e dos Vilões,
  Torneio dos Renegados, Terra Sem Lei, Sistema de Caçada, guerra semanal, guerra final (servidor isolado e espectador),
  balanceamento populacional, infiltração e mentoria.
- **Fase 2.5:** 74 jutsus novos (4 por classe por tier).
- **Fase 3 (conteúdo):** 2ª classe no nível 40, mapas temáticos, social (grupo e amigos) junto com a mentoria, Arco 1,
  clãs e mapa-múndi contínuo.

## 17. Stack (em avaliação, não agir)

O Victor está avaliando empacotamento nativo e otimização (WASM, N-API, Capacitor/Tauri), não só C/C++. **Nenhuma
mudança de stack até ele decidir.** A stack atual (Node/TypeScript, Postgres no Neon, Canvas 2D) continua.
