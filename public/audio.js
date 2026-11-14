/*
 * v57: áudio do jogo. Músicas em MP3 (public/assets/audio) e efeitos sonoros SINTETIZADOS aqui (Web Audio: osciladores,
 * ruído branco e envelopes; nenhum arquivo de efeito, o jogo continua leve).
 *
 * Mixagem (regra do Victor: o áudio complementa, nada ensurdecedor):
 *   música  -> musicBus (40% padrão) -----------------\
 *   efeitos -> sfxBus (60% padrão) -> compressor -----> master (mudo = 0) -> alto-falante
 * As músicas foram normalizadas para o mesmo volume (-18 LUFS). O compressor segura vários golpes juntos na tela (sem
 * estourar); cada tipo de efeito também tem limite de vozes ao mesmo tempo.
 *
 * Navegadores só deixam tocar som depois de um toque/clique: nada toca até `unlock()` (primeiro toque na tela).
 */

const KEY = 'nin.audio';
const FADE_S = 1.5;
/** Nas cidades, as duas calmas se revezam a cada 5 minutos (sorteio). */
const CALM_SWAP_MS = 5 * 60_000;
/** Vitória e derrota: tocam por 10 s e a música de antes volta de onde parou. */
const STINGER_MS = 10_000;

/** Música de cada clima do jogo (mais de uma: revezam). Falta uma faixa: a lista só tem as que existem. */
export const MUSIC = {
  calma: ['musica_calma_1', 'musica_calma_2'],
  pvp: ['musica_pvp'],
  boss: ['musica_boss'],
  misterio: ['musica_misterio_1'],
  vitoria: ['musica_vitoria'],
  derrota: ['musica_derrota'],
};

export const DEFAULT_AUDIO = { music: 40, sfx: 60, mute: false };

export function loadAudioSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') {
      const pct = (v, d) => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : d);
      return { music: pct(s.music, DEFAULT_AUDIO.music), sfx: pct(s.sfx, DEFAULT_AUDIO.sfx), mute: !!s.mute };
    }
  } catch { /* modo privado ou dado estragado: o padrão */ }
  return { ...DEFAULT_AUDIO };
}

function saveAudioSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* modo privado */ }
}

/** Curva do volume: o slider é linear para a pessoa, o ouvido é logarítmico (x² soa mais natural). */
const curve = (pct) => (pct / 100) ** 2;

/** Efeitos: quantos do mesmo tipo podem soar juntos e o intervalo mínimo entre dois iguais (ms). */
const VOICES = {
  slash: [6, 25], punch: [6, 25], thud: [6, 25], step: [2, 60], blip: [2, 40], levelup: [1, 400], death: [2, 200], charge: [4, 0],
  cast: [5, 30], impact: [6, 25], status: [4, 60], burning: [3, 150], fly: [6, 0], teleport: [3, 50], substitution: [2, 100],
  notify: [2, 150], announce: [1, 800], coins: [1, 300], chat: [1, 150], slime: [4, 60], slime_die: [3, 60], boss_roar: [1, 1000],
  warn: [2, 200], stunned: [2, 200], healed: [3, 80], shuriken: [3, 40], seal: [3, 20],
};

export class AudioManager {
  constructor() {
    this.settings = loadAudioSettings();
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.noise = null;
    /** nome -> { el, gain } (cada faixa carrega só quando toca pela primeira vez) */
    this.tracks = new Map();
    this.mood = 'calma';
    this.current = null;            // faixa tocando agora
    this.calmPick = null;
    this.calmSince = 0;
    this.stingerUntil = 0;
    this.stingerTimer = 0;
    this.voices = new Map();        // tipo -> { n, last }
  }

  get unlocked() { return !!this.ctx; }

  /** Primeiro toque/tecla: cria o contexto de áudio e começa a música do lugar. */
  unlock() {
    if (this.ctx) { this.wake(); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    const comp = ctx.createDynamicsCompressor();     // vários golpes juntos: segura o pico, sem estalo
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    comp.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(comp);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);   // 1 s de ruído branco, reaproveitado
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.applyVolumes();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    this.setMood(this.mood, true);
    // v58: saiu do navegador (outra aba, app em segundo plano, tela apagada) e voltou: o som volta sozinho
    document.addEventListener('visibilitychange', () => (document.hidden ? this.sleep() : this.wake()));
    addEventListener('pageshow', () => this.wake());
    addEventListener('focus', () => this.wake());
  }

  /** Página escondida: pausa a música (sem tocar em segundo plano) e suspende o áudio. */
  sleep() {
    if (!this.ctx) return;
    this.asleep = true;
    if (this.current) this.track(this.current).el.pause();
    this.ctx.suspend().catch(() => {});
  }

