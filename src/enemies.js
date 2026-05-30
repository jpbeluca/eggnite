import * as THREE from "three";

// Ovomorfos — egg-shaped alien monsters. Built from a lathed egg-profile body
// with eyes, twitching legs and an angry mouth. They wander, then chase the
// player on the terrain surface, lunge to attack, and explode into goo on death.

const EGG_PROFILE = (() => {
  // Classic egg silhouette via revolution: y in [0,1], radius r(y).
  const pts = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N;            // 0 = bottom, 1 = top
    const y = (t - 0.5) * 2;    // -1..1
    // egg radius function: wider & rounder at bottom, tapered top
    const r = Math.sqrt(Math.max(0, 1 - y * y)) * (1 - 0.18 * y) * 0.62;
    pts.push(new THREE.Vector2(Math.max(0.001, r), (t) * 1.0));
  }
  return pts;
})();

export class EnemyManager {
  constructor(scene, environment, effects, audio) {
    this.scene = scene;
    this.env = environment;
    this.effects = effects;
    this.audio = audio;
    this.enemies = [];

    // shared geometries / materials
    this.bodyGeo = new THREE.LatheGeometry(EGG_PROFILE, 24);
    this.bodyGeo.translate(0, -0.5, 0);   // center vertically
    this.bodyGeo.computeVertexNormals();

    this.eyeGeo = new THREE.SphereGeometry(0.12, 10, 8);
    this.pupilGeo = new THREE.SphereGeometry(0.06, 8, 6);
    this.legGeo = new THREE.CapsuleGeometry(0.04, 0.3, 3, 6);
    this.toothGeo = new THREE.ConeGeometry(0.04, 0.12, 4);

    this.eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    this.pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a0a0a, roughness: 0.2 });
    this.legMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 });
    this.mouthMat = new THREE.MeshStandardMaterial({ color: 0x5a1020, roughness: 0.6 });
    this.toothMat = new THREE.MeshStandardMaterial({ color: 0xfff4e0, roughness: 0.4 });

    this._tmp = new THREE.Vector3();
  }

  // distinct egg "breeds" — varied shell colors / sizes / stats
  _breed(wave) {
    const breeds = [
      { name: "comum",  color: 0xf4e9c8, speckle: 0xbfa76a, hp: 30, speed: 2.6, scale: 1.0, score: 100, dmg: 8 },
      { name: "veloz",  color: 0xd8f4e0, speckle: 0x7fd0a0, hp: 22, speed: 4.4, scale: 0.8, score: 150, dmg: 6 },
      { name: "tanque", color: 0xe0d0f4, speckle: 0x9a78c8, hp: 70, speed: 1.8, scale: 1.5, score: 250, dmg: 16 },
      { name: " acida", color: 0xd4f48a, speckle: 0x8fbf2a, hp: 40, speed: 3.0, scale: 1.1, score: 200, dmg: 12 },
    ];
    // later waves bias toward tougher breeds
    let pick;
    const r = Math.random();
    if (wave <= 2) pick = r < 0.85 ? 0 : 1;
    else if (wave <= 4) pick = r < 0.5 ? 0 : r < 0.8 ? 1 : 3;
    else pick = r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.8 ? 3 : 2;
    const b = { ...breeds[pick] };
    // scale HP up slightly each wave
    b.hp = Math.round(b.hp * (1 + (wave - 1) * 0.12));
    return b;
  }

  _buildEgg(breed) {
    const g = new THREE.Group();

    const shellMat = new THREE.MeshStandardMaterial({
      color: breed.color, roughness: 0.55, metalness: 0.05, flatShading: false,
    });
    const body = new THREE.Mesh(this.bodyGeo, shellMat);
    body.castShadow = true; body.receiveShadow = true;
    body.scale.set(1, 1.25, 1); // a touch taller = eggier
    g.add(body);

    // speckles (small dots on shell)
    const speckMat = new THREE.MeshStandardMaterial({ color: breed.speckle, roughness: 0.7 });
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.random() * 0.03, 5, 4), speckMat);
      const dir = new THREE.Vector3(rand(), rand() * 1.4, rand()).normalize();
      s.position.copy(dir.multiplyScalar(0.6)).multiply(new THREE.Vector3(0.62, 0.78, 0.62));
      s.position.y *= 1.0;
      g.add(s);
    }

    // angry eyes
    const eyeGroup = new THREE.Group();
    for (const sx of [-1, 1]) {
      const white = new THREE.Mesh(this.eyeGeo, this.eyeWhiteMat);
      white.position.set(sx * 0.2, 0.28, 0.5);
      white.scale.set(1, 1.2, 0.6);
      const pupil = new THREE.Mesh(this.pupilGeo, this.pupilMat);
      pupil.position.set(sx * 0.2, 0.26, 0.6);
      eyeGroup.add(white); eyeGroup.add(pupil);

      // angry brow
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.05), this.legMat);
      brow.position.set(sx * 0.2, 0.42, 0.55);
      brow.rotation.z = sx * -0.5;
      eyeGroup.add(brow);
    }
    g.add(eyeGroup);
    g.userData.eyes = eyeGroup;

    // mouth with teeth
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mouthMat);
    mouth.rotation.x = Math.PI;
    mouth.position.set(0, -0.02, 0.56);
    mouth.scale.set(1.2, 0.8, 0.7);
    g.add(mouth);
    g.userData.mouth = mouth;
    for (let i = 0; i < 5; i++) {
      const tooth = new THREE.Mesh(this.toothGeo, this.toothMat);
      const a = (i / 4 - 0.5) * 1.4;
      tooth.position.set(Math.sin(a) * 0.14, 0.04, 0.6);
      tooth.rotation.x = Math.PI;
      g.add(tooth);
    }

    // little legs
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(this.legGeo, this.legMat);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      leg.position.set(Math.cos(a) * 0.42, -0.62, Math.sin(a) * 0.42);
      leg.rotation.z = Math.cos(a) * 0.5;
      leg.rotation.x = Math.sin(a) * 0.5;
      leg.castShadow = true;
      leg.userData.baseRot = { x: leg.rotation.x, z: leg.rotation.z };
      leg.userData.phase = i * Math.PI / 2;
      g.add(leg);
      legs.push(leg);
    }
    g.userData.legs = legs;

    return g;
  }

  spawn(wave, position) {
    const breed = this._breed(wave);
    const mesh = this._buildEgg(breed);
    const baseScale = breed.scale;
    mesh.scale.setScalar(baseScale);
    const gy = this.env.sampleHeight(position.x, position.z);
    mesh.position.set(position.x, gy + baseScale, position.z);
    this.scene.add(mesh);

    const e = {
      mesh, breed,
      hp: breed.hp, maxHp: breed.hp,
      speed: breed.speed,
      baseScale,
      radius: 0.7 * baseScale,
      state: "chase",
      attackCd: 0,
      hitFlash: 0,
      bobPhase: Math.random() * Math.PI * 2,
      lungeT: 0,
      vel: new THREE.Vector3(),
      screechCd: Math.random() * 3,
      dead: false,
    };
    mesh.userData.enemyRef = e;
    this.enemies.push(e);
    return e;
  }

  // returns { killed, enemy } or null if no hit. amount = damage.
  damageEnemy(enemy, amount, hitPoint) {
    if (enemy.dead) return { killed: false };
    enemy.hp -= amount;
    enemy.hitFlash = 0.12;
    if (enemy.hp <= 0) {
      this.kill(enemy);
      return { killed: true, breed: enemy.breed };
    } else {
      this.effects.bloodHit(hitPoint || enemy.mesh.position);
      // recoil knockback
      return { killed: false };
    }
  }

  kill(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    const pos = enemy.mesh.position.clone();
    this.effects.eggExplosion(pos, enemy.baseScale);
    this.audio.explosion();
    this.scene.remove(enemy.mesh);
    enemy.mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material !== this.eyeWhiteMat && o.material !== this.pupilMat &&
          o.material !== this.legMat && o.material !== this.mouthMat && o.material !== this.toothMat) {
        o.material.dispose?.();
      }
    });
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) this.enemies.splice(idx, 1);
  }

  update(dt, time, playerPos, onAttack) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const m = e.mesh;
      // direction to player (XZ)
      this._tmp.set(playerPos.x - m.position.x, 0, playerPos.z - m.position.z);
      const distXZ = this._tmp.length();
      this._tmp.normalize();

      // face player
      const targetYaw = Math.atan2(this._tmp.x, this._tmp.z);
      m.rotation.y = lerpAngle(m.rotation.y, targetYaw, 1 - Math.pow(0.001, dt));

      // movement
      if (e.lungeT > 0) {
        e.lungeT -= dt;
      } else if (distXZ > e.radius + 1.1) {
        // chase with separation from other enemies
        const sep = this._separation(e);
        const moveX = this._tmp.x * e.speed + sep.x;
        const moveZ = this._tmp.z * e.speed + sep.z;
        let nx = m.position.x + moveX * dt;
        let nz = m.position.z + moveZ * dt;
        // avoid rocks
        ({ nx, nz } = this._avoidObstacles(m.position.x, m.position.z, nx, nz, e.radius));
        m.position.x = nx; m.position.z = nz;
      }

      // stick to terrain + bob
      const gy = this.env.sampleHeight(m.position.x, m.position.z);
      e.bobPhase += dt * (3 + e.speed);
      const bob = Math.abs(Math.sin(e.bobPhase)) * 0.12 * e.baseScale;
      m.position.y = gy + e.baseScale + bob;

      // leg wiggle
      if (m.userData.legs) {
        for (const leg of m.userData.legs) {
          const w = Math.sin(e.bobPhase + leg.userData.phase) * 0.4;
          leg.rotation.x = leg.userData.baseRot.x + w;
        }
      }

      // attack
      e.attackCd -= dt;
      if (distXZ < e.radius + 1.4 && e.attackCd <= 0) {
        e.attackCd = 1.1;
        e.lungeT = 0.25;
        // quick lunge toward player
        m.position.x += this._tmp.x * 0.5;
        m.position.z += this._tmp.z * 0.5;
        if (m.userData.mouth) m.userData.mouth.scale.y = 1.4;
        onAttack(e.breed.dmg, m.position);
      } else if (m.userData.mouth) {
        m.userData.mouth.scale.y = lerp(m.userData.mouth.scale.y, 0.8, dt * 8);
      }

      // occasional screech
      e.screechCd -= dt;
      if (e.screechCd <= 0 && distXZ < 30) {
        e.screechCd = 4 + Math.random() * 5;
        this.audio.screech();
      }

      // hit flash
      const shell = m.children[0];
      if (e.hitFlash > 0) {
        e.hitFlash -= dt;
        shell.material.emissive.setHex(0xff3030);
        shell.material.emissiveIntensity = e.hitFlash * 6;
        // squash on hit
        m.scale.setScalar(e.baseScale * (1 + e.hitFlash * 0.5));
      } else {
        shell.material.emissiveIntensity = 0;
        m.scale.setScalar(lerp(m.scale.x, e.baseScale, dt * 10));
      }
    }
  }

  _separation(e) {
    const out = new THREE.Vector3();
    for (const o of this.enemies) {
      if (o === e || o.dead) continue;
      const dx = e.mesh.position.x - o.mesh.position.x;
      const dz = e.mesh.position.z - o.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      const min = (e.radius + o.radius) * 1.1;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        out.x += (dx / d) * (min - d) * 3;
        out.z += (dz / d) * (min - d) * 3;
      }
    }
    return out;
  }

  _avoidObstacles(x, z, nx, nz, radius) {
    for (const o of this.env.obstacles) {
      const dx = nx - o.x, dz = nz - o.z;
      const minD = o.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD * minD && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = o.x + (dx / d) * minD;
        nz = o.z + (dz / d) * minD;
      }
    }
    return { nx, nz };
  }

  getColliders() {
    return this.enemies.filter((e) => !e.dead).map((e) => e.mesh);
  }

  clear() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies.length = 0;
  }

  get aliveCount() {
    return this.enemies.filter((e) => !e.dead).length;
  }
}

function rand() { return Math.random() - 0.5; }
function lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
