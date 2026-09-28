// Procedural audio: droning field ambience, pulsing battle loop, UI + combat
// SFX. Pure WebAudio, no files. Starts on the first user gesture.
import { Settings } from './state.js';

let ctx = null, master = null, musicBus = null, current = null;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = Settings.volume;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.5;
  // long feedback delay = cathedral space
  const delay = ctx.createDelay(1.5), fb = ctx.createGain(), wet = ctx.createGain();
  delay.delayTime.value = 0.42; fb.gain.value = 0.45; wet.gain.value = 0.35;
  musicBus.connect(master);
  musicBus.connect(delay); delay.connect(fb).connect(delay); delay.connect(wet).connect(master);
  return true;
}

function noiseBuffer(sec = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function tone(freq, t, dur, { type = 'sawtooth', gain = 0.1, cutoff = 1800, dest = musicBus, attack = 0.01, q = 1 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = freq;
  f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = q;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}

function noiseHit(t, dur, { gain = 0.2, cutoff = 3000, type = 'bandpass', dest = master } = {}) {
  const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  s.buffer = noiseBuffer(dur + 0.1);
  f.type = type; f.frequency.value = cutoff;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t); s.stop(t + dur + 0.05);
}

// ---- music ---------------------------------------------------------------

class Loop {
  constructor(kind) {
    this.kind = kind;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(musicBus);
    this.bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    this.step = 0;
    this.next = ctx.currentTime + 0.1;
    this.nodes = [];
    if (kind === 'field' || kind === 'title') this.drone();
    this.timer = setInterval(() => this.schedule(), 50);
  }

  drone() {
    const root = this.kind === 'title' ? 38 : 36;
    for (const [n, det] of [[root, -6], [root, 5], [root + 7, 0], [root + 12, 3]]) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
      f.type = 'lowpass'; f.frequency.value = 280; f.Q.value = 4;
      lfo.frequency.value = 0.05 + Math.random() * 0.08; lg.gain.value = 180;
      lfo.connect(lg).connect(f.frequency);
      g.gain.value = 0.05;
      o.connect(f).connect(g).connect(this.bus);
      o.start(); lfo.start();
      this.nodes.push(o, lfo);
    }
  }

  schedule() {
    const bpm = this.kind === 'battle' || this.kind === 'boss' ? (this.kind === 'boss' ? 148 : 136) : 72;
    const sixteenth = 60 / bpm / 4;
    while (this.next < ctx.currentTime + 0.2) {
      const s = this.step, t = this.next;
      if (this.kind === 'battle' || this.kind === 'boss') this.battleStep(s, t, sixteenth);
      else this.fieldStep(s, t, sixteenth);
      this.step++;
      this.next += sixteenth;
    }
  }

  fieldStep(s, t) {
    // sparse glass arpeggio over the drone (A minor / Phrygian colour)
    const scale = [57, 58, 60, 64, 65, 69, 72, 76];
    if (s % 6 === 0 && Math.random() < 0.7) {
      const n = scale[(s / 6 + (Math.random() < 0.3 ? 3 : 0)) % scale.length | 0];
      tone(midi(n + 12), t, 2.4, { type: 'triangle', gain: 0.035, cutoff: 2600, dest: this.bus, attack: 0.02 });
    }
    if (s % 64 === 0) tone(midi(33), t, 6, { type: 'sine', gain: 0.12, cutoff: 200, dest: this.bus, attack: 1.5 });
    if (s % 48 === 24 && Math.random() < 0.5) noiseHit(t, 1.2, { gain: 0.03, cutoff: 5000, dest: this.bus });
  }

  battleStep(s, t, sx) {
    const boss = this.kind === 'boss';
    const bar = Math.floor(s / 16) % 4;
    const roots = boss ? [38, 38, 41, 36] : [45, 45, 43, 41];
    const r = roots[bar];
    const i = s % 16;
    // bass: driving 8ths with octave pops
    if (i % 2 === 0) tone(midi(r - 12 + (i % 8 === 6 ? 12 : 0)), t, sx * 1.8, { gain: 0.16, cutoff: 700, dest: this.bus, q: 6 });
    // kick
    if (i % 4 === 0) { tone(110, t, 0.18, { type: 'sine', gain: 0.5, cutoff: 400, dest: this.bus }); }
    // snare / glitch hat
    if (i === 4 || i === 12) noiseHit(t, 0.18, { gain: 0.18, cutoff: 1800, dest: this.bus });
    if (i % 2 === 1) noiseHit(t, 0.04, { gain: 0.05, cutoff: 8000, type: 'highpass', dest: this.bus });
    // lead: minor arpeggio
    const arp = [0, 3, 7, 10, 12, 10, 7, 3];
    if (i % 2 === 0) tone(midi(r + 12 + arp[(i / 2) % 8]), t, sx * 1.5, { type: 'square', gain: 0.03, cutoff: 2400, dest: this.bus });
    if (boss && i === 0 && bar === 0) tone(midi(r + 24), t, sx * 14, { type: 'sawtooth', gain: 0.04, cutoff: 1200, dest: this.bus, attack: 0.3 });
  }

  stop() {
    clearInterval(this.timer);
    const g = this.bus.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    setTimeout(() => { this.nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }); this.bus.disconnect(); }, 1000);
  }
}

