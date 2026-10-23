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
import { groundAt, inSafeZone, mapName, placements, visibleDeco, visibleWalls } from './world.js';
import { drawAcademyDoor, drawChakraField, drawDeco, drawGateRoof, drawWall } from './mapArt.js';
import { dirFrom, drawBackItem, drawCharacter, drawHandItem } from './character.js';
import {
  DEFAULT_APPEARANCE, OPTIONS, anchorsOf, drawCell, fallbackColors, loadSprites, normalizeLook, pickFrame, spriteScale,
  spritesReady, swatchOf, viewOf,
} from './sprites.js';
import { Predictor, pushSnapshot, quantize, sampleSnapshots } from './prediction.js';
import { VFXManager, loadVfx, vfxReady } from './vfx.js';
import { drawBackWeapon, drawHandWeapon, drawnForStrike, isThrown, loadWeapons, weaponReady } from './weapons.js';

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
  attrRows: [...document.querySelectorAll('.attr-list li')],
  kitCount: $('kit-count'), kitSave: $('kit-save'),
  playerMenu: $('player-menu'), pmName: $('pm-name'), pmRank: $('pm-rank'), pmClose: $('pm-close'), pmDeliver: $('pm-deliver'),
  pmCreate: $('pm-create'), pmForm: $('pm-form'), pmQty: $('pm-qty'), pmDiff: $('pm-diff'), pmSend: $('pm-send'), pmNote: $('pm-note'),
  settingsToggle: $('settings-toggle'), settingsPanel: $('settings-panel'), settingsClose: $('settings-close'),
  editLayout: $('edit-layout'), editBanner: $('edit-banner'), editDone: $('edit-done'), editReset: $('edit-reset'),
  resetLayout: $('reset-layout'), openCreator: $('open-creator'), vitals: $('vitals'),
  sliders: { btnScale: $('btn-scale'), btnOpacity: $('btn-opacity'), barScale: $('bar-scale'), barOpacity: $('bar-opacity') },
  creator: $('creator'), creatorCanvas: $('creator-canvas'), creatorTurn: $('creator-turn'), creatorOptions: $('creator-options'),
  creatorError: $('creator-error'),
  creatorRandom: $('creator-random'), creatorCancel: $('creator-cancel'), creatorSave: $('creator-save'),
  evalPanel: $('eval-panel'), evalText: $('eval-text'), evalStars: $('eval-stars'), evalApprove: $('eval-approve'), evalReject: $('eval-reject'),
  login: $('login'), loginForm: $('login-form'), loginError: $('login-error'), loginSubmit: $('login-submit'),
  toggleMode: $('toggle-mode'), usernameField: $('username-field'), passwordHint: $('password-hint'),
  rotate: $('rotate'), rotateDismiss: $('rotate-dismiss'), safeProbe: $('safe-probe'),
  hpFill: $('hp-fill'), hpText: $('hp-text'), chakraFill: $('chakra-fill'), chakraText: $('chakra-text'),
  targetBtn: $('target-btn'), meditateBtn: $('meditate-btn'), talkBtn: $('talk-btn'),
  shopPanel: $('shop-panel'), shopClose: $('shop-close'), shopIcon: $('shop-icon'), shopName: $('shop-name'),
  shopGreet: $('shop-greet'), shopItems: $('shop-items'),
  missionsToggle: $('missions-toggle'), missionsBadge: $('missions-badge'), missionsPanel: $('missions-panel'),
  missionsClose: $('missions-close'), missionCard: $('mission-card'), missionSensei: $('mission-sensei'),
  missionTitle: $('mission-title'), missionMeter: $('mission-meter'), missionFill: $('mission-fill'),
  missionCount: $('mission-count'), missionStatus: $('mission-status'), missionReward: $('mission-reward'),
  missionEmpty: $('mission-empty'), missionLast: $('mission-last'),
  xpLine: $('xp-line'), hurt: $('hurt'), death: $('death'), deathTimer: $('death-timer'), respawn: $('respawn'),
  // v7: progressão
  invToggle: $('inv-toggle'), invBadge: $('inv-badge'), invPanel: $('inv-panel'), invClose: $('inv-close'), invRyo: $('inv-ryo'),
  invClass: $('inv-class'), invItems: $('inv-items'), invEmpty: $('inv-empty'),
  tutorialCard: $('tutorial-card'), tutorialTitle: $('tutorial-title'), tutorialText: $('tutorial-text'),
  shopRyo: $('shop-ryo'), shopNote: $('shop-note'), extractBox: $('extract-box'), extractClass: $('extract-class'),
  extractLevel: $('extract-level'), extractInfo: $('extract-info'), extractGo: $('extract-go'), extractResult: $('extract-result'),
  tabJutsus: $('tab-jutsus'), paneJutsus: $('pane-jutsus'), jutsuList: $('jutsu-list'), kitList: $('kit-list'),
  classPanel: $('class-panel'), classTitle: $('class-title'), classClose: $('class-close'), classGrid: $('class-grid'),
  classDesc: $('class-desc'), classConfirm: $('class-confirm'),
  hokagePanel: $('hokage-panel'), hokageClose: $('hokage-close'), hokageApply: $('hokage-apply'),
  // v8: histórico do chat, Sala de Missões (cartões) e redefinir atributos
  historyToggle: $('history-toggle'), historyPanel: $('history-panel'), historyClose: $('history-close'),
  historyList: $('history-list'), historyEmpty: $('history-empty'), historyTabs: [...document.querySelectorAll('#history-panel .tab')],
  boardPanel: $('board-panel'), boardClose: $('board-close'), boardCards: $('board-cards'), boardCurrent: $('board-current'),
  boardTitle: $('board-mission-title'), boardProgress: $('board-mission-progress'), boardDeliver: $('board-deliver'), boardHint: $('board-hint'),
  resetAttrs: $('reset-attrs'),
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
  world: { width: 50, height: 50, speed: 5, tickMs: 50, spawn: { x: 25, y: 25 }, respawnMs: 5000, skills: {}, items: [], classes: [], extraction: [] },
  /**
   * Progressão (v7), SEMPRE a do servidor: passo do tutorial (trava as portas da Academia), ryō,
   * itens, arma equipada, classes, jutsus aprendidos -> usos (o nível sai do uso) e Hokage.
   */
  ninja: { tutorialStep: 4, ryo: 0, items: {}, equipped: null, equippedScroll: null, classes: { primary: null, secondary: null }, jutsus: {}, hokageCandidate: false, isAdmin: false },
  /** Histórico do chat (o servidor manda as últimas 100 ao conectar; as novas entram no fim). */
  chatHistory: [],
  /** Cartões da Sala de Missões (o servidor manda ao falar com o Mestre) ou null. */
  board: null,
  /** Campos que drenam chakra no mapa atual (Sala de Controle da Academia). */
  fields: [],
  /** Layouts de todos os mapas (welcome), o mapa DESENHADO agora (o previsto) e o da última posição oficial. */
  maps: {},
  mapId: null,
  serverMap: null,
  /** Mapa atual + vizinhos costurados nas saídas (world.js) e as paredes visíveis (casas e árvores). */
  places: [],
  walls: [],
  /** Enfeites visíveis (bancos, lanternas...) e os que passam POR CIMA dos jogadores (telhado do portão). */
  deco: [],
  overhead: [],
  /** Loja aberta ({ kind, npcId }) ou null. */
  shop: null,
  /** O próprio jogador está numa zona segura (praça): botões de combate apagados. */
  inSafeZone: false,
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
  /** Portas da Academia (desenhadas a cada quadro: abertas ou fechadas pelo passo do tutorial). */
  doors: [],
};

