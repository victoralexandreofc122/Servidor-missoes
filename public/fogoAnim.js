/*
 * v73: as animações desenhadas pelo Victor para 10 jutsus de Fogo (6 quadros cada, public/assets/vfx/fire_*_0N.png;
 * tamanhos e âncoras em vfxFogo.js, gerado por arte/jutsus-vfx/recortar.py).
 *
 * SÓ VISUAL: o servidor decide quem acerta e quando; aqui cada quadro entra na hora certa do golpe:
 *   conjuração (na mão) → golpe ativo (voo, leque, raio) → impacto → fim (fumaça, brasas apagando).
 * Cada função devolve true quando desenhou (o jogo então não desenha o efeito antigo daquele jutsu).
 */
import { jutsuSpritesReady } from './vfxJutsus.js';

const ready = (skill) => jutsuSpritesReady(skill);
/** Um pouco à frente da mão de quem lançou (em casas). */
const hand = (msg, d = 0.35) => ({ x: msg.x + msg.fx * d, y: msg.y + msg.fy * d - 0.15 });

/** Toca uma sequência: [quadro, começa em (ms), dura (ms), opções extras]. */
function seq(jfx, base, x, y, now, steps, common = {}) {
  for (const [q, at, ms, extra] of steps) jfx.show(`${base}_${q}`, x, y, now + at, ms, { fadeIn: 30, fadeOut: 70, ...common, ...(extra || {}) });
}

/** O jutsu foi lançado (mensagem `cast`). */
export function fogoCast(jfx, msg, info, lineEnd, now, follow) {
  const s = msg.skill;
  if (!s || !ready(s)) return false;
  const angle = Math.atan2(msg.fy, msg.fx);
  const h = hand(msg);
  const len = Math.max(1, Math.hypot(lineEnd.tx - h.x, lineEnd.ty - h.y));
  switch (s) {
    case 'fire_2': {   // Revoada de Brasas: as faíscas na mão; as bolas voam com o `projectile`
      seq(jfx, s, h.x, h.y, now, [['01', 0, 130], ['02', 90, 140, { scale: 0.7 }]], { angle, flicker: true });
      return true;
    }
    case 'fire_ryuka': {   // Lança de Fogo: chama na mão, a flecha, a lança até o fim da linha, quebra e explode lá
      seq(jfx, s, h.x, h.y, now, [['01', 0, 90, { flicker: true }], ['02', 70, 110, { angle }],
        ['03', 150, 200, { angle, len, flicker: true }], ['04', 330, 170, { angle, len }]]);
      seq(jfx, s, lineEnd.tx, lineEnd.ty, now, [['05', 380, 260, { grow: 0.15 }], ['06', 560, 600, { angle, fadeOut: 400 }]]);
      return true;
    }
    case 'fire_lamina': {   // Lâmina de Fogo: a chama acende, gira, vira a lâmina; durante o buff ela fica na mão
      const dur = info.durationMs ?? 5000;
      const tag = `lamina:${msg.playerId}`;
      jfx.drop(tag);
      const onHand = { follow: () => follow(msg.playerId), tag };
      seq(jfx, s, msg.fx * 0.35, msg.fy * 0.35 - 0.3, now, [['01', 0, 110, { flicker: true }], ['02', 90, 130], ['03', 200, 150],
        ['04', 330, 260, { grow: 0.1 }], ['05', 560, Math.max(200, dur - 560), { flicker: true, fadeOut: 200 }]], onHand);
      seq(jfx, s, 0, -0.1, now, [['06', dur, 500, { layer: 'ground', fadeOut: 300 }]], onHand);
      return true;
    }
    case 'fire_marca': {   // Marca Incandescente: a brasa na mão, o fio até o alvo, o clarão (a marca vem na `combo`)
      seq(jfx, s, h.x, h.y, now, [['01', 0, 110], ['02', 80, 150, { angle, len }], ['03', 200, 170, { angle, len }]]);
      return true;
    }
    case 'fire_3': {   // Varredura Flamejante: o leque abre da mão até o alcance e vira fumaça
      const sc = (info.range ?? 5) / 5;
      seq(jfx, s, h.x, h.y, now, [['01', 0, 90], ['02', 70, 110], ['03', 160, 150], ['04', 290, 170], ['05', 440, 190]],
        { angle, scale: sc, flicker: true });
      const mid = { x: h.x + msg.fx * 2.4 * sc, y: h.y + msg.fy * 2.4 * sc };
      seq(jfx, s, mid.x, mid.y, now, [['06', 600, 700, { scale: sc * 0.8, fadeOut: 450, grow: 0.15 }]]);
      return true;
    }
    case 'fire_hotan': {   // Projétil Dracônico: o redemoinho na mão; o dragão voa com o `projectile`
      seq(jfx, s, h.x, h.y, now, [['01', 0, 260, { flicker: true, grow: 0.2 }]]);
      return true;
    }
    case 'fire_cometa': {   // Cometa Rasteiro: o estouro na saída, o cometa até onde parou, o impacto e a fumaça no rastro
      if (msg.tx === undefined) return false;
      const ex = msg.tx, ey = msg.ty;
      const d = Math.max(0.8, Math.hypot(ex - msg.x, ey - msg.y));
      const a = Math.atan2(ey - msg.y, ex - msg.x);
      seq(jfx, s, msg.x, msg.y, now, [['01', 0, 120, { flicker: true }]]);
      seq(jfx, s, ex, ey, now, [['02', 40, 90, { angle: a }], ['03', 100, 160, { angle: a, len: d, flicker: true }],
        ['04', 240, 200, { angle: a, len: d }], ['06', 420, 700, { angle: a, len: d, fadeOut: 450, layer: 'ground' }]]);
      return true;
    }
    case 'fire_rugido': {   // Rugido da Fornalha: o raio sai da mão, cresce até o alcance, estoura na ponta e vira fumaça
      jfx.drop(`rugido:${msg.playerId}`);
      seq(jfx, s, h.x, h.y, now, [['02', 0, 120], ['03', 100, 220, { flicker: true }], ['04', 300, 200, { flicker: true }],
        ['05', 480, 260], ['06', 720, 700, { fadeOut: 450 }]], { angle, len });
      return true;
    }
    default:
      return false;
  }
}

