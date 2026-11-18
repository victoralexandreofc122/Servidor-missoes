/*
 * v78: as CAMADAS que complementam as animações desenhadas pelo Victor (os 50 jutsus de Fogo, Cura e Relâmpago).
 *
 * A folha do Victor é a base e continua igual (fogoAnim.js e o castSprites do game.js); aqui entram, por cima ou por
 * baixo dela, efeitos do PixelFX recoloridos com as cores das folhas (public/vfxCamadas.js, gerado por
 * arte/pixelfx/camadas.mjs): a carga na mão durante os selos, o anel de fogo que corre no chão, a poeira do impacto,
 * as brasas que sobem, as cruzes da cura, as faíscas que estalam, o choque no alvo. Cada jutsu tem a sua coreografia,
 * no tempo dos quadros dele.
 *
 * SÓ VISUAL: nada muda no servidor. Só toca quando a folha do jutsu carregou (sem ela o jogo usa o desenho antigo, e as
 * camadas não entram por cima dele); camada que não carregou simplesmente não aparece.
 */
import { jutsuSpritesReady } from './vfxJutsus.js';

/** Os 4 jutsus de Fogo da v56 usam a folha pelo nome do desenho, não pelo id do jutsu. */
const BASE = { fire: 'fogo', fire_endan: 'sopro', fire_kasumi: 'nevoa', fire_hibashiri: 'linha' };
const ready = (skill) => !!skill && jutsuSpritesReady(BASE[skill] ?? skill);
/** O elemento da camada pelo prefixo do jutsu (fire_, heal_, lightning_). */
const elOf = (skill) => (/^heal/.test(skill) ? 'cura' : /^lightning/.test(skill) ? 'raio' : /^stone/.test(skill) ? 'pedra' : 'fogo');

// Raio de cada camada em casas (para casar com a área do servidor): o anel de fogo corre 92 px, o de cura, o estalo do
// trovão e a poeira 104 px; as runas têm ~2 casas; brasas, cruzes e faíscas se espalham ~0,6 casa (× 0,035 casa/px).
const R = { anelFogo: 3.2, anelCura: 3.64, estalo: 3.64, poeira: 3.64, runas: 2, brasas: 0.63, cruzes: 0.56, faiscas: 0.53, chao: 2.1 };

/** Ida e Volta: onde ficou a runa de cada ninja (para o estalo da volta cair nela). */
const VOLTA = new Map();
/** Um pouco à frente da mão de quem lançou (em casas), como no fogoAnim.js. */
const hand = (msg, d = 0.35) => ({ x: msg.x + msg.fx * d, y: msg.y + msg.fy * d - 0.15 });

/** Os selos (mensagem `cast_start`): a carga do elemento junta na mão enquanto a barra enche. */
export function camadasCastStart(jfx, msg, p, now, follow) {
  if (!p || !ready(msg.skill)) return false;
  const el = elOf(msg.skill);
  const tag = `carga:${p.id}`;
  jfx.drop(tag);
  return jfx.layer(`pfx_${el}_carga`, 0.3, -0.45, now, { ms: (msg.ms ?? 500) + 80, follow: () => follow(p.id), tag, scale: 0.55, fadeIn: 120, fadeOut: 80 });
}

