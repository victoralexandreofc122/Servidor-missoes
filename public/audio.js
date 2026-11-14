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
const VOICES = { slash: [6, 25], thud: [6, 25], whoosh: [4, 40], step: [2, 60], blip: [2, 40], levelup: [1, 400], death: [2, 200], charge: [4, 0] };

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
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
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
    if (!this.ctx || this.settings.mute || vol < 0.03) return null;
    const fn = SFX[kind];
    if (!fn) return null;
    if (!this.voice(kind, opt.ms ?? 400)) return null;
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

/** Os efeitos sintetizados. Cada um recebe (audio, vol, opções). Ganhos baixos: o compressor é só a rede de segurança. */
export const SFX = {
  /** Ataque básico (soco/corte): ruído filtrado, decaimento rápido. */
  slash(a, vol, { pitch = 1 } = {}) {
    const t = a.ctx.currentTime;
    const f = a.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(3200 * pitch, t);
    f.frequency.exponentialRampToValueAtTime(900 * pitch, t + 0.09);
    f.connect(a.env(0.75 * vol, 0.004, 0.1, t));
    a.noiseSrc(t, 0.12).connect(f);
  },
  /** Acerto de dano: "thud" grave e curto. */
  thud(a, vol) {
    const t = a.ctx.currentTime;
    const o = a.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.14);
    o.connect(a.env(0.6 * vol, 0.003, 0.16, t));
    o.start(t);
    o.stop(t + 0.2);
    const lp = a.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    lp.connect(a.env(0.22 * vol, 0.002, 0.05, t));
    a.noiseSrc(t, 0.07).connect(lp);
  },
  /** Lançamento de jutsu: "whoosh" (ruído com passa-banda que varre). */
  whoosh(a, vol) {
    const t = a.ctx.currentTime;
    const f = a.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(380, t);
    f.frequency.exponentialRampToValueAtTime(2100, t + 0.14);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.34);
    f.connect(a.env(0.6 * vol, 0.05, 0.3, t));
    a.noiseSrc(t, 0.38).connect(f);
  },
  /** Passo: abafado e bem baixo; `alt` troca o tom (um pé e o outro). */
  step(a, vol, { alt = false } = {}) {
    const t = a.ctx.currentTime;
    const f = a.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = alt ? 340 : 260;
    f.connect(a.env(0.11 * vol, 0.004, 0.06, t));
    a.noiseSrc(t, 0.08).connect(f);
  },
  /** Clique de interface: senoide de 800 Hz, 0,05 s. */
  blip(a, vol) {
    const t = a.ctx.currentTime;
    const o = a.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 800;
    o.connect(a.env(0.16 * vol, 0.003, 0.047, t));
    o.start(t);
    o.stop(t + 0.06);
  },
  /** Level up: arpejo rápido subindo (dó, mi, sol, dó). */
  levelup(a, vol) {
    const t = a.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
      const at = t + i * 0.085;
      const o = a.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz;
      o.connect(a.env(0.22 * vol, 0.006, i === 3 ? 0.45 : 0.14, at));
      o.start(at);
      o.stop(at + (i === 3 ? 0.5 : 0.18));
    });
  },
  /** Morte: tom grave que desce. */
  death(a, vol) {
    const t = a.ctx.currentTime;
    const o = a.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.95);
    const lp = a.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.95);
    o.connect(lp);
    lp.connect(a.env(0.32 * vol, 0.01, 1, t));
    o.start(t);
    o.stop(t + 1.05);
  },
  /**
   * Conjuração: "carregando" (a frequência sobe) pelo tempo do selo. Devolve { stop(abrupt) }: interrompido corta na
   * hora; terminou, solta em 60 ms.
   */
  charge(a, vol, { ms = 800 } = {}) {
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const dur = Math.max(0.15, ms / 1000);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(760, t + dur);
    const lfo = ctx.createOscillator();      // tremido leve, de energia acumulando
    lfo.frequency.value = 9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 14;
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const g = ctx.createGain();
    const peak = 0.13 * vol;
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
    let done = false;
    return {
      stop(abrupt = false) {
        if (done) return;
        done = true;
        const now = ctx.currentTime;
        g.gain.cancelScheduledValues(now);
        if (abrupt) g.gain.setValueAtTime(0, now);
        else { g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06); }
        try { o.stop(now + (abrupt ? 0.005 : 0.07)); lfo.stop(now + (abrupt ? 0.005 : 0.07)); } catch { /* já parou */ }
      },
    };
  },
};

export const SFX_KINDS = Object.keys(SFX);
