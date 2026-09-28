// DOM overlay UI. Widgets register on a focus stack; the top widget receives
// input each frame, so game logic can simply `await` dialogue and menus.
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Assets } from './assets.js';
import { SPEAKERS } from './data.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const stack = [];
function push(w) { stack.push(w); return w; }
function pop(w) { const i = stack.indexOf(w); if (i >= 0) stack.splice(i, 1); }

export const UI = {
  root: null,
  busy() { return stack.length > 0; },

  init() {
    this.root = $('#ui');
  },

  update(dt) {
    const top = stack[stack.length - 1];
    top?.handle?.(dt);
    for (const w of stack) if (w !== top) w.tick?.(dt);
    top?.tick?.(dt);
  },

  // ---- dialogue ----------------------------------------------------------
  say(lines) {
    return new Promise((resolve) => {
      const box = el('div', 'dlg');
      box.innerHTML = '<div class="dlg-portrait"><img alt=""></div><div class="dlg-body"><div class="dlg-name"></div><div class="dlg-text"></div><div class="dlg-next">▼</div></div>';
      this.root.appendChild(box);
      const img = box.querySelector('img'), name = box.querySelector('.dlg-name'), text = box.querySelector('.dlg-text');
      let i = -1, shown = 0, full = '', done = false;
      const next = () => {
        i++;
        if (i >= lines.length) { box.classList.add('out'); setTimeout(() => box.remove(), 200); pop(w); resolve(); return; }
        const [who, t] = lines[i];
        const sp = SPEAKERS[who] || SPEAKERS.sys;
        name.textContent = sp.name; name.style.color = sp.color;
        box.classList.toggle('narration', who === 'sys');
        const pix = Assets.pix.sheets['hero_' + who];
        img.src = Assets.portraits[who] || '';
        box.querySelector('.dlg-portrait').style.display = who === 'sys' ? 'none' : '';
        box.querySelector('.dlg-portrait').classList.toggle('pix', !!pix);
        if (pix) img.src = pix.poster ? `assets/pixverse/${pix.poster}` : img.src;
        full = t; shown = 0; done = false; text.textContent = '';
        box.classList.remove('glitchin'); void box.offsetWidth; box.classList.add('glitchin');
      };
      const w = push({
        handle: (dt) => {
          if (!done) {
            shown += dt * 55;
            text.textContent = full.slice(0, Math.floor(shown));
            if (shown >= full.length) done = true;
          }
          if (Input.hit('ok') || Input.hit('back')) {
            if (!done) { shown = full.length; text.textContent = full; done = true; } else { Audio.sfx('move'); next(); }
          }
        },
      });
      box.addEventListener('pointerdown', () => Input.pressed.add('Enter'));
      next();
    });
  },

  // ---- banners, hints, toasts -------------------------------------------
  zone(name) {
    const z = el('div', 'zone-card', `<span class="zc-rule"></span><span class="zc-text" data-text="${name}">${name}</span><span class="zc-rule"></span>`);
    this.root.appendChild(z);
    setTimeout(() => z.classList.add('out'), 2800);
    setTimeout(() => z.remove(), 3600);
  },

  hint(text) {
    let h = $('#hint');
    if (!text) { h?.classList.remove('on'); return; }
    if (!h) { h = el('div', ''); h.id = 'hint'; this.root.appendChild(h); }
    h.innerHTML = text;
    h.classList.add('on');
  },

  toast(html, ms = 2200) {
    const t = el('div', 'toast', html);
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  },

  banner(text, cls = '') {
    const b = el('div', 'banner ' + cls, `<span data-text="${text}">${text}</span>`);
    this.root.appendChild(b);
    setTimeout(() => b.classList.add('out'), 1500);
    setTimeout(() => b.remove(), 2000);
  },

  // ---- generic list menu ---------------------------------------------------
  /**
   * items: [{label, sub, disabled, value, info}]; resolves to value or null (back).
   * opts: { title, cls, onMove(item), allowBack }
   */
  menu(items, opts = {}) {
    return new Promise((resolve) => {
      const m = el('div', 'menu ' + (opts.cls || ''));
      if (opts.title) m.appendChild(el('div', 'menu-title', opts.title));
      const list = el('div', 'menu-list');
      m.appendChild(list);
      const info = el('div', 'menu-info');
      if (items.some((it) => it.info)) m.appendChild(info);
      const rows = items.map((it, i) => {
        const r = el('div', 'menu-item' + (it.disabled ? ' disabled' : ''), `<span class="mi-label">${it.label}</span>${it.sub != null ? `<span class="mi-sub">${it.sub}</span>` : ''}`);
        r.addEventListener('pointerenter', () => set(i));
        r.addEventListener('click', () => { set(i); choose(); });
        list.appendChild(r);
        return r;
      });
      (opts.parent || this.root).appendChild(m);
      let idx = Math.max(0, items.findIndex((it) => !it.disabled));
      const set = (i) => {
        idx = i;
        rows.forEach((r, k) => r.classList.toggle('sel', k === idx));
        info.textContent = items[idx]?.info || '';
        opts.onMove?.(items[idx]);
      };
      const close = (v) => { pop(w); m.classList.add('out'); setTimeout(() => m.remove(), 150); resolve(v); };
      const choose = () => {
        const it = items[idx];
        if (!it || it.disabled) { Audio.sfx('miss'); return; }
        Audio.sfx('ok'); close(it.value);
      };
      const w = push({
        handle: () => {
          if (Input.hit('down')) { Audio.sfx('move'); set((idx + 1) % items.length); }
          if (Input.hit('up')) { Audio.sfx('move'); set((idx - 1 + items.length) % items.length); }
          if (Input.hit('ok')) choose();
          if (Input.hit('back') && opts.allowBack !== false) { Audio.sfx('back'); close(null); }
        },
      });
      set(idx);
    });
  },

  /** Arrow-key target picker over 3D units; `onMove(unit)` highlights. */
  pickTarget(units, { onMove, all = false } = {}) {
    return new Promise((resolve) => {
      let idx = 0;
      const set = (i) => { idx = (i + units.length) % units.length; onMove?.(all ? units : [units[idx]]); };
      const close = (v) => { pop(w); onMove?.([]); resolve(v); };
      const w = push({
        handle: () => {
          if (!all && (Input.hit('down') || Input.hit('right'))) { Audio.sfx('move'); set(idx + 1); }
          if (!all && (Input.hit('up') || Input.hit('left'))) { Audio.sfx('move'); set(idx - 1); }
          if (Input.hit('ok')) { Audio.sfx('ok'); close(all ? units : units[idx]); }
          if (Input.hit('back')) { Audio.sfx('back'); close(null); }
        },
      });
      this._pickClick = (u) => { if (units.includes(u)) { Audio.sfx('ok'); close(all ? units : u); } };
      set(0);
    });
  },

  // ---- Judgment Ring -------------------------------------------------------
  /**
   * zones: number of hit areas (1-3). Resolves to [{hit, strike}] per zone
   * reached. With auto=true it plays itself (accessibility setting).
   */
  ring(zones, { auto = false, speed = 1 } = {}) {
    return new Promise((resolve) => {
      const wrap = el('div', 'ring-wrap', '<canvas width="300" height="300"></canvas><div class="ring-label">JUDGMENT</div><div class="ring-help">SPACE / TAP when the needle crosses a zone</div>');
      this.root.appendChild(wrap);
      const c = wrap.querySelector('canvas'), g = c.getContext('2d');
      const TAU = Math.PI * 2;
      // zones spread around the ring, each with a narrow red strike area at the end
      const arcs = [];
      const span = 0.34 * TAU / Math.max(1, zones);
      for (let i = 0; i < zones; i++) {
        const start = 0.12 * TAU + i * (0.8 * TAU / zones) + Math.random() * 0.05 * TAU;
        const len = span * (0.75 + Math.random() * 0.2);
        arcs.push({ start, end: start + len, strikeStart: start + len * 0.8 });
      }
      const dur = 1.55 / speed;
      let t = 0, cur = 0, results = [], finished = false, flash = 0, lastRes = null;
      const angle = () => (t / dur) * TAU;
      const draw = () => {
        g.clearRect(0, 0, 300, 300);
        g.save(); g.translate(150, 150); g.rotate(-Math.PI / 2);
        g.lineWidth = 26; g.strokeStyle = 'rgba(12,14,18,0.85)';
        g.beginPath(); g.arc(0, 0, 110, 0, TAU); g.stroke();
        g.lineWidth = 1; g.strokeStyle = 'rgba(79,240,255,0.35)';
        for (const r of [96, 124]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
        for (let k = 0; k < 48; k++) { const a = k / 48 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 124, Math.sin(a) * 124); g.lineTo(Math.cos(a) * 130, Math.sin(a) * 130); g.stroke(); }
        arcs.forEach((a, i) => {
          const r = results[i];
          g.lineWidth = 22;
          g.strokeStyle = r ? (r.hit ? (r.strike ? '#ff2a4a' : '#4ff0ff') : '#3a3d44') : 'rgba(79,240,255,0.55)';
          g.beginPath(); g.arc(0, 0, 110, a.start, a.end); g.stroke();
          if (!r) { g.strokeStyle = 'rgba(255,42,74,0.9)'; g.beginPath(); g.arc(0, 0, 110, a.strikeStart, a.end); g.stroke(); }
        });
        const an = angle();
        g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.shadowColor = '#4ff0ff'; g.shadowBlur = 12;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(an) * 132, Math.sin(an) * 132); g.stroke();
        g.restore();
        g.fillStyle = flash > 0 ? `rgba(255,255,255,${flash})` : 'rgba(0,0,0,0)';
        g.beginPath(); g.arc(150, 150, 60, 0, TAU); g.fill();
        if (lastRes) {
          g.font = '700 22px "Chakra Petch", sans-serif'; g.textAlign = 'center';
          g.fillStyle = lastRes === 'STRIKE' ? '#ff2a4a' : lastRes === 'MISS' ? '#8a8f99' : '#4ff0ff';
          g.fillText(lastRes, 150, 158);
        }
      };
      const end = () => {
        if (finished) return;
        finished = true;
        setTimeout(() => { pop(w); wrap.classList.add('out'); setTimeout(() => wrap.remove(), 200); resolve(results); }, 280);
      };
      const judge = (forced = null) => {
        const a = arcs[cur], an = angle();
        if (!a) return;
        if (forced || (an >= a.start && an <= a.end)) {
          const strike = forced ? forced === 'strike' : an >= a.strikeStart;
          results.push({ hit: true, strike });
          lastRes = strike ? 'STRIKE' : 'HIT';
          Audio.sfx(strike ? 'crit' : 'ring'); flash = 0.5;
          cur++;
          if (cur >= arcs.length) end();
        } else {
          results.push({ hit: false }); lastRes = 'MISS'; Audio.sfx('miss'); end();
        }
      };
      c.addEventListener('pointerdown', () => { if (!auto) judge(); });
      const w = push({
        handle: (dt) => {
          if (finished) { draw(); return; }
          t += dt;
          flash = Math.max(0, flash - dt * 3);
          const a = arcs[cur];
          // auto mode never misses a zone, even if a slow frame skips the needle past it
          if (auto && a && angle() >= a.start) judge(Math.random() < 0.3 ? 'strike' : 'hit');
          else if (!auto && Input.hit('ok')) judge();
          if (!finished && a && angle() > a.end) { results.push({ hit: false }); lastRes = 'MISS'; Audio.sfx('miss'); end(); }
          if (t >= dur) end();
          draw();
        },
      });
      draw();
    });
  },

  // ---- battle HUD ------------------------------------------------------------
  battleHud(on) {
    let h = $('#bhud');
    if (!on) { h?.remove(); $('#ctb')?.remove(); return; }
    if (!h) {
      h = el('div', ''); h.id = 'bhud'; this.root.appendChild(h);
      const c = el('div', ''); c.id = 'ctb'; c.innerHTML = '<div class="ctb-title">TURN ORDER</div><div class="ctb-list"></div>'; this.root.appendChild(c);
    }
  },

  updateParty(units, activeUnit) {
    const h = $('#bhud');
    if (!h) return;
    h.innerHTML = units.map((u) => {
      const hp = Math.max(0, u.hp) / u.max.hp, mp = u.mp / Math.max(1, u.max.mp);
      return `<div class="pcard${u === activeUnit ? ' active' : ''}${u.hp <= 0 ? ' dead' : ''}${hp < 0.3 && u.hp > 0 ? ' low' : ''}">
        <img src="${Assets.portraits[u.id] || ''}" alt="">
        <div class="pc-body"><div class="pc-name" style="color:${u.color}">${u.name}<span class="pc-lv">LV ${u.lvl}</span></div>
        <div class="bar hp"><i style="width:${hp * 100}%"></i><span>${Math.max(0, Math.round(u.hp))}/${u.max.hp}</span></div>
        <div class="bar mp"><i style="width:${mp * 100}%"></i><span>${Math.round(u.mp)}/${u.max.mp}</span></div>
        <div class="pc-status">${u.statusText()}</div></div></div>`;
    }).join('');
  },

  updateCTB(order) {
    const l = $('#ctb .ctb-list');
    if (!l) return;
    l.innerHTML = order.map((u, i) => `<div class="ctb-item ${u.side}${i === 0 ? ' now' : ''}" style="--c:${u.color}">
      <img src="${Assets.portraits[u.portrait] || ''}" alt=""><span>${u.name}</span></div>`).join('');
  },

  /** Floating combat text at a screen position. */
  popup(x, y, text, cls = '') {
    const p = el('div', 'popup ' + cls, text);
    p.style.left = x + 'px'; p.style.top = y + 'px';
    $('#popups').appendChild(p);
    setTimeout(() => p.remove(), 1300);
  },

  caption(text) {
    let c = $('#caption');
    if (!text) { c?.classList.remove('on'); return; }
    if (!c) { c = el('div', ''); c.id = 'caption'; this.root.appendChild(c); }
    c.innerHTML = text; c.classList.add('on');
  },

  // ---- screens -----------------------------------------------------------
  fade(on, ms = 400) {
    const f = $('#fade');
    f.style.transitionDuration = ms + 'ms';
    f.classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, ms));
  },

  panel(html, cls = '') {
    const p = el('div', 'panel ' + cls, html);
    this.root.appendChild(p);
    return p;
  },

  /** Wait for ok/back (for result screens). */
  waitOk() {
    return new Promise((resolve) => {
      const w = push({ handle: () => { if (Input.hit('ok') || Input.hit('back')) { Audio.sfx('ok'); pop(w); resolve(); } } });
      const click = () => { removeEventListener('pointerdown', click); Input.pressed.add('Enter'); };
      setTimeout(() => addEventListener('pointerdown', click), 300);
    });
  },
};