/** O jutsu foi lançado (mensagem `cast`), com os mesmos dados que o fogoAnim.fogoCast recebe. */
export function camadasCast(jfx, msg, info, lineEnd, now, follow, whoAt = () => null, near = () => []) {
  const s = msg.skill;
  if (!ready(s)) return false;
  jfx.drop(`carga:${msg.playerId}`);   // a carga dos selos se desfaz quando o golpe sai
  const L = (name, x, y, at, o = {}) => jfx.layer(name, x, y, now + at, o);
  const angle = Math.atan2(msg.fy, msg.fx);
  const h = hand(msg);
  const at = msg.tx !== undefined ? { x: msg.tx, y: msg.ty } : { x: msg.x, y: msg.y };
  const atId = msg.tx !== undefined ? whoAt(msg.tx, msg.ty) : msg.playerId;
  /** Em cima de alguém (acompanha) ou parado no ponto, com o deslocamento dy (casas). */
  const on = (id, p, dy = 0) => (id ? { x: 0, y: dy, o: { follow: () => follow(id) } } : { x: p.x, y: p.y + dy, o: {} });
  const along = (x0, y0, x1, y1, n, fn) => { for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; fn(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, i); } };
  const brasas = (x, y, t0, ms, scale = 1, o = {}) => L('pfx_fogo_brasas', x, y, t0, { ms, scale, ...o });
  switch (s) {
    // ------------------------------------------------------------------ Fogo
    case 'fire':   // Fogo: um sopro de carga na mão quando a bola sai (o estouro vem no impacto)
      return L('pfx_fogo_carga', h.x - 0.1, h.y, 0, { ms: 220, scale: 0.45, rate: 2 });
    case 'fire_endan': {   // Sopro Incinerador: faísca na boca do cone e brasas no chão onde o cone queimou
      const sc = (info.range ?? 3) / 3;
      L('pfx_fogo_faisca', h.x, h.y, 60, { angle, scale: 0.6 });
      for (const d of [1.2, 2.1]) brasas(h.x + msg.fx * d * sc, h.y + msg.fy * d * sc + 0.3, 420, 1300, sc * 1.1);
      return true;
    }
    case 'fire_hibashiri': {   // Linha de Fogo Rasante: as brasas sobem atrás das chamas que acendem ao longo da linha
      const len = Math.hypot(lineEnd.tx - msg.x, lineEnd.ty - msg.y), n = Math.max(1, Math.round(len / 1.6));
      along(msg.x, msg.y + 0.35, lineEnd.tx, lineEnd.ty + 0.35, n, (x, y, i) => brasas(x, y, 300 + i * 70, 1400, 1.2));
      return L('pfx_fogo_faisca', lineEnd.tx, lineEnd.ty, 80 + n * 45, { angle, scale: 0.7 });
    }
    case 'fire_2':   // Revoada de Brasas: o estalo na mão quando as bolas saem
      return L('pfx_fogo_faisca', h.x, h.y, 80, { angle, scale: 0.7 });
    case 'fire_ryuka':   // Lança de Fogo: a ponta estoura com faísca, um anel curto no chão e brasas
      L('pfx_fogo_faisca', lineEnd.tx, lineEnd.ty, 360, { angle });
      L('pfx_fogo_anel', lineEnd.tx, lineEnd.ty + 0.2, 380, { scale: 1.3 / R.anelFogo, rate: 1.6, layer: 'ground' });
      return brasas(lineEnd.tx, lineEnd.ty + 0.2, 560, 1200, 1.1);
    case 'fire_lamina': {   // Lâmina de Fogo: brasas soltando da lâmina enquanto o buff dura (sai junto com a lâmina)
      const dur = info.durationMs ?? 5000;
      return brasas(msg.fx * 0.35, 0.1, 330, dur - 330, 1.3, { follow: () => follow(msg.playerId), tag: `lamina:${msg.playerId}` });
    }
    case 'fire_marca':   // Marca Incandescente: o fio acerta e espirra faísca (o selo e as brasas vêm na `combo`)
      return L('pfx_fogo_faisca', lineEnd.tx, lineEnd.ty - 0.4, 200, { angle, scale: 0.8 });
    case 'fire_3': {   // Varredura Flamejante: o anel de calor corre por baixo do leque e deixa brasas
      const sc = (info.range ?? 5) / 5;
      L('pfx_fogo_anel', h.x + msg.fx * 1.6 * sc, h.y + msg.fy * 1.6 * sc + 0.3, 120, { scale: (2.2 * sc) / R.anelFogo, rate: 1.5, layer: 'ground' });
      for (const [d, side] of [[1.6, 0], [2.8, 0.9], [2.8, -0.9], [3.8, 0]]) {
        const x = h.x + (msg.fx * d - msg.fy * side) * sc, y = h.y + (msg.fy * d + msg.fx * side) * sc + 0.3;
        brasas(x, y, 520 + d * 40, 1300, 1.2 * sc);
      }
      return true;
    }
    case 'fire_cometa': {   // Cometa Rasteiro: poeira e faísca onde parou, brasas no rastro
      if (msg.tx === undefined) return false;
      const a = Math.atan2(msg.ty - msg.y, msg.tx - msg.x), d = Math.hypot(msg.tx - msg.x, msg.ty - msg.y);
      L('pfx_poeira', msg.tx, msg.ty + 0.2, 220, { scale: 1.4 / R.poeira });
      L('pfx_fogo_faisca', msg.tx, msg.ty - 0.2, 220, { angle: a });
      along(msg.x, msg.y + 0.2, msg.tx, msg.ty + 0.2, Math.max(1, Math.round(d / 1.5)), (x, y, i) => brasas(x, y, 360 + i * 40, 1100, 1));
      return true;
    }
    case 'fire_rugido': {   // Rugido da Fornalha: brasas ao longo do raio e o anel no chão onde ele estoura
      const len = Math.hypot(lineEnd.tx - h.x, lineEnd.ty - h.y);
      along(h.x, h.y + 0.3, lineEnd.tx, lineEnd.ty + 0.3, Math.max(1, Math.round(len / 1.8)), (x, y, i) => brasas(x, y, 260 + i * 50, 1200, 1.3));
      L('pfx_fogo_anel', lineEnd.tx, lineEnd.ty + 0.2, 470, { scale: 1.6 / R.anelFogo, rate: 1.5, layer: 'ground' });
      return L('pfx_fogo_faisca', lineEnd.tx, lineEnd.ty, 470, { angle });
    }
    case 'fire_coroa': {   // Coroa de Chamas: o anel de fogo corre no chão até a borda e as brasas ficam
      const r = info.radius ?? 3.5;
      L('pfx_fogo_anel', msg.x, msg.y + 0.1, 200, { scale: r / R.anelFogo, rate: 1.25, layer: 'ground' });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        brasas(msg.x + Math.cos(a) * r * 0.7, msg.y + 0.1 + Math.sin(a) * r * 0.45, 760 + i * 30, 1500, 1.2);
      }
      return true;
    }
    // ------------------------------------------------------------------ Cura
    case 'heal':
    case 'heal_desintox':
    case 'heal_palma': {   // Cura, Desintoxicação, Palma: a luz sobe pelo corpo de quem foi curado e as cruzes ficam
      const p = on(atId, at, 0.15);
      L('pfx_cura_corpo', p.x, p.y, s === 'heal_palma' ? 0 : 120, { ...p.o, scale: 0.9 });
      return L('pfx_cura_cruzes', p.x, p.y, s === 'heal_palma' ? 400 : 500, { ...p.o, ms: 1300 });
    }
    case 'heal_bisturi':   // Corte Cirúrgico: o bisturi acende com um corte de luz verde
      return L('pfx_cura_faisca', h.x, h.y - 0.2, 300, { angle, scale: 0.6 });
    case 'heal_agulha': {   // Agulha Calmante: a agulha crava com uma faísca verde na direção em que voou
      const d = Math.max(0.6, Math.hypot(at.x - h.x, at.y - h.y)), a = Math.atan2(at.y - h.y, at.x - h.x);
      const p = on(atId, at, -0.5);
      return L('pfx_cura_faisca', p.x, p.y, 160 + (d / 24) * 1000, { ...p.o, angle: a, scale: 0.7 });
    }
    case 'heal_casca': {   // Casca de Chakra: as cruzes sobem dentro da bolha enquanto o escudo dura
      const dur = info.durationMs ?? 3000, id = atId ?? msg.playerId;
      return L('pfx_cura_cruzes', 0, 0.1, 220, { ms: dur - 220, follow: () => follow(id), tag: `casca:${id}` });
    }
    case 'heal_disturbio': {   // Descontrole Muscular: o golpe de chakra no alvo
      const p = on(atId, at, -0.6);
      return L('pfx_cura_faisca', p.x, p.y, 60, { ...p.o, angle, scale: 0.8 });
    }
    case 'heal_2': {   // Punho Sísmico: a erupção levanta poeira e o anel verde corre no chão
      const p = msg.tx !== undefined ? at : { x: h.x + msg.fx, y: h.y + msg.fy };
      const r = info.radius ?? 1.5;
      L('pfx_poeira', p.x, p.y + 0.3, 300, { scale: (r * 1.2) / R.poeira });
      return L('pfx_cura_anel', p.x, p.y + 0.3, 300, { scale: r / R.anelCura, rate: 1.8, layer: 'ground' });
    }
    case 'heal_banho': {   // Banho de Chakra: a luz sobe pelo corpo quando a coluna cai, e as cruzes no fim
      const p = on(atId, at, 0.15);
      L('pfx_cura_corpo', p.x, p.y, 300, { ...p.o, scale: 1 });
      return L('pfx_cura_cruzes', p.x, p.y, 720, { ...p.o, ms: 1400 });
    }
    case 'heal_septica':   // Lâmina Séptica: o brilho verde na mão quando a lâmina sai
      return L('pfx_cura_carga', h.x - 0.1, h.y, 0, { ms: 240, scale: 0.4, rate: 2 });
    case 'heal_onda':   // Onda Anestésica: o anel verde rola junto com a onda, com as cruzinhas brotando
      return L('pfx_cura_anel', msg.x, msg.y + 0.1, 60, { scale: (info.radius ?? 3) / R.anelCura, rate: 1.3, layer: 'ground' });
    case 'heal_meridianos': {   // Selo dos Meridianos: os fios queimam o chakra do alvo com uma faísca
      const p = on(atId, at, -0.5);
      return L('pfx_cura_faisca', p.x, p.y, 600, { ...p.o, angle: Math.atan2(at.y - h.y, at.x - h.x), scale: 0.8 });
    }
    case 'heal_colosso': {   // Punho do Colosso: o chão afunda: poeira grande e o anel verde
      const p = msg.tx !== undefined ? at : { x: h.x + msg.fx * 1.2, y: h.y + msg.fy * 1.2 };
      const r = info.radius ?? 2;
      L('pfx_poeira', p.x, p.y + 0.2, 440, { scale: (r * 1.3) / R.poeira });
      return L('pfx_cura_anel', p.x, p.y + 0.2, 460, { scale: r / R.anelCura, rate: 1.6, layer: 'ground' });
    }
    case 'heal_4': {   // Renovação Celular: as cruzes sobem enquanto a cura dura
      const dur = info.durationMs ?? 10_000;
      return L('pfx_cura_cruzes', 0, 0.1, 300, { ms: dur - 300, follow: () => follow(msg.playerId), tag: `renova:${msg.playerId}`, alpha: 0.85 });
    }
    // ------------------------------------------------------------------ Relâmpago
    case 'lightning_corrente':   // Corrente Rasteira: o choque onde a corrente estoura e faíscas no chão
      L('pfx_raio_choque', lineEnd.tx, lineEnd.ty - 0.1, 440, { angle });
      return L('pfx_raio_faiscas', lineEnd.tx, lineEnd.ty + 0.2, 460, { ms: 800, scale: 1.2 });
    case 'lightning_impulso': {   // Impulso Estático: faíscas na saída, o estalo na chegada
      const d = info.dash ?? 4, end = { x: msg.x + msg.fx * d, y: msg.y + msg.fy * d };
      L('pfx_raio_faiscas', msg.x, msg.y + 0.2, 0, { ms: 450 });
      return L('pfx_raio_estalo', end.x, end.y + 0.2, 300, { scale: 1.3 / R.estalo });
    }
    case 'lightning_shuriken':   // Shuriken do Trovão: estala na mão quando sai (o choque vem no impacto)
      return L('pfx_raio_faiscas', h.x, h.y + 0.3, 0, { ms: 300, scale: 0.6 });
    case 'lightning_fluxo':   // Descarga Envolvente: o trovão estoura em volta, do tamanho da área
      return L('pfx_raio_estalo', msg.x, msg.y + 0.1, 150, { scale: (info.radius ?? 2) / R.estalo });
    case 'lightning_2':   // Farpas de Trovão: o estalo na mão quando os raios se abrem
      return L('pfx_raio_carga', h.x - 0.1, h.y, 0, { ms: 240, scale: 0.45, rate: 2 });
    case 'lightning_volta': {   // Ida e Volta: faíscas na runa marcada (somem com ela); na volta, o estalo na chegada
      const tag = `volta:${msg.playerId}`;
      if (jfx.list.some((x) => x.tag === tag)) {   // 1º uso: o fogoAnim acabou de marcar a runa
        VOLTA.set(msg.playerId, { x: msg.x, y: msg.y });
        return L('pfx_raio_faiscas', msg.x, msg.y + 0.2, 100, { ms: info.returnMs ?? 4000, tag, scale: 0.8, alpha: 0.85 });
      }
      const mark = VOLTA.get(msg.playerId);
      VOLTA.delete(msg.playerId);
      if (!mark) return false;
      L('pfx_raio_choque', msg.x, msg.y - 0.4, 0, { angle: Math.atan2(mark.y - msg.y, mark.x - msg.x), scale: 0.8 });
      return L('pfx_raio_estalo', mark.x, mark.y + 0.2, 180, { scale: 1.2 / R.estalo });
    }
    case 'lightning_raio': {   // Lança Saltadora: o choque no 1º alvo e, se saltou, no 2º
      const t1 = { x: lineEnd.tx, y: lineEnd.ty };
      L('pfx_raio_choque', t1.x, t1.y - 0.4, 180, { angle });
      const first = whoAt(t1.x, t1.y), second = first ? near(t1.x, t1.y, t1.x, t1.y, 4.5, [first, msg.playerId])[0] : null;
      const p2 = second ? follow(second) : null;
      if (p2) L('pfx_raio_choque', p2.x, p2.y - 0.4, 640, { angle: Math.atan2(p2.y - t1.y, p2.x - t1.x) });
      return true;
    }
    case 'lightning_correntes': {   // Correntes de Raio: a corrente dá choque em quem prende e faísca enquanto segura
      const hit = near(h.x, h.y, lineEnd.tx, lineEnd.ty, 1.2, [msg.playerId]).slice(0, info.targets ?? 2);
      const root = info.rootMs ?? 1300;
      for (const id of hit) {
        L('pfx_raio_choque', 0, -0.45, 340, { follow: () => follow(id), angle, tag: `correntes:${id}` });
        L('pfx_raio_faiscas', 0, 0.1, 400, { ms: root, follow: () => follow(id), tag: `correntes:${id}`, scale: 0.9 });
      }
      return true;
    }
    case 'lightning_3':   // Investida Elétrica: o estalo onde o cometa parou
    case 'lightning_risco': {   // Risco de Luz: o choque na ponta do risco e o estalo no fim
      if (msg.tx === undefined) return false;
      const a = Math.atan2(msg.ty - msg.y, msg.tx - msg.x);
      if (s === 'lightning_3') L('pfx_raio_estalo', msg.tx, msg.ty + 0.2, 340, { scale: 1.4 / R.estalo });
      else { L('pfx_raio_choque', msg.tx, msg.ty - 0.3, 440, { angle: a }); L('pfx_raio_estalo', msg.tx, msg.ty + 0.2, 600, { scale: 1 / R.estalo }); }
      return L('pfx_raio_faiscas', msg.tx, msg.ty + 0.2, 400, { ms: 600 });
    }
    case 'lightning_maos': {   // Mãos de Trovão: faíscas estalando no corpo enquanto o buff dura
      const dur = info.durationMs ?? 5000;
      return L('pfx_raio_faiscas', 0, 0.1, 220, { ms: dur - 220, follow: () => follow(msg.playerId), tag: `maos:${msg.playerId}`, scale: 1.3 });
    }
    case 'lightning_rugido': {   // Rugido do Trovão: choques ao longo do feixe e o estalo no fim
      const len = Math.hypot(lineEnd.tx - h.x, lineEnd.ty - h.y);
      along(h.x, h.y, lineEnd.tx, lineEnd.ty, Math.max(1, Math.round(len / 2.4)), (x, y, i) => L('pfx_raio_choque', x, y, 60 + i * 60, { angle, scale: 0.7 }));
      return L('pfx_raio_estalo', lineEnd.tx, lineEnd.ty + 0.2, 300, { scale: 1.6 / R.estalo });
    }
    case 'lightning_armadura': {   // Armadura Relampejante: o trovão estoura na área e as faíscas ficam na armadura
      const dur = info.durationMs ?? 5000, tag = `armadura:${msg.playerId}`;
      L('pfx_raio_estalo', 0, 0.1, 260, { follow: () => follow(msg.playerId), scale: (info.radius ?? 2.5) / R.estalo, tag });
      return L('pfx_raio_faiscas', 0, 0.1, 600, { ms: dur - 600, follow: () => follow(msg.playerId), tag, scale: 1.4 });
    }
    // ------------------------------------------------------------------ Pedra (v79)
    case 'stone':   // Pedra e Coração de Montanha: o chão afunda quando as pedras se juntam
    case 'stone_4':
      return L('pfx_pedra_chao', msg.x, msg.y + 0.1, 250, { scale: 0.45 });
    case 'stone_resposta':   // Resposta da Montanha: o chão afunda quando a guarda sobe
      return L('pfx_pedra_chao', msg.x, msg.y + 0.1, 250, { scale: 0.45 });
    case 'stone_couraca': {   // Couraça Mineral: o chão afunda e a poeira sobe da couraça enquanto ela dura
      const dur = info.durationMs ?? 4000, o = { follow: () => follow(msg.playerId), tag: `couraca:${msg.playerId}` };
      L('pfx_pedra_chao', msg.x, msg.y + 0.1, 260, { scale: 0.5 });
      return L('pfx_pedra_poeira', 0, 0.1, 300, { ...o, ms: dur - 300, scale: 1.4, alpha: 0.85 });
    }
    case 'stone_pilares': {   // Prisão de Pilares: o chão afunda quando os pilares sobem e a poeira sai quando desmancham
      const p = on(atId && atId !== msg.playerId ? atId : null, at, 0.2);
      L('pfx_pedra_chao', p.x, p.y, 290, { ...p.o, scale: 0.6 });
      return L('pfx_poeira', p.x, p.y, 280 + (info.rootMs ?? 1600), { ...p.o, scale: 0.4 });
    }
    case 'stone_rocha':   // Projétil de Rocha e Chuva de Cascalho: o brilho âmbar na mão quando a pedra sai
    case 'stone_cascalho':
      return L('pfx_pedra_carga', h.x - 0.1, h.y, 0, { ms: 220, scale: 0.45, rate: 2 });
    case 'stone_punho': {   // Punho de Rocha: poeira soltando do punho enquanto o buff dura
      const dur = info.durationMs ?? 5000;
      return L('pfx_pedra_poeira', msg.fx * 0.4, 0, 400, { ms: dur - 400, follow: () => follow(msg.playerId), tag: `punho:${msg.playerId}`, scale: 1.1 });
    }
    case 'stone_pisao': {   // Pisão da Montanha: o chão afunda e a poeira rola até a borda da área
      const r = info.radius ?? 2.5;
      L('pfx_pedra_chao', msg.x, msg.y + 0.1, 60, { scale: r / R.chao });
      return L('pfx_poeira', msg.x, msg.y + 0.1, 200, { scale: r / R.poeira });
    }
    case 'stone_toupeira':   // Escavação Furtiva: o chão afunda na saída e a poeira sobe onde ela estoura
    case 'stone_carga': {   // Carga do Rochedo: o chão afunda na saída e a poeira sobe onde o rochedo quebra
      if (msg.tx === undefined) return false;
      L('pfx_pedra_chao', msg.x, msg.y + 0.2, s === 'stone_toupeira' ? 0 : 230, { scale: 0.55 });
      return L('pfx_poeira', msg.tx, msg.ty + 0.2, s === 'stone_toupeira' ? 540 : 500, { scale: 1.4 / R.poeira });
    }
    case 'stone_muralha':   // Muralha de Terra: a poeira sobe onde o muro rompe o chão
      if (msg.tx === undefined) return false;
      return L('pfx_poeira', msg.tx, msg.ty + 0.2, 280, { scale: 1.3 / R.poeira, alpha: 0.8 });
    case 'stone_golem': {   // Golem de Terra Titânico: a poeira quando ele sobe das pedras e o chão afunda quando ele ruge
      const p = { x: msg.x + msg.fx * 1.5, y: msg.y + msg.fy * 1.5 };
      L('pfx_poeira', p.x, p.y + 0.2, 380, { scale: 1.4 / R.poeira });
      return L('pfx_pedra_chao', p.x, p.y + 0.3, 640, { scale: 0.9 });
    }
    default:
      return false;
  }
}

