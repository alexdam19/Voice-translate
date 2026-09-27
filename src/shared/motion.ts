import { CLEAR_REACH, crushable, type GameMap, type NavMode } from './map';

/* ---------------------------------------------------------------------- */
/* Circle vs tile collision                                                */
/* ---------------------------------------------------------------------- */

export function circleBlocked(map: GameMap, x: number, y: number, r: number, mode: NavMode): boolean {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!map.blocked(tx, ty, mode)) continue;
      const cx = Math.max(tx, Math.min(x, tx + 1));
      const cy = Math.max(ty, Math.min(y, ty + 1));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
  }
  return false;
}

/** Pushes a circle out of any blocked tiles it overlaps. */
export function resolveCircle(map: GameMap, x: number, y: number, r: number, mode: NavMode): { x: number; y: number; hit: boolean } {
  let hit = false;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!map.blocked(tx, ty, mode)) continue;
        const cx = Math.max(tx, Math.min(x, tx + 1));
        const cy = Math.max(ty, Math.min(y, ty + 1));
        const dx = x - cx, dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        hit = true;
        moved = true;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          const push = r - d + 1e-4;
          x += (dx / d) * push;
          y += (dy / d) * push;
        } else {
          // Centre inside the tile: leave through the nearest edge.
          const l = x - tx, rr = tx + 1 - x, t = y - ty, b = ty + 1 - y;
          const m = Math.min(l, rr, t, b);
          if (m === l) x = tx - r - 1e-4;
          else if (m === rr) x = tx + 1 + r + 1e-4;
          else if (m === t) y = ty - r - 1e-4;
          else y = ty + 1 + r + 1e-4;
        }
      }
    }
    if (!moved) break;
  }
  return { x, y, hit };
}

/** Moves a circle by (dx, dy) with sub-stepping, sliding along walls. */
export function moveCircle(map: GameMap, x: number, y: number, r: number, dx: number, dy: number, mode: NavMode): { x: number; y: number; hit: boolean } {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
  let hit = false;
  for (let i = 0; i < steps; i++) {
    x += dx / steps;
    y += dy / steps;
    const r2 = resolveCircle(map, x, y, r, mode);
    x = r2.x;
    y = r2.y;
    hit ||= r2.hit;
  }
  return { x, y, hit };
}

/* ---------------------------------------------------------------------- */
/* Line of sight                                                           */
/* ---------------------------------------------------------------------- */

/** True if no obstacle tile lies on the segment. */
export function losClear(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  let tx = Math.floor(x0), ty = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1);
  const dx = x1 - x0, dy = y1 - y0;
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? tx + 1 - x0 : x0 - tx) * tdx : Infinity;
  let tmy = dy !== 0 ? (dy > 0 ? ty + 1 - y0 : y0 - ty) * tdy : Infinity;
  for (let guard = 0; guard < 2000; guard++) {
    if (map.solid(tx, ty) && !(tx === Math.floor(x0) && ty === Math.floor(y0))) return false;
    if (tx === ex && ty === ey) return true;
    if (tmx < tmy) {
      if (tmx > 1) return true;
      tmx += tdx;
      tx += sx;
    } else {
      if (tmy > 1) return true;
      tmy += tdy;
      ty += sy;
    }
  }
  return true;
}

/* ---------------------------------------------------------------------- */
/* A* pathfinding with clearance (for big tanks)                           */
/* ---------------------------------------------------------------------- */

export interface PathOpts {
  radius: number;
  mode: NavMode;
  maxNodes?: number;
  /** Speed multiplier per terrain id; slow terrain costs more. */
  traction?: number[];
  /** Go-anywhere hull: obstacles add cost instead of blocking. */
  climb?: boolean;
}

/** The search window (tiles per side). Longer trips are planned in legs as you go. */
export const PATH_WINDOW = 512;
const WN = PATH_WINDOW * PATH_WINDOW;
let gScore: Float32Array;
let parent: Int32Array;
let stamp: Uint32Array;
let closed: Uint32Array;
let gen = 1;
let heap: Int32Array;
let heapF: Float32Array;

