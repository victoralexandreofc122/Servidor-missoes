# Contexto para os revisores: modo rankeado (Vale das Estátuas)

Jogo: "Vontade do Fogo", MMORPG ninja 2D em pixel art chibi, para o navegador do celular (deitado) e do computador.
Tudo é desenhado por código (Canvas 2D), sem imagens pintadas. Paleta do jogo: oliva escuro, contorno escuro e
sombreado em 2 a 3 tons. O boneco chibi NÃO é arte final: use-o só como escala.

O que é o modo rankeado (pedido do dono, Victor):
- No menu, o botão "Rankeado" leva ao Vale das Estátuas, um mapa onde se encontram os ninjas de todas as vilas.
- Embaixo, no meio, o botão "Desafio" (um pouco transparente) põe o ninja na fila. Enquanto espera, ele assiste à
  luta da arena. O adversário só aparece quando a preparação começa.
- A fila prioriza quem entrou primeiro e tenta juntar níveis parecidos sem deixar ninguém ser passado várias vezes.
- Luta 1x1, melhor de 3: 10 s de preparação, rodadas de até 50 s, ninguém morre. Fim: tela de VITÓRIA/DERROTA com
  os pontos (Elo) e o selo de faixa (Bronze, Prata, Ouro, Diamante, Lenda). Botão "Ranking" mostra o top 50.
- O mapa: praça de pedra, a arena cercada no meio (fechada: só os dois da partida ficam dentro), arquibancada em cima e
  embaixo (dá para andar nela), estátuas das 4 vilas nos cantos (Folha verde, Névoa azul, Nuvem dourada, Areia laranja).

Imagens (dia, 2560x1600 e 1280x720):
1-vale-inteiro, 2-praca-celular, 3-na-fila, 4-plateia-assistindo (quem está fora vê a luta), 5-rodada-lutador,
6-vitoria, 7-ranking.

Código: src/realtime/duel.ts (fila e partida), src/realtime/maps.ts (função vale), public/mapArt.js (drawStatue,
drawStands), public/game.js e public/hud.css (placar, botões, tela de vitória, painel do Ranking).
