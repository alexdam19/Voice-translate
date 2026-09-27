import { ARENA_SCALE as S, ARENA_SIZE } from './constants';
import { GameMap, OBS, TER, ZONE } from './map';
import { staticWorld, type Prop, type WorldGen } from './mapgen';
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
      const r = Math.hypot(x - C, y - C) + p.fbm2(x / (20 * S), y / (20 * S), 3) * 8 * S;
      map.set(x, y, { zone: r > 74 * S ? ZONE.EDGE : ZONE.RUSTBELT });
      const nv = p.fbm2(x / (16 * S) + 40, y / (16 * S), 3);
      map.set(x, y, { ter: nv > 0.18 ? TER.CONCRETE : nv < -0.2 ? TER.ASH : TER.RUST });
      if (r > 74 * S) {
        map.set(x, y, { obs: OBS.CLIFF, oh: 7 + Math.floor(hash2(x, y, seed) * 6) });
        continue;
      }
      // City blocks: broken walls on a grid.
      const G = 12 * (S > 1 ? 3 : 1);
      const bx = Math.floor(x / G), by = Math.floor(y / G);
      const onX = x % G === 0, onY = y % G === 0;
      if (nv > 0.05 && ((onX && hash2(bx, by * 3 + 1, seed) > 0.45) || (onY && hash2(bx * 3 + 2, by, seed) > 0.45))) {
        map.set(x, y, { obs: OBS.RUIN, oh: (3 + Math.floor(hash2(bx, by, seed + 9) * 4)) * (S > 1 ? 3 : 1) });
      } else if (p.fbm2(x / (9 * S), y / (9 * S), 2) > 0.4) {
        map.set(x, y, { obs: OBS.ROCK, oh: 2 + Math.floor(hash2(x, y, seed + 2) * 3) });
      } else if (hash2(x, y, seed + 5) < 0.006) {
        map.set(x, y, { obs: OBS.WRECK, oh: 2 });
      }
    }
  }
  const clear = (cx: number, cy: number, r: number, ter?: number): void => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= n || y >= n || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
        if (map.getZone(x, y) === ZONE.EDGE) continue;
        map.set(x, y, { obs: 0, oh: 0, ter });
      }
    }
  };
  // Plaza in the middle for supply drops, spawns around the ring, extraction at the edges.
  clear(C, C, 12 * S, TER.METAL);
  const spawns: { x: number; y: number }[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const s = { x: C + Math.cos(a) * 52 * S, y: C + Math.sin(a) * 52 * S };
    clear(s.x, s.y, 7 * S);
    spawns.push(s);
  }
  const extracts: { x: number; y: number; r: number }[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 1.1;
    const e = { x: C + Math.cos(a) * 64 * S, y: C + Math.sin(a) * 64 * S, r: 6 * S };
    clear(e.x, e.y, 8 * S, TER.METAL);
    extracts.push(e);
  }
  // Roads from each spawn to the plaza so big tanks can get around.
  for (const s of [...spawns, ...extracts]) {
    const steps = Math.ceil(Math.hypot(s.x - C, s.y - C));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = s.x + (C - s.x) * t, y = s.y + (C - s.y) * t;
      clear(x, y, 4 * S);
      clear(x, y, 1.6 * S, TER.ROAD);
    }
  }
  const crates: { x: number; y: number }[] = [];
  for (let tries = 0; tries < 2000 && crates.length < 26; tries++) {
    const x = 12 + rng.next() * (n - 24), y = 12 + rng.next() * (n - 24);
    if (Math.hypot(x - C, y - C) > 66 * S) continue;
    if (map.blocked(Math.floor(x), Math.floor(y), 'ground')) continue;
    if (crates.some((c) => Math.hypot(c.x - x, c.y - y) < 9 * S)) continue;
    if (spawns.some((s) => Math.hypot(s.x - x, s.y - y) < 10 * S)) continue;
    crates.push({ x, y });
  }
  const props: Prop[] = [];
  for (let y = 2; y < n - 2; y++) {
    for (let x = 2; x < n - 2; x++) {
      if (map.getObs(x, y) || map.getZone(x, y) === ZONE.EDGE || map.getTer(x, y) === TER.ROAD) continue;
      if (hash2(x, y, seed + 77) > 1 / 60) continue;
      const kinds = ['barrel', 'wreckcar', 'bones', 'sign', 'pipe', 'crate'] as const;
      props.push({ x: x + 0.5, y: y + 0.5, kind: kinds[Math.floor(hash2(x, y, seed + 78) * kinds.length)], s: 0.8 + hash2(x, y, seed + 79) * 0.5, rot: hash2(x, y, seed + 80) * 6.28, v: 0 });
    }
  }
  for (const pr of props) map.chunkAtTile(Math.floor(pr.x), Math.floor(pr.y)).props.push(pr);
  const gen: WorldGen = staticWorld(seed, map, spawns[0]);
  return { gen, spawns, crates, extracts };
}
