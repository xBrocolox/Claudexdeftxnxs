// Game data: party, skills, items, enemies, encounter groups, dialogue.
// All names and writing are original; the tribute lives in mechanics and mood
// (CTB turn order, the Judgment Ring, save spheres, possession, logged-in
// players who cannot log out, time gates swallowed by concrete).

export const HEROES = {
  sable: {
    name: 'SABLE', title: 'Severed Blade', model: 'sable', color: '#ff2a4a',
    base: { hp: 320, mp: 40, atk: 34, mag: 12, def: 18, res: 12, spd: 12 },
    growth: { hp: 38, mp: 4, atk: 4, mag: 1.2, def: 2.2, res: 1.5, spd: 0.5 },
    skills: [
      { id: 'severance', lvl: 1 }, { id: 'gravity_rend', lvl: 3 }, { id: 'null_edge', lvl: 6 },
    ],
  },
  wisp: {
    name: 'WISP', title: 'Logged-In Ghost', model: 'wisp', color: '#4ff0ff',
    base: { hp: 220, mp: 90, atk: 16, mag: 36, def: 12, res: 22, spd: 15 },
    growth: { hp: 24, mp: 9, atk: 1.5, mag: 4.2, def: 1.4, res: 2.4, spd: 0.6 },
    skills: [
      { id: 'glitch_bolt', lvl: 1 }, { id: 'pyrefly_mend', lvl: 1 }, { id: 'datamosh', lvl: 2 },
      { id: 'rift_burst', lvl: 4 }, { id: 'resync', lvl: 5 },
    ],
  },
  hex: {
    name: 'HEX', title: 'Harmonixer', model: 'hex', color: '#ff7a2a',
    base: { hp: 400, mp: 30, atk: 40, mag: 18, def: 22, res: 14, spd: 9 },
    growth: { hp: 44, mp: 3, atk: 4.6, mag: 1.6, def: 2.6, res: 1.6, spd: 0.4 },
    skills: [
      { id: 'harmonix_claw', lvl: 1 }, { id: 'vermilion_fusion', lvl: 1 }, { id: 'malice_howl', lvl: 5 },
    ],
  },
};

// kind: phys | mag | heal | revive | buff | debuff
// target: enemy | enemies | ally | allies | self | ally_dead
// ring: Judgment Ring zones (0 = no ring). rank: CTB delay multiplier.
export const SKILLS = {
  attack:          { name: 'Attack', kind: 'phys', target: 'enemy', power: 1.0, mp: 0, ring: 3, rank: 1 },
  severance:       { name: 'Severance', kind: 'phys', target: 'enemy', power: 1.9, mp: 8, ring: 1, rank: 1.1, fx: 'slash', desc: 'A single cut that ignores the flesh and hits the signal beneath.' },
  gravity_rend:    { name: 'Gravity Rend', kind: 'phys', target: 'enemies', power: 1.15, mp: 16, ring: 1, rank: 1.3, fx: 'gravity', desc: 'Collapses local gravity on every enemy.' },
  null_edge:       { name: 'Null Edge', kind: 'phys', target: 'enemy', power: 3.1, mp: 26, ring: 2, rank: 1.5, pierce: true, fx: 'slash', desc: 'Pierces defense. Two ring zones.' },
  glitch_bolt:     { name: 'Glitch Bolt', kind: 'mag', target: 'enemy', power: 1.7, mp: 6, ring: 1, rank: 1, fx: 'bolt', desc: 'A corrupted packet fired into the target.' },
  pyrefly_mend:    { name: 'Pyrefly Mend', kind: 'heal', target: 'ally', power: 1.6, flat: 60, mp: 10, ring: 1, rank: 1, fx: 'heal', desc: 'Drifting lights knit an ally back together.' },
  datamosh:        { name: 'Datamosh', kind: 'debuff', target: 'enemy', mp: 12, ring: 1, rank: 0.9, delay: 45, stat: 'def', amount: 0.7, turns: 3, fx: 'bolt', desc: 'Smears an enemy: lowers DEF and pushes back its turn.' },
  rift_burst:      { name: 'Rift Burst', kind: 'mag', target: 'enemies', power: 1.35, mp: 20, ring: 1, rank: 1.3, fx: 'rift', desc: 'Tears the world open under every enemy.' },
  resync:          { name: 'Resync', kind: 'revive', target: 'ally_dead', power: 0.5, mp: 24, ring: 0, rank: 1.2, fx: 'heal', desc: 'Reconnects a fallen ally at half HP.' },
  harmonix_claw:   { name: 'Harmonix Claw', kind: 'phys', target: 'enemy', power: 2.2, mp: 10, ring: 1, rank: 1.2, fx: 'claw', desc: 'The thing in his arm strikes for him.' },
  vermilion_fusion:{ name: 'Fusion: Vermilion', kind: 'buff', target: 'self', mp: 14, ring: 0, rank: 0.8, stat: 'atk', amount: 1.6, turns: 3, fx: 'fusion', desc: 'Lets the demon closer. ATK up for 3 turns.' },
  malice_howl:     { name: 'Malice Howl', kind: 'phys', target: 'enemies', power: 0.95, mp: 18, ring: 1, rank: 1.3, drain: 0.35, fx: 'gravity', desc: 'Hits all enemies and drains part of the damage.' },
  // enemy skills
  static_lash:     { name: 'Static Lash', kind: 'mag', target: 'enemy', power: 1.3, fx: 'bolt' },
  halo_drip:       { name: 'Halo Drip', kind: 'mag', target: 'enemies', power: 0.8, fx: 'rift' },
  scale_storm:     { name: 'Scale Storm', kind: 'mag', target: 'enemies', power: 0.7, delay: 20, fx: 'rift' },
  lull:            { name: 'Lull', kind: 'heal', target: 'ally', power: 1.2, flat: 40, fx: 'heal' },
  gravity_cannon:  { name: 'Gravity Cannon', kind: 'mag', target: 'enemy', power: 2.2, fx: 'gravity' },
  halo_collapse:   { name: 'Halo Collapse', kind: 'mag', target: 'enemies', power: 1.0, fx: 'rift' },
  seal:            { name: 'Seal of the Warden', kind: 'buff', target: 'self', stat: 'def', amount: 1.5, turns: 3, fx: 'fusion' },
  liturgy_charge:  { name: 'Null Liturgy — charging', kind: 'charge', target: 'self', fx: 'fusion' },
  null_liturgy:    { name: 'Null Liturgy', kind: 'mag', target: 'enemies', power: 2.0, fx: 'rift' },
};

