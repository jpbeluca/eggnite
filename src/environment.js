import * as THREE from "three";

// Builds the alien planet of Xor-9: terrain, rocks, alien flora, sky, two moons, fog.
// Terrain is heightmapped via value noise; sampleHeight() lets the player & enemies
// walk on the surface. Obstacles (rocks) are exposed for simple radius collision.

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.size = 240;            // world half-extent
    this.obstacles = [];        // { x, z, r } for collision
    this.heightScale = 4.5;
    this._seed = 1337;
  }

  // --- deterministic value noise ---
  _hash(x, z) {
    let h = x * 374761393 + z * 668265263 + this._seed * 2147483647;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }
  _smooth(t) { return t * t * (3 - 2 * t); }
  _valueNoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const a = this._hash(xi, zi), b = this._hash(xi + 1, zi);
    const c = this._hash(xi, zi + 1), d = this._hash(xi + 1, zi + 1);
    const u = this._smooth(xf), v = this._smooth(zf);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, u), THREE.MathUtils.lerp(c, d, u), v);
  }

  sampleHeight(x, z) {
    // gentle rolling terrain with a flatter spawn arena near the center
    const f = 0.018;
    let h = 0;
    h += this._valueNoise(x * f, z * f) * 1.0;
    h += this._valueNoise(x * f * 2.3, z * f * 2.3) * 0.4;
    h += this._valueNoise(x * f * 5.1, z * f * 5.1) * 0.15;
    h = (h / 1.55) * this.heightScale;
    // dampen near center so the player spawns on flat ground
    const d = Math.sqrt(x * x + z * z);
    const flat = THREE.MathUtils.clamp((d - 8) / 22, 0, 1);
    return h * flat;
  }

  build() {
    this._buildSky();
    this._buildLights();
    this._buildTerrain();
    this._buildRocks();
    this._buildFlora();
    this._buildMoons();
    this._buildAtmosphere();
  }

  _buildSky() {
    // Large gradient sky dome — dusty magenta alien atmosphere.
    const geo = new THREE.SphereGeometry(900, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x2a0d3f) },
        midColor: { value: new THREE.Color(0x7a2552) },
        botColor: { value: new THREE.Color(0xd98a5a) },
      },
      vertexShader: `
        varying vec3 vP;
        void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        varying vec3 vP;
        uniform vec3 topColor, midColor, botColor;
        void main(){
          float h = normalize(vP).y;
          vec3 c = mix(botColor, midColor, smoothstep(-0.05, 0.35, h));
          c = mix(c, topColor, smoothstep(0.3, 0.9, h));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    this.scene.add(new THREE.Mesh(geo, mat));

    // distant stars
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1200;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3().setFromSphericalCoords(
        850, Math.acos(THREE.MathUtils.randFloat(-0.2, 1)), Math.random() * Math.PI * 2
      );
      pos.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffeedd, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8 }));
    this.scene.add(stars);
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xc99bff, 0x4a2a1a, 0.65);
    this.scene.add(hemi);

    // alien sun — low warm key light, casts shadows
    const sun = new THREE.DirectionalLight(0xffd8a8, 1.6);
    sun.position.set(60, 80, -40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 80;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 260;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    this.sun = sun;

    // cool rim fill from second moon
    const fill = new THREE.DirectionalLight(0x6f7bff, 0.4);
    fill.position.set(-50, 40, 60);
    this.scene.add(fill);
  }

  _buildTerrain() {
    const seg = 140;
    const geo = new THREE.PlaneGeometry(this.size * 2, this.size * 2, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const cLow = new THREE.Color(0x3a2440);
    const cMid = new THREE.Color(0x6b3d4a);
    const cHigh = new THREE.Color(0x9c6b4f);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = this.sampleHeight(x, z);
      pos.setY(i, y);
      const t = THREE.MathUtils.clamp(y / this.heightScale, 0, 1);
      const c = cLow.clone().lerp(cMid, t).lerp(cHigh, t * t);
      // subtle per-vertex mottling
      const n = this._valueNoise(x * 0.3, z * 0.3) * 0.18;
      c.offsetHSL(0, 0, n - 0.09);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1.0, metalness: 0.0, flatShading: false,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
  }

  _buildRocks() {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x584152, roughness: 0.95, metalness: 0.05, flatShading: true });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x3a8f7a, emissive: 0x1fae8a, emissiveIntensity: 0.8, roughness: 0.6 });

    for (let i = 0; i < 70; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * (this.size - 30);
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      const scale = 1.2 + Math.random() * 4.5;
      const geo = new THREE.DodecahedronGeometry(scale, 0);
      // jitter vertices for craggy look
      const p = geo.attributes.position;
      for (let v = 0; v < p.count; v++) {
        p.setXYZ(v, p.getX(v) * (0.8 + Math.random() * 0.4), p.getY(v) * (0.7 + Math.random() * 0.5), p.getZ(v) * (0.8 + Math.random() * 0.4));
      }
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, rockMat);
      rock.position.set(x, this.sampleHeight(x, z) + scale * 0.4, z);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      rock.castShadow = true; rock.receiveShadow = true;
      this.scene.add(rock);
      this.obstacles.push({ x, z, r: scale * 0.85 });

      // occasional glowing crystal cluster on a rock
      if (Math.random() < 0.4) {
        const cn = 2 + Math.floor(Math.random() * 3);
        for (let c = 0; c < cn; c++) {
          const ch = 0.6 + Math.random() * 1.6;
          const cry = new THREE.Mesh(new THREE.ConeGeometry(0.18 + Math.random() * 0.2, ch, 5), glowMat);
          cry.position.set(x + (Math.random() - 0.5) * scale, this.sampleHeight(x, z) + scale * 0.4 + ch * 0.3, z + (Math.random() - 0.5) * scale);
          cry.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * Math.PI, (Math.random() - 0.5) * 0.6);
          cry.castShadow = true;
          this.scene.add(cry);
        }
      }
    }
  }

  _buildFlora() {
    // alien "stalk" plants — glowing bulbs on thin stems
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x33402f, roughness: 0.9 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xff7ad9, emissive: 0xff2fb0, emissiveIntensity: 0.7, roughness: 0.4 });
    this.stalks = [];
    for (let i = 0; i < 90; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * (this.size - 20);
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      const h = 1.4 + Math.random() * 2.6;
      const g = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, h, 5), stemMat);
      stem.position.y = h / 2; stem.castShadow = true;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18 + Math.random() * 0.16, 8, 6), bulbMat);
      bulb.position.y = h;
      g.add(stem); g.add(bulb);
      g.position.set(x, this.sampleHeight(x, z), z);
      g.userData.phase = Math.random() * Math.PI * 2;
      g.userData.h = h;
      this.scene.add(g);
      this.stalks.push(g);
    }
  }

  _buildMoons() {
    // Big ringed gas giant + a cratered moon hanging in the sky
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(60, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xd98f5a, emissive: 0x6b3a1f, emissiveIntensity: 0.35, roughness: 1 })
    );
    planet.position.set(-260, 180, -480);
    this.scene.add(planet);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(75, 110, 64),
      new THREE.MeshBasicMaterial({ color: 0xe8c39a, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    );
    ring.position.copy(planet.position);
    ring.rotation.set(Math.PI / 2.4, 0.3, 0);
    this.scene.add(ring);

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(26, 24, 18),
      new THREE.MeshStandardMaterial({ color: 0x9fa7c9, emissive: 0x3a4066, emissiveIntensity: 0.3, roughness: 1, flatShading: true })
    );
    moon.position.set(320, 150, -360);
    this.scene.add(moon);
  }

  _buildAtmosphere() {
    this.scene.fog = new THREE.FogExp2(0x6b3550, 0.0085);
  }

  update(dt, time) {
    // sway the glowing stalks
    if (this.stalks) {
      for (const s of this.stalks) {
        s.rotation.z = Math.sin(time * 1.3 + s.userData.phase) * 0.08;
        s.rotation.x = Math.cos(time * 1.1 + s.userData.phase) * 0.06;
      }
    }
  }
}
