import * as THREE from 'three';
import type { Game } from '../../game/game';
import { MODULES } from '../../game/defs';
import type { Tank } from '../../game/tank';
import { toroidOut } from '../../game/systems/titan';
import { WEAPONS } from '../../shared/weapons';
import type { HullLight } from '../px/titan2d';
import { turretFamily } from '../px/turretArt';
import { buildShip, compact, LOOKS, type ShipRig } from './model';

/**
 * Draws the Titans as solid 3D models into the overhead view. One small WebGL renderer, off screen, renders each hull
 * in turn through an oblique lens that matches the 2.5D base (the ground straight down, everything tall leaning up the
 * screen by SHIP_LEAN of its height), with the sun's shadow falling on a transparent ground plane; the picture is then
 * copied into the 2D canvas where the hull sits. Each frame the treads roll at each side's speed and the road wheels
 * turn with them, every gun turns to its target and kicks when it fires, the toroid fans spin with their thrust, the
 * stacks flame with the engine's push, the radar sweeps, and the hull flashes when it's hit.
 */

export const SHIP_LEAN = 1;
const TOP = 32;

interface Live {
  rig: ShipRig;
  key: string;
  t: number;
  tread: [number, number];
}

let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
let scene: THREE.Scene;
let camera: THREE.Camera;
let sun: THREE.DirectionalLight;
let ground: THREE.Mesh;
const live = new Map<Tank, Live>();

function init(): boolean {
  if (renderer) return true;
  if (failed) return false;
  try {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  } catch {
    failed = true;
    renderer = null;
    return false;
  }
  scene = new THREE.Scene();
  camera = new THREE.Camera();
  scene.add(new THREE.HemisphereLight('#c8d4e4', '#4a4238', 2.1));
  sun = new THREE.DirectionalLight('#fff4e4', 3.2);
  sun.position.set(-45, 100, -40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#9ec0ff', 0.9);
  fill.position.set(40, 30, 60);
  scene.add(fill);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.5 }));
  ground.receiveShadow = true;
  ground.frustumCulled = false;
  scene.add(ground);
  return true;
}

function keyOf(t: Tank): string {
  return `${t.klass}|${t.stats.cc}|${t.dead ? 1 : 0}|${t.kind}|${t.version}|${t.stats.length}`;
}

function build(t: Tank): ShipRig {
  const L = t.stats.length, W = t.stats.width, H = t.deckY(0);
  const look = t.dead ? LOOKS.wreck : t.kind === 'rival' ? LOOKS.rival : LOOKS[t.klass] ?? LOOKS.juggernaut;
  const mounts: Parameters<typeof buildShip>[0]['mounts'] = [];
  const props: Parameters<typeof buildShip>[0]['props'] = [];
  for (const m of t.modules) {
    if (m.deck !== 0) continue;
    const d = MODULES[m.key];
    const l = t.moduleLocal(m);
    if (m.key === 'main_gun' || (d.hardpoint && m.weapon)) {
      const def = WEAPONS[m.weapon?.key ?? ''];
      mounts.push({ id: m.id, x: l.lx, z: l.lz, size: def?.size ?? 'heavy', fam: m.key === 'main_gun' ? 'cannon' : turretFamily(def?.kind ?? 'bullet'), color: def?.color ?? '#ffd740', main: m.key === 'main_gun', reach: t.muzzleReach(m) });
    } else if (!d.hardpoint) props.push({ key: m.key, x: l.lx, z: l.lz, w: d.h * t.cell, d: d.w * t.cell });
  }
  const num = t.kind === 'main' ? '07' : String(10 + (t.id % 89)).padStart(2, '0');
  const rig = buildShip({ L, W, H, klass: t.klass, look, cc: t.stats.cc, number: num, mounts, props });
  compact(rig);
  return rig;
}