  /**
   * Página de volta (ou um toque): retoma o áudio e a música de onde parou. O iPhone às vezes só deixa retomar com um
   * toque ('interrupted'); por isso o primeiro toque depois de voltar também chama aqui.
   */
  wake() {
    if (!this.ctx || document.hidden) return;
    this.asleep = false;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    const t = this.current && this.tracks.get(this.current);
    if (t && t.el.paused && (t.el.loop || performance.now() < this.stingerUntil)) {
      const p = t.el.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  // ---------------- volumes ----------------

  setVolume(kind, pct) {
    this.settings[kind] = Math.max(0, Math.min(100, Math.round(pct)));
    saveAudioSettings(this.settings);
    this.applyVolumes();
  }

  setMute(on) {
    this.settings.mute = !!on;
    saveAudioSettings(this.settings);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.mute ? 0 : 1, t, 0.03);
    this.musicBus.gain.setTargetAtTime(curve(this.settings.music), t, 0.03);
    this.sfxBus.gain.setTargetAtTime(curve(this.settings.sfx), t, 0.03);
  }

  // ---------------- música ----------------

  /** O clima pedido pelo jogo: 'calma' | 'pvp' | 'boss' | 'misterio'. Troca com crossfade de 1,5 s. */
  setMood(mood, force = false) {
    if (!MUSIC[mood]) return;
    const changed = mood !== this.mood;
    this.mood = mood;
    if (!this.ctx || (!changed && !force)) return;
    if (performance.now() < this.stingerUntil) return;      // a vitória/derrota termina antes; depois vem a do clima
    this.crossfadeTo(this.trackFor(mood));
  }

  /** Chamar de tempos em tempos: reveza as calmas a cada 5 minutos. */
  tick(now = performance.now()) {
    if (!this.ctx || this.mood !== 'calma' || now < this.stingerUntil) return;
    if (this.calmPick && now - this.calmSince >= CALM_SWAP_MS) {
      const other = MUSIC.calma.filter((n) => n !== this.calmPick);
      if (other.length) {
        this.calmPick = other[Math.floor(Math.random() * other.length)];
        this.calmSince = now;
        this.crossfadeTo(this.calmPick, true);
      }
    }
  }

  trackFor(mood) {
    const list = MUSIC[mood];
    if (mood !== 'calma') return list.includes(this.current) ? this.current : list[Math.floor(Math.random() * list.length)];
    if (!this.calmPick) { this.calmPick = list[Math.floor(Math.random() * list.length)]; this.calmSince = performance.now(); }
    return this.calmPick;
  }

  /** Vitória ou derrota: 10 s por cima de tudo e depois a música do clima volta (de onde parou). */
  stinger(kind) {
    const name = MUSIC[kind]?.[0];
    if (!name || !this.ctx) return;
    this.stingerUntil = performance.now() + STINGER_MS;
    this.crossfadeTo(name, true, false);
    clearTimeout(this.stingerTimer);
    this.stingerTimer = setTimeout(() => {
      this.stingerUntil = 0;
      this.crossfadeTo(this.trackFor(this.mood), false);
    }, STINGER_MS);
  }

  track(name) {
    let t = this.tracks.get(name);
    if (t) return t;
    const el = new Audio(`/assets/audio/${name}.mp3`);
    el.preload = 'auto';
    el.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    try { this.ctx.createMediaElementSource(el).connect(gain); } catch { /* navegador antigo: sem a faixa */ }
    gain.connect(this.musicBus);
    t = { el, gain, stopTimer: 0 };
    this.tracks.set(name, t);
    return t;
  }

  /** Crossfade: a atual desce em 1,5 s (e pausa, guardando onde parou); a nova sobe em 1,5 s. */
  crossfadeTo(name, restart = false, loop = true) {
    if (!this.ctx || !name) return;
    if (name === this.current && !restart) return;
    const t0 = this.ctx.currentTime;
    if (this.current && this.current !== name) {
      const old = this.track(this.current);
      old.gain.gain.cancelScheduledValues(t0);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t0);
      old.gain.gain.linearRampToValueAtTime(0, t0 + FADE_S);
      clearTimeout(old.stopTimer);
      old.stopTimer = setTimeout(() => old.el.pause(), FADE_S * 1000 + 50);
    }
    const next = this.track(name);
    clearTimeout(next.stopTimer);
    next.el.loop = loop;
    if (restart || !loop) { try { next.el.currentTime = 0; } catch { /* ainda carregando */ } }
    next.gain.gain.cancelScheduledValues(t0);
    next.gain.gain.setValueAtTime(next.gain.gain.value, t0);
    next.gain.gain.linearRampToValueAtTime(1, t0 + FADE_S);
    const p = next.el.play();
    if (p && p.catch) p.catch(() => {});
    this.current = name;
  }

  // ---------------- efeitos ----------------

  /** Reserva uma voz do tipo (limite de vozes e de repetição); false = pula este som. */
  voice(kind, ms) {
    const [max, gap] = VOICES[kind] || [4, 30];
    const v = this.voices.get(kind) || { n: 0, last: 0 };
    const now = performance.now();
    if (v.n >= max || now - v.last < gap) return false;
    v.n += 1;
    v.last = now;
    this.voices.set(kind, v);
    setTimeout(() => { v.n = Math.max(0, v.n - 1); }, ms);
    return true;
  }

