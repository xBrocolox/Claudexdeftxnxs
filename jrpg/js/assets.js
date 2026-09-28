// Asset loading: Blender-built GLBs, animated actors, generated portraits and
// optional PixVerse media (see pipeline/pixverse). Everything PixVerse is
// optional: when assets/pixverse/index.json is missing the game falls back to
// procedural visuals.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const MODELS = ['sable', 'wisp', 'hex', 'saint', 'saint_ghost', 'wraith', 'moth', 'warden',
  'savepoint', 'chest', 'level_spire', 'arena'];

// clips that loop on top of the base animation, limited to their own bones
const OVERLAYS = { halo_spin: /halo/, grimoire_float: /grimoire/ };

export const Assets = {
  gltf: {},
  portraits: {},
  pix: { index: null, sheets: {}, videos: {}, cards: {} },

  async load(onProgress) {
    const loader = new GLTFLoader();
    let done = 0;
    await Promise.all(MODELS.map(async (m) => {
      this.gltf[m] = await loader.loadAsync(`assets/models/${m}.glb`);
      onProgress?.(++done / (MODELS.length + 1));
    }));
    await this.loadPixverse();
    onProgress?.(1);
  },

  async loadPixverse() {
    try {
      const r = await fetch('assets/pixverse/index.json', { cache: 'no-cache' });
      if (!r.ok) return;
      this.pix.index = await r.json();
    } catch { return; }
    const tl = new THREE.TextureLoader();
    const jobs = Object.entries(this.pix.index.assets || {}).map(async ([id, a]) => {
      if (a.sheet) {
        const tex = await tl.loadAsync(`assets/pixverse/${a.sheet}`);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.pix.sheets[id] = { ...a, tex };
      }
      if (a.video) this.pix.videos[id] = `assets/pixverse/${a.video}`;
      if (a.card) this.pix.cards[id] = await new GLTFLoader().loadAsync(`assets/pixverse/${a.card}`);
    });
    await Promise.allSettled(jobs);
  },

  hasPix(id) { return !!(this.pix.sheets[id] || this.pix.videos[id]); },

  /** Looping muted <video> → VideoTexture, or null if not generated yet. */
  video(id) {
    const src = this.pix.videos[id];
    if (!src) return null;
    const v = document.createElement('video');
    Object.assign(v, { src, loop: true, muted: true, playsInline: true, crossOrigin: 'anonymous' });
    v.play().catch(() => {});
    const t = new THREE.VideoTexture(v);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  },

  /** Static (non-animated) clone for level/props. */
  scene(name) {
    const s = this.gltf[name].scene.clone(true);
    s.traverse((o) => { if (o.isMesh) { o.frustumCulled = name !== 'level_spire'; } });
    return s;
  },

  actor(name) { return new Actor(this.gltf[name], name); },

  /**
   * Blender-built apparition card for a PixVerse sheet: plays the baked
   * levitation clip and steps the sheet frames. Returns null if not generated.
   */
  pixCard(id, { opacity = 0.6 } = {}) {
    const gltf = this.pix.cards[id];
    if (!gltf) return null;
    const root = gltf.scene.clone(true);
    let node = null;
    root.traverse((o) => { if (o.isMesh) node = o; });
    const extras = node.userData.pix_grid ? node.userData : node.parent.userData;
    const [cols, rows] = extras.pix_grid || [1, 1];
    const frames = extras.pix_frames || 1, fps = extras.pix_fps || 12;
    const map = node.material.map.clone();
    map.needsUpdate = true;
    node.material = new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const mixer = new THREE.AnimationMixer(root);
    for (const c of gltf.animations) mixer.clipAction(c).play();
    let t = 0;
    return {
      root,
      update(dt) {
        t += dt;
        mixer.update(dt);
        const f = Math.floor(t * fps) % frames;
        map.offset.set((f % cols) / cols, Math.floor(f / cols) / rows);
      },
    };
  },

  /** Render head-and-shoulder portraits of each model into data URLs. */
  makePortraits(renderer) {
    const size = 192;
    const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07080b');
    scene.add(new THREE.HemisphereLight('#9fb8c8', '#1a0a10', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 2.5); key.position.set(-1, 2, 3); scene.add(key);
    const rim = new THREE.DirectionalLight('#ff2a4a', 3); rim.position.set(2, 1, -2); scene.add(rim);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    const px = new Uint8Array(size * size * 4);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const prevTarget = renderer.getRenderTarget();
    const prevTM = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    for (const [id, model] of Object.entries({ sable: 'sable', wisp: 'wisp', hex: 'hex', echo: 'saint_ghost', warden: 'warden', wraith: 'wraith', saint: 'saint', moth: 'moth' })) {
      const a = this.actor(model);
      a.play('idle'); a.update(0.01);
      scene.add(a.root);
      a.root.updateMatrixWorld(true);
      const head = a.bone('head') || a.bone('body');
      const hp = new THREE.Vector3(); head.getWorldPosition(hp);
      const scale = model === 'warden' ? 2.2 : model === 'moth' ? 2.4 : 1;
      cam.position.set(hp.x - 0.2 * scale, hp.y + 0.14 * scale, hp.z + 0.8 * scale);
      cam.lookAt(hp.x, hp.y + (model === 'moth' ? 0 : 0.12 * scale), hp.z);
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {  // flip Y and add scanline/tint treatment
        const row = y % 3 === 0 ? 0.82 : 1;
        for (let x = 0; x < size; x++) {
          const s = ((size - 1 - y) * size + x) * 4, d = (y * size + x) * 4;
          img.data[d] = Math.min(255, px[s] * row * 1.05);
          img.data[d + 1] = px[s + 1] * row;
          img.data[d + 2] = Math.min(255, px[s + 2] * row * 1.1);
          img.data[d + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      // glitch slices
      for (let i = 0; i < 4; i++) {
        const y = Math.random() * size, h = 2 + Math.random() * 6;
        ctx.drawImage(canvas, 0, y, size, h, (Math.random() - 0.5) * 14, y, size, h);
      }
      this.portraits[id] = canvas.toDataURL('image/png');
      scene.remove(a.root);
      a.dispose();
    }
    renderer.setRenderTarget(prevTarget);
    renderer.toneMapping = prevTM;
    rt.dispose();
  },
};

export class Actor {
  constructor(gltf, name) {
    this.name = name;
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(gltf.scene);
    this.root.add(this.model);
    this.materials = [];
    this.model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.frustumCulled = false;
        o.material = o.material.clone();
        o.material.userData.emissive0 = o.material.emissive.clone();
        o.material.userData.ei0 = o.material.emissiveIntensity;
        this.materials.push(o.material);
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = {};
    for (const c of gltf.animations) {
      if (OVERLAYS[c.name]) {
        const re = OVERLAYS[c.name];
        const clip = c.clone();
        clip.tracks = clip.tracks.filter((t) => re.test(t.name));
        const act = this.mixer.clipAction(clip);
        act.play();
      } else {
        // strip overlay bones from base clips so overlays aren't overridden
        const clip = c.clone();
        const overlayRe = Object.values(OVERLAYS);
        if (gltf.animations.some((a) => OVERLAYS[a.name])) {
          clip.tracks = clip.tracks.filter((t) => !overlayRe.some((re) => re.test(t.name)));
        }
        this.clips[c.name] = this.mixer.clipAction(clip);
      }
    }
    this.current = null;
    this.flashT = 0;
    this.flashColor = new THREE.Color();
    this._onFinish = null;
    this.mixer.addEventListener('finished', (e) => {
      if (this._onFinish && e.action === this.current) { const f = this._onFinish; this._onFinish = null; f(); }
    });
  }

  bone(name) {
    let found = null;
    const alt = name.replace('.', '');
    this.model.traverse((o) => { if (!found && o.isBone && (o.name === name || o.name === alt)) found = o; });
    return found;
  }

  has(name) { return !!this.clips[name]; }

  /** Crossfade to a clip. once=true returns a promise resolved at clip end. */
  play(name, { once = false, fade = 0.18, speed = 1, clamp = false } = {}) {
    const next = this.clips[name];
    if (!next) return Promise.resolve();
    if (next === this.current && !once) return Promise.resolve();
    next.reset();
    next.setEffectiveTimeScale(speed);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once || clamp;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (this.current && this.current !== next) this.current.crossFadeTo(next, fade, false);
    next.play();
    this.current = next;
    if (!once) return Promise.resolve();
    return new Promise((res) => { this._onFinish = res; });
  }

  /** Temporary emissive flash (hit, heal, buff). */
  flash(color = '#ffffff', t = 0.25, strength = 1) {
    this.flashColor.set(color);
    this.flashT = t;
    this.flashDur = t;
    this.flashStrength = strength;
  }

  update(dt) {
    this.mixer.update(dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / this.flashDur) * this.flashStrength;
      for (const m of this.materials) {
        m.emissive.copy(m.userData.emissive0).lerp(this.flashColor, Math.min(1, k));
        m.emissiveIntensity = m.userData.ei0 + k * 0.6;
      }
      if (this.flashT <= 0) {
        for (const m of this.materials) { m.emissive.copy(m.userData.emissive0); m.emissiveIntensity = m.userData.ei0; }
      }
    }
  }

  setOpacity(o) {
    for (const m of this.materials) { m.transparent = o < 1; m.opacity = o; m.depthWrite = o >= 1; }
  }

  dispose() {
    this.mixer.stopAllAction();
    for (const m of this.materials) m.dispose();
  }
}

/** Animated sprite sheet (PixVerse-derived) as a billboard mesh. */
export function sheetSprite(sheet, { size = 3, additive = false } = {}) {
  const tex = sheet.tex.clone();
  tex.needsUpdate = true;
  const [cols, rows] = sheet.grid;
  tex.repeat.set(1 / cols, 1 / rows);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const sp = new THREE.Sprite(mat);
  const aspect = (sheet.cell?.[0] || 1) / (sheet.cell?.[1] || 1);
  sp.scale.set(size * aspect, size, 1);
  let t = 0;
  sp.userData.update = (dt, loop = true) => {
    t += dt;
    let f = Math.floor(t * (sheet.fps || 12));
    if (loop) f %= sheet.frames; else f = Math.min(f, sheet.frames - 1);
    const c = f % cols, r = Math.floor(f / cols);
    tex.offset.set(c / cols, 1 - (r + 1) / rows);
    return f >= sheet.frames - 1;
  };
  sp.userData.update(0);
  return sp;
}
