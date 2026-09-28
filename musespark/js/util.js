// MuseSpark: shared helpers, settings, seeded randomness, WAV encoding and generated cover art.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// 83.4 → "1:23" (or "1:23.40" with cs)
function fmtTime(t, cs = false) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60), s = t - m * 60;
  return cs ? `${m}:${s.toFixed(2).padStart(5, '0')}` : `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
}

function toast(msg, kind = '') {
  const t = $('#toast');
  const e = h('div', 'toast ' + kind, esc(msg));
  t.appendChild(e);
  setTimeout(() => e.classList.add('out'), 3600);
  setTimeout(() => e.remove(), 4200);
}

// Resolves true when the user confirms. Built into the page because native confirm() is blocked in some embeds.
function askConfirm(msg, okLabel = 'Confirm') {
  const d = $('#dlg-confirm');
  $('#dlg-confirm-msg').textContent = msg;
  $('#dlg-confirm-ok').textContent = okLabel;
  d.returnValue = '';
  d.showModal();
  return new Promise(res => d.addEventListener('close', () => res(d.returnValue === 'yes'), { once: true }));
}

// Copy text; if the clipboard is blocked, select the text in `fallbackEl` so the user can copy it by hand.
async function copyText(text, okMsg, fallbackEl) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch (e) {
    if (fallbackEl) {
      if (fallbackEl.select) { fallbackEl.focus(); fallbackEl.select(); }
      else { const r = document.createRange(); r.selectNodeContents(fallbackEl); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    }
    toast('Copying is blocked here. The text is selected, so press Ctrl+C (⌘C on Mac).', 'err');
  }
}

// Inside the claude.ai artifact viewer, files go through its `downloads` capability (the viewer confirms each save);
// everywhere else a normal download link is used.
let downloadsCap = null;
const getDownloads = () => downloadsCap || (downloadsCap = window.claude && window.claude.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null));

async function download(blob, name) {
  const cap = await getDownloads();
  if (cap) {
    // The viewer allows a fixed list of extensions: .lrc travels as text, .m4a as .mp4.
    const filename = name.replace(/\.lrc$/i, '.lrc.txt').replace(/\.m4a$/i, '.mp4');
    try { await cap.save({ filename, data: blob }); toast(`Saved ${filename}`); }
    catch (e) {
      if (e && e.code === 'declined') return;
      toast(e && e.code === 'rate_limited' ? 'A save prompt is already open.' : 'Saving files isn’t available in this view.', 'err');
    }
    return;
  }
  const a = h('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

const safeName = (s) => String(s || 'musespark').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'musespark';

// ═════════ SETTINGS (localStorage, per viewer) ═════════
const Settings = (() => {
  const KEY = 'musespark.settings.v1';
  const defaults = { vsUrl: 'http://127.0.0.1:3900', vsKey: '', offsetMs: 0, founder: 'The Founder', vsSeen: false };
  let d = { ...defaults };
  try { Object.assign(d, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* private mode */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* private mode */ } }
  return {
    get: (k) => d[k],
    set(k, v) { d[k] = v; save(); },
  };
})();

// ═════════ SEEDED RNG ═════════
function hashStr(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
function rng(seed) {
  let a = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// ═════════ WAV ENCODING ═════════
function encodeWav(buffer) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, n = buffer.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  str(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = clamp(data[c][i], -1, 1); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([out], { type: 'audio/wav' });
}

// ═════════ GENERATED COVER ART ═════════
// Songs without a cover get a seeded gradient "spark" so every card has its own look.
const PALETTES = [
  ['#ff4fa3', '#ffb547', '#2a0f3d'], ['#5ef2ff', '#7b5cff', '#0b0f2e'], ['#ffd166', '#ef476f', '#1b0b1f'],
  ['#9bff8a', '#1ec8a5', '#07201f'], ['#ff7a59', '#ffd6a5', '#2b1320'], ['#c3a6ff', '#ff8fd8', '#150c2c'],
];
function drawCover(ctx, W, H, seed) {
  const r = rng(seed), p = pick(r, PALETTES);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, p[2]); g.addColorStop(1, '#000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) {
    const x = r() * W, y = r() * H, rad = (0.3 + r() * 0.6) * Math.max(W, H);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, (i % 2 ? p[0] : p[1]) + '88'); rg.addColorStop(1, 'transparent');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }
  // central spark
  const cx = W * (0.35 + r() * 0.3), cy = H * (0.35 + r() * 0.3), s = Math.min(W, H) * (0.18 + r() * 0.12);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(r() * Math.PI);
  ctx.fillStyle = '#fff'; ctx.shadowColor = p[0]; ctx.shadowBlur = s * 0.6;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? s * 0.18 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
  // orbit lines
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = Math.max(1, W / 256);
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(cx, cy, s * (1.4 + i * 0.7), s * (0.5 + i * 0.3), r() * Math.PI, 0, Math.PI * 2); ctx.stroke(); }
}
function coverURL(seed, size = 320) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  drawCover(c.getContext('2d'), size, size, seed);
  return c.toDataURL('image/jpeg', 0.85);
}
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
