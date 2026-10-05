import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HullClass } from '../../game/classes';

/**
 * The Titan Crawler as a solid model: a low armoured hull on four crawler units (a short one under each cheek of the
 * bow, a long one down each side aft), the bow a carapace of angular plates with light bleeding from the seams over a
 * slatted grille, armoured bays down both flanks, a raised central deck with the command tower, vents, hatches and
 * aerials, and the stern plate with its four amber lamps. Everything in metres: X forward, Y up, Z to starboard.
 *
 * Each class wears it differently: the Juggernaut in gunmetal and blue; the Bastion in slab armour, olive drab and
 * amber with a heavier tower; the Ark in pale grey with glasshouse domes on the stern deck; the Nightrunner black and
 * violet, low and finned; the Dredge in rust with a dozer blade across the bow and a crane. Each Command Center refit
 * (Mk I-VI) bolts on more: missile racks, track skirts, a radar mast, a stern gun deck, a ram.
 */

export interface ShipLook {
  hull: string;
  plate: string;
  dark: string;
  glow: string;
  rear: string;
  trim: string;
}

export const LOOKS: Record<HullClass | 'rival' | 'wreck', ShipLook> = {
  juggernaut: { hull: '#4c5562', plate: '#5d6875', dark: '#22262d', glow: '#58c8ff', rear: '#ff9a2a', trim: '#7f8b9a' },
  bastion: { hull: '#5a5e4a', plate: '#6c7258', dark: '#25271f', glow: '#ffcc40', rear: '#ff9a2a', trim: '#8a9070' },
  ark: { hull: '#8a929c', plate: '#a2aab4', dark: '#33373e', glow: '#76ff6a', rear: '#ffb040', trim: '#b8c0ca' },
  nightrunner: { hull: '#30333d', plate: '#3c404c', dark: '#15161b', glow: '#b48cff', rear: '#ff4a8a', trim: '#5a5e70' },
  dredge: { hull: '#6a5442', plate: '#7e6650', dark: '#2a2018', glow: '#ffab40', rear: '#ff7a2a', trim: '#a08060' },
  rival: { hull: '#4a3a3e', plate: '#5c464c', dark: '#1c1416', glow: '#ff3b30', rear: '#ff3b30', trim: '#7a5c62' },
  wreck: { hull: '#3a3632', plate: '#44403a', dark: '#1a1816', glow: '#000000', rear: '#000000', trim: '#504a44' },
};

export interface TurretRig {
  /** The module it belongs to (by id), its local position on the hull. */
  id: number;
  yaw: THREE.Object3D;
  barrels: THREE.Object3D[];
  reach: number;
  heavy: boolean;
}

export interface ShipRig {
  root: THREE.Group;
  /** Tread belts (their textures scroll) and road wheels (they turn), per side (0 port, 1 starboard). */
  treads: THREE.Texture[][];
  wheels: THREE.Object3D[][];
  turrets: Map<number, TurretRig>;
  /** Fans in the four toroid housings (FL, FR, RL, RR) and their glowing cores. */
  fans: THREE.Object3D[];
  cores: THREE.MeshBasicMaterial[];
  /** Exhaust flames at the stacks, scaled with the engine's push. */
  flames: THREE.Object3D[];
  radar: THREE.Object3D | null;
  /** Light materials that pulse; the hull material (for the hit flash). */
  glow: THREE.MeshBasicMaterial[];
  hullMats: THREE.MeshStandardMaterial[];
  roofAt: (x: number, z: number) => number;
  key: string;
}

// ------------------------------------------------------------------------------------------------ textures

const texCache = new Map<string, THREE.Texture>();

