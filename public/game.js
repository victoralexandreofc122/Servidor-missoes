// MMO Ninja — cliente web (JavaScript puro, sem bibliotecas).
//
// O SERVIDOR DECIDE TUDO no combate: este cliente só pede ("usa Fogo", "renascer") e
// desenha o que o servidor responde (acertos, dano, vida, chakra, morte, XP).
//
// Fluxo: login (POST /auth/login) -> JWT no localStorage -> WebSocket /game.
// O token vai no subprotocolo do WebSocket ("jwt.<token>"), num cabeçalho: nunca na URL.
// Movimento autoritativo: o joystick manda só a direção; quem calcula a posição é o
// servidor. O cliente prevê o próprio movimento para a resposta ser imediata e corrige
// com a posição oficial que chega a cada tick.

import { CAMERA, FOCUS_RANGE, frameCamera, keepFocus, nextTarget, smoothing } from './targeting.js';

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
  chat: $('chat'), chatFeed: $('chat-feed'), chatInput: $('chat-input'),
  chatToggle: $('chat-toggle'), logout: $('logout'),
  skills: $('skills'),
  login: $('login'), loginForm: $('login-form'), loginError: $('login-error'), loginSubmit: $('login-submit'),
  toggleMode: $('toggle-mode'), usernameField: $('username-field'), passwordHint: $('password-hint'),
  rotate: $('rotate'), rotateDismiss: $('rotate-dismiss'), safeProbe: $('safe-probe'),
  hpFill: $('hp-fill'), hpText: $('hp-text'), chakraFill: $('chakra-fill'), chakraText: $('chakra-text'),
  targetBtn: $('target-btn'), meditateBtn: $('meditate-btn'),
  xpLine: $('xp-line'), hurt: $('hurt'), death: $('death'), deathTimer: $('death-timer'), respawn: $('respawn'),
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
  world: { width: 100, height: 100, speed: 5, tickMs: 50, spawn: { x: 50, y: 50 }, respawnMs: 5000, skills: {}, promotion: { xp: 100 } },
  /** Barras do próprio jogador (vêm do servidor). */
  me: { hp: 100, maxHp: 100, chakra: 100, maxChakra: 100, shield: false, xp: 0, rank: { code: 'ACADEMY', name: 'Academia' }, dead: false, meditating: false },
  /** Monstro focado pelo botão 🎯 (id) ou null. */
  focusId: null,
  /** id -> { id, type, x, y, tx, ty, hp, maxHp, stunnedUntil, rootedUntil, bornAt, diedAt } */
  monsters: new Map(),
  /** números flutuantes: { x, y, text, color, start, size } */
  floaters: [],
  ws: null,
  connected: false,
  everOpened: false,
  failures: 0,
  reconnectTimer: null,
  effects: [],          // efeitos de habilidade: { skill, x, y, fx, fy, start }
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
  state.monsters.clear();
  state.meId = null;
  setFocus(null);
  hideDeath();
}

function send(message) {
  const ws = state.ws;
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

// Cores que contrastam com a grama (nada de verde): cada jogador ganha uma, fixa pelo id.
const PLAYER_COLORS = ['#e8572f', '#3c9be0', '#9a6be0', '#f2c230', '#e04f8a', '#f08a3c', '#47c6d1', '#d94848', '#7d8cf0', '#f5f0e1'];
const LIGHT_COLORS = new Set(['#f2c230', '#47c6d1', '#f5f0e1']);   // nestas, a inicial vai em preto
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
    if (p.hp !== undefined) { existing.hp = p.hp; existing.maxHp = p.maxHp; existing.dead = p.dead; existing.meditating = !!p.meditating; }
    return existing;
  }
  const color = colorFor(p.id);
  const player = {
    id: p.id, username: p.username, x: p.x, y: p.y, tx: p.x, ty: p.y, color, bubble: null,
    hp: p.hp ?? 100, maxHp: p.maxHp ?? 100, dead: !!p.dead, meditating: !!p.meditating,
    initial: ([...p.username][0] || '?').toUpperCase(),
    initialColor: LIGHT_COLORS.has(color) ? '#14110d' : '#ffffff',
  };
  state.players.set(p.id, player);
  return player;
}

function upsertMonster(m, now) {
  state.monsters.set(m.id, {
    id: m.id, type: m.type, x: m.x, y: m.y, tx: m.x, ty: m.y, hp: m.hp, maxHp: m.maxHp,
    stunnedUntil: 0, rootedUntil: 0, bornAt: now, diedAt: 0,
  });
}

const CAST_FAIL_TEXT = {
  NO_CHAKRA: 'Chakra insuficiente', COOLDOWN: 'Recarregando…', NO_TARGET: 'Nenhum monstro perto',
  FULL_HP: 'Vida cheia', ALREADY_ACTIVE: 'Escudo já ativo', DEAD: 'Você está derrotado', OUT_OF_RANGE: 'Alvo fora de alcance',
};

