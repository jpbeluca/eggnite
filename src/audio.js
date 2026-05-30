// Procedural sound engine — everything synthesized with the Web Audio API.
// No external audio files, so the game stays 100% self-contained.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuffer = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this._makeNoise(1.0);
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    return src;
  }

  // generic envelope helper
  _env(gainNode, t, attack, peak, decay, end = 0.0001) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(end, t + attack + decay);
  }

  shot(type = "rifle") {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const cfg = {
      pistol:  { vol: 0.5, dur: 0.16, lp: 1800, tone: 220 },
      rifle:   { vol: 0.45, dur: 0.12, lp: 2600, tone: 320 },
      shotgun: { vol: 0.7, dur: 0.30, lp: 1200, tone: 120 },
    }[type] || { vol: 0.5, dur: 0.15, lp: 2000, tone: 200 };

    // noise body
    const noise = this._noiseSource();
    const ng = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(cfg.lp * 2.5, t);
    lp.frequency.exponentialRampToValueAtTime(cfg.lp * 0.4, t + cfg.dur);
    this._env(ng, t, 0.001, cfg.vol, cfg.dur);
    noise.connect(lp); lp.connect(ng); ng.connect(this.master);
    noise.start(t); noise.stop(t + cfg.dur + 0.05);

    // punchy low tone
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(cfg.tone, t);
    osc.frequency.exponentialRampToValueAtTime(cfg.tone * 0.4, t + cfg.dur);
    this._env(og, t, 0.001, cfg.vol * 0.6, cfg.dur * 0.8);
    osc.connect(og); og.connect(this.master);
    osc.start(t); osc.stop(t + cfg.dur + 0.05);
  }

  dryFire() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "square"; osc.frequency.value = 90;
    this._env(g, t, 0.001, 0.15, 0.04);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.08);
  }

  reload() {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    // two mechanical clicks
    [0, 0.18].forEach((delay, i) => {
      const t = t0 + delay;
      const noise = this._noiseSource();
      const g = this.ctx.createGain();
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = i ? 1600 : 900; bp.Q.value = 3;
      this._env(g, t, 0.001, 0.3, 0.05);
      noise.connect(bp); bp.connect(g); g.connect(this.master);
      noise.start(t); noise.stop(t + 0.1);
    });
  }

  explosion() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const noise = this._noiseSource();
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    this._env(g, t, 0.004, 0.8, 0.55);
    noise.connect(lp); lp.connect(g); g.connect(this.master);
    noise.start(t); noise.stop(t + 0.7);

    // sub thump
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = "sine"; osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    this._env(og, t, 0.005, 0.7, 0.45);
    osc.connect(og); og.connect(this.master);
    osc.start(t); osc.stop(t + 0.5);

    // wet "splat" highs
    const splat = this._noiseSource();
    const sg = this.ctx.createGain();
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 2500;
    this._env(sg, t + 0.02, 0.002, 0.25, 0.12);
    splat.connect(hp); hp.connect(sg); sg.connect(this.master);
    splat.start(t); splat.stop(t + 0.2);
  }

  hurt() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.25);
    this._env(g, t, 0.003, 0.35, 0.25);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.3);
  }

  // alien chitter when an egg spots/attacks the player
  screech() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(600 + Math.random() * 300, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.22);
    this._env(g, t, 0.01, 0.12, 0.2);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1200; bp.Q.value = 4;
    osc.connect(bp); bp.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.25);
  }

  pickup() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [660, 990].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "triangle"; osc.frequency.value = f;
      this._env(g, t + i * 0.08, 0.005, 0.2, 0.1);
      osc.connect(g); g.connect(this.master);
      osc.start(t + i * 0.08); osc.stop(t + i * 0.08 + 0.15);
    });
  }

  waveStart() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [330, 440, 550].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sawtooth"; osc.frequency.value = f;
      this._env(g, t + i * 0.12, 0.01, 0.18, 0.2);
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 1500;
      osc.connect(lp); lp.connect(g); g.connect(this.master);
      osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.3);
    });
  }
}
