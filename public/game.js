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
import { groundAt, mapName, placements, visibleWalls } from './world.js';
import { DEFAULT_LOOK, dirFrom, drawCharacter, PARTS, PRESETS, safeLook } from './character.js';
import { Predictor, pushSnapshot, quantize, sampleSnapshots } from './prediction.js';

const TOKEN_KEY = 'nin.token';
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/game`;
const SUBPROTOCOL = 'nin.v1';

// ------------------------------------------------------------------ elementos

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const ui = {
  hud: $('hud'), status: $('status'), toast: $('toast'),
  chat: $('chat'), chatFeed: $('chat-feed'), chatInput: $('chat-input'),
  chatToggle: $('chat-toggle'), logout: $('logout'),
  combat: $('combat'), attackBtn: $('attack-btn'), runBtn: $('run-btn'), kitBtn: $('kit-btn'), kitLabel: $('kit-label'),
  slots: [...document.querySelectorAll('#combat .skill')],
  statusToggle: $('status-toggle'), statusBadge: $('status-badge'), statusPanel: $('status-panel'), statusClose: $('status-close'),
  statusLevel: $('status-level'), tabAttrs: $('tab-attrs'), tabKits: $('tab-kits'), paneAttrs: $('pane-attrs'), paneKits: $('pane-kits'),
  xpMeter: $('xp-meter'), xpFill: $('xp-fill'), xpCount: $('xp-count'), pointsLine: $('points-line'),
  attrRows: [...document.querySelectorAll('.attr-list li')], kitRows: [...document.querySelectorAll('.kit-list li')],
  kitCount: $('kit-count'), kitSave: $('kit-save'),
  playerMenu: $('player-menu'), pmName: $('pm-name'), pmRank: $('pm-rank'), pmClose: $('pm-close'), pmDeliver: $('pm-deliver'),
  pmCreate: $('pm-create'), pmForm: $('pm-form'), pmQty: $('pm-qty'), pmDiff: $('pm-diff'), pmSend: $('pm-send'), pmNote: $('pm-note'),
  settingsToggle: $('settings-toggle'), settingsPanel: $('settings-panel'), settingsClose: $('settings-close'),
  editLayout: $('edit-layout'), editBanner: $('edit-banner'), editDone: $('edit-done'), editReset: $('edit-reset'),
  resetLayout: $('reset-layout'), openCreator: $('open-creator'), vitals: $('vitals'),
  sliders: { btnScale: $('btn-scale'), btnOpacity: $('btn-opacity'), barScale: $('bar-scale'), barOpacity: $('bar-opacity') },
  creator: $('creator'), creatorCanvas: $('creator-canvas'), creatorTurn: $('creator-turn'), creatorPresets: $('creator-presets'),
  creatorInputs: [...document.querySelectorAll('#creator input[type=color]')], creatorError: $('creator-error'),
  creatorRandom: $('creator-random'), creatorCancel: $('creator-cancel'), creatorSave: $('creator-save'),
  evalPanel: $('eval-panel'), evalText: $('eval-text'), evalStars: $('eval-stars'), evalApprove: $('eval-approve'), evalReject: $('eval-reject'),
  login: $('login'), loginForm: $('login-form'), loginError: $('login-error'), loginSubmit: $('login-submit'),
  toggleMode: $('toggle-mode'), usernameField: $('username-field'), passwordHint: $('password-hint'),
  rotate: $('rotate'), rotateDismiss: $('rotate-dismiss'), safeProbe: $('safe-probe'),
  hpFill: $('hp-fill'), hpText: $('hp-text'), chakraFill: $('chakra-fill'), chakraText: $('chakra-text'),
  targetBtn: $('target-btn'), meditateBtn: $('meditate-btn'), talkBtn: $('talk-btn'),
  missionsToggle: $('missions-toggle'), missionsBadge: $('missions-badge'), missionsPanel: $('missions-panel'),
  missionsClose: $('missions-close'), missionCard: $('mission-card'), missionSensei: $('mission-sensei'),
  missionTitle: $('mission-title'), missionMeter: $('mission-meter'), missionFill: $('mission-fill'),
  missionCount: $('mission-count'), missionStatus: $('mission-status'), missionReward: $('mission-reward'),
  missionEmpty: $('mission-empty'), missionLast: $('mission-last'),
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
  world: { width: 50, height: 50, speed: 5, tickMs: 50, spawn: { x: 25, y: 25 }, respawnMs: 5000, skills: {}, promotion: { xp: 100 } },
  /** Layouts de todos os mapas (welcome), o mapa DESENHADO agora (o previsto) e o da última posição oficial. */
  maps: {},
  mapId: null,
  serverMap: null,
  /** Mapa atual + vizinhos costurados nas saídas (world.js) e as paredes visíveis (casas e árvores). */
  places: [],
  walls: [],
  /** Barras do próprio jogador (vêm do servidor). */
  me: {
    hp: 100, maxHp: 100, chakra: 100, maxChakra: 100, shield: false, xp: 0, rank: { code: 'ACADEMY', name: 'Academia' },
    dead: false, meditating: false, speed: 5, running: false, canBeSensei: false,
  },
  /** Ficha (nível, XP do nível, pontos, atributos e o que eles dão): SEMPRE a do servidor. */
  progress: null,
  /** Kit ativo e os 2 kits: só mudam quando o servidor confirma. */
  kit: { active: 'A', kits: { A: [], B: [] } },
  /** Sensei: dificuldades do catálogo (vêm do servidor) e quantidades aceitas. */
  senseiOptions: null,
  /** Pedidos de avaliação esperando o sensei (um por vez na tela). */
  evalQueue: [],
  /** Monstro focado pelo botão 🎯 (id) ou null. */
  focusId: null,
  /** NPCs (welcome): todos e só os do mapa atual. { id, name, map, x, y, range, npc: true, bubble } */
  allNpcs: [],
  npcs: [],
  /** NPC perto o bastante para conversar (mostra o botão 💬 Falar) ou null. */
  nearNpc: null,
  /** Missão atual (o servidor manda; null = nenhuma) e a última recompensa recebida. */
  mission: null,
  lastReward: null,
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
    setDirection(0, 0);
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
  state.mission = null;
  state.lastReward = null;
  renderMission();
  closeMissions();
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
    existing.map = state.serverMap;
    if (snap) { existing.x = p.x; existing.y = p.y; existing.snaps = [{ t: performance.now(), x: p.x, y: p.y }]; }
    else pushSnapshot(existing.snaps, performance.now(), p.x, p.y, state.world.tickMs || 50);
    if (p.hp !== undefined) { existing.hp = p.hp; existing.maxHp = p.maxHp; existing.dead = p.dead; existing.meditating = !!p.meditating; }
    if (p.rank) { existing.rank = p.rank; existing.level = p.level; }
    if (p.appearance) existing.look = safeLook(p.appearance);
    if (p.dir !== undefined) existing.dir = p.dir;
    return existing;
  }
  const color = colorFor(p.id);
  const player = {
    id: p.id, username: p.username, map: state.serverMap, x: p.x, y: p.y, tx: p.x, ty: p.y, color, bubble: null,
    // Posições que chegaram do servidor (interpolação: desenha ~100 ms no passado, sem pulos).
    snaps: [{ t: performance.now(), x: p.x, y: p.y }],
    hp: p.hp ?? 100, maxHp: p.maxHp ?? 100, dead: !!p.dead, meditating: !!p.meditating,
    rank: p.rank || null, level: p.level || 1,
    // Paperdoll: cores (do servidor), direção (0 baixo, 1 esq, 2 dir, 3 cima) e fase da caminhada.
    look: safeLook(p.appearance || DEFAULT_LOOK), dir: p.dir ?? 0, walk: 0, moving: false, lastX: p.x, lastY: p.y,
    initial: ([...p.username][0] || '?').toUpperCase(),
    initialColor: LIGHT_COLORS.has(color) ? '#14110d' : '#ffffff',
  };
  state.players.set(p.id, player);
  return player;
}

function upsertMonster(m, now) {
  state.monsters.set(m.id, {
    id: m.id, type: m.type, map: state.serverMap, x: m.x, y: m.y, tx: m.x, ty: m.y, hp: m.hp, maxHp: m.maxHp,
    stunnedUntil: 0, rootedUntil: 0, bornAt: now, diedAt: 0,
  });
}

const CAST_FAIL_TEXT = {
  NO_CHAKRA: 'Chakra insuficiente', COOLDOWN: 'Recarregando…', NO_TARGET: 'Nenhum monstro perto',
  FULL_HP: 'Vida cheia', ALREADY_ACTIVE: 'Escudo já ativo', DEAD: 'Você está derrotado', OUT_OF_RANGE: 'Alvo fora de alcance',
  NOT_EQUIPPED: 'Fora do kit ativo',
};

function handleMessage(msg) {
  const now = performance.now();
  switch (msg.type) {
    case 'welcome': {
      state.players.clear();
      state.monsters.clear();
      state.meId = msg.you.id;
      if (msg.world) {
        const w = msg.world;
        state.world = w;
        // Layouts de todos os mapas: paredes (casas e árvores), saídas e chão. São os MESMOS
        // que o servidor usa para colidir e trocar de mapa.
        state.maps = w.maps || {};
        state.serverMap = w.map;
        chunkCache.clear();
        state.allNpcs = (w.npcs || []).map((n) => ({ ...n, npc: true, bubble: null }));
      }
      state.mapId = null;
      upsertPlayer(msg.you, true);
      for (const p of msg.players) upsertPlayer(p, true);
      // Conexão nova = sessão nova no servidor: predição recomeça do zero na posição oficial.
      predWorld = { maps: state.maps, tickMs: state.world.tickMs || 50 };
      pred.reset(state.serverMap, msg.you.x, msg.you.y);
      enterMap(state.serverMap, true);
      for (const m of msg.monsters || []) upsertMonster(m, now);
      Object.assign(state.me, {
        hp: msg.you.hp, maxHp: msg.you.maxHp, chakra: msg.you.chakra, maxChakra: msg.you.maxChakra,
        shield: msg.you.shield, xp: msg.you.xp, rank: msg.you.rank, dead: msg.you.dead, meditating: !!msg.you.meditating,
        speed: msg.you.speed ?? state.world.speed, running: !!msg.you.running, canBeSensei: !!msg.you.canBeSensei,
        appearanceSet: msg.you.appearanceSet !== false, look: safeLook(msg.you.appearance || DEFAULT_LOOK),
      });
      // Primeira vez (conta nova ou antes da v6): Criador de Personagem.
      if (!state.me.appearanceSet) openCreator(true);
      if (msg.progress) state.progress = msg.progress;
      if (msg.kit) state.kit = msg.kit;
      state.evalQueue = [];
      renderEval();
      closePlayerMenu();
      renderKit();
      renderStatus();
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
    case 'map_changed': {
      // O SERVIDOR confirmou a troca de mapa (andou até o portão ou renasceu na Vila). O mapa
      // novo em si já pode estar na tela (a predição atravessa na hora); aqui chegam os
      // jogadores e monstros de lá. Os do mapa antigo somem.
      state.serverMap = msg.map;
      for (const id of [...state.players.keys()]) if (id !== state.meId) state.players.delete(id);
      state.monsters.clear();
      for (const p of msg.players) upsertPlayer(p, true);
      for (const m of msg.monsters) upsertMonster(m, now);
      const me = state.players.get(state.meId);
      if (me) { me.map = msg.map; me.tx = msg.x; me.ty = msg.y; }
      if (!predWorld) break;
      if (msg.reason === 'respawn') pred.teleport(msg.map, msg.x, msg.y);
      else pred.reconcile(msg.map, msg.x, msg.y, msg.a, predWorld);
      updateOnline();
      break;
    }
    case 'player_moved': {
      const p = state.players.get(msg.playerId);
      if (p) {
        p.tx = msg.x; p.ty = msg.y;
        if (msg.playerId === state.meId) {
          // Reconciliação: posição oficial + entradas ainda não confirmadas (prediction.js).
          if (predWorld && Number.isInteger(msg.a)) pred.reconcile(state.serverMap, msg.x, msg.y, msg.a, predWorld);
        } else {
          pushSnapshot(p.snaps, now, msg.x, msg.y, state.world.tickMs || 50);
        }
        // Direção do servidor (o próprio jogador usa a do joystick enquanto anda: resposta imediata).
        if (msg.d !== undefined && !(msg.playerId === state.meId && (dir.x !== 0 || dir.y !== 0))) p.dir = msg.d;
      }
      break;
    }
    case 'player_appearance': {
      const p = state.players.get(msg.playerId);
      if (p) p.look = safeLook(msg.appearance);
      if (msg.playerId === state.meId) {
        state.me.appearanceSet = true;
        state.me.look = safeLook(msg.appearance);
        closeCreator();
      }
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
      if (msg.speed !== undefined) { state.me.speed = msg.speed; state.me.running = !!msg.running; }
      renderVitals();
      renderActions();
      break;
    case 'progress': {
      const before = state.progress;
      state.progress = msg;
      renderStatus();
      renderVitals();
      if (before && msg.statPoints > before.statPoints) pulse(ui.statusToggle);
      break;
    }
    case 'kit':
      state.kit = { active: msg.active, kits: msg.kits };
      renderKit();
      renderStatus();
      break;
    case 'attack': {
      state.effects.push({ skill: 'attack', x: msg.x, y: msg.y, fx: msg.fx, fy: msg.fy, start: now });
      faceTo(msg.playerId, msg.fx, msg.fy);
      if (msg.playerId === state.meId) startCooldown('attack');
      break;
    }
    case 'attack_failed': {
      const me = state.players.get(state.meId);
      if (me && msg.reason !== 'COOLDOWN') addFloater(me.x, me.y - 0.9, CAST_FAIL_TEXT[msg.reason] || 'Não deu', '#d8cdb8', 0.75);
      break;
    }
    case 'player_rank': {
      const p = state.players.get(msg.playerId);
      if (p) { p.rank = msg.rank; p.level = msg.level; }
      break;
    }
    case 'sensei_options':
      state.senseiOptions = { difficulties: msg.difficulties, quantities: msg.quantities };
      break;
    case 'evaluation_request':
      if (!state.evalQueue.some((e) => e.missionId === msg.missionId)) state.evalQueue.push(msg);
      renderEval();
      if (navigator.vibrate) try { navigator.vibrate([40, 40, 40]); } catch { /* sem vibração */ }
      break;
    case 'notice':
      showToast(msg.text, 4500);
      addSystemLine(msg.text);
      break;
    case 'player_hp': {
      const p = state.players.get(msg.playerId);
      if (p) { p.hp = msg.hp; p.maxHp = msg.maxHp; }
      break;
    }
    case 'cast': {
      state.effects.push({ skill: msg.skill, x: msg.x, y: msg.y, fx: msg.fx, fy: msg.fy, start: now });
      faceTo(msg.playerId, msg.fx, msg.fy);
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
        p.snaps = [{ t: now, x: msg.x, y: msg.y }];
      }
      if (msg.playerId === state.meId) {
        pred.teleport(state.serverMap, msg.x, msg.y);
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

    // ---- missões (o servidor conta os abates e decide a conclusão; aqui só se mostra)
    case 'mission': {
      state.mission = msg.mission;
      if (msg.mission) state.lastReward = null;
      renderMission();
      const m = msg.mission;
      const me = state.players.get(state.meId);
      if (m && msg.reason === 'assigned') {
        showToast(`📜 Nova missão: ${missionTitle(m)}`, 4000);
        pulse(ui.missionsToggle);
      } else if (m && (msg.reason === 'progress' || msg.reason === 'ready')) {
        if (me) addFloater(me.x, me.y - 1.5, `📜 ${Math.min(m.progress, m.target.quantity)}/${m.target.quantity}`, '#ffd23f', 0.95);
        pulse(ui.missionsToggle);
        if (msg.reason === 'ready') {
          showToast(m.fromNpc ? '📜 Missão completa! Volte ao Mestre para entregar.' : `📜 Missão completa! Procure o sensei ${m.senseiName}.`, 5000);
          if (navigator.vibrate) try { navigator.vibrate([60, 60, 60]); } catch { /* sem vibração */ }
        }
      }
      break;
    }
    case 'npc_say': {
      const npc = state.npcs.find((n) => n.id === msg.npcId);
      if (npc) npc.bubble = { text: msg.text, until: now + 4000 + msg.text.length * 45 };
      addChatLine(npc ? npc.name : 'NPC', msg.text, false, 'npc');
      break;
    }
    case 'mission_reward': {
      const xp = msg.rewards.reduce((sum, r) => sum + r.xp, 0);
      const titles = msg.rewards.filter((r) => r.title && r.titleNew).map((r) => r.title);
      state.lastReward = { xp, titles };
      renderMission();
      showToast(`📜 Pergaminho entregue! +${xp} XP${titles.length ? ` · Título: ${titles.join(', ')}` : ''}`, 5000);
      const me = state.players.get(state.meId);
      if (me && titles.length) addFloater(me.x, me.y - 1.7, `🏅 ${titles[0]}`, '#ffd23f', 1);
      break;
    }
    case 'error':
      if (msg.code === 'CHAT_RATE_LIMITED' || msg.code === 'CHAT_INVALID') addSystemLine(msg.message);
      else if (['NPC_TOO_FAR', 'CANNOT_TALK', 'UNKNOWN_NPC', 'MISSIONS_UNAVAILABLE', 'NO_POINTS', 'ATTRIBUTE_MAXED',
        'PROFILE_UNAVAILABLE', 'PROFILE_BUSY', 'PLAYER_NOT_FOUND', 'PLAYER_TOO_FAR', 'INVALID_MISSION_OPTION'].includes(msg.code)) {
        showToast(msg.message, 3500);
        addSystemLine(msg.message);
      }
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
  const pr = state.progress;
  ui.xpLine.textContent = pr
    ? `${m.rank ? m.rank.name : ''} · Nv ${pr.level} · ${pr.xpInLevel} / ${pr.xpToNext} XP`
    : `${m.rank ? m.rank.name : ''} · ${m.xp} XP`;
  renderSlots();
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

/** Status: mapa atual e quantos jogadores há nele (o servidor só manda os do mesmo mapa). */
function updateOnline() {
  let n = 0;
  for (const p of state.players.values()) if (p.map === state.mapId || p.id === state.meId) n += 1;
  const where = mapName(state.maps, state.mapId);
  setStatus(`online · ${where ? `${where} · ` : ''}${n} ${n === 1 ? 'jogador' : 'jogadores'}`, 'ok');
}

/**
 * Passa a DESENHAR outro mapa (o previsto pela predição ou o do welcome): chão, paredes,
 * NPCs e entidades daquele mapa. Efeitos e números do mapa antigo somem, o foco é solto
 * e aparece o nome do mapa. O boneco continua no mesmo lugar da tela (a câmera segue ele)
 * e o mapa vizinho já estava desenhado além da borda: sem "teleporte" visual.
 */
function enterMap(id, announce) {
  const layout = state.maps[id];
  if (!layout) return;
  const changed = state.mapId !== id;
  state.mapId = id;
  state.world.width = layout.width;
  state.world.height = layout.height;
  state.places = placements(state.maps, id);
  state.walls = visibleWalls(state.places);
  state.npcs = state.allNpcs.filter((n) => n.map === id);
  state.nearNpc = null;
  ui.talkBtn.hidden = true;
  const me = state.players.get(state.meId);
  if (me) me.map = id;
  if (changed) {
    state.effects.length = 0;
    state.floaters.length = 0;
    if (state.focusId) setFocus(null);
    mapFx.at = performance.now();
    mapFx.name = announce ? layout.name : '';
  }
  updateOnline();
}
const mapFx = { at: -1e9, name: '' };

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

// Predição no cliente (prediction.js): o boneco anda NA HORA com a mesma função do servidor
// (movement.js); as entradas vão numeradas e o servidor confirma ou corrige.
const pred = new Predictor();
let predWorld = null;                  // { maps, tickMs } do welcome (layouts de todos os mapas)
let debugSpeedFactor = 1;              // só no modo de teste (ninDebug.cheatSpeed): simula cliente adulterado

function setDirection(x, y) {
  if (state.me.dead) { x = 0; y = 0; }     // derrotado não anda (o servidor também ignora)
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  dir = { x, y };
}

// Joystick FLUTUANTE: a base nasce onde o polegar encosta (na metade esquerda de baixo
// da tela) e volta para o canto ao soltar. Ninguém precisa mirar num círculo pequeno.
// Pointer Events = toque, mouse e caneta; multitoque funciona (joystick com um dedo,
// habilidade com outro).
const joy = { pointerId: null, restX: 0, restY: 0, baseX: 0, baseY: 0, radius: 64, knobX: 0, knobY: 0 };
const safe = { top: 0, right: 0, bottom: 0, left: 0 };

function layoutJoystick(w, h) {
  joy.radius = Math.round(Math.max(52, Math.min(84, Math.min(w, h) * 0.15)) * hud.btnScale);
  const off = hudLayout().joy || [0, 0];
  joy.restX = Math.max(safe.left + joy.radius + 4, Math.min(w - joy.radius - 4, safe.left + 22 + joy.radius + off[0]));
  joy.restY = Math.max(joy.radius + 60, Math.min(h - safe.bottom - joy.radius - 4, h - safe.bottom - 22 - joy.radius + off[1]));
  if (joy.pointerId === null) { joy.baseX = joy.restX; joy.baseY = joy.restY; }
}

/** Onde o polegar pode nascer o joystick: metade esquerda de baixo, ou perto de onde ele foi posto. */
function inJoystickZone(x, y, w, h) {
  return (x < w * 0.5 && y > h * 0.3) || Math.hypot(x - joy.restX, y - joy.restY) < joy.radius * 1.6;
}

canvas.addEventListener('pointerdown', (e) => {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  // Modo "Editar layout": o joystick é arrastado para o lugar novo (não anda).
  if (hud.editing) {
    if (Math.hypot(e.clientX - joy.restX, e.clientY - joy.restY) <= joy.radius * 1.3) {
      e.preventDefault();
      joyDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: [...(hudLayout().joy || [0, 0])] };
      canvas.setPointerCapture(e.pointerId);
    }
    return;
  }
  // Tocou em outro jogador: menu dele (nome, rank, Criar/Entregar missão), não o joystick.
  const other = playerAtScreen(e.clientX, e.clientY);
  if (other) {
    e.preventDefault();
    openPlayerMenu(other);
    return;
  }
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
  if (joyDrag && e.pointerId === joyDrag.id) {
    hudLayout().joy = [joyDrag.start[0] + e.clientX - joyDrag.x, joyDrag.start[1] + e.clientY - joyDrag.y];
    layoutJoystick(viewW, viewH);
    return;
  }
  if (e.pointerId !== joy.pointerId) return;
  e.preventDefault();
  // Eventos agrupados do mesmo quadro: usa o mais recente (movimento mais suave).
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  const last = list.length ? list[list.length - 1] : e;
  moveKnob(last.clientX, last.clientY);
});
let joyDrag = null;
const releaseJoystick = (e) => {
  if (joyDrag && e.pointerId === joyDrag.id) {
    joyDrag = null;
    // Guarda onde ficou de verdade (já dentro da tela).
    hudLayout().joy = [joy.restX - (safe.left + 22 + joy.radius), joy.restY - (viewH - safe.bottom - 22 - joy.radius)];
    saveHud();
    return;
  }
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
  if (hud.editing || !ui.creator.hidden) return;   // editando o layout ou criando o personagem: sem combate
  if (KEYMAP[e.code]) { keys.add(e.code); keyDirection(); e.preventDefault(); }
  if (e.key >= '1' && e.key <= '4') castSlot(Number(e.key) - 1);
  if (e.key === ' ' && ui.chat.hidden) { basicAttack(); e.preventDefault(); }
  if (e.key === 'q' || e.key === 'Q') switchKit();
  if (e.key === 'r' || e.key === 'R') toggleRun();
  if (e.key === 'c' || e.key === 'C') (ui.statusPanel.hidden ? openStatus() : closeStatus());
  if (e.key === 'Enter' && ui.chat.hidden && !ui.hud.hidden) { openChat(); e.preventDefault(); }
  if (e.key === 't' || e.key === 'T' || e.key === 'Tab') { cycleFocus(); e.preventDefault(); }
  if (e.key === 'm' || e.key === 'M') toggleMeditation();
  if (e.key === 'e' || e.key === 'E') talkToNpc();
  if (e.key === 'j' || e.key === 'J') (ui.missionsPanel.hidden ? openMissions() : closeMissions());
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
  attack: { color: '#fff3c4', ms: 260 },   // Ataque Básico: corte rápido na direção do golpe
};
const GROUND_FX = new Set(['shadow', 'water']);
/** Habilidades que miram no alvo focado (Taijutsu: sempre o mais perto; Pedra e Cura: em si mesmo). */
const DIRECTED = new Set(['fire', 'water', 'illusion', 'shadow']);

// ------------------------------------------------------------------ foco (🎯) e meditação (🧘)

/** Botão 🎯: foca o mais perto; com foco, passa para o próximo mais perto (ciclo). */
function cycleFocus() {
  const me = state.players.get(state.meId);
  if (!me || state.me.dead) return;
  const here = [...state.monsters.values()].filter((m) => m.map === state.mapId);
  const id = nextTarget(me, here, state.focusId, FOCUS_RANGE);
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
  const running = !!state.me.running;
  ui.runBtn.classList.toggle('active', running);
  ui.runBtn.setAttribute('aria-pressed', running ? 'true' : 'false');
  ui.runBtn.setAttribute('aria-label', running ? 'Correndo (toque para andar)' : 'Correr');
}

/**
 * Botões do combate respondem no TOQUE (pointerdown), não no "click": com o polegar
 * esquerdo segurando o joystick, o navegador não gera "click" para o outro dedo.
 * Assim dá para focar, atacar e trocar de alvo ANDANDO. Teclado/leitor de tela: "click".
 */
function onTap(el, fn) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    if (hud.editing) return;          // modo "Editar layout": o toque arrasta, não ataca
    fn(e);
  });
  el.addEventListener('click', (e) => { if (e.detail === 0 && !hud.editing) fn(e); });
}
onTap(ui.targetBtn, cycleFocus);
onTap(ui.meditateBtn, toggleMeditation);

// ------------------------------------------------------------------ missões (NPC Mestre e Sala de Missões)

const TARGET_NAMES = { slime: ['slime', 'slimes'] };
const targetName = (code, n) => (TARGET_NAMES[code] ? TARGET_NAMES[code][n === 1 ? 0 : 1] : code);

function missionTitle(m) {
  if (m.type.code === 'DEFEAT_MONSTER') return `Derrotar ${m.target.quantity} ${targetName(m.target.code, m.target.quantity)}`;
  return `${m.type.name}: ${m.target.code} ×${m.target.quantity}`;
}

function missionStatusText(m) {
  if (m.status === 'approved') return 'Pergaminho aprovado! Entregue ao Mestre para receber a recompensa.';
  if (m.status === 'submitted') return `Entregue ao sensei ${m.senseiName}. Esperando a avaliação.`;
  if (m.ready) return m.fromNpc ? 'Objetivo completo! Volte ao Mestre para entregar o pergaminho.' : `Objetivo completo! Procure o sensei ${m.senseiName}.`;
  const left = m.target.quantity - m.progress;
  const what = m.type.code === 'DEFEAT_MONSTER' ? `Derrote mais ${left} ${targetName(m.target.code, left)} em volta da vila.` : 'Em andamento.';
  if (!m.expiresAt) return what;
  const d = new Date(m.expiresAt);
  return `${what} Prazo: ${d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`;
}

/** Sala de Missões e o botão 📜 (que mostra o progresso, ex.: 2/5). Tudo com textContent. */
function renderMission() {
  const m = state.mission;
  ui.missionCard.hidden = !m;
  ui.missionEmpty.hidden = !!m;
  ui.missionsToggle.classList.toggle('active', !!m && !m.ready);
  ui.missionsToggle.classList.toggle('ready', !!m && m.ready);
  const last = state.lastReward;
  ui.missionLast.hidden = !!m || !last;
  if (last && !m) {
    ui.missionLast.textContent = `Última entrega: +${last.xp} XP${last.titles.length ? ` e o título “${last.titles.join('”, “')}”` : ''}. Fale com o Mestre para outro treino.`;
  }
  if (!m) {
    ui.missionsBadge.textContent = '';          // vazio: o CSS mostra "Missões" deitado e só 📜 em pé
    ui.missionsToggle.setAttribute('aria-label', 'Missões: nenhuma ativa');
    return;
  }
  const done = Math.min(m.progress, m.target.quantity);
  ui.missionsBadge.textContent = m.ready ? 'Pronta!' : `${done}/${m.target.quantity}`;
  ui.missionsToggle.setAttribute('aria-label', `Missões: ${missionTitle(m)}, ${done} de ${m.target.quantity}`);
  ui.missionSensei.textContent = `Missão do Sensei ${m.senseiName}`;
  ui.missionTitle.textContent = missionTitle(m);
  ui.missionFill.style.transform = `scaleX(${m.target.quantity ? done / m.target.quantity : 0})`;
  ui.missionCount.textContent = `${done} / ${m.target.quantity}`;
  ui.missionMeter.setAttribute('aria-valuemax', String(m.target.quantity));
  ui.missionMeter.setAttribute('aria-valuenow', String(done));
  ui.missionMeter.classList.toggle('ready', m.ready);
  ui.missionStatus.textContent = missionStatusText(m);
  ui.missionStatus.classList.toggle('ready', m.ready);
  ui.missionReward.textContent = `Recompensa: ${m.reward.xp} XP${m.reward.title ? ` · título “${m.reward.title}”` : ''}`;
}

function openMissions() {
  closeSettings();
  closeStatus();
  closePlayerMenu();
  ui.missionsPanel.hidden = false;
  ui.missionsToggle.setAttribute('aria-expanded', 'true');
  renderMission();
  send({ type: 'missions' });     // relê do servidor (missão criada por um sensei jogador, por exemplo)
}
function closeMissions() {
  ui.missionsPanel.hidden = true;
  ui.missionsToggle.setAttribute('aria-expanded', 'false');
}
ui.missionsToggle.addEventListener('click', () => (ui.missionsPanel.hidden ? openMissions() : closeMissions()));
ui.missionsClose.addEventListener('click', closeMissions);

/** Botão 💬 Falar (só aparece perto do NPC). O servidor confere a distância de novo. */
let lastTalkAt = 0;
function talkToNpc() {
  const npc = state.nearNpc;
  if (!npc || !state.connected || state.me.dead) return;
  const now = performance.now();
  if (now - lastTalkAt < 500) return;
  lastTalkAt = now;
  send({ type: 'talk', npcId: npc.id });
}
onTap(ui.talkBtn, talkToNpc);

/** Mostra/esconde o 💬 Falar. Margem de 0,15 casa: a posição prevista pode estar à frente da do servidor. */
function updateNpcProximity(me) {
  let near = null;
  if (me && !state.me.dead) {
    for (const n of state.npcs) if (Math.hypot(me.x - n.x, me.y - n.y) <= n.range - 0.15) near = n;
  }
  if (near !== state.nearNpc) {
    state.nearNpc = near;
    ui.talkBtn.hidden = !near;
  }
}

/** Marcador sobre o NPC: "!" tem missão para dar, "?" dourado = pronta para entregar, "?" cinza = em andamento. */
function npcMarker() {
  const m = state.mission;
  if (!m) return { ch: '!', color: '#ffd23f', strong: true };
  if (m.status === 'approved' || (m.ready && m.fromNpc)) return { ch: '?', color: '#ffd23f', strong: true };
  if (m.fromNpc) return { ch: '?', color: '#b9b2a4', strong: false };
  return null;   // missão de outro sensei: o Mestre não tem nada a dizer
}

function pulse(el) {
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}
// ------------------------------------------------------------------ combate MOBA (ataque, 4 habilidades, kits)

/** Ícone e cor de cada habilidade (só visual). */
const SKILL_UI = {
  fire: { icon: '🔥', name: 'Fogo', color: '#e8572f' },
  water: { icon: '💧', name: 'Água', color: '#3c9be0' },
  taijutsu: { icon: '👊', name: 'Taijutsu', color: '#d9a441' },
  illusion: { icon: '🌀', name: 'Ilusão', color: '#9a6be0' },
  shadow: { icon: '🌑', name: 'Sombra', color: '#4a3f63' },
  stone: { icon: '⛰', name: 'Pedra', color: '#8a6a45' },
  heal: { icon: '✚', name: 'Cura', color: '#4fbf6a' },
};

/** skill (ou "attack") -> { until, ms }: quando a recarga acaba. Começa quando o SERVIDOR confirma. */
const cooldowns = {};

/** Jogador virou para atacar/lançar (a direção vem do servidor, na mensagem do golpe). */
function faceTo(playerId, fx, fy) {
  const p = state.players.get(playerId);
  if (p && (fx || fy)) p.dir = dirFrom(fx, fy);
}

function startCooldown(skill) {
  // Ataque: a recarga já vem com a Agilidade (o servidor calcula, em progress.derived).
  const ms = skill === 'attack'
    ? (state.progress?.derived?.attackCooldownMs ?? state.world.basicAttack?.cooldownMs ?? 600)
    : (state.world.skills?.[skill]?.cooldownMs ?? 600);
  cooldowns[skill] = { until: performance.now() + ms, ms };
}

/** As 4 habilidades do kit ATIVO nos botões em volta do ataque (o kit vem do servidor). */
function renderKit() {
  const list = state.kit.kits[state.kit.active] || [];
  ui.slots.forEach((button, i) => {
    const skill = list[i] || '';
    button.dataset.skill = skill;
    const info = SKILL_UI[skill];
    button.querySelector('.ico').textContent = info ? info.icon : '';
    const cost = state.world.skills?.[skill]?.cost;
    button.querySelector('.cost').textContent = cost !== undefined ? String(cost) : '';
    button.style.setProperty('--c', info ? info.color : 'transparent');
    button.classList.toggle('empty', !info);
    button.disabled = !info;
    button.setAttribute('aria-label', info ? `${info.name} (${cost} de chakra) — tecla ${i + 1}` : `Espaço ${i + 1} vazio (monte na ficha 📊 → Kits)`);
  });
  ui.kitLabel.textContent = state.kit.active;
  ui.kitBtn.setAttribute('aria-label', `Trocar de kit (ativo: ${state.kit.active})`);
  renderSlots();
}

/** Botão apagado sem chakra; recarga desenhada no quadro (frame). */
function renderSlots() {
  for (const button of ui.slots) {
    const cost = state.world.skills?.[button.dataset.skill]?.cost ?? 0;
    button.classList.toggle('no-chakra', !!button.dataset.skill && (state.me.chakra < cost || state.me.dead));
  }
}

/** Sombra girando por cima de cada botão em recarga + segundos (só aparência). */
function drawCooldowns(now) {
  const paint = (button, skill) => {
    const cd = cooldowns[skill];
    const left = cd ? cd.until - now : 0;
    const label = button.querySelector('.cd');
    if (left > 0) {
      button.style.setProperty('--p', `${Math.round((left / cd.ms) * 360)}deg`);
      button.classList.add('cooling');
      const secs = left >= 1000 ? Math.ceil(left / 1000) : (left / 1000).toFixed(1).replace('0.', ',');
      if (label.textContent !== String(secs)) label.textContent = String(secs);
    } else if (button.classList.contains('cooling')) {
      button.classList.remove('cooling');
      label.textContent = '';
    }
  };
  paint(ui.attackBtn, 'attack');
  for (const button of ui.slots) if (button.dataset.skill) paint(button, button.dataset.skill);
}

/**
 * Só PEDE. Dano, alvo, custo e recarga são do servidor; a animação e a recarga na tela só
 * começam quando ele confirma ("cast" / "attack"). Recusou: o motivo aparece sobre o boneco.
 */
const lastTap = {};
function tapGuard(key) {
  const now = performance.now();
  if (now - (lastTap[key] || 0) < 120) return false;      // toque duplo acidental
  lastTap[key] = now;
  return true;
}

function castSlot(i) {
  const skill = ui.slots[i]?.dataset.skill;
  if (skill) castSkill(skill);
}
function castSkill(skill) {
  if (!SKILLS[skill] || !state.connected || state.me.dead || !tapGuard(skill)) return;
  // Jutsu direcionado: com alvo focado, vai o targetId (o servidor mira e confere o alcance).
  const targetId = DIRECTED.has(skill) && state.focusId ? state.focusId : undefined;
  send(targetId ? { type: 'cast', skill, targetId } : { type: 'cast', skill });
}

/** Ataque Básico: sem chakra; vai no focado (se estiver perto) ou no mais perto. */
function basicAttack() {
  if (!state.connected || state.me.dead || !tapGuard('attack')) return;
  send(state.focusId ? { type: 'attack', targetId: state.focusId } : { type: 'attack' });
}

/** 🏃 Correr: pede; a velocidade nova chega no "stats" do servidor. */
function toggleRun() {
  if (!state.connected) return;
  send({ type: 'run', active: !state.me.running });
}

/** 🔄 Trocar de kit: pede; os botões só mudam quando o servidor confirma ("kit"). */
function switchKit() {
  if (!state.connected || !tapGuard('kit')) return;
  send({ type: 'switch_kit', kit: state.kit.active === 'A' ? 'B' : 'A' });
}

onTap(ui.attackBtn, basicAttack);
onTap(ui.runBtn, toggleRun);
onTap(ui.kitBtn, switchKit);
ui.slots.forEach((button, i) => onTap(button, () => castSlot(i)));

// ------------------------------------------------------------------ ficha (📊): atributos e kits

const ATTR_EFFECT = {
  vitality: (pp) => `+${pp.vitality} vida`,
  chakraMax: (pp) => `+${pp.chakraMax} chakra`,
  chakraRegen: (pp) => `+${pp.chakraRegen}/s meditando`,
  agility: (pp) => `+${String(pp.agility).replace('.', ',')} velocidade`,
  taijutsu: (pp) => `+${Math.round(pp.taijutsu * 100)}% Ataque Básico`,
  ninjutsu: (pp) => `+${Math.round(pp.ninjutsu * 100)}% jutsus`,
};
/** O que o atributo dá hoje (números do SERVIDOR, em progress.derived). */
const ATTR_NOW = {
  vitality: (d) => `vida ${d.maxHp}`,
  chakraMax: (d) => `chakra ${d.maxChakra}`,
  chakraRegen: (d) => `${d.meditationChakraPerSec}/s`,
  agility: (d) => `${String(d.walkSpeed).replace('.', ',')} / ${String(d.runSpeed).replace('.', ',')}`,
  taijutsu: (d) => `×${String(d.physicalMultiplier).replace('.', ',')}`,
  ninjutsu: (d) => `×${String(d.jutsuMultiplier).replace('.', ',')}`,
};

let draftKits = null;   // kits sendo montados na aba Kits (só valem depois de salvos no servidor)

function renderStatus() {
  const pr = state.progress;
  if (!pr) return;
  ui.statusBadge.textContent = pr.statPoints > 0 ? `Nv ${pr.level} +${pr.statPoints}` : `Nv ${pr.level}`;
  ui.statusToggle.classList.toggle('ready', pr.statPoints > 0);
  ui.statusLevel.textContent = `Nível ${pr.level}`;
  const ratio = pr.xpToNext ? Math.min(1, pr.xpInLevel / pr.xpToNext) : 1;
  ui.xpFill.style.transform = `scaleX(${ratio})`;
  ui.xpCount.textContent = pr.xpToNext ? `${pr.xpInLevel} / ${pr.xpToNext} XP` : 'Nível máximo';
  ui.xpMeter.setAttribute('aria-valuemax', String(pr.xpToNext || 1));
  ui.xpMeter.setAttribute('aria-valuenow', String(pr.xpInLevel));
  ui.pointsLine.textContent = `Pontos disponíveis: ${pr.statPoints}`;
  ui.pointsLine.classList.toggle('ready', pr.statPoints > 0);
  const pp = state.world.attributePerPoint || {};
  for (const li of ui.attrRows) {
    const key = li.dataset.attr;
    const val = pr.attributes[key] ?? 0;
    li.querySelector('.attr-val').textContent = `${val}/${pr.maxPoints}`;
    li.querySelector('.attr-eff').textContent = `${ATTR_EFFECT[key](pp)} · agora ${ATTR_NOW[key](pr.derived)}`;
    const plus = li.querySelector('.plus');
    plus.disabled = pr.statPoints <= 0 || val >= pr.maxPoints;
  }
  if (!draftKits || ui.statusPanel.hidden) draftKits = { A: [...state.kit.kits.A], B: [...state.kit.kits.B] };
  renderDraftKits();
}

function renderDraftKits() {
  if (!draftKits) return;
  for (const li of ui.kitRows) {
    const skill = li.dataset.skill;
    for (const chip of li.querySelectorAll('.chip')) {
      const on = draftKits[chip.dataset.kit].includes(skill);
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      chip.disabled = !on && draftKits[chip.dataset.kit].length >= 4;
    }
  }
  ui.kitCount.textContent = `Kit A: ${draftKits.A.length}/4 · Kit B: ${draftKits.B.length}/4`;
}

function openStatus() {
  closeSettings();
  closeMissions();
  closePlayerMenu();
  draftKits = null;
  ui.statusPanel.hidden = false;
  ui.statusToggle.setAttribute('aria-expanded', 'true');
  renderStatus();
}
function closeStatus() {
  ui.statusPanel.hidden = true;
  ui.statusToggle.setAttribute('aria-expanded', 'false');
}
function showTab(kits) {
  ui.paneAttrs.hidden = kits;
  ui.paneKits.hidden = !kits;
  ui.tabAttrs.classList.toggle('active', !kits);
  ui.tabKits.classList.toggle('active', kits);
  ui.tabAttrs.setAttribute('aria-selected', kits ? 'false' : 'true');
  ui.tabKits.setAttribute('aria-selected', kits ? 'true' : 'false');
}
ui.statusToggle.addEventListener('click', () => (ui.statusPanel.hidden ? openStatus() : closeStatus()));
ui.statusClose.addEventListener('click', closeStatus);
ui.tabAttrs.addEventListener('click', () => showTab(false));
ui.tabKits.addEventListener('click', () => showTab(true));
for (const li of ui.attrRows) {
  // "+": só pede. Ponto, atributo e vida nova só mudam quando o servidor responde ("progress").
  li.querySelector('.plus').addEventListener('click', () => send({ type: 'spend_point', attribute: li.dataset.attr }));
}
for (const li of ui.kitRows) {
  for (const chip of li.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      const list = draftKits[chip.dataset.kit];
      const i = list.indexOf(li.dataset.skill);
      if (i >= 0) list.splice(i, 1);
      else if (list.length < 4) list.push(li.dataset.skill);
      renderDraftKits();
    });
  }
}
ui.kitSave.addEventListener('click', () => send({ type: 'set_loadout', kitA: draftKits.A, kitB: draftKits.B }));

// ------------------------------------------------------------------ outro jogador: menu e missão de sensei

let menuPlayerId = null;
let menuChoice = { quantity: 3, difficulty: 'BASIC' };

function openPlayerMenu(p) {
  closeMissions();
  closeStatus();
  menuPlayerId = p.id;
  ui.pmName.textContent = p.username;
  ui.pmRank.textContent = `${p.rank ? p.rank.name : ''}${p.level ? ` · Nível ${p.level}` : ''}`;
  const m = state.mission;
  // Entregar: minha missão é DESTE sensei. O servidor confere tudo (meta, sensei, distância).
  const mySensei = m && !m.fromNpc && m.senseiId === p.id && m.status === 'active';
  ui.pmDeliver.hidden = !mySensei;
  ui.pmDeliver.textContent = m && m.ready ? '📜 Entregar missão' : `📜 Entregar missão (${Math.min(m?.progress ?? 0, m?.target.quantity ?? 0)}/${m?.target.quantity ?? 0})`;
  ui.pmCreate.hidden = !state.me.canBeSensei;
  ui.pmForm.hidden = true;
  ui.pmNote.textContent = !state.me.canBeSensei && !mySensei ? 'Chunin ou acima pode criar missões para jogadores de rank menor.' : '';
  ui.playerMenu.hidden = false;
}
function closePlayerMenu() {
  ui.playerMenu.hidden = true;
  menuPlayerId = null;
}

/** Monta as opções do formulário com o catálogo que o servidor mandou (sem números inventados aqui). */
function renderMissionForm() {
  const opts = state.senseiOptions || { difficulties: [], quantities: [3, 5, 10] };
  if (!opts.difficulties.some((d) => d.code === menuChoice.difficulty) && opts.difficulties[0]) menuChoice.difficulty = opts.difficulties[0].code;
  const chip = (text, on, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip${on ? ' on' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  };
  ui.pmQty.replaceChildren(...opts.quantities.map((q) => chip(`${q} slimes`, q === menuChoice.quantity, () => { menuChoice.quantity = q; renderMissionForm(); })));
  ui.pmDiff.replaceChildren(...opts.difficulties.map((d) => chip(
    `${d.name} · ${d.xp} XP${d.title ? ` + título` : ''}`, d.code === menuChoice.difficulty,
    () => { menuChoice.difficulty = d.code; renderMissionForm(); },
  )));
}

ui.pmClose.addEventListener('click', closePlayerMenu);
ui.pmCreate.addEventListener('click', () => {
  ui.pmForm.hidden = !ui.pmForm.hidden;
  if (!ui.pmForm.hidden) renderMissionForm();
});
ui.pmSend.addEventListener('click', () => {
  if (!menuPlayerId) return;
  send({ type: 'create_mission', traineeId: menuPlayerId, difficulty: menuChoice.difficulty, quantity: menuChoice.quantity });
  closePlayerMenu();
});
ui.pmDeliver.addEventListener('click', () => {
  if (!menuPlayerId) return;
  send({ type: 'deliver_mission', senseiId: menuPlayerId });
  closePlayerMenu();
});

/** Toque no mapa: acertou outro jogador (círculo de ~0,6 casa)? Abre o menu dele. */
function playerAtScreen(px, py) {
  const me = state.players.get(state.meId);
  if (!me || !lastView) return null;
  let best = null, bestD = Infinity;
  for (const p of state.players.values()) {
    if (p.id === state.meId || p.dead || p.map !== state.mapId) continue;
    const sx = lastView.toScreenX(p.x), sy = lastView.toScreenY(p.y);
    const d = Math.hypot(px - sx, py - sy);
    if (d <= Math.max(26, lastView.T * 0.6) && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

// ---- avaliação (sensei)

let evalScore = 5;
function renderEval() {
  const req = state.evalQueue[0];
  ui.evalPanel.hidden = !req;
  if (!req) return;
  ui.evalText.textContent = `${req.trainee.username} entregou: ${missionTitle(req.mission)} (${req.mission.progress}/${req.mission.target.quantity}).`;
  ui.evalStars.replaceChildren(...[1, 2, 3, 4, 5].map((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `star${n <= evalScore ? ' on' : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', n === evalScore ? 'true' : 'false');
    b.setAttribute('aria-label', `Nota ${n}`);
    b.textContent = '★';
    b.addEventListener('click', () => { evalScore = n; renderEval(); });
    return b;
  }));
}
function answerEval(approved) {
  const req = state.evalQueue.shift();
  if (req) send({ type: 'evaluate_mission', missionId: req.missionId, approved, score: evalScore });
  evalScore = 5;
  renderEval();
}
ui.evalApprove.addEventListener('click', () => answerEval(true));
ui.evalReject.addEventListener('click', () => answerEval(false));

