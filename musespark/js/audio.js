// MuseSpark: Web Audio engine. Plays the full mix, instrumental and vocal stems in sample-accurate sync,
// removes vocals when there's no instrumental stem (center-channel cancellation with bass kept),
// handles mic input, pitch detection, and recording of takes and videos.

const Engine = (() => {
  let ctx = null, master, analyser, silent, recDest, takeDest;
  let dry, wet, wetBass, instGain, guideGain, vocalAnalyser, fullIn, instIn, vocalIn;
  let bufs = { full: null, inst: null, vocals: null }, loadedId = null, loadedKey = '';
  let sources = [], gen = 0;
  let startedAt = 0, offset = 0, playing = false, semis = 0, karaoke = true, guide = 0;
  let mic = null; // { stream, src, gain, analyser }
  let canReduce = true;
  const listeners = { end: new Set(), load: new Set() };
  const emit = (ev, x) => listeners[ev].forEach(f => f(x));

  function ac() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.78;
    master.connect(analyser); analyser.connect(ctx.destination);
    silent = ctx.createGain(); silent.gain.value = 0; silent.connect(ctx.destination);
    recDest = ctx.createMediaStreamDestination(); master.connect(recDest);   // music only (SMV)
    takeDest = ctx.createMediaStreamDestination(); master.connect(takeDest); // music + mic (takes)

    // full mix → dry, or → vocal reducer (L − R, plus the mono low end added back)
    fullIn = ctx.createGain();
    dry = ctx.createGain(); fullIn.connect(dry); dry.connect(master);
    const split = ctx.createChannelSplitter(2), gl = ctx.createGain(), gr = ctx.createGain(), side = ctx.createGain();
    side.channelCount = 1; side.channelCountMode = 'explicit';
    gr.gain.value = -1;
    fullIn.connect(split); split.connect(gl, 0); split.connect(gr, 1); gl.connect(side); gr.connect(side);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160;
    wet = ctx.createGain(); side.connect(hp); hp.connect(wet); wet.connect(master);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    wetBass = ctx.createGain(); fullIn.connect(lp); lp.connect(wetBass); wetBass.connect(master);

    instIn = ctx.createGain(); instGain = ctx.createGain(); instIn.connect(instGain); instGain.connect(master);
    vocalIn = ctx.createGain(); guideGain = ctx.createGain(); vocalIn.connect(guideGain); guideGain.connect(master);
    vocalAnalyser = ctx.createAnalyser(); vocalAnalyser.fftSize = 2048; vocalIn.connect(vocalAnalyser); vocalAnalyser.connect(silent);
    applyMix(true);
    return ctx;
  }

  function applyMix(now) {
    if (!ctx) return;
    const hasInst = !!bufs.inst;
    const set = (node, v) => now ? (node.gain.value = v) : node.gain.setTargetAtTime(v, ctx.currentTime, 0.04);
    const reduce = karaoke && !hasInst;
    // Guide vocal: the vocal stem if there is one, otherwise a little of the original mix blended back in.
    set(dry, karaoke ? (bufs.vocals ? 0 : guide * 0.7) : 1);
    set(wet, reduce ? 1.35 : 0);
    set(wetBass, reduce ? 0.9 : 0);
    set(instGain, karaoke && hasInst ? 1 : 0);
    set(guideGain, karaoke && bufs.vocals ? guide : 0);
  }

  async function decode(blob) {
    if (!blob) return null;
    const data = await blob.arrayBuffer();
    return await ac().decodeAudioData(data);
  }

  // Stereo files whose channels are nearly identical can't be de-vocalled by cancellation.
  function checkStereo(b) {
    if (!b || b.numberOfChannels < 2) return false;
    const L = b.getChannelData(0), R = b.getChannelData(1);
    let s = 0, d = 0;
    for (let i = 0; i < L.length; i += 97) { s += (L[i] + R[i]) ** 2; d += (L[i] - R[i]) ** 2; }
    return d / (s + 1e-9) > 0.004;
  }

  async function load(song) {
    ac();
    // Re-decode only when the audio itself changes, not on every lyric-timing save.
    const key = [song.id, song.audio, song.instrumental, song.vocals].map(b => b && b.size != null ? b.size : b).join('|');
    if (loadedKey === key && bufs.full) return;
    stop();
    offset = 0;
    const [full, inst, vocals] = await Promise.all([decode(song.audio), decode(song.instrumental), decode(song.vocals)]);
    bufs = { full: full || inst, inst, vocals };
    loadedId = song.id; loadedKey = key;
    canReduce = checkStereo(bufs.full);
    applyMix(true);
    emit('load', song);
  }

  const rate = () => Math.pow(2, semis / 12);
  const duration = () => bufs.full ? bufs.full.duration : 0;

  function stop() {
    gen++;
    for (const s of sources) { try { s.onended = null; s.stop(); } catch (e) { /* already stopped */ } s.disconnect(); }
    sources = [];
    playing = false;
  }

  function play(from = offset) {
    if (!bufs.full) return;
    ac(); if (ctx.state === 'suspended') ctx.resume();
    stop();
    from = clamp(from, 0, duration());
    const my = gen, when = ctx.currentTime + 0.04;
    const add = (buf, dest) => {
      if (!buf) return null;
      const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate();
      s.connect(dest); s.start(when, Math.min(from, buf.duration)); sources.push(s); return s;
    };
    const main = add(bufs.full, fullIn);
    add(bufs.inst, instIn);
    add(bufs.vocals, vocalIn);
    startedAt = when; offset = from; playing = true;
    main.onended = () => { if (my !== gen) return; playing = false; offset = duration(); emit('end'); };
  }

  function pause() { if (!playing) return; offset = time(); stop(); }
  function toggle() { playing ? pause() : play(offset >= duration() - 0.05 ? 0 : offset); }
  function time() { return playing ? Math.min(duration(), offset + Math.max(0, ctx.currentTime - startedAt) * rate()) : offset; }
  function seek(t) { if (playing) play(t); else offset = clamp(t, 0, duration()); }
  // What the listener hears right now, used to drive lyrics (output latency + user offset removed).
  function heardTime() {
    const lat = ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0;
    return time() - (playing ? lat * rate() : 0) - (Settings.get('offsetMs') || 0) / 1000;
  }

  function setKey(n) { const t = time(); semis = n; if (playing) play(t); }
  function setKaraoke(on) { karaoke = on; applyMix(); }
  function setGuide(v) { guide = v; applyMix(); }

  // One-off buffer through the master bus (voice intros). Resolves when it finishes.
  function playBuffer(buf) {
    ac(); if (ctx.state === 'suspended') ctx.resume();
    return new Promise(res => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(master); s.onended = () => { s.disconnect(); res(); }; s.start();
    });
  }

  // ═════════ MIC ═════════
  async function startMic() {
    ac(); if (ctx.state === 'suspended') await ctx.resume();
    if (mic) return mic;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
    const src = ctx.createMediaStreamSource(stream), gain = ctx.createGain(), an = ctx.createAnalyser();
    an.fftSize = 2048;
    src.connect(gain); gain.connect(an); an.connect(silent); gain.connect(takeDest);
    mic = { stream, src, gain, analyser: an };
    return mic;
  }
  function stopMic() {
    if (!mic) return;
    mic.stream.getTracks().forEach(t => t.stop());
    mic.src.disconnect(); mic.gain.disconnect(); mic.analyser.disconnect();
    mic = null;
  }
  function setMicGain(v) { if (mic) mic.gain.gain.value = v; }

  // ═════════ PITCH (YIN) ═════════
  const tdBuf = new Float32Array(2048);
  function pitchOf(an) {
    if (!an) return { f: -1, rms: 0 };
    an.getFloatTimeDomainData(tdBuf);
    const x = tdBuf, n = x.length;
    let rms = 0; for (let i = 0; i < n; i++) rms += x[i] * x[i];
    rms = Math.sqrt(rms / n);
    if (rms < 0.01) return { f: -1, rms };
    const sr = ctx.sampleRate, maxLag = Math.min(Math.floor(sr / 70), n >> 1), minLag = Math.floor(sr / 1100), W = n - maxLag;
    const d = new Float32Array(maxLag + 1);
    for (let tau = 1; tau <= maxLag; tau++) { let s = 0; for (let i = 0; i < W; i++) { const v = x[i] - x[i + tau]; s += v * v; } d[tau] = s; }
    let run = 0, tau = -1;
    d[0] = 1;
    for (let k = 1; k <= maxLag; k++) { run += d[k]; d[k] = d[k] * k / (run || 1); }
    for (let k = minLag; k < maxLag; k++) {
      if (d[k] < 0.15) { while (k + 1 < maxLag && d[k + 1] < d[k]) k++; tau = k; break; }
    }
    if (tau < 0) return { f: -1, rms };
    const a = d[tau - 1], b = d[tau], c = d[tau + 1];
    const shift = (a + c - 2 * b) ? (a - c) / (2 * (a + c - 2 * b)) : 0;
    return { f: sr / (tau + shift), rms };
  }
  const level = (an) => { if (!an) return 0; an.getFloatTimeDomainData(tdBuf); let s = 0; for (let i = 0; i < tdBuf.length; i++) s += tdBuf[i] * tdBuf[i]; return Math.sqrt(s / tdBuf.length); };

  // ═════════ RECORDING ═════════
  function recorderFor(stream, kind) {
    const types = kind === 'video'
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    const mimeType = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 } : {});
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => { rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm') })); });
    return { rec, done };
  }

  return {
    ac, load, play, pause, toggle, stop, seek, time, heardTime, duration, setKey, setKaraoke, setGuide, playBuffer, decode,
    startMic, stopMic, setMicGain, pitchOf, level, recorderFor,
    on: (ev, f) => listeners[ev].add(f), off: (ev, f) => listeners[ev].delete(f),
    get playing() { return playing; },
    get loadedId() { return loadedId; },
    get analyser() { return analyser; },
    get vocalAnalyser() { return bufs.vocals ? vocalAnalyser : null; },
    get micAnalyser() { return mic ? mic.analyser : null; },
    get hasInstrumental() { return !!bufs.inst; },
    get hasVocals() { return !!bufs.vocals; },
    get canReduce() { return canReduce; },
    get musicStream() { ac(); return recDest.stream; },
    get takeStream() { ac(); return takeDest.stream; },
    get semis() { return semis; },
  };
})();

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);
const midiName = (m) => NOTE_NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