/** Gear vindo da rede: só códigos curtos (o desenho ignora o que não conhece). */
const safeGear = (g) => {
  const ok = (c) => (typeof c === 'string' && /^[a-z][a-z0-9_]{0,31}$/.test(c) ? c : null);
  return { hand: ok(g?.hand), back: ok(g?.back), scroll: ok(g?.scroll) };
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
  closeInventory();
  closeClassChoice();
  closeHokage();
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
    if (p.appearance) existing.look = normalizeLook(p.appearance);
    if (p.dir !== undefined) existing.dir = p.dir;
    if (p.gear) existing.gear = safeGear(p.gear);
    return existing;
  }
  const color = colorFor(p.id);
  const player = {
    id: p.id, username: p.username, map: state.serverMap, x: p.x, y: p.y, tx: p.x, ty: p.y, color, bubble: null,
    // Posições que chegaram do servidor (interpolação: desenha ~100 ms no passado, sem pulos).
    snaps: [{ t: performance.now(), x: p.x, y: p.y }],
    hp: p.hp ?? 100, maxHp: p.maxHp ?? 100, dead: !!p.dead, meditating: !!p.meditating,
    rank: p.rank || null, level: p.level || 1,
    // Visual (sprites: nomes de paleta, do servidor), direção (0 baixo, 1 esq, 2 dir, 3 cima), fase da caminhada,
    // ação em curso (soco/chute/selo) e atraso do "parado" (para os bonecos não respirarem juntos).
    look: normalizeLook(p.appearance), dir: p.dir ?? 0, walk: 0, moving: false, running: false, act: null,
    seed: [...p.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 0) * 7, lastX: p.x, lastY: p.y,
    // Equipamento visível (o servidor manda): arma na mão / nas costas e pergaminho nas costas.
    gear: safeGear(p.gear),
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
  NOT_EQUIPPED: 'Fora do kit ativo', SAFE_ZONE: 'Zona segura: sem combate',
  NOT_LEARNED: 'Jutsu não aprendido', BLOCKED: 'Caminho bloqueado', TUTORIAL_LOCKED: 'Primeiro, o Ataque Básico',
  STUNNED: 'Atordoado!',
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
        appearanceSet: msg.you.appearanceSet !== false, look: normalizeLook(msg.you.appearance),
      });
      // Primeira vez (conta nova ou antes da v6): Criador de Personagem.
      if (!state.me.appearanceSet) openCreator(true);
      if (msg.progress) state.progress = msg.progress;
      if (msg.kit) state.kit = msg.kit;
      if (msg.ninja) state.ninja = msg.ninja;
      pred.gates.tutorial = state.ninja.tutorialStep;   // portas da Academia: o MESMO passo do servidor
      renderNinja();
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
    case 'shop_open':
      openShop(msg.shop, msg.npcId);
      break;

    // ---- progressão (v7): tudo vem do servidor; o cliente só mostra
    case 'tutorial': {
      state.ninja.tutorialStep = msg.step;
      pred.gates.tutorial = msg.step;           // a porta da sala abre na previsão também
      renderTutorial();
      if (msg.step === 3) pulse(ui.invToggle);      // Sala de Armas: a mochila
      break;
    }
    case 'inventory':
      Object.assign(state.ninja, { ryo: msg.ryo, items: msg.items, equipped: msg.equipped, equippedScroll: msg.equippedScroll ?? null });
      renderInventory();
      renderResetButton();
      renderShopItems();
      renderTutorial();
      break;
    case 'classes':
      state.ninja.classes = { primary: msg.primary, secondary: msg.secondary };
      closeClassChoice();
      renderInventory();
      renderShopItems();
      break;
    case 'jutsus':
      state.ninja.jutsus = msg.jutsus;
      renderStatus();
      break;
    case 'jutsu_level': {
      const me = state.players.get(state.meId);
      if (me) addFloater(me.x, me.y - 1.6, `${skillName(msg.skill)} Nv ${msg.level}!`, '#8fd8ff', 1.05);
      state.ninja.jutsus[msg.skill] = Math.max(state.ninja.jutsus[msg.skill] || 0, (state.world.jutsuLevelUses || [])[msg.level - 1] || 0);
      renderStatus();
      break;
    }
    case 'class_choice':
      openClassChoice(msg.kind, msg.classes);
      break;
    case 'extract_result':
      showExtractResult(msg);
      break;
    case 'teleport': {
      // Teleporte Curto: o SERVIDOR decidiu o lugar (alcance pelo nível, parando antes da parede).
      if (!vfx.play('smoke', msg.fromX, msg.fromY, { start: now })) {
        state.effects.push({ skill: 'teleport', x: msg.fromX, y: msg.fromY, fx: 0, fy: 0, start: now });
        state.effects.push({ skill: 'teleport', x: msg.x, y: msg.y, fx: 0, fy: 0, start: now + 60 });
      } else {
        vfx.play('smoke', msg.x, msg.y, { start: now, delay: 60 });
      }
      jumpPlayer(msg.playerId, msg.x, msg.y, msg.a);
      break;
    }
    case 'dash': {
      // Avanço do Taijutsu: o servidor moveu o jogador até o alvo. Poeira onde ele saiu.
      vfx.play('dust', msg.fromX, msg.fromY, { start: now, feet: true, layer: 'ground' });
      jumpPlayer(msg.playerId, msg.x, msg.y, msg.a);
      break;
    }
    case 'substitution': {
      // Substituição: o golpe acertou um TRONCO; o ninja aparece atrás do atacante.
      state.effects.push({ skill: 'log', x: msg.logX, y: msg.logY, fx: 0, fy: 0, start: now });
      if (!vfx.play('smoke', msg.x, msg.y, { start: now })) state.effects.push({ skill: 'teleport', x: msg.x, y: msg.y, fx: 0, fy: 0, start: now });
      vfx.play('smoke', msg.logX, msg.logY, { start: now, scale: 0.8 });
      const p = state.players.get(msg.playerId);
      if (p) addFloater(msg.logX, msg.logY - 0.9, 'Substituição!', '#e8c66a', 1);
      jumpPlayer(msg.playerId, msg.x, msg.y, msg.a);
      if (msg.playerId === state.meId && navigator.vibrate) try { navigator.vibrate(30); } catch { /* sem vibração */ }
      break;
    }
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
      // Renascer e o tutorial (o servidor leva para a sala seguinte / Praça): salto, sem refazer entradas.
      if (msg.reason === 'respawn' || msg.reason === 'tutorial') pred.teleport(msg.map, msg.x, msg.y);
      else pred.reconcile(msg.map, msg.x, msg.y, msg.a, predWorld);
      if (msg.reason === 'tutorial' && me) { me.x = msg.x; me.y = msg.y; me.snaps = [{ t: now, x: msg.x, y: msg.y }]; }
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
      if (p) p.look = normalizeLook(msg.appearance);
      if (msg.playerId === state.meId) {
        state.me.appearanceSet = true;
        state.me.look = normalizeLook(msg.appearance);
        closeCreator();
      }
      break;
    }
    case 'player_left':
      state.players.delete(msg.playerId);
      updateOnline();
      break;
    case 'chat': {
      const entry = { channel: msg.channel || 'local', playerId: msg.playerId, username: msg.username, to: msg.to, message: msg.message, at: new Date().toISOString() };
      addChatLine(chatWho(entry), msg.message, msg.playerId === state.meId, entry.channel === 'local' ? '' : entry.channel);
      rememberChat(entry);
      const p = state.players.get(msg.playerId);
      // Balão só para a fala local (global e sussurro não "saem da boca" no mapa).
      if (p && entry.channel === 'local') p.bubble = { text: msg.message, until: now + 4500 };
      break;
    }
    case 'chat_history':
      // Ao abrir o jogo e no 🕘: as mensagens anteriores (até 100, últimas 24 h).
      state.chatHistory = (msg.messages || []).slice(-100);
      renderHistory();
      break;
    case 'player_gear': {
      const p = state.players.get(msg.playerId);
      if (p) p.gear = safeGear(msg.gear);
      break;
    }
    case 'mission_board':
      // O Mestre abriu a Sala de Missões: cartões + a missão atual (tudo do servidor).
      state.board = { offers: msg.offers || [] };
      state.mission = msg.mission;
      renderMission();
      openBoard();
      break;

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
      // Corte em arco (a hitbox do servidor: 90°, 1,6 casa) na direção do golpe, junto do quadro do corte/soco.
      // Arremesso (Shuriken Gigante): sem corte; o efeito é a shuriken voando (mensagem `projectile`).
      if (!msg.throw && !vfx.play('slash', msg.x, msg.y, { start: now, delay: 80, angle: Math.atan2(msg.fy, msg.fx) })) {
        state.effects.push({ skill: 'attack', x: msg.x, y: msg.y, fx: msg.fx, fy: msg.fy, start: now });
      }
      faceTo(msg.playerId, msg.fx, msg.fy);
      const attacker = state.players.get(msg.playerId);
      // Com arma equipada (na mão ou nas costas), o golpe é com ela; sem arma, soco e chute alternados.
      if (attacker) {
        const armed = attacker.gear?.hand || attacker.gear?.back;
        attacker.act = { kind: armed ? 'golpe' : attacker.act?.kind === 'soco' ? 'chute' : 'soco', start: now };
      }
      if (msg.playerId === state.meId) startCooldown('attack', msg.cd);
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
      if (msg.playerId === state.meId) {          // Genin (Missão de Genin) / Chunin (Exame): a barra de baixo também
        state.me.rank = msg.rank;
        renderVitals();
      }
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
      // Efeito pela MECÂNICA do jutsu (os tiers 2 a 4 usam a do tier 1, maior).
      const fxKind = mechanicOf(msg.skill);
      // (Fogo: a explosão é no impacto, mensagem `impact`; nada em volta de quem lançou.)
      if (fxKind !== 'teleport' && fxKind !== 'fire' && !playCastVfx(msg, fxKind, now)) state.effects.push({ skill: fxKind, x: msg.x, y: msg.y, fx: msg.fx, fy: msg.fy, start: now });
      faceTo(msg.playerId, msg.fx, msg.fy);
      const caster = state.players.get(msg.playerId);
      if (caster) caster.act = { kind: 'jutsu', start: now };
      if (msg.playerId === state.meId) {
        console.log(`[habilidade] ${msg.skill}`);
        startCooldown(msg.skill);
      }
      break;
    }
    case 'projectile': {
      // Fogo / Kunai / Shuriken Gigante saiu voando: a tela anda com ele; quem decide onde bate é o servidor (`impact`).
      const sheet = msg.weapon ? 'fuma' : mechanicOf(msg.skill) === 'fire' ? 'fireball' : 'kunai';
      vfx.launch(msg.id, sheet, msg.x, msg.y, msg.fx, msg.fy, msg.speed, msg.range, now);
      const thrower = msg.weapon ? state.players.get(msg.playerId) : null;
      if (thrower) thrower.thrown = { id: msg.id, until: now + (msg.range / Math.max(0.1, msg.speed)) * 1000 + 400 };   // costas vazias enquanto voa
      break;
    }
    case 'impact': {
      vfx.land(msg.id);
      if (msg.weapon) {                       // a Shuriken Gigante chegou no fim do caminho: volta para as costas
        for (const p of state.players.values()) if (p.thrown?.id === msg.id) p.thrown = null;
        break;
      }
      if (msg.r > 0) {
        if (!vfx.play('explosion', msg.x, msg.y, { start: now, scale: msg.r / 2 })) {
          state.effects.push({ skill: 'fire', x: msg.x, y: msg.y, fx: 0, fy: 0, r: msg.r, start: now });
        }
      } else {
        vfx.play('hit', msg.x, msg.y, { start: now });
      }
      break;
    }
    case 'player_status': {
      // PvP: jogador atordoado (Relâmpago) ou preso (Sombra).
      const p = state.players.get(msg.playerId);
      if (p) {
        if (msg.status === 'stunned') p.stunnedUntil = now + msg.ms;
        else p.rootedUntil = now + msg.ms;
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
      if (!heal) vfx.play('hit', target.x, target.y - 0.15, { start: now, scale: 0.8 });
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
      renderBoard();
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
      // Diretor, nível 60 e ainda sem candidatura: o botão de Hokage aparece.
      const hokageAt = state.world.rankLevels?.hokage ?? 60;
      if (msg.npcId === 'director' && (state.progress?.level ?? 1) >= hokageAt && !state.ninja.hokageCandidate) openHokage();
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
        'PROFILE_UNAVAILABLE', 'PROFILE_BUSY', 'PLAYER_NOT_FOUND', 'PLAYER_TOO_FAR', 'INVALID_MISSION_OPTION',
        'NOT_LEARNED', 'SHOP_TOO_FAR', 'DIRECTOR_TOO_FAR', 'ITEM_NOT_OWNED', 'NOT_A_WEAPON', 'NOT_A_SCROLL', 'SENSEI_TOO_FAR',
        'TUTORIAL_LOCKED'].includes(msg.code)) {
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

/**
 * Salto decidido pelo servidor (Teleporte, Substituição). O próprio jogador: a predição recomeça
 * da posição oficial e refaz as entradas que o servidor ainda não aplicou, sem deslizar. Os outros:
 * aparecem direto no lugar novo (sem interpolar o caminho).
 */
function jumpPlayer(playerId, x, y, ack) {
  const p = state.players.get(playerId);
  if (!p) return;
  p.tx = x; p.ty = y;
  if (playerId === state.meId) {
    if (predWorld) pred.jump(state.serverMap, x, y, ack, predWorld);
  } else {
    p.x = x; p.y = y;
    p.snaps = [{ t: performance.now(), x, y }];
  }
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
  const zone = state.inSafeZone ? 'zona segura · ' : '';
  setStatus(`online · ${where ? `${where} · ` : ''}${zone}${n} ${n === 1 ? 'jogador' : 'jogadores'}`, 'ok');
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
  // Paredes de cima para baixo: o que está mais embaixo é desenhado por cima (3/4).
  state.walls = visibleWalls(state.places).sort((a, b) => a.y + a.h - (b.y + b.h));
  const deco = visibleDeco(state.places);
  state.deco = deco.filter((d) => d.k !== 'gate_roof' && d.k !== 'door');
  state.overhead = deco.filter((d) => d.k === 'gate_roof');
  state.doors = deco.filter((d) => d.k === 'door');      // Academia: abrem conforme o tutorial (desenho a cada quadro)
  state.fields = layout.fields || [];                     // Sala de Controle: o campo que drena o chakra
  state.npcs = state.allNpcs.filter((n) => n.map === id);
  state.nearNpc = null;
  ui.talkBtn.hidden = true;
  const me = state.players.get(state.meId);
  if (me) me.map = id;
  if (changed) {
    closeShop();
    state.effects.length = 0;
    vfx.clear();
    state.floaters.length = 0;
    if (state.focusId) setFocus(null);
    mapFx.at = performance.now();
    mapFx.name = announce ? layout.name : '';
  }
  updateOnline();
  renderTutorial();
}
const mapFx = { at: -1e9, name: '' };

/**
 * Troca de mapa com FADE: escurece em 0,14 s (o boneco fica parado na borda/porta), troca o
 * mapa desenhado já no escuro e clareia em 0,26 s. A predição e o servidor trocam na hora:
 * só o desenho espera os 0,14 s. Total 0,4 s, sem tela de carregamento.
 */
const FADE_OUT_MS = 140;
const FADE_IN_MS = 260;
const mapFade = { to: null, outAt: 0, alpha: 0 };

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
  if (e.key === 'i' || e.key === 'I') (ui.invPanel.hidden ? openInventory() : closeInventory());
  if (e.key === 'h' || e.key === 'H') (ui.historyPanel.hidden ? openHistory() : closeHistory());
  if (e.key === 'Escape') { closeShop(); closeInventory(); closeClassChoice(); closeHokage(); closeBoard(); closeHistory(); }
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code] && keys.delete(e.code)) keyDirection();
});

// App em segundo plano ou aba trocada: para de andar.
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); joy.pointerId = null; joy.knobX = joy.knobY = 0; setDirection(0, 0); } });
window.addEventListener('blur', () => { keys.clear(); if (joy.pointerId === null) setDirection(0, 0); });

// ------------------------------------------------------------------ habilidades

/**
 * Efeito de cada MECÂNICA: cor e duração no canvas (só visual, o servidor só valida). Os 38
 * jutsus usam a mecânica da classe (Fogo, Água...) ou a da Academia (Teleporte, Substituição).
 */