// ------------------------------------------------------------------ Criador de Personagem

let creatorLook = { ...DEFAULT_LOOK };
let creatorDir = 0;
let creatorFirst = false;
let creatorTimer = null;

function openCreator(first = false) {
  creatorFirst = first;
  creatorLook = { ...(state.me.look || DEFAULT_LOOK) };
  creatorDir = 0;
  for (const input of ui.creatorInputs) input.value = creatorLook[input.dataset.part];
  ui.creatorCancel.hidden = first;           // na 1ª vez é obrigatório escolher
  ui.creatorSave.textContent = first ? 'Começar a jogar' : 'Salvar visual';
  ui.creatorError.textContent = '';
  ui.creator.hidden = false;
  closeSettings();
  clearInterval(creatorTimer);
  let phase = 0;
  creatorTimer = setInterval(() => { phase += 0.35; drawCreatorPreview(phase); }, 60);   // prévia andando
  drawCreatorPreview(0);
}
function closeCreator() {
  ui.creator.hidden = true;
  clearInterval(creatorTimer);
  creatorTimer = null;
}
function drawCreatorPreview(phase) {
  const c = ui.creatorCanvas;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#8d8a84';
  g.fillRect(0, c.height - 40, c.width, 40);
  drawCharacter(g, c.width / 2, c.height - 78, 128, creatorLook, creatorDir, phase, true);
}
function renderPresets() {
  ui.creatorPresets.replaceChildren(...PRESETS.map((look, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.setAttribute('aria-label', `Combinação ${i + 1}`);
    for (const part of ['hair', 'shirt', 'cape']) {
      const dot = document.createElement('i');
      dot.style.background = look[part];
      b.append(dot);
    }
    b.addEventListener('click', () => {
      creatorLook = { ...look };
      for (const input of ui.creatorInputs) input.value = creatorLook[input.dataset.part];
    });
    return b;
  }));
}
renderPresets();
for (const input of ui.creatorInputs) {
  input.addEventListener('input', () => { creatorLook[input.dataset.part] = input.value.toLowerCase(); });
}
ui.creatorTurn.addEventListener('click', () => { creatorDir = [0, 1, 3, 2][(([0, 1, 3, 2].indexOf(creatorDir)) + 1) % 4]; });
ui.creatorRandom.addEventListener('click', () => {
  const rnd = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
  const skins = ['#ffdbac', '#f1c9a0', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'];
  creatorLook = { skin: skins[Math.floor(Math.random() * skins.length)], hair: rnd(), shirt: rnd(), pants: rnd(), cape: rnd() };
  for (const input of ui.creatorInputs) input.value = creatorLook[input.dataset.part];
});
ui.creatorCancel.addEventListener('click', closeCreator);
ui.creatorSave.addEventListener('click', () => {
  if (!state.connected) { ui.creatorError.textContent = 'Sem conexão. Tentando reconectar…'; return; }
  // Só PEDE: o visual só muda quando o servidor grava e avisa todos ("player_appearance").
  send({ type: 'set_appearance', appearance: { ...creatorLook } });
});

// ------------------------------------------------------------------ HUD: configurações e modo "Editar layout"

/*
 * Preferências do aparelho (localStorage, só deste celular): tamanho e transparência dos botões
 * e das barras, e onde cada botão, o joystick e as barras ficam — guardado SEPARADO para
 * celular deitado e em pé. Arrastar só funciona no modo "Editar layout" (botão no ⚙️), com
 * o combate parado: não dá para mover nada sem querer no meio da luta.
 */
const HUD_KEY = 'nin.hud.v1';
const HUD_DEFAULT = { btnScale: 1, btnOpacity: 1, barScale: 1, barOpacity: 1, layouts: { landscape: {}, portrait: {} } };
const hud = loadHud();
hud.editing = false;

function loadHud() {
  try {
    const raw = JSON.parse(localStorage.getItem(HUD_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const num = (v, min, max, d) => (typeof v === 'number' && v >= min && v <= max ? v : d);
      return {
        btnScale: num(raw.btnScale, 0.7, 1.3, 1), btnOpacity: num(raw.btnOpacity, 0.3, 1, 1),
        barScale: num(raw.barScale, 0.7, 1.3, 1), barOpacity: num(raw.barOpacity, 0.3, 1, 1),
        layouts: { landscape: raw.layouts?.landscape || {}, portrait: raw.layouts?.portrait || {} },
      };
    }
  } catch { /* modo privado ou dado estragado: padrão */ }
  return structuredClone(HUD_DEFAULT);
}
function saveHud() {
  try {
    localStorage.setItem(HUD_KEY, JSON.stringify({
      btnScale: hud.btnScale, btnOpacity: hud.btnOpacity, barScale: hud.barScale, barOpacity: hud.barOpacity, layouts: hud.layouts,
    }));
  } catch { /* sem armazenamento: vale só até fechar */ }
}
const isPortrait = () => matchMedia('(orientation: portrait)').matches;
/** Layout da orientação atual: { joy: [dx, dy], vitals: [dx, dy], buttons: { id: [dx, dy] } }. */
function hudLayout() {
  const key = isPortrait() ? 'portrait' : 'landscape';
  hud.layouts[key] ||= {};
  hud.layouts[key].buttons ||= {};
  return hud.layouts[key];
}

/** Itens arrastáveis: cada botão do combate e as barras. A chave é estável (id ou espaço). */
const dragKey = (el) => el.id || `slot${el.dataset.slot}`;
const draggables = () => [...ui.combat.querySelectorAll('.cbtn'), ui.vitals];

function applyHud() {
  const lay = hudLayout();
  ui.combat.style.setProperty('--u', String(hud.btnScale));
  ui.combat.style.opacity = hud.editing ? '1' : String(hud.btnOpacity);
  ui.vitals.style.scale = String(hud.barScale);
  ui.vitals.style.opacity = hud.editing ? '1' : String(hud.barOpacity);
  for (const el of draggables()) {
    const off = el === ui.vitals ? lay.vitals : lay.buttons[dragKey(el)];
    el.style.translate = off ? `${off[0]}px ${off[1]}px` : '';
    el.classList.toggle('moved', !!off);    // botão que o jogador moveu fica por cima dos outros
  }
  document.body.classList.toggle('editing', hud.editing);
  for (const [key, input] of Object.entries(ui.sliders)) {
    input.value = String(Math.round(hud[key] * 100));
    $(`${input.id}-out`).textContent = `${input.value}%`;
  }
  layoutJoystick(viewW || innerWidth, viewH || innerHeight);
}

/** Depois de arrastar: não deixa nada sair da tela (nem ficar embaixo do notch). */
function clampIntoView(el, off) {
  el.style.translate = `${off[0]}px ${off[1]}px`;
  const r = el.getBoundingClientRect();
  const minX = safe.left + 4, maxX = innerWidth - safe.right - 4, minY = safe.top + 56, maxY = innerHeight - safe.bottom - 4;
  if (r.left < minX) off[0] += minX - r.left;
  if (r.right > maxX) off[0] -= r.right - maxX;
  if (r.top < minY) off[1] += minY - r.top;
  if (r.bottom > maxY) off[1] -= r.bottom - maxY;
  el.style.translate = `${Math.round(off[0])}px ${Math.round(off[1])}px`;
  return [Math.round(off[0]), Math.round(off[1])];
}

let drag = null;
for (const el of draggables()) {
  el.addEventListener('pointerdown', (e) => {
    if (!hud.editing) return;
    e.preventDefault();
    e.stopPropagation();
    const lay = hudLayout();
    const start = el === ui.vitals ? (lay.vitals || [0, 0]) : (lay.buttons[dragKey(el)] || [0, 0]);
    drag = { el, id: e.pointerId, x: e.clientX, y: e.clientY, start: [...start] };
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
  }, { capture: true });
  el.addEventListener('pointermove', (e) => {
    if (!drag || drag.el !== el || e.pointerId !== drag.id) return;
    el.style.translate = `${drag.start[0] + e.clientX - drag.x}px ${drag.start[1] + e.clientY - drag.y}px`;
  });
  const end = (e) => {
    if (!drag || drag.el !== el || e.pointerId !== drag.id) return;
    const off = clampIntoView(el, [drag.start[0] + e.clientX - drag.x, drag.start[1] + e.clientY - drag.y]);
    const lay = hudLayout();
    if (el === ui.vitals) lay.vitals = off; else lay.buttons[dragKey(el)] = off;
    el.classList.remove('dragging');
    el.classList.add('moved');
    drag = null;
    saveHud();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function openSettings() {
  closeMissions();
  closeStatus();
  closePlayerMenu();
  ui.settingsPanel.hidden = false;
  ui.settingsToggle.setAttribute('aria-expanded', 'true');
  applyHud();
}
function closeSettings() {
  ui.settingsPanel.hidden = true;
  ui.settingsToggle.setAttribute('aria-expanded', 'false');
}
function startEditing() {
  closeSettings();
  keys.clear();
  setDirection(0, 0);                // para de andar: no modo edição o combate fica parado
  hud.editing = true;
  ui.editBanner.hidden = false;
  applyHud();
}
function stopEditing() {
  hud.editing = false;
  ui.editBanner.hidden = true;
  saveHud();
  applyHud();
}
function resetLayout() {
  hud.layouts[isPortrait() ? 'portrait' : 'landscape'] = {};
  saveHud();
  applyHud();
}
ui.settingsToggle.addEventListener('click', () => (ui.settingsPanel.hidden ? openSettings() : closeSettings()));
ui.settingsClose.addEventListener('click', closeSettings);
ui.editLayout.addEventListener('click', startEditing);
ui.editDone.addEventListener('click', stopEditing);
ui.editReset.addEventListener('click', resetLayout);
ui.resetLayout.addEventListener('click', () => {
  Object.assign(hud, { btnScale: 1, btnOpacity: 1, barScale: 1, barOpacity: 1 });
  resetLayout();
});
ui.openCreator.addEventListener('click', () => openCreator(false));
for (const [key, input] of Object.entries(ui.sliders)) {
  input.addEventListener('input', () => {
    hud[key] = Number(input.value) / 100;
    applyHud();
  });
  input.addEventListener('change', saveHud);
}
matchMedia('(orientation: portrait)').addEventListener?.('change', () => setTimeout(applyHud, 100));

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

function addChatLine(username, message, mine, kind = '') {
  const li = document.createElement('li');
  if (mine) li.className = 'me';
  else if (kind) li.className = kind;
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

/** Mata fechada vista de cima (fora do mundo): copas escuras emendadas. */
function canopyTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#173f17';
    g.fillRect(0, 0, PIX, PIX);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(r() * PIX), y = Math.floor(r() * PIX), rad = 2 + Math.floor(r() * 3);
      g.fillStyle = r() < 0.5 ? '#1f5220' : '#122f12';
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
  });
}

function stoneTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#8d8a84';
    g.fillRect(0, 0, PIX, PIX);
    // pedras de calçamento: 4 blocos com junta escura e brilho em cima
    const blocks = seed % 2 ? [[0, 0, 8, 7], [8, 0, 8, 7], [0, 8, 5, 8], [5, 8, 11, 8]] : [[0, 0, 6, 8], [6, 0, 10, 8], [0, 8, 9, 8], [9, 8, 7, 8]];
    for (const [x, y, w, h] of blocks) {
      g.fillStyle = r() < 0.5 ? '#97948d' : '#85827b';
      g.fillRect(x + 1, y + 1, w - 1, h - 1);
      g.fillStyle = '#a9a69e';
      g.fillRect(x + 1, y + 1, w - 2, 1);
    }
    g.fillStyle = '#6d6a64';
    for (let i = 0; i < 6; i++) g.fillRect(Math.floor(r() * PIX), Math.floor(r() * PIX), 1, 1);
  });
}

