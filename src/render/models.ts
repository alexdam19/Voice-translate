import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, type Material } from 'three';
import { CELL } from '../shared/constants';
import { NODE_INFO, type NodeType, type RuneKind, RUNE_INFO } from '../shared/mapgen';
import { hash2 } from '../shared/rng';
import { WEAPONS } from '../shared/weapons';
import { MODULES } from '../game/defs';
import { TREAD, type Tank } from '../game/tank';
import { withFow } from './fow';
import { GeoBuilder } from './geo';
import { getAtlas, treadTexture } from './textures';

const DECK = 0.78;

export interface TankModel {
  root: Group;
  turrets: Map<number, { obj: Object3D; barrel: Object3D | null }>;
  lit: MeshLambertMaterial;
  glow: MeshBasicMaterial;
  treadMat: MeshLambertMaterial;
  version: number;
  radars: Object3D[];
}

function palKey(t: Tank): string {
  if (t.kind === 'outrider') return 'outrider';
  if (t.kind === 'outpost') return 'outpost';
  if (t.kind === 'remote') return 'remote';
  return t.team === 'player' ? 'player' : 'enemy';
}

/** Builds a voxel model of a tank from its deck layout. Local +X is forward, +Z is right. */
export function buildTankModel(t: Tank, fow: boolean): TankModel {
  const atlas = getAtlas();
  const pal = palKey(t);
  const lit = new MeshLambertMaterial({ map: atlas.texture, vertexColors: true });
  const glow = new MeshBasicMaterial({ map: atlas.texture, vertexColors: true });
  const tread = treadTexture().clone();
  tread.needsUpdate = true;
  const treadMat = new MeshLambertMaterial({ map: tread });
  if (fow) {
    withFow(lit);
    withFow(glow);
    withFow(treadMat);
  }
  const root = new Group();
  const gb = new GeoBuilder();
  const gl = new GeoBuilder();
  const tr = new GeoBuilder();
  const L = t.rows * CELL, W = t.cols * CELL;
  const hull = atlas.get(`hull_${pal}`), deck = atlas.get(`deck_${pal}`), trim = atlas.get(`trim_${pal}`);
  const dark = atlas.get('darkmetal'), metal = atlas.get('metal'), side = atlas.get('mod_side');
  const anchored = t.kind === 'outpost';
  if (!anchored) {
    // Treads with a repeating pattern along their length.
    const TL = L + 0.4;
    for (const s of [-1, 1]) {
      const z0 = s < 0 ? -W / 2 - TREAD : W / 2, z1 = s < 0 ? -W / 2 : W / 2 + TREAD;
      tr.box(-TL / 2, 0.05, z0, TL / 2, 0.7, z1, { u0: 0, v0: 0, u1: TL * 2, v1: 1 }, { u0: 0, v0: 0, u1: TL * 2, v1: 1 });
      // Road wheels / hubs on the outside.
      const zo = s < 0 ? z0 - 0.04 : z1;
      const n = Math.max(3, Math.round(TL / 0.9));
      for (let i = 0; i < n; i++) {
        const x = -TL / 2 + 0.45 + (i * (TL - 0.9)) / Math.max(1, n - 1);
        gb.box(x - 0.18, 0.2, zo, x + 0.18, 0.5, zo + 0.04, metal, metal);
      }
      // Fenders.
      gb.box(-TL / 2 - 0.05, 0.7, z0 - 0.03, TL / 2 + 0.05, 0.78, z1 + 0.03, trim, trim);
    }
  } else {
    // Outposts sit on a concrete foundation.
    gb.box(-L / 2 - 0.6, 0, -W / 2 - 0.6, L / 2 + 0.6, 0.35, W / 2 + 0.6, atlas.get('obs11_top'), atlas.get('obs11_side'));
  }
  // Hull body.
  gb.box(-L / 2, 0.25, -W / 2, L / 2, DECK, W / 2, deck, hull);
  // Glacis (front armour) and rear exhaust.
  if (!anchored) {
    gb.box(L / 2, 0.22, -W / 2 + 0.1, L / 2 + 0.28, DECK - 0.12, W / 2 - 0.1, trim, hull);
    gb.box(-L / 2 - 0.18, 0.35, -W / 4, -L / 2, 0.65, W / 4, dark, dark);
  }
  // Side trim stripes (team color).
  gb.box(-L / 2 + 0.1, DECK - 0.1, -W / 2 - 0.02, L / 2 - 0.1, DECK - 0.02, W / 2 + 0.02, trim, trim);
  const turrets = new Map<number, { obj: Object3D; barrel: Object3D | null }>();
  const radars: Object3D[] = [];
  for (const m of t.modules) {
    const d = MODULES[m.key];
    const lx = (t.rows / 2 - (m.cy + d.h / 2)) * CELL;
    const lz = (m.cx + d.w / 2 - t.cols / 2) * CELL;
    const fx = d.h * CELL - 0.06, fz = d.w * CELL - 0.06; // footprint along x (length) and z (width)
    const h = d.hardpoint ? 0.18 : d.height * 0.75;
    const top = atlas.get(`mod_${m.key}`);
    gb.box(lx - fx / 2, DECK, lz - fz / 2, lx + fx / 2, DECK + h, lz + fz / 2, top, side);
    const y1 = DECK + h;
    switch (m.key) {
      case 'bridge':
        gb.box(lx - fx * 0.25, y1, lz - fz * 0.3, lx + fx * 0.2, y1 + 0.3, lz + fz * 0.3, atlas.get('mod_bridge'), side);
        gl.box(lx + fx * 0.2, y1 + 0.08, lz - fz * 0.28, lx + fx * 0.21, y1 + 0.24, lz + fz * 0.28, atlas.get('glow_cyan'), atlas.get('glow_cyan'));
        gb.box(lx - fx * 0.3, y1, lz + fz * 0.35, lx - fx * 0.25, y1 + 0.9, lz + fz * 0.4, metal, metal);
        gl.box(lx - fx * 0.31, y1 + 0.9, lz + fz * 0.34, lx - fx * 0.24, y1 + 0.97, lz + fz * 0.41, atlas.get('glow_red'), atlas.get('glow_red'));
        break;
      case 'reactor':
      case 'fission': {
        const c = m.key === 'reactor' ? 'glow_yellow' : 'glow_green';
        gl.box(lx - 0.18, y1, lz - 0.18, lx + 0.18, y1 + 0.3, lz + 0.18, atlas.get(c), atlas.get(c));
        gb.box(lx - 0.24, y1 + 0.3, lz - 0.24, lx + 0.24, y1 + 0.36, lz + 0.24, metal, metal);
        break;
      }
      case 'engine':
      case 'ion_engine':
        for (const s of [-1, 1]) gb.box(lx - fx / 2 + 0.05, y1, lz + s * fz * 0.25 - 0.08, lx - fx / 2 + 0.21, y1 + 0.55, lz + s * fz * 0.25 + 0.08, dark, dark);
        if (m.key === 'ion_engine') gl.box(lx - 0.1, y1, lz - fz * 0.3, lx + 0.1, y1 + 0.06, lz + fz * 0.3, atlas.get('glow_blue'), atlas.get('glow_blue'));
        break;
      case 'radar': {
        gb.box(lx - 0.05, y1, lz - 0.05, lx + 0.05, y1 + 0.5, lz + 0.05, metal, metal);
        const dish = new Mesh(new BoxGeometry(0.1, 0.35, 0.6), lit);
        const piv = new Group();
        piv.position.set(lx, y1 + 0.55, lz);
        dish.position.set(0.08, 0, 0);
        piv.add(dish);
        root.add(piv);
        radars.push(piv);
        break;
      }
      case 'shield':
        gl.box(lx - 0.12, y1, lz - 0.12, lx + 0.12, y1 + 0.35, lz + 0.12, atlas.get('glow_blue'), atlas.get('glow_blue'));
        break;
      case 'refinery':
        gb.box(lx + fx * 0.15, y1, lz + fz * 0.15, lx + fx * 0.35, y1 + 0.7, lz + fz * 0.35, dark, dark);
        gl.box(lx - 0.12, y1, lz - 0.2, lx + 0.12, y1 + 0.05, lz + 0.05, atlas.get('glow_orange'), atlas.get('glow_orange'));
        break;
      case 'barracks':
      case 'quarters':
        gb.box(lx - fx * 0.4, y1, lz - fz * 0.4, lx + fx * 0.4, y1 + 0.12, lz + fz * 0.4, atlas.get(`mod_${m.key}`), side);
        break;
      case 'garage':
        gb.box(lx - fx / 2, y1, lz - fz / 2, lx - fx / 2 + 0.08, y1 + 0.2, lz + fz / 2, atlas.get('hazard'), atlas.get('hazard'));
        break;
      case 'drill_mk2':
      case 'drill_mk3':
        gb.box(lx + fx / 2, DECK, lz - 0.12, lx + fx / 2 + 0.3, DECK + 0.24, lz + 0.12, metal, metal);
        break;
    }
    if (d.hardpoint) {
      const obj = new Group();
      obj.position.set(lx, y1, lz);
      root.add(obj);
      let barrel: Object3D | null = null;
      if (m.weapon) barrel = buildTurret(obj, m.weapon.key, d.hardpoint, lit, glow);
      turrets.set(m.id, { obj, barrel });
    }
  }
  if (!tr.empty) {
    const tm = new Mesh(tr.build(), treadMat);
    tm.castShadow = true;
    root.add(tm);
  }
  const body = new Mesh(gb.build(), lit);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);
  if (!gl.empty) root.add(new Mesh(gl.build(), glow));
  return { root, turrets, lit, glow, treadMat, version: t.version, radars };
}