const SKILLS = {
  fire: { color: '#ff2e1f', ms: 520 },
  water: { color: '#3ca6ff', ms: 700 },
  taijutsu: { color: '#f2b13a', ms: 380 },
  illusion: { color: '#a072ff', ms: 800 },
  shadow: { color: '#2a2140', ms: 900 },
  stone: { color: '#9a7448', ms: 650 },
  heal: { color: '#5fe07a', ms: 900 },
  weapons: { color: '#c9d2da', ms: 420 },
  lightning: { color: '#fff27a', ms: 360 },
  teleport: { color: '#d6efff', ms: 380 },
  substitution: { color: '#e8c66a', ms: 600 },
  log: { color: '#8b5a2b', ms: 1400 },         // tronco que levou o golpe da Substituição
  attack: { color: '#fff3c4', ms: 260 },   // Ataque Básico: corte rápido na direção do golpe
};
const GROUND_FX = new Set(['shadow', 'water', 'log']);
/** Efeitos em sprite (assets/vfx). Os de `SKILLS`/drawEffect ficam de reserva, se as folhas não carregarem. */
const vfx = new VFXManager();

/**
 * Efeito em sprite de um jutsu aceito, na forma da hitbox do servidor (tx, ty = onde o efeito acontece).
 * Devolve false se a folha não carregou (o jogo desenha o efeito antigo).
 */
function playCastVfx(msg, mechanic, now) {
  const angle = Math.atan2(msg.fy, msg.fx);
  const info = state.world.skills?.[msg.skill] || {};
  const at = { start: now };
  const hasTo = msg.tx !== undefined && msg.ty !== undefined;
  const len = hasTo ? Math.hypot(msg.tx - msg.x, msg.ty - msg.y) : (info.range ?? 4);
  switch (mechanic) {
    case 'fire':
    case 'weapons':
      return vfxReady(mechanic === 'fire' ? 'fireball' : 'kunai');   // o projétil (mensagem `projectile`) é o efeito
    case 'water':
      return vfx.play('water', msg.x, msg.y, { ...at, angle, scale: (info.range ?? 4) / 4, layer: 'ground' });
    case 'taijutsu':
      if (!vfxReady('punch')) return false;
      if (hasTo) vfx.play('punch', msg.tx, msg.ty, { ...at, delay: 60 });
      return true;
    case 'illusion':
      return vfx.play('illusion', msg.x, msg.y, { ...at, scale: (info.radius ?? 3) / 3, layer: 'ground' });
    case 'shadow':
      if (!vfx.play('shadow', msg.x, msg.y, { ...at, angle, length: len, feet: true, layer: 'ground' })) return false;
      if (hasTo) vfx.play('bind', msg.tx, msg.ty, { ...at, delay: 160, feet: true });
      return true;
    case 'lightning':
      if (!vfx.play('lightning', msg.x, msg.y, { ...at, angle, length: len })) return false;
      if (hasTo) vfx.play('spark', msg.tx, msg.ty, at);
      return true;
    case 'stone':
      return vfx.play('stone', msg.x, msg.y, { ...at, feet: true });
    case 'heal':
      return vfx.play('heal', hasTo ? msg.tx : msg.x, hasTo ? msg.ty : msg.y, { ...at, feet: true });
    default:
      return false;
  }
}
/**
 * Mecânicas que miram no alvo focado (as mesmas do servidor). Taijutsu: sempre o mais perto; Ilusão: círculo
 * em volta do jogador; Pedra e Cura: em si mesmo (a Cura pega o aliado mais ferido por perto).
 */
const DIRECTED = new Set(['fire', 'water', 'shadow', 'lightning', 'weapons']);
/** Mecânica e nome de um jutsu (catálogo do welcome). */
const mechanicOf = (skill) => state.world.skills?.[skill]?.mechanic || skill;
const skillName = (skill) => state.world.skills?.[skill]?.name || skill;

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
  closeInventory();
  closeStatus();
  closePlayerMenu();
  closeBoard();
  closeHistory();
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

// ---- Sala de Missões do Mestre (v8): cartões para escolher e o botão "Entregar".
// Tudo vem do servidor (mission_board / mission); o cliente só pede accept_mission e deliver_npc_mission.

const DIFFICULTY_CLASS = { 'Fácil': 'easy', Normal: 'normal', 'Difícil': 'hard' };

function openBoard() {
  closeMissions();
  closeInventory();
  closeStatus();
  closeShop();
  closePlayerMenu();
  closeHistory();
  renderBoard();
  ui.boardPanel.hidden = false;
}
function closeBoard() { ui.boardPanel.hidden = true; }
ui.boardClose.addEventListener('click', closeBoard);

/** Estado do botão "Entregar": verde quando dá para entregar; cinza dizendo o que falta. */
function deliverState(m) {
  if (!m) return null;
  if (m.status === 'approved') return { ready: true, text: '✅ Entregar pergaminho' };
  if (m.status === 'submitted') return { ready: false, text: `Esperando a avaliação de ${m.senseiName}` };
  if (!m.fromNpc) return { ready: false, text: m.ready ? `Entregue ao sensei ${m.senseiName}` : `Missão do sensei ${m.senseiName}` };
  if (m.ready) return { ready: true, text: '✅ Entregar' };
  const left = Math.max(0, m.target.quantity - m.progress);
  return { ready: false, text: `Faltam ${left} ${left === 1 ? 'monstro' : 'monstros'}` };
}

function renderBoard() {
  if (!state.board) return;
  const m = state.mission;
  ui.boardCurrent.hidden = !m;
  if (m) {
    const done = Math.min(m.progress, m.target.quantity);
    ui.boardTitle.textContent = `${missionTitle(m)} · Sensei ${m.senseiName}`;
    ui.boardProgress.textContent = `${done} / ${m.target.quantity} · Recompensa: ${m.reward.xp} XP${m.reward.title ? ` e o título “${m.reward.title}”` : ''}`;
    const d = deliverState(m);
    ui.boardDeliver.textContent = d.text;
    ui.boardDeliver.disabled = !d.ready;
    ui.boardDeliver.classList.toggle('ready', d.ready);
  }
  ui.boardHint.textContent = m ? 'Termine (ou entregue) a missão atual para escolher outra.' : 'Escolha um treino. A recompensa vem do Mestre ao entregar.';
  ui.boardCards.replaceChildren(...state.board.offers.map((o) => {
    const li = document.createElement('li');
    li.className = `board-card ${DIFFICULTY_CLASS[o.difficulty] || ''}`;
    const head = document.createElement('div');
    head.className = 'board-card-head';
    const title = document.createElement('h3');
    title.textContent = o.title;
    const diff = document.createElement('span');
    diff.className = 'difficulty';
    diff.textContent = o.difficulty;
    head.append(title, diff);
    const desc = document.createElement('p');
    desc.className = 'board-desc';
    desc.textContent = o.description;
    const goal = document.createElement('p');
    goal.className = 'board-goal';
    goal.textContent = `🎯 Derrotar ${o.target.quantity} ${targetName(o.target.code, o.target.quantity)}`;
    const reward = document.createElement('p');
    reward.className = 'board-reward';
    reward.textContent = `🏅 ${o.reward.xp} XP${o.reward.title ? ` + título “${o.reward.title}”` : ''}`;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'primary';
    b.textContent = 'Aceitar';
    b.disabled = !!m;
    b.addEventListener('click', () => {
      if (!tapGuard(`accept:${o.code}`)) return;
      send({ type: 'accept_mission', offer: o.code });
    });
    li.append(head, desc, goal, reward, b);
    return li;
  }));
}
ui.boardDeliver.addEventListener('click', () => {
  if (ui.boardDeliver.disabled || !tapGuard('deliver')) return;
  send({ type: 'deliver_npc_mission' });   // o servidor (e o banco) conferem o objetivo de novo
});

/** Botão 💬 Falar (só aparece perto do NPC). O servidor confere a distância de novo. */
let lastTalkAt = -Infinity;          // sem isto, falar no 1º meio segundo da página era ignorado
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
    // Lojista: o botão vira 🛒 (abre a loja); o Mestre continua 💬 (conversa e missões).
    ui.talkBtn.querySelector('.ico').textContent = near && near.shop ? '🛒' : '💬';
    ui.talkBtn.setAttribute('aria-label', near && near.shop ? 'Abrir a loja' : 'Falar');
  }
  // Sala de Missões aberta e o jogador se afastou do Mestre: fecha.
  if (!ui.boardPanel.hidden) {
    const sensei = state.npcs.find((n) => n.id === 'sensei');
    if (!me || !sensei || Math.hypot(me.x - sensei.x, me.y - sensei.y) > sensei.range + 0.6) closeBoard();
  }
  // Loja aberta e o jogador se afastou do balcão: fecha.
  if (state.shop) {
    const npc = state.npcs.find((n) => n.id === state.shop.npcId);
    if (!me || !npc || Math.hypot(me.x - npc.x, me.y - npc.y) > npc.range + 0.6) closeShop();
  }
}

// ------------------------------------------------------------------ lojas (painel)

/** Cada loja: ícone, nome e fala. O que ela VENDE (e o preço) vem do catálogo do servidor. */
const SHOP_INFO = {
  weapons: { icon: '⚔️', name: 'Armaria', greet: '“Lâminas afiadas para ninjas de verdade.”' },
  clothes: { icon: '👘', name: 'Alfaiataria', greet: '“Um ninja bem vestido assusta antes da luta.”' },
  scrolls: { icon: '📜', name: 'Casa dos Pergaminhos', greet: '“Cada pergaminho guarda um jutsu. A Extração revela qual.”' },
};
/** Visual dos lojistas e dos NPCs da Academia (sprites: nomes de paleta, como o dos jogadores). */
const npcLook = (o) => normalizeLook({ ...DEFAULT_APPEARANCE, ...o });
const SHOPKEEPER_LOOK = {
  weapons: npcLook({ skin: 'canela', hairColor: 'preto', shirtColor: 'cinza', pantsColor: 'preto', bandana: true }),
  clothes: npcLook({ gender: 'f', hairStyle: 'longo_lateral', eyeStyle: 'cilios', hairColor: 'roxo', eyeColor: 'roxo', shirtColor: 'rosa', pantsColor: 'roxo' }),
  scrolls: npcLook({ skin: 'mel', hairColor: 'branco', eyeColor: 'cinza', shirtColor: 'azul_marinho', pantsColor: 'marrom', bandana: true }),
};
const ACADEMY_LOOK = {
  tutor_dummies: npcLook({ gender: 'f', hairStyle: 'longo_lateral', eyeStyle: 'cilios', hairColor: 'vermelho', eyeColor: 'verde', outfit: 'vila', bandana: true }),
  tutor_meditation: npcLook({ skin: 'canela', hairColor: 'branco', shirtColor: 'amarelo', pantsColor: 'marrom' }),
  tutor_jutsu: npcLook({ gender: 'f', hairStyle: 'longo_lateral', eyeStyle: 'cilios', skin: 'mel', hairColor: 'preto', eyeColor: 'roxo', shirtColor: 'roxo', pantsColor: 'azul_marinho', bandana: true }),
  tutor_weapons: npcLook({ hairColor: 'preto', outfit: 'vila', bandana: true }),
  director: npcLook({ hairColor: 'branco', eyeColor: 'cinza', shirtColor: 'vinho', pantsColor: 'marrom', bandana: true }),
};
/** A Professora da Sala de Armas mostra a Kunai na mão; o Ferreiro, a Espada Longa nas costas. */
const NPC_GEAR = {
  tutor_weapons: { hand: 'kunai', back: null, scroll: null },
  shop_weapons: { hand: null, back: 'katana', scroll: null },
  shop_scrolls: { hand: null, back: null, scroll: 'scroll_fire' },
};
const ryoText = (n) => `${Number(n || 0).toLocaleString('pt-BR')} ryō`;
const itemDef = (code) => (state.world.items || []).find((i) => i.code === code);

/** O servidor confirmou (shop_open): mostra o painel da loja. Itens montados com createElement + textContent (nada vira HTML). */
function openShop(kind, npcId) {
  const info = SHOP_INFO[kind];
  if (!info) return;
  state.shop = { kind, npcId };
  closeMissions();
  closeInventory();
  ui.shopIcon.textContent = info.icon;
  ui.shopName.textContent = info.name;
  ui.shopGreet.textContent = info.greet;
  ui.extractResult.textContent = '';
  ui.extractResult.className = 'mission-status';
  renderShopItems();
  ui.shopPanel.hidden = false;
}