const TILES = {
  grass: [grassTile(1, false), grassTile(2, false), grassTile(3, false), grassTile(4, true)],
  stone: [stoneTile(21), stoneTile(22), stoneTile(23)],
  path: [pathTile(7), pathTile(8)],
  water: [waterTile(11), waterTile(12)],
  canopy: [canopyTile(31), canopyTile(32), canopyTile(33)],
};

/** Hash estável por casa: o mesmo chão aparece sempre no mesmo lugar. */
function cellHash(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;      // >>> 0: sempre positivo (índice de tile válido)
}

/** Chão de uma casa (coordenadas do mapa desenhado; além da saída, o chão do mapa vizinho). */
function tileAt(x, y) {
  const h = cellHash(x, y);
  switch (groundAt(state.places, x, y)) {
    case 'stone': return TILES.stone[h % 3];                       // Vila: calçamento de pedra cinza
    case 'path': return TILES.path[h & 1];                         // estradas de terra
    case 'grass': return TILES.grass[h % 23 === 0 ? 3 : h % 3];    // Floresta
    default: return TILES.canopy[h % 3];                           // fora do mundo: mata fechada
  }
}

// Chão em BLOCOS de 16x16 casas, desenhados uma vez na resolução da pixel art (256x256 px)
// e guardados. Cada quadro desenha só ~4 a 9 imagens em vez de ~300 casas.
const CHUNK = 16;
const CHUNK_CACHE_MAX = 64;          // ~64 x 256 KB = 16 MB no máximo
const chunkCache = new Map();        // "mapa:cx,cy" -> canvas (ordem de uso = LRU; voltar a um mapa é instantâneo)

