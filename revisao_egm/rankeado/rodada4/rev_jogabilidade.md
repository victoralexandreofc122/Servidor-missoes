# Revisão Goldfish, rodada 4: jogabilidade e atração do PvP (rankeado)

**Nota: 8,5/10** (era 8). O fim da partida ficou claro e o HUD da luta ficou limpo. Falta dar emoção ao momento da vitória e polir o que acontece entre as partidas.

## Resolvido
- Na luta, o menu de 10 botões some e o chat fica só com a linha da partida (img 5). Agora a arena fica livre.
- O fim por W.O. ficou coerente (img 6): o banner diz "Vitória por W.O.: o adversário saiu", o placar diz "Rival venceu" e o chat mostra +11 pontos. Pelo código, a partida sem dano é anulada (duel.ts, linha 15).
- Para quem está fora, o Desafio aparece apagado como "Entrar na fila" durante a luta dos outros (img 4).
- O Ranking mostra "2/10 partidas para entrar na premiação" e a barra "Faltam 27 pontos para Prata" (img 7). É uma boa meta curta.
- As telas de VITÓRIA e DERROTA (img 11, 12) mostram o placar (2 × 1), os pontos, os ryō e a faixa.

## Importante
1. **Na img 5, os dois lutadores aparecem um em cima do outro.** O nome "Rival" fica escondido atrás de "Kenji", e não dá para saber quem é quem nem quem bate em quem. *Fazer:* conferir se as 8 casas de distância valem no começo da rodada. Durante a luta, dar a cada lado um anel com a cor do seu lado do placar (azul e vermelho) e afastar os nomes quando os dois se sobrepõem.
2. **A vitória não tem clímax (img 11, 12).** Aparece um quadro estático, e o placar logo acima já diz "ARENA LIVRE · Aperte Desafio", o que tira o peso do momento. A troca de faixa (subir para Prata) passa despercebida, como uma etiqueta pequena. *Fazer:* manter o placar em "FIM" por alguns segundos. Quando o jogador sobe de faixa, mostrar o destaque "Subiu para PRATA!" com um som. Mostrar também a barra até a próxima faixa.
3. **O admin ainda vê o ruído de teste (img 8, 9, 10).** O aviso "Admin: Vale das Estátuas (x, y)" aparece em cima dos botões e no chat. *Fazer:* esconder esse aviso ou mostrá-lo só com o modo de depuração ligado.

## Detalhe
4. Quem assiste a arena vazia ainda não vê "Próximo: X x Y". O aviso sonoro "você é o próximo" também continua faltando.
5. O castigo por desconexão com tolerância para reconectar continua aberto.
6. Na fila (img 3), o menu completo continua na tela. Está aceitável, mas um "Assistir" junto de "Cancelar" ajudaria quem espera.
