// MuseSpark: app shell. Routing, library + import dialog, the lyric sync studio, settings and the home screen.

// ═════════ ROUTER ═════════
const Router = (() => {
  let current = null;
  const modules = { stage: Stage, smv: SMV, studio: null };

  async function go() {
    const [, route = 'home', id] = (location.hash || '#/home').split('/');
    const name = $('#scr-' + route) ? route : 'home';
    if (current && current !== name) {
      if (modules[current] && modules[current].hide) modules[current].hide();
      if (current === 'studio') Studio.hide();
      if (current === 'home') Home.stop();
      Engine.pause();
    }
    current = name;
    $$('.screen').forEach(s => s.classList.toggle('on', s.id === 'scr-' + name));
    $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name));
    window.scrollTo(0, 0);

    if (['stage', 'smv', 'studio'].includes(name)) {
      const songs = (await DB.songs()).filter(s => s.audio);
      const song = id ? await DB.song(id) : songs.find(s => s.id === Settings.get('lastSong')) || songs[0] || null;
      if (song) Settings.set('lastSong', song.id);
      fillPickers(songs, song, name);
      $$(`[data-empty=${name}]`).forEach(e => { e.hidden = songs.length > 0; });
      $('#scr-' + name).classList.toggle('is-empty', !songs.length);
      if (name === 'stage') Stage.show(song);
      if (name === 'smv') SMV.show(song);
      if (name === 'studio') Studio.show(song);
    }
    if (name === 'library') Library.render();
    if (name === 'inspire') Inspire.show();
    if (name === 'settings') SettingsPage.show();
    if (name === 'home') Home.start();
  }

  function fillPickers(songs, song, route) {
    $$(`.song-pick[data-route=${route}]`).forEach(sel => {
      sel.innerHTML = songs.length ? songs.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('') : '<option value="">No songs with audio yet</option>';
      if (song) sel.value = song.id;
      sel.onchange = () => { if (sel.value) location.hash = `#/${route}/${sel.value}`; };
    });
  }

  return { go, get current() { return current; } };
})();

