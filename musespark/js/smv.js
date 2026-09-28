// MuseSpark: SMV (song music video) maker. Draws lyric videos on a canvas in four themes and exports
// them in real time with MediaRecorder (canvas video + the engine's music bus).

const SMV = (() => {
  const THEMES = {
    neon: { name: 'Neon Pulse', font: '800 {s}px "Bricolage Grotesque", sans-serif', ink: '#fff', dim: 'rgba(255,255,255,.28)' },
    aurora: { name: 'Aurora', font: '600 {s}px "Bricolage Grotesque", sans-serif', ink: '#fff', dim: 'rgba(255,255,255,.3)' },
    paper: { name: 'Paper Moon', font: 'italic 500 {s}px "Fraunces", serif', ink: '#2a1a14', dim: 'rgba(42,26,20,.3)' },
    glitch: { name: 'Glitch Tape', font: '600 {s}px "JetBrains Mono", monospace', ink: '#e8fffb', dim: 'rgba(232,255,251,.25)' },
  };
  const o = { theme: 'neon', aspect: '16:9', accent: '#ff4fa3', lyricMode: 'wipe', viz: true, karaoke: false, titlecard: true, introVoice: false, res: 1 };
  let song = null, img = null, customBg = null, raf = 0, active = false, seeking = false;
  let phase = 'song', introStart = 0, introDur = 0, exporting = null;
  let cache = { idx: -2, words: null };
  const freq = new Uint8Array(1024), wave = new Uint8Array(2048);
  let grain = null, stars = null;

  const canvas = () => $('#smv-canvas');

  function size() {
    const base = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] }[o.aspect];
    return base.map(v => Math.round(v * o.res / 2) * 2);
  }
  function resize() {
    const [W, H] = size(), c = canvas();
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    $('#smv-frame').style.aspectRatio = o.aspect.replace(':', ' / ');
    $('#smv-frame').dataset.aspect = o.aspect;
  }

  // ═════════ DRAW ═════════
  function draw(t) {
    const c = canvas(), ctx = c.getContext('2d'), W = c.width, H = c.height, th = THEMES[o.theme];
    const an = Engine.analyser;
    if (an) { an.getByteFrequencyData(freq); an.getByteTimeDomainData(wave); } else { freq.fill(0); wave.fill(128); }
    const bass = (freq[2] + freq[3] + freq[4] + freq[5]) / 1020, mid = (freq[20] + freq[40] + freq[60]) / 765;
    const clock = t;
    const portrait = H > W, U = Math.min(W, H);
    ctx.save();
    ctx.textBaseline = 'middle';

    let lyricY = H * 0.5;
    if (o.theme === 'neon') lyricY = drawNeon(ctx, W, H, U, bass, clock, portrait);
    else if (o.theme === 'aurora') lyricY = drawAurora(ctx, W, H, U, bass, mid, clock);
    else if (o.theme === 'paper') lyricY = drawPaper(ctx, W, H, U, clock, portrait);
    else lyricY = drawGlitch(ctx, W, H, U, bass, clock);

    const from = +$('#sm-from').value || 0;
    const card = phase === 'intro' ? 1 : (o.titlecard ? clamp(1 - (t - from - 3.2) / 0.8, 0, 1) : 0);
    if (card < 1) { ctx.globalAlpha = 1 - card; drawLyrics(ctx, W, H, U, t, lyricY, th, bass); ctx.globalAlpha = 1; }
    if (card > 0) drawTitle(ctx, W, H, U, th, card);

    // brand + progress
    const dur = Engine.duration() || 1;
    ctx.globalAlpha = 0.7; ctx.fillStyle = o.theme === 'paper' ? th.ink : '#fff';
    ctx.font = `600 ${U * 0.022}px "Bricolage Grotesque", sans-serif`; ctx.textAlign = 'right';
    ctx.fillText('✦ MuseSpark', W - U * 0.04, H - U * 0.045);
    ctx.globalAlpha = 1;
    ctx.fillStyle = o.accent; ctx.fillRect(0, H - U * 0.006, W * clamp(t / dur, 0, 1), U * 0.006);
    ctx.restore();
  }

  function drawImage(ctx, image, W, H, alpha, blur = 0) {
    if (!image) return;
    const s = Math.max(W / image.width, H / image.height), w = image.width * s, h2 = image.height * s;
    ctx.save(); ctx.globalAlpha = alpha; if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(image, (W - w) / 2, (H - h2) / 2, w, h2); ctx.restore();
  }

  function drawNeon(ctx, W, H, U, bass, t, portrait) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#12051f'); g.addColorStop(1, '#030108');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    drawImage(ctx, customBg || img, W, H, 0.28, U * 0.02);
    const cx = W / 2, cy = portrait ? H * 0.34 : H * 0.36, r = U * (portrait ? 0.2 : 0.17) * (1 + bass * 0.08);
    if (o.viz) {
      const n = 96;
      ctx.save(); ctx.translate(cx, cy); ctx.shadowColor = o.accent; ctx.shadowBlur = U * 0.02;
      for (let i = 0; i < n; i++) {
        const v = freq[Math.floor(Math.pow(i / n, 1.5) * 300) + 3] / 255, a = i / n * Math.PI * 2 + t * 0.15;
        ctx.strokeStyle = i % 2 ? o.accent : '#ffffff'; ctx.globalAlpha = 0.35 + v * 0.65; ctx.lineWidth = U * 0.006;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08); ctx.lineTo(Math.cos(a) * (r * 1.08 + v * U * 0.12), Math.sin(a) * (r * 1.08 + v * U * 0.12)); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (img) { const s = r * 2 / Math.min(img.width, img.height); ctx.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s); }
    ctx.restore();
    ctx.strokeStyle = o.accent; ctx.lineWidth = U * 0.004; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    return portrait ? H * 0.66 : H * 0.76;
  }

  function drawAurora(ctx, W, H, U, bass, mid, t) {
    ctx.fillStyle = '#040816'; ctx.fillRect(0, 0, W, H);
    drawImage(ctx, customBg, W, H, 0.35, U * 0.01);
    if (!stars) { const r = rng(7); stars = Array.from({ length: 160 }, () => [r(), r(), r()]); }
    ctx.fillStyle = '#fff';
    stars.forEach(([x, y, z]) => { ctx.globalAlpha = 0.2 + 0.6 * Math.abs(Math.sin(t * (0.5 + z) + x * 9)); ctx.fillRect(x * W, y * H, 1.5 + z * 2, 1.5 + z * 2); });
    ctx.globalAlpha = 1;
    const hue = hexHue(o.accent);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) {
      const amp = H * (0.06 + (o.viz ? (k % 2 ? bass : mid) * 0.12 : 0.04)), base = H * (0.3 + k * 0.07);
      const grad = ctx.createLinearGradient(0, base - amp * 2, 0, base + H * 0.3);
      grad.addColorStop(0, `hsla(${hue + k * 35},90%,60%,0)`); grad.addColorStop(0.3, `hsla(${hue + k * 35},90%,60%,.35)`); grad.addColorStop(1, `hsla(${hue + k * 35 + 40},90%,50%,0)`);
      ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += W / 60) ctx.lineTo(x, base + Math.sin(x / W * 6 + t * (0.4 + k * 0.13) + k) * amp + Math.sin(x / W * 13 - t * 0.7) * amp * 0.3);
      ctx.lineTo(W, H); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    return H * 0.62;
  }

  function drawPaper(ctx, W, H, U, t, portrait) {
    ctx.fillStyle = '#f3e9dc'; ctx.fillRect(0, 0, W, H);
    drawImage(ctx, customBg, W, H, 0.18);
    if (!grain) {
      const gc = document.createElement('canvas'); gc.width = gc.height = 200;
      const gx = gc.getContext('2d'), id = gx.createImageData(200, 200);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 22; }
      gx.putImageData(id, 0, 0); grain = ctx.createPattern(gc, 'repeat');
    }
    ctx.fillStyle = grain; ctx.fillRect(0, 0, W, H);
    // vinyl
    const r = U * (portrait ? 0.26 : 0.24), cx = portrait ? W / 2 : W * 0.24, cy = portrait ? H * 0.28 : H / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.9);
    ctx.fillStyle = '#141010'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1.5;
    for (let k = 0.45; k < 0.98; k += 0.035) { ctx.beginPath(); ctx.arc(0, 0, r * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2); ctx.clip();
    if (img) { const s = r * 0.76 / Math.min(img.width, img.height); ctx.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s); }
    else { ctx.fillStyle = o.accent; ctx.fillRect(-r, -r, r * 2, r * 2); }
    ctx.restore();
    ctx.fillStyle = '#f3e9dc'; ctx.beginPath(); ctx.arc(cx, cy, U * 0.008, 0, Math.PI * 2); ctx.fill();
    if (o.viz) {
      ctx.strokeStyle = o.accent; ctx.lineWidth = U * 0.004; ctx.beginPath();
      const x0 = portrait ? W * 0.1 : W * 0.48, x1 = W * 0.9, y0 = portrait ? H * 0.9 : H * 0.84;
      for (let i = 0; i < 256; i++) { const v = (wave[i * 8] - 128) / 128, x = x0 + (x1 - x0) * i / 255; i ? ctx.lineTo(x, y0 + v * U * 0.05) : ctx.moveTo(x, y0 + v * U * 0.05); }
      ctx.stroke();
    }
    return portrait ? H * 0.64 : H * 0.5;
  }

  function drawGlitch(ctx, W, H, U, bass, t) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const bg = customBg || img;
    if (bg) {
      const sh = bass * U * 0.02;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'grayscale(1) brightness(.5)';
      drawImage(ctx, bg, W, H, 0.9);
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.35;
      ctx.fillStyle = o.accent; ctx.translate(sh, 0); ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    if (o.viz) {
      const n = 48, bh = H / n;
      for (let i = 0; i < n; i++) {
        const v = freq[Math.floor(i / n * 200) + 2] / 255;
        ctx.fillStyle = i % 3 ? `rgba(0,255,220,${v * 0.25})` : hexA(o.accent, v * 0.35);
        ctx.fillRect(0, i * bh, W * v * 0.5, bh * 0.6);
        ctx.fillRect(W - W * v * 0.5, H - (i + 1) * bh, W * v * 0.5, bh * 0.6);
      }
    }
    if (bass > 0.75) { const y = Math.random() * H, hh = U * 0.05; ctx.drawImage(canvas(), 0, y, W, hh, U * 0.03 * (Math.random() - 0.5), y, W, hh); }
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.5);
    return H * 0.5;
  }

  function wordsAt(t) {
    const L = song.lines, idx = Lyrics.lineAt(L, t);
    if (idx !== cache.idx) cache = { idx, words: idx >= 0 ? Lyrics.wordsFor(L, idx, Engine.duration()) : null, next: Lyrics.nextTimed(L, idx) };
    return cache;
  }

  function layout(ctx, words, maxW) {
    const space = ctx.measureText(' ').width, rows = [];
    let row = { items: [], width: 0 };
    for (const wd of words) {
      const ww = ctx.measureText(wd.w).width;
      if (row.items.length && row.width + space + ww > maxW) { rows.push(row); row = { items: [], width: 0 }; }
      const x = row.items.length ? row.width + space : 0;
      row.items.push({ ...wd, x, ww }); row.width = x + ww;
    }
    rows.push(row);
    return rows;
  }

  function drawLyrics(ctx, W, H, U, t, cy, th, bass) {
    if (!song || !song.lines.length) return;
    const { idx, words, next } = wordsAt(t);
    const dur = Engine.duration();
    const maxW = W * (o.theme === 'paper' && W > H ? 0.42 : 0.84);
    const cx = o.theme === 'paper' && W > H ? W * 0.7 : W / 2;
    let fs = U * (H > W ? 0.07 : 0.068);
    ctx.textAlign = 'left';
    let nextY = cy;
    if (words) {
      const end = Lyrics.lineEnd(song.lines, idx, dur);
      const fade = o.lyricMode === 'line' ? clamp((t - song.lines[idx].t) / 0.3, 0, 1) * clamp((end + 0.8 - t) / 0.4, 0, 1) : clamp((end + 1.2 - t) / 0.5, 0, 1);
      ctx.font = th.font.replace('{s}', fs);
      let rows = layout(ctx, words, maxW);
      if (rows.length > 3) { fs *= 0.78; ctx.font = th.font.replace('{s}', fs); rows = layout(ctx, words, maxW); }
      const lh = fs * 1.25, y0 = cy - (rows.length - 1) * lh / 2;
      nextY = y0 + (rows.length - 1) * lh + fs * 1.3;
      ctx.save(); ctx.globalAlpha *= fade;
      rows.forEach((row, ri) => {
        const x0 = cx - row.width / 2, y = y0 + ri * lh;
        for (const it of row.items) {
          const p = clamp((t - it.t) / Math.max(0.05, it.e - it.t), 0, 1);
          if (o.lyricMode === 'pop') {
            if (t < it.t) continue;
            const k = clamp((t - it.t) / 0.15, 0, 1), s = 1 + (1 - k) * 0.35;
            ctx.save(); ctx.translate(x0 + it.x + it.ww / 2, y); ctx.scale(s, s); ctx.globalAlpha *= k;
            glowText(ctx, it.w, -it.ww / 2, 0, th, fs, bass); ctx.restore();
          } else if (o.lyricMode === 'line') {
            glowText(ctx, it.w, x0 + it.x, y, th, fs, bass);
          } else {
            ctx.fillStyle = th.dim; ctx.fillText(it.w, x0 + it.x, y);
            if (p > 0) {
              ctx.save(); ctx.beginPath(); ctx.rect(x0 + it.x - fs * 0.1, y - lh / 2, (it.ww + fs * 0.2) * p, lh); ctx.clip();
              glowText(ctx, it.w, x0 + it.x, y, th, fs, bass); ctx.restore();
            }
          }
        }
      });
      ctx.restore();
    }
    // upcoming line: below the current one, or fading in at centre before the first line
    if (next >= 0 && o.lyricMode !== 'pop') {
      const a = words ? 0.9 : clamp(1 - (song.lines[next].t - t - 2) / 2, 0, 1);
      ctx.save(); ctx.globalAlpha *= a;
      ctx.font = th.font.replace('{s}', fs * 0.55); ctx.textAlign = 'center'; ctx.fillStyle = th.dim;
      ctx.fillText(song.lines[next].text, cx, nextY, maxW);
      ctx.restore();
    }
  }

  function glowText(ctx, s, x, y, th, fs, bass) {
    if (o.theme === 'glitch') {
      const off = fs * (0.03 + bass * 0.05);
      ctx.fillStyle = 'rgba(255,0,90,.8)'; ctx.fillText(s, x - off, y);
      ctx.fillStyle = 'rgba(0,255,220,.8)'; ctx.fillText(s, x + off, y);
      ctx.fillStyle = th.ink; ctx.fillText(s, x, y); return;
    }
    ctx.save();
    ctx.fillStyle = o.theme === 'paper' ? o.accent : th.ink;
    if (o.theme !== 'paper') { ctx.shadowColor = o.accent; ctx.shadowBlur = fs * 0.35; }
    ctx.fillText(s, x, y); ctx.restore();
  }

  function drawTitle(ctx, W, H, U, th, a) {
    ctx.save(); ctx.globalAlpha = a;
    const dark = o.theme !== 'paper';
    ctx.fillStyle = dark ? 'rgba(0,0,0,.45)' : 'rgba(243,233,220,.75)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    let fs = U * 0.11; ctx.font = th.font.replace('{s}', fs);
    while (ctx.measureText(song.title).width > W * 0.86 && fs > 20) { fs *= 0.9; ctx.font = th.font.replace('{s}', fs); }
    ctx.fillStyle = dark ? '#fff' : th.ink; ctx.shadowColor = o.accent; ctx.shadowBlur = dark ? fs * 0.3 : 0;
    ctx.fillText(song.title, W / 2, H / 2 - U * 0.02);
    ctx.shadowBlur = 0;
    ctx.font = `600 ${U * 0.035}px "Bricolage Grotesque", sans-serif`; ctx.fillStyle = o.accent;
    ctx.fillText((song.artist || '').toUpperCase(), W / 2, H / 2 + fs * 0.75);
    if (song.style) { ctx.font = `400 ${U * 0.022}px "JetBrains Mono", monospace`; ctx.fillStyle = dark ? 'rgba(255,255,255,.6)' : 'rgba(42,26,20,.6)'; ctx.fillText(song.style.slice(0, 90), W / 2, H / 2 + fs * 0.75 + U * 0.06, W * 0.86); }
    ctx.restore();
  }

  const hexHue = (hex) => {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (hh * 60 + 360) % 360;
  };
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  // ═════════ LOOP / EXPORT ═════════
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!song) return;
    const dur = Engine.duration();
    let t;
    if (exporting) {
      t = phase === 'intro' ? +$('#sm-from').value || 0 : Engine.time() - (Settings.get('offsetMs') || 0) / 1000;
      const el = phase === 'intro' ? (performance.now() - introStart) / 1000 : introDur + Engine.time() - exporting.from;
      $('#sm-progress i').style.width = clamp(el / exporting.total * 100, 0, 100) + '%';
      if (phase === 'song' && exporting.started && (Engine.time() >= exporting.to || !Engine.playing)) finish();
    } else t = Engine.heardTime();
    draw(t);
    $('#sm-time').textContent = `${fmtTime(Engine.time())} / ${fmtTime(dur)}`;
    if (!seeking && dur) $('#sm-seek').value = Math.round(Engine.time() / dur * 1000);
    $('#sm-play').textContent = Engine.playing ? '❚❚' : '▶';
  }

  async function startExport() {
    if (exporting) return cancel();
    if (!song || !song.audio) return;
    const dur = Engine.duration();
    const from = clamp(+$('#sm-from').value || 0, 0, dur), to = clamp(+$('#sm-to').value || dur, from + 1, dur);
    await document.fonts.ready;
    let intro = null;
    if (o.introVoice && song.intro) { try { intro = await Engine.decode(song.intro); } catch (e) { toast('Could not decode the voice intro', 'err'); } }
    Engine.pause(); Engine.seek(from);
    const vstream = canvas().captureStream(30);
    const stream = new MediaStream([...vstream.getVideoTracks(), ...Engine.musicStream.getAudioTracks()]);
    const { rec, done } = Engine.recorderFor(stream, 'video');
    introDur = intro ? intro.duration + 0.6 : 0;
    exporting = { rec, done, from, to, total: introDur + (to - from), vstream, started: false, cancelled: false };
    $('#sm-export').textContent = '■ Cancel render'; $('#sm-progress').hidden = false; $('#sm-download').hidden = true; $('#sm-result').hidden = true;
    $('#sm-status').textContent = 'Rendering in real time. Keep this tab visible.';
    setControls(false);
    rec.start(1000);
    if (intro) {
      phase = 'intro'; introStart = performance.now();
      await Engine.playBuffer(intro);
      await new Promise(r => setTimeout(r, 600));
      if (!exporting) return;
    }
    phase = 'song';
    Engine.play(from);
    exporting.started = true;
  }

  async function finish() {
    const ex = exporting; if (!ex) return;
    exporting = null; phase = 'song';
    Engine.pause();
    ex.rec.stop();
    ex.vstream.getVideoTracks().forEach(tr => tr.stop());
    const blob = await ex.done;
    $('#sm-export').textContent = '⏺ Render video'; $('#sm-progress').hidden = true; setControls(true);
    if (ex.cancelled) { $('#sm-status').textContent = 'Render cancelled.'; return; }
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const a = $('#sm-download');
    if (a.href) URL.revokeObjectURL(a.href);
    a.href = URL.createObjectURL(blob);
    const v = $('#sm-result'); v.src = a.href; v.hidden = false;
    a.download = `${safeName(song.title)}-${o.theme}-${o.aspect.replace(':', 'x')}.${ext}`; a.hidden = false;
    $('#sm-status').textContent = `Done: ${(blob.size / 1048576).toFixed(1)} MB ${ext.toUpperCase()}. ${ext === 'webm' ? 'Most social apps accept WebM. Convert it with ffmpeg if yours doesn’t.' : ''}`;
  }
  function cancel() { if (exporting) { exporting.cancelled = true; finish(); } }
  function setControls(on) { $$('.smv-side select, .smv-side input, .song-pick[data-route=smv], #sm-play, #sm-seek').forEach(e => e.disabled = !on); }

  async function loadImages() {
    img = null;
    if (!song) return;
    try { img = await loadImage(song.cover ? URL.createObjectURL(song.cover) : coverURL(song.id, 1024)); } catch (e) { img = null; }
  }

  function init() {
    const tp = $('#sm-themes');
    for (const [k, th] of Object.entries(THEMES)) {
      const b = h('button', 'theme-btn t-' + k, th.name); b.dataset.theme = k;
      b.onclick = () => { o.theme = k; $$('.theme-btn').forEach(x => x.classList.toggle('on', x === b)); };
      tp.appendChild(b);
    }
    tp.firstChild.classList.add('on');
    $('#sm-aspect').onchange = (e) => { o.aspect = e.target.value; resize(); };
    $('#sm-res').onchange = (e) => { o.res = +e.target.value; resize(); };
    $('#sm-accent').oninput = (e) => { o.accent = e.target.value; };
    $('#sm-lyric-mode').onchange = (e) => { o.lyricMode = e.target.value; };
    $('#sm-viz').onchange = (e) => { o.viz = e.target.checked; };
    $('#sm-karaoke').onchange = (e) => { o.karaoke = e.target.checked; Engine.setKaraoke(o.karaoke); };
    $('#sm-titlecard').onchange = (e) => { o.titlecard = e.target.checked; };
    $('#sm-intro-voice').onchange = (e) => {
      o.introVoice = e.target.checked;
      if (o.introVoice && song && !song.intro) toast('This song has no voice intro yet. Make one in Imagine › Voice spark.');
    };
    $('#sm-bg').onchange = async (e) => { const f = e.target.files[0]; if (f) customBg = await loadImage(URL.createObjectURL(f)); };
    $('#sm-play').onclick = () => { if (song && song.audio) Engine.toggle(); };
    const seek = $('#sm-seek');
    seek.oninput = () => { seeking = true; };
    seek.onchange = () => { Engine.seek(seek.value / 1000 * Engine.duration()); seeking = false; };
    $('#sm-export').onclick = startExport;
    document.addEventListener('keydown', (e) => {
      if (!active || exporting || e.target.closest('input, select, textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); $('#sm-play').click(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && exporting) toast('The render is paused while this tab is hidden, so the video may stutter.', 'err'); });
    resize();
  }

  async function show(s) {
    active = true;
    song = s && s.audio ? s : null; cache = { idx: -2 };
    const c = canvas(), ctx = c.getContext('2d');
    if (!song) {
      ctx.fillStyle = '#0a0612'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#fff'; ctx.font = '600 40px "Bricolage Grotesque"'; ctx.textAlign = 'center';
      ctx.fillText(s ? 'This draft has no audio yet.' : 'Pick a song to make an SMV.', c.width / 2, c.height / 2);
      return;
    }
    $('#sm-to').placeholder = (song.duration || 0).toFixed(1);
    $('#sm-intro-voice').parentElement.title = song.intro ? 'Voice intro attached' : 'No voice intro attached';
    await Promise.all([Engine.load(song), loadImages()]);
    Engine.setKaraoke(o.karaoke); Engine.setGuide(0); Engine.setKey(0);
    await document.fonts.ready;
    cancelAnimationFrame(raf); loop();
  }

  function hide() { active = false; if (exporting) cancel(); cancelAnimationFrame(raf); }

  return { init, show, hide, get busy() { return !!exporting; } };
})();
