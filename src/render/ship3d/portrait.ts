import * as THREE from 'three';
import { FRAMES, type FrameKey } from '../../game/frames';
import type { Tank } from '../../game/tank';
import { buildHull, shipLights, shipOpts } from './index';
import { compact } from './model';

/**
 * A still of a hull for the shipyard: your own ship's deck plan, guns and class, built as the chosen frame and lit
 * three-quarters from the bow on a transparent backdrop. Each picture is drawn once and kept.
 */
let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
const cache = new Map<string, string>();

export function shipPortrait(t: Tank, frame: FrameKey, w = 420, h = 220): string | null {
  const key = `${frame}|${t.klass}|${t.stats.cc}|${t.version}|${w}x${h}`;
  const have = cache.get(key);
  if (have) return have;
  if (failed) return null;
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.shadowMap.enabled = true;
    }
  } catch {
    failed = true;
    return null;
  }
  // The same deck plan scaled to the frame's deck cells.
  const o = shipOpts(t);
  const r = FRAMES[frame].cell / t.cell;
  o.L *= r;
  o.W *= r;
  o.H *= r;
  o.frame = frame;
  o.mounts = o.mounts.map((m) => ({ ...m, x: m.x * r, z: m.z * r, reach: m.reach * r }));
  o.props = o.props.map((p) => ({ ...p, x: p.x * r, z: p.z * r, w: p.w * r, d: p.d * r }));
  const rig = buildHull(o);
  compact(rig);
  for (const tr of rig.turrets.values()) tr.yaw.rotation.y = 0;
  for (const f of rig.flames) f.visible = false;
  const scene = new THREE.Scene();
  shipLights(scene);
  const sun = new THREE.DirectionalLight('#fff1dc', 2.3);
  sun.position.set(-45, 100, -40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -o.L * 0.9;
  sc.right = sc.top = o.L * 0.9;
  sc.far = 500;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(o.L * 4, o.L * 4).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.45 }));
  ground.receiveShadow = true;
  scene.add(ground, rig.root);
  // The lens backs off with the hull's length, so the three hulls show their real size against each other.
  const k = 144 / 100;
  const cam = new THREE.PerspectiveCamera(24, w / h, 1, 3000);
  cam.position.set(150 * k, 95 * k, 140 * k);
  cam.lookAt(0, 10, 0);
  renderer.setSize(w, h, false);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  rig.root.traverse((ob) => {
    if (ob instanceof THREE.Mesh || ob instanceof THREE.LineSegments) ob.geometry.dispose();
  });
  cache.set(key, url);
  return url;
}
