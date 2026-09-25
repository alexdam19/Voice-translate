import { TILE, WARZONE_H, WARZONE_W } from './constants';
import { Perlin } from './noise';
import { RNG } from './rng';
import { T, W } from './tiles';
import { World } from './world';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
}

export interface WarzoneMap {
  world: World;
  /** Insertion points (world px, feet position). */
  spawns: { x: number; y: number }[];
  /** Extraction zones (world px). */
  extracts: Rect[];
  /** Tile columns where supply drops can land. */
  dropSites: number[];
}

const METRO_Y = 150;
const METRO_H = 6;

/**
 * The Dead Zone: a ruined city block with towers for vertical fights, a metro
 * tunnel underneath, and three extraction points. Server and clients generate
 * the same map from the same seed; only tile edits are networked.
 */
export function generateWarzone(seed: number): WarzoneMap {
  const Wd = WARZONE_W, H = WARZONE_H;
  const world = new World(Wd, H);
  const rng = new RNG(seed);
  const pn = new Perlin(seed + 3);
  const surf = new Int16Array(Wd);

  for (let x = 0; x < Wd; x++) {
    let s = 110 + Math.round(pn.fbm1(x * 0.02, 3) * 5);
    // craters
    const c = pn.noise1(x * 0.015 + 40);
    if (c > 0.3) s += Math.round((c - 0.3) * 20);
    surf[x] = s;
    for (let y = s; y < H; y++) {
      const d = y - s;
      let t: number = d < 4 ? T.DIRT : T.ROCK;
      if (d > 3 && pn.noise2(x * 0.1, y * 0.1) > 0.4) t = T.CONCRETE;
      if (y >= H - 4) t = T.BEDROCK;
      world.setRaw(x, y, t);
    }
  }

  // Metro tunnel
  for (let x = 40; x < Wd - 40; x++) {
    for (let y = METRO_Y - 1; y <= METRO_Y + METRO_H; y++) {
      const edge = y === METRO_Y - 1 || y === METRO_Y + METRO_H;
      world.setRaw(x, y, edge ? T.PLATE : T.AIR);
      if (!edge) world.setWall(x, y, x % 12 < 2 ? W.PIPES : W.METAL);
    }
    if (x % 18 === 0) world.setRaw(x, METRO_Y, T.LAMP);
  }
  // Stations
  for (const sx of [200, 550, 900]) {
    for (let x = sx - 16; x < sx + 16; x++) {
      for (let y = METRO_Y - 6; y < METRO_Y + METRO_H; y++) {
        world.setRaw(x, y, T.AIR);
        world.setWall(x, y, y < METRO_Y - 3 ? W.CONCRETE : W.METAL);
      }
      world.setRaw(x, METRO_Y - 7, T.PLATE);
      if (x % 6 === 0) world.setRaw(x, METRO_Y - 3, T.PLATFORM);
    }
    for (let x = sx - 5; x < sx + 5; x++) world.setWall(x, METRO_Y - 5, x % 2 ? W.NEON_CYAN : W.NEON_PINK);
    world.setRaw(sx - 10, METRO_Y - 6, T.LAMP);
    world.setRaw(sx + 10, METRO_Y - 6, T.LAMP);
  }
  // Access shafts
  for (const ax of [80, 330, 550, 770, 1020]) {
    const top = surf[ax] - 1;
    for (let y = top; y < METRO_Y; y++) {
      for (let x = ax - 1; x <= ax + 1; x++) {
        world.setRaw(x, y, (y - top) % 5 === 4 ? T.PLATFORM : T.AIR);
        world.setWall(x, y, W.HAZARD);
      }
    }
  }

  // Towers
  let x = 110;
  while (x < Wd - 110) {
    const w = rng.int(14, 24);
    const floors = rng.int(3, 7);
    const ground = Math.min(...Array.from({ length: w }, (_, i) => surf[x + i]));
    const fh = 6;
    const top = ground - floors * fh;
    for (let tx = x; tx < x + w; tx++) {
      for (let y = top; y < surf[tx]; y++) {
        const edge = tx === x || tx === x + w - 1;
        const band = (y - top) % fh;
        world.setWall(tx, y, edge ? W.METAL : band >= 2 && band <= 3 && (tx - x) % 3 !== 0 ? W.WINDOWS : W.CONCRETE);
        if (y >= ground) world.setRaw(tx, y, T.AIR);
      }
    }
    for (let f = 1; f <= floors; f++) {
      const fy = ground - f * fh;
      for (let tx = x; tx < x + w; tx++) {
        if (f === floors) world.setRaw(tx, fy, T.CONCRETE);
        else if (!rng.chance(0.15)) world.setRaw(tx, fy, T.PLATFORM);
      }
      // cover walls
      for (let k = 0; k < 2; k++) {
        const cx = x + rng.int(2, w - 3);
        world.setRaw(cx, fy - 1, T.CONCRETE);
        world.setRaw(cx, fy - 2, T.CONCRETE);
      }
      if (rng.chance(0.6)) world.setRaw(x + rng.int(1, w - 2), fy + 1, T.LAMP);
    }
    // partial outer walls for cover, with gaps
    for (let y = top; y < ground; y++) {
      if ((y - top) % 6 > 3) continue;
      if (rng.chance(0.7)) world.setRaw(x, y, T.CONCRETE);
      if (rng.chance(0.7)) world.setRaw(x + w - 1, y, T.CONCRETE);
    }
    if (rng.chance(0.7)) {
      for (let tx = x + 2; tx < x + w - 2; tx++) for (let y = top - 4; y < top - 1; y++) world.setWall(tx, y, rng.chance(0.5) ? W.NEON_PINK : W.NEON_CYAN);
    }
    x += w + rng.int(18, 40);
  }

  // Rubble cover on the street
  for (let i = 0; i < 70; i++) {
    const rx = rng.int(30, Wd - 30);
    const s = surf[rx];
    const h = rng.int(1, 2);
    for (let k = 1; k <= h; k++) if (world.get(rx, s - k) === T.AIR) world.setRaw(rx, s - k, rng.chance(0.5) ? T.CONCRETE : T.SCRAP);
  }

  // Map edges
  for (let y = 0; y < H; y++) {
    for (let k = 0; k < 3; k++) {
      world.setRaw(k, y, T.BEDROCK);
      world.setRaw(Wd - 1 - k, y, T.BEDROCK);
    }
  }

  world.surface = surf;
  world.finalize();

  const spawns = [150, 280, 420, 640, 760, 940].map((sx) => ({ x: sx * TILE, y: world.skyTop[sx] * TILE }));
  const extracts: Rect[] = [
    { x: 6 * TILE, y: (surf[14] - 8) * TILE, w: 16 * TILE, h: 8 * TILE, name: 'WEST GATE' },
    { x: (Wd - 22) * TILE, y: (surf[Wd - 14] - 8) * TILE, w: 16 * TILE, h: 8 * TILE, name: 'EAST GATE' },
    { x: 540 * TILE, y: METRO_Y * TILE, w: 20 * TILE, h: METRO_H * TILE, name: 'METRO EXFIL' },
  ];
  const dropSites: number[] = [];
  for (let i = 0; i < 12; i++) dropSites.push(rng.int(60, Wd - 60));
  return { world, spawns, extracts, dropSites };
}
