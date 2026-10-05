import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HullClass } from '../../game/classes';

/**
 * The Titan Crawler as a solid model, built after the "07" reference sheet: a long, tall, slab-sided gunmetal hull on
 * three crawler units a side (the front pair standing proud at the bow corners, their tread showing), the bow a blunt
 * chevron of stepped armour petals that climbs steeply from a slatted grille and its cyan light bar up to the deck, a
 * raised central hood with a lit vent panel, missile pods at the shoulders, tall side armour in bolted segments with
 * blue light strips and the hull number, the long hexagonal command superstructure carrying the twin-barrelled main
 * battery and the sensor cupola, and aft of it the engine deck: the big ribbed grille, the mesh vent, the "07" block,
 * the stern fins reaching back past the hull, and four exhaust nozzles glowing in the stern plate. Everything in
 * metres: X forward, Y up, Z to starboard.
 *
 * Every hull is drawn in dark gunmetal like the sheet; the classes differ in tint, light colour and build: the
 * Juggernaut is the sheet itself (cyan), the Bastion bolts slab armour and reactive bricks on (amber), the Ark carries
 * glasshouse domes on its engine deck (green), the Nightrunner sits lower with raked fins along its armour (violet),
 * the Dredge wears a dozer blade, a crane and hazard paint (orange). Each Command Center refit (Mk I-VI) bolts on
 * more: a second pair of missile pods, track skirts and add-on armour, a radar, aerials and searchlights, a ram.
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
  juggernaut: { hull: '#464e5c', plate: '#58647a', dark: '#16191f', glow: '#5cd0ff', rear: '#ff8c1a', trim: '#6f7a8b' },
  bastion: { hull: '#494b3f', plate: '#585b4a', dark: '#181914', glow: '#ffc84a', rear: '#ff8c1a', trim: '#777b63' },
  ark: { hull: '#425056', plate: '#4e5f67', dark: '#141c20', glow: '#52ffb0', rear: '#ffb040', trim: '#6c8088' },
  nightrunner: { hull: '#2e3039', plate: '#393c4a', dark: '#0f1015', glow: '#b48cff', rear: '#ff4a8a', trim: '#585c6f' },
  dredge: { hull: '#4e443b', plate: '#5d5145', dark: '#1b1612', glow: '#ffab40', rear: '#ff7a2a', trim: '#8a7562' },
  rival: { hull: '#47393d', plate: '#56454a', dark: '#191215', glow: '#ff3b30', rear: '#ff3b30', trim: '#7a5a62' },
  wreck: { hull: '#36322e', plate: '#3e3934', dark: '#141210', glow: '#000000', rear: '#000000', trim: '#4d4741' },
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
  /** Tread belts (their textures scroll: `userData.k` is the offset per metre travelled), per side (0 port, 1
   *  starboard); wheels that turn as objects (`userData.r` is the radius); and the wheel faces, which turn by turning
   *  their texture (one per side and size, so every wheel can be merged into the hull). */
  treads: THREE.Texture[][];
  wheels: THREE.Object3D[][];
  wheelFaces: { tex: THREE.Texture; r: number; side: number }[];
  turrets: Map<number, TurretRig>;
  /** Fans in the four toroid housings (FL, FR, RL, RR) and their glowing cores. */
  fans: THREE.Object3D[];
  cores: THREE.MeshBasicMaterial[];
  /** Exhaust flames at the stern nozzles, scaled with the engine's push. */
  flames: THREE.Object3D[];
  radar: THREE.Object3D | null;
  /** Light materials that pulse; the hull materials (for the hit flash); the outline (its weight follows the zoom). */
  glow: THREE.MeshBasicMaterial[];
  hullMats: THREE.MeshStandardMaterial[];
  lines: THREE.LineBasicMaterial;
  roofAt: (x: number, z: number) => number;
  key: string;
}

// ------------------------------------------------------------------------------------------------ textures

const texCache = new Map<string, THREE.Texture>();

function tex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, wrap = true): THREE.Texture {
  const have = texCache.get(key);
  if (have) return have;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Armour plating: panels of a few sizes a shade apart, dark seams, a lit upper edge, rivet rows, a little grime. */
function plateTexture(base: string): THREE.Texture {
  return tex(`plate|${base}`, 256, 256, (c, S) => {
    const col = new THREE.Color(base);
    const r = rng(7);
    c.fillStyle = base;
    c.fillRect(0, 0, S, S);
    const rows = [0, 44, 100, 150, 206, 256];
    for (let i = 0; i < rows.length - 1; i++) {
      const y0 = rows[i], y1 = rows[i + 1];
      let x = -Math.floor(r() * 50);
      while (x < S) {
        const w = 44 + Math.floor(r() * 64);
        const cc = col.clone().offsetHSL(0, 0, (r() - 0.5) * 0.045);
        for (const ox of [0, S, -S]) {
          const px = x + ox;
          if (px > S || px + w < 0) continue;
          c.fillStyle = `#${cc.getHexString()}`;
          c.fillRect(px + 1, y0 + 1, w - 1, y1 - y0 - 1);
          c.fillStyle = 'rgba(255,255,255,0.08)';
          c.fillRect(px + 1, y0 + 1, w - 2, 1);
          c.fillStyle = 'rgba(0,0,0,0.16)';
          c.fillRect(px + 1, y1 - 2, w - 2, 1);
          c.fillStyle = 'rgba(0,0,0,0.42)';
          c.fillRect(px, y0, 1, y1 - y0);
        }
        if (r() < 0.4) {
          c.fillStyle = 'rgba(0,0,0,0.3)';
          for (let k = x + 5; k < x + w - 4; k += 7) c.fillRect(((k % S) + S) % S, y0 + 4, 1, 1);
        }
        x += w;
      }
      c.fillStyle = 'rgba(0,0,0,0.42)';
      c.fillRect(0, y0, S, 1);
    }
    for (let k = 0; k < 36; k++) {
      c.fillStyle = r() < 0.75 ? `rgba(0,0,0,${0.04 + r() * 0.06})` : `rgba(255,255,255,${0.03 + r() * 0.03})`;
      c.fillRect(r() * S, r() * S, 4 + r() * 22, 1 + r() * 2);
    }
  });
}

/** Track links: steel shoes with a raised grouser, the pins, the guide gap. 8 links across the texture. */
function treadTexture(): THREE.Texture {
  return tex('tread', 256, 64, (c, w, h) => {
    c.fillStyle = '#0a0b0d';
    c.fillRect(0, 0, w, h);
    for (let k = 0; k < 8; k++) {
      const x = k * 32;
      c.fillStyle = '#2d3137';
      c.fillRect(x + 2, 2, 28, h - 4);
      c.fillStyle = '#474d56';
      c.fillRect(x + 11, 2, 7, h - 4);
      c.fillStyle = '#646c77';
      c.fillRect(x + 11, 2, 2, h - 4);
      c.fillStyle = '#1a1d21';
      c.fillRect(x + 2, 2, 2, h - 4);
      c.fillStyle = '#131518';
      c.fillRect(x + 2, h / 2 - 3, 28, 6);
    }
  });
}

/** The hull number, stencilled: white figures with a dark edge, on nothing. */
function numberTexture(text: string, color: string): THREE.Texture {
  return tex(`num|${text}|${color}`, 256, 128, (c) => {
    c.font = 'bold 92px "Silkscreen", "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 8;
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.strokeText(text, 128, 68);
    c.fillStyle = color;
    c.fillText(text, 128, 68);
  }, false);
}

/** A grille: vertical slats in a dark frame. */
function grilleTexture(): THREE.Texture {
  return tex('grille', 128, 64, (c, w, h) => {
    c.fillStyle = '#07080a';
    c.fillRect(0, 0, w, h);
    for (let x = 3; x < w - 3; x += 8) {
      c.fillStyle = '#2a2f36';
      c.fillRect(x, 3, 5, h - 6);
      c.fillStyle = '#48505b';
      c.fillRect(x, 3, 1, h - 6);
    }
  });
}

/** The engine deck's ribbed grille: bars, deep shadow between. */
function ribTexture(): THREE.Texture {
  return tex('ribs', 128, 64, (c, w, h) => {
    c.fillStyle = '#060708';
    c.fillRect(0, 0, w, h);
    for (let x = 2; x < w; x += 8) {
      c.fillStyle = '#30353d';
      c.fillRect(x, 2, 4, h - 4);
      c.fillStyle = '#4c545f';
      c.fillRect(x, 2, 1, h - 4);
    }
    c.fillStyle = '#1c2026';
    c.fillRect(0, h / 2 - 1, w, 2);
  });
}

/** A fine mesh vent. */
function meshTexture(): THREE.Texture {
  return tex('mesh', 64, 64, (c, w, h) => {
    c.fillStyle = '#121418';
    c.fillRect(0, 0, w, h);
    for (let y = 1; y < h; y += 4) for (let x = (y % 8) / 2 + 1; x < w; x += 4) {
      c.fillStyle = '#353a42';
      c.fillRect(x, y, 2, 2);
    }
  });
}

/** Slotted vents ("III") for the decks: slots running across the texture's width. */
function ventTexture(): THREE.Texture {
  return tex('vent', 64, 32, (c, w, h) => {
    c.fillStyle = '#1f2329';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#3a414b';
    c.fillRect(0, 0, w, 2);
    for (let x = 6; x < w - 4; x += 9) {
      c.fillStyle = '#07080a';
      c.fillRect(x, 6, 5, h - 12);
      c.fillStyle = '#4a525d';
      c.fillRect(x, h - 6, 5, 1);
    }
  }, false);
}

/** A deck hatch: a raised square with a lit rim and two handles. */
function hatchTexture(): THREE.Texture {
  return tex('hatch', 64, 64, (c, w, h) => {
    c.fillStyle = '#1a1d22';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#3c434d';
    c.fillRect(4, 4, w - 8, h - 8);
    c.fillStyle = '#56606c';
    c.fillRect(4, 4, w - 8, 2);
    c.fillStyle = '#2b3037';
    c.fillRect(10, 10, w - 20, h - 20);
    c.fillStyle = '#15181c';
    c.fillRect(18, 20, 6, 24);
    c.fillRect(40, 20, 6, 24);
  }, false);
}

/** A road wheel's face: rim, six lightening holes, the hub and its bolts. */
function wheelTexture(): THREE.Texture {
  return tex('wheel', 128, 128, (c) => {
    c.fillStyle = '#16181c';
    c.fillRect(0, 0, 128, 128);
    const ring = (r: number, col: string): void => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(64, 64, r, 0, Math.PI * 2);
      c.fill();
    };
    ring(63, '#4b525c');
    ring(56, '#2c3137');
    ring(50, '#383e46');
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      c.fillStyle = '#0c0d10';
      c.beginPath();
      c.arc(64 + Math.cos(a) * 32, 64 + Math.sin(a) * 32, 9, 0, Math.PI * 2);
      c.fill();
    }
    ring(16, '#59616c');
    ring(8, '#2a2e34');
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.5;
      c.fillStyle = '#7a838f';
      c.fillRect(64 + Math.cos(a) * 12 - 1, 64 + Math.sin(a) * 12 - 1, 3, 3);
    }
  }, false);
}

