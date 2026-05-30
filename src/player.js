import * as THREE from "three";

// First-person player: yaw/pitch look, gravity + jump, sprint, terrain following,
// circle collision against rocks/enemies, recoil application and weapon view-bob.

export class Player {
  constructor(camera, environment) {
    this.camera = camera;
    this.env = environment;

    this.position = new THREE.Vector3(0, 0, 0); // feet on terrain
    this.velocityY = 0;
    this.onGround = true;
    this.eyeHeight = 1.7;
    this.radius = 0.4;

    this.yaw = 0;     // around Y
    this.pitch = 0;   // up/down
    this.maxPitch = Math.PI / 2 - 0.08;

    this.walkSpeed = 5.2;
    this.runSpeed = 8.4;
    this.jumpV = 6.2;
    this.gravity = -18;

    this.health = 100;
    this.maxHealth = 100;
    this.dead = false;

    this.lookSensitivity = 0.0024;   // mouse
    this.touchSensitivity = 0.0042;  // touch drag

    // view bob
    this.bobTime = 0;
    this.bobOffset = new THREE.Vector3();
    this.bobRot = 0;
    this._stepPhase = 0;
    this.onStep = null;

    this.adsFactor = 0; // set from weapons for sensitivity scaling
  }

  reset() {
    this.position.set(0, this.env.sampleHeight(0, 0), 0);
    this.velocityY = 0;
    this.yaw = 0; this.pitch = 0;
    this.health = this.maxHealth;
    this.dead = false;
    this.onGround = true;
  }

  addRecoil(pitch, yaw) {
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitch, -this.maxPitch, this.maxPitch);
    this.yaw += yaw;
  }

  look(dx, dy, isTouch) {
    const s = isTouch ? this.touchSensitivity : this.lookSensitivity;
    const adsScale = 1 - this.adsFactor * 0.5;
    this.yaw -= dx * s * adsScale;
    this.pitch -= dy * s * adsScale;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -this.maxPitch, this.maxPitch);
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  update(dt, move, running, jumpPressed, enemyColliders) {
    // --- horizontal movement in yaw space ---
    const speed = running ? this.runSpeed : this.walkSpeed;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const wish = new THREE.Vector3();
    wish.addScaledVector(forward, move.y);
    wish.addScaledVector(right, move.x);
    if (wish.lengthSq() > 1) wish.normalize();
    const moving = wish.lengthSq() > 0.001;

    let nx = this.position.x + wish.x * speed * dt;
    let nz = this.position.z + wish.z * speed * dt;

    // collision vs rocks
    for (const o of this.env.obstacles) {
      const ddx = nx - o.x, ddz = nz - o.z;
      const minD = o.r + this.radius;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < minD * minD && d2 > 1e-5) {
        const d = Math.sqrt(d2);
        nx = o.x + (ddx / d) * minD;
        nz = o.z + (ddz / d) * minD;
      }
    }
    // collision vs enemies (push player out)
    if (enemyColliders) {
      for (const e of enemyColliders) {
        const ep = e.position;
        const ddx = nx - ep.x, ddz = nz - ep.z;
        const minD = 0.9 + this.radius;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < minD * minD && d2 > 1e-5) {
          const d = Math.sqrt(d2);
          nx = ep.x + (ddx / d) * minD;
          nz = ep.z + (ddz / d) * minD;
        }
      }
    }

    // world bounds
    const lim = this.env.size - 4;
    nx = THREE.MathUtils.clamp(nx, -lim, lim);
    nz = THREE.MathUtils.clamp(nz, -lim, lim);

    this.position.x = nx;
    this.position.z = nz;

    // --- vertical (gravity / jump / terrain) ---
    const groundY = this.env.sampleHeight(this.position.x, this.position.z);
    if (jumpPressed && this.onGround) {
      this.velocityY = this.jumpV;
      this.onGround = false;
    }
    this.velocityY += this.gravity * dt;
    this.position.y += this.velocityY * dt;
    if (this.position.y <= groundY) {
      this.position.y = groundY;
      this.velocityY = 0;
      this.onGround = true;
    }

    // --- view bob ---
    let targetBobAmp = 0;
    if (moving && this.onGround) {
      this.bobTime += dt * (running ? 13 : 9);
      targetBobAmp = running ? 1 : 0.6;
      // footstep callback
      const ph = Math.sin(this.bobTime);
      if (ph < 0 && this._lastBob >= 0 && this.onStep) this.onStep();
      this._lastBob = ph;
    }
    this._bobAmp = THREE.MathUtils.lerp(this._bobAmp || 0, targetBobAmp, dt * 8);
    const amp = this._bobAmp;
    this.bobOffset.set(
      Math.cos(this.bobTime) * 0.02 * amp,
      Math.abs(Math.sin(this.bobTime)) * 0.025 * amp,
      0
    );
    this.bobRot = Math.sin(this.bobTime) * 0.004 * amp;

    // --- apply to camera ---
    this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    this.camera.position.add(this.bobOffset);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
}
