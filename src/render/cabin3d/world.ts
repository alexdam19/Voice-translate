import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CH, OBS, TER, ZONE, type Building, type GameMap } from '../../shared/map';
import { BLOCK, crownName, groundLevel, SHARP, Terrain2D, type Ground3D } from '../px/terrain2d';
import { hash2 } from '../px/pixels';
import { facadeTex, roofTex, type Facade, type Roof } from './textures';

/**
 * The world around the Titan in 3D, for the view out of the cab: the Crater's ground in 128 m blocks streamed
 * round the camera. The nearest ones are built in full, the rest drawn as textured relief out to the haze:
 *
 *  - the ground rolls in real hills, rock outcrops and cliffs rise out of it to their height (strata on the steep
 *    faces), and water, acid and lava lie in their beds with a surface that catches the sun;
 *  - buildings are solid: houses and barns with walls, windows, doors and pitched roofs, halls and shops flat-roofed,
 *    towers, chimneys and silos round; ruins, and anything crushed, stand as the broken walls that are left;
 *  - trees in their woods (broadleaf, birch and autumn in the green country, pines elsewhere, snowed-on in the
 *    frost), boulders in the stone of their country, crystal spires, giant fungi, and the props (wrecked cars,
 *    barrels, bones and skulls, pipes, signs, cacti...).
 */

const NEAR = 2;
const FAR = 6;

interface Block3D {
  bx: number;
  by: number;
  near: boolean;
  group: THREE.Group;
  /** Crush edits seen when built. */
  stale: boolean;
}

const key = (bx: number, by: number): number => by * 4096 + bx;

/* ------------------------------------------------------------------ */
/* Shared geometry and materials                                       */
/* ------------------------------------------------------------------ */

function jitter(g: THREE.BufferGeometry, amt: number, seed: number, flatBottom = false): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (hash2(Math.round(x * 97 + z * 13), Math.round(y * 89), seed) - 0.5) * amt;
    p.setXYZ(i, x * k, flatBottom && y < -0.2 ? y * 0.4 : y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

const GEO = {
  trunk: (() => {
    const g = new THREE.CylinderGeometry(0.1, 0.18, 1, 6, 1);
    g.translate(0, 0.5, 0);
    return g;
  })(),
  broadleaf: (() => {
    const parts = [0, 1, 2, 3].map((i) => {
      const g = jitter(new THREE.IcosahedronGeometry(1, 2), 0.35, i + 3);
      const a = (i / 4) * Math.PI * 2;
      const s = i === 0 ? 0.75 : 0.55;
      g.scale(s, s * 0.85, s);
      g.translate(i === 0 ? 0 : Math.cos(a) * 0.45, i === 0 ? 0.25 : 0, i === 0 ? 0 : Math.sin(a) * 0.45);
      return g;
    });
    const m = mergeGeometries(parts)!;
    m.computeVertexNormals();
    return m;
  })(),
  pine: (() => {
    const parts = [0, 1, 2, 3].map((i) => {
      const g = new THREE.ConeGeometry(0.62 - i * 0.12, 0.45, 8, 1);
      g.translate(0, 0.22 + i * 0.22, 0);
      return g;
    });
    return mergeGeometries(parts)!;
  })(),
  bush: jitter(new THREE.IcosahedronGeometry(1, 1), 0.4, 5, true),
  rock: jitter(new THREE.IcosahedronGeometry(1, 1), 0.55, 7, true),
  spire: (() => {
    const g = new THREE.ConeGeometry(0.5, 1, 5, 1);
    g.translate(0, 0.5, 0);
    return g;
  })(),
  box: (() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    return g;
  })(),
  cyl: (() => {
    const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1);
    g.translate(0, 0.5, 0);
    return g;
  })(),
  cap: (() => {
    const g = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    return g;
  })(),
};