function handleMessage(msg) {
  const now = performance.now();
  switch (msg.type) {
    case 'welcome': {
      state.players.clear();
      state.monsters.clear();
      state.meId = msg.you.id;
      if (msg.world) {
        const w = msg.world, old = state.world;
        if (w.width !== old.width || w.height !== old.height || w.spawn?.x !== old.spawn?.x || w.spawn?.y !== old.spawn?.y) chunkCache.clear();
        state.world = w;
        setupSkillButtons(w.skills || {});
      }
      upsertPlayer(msg.you, true);
      for (const p of msg.players) upsertPlayer(p, true);
      for (const m of msg.monsters || []) upsertMonster(m, now);
      Object.assign(state.me, {
        hp: msg.you.hp, maxHp: msg.you.maxHp, chakra: msg.you.chakra, maxChakra: msg.you.maxChakra,
        shield: msg.you.shield, xp: msg.you.xp, rank: msg.you.rank, dead: msg.you.dead, meditating: !!msg.you.meditating,
      });
      setFocus(null);
      renderActions();
      renderVitals();
      if (msg.you.dead) showDeath(state.world.respawnMs);
      else hideDeath();
      updateOnline();
      break;
    }
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
      if (p) p.bubble = { text: msg.message, until: now + 4500 };
      break;
    }

    // ---- combate (tudo decidido pelo servidor)
    case 'stats':
      Object.assign(state.me, { hp: msg.hp, maxHp: msg.maxHp, chakra: msg.chakra, maxChakra: msg.maxChakra, shield: msg.shield });
      renderVitals();
      break;
    case 'player_hp': {
      const p = state.players.get(msg.playerId);
      if (p) { p.hp = msg.hp; p.maxHp = msg.maxHp; }
      break;
    }
    case 'cast': {
      state.effects.push({ skill: msg.skill, x: msg.x, y: msg.y, fx: msg.fx, fy: msg.fy, start: now });
      if (msg.playerId === state.meId) {
        console.log(`[habilidade] ${msg.skill}`);
        startCooldown(msg.skill);
      }
      break;
    }
    case 'cast_failed': {
      const me = state.players.get(state.meId);
      if (me) addFloater(me.x, me.y - 0.9, CAST_FAIL_TEXT[msg.reason] || 'Não deu', '#d8cdb8', 0.75);
      break;
    }
    case 'hit': {
      const target = msg.target === 'monster' ? state.monsters.get(msg.id) : state.players.get(msg.id);
      if (!target) break;
      target.hp = msg.hp;
      target.maxHp = msg.maxHp;
      const heal = msg.kind === 'heal';
      const mine = msg.target === 'player' && msg.id === state.meId;
      const color = heal ? '#6cf08a' : msg.target === 'monster' ? '#fff3c4' : '#ff6b5a';
      const text = heal ? `+${msg.amount}` : `-${msg.amount}${msg.shielded ? ' 🛡' : ''}`;
      addFloater(target.x, target.y - 0.6, text, color, mine || msg.target === 'monster' ? 1.15 : 0.9);
      if (mine) {
        state.me.hp = msg.hp;
        renderVitals();
        if (!heal) flashHurt();
      }
      break;
    }
    case 'monsters_moved':
      for (const [id, x, y] of msg.m) {
        const m = state.monsters.get(id);
        if (m) { m.tx = x; m.ty = y; }
      }
      break;
    case 'monster_spawned':
      upsertMonster(msg.monster, now);
      break;
    case 'monster_status': {
      const m = state.monsters.get(msg.id);
      if (m) {
        if (msg.status === 'stunned') m.stunnedUntil = now + msg.ms;
        else m.rootedUntil = now + msg.ms;
      }
      break;
    }
    case 'monster_died': {
      const m = state.monsters.get(msg.id);
      if (m) { m.diedAt = now; m.hp = 0; }
      if (state.focusId === msg.id) setFocus(null);
      break;
    }
    case 'meditation': {
      const p = state.players.get(msg.playerId);
      if (p) p.meditating = msg.active;
      if (msg.playerId === state.meId) {
        state.me.meditating = msg.active;
        renderActions();
        const me = state.players.get(state.meId);
        if (!msg.active && me && msg.reason === 'damaged') addFloater(me.x, me.y - 1.1, 'Meditação interrompida!', '#ff9a8a', 0.9);
        else if (!msg.active && me && (msg.reason === 'moved' || msg.reason === 'cast')) addFloater(me.x, me.y - 1.1, 'Meditação encerrada', '#bcd6f0', 0.75);
      }
      break;
    }
    case 'player_died': {
      const p = state.players.get(msg.playerId);
      if (p) { p.dead = true; p.hp = 0; }
      if (msg.playerId === state.meId) {
        state.me.dead = true;
        state.me.hp = 0;
        state.me.meditating = false;
        setFocus(null);
        renderActions();
        renderVitals();
        keys.clear();
        setDirection(0, 0);
        showDeath(msg.respawnInMs);
      }
      break;
    }
    case 'player_respawned': {
      const p = state.players.get(msg.playerId);
      if (p) {
        Object.assign(p, { dead: false, hp: msg.hp, maxHp: msg.maxHp, x: msg.x, y: msg.y, tx: msg.x, ty: msg.y });
      }
      if (msg.playerId === state.meId) {
        state.me.dead = false;
        hideDeath();
      }
      break;
    }
    case 'xp': {
      state.me.xp = msg.totalXp;
      state.me.rank = msg.rank;
      renderVitals();
      const me = state.players.get(state.meId);
      if (me) addFloater(me.x, me.y - 1.2, `+${msg.gained} XP`, '#ffd76a', 1.1);
      if (msg.promoted) showToast(`Você subiu para ${msg.rank.name}!`, 4000);
      break;
    }
    case 'announce':
      addSystemLine(msg.message);
      break;
    case 'error':
      if (msg.code === 'CHAT_RATE_LIMITED' || msg.code === 'CHAT_INVALID') addSystemLine(msg.message);
      else if (msg.code === 'RESPAWN_NOT_READY') setTimeout(() => { ui.respawn.disabled = false; }, 800);
      else console.warn('[servidor]', msg.code, msg.message);
      break;
    default:
      break;
  }
}

