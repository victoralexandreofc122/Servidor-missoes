// Fim de jogo no cliente (v16, docs/endgame.md): vilas, Kage, Posto de Viagem, ranking PvP, renegados, Akatsuki e
// capas. O SERVIDOR (e o banco por trás dele) decide tudo: aqui só se mostra o estado que chega e se PEDE.
//
// Duas partes:
//  - funções puras (testadas no Node): quem é inimigo na tela, o acesso aos mapas para a predição e a capa no boneco;
//  - os painéis (DOM), montados por mountEndgameUI com o que o game.js empresta (send, toast, estado).

import { alliesOf, conflictHostile, priceFactor, relationOf } from './politics.js';

export const VILLAGE_CODES = ['vila_1', 'vila_2', 'vila_3', 'vila_4', 'vila_5'];
/** Cor de cada vila (a mesma da bandana no Criador): capa da vila, chips do painel. */
export const VILLAGE_COLORS = { vila_1: '#3f7d3a', vila_2: '#6b6e73', vila_3: '#4f9cc4', vila_4: '#7a2a3a', vila_5: '#c9822e' };
const RELATION_TEXT = { guerra: 'Guerra', alianca: 'Aliança', neutro: 'Neutro', tregua: 'Trégua', mesma: 'Sua vila' };

/** O módulo está ligado? (`view` = a mensagem `endgame` do servidor) */
export const egOn = (view, module) => !!view && view.modules.includes(module);

const diplomacy = (view) => ({ relations: view?.relations || [], events: view?.events || [] });

/** Nome curto da vila ("Névoa"). */
export function villageName(view, code) {
  return view?.villages?.find((v) => v.code === code)?.name || code;
}

/**
 * Acesso aos mapas para a PREDIÇÃO (a mesma regra do servidor, villages.ts): sem o módulo de vilas, tudo aberto.
 * `faction` = a do próprio jogador (village null = renegado).
 */
export function mapAccess(view, faction, now = Date.now()) {
  if (!egOn(view, 'vilas') || !faction) return undefined;
  return { village: faction.village, allies: alliesOf(faction.village, VILLAGE_CODES, diplomacy(view), now) };
}

/** Fator de preço das lojas para quem é da vila (guerra +10%, aliança −5%). */
export function shopFactor(view, faction, now = Date.now()) {
  if (!egOn(view, 'vilas') || !faction) return 1;
  return priceFactor(faction.village, VILLAGE_CODES, diplomacy(view), now);
}

/**
 * Como desenhar o nome de `p` para `me`: cor (inimigo na Zona em vermelho, aliado em verde), o que vai antes (👑 Kage,
 * ☁ Akatsuki) e a recompensa pela cabeça (renegado, só na Zona). `zone` = está na Zona de Conflito.
 */
export function factionStyle(view, me, p, zone, now = Date.now()) {
  const f = p.faction;
  if (!f || !egOn(view, 'vilas')) return { color: null, prefix: '', bounty: 0 };
  const prefix = `${f.kage ? '👑 ' : ''}${f.akatsuki ? '☁ ' : ''}`;
  let color = null;
  if (zone && me?.faction && p !== me) {
    const hostile = egOn(view, 'pvp') && conflictHostile(
      { village: me.faction.village, akatsuki: !!me.faction.akatsuki }, { village: f.village, akatsuki: !!f.akatsuki }, diplomacy(view), now);
    const rel = relationOf(me.faction.village, f.village, diplomacy(view), now);
    color = hostile ? (rel === 'guerra' || !f.village ? '#ff6a5a' : '#ffb48a') : '#8fe08a';
  } else if (f.village === null) {
    color = '#c9a2ff';                                  // renegado (fora da Zona): violeta
  }
  return { color, prefix, bounty: zone && f.village === null ? f.bounty || 0 : 0 };
}

