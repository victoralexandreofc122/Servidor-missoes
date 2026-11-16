// Exporta efeitos do PixelFX (github.com/patch-gg/pixelfx, licença MIT) para o jogo.
//
// Uso: node arte/pixelfx/exportar.mjs <pasta do pixelfx>
//
// Para cada efeito da lista EFEITOS: renderiza com as cores do jogo, monta a folha com os quadros numa
// linha só (o formato que public/vfx.js lê) em public/assets/vfx/<nome>.png e escreve os números de
// todos em public/vfxPixelfx.js. Não edite os arquivos gerados à mão: mude aqui e rode de novo.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pixelfx = process.argv[2];
if (!pixelfx) {
  console.error('uso: node arte/pixelfx/exportar.mjs <pasta do pixelfx>');
  process.exit(1);
}
const lib = await import(pathToFileURL(resolve(pixelfx, 'tools/lib/fxlib.mjs')).href);

// Tinta preta com brasa, como o sprite do Rei Lodo (public/assets/monsters/rei_lodo.webp).
const LODO = ['#08070c', '#141119', '#221c26', '#3a2626', '#a8482a', '#e0703a'];

/**
 * nome: como o jogo chama o efeito. id: o efeito no PixelFX. fps: quadros por segundo da folha.
 * pular: segundos cortados do começo. opcoes: as do efeito (cores...). px: pixels do boneco por pixel do efeito.
 * remix: um efeito nosso em arte/pixelfx/efeitos/ (copiado para src/fx/heranca/ do PixelFX; o id vira heranca/<nome>).
 */
const EFEITOS = [
  // A morte do Rei Lodo: o corpo estoura num "puf" de bolhas de lodo com brilhos...
  {
    nome: 'rei_lodo_puf', remix: 'arte/pixelfx/efeitos/poof-tinta.js', fps: 15, px: 2,
    opcoes: { palette: LODO, stars: ['#ff8a3a', '#ffc070', '#fff0c0'], highlight: '#e0703a' },
  },
  // ...e deixa no chão uma poça que ferve e some. Sem a gota caindo do começo (0,37 s).
  {
    nome: 'rei_lodo_poca', id: 'nature/acid-splash', fps: 15, px: 2, pular: 0.37,
    opcoes: { palette: ['#050408', '#0e0c14', '#1c1824', '#2e2838', '#7a3a22', '#e0703a', '#ffb060', '#fff0c0'] },
  },
];

const saida = join('public', 'assets', 'vfx');
mkdirSync(saida, { recursive: true });
const dados = {};

for (const e of EFEITOS) {
  if (e.remix) {
    mkdirSync(join(pixelfx, 'src', 'fx', 'heranca'), { recursive: true });
    copyFileSync(e.remix, join(pixelfx, 'src', 'fx', 'heranca', basename(e.remix)));
    e.id = `heranca/${basename(e.remix, '.js')}`;
  }
  const fx = await lib.loadEffect(e.id);
  const r = lib.renderFrames(fx, { fps: e.fps, bg: 'none', options: e.opcoes });
  const quadros = r.frames.filter((f) => f.t >= (e.pular ?? 0) - 1e-6);
  const img = lib.canvas(r.w * quadros.length, r.h, [0, 0, 0, 0]);
  quadros.forEach((f, i) => img.paste(f.clear, r.w, r.h, i * r.w, 0));
  const arquivo = join(saida, `${e.nome}.png`);
  writeFileSync(arquivo, img.png());
  dados[e.nome] = {
    arquivo: `assets/vfx/${e.nome}.png`, quadros: quadros.length, quadro: [r.w, r.h],
    ancora: fx.meta.origin, ms: Math.round(1000 / e.fps), px: e.px, pixelfx: e.id,
  };
  console.log(`${e.nome}: ${e.id}, ${quadros.length} quadros de ${r.w}x${r.h} -> ${arquivo}`);
}

writeFileSync(join('public', 'vfxPixelfx.js'), [
  '// GERADO por arte/pixelfx/exportar.mjs: não edite à mão.',
  '// Efeitos do PixelFX (github.com/patch-gg/pixelfx, licença MIT; créditos em arte/pixelfx/NOTICE.md).',
  `export const VFX_PIXELFX = ${JSON.stringify(dados)};`,
  '',
].join('\n'));
console.log('public/vfxPixelfx.js escrito');
