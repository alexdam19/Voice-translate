import { hash2 } from './rng';

/**
 * The Mega Hangar's compound: a walled military base round the Hangar, laid out by hand. Everything here is in
 * metres relative to the Hangar's centre (x east, y south); the Hangar itself is 700 x 420 with its great door facing
 * south.
 *
 *  - A fortified wall 8 m thick (a Titan can neither crush nor climb it) with a guard tower every 160 m and one big
 *    gate in the south wall, 140 m wide, flanked by two gate towers. Only the gate lets anything in or out.
 *  - East of the Hangar, the garrison: fuel tanks, barracks, the workshop and the mess, rows of Quonset huts, the
 *    parade ground with its flagpole, four gunship pads, the clinic, the water tower, the radio mast, ammunition
 *    bunkers, the warehouse, the motor pool with its tanks and trucks in rows, the armory.
 *  - West, the docks: three pads where other crawler bases park, with their workshops and stores.
 *  - Down the middle, a wide lane from the Hangar door to the gate for the Titans, gatehouses by the gate.
 *  - Outside the gate, the front: gun bunkers and dug-in tanks either side of the exit lane, sandbag lines, rows of
 *    tank traps and searchlight masts. They hold the ground in front of the gate so the ships can get out.
 */

export const COMPOUND = {
  x0: -760,
  x1: 760,
  y0: -440,
  y1: 1000,
  wall: 8,
  /** Half the gate's width. */
  gateHalf: 70,
  towerHalf: 8,
  gateTowerHalf: 12,
  towerEvery: 160,
} as const;

export type StructKind =
  | 'tank' | 'barracks' | 'workshop' | 'bar' | 'home' | 'stall' | 'statue' | 'watertower' | 'clinic' | 'mast'
  | 'warehouse' | 'greenhouse' | 'garage' | 'armory' | 'gatehouse' | 'command' | 'depot' | 'store' | 'mess'
  | 'quonset' | 'ammo' | 'flagpole' | 'bunker' | 'sandbag' | 'hedgehog' | 'searchlight';