/** Paints a piece of a prop one colour (props carry vertex colours: dark eye sockets on a skull, rust on a wreck). */
function paint(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const W_ = '#ffffff';

/** Props as small models: [geometry, colour, size (w, h, d) at scale 1]. */
const PROP3D: Record<string, { g: () => THREE.BufferGeometry; c: string; m?: 'metal' | 'bone' | 'glow' }> = {
  barrel: { g: () => new THREE.CylinderGeometry(0.35, 0.35, 0.95, 10).translate(0, 0.47, 0), c: '#a8551e', m: 'metal' },
  crate: { g: () => new THREE.BoxGeometry(1, 0.9, 1).translate(0, 0.45, 0), c: '#8a6434' },
  sign: { g: () => mergeGeometries([new THREE.BoxGeometry(0.12, 2.2, 0.12).translate(0, 1.1, 0), new THREE.BoxGeometry(1.4, 0.8, 0.08).translate(0, 1.9, 0)])!, c: '#9a7a4a' },
  wreckcar: {
    // A burnt-out car on its rims: body, cabin, dark empty windows, wheels.
    g: () => mergeGeometries([
      paint(new THREE.BoxGeometry(4.2, 0.7, 1.8).translate(0, 0.55, 0), W_),
      paint(new THREE.BoxGeometry(2.1, 0.7, 1.62).translate(-0.3, 1.25, 0), W_),
      paint(new THREE.BoxGeometry(2.14, 0.45, 1.5).translate(-0.3, 1.28, 0), '#141210'),
      paint(new THREE.BoxGeometry(0.1, 0.4, 1.4).translate(0.8, 1.25, 0), '#1a1816'),
      ...[[1.35, -0.85], [1.35, 0.85], [-1.35, -0.85], [-1.35, 0.85]].map(([x, z]) => paint(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12).rotateX(Math.PI / 2).translate(x, 0.3, z), '#262422')),
    ])!,
    c: '#7a4a32', m: 'metal',
  },
  bones: {
    // A ribcage arching out of the sand, and a long bone.
    g: () => mergeGeometries([
      ...[0, 1, 2, 3, 4].map((i) => paint(new THREE.TorusGeometry(0.7 - i * 0.06, 0.05, 6, 12, Math.PI).rotateY(Math.PI / 2).translate(-0.6 + i * 0.3, 0, 0), W_)),
      paint(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6).rotateZ(Math.PI / 2).translate(0, 0.05, 0), '#c8c0a8'),
      paint(new THREE.CylinderGeometry(0.06, 0.09, 1.2, 6).rotateZ(Math.PI / 2).rotateY(0.7).translate(0.4, 0.05, 0.8), W_),
    ])!,
    c: '#d8d0b8', m: 'bone',
  },
  skull: {
    // A great horned skull half sunk in the ground: cranium, brow, dark sockets and nose, the jaw and teeth, horns.
    g: () => mergeGeometries([
      paint(new THREE.SphereGeometry(0.9, 16, 12).scale(1.15, 0.85, 0.95).translate(-0.2, 0.55, 0), W_),
      paint(new THREE.BoxGeometry(0.9, 0.5, 0.75).translate(0.55, 0.3, 0), W_),
      paint(new THREE.SphereGeometry(0.2, 10, 8).translate(0.42, 0.62, -0.28), '#1a1410'),
      paint(new THREE.SphereGeometry(0.2, 10, 8).translate(0.42, 0.62, 0.28), '#1a1410'),
      paint(new THREE.SphereGeometry(0.1, 8, 6).translate(0.98, 0.42, 0), '#1a1410'),
      paint(new THREE.BoxGeometry(0.7, 0.12, 0.6).translate(0.55, 0.02, 0), '#c8c0a8'),
      paint(new THREE.ConeGeometry(0.16, 1.1, 8).rotateZ(-1.2).rotateX(0.5).translate(-0.3, 1.1, -0.55), '#d8ccb0'),
      paint(new THREE.ConeGeometry(0.16, 1.1, 8).rotateZ(-1.2).rotateX(-0.5).translate(-0.3, 1.1, 0.55), '#d8ccb0'),
    ])!,
    c: '#e2dccb', m: 'bone',
  },
  pipe: { g: () => new THREE.CylinderGeometry(0.45, 0.45, 6, 12).rotateZ(Math.PI / 2).translate(0, 0.45, 0), c: '#63666b', m: 'metal' },
  spike: { g: () => new THREE.ConeGeometry(0.4, 2.4, 6).translate(0, 1.2, 0), c: '#3a3232' },
  crystal: { g: () => mergeGeometries([0, 1, 2].map((i) => new THREE.OctahedronGeometry(0.5).scale(0.6, 2 - i * 0.4, 0.6).rotateZ((i - 1) * 0.35).translate((i - 1) * 0.35, 1 - i * 0.2, 0)))!, c: '#3fb6e0', m: 'glow' },
  cactus: {
    g: () => mergeGeometries([
      new THREE.CylinderGeometry(0.28, 0.32, 3.2, 8).translate(0, 1.6, 0),
      new THREE.CylinderGeometry(0.18, 0.2, 1.2, 8).translate(0.55, 1.9, 0),
      new THREE.CylinderGeometry(0.18, 0.2, 0.5, 8).rotateZ(Math.PI / 2).translate(0.3, 1.4, 0),
      new THREE.CylinderGeometry(0.16, 0.18, 1, 8).translate(-0.5, 2.3, 0),
      new THREE.CylinderGeometry(0.16, 0.18, 0.5, 8).rotateZ(Math.PI / 2).translate(-0.28, 1.85, 0),
    ])!,
    c: '#3a7a30',
  },
  mushroom: { g: () => mergeGeometries([new THREE.CylinderGeometry(0.25, 0.35, 1.6, 8).translate(0, 0.8, 0), new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.1, 0.6, 1.1).translate(0, 1.5, 0)])!, c: '#8a3ca0', m: 'glow' },
  antenna: { g: () => mergeGeometries([new THREE.CylinderGeometry(0.06, 0.1, 6, 6).translate(0, 3, 0), new THREE.SphereGeometry(0.8, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4).rotateX(-1.2).translate(0.3, 5, 0)])!, c: '#7a7c80', m: 'metal' },
  deadtree: {
    g: () => mergeGeometries([
      new THREE.CylinderGeometry(0.12, 0.25, 4, 6).translate(0, 2, 0),
      new THREE.CylinderGeometry(0.05, 0.1, 2, 5).rotateZ(0.8).translate(0.6, 3.2, 0),
      new THREE.CylinderGeometry(0.05, 0.09, 1.6, 5).rotateZ(-0.9).translate(-0.5, 2.8, 0.1),
      new THREE.CylinderGeometry(0.04, 0.08, 1.3, 5).rotateX(0.8).translate(0, 3.6, 0.4),
    ])!,
    c: '#4a3a2c',
  },
};

const propGeo = new Map<string, THREE.BufferGeometry>();

/** Materials, made once. */
class Mats {
  bark = new THREE.MeshStandardMaterial({ color: '#5a4430', roughness: 1 });
  leaves = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
  rock = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
  plain = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 });
  metal = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.45 });
  bone = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
  glow = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, emissive: '#ffffff', emissiveIntensity: 0.35 });
  crystal = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.88, emissive: '#1a3a4a', flatShading: true });
  water = new THREE.MeshStandardMaterial({ color: '#2a5a78', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.84 });
  acid = new THREE.MeshStandardMaterial({ color: '#6adf30', roughness: 0.2, emissive: '#1a4a08', transparent: true, opacity: 0.88 });
  lava = new THREE.MeshStandardMaterial({ color: '#3a1004', roughness: 0.6, emissive: '#ff5a14', emissiveIntensity: 1.1 });
  plainV = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, vertexColors: true });
  metalV = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0.4, vertexColors: true });
  boneV = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, vertexColors: true });
  glowV = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, emissive: '#ffffff', emissiveIntensity: 0.35, vertexColors: true });
  facade = new Map<Facade, THREE.MeshStandardMaterial>();
  roof = new Map<Roof, THREE.MeshStandardMaterial>();

  facadeOf(k: Facade): THREE.MeshStandardMaterial {
    let m = this.facade.get(k);
    if (!m) this.facade.set(k, (m = new THREE.MeshStandardMaterial({ map: facadeTex(k), vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })));
    return m;
  }

  roofOf(k: Roof): THREE.MeshStandardMaterial {
    let m = this.roof.get(k);
    if (!m) this.roof.set(k, (m = new THREE.MeshStandardMaterial({ map: roofTex(k), vertexColors: true, roughness: 0.85, metalness: k === 'sheet' ? 0.35 : 0, side: THREE.DoubleSide })));
    return m;
  }
}

