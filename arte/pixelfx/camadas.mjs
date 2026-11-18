// As CAMADAS dos jutsus desenhados: efeitos do PixelFX (github.com/patch-gg/pixelfx, licença MIT) recoloridos com as
// cores das folhas do Victor e tocados por cima (ou por baixo) dos quadros dele, em public/camadasJutsus.js.
//
// Uso:  git clone --depth 1 https://github.com/patch-gg/pixelfx /tmp/pixelfx
//       node arte/pixelfx/camadas.mjs /tmp/pixelfx
//
// Para cada camada de CAMADAS: renderiza, recorta a área que tem desenho (a mesma em todos os quadros), monta a folha
// em grade em public/assets/vfx/<nome>.png e escreve tamanho, âncora e tempo de todas em public/vfxCamadas.js.
// Não edite os arquivos gerados à mão: mude aqui e rode de novo. As camadas nossas (brasas, faíscas, cruzes) estão em
// arte/pixelfx/efeitos/ e são copiadas para src/fx/heranca/ do PixelFX antes de renderizar.
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const pixelfx = process.argv[2];
if (!pixelfx) {
  console.error('uso: node arte/pixelfx/camadas.mjs <pasta do pixelfx>');
  process.exit(1);
}
const lib = await import(pathToFileURL(resolve(pixelfx, 'tools/lib/fxlib.mjs')).href);
const core = await import(pathToFileURL(resolve(pixelfx, 'src/core/index.js')).href);
/** O boneco do PixelFX só com a silhueta (as faíscas sobem pelo corpo) e sem os pixels: no jogo o corpo é o do ninja. */
const semBoneco = () => { const a = core.stockActor(2); return { ...a, pixels: new Uint32Array(a.pixels.length) }; };

// As cores tiradas das folhas desenhadas (public/assets/vfx/fire_*, heal_*, lightning_*), do escuro ao claro.
const FOGO = ['#3a0800', '#7a1000', '#c81800', '#f04000', '#f07000', '#f0a000', '#f0d020', '#fff4a0', '#ffffff'];
const CURA = ['#0a3018', '#106a28', '#10a030', '#30b050', '#50d070', '#70f080', '#a0f0a0', '#d0f0d0', '#ffffff'];
const POEIRA = ['#1c1610', '#33281c', '#4f3f2c', '#6e5a40', '#927a58', '#b89f78', '#dcc8a2', '#fff4dc'];   // terra: serve aos três
const AMBAR = ['#2a1a10', '#5a3a1c', '#8a5a2a', '#c07a30', '#e8a040', '#ffcf70', '#fff0c0', '#ffffff'];   // v79: a luz nas rachas da Pedra
const RAIO = ['#0a1840', '#0040a0', '#0080f0', '#00a0f0', '#70c8ff', '#f0f040', '#f0f0a0', '#fffff0', '#ffffff'];

/** Casas do jogo por pixel do efeito: perto do pixel das folhas do Victor (0,03 a 0,04 casa por pixel). */
const PX_CASA = 0.035;

/**
 * nome: como o jogo chama a camada. id: o efeito no PixelFX (heranca/... = os nossos). fps: quadros por segundo.
 * ate: segundos que entram (corta o fim longo). opcoes: as do efeito. blend: mistura no jogo. alpha: opacidade.
 * foco: onde o efeito acontece em relação à origem dele (px; o orbe do spell-charge fica na mão, não nos pés): vira a
 * âncora. arte: para onde o efeito aponta (rad; o jogo gira na direção do golpe). luz: força da luz somada.
 * sy: estica na vertical os anéis de chão (o PixelFX deita o anel de lado; o jogo é visto mais de cima).
 */
