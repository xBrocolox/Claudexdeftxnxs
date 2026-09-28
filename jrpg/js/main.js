// VESTIGE//NULL — boot, main loop and mode transitions.
import * as THREE from 'three';
import { Post } from './post.js';
import { Assets } from './assets.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Field } from './field.js';
import { Battle } from './battle.js';
import { DIALOGUE, HEROES, ITEMS, TRIBUTE, GROUPS, ENEMIES, XP_CURVE } from './data.js';
import { State, Settings, newGame, load, hasSave, stats, loadSettings, saveSettings, itemList, useItem, save, addHero } from './state.js';

const G = {
  mode: 'loading', lock: false, time: 0,
  renderer: null, post: null, field: null, battle: null, level: null,
};
window.VESTIGE = G; // handy for debugging from the console
G.State = State;
G.addHero = (id) => { addHero(id); G.field?.syncParty(); };

async function boot() {
  loadSettings();
  const canvas = document.getElementById('gl');
  G.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  G.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  G.renderer.toneMappingExposure = 1.15;
  G.post = new Post(G.renderer);
  G.post.u.crt.value = Settings.crt ? 1 : 0;
  Input.init();
  UI.init();

  const bar = document.querySelector('#loading i');
  G.level = await (await fetch('data/level.json')).json();
  await Assets.load((p) => { bar.style.width = `${p * 100}%`; });
  Assets.makePortraits(G.renderer);

  newGame();
  G.field = new Field(G, G.level);
  G.battle = new Battle(G);
  document.getElementById('loading').classList.add('done');
  addEventListener('resize', () => { G.post.resize(); G.field.onResize(); G.battle.onResize(); });
  // pause the loop while the tab is hidden
  document.addEventListener('visibilitychange', () => { clock.getDelta(); });

  title();
  requestAnimationFrame(loop);
}

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  G.time += dt;
  Input.update();
  UI.update(dt);
  let scene, cam;
  if (G.mode === 'battle') { G.battle.update(dt, G.time); scene = G.battle.scene; cam = G.battle.camera; }
  else if (G.mode === 'title') { titleCam(dt); G.field.sky.userData.update(dt, G.time); G.field.motes.forEach((m) => m.userData.update(dt, G.time)); G.field.rain.userData.update(dt, G.time, G.field.camera.position); scene = G.field.scene; cam = G.field.camera; }
  else if (G.field) {
    if (G.mode === 'field') { G.field.update(dt, G.time); State.playtime += dt; }
    scene = G.field.scene; cam = G.field.camera;
  }
  if (scene) G.post.render(scene, cam, dt, G.time);
  Input.endFrame();
}

// ---------------------------------------------------------------- title
let titleT = 0;
function titleCam(dt) {
  titleT += dt * 0.04;
  const c = G.field.camera;
  c.position.set(Math.sin(titleT) * 26, 16 + Math.sin(titleT * 1.7) * 3, -40 + Math.cos(titleT) * 38);
  c.lookAt(0, 4, -70);
}

async function title() {
  G.mode = 'title';
  G.field.player.visible = false;
  const t = document.getElementById('title');
  t.classList.add('on');
  const cont = hasSave();
  while (true) {
    const v = await UI.menu([
      { label: 'NEW GAME', value: 'new' },
      { label: 'CONTINUE', value: 'continue', disabled: !cont },
      { label: 'SETTINGS', value: 'settings' },
    ], { cls: 'title-menu', allowBack: false, parent: t });
    Audio.unlock();
    Audio.music('title');
    if (v === 'settings') { await settingsMenu(t); continue; }
    t.classList.remove('on');
    G.post.glitch(1);
    Audio.sfx('encounter');
    await UI.fade(true, 700);
    if (v === 'continue' && load()) { rebuildField(); await UI.fade(false, 700); G.mode = 'field'; G.field.enter(); UI.toast('Story resumed.'); }
    else { newGame(); rebuildField(); await UI.fade(false, 900); G.mode = 'field'; G.field.enter(); G.lock = true; await UI.say(DIALOGUE.intro); G.lock = false; }
    return;
  }
}

function rebuildField() {
  G.field = new Field(G, G.level);
  G.field.onResize();
}

