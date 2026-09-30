import * as THREE from 'three';
import { ENEMIES } from '../../game/enemyDefs';
import type { FxEvent, Game } from '../../game/game';
import type { Tank } from '../../game/tank';
import { ZONES } from '../../shared/zones';
import { archFor, lookFor } from '../px/creatures2d';
import { groundLevel } from '../px/terrain2d';
import { hash2 } from '../px/pixels';
import { Creatures3D, type CreatureDraw } from './creatures';
import { buildShip, poseShip, shipKey, type ShipModel } from './ship';
import { glowTex, puffTex } from './textures';
import { World3D } from './world';
import { Compound3D } from './compound';

/**
 * The view out of the cab, in 3D (three.js): the Crater under a real sky, the world streamed round you, every
 * creature and machine as a solid, lit, animated model, your own Titan's deck and guns below the glass, and the
 * battle in the air (tracers, shells, bursts, smoke, dust off the crawlers), with the zone's haze and weather.
 *
 * The camera sits in the bridge at the bow; drag to look anywhere (all the way round, up and down). Wheel out and
 * it leaves the cab and orbits the ship, from a chase view out to high above.
 */

export interface CabView {
  /** Look (radians off the bow) and pitch (radians down). */
  yaw: number;
  pitch: number;
  /** 0: in the cab; more: orbiting the ship at that many metres. */
  dist: number;
  time: number;
  dt: number;
  /** A camera fixed to the ship instead of the cab (the security cameras): ship-local place, height, turn, tilt. */
  spot?: { lx: number; lz: number; h: number; yaw: number; pitch: number; fov: number } | null;
  /** Switches in the cab: the roof searchlight (it follows your eyes), the deck floods, the amber beacons. */
  search?: boolean;
  deck?: boolean;
  beacon?: boolean;
  /** The satnav's route ahead (world points every few metres) and where it ends: chevrons on the ground, a beam there. */
  route?: { x: number; y: number; a: number }[];
  goal?: { x: number; y: number; course: boolean } | null;
}

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const SKY_FS = `
uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunCol;
uniform float time; uniform float cloud; uniform float storm;
varying vec3 vDir;
float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2(1, 0)), u.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, top, pow(max(h, 0.0), 0.5));
  if (h < 0.0) col = mix(horizon, ground, min(1.0, -h * 5.0));
  float sd = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(sd, 1200.0) * 4.0 + pow(sd, 40.0) * 0.25 + pow(sd, 5.0) * 0.12) * (1.0 - storm * 0.8);
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.1 + vec2(time * 0.006, time * 0.0025);
    float c = fbm(uv * 1.3);
    float cov = smoothstep(0.62 - cloud * 0.35, 0.9, c);
    float lit = fbm(uv * 1.3 + sunDir.xz * 0.08);
    vec3 cc = mix(vec3(1.0, 0.98, 0.95), horizon * 0.8, 0.3) * (0.72 + 0.4 * (c - lit + 0.5));
    cc += sunCol * pow(sd, 10.0) * 0.35;
    cc = mix(cc, vec3(0.3, 0.32, 0.36), storm * 0.7);
    col = mix(col, cc, cov * smoothstep(0.0, 0.18, h) * 0.92);
  }
  col = mix(col, horizon, storm * 0.55);
  gl_FragColor = vec4(col, 1.0);
}`;

/** A pool of camera-facing sprites for bursts, smoke, dust and muzzle flashes. */
interface Puff {
  s: THREE.Sprite;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  max: number;
  r0: number;
  r1: number;
  a0: number;
  on: boolean;
}

const lin = (hex: string): THREE.Color => new THREE.Color(hex);

