# Revisão de estilo (egm-style), fase 5: prontidão para construir

Alvo: `concepts_brief.md`, linhas 329 a 450. Leitor: o Victor, no celular, em português do Brasil.
Verificação feita: nenhum travessão longo (— ou –) no trecho. 19 linhas passam de 120 caracteres, quase todas
células de tabela (a linha 382 tem 312).

Contagem: 0 Bloqueadores, 12 Importantes, 14 Detalhes.

## Bloqueadores

Nenhum. O texto tem conflitos de termo e algumas frases ambíguas, mas nada que impeça construir ou leve a construir
errado sozinho. Os itens 1, 2, 5 e 6 dos Importantes chegam perto: vale fechar antes de começar o passo 2.

## Importantes

### I1. "Kit" nomeia duas coisas e não está no glossário
- **Onde:** 345 ("kit do adversário") e 448 ("Kits de 4 habilidades para 2 classes"); também 290, 297, 299 e 317.
- **Problema:** em 345 (e 290, 297, 299) "kit" são os 4 jutsus que o jogador leva para a luta. Em 448 (e 317) é o
  conjunto novo de 4 habilidades por classe, que ainda não existe. A palavra não aparece no glossário.
- **Recomendação:** pôr no glossário "**Kit:** os 4 jutsus que o ninja leva para a luta". Em 448 trocar por outro
  nome: "4. Habilidades novas (4 por classe) para 2 classes, como teste, escritas como dados."

### I2. "Passo 2" quer dizer duas coisas
- **Onde:** 441 a 446 (Ordem, passo 2 = duelo por desafio) contra 143 a 153 (Análise 3, passo 2 = entrega própria da
  forma nova). A linha 153 diz "também fica para o passo 2".
- **Problema:** quem lê a Ordem e volta à Análise 3 acha que "só contar o uso que acerta" entra junto com o duelo. A
  lista da Ordem também não usa a palavra "passo", embora o resto do texto use (302 "passo 2b", 317 "passo 4 da
  ordem", 318 "passo 3"). E a frase de 439 fala em "fases", que colide com as fases da revisão EGM (435 "fase 4").
- **Recomendação:** chamar os itens da Ordem de "Passo 1" a "Passo 5" e, na Análise 3, trocar "passo 1/passo 2" por
  "Agora" e "Depois (entrega própria)". Em 439: "**Ordem dos passos** (substitui a ordem do brainstorm):".

### I3. "Aviso no chão" está na tela, mas o objetivo 8 o adia
- **Onde:** 345 ("Placar, cronômetro, kit do adversário, aviso no chão").
- **Problema:** o objetivo 8 (297-298) diz que nenhum jutsu de jogador tem carga hoje e que o aviso no chão entra
  mais tarde, com a conjuração com selos. A tabela da arquitetura manda construir o aviso agora.
- **Recomendação:** "Placar de rodadas, cronômetro e kit do adversário (com nível de uso e recargas)." Se quiser,
  acrescente: "O aviso no chão entra com a conjuração com selos."

### I4. Escopo da tabela muda entre o objetivo 1 e a Decisão 5
- **Onde:** 432 ("todo dano entre jogadores (duelo e Zona de Conflito)").
- **Problema:** o objetivo 1 (245-247) diz "todo dano, cura e controle de jogador em jogador (duelo, Zona de Conflito
  e arena das vilas)". A Decisão 5 tira a cura, o controle e a arena. Quem constrói não sabe qual vale.
- **Recomendação:** "5. **Escopo da tabela:** todo dano, cura e controle entre jogadores (duelo, Zona de Conflito e
  arena das vilas). Contra monstros nada muda."

### I5. "Ninguém sai antes do fim" contradiz "sair de propósito"
- **Onde:** 360 e 362.
- **Problema:** 360 diz que ninguém sai antes do fim; 362 diz que sair de propósito conta como derrota. Fica sem
  dizer se existe um botão de desistir.
- **Recomendação:** 360: "Ninguém de fora entra." 362: "Desistir (botão Desistir ou fechar o jogo de propósito)
  conta como derrota." Se não houver botão Desistir, dizer isso.

### I6. "Fora de combate" sem medida
- **Onde:** 357.
- **Problema:** quem constrói precisa de um número: quantos segundos sem bater nem apanhar.
- **Recomendação:** "fora de combate (sem causar nem levar dano há pelo menos N s)". Usar o valor que o jogo já usa,
  se existir.

