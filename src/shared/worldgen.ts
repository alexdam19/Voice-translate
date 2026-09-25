import { WORLD_H, WORLD_W, ZONE_W } from './constants';
import { Perlin } from './noise';
import { RNG, hash1, hash2 } from './rng';
import { T, TILES, W } from './tiles';
import { lerp, smoothstep } from './types';
import { World } from './world';
import { ZONES, zoneIndexAt } from './zones';

export interface CacheSpawn {
  id: number;
  /** Tile coords of the cell the cache occupies (it rests on the tile below). */
  x: number;
  y: number;
  table: string;
}

export interface OutpostSpawn {
  id: number;
  /** Left tile column. */
  x: number;
  /** Ground row (top of the ground tile) under the outpost. */
  ground: number;
  zone: number;
}

export interface GenResult {
  world: World;
  spawnX: number;
  caches: CacheSpawn[];
  outposts: OutpostSpawn[];
  checkpoint: { x: number; ground: number };
}

export const SPAWN_X = 2000;
export const CHECKPOINT_X = 2330;
const OUTPOST_W = 46;

/* ---------------------------------------------------------------------- */
/* Heightmaps                                                              */
/* ---------------------------------------------------------------------- */

function zoneHeight(zi: number, x: number, pn: Perlin): number {
  const base = 150;
  const t = (x - zi * ZONE_W) / ZONE_W;
  switch (ZONES[zi].key) {
    case 'rustbelt':
      return base + pn.fbm1(x * 0.008, 4) * 16 + pn.noise1(x * 0.05 + 30) * 2;
    case 'dunes': {
      const phase = pn.fbm1(x * 0.004 + 50, 2) * 4;
      const s = 0.5 + 0.5 * Math.sin(x * 0.028 + phase);
      return base - 4 + pn.fbm1(x * 0.005 + 10, 3) * 10 - 20 * s * s;
    }
    case 'glass': {
      const d = (t - 0.5) / 0.38;
      const bowl = Math.abs(d) < 1 ? 1 - d * d : 0;
      const rim = Math.exp(-Math.pow((Math.abs(d) - 1) * 5, 2));
      return base + pn.fbm1(x * 0.01 + 70, 3) * 6 + bowl * 46 - rim * 9;
    }
    case 'cryo': {
      const period = 74;
      const p = (((x % period) + period) % period) / period;
      const tri = 1 - Math.abs(p * 2 - 1);
      const peakH = 16 + (pn.noise1(Math.floor(x / period) * 1.7 + 5) + 0.7) * 22;
      return base - 6 + pn.fbm1(x * 0.01 + 90, 3) * 6 - smoothstep(tri) * peakH;
    }
    case 'magma':
      return base + 4 + pn.fbm1(x * 0.009 + 120, 4) * 14;
    case 'acid':
      return base + 10 + pn.fbm1(x * 0.006 + 160, 3) * 4;
    default:
      return base;
  }
}

function blendedHeight(x: number, pn: Perlin): number {
  const zi = zoneIndexAt(x);
  const lx = x - zi * ZONE_W;
  const B = 50;
  const h = zoneHeight(zi, x, pn);
  if (lx < B && zi > 0) {
    return lerp(zoneHeight(zi - 1, x, pn), h, smoothstep(0.5 + lx / (2 * B)));
  }
  if (lx > ZONE_W - B && zi < ZONES.length - 1) {
    return lerp(h, zoneHeight(zi + 1, x, pn), smoothstep((lx - (ZONE_W - B)) / (2 * B)));
  }
  return h;
}

function flatten(h: Float32Array, a: number, b: number, ramp: number): number {
  let sum = 0;
  for (let x = a; x <= b; x++) sum += h[x];
  const target = Math.round(sum / (b - a + 1));
  for (let x = a - ramp; x <= b + ramp; x++) {
    if (x < 0 || x >= h.length) continue;
    const t = x < a ? smoothstep((x - (a - ramp)) / ramp) : x > b ? smoothstep((b + ramp - x) / ramp) : 1;
    h[x] = lerp(h[x], target, t);
  }
  return target;
}

