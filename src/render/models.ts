import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, type Material } from 'three';
import { NODE_INFO, type NodeType, type RuneKind, RUNE_INFO } from '../shared/mapgen';
import { hash2 } from '../shared/rng';
import { WEAPONS } from '../shared/weapons';
import { MODULES } from '../game/defs';
import type { Tank } from '../game/tank';

/** The model is built at half-unit cells, then scaled to the tank's real cell size. */
const CELL = 0.5;
const TREAD = 0.5;
import { withFow } from './fow';
import { GeoBuilder, type UVRect } from './geo';
import { getAtlas, treadTexture } from './textures';

const DECK = 0.78;

/** World height of a tank's deck surface. */
export const deckHeight = (t: Tank): number => DECK * (t.cell / 0.5);

export interface TankModel {
  root: Group;
  turrets: Map<number, { obj: Object3D; barrel: Object3D | null }>;
  lit: MeshLambertMaterial;
  glow: MeshBasicMaterial;
  treadMat: MeshLambertMaterial;
  version: number;
  radars: Object3D[];
  /** Afterburner nozzles in tank-local world units (forward, up, right). */
  exhaust: { lx: number; y: number; lz: number }[];
}

function palKey(t: Tank): string {
  if (t.kind === 'outrider') return 'outrider';
  if (t.kind === 'outpost') return 'outpost';
  if (t.kind === 'remote') return 'remote';
  if (t.kind === 'rival') return 'rival';
  return t.team === 'player' ? 'player' : 'enemy';
}

/** Fortress-class hulls (yours, rivals, other players) get the land-cruiser body. */
export const isDreadHull = (t: Tank): boolean => t.kind === 'main' || t.kind === 'rival' || t.kind === 'remote';