### I7. "Fator do novato" aparece antes de ser explicado
- **Onde:** 380 (primeiro uso no trecho), 405 ("fator limitado"); a definição só vem em 422.
- **Problema:** termo novo sem explicação no primeiro uso e com dois nomes ("fator do novato", "fator limitado").
- **Recomendação:** glossário: "**Fator do novato:** multiplicador que faz o jogador com menos partidas de duelo
  ganhar mais e perder menos (Decisão 2)." Em 405, trocar "o fator limitado" por "o fator do novato".

### I8. "Perde f vezes menos" é ambíguo, e a fórmula não tem exemplo
- **Onde:** 422 a 425.
- **Problema:** "perde f vezes menos" pode ser lido como "perde f a menos". A fórmula `1 + 0,5 x (30 - n) / 30` é
  difícil de ler no celular sem um número de exemplo. "Começa em 1.000" está sem unidade.
- **Recomendação:** "começa em 1.000 pontos" e "o menos experiente ganha o valor do Elo vezes `f` quando vence e
  perde o valor do Elo dividido por `f` quando perde. Exemplos: com 0 partidas, `f` = 1,5; com 15, `f` = 1,25; a
  partir de 30, `f` = 1 (Elo normal)."

### I9. "Tabela" nomeia a tabela de equilíbrio e a tabela do banco
- **Onde:** 407-408 ("na tabela `game.endgame_modules`"; "a tabela só aceita").
- **Problema:** no resto do documento "a tabela" é a tabela de equilíbrio do PvP. Aqui é uma tabela do banco.
  "Regra no banco" e "módulos que ligam pela população" também são jargão.
- **Recomendação:** "**Interruptor `duelo` no banco (`game.endgame_modules`):** rejeitado. Essa tabela do banco só
  aceita `vilas`, `pvp`, `renegados` e `akatsuki` (`db/schema_v11_endgame.sql`, linha 28) e serve para módulos que
  ligam com 60 jogadores ativos."

### I10. "Rejeitado por agora" e "plano B" sem gatilho claro
- **Onde:** 389-392, 399, 404.
- **Problema:** há "rejeitado", "rejeitado por agora" e "rejeitado para agora" para duas ideias diferentes
  (descartado ou adiado). Há dois "plano B" (390 e 392) sem ordem entre eles, e o gatilho do primeiro ("se o limite
  de +15% não bastar") não é medível.
- **Recomendação:** usar só "Rejeitado" e "Adiado". Dar ordem e gatilho: "Plano B (1º): se o simulador não passar
  com o limite de +15%, todo jutsu aprendido luta no nível de uso máximo. Plano B (2º): se ainda não passar,
  atributos iguais para todos no duelo."

### I11. "Conta" ambíguo; "Resolver só com mais vida" parece contradizer a Decisão 8
- **Onde:** 391 ("tiraria os atributos da conta") e 393 ("rejeitado sozinho").
- **Problema:** no jogo "conta" também quer dizer conta do jogador. Em 393, "só" e "sozinho" repetem a mesma ideia, e
  "rejeitado" choca com a vida por nível, que foi adotada.
- **Recomendação:** 391: "tiraria os atributos do cálculo de dano". 393: "**Só mais vida, sem outra mudança:** não
  basta. A vida por nível entra junto com a curva achatada e o custo maior do Taijutsu e das Armas."

### I12. Título "Alternativas pesadas" diz outra coisa
- **Onde:** 385.
- **Problema:** é tradução literal de "Alternatives Weighed". Em português, "pesadas" lê como "alternativas
  difíceis, grandes".
- **Recomendação:** "## Alternativas avaliadas (Alternatives Weighed)".

## Detalhes

### D1. Diagrama largo demais para o celular
- **Onde:** 331-334 (a linha 333 tem cerca de 95 caracteres e é bloco de código, que não quebra linha).
- **Recomendação:** trocar por lista numerada curta: "1. Desafio e aceite (`duel.ts`). 2. Rodadas 1 a 3 (`gameWorld`
  com `DuelRules`; dano por `pvpHitDamage`). 3. Resultado gravado no banco (`game.duel_result`)."

### D2. Tabelas com células longas no celular
- **Onde:** 338, 340, 344 e toda a tabela de Riscos (371-383); a 382 tem 312 caracteres.
- **Recomendação:** em Riscos, trocar a tabela por uma lista: "**Risco.** Impacto. Mitigação." A 382 pode virar:
  "Mitigação: a tabela vale de propósito para todo dano entre jogadores. O simulador roda o pior caso de passiva e
  clima. Na Zona não há registro por rodada, então o efeito é visto na noite de duelo."

