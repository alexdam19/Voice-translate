import type { DriveKey } from './types';

/** Ground terrain types (one per tile). */
export const TER = {
  RUST: 0, DIRT: 1, ROAD: 2, SAND: 3, DUNE: 4, ICE: 5, SNOW: 6, ASH: 7, BASALT: 8, LAVA: 9,
  GLASS: 10, CRATER: 11, MUD: 12, ACID: 13, CONCRETE: 14, METAL: 15, CAMP: 16, GRASS: 17, WATER: 18,
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
// Rivers are fordable (slow going), unlike the acid lakes.
TERRAIN[TER.WATER] = { name: 'River', liquid: false, color: '#2f5f7a' };

/** Speed multiplier for each drive train on each terrain (0 = impassable). */
const T = (rust: number, sand: number, dune: number, ice: number, snow: number, lava: number, mud: number, acid: number, road: number): number[] => {
  const t: number[] = [];
  t[TER.RUST] = rust; t[TER.DIRT] = rust; t[TER.ROAD] = road; t[TER.SAND] = sand; t[TER.DUNE] = dune;
  t[TER.ICE] = ice; t[TER.SNOW] = snow; t[TER.ASH] = rust * 0.95; t[TER.BASALT] = rust; t[TER.LAVA] = lava;
  t[TER.GLASS] = rust; t[TER.CRATER] = rust * 0.95; t[TER.MUD] = mud; t[TER.ACID] = acid;
  t[TER.CONCRETE] = road * 0.95; t[TER.METAL] = road * 0.95; t[TER.CAMP] = rust; t[TER.GRASS] = rust; t[TER.WATER] = Math.max(0.35, mud * 0.6);
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
  CLIFF: 9, WRECK: 10, WALL: 11, PILLAR: 12, TREE: 13,
  /** The Mega Hangar compound's fortified wall and towers, and its buildings: nothing crushes or climbs them. */
  BASTION: 14, STRUCT: 15,
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
OBS_COLOR[OBS.TREE] = '#3e5a2a';
OBS_COLOR[OBS.BASTION] = '#5c6068';
OBS_COLOR[OBS.STRUCT] = '#7a7266';

/** The Crater's zones (see shared/crater.ts for where they are). */
export const ZONE = {
  VERDANT: 0, ASH: 1, SCORCHED: 2, FROST: 3, WRAITH: 4, DUNES: 5, LAKE: 6, SPIRES: 7, PASS: 8, RUSTBOLT: 9, DIVOT: 10, EDGE: 11,
} as const;
export type ZoneId = (typeof ZONE)[keyof typeof ZONE];

/**
 * How a mover interacts with liquids and obstacles. The `crush` modes belong to fortress-class hulls (yours and
 * rivals): nothing stops them. They flatten rocks, ruins and wrecks, climb cliffs slowly and wade through lava
 * and acid (which hurts without the right drive train).
 */
export type NavMode = 'ground' | 'magma' | 'hover' | 'air' | 'crush' | 'crushMagma' | 'crushHover';

export function navModeFor(drive: DriveKey, crush = false): NavMode {
  if (crush) return drive === 'hover' ? 'crushHover' : drive === 'magma' ? 'crushMagma' : 'crush';
  return drive === 'hover' ? 'hover' : drive === 'magma' ? 'magma' : 'ground';
}

export const isCrushMode = (m: NavMode): boolean => m === 'crush' || m === 'crushMagma' || m === 'crushHover';

/** Obstacles a fortress can roll over and flatten. */
export const crushable = (o: number): boolean => o !== OBS.NONE && o !== OBS.CLIFF && o !== OBS.PILLAR && o !== OBS.BASTION && o !== OBS.STRUCT;
/** Walls a Titan can't crush or climb and a horde can't clamber over: only a gate gets you through. */
export const hardObs = (o: number): boolean => o === OBS.BASTION || o === OBS.STRUCT;

/** Map chunks are CHUNK x CHUNK tiles. */
export const CH = 32;
const CH_SHIFT = 5;
const CH_MASK = CH - 1;

export interface Prop {
  x: number;
  y: number;
  kind: string;
  s: number;
  rot: number;
  /** Tint variant 0..3. */
  v: number;
  /** Flattened by a passing fortress. */
  gone?: boolean;
}

/** One CH x CH block of the world. */
export interface MapChunk {
  cx: number;
  cy: number;
  ter: Uint8Array;
  obs: Uint8Array;
  /** Obstacle height in half-units. */
  oh: Uint8Array;
  zone: Uint8Array;
  props: Prop[];
  /** Changed since it was generated (kept in memory; everything else can be regenerated). */
  touched: boolean;
  /** Clearance per nav mode (3 x distance in tiles to the nearest blocked tile, capped). */
  clear: Map<NavMode, Uint8Array>;
  /** Last time it was used (eviction). */
  used: number;
}

/** Fills a freshly allocated chunk (terrain, obstacles, zones, props). */
export type ChunkFiller = (c: MapChunk, map: GameMap) => void;

/** How far clearance looks for obstacles (tiles). Paths for bigger hulls treat anything wider as open. */
export const CLEAR_REACH = 9;

/**
 * The world, streamed: tiles live in chunks that are generated from the seed when first touched and dropped again
 * when far away (unless something changed them). This is what lets the world be enormous.
 */
export class GameMap {
  readonly size: number;
  readonly cps: number;
  private chunks: (MapChunk | undefined)[];
  private live = 0;
  private tick = 0;
  filler: ChunkFiller | null;
  /** Called when a chunk is generated (feature streaming hooks in here). */
  onChunk: ((c: MapChunk) => void) | null = null;

  constructor(size: number, filler: ChunkFiller | null = null) {
    this.size = size;
    this.cps = Math.ceil(size / CH);
    this.chunks = new Array(this.cps * this.cps);
    this.filler = filler;
  }

  inside(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.size && ty < this.size;
  }

  /** The chunk holding tile (tx, ty), generating it if needed. */
  chunkAtTile(tx: number, ty: number): MapChunk {
    return this.chunk(tx >> CH_SHIFT, ty >> CH_SHIFT);
  }

  chunk(cx: number, cy: number): MapChunk {
    const k = cy * this.cps + cx;
    let c = this.chunks[k];
    if (c) {
      c.used = this.tick;
      return c;
    }
    const n = CH * CH;
    c = { cx, cy, ter: new Uint8Array(n), obs: new Uint8Array(n), oh: new Uint8Array(n), zone: new Uint8Array(n), props: [], touched: false, clear: new Map(), used: this.tick };
    this.chunks[k] = c;
    this.live++;
    if (this.filler) this.filler(c, this);
    this.onChunk?.(c);
    return c;
  }

  /** The chunk if it's in memory. */
  peek(cx: number, cy: number): MapChunk | undefined {
    if (cx < 0 || cy < 0 || cx >= this.cps || cy >= this.cps) return undefined;
    return this.chunks[cy * this.cps + cx];
  }

  get loaded(): number {
    return this.live;
  }

  getTer(tx: number, ty: number): number {
    if (!this.inside(tx, ty)) return TER.DIRT;
    return this.chunkAtTile(tx, ty).ter[((ty & CH_MASK) << CH_SHIFT) | (tx & CH_MASK)];
  }

  getObs(tx: number, ty: number): number {
    if (!this.inside(tx, ty)) return OBS.CLIFF;
    return this.chunkAtTile(tx, ty).obs[((ty & CH_MASK) << CH_SHIFT) | (tx & CH_MASK)];
  }

  getOh(tx: number, ty: number): number {
    if (!this.inside(tx, ty)) return 0;
    return this.chunkAtTile(tx, ty).oh[((ty & CH_MASK) << CH_SHIFT) | (tx & CH_MASK)];
  }

  getZone(tx: number, ty: number): number {
    if (!this.inside(tx, ty)) return ZONE.EDGE;
    return this.chunkAtTile(tx, ty).zone[((ty & CH_MASK) << CH_SHIFT) | (tx & CH_MASK)];
  }

  /** Writes a tile (world generation, the Dead Zone arena, crushing). */
  set(tx: number, ty: number, v: { ter?: number; obs?: number; oh?: number; zone?: number }): void {
    if (!this.inside(tx, ty)) return;
    const c = this.chunkAtTile(tx, ty);
    const i = ((ty & CH_MASK) << CH_SHIFT) | (tx & CH_MASK);
    if (v.ter !== undefined) c.ter[i] = v.ter;
    if (v.obs !== undefined) c.obs[i] = v.obs;
    if (v.oh !== undefined) c.oh[i] = v.oh;
    if (v.zone !== undefined) c.zone[i] = v.zone;
  }

  terAt(x: number, y: number): number {
    return this.getTer(Math.floor(x), Math.floor(y));
  }

  zoneAt(x: number, y: number): number {
    return this.getZone(Math.floor(x), Math.floor(y));
  }

  solid(tx: number, ty: number): boolean {
    return !this.inside(tx, ty) || this.getObs(tx, ty) !== 0;
  }

  /** True if a mover with this nav mode can't enter the tile. */
  blocked(tx: number, ty: number, mode: NavMode): boolean {
    if (!this.inside(tx, ty)) return true;
    if (mode === 'air') return false;
    const c = this.chunkAtTile(tx, ty);
    const i = ((ty & CH_MASK) << CH_SHIFT) | (tx & CH_MASK);
    // Nothing crushes or climbs the Mega Hangar compound's wall and buildings.
    if (isCrushMode(mode)) return hardObs(c.obs[i]);
    if (c.obs[i] !== 0) return true;
    const t = c.ter[i];
    if (t === TER.LAVA) return mode === 'ground';
    if (t === TER.ACID) return mode !== 'hover';
    return false;
  }

  /** Clearance at a tile, 3 x tiles to the nearest blocked tile (capped at CLEAR_REACH tiles). */
  clearRaw(tx: number, ty: number, mode: NavMode): number {
    if (!this.inside(tx, ty)) return 0;
    const c = this.chunkAtTile(tx, ty);
    let cl = c.clear.get(mode);
    if (!cl) {
      cl = this.computeClearance(c, mode);
      c.clear.set(mode, cl);
    }
    return cl[((ty & CH_MASK) << CH_SHIFT) | (tx & CH_MASK)];
  }

  /** Clearance at a tile in tiles (approximate Euclidean distance to the nearest blocked tile centre). */
  clearAt(tx: number, ty: number, mode: NavMode): number {
    return this.clearRaw(tx, ty, mode) / 3;
  }

  /** Drops cached clearance. Crushing obstacles only changes the non-crush modes. */
  invalidateNav(onlyObstacleModes = false): void {
    for (const c of this.chunks) {
      if (!c) continue;
      if (!onlyObstacleModes) c.clear.clear();
      else for (const m of [...c.clear.keys()]) if (!isCrushMode(m)) c.clear.delete(m);
    }
  }

  /** Drops every mode's cached clearance for the chunks within `r` tiles of a spot (a gate opened or shut). */
  invalidateNavNear(tx: number, ty: number, r: number): void {
    for (let cy = (ty - r) >> CH_SHIFT; cy <= (ty + r) >> CH_SHIFT; cy++) for (let cx = (tx - r) >> CH_SHIFT; cx <= (tx + r) >> CH_SHIFT; cx++) this.peek(cx, cy)?.clear.clear();
  }

  /** Flattens a crushable obstacle. Returns true if something was there. */
  crush(tx: number, ty: number): boolean {
    if (!this.inside(tx, ty)) return false;
    const c = this.chunkAtTile(tx, ty);
    const i = ((ty & CH_MASK) << CH_SHIFT) | (tx & CH_MASK);
    if (!crushable(c.obs[i])) return false;
    c.obs[i] = OBS.NONE;
    c.oh[i] = 0;
    c.touched = true;
    // Neighbouring chunks' clearance can reach across the border.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.peek(c.cx + dx, c.cy + dy)?.clear.forEach((_, m) => !isCrushMode(m) && this.peek(c.cx + dx, c.cy + dy)!.clear.delete(m));
    return true;
  }

  /** Frees chunks far from (x, y) that nothing changed. */
  evict(x: number, y: number, keep: number): void {
    this.tick++;
    const kx = Math.floor(x / CH), ky = Math.floor(y / CH);
    const r = Math.ceil(keep / CH);
    for (let k = 0; k < this.chunks.length; k++) {
      const c = this.chunks[k];
      if (!c || c.touched) continue;
      if (Math.abs(c.cx - kx) <= r && Math.abs(c.cy - ky) <= r) continue;
      this.chunks[k] = undefined;
      this.live--;
    }
  }

  /** Every chunk in memory. */
  *loadedChunks(): IterableIterator<MapChunk> {
    for (const c of this.chunks) if (c) yield c;
  }

  /** Two-pass 3-4 chamfer distance transform over the chunk plus a margin. */
  private computeClearance(c: MapChunk, mode: NavMode): Uint8Array {
    const M = CLEAR_REACH;
    const W = CH + M * 2;
    const d = new Uint16Array(W * W);
    const x0 = c.cx * CH - M, y0 = c.cy * CH - M;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const tx = x0 + x, ty = y0 + y;
        // Margins outside loaded chunks count as open (they'll be checked when they load).
        let blocked: boolean;
        if (!this.inside(tx, ty)) blocked = true;
        else if (x >= M && x < M + CH && y >= M && y < M + CH) {
          const i = ((ty & CH_MASK) << CH_SHIFT) | (tx & CH_MASK);
          blocked = mode === 'air' ? false : isCrushMode(mode) ? hardObs(c.obs[i]) : c.obs[i] !== 0 || (c.ter[i] === TER.LAVA && mode === 'ground') || (c.ter[i] === TER.ACID && mode !== 'hover');
        } else {
          const nc = this.peek(tx >> CH_SHIFT, ty >> CH_SHIFT);
          if (!nc) blocked = false;
          else {
            const i = ((ty & CH_MASK) << CH_SHIFT) | (tx & CH_MASK);
            blocked = mode === 'air' ? false : isCrushMode(mode) ? hardObs(nc.obs[i]) : nc.obs[i] !== 0 || (nc.ter[i] === TER.LAVA && mode === 'ground') || (nc.ter[i] === TER.ACID && mode !== 'hover');
          }
        }
        d[y * W + x] = blocked ? 0 : 1000;
      }
    }
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let v = d[i];
        if (v === 0) continue;
        if (x > 0) v = Math.min(v, d[i - 1] + 3);
        if (y > 0) {
          v = Math.min(v, d[i - W] + 3);
          if (x > 0) v = Math.min(v, d[i - W - 1] + 4);
          if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4);
        }
        d[i] = v;
      }
    }
    for (let y = W - 1; y >= 0; y--) {
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        let v = d[i];
        if (v === 0) continue;
        if (x < W - 1) v = Math.min(v, d[i + 1] + 3);
        if (y < W - 1) {
          v = Math.min(v, d[i + W] + 3);
          if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4);
          if (x > 0) v = Math.min(v, d[i + W - 1] + 4);
        }
        d[i] = v;
      }
    }
    const out = new Uint8Array(CH * CH);
    const cap = M * 3;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) out[y * CH + x] = Math.min(cap, d[(y + M) * W + x + M]);
    return out;
  }
}
