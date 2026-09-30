import { hash2, makeCanvas, shade } from './pixels';

/**
 * The garrison's machines from above, in the compound's pixel style (four pixels a metre, lit from the north-west,
 * dark outlines): main battle tanks (hull, tracks and a turret that turns on its own), eight-wheeled APCs, trucks
 * with canvas-covered beds, self-propelled guns, jeeps, and the gunships (fuselage, stub wings with rocket pods, tail
 * boom; the rotor drawn live). Each painted once and cached; drawn in metres, nose toward +x.
 */

export const VPX = 4;

export type VehicleKind = 'tank' | 'apc' | 'truck' | 'artillery' | 'jeep';

export interface VSprite {
  c: HTMLCanvasElement;
  /** Size in metres and the pivot (centre) in metres from the top-left. */
  l: number;
  w: number;
}

const SIZE: Record<VehicleKind, [number, number]> = { tank: [9.6, 3.8], apc: [8.4, 3.2], truck: [9, 3], artillery: [10, 3.6], jeep: [4.8, 2.4] };
const cache = new Map<string, VSprite>();

type C = CanvasRenderingContext2D;

function R(c: C, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}

function box(c: C, x: number, y: number, w: number, h: number, col: string): void {
  R(c, x - 0.25, y - 0.25, w + 0.5, h + 0.5, '#0a0c0e');
  R(c, x, y, w, h, col);
  R(c, x, y, w, 0.3, shade(col, 0.28));
  R(c, x, y, 0.3, h, shade(col, 0.14));
  R(c, x, y + h - 0.35, w, 0.35, shade(col, -0.4));
  R(c, x + w - 0.3, y, 0.3, h, shade(col, -0.25));
}

