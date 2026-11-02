// Vontade do Fogo — cliente web (JavaScript puro, sem bibliotecas).
//
// O SERVIDOR DECIDE TUDO no combate: este cliente só pede ("usa Fogo", "renascer") e
// desenha o que o servidor responde (acertos, dano, vida, chakra, morte, XP).
//
// Fluxo: login (POST /auth/login) -> JWT no localStorage -> WebSocket /game.
// O token vai no subprotocolo do WebSocket ("jwt.<token>"), num cabeçalho: nunca na URL.
// Movimento autoritativo: o joystick manda só a direção; quem calcula a posição é o
// servidor. O cliente prevê o próprio movimento para a resposta ser imediata e corrige
// com a posição oficial que chega a cada tick.

import { CAMERA, FOCUS_RANGE, frameCamera, keepFocus, nextFocus, smoothing } from './targeting.js';
import { HOLD_MS, aimPaths, autoAim, dragAim, tilesOnPath } from './aim.js';
import { arenaAt, arenaFoes, artPlaces, groundAt, inSafeZone, mapName, placements, themeAt, visibleDeco, visibleWalls } from './world.js';
import {
  ART, PROP_KINDS, buildingLights, drawAcademyDoor, drawChakraField, drawDeco, drawGateRoof, drawOakCanopy, drawProp, drawSealGlow, drawTrails,
  drawWall, fenceLanterns, propExtent,
} from './mapArt.js';
import { dirFrom, drawBackItem, drawCharacter, drawHandItem } from './character.js';
import { DEFAULT_APPEARANCE, DEFAULT_SHOES, OPTIONS, drawShoeIcon, fallbackColors, normalizeLook, spriteScale, swatchOf } from './sprites.js';
import { drawFigure, figureCanvas } from './figure.js';
import { pickAnim } from './rig.js';
import { Predictor, pushSnapshot, quantize, sampleSnapshots } from './prediction.js';
import { VFXManager, loadVfx, vfxReady } from './vfx.js';
import { drawBackWeapon, drawHandWeapon, drawWeaponIcon, drawnForStrike, isThrown, loadWeapons, weaponReady } from './weapons.js';
import { VILLAGE_NAMES, egOn, factionStyle, mapAccess, mountEndgameUI, shopFactor, zoneFoe } from './endgame.js';
import { mountAdminUI } from './adminPanel.js';
import { drawMonsterArt, drawMonsterPortrait, loadMonsterSprites, monsterArtReady, monsterDeathMs, playMonster } from './monsterSprites.js';

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
  sliders: { btnScale: $('btn-scale'), btnOpacity: $('btn-opacity'), barScale: $('bar-scale'), barOpacity: $('bar-opacity'), camDist: $('cam-dist') },
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
  kagePanel: $('kage-panel'), kageClose: $('kage-close'), kageApply: $('kage-apply'),
  // v8: histórico do chat, Sala de Missões (cartões) e redefinir atributos
  historyToggle: $('history-toggle'), historyPanel: $('history-panel'), historyClose: $('history-close'),
  historyList: $('history-list'), historyEmpty: $('history-empty'), historyTabs: [...document.querySelectorAll('#history-panel .tab')],
  boardPanel: $('board-panel'), boardClose: $('board-close'), boardCards: $('board-cards'), boardCurrent: $('board-current'),
  boardTitle: $('board-mission-title'), boardProgress: $('board-mission-progress'), boardDeliver: $('board-deliver'), boardHint: $('board-hint'),
  resetAttrs: $('reset-attrs'),
  // HUD do desenho: retrato, efeitos, alvo, minimapa, menu, missões em andamento, chat em painel e XP
  portrait: $('portrait'), levelBadge: $('level-badge'), ryoText: $('ryo-text'), buffs: $('buffs'),
  targetWindow: $('target-window'), targetPortrait: $('target-portrait'), targetName: $('target-name'),
  bossBar: $('boss-bar'), bossName: $('boss-name'), bossTrack: $('boss-track'), bossFill: $('boss-fill'), bossHp: $('boss-hp'),
  targetFill: $('target-fill'), targetHp: $('target-hp'),
  minimap: $('minimap'), minimapCanvas: $('minimap-canvas'), menuToggle: $('menu-toggle'), menuGrid: $('menu-grid'),
  trackerMain: $('tracker-main'), trackerSide: $('tracker-side'), chatBox: $('chat-box'), chatMin: $('chat-min'),
  chatMissionsPane: $('chat-missions-pane'), chatTabMissions: $('chat-tab-missions'), xpStripFill: $('xp-strip-fill'),
  // Equipamentos de Shinobi
  equipLevel: $('equip-level'), equipRank: $('equip-rank'), equipAttrs: $('equip-attrs'), equipFigure: $('equip-figure'),
  equipTurn: $('equip-turn'), equipDo: $('equip-do'), equipInfo: $('equip-info'), equipDetail: $('equip-detail'),
  equipHpFill: $('equip-hp-fill'), equipHp: $('equip-hp'), equipChFill: $('equip-ch-fill'), equipCh: $('equip-ch'),
  equipXpFill: $('equip-xp-fill'), equipXp: $('equip-xp'),
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
   * itens, arma equipada, classes, jutsus aprendidos -> usos (o nível sai do uso) e Kage.
   */
  ninja: { tutorialStep: 4, ryo: 0, items: {}, equipped: null, equippedScroll: null, equippedShoes: null, equippedAccessory: null, classes: { primary: null, secondary: null }, jutsus: {}, kageCandidate: false, isAdmin: false, cape: null, display: { cape: true, weapon: true, scroll: true } },
  /** Fim de jogo (v16): o estado político que o servidor manda (`endgame`) ou null (módulos desligados / sem a v11). */
  endgame: null,
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
  arts: [],                          // mapas em imagem à vista (artPlaces)
  walls: [],
  /** Enfeites visíveis (bancos, lanternas...) e os que passam POR CIMA dos jogadores (telhado do portão). */
  deco: [],
  overhead: [],
  /** Objetos com altura do mapa (árvores, pedras, barracas): desenhados junto dos bonecos (makeProps). */
  props: [],
  /** Loja aberta ({ kind, npcId }) ou null. */
  shop: null,
  /** O próprio jogador está numa zona segura (praça): botões de combate apagados. */
  inSafeZone: false,
  /** Dentro da arena da vila (PvP de treino): os ninjas da vila viram alvo e o topo avisa. */
  inArena: false,
  /** Placar da arena deste jogador ({ wins, losses }, desde que o servidor subiu). */
  arenaRecord: null,
  /** Extração: falhas seguidas por classe e tier (proteção contra azar, vem do servidor). */
  extractFailures: {},
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
  /** Golpes marcados no chão (Lodo Escuro): id do monstro -> { x, y, r, start, end }. */
  telegraphs: new Map(),
  /** Portas da Academia (desenhadas a cada quadro: abertas ou fechadas pelo passo do tutorial). */
  doors: [],
};

/** Gear vindo da rede: só códigos curtos (o desenho ignora o que não conhece). */
const safeGear = (g) => {
  const ok = (c) => (typeof c === 'string' && /^[a-z][a-z0-9_]{0,31}$/.test(c) ? c : null);
  return { hand: ok(g?.hand), back: ok(g?.back), scroll: ok(g?.scroll), feet: ok(g?.feet), body: ok(g?.body) };
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
  closeKage();
  setFocus(null);
  hideDeath();
}

function send(message) {
  const ws = state.ws;
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

// Erro no navegador (v20): vai para o servidor, que mostra como "bug" no painel do admin do site. O mesmo erro sai uma
// vez só, e no máximo 3 por minuto (um erro dentro do loop de desenho repetiria 60 vezes por segundo).
const reportedErrors = new Set();
let errorWindow = { start: 0, n: 0 };
function reportClientError(message, source, line, stack) {
  const text = String(message || 'erro sem mensagem').slice(0, 300);
  const key = `${text}|${source || ''}|${line || 0}`;
  const now = Date.now();
  if (reportedErrors.has(key)) return;
  if (now - errorWindow.start > 60_000) errorWindow = { start: now, n: 0 };
  if (++errorWindow.n > 3) return;
  reportedErrors.add(key);
  send({
    type: 'client_error', message: text,
    ...(source ? { source: String(source).slice(0, 200) } : {}),
    ...(Number.isInteger(line) && line >= 0 ? { line } : {}),
    ...(stack ? { stack: String(stack).slice(0, 1500) } : {}),
  });
}
window.addEventListener('error', (e) => reportClientError(e.message, e.filename, e.lineno, e.error?.stack));
window.addEventListener('unhandledrejection', (e) => reportClientError(e.reason?.message || String(e.reason), null, null, e.reason?.stack));

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
    if (p.faction !== undefined) existing.faction = p.faction;
    if (p.fx) existing.fx = fxFrom(p.fx);
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
    // Fim de jogo (v16): vila, renegado, Kage, Akatsuki, recompensa e capa (o servidor manda; null = módulos desligados).
    faction: p.faction || null,
    // Efeitos com tempo (molhado, queimadura, sono...): código -> até quando (relógio da página).
    fx: fxFrom(p.fx),
    initial: ([...p.username][0] || '?').toUpperCase(),
    initialColor: LIGHT_COLORS.has(color) ? '#14110d' : '#ffffff',
  };
  state.players.set(p.id, player);
  return player;
}

function upsertMonster(m, now) {
  state.monsters.set(m.id, {
    id: m.id, type: m.type, map: state.serverMap, x: m.x, y: m.y, tx: m.x, ty: m.y, hp: m.hp, maxHp: m.maxHp,
    stunnedUntil: 0, rootedUntil: 0, bornAt: now, diedAt: 0, fx: fxFrom(m.fx), aggro: null,
    // Sprites (monsterSprites.js): a animação de agora, para onde olha e a fase própria (não respiram juntos).
    anim: null, face: 1, furious: false, seed: Number.parseInt(String(m.id).replace(/\D/g, ''), 10) || 0,
  });
}

/** Efeitos que vêm do servidor (código -> ms que faltam) -> código -> até quando, no relógio da página. */
function fxFrom(raw) {
  const out = {};
  const now = performance.now();
  if (raw && typeof raw === 'object') for (const [code, ms] of Object.entries(raw)) if (typeof ms === 'number' && ms > 0) out[code] = now + ms;
  return out;
}

/** Os ícones dos efeitos valendo agora (molhado, queimadura...), na ordem do catálogo. */
function fxIcons(e, now) {
  const catalog = state.world.effects || {};
  const out = [];
  for (const [code, until] of Object.entries(e.fx || {})) {
    if (until > now && catalog[code]) out.push(catalog[code].icon);
  }
  return out;
}

/**
 * Golpes marcados no chão: um círculo vermelho tracejado com o miolo enchendo do centro para a borda até a hora do
 * pulo. Quem está dentro quando enche apanha (a regra é do servidor; isto só avisa).
 */
function drawTelegraphs(toScreenX, toScreenY, T, now) {
  for (const [id, tg] of state.telegraphs) {
    if (now > tg.end + 150) { state.telegraphs.delete(id); continue; }
    const p = Math.max(0, Math.min(1, (now - tg.start) / (tg.end - tg.start || 1)));   // o relógio do quadro pode vir antes do início
    const sx = toScreenX(tg.x), sy = toScreenY(tg.y), rx = tg.r * T, ry = tg.r * T * 0.62;
    ctx.save();
    // O Esmagar do chefe (golpe pesado só no alvo) é roxo, para não confundir com o pulo.
    const [cr, cg, cb] = tg.crush ? [150, 60, 220] : [220, 40, 30];
    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.12 + 0.1 * p})`;
    ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tg.crush ? `rgba(190, 100, 255, ${0.3 + 0.2 * p})` : `rgba(255, 70, 50, ${0.28 + 0.2 * p})`;
    ctx.beginPath(); ctx.ellipse(sx, sy, rx * p, ry * p, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = p > 0.8 && Math.floor(now / 70) % 2 ? '#ffe066' : tg.crush ? '#c27bff' : '#ff4a3a';   // pisca no fim
    ctx.lineWidth = Math.max(2, T * 0.06);
    ctx.setLineDash([T * 0.2, T * 0.1]);
    ctx.lineDashOffset = -now / 25;
    ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

/** Linha de ícones de efeito em cima da cabeça (ninja ou monstro). */
function drawFxIcons(e, sx, y, T, now) {
  const icons = fxIcons(e, now);
  if (!icons.length) return;
  ctx.save();
  ctx.font = `${Math.max(11, Math.round(T * 0.3))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(icons.join(''), sx, y);
  ctx.restore();
}

const CAST_FAIL_TEXT = {
  NO_CHAKRA: 'Chakra insuficiente', COOLDOWN: 'Recarregando…', NO_TARGET: 'Nenhum alvo perto', SILENCED: 'Silenciado!', ASLEEP: 'Dormindo…',
  FULL_HP: 'Vida cheia', ALREADY_ACTIVE: 'Escudo já ativo', DEAD: 'Você está derrotado', OUT_OF_RANGE: 'Alvo fora de alcance',
  NOT_EQUIPPED: 'Fora do kit ativo', SAFE_ZONE: 'Zona segura: sem combate',
  NOT_LEARNED: 'Jutsu não aprendido', BLOCKED: 'Caminho bloqueado', TUTORIAL_LOCKED: 'Primeiro, o Ataque Básico',
  STUNNED: 'Atordoado!',
};

function handleMessage(msg) {
  const now = performance.now();
  if (eg.handle(msg)) return;            // painéis do fim de jogo (endgame.js)
  if (adminUI.handle(msg)) return;       // painel do admin (adminPanel.js)
  switch (msg.type) {
    case 'sky': {
      // O céu mudou (para todos): a fase do dia e/ou o clima. Avisa na tela o que mudou nos jutsus.
      setSky(msg.sky);
      announceSky(msg.changed);
      break;
    }
    case 'welcome': {
      state.players.clear();
      state.monsters.clear();
      state.meId = msg.you.id;
      if (msg.world) {
        const w = msg.world;
        state.world = w;
        if (w.sky) setSky(w.sky);
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
      renderDisplayBoxes();
      pred.gates.tutorial = state.ninja.tutorialStep;   // portas da Academia: o MESMO passo do servidor
      // Sala compartilhada (loja, Academia): para onde a porta de saída leva (a vila de onde ele entrou).
      pred.gates.back = msg.you.doorBack ? { ...msg.you.doorBack } : undefined;
      state.endgame = null;                              // o servidor manda `endgame` logo depois (se houver)
      updateAccess();
      eg.refresh();
      adminUI.refresh();
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
    // ---- fim de jogo (v16): o estado político e o lado de cada ninja (o servidor manda; aqui só se mostra)
    case 'endgame':
      state.endgame = msg;
      updateAccess();
      if (state.mapId) state.npcs = state.allNpcs.filter((n) => n.map === state.mapId && npcVisible(n));
      eg.refresh();
      if (state.shop) renderShopItems();
      break;
    case 'player_faction': {
      const p = state.players.get(msg.playerId);
      if (p) p.faction = msg.faction;
      if (msg.playerId === state.meId) {
        updateAccess();
        eg.refresh();
      }
      break;
    }
    case 'power': {
      // Poder da Akatsuki aceito pelo servidor: a animação (o efeito em si já foi aplicado lá).
      const fxKind = POWER_FX[msg.power];
      if (fxKind) state.effects.push({ skill: fxKind, x: msg.x, y: msg.y, fx: msg.fx, fy: msg.fy, tx: msg.tx, ty: msg.ty, start: now });
      const caster = state.players.get(msg.playerId);
      if (caster) caster.act = { kind: 'jutsu', start: now };
      if (msg.playerId === state.meId) eg.powerUsed(now);
      break;
    }
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
      if (msg.cape !== undefined) state.ninja.cape = msg.cape;
      Object.assign(state.ninja, { ryo: msg.ryo, items: msg.items, equipped: msg.equipped, equippedScroll: msg.equippedScroll ?? null, equippedShoes: msg.equippedShoes ?? null, equippedAccessory: msg.equippedAccessory ?? null });
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
    case 'extract_odds':
      state.extractFailures = msg.failures || {};
      if (state.shop?.kind === 'scrolls') renderExtraction();
      break;
    case 'arena_result': {
      // Luta de treino na arena: todo mundo no mapa vê no chat; quem lutou vê o placar.
      const line = `⚔️ Arena: ${msg.winner} venceu ${msg.loser}.`;
      addSystemLine(line);
      if (msg.winnerId === state.meId || msg.loserId === state.meId) {
        const mine = msg.winnerId === state.meId ? msg.winnerRecord : msg.loserRecord;
        state.arenaRecord = mine;
        showToast(`${msg.winnerId === state.meId ? 'Vitória' : 'Derrota'} na arena · ${mine.wins}V ${mine.losses}D`, 3500);
        updateOnline();
      }
      break;
    }
    case 'monster_gone':
      state.monsters.delete(msg.id);           // o mapa esvaziou e ele sumiu longe de todos
      if (state.focusId === msg.id) setFocus(null);
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
    case 'effect': {
      // Efeito com tempo (molhado, queimadura, sono...): o servidor diz quanto falta; ms 0 = acabou.
      const e = msg.target === 'monster' ? state.monsters.get(msg.id) : state.players.get(msg.id);
      if (e) {
        e.fx = e.fx || {};
        if (msg.ms > 0) e.fx[msg.effect] = now + msg.ms;
        else delete e.fx[msg.effect];
      }
      if (msg.id === state.meId) renderBuffs();
      break;
    }
    case 'telegraph': {
      // Golpe marcado: o círculo vermelho enche no chão até a hora do pulo (ms 0 = o monstro foi interrompido).
      const tm = state.monsters.get(msg.id);
      if (msg.ms > 0) {
        state.telegraphs.set(msg.id, { x: msg.x, y: msg.y, r: msg.r, start: now, end: now + msg.ms, crush: msg.kind === 'crush' });
        if (tm) {
          if (Math.abs(msg.x - tm.x) > 0.05) tm.face = msg.x > tm.x ? 1 : -1;
          playMonster(tm, msg.kind === 'crush' ? 'crush_windup' : 'leap_windup', now, msg.ms);   // agacha e segura
        }
      } else {
        state.telegraphs.delete(msg.id);
        if (tm) { addFloater(tm.x, tm.y - 1.1, 'Interrompido!', '#ffe066', 1); tm.anim = null; }
      }
      break;
    }
    case 'monster_slam': {
      // Caiu: o monstro pula no centro, poeira em anel e um tremor curto na câmera.
      state.telegraphs.delete(msg.id);
      const m = state.monsters.get(msg.id);
      if (m && msg.kind !== 'crush') { m.tx = msg.x; m.ty = msg.y; }   // o pulo; o Esmagar bate sem sair do lugar
      if (m) playMonster(m, msg.kind === 'crush' ? 'crush_hit' : 'leap_land', now);
      vfx.play('dust', msg.x, msg.y, { start: now, feet: true, layer: 'ground', scale: msg.r });
      state.effects.push({ skill: 'slam', x: msg.x, y: msg.y, fx: msg.r, fy: 0, start: now });
      const me = state.players.get(state.meId);
      if (me && Math.hypot(me.x - msg.x, me.y - msg.y) < msg.r + 3) state.shakeUntil = now + 220;
      break;
    }
    case 'boss_phase': {
      // O chefe mudou de fase (chamou os filhos, ficou furioso): aviso grande e o texto em cima dele.
      showToast(`👑 ${msg.text}`, 3500);
      const m = state.monsters.get(msg.id);
      if (m) {
        addFloater(m.x, m.y - 2.4, msg.phase >= 2 ? 'FÚRIA!' : '!!', '#ff7a4a', 1.4);
        if (msg.phase >= 2) { m.furious = true; playMonster(m, 'fury', now); } else playMonster(m, 'summon', now);
      }
      break;
    }
    case 'combo': {
      // Combo de elementos: Água molhou, o Relâmpago eletrocutou (30% a mais).
      const e = msg.target === 'monster' ? state.monsters.get(msg.id) : state.players.get(msg.id);
      if (e) addFloater(e.x, e.y - 1.5, 'Combo! ⚡💧', '#7fd8ff', 1.15);
      break;
    }
    case 'monster_aggro': {
      // O monstro notou alguém: "!" vermelho em cima dele (null = desistiu e volta para a zona).
      const m = state.monsters.get(msg.id);
      if (m) {
        if (msg.targetId && !m.aggro) addFloater(m.x, m.y - 1.1, '!', '#ff5a4a', 1.2);
        m.aggro = msg.targetId;
      }
      break;
    }
    case 'sync': {
      // O servidor mede o ping (para a compensação de lag no PvP): devolve na hora, e mostra o último medido no topo.
      send({ type: 'sync', id: msg.id });
      if (msg.rtt > 0 && (!state.pingMs || Math.abs(state.pingMs - msg.rtt) >= 5)) {
        state.pingMs = msg.rtt;
        updateOnline();
      }
      break;
    }
    case 'pushed': {
      // A Água empurrou o ninja: respingo onde ele estava e o boneco escorrega até o lugar novo (o servidor decidiu).
      vfx.play('dust', msg.fromX, msg.fromY, { start: now, feet: true, layer: 'ground' });
      const p = state.players.get(msg.playerId);
      jumpPlayer(msg.playerId, msg.x, msg.y, msg.a);
      if (p) p.knock = { dx: msg.fromX - msg.x, dy: msg.fromY - msg.y, start: now };
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
      if (msg.maps) Object.assign(state.maps, msg.maps);   // o mapa novo e os vizinhos que ainda não tínhamos
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
      // O corte tem o tamanho do golpe da arma (kunai curta, espada longa maior: `r` do servidor).
      const reach = (msg.r || state.world.basicAttack?.range || 1.6) / 1.6;
      if (!msg.throw && !vfx.play('slash', msg.x, msg.y, { start: now, delay: 80, angle: Math.atan2(msg.fy, msg.fx), scale: reach })) {
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
      // Poderes da Akatsuki: a Argila Viva voa como a bola de fogo; a Chuva de Papel, como kunais.
      const sheet = msg.power ? (msg.power === 'blast' ? 'fireball' : 'kunai') : msg.weapon ? 'fuma' : mechanicOf(msg.skill) === 'fire' ? 'fireball' : 'kunai';
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
      // Ninja atingido: o tranco do golpe (sem cortar o próprio golpe ou jutsu no meio).
      if (!heal && msg.target === 'player' && !(target.act && target.act.kind !== 'dano' && now - target.act.start < 450)) {
        target.act = { kind: 'dano', start: now };
      }
      if (msg.target === 'monster') {
        // Monstro: tranco de golpe (sem cortar um ataque ou um golpe marcado no meio); vida cheia de novo = voltou para casa.
        if (!heal && !(target.anim && now < target.anim.until)) playMonster(target, 'hit', now);
        if (heal && msg.hp >= msg.maxHp) { target.furious = false; target.anim = null; }
      }
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
        if (m) {
          if (Math.abs(x - m.x) > 0.02) m.face = x > m.x ? 1 : -1;   // olha para onde anda
          m.tx = x; m.ty = y;
        }
      }
      break;
    case 'monster_attack': {
      // Bateu em alguém: a animação de ataque, virado para o alvo (o dano vem no `hit`).
      const m = state.monsters.get(msg.id);
      const t = state.players.get(msg.targetId);
      if (m) {
        if (t && Math.abs(t.x - m.x) > 0.05) m.face = t.x > m.x ? 1 : -1;
        playMonster(m, 'attack', now);
      }
      break;
    }
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
        showDeath(msg.respawnInMs, msg.arena);
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
      // Diretor, nível 60 e ainda sem candidatura: o botão de Kage aparece.
      const kageAt = state.world.rankLevels?.kage ?? 60;
      if (msg.npcId === 'director' && (state.progress?.level ?? 1) >= kageAt && !state.ninja.kageCandidate) openKage();
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
      else if (msg.code === 'VILLAGE_LOCKED') ui.creatorError.textContent = msg.message;
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
  if (pr) ui.xpStripFill.style.transform = `scaleX(${pr.xpToNext ? Math.min(1, pr.xpInLevel / pr.xpToNext) : 1})`;
  renderBuffs();
  renderSlots();
}

// ---- HUD do desenho: efeitos, retrato, alvo, minimapa e missões em andamento

/** Efeitos ativos embaixo das barras (quadradinhos com moldura). Só refaz quando a lista muda. */
function renderBuffs() {
  const m = state.me;
  const list = [];
  const clock = skyClock(), fx = skyHere();
  if (clock && fx) {                                  // o céu (ao ar livre): a hora e o clima, com o bônus
    const fxText = skyEffectsText(fx);
    list.push([PHASE_ICONS[clock.phase], `${PHASE_NAMES[clock.phase]}${clock.phase === 'noite' && fxText ? ` · ${fxText}` : ''}`]);
    if (state.sky.weather !== 'normal') list.push([SKY_ICONS[state.sky.weather], `${SKY_NAMES[state.sky.weather]}${fxText ? ` · ${fxText}` : ''}`]);
  }
  if (m.meditating) list.push(['🧘', 'Meditando']);
  if (m.shield) list.push(['🛡️', 'Escudo de Pedra']);
  if (m.running) list.push(['🏃', 'Correndo']);
  if (state.inSafeZone) list.push(['🕊️', 'Zona segura']);
  if (state.inArena) list.push(['⚔️', 'Arena']);
  const me = state.players.get(state.meId), catalog = state.world.effects || {}, t = performance.now();
  for (const [code, until] of Object.entries(me?.fx || {})) {          // efeitos com tempo: molhado, silêncio, sono...
    if (until > t && catalog[code]) list.push([catalog[code].icon, `${catalog[code].name} (${Math.ceil((until - t) / 1000)} s)`]);
  }
  const key = list.map((b) => b.join('')).join('|');
  if (key === renderBuffs.key) return;
  renderBuffs.key = key;
  ui.buffs.replaceChildren(...list.map(([icon, label]) => {
    const li = document.createElement('li');
    li.textContent = icon;
    li.title = label;
    li.dataset.info = `${icon} ${label}`;
    li.setAttribute('aria-label', label);
    return li;
  }));
}
// Tocar num efeito mostra o que ele é (no celular não há "passar o mouse").
ui.buffs.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li?.dataset.info) showToast(li.dataset.info, 3000);
});

/** Nome de cada monstro na janela do alvo. */
const MONSTER_NAMES = { slime: 'Slime', lodo_escuro: 'Lodo Escuro', lodo_sombrio: 'Lodo Sombrio', dummy: 'Boneco de Treino', sparring: 'Boneco de Treino' };

/** Busto do boneco (cabeça e ombros, de frente) num canvas quadrado: a célula 64x96 em escala 2, sem borrar. */
function drawBust(c, look) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = false;
  const s = 2;
  g.drawImage(figureCanvas(look), (c.width - 64 * s) / 2, -12 * s, 64 * s, 96 * s);
  return true;
}

