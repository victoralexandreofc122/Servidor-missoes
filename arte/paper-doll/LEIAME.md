# Paper doll do personagem

Este paper doll substitui as pastas `personagem-base/` (arte temporária) e `rig-ia/`, cuja animação ficou ruim.

O personagem é feito de camadas. Cada peça (corpo, calça, cabelo, espada…) é uma folha PNG com **o mesmo layout**. O jogo desenha as folhas uma por cima da outra, sempre no mesmo quadro.

## Layout de cada folha

- **Quadro:** 64×64 px. O pé fica na linha y = 57, centralizado em x = 32.
- **Linhas:** `baixo`, `esquerda`, `direita`, `cima`.
- **Colunas** (17 no total):

  | Animação | Colunas | Quadros | ms por quadro |
  |---|---|---|---|
  | parado | 0 | 1 | 400 |
  | andar | 1–4 | 4 | 150 |
  | correr (corrida ninja, braços para trás) | 5–8 | 4 | 90 |
  | soco | 9–12 | 4 | 100 |
  | espada | 13–16 | 4 | 100 |

- **Ordem de desenho:** está em `saida/manifesto.json` (`ordem_camadas`). A folha `efeito` (impacto do soco e arco do corte) vai por último.

## Peças

As peças ficam em `saida/masculino/` e `saida/feminino/`:

- `base` (corpo)
- `cabelo_espetado`, `cabelo_rabo`
- `roupa_gi` (sem manga), `roupa_camiseta`
- `calca_ninja`
- `sapato_ninja`
- `munhequeira`
- `bandana`: na frente aparece só a faixa. O nó e as pontas ficam atrás e balançam conforme a animação.
- `cachecol`
- `espada`: bainha nas costas, e a lâmina na mão durante o golpe.

## Cores

As cores de cada material estão em `manifesto.json` (`paletas`), com 4 tons: base, sombra, luz e contorno. Para trocar a cor de uma peça, basta substituir esses 4 tons, sem redesenhar nada. Membros do lado de trás usam esses mesmos tons multiplicados por 0,8. A página de demonstração (`demo_template.html`) faz assim com a pele, a cor do cabelo e a cor do gi.

## Como gerar

```
python3 pd.py saida        # gera todas as folhas e o manifesto
python3 montar_demo.py     # gera provador-ninja.html com as folhas embutidas
```

### Como o gerador funciona

O corpo é um esqueleto 3D simples: quadril, joelho, tornozelo, ombro, cotovelo e punho.

- **Poses:** cada pose é escrita uma vez, em ângulos (função `poses`). As 4 direções saem da mesma pose girada.
- **Desenho:** braços e pernas são rasterizados direto em pixel, com contorno de 1 px e luz vindo de cima à esquerda. Nada é imagem girada.
- **Cabeça e cabelo:** são carimbos fixos por vista, então não deformam.
- **Fitas, rabo de cavalo e cachecol:** seguem o "vento" de cada animação.

### Peça nova

Uma peça nova é uma função que diz qual parte do corpo ela cobre e quanto infla (veja `calca`, `munhequeira`). O gerador cria a folha alinhada automaticamente para os dois corpos.
