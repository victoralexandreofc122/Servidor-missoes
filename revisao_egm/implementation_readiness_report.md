# Revisão EGM, fase 5 de 5: pronto para construir?

**Alvo:** `concepts_brief.md`, linhas 329 a 450 (como funciona por dentro, riscos, alternativas, decisões e a ordem),
com o resto do documento como contexto.

## Situação dos revisores

| Revisor | O que olhou | Achados | Relatório completo |
| --- | --- | --- | --- |
| `egm-implementation-readiness` | Se dá para codar os passos 1 e 2 sem decidir design | 6 bloqueadores, 9 importantes, 6 detalhes | `revisao_egm/fase5/readiness.md` |
| `egm-codebase-details` | Cada afirmação do plano contra o código | 3 bloqueadores, 12 importantes, 10 detalhes | `revisao_egm/fase5/codebase.md` |
| `egm-style` | Texto para leitura no celular | 0 bloqueadores, 12 importantes, 14 detalhes | `revisao_egm/fase5/style.md` |

**Veredito:** ainda não está pronto para codar. O "quê" está decidido; o "como" ainda não, em 6 pontos. As afirmações
sobre o código conferem (linhas citadas, `TIER`, `controlDr`, chakra só meditando, `maxRewindMs` 300, K 32 no
`pvp_kill`, vida máxima fora do banco).

Abaixo, os achados juntos e sem repetição. **[Decisão do Victor]** marca o que depende de uma escolha de jogo.

## Bloqueadores

### 1. A função de dano do PvP não encaixa onde o plano diz
* **Problema:** o `hitTarget`, os projéteis (Fogo, Kunais) e a queimadura recebem o dano já calculado no `cast()`,
  com atributos, nível de uso, passiva, clima e combo dentro (`gameWorld.ts` ~1590, ~1747, 2040 a 2102). Nenhum
  desses pontos sabe o jutsu, o tier ou o nível de uso.
* **Recomendação:** o `cast()` monta um pacote com os dados do golpe (jutsu, tier, nível de uso, dano base, bônus da
  arma, atributo, molhado, passiva, clima) e o entrega ao `hitTarget`, ao projétil e à queimadura. O `hitTarget`
  chama a função do PvP só quando o alvo é jogador. Ordem: dano do PvP, depois escudo e Cinco Corações, depois rede de
  segurança, depois a vida.

### 2. Custo e recarga x4 e x2,5 não dizem quando valem
* **Problema:** o custo e a recarga são cobrados no `cast()`, antes de saber quem foi atingido (`gameWorld.ts`
  ~1698). O cliente mostra a recarga do `config` (`public/game.js` ~2841).
* **Recomendação:** valem **pelo mapa**: no Vale das Estátuas, na arena das vilas e na Zona de Conflito. O servidor
  manda a recarga e o custo de verdade ao cliente.

### 3. O simulador falha com os números do próprio plano **[Decisão do Victor]**
* **Problema:** quem mata em menos de 4,4 s tira mais de 45% da vida em algum trecho de 2 s. A tabela do plano tem 9
  confrontos abaixo de 4,4 s (por exemplo, Taijutsu contra build de dano em 2,0 s). Então o critério "nenhuma
  sequência passa de 45% em 2 s" falha, o `npm run verify` trava e a rede de segurança cortaria dano em lutas normais
  de build de dano. Além disso, o jeito de simular a luta (ordem dos jutsus, os dois batendo, controle, o que é
  "vencer", empate) não está escrito, e o simulador só testa o código de verdade se o orçamento de controle e a rede
  também forem funções puras.
* **Recomendação:** escolher entre: (a) a rede de segurança sobe para algo como 60% em 2 s; (b) a build de dano
  (menos de 30% da vida em Vitalidade) fica fora do critério dos 45%; (c) mais vida por nível. Depois, escrever o
  algoritmo do simulador em passos.

### 4. As regras da rodada e os ganchos no `gameWorld` não estão escritos
* **Problema:**
  - No Vale ninguém se acerta: o `canHurt` (`gameWorld.ts` ~1827) não conhece duelo.
  - A morte manda o ninja para a vila (`:3155` a `:3255`); no duelo a rodada tem que acabar sem morte de verdade.
  - Não diz o que volta ao zero a cada rodada (vida, chakra, recargas, efeitos, escudo, Substituição, posição).
  - Morte dupla e empate de partida sem regra **[Decisão do Victor]**.
  - "15 s para voltar" não existe: quem cai some na hora e volta como novo, na vila (`:937`).
  - "Fora de combate" não existe no código; "sair de propósito" não tem mensagem própria, e "ninguém sai antes do
    fim" contradiz "sair conta como derrota".