/**
 * Na Zona de Conflito, `p` é alvo de `me`? A mesma regra do servidor (villages.ts: aliados, trégua e Akatsuki entre si
 * não se batem); acampamento é zona seguro (`safe(x, y)`). O servidor confere de novo a cada golpe.
 */
export function zoneFoe(view, map, me, p, safe) {
  if (!map?.conflict || !egOn(view, 'pvp') || !me?.faction || !p?.faction || p === me || p.dead || me.dead) return false;
  if (safe(me.x, me.y) || safe(p.x, p.y)) return false;
  return conflictHostile({ village: me.faction.village, akatsuki: !!me.faction.akatsuki }, { village: p.faction.village, akatsuki: !!p.faction.akatsuki },
    diplomacy(view), Date.now());
}

// ------------------------------------------------------------------ capa e bandana riscada (no boneco)

/** Cores de cada capa: [pano, sombra, barra]. A capa da vila usa a cor da vila. */
const CAPES = {
  capa_viagem: ['#7a5a3a', '#5a4029', '#c9a46a'],
  manto_kage: ['#eeeae0', '#c9c3b4', '#c8321e'],
  manto_akatsuki: ['#1d1a22', '#0f0d12', '#c8261e'],
  manto_campeao: ['#4b2a7a', '#341c56', '#e8c66a'],
};

function capeColors(cape, village) {
  if (cape === 'capa_vila') {
    const c = VILLAGE_COLORS[village] || '#555';
    return [c, shade(c, -0.25), '#f4ead8'];
  }
  return CAPES[cape] || CAPES.capa_viagem;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return `#${[f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Capa (camada do boneco, v16): presa nos ombros e caindo até perto dos pés, segue a âncora das costas de cada quadro
 * (anda e respira com o boneco). De frente e de lado fica ATRÁS do corpo; de costas, por cima (menos a cabeça).
 * Coordenadas da célula 64x96 do sprite; `ax(x)` já espelha quando o boneco olha para a direita.
 */
export function drawCape(g, cape, village, view, ax, top, s, back) {
  const [cloth, dark, trim] = capeColors(cape, village);
  const bob = back ? back[1] - 62.5 : 0;                 // a âncora das costas sobe e desce com o passo
  const y0 = top + (47 + bob) * s, y1 = top + 88 * s;
  const poly = (pts, color) => {
    g.fillStyle = color;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(ax(x), y) : g.moveTo(ax(x), y)));
    g.closePath();
    g.fill();
  };
  if (view === 'lado') {
    // De lado: um pano atrás das costas (o lado de trás é +x quando o boneco olha para a esquerda).
    poly([[33, y0], [40, y0], [47, y1], [36, y1 + 1 * s]], dark);
    poly([[33, y0], [39, y0], [45, y1 - 1 * s], [35, y1]], cloth);
    poly([[36, y1 - 2.5 * s], [45, y1 - 3 * s], [45.5, y1 - 1 * s], [36, y1]], trim);
    return;
  }
  const w0 = 12, w1 = 17;
  poly([[32 - w0, y0], [32 + w0, y0], [32 + w1, y1], [32 - w1, y1]], dark);
  poly([[33 - w0, y0 + 1 * s], [31 + w0, y0 + 1 * s], [31 + w1, y1 - 1 * s], [33 - w1, y1 - 1 * s]], cloth);
  poly([[32 - w1 + 1, y1 - 4 * s], [32 + w1 - 1, y1 - 4 * s], [32 + w1 - 1, y1 - 1 * s], [32 - w1 + 1, y1 - 1 * s]], trim);
  if (view !== 'costas') return;
  // De costas: o emblema de cada manto.
  const cx = ax(32), cy = top + (64 + bob) * s;
  if (cape === 'manto_akatsuki') {
    for (const [dx, dy] of [[-6, -4], [5, 3], [-3, 10]]) cloud(g, cx + dx * s, cy + dy * s, s);
  } else if (cape === 'manto_kage') {
    g.fillStyle = trim;
    g.font = `900 ${Math.round(9 * s)}px serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('影', cx, cy);
  } else if (cape === 'manto_campeao') {
    g.fillStyle = trim;
    g.beginPath(); g.arc(cx, cy, 4 * s, 0, Math.PI * 2); g.fill();
    g.fillStyle = cloth;
    g.beginPath(); g.arc(cx, cy, 2.2 * s, 0, Math.PI * 2); g.fill();
  } else if (cape === 'capa_vila') {
    g.fillStyle = trim;
    g.beginPath(); g.arc(cx, cy, 3.4 * s, 0, Math.PI * 2); g.fill();
  }
}