/** How each building style is built: walls, roof, and whether the roof is pitched. */
const STYLE3D: Record<string, { wall: Facade; roof: Roof; tint: string; roofTint: string; pitch: boolean; floors?: number }> = {
  house_v: { wall: 'plaster', roof: 'clay', tint: '#f0e8da', roofTint: '#ffffff', pitch: true },
  house_f: { wall: 'planks', roof: 'slate', tint: '#d8c8b0', roofTint: '#ffffff', pitch: true },
  house_p: { wall: 'plaster', roof: 'slate', tint: '#e0d4c0', roofTint: '#d8d8e0', pitch: true },
  house_d: { wall: 'adobe', roof: 'tar', tint: '#f0e0c8', roofTint: '#c8b8a0', pitch: false },
  shop: { wall: 'brick', roof: 'tar', tint: '#ffffff', roofTint: '#ffffff', pitch: false },
  barn: { wall: 'planks', roof: 'sheet', tint: '#e07060', roofTint: '#c8ccd0', pitch: true },
  hall: { wall: 'iron', roof: 'sheet', tint: '#d8dce0', roofTint: '#ffffff', pitch: false },
  tanks: { wall: 'iron', roof: 'sheet', tint: '#f0f0f0', roofTint: '#ffffff', pitch: false },
  raidshack: { wall: 'iron', roof: 'sheet', tint: '#c89878', roofTint: '#b08868', pitch: false },
  shack: { wall: 'planks', roof: 'sheet', tint: '#c8b8a0', roofTint: '#a89888', pitch: false },
  gutted: { wall: 'ruin', roof: 'tar', tint: '#8a8680', roofTint: '#6a6660', pitch: false },
  ruin: { wall: 'ruin', roof: 'tar', tint: '#b0aaa0', roofTint: '#8a8680', pitch: false },
};

/** Geometry collected for one material, then merged. */
class Batch {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  /** A quad a-b-c-d (counter-clockwise seen from its front), uv per corner, one colour. */
  quad(a: number[], b: number[], c: number[], d: number[], uv: number[], col: [number, number, number]): void {
    const n0 = this.pos.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const p of [a, b, c, d]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(col[0], col[1], col[2]);
    }
    this.uv.push(...uv);
    this.idx.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3);
  }

  tri(a: number[], b: number[], c: number[], uv: number[], col: [number, number, number]): void {
    const n0 = this.pos.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(col[0], col[1], col[2]);
    }
    this.uv.push(...uv);
    this.idx.push(n0, n0 + 1, n0 + 2);
  }

  mesh(mat: THREE.Material): THREE.Mesh | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

const lin = (hex: string): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

/** Collects instances of one model for an InstancedMesh. */
class Inst {
  m: THREE.Matrix4[] = [];
  c: THREE.Color[] = [];
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, col: string | THREE.Color, rx = 0): void {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0));
    this.m.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)));
    this.c.push(typeof col === 'string' ? new THREE.Color(col) : col);
  }
  mesh(g: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.InstancedMesh | null {
    if (!this.m.length) return null;
    const im = new THREE.InstancedMesh(g, mat, this.m.length);
    this.m.forEach((m, i) => im.setMatrixAt(i, m));
    this.c.forEach((c, i) => im.setColorAt(i, c));
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    return im;
  }
}

const STONE: Record<string, string> = { sandstone: '#a8784a', basalt: '#2e2a30', ice: '#b8dcef', rock: '#6a6460' };

/* ------------------------------------------------------------------ */
/* The world                                                           */
/* ------------------------------------------------------------------ */

export class World3D {
  readonly root = new THREE.Group();
  private blocks = new Map<number, Block3D>();
  private terrain: Terrain2D;
  private mats = new Mats();
  private editSeen = 0;
  private map: GameMap;
  /** Blocks waiting to be built, nearest first. */
  time = 0;

  constructor(map: GameMap) {
    this.map = map;
    this.terrain = new Terrain2D(map);
  }

  setMap(map: GameMap): void {
    if (map === this.map) return;
    this.map = map;
    this.terrain.setMap(map);
    for (const b of this.blocks.values()) this.drop(b);
    this.blocks.clear();
  }

  /** The height of the ground surface (m) at a world point. */
  heightAt(x: number, y: number): number {
    return groundLevel(x, y);
  }

