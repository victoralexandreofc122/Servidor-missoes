// V31: juntas do esqueleto palito (rig.js) de cada quadro da caminhada e da corrida, em JSON, para a prancha que
// desenha o palito por cima do boneco.   node arte/personagem-pixel/esqueleto_quadros.mjs saida.json
import { writeFileSync } from 'node:fs';
import * as m from '../../public/pixelHero.js';
const out = {};
for (const anim of ['andar', 'correr']) for (const v of m.VIEWS) for (let k = 0; k < 6; k++) {
  out[`${anim}_${v}_${k}`] = m.renderHero('C', v, { skel: { anim, t: k / 6 }, limpeza: true }).juntas;
}
writeFileSync(process.argv[2] || 'juntas.json', JSON.stringify(out));