/** Começou a conjuração (selos): o Rugido junta o redemoinho na mão enquanto carrega. */
export function fogoCastStart(jfx, msg, p, now, follow) {
  if (msg.skill !== 'fire_rugido' || !ready('fire_rugido') || !p) return;
  jfx.show('fire_rugido_01', 0.3, -0.45, now, msg.ms, { follow: () => follow(p.id), tag: `rugido:${p.id}`, flicker: true, fadeIn: 200, grow: 0.5 });
}

/** Um projétil saiu: devolve o quadro que voa (ou null). */
export function fogoProjectileFrame(msg) {
  if (msg.skill === 'fire_2' && ready('fire_2')) return 'fire_2_04b';
  if (msg.skill === 'fire_hotan' && ready('fire_hotan')) return 'fire_hotan_03';
  return null;
}

/** O projétil bateu (mensagem `impact`). */
export function fogoImpact(jfx, msg, skill, now) {
  if (skill === 'fire_2' && ready('fire_2')) {
    seq(jfx, 'fire_2', msg.x, msg.y, now, [['05b', 0, 260, { flicker: true }], ['06b', 220, 560, { fadeOut: 380, grow: 0.2 }]]);
    return true;
  }
  if (skill === 'fire_hotan' && ready('fire_hotan')) {
    const sc = Math.max(0.6, (msg.r || 2) / 2);
    seq(jfx, 'fire_hotan', msg.x, msg.y, now, [['04', 0, 150, { flicker: true }], ['05', 110, 360, { grow: 0.1 }],
      ['06', 420, 700, { fadeOut: 450, grow: 0.15 }]], { scale: sc });
    return true;
  }
  return false;
}

/** Aviso ou zona no chão (mensagem `ground`): as Cinzas Detonantes e o Chão Incandescente. */
export function fogoGround(jfx, msg, now) {
  if (msg.skill === 'fire_haiseki' && msg.kind === 'aviso' && ready('fire_haiseki')) {
    const sc = (msg.r ?? 2) / 2, ms = msg.ms ?? 1000;
    const g = { scale: sc, layer: 'ground' };
    seq(jfx, 'fire_haiseki', msg.x, msg.y, now, [['01', 0, ms * 0.4, { fadeIn: 120 }], ['02', ms * 0.35, ms * 0.38], ['03', ms * 0.7, ms * 0.32, { flicker: true }]], g);
    seq(jfx, 'fire_haiseki', msg.x, msg.y, now, [['04', ms, 260, { flicker: true }], ['05', ms + 200, 380, { flicker: true }], ['06', ms + 520, 700, { fadeOut: 450 }]], { scale: sc });
    return true;
  }
  if (msg.skill === 'fire_chao' && msg.kind !== 'aviso' && ready('fire_chao')) {
    const sc = (msg.r ?? 2.5) / 2.5, ms = msg.ms ?? 4000;
    const g = { scale: sc, layer: 'ground', tag: `chao:${msg.id}` };
    const steps = [['01', 0, 170], ['02', 150, 220]];
    const loop = ['03', '04', '05', '04'];
    for (let t = 350, i = 0; t < ms - 200; t += 190, i++) steps.push([loop[i % 4], t, 230, { flicker: true }]);
    steps.push(['06', ms - 200, 900, { fadeOut: 600 }]);
    seq(jfx, 'fire_chao', msg.x, msg.y, now, steps, g);
    return true;
  }
  return false;
}

/** A Marca Incandescente pegou alguém (mensagem `combo`, combo 'marca'): o selo fica nele até detonar ou acabar. */
export function fogoMarca(jfx, id, ms, now, follow) {
  if (!ready('fire_marca')) return false;
  const tag = `marca:${id}`;
  jfx.drop(tag);
  const o = { follow: () => follow(id), tag };
  seq(jfx, 'fire_marca', 0, -0.9, now, [['04', 0, 260, { grow: 0.2 }], ['05', 220, Math.max(200, ms - 220), { flicker: true }], ['06', ms, 450, { fadeOut: 300 }]], o);
  return true;
}

/** A marca detonou: o selo estoura grande e apaga. */
export function fogoDetona(jfx, id, now, follow) {
  if (!ready('fire_marca')) return false;
  jfx.drop(`marca:${id}`);
  const o = { follow: () => follow(id), tag: `marca:${id}` };
  seq(jfx, 'fire_marca', 0, -0.9, now, [['05', 0, 220, { scale: 1.8, flicker: true }], ['06', 200, 500, { scale: 1.3, fadeOut: 350 }]], o);
  return true;
}