const CAMADAS = [
  // ---- Fogo
  { nome: 'pfx_fogo_brasas', id: 'heranca/brasas', fps: 15, opcoes: { palette: FOGO }, blend: 'normal' },
  { nome: 'pfx_fogo_anel', id: 'fire/fire-ring', fps: 15, ate: 2.6, opcoes: { palette: FOGO }, sy: 1.6, blend: 'normal' },
  { nome: 'pfx_fogo_carga', id: 'arcane/spell-charge', fps: 15, foco: [18, -22], opcoes: { palette: FOGO }, blend: 'normal' },
  { nome: 'pfx_fogo_faisca', id: 'impacts/hit-spark', fps: 20, arte: 0, opcoes: { palette: FOGO }, blend: 'normal' },
  { nome: 'pfx_fogo_pilar', id: 'fire/flame-pillar', fps: 15, ate: 3.3, opcoes: { palette: FOGO }, blend: 'normal' },
  { nome: 'pfx_poeira', id: 'impacts/ground-slam', fps: 15, ate: 1.2, opcoes: { palette: POEIRA, stone: '#7a6448' }, sy: 1.3, alpha: 0.75, blend: 'normal' },
  // ---- Cura
  { nome: 'pfx_cura_cruzes', id: 'heranca/cruzes', fps: 15, opcoes: { palette: CURA }, blend: 'normal' },
  { nome: 'pfx_cura_corpo', id: 'holy/heal', fps: 15, semBoneco: true, opcoes: { palette: CURA }, blend: 'normal' },
  { nome: 'pfx_cura_anel', id: 'holy/heal-aoe', fps: 15, ate: 2.3, opcoes: { palette: CURA }, sy: 1.6, blend: 'normal' },
  { nome: 'pfx_cura_runas', id: 'arcane/rune-circle', fps: 12, opcoes: { palette: CURA }, sy: 1.4, blend: 'normal' },
  { nome: 'pfx_cura_faisca', id: 'impacts/hit-spark', fps: 20, arte: 0, opcoes: { palette: CURA }, blend: 'normal' },
  { nome: 'pfx_cura_carga', id: 'arcane/spell-charge', fps: 15, foco: [18, -22], opcoes: { palette: CURA }, blend: 'normal' },
  // ---- Pedra (v79)
  { nome: 'pfx_pedra_carga', id: 'arcane/spell-charge', fps: 15, foco: [18, -22], opcoes: { palette: AMBAR }, blend: 'normal' },
  { nome: 'pfx_pedra_chao', id: 'impacts/heavy-landing', fps: 15, ate: 1.2, opcoes: { palette: POEIRA }, sy: 1.3, blend: 'normal' },
  { nome: 'pfx_pedra_poeira', id: 'heranca/brasas', fps: 15, opcoes: { palette: POEIRA }, blend: 'normal' },
  // ---- Relâmpago
  { nome: 'pfx_raio_faiscas', id: 'heranca/faiscas', fps: 15, opcoes: { palette: RAIO }, blend: 'normal' },
  { nome: 'pfx_raio_choque', id: 'lightning/zap-hit', fps: 20, arte: 0, opcoes: { palette: RAIO }, blend: 'normal' },
  { nome: 'pfx_raio_estalo', id: 'lightning/thunderclap', fps: 15, ate: 1.4, opcoes: { palette: RAIO }, sy: 1.3, blend: 'normal' },
  { nome: 'pfx_raio_carga', id: 'arcane/spell-charge', fps: 15, foco: [18, -22], opcoes: { palette: RAIO }, blend: 'normal' },
];

// os efeitos nossos entram no PixelFX como heranca/<nome>
const nossos = join('arte', 'pixelfx', 'efeitos');
mkdirSync(join(pixelfx, 'src', 'fx', 'heranca'), { recursive: true });
for (const f of readdirSync(nossos)) if (f.endsWith('.js')) copyFileSync(join(nossos, f), join(pixelfx, 'src', 'fx', 'heranca', f));