export const ITEMS = {
  tonic:   { name: 'Pyre Tonic', desc: 'Restores 150 HP.', target: 'ally', hp: 150 },
  ether:   { name: 'Ether Shard', desc: 'Restores 40 MP.', target: 'ally', mp: 40 },
  phoenix: { name: 'Phoenix Cable', desc: 'Revives a fallen ally at 40% HP.', target: 'ally_dead', revive: 0.4 },
  elixir:  { name: 'Unwritten Elixir', desc: 'Fully restores one ally.', target: 'ally', full: true },
};

export const ENEMIES = {
  wraith: {
    name: 'Cable Wraith', model: 'wraith', scale: 1, hp: 150, mp: 99, atk: 24, mag: 20, def: 8, res: 10, spd: 13, xp: 42,
    drops: [['tonic', 0.3]], ai: [['attack', 0.6], ['static_lash', 0.4]], scan: 'A maintenance ghost that forgot what it was maintaining.',
  },
  saint: {
    name: 'Silicate Saint', model: 'saint', scale: 1, hp: 330, mp: 99, atk: 28, mag: 30, def: 16, res: 18, spd: 8, xp: 95,
    drops: [['ether', 0.35]], ai: [['attack', 0.45], ['halo_drip', 0.55]], scan: 'Silicon-life pilgrim. Its halo leaks.', pix: 'enemy_silicate_saint',
  },
  moth: {
    name: 'Cocoon Moth', model: 'moth', scale: 1.1, hp: 270, mp: 99, atk: 20, mag: 34, def: 10, res: 20, spd: 16, xp: 85,
    drops: [['phoenix', 0.2]], ai: [['attack', 0.35], ['scale_storm', 0.45], ['lull', 0.2]], scan: 'It dreams inside the glass. Its wings are static.', pix: 'enemy_cocoon_moth',
  },
  warden: {
    name: 'THE WARDEN', model: 'warden', scale: 1, hp: 3400, mp: 999, atk: 46, mag: 42, def: 24, res: 22, spd: 10, xp: 1200, boss: true,
    drops: [], ai: [['attack', 0.35], ['gravity_cannon', 0.3], ['halo_collapse', 0.25], ['seal', 0.1]], scan: 'Keeper of the sealed strata. Built to forbid ascent.',
  },
};

