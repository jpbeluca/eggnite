import * as THREE from "three";

// Pooled particle / debris effects: egg explosions (goo chunks + shell shards +
// flash), bullet impact sparks, and muzzle flashes. Uses simple physics-driven
// meshes recycled from pools so we never allocate during gameplay spikes.

const _v = new THREE.Vector3();

export class Effects {
  constructor(scene, environment) {
    this.scene = scene;
    this.env = environment;
    this.particles = [];     // active { mesh, vel, life, maxLife, gravity, spin }
    this.pool = [];          // inactive meshes by geometry-type bucket
    this.flashes = [];       // active muzzle/explosion lights
    this.decals = [];        // goo splats on ground (fade over time)

    // shared materials
    this.gooMat = new THREE.MeshStandardMaterial({ color: 0x86d11f, emissive: 0x4a7d10, emissiveIntensity: 0.5, roughness: 0.4 });
    this.gooMat2 = new THREE.MeshStandardMaterial({ color: 0xc6f24a, emissive: 0x6a9c12, emissiveIntensity: 0.6, roughness: 0.3 });
    this.shellMat = new THREE.MeshStandardMaterial({ color: 0xf4e9c8, roughness: 0.6, flatShading: true });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    this.smokeMat = new THREE.MeshBasicMaterial({ color: 0x553344, transparent: true, opacity: 0.5 });

    this.gooGeo = new THREE.IcosahedronGeometry(0.16, 0);
    this.gooGeoBig = new THREE.IcosahedronGeometry(0.26, 0);
    this.shellGeo = new THREE.TetrahedronGeometry(0.18);
    this.sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    this.smokeGeo = new THREE.SphereGeometry(0.4, 6, 5);
  }

