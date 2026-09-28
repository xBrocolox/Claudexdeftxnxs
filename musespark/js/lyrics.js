// MuseSpark: lyrics model. Parses Suno lyric sheets and LRC, exports LRC, estimates word timing,
// and aligns VoiceStudio word timestamps to the written lyrics.
//
// Line: { t: seconds|null, text, section, words: [{ w, t, e }] | null }

const Lyrics = (() => {
  const SECTION = /^\s*\[([^\]]+)\]\s*$/;
  const TS = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
  const WORD_TS = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>\s*([^<]*)/g;
  const toSec = (m, s) => parseInt(m, 10) * 60 + parseFloat(s.replace(':', '.'));

  const isLRC = (text) => /^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d+)?\]/m.test(text);

  function parse(text) { return isLRC(text) ? parseLRC(text) : parseSuno(text); }

  // Suno sheets: [Verse 1] / [Chorus] headers, one sung line per row.
  function parseSuno(text) {
    const lines = [];
    let section = '';
    for (const raw of String(text || '').split(/\r?\n/)) {
      const s = raw.trim();
      if (!s) continue;
      const m = s.match(SECTION);
      if (m) { section = m[1].trim(); continue; }
      lines.push({ t: null, text: s, section, words: null });
    }
    return lines;
  }

  function parseLRC(text) {
    const lines = [];
    for (const row of String(text || '').split(/\r?\n/)) {
      const raw = row.trim();
      const stamps = [];
      let m, last = 0;
      TS.lastIndex = 0;
      while ((m = TS.exec(raw)) && m.index === last) { stamps.push(toSec(m[1], m[2])); last = TS.lastIndex; }
      if (!stamps.length) {
        const sm = raw.match(SECTION);
        if (sm && !/^\w+:/.test(sm[1])) lines.push({ section: sm[1].trim(), marker: true });
        continue;
      }
      let body = raw.slice(last);
      let words = null;
      if (/<\d{1,3}:\d/.test(body)) {
        words = [];
        WORD_TS.lastIndex = 0;
        while ((m = WORD_TS.exec(body))) {
          const w = m[3].trim();
          if (w) words.push({ w, t: toSec(m[1], m[2]), e: null });
        }
        body = words.map(x => x.w).join(' ');
      }
      body = body.trim();
      if (!body) continue;
      for (const t of stamps) lines.push({ t, text: body, section: '', words: words && stamps.length === 1 ? words : null });
    }
    // apply "[Chorus]" style markers kept in exported LRCs
    const out = []; let section = '';
    const sorted = lines.filter(l => !l.marker).length === lines.length ? lines.sort((a, b) => a.t - b.t) : lines;
    for (const l of sorted) { if (l.marker) section = l.section; else out.push({ ...l, section: l.section || section }); }
    return out;
  }

  const stamp = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };

  function toLRC(song) {
    const out = [`[ti:${song.title || ''}]`, `[ar:${song.artist || ''}]`, '[re:MuseSpark]'];
    let section = null;
    for (const l of song.lines) {
      if (l.t == null) continue;
      if (l.section && l.section !== section) { out.push(`[${l.section}]`); section = l.section; }
      if (l.words && l.words.every(w => w.t != null)) out.push(`[${stamp(l.t)}]` + l.words.map(w => `<${stamp(w.t)}>${w.w}`).join(' '));
      else out.push(`[${stamp(l.t)}]${l.text}`);
    }
    return out.join('\n') + '\n';
  }

  function toSheet(lines) {
    const out = []; let section = null;
    for (const l of lines) {
      if (l.section && l.section !== section) { if (out.length) out.push(''); out.push(`[${l.section}]`); section = l.section; }
      out.push(l.text);
    }
    return out.join('\n');
  }

  // Carry timings over when the user edits the lyric text.
  function mergeTimings(oldLines, newLines) {
    let p = 0;
    for (const nl of newLines) {
      const key = norm(nl.text);
      for (let k = p; k < Math.min(oldLines.length, p + 4); k++) {
        if (norm(oldLines[k].text) === key) { nl.t = oldLines[k].t; nl.words = oldLines[k].words; p = k + 1; break; }
      }
    }
    return newLines;
  }

  const norm = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  const tokens = (text) => String(text).split(/\s+/).filter(Boolean);

  const status = (lines) => {
    if (!lines.length) return 'none';
    const timed = lines.filter(l => l.t != null).length;
    if (!timed) return 'unsynced';
    if (lines.every(l => l.t != null && l.words && l.words.every(w => w.t != null))) return 'words';
    return timed === lines.length ? 'lines' : 'partial';
  };

  function nextTime(lines, i, dur) {
    for (let k = i + 1; k < lines.length; k++) if (lines[k].t != null) return lines[k].t;
    return dur || (lines[i].t + 6);
  }

  // Word timings for line i: real ones when synced, otherwise spread over the line by syllable weight.
  function wordsFor(lines, i, dur) {
    const l = lines[i];
    if (!l || l.t == null) return null;
    const nt = nextTime(lines, i, dur);
    if (l.words && l.words.length && l.words.every(w => w.t != null)) {
      return l.words.map((w, k) => {
        const next = k + 1 < l.words.length ? l.words[k + 1].t : nt;
        const e = w.e != null ? w.e : Math.min(next, w.t + 1.2);
        return { w: w.w, t: w.t, e: Math.max(e, w.t + 0.05) };
      });
    }
    const toks = tokens(l.text);
    const weight = toks.map(w => 1 + Math.min(4, norm(w).length / 3));
    const total = weight.reduce((a, b) => a + b, 0);
    const span = Math.max(0.6, Math.min(nt - l.t - 0.15, total * 0.32 + 0.5));
    let t = l.t;
    return toks.map((w, k) => { const d = span * weight[k] / total; const o = { w, t, e: t + d }; t += d; return o; });
  }

  // Index of the line being sung at time t (last timed line that has started), or -1 before the first.
  function lineAt(lines, t) {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) { if (lines[i].t == null) continue; if (lines[i].t <= t) idx = i; else break; }
    return idx;
  }
  function nextTimed(lines, i) { for (let k = i + 1; k < lines.length; k++) if (lines[k].t != null) return k; return -1; }

  function lineEnd(lines, i, dur) {
    const ws = wordsFor(lines, i, dur);
    return ws && ws.length ? ws[ws.length - 1].e : nextTime(lines, i, dur);
  }

  // ═════════ ALIGNMENT ═════════
  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m || !n) return Math.max(m, n);
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  const sim = (a, b) => (!a || !b) ? 0 : 1 - lev(a, b) / Math.max(a.length, b.length);

  // Needleman–Wunsch over lyric words vs recognised words. Returns lines with words[].t/e filled.
  function align(lines, asrWords) {
    const L = []; // flattened lyric words
    lines.forEach((l, li) => tokens(l.text).forEach(w => L.push({ li, w, n: norm(w).replace(/\s/g, ''), t: null, e: null })));
    const A = asrWords.map(w => ({ n: norm(w.word).replace(/\s/g, ''), t: +w.start, e: +w.end })).filter(w => isFinite(w.t));
    const n = L.length, m = A.length;
    if (!n || !m) return { lines, matched: 0, total: n };

    const GAP = -0.4, W = m + 1;
    const S = new Float32Array((n + 1) * W), D = new Uint8Array((n + 1) * W); // 1 diag, 2 up (skip lyric), 3 left (skip asr)
    for (let i = 1; i <= n; i++) { S[i * W] = i * GAP; D[i * W] = 2; }
    for (let j = 1; j <= m; j++) { S[j] = j * GAP * 0.5; D[j] = 3; }
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const s = sim(L[i - 1].n, A[j - 1].n);
        const diag = S[(i - 1) * W + j - 1] + (s >= 0.5 ? s * 2 : -0.8);
        const up = S[(i - 1) * W + j] + GAP;
        const left = S[i * W + j - 1] + GAP * 0.5; // extra recognised words (ad-libs, noise) are cheap to skip
        let best = diag, dir = 1;
        if (up > best) { best = up; dir = 2; }
        if (left > best) { best = left; dir = 3; }
        S[i * W + j] = best; D[i * W + j] = dir;
      }
    }
    let i = n, j = m, matched = 0;
    while (i > 0 || j > 0) {
      const d = D[i * W + j];
      if (d === 1) {
        if (sim(L[i - 1].n, A[j - 1].n) >= 0.5) { L[i - 1].t = A[j - 1].t; L[i - 1].e = A[j - 1].e; matched++; }
        i--; j--;
      } else if (d === 2) i--; else j--;
    }

    // Fill the gaps between anchors.
    const known = L.map((w, k) => w.t != null ? k : -1).filter(k => k >= 0);
    if (!known.length) return { lines, matched: 0, total: n };
    for (let k = 0; k < known[0]; k++) { L[k].t = Math.max(0, L[known[0]].t - (known[0] - k) * 0.3); L[k].e = L[k].t + 0.28; }
    for (let q = 0; q < known.length - 1; q++) {
      const a = known[q], b = known[q + 1];
      if (b - a < 2) continue;
      const t0 = L[a].e, t1 = L[b].t, step = (t1 - t0) / (b - a);
      for (let k = a + 1; k < b; k++) { L[k].t = t0 + step * (k - a - 1) + step * 0.1; L[k].e = L[k].t + step * 0.8; }
    }
    const lastK = known[known.length - 1];
    for (let k = lastK + 1; k < n; k++) { L[k].t = L[k - 1].e + 0.05; L[k].e = L[k].t + 0.3; }

    // Keep words monotonic.
    for (let k = 1; k < n; k++) if (L[k].t < L[k - 1].t) L[k].t = L[k - 1].t + 0.01;

    const out = lines.map((l) => ({ ...l, words: [] }));
    L.forEach(w => out[w.li].words.push({ w: w.w, t: +w.t.toFixed(3), e: +w.e.toFixed(3) }));
    out.forEach(l => { if (l.words.length) l.t = l.words[0].t; else l.words = null; });
    return { lines: out, matched, total: n };
  }

  // A transcript with no written lyrics: make lines from the recognised segments.
  function fromSegments(segments) {
    return segments.filter(s => String(s.text || '').trim()).map(s => ({
      t: +s.start, text: String(s.text).trim(), section: '',
      words: s.words && s.words.length ? s.words.map(w => ({ w: String(w.word).trim(), t: +w.start, e: +w.end })) : null,
    }));
  }

  return { parse, parseLRC, parseSuno, isLRC, toLRC, toSheet, mergeTimings, status, wordsFor, lineEnd, nextTime, lineAt, nextTimed, align, fromSegments, norm, tokens };
})();