export const GROUPS = {
  wraiths_2: ['wraith', 'wraith'],
  saint_1: ['saint'],
  saint_wraith: ['saint', 'wraith'],
  moth_1: ['moth'],
  wraiths_3: ['wraith', 'wraith', 'wraith'],
  moth_saint: ['moth', 'saint'],
  warden: ['warden'],
};

export const XP_CURVE = (lvl) => Math.round(80 * Math.pow(lvl, 1.55));
export const MAX_LEVEL = 30;

export function heroStats(id, lvl) {
  const h = HEROES[id];
  const s = {};
  for (const k in h.base) s[k] = Math.round(h.base[k] + h.growth[k] * (lvl - 1));
  return s;
}

// Dialogue: speaker ids map to portraits; 'sys' is narration.
export const SPEAKERS = {
  sable: { name: 'SABLE', color: '#ff2a4a' },
  wisp: { name: 'WISP', color: '#4ff0ff' },
  hex: { name: 'HEX', color: '#ff7a2a' },
  echo: { name: 'ECHO OF A SAINT', color: '#9fe3e8' },
  warden: { name: 'THE WARDEN', color: '#ff2a4a' },
  sys: { name: '', color: '#8a8f99' },
};

export const DIALOGUE = {
  intro: [
    ['sys', 'The Spire does not end. It was never meant to.'],
    ['sys', 'Below, a signal is dying. Above, something is keeping it from dying faster.'],
    ['sable', '...Cold. The floor is humming again.'],
    ['sable', 'No memory past the fall. Just this blade — and a halo that won\'t stop cracking.'],
  ],
  echo_landing: [
    ['echo', 'Another one wakes. Listen, severed one — this may be the last story the Spire has left to tell.'],
    ['echo', 'The Warden sealed the upper strata. Nothing ascends. Nothing is allowed to finish.'],
    ['echo', 'Rest at the spheres of light. They remember you, even when you do not.'],
    ['sable', 'And if I climb anyway?'],
    ['echo', 'Then climb quickly. The static rain is getting heavier.'],
  ],
  meet_wisp: [
    ['wisp', 'Whoa — you\'re not an NPC. You\'ve got collision.'],
    ['sable', 'Who are you?'],
    ['wisp', 'Wisp. Player. I logged in to a world that was supposed to be a game, and the logout button is just... gone.'],
    ['wisp', 'Every system here is corrupted. But corruption is just data nobody\'s reading yet. I can read it.'],
    ['sable', 'I\'m going up. To the Warden.'],
    ['wisp', 'Then I\'m in your party. Don\'t argue — my healing\'s the only thing between you and a respawn that doesn\'t exist.'],
    ['sys', 'WISP joined the party.'],
  ],
  meet_hex: [
    ['hex', 'Stay back. The arm doesn\'t like strangers. Neither do I.'],
    ['sable', 'That thing is fused to you.'],
    ['hex', 'I took a demon in to survive the lower strata. Now it takes a little of me every fight. Malice, the saints call it.'],
    ['hex', 'The Warden sealed the way up — and the way out of this curse is somewhere above.'],
    ['hex', '...Fine. I\'ll walk with you. If my eyes go red, stand behind me.'],
    ['sys', 'HEX joined the party.'],
  ],
  warden_pre: [
    ['warden', 'ASCENT IS FORBIDDEN.'],
    ['warden', 'Every story that finishes, ends. I keep them from ending. I am mercy with a gravity cannon.'],
    ['sable', 'A story that never ends is just a cage.'],
    ['warden', 'THEN BE CAGED.'],
  ],
  warden_post: [
    ['warden', '...The seal... breaks... the strata will... remember...'],
    ['sys', 'The halos above the Sanctum go dark, one after another. Somewhere far above, a door that was never meant to open, opens.'],
    ['sable', 'It keeps going. Up.'],
    ['sys', 'END OF THE LOWER STRATA — thank you for playing.'],
  ],
  save: [['sys', 'A sphere of light. Its hum steadies your pulse. HP and MP restored.']],
  locked: [['sys', 'The Sanctum hums behind a membrane of static. Something above is waiting.']],
};

// Credits/tribute card shown after the boss.
export const TRIBUTE = [
  'Final Fantasy X', 'Shadow Hearts', 'Kingdom Hearts', '.hack', 'Cocoon',
  'Grandia', 'Chrono Trigger', 'Star Ocean',
];
