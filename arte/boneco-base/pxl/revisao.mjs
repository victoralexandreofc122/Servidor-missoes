// Imagens de revisão de uma peça de cabeça: masculino e feminino nas 4 direções em 1x, 2x e 4x (fundo transparente),
// detalhes em 8x (frente, lado, costas) e um quadro sobre fundo para avaliar. Uso:
// node arte/boneco-base/pxl/revisao.mjs juba branco   -> arte/boneco-base/pxl/revisao/juba-*.png
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(process.env.BONECO_JS || join(here, '..', 'boneco-base.js'), 'utf8');
const B = new Function('module', `${js}\nreturn module.exports;`)({ exports: {} });
const [peca = 'juba', cor = 'branco'] = process.argv.slice(2);
const out = process.env.REVISAO_DIR || join(here, 'revisao'); mkdirSync(out, { recursive: true });

const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const b = Buffer.concat([Buffer.from(t), d]); const s = Buffer.alloc(4); s.writeUInt32BE(crc(b)); return Buffer.concat([l, b, s]); };
function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const rgba = (c) => c.startsWith('#') ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(255) : (() => { const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], Math.round(m[3] * 255)]; })();
const LOOK = { cabelo: peca, corCabelo: cor, superior: 'camiseta', corSuperior: 'azul', inferior: 'calca', corInferior: 'preto', pes: 'preto' };
const VIEWS = ['frente', 'direita', 'costas', 'esquerda'];
// Desenha um boneco num buffer, recortando a janela [x0, y0, w, h] do quadro 64 x 96, na escala sc.
function put(buf, bw, sx, view, ox, oy, sc, jan = [0, 0, 64, 96]) {
  const m = B.build(sx, view, null, LOOK); const g = B.flatten(m);
  const [jx, jy, jw, jh] = jan;
  for (let y = 0; y < jh; y++) for (let x = 0; x < jw; x++) {
    const t = g[(y + jy) * 64 + x + jx]; if (!t) continue;
    const [r, gg, b, a] = rgba(B.colorOf(t, m.look));
    for (let j = 0; j < sc; j++) for (let i = 0; i < sc; i++) {
      const o = ((oy + y * sc + j) * bw + ox + x * sc + i) * 4; const al = a / 255;
      buf[o] = Math.round(r * al + buf[o] * (1 - al)); buf[o + 1] = Math.round(gg * al + buf[o + 1] * (1 - al));
      buf[o + 2] = Math.round(b * al + buf[o + 2] * (1 - al)); buf[o + 3] = Math.max(buf[o + 3], a);
    }
  }
}
function prancha(nome, sc, fundo) {
  const w = 64 * sc * 4, h = 96 * sc * 2; const buf = Buffer.alloc(w * h * 4);
  if (fundo) for (let k = 0; k < w * h; k++) buf.set(fundo, k * 4);
  ['m', 'f'].forEach((sx, r) => VIEWS.forEach((v, c) => put(buf, w, sx, v, c * 64 * sc, r * 96 * sc, sc)));
  writeFileSync(join(out, `${peca}-${nome}.png`), png(w, h, buf));
}
prancha('1x', 1); prancha('2x', 2); prancha('4x', 4); prancha('4x-grama', 4, [63, 125, 58, 255]);
// Detalhes em 8x da região da cabeça (y 14 a 80) em cada direção, masculino em cima, feminino embaixo.
for (const v of ['frente', 'esquerda', 'costas']) {
  const jan = [0, 14, 64, 66], sc = 8, w = 64 * sc * 2, h = 66 * sc; const buf = Buffer.alloc(w * h * 4);
  for (let k = 0; k < w * h; k++) buf.set([63, 125, 58, 255], k * 4);
  ['m', 'f'].forEach((sx, c) => put(buf, w, sx, v, c * 64 * sc, 0, sc, jan));
  writeFileSync(join(out, `${peca}-detalhe-${v === 'esquerda' ? 'lado' : v}.png`), png(w, h, buf));
}
// Conferência técnica: olhos e orelha à mostra, nada abaixo de Y=92, nada fora do quadro.
const prob = [];
for (const sx of ['m', 'f']) for (const v of ['frente', 'esquerda', 'costas', 'direita']) {
  const com = B.build(sx, v, null, LOOK); const sem = B.build(sx, v, null, Object.assign({}, LOOK, { cabelo: undefined }));
  const gc = B.flatten(com); const gs = B.flatten(sem);
  let rosto = 0, cobertos = 0, fundo = 0;
  for (let i = 0; i < gc.length; i++) {
    if (sem.layers.rosto[i]) { rosto++; if (gc[i] !== gs[i]) cobertos++; }
    if (gc[i] && gc[i] !== 11 && Math.floor(i / 64) > 92) fundo++;
  }
  if (rosto && cobertos / rosto > 0.15) prob.push(`${sx} ${v}: o cabelo cobre ${Math.round((100 * cobertos) / rosto)}% do rosto (olhos, boca)`);
  if (fundo) prob.push(`${sx} ${v}: ${fundo} pixels abaixo de Y=92`);
}
console.log(`revisão de ${peca}: ${out}`);
console.log(prob.length ? 'PROBLEMAS:\n- ' + prob.join('\n- ') : 'conferência técnica: ok (rosto à mostra, nada abaixo de Y=92)');