/** Armour plating: panels a shade apart, dark seams, rivet rows, a few weld scars and grime. */
function plateTexture(base: string): THREE.Texture {
  const key = `plate|${base}`;
  const have = texCache.get(key);
  if (have) return have;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d')!;
  c.fillStyle = base;
  c.fillRect(0, 0, S, S);
  const col = new THREE.Color(base);
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // Panels.
  for (let y = 0; y < S; y += 64) {
    const off = (y / 64) % 2 ? 32 : 0;
    for (let x = -off; x < S; x += 96) {
      const k = (rnd() - 0.5) * 0.08;
      const cc = col.clone().offsetHSL(0, 0, k * 0.5);
      c.fillStyle = `#${cc.getHexString()}`;
      c.fillRect(x + 2, y + 2, 92, 60);
      c.fillStyle = 'rgba(255,255,255,0.06)';
      c.fillRect(x + 2, y + 2, 92, 2);
      c.fillStyle = 'rgba(0,0,0,0.14)';
      c.fillRect(x + 2, y + 60, 92, 2);
      // Rivets along the panel's edges.
      c.fillStyle = 'rgba(0,0,0,0.35)';
      for (let k2 = 8; k2 < 90; k2 += 10) {
        c.fillRect(x + k2, y + 5, 2, 2);
        c.fillRect(x + k2, y + 56, 2, 2);
      }
    }
  }
  // Seams.
  c.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < S; y += 64) c.fillRect(0, y, S, 1);
  // Grime and scuffs.
  for (let k = 0; k < 60; k++) {
    c.fillStyle = rnd() < 0.7 ? `rgba(0,0,0,${0.05 + rnd() * 0.08})` : `rgba(255,255,255,${0.03 + rnd() * 0.04})`;
    c.fillRect(rnd() * S, rnd() * S, 4 + rnd() * 30, 1 + rnd() * 3);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Track links: steel shoes with grousers, a dark gap between each. One link is 1/8 of the texture. */
function treadTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#0c0d0f';
  c.fillRect(0, 0, 128, 64);
  for (let k = 0; k < 8; k++) {
    const x = k * 16;
    c.fillStyle = '#34373c';
    c.fillRect(x + 1, 2, 13, 60);
    c.fillStyle = '#4a4e55';
    c.fillRect(x + 1, 2, 13, 3);
    c.fillStyle = '#23252a';
    c.fillRect(x + 6, 6, 3, 52);
    c.fillStyle = '#575c64';
    c.fillRect(x + 2, 28, 11, 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The hull number, stencilled: white figures on a dark plate. */
function numberTexture(text: string, color: string): THREE.Texture {
  const key = `num|${text}|${color}`;
  const have = texCache.get(key);
  if (have) return have;
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, 128, 64);
  c.fillStyle = color;
  c.font = 'bold 44px "Silkscreen", "Courier New", monospace';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, 64, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** A grille: vertical slats in a dark frame. */
function grilleTexture(): THREE.Texture {
  const key = 'grille';
  const have = texCache.get(key);
  if (have) return have;
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#08090b';
  c.fillRect(0, 0, 128, 64);
  for (let x = 4; x < 124; x += 8) {
    c.fillStyle = '#2c3138';
    c.fillRect(x, 4, 4, 56);
    c.fillStyle = '#454c56';
    c.fillRect(x, 4, 1, 56);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

// ------------------------------------------------------------------------------------------------ geometry

/** Planar UVs from world positions (by each face's facing), so plating tiles at its real size. */
function planarUV(g: THREE.BufferGeometry, size = 10): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.computeVertexNormals();
  const p = geo.attributes.position as THREE.BufferAttribute, n = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (ax >= az) {
      u = p.getZ(i);
      v = p.getY(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    uv[i * 2] = u / size;
    uv[i * 2 + 1] = v / size;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return planarUV(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
}

/** A chamfered block: a box with its top edges cut back by `ch`. */
function chamfer(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, ch: number, chx = ch): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (const x of [x0, x1]) for (const z of [z0, z1]) pts.push(new THREE.Vector3(x, y0, z));
  for (const x of [x0 + chx, x1 - chx]) for (const z of [z0 + ch, z1 - ch]) pts.push(new THREE.Vector3(x, y1, z));
  for (const x of [x0, x1]) for (const z of [z0, z1]) pts.push(new THREE.Vector3(x, y1 - ch, z));
  return planarUV(new ConvexGeometry(pts));
}

function hull(points: [number, number, number][]): THREE.BufferGeometry {
  return planarUV(new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z))));
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = true;
  o.frustumCulled = false;
  return o;
}

// ------------------------------------------------------------------------------------------------ the model

export interface BuildOpts {
  L: number;
  W: number;
  /** Roof height (m). */
  H: number;
  klass: HullClass;
  look: ShipLook;
  /** Command Center level (1-6). */
  cc: number;
  number: string;
  /** Turret mounts: module id, local x/z, size, family, glow colour; the main battery flagged. */
  mounts: { id: number; x: number; z: number; size: 'light' | 'medium' | 'heavy'; fam: string; color: string; main: boolean; reach: number }[];
  /** Roof props from the deck plan: radar, helipad, coil, dish... with their footprints. */
  props: { key: string; x: number; z: number; w: number; d: number }[];
}

export function buildShip(o: BuildOpts): ShipRig {
  const { L, W, H, klass, look } = o;
  const hw = W / 2;
  const root = new THREE.Group();
  const plate = plateTexture(look.hull);
  const hullM = new THREE.MeshStandardMaterial({ color: '#ffffff', map: plate, metalness: 0.3, roughness: 0.7, flatShading: true });
  const plateM = new THREE.MeshStandardMaterial({ color: look.plate, map: plateTexture('#c8ccd2'), metalness: 0.3, roughness: 0.62, flatShading: true });
  const darkM = new THREE.MeshStandardMaterial({ color: look.dark, metalness: 0.3, roughness: 0.75, flatShading: true });
  const trimM = new THREE.MeshStandardMaterial({ color: look.trim, metalness: 0.4, roughness: 0.5, flatShading: true });
  const glowM = new THREE.MeshBasicMaterial({ color: look.glow, toneMapped: false });
  const glowDim = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.glow).multiplyScalar(0.55), toneMapped: false });
  const redM = new THREE.MeshBasicMaterial({ color: '#ff3020', toneMapped: false });
  const rearM = new THREE.MeshBasicMaterial({ color: look.rear, toneMapped: false });
  const whiteM = new THREE.MeshBasicMaterial({ color: '#fff6dc', toneMapped: false });
  const glassM = new THREE.MeshStandardMaterial({ color: '#0e1a22', emissive: new THREE.Color(look.glow).multiplyScalar(0.25), metalness: 0.9, roughness: 0.15 });
  const grilleM = new THREE.MeshStandardMaterial({ map: grilleTexture(), metalness: 0.5, roughness: 0.6 });
  const rig: ShipRig = {
    root, treads: [[], []], wheels: [[], []], turrets: new Map(), fans: [], cores: [], flames: [], radar: null,
    glow: [glowM, glowDim, rearM], hullMats: [hullM, plateM, trimM], roofAt: () => H, key: '',
  };
  const add = (g: THREE.BufferGeometry, m: THREE.Material, cast = true): THREE.Mesh => {
    const me = mesh(g, m, cast);
    root.add(me);
    return me;
  };
  const glowBar = (x0: number, x1: number, y: number, z: number, t = 0.35, m: THREE.Material = glowM): void => {
    add(new THREE.BoxGeometry(Math.abs(x1 - x0), t, t).translate((x0 + x1) / 2, y, z), m, false);
  };
  const low = klass === 'nightrunner' ? 0.86 : 1;
  const Hh = H * low;

  // ---- Running gear: a short crawler unit under each bow cheek, a long one down each side aft.
  const trackW = W * 0.19, trackH = Hh * 0.36;
  const units: [number, number][] = [[0.14 * L, 0.44 * L], [-0.49 * L, 0.08 * L]];
  const treadTex = treadTexture();
  for (let s = 0; s < 2; s++) {
    const sd = s === 0 ? -1 : 1;
    const zc = sd * (hw - trackW / 2);
    for (const [x0, x1] of units) {
      const len = x1 - x0, mid = (x0 + x1) / 2;
      // The frame: a rounded loop in profile.
      const shape = new THREE.Shape();
      const r = trackH * 0.42;
      shape.moveTo(x0 + r, 0.4);
      shape.lineTo(x1 - r, 0.4);
      shape.quadraticCurveTo(x1 + r * 0.6, 0.4, x1, trackH * 0.62);
      shape.quadraticCurveTo(x1 - r * 0.2, trackH, x1 - r, trackH);
      shape.lineTo(x0 + r, trackH);
      shape.quadraticCurveTo(x0 - r * 0.4, trackH, x0 - r * 0.3, trackH * 0.55);
      shape.quadraticCurveTo(x0 - r * 0.1, 0.4, x0 + r, 0.4);
      const fg = new THREE.ExtrudeGeometry(shape, { depth: trackW, bevelEnabled: false, curveSegments: 6 });
      fg.translate(0, 0, zc - trackW / 2);
      add(planarUV(fg), darkM);
      // The tread belt over the top (scrolling) and down the outside.
      const tt = treadTex.clone();
      tt.needsUpdate = true;
      tt.repeat.set(len / 2.6, 1);
      rig.treads[s].push(tt);
      const tm = new THREE.MeshStandardMaterial({ map: tt, metalness: 0.7, roughness: 0.5 });
      const top = new THREE.Mesh(new THREE.PlaneGeometry(len - r * 1.2, trackW * 0.96).rotateX(-Math.PI / 2).translate(mid, trackH + 0.06, zc), tm);
      top.receiveShadow = true;
      top.frustumCulled = false;
      root.add(top);
      // Road wheels on the outside face, under the skirt, and the drive sprockets at each end.
      const n = Math.max(3, Math.round(len / 5.5));
      for (let k = 0; k < n; k++) {
        const wx = x0 + r * 0.8 + ((len - r * 1.6) * (k + 0.5)) / n;
        const w = new THREE.Group();
        w.position.set(wx, trackH * 0.36, zc + sd * (trackW / 2 + 0.05));
        const disc = mesh(new THREE.CylinderGeometry(trackH * 0.27, trackH * 0.27, 0.6, 12).rotateX(Math.PI / 2), trimM);
        const hub = mesh(new THREE.CylinderGeometry(trackH * 0.1, trackH * 0.1, 0.8, 6).rotateX(Math.PI / 2), darkM);
        const spoke = mesh(new THREE.BoxGeometry(trackH * 0.5, 0.25, 0.7), darkM);
        w.add(disc, hub, spoke);
        root.add(w);
        rig.wheels[s].push(w);
      }
      for (const ex of [x0 + r * 0.25, x1 - r * 0.15]) {
        const sp = new THREE.Group();
        sp.position.set(ex, trackH * 0.55, zc + sd * (trackW / 2 + 0.05));
        sp.add(mesh(new THREE.CylinderGeometry(trackH * 0.34, trackH * 0.34, 0.7, 10).rotateX(Math.PI / 2), darkM));
        sp.add(mesh(new THREE.BoxGeometry(trackH * 0.62, 0.35, 0.8), trimM));
        root.add(sp);
        rig.wheels[s].push(sp);
      }
      // An armoured skirt along the upper half of the outside, gaps showing the wheels below it.
      add(box(len * 0.86, trackH * 0.26, 0.6, mid, trackH * 0.78, zc + sd * (trackW / 2 + 0.45)), plateM);
      if (o.cc >= 3) add(box(len * 0.9, trackH * 0.22, 0.8, mid, trackH * 0.48, zc + sd * (trackW / 2 + 0.85)), hullM);
      glowBar(x0 + len * 0.1, x1 - len * 0.1, trackH * 0.92, zc + sd * (trackW / 2 + 0.8), 0.25, glowDim);
    }
  }

  // ---- The chassis between the tracks.
  const cz = hw - trackW;
  add(chamfer(-0.48 * L, 0.36 * L, 0.6, Hh * 0.46, -cz, cz, 1.2), hullM);

  // ---- The bow: a carapace of angular plates fanned out from a central spine, light bleeding from every seam, over a
  // slatted grille with a light bar.
  const bx0 = 0.08 * L, nose = 0.5 * L;
  const ridgeY = Hh * 0.64, noseY = Hh * 0.4;
  const blunt = klass === 'bastion' || klass === 'dredge';
  const tipW = blunt ? 0.22 * W : 0.13 * W;
  // The spine: a raised keel running to the nose, chevrons cut into it.
  add(hull([[bx0, Hh * 0.42, -0.07 * W], [bx0, Hh * 0.42, 0.07 * W], [bx0, ridgeY, -0.05 * W], [bx0, ridgeY, 0.05 * W], [nose - 0.5, noseY, -tipW * 0.36], [nose - 0.5, noseY, tipW * 0.36], [nose, Hh * 0.22, -tipW * 0.4], [nose, Hh * 0.22, tipW * 0.4]]), plateM);
  for (let k = 0; k < 4; k++) {
    const x = bx0 + 5 + k * 7, y = ridgeY + (noseY - ridgeY) * ((x - bx0) / (nose - bx0)) + 0.15;
    add(hull([[x, y, -0.045 * W], [x, y, 0.045 * W], [x + 2.4, y - 0.2, 0], [x + 0.6, y + 0.35, 0]]), glowDim, false);
  }
  // Plates fanned out down each side: each a slab from the spine out to the edge, lower and swept further back as
  // they go out; a gap between each where the light shows.
  const fan = 4;
  for (const sd of [-1, 1]) {
    const z = (v: number): number => sd * v;
    for (let k = 0; k < fan; k++) {
      const z0 = 0.075 * W + k * ((hw - 0.075 * W) / fan) + 0.25, z1 = 0.075 * W + (k + 1) * ((hw - 0.075 * W) / fan) - 0.25;
      const fz0 = z0 / hw, fz1 = z1 / hw;
      // Each plate runs from the waist (bx0) to a front edge that sweeps back toward the flanks.
      const front = (f: number): number => nose - 1 - (f * f) * (nose - 0.36 * L);
      const top = (f: number, x: number): number => {
        const along = Math.min(1, (x - bx0) / (nose - bx0));
        const ridge = ridgeY + (noseY - ridgeY) * along;
        return ridge - f * (ridge - Hh * (0.34 + 0.06 * along));
      };
      const xa = bx0 - k * 1.2, xb0 = front(fz0), xb1 = front(fz1);
      const tz0 = Math.min(z0, tipW * 0.5 + (z0 - tipW * 0.5) * 0.4), tz1 = Math.min(z1, tipW * 0.5 + (z1 - tipW * 0.5) * 0.4);
      add(hull([
        [xa, top(fz0, xa) - 0.1, z(z0)], [xa, top(fz1, xa) - 0.1, z(z1)], [xa, Hh * 0.34, z(z0)], [xa, Hh * 0.34, z(z1)],
        [xb0, top(fz0, xb0) - 0.1, z(tz0 + (z0 - tz0) * (1 - (xb0 - 0.36 * L) / (nose - 0.36 * L)))], [xb1, top(fz1, xb1) - 0.1, z(tz1 + (z1 - tz1) * (1 - (xb1 - 0.36 * L) / (nose - 0.36 * L)))],
        [xb0, Hh * 0.18, z(z0 * 0.8)], [xb1, Hh * 0.18, z(z1 * 0.85)],
      ]), k % 2 ? hullM : plateM);
      // The seam's glow along the plate's inner edge.
      if (k < fan - 1) {
        const ex = Math.min(xb1, xb0) - 2;
        const seam = new THREE.Mesh(new THREE.BoxGeometry(ex - xa - 2, 0.22, 0.22), k === 0 ? glowM : glowDim);
        const ya = (top(fz1, xa) + top(fz1, ex)) / 2;
        seam.position.set((xa + ex) / 2 + 1, ya + 0.05, z(z1 + 0.25));
        seam.rotation.z = Math.atan2(top(fz1, ex) - top(fz1, xa), ex - xa);
        seam.frustumCulled = false;
        root.add(seam);
      }
    }
    // Headlights low on the nose, marker lamps on the cheeks.
    add(box(0.4, 0.9, 1.4, nose + 0.1, Hh * 0.24, z(tipW * 0.3)), whiteM, false);
    add(box(0.3, 0.5, 0.6, 0.4 * L, Hh * 0.2, z(0.3 * W)), whiteM, false);
    add(box(0.5, 0.5, 0.5, bx0 + 3, Hh * 0.6, z(hw - 1.4)), redM, false);
  }
  // The grille face and its light bar.
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(tipW * 0.95, Hh * 0.2).rotateY(Math.PI / 2).translate(nose + 0.12, Hh * 0.29, 0), grilleM);
  gm.frustumCulled = false;
  root.add(gm);
  add(box(0.3, 0.35, tipW * 0.9, nose + 0.15, Hh * 0.41, 0), glowM, false);
  if (klass === 'dredge' || o.cc >= 6) {
    // A dozer blade (the Dredge) or a ram (Mk VI) across the nose.
    add(hull([[nose + 1, 0.3, -hw * 0.95], [nose + 1, 0.3, hw * 0.95], [nose + 4, 0.3, -hw * 0.9], [nose + 4, 0.3, hw * 0.9], [nose + 1.5, Hh * 0.34, -hw * 0.95], [nose + 1.5, Hh * 0.34, hw * 0.95], [nose + 2.6, Hh * 0.36, -hw * 0.9], [nose + 2.6, Hh * 0.36, hw * 0.9]]), klass === 'dredge' ? trimM : plateM);
    for (let k = -4; k <= 4; k++) add(hull([[nose + 3.5, 0.4, k * hw * 0.2 - 0.8], [nose + 3.5, 0.4, k * hw * 0.2 + 0.8], [nose + 6.5, 0.5, k * hw * 0.2], [nose + 3.5, 2.4, k * hw * 0.2]]), darkM);
  }

  // ---- Armoured bays down each flank, in segments, a light strip along each.
  const bayZ0 = cz - W * 0.15, bayTop = Hh * 0.66;
  const segs = 5;
  for (const sd of [-1, 1]) {
    for (let k = 0; k < segs; k++) {
      const x0 = -0.47 * L + (k * 0.58 * L) / segs, x1 = x0 + (0.58 * L) / segs - 0.6;
      const top = bayTop - (k === 0 ? 1.4 : 0) + (k % 2 ? 0.6 : 0);
      add(chamfer(x0, x1, Hh * 0.4, top, sd < 0 ? -cz - 0.4 : bayZ0, sd < 0 ? -bayZ0 : cz + 0.4, 0.8, 0.5), k % 2 ? hullM : plateM);
      glowBar(x0 + 1, x1 - 1, top - 1.4, sd * (cz + 0.45), 0.25, glowDim);
    }
    // The hull number on the flank.
    const num = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: numberTexture(o.number, '#e8eef4'), transparent: true, toneMapped: false }));
    num.position.set(-0.12 * L, bayTop - 3, sd * (cz + 0.45));
    num.rotation.y = sd > 0 ? 0 : Math.PI;
    num.frustumCulled = false;
    root.add(num);
    // Missile racks on the flanks from Mk II.
    if (o.cc >= 2) {
      const rx = -0.08 * L;
      add(box(7, 2.2, 3.2, rx, bayTop + 1.1, sd * (bayZ0 + W * 0.075)), darkM);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) add(box(0.3, 0.6, 0.6, rx + 3.6, bayTop + 0.6 + j * 1, sd * (bayZ0 + W * 0.075) - 1.1 + i * 0.75), redM, false);
    }
  }

  // ---- The central deck, raised, with its edge lights.
  const deckZ = W * 0.16, deckTop = Hh * 0.82;
  add(chamfer(-0.46 * L, 0.12 * L, Hh * 0.44, deckTop, -deckZ, deckZ, 1.4, 2), hullM);
  for (const sd of [-1, 1]) glowBar(-0.44 * L, 0.1 * L, deckTop - 1.2, sd * (deckZ + 0.02), 0.28, glowM);

  // ---- Detail on the decks: hatches, vents, lockers and pipe runs (clear of the guns and the tower).
  let gs = 11 + (klass === 'bastion' ? 3 : klass === 'ark' ? 5 : 0);
  const rnd = (): number => {
    gs = (gs * 16807) % 2147483647;
    return gs / 2147483647;
  };
  const clear = (x: number, z: number, r: number): boolean => o.mounts.every((m) => Math.hypot(m.x - x, m.z - z) > r + (m.main ? 7 : 4.5)) && !(Math.abs(x + 0.16 * L) < 0.1 * L && Math.abs(z) < 0.13 * W);
  for (let k = 0, made = 0; k < 90 && made < 30; k++) {
    const onDeck = rnd() < 0.5;
    const x = -0.45 * L + rnd() * 0.55 * L;
    const z = onDeck ? (rnd() * 2 - 1) * deckZ * 0.8 : (rnd() < 0.5 ? -1 : 1) * (deckZ + 1.2 + rnd() * (cz - deckZ - 2.4));
    if (!clear(x, z, 2)) continue;
    const y = onDeck ? deckTop : bayTop;
    const kind = rnd();
    if (kind < 0.3) {
      add(box(3, 0.3, 3, x, y + 0.15, z), darkM);
      add(box(2.2, 0.36, 2.2, x, y + 0.2, z), trimM);
    } else if (kind < 0.55) {
      add(box(2, 0.9, 4, x, y + 0.45, z), darkM);
      add(box(1.6, 0.1, 3.6, x, y + 0.92, z), plateM);
    } else if (kind < 0.8) {
      add(chamfer(x - 1.2, x + 1.2, y, y + 1.6, z - 0.9, z + 0.9, 0.25), plateM);
    } else {
      add(new THREE.CylinderGeometry(0.3, 0.3, 8, 6).rotateZ(Math.PI / 2).translate(x, y + 0.35, z), trimM);
    }
    made++;
  }

  // ---- The command tower: a faceted block with a band of glass, an aerial and a searchlight.
  const tx = -0.16 * L, tw = klass === 'bastion' ? 0.13 * W : 0.11 * W, tl = 0.085 * L;
  const towerTop = Hh * (klass === 'bastion' ? 1.2 : 1.12);
  add(hull([[tx - tl, deckTop, -tw], [tx - tl, deckTop, tw], [tx + tl, deckTop, -tw * 0.9], [tx + tl, deckTop, tw * 0.9],
    [tx - tl * 0.8, towerTop, -tw * 0.8], [tx - tl * 0.8, towerTop, tw * 0.8], [tx + tl * 0.5, towerTop, -tw * 0.7], [tx + tl * 0.5, towerTop, tw * 0.7], [tx + tl * 1.05, deckTop + (towerTop - deckTop) * 0.5, 0]]), plateM);
  // The glazing round its front.
  add(hull([[tx + tl * 0.62, towerTop - 2.2, -tw * 0.72], [tx + tl * 0.62, towerTop - 2.2, tw * 0.72], [tx + tl * 0.92, towerTop - 3.6, -tw * 0.5], [tx + tl * 0.92, towerTop - 3.6, tw * 0.5], [tx + tl * 0.7, towerTop - 1, -tw * 0.7], [tx + tl * 0.7, towerTop - 1, tw * 0.7]]), glassM, false);
  add(box(1.2, 4.5, 0.4, tx - tl * 0.3, towerTop + 2.2, tw * 0.4), trimM);
  add(new THREE.CylinderGeometry(0.12, 0.18, 9, 5).translate(tx - tl * 0.6, towerTop + 4.5, -tw * 0.5), trimM);
  add(box(0.4, 0.4, 0.4, tx - tl * 0.6, towerTop + 9, -tw * 0.5), redM, false);
  add(box(1.2, 0.9, 1.4, tx + tl * 0.2, towerTop + 0.45, -tw * 0.55), whiteM, false);
  const towerNum = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: numberTexture(o.number, '#e8eef4'), transparent: true, toneMapped: false }));
  towerNum.rotation.x = -Math.PI / 2;
  towerNum.rotation.z = -Math.PI / 2;
  towerNum.position.set(tx - tl * 0.2, towerTop + 0.05, tw * 0.15);
  towerNum.frustumCulled = false;
  root.add(towerNum);
  // A radar mast from Mk IV.
  if (o.cc >= 4) {
    const r = new THREE.Group();
    r.position.set(tx - tl * 0.7, towerTop + 0.4, tw * 0.45);
    r.add(mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 6).translate(0, 1.5, 0), trimM));
    r.add(mesh(new THREE.BoxGeometry(0.5, 1.2, 6).translate(0, 3.4, 0), darkM));
    root.add(r);
    rig.radar = r;
  }

  // ---- The stern deck: vents, the engine stacks, the toroid housings, and the plate with its lamps.
  add(box(0.1 * L, 1.6, deckZ * 1.4, -0.4 * L, deckTop + 0.8, 0), darkM);
  const vent = new THREE.Mesh(new THREE.PlaneGeometry(0.09 * L, deckZ * 1.3).rotateX(-Math.PI / 2).translate(-0.4 * L, deckTop + 1.62, 0), grilleM);
  vent.frustumCulled = false;
  root.add(vent);
  for (const sd of [-1, 1]) {
    // The stacks, raked back, their flames.
    const sx = -0.46 * L, sz = sd * deckZ * 0.55;
    add(new THREE.CylinderGeometry(0.9, 1.1, 4, 8).rotateZ(0.5).translate(sx, deckTop + 2, sz), darkM);
    const f = new THREE.Group();
    f.position.set(sx - 1.4, deckTop + 3.8, sz);
    f.rotation.z = Math.PI / 2 + 0.5;
    f.add(mesh(new THREE.ConeGeometry(0.9, 5, 8).translate(0, 2.5, 0), new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.85, toneMapped: false }), false));
    f.add(mesh(new THREE.ConeGeometry(0.45, 3.2, 6).translate(0, 1.6, 0), new THREE.MeshBasicMaterial({ color: '#fff0b0', toneMapped: false }), false));
    root.add(f);
    rig.flames.push(f);
  }
  // Four toroid housings at the corners of the flank bays: a ring, a fan, a glowing core.
  for (const [fx, sd] of [[0.06, -1], [0.06, 1], [-0.42, -1], [-0.42, 1]] as const) {
    const x = fx * L, z = sd * (bayZ0 + W * 0.075), y = bayTop + 0.5;
    add(new THREE.CylinderGeometry(2.5, 2.7, 1.4, 16).translate(x, y, z), darkM);
    add(new THREE.TorusGeometry(2.45, 0.25, 4, 20).rotateX(Math.PI / 2).translate(x, y + 0.72, z), trimM);
    const coreM = new THREE.MeshBasicMaterial({ color: look.glow, toneMapped: false });
    add(new THREE.CylinderGeometry(0.9, 0.9, 0.5, 12).translate(x, y + 0.7, z), coreM, false);
    rig.cores.push(coreM);
    const fan = new THREE.Group();
    fan.position.set(x, y + 0.95, z);
    for (let k = 0; k < 4; k++) fan.add(mesh(new THREE.BoxGeometry(4.2, 0.15, 0.6).rotateY((k * Math.PI) / 4), trimM));
    root.add(fan);
    rig.fans.push(fan);
  }
  // The stern plate: four amber lamps and the hull number.
  const sternX = -0.5 * L;
  add(chamfer(sternX - 0.6, sternX + 2, 0.8, Hh * 0.7, -0.36 * W, 0.36 * W, 0.6, 0.4), plateM);
  for (const [lz, ly] of [[-0.2, 0.5], [0.2, 0.5], [-0.2, 0.36], [0.2, 0.36]]) add(new THREE.CylinderGeometry(0.9, 0.9, 0.4, 10).rotateZ(Math.PI / 2).translate(sternX - 0.7, Hh * ly, lz * W), rearM, false);
  const sternNum = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshBasicMaterial({ map: numberTexture(o.number, '#e8eef4'), transparent: true, toneMapped: false }));
  sternNum.rotation.y = -Math.PI / 2;
  sternNum.position.set(sternX - 0.72, Hh * 0.43, 0);
  sternNum.frustumCulled = false;
  root.add(sternNum);
  for (const sd of [-1, 1]) add(box(0.4, 0.4, 0.4, sternX - 0.2, Hh * 0.66, sd * 0.34 * W), redM, false);

  // ---- Class extras.
  if (klass === 'ark') {
    // Glasshouse domes on the stern deck.
    const domeM = new THREE.MeshStandardMaterial({ color: '#a8e0c0', emissive: '#2a6a40', transparent: true, opacity: 0.75, metalness: 0.2, roughness: 0.1 });
    for (const [x, z] of [[-0.3, -0.07], [-0.3, 0.07], [-0.36, 0]]) add(new THREE.SphereGeometry(3.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(x * L, deckTop, z * W), domeM);
  }
  if (klass === 'nightrunner') {
    // Fins along the flanks.
    for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) add(hull([[-0.4 * L + k * 9, bayTop, sd * cz], [-0.4 * L + k * 9 + 6, bayTop, sd * cz], [-0.4 * L + k * 9 + 1, bayTop + 3.4, sd * (cz - 0.4)]]), darkM);
  }
  if (klass === 'bastion') {
    // Slab armour on the flanks.
    for (const sd of [-1, 1]) add(box(0.5 * L, Hh * 0.18, 0.9, -0.18 * L, Hh * 0.52, sd * (hw + 0.2)), plateM);
  }
  if (klass === 'dredge') {
    // A crane on the stern deck.
    add(box(1.4, 9, 1.4, -0.3 * L, deckTop + 4.5, deckZ * 0.6), trimM);
    add(new THREE.BoxGeometry(14, 1, 1).rotateZ(-0.3).translate(-0.3 * L + 6, deckTop + 10, deckZ * 0.6), trimM);
  }
  if (o.cc >= 5) {
    // Extra lamps and aerials as she grows.
    for (const sd of [-1, 1]) add(new THREE.CylinderGeometry(0.1, 0.14, 7, 5).translate(-0.22 * L, deckTop + 3.5, sd * deckZ * 0.8), trimM);
  }

  // ---- Roof props from the deck plan.
  for (const p of o.props) {
    const y = roofHeight(p.x, p.z);
    if (p.key === 'radar' || p.key === 'sensor') {
      const r = new THREE.Group();
      r.position.set(p.x, y, p.z);
      r.add(mesh(new THREE.CylinderGeometry(0.4, 0.6, 2.4, 6).translate(0, 1.2, 0), trimM));
      r.add(mesh(new THREE.SphereGeometry(2.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 2.8, 0.4), new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide })));
      root.add(r);
      if (!rig.radar) rig.radar = r;
    } else if (p.key === 'helipad') {
      add(new THREE.CylinderGeometry(Math.min(p.w, p.d) * 0.48, Math.min(p.w, p.d) * 0.5, 0.4, 20).translate(p.x, y + 0.2, p.z), darkM);
      add(new THREE.TorusGeometry(Math.min(p.w, p.d) * 0.4, 0.15, 4, 24).rotateX(Math.PI / 2).translate(p.x, y + 0.45, p.z), new THREE.MeshBasicMaterial({ color: '#ffcc30', toneMapped: false }), false);
    } else if (p.key.includes('tesla') || p.key.includes('coil')) {
      add(new THREE.CylinderGeometry(0.5, 1, 4, 8).translate(p.x, y + 2, p.z), trimM);
      add(new THREE.SphereGeometry(1, 8, 6).translate(p.x, y + 4.4, p.z), glowM, false);
    } else {
      // Anything else: a housing with a hatch and a vent.
      const w = Math.max(1.5, p.w - 1), d = Math.max(1.5, p.d - 1);
      add(chamfer(p.x - w / 2, p.x + w / 2, y, y + 1.6, p.z - d / 2, p.z + d / 2, 0.3), plateM);
      add(box(w * 0.4, 0.2, d * 0.4, p.x, y + 1.7, p.z), darkM);
    }
  }

  // ---- The guns, each on its mount, turning.
  for (const m of o.mounts) rig.turrets.set(m.id, turret(root, m, roofHeight(m.x, m.z), look, trimM, darkM, plateM, glowM));

  function roofHeight(x: number, z: number): number {
    const az = Math.abs(z);
    if (x > 0.12 * L) {
      // On the bow plates: the ridge falls toward the nose and the sides.
      const t = Math.min(1, (x - bx0) / (nose - bx0));
      const ridge = ridgeY + (noseY - ridgeY) * t;
      return Math.max(Hh * 0.3, ridge - (az / hw) * (ridge - Hh * 0.35));
    }
    if (az < deckZ) return deckTop;
    if (az < cz) return bayTop;
    return trackH;
  }
  rig.roofAt = roofHeight;
  return rig;
}

