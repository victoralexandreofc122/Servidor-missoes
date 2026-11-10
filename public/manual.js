// v38: Pergaminho do Mestre (tutorial paginado), Manual do Ninja, nota do Pré-Alpha e Feedback.
//
// O SERVIDOR decide quais capítulos estão abertos e paga o prêmio (uma vez por capítulo). Este arquivo só mostra os
// textos, pede "li o capítulo" ao fechar e manda o Feedback. Tudo montado com createElement (nada de texto vira HTML).

/** Os capítulos, na ordem do Manual. `lock` = o que aparece enquanto ainda não abriu. */
export const CHAPTERS = [
  {
    code: 'boas_vindas', title: 'Bem-vindo à Academia', lock: '',
    pages: [
      { h: 'Bem-vindo à Academia!', p: ['Você é um aluno da Academia da Aldeia da Chama Eterna.', 'Este pergaminho ensina o básico. Leia no seu ritmo: toque em "Próxima página" quando quiser seguir.'] },
      { h: 'Andar e correr', p: ['Computador: W, A, S, D (ou as setas) para andar. A tecla R liga e desliga a corrida.', 'Celular: arraste o joystick do lado esquerdo. O botão da pessoa correndo liga a corrida.'] },
      { h: 'Lutar', p: ['Espaço (ou o botão da espada) dá o ataque básico.', 'As teclas 1 a 4 (ou os botões redondos) usam os jutsus. Segure e arraste o botão para mirar; solte para lançar. Volte o dedo para o meio para cancelar.', 'T troca o alvo focado; Q troca entre o kit A e o kit B.'] },
      { h: 'Chakra e meditação', p: ['Cada jutsu gasta chakra (a barra azul).', 'Para recuperar, medite: tecla M ou o botão de meditar. Meditar é bem mais rápido do que esperar.'] },
      { h: 'Sua primeira missão', p: ['Fale com a Professora Aya, na primeira sala, para começar as 4 etapas da Academia. Os Professores levam você de sala em sala.', 'Depois, cace na Floresta (ao sul do portão da aldeia) até o nível 11.', 'Este pergaminho fica guardado no Menu ☰ → Manual. Os próximos capítulos abrem conforme você avança.'] },
    ],
  },
  {
    code: 'classe', title: 'A Missão de Genin', lock: 'Abre no nível 10',
    pages: [
      { h: 'Quase Genin!', p: ['No nível 11 você faz a Missão de Genin com o Diretor da Academia (a sala do fundo).', 'Lá você escolhe a sua classe. Ela decide quais jutsus você pode aprender.'] },
      { h: 'As 10 classes', p: ['Fogo, Água, Raio, Vento e Terra: elementos, com dano e controle.', 'Ilusão e Sombra: atordoar, prender e enganar. Cura: cuida do grupo.', 'Taijutsu e Armas: luta corpo a corpo e com lâminas.'] },
      { h: 'Escolha com calma', p: ['Toque numa classe para ler o que ela faz antes de confirmar.', 'Ao virar Genin você ganha um Pergaminho para a sua primeira Extração.'] },
    ],
  },
  {
    code: 'rito', title: 'O Rito do Despertar', lock: 'Abre no nível 11',
    pages: [
      { h: 'O seu sangue', p: ['Todo ninja tem uma linhagem: Clã Rubro, Clã Umbra ou Andarilho.', 'Você marca a sua no Criador de Personagem: Menu ☰ → Config. → Mudar visual do personagem.'] },
      { h: 'O Rito', p: ['Já Genin, fale com o Diretor sobre o Rito do Despertar.', 'Derrote 10 Lodos Escuros: eles vivem na beira do rio da Floresta e na Caverna do Lodo. Pode sair do jogo no meio: o progresso fica salvo.'] },
      { h: 'O Despertar', p: ['Volte ao Diretor e a linhagem desperta, com o primeiro jutsu do clã.', 'Os outros chegam nos níveis 20, 40 e 60. Todos veem a sua linhagem: olho vermelho, névoa nos pés ou a faixa no braço.'] },
    ],
  },
  {
    code: 'pergaminho', title: 'Pergaminhos e Extração', lock: 'Abre com o primeiro pergaminho',
    pages: [
      { h: 'A Casa dos Pergaminhos', p: ['Pergaminhos ensinam jutsus novos. Leve-os à Casa dos Pergaminhos, na aldeia, e faça a Extração.', 'Você só aprende jutsus da sua própria classe.'] },
      { h: 'Tiers e chances', p: ['Tier 1 custa 1 pergaminho; tier 2, 2; tier 3, 3; tier 4, 4.', 'As 2 primeiras do tier 1 são garantidas. Errou? A próxima tentativa fica mais fácil.'] },
      { h: 'Kits e maestria', p: ['Monte os kits em Menu ☰ → Perfil → Kits e toque em Salvar kits.', 'Quanto mais você usa um jutsu, mais ele evolui (maestria): mais dano, efeito mais longo, recarga menor...'] },
    ],
  },
  {
    code: 'pvp', title: 'Lutar contra ninjas', lock: 'Abre na sua primeira luta contra outro jogador',
    pages: [
      { h: 'Onde lutar', p: ['Pelo Posto de Viagem das aldeias você chega à Zona de Conflito, onde os ninjas lutam livremente.', 'Na Arena das Quatro Heranças fica o rankeado: lutas valendo pontos e temporadas.'] },
      { h: 'Interrompa os selos', p: ['Jutsus fortes pedem selos (a barra sobre a cabeça). Atordoar, empurrar, silenciar ou fazer dormir quem está nos selos cancela o jutsu.', 'Quem foi interrompido perde parte do chakra.'] },
      { h: 'Nos conte', p: ['Achou alguma classe forte ou fraca demais? Mande pelo Menu ☰ → Feedback, na categoria Balanceamento.'] },
    ],
  },
  {
    code: 'secundaria', title: 'A Classe Secundária', lock: 'Abre no nível 40',
    pages: [
      { h: 'Duas classes', p: ['No nível 40, como Chunin, você pode escolher uma Classe Secundária com o Diretor.', 'Os jutsus dela entram na Extração e no kit, junto com os da primeira.'] },
      { h: 'Combinações', p: ['Pense em como as duas se ajudam: controle e dano, cura e defesa...', 'Teste combinações e conte para nós pelo Feedback o que achou.'] },
    ],
  },
];
const BY_CODE = new Map(CHAPTERS.map((c) => [c.code, c]));