// ═════════ LIBRARY ═════════
const Library = (() => {
  let editing = null, afterRoute = null;
  const urls = [];

  const STATUS = { none: ['No lyrics', 'grey'], unsynced: ['Not synced', 'grey'], partial: ['Partly synced', 'amber'], lines: ['Lines synced', 'teal'], words: ['Words synced', 'pink'] };

  async function render() {
    urls.splice(0).forEach(u => URL.revokeObjectURL(u));
    const grid = $('#song-grid'), songs = await DB.songs();
    grid.innerHTML = '';
    if (!songs.length) {
      grid.innerHTML = `<div class="empty"><h3>No songs yet</h3><p>Download a song from Suno (MP3 or WAV), then import it with its lyrics. Or start with the demo song.</p></div>`;
      return;
    }
    for (const s of songs) {
      const [label, tone] = STATUS[Lyrics.status(s.lines)];
      let cover;
      if (s.cover) { cover = URL.createObjectURL(s.cover); urls.push(cover); } else cover = coverURL(s.id);
      const card = h('article', 'song-card');
      card.innerHTML = `
        <div class="cover" style="background-image:url('${cover}')">${s.audio ? '' : '<span class="draft">DRAFT</span>'}</div>
        <div class="meta">
          <h3>${esc(s.title)}</h3>
          <div class="muted small">${esc(s.artist || '—')}${s.duration ? ' · ' + fmtTime(s.duration) : ''}</div>
          <div class="badges"><span class="badge ${tone}">${label}</span>${s.instrumental ? '<span class="badge">Inst stem</span>' : ''}${s.vocals ? '<span class="badge">Vocal stem</span>' : ''}${s.intro ? '<span class="badge">Voice intro</span>' : ''}</div>
          ${s.style ? `<div class="style-line" title="${esc(s.style)}">${esc(s.style)}</div>` : ''}
        </div>
        <div class="actions">
          ${s.audio ? `<a class="btn small" href="#/stage/${s.id}">Sing</a><a class="btn ghost small" href="#/studio/${s.id}">Sync</a><a class="btn ghost small" href="#/smv/${s.id}">SMV</a>` : ''}
          <button class="btn ghost small" data-act="edit">Edit</button>
          <button class="btn ghost small" data-act="lrc" ${Lyrics.status(s.lines) === 'unsynced' || !s.lines.length ? 'disabled' : ''}>LRC</button>
          <button class="btn ghost small danger" data-act="del" title="Delete">✕</button>
        </div>`;
      $('[data-act=edit]', card).onclick = () => open(s);
      $('[data-act=lrc]', card).onclick = () => download(new Blob([Lyrics.toLRC(s)], { type: 'text/plain' }), safeName(s.title) + '.lrc');
      $('[data-act=del]', card).onclick = async () => { if (await askConfirm(`Delete “${s.title}” and its takes?`, 'Delete')) { await DB.deleteSong(s.id); render(); } };
      grid.appendChild(card);
    }
  }

  // afterRoute: when importing from Sync/Sing/SMV, open that screen with the new song once it's saved.
  function open(song = null, route = null) {
    editing = song; afterRoute = song ? null : route;
    const form = $('#song-form'), f = form.elements;
    form.reset();
    $('#dlg-song-title').textContent = song ? `Edit “${song.title}”` : 'Import Suno song';
    f.title.value = song ? song.title : '';
    f.artist.value = song ? song.artist || '' : Settings.get('founder');
    f.style.value = song ? song.style || '' : '';
    f.lyrics.value = song ? song.lyricsRaw || Lyrics.toSheet(song.lines) : '';
    f.audio.required = !!afterRoute;
    for (const k of ['audio', 'cover', 'instrumental', 'vocals']) $(`[data-has=${k}]`, form).textContent = song && song[k] ? 'Current file kept unless you choose a new one' : '';
    $('#dlg-song').showModal();
  }

  const mediaDuration = (blob) => new Promise(res => {
    const a = new Audio(); const u = URL.createObjectURL(blob);
    a.preload = 'metadata';
    a.onloadedmetadata = () => { res(isFinite(a.duration) ? a.duration : 0); URL.revokeObjectURL(u); };
    a.onerror = () => { res(0); URL.revokeObjectURL(u); };
    a.src = u;
  });

  async function save() {
    const f = $('#song-form').elements;
    const s = editing ? { ...editing } : { id: uid(), created: Date.now(), lines: [], audio: null, instrumental: null, vocals: null, cover: null, intro: null, duration: 0 };
    s.title = f.title.value.trim() || 'Untitled';
    s.artist = f.artist.value.trim();
    s.style = f.style.value.trim();
    for (const k of ['audio', 'cover', 'instrumental', 'vocals']) if (f[k].files[0]) s[k] = f[k].files[0];
    if (f.audio.files[0]) s.duration = await mediaDuration(s.audio);
    else if (!s.duration && s.instrumental) s.duration = await mediaDuration(s.instrumental);
    const text = f.lyrics.value;
    if (!editing || text !== (editing.lyricsRaw || Lyrics.toSheet(editing.lines))) {
      const parsed = Lyrics.parse(text);
      s.lines = editing && !Lyrics.isLRC(text) ? Lyrics.mergeTimings(editing.lines, parsed) : parsed;
      s.lyricsRaw = Lyrics.isLRC(text) ? Lyrics.toSheet(parsed) : text;
    }
    await DB.saveSong(s);
    toast(editing ? 'Song updated' : `“${s.title}” imported`);
    const route = afterRoute;
    editing = null; afterRoute = null;
    if (route) location.hash = `#/${route}/${s.id}`;
    else if (Router.current === 'library') render(); else Router.go();
  }

  // Drop audio (optionally with same-named .lrc/.txt lyric files) straight onto the library.
  async function importFiles(files) {
    const audio = files.filter(f => /^(audio|video)\//.test(f.type) || /\.(mp3|wav|m4a|ogg|flac|aac|webm)$/i.test(f.name));
    const texts = files.filter(f => /\.(lrc|txt)$/i.test(f.name));
    const base = (n) => n.replace(/\.[^.]+$/, '').toLowerCase();
    for (const a of audio) {
      const lyr = texts.find(t => base(t.name) === base(a.name));
      const text = lyr ? await lyr.text() : '';
      const lines = Lyrics.parse(text);
      await DB.saveSong({
        id: uid(), title: a.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(), artist: Settings.get('founder'), style: '',
        lyricsRaw: Lyrics.isLRC(text) ? Lyrics.toSheet(lines) : text, lines, audio: a, instrumental: null, vocals: null, cover: null, intro: null,
        duration: await mediaDuration(a), created: Date.now(),
      });
    }
    if (audio.length) toast(`Imported ${audio.length} song${audio.length > 1 ? 's' : ''}. Use Edit to add lyrics and stems.`);
    else toast('No audio files found in the drop', 'err');
    render();
  }

  async function addDemo(route = 'stage') {
    toast('Composing “First Spark”…');
    try {
      const s = await Demo.create();
      await DB.saveSong(s);
      location.hash = `#/${route}/${s.id}`;
    } catch (e) { console.error(e); toast('Could not render the demo: ' + e.message, 'err'); }
  }

  function init() {
    $('#lib-add').onclick = () => open();
    $('#lib-demo').onclick = () => addDemo();
    $('#btn-demo').onclick = () => addDemo();
    $$('[data-import]').forEach(b => { b.onclick = () => open(null, b.dataset.import); });
    $$('[data-demo]').forEach(b => { b.onclick = () => addDemo(b.dataset.demo); });
    $('#song-form').addEventListener('submit', (e) => {
      if (e.submitter && e.submitter.value === 'save') { e.preventDefault(); save().then(() => $('#dlg-song').close()).catch(err => toast(err.message, 'err')); }
    });
    const scr = $('#scr-library'), dz = $('#dropzone');
    scr.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('hot'); });
    scr.addEventListener('dragleave', (e) => { if (!scr.contains(e.relatedTarget)) dz.classList.remove('hot'); });
    scr.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('hot'); importFiles([...e.dataTransfer.files]); });
  }

  return { init, render, open };
})();