/** O retrato do canto: refeito quando o visual muda. */
function updatePortrait() {
  const look = state.me.look || state.players.get(state.meId)?.look;
  if (!look) return;
  const key = JSON.stringify(look);
  if (key === updatePortrait.key) return;
  if (drawBust(ui.portrait, look)) updatePortrait.key = key;
}

const targetView = { id: null, text: '' };
/** Janela do alvo (🎯): retrato, nome e vida. Escondida sem alvo; vermelha para inimigo. */
/** Barra do chefe: aparece com um chefe vivo a até 20 casas; marcas nas fases; vermelha depois da última (fúria). */
const bossView = { id: null, text: '' };
function updateBossBar(me) {
  const bosses = state.world.bosses || {};
  let boss = null;
  if (me) {
    for (const m of state.monsters.values()) {
      if (m.map === state.mapId && bosses[m.type] && !m.diedAt && m.hp > 0 && Math.hypot(m.x - me.x, m.y - me.y) <= 20) { boss = m; break; }
    }
  }
  if (!boss) {
    if (!ui.bossBar.hidden) ui.bossBar.hidden = true;
    bossView.id = null;
    return;
  }
  const info = bosses[boss.type];
  ui.bossBar.hidden = false;
  if (bossView.id !== boss.id) {
    bossView.id = boss.id;
    bossView.text = '';
    ui.bossName.textContent = `👑 ${info.name}`;
    for (const el of ui.bossTrack.querySelectorAll('.boss-mark')) el.remove();
    for (const at of info.phases) {
      const mark = document.createElement('i');
      mark.className = 'boss-mark';
      mark.style.left = `${at * 100}%`;
      ui.bossTrack.append(mark);
    }
  }
  const ratio = Math.max(0, Math.min(1, boss.hp / (boss.maxHp || 1)));
  const text = `${Math.round(boss.hp)} / ${boss.maxHp}`;
  if (text !== bossView.text) {
    bossView.text = text;
    ui.bossHp.textContent = text;
    ui.bossFill.style.transform = `scaleX(${ratio})`;
    ui.bossBar.classList.toggle('furious', ratio <= Math.min(...info.phases));
  }
}