  /** Toca um efeito. vol: 0 a 1 (longe = mais baixo; quem chamou calcula). Devolve um controle para os longos. */
  sfx(kind, vol = 1, opt = {}) {
    if (!this.ctx || this.settings.mute || this.asleep || vol < 0.03) return null;
    const fn = SFX[kind];
    if (!fn) return null;
    if (!this.voice(kind, opt.voiceMs ?? opt.ms ?? 400)) return null;
    try { return fn(this, Math.min(1, vol), opt) || null; } catch { return null; }
  }

  /** Envelope: ataque curto e queda exponencial até quase zero. */
  env(peak, attack, decay, at = this.ctx.currentTime) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(this.sfxBus);
    return g;
  }

  noiseSrc(at, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(at, Math.random() * 0.5);
    s.stop(at + dur);
    return s;
  }
}


// =====================================================================================================================
// Biblioteca de efeitos (v58): um som próprio para cada coisa, para dar para saber o que acontece só de ouvir.
// Peças pequenas (ruído filtrado, tom, estalos, sino) combinadas por elemento e por evento.
// =====================================================================================================================

/** Ruído filtrado com envelope. f/fEnd: frequência do filtro (varre); type: lowpass | bandpass | highpass. */
function noise(a, { at = a.ctx.currentTime, dur = 0.2, type = 'bandpass', f = 1000, fEnd, Q = 1, peak = 0.3, attack = 0.005, decay } = {}) {
  const flt = a.ctx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = Q;
  flt.frequency.setValueAtTime(f, at);
  if (fEnd) flt.frequency.exponentialRampToValueAtTime(fEnd, at + dur);
  flt.connect(a.env(peak, attack, decay ?? dur, at));
  a.noiseSrc(at, attack + (decay ?? dur) + 0.05).connect(flt);
  return flt;
}

/** Tom (oscilador) com envelope; f -> fEnd varre a altura. */
function tone(a, { at = a.ctx.currentTime, type = 'sine', f = 440, fEnd, glide, peak = 0.2, attack = 0.005, decay = 0.2, detune = 0, lp } = {}) {
  const o = a.ctx.createOscillator();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f, at);
  if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, at + (glide ?? attack + decay));
  const out = a.env(peak, attack, decay, at);
  if (lp) {
    const l = a.ctx.createBiquadFilter();
    l.type = 'lowpass';
    l.frequency.value = lp;
    o.connect(l);
    l.connect(out);
  } else o.connect(out);
  o.start(at);
  o.stop(at + attack + decay + 0.05);
  return o;
}

/** Estalos (fogo crepitando, faíscas, pedrinhas): n cliques curtíssimos espalhados em `dur` segundos. */
function crackle(a, { at = a.ctx.currentTime, dur = 0.4, n = 8, f = 3000, peak = 0.18, Q = 2 } = {}) {
  for (let i = 0; i < n; i++) {
    const t = at + Math.random() * dur;
    noise(a, { at: t, dur: 0.012 + Math.random() * 0.02, type: 'bandpass', f: f * (0.6 + Math.random() * 0.9), Q, peak: peak * (0.4 + Math.random() * 0.6), attack: 0.001 });
  }
}

/** Sino (FM): metal, cristal, cura. ratio = modulador/portadora. */
function bell(a, { at = a.ctx.currentTime, f = 880, ratio = 2.4, index = 3, peak = 0.15, decay = 0.6 } = {}) {
  const car = a.ctx.createOscillator();
  const mod = a.ctx.createOscillator();
  const mg = a.ctx.createGain();
  car.frequency.value = f;
  mod.frequency.value = f * ratio;
  mg.gain.setValueAtTime(f * index, at);
  mg.gain.exponentialRampToValueAtTime(1, at + decay);
  mod.connect(mg);
  mg.connect(car.frequency);
  car.connect(a.env(peak, 0.003, decay, at));
  car.start(at);
  mod.start(at);
  car.stop(at + decay + 0.05);
  mod.stop(at + decay + 0.05);
}

/** Som que dura (voo do projétil, selo): ruído em loop com filtro; devolve { gain, stop(abrupt) }. */
function hold(a, { type = 'bandpass', f = 800, Q = 1, peak = 0.2, lfo = 0, lfoDepth = 0, fade = 0.06 } = {}) {
  const ctx = a.ctx;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = a.noise;
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.value = f;
  flt.Q.value = Q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + fade);
  src.connect(flt);
  flt.connect(g);
  g.connect(a.sfxBus);
  let osc = null;
  if (lfo) {
    osc = ctx.createOscillator();
    osc.frequency.value = lfo;
    const og = ctx.createGain();
    og.gain.value = lfoDepth;
    osc.connect(og);
    og.connect(flt.frequency);
    osc.start(t);
  }
  src.start(t, Math.random() * 0.5);
  let done = false;
  return {
    gain: g, filter: flt, peak,
    stop(abrupt = false) {
      if (done) return;
      done = true;
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + (abrupt ? 0.01 : 0.12));
      const end = now + (abrupt ? 0.02 : 0.15);
      try { src.stop(end); osc?.stop(end); } catch { /* já parou */ }
    },
  };
}