/** How far the nose and the afterburners stick out past the deck, in model units. */
export const NOSE = 0.8;
export const TAIL = 0.6;

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
  const dread = isDreadHull(t);
  const exhaust: { lx: number; y: number; lz: number }[] = [];
  const accent = atlas.get(pal === 'rival' || pal === 'enemy' ? 'glow_red' : pal === 'remote' ? 'glow_purple' : 'glow_cyan');
  if (dread) {
    // Land-cruiser running gear: three tracks a side under armored, stepped skirts.
    const TL = L + 0.3;
    for (const s of [-1, 1]) {
      for (let b = 0; b < 3; b++) {
        const a0 = W / 2 + b * 0.175, a1 = a0 + 0.15;
        const z0 = s < 0 ? -a1 : a0, z1 = s < 0 ? -a0 : a1;
        tr.box(-TL / 2, 0.04, z0, TL / 2, 0.6, z1, { u0: 0, v0: 0, u1: TL * 2, v1: 1 }, { u0: 0, v0: 0, u1: TL * 2, v1: 1 });
        // Drive sprockets up front.
        gb.box(TL / 2 - 0.05, 0.12, z0 + 0.01, TL / 2 + 0.12, 0.5, z1 - 0.01, dark, dark);
      }
      const zi = s < 0 ? -W / 2 - 0.52 : W / 2, zo = s < 0 ? -W / 2 : W / 2 + 0.52;
      // Skirt: a long armored slab with a lower lip, stepping down front and back.
      gb.box(-TL / 2 + 0.35, 0.6, zi, TL / 2 - 0.45, 0.8, zo, hull, hull);
      gb.box(TL / 2 - 0.45, 0.6, zi + (s < 0 ? 0.08 : 0), TL / 2 - 0.1, 0.72, zo - (s > 0 ? 0.08 : 0), hull, hull);
      gb.box(-TL / 2 + 0.05, 0.6, zi + (s < 0 ? 0.08 : 0), -TL / 2 + 0.35, 0.72, zo - (s > 0 ? 0.08 : 0), hull, hull);
      const zl = s < 0 ? -W / 2 - 0.56 : W / 2 + 0.52;
      gb.box(-TL / 2 + 0.5, 0.36, zl, TL / 2 - 0.6, 0.64, zl + 0.04, trim, dark);
      // Running lights along the skirt.
      gl.box(-TL / 2 + 0.7, 0.66, s < 0 ? zo - 0.53 : zo - 0.01, TL / 2 - 0.8, 0.7, s < 0 ? zo - 0.51 : zo + 0.01, accent, accent);
    }
    // Hull body.
    gb.box(-L / 2, 0.25, -W / 2, L / 2, DECK, W / 2, deck, hull);
    // Wedge nose: a sloped glacis, a chin plow and a visor of light.
    gb.wedgeX(L / 2, L / 2 + NOSE, 0.18, DECK, -W / 2 + 0.12, W / 2 - 0.12, -1, trim, hull);
    gb.box(L / 2 + NOSE - 0.25, 0.06, -W / 2 + 0.4, L / 2 + NOSE + 0.08, 0.3, W / 2 - 0.4, dark, dark);
    gl.box(L / 2 + 0.06, DECK - 0.12, -W / 2 + 0.35, L / 2 + 0.14, DECK - 0.05, W / 2 - 0.35, accent, accent);
    for (const s of [-1, 1]) gl.box(L / 2 + NOSE - 0.3, 0.3, s * (W / 2 - 0.35) - 0.08, L / 2 + NOSE - 0.22, 0.4, s * (W / 2 - 0.35) + 0.08, atlas.get('glow_yellow'), atlas.get('glow_yellow'));
    // A raised armored rim around the deck, with a light strip down each side.
    for (const s of [-1, 1]) {
      gb.box(-L / 2, DECK - 0.07, s < 0 ? -W / 2 - 0.06 : W / 2 - 0.1, L / 2, DECK + 0.08, s < 0 ? -W / 2 + 0.1 : W / 2 + 0.06, hull, trim);
      gb.box(s < 0 ? -L / 2 : L / 2 - 0.12, DECK - 0.07, -W / 2 + 0.1, s < 0 ? -L / 2 + 0.12 : L / 2, DECK + 0.08, W / 2 - 0.1, hull, trim);
      gl.box(-L / 2 + 0.3, DECK - 0.04, s < 0 ? -W / 2 - 0.08 : W / 2 + 0.06, L / 2 - 0.3, DECK + 0.02, s < 0 ? -W / 2 - 0.06 : W / 2 + 0.08, accent, accent);
    }
    // Tail: an afterburner block with three nozzles, and two swept fins with tail lights.
    gb.box(-L / 2 - TAIL, 0.28, -W * 0.24, -L / 2, 0.74, W * 0.24, dark, dark);
    for (const [z, w] of [[0, 0.16], [-W * 0.15, 0.09], [W * 0.15, 0.09]] as const) {
      gl.box(-L / 2 - TAIL - 0.03, 0.51 - w, z - w, -L / 2 - TAIL + 0.02, 0.51 + w, z + w, atlas.get('glow_orange'), atlas.get('glow_orange'));
      exhaust.push({ lx: (-L / 2 - TAIL - 0.1) * (t.cell / CELL), y: 0.51 * (t.cell / CELL), lz: z * (t.cell / CELL) });
    }
    for (const s of [-1, 1]) {
      const z0 = s * (W / 2 - 0.34) - 0.07, z1 = z0 + 0.14;
      gb.box(-L / 2 - 0.25, DECK, z0, -L / 2 + 0.7, DECK + 0.35, z1, hull, hull);
      gb.box(-L / 2 - 0.25, DECK + 0.35, z0, -L / 2 + 0.3, DECK + 0.75, z1, hull, hull);
      gb.box(-L / 2 - 0.25, DECK + 0.75, z0, -L / 2 - 0.02, DECK + 0.95, z1, trim, hull);
      gl.box(-L / 2 - 0.28, DECK + 0.2, z0 + 0.02, -L / 2 - 0.24, DECK + 0.6, z1 - 0.02, atlas.get('glow_red'), atlas.get('glow_red'));
    }
  } else if (!anchored) {
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
  if (!dread) {
    // Hull body.
    gb.box(-L / 2, 0.25, -W / 2, L / 2, DECK, W / 2, deck, hull);
    // Glacis (front armour) and rear exhaust.
    if (!anchored) {
      gb.box(L / 2, 0.22, -W / 2 + 0.1, L / 2 + 0.28, DECK - 0.12, W / 2 - 0.1, trim, hull);
      gb.box(-L / 2 - 0.18, 0.35, -W / 4, -L / 2, 0.65, W / 4, dark, dark);
    }
    // Side trim stripes (team color).
    gb.box(-L / 2 + 0.1, DECK - 0.1, -W / 2 - 0.02, L / 2 - 0.1, DECK - 0.02, W / 2 + 0.02, trim, trim);
  }
  const turrets = new Map<number, { obj: Object3D; barrel: Object3D | null }>();
  const radars: Object3D[] = [];
  for (const m of t.modules) {
    const d = MODULES[m.key];
    const lx = (t.rows / 2 - (m.cy + d.h / 2)) * CELL;
    const lz = (m.cx + d.w / 2 - t.cols / 2) * CELL;
    const fx = d.h * CELL - 0.06, fz = d.w * CELL - 0.06; // footprint along x (length) and z (width)
    if (!m.built) {
      // Under construction: a scaffold slab with hazard stripes.
      gb.box(lx - fx / 2, DECK, lz - fz / 2, lx + fx / 2, DECK + 0.12, lz + fz / 2, atlas.get('hazard'), atlas.get('darkmetal'));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gb.box(lx + sx * (fx / 2 - 0.05) - 0.03, DECK, lz + sz * (fz / 2 - 0.05) - 0.03, lx + sx * (fx / 2 - 0.05) + 0.03, DECK + 0.5, lz + sz * (fz / 2 - 0.05) + 0.03, metal, metal);
      continue;
    }
    const h = m.key === 'main_gun' ? 0.3 : m.key === 'pad' ? 0.24 : d.hardpoint ? 0.18 : d.height * 0.75;
    const top = atlas.get(`mod_${m.key}`);
    gb.box(lx - fx / 2, DECK, lz - fz / 2, lx + fx / 2, DECK + h, lz + fz / 2, top, side);
    const y1 = DECK + h;
    switch (m.key) {
      case 'pad':
        // An armored sponson: chamfered corners and a light at each one.
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) gl.box(lx + sx * (fx / 2 - 0.06) - 0.03, y1, lz + sz * (fz / 2 - 0.06) - 0.03, lx + sx * (fx / 2 - 0.06) + 0.03, y1 + 0.04, lz + sz * (fz / 2 - 0.06) + 0.03, accent, accent);
        break;
      case 'main_gun':
        // A heavy ring the turret sits on.
        gb.box(lx - fx * 0.42, y1, lz - fz * 0.42, lx + fx * 0.42, y1 + 0.08, lz + fz * 0.42, dark, dark);
        break;
      case 'tesla':
        gb.box(lx - 0.04, y1, lz - 0.04, lx + 0.04, y1 + 0.7, lz + 0.04, metal, metal);
        for (let i = 0; i < 3; i++) gb.box(lx - 0.16 + i * 0.03, y1 + 0.2 + i * 0.18, lz - 0.16 + i * 0.03, lx + 0.16 - i * 0.03, y1 + 0.26 + i * 0.18, lz + 0.16 - i * 0.03, trim, metal);
        gl.box(lx - 0.08, y1 + 0.7, lz - 0.08, lx + 0.08, y1 + 0.86, lz + 0.08, atlas.get('glow_blue'), atlas.get('glow_blue'));
        break;
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
      case 'science_lab':
        gl.box(lx - 0.25, y1, lz - 0.25, lx + 0.25, y1 + 0.35, lz + 0.25, atlas.get('glow_cyan'), atlas.get('glow_cyan'));
        gb.box(lx + 0.3, y1, lz + 0.2, lx + 0.4, y1 + 0.5, lz + 0.3, metal, metal);
        break;
      case 'forge':
        gb.box(lx + fx * 0.2, y1, lz + fz * 0.2, lx + fx * 0.38, y1 + 0.8, lz + fz * 0.38, dark, dark);
        gl.box(lx - 0.2, y1, lz - 0.2, lx + 0.1, y1 + 0.08, lz + 0.1, atlas.get('glow_orange'), atlas.get('glow_orange'));
        break;
      case 'arcane_sanctum':
        gb.box(lx - 0.3, y1, lz - 0.3, lx + 0.3, y1 + 0.08, lz + 0.3, dark, dark);
        gl.box(lx - 0.1, y1 + 0.25, lz - 0.1, lx + 0.1, y1 + 0.65, lz + 0.1, atlas.get('glow_purple'), atlas.get('glow_purple'));
        break;
      case 'command_uplink':
      case 'airstrike':
        gb.box(lx - 0.04, y1, lz - 0.04, lx + 0.04, y1 + 1.1, lz + 0.04, metal, metal);
        gl.box(lx - 0.07, y1 + 1.1, lz - 0.07, lx + 0.07, y1 + 1.2, lz + 0.07, atlas.get('glow_red'), atlas.get('glow_red'));
        break;
      case 'jet_hangar': {
        // A mini fighter jet parked on the catapult.
        const jy = y1 + 0.05;
        gb.box(lx - 0.45, jy, lz - 0.08, lx + 0.45, jy + 0.14, lz + 0.08, atlas.get('white'), metal);
        gb.box(lx - 0.1, jy + 0.02, lz - 0.45, lx + 0.12, jy + 0.08, lz + 0.45, metal, metal);
        gb.box(lx - 0.45, jy + 0.1, lz - 0.02, lx - 0.3, jy + 0.35, lz + 0.02, metal, metal);
        gl.box(lx + 0.15, jy + 0.12, lz - 0.05, lx + 0.3, jy + 0.18, lz + 0.05, atlas.get('glow_cyan'), atlas.get('glow_cyan'));
        break;
      }
      case 'drone_bay':
        for (const [ox, oz] of [[-0.25, -0.25], [0.25, 0.25]]) {
          gb.box(lx + ox - 0.12, y1 + 0.05, lz + oz - 0.12, lx + ox + 0.12, y1 + 0.12, lz + oz + 0.12, metal, metal);
          gl.box(lx + ox - 0.04, y1 + 0.12, lz + oz - 0.04, lx + ox + 0.04, y1 + 0.16, lz + oz + 0.04, atlas.get('glow_blue'), atlas.get('glow_blue'));
        }
        break;
      case 'salvo_rack':
        gb.box(lx - fx * 0.35, y1, lz - fz * 0.4, lx + fx * 0.35, y1 + 0.3, lz + fz * 0.4, dark, metal);
        break;
      case 'teleporter':
      case 'chrono_engine': {
        const c = m.key === 'teleporter' ? 'glow_cyan' : 'glow_blue';
        gl.box(lx - 0.35, y1, lz - 0.35, lx + 0.35, y1 + 0.04, lz + 0.35, atlas.get(c), atlas.get(c));
        gb.box(lx - 0.25, y1, lz - 0.25, lx + 0.25, y1 + 0.06, lz + 0.25, dark, dark);
        break;
      }
      case 'dome_projector':
        gl.box(lx - 0.22, y1, lz - 0.22, lx + 0.22, y1 + 0.3, lz + 0.22, atlas.get('glow_green'), atlas.get('glow_green'));
        break;
      case 'nuke_silo':
        gb.box(lx - fx * 0.4, y1, lz - fz * 0.4, lx - 0.03, y1 + 0.06, lz + fz * 0.4, atlas.get('hazard'), dark);
        gb.box(lx + 0.03, y1, lz - fz * 0.4, lx + fx * 0.4, y1 + 0.06, lz + fz * 0.4, atlas.get('hazard'), dark);
        gl.box(lx - 0.08, y1 + 0.06, lz - 0.08, lx + 0.08, y1 + 0.14, lz + 0.08, atlas.get('glow_yellow'), atlas.get('glow_yellow'));
        break;
      case 'mech_bay':
        gb.box(lx - 0.3, y1, lz - 0.35, lx + 0.1, y1 + 0.5, lz - 0.1, atlas.get('rust'), metal);
        gb.box(lx - 0.3, y1, lz + 0.1, lx + 0.1, y1 + 0.5, lz + 0.35, atlas.get('rust'), metal);
        gb.box(lx - 0.35, y1 + 0.5, lz - 0.4, lx + 0.2, y1 + 0.95, lz + 0.4, metal, atlas.get('rust'));
        gl.box(lx + 0.2, y1 + 0.7, lz - 0.2, lx + 0.22, y1 + 0.8, lz + 0.2, atlas.get('glow_cyan'), atlas.get('glow_cyan'));
        break;
      case 'orbital':
        gb.box(lx - 0.05, y1, lz - 0.05, lx + 0.05, y1 + 0.5, lz + 0.05, metal, metal);
        gb.box(lx - 0.35, y1 + 0.5, lz - 0.35, lx + 0.35, y1 + 0.58, lz + 0.35, atlas.get('white'), metal);
        gl.box(lx - 0.06, y1 + 0.58, lz - 0.06, lx + 0.06, y1 + 0.66, lz + 0.06, atlas.get('glow_red'), atlas.get('glow_red'));
        break;
      case 'obelisk':
        gb.box(lx - 0.15, y1, lz - 0.15, lx + 0.15, y1 + 1.5, lz + 0.15, dark, dark);
        gl.box(lx - 0.16, y1 + 0.3, lz - 0.02, lx + 0.16, y1 + 1.4, lz + 0.02, atlas.get('glow_orange'), atlas.get('glow_orange'));
        break;
      case 'dragon_roost':
        for (const [ox, oz] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]) gb.box(lx + ox - 0.15, y1, lz + oz - 0.15, lx + ox + 0.15, y1 + 0.25, lz + oz + 0.15, atlas.get('wood'), atlas.get('wood'));
        gl.box(lx - 0.12, y1, lz - 0.1, lx + 0.12, y1 + 0.3, lz + 0.1, atlas.get('glow_orange'), atlas.get('glow_orange'));
        break;
      case 'storm_engine':
        gb.box(lx - 0.1, y1, lz - 0.1, lx + 0.1, y1 + 1.2, lz + 0.1, metal, metal);
        for (let i = 0; i < 3; i++) gb.box(lx - 0.28, y1 + 0.3 + i * 0.3, lz - 0.28, lx + 0.28, y1 + 0.36 + i * 0.3, lz + 0.28, dark, dark);
        gl.box(lx - 0.2, y1 + 1.2, lz - 0.2, lx + 0.2, y1 + 1.5, lz + 0.2, atlas.get('glow_blue'), atlas.get('glow_blue'));
        break;
    }
    if (d.hardpoint) {
      const obj = new Group();
      obj.position.set(lx, y1 + (m.key === 'main_gun' ? 0.08 : 0), lz);
      root.add(obj);
      let barrel: Object3D | null = null;
      if (m.weapon && m.key === 'main_gun') barrel = buildMainTurret(obj, m.weapon.key, lit, glow, accent, hull);
      else if (m.weapon) barrel = buildTurret(obj, m.weapon.key, WEAPONS[m.weapon.key]?.size ?? d.hardpoint, lit, glow);
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
  // Build at model scale, then grow to the real size (your fortress is 2x).
  const k = t.cell / CELL;
  if (k !== 1) {
    const inner = new Group();
    for (const c of [...root.children]) inner.add(c);
    inner.scale.setScalar(k);
    root.add(inner);
  }
  return { root, turrets, lit, glow, treadMat, version: t.version, radars, exhaust };
}

