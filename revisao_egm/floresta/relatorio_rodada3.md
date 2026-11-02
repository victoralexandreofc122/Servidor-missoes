# Revisão EGM da Floresta por código, rodada 3 (3 revisores Goldfish em paralelo)

Contexto dado aos revisores: `CONTEXTO.md`. Relatórios completos: `rev_jogabilidade.md`, `rev_estilo.md`,
`rev_celular.md`.

| Revisor (lente) | Bloqueadores | Importantes | Detalhes | Nota |
| --- | --- | --- | --- | --- |
| Jogabilidade e colisão | 1 | 5 | 2 | 6/10 |
| Estilo e coerência | 1 | 5 | 2 | 5/10 |
| Leitura no celular | 0 | 6 | 2 | 6/10 |

O que os três dizem que está bom: árvores colidem só no tronco, com espaço largo entre elas; a trilha de terra se lê
bem; o boneco se destaca (contorno e nome).

## Achados juntos, por prioridade

| # | Achado | Revisores | Situação |
| --- | --- | --- | --- |
| 1 | Paredes invisíveis no chão: eram as 2 placas que só existiam na pintura (uma em cima da trilha) | jogabilidade | **Corrigido**: placa desenhada, colide só no poste, fora da trilha; teste novo |
| 2 | A mata das bordas do mapa ainda é um bloco reto de copas, como a "mata fechada" reprovada | estilo, celular | A fazer: árvores inteiras (tronco e copa), em fila torta e mais escuras |
| 3 | Barraca, caixote, barril e pilar colidem no desenho inteiro, não no pé | jogabilidade, estilo | A fazer: colisão só na base; formas menos geométricas (lona com dobras, madeira com veios) |
| 4 | Pinheiro é triângulo chapado sem contorno | estilo | A fazer: contorno escuro e galhos com 3 tons e bordas recortadas |
| 5 | Monstros verdes somem na grama oliva | celular | A fazer: contorno escuro e sombra no pé dos monstros |
| 6 | Paredão em 2 faixas iguais; a faixa do meio parece chão e é parede; abismo sem leitura de perigo | jogabilidade | A fazer: um paredão só, com topo; beira de pedra e escuridão com degradê no abismo |
| 7 | Lago com colisão quadrada e cantos de grama que viram parede; azul saturado | jogabilidade, estilo | A fazer: margem de pedras e lodo; colisão acompanhando a margem |
| 8 | Terra do acampamento e da trilha termina em degrau | estilo | Parcial (bordas já mais orgânicas); falta suavizar os cantos |
| 9 | Enfeites demais (flores, moitas) poluem a tela; pedrinha de enfeite parece obstáculo | celular, estilo | A fazer: metade dos enfeites, em grupos; enfeite pequeno e sem contorno |
| 10 | Escuro demais no celular: chão, terra e grama com o mesmo brilho | celular | A fazer: +10 a 15% de brilho só no chão andável |
| 11 | Pedra cinza-azulada fria destoa da paleta quente | estilo | A fazer: cinza mais quente |
| 12 | Copa transparente do Carvalho vira mancha | celular | A fazer: abrir só um círculo em volta do boneco |
| 13 | A HUD de baixo cobre a área de onde chegam os monstros | celular | Fora deste piloto (interface); anotado |
