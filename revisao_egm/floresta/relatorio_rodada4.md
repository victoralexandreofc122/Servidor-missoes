# Revisão EGM da Floresta por código, rodada 4 (3 revisores Goldfish em paralelo)

Relatórios completos em `rodada4/`: `rev_jogabilidade.md`, `rev_estilo.md`, `rev_celular.md`.

| Revisor (lente) | Rodada 3 | Rodada 4 |
| --- | --- | --- |
| Jogabilidade e colisão | 6 | 7 |
| Estilo e coerência | 5 | 6,5 |
| Leitura no celular | 6 | 6,5 |

Resolvido (os três concordam): mata da borda em árvores inteiras, pinheiro novo, barraca/caixote/barril colidem só na
base, placas só no poste, pedras angulosas, sumidouro com colisão oval, copa do Carvalho abre um círculo.

Observação: a imagem `3-lago` foi tirada antes do paredão único; a `4-paredao-abismo` é a atual.

## Próximos passos, por prioridade

| # | Achado | Revisores | O que fazer |
| --- | --- | --- | --- |
| 1 | O platô do paredão parece grama e é parede (33 x 7,5 casas) | os três | Platô vira chão andável; só a face de pedra colide. Teste: platô sólido não toca chão aberto |
| 2 | Piso da Pedra-Selo 1 creme, em cruz com degrau; colisão 0,8 casa maior que o monólito de cada lado | estilo, celular, jogabilidade | Lajes cinza-oliva quebradas com musgo, borda orgânica; monólito no cinza das pedras; colisão só na base |
| 3 | Pinheiro da beira do abismo colide 4,5 x 8 casas (regra antiga) | jogabilidade | Virar peça do catálogo (colide no tronco); teste para `crown` |
| 4 | Copas da mata da saliência cobrem o leito e a beira do salto; lodos somem embaixo | jogabilidade | Recuar as árvores 3 casas ou furo também para monstros/salto |
| 5 | Boneco aparece "em cima" do tronco do Carvalho | jogabilidade | Tronco por cima do boneco quando ele está atrás da base |
| 6 | Terra do acampamento é a área mais escura; bordas em degrau | celular, estilo | +15-20% no tom, puxando para a trilha; bordas orgânicas |
| 7 | Dois estilos de água; espiral parece portal; abismo sem beira em cima | estilo, celular | Um estilo de água só, sem espiral; beira de pedra também em cima |
| 8 | Fogueira chapada, sem colisão; furos da barraca redondos; moitas saturadas | estilo, jogabilidade | Fogueira com pedras e toras em volume; furos irregulares; moita na paleta oliva |
| 9 | HUD cobre a parte de baixo no celular | celular | Fora do piloto (interface): subir a câmera, juntar botões, chat minimizado |
