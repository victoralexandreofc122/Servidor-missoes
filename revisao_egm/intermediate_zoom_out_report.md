# Revisão EGM, fase 4 de 5: visão geral intermediária (Zoom Out)

**Alvo:** `concepts_brief.md` (arquivo inteiro, versão depois da fase 3) · **Revisor:** `egm-zoom-out` (contexto limpo) ·
**Status:** concluído

Foco: as adições da fase 3 (orçamento de controle, rede de 45% em 2 s, `pvpHitDamage`, simulador com 4 builds, regras
de borda, MMR de prévia, riscos, arquitetura, escopo da tabela, níveis de uso só no PvP). Os achados já resolvidos não
foram repetidos. As afirmações sobre o código foram conferidas em `gameWorld.ts`, `jutsus.ts`, `stats.ts`,
`effects.ts`, `config.ts`, `admin.ts` e `db/schema_v11_endgame.sql`.

## Bloqueadores

### 1. O simulador, como está escrito, não tem como passar
* **Seção:** Objetivos, item 5 (critério "Passa se"); Decisão 7 (atributos livres).
* **Problema:** a regra pede tempo para matar entre 6 e 10 s **em todos os confrontos**. Isso deixa uma folga de
  1,67 vez entre o confronto mais rápido e o mais lento. Só que:
  - Os atributos sozinhos já dão uma diferença muito maior. Pela conta de `stats.ts` (com o soft cap de 0,05) no nível
    60: build vida = 379 de vida e dano 1x; meio a meio = 286 de vida e dano 1,91x; ataque = 100 de vida e dano 2,39x.
    O espelho "ataque contra ataque" mata cerca de **9 vezes** mais rápido que "vida contra vida". A tabela não mexe
    nisso: ela só achata o tier.
  - Só o tier e o nível de uso já gastam a folga toda: 1,45 x 1,15 = 1,67.
  - Pela mesma conta, o meio a meio vence as builds vida e ataque. O critério "nenhuma build vence as outras 3"
    também tende a falhar, e por causa dos atributos, não do tier.
  - Ainda faltam números: quantos pontos cada build tem em cada atributo, e que classe cada build usa (são 9 classes e
    4 builds). Isso vinha aberto da fase 2 (achado 2).
* **Recomendação:** antes de codar, decidir uma destas e escrever:
  (a) a tabela ganha uma peça para os atributos no PvP (por exemplo, um piso de vida ou um teto no multiplicador de
  dano entre jogadores);
  (b) a janela de 6 a 10 s vale só entre builds diferentes no mesmo tier, e os espelhos e os tiers baixos ganham outra
  faixa;
  (c) o plano B (atributos iguais no duelo) vira o plano A.
  Fixar as 4 builds em números (pontos por atributo e classe) e rodar uma conta à mão antes do passo 1.

## Importantes

### 2. "Todo dano de jogador em jogador" deixa fontes de dano de fora
* **Seção:** Objetivos 1 e 4; Decisão 5; regras de borda ("inclusive da Akatsuki").
* **Problema:** `pvpHitDamage` recebe "jutsu, tier e nível de uso". Mas o servidor marca 5 tipos de dano entre
  jogadores (`damagePlayer`, rótulos `jutsu`, `attack`, `arma:`, `poder:`, `efeito:`):
  - o Ataque Básico e a arma equipada (a build "armas" do simulador depende deles);
  - os 10 poderes da Akatsuki (`power()`, outro caminho, que também atordoa);
  - a queimadura e outros efeitos que batem a cada segundo;
  - o combo do molhado (+30% no Relâmpago), que entra no exemplo dos 410 de dano.
  A cura e a Pedra também crescem com o tier (`TIER.power` e `TIER.shield`) e ficam fora da curva achatada. E o
  documento deixa membros da Akatsuki duelarem sem dizer se os poderes funcionam no duelo.
* **Recomendação:** listar na tabela cada tipo de dano e dizer se entra ou não. No `DuelRules`, dizer "sem poderes da
  Akatsuki" (ou o contrário). Dizer se a curva achatada vale para a cura e o escudo.

### 3. O orçamento de controle não diz o que acontece com o controle dos monstros
* **Seção:** Objetivo 2; Decisão 5 ("o PvE não muda").
* **Problema:** o `controlDr` de hoje vale para **todo** controle num jogador, venha de outro jogador ou de monstro
  (`applyStatus`, `gameWorld.ts` linha 2001; o atordoamento de monstro e de poder da Akatsuki passa ali também). O
  `applyStatus` nem sabe quem causou o efeito. O orçamento novo é "de jogador em jogador". Fica no ar:
  - se o orçamento substitui o `controlDr` (aí o PvE muda) ou se os dois convivem;
  - se um atordoamento de monstro gasta o orçamento do jogador na Zona de Conflito.
* **Recomendação:** escrever: "o orçamento substitui o `controlDr` só quando quem causa é jogador; controle de monstro
  segue o `controlDr` de hoje". Passar quem causou para o `applyStatus` e para o `applyEffect`.

### 4. Os 3 níveis de uso só no PvP criam uma segunda escala sem ganho nesta entrega
* **Seção:** Análise 3 (passo 1); Decisão 1; Objetivo 8 (tela mostra o nível de uso do adversário).
* **Problema:** nesta entrega a forma do jutsu não muda. Então os 3 níveis (0 / 150 / 600 usos) servem só para dar
  um bônus de dano. Mas eles criam uma escala nova ao lado da de hoje (1 a 4, com 100 / 500 / 2.000). O mesmo jutsu
  aparece "nível 4" no inventário e "nível 3" no duelo. E ainda falta o valor do nível 2 (vinha aberto da fase 2,
  achado 10). A regra "soma projéteis e queimadura por lançamento" também só vale quando existir a forma nova.
