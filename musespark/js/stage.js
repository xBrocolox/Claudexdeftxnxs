// MuseSpark: karaoke stage. Word-by-word lyric wipe, countdowns, reactive background, mic pitch tracking,
// Spark Score and recorded takes.

const Stage = (() => {
  let song = null, raf = 0, curIdx = -2, curWords = null, wordEls = [];
  let seeking = false, recording = null, active = false;
  const score = { pts: 0, possible: 0, lastTick: 0, trail: [] };
  const freq = new Uint8Array(1024);
  const sparks = [];
  let lastBass = 0;

  const { lineAt, nextTimed } = Lyrics;

  function renderLines(idx) {
    curIdx = idx;
    const L = song.lines, dur = Engine.duration();
    const cur = $('#lx-cur'), prev = $('#lx-prev'), next = $('#lx-next');
    if (Lyrics.status(L) === 'unsynced' || Lyrics.status(L) === 'none') {
      prev.textContent = ''; next.textContent = '';
      cur.innerHTML = L.length ? `<span class="hint-line">These lyrics aren't synced yet.<br><a href="#/studio/${song.id}">Open the Sync studio</a> to tap them in or auto-sync them.</span>` : `<span class="hint-line">No lyrics yet. Add them in the Library.</span>`;
      curWords = null; wordEls = []; return;
    }
    const n = nextTimed(L, idx);
    prev.textContent = idx > 0 ? L[idx - 1].text : '';
    if (idx < 0) {
      cur.innerHTML = `<span class="title-line">${esc(song.title)}</span>`;
      curWords = null; wordEls = [];
    } else {
      curWords = Lyrics.wordsFor(L, idx, dur);
      cur.innerHTML = curWords.map(w => `<span class="w">${esc(w.w)}</span>`).join(' ');
      wordEls = $$('.w', cur);
    }
    next.textContent = n >= 0 ? L[n].text : '';
    cur.classList.remove('enter'); void cur.offsetWidth; cur.classList.add('enter');
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!song) return;
    const t = Engine.heardTime(), dur = Engine.duration(), L = song.lines;
    $('#sg-time').textContent = `${fmtTime(Engine.time())} / ${fmtTime(dur)}`;
    if (!seeking && dur) $('#sg-seek').value = Math.round(Engine.time() / dur * 1000);
    $('#sg-play').textContent = Engine.playing ? '❚❚' : '▶';

    const idx = lineAt(L, t);
    if (idx !== curIdx) renderLines(idx);
    if (curWords) curWords.forEach((w, k) => wordEls[k] && wordEls[k].style.setProperty('--p', clamp((t - w.t) / (w.e - w.t), 0, 1).toFixed(3)));

    // countdown before the first line and after long instrumental gaps
    const n = nextTimed(L, idx);
    let count = '';
    if (n >= 0 && Lyrics.status(L) !== 'unsynced') {
      const prevEnd = idx >= 0 ? Lyrics.lineEnd(L, idx, dur) : 0, gap = L[n].t - t;
      if (L[n].t - prevEnd >= 4 && gap > 0 && gap <= 3.2 && t > prevEnd) count = '●'.repeat(Math.ceil(gap));
    }
    const ce = $('#lx-count'); if (ce.textContent !== count) ce.textContent = count;
    const sec = (L[idx] || L[n] || {}).section || '';
    const se = $('#lx-section'); if (se.textContent !== sec) se.textContent = sec;

    drawBg();
    if (Engine.micAnalyser && performance.now() - score.lastTick > 50) tickScore(t);
  }

  // ═════════ BACKGROUND ═════════
  function drawBg() {
    const c = $('#stage-bg'), ctx = c.getContext('2d');
    const W = c.clientWidth * devicePixelRatio | 0, H = c.clientHeight * devicePixelRatio | 0;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const an = Engine.analyser;
    if (an) an.getByteFrequencyData(freq); else freq.fill(0);
    const bass = (freq[2] + freq[3] + freq[4] + freq[5]) / 4 / 255;
    const time = performance.now() / 1000;
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.max(W, H) * 0.8);
    g.addColorStop(0, `hsla(${320 + Math.sin(time / 7) * 30},80%,${14 + bass * 16}%,1)`);
    g.addColorStop(1, '#07030d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // bars mirrored from centre
    const bars = 64, bw = W / bars / 2;
    for (let i = 0; i < bars; i++) {
      const v = freq[Math.floor(Math.pow(i / bars, 1.6) * 400) + 2] / 255, bh = v * H * 0.28;
      ctx.fillStyle = `hsla(${300 + i * 1.5},90%,${55 + v * 20}%,${0.25 + v * 0.5})`;
      ctx.fillRect(W / 2 + i * bw, H - bh, bw * 0.7, bh);
      ctx.fillRect(W / 2 - (i + 1) * bw, H - bh, bw * 0.7, bh);
    }
    // sparks on bass hits
    if (bass > 0.72 && bass - lastBass > 0.04) for (let k = 0; k < 14; k++) sparks.push({ x: Math.random() * W, y: H * (0.6 + Math.random() * 0.4), vx: (Math.random() - 0.5) * 2, vy: -2 - Math.random() * 5, life: 1 });
    lastBass = bass;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.x += s.vx * devicePixelRatio; s.y += s.vy * devicePixelRatio; s.life -= 0.012;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(255,${180 + s.life * 60 | 0},120,${s.life})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.2 * devicePixelRatio * s.life + 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ═════════ SCORE + PITCH ═════════
  function activeWord(t) { return curWords && curWords.some(w => t >= w.t && t <= w.e); }

  function tickScore(t) {
    score.lastTick = performance.now();
    const mp = Engine.pitchOf(Engine.micAnalyser);
    const vp = Engine.vocalAnalyser ? Engine.pitchOf(Engine.vocalAnalyser) : { f: -1 };
    const mm = mp.f > 0 ? freqToMidi(mp.f) : null, vm = vp.f > 0 ? freqToMidi(vp.f) : null;
    $('#pitch-note').textContent = mm ? midiName(mm) : '–';
    score.trail.push({ mm, vm }); if (score.trail.length > 120) score.trail.shift();
    drawTrail();
    if (!Engine.playing || !activeWord(t)) return;
    score.possible += 10;
    if (mm != null) {
      if (vm != null) {
        const d = Math.abs((((mm - vm) % 12) + 18) % 12 - 6); // octave-agnostic semitone distance
        score.pts += d <= 0.8 ? 10 : d <= 1.8 ? 5 : 1;
      } else if (Engine.vocalAnalyser == null) score.pts += mp.rms > 0.02 ? 7 : 3; // no stem: reward singing on time
    }
    const el = $('#stage-score'); el.hidden = false;
    $('b', el).textContent = Math.round(score.pts);
  }

  function drawTrail() {
    const c = $('#pitch-trail'), ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const tr = score.trail, step = W / 120;
    const y = (m) => H - ((m - 40) / 45) * H;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.beginPath();
    let pen = false;
    tr.forEach((p, i) => { if (p.vm == null) { pen = false; return; } pen ? ctx.lineTo(i * step, y(p.vm)) : ctx.moveTo(i * step, y(p.vm)); pen = true; });
    ctx.stroke();
    ctx.fillStyle = '#ffb547';
    tr.forEach((p, i) => { if (p.mm != null) { ctx.beginPath(); ctx.arc(i * step, y(p.mm), 2.5, 0, Math.PI * 2); ctx.fill(); } });
  }

  function resetScore() { score.pts = 0; score.possible = 0; score.trail = []; $('#stage-score').hidden = true; }
  function rating() {
    if (!score.possible) return null;
    const acc = score.pts / score.possible;
    return { acc, label: acc > 0.8 ? 'Superstar ✦✦✦' : acc > 0.55 ? 'Rising star ✦✦' : acc > 0.3 ? 'Spark lit ✦' : 'Keep sparking' };
  }

  // ═════════ TAKES ═════════
  async function renderTakes() {
    const ul = $('#takes'); ul.innerHTML = '';
    if (!song) return;
    const takes = await DB.takesFor(song.id);
    if (!takes.length) { ul.innerHTML = '<li class="muted small">No takes yet. Turn on the mic and press ● Record take.</li>'; return; }
    for (const t of takes) {
      const li = h('li', 'take');
      const url = URL.createObjectURL(t.blob);
      li.innerHTML = `<div><b>${new Date(t.created).toLocaleString()}</b>${t.score != null ? ` · <span class="tag">${t.score}%</span>` : ''}</div><audio controls src="${url}"></audio>`;
      const dl = h('button', 'btn ghost small', '⬇'); dl.onclick = () => download(t.blob, `${safeName(song.title)}-take.${t.blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
      const del = h('button', 'btn ghost small danger', '✕'); del.onclick = async () => { await DB.deleteTake(t.id); renderTakes(); };
      li.append(dl, del); ul.appendChild(li);
    }
  }

  async function toggleRecord() {
    if (recording) return stopRecord();
    if (!song || !song.audio) return;
    if (!$('#sg-mic').checked) { $('#sg-mic').checked = true; await setMic(true); if (!Engine.micAnalyser) return; }
    resetScore();
    const { rec, done } = Engine.recorderFor(Engine.takeStream, 'audio');
    recording = { rec, done };
    rec.start(1000);
    $('#sg-rec').classList.add('rec'); $('#sg-rec').textContent = '■ Stop take';
    if (!Engine.playing) Engine.play();
  }

  async function stopRecord() {
    if (!recording) return;
    const { rec, done } = recording; recording = null;
    rec.stop();
    $('#sg-rec').classList.remove('rec'); $('#sg-rec').textContent = '● Record take';
    const blob = await done;
    const r = rating();
    await DB.saveTake({ id: uid(), songId: song.id, blob, score: r ? Math.round(r.acc * 100) : null, created: Date.now() });
    if (r) toast(`${r.label}: ${Math.round(r.acc * 100)}% Spark Score`);
    renderTakes();
  }

  async function setMic(on) {
    if (on) {
      try { await Engine.startMic(); Engine.setMicGain(+$('#sg-micvol').value / 100); $('#stage-pitch').hidden = false; resetScore(); }
      catch (e) { $('#sg-mic').checked = false; toast('Microphone unavailable: ' + e.message, 'err'); }
    } else { if (recording) await stopRecord(); Engine.stopMic(); $('#stage-pitch').hidden = true; }
  }

  function hint() {
    const parts = [];
    if (Engine.hasInstrumental) parts.push('Karaoke uses the instrumental stem.');
    else if (Engine.canReduce) parts.push('No instrumental stem, so vocals are reduced by filtering the full mix. Add a Suno instrumental stem for clean karaoke.');
    else parts.push('This mix is mono, so the vocals can’t be filtered out. Add a Suno instrumental stem for karaoke.');
    parts.push(Engine.hasVocals ? 'Pitch scoring compares you to the vocal stem.' : 'Scoring rewards singing on time. Add a vocal stem for pitch scoring.');
    parts.push('Headphones stop the speakers bleeding into your mic.');
    $('#sg-hint').textContent = parts.join(' ');
  }

  function init() {
    $('#sg-key').innerHTML = Array.from({ length: 13 }, (_, i) => i - 6).map(n => `<option value="${n}" ${n === 0 ? 'selected' : ''}>${n > 0 ? '+' + n : n}</option>`).join('');
    $('#sg-play').onclick = () => { if (song && song.audio) Engine.toggle(); };
    const seek = $('#sg-seek');
    seek.oninput = () => { seeking = true; };
    seek.onchange = () => { Engine.seek(seek.value / 1000 * Engine.duration()); seeking = false; curIdx = -2; };
    $('#sg-karaoke').onchange = (e) => Engine.setKaraoke(e.target.checked);
    $('#sg-guide').oninput = (e) => Engine.setGuide(e.target.value / 100);
    $('#sg-key').onchange = (e) => Engine.setKey(+e.target.value);
    $('#sg-mic').onchange = (e) => setMic(e.target.checked);
    $('#sg-micvol').oninput = (e) => Engine.setMicGain(e.target.value / 100);
    $('#sg-rec').onclick = toggleRecord;
    $('#sg-full').onclick = () => { const s = $('#stage'); document.fullscreenElement ? document.exitFullscreen() : s.requestFullscreen && s.requestFullscreen(); };
    Engine.on('end', () => {
      if (!active) return;
      if (recording) stopRecord();
      else { const r = rating(); if (r && Engine.micAnalyser) toast(`${r.label}: ${Math.round(r.acc * 100)}% Spark Score`); }
    });
    document.addEventListener('keydown', (e) => {
      if (!active || e.target.closest('input, select, textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); $('#sg-play').click(); }
    });
  }

  async function show(s) {
    active = true;
    song = s; curIdx = -2; resetScore();
    if (!s) { $('#lx-cur').innerHTML = '<span class="hint-line">Pick a song to sing.</span>'; $('#lx-prev').textContent = $('#lx-next').textContent = ''; renderTakes(); return; }
    if (!s.audio) { $('#lx-cur').innerHTML = `<span class="hint-line">“${esc(s.title)}” is a draft with no audio yet.<br>Add the Suno audio in the Library.</span>`; song = null; return; }
    $('#lx-cur').innerHTML = '<span class="hint-line">Loading…</span>';
    await Engine.load(s);
    Engine.setKaraoke($('#sg-karaoke').checked);
    Engine.setGuide($('#sg-guide').value / 100);
    Engine.setKey(+$('#sg-key').value);
    hint(); renderTakes();
    cancelAnimationFrame(raf); loop();
  }

  function hide() {
    active = false;
    if (recording) stopRecord();
    cancelAnimationFrame(raf);
  }

  return { init, show, hide };
})();