export const FEEDBACK_CATEGORIES = [['bug', 'Bug'], ['sugestao', 'Sugestão'], ['balanceamento', 'Balanceamento'], ['outro', 'Outro']];
const FEEDBACK_MAX = 1500;

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

/**
 * api: send(msg), ninja() (o estado do jogador), world(), closeOthers(), screen() (o que está aberto na tela),
 * toast(text) (aviso discreto).
 */
export function mountManualUI(api) {
  const $ = (id) => document.getElementById(id);
  const menuBtn = $('manual-toggle');
  const feedbackBtn = $('feedback-toggle');
  const menuToggle = $('menu-toggle');

  // A tela escura por trás (overlay) e a caixa do momento (pergaminho, manual, nota, feedback).
  const overlay = el('div', { class: 'scroll-overlay', hidden: true, role: 'dialog', 'aria-modal': 'true' });
  document.body.append(overlay);
  let onClose = null;
  const show = (box, closing) => {
    api.closeOthers();
    onClose = closing ?? null;
    overlay.replaceChildren(box);
    overlay.hidden = false;
    document.body.classList.add('scroll-open');
    box.querySelector('button.primary, button')?.focus({ preventScroll: true });
  };
  const hide = () => {
    overlay.hidden = true;
    overlay.replaceChildren();
    document.body.classList.remove('scroll-open');
    const fn = onClose;
    onClose = null;
    fn?.();
  };
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

  const manual = () => api.ninja()?.manual || { unlocked: [], read: [] };
  const unread = () => manual().unlocked.filter((c) => !manual().read.includes(c));
  const reward = () => api.world()?.manualReward || { ryo: 50, xp: 100 };

  /** O ícone pisca enquanto houver capítulo aberto e não lido. */
  function refreshBadge() {
    const n = unread().length;
    const badge = menuBtn?.querySelector('.menu-badge');
    if (badge) badge.textContent = n ? String(n) : '';
    menuBtn?.classList.toggle('pulse', n > 0);
    menuToggle?.classList.toggle('pulse', n > 0);
  }

  /** O Pergaminho do Mestre: um capítulo, página por página. Fechar (já entendi) a qualquer momento. */
  function openChapter(code, then) {
    const ch = BY_CODE.get(code);
    if (!ch) return;
    let page = 0;
    const fresh = !manual().read.includes(code);
    const head = el('header', { class: 'scroll-head' }, el('span', { class: 'scroll-kicker', textContent: 'Pergaminho do Mestre' }), el('h2', { textContent: ch.title }));
    const body = el('div', { class: 'scroll-body' });
    const counter = el('span', { class: 'scroll-counter' });
    const prev = el('button', { type: 'button', class: 'scroll-btn', textContent: '◀ Página anterior' });
    const next = el('button', { type: 'button', class: 'scroll-btn primary', textContent: 'Próxima página ▶' });
    const close = el('button', { type: 'button', class: 'scroll-btn ghost', textContent: 'Fechar (já entendi)' });
    const prize = fresh ? el('p', { class: 'scroll-prize', textContent: `Ao fechar pela primeira vez: +${reward().ryo} ryō e +${reward().xp} XP` }) : null;
    const render = () => {
      const pg = ch.pages[page];
      body.replaceChildren(el('h3', { textContent: pg.h }), ...pg.p.map((t) => el('p', { textContent: t })));
      counter.textContent = `Página ${page + 1} de ${ch.pages.length}`;
      prev.disabled = page === 0;
      next.hidden = page === ch.pages.length - 1;
      close.classList.toggle('primary', page === ch.pages.length - 1);
    };
    prev.addEventListener('click', () => { if (page > 0) { page -= 1; render(); } });
    next.addEventListener('click', () => { if (page < ch.pages.length - 1) { page += 1; render(); } });
    close.addEventListener('click', hide);
    render();
    const short = matchMedia('(max-height: 500px)').matches;   // celular deitado: tudo numa linha só (a mesma regra do CSS)
    const box = el('section', { class: 'scroll-paper' }, head, body, prize,
      el('footer', { class: 'scroll-foot' }, prev, counter, next, short ? close : null), short ? null : el('div', { class: 'scroll-close-row' }, close));
    show(box, () => {
      if (fresh && manual().unlocked.includes(code)) api.send({ type: 'manual_read', chapter: code });
      then?.();
    });
  }

  /** O Manual do Ninja: todos os capítulos; os fechados mostram quando abrem. */
  function openManual() {
    const list = el('ul', { class: 'manual-list' }, ...CHAPTERS.map((ch, i) => {
      const open = manual().unlocked.includes(ch.code);
      const isNew = open && !manual().read.includes(ch.code);
      const li = el('li', { class: `manual-item${open ? '' : ' locked'}${isNew ? ' new' : ''}` },
        el('span', { class: 'manual-num', textContent: String(i + 1) }),
        el('span', { class: 'manual-name' }, el('b', { textContent: ch.title }),
          el('small', { textContent: open ? (isNew ? `Novo! +${reward().ryo} ryō e +${reward().xp} XP ao ler` : 'Lido: toque para reler') : `🔒 ${ch.lock}` })));
      if (open) {
        li.tabIndex = 0;
        li.setAttribute('role', 'button');
        const go = () => openChapter(ch.code, openManual);
        li.addEventListener('click', go);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      }
      return li;
    }));
    const box = el('section', { class: 'scroll-paper' },
      el('header', { class: 'scroll-head' }, el('span', { class: 'scroll-kicker', textContent: 'Menu ☰ → Manual' }), el('h2', { textContent: 'Manual do Ninja' })),
      el('p', { class: 'scroll-lead', textContent: 'Os capítulos do Pergaminho do Mestre. Releia quando quiser.' }),
      list,
      el('div', { class: 'scroll-close-row' }, el('button', { type: 'button', class: 'scroll-btn primary', textContent: 'Fechar', on: { click: hide } })));
    show(box);
  }

  /** A nota do Pré-Alpha (logo depois do Criador, antes do Pergaminho). */
  function openPreAlpha(then) {
    const version = api.world()?.version || '';
    const testing = ['Combate em tempo real e os jutsus das 10 classes', 'Classes e a Missão de Genin', 'Extração de jutsus na Casa dos Pergaminhos e a maestria',
      'Linhagem e o Rito do Despertar', 'PvP na Zona de Conflito e o rankeado na Arena'];
    const box = el('section', { class: 'scroll-paper notice-paper' },
      el('header', { class: 'scroll-head' }, el('span', { class: 'scroll-kicker', textContent: 'Nota de atualização' }),
        el('h2', { textContent: `Bem-vindo ao Teste Pré-Alpha${version ? ` - Versão ${version}` : ''}` })),
      el('div', { class: 'scroll-body' },
        el('h3', { textContent: 'O que estamos testando' }),
        el('ul', { class: 'notice-list' }, ...testing.map((t) => el('li', { textContent: t }))),
        el('h3', { textContent: 'Como testar' }),
        el('p', { textContent: 'Siga o Pergaminho do Mestre para entender os comandos. Os Professores da Academia mostram os primeiros passos; no nível 11, fale com o Diretor para a Missão de Genin.' }),
        el('h3', { textContent: 'Encontrou um bug?' }),
        el('p', { textContent: 'Vá até o Menu ☰ → Feedback para nos contar. Cada relato ajuda muito!' })),
      el('div', { class: 'scroll-close-row' }, el('button', { type: 'button', class: 'scroll-btn primary', textContent: 'Entendi', on: { click: hide } })));
    show(box, then);
  }

  /** Enviar Feedback: categoria, texto e o contexto da tela (o servidor junta nome, nível, classe, linhagem e mapa). */
  function openFeedback() {
    const category = el('select', { class: 'feedback-cat', 'aria-label': 'Categoria' },
      ...FEEDBACK_CATEGORIES.map(([v, t]) => el('option', { value: v, textContent: t })));
    const text = el('textarea', { class: 'feedback-text', maxLength: FEEDBACK_MAX, rows: 6, placeholder: 'Conte o que aconteceu: o que você fazia, o que esperava e o que aconteceu de verdade.', 'aria-label': 'Relato' });
    const count = el('small', { class: 'feedback-count', textContent: `0 / ${FEEDBACK_MAX}` });
    const status = el('p', { class: 'feedback-status', role: 'status' });
    const sendBtn = el('button', { type: 'button', class: 'scroll-btn primary', textContent: 'Enviar' });
    text.addEventListener('input', () => { count.textContent = `${text.value.length} / ${FEEDBACK_MAX}`; });
    sendBtn.addEventListener('click', () => {
      const content = text.value.trim();
      if (content.length < 3) { status.textContent = 'Escreva um pouco mais sobre o que aconteceu.'; return; }
      sendBtn.disabled = true;
      status.textContent = 'Enviando…';
      api.send({ type: 'feedback', category: category.value, content, screen: api.screen() });
      setTimeout(() => { if (!overlay.hidden && sendBtn.disabled) { sendBtn.disabled = false; status.textContent = 'Sem resposta do servidor. Tente de novo.'; } }, 8000);
    });
    const box = el('section', { class: 'scroll-paper feedback-paper' },
      el('header', { class: 'scroll-head' }, el('span', { class: 'scroll-kicker', textContent: 'Menu ☰ → Feedback' }), el('h2', { textContent: 'Enviar Feedback' })),
      el('p', { class: 'scroll-lead', textContent: 'Seu nome, nível, classe, linhagem e onde você está vão junto, para a equipe entender o que aconteceu.' }),
      el('label', { class: 'feedback-row' }, el('span', { textContent: 'Categoria' }), category),
      text, count, status,
      el('div', { class: 'scroll-close-row' },
        el('button', { type: 'button', class: 'scroll-btn ghost', textContent: 'Cancelar', on: { click: hide } }), sendBtn));
    show(box);
    text.focus({ preventScroll: true });
    pendingFeedback = { status, sendBtn };
  }
  let pendingFeedback = null;

  menuBtn?.addEventListener('click', openManual);
  feedbackBtn?.addEventListener('click', openFeedback);

  return {
    refreshBadge,
    openManual,
    openFeedback,
    /** Primeira chegada (logo depois do Criador): a nota do Pré-Alpha e o primeiro capítulo. */
    firstArrival() { openPreAlpha(() => openChapter('boas_vindas')); },
    get open() { return !overlay.hidden; },
    close: hide,
    handle(msg) {
      if (msg.type === 'manual') {
        const n = api.ninja();
        if (n) n.manual = { unlocked: msg.unlocked, read: msg.read };
        for (const code of msg.fresh || []) {
          if (code !== 'boas_vindas') api.toast(`📜 Novo capítulo no Manual do Ninja: ${BY_CODE.get(code)?.title || code}`);
        }
        refreshBadge();
        return true;
      }
      if (msg.type === 'notice' && pendingFeedback && !overlay.hidden && msg.tone === 'bad' && /feedback|Escreva|Calma/i.test(msg.text)) {
        pendingFeedback.status.textContent = msg.text;   // recusado (pressa, texto curto, fora do ar): pode tentar de novo
        pendingFeedback.sendBtn.disabled = false;
        return false;
      }
      if (msg.type === 'feedback_sent') {
        if (pendingFeedback && !overlay.hidden) hide();
        pendingFeedback = null;
        return true;
      }
      return false;
    },
  };
}
