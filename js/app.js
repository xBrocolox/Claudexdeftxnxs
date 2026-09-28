// NULL//CATHEDRAL — app shell: save data, screens, battle UI, packs, collection, deck builder.

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

// ═════════ SAVE DATA ═════════
const Store = (() => {
  const KEY = 'nullcathedral.save.v1';
  let d = null;
  function fresh() {
    const col = {};
    COLLECTIBLE.filter(c => c.rarity === 'C').forEach(c => { col[c.id] = { n: 2, f: 0 }; });
    return { shards: 0, freePacks: 3, col, deck: null, wins: 0, losses: 0, packs: 0 };
  }
  function load() {
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; }
    if (!d || !d.col) d = fresh();
    if (!d.deck || !Deck.valid(d.deck)) d.deck = Deck.auto();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* private mode */ } }
  const owned = (id) => d.col[id] ? d.col[id].n + d.col[id].f : 0;
  const hasFoil = (id) => !!(d.col[id] && d.col[id].f);
  function add(id, foil) {
    const e = d.col[id] || (d.col[id] = { n: 0, f: 0 });
    if (foil) e.f++; else e.n++;
  }
  function reset() { d = fresh(); d.deck = Deck.auto(); save(); }
  return { load, save, owned, hasFoil, add, reset, get d() { return d; } };
})();

// ═════════ DECK RULES ═════════
const Deck = (() => {
  const SIZE = 20;
  const limit = (id) => Math.min(RARITIES[CARD_BY_ID[id].rarity].copies, Store.owned(id));
  function counts(deck) { const c = {}; deck.forEach(id => c[id] = (c[id] || 0) + 1); return c; }
  function valid(deck) {
    if (!Array.isArray(deck) || deck.length !== SIZE) return false;
    const c = counts(deck);
    return Object.keys(c).every(id => CARD_BY_ID[id] && c[id] <= limit(id));
  }
  function auto() {
    // favor the two factions you own the most of, then fill with anything
    const byF = {};
    COLLECTIBLE.forEach(c => { if (Store.owned(c.id)) byF[c.faction] = (byF[c.faction] || 0) + Store.owned(c.id) * (1 + c.cost / 5); });
    const top = Object.keys(byF).filter(f => f !== 'null').sort((a, b) => byF[b] - byF[a]).slice(0, 2).concat('null');
    const pool = COLLECTIBLE.filter(c => Store.owned(c.id));
    const score = (c) => (top.includes(c.faction) ? 100 : 0) + ({ C: 0, U: 4, R: 8, SR: 14, GX: 18 }[c.rarity]) - Math.abs(c.cost - 3) * 1.5;
    pool.sort((a, b) => score(b) - score(a));
    const deck = [];
    for (const c of pool) { for (let i = 0; i < limit(c.id) && deck.length < SIZE; i++) deck.push(c.id); }
    return deck.sort((a, b) => CARD_BY_ID[a].cost - CARD_BY_ID[b].cost);
  }
  return { SIZE, limit, counts, valid, auto };
})();

// ═════════ PACKS ═════════
const Packs = (() => {
  const COST = 100;
  const ORDER = ['C', 'U', 'R', 'SR', 'GX'];
  function rollRarity(min) {
    const opts = ORDER.slice(ORDER.indexOf(min));
    const tot = opts.reduce((a, k) => a + RARITIES[k].weight, 0);
    let x = Math.random() * tot;
    for (const k of opts) { x -= RARITIES[k].weight; if (x <= 0) return k; }
    return opts[opts.length - 1];
  }
  function roll() {
    const mins = ['C', 'C', 'C', 'U', 'R'];
    return mins.map(m => {
      const rar = rollRarity(m);
      const pool = COLLECTIBLE.filter(c => c.rarity === rar);
      const c = pool[Math.random() * pool.length | 0];
      const foil = rar === 'SR' || rar === 'GX' || Math.random() < 0.08;
      return { id: c.id, foil };
    });
  }
  return { COST, roll, ORDER };
})();

