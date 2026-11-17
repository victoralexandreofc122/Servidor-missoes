/*
 * v73/v74: as animações desenhadas pelo Victor para os jutsus de Fogo e de Cura (public/assets/vfx/<jutsu>_0N.png;
 * tamanhos e âncoras em vfxFogo.js, gerado por arte/jutsus-vfx/recortar.py).
 *
 * SÓ VISUAL: o servidor decide quem acerta e quando; aqui cada quadro entra na hora certa do golpe:
 *   conjuração (na mão) → golpe ativo (voo, leque, raio) → impacto → fim (fumaça, brasas apagando).
 * Cada função devolve true quando desenhou (o jogo então não desenha o efeito antigo daquele jutsu).
 */
import { jutsuSpritesReady } from './vfxJutsus.js';

const ready = (skill) => jutsuSpritesReady(skill);
/** Ida e Volta: a runa marcada de cada ninja (até usar de novo ou acabar o tempo). */
const VOLTA = new Map();
/** Um pouco à frente da mão de quem lançou (em casas). */
const hand = (msg, d = 0.35) => ({ x: msg.x + msg.fx * d, y: msg.y + msg.fy * d - 0.15 });

/** Toca uma sequência: [quadro, começa em (ms), dura (ms), opções extras]. */
function seq(jfx, base, x, y, now, steps, common = {}) {
  for (const [q, at, ms, extra] of steps) jfx.show(`${base}_${q}`, x, y, now + at, ms, { fadeIn: 30, fadeOut: 70, ...common, ...(extra || {}) });
}