/** Draws a Titan as its 3D model at (sx, sy) on the 2D canvas; the hull's lights for the glow pass, or null without WebGL. */
export function drawTitan3D(c: CanvasRenderingContext2D, t: Tank, g: Game | null, time: number, sx: number, sy: number, a: number, ppm: number): HullLight[] | null {
  if (!init() || !renderer) return null;
  let st = live.get(t);
  const key = keyOf(t);
  if (!st || st.key !== key) {
    if (st) scene.remove(st.rig.root);
    st = { rig: build(t), key, t: time, tread: [0, 0] };
    live.set(t, st);
  }
  if (live.size > 12) for (const k of live.keys()) if (k !== t && k.dead) live.delete(k);
  const rig = st.rig;
  const dt = Math.max(0, Math.min(0.1, time - st.t));
  st.t = time;
  const own = !!g && t === g.player;
  const L = t.stats.length, W = t.stats.width;
  const lights: HullLight[] = [];

  // ---- Animate.
  if (!t.dead) {
    for (let s = 0; s < 2; s++) {
      const v = Math.max(-60, Math.min(60, t.sideSpeed[s] ?? t.speed));
      st.tread[s] += v * dt;
      for (const tx of rig.treads[s]) tx.offset.x = -st.tread[s] / 8;
      for (const w of rig.wheels[s]) w.rotation.z = -st.tread[s] / 2.2;
    }
  }
  for (const m of t.modules) {
    const tr = rig.turrets.get(m.id);
    if (!tr) continue;
    tr.yaw.rotation.y = -(m.aim - t.rot);
    const kick = Math.min(0.4, m.recoil ?? 0) * (tr.heavy ? 2.4 : 1.2);
    for (const b of tr.barrels) {
      if (b.userData.x0 === undefined) b.userData.x0 = b.position.x;
      b.position.x = b.userData.x0 - kick;
    }
    if ((m.recoil ?? 0) > 0.25) {
      const l = t.moduleLocal(m), ra = m.aim - t.rot;
      lights.push({ x: l.lx + Math.cos(ra) * tr.reach, y: l.lz + Math.sin(ra) * tr.reach, r: tr.heavy ? 8 : 4.5, color: '#fff3a0', k: 0.9, z: rig.roofAt(l.lx, l.lz) + 2 });
    }
  }
  const push = Math.max(Math.abs(t.throttle) * (own ? t.spool : 1), Math.min(1, Math.abs(t.speed) / 20));
  const turn = Math.max(-1, Math.min(1, t.yawRate / 0.08));
  rig.fans.forEach((f, i) => {
    const out = own ? toroidOut(g!.titan, g!.helm.toroids, i) : t.dead ? 0 : 1;
    const k = out * (0.15 + 0.85 * push) * Math.max(0, 1 + (i % 2 === 0 ? 0.6 : -0.6) * turn);
    f.rotation.y += dt * (0.8 + 16 * k);
    const core = rig.cores[i];
    if (core) core.color.set(LOOKS[t.kind === 'rival' ? 'rival' : t.klass]?.glow ?? '#58c8ff').multiplyScalar(t.dead ? 0 : 0.25 + 0.9 * k);
  });
  const od = own && g!.helm.overdrive;
  for (const f of rig.flames) {
    f.visible = !t.dead && push > 0.04;
    const flick = 0.85 + 0.15 * Math.sin(time * 41 + f.position.z);
    f.scale.set(1, (0.4 + push * 1.6) * (od ? 1.6 : 1) * flick, 1);
  }
  if (rig.radar) rig.radar.rotation.y += dt * 1.4;
  const pulse = 0.8 + 0.2 * Math.sin(time * 2.4);
  rig.glow[0].color.set(LOOKS[t.dead ? 'wreck' : t.kind === 'rival' ? 'rival' : t.klass]?.glow ?? '#58c8ff').multiplyScalar(t.dead ? 0 : pulse);
  const flash = t.dead ? 0 : Math.min(0.55, t.hitFlash * 3);
  for (const m of rig.hullMats) m.emissive.setRGB(flash, flash * 0.9, flash * 0.8);

  // ---- Lens: the hull's whole reach, the ground straight down, heights leaning up the screen.
  let reach = Math.hypot(L / 2, W / 2);
  for (const m of t.modules) if (rig.turrets.has(m.id)) {
    const l = t.moduleLocal(m);
    reach = Math.max(reach, Math.hypot(l.lx, l.lz) + t.muzzleReach(m));
  }
  const R = reach + 6;
  const cw = Math.min(2400, Math.ceil(2 * R * ppm)), ch = Math.min(2400, Math.ceil((2 * R + SHIP_LEAN * TOP) * ppm));
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x !== cw || size.y !== ch) renderer.setSize(cw, ch, false);
  const hh = R + (SHIP_LEAN * TOP) / 2, cy = -(SHIP_LEAN * TOP) / 2, D = R * SHIP_LEAN + TOP + 30;
  const pm = new THREE.Matrix4().set(
    1 / R, 0, 0, 0,
    0, SHIP_LEAN / hh, -1 / hh, cy / hh,
    0, -1 / D, -SHIP_LEAN / D, 0,
    0, 0, 0, 1,
  );
  camera.projectionMatrix.copy(pm);
  camera.projectionMatrixInverse.copy(pm).invert();
  ground.scale.set(R * 2.4, 1, R * 2.4);
  ground.position.y = 0.05;
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = sc.bottom = -R * 1.3;
  sc.right = sc.top = R * 1.3;
  sc.near = 1;
  sc.far = 400;
  sc.updateProjectionMatrix();
  rig.root.rotation.y = -a;
  if (rig.root.parent !== scene) {
    for (const o of live.values()) if (o.rig.root.parent === scene) scene.remove(o.rig.root);
    scene.add(rig.root);
  }
  renderer.render(scene, camera);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(renderer.domElement, 0, 0, cw, ch, Math.round(sx - R * ppm), Math.round(sy - (R + SHIP_LEAN * TOP) * ppm), cw, ch);
  c.restore();
  scene.remove(rig.root);

  // ---- Lights for the glow pass (lifted with the hull: a point z up shows LEAN*z further up the screen).
  if (t.dead) return [];
  const hl = L / 2;
  lights.push({ x: hl + 12, y: -0.12 * W, r: 13, color: '#fff3c4', k: 0.12 }, { x: hl + 12, y: 0.12 * W, r: 13, color: '#fff3c4', k: 0.12 });
  lights.push({ x: -hl - 1.5, y: 0, r: 7, color: LOOKS[t.klass]?.rear ?? '#ff9a2a', k: 0.25, z: 6 });
  for (const sd of [-1, 1]) lights.push({ x: -0.15 * L, y: sd * 0.17 * W, r: 9, color: LOOKS[t.kind === 'rival' ? 'rival' : t.klass]?.glow ?? '#58c8ff', k: 0.12 * pulse, z: 15 });
  if (own && g) {
    g.titan.crawlers.forEach((hp, i) => {
      if (hp > 0.1) return;
      lights.push({ x: (i % 4 < 2 ? 0.3 : -0.2) * L, y: (i < 4 ? -1 : 1) * 0.4 * W, r: 9, color: '#ff5a1a', k: 0.4 + 0.15 * Math.sin(time * 9 + i), z: 4 });
    });
  }
  const sa = Math.sin(t.rot), ca = Math.cos(t.rot);
  for (const l of lights) {
    const d = SHIP_LEAN * (l.z ?? 0);
    l.x -= d * sa;
    l.y -= d * ca;
  }
  return lights;
}

/** How high the hull's roof stands at a local point (for things standing on it), or 0 when there's no 3D hull. */
export function shipRoofAt(t: Tank, lx: number, lz: number): number {
  const st = live.get(t);
  return st ? st.rig.roofAt(lx, lz) : t.deckY(0);
}