/** Adds a weapon head to a turret pivot; returns the part that recoils. */
function buildTurret(obj: Object3D, key: string, size: 'light' | 'medium' | 'heavy', lit: Material, glow: Material): Object3D {
  const atlas = getAtlas();
  const gb = new GeoBuilder();
  const gbb = new GeoBuilder();
  const gl = new GeoBuilder();
  const metal = atlas.get('metal'), dark = atlas.get('darkmetal');
  const s = size === 'heavy' ? 1 : size === 'medium' ? 0.7 : 0.45;
  const d = WEAPONS[key];
  const headTop = atlas.get(d?.exclusive ? 'glow_orange' : 'metal');
  const glowFor = (c: string): ReturnType<typeof atlas.get> => atlas.get(c);
  // Head
  gb.box(-0.4 * s, 0, -0.38 * s, 0.35 * s, 0.34 * s, 0.38 * s, d?.exclusive ? metal : headTop, metal);
  gb.box(-0.15 * s, 0.34 * s, -0.15 * s, 0.15 * s, 0.44 * s, 0.15 * s, dark, dark);
  const bar = (len: number, thick: number, z: number, y = 0.18): void => gbb.box(0.2 * s, (y - thick / 2) * s, (z - thick / 2) * s, (0.2 + len) * s, (y + thick / 2) * s, (z + thick / 2) * s, dark, metal);
  switch (key) {
    case 'autocannon':
      bar(0.8, 0.12, 0);
      break;
    case 'gatling':
      bar(0.7, 0.08, -0.08);
      bar(0.7, 0.08, 0.08);
      bar(0.7, 0.08, 0, 0.3);
      break;
    case 'flak':
      bar(0.6, 0.1, -0.14);
      bar(0.6, 0.1, 0.14);
      break;
    case 'laser':
      bar(1, 0.07, 0);
      gl.box(1.1 * s, 0.13 * s, -0.06 * s, 1.24 * s, 0.25 * s, 0.06 * s, glowFor('glow_red'), glowFor('glow_red'));
      break;
    case 'point_defense':
      bar(0.45, 0.05, -0.08);
      bar(0.45, 0.05, 0.08);
      gl.box(-0.1 * s, 0.34 * s, -0.1 * s, 0.1 * s, 0.4 * s, 0.1 * s, glowFor('glow_blue'), glowFor('glow_blue'));
      break;
    case 'missile_pod':
    case 'hydra': {
      gbb.box(-0.3 * s, 0.05 * s, -0.4 * s, 0.45 * s, 0.55 * s, 0.4 * s, metal, dark);
      const n = key === 'hydra' ? 4 : 2;
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
        const z = (-0.3 + (i * 0.6) / Math.max(1, n - 1)) * s, y = (0.18 + j * 0.24) * s;
        gl.box(0.45 * s, y - 0.05 * s, z - 0.05 * s, 0.47 * s, y + 0.05 * s, z + 0.05 * s, glowFor('glow_red'), glowFor('glow_red'));
      }
      break;
    }
    case 'mortar':
    case 'oblivion':
      gbb.box(-0.1 * s, 0.1 * s, -0.2 * s, 0.3 * s, 0.75 * s, 0.2 * s, dark, dark);
      if (key === 'oblivion') gl.box(0 * s, 0.75 * s, -0.12 * s, 0.2 * s, 0.8 * s, 0.12 * s, glowFor('glow_purple'), glowFor('glow_purple'));
      break;
    case 'tesla':
    case 'thunderhead': {
      const c = key === 'tesla' ? 'glow_purple' : 'glow_blue';
      gbb.box(-0.12 * s, 0.3 * s, -0.12 * s, 0.12 * s, 1.0 * s, 0.12 * s, metal, metal);
      for (let i = 0; i < 3; i++) gbb.box(-0.22 * s, (0.4 + i * 0.2) * s, -0.22 * s, 0.22 * s, (0.46 + i * 0.2) * s, 0.22 * s, dark, dark);
      gl.box(-0.18 * s, 1.0 * s, -0.18 * s, 0.18 * s, 1.3 * s, 0.18 * s, glowFor(c), glowFor(c));
      break;
    }
    case 'main_battery':
      bar(1.5, 0.2, 0, 0.2);
      gbb.box(1.55 * s, 0.07 * s, -0.16 * s, 1.75 * s, 0.33 * s, 0.16 * s, dark, dark);
      break;
    case 'rail_cannon':
      bar(1.8, 0.1, -0.12, 0.2);
      bar(1.8, 0.1, 0.12, 0.2);
      gl.box(0.3 * s, 0.16 * s, -0.04 * s, 1.9 * s, 0.24 * s, 0.04 * s, glowFor('glow_purple'), glowFor('glow_purple'));
      break;
    case 'sunspear':
      bar(1.6, 0.26, 0, 0.2);
      gl.box(1.7 * s, 0.1 * s, -0.1 * s, 1.85 * s, 0.3 * s, 0.1 * s, glowFor('glow_yellow'), glowFor('glow_yellow'));
      break;
    case 'maw':
      for (let i = -1; i <= 1; i++) for (let j = 0; j < 2; j++) bar(0.45, 0.1, i * 0.18, 0.12 + j * 0.16);
      break;
    default:
      bar(0.8, 0.12, 0);
  }
  const head = new Mesh(gb.build(), lit);
  head.castShadow = true;
  obj.add(head);
  const barrel = new Mesh(gbb.build(), lit);
  barrel.castShadow = true;
  const bpiv = new Group();
  bpiv.add(barrel);
  obj.add(bpiv);
  if (!gl.empty) bpiv.add(new Mesh(gl.build(), glow));
  return bpiv;
}