function chunkCanvas(cx, cy) {
  const key = `${state.mapId}:${cx},${cy}`;
  let c = chunkCache.get(key);
  if (c) {
    chunkCache.delete(key);          // marca como usado agora
    chunkCache.set(key, c);
    return c;
  }
  c = document.createElement('canvas');
  c.width = c.height = CHUNK * PIX;
  const g = c.getContext('2d');
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) g.drawImage(tileAt(cx * CHUNK + tx, cy * CHUNK + ty), tx * PIX, ty * PIX);
  }
  // Paredes (casas marrons na Vila, árvores verde-escuras na Floresta, vistas de cima),
  // inclusive as do mapa vizinho além da borda: desenhadas no bloco de chão que tocam.
  for (const w of state.walls) {
    const x = (w.x - cx * CHUNK) * PIX, y = (w.y - cy * CHUNK) * PIX;
    if (w.k === 'tree') drawTrees(g, x, y, w.w * PIX, w.h * PIX, cellHash(w.x, w.y));
    else drawHouse(g, x, y, w.w * PIX, w.h * PIX);
  }
  chunkCache.set(key, c);
  if (chunkCache.size > CHUNK_CACHE_MAX) chunkCache.delete(chunkCache.keys().next().value);
  return c;
}

/**
 * Árvores (obstáculos da Floresta) vistas de cima: uma copa verde-escura a cada ~2 casas do
 * bloco, com sombra, contorno e brilho. Um bloco comprido (a mata da borda) vira uma fileira.
 */
