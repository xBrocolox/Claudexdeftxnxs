// Opponent logic: greedy curve play, value trades, lethal checks.

const AI = (() => {
  const value = (u) => u.atk * 1.2 + u.hp + (u.card.fx ? 1.5 : 0) + u.kw.size;

  function pickTarget(s, pi, inst) {
    const eff = Engine.chooseKind(inst.card);
    if (!eff) return null;
    const valid = Engine.validTargets(s, pi, eff);
    if (!valid.length) return null;
    const unitOf = (t) => t.kind === 'unit' ? Engine.findUnit(s, t.uid) : null;
    const mine = (t) => t.kind === 'unit' ? unitOf(t).owner === pi : t.pi === pi;
    let best = null, bestScore = -Infinity;
    for (const t of valid) {
      const u = unitOf(t);
      let sc = -Infinity;
      switch (eff.op) {
        case 'dmg': case 'drain':
          if (mine(t)) break;
          if (u) sc = (u.hp <= eff.n ? 10 + value(u) : value(u) * 0.3);
          else sc = 6 + (s.players[t.pi].core <= eff.n ? 100 : 0);
          break;
        case 'buff': if (mine(t)) sc = u.atk + u.hp + (u.canAttack ? 3 : 0); break;
        case 'destroy': case 'corrupt': if (!mine(t)) sc = value(u); break;
      }
      if (sc > bestScore) { bestScore = sc; best = t; }
    }
    return bestScore === -Infinity ? null : best;
  }

  // Returns one next action, or null to end the turn.
  function nextAction(s, pi) {
    const p = s.players[pi];
    // 1. play cards, most expensive first
    const playable = p.hand.filter(h => Engine.canPlay(s, pi, h)).sort((a, b) => b.card.cost - a.card.cost);
    for (const h of playable) {
      const eff = Engine.chooseKind(h.card);
      const target = pickTarget(s, pi, h);
      if (eff && !target && h.card.type === 'protocol') continue;
      // don't wipe our own better board
      if (h.id === 't10' || h.id === 'h10') {
        const ours = p.board.reduce((a, u) => a + value(u), 0), theirs = s.players[1 - pi].board.reduce((a, u) => a + value(u), 0);
        if (theirs <= ours + 3) continue;
      }
      return { type: 'play', uid: h.uid, target };
    }
    // 2. attacks
    const them = s.players[1 - pi];
    const attackers = p.board.filter(u => u.canAttack && u.atk > 0);
    if (!attackers.length) return null;
    const totalAtk = attackers.reduce((a, u) => a + u.atk, 0);
    for (const a of attackers) {
      const targets = Engine.attackTargets(s, a);
      const face = targets.find(t => t.kind === 'core');
      if (face && totalAtk >= them.core) return { type: 'attack', uid: a.uid, target: face };
      let best = null, bestScore = face ? 2 : -Infinity;
      for (const t of targets) {
        if (t.kind !== 'unit') continue;
        const d = Engine.findUnit(s, t.uid);
        const kills = a.atk >= d.hp, survives = d.atk < a.hp;
        let sc = -5;
        if (kills && survives) sc = 8 + value(d);
        else if (kills) sc = value(d) - value(a) + 3;
        else if (survives) sc = 1;
        if (d.kw.has('BULWARK') && !face) sc += 50;
        if (sc > bestScore) { bestScore = sc; best = t; }
      }
      return { type: 'attack', uid: a.uid, target: best || face };
    }
    return null;
  }

  // Deck: 20 cards, curve-weighted, from the full pool (the machine owns everything).
  function buildDeck() {
    const factions = ['silicate', 'severed', 'static', 'hollow'];
    const fs = factions.sort(() => Math.random() - 0.5).slice(0, 2).concat('null');
    const pool = COLLECTIBLE.filter(c => fs.includes(c.faction));
    const deck = [];
    const counts = {};
    let guard = 0;
    while (deck.length < 20 && guard++ < 2000) {
      const c = pool[Math.random() * pool.length | 0];
      const w = RARITIES[c.rarity].weight / 60 + (c.cost <= 4 ? 0.5 : 0.1);
      if (Math.random() > w) continue;
      const max = RARITIES[c.rarity].copies;
      if ((counts[c.id] || 0) >= max) continue;
      counts[c.id] = (counts[c.id] || 0) + 1;
      deck.push(c.id);
    }
    return { deck, factions: fs.slice(0, 2) };
  }

  return { nextAction, buildDeck };
})();
