# Revisão Goldfish: leitura no celular deitado (rodada 4)

**Nota: 6,5/10.** (antes: 6). Obstáculos e monstros leem melhor, e a área ficou mais limpa. Mas aparecem duas leituras
falsas novas: o alto do paredão parece chão e não é, e o chão do acampamento ficou mais escuro que a grama. A HUD de baixo
continua igual.

Método: as 7 telas reduzidas para 1280x800 e uma cópia com brilho -25 e contraste -30, para simular o sol e o brilho baixo.

## Resolvido desde o relatório anterior

- **Obstáculo e enfeite agora se distinguem** (antigo 3). A pedra que colide é grande, angulosa, com contorno escuro e
  musgo (6-pedra1, 2-acampamento). As pedrinhas de enfeite ficaram miúdas.
- **Monstros mais legíveis** (antigo 1). O slime está mais claro e tem contorno (6-pedra1, 2-acampamento). Os roxos na
  estrada de pedra do paredão (4) se destacam bem.
- **A copa do Carvalho não vira mais névoa** (antigo 4). Em 5-carvalho, a copa mantém a forma e o boneco aparece
  inteiro na frente do tronco.
- **Mais referências de direção.** Há placas nas trilhas (1 e 4), a estrada de pedra do paredão é larga e clara, e o
  Carvalho e a Pedra-Selo servem de marco.
- **A densidade de enfeites caiu um pouco** (antigo 5), mas ainda não chegou à metade (veja abaixo).

## Achados

### Bloqueador

1. **O alto do paredão parece grama andável, mas é parede.** Onde: 3-lago e 3-lago-colisao (a faixa verde-escura entre o
   boneco e as pedras é toda vermelha no F2) e 4-paredao-abismo (o campo escuro acima do paredão). Problema: o jogador
   anda até lá e trava. É a "parede invisível" que o Victor proibiu. Correção: deixar claro que é o topo de um penhasco:
   uma borda clara de rocha na beira de cima, com contorno escuro; uma cor de topo diferente da grama andável (mais
   escura, ou com textura de pedra e musgo); e moitas ou árvores encostadas na beira. Outra saída é deixar o topo andável
   e mover a colisão para a beira.

### Importante

2. **O chão andável do acampamento é a área mais escura da tela.** Onde: 2-acampamento, ainda pior na simulação de sol.
   Problema: a terra cinza-marrom fica mais escura que a grama em volta, e as sombras de nuvem escurecem ainda mais o
   centro. No sol, o boneco fica num "buraco" escuro, e o slime em cima da terra quase some. Correção: clarear a terra do
   acampamento em uns 15 a 20%, puxando para um marrom quente (como a trilha de 1-entrada, que funciona). No celular,
   reduzir a força das sombras de nuvem pela metade.
3. **A HUD de baixo continua cobrindo a chegada pelo sul** (antigo 2, sem mudança). Onde: 6-pedra1 (os dois slimes estão
   colados na barra de jutsus) e 2-acampamento (a barraca e o barril de baixo ficam sob os botões). Correção: a mesma de
   antes. Subir a câmera uns 60 px, juntar os 8 botões num menu e deixar o chat minimizado por padrão no celular.
4. **O chão da Pedra-Selo está branco demais e em degraus.** Onde: 6-pedra1. Problema: é o objeto mais claro de todo o
   mapa. No celular, ele puxa o olho mais que os monstros e ofusca a tela. A borda em escada contra a grama é a mais dura
   do mapa. Correção: escurecer as lajes para o cinza da estrada do paredão (4), com tons quentes e musgo nas juntas, e
   arredondar ou quebrar a borda com lajes soltas e grama invadindo.
5. **Moitas de enfeite parecem obstáculo.** Onde: 1-entrada e 3-lago (moitas redondas com contorno e frutinhas, e o F2
   mostra que não colidem). Problema: elas têm o mesmo peso visual da pedra que colide, e o jogador desvia sem
   precisar. Isso também mantém o ruído de pontinhos azuis e vermelhos. Correção: tirar o contorno escuro das moitas que
   não colidem, deixar a cor delas mais perto da grama e cortar mais uns 40% das moitas com frutinhas e das flores.
6. **O abismo lê como mancha de terra.** Onde: 4-paredao-abismo. Problema: é um retângulo marrom-escuro, com beira de
   pedra só do lado esquerdo e sem profundidade. No sol, parece sombra. Correção (o item já estava listado como pendente):
   uma beira de pedra clara nos 4 lados, a parede interna em degradê até o preto e talvez neblina no fundo.

### Detalhe

7. **O lago lê como portal.** Onde: 3-lago (a espiral branca sobre o azul-petróleo) e 1-entrada (o lago da direita ainda
   está em azul saturado e sem margem). Correção: trocar a espiral por reflexos curtos na horizontal e dar a mesma margem
   de pedra ao lago de 1-entrada.
8. **O aviso "Admin: Floresta (x, y)" fica preso no alto da tela** (antigo 8). Ele aparece em 1, 3, 4, 5 e 6. Correção:
   fazer o aviso sumir sozinho em 2 s. O painel de missões continua cobrindo árvores à direita: ele precisa poder ser
   recolhido.
9. **A plaquinha do nome tampa o monstro colado no boneco.** Onde: 6-pedra1 (o slime atrás do "Victor"). Correção:
   desenhar a barra de vida do monstro acima da plaquinha do nome, ou deixar a plaquinha meio transparente em combate.
