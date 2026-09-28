// Battle engine — pure state, no DOM. Emits events that the UI animates.

const Engine = (() => {
  const CORE_HP = 25, MAX_SIGNAL = 10, BOARD_MAX = 6, HAND_MAX = 8, START_HAND = 4;
  let uidSeq = 1;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function makeInst(id, owner) {
    const c = CARD_BY_ID[id];
    return {
      uid: uidSeq++, id, owner, card: c,
      atk: c.atk || 0, hp: c.hp || 0, maxHp: c.hp || 0,
      kw: new Set(c.kw || []), canAttack: false, veil: (c.kw || []).includes('VEIL'),
    };
  }

  function newPlayer(name, deck, isAI) {
    return { name, isAI, core: CORE_HP, maxSignal: 0, signal: 0, deck: shuffle(deck.slice()), hand: [], board: [], fatigue: 0 };
  }

  function create(deckA, deckB, names) {
    const s = {
      players: [newPlayer(names[0], deckA, false), newPlayer(names[1], deckB, true)],
      active: Math.random() < 0.5 ? 0 : 1, turnNo: 0, winner: null, events: [], log: [],
    };
    for (let i = 0; i < START_HAND; i++) { draw(s, 0); draw(s, 1); }
    // second player gets a bonus card
    draw(s, 1 - s.active);
    s.events = [];
    startTurn(s);
    return s;
  }

  const emit = (s, e) => s.events.push(e);
  const log = (s, msg) => { s.log.push(msg); if (s.log.length > 60) s.log.shift(); };
  const foe = (i) => 1 - i;

  function draw(s, pi) {
    const p = s.players[pi];
    if (!p.deck.length) {
      p.fatigue++;
      log(s, `${p.name} pulls from an empty deck — ${p.fatigue} feedback damage.`);
      damageCore(s, pi, p.fatigue);
      return;
    }
    const id = p.deck.pop();
    if (p.hand.length >= HAND_MAX) { log(s, `${p.name}'s hand overflows. ${CARD_BY_ID[id].name} is lost to static.`); emit(s, { t: 'burn', pi, id }); return; }
    const inst = makeInst(id, pi);
    p.hand.push(inst);
    emit(s, { t: 'draw', pi, uid: inst.uid });
  }

  function startTurn(s) {
    const pi = s.active, p = s.players[pi];
    s.turnNo++;
    p.maxSignal = Math.min(MAX_SIGNAL, p.maxSignal + 1);
    p.signal = p.maxSignal;
    p.board.forEach(u => { u.canAttack = true; });
    emit(s, { t: 'turn', pi });
    log(s, `── ${p.name}: turn ${Math.ceil(s.turnNo / 2)} ──`);
    draw(s, pi);
    // start-of-turn triggers
    for (const u of p.board.slice()) {
      if (u.card.fx && u.card.fx.turn && u.hp > 0) runEffects(s, u.card.fx.turn, { pi, source: u });
    }
    cleanup(s);
  }

  function endTurn(s) {
    if (s.winner !== null) return;
    s.active = foe(s.active);
    startTurn(s);
  }

  // ─── targeting ───
  function findUnit(s, uid) {
    for (let pi = 0; pi < 2; pi++) {
      const u = s.players[pi].board.find(x => x.uid === uid);
      if (u) return u;
    }
    return null;
  }

  function chooseKind(card) {
    const all = (card.fx && card.fx.play) || [];
    const e = all.find(e => e.to && e.to.startsWith('choose'));
    return e || null;
  }

  // Valid targets for a choose-effect, from the perspective of player pi.
  function validTargets(s, pi, eff) {
    const me = s.players[pi], them = s.players[foe(pi)];
    const out = [];
    const enemyUnits = them.board.filter(u => !u.veil && (eff.maxAtk === undefined || u.atk <= eff.maxAtk));
    const myUnits = me.board.filter(u => eff.maxAtk === undefined || u.atk <= eff.maxAtk);
    switch (eff.to) {
      case 'choose':
        enemyUnits.forEach(u => out.push({ kind: 'unit', uid: u.uid }));
        myUnits.forEach(u => out.push({ kind: 'unit', uid: u.uid }));
        out.push({ kind: 'core', pi: foe(pi) }, { kind: 'core', pi });
        break;
      case 'chooseUnit':
        enemyUnits.forEach(u => out.push({ kind: 'unit', uid: u.uid }));
        myUnits.forEach(u => out.push({ kind: 'unit', uid: u.uid }));
        break;
      case 'chooseEnemyUnit': enemyUnits.forEach(u => out.push({ kind: 'unit', uid: u.uid })); break;
      case 'chooseFriendlyUnit': myUnits.forEach(u => out.push({ kind: 'unit', uid: u.uid })); break;
    }
    return out;
  }

  function attackTargets(s, attacker) {
    const them = s.players[foe(attacker.owner)];
    const bulwarks = them.board.filter(u => u.kw.has('BULWARK') && !u.veil);
    if (bulwarks.length) return bulwarks.map(u => ({ kind: 'unit', uid: u.uid }));
    const out = them.board.filter(u => !u.veil).map(u => ({ kind: 'unit', uid: u.uid }));
    out.push({ kind: 'core', pi: foe(attacker.owner) });
    return out;
  }

  const sameTarget = (a, b) => a && b && a.kind === b.kind && (a.kind === 'unit' ? a.uid === b.uid : a.pi === b.pi);

  // ─── actions ───
  function canPlay(s, pi, inst) {
    const p = s.players[pi];
    if (s.winner !== null || s.active !== pi) return false;
    if (inst.card.cost > p.signal) return false;
    if (inst.card.type === 'unit' && p.board.length >= BOARD_MAX) return false;
    if (inst.card.type === 'protocol') {
      const ch = chooseKind(inst.card);
      if (ch && !validTargets(s, pi, ch).length) return false;
    }
    return true;
  }

  function play(s, pi, uid, target) {
    const p = s.players[pi];
    const idx = p.hand.findIndex(h => h.uid === uid);
    if (idx < 0) return false;
    const inst = p.hand[idx];
    if (!canPlay(s, pi, inst)) return false;
    const ch = chooseKind(inst.card);
    if (ch) {
      const valid = validTargets(s, pi, ch);
      if (target && !valid.some(v => sameTarget(v, target))) return false;
      if (!target && valid.length && inst.card.type === 'protocol') return false;
    }
    p.signal -= inst.card.cost;
    p.hand.splice(idx, 1);
    emit(s, { t: 'play', pi, uid: inst.uid, id: inst.id });
    log(s, `${p.name} ${inst.card.type === 'unit' ? 'deploys' : 'executes'} ${inst.card.name}.`);
    if (inst.card.type === 'unit') {
      inst.canAttack = inst.kw.has('OVERCLOCK');
      p.board.push(inst);
    }
    if (inst.card.fx && inst.card.fx.play) runEffects(s, inst.card.fx.play, { pi, source: inst, target });
    cleanup(s);
    return true;
  }

  function attack(s, attackerUid, target) {
    const a = findUnit(s, attackerUid);
    if (!a || a.owner !== s.active || !a.canAttack || a.atk <= 0 || s.winner !== null) return false;
    if (!attackTargets(s, a).some(t => sameTarget(t, target))) return false;
    a.canAttack = false;
    if (a.veil) { a.veil = false; }
    const owner = s.players[a.owner];
    emit(s, { t: 'attack', uid: a.uid, target });
    if (target.kind === 'core') {
      log(s, `${a.card.name} strikes ${s.players[target.pi].name}'s Core for ${a.atk}.`);
      damageCore(s, target.pi, a.atk, a);
    } else {
      const d = findUnit(s, target.uid);
      log(s, `${a.card.name} engages ${d.card.name}.`);
      const aDmg = a.atk, dDmg = d.atk;
      damageUnit(s, d, aDmg, a);
      damageUnit(s, a, dDmg, d);
    }
    cleanup(s);
    return !!owner;
  }

  // ─── damage & death ───
  function damageUnit(s, u, n, src) {
    if (n <= 0 || u.hp <= 0) return;
    u.hp -= n;
    emit(s, { t: 'dmg', target: { kind: 'unit', uid: u.uid }, n });
    if (src && src.kw) {
      if (src.kw.has('LEECH')) heal(s, src.owner, n);
      if (src.kw.has('CORRUPT') && u.atk > 0) { u.atk = Math.max(0, u.atk - 1); emit(s, { t: 'corrupt', uid: u.uid }); }
    }
  }

  function damageCore(s, pi, n, src) {
    if (n <= 0) return;
    s.players[pi].core -= n;
    emit(s, { t: 'dmg', target: { kind: 'core', pi }, n });
    if (src && src.kw && src.kw.has('LEECH')) heal(s, src.owner, n);
    if (s.players[pi].core <= 0 && s.winner === null) s.winner = foe(pi);
  }

  function heal(s, pi, n) {
    const p = s.players[pi];
    const before = p.core;
    p.core = Math.min(CORE_HP, p.core + n);
    if (p.core > before) emit(s, { t: 'heal', target: { kind: 'core', pi }, n: p.core - before });
  }

  function cleanup(s) {
    let guard = 0;
    while (guard++ < 20) {
      const dead = [];
      s.players.forEach(p => p.board.forEach(u => { if (u.hp <= 0) dead.push(u); }));
      if (!dead.length) break;
      for (const u of dead) {
        const p = s.players[u.owner];
        const i = p.board.indexOf(u);
        if (i >= 0) p.board.splice(i, 1);
        emit(s, { t: 'die', uid: u.uid, id: u.id, pi: u.owner });
        log(s, `${u.card.name} is erased.`);
      }
      for (const u of dead) {
        if (u.kw.has('ECHO')) summon(s, u.owner, 'tok_echo', 1);
        if (u.card.fx && u.card.fx.death) runEffects(s, u.card.fx.death, { pi: u.owner, source: u });
      }
    }
  }

  function summon(s, pi, id, n) {
    const p = s.players[pi];
    for (let i = 0; i < n && p.board.length < BOARD_MAX; i++) {
      const inst = makeInst(id, pi);
      inst.canAttack = inst.kw.has('OVERCLOCK');
      p.board.push(inst);
      emit(s, { t: 'summon', uid: inst.uid, pi });
    }
  }

  // ─── effect interpreter ───
  function resolveTargets(s, eff, ctx) {
    const pi = ctx.pi, me = s.players[pi], them = s.players[foe(pi)];
    const T = (u) => ({ kind: 'unit', uid: u.uid });
    switch (eff.to) {
      case 'choose': case 'chooseUnit': case 'chooseEnemyUnit': case 'chooseFriendlyUnit':
        return ctx.target ? [ctx.target] : [];
      case 'enemyCore': return [{ kind: 'core', pi: foe(pi) }];
      case 'ownCore': return [{ kind: 'core', pi }];
      case 'allEnemyUnits': return them.board.map(T);
      case 'allFriendlyUnits': return me.board.map(T);
      case 'allUnits': return [...me.board, ...them.board].map(T);
      case 'allOtherUnits': return [...me.board, ...them.board].filter(u => u !== ctx.source).map(T);
      case 'allEnemies': return [...them.board.map(T), { kind: 'core', pi: foe(pi) }];
      case 'randomEnemy': {
        const pool = [...them.board.filter(u => u.hp > 0).map(T), { kind: 'core', pi: foe(pi) }];
        return [pool[Math.random() * pool.length | 0]];
      }
      case 'self': return ctx.source ? [T(ctx.source)] : [];
      default: return [];
    }
  }

  function runEffects(s, effects, ctx) {
    for (const eff of effects) {
      if (s.winner !== null) return;
      const pi = ctx.pi;
      switch (eff.op) {
        case 'draw': for (let i = 0; i < eff.n; i++) draw(s, pi); break;
        case 'signal': s.players[pi].signal += eff.n; emit(s, { t: 'signal', pi }); break;
        case 'summon': summon(s, pi, eff.id, eff.n); break;
        default: {
          const targets = resolveTargets(s, eff, ctx);
          for (const t of targets) applyOp(s, eff, t, ctx);
        }
      }
    }
  }

  function applyOp(s, eff, t, ctx) {
    const unit = t.kind === 'unit' ? findUnit(s, t.uid) : null;
    if (t.kind === 'unit' && !unit) return;
    switch (eff.op) {
      case 'dmg':
      case 'drain':
        if (unit) damageUnit(s, unit, eff.n, null); else damageCore(s, t.pi, eff.n, null);
        if (eff.op === 'drain') heal(s, ctx.pi, eff.n);
        break;
      case 'heal':
        if (unit) { unit.hp = Math.min(unit.maxHp, unit.hp + eff.n); emit(s, { t: 'heal', target: t, n: eff.n }); }
        else heal(s, t.pi, eff.n);
        break;
      case 'buff':
        if (unit) { unit.atk += eff.atk; unit.hp += eff.hp; unit.maxHp += eff.hp; emit(s, { t: 'buff', uid: unit.uid }); }
        break;
      case 'corrupt':
        if (unit) { unit.atk = Math.max(0, unit.atk - eff.n); emit(s, { t: 'corrupt', uid: unit.uid }); }
        break;
      case 'destroy':
        if (unit && (eff.maxAtk === undefined || unit.atk <= eff.maxAtk)) { unit.hp = 0; emit(s, { t: 'destroy', uid: unit.uid }); }
        break;
    }
  }

  return {
    create, play, attack, endTurn, canPlay, validTargets, attackTargets, chooseKind, findUnit, sameTarget,
    CORE_HP, BOARD_MAX, foe,
  };
})();
