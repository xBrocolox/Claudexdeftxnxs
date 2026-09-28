// Atmosphere + effects: sky dome, pyreflies, static rain, blob shadows,
// spell bursts, damage numbers.
import * as THREE from 'three';
import { Assets, sheetSprite } from './assets.js';

export function makeSky({ top = '#020203', horizon = '#0b1d22', glowColor = '#ff2a4a', moon = true } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      time: { value: 0 }, top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) },
      glowColor: { value: new THREE.Color(glowColor) }, moon: { value: moon ? 1 : 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform float time, moon; uniform vec3 top, horizon, glowColor; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(horizon, top, smoothstep(-0.05, 0.55, y));
        col = mix(col, horizon * 0.35, smoothstep(0.0, -0.4, y));   // abyss below
        // slow bands of signal noise
        float a = atan(d.z, d.x);
        float b = n(vec2(a * 6.0, y * 30.0 - time * 0.05)) * n(vec2(a * 2.0 + time * 0.01, y * 4.0));
        col += horizon * b * 0.5 * smoothstep(0.5, 0.0, abs(y - 0.08));
        // scanline flicker in the sky
        float line = step(0.996, h(vec2(floor(y * 400.0), floor(time * 4.0))));
        col += glowColor * line * 0.25 * smoothstep(0.7, 0.1, y);
        // shattered moon
        if (moon > 0.5) {
          vec3 md = normalize(vec3(-0.35, 0.42, -0.84));
          float m = dot(d, md);
          float disc = smoothstep(0.9975, 0.9985, m);
          vec2 mp = vec2(dot(d, vec3(1,0,0)), d.y) * 300.0;
          float crack = step(0.82, n(mp * 0.6)) * disc;
          col += vec3(0.75, 0.78, 0.8) * disc * (0.7 + 0.3 * n(mp)) - crack * 0.5;
          col += glowColor * pow(max(m, 0.0), 400.0) * 0.4 + vec3(0.2,0.3,0.32) * pow(max(m,0.0), 40.0) * 0.25;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
  sky.renderOrder = -10;
  sky.userData.update = (dt, t) => { mat.uniforms.time.value = t; };
  return sky;
}

/** A PixVerse-generated video wrapped around the far horizon, if present. */
export function makeVideoBackdrop(id, { radius = 300, height = 260, y = 40, opacity = 0.55 } = {}) {
  const tex = Assets.video(id);
  if (!tex) return null;
  const geo = new THREE.CylinderGeometry(radius, radius, height, 48, 1, true, Math.PI * 0.5, Math.PI);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, opacity,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.renderOrder = -9;
  return m;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const GLOW = glowTexture();

/** Pyreflies: slow rising motes, cyan with the occasional red. */
export function makePyreflies(count, center, spread, height) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), seed = new Float32Array(count);
  const c1 = new THREE.Color('#4ff0ff'), c2 = new THREE.Color('#ff2a4a'), c3 = new THREE.Color('#d8f7ff');
  for (let i = 0; i < count; i++) {
    pos[i * 3] = center.x + (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = center.y + Math.random() * height;
    pos[i * 3 + 2] = center.z + (Math.random() - 0.5) * spread;
    const c = Math.random() < 0.12 ? c2 : Math.random() < 0.5 ? c1 : c3;
    col.set([c.r, c.g, c.b], i * 3);
    seed[i] = Math.random() * 100;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.28, map: GLOW, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.update = (dt, t) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      p[i * 3 + 1] += dt * (0.25 + (seed[i] % 1) * 0.4);
      p[i * 3] += Math.sin(t * 0.7 + seed[i]) * dt * 0.25;
      p[i * 3 + 2] += Math.cos(t * 0.5 + seed[i]) * dt * 0.25;
      if (p[i * 3 + 1] > center.y + height) p[i * 3 + 1] = center.y;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 0.75 + Math.sin(t * 3) * 0.1;
  };
  return pts;
}

/** Static rain: long thin falling streaks that follow a target. */
export function makeStaticRain(count = 900, area = 60) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 6);
  const spd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * area, z = (Math.random() - 0.5) * area, y = Math.random() * 40 - 10;
    pos.set([x, y, z, x, y - 0.8, z], i * 6);
    spd[i] = 14 + Math.random() * 10;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: '#7fb9c2', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.userData.update = (dt, t, focus) => {
    const p = geo.attributes.position.array;
    if (focus) lines.position.set(focus.x, focus.y, focus.z);
    for (let i = 0; i < count; i++) {
      const d = spd[i] * dt;
      p[i * 6 + 1] -= d; p[i * 6 + 4] -= d;
      if (p[i * 6 + 1] < -12) { p[i * 6 + 1] += 45; p[i * 6 + 4] += 45; }
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 0.16 + (Math.sin(t * 17) > 0.97 ? 0.3 : 0);
  };
  return lines;
}

