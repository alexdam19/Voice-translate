import * as THREE from 'three';
import type { Arch } from '../../game/enemyDefs';
import { bumpTex } from './textures';

/**
 * Creatures as solid models for the cab's 3D view, built for each body plan (rats and swarmers, dogs, heavy beasts,
 * raiders and the dead, raider buggies, worms, flyers, dragons, golems, spider-bots, fish, spirits, giant insects)
 * out of lit shapes: ellipsoid bodies and heads, jointed legs with knees and feet, jaws, horns and tusks, spines,
 * tails, membrane wings, glowing eyes. They walk, run, flap, slither and sway. One instanced mesh per part of each
 * plan, so a horde of a thousand costs the same few draw calls as one.
 */

type Geo = 'sphere' | 'box' | 'limb' | 'cone' | 'wing' | 'cyl' | 'hemi' | 'muscle' | 'hoof';
type Mat = 'fur' | 'skin' | 'scale' | 'chitin' | 'metal' | 'rock' | 'bone' | 'cloth' | 'glow' | 'dark' | 'ghost';
type Role = 'body' | 'dark' | 'light' | 'bone' | 'eye' | 'metal' | 'claw' | 'skin' | 'cloth' | 'glow';
type Anim =
  | { k: 'leg'; ph: number; amp: number }
  /** An arm: swings with the walk and comes up and down in an attack (`lift` radians at the top of the swing). */
  | { k: 'arm'; ph: number; amp: number; lift: number }
  | { k: 'knee'; ph: number; amp: number }
  | { k: 'wing'; ph: number; amp: number; side: number }
  | { k: 'sway'; ph: number; amp: number }
  | { k: 'jaw'; amp: number }
  | { k: 'seg'; i: number; amp: number }
  | { k: 'spin'; rate: number }
  | { k: 'orbit'; i: number; r: number };

interface Part {
  geo: Geo;
  mat: Mat;
  role: Role;
  p: [number, number, number];
  s: [number, number, number];
  r?: [number, number, number];
  anim?: Anim;
  parent?: number;
}

/** Bakes soft occlusion into a shape: darker underneath and toward its lower end, as if lit by the open sky. */
function ao(g: THREE.BufferGeometry, byY = false): THREE.BufferGeometry {
  const n = g.attributes.normal as THREE.BufferAttribute, p = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    let k = 0.5 + 0.5 * Math.pow(Math.max(0, n.getY(i) * 0.5 + 0.5), 0.8);
    if (byY) k *= 0.72 + 0.28 * Math.min(1, Math.max(0, p.getY(i) + 1));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Coarse versions of the shapes for creatures far off (a horde is mostly far off). */
const GL: Partial<Record<Geo, THREE.BufferGeometry>> = {
  sphere: ao(new THREE.SphereGeometry(1, 8, 6)),
  limb: ao(new THREE.CylinderGeometry(0.72, 1, 1, 5, 1).translate(0, -0.5, 0), true),
  cone: ao(new THREE.ConeGeometry(1, 1, 5, 1).translate(0, 0.5, 0)),
  cyl: ao(new THREE.CylinderGeometry(1, 1, 1, 6, 1)),
  hemi: ao(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)),
  muscle: ao(new THREE.SphereGeometry(1, 7, 5).scale(1, 0.5, 1).translate(0, -0.5, 0)),
  hoof: ao(new THREE.CylinderGeometry(0.8, 1, 1, 5, 1).translate(0, 0.5, 0)),
  box: ao(new THREE.BoxGeometry(1, 1, 1)),
};

const G: Record<Geo, THREE.BufferGeometry> = {
  sphere: ao(new THREE.SphereGeometry(1, 20, 14)),
  box: ao(new THREE.BoxGeometry(1, 1, 1, 2, 2, 2)),
  limb: ao(new THREE.CylinderGeometry(0.72, 1, 1, 12, 3).translate(0, -0.5, 0), true),
  cone: ao(new THREE.ConeGeometry(1, 1, 12, 1).translate(0, 0.5, 0)),
  wing: (() => {
    // A membrane: a fan of three fingers, root at the origin, reaching out along +z.
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.35, 0.25);
    s.lineTo(0.15, 1);
    s.lineTo(-0.1, 0.72);
    s.lineTo(-0.35, 0.95);
    s.lineTo(-0.45, 0.5);
    s.lineTo(-0.7, 0.55);
    s.lineTo(-0.55, 0.1);
    s.closePath();
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(Math.PI / 2);
    return ao(g);
  })(),
  cyl: ao(new THREE.CylinderGeometry(1, 1, 1, 16, 1)),
  // A thigh or upper arm: full in the middle, narrowing to the joints, hanging from its top.
  muscle: ao(new THREE.SphereGeometry(1, 16, 12).scale(1, 0.5, 1).translate(0, -0.5, 0)),
  hoof: ao(new THREE.CylinderGeometry(0.8, 1, 1, 10, 1).translate(0, 0.5, 0)),
  hemi: ao(new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2)),
};