function drawTrees(g, x, y, w, h, seed) {
  if (x + w < 0 || y + h < 0 || x > CHUNK * PIX || y > CHUNK * PIX) return;
  const nx = Math.max(1, Math.round(w / (2 * PIX))), ny = Math.max(1, Math.round(h / (2 * PIX)));
  const cw = w / nx, ch = h / ny;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = x + cw * (i + 0.5), cy = y + ch * (j + 0.5);
      const r = Math.min(cw, ch) / 2;
      const k = (seed + i * 7 + j * 13) % 3;
      g.fillStyle = 'rgba(0, 0, 0, 0.28)';
      g.beginPath(); g.arc(cx + 2, cy + 3, r - 1, 0, Math.PI * 2); g.fill();      // sombra
      g.fillStyle = '#123312';
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();                  // contorno
      g.fillStyle = k === 0 ? '#1f5a1f' : k === 1 ? '#226322' : '#1c531c';
      g.beginPath(); g.arc(cx, cy, r - 2, 0, Math.PI * 2); g.fill();              // copa
      g.fillStyle = '#2f7d2c';
      g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.3, r * 0.45, 0, Math.PI * 2); g.fill();   // luz
      g.fillStyle = '#3d9637';
      g.fillRect(Math.round(cx - r * 0.45), Math.round(cy - r * 0.5), 2, 2);      // brilho
    }
  }
}