export function disposeModel(m: { root: Object3D }): void {
  m.root.traverse((o) => {
    if (o instanceof Mesh) o.geometry.dispose();
  });
}

/* ---------------------------------------------------------------------- */
/* World features                                                          */
/* ---------------------------------------------------------------------- */

let featureMat: MeshLambertMaterial | null = null;
let featureGlow: MeshBasicMaterial | null = null;

export function featureMats(): { lit: MeshLambertMaterial; glow: MeshBasicMaterial } {
  if (!featureMat) {
    const atlas = getAtlas();
    featureMat = withFow(new MeshLambertMaterial({ map: atlas.texture, vertexColors: true }));
    featureGlow = withFow(new MeshBasicMaterial({ map: atlas.texture, vertexColors: true }));
  }
  return { lit: featureMat, glow: featureGlow! };
}

export function buildNodeModel(type: NodeType, id: number): Object3D {
  const atlas = getAtlas();
  const { lit, glow } = featureMats();
  const gb = new GeoBuilder();
  const gl = new GeoBuilder();
  const tex = atlas.get(`node_${type}`);
  const info = NODE_INFO[type];
  const r = (k: number): number => hash2(id, k, 31);
  if (type === 'scrap') {
    for (let i = 0; i < 6; i++) {
      const a = r(i) * Math.PI * 2, d = r(i + 10) * 0.5;
      const w = 0.3 + r(i + 20) * 0.4;
      gb.cbox(Math.cos(a) * d, Math.sin(a) * d, w, w * 0.8, 0, 0.2 + r(i + 30) * 0.5, tex, tex);
    }
  } else if (type === 'cryo' || type === 'xenite' || type === 'uranium') {
    const c = type === 'cryo' ? 'glow_cyan' : type === 'xenite' ? 'glow_purple' : 'glow_green';
    gb.cbox(0, 0, 1.2, 1.1, 0, 0.35, tex, tex);
    for (let i = 0; i < 4; i++) {
      const a = r(i) * Math.PI * 2, d = 0.25 + r(i + 10) * 0.25;
      const h = 0.6 + r(i + 20) * 0.9;
      gl.cbox(Math.cos(a) * d, Math.sin(a) * d, 0.18, 0.18, 0.2, h, atlas.get(c), atlas.get(c));
    }
  } else if (type === 'biomass') {
    for (let i = 0; i < 4; i++) {
      const a = r(i) * Math.PI * 2, d = r(i + 10) * 0.5;
      const h = 0.3 + r(i + 20) * 0.5;
      gb.cbox(Math.cos(a) * d, Math.sin(a) * d, 0.12, 0.12, 0, h, atlas.get('stalk'), atlas.get('stalk'));
      gb.cbox(Math.cos(a) * d, Math.sin(a) * d, 0.45, 0.45, h, h + 0.18, tex, tex);
    }
  } else if (type === 'sulfur') {
    gb.cbox(0, 0, 1.3, 1.2, 0, 0.3, tex, tex);
    gb.cbox(0, 0, 0.6, 0.6, 0.3, 0.55, tex, tex);
    gl.cbox(0, 0, 0.25, 0.25, 0.55, 0.58, atlas.get('glow_yellow'), atlas.get('glow_yellow'));
  } else {
    gb.cbox(0, 0, 1.3, 1.1, 0, 0.5, tex, tex);
    gb.cbox(0.2, -0.15, 0.8, 0.7, 0.5, 0.95, tex, tex);
    gb.cbox(-0.35, 0.25, 0.5, 0.5, 0, 0.7, tex, tex);
  }
  const g = new Group();
  const m = new Mesh(gb.build(), lit);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  if (!gl.empty) g.add(new Mesh(gl.build(), glow));
  void info;
  return g;
}