// ---- HUD de combate

function renderVitals() {
  const m = state.me;
  const hpRatio = m.maxHp ? Math.max(0, Math.min(1, m.hp / m.maxHp)) : 0;
  const chRatio = m.maxChakra ? Math.max(0, Math.min(1, m.chakra / m.maxChakra)) : 0;
  ui.hpFill.style.transform = `scaleX(${hpRatio})`;
  ui.chakraFill.style.transform = `scaleX(${chRatio})`;
  ui.hpText.textContent = `${m.hp} / ${m.maxHp}`;
  ui.chakraText.textContent = `${m.chakra} / ${m.maxChakra}`;
  ui.hpFill.parentElement.setAttribute('aria-valuenow', String(m.hp));
  ui.chakraFill.parentElement.setAttribute('aria-valuenow', String(m.chakra));
  ui.hpFill.parentElement.classList.toggle('shielded', !!m.shield);
  const goal = state.world.promotion && m.rank && m.rank.code === state.world.promotion.fromRank ? ` / ${state.world.promotion.xp}` : '';
  ui.xpLine.textContent = `${m.rank ? m.rank.name : ''} · ${m.xp}${goal} XP`;
  for (const button of ui.skills.querySelectorAll('.skill')) {
    const cost = Number(button.dataset.cost || 0);
    button.classList.toggle('no-chakra', m.chakra < cost || m.dead);
  }
}

/** Custo de chakra em cada botão (vem do servidor no welcome). */
function setupSkillButtons(skills) {
  for (const button of ui.skills.querySelectorAll('.skill')) {
    const info = skills[button.dataset.skill];
    if (!info) continue;
    button.dataset.cost = String(info.cost);
    button.dataset.cooldown = String(info.cooldownMs);
    let badge = button.querySelector('.cost');
    if (!badge) {
      badge = document.createElement('i');
      badge.className = 'cost';
      badge.setAttribute('aria-hidden', 'true');
      button.append(badge);
    }
    badge.textContent = String(info.cost);
    button.setAttribute('aria-label', `${button.querySelector('small').textContent} (${info.cost} de chakra)`);
  }
}

function startCooldown(skill) {
  const button = ui.skills.querySelector(`[data-skill="${skill}"]`);
  if (!button) return;
  button.style.setProperty('--cd', `${Number(button.dataset.cooldown || 600) / 1000}s`);
  button.classList.remove('cooldown');
  void button.offsetWidth;   // reinicia a animação
  button.classList.add('cooldown');
}

function addFloater(x, y, text, color, size = 1) {
  state.floaters.push({ x, y, text, color, size, start: performance.now() });
  if (state.floaters.length > 40) state.floaters.shift();
}

function flashHurt() {
  ui.hurt.classList.remove('on');
  void ui.hurt.offsetWidth;
  ui.hurt.classList.add('on');
  if (navigator.vibrate) try { navigator.vibrate(40); } catch { /* sem vibração */ }
}

// ---- derrota e renascimento

let deathTimer = null;
function showDeath(ms) {
  ui.death.hidden = false;
  ui.respawn.disabled = true;
  closeChat();
  const until = performance.now() + (ms || 0);
  clearInterval(deathTimer);
  const tickDeath = () => {
    const left = Math.ceil((until - performance.now()) / 1000);
    if (left > 0) {
      ui.deathTimer.textContent = `Você poderá renascer em ${left} s`;
    } else {
      ui.deathTimer.textContent = 'Pronto para voltar ao centro do mapa.';
      ui.respawn.disabled = false;
      clearInterval(deathTimer);
    }
  };
  tickDeath();
  deathTimer = setInterval(tickDeath, 250);
}
function hideDeath() {
  clearInterval(deathTimer);
  ui.death.hidden = true;
}
ui.respawn.addEventListener('click', () => {
  ui.respawn.disabled = true;
  send({ type: 'respawn' });
});

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
  if (state.me.dead) { x = 0; y = 0; }     // derrotado não anda (o servidor também ignora)
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

// Joystick FLUTUANTE: a base nasce onde o polegar encosta (na metade esquerda de baixo
// da tela) e volta para o canto ao soltar. Ninguém precisa mirar num círculo pequeno.
// Pointer Events = toque, mouse e caneta; multitoque funciona (joystick com um dedo,
// habilidade com outro).
const joy = { pointerId: null, restX: 0, restY: 0, baseX: 0, baseY: 0, radius: 64, knobX: 0, knobY: 0 };
const safe = { top: 0, right: 0, bottom: 0, left: 0 };

function layoutJoystick(w, h) {
  joy.radius = Math.round(Math.max(52, Math.min(84, Math.min(w, h) * 0.15)));
  joy.restX = safe.left + 22 + joy.radius;
  joy.restY = h - safe.bottom - 22 - joy.radius;
  if (joy.pointerId === null) { joy.baseX = joy.restX; joy.baseY = joy.restY; }
}

function inJoystickZone(x, y, w, h) {
  return x < w * 0.5 && y > h * 0.3;
}

