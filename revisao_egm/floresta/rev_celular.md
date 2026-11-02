# Revisão Goldfish: leitura no celular deitado

1. **Importante. Monstros somem no verde.** Onde: g3_2 (slimes embaixo, perto da barra de jutsus) e g3_3 (slimes à esquerda e no canto de cima). Problema: o slime verde-claro fica em cima da grama verde-oliva. Só a barrinha vermelha de vida denuncia o monstro. No celular ele tem uns 20 px. Correção: contorno escuro mais grosso e uma sombra no chão, ou uma cor que contraste (o lodo ciano/amarelado). Mostrar sempre um anel ou marcador no pé do monstro que está como alvo.

2. **Importante. A HUD de baixo cobre a área onde os monstros chegam.** Onde: celular_0/1 e g3_2. A barra de jutsus, os 8 botões da direita e o chat ocupam cerca de 25% da altura da tela. Problema: em g3_2 os slimes estão debaixo dos botões. O jogador não vê ameaça que vem do sul. Correção: subir a câmera para o boneco ficar uns 60 px acima do centro. Juntar os 8 botões num menu que abre com um toque. Deixar o chat minimizado por padrão no celular.

3. **Importante. Os obstáculos pequenos não se destacam do chão.** Onde: celular_0 (pedrinhas cinza e moitas na grama) e g3_2 (pedras miúdas espalhadas). Problema: pedra que bloqueia e pedrinha de enfeite têm o mesmo tamanho e o mesmo cinza. O jogador não sabe onde vai travar. Correção: pedra que colide fica maior, com contorno escuro e sombra. Enfeite fica pequeno, sem contorno e com pouco contraste (mais perto da cor da grama).

4. **Importante. A copa transparente do Carvalho vira uma mancha.** Onde: g3_2, no centro. Problema: a copa com o boneco embaixo fica translúcida e sem forma. Parece névoa, não árvore, e esconde a separação do tronco. Correção: deixar mais forte só o contorno da copa (opacidade de 70% na borda) e esvaziar o miolo. Ou só abrir um círculo em volta do boneco.

5. **Importante. Enfeites demais poluem a leitura.** Onde: g3_2 e g3_3 (flores rosa, roxas e amarelas, moitas com frutinhas e tufos de grama em toda parte). Problema: na tela pequena viram ruído de pontinhos coloridos. Competem com os monstros e com os itens no chão. Correção: cortar a densidade pela metade. Juntar os enfeites em grupos com áreas vazias entre eles. Usar no máximo duas cores de flor por região.

6. **Importante. Escuro demais no celular.** Onde: celular_1 (acampamento) e todo o g3. Problema: o chão do acampamento, a terra e a grama ficam muito perto em brilho. Com o celular no sol e o brilho baixo, tudo vira uma massa escura. Correção: subir uns 10 a 15% o brilho só do chão andável. Manter as árvores e a borda mais escuras, para o caminho "acender".

7. **Detalhe. O caminho é claro só na trilha.** Onde: celular_0 (trilha marrom, muito boa) e g3_2 (sem trilha). Problema: fora da trilha um jogador novo não sabe para onde ir. A borda de mata fechada (g3_3, à esquerda) parece parede, mas não está claro se é limite. Correção: trilhas mais fracas ligando os pontos de interesse. A borda do mapa com tom mais escuro e contínuo.

8. **Detalhe. Textos e itens perdidos.** Onde: celular_0 (aviso "Admin: Floresta" sobre a trilha) e o painel de missões cobrindo uma árvore à direita. Problema: o painel de missões e o aviso tampam parte do mapa. Correção: deixar o painel de missões recolhível e o aviso sumir sozinho em 2 s.

**Nota: 6/10.** O boneco lê bem (contorno e nome). A trilha funciona. O que falta é deixar monstros e obstáculos tão legíveis quanto o boneco, e liberar a parte de baixo da tela.
