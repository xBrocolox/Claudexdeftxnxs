// Field exploration: third-person movement across the Blender-built Spire,
// following party, visible enemies (no random encounters), NPCs, chests,
// save spheres and zone title cards.
import * as THREE from 'three';
import { Assets } from './assets.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { DIALOGUE, ITEMS, GROUPS, ENEMIES } from './data.js';
import { State, save, healAll, addItem, addHero } from './state.js';
import { makeSky, makePyreflies, makeStaticRain, blobShadow, makeVideoBackdrop } from './fx.js';

const RADIUS = 0.32;

export class Field {
  constructor(G, level) {
    this.G = G;
    this.L = level;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#040608', 0.024);
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1200);
    this.yaw = 0;
    this.camPos = new THREE.Vector3();
    this.updaters = [];
    this.build();
  }

  // ---------------------------------------------------------------- build
  build() {
    const s = this.scene;
    this.sky = makeSky();
    s.add(this.sky);
    const vb = makeVideoBackdrop('env_megastructure');
    if (vb) { vb.position.z = -60; s.add(vb); this.videoBackdrop = vb; }

    s.add(new THREE.HemisphereLight('#6f8d9c', '#160a0e', 0.75));
    const moon = new THREE.DirectionalLight('#a8cfe0', 1.6);
    moon.position.set(-30, 60, 40);
    s.add(moon);
    const red = new THREE.DirectionalLight('#ff2a4a', 0.6);
    red.position.set(40, -20, -60);
    s.add(red);

    this.level = Assets.scene('level_spire');
    s.add(this.level);

    this.rain = makeStaticRain();
    s.add(this.rain);
    this.motes = [];
    for (const sp of this.L.savepoints) this.motes.push(makePyreflies(40, new THREE.Vector3(sp.x, this.heightAt(sp.x, sp.z), sp.z), 6, 6));
    this.motes.push(makePyreflies(160, new THREE.Vector3(0, -2, -60), 60, 30));
    this.motes.forEach((m) => s.add(m));

    // player + followers
    this.party = {};
    this.crumbs = [];
    this.syncParty();
    const sp = State.pos || this.L.spawn;
    this.player.position.set(sp.x, this.heightAt(sp.x, sp.z), sp.z);
    this.player.rotation.y = sp.rot ?? 0;
    this.yaw = this.player.rotation.y + Math.PI; // camera sits behind the facing direction
    this.lamp = new THREE.PointLight('#8ff6ff', 2.5, 7, 1.8);
    s.add(this.lamp);

    // save spheres
    this.saves = this.L.savepoints.map((p) => {
      const m = Assets.scene('savepoint');
      m.position.set(p.x, this.heightAt(p.x, p.z), p.z);
      const l = new THREE.PointLight('#4ff0ff', 12, 10, 1.5);
      l.position.set(0, 1.4, 0);
      m.add(l);
      s.add(m);
      return { ...p, obj: m, kind: 'save' };
    });

    // chests
    this.chests = this.L.chests.filter((c) => !State.opened.includes(c.id)).map((c) => {
      const m = Assets.scene('chest');
      m.position.set(c.x, this.heightAt(c.x, c.z), c.z);
      m.rotation.y = Math.PI;
      s.add(m);
      return { ...c, obj: m, kind: 'chest' };
    });

    // NPCs (party candidates disappear once joined)
    this.npcs = this.L.npcs.filter((n) => !(n.joins && State.party[n.joins])).map((n) => {
      const a = Assets.actor(n.model);
      a.root.position.set(n.x, this.heightAt(n.x, n.z), n.z);
      a.root.rotation.y = n.rot;
      a.play('idle');
      if (n.model === 'saint_ghost') a.setOpacity(0.55);
      a.root.add(blobShadow());
      s.add(a.root);
      return { ...n, actor: a, kind: 'npc' };
    });

    // visible enemies
    this.enemies = this.L.enemies.filter((e) => !State.defeated.includes(e.id)).map((e) => this.spawnEnemy(e));
    if (!State.defeated.includes(this.L.boss.id)) {
      const b = this.L.boss;
      const a = Assets.actor('warden');
      a.root.position.set(b.x, this.heightAt(b.x, b.z), b.z);
      a.play('idle');
      a.root.add(blobShadow(1.6));
      const glow = new THREE.PointLight('#ff2a4a', 30, 22, 1.4);
      glow.position.set(0, 5, 1.5);
      a.root.add(glow);
      s.add(a.root);
      this.boss = { ...b, actor: a };
    }
    this.zone = null;
  }

  spawnEnemy(e) {
    const kind = GROUPS[e.group][0];
    const a = Assets.actor(ENEMIES[kind].model);
    const y = this.heightAt(e.x, e.z);
    a.root.position.set(e.x, y, e.z);
    a.root.add(blobShadow());
    a.play('idle');
    this.scene.add(a.root);
    return { ...e, actor: a, home: new THREE.Vector3(e.x, y, e.z), target: null, wait: Math.random() * 2, cooldown: 0 };
  }

  syncParty() {
    for (const id of State.order) {
      if (this.party[id]) continue;
      const a = Assets.actor(id);
      a.play('idle');
      a.root.add(blobShadow());
      this.scene.add(a.root);
      this.party[id] = a;
      if (this.player) a.root.position.copy(this.player.position);
    }
    this.leader = this.party[State.order[0]];
    this.player = this.leader.root;
  }

  // ---------------------------------------------------------------- collision
  regionsAt(x, z) {
    return this.L.walk.filter((w) => x >= w.x0 && x <= w.x1 && z >= w.z0 && z <= w.z1);
  }

  regionY(w, z) {
    if (w.type === 'box') return w.y;
    const k = (z - w.z0) / (w.z1 - w.z0);
    return w.yz0 + (w.yz1 - w.yz0) * k;
  }

  heightAt(x, z, near = null) {
    const rs = this.regionsAt(x, z);
    if (!rs.length) return null;
    let best = null;
    for (const w of rs) {
      const y = this.regionY(w, z);
      if (best === null || (near !== null && Math.abs(y - near) < Math.abs(best - near)) || (near === null && y > best)) best = y;
    }
    return best;
  }

  walkable(x, z, fromY) {
    const y = this.heightAt(x, z, fromY);
    if (y === null || Math.abs(y - fromY) > 0.6) return null;
    for (const [dx, dz] of [[RADIUS, 0], [-RADIUS, 0], [0, RADIUS], [0, -RADIUS]]) {
      const yy = this.heightAt(x + dx, z + dz, fromY);
      if (yy === null || Math.abs(yy - fromY) > 0.8) return null;
    }
    return y;
  }

  // ---------------------------------------------------------------- lifecycle
  enter() {
    this.syncParty();
    for (const a of Object.values(this.party)) a.root.visible = true;
    Audio.music('field');
    this.onResize();
    this.snapCamera();
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  snapCamera() {
    this.camPos.copy(this.desiredCam());
    this.camera.position.copy(this.camPos);
  }

  desiredCam() {
    const p = this.player.position;
    return new THREE.Vector3(p.x + Math.sin(this.yaw) * 6.4, p.y + 3.4, p.z + Math.cos(this.yaw) * 6.4);
  }

  removeEnemy(id) {
    const i = this.enemies.findIndex((e) => e.id === id);
    if (i < 0) return;
    const e = this.enemies[i];
    this.scene.remove(e.actor.root);
    e.actor.dispose();
    this.enemies.splice(i, 1);
  }

  stunEnemy(id) {
    const e = this.enemies.find((x) => x.id === id);
    if (e) { e.cooldown = 4; e.actor.root.position.copy(e.home); }
  }

  removeBoss() {
    if (!this.boss) return;
    this.scene.remove(this.boss.actor.root);
    this.boss = null;
  }

  // ---------------------------------------------------------------- update
  update(dt, t) {
    const busy = UI.busy() || this.G.lock;
    this.sky.userData.update(dt, t);
    this.rain.userData.update(dt, t, this.player.position);
    this.motes.forEach((m) => m.userData.update(dt, t));
    this.saves.forEach((s) => { s.obj.children.forEach((c) => { if (c.isMesh) c.rotation.z += dt * 0.4; }); });
    this.chests.forEach((c) => { c.obj.position.y = this.heightAt(c.x, c.z) + Math.sin(t * 2 + c.x) * 0.03; });

    // camera yaw
    if (!busy) {
      this.yaw -= Input.dragX * 0.005;
      if (Input.held('camL')) this.yaw += dt * 2;
      if (Input.held('camR')) this.yaw -= dt * 2;
    }

    // movement
    const mv = busy ? { x: 0, y: 0 } : Input.move();
    const moving = Math.hypot(mv.x, mv.y) > 0.1;
    const leader = this.leader;
    if (moving) {
      const speed = Input.held('walk') ? 2.4 : 5.2;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const dx = (fx * mv.y + rx * mv.x) * speed * dt, dz = (fz * mv.y + rz * mv.x) * speed * dt;
      const p = this.player.position;
      // slide along walls: try full, then axis-separated
      for (const [ddx, ddz] of [[dx, dz], [dx, 0], [0, dz]]) {
        const y = this.walkable(p.x + ddx, p.z + ddz, p.y);
        if (y !== null) { p.x += ddx; p.z += ddz; p.y = THREE.MathUtils.lerp(p.y, y, Math.min(1, dt * 20)); break; }
      }
      const target = Math.atan2(dx, dz);
      this.player.rotation.y = lerpAngle(this.player.rotation.y, target, Math.min(1, dt * 12));
      leader.play('run');
      leader.mixer.timeScale = Input.held('walk') ? 0.6 : 1;
      const last = this.crumbs[this.crumbs.length - 1];
      if (!last || last.distanceTo(p) > 0.1) { this.crumbs.push(p.clone()); if (this.crumbs.length > 200) this.crumbs.shift(); }
    } else {
      leader.play('idle');
      leader.mixer.timeScale = 1;
    }
    leader.update(dt);

    // followers trail the leader's breadcrumbs (Grandia-style party walk)
    State.order.slice(1).forEach((id, i) => {
      const a = this.party[id];
      const back = (i + 1) * 12;
      const target = this.crumbs[Math.max(0, this.crumbs.length - 1 - back)] || this.player.position;
      const d = target.distanceTo(a.root.position);
      if (d > 0.08) {
        const step = Math.min(d, dt * 5.4);
        const dir = target.clone().sub(a.root.position).normalize();
        a.root.position.addScaledVector(dir, step);
        a.root.rotation.y = lerpAngle(a.root.rotation.y, Math.atan2(dir.x, dir.z), Math.min(1, dt * 10));
        a.play(d > 0.25 ? 'run' : 'idle');
      } else a.play('idle');
      a.update(dt);
    });

    this.lamp.position.copy(this.player.position).add(new THREE.Vector3(0, 2.2, 0));

    // camera follow
    const want = this.desiredCam();
    this.camPos.lerp(want, Math.min(1, dt * 5));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.player.position.x, this.player.position.y + 1.3, this.player.position.z);

    this.npcs.forEach((n) => n.actor.update(dt));
    this.updateEnemies(dt, busy);
    if (this.boss) {
      this.boss.actor.update(dt);
      this.boss.actor.root.rotation.y = Math.atan2(this.player.position.x - this.boss.x, this.player.position.z - this.boss.z);
    }

    if (!busy) {
      this.checkZone();
      this.checkInteract();
      this.checkBoss();
      if (Input.hit('menu')) this.G.pauseMenu();
    } else UI.hint(null);
  }

  updateEnemies(dt, busy) {
    const p = this.player.position;
    for (const e of this.enemies) {
      const a = e.actor, pos = a.root.position;
      e.cooldown = Math.max(0, e.cooldown - dt);
      a.update(dt);
      if (busy) continue;
      const dist = Math.hypot(p.x - pos.x, p.z - pos.z);
      const sameLevel = Math.abs(p.y - pos.y) < 1.5;
      let goal = null, speed = 1.1;
      if (e.cooldown <= 0 && sameLevel && dist < 7) { goal = p; speed = 2.7; }
      else {
        if (!e.target || pos.distanceTo(e.target) < 0.3) {
          e.wait -= dt;
          if (e.wait <= 0) {
            const ang = Math.random() * Math.PI * 2, r = Math.random() * e.patrol;
            e.target = new THREE.Vector3(e.home.x + Math.cos(ang) * r, 0, e.home.z + Math.sin(ang) * r);
            e.wait = 1 + Math.random() * 2.5;
          }
        } else goal = e.target;
      }
      if (goal) {
        const dx = goal.x - pos.x, dz = goal.z - pos.z, l = Math.hypot(dx, dz);
        if (l > 0.05) {
          const nx = pos.x + dx / l * speed * dt, nz = pos.z + dz / l * speed * dt;
          const y = this.walkable(nx, nz, pos.y);
          if (y !== null) { pos.x = nx; pos.z = nz; pos.y = y; } else e.target = null;
          a.root.rotation.y = lerpAngle(a.root.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 6));
          a.play(speed > 2 ? 'run' : 'run', {});
          a.mixer.timeScale = speed > 2 ? 1.1 : 0.55;
        }
      } else { a.play('idle'); a.mixer.timeScale = 1; }
      if (e.cooldown <= 0 && sameLevel && dist < 1.4) {
        this.G.startBattle(e.group, { fieldEnemy: e.id });
        return;
      }
    }
  }

  checkZone() {
    const p = this.player.position;
    const z = this.L.zones.find((q) => p.x >= q.x0 && p.x <= q.x1 && p.z >= q.z0 && p.z <= q.z1);
    if (z && z.id !== this.zone) {
      this.zone = z.id;
      UI.zone(z.name);
      Audio.sfx('glitch');
      this.G.post.glitch(0.35);
    }
  }

  nearest() {
    const p = this.player.position;
    let best = null, bd = 2.3;
    for (const list of [this.npcs, this.chests, this.saves]) {
      for (const it of list) {
        const pos = it.actor ? it.actor.root.position : it.obj.position;
        const d = Math.hypot(p.x - pos.x, p.z - pos.z);
        if (d < bd && Math.abs(p.y - pos.y) < 1.5) { bd = d; best = it; }
      }
    }
    return best;
  }

  checkInteract() {
    const it = this.nearest();
    if (!it) { UI.hint(null); return; }
    const label = it.kind === 'npc' ? 'TALK' : it.kind === 'chest' ? 'OPEN' : 'REST · SAVE';
    UI.hint(`<b>E</b> ${label}`);
    if (Input.hit('ok') || Input.hit('ok')) this.interact(it);
  }

  async interact(it) {
    UI.hint(null);
    this.G.lock = true;
    this.leader.play('idle');
    if (it.kind === 'npc') {
      const a = it.actor;
      a.root.rotation.y = Math.atan2(this.player.position.x - a.root.position.x, this.player.position.z - a.root.position.z);
      await UI.say(DIALOGUE[it.dialogue]);
      if (it.joins) {
        addHero(it.joins);
        Audio.sfx('levelup');
        this.G.post.glitch(0.6);
        this.scene.remove(a.root);
        a.dispose();
        this.npcs = this.npcs.filter((n) => n !== it);
        this.syncParty();
        this.party[it.joins].root.position.copy(a.root.position);
      }
    } else if (it.kind === 'chest') {
      Audio.sfx('chest');
      State.opened.push(it.id);
      addItem(it.item, it.qty);
      this.scene.remove(it.obj);
      this.chests = this.chests.filter((c) => c !== it);
      UI.toast(`Obtained <b>${ITEMS[it.item].name}</b> ×${it.qty}`);
    } else if (it.kind === 'save') {
      healAll();
      Audio.sfx('save');
      this.G.post.glitch(0.25);
      await UI.say(DIALOGUE.save);
      const v = await UI.menu([{ label: 'Save the story', value: 'save' }, { label: 'Leave', value: null }], { title: 'SPHERE OF LIGHT' });
      if (v === 'save') {
        State.pos = { x: this.player.position.x, z: this.player.position.z, rot: this.player.rotation.y };
        save();
        UI.toast('Story saved.');
      }
    }
    this.G.lock = false;
  }

  async checkBoss() {
    if (!this.boss) return;
    const p = this.player.position, b = this.boss;
    if (Math.hypot(p.x - b.x, p.z - b.z) > b.trigger) return;
    this.G.lock = true;
    UI.hint(null);
    this.leader.play('idle');
    // slow push-in on the Warden before words
    await UI.say(DIALOGUE.warden_pre);
    this.G.lock = false;
    this.G.startBattle(b.group, { boss: true });
  }

  savePos() {
    State.pos = { x: this.player.position.x, z: this.player.position.z, rot: this.player.rotation.y };
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