/** Lançamento de jutsu, por elemento: dá para saber qual jutsu saiu só pelo som. */
const CAST = {
  fire(a, v) {           // labareda: rugido grave subindo + crepitar
    noise(a, { type: 'lowpass', f: 300, fEnd: 2400, Q: 0.8, peak: 1.1 * v, attack: 0.03, dur: 0.45 });
    tone(a, { type: 'sawtooth', f: 70, fEnd: 140, peak: 0.22 * v, attack: 0.02, decay: 0.35, lp: 400 });
    crackle(a, { dur: 0.45, n: 10, f: 2600, peak: 0.16 * v });
  },
  water(a, v) {          // jato d'água: chiado molhado + bolhas subindo
    noise(a, { type: 'bandpass', f: 900, fEnd: 2200, Q: 2.2, peak: 0.45 * v, attack: 0.02, dur: 0.35 });
    const t = a.ctx.currentTime;
    for (let i = 0; i < 5; i++) tone(a, { at: t + 0.05 + i * 0.05, f: 300 + Math.random() * 250, fEnd: 900 + Math.random() * 500, peak: 0.08 * v, attack: 0.003, decay: 0.05 });
  },
  lightning(a, v) {      // raio: zumbido elétrico + estalo agudo
    const t = a.ctx.currentTime;
    tone(a, { type: 'sawtooth', f: 120, fEnd: 2200, glide: 0.08, peak: 0.1 * v, attack: 0.002, decay: 0.22, lp: 5000 });
    tone(a, { type: 'square', f: 60, peak: 0.08 * v, attack: 0.002, decay: 0.25, lp: 900 });
    noise(a, { at: t + 0.01, type: 'highpass', f: 3500, peak: 0.22 * v, attack: 0.001, dur: 0.12 });
    crackle(a, { dur: 0.25, n: 12, f: 6000, peak: 0.14 * v, Q: 4 });
  },
  wind(a, v) {           // vento: rajada aérea comprida que varre
    noise(a, { type: 'bandpass', f: 500, fEnd: 3200, Q: 4, peak: 1 * v, attack: 0.08, dur: 0.5 });
    noise(a, { type: 'bandpass', f: 1600, fEnd: 700, Q: 6, peak: 0.45 * v, attack: 0.1, dur: 0.45 });
  },
  stone(a, v) {          // terra: estrondo grave + cascalho
    tone(a, { type: 'sine', f: 90, fEnd: 40, peak: 0.45 * v, attack: 0.005, decay: 0.35 });
    noise(a, { type: 'lowpass', f: 500, peak: 0.4 * v, attack: 0.005, dur: 0.3 });
    crackle(a, { dur: 0.35, n: 9, f: 1400, peak: 0.16 * v, Q: 1 });
  },
  shadow(a, v) {         // sombra: sopro escuro que cresce, com tom grave desafinado
    noise(a, { type: 'lowpass', f: 200, fEnd: 700, Q: 3, peak: 0.35 * v, attack: 0.18, decay: 0.3 });
    tone(a, { f: 98, peak: 0.12 * v, attack: 0.15, decay: 0.4, detune: -20 });
    tone(a, { f: 104, peak: 0.12 * v, attack: 0.15, decay: 0.4, detune: 25 });
  },
  illusion(a, v) {       // ilusão: brilho de cristal ondulando
    const t = a.ctx.currentTime;
    [660, 830, 990, 1245].forEach((f, i) => bell(a, { at: t + i * 0.05, f, ratio: 3.5, index: 1.5, peak: 0.07 * v, decay: 0.5 }));
    noise(a, { type: 'highpass', f: 5000, peak: 0.08 * v, attack: 0.1, dur: 0.4 });
  },
  heal(a, v) {           // cura: acorde suave subindo
    const t = a.ctx.currentTime;
    [523, 659, 784].forEach((f, i) => tone(a, { at: t + i * 0.06, f, peak: 0.1 * v, attack: 0.03, decay: 0.5 }));
    bell(a, { at: t + 0.2, f: 1568, ratio: 2, index: 0.8, peak: 0.05 * v, decay: 0.5 });
  },
  taijutsu(a, v) {       // corpo: deslocamento de ar curto e firme
    noise(a, { type: 'bandpass', f: 600, fEnd: 250, Q: 1.5, peak: 0.5 * v, attack: 0.01, dur: 0.15 });
    tone(a, { f: 110, fEnd: 60, peak: 0.25 * v, attack: 0.003, decay: 0.12 });
  },
  weapons(a, v) {        // armas: lâmina saindo (metal raspando + brilho)
    noise(a, { type: 'bandpass', f: 4000, fEnd: 7000, Q: 6, peak: 0.5 * v, attack: 0.005, dur: 0.18 });
    bell(a, { f: 1800, ratio: 1.41, index: 2, peak: 0.07 * v, decay: 0.35 });
  },
  neutral(a, v) {
    noise(a, { type: 'bandpass', f: 380, fEnd: 2100, Q: 1.1, peak: 0.5 * v, attack: 0.05, dur: 0.32 });
  },
};

