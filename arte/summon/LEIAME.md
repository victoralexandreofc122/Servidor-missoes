# Summon (efeito de invocação)

Efeito de luz da invocação/materialização: estrela de 4 pontas, estouro, chuva de raios,
cilindro de energia e círculo de luz no chão. Feito para o jogo web (canvas 2D, `public/game.js`).

- **Quadro:** 256 x 256 px. **30 fps**, **170 quadros**, **5,67 s**.
- **Grade:** 12 colunas x 15 linhas (3072 x 3840), em ordem de leitura: `coluna = frame % 12`,
  `linha = floor(frame / 12)`. As 10 células finais da última linha ficam vazias.
- **Tempo → quadro:** `frame = round(t × 30)` (t em segundos desde o início do efeito).
- **Âncora:** centro horizontal e base do cilindro (centro do círculo no chão) em **73,5% da altura**,
  ou seja, o pixel **(128, 188,16)** do quadro. Ponha esse ponto onde a invocação acontece no chão.
- **Arquivos:**
  - `summon_lighter.png`: fundo preto puro. Desenhe com `globalCompositeOperation = 'lighter'`
    (o preto não soma nada, e a luz clareia o cenário por baixo).
  - `summon_alfa.png`: fundo transparente. Alfa = brilho do pixel e a cor é desmultiplicada,
    então não há halo escuro nas bordas. Desenhe com o modo normal (`'source-over'`).
  - `summon.json`: os mesmos números acima, para o código ler.
- **Borda suave:** a luz vai a zero nos últimos 20 px de cada lado do quadro, porque o flash e o
  cilindro subindo passam do limite e ficariam com um corte reto.

## Como desenhar no canvas

```js
// sheet = Image de summon_lighter.png; inicio = instante (s) em que a invocação começou
function desenharSummon(ctx, sheet, agora, inicio, xChao, yChao, escala = 1) {
  const frame = Math.round((agora - inicio) * 30);
  if (frame < 0 || frame >= 170) return false;            // terminou
  const sx = (frame % 12) * 256, sy = Math.floor(frame / 12) * 256;
  const lado = 256 * escala;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';               // 'source-over' com summon_alfa.png
  ctx.drawImage(sheet, sx, sy, 256, 256,
                xChao - 0.5 * lado, yChao - 0.735 * lado, lado, lado);
  ctx.restore();
  return true;
}
```

Os PNGs estão aqui em `arte/`. Para o jogo carregá-los, copie o escolhido para `public/`
(só essa pasta é servida).

## Regerar

`node arte/summon/exportar.mjs` (precisa de `playwright` com Chromium). O script abre
`summon.html` sem interface e, para cada quadro, chama `renderFrame(round(frame / 30 × 60))`, que é
determinístico (sem timers nem números aleatórios). Cada quadro é desenhado em 1080 x 1080 e reduzido
para 256 x 256, então a âncora é a mesma do `summon.html`.

`summon.html` também abre direto no navegador, com play, troca de frame e formato vertical.

## Vídeos

Em `videos/` (MP4 H.264, sem transparência, só para ver ou divulgar):

- `summon_square.mp4`: 1080 x 1080, 60 fps;
- `summon_vertical.mp4`: 1080 x 1920, 60 fps;
- `summon_sprite_previa.mp4`: a sprite sheet tocada a 30 fps, ampliada 4x; à esquerda a versão
  `lighter`, à direita a versão com alfa sobre um fundo verde.
