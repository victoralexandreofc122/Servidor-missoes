# Camadas do PixelFX (v78)

As folhas desenhadas pelo Victor são a animação de cada jutsu. Por cima (ou por baixo) delas entram **camadas** do
[PixelFX](https://github.com/patch-gg/pixelfx) (licença MIT, créditos em `NOTICE.md` e `LICENSE-pixelfx`), recoloridas
com as cores das folhas: a carga na mão durante os selos, o anel de fogo correndo no chão, a poeira do impacto, as
brasas, as cruzes de cura, as faíscas, o choque no alvo. **A arte do Victor é a base; a camada só complementa.**

## Os arquivos

- `camadas.mjs`: a lista das camadas (efeito, paleta, fps, corte, foco, achatamento). Gera
  `public/assets/vfx/pfx_*.png` (cada folha: a grade da COR em cima e a da LUZ embaixo) e `public/vfxCamadas.js`.
  Não edite os gerados à mão.
- `compactar.py`: reduz as folhas a 128 cores (de ~3 MB para ~0,7 MB; chamado pelo `camadas.mjs`).
- `efeitos/`: camadas nossas, no formato do PixelFX: `brasas.js`, `faiscas.js`, `cruzes.js` (laços). Viram
  `heranca/<nome>` dentro do PixelFX na hora de gerar.
- `public/camadasJutsus.js`: a coreografia de cada um dos 50 jutsus desenhados (quando e onde cada camada toca),
  chamada pelo `game.js` nos mesmos pontos do `fogoAnim.js` (selos, lançamento, impacto, chão, a Marca).
- `public/vfxJutsus.js`: `jfx.layer(nome, x, y, início, opções)` toca uma camada no tempo dela (o laço repete).

## Gerar de novo

```bash
git clone --depth 1 https://github.com/patch-gg/pixelfx /tmp/pixelfx
node /tmp/pixelfx/tools/render.mjs heranca/brasas --zoom 4   # (depois do 1º camadas.mjs) para ver uma camada nossa
node arte/pixelfx/camadas.mjs /tmp/pixelfx
```

## Lições

- A luz do PixelFX "assada" na cor escurece o chão claro do jogo: por isso a folha guarda a cor e a luz separadas, e a
  luz é somada (`lighter`).
- O `holy/heal` pinta o boneco de teste do PixelFX: a camada usa só a silhueta dele (`semBoneco`).
- Os anéis de chão do PixelFX são vistos de lado; o jogo é visto mais de cima: `sy` estica na vertical.
- Raio da camada × área do servidor: o anel de fogo corre 3,2 casas, o de cura, o estalo e a poeira 3,64 (tabela `R`
  em `camadasJutsus.js`); a escala é `raio do jutsu / raio da camada`.
- Jutsu novo desenhado: escolha as camadas na tabela de `camadasJutsus.js` (um `case` por jutsu; o teste cobra) e, se
  faltar uma, acrescente em `CAMADAS` (efeito do catálogo do PixelFX recolorido, ou um nosso em `efeitos/`).