// ═════════ SCREENS ═════════
const App = (() => {
  let current = null;
  function show(name) {
    current = name;
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + name));
    $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.go === name));
    $('.nav').classList.toggle('hidden', name === 'battle');
    ({ title: Title.render, packs: PackUI.render, collection: CollectionUI.render, deck: DeckUI.render, battle: () => {} })[name]();
    updateWallet();
    window.scrollTo(0, 0);
  }
  function updateWallet() {
    $('#wallet').innerHTML = `<span>◈ ${Store.d.shards}</span><span>▣ ${Store.d.freePacks} free</span>`;
  }
  function toast(msg) {
    const t = h('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2400);
  }
  function inspect(c, foil) {
    const m = $('#modal');
    m.innerHTML = '';
    const wrap = h('div', 'inspect');
    const cardEl = Render.card(c, { foil, tilt: true, size: 'xl' });
    const info = h('div', 'inspect-info');
    const kws = (c.kw || []).map(k => `<div class="gloss"><b>${k}</b> ${KEYWORDS[k]}</div>`).join('');
    info.innerHTML = `
      <div class="ii-rar r-${c.rarity}">${RARITIES[c.rarity].name}${foil && c.rarity !== 'SR' && c.rarity !== 'GX' ? ' · HOLO FOIL' : ''}</div>
      <h2>${Render.esc(c.name)}</h2>
      <div class="ii-f">${FACTIONS[c.faction].glyph} ${FACTIONS[c.faction].name} — <i>${FACTIONS[c.faction].motto}</i></div>
      ${kws}
      ${c.token ? '' : `<div class="ii-own">OWNED: ${Store.owned(c.id)} ${Store.hasFoil(c.id) ? `(${Store.d.col[c.id].f} foil)` : ''}</div>`}
      <div class="ii-hint">move your pointer across the card</div>`;
    wrap.append(cardEl, info);
    m.appendChild(wrap);
    m.classList.add('open');
  }
  function modal(html) {
    const m = $('#modal');
    m.innerHTML = '';
    const box = h('div', 'panel', html);
    m.appendChild(box);
    m.classList.add('open');
    return box;
  }
  function closeModal() { $('#modal').classList.remove('open'); }
  function ask(question, yesLabel, onYes) {
    const box = modal(`<h2>${question}</h2><div class="end-btns"><button class="btn" id="ask-yes">${yesLabel}</button><button class="btn ghost" id="ask-no">CANCEL</button></div>`);
    $('#ask-yes', box).onclick = () => { closeModal(); onYes(); };
    $('#ask-no', box).onclick = closeModal;
  }
  return { show, toast, inspect, modal, closeModal, ask, updateWallet, get current() { return current; } };
})();

// ═════════ TITLE ═════════
const Title = (() => {
  function render() {
    const fan = $('#title-fan');
    fan.innerHTML = '';
    const showcase = ['v07', 'h10', 't09'].map(id => CARD_BY_ID[id]);
    showcase.forEach((c, i) => {
      const el = Render.card(c, { tilt: true, foil: true });
      el.style.setProperty('--fan', i - 1);
      el.addEventListener('click', () => App.inspect(c, true));
      fan.appendChild(el);
    });
    const bg = $('#title-bg');
    if (!bg.childElementCount) {
      ['s08', 'h04', 't07', 'v10'].forEach((id, i) => {
        const l = h('div', 'tbg-layer');
        l.style.backgroundImage = `url(${Art.render(CARD_BY_ID[id])})`;
        l.style.animationDelay = `${-i * 7}s`;
        bg.appendChild(l);
      });
    }
    const d = Store.d;
    $('#title-stats').textContent = `WINS ${d.wins} · LOSSES ${d.losses} · PACKS OPENED ${d.packs} · CARDS ${COLLECTIBLE.filter(c => Store.owned(c.id)).length}/${COLLECTIBLE.length}`;
  }
  return { render };
})();