function updateTargetWindow(f) {
  if (!f) {
    if (!ui.targetWindow.hidden) ui.targetWindow.hidden = true;
    targetView.id = null;
    return;
  }
  ui.targetWindow.hidden = false;
  if (targetView.id !== f.id) {
    targetView.id = f.id;
    ui.targetWindow.classList.toggle('friend', !f.type && isAlly(f));   // aliado focado: barra verde
    targetView.text = '';
    ui.targetName.textContent = f.type ? (MONSTER_NAMES[f.type] || f.type) : f.username;
    const c = ui.targetPortrait, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    if (f.type === 'dummy' || f.type === 'sparring') {
      g.font = `${Math.round(c.width * 0.55)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🎯', c.width / 2, c.height / 2 + 2);
    } else if (f.type) {
      if (!drawMonsterPortrait(g, f.type, c.width)) drawSlime(g, c.width / 2, c.height * 0.5, c.width * 0.27, MONSTER_LOOK[f.type] || MONSTER_LOOK.slime, 0, 0, 0, f.id);
    } else if (f.look) {
      drawBust(c, f.look);
    }
  }
  const max = f.maxHp || 1, hp = Math.max(0, Math.round(f.hp ?? max));
  const text = `${hp} / ${max}`;
  if (text !== targetView.text) {
    targetView.text = text;
    ui.targetHp.textContent = text;
    ui.targetFill.style.transform = `scaleX(${Math.max(0, Math.min(1, hp / max))})`;
  }
}

/*
 * Minimapa: uma imagem do mapa inteiro (3 px por casa: o chão e as paredes em cores chapadas), feita ao entrar no
 * mapa; a cada ~120 ms, o pedaço em volta do jogador num círculo, com monstros (vermelho), NPCs (dourado), outros
 * ninjas (verde), portas e saídas (roxo) e a seta do jogador no meio.
 */
const MM_GROUND = {
  stone: '#8d8a84', grass: '#4f9a3a', darkgrass: '#2a5a2c', moss: '#5b8a62', desert: '#e4c38a', stonebridge: '#b6aa94', sand: '#d9c08a', water: '#3a8ad0', bridge: '#8b5a2b',
  path: '#b8935c', trail: '#9a7a50', wood: '#7a5230', arena: '#3e4761', dirt: '#6f6150', ash: '#4a4744', cave: '#2a2236',
  burnt: '#3a2e26', pebbles: '#8a8478', lodo: '#5e2a86', void: '#0b1020',
};
const MM_WALL = {
  tree: '#173a1c', water: '#3a8ad0', house: '#9a6a3a', rock: '#5a5550', cliff: '#6d645a', wall: '#6b6760', gatepost: '#6b6760',
  fence: '#5b6585', pillar: '#4c5677', pit: '#05060a', cave: '#1a1520', deadtree: '#3a2e26', tent: '#b9a684', oak: '#2f6a33',
  seal: '#ffcf6b', logs: '#5c3a1c', sink: '#16324e', pool: '#5e2a86', gate: '#5c3a1c', iwall: '#3b2a1c', counter: '#5c3a1c',
  furniture: '#5c3a1c', dummy: '#b48558',
};
const minimap = { mapId: null, tex: null, at: 0, S: 3 };
function buildMinimap() {
  const map = state.maps[state.mapId];
  if (!map) return;
  const S = minimap.S, c = document.createElement('canvas');
  c.width = map.width * S;
  c.height = map.height * S;
  const g = c.getContext('2d');
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      g.fillStyle = MM_GROUND[groundKind(x, y)] || '#2a4a2c';
      g.fillRect(x * S, y * S, S, S);
    }
  }
  if (map.art) {                       // mapa em imagem: a própria arte, em miniatura (4 px por casa)
    const mini = new Image();
    const id = state.mapId;
    mini.onload = () => { if (minimap.mapId === id && minimap.tex === c) g.drawImage(mini, 0, 0, c.width, c.height); };
    mini.src = `/mapas/${map.art}/mini.webp`;
  }
  for (const w of state.walls) {
    if (w.art) continue;
    const color = MM_WALL[w.k];
    if (!color) continue;
    g.fillStyle = color;
    g.fillRect(w.x * S, w.y * S, Math.max(1, w.w * S), Math.max(1, w.h * S));
  }
  minimap.tex = c;
  minimap.mapId = state.mapId;
}
function drawMinimap(now) {
  if (now - minimap.at < 120) return;
  minimap.at = now;
  const me = state.players.get(state.meId);
  if (!me) return;
  if (minimap.mapId !== state.mapId || !minimap.tex) buildMinimap();
  const tex = minimap.tex;
  if (!tex) return;
  const c = ui.minimapCanvas, g = c.getContext('2d'), W = c.width, R = 20, k = W / (R * 2), S = minimap.S;
  g.save();
  g.fillStyle = '#0b1020';
  g.fillRect(0, 0, W, W);
  g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.clip();
  g.imageSmoothingEnabled = false;
  // o pedaço do mapa em volta (só a parte que existe: fora do mapa fica o fundo)
  const x0 = me.x - R, y0 = me.y - R;
  const sx = Math.max(0, x0), sy = Math.max(0, y0), ex = Math.min(tex.width / S, x0 + 2 * R), ey = Math.min(tex.height / S, y0 + 2 * R);
  if (ex > sx && ey > sy) g.drawImage(tex, sx * S, sy * S, (ex - sx) * S, (ey - sy) * S, (sx - x0) * k, (sy - y0) * k, (ex - sx) * k, (ey - sy) * k);
  const at = (x, y) => [W / 2 + (x - me.x) * k, W / 2 + (y - me.y) * k];
  const dot = (x, y, r, fill, stroke) => {
    const [px, py] = at(x, y);
    if (Math.hypot(px - W / 2, py - W / 2) > W / 2 - 3) return;
    g.fillStyle = fill;
    g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); }
  };
  for (const d of state.doors || []) dot(d.x + d.w / 2, d.y + d.h / 2, 3.5, '#b98ae6', '#2a1238');
  for (const m of state.monsters.values()) if (m.map === state.mapId && !m.diedAt) dot(m.x, m.y, 2.6, '#ff5a4a', '#3a0a08');
  for (const p of state.players.values()) if (p.id !== state.meId) dot(p.x, p.y, 3, '#8fe07a', '#0d2a0a');
  for (const n of state.npcs) dot(n.x, n.y, 4, '#ffd76a', '#3a2610');
  // a seta do jogador, apontando para onde ele olha
  const ang = [Math.PI / 2, Math.PI, 0, -Math.PI / 2][me.dir ?? 0] ?? Math.PI / 2;   // 0 baixo, 1 esquerda, 2 direita, 3 cima
  g.translate(W / 2, W / 2);
  g.rotate(ang - Math.PI / 2);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#3a2610';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 7); g.lineTo(5.5, -5); g.lineTo(0, -2); g.lineTo(-5.5, -5); g.closePath();
  g.stroke(); g.fill();
  g.restore();
  // sombra por dentro da moldura
  const grad = g.createRadialGradient(W / 2, W / 2, W * 0.36, W / 2, W / 2, W / 2);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.fill();
}

/**
 * Missões em andamento (à direita no computador; na aba "Missões" do chat no celular). Principal: o tutorial, depois
 * o caminho até Genin (nível 11 e o Diretor), depois o Arco 1. Secundária: a missão da Sala de Missões.
 */
function renderTracker() {
  const main = [], side = [];
  const step = state.ninja.tutorialStep ?? 4;
  const level = state.progress?.level ?? 1;
  if (step < 4) {
    const [title, text] = TUTORIAL_STEPS[step];
    main.push({ label: `${title}:`, text });
  } else if (!state.ninja.classes?.primary) {
    if (level < 11) main.push({ label: 'Rumo a Genin:', text: `treine até o nível 11 (você está no ${level}) e fale com o Diretor da Academia.`, meter: level / 11 });
    else main.push({ label: 'Missão de Genin:', text: 'fale com o Diretor da Academia.', ready: true });
  } else {
    main.push({ label: 'Arco 1:', text: 'a história chega em breve. Explore a Floresta e fique mais forte.' });
  }
  const m = state.mission;
  if (m) {
    const done = Math.min(m.progress, m.target.quantity);
    side.push({
      label: m.ready ? 'Pronta!' : `${done}/${m.target.quantity}`, text: `${missionTitle(m)}${m.ready ? ' · entregue ao Mestre' : ''}`,
      meter: m.target.quantity ? done / m.target.quantity : 0, ready: m.ready,
    });
  } else {
    side.push({ label: 'Sala de Missões:', text: 'fale com o Mestre para um treino.' });
  }
  const key = JSON.stringify([main, side]);
  if (key === renderTracker.key) return;
  renderTracker.key = key;
  const items = (list) => list.map((it) => {
    const li = document.createElement('li');
    if (it.ready) li.className = 'ready';
    const b = document.createElement('b');
    b.textContent = it.label;
    li.append(b, document.createTextNode(` ${it.text}`));
    if (it.meter != null) {
      const bar = document.createElement('span');
      bar.className = 'meter';
      const fill = document.createElement('i');
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, it.meter)) * 100)}%`;
      bar.append(fill);
      li.append(bar);
    }
    return li;
  });
  ui.trackerMain.replaceChildren(...items(main));
  ui.trackerSide.replaceChildren(...items(side));
  // a mesma coisa na aba "Missões" do chat
  const head = (text) => {
    const h = document.createElement('h3');
    const d = document.createElement('i');
    d.className = 'diamond';
    h.append(d, document.createTextNode(` ${text}`));
    return h;
  };
  const ul = (list) => { const u = document.createElement('ul'); u.className = 'tracker-list'; u.append(...items(list)); return u; };
  ui.chatMissionsPane.replaceChildren(head('Missão Principal'), ul(main), head('Missões Secundárias'), ul(side));
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
function showDeath(ms, arena = false) {
  ui.death.hidden = false;
  ui.death.classList.toggle('arena', !!arena);
  ui.respawn.disabled = true;
  closeChat();
  const until = performance.now() + (ms || 0);
  clearInterval(deathTimer);
  const tickDeath = () => {
    const left = Math.ceil((until - performance.now()) / 1000);
    if (left > 0) {
      ui.deathTimer.textContent = arena ? `Derrota no treino. Você volta na entrada da arena em ${left} s` : `Você poderá renascer em ${left} s`;
    } else {
      ui.deathTimer.textContent = arena ? 'Pronto para voltar à entrada da arena.' : 'Pronto para voltar ao centro do mapa.';
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
  const rec = state.arenaRecord;
  const zone = state.inSafeZone ? 'zona segura · ' : state.inArena ? `⚔️ arena${rec ? ` ${rec.wins}V ${rec.losses}D` : ''} · ` : '';
  const ping = state.pingMs ? ` · ${state.pingMs} ms` : '';
  setStatus(`${n} ${n === 1 ? 'jogador' : 'jogadores'}${ping}`, 'ok', `online · ${where ? `${where} · ` : ''}${zone}`);
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
  // Mapas em imagem (layout.art): o chão, as paredes e os enfeites já estão na arte; as paredes deles só dão colisão.
  state.arts = artPlaces(state.places);
  // Paredes de cima para baixo: o que está mais embaixo é desenhado por cima (3/4).
  state.walls = visibleWalls(state.places).sort((a, b) => a.y + a.h - (b.y + b.h));
  const drawn = state.walls.filter((w) => !w.art);
  const deco = visibleDeco(state.places).filter((d) => !d.art);
  state.deco = deco.filter((d) => d.k !== 'gate_roof' && d.k !== 'door' && d.k !== 'oak_canopy');
  state.overhead = deco.filter((d) => d.k === 'gate_roof' || d.k === 'oak_canopy');
  // Pedras-Selo acesas: o halo que respira é desenhado a cada quadro (o resto da pedra fica no bloco do chão).
  state.glows = drawn.filter((w) => w.k === 'seal' && w.s !== 'out');
  // Luzes quentes que tremem a cada quadro: as lanternas da mureta da arena (a lanterna fica no bloco do chão) e as
  // tochas e lanternas desenhadas na arte dos mapas em imagem (layout.lights: a chama; a poça de luz fica embaixo).
  state.lights = drawn.filter((w) => w.k === 'fence').flatMap((w) => fenceLanterns(w).map((l) => ({
    x: l.x, y: w.w >= w.h ? w.y + w.h : l.y + 0.25,
  }))).concat(state.places.flatMap((pl) => (pl.map.lights || []).map((l) => ({ x: l.x + pl.ox, y: l.y + pl.oy + 1.25 }))));
  // Janelas e lanternas das casas: acendem de noite.
  state.windows = drawn.filter((w) => w.k === 'house').flatMap(buildingLights);
  // Arenas à vista (as do mapa atual): os holofotes.
  state.arenaBoxes = state.places.flatMap((pl) => (pl.map.arenas || []).map((a) => ({ x: a.x + pl.ox, y: a.y + pl.oy, w: a.w, h: a.h })));
  state.props = makeProps(drawn);
  state.doors = deco.filter((d) => d.k === 'door');      // Academia: abrem conforme o tutorial (desenho a cada quadro)
  state.fields = layout.fields || [];                     // Sala de Controle: o campo que drena o chakra
  state.npcs = state.allNpcs.filter((n) => n.map === id && npcVisible(n));
  state.nearNpc = null;
  ui.talkBtn.hidden = true;
  const me = state.players.get(state.meId);
  if (me) me.map = id;
  if (changed) {
    closeShop();
    eg.closeTravel();
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

/** `detail` (onde está, zona) some no celular, onde o status fica pequeno no canto (hud.css, .st-detail). */
function setStatus(text, kind, detail = '') {
  ui.status.replaceChildren();
  if (detail) {
    const d = document.createElement('span');
    d.className = 'st-detail';
    d.textContent = detail;
    ui.status.append(d);
  }
  ui.status.append(text);
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
  if (e.key >= '1' && e.key <= '4' && !e.repeat) {
    // Em linha: segurar a tecla mira (a direção segue o mouse); soltar lança. Toque rápido: o servidor mira no foco.
    const button = ui.slots[Number(e.key) - 1];
    const skill = button?.dataset.skill;
    if (skill && isLineSkill(skill) && !aim && !state.me.dead) startAim(skill, button, { key: e.key });
    else castSlot(Number(e.key) - 1);
  }
  if (e.key === 'Escape' && aim) { endAim(false); return; }
  if (e.key === 'x' || e.key === 'X') setFocus(null);
  if (e.key === ' ') { basicAttack(); e.preventDefault(); }
  if (e.key === 'q' || e.key === 'Q') switchKit();
  if (e.key === 'r' || e.key === 'R') toggleRun();
  if (e.key === 'c' || e.key === 'C') (ui.statusPanel.hidden ? openStatus() : closeStatus());
  if (e.key === 'Enter' && !ui.hud.hidden) { openChat(); e.preventDefault(); }
  if (e.key === 't' || e.key === 'T' || e.key === 'Tab') { cycleFocus(); e.preventDefault(); }
  if (e.key === 'm' || e.key === 'M') toggleMeditation();
  if (e.key === 'e' || e.key === 'E') talkToNpc();
  if (e.key === 'j' || e.key === 'J') (ui.missionsPanel.hidden ? openMissions() : closeMissions());
  if (e.key === 'i' || e.key === 'I') (ui.invPanel.hidden ? openInventory() : closeInventory());
  if (e.key === 'h' || e.key === 'H') (ui.historyPanel.hidden ? openHistory() : closeHistory());
  if (e.key === 'Escape') { closeShop(); closeInventory(); closeClassChoice(); closeKage(); closeBoard(); closeHistory(); }
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code] && keys.delete(e.code)) keyDirection();
  if (aim && aim.key === e.key) endAim(true);
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
  slam: { color: '#7a5a3a', ms: 520 },     // golpe marcado caiu: anel de impacto no chão (fx = raio)
};
const GROUND_FX = new Set(['shadow', 'water', 'log', 'slam']);
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

/** Ninja que pode ser alvo agora: os dois dentro da arena da vila (o servidor confere de novo). */
function isFoe(p) {
  const me = state.players.get(state.meId);
  if (!p || p === me || p.map !== state.mapId) return false;
  const map = state.maps[state.mapId];
  return arenaFoes(map, me, p) || zoneFoe(state.endgame, map, me, p, (x, y) => inSafeZone(map, x, y));
}

/** Na Zona de Conflito (PvP livre): o foco e os nomes em vermelho valem para os inimigos. */
const inConflict = () => !!state.maps[state.mapId]?.conflict && egOn(state.endgame, 'pvp');

/** Posto de Viagem só aparece com o módulo de vilas ligado. */
const npcVisible = (n) => n.role !== 'travel' || egOn(state.endgame, 'vilas');

/** Acesso aos mapas na PREDIÇÃO: a mesma regra do servidor (vila proibida = parede). */
function updateAccess() {
  pred.gates.access = mapAccess(state.endgame, state.players.get(state.meId)?.faction);
}

/** O efeito na tela de cada poder da Akatsuki (os mesmos desenhos dos jutsus). Argila e Papel: o projétil já é o efeito. */
const POWER_FX = { pull: 'illusion', crows: 'illusion', strings: 'shadow', hearts: 'stone', mask: 'substitution', roots: 'teleport', drain: 'heal', lifesteal: 'heal' };

/** Aliado que dá para focar (para a Cura e os jutsus de apoio): outro ninja do mapa, vivo, que não é inimigo. */
function isAlly(p) {
  return !!p && p.id !== state.meId && p.map === state.mapId && !p.dead && !isFoe(p);
}

/** O alvo focado: um monstro, um ninja inimigo (arena, Zona de Conflito) ou um aliado. */
function focusEntity() {
  if (!state.focusId) return null;
  const m = state.monsters.get(state.focusId);
  if (m) return m;
  const p = state.players.get(state.focusId);
  return isFoe(p) || isAlly(p) ? p : null;
}

/**
 * Botão 🎯: foca o mais perto; com foco, passa para o próximo (ciclo). Primeiro os inimigos (monstros e, na arena e na
 * Zona de Conflito, os ninjas inimigos), do mais perto para o mais longe; depois os aliados (para a Cura).
 */
function cycleFocus() {
  const me = state.players.get(state.meId);
  if (!me || state.me.dead) return;
  const foes = [...state.monsters.values()].filter((m) => m.map === state.mapId);
  const allies = [];
  for (const p of state.players.values()) {
    if (isFoe(p)) foes.push(p);
    else if (isAlly(p)) allies.push(p);
  }
  const id = nextFocus(me, foes, allies, state.focusId, FOCUS_RANGE);
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
// ✕ ao lado do alvo focado: para de focar (monstro, inimigo ou aliado). No teclado: X.
onTap(document.getElementById('target-clear'), () => setFocus(null));
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
  renderTracker();
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
    const sensei = state.npcs.find((n) => n.role === 'sensei');
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
  // Capas só com o banco do fim de jogo (v11): sem ele, o servidor nem manda o estado `endgame`.
  const forSale = (state.world.items || []).filter((i) => i.shop === shop.kind && (i.kind !== 'cape' || state.endgame));
  // Fim de jogo: guerra deixa as lojas da vila +10%, aliança −5% (o banco cobra o mesmo).
  const factor = shopFactor(state.endgame, state.players.get(state.meId)?.faction);
  const priceOf = (item) => Math.ceil(item.price * factor);
  ui.shopItems.replaceChildren(...forSale.map((item) => {
    const li = document.createElement('li');
    const i = document.createElement('span');
    i.className = 'ico';
    const ic = document.createElement('canvas');           // o mesmo ícone em pixel art da Mochila
    ic.width = ic.height = 64;
    ic.className = 'ico-px';
    drawItemIcon(ic, item.code);
    i.append(ic);
    const n = document.createElement('span');
    n.className = 'name';
    n.textContent = item.name;
    const price = document.createElement('small');
    price.className = 'price';
    const have = state.ninja.items?.[item.code] || 0;
    price.textContent = `${ryoText(priceOf(item))}${item.damage ? ` · +${item.damage} de dano` : ''}${item.throw ? ' · de arremesso' : ''}${item.kind === 'cape' ? ' · capa' : item.kind === 'shoes' ? ' · sapato' : item.kind === 'accessory' ? ' · acessório (por cima da roupa)' : ''}${have ? ` · você tem ${have}` : ''}`;
    n.append(price);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-btn small';
    b.textContent = 'Comprar';
    b.disabled = (state.ninja.ryo || 0) < priceOf(item);
    b.addEventListener('click', () => {
      if (!tapGuard(`buy:${item.code}`)) return;
      send({ type: 'buy', item: item.code, qty: 1 });
    });
    li.append(i, n, b);
    return li;
  }));
  ui.shopNote.textContent = factor !== 1 ? `Preços da vila: ${factor > 1 ? '+' : ''}${Math.round((factor - 1) * 100)}% (${factor > 1 ? 'guerra' : 'aliança'}).`
    : forSale.length ? '' : 'Nada à venda agora.';
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
    // Proteção contra azar: cada falha seguida nesta classe e neste tier soma pontos na chance (o servidor conta).
    const fails = extractChoice.cls ? state.extractFailures?.[extractChoice.cls]?.[rule.level] || 0 : 0;
    const chance = Math.min(1, rule.chance + (state.world.extractionPityStep || 0) * fails);
    const luck = fails > 0 ? ` (${Math.round(rule.chance * 100)}% + ${Math.round((chance - rule.chance) * 100)}% de sorte acumulada)` : '';
    ui.extractInfo.textContent = `Custa ${rule.scrolls} ${rule.scrolls === 1 ? 'pergaminho' : 'pergaminhos'} · chance de ${Math.round(chance * 100)}%${luck} · jutsu do Tier ${rule.level}. Você tem ${have}.`;
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
  const text = r.outcome === 'success' ? `✨ Sucesso! Você aprendeu ${skillName(r.jutsu)}. Coloque no kit (☰ → Perfil → Kits).`
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

/*
 * Equipamentos de Shinobi (a 🎒 Mochila): o boneco com o que está vestido, os espaços em volta, os atributos e a
 * grade do inventário. Escolher um item na grade e tocar em Equipar (ou tocar duas vezes no item) só PEDE ao
 * servidor; a tela muda quando ele confirma (inventory).
 */
let eqSel = null;            // código do item escolhido na grade
let eqDir = 0;               // para onde o boneco grande olha (o ↻ gira)
/** O boneco grande da tela de equipamentos (o giro dele é dele, não o do boneco no mapa). */
const equipDoll = {};
let eqFigureAt = 0;

/** Como cada tipo de item vai no boneco: o espaço, o pedido ao servidor e o nome do botão. */
const EQUIP_KIND = {
  weapon: { slot: 'weapon', current: (n) => n.equipped, send: (code) => ({ type: 'equip', item: code }), on: 'Guardar', off: 'Equipar' },
  scroll: { slot: 'scroll', current: (n) => n.equippedScroll, send: (code) => ({ type: 'equip', item: code, slot: 'scroll' }), on: 'Tirar', off: 'Nas costas' },
  cape: { slot: 'cape', current: (n) => n.cape, send: (code) => ({ type: 'equip', item: code, slot: 'cape' }), on: 'Tirar', off: 'Vestir' },
  shoes: { slot: 'feet', current: (n) => n.equippedShoes, send: (code) => ({ type: 'equip', item: code, slot: 'feet' }), on: 'Descalçar', off: 'Calçar' },
  accessory: { slot: 'accessory', current: (n) => n.equippedAccessory, send: (code) => ({ type: 'equip', item: code, slot: 'body' }), on: 'Tirar', off: 'Vestir' },
};
/** O que está no espaço `slot` da tela (arma, pergaminho, capa ou sapato). */
const slotItem = (n, slot) => Object.values(EQUIP_KIND).find((k) => k.slot === slot)?.current(n) ?? null;
const ATTR_ROWS = [['vitality', '❤️', 'Vitalidade'], ['chakra', '💧', 'Chakra'], ['agility', '💨', 'Agilidade'],
  ['taijutsu', '👊', 'Taijutsu'], ['ninjutsu', '🌀', 'Ninjutsu'], ['weapons', '🗡️', 'Armas']];

/*
 * Ícones das capas em pixel art (32 x 32, ampliados sem borrar): a mesma capa vista de frente, com a gola, a abertura
 * do meio e a barra ondulada; cada uma com as suas cores e o seu desenho (a folha da vila, as chamas do Kage, as
 * nuvens da Akatsuki, o louro do Campeão).
 */
const CAPE_ICONS = {
  capa_viagem: { base: '#8a6a44', light: '#a8865a', dark: '#5e4628', edge: '#2e2012', lining: '#3e2c18', trim: '#c9a46a' },
  capa_vila: { base: '#2f6a3a', light: '#3f8a4c', dark: '#1f4a28', edge: '#0e2414', lining: '#16321c', trim: '#d9b25a', motif: 'leaf' },
  manto_kage: { base: '#ece6da', light: '#ffffff', dark: '#c9c0b0', edge: '#5a5048', lining: '#a8302a', trim: '#c8261e', motif: 'flames' },
  manto_akatsuki: { base: '#1a1a24', light: '#2c2c3a', dark: '#0c0c12', edge: '#000000', lining: '#5a1414', trim: '#c8261e', motif: 'clouds' },
  manto_campeao: { base: '#4a2a7a', light: '#6a42a0', dark: '#2e1850', edge: '#140a24', lining: '#d9b25a', trim: '#f2d58c', motif: 'laurel' },
};
const capeIconCache = new Map();
function capeIcon(code) {
  if (capeIconCache.has(code)) return capeIconCache.get(code);
  const P = CAPE_ICONS[code];
  if (!P) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const px = (x, y, color) => { g.fillStyle = color; g.fillRect(x, y, 1, 1); };
  const half = (y) => (y < 8 ? 4 : Math.min(11, 4 + Math.round((y - 7) * 0.62)));
  for (let y = 5; y <= 28; y++) {                       // o corpo, com a beira escura
    const hw = half(y), hem = y >= 27 ? 1 : 0;
    for (let x = 16 - hw; x < 16 + hw; x++) {
      if (y === 28 && (x % 2 === 0)) continue;           // barra ondulada
      const edge = x === 16 - hw || x === 16 + hw - 1 || y === 28 || (y === 27 && x % 2 === 0);
      px(x, y, edge ? P.edge : x < 16 - hw + 3 ? P.light : x > 16 + hw - 4 ? P.dark : P.base);
    }
    void hem;
  }
  for (let y = 9; y <= 27; y++) {                       // a abertura do meio (o forro aparece)
    const w = y < 20 ? 1 : 2;
    for (let x = 16 - w; x < 16 + w; x++) px(x, y, P.lining);
  }
  for (let x = 12; x < 20; x++) { px(x, 4, P.edge); px(x, 5, P.trim); px(x, 6, P.trim); }   // a gola
  px(11, 5, P.edge); px(20, 5, P.edge); px(11, 6, P.edge); px(20, 6, P.edge);
  px(15, 7, P.trim); px(16, 7, P.trim);                 // o broche
  if (P.motif === 'leaf') {                             // a folha da vila no peito
    for (const [x, y] of [[11, 12], [12, 11], [12, 12], [12, 13], [13, 12], [13, 13], [14, 14]]) px(x, y, P.trim);
  } else if (P.motif === 'flames') {                    // chamas vermelhas na barra
    for (let x = 6; x < 26; x += 3) for (let k = 0; k < 4; k++) px(x + (k % 2), 26 - k, P.trim);
  } else if (P.motif === 'clouds') {                    // nuvens vermelhas com borda branca
    for (const [cx, cy] of [[11, 14], [20, 20], [10, 23]]) {
      for (const [dx, dy] of [[-1, 0], [0, -1], [1, -1], [2, 0], [1, 0], [0, 0]]) px(cx + dx, cy + dy, P.trim);
      for (const [dx, dy] of [[-2, 0], [-1, -1], [0, -2], [1, -2], [2, -1], [3, 0]]) px(cx + dx, cy + dy, '#f4ecd8');
    }
  } else if (P.motif === 'laurel') {                    // o louro dourado e a barra dourada
    for (let y = 10; y < 26; y += 2) { px(9 + Math.round((y - 10) * -0.1), y, P.trim); px(22, y, P.trim); }
    for (let x = 6; x < 26; x++) if (x % 2) px(x, 27, P.trim);
  }
  capeIconCache.set(code, c);
  return c;
}

/** Cor da classe (o selo no pergaminho de classe). */
const CLASS_TINT = {
  fire: '#e8572f', water: '#3c9be0', lightning: '#f2d25a', taijutsu: '#d9a441', illusion: '#9a6be0',
  shadow: '#5a4f83', stone: '#8a6a45', heal: '#4fbf6a', weapons: '#b8b8c8',
};

/** O ícone de um item num canvas: a pixel art da arma, do pergaminho (com o selo da classe), da capa ou do sapato. */
function drawItemIcon(c, code) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = false;
  if (drawShoeIcon(g, code, c.width, c.height)) return;   // o sapato é a própria camada do boneco
  const cape = capeIcon(code);
  if (cape) {
    const s = Math.floor(Math.min(c.width, c.height) / 32);
    g.drawImage(cape, 0, 0, 32, 32, (c.width - 32 * s) / 2, (c.height - 32 * s) / 2, 32 * s, 32 * s);
    return;
  }
  if (drawWeaponIcon(g, code, c.width, c.height)) {
    const cls = code.startsWith('scroll_') ? code.slice(7) : null;
    if (cls && CLASS_TINT[cls]) {                       // o selo da classe no meio do pergaminho
      const r = c.width * 0.075;
      g.fillStyle = '#1a120a';
      g.beginPath(); g.arc(c.width / 2, c.height / 2, r + 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = CLASS_TINT[cls];
      g.beginPath(); g.arc(c.width / 2, c.height / 2, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255, 255, 255, 0.5)';
      g.beginPath(); g.arc(c.width / 2 - r * 0.3, c.height / 2 - r * 0.3, r * 0.35, 0, Math.PI * 2); g.fill();
    }
    return;
  }
  const def = itemDef(code);
  g.font = `${Math.round(c.width * 0.62)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(def?.icon || '📦', c.width / 2, c.height / 2 + c.height * 0.04);
}

/** Pedaço do próprio boneco (cabeça com a bandana, a roupa, a calça) para os espaços do visual. */
const LOOK_CROPS = { head: [10, 10, 44, 46], chest: [14, 52, 36, 26], legs: [16, 68, 32, 26] };
function drawLookIcon(c, look, part) {
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const tmp = figureCanvas(look);
  const [x, y, w, h] = LOOK_CROPS[part];
  const s = Math.min(c.width / w, c.height / h);
  g.imageSmoothingEnabled = false;
  g.drawImage(tmp, x, y, w, h, (c.width - w * s) / 2, (c.height - h * s) / 2, w * s, h * s);
}

/** Itens que dá para escolher na grade: os do inventário e os mantos do cargo (Kage, Akatsuki), que não ficam nele. */
function equipEntries() {
  const n = state.ninja;
  const list = Object.entries(n.items || {}).filter(([, q]) => q > 0);
  const f = state.players.get(state.meId)?.faction;
  for (const [code, has] of [['manto_kage', !!f?.kage], ['manto_akatsuki', !!f?.akatsuki]]) if (has && !(n.items || {})[code]) list.push([code, 1]);
  return list;
}

function renderInventory() {
  const n = state.ninja;
  ui.invBadge.textContent = ryoText(n.ryo);
  ui.ryoText.textContent = ryoText(n.ryo).replace(/\s*ryō$/, '');
  ui.invToggle.setAttribute('aria-label', `Equipamentos e inventário: ${ryoText(n.ryo)}`);
  ui.invRyo.textContent = ryoText(n.ryo);
  const cls = (code) => state.world.classes?.find((c) => c.code === code);
  const p = cls(n.classes?.primary), s2 = cls(n.classes?.secondary);
  ui.invClass.textContent = p ? `Classe: ${p.icon} ${p.name}${s2 ? ` · ${s2.icon} ${s2.name}` : ''}` : 'Sem classe (Missão de Genin no nível 11)';
  if (ui.invPanel.hidden) return;                 // o resto só com a tela aberta
  const entries = equipEntries();
  if (eqSel && !entries.some(([code]) => code === eqSel)) eqSel = null;
  ui.invEmpty.hidden = entries.length > 0;
  ui.invItems.replaceChildren(...entries.map(([code, qty]) => {
    const def = itemDef(code);
    const kind = EQUIP_KIND[def?.kind];
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'eq-cell';
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(code === eqSel));
    b.setAttribute('aria-label', `${def?.name || code}${qty > 1 ? `, ${qty}` : ''}`);
    b.title = def?.name || code;
    if (kind && kind.current(n) === code) b.classList.add('equipped');
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    drawItemIcon(c, code);
    b.append(c);
    if (qty > 1 || (def && !kind)) {
      const q = document.createElement('span');
      q.className = 'eq-qty';
      q.textContent = `x${qty}`;
      b.append(q);
    }
    b.addEventListener('click', () => { eqSel = code; renderInventory(); });
    b.addEventListener('dblclick', () => { eqSel = code; equipSelected(); });
    li.append(b);
    return li;
  }));
  // os espaços em volta do boneco
  const look = state.me.look || state.players.get(state.meId)?.look;
  for (const el of ui.invPanel.querySelectorAll('.eq-slot')) {
    const slot = el.dataset.slot, c = el.querySelector('canvas');
    if (el.classList.contains('locked')) { el.title = 'Em breve'; continue; }
    const code = slotItem(n, slot);
    el.classList.toggle('filled', !!code || ['head', 'chest', 'legs'].includes(slot));
    let sub = el.querySelector('.eq-sub');
    if (code) {
      drawItemIcon(c, code);
      el.title = itemDef(code)?.name || code;
    } else if (look && ['head', 'chest', 'legs'].includes(slot)) {
      drawLookIcon(c, look, slot);
      el.title = 'Visual: toque para mudar no Criador';
    } else {
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
      el.title = slot === 'feet' ? 'Descalço' : 'Vazio';
    }
    if (slot === 'weapon') {                      // o nome da arma embaixo, como no desenho
      if (!sub) { sub = document.createElement('span'); sub.className = 'eq-sub'; el.append(sub); }
      sub.textContent = code ? (itemDef(code)?.name || code) : 'Mãos vazias';
    }
  }
  // nível, rank, atributos e barras
  const pr = state.progress, m = state.me;
  ui.equipLevel.textContent = pr ? `Nível ${pr.level}` : 'Nível 1';
  ui.equipRank.textContent = m.rank?.name || 'Academia';
  const rows = ATTR_ROWS.map(([key, icon, name]) => {
    const li = document.createElement('li');
    const i = document.createElement('i');
    i.className = 'eq-ico';
    i.textContent = icon;
    const label = document.createElement('span');
    label.textContent = name;
    const val = document.createElement('b');
    val.textContent = String(pr?.attributes?.[key] ?? 0);
    li.append(i, label, val);
    return li;
  });
  if (pr?.statPoints > 0) {
    const li = document.createElement('li');
    li.className = 'points';
    const i = document.createElement('i');
    i.className = 'eq-ico';
    i.textContent = '✨';
    const label = document.createElement('span');
    label.textContent = 'Pontos livres (Perfil)';
    const val = document.createElement('b');
    val.textContent = String(pr.statPoints);
    li.append(i, label, val);
    rows.push(li);
  }
  ui.equipAttrs.replaceChildren(...rows);
  const bar = (fill, text, v, max) => {
    fill.style.transform = `scaleX(${max ? Math.max(0, Math.min(1, v / max)) : 0})`;
    text.textContent = `${v}/${max}`;
  };
  bar(ui.equipHpFill, ui.equipHp, m.hp ?? 0, m.maxHp ?? 0);
  bar(ui.equipChFill, ui.equipCh, m.chakra ?? 0, m.maxChakra ?? 0);
  bar(ui.equipXpFill, ui.equipXp, pr?.xpInLevel ?? 0, pr?.xpToNext ?? 0);
  // os botões do item escolhido
  const def = eqSel && itemDef(eqSel), kind = def && EQUIP_KIND[def.kind];
  ui.equipDo.disabled = !kind;
  ui.equipDo.textContent = kind && kind.current(n) === eqSel ? kind.on : kind ? kind.off : 'Equipar';
  ui.equipInfo.disabled = !eqSel;
  if (!eqSel) ui.equipDetail.textContent = entries.length ? 'Escolha um item na grade.' : '';
  drawEquipFigure(performance.now(), true);
}

/** Equipar / guardar o item escolhido (só pede ao servidor). */
function equipSelected() {
  const def = eqSel && itemDef(eqSel), kind = def && EQUIP_KIND[def.kind];
  if (!kind || !state.connected) return;
  send(kind.send(kind.current(state.ninja) === eqSel ? null : eqSel));
}
ui.equipDo.addEventListener('click', equipSelected);
ui.equipInfo.addEventListener('click', () => {
  const def = eqSel && itemDef(eqSel);
  if (!eqSel) return;
  const qty = (state.ninja.items || {})[eqSel] ?? 1;
  const name = document.createElement('b');
  name.textContent = def?.name || eqSel;
  const more = def?.kind === 'weapon' ? ` · arma · +${def.damage} de dano · ${weaponWhere(def)}`
    : def?.kind === 'scroll' ? ' · pergaminho (pode ir nas costas)'
      : def?.kind === 'cape' ? ' · capa (todos veem; dá para esconder no ⚙️)'
        : def?.kind === 'shoes' ? ' · sapato (vai nos pés; todos veem)'
          : def?.kind === 'accessory' ? ' · acessório (por cima da roupa; todos veem)' : ` · ×${qty}`;
  ui.equipDetail.replaceChildren(name, document.createTextNode(more));
});
ui.equipTurn.addEventListener('click', () => { eqDir = [0, 1, 3, 2][([0, 1, 3, 2].indexOf(eqDir) + 1) % 4]; drawEquipFigure(performance.now(), true); });
for (const el of ui.invPanel.querySelectorAll('.eq-slot')) {
  el.addEventListener('click', () => {
    const slot = el.dataset.slot, n = state.ninja;
    if (el.classList.contains('locked')) { ui.equipDetail.textContent = 'Este espaço chega numa próxima versão.'; return; }
    if (['head', 'chest', 'legs'].includes(slot)) { closeInventory(); openCreator(false); return; }
    const code = slotItem(n, slot);
    if (code) { eqSel = code; renderInventory(); }
    else if (slot === 'feet') ui.equipDetail.textContent = 'Descalço. Os sapatos são vendidos na Alfaiataria.';
    else if (slot === 'accessory') ui.equipDetail.textContent = 'Nenhum acessório. Os casacos com capuz são vendidos na Alfaiataria.';
  });
}
for (const tab of ui.invPanel.querySelectorAll('.eq-tab')) {
  tab.addEventListener('click', () => {
    const stats = tab.dataset.eqtab === 'stats';
    ui.invPanel.classList.toggle('show-stats', stats);
    for (const t of ui.invPanel.querySelectorAll('.eq-tab')) {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', String(t === tab));
    }
  });
}

/** O boneco grande da tela (com a arma, o pergaminho e a capa), respirando parado. Redesenha a cada ~150 ms aberto. */
function drawEquipFigure(now, force = false) {
  if (ui.invPanel.hidden || (!force && now - eqFigureAt < 150)) return;
  eqFigureAt = now;
  const me = state.players.get(state.meId);
  if (!me) return;
  const look = state.me.look || me.look;
  const c = ui.equipFigure, g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const saved = dpr;
  dpr = 1;                                        // canvas próprio, 1:1: escala 3 inteira (T = 184)
  try {
    Object.assign(equipDoll, { ...me, moving: false, act: null, meditating: false, thrown: null, _fig: equipDoll._fig });
    drawSpriteCharacter(g, equipDoll, c.width / 2, 196, 184, look, eqDir, now, me.gear);
  } finally {
    dpr = saved;
  }
}

function openInventory() {
  closeSettings();
  closeStatus();
  closeMissions();
  closeShop();
  closePlayerMenu();
  closeBoard();
  closeHistory();
  ui.invPanel.hidden = false;
  ui.invToggle.setAttribute('aria-expanded', 'true');
  renderInventory();
}
function closeInventory() {
  ui.invPanel.hidden = true;
  ui.invToggle.setAttribute('aria-expanded', 'false');
}
ui.invToggle.addEventListener('click', () => (ui.invPanel.hidden ? openInventory() : closeInventory()));
ui.invClose.addEventListener('click', closeInventory);

// ------------------------------------------------------------------ fim de jogo (v16): painéis em endgame.js

const eg = mountEndgameUI({
  send,
  toast: (text) => showToast(text, 3500),
  view: () => state.endgame,
  me: () => state.players.get(state.meId),
  ninja: () => state.ninja,
  focusId: () => state.focusId,
  aim: () => (dir.x !== 0 || dir.y !== 0 ? [Math.round(dir.x * 100) / 100, Math.round(dir.y * 100) / 100] : null),
  closeOthers: () => { closeSettings(); closeStatus(); closeMissions(); closeShop(); closePlayerMenu(); closeBoard(); closeHistory(); closeInventory(); adminUI.close(); },
});

// ------------------------------------------------------------------ painel do admin (v19): adminPanel.js

const adminUI = mountAdminUI({
  send,
  ninja: () => state.ninja,
  world: () => state.world,
  myName: () => state.players.get(state.meId)?.username || '',
  drawItemIcon,
  closeOthers: () => { closeSettings(); closeStatus(); closeMissions(); closeShop(); closePlayerMenu(); closeBoard(); closeHistory(); closeInventory(); eg.close?.(); },
});

// ⚙️ O que os outros veem no boneco (capa, arma, pergaminho): só PEDE; o servidor manda o boneco novo a todos.
const displayBoxes = { cape: $('show-cape'), weapon: $('show-weapon'), scroll: $('show-scroll') };
for (const box of Object.values(displayBoxes)) {
  box.addEventListener('change', () => {
    const display = { cape: displayBoxes.cape.checked, weapon: displayBoxes.weapon.checked, scroll: displayBoxes.scroll.checked };
    state.ninja.display = display;
    send({ type: 'set_display', ...display });
  });
}
function renderDisplayBoxes() {
  const d = state.ninja.display || { cape: true, weapon: true, scroll: true };
  for (const [k, box] of Object.entries(displayBoxes)) box.checked = d[k] !== false;
}

// ------------------------------------------------------------------ Diretor: classe e Kage

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

function openKage() { ui.kagePanel.hidden = false; }
function closeKage() { ui.kagePanel.hidden = true; }
ui.kageClose.addEventListener('click', closeKage);
ui.kageApply.addEventListener('click', () => {
  if (!tapGuard('kage')) return;
  send({ type: 'kage_apply' });
  state.ninja.kageCandidate = true;   // só esconde o botão; quem registra é o servidor
  closeKage();
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
  renderTracker();
  // Na Academia, antes de acabar o tutorial: a aba "Missões" do chat abre sozinha (uma vez), com o passo da vez.
  if (inAcademy && step < 4 && !chatTabTouched) showChatMissions(true);
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
  closeKage();
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
      : (skillPrice(skill)?.cooldownMs ?? 600));
  cooldowns[skill] = { until: performance.now() + ms, ms };
}

/** v28: na arena e na Zona de Conflito, o Taijutsu e as Armas custam e recarregam mais (o servidor manda os números). */
function inPvpArea() {
  const me = state.players.get(state.meId);
  const map = state.maps[state.mapId];
  return !!map && (!!map.conflict || (!!me && !!arenaAt(map, me.x, me.y)));
}
function skillPrice(skill) {
  const base = state.world.skills?.[skill];
  if (!base) return undefined;
  const pvp = inPvpArea() ? state.world.pvpSkills?.[skill] : undefined;
  return pvp ? { ...base, cost: pvp.cost, cooldownMs: pvp.cooldownMs } : base;
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
    const cost = skillPrice(skill)?.cost;
    button.querySelector('.cost').textContent = cost !== undefined ? String(cost) : '';
    button.style.setProperty('--c', info ? info.color : 'transparent');
    button.classList.toggle('empty', !info);
    // Espaço vazio fica tocável: abre a aba Kits (☰ → Perfil → Kits), onde se escolhem os jutsus de cada kit.
    button.setAttribute('aria-label', info ? `${info.name}${info.mark} (${cost} de chakra) — tecla ${i + 1}` : `Espaço ${i + 1} vazio: toque para escolher os jutsus (☰ → Perfil → Kits)`);
  });
  ui.kitLabel.textContent = state.kit.active;
  ui.kitBtn.setAttribute('aria-label', `Trocar de kit (ativo: ${state.kit.active})`);
  renderSlots();
}

/** Botão apagado sem chakra; recarga desenhada no quadro (frame). */
function renderSlots() {
  const fx = skyHere();
  for (const button of ui.slots) {
    const info = skillPrice(button.dataset.skill);
    const cost = info?.cost ?? 0;
    const label = button.querySelector('.cost');
    if (label && info && label.textContent !== String(cost)) label.textContent = String(cost);
    button.classList.toggle('no-chakra', !!button.dataset.skill && (state.me.chakra < cost || state.me.dead));
    // Clima e hora: ▲ o jutsu está mais forte agora, ▼ mais fraco (só ao ar livre).
    const k = fx && info ? (fx.damage[info.mechanic] ?? 1) * (fx.status[info.mechanic] ?? 1) : 1;
    button.classList.toggle('sky-up', k > 1.001);
    button.classList.toggle('sky-down', k < 0.999);
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
  eg.drawPowerCooldown(now);
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
  else openKits();
}

/** A aba Kits da ficha: cada jutsu aprendido com os botões A e B (até 4 em cada kit) e "Salvar kits". */
function openKits() {
  openStatus();
  showTab('kits');
}
function castSkill(skill, aimDir) {
  const mech = mechanicOf(skill);
  if (!SKILLS[mech] || !state.connected || state.me.dead || !tapGuard(skill)) return;
  if (aimDir) {
    // Habilidade em linha com a direção escolhida (segurou e arrastou): cima, baixo, esquerda ou direita.
    return send(state.focusId ? { type: 'cast', skill, targetId: state.focusId, dir: aimDir } : { type: 'cast', skill, dir: aimDir });
  }
  if (mech === 'teleport') {
    // Teleporte Curto: para onde o joystick aponta (ou para onde o boneco olha). O ALCANCE é do servidor.
    const me = state.players.get(state.meId);
    const d = dir.x || dir.y ? [quantize(dir.x), quantize(dir.y)] : DIR_VECTOR[me?.dir ?? 0];
    return send({ type: 'cast', skill, dir: d });
  }
  // Jutsu direcionado: com alvo focado, vai o targetId (o servidor mira e confere o alcance).
  // Substituição Nível 4: aparece atrás do alvo focado (o servidor confere o nível).
  // Cura: com um aliado focado, vai nele (o servidor confere se está perto).
  const targetId = (DIRECTED.has(mech) || mech === 'substitution' || mech === 'heal') && state.focusId ? state.focusId : undefined;
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

/** Ataque Básico: sem chakra; vai no focado (se estiver perto) ou no mais perto. Ninguém perto: sai e erra. */
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
ui.slots.forEach((button, i) => bindSkillButton(button, i));

// ------------------------------------------------------------------ mira das habilidades em linha (aim.js)

/**
 * Mira em andamento (só uma por vez): o botão segurado (ou a tecla 1 a 4), desde quando, se já arrastou, se cancelou
 * e a direção (cardinal). Fogo, Sombra, Relâmpago e Kunais só saem nas 4 direções: segurar e arrastar escolhe para qual
 * (a prévia ciano mostra o caminho); toque rápido deixa o servidor mirar no focado; arrastar e voltar ao meio cancela.
 */
let aim = null;
/** Onde está o mouse (PC: segurando 1 a 4, a direção segue o mouse, como no LoL). */
const mouse = { x: 0, y: 0, seen: false };
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.seen = true;
});

const isLineSkill = (skill) => !!state.world.skills?.[skill]?.line;

function bindSkillButton(button, i) {
  button.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    if (hud.editing) return;          // modo "Editar layout": o toque arrasta, não ataca
    const skill = button.dataset.skill;
    if (!skill || !isLineSkill(skill) || aim) return castSlot(i);
    try { button.setPointerCapture(e.pointerId); } catch { /* sem captura: o botão ainda recebe o soltar em cima dele */ }
    startAim(skill, button, { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY });
  });
  button.addEventListener('pointermove', (e) => {
    if (!aim || aim.pointerId !== e.pointerId) return;
    e.preventDefault();
    const scale = hud.btnScale || 1;
    moveAim(e.clientX - aim.x0, e.clientY - aim.y0, scale);
  });
  const release = (e) => { if (aim && aim.pointerId === e.pointerId) endAim(true); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', (e) => { if (aim && aim.pointerId === e.pointerId) endAim(false); });
  button.addEventListener('lostpointercapture', (e) => { if (aim && aim.pointerId === e.pointerId) endAim(true); });
  button.addEventListener('click', (e) => { if (e.detail === 0 && !hud.editing) castSlot(i); });   // teclado / leitor de tela
}

function startAim(skill, button, from) {
  aim = { skill, button, since: performance.now(), dragged: false, canceled: false, dir: null, pointerId: null, key: null, x0: 0, y0: 0, ...from };
  button.classList.add('aiming');
}

/** O dedo arrastou (dx, dy) px desde que segurou: o botão vira um joystick pequeno (o ícone acompanha o dedo). */
function moveAim(dx, dy, scale = 1) {
  const r = dragAim(dx / scale, dy / scale, aim.dragged);
  aim.dragged = r.dragged;
  aim.canceled = r.canceled;
  if (r.dir) aim.dir = r.dir;
  const len = Math.hypot(dx, dy), max = 22 * scale, k = len > max ? max / len : 1;
  aim.button.style.setProperty('--aim-x', `${Math.round(dx * k)}px`);
  aim.button.style.setProperty('--aim-y', `${Math.round(dy * k)}px`);
  aim.button.classList.toggle('aim-cancel', aim.canceled);
}

/** Soltou: lança na direção escolhida (ou na automática, se segurou sem arrastar); toque rápido: o servidor mira. */
function endAim(cast) {
  const a = aim;
  aim = null;
  if (!a) return;
  a.button.classList.remove('aiming', 'aim-cancel');
  a.button.style.removeProperty('--aim-x');
  a.button.style.removeProperty('--aim-y');
  if (!cast || a.canceled || state.me.dead) return;
  if (a.button.dataset.skill !== a.skill) return;                       // trocou de kit no meio da mira
  const held = performance.now() - a.since;
  if (a.dragged && a.dir) return castSkill(a.skill, a.dir);
  if (held >= HOLD_MS && a.dir) return castSkill(a.skill, a.dir);         // segurou vendo a prévia: vai onde ela mostrava
  castSkill(a.skill);                                                     // toque rápido
}

/** Inimigos à vista para a mira: monstros vivos do mapa e os ninjas que dá para atacar. */
function aimFoes() {
  const out = [];
  for (const m of state.monsters.values()) if (m.map === state.mapId && !m.diedAt && m.hp > 0) out.push(m);
  for (const p of state.players.values()) if (!p.dead && isFoe(p)) out.push(p);
  return out;
}

/** A cada quadro: a direção da mira (arrastada, a do mouse segurando a tecla, ou a automática) e a prévia. */
function updateAim(me) {
  if (!aim) return null;
  if (!me || state.me.dead || state.me.meditating) { endAim(false); return null; }
  const info = state.world.skills?.[aim.skill];
  if (!info) return null;
  if (aim.key && mouse.seen && lastView) {
    // PC: segurando a tecla, a direção segue o mouse (passou da zona morta em volta do boneco).
    const w = lastView.toWorld(mouse.x, mouse.y);
    const dx = (w.x - me.x) * lastView.T, dy = (w.y - me.y) * lastView.T;
    const r = dragAim(dx, dy, aim.dragged, 24);
    if (r.dir) { aim.dragged = true; aim.dir = r.dir; }
  }
  if (!aim.dragged) aim.dir = autoAim(me, focusEntity(), aimFoes(), info.range ?? 4, DIR_VECTOR[me.dir ?? 0]);
  if (aim.canceled) return null;
  if (!aim.dragged && performance.now() - aim.since < HOLD_MS) return null;   // toque rápido: sem prévia piscando
  const solid = state.walls.filter((w) => w.k !== 'pit');                       // o que voa passa por cima dos vãos
  return { info, mechanic: info.mechanic, ...aimPaths(me, aim.dir, info, solid, aimFoes(), state.world.width, state.world.height) };
}

/**
 * Prévia da mira (só para quem mira): o caminho em ciano quase transparente, as casas que ele pega (as do caminho
 * livre mais fortes; as que o alcance ainda teria, mais fracas), a explosão do Fogo, o alvo que vai ser atingido e
 * quantas casas.
 */
function drawAimPreview(view, toScreenX, toScreenY, T, now) {
  if (!view) return;
  const CY = (a) => `rgba(64, 232, 255, ${a})`;
  ctx.save();
  const lane = Math.max(4, T * 0.9);
  view.paths.forEach((p, i) => {
    const main = i === 0;
    // As casas: até onde vai (fortes) e o resto do alcance (fracas), só na trilha do meio.
    if (main) {
      const strong = tilesOnPath(p.from, p.to);
      const weak = tilesOnPath(p.from, p.reach).slice(strong.length);
      for (const c of weak) {
        ctx.fillStyle = CY(0.05);
        ctx.fillRect(toScreenX(c.x) + 2, toScreenY(c.y) + 2, T - 4, T - 4);
      }
      for (const c of strong) {
        ctx.fillStyle = CY(0.1);
        ctx.fillRect(toScreenX(c.x) + 1, toScreenY(c.y) + 1, T - 2, T - 2);
        ctx.strokeStyle = CY(0.3);
        ctx.lineWidth = 1;
        ctx.strokeRect(toScreenX(c.x) + 1.5, toScreenY(c.y) + 1.5, T - 3, T - 3);
      }
      p.tiles = strong.length;
    }
    // A faixa do caminho, com a ponta em seta.
    const x0 = toScreenX(p.from.x), y0 = toScreenY(p.from.y), x1 = toScreenX(p.to.x), y1 = toScreenY(p.to.y);
    const [ux, uy] = view.dir;
    ctx.strokeStyle = CY(main ? 0.2 : 0.15);
    ctx.lineWidth = lane;
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = CY(0.7);
    ctx.lineWidth = Math.max(1.5, T / 18);
    ctx.setLineDash([T / 4, T / 6]);
    ctx.lineDashOffset = -now / 30;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.setLineDash([]);
    const h = lane * 0.65;
    ctx.fillStyle = CY(0.55);
    ctx.beginPath();
    ctx.moveTo(x1 + ux * h * 0.6, y1 + uy * h * 0.6);
    ctx.lineTo(x1 - uy * h - ux * h * 0.4, y1 + ux * h - uy * h * 0.4);
    ctx.lineTo(x1 + uy * h - ux * h * 0.4, y1 - ux * h - uy * h * 0.4);
    ctx.closePath(); ctx.fill();
    // Fogo: a explosão no fim (ou no primeiro alvo).
    if (view.mechanic === 'fire' && view.info.radius) {
      ctx.fillStyle = CY(0.06);
      ctx.strokeStyle = CY(0.35);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x1, y1, view.info.radius * T, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // O alvo que o caminho pega: anel forte em volta dele.
    if (p.hit) {
      const r = T * 0.62 + Math.sin(now / 120) * T * 0.04;
      ctx.strokeStyle = CY(0.9);
      ctx.lineWidth = Math.max(2, T / 12);
      ctx.beginPath(); ctx.ellipse(toScreenX(p.hit.x), toScreenY(p.hit.y) + T * 0.1, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    }
  });
  // Quantas casas (e se acerta alguém), na ponta do caminho do meio.
  const p = view.paths[0];
  if (p) {
    const tiles = `${p.tiles} ${p.tiles === 1 ? 'casa' : 'casas'}`;
    const label = p.hit ? `${tiles} · acerta` : p.wall ? `${tiles} · parede` : tiles;
    // Na ponta do caminho, mas sempre dentro da tela (o caminho pode sair dela).
    const pad = T * 1.2;
    const x = Math.max(pad * 1.6, Math.min(viewW - pad * 1.6, toScreenX(p.to.x) + view.dir[0] * T * 0.9));
    const y = Math.max(pad, Math.min(viewH - pad * 2.5, toScreenY(p.to.y) + view.dir[1] * T * 0.9 - (view.dir[1] === 0 ? T * 0.55 : 0)));
    ctx.font = `700 ${Math.max(11, Math.round(T * 0.32))}px ${getComputedStyle(document.documentElement).getPropertyValue('--ui-font') || 'sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(4, 30, 40, 0.75)';
    ctx.strokeText(label, x, y);
    ctx.fillStyle = 'rgba(200, 250, 255, 0.95)';
    ctx.fillText(label, x, y);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ ficha (☰ → Perfil): atributos, jutsus e kits

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
  ui.statusBadge.textContent = pr.statPoints > 0 ? `+${pr.statPoints}` : '';
  ui.levelBadge.textContent = String(pr.level);
  ui.statusToggle.setAttribute('aria-label', `Perfil: nível ${pr.level}${pr.statPoints > 0 ? `, ${pr.statPoints} pontos para gastar` : ''}`);
  ui.xpStripFill.style.transform = `scaleX(${pr.xpToNext ? Math.min(1, pr.xpInLevel / pr.xpToNext) : 1})`;
  renderTracker();
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
  m: 'Masculino', f: 'Feminino', espetado: 'Espetado', longo_lateral: 'Longo', baguncado: 'Bagunçado', masculino: 'Sem cílios', cilios: 'Com cílios',
  basica: 'Camisa e calça', vila: 'Conjunto da vila', true: 'Com bandana', false: 'Sem',
};
const creatorLabel = (field, v) => (field === 'village' ? VILLAGE_NAMES[v] || String(v) : CREATOR_LABEL[String(v)] || String(v).replace(/_/g, ' '));
/**
 * Vila que dá para escolher: as abertas (o servidor manda) ou a que o jogador já tinha. As outras aparecem
 * travadas até o Arco 2 (o servidor recusa do mesmo jeito: VILLAGE_LOCKED).
 */
const villageOpen = (v) => (state.world.openVillages || ['vila_1']).includes(v) || (state.me.appearanceSet && state.me.look?.village === v);

function openCreator(first = false) {
  creatorFirst = first;
  creatorLook = { ...(state.me.look || DEFAULT_APPEARANCE) };
  if (!villageOpen(creatorLook.village)) creatorLook.village = (state.world.openVillages || ['vila_1'])[0];
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
  // Canvas 128x192 = a célula 64x96 em escala 2 (pixel art sem borrar), andando e virando suave entre as direções.
  const gear = state.players.get(state.meId)?.gear;
  const shoes = gear && 'feet' in gear ? gear.feet : DEFAULT_SHOES;     // o sapato que ele calça (não muda no Criador)
  creatorWalker.moving = true;
  creatorWalker.walk = phase;
  drawFigure(g, creatorWalker, 0, 0, 2, { ...creatorLook, shoes, accessory: gear?.body ?? null }, creatorDir, performance.now());
}
/** O boneco da prévia do Criador (guarda o giro suave entre uma direção e outra). */
const creatorWalker = { moving: true, walk: 0 };
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
      if (field === 'village' && !villageOpen(value)) {
        b.disabled = true;
        b.classList.add('locked');
        b.textContent = `🔒 ${creatorLabel(field, value)}`;
        b.title = 'Abre com o Arco 2';
        b.setAttribute('aria-label', `${creatorLabel(field, value)}: travada, abre com o Arco 2`);
      }
      b.addEventListener('click', () => setCreator(field, value));
      box.append(b);
    }
    row.append(name, box);
    return row;
  }));
}
loadVfx();       // folhas dos efeitos dos golpes (assets/vfx); até chegarem, os efeitos desenhados à mão
loadWeapons();   // armas em pixel art (assets/weapons); até chegarem, as armas de retângulos
loadMonsterSprites();   // monstros em sprites (assets/monsters); até chegarem, os slimes desenhados à mão
ui.creatorTurn.addEventListener('click', () => { creatorDir = [0, 1, 3, 2][(([0, 1, 3, 2].indexOf(creatorDir)) + 1) % 4]; });
ui.creatorRandom.addEventListener('click', () => {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const gender = pick(OPTIONS.gender);
  creatorLook = { v: 2 };
  for (const field of Object.keys(OPTIONS)) creatorLook[field] = pick(OPTIONS[field]);
  creatorLook.village = pick(OPTIONS.village.filter(villageOpen));      // só entre as vilas abertas
  creatorLook.gender = gender;
  creatorLook.eyeStyle = gender === 'f' ? 'cilios' : 'masculino';
  if (Math.random() < 0.5) creatorLook.hairStyle = gender === 'f' ? 'longo_lateral' : pick(['espetado', 'baguncado']);
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
const HUD_DEFAULT = { btnScale: 1, btnOpacity: 1, barScale: 1, barOpacity: 1, camDist: 1, layouts: { landscape: {}, portrait: {} } };
const hud = loadHud();
hud.editing = false;

function loadHud() {
  try {
    const raw = JSON.parse(localStorage.getItem(HUD_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      const num = (v, min, max, d) => (typeof v === 'number' && v >= min && v <= max ? v : d);
      return {
        btnScale: num(raw.btnScale, 0.7, 1.3, 1), btnOpacity: num(raw.btnOpacity, 0.3, 1, 1),
        barScale: num(raw.barScale, 0.7, 1.3, 1), barOpacity: num(raw.barOpacity, 0.3, 1, 1), camDist: num(raw.camDist, 0.8, 1.4, 1),
        layouts: { landscape: raw.layouts?.landscape || {}, portrait: raw.layouts?.portrait || {} },
      };
    }
  } catch { /* modo privado ou dado estragado: padrão */ }
  return structuredClone(HUD_DEFAULT);
}
function saveHud() {
  try {
    localStorage.setItem(HUD_KEY, JSON.stringify({
      btnScale: hud.btnScale, btnOpacity: hud.btnOpacity, barScale: hud.barScale, barOpacity: hud.barOpacity, camDist: hud.camDist, layouts: hud.layouts,
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
  if (viewW) computeTile();
}

/** Depois de arrastar: não deixa nada sair da tela (nem ficar embaixo do notch). */
function clampIntoView(el, off) {
  el.style.translate = `${off[0]}px ${off[1]}px`;
  const r = el.getBoundingClientRect();
  const minX = safe.left + 4, maxX = innerWidth - safe.right - 4, minY = safe.top + 4, maxY = innerHeight - safe.bottom - 4;
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
  Object.assign(hud, { btnScale: 1, btnOpacity: 1, barScale: 1, barOpacity: 1, camDist: 1 });
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
const FEED_MAX = 40;

// O chat fica num painel (desenho do HUD): a linha de digitar está sempre ali; o 💬 do menu só a seleciona.
function openChat() {
  showChatMissions(false);
  ui.chatBox.classList.remove('min');
  ui.chatToggle.setAttribute('aria-expanded', 'true');
  ui.chatInput.focus();
}
function closeChat() {
  ui.chatToggle.setAttribute('aria-expanded', 'false');
  ui.chatInput.blur();
}
ui.chatToggle.addEventListener('click', () => (document.activeElement === ui.chatInput ? closeChat() : openChat()));
ui.chatInput.addEventListener('blur', () => ui.chatToggle.setAttribute('aria-expanded', 'false'));

/** Aba "Missões" do chat (no celular, as missões em andamento ficam aqui). */
let chatTabTouched = false;
function showChatMissions(on) {
  ui.chatMissionsPane.hidden = !on;
  ui.chatFeed.hidden = on;
  ui.chatTabMissions.setAttribute('aria-pressed', String(on));
}
ui.chatTabMissions.addEventListener('click', () => {
  chatTabTouched = true;
  ui.chatBox.classList.remove('min');
  showChatMissions(ui.chatMissionsPane.hidden);
});
const CHAT_MIN_KEY = 'nin.chat.min';
function setChatMin(min) {
  ui.chatBox.classList.toggle('min', min);
  ui.chatMin.textContent = min ? '+' : '–';
  ui.chatMin.setAttribute('aria-expanded', String(!min));
  try { localStorage.setItem(CHAT_MIN_KEY, min ? '1' : ''); } catch { /* modo privado */ }
}
try { if (localStorage.getItem(CHAT_MIN_KEY)) setChatMin(true); } catch { /* modo privado */ }
ui.chatMin.addEventListener('click', () => setChatMin(!ui.chatBox.classList.contains('min')));
// Translúcido no jogo (v20): tocar no chat deixa opaco; tocar em qualquer outro lugar devolve a transparência.
ui.chatBox.addEventListener('pointerdown', () => ui.chatBox.classList.add('active'));
document.addEventListener('pointerdown', (e) => {
  if (!ui.chatBox.contains(e.target)) ui.chatBox.classList.remove('active');
}, true);

/** Menu (☰ no celular): abre a grade de ícones; escolher qualquer um fecha. */
ui.menuToggle.addEventListener('click', () => {
  const open = !document.body.classList.contains('menu-open');
  document.body.classList.toggle('menu-open', open);
  ui.menuToggle.setAttribute('aria-expanded', String(open));
});
ui.menuGrid.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-btn')) return;
  document.body.classList.remove('menu-open');
  ui.menuToggle.setAttribute('aria-expanded', 'false');
});

/** Cor fixa por nome no chat (cada um com a sua, como no desenho). */
const CHAT_COLORS = ['#8fe07a', '#ffd76a', '#f48ac8', '#7fd0ff', '#ffb067', '#c9a6ff'];
function nameColor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return CHAT_COLORS[h % CHAT_COLORS.length];
}

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
  if (!mine && !kind) who.style.color = nameColor(username);
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
  ui.chatFeed.scrollTop = ui.chatFeed.scrollHeight;     // a mais nova sempre à vista
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
/**
 * Tamanho da casa na tela. Casas no lado menor: 14 no celular (a câmera fica mais longe e se vê mais em volta) e 11
 * nas telas grandes; o jogador ainda afasta ou aproxima no ⚙️ ("Distância da câmera").
 */
function computeTile() {
  const short = Math.min(viewW, viewH);
  const base = short / (short < 560 ? 14 : 11);
  tile = Math.round(Math.max(20, Math.min(64, base / (hud.camDist || 1))));
}

function resize() {
  viewW = canvas.clientWidth || innerWidth;
  viewH = canvas.clientHeight || innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  computeTile();
  readSafeArea();
  layoutJoystick(viewW, viewH);
  checkOrientation();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

// ------------------------------------------------------------------ pixel art (gerada por código)

// Arte do mapa: cada casa mede U = 16 unidades de desenho (a medida de toda a arte do mapa, em mapArt.js também) e
// cada unidade vira ART pixels de verdade nos blocos do chão: 48 px por casa, perto da densidade dos bonecos chibi.
// A arte desenhada em unidades inteiras fica igual a antes, só mais nítida; o detalhe fino usa frações (1/ART = 1 px).
const U = 16;
const PIX = U * ART;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Um tile do chão: `draw` desenha em unidades (0..U); o canvas tem ART pixels por unidade (frações = detalhe fino). */
function makeTile(draw) {
  const c = document.createElement('canvas');
  c.width = PIX;
  c.height = PIX;
  const g = c.getContext('2d');
  g.scale(ART, ART);
  draw(g);
  return c;
}

function grassTile(seed, flowers) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#4f9a3a';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = r() < 0.5 ? '#438a31' : '#5fae47';
      g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1, 1);
    }
    for (let i = 0; i < 4; i++) {          // tufos
      const x = Math.floor(r() * (U - 2)), y = Math.floor(r() * (U - 3)) + 2;
      g.fillStyle = '#3a7a2b';
      g.fillRect(x, y, 1, 2);
      g.fillRect(x + 2, y, 1, 2);
      g.fillStyle = '#6cbd52';
      g.fillRect(x + 1, y - 1, 1, 3);
    }
    if (flowers) {
      for (let i = 0; i < 3; i++) {
        const x = 2 + Math.floor(r() * (U - 4)), y = 2 + Math.floor(r() * (U - 4));
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
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = r() < 0.5 ? '#a8834e' : '#c9a56d';
      g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1, 1);
    }
    for (let i = 0; i < 3; i++) {          // pedrinhas
      g.fillStyle = '#8d7350';
      const x = Math.floor(r() * (U - 2)), y = Math.floor(r() * (U - 2));
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
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = r() < 0.5 ? '#2b6584' : '#173d52';
      const x = Math.floor(r() * (U - 4)), y = Math.floor(r() * U);
      g.fillRect(x, y, 3 + Math.floor(r() * 3), 1);
    }
  });
}

/** Grama escura da Floresta (mais fechada que os gramados da Vila). */
/** 1 pixel de verdade, em unidades (o detalhe fino da arte do chão). */
const PX = 1 / ART;
const fine = (g, color, x, y, w = PX, h = PX) => {
  g.fillStyle = color;
  g.fillRect(Math.round(x * ART) / ART, Math.round(y * ART) / ART, w, h);
};

/**
 * Grama em alta resolução: base com manchas suaves, folhinhas de 1 pixel de largura (escuras embaixo, claras na ponta)
 * e, em algumas variantes, florzinhas, trevos ou folhas caídas. `pal` = [base, sombra, meio, luz, ponta].
 */
function grassHD(seed, pal, extra) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = pal[0];
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 60; i++) {                      // pontinhos de tom (sem forma: o tile não pode "aparecer" repetido)
      fine(g, r() < 0.5 ? 'rgba(10, 40, 15, 0.25)' : 'rgba(170, 220, 120, 0.12)', r() * U, r() * U, PX * (1 + Math.floor(r() * 2)), PX);
    }
    for (let i = 0; i < 40; i++) {                      // folhinhas
      const x = r() * U, y = 1 + r() * (U - 1), h = 0.7 + r() * 1.1;
      fine(g, pal[1], x, y - h, PX, h);
      fine(g, r() < 0.5 ? pal[2] : pal[3], x, y - h, PX, h * 0.55);
      if (r() < 0.3) fine(g, pal[4], x, y - h - PX);
    }
    for (let i = 0; i < 3; i++) {                       // tufos (três folhas abertas)
      const x = 1 + r() * (U - 2), y = 2 + r() * (U - 3);
      fine(g, pal[1], x - PX * 2, y - 1, PX, 1);
      fine(g, pal[1], x + PX * 2, y - 1, PX, 1);
      fine(g, pal[3], x, y - 1.6, PX, 1.6);
      fine(g, pal[4], x, y - 1.6 - PX);
    }
    if (extra === 'flowers') {
      for (let i = 0; i < 3; i++) {
        const x = 2 + r() * (U - 4), y = 2 + r() * (U - 4);
        const petal = ['#f4efe0', '#f2d25a', '#c9a6e8', '#f4a6b8'][Math.floor(r() * 4)];
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) fine(g, petal, x + dx * PX, y + dy * PX);
        fine(g, '#e0882a', x, y);
        fine(g, pal[1], x, y + PX * 2, PX, PX * 2);
      }
    } else if (extra === 'clover') {
      for (let i = 0; i < 4; i++) {
        const x = 1.5 + r() * (U - 3), y = 1.5 + r() * (U - 3);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) fine(g, pal[3], x + dx * PX * 1.5, y + dy * PX * 1.5, PX * 2, PX * 2);
      }
    } else if (extra === 'leaves') {
      for (let i = 0; i < 3; i++) {
        const x = 1 + r() * (U - 3), y = 1 + r() * (U - 3);
        const c = ['#a8682a', '#c48a3a', '#8a4a20'][Math.floor(r() * 3)];
        fine(g, c, x, y, PX * 3, PX * 2);
        fine(g, c, x + PX, y - PX, PX, PX);
        fine(g, '#5a3414', x + PX, y + PX, PX, PX);
      }
    }
  });
}