  _spawn(mesh, opts) {
    mesh.visible = true;
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      vel: opts.vel,
      life: 0,
      maxLife: opts.maxLife,
      gravity: opts.gravity ?? -16,
      spin: opts.spin || new THREE.Vector3(),
      drag: opts.drag ?? 0.99,
      fade: opts.fade ?? false,
      shrink: opts.shrink ?? false,
      bounce: opts.bounce ?? false,
      baseScale: mesh.scale.x,
    });
  }

  eggExplosion(position, scale = 1) {
    const p = position;

    // flash light
    this._flash(p.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xa6ff3a, 6 * scale, 0.18);

    // goo chunks
    const gooCount = Math.floor(22 * scale);
    for (let i = 0; i < gooCount; i++) {
      const mat = Math.random() < 0.5 ? this.gooMat : this.gooMat2;
      const geo = Math.random() < 0.4 ? this.gooGeoBig : this.gooGeo;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false;
      m.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4));
      const sc = (0.6 + Math.random() * 0.9) * scale;
      m.scale.setScalar(sc);
      const speed = 4 + Math.random() * 8;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 1.1 + 0.3, Math.random() - 0.5).normalize();
      this._spawn(m, {
        vel: dir.multiplyScalar(speed * scale),
        maxLife: 1.1 + Math.random() * 0.8,
        gravity: -18, spin: new THREE.Vector3(rand(), rand(), rand()).multiplyScalar(12),
        bounce: true, shrink: true,
      });
    }

    // shell shards
    for (let i = 0; i < Math.floor(10 * scale); i++) {
      const m = new THREE.Mesh(this.shellGeo, this.shellMat);
      m.castShadow = false;
      m.position.copy(p).add(new THREE.Vector3(0, 0.5, 0));
      m.scale.setScalar((0.7 + Math.random()) * scale);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 1.3 + 0.4, Math.random() - 0.5).normalize();
      this._spawn(m, {
        vel: dir.multiplyScalar((5 + Math.random() * 7) * scale),
        maxLife: 1.4 + Math.random(), gravity: -20,
        spin: new THREE.Vector3(rand(), rand(), rand()).multiplyScalar(16), bounce: true,
      });
    }

    // smoke puffs
    for (let i = 0; i < Math.floor(5 * scale); i++) {
      const m = new THREE.Mesh(this.smokeGeo, this.smokeMat.clone());
      m.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5));
      m.scale.setScalar((0.6 + Math.random()) * scale);
      this._spawn(m, {
        vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.2 + Math.random(), (Math.random() - 0.5) * 1.5),
        maxLife: 0.9 + Math.random() * 0.5, gravity: 1.5, drag: 0.92, fade: true, shrink: false,
      });
    }

    // ground goo splat decal
    this._gooSplat(p, scale);
  }

  impact(position, normal) {
    this._flash(position.clone().add(normal.clone().multiplyScalar(0.1)), 0xffe08a, 1.2, 0.06);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      m.position.copy(position);
      const dir = normal.clone().add(new THREE.Vector3(rand(), rand(), rand()).multiplyScalar(0.8)).normalize();
      this._spawn(m, { vel: dir.multiplyScalar(3 + Math.random() * 4), maxLife: 0.3 + Math.random() * 0.2, gravity: -10, drag: 0.9 });
    }
  }

  bloodHit(position) {
    // small goo spurt when an egg is hit but not killed
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(this.gooGeo, this.gooMat);
      m.position.copy(position);
      m.scale.setScalar(0.5 + Math.random() * 0.4);
      const dir = new THREE.Vector3(rand(), Math.random() * 0.8 + 0.2, rand()).normalize();
      this._spawn(m, { vel: dir.multiplyScalar(2 + Math.random() * 3), maxLife: 0.5 + Math.random() * 0.3, gravity: -16, shrink: true });
    }
  }

  _gooSplat(position, scale) {
    const r = (0.8 + Math.random() * 0.6) * scale;
    const geo = new THREE.CircleGeometry(r, 12);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6fae18, emissive: 0x3a5e0c, emissiveIntensity: 0.4, roughness: 0.5, transparent: true, opacity: 0.9, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    const gy = this.env ? this.env.sampleHeight(position.x, position.z) : 0;
    m.position.set(position.x, gy + 0.03, position.z);
    m.rotation.y = Math.random() * Math.PI;
    this.scene.add(m);
    this.decals.push({ mesh: m, life: 0, maxLife: 14 });
    // cap decals
    if (this.decals.length > 40) {
      const old = this.decals.shift();
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
    }
  }

  _flash(pos, color, intensity, duration) {
    const light = new THREE.PointLight(color, intensity, 18, 2);
    light.position.copy(pos);
    this.scene.add(light);
    this.flashes.push({ light, life: 0, maxLife: duration, base: intensity });
  }

  muzzleFlash(pos, color = 0xffd27a) {
    this._flash(pos, color, 3.5, 0.05);
  }

  update(dt) {
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life += dt;
      if (pt.life >= pt.maxLife) {
        this.scene.remove(pt.mesh);
        if (pt.mesh.material.transparent) pt.mesh.material.dispose?.();
        this.particles.splice(i, 1);
        continue;
      }
      pt.vel.y += pt.gravity * dt;
      pt.vel.multiplyScalar(pt.drag);
      pt.mesh.position.addScaledVector(pt.vel, dt);

      // ground bounce
      if (pt.bounce && this.env) {
        const gy = this.env.sampleHeight(pt.mesh.position.x, pt.mesh.position.z);
        if (pt.mesh.position.y < gy + 0.08) {
          pt.mesh.position.y = gy + 0.08;
          pt.vel.y = Math.abs(pt.vel.y) * 0.4;
          pt.vel.x *= 0.6; pt.vel.z *= 0.6;
        }
      }
      if (pt.spin.lengthSq() > 0) {
        pt.mesh.rotation.x += pt.spin.x * dt;
        pt.mesh.rotation.y += pt.spin.y * dt;
        pt.mesh.rotation.z += pt.spin.z * dt;
      }
      const tnorm = pt.life / pt.maxLife;
      if (pt.shrink) pt.mesh.scale.setScalar(pt.baseScale * (1 - tnorm * 0.7));
      if (pt.fade && pt.mesh.material.transparent) pt.mesh.material.opacity = (1 - tnorm) * 0.5;
    }

    // flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life += dt;
      if (f.life >= f.maxLife) {
        this.scene.remove(f.light);
        this.flashes.splice(i, 1);
        continue;
      }
      f.light.intensity = f.base * (1 - f.life / f.maxLife);
    }

    // decals fade
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life += dt;
      const t = d.life / d.maxLife;
      if (t >= 1) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        this.decals.splice(i, 1);
        continue;
      }
      if (t > 0.6) d.mesh.material.opacity = 0.9 * (1 - (t - 0.6) / 0.4);
    }
  }
}

function rand() { return Math.random() - 0.5; }