canvas.addEventListener('pointerdown', (e) => {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (joy.pointerId !== null || !inJoystickZone(e.clientX, e.clientY, w, h)) return;
  e.preventDefault();
  joy.pointerId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  // Base onde o dedo tocou, sem deixar o círculo sair da tela.
  const r = joy.radius;
  joy.baseX = Math.max(safe.left + r + 6, Math.min(w / 2 - 4, e.clientX));
  joy.baseY = Math.max(h * 0.3 + r * 0.5, Math.min(h - safe.bottom - r - 6, e.clientY));
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
  joy.baseX = joy.restX;
  joy.baseY = joy.restY;
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
  if (e.key >= '1' && e.key <= '7') castSkill(SKILL_ORDER[Number(e.key) - 1]);
  if (e.key === 'Enter' && ui.chat.hidden && !ui.hud.hidden) { openChat(); e.preventDefault(); }
  if (e.key === 't' || e.key === 'T' || e.key === 'Tab') { cycleFocus(); e.preventDefault(); }
  if (e.key === 'm' || e.key === 'M') toggleMeditation();
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code] && keys.delete(e.code)) keyDirection();
});

// App em segundo plano ou aba trocada: para de andar.
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); joy.pointerId = null; joy.knobX = joy.knobY = 0; setDirection(0, 0); } });
window.addEventListener('blur', () => { keys.clear(); if (joy.pointerId === null) setDirection(0, 0); });

// ------------------------------------------------------------------ habilidades

/** As 7 habilidades: cor e duração do efeito no canvas (só visual, o servidor só valida). */
const SKILLS = {
  fire: { color: '#ff2e1f', ms: 520 },
  water: { color: '#3ca6ff', ms: 700 },
  taijutsu: { color: '#f2b13a', ms: 380 },
  illusion: { color: '#a072ff', ms: 800 },
  shadow: { color: '#2a2140', ms: 900 },
  stone: { color: '#9a7448', ms: 650 },
  heal: { color: '#5fe07a', ms: 900 },
};
const GROUND_FX = new Set(['shadow', 'water']);
/** Habilidades que miram no alvo focado (Taijutsu: sempre o mais perto; Pedra e Cura: em si mesmo). */
const DIRECTED = new Set(['fire', 'water', 'illusion', 'shadow']);

// ------------------------------------------------------------------ foco (🎯) e meditação (🧘)

/** Botão 🎯: foca o mais perto; com foco, passa para o próximo mais perto (ciclo). */
function cycleFocus() {
  const me = state.players.get(state.meId);
  if (!me || state.me.dead) return;
  const id = nextTarget(me, state.monsters.values(), state.focusId, FOCUS_RANGE);
  if (!id) {
    setFocus(null);
    addFloater(me.x, me.y - 1.1, 'Nenhum alvo perto', '#d8cdb8', 0.8);
    return;
  }
  setFocus(id);
}

function setFocus(id) {
  state.focusId = id;
  ui.targetBtn.classList.toggle('active', !!id);
  ui.targetBtn.setAttribute('aria-pressed', id ? 'true' : 'false');
}

/** Botão 🧘: pede para começar/parar. O estado só muda quando o servidor confirma ("meditation"). */
function toggleMeditation() {
  if (!state.connected || state.me.dead) return;
  send({ type: 'meditate', active: !state.me.meditating });
}

function renderActions() {
  const on = !!state.me.meditating;
  ui.meditateBtn.classList.toggle('active', on);
  ui.meditateBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  ui.chakraFill.parentElement.classList.toggle('meditating', on);
}

ui.targetBtn.addEventListener('click', cycleFocus);
ui.meditateBtn.addEventListener('click', toggleMeditation);
const SKILL_ORDER = ['fire', 'water', 'taijutsu', 'illusion', 'shadow', 'stone', 'heal'];
const cooldownUntil = {};

/**
 * Só PEDE a habilidade. Animação, recarga, custo e dano só acontecem quando o servidor
 * confirma (mensagem "cast" / "hit"); se ele recusar, aparece o motivo sobre o personagem.
 */