export function buildRuneModel(rune: RuneKind): { root: Group; crystal: Object3D; beam: Mesh } {
  const atlas = getAtlas();
  const { lit, glow } = featureMats();
  const gb = new GeoBuilder();
  const stone = atlas.get('obs1_top'), stoneSide = atlas.get('obs1_side');
  gb.cbox(0, 0, 3, 3, 0, 0.3, stone, stoneSide);
  gb.cbox(0, 0, 2, 2, 0.3, 0.6, stone, stoneSide);
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) gb.cbox(x, z, 0.35, 0.35, 0.3, 1.6, stone, stoneSide);
  const root = new Group();
  const m = new Mesh(gb.build(), lit);
  m.castShadow = true;
  m.receiveShadow = true;
  root.add(m);
  const color = RUNE_INFO[rune].color;
  const crystal = new Mesh(new BoxGeometry(0.6, 0.9, 0.6), new MeshBasicMaterial({ color }));
  crystal.position.y = 1.8;
  crystal.rotation.set(0.6, 0, 0.6);
  root.add(crystal);
  const beam = new Mesh(new BoxGeometry(0.5, 30, 0.5), new MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }));
  beam.position.y = 15;
  root.add(beam);
  void glow;
  return { root, crystal, beam };
}

export function buildSiteModel(kind: string): { root: Group; beacon: Mesh } {
  const atlas = getAtlas();
  const { lit } = featureMats();
  const gb = new GeoBuilder();
  const wood = atlas.get('wood'), rust = atlas.get('rust'), metal = atlas.get('metal');
  // A salvage pile in the middle and a beacon mast.
  gb.cbox(0, 0, 1.4, 1, 0, 0.8, kind === 'hive' ? atlas.get('mush') : rust, kind === 'hive' ? atlas.get('stalk') : rust);
  gb.cbox(0.9, 0.4, 0.7, 0.7, 0, 0.7, wood, wood);
  gb.cbox(-0.8, -0.5, 0.6, 0.6, 0, 0.5, wood, wood);
  gb.cbox(-0.5, 0.7, 0.5, 0.9, 0, 0.35, metal, metal);
  gb.cbox(1.6, -1.2, 0.12, 0.12, 0, 2.6, metal, metal);
  const root = new Group();
  const m = new Mesh(gb.build(), lit);
  m.castShadow = true;
  root.add(m);
  const beacon = new Mesh(new BoxGeometry(0.3, 0.3, 0.3), new MeshBasicMaterial({ color: '#ffd740' }));
  beacon.position.set(1.6, 2.75, -1.2);
  root.add(beacon);
  return { root, beacon };
}

