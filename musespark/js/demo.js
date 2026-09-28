// MuseSpark: "First Spark", an original demo song synthesised in the browser, so you can try every feature
// before importing a Suno track. Renders the instrumental and a synth "vocal" stem separately,
// with lyrics timed word by word.

const Demo = (() => {
  const BPM = 100, BEAT = 60 / BPM, BAR = BEAT * 4, SR = 32000;
  const INTRO_BARS = 2;
  // [word, midi, beats]
  const SONG = [
    ['Verse', [['Light', 64, 1], ['a', 64, .5], ['little', 65, 1], ['spark', 67, 1.5], ['in', 65, .5], ['the', 64, .5], ['dark', 62, 2]]],
    ['Verse', [['Hum', 60, 1], ['it', 62, .5], ['till', 64, .5], ['the', 65, .5], ['silence', 67, 1.5], ['falls', 65, 1], ['apart', 64, 2]]],
    ['Verse', [['Every', 64, 1], ['song', 67, 1], ['begins', 69, 1.5], ['as', 67, .5], ['a', 65, .5], ['wish', 64, 2.5]]],
    ['Chorus', [['Imagine', 67, 1.5], ['it,', 69, .5], ['create', 72, 1.5], ['it,', 71, .5], ['sing', 67, 3]]],
    ['Chorus', [['Let', 65, .5], ['the', 65, .5], ['spark', 69, 1], ['inspire', 67, 1.5], ['everything', 64, 3.5]]],
    ['Chorus', [['Imagine', 67, 1.5], ['it,', 69, .5], ['create', 72, 1.5], ['it,', 74, .5], ['sing', 72, 3]]],
  ];
  const CHORDS = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]]; // C Am F G
  const LINE_BARS = 2;
  const totalBars = INTRO_BARS + SONG.length * LINE_BARS + 2;
  const DUR = totalBars * BAR + 1.5;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function schedule() {
    const lines = [], notes = [];
    SONG.forEach(([section, words], li) => {
      let t = (INTRO_BARS + li * LINE_BARS) * BAR + BEAT * 0.5;
      const lw = [];
      for (const [w, m, b] of words) {
        const d = b * BEAT;
        notes.push({ m, t, d: d * 0.92 });
        lw.push({ w, t: +t.toFixed(3), e: +(t + d * 0.92).toFixed(3) });
        t += d;
      }
      lines.push({ t: lw[0].t, text: lw.map(x => x.w).join(' '), section, words: lw });
    });
    return { lines, notes };
  }

  function noise(ctx) {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  async function renderInstrumental() {
    const ctx = new OfflineAudioContext(2, Math.ceil(DUR * SR), SR);
    const out = ctx.createGain(); out.gain.value = 0.8; out.connect(ctx.destination);
    const nb = noise(ctx);
    const pan = (v) => { const p = ctx.createStereoPanner(); p.pan.value = v; p.connect(out); return p; };
    const padBus = pan(0), bassBus = pan(0), hatBus = pan(0.35), arpBus = pan(-0.4);

    for (let bar = 0; bar < totalBars; bar++) {
      const t0 = bar * BAR, chord = CHORDS[bar % 4], last = bar === totalBars - 1;
      // pad
      chord.forEach((m, k) => {
        [-6, 6].forEach(det => {
          const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.value = mtof(m + 12); o.detune.value = det + k;
          f.type = 'lowpass'; f.frequency.value = 1400;
          g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.028, t0 + 0.25); g.gain.setValueAtTime(0.028, t0 + BAR - 0.2); g.gain.linearRampToValueAtTime(0, t0 + BAR + (last ? 1.2 : 0.05));
          o.connect(f); f.connect(g); g.connect(padBus); o.start(t0); o.stop(t0 + BAR + 1.3);
        });
      });
      if (last) { kick(ctx, out, t0); continue; }
      // bass: root eighths
      for (let e = 0; e < 8; e++) {
        const t = t0 + e * BEAT / 2, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'square'; o.frequency.value = mtof(chord[0] - 12 + (e === 7 ? 7 : 0));
        f.type = 'lowpass'; f.frequency.value = 420;
        g.gain.setValueAtTime(0.13, t); g.gain.exponentialRampToValueAtTime(0.001, t + BEAT / 2 * 0.95);
        o.connect(f); f.connect(g); g.connect(bassBus); o.start(t); o.stop(t + BEAT / 2);
      }
      // arp sparkle
      for (let s = 0; s < 8; s++) {
        const t = t0 + s * BEAT / 2, m = chord[s % 3] + 24 + (s > 3 ? 12 : 0);
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = mtof(m);
        g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
        o.connect(g); g.connect(arpBus); o.start(t); o.stop(t + 0.3);
      }
      if (bar < 1) continue;
      // drums
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * BEAT;
        if (b % 2 === 0) kick(ctx, out, t);
        else {
          const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
          s.buffer = nb; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
          g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + 0.2);
        }
        for (const off of [0, BEAT / 2]) {
          const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
          s.buffer = nb; f.type = 'highpass'; f.frequency.value = 7000;
          g.gain.setValueAtTime(off ? 0.05 : 0.08, t + off); g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.05);
          s.connect(f); f.connect(g); g.connect(hatBus); s.start(t + off, Math.random() * 0.5); s.stop(t + off + 0.06);
        }
      }
    }
    return ctx.startRendering();
  }

  function kick(ctx, out, t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.75, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32);
  }

  // A vowel-ish lead: saw through two formant band-passes, with vibrato. Centre-panned like a real lead vocal.
  async function renderVocal(notes) {
    const ctx = new OfflineAudioContext(2, Math.ceil(DUR * SR), SR);
    const out = ctx.createGain(); out.gain.value = 0.9; out.connect(ctx.destination);
    const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), body = ctx.createGain();
    f1.type = 'bandpass'; f1.frequency.value = 700; f1.Q.value = 4;
    f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 6;
    body.connect(f1); body.connect(f2); f1.connect(out); f2.connect(out);
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 5.2; lfoG.gain.value = 14; lfo.connect(lfoG); lfo.start(0);
    for (const n of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = mtof(n.m);
      lfoG.connect(o.detune);
      g.gain.setValueAtTime(0, n.t); g.gain.linearRampToValueAtTime(0.5, n.t + 0.04);
      g.gain.setValueAtTime(0.42, n.t + Math.max(0.05, n.d - 0.08)); g.gain.linearRampToValueAtTime(0, n.t + n.d);
      o.connect(g); g.connect(body); o.start(n.t); o.stop(n.t + n.d + 0.02);
    }
    return ctx.startRendering();
  }

  function mix(a, b) {
    const out = new AudioBuffer({ numberOfChannels: 2, length: a.length, sampleRate: a.sampleRate });
    for (let c = 0; c < 2; c++) {
      const x = a.getChannelData(c), y = b.getChannelData(c), o = out.getChannelData(c);
      for (let i = 0; i < o.length; i++) o[i] = x[i] + y[i] * 0.85;
    }
    return out;
  }

  async function create() {
    const { lines, notes } = schedule();
    const [inst, voc] = await Promise.all([renderInstrumental(), renderVocal(notes)]);
    const full = mix(inst, voc);
    const lyricsRaw = Lyrics.toSheet(lines);
    return {
      id: uid(), title: 'First Spark', artist: 'MuseSpark Demo', style: 'bright synthpop, warm pads, 100 bpm, hopeful',
      lyricsRaw, lines, duration: full.duration,
      audio: encodeWav(full), instrumental: encodeWav(inst), vocals: encodeWav(voc),
      cover: null, intro: null, created: Date.now(), updated: Date.now(), demo: true,
    };
  }

  return { create };
})();
