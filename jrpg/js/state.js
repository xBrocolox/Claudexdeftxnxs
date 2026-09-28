// Persistent game state + save/load (localStorage).
import { HEROES, heroStats, XP_CURVE, MAX_LEVEL, ITEMS } from './data.js';

const KEY = 'vestige-null-save-v1';
const SETTINGS_KEY = 'vestige-null-settings-v1';

export const State = {
  party: {},        // id -> { lvl, xp, hp, mp }
  order: [],        // active party ids in join order
  items: {},
  flags: {},
  defeated: [],     // field enemy ids
  opened: [],       // chest ids
  pos: null,        // { x, z, rot }
  playtime: 0,
};

export const Settings = { autoRing: false, volume: 0.6, crt: true };

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

export function loadSettings() {
  const s = safe(() => JSON.parse(localStorage.getItem(SETTINGS_KEY)), null);
  if (s) Object.assign(Settings, s);
}
export function saveSettings() {
  safe(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(Settings)));
}

export function newGame() {
  Object.assign(State, {
    party: {}, order: [], items: { tonic: 3, ether: 1, phoenix: 1 }, flags: {},
    defeated: [], opened: [], pos: null, playtime: 0,
  });
  addHero('sable', 1);
}

export function addHero(id, lvl) {
  if (State.party[id]) return;
  const avg = State.order.length
    ? Math.max(1, Math.round(State.order.reduce((a, k) => a + State.party[k].lvl, 0) / State.order.length))
    : 1;
  const L = lvl || avg;
  const s = heroStats(id, L);
  State.party[id] = { lvl: L, xp: 0, hp: s.hp, mp: s.mp };
  State.order.push(id);
}

export function stats(id) {
  return heroStats(id, State.party[id].lvl);
}

export function healAll() {
  for (const id of State.order) {
    const s = stats(id);
    State.party[id].hp = s.hp;
    State.party[id].mp = s.mp;
  }
}

/** Grants XP to living members; returns [{id, from, to}] level-ups. */
export function grantXP(amount, alive) {
  const ups = [];
  for (const id of State.order) {
    const m = State.party[id];
    const share = alive.includes(id) ? amount : Math.round(amount * 0.5);
    m.xp += share;
    const from = m.lvl;
    while (m.lvl < MAX_LEVEL && m.xp >= XP_CURVE(m.lvl)) {
      m.xp -= XP_CURVE(m.lvl);
      const before = stats(id);
      m.lvl++;
      const after = stats(id);
      m.hp = Math.min(after.hp, m.hp + (after.hp - before.hp));
      m.mp = Math.min(after.mp, m.mp + (after.mp - before.mp));
    }
    if (m.lvl > from) ups.push({ id, from, to: m.lvl });
  }
  return ups;
}

export function addItem(id, n = 1) {
  State.items[id] = (State.items[id] || 0) + n;
}

export function useItem(id) {
  if (!State.items[id]) return false;
  State.items[id]--;
  if (!State.items[id]) delete State.items[id];
  return true;
}

export function hasSave() {
  return !!safe(() => localStorage.getItem(KEY), null);
}

export function save() {
  safe(() => localStorage.setItem(KEY, JSON.stringify(State)));
}

export function load() {
  const s = safe(() => JSON.parse(localStorage.getItem(KEY)), null);
  if (!s) return false;
  Object.assign(State, s);
  return true;
}

export function knownSkills(id) {
  return HEROES[id].skills.filter((s) => State.party[id].lvl >= s.lvl).map((s) => s.id);
}

export function itemList() {
  return Object.entries(State.items).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, ...ITEMS[id] }));
}
