// Painel do Admin (v19): só aparece para quem entrou como administrador (players.is_admin).
//
// Cada botão monta o mesmo texto do comando de chat ("ryo Kaito 500") e manda { type: "admin", command }. O servidor lê
// igual ao "/admin ..." e confere tudo de novo (quem não é admin recebe "Comando desconhecido"). O rodapé mostra o
// comando que saiu (para aprender o atalho do chat) e a resposta do servidor.
//
// Abas: Jogador (ryō, nível, pontos, patente, efeito, vila, renegado, Akatsuki, Kage) · Itens · Jutsus · Monstros · Mundo (ir,
// clima, hora) · Fim de jogo (módulos, eleição, evento, temporada) · PvP (números por classe e por golpe) · Feedback (v38).

const TABS = [
  ['jogador', 'Jogador'], ['itens', 'Itens'], ['jutsus', 'Jutsus'], ['monstros', 'Monstros'], ['mundo', 'Mundo'], ['fim', 'Fim de jogo'], ['pvp', 'PvP'], ['feedback', 'Feedback'],
];
const FEEDBACK_CAT = { bug: '🐞 Bug', sugestao: '💡 Sugestão', balanceamento: '⚖️ Balanceamento', outro: '💬 Outro' };
const CLASS_PT = { fire: 'Fogo', water: 'Água', lightning: 'Raio', stone: 'Terra', taijutsu: 'Taijutsu', illusion: 'Ilusão', shadow: 'Sombra', heal: 'Cura', weapons: 'Armas', wind: 'Vento' };
const CLAN_PT = { rubro: 'Clã Rubro', umbra: 'Clã Umbra', andarilho: 'Andarilho' };
const WEATHERS = [['normal', '☁️ Normal'], ['quente', '☀️ Quente'], ['chuva', '🌧️ Chuva'], ['neblina', '🌫️ Neblina']];
const PHASES = [['amanhecer', '🌅 Amanhecer'], ['dia', '🌞 Dia'], ['entardecer', '🌇 Entardecer'], ['noite', '🌙 Noite']];
const XP_VILLAGES = [['chama', 'Chama Eterna'], ['mare', 'Maré Oculta'], ['vento', 'Vento Cortante'], ['rocha', 'Rocha Antiga']];
const MODULES = [['vilas', 'Vilas e Kage'], ['pvp', 'Zona de Conflito'], ['renegados', 'Renegados'], ['akatsuki', 'Cinzas']];
const KIND_NAME = { weapon: 'Arma', scroll: 'Pergaminho', cape: 'Capa', shoes: 'Sapato', accessory: 'Acessório' };
const CLASS_ORDER = ['fire', 'water', 'lightning', 'stone', 'taijutsu', 'illusion', 'shadow', 'heal', 'weapons', 'wind'];
const CONFIRM_MS = 3000;