async function settingsMenu(parent) {
  while (true) {
    const v = await UI.menu([
      { label: 'Judgment Ring', sub: Settings.autoRing ? 'AUTO' : 'MANUAL', value: 'ring', info: 'AUTO plays the timing ring for you.' },
      { label: 'CRT / Grain', sub: Settings.crt ? 'ON' : 'OFF', value: 'crt' },
      { label: 'Volume', sub: Math.round(Settings.volume * 100) + '%', value: 'vol' },
      { label: 'Back', value: null },
    ], { title: 'SETTINGS', parent, cls: 'settings' });
    if (v === 'ring') Settings.autoRing = !Settings.autoRing;
    else if (v === 'crt') { Settings.crt = !Settings.crt; G.post.u.crt.value = Settings.crt ? 1 : 0; }
    else if (v === 'vol') { Settings.volume = Settings.volume >= 1 ? 0 : Math.round((Settings.volume + 0.2) * 10) / 10; Audio.setVolume(Settings.volume); }
    else { saveSettings(); return; }
    saveSettings();
  }
}

// ---------------------------------------------------------------- battle transitions
G.startBattle = async (group, opts = {}) => {
  if (G.mode !== 'field') return;
  G.mode = 'transition';
  UI.hint(null);
  G.field.savePos();
  Audio.music(null);
  Audio.sfx('encounter');
  G.post.glitch(1.2);
  // encounter splash: PixVerse apparition if generated, else the glitched portrait
  const lead = ENEMIES[GROUPS[group][0]];
  const splash = document.getElementById('splash');
  const pix = lead.pix && Assets.pix.sheets[lead.pix];
  splash.innerHTML = `<img src="${pix?.poster ? 'assets/pixverse/' + pix.poster : Assets.portraits[GROUPS[group][0] === 'warden' ? 'warden' : GROUPS[group][0]]}" alt=""><span data-text="${lead.name}">${lead.name}</span>`;
  splash.classList.add('on');
  await new Promise((r) => setTimeout(r, 650));
  await UI.fade(true, 250);
  splash.classList.remove('on');
  G.mode = 'battle';
  const p = G.battle.run(group, opts);
  await UI.fade(false, 300);
  const result = await p;
  await UI.fade(true, 500);
  G.mode = 'transition';

  if (result === 'win') {
    if (opts.fieldEnemy) { State.defeated.push(opts.fieldEnemy); G.field.removeEnemy(opts.fieldEnemy); }
    if (opts.boss) { State.defeated.push('warden'); G.field.removeBoss(); await UI.fade(false, 600); G.mode = 'field'; G.field.enter(); return ending(); }
  } else if (result === 'flee') {
    if (opts.fieldEnemy) G.field.stunEnemy(opts.fieldEnemy);
  } else if (result === 'lose') {
    return gameOver();
  }
  // fallen members get back up with 1 HP after battle
  for (const id of State.order) if (State.party[id].hp <= 0) State.party[id].hp = 1;
  G.mode = 'field';
  G.field.enter();
  await UI.fade(false, 500);
};

async function gameOver() {
  G.post.glitch(1.5);
  Audio.music(null);
  const p = UI.panel('<h2 class="lost" data-text="SIGNAL LOST">SIGNAL LOST</h2><p>The Spire forgets you. It has done this before.</p>', 'gameover');
  await UI.fade(false, 600);
  const v = await UI.menu([
    { label: 'Continue from last save', value: 'load', disabled: !hasSave() },
    { label: 'Return to title', value: 'title' },
  ], { allowBack: false, parent: p });
  await UI.fade(true, 500);
  p.remove();
  if (v === 'load' && load()) { rebuildField(); G.mode = 'field'; G.field.enter(); await UI.fade(false, 600); }
  else { newGame(); rebuildField(); await UI.fade(false, 300); title(); }
}

