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

## Fase 4 (visão geral intermediária): resolução

O Victor pediu os números antes de decidir o bloqueador (`revisao_egm/numeros_atributos_pvp.md`) e trouxe uma saída
própria: **vida por nível no jogo todo** (+6 por nível acima do 1). Para Taijutsu e Armas, que continuavam matando em
1 a 2 s, escolheu **custo e recarga maiores no PvP** (x4 e x2,5). O critério do simulador passou a ser "todo confronto
entre 2 e 12 s; meio a meio contra meio a meio entre 6 e 10 s".

| # | Achado da fase 4 | Correção aplicada |
|---|---|---|
| 1 | Simulador não tinha como passar | Vida por nível, custo e recarga de Taijutsu e Armas, 5 builds em números, critério novo. |
| 2 | Fontes de dano fora da tabela | Tabela com cada tipo de dano; poderes da Akatsuki desligados no duelo; curva achatada vale para cura e escudo. |
| 3 | Controle de monstro | Orçamento só quando quem causa é jogador; monstro segue o `controlDr`; `applyStatus`/`applyEffect` recebem quem causou. |
| 4 | Segunda escala de níveis de uso | Nesta entrega, os níveis 1 a 4 de hoje com +0/+5/+10/+15% no PvP; os 3 níveis e o limite por lançamento vão para a entrega da forma nova. |
| 5 | `pvpHitDamage` mexendo no PvE | Só quando o alvo é jogador (`hitTarget`/`damagePlayer`), com teste que trava o dano do PvE. |
| 6 | Bot escondido | Fora do pronto; depois da noite de duelo, como "ninja sem conexão", só treino. |
| 7 | Escopo e pronto | Pronto técnico separado da meta de comunidade; MMR de prévia no passo 2b. |
| 8-14 | Detalhes | Aviso no chão adiado; dano cortado no registro; pior caso de passiva e clima no simulador; interruptor ligado por padrão e troca temporária; chakra a 1/3 da meditação e sem vida voltando no duelo; orçamento conta o tempo real; cronômetro para na desconexão. |

## Fase 5 (prontidão para construir): resolução

Decisões do Victor (02/11/2026): dano base menor no jogo todo (jutsus a 40%, Ataque Básico e arma a 50%), monstros
como estão; os 2 kits valem no duelo, com troca livre; empate repete a rodada uma vez. Com esses números, a simulação
mostrou a build de Armas vencendo todas as outras pelo Ataque Básico; o Claude propôs o bônus de Armas pela metade no
Ataque Básico, e o simulador confirmou que nenhuma build vence todas. A rede de segurança subiu para 50% em 2 s (o pico
simulado é 44%).

| Achado da fase 5 | Correção aplicada |
|---|---|
| 1. `pvpHitDamage` não encaixa | Pacote do golpe (`HitInfo`) montado no `cast()` e levado ao `hitTarget`, ao projétil e à queimadura; ordem dos cálculos escrita. |
| 2. Custo e recarga sem regra | Valem nos mapas de PvP; o servidor manda custo e recarga ao cliente. |
| 3. Simulador falhava | Dano base menor, rede a 50%, critério novo (6 a 30 s; meio a meio 12 a 20 s), algoritmo em passos, o que mexer se falhar. |
| 4. Regras da rodada e ganchos | Tabela de ganchos no `gameWorld`, o que volta ao início, queda por 15 s, "fora de combate" = 10 s, botão "Desistir", empate. |
| 5. Mensagens | Tabela de 8 mensagens com campos e quando são mandadas. |
| 6. Migração | `db/schema_v15_duelo.sql` com tabelas, colunas e a função; MMR vazio até o 2c; duelo desligado sem a migração; listas de migração dos testes. |
| Importantes | Passo 1 em 7 partes publicáveis; vida por nível no código; orçamento de controle e rede com janela, estado e ordem; tabela do `DuelRules`; 2 kits; mapa `valley` com muro de 4 casas e câmera fixa; volta atrás por interruptores; teste do PvE; cura e escudo nos mapas de PvP; glossário (kit, mapa de PvP, tabela de equilíbrio); exemplo do fator do novato; "Alternativas consideradas"; datas num formato só. |