/** Impacto / explosão por elemento. */
const IMPACT = {
  fire(a, v) {           // explosão: estrondo, sopro e brasas caindo
    tone(a, { f: 120, fEnd: 35, peak: 0.55 * v, attack: 0.003, decay: 0.5 });
    noise(a, { type: 'lowpass', f: 1800, fEnd: 200, peak: 0.6 * v, attack: 0.003, dur: 0.55 });
    crackle(a, { at: a.ctx.currentTime + 0.08, dur: 0.6, n: 14, f: 2500, peak: 0.14 * v });
  },
  water(a, v) {          // splash
    noise(a, { type: 'bandpass', f: 1400, fEnd: 400, Q: 1.2, peak: 0.55 * v, attack: 0.003, dur: 0.3 });
    const t = a.ctx.currentTime;
    for (let i = 0; i < 6; i++) tone(a, { at: t + 0.04 + Math.random() * 0.25, f: 500 + Math.random() * 700, fEnd: 1400, peak: 0.05 * v, attack: 0.002, decay: 0.04 });
  },
  lightning(a, v) {      // trovão seco
    noise(a, { type: 'highpass', f: 2000, peak: 0.45 * v, attack: 0.001, dur: 0.08 });
    noise(a, { at: a.ctx.currentTime + 0.03, type: 'lowpass', f: 600, fEnd: 120, peak: 0.45 * v, attack: 0.01, dur: 0.5 });
    crackle(a, { dur: 0.2, n: 10, f: 7000, peak: 0.12 * v, Q: 5 });
  },
  wind(a, v) {           // corte de vento
    noise(a, { type: 'bandpass', f: 3000, fEnd: 900, Q: 3, peak: 0.4 * v, attack: 0.003, dur: 0.18 });
  },
  stone(a, v) {          // pedra quebrando
    tone(a, { f: 80, fEnd: 45, peak: 0.45 * v, attack: 0.002, decay: 0.25 });
    noise(a, { type: 'bandpass', f: 900, Q: 0.8, peak: 0.4 * v, attack: 0.002, dur: 0.2 });
    crackle(a, { dur: 0.4, n: 10, f: 1200, peak: 0.2 * v, Q: 1 });
  },
  shadow(a, v) {         // sombra prendendo: baque abafado e sugado
    noise(a, { type: 'lowpass', f: 900, fEnd: 150, Q: 2, peak: 0.45 * v, attack: 0.005, dur: 0.3 });
    tone(a, { f: 70, fEnd: 40, peak: 0.25 * v, attack: 0.005, decay: 0.3 });
  },
  illusion(a, v) {       // vidro rachando
    const t = a.ctx.currentTime;
    for (let i = 0; i < 4; i++) bell(a, { at: t + i * 0.03, f: 1500 + Math.random() * 1500, ratio: 2.76, index: 2, peak: 0.06 * v, decay: 0.3 });
  },
  heal(a, v) {
    bell(a, { f: 1046, ratio: 2, index: 0.7, peak: 0.08 * v, decay: 0.6 });
  },
  taijutsu(a, v) {       // soco forte
    tone(a, { f: 160, fEnd: 50, peak: 0.6 * v, attack: 0.002, decay: 0.16 });
    noise(a, { type: 'lowpass', f: 1200, peak: 0.4 * v, attack: 0.002, dur: 0.07 });
  },
  weapons(a, v) {        // lâmina acertando: tchac metálico
    noise(a, { type: 'bandpass', f: 3500, Q: 3, peak: 0.4 * v, attack: 0.001, dur: 0.06 });
    bell(a, { f: 2400, ratio: 1.41, index: 2.5, peak: 0.08 * v, decay: 0.25 });
  },
  neutral(a, v) { IMPACT.taijutsu(a, v * 0.7); },
};