/** Launch tubes: a grid of red-lit mouths in a dark face. */
function tubesTexture(): THREE.Texture {
  return tex('tubes', 64, 48, (c, w, h) => {
    c.fillStyle = '#15171b';
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
      c.fillStyle = '#05060a';
      c.fillRect(5 + x * 14, 5 + y * 14, 11, 11);
      c.fillStyle = '#d4281c';
      c.fillRect(8 + x * 14, 8 + y * 14, 5, 5);
    }
  }, false);
}

/** Hazard paint. */
function hazardTexture(): THREE.Texture {
  return tex('hazard', 64, 64, (c, w, h) => {
    c.fillStyle = '#d9a21a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1a1612';
    for (let k = -64; k < 128; k += 22) {
      c.beginPath();
      c.moveTo(k, 0);
      c.lineTo(k + 11, 0);
      c.lineTo(k + 11 - 64, 64);
      c.lineTo(k - 64, 64);
      c.fill();
    }
  });
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

/** A block from corner to corner with its top edges cut back by `ch` (along X by `chx`). */
function chamfer(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, ch: number, chx = ch): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (const x of [x0, x1]) for (const z of [z0, z1]) pts.push(new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y1 - ch, z));
  for (const x of [x0 + chx, x1 - chx]) for (const z of [z0 + ch, z1 - ch]) pts.push(new THREE.Vector3(x, y1, z));
  return planarUV(new ConvexGeometry(pts));
}

function hull(points: [number, number, number][]): THREE.BufferGeometry {
  return planarUV(new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z))));
}

/** A convex polygon (in X-Z) moved inward by `d`. */
function inset(poly: [number, number][], d: number): [number, number][] {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1];
  const s = area > 0 ? 1 : -1;
  const nrm = (i: number): [number, number] => {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [(-dz / l) * s, (dx / l) * s];
  };
  return poly.map((p, i) => {
    const a = nrm((i + n - 1) % n), b = nrm(i);
    const k = d / Math.max(0.2, 1 + a[0] * b[0] + a[1] * b[1]);
    return [p[0] + (a[0] + b[0]) * k, p[1] + (a[1] + b[1]) * k];
  });
}

/** A convex footprint stood up from y0 to y1, its top edges chamfered by `ch`. */
function prism(poly: [number, number][], y0: number, y1: number, ch = 0): THREE.BufferGeometry {
  const pts: [number, number, number][] = [];
  for (const [x, z] of poly) pts.push([x, y0, z], [x, y1 - ch, z]);
  for (const [x, z] of ch > 0 ? inset(poly, ch) : poly) pts.push([x, y1, z]);
  return hull(pts);
}

/** 2D convex hull, counter-clockwise (Andrew's monotone chain). */
function hull2(pts: [number, number][]): [number, number][] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

/**
 * A track belt wrapped round its wheels (circles in the X-Y plane, already grown by the belt's thickness): the tread
 * band, its texture running along the loop so it can roll, and the two rims.
 */
function belt(circles: [number, number, number][], z0: number, z1: number, per: number, thick: number): { band: THREE.BufferGeometry; rims: THREE.BufferGeometry } {
  const pts: [number, number][] = [];
  for (const [cx, cy, r] of circles) for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const outline = hull2(pts);
  const ring: [number, number][] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
    for (let j = 0; j < m; j++) ring.push([a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m]);
  }
  const n = ring.length;
  const nrm = ring.map((_, i) => {
    const a = ring[(i + n - 1) % n], b = ring[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l] as [number, number];
  });
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const p = ring[i % n];
    if (i > 0) s += Math.hypot(p[0] - ring[i - 1][0], p[1] - ring[i - 1][1]);
    pos.push(p[0], p[1], z0, p[0], p[1], z1);
    uv.push(s / per, 0, s / per, 1);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const band = new THREE.BufferGeometry();
  band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  band.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  band.setIndex(idx);
  band.computeVertexNormals();
  // The rims: the links' edges seen from the side, textured along the loop like the band so they roll with it.
  const rp: number[] = [], ru: number[] = [], ri: number[] = [];
  for (const [z, out] of [[z0, false], [z1, true]] as const) {
    const base = rp.length / 3;
    let sr = 0;
    for (let i = 0; i <= n; i++) {
      const q = ring[i % n], m = nrm[i % n];
      if (i > 0) sr += Math.hypot(q[0] - ring[i - 1][0], q[1] - ring[i - 1][1]);
      rp.push(q[0], q[1], z, q[0] - m[0] * thick, q[1] - m[1] * thick, z);
      ru.push(sr / per, 0.02, sr / per, 0.2);
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (out) ri.push(a, c, b, b, c, d);
      else ri.push(a, b, c, b, d, c);
    }
  }
  const rims = new THREE.BufferGeometry();
  rims.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rims.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2));
  rims.setIndex(ri);
  rims.computeVertexNormals();
  return { band, rims };
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = true;
  o.frustumCulled = false;
  return o;
}

const basic = (color: THREE.ColorRepresentation): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color, toneMapped: false });

// ------------------------------------------------------------------------------------------------ the model

export interface BuildOpts {
  L: number;
  W: number;
  /** Roof height (m): the top of the side armour. */
  H: number;
  klass: HullClass;
  look: ShipLook;
  /** Command Center level (1-6). */
  cc: number;
  number: string;
  /** Turret mounts: module id, local x/z, size, family, glow colour; the main battery flagged. */
  mounts: { id: number; x: number; z: number; size: 'light' | 'medium' | 'heavy'; fam: string; color: string; main: boolean; reach: number }[];
  /** Roof props from the deck plan: radar, nests, coils, bays... with their footprints. */
  props: { key: string; x: number; z: number; w: number; d: number }[];
}

