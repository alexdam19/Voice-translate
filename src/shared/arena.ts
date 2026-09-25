import { ARENA_SIZE } from './constants';
import { GameMap, OBS, TER, ZONE } from './map';
import type { Prop, WorldGen } from './mapgen';
import { Perlin } from './noise';
import { hash2, RNG } from './rng';

export interface ArenaGen {
  gen: WorldGen;
  spawns: { x: number; y: number }[];
  crates: { x: number; y: number }[];
  extracts: { x: number; y: number; r: number }[];
}

/** The Dead Zone: a walled ruin of a city, same for every client (seeded by the server). */
export function generateArena(seed: number): ArenaGen {
  const n = ARENA_SIZE;
  const map = new GameMap(n);
  const p = new Perlin(seed);
  const rng = new RNG(seed ^ 0x51ed27);
  const C = n / 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const r = Math.hypot(x - C, y - C) + p.fbm2(x / 20, y / 20, 3) * 8;
      map.zone[i] = r > 74 ? ZONE.EDGE : ZONE.RUSTBELT;
      const nv = p.fbm2(x / 16 + 40, y / 16, 3);
      map.ter[i] = nv > 0.18 ? TER.CONCRETE : nv < -0.2 ? TER.ASH : TER.RUST;
      if (r > 74) {
        map.obs[i] = OBS.CLIFF;
        map.oh[i] = 7 + Math.floor(hash2(x, y, seed) * 6);
        continue;
      }
      // City blocks: broken walls on a 12-tile grid.
      const bx = Math.floor(x / 12), by = Math.floor(y / 12);
      const onX = x % 12 === 0, onY = y % 12 === 0;
      if (nv > 0.05 && ((onX && hash2(bx, by * 3 + 1, seed) > 0.45) || (onY && hash2(bx * 3 + 2, by, seed) > 0.45))) {
        map.obs[i] = OBS.RUIN;
        map.oh[i] = 3 + Math.floor(hash2(bx, by, seed + 9) * 4);
      } else if (p.fbm2(x / 9, y / 9, 2) > 0.4) {
        map.obs[i] = OBS.ROCK;
        map.oh[i] = 2 + Math.floor(hash2(x, y, seed + 2) * 3);
      } else if (hash2(x, y, seed + 5) < 0.006) {
        map.obs[i] = OBS.WRECK;
        map.oh[i] = 2;
      }
    }
  }
  const clear = (cx: number, cy: number, r: number, ter?: number): void => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= n || y >= n || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
        const i = y * n + x;
        if (map.zone[i] === ZONE.EDGE) continue;
        map.obs[i] = 0;
        map.oh[i] = 0;
        if (ter !== undefined) map.ter[i] = ter;
      }
    }
  };
  // Plaza in the middle for supply drops, spawns around the ring, extraction at the edges.
  clear(C, C, 12, TER.METAL);
  const spawns: { x: number; y: number }[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const s = { x: C + Math.cos(a) * 52, y: C + Math.sin(a) * 52 };
    clear(s.x, s.y, 7);
    spawns.push(s);
  }
  const extracts: { x: number; y: number; r: number }[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 1.1;
    const e = { x: C + Math.cos(a) * 64, y: C + Math.sin(a) * 64, r: 6 };
    clear(e.x, e.y, 8, TER.METAL);
    extracts.push(e);
  }
  // Roads from each spawn to the plaza so big tanks can get around.
  for (const s of [...spawns, ...extracts]) {
    const steps = Math.ceil(Math.hypot(s.x - C, s.y - C));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = s.x + (C - s.x) * t, y = s.y + (C - s.y) * t;
      clear(x, y, 4);
      clear(x, y, 1.6, TER.ROAD);
    }
  }
  const crates: { x: number; y: number }[] = [];
  for (let tries = 0; tries < 2000 && crates.length < 26; tries++) {
    const x = 12 + rng.next() * (n - 24), y = 12 + rng.next() * (n - 24);
    if (Math.hypot(x - C, y - C) > 66) continue;
    if (map.blocked(Math.floor(x), Math.floor(y), 'ground')) continue;
    if (crates.some((c) => Math.hypot(c.x - x, c.y - y) < 9)) continue;
    if (spawns.some((s) => Math.hypot(s.x - x, s.y - y) < 10)) continue;
    crates.push({ x, y });
  }
  const props: Prop[] = [];
  for (let y = 2; y < n - 2; y++) {
    for (let x = 2; x < n - 2; x++) {
      const i = y * n + x;
      if (map.obs[i] || map.zone[i] === ZONE.EDGE || map.ter[i] === TER.ROAD) continue;
      if (hash2(x, y, seed + 77) > 1 / 60) continue;
      const kinds = ['barrel', 'wreckcar', 'bones', 'sign', 'pipe', 'crate'] as const;
      props.push({ x: x + 0.5, y: y + 0.5, kind: kinds[Math.floor(hash2(x, y, seed + 78) * kinds.length)], s: 0.8 + hash2(x, y, seed + 79) * 0.5, rot: hash2(x, y, seed + 80) * 6.28, v: 0 });
    }
  }
  const gen: WorldGen = { seed, map, spawn: spawns[0], nodes: [], sites: [], runes: [], outposts: [], gate: { x: -999, y: -999 }, props };
  return { gen, spawns, crates, extracts };
}