### D3. Jargão técnico sem explicação
- **Onde:** 341 "função pura", 344 "numa transação só", 338 "recebe eventos", 448 "descritos como dados", 444
  "branch".
- **Recomendação:** "função pura (só faz a conta, não mexe no jogo)"; "grava tudo de uma vez: ou grava tudo, ou
  nada"; "o `gameWorld` avisa o `duel.ts` do que acontece (golpe, morte, queda)"; "escritos numa lista, não em
  código"; "branch (cópia separada do código no GitHub)".

### D4. "Regras de borda"
- **Onde:** 353 (e 292).
- **Recomendação:** "**Casos especiais da partida:**" (tradução literal de "edge cases").

### D5. "Depois... depois" e "o mesmo desafio"
- **Onde:** 355-356.
- **Recomendação:** "Depois de uma recusa, quem desafiou só pode chamar a mesma pessoa de novo em 20 s."

### D6. Quem avisa é o jogo, não o desafio
- **Onde:** 359.
- **Recomendação:** "Ocupação: com as 2 áreas ocupadas, o jogo mostra "Vale cheio" e não envia o desafio."

### D7. "No meio" sem objeto; destino da partida anulada
- **Onde:** 364.
- **Recomendação:** "Publicação ou queda do servidor no meio da partida: a partida é anulada e não conta no MMR."
  Dizer se ela fica no registro (por exemplo, com motivo "anulada").

### D8. Tempo de espera do Render sem número
- **Onde:** 375.
- **Recomendação:** "O primeiro jogador espera cerca de N s até o servidor acordar." Usar o tempo medido.

### D9. "Dupla" e "par"; "por dia" sem fuso
- **Onde:** 377 e 426.
- **Recomendação:** usar só "dupla". "No máximo 3 partidas por dia (de meia-noite a meia-noite, horário de Brasília)
  da mesma dupla."

### D10. Frases vagas ou subjetivas em Riscos
- **Onde:** 372 "perdem a graça", 373 "PvE quebrado sem ninguém ver", 374 "a data revê a ordem, não cobra tudo
  pronto", 380 "inflando" e "Pontuação sem sentido", 382 "testes com os testadores", 383 "Bugs".
- **Recomendação:** "ficam mais fáceis (o Rei Lodo morre mais rápido)"; "o dano contra monstros muda sem aviso"; "Em
  15/12/2026 a ordem das entregas é revista; a data não é prazo para tudo ficar pronto"; "MMR subindo sem parar" e
  "o MMR deixa de medir habilidade"; "nas lutas com os testadores"; "erros".

### D11. Rede de segurança descrita de três jeitos
- **Onde:** 381 ("45% em 2 s"), 433 ("45% da vida em 2 s, por atacante"); o objetivo 3 (270) diz "vida máxima".
- **Recomendação:** sempre "45% da vida máxima em 2 s, por atacante".

### D12. Datas em dois formatos
- **Onde:** 415 "2026-11-01" contra 374 e 429 "15/12/2026".
- **Recomendação:** usar dd/mm/aaaa no texto: "(01/11/2026)".

### D13. Ambiguidades soltas em Alternativas e Decisões
- **Onde:** 387 "igualdade total" (exagero) e "Compensado pela..." (frase sem sujeito); 395 e 397 repetem o "teto de
  1,6x"; 401 "pequena para a tela" (sem número, e 409 rejeita o mapa por ser grande); 402 e 449 "população"; 404
  "amostra pequena demais"; 413 "jutsus aprendidos no duelo" (lê como "aprendidos durante o duelo"); 431 "60
  jogadores" sem "ativos"; 450 "Vale completo".
- **Recomendação:** 387: "todos teriam os mesmos jutsus. A diferença é compensada pela curva achatada e pelo limite
  do nível de uso." Juntar 395 e 397 num item. 401: dar o tamanho da arena em casas ou tirar "pequena". 402: "não há
  jogadores suficientes (o mínimo é 60 ativos)". 404: "com 30 partidas a margem de erro é de cerca de 18 pontos". 413:
  "cada um luta com os jutsus que já aprendeu". 431: "60 jogadores ativos". 450: "o Vale das Estátuas completo do
  brainstorm".

### D14. Títulos com o inglês entre parênteses
- **Onde:** 329, 367, 385, 411.
- **Recomendação:** se o formato do método não exigir, tirar o inglês. Se exigir, manter, mas o título em português
  vem certo (ver I12).