export function buildShip(o: BuildOpts): ShipRig {
  const { L, W, H, klass, look, cc } = o;
  const hw = W / 2, k = L / 100;
  const Hh = H * (klass === 'nightrunner' ? 0.9 : 1);
  /** Along the hull from the nose (0) to the stern (1); across from the keel (0) to the side (1); up (1 = the deck). */
  const X = (f: number): number => L / 2 - f * L;
  const Z = (w: number): number => w * hw;
  const Y = (h: number): number => h * Hh;
  const root = new THREE.Group();

  const std = (p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ metalness: 0.35, roughness: 0.6, flatShading: true, ...p });
  const hullM = std({ color: '#ffffff', map: plateTexture(look.hull) });
  const plateM = std({ color: '#ffffff', map: plateTexture(look.plate), roughness: 0.48 });
  const deckM = std({ color: '#d4d8de', map: plateTexture(look.hull), roughness: 0.75 });
  const darkM = std({ color: look.dark, roughness: 0.8 });
  const trimM = std({ color: look.trim, metalness: 0.5, roughness: 0.45 });
  const glowM = basic(look.glow);
  const glowDim = basic(new THREE.Color(look.glow).multiplyScalar(0.5));
  const stripM = basic(new THREE.Color(look.glow).lerp(new THREE.Color('#1d3f8a'), 0.55));
  const redM = basic('#ff2a1a');
  const amberM = basic('#ffd25a');
  const rearM = basic(look.rear);
  const whiteM = basic('#fff7e0');
  const decal = (map: THREE.Texture, p: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial => std({ map, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, flatShading: false, ...p });
  const grilleM = decal(grilleTexture(), { transparent: false });
  const ribM = decal(ribTexture(), { transparent: false });
  const meshM = decal(meshTexture(), { transparent: false });
  const ventM = decal(ventTexture(), { transparent: false });
  const hatchM = decal(hatchTexture(), { transparent: false });
  const tubeM = decal(tubesTexture(), { transparent: false, emissive: '#3a0805' });
  const numM = decal(numberTexture(o.number, '#e9eef5'), { depthWrite: false });
  const hazardM = decal(hazardTexture(), { transparent: false });
  const lines = new THREE.LineBasicMaterial({ color: '#05070a', transparent: true, opacity: 0.7 });
  const rig: ShipRig = {
    root, treads: [[], []], wheels: [[], []], wheelFaces: [], turrets: new Map(), fans: [], cores: [], flames: [], radar: null,
    glow: [glowM, glowDim, rearM], hullMats: [hullM, plateM, trimM, deckM], lines, roofAt: () => H, key: '',
  };
  const add = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true): THREE.Mesh => {
    const me = mesh(g, m, cast);
    root.add(me);
    return me;
  };
  /** A flat decal lying on a surface at height y, `w` along X by `d` along Z (before turning by `yaw`), the surface
   *  rising aft at `tilt`. */
  const lay = (m: THREE.Material, w: number, d: number, x: number, y: number, z: number, yaw = 0, tilt = 0): void => {
    add(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).rotateY(yaw).rotateZ(-tilt).translate(x, y + 0.04, z), m, false);
  };
  /** A decal on a wall facing `face` (+1: +Z, -1: -Z, 2: +X, -2: -X). */
  const wall = (m: THREE.Material, w: number, h: number, x: number, y: number, z: number, face: number): void => {
    const g = new THREE.PlaneGeometry(w, h);
    if (face === -1) g.rotateY(Math.PI);
    if (face === 2) g.rotateY(Math.PI / 2);
    if (face === -2) g.rotateY(-Math.PI / 2);
    const e = 0.05;
    add(g.translate(x + (face === 2 ? e : face === -2 ? -e : 0), y, z + (face === 1 ? e : face === -1 ? -e : 0)), m, false);
  };
  const lamp = (m: THREE.Material, s: number, x: number, y: number, z: number): void => {
    add(new THREE.BoxGeometry(s, s, s).translate(x, y, z), m, false);
  };
  const bar = (m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t = 0.3 * k): void => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
    const me = mesh(new THREE.BoxGeometry(a.distanceTo(b), t, t), m, false);
    me.position.copy(a).add(b).multiplyScalar(0.5);
    me.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
    root.add(me);
  };
  const sides = [-1, 1];

  // ================================================================================== running gear
  // Three crawler units a side: the front pair proud at the bow corners with their fronts raised, a long one amidships,
  // and the rear pair with the sprocket raised at the stern. The belts roll and the wheels turn.
  const trackTop = Y(0.38), tw = W * 0.17, zIn = hw - tw, beltT = 0.55 * k;
  const treadBase = treadTexture();
  const units: [number, number, 'front' | 'mid' | 'rear'][] = [[X(0.3), X(0.035), 'front'], [X(0.655), X(0.335), 'mid'], [X(0.99), X(0.68), 'rear']];
  const faces = new Map<string, THREE.Material>();
  const faceMat = (side: number, r: number): THREE.Material => {
    const key = `${side}|${r.toFixed(3)}`;
    let m = faces.get(key);
    if (!m) {
      const t = wheelTexture().clone();
      t.center.set(0.5, 0.5);
      t.needsUpdate = true;
      rig.wheelFaces.push({ tex: t, r, side });
      m = std({ color: '#ffffff', map: t, flatShading: false });
      faces.set(key, m);
    }
    return m;
  };
  for (let s = 0; s < 2; s++) {
    const sd = s === 0 ? -1 : 1;
    for (const [x0, x1, kind] of units) {
      const rI = trackTop * 0.34, rW = trackTop * 0.2, rR = trackTop * 0.08;
      const yF = kind === 'front' ? trackTop - rI : rI + 0.4 * k;
      const yB = kind === 'rear' ? trackTop - rI * 0.95 : rI + 0.4 * k;
      const circles: [number, number, number][] = [[x1 - rI, yF, rI], [x0 + rI, yB, rI]];
      const n = Math.max(3, Math.round((x1 - x0 - 2.4 * rI) / (2 * rW + 0.5 * k)));
      const wx0 = x0 + rI * 1.3, wx1 = x1 - rI * 1.3;
      const roads: number[] = [];
      for (let i = 0; i < n; i++) roads.push(wx0 + ((wx1 - wx0) * i) / Math.max(1, n - 1));
      for (const x of roads) circles.push([x, rW, rW]);
      const nr = Math.max(2, Math.round((x1 - x0) / (11 * k)));
      const rollers: number[] = [];
      for (let i = 0; i < nr; i++) rollers.push(x0 + rI * 1.6 + ((x1 - x0 - rI * 3.2) * (i + 0.5)) / nr);
      for (const x of rollers) circles.push([x, trackTop - rR, rR]);
      const b = belt(circles, sd < 0 ? -hw : zIn, sd < 0 ? -zIn : hw, 8.8 * k, beltT);
      const tt = treadBase.clone();
      tt.needsUpdate = true;
      tt.userData.k = 1 / (8.8 * k);
      rig.treads[s].push(tt);
      const tm = new THREE.MeshStandardMaterial({ map: tt, metalness: 0.55, roughness: 0.55 });
      add(b.band, tm);
      add(b.rims, tm);
      // The frame inside the loop.
      add(box(x1 - x0 - rI * 2, trackTop * 0.5, tw - 1.6 * k, (x0 + x1) / 2, trackTop * 0.52, sd * (hw - tw / 2 - 0.2 * k)), darkM);
      // Wheels on the outer face: the idler and sprocket, the road wheels, the return rollers. Their faces turn by
      // their textures, so the wheels themselves can be merged into the hull.
      const wheel = (x: number, y: number, r: number, segs: number): void => {
        const z = sd * (hw - 0.55 * k);
        add(new THREE.CylinderGeometry(r, r, 0.9 * k, segs, 1, true).rotateX(Math.PI / 2).translate(x, y, z), darkM);
        const face = new THREE.CircleGeometry(r, segs);
        if (sd < 0) face.rotateY(Math.PI);
        add(face.translate(x, y, z + sd * 0.46 * k), faceMat(s, r));
      };
      wheel(x1 - rI, yF, rI - beltT, 20);
      wheel(x0 + rI, yB, rI - beltT, 20);
      for (const x of roads) wheel(x, rW, rW - beltT, 14);
      for (const x of rollers) wheel(x, trackTop - rR, rR - beltT * 0.5, 8);
      if (kind === 'front') {
        // Armoured pods down the outer face (the sheet's four boxes), a fender over the outer half aft, and the gun pod
        // on the raised front where the corner turret stands.
        const segs = 4, px0 = x0 + rI * 0.7, px1 = x1 - rI * 1.15;
        for (let i = 0; i < segs; i++) {
          const a = px0 + ((px1 - px0) * i) / segs + 0.15 * k, bb = px0 + ((px1 - px0) * (i + 1)) / segs - 0.15 * k;
          add(chamfer(a, bb, trackTop * 0.5, trackTop + 0.25 * k, sd < 0 ? -hw - 0.35 * k : hw - 0.6 * k, sd < 0 ? -hw + 0.6 * k : hw + 0.35 * k, 0.3 * k, 0.3 * k), i % 2 ? hullM : plateM);
        }
        add(chamfer(X(0.082), X(0.04), trackTop - 0.1 * k, trackTop + 1.6 * k, sd < 0 ? -hw - 0.2 * k : Z(0.86), sd < 0 ? -Z(0.86) : hw + 0.2 * k, 0.45 * k), plateM);
        lamp(whiteM, 0.7 * k, X(0.04) + 0.3 * k, trackTop + 0.7 * k, sd * Z(0.9));
        lamp(amberM, 0.45 * k, X(0.04) + 0.3 * k, trackTop + 0.7 * k, sd * Z(0.97));
        if (cc >= 3) for (let i = 0; i < 3; i++) add(box((px1 - px0) / 3 - 0.4 * k, trackTop * 0.32, 0.5 * k, px0 + ((px1 - px0) * (i + 0.5)) / 3, trackTop * 0.36, sd * (hw + 0.55 * k)), trimM);
      }
    }
  }

  // ================================================================================== the body
  const zBody = Z(0.585), deckMid = Y(0.96), deckRear = Y(0.92);
  const xMidAft = X(0.655), xStern = X(0.996);
  add(box(X(0.035) - X(0.99), Y(0.3), 2 * (zIn - 0.3 * k), (X(0.035) + X(0.99)) / 2, Y(0.2), 0), darkM);
  add(box(X(0.28) - xMidAft, deckMid - Y(0.24), 2 * zBody, (X(0.28) + xMidAft) / 2, (deckMid + Y(0.24)) / 2, 0), deckM);
  add(box(xMidAft - xStern, deckRear - Y(0.24), 2 * zBody, (xMidAft + xStern) / 2, (deckRear + Y(0.24)) / 2, 0), deckM);

  // ================================================================================== the bow
  // A raised hood over the grille and, either side of it, a fan of three armour petals whose seams run from the face
  // back toward the hood's end, each lower and steeper than the last, lying between the two raised shoulders. Light
  // glows up out of the seams; lamps sit in the faces.
  const xn = X(0), xb = X(0.24);
  const slopeA = Math.atan2(Y(1.02) - Y(0.52), xn - xb);
  const bt = (x: number): number => Math.max(0, Math.min(1, (x - xb) / (xn - xb)));
  const hoodH = (x: number): number => Y(1.02) + (Y(0.52) - Y(1.02)) * bt(x);
  const hoodW = klass === 'bastion' ? 0.23 : 0.19;
  const sweep = klass === 'nightrunner' ? 0.02 : klass === 'bastion' ? -0.008 : 0;
  /** The seams from the hood's edge outward: where each meets the face, and where it ends aft (along, across, up). */
  const SEAM_F: [number, number, number][] = [[0, hoodW, 0.5], [0.012 + sweep, 0.42, 0.48], [0.04 + sweep * 1.5, 0.64, 0.455], [0.085 + sweep * 2, 0.84, 0.43]];
  const SEAM_B: [number, number, number][] = [[0.27, hoodW * 0.9, 0.99], [0.25, 0.3, 0.955], [0.262, 0.44, 0.9], [0.3, 0.585, 0.83]];
  /** A petal's corners (x, across, y): front inner, front outer, back outer, back inner. */
  const petal = (i: number): [number, number, number][] => [SEAM_F[i], SEAM_F[i + 1], SEAM_B[i + 1], SEAM_B[i]].map(([f, w, h]) => [X(f), w, Y(h)]);
  const petalBottom = Y(0.18), petalPull = (i: number): number => (i === 2 ? 1.4 * k : 2.6 * k);
  /** Where a petal's sloped face is at height y, a fraction t of the way across its front edge. */
  const faceX = (i: number, t: number, y: number): number => {
    const P = petal(i);
    const xf = P[0][0] + (P[1][0] - P[0][0]) * t, top = P[0][2] + (P[1][2] - P[0][2]) * t;
    return xf - petalPull(i) + (petalPull(i) * (y - petalBottom)) / Math.max(0.1, top - petalBottom);
  };
  /** The petals' top surface at a point (x, across), or null off them. */
  const petalAt = (x: number, w: number): number | null => {
    const tri = (a: number[], b: number[], c: number[]): number | null => {
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(d) < 1e-9) return null;
      const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (w - c[1])) / d;
      const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (w - c[1])) / d;
      const l3 = 1 - l1 - l2;
      return l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6 ? null : l1 * a[2] + l2 * b[2] + l3 * c[2];
    };
    for (let i = 0; i < 3; i++) {
      const P = petal(i);
      const h = tri(P[0], P[1], P[2]) ?? tri(P[0], P[2], P[3]);
      if (h !== null) return h;
    }
    return null;
  };
  // The hood: the grille housing at the front, climbing back to the deck.
  add(hull([
    [xn, Y(0.06), -Z(hoodW)], [xn, Y(0.06), Z(hoodW)], [xn, Y(0.47), -Z(hoodW)], [xn, Y(0.47), Z(hoodW)],
    [xn - 1.1 * k, Y(0.52), -Z(hoodW) + 0.4 * k], [xn - 1.1 * k, Y(0.52), Z(hoodW) - 0.4 * k],
    [X(0.28), Y(0.2), -Z(hoodW * 0.9)], [X(0.28), Y(0.2), Z(hoodW * 0.9)], [X(0.28), Y(1.02), -Z(hoodW * 0.9)], [X(0.28), Y(1.02), Z(hoodW * 0.9)],
  ]), plateM);
  // Its raised centre rib and the lit vent panel on it.
  const ribW = Z(0.085);
  add(hull([
    [X(0.025), hoodH(X(0.025)) - 0.6 * k, -ribW], [X(0.025), hoodH(X(0.025)) - 0.6 * k, ribW], [X(0.025), hoodH(X(0.025)) + 0.5 * k, -ribW * 0.8], [X(0.025), hoodH(X(0.025)) + 0.5 * k, ribW * 0.8],
    [X(0.27), Y(1.02) - 0.6 * k, -ribW], [X(0.27), Y(1.02) - 0.6 * k, ribW], [X(0.27), Y(1.02) + 0.5 * k, -ribW * 0.8], [X(0.27), Y(1.02) + 0.5 * k, ribW * 0.8],
  ]), hullM);
  {
    const vx = X(0.1), vy = hoodH(vx) + 0.5 * k;
    lay(ventM, 7 * k, ribW * 1.5, vx, vy, 0, 0, slopeA);
    for (const sd of sides) bar(glowM, X(0.06), hoodH(X(0.06)) + 0.55 * k, sd * ribW * 0.85, X(0.15), hoodH(X(0.15)) + 0.55 * k, sd * ribW * 0.85, 0.22 * k);
  }
  // The grille and the light bar over it, the frame either side.
  wall(grilleM, Z(hoodW) * 1.6, Y(0.32), xn, Y(0.25), 0, 2);
  add(box(0.3 * k, 0.45 * k, Z(hoodW) * 1.7, xn + 0.15 * k, Y(0.43), 0), glowM, false);
  add(box(0.4 * k, Y(0.36), 0.5 * k, xn + 0.1 * k, Y(0.26), -Z(hoodW) * 0.86), darkM);
  add(box(0.4 * k, Y(0.36), 0.5 * k, xn + 0.1 * k, Y(0.26), Z(hoodW) * 0.86), darkM);
  for (const sd of sides) {
    for (let i = 0; i < 3; i++) {
      // The petal, drawn in a little from its seams so the light shows between.
      const P = petal(i).map(([x, w, y]) => [x, Z(w), y]);
      const cx = (P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, cz = (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4, cy = (P[0][2] + P[1][2] + P[2][2] + P[3][2]) / 4;
      const Q = P.map(([x, z, y]) => {
        const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1;
        return [x - (dx / d) * 0.22 * k, z - (dz / d) * 0.22 * k, y];
      });
      const pull = petalPull(i);
      const pts: [number, number, number][] = Q.map(([x, z, y]) => [x, y, sd * z]);
      // A ridge down the petal's length: two long facets, one catching the light and one falling away from it.
      for (const [a2, b2] of [[0, 1], [3, 2]]) {
        const rx = (Q[a2][0] + Q[b2][0]) / 2, rz = Q[a2][1] + (Q[b2][1] - Q[a2][1]) * 0.42, ry = (Q[a2][2] + Q[b2][2]) / 2 + 0.7 * k;
        pts.push([rx, ry, sd * rz]);
      }
      pts.push([Q[0][0] - pull, petalBottom, sd * Q[0][1]], [Q[1][0] - pull, i === 2 ? trackTop + 0.2 * k : petalBottom, sd * Q[1][1]], [Q[2][0], petalBottom, sd * Q[2][1]], [Q[3][0], petalBottom, sd * Q[3][1]]);
      add(hull(pts), i === 1 ? hullM : plateM);
      // A lens near the front, a red marker aft, a cyan cheekbone along the face's top.
      const lt = 0.3;
      const lxi = P[0][0] + (P[3][0] - P[0][0]) * lt, lxo = P[1][0] + (P[2][0] - P[1][0]) * lt;
      const lzi = P[0][1] + (P[3][1] - P[0][1]) * lt, lzo = P[1][1] + (P[2][1] - P[1][1]) * lt;
      const lyi = P[0][2] + (P[3][2] - P[0][2]) * lt, lyo = P[1][2] + (P[2][2] - P[1][2]) * lt;
      {
        const lx = lxi * 0.6 + lxo * 0.4, ly = lyi * 0.6 + lyo * 0.4 + 0.75 * k, lz = sd * (lzi * 0.6 + lzo * 0.4);
        add(box(1.5 * k, 0.5 * k, 1.1 * k, lx, ly - 0.15 * k, lz), darkM);
        add(box(1.1 * k, 0.2 * k, 0.75 * k, lx, ly + 0.12 * k, lz), i === 2 ? glowDim : glowM, false);
      }
      lamp(redM, 0.45 * k, P[2][0] + 1.4 * k, P[2][2] + 0.1 * k, sd * (P[2][1] - 0.6 * k));
      if (i === 0) bar(glowM, Q[0][0] - 0.25 * k, Q[0][2] - 0.55 * k, sd * (Q[0][1] + 0.3 * k), Q[1][0] - 0.25 * k, Q[1][2] - 0.55 * k, sd * (Q[1][1] - 0.3 * k), 0.26 * k);
      if (klass === 'dredge' && i < 2) wall(hazardM, Math.abs(P[1][1] - P[0][1]) * 0.85, Y(0.07), faceX(i, 0.5, Y(0.3)) + 0.05 * k, Y(0.3), sd * (P[0][1] + P[1][1]) / 2, 2);
      if (klass === 'bastion') {
        // Reactive bricks on the petals.
        for (let a = 0; a < 3; a++) {
          const ta = 0.18 + a * 0.24, x = P[0][0] + (P[3][0] - P[0][0]) * ta * 0.5 + (P[1][0] - P[0][0]) * 0.5, z = (P[0][1] + P[1][1]) / 2 + ((P[3][1] + P[2][1]) / 2 - (P[0][1] + P[1][1]) / 2) * ta;
          add(box(2.6 * k, 0.7 * k, 2.2 * k, x, (petalAt(x, z / hw) ?? cy) + 0.4 * k, sd * z), trimM);
        }
      }
    }
    // Light rising out of the seams: brightest at the hood's edge, dimmer outward.
    for (let j = 0; j < 2; j++) {
      const [ff, fw, fh] = SEAM_F[j], [bf, bw, bh] = SEAM_B[j];
      const a0 = 0.06, a1 = j === 0 ? 0.92 : 0.55;
      const at = (u: number): [number, number, number] => [X(ff + (bf - ff) * u), Y(fh + (bh - fh) * u) - 0.3 * k, Z(fw + (bw - fw) * u)];
      const p0 = at(a0), p1 = at(a1);
      bar(j === 0 ? glowM : glowDim, p0[0], p0[1], sd * p0[2], p1[0], p1[1], sd * p1[2], 0.2 * k);
    }
    // Headlights low on the face beside the grille, and the jaw's dark recess under them.
    for (const [y, r, t] of [[Y(0.24), 0.6, 0.25], [Y(0.31), 0.48, 0.5]] as const) {
      add(new THREE.CylinderGeometry(r * k, r * k, 0.4 * k, 10).rotateZ(Math.PI / 2).translate(faceX(0, t, y) + 0.12 * k, y, sd * Z(hoodW + (0.42 - hoodW) * t)), whiteM, false);
    }
    add(box(1.6 * k, Y(0.1), Z(0.4), X(0.035), Y(0.12), sd * Z(0.42)), darkM);
    // The shoulder: the side armour's front, a big facet sloping down from the deck to the front crawler, the petals
    // nested inside its edge; a light strip along its foot.
    const sf = 0.13, wEdge = 0.84 + ((0.585 - 0.84) * (sf - 0.085)) / (0.3 - 0.085), zo = hw + 0.35 * k;
    add(hull([
      [X(0.31), Y(1.0), sd * Z(0.585)], [X(0.31), Y(1.0), sd * (zo - 0.9 * k)], [X(0.31), Y(1.0) - 0.9 * k, sd * zo],
      [X(sf), Y(0.56), sd * Z(wEdge)], [X(sf), Y(0.56), sd * (zo - 0.6 * k)], [X(sf), Y(0.56) - 0.6 * k, sd * zo],
      [X(0.31), trackTop + 0.1 * k, sd * Z(0.585)], [X(0.31), trackTop + 0.1 * k, sd * zo], [X(sf), trackTop + 0.1 * k, sd * Z(wEdge)], [X(sf), trackTop + 0.1 * k, sd * zo],
    ]), hullM);
    bar(stripM, X(sf) - 0.6 * k, Y(0.53), sd * (zo + 0.08 * k), X(0.29), Y(0.96), sd * (zo + 0.08 * k), 0.36 * k);
    lamp(whiteM, 0.6 * k, X(sf) + 0.1 * k, Y(0.5), sd * Z(0.93));
  }
  const shoulderAt = (x: number, w: number): number | null => {
    if (x > X(0.13) || x < X(0.31)) return null;
    const t = (X(0.13) - x) / (X(0.13) - X(0.31));
    const f = 0.13 + 0.18 * t;
    const edge = 0.84 + ((0.585 - 0.84) * (f - 0.085)) / (0.3 - 0.085);
    return w >= edge ? Y(0.56) + (Y(1.0) - Y(0.56)) * t : null;
  };

  // ================================================================================== the shoulders
  // Missile pods where the bow meets the deck, the hatch boxes behind them with their amber lamps.
  for (const sd of sides) {
    const pods = cc >= 2 ? [[0.37, 0.52], [0.53, 0.66]] : [[0.37, 0.52]];
    for (const [w0, w1] of pods) {
      const x0 = X(0.275), x1 = X(0.215), y0 = (petalAt(x1, w0) ?? Y(0.9)) - 0.5 * k;
      add(chamfer(x0, x1, y0, y0 + 2.7 * k, sd < 0 ? -Z(w1) : Z(w0), sd < 0 ? -Z(w0) : Z(w1), 0.35 * k), darkM);
      wall(tubeM, Z(w1 - w0) * 0.9, 2.2 * k, x1 + 0.02 * k, y0 + 1.35 * k, sd * Z((w0 + w1) / 2), 2);
      lay(hatchM, (x1 - x0) * 0.5, Z(w1 - w0) * 0.6, (x0 + x1) / 2 - 0.6 * k, y0 + 2.7 * k, sd * Z((w0 + w1) / 2));
    }
    const hx0 = X(0.37), hx1 = X(0.3);
    add(chamfer(hx0, hx1, deckMid - 0.3 * k, deckMid + 1.7 * k, sd < 0 ? -Z(0.53) : Z(0.34), sd < 0 ? -Z(0.34) : Z(0.53), 0.3 * k), hullM);
    lay(hatchM, 3 * k, 2.6 * k, hx0 + 2.4 * k, deckMid + 1.7 * k, sd * Z(0.435));
    lamp(amberM, 0.55 * k, hx1 - 1.4 * k, deckMid + 1.9 * k, sd * Z(0.4));
    lamp(amberM, 0.45 * k, hx1 - 1.4 * k, deckMid + 1.9 * k, sd * Z(0.47));
  }

  // ================================================================================== the side armour
  // Tall bolted segments from the shoulder to the stern, the top's outer edge chamfered, a blue light strip along it
  // in two runs, the hull number amidships, ribbing on the aft part of the mid section, slotted vents on top, and at
  // the stern the armour slopes down over the sprockets.
  const sideTop = (x: number): number => {
    if (x > X(0.655)) return Y(1.0);
    const xs = X(0.91);
    if (x > xs) return Y(0.94);
    return Y(0.94) + (Y(0.66) - Y(0.94)) * Math.min(1, (xs - x) / (xs - xStern));
  };
  {
    const xs0 = X(0.31), xs1 = xStern - 0.2 * k, segL = 5.6 * k;
    const nSeg = Math.round((xs0 - xs1) / segL);
    for (const sd of sides) {
      const zo = sd * (hw + 0.35 * k), zi = sd * zBody;
      for (let i = 0; i < nSeg; i++) {
        const a = xs0 - ((xs0 - xs1) * i) / nSeg, b2 = xs0 - ((xs0 - xs1) * (i + 1)) / nSeg;
        const ta = sideTop(a - 0.01), tb = sideTop(b2 + 0.01);
        const ch = 0.9 * k, y0 = Y(0.25);
        add(hull([
          [a, ta, zi], [b2, tb, zi], [a, ta, zo - sd * ch], [b2, tb, zo - sd * ch], [a, ta - ch, zo], [b2, tb - ch, zo],
          [a, y0, zi], [b2, y0, zi], [a, y0, zo], [b2, y0, zo],
        ]), i % 3 === 1 ? plateM : hullM);
      }
      // The blue strips along the top's outer edge.
      for (const [f0, f1] of [[0.385, 0.51], [0.7, 0.89]]) {
        bar(stripM, X(f0), sideTop(X(f0)) - 0.42 * k, sd * (hw - 0.1 * k), X(f1), sideTop(X(f1)) - 0.42 * k, sd * (hw - 0.1 * k), 0.42 * k);
        bar(stripM, X(f0) - 1.5 * k, sideTop(X(f0)) + 0.02 * k, sd * (hw - 1.6 * k), X(f1) + 1.5 * k, sideTop(X(f1)) + 0.02 * k, sd * (hw - 1.6 * k), 0.22 * k);
      }
      // Raised panels and lockers on top, a shade apart from the armour under them.
      for (let i = 0; i < 11; i++) {
        const xa = X(0.33 + i * 0.054), xb2 = xa - 4.2 * k;
        if (xb2 < X(0.9)) break;
        const ty = sideTop(xa);
        if (i % 2 === 0) add(chamfer(xb2, xa, ty - 0.1 * k, ty + 0.3 * k, sd < 0 ? -Z(0.93) : Z(0.72), sd < 0 ? -Z(0.72) : Z(0.93), 0.15 * k), plateM);
        else add(box(1.4 * k, 0.7 * k, 1.8 * k, (xa + xb2) / 2, ty + 0.35 * k, sd * Z(0.7)), darkM);
      }
      // The hull number high on the side, amber lamps under it.
      wall(numM, 7 * k, 3.5 * k, X(0.43), Y(0.74), zo, sd);
      for (let i = 0; i < 3; i++) lamp(amberM, 0.35 * k, X(0.405) - i * 0.9 * k, Y(0.6), sd * (hw + 0.4 * k));
      // Ribbing on the aft part of the mid section.
      for (let x = X(0.5); x > X(0.645); x -= 1.25 * k) add(box(0.45 * k, Y(0.6), 0.3 * k, x, Y(0.62), sd * (hw + 0.48 * k)), trimM);
      // Slotted vents on top along the inner edge, lamps at the stern corners.
      for (const f of [0.36, 0.42, 0.48, 0.72, 0.78]) lay(ventM, 3 * k, 1.5 * k, X(f), sideTop(X(f)), sd * Z(0.66), Math.PI / 2);
      lamp(redM, 0.5 * k, xStern + 0.6 * k, Y(0.68), sd * Z(0.9));
      // Louvres on the sloped stern face.
      for (let i = 0; i < 4; i++) add(box(0.3 * k, 0.3 * k, Z(0.36), xStern - 0.2 * k, Y(0.42) + i * 1.1 * k, sd * Z(0.8)), darkM);
      if (cc >= 3) {
        // Add-on armour along the lower edge.
        for (let i = 0; i < 6; i++) add(chamfer(X(0.34 + i * 0.1), X(0.34 + i * 0.1) + 8.6 * k, Y(0.27), Y(0.43), sd < 0 ? -hw - 0.95 * k : hw + 0.2 * k, sd < 0 ? -hw - 0.2 * k : hw + 0.95 * k, 0.25 * k), trimM);
      }
      if (klass === 'bastion') {
        // Slab armour hung on the sides.
        for (let i = 0; i < 5; i++) add(chamfer(X(0.33 + i * 0.12), X(0.33 + i * 0.12) + 10.6 * k, Y(0.48), Y(0.86), sd < 0 ? -hw - 1.4 * k : hw + 0.3 * k, sd < 0 ? -hw - 0.3 * k : hw + 1.4 * k, 0.4 * k), plateM);
      }
      if (klass === 'nightrunner') {
        // Raked fins along the armour.
        for (let i = 0; i < 5; i++) {
          const x = X(0.36 + i * 0.11), y = sideTop(x);
          add(hull([[x, y, sd * Z(0.86)], [x - 7 * k, y, sd * Z(0.86)], [x - 6 * k, y + 3.2 * k, sd * Z(0.9)], [x, y, sd * Z(0.9)], [x - 7 * k, y, sd * Z(0.9)]]), darkM);
        }
      }
    }
  }

  // ================================================================================== the superstructure
  // The long hexagonal command block: its nose sloping down toward the bow, the main battery on its top, the hull
  // number either side of the turret ring, hatches and lamps, the sensor cupola with its lit windows aft.
  const superTop = Y(klass === 'nightrunner' ? 1.18 : 1.24);
  const SUP: [number, number][] = [[X(0.35), -Z(0.11)], [X(0.35), Z(0.11)], [X(0.45), Z(0.43)], [X(0.66), Z(0.43)], [X(0.685), Z(0.3)], [X(0.685), -Z(0.3)], [X(0.66), -Z(0.43)], [X(0.45), -Z(0.43)]];
  {
    const top = inset(SUP, 1.3 * k);
    const pts: [number, number, number][] = [];
    for (const [x, z] of SUP) pts.push([x, deckMid - 0.4 * k, z], [x, x > X(0.4) ? Y(1.08) : superTop - 1.3 * k, z]);
    for (const [x, z] of top) pts.push([x > X(0.4) ? x - 2.2 * k : x, x > X(0.4) ? Y(1.1) : superTop, z]);
    pts.push([X(0.43), superTop, -Z(0.36)], [X(0.43), superTop, Z(0.36)]);
    add(hull(pts), plateM);
    for (const sd of sides) {
      // Lit edge along the top of each flank.
      bar(glowDim, X(0.47), superTop - 1.45 * k, sd * (Z(0.43) + 0.05 * k), X(0.64), superTop - 1.45 * k, sd * (Z(0.43) + 0.05 * k), 0.25 * k);
      lay(numM, 6.8 * k, 3.4 * k, X(0.47), superTop, sd * Z(0.335), sd > 0 ? 0 : Math.PI);
      lay(hatchM, 2.4 * k, 2.4 * k, X(0.55), superTop, sd * Z(0.3));
      lay(hatchM, 2 * k, 2 * k, X(0.405), Y(1.1) + (superTop - Y(1.1)) * 0.6, sd * Z(0.2));
      lamp(redM, 0.45 * k, X(0.52), superTop + 0.2 * k, sd * Z(0.38));
      lamp(redM, 0.45 * k, X(0.6), superTop + 0.2 * k, sd * Z(0.38));
      lamp(amberM, 0.35 * k, X(0.44), Y(1.18), sd * Z(0.28));
    }
    for (const sd of sides) {
      add(chamfer(X(0.4), X(0.375), Y(1.1) + 0.3 * k, Y(1.1) + 1.5 * k, sd < 0 ? -Z(0.14) : Z(0.04), sd < 0 ? -Z(0.04) : Z(0.14), 0.2 * k), darkM);
      add(chamfer(X(0.66), X(0.645), superTop - 0.4 * k, superTop + 1.1 * k, sd < 0 ? -Z(0.36) : Z(0.22), sd < 0 ? -Z(0.22) : Z(0.36), 0.2 * k), plateM);
    }
    // The sensor cupola.
    const cx0 = X(0.638), cx1 = X(0.565), cw = Z(0.19);
    add(chamfer(cx0, cx1, superTop - 0.2 * k, superTop + 2.3 * k, -cw, cw, 0.5 * k), plateM);
    for (const sd of sides) add(box((cx1 - cx0) * 0.7, 0.55 * k, 0.2 * k, (cx0 + cx1) / 2, superTop + 1.3 * k, sd * (cw + 0.05 * k)), glowM, false);
    add(box(0.2 * k, 0.55 * k, cw * 1.4, cx1 + 0.05 * k, superTop + 1.3 * k, 0), glowM, false);
    lay(meshM, (cx1 - cx0) * 0.5, cw * 1.1, (cx0 + cx1) / 2 - 0.6 * k, superTop + 2.3 * k, 0);
    add(new THREE.CylinderGeometry(0.12 * k, 0.16 * k, 6 * k, 5).translate(cx0 + 1.2 * k, superTop + 5.3 * k, -cw * 0.6), trimM);
    lamp(redM, 0.4 * k, cx0 + 1.2 * k, superTop + 8.4 * k, -cw * 0.6);
    if (cc >= 4) {
      const r = new THREE.Group();
      r.position.set((cx0 + cx1) / 2, superTop + 2.3 * k, cw * 0.4);
      r.add(mesh(new THREE.CylinderGeometry(0.3 * k, 0.4 * k, 1.6 * k, 6).translate(0, 0.8 * k, 0), trimM));
      r.add(mesh(new THREE.BoxGeometry(0.5 * k, 1.1 * k, 6.4 * k).translate(0, 2 * k, 0), darkM));
      r.add(mesh(new THREE.BoxGeometry(0.2 * k, 0.8 * k, 5.6 * k).translate(0.35 * k, 2 * k, 0), glowDim, false));
      root.add(r);
      rig.radar = r;
    }
    if (cc >= 5) {
      for (const sd of sides) {
        add(new THREE.CylinderGeometry(0.1 * k, 0.14 * k, 8 * k, 5).translate(X(0.6), superTop + 4 * k, sd * Z(0.36)), trimM);
        add(box(1.4 * k, 1 * k, 1.6 * k, X(0.455), Y(1.12) + 0.5 * k, sd * Z(0.24)), darkM);
        lamp(whiteM, 0.6 * k, X(0.455) + 0.75 * k, Y(1.12) + 0.5 * k, sd * Z(0.24));
      }
    }
  }
  const inSuper = (x: number, z: number): boolean => {
    const n = SUP.length;
    for (let i = 0; i < n; i++) {
      const a = SUP[i], b = SUP[(i + 1) % n];
      if ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
    }
    return true;
  };

  // ================================================================================== the engine deck
  // The ribbed grille, the mesh vent, the "07" block at the stern with its number, equipment boxes either side, the
  // stern fins reaching back past the hull.
  const g07 = { x0: X(0.98), x1: X(0.884), w: Z(0.28), top: Y(1.07) };
  const extraBattery = o.mounts.filter((m) => m.main && m.x < X(0.66));
  {
    const gx0 = X(0.85), gx1 = X(0.73);
    const rearGun = extraBattery.some((m) => m.x > gx0 - 4 * k && m.x < gx1 + 4 * k);
    if (klass === 'ark') {
      // Glasshouse domes on the Ark's science deck.
      const domeM = new THREE.MeshStandardMaterial({ color: '#7ad8a8', emissive: '#1d6a46', transparent: true, opacity: 0.8, metalness: 0.2, roughness: 0.15 });
      add(chamfer(gx0, gx1, deckRear - 0.2 * k, deckRear + 1.2 * k, -Z(0.4), Z(0.4), 0.4 * k), hullM);
      for (const [x, z] of [[X(0.76), -Z(0.2)], [X(0.76), Z(0.2)], [X(0.82), 0]] as const) add(new THREE.SphereGeometry(3.6 * k, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, deckRear + 1.2 * k, z), domeM);
    } else if (!rearGun) {
      add(chamfer(gx0, gx1, deckRear - 0.2 * k, deckRear + 0.9 * k, -Z(0.25), Z(0.25), 0.3 * k), trimM);
      lay(ribM, Z(0.5) - 1.2 * k, gx1 - gx0 - 1.2 * k, (gx0 + gx1) / 2, deckRear + 0.9 * k, 0, Math.PI / 2);
    }
    add(chamfer(X(0.877), X(0.852), deckRear - 0.2 * k, deckRear + 0.6 * k, -Z(0.17), Z(0.17), 0.2 * k), darkM);
    lay(meshM, X(0.852) - X(0.877) - 0.4 * k, Z(0.34) - 0.4 * k, (X(0.877) + X(0.852)) / 2, deckRear + 0.6 * k, 0);
    // The 07 block.
    add(chamfer(g07.x0, g07.x1, deckRear - 0.2 * k, g07.top, -g07.w, g07.w, 0.7 * k), plateM);
    lay(numM, 7.8 * k, 3.9 * k, (g07.x0 + g07.x1) / 2, g07.top, 0, Math.PI / 2);
    for (const sd of sides) {
      add(chamfer(X(0.97), X(0.89), deckRear - 0.2 * k, Y(0.99), sd < 0 ? -Z(0.55) : Z(0.32), sd < 0 ? -Z(0.32) : Z(0.55), 0.4 * k), hullM);
      for (let i = 0; i < 3; i++) lamp(redM, 0.35 * k, X(0.97) - 0.2 * k, Y(0.97) - 0.5 * k, sd * Z(0.36 + i * 0.07));
      lay(ventM, 3.4 * k, 1.6 * k, X(0.93), Y(0.99), sd * Z(0.435), Math.PI / 2);
      // The fin: a long beam on the armour's inner edge, rising aft, reaching past the stern.
      const fz0 = Z(0.545), fz1 = Z(0.68), fa = X(0.86), fb = X(1.028);
      add(hull([
        [fa, Y(0.92), sd * fz0], [fa, Y(0.92), sd * fz1], [fa, Y(0.98), sd * fz0], [fa, Y(0.98), sd * fz1],
        [fb, Y(0.93), sd * fz0], [fb, Y(0.93), sd * fz1], [fb, Y(1.03), sd * fz0], [fb, Y(1.03), sd * fz1],
        [fb - 1.6 * k, Y(1.0), sd * (fz0 + fz1) / 2],
      ]), plateM);
      lamp(redM, 0.45 * k, fb + 0.3 * k, Y(1.0), sd * (fz0 + fz1) / 2);
    }
  }
  // Barbettes under any battery on the engine deck.
  const barbettes = extraBattery.map((m) => ({ x: m.x, hl: 6.5 * k, hz: Z(0.34), top: Y(1.08) }));
  for (const b of barbettes) {
    add(prism([[b.x + b.hl, -b.hz * 0.6], [b.x + b.hl, b.hz * 0.6], [b.x + b.hl * 0.6, b.hz], [b.x - b.hl * 0.7, b.hz], [b.x - b.hl, b.hz * 0.6], [b.x - b.hl, -b.hz * 0.6], [b.x - b.hl * 0.7, -b.hz], [b.x + b.hl * 0.6, -b.hz]], deckRear - 0.3 * k, b.top, 0.9 * k), hullM);
    for (const sd of sides) bar(glowDim, b.x + b.hl * 0.5, b.top - 1.1 * k, sd * (b.hz + 0.05 * k), b.x - b.hl * 0.6, b.top - 1.1 * k, sd * (b.hz + 0.05 * k), 0.22 * k);
  }

  // ================================================================================== the stern plate
  // The "07" panel, four exhaust nozzles glowing in it (their flames), the red lamps along the top, the tow hooks.
  {
    const xs = xStern;
    add(box(0.3 * k, Y(0.24), Z(0.34), xs - 0.1 * k, Y(0.47), 0), darkM);
    wall(numM, 6.4 * k, 3.2 * k, xs - 0.26 * k, Y(0.47), 0, -2);
    for (const sd of sides) {
      for (const y of [Y(0.38), Y(0.56)]) {
        const z = sd * Z(0.3);
        add(new THREE.CylinderGeometry(1.25 * k, 1.4 * k, 1.8 * k, 14).rotateZ(Math.PI / 2).translate(xs - 0.9 * k, y, z), darkM);
        add(new THREE.TorusGeometry(1.2 * k, 0.16 * k, 6, 16).rotateY(Math.PI / 2).translate(xs - 1.82 * k, y, z), trimM);
        add(new THREE.CylinderGeometry(0.95 * k, 0.95 * k, 0.1 * k, 14).rotateZ(Math.PI / 2).translate(xs - 1.6 * k, y, z), rearM, false);
        const f = new THREE.Group();
        f.position.set(xs - 1.9 * k, y, z);
        f.rotation.z = Math.PI / 2;
        f.add(mesh(new THREE.ConeGeometry(0.95 * k, 5 * k, 10).translate(0, 2.5 * k, 0), new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }), false));
        f.add(mesh(new THREE.ConeGeometry(0.5 * k, 3.2 * k, 8).translate(0, 1.6 * k, 0), new THREE.MeshBasicMaterial({ color: '#fff0b0', toneMapped: false }), false));
        root.add(f);
        rig.flames.push(f);
      }
      for (let i = 0; i < 3; i++) lamp(redM, 0.45 * k, xs - 0.25 * k, Y(0.8), sd * Z(0.2 + i * 0.07));
      add(box(1.2 * k, 1.2 * k, 1.6 * k, xs - 0.5 * k, Y(0.27), sd * Z(0.12)), trimM);
    }
  }

  // ================================================================================== the toroid housings
  // Four fan housings sunk in the decks (the front pair beside the superstructure, the rear pair beside the grille):
  // a dark well, a rim, the fan, and the core glowing with its push.
  for (const [fx, sd, r] of [[0.6, -1, 1.45], [0.6, 1, 1.45], [0.79, -1, 2.2], [0.79, 1, 2.2]] as const) {
    const x = X(fx), z = sd * (fx < 0.7 ? Z(0.51) : Z(0.41)), y = fx < 0.7 ? deckMid : deckRear, rr = r * k;
    add(new THREE.CylinderGeometry(rr, rr, 0.5 * k, 18).translate(x, y + 0.05 * k, z), darkM);
    add(new THREE.TorusGeometry(rr, 0.2 * k, 5, 22).rotateX(Math.PI / 2).translate(x, y + 0.32 * k, z), trimM);
    const coreM = basic(look.glow);
    add(new THREE.CylinderGeometry(rr * 0.32, rr * 0.32, 0.4 * k, 12).translate(x, y + 0.35 * k, z), coreM, false);
    rig.cores.push(coreM);
    const fan = new THREE.Group();
    fan.position.set(x, y + 0.45 * k, z);
    fan.add(mesh(mergeGeometries([0, 1, 2].map((i) => new THREE.BoxGeometry(rr * 1.85, 0.12 * k, 0.45 * k).rotateY((i * Math.PI) / 3)), false)!, trimM, false));
    root.add(fan);
    rig.fans.push(fan);
  }

  // ================================================================================== class and refit extras
  if (klass === 'dredge') {
    // The Dredge's dozer blade across the nose, and a crane on the engine deck.
    add(hull([
      [xn + 1.2 * k, 0.4 * k, -hw * 0.98], [xn + 1.2 * k, 0.4 * k, hw * 0.98], [xn + 4.4 * k, 0.4 * k, -hw * 0.94], [xn + 4.4 * k, 0.4 * k, hw * 0.94],
      [xn + 1.6 * k, Y(0.44), -hw * 0.98], [xn + 1.6 * k, Y(0.44), hw * 0.98], [xn + 2.8 * k, Y(0.46), -hw * 0.94], [xn + 2.8 * k, Y(0.46), hw * 0.94],
    ]), trimM);
    wall(hazardM, hw * 1.8, Y(0.08), xn + 2.9 * k, Y(0.4), 0, 2);
    for (const sd of sides) add(box(5 * k, 1 * k, 1 * k, xn - 1 * k, Y(0.3), sd * Z(0.5)), darkM);
    add(box(1.6 * k, 10 * k, 1.6 * k, X(0.68), deckRear + 5 * k, Z(0.3)), trimM);
    add(new THREE.BoxGeometry(16 * k, 1.1 * k, 1.1 * k).rotateZ(-0.28).translate(X(0.68) + 7 * k, deckRear + 11 * k, Z(0.3)), trimM);
    lamp(amberM, 0.6 * k, X(0.68), deckRear + 10.4 * k, Z(0.3));
  } else if (cc >= 6) {
    // A ram of spikes across the nose at Mk VI.
    for (let i = -3; i <= 3; i++) add(hull([[xn - 0.5 * k, Y(0.15), i * Z(0.12) - 1.2 * k], [xn - 0.5 * k, Y(0.15), i * Z(0.12) + 1.2 * k], [xn - 0.5 * k, Y(0.4), i * Z(0.12)], [xn + 5 * k, Y(0.26), i * Z(0.12)]]), trimM);
  }

  // ================================================================================== roof props from the deck plan
  for (const p of o.props) {
    if (p.key === 'armor') continue;
    const y = roofHeight(p.x, p.z);
    if (p.key === 'pad') {
      // An empty weapon pad: its ring waiting for a gun.
      add(new THREE.CylinderGeometry(2.1 * k, 2.3 * k, 0.35 * k, 8).translate(p.x, y + 0.17 * k, p.z), hullM);
      add(new THREE.TorusGeometry(1.5 * k, 0.12 * k, 4, 16).rotateX(Math.PI / 2).translate(p.x, y + 0.36 * k, p.z), darkM);
    } else if (p.key === 'radar' || p.key === 'sensor') {
      const r = new THREE.Group();
      r.position.set(p.x, y, p.z);
      r.add(mesh(new THREE.CylinderGeometry(0.4 * k, 0.6 * k, 2.4 * k, 6).translate(0, 1.2 * k, 0), trimM));
      r.add(mesh(new THREE.SphereGeometry(2.2 * k, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 2.8 * k, 0.4 * k), new THREE.MeshStandardMaterial({ color: '#aab2bc', metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide })));
      root.add(r);
      if (!rig.radar) rig.radar = r;
    } else if (p.key.startsWith('nest')) {
      // A sandbagged ring with a firing step.
      const r = Math.min(p.w, p.d) * 0.42;
      const ring = new THREE.Shape();
      ring.absarc(0, 0, r, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, r * 0.72, 0, Math.PI * 2, true);
      ring.holes.push(hole);
      add(planarUV(new THREE.ExtrudeGeometry(ring, { depth: 1.1 * k, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2).translate(p.x, y, p.z)), hullM);
      add(new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.15 * k, 8).translate(p.x, y + 0.1 * k, p.z), trimM);
    } else if (p.key === 'helipad') {
      add(new THREE.CylinderGeometry(Math.min(p.w, p.d) * 0.48, Math.min(p.w, p.d) * 0.5, 0.4 * k, 20).translate(p.x, y + 0.2 * k, p.z), darkM);
      add(new THREE.TorusGeometry(Math.min(p.w, p.d) * 0.4, 0.15 * k, 4, 24).rotateX(Math.PI / 2).translate(p.x, y + 0.45 * k, p.z), basic('#ffcc30'), false);
    } else if (p.key.includes('tesla') || p.key.includes('coil')) {
      add(new THREE.CylinderGeometry(0.5 * k, 1 * k, 4 * k, 8).translate(p.x, y + 2 * k, p.z), trimM);
      add(new THREE.TorusGeometry(0.8 * k, 0.15 * k, 4, 12).rotateX(Math.PI / 2).translate(p.x, y + 3.2 * k, p.z), trimM);
      add(new THREE.SphereGeometry(1 * k, 8, 6).translate(p.x, y + 4.4 * k, p.z), glowM, false);
    } else if (p.key === 'shield') {
      add(new THREE.CylinderGeometry(1.6 * k, 2 * k, 1.4 * k, 10).translate(p.x, y + 0.7 * k, p.z), plateM);
      add(new THREE.SphereGeometry(1.2 * k, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(p.x, y + 1.4 * k, p.z), glowDim, false);
    } else {
      // Anything else: a housing with a hatch.
      const w = Math.max(1.5 * k, p.w - k), d = Math.max(1.5 * k, p.d - k);
      add(chamfer(p.x - w / 2, p.x + w / 2, y, y + 1.6 * k, p.z - d / 2, p.z + d / 2, 0.3 * k), plateM);
      lay(hatchM, w * 0.5, d * 0.5, p.x, y + 1.6 * k, p.z);
    }
  }

  // ================================================================================== the guns
  for (const m of o.mounts) rig.turrets.set(m.id, turret(root, m, roofHeight(m.x, m.z), k, { trimM, darkM, plateM, hullM, glowM, redM }, lines));

  /** How high the roof stands at a local point: what a turret, a prop or a climbing creature stands on. */
  function roofHeight(x: number, z: number): number {
    const az = Math.abs(z), w = az / hw;
    for (const b of barbettes) if (Math.abs(x - b.x) < b.hl && az < b.hz) return b.top;
    if (inSuper(x, z)) return x > X(0.4) ? Y(1.1) : superTop;
    if (x > X(0.31)) {
      // The bow: the hood, a petal, the shoulder, or out on the front crawlers.
      if (w < hoodW) return x > X(0.28) ? hoodH(x) + (az < ribW ? 0.5 * k : 0) : deckMid;
      const pa = petalAt(x, w);
      if (pa !== null) return pa;
      const sh = shoulderAt(x, w);
      if (sh !== null) return sh;
      if (w >= 0.86 && x > X(0.082)) return trackTop + 1.6 * k;
      if (w >= 0.66) return trackTop;
      return x < X(0.26) ? deckMid : Y(0.3);
    }
    if (w >= 0.585) return sideTop(x);
    if (x < g07.x1 && x > g07.x0 && az < g07.w) return g07.top;
    return x < xMidAft ? deckRear : deckMid;
  }
  rig.roofAt = roofHeight;
  return rig;
}

