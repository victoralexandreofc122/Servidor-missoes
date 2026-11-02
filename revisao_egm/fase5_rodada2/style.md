# Revisão de estilo (egm-style), fase 5, 2ª rodada

Alvo: `concepts_brief.md`, linhas 234 a 567, e o glossário (9 a 34). Leitor: o Victor, no celular, em português do
Brasil. Verificação feita: nenhum travessão longo (— ou –) no arquivo. No trecho, 26 linhas passam de 120 caracteres,
quase todas células de tabela (a 478 tem 208; a 487, 179; a 393, 178).

Contagem: 9 fechados e 3 abertos da 1ª rodada. Novos: 0 Bloqueadores, 5 Importantes, 16 Detalhes.

## Achados da 1ª rodada: fechado ou aberto

As linhas da 1ª rodada eram de outra versão; a coluna "Onde agora" usa as linhas de hoje.

| Achado | Situação | Onde agora | Nota |
| --- | --- | --- | --- |
| I1. "Kit" com dois sentidos, fora do glossário | FECHADO | 30, 371, 565 | Glossário define kit; as habilidades novas não se chamam mais kit. |
| I2. "Passo 2" com dois sentidos; "fases" | ABERTO | 148, 287, 357, 360, 546 | Ver abaixo. |
| I3. Aviso no chão na tela | FECHADO | 350-351, 400 | |
| I4. Escopo da tabela diferente entre objetivo 1 e Decisão 5 | FECHADO | 260, 535 | Os dois dizem "mapas de PvP". |
| I5. "Ninguém sai" contra "sair de propósito" | FECHADO | 463-464 | Botão "Desistir" explícito. |
| I6. "Fora de combate" sem número | FECHADO | 461 | 10 s. |
| I7. "Fator do novato" antes de ser explicado | ABERTO | 485, 509, 525 | Ver abaixo. |
| I8. "Perde f vezes menos" ambíguo, sem exemplo | FECHADO | 527-528 | Exemplo entrou. Restos ("1.000" sem unidade, "perde -8") no Detalhe D13. |
| I9. "Tabela" do banco contra tabela de equilíbrio | FECHADO | 32, 510-511, 533 | O glossário separa as duas. |
| I10. "Rejeitado por agora" e dois "plano B" | ABERTO | 318, 494-497, 504, 508 | Ver abaixo. |
| I11. "Conta" ambíguo; "só com mais vida" | FECHADO | 502-503 | |
| I12. Título "Alternativas pesadas" | FECHADO | 490 | |

**I2, o que falta:** a lista da Ordem (548 a 566) continua sem a palavra "Passo", mas o texto usa "passo 1", "passo 2",
"passo 2c", "passo 3" e "passo 4" doze vezes antes dela (a primeira em 287). A 148, na Análise 3, ainda diz "também
fica para o passo 2", que lá quer dizer a entrega própria da forma nova, não o duelo. E a 546 ainda fala em "fases",
que colide com as "fases 3, 4 e 5 da revisão" da linha 4.
Recomendação: 548 "1. **Passo 1: equilíbrio, sem migração.**"; 560 "2. **Passo 2: duelo.**"; 564 "3. **Passo 3:**
noite de duelo..."; 565 "4. **Passo 4:** ..."; 566 "5. **Passo 5:** ...". 546: "**Ordem dos passos** (substitui a
ordem do brainstorm):". 148: "Isso também fica para a entrega própria: só contar o uso que acerta um alvo válido."

**I7, o que falta:** "fator do novato" não entrou no glossário e aparece em 485 (Riscos) e 509 (Alternativas) antes da
definição, em 525.
Recomendação: glossário, depois do K: "**Fator do novato:** multiplicador que faz o jogador com menos partidas de
duelo ganhar mais e perder menos MMR, só nas 30 primeiras partidas (Decisão 2)."