// ═════════ BATTLE ═════════
const Battle = (() => {
  let s = null, ui = null, seen = new Set(), aiFactions = [];
  const root = () => $('#scr-battle');

  function start() {
    if (!Deck.valid(Store.d.deck)) { App.toast('Your deck needs exactly 20 valid cards.'); App.show('deck'); return; }
    const ai = AI.buildDeck();
    aiFactions = ai.factions;
    s = Engine.create(Store.d.deck, ai.deck, ['YOU', `${FACTIONS[ai.factions[0]].name}-${FACTIONS[ai.factions[1]].name} HOST`]);
    ui = { mode: 'idle', pending: null, busy: false };
    seen = new Set();
    s.events = [];
    App.show('battle');
    render();
    banner(s.active === 0 ? 'YOU TRANSMIT FIRST' : 'THE HOST TRANSMITS FIRST');
    if (s.active === 1) runAI();
  }

  function banner(text, cls = '') {
    const b = h('div', 'banner ' + cls, `<span data-text="${text}">${text}</span>`);
    root().appendChild(b);
    setTimeout(() => b.remove(), 1600);
  }

  // ── rendering ──
  function render() {
    const R = root();
    const me = s.players[0], op = s.players[1];
    const myTurn = s.active === 0 && !ui.busy && s.winner === null;
    R.innerHTML = `
      <div class="b-side b-op">
        ${pbar(op, 1)}
        <div class="b-ophand">${op.hand.map(() => '<div class="mini-back"></div>').join('')}</div>
        <div class="b-board" id="board-1"></div>
      </div>
      <div class="b-mid">
        <div class="b-log" id="b-log">${s.log.slice(-4).map(l => `<div>${Render.esc(l)}</div>`).join('')}</div>
        <button class="btn end ${myTurn ? '' : 'off'}" id="btn-end">${s.active === 0 ? 'END TURN' : 'HOST TURN…'}</button>
        <button class="btn ghost small" id="btn-quit">FORFEIT</button>
      </div>
      <div class="b-side b-me">
        <div class="b-board" id="board-0"></div>
        ${pbar(me, 0)}
        <div class="b-hand" id="hand"></div>
      </div>
      <div class="b-hint" id="b-hint"></div>`;
    [0, 1].forEach(pi => {
      const board = $('#board-' + pi);
      s.players[pi].board.forEach(u => {
        const el = Render.card(u.card, { inst: u, size: 'sm', foil: pi === 0 && Store.hasFoil(u.id) });
        if (u.veil) el.classList.add('veiled');
        if (u.kw.has('BULWARK')) el.classList.add('bulwark');
        if (pi === s.active && u.canAttack && u.atk > 0 && pi === 0 && myTurn) el.classList.add('ready');
        if (!seen.has(u.uid)) { el.classList.add('enter'); seen.add(u.uid); }
        board.appendChild(el);
      });
    });
    const hand = $('#hand');
    me.hand.forEach((inst, i) => {
      const el = Render.card(inst.card, { size: 'sm', foil: Store.hasFoil(inst.id) });
      el.dataset.uid = inst.uid;
      el.style.setProperty('--i', i - (me.hand.length - 1) / 2);
      el.style.setProperty('--a', Math.abs(i - (me.hand.length - 1) / 2));
      el.classList.add('in-hand');
      if (myTurn && Engine.canPlay(s, 0, inst)) el.classList.add('playable');
      if (!seen.has(inst.uid)) { el.classList.add('drawn'); seen.add(inst.uid); }
      hand.appendChild(el);
    });
    fitHand(hand);
    highlight();
    bind();
  }

  function fitHand(hand) {
    const n = hand.children.length;
    if (n < 2) return;
    const cw = hand.firstElementChild.offsetWidth, avail = hand.clientWidth * 0.96;
    const m = Math.min(-8, (avail - n * cw) / (2 * n));
    hand.style.setProperty('--m', m + 'px');
  }

  function pbar(p, pi) {
    const pct = Math.max(0, p.core / Engine.CORE_HP * 100);
    const pips = Array.from({ length: 10 }, (_, i) => `<i class="${i < p.signal ? 'on' : i < p.maxSignal ? 'used' : ''}"></i>`).join('');
    return `<div class="pbar ${s.active === pi ? 'active' : ''}">
      <div class="core" data-core="${pi}">
        <div class="core-orb"><span>${p.core}</span></div>
        <div class="core-meta"><b>${Render.esc(p.name)}</b><div class="core-bar"><i style="width:${pct}%"></i></div></div>
      </div>
      <div class="signal"><div class="pips">${pips}</div><span>SIGNAL ${p.signal}/${p.maxSignal}</span></div>
      <div class="deckct">▤ ${p.deck.length}</div>
    </div>`;
  }

  function targetEl(t) {
    if (t.kind === 'core') return $(`.core[data-core="${t.pi}"]`, root());
    return $(`.b-board .card[data-uid="${t.uid}"]`, root());
  }

  function highlight() {
    $$('.targetable', root()).forEach(e => e.classList.remove('targetable'));
    $$('.selected', root()).forEach(e => e.classList.remove('selected'));
    const hint = $('#b-hint');
    let targets = [];
    if (ui.mode === 'target') {
      targets = Engine.validTargets(s, 0, ui.pending.eff);
      const src = $(`#hand .card[data-uid="${ui.pending.uid}"]`); if (src) src.classList.add('selected');
      hint.textContent = `SELECT A TARGET — ${ui.pending.card.text}  ·  [right-click / Esc to cancel]`;
    } else if (ui.mode === 'attack') {
      targets = Engine.attackTargets(s, Engine.findUnit(s, ui.pending.uid));
      const src = targetEl({ kind: 'unit', uid: ui.pending.uid }); if (src) src.classList.add('selected');
      hint.textContent = 'SELECT ATTACK TARGET';
    } else hint.textContent = '';
    hint.classList.toggle('on', !!hint.textContent);
    targets.forEach(t => { const e = targetEl(t); if (e) e.classList.add('targetable'); });
  }

  function bind() {
    $('#btn-end').onclick = () => { if (s.active === 0 && !ui.busy && s.winner === null) { cancel(); endTurn(); } };
    $('#btn-quit').onclick = (e) => { e.stopPropagation(); App.ask('Forfeit this battle?', 'FORFEIT', () => { if (s.winner === null) { s.winner = 1; finish(); } }); };
    $$('#hand .card').forEach(el => {
      el.onclick = (e) => { e.stopPropagation(); clickHand(+el.dataset.uid); };
      el.oncontextmenu = (e) => { e.preventDefault(); App.inspect(CARD_BY_ID[el.dataset.id], Store.hasFoil(el.dataset.id)); };
    });
    $$('.b-board .card').forEach(el => {
      el.onclick = (e) => { e.stopPropagation(); clickUnit(+el.dataset.uid); };
      el.oncontextmenu = (e) => { e.preventDefault(); App.inspect(CARD_BY_ID[el.dataset.id]); };
    });
    $$('.core', root()).forEach(el => { el.onclick = (e) => { e.stopPropagation(); clickCore(+el.dataset.core); }; });
    root().onclick = () => cancel();
    root().oncontextmenu = (e) => { if (ui.mode !== 'idle') { e.preventDefault(); cancel(); } };
  }

  function cancel() { if (ui.mode !== 'idle') { ui.mode = 'idle'; ui.pending = null; highlight(); } }

  function clickHand(uid) {
    if (s.active !== 0 || ui.busy || s.winner !== null) return;
    const inst = s.players[0].hand.find(x => x.uid === uid);
    if (!inst) return;
    if (ui.mode === 'target' && ui.pending.uid === uid) return cancel();
    if (!Engine.canPlay(s, 0, inst)) {
      const el = $(`#hand .card[data-uid="${uid}"]`); el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
      App.toast(inst.card.cost > s.players[0].signal ? 'Not enough Signal.' : s.players[0].board.length >= Engine.BOARD_MAX ? 'Your board is full.' : 'No valid targets.');
      return;
    }
    const eff = Engine.chooseKind(inst.card);
    if (eff && Engine.validTargets(s, 0, eff).length) {
      ui.mode = 'target'; ui.pending = { uid, eff, card: inst.card };
      highlight();
      return;
    }
    act(() => Engine.play(s, 0, uid, null));
  }

  function tryTarget(t) {
    if (ui.mode === 'target') {
      const valid = Engine.validTargets(s, 0, ui.pending.eff);
      if (valid.some(v => Engine.sameTarget(v, t))) { const uid = ui.pending.uid; cancel(); act(() => Engine.play(s, 0, uid, t)); return true; }
    } else if (ui.mode === 'attack') {
      const valid = Engine.attackTargets(s, Engine.findUnit(s, ui.pending.uid));
      if (valid.some(v => Engine.sameTarget(v, t))) { const uid = ui.pending.uid; cancel(); act(() => Engine.attack(s, uid, t)); return true; }
    }
    return false;
  }

  function clickUnit(uid) {
    if (s.active !== 0 || ui.busy || s.winner !== null) return;
    if (tryTarget({ kind: 'unit', uid })) return;
    const u = Engine.findUnit(s, uid);
    if (ui.mode === 'attack' && ui.pending.uid === uid) return cancel();
    if (u && u.owner === 0 && u.canAttack && u.atk > 0) {
      ui.mode = 'attack'; ui.pending = { uid };
      highlight();
    } else if (u && u.owner === 0 && !u.canAttack) {
      App.toast('This unit is still booting. It can attack next turn.');
    }
  }

  function clickCore(pi) {
    if (s.active !== 0 || ui.busy) return;
    if (!tryTarget({ kind: 'core', pi })) cancel();
  }

  async function act(fn) {
    ui.busy = true;
    const ok = fn();
    if (ok) await commit();
    ui.busy = false;
    render();
    if (s.winner !== null) return finish();
  }

  // ── event animation ──
  function floatNum(el, text, cls) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = h('div', 'floatnum ' + cls, text);
    f.style.left = (r.left + r.width / 2) + 'px';
    f.style.top = (r.top + r.height / 2) + 'px';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }

  async function commit() {
    const evs = s.events.splice(0);
    let anim = false;
    for (const e of evs) {
      if (e.t === 'attack') {
        const a = $(`.b-board .card[data-uid="${e.uid}"]`, root()), t = targetEl(e.target);
        if (a && t) {
          const ra = a.getBoundingClientRect(), rt = t.getBoundingClientRect();
          a.style.setProperty('--dx', (rt.left + rt.width / 2 - ra.left - ra.width / 2) * 0.8 + 'px');
          a.style.setProperty('--dy', (rt.top + rt.height / 2 - ra.top - ra.height / 2) * 0.8 + 'px');
          a.classList.add('lunge');
          await sleep(260);
          anim = true;
        }
      } else if (e.t === 'dmg') {
        const el = targetEl(e.target);
        if (el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); floatNum(el, '-' + e.n, 'dmg'); anim = true; }
        if (e.target.kind === 'core') glitchScreen();
      } else if (e.t === 'heal') {
        const el = targetEl(e.target); floatNum(el, '+' + e.n, 'heal'); anim = true;
      } else if (e.t === 'die' || e.t === 'destroy') {
        const el = $(`.b-board .card[data-uid="${e.uid}"]`, root()); if (el) { el.classList.add('dying'); anim = true; }
      } else if (e.t === 'buff' || e.t === 'corrupt') {
        const el = $(`.b-board .card[data-uid="${e.uid}"]`, root()); if (el) { floatNum(el, e.t === 'buff' ? '▲' : '▼ATK', e.t); anim = true; }
      } else if (e.t === 'play' && e.pi === 1) {
        await showCast(CARD_BY_ID[e.id]);
      } else if (e.t === 'turn') {
        anim = false;
        render();
        banner(e.pi === 0 ? 'YOUR TURN' : 'HOST TURN', e.pi === 0 ? 'mine' : 'theirs');
        await sleep(500);
      }
    }
    if (anim) await sleep(520);
    render();
  }

  function glitchScreen() {
    const R = root(); R.classList.remove('glitching'); void R.offsetWidth; R.classList.add('glitching');
  }

  async function showCast(c) {
    const o = h('div', 'cast');
    o.appendChild(Render.card(c, { size: 'lg', foil: c.rarity === 'SR' || c.rarity === 'GX' }));
    root().appendChild(o);
    await sleep(1100);
    o.classList.add('out');
    await sleep(250);
    o.remove();
  }

  async function endTurn() {
    ui.busy = true;
    Engine.endTurn(s);
    await commit();
    ui.busy = false;
    if (s.winner !== null) return finish();
    if (s.active === 1) runAI(); else render();
  }

  async function runAI() {
    ui.busy = true; render();
    await sleep(700);
    let guard = 0;
    while (s.active === 1 && s.winner === null && guard++ < 40 && App.current === 'battle') {
      const a = AI.nextAction(s, 1);
      if (!a) break;
      const ok = a.type === 'play' ? Engine.play(s, 1, a.uid, a.target) : Engine.attack(s, a.uid, a.target);
      if (!ok) break;
      await commit();
      await sleep(350);
    }
    if (App.current !== 'battle') return;
    if (s.winner !== null) { ui.busy = false; return finish(); }
    Engine.endTurn(s);
    await commit();
    ui.busy = false;
    render();
    if (s.winner !== null) finish();
  }

  function finish() {
    if (s.finished) return;
    s.finished = true;
    const win = s.winner === 0;
    const reward = win ? 150 : 40;
    Store.d.shards += reward;
    if (win) Store.d.wins++; else Store.d.losses++;
    Store.save();
    const o = h('div', 'endscreen ' + (win ? 'win' : 'lose'), `
      <div class="end-title" data-text="${win ? 'TRANSMISSION COMPLETE' : 'SIGNAL LOST'}">${win ? 'TRANSMISSION COMPLETE' : 'SIGNAL LOST'}</div>
      <div class="end-sub">${win ? 'The Host\'s Core collapses into static.' : 'Your Core fades into the noise floor.'}</div>
      <div class="end-reward">+${reward} ◈ SHARDS</div>
      <div class="end-btns"><button class="btn" id="end-again">REMATCH</button><button class="btn ghost" id="end-packs">OPEN PACKS</button><button class="btn ghost" id="end-menu">MENU</button></div>`);
    root().appendChild(o);
    $('#end-again').onclick = () => start();
    $('#end-packs').onclick = () => App.show('packs');
    $('#end-menu').onclick = () => App.show('title');
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui) cancel(); });

  return { start };
})();