export function blobShadow(radius = 0.55) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,0.75)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

/** Transient effect manager (bursts, rings, sparks, sprite sheets). */
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  update(dt) {
    this.items = this.items.filter((it) => {
      it.t += dt;
      const k = it.t / it.dur;
      it.step(k, dt);
      if (k >= 1) { this.scene.remove(it.obj); it.dispose?.(); return false; }
      return true;
    });
  }

  add(obj, dur, step, dispose) {
    this.scene.add(obj);
    this.items.push({ obj, dur, t: 0, step, dispose });
  }

  sparks(pos, color = '#4ff0ff', n = 28, speed = 5) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      v.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random())));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ size: 0.22, map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    this.add(pts, 0.7, (k, dt) => {
      const a = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        v[i].y -= 9 * dt;
        a[i * 3] += v[i].x * dt; a[i * 3 + 1] += v[i].y * dt; a[i * 3 + 2] += v[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 1 - k;
    }, () => { geo.dispose(); mat.dispose(); });
  }

  ring(pos, color = '#4ff0ff', r0 = 0.2, r1 = 3, dur = 0.6, y = 0.05) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, y, pos.z);
    this.add(m, dur, (k) => { const s = r0 + (r1 - r0) * k; m.scale.set(s, s, s); mat.opacity = 1 - k; },
      () => { m.geometry.dispose(); mat.dispose(); });
  }

  pillar(pos, color = '#ff2a4a', dur = 0.9, radius = 0.8) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.6, 14, 24, 1, true), mat);
    m.position.set(pos.x, 7, pos.z);
    this.add(m, dur, (k) => { m.scale.x = m.scale.z = 1 + k * 0.6; mat.opacity = Math.sin(k * Math.PI) * 0.8; m.rotation.y += 0.2; },
      () => { m.geometry.dispose(); mat.dispose(); });
  }

  slash(pos, color = '#4ff0ff') {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.04, 4, 32, Math.PI * 0.9), mat);
    m.position.copy(pos);
    m.rotation.set(Math.random() * 0.6 - 0.3, Math.random() * Math.PI, Math.PI * 0.2 + Math.random());
    this.add(m, 0.3, (k) => { m.scale.setScalar(0.6 + k * 0.8); mat.opacity = 1 - k; },
      () => { m.geometry.dispose(); mat.dispose(); });
  }

  /** Rift burst: PixVerse fx sheet if generated, else procedural shards. */
  rift(pos, color = '#9b5cff') {
    const sheet = Assets.pix.sheets.fx_rift_burst;
    if (sheet) {
      const sp = sheetSprite(sheet, { size: 4, additive: true });
      sp.position.set(pos.x, pos.y + 1.2, pos.z);
      this.add(sp, sheet.frames / (sheet.fps || 12), (k, dt) => sp.userData.update(dt, false), () => sp.material.dispose());
    }
    const shards = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.15 + Math.random() * 0.25), mat);
      const a = Math.random() * Math.PI * 2;
      s.userData.v = new THREE.Vector3(Math.cos(a), 0.5 + Math.random(), Math.sin(a)).multiplyScalar(2 + Math.random() * 3);
      shards.add(s);
    }
    shards.position.set(pos.x, pos.y + 0.8, pos.z);
    this.add(shards, 0.8, (k, dt) => {
      for (const s of shards.children) { s.position.addScaledVector(s.userData.v, dt); s.rotation.x += dt * 8; s.rotation.y += dt * 5; }
      mat.opacity = 1 - k;
    }, () => mat.dispose());
    this.ring(pos, color, 0.3, 4, 0.7);
    this.pillar(pos, color, 0.6, 0.6);
  }

  heal(pos) {
    this.ring(pos, '#4ff0ff', 0.2, 1.8, 0.8);
    const n = 24;
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) p.set([pos.x + (Math.random() - 0.5) * 1.2, pos.y + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * 1.2], i * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ size: 0.3, map: GLOW, color: '#bff9ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    this.add(pts, 1.1, (k, dt) => {
      const a = geo.attributes.position.array;
      for (let i = 0; i < n; i++) a[i * 3 + 1] += dt * (1.2 + (i % 5) * 0.3);
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 1 - k;
    }, () => { geo.dispose(); mat.dispose(); });
  }

  bolt(from, to, color = '#4ff0ff') {
    const pts = [];
    const segs = 10;
    for (let i = 0; i <= segs; i++) {
      const p = from.clone().lerp(to, i / segs);
      if (i > 0 && i < segs) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    this.add(line, 0.35, (k) => { mat.opacity = 1 - k; }, () => { geo.dispose(); mat.dispose(); });
    this.sparks(to, color, 20, 4);
  }
}
