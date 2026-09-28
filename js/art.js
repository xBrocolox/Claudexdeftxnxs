// Procedural card art: megastructure depths, biomech silhouettes, signal corruption.
// Every card gets a deterministic image seeded from its id.

const Art = (() => {
  const W = 440, H = 320;
  const cache = new Map();

  const PAL = {
    silicate: { bg0: '#030607', bg1: '#132027', fog: '#3b5560', accent: '#7fe7ff', hot: '#e8fdff', ink: '#010203', glitch: 0.35 },
    severed:  { bg0: '#070203', bg1: '#2a070c', fog: '#5a1a20', accent: '#ff2a3d', hot: '#ffd2c4', ink: '#030001', glitch: 0.4 },
    static:   { bg0: '#020604', bg1: '#0b1c14', fog: '#1d4a36', accent: '#39ff9f', hot: '#ff2fd0', ink: '#010302', glitch: 1.0 },
    hollow:   { bg0: '#040209', bg1: '#170b27', fog: '#3a2560', accent: '#b37bff', hot: '#f0e4ff', ink: '#020104', glitch: 0.5 },
    null:     { bg0: '#050505', bg1: '#1b1b1d', fog: '#44444a', accent: '#d8d8e0', hot: '#ffffff', ink: '#020202', glitch: 0.45 },
  };

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }

  // ─── background & megastructure ───
  function background(ctx, r, p) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, p.bg0); g.addColorStop(0.55, p.bg1); g.addColorStop(1, p.bg0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const fx = W * (0.25 + r() * 0.5), fy = H * (0.2 + r() * 0.3);
    const rg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 260);
    rg.addColorStop(0, hexA(p.fog, 0.55)); rg.addColorStop(1, hexA(p.fog, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }

  function girders(ctx, r, p) {
    const vx = W * (0.35 + r() * 0.3), vy = H * (0.3 + r() * 0.25);
    ctx.save();
    ctx.strokeStyle = hexA(p.fog, 0.35); ctx.lineWidth = 0.6;
    const n = 26 + (r() * 20 | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.1;
      ctx.beginPath(); ctx.moveTo(vx, vy);
      ctx.lineTo(vx + Math.cos(a) * 900, vy + Math.sin(a) * 900); ctx.stroke();
    }
    // receding frames — the tunnel that never ends
    for (let k = 1; k < 9; k++) {
      const s = Math.pow(1.45, k) * 6;
      ctx.strokeStyle = hexA(p.fog, 0.08 + k * 0.03);
      ctx.strokeRect(vx - s * 1.4, vy - s, s * 2.8, s * 2);
    }
    ctx.restore();
    return { vx, vy };
  }

  function towers(ctx, r, p, layer) {
    const depth = [0.28, 0.55, 1][layer];
    const col = layer === 2 ? p.ink : mix(p.bg1, p.fog, 0.6 - layer * 0.25);
    let x = -30 + r() * 20;
    while (x < W + 20) {
      const w = (6 + r() * 34) * (0.5 + depth);
      const top = layer === 2 ? -10 + r() * H * 0.25 : r() * H * 0.55;
      if (r() < 0.72 - layer * 0.18) {
        ctx.fillStyle = col;
        ctx.globalAlpha = layer === 2 ? 0.95 : 0.55 + layer * 0.2;
        ctx.fillRect(x, top, w, H - top);
        // edge highlight
        ctx.fillStyle = hexA(p.accent, 0.05 + layer * 0.05);
        ctx.fillRect(x + w - 1, top, 1, H - top);
        // windows / vents
        if (layer < 2) {
          ctx.fillStyle = hexA(p.accent, 0.25 * depth + 0.08);
          const rows = (H - top) / 6 | 0;
          for (let j = 0; j < rows; j++) {
            if (r() < 0.12) ctx.fillRect(x + 2 + r() * (w - 4), top + j * 6, 1 + r() * 2, 1);
          }
        } else {
          // near layer: panel seams & pipes
          ctx.strokeStyle = hexA(p.accent, 0.08); ctx.lineWidth = 0.5;
          for (let j = top; j < H; j += 8 + r() * 30) { ctx.beginPath(); ctx.moveTo(x, j); ctx.lineTo(x + w, j); ctx.stroke(); }
        }
      }
      // bridges between towers
      if (r() < 0.25 + layer * 0.1) {
        ctx.fillStyle = col; ctx.globalAlpha = 0.6 + layer * 0.15;
        const by = r() * H * 0.8;
        ctx.fillRect(x, by, 40 + r() * 140, 1 + r() * 4 * depth);
      }
      x += w + r() * 22 * (1 - depth * 0.5);
    }
    ctx.globalAlpha = 1;
  }

  function cables(ctx, r, p, n, dark) {
    ctx.save();
    for (let i = 0; i < n; i++) {
      const x0 = r() * W, x1 = x0 + (r() - 0.5) * 300;
      const y0 = -10, y1 = r() < 0.5 ? -10 : r() * H;
      const sag = 60 + r() * 220;
      ctx.strokeStyle = dark ? hexA(p.ink, 0.9) : hexA(p.fog, 0.5);
      ctx.lineWidth = dark ? 1 + r() * 3 : 0.5 + r();
      ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0, y0 + sag, x1, y1 + sag, x1, y1); ctx.stroke();
    }
    ctx.restore();
  }

  function mix(a, b, t) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    const c = (s) => Math.round((A >> s & 255) * (1 - t) + (B >> s & 255) * t);
    return `rgb(${c(16)},${c(8)},${c(0)})`;
  }

  function beam(ctx, r, p, cx) {
    const w = 30 + r() * 70;
    const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
    g.addColorStop(0, hexA(p.accent, 0)); g.addColorStop(0.5, hexA(p.accent, 0.22)); g.addColorStop(1, hexA(p.accent, 0));
    ctx.fillStyle = g; ctx.fillRect(cx - w, 0, w * 2, H);
  }

  function halo(ctx, r, p, x, y, rad) {
    ctx.save();
    ctx.shadowColor = p.accent; ctx.shadowBlur = 20;
    ctx.strokeStyle = hexA(p.hot, 0.85); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 0.6; ctx.strokeStyle = hexA(p.accent, 0.6);
    ctx.beginPath(); ctx.arc(x, y, rad * 1.25, 0, Math.PI * 2); ctx.stroke();
    // tick marks
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2, l = i % 4 === 0 ? 8 : 3;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * rad * 1.25, y + Math.sin(a) * rad * 1.25);
      ctx.lineTo(x + Math.cos(a) * (rad * 1.25 + l), y + Math.sin(a) * (rad * 1.25 + l)); ctx.stroke();
    }
    ctx.restore();
  }

  // ─── silhouettes ───
  function silhouette(ctx, p, draw) {
    ctx.save();
    ctx.fillStyle = p.ink; ctx.shadowColor = p.accent; ctx.shadowBlur = 22;
    draw(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hexA(p.accent, 0.55); ctx.lineWidth = 0.8; ctx.stroke();
    ctx.restore();
  }

  function glowEye(ctx, p, x, y, rad) {
    ctx.save();
    ctx.shadowColor = p.hot; ctx.shadowBlur = 14; ctx.fillStyle = p.hot;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function visor(ctx, p, x, y, w) {
    ctx.save();
    ctx.shadowColor = p.accent; ctx.shadowBlur = 10; ctx.fillStyle = p.hot;
    ctx.fillRect(x - w / 2, y, w, 1.6);
    ctx.restore();
  }

  function wraith(ctx, r, p, cx, base, s) {
    const h = 190 * s, sh = base - h + 34 * s;
    const hem = 30 + r() * 30;
    silhouette(ctx, p, () => {
      ctx.beginPath();
      ctx.moveTo(cx - 14 * s, sh);
      ctx.lineTo(cx - 22 * s, sh + 8 * s);
      ctx.lineTo(cx - (hem + 6) * s, base - 10 * s);
      // jagged hem
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const x = cx - (hem + 6) * s + (i / n) * (hem + 6) * 2 * s;
        ctx.lineTo(x, base - (i % 2 ? 0 : 14 + r() * 18) * s);
      }
      ctx.lineTo(cx + 22 * s, sh + 8 * s);
      ctx.lineTo(cx + 14 * s, sh);
      ctx.closePath();
      // head / helmet
      ctx.moveTo(cx + 9 * s, sh - 4 * s);
      ctx.ellipse(cx, sh - 16 * s, 9 * s, 14 * s, 0, 0, Math.PI * 2);
      // legs
      ctx.rect(cx - 9 * s, base - 16 * s, 4 * s, 20 * s);
      ctx.rect(cx + 5 * s, base - 16 * s, 4 * s, 20 * s);
    });
    visor(ctx, p, cx, sh - 18 * s, 12 * s);
    // long weapon
    if (r() < 0.7) {
      ctx.save(); ctx.strokeStyle = p.ink; ctx.lineWidth = 4 * s; ctx.shadowColor = p.accent; ctx.shadowBlur = 8;
      const a = -0.5 + r() * 0.3;
      ctx.beginPath(); ctx.moveTo(cx + 18 * s, sh + 40 * s);
      ctx.lineTo(cx + 18 * s + Math.cos(a) * 110 * s, sh + 40 * s + Math.sin(a) * 110 * s); ctx.stroke();
      ctx.restore();
    }
    // coat seams
    ctx.save(); ctx.strokeStyle = hexA(p.accent, 0.25); ctx.lineWidth = 0.6;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(cx + (r() - 0.5) * 20 * s, sh + 12 * s);
      ctx.lineTo(cx + (r() - 0.5) * hem * 2 * s, base - 12 * s); ctx.stroke();
    }
    ctx.restore();
  }

  function saint(ctx, r, p, cx, base, s) {
    const h = 200 * s, head = base - h + 20 * s;
    halo(ctx, r, p, cx, head - 4 * s, 26 * s + r() * 14 * s);
    // wings of ribs
    ctx.save(); ctx.strokeStyle = p.ink; ctx.shadowColor = p.accent; ctx.shadowBlur = 6;
    const ribs = 10 + (r() * 8 | 0);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < ribs; i++) {
        const a = -Math.PI / 2 + side * (0.35 + i / ribs * 1.6);
        const len = (90 + r() * 70) * s;
        ctx.lineWidth = (2.5 - i / ribs * 1.8) * s;
        ctx.beginPath(); ctx.moveTo(cx + side * 10 * s, head + 34 * s);
        ctx.quadraticCurveTo(cx + side * 40 * s + Math.cos(a) * len * 0.4, head + Math.sin(a) * len * 0.5,
          cx + Math.cos(a) * len, head + 30 * s + Math.sin(a) * len * 0.8);
        ctx.stroke();
      }
    }
    ctx.restore();
    silhouette(ctx, p, () => {
      ctx.beginPath();
      // robe
      ctx.moveTo(cx - 12 * s, head + 18 * s);
      ctx.lineTo(cx - 44 * s, base);
      ctx.lineTo(cx + 44 * s, base);
      ctx.lineTo(cx + 12 * s, head + 18 * s);
      ctx.closePath();
      // bowed head with hood
      ctx.moveTo(cx + 12 * s, head + 4 * s);
      ctx.ellipse(cx, head + 4 * s, 12 * s, 16 * s, 0.15, 0, Math.PI * 2);
      // outstretched arms
      ctx.moveTo(cx - 12 * s, head + 26 * s);
      ctx.lineTo(cx - 70 * s, head + 20 * s + r() * 20 * s);
      ctx.lineTo(cx - 70 * s, head + 26 * s + r() * 20 * s);
      ctx.lineTo(cx - 10 * s, head + 38 * s);
      ctx.moveTo(cx + 12 * s, head + 26 * s);
      ctx.lineTo(cx + 70 * s, head + 20 * s + r() * 20 * s);
      ctx.lineTo(cx + 70 * s, head + 26 * s + r() * 20 * s);
      ctx.lineTo(cx + 10 * s, head + 38 * s);
    });
    // dangling cables from arms
    ctx.save(); ctx.strokeStyle = p.ink; ctx.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1, x = cx + side * (20 + r() * 50) * s;
      ctx.beginPath(); ctx.moveTo(x, head + 30 * s);
      ctx.bezierCurveTo(x + (r() - 0.5) * 30, head + 90 * s, x + (r() - 0.5) * 40, base - 30, x + (r() - 0.5) * 20, H + 10);
      ctx.stroke();
    }
    ctx.restore();
    // sutured face-line
    visor(ctx, p, cx, head + 2 * s, 8 * s);
    // robe sigil
    ctx.save(); ctx.strokeStyle = hexA(p.accent, 0.7); ctx.lineWidth = 1; ctx.shadowColor = p.accent; ctx.shadowBlur = 6;
    const sy = head + 70 * s;
    ctx.beginPath(); ctx.moveTo(cx, sy - 14 * s); ctx.lineTo(cx, sy + 30 * s);
    ctx.moveTo(cx - 10 * s, sy); ctx.lineTo(cx + 10 * s, sy); ctx.stroke();
    ctx.restore();
  }

  function construct(ctx, r, p, cx, base, s) {
    const tw = (40 + r() * 30) * s, th = (70 + r() * 30) * s;
    const ty = base - th - 70 * s;
    const arms = 2 + (r() * 3 | 0);
    // limbs
    ctx.save(); ctx.strokeStyle = p.ink; ctx.lineCap = 'square'; ctx.shadowColor = p.accent; ctx.shadowBlur = 10;
    for (let i = 0; i < arms; i++) {
      for (let side = -1; side <= 1; side += 2) {
        const sx = cx + side * tw / 2, sy = ty + 12 * s + i * 18 * s;
        const ex = sx + side * (40 + r() * 50) * s, ey = sy + (r() - 0.3) * 60 * s;
        const fx = ex + side * (10 + r() * 30) * s, fy = ey + (20 + r() * 50) * s;
        ctx.lineWidth = (7 - i * 1.5) * s;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.fillStyle = p.ink; ctx.beginPath(); ctx.arc(ex, ey, 4 * s, 0, Math.PI * 2); ctx.fill();
      }
    }
    // digitigrade legs
    ctx.lineWidth = 8 * s;
    for (let side = -1; side <= 1; side += 2) {
      const hx = cx + side * tw * 0.3, hy = ty + th;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + side * 22 * s, hy + 32 * s);
      ctx.lineTo(hx + side * 8 * s, base - 4 * s); ctx.lineTo(hx + side * 26 * s, base); ctx.stroke();
    }
    ctx.restore();
    silhouette(ctx, p, () => {
      ctx.beginPath();
      ctx.moveTo(cx - tw / 2, ty); ctx.lineTo(cx + tw / 2, ty);
      ctx.lineTo(cx + tw / 2 - 8 * s, ty + th); ctx.lineTo(cx - tw / 2 + 8 * s, ty + th); ctx.closePath();
      // head block
      ctx.rect(cx - 11 * s, ty - 26 * s, 22 * s, 24 * s);
      // shoulder plates
      ctx.rect(cx - tw / 2 - 10 * s, ty - 4 * s, 18 * s, 14 * s);
      ctx.rect(cx + tw / 2 - 8 * s, ty - 4 * s, 18 * s, 14 * s);
    });
    glowEye(ctx, p, cx, ty - 14 * s, 3.2 * s);
    // panel lines
    ctx.save(); ctx.strokeStyle = hexA(p.accent, 0.35); ctx.lineWidth = 0.6;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(cx - tw / 2 + 6, ty + i * th / 6); ctx.lineTo(cx + tw / 2 - 6, ty + i * th / 6); ctx.stroke(); }
    ctx.fillStyle = hexA(p.accent, 0.8);
    for (let i = 0; i < 6; i++) ctx.fillRect(cx - tw / 2 + 8 + i * 4, ty + th - 10 * s, 2, 2);
    ctx.restore();
  }

  function serpent(ctx, r, p, cx, base, s) {
    const segs = 34, amp = 40 + r() * 40, freq = 1.5 + r() * 2, ph = r() * 6;
    const pts = [];
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      pts.push([W * 0.05 + t * W * 0.9, base - 50 - t * 90 * s + Math.sin(t * freq * Math.PI + ph) * amp * s]);
    }
    ctx.save();
    for (let i = 0; i < segs; i++) {
      const [x, y] = pts[i], rad = (4 + i / segs * 16) * s;
      // ribs
      ctx.strokeStyle = p.ink; ctx.lineWidth = 2; ctx.shadowColor = p.accent; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(x, y - rad); ctx.lineTo(x - 4, y - rad * 2.1); ctx.moveTo(x, y + rad); ctx.lineTo(x - 4, y + rad * 2.1); ctx.stroke();
      ctx.fillStyle = p.ink; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hexA(p.accent, 0.4); ctx.lineWidth = 0.6; ctx.shadowBlur = 0; ctx.stroke();
    }
    // skull
    const [hx, hy] = pts[segs - 1];
    silhouette(ctx, p, () => {
      ctx.beginPath(); ctx.moveTo(hx, hy - 20 * s); ctx.lineTo(hx + 50 * s, hy - 6 * s); ctx.lineTo(hx + 56 * s, hy + 8 * s);
      ctx.lineTo(hx + 20 * s, hy + 12 * s); ctx.lineTo(hx + 40 * s, hy + 22 * s); ctx.lineTo(hx, hy + 20 * s); ctx.closePath();
    });
    glowEye(ctx, p, hx + 26 * s, hy - 4 * s, 3 * s);
    ctx.restore();
  }

  function eye(ctx, r, p, cx, cy, s) {
    const R = (70 + r() * 30) * s;
    // tendrils
    ctx.save(); ctx.strokeStyle = p.ink; ctx.shadowColor = p.accent; ctx.shadowBlur = 8;
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, len = R * (1.4 + r() * 2);
      ctx.lineWidth = 1 + r() * 4;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8);
      ctx.quadraticCurveTo(cx + Math.cos(a + 0.4) * len * 0.6, cy + Math.sin(a + 0.4) * len * 0.6, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
    silhouette(ctx, p, () => { ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); });
    // iris rings
    ctx.save();
    const ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.7);
    ig.addColorStop(0, hexA(p.hot, 0.9)); ig.addColorStop(0.35, hexA(p.accent, 0.8)); ig.addColorStop(1, hexA(p.accent, 0));
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(cx, cy, R * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(p.ink, 0.8);
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2);
      ctx.lineTo(cx + Math.cos(a) * R * 0.66, cy + Math.sin(a) * R * 0.66); ctx.stroke();
    }
    ctx.fillStyle = p.ink;
    ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.07, R * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(p.hot, 0.5); ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, R * (0.72 + k * 0.1), r() * 6, r() * 6 + 2 + r() * 3); ctx.stroke(); }
    ctx.restore();
    // satellite eyes
    for (let i = 0; i < 5 + r() * 6; i++) {
      const a = r() * Math.PI * 2, d = R * (1.3 + r() * 1.2);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7;
      ctx.save(); ctx.fillStyle = p.ink; ctx.shadowColor = p.accent; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.ellipse(x, y, 9 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      glowEye(ctx, p, x, y, 1.8 * s);
    }
  }

  function structure(ctx, r, p, cx, base, s) {
    // monolithic gate with nested arches receding
    const gw = (120 + r() * 60) * s, gh = (220 + r() * 40) * s;
    const top = base - gh;
    ctx.save();
    for (let k = 10; k >= 0; k--) {
      const f = Math.pow(0.8, k);
      const w = gw * f, h = gh * f, y = base - h - (1 - f) * 40;
      ctx.strokeStyle = hexA(p.accent, 0.1 + (10 - k) * 0.05); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - w / 2, y + h); ctx.lineTo(cx - w / 2, y + w / 2);
      ctx.arc(cx, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(cx + w / 2, y + h); ctx.stroke();
    }
    // inner light
    const ig = ctx.createRadialGradient(cx, base - gh * 0.35, 0, cx, base - gh * 0.35, gw * 0.5);
    ig.addColorStop(0, hexA(p.hot, 0.8)); ig.addColorStop(0.4, hexA(p.accent, 0.35)); ig.addColorStop(1, hexA(p.accent, 0));
    ctx.fillStyle = ig; ctx.fillRect(cx - gw, top, gw * 2, gh);
    ctx.restore();
    // frame pillars
    silhouette(ctx, p, () => {
      ctx.beginPath();
      ctx.rect(cx - gw / 2 - 26 * s, top - 20 * s, 26 * s, gh + 30);
      ctx.rect(cx + gw / 2, top - 20 * s, 26 * s, gh + 30);
      ctx.rect(cx - gw / 2 - 40 * s, top - 34 * s, gw + 80 * s, 16 * s);
    });
    // tiny figure in the gate — the scale is the horror
    ctx.save(); ctx.fillStyle = p.ink;
    const fx = cx + (r() - 0.5) * gw * 0.3, fy = base - 4;
    ctx.fillRect(fx - 1.5, fy - 12, 3, 12); ctx.beginPath(); ctx.arc(fx, fy - 14, 2, 0, 7); ctx.fill();
    ctx.restore();
    // stairs
    ctx.save(); ctx.fillStyle = p.ink;
    for (let i = 0; i < 8; i++) ctx.fillRect(cx - gw / 2 - 40 - i * 10, base - 4 + i * 3, gw + 80 + i * 20, 3);
    ctx.restore();
  }

  function swarm(ctx, r, p, cx, cy, s) {
    const n = 60 + (r() * 60 | 0);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * 150 * s;
      const x = cx + Math.cos(a) * d * 1.3, y = cy + Math.sin(a) * d * 0.8;
      const sz = (2 + r() * 7) * s * (1 - d / (200 * s));
      ctx.save(); ctx.translate(x, y); ctx.rotate(r() * 6);
      ctx.fillStyle = p.ink; ctx.shadowColor = p.accent; ctx.shadowBlur = 6;
      ctx.beginPath();
      // moth-like wing pairs
      ctx.ellipse(-sz, 0, sz, sz * 0.5, -0.4, 0, Math.PI * 2);
      ctx.ellipse(sz, 0, sz, sz * 0.5, 0.4, 0, Math.PI * 2);
      ctx.fill();
      if (r() < 0.3) { ctx.fillStyle = p.hot; ctx.fillRect(-0.5, -0.5, 1.5, 1.5); }
      ctx.restore();
    }
    // central nucleus
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 50 * s);
    g.addColorStop(0, hexA(p.hot, 0.6)); g.addColorStop(1, hexA(p.accent, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 50 * s, 0, 7); ctx.fill();
  }

  // ─── overlays ───
  const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ０１２３４５６７８９ΣΔΨΩ⌬⌖⍟⎔◬▚▞░▒▓';
  function glyphColumns(ctx, r, p) {
    ctx.save(); ctx.font = '9px monospace'; ctx.fillStyle = hexA(p.accent, 0.35);
    const cols = 3 + (r() * 5 | 0);
    for (let c = 0; c < cols; c++) {
      const x = r() * W, y0 = r() * H * 0.5, len = 6 + (r() * 18 | 0);
      for (let i = 0; i < len; i++) ctx.fillText(GLYPHS[r() * GLYPHS.length | 0], x, y0 + i * 10);
    }
    // HUD brackets & coordinate readouts
    ctx.fillStyle = hexA(p.accent, 0.55); ctx.font = '8px monospace';
    ctx.fillText(`LAT ${(r() * 9999 | 0).toString().padStart(4, '0')}.${r() * 99 | 0}  STR-${(r() * 0xffff | 0).toString(16).toUpperCase()}`, 10, H - 10);
    ctx.fillText(`▚ LV.${-(r() * 99999 | 0)}`, W - 80, 16);
    ctx.restore();
  }

  function particles(ctx, r, p, n) {
    ctx.save();
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = r() < 0.2 ? hexA(p.hot, 0.8) : hexA(p.accent, 0.3 + r() * 0.3);
      const sz = r() < 0.9 ? 1 : 2;
      ctx.fillRect(r() * W, r() * H, sz, sz);
    }
    ctx.restore();
  }

  function postprocess(ctx, r, p, intensity) {
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data, src = new Uint8ClampedArray(d);
    // glitch bands: horizontal row displacement
    const bands = [];
    const nb = Math.round(2 + intensity * 10 * r());
    for (let i = 0; i < nb; i++) bands.push({ y: r() * H | 0, h: 1 + (r() * 14 * intensity | 0), dx: ((r() - 0.5) * 70 * intensity) | 0 });
    const rowShift = new Int16Array(H);
    for (const b of bands) for (let y = b.y; y < Math.min(H, b.y + b.h); y++) rowShift[y] = b.dx;
    const ca = 1 + Math.round(intensity * 3);
    let seed = (r() * 1e9) | 0;
    for (let y = 0; y < H; y++) {
      const sh = rowShift[y], extra = sh ? 4 : 0;
      const scan = (y % 3 === 0) ? 0.78 : 1;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const sx = Math.min(W - 1, Math.max(0, x - sh));
        const rx = Math.min(W - 1, sx + ca + extra), bx = Math.max(0, sx - ca - extra);
        const row = y * W * 4;
        seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
        const n = ((seed & 255) - 128) * 0.12;
        d[i] = (src[row + rx * 4] + n) * scan;
        d[i + 1] = (src[row + sx * 4 + 1] + n) * scan;
        d[i + 2] = (src[row + bx * 4 + 2] + n) * scan;
      }
    }
    // datamosh smear blocks: stretch one row down a rectangle
    const smears = Math.round(intensity * 4 * r());
    for (let k = 0; k < smears; k++) {
      const x0 = r() * W | 0, w = 10 + (r() * 80 | 0), y0 = r() * H | 0, h = 10 + (r() * 60 | 0);
      for (let x = x0; x < Math.min(W, x0 + w); x++) {
        const si = (y0 * W + x) * 4;
        for (let y = y0 + 1; y < Math.min(H, y0 + h); y++) {
          const di = (y * W + x) * 4;
          d[di] = d[si]; d[di + 1] = d[si + 1]; d[di + 2] = d[si + 2];
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    // occasional signal-bar
    if (r() < intensity * 0.6) {
      ctx.fillStyle = hexA(p.hot, 0.25);
      ctx.fillRect(0, r() * H, W, 2 + r() * 3);
    }
    // vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  function render(card) {
    if (cache.has(card.id)) return cache.get(card.id);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const r = mulberry(hash(card.id + card.name));
    const p = PAL[card.faction] || PAL.null;
    const cx = W * (0.4 + r() * 0.2);

    background(ctx, r, p);
    girders(ctx, r, p);
    towers(ctx, r, p, 0);
    cables(ctx, r, p, 6, false);
    towers(ctx, r, p, 1);
    beam(ctx, r, p, cx);
    particles(ctx, r, p, 120);

    const base = H - 6;
    const s = 0.95 + r() * 0.25;
    switch (card.figure) {
      case 'wraith': wraith(ctx, r, p, cx, base, s * 1.3); break;
      case 'saint': saint(ctx, r, p, cx, base + 20, s * 1.15); break;
      case 'construct': construct(ctx, r, p, cx, base, s * 1.1); break;
      case 'serpent': serpent(ctx, r, p, cx, base, s); break;
      case 'eye': eye(ctx, r, p, cx, H * 0.45, s); break;
      case 'structure': structure(ctx, r, p, cx, base, s); break;
      case 'swarm': swarm(ctx, r, p, cx, H * 0.48, s); break;
    }
    // foreground: near towers framing the edges, dark cables
    ctx.save(); ctx.globalAlpha = 0.9;
    ctx.fillStyle = p.ink;
    ctx.fillRect(0, 0, 10 + r() * 30, H);
    ctx.fillRect(W - 10 - r() * 30, 0, 40, H);
    ctx.restore();
    cables(ctx, r, p, 3, true);
    glyphColumns(ctx, r, p);
    particles(ctx, r, p, 40);

    const rarBoost = { C: 0, U: 0.1, R: 0.2, SR: 0.35, GX: 0.8 }[card.rarity] || 0;
    postprocess(ctx, r, p, Math.min(1.2, p.glitch * 0.6 + rarBoost));

    const data = cv.toDataURL('image/jpeg', 0.9);
    let url = data;
    try {
      const bin = atob(data.split(',')[1]), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      url = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
    } catch (e) { /* fall back to the data URI */ }
    cache.set(card.id, url);
    return url;
  }

  return { render, hash, mulberry };
})();
