import {
  BoxGeometry, Color, DepthTexture, Fog, Group, HalfFloatType, HemisphereLight, DirectionalLight, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  NearestFilter, Object3D, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, ShaderMaterial, Sprite,
  Vector2, Vector3, WebGLRenderer, WebGLRenderTarget, AdditiveBlending, PCFShadowMap, SphereGeometry,
} from 'three';
import { getItem } from '../shared/items';
import { RARITIES } from '../shared/rarity';
import { RUNE_INFO } from '../shared/mapgen';
import { ZONES, DEAD_ZONE } from '../shared/zones';
import type { Enemy, Pickup, Projectile } from '../game/entities';
import { ENEMIES } from '../game/enemyDefs';
import type { FxEvent, Game } from '../game/game';
import type { Tank } from '../game/tank';
import { CHEST_INFO } from '../game/chests';
import { makeDecal, Particles, Transients, type Decal } from './fx';
import { fowUniforms, updateFow, fillFow } from './fow';
import { buildAllyModel, buildGateModel, buildNodeModel, buildRuneModel, buildSiteModel, buildTankModel, buildTitanModel, disposeModel, type AllyModel, type TankModel, type TitanModel } from './models';
import { shadowTexture, spriteMat } from './sprites';
import { CreatureLayer } from './creatures';
import { TerrainView } from './terrain';
import { getAtlas } from './textures';