/** Vitrine com preço e "Comprar" (o servidor confere a distância, o preço e o saldo). */
function renderShopItems() {
  const shop = state.shop;
  if (!shop) return;
  ui.shopRyo.textContent = `Você tem ${ryoText(state.ninja.ryo)}`;
  const forSale = (state.world.items || []).filter((i) => i.shop === shop.kind);
  ui.shopItems.replaceChildren(...forSale.map((item) => {
    const li = document.createElement('li');
    const i = document.createElement('span');
    i.className = 'ico';
    i.textContent = item.icon;
    const n = document.createElement('span');
    n.className = 'name';
    n.textContent = item.name;
    const price = document.createElement('small');
    price.className = 'price';
    const have = state.ninja.items?.[item.code] || 0;
    price.textContent = `${ryoText(item.price)}${item.damage ? ` · +${item.damage} de dano` : ''}${item.throw ? ' · de arremesso' : ''}${have ? ` · você tem ${have}` : ''}`;
    n.append(price);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-btn small';
    b.textContent = 'Comprar';
    b.disabled = (state.ninja.ryo || 0) < item.price;
    b.addEventListener('click', () => {
      if (!tapGuard(`buy:${item.code}`)) return;
      send({ type: 'buy', item: item.code, qty: 1 });
    });
    li.append(i, n, b);
    return li;
  }));
  ui.shopNote.textContent = shop.kind === 'clothes' ? 'Roupas chegam numa próxima versão.' : forSale.length ? '' : 'Nada à venda agora.';
  ui.extractBox.hidden = shop.kind !== 'scrolls';
  if (shop.kind === 'scrolls') renderExtraction();
}

// ---- Extração (gacha): o cliente escolhe classe e nível; o SORTEIO é do servidor.
const extractChoice = { cls: null, level: 1 };
function renderExtraction() {
  const owned = [state.ninja.classes?.primary, state.ninja.classes?.secondary].filter(Boolean);
  if (!owned.includes(extractChoice.cls)) extractChoice.cls = owned[0] || null;
  const classes = state.world.classes || [];
  ui.extractClass.replaceChildren(...owned.map((code) => {
    const c = classes.find((x) => x.code === code);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${extractChoice.cls === code ? ' on' : ''}`;
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', extractChoice.cls === code ? 'true' : 'false');
    chip.textContent = `${c?.icon || ''} ${c?.name || code} (${state.ninja.items?.[`scroll_${code}`] || 0} 📜)`;
    chip.addEventListener('click', () => { extractChoice.cls = code; renderExtraction(); });
    return chip;
  }));
  ui.extractLevel.replaceChildren(...(state.world.extraction || []).map((e) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${extractChoice.level === e.level ? ' on' : ''}`;
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', extractChoice.level === e.level ? 'true' : 'false');
    chip.textContent = `Nv ${e.level}`;
    chip.addEventListener('click', () => { extractChoice.level = e.level; renderExtraction(); });
    return chip;
  }));
  const rule = (state.world.extraction || []).find((e) => e.level === extractChoice.level);
  const have = extractChoice.cls ? state.ninja.items?.[`scroll_${extractChoice.cls}`] || 0 : 0;
  if (!owned.length) {
    ui.extractInfo.textContent = 'Você ainda não tem classe. Faça a Missão de Genin com o Diretor da Academia (nível 11).';
  } else if (rule) {
    ui.extractInfo.textContent = `Custa ${rule.scrolls} ${rule.scrolls === 1 ? 'pergaminho' : 'pergaminhos'} · chance de ${Math.round(rule.chance * 100)}% · jutsu do Tier ${rule.level}. Você tem ${have}.`;
  }
  ui.extractGo.disabled = !owned.length || !rule || have < rule.scrolls;
}
ui.extractGo.addEventListener('click', () => {
  if (!extractChoice.cls || !tapGuard('extract')) return;
  ui.extractGo.disabled = true;
  ui.extractResult.textContent = 'Extraindo…';
  ui.extractResult.className = 'mission-status';
  send({ type: 'extract', class: extractChoice.cls, level: extractChoice.level });
});
function showExtractResult(r) {
  const text = r.outcome === 'success' ? `✨ Sucesso! Você aprendeu ${skillName(r.jutsu)}. Coloque no kit (📊 → Kits).`
    : r.outcome === 'failed' ? `💨 Falhou… ${r.consumed} ${r.consumed === 1 ? 'pergaminho se foi' : 'pergaminhos se foram'}.`
      : r.outcome === 'no_scrolls' ? 'Pergaminhos insuficientes para esse nível.'
        : 'Você já aprendeu todos os jutsus desse nível.';
  ui.extractResult.textContent = text;
  ui.extractResult.className = `mission-status ${r.outcome === 'success' ? 'good' : 'bad'}`;
  if (r.outcome === 'success') {
    showToast(text, 4500);
    pulse(ui.statusToggle);
  }
  renderExtraction();
}

function closeShop() {
  if (!state.shop && ui.shopPanel.hidden) return;
  state.shop = null;
  ui.shopPanel.hidden = true;
}
ui.shopClose.addEventListener('click', closeShop);

// ------------------------------------------------------------------ inventário (🎒)

function renderInventory() {
  const n = state.ninja;
  ui.invBadge.textContent = ryoText(n.ryo);
  ui.invToggle.setAttribute('aria-label', `Inventário: ${ryoText(n.ryo)}`);
  ui.invRyo.textContent = ryoText(n.ryo);
  const cls = (code) => state.world.classes?.find((c) => c.code === code);
  const p = cls(n.classes?.primary), s2 = cls(n.classes?.secondary);
  ui.invClass.textContent = p ? `Classe: ${p.icon} ${p.name}${s2 ? ` · ${s2.icon} ${s2.name}` : ''}` : 'Sem classe (Missão de Genin no nível 11)';
  const entries = Object.entries(n.items || {}).filter(([, q]) => q > 0);
  ui.invEmpty.hidden = entries.length > 0;
  ui.invItems.replaceChildren(...entries.map(([code, qty]) => {
    const def = itemDef(code);
    const li = document.createElement('li');
    if (n.equipped === code) li.className = 'equipped';
    const i = document.createElement('span');
    i.className = 'ico';
    i.textContent = def?.icon || '📦';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = def?.name || code;
    const sub = document.createElement('small');
    sub.className = 'qty';
    sub.textContent = def?.kind === 'weapon' ? ` · +${def.damage} de dano · ${weaponWhere(def)}` : ` · ×${qty}`;
    name.append(sub);
    li.append(i, name);
    if (def?.kind === 'weapon') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon-btn small';
      const on = n.equipped === code;
      b.textContent = on ? 'Guardar' : 'Equipar';
      // Só PEDE: a arma equipada muda quando o servidor confirma (inventory).
      b.addEventListener('click', () => send({ type: 'equip', item: on ? null : code }));
      li.append(b);
    } else if (def?.kind === 'scroll') {
      // Pergaminho de jutsu: dá para levar nas costas (só visual; o boneco muda para todos).
      if (n.equippedScroll === code) li.classList.add('equipped');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon-btn small';
      const on = n.equippedScroll === code;
      b.textContent = on ? 'Tirar' : 'Nas costas';
      b.addEventListener('click', () => send({ type: 'equip', item: on ? null : code, slot: 'scroll' }));
      li.append(b);
    }
    return li;
  }));
}
function openInventory() {
  closeSettings();
  closeStatus();
  closeMissions();
  closeShop();
  closePlayerMenu();
  closeBoard();
  closeHistory();
  renderInventory();
  ui.invPanel.hidden = false;
  ui.invToggle.setAttribute('aria-expanded', 'true');
}
function closeInventory() {
  ui.invPanel.hidden = true;
  ui.invToggle.setAttribute('aria-expanded', 'false');
}
ui.invToggle.addEventListener('click', () => (ui.invPanel.hidden ? openInventory() : closeInventory()));
ui.invClose.addEventListener('click', closeInventory);

// ------------------------------------------------------------------ Diretor: classe e Hokage

let classChoice = { kind: 'primary', picked: null };
function openClassChoice(kind, classes) {
  classChoice = { kind, picked: null };
  closeShop();
  closeInventory();
  ui.classTitle.textContent = kind === 'primary' ? '🎓 Missão de Genin' : '🎖️ Classe Secundária';
  ui.classDesc.textContent = 'Toque numa classe para ver o que ela faz.';
  ui.classConfirm.disabled = true;
  ui.classGrid.replaceChildren(...classes.map((code) => {
    const c = state.world.classes?.find((x) => x.code === code) || { code, name: code, icon: '?', desc: '' };
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', 'false');
    const ico = document.createElement('span');
    ico.className = 'ico';
    ico.textContent = c.icon;
    const name = document.createElement('span');
    name.textContent = c.name;
    chip.append(ico, name);
    chip.addEventListener('click', () => {
      classChoice.picked = code;
      for (const other of ui.classGrid.children) {
        other.classList.toggle('on', other === chip);
        other.setAttribute('aria-checked', other === chip ? 'true' : 'false');
      }
      ui.classDesc.textContent = `${c.icon} ${c.name}: ${c.desc}`;
      ui.classConfirm.disabled = false;
      ui.classConfirm.textContent = `Escolher ${c.name}`;
    });
    return chip;
  }));
  ui.classPanel.hidden = false;
}
function closeClassChoice() { ui.classPanel.hidden = true; }
ui.classClose.addEventListener('click', closeClassChoice);
ui.classConfirm.addEventListener('click', () => {
  if (!classChoice.picked || !tapGuard('class')) return;
  ui.classConfirm.disabled = true;
  send({ type: 'choose_class', class: classChoice.picked });   // o servidor (e o banco) decidem
});

function openHokage() { ui.hokagePanel.hidden = false; }
function closeHokage() { ui.hokagePanel.hidden = true; }
ui.hokageClose.addEventListener('click', closeHokage);
ui.hokageApply.addEventListener('click', () => {
  if (!tapGuard('hokage')) return;
  send({ type: 'hokage_apply' });
  state.ninja.hokageCandidate = true;   // só esconde o botão; quem registra é o servidor
  closeHokage();
});

// ------------------------------------------------------------------ tutorial da Academia

/**
 * As 4 etapas da Academia (o SERVIDOR confere tudo e leva o jogador de uma sala para a outra; o
 * cliente não diz que concluiu nada). Etapas 1 e 2: os botões de jutsu ficam ocultos (e o servidor
 * recusa jutsu com TUTORIAL_LOCKED); na 1, o 🧘 também.
 */
const TUTORIAL_STEPS = [
  ['Etapa 1/4 · Sala de Taijutsu', 'Destrua 3 bonecos de treino usando só o 🗡️ Ataque Básico. Chegue perto: é corpo a corpo.'],
  ['Etapa 2/4 · Sala de Controle', 'Um campo drena o seu chakra! Fique parado e toque em 🧘 Meditar até a barra azul encher.'],
  ['Etapa 3/4 · Sala de Jutsus', 'Você aprendeu 💨 Teleporte Curto e 🪵 Substituição. Salte o vão com o Teleporte e use a Substituição contra a armadilha.'],
  ['Etapa 4/4 · Sala de Armas', 'Abra a mochila 🎒, equipe a Kunai de Treino e acerte o boneco com o 🗡️ Ataque Básico.'],
];
function renderTutorial() {
  const step = state.ninja.tutorialStep ?? 4;
  const inAcademy = state.mapId === 'academy_interior';
  // Interface guiada: jutsus só a partir da etapa 3; meditar a partir da 2; a mochila brilha na 4.
  document.body.classList.toggle('tut-no-skills', step < 2);
  document.body.classList.toggle('tut-no-meditate', step < 1);
  document.body.classList.toggle('tut-bag', step === 3 && !state.ninja.equipped);
  ui.tutorialCard.hidden = !inAcademy;
  document.body.classList.toggle('tutorial', inAcademy);
  if (!inAcademy) return;
  const done = step >= 4;
  ui.tutorialCard.classList.toggle('done', done);
  if (done) {
    ui.tutorialTitle.textContent = 'Academia · Tutorial concluído';
    ui.tutorialText.textContent = 'A saída fica embaixo, nesta sala. No nível 11, fale com o Diretor para a Missão de Genin.';
  } else {
    const [title, text] = TUTORIAL_STEPS[step];
    ui.tutorialTitle.textContent = `Academia · ${title}`;
    ui.tutorialText.textContent = step === 3 && state.ninja.equipped
      ? 'Kunai equipada! Agora acerte o boneco com o 🗡️ Ataque Básico.' : text;
  }
}

