// v64: dicas na hora (tutorial contextual; docs/lore/tutorial.md). Uma dica aparece UMA vez por aparelho, no momento
// exato em que o jogador precisa dela (entrar na Floresta, ficar sem chakra, cair...), num cartão pequeno que não para
// o jogo. "Entendi" fecha; "Desligar dicas" desliga todas (religa no Manual). Nada vai para o servidor.

import { HINT_BY_ID } from './lore.js';

const KEY_SEEN = 'nin.dicas.vistas';
const KEY_OFF = 'nin.dicas.off';

/** localStorage pode falhar (aba privada, armazenamento bloqueado): o jogo segue sem lembrar. */
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sem armazenamento: só nesta sessão */ }
}

/** api: busy() (true = não mostrar agora: tutorial da Academia, painel aberto...). */
export function mountHints(api = {}) {
  const seen = new Set(load(KEY_SEEN, []));
  let off = load(KEY_OFF, false) === true;
  const queue = [];
  let showing = null;
  let timer = 0;

  const card = document.createElement('div');
  card.className = 'hint-card';
  card.hidden = true;
  card.setAttribute('role', 'status');
  const icon = document.createElement('span');
  icon.className = 'hint-icon';
  icon.textContent = '💡';
  const text = document.createElement('p');
  text.className = 'hint-text';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'hint-ok';
  ok.textContent = 'Entendi';
  const mute = document.createElement('button');
  mute.type = 'button';
  mute.className = 'hint-mute';
  mute.textContent = 'Desligar dicas';
  const row = document.createElement('div');
  row.className = 'hint-row';
  row.append(ok, mute);
  card.append(icon, text, row);
  document.body.append(card);

  function close() {
    clearTimeout(timer);
    card.hidden = true;
    showing = null;
    setTimeout(next, 600);
  }
  function next() {
    if (showing || off || queue.length === 0) return;
    if (api.busy?.()) { setTimeout(next, 2000); return; }
    const id = queue.shift();
    const h = HINT_BY_ID.get(id);
    if (!h) return next();
    showing = id;
    text.textContent = h.text;
    card.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(close, 9000 + h.text.length * 30);
  }
  // Abriu um painel (Manual, fragmento, Criador) com a dica na tela: ela sai e volta depois, para não ficar escondida.
  setInterval(() => {
    if (!showing || !api.busy?.()) return;
    clearTimeout(timer);
    card.hidden = true;
    queue.unshift(showing);
    showing = null;
    setTimeout(next, 2000);
  }, 500);
  ok.addEventListener('click', close);
  mute.addEventListener('click', () => { setEnabled(false); close(); api.toast?.('Dicas desligadas. Para religar: Menu ☰ → Manual.'); });

  function setEnabled(on) {
    off = !on;
    save(KEY_OFF, off);
    if (off) { queue.length = 0; card.hidden = true; showing = null; }
  }

  return {
    /** Dispara a dica `id` (se ainda não foi vista neste aparelho e as dicas estão ligadas). */
    fire(id) {
      if (off || seen.has(id) || !HINT_BY_ID.has(id) || queue.includes(id) || showing === id) return false;
      seen.add(id);
      save(KEY_SEEN, [...seen]);
      queue.push(id);
      next();
      return true;
    },
    get enabled() { return !off; },
    setEnabled,
    /** Zera as dicas vistas (o Manual oferece "rever as dicas"). */
    reset() { seen.clear(); save(KEY_SEEN, []); },
    seen: () => [...seen],
  };
}