/** Grama da Floresta (mais escura) e a dos gramados da Vila. */
const DARK_GRASS = ['#2d6230', '#1f4a24', '#2f6a33', '#3f8040', '#6aa85a'];
const LAWN = ['#4f9a3a', '#3a7a2b', '#4c9238', '#5fae47', '#8fd06a'];
/** Grama úmida da Névoa: verde frio, puxado para o azul. */
const MOSS = ['#5b8a62', '#41684a', '#527f5a', '#6c9a70', '#a2c6a0'];

function darkGrassTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#2f6b28';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 28; i++) {
      g.fillStyle = r() < 0.5 ? '#285f22' : '#3a7d31';
      g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1, 1);
    }
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(r() * (U - 2)), y = Math.floor(r() * (U - 3)) + 2;
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
    g.fillRect(0, 0, U, U);
    for (let y = 0; y < U; y += 4) {
      g.fillStyle = '#7a4f28';
      g.fillRect(0, y + 3, U, 1);                                   // junta das tábuas
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
    g.fillRect(0, 0, U, U);
    const blocks = seed % 2 ? [[0, 0, 8, 7], [8, 0, 8, 7], [0, 8, 5, 8], [5, 8, 11, 8]] : [[0, 0, 6, 8], [6, 0, 10, 8], [0, 8, 9, 8], [9, 8, 7, 8]];
    for (const [x, y, w, h] of blocks) {
      g.fillStyle = r() < 0.5 ? '#cfcbc1' : '#c4c0b6';
      g.fillRect(x, y, w - 1, h - 1);
      g.fillStyle = '#dbd7cd';
      g.fillRect(x, y, w - 1, 1);
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle = r() < 0.5 ? '#b8b4aa' : '#d8d4ca';
      g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1, 1);
    }
  });
}

/** Areia do deserto (os gramados da Vila da Areia): grão fino e ondinhas de vento. */
function desertTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#e4c38a';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 50; i++) fine(g, r() < 0.5 ? '#d4ae70' : '#f0d6a4', r() * U, r() * U, PX * (1 + Math.floor(r() * 2)), PX);
    for (let i = 0; i < 2; i++) {
      const x = r() * (U - 6), y = 2 + r() * (U - 4), w = 3 + r() * 4;
      fine(g, '#cfa868', x, y, w, PX);
      fine(g, '#f4dcae', x + PX, y - PX, w - PX * 2, PX);
    }
  });
}

/** Terra batida da arena da Areia: areia mais escura e compacta, com marcas de pé. */
function packedSandTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#d2a86c';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 40; i++) fine(g, r() < 0.5 ? '#c09458' : '#e0ba80', r() * U, r() * U, PX * (1 + Math.floor(r() * 3)), PX);
    if (r() < 0.4) { const x = 2 + r() * (U - 5), y = 2 + r() * (U - 5); fine(g, '#b6894e', x, y, PX * 4, PX * 6); fine(g, '#b6894e', x + 1.8, y + 2.4, PX * 4, PX * 6); }
  });
}

/** Ponte de pedra (Areia): lajes claras atravessadas, com junta escura. */
function stoneBridgeTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#7a6e5c';
    g.fillRect(0, 0, U, U);
    for (let y = 0, row = 0; y < U; y += 5.3, row++) {
      for (let x = row % 2 ? -3 : 0; x < U; x += 6) {
        fine(g, r() < 0.5 ? '#c2b6a2' : '#b6aa94', x + PX, y + PX, 6 - PX * 2, 5.3 - PX * 2);
        fine(g, '#ddd2c0', x + PX, y + PX, 6 - PX * 2, PX);
      }
    }
  });
}

/** Areia do campo de treino. */
function sandTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#e2cd96';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 22; i++) {
      g.fillStyle = r() < 0.5 ? '#d3bb80' : '#eedcab';
      g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1, 1);
    }
  });
}

/**
 * Laje de ardósia da arena (estilo da prova de arte): junta escura, chanfro claro em cima e à esquerda, sombra
 * embaixo e à direita, poeira fina. `motif`: o losango gravado que se repete a cada 4 casas.
 */
function slabTile(seed, motif) {
  return makeTile((g) => {
    const r = rng(seed);
    const base = ['#3e4761', '#3b445d', '#414a65'][seed % 3];
    g.fillStyle = '#21263a';
    g.fillRect(0, 0, U, U);                                           // junta
    g.fillStyle = base;
    g.fillRect(0.5, 0.5, U - 1, U - 1);
    fine(g, '#535d7b', 0.5, 0.5, U - 1, PX * 2);                      // chanfro de luz
    fine(g, '#535d7b', 0.5, 0.5, PX * 2, U - 1);
    fine(g, '#2c3248', 0.5, U - 0.5 - PX * 2, U - 1, PX * 2);        // sombra
    fine(g, '#2c3248', U - 0.5 - PX * 2, 0.5, PX * 2, U - 1);
    for (let i = 0; i < 46; i++) fine(g, r() < 0.5 ? '#47506c' : '#363d55', 1 + r() * (U - 2), 1 + r() * (U - 2), PX * (1 + Math.floor(r() * 2)), PX);
    if (motif) {
      const c = U / 2;
      const dia = (rad, color) => { g.fillStyle = color; g.beginPath(); g.moveTo(c, c - rad); g.lineTo(c + rad, c); g.lineTo(c, c + rad); g.lineTo(c - rad, c); g.closePath(); g.fill(); };
      dia(6.4, '#30374e');
      dia(6, '#46506e');
      dia(4, '#3b4460');
      dia(2.4, '#525d7f');
      fine(g, '#6a769c', c - PX, c - 2.4, PX * 2, PX * 2);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) fine(g, '#58638a', c + dx * 7.4 - PX, c + dy * 7.4 - PX, PX * 3, PX * 3);
    } else if (r() < 0.3) {                                           // rachadura fininha
      let cx = 2 + r() * (U - 4), cy = 2 + r() * (U - 4);
      for (let k = 0; k < 5; k++) { fine(g, '#2a3045', cx, cy, PX * 2, PX); cx += (r() - 0.3) * 1.6; cy += (r() - 0.5) * 1.6; }
    }
  });
}