* **Recomendação:** uma tabela "Ganchos no `gameWorld.ts`" (acerto, vida zerada, saída, volta), a lista do que zera
  por rodada, o `duel.ts` guardando o estado de quem caiu por 15 s, "fora de combate" = sem dar nem levar dano há 10
  s, e um botão "Desistir" com mensagem própria.

### 5. Não existem as mensagens entre o cliente e o servidor do duelo
* **Problema:** desafiar, convite, aceitar, recusar com motivo, estado da partida, kit do adversário e resultado não
  estão nomeados (`protocol.ts`).
* **Recomendação:** uma tabela de mensagens com os campos e quando cada uma é mandada (exemplos no relatório
  `fase5/readiness.md`, B5).

### 6. A migração v15 não tem esquema, e não diz o que acontece sem ela
* **Problema:** sem nome de arquivo, tabelas, colunas nem assinatura da função; não está claro se o MMR entra no
  passo 2 ou no 2b; a lista de migrações dos testes (`test/support/testDb.ts:10`) para na v13; "v15" também é nome de
  versão do jogo.
* **Recomendação:** `db/schema_v15_duelo.sql` com as tabelas de partidas, rodadas e MMR (vazia até o 2b) e a função
  descritas no plano; pôr v14 e v15 na lista dos testes; se o código subir sem a migração, o duelo fica desligado e o
  log avisa (como o fim de jogo já faz).

## Importantes

7. **Passo 1 grande demais:** dividir em subpassos publicáveis: 1a teste que trava o dano do PvE (antes de mexer em
   tudo); 1b vida por nível; 1c tabela e função de dano; 1d orçamento de controle; 1e rede de segurança; 1f
   simulador.
8. **Vida por nível no código:** `computeStats` e `statsFor` não recebem o nível, e a subida de nível não recalcula a
   vida. Dois testes mudam de número (`test/v8.test.ts:200` e `:232`). Pôr `hpPerLevel: 6` no `config.ts` e dizer que
   a vida atual sobe junto.
9. **Orçamento de controle:** janela deslizante; o que fazer quando sobra só parte do orçamento; onde fica o estado;
   como entram o choque da paralisia e os poderes da Akatsuki; o `applyStatus` passa a receber quem causou (o
   `applyEffect` já recebe).
10. **Rede de segurança:** janela deslizante; conta depois do escudo; onde guarda o histórico; no passo 1 o corte vai
    para o `PvpStats` (memória) e aparece no painel.
11. **Perfil do duelo (`DuelRules`):** falta o formato e a lista dos pontos do código que passam a ler cada regra.
12. **Kit do duelo [Decisão do Victor]:** o ninja pode ter 2 kits (A e B), trocar no meio da luta, ter classe
    secundária a partir de Chunin e os jutsus da Academia (a Substituição anula um golpe). O simulador mede só 4
    jutsus de uma classe.
13. **Mapa do Vale:** é barato (sem migração e sem arte nova), mas o campo `arenas` exige vila; o Fogo (raio até 3,5)
    e a Ilusão (até 4,5) atravessam a divisa entre as 2 áreas; a câmera fixa é código novo no cliente.
14. **Volta atrás do passo 1:** o passo 1 muda todo PvP e a vida no PvE direto na `main`. Dizer que a volta é reverter
    o commit, ou ter interruptores no `config.ts` (`pvpBalance` e `hpPerLevel` = 0).
15. **Tela e fluxo do desafio no cliente:** onde fica o botão "Desafiar", como aparece o convite, onde ficam placar,
    cronômetro e kit do adversário no celular deitado.
16. **Teste do PvE:** dar a lista de casos (cada jutsu, tier 1 e 4, nível de uso 1 e 4, 0 e 59 pontos, Ataque Básico
    com e sem arma).
17. **Cura e escudo na curva achatada:** dizer se vale para a cura em si mesmo e o escudo em si mesmo (sugestão: vale
    sempre que o mapa for de PvP).
18. **Estilo, o que confunde:** "kit" e "passo 2" com dois sentidos; "tabela" para a tabela de equilíbrio e as do
    banco; o aviso no chão ainda aparece na tabela da tela; a Decisão 5 diz menos que o objetivo 1; "perde f vezes
    menos" é ambíguo (dar exemplo); "Alternativas pesadas" é tradução errada (usar "Alternativas consideradas").

## Detalhes

Diagrama largo para o celular; células longas nas tabelas; datas em dois formatos; escala do Elo (400) e fuso do "por
dia" (São Paulo); teste de rede sem ferramenta dita; rota do painel para o interruptor; `findPlayer.ts` e
`ninjaStore.ts` não leem `player_jutsus.level` (corrigir a Análise 3); ninguém aplica sono em jogador hoje; entrada no
Vale precisa mandar o layout ao cliente; queda do servidor no meio da partida. Detalhes completos nos 3 relatórios em
`revisao_egm/fase5/`.
