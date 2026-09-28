// Keyboard + gamepad + touch input, unified into actions.
const MAP = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  ok: ['Enter', 'Space', 'KeyE'], back: ['Escape', 'Backspace', 'KeyX'], menu: ['KeyM', 'Tab'],
  camL: ['KeyQ'], camR: ['KeyR'], walk: ['ShiftLeft', 'ShiftRight'],
};

export const Input = {
  down: new Set(),
  pressed: new Set(),
  stick: { x: 0, y: 0 },   // touch joystick
  dragX: 0,                // camera drag delta
  pad: null,
  _padPrev: {},

  init() {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());

    // camera drag (mouse / single touch outside the joystick)
    let dragging = null;
    const canvas = document.getElementById('gl');
    canvas.addEventListener('pointerdown', (e) => { dragging = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (dragging !== null) { this.dragX += e.clientX - dragging; dragging = e.clientX; } });
    canvas.addEventListener('pointerup', () => { dragging = null; });

    // touch joystick + buttons
    const joy = document.getElementById('joy'), knob = joy?.querySelector('.knob');
    if (joy) {
      let id = null, cx = 0, cy = 0;
      joy.addEventListener('pointerdown', (e) => {
        id = e.pointerId; joy.setPointerCapture(id);
        const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      });
      joy.addEventListener('pointermove', (e) => {
        if (e.pointerId !== id) return;
        let dx = (e.clientX - cx) / 50, dy = (e.clientY - cy) / 50;
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        this.stick.x = dx; this.stick.y = dy;
        knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
      });
      const end = () => { id = null; this.stick.x = this.stick.y = 0; knob.style.transform = ''; };
      joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
    }
    document.querySelectorAll('[data-btn]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pressed.add('Touch_' + b.dataset.btn); });
    });
    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  },

  /** Poll gamepad once per frame, mapping buttons to key codes. */
  update() {
    const pads = navigator.getGamepads?.() || [];
    const p = [...pads].find(Boolean);
    if (!p) return;
    const b = (i) => p.buttons[i]?.pressed;
    const map = { 0: 'Enter', 1: 'Escape', 9: 'KeyM', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 4: 'KeyQ', 5: 'KeyR' };
    for (const [i, code] of Object.entries(map)) {
      const now = b(+i);
      if (now && !this._padPrev[i]) this.pressed.add(code);
      if (now) this.down.add('Pad_' + code); else this.down.delete('Pad_' + code);
      this._padPrev[i] = now;
    }
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    this.stick.x = Math.abs(ax) > 0.15 ? ax : 0;
    this.stick.y = Math.abs(ay) > 0.15 ? ay : 0;
    if (Math.abs(p.axes[2] || 0) > 0.2) this.dragX += p.axes[2] * 6;
  },

  held(action) {
    return MAP[action].some((c) => this.down.has(c) || this.down.has('Pad_' + c));
  },

  hit(action) {
    return MAP[action].some((c) => this.pressed.has(c)) || this.pressed.has('Touch_' + action);
  },

  /** Movement vector from keys or stick: x right, y forward. */
  move() {
    let x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let y = (this.held('up') ? 1 : 0) - (this.held('down') ? 1 : 0);
    if (this.stick.x || this.stick.y) { x = this.stick.x; y = -this.stick.y; }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  },

  endFrame() {
    this.pressed.clear();
    this.dragX = 0;
  },
};