/** Ponte de madeira: tábuas atravessadas e corrimão nas pontas. */
function bridgeTile() {
  return makeTile((g) => {
    g.fillStyle = '#8b5a2b';
    g.fillRect(0, 0, U, U);
    g.fillStyle = '#5d3a1a';
    for (let x = 3; x < U; x += 4) g.fillRect(x, 0, 1, U);
    g.fillStyle = '#a8713a';
    for (let x = 0; x < U; x += 4) g.fillRect(x, 0, 1, U);
  });
}

/** Rio azul (mais claro que a água de fora do mundo), com reflexos. */
function riverTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#3a78c4';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 40; i++) fine(g, r() < 0.5 ? 'rgba(20, 60, 120, 0.25)' : 'rgba(120, 180, 240, 0.18)', r() * U, r() * U, PX * 3, PX);   // tom
    for (let i = 0; i < 6; i++) {                       // ondinhas: um arco claro e a sombra embaixo
      const x = r() * (U - 4), y = 1 + r() * (U - 2), w = 2 + r() * 3;
      fine(g, '#2f66a9', x, y + PX, w, PX);
      fine(g, '#6fa8e8', x + PX, y, w - PX * 2, PX);
      if (r() < 0.4) fine(g, '#d8ecff', x + w * 0.4, y - PX, PX * 2, PX);   // brilho
    }
  });
}

/** Mata fechada vista de cima (fora do mundo): copas escuras emendadas. */
function canopyTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#173f17';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(r() * U), y = Math.floor(r() * U), rad = 2 + Math.floor(r() * 3);
      g.fillStyle = r() < 0.5 ? '#1f5220' : '#122f12';
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
  });
}

function stoneTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#8d8a84';
    g.fillRect(0, 0, U, U);
    // pedras de calçamento: 4 blocos com junta escura e brilho em cima
    const blocks = seed % 2 ? [[0, 0, 8, 7], [8, 0, 8, 7], [0, 8, 5, 8], [5, 8, 11, 8]] : [[0, 0, 6, 8], [6, 0, 10, 8], [0, 8, 9, 8], [9, 8, 7, 8]];
    for (const [x, y, w, h] of blocks) {
      g.fillStyle = r() < 0.5 ? '#97948d' : '#85827b';
      g.fillRect(x + 1, y + 1, w - 1, h - 1);
      g.fillStyle = '#a9a69e';
      g.fillRect(x + 1, y + 1, w - 2, 1);
    }
    g.fillStyle = '#6d6a64';
    for (let i = 0; i < 6; i++) g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1, 1);
  });
}

/** Calçamento de cada vila (v16): a mesma planta da Folha com a pedra da terra dela. [base, bloco, bloco 2, brilho, pontos]. */
const STONE_THEMES = {
  nevoa: ['#8a9ea6', '#b3c6cc', '#a7bcc3', '#c8d8dc', ['#9cb1b8', '#bfd0d5']],
  nuvem: ['#b3aaa6', '#d6cfca', '#cbc3be', '#e3ddd8', ['#c0b8b3', '#ddd6d1']],
  areia: ['#b9925e', '#d9b47c', '#cfa970', '#e6c592', ['#c49c66', '#e0bd88']],
};

/** Terra solta (Zona de Conflito, Refúgio): marrom-acinzentada, com pedrinhas. */
function dirtTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#6f6150';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 20; i++) {
      g.fillStyle = r() < 0.5 ? '#5f5242' : '#806f5c';
      g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1 + Math.floor(r() * 2), 1);
    }
    g.fillStyle = '#8f8a80';
    g.fillRect(Math.floor(r() * (U - 2)), Math.floor(r() * (U - 2)), 2, 2);
  });
}

/** Cinzas (acampamentos): cinza-escuro com brasas apagadas. */
function ashTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#4a4744';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = r() < 0.5 ? '#3b3836' : '#5c5955';
      g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1, 1);
    }
    if (r() < 0.4) { g.fillStyle = '#7a3a22'; g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1, 1); }
  });
}

/** Chão de caverna: pedra úmida arroxeada, com poças escuras. */
function caveTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#2a2430';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = r() < 0.5 ? '#231e29' : '#352e3d';
      g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1 + Math.floor(r() * 2), 1);
    }
    if (r() < 0.3) { g.fillStyle = '#1a1520'; g.fillRect(Math.floor(r() * 12), Math.floor(r() * 12), 4, 2); }
  });
}

/** Grama queimada: preta e marrom, com um tufo verde que sobrou aqui e ali. */
function burntTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#2e2a22';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = r() < 0.5 ? '#1f1c17' : '#40382c';
      g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1, 1 + Math.floor(r() * 2));
    }
    if (r() < 0.25) { g.fillStyle = '#3a5a2a'; g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1, 2); }
  });
}

/** Seixos do leito seco: areia cinza com pedrinhas redondas. */
function pebblesTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#8a8478';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = r() < 0.5 ? '#a39d90' : '#6f6a60';
      const x = Math.floor(r() * (U - 2)), y = Math.floor(r() * (U - 2));
      g.fillRect(x, y, 2, 2);
      g.fillStyle = '#c0b9aa';
      g.fillRect(x, y, 1, 1);
    }
  });
}

/** Lodo (embaixo do lago da caverna): roxo escuro. */
function lodoTile(seed) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = '#3b1f4a';
    g.fillRect(0, 0, U, U);
    for (let i = 0; i < 6; i++) { g.fillStyle = '#5a3070'; g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 2, 1); }
  });
}

/** Calçamento com as cores de uma vila. */
function themedStoneTile(seed, [base, a, b, light, dots]) {
  return makeTile((g) => {
    const r = rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, U, U);
    const blocks = seed % 2 ? [[0, 0, 8, 7], [8, 0, 8, 7], [0, 8, 5, 8], [5, 8, 11, 8]] : [[0, 0, 6, 8], [6, 0, 10, 8], [0, 8, 9, 8], [9, 8, 7, 8]];
    for (const [x, y, w, h] of blocks) {
      g.fillStyle = r() < 0.5 ? a : b;
      g.fillRect(x, y, w - 1, h - 1);
      g.fillStyle = light;
      g.fillRect(x, y, w - 1, 1);
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle = r() < 0.5 ? dots[0] : dots[1];
      g.fillRect(Math.floor(r() * U), Math.floor(r() * U), 1, 1);
    }
  });
}

const TILES = {
  grass: [grassHD(1, LAWN), grassHD(2, LAWN), grassHD(3, LAWN), grassHD(4, LAWN, 'flowers'), grassHD(5, LAWN, 'clover')],
  stone: [lightStoneTile(21), lightStoneTile(22), lightStoneTile(23)],   // ruas e praça: pedra cinza clara
  themedStone: Object.fromEntries(Object.entries(STONE_THEMES).map(([k, c]) => [k, [themedStoneTile(91, c), themedStoneTile(92, c), themedStoneTile(93, c)]])),
  dirt: [dirtTile(101), dirtTile(102), dirtTile(103)],
  ash: [ashTile(111), ashTile(112)],
  cave: [caveTile(121), caveTile(122), caveTile(123)],
  burnt: [burntTile(131), burntTile(132), burntTile(133)],
  pebbles: [pebblesTile(141), pebblesTile(142)],
  lodo: [lodoTile(151)],
  sand: [sandTile(41), sandTile(42)],
  desert: [desertTile(161), desertTile(162), desertTile(163)],
  packedSand: [packedSandTile(191), packedSandTile(192), packedSandTile(193)],                 // Areia: chão da arena                                // Areia: os gramados
  moss: [grassHD(171, MOSS), grassHD(172, MOSS), grassHD(173, MOSS), grassHD(174, MOSS, 'clover')], // Névoa: grama úmida
  stoneBridge: [stoneBridgeTile(181)],                                                        // Areia: pontes de pedra
  arena: [slabTile(43), slabTile(44), slabTile(45), slabTile(46, true)],                     // lajes de ardósia da arena
  bridge: [bridgeTile(51)],
  river: [riverTile(61), riverTile(62), riverTile(63), riverTile(64)],
  path: [pathTile(7), pathTile(8)],
  water: [waterTile(11), waterTile(12)],
  canopy: [canopyTile(31), canopyTile(32), canopyTile(33)],
  darkGrass: [grassHD(71, DARK_GRASS), grassHD(72, DARK_GRASS), grassHD(73, DARK_GRASS), grassHD(74, DARK_GRASS),
    grassHD(75, DARK_GRASS, 'flowers'), grassHD(76, DARK_GRASS, 'clover'), grassHD(77, DARK_GRASS, 'leaves')],   // Floresta
  wood: [woodTile(81), woodTile(82)],                                                       // assoalho das lojas
  black: [makeTile((g) => { g.fillStyle = '#100c09'; g.fillRect(0, 0, U, U); })],         // fora da sala
};

/** Hash estável por casa: o mesmo chão aparece sempre no mesmo lugar. */
function cellHash(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;      // >>> 0: sempre positivo (índice de tile válido)
}

/**
 * Chão com o tema da vila (a mesma planta nas quatro): na Areia os gramados viram areia do deserto e as pontes são de
 * pedra; na Névoa a grama é úmida ('moss').
 */
function groundKind(x, y) {
  const g = groundAt(state.places, x, y);
  if (g !== 'grass' && g !== 'bridge') return g;
  const theme = themeAt(state.places, x, y);
  if (theme === 'areia') return g === 'grass' ? 'desert' : 'stonebridge';
  if (theme === 'nevoa' && g === 'grass') return 'moss';
  return g;
}

/** Chão de uma casa (coordenadas do mapa desenhado; além da saída, o chão do mapa vizinho). */
function tileAt(x, y) {
  const h = cellHash(x, y);
  switch (groundKind(x, y)) {
    case 'desert': return TILES.desert[h % 3];                     // Areia: o deserto entre as casas
    case 'moss': return TILES.moss[h % 13 === 0 ? 3 : h % 3];      // Névoa: grama úmida
    case 'stonebridge': return TILES.stoneBridge[0];               // Areia: ponte de pedra
    case 'stone': return (TILES.themedStone[themeAt(state.places, x, y)] || TILES.stone)[h % 3];   // Vila: o calçamento da vila
    case 'dirt': return TILES.dirt[h % 3];                         // Zona de Conflito, Refúgio: terra solta
    case 'ash': return TILES.ash[h & 1];                           // acampamentos: cinzas
    case 'cave': return TILES.cave[h % 3];                         // Caverna do Lodo
    case 'burnt': return TILES.burnt[h % 3];                       // Acampamento e Clareira Queimada
    case 'pebbles': return TILES.pebbles[h & 1];                   // leito seco da cachoeira
    case 'lodo': return TILES.lodo[0];
    case 'path': return TILES.path[h & 1];                         // estradas de terra
    case 'sand': return TILES.sand[h & 1];                         // campo de treino
    case 'arena':                                                  // arena da vila: lajes, losango a cada 4 (na Areia, terra batida)
      if (themeAt(state.places, x, y) === 'areia') return TILES.packedSand[h % 3];
      return TILES.arena[x % 4 === 2 && y % 4 === 1 ? 3 : h % 3];
    case 'water': return TILES.river[h & 3];                       // rio e canais
    case 'bridge': return TILES.bridge[0];                         // pontes
    case 'trail':                                                  // Floresta: grama por baixo da trilha curva
    case 'darkgrass': return TILES.darkGrass[h % 23 === 0 ? 4 : h % 17 === 0 ? 5 : h % 13 === 0 ? 6 : h % 4];   // Floresta: grama escura
    case 'wood': return TILES.wood[h & 1];                         // assoalho das lojas
    case 'grass': return TILES.grass[h % 11 === 0 ? 3 : h % 13 === 0 ? 4 : h % 3];    // gramados
    default: return ['interior', 'cave'].includes(state.maps[state.mapId]?.kind) ? TILES.black[0] : TILES.canopy[h % 3];   // fora: escuro (sala, caverna) ou mata
  }
}

// Chão em BLOCOS de 8x8 casas, desenhados uma vez na resolução da arte (384 x 384 px) e guardados. Cada quadro
// desenha só ~12 a 20 imagens em vez de ~300 casas.
const CHUNK = 8;

/*
 * Mapas em imagem (layout.art): a arte vem pronta em blocos do mesmo tamanho, /mapas/<art>/<cx>_<cy>.webp (8 x 8
 * casas a 48 px, feitos por arte/mapas/fatiar.py), carregados quando a câmera chega perto. O bloco do mundo só é
 * montado com as imagens que ele cobre já carregadas (até lá aparece a cor de fundo, como um bloco ainda não montado).
 * Uma imagem que falhou é pedida de novo depois de uns segundos.
 */
const ART_IMAGES_MAX = 96;
const artImages = new Map();         // "art/cx_cy" -> { img, ok: null (chegando) | true }

function artImage(art, cx, cy) {
  const key = `${art}/${cx}_${cy}`;
  let a = artImages.get(key);
  if (a) {
    artImages.delete(key);           // marca como usada agora
    artImages.set(key, a);
    return a;
  }
  a = { img: new Image(), ok: null };
  a.img.onload = () => { a.ok = true; };
  a.img.onerror = () => setTimeout(() => { if (artImages.get(key) === a) artImages.delete(key); }, 4000);
  a.img.src = `/mapas/${key}.webp`;
  artImages.set(key, a);
  if (artImages.size > ART_IMAGES_MAX) artImages.delete(artImages.keys().next().value);
  return a;
}

/** A casa (x, y) é de um mapa em imagem? */
function inArt(x, y) {
  for (const r of state.arts) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
  return false;
}

/**
 * Pedaços de arte que caem no bloco (cx, cy) do mundo: [{ img, x, y }] (x e y: o canto, em casas), ou null se algum
 * ainda está chegando.
 */
function artPieces(cx, cy) {
  const out = [];
  for (const r of state.arts) {
    const x0 = Math.max(cx * CHUNK, r.x), x1 = Math.min((cx + 1) * CHUNK, r.x + r.w);
    const y0 = Math.max(cy * CHUNK, r.y), y1 = Math.min((cy + 1) * CHUNK, r.y + r.h);
    if (x0 >= x1 || y0 >= y1) continue;
    for (let ay = Math.floor((y0 - r.y) / CHUNK); r.y + ay * CHUNK < y1; ay++) {
      for (let ax = Math.floor((x0 - r.x) / CHUNK); r.x + ax * CHUNK < x1; ax++) {
        const a = artImage(r.art, ax, ay);
        if (!a.ok) return null;
        out.push({ img: a.img, x: r.x + ax * CHUNK, y: r.y + ay * CHUNK, r });
      }
    }
  }
  return out;
}
const CHUNK_CACHE_MAX = 64;          // 8 x 48 px = 384 px por bloco: ~64 x 576 KB = 37 MB no máximo
const chunkCache = new Map();        // "mapa:cx,cy" -> canvas (ordem de uso = LRU; voltar a um mapa é instantâneo)

/**
 * No máximo 2 blocos novos por quadro: entrar num mapa grande não trava o celular (os blocos
 * que faltam aparecem nos quadros seguintes, por baixo do "piscar" da troca de mapa), e com
 * folga o jogo já monta os vizinhos da tela antes de o jogador chegar lá.
 */
