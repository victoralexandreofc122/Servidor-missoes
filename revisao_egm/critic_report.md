# Revisão EGM, fase 3 de 5: crítica (desenho, estrutura e estilo)

**Alvo:** `concepts_brief.md` (inteiro) · **Padrão:** especificação de funcionalidade (feature-spec)

## Situação dos revisores

| Revisor | Situação |
| --- | --- |
| `egm-design` (arquitetura do equilíbrio) | concluído |
| `egm-structural` (estrutura do documento) | concluído |
| `egm-style` (estilo do texto) | concluído |

Conferido no código pelo Elephant: o teto de controle (`applyStatus`, `gameWorld.ts` ~2001) só vale para `stunned` e
`rooted`, cada um com contador próprio.

## Achados por prioridade

### 1. O teto de controle está na camada errada · Bloqueador · `egm-design`
* **Onde:** Análise 2, Metas.
* **Problema:** o teto só cobre atordoar e prender, contados separados (um atordoamento seguido de uma prisão valem
  inteiros). Sono (4 s), silêncio e paralisia passam por `effects.ts` sem teto. Trocar o Mundo Falso por silêncio e
  lentidão leva o controle para fora do teto.
* **Recomendação:** um orçamento único de controle por jogador, cobrindo todo efeito que impede agir; o simulador mede
  "tempo sem poder agir" numa janela, não a duração de cada aplicação.

### 2. O simulador não testa o problema declarado · Bloqueador · `egm-design`
* **Onde:** Overview, Metas (simulador).
* **Problema:** o problema é "só uma distribuição de pontos funciona", mas o simulador varia classe, tier e nível de uso
  contra uma vida fixa, sem variar atributos nem arma. A curva de tier achatada não mexe no Ninjutsu (~2,4x): o teste
  pode passar com a build tudo-em-vida ainda dominante.
* **Recomendação:** 3 a 4 builds de referência (tudo em vida, meio a meio, tudo em ataque, armas) e o critério
  "nenhuma build vence todas", pelo tempo para matar entre elas.

### 3. Falta a seção de Riscos e Mitigações · Bloqueador · `egm-structural`
* **Onde:** documento inteiro.
* **Problema:** riscos espalhados e quase sem mitigação (Render dormindo, registro em memória, inflação do MMR, falta de
  gente). Nada sobre abuso: desafio em excesso, dupla combinando resultado, subir nível de uso em duelo combinado.
* **Recomendação:** tabela "Riscos e Mitigações" (risco, impacto, mitigação).

### 4. "Forma, não total" se contradiz e não dá para cumprir · Importante · `egm-design` (também na fase 2)
* **Problema:** "3 bolas de 40% = 120%" estoura o teto de +15%; o tier ainda dá +45% (1 / 1,15 / 1,3 / 1,45) e vem da
  Extração; um teto "por acerto" não segura uma forma com vários projéteis.
* **Recomendação:** um orçamento por lançamento (soma de todos os acertos e da queimadura de um jutsu), aplicado pelo
  servidor; decidir por escrito se o tier muda o total.

### 5. Dependência escondida na fórmula de dano e escopo da tabela · Importante · `egm-design` (também fase 2)
* **Problema:** o dano é calculado uma vez por lançamento no `gameWorld.ts` (~1600), antes de saber quem é atingido, já
  com passiva e clima. Um simulador que copie a fórmula testa a cópia. E não está escrito se a tabela vale só no
  duelo ou em todo o PvP (com a Zona de Conflito ainda matando de um golpe, ou jutsus em área precisando de dano por
  alvo).
* **Recomendação:** uma função pura "dano por acerto" usada pelo servidor e pelo simulador; escolher e escrever o
  escopo da tabela.

### 6. Alternativa mais simples não avaliada · Importante · `egm-design`
* **Problema:** faltou pesar (a) **atributos padrão no duelo** (todos com a mesma distribuição de referência; o eixo
  dos atributos sai da conta) e (b) **rede de segurança no servidor** (o dano recebido em 2 s limitado a 45% da vida
  durante a luta).
* **Recomendação:** avaliar e aceitar ou rejeitar as duas, com o motivo.

### 7. Falta a seção de Arquitetura Proposta · Importante · `egm-structural`
* **Problema:** peças espalhadas (`duel.ts`, `balance.ts`, perfil de regras, `game.duel_result`, tabelas); nenhum lugar
  mostra o caminho desafio → partida → rodada → banco.
* **Recomendação:** uma seção com os componentes e o fluxo.

### 8. Escopo indefinido em três pontos · Importante · `egm-structural`
* **MMR:** fora da lista de objetivos, mas definido na Decisão 2 e criado na migração. Dizer se o MMR de prévia entra.
* **Piloto de kits (2 classes):** está ao mesmo tempo fora do escopo e no passo 4.
* **Análise sem destino:** kit do adversário na tela, aviso no chão, retirada do Mundo Falso e da esquiva aleatória,
  valor da compensação de lag, rodada de 50 s, limite de duelos ao mesmo tempo, meta de 10 testadores. Cada um vira
  objetivo, fora do escopo ou risco aceito.

### 9. Ordem das fases e alternativas desatualizadas · Importante · `egm-structural`
* "Ordem das fases do brainstorm" (decidida) contra "Ordem proposta (revisada)": dizer qual vale.
* Alternativas ainda deixam o bônus do novato com duas opções; já foi decidido (registrar a rejeitada e o motivo).
* A Decisão 3 (PvP na frente de tudo) contradiz as "Próximas entregas" do `CLAUDE.md`, que precisa ser atualizado.

### 10. Títulos em inglês, termos sem explicação e palavras com dois sentidos · Importante · `egm-style`
* Títulos "Overview", "Analysis", "Goals vs. Non-Goals"... passar para o português.
* Explicar no primeiro uso: PvP, PvE, MMR, Elo, K, tier, build, slot, lag, instância, controle duro, migração aditiva,
  transação, coluna gerada.
* "Módulo" quer dizer arquivo de código e interruptor: chamar o segundo de "interruptor". "Preparação" (pausa) e
  "preparo" (golpe que carrega). "Nível" do ninja e "nível de uso" do jutsu.
* Números sem unidade: "175" (de vida), "410" (de dano), "40%" (do dano de uma bola), "3 por segundo" (de chakra),
  "1% de perda" (de pacotes), "22 x 16" (casas).
* Frases longas: o primeiro parágrafo da visão geral e o passo 2 da ordem (separar a migração num subitem).

### 11. Detalhes
* Chakra fixo deixa o atributo Chakra quase inútil no duelo; o simulador deve mostrar se o tier 4 (custo 2,2x) cabe
  numa rodada de 50 s (`egm-design`).
* O alerta de teto não faz sentido se o servidor impõe o teto; cada rodada gravada deve levar a versão da tabela
  (`egm-design`).
* "Rankeado" aparece numa alternativa, mas não existe nesta entrega: trocar por "duelo" (`egm-structural`).
* Marca: recomenda "Vale das Estátuas" mas ainda usa "o Vale" (`egm-structural`).
* Juízos de valor sem medida ("justo", "absurdo", "frágil", "baratas") e termos do processo ("revisão EGM",
  "Goldfish") sem explicação para o leitor (`egm-style`).
* SQL na lista de próximos passos: resumir em palavras ("pode rodar de novo sem erro") (`egm-style`).