export interface Struct {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Height in half-metre units (like the map's obstacle heights). */
  h: number;
  kind: StructKind;
}

const S = (x0: number, y0: number, x1: number, y1: number, h: number, kind: StructKind): Struct => ({ x0, y0, x1, y1, h, kind });

function layout(): Struct[] {
  const L: Struct[] = [
    // The town (east).
    S(396, -416, 430, -382, 30, 'tank'), S(440, -416, 474, -382, 30, 'tank'), S(484, -416, 518, -382, 30, 'tank'),
    S(540, -416, 730, -360, 16, 'barracks'),
    S(396, -330, 520, -262, 18, 'workshop'),
    S(560, -330, 680, -272, 12, 'bar'),
    S(470, 196, 473, 199, 64, 'flagpole'),
    S(400, 410, 416, 426, 52, 'watertower'),
    S(440, 404, 560, 480, 14, 'clinic'),
    S(690, 410, 698, 418, 70, 'mast'),
    S(590, 440, 736, 560, 20, 'warehouse'),
    S(396, 520, 470, 550, 10, 'ammo'), S(486, 520, 560, 550, 10, 'ammo'), S(396, 566, 470, 596, 10, 'ammo'), S(486, 566, 560, 596, 10, 'ammo'),
    S(560, 620, 736, 700, 16, 'armory'),
    S(560, 740, 736, 800, 14, 'barracks'),
    S(396, 790, 520, 850, 12, 'garage'),
    // The central lane's flanks and the gatehouses.
    S(190, 900, 320, 970, 14, 'gatehouse'), S(-320, 900, -190, 970, 14, 'gatehouse'),
    S(190, 330, 330, 430, 22, 'command'), S(-330, 330, -190, 430, 18, 'depot'),
    S(190, 520, 330, 640, 16, 'depot'), S(-330, 520, -190, 640, 12, 'mess'),
    S(190, 720, 330, 820, 14, 'store'), S(-330, 720, -190, 820, 14, 'workshop'),
    // The docks (west): workshops and stores between the pads.
    S(-744, -80, -650, 0, 14, 'workshop'), S(-470, -80, -384, 0, 12, 'store'),
    S(-744, 330, -650, 400, 14, 'workshop'), S(-470, 330, -384, 400, 12, 'store'),
    S(-744, 760, -560, 840, 16, 'garage'), S(-520, 760, -384, 840, 14, 'barracks'),
  ];
  // Streets of container homes, a few lots left empty.
  for (let r = 0; r < 8; r++) {
    for (let k = 0; k < 7; k++) {
      if (hash2(k, r, 4401) < 0.16) continue;
      const x0 = 396 + k * 48, y0 = -230 + r * 48;
      L.push(S(x0, y0, x0 + 34, y0 + 30, 10 + Math.floor(hash2(k, r, 4402) * 2) * 2, 'quonset'));
    }
  }
  return L;
}

export const STRUCTS: Struct[] = layout();

/** The gunships' landing pads (centres), 40 m across, east of the parade ground. */
export const HELIPADS: { x: number; y: number }[] = [{ x: 606, y: 236 }, { x: 684, y: 236 }, { x: 606, y: 318 }, { x: 684, y: 318 }];

/** The parade ground (where the garrison drills) and the motor pool's hardstanding. */
export const PARADE = { x0: 404, y0: 190, x1: 556, y1: 362 };
export const MOTOR_POOL = { x0: 392, y0: 612, x1: 548, y1: 776 };

/**
 * The front: the defended ground outside the main gate, either side of the exit lane (which stays clear for the
 * ships): bunkers with twin guns, dug-in tanks behind sandbag horseshoes, a sandbag line, rows of tank traps and
 * searchlight masts by the gate.
 */
export const FORWARD = { x0: -470, x1: 470, y0: 1000, y1: 1330, lane: 110 } as const;

export interface FrontGun {
  x: number;
  y: number;
  kind: 'bunker' | 'tank';
}

function front(): { structs: Struct[]; guns: FrontGun[] } {
  const L: Struct[] = [];
  const guns: FrontGun[] = [];
  for (const sx of [-1, 1]) {
    for (const [bx, by] of [[175, 1052], [345, 1076]]) {
      const x = sx * bx;
      L.push(S(x - 11, by - 7, x + 11, by + 7, 12, 'bunker'));
      guns.push({ x, y: by, kind: 'bunker' });
    }
    for (const [tx, ty] of [[255, 1150], [420, 1152]]) {
      const x = sx * tx;
      // A sandbag horseshoe open to the gate, the tank sitting in it.
      L.push(S(x - 12, ty + 8, x + 12, ty + 10, 4, 'sandbag'));
      L.push(S(x - 12, ty - 6, x - 10, ty + 8, 4, 'sandbag'));
      L.push(S(x + 10, ty - 6, x + 12, ty + 8, 4, 'sandbag'));
      guns.push({ x, y: ty, kind: 'tank' });
    }
    // The sandbag line, with gaps for the patrols.
    for (let x = 130; x < 462; x += 66) L.push(S(Math.min(sx * x, sx * (x + 52)), 1212, Math.max(sx * x, sx * (x + 52)), 1215, 4, 'sandbag'));
    // Tank traps, three staggered rows.
    for (let row = 0; row < 3; row++) {
      for (let x = 140 + (row % 2) * 11; x < 462; x += 22) {
        const cx = sx * x, cy = 1250 + row * 25;
        L.push(S(cx - 1.5, cy - 1.5, cx + 1.5, cy + 1.5, 5, 'hedgehog'));
      }
    }
    L.push(S(sx * 118 - 1.5, 1026, sx * 118 + 1.5, 1029, 40, 'searchlight'));
  }
  return { structs: L, guns };
}

const FRONT = front();
export const FRONT_STRUCTS: Struct[] = FRONT.structs;
export const FRONT_GUNS: FrontGun[] = FRONT.guns;

/** In the front (the defended ground outside the gate)? */
export function inFront(hx: number, hy: number, pad = 0): boolean {
  return hx >= FORWARD.x0 - pad && hx < FORWARD.x1 + pad && hy >= FORWARD.y0 - pad && hy < FORWARD.y1 + pad;
}

/** The docking pads for visiting bases (centre, bow pointing north), 110 x 250. */
export const PADS: { x: number; y: number }[] = [{ x: -560, y: -250 }, { x: -560, y: 160 }, { x: -560, y: 560 }];
export const PAD_W = 110, PAD_L = 250;

/** The gate: its centre (in the middle of the south wall), and the stretch of wall its doors close. */
export const GATE = { x: 0, y: COMPOUND.y1 - COMPOUND.wall / 2 } as const;

export interface Tower {
  x: number;
  y: number;
  half: number;
  gate: boolean;
}

function towers(): Tower[] {
  const C = COMPOUND;
  const out: Tower[] = [];
  const inner = C.wall / 2;
  for (let x = C.x0 + inner; x <= C.x1 - inner + 1; x += C.towerEvery) {
    out.push({ x, y: C.y0 + inner, half: C.towerHalf, gate: false });
    if (Math.abs(x) > C.gateHalf + C.gateTowerHalf + C.towerHalf + 10) out.push({ x, y: C.y1 - inner, half: C.towerHalf, gate: false });
  }
  for (let y = C.y0 + inner + C.towerEvery; y < C.y1 - inner - 20; y += C.towerEvery) {
    out.push({ x: C.x0 + inner, y, half: C.towerHalf, gate: false });
    out.push({ x: C.x1 - inner, y, half: C.towerHalf, gate: false });
  }
  out.push({ x: C.x1 - inner, y: C.y1 - inner, half: C.towerHalf, gate: false });
  out.push({ x: C.x0 + inner, y: C.y1 - inner, half: C.towerHalf, gate: false });
  for (const s of [-1, 1]) out.push({ x: s * (C.gateHalf + C.gateTowerHalf), y: C.y1 - inner, half: C.gateTowerHalf, gate: true });
  return out;
}

export const TOWERS: Tower[] = towers();

/** Is (hx, hy) (relative to the Hangar) one of the gate's door tiles? */
export function isGateTile(hx: number, hy: number): boolean {
  return hy >= COMPOUND.y1 - COMPOUND.wall && hy < COMPOUND.y1 && Math.abs(hx + 0.5) < COMPOUND.gateHalf;
}

/** Inside the compound's outer wall line? */
export function inCompound(hx: number, hy: number, pad = 0): boolean {
  const C = COMPOUND;
  return hx >= C.x0 - pad && hx < C.x1 + pad && hy >= C.y0 - pad && hy < C.y1 + pad;
}

/**
 * What the compound puts on a tile (relative to the Hangar), or null outside it: the wall and its towers (the gate's
 * doors closed), the buildings, and the ground (the lane and the pads in plating, the rest concrete).
 */
export function compoundTile(hx: number, hy: number): { t: 'concrete' | 'metal' | 'road' | 'dirt'; o: 'bastion' | 'struct' | 'wall' | null; h: number } | null {
  const C = COMPOUND;
  if (!inCompound(hx, hy)) {
    if (!inFront(hx, hy)) return null;
    // The front: its works on churned dirt, the exit lane paved.
    // (A Titan flattens sandbags and tank traps; the bunkers and masts stand.)
    for (const s of FRONT_STRUCTS) if (hx + 0.5 >= s.x0 && hx + 0.5 < s.x1 && hy + 0.5 >= s.y0 && hy + 0.5 < s.y1) return { t: 'dirt', o: s.kind === 'sandbag' || s.kind === 'hedgehog' ? 'wall' : 'struct', h: s.h };
    return { t: Math.abs(hx + 0.5) < 60 ? 'road' : 'dirt', o: null, h: 0 };
  }
  for (const tw of TOWERS) if (Math.abs(hx + 0.5 - tw.x) < tw.half && Math.abs(hy + 0.5 - tw.y) < tw.half) return { t: 'concrete', o: 'bastion', h: tw.gate ? 64 : 48 };
  if (hx < C.x0 + C.wall || hx >= C.x1 - C.wall || hy < C.y0 + C.wall || hy >= C.y1 - C.wall) return { t: 'concrete', o: 'bastion', h: 30 };
  for (const s of STRUCTS) if (hx >= s.x0 && hx < s.x1 && hy >= s.y0 && hy < s.y1) return { t: 'concrete', o: 'struct', h: s.h };
  if (Math.abs(hx + 0.5) < 60 && hy > 210) return { t: 'road', o: null, h: 0 };
  for (const p of PADS) if (Math.abs(hx + 0.5 - p.x) < PAD_W / 2 && Math.abs(hy + 0.5 - p.y) < PAD_L / 2) return { t: 'metal', o: null, h: 0 };
  return { t: 'concrete', o: null, h: 0 };
}

/**
 * Open ground where people go about their day (rectangles relative to the Hangar), weighted by how many are there:
 * the parade ground, the gunship pads, the motor pool, the lane's edges, the Hangar's apron, the streets between
 * the huts, round the docking pads.
 */
export const AREAS: { x0: number; y0: number; x1: number; y1: number; n: number; kind: 'parade' | 'pads' | 'motor' | 'street' | 'apron' | 'dock' | 'lane' }[] = [
  { x0: 404, y0: 192, x1: 556, y1: 360, n: 24, kind: 'parade' },
  { x0: 572, y0: 200, x1: 720, y1: 356, n: 6, kind: 'pads' },
  { x0: 392, y0: 612, x1: 548, y1: 776, n: 6, kind: 'motor' },
  { x0: -150, y0: 240, x1: -112, y1: 980, n: 6, kind: 'lane' },
  { x0: 112, y0: 240, x1: 150, y1: 980, n: 6, kind: 'lane' },
  { x0: -320, y0: 214, x1: 320, y1: 300, n: 10, kind: 'apron' },
  ...Array.from({ length: 8 }, (_, r) => ({ x0: 396, y0: -198 + r * 48, x1: 730, y1: -186 + r * 48, n: 2, kind: 'street' as const })),
  { x0: 380, y0: 600, x1: 740, y1: 616, n: 3, kind: 'street' },
  ...PADS.map((p) => ({ x0: p.x - PAD_W / 2 - 14, y0: p.y - PAD_L / 2, x1: p.x + PAD_W / 2 + 14, y1: p.y + PAD_L / 2, n: 4, kind: 'dock' as const })),
];