/** A gun on its ring: a faceted housing, barrels by its family, the rarity colour on its back. */
function turret(root: THREE.Group, m: BuildOpts['mounts'][number], y: number, look: ShipLook, trimM: THREE.Material, darkM: THREE.Material, plateM: THREE.Material, glowM: THREE.Material): TurretRig {
  const s = m.main ? 2.3 : m.size === 'heavy' ? 1.45 : m.size === 'medium' ? 1.1 : 0.8;
  const base = new THREE.Group();
  base.position.set(m.x, y, m.z);
  base.add(mesh(new THREE.CylinderGeometry(2.4 * s, 2.7 * s, 0.6 * s, 14).translate(0, 0.3 * s, 0), darkM));
  root.add(base);
  const yaw = new THREE.Group();
  yaw.position.y = 0.6 * s;
  base.add(yaw);
  // The housing: wide at the back, sloped to the front.
  const H = 1.6 * s;
  yaw.add(mesh(planarUV(new ConvexGeometry([
    [-2.2, 0, -1.9], [-2.2, 0, 1.9], [2, 0, -1.6], [2, 0, 1.6], [-2, 1, -1.7], [-2, 1, 1.7], [1.2, 1, -1.2], [1.2, 1, 1.2], [2.4, 0.4, 0],
  ].map(([x, yy, z]) => new THREE.Vector3(x * s, yy * H, z * s)))), plateM));
  yaw.add(mesh(new THREE.BoxGeometry(0.8 * s, 0.25 * s, 2.4 * s).translate(-1.6 * s, H + 0.12 * s, 0), trimM));
  // A sight and a lamp in its colour.
  yaw.add(mesh(new THREE.BoxGeometry(0.4 * s, 0.4 * s, 0.4 * s).translate(-0.4 * s, H + 0.2 * s, 1.1 * s), new THREE.MeshBasicMaterial({ color: m.color, toneMapped: false }), false));
  const barrels: THREE.Object3D[] = [];
  const reach = m.reach;
  const fam = m.fam;
  const pair = m.main || fam === 'cannon' || fam === 'mg' || fam === 'rail';
  const offs = m.main ? [-0.65, 0.65] : pair ? [-0.45, 0.45] : [0];
  if (fam === 'missile' || fam === 'mortar') {
    // A launcher box (missiles) or a squat mortar tube.
    const b = new THREE.Group();
    if (fam === 'missile') {
      b.add(mesh(new THREE.BoxGeometry(2.6 * s, 1.4 * s, 2.6 * s).translate(0.3 * s, H + 0.7 * s, 0), darkM));
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) b.add(mesh(new THREE.BoxGeometry(0.2 * s, 0.4 * s, 0.4 * s).translate(1.65 * s, H + 0.4 * s + j * 0.6 * s, -0.7 * s + i * 0.7 * s), new THREE.MeshBasicMaterial({ color: '#ff4030', toneMapped: false }), false));
    } else {
      b.add(mesh(new THREE.CylinderGeometry(0.8 * s, 0.9 * s, 3 * s, 10).rotateZ(-0.9).translate(1 * s, H + 1 * s, 0), darkM));
    }
    yaw.add(b);
    barrels.push(b);
  } else {
    for (const oz of offs) {
      const b = new THREE.Group();
      b.position.set(1.6 * s, H * 0.55, oz * s);
      const r = fam === 'energy' || fam === 'tesla' ? 0.32 * s : m.main ? 0.42 * s : 0.26 * s;
      const len = Math.max(2, reach - 1.6 * s);
      b.add(mesh(new THREE.CylinderGeometry(r, r * 1.15, len, 8).rotateZ(-Math.PI / 2).translate(len / 2, 0, 0), trimM));
      // Muzzle brake (guns) or emitter tip (energy).
      if (fam === 'energy' || fam === 'tesla' || fam === 'rail') b.add(mesh(new THREE.CylinderGeometry(r * 1.4, r * 1.4, 0.6 * s, 8).rotateZ(-Math.PI / 2).translate(len - 0.2, 0, 0), glowM, false));
      else b.add(mesh(new THREE.BoxGeometry(0.9 * s, r * 2.6, r * 2.6).translate(len - 0.3 * s, 0, 0), darkM));
      if (m.main) b.add(mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.5, 3 * s, 8).rotateZ(-Math.PI / 2).translate(1.6 * s, 0, 0), darkM));
      yaw.add(b);
      barrels.push(b);
    }
  }
  void look;
  return { id: m.id, yaw, barrels, reach, heavy: m.main || m.size === 'heavy' };
}

/** Merges a group's static meshes by material (fewer draw calls); animated parts stay as they are. */
export function compact(rig: ShipRig): void {
  const keep = new Set<THREE.Object3D>([...rig.wheels.flat(), ...rig.fans, ...rig.flames, ...[...rig.turrets.values()].map((t) => t.yaw.parent!), ...(rig.radar ? [rig.radar] : [])]);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const drop: THREE.Mesh[] = [];
  for (const ch of rig.root.children) {
    if (keep.has(ch) || !(ch instanceof THREE.Mesh) || Array.isArray(ch.material)) continue;
    ch.updateMatrix();
    const mat = ch.material as THREE.Material;
    if ((mat as THREE.MeshStandardMaterial).map && rig.treads.flat().includes((mat as THREE.MeshStandardMaterial).map!)) continue;
    const g = (ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry).clone();
    g.applyMatrix4(ch.matrix);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const list = byMat.get(mat) ?? [];
    list.push(g);
    byMat.set(mat, list);
    drop.push(ch);
  }
  for (const d of drop) rig.root.remove(d);
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const me = mesh(merged, mat, !(mat instanceof THREE.MeshBasicMaterial));
    rig.root.add(me);
  }
}
