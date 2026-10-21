// Exporta o efeito de summon (summon.html → renderFrame) como sprite sheet para o jogo.
// Uso:  node arte/summon/exportar.mjs      (precisa de playwright com Chromium)
//
// Cada quadro i (30 fps) usa t = i / 30 e chama renderFrame(round(t × 60)) no canvas
// quadrado de 1080×1080; o quadro inteiro é reduzido para 256×256, então a âncora
// (centro x, base do cilindro em 73,5% da altura) é a mesma do summon.html.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FRAME = 256, COLS = 12, ROWS = 15, FPS = 30, FRAMES = 170, FEATHER = 20;
const ANCHOR = { x: 0.5, y: 0.735 };                     // = CX e GROUND_Y do summon.html (formato quadrado)

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(join(here, 'summon.html')).href + '?headless=1&format=square');

const sheets = await page.evaluate(async ({ FRAME, COLS, ROWS, FPS, FRAMES, FEATHER }) => {
  const src = document.getElementById('c');
  const srcFps = window.SIZE.FPS;
  const sheet = document.createElement('canvas');
  sheet.width = FRAME * COLS; sheet.height = FRAME * ROWS;
  const g = sheet.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, sheet.width, sheet.height);
  const used = [];
  for (let i = 0; i < FRAMES; i++) {
    const srcFrame = Math.round((i / FPS) * srcFps);
    used.push(window.renderFrame(srcFrame));
    // redução de alta qualidade (1080 → 256) a partir do quadro em fundo preto
    const bmp = await createImageBitmap(src, { resizeWidth: FRAME, resizeHeight: FRAME, resizeQuality: 'high' });
    g.drawImage(bmp, (i % COLS) * FRAME, Math.floor(i / COLS) * FRAME);
    bmp.close();
  }
  // Borda suave: o flash e o cilindro subindo passam do limite do quadro; sem isso a célula
  // mostraria um corte reto no jogo. A luz vai a zero nos últimos FEATHER px de cada lado.
  const img = g.getImageData(0, 0, sheet.width, sheet.height);
  const d = img.data;
  const win = new Float32Array(FRAME);
  for (let k = 0; k < FRAME; k++) {
    const e = Math.min(1, Math.min(k + 0.5, FRAME - k - 0.5) / FEATHER);
    win[k] = e * e * (3 - 2 * e);
  }
  for (let y = 0; y < sheet.height; y++) {
    const wy = win[y % FRAME];
    for (let x = 0; x < sheet.width; x++) {
      const w = wy * win[x % FRAME];
      if (w >= 1) continue;
      const p = (y * sheet.width + x) * 4;
      d[p] = Math.round(d[p] * w); d[p + 1] = Math.round(d[p + 1] * w); d[p + 2] = Math.round(d[p + 2] * w);
    }
  }
  g.putImageData(img, 0, 0);
  const lighter = sheet.toDataURL('image/png');

  // Versão com alfa: a luz é aditiva sobre preto, então alfa = brilho máximo do pixel e a cor é
  // desmultiplicada (rgb / alfa). Desenhada com 'source-over' sobre preto, volta ao original;
  // sobre outro fundo não há halo escuro, porque a cor da borda não carrega preto.
  for (let p = 0; p < d.length; p += 4) {
    const a = Math.max(d[p], d[p + 1], d[p + 2]);
    if (a === 0) { d[p + 3] = 0; continue; }
    d[p]     = Math.min(255, Math.round(d[p] * 255 / a));
    d[p + 1] = Math.min(255, Math.round(d[p + 1] * 255 / a));
    d[p + 2] = Math.min(255, Math.round(d[p + 2] * 255 / a));
    d[p + 3] = a;
  }
  const alfaCv = document.createElement('canvas');
  alfaCv.width = sheet.width; alfaCv.height = sheet.height;
  alfaCv.getContext('2d').putImageData(img, 0, 0);
  return { lighter, alfa: alfaCv.toDataURL('image/png'), used, srcTotal: window.TOTAL_FRAMES };
}, { FRAME, COLS, ROWS, FPS, FRAMES, FEATHER });
await browser.close();

const save = (name, url) => writeFileSync(join(here, name), Buffer.from(url.split(',')[1], 'base64'));
save('summon_lighter.png', sheets.lighter);
save('summon_alfa.png', sheets.alfa);

const meta = {
  efeito: 'summon',
  fonte: 'summon.html (renderFrame, 1080×1080, 60 fps, determinístico)',
  quadro: { largura: FRAME, altura: FRAME },
  grade: { colunas: COLS, linhas: ROWS, largura: FRAME * COLS, altura: FRAME * ROWS, ordem: 'linhas, da esquerda para a direita' },
  fps: FPS,
  quadros: FRAMES,
  duracao_s: +(FRAMES / FPS).toFixed(4),
  quadro_no_tempo: 'frame = round(t × 30); célula: coluna = frame % 12, linha = floor(frame / 12)',
  quadro_fonte: 'renderFrame(round(frame / 30 × 60))',
  ancora: {
    descricao: 'centro horizontal e base do cilindro (centro do círculo no chão)',
    fracao: ANCHOR,
    px: { x: ANCHOR.x * FRAME, y: +(ANCHOR.y * FRAME).toFixed(2) },
  },
  borda_suave_px: FEATHER,
  arquivos: {
    'summon_lighter.png': { fundo: 'preto puro', desenhar_com: "globalCompositeOperation = 'lighter'" },
    'summon_alfa.png':    { fundo: 'transparente (alfa = brilho, cor desmultiplicada)', desenhar_com: "globalCompositeOperation = 'source-over'" },
  },
};
writeFileSync(join(here, 'summon.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`${FRAMES} quadros (fonte ${sheets.used[0]}…${sheets.used.at(-1)} de ${sheets.srcTotal}) → summon_lighter.png, summon_alfa.png, summon.json`);