/** Telhado marrom com tábuas, cumeeira, beiral escuro e a frente com porta (pixel art). */
function drawHouse(g, x, y, w, h) {
  if (x + w < 0 || y + h < 0 || x > CHUNK * PIX || y > CHUNK * PIX) return;
  g.fillStyle = 'rgba(0, 0, 0, 0.25)';
  g.fillRect(x + 3, y + 4, w, h);                      // sombra
  g.fillStyle = '#4a2c14';
  g.fillRect(x, y, w, h);                              // contorno
  g.fillStyle = '#8b5a2b';
  g.fillRect(x + 2, y + 2, w - 4, h - 10);             // telhado
  g.fillStyle = '#7a4c22';
  for (let ly = y + 5; ly < y + h - 10; ly += 4) g.fillRect(x + 2, ly, w - 4, 1);   // tábuas
  g.fillStyle = '#a8713a';
  g.fillRect(x + 2, y + Math.floor((h - 10) / 2), w - 4, 2);                        // cumeeira
  g.fillStyle = '#5d3a1d';
  g.fillRect(x + 2, y + h - 8, w - 4, 6);              // frente
  g.fillStyle = '#2c1a0c';
  g.fillRect(x + Math.floor(w / 2) - 3, y + h - 8, 6, 6);                           // porta
}

