// Battle: Conditional Turn-Based order (FFX), Judgment Ring timing (Shadow
// Hearts), run-up melee with camera work, magic FX, boss phases.
import * as THREE from 'three';
import { Assets } from './assets.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { FX, makeSky, makePyreflies, blobShadow, makeVideoBackdrop } from './fx.js';
import { HEROES, SKILLS, ITEMS, ENEMIES, GROUPS } from './data.js';
import { State, Settings, stats, knownSkills, itemList, useItem, grantXP, addItem } from './state.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pickWeighted = (list) => {
  let r = Math.random() * list.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of list) { r -= w; if (r <= 0) return v; }
  return list[0][0];
};

class Unit {
  constructor(o) {
    Object.assign(this, o);
    this.buffs = [];
    this.guarding = false;
    this.ct = 0;
  }
  get alive() { return this.hp > 0; }
  stat(k) {
    let v = this.max[k];
    for (const b of this.buffs) if (b.stat === k) v *= b.amount;
    return v;
  }
  statusText() {
    const s = [];
    if (this.guarding) s.push('<b class="st-g">GUARD</b>');
    for (const b of this.buffs) s.push(`<b class="${b.amount > 1 ? 'st-up' : 'st-down'}">${b.stat.toUpperCase()}${b.amount > 1 ? '▲' : '▼'}${b.turns}</b>`);
    if (this.charging) s.push('<b class="st-down">CHARGING</b>');
    return s.join(' ');
  }
  head() {
    const v = new THREE.Vector3();
    this.actor.root.getWorldPosition(v);
    v.y += this.height;
    return v;
  }
}