**I10, o que falta:** continuam dois "plano B" sem ordem (494-495 e 496-497), e a 318 chama de "o plano B" só o dos
atributos iguais. O gatilho do primeiro ("se o bônus de +15% não bastar") não é medível. Continuam "rejeitado por
agora" (504) e "rejeitado para agora" (508), que querem dizer "adiado".
Recomendação: 494: "**Todo jutsu aprendido no nível de uso máximo dentro do duelo:** plano B (1º). Entra se o
simulador falhar depois dos ajustes de custo, recarga e dano." 496: "**Atributos iguais para todos no duelo:** plano B
(2º). Entra se o simulador ainda falhar com o plano B (1º)." 318: "por último, os planos B (ver Alternativas)." 504:
"**Comprimir a curva de tier também no PvE:** adiado." 508: "**Equilibrar pela taxa de vitória por classe:** adiado
(com 3 testadores, a amostra é pequena demais)."

## Bloqueadores

Nenhum.

## Importantes

### I1. "Reduções de 60%" rejeitadas, mas o valor escolhido é uma redução de 60%
- **Onde:** 500-501, contra 240 e 540.
- **Problema:** a 240 diz que o dano dos jutsus "vai a 40%", ou seja, cai 60%. A 500 diz que "reduções de 60%, 50%,
  30% e 25%" foram rejeitadas, mas ali o número é o que sobra do dano, não o que sai. Lido ao pé da letra, o
  documento rejeita a opção que escolheu.
- **Recomendação:** 500: "**Outros valores para o dano base (60%, 50%, 30% e 25% do dano de hoje):** com 60% e 50%,
  um jogador ainda tira mais de 50% da vida do outro em 2 s; com 30% e 25%, o duelo e o PvE ficam lentos demais."
  240: "o dano base dos jutsus cai para **40%** do de hoje e o do Ataque Básico e da arma, para **50%**".

### I2. "Fator" nomeia três coisas
- **Onde:** 317 ("depois no fator de dano"), 402 ("com o fator novo"), 485, 509 e 525 ("fator do novato").
- **Problema:** em 317 e 402 "fator" é a escala de dano (`damageScale`); em 485 a 525 é o multiplicador do MMR. Na 317,
  que diz o que mexer se o simulador falhar, o leitor não sabe se é a escala de dano, a curva de tier ou o fator do
  novato.
- **Recomendação:** 317: "depois na escala de dano (`damageScale`)". 402: "Confere o dano contra monstros com o dano
  base menor e prova que o `pvpHitDamage` não toca monstros." Guardar "fator" só para o fator do novato.

### I3. "Queda" quer dizer desconexão do jogador e queda do servidor, com resultados opostos
- **Onde:** 393 ("desistência, queda e fim"), 465 ("quem caiu perde a partida"), 468 ("Queda ou publicação do
  servidor ... a partida é anulada").
- **Problema:** na desconexão do jogador ele perde; na queda do servidor a partida é anulada. A mesma palavra leva a
  dois resultados contrários.
- **Recomendação:** "queda" só para o servidor. 393: "desistência, desconexão e fim". 465: "depois disso, quem se
  desconectou perde a partida." 468: "Queda ou publicação do servidor no meio da partida: a partida é anulada e não
  conta no MMR."

### I4. Regras da partida sem o limite da rodada; "morte dupla" contra "ninguém morre"; Decisão 12 incompleta
- **Onde:** 456-469, 377, 542.
- **Problema:** a lista "Regras da partida" não diz que a rodada dura até 50 s nem que, no fim do tempo, vence quem
  tem mais vida em porcentagem (isso só está em 214 e 220). Por isso "empate em tudo" (466) e "o desempate por vida"
  (377) ficam sem referência. A 466 diz "morte dupla", mas 413 e 469 dizem que no duelo ninguém morre. E a Decisão 12
  (542) resume o empate como "a rodada é repetida", pulando o desempate por vida e por dano na rodada.
- **Recomendação:** acrescentar no começo da lista: "- Rodada: até 50 s. No fim do tempo, vence quem tem mais vida em
  porcentagem; se der igual, quem causou mais dano na rodada." 466: "**Os dois zeram a vida no mesmo instante, ou
  empate em vida e em dano:** a rodada é repetida uma vez; se empatar de novo, vence quem causou mais dano na
  partida." 542: "**Empate:** primeiro vale a vida em porcentagem, depois o dano na rodada; se ainda empatar, a rodada
  é repetida uma vez e, depois, vence quem causou mais dano na partida."

### I5. Os kits do simulador não dizem quais jutsus entram
- **Onde:** 299-307.
- **Problema:** a 299 diz "2 kits (8 jutsus)", mas cada célula da tabela tem uma palavra só ("Fogo", "Água",
  "Taijutsu"). Pelo glossário, kit é um conjunto de até 4 jutsus. Quem escreve o simulador não sabe quais 8 jutsus
  usar, nem em que tier e nível de uso.
- **Recomendação:** antes da tabela: "Cada célula diz de que elemento ou classe são os jutsus do kit. Todos no tier 4 e
  no nível de uso 4." E listar os 4 de cada um (por exemplo, "Kit A: os 4 jutsus de Fogo da Extração"), ou dizer
  quantos o kit tem quando o elemento tiver menos de 4.

## Detalhes

### D1. "Vale" verbo ao lado de "Vale" lugar
- **Onde:** 260 ("Vale nos mapas de PvP: Vale das Estátuas"), 281 ("Vale só quando").
- **Recomendação:** 260: "Funciona nos **mapas de PvP**: Vale das Estátuas, arena das vilas e Zona de Conflito." 281:
  "Só conta quando quem causa é jogador".

### D2. "Escudo da Pedra" lembra a Vila da Pedra, que saiu na v20
- **Onde:** 262-263.
- **Recomendação:** "vale também para a cura e para o jutsu Escudo de Pedra, inclusive quando o ninja cura ou protege
  a si mesmo;".

### D3. Curva de tier sem dizer que são multiplicadores
- **Onde:** 262 e 520 ("1 / 1,15 / 1,3 / 1,45").
- **Recomendação:** 262: "a curva de tier achatada: o dano vezes 1; 1,15; 1,3 e 1,45 nos tiers 1 a 4 (hoje a
  diferença é maior)". Se couber, dar o número de hoje para o tier 4.