// ═════════ PACK OPENING ═════════
const PackUI = (() => {
  let opening = false;
  function render() {
    if (opening) return;
    const R = $('#scr-packs');
    const d = Store.d;
    const canFree = d.freePacks > 0, canBuy = d.shards >= Packs.COST;
    R.innerHTML = `
      <div class="pk-head">
        <h1 class="glitch" data-text="SIGNAL PACKS">SIGNAL PACKS</h1>
        <p>5 cards per pack · slot 4 guaranteed Uncommon+ · slot 5 guaranteed Rare+ · 8% holo foil on any card<br>
        Super Rare &amp; Glitch Secret cards are always foil.</p>
      </div>
      <div class="pk-stage">
        <div class="pack" id="the-pack">
          <div class="pack-foil"></div>
          <div class="pack-art" style="background-image:url(${Art.render(CARD_BY_ID['s07'])})"></div>
          <div class="pack-logo">NULL<em>//</em>CATHEDRAL</div>
          <div class="pack-sub">BOOSTER · 05 SIGNALS</div>
          <div class="pack-tear"></div>
          <div class="pack-code">SER.${(Math.random() * 1e6 | 0).toString(16).toUpperCase()} ▚▚▚ SEALED</div>
        </div>
      </div>
      <div class="pk-actions">
        ${canFree ? `<button class="btn" id="pk-free">OPEN FREE PACK (${d.freePacks})</button>` : ''}
        <button class="btn ${canBuy ? '' : 'off'}" id="pk-buy">BUY PACK · ${Packs.COST} ◈</button>
      </div>
      <div class="pk-note">${!canFree && !canBuy ? 'Win battles to earn shards (◈150 per victory, ◈40 per defeat).' : ''}</div>`;
    const go = (free) => {
      if (free) { if (d.freePacks <= 0) return; d.freePacks--; }
      else { if (d.shards < Packs.COST) return App.toast('Not enough shards. Win battles to earn more.'); d.shards -= Packs.COST; }
      open();
    };
    if ($('#pk-free')) $('#pk-free').onclick = () => go(true);
    $('#pk-buy').onclick = () => go(false);
    $('#the-pack').onclick = () => { if (d.freePacks > 0) go(true); else if (d.shards >= Packs.COST) go(false); };
  }

  async function open() {
    opening = true;
    const pulls = Packs.roll();
    pulls.forEach(p => Store.add(p.id, p.foil));
    Store.d.packs++;
    Store.save();
    App.updateWallet();
    const R = $('#scr-packs');
    $('.pk-actions', R).innerHTML = '';
    $('.pk-note', R).innerHTML = '';
    const pack = $('#the-pack');
    pack.classList.add('tearing');
    await sleep(900);
    const stage = $('.pk-stage', R);
    stage.innerHTML = '<div class="reveal-row"></div>';
    const row = $('.reveal-row', stage);
    let flipped = 0;
    pulls.forEach((p, i) => {
      const c = CARD_BY_ID[p.id];
      const slot = h('div', 'flip');
      slot.style.animationDelay = (i * 0.09) + 's';
      const back = Render.cardBack(Packs.ORDER.indexOf(c.rarity) >= 2 ? c.rarity : null);
      back.classList.add('flip-back');
      const front = Render.card(c, { foil: p.foil, tilt: true });
      front.classList.add('flip-front');
      if (Store.owned(c.id) === 1) front.insertAdjacentHTML('beforeend', '<div class="new-tag">NEW</div>');
      slot.append(back, front);
      slot.onclick = () => {
        if (slot.classList.contains('flipped')) return App.inspect(c, p.foil);
        slot.classList.add('flipped');
        if (c.rarity === 'SR' || c.rarity === 'GX') { burst(slot, c.rarity); }
        if (++flipped === pulls.length) done();
      };
      row.appendChild(slot);
    });
    const acts = $('.pk-actions', R);
    acts.innerHTML = '<button class="btn ghost" id="pk-all">REVEAL ALL</button>';
    $('#pk-all').onclick = () => $$('.flip:not(.flipped)', row).forEach((s, i) => setTimeout(() => s.click(), i * 220));
    function done() {
      opening = false;
      acts.innerHTML = `<button class="btn" id="pk-again">ANOTHER PACK</button><button class="btn ghost" id="pk-col">VIEW COLLECTION</button>`;
      $('#pk-again').onclick = () => render();
      $('#pk-col').onclick = () => App.show('collection');
    }
  }

  function burst(el, rar) {
    const b = h('div', 'burst b-' + rar);
    el.appendChild(b);
    document.body.classList.add('flash-' + rar);
    setTimeout(() => document.body.classList.remove('flash-' + rar), 700);
    setTimeout(() => b.remove(), 1400);
  }
  return { render };
})();