// ═════════ SYNC STUDIO ═════════
const Studio = (() => {
  let song = null, sel = 0, raf = 0, active = false, nowIdx = -2, seeking = false, saveTimer = 0, busy = null;

  function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => DB.saveSong(song), 400); }

  function setLineTime(i, t) {
    const l = song.lines[i];
    if (t == null) { l.t = null; l.words = null; return; }
    t = Math.max(0, +t.toFixed(2));
    if (l.words && l.t != null) { const d = t - l.t; l.words.forEach(w => { w.t = +(w.t + d).toFixed(3); if (w.e != null) w.e = +(w.e + d).toFixed(3); }); }
    l.t = t;
  }

  function renderList() {
    const ol = $('#st-lines'); ol.innerHTML = '';
    let section = null;
    song.lines.forEach((l, i) => {
      if (l.section && l.section !== section) { ol.appendChild(h('li', 'sec', esc(l.section))); section = l.section; }
      const bad = l.t != null && song.lines.slice(0, i).some(p => p.t != null && p.t > l.t);
      const li = h('li', 'ln' + (i === sel ? ' sel' : '') + (bad ? ' bad' : ''));
      li.dataset.i = i;
      li.innerHTML = `<input class="ts mono" value="${l.t == null ? '' : fmtTime(l.t, true)}" placeholder="–:––.––"><span class="tx">${esc(l.text)}</span>${l.words && l.words.every(w => w.t != null) ? '<span class="wtag" title="Word timing">W</span>' : ''}`;
      li.onclick = (e) => { if (e.target.classList.contains('ts')) return; select(i); if (l.t != null) Engine.seek(Math.max(0, l.t - 0.5)); };
      const ts = $('.ts', li);
      ts.onchange = () => {
        const m = ts.value.trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
        if (!ts.value.trim()) setLineTime(i, null);
        else if (m) setLineTime(i, (+(m[1] || 0)) * 60 + +m[2]);
        persist(); renderList();
      };
      ol.appendChild(li);
    });
    if (!song.lines.length) ol.innerHTML = '<li class="muted">No lyrics yet. Use Edit lyrics to paste them, or Auto-sync to transcribe them with VoiceStudio.</li>';
    nowIdx = -2;
  }

  function select(i) {
    sel = clamp(i, 0, song.lines.length - 1);
    $$('#st-lines .ln').forEach(li => li.classList.toggle('sel', +li.dataset.i === sel));
    const el = $(`#st-lines .ln[data-i="${sel}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function tap() {
    if (!song || !song.lines.length) return;
    if (!Engine.playing) { Engine.play(); return; }
    setLineTime(sel, Engine.heardTime());
    persist();
    renderList();
    select(sel < song.lines.length - 1 ? sel + 1 : sel);
    const b = $('#st-tap'); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!song) return;
    const dur = Engine.duration();
    $('#st-time').textContent = fmtTime(Engine.time(), true);
    if (!seeking && dur) $('#st-seek').value = Math.round(Engine.time() / dur * 1000);
    $('#st-play').textContent = Engine.playing ? '❚❚' : '▶';
    const idx = Lyrics.lineAt(song.lines, Engine.heardTime());
    if (idx !== nowIdx) { nowIdx = idx; $$('#st-lines .ln').forEach(li => li.classList.toggle('now', +li.dataset.i === idx)); }
  }

  async function autoSync() {
    if (!song || busy) return;
    const src = song.vocals || song.audio;
    const status = $('#st-auto-status'), btn = $('#st-auto');
    btn.disabled = true;
    status.textContent = `Sending ${song.vocals ? 'vocal stem' : 'full mix'} to VoiceStudio… this can take a minute.`;
    busy = new AbortController();
    try {
      const res = await VoiceStudio.transcribe(src, { language: $('#st-lang').value.trim() || undefined, prompt: song.lines.map(l => l.text).join(' '), signal: busy.signal });
      let words = res.words || [];
      if (!words.length && res.segments) res.segments.forEach(s => (s.words || []).forEach(w => words.push(w)));
      if (!song.lines.length) {
        song.lines = Lyrics.fromSegments(res.segments || []);
        song.lyricsRaw = Lyrics.toSheet(song.lines);
        status.textContent = `No lyrics were written, so ${song.lines.length} lines were built from the transcript. Check them with Edit lyrics.`;
      } else if (!words.length) {
        throw new Error('VoiceStudio returned no word timestamps. Choose a Whisper-family ASR engine in VoiceStudio.');
      } else {
        const r = Lyrics.align(song.lines, words);
        song.lines = r.lines;
        const pct = Math.round(r.matched / r.total * 100);
        status.textContent = `Aligned: ${pct}% of words matched what VoiceStudio heard, and the rest were interpolated.${pct < 40 ? ' That’s low. A vocal stem or setting the language usually helps.' : ''}`;
      }
      await DB.saveSong(song);
      renderList();
    } catch (e) { if (e.name !== 'AbortError') { status.textContent = e.message; toast(e.message, 'err'); } }
    busy = null; btn.disabled = false;
  }

  function onKey(e) {
    if (!active || !song || e.target.closest('input, select, textarea') || $('#dlg-song').open) return;
    const k = e.code;
    if (k === 'Space') { e.preventDefault(); tap(); }
    else if (k === 'ArrowDown') { e.preventDefault(); select(sel + 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); select(sel - 1); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      const l = song.lines[sel]; if (!l || l.t == null) return;
      setLineTime(sel, l.t + (k === 'ArrowRight' ? 0.05 : -0.05)); persist();
      const ts = $(`#st-lines .ln[data-i="${sel}"] .ts`); if (ts) ts.value = fmtTime(l.t, true);
    } else if (k === 'Backspace') { e.preventDefault(); setLineTime(sel, null); persist(); renderList(); select(sel); }
    else if (k === 'Enter') { e.preventDefault(); const l = song.lines[sel]; if (l && l.t != null) Engine.play(Math.max(0, l.t - 1)); }
  }

  function init() {
    $('#st-play').onclick = () => { if (song) Engine.toggle(); };
    $('#st-tap').onclick = tap;
    const seek = $('#st-seek');
    seek.oninput = () => { seeking = true; };
    seek.onchange = () => { Engine.seek(seek.value / 1000 * Engine.duration()); seeking = false; };
    $('#st-rate').onchange = (e) => Engine.setKey(12 * Math.log2(+e.target.value));
    $('#st-auto').onclick = autoSync;
    $('#st-edit-lyrics').onclick = () => song && Library.open(song);
    $('#st-lrc-in').onchange = async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f || !song) return;
      if (song.lines.some(l => l.t != null) && !(await askConfirm('Replace the current lyrics and timings with this LRC?', 'Replace'))) return;
      song.lines = Lyrics.parse(await f.text()); song.lyricsRaw = Lyrics.toSheet(song.lines);
      await DB.saveSong(song); renderList(); toast(`Loaded ${song.lines.length} lines`);
    };
    $('#st-lrc-out').onclick = () => song && download(new Blob([Lyrics.toLRC(song)], { type: 'text/plain' }), safeName(song.title) + '.lrc');
    $('#st-clear').onclick = async () => {
      if (!song || !(await askConfirm('Clear all timings for this song?', 'Clear'))) return;
      song.lines.forEach(l => { l.t = null; l.words = null; });
      await DB.saveSong(song); renderList(); select(0);
    };
    document.addEventListener('keydown', onKey);
  }

  async function show(s) {
    active = true; clearTimeout(saveTimer);
    song = s && s.audio ? s : null; sel = 0;
    $('#studio-body').classList.toggle('disabled', !song);
    if (!song) { $('#studio-title').textContent = s ? 'This draft has no audio yet. Add it in the Library.' : 'Import a song first.'; $('#st-lines').innerHTML = ''; return; }
    $('#studio-title').textContent = `${song.title}: ${song.lines.filter(l => l.t != null).length}/${song.lines.length} lines timed`;
    $('#st-auto-status').textContent = VoiceStudio.state === 'offline' ? 'VoiceStudio is offline. Check Settings.' : '';
    renderList();
    const firstUntimed = song.lines.findIndex(l => l.t == null);
    select(firstUntimed >= 0 ? firstUntimed : 0);
    await Engine.load(song);
    Engine.setKaraoke(false); Engine.setKey(12 * Math.log2(+$('#st-rate').value));
    cancelAnimationFrame(raf); loop();
  }

  function hide() {
    active = false; cancelAnimationFrame(raf);
    if (busy) busy.abort();
    if (song) { clearTimeout(saveTimer); DB.saveSong(song); }
  }

  return { init, show, hide };
})();