/** Estado aplicado (o som de quando pega). */
const STATUS = {
  queimadura(a, v) {     // pegou fogo: "fuuump" + chiado
    noise(a, { type: 'lowpass', f: 200, fEnd: 1500, Q: 1, peak: 0.45 * v, attack: 0.02, dur: 0.3 });
    crackle(a, { dur: 0.5, n: 10, f: 3000, peak: 0.14 * v });
  },
  molhado(a, v) {        // gotas pingando
    const t = a.ctx.currentTime;
    for (let i = 0; i < 3; i++) tone(a, { at: t + i * 0.11, f: 900 - i * 120, fEnd: 1500 - i * 120, peak: 0.1 * v, attack: 0.002, decay: 0.06 });
  },
  paralisia(a, v) {      // choque: zumbido elétrico tremendo
    tone(a, { type: 'square', f: 55, peak: 0.12 * v, attack: 0.005, decay: 0.45, lp: 1500 });
    crackle(a, { dur: 0.45, n: 16, f: 6000, peak: 0.12 * v, Q: 4 });
  },
  silencio(a, v) {       // som abafado sumindo
    noise(a, { type: 'lowpass', f: 1500, fEnd: 120, peak: 0.35 * v, attack: 0.005, dur: 0.4 });
  },
  sono(a, v) {           // canção de ninar: duas notas descendo
    const t = a.ctx.currentTime;
    tone(a, { at: t, f: 660, peak: 0.08 * v, attack: 0.04, decay: 0.3 });
    tone(a, { at: t + 0.28, f: 494, peak: 0.08 * v, attack: 0.04, decay: 0.45 });
  },
  ferida(a, v) {         // corte que sangra
    noise(a, { type: 'bandpass', f: 2500, fEnd: 1200, Q: 2, peak: 0.3 * v, attack: 0.002, dur: 0.12 });
    tone(a, { f: 300, fEnd: 180, peak: 0.08 * v, attack: 0.002, decay: 0.15 });
  },
  lentidao(a, v) {       // tom grave arrastado
    tone(a, { type: 'triangle', f: 220, fEnd: 90, peak: 0.13 * v, attack: 0.02, decay: 0.5 });
  },
  escuridao(a, v) {      // escuridão caindo
    noise(a, { type: 'lowpass', f: 600, fEnd: 100, Q: 4, peak: 0.35 * v, attack: 0.1, dur: 0.5 });
    tone(a, { f: 65, peak: 0.12 * v, attack: 0.1, decay: 0.5 });
  },
  invertido(a, v) {      // tontura: tom que oscila
    const o = tone(a, { type: 'triangle', f: 400, peak: 0.1 * v, attack: 0.02, decay: 0.5 });
    const l = a.ctx.createOscillator();
    const lg = a.ctx.createGain();
    l.frequency.value = 7;
    lg.gain.value = 90;
    l.connect(lg);
    lg.connect(o.frequency);
    l.start();
    l.stop(a.ctx.currentTime + 0.6);
  },
  veneno(a, v) {         // bolhas grossas
    const t = a.ctx.currentTime;
    for (let i = 0; i < 4; i++) tone(a, { at: t + i * 0.09, f: 180 + Math.random() * 80, fEnd: 420, peak: 0.12 * v, attack: 0.003, decay: 0.07, lp: 900 });
  },
  regeneracao(a, v) { IMPACT.heal(a, v); },
};

/** Voo do projétil (som que dura, segue o projétil): fogo ruge e crepita, os outros cortam o ar. */
const FLY = {
  fire: { type: 'lowpass', f: 700, Q: 0.9, peak: 0.28, lfo: 9, lfoDepth: 250, crackle: true },
  water: { type: 'bandpass', f: 1400, Q: 1.8, peak: 0.18, lfo: 13, lfoDepth: 300 },
  lightning: { type: 'highpass', f: 4000, Q: 1, peak: 0.12, lfo: 30, lfoDepth: 1500, crackle: true },
  wind: { type: 'bandpass', f: 1800, Q: 5, peak: 0.16, lfo: 3, lfoDepth: 700 },
  stone: { type: 'lowpass', f: 350, Q: 1, peak: 0.25, lfo: 6, lfoDepth: 80 },
  shadow: { type: 'lowpass', f: 400, Q: 3, peak: 0.2, lfo: 4, lfoDepth: 120 },
  illusion: { type: 'bandpass', f: 2500, Q: 8, peak: 0.1, lfo: 8, lfoDepth: 900 },
  weapons: { type: 'bandpass', f: 2600, Q: 7, peak: 0.14, lfo: 22, lfoDepth: 800 },     // shuriken girando
  neutral: { type: 'bandpass', f: 1000, Q: 2, peak: 0.12 },
};

/** Tom do "carregando" dos selos por elemento (a nota já diz qual jutsu vem). */
const CHARGE_BASE = { fire: 150, water: 260, lightning: 330, wind: 300, stone: 90, shadow: 110, illusion: 440, heal: 392, taijutsu: 130, weapons: 520, neutral: 180 };