### D4. "Toque" do simulador, "tocar" na tela e "tique" do servidor
- **Onde:** 309-310 ("um toque a cada 0,4 s", "Em cada toque"), 340-341 ("tique do jogador"), 426 ("Ao tocar em
  Desafiar").
- **Recomendação:** 309: "batem ao mesmo tempo, uma ação a cada 0,4 s, sem errar." 310: "Em cada ação:".

### D5. Termos de jogo sem explicação nas tabelas
- **Onde:** 255 ("1 do leque"), 274 e 290 ("molhado"), 274 (resposta "Fica, dentro da rede de segurança" numa coluna
  de sim/não).
- **Recomendação:** 255: "Kunai (Armas, uma kunai do leque)". 274: "| Combo do molhado (alvo molhado pela Água leva
  +30% do Relâmpago) | Não; o combo continua, limitado pela rede de segurança |".

### D6. Rede de segurança dita de quatro jeitos
- **Onde:** 285 ("50% da vida máxima"), 316 ("50% da vida do alvo"), 486 ("50% em 2 s"), 536 ("50% da vida em 2 s,
  por atacante").
- **Recomendação:** sempre "50% da vida máxima em 2 s, por atacante".

### D7. Tabela de resultados sem dizer o que mede
- **Onde:** 319-327.
- **Recomendação:** 319: "Tempo para matar com os números deste plano (em segundos; melhor caso para quem ataca):". No
  cabeçalho, trocar "Atacante \ defensor" por "Quem ataca".

### D8. "Duelos" como unidade; "no critério de pronto"
- **Onde:** 361 ("20 duelos reais"), 531 ("revista no critério de pronto").
- **Recomendação:** 361: "pelo menos 20 partidas de duelo reais registradas". 531: "A ordem é revista quando o
  critério de pronto for atingido ou em 15/12/2026, o que vier antes."

### D9. "Pontos da tabela do objetivo 8"
- **Onde:** 394.
- **Problema:** "pontos" também são os pontos de atributo, e "tabela" no glossário é a tabela de equilíbrio.
- **Recomendação:** "Lido nos lugares da coluna "Onde é lida" do objetivo 8."

### D10. "Ao mesmo tempo" não é exato
- **Onde:** 405.
- **Recomendação:** "a tabela do PvP tem versão e é lida pelo servidor e pelo simulador; a versão gravada em cada
  rodada aponta para uma tabela só."

### D11. Regra do desafio ainda ambígua
- **Onde:** 458-459 (era o D5 da 1ª rodada).
- **Problema:** "a mesma pessoa só pode ser desafiada de novo 20 s depois" não diz se a espera vale para todos ou só
  para quem desafiou. "1 desafio pendente" não diz se é enviado ou recebido.
- **Recomendação:** "Desafio: o convite expira em 20 s; cada jogador só pode ter 1 desafio enviado esperando
  resposta; depois de uma recusa, quem desafiou só pode chamar a mesma pessoa de novo depois de 20 s."

### D12. Interruptores de volta: formato diferente e um que só aparece aqui
- **Onde:** 478.
- **Problema:** "`damageScale` 1" está sem dois-pontos e, em 241, `damageScale` é um objeto com dois valores. O
  interruptor `pvpBalance: false` não aparece nos objetivos.
- **Recomendação:** "`pvpBalance: false`, `hpPerLevel: 0` e `damageScale: { jutsu: 1, basic: 1 }`." No objetivo 1,
  acrescentar: "Desligável pelo interruptor `pvpBalance` no `config.ts`."

### D13. Restos no MMR de prévia
- **Onde:** 524-529.
- **Recomendação:** 524: "começa em 1.000 pontos; muda por partida, não por rodada; Elo padrão (escala 400: quem tem
  400 pontos a mais tem 10 vezes mais chance de vencer) e K = 24;". 527: "se o Elo tiraria 12, ele perde só 8." 529:
  "e até 3 partidas por dia (horário de Brasília) da mesma dupla." Na 482, trocar "fuso de São Paulo" e "do mesmo par"
  por "horário de Brasília" e "da mesma dupla".