const saida = join('public', 'assets', 'vfx');
mkdirSync(saida, { recursive: true });
const dados = {};
for (const c of CAMADAS) {
  const fx = await lib.loadEffect(c.id);
  const r = lib.renderFrames(fx, { fps: c.fps, bg: 'none', options: { ...c.opcoes, ...(c.semBoneco ? { actor: semBoneco() } : {}) }, actor: false });
  let quadros = r.frames.filter((f) => c.ate === undefined || f.t <= c.ate + 1e-6);
  // cada quadro em duas partes: a COR (pixels, desenhados normal) e a LUZ (somada por cima com 'lighter': clareia o
  // chão claro do jogo em vez de sujar, que é o que a luz "assada" na cor fazia)
  const partes = quadros.map((f) => {
    const cor = new Uint8ClampedArray(r.w * r.h * 4), luz = new Uint8ClampedArray(r.w * r.h * 4);
    for (let i = 0; i < r.w * r.h; i++) {
      const v = f.raw[i], l = f.light[i] & 0xffffff, j = i * 4;
      cor[j] = v & 255; cor[j + 1] = (v >>> 8) & 255; cor[j + 2] = (v >>> 16) & 255; cor[j + 3] = v >>> 24;
      const lr = l & 255, lg = (l >>> 8) & 255, lb = (l >>> 16) & 255, m = Math.max(lr, lg, lb);
      if (m > 3) { luz[j] = (lr * 255) / m; luz[j + 1] = (lg * 255) / m; luz[j + 2] = (lb * 255) / m; luz[j + 3] = m; }   // a·rgb = a luz
    }
    return { cor, luz };
  });
  const tem = (buf, x, y) => buf[(y * r.w + x) * 4 + 3] > 6;
  // um one-shot termina vazio: tira os quadros vazios do fim
  const vazio = (q) => { for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (tem(q.cor, x, y) || tem(q.luz, x, y)) return false; return true; };
  if (!fx.meta.loop) while (partes.length > 1 && vazio(partes[partes.length - 1])) partes.pop();
  // a área com desenho (a mesma em todos os quadros, para a âncora não pular)
  let x0 = r.w, y0 = r.h, x1 = -1, y1 = -1;
  for (const q of partes) for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    if (tem(q.cor, x, y) || tem(q.luz, x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const cols = Math.max(1, Math.min(partes.length, Math.floor(2048 / w)));
  const rows = Math.ceil(partes.length / cols);
  // a folha: a grade da cor em cima e a da luz embaixo (mesma posição, `rows` linhas abaixo)
  const img = lib.canvas(cols * w, rows * h * 2, [0, 0, 0, 0]);
  const recorte = (buf) => {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) out.set(buf.subarray(((y + y0) * r.w + x0) * 4, ((y + y0) * r.w + x0 + w) * 4), y * w * 4);
    return out;
  };
  partes.forEach((q, i) => {
    const gx = (i % cols) * w, gy = Math.floor(i / cols) * h;
    img.paste(recorte(q.cor), w, h, gx, gy);
    img.paste(recorte(q.luz), w, h, gx, gy + rows * h);
  });
  writeFileSync(join(saida, `${c.nome}.png`), img.png());
  const [ox, oy] = fx.meta.origin, [fx0, fy0] = c.foco ?? [0, 0];
  dados[c.nome] = {
    casas: +(w * PX_CASA).toFixed(3), ancora: [ox + fx0 - x0, oy + fy0 - y0], ...(c.arte !== undefined ? { arte: c.arte } : {}), ...(c.sy ? { sy: c.sy } : {}), blend: c.blend, ...(c.alpha ? { alpha: c.alpha } : {}),
    luz: c.luz ?? 0.8, quadros: partes.length, cols, quadro: [w, h], ms: Math.round(1000 / c.fps), ...(fx.meta.loop ? { laco: true } : {}), pixelfx: c.id,
  };
  console.log(`${c.nome}: ${c.id}, ${partes.length} quadros de ${w}x${h} (${cols} por linha)`);
}
const pngs = CAMADAS.map((c) => join(saida, `${c.nome}.png`));
if (spawnSync('python3', ['arte/pixelfx/compactar.py', ...pngs], { stdio: 'inherit' }).status !== 0) throw new Error('compactar.py falhou (precisa do Pillow)');
writeFileSync(join('public', 'vfxCamadas.js'), [
  '/* GERADO por arte/pixelfx/camadas.mjs (não editar à mão): as camadas que complementam as folhas desenhadas dos jutsus.',
  ' * Efeitos do PixelFX (github.com/patch-gg/pixelfx, licença MIT; créditos em arte/pixelfx/NOTICE.md) recoloridos.',
  ' * casas = largura de um quadro no jogo; ancora = ponto de apoio (px do quadro); quadros/cols/quadro = a grade da folha;',
  ' * ms = duração de cada quadro; laco = repete enquanto durar; luz = força da luz somada (a grade de baixo da folha). */',
  'export const VFX_CAMADAS = {',
  ...Object.entries(dados).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`),
  '};',
  '',
].join('\n'));
console.log('public/vfxCamadas.js escrito');