/** O projétil bateu (mensagem `impact`): a faísca, o choque ou o estouro do elemento. */
export function camadasImpact(jfx, msg, skill, now, dir = null) {
  if (!ready(skill)) return false;
  const angle = dir ? Math.atan2(dir.fy, dir.fx) : 0;
  const L = (name, x, y, at, o = {}) => jfx.layer(name, x, y, now + at, o);
  switch (skill) {
    case 'fire':
    case 'fire_hotan': {   // Fogo e Projétil Dracônico: o anel de fogo corre no chão do tamanho da explosão, poeira e brasas
      const r = msg.r > 0 ? msg.r : 1;
      L('pfx_fogo_anel', msg.x, msg.y + 0.3, 0, { scale: r / R.anelFogo, rate: 1.4, layer: 'ground' });
      if (skill === 'fire_hotan') L('pfx_poeira', msg.x, msg.y + 0.3, 40, { scale: (r * 1.1) / R.poeira, alpha: 0.85 });
      return L('pfx_fogo_brasas', msg.x, msg.y + 0.3, 300, { ms: 1100, scale: Math.max(1, r / 1.4) });
    }
    case 'fire_2':   // Revoada de Brasas: cada bola espirra faísca
      return L('pfx_fogo_faisca', msg.x, msg.y, 0, { angle, scale: 0.7 });
    case 'heal_septica':   // Lâmina Séptica: o corte verde
      return L('pfx_cura_faisca', msg.x, msg.y - 0.3, 0, { angle, scale: 0.8 });
    case 'lightning_shuriken':   // Shuriken do Trovão: o choque e faíscas
      L('pfx_raio_choque', msg.x, msg.y - 0.3, 0, { angle });
      return L('pfx_raio_faiscas', msg.x, msg.y + 0.2, 80, { ms: 450, scale: 0.8 });
    case 'stone_rocha':   // Projétil de Rocha: o chão afunda onde a pedra quebra
      return L('pfx_pedra_chao', msg.x, msg.y + 0.1, 0, { scale: 0.45 });
    case 'stone_cascalho':   // Chuva de Cascalho: um pouco de poeira por lasca
      return L('pfx_pedra_chao', msg.x, msg.y + 0.1, 0, { scale: 0.3, alpha: 0.8 });
    case 'lightning_2':   // Farpas de Trovão: um choque pequeno por farpa
      return L('pfx_raio_choque', msg.x, msg.y - 0.3, 0, { angle, scale: 0.6 });
    default:
      return false;
  }
}