const lastTap = {};
function castSkill(skill) {
  if (!SKILLS[skill] || !state.connected || state.me.dead) return;
  const now = performance.now();
  if (now - (lastTap[skill] || 0) < 150) return;     // toque duplo acidental
  lastTap[skill] = now;
  // Jutsu direcionado: com alvo focado, vai o targetId (o servidor mira e confere o alcance).
  const targetId = DIRECTED.has(skill) && state.focusId ? state.focusId : undefined;
  send(targetId ? { type: 'cast', skill, targetId } : { type: 'cast', skill });
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

// O botão 💬 abre a barra de digitação. As mensagens aparecem na tela (canto superior
// esquerdo) e somem sozinhas depois de ~6 s (animação CSS); também viram balão sobre o boneco.
const FEED_MAX = 6;

function openChat() {
  ui.chat.hidden = false;
  ui.chatToggle.setAttribute('aria-expanded', 'true');
  ui.chatInput.focus();
}
function closeChat() {
  ui.chat.hidden = true;
  ui.chatToggle.setAttribute('aria-expanded', 'false');
  ui.chatInput.blur();
}
ui.chatToggle.addEventListener('click', () => (ui.chat.hidden ? openChat() : closeChat()));

ui.chat.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = ui.chatInput.value.trim();
  if (!message) return closeChat();
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
}
function addSystemLine(text) {
  const li = document.createElement('li');
  li.className = 'system';
  li.textContent = text;
  appendLine(li);
}
function appendLine(li) {
  // Remove a linha quando o fade termina (sem timers por mensagem).
  li.addEventListener('animationend', (e) => { if (e.animationName === 'feed-out') li.remove(); });
  ui.chatFeed.append(li);
  while (ui.chatFeed.children.length > FEED_MAX) ui.chatFeed.firstElementChild.remove();
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

/** Estrada de terra cruzando o centro (onde se nasce e renasce): dá referência de movimento. */
function isPath(x, y) {
  const { spawn } = state.world;
  return (y === spawn.y || x === spawn.x) && x >= 0 && y >= 0;
}

function tileAt(x, y, width, height) {
  const h = cellHash(x, y);
  if (x < 0 || y < 0 || x >= width || y >= height) return TILES.water[h & 1];
  if (isPath(x, y)) return TILES.path[h & 1];
  return TILES.grass[h % 23 === 0 ? 3 : h % 3];
}

// Chão em BLOCOS de 16x16 casas, desenhados uma vez na resolução da pixel art (256x256 px)
// e guardados. Cada quadro desenha só ~4 a 9 imagens em vez de ~300 casas.
const CHUNK = 16;
const CHUNK_CACHE_MAX = 64;          // ~64 x 256 KB = 16 MB no máximo
const chunkCache = new Map();        // "cx,cy" -> canvas (ordem de uso = LRU)

function chunkCanvas(cx, cy) {
  const key = `${cx},${cy}`;
  let c = chunkCache.get(key);
  if (c) {
    chunkCache.delete(key);          // marca como usado agora
    chunkCache.set(key, c);
    return c;
  }
  c = document.createElement('canvas');
  c.width = c.height = CHUNK * PIX;
  const g = c.getContext('2d');
  const { width, height } = state.world;
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) g.drawImage(tileAt(cx * CHUNK + tx, cy * CHUNK + ty, width, height), tx * PIX, ty * PIX);
  }
  chunkCache.set(key, c);
  if (chunkCache.size > CHUNK_CACHE_MAX) chunkCache.delete(chunkCache.keys().next().value);
  return c;
}

// ------------------------------------------------------------------ loop de desenho

let lastFrame = performance.now();
const drawList = [];                 // reaproveitada a cada quadro (sem lixo para o coletor)

function frame(now) {
  requestAnimationFrame(frame);       // agenda antes: um erro num quadro não congela o jogo
  const dt = Math.max(0, Math.min(0.1, (now - lastFrame) / 1000));
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
  const k = Math.min(1, dt * 12);     // interpolação suave dos outros até a posição do servidor
  for (const p of state.players.values()) {
    if (p === me) continue;
    p.x += (p.tx - p.x) * k;
    p.y += (p.ty - p.y) * k;
  }
  for (const m of state.monsters.values()) {
    m.x += (m.tx - m.x) * k;
    m.y += (m.ty - m.y) * k;
  }
  // Foco perdido: alvo morreu/sumiu ou o jogador andou para longe (mais de 12 casas).
  if (state.focusId && me && !keepFocus(me, state.monsters.get(state.focusId))) setFocus(null);
  if (me) updateCamera(dt, me);
  if (me) {
    // Meditando o servidor não anda: sem previsão até ele confirmar o fim da meditação.
    const moving = (dir.x !== 0 || dir.y !== 0) && state.connected && !state.me.dead && !state.me.meditating;
    if (moving) {
      // Previsão local: anda já, sem esperar a rede.
      me.x = Math.max(0, Math.min(width, me.x + dir.x * speed * dt));
      me.y = Math.max(0, Math.min(height, me.y + dir.y * speed * dt));
    }
    // Correção pela posição oficial: forte parado, leve andando (o servidor está ~1 tick atrás).
    const ex = me.tx - me.x, ey = me.ty - me.y;
    if (Math.hypot(ex, ey) > 2.5) { me.x = me.tx; me.y = me.ty; }
    else {
      const c = Math.min(1, dt * (moving ? 1.5 : 10));
      me.x += ex * c;
      me.y += ey * c;
    }
  }
}

// Câmera: segue o jogador. Com alvo focado, desliza (lerp) para o meio do caminho entre os dois
// e afasta o zoom só o necessário para os dois caberem; sem alvo, volta suave para o jogador.
const cam = { ox: 0, oy: 0, scale: 1 };
function updateCamera(dt, me) {
  const target = state.focusId ? state.monsters.get(state.focusId) : null;
  const want = frameCamera(me, target, viewW, viewH, tile, CAMERA);
  const k = smoothing(dt, CAMERA.followRate);
  cam.ox += (want.ox - cam.ox) * k;
  cam.oy += (want.oy - cam.oy) * k;
  cam.scale += (want.scale - cam.scale) * k;
}

