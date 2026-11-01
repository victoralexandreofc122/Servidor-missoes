# Resolução dos achados da fase 3 (egm-resolve)

Cada achado do `critic_report.md` (e os que vieram das fases 1 e 2 sobre o mesmo ponto) foi classificado:
**CORRIGIR** (proponho a mudança no `concepts_brief.md`) ou **CONTESTAR** (não mudo, com o motivo). Onde a correção
depende de uma escolha sua, deixei a opção que proponho como **padrão**; você pode trocar.

| # | Achado | Classificação | Correção proposta |
|---|---|---|---|
| 1 | Teto de controle só cobre atordoar e prender | CORRIGIR | **Orçamento único de controle por jogador:** soma o "tempo sem poder agir" de atordoar, prender, sono e os choques da paralisia; silêncio conta pela metade (dá para andar e bater). No máximo **1,5 s por aplicação** e **2,5 s a cada 15 s**; passou disso, o efeito novo não pega. Lentidão não conta. |
| 2 | Simulador não testa builds | CORRIGIR | 4 builds de referência no nível 60: **vida** (Vitalidade alta), **meio a meio**, **ataque** (Ninjutsu ou Taijutsu alto), **armas**. Critérios: em todos os confrontos, tempo para matar entre 6 e 10 s; nenhuma build vence as outras 3; nenhuma sequência passa de 45% da vida do alvo em qualquer trecho de 2 s. Também mostra se o chakra dá para usar o kit numa rodada de 50 s. |
| 3 | Falta seção de riscos | CORRIGIR | Seção **Riscos e mitigações** em tabela: falta de gente (bot e noite marcada), servidor dormindo (aviso e acordar antes), registro em memória (gravar no banco), abuso (mesmo par conta no máximo 3 partidas por dia para o MMR; nível de uso só sobe com acerto em alvo que não seja aliado combinado: no duelo, o nível de uso **não sobe**), desafio em excesso (1 desafio pendente por vez, 20 s de espera depois de recusado), inflação do MMR (fator do novato só nas primeiras 30 partidas). |
| 4 | "Forma, não total" contraditório | CORRIGIR | Regra escrita assim: **o tier dá poder** (até 1,45x no tier 4, já contando a curva achatada); **o nível de uso muda a forma** e soma no máximo **+15%** sobre o nível 1 do mesmo tier. O teto vale **por lançamento** (soma de todos os projéteis e da queimadura). Exemplo corrigido: 3 bolas de 38% = 114%. |
| 5 | Fórmula de dano escondida e escopo da tabela | CORRIGIR | Uma função pura **dano por acerto** (atacante, alvo, jutsu, tier, nível de uso, regras), usada pelo servidor e pelo simulador; o dano passa a ser calculado por alvo. **Padrão de escopo:** a tabela vale para **todo dano de jogador em jogador** (duelo e Zona de Conflito); contra monstros nada muda. Assim não existem dois jogos diferentes. |
| 6 | Alternativas mais simples não avaliadas | CORRIGIR | **Rede de segurança no servidor: adotar.** Durante a luta, o dano que um jogador recebe em qualquer trecho de 2 s fica limitado a 45% da vida; o que passar é cortado e registrado (isso também resolve o "alerta"). **Atributos iguais no duelo: rejeitar por agora** (você quer vencer com a própria build; fica como plano B se o simulador não fechar). |
| 7 | Falta arquitetura | CORRIGIR | Seção **Como funciona por dentro**: desafio → aceite → partida (`duel.ts`, etapas e testes) → rodadas → regras do duelo (perfil passado ao combate) → dano por acerto (função pura + tabela) → registro (tabelas de partidas e rodadas no banco). |
| 8 | Escopo indefinido | CORRIGIR | **MMR de prévia entra** (calculado e gravado, aparece só no perfil como "prévia"; sem recompensa). **Piloto de kits fica fora** da 1ª entrega (é o passo 4). Itens da análise: kit e recargas do adversário na tela, aviso no chão de todo golpe com carga e placar/cronômetro **entram**; Mundo Falso e esquiva aleatória **fora** (são do brainstorm, não existem hoje); compensação de lag do duelo **entra** com 200 ms; rodada de 50 s e preparação de 10 s **entram**; 1 duelo por vez **entra**; meta de 10 testadores vira **critério de pronto**. |
| 9 | Ordem e alternativas desatualizadas; CLAUDE.md | CORRIGIR | Vale a **Ordem proposta (revisada)**, que substitui a do brainstorm. Alternativas: registrar que o "K alto nas 10 primeiras" foi rejeitado (você escolheu o fator nas 30 primeiras). Atualizar as "Próximas entregas" do `CLAUDE.md` com o PvP em 1º (neste branch). |
| 10 | Títulos em inglês, siglas, palavras com dois sentidos, unidades | CORRIGIR | Títulos em português (com o nome do EGM entre parênteses, para o `/egm-draft` reconhecer); explicar cada sigla no 1º uso; "interruptor" para o liga/desliga, "golpe com carga", "nível de uso" sempre por extenso; unidades em todos os números; frases longas quebradas. |
| 11 | Interruptor `duelo` na tabela de módulos (fase 1) | CORRIGIR | **Padrão:** interruptor simples em `config.ts` e no Painel do Admin, **sem mexer** na tabela `endgame_modules`. A migração v15 só cria as tabelas do duelo. |
| 12 | Regra dos níveis de uso mexe no PvE e no progresso (fase 1) | CORRIGIR | Em 2 passos: **(a)** na 1ª entrega, os 3 níveis de uso valem só nos cálculos de jogador contra jogador, derivados do contador atual (0 / 150 / 600 usos); o PvE e o progresso salvo **não mudam**. **(b)** A forma nova de cada jutsu e a troca de 4 para 3 níveis no jogo todo viram uma entrega própria depois, com a lista de jutsus e a conversão de quem já joga. |
| 13 | Diferença de nível no desafio (fase 2) | CORRIGIR | Qualquer nível a partir do 20 (com classe) pode desafiar qualquer outro; o MMR de prévia só conta se a diferença for de até 15 níveis. |
| 14 | Chakra fixo deixa o atributo inútil | CORRIGIR | No duelo o chakra volta **2 + 0,1 por ponto de Chakra** por segundo; o atributo continua valendo. |
| 15 | Versão da tabela nos registros | CORRIGIR | Cada rodada gravada leva a versão da tabela de equilíbrio. |
| 16 | "Rankeado", "Vale", termos do processo | CORRIGIR | "Duelo" no lugar de rankeado; "Vale das Estátuas" em todo o texto; "revisão EGM" explicada numa linha. |
| 17 | "Balance.ts cria lugar novo" (fase 1) | CONTESTAR em parte | Os números de combate continuam em `config.ts`, mas a **tabela de equilíbrio do PvP** fica num arquivo próprio porque o simulador e o servidor precisam ler a mesma tabela versionada. Fica escrito o porquê. |

**Fora daqui:** nada foi contestado por completo. A troca do Mundo Falso e da esquiva aleatória não se aplica (não
existem no jogo hoje).

## Situação

**Aplicado em 2026-11-01** (o Victor aprovou tudo com as escolhas padrão). Detalhes acrescentados na aplicação, para
fechar os furos da fase 2: fórmula do MMR de prévia (início 1.000, K = 24, fator `1 + 0,5 x (30 - n) / 30`), regras de
borda da partida (convite, ocupação, desconexão, queda do servidor), tamanho da área (18 x 12 casas), glossário,
critério de pronto e data para rever a prioridade (15/12/2026). O `CLAUDE.md` ganhou o PvP em 1º nas "Próximas entregas".