// ═════════ COLLECTION ═════════
const CollectionUI = (() => {
  const f = { faction: 'all', rarity: 'all', owned: false };
  function render() {
    const R = $('#scr-collection');
    const ownedCount = COLLECTIBLE.filter(c => Store.owned(c.id)).length;
    const foilCount = COLLECTIBLE.filter(c => Store.hasFoil(c.id)).length;
    const chip = (key, val, label) => `<button class="chip ${f[key] === val ? 'on' : ''}" data-k="${key}" data-v="${val}">${label}</button>`;
    R.innerHTML = `
      <div class="col-head">
        <h1 class="glitch" data-text="ARCHIVE">ARCHIVE</h1>
        <div class="col-prog"><div class="bar"><i style="width:${ownedCount / COLLECTIBLE.length * 100}%"></i></div>
        <span>${ownedCount}/${COLLECTIBLE.length} INDEXED · ${foilCount} HOLO</span></div>
        <div class="chips">
          ${chip('faction', 'all', 'ALL')}${Object.entries(FACTIONS).map(([k, v]) => chip('faction', k, v.glyph + ' ' + v.name)).join('')}
        </div>
        <div class="chips">
          ${chip('rarity', 'all', 'ANY RARITY')}${Object.keys(RARITIES).map(k => chip('rarity', k, RARITIES[k].name)).join('')}
          <button class="chip ${f.owned ? 'on' : ''}" id="own-t">OWNED ONLY</button>
        </div>
      </div>
      <div class="grid" id="col-grid"></div>`;
    const grid = $('#col-grid');
    COLLECTIBLE
      .filter(c => (f.faction === 'all' || c.faction === f.faction) && (f.rarity === 'all' || c.rarity === f.rarity) && (!f.owned || Store.owned(c.id)))
      .forEach(c => {
        const n = Store.owned(c.id);
        const el = Render.card(c, { foil: Store.hasFoil(c.id), tilt: n > 0, count: n, dim: !n });
        if (!n) el.insertAdjacentHTML('beforeend', '<div class="locked">UNINDEXED</div>');
        el.onclick = () => { if (n) App.inspect(c, Store.hasFoil(c.id)); };
        grid.appendChild(el);
      });
    $$('.chip[data-k]', R).forEach(b => b.onclick = () => { f[b.dataset.k] = b.dataset.v; render(); });
    $('#own-t').onclick = () => { f.owned = !f.owned; render(); };
  }
  return { render };
})();