const std = (o: THREE.MeshStandardMaterialParameters, bump?: Parameters<typeof bumpTex>[0], scale = 2): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, ...o });
  if (bump) {
    const t = bumpTex(bump).clone();
    t.needsUpdate = true;
    t.repeat.set(scale, scale);
    m.bumpMap = t;
    m.bumpScale = bump === 'scale' || bump === 'rock' ? 2.2 : 1.2;
  }
  return m;
};

const MATS: Record<Mat, THREE.Material> = {
  fur: std({ roughness: 1 }, 'fur', 3),
  skin: std({ roughness: 0.55 }, 'skin', 2),
  scale: std({ roughness: 0.45, metalness: 0.05 }, 'scale', 4),
  chitin: std({ roughness: 0.25, metalness: 0.12 }, 'chitin', 2),
  metal: std({ roughness: 0.36, metalness: 0.65 }, 'metal', 1),
  rock: std({ roughness: 0.95, flatShading: true }, 'rock', 2),
  bone: std({ roughness: 0.6 }, 'skin', 1),
  cloth: std({ roughness: 0.95 }, 'cloth', 4),
  dark: std({ roughness: 0.75, side: THREE.DoubleSide }, 'skin', 2),
  glow: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
  ghost: std({ roughness: 0.2, transparent: true, opacity: 0.45, emissive: '#6040a0', emissiveIntensity: 0.6, depthWrite: false }),
};

const P = (geo: Geo, mat: Mat, role: Role, p: [number, number, number], s: [number, number, number], extra: Partial<Part> = {}): Part => ({ geo, mat, role, p, s, ...extra });

/** Four legs with knees and feet: thigh, shin (child), foot (grandchild of the thigh, via the shin). */
function legs4(out: Part[], fx: number, bx: number, y: number, z: number, thigh: number, shin: number, r: number, mat: Mat, amp: number): void {
  for (const [x, sd, ph] of [[fx, -1, 0], [fx, 1, Math.PI], [bx, -1, Math.PI], [bx, 1, 0]] as [number, number, number][]) {
    const t = out.length;
    out.push(P('muscle', mat, 'body', [x, y + thigh * 0.12, sd * z], [r * 1.5, thigh * 1.15, r * 1.25], { anim: { k: 'leg', ph, amp } }));
    const s = out.length;
    out.push(P('limb', mat, 'dark', [0, -thigh, 0], [r * 0.55, shin, r * 0.55], { parent: t, anim: { k: 'knee', ph, amp: amp * 0.9 } }));
    out.push(P('hoof', mat, 'claw', [r * 0.2, -shin - r * 0.3, 0], [r * 0.75, r * 0.6, r * 0.7], { parent: s }));
  }
}

function eyes(out: Part[], x: number, y: number, z: number, r: number): void {
  for (const sd of [-1, 1]) out.push(P('sphere', 'glow', 'eye', [x, y, sd * z], [r, r, r]));
}

