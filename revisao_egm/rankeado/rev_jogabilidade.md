# Revisão Goldfish: jogabilidade e atração do PvP (rankeado)

**Nota: 6/10.** A base está certa (fila justa, melhor de 3, plateia, Elo, temporada), mas o ciclo ainda não prende e há brechas de abuso.

## O que está bom
- Fila honesta: quem chegou primeiro luta primeiro, nível parecido, e o limite de "pulos" (`takeMatch`) impede que alguém espere para sempre.
- "Na fila: 1º de 1 · Cancelar" no lugar do botão é claro (img 3).
- Placar no topo vira cartão dos lutadores (nome, nível, vila, bolinhas de rodada) e quem está fora assiste (img 4): bom para criar plateia.
- Ninguém morre e as rodadas são curtas (50 s): baixo custo de tentar.
- Ranking mostra a sua posição, o recorde e as recompensas da temporada (img 7).

## Bloqueador
1. **Sair dá vitória cheia e não custa nada a mais.** Img 6: "O adversário saiu" deu +10. Com duas contas dá para farmar pontos (Rival 3/0 contra Kenji 0/3 na img 7, sempre a mesma dupla). *Fazer:* quem sai/desiste perde o Elo normal mais um castigo (ex.: 5 min sem fila, cresce se repetir); saída na **preparação** cancela sem pontos para ninguém; rodada sem dano nenhum vale 0 para os dois.
2. **Mesma dupla repetida sem limite.** Não há regra contra adversário repetido. *Fazer:* não juntar a mesma dupla 2 vezes seguidas quando houver outro na janela, e reduzir o ganho (ex.: metade, depois 0) após 3 lutas contra o mesmo no dia; avaliar também mesmo IP.

## Importante
3. **HUD cobre a arena.** Img 5: o painel de Missões fica em cima do Kenji, e o chat e os botões tapam a parte de baixo. *Fazer:* dentro da arena (lutador e plateia), esconder o painel de missões e recolher chat/menu.
4. **Início perto demais e desalinhado.** Img 5: os dois começam a poucos passos, um no centro e outro à direita. *Fazer:* posições espelhadas nas pontas da arena, virados um para o outro, câmera centrada no meio dos dois (ou zoom que mostre ambos).
5. **Assistir é fraco.** Fora da arena só se vê o placar; a câmera da plateia não segue a luta (img 4 mostra a arquibancada, não os lutadores). *Fazer:* botão "Assistir" que leva a câmera à arena, barra de vida dos dois no placar, e o tempo estimado de espera ("próximo: você, ~1 min").
6. **Pouca recompensa no curto prazo.** Só Elo; prêmio só no fim de 60 dias e só com 10 partidas. *Fazer:* recompensa por partida (ryō/XP pequenos, mais na vitória), missão diária "jogue 3 rankeadas", barra de progresso até a próxima faixa na tela de resultado e aviso ao subir de faixa.
7. **Tela de resultado sem "jogar de novo".** Img 6: não há botão para voltar à fila; o Desafio some até sair da arena. *Fazer:* botões "Jogar de novo" e "Ranking" na tela de VITÓRIA/DERROTA, com resumo (rodadas, dano).

## Detalhe
8. Antes da luta o placar mostra "? ○○ ARENA LIVRE ?" (img 1/2): confunde. Mostrar "Arena livre · 0 na fila".
9. "Desafio" meio transparente parece desativado (img 2). Deixar opaco quando dá para entrar.
10. Vitória por saída deveria dizer "Vitória por W.O." e talvez dar menos pontos, para não parecer conquista.
11. Avisar no chat/HUD quando faltar pouco para entrar ("você é o próximo") com um som, já que o jogador fica olhando outra coisa.