// ═════════ SETTINGS ═════════
const SettingsPage = (() => {
  function corsHint() {
    const origin = location.origin;
    $('#set-cors').textContent = origin === 'null' || location.protocol === 'file:'
      ? '# Serve MuseSpark over http first, for example:\npython3 -m http.server 8000\n# then start VoiceStudio with:\nOMNIVOICE_ALLOWED_ORIGINS=http://localhost:8000 bun run dev'
      : `OMNIVOICE_ALLOWED_ORIGINS=${origin} bun run dev\n# This replaces VoiceStudio's default list. Add its own UI origin\n# (comma-separated) if you also use VoiceStudio in the browser.`;
  }
  async function show() {
    $('#set-vs-url').value = Settings.get('vsUrl');
    $('#set-vs-key').value = Settings.get('vsKey');
    $('#set-offset').value = Settings.get('offsetMs');
    $('#set-founder').value = Settings.get('founder');
    corsHint();
    const e = await DB.estimate(), n = (await DB.songs()).length;
    $('#set-storage').textContent = `${n} song${n === 1 ? '' : 's'} stored ${DB.persistent ? 'in this browser (IndexedDB)' : 'in memory only. IndexedDB is unavailable, so songs are lost on reload'}.` + (e ? ` Using ${(e.usage / 1048576).toFixed(1)} MB of ${(e.quota / 1073741824).toFixed(1)} GB available.` : '');
  }
  function init() {
    $('#set-vs-url').onchange = (e) => { Settings.set('vsUrl', e.target.value.trim() || 'http://127.0.0.1:3900'); VoiceStudio.ping().catch(() => {}); };
    $('#set-vs-key').onchange = (e) => Settings.set('vsKey', e.target.value.trim());
    $('#set-offset').onchange = (e) => Settings.set('offsetMs', +e.target.value || 0);
    $('#set-founder').onchange = (e) => { Settings.set('founder', e.target.value.trim() || 'The Founder'); showFounder(); };
    $('#set-vs-test').onclick = async () => {
      const st = $('#set-vs-status'); st.textContent = 'Testing…';
      try {
        const info = await VoiceStudio.ping();
        st.textContent = `Connected${info.protocol ? ` · ${info.protocol}` : ''}`;
      } catch (e) { st.textContent = e.message; }
    };
    $('#set-wipe').onclick = async () => { if (await askConfirm('Delete every song and take stored in this browser?', 'Delete all')) { await DB.wipe(); toast('All data deleted'); show(); } };
  }
  return { init, show };
})();