/** O jutsu foi lançado (mensagem `cast`). whoAt(x, y): quem está ali (o aliado curado, o alvo da agulha). */
export function fogoCast(jfx, msg, info, lineEnd, now, follow, whoAt = () => null, near = () => []) {
  const s = msg.skill;
  if (!s || !ready(s)) return false;
  const angle = Math.atan2(msg.fy, msg.fx);
  const h = hand(msg);
  const len = Math.max(1, Math.hypot(lineEnd.tx - h.x, lineEnd.ty - h.y));
  // onde o efeito cai: no aliado/alvo (tx, ty) ou em quem lançou
  const at = msg.tx !== undefined ? { x: msg.tx, y: msg.ty } : { x: msg.x, y: msg.y };
  const atId = msg.tx !== undefined ? whoAt(msg.tx, msg.ty) : msg.playerId;
  const onBody = (id, dy = -0.55) => (id ? { follow: () => follow(id) } : null);
  switch (s) {
    case 'fire_coroa': {   // Coroa de Chamas: o anel abre em volta, espinha, vira cratera de fogo, fumaça e chão queimado
      jfx.drop(`coroa:${msg.playerId}`);
      const sc = (info.radius ?? 3.5) / 3.5;
      seq(jfx, s, msg.x, msg.y, now, [['02', 0, 130], ['03', 110, 190, { flicker: true }], ['04', 280, 260, { flicker: true }],
        ['05', 520, 360], ['06', 860, 900, { layer: 'ground', fadeOut: 600 }]], { scale: sc });
      return true;
    }
    case 'heal': {   // Cura: a semente, o brilho, a bolha, as cruzes, a luz e as faíscas, em quem foi curado
      const o = onBody(atId);
      seq(jfx, s, o ? 0 : at.x, o ? -0.5 : at.y - 0.5, now, [['01', 0, 100], ['02', 80, 140], ['03', 200, 150], ['04', 330, 250],
        ['05', 560, 240], ['06', 780, 450, { fadeOut: 300 }]], o || {});
      return true;
    }
    case 'heal_bisturi': {   // Corte Cirúrgico: o bisturi de chakra acende na mão e fica nela durante o buff
      const dur = info.durationMs ?? 5000;
      const tag = `bisturi:${msg.playerId}`;
      jfx.drop(tag);
      const o = { follow: () => follow(msg.playerId), tag };
      seq(jfx, s, msg.fx * 0.35, msg.fy * 0.35 - 0.35, now, [['01', 0, 100], ['02', 80, 130], ['03', 190, 150], ['04', 320, 240],
        ['05', 540, Math.max(200, dur - 540), { flicker: true, fadeOut: 200 }], ['06', dur, 450, { fadeOut: 300 }]], o);
      return true;
    }
    case 'heal_desintox': {   // Desintoxicação Celular: o anel gira em quem foi limpo, estoura em luz e se desfaz
      const o = onBody(atId);
      seq(jfx, s, o ? 0 : at.x, o ? -0.5 : at.y - 0.5, now, [['01', 0, 140], ['02', 120, 170], ['03', 270, 180, { flicker: true }],
        ['04', 430, 240], ['05', 650, 480, { fadeOut: 330 }]], o || {});
      return true;
    }
    case 'heal_palma': {   // Palma Curadora (o redemoinho veio na conjuração): a esfera cura o aliado e se apaga
      jfx.drop(`palma:${msg.playerId}`);
      const o = onBody(atId);
      seq(jfx, s, o ? 0 : at.x, o ? -0.5 : at.y - 0.5, now, [['05', 0, 260], ['06', 240, 300], ['07', 520, 520, { fadeOut: 380 }]], o || {});
      return true;
    }
    case 'heal_agulha': {   // Agulha Calmante: a agulha na mão, voa até o alvo, acerta com cruzes, ondas e se desfaz
      const d = Math.max(0.6, Math.hypot(at.x - h.x, at.y - h.y));
      const a = Math.atan2(at.y - h.y, at.x - h.x);
      const speed = 24, fly = (d / speed) * 1000, t0 = 160;
      seq(jfx, s, h.x, h.y, now, [['01', 0, 100], ['02', 80, 110]]);
      jfx.launch(`agulha:${msg.playerId}:${now}`, `${s}_03`, h.x, h.y, Math.cos(a), Math.sin(a), speed, d, now + t0, 40);
      const o = onBody(atId);
      seq(jfx, s, o ? 0 : at.x, o ? -0.5 : at.y - 0.5, now, [['04', t0 + fly, 200, { angle: a }], ['05', t0 + fly + 180, 300, { angle: a }],
        ['06', t0 + fly + 460, 450, { angle: a, fadeOut: 300 }]], o || {});
      return true;
    }
    case 'heal_casca': {   // Casca de Chakra: a faísca, o anel, a bolha; fica em volta enquanto o escudo dura e se desfaz
      const dur = info.durationMs ?? 3000;
      const id = atId ?? msg.playerId;
      const tag = `casca:${id}`;
      jfx.drop(tag);
      const o = { follow: () => follow(id), tag };
      const steps = [['01', 0, 110], ['02', 90, 150], ['03', 220, 160]];
      for (let t = 360, i = 0; t < dur - 250; t += 420, i++) steps.push([i % 3 === 2 ? '05' : '04', t, 460]);
      steps.push(['06', dur - 250, 500, { fadeOut: 350 }]);
      seq(jfx, s, 0, -0.55, now, steps, o);
      return true;
    }
    // ------------------------------------------------------------------ Relâmpago (v76)
    case 'lightning_corrente': {   // Corrente Rasteira: a marca no chão, o raio corre rente até o fim da linha, estoura, chão queimado
      seq(jfx, s, h.x, h.y + 0.2, now, [['01', 0, 110, { layer: 'ground' }], ['02', 90, 120, { angle, len }],
        ['03', 190, 150, { angle, len, flicker: true }], ['04', 320, 150, { angle, len, flicker: true }]]);
      seq(jfx, s, lineEnd.tx, lineEnd.ty, now, [['05', 450, 240, { angle }], ['06', 660, 800, { layer: 'ground', fadeOut: 550 }]]);
      return true;
    }
    case 'lightning_impulso': {   // Impulso Estático: faísca nos pés, o clarão, o raio leva o ninja à frente, faíscas na chegada
      const d = info.dash ?? 4;
      const end = { x: msg.x + msg.fx * d, y: msg.y + msg.fy * d };
      seq(jfx, s, msg.x, msg.y + 0.3, now, [['01', 0, 90], ['02', 60, 110]]);
      // o raio desenhado cai do alto até o ponto do impacto (a ponta de baixo): o impacto fica na CHEGADA, o raio volta até a saída
      const back = angle + Math.PI;
      seq(jfx, s, end.x, end.y - 0.2, now, [['03', 120, 110, { angle: back, len: d }], ['04', 210, 120, { angle: back, len: d }], ['05', 310, 140, { angle: back, len: d }]]);
      seq(jfx, s, end.x, end.y - 0.3, now, [['06', 420, 480, { fadeOut: 330 }]]);
      return true;
    }
    case 'lightning_shuriken': {   // Shuriken do Trovão: a estrela nasce na mão e gira; voa com o `projectile`
      seq(jfx, s, h.x, h.y - 0.1, now, [['01', 0, 90], ['02', 70, 110, { flicker: true }]]);
      return true;
    }
    case 'lightning_fluxo': {   // Descarga Envolvente: o ponto, o anel acende, espinhos, a descarga em volta, se desfaz
      const sc = (info.radius ?? 2) / 2;
      seq(jfx, s, msg.x, msg.y, now, [['01', 0, 80], ['02', 60, 120], ['03', 160, 150, { flicker: true }], ['04', 290, 220, { flicker: true }],
        ['05', 490, 220], ['06', 690, 450, { fadeOut: 300 }]], { scale: sc });
      return true;
    }
    case 'lightning_2': {   // Farpas de Trovão: faíscas em leque na mão, os raios se abrem; voam com o `projectile`
      seq(jfx, s, h.x, h.y + 0.1, now, [['01', 0, 90], ['02', 70, 120], ['04', 170, 140, { flicker: true }]], { angle });
      return true;
    }
    case 'lightning_volta': {   // Ida e Volta: 1º uso marca a runa no chão; 2º uso (até 4 s) o raio leva de volta a ela
      const tag = `volta:${msg.playerId}`;
      const mark = VOLTA.get(msg.playerId);
      if (mark && now < mark.until) {
        VOLTA.delete(msg.playerId);
        jfx.drop(tag);
        const a = Math.atan2(msg.y - mark.y, msg.x - mark.x);
        seq(jfx, s, mark.x, mark.y, now, [['03', 0, 160, { angle: a, flicker: true }]]);
        seq(jfx, s, msg.x, msg.y - 0.4, now, [['04', 40, 200]]);
        seq(jfx, s, mark.x, mark.y - 0.3, now, [['05', 180, 320, { flicker: true }], ['06', 480, 500, { fadeOut: 330 }]]);
      } else {
        const ms = info.returnMs ?? 4000;
        VOLTA.set(msg.playerId, { x: msg.x, y: msg.y + 0.2, until: now + ms });
        const steps = [['01', 0, 260, { fadeIn: 120 }]];
        for (let t = 240, i = 0; t < ms - 200; t += 260, i++) steps.push([i % 2 ? '01' : '02', t, 300]);
        seq(jfx, s, msg.x, msg.y + 0.2, now, steps, { layer: 'ground', tag });
      }
      return true;
    }
    case 'lightning_raio': {   // Lança Saltadora: a lança voa até o 1º alvo, estoura, salta em arco para o mais perto dele
      const t1 = { x: lineEnd.tx, y: lineEnd.ty };
      const d1 = Math.max(0.6, Math.hypot(t1.x - h.x, t1.y - h.y));
      seq(jfx, s, h.x, h.y, now, [['01', 0, 100, { angle, len: d1 * 0.5 }], ['02', 80, 120, { angle, len: d1 }]]);
      seq(jfx, s, t1.x, t1.y - 0.4, now, [['03', 190, 200, { angle, flicker: true }]]);
      const first = whoAt(t1.x, t1.y);
      const second = first ? near(t1.x, t1.y, t1.x, t1.y, 4.5, [first, msg.playerId])[0] : null;
      const p2 = second ? follow(second) : null;
      if (p2) {
        const a2 = Math.atan2(p2.y - t1.y, p2.x - t1.x), d2 = Math.max(0.6, Math.hypot(p2.x - t1.x, p2.y - t1.y));
        seq(jfx, s, t1.x, t1.y - 0.4, now, [['04', 380, 140, { angle: a2, len: d2 }], ['05', 500, 180, { angle: a2, len: d2 }]]);
        seq(jfx, s, p2.x, p2.y - 0.4, now, [['06', 680, 600, { fadeOut: 400 }]]);
      } else {
        seq(jfx, s, t1.x, t1.y - 0.4, now, [['06', 380, 600, { fadeOut: 400 }]]);
      }
      return true;
    }
    case 'lightning_correntes': {   // Correntes de Raio: as faíscas, a corrente sai, se divide e amarra até 2 alvos na linha
      const hit = near(h.x, h.y, lineEnd.tx, lineEnd.ty, 1.2, [msg.playerId]).slice(0, info.targets ?? 2);
      seq(jfx, s, h.x, h.y, now, [['01', 0, 120], ['02', 100, 140, { angle, len: Math.min(len, 3) }], ['03', 220, 160, { angle }]]);
      const root = info.rootMs ?? 1300;
      for (const id of hit) {
        const o = { follow: () => follow(id), tag: `correntes:${id}` };
        const steps = [['04', 360, 240, { flicker: true }]];
        for (let t = 580, i = 0; t < 360 + root; t += 220, i++) steps.push([i % 2 ? '04' : '05', t, 260, { flicker: true }]);
        steps.push(['06', 360 + root, 450, { fadeOut: 300 }]);
        seq(jfx, s, 0, -0.45, now, steps, o);
      }
      return true;
    }
    case 'lightning_3':   // Investida Elétrica: o redemoinho na saída, o cometa elétrico até onde parou, o estouro, as faíscas
    case 'lightning_risco': {   // Risco de Luz: o ponto, a faísca sobe, o risco atravessa tudo até o fim e estoura lá
      if (msg.tx === undefined) return false;
      const ex = msg.tx, ey = msg.ty;
      const d = Math.max(0.8, Math.hypot(ex - msg.x, ey - msg.y));
      const a = Math.atan2(ey - msg.y, ex - msg.x);
      if (s === 'lightning_3') {
        seq(jfx, s, msg.x, msg.y - 0.3, now, [['01', 0, 140, { flicker: true }]]);
        seq(jfx, s, ex, ey - 0.3, now, [['02', 60, 90, { angle: a, len: d * 0.5 }], ['03', 130, 110, { angle: a, len: d }], ['04', 230, 140, { angle: a, len: d, flicker: true }],
          ['05', 360, 240, { angle: a }], ['06', 580, 450, { fadeOut: 300 }]]);
      } else {
        seq(jfx, s, msg.x, msg.y - 0.2, now, [['01', 0, 80], ['02', 60, 90]]);
        seq(jfx, s, msg.x, msg.y - 0.3, now, [['03', 130, 90, { angle: a, len: d * 0.6 }], ['05', 210, 110, { angle: a, len: d }], ['04', 310, 160, { angle: a, len: d }],
          ['06', 460, 180, { angle: a, len: d }]]);
        seq(jfx, s, (msg.x + ex) / 2, (msg.y + ey) / 2 - 0.3, now, [['07', 620, 500, { fadeOut: 330 }]]);
      }
      return true;
    }
    case 'lightning_maos': {   // Mãos de Trovão: o estalo, a bola de raio, as garras elétricas ficam nas mãos durante o buff
      const dur = info.durationMs ?? 5000;
      const tag = `maos:${msg.playerId}`;
      jfx.drop(tag);
      const o = { follow: () => follow(msg.playerId), tag };
      const steps = [['01', 0, 100], ['02', 80, 150, { flicker: true }], ['03', 220, 200]];
      for (let t = 400, i = 0; t < dur - 200; t += 260, i++) steps.push([['04', '05', '03'][i % 3], t, 300, { flicker: true }]);
      steps.push(['06', dur - 200, 450, { fadeOut: 300 }]);
      seq(jfx, s, msg.fx * 0.35, msg.fy * 0.35 - 0.35, now, steps, o);
      return true;
    }
    case 'lightning_rugido': {   // Rugido do Trovão (a carga junta na conjuração): o feixe largo sai até o alcance, treme e se desfaz
      jfx.drop(`rugidoT:${msg.playerId}`);
      seq(jfx, s, h.x, h.y, now, [['03', 0, 380, { angle, len, flicker: true }]]);
      seq(jfx, s, lineEnd.tx, lineEnd.ty, now, [['05', 300, 260, { angle }]]);   // a parede de raios no fim do feixe
      seq(jfx, s, lineEnd.tx, lineEnd.ty, now, [['06', 560, 600, { fadeOut: 400 }]]);
      return true;
    }
    case 'lightning_armadura': {   // Armadura Relampejante: a faísca, o anel fecha em volta, a descarga estoura no raio e a armadura fica
      const dur = info.durationMs ?? 5000;
      const tag = `armadura:${msg.playerId}`;
      jfx.drop(tag);
      const o = { follow: () => follow(msg.playerId), tag };
      const sc = (info.radius ?? 2.5) / 2.5;
      const steps = [['02', 0, 140], ['03', 120, 180]];
      for (let t = 600, i = 0; t < dur - 250; t += 300, i++) steps.push([i % 2 ? '03' : '04', t, 340, { flicker: true }]);
      steps.push(['06', dur - 250, 600, { fadeOut: 400 }]);
      seq(jfx, s, 0, -0.3, now, steps, o);
      seq(jfx, s, 0, -0.3, now, [['05', 280, 360, { scale: sc, flicker: true }]], o);
      return true;
    }
    case 'heal_2': {   // Punho Sísmico: a brasa verde no chão, o anel rachando, a erupção com pedras e a poeira
      const p = msg.tx !== undefined ? at : { x: h.x + msg.fx, y: h.y + msg.fy };
      const sc = (info.radius ?? 1.5) / 1.5;
      seq(jfx, s, p.x, p.y, now, [['01', 0, 90], ['02', 80, 110, { layer: 'ground' }], ['03', 170, 160, { layer: 'ground' }]], { scale: sc });
      seq(jfx, s, p.x, p.y + 0.5, now, [['04', 310, 200, { flicker: true }], ['05', 480, 260]], { scale: sc });
      seq(jfx, s, p.x, p.y, now, [['06', 720, 600, { fadeOut: 400 }]], { scale: sc });
      return true;
    }
    case 'heal_banho': {   // Banho de Chakra: o anel nos pés, a coluna de chakra cai nele, o chafariz, as gotas e as poças
      const o = onBody(atId);
      const fx0 = o ? 0 : at.x, fy0 = o ? 0.25 : at.y + 0.25;
      seq(jfx, s, fx0, fy0, now, [['01', 0, 150, { layer: 'ground' }], ['02', 130, 170, { layer: 'ground' }], ['03', 280, 220, { flicker: true }],
        ['04', 480, 260, { flicker: true }]], o || {});
      seq(jfx, s, fx0, fy0 - 0.6, now, [['05', 720, 360]], o || {});
      seq(jfx, s, fx0, fy0, now, [['06', 1050, 700, { layer: 'ground', fadeOut: 450 }]], o || {});
      return true;
    }
    case 'heal_septica': {   // Lâmina Séptica: a lâmina na mão e o brilho; voa com o `projectile`
      seq(jfx, s, h.x, h.y - 0.2, now, [['01', 0, 120], ['02', 100, 140]]);
      return true;
    }
    case 'heal_onda': {   // Onda Anestésica: a gota, o anel que cresce com bolhas, a onda larga, ela se parte, as bolhas
      const sc = (info.radius ?? 3) / 3;
      seq(jfx, s, h.x, h.y, now, [['01', 0, 110]]);
      seq(jfx, s, msg.x, msg.y + 0.1, now, [['02', 90, 150], ['03', 220, 180], ['04', 380, 230], ['05', 590, 260], ['06', 830, 500, { fadeOut: 330 }]],
        { scale: sc, layer: 'ground' });
      return true;
    }
    case 'heal_meridianos': {   // Selo dos Meridianos: o selo nasce na mão, os fios vão até o alvo e queimam o chakra dele
      const d = Math.max(0.8, Math.hypot(at.x - h.x, at.y - h.y));
      const a = Math.atan2(at.y - h.y, at.x - h.x);
      seq(jfx, s, h.x, h.y, now, [['01', 0, 120], ['02', 100, 180], ['03', 260, 200, { angle: a, len: d }], ['04', 440, 220, { angle: a, len: d }]]);
      const o = onBody(atId);
      seq(jfx, s, o ? 0 : at.x, o ? -0.5 : at.y - 0.5, now, [['05', 620, 260], ['06', 860, 450, { fadeOut: 300 }]], o || {});
      return true;
    }
    case 'heal_colosso': {   // Punho do Colosso (o punho junta força na conjuração): desce, afunda o chão, a cratera
      jfx.drop(`colosso:${msg.playerId}`);
      const p = msg.tx !== undefined ? at : { x: h.x + msg.fx * 1.2, y: h.y + msg.fy * 1.2 };
      const sc = (info.radius ?? 2) / 2;
      seq(jfx, s, p.x, p.y + 0.8, now, [['02', 0, 120], ['03', 110, 170, { flicker: true }], ['04', 260, 220, { flicker: true }]], { scale: sc });
      seq(jfx, s, p.x, p.y, now, [['05', 460, 280], ['06', 720, 900, { layer: 'ground', fadeOut: 600 }]], { scale: sc });
      return true;
    }
    case 'heal_4': {   // Renovação Celular (as células giram na conjuração): os anéis abrem e pulsam enquanto a cura dura
      jfx.drop(`renova:${msg.playerId}`);
      const dur = info.durationMs ?? 10_000;
      const o = { follow: () => follow(msg.playerId), tag: `renova:${msg.playerId}` };
      const steps = [['02', 0, 200], ['03', 180, 260], ['04', 420, 300]];
      for (let t = 900; t < dur - 400; t += 1200) steps.push(['05', t, 700, { fadeIn: 200, fadeOut: 300 }]);
      steps.push(['06', dur - 400, 600, { fadeOut: 400 }]);
      seq(jfx, s, 0, -0.5, now, steps, o);
      return true;
    }
    case 'heal_disturbio': {   // Descontrole Muscular: o redemoinho no alvo, o selo pulsa enquanto ele anda ao contrário, estoura
      const dur = info.invertMs ?? 1600;
      const id = atId;
      const o = id ? { follow: () => follow(id), tag: `disturbio:${id}` } : {};
      if (id) jfx.drop(`disturbio:${id}`);
      const steps = [['01', 0, 130], ['02', 110, 200]];
      for (let t = 300, i = 0; t < dur; t += 240, i++) steps.push([i % 2 ? '04' : '03', t, 280]);
      steps.push(['05', dur, 300], ['06', dur + 280, 480, { fadeOut: 330 }]);
      seq(jfx, s, id ? 0 : at.x, id ? -0.6 : at.y - 0.6, now, steps, o);
      return true;
    }
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

/** Começou a conjuração (selos): o Rugido junta o redemoinho na mão; a Coroa acende o anel no chão; a Palma gira na mão. */
export function fogoCastStart(jfx, msg, p, now, follow) {
  if (!p || !ready(msg.skill)) return;
  const o = (tag) => ({ follow: () => follow(p.id), tag: `${tag}:${p.id}` });
  if (msg.skill === 'fire_rugido') {
    jfx.show('fire_rugido_01', 0.3, -0.45, now, msg.ms, { ...o('rugido'), flicker: true, fadeIn: 200, grow: 0.5 });
  } else if (msg.skill === 'fire_coroa') {
    jfx.show('fire_coroa_01', 0, 0.1, now, msg.ms + 60, { ...o('coroa'), flicker: true, fadeIn: 120, grow: 0.8, layer: 'ground' });
  } else if (msg.skill === 'lightning_3') {
    jfx.show('lightning_3_01', 0.3, -0.35, now, msg.ms + 60, { ...o('investida'), flicker: true, fadeIn: 100, grow: 0.15 });
  } else if (msg.skill === 'lightning_rugido') {
    seq(jfx, 'lightning_rugido', 0.35, -0.35, now, [['01', 0, msg.ms * 0.55], ['02', msg.ms * 0.5, msg.ms * 0.5 + 60]], o('rugidoT'));
  } else if (msg.skill === 'lightning_armadura') {
    jfx.show('lightning_armadura_01', 0, -0.3, now, msg.ms + 60, { ...o('armadura'), flicker: true, fadeIn: 100, grow: 1 });
  } else if (msg.skill === 'heal_colosso') {
    jfx.show('heal_colosso_01', 0.4, -0.6, now, msg.ms + 60, { ...o('colosso'), flicker: true, fadeIn: 120, grow: 0.3 });
  } else if (msg.skill === 'heal_4') {
    jfx.show('heal_4_01', 0, -0.5, now, msg.ms + 80, { ...o('renova'), flicker: true, fadeIn: 200, grow: 0.25 });
  } else if (msg.skill === 'heal_palma') {
    const steps = [['01', 0, 220], ['02', 200, 280], ['03', 460, 280]];
    for (let t = 720; t < msg.ms; t += 360) steps.push(['04', t, 400, { flicker: true }]);
    seq(jfx, 'heal_palma', 0.35, -0.45, now, steps, o('palma'));
  }
}

/** Um projétil saiu: devolve o quadro que voa (ou null). */
export function fogoProjectileFrame(msg) {
  if (msg.skill === 'lightning_shuriken' && ready('lightning_shuriken')) return 'lightning_shuriken_03';
  if (msg.skill === 'lightning_2' && ready('lightning_2')) return 'lightning_2_02b';
  if (msg.skill === 'heal_septica' && ready('heal_septica')) return 'heal_septica_03';
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
  if (skill === 'lightning_shuriken' && ready('lightning_shuriken')) {
    seq(jfx, 'lightning_shuriken', msg.x, msg.y - 0.3, now, [['05', 0, 260, { flicker: true }], ['06', 230, 450, { fadeOut: 300 }]]);
    return true;
  }
  if (skill === 'lightning_2' && ready('lightning_2')) {
    seq(jfx, 'lightning_2', msg.x, msg.y - 0.3, now, [['05b', 0, 220, { flicker: true }], ['06', 180, 450, { scale: 0.3, fadeOut: 300 }]]);
    return true;
  }
  if (skill === 'heal_septica' && ready('heal_septica')) {
    seq(jfx, 'heal_septica', msg.x, msg.y - 0.3, now, [['04', 0, 200, { flicker: true }], ['05', 180, 240]]);
    seq(jfx, 'heal_septica', msg.x, msg.y + 0.2, now, [['06', 400, 1100, { layer: 'ground', fadeOut: 700 }]]);
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

/** Aviso ou zona no chão (mensagem `ground`): Cinzas Detonantes, Chão Incandescente, cada meteoro e a Coluna Infernal. */
export function fogoGround(jfx, msg, now, follow = () => null) {
  if (msg.skill === 'lightning_rede' && msg.kind !== 'aviso' && ready('lightning_rede')) {
    // Rede de Faíscas: a rede elétrica no chão, tremendo enquanto a zona dura
    const ms = msg.ms ?? 3000, sc = (msg.r ?? 2.5) / 2.5;
    // duas camadas: a rede firme no chão e a mesma por cima piscando (as faíscas correndo)
    seq(jfx, 'lightning_rede', msg.x, msg.y, now, [['01', 0, ms, { layer: 'ground', fadeIn: 200, fadeOut: 350, scale: sc }]]);
    for (let t = 0; t < ms - 150; t += 300) seq(jfx, 'lightning_rede', msg.x, msg.y, now, [['01', t, 180, { flicker: true, fadeIn: 40, fadeOut: 120, scale: sc }]]);
    return true;
  }
  // zonas de Cura: em volta de quem lançou (o Santuário anda com ele)
  if (['heal_3', 'heal_milagre', 'heal_santuario'].includes(msg.skill) && msg.kind !== 'aviso' && ready(msg.skill)) {
    const ms = msg.ms ?? 4000, s = msg.skill;
    const o = msg.follow ? { follow: () => follow(msg.follow) } : {};
    const x0 = msg.follow ? 0 : msg.x, y0 = msg.follow ? 0 : msg.y;
    if (s === 'heal_3') {   // Regeneração de Área: o círculo, o redemoinho, o selo com brotos pulsando, o selo apagando
      const sc = (msg.r ?? 4) / 4;
      const steps = [['01', 0, 200], ['04', 180, 300, { flicker: true }]];
      const loop = ['02', '03', '05', '03'];
      for (let t = 460, i = 0; t < ms - 300; t += 330, i++) steps.push([loop[i % 4], t, 380]);
      steps.push(['06', ms - 300, 700, { fadeOut: 450 }]);
      seq(jfx, s, x0, y0, now, steps, { ...o, scale: sc, layer: 'ground' });
    } else if (s === 'heal_milagre') {   // Milagre Verde: a semente, a flor, a explosão de luz, as folhas caindo, o brilho
      const sc = (msg.r ?? 4) / 4;
      seq(jfx, s, x0, y0 - 0.5, now, [['01', 0, 100], ['02', 90, 160], ['03', 230, 260, { flicker: true }], ['04', 470, 380],
        ['05', 820, 300], ['06', 1080, 520, { fadeOut: 350 }]], { ...o, scale: sc });
    } else {   // Santuário Vital: o selo no chão, as linhas douradas, a cúpula fica enquanto a zona dura, as runas, se desfaz
      const sc = (msg.r ?? 2.5) / 2.5;
      const steps = [['01', 0, 220], ['02', 200, 260]];
      for (let t = 440, i = 0; t < ms - 350; t += 420, i++) steps.push([i % 4 === 2 ? '04' : i % 2 ? '05' : '03', t, 470]);
      steps.push(['06', ms - 350, 700, { fadeOut: 450 }]);
      seq(jfx, s, x0, y0 + 0.2, now, steps, { ...o, scale: sc });
    }
    return true;
  }
  if (msg.skill === 'fire_4' && msg.kind === 'aviso' && ready('fire_4')) {
    // um meteoro por aviso: a marca vermelha no chão, ele cai do céu no fim do aviso, explode e deixa a cratera
    const ms = msg.ms ?? 800, sc = (msg.r ?? 1.3) / 1.3, fall = Math.min(420, ms * 0.6), h = 5;
    seq(jfx, 'fire_4', msg.x, msg.y, now, [['01b', 0, ms, { layer: 'ground', fadeIn: 120 }]]);
    jfx.launch(`met:${msg.id}`, 'fire_4_04b', msg.x, msg.y - h, 0, 1, h / (fall / 1000), h, now + ms - fall, 0);
    seq(jfx, 'fire_4', msg.x, msg.y, now, [['05b', ms, 300, { scale: sc, flicker: true }], ['06b', ms + 240, 1100, { scale: sc, layer: 'ground', fadeOut: 700 }]]);
    return true;
  }
  if (msg.skill === 'lightning_ceu' && msg.kind === 'aviso' && ready('lightning_ceu')) {
    // um raio por aviso: a marca vermelha, o anel azul acende, o raio cai do céu no fim, o estouro e a fumaça
    const ms = msg.ms ?? 800, sc = (msg.r ?? 1.3) / 1.3, fall = Math.min(220, ms * 0.35), h = 5;
    seq(jfx, 'lightning_ceu', msg.x, msg.y, now, [['01b', 0, ms, { layer: 'ground', fadeIn: 120 }], ['02b', ms * 0.45, ms * 0.55, { layer: 'ground', flicker: true }]]);
    jfx.launch(`ceu:${msg.id}`, 'lightning_ceu_03b', msg.x, msg.y - h, 0, 1, h / (fall / 1000), h, now + ms - fall, 0);
    seq(jfx, 'lightning_ceu', msg.x, msg.y + 0.2, now, [['05b', ms, 260, { scale: sc, flicker: true }], ['06b', ms + 220, 800, { scale: sc, fadeOut: 500 }]]);
    return true;
  }
  if (msg.skill === 'lightning_4' && msg.kind === 'aviso' && ready('lightning_4')) {
    // Julgamento do Trovão: o anel vermelho avisa, a faísca junta, no fim o raio do céu cai, estoura em domo e deixa a cratera
    const ms = msg.ms ?? 1000, sc = (msg.r ?? 3.5) / 3.5;
    seq(jfx, 'lightning_4', msg.x, msg.y, now, [['01', 0, ms * 0.55, { layer: 'ground', fadeIn: 120 }], ['02', ms * 0.5, ms * 0.5, { layer: 'ground', flicker: true }],
      ['03', ms - 120, 200, { flicker: true }], ['04', ms + 60, 220, { flicker: true }], ['05', ms + 260, 300], ['06', ms + 540, 1100, { fadeOut: 700 }]], { scale: sc });
    return true;
  }
  if (msg.skill === 'fire_coluna' && msg.kind === 'aviso' && ready('fire_coluna')) {
    // o anel avisa, a brasa acende no meio, a chama nasce; no fim do aviso a coluna sobe, estoura e vira fumaça
    const ms = msg.ms ?? 900, sc = (msg.r ?? 2.5) / 2.5;
    seq(jfx, 'fire_coluna', msg.x, msg.y, now, [['01', 0, ms * 0.42, { layer: 'ground', fadeIn: 100 }], ['02', ms * 0.38, ms * 0.4, { layer: 'ground' }],
      ['03', ms * 0.74, ms * 0.3, { flicker: true }], ['04', ms, 280, { flicker: true }], ['05', ms + 240, 320, { flicker: true }],
      ['06', ms + 520, 900, { fadeOut: 600 }]], { scale: sc });
    return true;
  }
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
