// Post-processing: bloom + a darkcore/glitch grade (chromatic split, datamosh
// row tearing, scanlines, grain, vignette, teal-shadow grade).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GlitchShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    glitch: { value: 0 },      // transient burst 0..1
    ambient: { value: 0.12 },  // idle signal decay
    crt: { value: 1 },
    fade: { value: 0 },        // 0 = visible, 1 = black
    tint: { value: new THREE.Color(0.9, 1.0, 1.02) },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, glitch, ambient, crt, fade;
    uniform vec3 tint;
    uniform vec2 resolution;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      float t = floor(time * 18.0);

      // datamosh row tearing: bands of rows slide sideways
      float g = glitch + ambient * step(0.985, hash(vec2(t, 3.1)));
      float band = floor(uv.y * mix(14.0, 60.0, hash(vec2(t, 1.0))));
      float tear = step(1.0 - g * 0.55, hash(vec2(band, t)));
      uv.x += tear * (hash(vec2(band, t + 7.0)) - 0.5) * 0.18 * g;
      // block displacement
      vec2 blk = floor(uv * vec2(16.0, 9.0));
      if (hash(blk + t) < g * 0.12) uv += (vec2(hash(blk + 1.3), hash(blk + 2.7)) - 0.5) * 0.06;

      // chromatic aberration grows toward the edges and during glitches
      vec2 dir = uv - 0.5;
      float ca = (0.0018 + dot(dir, dir) * 0.012) * crt + g * 0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ca * 1.0 + vec2(g * 0.01, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ca * 1.0 - vec2(g * 0.01, 0.0)).b;

      // grade: crush, teal shadows, bone highlights
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), 0.18);
      col = mix(col * vec3(0.78, 1.0, 1.08), col, smoothstep(0.0, 0.6, l));
      col *= tint;

      // scanlines + grain + vignette
      float sl = sin(vUv.y * resolution.y * 1.5) * 0.5 + 0.5;
      col *= 1.0 - crt * 0.07 * sl;
      col += (hash(vUv * resolution + time) - 0.5) * 0.05 * crt;
      float v = smoothstep(1.05, 0.25, length(dir * vec2(1.1, 1.25)));
      col *= mix(0.55, 1.0, v);

      // inverted flash lines during heavy glitch
      if (g > 0.5 && hash(vec2(band * 3.0, t)) > 0.94) col = vec3(1.0) - col;

      gl_FragColor = vec4(col * (1.0 - fade), 1.0);
    }
  `,
};

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.7);
    this.glitchPass = new ShaderPass(GlitchShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.glitchPass);
    this.u = this.glitchPass.uniforms;
    this.burst = 0;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // render slightly under native for a crunchy PS2-era image
    const pr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.8;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.u.resolution.value.set(w * pr, h * pr);
  }

  /** Fire a glitch burst of the given strength (decays over time). */
  glitch(amount = 1) {
    this.burst = Math.max(this.burst, amount);
  }

  render(scene, camera, dt, time) {
    this.burst = Math.max(0, this.burst - dt * 2.2);
    this.u.glitch.value = this.burst;
    this.u.time.value = time;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render(dt);
  }
}
