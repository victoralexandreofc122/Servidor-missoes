# Personagem-base (pixel art em peças)

Arte-base do ninja do Nin Online Mobile, separada peça por peça para animar no jogo.

- **Quadro:** 32 x 48 px. Todas as peças de uma direção usam o MESMO quadro, já no lugar certo:
  é só desenhar uma por cima da outra na ordem de `manifesto.json` → `camadas`.
- **Direções:** `baixo` (frente), `esquerda`, `direita`, `cima` (costas).
- **Lados:** `esq`/`dir` são do PERSONAGEM (de frente, o braço direito fica à esquerda da tela).
  Olhando para a esquerda, o lado direito fica longe (mais escuro); para a direita, o esquerdo.
- **Pastas:**
  - `pecas/<direcao>/<peca>.png`: uma peça, uma direção (transparente);
  - `folhas/<peca>.png`: as 4 direções lado a lado (128 x 48), na ordem baixo, esquerda, direita, cima;
  - `folhas/personagem_completo.png`: o personagem montado nas 4 direções;
  - `armas/`: kunai, espada e shuriken, cada uma no próprio quadro (empunhadura no manifesto).
- **Peças:** cabeça, cabelo, tronco, braço esq./dir., perna esq./dir., roupa de cima,
  munhequeira esq./dir., calça esq./dir., sapato esq./dir., bandana.
- **Pivôs** (`manifesto.json` → `pivos`): pescoço, ombros, quadris e mãos, para girar ou mover
  as peças na animação e para pôr a arma na mão.
- **Paleta** (`manifesto.json` → `paleta`): cada material tem 3 tons (luz, base, sombra).
  Para trocar a cor de uma roupa, troque esses 3 tons pelos da cor nova.
- **Regerar:** `python3 gerar.py` (precisa de Pillow). As peças são desenhadas como texto
  (uma letra por pixel) e o contorno e o sombreado são calculados no script.