function draw(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const me = state.players.get(state.meId);
  const { width, height } = state.world;
  const camX = me ? me.x + cam.ox : width / 2;
  const camY = me ? me.y + cam.oy : height / 2;
  const T = Math.max(8, Math.round(tile * cam.scale));   // inteiro: o chão em blocos não abre frestas
  const halfW = viewW / 2, halfH = viewH / 2;
  const toScreenX = (wx) => Math.round((wx - camX) * T + halfW);
  const toScreenY = (wy) => Math.round((wy - camY) * T + halfH);

  // 1. Chão (blocos em cache).
  const left = camX - halfW / T, right = camX + halfW / T, top = camY - halfH / T, bottom = camY + halfH / T;
  const cx0 = Math.floor(left / CHUNK), cx1 = Math.floor(right / CHUNK);
  const cy0 = Math.floor(top / CHUNK), cy1 = Math.floor(bottom / CHUNK);
  const size = CHUNK * T;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) ctx.drawImage(chunkCanvas(cx, cy), toScreenX(cx * CHUNK), toScreenY(cy * CHUNK), size, size);
  }

  // 2. Grade do mapa (um único traço para todas as linhas visíveis).
  const gx0 = Math.max(0, Math.ceil(left)), gx1 = Math.min(width, Math.floor(right));
  const gy0 = Math.max(0, Math.ceil(top)), gy1 = Math.min(height, Math.floor(bottom));
  const sTop = Math.max(0, toScreenY(0)), sBottom = Math.min(viewH, toScreenY(height));
  const sLeft = Math.max(0, toScreenX(0)), sRight = Math.min(viewW, toScreenX(width));
  ctx.beginPath();
  for (let x = gx0; x <= gx1; x++) { const sx = toScreenX(x) + 0.5; ctx.moveTo(sx, sTop); ctx.lineTo(sx, sBottom); }
  for (let y = gy0; y <= gy1; y++) { const sy = toScreenY(y) + 0.5; ctx.moveTo(sLeft, sy); ctx.lineTo(sRight, sy); }
  ctx.strokeStyle = 'rgba(16, 48, 12, 0.22)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 3. Borda do mapa.
  ctx.strokeStyle = 'rgba(20, 17, 13, 0.6)';
  ctx.lineWidth = Math.max(2, T / 10);
  ctx.strokeRect(toScreenX(0), toScreenY(0), width * T, height * T);

  // 4. Efeitos de habilidade: os "de chão" (Sombra, Água) por baixo dos bonecos, o resto por cima.
  let alive = 0;
  for (const fx of state.effects) if (now - fx.start < SKILLS[fx.skill].ms) state.effects[alive++] = fx;
  state.effects.length = alive;
  for (const fx of state.effects) if (GROUND_FX.has(fx.skill)) drawEffect(fx, toScreenX(fx.x), toScreenY(fx.y), T, now);

  // Linha pontilhada do jogador até o alvo focado.
  const focused = state.focusId ? state.monsters.get(state.focusId) : null;
  if (me && focused) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -now / 40;
    ctx.beginPath(); ctx.moveTo(toScreenX(me.x), toScreenY(me.y)); ctx.lineTo(toScreenX(focused.x), toScreenY(focused.y)); ctx.stroke();
    ctx.restore();
  }

  // 5. Monstros e jogadores juntos, de cima para baixo (quem está mais embaixo fica na frente).
  drawList.length = 0;
  for (const m of state.monsters.values()) {
    if (m.diedAt && now - m.diedAt > 450) { state.monsters.delete(m.id); continue; }   // terminou de sumir
    drawList.push(m);
  }
  for (const p of state.players.values()) drawList.push(p);
  if (drawList.length > 1) drawList.sort((a, b) => a.y - b.y);
  ctx.textAlign = 'center';
  for (const e of drawList) {
    if (e.type) drawMonster(e, toScreenX(e.x), toScreenY(e.y), T, now);
    else drawPlayer(e, toScreenX(e.x), toScreenY(e.y), T, e.id === state.meId, now);
  }

  for (const fx of state.effects) if (!GROUND_FX.has(fx.skill)) drawEffect(fx, toScreenX(fx.x), toScreenY(fx.y), T, now);

  // 6. Números flutuantes (dano, cura, XP, avisos).
  drawFloaters(toScreenX, toScreenY, T, now);

  drawJoystick();

  if (!me) {
    ctx.fillStyle = 'rgba(20, 17, 13, 0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
  }
}