/**
 * The main battery: a wide, faceted turret with a commander's cupola and twin long barrels with muzzle brakes.
 * Returns the barrel group (it recoils).
 */
function buildMainTurret(obj: Object3D, key: string, lit: Material, glow: Material, accent: UVRect, hull: UVRect): Object3D {
  const atlas = getAtlas();
  const gb = new GeoBuilder();
  const gbb = new GeoBuilder();
  const gl = new GeoBuilder();
  const metal = atlas.get('metal'), dark = atlas.get('darkmetal');
  // Housing: a low block with a sloped face, stepped cheeks and a rear bustle.
  gb.box(-0.8, 0, -0.78, 0.45, 0.46, 0.78, hull, hull);
  gb.wedgeX(0.45, 0.95, 0.04, 0.46, -0.62, 0.62, -1, metal, hull);
  gb.box(-1.05, 0.06, -0.6, -0.8, 0.4, 0.6, dark, dark);
  gb.box(-0.45, 0.46, 0.18, -0.1, 0.64, 0.5, metal, dark);
  gl.box(0.3, 0.3, -0.5, 0.36, 0.36, 0.5, accent, accent);
  gl.box(-0.3, 0.64, 0.28, -0.2, 0.68, 0.4, atlas.get(WEAPONS[key]?.exclusive ? 'glow_orange' : 'glow_red'), atlas.get('glow_red'));
  // Twin barrels with fume extractors and muzzle brakes.
  for (const z of [-0.3, 0.3]) {
    gbb.box(0.7, 0.2, z - 0.07, 2.6, 0.34, z + 0.07, dark, metal);
    gbb.box(1.4, 0.18, z - 0.1, 1.7, 0.36, z + 0.1, metal, metal);
    gbb.box(2.5, 0.16, z - 0.12, 2.8, 0.38, z + 0.12, dark, dark);
  }
  obj.add(new Mesh(gb.build(), lit));
  const barrel = new Group();
  const bm = new Mesh(gbb.build(), lit);
  bm.castShadow = true;
  barrel.add(bm);
  obj.add(barrel);
  obj.add(new Mesh(gl.build(), glow));
  return barrel;
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
    case 'grenade_launcher':
      bar(0.55, 0.2, 0, 0.2);
      gbb.box(0.1 * s, 0.05 * s, -0.25 * s, 0.35 * s, 0.35 * s, 0.25 * s, dark, dark);
      break;
    case 'scattergun':
      bar(0.6, 0.1, -0.1);
      bar(0.6, 0.1, 0.1);
      gbb.box(0.75 * s, 0.05 * s, -0.22 * s, 0.85 * s, 0.32 * s, 0.22 * s, dark, dark);
      break;
    case 'raygun':
      bar(0.6, 0.1, 0);
      for (let i = 0; i < 3; i++) gbb.box((0.3 + i * 0.15) * s, 0.05 * s, -0.14 * s, (0.36 + i * 0.15) * s, 0.31 * s, 0.14 * s, metal, metal);
      gl.box(0.8 * s, 0.1 * s, -0.07 * s, 0.9 * s, 0.26 * s, 0.07 * s, glowFor('glow_green'), glowFor('glow_green'));
      break;
    case 'cryo_blaster':
      bar(0.7, 0.12, 0);
      gl.box(0.3 * s, 0.3 * s, -0.08 * s, 0.6 * s, 0.4 * s, 0.08 * s, glowFor('glow_cyan'), glowFor('glow_cyan'));
      break;
    case 'flamethrower':
    case 'dragons_breath': {
      bar(0.6, 0.14, 0);
      gbb.box(-0.3 * s, 0.35 * s, -0.2 * s, 0.1 * s, 0.6 * s, 0.2 * s, key === 'dragons_breath' ? metal : dark, dark);
      gl.box(0.8 * s, 0.12 * s, -0.06 * s, 0.86 * s, 0.24 * s, 0.06 * s, glowFor('glow_orange'), glowFor('glow_orange'));
      if (key === 'dragons_breath') gl.box(-0.25 * s, 0.6 * s, -0.12 * s, 0.05 * s, 0.75 * s, 0.12 * s, glowFor('glow_red'), glowFor('glow_red'));
      break;
    }
    case 'acid_launcher':
    case 'kraken':
      bar(0.5, 0.22, 0, 0.25);
      gl.box(-0.2 * s, 0.35 * s, -0.15 * s, 0.1 * s, 0.55 * s, 0.15 * s, glowFor(key === 'kraken' ? 'glow_purple' : 'glow_green'), glowFor(key === 'kraken' ? 'glow_purple' : 'glow_green'));
      break;
    case 'soul_reaper':
    case 'arcane_orb':
      bar(0.4, 0.1, 0);
      gl.box(0.45 * s, 0.1 * s, -0.12 * s, 0.7 * s, 0.35 * s, 0.12 * s, glowFor('glow_purple'), glowFor('glow_purple'));
      break;
    case 'swarm_hive':
      gbb.box(-0.35 * s, 0.05 * s, -0.4 * s, 0.4 * s, 0.6 * s, 0.4 * s, metal, dark);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) gl.box(0.4 * s, (0.1 + j * 0.16) * s, (-0.3 + i * 0.3) * s - 0.03 * s, 0.42 * s, (0.16 + j * 0.16) * s, (-0.3 + i * 0.3) * s + 0.03 * s, glowFor('glow_orange'), glowFor('glow_orange'));
      break;
    case 'hornet_nest':
      // A catapult rail with a mini jet ready to launch.
      gbb.box(-0.4 * s, 0.05 * s, -0.08 * s, 0.6 * s, 0.12 * s, 0.08 * s, metal, dark);
      gbb.box(-0.2 * s, 0.14 * s, -0.06 * s, 0.35 * s, 0.26 * s, 0.06 * s, atlas.get('white'), metal);
      gbb.box(-0.05 * s, 0.16 * s, -0.3 * s, 0.1 * s, 0.2 * s, 0.3 * s, metal, metal);
      gl.box(0.35 * s, 0.18 * s, -0.03 * s, 0.4 * s, 0.22 * s, 0.03 * s, glowFor('glow_cyan'), glowFor('glow_cyan'));
      break;
    case 'plasma_launcher':
    case 'chrono_cannon':
      bar(1, 0.2, 0, 0.2);
      gl.box(0.4 * s, 0.32 * s, -0.12 * s, 0.9 * s, 0.38 * s, 0.12 * s, glowFor(key === 'plasma_launcher' ? 'glow_purple' : 'glow_cyan'), glowFor(key === 'plasma_launcher' ? 'glow_purple' : 'glow_cyan'));
      break;
    case 'sonic_cannon':
      bar(0.4, 0.2, 0);
      gbb.box(0.6 * s, -0.05 * s, -0.35 * s, 0.75 * s, 0.45 * s, 0.35 * s, metal, dark);
      break;
    case 'howitzer':
      bar(1.9, 0.26, 0, 0.3);
      gbb.box(-0.2 * s, 0.02 * s, -0.45 * s, 0.4 * s, 0.5 * s, 0.45 * s, dark, metal);
      break;
    case 'ray_rail':
      bar(1.8, 0.12, -0.16, 0.2);
      bar(1.3, 0.1, 0.18, 0.2);
      gl.box(0.3 * s, 0.14 * s, -0.2 * s, 1.9 * s, 0.26 * s, -0.12 * s, glowFor('glow_purple'), glowFor('glow_purple'));
      gl.box(1.4 * s, 0.14 * s, 0.13 * s, 1.55 * s, 0.26 * s, 0.23 * s, glowFor('glow_green'), glowFor('glow_green'));
      break;
    case 'storm_spire':
    case 'stormcaller':
      gbb.box(-0.1 * s, 0.3 * s, -0.1 * s, 0.1 * s, 1.5 * s, 0.1 * s, metal, metal);
      for (let i = 0; i < 4; i++) gbb.box(-0.25 * s, (0.5 + i * 0.25) * s, -0.25 * s, 0.25 * s, (0.55 + i * 0.25) * s, 0.25 * s, dark, dark);
      gl.box(-0.15 * s, 1.5 * s, -0.15 * s, 0.15 * s, 1.8 * s, 0.15 * s, glowFor('glow_blue'), glowFor('glow_blue'));
      break;
    case 'gravity_cannon':
    case 'void_lance':
      bar(1.5, 0.3, 0, 0.22);
      gl.box(1.3 * s, 0.05 * s, -0.2 * s, 1.75 * s, 0.4 * s, 0.2 * s, glowFor('glow_purple'), glowFor('glow_purple'));
      break;
    case 'phoenix_launcher':
      bar(1.2, 0.3, 0, 0.22);
      gl.box(0.3 * s, 0.38 * s, -0.25 * s, 1.1 * s, 0.44 * s, 0.25 * s, glowFor('glow_orange'), glowFor('glow_orange'));
      break;
    case 'starfall':
      gbb.box(-0.3 * s, 0.3 * s, -0.3 * s, 0.3 * s, 0.5 * s, 0.3 * s, metal, dark);
      gl.box(-0.2 * s, 0.5 * s, -0.2 * s, 0.2 * s, 1.2 * s, 0.2 * s, glowFor('glow_yellow'), glowFor('glow_yellow'));
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

