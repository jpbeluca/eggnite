import * as THREE from "three";

// Weapon system: three distinct firearms with view models built from primitives,
// hitscan firing (raycast), per-pellet spread, recoil, reload, ADS zoom, muzzle
// flash, tracers and view bob. Damage is dealt to EnemyManager; misses spark on
// the world geometry.

export const WEAPON_DEFS = [
  {
    id: "pistol", name: "PISTOLA XR-9", mag: 12, damage: 26, fireRate: 6.5, auto: false,
    pellets: 1, spread: 0.006, reloadTime: 1.0, recoil: 0.022, adsZoom: 1.25, sound: "pistol",
    color: 0x9aa3b2,
  },
  {
    id: "rifle", name: "FUZIL VK-7", mag: 30, damage: 18, fireRate: 11, auto: true,
    pellets: 1, spread: 0.018, reloadTime: 1.6, recoil: 0.017, adsZoom: 1.7, sound: "rifle",
    color: 0x3a4452,
  },
  {
    id: "shotgun", name: "DISPERSOR T-12", mag: 6, damage: 12, fireRate: 1.6, auto: false,
    pellets: 9, spread: 0.075, reloadTime: 2.2, recoil: 0.06, adsZoom: 1.15, sound: "shotgun",
    color: 0x5a3a2a,
  },
];

export class Weapons {
  constructor(camera, scene, enemyManager, effects, audio, environment) {
    this.camera = camera;
    this.scene = scene;
    this.enemyMgr = enemyManager;
    this.effects = effects;
    this.audio = audio;
    this.env = environment;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 300;

    this.current = 0;
    this.ammo = WEAPON_DEFS.map((w) => w.mag);   // rounds in mag (reserve is infinite)
    this.fireCooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.aiming = false;
    this.adsAmount = 0;        // 0..1
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilRecovery = 0;
    this.kickZ = 0;            // weapon backward kick
    this.bobT = 0;
    this.triggerHeld = false;

    // view model rig attached to the camera
    this.rig = new THREE.Group();
    this.camera.add(this.rig);
    this.models = WEAPON_DEFS.map((def) => this._buildModel(def));
    this.models.forEach((m, i) => { m.group.visible = i === 0; this.rig.add(m.group); });

    // tracer pool
    this.tracers = [];
    this.tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true);
    this.tracerGeo.rotateX(Math.PI / 2);
    this.tracerGeo.translate(0, 0, 0.5); // spans 0..+1 along +Z (lookAt faces +Z)

    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    this._muzzleWorld = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    // base/aim positions for the rig (camera space)
    this.basePos = new THREE.Vector3(0.32, -0.34, -0.6);
    this.aimPos = new THREE.Vector3(0.0, -0.18, -0.42);

