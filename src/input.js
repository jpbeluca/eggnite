// Unified input. Desktop: pointer-lock mouse look + WASD/keys. Mobile: left
// virtual joystick (move), right-half drag (look) and on-screen buttons.
// The game polls this each frame; edge events are consumed via consume* methods.

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;

    this.move = { x: 0, y: 0 };       // -1..1
    this.lookDX = 0; this.lookDY = 0; // accumulated, consumed per frame
    this.running = false;
    this.firing = false;
    this.aiming = false;

    this._jumpEdge = false;
    this._reloadEdge = false;
    this._weaponReq = null;   // index
    this._nextWeaponEdge = false;

    this.locked = false;
    this.enabled = false;
    this.onPauseLost = null;  // pointer lock lost
    this.onFirstInteract = null;

    this.keys = {};
  }

  getLookDelta() {
    const d = { x: this.lookDX, y: this.lookDY };
    this.lookDX = 0; this.lookDY = 0;
    return d;
  }
  consumeJump() { const j = this._jumpEdge; this._jumpEdge = false; return j; }
  consumeReload() { const r = this._reloadEdge; this._reloadEdge = false; return r; }
  consumeWeaponReq() { const w = this._weaponReq; this._weaponReq = null; return w; }
  consumeNextWeapon() { const n = this._nextWeaponEdge; this._nextWeaponEdge = false; return n; }

  // ---------- DESKTOP ----------
  initDesktop() {
    const requestLock = () => {
      if (!this.enabled) return;
      this.canvas.requestPointerLock?.();
    };
    this.canvas.addEventListener("click", () => {
      this.onFirstInteract?.();
      requestLock();
    });

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.enabled) this.onPauseLost?.();
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX || 0;
      this.lookDY += e.movementY || 0;
    });

    document.addEventListener("mousedown", (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.aiming = true;
    });
    document.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.aiming = false;
    });
    window.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
      switch (e.code) {
        case "Space": this._jumpEdge = true; break;
        case "KeyR": this._reloadEdge = true; break;
        case "Digit1": this._weaponReq = 0; break;
        case "Digit2": this._weaponReq = 1; break;
        case "Digit3": this._weaponReq = 2; break;
        case "KeyQ": this._nextWeaponEdge = true; break;
      }
      this._updateKeyMove();
    });
    document.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
      this._updateKeyMove();
    });
  }

  _updateKeyMove() {
    let x = 0, y = 0;
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) y += 1;
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) y -= 1;
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) x += 1;
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) x -= 1;
    this.move.x = x; this.move.y = y;
    this.running = !!(this.keys["ShiftLeft"] || this.keys["ShiftRight"]);
  }

  // ---------- MOBILE ----------
  initTouch(els) {
    const { stick, knob, fireBtn, aimBtn, reloadBtn, jumpBtn, slots, lookCatcher } = els;

    // movement joystick
    let stickId = null;
    const stickRect = () => stick.getBoundingClientRect();
    const maxR = 50;
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    const resetKnob = () => { knob.style.transform = "translate(0,0)"; this.move.x = 0; this.move.y = 0; };

    stick.addEventListener("pointerdown", (e) => {
      stickId = e.pointerId; stick.setPointerCapture(e.pointerId);
      this.onFirstInteract?.();
      e.preventDefault();
    });
    stick.addEventListener("pointermove", (e) => {
      if (e.pointerId !== stickId) return;
      const r = stickRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; }
      setKnob(dx, dy);
      this.move.x = dx / maxR;
      this.move.y = -dy / maxR;        // up = forward
      this.running = len > maxR * 0.92; // push to edge to sprint
    });
    const endStick = (e) => { if (e.pointerId === stickId) { stickId = null; resetKnob(); this.running = false; } };
    stick.addEventListener("pointerup", endStick);
    stick.addEventListener("pointercancel", endStick);

    // look zone — anywhere not on a control, handled on the canvas/look catcher
    let lookId = null, lastX = 0, lastY = 0;
    const startLook = (e) => {
      if (lookId !== null) return;
      lookId = e.pointerId; lastX = e.clientX; lastY = e.clientY;
      lookCatcher.setPointerCapture?.(e.pointerId);
      this.onFirstInteract?.();
    };
    const moveLook = (e) => {
      if (e.pointerId !== lookId) return;
      this.lookDX += (e.clientX - lastX);
      this.lookDY += (e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
    };
    const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
    lookCatcher.addEventListener("pointerdown", startLook);
    lookCatcher.addEventListener("pointermove", moveLook);
    lookCatcher.addEventListener("pointerup", endLook);
    lookCatcher.addEventListener("pointercancel", endLook);

    // fire button (hold)
    const bindHold = (el, on, off) => {
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); on(); });
      el.addEventListener("pointerup", (e) => { e.preventDefault(); off?.(); });
      el.addEventListener("pointercancel", () => off?.());
      el.addEventListener("pointerleave", () => off?.());
    };
    bindHold(fireBtn, () => { this.firing = true; }, () => { this.firing = false; });

    // aim toggle
    aimBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); this.aiming = !this.aiming; aimBtn.classList.toggle("active", this.aiming); });

    // reload / jump tap
    reloadBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); this._reloadEdge = true; });
    jumpBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); this._jumpEdge = true; });

    // weapon slots
    slots.forEach((slot) => {
      slot.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this._weaponReq = parseInt(slot.dataset.weapon, 10);
      });
    });
  }

  reset() {
    this.move.x = 0; this.move.y = 0;
    this.firing = false; this.aiming = false; this.running = false;
    this.lookDX = 0; this.lookDY = 0;
    this._jumpEdge = false; this._reloadEdge = false; this._weaponReq = null; this._nextWeaponEdge = false;
  }
}