/** Tudo da progressão de uma vez (welcome). */
function renderNinja() {
  renderInventory();
  renderTutorial();
  closeClassChoice();
  closeHokage();
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

/** Ícone e cor de cada MECÂNICA (só visual); o nome do jutsu vem do catálogo do servidor. */
const SKILL_UI = {
  fire: { icon: '🔥', color: '#e8572f' },
  water: { icon: '💧', color: '#3c9be0' },
  taijutsu: { icon: '👊', color: '#d9a441' },
  illusion: { icon: '🌀', color: '#9a6be0' },
  shadow: { icon: '🌑', color: '#4a3f63' },
  stone: { icon: '⛰', color: '#8a6a45' },
  heal: { icon: '✚', color: '#4fbf6a' },
  weapons: { icon: '🗡️', color: '#8a96a3' },
  lightning: { icon: '⚡', color: '#d9c22e' },
  teleport: { icon: '💨', color: '#6fa8d6' },
  substitution: { icon: '🪵', color: '#a0703a' },
};
/** Ícone + nome + tier de um jutsu. Tier 2 a 4: algarismo romano depois do nome. */
const TIER_MARK = ['', '', ' II', ' III', ' IV'];
function skillInfo(skill) {
  const w = state.world.skills?.[skill];
  const ui = SKILL_UI[w?.mechanic || skill];
  if (!w || !ui) return null;
  return { ...ui, name: w.name, tier: w.tier, mark: TIER_MARK[w.tier] || '' };
}

/** Onde a arma fica e como ela ataca (Shuriken Gigante: arremesso, alcance e recarga bem lenta). */
function weaponWhere(def) {
  if (def.throw) return `de arremesso: atravessa todos até ${def.throw.range} casas, recarga ${def.throw.cooldownFactor}x mais lenta`;
  return def.hold === 'back' ? 'nas costas' : 'na mão';
}

/** skill (ou "attack") -> { until, ms }: quando a recarga acaba. Começa quando o SERVIDOR confirma. */
const cooldowns = {};

/** Jogador virou para atacar/lançar (a direção vem do servidor, na mensagem do golpe). */
function faceTo(playerId, fx, fy) {
  const p = state.players.get(playerId);
  if (p && (fx || fy)) p.dir = dirFrom(fx, fy);
}

function startCooldown(skill, serverMs) {
  // Ataque: a recarga já vem com a Agilidade (o servidor calcula, em progress.derived).
  // Substituição: a recarga cai com o nível do jutsu (30 / 25 / 20 / 15 s), igual ao servidor.
  const uses = state.ninja.jutsus?.[skill] ?? 0;
  const level = jutsuLevelOf(uses);
  // (O servidor manda a recarga do ataque na mensagem: a Shuriken Gigante é 5x mais lenta.)
  const ms = serverMs ?? (skill === 'attack'
    ? (state.progress?.derived?.attackCooldownMs ?? state.world.basicAttack?.cooldownMs ?? 600)
    : skill === 'substitution' ? (35 - 5 * level) * 1000
      : (state.world.skills?.[skill]?.cooldownMs ?? 600));
  cooldowns[skill] = { until: performance.now() + ms, ms };
}

/** As 4 habilidades do kit ATIVO nos botões em volta do ataque (o kit vem do servidor). */
function renderKit() {
  const list = state.kit.kits[state.kit.active] || [];
  ui.slots.forEach((button, i) => {
    const skill = list[i] || '';
    button.dataset.skill = skill;
    const info = skillInfo(skill);
    button.querySelector('.ico').textContent = info ? info.icon : '';
    button.dataset.tier = info && info.tier > 1 ? String(info.tier) : '';
    const cost = state.world.skills?.[skill]?.cost;
    button.querySelector('.cost').textContent = cost !== undefined ? String(cost) : '';
    button.style.setProperty('--c', info ? info.color : 'transparent');
    button.classList.toggle('empty', !info);
    button.disabled = !info;
    button.setAttribute('aria-label', info ? `${info.name}${info.mark} (${cost} de chakra) — tecla ${i + 1}` : `Espaço ${i + 1} vazio (monte na ficha 📊 → Kits)`);
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
  const mech = mechanicOf(skill);
  if (!SKILLS[mech] || !state.connected || state.me.dead || !tapGuard(skill)) return;
  if (mech === 'teleport') {
    // Teleporte Curto: para onde o joystick aponta (ou para onde o boneco olha). O ALCANCE é do servidor.
    const me = state.players.get(state.meId);
    const d = dir.x || dir.y ? [quantize(dir.x), quantize(dir.y)] : DIR_VECTOR[me?.dir ?? 0];
    return send({ type: 'cast', skill, dir: d });
  }
  // Jutsu direcionado: com alvo focado, vai o targetId (o servidor mira e confere o alcance).
  // Substituição Nível 4: aparece atrás do alvo focado (o servidor confere o nível).
  const targetId = (DIRECTED.has(mech) || mech === 'substitution') && state.focusId ? state.focusId : undefined;
  send(targetId ? { type: 'cast', skill, targetId } : { type: 'cast', skill });
}
/** Direção do boneco (0 baixo, 1 esquerda, 2 direita, 3 cima) -> vetor. */
const DIR_VECTOR = [[0, 1], [-1, 0], [1, 0], [0, -1]];
/** Nível do jutsu pelo uso (a MESMA tabela do servidor, que vem no welcome). */
function jutsuLevelOf(uses) {
  const t = state.world.jutsuLevelUses || [0, 100, 500, 2000];
  let level = 1;
  for (let i = 1; i < t.length; i++) if (uses >= t[i]) level = i + 1;
  return level;
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

/** Número com vírgula e no máximo 1 casa (só formatação: o valor vem pronto do servidor). */
const num = (n) => String(Math.round(Number(n || 0) * 10) / 10).replace('.', ',');
/** Quanto o PRÓXIMO ponto rende (progress.nextGain, calculado pelo servidor com o soft cap). */
const ATTR_EFFECT = {
  vitality: (g) => `próximo ponto: +${num(g)} vida`,
  chakra: (g) => `próximo ponto: +${num(g)} chakra (e meditação mais rápida)`,
  agility: (g) => `próximo ponto: +${num(g)} velocidade`,
  taijutsu: (g) => `próximo ponto: +${num(g * 100)}% Ataque Básico`,
  ninjutsu: (g) => `próximo ponto: +${num(g * 100)}% jutsus`,
  weapons: (g) => `próximo ponto: +${num(g * 100)}% armas`,
};
/** O que o atributo dá hoje (números do SERVIDOR, em progress.derived). */
const ATTR_NOW = {
  vitality: (d) => `vida ${d.maxHp}`,
  chakra: (d) => `chakra ${d.maxChakra} · ${num(d.meditationChakraPerSec)}/s meditando`,
  agility: (d) => `${String(d.walkSpeed).replace('.', ',')} / ${String(d.runSpeed).replace('.', ',')}`,
  taijutsu: (d) => `×${String(d.physicalMultiplier).replace('.', ',')}`,
  ninjutsu: (d) => `×${String(d.jutsuMultiplier).replace('.', ',')}`,
  weapons: (d) => `×${String(d.weaponMultiplier ?? 1).replace('.', ',')}`,
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
  // Sem teto de pontos (v8): o ganho de cada ponto cai aos poucos (soft cap do servidor).
  for (const li of ui.attrRows) {
    const key = li.dataset.attr;
    if (!ATTR_EFFECT[key]) continue;
    const val = pr.attributes[key] ?? 0;
    li.querySelector('.attr-val').textContent = String(val);
    li.querySelector('.attr-eff').textContent = `${ATTR_EFFECT[key](pr.nextGain?.[key] ?? 0)} · agora ${ATTR_NOW[key](pr.derived)}`;
    li.querySelector('.plus').disabled = pr.statPoints <= 0;
  }
  renderResetButton();
  if (!draftKits || ui.statusPanel.hidden) draftKits = { A: [...state.kit.kits.A], B: [...state.kit.kits.B] };
  renderKitList();
  renderDraftKits();
  renderJutsus();
}

/**
 * "Redefinir Atributos": custa ryō (o custo vem do servidor em progress.resetCost) e pede dois
 * toques (o 1º arma por 3 s, o 2º confirma). O servidor e o banco conferem saldo e pontos.
 */
let resetArmedUntil = 0;
function renderResetButton() {
  const pr = state.progress;
  if (!pr) return;
  const cost = pr.resetCost ?? 500;
  const spent = Object.values(pr.attributes || {}).reduce((sum, n) => sum + n, 0);
  const armed = performance.now() < resetArmedUntil;
  ui.resetAttrs.textContent = armed ? `Toque de novo: redefinir por ${ryoText(cost)}` : `↺ Redefinir Atributos (${ryoText(cost)})`;
  ui.resetAttrs.classList.toggle('armed', armed);
  ui.resetAttrs.disabled = spent === 0 || (state.ninja.ryo || 0) < cost;
  ui.resetAttrs.title = spent === 0 ? 'Nenhum ponto investido' : (state.ninja.ryo || 0) < cost ? `Precisa de ${ryoText(cost)}` : '';
}
ui.resetAttrs.addEventListener('click', () => {
  if (ui.resetAttrs.disabled) return;
  const t = performance.now();
  if (t >= resetArmedUntil) {
    resetArmedUntil = t + 3000;
    renderResetButton();
    setTimeout(renderResetButton, 3100);
    return;
  }
  resetArmedUntil = 0;
  renderResetButton();
  if (tapGuard('reset')) send({ type: 'reset_attributes' });
});

/** Jutsus aprendidos, na ordem do catálogo (Academia primeiro, depois por classe e tier). */
function learnedJutsus() {
  const known = state.ninja.jutsus || {};
  return Object.keys(state.world.skills || {}).filter((code) => code in known);
}

/** Aba Kits: uma linha por jutsu APRENDIDO, com os botões A e B. Montada com createElement (nada vira HTML). */
let kitListKey = '';
function renderKitList() {
  const list = learnedJutsus();
  const key = list.join(',');
  if (key === kitListKey) return;
  kitListKey = key;
  ui.kitList.replaceChildren(...list.map((skill) => {
    const info = skillInfo(skill);
    const li = document.createElement('li');
    li.dataset.skill = skill;
    const label = document.createElement('span');
    label.textContent = `${info ? info.icon : '•'} ${info ? info.name : skill}`;
    if (info && info.tier > 0) {
      const small = document.createElement('small');
      small.textContent = `T${info.tier}`;
      label.append(small);
    }
    li.append(label);
    for (const kit of ['A', 'B']) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.kit = kit;
      chip.textContent = kit;
      chip.addEventListener('click', () => {
        const kitSkills = draftKits[kit];
        const i = kitSkills.indexOf(skill);
        if (i >= 0) kitSkills.splice(i, 1);
        else if (kitSkills.length < 4) kitSkills.push(skill);
        renderDraftKits();
      });
      li.append(chip);
    }
    return li;
  }));
}

function renderDraftKits() {
  if (!draftKits) return;
  for (const li of ui.kitList.children) {
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

/** Aba Jutsus: nível pelo USO e a barra até o próximo nível (números do servidor). */
function renderJutsus() {
  if (ui.statusPanel.hidden) return;
  const table = state.world.jutsuLevelUses || [0, 100, 500, 2000];
  ui.jutsuList.replaceChildren(...learnedJutsus().map((skill) => {
    const info = skillInfo(skill);
    const uses = state.ninja.jutsus[skill] || 0;
    const level = jutsuLevelOf(uses);
    const next = table[level];
    const li = document.createElement('li');
    const ico = document.createElement('span');
    ico.className = 'ico';
    ico.textContent = info ? info.icon : '•';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = info ? info.name : skill;
    const cls = state.world.skills[skill]?.class;
    const small = document.createElement('small');
    small.textContent = cls ? `${state.world.classes?.find((c) => c.code === cls)?.name || cls} · Tier ${info?.tier ?? 1}` : 'Academia';
    name.append(small);
    const lvl = document.createElement('b');
    lvl.className = 'lvl';
    lvl.textContent = `Nv ${level}`;
    const bar = document.createElement('div');
    bar.className = 'use';
    const fill = document.createElement('span');
    const prev = table[level - 1] || 0;
    fill.style.transform = `scaleX(${next ? Math.min(1, (uses - prev) / (next - prev)) : 1})`;
    const txt = document.createElement('b');
    txt.textContent = next ? `${uses} / ${next} usos` : `${uses} usos · nível máximo`;
    bar.append(fill, txt);
    li.append(ico, name, lvl, bar);
    return li;
  }));
}

function openStatus() {
  closeSettings();
  closeInventory();
  closeMissions();
  closePlayerMenu();
  closeBoard();
  closeHistory();
  draftKits = null;
  ui.statusPanel.hidden = false;
  ui.statusToggle.setAttribute('aria-expanded', 'true');
  renderStatus();
}
function closeStatus() {
  ui.statusPanel.hidden = true;
  ui.statusToggle.setAttribute('aria-expanded', 'false');
}
function showTab(which) {
  const tabs = { attrs: [ui.tabAttrs, ui.paneAttrs], jutsus: [ui.tabJutsus, ui.paneJutsus], kits: [ui.tabKits, ui.paneKits] };
  for (const [name, [tab, pane]] of Object.entries(tabs)) {
    pane.hidden = name !== which;
    tab.classList.toggle('active', name === which);
    tab.setAttribute('aria-selected', name === which ? 'true' : 'false');
  }
  if (which === 'jutsus') renderJutsus();
}
ui.statusToggle.addEventListener('click', () => (ui.statusPanel.hidden ? openStatus() : closeStatus()));
ui.statusClose.addEventListener('click', closeStatus);
ui.tabAttrs.addEventListener('click', () => showTab('attrs'));
ui.tabJutsus.addEventListener('click', () => showTab('jutsus'));
ui.tabKits.addEventListener('click', () => showTab('kits'));
for (const li of ui.attrRows) {
  // "+": só pede. Ponto, atributo e vida nova só mudam quando o servidor responde ("progress").
  li.querySelector('.plus').addEventListener('click', () => send({ type: 'spend_point', attribute: li.dataset.attr }));
}
ui.kitSave.addEventListener('click', () => send({ type: 'set_loadout', kitA: draftKits.A, kitB: draftKits.B }));

// ------------------------------------------------------------------ outro jogador: menu e missão de sensei

let menuPlayerId = null;
let menuChoice = { quantity: 3, difficulty: 'BASIC' };

function openPlayerMenu(p) {
  closeMissions();
  closeInventory();
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

let creatorLook = { ...DEFAULT_APPEARANCE };
let creatorDir = 0;
let creatorFirst = false;
let creatorTimer = null;

/** Escolhas do Criador, na ordem da tela: [campo, título, tipo] (seg = botões; swatch = amostras de cor). */
const CREATOR_FIELDS = [
  ['gender', 'Gênero', 'seg'], ['skin', 'Pele', 'swatch'], ['hairStyle', 'Cabelo', 'seg'], ['hairColor', 'Cor do cabelo', 'swatch'],
  ['eyeStyle', 'Olhos', 'seg'], ['eyeColor', 'Cor dos olhos', 'swatch'], ['village', 'Vila', 'seg'], ['outfit', 'Roupa', 'seg'],
  ['shirtColor', 'Camisa', 'swatch'], ['pantsColor', 'Calça', 'swatch'], ['bandana', 'Bandana da vila', 'seg'],
];
const CREATOR_LABEL = {
  m: 'Masculino', f: 'Feminino', espetado: 'Espetado', longo_lateral: 'Longo', masculino: 'Sem cílios', cilios: 'Com cílios',
  basica: 'Camisa e calça', vila: 'Conjunto da vila', true: 'Com bandana', false: 'Sem',
};
const creatorLabel = (field, v) => (field === 'village' ? `Vila ${String(v).split('_')[1]}` : CREATOR_LABEL[String(v)] || String(v).replace(/_/g, ' '));

function openCreator(first = false) {
  creatorFirst = first;
  creatorLook = { ...(state.me.look || DEFAULT_APPEARANCE) };
  creatorDir = 0;
  renderCreatorOptions();
  ui.creatorCancel.hidden = first;           // na 1ª vez é obrigatório escolher
  ui.creatorSave.textContent = first ? 'Começar a jogar' : 'Salvar visual';
  ui.creatorError.textContent = '';
  ui.creator.hidden = false;
  closeSettings();
  clearInterval(creatorTimer);
  let phase = 0;
  creatorTimer = setInterval(() => { phase += 1.2; drawCreatorPreview(phase); }, 60);   // prévia andando
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
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#8d8a84';
  g.fillRect(0, c.height - 16, c.width, 16);
  const [view, flip] = viewOf(creatorDir);
  const { anim, frame } = pickFrame({ moving: true, walk: phase }, 0);
  // Canvas 128x192 = a célula 64x96 em escala 2 (pixel art sem borrar). Sem os atlas: o boneco antigo.
  if (drawCell(g, 0, 0, 2, creatorLook, view, flip, anim, frame) == null) {
    drawCharacter(g, c.width / 2, c.height - 70, 128, fallbackColors(creatorLook), creatorDir, phase, true);
  }
}
function setCreator(field, value) {
  creatorLook = { ...creatorLook, [field]: value };
  // Trocar o gênero já sugere os olhos e o cabelo (dá para mudar depois).
  if (field === 'gender') {
    creatorLook.eyeStyle = value === 'f' ? 'cilios' : 'masculino';
    creatorLook.hairStyle = value === 'f' ? 'longo_lateral' : 'espetado';
  }
  renderCreatorOptions();
}
function renderCreatorOptions() {
  ui.creatorOptions.replaceChildren(...CREATOR_FIELDS.map(([field, title, kind]) => {
    const row = document.createElement('div');
    row.className = 'opt-row';
    // Camisa e calça só valem com "Camisa e calça" (o conjunto da vila tem as cores da vila).
    row.hidden = (field === 'shirtColor' || field === 'pantsColor') && creatorLook.outfit === 'vila';
    const name = document.createElement('span');
    name.className = 'opt-title';
    name.textContent = title;
    const box = document.createElement('div');
    box.className = kind === 'seg' ? 'seg' : 'swatches';
    for (const value of OPTIONS[field]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = kind === 'seg' ? 'seg-btn' : 'swatch';
      b.setAttribute('aria-pressed', String(creatorLook[field] === value));
      if (kind === 'swatch') {
        b.style.background = swatchOf(field, value);
        b.title = creatorLabel(field, value);
        b.setAttribute('aria-label', `${title}: ${creatorLabel(field, value)}`);
      } else {
        b.textContent = creatorLabel(field, value);
        if (field === 'village') b.style.borderBottomColor = swatchOf('village', value);
      }
      b.addEventListener('click', () => setCreator(field, value));
      box.append(b);
    }
    row.append(name, box);
    return row;
  }));
}
loadSprites();   // atlas do personagem (2 PNGs pequenos); até chegarem, o jogo desenha o boneco antigo
loadVfx();       // folhas dos efeitos dos golpes (assets/vfx); até chegarem, os efeitos desenhados à mão
loadWeapons();   // armas em pixel art (assets/weapons); até chegarem, as armas de retângulos
ui.creatorTurn.addEventListener('click', () => { creatorDir = [0, 1, 3, 2][(([0, 1, 3, 2].indexOf(creatorDir)) + 1) % 4]; });
ui.creatorRandom.addEventListener('click', () => {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const gender = pick(OPTIONS.gender);
  creatorLook = { v: 2 };
  for (const field of Object.keys(OPTIONS)) creatorLook[field] = pick(OPTIONS[field]);
  creatorLook.gender = gender;
  creatorLook.eyeStyle = gender === 'f' ? 'cilios' : 'masculino';
  if (Math.random() < 0.75) creatorLook.hairStyle = gender === 'f' ? 'longo_lateral' : 'espetado';
  renderCreatorOptions();
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

// ---- canais e histórico (v8). Local: o mapa. "/g texto": global. "/w Nome texto": sussurro.

/** Quem falou, com o canal: "[Global] kaito", "kaito → mei" (sussurro). */
function chatWho(e) {
  if (e.channel === 'global') return `[Global] ${e.username}`;
  if (e.channel === 'whisper') return e.playerId === state.meId ? `Você → ${e.to || '?'}` : `${e.username} → você`;
  return e.username;
}

/** Mensagem nova também vai para o histórico (o servidor já guardou a mesma no banco). */
function rememberChat(e) {
  state.chatHistory.push(e);
  if (state.chatHistory.length > 100) state.chatHistory.splice(0, state.chatHistory.length - 100);
  if (!ui.historyPanel.hidden) renderHistory();
}

let historyFilter = 'all';
function renderHistory() {
  if (ui.historyPanel.hidden) return;
  const list = state.chatHistory.filter((e) => historyFilter === 'all' || e.channel === historyFilter);
  ui.historyEmpty.hidden = list.length > 0;
  ui.historyList.replaceChildren(...list.map((e) => {
    const li = document.createElement('li');
    li.className = `${e.channel}${e.playerId === state.meId ? ' me' : ''}`;
    const time = document.createElement('time');
    const d = new Date(e.at);
    time.textContent = Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${chatWho(e)}: `;                 // textContent: texto nunca vira HTML
    li.append(time, who, document.createTextNode(e.message));
    return li;
  }));
  ui.historyList.scrollTop = ui.historyList.scrollHeight;
}
function openHistory() {
  closeSettings();
  closeMissions();
  closeInventory();
  closeStatus();
  closeBoard();
  ui.historyPanel.hidden = false;
  ui.historyToggle.setAttribute('aria-expanded', 'true');
  renderHistory();
  if (state.connected) send({ type: 'chat_history' });   // relê do servidor (no máximo 1 a cada 2 s)
}
function closeHistory() {
  ui.historyPanel.hidden = true;
  ui.historyToggle.setAttribute('aria-expanded', 'false');
}
ui.historyToggle.addEventListener('click', () => (ui.historyPanel.hidden ? openHistory() : closeHistory()));
ui.historyClose.addEventListener('click', closeHistory);
for (const tab of ui.historyTabs) {
  tab.addEventListener('click', () => {
    historyFilter = tab.dataset.filter;
    for (const t of ui.historyTabs) {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
    }
    renderHistory();
  });
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

/** Grama escura da Floresta (mais fechada que os gramados da Vila). */
function darkGrassTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#2f6b28';
    g.fillRect(0, 0, PIX, PIX);
    for (let i = 0; i < 28; i++) {
      g.fillStyle = r() < 0.5 ? '#285f22' : '#3a7d31';
      g.fillRect(Math.floor(r() * PIX), Math.floor(r() * PIX), 1, 1);
    }
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(r() * (PIX - 2)), y = Math.floor(r() * (PIX - 3)) + 2;
      g.fillStyle = '#21521c';
      g.fillRect(x, y, 1, 2);
      g.fillRect(x + 2, y, 1, 2);
      g.fillStyle = '#4a8f3d';
      g.fillRect(x + 1, y - 1, 1, 3);
    }
  });
}

/** Assoalho de madeira: tábuas na horizontal, emendas desencontradas e veios. */
function woodTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#9a6a3a';
    g.fillRect(0, 0, PIX, PIX);
    for (let y = 0; y < PIX; y += 4) {
      g.fillStyle = '#7a4f28';
      g.fillRect(0, y + 3, PIX, 1);                                   // junta das tábuas
      g.fillRect((y / 4) % 2 ? 5 : 11, y, 1, 3);                       // emenda
      g.fillStyle = r() < 0.5 ? '#a8763f' : '#8d6034';
      g.fillRect(Math.floor(r() * 10), y + 1, 4 + Math.floor(r() * 4), 1);   // veio
    }
  });
}

/** Calçamento claro (ruas e praça da Vila): blocos cinza-claro com juntas. */
function lightStoneTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#a7a39a';
    g.fillRect(0, 0, PIX, PIX);
    const blocks = seed % 2 ? [[0, 0, 8, 7], [8, 0, 8, 7], [0, 8, 5, 8], [5, 8, 11, 8]] : [[0, 0, 6, 8], [6, 0, 10, 8], [0, 8, 9, 8], [9, 8, 7, 8]];
    for (const [x, y, w, h] of blocks) {
      g.fillStyle = r() < 0.5 ? '#cfcbc1' : '#c4c0b6';
      g.fillRect(x, y, w - 1, h - 1);
      g.fillStyle = '#dbd7cd';
      g.fillRect(x, y, w - 1, 1);
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle = r() < 0.5 ? '#b8b4aa' : '#d8d4ca';
      g.fillRect(Math.floor(r() * PIX), Math.floor(r() * PIX), 1, 1);
    }
  });
}

/** Areia do campo de treino. */
function sandTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#e2cd96';
    g.fillRect(0, 0, PIX, PIX);
    for (let i = 0; i < 22; i++) {
      g.fillStyle = r() < 0.5 ? '#d3bb80' : '#eedcab';
      g.fillRect(Math.floor(r() * PIX), Math.floor(r() * PIX), 1, 1);
    }
  });
}

/** Ponte de madeira: tábuas atravessadas e corrimão nas pontas. */
function bridgeTile() {
  return makeTile((g) => {
    g.fillStyle = '#8b5a2b';
    g.fillRect(0, 0, PIX, PIX);
    g.fillStyle = '#5d3a1a';
    for (let x = 3; x < PIX; x += 4) g.fillRect(x, 0, 1, PIX);
    g.fillStyle = '#a8713a';
    for (let x = 0; x < PIX; x += 4) g.fillRect(x, 0, 1, PIX);
  });
}

/** Rio azul (mais claro que a água de fora do mundo), com reflexos. */
function riverTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#3a78c4';
    g.fillRect(0, 0, PIX, PIX);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = r() < 0.5 ? '#5a96de' : '#2f66a9';
      g.fillRect(Math.floor(r() * (PIX - 4)), Math.floor(r() * PIX), 3 + Math.floor(r() * 3), 1);
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
  stone: [lightStoneTile(21), lightStoneTile(22), lightStoneTile(23)],   // ruas e praça: pedra cinza clara
  sand: [sandTile(41), sandTile(42)],
  bridge: [bridgeTile(51)],
  river: [riverTile(61), riverTile(62)],
  path: [pathTile(7), pathTile(8)],
  water: [waterTile(11), waterTile(12)],
  canopy: [canopyTile(31), canopyTile(32), canopyTile(33)],
  darkGrass: [darkGrassTile(71), darkGrassTile(72), darkGrassTile(73), darkGrassTile(74)],   // Floresta
  wood: [woodTile(81), woodTile(82)],                                                       // assoalho das lojas
  black: [makeTile((g) => { g.fillStyle = '#100c09'; g.fillRect(0, 0, PIX, PIX); })],         // fora da sala
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
    case 'stone': return TILES.stone[h % 3];                       // Vila: calçamento de pedra cinza clara
    case 'path': return TILES.path[h & 1];                         // estradas de terra
    case 'sand': return TILES.sand[h & 1];                         // campo de treino
    case 'water': return TILES.river[h & 1];                       // rio e canais
    case 'bridge': return TILES.bridge[0];                         // pontes
    case 'darkgrass': return TILES.darkGrass[h % 31 === 0 ? 3 : h % 3];   // Floresta: grama escura
    case 'wood': return TILES.wood[h & 1];                         // assoalho das lojas
    case 'grass': return TILES.grass[h % 23 === 0 ? 3 : h % 3];    // Floresta
    default: return state.maps[state.mapId]?.kind === 'interior' ? TILES.black[0] : TILES.canopy[h % 3];   // fora: escuro (sala) ou mata
  }
}

// Chão em BLOCOS de 16x16 casas, desenhados uma vez na resolução da pixel art (256x256 px)
// e guardados. Cada quadro desenha só ~4 a 9 imagens em vez de ~300 casas.
const CHUNK = 16;
const CHUNK_CACHE_MAX = 64;          // ~64 x 256 KB = 16 MB no máximo
const chunkCache = new Map();        // "mapa:cx,cy" -> canvas (ordem de uso = LRU; voltar a um mapa é instantâneo)

/**
 * No máximo 2 blocos novos por quadro: entrar num mapa grande não trava o celular (os blocos
 * que faltam aparecem nos quadros seguintes, por baixo do "piscar" da troca de mapa), e com
 * folga o jogo já monta os vizinhos da tela antes de o jogador chegar lá.
 */
const CHUNK_BUILDS_PER_FRAME = 2;
let chunkBuilds = 0;

function chunkCanvas(cx, cy) {
  const key = `${state.mapId}:${cx},${cy}`;
  let c = chunkCache.get(key);
  if (c) {
    chunkCache.delete(key);          // marca como usado agora
    chunkCache.set(key, c);
    return c;
  }
  if (chunkBuilds >= CHUNK_BUILDS_PER_FRAME) return null;
  chunkBuilds += 1;
  c = document.createElement('canvas');
  c.width = c.height = CHUNK * PIX;
  const g = c.getContext('2d');
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) g.drawImage(tileAt(cx * CHUNK + tx, cy * CHUNK + ty), tx * PIX, ty * PIX);
  }
  // Enfeites no chão (bancos, rosa dos ventos, lanternas, vasos) e depois as paredes (muralha,
  // prédios, montanha, árvores, boneco), inclusive as do mapa vizinho além da borda. Cada uma
  // é desenhada só nos blocos que toca (margem de 8 px para as sombras).
  const size = CHUNK * PIX, M = 8;
  for (const d of state.deco) {
    const x = (d.x - cx * CHUNK) * PIX, y = (d.y - cy * CHUNK) * PIX, w = d.w * PIX, h = d.h * PIX;
    if (x + w < -M || y + h < -M || x > size + M || y > size + M) continue;
    drawDeco(g, d, x, y, w, h);
  }
  for (const w of state.walls) {
    const x = (w.x - cx * CHUNK) * PIX, y = (w.y - cy * CHUNK) * PIX, pw = w.w * PIX, ph = w.h * PIX;
    if (x + pw < -M || y + ph < -M || x > size + M || y > size + M) continue;
    drawWall(g, w, x, y, pw, ph, PIX);
  }
  chunkCache.set(key, c);
  if (chunkCache.size > CHUNK_CACHE_MAX) chunkCache.delete(chunkCache.keys().next().value);
  return c;
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
    // Atravessou a borda ou entrou pela porta (previsto): fade out, troca o mapa no escuro, fade in.
    if (pred.map !== state.mapId && !mapFade.to) {
      mapFade.to = pred.map;
      mapFade.outAt = now;
    }
    if (mapFade.to && now - mapFade.outAt >= FADE_OUT_MS) {
      mapFade.to = null;
      if (pred.map !== state.mapId) enterMap(pred.map, true);
    }
    if (!mapFade.to) {                    // escurecendo: o boneco espera na borda/porta do mapa antigo
      me.x = vx;
      me.y = vy;
      // Praça e lojas (zona segura): o servidor recusa combate; aqui só apaga os botões e avisa no topo.
      const safe = inSafeZone(state.maps[state.mapId], vx, vy);
      if (safe !== state.inSafeZone) {
        state.inSafeZone = safe;
        document.body.classList.toggle('safe-zone', safe);
        updateOnline();
      }
    }
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
      /** Onde o jogador está NA TELA (px), com a câmera de verdade (foco, zoom, suavização). */
      screenOf: (id) => { const p = state.players.get(id); return p && lastView ? [lastView.toScreenX(p.x), lastView.toScreenY(p.y)] : null; },
      map: () => ({ predicted: pred.map, drawn: state.mapId, server: state.serverMap }),
      fade: () => ({ alpha: mapFade.alpha, fading: !!mapFade.to }),
      npcs: () => state.npcs.map((n) => n.id),
      shop: () => (state.shop ? { ...state.shop } : null),
      /** O mapa inteiro numa imagem (16 px por casa), montado com os mesmos blocos do jogo. */
      mapPicture: () => {
        const c = document.createElement('canvas');
        c.width = state.world.width * PIX;
        c.height = state.world.height * PIX;
        const g = c.getContext('2d');
        for (let cy = 0; cy * CHUNK < state.world.height; cy++) {
          for (let cx = 0; cx * CHUNK < state.world.width; cx++) {
            chunkBuilds = 0;
            g.drawImage(chunkCanvas(cx, cy), cx * CHUNK * PIX, cy * CHUNK * PIX);
          }
        }
        for (const o of state.overhead) drawGateRoof(g, o.x * PIX, o.y * PIX, o.w * PIX, o.h * PIX);
        return c.toDataURL('image/png');
      },
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
    // Correndo: o próprio jogador sabe (botão); os outros, pela velocidade (bem acima da de andar).
    p.running = p.moving && (p.id === state.meId ? !!state.me.running : d / dt > (state.world.speed || 5) * 1.3);
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
  chunkBuilds = 0;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const c = chunkCanvas(cx, cy);
      if (c) ctx.drawImage(c, toScreenX(cx * CHUNK), toScreenY(cy * CHUNK), size, size);
      else {                           // ainda não montado: cor do chão por 1 ou 2 quadros
        ctx.fillStyle = state.maps[state.mapId]?.kind === 'village' ? '#c4c0b6' : '#4f9a3a';
        ctx.fillRect(toScreenX(cx * CHUNK), toScreenY(cy * CHUNK), size, size);
      }
    }
  }
  // Sobrou orçamento: monta já os blocos em volta da tela (andando, nada precisa ser montado na hora).
  for (let cy = cy0 - 1; cy <= cy1 + 1 && chunkBuilds < CHUNK_BUILDS_PER_FRAME; cy++) {
    for (let cx = cx0 - 1; cx <= cx1 + 1 && chunkBuilds < CHUNK_BUILDS_PER_FRAME; cx++) {
      if (!chunkCache.has(`${state.mapId}:${cx},${cy}`)) chunkCanvas(cx, cy);
    }
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

  // 3b. Portas da Academia: fechadas (tranca vermelha) até o tutorial do jogador chegar no passo delas.
  const step = state.ninja.tutorialStep ?? 4;
  for (const d of state.doors) {
    const x = toScreenX(d.x), y = toScreenY(d.y), w = d.w * T, h = d.h * T;
    if (x + w >= 0 && x <= viewW && y + h >= 0 && y <= viewH) drawAcademyDoor(ctx, x, y, w, h, step >= (d.step ?? 0), d.h > d.w, now);
  }
  for (const f of state.fields) {
    const x = toScreenX(f.x), y = toScreenY(f.y), w = f.w * T, h = f.h * T;
    if (x + w >= 0 && x <= viewW && y + h >= 0 && y <= viewH) drawChakraField(ctx, x, y, w, h, now);
  }

  // 4. Efeitos de habilidade: os "de chão" (Sombra, Água) por baixo dos bonecos, o resto por cima.
  let alive = 0;
  for (const fx of state.effects) if (SKILLS[fx.skill] && now - fx.start < SKILLS[fx.skill].ms) state.effects[alive++] = fx;
  state.effects.length = alive;
  for (const fx of state.effects) if (GROUND_FX.has(fx.skill)) drawEffect(fx, toScreenX(fx.x), toScreenY(fx.y), T, now);
  vfx.draw(ctx, 'ground', toScreenX, toScreenY, T, dpr, now);

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
  vfx.draw(ctx, 'top', toScreenX, toScreenY, T, dpr, now);

  // Por cima de todos: o telhado do portão (quem passa por baixo fica escondido por ele).
  for (const o of state.overhead) {
    const x = toScreenX(o.x), y = toScreenY(o.y), w = o.w * T, h = o.h * T;
    if (x + w >= 0 && x <= viewW && y + h >= 0 && y <= viewH) drawGateRoof(ctx, x, y, w, h);
  }

  // 6. Números flutuantes (dano, cura, XP, avisos) e falas do NPC.
  drawFloaters(toScreenX, toScreenY, T, now);
  for (const n of state.npcs) drawNpcBubble(n, toScreenX(n.x), toScreenY(n.y), T, now);

  // 7. Missão pronta e o Mestre fora da tela: seta na borda apontando para ele.
  const marker = npcMarker();
  if (me && marker && marker.strong && state.mission) {
    for (const n of state.npcs) if (n.id === 'sensei') drawOffscreenArrow(toScreenX(n.x), toScreenY(n.y), marker, now);
  }

  drawJoystick();
  drawMapChange(now);

  if (!me) {
    ctx.fillStyle = 'rgba(20, 17, 13, 0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
  }
}

/**
 * Troca de mapa: fade out (0,14 s) + fade in (0,26 s) e o nome do mapa no alto por ~2 s.
 */
function drawMapChange(now) {
  const t = now - mapFx.at;
  // fade out (escurecendo antes da troca) e fade in (clareando depois)
  const raw = mapFade.to ? (now - mapFade.outAt) / FADE_OUT_MS : t < FADE_IN_MS ? 1 - t / FADE_IN_MS : 0;
  const a = Math.max(0, Math.min(1, raw));   // o relógio do quadro pode estar uns ms atrás do da troca
  mapFade.alpha = a;
  if (a > 0) {
    ctx.fillStyle = `rgba(6, 5, 4, ${a.toFixed(3)})`;
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
    case 'fire': {                       // explosão: círculo vermelho do tamanho da área real (raio do impacto)
      const r = T * (fx.r ?? 2) * (1 - (1 - t) * (1 - t));
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
    case 'weapons': {                    // kunais voando em leque na direção do alvo
      const a = Math.atan2(fx.fy || 0, fx.fx || 1);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, T * 0.07);
      ctx.lineCap = 'round';
      for (let k = -1; k <= 1; k++) {
        const ang = a + k * 0.28;
        const d = T * (0.4 + 3.6 * t);
        const x0 = sx + Math.cos(ang) * d, y0 = sy + Math.sin(ang) * d;
        ctx.beginPath(); ctx.moveTo(x0 - Math.cos(ang) * T * 0.35, y0 - Math.sin(ang) * T * 0.35); ctx.lineTo(x0, y0); ctx.stroke();
      }
      break;
    }
    case 'lightning': {                  // raio em zigue-zague até o alcance (4,5 casas)
      const a = Math.atan2(fx.fy || 0, fx.fx || 1);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, T * 0.09);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      for (let k = 1; k <= 6; k++) {
        const d = (T * 4.5 * k) / 6, side = (k % 2 ? 1 : -1) * T * 0.25 * (k < 6 ? 1 : 0);
        ctx.lineTo(sx + Math.cos(a) * d - Math.sin(a) * side, sy + Math.sin(a) * d + Math.cos(a) * side);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.35 * fade;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(sx, sy, T * 0.6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'teleport': {                   // nuvem de fumaça (some de um lado, aparece do outro)
      ctx.globalAlpha = 0.8 * fade;
      ctx.fillStyle = color;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const d = T * (0.15 + 0.55 * t);
        ctx.beginPath(); ctx.arc(sx + Math.cos(a) * d, sy + Math.sin(a) * d * 0.7, T * (0.28 - 0.12 * t), 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'substitution': {               // folhas girando em volta: Substituição armada
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#7fbf4a';
      for (let k = 0; k < 6; k++) {
        const a = t * 9 + (k / 6) * Math.PI * 2;
        ctx.fillRect(Math.round(sx + Math.cos(a) * T * 0.8) - 3, Math.round(sy + Math.sin(a) * T * 0.5) - 2, 6, 4);
      }
      break;
    }
    case 'log': {                        // o tronco que levou o golpe, caindo e sumindo
      const w = T * 0.5, h = T * 0.9;
      ctx.globalAlpha = Math.min(1, fade * 1.6);
      ctx.translate(sx, sy + T * 0.2);
      ctx.rotate(Math.min(1, t * 3) * 1.2);
      ctx.fillStyle = '#5c3a1c';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
      ctx.fillStyle = '#e9c88a';
      ctx.beginPath(); ctx.ellipse(0, -h / 2, w / 2, w / 4, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** Bonecos de treino da Academia: poste de madeira com alvo (o que bate tem braços). */
function drawDummyMonster(m, sx, sy, T, now) {
  const dying = m.diedAt ? Math.max(0, Math.min(1, (now - m.diedAt) / 450)) : 0;
  const born = Math.max(0.05, Math.min(1, (now - m.bornAt) / 250));
  const big = m.type === 'sparring';
  const s = T * (big ? 0.62 : 0.5) * born;
  ctx.save();
  ctx.globalAlpha = 1 - dying;
  ctx.translate(sx, sy);
  if (dying) ctx.rotate(dying * 1.4);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.9, s * 0.8, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5c3a1c';
  ctx.fillRect(-s * 0.12, -s * 0.2, s * 0.24, s * 1.1);            // poste
  ctx.fillStyle = '#c9a26b';
  ctx.beginPath(); ctx.ellipse(0, -s * 0.35, s * 0.5, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();   // corpo de palha
  ctx.strokeStyle = '#7a5230';
  ctx.lineWidth = Math.max(1.5, T * 0.04);
  ctx.stroke();
  if (big) {                                                        // braços que batem + faixa vermelha
    const swing = Math.sin(now / 220) * 0.4;
    ctx.save(); ctx.rotate(swing);
    ctx.fillStyle = '#7a5230'; ctx.fillRect(-s * 1.1, -s * 0.5, s * 2.2, s * 0.16);
    ctx.restore();
    ctx.fillStyle = '#b3261e'; ctx.fillRect(-s * 0.5, -s * 0.25, s, s * 0.14);
  }
  ctx.fillStyle = '#b3261e';                                        // alvo
  ctx.beginPath(); ctx.arc(0, -s * 0.35, s * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#efe3c2';
  ctx.beginPath(); ctx.arc(0, -s * 0.35, s * 0.11, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (!dying) drawHpBar(sx, sy - s * 1.1 - Math.max(6, T * 0.16), T * 0.8, m.hp / m.maxHp, '#ffb347');
  if (m.id === state.focusId && !dying) drawFocusMarker(sx, sy, s * 0.8, T, now);
}

/** Monstro provisório: círculo vermelho com "M", barra de vida e ícones de atordoado/preso. */
function drawMonster(m, sx, sy, T, now) {
  if (m.type === 'dummy' || m.type === 'sparring') return drawDummyMonster(m, sx, sy, T, now);
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
  if (n.shop || ACADEMY_LOOK[n.id]) return drawShopkeeper(n, sx, sy, T, now);
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

/** Lojista (só existe dentro da loja): boneco de frente, nome com o ícone da loja e anel quando perto. */
function drawShopkeeper(n, sx, sy, T, now) {
  ctx.save();
  if (state.nearNpc === n) {
    const r = T * 0.44;
    ctx.strokeStyle = 'rgba(255, 210, 63, 0.75)';
    ctx.lineWidth = Math.max(2, T * 0.06);
    ctx.setLineDash([T * 0.2, T * 0.12]);
    ctx.lineDashOffset = -now / 50;
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.9, r * 1.7, r * 0.66, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  const look = SHOPKEEPER_LOOK[n.shop] || ACADEMY_LOOK[n.id] || DEFAULT_APPEARANCE;
  n.anim ||= { dead: false, moving: false, act: null, seed: [...String(n.id)].length * 977 };
  const top = drawSpriteCharacter(ctx, n.anim, sx, sy, T, look, 0, now, NPC_GEAR[n.id])
    ?? drawCharacter(ctx, sx, sy, T, fallbackColors(look), 0, 0, false, NPC_GEAR[n.id]);
  const fontSize = Math.max(11, Math.round(T * 0.3));
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20, 17, 13, 0.9)';
  ctx.fillStyle = '#ffd23f';
  const label = `${n.shop ? SHOP_INFO[n.shop]?.icon || '🛒' : n.id === 'director' ? '🎓' : '📘'} ${n.name}`;
  ctx.strokeText(label, sx, top - 3);
  ctx.fillText(label, sx, top - 3);
  ctx.restore();
  n.labelTop = top - 3 - fontSize;
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

/**
 * Boneco em sprites com os pés em (sx, sy + 0,42·T), como o boneco antigo. Arma na mão e itens nas costas
 * vão nas âncoras do quadro (atrás do corpo quando o braço está atrás). Devolve o topo da cabeça, ou null
 * se o atlas do gênero ainda não chegou (o chamador desenha o boneco antigo).
 */
function drawSpriteCharacter(g, p, sx, sy, T, look, dir, now, gear) {
  if (!spritesReady(look.gender)) return null;
  const s = spriteScale(T, dpr);
  const [view, flip] = viewOf(dir);
  const { anim, frame } = pickFrame(p, now);
  const left = Math.round((sx - 32 * s) * dpr) / dpr;
  const top = Math.round((sy + T * 0.42 - 93 * s) * dpr) / dpr;
  let onPlane = null;
  const an = gear && (gear.hand || gear.back || gear.scroll) ? anchorsOf(look.gender, anim, view, frame) : null;
  if (an) {
    // Ordem do paperdoll:
    //  - costas: atrás do corpo (de frente e de lado) ou por cima de tudo (de costas);
    //  - mão: logo ANTES do plano do braço que segura (o punho fecha por cima do cabo); no selo do jutsu, some.
    // No golpe com arma, a espada / Shuriken Gigante sai das costas para a mão (a bainha vazia fica nas costas).
    const ax = (x) => (flip ? left + (64 - x) * s : left + x * s);
    const u = (T / 16) * 1.3;
    const R = (px, py, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(px), Math.round(py), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
    const backX = ax(an.costas[0]), backY = top + an.costas[1] * s;
    const strike = anim === 'golpe' && an.mao;
    // Arremesso (Shuriken Gigante): na mão só no preparo; some no lançamento e enquanto voa.
    const thrownGone = gear.back && isThrown(gear.back) && ((strike && frame > 0) || (p.thrown && now < p.thrown.until));
    const inHand = gear.hand || (strike && !thrownGone && gear.back && drawnForStrike(gear.back) && weaponReady(gear.back, 'mao') ? gear.back : null);
    const back = () => {
      for (const code of [gear.back, gear.scroll]) {
        if (!code || (thrownGone && code === gear.back)) continue;
        if (code === inHand) {
          if (weaponReady(code, 'bainha')) drawBackWeapon(g, code, backX, backY, s, view, flip, dpr, true);
        } else if (weaponReady(code)) {
          drawBackWeapon(g, code, backX, backY, s, view, flip, dpr);
        } else {
          drawBackItem(R, backX, backY - 2.75 * u, u, dir, code);
        }
      }
    };
    const hand = () => {
      if (weaponReady(inHand, 'mao')) drawHandWeapon(g, inHand, ax(an.mao[0]), top + an.mao[1] * s, s, an.mao[3] ?? 90, flip, dpr);
      else if (dir !== 3) drawHandItem(R, ax(an.mao[0]) - u, top + an.mao[1] * s - 0.6 * u, u, dir === 0 ? 1 : dir, inHand);
    };
    const handPlane = inHand && an.mao && anim !== 'jutsu' ? an.mao[2] : -1;
    onPlane = (plane) => {
      if (plane === (dir === 3 ? 4 : 0)) back();
      if (plane === handPlane) hand();
    };
  }
  const minY = drawCell(g, left, top, s, look, view, flip, anim, frame, onPlane);
  return minY == null ? null : top + minY * s;
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
  // PvP: preso pela Sombra (mancha escura no chão)
  if (!p.dead && now < (p.rootedUntil || 0)) {
    ctx.fillStyle = 'rgba(42, 33, 64, 0.8)';
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.92, r * 1.4, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Boneco em sprites (camadas recoloridas); enquanto os atlas não chegam, o boneco antigo de retângulos.
  const dirNow = p.dead ? 0 : p.dir;
  const headTop = drawSpriteCharacter(ctx, p, sx, sy, T, look, dirNow, now, p.gear)
    ?? drawCharacter(ctx, sx, sy, T, fallbackColors(look), dirNow, p.walk, p.moving && !p.dead, p.gear);
  if (!p.dead && now < (p.stunnedUntil || 0)) {   // PvP: atordoado (estrelinhas girando em cima da cabeça)
    ctx.fillStyle = '#ffe066';
    for (let k = 0; k < 3; k++) {
      const a = now / 250 + (k * Math.PI * 2) / 3;
      ctx.fillRect(Math.round(sx + Math.cos(a) * r * 0.9) - 2, Math.round(headTop - 4 + Math.sin(a) * r * 0.25) - 2, 4, 4);
    }
  }
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