  /** Streams blocks round (cx, cy) and places them against the scene origin (ox, oz). */
  update(edits: number[], editCount: number, cx: number, cy: number, ox: number, oz: number, budgetMs: number): void {
    // What was crushed since last time: those blocks are rebuilt.
    const fresh = Math.min(edits.length, editCount - this.editSeen);
    for (let i = edits.length - fresh; i < edits.length; i++) {
      const k = edits[i];
      const ccx = k % 8192, ccy = Math.floor(k / 8192);
      const b = this.blocks.get(key(Math.floor((ccx * CH) / BLOCK), Math.floor((ccy * CH) / BLOCK)));
      if (b) b.stale = true;
    }
    this.editSeen = editCount;
    this.terrain.beginFrame();
    const cbx = Math.floor(cx / BLOCK), cby = Math.floor(cy / BLOCK);
    const want = new Set<number>();
    const todo: { bx: number; by: number; near: boolean; d: number; fine: boolean }[] = [];
    for (let dy = -FAR; dy <= FAR; dy++) {
      for (let dx = -FAR; dx <= FAR; dx++) {
        if (dx * dx + dy * dy > (FAR + 0.6) ** 2) continue;
        const bx = cbx + dx, by = cby + dy;
        if (bx < 0 || by < 0 || bx * BLOCK >= this.map.size || by * BLOCK >= this.map.size) continue;
        const k = key(bx, by);
        want.add(k);
        const near = Math.max(Math.abs(dx), Math.abs(dy)) <= NEAR;
        const b = this.blocks.get(k);
        if (!b || b.near !== near || b.stale) todo.push({ bx, by, near, d: dx * dx + dy * dy + (b ? 4 : 0), fine: Math.max(Math.abs(dx), Math.abs(dy)) <= 1 });
      }
    }
    for (const [k, b] of this.blocks) {
      if (!want.has(k)) {
        this.drop(b);
        this.blocks.delete(k);
      }
    }
    todo.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    let n = 0;
    for (const t of todo) {
      if (n > 0 && performance.now() - t0 > budgetMs) break;
      const old = this.blocks.get(key(t.bx, t.by));
      const nb = this.build(t.bx, t.by, t.near, t.fine);
      if (!nb) continue;
      if (old) this.drop(old);
      this.blocks.set(key(t.bx, t.by), nb);
      this.root.add(nb.group);
      n++;
    }
    for (const b of this.blocks.values()) b.group.position.set(b.bx * BLOCK - ox, 0, b.by * BLOCK - oz);
  }

  /** How many blocks are built (for the loading veil). */
  get count(): number {
    return this.blocks.size;
  }