    this.onAmmoChange = null;   // callback(current, mag)
    this.onWeaponChange = null; // callback(index, def)
    this.onPlayerRecoil = null; // callback(pitch, yaw)
  }

  get def() { return WEAPON_DEFS[this.current]; }

  _buildModel(def) {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.45, metalness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.6, metalness: 0.3 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });

    let muzzleZ = -0.5;

    if (def.id === "pistol") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.34), metal);
      body.position.set(0, 0, -0.1);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.18), dark);
      barrel.position.set(0, 0.03, -0.32);
      const gp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.1), grip);
      gp.position.set(0, -0.14, 0.0); gp.rotation.x = 0.3;
      g.add(body, barrel, gp);
      muzzleZ = -0.42;
    } else if (def.id === "rifle") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.6), metal);
      body.position.set(0, 0, -0.15);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), dark);
      barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.5);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1), dark);
      mag.position.set(0, -0.16, -0.05); mag.rotation.x = -0.15;
      const gp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.09), grip);
      gp.position.set(0, -0.13, 0.12); gp.rotation.x = 0.35;
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.18), grip);
      stock.position.set(0, -0.02, 0.24);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.05), dark);
      sight.position.set(0, 0.09, -0.2);
      g.add(body, barrel, mag, gp, stock, sight);
      muzzleZ = -0.7;
    } else { // shotgun
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.5), metal);
      body.position.set(0, 0, -0.1);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), dark);
      barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.04, -0.42);
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.16), grip);
      pump.position.set(0, -0.05, -0.3);
      const gp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), grip);
      gp.position.set(0, -0.13, 0.08); gp.rotation.x = 0.35;
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.2), grip);
      stock.position.set(0, -0.04, 0.22);
      g.add(body, barrel, pump, gp, stock);
      muzzleZ = -0.66;
    }

    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 999; o.material.depthTest = true; } });

    // muzzle marker
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, def.id === "rifle" ? 0.02 : 0.02, muzzleZ);
    g.add(muzzle);

    // muzzle flash sprite (hidden by default)
    const flashMat = new THREE.SpriteMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending });
    const flash = new THREE.Sprite(flashMat);
    flash.scale.set(0.4, 0.4, 0.4);
    flash.position.copy(muzzle.position);
    flash.renderOrder = 1000;
    g.add(flash);

    return { group: g, muzzle, flash, def };
  }

  switchTo(i) {
    if (i === this.current || i < 0 || i >= WEAPON_DEFS.length) return;
    if (this.reloading) { this.reloading = false; this.reloadTimer = 0; }
    this.models[this.current].group.visible = false;
    this.current = i;
    this.models[i].group.visible = true;
    this.kickZ = -0.15; // little raise animation
    this.audio.reload();
    this.onWeaponChange?.(i, this.def);
    this.onAmmoChange?.(this.ammo[i], this.def.mag);
  }

  next() { this.switchTo((this.current + 1) % WEAPON_DEFS.length); }

  setAiming(v) { this.aiming = v; }

  startReload() {
    if (this.reloading) return;
    if (this.ammo[this.current] >= this.def.mag) return;
    this.reloading = true;
    this.reloadTimer = this.def.reloadTime;
    this.audio.reload();
    this.onReloadStart?.();
  }

  setTrigger(held) {
    const was = this.triggerHeld;
    this.triggerHeld = held;
    // semi-auto fires once per fresh press; auto fires continuously in update()
    if (held && !was && !this.def.auto) this._tryFire();
  }

  update(dt, time) {
    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    // automatic fire
    if (this.triggerHeld && this.def.auto) this._tryFire();

    // reload
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.ammo[this.current] = this.def.mag;
        this.onAmmoChange?.(this.ammo[this.current], this.def.mag);
        this.onReloadEnd?.();
      }
    }

    // ADS lerp
    const target = this.aiming && !this.reloading ? 1 : 0;
    this.adsAmount += (target - this.adsAmount) * Math.min(1, dt * 12);

    // recoil recovery
    this.recoilPitch *= Math.pow(0.0015, dt);
    this.kickZ += (0 - this.kickZ) * Math.min(1, dt * 10);

    // position the rig (lerp base->aim) + bob + kick
    const rig = this.rig;
    this._tmpV.copy(this.basePos).lerp(this.aimPos, this.adsAmount);

    // view bob driven externally via setBob(); here just apply kick
    this._tmpV.z += this.kickZ;
    this._tmpV.add(this._bobOffset || ZERO);
    rig.position.copy(this._tmpV);
    rig.rotation.x = this.recoilPitch * 1.5 + (this._bobRot || 0);

    // fade muzzle flash
    const fl = this.models[this.current].flash;
    if (fl.material.opacity > 0) {
      fl.material.opacity = Math.max(0, fl.material.opacity - dt * 18);
      fl.material.rotation += dt * 20;
    }

    // tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        this.tracers.splice(i, 1);
        continue;
      }
      t.mesh.material.opacity = (t.life / t.max) * 0.7;
    }
  }

  setBob(offset, rot) { this._bobOffset = offset; this._bobRot = rot; }

  _tryFire() {
    if (this.fireCooldown > 0 || this.reloading) return;
    if (this.ammo[this.current] <= 0) {
      this.audio.dryFire();
      this.fireCooldown = 0.25;
      this.startReload();
      return;
    }
    this.fireCooldown = 1 / this.def.fireRate;
    this.ammo[this.current]--;
    this.onAmmoChange?.(this.ammo[this.current], this.def.mag);
    this._fireShot();

    if (this.ammo[this.current] <= 0) this.startReload();
  }

  _fireShot() {
    const def = this.def;
    this.audio.shot(def.sound);

    // muzzle flash
    const model = this.models[this.current];
    model.flash.material.opacity = 1;
    model.flash.scale.setScalar(0.35 + Math.random() * 0.2);
    model.muzzle.getWorldPosition(this._muzzleWorld);
    this.effects.muzzleFlash(this._muzzleWorld);

    // recoil — accuracy is better while aiming
    const accuracy = this.aiming ? 0.4 : 1.0;
    const recoilAmt = def.recoil * (this.aiming ? 0.6 : 1.0);
    this.recoilPitch += recoilAmt;
    this.kickZ = 0.12;
    const yawKick = (Math.random() - 0.5) * recoilAmt * 0.6;
    this.onPlayerRecoil?.(recoilAmt, yawKick);

    // camera forward basis
    this.camera.getWorldDirection(this._dir);
    const right = this._tmpV.crossVectors(this._dir, this.camera.up).normalize();
    const up = this._tmpV2.crossVectors(right, this._dir).normalize();

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);

    const enemyMeshes = this.enemyMgr.getColliders();

    for (let p = 0; p < def.pellets; p++) {
      const spread = def.spread * accuracy;
      const dir = this._dir.clone()
        .addScaledVector(right, (Math.random() - 0.5) * 2 * spread + (this._gaussian()) * spread)
        .addScaledVector(up, (Math.random() - 0.5) * 2 * spread + (this._gaussian()) * spread)
        .normalize();

      this.raycaster.set(origin, dir);
      let hit = null;
      let hitEnemy = null;

      if (enemyMeshes.length) {
        const ints = this.raycaster.intersectObjects(enemyMeshes, true);
        if (ints.length) {
          hit = ints[0];
          hitEnemy = this._findEnemy(hit.object);
        }
      }

      if (hitEnemy) {
        // distance falloff for shotgun pellets
        let dmg = def.damage;
        if (def.id === "shotgun") dmg *= THREE.MathUtils.clamp(1 - hit.distance / 30, 0.3, 1);
        const res = this.enemyMgr.damageEnemy(hitEnemy, dmg, hit.point);
        this.onHit?.(res, hit.point);
        this._tracer(this._muzzleWorld, hit.point);
      } else {
        // miss — test ground only now (cheaper than testing it every shot)
        let groundHit = null;
        if (this.env && this.env.ground) {
          const gi = this.raycaster.intersectObject(this.env.ground, false);
          if (gi.length) groundHit = gi[0];
        }
        if (groundHit) {
          this.effects.impact(groundHit.point, groundHit.face ? groundHit.face.normal : up);
          this._tracer(this._muzzleWorld, groundHit.point);
        } else {
          const far = origin.clone().addScaledVector(dir, 120);
          this._tracer(this._muzzleWorld, far);
        }
      }
    }
  }

  _tracer(from, to) {
    const dist = from.distanceTo(to);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(this.tracerGeo, mat);
    mesh.position.copy(from);
    mesh.lookAt(to);
    mesh.scale.z = dist;
    mesh.renderOrder = 998;
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.06, max: 0.06 });
  }

  _findEnemy(obj) {
    let o = obj;
    while (o) {
      if (o.userData && o.userData.enemyRef) return o.userData.enemyRef;
      o = o.parent;
    }
    return null;
  }

  _gaussian() {
    return (Math.random() + Math.random() + Math.random() - 1.5) * 0.7;
  }

  resetAmmo() {
    this.ammo = WEAPON_DEFS.map((w) => w.mag);
    this.reloading = false; this.reloadTimer = 0;
    this.onAmmoChange?.(this.ammo[this.current], this.def.mag);
  }
}

const ZERO = new THREE.Vector3();