// ------------------------------------------------------------------ loop de desenho

let lastFrame = performance.now();
/** Última câmera desenhada: para achar em quem o dedo tocou. */
let lastView = null;
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
  const speed = state.me.speed || state.world.speed;   // velocidade que o SERVIDOR mandou (andar/correr + agilidade)
  const now = performance.now();
  if (me && predWorld) {
    // Próprio jogador: predição (anda já) + envio das entradas em lote + correção suave.
    const canMove = state.connected && !state.me.dead;
    const dx = quantize(dir.x), dy = quantize(dir.y);
    const s = speed * debugSpeedFactor;
    for (const msg of pred.advance(dt * 1000, dx, dy, s, predWorld, canMove)) send(msg);
    const [vx, vy] = pred.view(dt * 1000, dx, dy, s, predWorld, canMove);
    if (pred.map !== state.mapId) enterMap(pred.map, true);   // atravessou a borda (previsto): desenha o mapa novo já
    me.x = vx;
    me.y = vy;
  }
  for (const p of state.players.values()) {
    if (p === me || p.map !== state.mapId) continue;
    const at = sampleSnapshots(p.snaps, now);   // outros: entre duas posições do servidor, ~100 ms atrás
    if (at) { p.x = at[0]; p.y = at[1]; }
  }
  animateWalk(dt, me);
  const k = Math.min(1, dt * 12);     // monstros: suavização exponencial até a posição do servidor
  for (const m of state.monsters.values()) {
    if (m.map !== state.mapId) continue;
    m.x += (m.tx - m.x) * k;
    m.y += (m.ty - m.y) * k;
  }
  // Foco perdido: alvo morreu/sumiu ou o jogador andou para longe (mais de 12 casas).
  if (state.focusId && me && !keepFocus(me, state.monsters.get(state.focusId))) setFocus(null);
  if (me) updateCamera(dt, me);
  updateNpcProximity(me);
}

// Modo de teste (só com localStorage nin.debug = "1", ligado à mão no aparelho): números da
// predição e uma "trapaça" de velocidade para ver o servidor corrigindo. Nada de token/sessão aqui.
try {
  if (localStorage.getItem('nin.debug') === '1') {
    window.ninDebug = Object.freeze({
      predicted: () => [pred.x, pred.y],
      official: () => { const me = state.players.get(state.meId); return me ? [me.tx, me.ty] : null; },
      drawn: (id) => { const p = state.players.get(id || state.meId); return p ? [p.x, p.y] : null; },
      map: () => ({ predicted: pred.map, drawn: state.mapId, server: state.serverMap }),
      visible: () => ({
        players: [...state.players.values()].filter((p) => p.map === state.mapId).length,
        monsters: [...state.monsters.values()].filter((m) => m.map === state.mapId).length,
      }),
      pending: () => pred.pending.length,
      stats: () => ({ ...pred.stats }),
      cheatSpeed: (factor) => { debugSpeedFactor = Number(factor) > 0 ? Number(factor) : 1; },
      cheatTeleport: (dx, dy) => { pred.x += Number(dx) || 0; pred.y += Number(dy) || 0; },
    });
  }
} catch { /* modo privado */ }

/**
 * Caminhada do paperdoll: a fase anda junto com a distância percorrida na tela (passo
 * proporcional à velocidade: correndo, as pernas balançam mais rápido). Barato: 1 hypot por jogador.
 */