/** Body plans (x forward, y up, z to the right; about a unit long, standing on y = 0). */
const PLANS: Record<Arch, Part[]> = {
  swarm: (() => {
    const o: Part[] = [];
    o.push(P('sphere', 'fur', 'body', [0, 0.2, 0], [0.3, 0.15, 0.15]));
    o.push(P('sphere', 'fur', 'body', [-0.14, 0.21, 0], [0.18, 0.17, 0.16]));
    o.push(P('sphere', 'fur', 'body', [0.3, 0.2, 0], [0.13, 0.1, 0.09]));
    o.push(P('cone', 'skin', 'skin', [0.38, 0.19, 0], [0.06, 0.13, 0.06], { r: [0, 0, -Math.PI / 2] }));
    o.push(P('sphere', 'skin', 'skin', [0.26, 0.31, -0.06], [0.04, 0.05, 0.02]));
    o.push(P('sphere', 'skin', 'skin', [0.26, 0.31, 0.06], [0.04, 0.05, 0.02]));
    eyes(o, 0.37, 0.24, 0.05, 0.018);
    for (const [x, sd, ph] of [[0.16, -1, 0], [0.16, 1, Math.PI], [-0.16, -1, Math.PI], [-0.16, 1, 0]] as [number, number, number][]) {
      o.push(P('limb', 'fur', 'dark', [x, 0.16, sd * 0.09], [0.035, 0.16, 0.035], { anim: { k: 'leg', ph, amp: 0.8 } }));
    }
    o.push(P('limb', 'skin', 'skin', [-0.3, 0.19, 0], [0.022, 0.55, 0.022], { r: [0, 0, -Math.PI / 2 + 0.25], anim: { k: 'sway', ph: 0, amp: 0.5 } }));
    return o;
  })(),
  canine: (() => {
    const o: Part[] = [];
    o.push(P('sphere', 'fur', 'body', [-0.05, 0.56, 0], [0.34, 0.16, 0.14]));
    o.push(P('sphere', 'fur', 'body', [0.2, 0.58, 0], [0.2, 0.21, 0.17]));
    o.push(P('sphere', 'fur', 'dark', [0.34, 0.7, 0], [0.11, 0.13, 0.1]));
    o.push(P('sphere', 'fur', 'body', [0.44, 0.78, 0], [0.12, 0.1, 0.09]));
    o.push(P('box', 'skin', 'light', [0.57, 0.74, 0], [0.15, 0.07, 0.07]));
    o.push(P('sphere', 'skin', 'claw', [0.645, 0.76, 0], [0.025, 0.025, 0.025]));
    o.push(P('cone', 'fur', 'dark', [0.4, 0.86, -0.05], [0.035, 0.08, 0.03]));
    o.push(P('cone', 'fur', 'dark', [0.4, 0.86, 0.05], [0.035, 0.08, 0.03]));
    o.push(P('box', 'bone', 'bone', [0.57, 0.705, 0], [0.12, 0.02, 0.06], { anim: { k: 'jaw', amp: 0.25 } }));
    eyes(o, 0.53, 0.8, 0.045, 0.018);
    legs4(o, 0.22, -0.26, 0.52, 0.09, 0.24, 0.27, 0.055, 'fur', 0.55);
    o.push(P('limb', 'fur', 'body', [-0.36, 0.62, 0], [0.04, 0.36, 0.04], { r: [0, 0, -2.3], anim: { k: 'sway', ph: 0, amp: 0.4 } }));
    return o;
  })(),
  beast: (() => {
    const o: Part[] = [];
    o.push(P('sphere', 'scale', 'body', [0, 0.78, 0], [0.46, 0.33, 0.31]));
    o.push(P('sphere', 'scale', 'body', [0.16, 0.98, 0], [0.26, 0.2, 0.24]));
    o.push(P('sphere', 'scale', 'light', [-0.05, 0.62, 0], [0.38, 0.14, 0.26]));
    o.push(P('sphere', 'scale', 'body', [0.52, 0.68, 0], [0.2, 0.18, 0.18]));
    o.push(P('box', 'scale', 'dark', [0.64, 0.56, 0], [0.2, 0.08, 0.15], { anim: { k: 'jaw', amp: 0.2 } }));
    for (const sd of [-1, 1]) {
      o.push(P('cone', 'bone', 'bone', [0.6, 0.82, sd * 0.09], [0.04, 0.26, 0.04], { r: [sd * 0.3, 0, -0.7] }));
      o.push(P('cone', 'bone', 'bone', [0.7, 0.56, sd * 0.1], [0.03, 0.2, 0.03], { r: [0, 0, -1.9] }));
    }
    for (let i = 0; i < 3; i++) o.push(P('cone', 'bone', 'bone', [-0.1 + i * 0.12, 1.12 - i * 0.03, 0], [0.04, 0.12 + (2 - i) * 0.03, 0.04], { r: [0, 0, 0.45] }));
    eyes(o, 0.66, 0.74, 0.1, 0.025);
    legs4(o, 0.28, -0.3, 0.64, 0.21, 0.3, 0.3, 0.1, 'scale', 0.4);
    const t = o.length;
    o.push(P('limb', 'scale', 'body', [-0.45, 0.78, 0], [0.08, 0.4, 0.08], { r: [0, 0, -1.9], anim: { k: 'sway', ph: 0, amp: 0.35 } }));
    o.push(P('sphere', 'rock', 'bone', [0, -0.42, 0], [0.1, 0.1, 0.1], { parent: t }));
    return o;
  })(),
  humanoid: (() => {
    // A person 1 unit tall (raiders with rifles; the dead reach out).
    const o: Part[] = [];
    o.push(P('sphere', 'cloth', 'dark', [0, 0.53, 0], [0.09, 0.07, 0.12]));
    o.push(P('sphere', 'cloth', 'cloth', [0.01, 0.7, 0], [0.1, 0.17, 0.13]));
    o.push(P('box', 'cloth', 'dark', [-0.1, 0.72, 0], [0.08, 0.16, 0.14]));
    o.push(P('sphere', 'skin', 'skin', [0.02, 0.93, 0], [0.065, 0.075, 0.06]));
    o.push(P('hemi', 'metal', 'metal', [0.02, 0.95, 0], [0.074, 0.055, 0.07]));
    eyes(o, 0.075, 0.935, 0.025, 0.008);
    for (const [sd, ph] of [[-1, 0], [1, Math.PI]] as [number, number][]) {
      const u = o.length;
      o.push(P('limb', 'cloth', 'cloth', [0, 0.84, sd * 0.15], [0.03, 0.17, 0.03], { r: [0, 0, 0.5], anim: { k: 'arm', ph: ph + Math.PI, amp: 0.2, lift: sd > 0 ? 2.2 : 1.4 } }));
      o.push(P('limb', 'skin', 'skin', [0, -0.17, 0], [0.025, 0.16, 0.025], { parent: u, r: [0, 0, 1.1] }));
      const t = o.length;
      o.push(P('limb', 'cloth', 'dark', [0, 0.52, sd * 0.06], [0.042, 0.25, 0.042], { anim: { k: 'leg', ph, amp: 0.55 } }));
      const s = o.length;
      o.push(P('limb', 'cloth', 'dark', [0, -0.25, 0], [0.034, 0.25, 0.034], { parent: t, anim: { k: 'knee', ph, amp: 0.6 } }));
      o.push(P('box', 'metal', 'claw', [0.03, -0.26, 0], [0.09, 0.04, 0.05], { parent: s }));
    }
    o.push(P('box', 'metal', 'metal', [0.2, 0.72, 0.05], [0.36, 0.03, 0.025]));
    return o;
  })(),
  vehicle: (() => {
    const o: Part[] = [];
    o.push(P('box', 'metal', 'body', [0, 0.3, 0], [1, 0.2, 0.52]));
    o.push(P('box', 'metal', 'dark', [-0.06, 0.5, 0], [0.42, 0.22, 0.46]));
    o.push(P('box', 'glow', 'glow', [0.16, 0.52, 0], [0.02, 0.14, 0.4]));
    for (const [x, z] of [[0.33, -0.28], [0.33, 0.28], [-0.33, -0.28], [-0.33, 0.28]]) o.push(P('cyl', 'dark', 'claw', [x, 0.18, z], [0.18, 0.1, 0.18], { r: [Math.PI / 2, 0, 0], anim: { k: 'spin', rate: 1 } }));
    o.push(P('cyl', 'metal', 'metal', [-0.1, 0.66, 0], [0.08, 0.1, 0.08]));
    o.push(P('box', 'metal', 'metal', [0.12, 0.7, 0], [0.36, 0.05, 0.05]));
    for (const z of [-0.18, 0, 0.18]) o.push(P('cone', 'metal', 'bone', [0.52, 0.28, z], [0.05, 0.16, 0.05], { r: [0, 0, -Math.PI / 2] }));
    return o;
  })(),
  worm: (() => {
    const o: Part[] = [];
    for (let i = 0; i < 9; i++) {
      const r = 0.2 * (1 - i * 0.07);
      o.push(P('sphere', i ? 'scale' : 'skin', i ? 'body' : 'light', [-i * 0.13, 0.2, 0], [r * 1.1, r, r], { anim: { k: 'seg', i, amp: 0.12 } }));
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      o.push(P('cone', 'bone', 'bone', [0.17, 0.2 + Math.sin(a) * 0.12, Math.cos(a) * 0.12], [0.03, 0.12, 0.03], { r: [a, 0, -Math.PI / 2], anim: { k: 'seg', i: 0, amp: 0.12 } }));
    }
    o.push(P('sphere', 'dark', 'dark', [0.19, 0.2, 0], [0.04, 0.13, 0.13], { anim: { k: 'seg', i: 0, amp: 0.12 } }));
    return o;
  })(),
  flyer: (() => {
    const o: Part[] = [];
    o.push(P('sphere', 'fur', 'body', [0, 0, 0], [0.26, 0.12, 0.13]));
    o.push(P('sphere', 'fur', 'body', [0.25, 0.02, 0], [0.1, 0.09, 0.09]));
    o.push(P('cone', 'fur', 'dark', [0.24, 0.1, -0.05], [0.03, 0.08, 0.03]));
    o.push(P('cone', 'fur', 'dark', [0.24, 0.1, 0.05], [0.03, 0.08, 0.03]));
    eyes(o, 0.33, 0.04, 0.04, 0.016);
    o.push(P('wing', 'dark', 'dark', [0.02, 0.03, 0.08], [0.55, 1, 0.75], { anim: { k: 'wing', ph: 0, amp: 0.9, side: 1 } }));
    o.push(P('wing', 'dark', 'dark', [0.02, 0.03, -0.08], [0.55, 1, 0.75], { r: [Math.PI, 0, 0], anim: { k: 'wing', ph: 0, amp: 0.9, side: -1 } }));
    o.push(P('limb', 'fur', 'dark', [-0.24, 0, 0], [0.02, 0.3, 0.02], { r: [0, 0, -Math.PI / 2], anim: { k: 'sway', ph: 0, amp: 0.3 } }));
    return o;
  })(),
  dragon: (() => {
    const o: Part[] = [];
    o.push(P('sphere', 'scale', 'body', [0, 0.6, 0], [0.34, 0.2, 0.18]));
    o.push(P('sphere', 'scale', 'light', [0.05, 0.5, 0], [0.28, 0.12, 0.14]));
    for (let i = 0; i < 4; i++) o.push(P('sphere', 'scale', 'body', [0.3 + i * 0.09, 0.66 + i * 0.07, 0], [0.08 - i * 0.008, 0.08 - i * 0.008, 0.075 - i * 0.008], { anim: { k: 'sway', ph: i * 0.4, amp: 0.05 } }));
    o.push(P('sphere', 'scale', 'body', [0.7, 0.95, 0], [0.13, 0.08, 0.08]));
    o.push(P('box', 'scale', 'dark', [0.8, 0.9, 0], [0.16, 0.04, 0.07], { anim: { k: 'jaw', amp: 0.3 } }));
    for (const sd of [-1, 1]) o.push(P('cone', 'bone', 'bone', [0.64, 1.02, sd * 0.05], [0.025, 0.18, 0.025], { r: [sd * 0.2, 0, 1.9] }));
    eyes(o, 0.78, 0.98, 0.05, 0.02);
    o.push(P('wing', 'dark', 'dark', [0.08, 0.72, 0.12], [1.3, 1, 1.4], { anim: { k: 'wing', ph: 0, amp: 0.7, side: 1 } }));
    o.push(P('wing', 'dark', 'dark', [0.08, 0.72, -0.12], [1.3, 1, 1.4], { r: [Math.PI, 0, 0], anim: { k: 'wing', ph: 0, amp: 0.7, side: -1 } }));
    for (let i = 0; i < 5; i++) o.push(P('sphere', 'scale', 'body', [-0.3 - i * 0.12, 0.58 - i * 0.03, 0], [0.09 - i * 0.014, 0.07 - i * 0.01, 0.07 - i * 0.01], { anim: { k: 'seg', i: i + 1, amp: 0.06 } }));
    legs4(o, 0.18, -0.2, 0.5, 0.12, 0.22, 0.24, 0.05, 'scale', 0.3);
    return o;
  })(),
  golem: (() => {
    const o: Part[] = [];
    o.push(P('box', 'rock', 'body', [0, 1.25, 0], [0.4, 0.5, 0.62], { r: [0, 0, 0.1] }));
    o.push(P('sphere', 'rock', 'body', [0.05, 1.05, 0], [0.26, 0.2, 0.3]));
    o.push(P('box', 'rock', 'dark', [0.1, 1.68, 0], [0.22, 0.2, 0.22]));
    eyes(o, 0.22, 1.7, 0.06, 0.03);
    // Horns swept forward off the helm, spikes off the shoulders.
    for (const sd of [-1, 1]) {
      o.push(P('cone', 'bone', 'bone', [0.12, 1.8, sd * 0.16], [0.05, 0.32, 0.05], { r: [sd * -0.5, 0, -0.7] }));
      for (let k = 0; k < 3; k++) o.push(P('cone', 'bone', 'bone', [-0.1 + k * 0.12, 1.7, sd * 0.5], [0.05, 0.28, 0.05], { r: [sd * -0.7, 0, 0.3] }));
    }
    o.push(P('sphere', 'glow', 'glow', [0.18, 1.3, 0], [0.06, 0.1, 0.12]));
    for (const [sd, ph] of [[-1, 0], [1, Math.PI]] as [number, number][]) {
      const a = o.length;
      o.push(P('limb', 'rock', 'body', [0, 1.52, sd * 0.4], [0.14, 0.55, 0.14], { r: [sd * 0.15, 0, 0.1], anim: { k: 'arm', ph: ph + Math.PI, amp: 0.35, lift: 2.6 } }));
      const f = o.length;
      o.push(P('limb', 'rock', 'dark', [0, -0.55, 0], [0.12, 0.45, 0.12], { parent: a, r: [0, 0, 0.3] }));
      o.push(P('box', 'rock', 'body', [0, -0.5, 0], [0.24, 0.24, 0.24], { parent: f }));
      const t = o.length;
      o.push(P('limb', 'rock', 'body', [0, 0.82, sd * 0.2], [0.14, 0.42, 0.14], { anim: { k: 'leg', ph, amp: 0.35 } }));
      const s = o.length;
      o.push(P('limb', 'rock', 'dark', [0, -0.42, 0], [0.12, 0.4, 0.12], { parent: t, anim: { k: 'knee', ph, amp: 0.35 } }));
      o.push(P('box', 'rock', 'body', [0.06, -0.42, 0], [0.26, 0.1, 0.2], { parent: s }));
    }
    return o;
  })(),
  bot: (() => {
    const o: Part[] = [];
    o.push(P('box', 'metal', 'body', [0, 0.64, 0], [0.52, 0.22, 0.42]));
    o.push(P('box', 'metal', 'dark', [-0.05, 0.8, 0], [0.34, 0.12, 0.3]));
    o.push(P('sphere', 'metal', 'metal', [0.3, 0.7, 0], [0.12, 0.1, 0.12]));
    o.push(P('sphere', 'glow', 'eye', [0.41, 0.72, 0], [0.03, 0.03, 0.05]));
    for (const sd of [-1, 1]) o.push(P('box', 'metal', 'metal', [0.3, 0.84, sd * 0.12], [0.4, 0.04, 0.04]));
    for (const [x, sd, ph] of [[0.18, -1, 0], [0.18, 1, Math.PI], [-0.18, -1, Math.PI], [-0.18, 1, 0]] as [number, number, number][]) {
      const t = o.length;
      o.push(P('limb', 'metal', 'dark', [x, 0.66, sd * 0.2], [0.035, 0.34, 0.035], { r: [sd * -1.1, 0, 0], anim: { k: 'leg', ph, amp: 0.4 } }));
      o.push(P('limb', 'metal', 'metal', [0, -0.34, 0], [0.028, 0.5, 0.028], { parent: t, r: [sd * 1.35, 0, 0], anim: { k: 'knee', ph, amp: 0.3 } }));
    }
    return o;
  })(),
  fish: (() => {
    const o: Part[] = [];
    o.push(P('sphere', 'scale', 'body', [0, 0.3, 0], [0.42, 0.17, 0.12], { anim: { k: 'seg', i: 1, amp: 0.05 } }));
    o.push(P('sphere', 'scale', 'light', [0.02, 0.24, 0], [0.36, 0.1, 0.1], { anim: { k: 'seg', i: 1, amp: 0.05 } }));
    o.push(P('box', 'dark', 'dark', [0.34, 0.26, 0], [0.12, 0.04, 0.08], { anim: { k: 'jaw', amp: 0.35 } }));
    eyes(o, 0.3, 0.34, 0.07, 0.02);
    o.push(P('wing', 'dark', 'dark', [-0.38, 0.3, 0], [0.4, 1, 0.35], { r: [Math.PI / 2, 0, 0], anim: { k: 'sway', ph: 0, amp: 0.5 } }));
    o.push(P('wing', 'dark', 'dark', [0.05, 0.44, 0], [0.3, 1, 0.3], { r: [Math.PI / 2, 0, 0.3] }));
    return o;
  })(),
  entity: (() => {
    // A hooded wraith: a cloak hanging off nothing, torn at the hem, two bone arms reaching out with long claws.
    const o: Part[] = [];
    o.push(P('cone', 'ghost', 'body', [0, 0.35, 0], [0.42, 1.15, 0.42], { anim: { k: 'seg', i: 0, amp: 0.08 } }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      o.push(P('cone', 'ghost', 'dark', [Math.cos(a) * 0.3 - 0.08, 0.42, Math.sin(a) * 0.3], [0.08, 0.45, 0.08], { r: [Math.PI, 0, 0], anim: { k: 'sway', ph: i, amp: 0.35 } }));
    }
    o.push(P('sphere', 'ghost', 'dark', [0.08, 1.38, 0], [0.2, 0.22, 0.2], { anim: { k: 'seg', i: 0, amp: 0.08 } }));
    o.push(P('sphere', 'dark', 'dark', [0.18, 1.34, 0], [0.12, 0.14, 0.14]));
    eyes(o, 0.27, 1.36, 0.06, 0.035);
    for (const sd of [-1, 1]) {
      const a = o.length;
      o.push(P('limb', 'bone', 'bone', [0.08, 1.12, sd * 0.22], [0.035, 0.55, 0.035], { r: [sd * 0.3, 0, -1.3], anim: { k: 'sway', ph: sd, amp: 0.2 } }));
      for (let k = 0; k < 3; k++) o.push(P('cone', 'bone', 'bone', [0, -0.56, (k - 1) * 0.04], [0.012, 0.2, 0.012], { parent: a, r: [0, 0, (k - 1) * 0.25] }));
    }
    o.push(P('sphere', 'glow', 'glow', [0, 0.8, 0], [0.12, 0.2, 0.12], { anim: { k: 'seg', i: 0, amp: 0.1 } }));
    return o;
  })(),
  insect: (() => {
    const o: Part[] = [];
    o.push(P('sphere', 'chitin', 'body', [0.42, 0.34, 0], [0.12, 0.1, 0.11]));
    o.push(P('sphere', 'chitin', 'body', [0.2, 0.36, 0], [0.15, 0.12, 0.12]));
    o.push(P('sphere', 'chitin', 'dark', [-0.2, 0.4, 0], [0.3, 0.17, 0.19]));
    for (let i = 0; i < 4; i++) o.push(P('sphere', 'chitin', 'light', [-0.34 + i * 0.1, 0.47, 0], [0.04, 0.06, 0.16]));
    for (const sd of [-1, 1]) {
      o.push(P('cone', 'bone', 'bone', [0.52, 0.3, sd * 0.05], [0.025, 0.14, 0.025], { r: [0, sd * 0.4, -Math.PI / 2 - 0.2], anim: { k: 'jaw', amp: 0.3 } }));
      o.push(P('limb', 'chitin', 'dark', [0.5, 0.42, sd * 0.04], [0.008, 0.3, 0.008], { r: [sd * -0.5, 0, -2.4], anim: { k: 'sway', ph: sd, amp: 0.3 } }));
    }
    eyes(o, 0.5, 0.38, 0.07, 0.03);
    for (const [x, ph] of [[0.28, 0], [0.18, Math.PI], [0.08, 0]] as [number, number][]) {
      for (const sd of [-1, 1]) {
        const t = o.length;
        o.push(P('limb', 'chitin', 'dark', [x, 0.35, sd * 0.1], [0.022, 0.24, 0.022], { r: [sd * -1.15, 0, 0], anim: { k: 'leg', ph: ph + (sd > 0 ? Math.PI : 0), amp: 0.45 } }));
        o.push(P('limb', 'chitin', 'dark', [0, -0.24, 0], [0.016, 0.34, 0.016], { parent: t, r: [sd * 1.5, 0, 0] }));
      }
    }
    return o;
  })(),
};

/** What to draw this frame for one creature. */
export interface CreatureDraw {
  arch: Arch;
  x: number;
  y: number;
  z: number;
  /** Heading (radians, world). */
  rot: number;
  /** Length (m). */
  len: number;
  /** Animation clock and how fast it's going (0 still, 1 a run). */
  t: number;
  gait: number;
  body: THREE.Color;
  eye: THREE.Color;
  flash: boolean;
  look: '' | 'zombie' | 'skeleton';
  /** Mid-attack (0..1 through the blow; 0 not attacking): arms come up and down, jaws gape, the body lunges. */
  atk?: number;
}

/** An attack's arm swing: up over the first 40%, then down hard through the target. */
const swing = (t: number): number => (t <= 0 ? 0 : t < 0.4 ? t / 0.4 : Math.max(-0.25, 1 - ((t - 0.4) / 0.6) * 1.25));

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

/** All the creature models, instanced by body plan and part. */
export class Creatures3D {
  readonly root = new THREE.Group();
  private meshes = new Map<string, THREE.InstancedMesh[]>();
  private cap = new Map<string, number>();
  private n = new Map<string, number>();
  private frames: THREE.Matrix4[] = [];

  begin(): void {
    for (const k of this.n.keys()) this.n.set(k, 0);
  }

  private ensure(arch: Arch, lo: boolean, want: number): THREE.InstancedMesh[] {
    const key = `${arch}${lo ? ':lo' : ''}`;
    let list = this.meshes.get(key);
    const cap = this.cap.get(key) ?? 0;
    if (list && want <= cap) return list;
    const size = Math.max(32, Math.ceil(want * 1.5));
    if (list) for (const m of list) {
      this.root.remove(m);
      m.dispose();
    }
    list = PLANS[arch].map((p) => {
      const m = new THREE.InstancedMesh((lo && GL[p.geo]) || G[p.geo], MATS[p.mat], size);
      m.castShadow = !lo && p.mat !== 'glow' && p.mat !== 'ghost';
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.count = 0;
      m.setColorAt(0, new THREE.Color('#fff'));
      this.root.add(m);
      return m;
    });
    this.meshes.set(key, list);
    this.cap.set(key, size);
    return list;
  }

  /** Adds a creature (`lo`: far off, drawn with the coarse shapes and without its shadow). */
  add(d: CreatureDraw, ox: number, oz: number, lo = false): void {
    const plan = PLANS[d.arch];
    const key = `${d.arch}${lo ? ':lo' : ''}`;
    const i = this.n.get(key) ?? 0;
    const list = this.ensure(d.arch, lo, i + 1);
    this.n.set(key, i + 1);
    // Root: at the creature, turned to its heading, scaled to its length.
    // An attack throws the body forward and pitches it into the blow.
    const atk = d.atk ?? 0;
    const lunge = atk > 0 ? Math.sin(Math.PI * atk) * 0.18 * d.len : 0;
    const root = new THREE.Matrix4().compose(tmpV.set(d.x - ox + Math.cos(d.rot) * lunge, d.z, d.y - oz + Math.sin(d.rot) * lunge), tmpQ.setFromEuler(tmpE.set(0, -d.rot, -Math.sin(Math.PI * atk) * 0.22, 'YXZ')), tmpS.set(d.len, d.len, d.len));
    const T = d.t * (4 + d.gait * 6);
    // Natural colour: the kind's tint, toned toward grey-brown and darkened a little.
    const body = d.body.clone().lerp(new THREE.Color('#6a6258'), 0.42).multiplyScalar(0.9);
    const dark = body.clone().multiplyScalar(0.5);
    const light = body.clone().lerp(new THREE.Color('#f0e8d8'), 0.35);
    const bone = new THREE.Color(d.look === 'skeleton' ? '#e8e0c8' : '#d8ccb0');
    const skin = d.look === 'zombie' ? new THREE.Color('#7a8a5a') : d.look === 'skeleton' ? bone : new THREE.Color(d.arch === 'humanoid' ? '#c89a78' : '#b88a7a').lerp(body, 0.4);
    const white = new THREE.Color(1.6, 1.6, 1.6);
    this.frames.length = plan.length;
    plan.forEach((p, k) => {
      const m = list[k];
      // Local frame: parent's (without scale), then this part's offset, rest turn and animation.
      const local = new THREE.Matrix4();
      let rx = p.r?.[0] ?? 0, ry = p.r?.[1] ?? 0, rz = p.r?.[2] ?? 0;
      let px = p.p[0], py = p.p[1], pz = p.p[2];
      const a = p.anim;
      if (a) {
        switch (a.k) {
          case 'leg':
            rz += Math.sin(T + a.ph) * a.amp * d.gait;
            break;
          case 'arm':
            rz += Math.sin(T + a.ph) * a.amp * d.gait * (atk > 0 ? 0.2 : 1) + swing(atk) * a.lift;
            break;
          case 'knee':
            rz -= Math.max(0, Math.sin(T + a.ph + 1.2)) * a.amp * d.gait;
            break;
          case 'wing':
            rx += a.side * Math.sin(d.t * 9 + a.ph) * a.amp;
            break;
          case 'sway':
            ry += Math.sin(d.t * 3 + a.ph) * a.amp;
            break;
          case 'jaw':
            rz += (Math.sin(d.t * 5) * 0.5 + 0.5) * a.amp + Math.sin(Math.PI * atk) * a.amp * 1.8;
            break;
          case 'seg':
            py += Math.sin(d.t * 5 - a.i * 0.9) * a.amp * 0.5;
            pz += Math.sin(d.t * 3.5 - a.i * 0.7) * a.amp;
            break;
          case 'spin':
            ry += T * a.rate;
            break;
          case 'orbit': {
            const ang = d.t * 1.4 + (a.i / 5) * Math.PI * 2;
            px += Math.cos(ang) * a.r;
            pz += Math.sin(ang) * a.r;
            py += Math.sin(d.t * 2 + a.i) * 0.2;
            rx += d.t;
            break;
          }
        }
      }
      local.compose(tmpV.set(px, py, pz), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), ONE);
      const frame = p.parent !== undefined ? this.frames[p.parent].clone().multiply(local) : local;
      this.frames[k] = frame;
      tmpM.copy(root).multiply(frame).multiply(new THREE.Matrix4().makeScale(p.s[0], p.s[1], p.s[2]));
      m.setMatrixAt(i, tmpM);
      const c = d.flash && p.mat !== 'glow' ? white : p.role === 'body' ? body : p.role === 'dark' ? dark : p.role === 'light' ? light : p.role === 'bone' ? bone : p.role === 'eye' ? d.eye : p.role === 'skin' ? skin : p.role === 'claw' ? new THREE.Color('#2a2622') : p.role === 'metal' ? new THREE.Color('#5a6068') : p.role === 'glow' ? d.eye : p.role === 'cloth' ? (d.look === 'zombie' ? body.clone().lerp(new THREE.Color('#5a5448'), 0.6) : body) : body;
      m.setColorAt(i, c);
    });
  }

  end(): void {
    for (const [key, list] of this.meshes) {
      const n = this.n.get(key) ?? 0;
      for (const m of list) {
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  }
}