const CHUNK_BUILDS_PER_FRAME = 3;
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
  const pieces = artPieces(cx, cy);
  if (!pieces) return null;
  chunkBuilds += 1;
  c = document.createElement('canvas');
  c.width = c.height = CHUNK * PIX;
  const g = c.getContext('2d');
  const all = !pieces.length;        // o bloco não toca mapa em imagem: tudo por código, casa por casa
  const drawHere = (x, y) => all || !inArt(x, y);
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) if (drawHere(cx * CHUNK + tx, cy * CHUNK + ty)) g.drawImage(tileAt(cx * CHUNK + tx, cy * CHUNK + ty), tx * PIX, ty * PIX);
  }
  // Daqui para baixo, tudo em unidades (U por casa): a arte do mapa é a mesma em qualquer resolução.
  g.scale(ART, ART);
  // Bordas macias entre chãos diferentes (grama por cima da terra, margem da água).
  drawPatches(g, cx, cy);
  for (let ty = 0; ty < CHUNK; ty++) for (let tx = 0; tx < CHUNK; tx++) if (drawHere(cx * CHUNK + tx, cy * CHUNK + ty)) drawFringe(g, cx * CHUNK + tx, cy * CHUNK + ty, tx * U, ty * U);
  for (let ty = 0; ty < CHUNK; ty++) for (let tx = 0; tx < CHUNK; tx++) if (drawHere(cx * CHUNK + tx, cy * CHUNK + ty)) drawScatter(g, cx * CHUNK + tx, cy * CHUNK + ty, tx * U, ty * U);
  // Enfeites no chão (bancos, rosa dos ventos, lanternas, vasos) e depois as paredes baixas (muralha, prédios,
  // montanha, boneco), inclusive as do mapa vizinho além da borda. Cada uma é desenhada só nos blocos que toca (margem
  // de 8 unidades para as sombras). Árvores, pedras altas e barracas são objetos com altura: vão na camada de cima.
  const size = CHUNK * U, M = 8;
  // As trilhas da Floresta primeiro, todas juntas (emendam sem a borda de uma cortar a outra).
  const trails = [];
  for (const d of state.deco) {
    if (d.k !== 'trail') continue;
    const x = (d.x - cx * CHUNK) * U, y = (d.y - cy * CHUNK) * U, w = d.w * U, h = d.h * U;
    if (x + w < -M || y + h < -M || x > size + M || y > size + M) continue;
    trails.push({ d, x, y, w });
  }
  if (trails.length) drawTrails(g, trails);
  for (const d of state.deco) {
    if (d.k === 'trail') continue;
    const x = (d.x - cx * CHUNK) * U, y = (d.y - cy * CHUNK) * U, w = d.w * U, h = d.h * U;
    if (x + w < -M || y + h < -M || x > size + M || y > size + M) continue;
    drawDeco(g, d, x, y, w, h);
  }
  for (const w of state.walls) {
    if (PROP_KINDS.has(w.k) || w.art) continue;
    const x = (w.x - cx * CHUNK) * U, y = (w.y - cy * CHUNK) * U, pw = w.w * U, ph = w.h * U;
    if (x + pw < -M || y + ph < -M || x > size + M || y > size + M) continue;
    drawWall(g, w, x, y, pw, ph, U);
  }
  // Por fim a arte dos mapas em imagem, recortada no retângulo de cada mapa (cobre a sombra do vizinho que vaza).
  for (const p of pieces) {
    g.save();
    g.beginPath();
    g.rect((p.r.x - cx * CHUNK) * U, (p.r.y - cy * CHUNK) * U, p.r.w * U, p.r.h * U);
    g.clip();
    g.drawImage(p.img, (p.x - cx * CHUNK) * U, (p.y - cy * CHUNK) * U, p.img.naturalWidth / ART, p.img.naturalHeight / ART);
    g.restore();
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
      // Arena da vila: PvP de treino entre os ninjas dela. Entrando, avisa; saindo, solta o foco num ninja.
      const arena = !!arenaAt(state.maps[state.mapId], vx, vy);
      if (arena !== state.inArena) {
        state.inArena = arena;
        document.body.classList.toggle('arena-zone', arena);
        if (arena) showToast('Arena: aqui os ninjas da sua vila treinam luta. Perder não custa nada.', 3500);
        if (!arena && state.focusId && state.players.has(state.focusId)) setFocus(null);
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
  if (state.focusId && me && !keepFocus(me, focusEntity())) setFocus(null);
  if (me) updateCamera(dt, me);
  updateNpcProximity(me);
}

// Modo de teste (só com localStorage nin.debug = "1", ligado à mão no aparelho): números da
// predição e uma "trapaça" de velocidade para ver o servidor corrigindo. Nada de token/sessão aqui.
try {
  if (localStorage.getItem('nin.debug') === '1') {
    window.ninDebug = Object.freeze({
      aimState: () => (aim ? { skill: aim.skill, dir: aim.dir, dragged: aim.dragged, canceled: aim.canceled } : null),
      predicted: () => [pred.x, pred.y],
      official: () => { const me = state.players.get(state.meId); return me ? [me.tx, me.ty] : null; },
      drawn: (id) => { const p = state.players.get(id || state.meId); return p ? [p.x, p.y] : null; },
      /** Onde o jogador está NA TELA (px), com a câmera de verdade (foco, zoom, suavização). */
      screenOf: (id) => { const p = state.players.get(id); return p && lastView ? [lastView.toScreenX(p.x), lastView.toScreenY(p.y)] : null; },
      map: () => ({ predicted: pred.map, drawn: state.mapId, server: state.serverMap }),
      fade: () => ({ alpha: mapFade.alpha, fading: !!mapFade.to }),
      npcs: () => state.npcs.map((n) => n.id),
      monsters: () => [...state.monsters.values()].map((m) => [m.type, Math.round(m.x * 10) / 10, Math.round(m.y * 10) / 10]),
      shop: () => (state.shop ? { ...state.shop } : null),
      /** O mapa inteiro numa imagem (16 px por casa), montado com os mesmos blocos do jogo. */
      /** O mapa inteiro numa imagem (`px` pixels por casa), montado com os mesmos blocos e objetos do jogo. */
      mapPicture: (px = 16) => {
        const c = document.createElement('canvas');
        c.width = state.world.width * px;
        c.height = state.world.height * px;
        const g = c.getContext('2d');
        for (let cy = 0; cy * CHUNK < state.world.height; cy++) {
          for (let cx = 0; cx * CHUNK < state.world.width; cx++) {
            chunkBuilds = 0;
            const ch = chunkCanvas(cx, cy);
            if (ch) g.drawImage(ch, cx * CHUNK * px, cy * CHUNK * px, CHUNK * px, CHUNK * px);
          }
        }
        for (const s2 of state.glows || []) drawSealGlow(g, s2.x * px, s2.y * px, s2.w * px, s2.h * px, 0);
        for (const pr of [...state.props].sort((a, b) => a.y - b.y)) {
          propBuilds = 0;
          const sp = propSprite(pr);
          if (sp) g.drawImage(sp.canvas, (pr.x - sp.left) * px, (pr.y - sp.top) * px, sp.w * px, sp.h * px);
        }
        for (const o of state.overhead) {
          if (o.k === 'oak_canopy') g.drawImage(canopySprite(o), o.x * px, o.y * px, o.w * px, o.h * px);
          else drawGateRoof(g, o.x * px, o.y * px, o.w * px, o.h * px, o.t);
        }
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
  const target = focusEntity();
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
  // Tremor curto (o golpe marcado caiu perto): alguns centésimos de casa para os lados.
  const shake = now < (state.shakeUntil || 0) ? ((state.shakeUntil - now) / 220) * 0.12 : 0;
  const camX = (me ? me.x + cam.ox : width / 2) + (shake ? Math.sin(now / 9) * shake : 0);
  const camY = (me ? me.y + cam.oy : height / 2) + (shake ? Math.cos(now / 11) * shake : 0);
  const T = Math.max(8, Math.round(tile * cam.scale));   // inteiro: o chão em blocos não abre frestas
  const halfW = viewW / 2, halfH = viewH / 2;
  const toScreenX = (wx) => Math.round((wx - camX) * T + halfW);
  const toScreenY = (wy) => Math.round((wy - camY) * T + halfH);
  lastView = { toScreenX, toScreenY, T, toWorld: (sx, sy) => ({ x: (sx - halfW) / T + camX, y: (sy - halfH) / T + camY }) };
  drawCooldowns(now);

  // 1. Chão (blocos em cache).
  const left = camX - halfW / T, right = camX + halfW / T, top = camY - halfH / T, bottom = camY + halfH / T;
  const cx0 = Math.floor(left / CHUNK), cx1 = Math.floor(right / CHUNK);
  const cy0 = Math.floor(top / CHUNK), cy1 = Math.floor(bottom / CHUNK);
  const size = CHUNK * T;
  chunkBuilds = 0;
  propBuilds = 0;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const c = chunkCanvas(cx, cy);
      if (c) ctx.drawImage(c, toScreenX(cx * CHUNK), toScreenY(cy * CHUNK), size, size);
      else {                           // ainda não montado: cor do chão por 1 ou 2 quadros
        const k = state.maps[state.mapId]?.kind;
        ctx.fillStyle = k === 'village' ? '#c4c0b6' : k === 'cave' || k === 'interior' ? '#1a1820' : '#4f9a3a';
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
  // Só nas vilas e salas (calçamento, assoalho): na natureza, a grade parece quadriculado e tira a beleza do mapa. Nos
  // mapas em imagem também não (o desenho já tem o seu piso).
  const kind = state.maps[state.mapId]?.kind;
  if ((kind === 'village' || kind === 'interior') && !state.maps[state.mapId]?.art) {
    ctx.beginPath();
    for (let x = gx0; x <= gx1; x++) { const sx = toScreenX(x) + 0.5; ctx.moveTo(sx, sTop); ctx.lineTo(sx, sBottom); }
    for (let y = gy0; y <= gy1; y++) { const sy = toScreenY(y) + 0.5; ctx.moveTo(sLeft, sy); ctx.lineTo(sRight, sy); }
    ctx.strokeStyle = 'rgba(16, 48, 12, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

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
  for (const s of state.glows || []) {
    const x = toScreenX(s.x), y = toScreenY(s.y), w = s.w * T, h = s.h * T;
    if (x + w * 3 >= 0 && x - w * 2 <= viewW && y + h * 3 >= 0 && y - h * 2 <= viewH) drawSealGlow(ctx, x, y, w, h, now);
  }
  drawLights(toScreenX, toScreenY, T, viewW, viewH, now);

  // 4. Efeitos de habilidade: os "de chão" (Sombra, Água) por baixo dos bonecos, o resto por cima.
  let alive = 0;
  for (const fx of state.effects) if (SKILLS[fx.skill] && now - fx.start < SKILLS[fx.skill].ms) state.effects[alive++] = fx;
  state.effects.length = alive;
  for (const fx of state.effects) if (GROUND_FX.has(fx.skill)) drawEffect(fx, toScreenX(fx.x), toScreenY(fx.y), T, now);
  vfx.draw(ctx, 'ground', toScreenX, toScreenY, T, dpr, now);
  drawTelegraphs(toScreenX, toScreenY, T, now);
  drawAimPreview(updateAim(me), toScreenX, toScreenY, T, now);

  // Linha pontilhada do jogador até o alvo focado (e a janela do alvo, o retrato e o minimapa do HUD).
  const focused = focusEntity();
  updateTargetWindow(focused);
  updateBossBar(me);
  updatePortrait();
  drawMinimap(now);
  if (now - (draw.skyAt || 0) > 1000) { draw.skyAt = now; renderBuffs(); renderSlots(); }
  drawEquipFigure(now);
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
    if (m.diedAt && now - m.diedAt > monsterDeathMs(m.type)) { state.monsters.delete(m.id); continue; }   // terminou de sumir
    if (m.map === state.mapId) drawList.push(m);
  }
  for (const p of state.players.values()) if (p.map === state.mapId) drawList.push(p);
  for (const n of state.npcs) drawList.push(n);
  // Árvores, pedras altas e barracas no meio dos bonecos, pela linha da base (quem passa atrás fica atrás da copa).
  for (const pr of state.props) {
    const x = toScreenX(pr.x - pr.ext.left), y = toScreenY(pr.y - pr.ext.top);
    if (x > viewW || y > viewH || x + (pr.w + pr.ext.left + pr.ext.right) * T < 0 || y + (pr.h + pr.ext.top + pr.ext.bottom) * T < 0) continue;
    drawList.push(pr);
  }
  if (drawList.length > 1) drawList.sort((a, b) => a.y - b.y);
  ctx.textAlign = 'center';
  for (const e of drawList) {
    if (e.prop) drawPropOnScreen(e, toScreenX, toScreenY, T, me);
    else if (e.npc) drawNpc(e, toScreenX(e.x), toScreenY(e.y), T, now, me);
    else if (e.type) drawMonster(e, toScreenX(e.x), toScreenY(e.y), T, now);
    else drawPlayer(e, toScreenX(e.x) + knockOffset(e, now, 'dx') * T, toScreenY(e.y) + knockOffset(e, now, 'dy') * T, T, e.id === state.meId, now);
  }

  for (const fx of state.effects) if (!GROUND_FX.has(fx.skill)) drawEffect(fx, toScreenX(fx.x), toScreenY(fx.y), T, now);
  vfx.draw(ctx, 'top', toScreenX, toScreenY, T, dpr, now);

  // Por cima de todos: o telhado do portão (quem passa por baixo fica escondido por ele).
  for (const o of state.overhead) {
    const x = toScreenX(o.x), y = toScreenY(o.y), w = o.w * T, h = o.h * T;
    if (x + w < 0 || x > viewW || y + h < 0 || y > viewH) continue;
    if (o.k === 'oak_canopy') {
      // A copa do Velho Carvalho: translúcida com o jogador embaixo dela (ele não some).
      const under = !!me && me.x >= o.x && me.x <= o.x + o.w && me.y >= o.y && me.y <= o.y + o.h;
      const c = canopySprite(o);
      if (under) ctx.globalAlpha = 0.45;
      ctx.drawImage(c, x, y, w, h);
      ctx.globalAlpha = 1;
    } else drawGateRoof(ctx, x, y, w, h, o.t);
  }

  // O ar do mapa (sombras das copas, sol, pólen, brasas, vinheta) e, na caverna, o escuro em volta do jogador.
  drawAtmosphere(toScreenX, toScreenY, T, now);
  drawSky(toScreenX, toScreenY, T, now, me);
  if (me && state.maps[state.mapId]?.kind === 'cave') drawCaveDark(toScreenX(me.x), toScreenY(me.y), T, toScreenX, toScreenY);

  // 6. Números flutuantes (dano, cura, XP, avisos) e falas do NPC.
  drawFloaters(toScreenX, toScreenY, T, now);
  for (const n of state.npcs) drawNpcBubble(n, toScreenX(n.x), toScreenY(n.y), T, now);

  // 7. Missão pronta e o Mestre fora da tela: seta na borda apontando para ele.
  const marker = npcMarker();
  if (me && marker && marker.strong && state.mission) {
    for (const n of state.npcs) if (n.role === 'sensei') drawOffscreenArrow(toScreenX(n.x), toScreenY(n.y), marker, now);
  }

  drawJoystick();
  drawMapChange(now);

  if (!me) {
    ctx.fillStyle = 'rgba(20, 17, 13, 0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
  }
}

/**
 * Objetos com altura do mapa: cada parede `tree`, `oak`, `seal`... vira um objeto que se desenha junto dos bonecos.
 * Fileiras compridas de árvores (bordas da mata) são cortadas em pedaços de até 6 casas: cada pedaço se ordena pela
 * própria base. `y` = a base (é por ela que a lista de desenho ordena).
 */
function makeProps(walls) {
  const out = [];
  for (const w of walls) {
    if (!PROP_KINDS.has(w.k)) continue;
    const ext = propExtent(w);
    const long = Math.max(w.w, w.h);
    const parts = w.k === 'tree' || w.k === 'deadtree' ? Math.ceil(long / 6) : 1;
    for (let i = 0; i < parts; i++) {
      const horiz = w.w >= w.h;
      const seg = horiz
        ? { x: w.x + (w.w * i) / parts, y: w.y, w: w.w / parts, h: w.h }
        : { x: w.x, y: w.y + (w.h * i) / parts, w: w.w, h: w.h / parts };
      out.push({ prop: true, wall: { ...w, ...seg }, x: seg.x, top: seg.y, w: seg.w, h: seg.h, y: seg.y + seg.h, ext });
    }
  }
  return out;
}

/** A copa do Velho Carvalho, desenhada uma vez na resolução da arte. */
const canopyCache = new Map();
function canopySprite(o) {
  const key = `${o.w}x${o.h}`;
  let c = canopyCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = Math.ceil(o.w * PIX);
  c.height = Math.ceil(o.h * PIX);
  const g = c.getContext('2d');
  g.scale(ART, ART);
  drawOakCanopy(g, o.w * U, o.h * U);
  canopyCache.set(key, c);
  return c;
}

/** Desenho de cada objeto alto, em cache (montado uma vez, no máximo 4 por quadro). */
const propCache = new Map();
const PROP_BUILDS_PER_FRAME = 4;
let propBuilds = 0;
function propSprite(pr) {
  // O tema entra na chave: as quatro vilas têm árvores no mesmo lugar, mas desenhadas diferente (bambu, palmeira).
  const key = `${pr.wall.k}:${pr.x},${pr.top},${pr.w},${pr.h}:${pr.wall.s || ''}:${pr.wall.t || ''}`;
  let sp = propCache.get(key);
  if (sp) return sp;
  if (propBuilds >= PROP_BUILDS_PER_FRAME) return null;
  propBuilds += 1;
  const { left, right, top, bottom } = pr.ext;
  const w = pr.w + left + right, h = pr.h + top + bottom;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * PIX);
  c.height = Math.ceil(h * PIX);
  const g = c.getContext('2d');
  g.scale(ART, ART);
  drawProp(g, pr.wall, left * U, top * U, pr.w * U, pr.h * U, U);
  sp = { canvas: c, left, top, w, h };
  propCache.set(key, sp);
  if (propCache.size > 600) propCache.delete(propCache.keys().next().value);
  return sp;
}

/** Um objeto alto na tela. Se ele esconde o próprio jogador (atrás da copa), fica translúcido. */
function drawPropOnScreen(pr, toScreenX, toScreenY, T, me) {
  const sp = propSprite(pr);
  if (!sp) return;
  const x = toScreenX(pr.x - sp.left), y = toScreenY(pr.top - sp.top);
  const covers = me && me.y < pr.y && me.y > pr.top - sp.top && me.x > pr.x - sp.left && me.x < pr.x + pr.w + sp.right;
  if (covers) ctx.globalAlpha = 0.55;
  ctx.drawImage(sp.canvas, x, y, sp.w * T, sp.h * T);
  if (covers) ctx.globalAlpha = 1;
}

/** Poça d'água da Névoa (chão molhado de neblina): reflexo azulado, borda escura e um brilho. */
function drawPuddle(g, cx, cy, r) {
  const rx = 3.5 + r() * 3, ry = rx * (0.45 + r() * 0.15);
  g.fillStyle = 'rgba(40, 60, 70, 0.35)';
  g.beginPath(); g.ellipse(cx, cy + 0.4, rx + 0.8, ry + 0.6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(120, 160, 180, 0.7)';
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(190, 220, 232, 0.65)';
  g.beginPath(); g.ellipse(cx - rx * 0.3, cy - ry * 0.3, rx * 0.4, ry * 0.25, 0, 0, Math.PI * 2); g.fill();
  if (r() < 0.6) { g.fillStyle = 'rgba(80, 120, 140, 0.6)'; g.beginPath(); g.ellipse(cx + rx * 1.1, cy + ry * 0.3, rx * 0.35, ry * 0.4, 0, 0, Math.PI * 2); g.fill(); }
}

/**
 * Bordas entre chãos naturais: o de prioridade maior avança sobre o vizinho em tufos irregulares (a grama sobre a
 * terra, a terra sobre os seixos...), e a água ganha margem e espuma. Chão feito por gente (calçamento, assoalho,
 * ponte, arena) fica reto. Sem isso, cada casa é um quadrado e o mapa parece grade.
 */
const EDGE = {
  grass: { p: 6, base: '#4f9a3a', dark: '#3a7a2b', tip: '#6cbd52', blades: true },
  moss: { p: 6, base: '#5b8a62', dark: '#41684a', tip: '#7aa67c', blades: true },
  desert: { p: 3, base: '#e4c38a', dark: '#d4ae70', tip: '#f0d6a4' },
  darkgrass: { p: 6, base: '#2d6230', dark: '#1f4a24', tip: '#3f8040', blades: true },
  burnt: { p: 4, base: '#2e2a22', dark: '#1f1c17', tip: '#40382c' },
  path: { p: 3, base: '#b8935c', dark: '#a8834e', tip: '#c9a56d' },
  sand: { p: 3, base: '#e2cd96', dark: '#d3bb80', tip: '#eedcab' },
  pebbles: { p: 2, base: '#8a8478', dark: '#6f6a60', tip: '#a39d90' },
  dirt: { p: 2, base: '#6f6150', dark: '#5f5242', tip: '#806f5c' },
  ash: { p: 1, base: '#4a4744', dark: '#3b3836', tip: '#5c5955' },
};

function drawFringe(g, x, y, ux, uy) {
  const here = groundKind(x, y);
  const me = EDGE[here];
  const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  if (me) {
    for (const [dx, dy] of sides) {
      const other = EDGE[groundKind(x + dx, y + dy)];
      if (!other || other.p <= me.p) continue;
      let h = cellHash(x * 3 + dx + 7, y * 3 + dy + 11);
      const next = () => (h = (h * 1103515245 + 12345) >>> 0) / 4294967296;
      const n = other.blades ? 7 : 9;
      for (let i = 0; i < n; i++) {
        const t = ((i + next()) / n) * U;                       // ao longo da borda
        const depth = other.blades ? 0.8 + next() * 2.2 : 1 + next() * 3.2;   // quanto avança
        const ex = dx === 0 ? ux + t : dx === -1 ? ux : ux + U;
        const ey = dy === 0 ? uy + t : dy === -1 ? uy : uy + U;
        const ix = -dx, iy = -dy;                              // para dentro desta casa
        g.fillStyle = other.base;
        g.beginPath();
        g.ellipse(ex + ix * depth * 0.35, ey + iy * depth * 0.35, dx === 0 ? 1.2 + next() : depth * 0.75, dy === 0 ? 1.2 + next() : depth * 0.75, 0, 0, Math.PI * 2);
        g.fill();
        if (other.blades) {                                     // a grama solta folhinhas para fora
          fine(g, other.dark, ex + ix * depth + (dx === 0 ? 0.4 : 0), ey + iy * depth + (dy === 0 ? 0.4 : 0), PX, PX * 3);
          fine(g, other.tip, ex + ix * (depth - 0.4) + (dx === 0 ? 1 : 0), ey + iy * (depth - 0.4) + (dy === 0 ? 1 : 0), PX, PX * 2);
        } else {
          fine(g, other.dark, ex + ix * depth * 0.7, ey + iy * depth * 0.7, PX * 2, PX);
        }
      }
    }
  } else if (here === 'water') {
    for (const [dx, dy] of sides) {
      const n = groundKind(x + dx, y + dy);
      if (n === 'water' || n === 'bridge' || n === 'stonebridge' || n === 'void') continue;
      const [rx, ry, rw, rh] = dy === -1 ? [ux, uy, U, 1.6] : dy === 1 ? [ux, uy + U - 1.6, U, 1.6] : dx === -1 ? [ux, uy, 1.6, U] : [ux + U - 1.6, uy, 1.6, U];
      g.fillStyle = 'rgba(40, 30, 20, 0.5)';                  // a margem molhada
      g.fillRect(rx, ry, rw, rh);
      g.fillStyle = 'rgba(30, 60, 90, 0.35)';                 // água mais escura junto da margem
      g.fillRect(rx + (dx === 1 ? -1.4 : dx === -1 ? 1.6 : 0), ry + (dy === 1 ? -1.4 : dy === -1 ? 1.6 : 0), dx === 0 ? U : 1.4, dy === 0 ? U : 1.4);
      let h = cellHash(x + 31, y + 17 + dx * 5 + dy * 3);
      for (let i = 0; i < 6; i++) {                            // espuma
        h = (h * 1103515245 + 12345) >>> 0;
        const t = ((h % 1000) / 1000) * U;
        const fx = dy === 0 ? rx + (dx === -1 ? 1.7 : -0.7) : ux + t, fy = dx === 0 ? ry + (dy === -1 ? 1.7 : -0.7) : uy + t;
        fine(g, 'rgba(225, 242, 255, 0.7)', fx, fy, dy === 0 ? PX : PX * 3, dx === 0 ? PX : PX * 3);
      }
    }
  }
}

/**
 * Manchas grandes de luz e sombra no chão dos mapas naturais: círculos bem suaves (2 a 5 casas) presos numa grade do
 * mundo a cada 4 casas, com sorteio por posição. Cada bloco desenha os que encostam nele: emenda sem costura.
 */
function drawPatches(g, cx, cy) {
  const kind = state.maps[state.mapId]?.kind;
  if (kind !== 'forest' && kind !== 'wild' && kind !== 'cave' && kind !== 'village') return;
  const soft = kind === 'village' ? 0.55 : 1;           // na vila, mais leve (calçamento claro)
  const x0 = cx * CHUNK, y0 = cy * CHUNK, STEP = 4;
  for (let gy = Math.floor((y0 - 6) / STEP); gy <= Math.floor((y0 + CHUNK + 6) / STEP); gy++) {
    for (let gx = Math.floor((x0 - 6) / STEP); gx <= Math.floor((x0 + CHUNK + 6) / STEP); gx++) {
      const h = cellHash(gx * 31 + 5, gy * 17 + 9);
      const r = rng(h);
      const px = (gx + r()) * STEP, py = (gy + r()) * STEP, rad = 2 + r() * 3;
      const light = r() < 0.45;
      const a = (0.06 + r() * 0.08) * soft;
      const sx = (px - x0) * U, sy = (py - y0) * U, sr = rad * U;
      const grad = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
      grad.addColorStop(0, light ? `rgba(255, 240, 170, ${a})` : `rgba(0, 20, 10, ${a * 1.4})`);
      grad.addColorStop(1, light ? 'rgba(255, 240, 170, 0)' : 'rgba(0, 20, 10, 0)');
      g.fillStyle = grad;
      g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    }
  }
}

/**
 * Enfeites espalhados no chão (só desenho, sem colisão), sorteados por casa: tufos altos, flores, pedrinhas,
 * cogumelos e moitas na mata; pedrinhas na trilha; gravetos queimados nas cinzas; cristais na caverna.
 */
/**
 * Mato da Floresta (uma peça maior por casa, às vezes): moita redonda (com frutinhas), samambaia, canteiro de flores
 * ou pedra com musgo. Só no meio da grama (as 8 casas em volta também são grama): longe de trilha, rio e clareira.
 * Cabe na casa (o bloco do chão corta o que passa da borda).
 */
function drawUndergrowth(g, x, y, ux, uy) {
  const roll = cellHash(x * 5 + 17, y * 11 + 3) % 100;
  if (roll >= 11) return;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (groundAt(state.places, x + dx, y + dy) !== 'darkgrass') return;
  const r = rng(cellHash(x * 3 + 7, y * 7 + 1));
  const cx = ux + 5 + r() * 6, cy = uy + 7 + r() * 5;
  if (roll < 4) {                                             // moita
    g.fillStyle = 'rgba(0, 0, 0, 0.25)';
    g.beginPath(); g.ellipse(cx + 0.6, cy + 2.6, 6, 2.2, 0, 0, Math.PI * 2); g.fill();
    const pal = r() < 0.5 ? ['#1f4a24', '#2f6a33', '#3f8040', '#6aa85a'] : ['#24502e', '#336f3c', '#47874a', '#79b56a'];
    for (const [bx, by, br] of [[-3.2, 0, 3.4], [3, 0.2, 3.3], [0, -2, 4], [-1.5, -3.5, 2.6], [2, -3.2, 2.5]]) {
      g.fillStyle = pal[0];
      g.beginPath(); g.arc(cx + bx, cy + by + 0.6, br + 0.5, 0, Math.PI * 2); g.fill();
    }
    for (const [bx, by, br] of [[-3.2, 0, 3.4], [3, 0.2, 3.3], [0, -2, 4], [-1.5, -3.5, 2.6], [2, -3.2, 2.5]]) {
      g.fillStyle = pal[1];
      g.beginPath(); g.arc(cx + bx, cy + by, br, 0, Math.PI * 2); g.fill();
      g.fillStyle = pal[2];
      g.beginPath(); g.arc(cx + bx - br * 0.25, cy + by - br * 0.3, br * 0.55, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 5; i++) fine(g, pal[3], cx - 4 + r() * 8, cy - 5 + r() * 5, PX * 2, PX * 2);
    if (r() < 0.45) {                                         // frutinhas
      const berry = r() < 0.5 ? '#d8344a' : '#4a6ad8';
      for (let i = 0; i < 4; i++) {
        const bx = cx - 3.5 + r() * 7, by = cy - 4 + r() * 4;
        g.fillStyle = berry;
        g.beginPath(); g.arc(bx, by, 0.75, 0, Math.PI * 2); g.fill();
        fine(g, '#ffffff', bx - 0.3, by - 0.3);
      }
    }
  } else if (roll < 7) {                                      // samambaia: folhas compridas abrindo do meio
    g.fillStyle = 'rgba(0, 0, 0, 0.2)';
    g.beginPath(); g.ellipse(cx, cy + 1.5, 5, 1.6, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.42 + (r() - 0.5) * 0.2, len = 5 + r() * 2.5;
      const tx = cx + Math.cos(a) * len, ty = cy + 1 + Math.sin(a) * len * 0.8;
      g.strokeStyle = i % 2 ? '#2f6a33' : '#3f8040';
      g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(cx, cy + 1); g.quadraticCurveTo((cx + tx) / 2, (cy + ty) / 2 - 1.5, tx, ty); g.stroke();
      for (let k = 1; k < 4; k++) {
        const fx = cx + (tx - cx) * (k / 4), fy = cy + 1 + (ty - cy - 1) * (k / 4) - 0.8;
        fine(g, '#5c9a44', fx - 0.8, fy, 1.6 - k * 0.3, PX * 2);
      }
    }
  } else if (roll < 9) {                                      // canteiro de flores
    const petal = ['#f4efe0', '#f2d25a', '#c9a6e8', '#f48aa0', '#8ac8f4'][r() * 5 | 0];
    for (let i = 0; i < 7; i++) {
      const fx = cx - 4 + r() * 8, fy = cy - 2.5 + r() * 5;
      fine(g, '#2f6a33', fx, fy, PX, 1.6);
      g.fillStyle = petal;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(fx + Math.cos(k * 1.57) * 0.7, fy - 0.3 + Math.sin(k * 1.57) * 0.7, 0.55, 0, Math.PI * 2); g.fill(); }
      fine(g, '#e0882a', fx - PX, fy - 0.3 - PX, PX * 2, PX * 2);
    }
  } else {                                                    // pedra com musgo
    g.fillStyle = 'rgba(0, 0, 0, 0.28)';
    g.beginPath(); g.ellipse(cx + 0.8, cy + 2, 5, 2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4f4740';
    g.beginPath(); g.ellipse(cx, cy, 4.6, 3.4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6d645a';
    g.beginPath(); g.ellipse(cx - 0.6, cy - 0.6, 3.8, 2.7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4a7a35';
    g.beginPath(); g.ellipse(cx - 0.8, cy - 2, 3.2, 1.4, 0, Math.PI, Math.PI * 2); g.fill();
    fine(g, '#6aa85a', cx - 2.5, cy - 2.6, 2, PX * 2);
    fine(g, '#948a7c', cx + 1.5, cy - 1, 1.2, PX * 2);
  }
}

function drawScatter(g, x, y, ux, uy) {
  const ground = groundKind(x, y);
  if (ground === 'darkgrass') drawUndergrowth(g, x, y, ux, uy);
  const h = cellHash(x * 7 + 1, y * 5 + 3);
  const roll = h % 1000;
  const r = rng(h);
  const px = ux + 2 + r() * (U - 4), py = uy + 3 + r() * (U - 5);
  if (themeAt(state.places, x, y) === 'nevoa' && (ground === 'moss' || ground === 'stone') && roll >= 955) return drawPuddle(g, ux + U / 2, uy + U / 2, r);
  if (ground === 'grass' || ground === 'darkgrass' || ground === 'moss') {
    const pal = ground === 'grass' ? LAWN : ground === 'moss' ? MOSS : DARK_GRASS;
    if (roll < 60) {                                          // capim alto
      for (let i = 0; i < 7; i++) {
        const bx = px + (r() - 0.5) * 4, bh = 2.2 + r() * 2.4;
        fine(g, pal[1], bx, py - bh, PX * 2, bh);
        fine(g, pal[3], bx, py - bh, PX, bh * 0.6);
        fine(g, pal[4], bx, py - bh - PX);
      }
    } else if (roll < 80) {                                   // flores
      const petal = ['#f4efe0', '#f2d25a', '#c9a6e8', '#f48aa0'][h % 4];
      for (let i = 0; i < 4; i++) {
        const fx = px + (r() - 0.5) * 5, fy = py + (r() - 0.5) * 3;
        fine(g, pal[1], fx, fy, PX, 1.2);
        g.fillStyle = petal;
        g.beginPath(); g.arc(fx, fy - 0.3, 0.75, 0, Math.PI * 2); g.fill();
        fine(g, '#e0882a', fx, fy - 0.3);
      }
    } else if (roll < 93) {                                   // pedrinha
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(px + 0.6, py + 0.6, 2.1, 1.1, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7d7a73';
      g.beginPath(); g.ellipse(px, py, 2, 1.3, 0, 0, Math.PI * 2); g.fill();
      fine(g, '#a9a59b', px - 1, py - 0.8, 1.2, PX * 2);
    } else if (roll < 101 && ground === 'darkgrass') {        // cogumelos
      for (const [dx, cap] of [[0, '#c8392a'], [1.8, '#b5824a']]) {
        fine(g, '#efe6d0', px + dx - PX, py - 1.2, PX * 3, 1.2);
        g.fillStyle = cap;
        g.beginPath(); g.ellipse(px + dx, py - 1.3, 1.3, 0.8, 0, Math.PI, Math.PI * 2); g.fill();
        if (cap === '#c8392a') fine(g, '#f4efe0', px + dx - 0.4, py - 1.7);
      }
    } else if (roll < 116) {                                  // moita
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath(); g.ellipse(px + 0.8, py + 0.4, 3.4, 1.4, 0, 0, Math.PI * 2); g.fill();
      for (const [dx, dy, rr, c] of [[-1.4, -0.8, 1.7, pal[1]], [1.3, -0.8, 1.7, pal[1]], [0, -1.6, 2, pal[2]], [-0.6, -2.2, 1.1, pal[3]]]) {
        g.fillStyle = c;
        g.beginPath(); g.arc(px + dx, py + dy, rr, 0, Math.PI * 2); g.fill();
      }
      fine(g, pal[4], px - 1, py - 3, PX * 2, PX);
    } else if (roll < 124) {                                  // graveto caído
      g.save();
      g.translate(px, py);
      g.rotate((r() - 0.5) * 1.2);
      fine(g, '#4a2e17', -2.5, -PX, 5, PX * 2);
      fine(g, '#6b4423', -2.5, -PX, 5, PX);
      fine(g, '#4a2e17', 0.5, -1.2, PX * 2, 1.1);
      g.restore();
    }
  } else if (ground === 'stone' && roll < 90) {         // calçamento da vila: musgo nas juntas, rachaduras e folhas
    const theme = themeAt(state.places, x, y);
    if (roll < 30) {
      const tuft = theme === 'areia' ? ['#c29a5e', '#e2c48c'] : ['#5c7a3a', '#7a9a4a'];      // na Areia, areia nas juntas
      for (let i = 0; i < 4; i++) fine(g, tuft[i % 2], px + (r() - 0.5) * 5, py + (r() - 0.5) * 2, 1 + r(), PX * 2);
    } else if (roll < 55) {
      let qx = px, qy = py;
      for (let k = 0; k < 4; k++) { fine(g, 'rgba(70, 66, 60, 0.5)', qx, qy, PX * 2, PX * 3); qx += (r() - 0.5) * 2; qy += 0.9; }
    } else {
      // pétala de cerejeira só onde há cerejeira (Folha e Nuvem); bambu na Névoa; na Areia, uma pedrinha
      const leaf = theme === 'areia' ? '#a8804a' : theme === 'nevoa' ? (r() < 0.5 ? '#78b04f' : '#c2b060') : r() < 0.5 ? '#f6b4c8' : r() < 0.5 ? '#c98a3a' : '#7a9a4a';
      g.fillStyle = leaf;
      g.beginPath(); g.ellipse(px, py, 1.2, 0.6, r() * 3, 0, Math.PI * 2); g.fill();
    }
  } else if (ground === 'desert' && roll < 110) {            // deserto: pedrinhas, capim seco e um ossinho
    if (roll < 55) {
      for (let i = 0; i < 3; i++) fine(g, r() < 0.5 ? '#b8915a' : '#9a7444', px + (r() - 0.5) * 6, py + (r() - 0.5) * 4, PX * (3 + Math.floor(r() * 3)), PX * 2);
    } else if (roll < 95) {
      for (let i = 0; i < 5; i++) {
        const bx = px + (r() - 0.5) * 3, bh = 1.5 + r() * 1.8;
        fine(g, '#a88a4a', bx, py - bh, PX, bh);
        fine(g, '#d2b878', bx, py - bh, PX, bh * 0.4);
      }
    } else {
      fine(g, '#efe6d0', px - 1.5, py, 3, PX * 2);
      fine(g, '#efe6d0', px - 1.8, py - PX, PX * 2, PX * 4);
      fine(g, '#efe6d0', px + 1.4, py - PX, PX * 2, PX * 4);
    }
  } else if (ground === 'path' && roll < 70) {
    for (let i = 0; i < 3; i++) {
      const sx = px + (r() - 0.5) * 6, sy = py + (r() - 0.5) * 4;
      fine(g, '#8d7350', sx, sy, PX * 4, PX * 3);
      fine(g, '#d7bd8c', sx, sy, PX * 2, PX);
    }
  } else if (ground === 'ash' && roll < 160) {                // cinzas: carvão, pedrinhas e um ponto de brasa
    for (let i = 0; i < 3; i++) fine(g, r() < 0.5 ? '#2a2725' : '#6a6662', px + (r() - 0.5) * 6, py + (r() - 0.5) * 4, PX * (2 + Math.floor(r() * 3)), PX * 2);
    if (roll < 25) fine(g, '#d2541f', px, py, PX, PX);
  } else if (ground === 'burnt' && roll < 90) {
    fine(g, '#1a1410', px - 2, py, 4, PX * 2);
    fine(g, '#3a2a1e', px - 1, py - 1, 3, PX * 2);
    if (roll < 30) fine(g, '#d2541f', px, py - PX);
  } else if (ground === 'cave' && roll < 70) {                // cristais roxos que brilham fraco
    for (const [dx, hh] of [[0, 2.6], [1, 1.8], [-0.9, 1.5]]) {
      g.fillStyle = '#4a2a66';
      g.beginPath(); g.moveTo(px + dx - 0.5, py); g.lineTo(px + dx, py - hh); g.lineTo(px + dx + 0.5, py); g.closePath(); g.fill();
      fine(g, '#b78ae0', px + dx - PX, py - hh + 0.3, PX, hh * 0.6);
    }
  } else if ((ground === 'cave' || ground === 'dirt') && roll < 150) {
    for (let i = 0; i < 3; i++) fine(g, ground === 'cave' ? '#3b3346' : '#8f8a80', px + (r() - 0.5) * 6, py + (r() - 0.5) * 4, PX * 4, PX * 3);
  }
}

/** Escuro da caverna: tudo escurece, menos um círculo de luz em volta do jogador (raio de ~6 casas). */
/**
 * O clima de cada mapa (estilo da prova de arte: luz e cor contam onde se está). `canopy`: sombras das copas passando
 * com o vento; `shafts`: faixas de sol na diagonal; `motes`: partículas no ar (pólen, brasas, esporos), com cor, quanto
 * sobem e quantas; `vig`: a cor das bordas da tela. Tudo preso ao mundo (anda com o mapa, não com a câmera).
 */
const ATMOS = {
  forest: { canopy: 0.2, shafts: [255, 236, 170, 0.05], motes: { rgb: [255, 246, 190], rise: 0.08, cell: 3, glow: true }, vig: 'rgba(4, 18, 14, 0.42)' },
  clareira_queimada: { motes: { rgb: [255, 150, 60], rise: 0.7, cell: 2, glow: true }, vig: 'rgba(48, 10, 2, 0.5)', haze: 'rgba(120, 50, 20, 0.07)' },
  cave: { motes: { rgb: [205, 150, 255], rise: 0.05, cell: 3, glow: true }, vig: null },
  village: { motes: { rgb: [255, 240, 210], rise: 0.04, cell: 5, glow: false }, vig: 'rgba(36, 20, 8, 0.2)' },
  wild: { motes: { rgb: [230, 210, 170], rise: 0.03, cell: 4, glow: false }, vig: 'rgba(24, 14, 6, 0.32)' },
};

function drawAtmosphere(toScreenX, toScreenY, T, now) {
  const map = state.maps[state.mapId];
  const mood = map && (ATMOS[map.id] || ATMOS[map.kind]);
  if (!mood) return;
  const ox = toScreenX(0), oy = toScreenY(0);
  const x0 = -ox / T, y0 = -oy / T, x1 = x0 + viewW / T, y1 = y0 + viewH / T;   // o pedaço do mundo na tela (casas)
  const t = now / 1000;
  ctx.save();
  if (mood.canopy) {                                  // sombras das copas, andando devagar com o vento
    const S = 7;
    for (let gy = Math.floor(y0 / S) - 1; gy <= Math.ceil(y1 / S) + 1; gy++) {
      for (let gx = Math.floor(x0 / S) - 2; gx <= Math.ceil(x1 / S) + 1; gx++) {
        const h = cellHash(gx * 13 + 3, gy * 7 + 5);
        if (h % 3 === 0) continue;
        const cx = (gx + 0.2 + (h % 100) / 160) * S + ((t * 0.18 + (h % 37)) % (S * 2)) - S * 0.5 + Math.sin(t * 0.3 + h) * 0.6;
        const cy = (gy + 0.2 + ((h >> 8) % 100) / 160) * S + Math.cos(t * 0.25 + h) * 0.4;
        const r = (2.4 + ((h >> 16) % 100) / 45) * T, sx = toScreenX(cx), sy = toScreenY(cy);
        if (sx + r < 0 || sx - r > viewW || sy + r < 0 || sy - r > viewH) continue;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, `rgba(6, 22, 16, ${mood.canopy})`);
        g.addColorStop(1, 'rgba(6, 22, 16, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.75, 0.4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  if (mood.haze) { ctx.fillStyle = mood.haze; ctx.fillRect(0, 0, viewW, viewH); }
  ctx.globalCompositeOperation = 'lighter';
  if (mood.shafts) {                                  // faixas de sol na diagonal
    const [r, g, b, a] = mood.shafts, SP = 16;
    for (let k = Math.floor(x0 / SP) - 1; k <= Math.ceil(x1 / SP) + 1; k++) {
      const h = cellHash(k * 31 + 7, 11);
      const bx = toScreenX(k * SP + (h % 9) + Math.sin(t * 0.2 + k) * 0.8), bw = (1.4 + (h % 5) * 0.4) * T;
      const pulse = 0.7 + 0.3 * Math.sin(t * 0.5 + k * 1.3);
      const gr = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
      gr.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      gr.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${a * pulse})`);
      gr.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = gr;
      const skew = viewH * 0.45;
      ctx.beginPath();
      ctx.moveTo(bx - bw + skew, 0); ctx.lineTo(bx + bw + skew, 0); ctx.lineTo(bx + bw - skew, viewH); ctx.lineTo(bx - bw - skew, viewH);
      ctx.closePath(); ctx.fill();
    }
  }
  if (mood.motes) {                                   // pólen, brasas, esporos: um por célula, subindo e balançando
    const { rgb: [r, g, b], rise, cell: C, glow } = mood.motes;
    const ps = Math.max(1.5, T * 0.045);
    for (let gy = Math.floor(y0 / C) - 1; gy <= Math.ceil(y1 / C) + 1; gy++) {
      for (let gx = Math.floor(x0 / C) - 1; gx <= Math.ceil(x1 / C) + 1; gx++) {
        const h = cellHash(gx * 17 + 1, gy * 23 + 9);
        if (h % 2) continue;
        const life = 6 + (h % 5);                         // segundos para subir o caminho todo e recomeçar
        const ph = ((t + (h % 1000) / 100) % life) / life;
        const px = (gx + (h % 97) / 97) * C + Math.sin(t * 0.8 + h) * 0.35;
        const py = (gy + ((h >> 7) % 97) / 97) * C - ph * rise * life;
        const sx = toScreenX(px), sy = toScreenY(py);
        if (sx < -8 || sx > viewW + 8 || sy < -8 || sy > viewH + 8) continue;
        const a = Math.sin(ph * Math.PI) * (0.55 + 0.45 * Math.sin(t * 3 + h));
        if (glow) {
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(a * 0.25).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(sx, sy, ps * 2.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(a * 0.9).toFixed(3)})`;
        ctx.fillRect(Math.round(sx - ps / 2), Math.round(sy - ps / 2), Math.ceil(ps), Math.ceil(ps));
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  if (mood.vig) {                                     // as bordas da tela na cor do lugar
    const d = Math.hypot(viewW, viewH) / 2;
    const g = ctx.createRadialGradient(viewW / 2, viewH / 2, d * 0.55, viewW / 2, viewH / 2, d);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, mood.vig);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ o céu: hora e clima (servidor: weather.ts)

/** O céu que o servidor mandou e quando chegou (a hora anda sozinha daqui em diante). */
function setSky(sky) {
  state.sky = { ...sky, recvAt: performance.now() };
  renderSlots();
  renderBuffs();
}

/** Onde o ciclo está agora (0..1) e a fase, pelo relógio do servidor. */
function skyClock() {
  const s = state.sky;
  if (!s) return null;
  const t = s.serverNow + s.offsetMs + (performance.now() - s.recvAt);
  const progress = (((t % s.cycleMs) + s.cycleMs) % s.cycleMs) / s.cycleMs;
  let phase = 'amanhecer';
  for (const p of ['amanhecer', 'dia', 'entardecer', 'noite']) if (progress >= s.phaseStarts[p]) phase = p;
  return { progress, phase };
}

const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
/** Escuridão (0 de dia, ~1 de noite) e o tom quente do amanhecer e do entardecer, suaves entre as fases. */
function skyLight(progress) {
  const st = state.sky.phaseStarts;
  const dusk = smooth(st.entardecer, st.noite, progress), dawn = 1 - smooth(st.amanhecer, st.dia, progress);
  const dark = progress >= st.noite ? 1 : progress >= st.entardecer ? dusk : progress < st.dia ? dawn : 0;
  const warm = progress >= st.entardecer && progress < st.noite ? Math.sin(dusk * Math.PI)
    : progress < st.dia ? Math.sin((1 - dawn) * Math.PI) : 0;
  return { dark, warm };
}

/** O que o céu muda nos jutsus AQUI (null dentro de casa e na caverna, como no servidor). */
function skyHere() {
  const kind = state.maps[state.mapId]?.kind;
  if (!state.sky || !['village', 'forest', 'wild'].includes(kind)) return null;
  return state.sky.effects;
}

const SKY_NAMES = { normal: 'Céu limpo', quente: 'Dia quente', chuva: 'Chuva', neblina: 'Neblina' };
const PHASE_NAMES = { amanhecer: 'Amanhecer', dia: 'Dia', entardecer: 'Entardecer', noite: 'Noite' };
const SKY_ICONS = { normal: '', quente: '🌡️', chuva: '🌧️', neblina: '🌫️' };
const PHASE_ICONS = { amanhecer: '🌅', dia: '☀️', entardecer: '🌇', noite: '🌙' };
const MECH_NAMES = { fire: 'Fogo', water: 'Água', lightning: 'Raio', illusion: 'Ilusão', shadow: 'Sombra' };

/** "Água +20%, Raio +15%, Fogo −20%" (dano) e "Ilusão atordoa +30%" (tempo dos efeitos). */
function skyEffectsText(fx) {
  const pct = (v) => `${v > 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%`;
  const dmg = Object.entries(fx.damage).map(([m, v]) => `${MECH_NAMES[m] || m} ${pct(v)}`);
  const st = Object.entries(fx.status).map(([m, v]) => `${MECH_NAMES[m] || m} ${m === 'shadow' ? 'prende' : 'atordoa'} ${pct(v)}`);
  return [...dmg, ...st].join(', ');
}

/** Aviso quando muda: "🌧️ Chuva: Água +5%...". */
function announceSky(changed) {
  const s = state.sky;
  if (!s) return;
  const fx = skyEffectsText(s.effects);
  const head = changed === 'phase' ? `${PHASE_ICONS[s.phase]} ${PHASE_NAMES[s.phase]}` : `${SKY_ICONS[s.weather] || PHASE_ICONS[s.phase]} ${SKY_NAMES[s.weather]}`;
  showToast(fx ? `${head}: ${fx} (ao ar livre).` : `${head}.`, 4000);
}

/**
 * O céu na tela (só ao ar livre): o tom quente do dia quente, o cinza da chuva com as gotas, os respingos e um
 * relâmpago de vez em quando, a neblina passando, o laranja do amanhecer e do entardecer, e a noite: uma camada
 * escura com buracos de luz em volta do jogador, dos outros, das lanternas, dos postes e das Pedras-Selo acesas.
 */
const nightLayer = document.createElement('canvas');
function drawSky(toScreenX, toScreenY, T, now, me) {
  const kind = state.maps[state.mapId]?.kind;
  const clock = skyClock();
  if (!clock || !['village', 'forest', 'wild'].includes(kind)) return;
  const { dark, warm } = skyLight(clock.progress);
  const weather = state.sky.weather;
  const t = now / 1000;
  const ox = toScreenX(0), oy = toScreenY(0);
  const x0 = -ox / T, y0 = -oy / T, x1 = x0 + viewW / T, y1 = y0 + viewH / T;
  ctx.save();
  if (weather === 'quente') {
    ctx.fillStyle = 'rgba(255, 186, 80, 0.1)';
    ctx.fillRect(0, 0, viewW, viewH);
  } else if (weather === 'chuva') {
    ctx.fillStyle = 'rgba(34, 48, 72, 0.24)';
    ctx.fillRect(0, 0, viewW, viewH);
    // respingos no chão (presos ao mundo): um anel que abre e some
    ctx.strokeStyle = 'rgba(210, 228, 255, 0.5)';
    ctx.lineWidth = 1;
    for (let gy = Math.floor(y0) - 1; gy <= Math.ceil(y1); gy++) {
      for (let gx = Math.floor(x0) - 1; gx <= Math.ceil(x1); gx++) {
        const h = cellHash(gx * 11 + 5, gy * 13 + 7);
        if (h % 3) continue;
        const ph = ((t * 1.6 + (h % 100) / 100) % 1);
        const sx = toScreenX(gx + (h % 89) / 89), sy = toScreenY(gy + ((h >> 8) % 89) / 89);
        ctx.globalAlpha = 1 - ph;
        ctx.beginPath(); ctx.ellipse(sx, sy, 1 + ph * T * 0.14, (1 + ph * T * 0.14) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // as gotas caindo (na tela, inclinadas pelo vento)
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.42)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const n = Math.round((viewW * viewH) / 5200);
    for (let i = 0; i < n; i++) {
      const h = cellHash(i * 7 + 3, i * 3 + 11);
      const speed = 0.9 + (h % 50) / 100;
      const y = ((h % 1000) / 1000 * (viewH + 60) + t * 620 * speed) % (viewH + 60) - 30;
      const x = (((h >> 10) % 1000) / 1000 * (viewW + 80) - t * 90 * speed % (viewW + 80) + viewW + 80) % (viewW + 80) - 40;
      ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 15);
    }
    ctx.stroke();
    // relâmpago: dois clarões rápidos, de ~30 em ~30 s
    const cyc = t % 31;
    if (cyc < 0.09 || (cyc > 0.18 && cyc < 0.24)) { ctx.fillStyle = 'rgba(235, 240, 255, 0.28)'; ctx.fillRect(0, 0, viewW, viewH); }
  } else if (weather === 'neblina') {
    ctx.fillStyle = 'rgba(200, 210, 222, 0.2)';
    ctx.fillRect(0, 0, viewW, viewH);
    const S = 6;
    for (let gy = Math.floor(y0 / S) - 1; gy <= Math.ceil(y1 / S) + 1; gy++) {
      for (let gx = Math.floor(x0 / S) - 2; gx <= Math.ceil(x1 / S) + 1; gx++) {
        const h = cellHash(gx * 19 + 2, gy * 29 + 4);
        const cx = (gx + (h % 100) / 100) * S + ((t * 0.25 + (h % 31)) % (S * 2)) - S, cy = (gy + ((h >> 8) % 100) / 100) * S;
        const r = (3.5 + ((h >> 16) % 100) / 30) * T, sx = toScreenX(cx), sy = toScreenY(cy);
        if (sx + r < 0 || sx - r > viewW || sy + r < 0 || sy - r > viewH) continue;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, 'rgba(225, 232, 240, 0.32)');
        g.addColorStop(1, 'rgba(225, 232, 240, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  if (warm > 0.01) {                                  // amanhecer e entardecer: o laranja
    ctx.fillStyle = `rgba(255, 128, 60, ${(0.16 * warm).toFixed(3)})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }
  if (dark > 0.01) {                                  // a noite, com os buracos de luz
    const k = 0.5;                                    // meia resolução: luz macia e barata
    const w = Math.ceil(viewW * k), h = Math.ceil(viewH * k);
    if (nightLayer.width !== w || nightLayer.height !== h) { nightLayer.width = w; nightLayer.height = h; }
    const g = nightLayer.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    const alpha = Math.min(0.95, dark * (weather === 'chuva' || weather === 'neblina' ? 0.92 : 0.86));
    g.fillStyle = `rgba(26, 38, 92, ${alpha.toFixed(3)})`;      // azul-noite (multiplica: escurece e esfria)
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    const hole = (wx, wy, rTiles, strength = 1) => {
      const sx = toScreenX(wx) * k, sy = toScreenY(wy) * k, r = rTiles * T * k;
      if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) return;
      const gr = g.createRadialGradient(sx, sy, 0, sx, sy, r);
      gr.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
      gr.addColorStop(0.55, `rgba(0, 0, 0, ${strength * 0.6})`);
      gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = gr;
      g.fillRect(sx - r, sy - r, r * 2, r * 2);
    };
    if (me) hole(me.x, me.y - 0.3, 4.6, 0.95);
    for (const p of state.players.values()) if (p.id !== state.meId) hole(p.x, p.y - 0.3, 1.8, 0.6);
    for (const l of state.lights || []) hole(l.x, l.y - 0.6, 3, 0.9);
    for (const d of state.deco) {
      if (d.k === 'lamp' || d.k === 'toro') hole(d.x + d.w / 2, d.y + d.h / 2, 3.2, 0.9);
      else if (d.k === 'embers' || d.k === 'fire') hole(d.x + d.w / 2, d.y + d.h / 2, 2.4, 0.7);
    }
    for (const s of state.glows || []) hole(s.x + s.w / 2, s.y + s.h / 2, 2.6, 0.8);
    for (const l of state.windows || []) hole(l.x, l.y + (l.kind === 'window' ? 0.6 : 0), l.kind === 'window' ? 1.5 : 2.4, l.kind === 'window' ? 0.55 : 0.85);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(nightLayer, 0, 0, viewW, viewH);
    ctx.globalCompositeOperation = 'source-over';
    // o brilho quente dos postes, das janelas de papel e das lanternas das lojas (de dia não aparece)
    ctx.globalCompositeOperation = 'lighter';
    for (const l of state.windows || []) {
      const sx = toScreenX(l.x), sy = toScreenY(l.y), r = T * (l.kind === 'window' ? 0.55 : 0.9);
      if (sx + r < 0 || sx - r > viewW || sy + r < 0 || sy - r > viewH) continue;
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      gr.addColorStop(0, `rgba(255, ${l.kind === 'window' ? 196 : 120}, ${l.kind === 'window' ? 110 : 70}, ${(0.5 * dark).toFixed(3)})`);
      gr.addColorStop(1, 'rgba(255, 150, 60, 0)');
      ctx.fillStyle = gr;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    for (const d of state.deco) {
      if (d.k !== 'lamp' && d.k !== 'toro') continue;
      const sx = toScreenX(d.x + d.w / 2), sy = toScreenY(d.y + d.h * 0.35), r = T * 1.6;
      if (sx + r < 0 || sx - r > viewW || sy + r < 0 || sy - r > viewH) continue;
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      gr.addColorStop(0, `rgba(255, 200, 110, ${(0.35 * dark).toFixed(3)})`);
      gr.addColorStop(1, 'rgba(255, 160, 60, 0)');
      ctx.fillStyle = gr;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
  }
  ctx.restore();
}

const caveLayer = document.createElement('canvas');
function drawCaveDark(sx, sy, T, toScreenX, toScreenY) {
  const r = T * 6.5;
  const lights = state.lights || [];
  if (!lights.length) {
    const grad = ctx.createRadialGradient(sx, sy, T * 1.5, sx, sy, r);
    grad.addColorStop(0, 'rgba(8, 4, 14, 0)');
    grad.addColorStop(1, 'rgba(8, 4, 14, 0.82)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
    return;
  }
  // Com tochas (mapas em imagem): o escuro numa camada à parte, com um buraco de luz em cada chama.
  const k = 0.5, w = Math.ceil(viewW * k), h = Math.ceil(viewH * k);
  if (caveLayer.width !== w || caveLayer.height !== h) { caveLayer.width = w; caveLayer.height = h; }
  const g = caveLayer.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  const grad = g.createRadialGradient(sx * k, sy * k, T * 1.5 * k, sx * k, sy * k, r * k);
  grad.addColorStop(0, 'rgba(8, 4, 14, 0)');
  grad.addColorStop(1, 'rgba(8, 4, 14, 0.72)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-out';
  const now = performance.now();
  for (const l of lights) {
    const lx = toScreenX(l.x) * k, ly = toScreenY(l.y - 1) * k, lr = T * 3.2 * k;
    if (lx + lr < 0 || lx - lr > w || ly + lr < 0 || ly - lr > h) continue;
    const flick = 0.9 + 0.1 * Math.sin(now / 130 + l.x * 7.1);
    const gr = g.createRadialGradient(lx, ly, 0, lx, ly, lr);
    gr.addColorStop(0, `rgba(0, 0, 0, ${0.95 * flick})`);
    gr.addColorStop(0.5, `rgba(0, 0, 0, ${0.55 * flick})`);
    gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = gr;
    g.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
  }
  ctx.drawImage(caveLayer, 0, 0, viewW, viewH);
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
    case 'slam': {                       // impacto do golpe marcado: anel que abre até o raio e rachaduras
      const r = T * fx.fx * (0.6 + 0.4 * t);
      ctx.globalAlpha = 0.75 * fade;
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = Math.max(2, T * 0.12 * fade);
      ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, T * 0.05);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * r * 0.25, sy + Math.sin(a) * r * 0.16);
        ctx.lineTo(sx + Math.cos(a) * r * 0.85, sy + Math.sin(a) * r * 0.53);
        ctx.stroke();
      }
      break;
    }
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
/** [corpo, morrendo, contorno] de cada monstro: Slime vermelho, Lodo Escuro roxo, Lodo Sombrio azul-petróleo. */
/** Letra da interface (a mesma do HUD em CSS): estreita, lê bem pequena. */
const UI_FONT = '"Barlow Condensed", system-ui, -apple-system, sans-serif';

/** Cores de cada monstro (de cima para baixo no corpo, contorno, e a cor de quando morre). */
const MONSTER_LOOK = {
  slime: { top: '#ff7a63', mid: '#e0412f', low: '#a6261a', edge: '#4a0f0a', dead: '#7a2a22', cheek: '#ffb0a0' },
  lodo_escuro: { top: '#9a62c8', mid: '#673096', low: '#3f1a62', edge: '#1a0828', dead: '#3a1a52', angry: true, drip: '#b98ae6' },
  lodo_sombrio: { top: '#4fa3b4', mid: '#2a6a7a', low: '#17404c', edge: '#08202a', dead: '#1a3e48', angry: true, drip: '#8fd6e4' },
  // O Rei Lodo (chefe): verde-musgo do lago de lodo, bravo, escorrendo, com a coroa (drawMonster) e 2,3x maior.
  rei_lodo: { top: '#8fd06a', mid: '#3f8f52', low: '#225f35', edge: '#0b2a14', dead: '#2a4a30', angry: true, drip: '#b6f08a' },
};
/** Monstros de tinta preta (sprites): ganham um brilho de brasa atrás para não sumirem no chão escuro. */
const DARK_MONSTERS = new Set(['rei_lodo', 'lodo_sombrio']);
/** Tamanho de cada tipo (1 = o slime). */
const MONSTER_SCALE = { rei_lodo: 2.3 };

/**
 * Slime chibi: corpo em gota (base achatada, topo redondo) que respira, degradê de cima para baixo, contorno escuro,
 * brilho na cabeça, olhos grandes com reflexo. Os Lodos têm a sobrancelha brava e escorrem. Morrendo, vira poça.
 */
function drawSlime(g, sx, sy, r, c, wobble, dying, now, monsterId) {
  const id = typeof monsterId === 'number' ? monsterId : Number.parseInt(String(monsterId).replace(/\D/g, ''), 10) || 0;   // "m12" -> 12
  const squash = dying ? 1 - dying * 0.75 : 1;
  const w = r * (1.08 + wobble) * (1 + (1 - squash) * 0.5), h = r * (1.02 - wobble) * squash;
  const base = sy + r * 0.82, top = base - h * 1.75;
  const body = () => {
    g.beginPath();
    g.moveTo(sx - w, base);
    g.bezierCurveTo(sx - w * 1.08, base - h * 0.9, sx - w * 0.62, top, sx, top);
    g.bezierCurveTo(sx + w * 0.62, top, sx + w * 1.08, base - h * 0.9, sx + w, base);
    g.quadraticCurveTo(sx, base + h * 0.22, sx - w, base);
    g.closePath();
  };
  const grad = g.createLinearGradient(0, top, 0, base);
  grad.addColorStop(0, dying ? c.dead : c.top);
  grad.addColorStop(0.55, dying ? c.dead : c.mid);
  grad.addColorStop(1, dying ? c.edge : c.low);
  g.fillStyle = grad;
  body();
  g.fill();
  g.lineWidth = Math.max(2, r * 0.12);
  g.lineJoin = 'round';
  g.strokeStyle = c.edge;
  g.stroke();
  if (dying > 0.6) return;
  // brilho de gelatina e bolhas por dentro
  g.fillStyle = 'rgba(255, 255, 255, 0.55)';
  g.beginPath(); g.ellipse(sx - w * 0.42, top + h * 0.42, w * 0.2, h * 0.16, -0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.8)';
  g.beginPath(); g.arc(sx - w * 0.2, top + h * 0.28, Math.max(1.5, r * 0.06), 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.16)';
  const bob = (now / 900 + (id % 7) / 7) % 1;
  g.beginPath(); g.arc(sx + w * 0.42, base - h * (0.3 + bob * 0.7), r * 0.08, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(sx + w * 0.22, base - h * (0.2 + ((bob + 0.5) % 1) * 0.6), r * 0.05, 0, Math.PI * 2); g.fill();
  // olhos (piscam de vez em quando)
  const blink = ((now + (id % 11) * 397) % 3600) < 120;
  const ey = base - h * 0.92, ex = w * 0.33, er = r * 0.17;
  for (const side of [-1, 1]) {
    const x = sx + side * ex;
    if (blink) {
      g.fillStyle = c.edge;
      g.fillRect(x - er, ey, er * 2, Math.max(1.5, r * 0.06));
      continue;
    }
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(x, ey, er, er * 1.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a0f14';
    g.beginPath(); g.ellipse(x + side * er * 0.15, ey + er * 0.15, er * 0.68, er * 0.9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(x - er * 0.2, ey - er * 0.3, er * 0.3, 0, Math.PI * 2); g.fill();
    if (c.angry) {                                        // sobrancelha brava
      g.strokeStyle = c.edge;
      g.lineWidth = Math.max(2, r * 0.09);
      g.beginPath(); g.moveTo(x + side * er * 1.1, ey - er * 1.8); g.lineTo(x - side * er * 0.9, ey - er * 1.1); g.stroke();
    }
  }
  if (c.cheek) {                                          // bochechas
    g.fillStyle = c.cheek;
    g.globalAlpha *= 0.55;
    for (const side of [-1, 1]) { g.beginPath(); g.ellipse(sx + side * ex * 1.55, ey + er * 1.4, er * 0.7, er * 0.38, 0, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha /= 0.55;
  }
  g.strokeStyle = c.edge;                               // boca
  g.lineWidth = Math.max(1.5, r * 0.06);
  g.beginPath();
  if (c.angry) { g.moveTo(sx - er * 0.8, ey + er * 2); g.lineTo(sx + er * 0.8, ey + er * 1.8); }
  else g.arc(sx, ey + er * 1.3, er * 0.6, 0.2, Math.PI - 0.2);
  g.stroke();
  if (c.drip) {                                           // o lodo escorre na base
    g.fillStyle = c.low;
    for (const k of [-0.55, 0.15, 0.62]) {
      const dy = (Math.sin(now / 400 + k * 9 + id) * 0.5 + 0.5) * r * 0.25;
      g.beginPath(); g.ellipse(sx + w * k, base + r * 0.06 + dy * 0.4, r * 0.08, r * 0.1 + dy * 0.4, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = c.drip;
    g.globalAlpha *= 0.6;
    g.beginPath(); g.arc(sx + w * 0.5, top + h * 0.5, r * 0.05, 0, Math.PI * 2); g.fill();
    g.globalAlpha /= 0.6;
  }
}


/** A coroa do chefe: dourada, três pontas, uma gema vermelha no meio (pixel art, contorno escuro). */
function drawCrown(g, sx, top, r) {
  const w = r * 0.9, h = r * 0.42, y = Math.round(top - h * 0.6);
  const x0 = Math.round(sx - w / 2);
  g.save();
  g.fillStyle = '#3a2408';
  g.fillRect(x0 - 2, y + h * 0.45 - 2, w + 4, h * 0.55 + 4);
  g.fillStyle = '#e8b83a';
  g.fillRect(x0, y + h * 0.45, w, h * 0.55);
  g.fillStyle = '#ffe28a';
  g.fillRect(x0, y + h * 0.45, w, Math.max(2, h * 0.12));
  for (const k of [0, 0.5, 1]) {                                   // as três pontas
    const px = x0 + k * w;
    g.fillStyle = '#3a2408';
    g.beginPath(); g.moveTo(px - w * 0.16, y + h * 0.5); g.lineTo(px, y - 2); g.lineTo(px + w * 0.16, y + h * 0.5); g.fill();
    g.fillStyle = '#e8b83a';
    g.beginPath(); g.moveTo(px - w * 0.11, y + h * 0.5); g.lineTo(px, y + 2); g.lineTo(px + w * 0.11, y + h * 0.5); g.fill();
  }
  g.fillStyle = '#c8261e';
  g.fillRect(Math.round(sx - h * 0.16), Math.round(y + h * 0.58), Math.max(3, h * 0.32), Math.max(3, h * 0.28));
  g.restore();
}

function drawMonster(m, sx, sy, T, now) {
  if (m.type === 'dummy' || m.type === 'sparring') return drawDummyMonster(m, sx, sy, T, now);
  const born = Math.max(0.05, Math.min(1, (now - m.bornAt) / 250));
  const art = monsterArtReady(m.type);
  // Com sprite, a morte é a animação dela (monsterSprites.js); sem, o slime encolhe e some em 0,45 s.
  const dying = m.diedAt ? Math.max(0, Math.min(1, (now - m.diedAt) / (art ? monsterDeathMs(m.type) : 450))) : 0;
  const stunned = now < m.stunnedUntil;
  const rooted = now < m.rootedUntil;
  const wobble = stunned || rooted || dying ? 0 : Math.sin(now / 180 + sx) * 0.06;
  const size = MONSTER_SCALE[m.type] || 1;
  const r = T * 0.4 * size * born * (art ? 1 : 1 - dying * 0.6);
  const ground = sy + r * 0.82;                   // o pé (a mesma base do slime desenhado)
  ctx.save();
  if (!art) ctx.globalAlpha = 1 - dying;
  if (rooted) {                       // Sombra: mancha escura presa no chão
    ctx.fillStyle = 'rgba(42, 33, 64, 0.8)';
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.85, r * 1.5, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  } else if (!dying) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.9, r * 0.95, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (m.id === state.focusId && !dying) drawFocusMarker(sx, sy, r, T, now, 'ring');   // o anel fica no chão, embaixo
  // Tinta preta some no chão escuro da caverna: um brilho de brasa fraco atrás do Rei Lodo e do Lodo Sombrio.
  if (art && DARK_MONSTERS.has(m.type) && !dying) {
    const h = T * 1.1 * size, cy = ground - h * 0.55;
    const glow = ctx.createRadialGradient(sx, cy, h * 0.1, sx, cy, h * 0.75);
    glow.addColorStop(0, 'rgba(255, 150, 70, 0.26)');
    glow.addColorStop(1, 'rgba(255, 150, 70, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sx, cy, h * 0.75, 0, Math.PI * 2); ctx.fill();
  }
  // Sprite (tinta e brasa) quando o atlas chegou; senão o slime desenhado, com a cor de cada tipo.
  const tall = art ? drawMonsterArt(ctx, m, sx, ground, T, now, born) : null;
  if (tall === null) {
    drawSlime(ctx, sx, sy, r, MONSTER_LOOK[m.type] || MONSTER_LOOK.slime, wobble, dying, now, m.id);
    if (state.world.bosses?.[m.type] && !dying) drawCrown(ctx, sx, sy - r * 0.95, r);
  }
  const head = tall === null ? sy - r : ground - tall;        // topo da cabeça na tela
  if (stunned) {                      // Ilusão: estrelinhas girando
    ctx.fillStyle = '#ffe066';
    for (let k = 0; k < 3; k++) {
      const a = now / 250 + (k * Math.PI * 2) / 3;
      ctx.fillRect(Math.round(sx + Math.cos(a) * r * 0.9) - 2, Math.round(head - r * 0.25 + Math.sin(a) * r * 0.3) - 2, 4, 4);
    }
  }
  const isBoss = !!state.world.bosses?.[m.type];                  // o chefe tem a barra no topo (e a coroa na cabeça)
  if (!dying && !isBoss) drawHpBar(sx, head - Math.max(6, T * 0.16), T * 0.8, m.hp / m.maxHp, '#ff5a4a');
  ctx.restore();
  if (!dying) drawFxIcons(m, sx, (tall === null ? sy - r * (isBoss ? 1.55 : 1) : head - T * 0.1) - Math.max(9, T * 0.24), T, now);   // molhado, queimadura, sono...
  if (m.id === state.focusId && !dying) drawFocusMarker(sx, tall === null ? sy : head + r, r, T, now, 'arrow');
}

/**
 * Indicador do alvo focado: anel tracejado girando no chão + seta pulando em cima. `part`: só o anel (desenhado antes
 * do corpo, para ficar no chão) ou só a seta; sem `part`, os dois.
 */
function drawFocusMarker(sx, sy, r, T, now, part, ally = false) {
  const color = ally ? '#7fe0a0' : '#ffb347';           // aliado: verde (Cura, apoio)
  ctx.save();
  if (part !== 'arrow') {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, T * 0.07);
    ctx.setLineDash([T * 0.22, T * 0.12]);
    ctx.lineDashOffset = -now / 30;
    ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.9, r * 1.55, r * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (part === 'ring') { ctx.restore(); return; }
  const bob = Math.sin(now / 160) * T * 0.08;
  const ay = sy - r - T * 0.55 + bob;
  const s = Math.max(6, T * 0.2);
  ctx.fillStyle = color;
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
/** O Mestre (grisalho, colete e a capa da vila) e o Posto de Viagem (capa de viagem e um pergaminho nas costas). */
const ROLE_LOOK = {
  sensei: { look: { hairColor: 'branco', eyeColor: 'cinza', outfit: 'vila', bandana: true }, cape: 'capa_vila', gear: null },
  travel: { look: { hairColor: 'preto', skin: 'canela', shirtColor: 'marrom', pantsColor: 'marrom' }, cape: 'capa_viagem', gear: { hand: null, back: null, scroll: 'scroll_weapons' } },
};
const roleLooks = new Map();

/** Nome do NPC numa plaquinha escura (letra estreita, dourada), como a dos jogadores. Devolve o topo da plaquinha. */
function drawNpcLabel(text, sx, bottom, T) {
  const fontSize = Math.max(12, Math.round(T * 0.32));
  ctx.font = `700 ${fontSize}px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(10, 13, 26, 0.68)';
  roundRect(sx - tw / 2 - 6, bottom - fontSize - 1, tw + 12, fontSize + 3, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(233, 196, 106, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8, 10, 20, 0.85)';
  ctx.fillStyle = '#ffd76a';
  ctx.strokeText(text, sx, bottom + 1);
  ctx.fillText(text, sx, bottom + 1);
  return bottom - fontSize - 1;
}

/** Anel dourado no chão: perto o bastante para conversar. */
function drawTalkRing(n, sx, sy, T, now) {
  if (state.nearNpc !== n) return;
  const r = T * 0.44;
  ctx.strokeStyle = 'rgba(255, 210, 63, 0.75)';
  ctx.lineWidth = Math.max(2, T * 0.06);
  ctx.setLineDash([T * 0.2, T * 0.12]);
  ctx.lineDashOffset = -now / 50;
  ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.9, r * 1.7, r * 0.66, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
}

function drawNpc(n, sx, sy, T, now, me) {
  if (n.shop || ACADEMY_LOOK[n.id]) return drawShopkeeper(n, sx, sy, T, now);
  const role = ROLE_LOOK[n.role] || ROLE_LOOK.sensei;
  const village = state.maps[state.mapId]?.village || 'vila_1';
  const key = `${n.role}:${village}`;
  if (!roleLooks.has(key)) roleLooks.set(key, npcLook({ ...role.look, village }));
  const look = roleLooks.get(key);
  ctx.save();
  drawTalkRing(n, sx, sy, T, now);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath(); ctx.ellipse(sx, sy + T * 0.35, T * 0.36, T * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  n.anim ||= { dead: false, moving: false, act: null, seed: [...String(n.id)].length * 977, faction: { village, cape: role.cape } };
  const top = drawSpriteCharacter(ctx, n.anim, sx, sy, T, look, 0, now, role.gear)
    ?? drawCharacter(ctx, sx, sy, T, fallbackColors(look), 0, 0, false, role.gear);
  const nameTop = drawNpcLabel(n.name, sx, top - 4, T);
  // marcador de missão, pulando (só o Mestre: o Posto de Viagem não passa missão)
  const marker = n.role === 'travel' ? null : npcMarker();
  let labelTop = nameTop;
  if (marker) {
    const size = Math.max(16, Math.round(T * 0.62));
    const bob = Math.sin(now / 220) * T * 0.08;
    const my = nameTop - 2 + bob;
    ctx.font = `900 ${size}px ${UI_FONT}`;
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20, 17, 13, 0.95)';
    ctx.strokeText(marker.ch, sx, my);
    ctx.fillStyle = marker.color;
    ctx.fillText(marker.ch, sx, my);
    labelTop = my - size;
  }
  ctx.restore();
  n.labelTop = labelTop;                               // o balão fica acima do marcador
}

/** Lojista (só existe dentro da loja): boneco de frente, nome com o ícone da loja e anel quando perto. */
function drawShopkeeper(n, sx, sy, T, now) {
  ctx.save();
  drawTalkRing(n, sx, sy, T, now);
  const look = SHOPKEEPER_LOOK[n.shop] || ACADEMY_LOOK[n.id] || DEFAULT_APPEARANCE;
  n.anim ||= { dead: false, moving: false, act: null, seed: [...String(n.id)].length * 977 };
  const top = drawSpriteCharacter(ctx, n.anim, sx, sy, T, look, 0, now, NPC_GEAR[n.id])
    ?? drawCharacter(ctx, sx, sy, T, fallbackColors(look), 0, 0, false, NPC_GEAR[n.id]);
  const label = `${n.shop ? SHOP_INFO[n.shop]?.icon || '🛒' : n.id === 'director' ? '🎓' : '📘'} ${n.name}`;
  n.labelTop = drawNpcLabel(label, sx, top - 4, T);
  ctx.restore();
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

/**
 * Luz quente das lanternas (somada ao chão, tremendo de leve): uma poça larga no piso e um halo pequeno em volta da
 * caixa da luz. E, por cima das arenas à vista, quatro holofotes frios vindos dos cantos (como num estádio à noite).
 */
function drawLights(toScreenX, toScreenY, T, viewW, viewH, now) {
  const lights = state.lights || [];
  const boxes = state.arenaBoxes || [];
  if (!lights.length && !boxes.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const x = toScreenX(l.x), y = toScreenY(l.y);
    if (x < -T * 3 || x > viewW + T * 3 || y < -T * 3 || y > viewH + T * 3) continue;
    const flick = 0.88 + 0.12 * Math.sin(now / 130 + l.x * 7.1) * Math.sin(now / 83 + l.y * 3.3);
    const pr = T * 2.1;
    let g = ctx.createRadialGradient(x, y, 0, x, y, pr);
    g.addColorStop(0, `rgba(255, 186, 92, ${0.3 * flick})`);
    g.addColorStop(0.5, `rgba(255, 150, 60, ${0.1 * flick})`);
    g.addColorStop(1, 'rgba(255, 140, 50, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - pr, y - pr, pr * 2, pr * 2);
    const hy = y - T * 1.25, hr = T * 0.75;
    g = ctx.createRadialGradient(x, hy, 0, x, hy, hr);
    g.addColorStop(0, `rgba(255, 214, 140, ${0.45 * flick})`);
    g.addColorStop(1, 'rgba(255, 170, 70, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - hr, hy - hr, hr * 2, hr * 2);
  }
  for (const b of boxes) {
    const x0 = toScreenX(b.x), y0 = toScreenY(b.y), w = b.w * T, h = b.h * T;
    if (x0 + w < -T * 4 || x0 > viewW + T * 4 || y0 + h < -T * 4 || y0 > viewH + T * 4) continue;
    // Holofotes: só dentro da mureta (não vazam para a rua). Três cones um dentro do outro: a borda sai macia.
    ctx.save();
    ctx.beginPath(); ctx.rect(x0 - T * 0.5, y0 - T * 0.5, w + T, h + T); ctx.clip();
    const cx = x0 + w / 2, cy = y0 + h / 2;
    for (const [k, [sx, sy]] of [[x0 - T * 2, y0 - T * 3], [x0 + w + T * 2, y0 - T * 3], [x0 - T * 2, y0 + h + T], [x0 + w + T * 2, y0 + h + T]].entries()) {
      const sway = Math.sin(now / 2400 + k * 1.7) * T * 1.4;
      const tx = cx + (k % 2 ? -1 : 1) * w * 0.12 + sway, ty = cy + (k < 2 ? 1 : -1) * h * 0.08;
      const ang = Math.atan2(ty - sy, tx - sx), len = Math.hypot(tx - sx, ty - sy) * 1.15;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, len);
      g.addColorStop(0, 'rgba(225, 235, 255, 0.07)');
      g.addColorStop(0.75, 'rgba(205, 220, 255, 0.03)');
      g.addColorStop(1, 'rgba(205, 220, 255, 0)');
      ctx.fillStyle = g;
      for (const spread of [0.09, 0.15, 0.21]) {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(ang - spread) * len, sy + Math.sin(ang - spread) * len);
        ctx.lineTo(sx + Math.cos(ang + spread) * len, sy + Math.sin(ang + spread) * len);
        ctx.closePath();
        ctx.fill();
      }
      const pg = ctx.createRadialGradient(tx, ty, 0, tx, ty, T * 2.4);   // a mancha de luz no chão
      pg.addColorStop(0, 'rgba(230, 238, 255, 0.12)');
      pg.addColorStop(1, 'rgba(230, 238, 255, 0)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.ellipse(tx, ty, T * 2.4, T * 1.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

/** Anel no chão de quem luta (dourado: você; vermelho: o adversário), com um brilho fraco por dentro. */
function drawGroundRing(sx, sy, r, color, glow) {
  ctx.save();
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.92, r * 1.25, r * 0.48, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(10, 12, 20, 0.55)';
  ctx.lineWidth = Math.max(3, r * 0.14);
  ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.92 + 1, r * 1.25, r * 0.48, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.92, r * 1.25, r * 0.48, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawHpBar(cx, y, w, ratio, color) {
  const h = 4;
  const x = Math.round(cx - w / 2), yy = Math.round(y), fill = Math.round(w * Math.max(0, Math.min(1, ratio)));
  ctx.fillStyle = 'rgba(8, 10, 20, 0.85)';                   // trilho escuro com borda
  ctx.fillRect(x - 1, yy - 1, Math.round(w) + 2, h + 2);
  ctx.fillStyle = 'rgba(233, 214, 170, 0.12)';
  ctx.fillRect(x, yy, Math.round(w), h);
  ctx.fillStyle = color;
  ctx.fillRect(x, yy, fill, h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';               // brilho em cima
  ctx.fillRect(x, yy, fill, 1);
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
 * Boneco (desenhado por código: esqueleto 3D + pixel art em camadas, figure.js) com os pés em (sx, sy + 0,42·T), como o
 * boneco antigo. A arma da mão e os itens das costas entram na profundidade certa (atrás do corpo quando o braço está
 * atrás; o punho fecha por cima do cabo). A capa e a bandana riscada do renegado são camadas do próprio boneco.
 * Devolve o topo da cabeça (tela).
 */
function drawSpriteCharacter(g, p, sx, sy, T, look, dir, now, gear) {
  const s = spriteScale(T, dpr);
  const left = Math.round((sx - 32 * s) * dpr) / dpr;
  const top = Math.round((sy + T * 0.42 - 93 * s) * dpr) / dpr;
  // O sapato (camada própria): o que o servidor diz que ele calça (null = descalço); NPC e prévia, a sandália de sempre.
  const shod = { ...look, shoes: gear && 'feet' in gear ? gear.feet : DEFAULT_SHOES, accessory: gear?.body ?? null };
  // Fim de jogo (v16): a capa e a bandana riscada do renegado (camadas do boneco).
  const opts = {
    cape: p.faction?.cape || null,
    capeVillage: p.faction ? (p.faction.village ?? p.faction.renegadeFrom) : look.village,
    renegade: !!(p.faction && p.faction.village === null),
  };
  if (gear && (gear.hand || gear.back || gear.scroll)) {
    // No golpe com arma, a espada / Shuriken Gigante sai das costas para a mão (a bainha vazia fica nas costas).
    // No selo do jutsu, a arma da mão some.
    const u = (T / 16) * 1.3;
    const R = (px, py, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(px), Math.round(py), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
    const { anim, t } = pickAnim(p, now);
    const strike = anim === 'golpe';
    // Arremesso (Shuriken Gigante): na mão só no preparo; some no lançamento e enquanto voa.
    const thrownGone = gear.back && isThrown(gear.back) && ((strike && t > 0.25) || (p.thrown && now < p.thrown.until));
    const inHand = gear.hand || (strike && !thrownGone && gear.back && drawnForStrike(gear.back) && weaponReady(gear.back, 'mao') ? gear.back : null);
    if (gear.back || gear.scroll) {
      opts.back = (bx, by, view, flip) => {
        for (const code of [gear.back, gear.scroll]) {
          if (!code || (thrownGone && code === gear.back)) continue;
          if (code === inHand) {
            if (weaponReady(code, 'bainha')) drawBackWeapon(g, code, bx, by, s, view, flip, dpr, true);
          } else if (weaponReady(code)) {
            drawBackWeapon(g, code, bx, by, s, view, flip, dpr);
          } else {
            drawBackItem(R, bx, by - 2.75 * u, u, dir, code);
          }
        }
      };
    }
    if (inHand && anim !== 'jutsu') {
      opts.hand = (hx, hy, deg) => {
        if (weaponReady(inHand, 'mao')) drawHandWeapon(g, inHand, hx, hy, s, deg, false, dpr);
        else if (dir !== 3) drawHandItem(R, hx - u, hy - 0.6 * u, u, dir === 0 ? 1 : dir, inHand);
      };
    }
  }
  return drawFigure(g, p, left, top, s, shod, dir, now, opts).top;
}

/** Empurrão da Água: o boneco escorrega do lugar antigo até o novo em 180 ms (só o desenho; a posição já é a nova). */
function knockOffset(p, now, axis) {
  const k = p.knock;
  if (!k) return 0;
  const t = (now - k.start) / 180;
  if (t >= 1) { p.knock = null; return 0; }
  return k[axis] * (1 - t) * (1 - t);
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
  // Na arena: anel dourado embaixo de você e vermelho embaixo de quem pode ser o seu adversário.
  if (!p.dead && state.inArena && arenaAt(state.maps[state.mapId], p.x, p.y)) {
    if (isMe) drawGroundRing(sx, sy, r, '#e9c46a', 'rgba(233, 196, 106, 0.16)');
    else if (isFoe(p)) drawGroundRing(sx, sy, r, '#e8737a', 'rgba(232, 115, 122, 0.14)');
  }
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

  // nome numa plaquinha escura (letra estreita); a vida dos outros fica na base da plaquinha
  const fontSize = Math.max(12, Math.round(T * 0.34));
  ctx.font = `600 ${fontSize}px ${UI_FONT}`;
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';            // contorno do texto sem "espinhos" nas quinas
  ctx.strokeStyle = 'rgba(8, 10, 20, 0.85)';
  const foe = !isMe && (state.inArena || inConflict()) && isFoe(p);   // arena e Zona de Conflito: adversário em vermelho
  // Fim de jogo: 👑 Kage, ☁ Akatsuki, renegado em violeta, aliado em verde na Zona e a recompensa pela cabeça.
  const style = factionStyle(state.endgame, state.players.get(state.meId), p, inConflict());
  const nameY = headTop - 5 - (isMe ? 2 : 7);
  const label = `${style.prefix}${p.username}`;
  const tw = ctx.measureText(label).width;
  const plateBottom = !isMe && !p.dead ? headTop - 3 : nameY + 1;
  ctx.fillStyle = 'rgba(10, 13, 26, 0.62)';
  roundRect(sx - tw / 2 - 6, nameY - fontSize - 1, tw + 12, plateBottom - (nameY - fontSize - 1), 4);
  ctx.fill();
  ctx.strokeStyle = foe ? 'rgba(232, 115, 122, 0.55)' : isMe ? 'rgba(233, 196, 106, 0.5)' : 'rgba(233, 214, 170, 0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(8, 10, 20, 0.85)';
  ctx.lineWidth = 3;
  ctx.fillStyle = isMe ? '#f2d58c' : foe ? (style.color || '#ff9a8a') : style.color || '#f4ecd8';
  ctx.strokeText(label, sx, nameY);
  ctx.fillText(label, sx, nameY);
  if (!p.dead) drawFxIcons(p, sx, nameY - fontSize - (style.bounty > 0 ? fontSize + 4 : 3), T, now);   // efeitos com tempo
  if (style.bounty > 0) {
    ctx.font = `800 ${Math.max(10, Math.round(T * 0.28))}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#ffd23f';
    const by = nameY - fontSize - 1;
    ctx.strokeText(`💰 ${style.bounty}`, sx, by);
    ctx.fillText(`💰 ${style.bounty}`, sx, by);
  }
  // vida dos outros jogadores (a nossa fica nas barras de baixo)
  if (!isMe && !p.dead) drawHpBar(sx, headTop - 8, tw + 4, p.hp / p.maxHp, foe ? '#ff6f61' : '#8fe0a0');
  ctx.globalAlpha = 1;
  if (!isMe && p.id === state.focusId) drawFocusMarker(sx, sy, r, T, now, undefined, !foe);

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

/** Computador (mouse, sem toque ainda): o joystick some (anda-se no teclado); o primeiro toque na tela o traz de volta. */
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
let touchSeen = false;
window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touchSeen = true; }, { capture: true, passive: true });

function drawJoystick() {
  if (ui.hud.hidden) return;
  if (finePointer && !touchSeen && !hud.editing) return;
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
  ctx.fillStyle = 'rgba(12, 16, 32, 0.45)';
  ctx.strokeStyle = 'rgba(233, 214, 170, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(joy.baseX, joy.baseY, joy.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const meditating = state.me.meditating;
  ctx.fillStyle = meditating ? 'rgba(111, 192, 255, 0.6)' : active ? '#e9c46a' : 'rgba(244, 236, 216, 0.85)';
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
// O canvas só usa a letra do HUD depois que ela carrega (sem isto, os nomes saem na letra do sistema até a primeira
// vez que um texto do HUD a pedir).
document.fonts?.load(`600 16px ${UI_FONT}`).catch(() => {});
requestAnimationFrame(frame);
if (readToken()) startGame();
else showLogin();