/** Dithered zone choice for materials so zone borders blend instead of hard-cutting. */
function materialZone(x: number, seed: number): number {
  const zi = zoneIndexAt(x);
  const lx = x - zi * ZONE_W;
  const B = 36;
  const r = hash1(x, seed + 5);
  if (lx < B && zi > 0 && r < 0.5 - lx / (2 * B)) return zi - 1;
  if (lx > ZONE_W - B && zi < ZONES.length - 1 && r < 0.5 - (ZONE_W - lx) / (2 * B)) return zi + 1;
  return zi;
}

/* ---------------------------------------------------------------------- */
/* Ores                                                                    */
/* ---------------------------------------------------------------------- */

interface OreRule {
  t: number;
  dMin: number;
  scale: number;
  thr: number;
}

const ORES: Record<string, OreRule[]> = {
  rustbelt: [
    { t: T.IRON, dMin: 4, scale: 0.12, thr: 0.4 },
    { t: T.COPPER, dMin: 4, scale: 0.12, thr: 0.43 },
    { t: T.SCRAP, dMin: 1, scale: 0.1, thr: 0.45 },
    { t: T.TITANIUM, dMin: 90, scale: 0.1, thr: 0.5 },
  ],
  dunes: [
    { t: T.TITANIUM, dMin: 18, scale: 0.11, thr: 0.41 },
    { t: T.COPPER, dMin: 8, scale: 0.12, thr: 0.45 },
    { t: T.IRON, dMin: 8, scale: 0.12, thr: 0.46 },
  ],
  glass: [
    { t: T.URANIUM, dMin: 4, scale: 0.11, thr: 0.41 },
    { t: T.IRON, dMin: 6, scale: 0.12, thr: 0.46 },
    { t: T.TITANIUM, dMin: 30, scale: 0.11, thr: 0.47 },
  ],
  cryo: [
    { t: T.CRYSTAL, dMin: 4, scale: 0.12, thr: 0.41 },
    { t: T.TITANIUM, dMin: 24, scale: 0.11, thr: 0.46 },
    { t: T.IRON, dMin: 8, scale: 0.12, thr: 0.46 },
  ],
  magma: [
    { t: T.SULFUR, dMin: 3, scale: 0.12, thr: 0.4 },
    { t: T.TITANIUM, dMin: 16, scale: 0.11, thr: 0.45 },
    { t: T.XENITE, dMin: 70, scale: 0.1, thr: 0.48 },
  ],
  acid: [
    { t: T.XENITE, dMin: 8, scale: 0.11, thr: 0.42 },
    { t: T.URANIUM, dMin: 24, scale: 0.11, thr: 0.47 },
    { t: T.SULFUR, dMin: 12, scale: 0.12, thr: 0.47 },
  ],
};

const HOST_ROCK = new Set<number>([T.ROCK, T.SANDSTONE, T.BASALT, T.ICE, T.DIRT, T.MUD, T.SAND, T.GLASS]);

/* ---------------------------------------------------------------------- */
/* Structures                                                              */
/* ---------------------------------------------------------------------- */

class Builder {
  constructor(
    public world: World,
    public rng: RNG,
    public caches: CacheSpawn[],
  ) {}

  private cacheId = 1;