* **Recomendação:** nesta entrega, usar o nível que já existe (1 a 4) com um bônus pequeno no PvP (por exemplo +0 / +5
  / +10 / +15%). A escala de 3 níveis e a conta por lançamento entram juntas com a forma nova, na entrega própria.

### 5. O lugar do `pvpHitDamage` mexe no PvE sem rede de proteção
* **Seção:** Objetivo 4; Como funciona por dentro; Riscos ("`gameWorld.ts` grande quebrar").
* **Problema:** o texto diz "o dano passa a ser calculado por alvo, e não uma vez por lançamento". Lido ao pé da
  letra, isso reescreve o `cast()` (que calcula o dano uma vez, perto da linha 1600) para todos os alvos, inclusive
  monstros. Isso contraria "o PvE não muda", e o risco listado só fala do duelo. O código já tem um ponto por alvo:
  `hitTarget` e `damagePlayer` (linhas 1873 e 3132), por onde todo golpe num jogador passa.
* **Recomendação:** escrever que o `pvpHitDamage` entra só quando o alvo é jogador, no `hitTarget`/`damagePlayer`, e
  que o caminho dos monstros fica igual. Acrescentar um teste que trava os números de dano do PvE de hoje. A rede de
  45% também cabe no `damagePlayer`.

### 6. O bot de duelo é uma peça grande escondida
* **Seção:** Análise 10; Objetivo 11; tabela da arquitetura ("máquina de estados dos monstros").
* **Problema:** monstro não usa jutsu de jogador. O `cast()` só aceita um jogador conectado (`Session`), e o
  `monsterAi.ts` só cuida de andar. Um bot com kit de classe pede um "ninja sem conexão" ou um segundo caminho de
  jutsus para monstros. E, se for monstro, o `pvpHitDamage` (de jogador em jogador) não vale para ele: o bot não testa
  o equilíbrio. O simulador já faz esse papel.
* **Recomendação:** tirar o bot do critério de pronto e deixá-lo para depois da noite de duelo. Se ficar, dizer que é
  um "ninja sem conexão" que usa o mesmo `cast()`, e que serve só de treino.

### 7. O escopo cresceu e o critério de pronto depende de coisa fora do código
* **Seção:** Objetivos (12 itens); Critério de pronto; Decisão 3 (revisão em 15/12/2026).
* **Problema:** as correções somaram peças: orçamento de controle, rede de segurança, dano por alvo, simulador com
  builds, regras de borda, MMR com fórmula, bot, mapa novo com arte e tela nova. São cerca de 6 semanas até
  15/12/2026 para um desenvolvedor sozinho. E o pronto pede "10 testadores, com 5 voltando", algo que não depende do
  código. A entrega pode nunca ficar "pronta", e as outras entregas ficam paradas até a data.
* **Recomendação:** dividir o pronto em dois. Pronto técnico: passos 1 e 2 publicados, simulador passando, 20 duelos
  gravados. Meta de comunidade: medida à parte, sem travar a entrega. Deixar o bot e o MMR de prévia como
  "se der tempo" ou para depois do passo 2.

## Detalhes

8. **"Aviso no chão de todo golpe com carga" não tem onde se aplicar.** Hoje nenhum jutsu de jogador tem carga; o
   aviso (`telegraph`) só existe nos golpes do Rei Lodo. A conjuração com selos ficou fora. Tirar do Objetivo 8 ou
   dizer quais golpes ganham carga.
9. **Os cortes da rede de segurança só vão para o Painel do Admin.** O painel lê memória, que zera a cada publicação.
   O critério de pronto ("cortes em no máximo 1 a cada 10 rodadas") precisa do número no banco: pôr "dano cortado" na
   lista do registro de cada rodada (Objetivo 9).
10. **A Zona de Conflito ganha a tabela, mas nada mede o efeito.** O risco diz "o registro mostra o efeito", mas o
    registro novo é só do duelo; a Zona grava em `pvp_kill`. A Zona também soma passiva da vila e clima, que o
    simulador não roda. E a arena das vilas também é PvP e não aparece no texto. Dizer isso no risco ou rodar o
    simulador também com o pior caso de passiva e clima.
11. **O interruptor `duelo` no Painel do Admin, sem banco, volta ao padrão a cada publicação.** Os interruptores de
    hoje (`fimdejogo`) passam pelo banco. Dizer o valor padrão no `config.ts` e que a troca pelo painel é temporária.
12. **A fórmula do chakra no duelo não segue o padrão do jogo.** "2 + 0,1 por ponto" usa pontos crus; o jogo usa
    pontos com soft cap (`meditationChakraPerSec` em `stats.ts`). Usar a conta que já existe (por exemplo, uma fração
    dela). Lembrar também que a vida volta 1/s com o chakra cheio (`hpRegenPerSec`): dizer se isso vale no duelo.
13. **O orçamento cobra o tempo previsto ou o tempo real?** O sono acaba ao apanhar, e hoje nenhum jutsu aplica sono
    (só o comando do admin). Uma linha resolve: "conta o tempo que o efeito durou de fato" (ou o previsto).
14. **Desconexão de 15 s:** dizer se o cronômetro da rodada para enquanto o jogador está fora.