/** Aviso ou zona no chão (mensagem `ground`). Os golpes avisados caem em msg.ms: as camadas do impacto já saem marcadas. */
export function camadasGround(jfx, msg, now, follow = () => null) {
  const s = msg.skill;
  if (!ready(s)) return false;
  const ms = msg.ms ?? 1000, r = msg.r ?? 2;
  const L = (name, x, y, at, o = {}) => jfx.layer(name, x, y, now + at, o);
  const aviso = msg.kind === 'aviso';
  const fol = msg.follow ? { follow: () => follow(msg.follow) } : {};
  const x0 = msg.follow ? 0 : msg.x, y0 = msg.follow ? 0 : msg.y;
  switch (s) {
    case 'fire_kasumi':   // Névoa Inflamável: brasas dentro da névoa; quando acende, o anel de fogo e a poeira
    case 'fire_haiseki': {   // Cinzas Detonantes: brasas nas cinzas; quando detona, o anel de fogo e a poeira
      if (!aviso) return false;
      L('pfx_fogo_brasas', msg.x, msg.y, 0, { ms, scale: (r * 0.7) / R.brasas, layer: 'ground', alpha: 0.8, fadeIn: 200 });
      L('pfx_fogo_anel', msg.x, msg.y, ms - 40, { scale: r / R.anelFogo, rate: 1.4, layer: 'ground' });
      return L('pfx_poeira', msg.x, msg.y, ms, { scale: (r * 0.9) / R.poeira, alpha: 0.8 });
    }
    case 'fire_4': {   // Chuva de Meteoros: cada meteoro corre um anel de fogo onde cai e deixa brasas (sem poeira: são 5 juntos)
      if (!aviso) return false;
      L('pfx_fogo_anel', msg.x, msg.y, ms, { scale: r / R.anelFogo, rate: 1.5, layer: 'ground' });
      return L('pfx_fogo_brasas', msg.x, msg.y, ms + 400, { ms: 1100, scale: 1.3 });
    }
    case 'fire_coluna':   // Coluna Infernal: brasas juntando no aviso; no fim a coluna de fogo do PixelFX sobe com a dele
      if (!aviso) return false;
      L('pfx_fogo_brasas', msg.x, msg.y, ms * 0.35, { ms: ms * 0.65, scale: (r * 0.5) / R.brasas, layer: 'ground', fadeIn: 200 });
      L('pfx_fogo_pilar', msg.x, msg.y, ms - 500, { scale: r / 2.6, rate: 1.4 });   // o pilar do PixelFX leva 0,55 s para irromper
      return L('pfx_fogo_anel', msg.x, msg.y, ms, { scale: r / R.anelFogo, rate: 1.4, layer: 'ground' });
    case 'fire_chao': {   // Chão Incandescente: o anel corre quando o chão acende e as brasas sobem enquanto a zona dura
      if (aviso) return false;
      const tag = `chao:${msg.id}`;
      L('pfx_fogo_anel', msg.x, msg.y, 0, { scale: r / R.anelFogo, rate: 1.6, layer: 'ground', tag });
      for (const [dx, dy] of [[0, 0], [-0.5, -0.3], [0.5, 0.3], [0.5, -0.3], [-0.5, 0.3]]) {
        L('pfx_fogo_brasas', msg.x + dx * r, msg.y + dy * r, 200, { ms: ms - 200, scale: 1.2, tag });
      }
      return true;
    }
    case 'heal_3':   // Regeneração de Área: o círculo de runas gira no chão e as cruzes sobem enquanto dura
    case 'heal_santuario': {   // Santuário Vital: o mesmo, andando com quem lançou
      if (aviso) return false;
      L('pfx_cura_anel', x0, y0, 0, { ...fol, scale: r / R.anelCura, rate: 1.4, layer: 'ground' });
      L('pfx_cura_runas', x0, y0, 150, { ...fol, ms: ms - 150, scale: r / R.runas, layer: 'ground', alpha: 0.9, fadeIn: 200 });
      return L('pfx_cura_cruzes', x0, y0, 300, { ...fol, ms: ms - 300, scale: Math.max(1, (r * 0.6) / R.cruzes) });
    }
    case 'heal_milagre':   // Milagre Verde: a onda verde corre no chão quando a flor explode, e as cruzes sobem
      if (aviso) return false;
      L('pfx_cura_anel', x0, y0, 220, { ...fol, scale: r / R.anelCura, rate: 1.2, layer: 'ground' });
      return L('pfx_cura_cruzes', x0, y0, 500, { ...fol, ms: 1500, scale: Math.max(1, (r * 0.5) / R.cruzes) });
    case 'lightning_rede': {   // Rede de Faíscas: faíscas estalando em vários pontos da rede enquanto ela dura
      if (aviso) return false;
      const tag = `rede:${msg.id}`;
      for (const [dx, dy] of [[0, 0], [-0.55, -0.25], [0.55, 0.25], [0.5, -0.35], [-0.5, 0.35]]) {
        L('pfx_raio_faiscas', msg.x + dx * r, msg.y + dy * r + 0.2, Math.abs(dx) * 300, { ms: ms - 200, tag, scale: 1.1 });
      }
      return true;
    }
    case 'stone_2':   // Lamaçal Profundo: o chão cede quando a lama aparece
      if (aviso) return false;
      return L('pfx_pedra_chao', msg.x, msg.y, 0, { scale: r / R.chao, layer: 'ground' });
    case 'stone_lancas':   // Lanças da Terra: o chão afunda e a poeira sobe quando as lanças rompem
      if (!aviso) return false;
      L('pfx_pedra_chao', msg.x, msg.y, ms - 40, { scale: r / R.chao });
      return L('pfx_poeira', msg.x, msg.y, ms + 60, { scale: (r * 0.9) / R.poeira, alpha: 0.85 });
    case 'stone_avalanche':   // Avalanche: cada rocha afunda o chão onde cai
      if (!aviso) return false;
      return L('pfx_pedra_chao', msg.x, msg.y, ms, { scale: (r * 1.2) / R.chao });
    case 'lightning_4':   // Julgamento do Trovão: o raio cai e o trovão estoura na área toda, com poeira
      if (!aviso) return false;
      L('pfx_raio_estalo', msg.x, msg.y + 0.1, ms + 40, { scale: r / R.estalo });
      return L('pfx_poeira', msg.x, msg.y + 0.1, ms + 80, { scale: (r * 0.9) / R.poeira, alpha: 0.75 });
    case 'lightning_ceu':   // Céu em Fúria: cada raio que cai estala no chão
      if (!aviso) return false;
      L('pfx_raio_estalo', msg.x, msg.y + 0.1, ms, { scale: (r * 1.1) / R.estalo });
      return L('pfx_raio_faiscas', msg.x, msg.y + 0.2, ms + 200, { ms: 600, scale: 0.9 });
    default:
      return false;
  }
}

/** A Marca Incandescente pegou alguém (combo 'marca'): brasas soltando do selo até detonar ou acabar. */
export function camadasMarca(jfx, id, ms, now, follow) {
  if (!ready('fire_marca')) return false;
  return jfx.layer('pfx_fogo_brasas', 0, 0.05, now + 200, { ms: Math.max(200, ms - 200), follow: () => follow(id), tag: `marca:${id}`, scale: 1.2 });
}

/** A marca detonou: o anel de fogo e a poeira em volta de quem estava marcado (o fogoDetona já tirou as brasas). */
export function camadasDetona(jfx, id, now, follow) {
  if (!ready('fire_marca')) return false;
  const p = follow(id);
  if (!p) return false;
  jfx.layer('pfx_fogo_anel', p.x, p.y + 0.1, now, { scale: 1.4 / R.anelFogo, rate: 1.6, layer: 'ground' });
  return jfx.layer('pfx_fogo_faisca', p.x, p.y - 0.9, now, { scale: 0.8 });
}
