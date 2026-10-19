// MMO Ninja — cliente web (JavaScript puro, sem bibliotecas).
//
// Fluxo: login (POST /auth/login) -> JWT no localStorage -> WebSocket /game.
// O token vai no subprotocolo do WebSocket ("jwt.<token>"), num cabeçalho: nunca na URL.
// Movimento autoritativo: o joystick manda só a direção; quem calcula a posição é o
// servidor. O cliente prevê o próprio movimento para a resposta ser imediata e corrige
// com a posição oficial que chega a cada tick.

const TOKEN_KEY = 'nin.token';
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/game`;
const SUBPROTOCOL = 'nin.v1';
const SEND_INTERVAL_MS = 70;   // joystick: no máximo ~14 mensagens/s (o servidor aceita 20/s)

// ------------------------------------------------------------------ elementos

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const ui = {
  hud: $('hud'), status: $('status'), toast: $('toast'),
  chat: $('chat'), chatLog: $('chat-log'), chatForm: $('chat-form'), chatInput: $('chat-input'),
  chatToggle: $('chat-toggle'), chatBadge: $('chat-badge'), logout: $('logout'),
  skills: $('skills'),
  login: $('login'), loginForm: $('login-form'), loginError: $('login-error'), loginSubmit: $('login-submit'),
  toggleMode: $('toggle-mode'), usernameField: $('username-field'), passwordHint: $('password-hint'),
  rotate: $('rotate'), rotateDismiss: $('rotate-dismiss'), safeProbe: $('safe-probe'),
};

// ------------------------------------------------------------------ token

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
  } catch {
    return null;
  }
}

/** Token salvo e ainda válido por pelo menos 1 minuto; senão, null (e limpa). */
function readToken() {
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch { /* modo privado */ }
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now() + 60_000) {
    clearToken();
    return null;
  }
  return token;
}
function saveToken(token) { try { localStorage.setItem(TOKEN_KEY, token); } catch { /* modo privado */ } }
function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* modo privado */ } }

// ------------------------------------------------------------------ estado

const state = {
  meId: null,
  /** id -> { id, username, x, y (desenho), tx, ty (servidor), color, bubble } */
  players: new Map(),
  world: { width: 100, height: 100, speed: 5, tickMs: 50 },
  ws: null,
  connected: false,
  everOpened: false,
  failures: 0,
  reconnectTimer: null,
  effects: [],          // efeitos de habilidade: { x, y, color, start }
};

// ------------------------------------------------------------------ login / cadastro

let registerMode = false;

ui.toggleMode.addEventListener('click', () => {
  registerMode = !registerMode;
  ui.usernameField.hidden = !registerMode;
  ui.passwordHint.hidden = !registerMode;
  ui.loginSubmit.textContent = registerMode ? 'Criar conta e entrar' : 'Entrar';
  ui.toggleMode.textContent = registerMode ? 'Já tenho conta' : 'Não tem conta? Criar conta';
  ui.loginForm.password.autocomplete = registerMode ? 'new-password' : 'current-password';
  ui.loginError.textContent = '';
});

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store',
  });
  let data = null;
  try { data = await res.json(); } catch { /* corpo vazio */ }
  if (!res.ok) {
    const err = data && data.error;
    const detail = err && Array.isArray(err.details) && err.details[0] ? ` (${err.details[0].field}: ${err.details[0].problem})` : '';
    throw new Error(err ? `${err.message}${detail}` : `Erro ${res.status}. Tente de novo.`);
  }
  return data;
}

ui.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = ui.loginForm;
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) {
    ui.loginError.textContent = 'Preencha e-mail e senha.';
    return;
  }
  ui.loginError.textContent = '';
  ui.loginSubmit.disabled = true;
  ui.loginSubmit.textContent = 'Aguarde…';
  requestLandscape();   // precisa ser dentro do toque do usuário
  try {
    if (registerMode) await postJson('/auth/register', { username: form.username.value.trim(), email, password });
    const { token } = await postJson('/auth/login', { email, password });
    saveToken(token);
    form.password.value = '';
    startGame();
  } catch (err) {
    ui.loginError.textContent = err.message || 'Não foi possível entrar.';
  } finally {
    ui.loginSubmit.disabled = false;
    ui.loginSubmit.textContent = registerMode ? 'Criar conta e entrar' : 'Entrar';
  }
});

function showLogin(message = '') {
  disconnect();
  ui.hud.hidden = true;
  ui.login.hidden = false;
  ui.loginError.textContent = message;
}

ui.logout.addEventListener('click', () => {
  clearToken();
  showLogin();
});

// ------------------------------------------------------------------ WebSocket

function startGame() {
  ui.login.hidden = true;
  ui.hud.hidden = false;
  state.failures = 0;
  checkOrientation();
  connect();
}

function connect() {
  const token = readToken();
  if (!token) return showLogin('Sua sessão expirou. Entre de novo.');
  clearTimeout(state.reconnectTimer);
  setStatus('conectando…', '');
  state.everOpened = false;

  // Navegador não deixa mandar header no WebSocket: o token vai como subprotocolo.
  const ws = new WebSocket(WS_URL, [SUBPROTOCOL, `jwt.${token}`]);
  state.ws = ws;

  ws.addEventListener('open', () => {
    state.everOpened = true;
    state.connected = true;
    state.failures = 0;
    lastSent = { x: 0, y: 0 };
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    handleMessage(msg);
  });

  const onEnd = (event) => {
    if (state.ws !== ws) return;     // conexão antiga
    state.ws = null;
    state.connected = false;
    setDirection(0, 0, false);
    const code = event && event.code;
    if (code === 4000) {
      // Mesma conta entrou em outro aparelho/aba: não reconecta (senão as duas ficam se derrubando).
      showToast('Sua conta entrou em outro aparelho. Recarregue para jogar aqui.', 0);
      setStatus('desconectado', 'bad');
      return;
    }
    if (code === 1008) showToast('Mensagens demais: conexão encerrada pelo servidor.');
    if (!state.everOpened) {
      // Handshake recusado (token inválido) ou servidor fora do ar. Três falhas seguidas: novo login.
      state.failures += 1;
      if (state.failures >= 3) {
        clearToken();
        return showLogin('Não foi possível conectar. Entre de novo.');
      }
    }
    const delay = Math.min(10_000, 1000 * 2 ** Math.max(0, state.failures - 1));
    setStatus(`reconectando em ${Math.round(delay / 1000)} s…`, 'bad');
    state.reconnectTimer = setTimeout(connect, delay);
  };
  ws.addEventListener('close', onEnd);
  ws.addEventListener('error', () => { if (!state.everOpened) onEnd({ code: 0 }); });
}

function disconnect() {
  clearTimeout(state.reconnectTimer);
  const ws = state.ws;
  state.ws = null;
  state.connected = false;
  if (ws) try { ws.close(1000, 'saiu'); } catch { /* já fechado */ }
  state.players.clear();
  state.meId = null;
}

function send(message) {
  const ws = state.ws;
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

// Cores que contrastam com a grama (nada de verde): cada jogador ganha uma, fixa pelo id.
const PLAYER_COLORS = ['#e8572f', '#3c9be0', '#9a6be0', '#f2c230', '#e04f8a', '#f08a3c', '#47c6d1', '#d94848', '#7d8cf0', '#f5f0e1'];
function colorFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PLAYER_COLORS[h % PLAYER_COLORS.length];
}

function upsertPlayer(p, snap) {
  const existing = state.players.get(p.id);
  if (existing) {
    existing.tx = p.x; existing.ty = p.y;
    if (snap) { existing.x = p.x; existing.y = p.y; }
    return existing;
  }
  const player = { id: p.id, username: p.username, x: p.x, y: p.y, tx: p.x, ty: p.y, color: colorFor(p.id), bubble: null };
  state.players.set(p.id, player);
  return player;
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'welcome':
      state.players.clear();
      state.meId = msg.you.id;
      if (msg.world) state.world = msg.world;
      upsertPlayer(msg.you, true);
      for (const p of msg.players) upsertPlayer(p, true);
      updateOnline();
      break;
    case 'player_joined':
      upsertPlayer(msg.player, true);
      updateOnline();
      break;
    case 'player_moved': {
      const p = state.players.get(msg.playerId);
      if (p) { p.tx = msg.x; p.ty = msg.y; }
      break;
    }
    case 'player_left':
      state.players.delete(msg.playerId);
      updateOnline();
      break;
    case 'chat': {
      addChatLine(msg.username, msg.message, msg.playerId === state.meId);
      const p = state.players.get(msg.playerId);
      if (p) p.bubble = { text: msg.message, until: performance.now() + 4500 };
      break;
    }
    case 'error':
      if (msg.code === 'CHAT_RATE_LIMITED' || msg.code === 'CHAT_INVALID') addSystemLine(msg.message);
      else console.warn('[servidor]', msg.code, msg.message);
      break;
    default:
      break;
  }
}

function updateOnline() {
  const n = state.players.size;
  setStatus(`online · ${n} ${n === 1 ? 'jogador' : 'jogadores'}`, 'ok');
}

function setStatus(text, kind) {
  ui.status.textContent = text;
  ui.status.className = `pill ${kind || ''}`.trim();
}

let toastTimer = null;
function showToast(text, ms = 3500) {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  if (ms > 0) toastTimer = setTimeout(() => { ui.toast.hidden = true; }, ms);
}

// ------------------------------------------------------------------ movimento (joystick + teclado)

let dir = { x: 0, y: 0 };
let lastSent = { x: 0, y: 0 };
let lastSendAt = 0;
let sendTimer = null;

const quantize = (v) => Math.round(v * 20) / 20 || 0;   // passos de 0,05 (e sem "-0")

function setDirection(x, y, transmit = true) {
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  dir = { x, y };
  if (transmit) scheduleSend();
}

/** Manda a direção quando muda, no máximo a cada 70 ms; "parar" sai na hora. */
function scheduleSend() {
  const want = { x: quantize(dir.x), y: quantize(dir.y) };
  if (want.x === lastSent.x && want.y === lastSent.y) return;
  const stopping = want.x === 0 && want.y === 0;
  const wait = SEND_INTERVAL_MS - (performance.now() - lastSendAt);
  if (stopping || wait <= 0) {
    clearTimeout(sendTimer);
    sendTimer = null;
    lastSent = want;
    lastSendAt = performance.now();
    send({ type: 'move', dx: want.x, dy: want.y });
  } else if (!sendTimer) {
    sendTimer = setTimeout(() => { sendTimer = null; scheduleSend(); }, wait);
  }
}

// Joystick: base fixa no canto inferior esquerdo; qualquer toque na metade esquerda de
// baixo pega o joystick. Pointer Events = toque, mouse e caneta; multitoque funciona
// (joystick com um dedo, habilidade com outro).
const joy = { pointerId: null, baseX: 0, baseY: 0, radius: 60, knobX: 0, knobY: 0 };
const safe = { top: 0, right: 0, bottom: 0, left: 0 };

function layoutJoystick(w, h) {
  joy.radius = Math.round(Math.max(48, Math.min(78, Math.min(w, h) * 0.13)));
  joy.baseX = safe.left + 24 + joy.radius;
  joy.baseY = h - safe.bottom - 24 - joy.radius;
}

function inJoystickZone(x, y, w, h) {
  return x < w * 0.5 && y > h * 0.35;
}

canvas.addEventListener('pointerdown', (e) => {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (joy.pointerId !== null || !inJoystickZone(e.clientX, e.clientY, w, h)) return;
  e.preventDefault();
  joy.pointerId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  moveKnob(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joy.pointerId) return;
  e.preventDefault();
  // Eventos agrupados do mesmo quadro: usa o mais recente (movimento mais suave).
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  const last = list.length ? list[list.length - 1] : e;
  moveKnob(last.clientX, last.clientY);
});
const releaseJoystick = (e) => {
  if (e.pointerId !== joy.pointerId) return;
  joy.pointerId = null;
  joy.knobX = 0;
  joy.knobY = 0;
  setDirection(0, 0);
};
canvas.addEventListener('pointerup', releaseJoystick);
canvas.addEventListener('pointercancel', releaseJoystick);
canvas.addEventListener('lostpointercapture', releaseJoystick);

function moveKnob(px, py) {
  let ox = px - joy.baseX;
  let oy = py - joy.baseY;
  const dist = Math.hypot(ox, oy);
  if (dist > joy.radius) { ox *= joy.radius / dist; oy *= joy.radius / dist; }
  joy.knobX = ox;
  joy.knobY = oy;
  const nx = ox / joy.radius, ny = oy / joy.radius;
  // Zona morta de 12%: dedo parado não faz o personagem "escorregar".
  if (Math.hypot(nx, ny) < 0.12) setDirection(0, 0);
  else setDirection(nx, ny);
}

// Teclado (testar no computador): WASD ou setas.
const keys = new Set();
const KEYMAP = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
function keyDirection() {
  let x = 0, y = 0;
  for (const k of keys) { x += KEYMAP[k][0]; y += KEYMAP[k][1]; }
  setDirection(Math.sign(x), Math.sign(y));
}
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (KEYMAP[e.code]) { keys.add(e.code); keyDirection(); e.preventDefault(); }
  if (e.key >= '1' && e.key <= '4') castSkill(['fire', 'taijutsu', 'illusion', 'water'][Number(e.key) - 1]);
  if (e.key === 'Enter' && ui.chat.hidden && !ui.hud.hidden) { openChat(true); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code] && keys.delete(e.code)) keyDirection();
});

// App em segundo plano ou aba trocada: para de andar.
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); joy.pointerId = null; joy.knobX = joy.knobY = 0; setDirection(0, 0); } });
window.addEventListener('blur', () => { keys.clear(); if (joy.pointerId === null) setDirection(0, 0); });

// ------------------------------------------------------------------ habilidades

const SKILL_COLORS = { fire: '#e8572f', taijutsu: '#d9a441', illusion: '#9a6be0', water: '#3c9be0' };
const cooldownUntil = {};

function castSkill(skill) {
  if (!SKILL_COLORS[skill] || !state.connected) return;
  const now = performance.now();
  if (now < (cooldownUntil[skill] || 0)) return;
  cooldownUntil[skill] = now + 600;
  send({ type: 'cast', skill });
  console.log(`[habilidade] ${skill}`);
  const me = state.players.get(state.meId);
  if (me) state.effects.push({ x: me.x, y: me.y, color: SKILL_COLORS[skill], start: now });
  const button = ui.skills.querySelector(`[data-skill="${skill}"]`);
  if (button) {
    button.classList.remove('cooldown');
    void button.offsetWidth;   // reinicia a animação
    button.classList.add('cooldown');
  }
}

ui.skills.addEventListener('pointerdown', (e) => {
  const button = e.target.closest('.skill');
  if (!button) return;
  e.preventDefault();          // resposta imediata, sem esperar o "click"
  castSkill(button.dataset.skill);
});
ui.skills.addEventListener('click', (e) => {
  // Teclado/leitor de tela (Enter/Espaço): o pointerdown não acontece.
  const button = e.target.closest('.skill');
  if (button && e.detail === 0) castSkill(button.dataset.skill);
});

// ------------------------------------------------------------------ chat

let unread = 0;

function openChat(focus) {
  ui.chat.hidden = false;
  ui.chatToggle.setAttribute('aria-expanded', 'true');
  unread = 0;
  ui.chatBadge.hidden = true;
  ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
  if (focus) ui.chatInput.focus();
}
function closeChat() {
  ui.chat.hidden = true;
  ui.chatToggle.setAttribute('aria-expanded', 'false');
  ui.chatInput.blur();
}
ui.chatToggle.addEventListener('click', () => (ui.chat.hidden ? openChat(true) : closeChat()));

ui.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = ui.chatInput.value.trim();
  if (!message) return;
  if (!state.connected) return addSystemLine('Sem conexão. Tentando reconectar…');
  send({ type: 'chat', message });
  ui.chatInput.value = '';
});
ui.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChat(); });

function addChatLine(username, message, mine) {
  const li = document.createElement('li');
  if (mine) li.className = 'me';
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = `${username}: `;            // textContent: texto nunca vira HTML
  li.append(who, document.createTextNode(message));
  appendLine(li);
  if (ui.chat.hidden && !mine) {
    unread += 1;
    ui.chatBadge.textContent = unread > 9 ? '9+' : String(unread);
    ui.chatBadge.hidden = false;
  }
}
function addSystemLine(text) {
  const li = document.createElement('li');
  li.className = 'system';
  li.textContent = text;
  appendLine(li);
}
function appendLine(li) {
  ui.chatLog.append(li);
  while (ui.chatLog.children.length > 60) ui.chatLog.firstElementChild.remove();
  ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
}

// ------------------------------------------------------------------ orientação e tela

function requestLandscape() {
  // Android (Chrome): tela cheia + trava em paisagem. iPhone não tem essa API: fica a dica.
  const el = document.documentElement;
  if (!matchMedia('(pointer: coarse)').matches || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
    .catch(() => { /* sem suporte: segue normal */ });
}

let rotateDismissed = false;
function checkOrientation() {
  const portrait = innerHeight > innerWidth;
  const touch = matchMedia('(pointer: coarse)').matches;
  ui.rotate.hidden = !(portrait && touch && !rotateDismissed && !ui.hud.hidden);
}
ui.rotateDismiss.addEventListener('click', () => { rotateDismissed = true; checkOrientation(); });

// iOS ignora user-scalable=no: bloqueia o gesto de pinça na mão.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

let viewW = 0, viewH = 0, dpr = 1, tile = 32;

function readSafeArea() {
  const cs = getComputedStyle(ui.safeProbe);
  safe.top = parseFloat(cs.paddingTop) || 0;
  safe.right = parseFloat(cs.paddingRight) || 0;
  safe.bottom = parseFloat(cs.paddingBottom) || 0;
  safe.left = parseFloat(cs.paddingLeft) || 0;
}

/** Canvas na resolução real da tela (até 2x, para não pesar em celular simples). */
function resize() {
  viewW = canvas.clientWidth || innerWidth;
  viewH = canvas.clientHeight || innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  // ~11 casas no lado menor da tela: personagem do mesmo tamanho em qualquer celular.
  tile = Math.round(Math.max(28, Math.min(64, Math.min(viewW, viewH) / 11)));
  readSafeArea();
  layoutJoystick(viewW, viewH);
  checkOrientation();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

// ------------------------------------------------------------------ pixel art (gerada por código)

const PIX = 16;   // cada casa é desenhada em 16x16 "pixels" e ampliada sem suavizar

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function makeTile(draw) {
  const c = document.createElement('canvas');
  c.width = PIX;
  c.height = PIX;
  draw(c.getContext('2d'));
  return c;
}

function grassTile(seed, flowers) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#4f9a3a';
    g.fillRect(0, 0, PIX, PIX);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = r() < 0.5 ? '#438a31' : '#5fae47';
      g.fillRect(Math.floor(r() * PIX), Math.floor(r() * PIX), 1, 1);
    }
    for (let i = 0; i < 4; i++) {          // tufos
      const x = Math.floor(r() * (PIX - 2)), y = Math.floor(r() * (PIX - 3)) + 2;
      g.fillStyle = '#3a7a2b';
      g.fillRect(x, y, 1, 2);
      g.fillRect(x + 2, y, 1, 2);
      g.fillStyle = '#6cbd52';
      g.fillRect(x + 1, y - 1, 1, 3);
    }
    if (flowers) {
      for (let i = 0; i < 3; i++) {
        const x = 2 + Math.floor(r() * (PIX - 4)), y = 2 + Math.floor(r() * (PIX - 4));
        g.fillStyle = r() < 0.5 ? '#f1e9c9' : '#e9c74a';
        g.fillRect(x, y, 1, 1);
        g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1);
        g.fillStyle = '#c0602e';
        g.fillRect(x, y, 1, 1);
      }
    }
  });
}

function pathTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#b8935c';
    g.fillRect(0, 0, PIX, PIX);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = r() < 0.5 ? '#a8834e' : '#c9a56d';
      g.fillRect(Math.floor(r() * PIX), Math.floor(r() * PIX), 1, 1);
    }
    for (let i = 0; i < 3; i++) {          // pedrinhas
      g.fillStyle = '#8d7350';
      const x = Math.floor(r() * (PIX - 2)), y = Math.floor(r() * (PIX - 2));
      g.fillRect(x, y, 2, 1);
      g.fillStyle = '#d7bd8c';
      g.fillRect(x, y - 1, 1, 1);
    }
  });
}

function waterTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#1f4e66';
    g.fillRect(0, 0, PIX, PIX);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = r() < 0.5 ? '#2b6584' : '#173d52';
      const x = Math.floor(r() * (PIX - 4)), y = Math.floor(r() * PIX);
      g.fillRect(x, y, 3 + Math.floor(r() * 3), 1);
    }
  });
}

const TILES = {
  grass: [grassTile(1, false), grassTile(2, false), grassTile(3, false), grassTile(4, true)],
  path: [pathTile(7), pathTile(8)],
  water: [waterTile(11), waterTile(12)],
};

/** Hash estável por casa: o mesmo chão aparece sempre no mesmo lugar. */
function cellHash(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;      // >>> 0: sempre positivo (índice de tile válido)
}

/** Estrada de terra cruzando o ponto de nascimento: dá referência de movimento. */
function isPath(x, y) {
  return (y === 10 || x === 10) && x >= 0 && y >= 0;
}

// ------------------------------------------------------------------ desenho

let lastFrame = performance.now();

function frame(now) {
  requestAnimationFrame(frame);       // agenda antes: um erro num quadro não congela o jogo
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  try {
    update(dt);
    draw(now);
  } catch (err) {
    if (!frame.reported) { frame.reported = true; console.error('[desenho]', err); }
  }
}

function update(dt) {
  const me = state.players.get(state.meId);
  const { width, height, speed } = state.world;
  for (const p of state.players.values()) {
    if (p === me) continue;
    const k = Math.min(1, dt * 12);        // interpolação suave até a posição do servidor
    p.x += (p.tx - p.x) * k;
    p.y += (p.ty - p.y) * k;
  }
  if (me) {
    const moving = (dir.x !== 0 || dir.y !== 0) && state.connected;
    if (moving) {
      // Previsão local: anda já, sem esperar a rede.
      me.x = Math.max(0, Math.min(width, me.x + dir.x * speed * dt));
      me.y = Math.max(0, Math.min(height, me.y + dir.y * speed * dt));
    }
    // Correção pela posição oficial: forte parado, leve andando (o servidor está ~1 tick atrás).
    const ex = me.tx - me.x, ey = me.ty - me.y;
    const err = Math.hypot(ex, ey);
    if (err > 2.5) { me.x = me.tx; me.y = me.ty; }
    else {
      const k = Math.min(1, dt * (moving ? 1.5 : 10));
      me.x += ex * k;
      me.y += ey * k;
    }
  }
}

function draw(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const me = state.players.get(state.meId);
  const camX = me ? me.x : state.world.width / 2;
  const camY = me ? me.y : state.world.height / 2;
  const T = tile;
  const toScreenX = (wx) => Math.round((wx - camX) * T + viewW / 2);
  const toScreenY = (wy) => Math.round((wy - camY) * T + viewH / 2);

  // Chão: só as casas visíveis.
  const x0 = Math.floor(camX - viewW / 2 / T) - 1;
  const y0 = Math.floor(camY - viewH / 2 / T) - 1;
  const x1 = Math.ceil(camX + viewW / 2 / T) + 1;
  const y1 = Math.ceil(camY + viewH / 2 / T) + 1;
  const { width, height } = state.world;
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const h = cellHash(tx, ty);
      let img;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) img = TILES.water[h & 1];
      else if (isPath(tx, ty)) img = TILES.path[h & 1];
      else img = TILES.grass[(h % 23 === 0) ? 3 : h % 3];
      ctx.drawImage(img, toScreenX(tx), toScreenY(ty), T + 1, T + 1);
    }
  }

  // Borda do mapa.
  ctx.strokeStyle = 'rgba(20, 17, 13, 0.55)';
  ctx.lineWidth = Math.max(2, T / 10);
  ctx.strokeRect(toScreenX(0), toScreenY(0), width * T, height * T);

  // Efeitos de habilidade (anel que se expande).
  state.effects = state.effects.filter((fx) => now - fx.start < 450);
  for (const fx of state.effects) {
    const t = (now - fx.start) / 450;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = fx.color;
    ctx.lineWidth = Math.max(3, T * 0.12);
    ctx.beginPath();
    ctx.arc(toScreenX(me ? me.x : fx.x), toScreenY(me ? me.y : fx.y), T * (0.5 + t * 1.3), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Jogadores, de cima para baixo (quem está mais embaixo fica na frente).
  const list = [...state.players.values()].sort((a, b) => a.y - b.y);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (const p of list) drawPlayer(p, toScreenX(p.x), toScreenY(p.y), T, p.id === state.meId, now);

  drawJoystick();

  if (!me) {
    ctx.fillStyle = 'rgba(20, 17, 13, 0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
  }
}

function drawPlayer(p, sx, sy, T, isMe, now) {
  const r = T * 0.36;
  // sombra
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + r * 0.9, r * 0.95, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  // corpo
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(2, T * 0.07);
  ctx.strokeStyle = isMe ? '#fff8e8' : 'rgba(20, 17, 13, 0.85)';
  ctx.stroke();
  // faixa na testa (só um detalhe para dar cara de ninja)
  ctx.fillStyle = 'rgba(20, 17, 13, 0.75)';
  ctx.fillRect(sx - r * 0.85, sy - r * 0.45, r * 1.7, r * 0.28);

  // nome
  const fontSize = Math.max(11, Math.round(T * 0.32));
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';            // contorno do texto sem "espinhos" nas quinas
  ctx.strokeStyle = 'rgba(20, 17, 13, 0.9)';
  ctx.fillStyle = isMe ? '#ffe2a8' : '#f4ead8';
  const nameY = sy - r - 4;
  ctx.strokeText(p.username, sx, nameY);
  ctx.fillText(p.username, sx, nameY);

  // balão de chat
  if (p.bubble && now < p.bubble.until) {
    const text = p.bubble.text.length > 40 ? `${p.bubble.text.slice(0, 39)}…` : p.bubble.text;
    ctx.font = `${Math.max(12, Math.round(T * 0.34))}px system-ui, -apple-system, sans-serif`;
    const w = ctx.measureText(text).width + 14;
    const h = fontSize + 12;
    const by = nameY - fontSize - 6;
    ctx.fillStyle = 'rgba(255, 250, 238, 0.95)';
    roundRect(sx - w / 2, by - h, w, h, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx - 5, by); ctx.lineTo(sx + 5, by); ctx.lineTo(sx, by + 5);
    ctx.fill();
    ctx.fillStyle = '#14110d';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, sx, by - h / 2);
    ctx.textBaseline = 'bottom';
  } else if (p.bubble) {
    p.bubble = null;
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawJoystick() {
  if (ui.hud.hidden) return;
  const active = joy.pointerId !== null;
  ctx.globalAlpha = active ? 0.9 : 0.55;
  ctx.fillStyle = 'rgba(20, 17, 13, 0.45)';
  ctx.strokeStyle = 'rgba(244, 234, 216, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(joy.baseX, joy.baseY, joy.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = active ? '#f0a03c' : 'rgba(244, 234, 216, 0.85)';
  ctx.beginPath();
  ctx.arc(joy.baseX + joy.knobX, joy.baseY + joy.knobY, joy.radius * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ início

resize();
requestAnimationFrame(frame);
if (readToken()) startGame();
else showLogin();
