# Revisão EGM, fase 1 de 5: visão geral inicial (Zoom Out)

**Alvo:** `concepts_brief.md` (arquivo inteiro) · **Revisor:** `egm-zoom-out` (contexto limpo) · **Status:** concluído

O problema está bem posto (o dano multiplica fatores e a vida só soma) e as citações do código conferem. Os problemas
estão no tamanho do escopo, em contradições internas e num erro no plano da migração (conferido: `db/schema_v11_endgame.sql`
linha 28).

## Bloqueadores

### 1. O módulo `duelo` não cabe na tabela de módulos
* **Seção:** Decisões, item 4 / Ordem, passo 2.
* **Problema:** `INSERT ... ON CONFLICT DO NOTHING` falha, porque `game.endgame_modules` tem
  `CHECK (code IN ('vilas','pvp','renegados','akatsuki'))`. As funções `endgame_active` e `admin_endgame_mode` e o tipo
  `EndgameModule` também não conhecem `duelo`, e essa tabela é para módulos que ligam pela população e não desligam.
* **Recomendação:** escolher entre (a) um interruptor simples em `config.ts`/admin, sem banco, ou (b) uma migração que
  troca o CHECK e atualiza as funções e o tipo. Escrever a escolha.

### 2. A regra dos níveis de uso é o maior trabalho e contradiz o documento
* **Seção:** Análise 3, Metas, Decisão 1.
* **Problema:**
  - Trocar 4 níveis por 3, mudar os limites e contar só usos que acertam vale para o jogo todo: contradiz "sem mudar o
    PvE".
  - Muda o progresso de quem já joga (quem tem 2.000 usos muda de nível); `admin_give_jutsu` aceita 1 a 4; a coluna
    `player_jutsus.level` fica com outro valor e ainda é lida (`ninjaStore.ts`, `findPlayer.ts`).
  - "Muda a forma" exige desenhar variantes por jutsu e por nível (e arte no cliente), fora do escopo e do tamanho.
  - "Não muda o total" e "+15%" se contradizem.
* **Recomendação:** separar. Fase 1: no duelo o nível de uso só soma até +15%, sem forma nova. A forma nova vira uma
  entrega própria depois, com a lista de jutsus. Declarar o efeito no PvE e no progresso de quem já joga.

## Importantes

### 3. O simulador não testa o objetivo principal
* **Seção:** Metas. Varia classe, tier e nível, não a distribuição de pontos; "vida de referência" sem valor; o Ninjutsu
  (até ~2,4x) fica fora da tabela.
* **Recomendação:** simular 3 ou 4 distribuições (tudo em vida, meio a meio, tudo em Ninjutsu) e exigir que nenhuma
  mate a outra antes de 6 s.

### 4. O MMR aparece e some
* **Seção:** Análise 4 e 6, Metas, Decisão 2, passo 2. Não está nas Metas, mas a migração cria MMR por formato.
* **Recomendação:** gravar só partidas e rodadas; o MMR pode ser calculado depois a partir do histórico.

### 5. Riscos que faltam
* Desconexão, abandono, publicação no meio da luta, Render dormindo; quem mais entra no mapa de duelo; como 1 ou 2
  duelos ao mesmo tempo funcionam sem cópia de mapa; convivência com aliança, trégua e Akatsuki.
* **Recomendação:** uma seção curta de regras (abandono = derrota, partida interrompida anulada, mapa fechado a
  terceiros, duas áreas fixas lado a lado).

### 6. Falta critério de "pronto" e data para rever a prioridade
* O PvP passou na frente de tudo, sem dizer quando a entrega acaba nem quando a ordem é revista; a meta de 10
  testadores está fora das Metas.
* **Recomendação:** "pronto" medível (simulador passando, X duelos reais registrados, uma noite de duelo feita) e uma
  data para rever a ordem.

## Detalhes

7. Em "Alternativas", o bônus do novato ainda aparece com duas opções; já foi decidido.
8. `balance.ts` cria um lugar novo para números, mas os números de combate já ficam em `config.ts` (`combat.controlDr`):
   seguir o padrão ou justificar.
9. "Alerta quando o teto for ultrapassado": dizer para onde vai (Painel do Admin, log).
10. Análise 3 diz que tier e nível mudam a forma; o resto fala só do nível. Esclarecer.
