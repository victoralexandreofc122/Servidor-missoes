# Revisão Goldfish, rodada 3: jogabilidade e atração do PvP (rankeado)

**Nota: 8/10** (era 7,5). A leitura da fila e do fim melhorou. O que ainda segura a nota é o que acontece dentro da luta: os lutadores começam longe e o HUD pesa.

## Resolvido
- "PARTIDA ANULADA" em cinza, com o motivo ("Ninguém causou dano: não conta pontos") e "Jogar de novo" (img 6).
- O placar mostra "1 esperando adversário · Aguardando" e "Fila: 1º · Cancelar" (img 3); acabou a contradição de "Arena livre" com gente na fila.
- Botões mais curtos (só 🏆); "Assistir", "Sentar" e "Parar" aparecem quando fazem sentido (img 8, 9, 10).
- O Ranking diz "Você ainda não lutou nesta temporada. Aperte Desafio!" (img 7).

## Importante
1. **O fim da partida se contradiz (img 6).** O banner diz PARTIDA ANULADA, mas o placar logo acima diz "FIM · Rival venceu" e o chat diz "Rival venceu (o outro saiu)". *Fazer:* quando a partida é anulada, o placar e o chat também dizem "Anulada" e ninguém aparece como vencedor.
2. **Os lutadores ainda começam um em cada ponta (img 5 e 9).** Na rodada 1 eles estão a uns 8 a 10 tiles: nas bordas da tela do celular, quase atrás do minimapa e do menu. Gastam 5 a 10 s andando antes de lutar. *Fazer:* começar a uns 4 a 5 tiles, espelhados no centro, com a câmera no meio dos dois.
3. **O HUD continua cobrindo a arena na luta (img 5).** São 10 botões de menu, chat e slots vazios, e o rival da direita fica entre o minimapa e o menu. *Fazer:* durante a rodada, recolher o menu num botão só e minimizar o chat (repete o item 4 da rodada 2).

## Detalhe
4. O Ranking sem partidas não mostra o "0/10 partidas para entrar na premiação" (img 7). Mostrar o contador desde a primeira vez que o painel abre.
5. O aviso do admin "Vale das Estátuas (x, y)" aparece em cima dos botões e no chat (img 8, 10). É ruído de teste: esconder para o jogador comum.
6. Quem assiste sentado com a arena vazia ainda não vê "próximo: X x Y" (item 5 da rodada 2).
7. Continuam abertos: o aviso sonoro "você é o próximo" e o castigo por desconexão com tolerância para reconectar.
