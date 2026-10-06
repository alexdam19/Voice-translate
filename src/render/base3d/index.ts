import * as THREE from 'three';
import type { Game } from '../../game/game';
import { HANGAR } from '../../shared/mapgen';
import { COMPOUND } from '../../shared/compound';
import { SHIP_LEAN, shipLights } from '../ship3d';
import { buildBase, type BaseRig } from './model';

/**
 * Draws the Mega Hangar's compound as its 3D model, filling the screen through the same oblique lens as the ships
 * (the ground straight down, every height leaning up the screen by SHIP_LEAN), with the sun's shadows falling on
 * the painted ground under it. Each frame: the gate's doors slide, the turrets swing to what they're shooting, the
 * radar dishes and the crane turn, the gantry cranes run over the bays, the beacons blink, and the Hangar's roof
 * lifts away while your ship is inside.
 */

let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
let scene: THREE.Scene;
let camera: THREE.Camera;
let sun: THREE.DirectionalLight;
let ground: THREE.Mesh;
let rig: BaseRig | null = null;
let roofK = 1;
let lastT = 0;

function init(): boolean {
  if (renderer) return true;
  if (failed) return false;
  try {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  } catch {
    failed = true;
    renderer = null;
    return false;
  }
  scene = new THREE.Scene();
  camera = new THREE.Camera();
  shipLights(scene);
  sun = new THREE.DirectionalLight('#fff1dc', 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.42 }));
  ground.receiveShadow = true;
  ground.frustumCulled = false;
  scene.add(ground);
  return true;
}

/** Is the compound drawn in 3D (so the 2D painters leave its buildings and shadows alone)? */
export function base3DActive(): boolean {
  return !!renderer && !failed;
}

export interface BaseView {
  /** Pixels per metre, and where the Hangar's centre is on the screen (at ground level). */
  ppm: number;
  ox: number;
  oy: number;
  time: number;
}

/**
 * Draws the compound (its Hangar's centre at (hx, hy) in the world) over the whole screen. False without WebGL (the
 * caller paints the old 2.5D base).
 */
export function drawBase3DGL(c: CanvasRenderingContext2D, g: Game, v: BaseView, hx: number, hy: number): boolean {
  if (!init() || !renderer) return false;
  if (!rig) {
    rig = buildBase();
    scene.add(rig.root);
  }
  const W = Math.max(2, c.canvas.width), Hh = Math.max(2, c.canvas.height);
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x !== W || size.y !== Hh) renderer.setSize(W, Hh, false);
  const dt = Math.max(0, Math.min(0.1, v.time - lastT));
  lastT = v.time;
  animate(g, dt, v.time, hx, hy);
  // The compound sits where it is relative to the middle of the screen.
  rig.root.position.set((v.ox - W / 2) / v.ppm, 0, (v.oy - Hh / 2) / v.ppm);
  const Rx = W / 2 / v.ppm, Ry = Hh / 2 / v.ppm;
  const D = (Ry + 400) * 2 + 400;
  const pm = new THREE.Matrix4().set(
    1 / Rx, 0, 0, 0,
    0, SHIP_LEAN / Ry, -1 / Ry, 0,
    0, -1 / D, -SHIP_LEAN / D, 0,
    0, 0, 0, 1,
  );
  camera.projectionMatrix.copy(pm);
  camera.projectionMatrixInverse.copy(pm).invert();
  // The sun's shadow follows the view.
  const S = Math.max(Rx, Ry) + 160;
  sun.position.set(-S * 0.45, S, -S * 0.4);
  sun.target.position.set(0, 0, 0);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = sc.bottom = -S * 1.25;
  sc.right = sc.top = S * 1.25;
  sc.near = 1;
  sc.far = S * 4;
  sc.updateProjectionMatrix();
  ground.scale.set(S * 3, 1, S * 3);
  ground.position.y = 0.02;
  renderer.render(scene, camera);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(renderer.domElement, 0, 0);
  c.restore();
  return true;
}

function animate(g: Game, dt: number, time: number, hx: number, hy: number): void {
  const r = rig!;
  const cs = g.compound;
  // The gate's doors slide out into the wall.
  for (const d of r.doors) d.obj.position.x = d.x0 + d.dir * COMPOUND.gateHalf * cs.gate.open;
  // Turrets swing toward what they shoot (a world angle; a turn about Y the other way round).
  for (const t of r.turrets) {
    const st = t.kind === 'tower' ? cs.towers[t.i] : t.kind === 'front' ? cs.front[t.i] : null;
    if (st) t.yaw.rotation.y = -st.aim;
    else t.yaw.rotation.y += Math.sin(time * 0.3 + t.i) * dt * 0.25;
  }
  for (const d of r.dishes) d.rotation.y += dt * 0.8;
  for (const j of r.jibs) j.rotation.y = Math.sin(time * 0.05) * 1.6;
  for (const gt of r.gantries) {
    gt.bridge.position.z = Math.max(-HANGAR.d / 2 + 30, Math.min(HANGAR.d / 2 - 40, 140 * Math.sin(time * 0.04 + gt.i * 2.1)));
    gt.trolley.position.x = 62 * Math.sin(time * 0.07 + gt.i * 1.3);
  }
  // Beacons blink, the light lines breathe.
  r.beacons.color.set('#ff2a1a').multiplyScalar(Math.sin(time * 3.2) > 0.2 ? 1 : 0.25);
  r.glow.color.set('#3fd8ff').multiplyScalar(0.8 + 0.2 * Math.sin(time * 1.7));
  // The Hangar's roof lifts away while your ship is under it.
  const p = g.player;
  const inside = Math.abs(p.x - hx) < HANGAR.w / 2 + 6 && Math.abs(p.y - hy) < HANGAR.d / 2 + 30;
  roofK += ((inside ? 0 : 1) - roofK) * Math.min(1, dt * 3);
  r.roof.visible = roofK > 0.02;
  for (const m of r.roofMats) {
    m.opacity = roofK;
    m.depthWrite = roofK > 0.98;
  }
}
