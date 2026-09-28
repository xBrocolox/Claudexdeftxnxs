// Card DOM rendering + holographic pointer tilt.

const Render = (() => {
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function barcode(id) {
    const r = Art.mulberry(Art.hash(id));
    let out = '';
    for (let i = 0; i < 26; i++) out += `<i style="width:${1 + (r() * 3 | 0)}px;opacity:${r() < 0.2 ? 0 : 1}"></i>`;
    return out;
  }

  // opts: { foil, inst (battle instance), size, tilt, count, dim, extra }
  function card(c, opts = {}) {
    const inst = opts.inst;
    const foil = opts.foil || c.rarity === 'SR' || c.rarity === 'GX';
    const hex = '0x' + Art.hash(c.id).toString(16).toUpperCase().slice(0, 6);
    const atk = inst ? inst.atk : c.atk, hp = inst ? inst.hp : c.hp;
    const atkCls = inst ? (atk > c.atk ? 'up' : atk < c.atk ? 'down' : '') : '';
    const hpCls = inst ? (hp < inst.maxHp ? 'down' : hp > c.hp ? 'up' : '') : '';
    const el = document.createElement('div');
    el.className = `card f-${c.faction} r-${c.rarity} t-${c.type}${foil ? ' foil' : ''}${opts.tilt ? ' tiltable' : ''}${opts.dim ? ' dim' : ''}${opts.size ? ' sz-' + opts.size : ''}`;
    if (inst) el.dataset.uid = inst.uid;
    el.dataset.id = c.id;
    const total = COLLECTIBLE.length;
    el.innerHTML = `
      <div class="c-inner">
        <div class="c-frame">
          <div class="c-top">
            <div class="c-cost"><span>${c.cost}</span></div>
            <div class="c-name" data-text="${esc(c.name)}">${esc(c.name)}</div>
            <div class="c-glyph">${FACTIONS[c.faction].glyph}</div>
          </div>
          <div class="c-art" style="background-image:url(${Art.render(c)})">
            <div class="c-art-hud"><i></i><i></i><i></i><i></i><span class="c-hex">${hex}</span></div>
            ${c.rarity === 'GX' ? '<div class="c-art-glitch" style="background-image:url(' + Art.render(c) + ')"></div>' : ''}
          </div>
          <div class="c-type">
            <span>${c.type === 'unit' ? 'UNIT' : 'PROTOCOL'} <em>//</em> ${FACTIONS[c.faction].name}</span>
            <span class="c-rar">${c.rarity}</span>
          </div>
          <div class="c-text">
            <div class="c-rules">${cardText(c)}</div>
            <div class="c-flavor">${esc(c.flavor || '')}</div>
          </div>
          <div class="c-bottom">
            ${c.type === 'unit' ? `<div class="c-atk ${atkCls}"><span>${atk}</span></div>` : '<div class="c-proto">⟁</div>'}
            <div class="c-meta">
              <div class="c-barcode">${barcode(c.id)}</div>
              <div class="c-serial">${c.serial}/${String(total).padStart(3, '0')} · NLL-CTH · ${hex}</div>
            </div>
            ${c.type === 'unit' ? `<div class="c-hp ${hpCls}"><span>${hp}</span></div>` : '<div class="c-proto">⟁</div>'}
          </div>
        </div>
        <div class="c-holo"></div>
        <div class="c-sparkle"></div>
        <div class="c-glare"></div>
      </div>
      ${opts.count ? `<div class="c-count">×${opts.count}</div>` : ''}
      ${opts.extra || ''}`;
    if (opts.tilt) attachTilt(el);
    return el;
  }

  function cardBack(rarity) {
    const el = document.createElement('div');
    el.className = 'card card-back' + (rarity ? ' back-' + rarity : '');
    el.innerHTML = `<div class="c-inner"><div class="back-art">
      <div class="back-ring r1"></div><div class="back-ring r2"></div><div class="back-ring r3"></div>
      <div class="back-sigil">∅</div>
      <div class="back-title">NULL<em>//</em>CATHEDRAL</div>
      <div class="back-code">▚▚ SIGNAL CARRIER ▚▚</div>
    </div></div>`;
    return el;
  }

  function attachTilt(el) {
    const inner = () => el.querySelector('.c-inner');
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const pt = e.touches ? e.touches[0] : e;
      const x = (pt.clientX - r.left) / r.width, y = (pt.clientY - r.top) / r.height;
      el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      el.style.setProperty('--rx', ((0.5 - y) * 22).toFixed(2) + 'deg');
      el.style.setProperty('--ry', ((x - 0.5) * 26).toFixed(2) + 'deg');
      el.style.setProperty('--hyp', Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 2).toFixed(3));
      el.classList.add('tilting');
    };
    const leave = () => {
      el.classList.remove('tilting');
      ['--rx', '--ry'].forEach(k => el.style.setProperty(k, '0deg'));
      el.style.setProperty('--mx', '50%'); el.style.setProperty('--my', '50%'); el.style.setProperty('--hyp', '0');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', leave);
    if (!inner()) return;
  }

  return { card, cardBack, esc };
})();