export function buildGateModel(): { root: Group; disc: Mesh } {
  const atlas = getAtlas();
  const { lit, glow } = featureMats();
  const gb = new GeoBuilder();
  const top = atlas.get('obs12_top'), side = atlas.get('obs12_side');
  gb.box(-5, 4.5, -5, 5, 5.2, -3.8, top, side);
  gb.box(-5, 4.5, 3.8, 5, 5.2, 5, top, side);
  const gl = new GeoBuilder();
  gl.box(-4, 5.2, -4.6, 4, 5.3, -4.2, atlas.get('glow_red'), atlas.get('glow_red'));
  gl.box(-4, 5.2, 4.2, 4, 5.3, 4.6, atlas.get('glow_red'), atlas.get('glow_red'));
  const root = new Group();
  root.add(new Mesh(gb.build(), lit));
  root.add(new Mesh(gl.build(), glow));
  const disc = new Mesh(new BoxGeometry(6, 0.05, 6), new MeshBasicMaterial({ color: '#ff1744', transparent: true, opacity: 0.55, depthWrite: false }));
  disc.position.y = 0.05;
  root.add(disc);
  return { root, disc };
}

/* ---------------------------------------------------------------------- */
/* Titans (voxel, animated)                                                */
/* ---------------------------------------------------------------------- */

