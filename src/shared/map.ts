import type { DriveKey } from './types';

/** Ground terrain types (one per tile). */
export const TER = {
  RUST: 0, DIRT: 1, ROAD: 2, SAND: 3, DUNE: 4, ICE: 5, SNOW: 6, ASH: 7, BASALT: 8, LAVA: 9,
  GLASS: 10, CRATER: 11, MUD: 12, ACID: 13, CONCRETE: 14, METAL: 15, CAMP: 16, GRASS: 17,
} as const;
export type Ter = (typeof TER)[keyof typeof TER];

export interface TerrainDef {
  name: string;
  liquid: boolean;
  /** Minimap color. */
  color: string;
}

export const TERRAIN: TerrainDef[] = [];
TERRAIN[TER.RUST] = { name: 'Rust Flats', liquid: false, color: '#7a4a32' };
TERRAIN[TER.DIRT] = { name: 'Dirt', liquid: false, color: '#6a5540' };
TERRAIN[TER.ROAD] = { name: 'Old Road', liquid: false, color: '#4a4a50' };
TERRAIN[TER.SAND] = { name: 'Sand', liquid: false, color: '#c8a064' };
TERRAIN[TER.DUNE] = { name: 'Deep Dunes', liquid: false, color: '#e0b878' };
TERRAIN[TER.ICE] = { name: 'Ice Sheet', liquid: false, color: '#9cd6f0' };
TERRAIN[TER.SNOW] = { name: 'Snow', liquid: false, color: '#dfe8f4' };
TERRAIN[TER.ASH] = { name: 'Ash', liquid: false, color: '#4a4044' };
TERRAIN[TER.BASALT] = { name: 'Basalt', liquid: false, color: '#2e2a32' };
TERRAIN[TER.LAVA] = { name: 'Lava', liquid: true, color: '#ff5a14' };
TERRAIN[TER.GLASS] = { name: 'Fused Glass', liquid: false, color: '#5e9e58' };
TERRAIN[TER.CRATER] = { name: 'Crater Floor', liquid: false, color: '#46583e' };
TERRAIN[TER.MUD] = { name: 'Marsh Mud', liquid: false, color: '#3e3a26' };
TERRAIN[TER.ACID] = { name: 'Acid Pool', liquid: true, color: '#7cff3c' };
TERRAIN[TER.CONCRETE] = { name: 'Concrete', liquid: false, color: '#77777c' };
TERRAIN[TER.METAL] = { name: 'Deck Plating', liquid: false, color: '#5c646e' };
TERRAIN[TER.CAMP] = { name: 'Camp', liquid: false, color: '#8a7050' };
TERRAIN[TER.GRASS] = { name: 'Scrub', liquid: false, color: '#5c6a34' };

/** Speed multiplier for each drive train on each terrain (0 = impassable). */
const T = (rust: number, sand: number, dune: number, ice: number, snow: number, lava: number, mud: number, acid: number, road: number): number[] => {
  const t: number[] = [];
  t[TER.RUST] = rust; t[TER.DIRT] = rust; t[TER.ROAD] = road; t[TER.SAND] = sand; t[TER.DUNE] = dune;
  t[TER.ICE] = ice; t[TER.SNOW] = snow; t[TER.ASH] = rust * 0.95; t[TER.BASALT] = rust; t[TER.LAVA] = lava;
  t[TER.GLASS] = rust; t[TER.CRATER] = rust * 0.95; t[TER.MUD] = mud; t[TER.ACID] = acid;
  t[TER.CONCRETE] = road * 0.95; t[TER.METAL] = road * 0.95; t[TER.CAMP] = rust; t[TER.GRASS] = rust;
  return t;
};

export const TRACTION: Record<DriveKey, number[]> = {
  wheels: T(1, 0.6, 0.3, 0.42, 0.6, 0, 0.5, 0, 1.2),
  tracks: T(0.95, 1, 0.95, 0.5, 0.75, 0, 0.7, 0, 1.1),
  chains: T(0.92, 0.7, 0.4, 1, 1, 0, 0.6, 0, 1.05),
  magma: T(0.95, 0.85, 0.6, 0.8, 0.85, 0.9, 0.7, 0, 1.1),
  hover: T(1, 1, 0.9, 0.95, 0.95, 1, 1, 1, 1.1),
};

/** Obstacles are solid, raised blocks on a tile. */
export const OBS = {
  NONE: 0, ROCK: 1, BOULDER: 2, RUIN: 3, SANDSTONE: 4, ICE_SPIRE: 5, BASALT: 6, SHARD: 7, FUNGUS: 8,
  CLIFF: 9, WRECK: 10, WALL: 11, PILLAR: 12,
} as const;
export type Obs = (typeof OBS)[keyof typeof OBS];

export const OBS_COLOR: string[] = [];
OBS_COLOR[OBS.ROCK] = '#57524e';
OBS_COLOR[OBS.BOULDER] = '#6a6460';
OBS_COLOR[OBS.RUIN] = '#8a8680';
OBS_COLOR[OBS.SANDSTONE] = '#a8784a';
OBS_COLOR[OBS.ICE_SPIRE] = '#b8e8ff';
OBS_COLOR[OBS.BASALT] = '#221e26';
OBS_COLOR[OBS.SHARD] = '#8ef08a';
OBS_COLOR[OBS.FUNGUS] = '#8a4ab8';
OBS_COLOR[OBS.CLIFF] = '#3a3430';
OBS_COLOR[OBS.WRECK] = '#6a5446';
OBS_COLOR[OBS.WALL] = '#6e6e72';
OBS_COLOR[OBS.PILLAR] = '#3c3c50';