// ═════════ DECK BUILDER ═════════
const DeckUI = (() => {
  function render() {
    const R = $('#scr-deck');
    const deck = Store.d.deck;
    const counts = Deck.counts(deck);
    const valid = Deck.valid(deck);
    const curve = Array(8).fill(0);
    deck.forEach(id => curve[Math.min(7, CARD_BY_ID[id].cost)]++);
    const maxC = Math.max(1, ...curve);
    R.innerHTML = `
      <div class="dk-wrap">
        <div class="dk-pool">
          <h1 class="glitch" data-text="CONGREGATION">CONGREGATION</h1>
          <p class="dk-help">Click a card to add it. Max 2 copies (1 for Super Rare &amp; Glitch Secret), limited by how many you own.</p>
          <div class="grid small" id="dk-grid"></div>
        </div>
        <aside class="dk-list">
          <div class="dk-count ${valid ? 'ok' : ''}">${deck.length}<small>/${Deck.SIZE}</small></div>
          <div class="curve">${curve.map((n, i) => `<div><i style="height:${n / maxC * 100}%"></i><span>${i === 7 ? '7+' : i}</span></div>`).join('')}</div>
          <div class="dk-rows" id="dk-rows"></div>
          <div class="dk-btns">
            <button class="btn small" id="dk-auto">AUTO-BUILD</button>
            <button class="btn ghost small" id="dk-clear">CLEAR</button>
          </div>
          <button class="btn ${valid ? '' : 'off'}" id="dk-play">BATTLE ▸</button>
        </aside>
      </div>`;
    const grid = $('#dk-grid');
    COLLECTIBLE.filter(c => Store.owned(c.id)).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name)).forEach(c => {
      const left = Deck.limit(c.id) - (counts[c.id] || 0);
      const el = Render.card(c, { foil: Store.hasFoil(c.id), count: left > 0 ? left : 0, dim: left <= 0 });
      el.onclick = () => {
        if (deck.length >= Deck.SIZE) return App.toast('Deck is full (20).');
        if (left <= 0) return App.toast('No more copies available.');
        deck.push(c.id); sortSave(); render();
      };
      el.oncontextmenu = (e) => { e.preventDefault(); App.inspect(c, Store.hasFoil(c.id)); };
      grid.appendChild(el);
    });
    const rows = $('#dk-rows');
    Object.keys(counts).sort((a, b) => CARD_BY_ID[a].cost - CARD_BY_ID[b].cost).forEach(id => {
      const c = CARD_BY_ID[id];
      const row = h('div', `dk-row f-${c.faction} r-${c.rarity}`, `
        <span class="dr-cost">${c.cost}</span><span class="dr-name">${Render.esc(c.name)}</span><span class="dr-n">×${counts[id]}</span>`);
      row.style.backgroundImage = `linear-gradient(90deg, var(--bg) 35%, transparent), url(${Art.render(c)})`;
      row.onclick = () => { deck.splice(deck.indexOf(id), 1); sortSave(); render(); };
      rows.appendChild(row);
    });
    $('#dk-auto').onclick = () => { Store.d.deck = Deck.auto(); Store.save(); render(); };
    $('#dk-clear').onclick = () => { Store.d.deck = []; Store.save(); render(); };
    $('#dk-play').onclick = () => { if (Deck.valid(Store.d.deck)) Battle.start(); else App.toast('Deck must contain exactly 20 cards.'); };
  }
  function sortSave() { Store.d.deck.sort((a, b) => CARD_BY_ID[a].cost - CARD_BY_ID[b].cost); Store.save(); }
  return { render };
})();