export const Audio = {
  unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  },
  setVolume(v) { if (master) master.gain.value = v; },
  music(kind) {
    if (!ensure()) return;
    if (current?.kind === kind) return;
    current?.stop();
    current = kind ? new Loop(kind) : null;
  },
  sfx(name) {
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'move': tone(1400, t, 0.05, { type: 'square', gain: 0.03, cutoff: 5000, dest: master }); break;
      case 'ok': tone(880, t, 0.08, { type: 'square', gain: 0.05, cutoff: 5000, dest: master }); tone(1320, t + 0.05, 0.1, { type: 'square', gain: 0.04, cutoff: 5000, dest: master }); break;
      case 'back': tone(440, t, 0.1, { type: 'square', gain: 0.04, cutoff: 3000, dest: master }); break;
      case 'hit': noiseHit(t, 0.2, { gain: 0.4, cutoff: 1400 }); tone(90, t, 0.2, { type: 'sine', gain: 0.4, cutoff: 500, dest: master }); break;
      case 'crit': noiseHit(t, 0.35, { gain: 0.5, cutoff: 2500 }); tone(60, t, 0.35, { type: 'sawtooth', gain: 0.3, cutoff: 400, dest: master }); break;
      case 'ring': tone(1760, t, 0.12, { type: 'sine', gain: 0.12, cutoff: 8000, dest: master }); break;
      case 'miss': tone(220, t, 0.25, { type: 'sawtooth', gain: 0.08, cutoff: 900, dest: master }); break;
      case 'magic': for (let i = 0; i < 6; i++) tone(midi(72 + i * 5), t + i * 0.04, 0.5, { type: 'triangle', gain: 0.05, cutoff: 6000, dest: master }); noiseHit(t, 0.6, { gain: 0.1, cutoff: 6000 }); break;
      case 'heal': for (let i = 0; i < 5; i++) tone(midi(76 + [0, 4, 7, 12, 16][i]), t + i * 0.07, 0.8, { type: 'sine', gain: 0.06, cutoff: 8000, dest: master }); break;
      case 'glitch': for (let i = 0; i < 8; i++) tone(200 + Math.random() * 3000, t + i * 0.025, 0.04, { type: 'square', gain: 0.05, cutoff: 8000, dest: master }); noiseHit(t, 0.3, { gain: 0.15, cutoff: 4000 }); break;
      case 'encounter': noiseHit(t, 0.8, { gain: 0.3, cutoff: 900, type: 'lowpass' }); for (let i = 0; i < 12; i++) tone(100 + Math.random() * 4000, t + i * 0.03, 0.05, { type: 'square', gain: 0.06, cutoff: 9000, dest: master }); tone(55, t, 1.2, { type: 'sawtooth', gain: 0.25, cutoff: 300, dest: master }); break;
      case 'save': for (let i = 0; i < 8; i++) tone(midi(60 + [0, 7, 12, 16, 19, 24, 28, 31][i]), t + i * 0.09, 1.4, { type: 'sine', gain: 0.05, cutoff: 8000, dest: master }); break;
      case 'levelup': for (let i = 0; i < 4; i++) tone(midi(69 + [0, 4, 7, 12][i]), t + i * 0.1, 0.5, { type: 'square', gain: 0.05, cutoff: 5000, dest: master }); break;
      case 'chest': tone(midi(79), t, 0.3, { type: 'triangle', gain: 0.08, cutoff: 8000, dest: master }); tone(midi(86), t + 0.12, 0.6, { type: 'triangle', gain: 0.08, cutoff: 8000, dest: master }); break;
      default: break;
    }
  },
};
