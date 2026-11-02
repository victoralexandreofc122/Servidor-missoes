# Revisão EGM, fase 5, 2ª rodada (última): pronto para construir?

**Alvo:** `concepts_brief.md`, linhas 234 a 567, depois das correções da 1ª rodada. Relatórios completos em
`revisao_egm/fase5_rodada2/`.

## O que fechou

| Revisor | Achados da 1ª rodada | Fecharam | Abertos |
| --- | --- | --- | --- |
| Plano (`egm-implementation-readiness`) | 18 | 13 | 5, em parte |
| Código (`egm-codebase-details`) | 15 | 11 | 4 |
| Estilo (`egm-style`) | 12 | 9 | 3 |

**Veredito:** o passo 1 quase dá para codar sem decidir nada. O passo 2b ainda pede algumas definições. Os 6
bloqueadores da 1ª rodada fecharam, menos uma parte do custo e da recarga (abaixo).

## Bloqueadores novos (2, do revisor de código)

1. **Onde entra a redução de dano.** O plano não diz em que ponto do cálculo o fator de 40% e 50% entra. Se entrar
   nos números do jutsu (`skillConfig`), a queimadura fica inteira (75 em vez de 30 no nível 60). O 12 da Kunai só
   sai com o fator de 50% aplicado também na arma dentro do jutsu.
   * **Recomendação:** escrever a fórmula: o fator multiplica o dano base e a queimadura do jutsu; a arma dentro do
     jutsu de Armas usa o fator do Ataque Básico (50%).
2. **Não existe parede do tipo "estátua".** O mapa do Vale cita estátuas, mas o código só tem os tipos que já existem.
   * **Recomendação:** usar só pedra e pilar (`rock`, `pillar`) agora; a estátua vira arte depois.

## Abertos da 1ª rodada

* **Custo e recarga nos mapas de PvP:** a arena não é um mapa, é uma área dentro do mapa da vila; o PvP aberto
  (`combat.pvp`) ficou fora da regra; nenhuma mensagem leva ao cliente o custo e a recarga de verdade.
* **Orçamento de controle:** o choque da paralisia (`shock()`) não recebe quem causou; a Ilusão que atordoa e depois
  silencia conta como uma aplicação ou duas?
* **Perfil do duelo:** a velocidade da Névoa não passa por `passive()`; "uso de item" não existe no jogo; falta
  escolher o tipo do mapa do Vale (decide se o clima vale).
* **Escudo da Pedra:** a curva de tier não serve para ele (o escudo usa outra tabela); faltam os números no PvP.
* **Tela:** falta o lugar de cada peça no celular deitado.
* **Estilo:** "passo 2" ainda tem dois sentidos (linha 148); "fator do novato" aparece antes de ser explicado; dois
  "plano B" sem ordem.

## Importantes novos

* **Testes que quebram:** o passo 1b muda cerca de 45 verificações em 11 arquivos de teste e o tutorial da Academia
  (o boneco de 24 de vida passa de 2 para 4 golpes; `test/v7.test.ts:148` falha). O plano não lista isso.
* **Simulador:** a tabela do plano saiu de uma conta só do lado de quem ataca, com empates exatos (Taijutsu contra
  Armas, 8,0 s contra 8,0 s). Os critérios de 50% em 2 s e de 2,5 s sem agir passam sempre quando a rede e o
  orçamento estão ligados; o simulador deve medir antes deles.
* **Fórmula do `pvpHitDamage`:** não está escrita.
* **Cliente:** o `isFoe` não reconhece o adversário do duelo; o "perfil de outro jogador", onde fica o botão
  "Desafiar", não existe.
* **Ligação `duel.ts` e `gameWorld`:** falta o formato, o relógio do duelo e o arquivo que grava no banco.
* **Cura atravessa o muro:** a Cura tier 4 tem raio 4,5 e passa o muro de 4 casas, curando quem está no outro duelo.
* **Banco:** faltam chaves, `NOT NULL`, referências e o formato do `jsonb`; a rodada repetida no empate colide com a
  chave da rodada; o banco não guarda o nível dos jogadores (o MMR precisa).
* **Poderes da Akatsuki:** não diz se o dano menor vale para eles.
* **Passo 2b:** falta o que se guarda na desconexão, o que se pode fazer na preparação, os casos de teste e a divisão
  em partes.
* **Estilo:** "reduções de 60%" aparecem como rejeitadas, mas o valor escolhido (40%) é uma redução de 60%; "fator"
  nomeia três coisas; "queda" serve para o jogador e para o servidor; as regras não dizem o limite de 50 s da rodada.

## Detalhes

Cerca de 40, nos três relatórios de `revisao_egm/fase5_rodada2/`.