export class Cabin3D {
  readonly canvas: HTMLCanvasElement;
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(60, 1, 0.4, 9000);
  private sky: THREE.Mesh;
  private skyU: Record<string, THREE.IUniform>;
  private rim: THREE.Mesh;
  /** The ground beyond the streamed blocks, out to the haze: the zone's colour. */
  private skirt: THREE.Mesh;
  private sun = new THREE.DirectionalLight('#ffffff', 2.4);
  private hemi = new THREE.HemisphereLight('#bcd4ff', '#4a4030', 0.9);
  private heads: THREE.SpotLight[] = [];
  /** The roof searchlight, its beam in the air, where it last pointed (ship-relative), and the deck floods. */
  private searchLight = new THREE.SpotLight('#fff4dc', 0, 1100, 0.15, 0.35, 1.2);
  private beam: THREE.Mesh;
  private searchAim = { yaw: 0, pitch: 0.08 };
  private floods: THREE.PointLight[] = [];
  /** The satnav's chevrons along the ground and the pillar of light over where it ends. */
  private chevrons: THREE.InstancedMesh;
  private pillar: THREE.Mesh;
  private world: World3D | null = null;
  private creatures = new Creatures3D();
  private compound = new Compound3D();
  private ships = new Map<number, ShipModel>();
  private tracers: THREE.InstancedMesh;
  private rings: THREE.InstancedMesh;
  private glowPool: Puff[] = [];
  private smokePool: Puff[] = [];
  private weather: THREE.Points;
  private ox = 0;
  private oz = 0;
  private roll = 0;
  private w = 1;
  private h = 1;
  private pr = 1;
  private slow = 0;
  private zoneKey = '';
  private lastT = 0;
  private stackT = 0;
  private fogBase = 0.0015;
  /** Sky light for reflections and ambient (rebuilt from the sky when the zone changes). */
  private pmrem: THREE.PMREMGenerator | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;
  /** The camera's world position (game x, y and height). */
  eye = { x: 0, y: 0, h: 0 };

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cab3d';
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.05;
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.fog = new THREE.FogExp2('#a0a8b0', 0.0009);
    // Sky dome.
    this.skyU = {
      top: { value: lin('#4a78b8') }, horizon: { value: lin('#c8d4dc') }, ground: { value: lin('#4a4238') },
      sunDir: { value: new THREE.Vector3(-0.55, 0.5, -0.66).normalize() }, sunCol: { value: lin('#fff2d0') },
      time: { value: 0 }, cloud: { value: 0.5 }, storm: { value: 0 },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 16), new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    // The Crater's wall far off all round: ridges on the horizon, hazed.
    this.rim = this.makeRim();
    this.scene.add(this.rim);
    this.skirt = new THREE.Mesh(new THREE.CircleGeometry(7000, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#a08060', roughness: 1 }));
    this.skirt.receiveShadow = false;
    this.scene.add(this.skirt);
    // Sun and sky light.
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -260;
    sc.right = 260;
    sc.top = 260;
    sc.bottom = -260;
    sc.near = 10;
    sc.far = 1400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    for (let i = 0; i < 2; i++) {
      const s = new THREE.SpotLight('#fff0c8', 0, 420, 0.42, 0.55, 1.2);
      s.castShadow = false;
      this.heads.push(s);
      this.scene.add(s, s.target);
    }
    this.scene.add(this.searchLight, this.searchLight.target);
    for (let i = 0; i < 2; i++) {
      const f = new THREE.PointLight('#ffe2b0', 0, 150, 1.5);
      this.floods.push(f);
      this.scene.add(f);
    }
    // The searchlight's beam: a long cone of lit haze, brightest at the lamp.
    {
      const cg = new THREE.ConeGeometry(1, 1, 28, 6, true).translate(0, -0.5, 0).rotateZ(Math.PI / 2);
      const pos = cg.attributes.position as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i++) {
        const t = Math.max(0, Math.min(1, pos.getX(i)));
        col.set([1, 0.96, 0.86, Math.pow(1 - t, 1.6)], i * 4);
      }
      cg.setAttribute('color', new THREE.BufferAttribute(col, 4));
      this.beam = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
      this.beam.frustumCulled = false;
      this.beam.visible = false;
      this.scene.add(this.beam);
    }
    // The satnav on the ground: flat glowing chevrons pointing the way, and a pillar of light over the goal.
    {
      const sh = new THREE.Shape();
      sh.moveTo(-3, -3);
      sh.lineTo(1, 0);
      sh.lineTo(-3, 3);
      sh.lineTo(-4.4, 3);
      sh.lineTo(-0.6, 0);
      sh.lineTo(-4.4, -3);
      sh.closePath();
      const cg = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
      this.chevrons = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), 160);
      this.chevrons.frustumCulled = false;
      this.chevrons.count = 0;
      this.chevrons.setColorAt(0, new THREE.Color());
      this.scene.add(this.chevrons);
      const pg = new THREE.CylinderGeometry(5, 9, 600, 20, 8, true).translate(0, 300, 0);
      const pos = pg.attributes.position as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i++) col.set([0.4, 1, 1, Math.pow(1 - pos.getY(i) / 600, 2.2)], i * 4);
      pg.setAttribute('color', new THREE.BufferAttribute(col, 4));
      this.pillar = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
      this.pillar.visible = false;
      this.pillar.frustumCulled = false;
      this.scene.add(this.pillar);
    }
    this.scene.add(this.creatures.root, this.compound.root);
    // Tracers and shells: short glowing rods along their flight.
    this.tracers = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 1500);
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    this.tracers.setColorAt(0, new THREE.Color());
    this.scene.add(this.tracers);
    // Red rings on the ground under hostiles, so they read against anything.
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3020', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), 2000);
    this.rings.frustumCulled = false;
    this.rings.count = 0;
    this.scene.add(this.rings);
    // Weather: rain, snow, sand or ash blowing past.
    const N = 5000;
    const wp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      wp[i * 3] = (hash2(i, 1, 51) - 0.5) * 240;
      wp[i * 3 + 1] = hash2(i, 2, 51) * 90;
      wp[i * 3 + 2] = (hash2(i, 3, 51) - 0.5) * 240;
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    this.weather = new THREE.Points(wg, new THREE.PointsMaterial({ color: '#dde6ee', size: 0.5, transparent: true, opacity: 0.7, depthWrite: false }));
    this.weather.frustumCulled = false;
    this.weather.visible = false;
    this.scene.add(this.weather);
    const glow = glowTex(), puff = puffTex();
    for (let i = 0; i < 260; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      s.visible = false;
      this.scene.add(s);
      this.glowPool.push({ s, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, max: 1, r0: 1, r1: 1, a0: 1, on: false });
    }
    for (let i = 0; i < 420; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: '#888888', transparent: true, depthWrite: false }));
      s.visible = false;
      this.scene.add(s);
      this.smokePool.push({ s, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, max: 1, r0: 1, r1: 1, a0: 1, on: false });
    }
  }

  private makeRim(): THREE.Mesh {
    const N = 360, R = 5200;
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const hh = 120 + Math.sin(a * 3) * 60 + Math.sin(a * 7.3 + 1) * 45 + Math.sin(a * 17.1) * 22 + Math.abs(Math.sin(a * 41.3)) * 28 + hash2(i, 1, 61) * 12;
      pos.push(Math.cos(a) * R, -60, Math.sin(a) * R, Math.cos(a) * R, hh, Math.sin(a) * R);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#3a3430', side: THREE.DoubleSide, fog: false }));
    m.renderOrder = -5;
    return m;
  }

  resize(w: number, h: number, pixelRatio: number): void {
    if (w === this.w && h === this.h && pixelRatio === this.pr) return;
    this.w = w;
    this.h = h;
    this.pr = pixelRatio;
    this.r.setPixelRatio(pixelRatio);
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    // About 90 degrees across.
    this.cam.fov = (2 * Math.atan(Math.tan((45 * Math.PI) / 180) / this.cam.aspect) * 180) / Math.PI;
    this.cam.updateProjectionMatrix();
  }

  /** A world point (game x, y, height) on the glass, in the canvas's CSS pixels, or null behind you. */
  project(x: number, y: number, h: number): { x: number; y: number; d: number } | null {
    const v = new THREE.Vector3(x - this.ox, h, y - this.oz);
    const d = v.distanceTo(this.cam.position);
    v.project(this.cam);
    if (v.z > 1 || v.z < -1) return null;
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h, d };
  }

  /** The ground under a point of the glass (CSS pixels), or null for sky. */
  pick(px: number, py: number): { x: number; y: number } | null {
    const v = new THREE.Vector3((px / this.w) * 2 - 1, 1 - (py / this.h) * 2, 0.5).unproject(this.cam);
    const o = this.cam.position;
    const d = v.sub(o).normalize();
    if (d.y > -0.001) return null;
    let t = 1;
    for (let i = 0; i < 400; i++) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y <= groundLevel(x + this.ox, z + this.oz)) return { x: x + this.ox, y: z + this.oz };
      t += Math.max(1, t * 0.02);
      if (t > 4000) break;
    }
    return null;
  }

  render(g: Game, v: CabView, fx: FxEvent[]): void {
    const p = g.player;
    if (!this.world) {
      this.world = new World3D(g.map);
      this.scene.add(this.world.root);
    }
    this.world.setMap(g.map);
    this.lastT = v.time;
    const ship = this.shipFor(p);
    const L = p.stats.length, H = p.deckY(0);
    const base = groundLevel(p.x, p.y);
    // Camera.
    let ex: number, ey: number, eh: number, yaw: number, pitch: number;
    if (v.spot) {
      const c = p.toWorld(v.spot.lx, v.spot.lz);
      ex = c.x;
      ey = c.y;
      eh = base + v.spot.h;
      yaw = p.rot + v.spot.yaw;
      pitch = v.spot.pitch;
    } else if (v.dist <= 0) {
      const c = p.toWorld(L / 2 - 3.2, 0);
      ex = c.x;
      ey = c.y;
      eh = base + H + 4.2;
      yaw = p.rot + v.yaw;
      pitch = v.pitch;
    } else {
      yaw = p.rot + v.yaw;
      pitch = Math.max(0.05, Math.min(1.45, v.pitch + 0.25));
      const d = v.dist;
      ex = p.x - Math.cos(yaw) * Math.cos(pitch) * d;
      ey = p.y - Math.sin(yaw) * Math.cos(pitch) * d;
      eh = base + H * 0.6 + Math.sin(pitch) * d;
    }
    // A camera parked anywhere, for inspecting the scene from the console: globalThis.__cab3cam = { x, y, h, tx, ty, th }.
    const dbg = (globalThis as unknown as { __cab3cam?: { x: number; y: number; h: number; tx: number; ty: number; th: number } }).__cab3cam;
    if (dbg) {
      ex = dbg.x;
      ey = dbg.y;
      eh = dbg.h;
    }
    this.eye = { x: ex, y: ey, h: eh };
    this.ox = Math.round(ex / 64) * 64;
    this.oz = Math.round(ey / 64) * 64;
    this.cam.position.set(ex - this.ox, eh, ey - this.oz);
    // A security camera sees wider; the cab's own view is about ninety degrees across.
    const fov = v.spot ? v.spot.fov : (2 * Math.atan(Math.tan((45 * Math.PI) / 180) / this.cam.aspect) * 180) / Math.PI;
    if (Math.abs(this.cam.fov - fov) > 0.01) {
      this.cam.fov = fov;
      this.cam.updateProjectionMatrix();
    }
    if (dbg) this.cam.lookAt(dbg.tx - this.ox, dbg.th, dbg.ty - this.oz);
    else if (v.dist <= 0 || v.spot) {
      const look = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
      this.cam.lookAt(this.cam.position.clone().add(look));
    } else this.cam.lookAt(p.x - this.ox, base + H * 0.6, p.y - this.oz);
    // Zone light, haze and weather.
    const zd = ZONES[g.map.zoneAt(p.x, p.y)] ?? ZONES[0];
    const storm = g.weather.phase === 'active' ? 1 : g.weather.phase === 'warning' ? 0.3 : 0;
    this.lighting(zd.key, zd.sky, zd.fog, zd.sun, zd.ground, storm, v.time);
    // From high up you look through less haze.
    const fog = this.scene.fog as THREE.FogExp2;
    fog.density = this.fogBase / (1 + Math.max(0, eh - base - H - 10) / 220);
    // World.
    this.world.home = g.mode === 'world' ? g.gen.hangar : null;
    this.world.update(g.edits, g.editCount, ex, ey, this.ox, this.oz, this.world.count < 20 ? 60 : 9);
    this.compound.update(g, this.ox, this.oz, v.time);
    // Ships.
    const seen = new Set<number>();
    const place = (t: Tank, sm: ShipModel, own: boolean): void => {
      seen.add(t.id);
      const bz = groundLevel(t.x, t.y);
      if (own) this.roll += p.speed * v.dt;
      poseShip(sm, t, t.x - this.ox, t.y - this.oz, bz, own ? this.roll : (t.speed ?? 0) * v.time);
      sm.group.visible = true;
    };
    place(p, ship, true);
    ship.cab.visible = v.dist > 0 || !!v.spot;
    for (const t of g.tanks) {
      if (t.dead && !t.fortress) continue;
      if (Math.hypot(t.x - ex, t.y - ey) > 2400) continue;
      if (!t.fortress) continue;
      place(t, this.shipFor(t), false);
    }
    for (const [id, sm] of this.ships) {
      if (!seen.has(id)) {
        this.scene.remove(sm.group);
        this.ships.delete(id);
      }
    }
    // The searchlight follows your eyes (a security camera leaves it where it was); deck floods; beacons turning.
    ship.group.updateMatrixWorld(true);
    if (!v.spot) {
      // Its mount won't point it down at your own deck: over the bow it can dip, anywhere else it clears the hull.
      const ya = Math.abs(Math.atan2(Math.sin(v.yaw), Math.cos(v.yaw)));
      this.searchAim.yaw = v.yaw;
      this.searchAim.pitch = v.dist > 0 ? 0.1 : Math.max(-0.25, Math.min(ya < 0.7 ? 0.45 : 0.02, v.pitch));
    }
    ship.search.yoke.rotation.y = -this.searchAim.yaw;
    ship.search.drum.rotation.z = -this.searchAim.pitch;
    ship.search.glass.color.set(v.search ? '#fff8e8' : '#4a4a40');
    if (v.search) {
      ship.group.updateMatrixWorld(true);
      const lp = new THREE.Vector3();
      ship.search.lens.getWorldPosition(lp);
      const sy = p.rot + this.searchAim.yaw, sp = this.searchAim.pitch;
      const dir = new THREE.Vector3(Math.cos(sy) * Math.cos(sp), -Math.sin(sp), Math.sin(sy) * Math.cos(sp));
      // A little forward of the lens (the drum's own face would catch it).
      lp.addScaledVector(dir, 0.6);
      this.searchLight.position.copy(lp);
      this.searchLight.target.position.copy(lp).addScaledVector(dir, 200);
      this.searchLight.intensity = 1200;
      this.beam.visible = true;
      this.beam.position.copy(lp);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      this.beam.scale.set(420, 420 * Math.tan(0.15), 420 * Math.tan(0.15));
      (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.05 + storm * 0.1;
    } else {
      this.searchLight.intensity = 0;
      this.beam.visible = false;
    }
    this.floods.forEach((f, i) => {
      const w = p.toWorld(i ? -L * 0.3 : L * 0.12, 0);
      f.position.set(w.x - this.ox, base + H + 10, w.y - this.oz);
      f.intensity = v.deck ? 250 : 0;
    });
    ship.lampMat.color.set(v.deck ? '#fff2cc' : '#6a6048');
    ship.beacons.glows.forEach((gl, i) => {
      gl.visible = !!v.beacon;
      const flash = Math.pow(Math.max(0, Math.cos(v.time * 7 + i * 1.7)), 6);
      (gl.material as THREE.SpriteMaterial).opacity = flash * 0.95;
    });
    ship.beacons.mat.color.set(v.beacon ? (Math.cos(v.time * 7) > 0.3 ? '#ffc040' : '#c07010') : '#5a3a10');
    // The satnav: chevrons flowing along the route ahead, fading in off the bow and out in the distance.
    {
      const r = v.route ?? [];
      const m4c = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const cc = new THREE.Color();
      const tint = v.goal?.course ? new THREE.Color('#76ff03') : new THREE.Color('#18ffff');
      let nc = 0;
      for (let i = 0; i < r.length && nc < 160; i++) {
        const pt = r[i];
        const fade = Math.min(1, i / 4) * Math.min(1, (r.length - i) / 10);
        if (fade <= 0.02) continue;
        q.setFromAxisAngle(up, -pt.a);
        m4c.compose(new THREE.Vector3(pt.x - this.ox, groundLevel(pt.x, pt.y) + 1.4, pt.y - this.oz), q, new THREE.Vector3(2.4, 1, 2.4));
        this.chevrons.setMatrixAt(nc, m4c);
        this.chevrons.setColorAt(nc, cc.copy(tint).multiplyScalar(fade * 1.1));
        nc++;
      }
      this.chevrons.count = nc;
      this.chevrons.instanceMatrix.needsUpdate = true;
      if (this.chevrons.instanceColor) this.chevrons.instanceColor.needsUpdate = true;
      const gl = v.goal;
      this.pillar.visible = !!gl && Math.hypot(gl.x - ex, gl.y - ey) < 6000;
      if (gl && this.pillar.visible) {
        this.pillar.position.set(gl.x - this.ox, groundLevel(gl.x, gl.y), gl.y - this.oz);
        (this.pillar.material as THREE.MeshBasicMaterial).color.set(gl.course ? '#b0ff60' : '#ffffff');
        (this.pillar.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(v.time * 2) * 0.06;
      }
    }
    // Headlamps.
    const on = g.helm.lights;
    this.heads.forEach((s, i) => {
      s.intensity = on ? 900 : 0;
      const at = p.toWorld(L / 2 - 1, (i ? 1 : -1) * p.stats.width * 0.12);
      const to = p.toWorld(L / 2 + 120, (i ? 1 : -1) * 20);
      s.position.set(at.x - this.ox, base + H - 2, at.y - this.oz);
      s.target.position.set(to.x - this.ox, base, to.y - this.oz);
    });
    // Creatures, and everyone else on foot or wheels.
    this.creatures.begin();
    let nr = 0;
    const m4 = new THREE.Matrix4();
    for (const e of g.enemies) {
      if (e.burrowed || e.hp <= 0) continue;
      if (g.mode === 'world' && !g.isVisible(e.x, e.y) && !e.boss) continue;
      const dist = Math.hypot(e.x - ex, e.y - ey);
      if (dist > 1600) continue;
      const def = ENEMIES[e.kind];
      const arch = archFor(e.kind, def?.arch);
      // True to size (the roster's metres), only the smallest nudged up so a rat still reads from the bridge.
      const real = def?.size ?? e.r * (arch === 'humanoid' ? 4.4 : 2.2);
      const len = Math.max(real, 1.3);
      let z = groundLevel(e.x, e.y);
      if (e.latch) z = base + H;
      if (e.flying || arch === 'flyer' || arch === 'dragon') z += 8 + e.z * 4 + Math.sin(v.time * 2 + e.id) * 1.2;
      if (arch === 'entity') z -= 0.3;
      const moving = Math.hypot(e.vx, e.vy);
      const rot = moving > 0.2 ? Math.atan2(e.vy, e.vx) : e.face ?? 0;
      const d: CreatureDraw = {
        arch, x: e.x, y: e.y, z, rot, len, t: e.anim + e.id * 0.37, gait: Math.min(1, moving / Math.max(1, e.speed)),
        body: new THREE.Color(def?.color ?? '#8a7a6a'), eye: new THREE.Color(e.boss ? '#ff40ff' : e.elite ? '#ffd040' : '#ff4020').multiplyScalar(2),
        flash: e.hitFlash > 0, look: lookFor(e.kind, def?.faction),
      };
      this.creatures.add(d, this.ox, this.oz, dist > 140 + len * 10);
      if (dist < 700 && nr < 2000 && !e.latch) {
        const rs = Math.max(1.2, len * 0.6);
        m4.compose(new THREE.Vector3(e.x - this.ox, groundLevel(e.x, e.y) + 0.15, e.y - this.oz), new THREE.Quaternion(), new THREE.Vector3(rs, 1, rs));
        this.rings.setMatrixAt(nr++, m4);
      }
    }
    this.rings.count = nr;
    this.rings.instanceMatrix.needsUpdate = true;
    for (const a of g.allies) {
      if (Math.hypot(a.x - ex, a.y - ey) > 1400) continue;
      const arch = a.kind === 'dragon' ? 'dragon' : a.kind === 'mech' ? 'bot' : a.kind === 'buggy' || a.kind === 'minitank' ? 'vehicle' : a.kind === 'jet' || a.kind === 'drone' ? 'flyer' : a.kind === 'mine' ? null : 'humanoid';
      if (!arch) continue;
      const len = a.kind === 'dragon' ? 22 : a.kind === 'mech' ? 7 : a.kind === 'minitank' ? 8 : a.kind === 'buggy' ? 5 : a.kind === 'jet' ? 12 : a.kind === 'drone' ? 2.4 : 1.9;
      const z = groundLevel(a.x, a.y) + (a.z > 0.5 || a.kind === 'jet' || a.kind === 'drone' ? 10 + a.z * 4 : 0);
      this.creatures.add({
        arch, x: a.x, y: a.y, z, rot: a.rot, len, t: a.anim, gait: 1, body: new THREE.Color(a.kind === 'marine' || a.kind === 'heavy' ? '#56603f' : '#4a6a8a'),
        eye: new THREE.Color('#40c0ff').multiplyScalar(2), flash: false, look: '',
      }, this.ox, this.oz);
    }
    // People on your deck: the nests' soldiers (aiming when there's anything near), deckhands walking their beats.
    {
      const threat = g.enemies.some((e) => e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) < 400);
      for (const [i, pt] of ship.posts.entries()) {
        const w = p.toWorld(pt.lx, pt.lz);
        this.creatures.add({ arch: 'humanoid', x: w.x, y: w.y, z: base + H + 0.2, rot: p.rot + pt.face, len: 1.85, t: v.time + i, gait: 0, body: new THREE.Color('#56603f'), eye: new THREE.Color('#000000'), flash: false, look: '' }, this.ox, this.oz);
        void threat;
      }
      ship.beats.forEach((b, i) => {
        const len = Math.hypot(b.bx - b.ax, b.bz - b.az) || 1;
        const ph = ((v.time * 1.4) / len + i * 0.37) % 2;
        const k = ph < 1 ? ph : 2 - ph;
        const lx = b.ax + (b.bx - b.ax) * k, lz = b.az + (b.bz - b.az) * k;
        const w = p.toWorld(lx, lz);
        const dir = Math.atan2(b.bz - b.az, b.bx - b.ax) + (ph < 1 ? 0 : Math.PI);
        this.creatures.add({ arch: 'humanoid', x: w.x, y: w.y, z: base + H + 0.2, rot: p.rot + dir, len: 1.8, t: v.time * 1.3 + i, gait: 0.6, body: new THREE.Color(['#4a5a6a', '#8a6a3a', '#5a4a6a'][i % 3]), eye: new THREE.Color('#000000'), flash: false, look: '' }, this.ox, this.oz);
      });
    }
    // The base's garrison and residents.
    for (const r of g.compound.people) {
      if (Math.hypot(r.x - ex, r.y - ey) > 500) continue;
      const moving = r.walking ? Math.atan2(r.ty - r.y, r.tx - r.x) : r.face < 0 ? Math.PI : 0;
      this.creatures.add({ arch: 'humanoid', x: r.x, y: r.y, z: groundLevel(r.x, r.y), rot: moving, len: 1.85, t: r.anim, gait: r.walking ? ((r.dodge ?? 0) > 0 ? 1.4 : 0.7) : 0, body: new THREE.Color(r.uniform || '#56603f'), eye: new THREE.Color('#000000'), flash: false, look: '' }, this.ox, this.oz);
    }
    this.creatures.end();
    // Shots in flight.
    let nt = 0;
    const col = new THREE.Color();
    for (const pr of g.projectiles) {
      if (nt >= 1500) break;
      if (Math.abs(pr.x - ex) > 1500 || Math.abs(pr.y - ey) > 1500) continue;
      const sp = Math.hypot(pr.vx, pr.vy);
      const len = Math.min(26, 2 + sp * 0.05);
      const zz = groundLevel(pr.x, pr.y) + (pr.team === 'player' ? H * 0.6 : 2) + pr.z * 3;
      const a = Math.atan2(pr.vy, pr.vx);
      const pitchA = Math.atan2(pr.vz ?? 0, sp || 1);
      m4.compose(new THREE.Vector3(pr.x - this.ox, zz, pr.y - this.oz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, pitchA)), new THREE.Vector3(len, pr.kind === 'shell' || pr.kind === 'missile' || pr.kind === 'mortar' ? 0.5 : 0.22, pr.kind === 'shell' || pr.kind === 'missile' || pr.kind === 'mortar' ? 0.5 : 0.22));
      this.tracers.setMatrixAt(nt, m4);
      this.tracers.setColorAt(nt, col.set(pr.color).multiplyScalar(2.2));
      nt++;
    }
    this.tracers.count = nt;
    this.tracers.instanceMatrix.needsUpdate = true;
    if (this.tracers.instanceColor) this.tracers.instanceColor.needsUpdate = true;
    // Bursts and smoke.
    for (const e of fx) this.handleFx(e, H);
    this.stackT += v.dt;
    const power = Math.max(0.15, p.spool);
    if (this.stackT > 0.12 / power) {
      this.stackT = 0;
      for (const s of ship.stacks) {
        const w = p.toWorld(s.x, s.z);
        this.smoke(w.x, w.y, base + s.y + 1, 2.5, 9 + power * 6, '#3a3632', 3.5, 0.55, (hash2(this.lastT * 100, s.x, 3) - 0.5) * 2, 6 + power * 5);
        if (p.spool > 0.6 && hash2(this.lastT * 60, s.z, 5) > 0.6) this.glowAt(w.x, w.y, base + s.y + 1.5, 3.2 * power, '#ff9040', 0.18);
      }
      // Dust off the crawlers at speed.
      const sp = Math.abs(p.speed);
      if (sp > 3) {
        const dust = zd.key === 'frost' ? '#e8eef4' : zd.key === 'dunes' || zd.key === 'pass' ? '#c8a878' : zd.key === 'ash' ? '#8a8680' : '#a89878';
        for (const side of [-1, 1]) {
          const w = p.toWorld(-L / 2 + 4, side * p.stats.width * 0.46);
          this.smoke(w.x, w.y, base + 2, 5, 16 + sp * 0.3, dust, 2.4, Math.min(0.5, sp / 60), side * 3, 2);
        }
      }
    }
    this.stepPuffs(v.dt);
    // Weather.
    if (storm > 0.2) {
      this.weather.visible = true;
      const wm = this.weather.material as THREE.PointsMaterial;
      wm.color.set(zd.key === 'frost' ? '#ffffff' : zd.key === 'dunes' || zd.key === 'pass' ? '#d8b078' : zd.key === 'ash' || zd.key === 'scorched' ? '#8a8480' : '#c8d8e8');
      wm.size = zd.key === 'frost' ? 0.6 : 0.35;
      const pos = this.weather.geometry.attributes.position as THREE.BufferAttribute;
      const fall = zd.key === 'frost' ? 6 : zd.key === 'dunes' ? 2 : 30;
      const drift = zd.key === 'dunes' || zd.key === 'pass' ? 40 : 8;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - fall * v.dt;
        let x = pos.getX(i) + drift * v.dt;
        if (y < 0) y += 90;
        if (x > 120) x -= 240;
        pos.setXY(i, x, y);
      }
      pos.needsUpdate = true;
      this.weather.position.set(this.cam.position.x, eh - 45, this.cam.position.z);
    } else this.weather.visible = false;
    // Sky and rim follow the camera.
    this.sky.position.copy(this.cam.position);
    this.rim.position.set(this.cam.position.x, groundLevel(ex, ey), this.cam.position.z);
    this.skirt.position.set(this.cam.position.x, base - 2.5, this.cam.position.z);
    this.skyU.time.value = v.time;
    // Shadows cover the ground round what you're looking at.
    const fwd = new THREE.Vector3();
    this.cam.getWorldDirection(fwd);
    const focus = this.cam.position.clone().add(fwd.multiplyScalar(v.dist > 0 ? v.dist * 0.6 : 140));
    focus.y = base;
    const sd = this.skyU.sunDir.value as THREE.Vector3;
    this.sun.position.copy(focus).add(sd.clone().multiplyScalar(700));
    this.sun.target.position.copy(focus);
    // Adapt the resolution to how fast frames come.
    const t0 = performance.now();
    this.r.render(this.scene, this.cam);
    const ms = performance.now() - t0;
    this.slow = this.slow * 0.95 + (v.dt > 0.045 ? 1 : 0) * 0.05;
    void ms;
  }

  /** Whether frames are coming slow (the cabin lowers the resolution). */
  get struggling(): boolean {
    return this.slow > 0.5;
  }

  private shipFor(t: Tank): ShipModel {
    const klass = t === this.lastPlayer ? this.klass : t.kind;
    const key = shipKey(t, klass);
    let sm = this.ships.get(t.id);
    if (!sm || sm.key !== key) {
      if (sm) this.scene.remove(sm.group);
      sm = buildShip(t, klass);
      this.ships.set(t.id, sm);
      this.scene.add(sm.group);
    }
    return sm;
  }

  private lastPlayer: Tank | null = null;
  private klass = 'juggernaut';

  /** Tells the view which hull is yours and its class (for the paint). */
  setPlayer(t: Tank, klass: string): void {
    this.lastPlayer = t;
    this.klass = klass;
  }

  private lighting(key: string, sky: string, fog: string, sun: string, ground: string, storm: number, time: number): void {
    const k = `${key}|${storm.toFixed(1)}`;
    if (k !== this.zoneKey) {
      this.zoneKey = k;
      const fogC = lin(fog).lerp(lin('#5a5e66'), storm * 0.5);
      const top = lin(sky).lerp(lin('#2a5aa8'), 0.45).lerp(lin('#3a3e46'), storm * 0.7);
      (this.skyU.top.value as THREE.Color).copy(top);
      (this.skyU.horizon.value as THREE.Color).copy(lin(sky).lerp(fogC, 0.5));
      (this.skyU.ground.value as THREE.Color).copy(lin(sky).lerp(fogC, 0.65));
      (this.skyU.sunCol.value as THREE.Color).copy(lin(sun));
      this.skyU.storm.value = storm;
      this.skyU.cloud.value = key === 'verdant' ? 0.55 : key === 'dunes' ? 0.15 : key === 'frost' ? 0.7 : 0.4;
      (this.scene.fog as THREE.FogExp2).color.copy(lin(sky).lerp(fogC, 0.65));
      this.fogBase = (key === 'ash' ? 0.0024 : key === 'lake' ? 0.002 : key === 'dunes' || key === 'pass' ? 0.0017 : 0.0015) * (1 + storm * 3);
      this.sun.color.copy(lin(sun));
      this.sun.intensity = 2.6 * (1 - storm * 0.6);
      this.hemi.color.copy(lin(sky));
      this.hemi.groundColor.copy(lin(ground));
      this.hemi.intensity = 1.1;
      (this.rim.material as THREE.MeshBasicMaterial).color.copy(lin('#3a3430').lerp(lin(fog), 0.55));
      (this.skirt.material as THREE.MeshStandardMaterial).color.copy(lin(ground).lerp(lin(sky), 0.25));
      // Image-based light from this sky: metal reflects it, everything picks up its tint in the shadows.
      try {
        if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(this.r);
        const envScene = new THREE.Scene();
        const skyCopy = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), (this.sky.material as THREE.ShaderMaterial).clone());
        (skyCopy.material as THREE.ShaderMaterial).uniforms = this.skyU;
        envScene.add(skyCopy);
        const rt = this.pmrem.fromScene(envScene, 0, 0.1, 1000);
        this.envRT?.dispose();
        this.envRT = rt;
        this.scene.environment = rt.texture;
        this.scene.environmentIntensity = 0.55;
      } catch {
        this.scene.environment = null;
      }
    }
    void time;
  }

  private handleFx(e: FxEvent, H: number): void {
    switch (e.t) {
      case 'boom': {
        const z = groundLevel(e.x, e.y) + 1;
        const r = Math.max(2.5, e.r * 2.2) * (e.big ? 1.6 : 1);
        this.glowAt(e.x, e.y, z + r * 0.4, r * 2.4, e.color.length === 7 ? e.color : '#ffab40', e.big ? 0.7 : 0.38);
        this.glowAt(e.x, e.y, z + r * 0.4, r, '#fff4d0', 0.2);
        for (let i = 0; i < (e.big ? 7 : 3); i++) this.smoke(e.x, e.y, z, r * 0.8, r * 2.6, '#3a3430', 3 + hash2(i, e.x, 7) * 2, 0.7, (hash2(i, e.y, 9) - 0.5) * 6, 5 + hash2(i, 3, e.x) * 5);
        if (e.big) for (let i = 0; i < 4; i++) this.smoke(e.x + (hash2(i, 1, e.x) - 0.5) * r * 2, e.y + (hash2(i, 2, e.y) - 0.5) * r * 2, z, r * 0.6, r * 1.5, '#8a7a60', 1.6, 0.5, 0, 2);
        break;
      }
      case 'nuke': {
        const z = groundLevel(e.x, e.y);
        this.glowAt(e.x, e.y, z + 40, e.r * 6, '#fff3c4', 2);
        for (let i = 0; i < 18; i++) this.smoke(e.x, e.y, z + i * 12, e.r * 1.5, e.r * 5, '#5a4a40', 9, 0.8, (hash2(i, 1, 5) - 0.5) * 8, 10 + i * 2);
        break;
      }
      case 'muzzle':
        if (Math.random() < 0.6) this.glowAt(e.x, e.y, groundLevel(e.x, e.y) + (e.z ?? H * 0.6) + 2, 2 + e.size * 1.6, '#fff0a0', 0.07);
        break;
      case 'strike':
        this.glowAt(e.x, e.y, groundLevel(e.x, e.y) + 1, 5, e.color, 0.25);
        break;
      case 'dust':
        this.smoke(e.x, e.y, groundLevel(e.x, e.y), 2, 6, e.color, 1.5, 0.5, 0, 1);
        break;
      case 'debris':
        for (let i = 0; i < Math.min(6, e.n); i++) this.smoke(e.x, e.y, groundLevel(e.x, e.y) + e.h * 0.3, 3, 10, e.color, 2.5, 0.65, e.fx * 4, 3);
        break;
      default:
    }
  }

  private take(pool: Puff[]): Puff {
    let best = pool[0];
    for (const q of pool) {
      if (!q.on) return q;
      if (q.t / q.max > best.t / best.max) best = q;
    }
    return best;
  }

  private glowAt(x: number, y: number, z: number, r: number, color: string, life: number): void {
    const q = this.take(this.glowPool);
    Object.assign(q, { x, y, z, vx: 0, vy: 0, vz: 0, t: 0, max: life, r0: r * 0.6, r1: r * 1.2, a0: 1, on: true });
    (q.s.material as THREE.SpriteMaterial).color.set(color).multiplyScalar(2);
    q.s.visible = true;
  }

  private smoke(x: number, y: number, z: number, r0: number, r1: number, color: string, life: number, alpha: number, vx: number, vz: number): void {
    const q = this.take(this.smokePool);
    Object.assign(q, { x, y, z, vx, vy: (hash2(x * 3, y * 7, 11) - 0.5) * 3, vz, t: 0, max: life, r0, r1, a0: alpha, on: true });
    (q.s.material as THREE.SpriteMaterial).color.set(color);
    (q.s.material as THREE.SpriteMaterial).rotation = hash2(x, y, 13) * 6.28;
    q.s.visible = true;
  }

  private stepPuffs(dt: number): void {
    for (const pool of [this.glowPool, this.smokePool]) {
      for (const q of pool) {
        if (!q.on) continue;
        q.t += dt;
        if (q.t >= q.max) {
          q.on = false;
          q.s.visible = false;
          continue;
        }
        const k = q.t / q.max;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.z += q.vz * dt;
        q.vz *= 0.97;
        const r = q.r0 + (q.r1 - q.r0) * Math.sqrt(k);
        q.s.position.set(q.x - this.ox, q.z, q.y - this.oz);
        q.s.scale.set(r, r, r);
        (q.s.material as THREE.SpriteMaterial).opacity = q.a0 * (pool === this.glowPool ? 1 - k : Math.min(1, k * 6) * (1 - k));
      }
    }
  }

  dispose(): void {
    this.r.dispose();
  }
}
