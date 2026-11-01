# Revisão EGM, fase 2 de 5: teste de compreensão

**Alvo:** `concepts_brief.md` (inteiro, lido sozinho) · **Revisor:** `egm-comprehension` (contexto limpo) · **Status:** concluído

## O que o documento propõe (nas palavras do revisor)

A primeira entrega do PvP é um duelo 1x1 em que um jogador desafia e o outro aceita. Vale entre quaisquer vilas, é
melhor de 3 e acontece num mapa pequeno e fixo que cabe na tela do celular. Cada um usa os jutsus que já aprendeu. O
dano e o controle no PvP passam a seguir uma tabela de equilíbrio própria: curva de tier achatada, teto de dano por
acerto e teto de controle. Um simulador dentro do `npm run verify` confere essa tabela. Os níveis de uso passam a ser 3,
calculados pelo contador que já existe, e só contam usos que acertam; eles mudam a forma do jutsu, não o total. O duelo
ganha um módulo próprio (`duelo`), regras passadas como perfil ao combate, registro de cada rodada no banco (migração
v15), MMR separado só como prévia, com bônus para novatos, e um bot de treino. Fila, 3x3, invocações e instâncias ficam
para depois. O PvP passa na frente de todas as outras entregas.

## Como o sistema atual funciona, segundo o documento

O dano multiplica tier (até 2,8x), nível de uso (até +30%), Ninjutsu (até ~2,4x), passiva da vila e clima. A vida só
cresce por pontos, então um combo tier 4 mata na hora. O controle também cresce com o tier (até 8,5 s), e o
`controlDr` só corta a segunda aplicação. Hoje há 4 níveis de uso numa coluna gerada do banco. Não há instâncias de
mapa, e a arena só aceita a vila dona. O MMR atual (`game.pvp_kill`) conta por abate e mexe em karma, recompensa e
Akatsuki. O módulo `pvp` só liga com 60 jogadores. As estatísticas de PvP ficam só na memória.

## Achados

| # | Severidade | Onde | Problema | Recomendação |
|---|---|---|---|---|
| 1 | Importante | Análise 3, Metas, Decisão 1 | O exemplo "3 bolas de 40% = 120%" passa do teto de +15%; a Análise diz que o tier só muda a forma, mas as Metas dão +45% ao tier. Não se sabe se o +15% vem por cima do tier. | Corrigir o exemplo e dizer como tier e nível de uso se combinam no dano máximo. |
| 2 | Importante | Metas (simulador) | "Vida de referência", atacante e defensor do "tempo para matar" e o kit de cada classe não estão definidos. | Fixar build, nível, kit e alvo de referência. |
| 3 | Importante | Metas | "Controle duro" não definido; não se diz o que acontece dentro da janela de 15 s; o teto de dano por acerto não tem número. | Definir tipos de controle, regra da janela e números. |
| 4 | Importante | Análise 5 | "1 ou 2 duelos ao mesmo tempo" num mapa único: como dividem o mapa, o terceiro desafio, entrada e saída. "Água que sobe" citada sem explicação. | Descrever entrada e saída, ocupação e a água. |
| 5 | Importante | Análise 9, Metas | Rodada de 50 s, preparação e desempate ainda como "proposta"; faltam intervalo, desconexão, fuga, tempo para aceitar e recusa; a conta de tempo não fecha explícita. | Registrar valores e casos de borda. |
| 6 | Importante | (ausente) | Diferença de nível no desafio: um nível 1 pode desafiar um nível 60? | Decidir a regra para desafiar e para contar MMR. |
| 7 | Importante | Metas | A tabela de equilíbrio vale para todo o PvP (mundo aberto) ou só o duelo? O simulador conta o clima, o perfil do duelo tira. | Dizer onde a tabela se aplica. |
| 8 | Importante | Análise 7 e 8 vs Metas | Kit do adversário com nível e recarga, aviso no chão, remoção do Mundo Falso e da esquiva aleatória, valor da compensação de lag: sumiram das Metas. | Incluir ou excluir de forma explícita. |
| 9 | Importante | Análise 6, Decisão 2 | MMR do duelo sem K, valor inicial, formato, unidade (partida ou rodada), fórmula do fator 1 a 1,5 e se aparece ao jogador. | Dar a fórmula. |
| 10 | Detalhe | Análise 3 | O contador inclui usos que não acertaram; não se diz o que acontece com o progresso acumulado nem quanto cada nível dá; a Análise 1 usa "nível de uso 4" da escala antiga. | Declarar a conversão e os valores. |
| 11 | Detalhe | Análise 8 | Chakra "por exemplo 3/s" sem chakra máximo; o alerta de teto não diz para quem vai. | Fixar números e o destino do alerta. |
| 12 | Detalhe | Geral | "EGM" e "Goldfish" sem explicação; a "ordem das fases do brainstorm" pode conflitar com a "Ordem proposta (revisada)"; "meio a meio", "módulo" e o bot (classe, entra no registro?) sem explicação. | Glossário curto e uma ordem só. |
| 13 | Detalhe | Análise 8 | `PvpStats` em memória e Render dormindo citados como problemas, sem dizer o que a proposta faz com eles. | Dizer que o registro no banco resolve o primeiro e o plano para o segundo. |