  private drop(b: Block3D): void {
    this.root.remove(b.group);
    b.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !isShared(m.geometry)) m.geometry.dispose();
      const mat = m.material as THREE.MeshStandardMaterial | undefined;
      if (mat && (mat as unknown as { userData: { own?: boolean } }).userData.own) {
        mat.map?.dispose();
        mat.dispose();
      }
    });
  }

  private build(bx: number, by: number, near: boolean, fine = true): Block3D | null {
    const group = new THREE.Group();
    const x0 = bx * BLOCK, y0 = by * BLOCK;
    if (near) {
      // Everything walled is built as a model standing on the ground (not raised into it).
      const built = (tx: number, ty: number): boolean => {
        const o = this.map.inside(tx, ty) ? this.map.getObs(tx, ty) : 0;
        return o === OBS.WALL || o === OBS.RUIN || o === OBS.BASTION || o === OBS.STRUCT;
      };
      const gd = this.terrain.ground3D(bx, by, 2, built);
      group.add(this.groundMesh(gd.h, gd.canvas, fine ? 1 : 2, true));
      this.liquids(group, gd, x0, y0);
      this.buildings(group, gd, x0, y0, bx, by);
      this.nature(group, gd, x0, y0);
      this.props(group, x0, y0);
    } else {
      const tex = this.terrain.get(bx, by, 0, 2);
      if (!tex) return null;
      group.add(this.groundMesh(this.farHeights(bx, by, 4), tex, 4, false));
    }
    return { bx, by, near, group, stale: false };
  }

  private buildingsNear(bx: number, by: number): Building[] {
    const out: Building[] = [];
    const seen = new Set<string>();
    const c0x = Math.floor((bx * BLOCK - 1) / CH), c0y = Math.floor((by * BLOCK - 1) / CH);
    const c1x = Math.floor((bx * BLOCK + BLOCK) / CH), c1y = Math.floor((by * BLOCK + BLOCK) / CH);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        if (!this.map.inside(cx * CH, cy * CH)) continue;
        for (const b of this.map.chunk(cx, cy).buildings) {
          if (seen.has(b.key)) continue;
          seen.add(b.key);
          out.push(b);
        }
      }
    }
    return out;
  }

  /** Heights for a far block every `step` m: the rolling ground with everything standing on it raised. */
  private farHeights(bx: number, by: number, step: number): Float32Array {
    const n = BLOCK / step + 1;
    const h = new Float32Array(n * n);
    const m = this.map;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const tx = bx * BLOCK + i * step, ty = by * BLOCK + j * step;
        let top = 0;
        for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
          if (!m.inside(tx + dx, ty + dy)) continue;
          const o = m.getObs(tx + dx, ty + dy);
          if (!o || o === OBS.TREE) continue;
          top = Math.max(top, m.getOh(tx + dx, ty + dy) * 0.5 * (SHARP[o] ? 1 : 0.8));
        }
        const t = m.inside(tx, ty) ? m.getTer(tx, ty) : TER.BASALT;
        const wet = t === TER.WATER || t === TER.ACID || t === TER.LAVA;
        h[j * n + i] = groundLevel(tx, ty) + top * 0.9 - (wet ? 0.6 : 0);
      }
    }
    return h;
  }

  /** A block's ground as a height grid, textured, with rock strata on the steep faces. */
  private groundMesh(h: Float32Array, canvas: HTMLCanvasElement, step: number, near: boolean): THREE.Mesh {
    const n = BLOCK / step;
    const N1 = n + 1;
    // Heights may come at 1 m for a coarser mesh: sample them.
    const src = Math.round(Math.sqrt(h.length)) - 1;
    const k = src / n;
    const pos = new Float32Array(N1 * N1 * 3 + (near ? 0 : n * 4 * 2 * 3));
    const uv = new Float32Array(N1 * N1 * 2 + (near ? 0 : n * 4 * 2 * 2));
    const hs = (i: number, j: number): number => h[Math.round(j * k) * (src + 1) + Math.round(i * k)];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const q = j * N1 + i;
        pos[q * 3] = i * step;
        pos[q * 3 + 1] = hs(i, j);
        pos[q * 3 + 2] = j * step;
        uv[q * 2] = i / n;
        uv[q * 2 + 1] = 1 - j / n;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
        // Split along the shorter diagonal (cliffs keep their edges).
        if (Math.abs(pos[a * 3 + 1] - pos[d * 3 + 1]) < Math.abs(pos[b * 3 + 1] - pos[c * 3 + 1])) idx.push(a, c, d, a, d, b);
        else idx.push(a, c, b, b, c, d);
      }
    }
    if (!near) {
      // A skirt round the edge hides cracks against a neighbour of another resolution.
      let v = N1 * N1;
      const edge: number[] = [];
      for (let i = 0; i < n; i++) edge.push(i);
      for (let j = 0; j < n; j++) edge.push(j * N1 + n);
      for (let i = n; i > 0; i--) edge.push(n * N1 + i);
      for (let j = n; j > 0; j--) edge.push(j * N1);
      for (let e = 0; e < edge.length; e++) {
        const a = edge[e], b = edge[(e + 1) % edge.length];
        for (const s of [a, b]) {
          pos[v * 3] = pos[s * 3];
          pos[v * 3 + 1] = pos[s * 3 + 1] - 4;
          pos[v * 3 + 2] = pos[s * 3 + 2];
          uv[v * 2] = uv[s * 2];
          uv[v * 2 + 1] = uv[s * 2 + 1];
          v++;
        }
        idx.push(a, v - 2, b, b, v - 2, v - 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Steep faces: darker, banded with strata.
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const col = new Float32Array(pos.length);
    for (let q = 0; q < pos.length / 3; q++) {
      const steep = 1 - Math.max(0, nor.getY(q));
      const y = pos[q * 3 + 1];
      let c = 1;
      if (steep > 0.25) {
        const t = Math.min(1, (steep - 0.25) * 2);
        c = 1 - t * 0.38 + t * 0.14 * Math.sin(y * 2.6 + Math.sin(pos[q * 3] * 0.3) * 1.4);
      }
      col[q * 3] = c;
      col[q * 3 + 1] = c * 0.98;
      col[q * 3 + 2] = c * 0.96;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.96, metalness: 0 });
    (mat.userData as { own?: boolean }).own = true;
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = near;
    return mesh;
  }

  /** Water, acid and lava: a surface over each liquid tile, a little under the banks. */
  private liquids(group: THREE.Group, gd: Ground3D, x0: number, y0: number): void {
    const batches = { water: new Batch(), acid: new Batch(), lava: new Batch() };
    const white: [number, number, number] = [1, 1, 1];
    for (let y = 0; y < BLOCK; y++) {
      for (let x = 0; x < BLOCK; x++) {
        const t = gd.ter[y * BLOCK + x];
        const b = t === TER.WATER ? batches.water : t === TER.ACID ? batches.acid : t === TER.LAVA ? batches.lava : null;
        if (!b) continue;
        const lv = (i: number, j: number): number => groundLevel(x0 + x + i, y0 + y + j) - 0.18;
        b.quad([x, lv(0, 0), y], [x, lv(0, 1), y + 1], [x + 1, lv(1, 1), y + 1], [x + 1, lv(1, 0), y], [x / 8, 1 - y / 8, x / 8, 1 - (y + 1) / 8, (x + 1) / 8, 1 - (y + 1) / 8, (x + 1) / 8, 1 - y / 8], white);
      }
    }
    const w = batches.water.mesh(this.mats.water), a = batches.acid.mesh(this.mats.acid), l = batches.lava.mesh(this.mats.lava);
    for (const m of [w, a, l]) if (m) {
      m.castShadow = false;
      group.add(m);
    }
  }

  /** Buildings: whole ones as houses, halls and towers; broken ones as the walls that are left. */
  private buildings(group: THREE.Group, gd: Ground3D, x0: number, y0: number, bx: number, by: number): void {
    const walls = new Map<Facade, Batch>();
    const roofs = new Map<Roof, Batch>();
    const W = (k: Facade): Batch => {
      let b = walls.get(k);
      if (!b) walls.set(k, (b = new Batch()));
      return b;
    };
    const R = (k: Roof): Batch => {
      let b = roofs.get(k);
      if (!b) roofs.set(k, (b = new Batch()));
      return b;
    };
    const taken = new Uint8Array(BLOCK * BLOCK);
    const obsAt = (x: number, y: number): number => (x >= 0 && y >= 0 && x < BLOCK && y < BLOCK ? gd.obs[y * BLOCK + x] : this.map.inside(x0 + x, y0 + y) ? this.map.getObs(x0 + x, y0 + y) : 0);
    const ohAt = (x: number, y: number): number => (x >= 0 && y >= 0 && x < BLOCK && y < BLOCK ? gd.oh[y * BLOCK + x] : this.map.inside(x0 + x, y0 + y) ? this.map.getOh(x0 + x, y0 + y) : 0);
    const isWall = (o: number): boolean => o === OBS.WALL || o === OBS.RUIN || o === OBS.BASTION || o === OBS.STRUCT;
    const pillars = new Inst();
    // Whole buildings, owned by the block their corner is in.
    for (const b of this.buildingsNear(bx, by)) {
      if (b.x0 < x0 || b.y0 < y0 || b.x0 >= x0 + BLOCK || b.y0 >= y0 + BLOCK) continue;
      const st = STYLE3D[b.style];
      let total = 0, have = 0, hmax = 0, pillar = false;
      for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
        total++;
        const o = obsAt(x - x0, y - y0);
        if (o === OBS.PILLAR) pillar = true;
        if (isWall(o) || o === OBS.PILLAR) {
          have++;
          hmax = Math.max(hmax, ohAt(x - x0, y - y0) * 0.5);
        }
      }
      if (pillar && have) {
        // Towers, chimneys, stacks, silos and obelisks: round (or square) and tall.
        const cxw = (b.x0 + b.x1) / 2 - x0, cyw = (b.y0 + b.y1) / 2 - y0;
        const base = groundLevel(x0 + cxw, y0 + cyw) - 0.5;
        const r = b.style === 'silo' ? 3.2 : b.style === 'tower' ? 2.4 : b.style === 'obelisk' ? 1.4 : 1.3;
        const col = b.style === 'chimney' ? '#8a5a48' : b.style === 'silo' ? '#c8ccd0' : b.style === 'obelisk' ? '#3a3a4a' : '#6a6a70';
        pillars.add(cxw, base, cyw, r * 2, hmax + 0.5, r * 2, 0, col);
        for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) if (x >= x0 && y >= y0 && x < x0 + BLOCK && y < y0 + BLOCK) taken[(y - y0) * BLOCK + x - x0] = 1;
        continue;
      }
      if (!st || !have || have < total * 0.92 || b.style === 'ruin' || b.style === 'gutted') continue;
      // Whole: walls up to the eaves, then the roof.
      const bw = b.x1 - b.x0, bd = b.y1 - b.y0;
      const lx0 = b.x0 - x0, ly0 = b.y0 - y0, lx1 = lx0 + bw, ly1 = ly0 + bd;
      const base = Math.min(groundLevel(b.x0, b.y0), groundLevel(b.x1, b.y0), groundLevel(b.x0, b.y1), groundLevel(b.x1, b.y1)) - 0.6;
      const tall = Math.max(3.2, hmax);
      const eave = base + 0.6 + (st.pitch ? Math.max(3, tall * 0.62) : tall);
      const tint = lin(st.tint);
      const wb = W(st.wall);
      const v0 = 0, v1 = (eave - base) / 7;
      wb.quad([lx0, base, ly0], [lx0, base, ly1], [lx0, eave, ly1], [lx0, eave, ly0], [0, v0, bd / 8, v0, bd / 8, v1, 0, v1].map((v, i) => (i & 1 ? v : v)), tint);
      wb.quad([lx1, base, ly1], [lx1, base, ly0], [lx1, eave, ly0], [lx1, eave, ly1], [0, v0, bd / 8, v0, bd / 8, v1, 0, v1], tint);
      wb.quad([lx1, base, ly0], [lx0, base, ly0], [lx0, eave, ly0], [lx1, eave, ly0], [0, v0, bw / 8, v0, bw / 8, v1, 0, v1], tint);
      wb.quad([lx0, base, ly1], [lx1, base, ly1], [lx1, eave, ly1], [lx0, eave, ly1], [0, v0, bw / 8, v0, bw / 8, v1, 0, v1], tint);
      const rt = lin(st.roofTint);
      const rb = R(st.roof);
      if (st.pitch) {
        // A gable roof along the long side, overhanging the walls a little.
        const o = 0.5;
        const along = bw >= bd;
        const span = along ? bd : bw;
        const ridge = eave + Math.min(6, span * 0.42);
        if (along) {
          const mz = (ly0 + ly1) / 2;
          rb.quad([lx0 - o, eave - 0.3, ly0 - o], [lx0 - o, ridge, mz], [lx1 + o, ridge, mz], [lx1 + o, eave - 0.3, ly0 - o], [0, 0, 0, span / 16, bw / 8, span / 16, bw / 8, 0], rt);
          rb.quad([lx1 + o, eave - 0.3, ly1 + o], [lx1 + o, ridge, mz], [lx0 - o, ridge, mz], [lx0 - o, eave - 0.3, ly1 + o], [0, 0, 0, span / 16, bw / 8, span / 16, bw / 8, 0], rt);
          wb.tri([lx0, eave, ly0], [lx0, eave, ly1], [lx0, ridge, mz], [0, v1, bd / 8, v1, bd / 16, v1 + (ridge - eave) / 7], tint);
          wb.tri([lx1, eave, ly1], [lx1, eave, ly0], [lx1, ridge, mz], [0, v1, bd / 8, v1, bd / 16, v1 + (ridge - eave) / 7], tint);
        } else {
          const mx = (lx0 + lx1) / 2;
          rb.quad([lx0 - o, eave - 0.3, ly1 + o], [mx, ridge, ly1 + o], [mx, ridge, ly0 - o], [lx0 - o, eave - 0.3, ly0 - o], [0, 0, span / 16, 0, span / 16, bd / 8, 0, bd / 8], rt);
          rb.quad([lx1 + o, eave - 0.3, ly0 - o], [mx, ridge, ly0 - o], [mx, ridge, ly1 + o], [lx1 + o, eave - 0.3, ly1 + o], [0, 0, span / 16, 0, span / 16, bd / 8, 0, bd / 8], rt);
          wb.tri([lx1, eave, ly0], [lx0, eave, ly0], [mx, ridge, ly0], [0, v1, bw / 8, v1, bw / 16, v1 + (ridge - eave) / 7], tint);
          wb.tri([lx0, eave, ly1], [lx1, eave, ly1], [mx, ridge, ly1], [0, v1, bw / 8, v1, bw / 16, v1 + (ridge - eave) / 7], tint);
        }
      } else {
        // Flat roof behind a low parapet.
        rb.quad([lx0, eave, ly1], [lx1, eave, ly1], [lx1, eave, ly0], [lx0, eave, ly0], [0, 0, bw / 8, 0, bw / 8, bd / 8, 0, bd / 8], rt);
        const pb = W('concrete');
        const p = eave + 0.7;
        const pt = lin('#b8b4ac');
        for (const [a, c] of [[[lx0, ly0], [lx1, ly0]], [[lx1, ly1], [lx0, ly1]], [[lx0, ly1], [lx0, ly0]], [[lx1, ly0], [lx1, ly1]]] as [number[], number[]][]) {
          pb.quad([a[0], eave, a[1]], [c[0], eave, c[1]], [c[0], p, c[1]], [a[0], p, a[1]], [0, 0, 1, 0, 1, 0.1, 0, 0.1], pt);
        }
      }
      for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) if (x >= x0 && y >= y0 && x < x0 + BLOCK && y < y0 + BLOCK) taken[(y - y0) * BLOCK + x - x0] = 1;
    }
    // Everything else walled: columns a metre square, joined (only the faces that show), with the walls of what they
    // belong to (ruins keep their broken windows; the Hangar's bastions are bare concrete).
    const style = new Map<number, Facade>();
    for (const b of this.buildingsNear(bx, by)) {
      const f = b.style === 'ruin' || b.style === 'gutted' ? 'ruin' : STYLE3D[b.style]?.wall ?? 'concrete';
      for (let y = Math.max(b.y0, y0); y < Math.min(b.y1, y0 + BLOCK); y++) for (let x = Math.max(b.x0, x0); x < Math.min(b.x1, x0 + BLOCK); x++) style.set((y - y0) * BLOCK + x - x0, f);
    }
    const topOf = (x: number, y: number): number => {
      const o = obsAt(x, y);
      if (!isWall(o)) return -1e9;
      return groundLevel(x0 + x + 0.5, y0 + y + 0.5) + ohAt(x, y) * 0.5;
    };
    const roofCol = lin('#8a8680');
    for (let y = 0; y < BLOCK; y++) {
      for (let x = 0; x < BLOCK; x++) {
        const q = y * BLOCK + x;
        const o = gd.obs[q];
        if (!isWall(o) || taken[q]) continue;
        const top = topOf(x, y);
        const base = groundLevel(x0 + x + 0.5, y0 + y + 0.5) - 1;
        const f: Facade = style.get(q) ?? (o === OBS.BASTION ? 'bunker' : o === OBS.STRUCT ? 'concrete' : o === OBS.RUIN ? 'ruin' : 'concrete');
        const tint = lin(o === OBS.BASTION ? '#c8ccc8' : o === OBS.STRUCT ? '#d8d0c4' : f === 'ruin' ? '#a8a298' : '#e0dcd4');
        const wb = W(f);
        const rb = R(f === 'ruin' ? 'tar' : o === OBS.STRUCT ? 'sheet' : 'tar');
        rb.quad([x, top, y + 1], [x + 1, top, y + 1], [x + 1, top, y], [x, top, y], [x / 8, y / 8, (x + 1) / 8, y / 8, (x + 1) / 8, (y + 1) / 8, x / 8, (y + 1) / 8], roofCol);
        const side = (nx: number, ny: number, a: number[], c: number[], u0: number): void => {
          const nt = topOf(x + nx, y + ny);
          if (nt >= top - 0.05) return;
          const lo = Math.max(base, nt);
          wb.quad([a[0], lo, a[1]], [c[0], lo, c[1]], [c[0], top, c[1]], [a[0], top, a[1]], [u0 / 8, lo / 7, (u0 + 1) / 8, lo / 7, (u0 + 1) / 8, top / 7, u0 / 8, top / 7], tint);
        };
        side(0, -1, [x + 1, y], [x, y], x0 + x);
        side(0, 1, [x, y + 1], [x + 1, y + 1], x0 + x);
        side(-1, 0, [x, y], [x, y + 1], y0 + y);
        side(1, 0, [x + 1, y + 1], [x + 1, y], y0 + y);
      }
    }
    for (const [k, b] of walls) {
      const m = b.mesh(this.mats.facadeOf(k));
      if (m) group.add(m);
    }
    for (const [k, b] of roofs) {
      const m = b.mesh(this.mats.roofOf(k));
      if (m) group.add(m);
    }
    const pm = pillars.mesh(GEO.cyl, this.mats.plain);
    if (pm) group.add(pm);
  }

  /** Trees, boulders, spires and fungi. */
  private nature(group: THREE.Group, gd: Ground3D, x0: number, y0: number): void {
    const trunks = new Inst(), broad = new Inst(), pines = new Inst(), bushes = new Inst(), rocks = new Inst(), spires = new Inst(), fungi = new Inst(), caps = new Inst();
    const C = 4;
    for (let gy = 0; gy < BLOCK / C; gy++) {
      for (let gx = 0; gx < BLOCK / C; gx++) {
        let best = 2, bxT = -1, byT = -1;
        for (let k = 0; k < C * C; k++) {
          const lx = gx * C + (k % C), ly = gy * C + Math.floor(k / C);
          const q = ly * BLOCK + lx;
          const o = gd.obs[q];
          const tx = x0 + lx, ty = y0 + ly;
          if (o === OBS.BOULDER) {
            // A fifth are real boulders, the rest stones.
            const hb = hash2(tx, ty, 151);
            const z = gd.zone[q], t = gd.ter[q];
            const stone = z === ZONE.DUNES || z === ZONE.PASS || t === TER.SAND || t === TER.DUNE ? 'sandstone' : z === ZONE.ASH || z === ZONE.SCORCHED || z === ZONE.SPIRES || t === TER.BASALT ? 'basalt' : z === ZONE.FROST || t === TER.SNOW ? 'ice' : 'rock';
            const s = hb < 0.2 ? 1.6 + hb * 12 : 0.35 + hash2(tx, ty, 4) * 0.8;
            const c = new THREE.Color(STONE[stone]).multiplyScalar(0.85 + hash2(tx, ty, 5) * 0.3);
            rocks.add(lx + 0.5, groundLevel(tx, ty) + s * 0.2, ly + 0.5, s * 1.1, s * 0.7, s, hash2(tx, ty, 6) * 6, c);
          } else if (o === OBS.ICE_SPIRE || o === OBS.SHARD) {
            if (hash2(tx, ty, 161) < 0.25) {
              const hh = gd.oh[q] * 0.5 * (0.7 + hash2(tx, ty, 7) * 0.6);
              spires.add(lx + 0.5, groundLevel(tx, ty) - 0.3, ly + 0.5, 1.6 + hash2(tx, ty, 8) * 1.4, hh, 1.6, hash2(tx, ty, 9) * 6, o === OBS.SHARD ? '#8ef08a' : '#c8ecff', (hash2(tx, ty, 10) - 0.5) * 0.3);
            }
          } else if (o === OBS.FUNGUS) {
            if (hash2(tx, ty, 171) < 0.18) {
              const hh = 3 + hash2(tx, ty, 11) * 7, w = hh * 0.7;
              const col = hash2(tx, ty, 12) > 0.5 ? '#a050d0' : '#e070b0';
              fungi.add(lx + 0.5, groundLevel(tx, ty), ly + 0.5, w * 0.25, hh, w * 0.25, 0, '#d8c8e0');
              caps.add(lx + 0.5, groundLevel(tx, ty) + hh * 0.95, ly + 0.5, w, w * 0.45, w, 0, col);
            }
          }
          if (o !== OBS.TREE) continue;
          const h = hash2(tx, ty, 149);
          if (h < best) {
            best = h;
            bxT = lx;
            byT = ly;
          }
        }
        if (bxT < 0) continue;
        const tx = x0 + bxT, ty = y0 + byT;
        const q = byT * BLOCK + bxT;
        const name = crownName(gd.ter[q], gd.oh[q], hash2(tx, ty, 153));
        const hgt = Math.max(3, gd.oh[q] * 0.5) * (0.85 + hash2(tx, ty, 13) * 0.3);
        const px = bxT + 0.5 + (hash2(tx, ty, 14) - 0.5) * 2, pz = byT + 0.5 + (hash2(tx, ty, 15) - 0.5) * 2;
        const gy0 = groundLevel(tx, ty) - 0.2;
        const ry = hash2(tx, ty, 16) * 6.28;
        if (name.startsWith('pine')) {
          const snow = name.endsWith('s');
          trunks.add(px, gy0, pz, 0.9, hgt * 0.3, 0.9, ry, '#4a3a2a');
          const w = hgt * 0.42;
          pines.add(px, gy0 + hgt * 0.15, pz, w, hgt, w, ry, snow ? new THREE.Color('#d8e4ec') : new THREE.Color('#2e4a2a').multiplyScalar(0.8 + hash2(tx, ty, 17) * 0.4));
        } else if (name.startsWith('bush')) {
          const w = 1.4 + hash2(tx, ty, 18) * 1.6;
          bushes.add(px, gy0 + w * 0.35, pz, w, w * 0.7, w, ry, new THREE.Color('#4a6a2a').multiplyScalar(0.75 + hash2(tx, ty, 19) * 0.4));
        } else {
          const autumn = name.startsWith('autumn'), birch = name.startsWith('birch');
          trunks.add(px, gy0, pz, birch ? 0.8 : 1.3, hgt * 0.55, birch ? 0.8 : 1.3, ry, birch ? '#d8d4c8' : '#4e3a28');
          const w = hgt * (birch ? 0.28 : 0.42);
          const base = autumn ? (hash2(tx, ty, 20) > 0.5 ? '#c86a20' : '#d8a030') : birch ? '#7a9a3a' : '#44682a';
          broad.add(px, gy0 + hgt * 0.62, pz, w, w * 0.9, w, ry, new THREE.Color(base).multiplyScalar(0.78 + hash2(tx, ty, 21) * 0.4));
        }
      }
    }
    const add = (m: THREE.Object3D | null): void => {
      if (m) group.add(m);
    };
    add(trunks.mesh(GEO.trunk, this.mats.bark));
    add(broad.mesh(GEO.broadleaf, this.mats.leaves));
    add(pines.mesh(GEO.pine, this.mats.leaves));
    add(bushes.mesh(GEO.bush, this.mats.leaves));
    add(rocks.mesh(GEO.rock, this.mats.rock));
    add(spires.mesh(GEO.spire, this.mats.crystal));
    add(fungi.mesh(GEO.cyl, this.mats.plain));
    add(caps.mesh(GEO.cap, this.mats.glow));
  }

  /** The scattered props, each a small model where it lies. */
  private props(group: THREE.Group, x0: number, y0: number): void {
    const by = new Map<string, Inst>();
    const m = this.map;
    for (let cy = y0 / CH; cy < (y0 + BLOCK) / CH; cy++) {
      for (let cx = x0 / CH; cx < (x0 + BLOCK) / CH; cx++) {
        if (!m.inside(cx * CH, cy * CH)) continue;
        for (const pr of m.chunk(cx, cy).props) {
          if (pr.gone) continue;
          const d = PROP3D[pr.kind];
          if (!d || hash2(Math.floor(pr.x * 8), Math.floor(pr.y * 8), 97) > 0.45) continue;
          const t = m.getTer(Math.floor(pr.x), Math.floor(pr.y));
          if (t === TER.ROAD || t === TER.METAL || t === TER.CONCRETE) continue;
          let l = by.get(pr.kind);
          if (!l) by.set(pr.kind, (l = new Inst()));
          const s = pr.s * (pr.kind === 'skull' ? 1.3 : pr.kind === 'cactus' ? 1.2 : 1.1);
          const tint = new THREE.Color(d.c).multiplyScalar(0.8 + (pr.v / 3) * 0.35);
          l.add(pr.x - x0, groundLevel(pr.x, pr.y) - 0.05, pr.y - y0, s, s, s, pr.rot, tint);
        }
      }
    }
    for (const [k, l] of by) {
      let g = propGeo.get(k);
      if (!g) {
        g = PROP3D[k].g();
        if (!g.attributes.color) paint(g, W_);
        propGeo.set(k, g);
      }
      const mm = PROP3D[k].m === 'metal' ? this.mats.metalV : PROP3D[k].m === 'bone' ? this.mats.boneV : PROP3D[k].m === 'glow' ? this.mats.glowV : this.mats.plainV;
      const im = l.mesh(g, mm);
      if (im) group.add(im);
    }
  }
}

const SHARED = new Set<THREE.BufferGeometry>(Object.values(GEO));
function isShared(g: THREE.BufferGeometry): boolean {
  return SHARED.has(g) || [...propGeo.values()].includes(g);
}

