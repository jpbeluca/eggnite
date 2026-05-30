// HUD + screen management. Pure DOM; the game pushes state changes here.

export class UI {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.hud = this.$("hud");
    this.menu = this.$("menu");
    this.gameover = this.$("gameover");
    this.pauseHint = this.$("pause-hint");
    this.touchControls = this.$("touch-controls");

    this.healthFill = this.$("health-fill");
    this.ammoCurrent = this.$("ammo-current");
    this.ammoReserve = this.$("ammo-reserve");
    this.weaponName = this.$("weapon-name");
    this.reloadHint = this.$("reload-hint");
    this.waveValue = this.$("wave-value");
    this.scoreValue = this.$("score-value");
    this.enemiesValue = this.$("enemies-value");
    this.centerMsg = this.$("center-msg");
    this.hurtOverlay = this.$("hurt-overlay");
    this.hitmarker = this.$("hitmarker");
    this.crosshair = this.$("crosshair");
    this.slots = Array.from(document.querySelectorAll(".wpn-slot"));

    this._msgTimer = null;
  }

  setTouch(isTouch) {
    document.body.classList.toggle("is-touch", isTouch);
    if (isTouch) this.touchControls.classList.remove("hidden");
  }

  showMenu() { this.menu.classList.remove("hidden"); this.hud.classList.add("hidden"); }
  hideMenu() { this.menu.classList.add("hidden"); }

  startHUD() {
    this.hud.classList.remove("hidden");
    this.gameover.classList.add("hidden");
    this.pauseHint.classList.add("hidden");
  }

  setLoading(text, ready) {
    const note = this.$("loadnote");
    if (note) note.textContent = text;
    const btn = this.$("start-btn");
    if (btn) btn.disabled = !ready;
  }

  setHealth(hp, max) {
    const pct = Math.max(0, hp / max) * 100;
    this.healthFill.style.width = pct + "%";
  }

  setAmmo(current, mag) {
    this.ammoCurrent.textContent = current;
    this.ammoReserve.textContent = "∞";
    this.ammoCurrent.classList.toggle("low", current <= Math.ceil(mag * 0.25));
  }

  setWeapon(index, def) {
    this.weaponName.textContent = def.name;
    this.slots.forEach((s, i) => s.classList.toggle("active", i === index));
  }

  setReloading(on) {
    this.reloadHint.classList.toggle("hidden", !on);
  }

  setWave(w) { this.waveValue.textContent = w; }
  setScore(s) { this.scoreValue.textContent = s; }
  setEnemies(n) { this.enemiesValue.textContent = n; }

  setAiming(on) { this.crosshair.classList.toggle("aiming", on); }

  hitmarkerFlash() {
    this.hitmarker.classList.remove("show");
    void this.hitmarker.offsetWidth; // restart animation
    this.hitmarker.classList.add("show");
  }

  hurtFlash(intensity = 1) {
    this.hurtOverlay.style.opacity = Math.min(1, intensity);
    clearTimeout(this._hurtTimer);
    this._hurtTimer = setTimeout(() => { this.hurtOverlay.style.opacity = 0; }, 90);
  }

  message(text, warn = false, duration = 1800) {
    this.centerMsg.textContent = text;
    this.centerMsg.classList.toggle("warn", warn);
    this.centerMsg.classList.add("show");
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => this.centerMsg.classList.remove("show"), duration);
  }

  showGameOver(stats) {
    this.$("go-kills").textContent = stats.kills;
    this.$("go-waves").textContent = stats.wave;
    this.$("go-score").textContent = stats.score;
    this.$("go-best").querySelector("b").textContent = stats.best;
    this.gameover.classList.remove("hidden");
    this.hud.classList.add("hidden");
  }
  hideGameOver() { this.gameover.classList.add("hidden"); }

  showPause() { this.pauseHint.classList.remove("hidden"); }
  hidePause() { this.pauseHint.classList.add("hidden"); }
}