function ensureBuffers(): void {
  if (gScore) return;
  gScore = new Float32Array(WN);
  parent = new Int32Array(WN);
  stamp = new Uint32Array(WN);
  closed = new Uint32Array(WN);
  heap = new Int32Array(WN);
  heapF = new Float32Array(WN);
  gen = 1;
}

/** Nearest tile to (tx, ty) with enough clearance, searching outward. */
export function nearestClear(map: GameMap, tx: number, ty: number, need: number, mode: NavMode, maxR = 14): [number, number] | null {
  const req = need * 3;
  for (let r = 0; r <= maxR; r++) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (!map.inside(x, y) || map.clearRaw(x, y, mode) < req) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = [x, y];
        }
      }
    }
    if (best) return best;
  }
  return null;
}

function segmentClear(map: GameMap, ax: number, ay: number, bx: number, by: number, req: number, mode: NavMode): boolean {
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(len / 0.5));
  for (let i = 0; i <= n; i++) {
    const x = Math.floor(ax + ((bx - ax) * i) / n);
    const y = Math.floor(ay + ((by - ay) * i) / n);
    if (!map.inside(x, y) || map.clearRaw(x, y, mode) < req) return false;
  }
  return true;
}

/**
 * Finds a path for a circle of `radius`. Returns world-space waypoints (excluding the start), or null if nothing is
 * reachable. The search stays inside a window around the start: a goal further away is planned toward in legs (the
 * path ends at the window edge and the mover replans from there). If the budget runs out it returns the best
 * partial path.
 */