/* ---------------------------------------------------------------------- */
/* Summoned units: jets, drones, mechs, dragons, mines                     */
/* ---------------------------------------------------------------------- */

const allyMats = new Map<string, MeshLambertMaterial | MeshBasicMaterial>();
function amat(color: string, glow = false): MeshLambertMaterial | MeshBasicMaterial {
  const k = `${color}:${glow}`;
  let m = allyMats.get(k);
  if (!m) {
    m = glow ? new MeshBasicMaterial({ color }) : new MeshLambertMaterial({ color });
    allyMats.set(k, m);
  }
  return m;
}

const UNIT = new BoxGeometry(1, 1, 1);
function vox(parent: Object3D, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, glow = false): Mesh {
  const m = new Mesh(UNIT, amat(color, glow));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = !glow;
  parent.add(m);
  return m;
}

export interface AllyModel {
  root: Group;
  /** Parts that animate: wings, legs, rotors. */
  parts: Object3D[];
}

/** Voxel models for summoned units. Local +X is forward. */
export function buildAllyModel(kind: string): AllyModel {
  const root = new Group();
  const parts: Object3D[] = [];
  switch (kind) {
    case 'jet': {
      vox(root, '#eceff1', 0, 0, 0, 1.1, 0.18, 0.2);
      vox(root, '#90a4ae', -0.1, 0, 0, 0.3, 0.06, 1.1);
      vox(root, '#90a4ae', -0.45, 0.02, 0, 0.18, 0.05, 0.5);
      vox(root, '#90a4ae', -0.45, 0.15, 0, 0.15, 0.28, 0.04);
      vox(root, '#18ffff', 0.25, 0.1, 0, 0.22, 0.08, 0.12, true);
      vox(root, '#ff9100', -0.58, 0, 0, 0.08, 0.1, 0.12, true);
      break;
    }
    case 'buggy': {
      vox(root, '#ffb300', 0, 0.35, 0, 1.3, 0.28, 0.7);
      vox(root, '#5d4037', -0.1, 0.55, 0, 0.6, 0.16, 0.62);
      vox(root, '#37474f', -0.15, 0.85, 0, 0.08, 0.5, 0.6);
      vox(root, '#263238', 0.15, 0.78, 0, 0.5, 0.1, 0.1);
      vox(root, '#ffe57f', 0.66, 0.4, 0.22, 0.04, 0.08, 0.12, true);
      vox(root, '#ffe57f', 0.66, 0.4, -0.22, 0.04, 0.08, 0.12, true);
      for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
        const w = vox(root, '#212121', x, 0.2, z, 0.4, 0.4, 0.18);
        parts.push(w);
      }
      break;
    }
    case 'drone': {
      vox(root, '#546e7a', 0, 0, 0, 0.35, 0.12, 0.35);
      vox(root, '#40c4ff', 0.18, 0, 0, 0.06, 0.06, 0.1, true);
      for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
        const r = vox(root, '#b0bec5', x, 0.08, z, 0.28, 0.02, 0.04);
        parts.push(r);
      }
      break;
    }
    case 'mech': {
      const body = new Group();
      body.position.y = 1.5;
      root.add(body);
      vox(body, '#ff8f00', 0, 0.3, 0, 1.2, 0.8, 1.3);
      vox(body, '#37474f', 0.2, 0.8, 0, 0.7, 0.35, 0.8);
      vox(body, '#18ffff', 0.56, 0.85, 0, 0.04, 0.12, 0.5, true);
      // Arm cannon and missile pod.
      vox(body, '#455a64', 0.6, 0.2, 0.8, 1.4, 0.26, 0.26);
      vox(body, '#455a64', 0, 0.5, -0.85, 0.7, 0.5, 0.4);
      vox(body, '#ff1744', 0.36, 0.55, -0.85, 0.02, 0.3, 0.3, true);
      for (const z of [-0.35, 0.35]) {
        const leg = new Group();
        leg.position.set(0, 1.5, z);
        vox(leg, '#5d4037', 0, -0.75, 0, 0.35, 1.5, 0.35);
        vox(leg, '#37474f', 0.1, -1.45, 0, 0.7, 0.15, 0.45);
        root.add(leg);
        parts.push(leg);
      }
      break;
    }
    case 'dragon': {
      vox(root, '#b71c1c', 0, 0, 0, 2.2, 0.6, 0.7);
      vox(root, '#d32f2f', 1.4, 0.25, 0, 0.8, 0.35, 0.35);
      vox(root, '#b71c1c', 1.95, 0.3, 0, 0.6, 0.4, 0.5);
      vox(root, '#ffd740', 2.2, 0.42, 0.14, 0.08, 0.08, 0.08, true);
      vox(root, '#ffd740', 2.2, 0.42, -0.14, 0.08, 0.08, 0.08, true);
      vox(root, '#ffcc80', 1.9, 0.6, 0.18, 0.3, 0.08, 0.06);
      vox(root, '#ffcc80', 1.9, 0.6, -0.18, 0.3, 0.08, 0.06);
      vox(root, '#8e0000', -1.5, -0.05, 0, 1.2, 0.3, 0.3);
      vox(root, '#ff6d00', -2.15, -0.05, 0, 0.3, 0.25, 0.4, true);
      vox(root, '#ffab40', 0, -0.3, 0, 1.8, 0.1, 0.5);
      for (const side of [-1, 1]) {
        const wing = new Group();
        wing.position.set(0.2, 0.25, side * 0.35);
        vox(wing, '#7f0000', 0, 0, side * 1.1, 1.4, 0.06, 2.2);
        vox(wing, '#ff5252', -0.4, 0.02, side * 1.4, 0.6, 0.04, 1.4);
        root.add(wing);
        parts.push(wing);
      }
      break;
    }
    case 'mine': {
      vox(root, '#424242', 0, 0.06, 0, 0.45, 0.12, 0.45);
      vox(root, '#ff1744', 0, 0.14, 0, 0.1, 0.05, 0.1, true);
      break;
    }
    default:
      vox(root, '#1565c0', 0, 0.3, 0, 0.3, 0.6, 0.3);
  }
  return { root, parts };
}