interface TurretMats {
  trimM: THREE.Material;
  darkM: THREE.Material;
  plateM: THREE.Material;
  hullM: THREE.Material;
  glowM: THREE.Material;
  redM: THREE.Material;
}

/**
 * A gun on its ring: an octagonal armoured housing, its front cut back to a mantlet, the barrels by its family with a
 * red ranging laser ahead of them, a hatch and a periscope on top, the rarity colour on its back. The main battery is
 * the sheet's great twin-barrelled turret.
 */
function turret(root: THREE.Group, m: BuildOpts['mounts'][number], y: number, k: number, M: TurretMats, lines: THREE.LineBasicMaterial): TurretRig {
  const s = (m.main ? 2.1 : m.size === 'heavy' ? 1.25 : m.size === 'medium' ? 0.95 : 0.72) * k;
  const base = new THREE.Group();
  base.position.set(m.x, y, m.z);
  base.add(mesh(new THREE.CylinderGeometry(2.3 * s, 2.5 * s, 0.5 * s, 16).translate(0, 0.25 * s, 0), M.darkM));
  root.add(base);
  if (m.main) {
    // The barbette collar the battery turns in.
    const c8: [number, number][] = [];
    for (let i = 0; i < 8; i++) c8.push([Math.cos((i / 8) * Math.PI * 2 + Math.PI / 8) * 3.05 * s, Math.sin((i / 8) * Math.PI * 2 + Math.PI / 8) * 3.05 * s]);
    base.add(mesh(prism(c8, -0.3 * s, 0.32 * s, 0.18 * s), M.hullM));
  }
  const yaw = new THREE.Group();
  yaw.position.y = 0.5 * s;
  base.add(yaw);
  const H = 1.35 * s;
  const poly: [number, number][] = [[2.6, -1.1], [2.6, 1.1], [1.6, 2.1], [-1.9, 2.25], [-2.7, 1.4], [-2.7, -1.4], [-1.9, -2.25], [1.6, -2.1]];
  yaw.add(mesh(prism(poly.map(([x, z]) => [x * s, z * s] as [number, number]), 0, H, 0.38 * s), m.main ? M.plateM : M.hullM));
  // The mantlet across the front, a hatch and a periscope on top, side bins, a lamp in the gun's colour behind.
  yaw.add(mesh(new THREE.BoxGeometry(0.9 * s, 0.85 * H, 2.4 * s).translate(2.7 * s, H * 0.48, 0), M.darkM));
  yaw.add(mesh(new THREE.CylinderGeometry(0.55 * s, 0.6 * s, 0.35 * s, 10).translate(-0.8 * s, H + 0.17 * s, -0.95 * s), M.trimM));
  yaw.add(mesh(new THREE.BoxGeometry(0.5 * s, 0.4 * s, 0.4 * s).translate(0.3 * s, H + 0.2 * s, 1.0 * s), M.darkM));
  for (const sd of [-1, 1]) yaw.add(mesh(new THREE.BoxGeometry(2.2 * s, 0.6 * H, 0.35 * s).translate(-0.6 * s, H * 0.45, sd * 2.3 * s), M.darkM));
  yaw.add(mesh(new THREE.BoxGeometry(0.3 * s, 0.3 * s, 0.3 * s).translate(-2.55 * s, H * 0.7, 0), new THREE.MeshBasicMaterial({ color: m.color, toneMapped: false }), false));
  if (m.main) {
    yaw.add(mesh(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 3.4 * s, 4).translate(-2.1 * s, H + 1.7 * s, 1.4 * s), M.trimM));
    yaw.add(mesh(new THREE.BoxGeometry(0.25 * s, 0.25 * s, 0.25 * s).translate(-2.1 * s, H + 3.4 * s, 1.4 * s), M.redM, false));
  }
  const barrels: THREE.Object3D[] = [];
  const reach = m.reach;
  const fam = m.fam;
  const laser = new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false });
  if (fam === 'missile' || fam === 'mortar') {
    const b = new THREE.Group();
    if (fam === 'missile') {
      b.add(mesh(new THREE.BoxGeometry(2.6 * s, 1.3 * s, 3 * s).translate(0.4 * s, H + 0.65 * s, 0), M.darkM));
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) b.add(mesh(new THREE.BoxGeometry(0.15 * s, 0.32 * s, 0.32 * s).translate(1.72 * s, H + 0.36 * s + j * 0.55 * s, -1.05 * s + i * 0.7 * s), M.redM, false));
    } else {
      b.add(mesh(new THREE.CylinderGeometry(0.75 * s, 0.85 * s, 3 * s, 10).rotateZ(-0.9).translate(1 * s, H + 1 * s, 0), M.darkM));
    }
    yaw.add(b);
    barrels.push(b);
  } else {
    const pair = m.main || fam === 'cannon' || fam === 'mg' || fam === 'rail';
    const offs = m.main ? [-0.62, 0.62] : pair ? [-0.42, 0.42] : [0];
    for (const oz of offs) {
      const b = new THREE.Group();
      b.position.set(2.9 * s, H * 0.5, oz * s);
      const r = fam === 'energy' || fam === 'tesla' || m.main ? 0.3 * s : 0.22 * s;
      const len = Math.max(2 * k, reach - 2.9 * s);
      const sleeve = Math.min(len * 0.25, 3.4 * s);
      b.add(mesh(new THREE.CylinderGeometry(r * 1.6, r * 1.6, sleeve, 10).rotateZ(-Math.PI / 2).translate(sleeve / 2, 0, 0), M.darkM));
      b.add(mesh(new THREE.CylinderGeometry(r, r * 1.12, len, 10).rotateZ(-Math.PI / 2).translate(len / 2, 0, 0), M.trimM));
      if (m.main) for (let x = len * 0.35; x < len * 0.85; x += len * 0.22) b.add(mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.3, 0.5 * s, 10).rotateZ(-Math.PI / 2).translate(x, 0, 0), M.darkM));
      if (fam === 'energy' || fam === 'tesla' || fam === 'rail') b.add(mesh(new THREE.CylinderGeometry(r * 1.4, r * 1.4, 0.6 * s, 10).rotateZ(-Math.PI / 2).translate(len - 0.2 * k, 0, 0), M.glowM, false));
      else b.add(mesh(new THREE.BoxGeometry(1 * s, r * 2.6, r * 2.6).translate(len - 0.4 * s, 0, 0), M.darkM));
      // The ranging laser, out ahead of the muzzle.
      b.add(mesh(new THREE.BoxGeometry(9 * k, 0.12 * k, 0.12 * k).translate(len + 4.5 * k, r * 1.3, 0), laser, false));
      yaw.add(b);
      barrels.push(b);
    }
  }
  for (const g of [base, yaw, ...barrels]) mergeChildren(g, lines);
  return { id: m.id, yaw, barrels, reach, heavy: m.main || m.size === 'heavy' };
}