export function findPath(map: GameMap, sx: number, sy: number, gx: number, gy: number, opts: PathOpts): { x: number; y: number }[] | null {
  ensureBuffers();
  gen++;
  if (gen > 0xfffffff0) {
    stamp.fill(0);
    closed.fill(0);
    gen = 1;
  }
  const mode = opts.mode;
  const need = Math.min(opts.radius + 0.35, CLEAR_REACH - 0.5);
  const req = Math.ceil(need * 3);
  const loose = Math.max(1, Math.ceil((Math.min(opts.radius, CLEAR_REACH) * 0.4 + 0.35) * 3));
  let s0x = Math.floor(sx), s0y = Math.floor(sy);
  if (!map.inside(s0x, s0y)) return null;
  // The window: centred between start and goal, clamped to PATH_WINDOW around the start.
  const half = PATH_WINDOW / 2 - 2;
  let wgx = gx, wgy = gy;
  const far = Math.max(Math.abs(gx - sx), Math.abs(gy - sy));
  let exactGoal = true;
  if (far > half) {
    // Too far for one search: head for the point on the way that fits in the window.
    const k = half / far;
    wgx = sx + (gx - sx) * k;
    wgy = sy + (gy - sy) * k;
    exactGoal = false;
  }
  const ox = Math.floor(Math.min(s0x, wgx) + (Math.abs(wgx - s0x) - PATH_WINDOW) / 2);
  const oy = Math.floor(Math.min(s0y, wgy) + (Math.abs(wgy - s0y) - PATH_WINDOW) / 2);
  const W = PATH_WINDOW;
  const inWin = (x: number, y: number): boolean => x >= ox && y >= oy && x < ox + W && y < oy + W && map.inside(x, y);
  // Wedged into something? Start from the nearest open tile instead.
  if (map.clearRaw(s0x, s0y, mode) < loose) {
    const alt = nearestClear(map, s0x, s0y, Math.max(0.5, loose / 3), mode, 10);
    if (!alt) return null;
    [s0x, s0y] = alt;
  }
  let goalTx = Math.floor(wgx), goalTy = Math.floor(wgy);
  if (!inWin(goalTx, goalTy) || map.clearRaw(goalTx, goalTy, mode) < req) {
    const alt = nearestClear(map, goalTx, goalTy, need, mode, 18);
    if (!alt || !inWin(alt[0], alt[1])) return null;
    [goalTx, goalTy] = alt;
    exactGoal = false;
  }
  if (!inWin(s0x, s0y)) return null;
  const L = (x: number, y: number): number => (y - oy) * W + (x - ox);
  const start = L(s0x, s0y);
  const goal = L(goalTx, goalTy);
  const trac = opts.traction;
  const passable = (x: number, y: number): boolean => {
    const c = map.clearRaw(x, y, mode);
    if (c >= req) return true;
    // Near the start we tolerate tight spots so a tank pushed against a wall can get out.
    return c >= loose && Math.abs(x - s0x) + Math.abs(y - s0y) <= Math.ceil(opts.radius) + 2;
  };
  const h = (x: number, y: number): number => {
    const dx = Math.abs(x - goalTx), dy = Math.abs(y - goalTy);
    return (dx + dy + (1.4142 - 2) * Math.min(dx, dy)) * 1.15;
  };
  let hs = 0;
  const push = (i: number, f: number): void => {
    let k = hs++;
    heap[k] = i;
    heapF[k] = f;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapF[p] <= heapF[k]) break;
      const ti = heap[p], tf = heapF[p];
      heap[p] = heap[k]; heapF[p] = heapF[k];
      heap[k] = ti; heapF[k] = tf;
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    hs--;
    if (hs > 0) {
      heap[0] = heap[hs];
      heapF[0] = heapF[hs];
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < hs && heapF[l] < heapF[m]) m = l;
        if (r < hs && heapF[r] < heapF[m]) m = r;
        if (m === k) break;
        const ti = heap[m], tf = heapF[m];
        heap[m] = heap[k]; heapF[m] = heapF[k];
        heap[k] = ti; heapF[k] = tf;
        k = m;
      }
    }
    return top;
  };
  stamp[start] = gen;
  gScore[start] = 0;
  parent[start] = -1;
  push(start, h(s0x, s0y));
  const maxNodes = opts.maxNodes ?? 60000;
  let expanded = 0;
  let best = start;
  let bestH = h(s0x, s0y);
  let found = false;
  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];
  while (hs > 0) {
    const cur = pop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    if (cur === goal) {
      found = true;
      best = cur;
      break;
    }
    const cx = (cur % W) + ox, cy = ((cur / W) | 0) + oy;
    const ch = h(cx, cy);
    if (ch < bestH) {
      bestH = ch;
      best = cur;
    }
    if (++expanded > maxNodes) break;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], ny = cy + DY[k];
      if (!inWin(nx, ny)) continue;
      const ni = L(nx, ny);
      if (closed[ni] === gen || !passable(nx, ny)) continue;
      if (k >= 4 && (!passable(nx, cy) || !passable(cx, ny))) continue;
      let step = k >= 4 ? 1.4142 : 1;
      if (trac) {
        const t = trac[map.getTer(nx, ny)] || 0.2;
        step /= Math.max(0.25, Math.min(1.2, t));
      }
      // Go-anywhere hulls prefer to go around cliffs and pillars (climbing is slow) and barely mind rubble.
      if (opts.climb) {
        const o = map.getObs(nx, ny);
        if (o) step *= crushable(o) ? 1.15 : 3;
      }
      const g = gScore[cur] + step;
      if (stamp[ni] !== gen || g < gScore[ni]) {
        stamp[ni] = gen;
        gScore[ni] = g;
        parent[ni] = cur;
        push(ni, g + h(nx, ny));
      }
    }
  }
  if (best === start) return found ? [{ x: gx, y: gy }] : null;
  const tiles: number[] = [];
  for (let i = best; i !== -1 && i !== start; i = parent[i]) tiles.push(i);
  tiles.reverse();
  // String-pull the tile path into a few straight segments.
  const pts = tiles.map((i) => ({ x: (i % W) + ox + 0.5, y: ((i / W) | 0) + oy + 0.5 }));
  if (found && exactGoal) pts[pts.length - 1] = { x: gx, y: gy };
  const out: { x: number; y: number }[] = [];
  let ax = sx, ay = sy;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !segmentClear(map, ax, ay, pts[j].x, pts[j].y, req, mode)) j--;
    out.push(pts[j]);
    ax = pts[j].x;
    ay = pts[j].y;
    i = j + 1;
  }
  return out;
}