const POST_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 res;
uniform float cNear;
uniform float cFar;
uniform float quant;
uniform float outline;
varying vec2 vUv;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * cNear * cFar / (cFar + cNear - z * (cFar - cNear)); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  float v = 0.0;
  for (int k = 0; k < 16; k++) if (float(k) == i) v = m[k];
  return v / 16.0;
}
void main() {
  vec2 px = 1.0 / res;
  vec3 c = texture2D(tColor, vUv).rgb;
  float d = lin(texture2D(tDepth, vUv).r);
  float d1 = lin(texture2D(tDepth, vUv + vec2(px.x, 0.0)).r);
  float d2 = lin(texture2D(tDepth, vUv - vec2(px.x, 0.0)).r);
  float d3 = lin(texture2D(tDepth, vUv + vec2(0.0, px.y)).r);
  float d4 = lin(texture2D(tDepth, vUv - vec2(0.0, px.y)).r);
  float dn = max(max(d1, d2), max(d3, d4));
  float edge = step(0.45 + d * 0.012, dn - d) * outline;
  c = mix(c, c * 0.22, edge * 0.85);
  vec3 s = toSRGB(clamp(c, 0.0, 1.0));
  float b = bayer(gl_FragCoord.xy) - 0.5;
  s = floor(s * quant + b * 0.85 + 0.5) / quant;
  gl_FragColor = vec4(s, 1.0);
}`;

interface EnemyVis {
  sprite: Sprite;
  shadow: Mesh;
  kind: string;
}

const PROJ_GEO = new BoxGeometry(1, 1, 1);

/** Projectiles that shed glowing particles (and how often). */
const GLOW_KINDS: Partial<Record<string, number>> = {
  plasma: 0.9, orb: 0.9, soul: 0.8, chrono: 0.8, gravity: 1, phoenix: 1, fireball: 0.9, flame: 0.4, cryo: 0.6, acid: 0.5, ink: 0.5, nuke: 1, meteor: 1, grenade: 0.2,
};
const ROUND_KINDS = new Set(['plasma', 'orb', 'soul', 'chrono', 'gravity', 'fireball', 'acid', 'ink', 'grenade', 'meteor', 'boulder']);
const ZONE_COLOR: Record<string, string> = { fire: '#ff6d00', acid: '#76ff03', well: '#d500f9', chrono: '#18ffff', rad: '#c6ff00', frost: '#80deea', smoke: '#9e9e9e' };

export class View {
  renderer: WebGLRenderer;
  scene = new Scene();
  camera: PerspectiveCamera;
  private rt: WebGLRenderTarget;
  private postScene = new Scene();
  private postCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postMat: ShaderMaterial;
  private sun: DirectionalLight;
  private hemi: HemisphereLight;
  terrain: TerrainView | null = null;
  private world = new Group();
  private units = new Group();
  private addP = new Particles(4000, true);
  private normP = new Particles(3000, false);
  private trans = new Transients();
  private tankModels = new Map<Tank, TankModel>();
  private creatures = new CreatureLayer();
  private titanVis = new Map<number, TitanModel>();
  private allyVis = new Map<number, EnemyVis>();
  private allyModels = new Map<number, AllyModel & { shadow: Mesh }>();
  private domeVis: Mesh | null = null;
  private projPool: Mesh[] = [];
  private projMats = new Map<string, MeshBasicMaterial>();
  private pickupVis = new Map<number, Object3D>();
  private decals = new Map<number, Decal>();
  private zoneDecals = new Map<number, Decal>();
  private nodeVis = new Map<number, Object3D>();
  private siteVis = new Map<number, { root: Group; beacon: Mesh; ring: Decal }>();
  private runeVis = new Map<number, { root: Group; crystal: Object3D; beam: Mesh }>();
  private gateVis: { root: Group; disc: Mesh } | null = null;
  private extractVis: Group[] = [];
  private marker: { decal: Decal; t: number } | null = null;
  private rangeRing: Decal;
  private shadowMat: MeshBasicMaterial;
  private shadowGeo = new PlaneGeometry(1, 1);
  /** Camera target, distance, heading of "up the screen" (radians) and pitch (degrees). */
  cam = { x: 320, y: 320, zoom: 38, yaw: -Math.PI / 2, pitch: 56 };
  /** Card being aimed: a ring on the ground where it will land. */
  aim: { x: number; y: number; r: number; color: string } | null = null;
  private aimRing: Decal;
  /** Tracking beacon: a beam of light over the place the objective tracker points at. */
  beacon: { x: number; y: number; color: string } | null = null;
  private beaconVis: Group | null = null;
  private shadowExt = 48;
  private shakeAmt = 0;
  pixelScale = 3;
  width = 1;
  height = 1;
  rw = 1;
  rh = 1;
  private lastFog = -1;
  private raycaster = new Raycaster();
  private skyCol = new Color();
  private groundCol = new Color();
  private sunCol = new Color();
  private fogCol = new Color();
  time = 0;
  rangeR = 0;
  outlines = true;
  private worldGame: Game | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.camera = new PerspectiveCamera(32, 1, 1, 400);
    this.rt = new WebGLRenderTarget(4, 4, { type: HalfFloatType, depthTexture: new DepthTexture(4, 4) });
    this.rt.texture.minFilter = NearestFilter;
    this.rt.texture.magFilter = NearestFilter;
    this.postMat = new ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG,
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, res: { value: new Vector2(4, 4) },
        cNear: { value: 1 }, cFar: { value: 400 }, quant: { value: 36 }, outline: { value: 1 },
      },
      depthTest: false, depthWrite: false,
    });
    this.postScene.add(new Mesh(new PlaneGeometry(2, 2), this.postMat));
    this.hemi = new HemisphereLight('#e8b48a', '#5a3a2a', 1.9);
    this.sun = new DirectionalLight('#ffe0b8', 2.6);
    this.sun.castShadow = true;
    // Phones and tablets get a lighter shadow map.
    const mobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -48;
    sc.right = 48;
    sc.top = 48;
    sc.bottom = -48;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.fog = new Fog('#c89a78', 60, 140);
    this.scene.add(this.world, this.units, this.addP.points, this.normP.points, this.trans.group, this.creatures.sprites.points, this.creatures.shadows.points);
    this.shadowMat = new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
    this.shadowGeo.rotateX(-Math.PI / 2);
    this.rangeRing = makeDecal('circle', '#4dd0e1');
    this.rangeRing.fillMat.opacity = 0.06;
    this.rangeRing.root.visible = false;
    this.scene.add(this.rangeRing.root);
    this.aimRing = makeDecal('circle', '#ffd740', true);
    this.aimRing.fillMat.opacity = 0.14;
    this.aimRing.root.visible = false;
    this.scene.add(this.aimRing.root);
    getAtlas();
    this.resize();
  }

  /** Points the view at a world (open world or Dead Zone arena). */
  setWorld(g: Game): void {
    this.worldGame = g;
    for (const v of this.nodeVis.values()) this.world.remove(v);
    for (const v of this.siteVis.values()) {
      this.world.remove(v.root);
      this.world.remove(v.ring.root);
    }
    for (const v of this.runeVis.values()) this.world.remove(v.root);
    if (this.gateVis) this.world.remove(this.gateVis.root);
    this.nodeVis.clear();
    this.siteVis.clear();
    this.runeVis.clear();
    this.gateVis = null;
    for (const [t, m] of this.tankModels) {
      this.units.remove(m.root);
      disposeModel(m);
      this.tankModels.delete(t);
    }
    if (!this.terrain) {
      this.terrain = new TerrainView(g.map, g.gen.props);
      this.world.add(this.terrain.group);
    } else this.terrain.setMap(g.map, g.gen.props);
    for (const e of this.extractVis) this.world.remove(e);
    this.extractVis = [];
    for (const e of g.extracts) {
      const grp = new Group();
      const ring = makeDecal('circle', '#76ff03', true);
      ring.fillMat.opacity = 0.08;
      ring.root.scale.setScalar(e.r);
      const beam = new Mesh(new BoxGeometry(0.6, 30, 0.6), new MeshBasicMaterial({ color: '#76ff03', transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }));
      beam.position.y = 15;
      grp.add(ring.root, beam);
      grp.position.set(e.x, 0.03, e.y);
      this.world.add(grp);
      this.extractVis.push(grp);
    }
    if (g.mode === 'world') {
      const gate = buildGateModel();
      gate.root.position.set(g.gen.gate.x, 0, g.gen.gate.y);
      this.world.add(gate.root);
      this.gateVis = gate;
    }
    this.lastFog = -1;
    fowUniforms.fowOn.value = g.mode === 'world' ? 1 : 0;
    if (g.mode !== 'world') fillFow(255);
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w;
    this.height = h;
    let ps = w * h > 2200000 ? 4 : w * h > 900000 ? 3 : 2;
    const dpr = window.devicePixelRatio || 1;
    if (Math.min(w, h) < 560 && dpr > 1) {
      // Phones: small CSS screens with dense pixels. Aim for ~300 rendered lines on the short side,
      // with each game pixel a whole number of device pixels.
      const k = Math.max(2, Math.round((Math.min(w, h) * dpr) / 300));
      ps = k / dpr;
    }
    this.pixelScale = ps;
    this.rw = Math.max(64, Math.floor(w / ps));
    this.rh = Math.max(64, Math.floor(h / ps));
    this.renderer.setSize(this.rw, this.rh, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.rt.setSize(this.rw, this.rh);
    (this.postMat.uniforms.res.value as Vector2).set(this.rw, this.rh);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const px = this.rh / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.addP.mat.uniforms.pxScale.value = px;
    this.creatures.pxScale = px;
    this.normP.mat.uniforms.pxScale.value = px;
  }

  shake(a: number): void {
    this.shakeAmt = Math.min(1.5, this.shakeAmt + a);
  }

  moveMarker(x: number, y: number, color = '#76ff03'): void {
    if (!this.marker) {
      this.marker = { decal: makeDecal('circle', color), t: 0 };
      this.scene.add(this.marker.decal.root);
    }
    this.marker.decal.fillMat.color.set(color);
    this.marker.decal.edgeMat.color.set(color);
    this.marker.decal.root.position.set(x, 0.05, y);
    this.marker.t = 0.5;
  }

  private placeCamera(): void {
    const pitch = (this.cam.pitch * Math.PI) / 180;
    const D = this.cam.zoom;
    let sx = 0, sy = 0;
    if (this.shakeAmt > 0.01) {
      sx = (Math.random() - 0.5) * this.shakeAmt;
      sy = (Math.random() - 0.5) * this.shakeAmt;
    }
    // The camera sits behind "up the screen" and looks along it.
    const bx = -Math.cos(this.cam.yaw) * Math.cos(pitch) * D, by = -Math.sin(this.cam.yaw) * Math.cos(pitch) * D;
    this.camera.position.set(this.cam.x + bx + sx, Math.sin(pitch) * D, this.cam.y + by + sy);
    this.camera.lookAt(this.cam.x + sx, 0, this.cam.y + sy);
    this.camera.updateMatrixWorld();
    this.sun.position.set(this.cam.x - 26, 60, this.cam.y + 34);
    this.sun.target.position.set(this.cam.x, 0, this.cam.y);
    // A big fortress needs a big shadow map.
    const ext = Math.max(48, Math.round(D * 1.25 / 8) * 8);
    if (ext !== this.shadowExt) {
      this.shadowExt = ext;
      const sc = this.sun.shadow.camera;
      sc.left = -ext;
      sc.right = ext;
      sc.top = ext;
      sc.bottom = -ext;
      sc.far = 120 + ext * 2;
      sc.updateProjectionMatrix();
    }
    this.camera.far = Math.max(400, D * 6);
  }

  /** Screen (CSS px) -> point on the horizontal plane at height h. */
  screenToPlane(sx: number, sy: number, h: number): { x: number; y: number } {
    const ndc = new Vector2((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const r = this.raycaster.ray;
    const t = (h - r.origin.y) / (r.direction.y || -1e-6);
    return { x: r.origin.x + r.direction.x * t, y: r.origin.z + r.direction.z * t };
  }

  /** Screen (CSS px) -> ground point. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return this.screenToPlane(sx, sy, 0);
  }

  /** World -> screen (CSS px). */
  worldToScreen(x: number, y: number, h = 0): { x: number; y: number; ok: boolean } {
    const v = new Vector3(x, h, y).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height, ok: v.z < 1 && v.z > -1 };
  }

  private applyZoneLight(g: Game, dt: number): void {
    const zd = g.mode === 'raid' ? DEAD_ZONE : ZONES[g.map.zoneAt(this.cam.x, this.cam.y)] ?? ZONES[0];
    const k = Math.min(1, dt * 1.5);
    this.skyCol.lerp(new Color(zd.sky), k);
    this.groundCol.lerp(new Color(zd.ground), k);
    this.sunCol.lerp(new Color(zd.sun), k);
    this.fogCol.lerp(new Color(zd.fog), k);
    this.hemi.color.copy(this.skyCol);
    this.hemi.groundColor.copy(this.groundCol);
    this.sun.color.copy(this.sunCol);
    const fog = this.scene.fog as Fog;
    fog.color.copy(this.fogCol);
    fog.near = this.cam.zoom * 1.5;
    fog.far = this.cam.zoom * 3.4;
    this.renderer.setClearColor(this.fogCol);
  }

  /* ---------------------------------------------------------------- */

  render(g: Game, dt: number): void {
    this.time += dt;
    this.shakeAmt *= Math.pow(0.02, dt);
    if (this.skyCol.r === 0 && this.skyCol.g === 0) {
      const zd = ZONES[0];
      this.skyCol.set(zd.sky);
      this.groundCol.set(zd.ground);
      this.sunCol.set(zd.sun);
      this.fogCol.set(zd.fog);
    }
    this.applyZoneLight(g, dt);
    this.placeCamera();
    if (g.dirtyChunks.size) {
      for (const k of g.dirtyChunks) this.terrain?.invalidate(k % 1000, Math.floor(k / 1000));
      g.dirtyChunks.clear();
    }
    this.terrain?.update(this.cam.x, this.cam.y, this.cam.zoom * 1.6 + 10, this.time);
    if (g.mode === 'world' && g.fogVersion !== this.lastFog) {
      this.lastFog = g.fogVersion;
      updateFow(g.explored, g.visible);
    }
    for (const e of g.fx) this.handleFx(e);
    g.fx.length = 0;
    this.syncFeatures(g);
    this.syncTanks(g);
    this.syncEnemies(g);
    this.syncAllies(g);
    this.syncProjectiles(g.projectiles, g);
    this.syncPickups(g.pickups);
    this.syncDecals(g);
    if (this.marker) {
      this.marker.t -= dt;
      const s = Math.max(0.01, this.marker.t * 3);
      this.marker.decal.root.scale.setScalar(s);
      this.marker.decal.root.visible = this.marker.t > 0;
    }
    this.aimRing.root.visible = !!this.aim;
    if (this.aim) {
      this.aimRing.fillMat.color.set(this.aim.color);
      this.aimRing.edgeMat.color.set(this.aim.color);
      this.aimRing.root.position.set(this.aim.x, 0.06, this.aim.y);
      this.aimRing.root.scale.setScalar(Math.max(1.2, this.aim.r) * (1 + Math.sin(this.time * 8) * 0.03));
    }
    this.syncBeacon();
    this.rangeRing.root.visible = this.rangeR > 0 && !g.player.dead;
    if (this.rangeRing.root.visible) {
      this.rangeRing.root.position.set(g.player.x, 0.04, g.player.y);
      this.rangeRing.root.scale.setScalar(this.rangeR);
    }
    this.addP.update(dt);
    this.normP.update(dt);
    this.trans.update(dt);
    this.postMat.uniforms.cNear.value = this.camera.near;
    this.postMat.uniforms.cFar.value = this.camera.far;
    this.postMat.uniforms.outline.value = this.outlines ? 1 : 0;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }

  private syncBeacon(): void {
    const b = this.beacon;
    if (!b) {
      if (this.beaconVis) this.beaconVis.visible = false;
      return;
    }
    if (!this.beaconVis) {
      const grp = new Group();
      const beam = new Mesh(new BoxGeometry(0.8, 40, 0.8), new MeshBasicMaterial({ color: '#ffd740', transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }));
      beam.position.y = 20;
      const ring = makeDecal('circle', '#ffd740', true);
      ring.fillMat.opacity = 0.1;
      ring.root.scale.setScalar(3);
      grp.add(beam, ring.root);
      grp.userData.beam = beam;
      grp.userData.ring = ring;
      this.world.add(grp);
      this.beaconVis = grp;
    }
    const grp = this.beaconVis;
    grp.visible = true;
    grp.position.set(b.x, 0.05, b.y);
    ((grp.userData.beam as Mesh).material as MeshBasicMaterial).color.set(b.color);
    ((grp.userData.beam as Mesh).material as MeshBasicMaterial).opacity = 0.25 + Math.sin(this.time * 4) * 0.1;
    const ring = grp.userData.ring as Decal;
    ring.edgeMat.color.set(b.color);
    ring.root.scale.setScalar(2.5 + (this.time % 1.2) * 2);
  }

  /* ---------------------------------------------------------------- */

  private near(x: number, y: number, r: number): boolean {
    return Math.abs(x - this.cam.x) < r && Math.abs(y - this.cam.y) < r;
  }

  private syncFeatures(g: Game): void {
    if (g.mode !== 'world') return;
    const R = this.cam.zoom * 1.8 + 12;
    for (const n of g.gen.nodes) {
      const vis = this.nodeVis.get(n.id);
      const want = n.respawnAt === 0 && this.near(n.x, n.y, R);
      if (want && !vis) {
        const m = buildNodeModel(n.type, n.id);
        m.position.set(n.x, 0, n.y);
        this.world.add(m);
        this.nodeVis.set(n.id, m);
      } else if (!want && vis) {
        this.world.remove(vis);
        disposeModel({ root: vis });
        this.nodeVis.delete(n.id);
      }
    }
    for (const s of g.gen.sites) {
      let v = this.siteVis.get(s.id);
      if (!v && this.near(s.x, s.y, R)) {
        const m = buildSiteModel(s.kind);
        m.root.position.set(s.x, 0, s.y);
        const ring = makeDecal('circle', '#ffd740', true);
        ring.fillMat.opacity = 0.05;
        ring.edgeMat.opacity = 0.6;
        ring.root.position.set(s.x, 0.03, s.y);
        ring.root.scale.setScalar(7);
        this.world.add(m.root, ring.root);
        v = { ...m, ring };
        this.siteVis.set(s.id, v);
      }
      if (v) {
        const ready = s.readyAt <= g.time;
        const active = g.site.id === s.id;
        (v.beacon.material as MeshBasicMaterial).color.set(ready ? (Math.sin(this.time * 4) > 0 ? '#ffd740' : '#ff9100') : '#555555');
        v.ring.edgeMat.color.set(active ? '#76ff03' : ready ? '#ffd740' : '#616161');
        v.ring.fillMat.opacity = active ? 0.12 + 0.05 * Math.sin(this.time * 6) : 0.04;
      }
    }
    for (const r of g.gen.runes) {
      let v = this.runeVis.get(r.id);
      if (!v && this.near(r.x, r.y, R)) {
        v = buildRuneModel(r.rune);
        v.root.position.set(r.x, 0, r.y);
        this.world.add(v.root);
        this.runeVis.set(r.id, v);
      }
      if (v) {
        const ready = r.readyAt <= g.time;
        v.crystal.visible = ready;
        v.beam.visible = ready && g.explored[Math.floor(r.y) * g.map.size + Math.floor(r.x)] === 1;
        v.crystal.rotation.y = this.time * 1.5;
        v.crystal.position.y = 1.9 + Math.sin(this.time * 2) * 0.15;
        (v.beam.material as MeshBasicMaterial).opacity = 0.18 + 0.08 * Math.sin(this.time * 3);
        void RUNE_INFO;
      }
    }
    if (this.gateVis) {
      this.gateVis.disc.rotation.y = this.time * 0.8;
      (this.gateVis.disc.material as MeshBasicMaterial).opacity = 0.4 + 0.2 * Math.sin(this.time * 3);
    }
  }

  private syncTanks(g: Game): void {
    const list: Tank[] = [g.player, ...(g.outrider ? [g.outrider] : []), ...g.tanks];
    const alive = new Set(list);
    for (const [t, m] of this.tankModels) {
      if (!alive.has(t) || m.version !== t.version) {
        this.units.remove(m.root);
        disposeModel(m);
        this.tankModels.delete(t);
      }
    }
    for (const t of list) {
      let m = this.tankModels.get(t);
      if (!m) {
        m = buildTankModel(t, t.team !== 'player' && g.mode === 'world');
        this.tankModels.set(t, m);
        this.units.add(m.root);
      }
      const visible = t.team === 'player' || g.mode !== 'world' || g.isVisible(t.x, t.y) || t.dead;
      m.root.visible = visible && !(t === g.player && t.dead && g.respawnIn > 0 && g.mode === 'world' && false);
      m.root.position.set(t.x, 0, t.y);
      m.root.rotation.y = -t.rot;
      for (const mod of t.modules) {
        const tu = m.turrets.get(mod.id);
        if (!tu) continue;
        tu.obj.rotation.y = -(mod.aim - t.rot);
        if (tu.barrel) tu.barrel.position.x = -mod.recoil * 0.18;
      }
      for (const r of m.radars) r.rotation.y = this.time * 2;
      if (m.treadMat.map) m.treadMat.map.offset.x = -((t.treadPhase * 2) % 1);
      // Afterburners: a flicker when idling, a flame trail when moving (hotter on Nitro).
      if (!t.dead && visible && m.exhaust.length && this.near(t.x, t.y, this.cam.zoom * 2)) {
        const hot = t.hasBuff('nitro');
        const push = Math.min(1, Math.abs(t.speed) / Math.max(1, t.stats.topSpeed));
        for (const e of m.exhaust) {
          if (Math.random() > 0.25 + push * 0.6) continue;
          const w = t.toWorld(e.lx, e.lz);
          const back = -(2 + push * 6);
          const vx = Math.cos(t.rot) * back + (Math.random() - 0.5), vy = Math.sin(t.rot) * back + (Math.random() - 0.5);
          this.addP.emit(w.x, w.y, e.y, vx, vy, 0.4, 0.18 + push * 0.25, 0.5 + push * 0.5, new Color(hot ? '#18ffff' : Math.random() < 0.5 ? '#ff9100' : '#ffd740'), 0, 0.9, -0.8);
        }
      }
      if (t.hasBuff('invuln')) {
        const k = 0.18 + 0.1 * Math.sin(this.time * 12);
        m.lit.emissive.setRGB(k * 0.8, k, k * 0.5);
      } else if (t.hitFlash > 0) {
        const k = (t.hitFlash / 0.1) * (t.team === 'player' ? 0.1 : 0.3);
        m.lit.emissive.setRGB(k, k * (t.team === 'player' ? 0.35 : 0.9), k * (t.team === 'player' ? 0.3 : 0.8));
      } else m.lit.emissive.setRGB(0, 0, 0);
      if (t.dead) {
        m.lit.color.set('#3a3632');
        m.glow.color.set('#222');
        if (Math.random() < 0.15) this.normP.emit(t.x + (Math.random() - 0.5) * 2, t.y + (Math.random() - 0.5) * 2, 1.2, 0, 0, 2, 2.5, 0.9, new Color('#3a3a3a'), -0.3, 0.8, 0.5);
      } else {
        m.lit.color.set('#ffffff');
        m.glow.color.set('#ffffff');
        if (t.hp < t.stats.maxHp * 0.35 && Math.random() < 0.2) this.normP.emit(t.x, t.y, 1.5, 0, 0, 1.5, 1.8, 0.6, new Color('#444'), -0.2, 0.8, 0.4);
      }
      // Shield bubble shimmer.
      if (t.shield > 0 && t.hitFlash > 0 && Math.random() < 0.3) this.trans.ring(t.x, t.y, t.stats.length * 0.6, '#40c4ff', 0.25);
    }
  }

  private syncEnemies(g: Game): void {
    const seen = new Set<number>();
    // Everything but titans goes into one batched layer (a horde is hundreds of creatures).
    const R = this.cam.zoom * 2.2;
    for (const e of g.enemies) {
      seen.add(e.id);
      const visible = g.mode !== 'world' || g.isVisible(e.x, e.y) || !!e.titan;
      if (e.titan) {
        this.syncTitan(e, visible);
        continue;
      }
      if (!visible || !this.near(e.x, e.y, R)) continue;
      if (e.burrowed) {
        if (Math.random() < 0.3) this.normP.emit(e.x, e.y, 0.1, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 2, 0.5, 0.25, new Color('#b08858'), 6);
        continue;
      }
      // Horde runners are drawn a bit bigger than their footprint so a swarm reads from a distance.
      const size = e.r * (e.r > 0.9 ? 2.6 : e.horde ? 3.8 : 2.9);
      const frame = Math.floor(e.anim) % 2;
      const variant = e.hitFlash > 0 ? 'flash' : e.elite ? 'elite' : 'n';
      const cell = this.creatures.cellFor(e.kind, ENEMIES[e.kind].color, frame, variant);
      const bob = e.flying ? 1.4 + Math.sin(e.anim * 0.8) * 0.2 : 0;
      // Creatures on a hull (or mid-leap) stand on the deck; their shadow falls on it too.
      const h = bob + e.z * (e.flying ? 0 : 1) + (e.stun > 0 ? 0.05 : 0);
      this.creatures.add(e.x, e.y, h, size, cell, e.face < 0, e.r * 1.2, e.latch ? h + 0.04 : 0.04);
    }
    this.creatures.flush();
    for (const [id, m] of this.titanVis) {
      if (!seen.has(id)) {
        this.units.remove(m.root);
        for (const s of m.segments) this.units.remove(s);
        this.titanVis.delete(id);
      }
    }
  }

  private syncTitan(e: Enemy, visible: boolean): void {
    let m = this.titanVis.get(e.id);
    if (!m) {
      m = buildTitanModel(e.kind, ENEMIES[e.kind].color);
      this.units.add(m.root);
      for (const s of m.segments) this.units.add(s);
      this.titanVis.set(e.id, m);
    }
    m.root.visible = visible && !e.burrowed;
    m.root.position.set(e.x, 0, e.y);
    const tx = this.worldGame?.player.x ?? e.x, ty = this.worldGame?.player.y ?? e.y;
    const want = -Math.atan2(ty - e.y, tx - e.x);
    let cur = m.root.rotation.y;
    let d = want - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    cur += d * 0.05;
    m.root.rotation.y = cur;
    m.legs.forEach((l, i) => {
      l.rotation.z = Math.sin(e.anim * 0.35 + i * Math.PI * 0.5) * 0.3;
    });
    if (m.head) m.head.rotation.z = Math.sin(e.anim * 0.2) * 0.1;
    m.mat.emissive.setRGB(e.hitFlash > 0 ? 0.25 : 0, e.hitFlash > 0 ? 0.2 : 0, e.hitFlash > 0 ? 0.2 : 0);
    m.segments.forEach((s, k) => {
      const p = e.parts[k];
      s.visible = !!p && visible && !e.burrowed;
      if (p) s.position.set(p.x, 0, p.y);
    });
    if (e.burrowed && Math.random() < 0.6) {
      this.normP.emit(e.x + (Math.random() - 0.5) * 3, e.y + (Math.random() - 0.5) * 3, 0.1, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 3, 0.7, 0.4, new Color('#a08050'), 8);
    }
  }

  private syncAllies(g: Game): void {
    const seen = new Set<number>();
    for (const a of g.allies) {
      seen.add(a.id);
      if (a.kind === 'marine' || a.kind === 'heavy') {
        let v = this.allyVis.get(a.id);
        const kind = a.heavy ? 'heavy' : 'marine';
        if (!v) {
          const sprite = new Sprite(spriteMat(kind, '#1565c0', 0, 'n', false));
          sprite.center.set(0.5, 0.08);
          const shadow = new Mesh(this.shadowGeo, this.shadowMat);
          this.units.add(sprite, shadow);
          v = { sprite, shadow, kind };
          this.allyVis.set(a.id, v);
        }
        v.sprite.material = spriteMat(kind, '#1565c0', Math.floor(a.anim) % 2, 'n', a.face < 0);
        v.sprite.position.set(a.x, 0, a.y);
        const sc = a.heavy ? 1.4 : 1.1;
        v.sprite.scale.set(sc, sc, 1);
        v.shadow.position.set(a.x, 0.04, a.y);
        v.shadow.scale.set(0.8, 1, 0.5);
        continue;
      }
      let m = this.allyModels.get(a.id);
      if (!m) {
        const built = buildAllyModel(a.kind);
        const shadow = new Mesh(this.shadowGeo, this.shadowMat);
        m = { ...built, shadow };
        this.units.add(built.root, shadow);
        this.allyModels.set(a.id, m);
      }
      m.root.position.set(a.x, a.z, a.y);
      m.root.rotation.y = -a.rot;
      const size = a.kind === 'dragon' ? 3.5 : a.kind === 'mech' ? 2.2 : a.kind === 'jet' ? 1.2 : a.kind === 'buggy' ? 1.3 : 0.6;
      m.shadow.position.set(a.x, 0.04, a.y);
      m.shadow.scale.set(size, 1, size * 0.7);
      if (a.kind === 'jet') {
        m.root.rotation.x = Math.sin(a.anim * 0.7) * 0.25;
        if (Math.random() < 0.6) this.addP.emit(a.x - Math.cos(a.rot) * 0.6, a.y - Math.sin(a.rot) * 0.6, a.z, 0, 0, 0, 0.2, 0.18, new Color('#ff9100'));
      } else if (a.kind === 'drone') {
        m.root.rotation.y = a.anim * 3;
      } else if (a.kind === 'buggy') {
        m.parts.forEach((w) => (w.rotation.z = -a.anim * 2));
        m.root.position.y = Math.abs(Math.sin(a.anim * 2.2)) * 0.05;
      } else if (a.kind === 'mech') {
        m.parts.forEach((leg, i) => (leg.rotation.z = Math.sin(a.anim * 0.6 + i * Math.PI) * 0.35));
      } else if (a.kind === 'dragon') {
        m.parts.forEach((w, i) => (w.rotation.x = Math.sin(a.anim * 0.9) * 0.5 * (i === 0 ? -1 : 1)));
        if (Math.random() < 0.3) this.addP.emit(a.x, a.y, a.z, 0, 0, -0.5, 0.5, 0.25, new Color('#ff6d00'), 0, 0.8);
      }
      if (a.life < 1.2 && a.kind === 'jet') m.root.position.y = a.z + (1.2 - a.life) * 6;
    }
    for (const [id, v] of this.allyVis) {
      if (!seen.has(id)) {
        this.units.remove(v.sprite, v.shadow);
        this.allyVis.delete(id);
      }
    }
    for (const [id, m] of this.allyModels) {
      if (!seen.has(id)) {
        this.units.remove(m.root, m.shadow);
        this.allyModels.delete(id);
      }
    }
    // Aegis dome and smoke screen around the fortress.
    const p = g.player;
    const dome = p.hasBuff('dome') && !p.dead;
    if (dome && !this.domeVis) {
      this.domeVis = new Mesh(new SphereGeometry(1, 16, 10), new MeshBasicMaterial({ color: '#69f0ae', transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false }));
      this.units.add(this.domeVis);
    }
    if (this.domeVis) {
      this.domeVis.visible = dome;
      if (dome) {
        this.domeVis.position.set(p.x, 0, p.y);
        this.domeVis.scale.set(p.stats.length * 0.62, p.stats.length * 0.4, p.stats.length * 0.62);
        (this.domeVis.material as MeshBasicMaterial).opacity = 0.14 + 0.06 * Math.sin(this.time * 8);
      }
    }
    if (p.hasBuff('smoke') && Math.random() < 0.8) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * p.stats.length * 0.7;
      this.normP.emit(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 0.5, (Math.random() - 0.5), (Math.random() - 0.5), 0.6, 2.2, 1.2, new Color('#9e9e9e'), 0, 0.6, 0.8);
    }
  }

  private projMat(color: string): MeshBasicMaterial {
    let m = this.projMats.get(color);
    if (!m) {
      m = new MeshBasicMaterial({ color });
      this.projMats.set(color, m);
    }
    return m;
  }

  private syncProjectiles(list: Projectile[], g: Game): void {
    while (this.projPool.length < list.length) {
      const m = new Mesh(PROJ_GEO, this.projMat('#ffffff'));
      this.units.add(m);
      this.projPool.push(m);
    }
    for (let i = 0; i < this.projPool.length; i++) {
      const m = this.projPool[i];
      const p = list[i];
      if (!p) {
        m.visible = false;
        continue;
      }
      m.visible = g.mode !== 'world' || p.team === 'player' || g.isVisible(p.x, p.y);
      m.material = this.projMat(p.kind === 'shell' || p.kind === 'mortar' ? '#fff3c4' : p.color);
      const sp = Math.hypot(p.vx, p.vy);
      const round = ROUND_KINDS.has(p.kind);
      const len = p.kind === 'bullet' || p.kind === 'pellet' || p.kind === 'pd' ? Math.min(1.2, 0.3 + sp * 0.02) : round ? p.size : p.size * 2.2;
      const s = p.size;
      m.scale.set(len, s, s);
      if (p.kind === 'flame') m.visible = false;
      m.position.set(p.x, p.z, p.y);
      m.rotation.set(0, -Math.atan2(p.vy, p.vx), p.arc ? Math.atan2(p.vz, sp) : 0);
      // Trails
      if ((p.kind === 'missile' || p.kind === 'mortar' || p.kind === 'shell') && Math.random() < 0.7) {
        this.normP.emit(p.x, p.y, p.z, 0, 0, 0.3, 0.5, p.kind === 'shell' ? 0.25 : 0.35, new Color('#9e9e9e'), 0, 0.5, 0.6);
        if (p.kind === 'missile') this.addP.emit(p.x, p.y, p.z, 0, 0, 0, 0.12, 0.3, new Color('#ff9100'));
      }
      if (p.kind === 'spit' && Math.random() < 0.5) this.addP.emit(p.x, p.y, p.z, 0, 0, 0, 0.3, 0.3, new Color('#76ff03'));
      const glow = GLOW_KINDS[p.kind];
      if (glow && Math.random() < glow) {
        const c = new Color(p.kind === 'nuke' ? '#ff9100' : p.color);
        const sz = p.kind === 'flame' ? 0.5 : p.size * 1.6;
        this.addP.emit(p.x + (Math.random() - 0.5) * p.size, p.y + (Math.random() - 0.5) * p.size, p.z, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, p.kind === 'flame' ? 1.2 : 0.3, p.kind === 'flame' ? 0.25 : 0.35, sz, c, 0, 0.7, p.kind === 'flame' ? 1.2 : 0);
      }
      if ((p.kind === 'nuke' || p.kind === 'meteor') && Math.random() < 0.8) this.normP.emit(p.x, p.y, p.z + 0.5, 0, 0, 0.5, 1.2, 0.6, new Color('#5d4037'), 0, 0.5, 0.8);
    }
  }

  private syncPickups(list: Pickup[]): void {
    const seen = new Set<number>();
    for (const k of list) {
      seen.add(k.id);
      let o = this.pickupVis.get(k.id);
      if (!o) {
        o = this.buildPickup(k);
        this.units.add(o);
        this.pickupVis.set(k.id, o);
      }
      const bob = Math.sin(this.time * 3 + k.id) * 0.1;
      o.position.set(k.x, k.z + bob + 0.1, k.y);
      o.rotation.y = this.time * (k.kind === 'stack' ? 1.5 : 0.6);
    }
    for (const [id, o] of this.pickupVis) {
      if (!seen.has(id)) {
        this.units.remove(o);
        this.pickupVis.delete(id);
      }
    }
  }

  private buildPickup(k: Pickup): Object3D {
    const g = new Group();
    if (k.kind === 'stack' && k.stack) {
      const it = getItem(k.stack.id);
      const size = k.stack.id === 'tech_parts' ? 0.4 : 0.32;
      const m = new Mesh(PROJ_GEO, new MeshLambertMaterial({ color: it.c1, emissive: new Color(it.c1).multiplyScalar(0.3) }));
      m.scale.setScalar(size);
      m.position.y = size / 2;
      m.castShadow = true;
      g.add(m);
      return g;
    }
    const color = k.kind === 'weapon' && k.weapon ? RARITIES[k.weapon.rarity].color : k.chest ? CHEST_INFO[k.chest].color : '#ffffff';
    const box = new Mesh(PROJ_GEO, new MeshLambertMaterial({ color: k.kind === 'chest' ? '#6d4c41' : '#37474f', emissive: new Color(color).multiplyScalar(0.25) }));
    box.scale.set(k.kind === 'chest' ? 1.1 : 0.9, 0.6, 0.7);
    box.position.y = 0.3;
    box.castShadow = true;
    g.add(box);
    const lid = new Mesh(PROJ_GEO, new MeshBasicMaterial({ color }));
    lid.scale.set(k.kind === 'chest' ? 1.16 : 0.95, 0.14, 0.76);
    lid.position.y = 0.66;
    g.add(lid);
    const beam = new Mesh(PROJ_GEO, new MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false }));
    beam.scale.set(0.35, 14, 0.35);
    beam.position.y = 7;
    g.add(beam);
    return g;
  }

  private syncDecals(g: Game): void {
    const seen = new Set<number>();
    for (const t of g.telegraphs) {
      seen.add(t.id);
      let d = this.decals.get(t.id);
      if (!d) {
        d = makeDecal(t.shape, t.color);
        this.scene.add(d.root);
        this.decals.set(t.id, d);
      }
      const k = Math.min(1, t.t / t.total);
      if (t.shape === 'circle') {
        d.root.position.set(t.x, 0.02, t.y);
        d.edge.scale.setScalar(t.r);
        d.fill.scale.setScalar(Math.max(0.01, t.r * k));
      } else {
        const cx = t.x + Math.cos(t.a) * t.len / 2, cy = t.y + Math.sin(t.a) * t.len / 2;
        d.root.position.set(cx, 0.02, cy);
        d.root.rotation.y = -t.a;
        d.edge.scale.set(t.len, 1, t.r * 2);
        d.fill.scale.set(Math.max(0.01, t.len * k), 1, t.r * 2);
        d.fill.position.x = -t.len / 2 + (t.len * k) / 2;
      }
      d.fillMat.opacity = 0.2 + 0.25 * k;
    }
    for (const [id, d] of this.decals) {
      if (!seen.has(id)) {
        this.scene.remove(d.root);
        d.fillMat.dispose();
        d.edgeMat.dispose();
        this.decals.delete(id);
      }
    }
    const zs = new Set<number>();
    for (const z of g.zones) {
      zs.add(z.id);
      let d = this.zoneDecals.get(z.id);
      const color = ZONE_COLOR[z.kind] ?? '#d500f9';
      if (!d) {
        d = makeDecal('circle', color);
        d.fillMat.blending = AdditiveBlending;
        this.scene.add(d.root);
        this.zoneDecals.set(z.id, d);
      }
      d.root.position.set(z.x, 0.03, z.y);
      d.root.scale.setScalar(z.r * (1 + 0.05 * Math.sin(this.time * 8)));
      d.fillMat.opacity = (z.kind === 'well' || z.kind === 'rad' ? 0.12 : 0.2) + 0.08 * Math.sin(this.time * 10 + z.id);
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * z.r;
        if (z.kind === 'well') this.addP.emit(z.x + Math.cos(a) * z.r, z.y + Math.sin(a) * z.r, 0.3, -Math.cos(a) * z.r * 1.5, -Math.sin(a) * z.r * 1.5, 0, 0.6, 0.3, new Color(color));
        else if (z.kind === 'smoke') this.normP.emit(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r, 0.4, 0, 0, 0.5, 1.8, 1, new Color('#9e9e9e'), 0, 0.6, 0.6);
        else if (z.kind === 'chrono') this.addP.emit(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r, 0.6, 0, 0, 0.1, 1, 0.2, new Color(color), 0, 0.2);
        else this.addP.emit(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r, 0.1, 0, 0, 2, 0.6, 0.35, new Color(color), 0, 0.9);
      }
    }
    for (const [id, d] of this.zoneDecals) {
      if (!zs.has(id)) {
        this.scene.remove(d.root);
        this.zoneDecals.delete(id);
      }
    }
  }

  private handleFx(e: FxEvent): void {
    switch (e.t) {
      case 'boom': {
        if (!this.near(e.x, e.y, this.cam.zoom * 2)) return;
        const n = Math.min(60, 8 + Math.floor(e.r * 10));
        const c1 = new Color(e.color), c2 = new Color('#fff3c4'), smoke = new Color('#3e3a36');
        this.trans.flash(e.x, e.y, 0.6, e.r * 0.8, e.color, 0.16);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, s = (1 + Math.random() * 4) * Math.max(0.6, e.r);
          this.addP.emit(e.x, e.y, 0.4, Math.cos(a) * s, Math.sin(a) * s, 2 + Math.random() * 4, 0.3 + Math.random() * 0.3, 0.25 + Math.random() * 0.3, Math.random() < 0.3 ? c2 : c1, 6, 0.3);
          if (i % 2 === 0) this.normP.emit(e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * e.r, 0.5, Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3, 1 + Math.random(), 0.8 + Math.random() * 0.8, 0.5 + Math.random() * 0.5, smoke, -0.5, 0.5, 0.8);
        }
        if (e.big) this.trans.ring(e.x, e.y, e.r * 1.5, '#ffcc80', 0.5);
        break;
      }
      case 'muzzle':
        if (!this.near(e.x, e.y, this.cam.zoom * 2)) return;
        this.trans.flash(e.x, e.y, 1.1, 0.25 * e.size, '#fff59d', 0.06);
        for (let i = 0; i < 3 * e.size; i++) {
          const a = e.a + (Math.random() - 0.5) * 0.6, s = 4 + Math.random() * 6;
          this.addP.emit(e.x, e.y, 1.1, Math.cos(a) * s, Math.sin(a) * s, Math.random() * 2, 0.1 + Math.random() * 0.08, 0.2, new Color(e.color), 0, 0.1);
        }
        break;
      case 'spark':
        if (!this.near(e.x, e.y, this.cam.zoom * 2)) return;
        for (let i = 0; i < e.n; i++) {
          const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
          this.addP.emit(e.x, e.y, 0.8, Math.cos(a) * s, Math.sin(a) * s, 1 + Math.random() * 3, 0.2 + Math.random() * 0.2, 0.16, new Color(e.color), 12, 0.4);
        }
        break;
      case 'beam':
        if (e.x0 === e.x1 && Math.abs(e.y0 - e.y1) < 0.1) this.trans.pillar(e.x1, e.y1, e.color, e.w, e.life);
        else this.trans.beam(e.x0, e.y0, e.x1, e.y1, 1.1, e.color, e.w, e.life);
        break;
      case 'bolt':
        this.trans.bolt(e.pts, 1.2, e.color);
        break;
      case 'ring':
        this.trans.ring(e.x, e.y, e.r, e.color);
        break;
      case 'dust':
        this.normP.emit(e.x, e.y, 0.2, (Math.random() - 0.5), (Math.random() - 0.5), 0.8, 0.6, 0.35, new Color(e.color), 0, 0.5, 0.5);
        break;
      case 'heal':
        for (let i = 0; i < 30; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 3;
          this.addP.emit(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 0.5, 0, 0, 2 + Math.random() * 2, 0.8, 0.25, new Color('#76ff03'));
        }
        break;
      case 'shake':
        this.shake(e.amt);
        break;
      case 'strike':
        this.trans.skyBolt(e.x, e.y, e.color);
        this.trans.flash(e.x, e.y, 0.4, 1.2, e.color, 0.15);
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4;
          this.addP.emit(e.x, e.y, 0.3, Math.cos(a) * sp, Math.sin(a) * sp, 2 + Math.random() * 2, 0.3, 0.2, new Color(e.color), 8, 0.4);
        }
        break;
      case 'wave':
        for (let i = 0; i < 26; i++) {
          const a = e.a + (Math.random() - 0.5) * 2 * e.spread, sp = e.r * (1.6 + Math.random());
          this.addP.emit(e.x, e.y, 1, Math.cos(a) * sp, Math.sin(a) * sp, 0, 0.35, 0.35, new Color(e.color), 0, 0.3, 1.2);
        }
        break;
      case 'teleport':
        this.trans.pillar(e.x, e.y, '#18ffff', 3, 0.5);
        this.trans.ring(e.x, e.y, 6, '#18ffff', 0.5);
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 3;
          this.addP.emit(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, Math.random() * 2, 0, 0, 4 + Math.random() * 4, 0.6, 0.25, new Color('#18ffff'));
        }
        break;
      case 'nuke':
        this.nuke(e.x, e.y, e.r);
        break;
    }
  }

  /** Blinding flash, a fireball, shockwave rings and a rising mushroom cloud. */
  private nuke(x: number, y: number, r: number): void {
    this.trans.flash(x, y, 2, r * 0.6, '#ffffff', 0.35);
    this.trans.flash(x, y, 1, r * 0.45, '#ffea00', 0.6);
    this.trans.ring(x, y, r * 2.2, '#ffd740', 1.1);
    this.trans.ring(x, y, r * 1.4, '#ff6d00', 0.8);
    const fire = [new Color('#ffea00'), new Color('#ff9100'), new Color('#ff3d00'), new Color('#fff3c4')];
    const smoke = [new Color('#bcaaa4'), new Color('#8d6e63'), new Color('#a1887f'), new Color('#d7ccc8')];
    // Fireball dome hugging the ground.
    for (let i = 0; i < 320; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * r * 0.55, sp = 1 + Math.random() * r * 0.25;
      this.addP.emit(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 0.4 + Math.random() * 2.5, Math.cos(a) * sp, Math.sin(a) * sp, 0.5 + Math.random() * 2, 0.9 + Math.random() * 0.9, 1.2 + Math.random() * 1.4, fire[i % fire.length], 0, 0.8, 0.8);
    }
    // Stem.
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * r * 0.14;
      this.normP.emit(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 0.5 + Math.random() * 2, 0, 0, 2.5 + Math.random() * 3, 2.6 + Math.random() * 1.5, 1.4 + Math.random(), smoke[i % smoke.length], 0, 0.8, 0.6);
      if (i % 2 === 0) this.addP.emit(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1, 0, 0, 3 + Math.random() * 3, 1.2, 1, fire[i % fire.length], 0, 0.8, 0.4);
    }
    // Cap: a wide ring of smoke with fire underneath, low enough to stay on screen.
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * Math.PI * 2, sp = r * (0.15 + Math.random() * 0.3);
      this.normP.emit(x, y, 5 + Math.random() * 2, Math.cos(a) * sp, Math.sin(a) * sp, 1 + Math.random(), 3 + Math.random() * 2, 2 + Math.random() * 1.5, smoke[i % smoke.length], 0, 0.6, 1);
      if (i % 2 === 0) this.addP.emit(x, y, 4.5, Math.cos(a) * sp * 0.8, Math.sin(a) * sp * 0.8, 0.8, 1.3 + Math.random(), 1.5, fire[i % fire.length], 0, 0.65, 0.6);
    }
    // Ground shockwave debris.
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * Math.PI * 2, sp = r * (1 + Math.random());
      this.normP.emit(x, y, 0.3, Math.cos(a) * sp, Math.sin(a) * sp, 0.5, 1.2, 0.9, smoke[i % smoke.length], 0, 0.5, 1);
    }
    this.shake(2.5);
  }

}
