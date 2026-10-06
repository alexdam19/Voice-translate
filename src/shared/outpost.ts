/**
 * The forward bases: the three settlements of the Crater rebuilt as the Hangar's outposts, each a ring fortress
 * 1 km across. Metres from the outpost's centre (x east, y south).
 *
 *  - A 30 m armoured ring wall, 8 m thick, with four gates 170 m wide (north, east, south, west) and a gun tower
 *    either side of each gate and one in the middle of each quarter.
 *  - Inside, the docking yard: an open circle of plating 460 m across where a hull parks to refit, trade, swap
 *    frames and work the scrap exchange; lanes from each gate to it.
 *  - Round the yard, in each quarter between the lanes, the outpost's buildings: a hangar block, barracks,
 *    a depot, a command post.
 */

export const OUTPOST = {
  wallR: 520,
  wall: 8,
  /** Half a gate's width (along the wall). */
  gateHalf: 85,
  /** The docking yard's radius, and the lanes' half-width. */
  yardR: 230,
  lane: 60,
  towerHalf: 9,
} as const;

export interface OBlock {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Height (m). */
  h: number;
  kind: 'hangar' | 'barracks' | 'depot' | 'command' | 'tank';
}

/** The buildings: four to a quarter, between the lanes and the wall. */
export const OUTPOST_BLOCKS: OBlock[] = (() => {
  const out: OBlock[] = [];
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const B = (x0: number, y0: number, x1: number, y1: number, h: number, kind: OBlock['kind']): void => {
      const a = [sx * x0, sx * x1].sort((p, q) => p - q), b = [sy * y0, sy * y1].sort((p, q) => p - q);
      out.push({ x0: a[0], x1: a[1], y0: b[0], y1: b[1], h, kind });
    };
    B(250, 110, 380, 200, 26, 'hangar');
    B(110, 250, 200, 360, 18, 'barracks');
    B(260, 260, 330, 330, 34, sx * sy > 0 ? 'command' : 'depot');
    B(380, 90, 420, 130, 22, 'tank');
  }
  return out;
})();

export interface OTower {
  x: number;
  y: number;
  gate: boolean;
}

/** The gun towers: either side of each gate, and one in the middle of each quarter. */
export const OUTPOST_TOWERS: OTower[] = (() => {
  const out: OTower[] = [];
  const R = OUTPOST.wallR;
  const off = (OUTPOST.gateHalf + 14) / R;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    for (const s of [-1, 1]) out.push({ x: Math.cos(a + s * off) * R, y: Math.sin(a + s * off) * R, gate: true });
    out.push({ x: Math.cos(a + Math.PI / 4) * R, y: Math.sin(a + Math.PI / 4) * R, gate: false });
  }
  return out;
})();

/** Is an angle (radians) in one of the gates? */
export function inGate(a: number): boolean {
  const q = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
  const d = Math.min(q, Math.PI / 2 - q);
  return d * OUTPOST.wallR < OUTPOST.gateHalf;
}

/** What the outpost puts on a tile (metres from its centre), or null outside its wall. */
export function outpostTile(dx: number, dy: number): { t: 'concrete' | 'metal' | 'road'; o: 'bastion' | 'struct' | null; h: number } | null {
  const O = OUTPOST;
  const r = Math.hypot(dx, dy);
  if (r > O.wallR + O.wall) return null;
  for (const t of OUTPOST_TOWERS) if (Math.abs(dx - t.x) < O.towerHalf && Math.abs(dy - t.y) < O.towerHalf) return { t: 'concrete', o: 'bastion', h: 48 };
  if (r > O.wallR - O.wall / 2) return inGate(Math.atan2(dy, dx)) ? { t: 'road', o: null, h: 0 } : { t: 'concrete', o: 'bastion', h: 30 };
  if (r < O.yardR) return { t: 'metal', o: null, h: 0 };
  for (const b of OUTPOST_BLOCKS) if (dx >= b.x0 && dx < b.x1 && dy >= b.y0 && dy < b.y1) return { t: 'concrete', o: 'struct', h: b.h };
  if (Math.abs(dx) < O.lane || Math.abs(dy) < O.lane) return { t: 'road', o: null, h: 0 };
  return { t: 'concrete', o: null, h: 0 };
}