  wallRect(x0: number, y0: number, w: number, h: number, wall: number): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.world.setWall(x, y, wall);
  }

  tileRect(x0: number, y0: number, w: number, h: number, t: number, onlyAir = false): void {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const cur = this.world.get(x, y);
        if (cur === T.BEDROCK) continue;
        if (onlyAir && cur !== T.AIR) continue;
        this.world.setRaw(x, y, t);
      }
    }
  }

  cache(x: number, y: number, table: string): void {
    this.caches.push({ id: this.cacheId++, x, y, table });
  }

  /** Ruined high-rise: background walls + one-way floors so rigs can roll past. */
  tower(x0: number, ground: number, w: number, floors: number, zoneKey: string): void {
    const fh = 6;
    const top = ground - floors * fh;
    const wallA = zoneKey === 'acid' ? W.PIPES : W.CONCRETE;
    for (let x = x0; x < x0 + w; x++) {
      const collapse = this.rng.int(0, 2);
      for (let y = top + collapse; y < ground; y++) {
        const edge = x === x0 || x === x0 + w - 1;
        const band = (y - top) % fh;
        let wall: number = edge ? W.METAL : wallA;
        if (!edge && band >= 2 && band <= 3 && (x - x0) % 3 !== 0) wall = W.WINDOWS;
        if (this.rng.chance(0.06)) wall = W.NONE;
        this.world.setWall(x, y, wall);
      }
    }
    // collapsed crown
    const bite = this.rng.int(2, Math.max(3, Math.floor(w / 2)));
    const side = this.rng.chance(0.5);
    for (let i = 0; i < bite; i++) {
      const x = side ? x0 + i : x0 + w - 1 - i;
      for (let y = top; y < top + bite - i + 2; y++) this.world.setWall(x, y, W.NONE);
    }
    // floors
    for (let f = 1; f <= floors; f++) {
      const fy = ground - f * fh;
      for (let x = x0 + 1; x < x0 + w - 1; x++) {
        if (this.rng.chance(0.12)) continue;
        if (this.world.get(x, fy) === T.AIR) this.world.setRaw(x, fy, T.PLATFORM);
      }
      if (this.rng.chance(0.45)) this.cache(x0 + this.rng.int(2, w - 3), fy - 1, `cache_${zoneKey}`);
      if (this.rng.chance(0.5)) {
        const lx = x0 + this.rng.int(2, w - 3);
        if (this.world.get(lx, fy + 1) === T.AIR) this.world.setRaw(lx, fy + 1, T.LAMP);
      }
    }
    // neon billboard on the roof
    if (this.rng.chance(0.55)) {
      const bw = Math.min(w - 2, this.rng.int(5, 9));
      const bx = x0 + 1 + this.rng.int(0, Math.max(0, w - 2 - bw));
      this.wallRect(bx, top - 5, bw, 3, this.rng.chance(0.5) ? W.NEON_PINK : W.NEON_CYAN);
      this.wallRect(bx + 1, top - 2, 1, 2, W.GIRDER);
      this.wallRect(bx + bw - 2, top - 2, 1, 2, W.GIRDER);
    }
  }

  /** A sealed underground room with a cache inside. */
  bunker(x0: number, y0: number, w: number, h: number, zoneKey: string): void {
    for (let y = y0 - 1; y <= y0 + h; y++) {
      for (let x = x0 - 1; x <= x0 + w; x++) {
        if (this.world.get(x, y) === T.BEDROCK) return;
      }
    }
    for (let y = y0 - 1; y <= y0 + h; y++) {
      for (let x = x0 - 1; x <= x0 + w; x++) {
        const border = y === y0 - 1 || y === y0 + h || x === x0 - 1 || x === x0 + w;
        if (border) {
          this.world.setRaw(x, y, T.PLATE);
        } else {
          this.world.setRaw(x, y, T.AIR);
          this.world.setWall(x, y, (x - x0) % 5 === 0 ? W.PIPES : W.METAL);
        }
      }
    }
    this.world.setRaw(x0 + Math.floor(w / 2), y0, T.LAMP);
    this.cache(x0 + this.rng.int(1, w - 2), y0 + h - 1, `cache_${zoneKey}`);
    if (w > 10) this.cache(x0 + this.rng.int(1, w - 2), y0 + h - 1, `cache_${zoneKey}`);
  }

  /** Background pylon with a lamp on top. */
  pylon(x: number, ground: number): void {
    const h = this.rng.int(9, 15);
    this.wallRect(x, ground - h, 1, h, W.GIRDER);
    this.wallRect(x - 1, ground - h, 3, 1, W.GIRDER);
    if (this.world.get(x, ground - h - 1) === T.AIR) this.world.setRaw(x, ground - h - 1, T.LAMP);
  }

  /** Half-buried ribs of a colossal war machine. */
  colossus(x0: number, ground: number): void {
    const ribs = this.rng.int(4, 7);
    const r = this.rng.int(10, 16);
    for (let i = 0; i < ribs; i++) {
      const cx = x0 + i * 5;
      for (let a = 0; a < Math.PI; a += 0.04) {
        const x = Math.round(cx + Math.cos(a) * 3);
        const y = Math.round(ground + 4 - Math.sin(a) * (r - Math.abs(i - ribs / 2) * 1.5));
        this.world.setWall(x, y, W.GIRDER);
        this.world.setWall(x + 1, y, W.GIRDER);
      }
    }
    // spine
    for (let x = x0 - 3; x < x0 + ribs * 5 + 2; x++) {
      const y = Math.round(ground - r + 2 + Math.sin((x - x0) * 0.2) * 1.5);
      this.world.setWall(x, y, W.METAL);
      this.world.setWall(x, y + 1, W.METAL);
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Main generator                                                          */
/* ---------------------------------------------------------------------- */

export function generateWorld(seed: number): GenResult {
  const Wd = WORLD_W, H = WORLD_H;
  const world = new World(Wd, H);
  const rng = new RNG(seed ^ 0x5eed);
  const pn = new Perlin(seed);
  const pc = new Perlin(seed + 11);
  const pc2 = new Perlin(seed + 23);
  const po = new Perlin(seed + 37);
  const caches: CacheSpawn[] = [];
  const b = new Builder(world, rng, caches);

  // 1. Heightmap ---------------------------------------------------------
  const heights = new Float32Array(Wd);
  for (let x = 0; x < Wd; x++) heights[x] = blendedHeight(x, pn);

  flatten(heights, SPAWN_X - 30, SPAWN_X + 70, 30);
  flatten(heights, CHECKPOINT_X - 26, CHECKPOINT_X + 26, 30);

  const outposts: OutpostSpawn[] = [];
  const outpostSites: [number, number][] = [
    [0, 0.3], [0, 0.72], [1, 0.3], [1, 0.72], [2, 0.08], [3, 0.3], [3, 0.72], [4, 0.26], [4, 0.74], [5, 0.3], [5, 0.72],
  ];
  const reserved: [number, number][] = [[SPAWN_X - 60, SPAWN_X + 100], [CHECKPOINT_X - 40, CHECKPOINT_X + 40]];
  let oid = 1;
  for (const [zi, t] of outpostSites) {
    const x = Math.round(zi * ZONE_W + t * ZONE_W);
    flatten(heights, x - 4, x + OUTPOST_W + 4, 40);
    outposts.push({ id: oid++, x, ground: 0, zone: zi });
    reserved.push([x - 20, x + OUTPOST_W + 20]);
  }
  const isReserved = (x: number): boolean => reserved.some(([a, c]) => x >= a && x <= c);

  // Acid pools and magma chasms
  const pool = new Float32Array(Wd);
  for (let x = 5 * ZONE_W + 40; x < Wd - 10; x++) {
    if (isReserved(x)) continue;
    const n = pn.noise1(x * 0.035 + 400);
    if (n > 0.1) pool[x] = Math.min(1, (n - 0.1) * 5) * 6;
  }

  const surf = new Int16Array(Wd);
  for (let x = 0; x < Wd; x++) surf[x] = Math.round(heights[x]);
  // Rigs can climb ~2 tiles per column: shave off anything steeper.
  for (let x = 1; x < Wd; x++) surf[x] = Math.max(surf[x], surf[x - 1] - 2);
  for (let x = Wd - 2; x >= 0; x--) surf[x] = Math.max(surf[x], surf[x + 1] - 2);

  // 2. Fill columns ------------------------------------------------------
  for (let x = 0; x < Wd; x++) {
    const s = surf[x];
    const z = ZONES[materialZone(x, seed)];
    const j1 = Math.floor(hash2(x, 1, seed) * 3);
    const j2 = Math.floor(pn.noise1(x * 0.05 + 900) * 8);
    const pd = Math.round(pool[x]);
    for (let y = s; y < H; y++) {
      const d = y - s;
      let t: number;
      if (d < pd) t = T.ACID;
      else if (d < z.surfaceDepth + j1 + pd) t = z.surface;
      else if (d < z.subDepth + j2) t = z.sub;
      else t = z.deep;
      if (z.key === 'rustbelt' && t === T.ROCK && pc2.noise2(x * 0.08, y * 0.08) > 0.35) t = T.DIRT;
      if (z.key === 'glass' && t === T.ROCK && d < 14 && pc2.noise2(x * 0.1, y * 0.1) > 0.2) t = T.SAND;
      world.setRaw(x, y, t);
    }
    for (let y = H - 10; y < H; y++) {
      if (y >= H - 3 || hash2(x, y, seed) < (y - (H - 10)) / 7) world.setRaw(x, y, T.BEDROCK);
    }
  }

  // 3. Caves -------------------------------------------------------------
  for (let x = 0; x < Wd; x++) {
    const s = surf[x];
    const zKey = ZONES[zoneIndexAt(x)].key;
    const minD = zKey === 'acid' ? 12 : 8;
    for (let y = s + minD; y < H - 6; y++) {
      const d = y - s;
      const worm = Math.abs(pc.fbm2(x * 0.022, y * 0.04, 3));
      const wormThr = 0.03 + Math.min(0.035, d * 0.0005);
      const cav = d > 30 ? pc2.fbm2(x * 0.012, y * 0.022, 3) : 0;
      if (worm < wormThr || cav > 0.34) {
        if (world.get(x, y) !== T.BEDROCK) world.setRaw(x, y, T.AIR);
      }
    }
  }

  // Cave mouths so the underground is reachable from the surface on foot.
  for (let x = 30; x < Wd - 30; x += rng.int(55, 110)) {
    if (isReserved(x)) continue;
    const s = surf[x];
    const depth = rng.int(10, 22);
    let cx = x;
    for (let y = s - 1; y < s + depth; y++) {
      cx += rng.int(-1, 1);
      for (let k = -1; k <= 1; k++) {
        const t = world.get(cx + k, y);
        if (t !== T.BEDROCK && !TILES[t].liquid) world.setRaw(cx + k, y, T.AIR);
      }
    }
  }

  // Magma chasms (narrow enough for a rig to bridge, deadly on foot).
  for (let x = rng.int(40, 90); x < ZONE_W - 40; x += rng.int(90, 160)) {
    if (isReserved(x)) continue;
    const hw = rng.int(2, 4);
    const depth = rng.int(30, 44);
    const s = surf[x];
    for (let d = -2; d < depth; d++) {
      const w = Math.max(1, Math.round(hw * (1 - d / (depth * 1.3)) + pn.noise1(d * 0.3 + x) * 1.5));
      for (let k = -w; k <= w; k++) {
        const y = s + d;
        if (world.get(x + k, y) === T.BEDROCK) continue;
        world.setRaw(x + k, y, d > depth - 6 ? T.LAVA : T.AIR);
      }
    }
  }

  // Lava lakes deep in the Rift; acid seeps under the Marsh.
  for (let x = 0; x < Wd; x++) {
    const zKey = ZONES[zoneIndexAt(x)].key;
    if (zKey !== 'magma' && zKey !== 'acid') continue;
    const liquid = zKey === 'magma' ? T.LAVA : T.ACID;
    const minD = zKey === 'magma' ? 55 : 40;
    if (pc2.noise2(x * 0.01, 7.3) < -0.05) continue;
    let run = 0;
    for (let y = H - 6; y > surf[x] + minD; y--) {
      const t = world.get(x, y);
      if (t !== T.AIR) {
        run = 0;
        continue;
      }
      const below = world.get(x, y + 1);
      if ((TILES[below].solid && run === 0) || (below === liquid && run > 0 && run < 4)) {
        world.setRaw(x, y, liquid);
        run++;
      } else {
        run = 0;
      }
    }
  }

  // 4. Ores --------------------------------------------------------------
  for (let x = 0; x < Wd; x++) {
    const s = surf[x];
    const rules = ORES[ZONES[materialZone(x, seed)].key];
    for (let y = s + 1; y < H - 4; y++) {
      const t = world.get(x, y);
      if (!HOST_ROCK.has(t)) continue;
      const d = y - s;
      for (let k = 0; k < rules.length; k++) {
        const r = rules[k];
        if (d < r.dMin) continue;
        if (po.noise2(x * r.scale + k * 31.7, y * r.scale + k * 17.3) > r.thr) {
          world.setRaw(x, y, r.t);
          break;
        }
      }
    }
  }

  // 5. Structures & decoration --------------------------------------------
  for (let zi = 0; zi < ZONES.length; zi++) {
    const z = ZONES[zi];
    const x0 = zi * ZONE_W, x1 = x0 + ZONE_W;

    // Surface features
    let x = x0 + rng.int(20, 50);
    while (x < x1 - 40) {
      if (isReserved(x) || isReserved(x + 30)) {
        x += 20;
        continue;
      }
      const ground = surf[x];
      if (z.key === 'rustbelt') {
        const r = rng.next();
        if (r < 0.45) b.tower(x, ground, rng.int(10, 20), rng.int(2, 6), z.key);
        else if (r < 0.75) scrapMound(world, surf, x, rng);
        else b.pylon(x, ground);
        x += rng.int(40, 90);
      } else if (z.key === 'dunes') {
        if (rng.chance(0.35)) b.colossus(x, ground);
        else if (rng.chance(0.4)) b.tower(x, ground + rng.int(4, 12), rng.int(8, 14), rng.int(2, 3), z.key);
        x += rng.int(80, 150);
      } else if (z.key === 'glass') {
        if (rng.chance(0.5)) b.tower(x, ground, rng.int(8, 14), rng.int(2, 5), z.key);
        glassShards(world, surf, x + 20, rng);
        x += rng.int(50, 100);
      } else if (z.key === 'cryo') {
        if (rng.chance(0.4)) b.pylon(x, ground);
        x += rng.int(60, 120);
      } else if (z.key === 'magma') {
        if (rng.chance(0.3)) b.pylon(x, ground);
        x += rng.int(70, 140);
      } else {
        if (rng.chance(0.55)) b.tower(x, ground + 2, rng.int(10, 18), rng.int(2, 4), z.key);
        x += rng.int(60, 120);
      }
    }

    // Underground bunkers
    for (let i = 0; i < 9; i++) {
      const bx = rng.int(x0 + 20, x1 - 40);
      const by = surf[bx] + rng.int(22, 140);
      if (by > H - 20) continue;
      b.bunker(bx, by, rng.int(8, 16), rng.int(4, 6), z.key);
    }

    // Caches scattered on cave floors
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 14; tries++) {
      const cx = rng.int(x0 + 10, x1 - 10);
      const cy = surf[cx] + rng.int(14, 200);
      if (cy >= H - 8) continue;
      if (world.get(cx, cy) === T.AIR && world.get(cx + 1, cy) === T.AIR && TILES[world.get(cx, cy + 1)].solid && TILES[world.get(cx + 1, cy + 1)].solid) {
        b.cache(cx, cy, `cache_${z.key}`);
        placed++;
      }
    }
  }

  // Fungus on cave floors (and all over the marsh surface).
  for (let x = 1; x < Wd - 1; x++) {
    const zKey = ZONES[zoneIndexAt(x)].key;
    for (let y = 20; y < H - 6; y++) {
      if (world.get(x, y) !== T.AIR || !TILES[world.get(x, y + 1)].solid) continue;
      const surface = y < surf[x] + 2;
      const chance = zKey === 'acid' ? (surface ? 0.12 : 0.08) : surface ? 0 : 0.025;
      if (hash2(x, y, seed + 77) < chance) world.setRaw(x, y, T.FUNGUS);
    }
  }

  // Dead Zone checkpoint pad
  const cg = surf[CHECKPOINT_X];
  for (let x = CHECKPOINT_X - 22; x <= CHECKPOINT_X + 22; x++) world.setRaw(x, cg, T.CONCRETE);
  b.wallRect(CHECKPOINT_X - 18, cg - 18, 3, 18, W.CONCRETE);
  b.wallRect(CHECKPOINT_X + 16, cg - 18, 3, 18, W.CONCRETE);
  b.wallRect(CHECKPOINT_X - 18, cg - 21, 37, 3, W.HAZARD);
  b.wallRect(CHECKPOINT_X - 8, cg - 26, 17, 5, W.NEON_PINK);
  world.setRaw(CHECKPOINT_X - 20, cg - 1, T.LAMP);
  world.setRaw(CHECKPOINT_X + 20, cg - 1, T.LAMP);

  for (const o of outposts) o.ground = surf[o.x + Math.floor(OUTPOST_W / 2)];

  world.surface = surf;
  world.finalize();
  return { world, spawnX: SPAWN_X, caches, outposts, checkpoint: { x: CHECKPOINT_X, ground: cg } };
}

function scrapMound(world: World, surf: Int16Array, x0: number, rng: RNG): void {
  const w = rng.int(5, 9);
  for (let i = 0; i < w; i++) {
    const h = Math.min(2, Math.round(Math.min(i + 1, w - i) * 0.7));
    const s = surf[x0 + i];
    for (let k = 1; k <= h; k++) world.setRaw(x0 + i, s - k, T.SCRAP);
  }
}

function glassShards(world: World, surf: Int16Array, x0: number, rng: RNG): void {
  for (let i = 0; i < 4; i++) {
    const x = x0 + rng.int(0, 12);
    const s = surf[x];
    if (surf[x - 1] !== s || surf[x + 1] !== s) continue;
    const h = rng.int(1, 2);
    for (let k = 1; k <= h; k++) world.setRaw(x, s - k, T.GLASS);
  }
}