/** Nuvem vermelha com contorno branco (Manto da Akatsuki). */
function cloud(g, x, y, s) {
  const blob = (color, grow) => {
    g.fillStyle = color;
    for (const [dx, dy, r] of [[-2.2, 0.4, 1.8], [0, -0.8, 2.3], [2.2, 0.4, 1.8]]) {
      g.beginPath(); g.arc(x + dx * s, y + dy * s, (r + grow) * s, 0, Math.PI * 2); g.fill();
    }
  };
  blob('#f4ead8', 0.6);
  blob('#c8261e', 0);
}

/** Bandana riscada do renegado: um corte escuro em cima do símbolo da vila (de frente e de lado). */
export function drawRenegadeScratch(g, view, ax, top, s) {
  if (view === 'costas') return;
  g.strokeStyle = '#1b1512';
  g.lineWidth = Math.max(1.5, 1.4 * s);
  g.beginPath();
  if (view === 'frente') { g.moveTo(ax(25), top + 22 * s); g.lineTo(ax(39), top + 29 * s); }
  else { g.moveTo(ax(17), top + 22 * s); g.lineTo(ax(25), top + 29 * s); }
  g.stroke();
}

// ------------------------------------------------------------------ painéis

const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'class') e.className = v;
    else if (v !== undefined && v !== null && v !== false) e[k] = v;
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid);
  return e;
};
const btn = (text, onClick, cls = 'icon-btn small', disabled = false) => el('button', { type: 'button', class: cls, textContent: text, disabled, on: { click: onClick } });
const when = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const ACTION_TEXT = {
  banir: 'expulsou', aprova_denuncia: 'aprovou a denúncia contra', recusa_denuncia: 'recusou a denúncia contra', guerra: 'declarou guerra à',
  fim_guerra: 'encerrou a guerra com a', propor_alianca: 'propôs aliança à', propor_paz: 'propôs paz à', aceita_alianca: 'aceitou a aliança da',
  aceita_paz: 'aceitou a paz da', recusa: 'recusou a proposta da', romper: 'desfez a aliança com a',
};

/**
 * Monta os painéis do fim de jogo. `api`:
 *   send(msg), toast(text, tone), view() (a mensagem `endgame`), me() (o próprio jogador, com `faction`),
 *   ninja() (ryō, itens), playerName(id), focusId(), aim() (direção do joystick), closeOthers().
 */