### D14. "Atributos no duelo: livres"
- **Onde:** 537.
- **Problema:** "livres" pode ser lido como "dá para redistribuir os pontos no duelo".
- **Recomendação:** "**Atributos no duelo:** cada um luta com os pontos que já distribuiu, sem igualar."

### D15. Frases soltas
- **Onde:** 418-419, 481, 551.
- **Recomendação:** 418: "efeitos (inclusive atordoamento e prisão), escudo, Substituição, Cinco Corações e outros
  bônus limpos". 481: "O primeiro jogador a entrar espera cerca de 1 min". 551: "anotar quantos golpes o Slime e o Rei
  Lodo passam a levar para morrer."

### D16. Detalhes da 1ª rodada que continuam
- **D2 (tabelas largas):** Riscos (475-488) segue tabela de 3 colunas, até 208 caracteres; Peças (393-402) e Ganchos
  (412-416) também. Recomendação: em Riscos, lista "**Risco.** Impacto. Mitigação."
- **D3 (jargão):** 399 e 446 "numa transação" ("grava tudo de uma vez: ou tudo, ou nada"); 333 "`if` espalhado"
  ("exceções espalhadas pelo código"); 356 "`to_regclass`" ("como o fim de jogo faz hoje ao ver se a tabela existe");
  565 "descritas como dados" ("escritas numa lista, não em código").
- **D9 ("par"):** 412, 482 e 529. Usar "dupla" para quem joga junto e "adversário" na 412: "Acerta só o adversário do
  mesmo duelo".
- **D10 (Riscos subjetivos):** 476 "perdem a graça" ("ficam fáceis demais"); 477 "PvE quebrado sem ninguém ver" ("o
  dano contra monstros muda sem aviso"); 479 "a data revê a ordem, não cobra tudo pronto" ("em 15/12/2026 a ordem é
  revista; a data não é prazo"); 485 "inflando" e "Pontuação sem sentido" ("MMR subindo sem parar"; "o MMR deixa de
  medir habilidade"); 488 "Bugs" ("Erros").
- **D13 (Alternativas):** 492 "igualdade total" ("todos teriam os mesmos jutsus"); 502 e 503 repetem o teto de 1,6x
  (juntar num item); 505 "pequena para a tela" (dar o tamanho ou tirar); 368 e 506 "população" ("60 jogadores
  ativos"); 516 "jutsus aprendidos no duelo" ("cada um luta com os jutsus que já aprendeu"); 533 "60 jogadores" ("60
  jogadores ativos").