export const ZONE = { RUSTBELT: 0, DUNES: 1, CRYO: 2, GLASS: 3, MAGMA: 4, ACID: 5, EDGE: 6 } as const;
export type ZoneId = (typeof ZONE)[keyof typeof ZONE];

/**
 * How a mover interacts with liquids and obstacles. The `crush` modes belong to your fortress:
 * it is a full facility on treads and rolls straight over rocks, ruins and wrecks (only cliffs and pillars stop it).
 */
export type NavMode = 'ground' | 'magma' | 'hover' | 'air' | 'crush' | 'crushMagma' | 'crushHover';

export function navModeFor(drive: DriveKey, crush = false): NavMode {
  if (crush) return drive === 'hover' ? 'crushHover' : drive === 'magma' ? 'crushMagma' : 'crush';
  return drive === 'hover' ? 'hover' : drive === 'magma' ? 'magma' : 'ground';
}

export const isCrushMode = (m: NavMode): boolean => m === 'crush' || m === 'crushMagma' || m === 'crushHover';

/** Obstacles a fortress can roll over and flatten. */
export const crushable = (o: number): boolean => o !== OBS.NONE && o !== OBS.CLIFF && o !== OBS.PILLAR;

export class GameMap {
  readonly size: number;
  readonly ter: Uint8Array;
  readonly obs: Uint8Array;
  /** Obstacle height in half-units. */
  readonly oh: Uint8Array;
  readonly zone: Uint8Array;
  private clearCache = new Map<NavMode, Uint8Array>();

  constructor(size: number) {
    this.size = size;
    const n = size * size;
    this.ter = new Uint8Array(n);
    this.obs = new Uint8Array(n);
    this.oh = new Uint8Array(n);
    this.zone = new Uint8Array(n);
  }

  inside(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.size && ty < this.size;
  }

  idx(tx: number, ty: number): number {
    return ty * this.size + tx;
  }

  terAt(x: number, y: number): number {
    const tx = Math.floor(x), ty = Math.floor(y);
    return this.inside(tx, ty) ? this.ter[ty * this.size + tx] : TER.DIRT;
  }

  zoneAt(x: number, y: number): number {
    const tx = Math.floor(x), ty = Math.floor(y);
    return this.inside(tx, ty) ? this.zone[ty * this.size + tx] : ZONE.EDGE;
  }

  solid(tx: number, ty: number): boolean {
    return !this.inside(tx, ty) || this.obs[ty * this.size + tx] !== 0;
  }

  /** True if a mover with this nav mode can't enter the tile. */
  blocked(tx: number, ty: number, mode: NavMode): boolean {
    if (!this.inside(tx, ty)) return true;
    const i = ty * this.size + tx;
    if (mode === 'air') return false;
    const o = this.obs[i];
    if (o !== 0 && !(isCrushMode(mode) && crushable(o))) return true;
    const t = this.ter[i];
    if (t === TER.LAVA) return mode === 'ground' || mode === 'crush';
    if (t === TER.ACID) return mode !== 'hover' && mode !== 'crushHover';
    return false;
  }

  /** Distance (in tiles) from each tile to the nearest blocked tile, for sizing paths to big tanks. */
  clearance(mode: NavMode): Uint8Array {
    let c = this.clearCache.get(mode);
    if (!c) {
      c = computeClearance(this, mode);
      this.clearCache.set(mode, c);
    }
    return c;
  }

  /** Clearance at a tile in tiles (approximate Euclidean distance to the nearest blocked tile centre). */
  clearAt(tx: number, ty: number, mode: NavMode): number {
    if (!this.inside(tx, ty)) return 0;
    return this.clearance(mode)[ty * this.size + tx] / 3;
  }

  /** Drops cached clearance. Crushing obstacles only changes the non-crush modes. */
  invalidateNav(onlyObstacleModes = false): void {
    if (!onlyObstacleModes) {
      this.clearCache.clear();
      return;
    }
    for (const m of [...this.clearCache.keys()]) if (!isCrushMode(m)) this.clearCache.delete(m);
  }

  /** Flattens a crushable obstacle. Returns true if something was there. */
  crush(tx: number, ty: number): boolean {
    if (!this.inside(tx, ty)) return false;
    const i = ty * this.size + tx;
    if (!crushable(this.obs[i])) return false;
    this.obs[i] = OBS.NONE;
    this.oh[i] = 0;
    return true;
  }
}

/** Two-pass 3-4 chamfer distance transform (values are 3 x distance in tiles, capped at 255). */
function computeClearance(map: GameMap, mode: NavMode): Uint8Array {
  const n = map.size;
  const d = new Uint16Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) d[y * n + x] = map.blocked(x, y, mode) ? 0 : 1000;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      let v = d[i];
      if (v === 0) continue;
      if (x === 0 || y === 0) v = Math.min(v, 3);
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - n] + 3);
        if (x > 0) v = Math.min(v, d[i - n - 1] + 4);
        if (x < n - 1) v = Math.min(v, d[i - n + 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let y = n - 1; y >= 0; y--) {
    for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x;
      let v = d[i];
      if (v === 0) continue;
      if (x === n - 1 || y === n - 1) v = Math.min(v, 3);
      if (x < n - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < n - 1) {
        v = Math.min(v, d[i + n] + 3);
        if (x < n - 1) v = Math.min(v, d[i + n + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + n - 1] + 4);
      }
      d[i] = v;
    }
  }
  const out = new Uint8Array(n * n);
  for (let i = 0; i < d.length; i++) out[i] = Math.min(255, d[i]);
  return out;
}
