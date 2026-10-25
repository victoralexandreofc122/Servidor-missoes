# Monstros (v19): sprites "tinta e brasa"

As folhas de modelo em `folhas/` foram geradas no Higgsfield (Nano Banana 2) a partir da variação escolhida (tinta
sumi-e com brasa). O script recorta os quadros, tira o fundo de pergaminho e monta um atlas por monstro:

    python3 arte/monstros/recortar.py

Sai em `public/assets/monsters/<tipo>.webp` e `public/monsterData.js` (gerado; não edite à mão).

| Monstro | Animações |
|---|---|
| Slime | parado, andando, ataque, golpe recebido, morte |
| Lodo Escuro | parado, ataque, golpe marcado (agacha e cai), golpe recebido, morte |
| Lodo Sombrio | parado, deslizando, ataque, golpe recebido, morte |
| Rei Lodo | parado, ataque, golpe marcado, chamar os filhos, fúria (e parado furioso), Esmagar, morte |

Para trocar uma animação: gere a folha de novo, salve em `folhas/<tipo>.jpg`, ajuste os retângulos em `MONSTERS`
(coordenadas da folha em pixels; `air` para quadro no ar, `ring` para apagar o círculo desenhado embaixo dele) e rode
o script. O teste `test/monstros.test.ts` confere os dados e o tamanho dos atlas.