/** Merges a group's own meshes by material (its sub-groups left alone), outlining the solid ones. */
function mergeChildren(g: THREE.Object3D, lines: THREE.LineBasicMaterial): void {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const drop: THREE.Mesh[] = [];
  for (const ch of g.children) {
    if (!(ch instanceof THREE.Mesh) || Array.isArray(ch.material)) continue;
    ch.updateMatrix();
    const geo = (ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone()).applyMatrix4(ch.matrix);
    for (const key of Object.keys(geo.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'uv') geo.deleteAttribute(key);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const list = byMat.get(ch.material) ?? [];
    list.push(geo);
    byMat.set(ch.material, list);
    drop.push(ch);
  }
  for (const d of drop) g.remove(d);
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const basicMat = mat instanceof THREE.MeshBasicMaterial;
    const me = mesh(merged, mat, !basicMat);
    if (!basicMat) me.add(new THREE.LineSegments(new THREE.EdgesGeometry(merged, 30), lines));
    g.add(me);
  }
}

/** Merges a group's static meshes by material (fewer draw calls), animated parts left as they are, and outlines the
 *  merged hull: a dark line along every crease, the way the sheet's pixel art draws each plate. */
export function compact(rig: ShipRig): void {
  const keep = new Set<THREE.Object3D>([...rig.wheels.flat(), ...rig.fans, ...rig.flames, ...[...rig.turrets.values()].map((t) => t.yaw.parent!), ...(rig.radar ? [rig.radar] : [])]);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const drop: THREE.Mesh[] = [];
  for (const ch of rig.root.children) {
    if (keep.has(ch) || !(ch instanceof THREE.Mesh) || Array.isArray(ch.material)) continue;
    ch.updateMatrix();
    const mat = ch.material as THREE.Material;
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
    const sm = mat as THREE.MeshStandardMaterial;
    const rolling = !!sm.map && (sm.map.userData.k !== undefined || rig.wheelFaces.some((f) => f.tex === sm.map));
    if (!(mat instanceof THREE.MeshBasicMaterial) && !sm.polygonOffset && !sm.transparent && !rolling) me.add(new THREE.LineSegments(new THREE.EdgesGeometry(merged, 28), rig.lines));
  }
}