export const SFX = {
  /** Ataque básico com arma: corte metálico. */
  slash(a, vol) {
    noise(a, { type: 'bandpass', f: 3600, fEnd: 1200, Q: 1.6, peak: 0.6 * vol, attack: 0.003, dur: 0.1 });
    noise(a, { type: 'highpass', f: 6000, peak: 0.12 * vol, attack: 0.002, dur: 0.06 });
  },
  /** Ataque básico sem arma: soco/chute cortando o ar. */
  punch(a, vol) {
    noise(a, { type: 'bandpass', f: 900, fEnd: 400, Q: 1.3, peak: 0.6 * vol, attack: 0.005, dur: 0.09 });
  },
  /** Golpe que conectou: baque grave curto. */
  thud(a, vol) {
    tone(a, { f: 150, fEnd: 52, peak: 0.6 * vol, attack: 0.003, decay: 0.16 });
    noise(a, { type: 'lowpass', f: 600, peak: 0.22 * vol, attack: 0.002, dur: 0.05 });
  },
  /** Passo: abafado e bem baixo; `alt` troca o tom (um pé e o outro). */
  step(a, vol, { alt = false } = {}) {
    noise(a, { type: 'lowpass', f: alt ? 340 : 260, Q: 1, peak: 0.11 * vol, attack: 0.004, dur: 0.06 });
  },
  /** Clique de interface: senoide de 800 Hz, 0,05 s. */
  blip(a, vol) { tone(a, { f: 800, peak: 0.16 * vol, attack: 0.003, decay: 0.047 }); },
  /** Level up: arpejo rápido subindo. */
  levelup(a, vol) {
    const t = a.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(a, { at: t + i * 0.085, type: 'triangle', f, peak: 0.22 * vol, attack: 0.006, decay: i === 3 ? 0.45 : 0.14 }));
    bell(a, { at: t + 0.26, f: 2093, ratio: 2, index: 1, peak: 0.06 * vol, decay: 0.6 });
  },
  /** Morte: tom grave que desce. */
  death(a, vol) {
    tone(a, { type: 'sawtooth', f: 320, fEnd: 48, glide: 0.95, peak: 0.32 * vol, attack: 0.01, decay: 1, lp: 900 });
  },
  /** Lançamento do jutsu: o som do elemento (`el`). */
  cast(a, vol, { el = 'neutral' } = {}) { (CAST[el] || CAST.neutral)(a, vol); },
  /** Impacto/explosão do elemento. */
  impact(a, vol, { el = 'neutral' } = {}) { (IMPACT[el] || IMPACT.neutral)(a, vol); },
  /** Estado que pegou em alguém (queimadura, molhado, paralisia...). */
  status(a, vol, { code } = {}) { STATUS[code]?.(a, vol); },
  /** Quem está queimando: chiado e estalos curtos (tocado de tempos em tempos enquanto queima). */
  burning(a, vol) {
    noise(a, { type: 'bandpass', f: 1800, Q: 0.8, peak: 0.08 * vol, attack: 0.03, dur: 0.25 });
    crackle(a, { dur: 0.35, n: 5, f: 3200, peak: 0.12 * vol });
  },
  /** Selo de mão: estalo curto (as mãos batendo); a altura muda a cada selo. */
  seal(a, vol, { i = 0 } = {}) {
    noise(a, { type: 'bandpass', f: [1900, 2400, 2100, 2700][i % 4], Q: 5, peak: 0.28 * vol, attack: 0.001, dur: 0.035 });
    tone(a, { f: [700, 880, 790, 990][i % 4], peak: 0.05 * vol, attack: 0.002, decay: 0.05 });
  },
  /**
   * Conjuração: os selos batendo (um a cada 0,16 s) e a energia do elemento carregando (a nota sobe) pelo tempo do selo.
   * Devolve { stop(abrupt) }: interrompido corta na hora; terminou, solta em 60 ms.
   */
  charge(a, vol, { ms = 800, el = 'neutral' } = {}) {
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const dur = Math.max(0.15, ms / 1000);
    const base = CHARGE_BASE[el] || CHARGE_BASE.neutral;
    const o = ctx.createOscillator();
    o.type = el === 'lightning' ? 'sawtooth' : el === 'stone' || el === 'shadow' ? 'square' : 'triangle';
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 4, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = el === 'lightning' ? 24 : 9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = base * 0.08;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    const g = ctx.createGain();
    const peak = 0.09 * vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.08);
    g.gain.setValueAtTime(peak, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(lp);
    lp.connect(g);
    g.connect(a.sfxBus);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
    // os selos de mão
    const seals = [];
    const n = Math.max(1, Math.floor(dur / 0.16));
    for (let i = 0; i < n; i++) seals.push(setTimeout(() => SFX.seal(a, vol, { i }), i * 160));
    let done = false;
    return {
      stop(abrupt = false) {
        if (done) return;
        done = true;
        seals.forEach(clearTimeout);
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        if (abrupt) g.gain.setValueAtTime(0, now);
        else { g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06); }
        try { o.stop(now + (abrupt ? 0.005 : 0.07)); lfo.stop(now + (abrupt ? 0.005 : 0.07)); } catch { /* já parou */ }
        if (abrupt) noise(a, { type: 'lowpass', f: 700, fEnd: 150, peak: 0.25 * vol, attack: 0.002, dur: 0.12 });   // "fsss": o selo desfez
      },
    };
  },
  /** Projétil voando: som que dura; quem chamou ajusta o volume pela distância (setVol) e para no impacto. */
  fly(a, vol, { el = 'neutral' } = {}) {
    const cfg = FLY[el] || FLY.neutral;
    const h = hold(a, { ...cfg, peak: cfg.peak * vol });
    h.vol = vol;
    let timer = 0;
    if (cfg.crackle) {
      const tick = () => { crackle(a, { dur: 0.12, n: 2, f: el === 'lightning' ? 6000 : 2800, peak: 0.08 * h.vol }); timer = setTimeout(tick, 90); };
      tick();
    }
    return {
      setVol(v) {
        h.vol = v;
        h.gain.gain.setTargetAtTime(Math.max(0.0001, cfg.peak * v), a.ctx.currentTime, 0.04);
      },
      stop(abrupt) { clearTimeout(timer); h.stop(abrupt); },
    };
  },
  /** Teleporte: "puf" de fumaça e um "fiu" subindo. */
  teleport(a, vol) {
    noise(a, { type: 'bandpass', f: 1300, fEnd: 500, Q: 1, peak: 0.4 * vol, attack: 0.005, dur: 0.22 });
    tone(a, { f: 300, fEnd: 1800, glide: 0.18, peak: 0.12 * vol, attack: 0.005, decay: 0.2 });
    bell(a, { at: a.ctx.currentTime + 0.12, f: 1760, ratio: 2, index: 0.6, peak: 0.05 * vol, decay: 0.3 });
  },
  /** Substituição: "puf" e o tronco de madeira batendo no chão. */
  substitution(a, vol) {
    const t = a.ctx.currentTime;
    noise(a, { type: 'bandpass', f: 1100, fEnd: 400, Q: 1, peak: 0.45 * vol, attack: 0.003, dur: 0.25 });
    for (const [f, d] of [[420, 0.12], [620, 0.08]]) noise(a, { at: t + 0.12, type: 'bandpass', f, Q: 18, peak: 0.6 * vol, attack: 0.001, dur: d });
    tone(a, { at: t + 0.12, f: 180, fEnd: 120, peak: 0.25 * vol, attack: 0.002, decay: 0.12 });
  },
  /** Notificações: info (dois tons), boa (três subindo), ruim (dois descendo, grave). */
  notify(a, vol, { tone: kind = 'info' } = {}) {
    const t = a.ctx.currentTime;
    const notes = kind === 'good' ? [784, 988, 1319] : kind === 'bad' ? [392, 311] : [880, 1175];
    notes.forEach((f, i) => tone(a, { at: t + i * 0.09, type: kind === 'bad' ? 'triangle' : 'sine', f, peak: 0.12 * vol, attack: 0.005, decay: kind === 'bad' ? 0.18 : 0.22 }));
  },
  /** Anúncio do servidor (torneio, Era): gongo. */
  announce(a, vol) {
    bell(a, { f: 196, ratio: 1.4, index: 4, peak: 0.2 * vol, decay: 1.6 });
    bell(a, { f: 392, ratio: 2.01, index: 1.5, peak: 0.07 * vol, decay: 1.2 });
  },
  /** Recompensa (ryō, XP da missão): moedinhas. */
  coins(a, vol) {
    const t = a.ctx.currentTime;
    for (let i = 0; i < 5; i++) bell(a, { at: t + i * 0.06 + Math.random() * 0.03, f: 1900 + Math.random() * 900, ratio: 1.5, index: 1.2, peak: 0.07 * vol, decay: 0.25 });
  },
  /** Mensagem de chat de outra pessoa: "tic" bem baixo. */
  chat(a, vol) { tone(a, { f: 1400, peak: 0.06 * vol, attack: 0.002, decay: 0.04 }); },
  /** Lodo atacando: "splorch" gosmento. */
  slime(a, vol) {
    noise(a, { type: 'lowpass', f: 900, fEnd: 200, Q: 6, peak: 0.4 * vol, attack: 0.005, dur: 0.18 });
    tone(a, { f: 220, fEnd: 90, peak: 0.15 * vol, attack: 0.005, decay: 0.15 });
  },
  /** Monstro morrendo: estouro e respingo. */
  slime_die(a, vol) {
    tone(a, { f: 500, fEnd: 120, peak: 0.25 * vol, attack: 0.002, decay: 0.12 });
    noise(a, { type: 'lowpass', f: 1200, fEnd: 200, Q: 3, peak: 0.35 * vol, attack: 0.003, dur: 0.3 });
  },
  /** Rei Lodo mudando de fase: rugido grave. */
  boss_roar(a, vol) {
    const o = tone(a, { type: 'sawtooth', f: 85, fEnd: 60, glide: 1.2, peak: 0.3 * vol, attack: 0.1, decay: 1.1, lp: 700 });
    const l = a.ctx.createOscillator();
    const lg = a.ctx.createGain();
    l.frequency.value = 22;
    lg.gain.value = 18;
    l.connect(lg);
    lg.connect(o.frequency);
    l.start();
    l.stop(a.ctx.currentTime + 1.3);
    noise(a, { type: 'lowpass', f: 500, Q: 2, peak: 0.25 * vol, attack: 0.15, dur: 1 });
  },
  /** Golpe avisado no chão (círculo vermelho): pulso de alerta grave. */
  warn(a, vol) {
    const t = a.ctx.currentTime;
    tone(a, { at: t, type: 'triangle', f: 220, peak: 0.1 * vol, attack: 0.01, decay: 0.12 });
    tone(a, { at: t + 0.16, type: 'triangle', f: 220, peak: 0.1 * vol, attack: 0.01, decay: 0.12 });
  },
  /** Atordoado/preso (PvP): zumbido curto. */
  stunned(a, vol) { STATUS.paralisia(a, vol); },
  /** Cura recebida. */
  healed(a, vol) { IMPACT.heal(a, vol); },
  /** Item usado (Shuriken lançada, poção). */
  shuriken(a, vol) { noise(a, { type: 'bandpass', f: 3000, fEnd: 5000, Q: 8, peak: 0.25 * vol, attack: 0.002, dur: 0.15 }); },
};

export const SFX_KINDS = Object.keys(SFX);
export const SOUND_TABLES = { CAST, IMPACT, STATUS, FLY };