export interface TitanModel {
  root: Group;
  legs: Object3D[];
  head: Object3D | null;
  mat: MeshLambertMaterial;
  segments: Object3D[];
}

export function buildTitanModel(kind: string, color: string): TitanModel {
  const mat = new MeshLambertMaterial({ color });
  const dark = new MeshLambertMaterial({ color: '#2a2622' });
  const eye = new MeshBasicMaterial({ color: '#ff1744' });
  const root = new Group();
  const legs: Object3D[] = [];
  const segments: Object3D[] = [];
  let head: Object3D | null = null;
  const box = (w: number, h: number, d: number, m: Material, x: number, y: number, z: number, parent: Object3D = root): Mesh => {
    const b = new Mesh(new BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = true;
    parent.add(b);
    return b;
  };
  if (kind === 'titan_walker') {
    box(4.4, 2.2, 3.6, mat, 0, 5.4, 0);
    box(3, 0.6, 2.6, dark, 0, 6.8, 0);
    const h = new Group();
    h.position.set(2.4, 5.8, 0);
    box(1.4, 1.2, 1.6, mat, 0, 0, 0, h);
    box(0.2, 0.3, 1.2, eye, 0.72, 0.1, 0, h);
    root.add(h);
    head = h;
    for (const [x, z] of [[1.5, 1.6], [-1.5, 1.6], [1.5, -1.6], [-1.5, -1.6]]) {
      const leg = new Group();
      leg.position.set(x, 4.8, z);
      box(0.8, 4.8, 0.8, dark, 0, -2.4, 0, leg);
      box(1.3, 0.5, 1.3, mat, 0, -4.6, 0, leg);
      root.add(leg);
      legs.push(leg);
    }
  } else if (kind === 'titan_beast') {
    box(5.5, 2.4, 2.8, mat, 0, 3, 0);
    box(2, 0.8, 2.6, dark, -0.5, 4.4, 0);
    for (let i = 0; i < 4; i++) box(0.4, 0.8, 0.3, new MeshLambertMaterial({ color: '#ff6d00' }), -1.8 + i * 1.1, 4.6, 0);
    const h = new Group();
    h.position.set(3.4, 3.2, 0);
    box(1.8, 1.5, 1.9, mat, 0, 0, 0, h);
    box(1.2, 0.4, 1.7, dark, 0.8, -0.6, 0, h);
    box(0.2, 0.3, 1.4, eye, 0.92, 0.3, 0, h);
    root.add(h);
    head = h;
    for (const [x, z] of [[2, 1.2], [-2, 1.2], [2, -1.2], [-2, -1.2]]) {
      const leg = new Group();
      leg.position.set(x, 2.2, z);
      box(0.9, 2.4, 0.9, dark, 0, -1.1, 0, leg);
      root.add(leg);
      legs.push(leg);
    }
  } else {
    // Worm: head and trailing segments (positioned each frame).
    const h = new Group();
    box(3.2, 3.2, 3.2, mat, 0, 1.4, 0, h);
    box(0.4, 1.8, 2.6, dark, 1.7, 1.2, 0, h);
    for (let i = 0; i < 5; i++) box(0.3, 0.8, 0.3, new MeshLambertMaterial({ color: '#fff8e1' }), 1.8, 0.4, -1.2 + i * 0.6, h);
    root.add(h);
    head = h;
    for (let k = 0; k < 5; k++) {
      const s = new Group();
      const sz = 2.8 * (1 - k * 0.1);
      box(sz, sz, sz, k % 2 ? mat : new MeshLambertMaterial({ color: '#a0804a' }), 0, sz / 2, 0, s);
      segments.push(s);
      root.parent?.add(s);
    }
  }
  return { root, legs, head, mat, segments };
}

export { DECK };
