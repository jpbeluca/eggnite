import * as THREE from "three";
import { Environment } from "./environment.js";
import { Effects } from "./effects.js";
import { EnemyManager } from "./enemies.js";
import { Weapons, WEAPON_DEFS } from "./weapons.js";
import { Player } from "./player.js";
import { InputManager } from "./input.js";
import { UI } from "./ui.js";
import { AudioEngine } from "./audio.js";

class Game {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.ui = new UI();
    this.audio = new AudioEngine();
    this.input = new InputManager(this.canvas);
    this.ui.setTouch(this.input.isTouch);

    this.state = "menu";  // menu | playing | paused | gameover
    this.clock = new THREE.Clock();
    this.baseFov = 78;
    this.shake = 0;

    this.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.waveBreak = 0;
    this.betweenWaves = false;
    this.lastDamageTime = 0;
    this.gameTime = 0;
    this.best = parseInt(localStorage.getItem("eggnite_best") || "0", 10);

    this._initRenderer();
    this._initScene();
    this._buildWorld();
    this._initSystems();
    this._bindUI();

    window.addEventListener("resize", () => this._onResize());

    this.ui.setLoading("Pronto. Boa caçada!", true);
    this.clock.start();
    this._loop();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.baseFov, window.innerWidth / window.innerHeight, 0.05, 1200);
    this.camera.position.set(0, 2, 0);
    this.scene.add(this.camera); // so the weapon rig (child of camera) renders
  }

  _buildWorld() {
    this.env = new Environment(this.scene);
    this.env.build();
  }

  _initSystems() {
    this.effects = new Effects(this.scene, this.env);
    this.enemyMgr = new EnemyManager(this.scene, this.env, this.effects, this.audio);
    this.player = new Player(this.camera, this.env);
    this.weapons = new Weapons(this.camera, this.scene, this.enemyMgr, this.effects, this.audio, this.env);

    // wire weapon callbacks -> UI
    this.weapons.onAmmoChange = (cur, mag) => this.ui.setAmmo(cur, mag);
    this.weapons.onWeaponChange = (i, def) => this.ui.setWeapon(i, def);
    this.weapons.onReloadStart = () => this.ui.setReloading(true);
    this.weapons.onReloadEnd = () => this.ui.setReloading(false);
    this.weapons.onPlayerRecoil = (p, y) => this.player.addRecoil(p, y);
    this.weapons.onHit = (res, point) => {
      this.ui.hitmarkerFlash();
      if (res.killed) {
        this.kills++;
        this.score += res.breed.score;
        this.ui.setScore(this.score);
        this.shake = Math.min(0.5, this.shake + 0.12);
      }
    };

    // footsteps
    this.player.onStep = () => { /* subtle — left silent to avoid clutter */ };
  }

  _bindUI() {
    document.getElementById("start-btn").addEventListener("click", () => this.start());
    document.getElementById("restart-btn").addEventListener("click", () => this.start());
    document.getElementById("resume-btn").addEventListener("click", () => this.resume());

    this.input.onFirstInteract = () => { this.audio.init(); this.audio.resume(); };

    if (this.input.isTouch) {
      this.input.initTouch({
        stick: document.getElementById("move-stick"),
        knob: document.querySelector("#move-stick .joy-knob"),
        fireBtn: document.getElementById("btn-fire"),
        aimBtn: document.getElementById("btn-aim"),
        reloadBtn: document.getElementById("btn-reload"),
        jumpBtn: document.getElementById("btn-jump"),
        slots: Array.from(document.querySelectorAll(".wpn-slot")),
        lookCatcher: this.canvas,
      });
    } else {
      this.input.initDesktop();
      this.input.onPauseLost = () => { if (this.state === "playing") this.pause(); };
    }
  }

  // ---------------- game flow ----------------
  start() {
    this.audio.init(); this.audio.resume();
    this.ui.hideMenu();
    this.ui.hideGameOver();
    this.ui.startHUD();

    // reset state
    this.enemyMgr.clear();
    this.player.reset();
    this.weapons.resetAmmo();
    this.weapons.switchTo(0);
    this.weapons.current = 0;
    this.models_visible_reset();
    this.input.reset();
    this.score = 0; this.kills = 0; this.wave = 0;
    this.toSpawn = 0; this.spawnTimer = 0; this.betweenWaves = false; this.waveBreak = 0;
    this.shake = 0; this.gameTime = 0;

    this.ui.setHealth(this.player.health, this.player.maxHealth);
    this.ui.setAmmo(this.weapons.ammo[0], WEAPON_DEFS[0].mag);
    this.ui.setWeapon(0, WEAPON_DEFS[0]);
    this.ui.setScore(0);

    this.state = "playing";
    this._startNextWave();

    if (!this.input.isTouch) this.canvas.requestPointerLock?.();
  }

  models_visible_reset() {
    this.weapons.models.forEach((m, i) => (m.group.visible = i === this.weapons.current));
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.input.firing = false;
    this.ui.showPause();
  }
  resume() {
    if (this.state !== "paused") return;
    this.ui.hidePause();
    this.state = "playing";
    if (!this.input.isTouch) this.canvas.requestPointerLock?.();
  }

  gameOver() {
    this.state = "gameover";
    if (this.score > this.best) { this.best = this.score; localStorage.setItem("eggnite_best", String(this.best)); }
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.ui.showGameOver({ kills: this.kills, wave: this.wave, score: this.score, best: this.best });
  }

  _startNextWave() {
    this.wave++;
    this.toSpawn = 4 + Math.floor(this.wave * 1.6);
    this.spawnTimer = 0;
    this.betweenWaves = false;
    this.ui.setWave(this.wave);
    this.ui.message(`ONDA ${this.wave}`, false, 1800);
    this.audio.waveStart();
  }

  _spawnOne() {
    // spawn at a ring around the player, away from view ideally
    const ang = Math.random() * Math.PI * 2;
    const dist = 28 + Math.random() * 22;
    let x = this.player.position.x + Math.cos(ang) * dist;
    let z = this.player.position.z + Math.sin(ang) * dist;
    const lim = this.env.size - 6;
    x = THREE.MathUtils.clamp(x, -lim, lim);
    z = THREE.MathUtils.clamp(z, -lim, lim);
    this.enemyMgr.spawn(this.wave, new THREE.Vector3(x, 0, z));
  }

  _updateWaves(dt) {
    if (this.betweenWaves) {
      this.waveBreak -= dt;
      if (this.waveBreak <= 0) this._startNextWave();
      return;
    }
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this._spawnOne();
        this.toSpawn--;
        this.spawnTimer = Math.max(0.35, 1.4 - this.wave * 0.06);
      }
    } else if (this.enemyMgr.aliveCount === 0) {
      // wave cleared
      this.betweenWaves = true;
      this.waveBreak = 4.0;
      const bonus = this.wave * 50;
      this.score += bonus;
      this.ui.setScore(this.score);
      this.ui.message(`ONDA LIMPA! +${bonus}`, false, 2200);
      this.player.heal(25);
      this.ui.setHealth(this.player.health, this.player.maxHealth);
      this.audio.pickup();
    }
  }

  // ---------------- loop ----------------
  _loop() {
    requestAnimationFrame(() => this._loop());
    let dt = this.clock.getDelta();
    dt = Math.min(dt, 0.05); // clamp big frame gaps
    this.gameTime += dt;

    if (this.state === "playing") this._updatePlaying(dt);
    else this._updateIdle(dt);

    this.env.update(dt, this.gameTime);
    this.effects.update(dt);

    this.renderer.render(this.scene, this.camera);
  }

  _updateIdle(dt) {
    // slow cinematic orbit at the menu / pause / gameover
    if (this.state === "menu" || this.state === "gameover" || this.state === "paused") {
      const r = 6;
      const a = this.gameTime * 0.08;
      this.camera.position.set(Math.cos(a) * r, 2.4 + Math.sin(this.gameTime * 0.3) * 0.2, Math.sin(a) * r);
      this.camera.lookAt(0, 1.5, -4);
    }
    // keep weapons rig idle-updated so nothing snaps
    this.weapons.update(dt, this.gameTime);
  }

  _updatePlaying(dt) {
    // input
    const look = this.input.getLookDelta();
    if (look.x || look.y) this.player.look(look.x, look.y, this.input.isTouch);

    // weapon switching
    const wreq = this.input.consumeWeaponReq();
    if (wreq !== null) this.weapons.switchTo(wreq);
    if (this.input.consumeNextWeapon()) this.weapons.next();

    // reload
    if (this.input.consumeReload()) this.weapons.startReload();

    // aim
    this.weapons.setAiming(this.input.aiming);
    this.player.adsFactor = this.weapons.adsAmount;
    this.ui.setAiming(this.weapons.adsAmount > 0.5);

    // fire (trigger state)
    this.weapons.setTrigger(this.input.firing);

    // player movement
    const jump = this.input.consumeJump();
    this.player.update(dt, this.input.move, this.input.running, jump, this.enemyMgr.getColliders());

    // weapon view bob from player
    this.weapons.setBob(this.player.bobOffset, this.player.bobRot);
    this.weapons.update(dt, this.gameTime);

    // ADS fov
    const targetFov = this.baseFov / (1 + (this.weapons.def.adsZoom - 1) * this.weapons.adsAmount);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
    this.camera.updateProjectionMatrix();

    // enemies
    this.enemyMgr.update(dt, this.gameTime, this.player.position, (dmg, pos) => {
      this.player.takeDamage(dmg);
      this.ui.setHealth(this.player.health, this.player.maxHealth);
      this.ui.hurtFlash(dmg / 20);
      this.audio.hurt();
      this.shake = Math.min(0.6, this.shake + 0.18);
      this.lastDamageTime = this.gameTime;
      if (this.player.dead) this.gameOver();
    });

    this.ui.setEnemies(this.enemyMgr.aliveCount + this.toSpawn);

    // slow regen when not recently hurt
    if (!this.player.dead && this.gameTime - this.lastDamageTime > 6 && this.player.health < this.player.maxHealth) {
      this.player.heal(6 * dt);
      this.ui.setHealth(this.player.health, this.player.maxHealth);
    }

    // waves
    this._updateWaves(dt);

    // camera shake
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5);
      const s = this.shake * 0.05;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}

window.addEventListener("DOMContentLoaded", () => {
  try {
    window.__game = new Game();
  } catch (err) {
    console.error(err);
    const note = document.getElementById("loadnote");
    if (note) note.textContent = "Erro ao iniciar o motor 3D: " + err.message;
  }
});