function animateWalk(dt, me) {
  for (const p of state.players.values()) {
    let d = Math.hypot(p.x - p.lastX, p.y - p.lastY);
    p.lastX = p.x;
    p.lastY = p.y;
    if (d > 2) d = 0;                     // troca de mapa / renascer: não é passo
    p.moving = dt > 0 && d / dt > 0.6;
    if (p.moving) p.walk = (p.walk + d * 4.2) % (Math.PI * 4);
  }
  // O próprio boneco vira na hora para onde o joystick aponta.
  if (me && (dir.x !== 0 || dir.y !== 0) && !state.me.meditating) me.dir = dirFrom(dir.x, dir.y);
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
  lastView = { toScreenX, toScreenY, T };
  drawCooldowns(now);

  // 1. Chão (blocos em cache).
  const left = camX - halfW / T, right = camX + halfW / T, top = camY - halfH / T, bottom = camY + halfH / T;
  const cx0 = Math.floor(left / CHUNK), cx1 = Math.floor(right / CHUNK);
  const cy0 = Math.floor(top / CHUNK), cy1 = Math.floor(bottom / CHUNK);
  const size = CHUNK * T;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) ctx.drawImage(chunkCanvas(cx, cy), toScreenX(cx * CHUNK), toScreenY(cy * CHUNK), size, size);
  }

  // 2. Grade (um único traço para todas as linhas visíveis), também sobre o vizinho costurado.
  const gx0 = Math.ceil(left), gx1 = Math.floor(right);
  const gy0 = Math.ceil(top), gy1 = Math.floor(bottom);
  const sTop = 0, sBottom = viewH, sLeft = 0, sRight = viewW;
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
    if (m.map === state.mapId) drawList.push(m);
  }
  for (const p of state.players.values()) if (p.map === state.mapId) drawList.push(p);
  for (const n of state.npcs) drawList.push(n);
  if (drawList.length > 1) drawList.sort((a, b) => a.y - b.y);
  ctx.textAlign = 'center';
  for (const e of drawList) {
    if (e.npc) drawNpc(e, toScreenX(e.x), toScreenY(e.y), T, now, me);
    else if (e.type) drawMonster(e, toScreenX(e.x), toScreenY(e.y), T, now);
    else drawPlayer(e, toScreenX(e.x), toScreenY(e.y), T, e.id === state.meId, now);
  }

  for (const fx of state.effects) if (!GROUND_FX.has(fx.skill)) drawEffect(fx, toScreenX(fx.x), toScreenY(fx.y), T, now);

  // 6. Números flutuantes (dano, cura, XP, avisos) e falas do NPC.
  drawFloaters(toScreenX, toScreenY, T, now);
  for (const n of state.npcs) drawNpcBubble(n, toScreenX(n.x), toScreenY(n.y), T, now);

  // 7. Missão pronta e o Mestre fora da tela: seta na borda apontando para ele.
  const marker = npcMarker();
  if (me && marker && marker.strong && state.mission) {
    for (const n of state.npcs) drawOffscreenArrow(toScreenX(n.x), toScreenY(n.y), marker, now);
  }

  drawJoystick();
  drawMapChange(now);

  if (!me) {
    ctx.fillStyle = 'rgba(20, 17, 13, 0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
  }
}

/**
 * Troca de mapa: um "piscar" escuro rápido (0,35 s) e o nome do mapa no alto por ~2 s.
 * O boneco não sai do lugar na tela: a câmera segue ele e o vizinho já estava desenhado.
 */
function drawMapChange(now) {
  const t = now - mapFx.at;
  if (t < 350) {
    ctx.fillStyle = `rgba(8, 10, 8, ${0.35 * (1 - t / 350)})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }
  if (mapFx.name && t < 2200) {
    const a = t < 250 ? t / 250 : t > 1700 ? (2200 - t) / 500 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.textAlign = 'center';
    ctx.font = '700 22px system-ui, sans-serif';
    const y = Math.max(78, viewH * 0.2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10, 8, 6, 0.85)';
    ctx.strokeText(mapFx.name, viewW / 2, y);
    ctx.fillStyle = '#f4e6c4';
    ctx.fillText(mapFx.name, viewW / 2, y);
    ctx.restore();
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
    case 'attack': {                     // corte em arco na direção do alvo (alcance 1,6)
      const ang = Math.atan2(fx.fy, fx.fx);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(3, T * 0.14 * (1 - t * 0.6));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(sx, sy, T * (0.9 + 0.5 * t), ang - 0.9 + t * 0.6, ang + 0.5 + t * 0.6);
      ctx.stroke();
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

/** O Mestre: manto índigo com borda dourada, o kanji 師 (sensei) e o marcador de missão. */
function drawNpc(n, sx, sy, T, now, me) {
  const r = T * 0.44;
  ctx.save();
  // Perto o bastante para conversar: anel dourado no chão.
  if (state.nearNpc === n) {
    ctx.strokeStyle = 'rgba(255, 210, 63, 0.75)';
    ctx.lineWidth = Math.max(2, T * 0.06);
    ctx.setLineDash([T * 0.2, T * 0.12]);
    ctx.lineDashOffset = -now / 50;
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.9, r * 1.7, r * 0.66, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.92, r * 1.05, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  // manto (um pouco mais largo embaixo)
  ctx.fillStyle = '#3b2f6e';
  ctx.beginPath();
  ctx.moveTo(sx - r * 0.95, sy + r * 0.75);
  ctx.quadraticCurveTo(sx - r * 1.05, sy - r * 0.2, sx, sy - r * 1.02);
  ctx.quadraticCurveTo(sx + r * 1.05, sy - r * 0.2, sx + r * 0.95, sy + r * 0.75);
  ctx.quadraticCurveTo(sx, sy + r * 1.0, sx - r * 0.95, sy + r * 0.75);
  ctx.fill();
  ctx.lineWidth = Math.max(2, T * 0.07);
  ctx.strokeStyle = '#e8c66a';
  ctx.stroke();
  ctx.fillStyle = '#ffe9a8';
  ctx.font = `800 ${Math.round(r * 0.95)}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('師', sx, sy + r * 0.05);
  // nome
  const fontSize = Math.max(11, Math.round(T * 0.32));
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20, 17, 13, 0.9)';
  ctx.fillStyle = '#ffd23f';
  const nameY = sy - r * 1.05 - 3;
  ctx.strokeText(n.name, sx, nameY);
  ctx.fillText(n.name, sx, nameY);
  // marcador de missão, pulando
  const marker = npcMarker();
  if (marker) {
    const size = Math.max(16, Math.round(T * 0.62));
    const bob = Math.sin(now / 220) * T * 0.08;
    const my = nameY - fontSize - size * 0.15 + bob;
    ctx.font = `900 ${size}px system-ui, -apple-system, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20, 17, 13, 0.95)';
    ctx.strokeText(marker.ch, sx, my);
    ctx.fillStyle = marker.color;
    ctx.fillText(marker.ch, sx, my);
  }
  ctx.restore();
  n.labelTop = nameY - fontSize - Math.max(16, Math.round(T * 0.62));   // o balão fica acima do marcador
}

/** Fala do NPC: balão com quebra de linha, acima do marcador. */
function drawNpcBubble(n, sx, sy, T, now) {
  if (!n.bubble) return;
  if (now >= n.bubble.until) { n.bubble = null; return; }
  if (sx < -T || sx > viewW + T || sy < -T || sy > viewH + T) return;   // NPC fora da tela: a fala fica no chat
  const fontSize = Math.max(13, Math.round(T * 0.36));
  ctx.save();
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  const maxW = Math.min(280, viewW * 0.7);
  const lines = wrapText(n.bubble.text, maxW - 20);
  const lineH = fontSize + 4;
  const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20);
  const h = lines.length * lineH + 12;
  const bottom = (n.labelTop ?? sy - T) - 6;
  let x = Math.max(8, Math.min(viewW - w - 8, sx - w / 2));
  let y = bottom - h;
  // Sem espaço acima (celular deitado): o balão vai para o lado, sem cobrir nome e marcador.
  if (y < 60) {
    const side = sx + T * 0.7 + w + 8 <= viewW ? sx + T * 0.7 : sx - T * 0.7 - w;
    x = Math.max(8, Math.min(viewW - w - 8, side));
    y = Math.max(60, Math.min(viewH - h - 8, sy - h / 2));
  }
  ctx.fillStyle = 'rgba(255, 246, 220, 0.97)';
  ctx.strokeStyle = '#e8c66a';
  ctx.lineWidth = 2;
  roundRect(x, y, w, h, 10);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a2140';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, x + w / 2, y + 6 + i * lineH));
  ctx.restore();
}

function wrapText(text, maxW) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const tryLine = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(tryLine).width > maxW) { lines.push(line); line = word; }
    else line = tryLine;
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

/** Seta na borda da tela apontando para o NPC fora de vista. */
function drawOffscreenArrow(sx, sy, marker, now) {
  const pad = 34;
  if (sx >= pad && sx <= viewW - pad && sy >= pad + 50 && sy <= viewH - pad) return;
  const cx = viewW / 2, cy = viewH / 2;
  const ang = Math.atan2(sy - cy, sx - cx);
  const ax = Math.max(pad, Math.min(viewW - pad, sx));
  const ay = Math.max(pad + 56, Math.min(viewH - pad, sy));
  const s = 13 + Math.sin(now / 200) * 2;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.fillStyle = 'rgba(20, 17, 13, 0.75)';
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = marker.color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = marker.color;
  ctx.font = '900 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(marker.ch, 0, 1);
  ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(20 + s, 0); ctx.lineTo(22, -8); ctx.lineTo(22, 8); ctx.closePath();
  ctx.fill();
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
  const look = isMe && state.me.look ? state.me.look : p.look;
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
  // Boneco modular: cabeça, cabelo, tronco, braços, pernas e capa nas cores do jogador.
  const headTop = drawCharacter(ctx, sx, sy, T, look, p.dead ? 0 : p.dir, p.walk, p.moving && !p.dead);
  if (isMe) {                         // marquinha para achar o próprio boneco no meio dos outros
    ctx.fillStyle = '#ffe2a8';
    ctx.beginPath();
    ctx.moveTo(sx - 4, headTop - 3); ctx.lineTo(sx + 4, headTop - 3); ctx.lineTo(sx, headTop + 1);
    ctx.fill();
  }

  // nome
  const fontSize = Math.max(11, Math.round(T * 0.32));
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';            // contorno do texto sem "espinhos" nas quinas
  ctx.strokeStyle = 'rgba(20, 17, 13, 0.9)';
  ctx.fillStyle = isMe ? '#ffe2a8' : '#f4ead8';
  const nameY = headTop - 5 - (isMe ? 2 : 7);
  ctx.strokeText(p.username, sx, nameY);
  ctx.fillText(p.username, sx, nameY);
  // vida dos outros jogadores (a nossa fica nas barras de baixo)
  if (!isMe && !p.dead) drawHpBar(sx, headTop - 9, T * 0.8, p.hp / p.maxHp, '#7bd36a');
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
  ctx.globalAlpha = (active ? 0.9 : 0.5) * (hud.editing ? 1 : hud.btnOpacity);
  if (hud.editing) {                  // modo edição: contorno tracejado mostra que dá para arrastar
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffd23f';
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.baseX, joy.baseY, joy.radius + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
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
applyHud();
requestAnimationFrame(frame);
if (readToken()) startGame();
else showLogin();