export function mountAdminUI(api) {
  const $ = (id) => document.getElementById(id);
  const ui = {
    toggle: $('admin-toggle'), panel: $('admin-panel'), close: $('admin-close'), tabs: $('admin-tabs'), body: $('admin-body'),
    target: $('admin-target'), players: $('admin-players'), me: $('admin-me'), sent: $('admin-sent'), reply: $('admin-reply'),
  };
  const s = { tab: 'jogador', catalog: null, pvp: null, feedback: null, feedbackError: '', feedbackOnlyNew: true, itemFilter: '', jutsuLevel: '4', xpScope: 'global', xpTarget: '', xpPercent: '50', xpMinutes: '60', qty: { item: '1', monster: '1' } };

  // ---------------------------------------------------------------- pequenos construtores de tela

  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    n.append(...kids.filter((x) => x !== null && x !== undefined && x !== false));
    return n;
  };
  const num = (value, min, max, label) => el('input', { type: 'number', inputMode: 'numeric', min, max, value, class: 'adm-num', 'aria-label': label });
  const pick = (options, label, value) => {
    const sel = el('select', { 'aria-label': label });
    for (const [v, text] of options) sel.append(el('option', { value: v, textContent: text, selected: v === value }));
    return sel;
  };
  const btn = (text, fn, cls = 'adm-btn') => el('button', { type: 'button', class: cls, textContent: text, on: { click: fn } });
  /** Ação que não volta atrás: o primeiro toque pede confirmação; o segundo (em até 3 s) faz. */
  const danger = (text, fn) => {
    const b = btn(text, () => {
      if (b.dataset.armed) {
        delete b.dataset.armed;
        b.textContent = text;
        fn();
        return;
      }
      b.dataset.armed = '1';
      b.textContent = 'Toque de novo para confirmar';
      setTimeout(() => { if (b.dataset.armed) { delete b.dataset.armed; b.textContent = text; } }, CONFIRM_MS);
    }, 'adm-btn danger');
    return b;
  };
  const row = (label, ...kids) => el('div', { class: 'adm-row' }, el('span', { class: 'adm-label', textContent: label }), el('div', { class: 'adm-ctl' }, ...kids));
  const section = (title, ...kids) => el('section', { class: 'adm-sec' }, el('h3', { textContent: title }), ...kids);
  const hint = (text) => el('p', { class: 'adm-hint', textContent: text });

  // ---------------------------------------------------------------- enviar

  /** O jogador alvo (o campo de cima). Vazio: avisa e não manda. */
  function who() {
    const name = ui.target.value.trim();
    if (/^[A-Za-z0-9_]{3,24}$/.test(name)) return name;
    say('Escreva o nome do jogador em "Jogador alvo" (ou toque em "eu").', 'bad');
    ui.target.focus();
    return null;
  }
  function run(command) {
    ui.sent.textContent = `/admin ${command}`;
    ui.reply.textContent = 'Enviado…';
    ui.reply.className = 'adm-reply';
    api.send({ type: 'admin', command });
  }
  const forWho = (build) => () => { const n = who(); if (n) run(build(n)); };
  function say(text, tone = 'info') {
    ui.reply.textContent = text;
    ui.reply.className = `adm-reply ${tone}`;
  }

  // ---------------------------------------------------------------- abas

  const villages = () => s.catalog?.villages ?? [];
  const villageOpts = () => villages().map((v) => [v.code, v.name]);

  function tabJogador() {
    const ryo = num(1000, 1, 1000000, 'Quantidade de ryō');
    const lvl = num(10, 1, 60, 'Nível');
    const fx = pick([...Object.entries(api.world().effects || {}).map(([code, e]) => [code, `${e.icon} ${e.name}`]), ['limpar', '🧽 Tirar todos']], 'Efeito', 'molhado');
    const fxSec = num(10, 0, 120, 'Segundos (0 = padrão)');
    const patente = pick([['academia', 'Academia'], ['genin', 'Genin'], ['chunin', 'Chunin'], ['jounin', 'Jonin'], ['anbu', 'ANBU'], ['kage', 'Kage']], 'Patente', 'genin');
    const vil = pick(villageOpts(), 'Vila', villages()[0]?.code);
    const kage = pick(villageOpts(), 'Vila do Kage', villages()[0]?.code);
    return [
      section('Recursos',
        row('Dar ryō', ryo, btn('Dar ryō', forWho((n) => `ryo ${n} ${ryo.value}`))),
        row('Nível', lvl, btn('Definir nível', forWho((n) => `nivel ${n} ${lvl.value}`))),
        row('Atributos', danger('Zerar pontos', forWho((n) => `zerarpontos ${n}`)))),
      section('Patente (só o título; sobe ou desce, e vale para "eu")',
        row('Patente', patente, btn('Mudar patente', forWho((n) => `patente ${n} ${patente.value}`))),
        row('Classes', danger('Resetar classes (só conta de admin)', forWho((n) => `resetarclasses ${n}`)))),
      section('Efeito (para testar; só até reiniciar)',
        row('Efeito', fx, fxSec, btn('Aplicar', forWho((n) => `efeito ${n} ${fx.value}${fxSec.value > 0 ? ` ${fxSec.value}` : ''}`)))),
      section('Fim de jogo',
        row('Vila', vil, btn('Mudar vila', forWho((n) => `vila ${n} ${vil.value}`))),
        row('Kage', kage, btn('Pôr como Kage', forWho((n) => `kage ${kage.value} ${n}`))),
        row('Renegado', danger('Tornar renegado', forWho((n) => `renegado ${n} sim`)), btn('Desfazer', forWho((n) => `renegado ${n} nao`))),
        row('Cinzas', btn('Tornar líder', forWho((n) => `akatsuki lider ${n}`)), danger('Remover', forWho((n) => `akatsuki remover ${n}`)))),
    ];
  }

  function tabItens() {
    const qty = num(s.qty.item, 1, 999, 'Quantidade');
    qty.addEventListener('input', () => (s.qty.item = qty.value));
    const search = el('input', { type: 'search', placeholder: 'Procurar item…', value: s.itemFilter, class: 'adm-search', 'aria-label': 'Procurar item' });
    const grid = el('div', { class: 'adm-grid' });
    const fill = () => {
      const f = search.value.trim().toLowerCase();
      s.itemFilter = search.value;
      const items = (api.world().items || []).filter((i) => !f || i.name.toLowerCase().includes(f) || i.code.includes(f));
      grid.replaceChildren(...items.map((i) => {
        const icon = el('canvas', { width: 40, height: 40, class: 'adm-ico', 'aria-hidden': 'true' });
        api.drawItemIcon(icon, i.code);
        return el('button', {
          type: 'button', class: 'adm-card', title: i.code,
          on: { click: forWho((n) => `daritem ${n} ${i.code} ${qty.value}`) },
        }, icon, el('b', { textContent: i.name }), el('small', { textContent: KIND_NAME[i.kind] || i.kind }));
      }));
    };
    search.addEventListener('input', fill);
    fill();
    return [hint('Toque no item para dar ao jogador alvo.'), el('div', { class: 'adm-bar' }, search, el('label', { class: 'adm-inline' }, 'Qtd.', qty)), grid];
  }

  function tabJutsus() {
    const level = pick([['1', 'Nível 1'], ['2', 'Nível 2'], ['3', 'Nível 3'], ['4', 'Nível 4']], 'Nível do jutsu', s.jutsuLevel);
    level.addEventListener('change', () => (s.jutsuLevel = level.value));
    const skills = Object.entries(api.world().skills || {}).map(([code, k]) => ({ code, ...k }));
    const classes = api.world().classes || [];
    const groups = [...CLASS_ORDER.map((c) => [c, classes.find((x) => x.code === c)]), [null, { name: 'Academia', icon: '🎓' }]];
    const out = [hint('Toque no jutsu para ensinar ao jogador alvo (ou subir o nível dele).'), el('div', { class: 'adm-bar' }, el('label', { class: 'adm-inline' }, 'Nível', level))];
    for (const [cls, info] of groups) {
      const list = skills.filter((k) => (k.class !== undefined ? k.class : k.tier > 0 ? k.mechanic : null) === cls).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
      if (!list.length) continue;
      out.push(el('h3', { class: 'adm-group', textContent: `${info?.icon ?? ''} ${info?.name ?? cls}` }),
        el('div', { class: 'adm-grid small' }, ...list.map((k) => el('button', {
          type: 'button', class: 'adm-card', title: k.code,
          on: { click: forWho((n) => `darjutsu ${n} ${k.code} ${level.value}`) },
        }, el('b', { textContent: k.name }), el('small', { textContent: cls ? `Tier ${k.tier}` : 'Academia' })))));
    }
    return out;
  }

  function tabMonstros() {
    const qty = num(s.qty.monster, 1, 20, 'Quantidade');
    qty.addEventListener('input', () => (s.qty.monster = qty.value));
    const list = s.catalog?.monsters ?? [];
    return [
      hint('Nascem em volta de você e não dão XP, ryō nem drop.'),
      el('div', { class: 'adm-bar' }, el('label', { class: 'adm-inline' }, 'Qtd.', qty)),
      list.length
        ? el('div', { class: 'adm-grid small' }, ...list.map((m) => el('button', {
          type: 'button', class: `adm-card${/chefe/.test(m.name) ? ' boss' : ''}`, title: m.code,
          on: { click: () => run(`invocar ${m.code} ${qty.value}`) },
        }, el('b', { textContent: m.name }), el('small', { textContent: m.code }))))
        : hint('Carregando…'),
    ];
  }

  function tabMundo() {
    const maps = s.catalog?.maps ?? [];
    const map = pick(maps.map((m) => [m.id, m.name]), 'Mapa', maps[0]?.id);
    const x = num('', 0, 999, 'x');
    const y = num('', 0, 999, 'y');
    x.placeholder = 'x';
    y.placeholder = 'y';
    const minutes = num(10, 1, 120, 'Minutos');
    // v44: bônus de XP (o XP de derrotar monstros), com alvo, porcentagem e duração
    const monsters = s.catalog?.monsters ?? [];
    const scope = pick([['global', 'Todo o jogo'], ['mapa', 'Um mapa'], ['monstro', 'Um tipo de monstro'], ['vila', 'Uma aldeia']], 'Onde vale', s.xpScope);
    const targets = { mapa: maps.map((m) => [m.id, m.name]), monstro: monsters.map((m) => [m.code, m.name]), vila: XP_VILLAGES };
    const target = pick(targets[s.xpScope] ?? [], 'Alvo', s.xpTarget);
    target.hidden = s.xpScope === 'global';
    scope.addEventListener('change', () => { s.xpScope = scope.value; s.xpTarget = ''; render(); });
    target.addEventListener('change', () => (s.xpTarget = target.value));
    const percent = num(s.xpPercent, 1, 500, 'Porcentagem');
    const xpMin = num(s.xpMinutes, 1, 10080, 'Minutos do bônus');
    percent.addEventListener('input', () => (s.xpPercent = percent.value));
    xpMin.addEventListener('input', () => (s.xpMinutes = xpMin.value));
    const xpTarget = () => (scope.value === 'global' ? 'global' : `${scope.value} ${target.value}`);
    return [
      section('Bônus de XP',
        row('Onde vale', scope, target),
        row('Bônus (%)', percent),
        row('Duração (min)', xpMin, ...[['1 h', 60], ['3 h', 180], ['1 dia', 1440]].map(([text, m]) => btn(text, () => { s.xpMinutes = String(m); xpMin.value = m; }, 'chip'))),
        el('div', { class: 'adm-bar' },
          btn('Ligar bônus', () => run(`bonusxp ${xpTarget()} ${percent.value} ${xpMin.value}`)),
          btn('Remover este', () => run(`bonusxp remover ${xpTarget()}`)),
          btn('Ver ativos', () => run('bonusxp')),
          danger('Remover todos', () => run('bonusxp remover tudo'))),
        hint('Vale para o XP de derrotar monstros. De 1% a 500%, até 7 dias. Bônus de alvos diferentes somam; ligar de novo o mesmo alvo troca o valor. Todos são avisados no chat.')),
      section('Ir para',
        row('Mapa', map, x, y, btn('Ir', () => run(`ir ${map.value}${x.value !== '' && y.value !== '' ? ` ${x.value} ${y.value}` : ''}`))),
        hint('Sem x e y: o meio do mapa. Leva só você.')),
      section('Clima (para todos)',
        row('Minutos', minutes),
        el('div', { class: 'adm-chips' }, ...WEATHERS.map(([code, text]) => btn(text, () => run(`clima ${code} ${minutes.value}`), 'chip')))),
      section('Hora do dia (para todos)',
        el('div', { class: 'adm-chips' }, ...PHASES.map(([code, text]) => btn(text, () => run(`hora ${code}`), 'chip')))),
    ];
  }

  function tabFim() {
    const modules = MODULES.map(([code, name]) => row(name,
      btn('Ligar', () => run(`fimdejogo ${code} ligar`), 'chip'),
      btn('Desligar', () => run(`fimdejogo ${code} desligar`), 'chip'),
      btn('Auto', () => run(`fimdejogo ${code} auto`), 'chip')));
    const elect = pick(villageOpts(), 'Vila da eleição', villages()[0]?.code);
    const kind = pick([['guerra', '⚔️ Guerra'], ['tregua', '🕊️ Trégua']], 'Tipo de evento', 'guerra');
    const a = pick([['todas', 'Todas (só trégua)'], ...villageOpts()], 'Vila A', villages()[0]?.code);
    const b = pick([['', '—'], ...villageOpts()], 'Vila B', villages()[1]?.code);
    const hours = num(24, 1, 720, 'Horas');
    const event = () => {
      if (a.value === 'todas') return run(`evento ${kind.value} todas ${hours.value}`);
      run(`evento ${kind.value} ${a.value} ${b.value} ${hours.value}`);
    };
    return [
      section('Módulos (Auto = segue o calendário)', ...modules),
      section('Eleição do Kage', row('Vila', elect, danger('Fechar eleição agora', () => run(`eleicao ${elect.value}`)))),
      section('Evento global', row('Evento', kind, a, b), row('Horas', hours, btn('Começar', event))),
      section('Temporada PvP', row('Temporada', danger('Fechar temporada agora', () => run('temporada fechar')))),
    ];
  }

  function tabPvp() {
    const days = num(7, 1, 90, 'Dias');
    const out = [
      hint('Desde que o servidor ligou: arena, Zona de Conflito e PvP aberto. Do banco: a Zona de Conflito nos últimos dias.'),
      el('div', { class: 'adm-bar' }, el('label', { class: 'adm-inline' }, 'Dias (banco)', days), btn('Ver números', () => run(`pvp ${days.value}`))),
    ];
    const r = s.pvp;
    if (!r) return out;
    const pct = (v) => (v === null || v === undefined ? '–' : `${v}%`);
    const table = (head, rows) => el('div', { class: 'adm-table-wrap' }, el('table', { class: 'adm-table' },
      el('thead', {}, el('tr', {}, ...head.map((h) => el('th', { textContent: h })))),
      el('tbody', {}, ...(rows.length ? rows : [[`Nenhuma luta ainda.`]]).map((cells) => el('tr', {}, ...cells.map((c, i) => el('td', { textContent: String(c), ...(rows.length ? {} : { colSpan: head.length }), class: i ? 'n' : '' })))))));
    const f = r.report.fights;
    out.push(
      el('p', { class: 'adm-hint strong', textContent: `${f.arena + f.conflito + f.aberto} lutas em ${r.report.minutes} min (arena ${f.arena} · Zona de Conflito ${f.conflito} · aberto ${f.aberto})` }),
      el('p', { class: 'adm-hint', textContent: r.report.safety?.cuts ? `Rede de segurança: ${r.report.safety.cuts} cortes, ${r.report.safety.damage} de dano cortado (tabela ${r.report.safety.version})` : 'Rede de segurança: nenhum corte.' }),
      el('h3', { class: 'adm-group', textContent: 'Por classe (desde que ligou)' }),
      table(['Classe', 'V', 'D', '% vit.', 'Dano'], r.report.classes.map((c) => [c.name, c.wins, c.losses, pct(c.winRate), c.damage])),
      el('h3', { class: 'adm-group', textContent: 'Por golpe' }),
      table(['Golpe', 'Dano', 'Acertos', 'Por acerto', 'Abates'], r.report.moves.map((m) => [m.name, m.damage, m.hits, m.perHit, m.kills])),
    );
    if (r.db) {
      out.push(el('h3', { class: 'adm-group', textContent: `Zona de Conflito, últimos ${r.db.days} dias (banco)` }),
        table(['Classe', 'V', 'D', '% vit.'], r.db.rows.map((c) => [c.name, c.wins, c.losses, pct(c.winRate)])));
    } else {
      out.push(hint('Sem banco (ou fora do ar): só os números desde que o servidor ligou.'));
    }
    return out;
  }

  /** v38: os relatos do Feedback (Menu > Enviar Feedback), com o que o servidor capturou na hora. */
  function tabFeedback() {
    const all = s.feedback || [];
    const fresh = all.filter((f) => f.status === 'novo').length;
    const list = s.feedbackOnlyNew ? all.filter((f) => f.status === 'novo') : all;
    const out = [
      el('div', { class: 'adm-row' },
        btn('Atualizar', () => api.send({ type: 'admin_feedback', action: 'list' })),
        btn(s.feedbackOnlyNew ? 'Ver todos' : 'Só os novos', () => { s.feedbackOnlyNew = !s.feedbackOnlyNew; render(); })),
      el('p', { class: 'adm-hint strong', textContent: s.feedback ? `${fresh} novo(s) · ${all.length} no total (os 100 mais recentes)` : 'Carregando…' }),
    ];
    if (s.feedbackError) out.push(el('p', { class: 'adm-hint', textContent: s.feedbackError }));
    if (s.feedback && list.length === 0) out.push(el('p', { class: 'adm-hint', textContent: s.feedbackOnlyNew ? 'Nenhum feedback novo.' : 'Nenhum feedback ainda.' }));
    for (const f of list) {
      const c = f.context || {};
      const cls = [c.classes?.primary, c.classes?.secondary].filter(Boolean).map((k) => CLASS_PT[k] || k).join(' + ') || 'sem classe';
      const who = `${f.username || c.username || '?'} · nível ${c.level ?? '?'} · ${c.rank || ''} · ${cls} · ${c.lineage ? CLAN_PT[c.lineage] : (c.lineageMark ? `${CLAN_PT[c.lineageMark]} (não desperta)` : 'sem linhagem')}`;
      const where = `${c.mapName || c.map || '?'} (${c.x ?? '?'}, ${c.y ?? '?'})${c.screen ? ` · ${c.screen.device || ''} ${c.screen.w || ''}x${c.screen.h || ''} · tela: ${c.screen.panels || 'jogo'}` : ''} · ${c.version || ''}`;
      const when = new Date(f.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      out.push(el('article', { class: `adm-feedback${f.status === 'novo' ? ' new' : ''}` },
        el('header', {}, el('b', { textContent: `#${f.id} · ${FEEDBACK_CAT[f.category] || f.category}` }), el('span', { textContent: when })),
        el('p', { class: 'adm-feedback-text', textContent: f.content }),
        el('p', { class: 'adm-hint', textContent: who }),
        el('p', { class: 'adm-hint', textContent: where }),
        f.status === 'novo'
          ? btn('Marcar como lido/resolvido', () => api.send({ type: 'admin_feedback', action: 'resolve', id: f.id }))
          : el('p', { class: 'adm-hint', textContent: `✔ Resolvido${f.resolvedAt ? ` em ${new Date(f.resolvedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}` })));
    }
    return out;
  }

  const RENDER = { jogador: tabJogador, itens: tabItens, jutsus: tabJutsus, monstros: tabMonstros, mundo: tabMundo, fim: tabFim, pvp: tabPvp, feedback: tabFeedback };

  function render() {
    for (const b of ui.tabs.children) {
      const on = b.dataset.tab === s.tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    ui.body.replaceChildren(...RENDER[s.tab]());
  }

  // ---------------------------------------------------------------- abrir e fechar

  ui.tabs.replaceChildren(...TABS.map(([code, name]) => el('button', {
    type: 'button', class: 'tab', role: 'tab', textContent: name, 'data-tab': code,
    on: { click: () => { s.tab = code; if (code === 'feedback') api.send({ type: 'admin_feedback', action: 'list' }); render(); } },
  })));
  function open() {
    api.closeOthers();
    ui.panel.hidden = false;
    ui.toggle.setAttribute('aria-expanded', 'true');
    if (!ui.target.value) ui.target.value = api.myName() || '';
    api.send({ type: 'admin_catalog' });                // ninjas online, monstros e mapas (o resto o cliente já tem)
    render();
  }
  function close() {
    ui.panel.hidden = true;
    ui.toggle.setAttribute('aria-expanded', 'false');
  }
  ui.toggle.addEventListener('click', () => (ui.panel.hidden ? open() : close()));
  ui.close.addEventListener('click', close);
  ui.me.addEventListener('click', () => { ui.target.value = api.myName() || ''; });

  return {
    close,
    /** Só o admin vê o botão (o servidor confere de novo a cada comando). */
    refresh() {
      const admin = !!api.ninja()?.isAdmin;
      ui.toggle.hidden = !admin;
      if (!admin) close();
    },
    /** Mensagens do painel. Os avisos ("Admin: …", "Uso: …") também aparecem no rodapé, sem sumir do chat. */
    handle(msg) {
      if (msg.type === 'admin_catalog') {
        s.catalog = msg;
        ui.players.replaceChildren(...msg.players.map((p) => el('option', { value: p.username, label: `nível ${p.level} · ${p.map}` })));
        if (!ui.panel.hidden && s.tab !== 'itens' && s.tab !== 'jutsus') render();
        return true;
      }
      if (msg.type === 'admin_feedback') {
        s.feedback = msg.items;
        s.feedbackError = msg.error || '';
        if (!ui.panel.hidden && s.tab === 'feedback') render();
        return true;
      }
      if (msg.type === 'admin_pvp') {
        s.pvp = msg;
        say(msg.db ? `Números do PvP atualizados (banco: últimos ${msg.db.days} dias).` : 'Números do PvP atualizados (sem banco: só desde que o servidor ligou).', 'good');
        if (!ui.panel.hidden && s.tab === 'pvp') render();
        return true;
      }
      if (msg.type === 'notice' && !ui.panel.hidden && /^(Admin|Uso:|Comando desconhecido)/.test(msg.text)) {
        say(msg.text.split('\n')[0], msg.tone || 'info');
      }
      return false;
    },
  };
}