/** Animação de cada habilidade (só feedback visual; t vai de 0 a 1). */
function drawEffect(fx, sx, sy, T, now) {
  const { color, ms } = SKILLS[fx.skill];
  // O "now" do quadro pode ser uns ms ANTERIOR à chegada da mensagem: t nunca negativo.
  const t = Math.max(0, (now - fx.start) / ms);
  const fade = 1 - t;
  ctx.save();
  switch (fx.skill) {
    case 'fire': {                       // círculo vermelho do tamanho da área real (3 casas)
      const r = T * 3 * (1 - (1 - t) * (1 - t));
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#ff7a3a';
      ctx.lineWidth = Math.max(2, T * 0.1);
      ctx.stroke();
      break;
    }
    case 'water': {                      // cone azul na direção em que o jogador olha (4 casas, 90°)
      const a = Math.atan2(fx.fy || 0, fx.fx || 0);
      const r = T * 4 * Math.min(1, t * 1.6);
      ctx.globalAlpha = 0.45 * fade;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.arc(sx, sy, r, a - Math.PI / 4, a + Math.PI / 4); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#bfe3ff';
      ctx.lineWidth = Math.max(2, T * 0.08);
      ctx.beginPath(); ctx.arc(sx, sy, r, a - Math.PI / 4, a + Math.PI / 4); ctx.stroke();
      break;
    }
    case 'taijutsu': {                   // estouro de linhas (golpe)
      ctx.globalAlpha = fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, T * 0.1);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const r1 = T * (0.5 + 0.5 * t), r2 = T * (0.8 + 0.7 * t);   // alcance real: 1,5 casa
        ctx.moveTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
        ctx.lineTo(sx + Math.cos(a) * r2, sy + Math.sin(a) * r2);
      }
      ctx.stroke();
      break;
    }
    case 'illusion': {                   // três arcos roxos girando
      ctx.globalAlpha = fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, T * 0.1);
      ctx.lineCap = 'round';
      const r = T * (0.6 + 0.7 * t);
      for (let k = 0; k < 3; k++) {
        const a = t * 7 + (k * Math.PI * 2) / 3;
        ctx.beginPath(); ctx.arc(sx, sy, r, a, a + 1.3); ctx.stroke();
      }
      break;
    }
    case 'shadow': {                     // poça escura que se espalha no chão
      ctx.globalAlpha = 0.65 * fade;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(sx, sy + T * 0.3, T * (0.5 + 1.4 * t), T * (0.22 + 0.6 * t), 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7d5cc4';
      ctx.lineWidth = Math.max(1.5, T * 0.05);
      ctx.stroke();
      break;
    }
    case 'stone': {                      // pedrinhas pulando para fora
      const s = Math.max(4, Math.round(T * 0.2));
      ctx.globalAlpha = fade;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.3;
        const d = T * (0.4 + 1.3 * t);
        const px = Math.round(sx + Math.cos(a) * d - s / 2);
        const py = Math.round(sy + Math.sin(a) * d * 0.6 - Math.sin(Math.PI * t) * T * 0.7 - s / 2);
        ctx.fillStyle = color; ctx.fillRect(px, py, s, s);
        ctx.fillStyle = '#c9a678'; ctx.fillRect(px, py, s, Math.max(1, s / 3));
      }
      break;
    }
    case 'heal': {                       // brilho verde e cruzes subindo
      ctx.globalAlpha = 0.28 * fade;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(sx, sy, T * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade;
      const s = Math.max(3, Math.round(T * 0.08));
      for (let k = 0; k < 5; k++) {
        const px = Math.round(sx + (k - 2) * T * 0.3);
        const py = Math.round(sy - T * (0.3 + 1.4 * t + (k % 2) * 0.25));
        ctx.fillRect(px - s * 1.5, py - s / 2, s * 3, s);
        ctx.fillRect(px - s / 2, py - s * 1.5, s, s * 3);
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** Monstro provisório: círculo vermelho com "M", barra de vida e ícones de atordoado/preso. */
function drawMonster(m, sx, sy, T, now) {
  const born = Math.max(0.05, Math.min(1, (now - m.bornAt) / 250));
  const dying = m.diedAt ? Math.max(0, Math.min(1, (now - m.diedAt) / 450)) : 0;
  const stunned = now < m.stunnedUntil;
  const rooted = now < m.rootedUntil;
  const wobble = stunned || rooted || dying ? 0 : Math.sin(now / 180 + sx) * 0.06;
  const r = T * 0.4 * born * (1 - dying * 0.6);
  ctx.save();
  ctx.globalAlpha = 1 - dying;
  if (rooted) {                       // Sombra: mancha escura presa no chão
    ctx.fillStyle = 'rgba(42, 33, 64, 0.8)';
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.85, r * 1.5, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.9, r * 0.95, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = dying ? '#7a2a22' : '#d63a2c';
  ctx.beginPath(); ctx.ellipse(sx, sy, r * (1 + wobble), r * (1 - wobble), 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(2, T * 0.06);
  ctx.strokeStyle = '#4a0f0a';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.round(r * 1.05)}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('M', sx, sy + r * 0.06);
  if (stunned) {                      // Ilusão: estrelinhas girando
    ctx.fillStyle = '#ffe066';
    for (let k = 0; k < 3; k++) {
      const a = now / 250 + (k * Math.PI * 2) / 3;
      ctx.fillRect(Math.round(sx + Math.cos(a) * r * 0.9) - 2, Math.round(sy - r * 1.25 + Math.sin(a) * r * 0.3) - 2, 4, 4);
    }
  }
  if (!dying) drawHpBar(sx, sy - r - Math.max(6, T * 0.16), T * 0.8, m.hp / m.maxHp, '#ff5a4a');
  ctx.restore();
  if (m.id === state.focusId && !dying) drawFocusMarker(sx, sy, r, T, now);
}

/** Indicador do alvo focado: anel tracejado girando no chão + seta pulando em cima. */
function drawFocusMarker(sx, sy, r, T, now) {
  ctx.save();
  ctx.strokeStyle = '#ffb347';
  ctx.lineWidth = Math.max(2, T * 0.07);
  ctx.setLineDash([T * 0.22, T * 0.12]);
  ctx.lineDashOffset = -now / 30;
  ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.9, r * 1.55, r * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  const bob = Math.sin(now / 160) * T * 0.08;
  const ay = sy - r - T * 0.55 + bob;
  const s = Math.max(6, T * 0.2);
  ctx.fillStyle = '#ffb347';
  ctx.strokeStyle = 'rgba(20, 17, 13, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx - s, ay - s); ctx.lineTo(sx + s, ay - s); ctx.lineTo(sx, ay); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

/** Aura azul de quem medita: brilho pulsando + partículas de chakra subindo. */
function drawMeditationAura(sx, sy, r, T, now) {
  ctx.save();
  const pulse = 0.5 + 0.5 * Math.sin(now / 300);
  const g = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r * (2.2 + pulse * 0.5));
  g.addColorStop(0, 'rgba(70, 160, 255, 0.85)');
  g.addColorStop(0.6, 'rgba(70, 160, 255, 0.35)');
  g.addColorStop(1, 'rgba(70, 160, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, sy, r * (2.2 + pulse * 0.5), 0, Math.PI * 2); ctx.fill();
  // anel no chão, pulsando
  ctx.strokeStyle = `rgba(150, 210, 255, ${0.55 + 0.45 * pulse})`;
  ctx.lineWidth = Math.max(2, T * 0.07);
  ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.9, r * (1.3 + pulse * 0.25), r * (0.5 + pulse * 0.1), 0, 0, Math.PI * 2); ctx.stroke();
  // partículas de chakra subindo
  ctx.fillStyle = '#d6efff';
  const ps = Math.max(3, Math.round(T * 0.1));
  for (let k = 0; k < 8; k++) {
    const t = ((now / 900) + k / 8) % 1;
    const px = sx + Math.sin(k * 2.1 + now / 500) * r * 1.2;
    const py = sy + r * 0.8 - t * T * 1.4;
    ctx.globalAlpha = 1 - t;
    ctx.fillRect(Math.round(px - ps / 2), Math.round(py - ps / 2), ps, ps);
  }
  ctx.restore();
}

function drawHpBar(cx, y, w, ratio, color) {
  const h = 4;
  const x = Math.round(cx - w / 2);
  ctx.fillStyle = 'rgba(20, 17, 13, 0.8)';
  ctx.fillRect(x - 1, Math.round(y) - 1, Math.round(w) + 2, h + 2);
  ctx.fillStyle = color;
  ctx.fillRect(x, Math.round(y), Math.round(w * Math.max(0, Math.min(1, ratio))), h);
}

function drawFloaters(toScreenX, toScreenY, T, now) {
  const DUR = 900;
  let alive = 0;
  for (const f of state.floaters) if (now - f.start < DUR) state.floaters[alive++] = f;
  state.floaters.length = alive;
  if (!alive) return;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const f of state.floaters) {
    const t = Math.max(0, (now - f.start) / DUR);
    const size = Math.round(Math.max(12, T * 0.42) * f.size * (t < 0.15 ? 0.7 + t * 2 : 1));
    ctx.font = `800 ${size}px system-ui, -apple-system, sans-serif`;
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    const sx = toScreenX(f.x), sy = toScreenY(f.y) - t * T * 0.9;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(20, 17, 13, 0.95)';
    ctx.strokeText(f.text, sx, sy);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, sx, sy);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer(p, sx, sy, T, isMe, now) {
  if (p.dead) ctx.globalAlpha = 0.45;
  const r = T * 0.38;
  if (p.meditating && !p.dead) drawMeditationAura(sx, sy, r, T, now);
  // sombra no chão
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + r * 0.92, r * 0.95, r * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  // escudo de Pedra ativo (só sabemos o nosso)
  if (isMe && state.me.shield && !p.dead) {
    ctx.strokeStyle = '#c9a678';
    ctx.lineWidth = Math.max(3, T * 0.1);
    ctx.setLineDash([T * 0.18, T * 0.1]);
    ctx.beginPath(); ctx.arc(sx, sy, r * 1.45, now / 600, now / 600 + Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  // corpo: círculo com a inicial do nome (boneco provisório até termos sprites)
  ctx.fillStyle = p.dead ? '#6d665b' : p.color;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(2, T * 0.07);
  ctx.strokeStyle = isMe ? '#fff8e8' : 'rgba(20, 17, 13, 0.85)';
  ctx.stroke();
  ctx.font = `800 ${Math.round(r * 1.15)}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = p.initialColor;
  ctx.fillText(p.initial, sx, sy + r * 0.06);

  // nome
  const fontSize = Math.max(11, Math.round(T * 0.32));
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';            // contorno do texto sem "espinhos" nas quinas
  ctx.strokeStyle = 'rgba(20, 17, 13, 0.9)';
  ctx.fillStyle = isMe ? '#ffe2a8' : '#f4ead8';
  const nameY = sy - r - 4 - (isMe ? 0 : 7);
  ctx.strokeText(p.username, sx, nameY);
  ctx.fillText(p.username, sx, nameY);
  // vida dos outros jogadores (a nossa fica nas barras de baixo)
  if (!isMe && !p.dead) drawHpBar(sx, sy - r - 9, T * 0.8, p.hp / p.maxHp, '#7bd36a');
  ctx.globalAlpha = 1;

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
  ctx.globalAlpha = active ? 0.9 : 0.5;
  ctx.fillStyle = 'rgba(20, 17, 13, 0.45)';
  ctx.strokeStyle = 'rgba(244, 234, 216, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(joy.baseX, joy.baseY, joy.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const meditating = state.me.meditating;
  ctx.fillStyle = meditating ? 'rgba(111, 192, 255, 0.6)' : active ? '#f0a03c' : 'rgba(244, 234, 216, 0.85)';
  ctx.beginPath();
  ctx.arc(joy.baseX + joy.knobX, joy.baseY + joy.knobY, joy.radius * 0.48, 0, Math.PI * 2);
  ctx.fill();
  if (meditating) {                   // travado: mexer aqui encerra a meditação
    ctx.globalAlpha = 1;
    ctx.font = `${Math.round(joy.radius * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧘', joy.baseX, joy.baseY);
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ início

resize();
requestAnimationFrame(frame);
if (readToken()) startGame();
else showLogin();