export function mountEndgameUI(api) {
  const $ = (id) => document.getElementById(id);
  const ui = {
    toggle: $('village-toggle'), badge: $('village-badge'), panel: $('village-panel'), close: $('village-close'), title: $('village-title'),
    tabs: [...document.querySelectorAll('#village-panel .tab')], body: $('village-body'),
    travel: $('travel-panel'), travelClose: $('travel-close'), travelList: $('travel-list'),
    invite: $('akatsuki-invite'), inviteText: $('akatsuki-invite-text'), inviteYes: $('akatsuki-yes'), inviteNo: $('akatsuki-no'),
    power: $('power-btn'), powerCd: document.querySelector('#power-btn .cd'),
  };
  const s = { tab: 'vila', panel: null, isKage: false, passive: '', ranking: null, powerReadyAt: 0, powerTotal: 0 };

  const view = () => api.view();
  const mine = () => api.me()?.faction || null;

  function open(tab = s.tab) {
    api.closeOthers();
    s.tab = tab;
    ui.panel.hidden = false;
    ui.toggle.setAttribute('aria-expanded', 'true');
    if (mine()?.village) api.send({ type: 'village_panel' });
    if (tab === 'ranking') api.send({ type: 'ranking' });
    render();
  }
  function close() {
    ui.panel.hidden = true;
    ui.toggle.setAttribute('aria-expanded', 'false');
  }
  ui.toggle.addEventListener('click', () => (ui.panel.hidden ? open() : close()));
  ui.close.addEventListener('click', close);
  for (const t of ui.tabs) t.addEventListener('click', () => open(t.dataset.tab));
  ui.travelClose.addEventListener('click', () => (ui.travel.hidden = true));
  ui.inviteNo.addEventListener('click', () => { api.send({ type: 'akatsuki_answer', accept: false }); ui.invite.hidden = true; });
  ui.inviteYes.addEventListener('click', () => { api.send({ type: 'akatsuki_answer', accept: true }); ui.invite.hidden = true; });
  ui.power.addEventListener('click', () => {
    const d = api.aim();
    api.send({ type: 'power', ...(api.focusId() ? { targetId: api.focusId() } : {}), ...(d ? { dir: d } : {}) });
  });

  /** Botões da HUD: 🏯 com o módulo de vilas, ☁ (poder) só para membro da Akatsuki. */
  function renderButtons() {
    const v = view();
    const f = mine();
    ui.toggle.hidden = !egOn(v, 'vilas');
    ui.badge.textContent = f ? (f.village ? villageName(v, f.village) : 'Renegado') : 'Vila';
    ui.power.hidden = !(egOn(v, 'akatsuki') && f?.akatsuki);
    if (!ui.power.hidden) {
      const p = v.powers.find((x) => x.slot === f.akatsuki);
      ui.power.setAttribute('aria-label', p ? `${p.name}: ${p.text}` : 'Poder');
    }
    for (const t of ui.tabs) {
      const tab = t.dataset.tab;
      t.hidden = (tab === 'kage' && !s.isKage) || (tab === 'ranking' && !egOn(v, 'pvp')) || (tab === 'akatsuki' && !egOn(v, 'akatsuki'));
      t.classList.toggle('active', tab === s.tab);
      t.setAttribute('aria-selected', String(tab === s.tab));
    }
  }

  function render() {
    renderButtons();
    if (ui.panel.hidden) return;
    const v = view();
    const f = mine();
    ui.title.textContent = f?.village ? `🏯 Vila da ${villageName(v, f.village)}` : '🏯 Renegado';
    const body = { vila: villageTab, kage: kageTab, ranking: rankingTab, akatsuki: akatsukiTab }[s.tab] || villageTab;
    ui.body.replaceChildren(...body(v, f));
  }

  function villageTab(v, f) {
    const now = Date.now();
    if (!f) return [el('p', { class: 'mission-empty', textContent: 'Carregando…' })];
    if (!f.village) {
      return [
        el('p', { class: 'mission-status', textContent: `Você é renegado${f.renegadeFrom ? ` (saiu da Vila da ${villageName(v, f.renegadeFrom)})` : ''}. Sem vila e sem passiva: sua casa é o Refúgio dos Renegados, e na Zona de Conflito todo ninja de vila é seu inimigo.` }),
        f.bounty ? el('p', { class: 'points-line', textContent: `💰 Recompensa pela sua cabeça: ${f.bounty} ryō` }) : null,
      ];
    }
    const out = [];
    const kage = v.kages.find((k) => k.village === f.village);
    out.push(el('p', { class: 'points-line', textContent: `Passiva: ${s.passive || v.villages.find((x) => x.code === f.village)?.passive || ''}` }));
    out.push(el('p', { class: 'mission-sensei', textContent: kage ? `👑 Kage: ${kage.username} (até ${when(kage.termEndsAt)})` : '👑 Sem Kage agora.' }));
    const factor = shopFactor(v, f, now);
    if (factor !== 1) out.push(el('p', { class: 'kits-help', textContent: `Lojas da vila: ${factor > 1 ? '+' : ''}${Math.round((factor - 1) * 100)}% (${factor > 1 ? 'esforço de guerra' : 'rotas de comércio'})` }));
    out.push(el('h3', { textContent: 'Diplomacia' }));
    out.push(el('ul', { class: 'eg-list' }, VILLAGE_CODES.filter((c) => c !== f.village).map((c) => {
      const rel = relationOf(f.village, c, diplomacy(v), now);
      return el('li', {}, el('span', { class: 'eg-chip', textContent: villageName(v, c), style: `--c:${VILLAGE_COLORS[c]}` }),
        el('b', { class: `eg-rel ${rel}`, textContent: RELATION_TEXT[rel] }));
    })));
    const live = (v.events || []).filter((e) => now >= e.startsAt && now < e.endsAt);
    for (const e of live) {
      out.push(el('p', { class: 'kits-help', textContent: e.kind === 'tregua'
        ? `🕊️ Trégua forçada${e.a ? ` (${villageName(v, e.a)} x ${villageName(v, e.b)})` : ' entre todas'} até ${when(e.endsAt)}`
        : `⚔️ Guerra forçada: ${villageName(v, e.a)} x ${villageName(v, e.b)} até ${when(e.endsAt)}` }));
    }
    const panel = s.panel;
    out.push(el('h3', { textContent: 'Eleição para Kage' }));
    if (!panel) out.push(el('p', { class: 'mission-empty', textContent: 'Carregando…' }));
    else if (!panel.election) out.push(el('p', { class: 'mission-empty', textContent: 'Sem eleição aberta agora.' }));
    else {
      out.push(el('p', { class: 'kits-help', textContent: `Fecha em ${when(panel.election.closesAt)}. Votam os Genin+ da vila com conta de 7 dias.` }));
      if (panel.election.candidates.length === 0) out.push(el('p', { class: 'mission-empty', textContent: 'Ninguém se candidatou (nível 60, com o Diretor da Academia).' }));
      out.push(el('ul', { class: 'eg-list' }, panel.election.candidates.map((c) => el('li', {},
        el('span', { textContent: `${c.username} · Nv ${c.level}` }),
        panel.election.myVote === c.id ? el('b', { class: 'eg-rel alianca', textContent: 'Seu voto' })
          : btn('Votar', () => api.send({ type: 'kage_vote', candidate: c.id }), 'icon-btn small', !!panel.election.myVote)))));
    }
    if (egOn(v, 'renegados')) out.push(...reportForm());
    if (panel?.log?.length) {
      out.push(el('h3', { textContent: 'Últimas decisões' }));
      out.push(el('ul', { class: 'eg-log' }, panel.log.map((l) => el('li', { textContent:
        `${when(l.at)} · ${l.kage || 'Kage'} ${ACTION_TEXT[l.action] || l.action} ${l.target || (l.targetVillage ? `Vila da ${villageName(v, l.targetVillage)}` : '')}${l.reason ? ` (${l.reason})` : ''}` }))));
    }
    return out;
  }

  /** Denúncia (rank igual ou maior; o Kage decide) ou, no painel do Kage, a expulsão direta. */
  function reportForm(kind = 'report_player') {
    const name = el('input', { type: 'text', placeholder: 'Nome do ninja', maxLength: 24, autocomplete: 'off' });
    const reason = el('textarea', { placeholder: 'Justificativa (10 a 300 letras)', maxLength: 300, rows: 2 });
    const exile = kind === 'kage_exile';
    return [
      el('h3', { textContent: exile ? 'Expulsar da vila (vira renegado)' : 'Denunciar ao Kage' }),
      el('p', { class: 'kits-help', textContent: exile ? 'Irreversível: só o administrador desfaz. No máximo 5 por semana.' : 'Só ninjas de rank igual ou menor que o seu. O Kage aprova ou recusa.' }),
      el('div', { class: 'eg-form' }, name, reason, btn(exile ? 'Expulsar' : 'Denunciar', () => {
        if (!name.value.trim()) return api.toast('Escreva o nome do ninja.', 'bad');
        if (exile && !confirm(`Expulsar ${name.value.trim()} da vila? Ele vira renegado (irreversível).`)) return;
        api.send({ type: kind, name: name.value.trim(), reason: reason.value.trim() });
      }, 'primary')),
    ];
  }

  function kageTab(v, f) {
    const now = Date.now();
    if (!s.isKage || !f?.village) return [el('p', { class: 'mission-empty', textContent: 'Só o Kage da vila usa este painel.' })];
    const out = [el('p', { class: 'kits-help', textContent: '24 h entre duas mudanças com a mesma vila. 1 aliança por vila. O banco confere cada regra.' })];
    out.push(el('ul', { class: 'eg-list' }, VILLAGE_CODES.filter((c) => c !== f.village).map((c) => {
      const rel = relationOf(f.village, c, diplomacy(v), now);
      const row = v.relations.find((r) => (r.a === c || r.b === c) && (r.a === f.village || r.b === f.village));
      const act = (action, label) => btn(label, () => {
        if ((action === 'guerra' || action === 'romper') && !confirm(`${label}: ${villageName(v, c)}?`)) return;
        api.send({ type: 'kage_action', action, village: c });
      });
      const actions = rel === 'guerra'
        ? [row?.declaredBy === f.village ? act('fim_guerra', 'Encerrar guerra') : act('paz', 'Propor paz')]
        : rel === 'alianca' ? [act('romper', 'Desfazer aliança')]
          : rel === 'tregua' ? [] : [act('guerra', 'Declarar guerra'), act('alianca', 'Propor aliança')];
      return el('li', {}, el('span', { class: 'eg-chip', textContent: villageName(v, c), style: `--c:${VILLAGE_COLORS[c]}` }),
        el('b', { class: `eg-rel ${rel}`, textContent: RELATION_TEXT[rel] }), el('span', { class: 'eg-actions' }, actions));
    })));
    const panel = s.panel;
    const incoming = (panel?.proposals || []).filter((p) => p.to === f.village);
    const outgoing = (panel?.proposals || []).filter((p) => p.from === f.village);
    if (incoming.length || outgoing.length) out.push(el('h3', { textContent: 'Propostas' }));
    for (const p of incoming) {
      out.push(el('div', { class: 'eg-row' }, el('span', { textContent: `${villageName(v, p.from)} propõe ${p.kind === 'alianca' ? 'aliança' : 'paz'} (até ${when(p.expiresAt)})` }),
        btn('Aceitar', () => api.send({ type: 'kage_answer', proposal: p.id, accept: true })),
        btn('Recusar', () => api.send({ type: 'kage_answer', proposal: p.id, accept: false }))));
    }
    for (const p of outgoing) out.push(el('p', { class: 'kits-help', textContent: `Aguardando a ${villageName(v, p.to)}: ${p.kind === 'alianca' ? 'aliança' : 'paz'} (até ${when(p.expiresAt)})` }));
    if (egOn(v, 'renegados')) {
      out.push(el('h3', { textContent: 'Denúncias' }));
      if (!panel?.reports?.length) out.push(el('p', { class: 'mission-empty', textContent: 'Nenhuma denúncia aberta.' }));
      for (const r of panel?.reports || []) {
        out.push(el('div', { class: 'eg-row' }, el('span', { textContent: `${r.reporter} denunciou ${r.target}: “${r.reason}”` }),
          btn('Aprovar', () => confirm(`${r.target} vira renegado (irreversível). Aprovar?`) && api.send({ type: 'kage_report', report: r.id, approve: true })),
          btn('Recusar', () => api.send({ type: 'kage_report', report: r.id, approve: false }))));
      }
      out.push(...reportForm('kage_exile'));
    }
    return out;
  }

  function rankingTab(v) {
    const r = s.ranking;
    if (!r) return [el('p', { class: 'mission-empty', textContent: 'Carregando o ranking…' })];
    const list = (rows) => el('ol', { class: 'eg-rank' }, rows.map((x) => el('li', { class: x.playerId === api.me()?.id ? 'me' : '' },
      el('span', { textContent: `${x.position}. ${x.username}${x.village ? ` (${villageName(v, x.village)})` : ' (renegado)'}` }),
      el('b', { textContent: `${x.mmr}` }), el('small', { textContent: ` ${x.wins}V ${x.losses}D` }))));
    return [
      el('p', { class: 'points-line', textContent: r.season ? `Temporada ${r.season.id}: até ${when(r.season.endsAt)}` : 'Sem temporada aberta.' }),
      el('p', { class: 'mission-sensei', textContent: `Você: ${r.me.seasonMmr ?? 1000} na temporada${r.me.position ? ` (${r.me.position}º)` : ''} · ${r.me.mmr} global · ${r.me.seasonWins}V ${r.me.seasonLosses}D` }),
      el('p', { class: 'kits-help', textContent: 'Conta só na Zona de Conflito. A mesma dupla conta 3 vezes por dia; diferença de nível acima de 10 não conta. Recompensas com 10+ lutas na temporada.' }),
      el('h3', { textContent: 'Temporada' }), r.top.length ? list(r.top) : el('p', { class: 'mission-empty', textContent: 'Ninguém lutou ainda.' }),
      el('h3', { textContent: 'Global' }), r.global.length ? list(r.global) : el('p', { class: 'mission-empty', textContent: 'Ninguém lutou ainda.' }),
    ];
  }

  function akatsukiTab(v, f) {
    const members = v.akatsuki || [];
    const out = [el('p', { class: 'kits-help', textContent: '10 vagas no servidor, cada uma com um poder. Só o líder convida (nível 40+). Aceitar transforma em renegado.' })];
    out.push(el('ul', { class: 'eg-list' }, v.powers.map((p) => {
      const m = members.find((x) => x.slot === p.slot);
      return el('li', {}, el('span', { textContent: `${p.slot}. ${p.name}` }), el('small', { textContent: ` ${p.text}` }),
        el('b', { class: m ? 'eg-rel guerra' : 'eg-rel neutro', textContent: m ? m.username : 'livre' }),
        f?.akatsuki === 1 && m && m.slot !== 1 ? btn('Expulsar', () => confirm(`Expulsar ${m.username} da Akatsuki?`) && api.send({ type: 'akatsuki_expel', name: m.username })) : null);
    })));
    if (f?.akatsuki === 1) {
      const free = v.powers.filter((p) => p.slot > 1 && !members.some((m) => m.slot === p.slot));
      const name = el('input', { type: 'text', placeholder: 'Nome do ninja', maxLength: 24, autocomplete: 'off' });
      const slot = el('select', {}, free.map((p) => el('option', { value: String(p.slot), textContent: `${p.slot}. ${p.name}` })));
      out.push(el('h3', { textContent: 'Convidar' }), el('div', { class: 'eg-form' }, name, slot,
        btn('Convidar', () => name.value.trim() && api.send({ type: 'akatsuki_invite', name: name.value.trim(), slot: Number(slot.value) }), 'primary', free.length === 0)));
    } else if (f?.akatsuki) {
      out.push(btn('Sair da Akatsuki', () => confirm('Sair da Akatsuki? Você continua renegado.') && api.send({ type: 'akatsuki_leave' }), 'secondary'));
    }
    return out;
  }

  function openTravel(options) {
    api.closeOthers();
    const ryo = api.ninja()?.ryo || 0;
    ui.travelList.replaceChildren(...options.map((o) => el('li', {},
      el('span', { class: 'ico', textContent: o.to === 'zona_conflito' ? '⚔️' : o.to === 'map_2' ? '🌲' : o.to === 'casa' ? '🏠' : '🤝' }),
      el('span', { class: 'name', textContent: o.name }, el('small', { class: 'price', textContent: o.locked ? ` · ${o.locked}` : o.cost ? ` · ${o.cost} ryō` : ' · grátis' })),
      btn('Ir', () => api.send({ type: 'travel', to: o.to }), 'icon-btn small', !!o.locked || ryo < o.cost))));
    if (options.length === 0) ui.travelList.replaceChildren(el('li', { textContent: 'Nenhum destino daqui.' }));
    ui.travel.hidden = false;
  }

  /** Recarga do poder desenhada no botão (como as habilidades). */
  function drawPowerCooldown(now) {
    if (ui.power.hidden || !ui.powerCd) return;
    const left = s.powerReadyAt - now;
    if (left > 0 && s.powerTotal > 0) {
      ui.power.style.setProperty('--p', `${Math.round((left / s.powerTotal) * 360)}deg`);
      ui.power.classList.add('cooling');
      const secs = String(Math.ceil(left / 1000));
      if (ui.powerCd.textContent !== secs) ui.powerCd.textContent = secs;
    } else if (ui.power.classList.contains('cooling')) {
      ui.power.classList.remove('cooling');
      ui.powerCd.textContent = '';
    }
  }

  /** Mensagens do servidor que são dos painéis. true = tratada. */
  function handle(msg) {
    switch (msg.type) {
      case 'village_panel':
        s.panel = msg.panel;
        s.isKage = !!msg.isKage;
        s.passive = msg.passive || '';
        render();
        return true;
      case 'ranking':
        s.ranking = msg;
        render();
        return true;
      case 'travel_options':
        openTravel(msg.options || []);
        return true;
      case 'akatsuki_invite':
        ui.inviteText.textContent = `${msg.from} convida você para a Akatsuki: vaga ${msg.slot} (${msg.power}). Aceitar transforma você em renegado: `
          + 'perde a vila e a passiva, e não tem volta. Vale até ' + when(msg.expiresAt) + '.';
        ui.invite.hidden = false;
        return true;
      case 'pvp_result': {
        const me = api.me()?.id;
        if (msg.winnerId === me) api.toast(`Vitória sobre ${msg.loser}${msg.counted ? ` · +${msg.winnerDelta} MMR` : ''}`, 'good');
        else if (msg.loserId === me) api.toast(`Derrotado por ${msg.winner}${msg.counted ? ` · ${msg.loserDelta} MMR` : ''}`, 'bad');
        return true;
      }
      case 'power_failed':
        api.toast({ NOT_MEMBER: 'Só membros da Akatsuki', COOLDOWN: 'Recarregando…', NO_CHAKRA: 'Chakra insuficiente', NO_TARGET: 'Nenhum alvo perto', DEAD: 'Você está derrotado', SAFE_ZONE: 'Zona segura: sem combate', STUNNED: 'Atordoado!' }[msg.reason] || 'Não deu.', 'bad');
        return true;
      default:
        return false;
    }
  }

  /** O próprio jogador usou o poder: a recarga começa (o servidor já cobrou). */
  function powerUsed(now) {
    const f = mine();
    const p = view()?.powers.find((x) => x.slot === f?.akatsuki);
    if (!p) return;
    s.powerReadyAt = now + p.cooldownMs;
    s.powerTotal = p.cooldownMs;
  }

  /** O painel está aberto e algo mudou (estado político, lado do jogador): redesenha. */
  function refresh() {
    if (!mine()?.village) s.isKage = false;
    render();
  }

  return { handle, refresh, renderButtons, drawPowerCooldown, powerUsed, close, closeTravel: () => (ui.travel.hidden = true), isOpen: () => !ui.panel.hidden };
}