// ═════════ BOOT ═════════
function howToPlay() {
  App.modal(`
    <h2>TRANSMISSION PROTOCOL</h2>
    <p>Reduce the enemy <b>Core</b> from 25 integrity to 0.</p>
    <ul>
      <li><b>Signal</b> is your resource. You gain 1 max Signal each turn (up to 10) and it refills every turn.</li>
      <li>Click a card in your hand to play it. <b>Units</b> go to your board; <b>Protocols</b> resolve and vanish.</li>
      <li>Units can attack the turn <i>after</i> they are deployed. Click your unit, then click an enemy unit or the enemy Core.</li>
      <li>Combat is simultaneous — both units deal their ATK to each other.</li>
      <li>Drawing from an empty deck deals increasing feedback damage to your Core.</li>
      <li>Right-click (long-press on touch) any card to inspect it.</li>
    </ul>
    <h3>KEYWORDS</h3>
    ${Object.entries(KEYWORDS).map(([k, v]) => `<div class="gloss"><b>${k}</b> ${v}</div>`).join('')}
    <h3>RARITY</h3>
    <div class="rar-legend">${Object.keys(RARITIES).map(k => `<span class="r-${k}">${RARITIES[k].name}</span>`).join('')}</div>
    <button class="btn" onclick="App.closeModal()">UNDERSTOOD</button>`);
}

document.addEventListener('DOMContentLoaded', () => {
  Store.load();
  Store.save();
  $$('[data-go]').forEach(b => b.addEventListener('click', () => b.dataset.go === 'battle' ? Battle.start() : App.show(b.dataset.go)));
  $('#btn-how').onclick = howToPlay;
  $('#btn-reset').onclick = () => App.ask('Wipe your collection and start over?', 'WIPE SAVE', () => { Store.reset(); App.show('title'); });
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') App.closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') App.closeModal(); });
  // long-press → inspect on touch
  let lp = null;
  document.addEventListener('touchstart', (e) => {
    const c = e.target.closest('.card[data-id]');
    if (!c) return;
    lp = setTimeout(() => { App.inspect(CARD_BY_ID[c.dataset.id], Store.hasFoil(c.dataset.id)); }, 550);
  }, { passive: true });
  ['touchend', 'touchmove'].forEach(ev => document.addEventListener(ev, () => clearTimeout(lp), { passive: true }));
  App.show('title');
});