export class Battle {
  constructor(G) {
    this.G = G;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#050305', 0.007);
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1500);
    this.camTarget = { pos: new THREE.Vector3(7, 4, 9), look: new THREE.Vector3(0, 1, 0) };
    this.camLook = new THREE.Vector3();
    this.shake = 0;
    this.tweens = [];
    this.build();
    this.raycaster = new THREE.Raycaster();
    G.renderer.domElement.addEventListener('pointerdown', (e) => this.onClick(e));
  }

  build() {
    const s = this.scene;
    this.sky = makeSky({ top: '#030203', horizon: '#26090f', glowColor: '#4ff0ff' });
    s.add(this.sky);
    const vb = makeVideoBackdrop('env_null_shore', { radius: 220, height: 200, y: 30, opacity: 0.6 });
    if (vb) { vb.rotation.y = Math.PI; s.add(vb); }
    s.add(Assets.scene('arena'));
    s.add(new THREE.HemisphereLight('#7d98a8', '#1a0a0e', 0.9));
    const key = new THREE.DirectionalLight('#cfe8ff', 2.6); key.position.set(6, 12, 10); s.add(key);
    const fill = new THREE.SpotLight('#9fdcff', 60, 30, 0.6, 0.8); fill.position.set(0, 9, 9); fill.target.position.set(0, 1, 0); s.add(fill, fill.target);
    const rim = new THREE.DirectionalLight('#ff2a4a', 1.6); rim.position.set(-8, 4, -12); s.add(rim);
    this.motes = makePyreflies(120, new THREE.Vector3(0, -1, 0), 30, 14);
    s.add(this.motes);
    this.fx = new FX(s);
    this.marker = new THREE.Group();
    const mm = new THREE.MeshBasicMaterial({ color: '#4ff0ff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    this.markerMeshes = [];
    s.add(this.marker);
    this.markerMat = mm;
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.35, 4), new THREE.MeshBasicMaterial({ color: '#ff2a4a' }));
    this.arrow.rotation.x = Math.PI;
    this.arrow.visible = false;
    s.add(this.arrow);
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- setup
  setup(groupId, opts) {
    this.opts = opts;
    this.boss = !!opts.boss;
    this.over = false;
    this.phase2 = false;
    this.turnCount = 0;
    this.units?.forEach((u) => { this.scene.remove(u.actor.root); u.actor.dispose(); });
    this.units = [];
    const ids = State.order;
    ids.forEach((id, i) => {
      const h = HEROES[id], m = State.party[id], st = stats(id);
      const a = Assets.actor(h.model);
      const x = (i - (ids.length - 1) / 2) * 2.3;
      a.root.position.set(x, 0, 3.4);
      a.root.rotation.y = Math.PI;
      a.root.add(blobShadow());
      this.scene.add(a.root);
      const u = new Unit({ id, side: 'party', name: h.name, color: h.color, portrait: id, actor: a, max: st, hp: m.hp, mp: m.mp, lvl: m.lvl, height: 1.9 });
      u.home = a.root.position.clone();
      if (u.hp <= 0) { a.play('death', { once: true }); a.mixer.update(5); } else a.play('idle');
      this.units.push(u);
    });
    const group = GROUPS[groupId];
    const slots = group.length === 1 ? [[0, -3.6]] : group.length === 2 ? [[-1.9, -3.3], [1.9, -3.3]] : [[-2.8, -3.1], [0, -4.1], [2.8, -3.1]];
    const counts = {};
    group.forEach((eid, i) => {
      const e = ENEMIES[eid];
      const a = Assets.actor(e.model);
      a.root.scale.setScalar(e.scale);
      const [x, z] = slots[i];
      a.root.position.set(x, 0, this.boss ? -4.8 : z);
      a.root.add(blobShadow(this.boss ? 1.6 : 0.7));
      if (e.model === 'saint_ghost') a.setOpacity(0.6);
      this.scene.add(a.root);
      a.play('idle');
      counts[eid] = (counts[eid] || 0) + 1;
      const letter = group.filter((g) => g === eid).length > 1 ? ' ' + String.fromCharCode(64 + counts[eid]) : '';
      const u = new Unit({ id: eid, side: 'enemy', name: e.name + letter, color: '#c9ced6', portrait: eid === 'warden' ? 'warden' : eid, actor: a,
        max: { hp: e.hp, mp: e.mp, atk: e.atk, mag: e.mag, def: e.def, res: e.res, spd: e.spd }, hp: e.hp, mp: e.mp, def: e, height: e.model === 'warden' ? 3.9 : e.model === 'saint' ? 2.9 : 2.2 });
      u.home = a.root.position.clone();
      this.units.push(u);
    });
    // PixVerse apparition looming behind the enemy line (if generated)
    if (this.apparition) { this.scene.remove(this.apparition.root); this.apparition = null; }
    const lead = group.map((g) => ENEMIES[g]).find((e) => e.pix && Assets.pix.cards[e.pix]);
    if (lead) {
      this.apparition = Assets.pixCard(lead.pix, { opacity: 0.28 });
      this.apparition.root.position.set(0, -1, -14);
      this.apparition.root.scale.setScalar(2.4);
      this.scene.add(this.apparition.root);
    }
    for (const u of this.units) u.ct = rand(0, 100 / u.stat('spd'));
    if (this.opts.boss) this.units.filter((u) => u.side === 'party').forEach((u) => { u.ct *= 0.5; });
  }

  get party() { return this.units.filter((u) => u.side === 'party'); }
  get foes() { return this.units.filter((u) => u.side === 'enemy'); }

  // ---------------------------------------------------------------- CTB
  delay(u, rank = 1) { return rank * 100 / Math.max(1, u.stat('spd')); }

  nextUnit() {
    const live = this.units.filter((u) => u.alive);
    const u = live.reduce((a, b) => (b.ct < a.ct ? b : a));
    const dt = u.ct;
    for (const x of live) x.ct -= dt;
    return u;
  }

  preview(n = 10) {
    const live = this.units.filter((u) => u.alive).map((u) => ({ u, ct: u.ct }));
    const out = [];
    for (let i = 0; i < n && live.length; i++) {
      const m = live.reduce((a, b) => (b.ct < a.ct ? b : a));
      out.push(m.u);
      m.ct += this.delay(m.u);
    }
    return out;
  }

  refreshHud(active) {
    UI.updateParty(this.party, active);
    UI.updateCTB(this.preview());
  }

  // ---------------------------------------------------------------- run
  async run(groupId, opts) {
    this.setup(groupId, opts);
    Audio.music(this.boss ? 'boss' : 'battle');
    UI.battleHud(true);
    this.onResize();
    // intro sweep
    this.camera.position.set(0, 11, -16);
    this.camLook.set(0, 1, 0);
    this.overview();
    this.refreshHud();
    UI.banner(this.boss ? 'THE WARDEN' : 'ENCOUNTER', this.boss ? 'boss' : '');
    await this.wait(1.4);

    let result = null;
    while (!result) {
      const u = this.nextUnit();
      this.turnCount++;
      u.guarding = false;
      for (const b of u.buffs) b.turns--;
      u.buffs = u.buffs.filter((b) => b.turns > 0);
      this.refreshHud(u);
      const rank = u.side === 'party' ? await this.partyTurn(u) : await this.enemyTurn(u);
      if (rank === 'flee') { result = 'flee'; break; }
      u.ct = this.delay(u, rank || 1);
      this.refreshHud();
      if (this.foes.every((f) => !f.alive)) result = 'win';
      else if (this.party.every((p) => !p.alive)) result = 'lose';
      await this.wait(0.15);
    }
    // write HP/MP back to the save state
    for (const u of this.party) { State.party[u.id].hp = Math.max(0, Math.round(u.hp)); State.party[u.id].mp = Math.round(u.mp); }
    if (result === 'win') await this.victory();
    UI.battleHud(false);
    UI.caption(null);
    return result;
  }

  // ---------------------------------------------------------------- party turn
  async partyTurn(u) {
    this.focusParty(u);
    u.actor.flash(u.color, 0.5, 0.35);
    Audio.sfx('move');
    while (true) {
      const skills = knownSkills(u.id);
      const items = itemList();
      const cmd = await UI.menu([
        { label: 'Attack', value: 'attack', info: 'Judgment Ring: three zones. Hit the red edge to STRIKE.' },
        { label: 'Skills', value: 'skills', disabled: !skills.length, info: 'Signal arts. Cost MP.' },
        { label: 'Items', value: 'items', disabled: !items.length, info: 'Use an item.' },
        { label: 'Guard', value: 'guard', info: 'Halve damage until your next turn. Acts again sooner.' },
        { label: 'Flee', value: 'flee', disabled: this.boss, info: this.boss ? 'There is nowhere to run.' : 'Try to escape.' },
      ], { title: u.name, cls: 'cmd', allowBack: false });

      if (cmd === 'attack') {
        const t = await this.chooseTargets(u, 'enemy');
        if (!t) continue;
        return this.perform(u, 'attack', t);
      }
      if (cmd === 'skills') {
        const sid = await UI.menu(skills.map((id) => {
          const s = SKILLS[id];
          return { label: s.name, sub: `${s.mp} MP`, value: id, disabled: u.mp < s.mp || (s.target === 'ally_dead' && !this.party.some((p) => !p.alive)), info: s.desc };
        }), { title: 'SKILLS', cls: 'sub' });
        if (!sid) continue;
        const t = await this.chooseTargets(u, SKILLS[sid].target);
        if (!t) continue;
        return this.perform(u, sid, t);
      }
      if (cmd === 'items') {
        const iid = await UI.menu(items.map((it) => ({ label: it.name, sub: '×' + it.n, value: it.id, info: it.desc,
          disabled: it.target === 'ally_dead' && !this.party.some((p) => !p.alive) })), { title: 'ITEMS', cls: 'sub' });
        if (!iid) continue;
        const t = await this.chooseTargets(u, ITEMS[iid].target);
        if (!t) continue;
        return this.useItem(u, iid, t[0]);
      }
      if (cmd === 'guard') {
        u.guarding = true;
        u.actor.play('guard');
        this.fx.ring(u.home, '#4ff0ff', 0.4, 1.4, 0.5);
        Audio.sfx('ok');
        return 0.7;
      }
      if (cmd === 'flee') {
        if (Math.random() < 0.7) {
          UI.banner('ESCAPED');
          for (const p of this.party.filter((x) => x.alive)) { p.actor.root.rotation.y = 0; p.actor.play('run'); }
          await this.tween(0.8, (k) => { for (const p of this.party) if (p.alive) p.actor.root.position.z = p.home.z + k * 6; });
          return 'flee';
        }
        UI.banner('CAN\'T ESCAPE');
        Audio.sfx('miss');
        return 1;
      }
    }
  }

  async chooseTargets(u, kind) {
    let pool, all = false;
    if (kind === 'enemy' || kind === 'enemies') { pool = this.foes.filter((f) => f.alive); all = kind === 'enemies'; }
    else if (kind === 'ally' || kind === 'allies') { pool = this.party.filter((p) => p.alive); all = kind === 'allies'; }
    else if (kind === 'ally_dead') pool = this.party.filter((p) => !p.alive);
    else if (kind === 'self') return [u];
    if (!pool.length) return null;
    const res = await UI.pickTarget(pool, { all, onMove: (sel) => this.highlight(sel) });
    this.highlight([]);
    if (!res) return null;
    return Array.isArray(res) ? res : [res];
  }

  highlight(units) {
    this.marker.clear();
    this.arrow.visible = false;
    if (!units.length) { UI.caption(null); return; }
    for (const t of units) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.8, 32), this.markerMat);
      r.rotation.x = -Math.PI / 2;
      r.position.set(t.home.x, 0.04, t.home.z);
      this.marker.add(r);
    }
    if (units.length === 1) {
      const t = units[0];
      this.arrow.visible = true;
      this.arrow.position.copy(t.home).setY(t.height + 0.5);
      const pct = Math.max(0, t.hp) / t.max.hp;
      UI.caption(`<b>${t.name}</b> <span class="cap-hp"><i style="width:${pct * 100}%"></i></span> ${Math.max(0, Math.round(t.hp))}/${t.max.hp}${t.def?.scan ? `<em>${t.def.scan}</em>` : ''}`);
    } else UI.caption(`<b>ALL TARGETS</b>`);
  }

  onClick(e) {
    if (this.G.mode !== 'battle') return;
    const r = this.G.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(m, this.camera);
    for (const u of this.units) {
      if (this.raycaster.intersectObject(u.actor.root, true).length) { UI._pickClick?.(u); return; }
    }
  }

  // ---------------------------------------------------------------- actions
  async ringFor(u, zones) {
    if (u.side !== 'party' || !zones) return null;
    return UI.ring(zones, { auto: Settings.autoRing });
  }

  /** Multiplier from ring results for skills (single/double zone). */
  ringMult(res) {
    if (!res) return 1;
    if (!res.length || !res[0].hit) return 0.5;
    const hits = res.filter((r) => r.hit);
    return hits.reduce((a, r) => a + (r.strike ? 1.3 : 1), 0) / res.length * (hits.length === res.length ? 1 : 0.75);
  }

  async perform(u, sid, targets) {
    const s = SKILLS[sid];
    if (s.mp && u.side === 'party') u.mp -= s.mp;
    this.refreshHud(u);
    if (sid !== 'attack' && s.name) UI.banner(s.name, 'skill');

    if (s.kind === 'charge') {
      u.charging = true;
      u.actor.play('cast', { once: true }).then(() => u.actor.play('idle'));
      this.fx.pillar(u.home, '#ff2a4a', 1.4, 2);
      Audio.sfx('glitch');
      this.G.post.glitch(0.5);
      UI.caption('<b>The Warden gathers the Null Liturgy.</b><em>Guard before it resolves.</em>');
      await this.wait(1.6);
      UI.caption(null);
      return 0.6;
    }

    if (sid === 'attack') {
      const res = await this.ringFor(u, s.ring);
      await this.melee(u, targets[0], res, 1);
      return 1;
    }

    const mult = this.ringMult(await this.ringFor(u, s.ring));

    if (s.kind === 'phys') {
      if (targets.length === 1) {
        await this.melee(u, targets[0], null, s.power * mult, s);
      } else {
        await this.aoePhys(u, targets, s.power * mult, s);
      }
      return s.rank;
    }

    // spells, heals, buffs: cast in place
    this.focusCast(u, targets);
    u.actor.flash(s.kind === 'heal' || s.kind === 'revive' ? '#4ff0ff' : '#9b5cff', 0.6);
    Audio.sfx(s.kind === 'heal' || s.kind === 'revive' ? 'heal' : 'magic');
    const castDone = u.actor.play('cast', { once: true });
    this.fx.ring(u.home, '#9b5cff', 0.3, 1.6, 0.6);
    await this.wait(0.55);
    for (const t of targets) {
      const tp = t.home.clone().setY(1);
      if (s.kind === 'mag') {
        if (s.fx === 'bolt') this.fx.bolt(u.head(), tp, u.side === 'party' ? '#4ff0ff' : '#ff2a4a');
        else if (s.fx === 'gravity') { this.fx.pillar(t.home, '#4ff0ff', 0.7); this.fx.ring(t.home, '#4ff0ff', 3, 0.2, 0.5); }
        else this.fx.rift(t.home, u.side === 'party' ? '#9b5cff' : '#ff2a4a');
        const dmg = this.calc(u, t, 'mag', s.power * mult);
        this.damage(t, dmg, mult > 1.1);
        if (s.delay) t.ct += s.delay / 10;
      } else if (s.kind === 'heal') {
        this.fx.heal(t.home);
        const amt = Math.round(u.stat('mag') * s.power * 2 * mult + (s.flat || 0));
        this.heal(t, amt);
      } else if (s.kind === 'revive') {
        if (!t.alive) this.revive(t, s.power);
      } else if (s.kind === 'buff') {
        this.fx.pillar(t.home, s.stat === 'atk' ? '#ff2a4a' : '#4ff0ff', 0.9);
        t.buffs = t.buffs.filter((b) => b.stat !== s.stat);
        t.buffs.push({ stat: s.stat, amount: s.amount, turns: s.turns });
        t.actor.flash(s.stat === 'atk' ? '#ff2a4a' : '#4ff0ff', 1.2);
        this.popupAt(t, `${s.stat.toUpperCase()} ▲`, 'buff');
      } else if (s.kind === 'debuff') {
        this.fx.bolt(u.head(), tp, '#9b5cff');
        this.G.post.glitch(0.4);
        t.buffs = t.buffs.filter((b) => b.stat !== s.stat);
        t.buffs.push({ stat: s.stat, amount: s.amount, turns: s.turns });
        t.ct += (s.delay || 0) / Math.max(1, t.stat('spd')) * (mult);
        this.popupAt(t, `${s.stat.toUpperCase()} ▼  DELAY`, 'debuff');
      }
      await this.wait(targets.length > 1 ? 0.12 : 0.2);
    }
    await castDone;
    if (u.alive) u.actor.play('idle');
    await this.wait(0.5);
    return s.rank || 1;
  }

  async useItem(u, iid, t) {
    const it = ITEMS[iid];
    if (!useItem(iid)) return 1;
    UI.banner(it.name, 'skill');
    this.focusCast(u, [t]);
    const castDone = u.actor.play('cast', { once: true, speed: 1.6 });
    await this.wait(0.35);
    this.fx.heal(t.home);
    Audio.sfx('heal');
    if (it.revive && !t.alive) this.revive(t, it.revive);
    if (it.hp && t.alive) this.heal(t, it.hp);
    if (it.mp && t.alive) { t.mp = Math.min(t.max.mp, t.mp + it.mp); this.popupAt(t, `+${it.mp} MP`, 'mp'); }
    if (it.full && t.alive) { this.heal(t, t.max.hp); t.mp = t.max.mp; }
    await castDone;
    u.actor.play('idle');
    await this.wait(0.4);
    return 1;
  }

  calc(a, t, kind, power) {
    const off = kind === 'phys' ? a.stat('atk') : a.stat('mag');
    const df = kind === 'phys' ? t.stat('def') : t.stat('res');
    let d = off * power * 2.4 * 60 / (60 + df * 2) * rand(0.9, 1.1);
    if (t.guarding) d *= 0.5;
    return Math.max(1, Math.round(d));
  }

  damage(t, dmg, crit = false) {
    if (!t.alive) return;
    t.hp -= dmg;
    this.popupAt(t, String(dmg), crit ? 'crit' : t.side === 'party' ? 'hurt' : '');
    t.actor.flash(crit ? '#ff2a4a' : '#ffffff', 0.22, crit ? 0.9 : 0.6);
    this.fx.sparks(t.home.clone().setY(t.height * 0.55), crit ? '#ff2a4a' : '#bff9ff', crit ? 40 : 22);
    Audio.sfx(crit ? 'crit' : 'hit');
    this.shake = crit ? 0.35 : 0.18;
    if (crit) this.G.post.glitch(0.45);
    if (t.hp <= 0) {
      t.hp = 0;
      t.charging = false;
      t.buffs = [];
      t.actor.play('death', { once: true });
      if (t.side === 'enemy') {
        this.G.post.glitch(0.6);
        Audio.sfx('glitch');
        this.tween(1.2, (k) => { if (k > 0.4) t.actor.setOpacity(1 - (k - 0.4) / 0.6); }).then(() => { t.actor.root.visible = false; });
        this.fx.rift(t.home, '#4ff0ff');
      }
    } else {
      t.actor.play('hit', { once: true }).then(() => { if (t.alive) t.actor.play(t.guarding ? 'guard' : 'idle'); });
    }
    this.refreshHud();
  }

  heal(t, amt) {
    const before = t.hp;
    t.hp = Math.min(t.max.hp, t.hp + amt);
    this.popupAt(t, `+${Math.round(t.hp - before)}`, 'heal');
    t.actor.flash('#4ff0ff', 0.5);
    this.refreshHud();
  }

  revive(t, frac) {
    t.hp = Math.round(t.max.hp * frac);
    t.actor.root.visible = true;
    t.actor.setOpacity(1);
    t.actor.play('idle', { fade: 0.5 });
    t.ct = this.delay(t);
    this.popupAt(t, 'RESYNC', 'heal');
    this.fx.pillar(t.home, '#4ff0ff', 1.0);
    this.refreshHud();
  }

  popupAt(u, text, cls) {
    const p = u.head().project(this.camera);
    UI.popup((p.x * 0.5 + 0.5) * innerWidth + rand(-20, 20), (-p.y * 0.5 + 0.5) * innerHeight + rand(-10, 10), text, cls);
  }

  /** Run up, strike (once per ring hit), run back. */
  async melee(u, t, ringRes, power, skill = null) {
    const a = u.actor, start = u.home.clone();
    const dir = t.home.clone().sub(start).setY(0).normalize();
    const reach = t.side === 'enemy' && t.def?.boss ? 2.4 : 1.35;
    const dest = t.home.clone().addScaledVector(dir, -reach).setY(0);
    const face = Math.atan2(dir.x, dir.z);
    a.root.rotation.y = face;
    this.focusMelee(u, t);
    a.play('run');
    await this.tween(0.42, (k) => a.root.position.lerpVectors(start, dest, k * k * (3 - 2 * k)));

    let hits;
    if (ringRes) {
      if (!ringRes.length || !ringRes[0].hit) hits = [];
      else hits = ringRes.filter((r) => r.hit);
    } else hits = [{ hit: true, strike: false }];

    if (!hits.length) {
      a.play('attack', { once: true, speed: 1.2 });
      await this.wait(0.35);
      this.popupAt(t, 'MISS', 'miss');
      Audio.sfx('miss');
      await this.wait(0.45);
    } else {
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        const done = a.play('attack', { once: true, speed: hits.length > 1 ? 1.5 : 1.1 });
        a.current.time = 0.12;
        await this.wait(hits.length > 1 ? 0.22 : 0.33);
        const per = ringRes ? (h.strike ? 0.62 : 0.46) : power;
        const mult = ringRes ? per * power : power;
        let dmg = this.calc(u, t, 'phys', mult * (skill?.pierce ? 1.4 : 1));
        if (skill?.pierce) dmg = Math.round(dmg * 1.15);
        const fxc = u.side === 'party' ? (skill?.fx === 'claw' ? '#ff2a4a' : '#4ff0ff') : '#ff2a4a';
        this.fx.slash(t.home.clone().setY(t.height * 0.5), fxc);
        this.damage(t, dmg, h.strike);
        if (skill?.drain) this.heal(u, Math.round(dmg * skill.drain));
        await (i < hits.length - 1 ? this.wait(0.12) : done);
        if (!t.alive) break;
      }
    }
    a.play('run');
    a.root.rotation.y = face + Math.PI;
    await this.tween(0.38, (k) => a.root.position.lerpVectors(dest, start, k));
    a.root.rotation.y = u.side === 'party' ? Math.PI : 0;
    a.play('idle');
    this.overview();
  }

  async aoePhys(u, targets, power, s) {
    const a = u.actor;
    this.overview(true);
    a.play('attack', { once: true, speed: 0.9 });
    await this.tween(0.3, (k) => { a.root.position.y = Math.sin(k * Math.PI) * 1.2; });
    for (const t of targets) {
      this.fx.pillar(t.home, s.fx === 'gravity' ? '#4ff0ff' : '#ff2a4a', 0.6);
      this.fx.ring(t.home, '#4ff0ff', 0.2, 2.5, 0.5);
      const dmg = this.calc(u, t, 'phys', power);
      this.damage(t, dmg, power > s.power * 1.1);
      if (s.drain) this.heal(u, Math.round(dmg * s.drain));
      await this.wait(0.1);
    }
    this.G.post.glitch(0.4);
    await this.wait(0.6);
    a.play('idle');
  }

  // ---------------------------------------------------------------- enemy turn
  async enemyTurn(u) {
    const e = u.def;
    const targets = this.party.filter((p) => p.alive);
    this.focusEnemy(u);
    await this.wait(0.35);

    if (e.boss && !this.phase2 && u.hp < u.max.hp * 0.5) {
      this.phase2 = true;
      UI.banner('THE HALOS IGNITE', 'boss');
      this.G.post.glitch(1);
      Audio.sfx('encounter');
      u.buffs.push({ stat: 'spd', amount: 1.35, turns: 99 });
      this.fx.pillar(u.home, '#ff2a4a', 1.5, 2.5);
      await this.wait(1.4);
    }

    let sid;
    if (u.charging) { u.charging = false; sid = 'null_liturgy'; }
    else if (e.boss && this.phase2 && Math.random() < 0.3) sid = 'liturgy_charge';
    else sid = pickWeighted(e.ai);
    if (sid === 'lull' && !this.foes.some((f) => f.alive && f.hp < f.max.hp * 0.8)) sid = 'attack';

    let tg;
    const S = SKILLS[sid];
    if (S.target === 'enemies') tg = targets;
    else if (S.target === 'self') tg = [u];
    else if (S.target === 'ally') tg = [this.foes.filter((f) => f.alive).sort((a, b) => a.hp / a.max.hp - b.hp / b.max.hp)[0]];
    else tg = [targets.sort((a, b) => a.hp / a.max.hp - b.hp / b.max.hp + rand(-0.6, 0.6))[0]];
    return (await this.perform(u, sid, tg)) || 1;
  }

  // ---------------------------------------------------------------- results
  async victory() {
    UI.banner('VICTORY');
    document.getElementById('ctb')?.remove();
    Audio.music(null);
    Audio.sfx('levelup');
    const alive = this.party.filter((p) => p.alive);
    alive.forEach((p) => p.actor.play('victory', { once: true, clamp: true }));
    this.setCam(new THREE.Vector3(0.5, 2.3, 7.8), new THREE.Vector3(0, 1.3, 3));
    const xp = this.foes.reduce((a, f) => a + f.def.xp, 0);
    const drops = [];
    for (const f of this.foes) for (const [item, chance] of f.def.drops) if (Math.random() < chance) { addItem(item); drops.push(ITEMS[item].name); }
    const ups = grantXP(xp, alive.map((p) => p.id));
    await this.wait(1.2);
    const panel = UI.panel(`<h2 data-text="VICTORY">VICTORY</h2>
      <div class="res-row"><span>SIGNAL ABSORBED</span><b>${xp} XP</b></div>
      ${ups.map((u) => `<div class="res-row lv"><span>${HEROES[u.id].name}</span><b>LV ${u.from} → ${u.to}</b></div>`).join('')}
      ${drops.length ? `<div class="res-row"><span>RECOVERED</span><b>${drops.join(', ')}</b></div>` : ''}
      <div class="res-hint">Press <b>E</b> to continue</div>`, 'results');
    if (ups.length) Audio.sfx('levelup');
    await UI.waitOk();
    panel.remove();
  }

  // ---------------------------------------------------------------- camera
  setCam(pos, look) { this.camTarget.pos.copy(pos); this.camTarget.look.copy(look); }
  overview(high = false) { this.setCam(high ? new THREE.Vector3(0, 6, 9.5) : new THREE.Vector3(5.6, 3.1, 7.6), new THREE.Vector3(0, 1.2, -0.5)); }
  focusParty(u) { this.setCam(u.home.clone().add(new THREE.Vector3(u.home.x >= 0 ? 2.4 : -2.4, 2.2, 3.6)), new THREE.Vector3(u.home.x * 0.3, 1.3, -2.5)); }
  focusEnemy(u) { const b = u.def?.boss; this.setCam(new THREE.Vector3(u.home.x * 0.5 + (b ? 4 : 2.5), b ? 3.2 : 2.4, 5.5), u.home.clone().setY(b ? 2.6 : 1.4)); }
  focusCast(u, targets) {
    const c = targets.reduce((a, t) => a.add(t.home), new THREE.Vector3()).divideScalar(targets.length);
    const mid = c.clone().lerp(u.home, 0.5);
    this.setCam(mid.clone().add(new THREE.Vector3(6.5, 3.4, 2)), mid.clone().setY(1.2));
  }
  focusMelee(u, t) {
    const mid = u.home.clone().lerp(t.home, 0.6);
    const side = u.side === 'party' ? 1 : -1;
    this.setCam(mid.clone().add(new THREE.Vector3(4.2 * side, 2.2, 1.5 * side)), mid.clone().setY(1.2));
  }

  // ---------------------------------------------------------------- timing
  tween(dur, fn) {
    return new Promise((res) => this.tweens.push({ t: 0, dur, fn, res }));
  }
  wait(s) { return this.tween(s, () => {}); }

  update(dt, t) {
    this.tweens = this.tweens.filter((tw) => {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) { tw.res(); return false; }
      return true;
    });
    this.units?.forEach((u) => u.actor.update(dt));
    this.fx.update(dt);
    this.apparition?.update(dt);
    this.sky.userData.update(dt, t);
    this.motes.userData.update(dt, t);
    this.marker.rotation.y += dt;
    this.marker.children.forEach((m) => { m.rotation.z += dt * 2; });
    if (this.arrow.visible) this.arrow.position.y += Math.sin(t * 6) * 0.004;
    const k = Math.min(1, dt * 3.2);
    this.camera.position.lerp(this.camTarget.pos, k);
    this.camLook.lerp(this.camTarget.look, k);
    this.camera.lookAt(this.camLook);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.camera.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(this.shake * 0.5));
    }
  }
}