function disc(c: C, x: number, y: number, r: number, col: string): void {
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

const OLIVE = ['#5a6a3a', '#6a6a44', '#4e5e3e', '#7a6e4a'];

/** A parked or dug-in vehicle, nose to +x, in a camouflage colour picked by `v`. */
export function vehicleSprite(kind: VehicleKind, v: number): VSprite {
  const col = kind === 'jeep' ? ['#6a6a44', '#8a7a52'][v % 2] : OLIVE[v % OLIVE.length];
  const key = `${kind}|${col}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [L, W] = SIZE[kind];
  const pad = 0.6;
  const cv = makeCanvas((L + pad * 2) * VPX, (W + pad * 2) * VPX);
  const c = cv.getContext('2d')!;
  c.setTransform(VPX, 0, 0, VPX, pad * VPX, pad * VPX);
  const camo = (x: number, y: number, w: number, h: number): void => {
    for (let k = 0; k < (w * h) / 2.5; k++) {
      const hx = hash2(k, v, 41), hy = hash2(v, k, 42);
      c.fillStyle = k % 2 ? 'rgba(40,46,24,0.4)' : 'rgba(120,104,70,0.32)';
      c.beginPath();
      c.ellipse(x + hx * w, y + hy * h, 0.5 + hash2(k, 3, v) * 0.8, 0.3 + hash2(k, 4, v) * 0.5, hx * 3, 0, Math.PI * 2);
      c.fill();
    }
  };
  switch (kind) {
    case 'tank':
    case 'artillery': {
      // Tracks down both sides, then the hull between them.
      for (const y of [0, W - 0.9]) {
        box(c, 0, y, L, 0.9, '#262828');
        for (let x = 0.2; x < L; x += 0.45) R(c, x, y + 0.1, 0.18, 0.7, '#3e4040');
      }
      box(c, 0.3, 0.7, L - 0.6, W - 1.4, col);
      camo(0.3, 0.7, L - 0.6, W - 1.4);
      // Engine deck grilles at the back, hatches, tools and a tow cable.
      for (let x = 0.7; x < 2.6; x += 0.35) R(c, x, 1.1, 0.18, W - 2.2, shade(col, -0.35));
      R(c, L - 1.6, 1, 1.1, W - 2, shade(col, 0.08));
      R(c, L - 1.4, W / 2 - 0.2, 0.6, 0.4, '#1a1c1e');
      R(c, 3, W - 1.05, 3.2, 0.15, '#6a5030');
      if (kind === 'artillery') {
        box(c, 2, 0.9, 4.2, W - 1.8, shade(col, 0.06));
        R(c, 5.8, W / 2 - 0.3, 5.4, 0.6, '#2a2c2e');
        R(c, 10.6, W / 2 - 0.4, 0.8, 0.8, '#1a1c1e');
        disc(c, 3.2, W / 2, 0.45, '#1a1c1e');
      }
      break;
    }
    case 'apc': {
      for (let k = 0; k < 4; k++) for (const y of [-0.15, W - 0.35]) R(c, 1.2 + k * 1.9, y, 1.1, 0.5, '#1a1a1a');
      box(c, 0, 0.2, L, W - 0.4, col);
      camo(0, 0.2, L, W - 0.4);
      c.fillStyle = shade(col, 0.15);
      c.beginPath();
      c.moveTo(L - 1.8, 0.2);
      c.lineTo(L, 0.8);
      c.lineTo(L, W - 0.8);
      c.lineTo(L - 1.8, W - 0.2);
      c.fill();
      disc(c, L * 0.55, W / 2, 0.8, shade(col, -0.2));
      R(c, L * 0.55, W / 2 - 0.12, 2, 0.24, '#1e2022');
      for (const x of [1.2, 2.6]) R(c, x, W / 2 - 0.7, 0.9, 1.4, shade(col, -0.12));
      break;
    }
    case 'truck': {
      for (const x of [1.2, 2.4, 7.6]) for (const y of [-0.15, W - 0.35]) R(c, x, y, 0.9, 0.5, '#1a1a1a');
      // The bed under canvas, ribbed over its hoops, then the cab.
      box(c, 0, 0.1, 6.4, W - 0.2, '#6e6a50');
      for (let x = 0.6; x < 6.2; x += 1.1) R(c, x, 0.2, 0.2, W - 0.4, '#565240');
      box(c, 6.6, 0.25, 2.4, W - 0.5, col);
      R(c, 8.3, 0.5, 0.5, W - 1, '#3a5a6a');
      break;
    }
    case 'jeep': {
      for (const x of [0.6, 3.6]) for (const y of [-0.1, W - 0.4]) R(c, x, y, 0.8, 0.5, '#1a1a1a');
      box(c, 0, 0.2, L, W - 0.4, col);
      R(c, 2.4, 0.4, 0.3, W - 0.8, '#3a5a6a');
      R(c, 0.6, 0.6, 1.4, W - 1.2, shade(col, -0.3));
      disc(c, 1.2, W / 2, 0.25, '#2a2a2a');
      break;
    }
  }
  const sp = { c: cv, l: L + pad * 2, w: W + pad * 2 };
  cache.set(key, sp);
  return sp;
}

/** A tank's turret (pivot at its centre, gun to +x). */
export function turretSprite(v: number): VSprite {
  const col = OLIVE[v % OLIVE.length];
  const key = `turret|${col}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const L = 10, W = 3.2;
  const cv = makeCanvas(L * VPX, W * VPX);
  const c = cv.getContext('2d')!;
  c.setTransform(VPX, 0, 0, VPX, 0, 0);
  // Pivot at x 3.2: the housing round it, the gun out to the right.
  R(c, 4.5, W / 2 - 0.22, 5.2, 0.44, '#1e2022');
  R(c, 4.5, W / 2 - 0.22, 5.2, 0.12, '#4a4e52');
  R(c, 9.2, W / 2 - 0.34, 0.7, 0.68, '#141618');
  c.fillStyle = '#0a0c0e';
  c.beginPath();
  c.moveTo(0.8, 0.2);
  c.lineTo(4.6, 0.3);
  c.lineTo(5.4, W / 2);
  c.lineTo(4.6, W - 0.3);
  c.lineTo(0.8, W - 0.2);
  c.lineTo(0.3, W / 2);
  c.closePath();
  c.fill();
  c.fillStyle = shade(col, 0.1);
  c.beginPath();
  c.moveTo(1, 0.45);
  c.lineTo(4.4, 0.5);
  c.lineTo(5.1, W / 2);
  c.lineTo(4.4, W - 0.5);
  c.lineTo(1, W - 0.45);
  c.lineTo(0.6, W / 2);
  c.closePath();
  c.fill();
  R(c, 1, 0.45, 3.4, 0.25, shade(col, 0.35));
  disc(c, 2.2, W / 2 + 0.5, 0.5, shade(col, -0.25));
  disc(c, 2.2, W / 2 + 0.5, 0.3, '#2a2c2e');
  R(c, 3.2, 0.7, 0.8, 0.5, '#2a2c2e');
  const sp = { c: cv, l: L, w: W };
  cache.set(key, sp);
  return sp;
}

let shipCache: HTMLCanvasElement | null = null;

/** A gunship from above, nose to +x, 18 m long: fuselage, canopy, stub wings with rocket pods, tail boom and fin. */
export function gunshipSprite(): { c: HTMLCanvasElement; l: number; w: number } {
  const L = 18, W = 9;
  if (shipCache) return { c: shipCache, l: L, w: W };
  const cv = makeCanvas(L * VPX, W * VPX);
  const c = cv.getContext('2d')!;
  c.setTransform(VPX, 0, 0, VPX, 0, W * VPX / 2);
  const body = '#4e5a44';
  // Tail boom and the tail rotor's fin.
  R(c, 0.4, -0.35, 8, 0.7, '#0a0c0e');
  R(c, 0.5, -0.25, 8, 0.5, shade(body, -0.05));
  R(c, 0.3, -1.6, 1, 3.2, '#0a0c0e');
  R(c, 0.4, -1.5, 0.8, 3, shade(body, 0.05));
  // Stub wings with rocket pods and missile rails.
  for (const s of [-1, 1]) {
    R(c, 9, s > 0 ? 0.8 : -4.2, 2.2, 3.4, '#0a0c0e');
    R(c, 9.1, s > 0 ? 0.9 : -4.1, 2, 3.2, shade(body, s < 0 ? 0.15 : -0.1));
    R(c, 8.6, s * 3.2 - 0.55, 3.4, 1.1, '#1e2022');
    for (let k = 0; k < 3; k++) disc(c, 11.8, s * 3.2 - 0.35 + k * 0.35, 0.12, '#c8a040');
    R(c, 8.8, s * 2 - 0.2, 3, 0.4, '#3a3e42');
  }
  // The fuselage: a tapered hull, lit on its port side.
  c.fillStyle = '#0a0c0e';
  c.beginPath();
  c.moveTo(7.6, -1.3);
  c.lineTo(15.5, -1.4);
  c.quadraticCurveTo(18, -0.8, 18, 0);
  c.quadraticCurveTo(18, 0.8, 15.5, 1.4);
  c.lineTo(7.6, 1.3);
  c.closePath();
  c.fill();
  c.fillStyle = body;
  c.beginPath();
  c.moveTo(7.8, -1.1);
  c.lineTo(15.4, -1.2);
  c.quadraticCurveTo(17.7, -0.7, 17.7, 0);
  c.quadraticCurveTo(17.7, 0.7, 15.4, 1.2);
  c.lineTo(7.8, 1.1);
  c.closePath();
  c.fill();
  R(c, 7.8, -1.1, 7.6, 0.45, shade(body, 0.22));
  R(c, 7.8, 0.6, 7.6, 0.45, shade(body, -0.3));
  // Canopy (two seats in tandem), the engine intakes, the chin gun.
  c.fillStyle = '#1a2a3a';
  c.beginPath();
  c.ellipse(15.6, 0, 1.6, 0.8, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#5a8ab0';
  c.beginPath();
  c.ellipse(15.9, -0.25, 0.9, 0.35, 0, 0, Math.PI * 2);
  c.fill();
  for (const s of [-1, 1]) R(c, 10.5, s * 0.9 - 0.3, 1.6, 0.6, '#2a2e30');
  disc(c, 11.8, 0, 0.7, '#2a2e30');
  disc(c, 11.8, 0, 0.3, '#8a8e94');
  R(c, 17.2, -0.12, 1.4, 0.24, '#1a1c1e');
  shipCache = cv;
  return { c: cv, l: L, w: W };
}