async function ending() {
  G.lock = true;
  await UI.say(DIALOGUE.warden_post);
  State.flags.cleared = true;
  save();
  await UI.fade(true, 1200);
  const p = UI.panel(`<h2 data-text="VESTIGE//NULL">VESTIGE//NULL</h2>
    <p class="cred">A darkcore tribute. Models, rigs and animation built in Blender; world, battles and shaders in three.js.</p>
    <p class="cred dim">In loving memory of the nights spent with</p>
    <div class="tribute">${TRIBUTE.map((t) => `<span>${t}</span>`).join('')}</div>
    <p class="cred dim">Art direction after darkcore / glitchcore, deftxnxs and the megastructures of Tsutomu Nihei.</p>
    <div class="res-hint">Press <b>E</b></div>`, 'credits');
  await UI.fade(false, 800);
  await UI.waitOk();
  await UI.fade(true, 800);
  p.remove();
  G.lock = false;
  rebuildField();
  await UI.fade(false, 400);
  title();
}

// ---------------------------------------------------------------- pause menu
G.pauseMenu = async () => {
  G.lock = true;
  Audio.sfx('ok');
  const panel = UI.panel('', 'pause');
  const draw = () => {
    panel.innerHTML = `<div class="pause-party">${State.order.map((id) => {
      const s = stats(id), m = State.party[id], h = HEROES[id];
      return `<div class="pp"><img src="${Assets.portraits[id]}" alt=""><div><div class="pc-name" style="color:${h.color}">${h.name} <span class="pc-lv">LV ${m.lvl}</span></div>
        <div class="pp-title">${h.title}</div>
        <div class="bar hp"><i style="width:${m.hp / s.hp * 100}%"></i><span>${m.hp}/${s.hp}</span></div>
        <div class="bar mp"><i style="width:${m.mp / s.mp * 100}%"></i><span>${m.mp}/${s.mp}</span></div>
        <div class="pp-stats">ATK ${s.atk} · MAG ${s.mag} · DEF ${s.def} · RES ${s.res} · SPD ${s.spd}</div>
        <div class="pp-xp">NEXT ${XP_CURVE(m.lvl) - m.xp} XP</div></div></div>`;
    }).join('')}</div><div class="pause-side"></div>
    <div class="pause-foot">${Math.floor(State.playtime / 60)}m played · ${G.level.name}</div>`;
  };
  draw();
  while (true) {
    const v = await UI.menu([
      { label: 'Items', value: 'items', disabled: !itemList().length },
      { label: 'Settings', value: 'settings' },
      { label: 'Controls', value: 'controls' },
      { label: 'Close', value: null },
    ], { title: 'MENU', parent: panel.querySelector('.pause-side') });
    if (v === 'items') {
      const iid = await UI.menu(itemList().map((it) => ({ label: it.name, sub: '×' + it.n, value: it.id, info: it.desc })), { title: 'ITEMS', parent: panel.querySelector('.pause-side') });
      if (!iid) continue;
      const it = ITEMS[iid];
      const who = await UI.menu(State.order.map((id) => ({ label: HEROES[id].name, value: id,
        disabled: it.target === 'ally_dead' ? State.party[id].hp > 0 : State.party[id].hp <= 0 })), { title: 'USE ON', parent: panel.querySelector('.pause-side') });
      if (!who) continue;
      const m = State.party[who], s = stats(who);
      useItem(iid);
      if (it.hp) m.hp = Math.min(s.hp, m.hp + it.hp);
      if (it.mp) m.mp = Math.min(s.mp, m.mp + it.mp);
      if (it.revive) m.hp = Math.round(s.hp * it.revive);
      if (it.full) { m.hp = s.hp; m.mp = s.mp; }
      Audio.sfx('heal');
      draw();
    } else if (v === 'settings') await settingsMenu(panel.querySelector('.pause-side'));
    else if (v === 'controls') {
      await UI.say([['sys', 'Move: WASD / arrows / left stick. Hold Shift to walk. Camera: drag, or Q / R.'],
        ['sys', 'Confirm / talk: E, Space or Enter. Back: Esc or X. Menu: M or Tab.'],
        ['sys', 'In battle, press confirm as the Judgment Ring needle crosses each zone. The red edge is a STRIKE.']]);
    } else break;
  }
  panel.remove();
  G.lock = false;
};

boot().catch((e) => {
  console.error(e);
  document.querySelector('#loading .l-text').textContent = 'SIGNAL CORRUPTED — ' + e.message;
});