// ═════════ HOME ═════════
const Home = (() => {
  let raf = 0, parts = [];
  function frame() {
    raf = requestAnimationFrame(frame);
    const c = $('#home-bg'), ctx = c.getContext('2d');
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    ctx.fillStyle = 'rgba(8,4,16,.22)'; ctx.fillRect(0, 0, W, H);
    if (parts.length < 90) parts.push({ x: Math.random() * W, y: H + 10, v: 0.3 + Math.random() * 1.2, s: Math.random() * 2.2 + 0.4, hue: Math.random() < 0.5 ? 330 : 38, ph: Math.random() * 6 });
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      p.y -= p.v; p.x += Math.sin(p.y / 60 + p.ph) * 0.4;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      ctx.fillStyle = `hsla(${p.hue},95%,65%,.8)`; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { start() { cancelAnimationFrame(raf); if (!reduced()) frame(); }, stop() { cancelAnimationFrame(raf); } };
})();

function showFounder() {
  const n = Settings.get('founder');
  $('#founder-name').textContent = n && n !== 'The Founder' ? `— ${n}, Founder of MuseSpark` : '— The Founder of MuseSpark';
}

// ═════════ BOOT ═════════
(async function boot() {
  await DB.open();
  showFounder();
  Library.init(); Studio.init(); Stage.init(); SMV.init(); Inspire.init(); SettingsPage.init();

  const pill = $('#vs-pill');
  VoiceStudio.onState((s) => { pill.dataset.state = s; pill.title = s === 'online' ? `VoiceStudio connected (${VoiceStudio.base()})` : `VoiceStudio not reachable at ${VoiceStudio.base()}`; });
  pill.onclick = () => { location.hash = '#/settings'; };
  // Check the connection on load only once VoiceStudio has been reached before; otherwise wait for Settings › Test.
  if (Settings.get('vsSeen')) VoiceStudio.ping().catch(() => {});

  window.addEventListener('hashchange', Router.go);
  Router.go();
})();
