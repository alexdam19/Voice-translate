import type { Game } from '../../game/game';
import {
  COMPOUND, FRONT_GUNS, FRONT_STRUCTS, GATE, GATE_TOWER_H, HANGAR_APEX, HANGAR_EAVE, PINES, SECTORS, STRUCTS, TOWERS,
  TOWER_H, WALL_H, visualHeight, type Struct, type StructKind, type Tower,
} from '../../shared/compound';
import { HANGAR } from '../../shared/mapgen';
import { miniWidth, pxMini } from '../../ui/pixfont';
import { ART_PX, frontSprite, hasStructSprite, structSprite } from './compoundArt';
import { ctx2d, hash2, makeCanvas, shade } from './pixels';

/**
 * The Mega Hangar's base stood up off the ground. The overhead view looks down through a lens a few hundred metres
 * up, so everything tall leans out from the middle of the screen and the higher it reaches the further it leans
 * (the way a city looks from a helicopter): the Hangar's 70 m walls under its green 125 m vault, the 30 m fortified
 * wall and its roofed watchtowers, the gate towers and the bridge between them, the barracks, workshops and
 * warehouses in their sectors, the cooling stacks, the radar dome, the 150 m signal masts and the pine forest round
 * the walls. A Titan rolling through it is a small thing.
 *
 * Every building is a box (or a drum, a vault, a lattice, a tree) drawn as its faces toward the eye, each painted with
 * its own facade (windows by the floor, roller doors, slits, ribs, stencilled names), then its roof at the top. Things
 * are drawn from the farthest to the nearest, so the near ones stand in front. Under the Hangar's roof the roof lifts
 * away and you see in.
 */

/**
 * The lens is pitched: it looks down at the base from the south, so uprights lean up the screen and out from a point
 * well below its bottom edge (NADIR screen heights down), and a storey stands LEAN of its height tall in the middle
 * of the screen whatever the zoom.
 */
const NADIR = 2.2, LEAN = 1.35;
/** Shadows fall south-east, this far per metre of height. */
const SHX = 0.85, SHY = 0.62;

export interface P3 {
  c: CanvasRenderingContext2D;
  ppm: number;
  /** The vanishing point (the middle of the screen). */
  cx: number;
  cy: number;
  /** Where the Hangar's centre is on the screen, at ground level. */
  ox: number;
  oy: number;
  camH: number;
  /** The ground under the lens, metres from the Hangar's centre. */
  camX: number;
  camY: number;
  w: number;
  h: number;
  time: number;
  /** Your ship's centre and reach on the screen, so nothing hides her. */
  sx: number;
  sy: number;
  sr: number;
}

export function makeP3(c: CanvasRenderingContext2D, ppm: number, cx: number, cy: number, ox: number, oy: number, time: number, sx: number, sy: number, sr: number): P3 {
  const h = c.canvas.height, w = c.canvas.width;
  const ny = cy + NADIR * h;
  const camH = (NADIR * h) / (ppm * LEAN);
  return { c, ppm, cx, cy: ny, ox, oy, camH, camX: (cx - ox) / ppm, camY: (ny - oy) / ppm, w, h, time, sx, sy, sr };
}

const sOf = (p: P3, z: number): number => p.camH / (p.camH - Math.min(z, p.camH * 0.8));
/** Screen x of a point x metres east of the Hangar's centre, z metres up. */
export const PX = (p: P3, x: number, z: number): number => p.cx + (p.ox + x * p.ppm - p.cx) * sOf(p, z);
export const PY = (p: P3, y: number, z: number): number => p.cy + (p.oy + y * p.ppm - p.cy) * sOf(p, z);

/** Draw in metres from the Hangar's centre on the plane z metres up. */
export function atZ(p: P3, z: number): void {
  const s = sOf(p, z), k = p.ppm * s;
  p.c.setTransform(k, 0, 0, k, p.cx + (p.ox - p.cx) * s, p.cy + (p.oy - p.cy) * s);
}

const R = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string): void => {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
};

// ---------------------------------------------------------------------------------------------- facades

interface FStyle {
  wall: string;
  /** Storey height (m). */
  floor: number;
  /** Windows: width, height, spacing (m). */
  win?: [number, number, number];
  winCol?: string;
  litCol?: string;
  lit?: number;
  /** Ribbon glazing along each storey instead of windows. */
  band?: boolean;
  /** Corrugation every so many metres. */
  ribs?: number;
  /** Pilasters every so many metres. */
  pil?: number;
  trim?: string;
  doors?: { every: number; w: number; h: number; col: string; roller?: boolean; stripe?: boolean };
  slits?: boolean;
  stripe?: boolean;
  pipes?: boolean;
  crenel?: boolean;
  bags?: boolean;
  lamps?: boolean;
}

const ST: Record<string, FStyle> = {
  wallIn: { wall: '#6b6c66', floor: 30, pil: 12, trim: '#8c8d86', lamps: true },
  wallOut: { wall: '#5e5f5a', floor: 30, pil: 12, trim: '#7e7f78', slits: true, crenel: true },
  plinth: { wall: '#5d5e59', floor: 30, pil: 16, trim: '#7e7f78', slits: true },
  shaft: { wall: '#4c504a', floor: 8, slits: true, trim: '#6a6e66' },
  cabin: { wall: '#2e342c', floor: 9, band: true, winCol: '#1c2830', litCol: '#ffe08a', lit: 0.75, trim: '#4a5244' },
  gatetower: { wall: '#6c695f', floor: 9, slits: true, pil: 6, crenel: true, stripe: true, trim: '#8c897f' },
  door: { wall: '#4e5258', floor: 26, ribs: 2, stripe: true, trim: '#6a6f76' },
  bridge: { wall: '#5c5e58', floor: 12, slits: true, trim: '#7e8078' },
  hangar: { wall: '#5d685a', floor: 70, ribs: 2.5, pil: 25, trim: '#7c8878', lamps: true },
  hangarIn: { wall: '#454a44', floor: 14, ribs: 3, pil: 25, win: [6, 2, 35], winCol: '#2a2e2a', litCol: '#fff0c0', lit: 1, trim: '#5a6058' },
  gable: { wall: '#566152', floor: 60, ribs: 2.5, trim: '#6e7a6a' },
  barracks: { wall: '#6b7350', floor: 4, win: [1.6, 1.4, 4], winCol: '#2a333a', lit: 0.35, pil: 12, doors: { every: 32, w: 3, h: 3, col: '#3a2e22' }, trim: '#8a9068' },
  workshop: { wall: '#5c6670', floor: 11, ribs: 1, band: true, winCol: '#3a4a58', litCol: '#e8f0ff', lit: 0.4, doors: { every: 26, w: 11, h: 9, col: '#3a3e44', roller: true, stripe: true }, pipes: true, trim: '#7c8690' },
  bar: { wall: '#7a4836', floor: 4, win: [2, 1.6, 3.6], winCol: '#3a2a20', litCol: '#ffb060', lit: 0.75, doors: { every: 40, w: 3, h: 3, col: '#2a1a12' }, trim: '#9a6a52' },
  clinic: { wall: '#cfcfc6', floor: 4.5, win: [2.4, 1.6, 4], winCol: '#3a5a6a', litCol: '#d8f4ff', lit: 0.4, doors: { every: 60, w: 5, h: 3.2, col: '#3a5a6a' }, trim: '#e8e8e0' },
  warehouse: { wall: '#56663f', floor: 13, ribs: 1.2, doors: { every: 30, w: 12, h: 10, col: '#3e4636', roller: true, stripe: true }, trim: '#6e7e56' },
  garage: { wall: '#626a4c', floor: 15, ribs: 1.5, doors: { every: 18, w: 12, h: 9, col: '#3a3e34', roller: true, stripe: true }, trim: '#7e8662' },
  armory: { wall: '#585a54', floor: 5, slits: true, stripe: true, pil: 8, doors: { every: 70, w: 8, h: 6, col: '#2e3236', roller: true, stripe: true }, trim: '#767870' },
  gatehouse: { wall: '#6e6b62', floor: 7, slits: true, pil: 10, crenel: true, doors: { every: 60, w: 6, h: 4, col: '#2e2a24' }, trim: '#8e8b82' },
  command: { wall: '#7c8084', floor: 4.2, band: true, winCol: '#1e3446', litCol: '#7fd4ff', lit: 0.6, pil: 14, doors: { every: 70, w: 6, h: 3.5, col: '#1a2430' }, trim: '#a0a4a8' },
  depot: { wall: '#7a705a', floor: 9, ribs: 1.5, doors: { every: 22, w: 9, h: 7, col: '#4a4436', roller: true }, trim: '#968c74' },
  store: { wall: '#6c6e6a', floor: 4, win: [1.4, 1, 6], winCol: '#2a3036', lit: 0.25, doors: { every: 24, w: 4, h: 3.5, col: '#3a3c3e', roller: true }, trim: '#8a8c88' },
  mess: { wall: '#6e4a36', floor: 4, win: [2, 1.4, 4], winCol: '#2e221a', litCol: '#ffc070', lit: 0.6, doors: { every: 40, w: 3, h: 3, col: '#2a1a12' }, trim: '#8e6a52' },
  quonset: { wall: '#5d6747', floor: 9, ribs: 1, doors: { every: 60, w: 3, h: 3, col: '#3a2a1c' }, trim: '#6e7856' },
  ammo: { wall: '#6a6a64', floor: 7, stripe: true, doors: { every: 60, w: 7, h: 5, col: '#2a2c2a', roller: true, stripe: true }, trim: '#7e7e76' },
  plant: { wall: '#5a5e62', floor: 6, band: true, winCol: '#2a3238', litCol: '#ffd27a', lit: 0.35, ribs: 2, pipes: true, pil: 20, trim: '#767a7e' },
  radar: { wall: '#7a7c78', floor: 6, slits: true, pil: 10, doors: { every: 80, w: 6, h: 4, col: '#2a2c2e' }, trim: '#9a9c98' },
  bunker: { wall: '#6a675c', floor: 5, slits: true, trim: '#7e7b70' },
  sandbag: { wall: '#9a8a5c', floor: 2, bags: true },
  plain: { wall: '#7a7870', floor: 4, win: [1.6, 1.2, 5], winCol: '#2a3036', lit: 0.3, trim: '#9a9890' },
};

const KIND_STYLE: Partial<Record<StructKind, string>> = {
  barracks: 'barracks', workshop: 'workshop', bar: 'bar', clinic: 'clinic', warehouse: 'warehouse', garage: 'garage',
  armory: 'armory', gatehouse: 'gatehouse', command: 'command', depot: 'depot', store: 'store', mess: 'mess',
  quonset: 'quonset', ammo: 'ammo', plant: 'plant', radar: 'radar', bunker: 'bunker', sandbag: 'sandbag',
};

const SIGN: Partial<Record<StructKind, [string, string, string]>> = {
  barracks: ['BARRACKS', '#e8e4d0', '#3a4030'], workshop: ['WORKSHOP', '#ffd040', '#2a2e34'], bar: ['CANTINA', '#ff60c0', '#2a1218'],
  clinic: ['CLINIC', '#d02020', '#f0f0ea'], warehouse: ['STORES', '#e8e4d0', '#3a4430'], garage: ['GARAGE', '#ffd040', '#2a2e26'],
  armory: ['ARMOURY', '#ff5a3a', '#26282a'], gatehouse: ['GUARD', '#e8e4d0', '#3e3a32'], command: ['COMMAND', '#7fd4ff', '#1a2430'],
  depot: ['SUPPLY', '#e8e4d0', '#4a4436'], store: ['STORE', '#e8e4d0', '#3a3c3e'], mess: ['MESS HALL', '#ffd27a', '#2e1e14'],
  plant: ['POWER', '#ffd040', '#2a2e32'], radar: ['RADAR', '#7fd4ff', '#2a2c2e'],
};

function paintFace(st: FStyle, len: number, hgt: number, seed: number, sign: [string, string, string] | null): HTMLCanvasElement {
  const P = 2;
  const W = Math.max(2, Math.round(len * P)), H = Math.max(2, Math.round(hgt * P));
  const cv = makeCanvas(W, H);
  const c = ctx2d(cv);
  const wall = st.wall;
  R(c, 0, 0, W, H, wall);
  // Panels a shade apart, as if built a section at a time.
  const panel = Math.max(4, Math.round((st.pil ?? 8) * P));
  for (let x = 0; x < W; x += panel) R(c, x, 0, panel, H, shade(wall, (hash2(x, seed, 7) - 0.5) * 0.1));
  if (st.bags) {
    for (let y = 0; y < H; y += 2) for (let x = (y / 2) % 2 ? 0 : 1.5; x < W; x += 3) {
      R(c, x, y, 2.6, 1.6, hash2(x, y, seed) > 0.5 ? wall : shade(wall, -0.14));
      R(c, x, y, 2.6, 0.6, shade(wall, 0.18));
    }
    return cv;
  }
  if (st.ribs) {
    const rp = Math.max(2, Math.round(st.ribs * P));
    for (let x = 0; x < W; x += rp) {
      R(c, x, 0, 1, H, shade(wall, -0.2));
      if (rp > 2) R(c, x + 1, 0, 1, H, shade(wall, 0.08));
    }
  }
  // Storeys: a slab line between them, windows on each.
  const fl = st.floor * P;
  const nF = Math.max(1, Math.floor(H / fl + 0.15));
  const doorsAt = (x: number, w: number): boolean => {
    const d = st.doors;
    if (!d) return false;
    const ev = d.every * P, dw = d.w * P;
    const n = Math.max(1, Math.round(W / ev));
    for (let k = 0; k < n; k++) {
      const dx = ((k + 0.5) / n) * W - dw / 2;
      if (x + w > dx - 2 && x < dx + dw + 2) return true;
    }
    return false;
  };
  for (let i = 0; i < nF; i++) {
    const yb = H - i * fl;
    if (i > 0 && fl < H) R(c, 0, yb, W, 1, shade(wall, -0.2));
    if (st.band) {
      if (i === 0 && st.doors) continue;
      const bh = Math.max(2, Math.round(fl * 0.38)), by = Math.round(yb - fl * 0.72);
      R(c, 2, by, W - 4, bh, st.winCol ?? '#2a3036');
      for (let x = 2; x < W - 4; x += 6) {
        if (hash2(x, i, seed + 3) < (st.lit ?? 0.3)) R(c, x, by, 5, bh, st.litCol ?? '#ffd27a');
        R(c, x, by, 1, bh, shade(wall, -0.3));
      }
      R(c, 2, by + bh, W - 4, 1, shade(wall, 0.25));
    } else if (st.win) {
      const [ww, wh, gap] = st.win;
      const pw = Math.max(1, Math.round(ww * P)), ph = Math.max(1, Math.round(wh * P)), pg = Math.max(pw + 1, Math.round(gap * P));
      const wy = Math.round(yb - fl * 0.78);
      for (let x = Math.round(pg / 2); x + pw < W - 1; x += pg) {
        if (i === 0 && doorsAt(x, pw)) continue;
        const lit = hash2(x, i, seed + 5) < (st.lit ?? 0.3);
        R(c, x, wy, pw, ph, lit ? st.litCol ?? '#ffd27a' : st.winCol ?? '#2a3036');
        if (lit && ph > 1) R(c, x, wy, pw, 1, '#fff6d8');
        R(c, x, wy + ph, pw, 1, shade(wall, 0.25));
        // A rust or soot streak under some.
        if (hash2(x, i, seed + 9) < 0.3) R(c, x + pw / 2, wy + ph + 1, 1, Math.min(fl * 0.5, 3 + hash2(x, i, seed) * 5), 'rgba(30,24,16,0.28)');
      }
    } else if (st.slits && fl >= 8) {
      const sy = Math.round(yb - fl * 0.6);
      for (let x = 5; x < W - 5; x += 9) R(c, x, sy, 3, 1, '#121416');
    }
  }
  // Pilasters and buttresses.
  if (st.pil) {
    const pp = Math.round(st.pil * P);
    for (let x = 0; x < W; x += pp) {
      R(c, x, 0, 2, H, shade(wall, 0.12));
      R(c, x + 2, 0, 1, H, shade(wall, -0.28));
    }
  }
  if (st.slits && fl < 8) {
    for (let i = 1; i < nF; i++) for (let x = 6; x < W - 6; x += 12) R(c, x, H - i * fl - fl * 0.6, 3, 1, '#121416');
  }
  // Doors on the ground.
  if (st.doors) {
    const d = st.doors, ev = d.every * P, dw = Math.min(W - 4, d.w * P), dh = Math.min(H - 3, d.h * P);
    const n = Math.max(1, Math.round(W / ev));
    for (let k = 0; k < n; k++) {
      const dx = Math.round(((k + 0.5) / n) * W - dw / 2);
      R(c, dx - 1, H - dh - 1, dw + 2, dh + 1, shade(wall, -0.4));
      R(c, dx, H - dh, dw, dh, d.col);
      if (d.roller) for (let y = H - dh + 1; y < H; y += 2) R(c, dx, y, dw, 1, shade(d.col, 0.12));
      if (d.stripe) for (let x = dx - 1; x < dx + dw + 1; x += 2) R(c, x, H - dh - 2, 1, 1, Math.floor(x / 2) % 2 ? '#f0b020' : '#141414');
      if (!d.roller) R(c, dx + dw - 2, H - dh / 2, 1, 1, '#c8c0a0');
      // A lamp over each.
      R(c, dx + dw / 2 - 1, H - dh - 3, 2, 1, '#fff2c0');
    }
  }
  // Pipes run up the face, with brackets.
  if (st.pipes) {
    for (let x = 14; x < W - 6; x += 46) {
      R(c, x, 3, 2, H - 4, '#4a4e52');
      R(c, x, 3, 1, H - 4, '#6e7478');
      for (let y = 6; y < H - 2; y += 8) R(c, x - 1, y, 4, 1, '#2e3236');
    }
  }
  // Hazard stripe round the foot.
  if (st.stripe) for (let x = 0; x < W; x += 2) R(c, x, H - 3, 1, 2, Math.floor(x / 4) % 2 ? '#d8a020' : '#1a1a1a');
  // Floodlights along the top.
  if (st.lamps) for (let x = 20; x < W - 4; x += 60) {
    R(c, x, 4, 3, 2, '#2a2c2e');
    R(c, x, 6, 3, 1, '#fff2c0');
  }
  // The top: a cap, a drip line; merlons on a fighting wall.
  R(c, 0, 0, W, 2, st.trim ?? shade(wall, 0.22));
  R(c, 0, 2, W, 1, shade(wall, -0.35));
  if (st.crenel) for (let x = 0; x < W; x += 8) R(c, x + 5, 0, 3, 2, shade(wall, -0.45));
  // Darker toward the ground, grime and stains.
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.06)');
  g.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  for (let k = 0; k < W / 30; k++) {
    const x = hash2(k, seed, 31) * W, y = hash2(k, seed, 32) * H;
    c.fillStyle = hash2(k, seed, 33) < 0.7 ? 'rgba(30,22,12,0.12)' : 'rgba(255,250,235,0.07)';
    c.fillRect(Math.round(x), Math.round(y), Math.round(3 + hash2(k, seed, 34) * 9), Math.round(2 + hash2(k, seed, 35) * 10));
  }
  R(c, 0, H - 1, W, 1, 'rgba(0,0,0,0.5)');
  // The building's name, stencilled on a plate.
  if (sign && W > 40 && H > 12) {
    const [t, col, bg] = sign;
    const u = Math.max(1, Math.min(9, Math.floor(Math.min((W * 0.6) / (t.length * 4), (H * 0.32) / 5))));
    const tw = miniWidth(t, u);
    if (tw + 8 < W) {
      const sx = Math.round(W / 2), sy = Math.round(Math.min(H - 5 * u - 6, Math.max(4, H * 0.18)));
      R(c, sx - tw / 2 - 3, sy - 2, tw + 6, 5 * u + 4, bg);
      R(c, sx - tw / 2 - 3, sy + 5 * u + 2, tw + 6, 1, 'rgba(0,0,0,0.4)');
      pxMini(c, t, sx, sy, col, 'center', null, u);
    }
  }
  return cv;
}

function transpose(src: HTMLCanvasElement): HTMLCanvasElement {
  const t = makeCanvas(src.height, src.width);
  const c = ctx2d(t);
  c.setTransform(0, 1, 1, 0, 0, 0);
  c.drawImage(src, 0, 0);
  return t;
}

const texCache = new Map<string, HTMLCanvasElement>();
let budget = 0;

/** A facade's texture (for an east or west face, turned on its side), or null while it waits its turn to be painted. */
function faceTex(style: string, len: number, hgt: number, seed: number, sign: [string, string, string] | null, side: boolean): HTMLCanvasElement | null {
  const key = `${style}|${Math.round(len)}|${Math.round(hgt)}|${seed & 3}|${sign ? sign[0] : ''}|${side ? 1 : 0}`;
  const have = texCache.get(key);
  if (have) return have;
  if (budget-- <= 0) return null;
  const face = paintFace(ST[style] ?? ST.plain, len, hgt, seed & 3, sign);
  const t = side ? transpose(face) : face;
  texCache.set(key, t);
  return t;
}

/** How much darker each side is: the street-facing south sides kept readable, the east ones in shade. */
const SIDE_DARK = { n: 0.16, w: 0.04, s: 0.08, e: 0.26 } as const;

/** A face's silhouette: its upright edges dark, a contact shadow where it meets the ground. */
function edges(p: P3, ax: number, ay: number, bx: number, by: number, z0: number, z1: number): void {
  const c = p.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.strokeStyle = 'rgba(8,10,12,0.55)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(Math.round(PX(p, ax, z0)) + 0.5, Math.round(PY(p, ay, z0)));
  c.lineTo(Math.round(PX(p, ax, z1)) + 0.5, Math.round(PY(p, ay, z1)));
  c.moveTo(Math.round(PX(p, bx, z0)) - 0.5, Math.round(PY(p, by, z0)));
  c.lineTo(Math.round(PX(p, bx, z1)) - 0.5, Math.round(PY(p, by, z1)));
  c.stroke();
  if (z0 <= 0.01) {
    c.strokeStyle = 'rgba(6,8,10,0.5)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(PX(p, ax, 0), Math.round(PY(p, ay, 0)) - 1);
    c.lineTo(PX(p, bx, 0), Math.round(PY(p, by, 0)) - 1);
    c.stroke();
  }
}

/** A face looking north or south (y = yf), x0..x1 along it, from z0 up to z1, as strips a couple of pixels deep. */
function faceNS(p: P3, yf: number, x0: number, x1: number, z0: number, z1: number, tex: HTMLCanvasElement | null, col: string, dark: number, arch?: (z: number) => number): void {
  const c = p.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const ya = PY(p, yf, z0), yb = PY(p, yf, z1);
  const thick = Math.abs(yb - ya);
  if (thick < 0.5) return;
  const n = Math.max(1, Math.min(56, Math.ceil(thick / 2.2)));
  let prev = Math.round(ya);
  const mid = (x0 + x1) / 2, half = (x1 - x0) / 2;
  for (let k = 0; k < n; k++) {
    const za = z0 + ((z1 - z0) * k) / n, zb = z0 + ((z1 - z0) * (k + 1)) / n, zm = (za + zb) / 2;
    const yy = Math.round(PY(p, yf, zb));
    const top = Math.min(prev, yy), hh = Math.abs(yy - prev);
    if (hh > 0) {
      const hw = arch ? arch(zm) : half;
      if (hw > 0) {
        const xa = Math.round(PX(p, mid - hw, zm)), xb = Math.round(PX(p, mid + hw, zm));
        if (tex) {
          const f = hw / half;
          const sw = tex.width * f, sx = (tex.width - sw) / 2;
          c.drawImage(tex, sx, tex.height * (1 - (k + 1) / n), sw, tex.height / n, xa, top, xb - xa, hh);
        } else {
          c.fillStyle = col;
          c.fillRect(xa, top, xb - xa, hh);
        }
        if (dark > 0) {
          c.fillStyle = `rgba(8,12,18,${dark})`;
          c.fillRect(xa, top, xb - xa, hh);
        }
      }
    }
    prev = yy;
  }
}

/** A face looking east or west (x = xf), y0..y1 along it, as upright strips. */
function faceEW(p: P3, xf: number, y0: number, y1: number, z0: number, z1: number, tex: HTMLCanvasElement | null, col: string, dark: number): void {
  const c = p.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const xa = PX(p, xf, z0), xb = PX(p, xf, z1);
  const thick = Math.abs(xb - xa);
  if (thick < 0.5) return;
  const n = Math.max(1, Math.min(56, Math.ceil(thick / 2.2)));
  let prev = Math.round(xa);
  for (let k = 0; k < n; k++) {
    const zb = z0 + ((z1 - z0) * (k + 1)) / n, zm = z0 + ((z1 - z0) * (k + 0.5)) / n;
    const xx = Math.round(PX(p, xf, zb));
    const left = Math.min(prev, xx), ww = Math.abs(xx - prev);
    if (ww > 0) {
      const ya = Math.round(PY(p, y0, zm)), yb = Math.round(PY(p, y1, zm));
      if (tex) c.drawImage(tex, tex.width * (1 - (k + 1) / n), 0, tex.width / n, tex.height, left, ya, ww, yb - ya);
      else {
        c.fillStyle = col;
        c.fillRect(left, ya, ww, yb - ya);
      }
      if (dark > 0) {
        c.fillStyle = `rgba(8,12,18,${dark})`;
        c.fillRect(left, ya, ww, yb - ya);
      }
    }
    prev = xx;
  }
}

interface BoxFaces {
  /** Facade style for each side (or one for all). */
  n: string;
  s: string;
  e: string;
  w: string;
}

const allSides = (s: string): BoxFaces => ({ n: s, s, e: s, w: s });

/** A box's faces toward the eye (no roof). */
function boxFaces(p: P3, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, f: BoxFaces, seed: number, sign: [string, string, string] | null, lines = true): void {
  const hgt = z1 - z0;
  if (p.camX > x1) {
    faceEW(p, x1, y0, y1, z0, z1, faceTex(f.e, y1 - y0, hgt, seed + 2, null, true), ST[f.e]?.wall ?? '#777', SIDE_DARK.e);
    if (lines) edges(p, x1, y0, x1, y1, z0, z1);
  } else if (p.camX < x0) {
    faceEW(p, x0, y0, y1, z0, z1, faceTex(f.w, y1 - y0, hgt, seed + 3, null, true), ST[f.w]?.wall ?? '#777', SIDE_DARK.w);
    if (lines) edges(p, x0, y0, x0, y1, z0, z1);
  }
  if (p.camY > y1) {
    faceNS(p, y1, x0, x1, z0, z1, faceTex(f.s, x1 - x0, hgt, seed, sign, false), ST[f.s]?.wall ?? '#777', SIDE_DARK.s);
    if (lines) edges(p, x0, y1, x1, y1, z0, z1);
  } else if (p.camY < y0) {
    faceNS(p, y0, x0, x1, z0, z1, faceTex(f.n, x1 - x0, hgt, seed + 1, sign, false), ST[f.n]?.wall ?? '#777', SIDE_DARK.n);
    if (lines) edges(p, x0, y0, x1, y0, z0, z1);
  }
}

/** A flat roof: a filled top with a parapet edge, in metres at height z. */
function flatTop(p: P3, x0: number, y0: number, x1: number, y1: number, z: number, col: string): void {
  atZ(p, z);
  const c = p.c;
  c.fillStyle = col;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  const k = 1 / (p.ppm * sOf(p, z));
  c.fillStyle = shade(col, 0.22);
  c.fillRect(x0, y0, x1 - x0, k);
  c.fillRect(x0, y0, k, y1 - y0);
  c.fillStyle = shade(col, -0.35);
  c.fillRect(x0, y1 - k, x1 - x0, k);
  c.fillRect(x1 - k, y0, k, y1 - y0);
}

/** A thin dark line round a roof, so each building reads against the next. */
function outline(p: P3, x0: number, y0: number, x1: number, y1: number, z: number): void {
  atZ(p, z);
  const k = 1 / (p.ppm * sOf(p, z));
  p.c.strokeStyle = 'rgba(10,12,14,0.55)';
  p.c.lineWidth = k;
  p.c.strokeRect(x0 + k / 2, y0 + k / 2, x1 - x0 - k, y1 - y0 - k);
}

function pyramid(p: P3, cx: number, cy: number, half: number, zb: number, zt: number, col: string): void {
  const c = p.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const pts = [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half]];
  const ax = PX(p, cx, zt), ay = PY(p, cy, zt);
  const faces = [0, 1, 2, 3].map((i) => {
    const a = pts[i], b = pts[(i + 1) % 4];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    return { a, b, d: Math.hypot(mx - p.camX, my - p.camY), k: [0.12, -0.18, -0.32, 0.02][i] };
  }).sort((u, v) => v.d - u.d);
  for (const f of faces) {
    c.fillStyle = shade(col, f.k);
    c.beginPath();
    c.moveTo(PX(p, f.a[0], zb), PY(p, f.a[1], zb));
    c.lineTo(PX(p, f.b[0], zb), PY(p, f.b[1], zb));
    c.lineTo(ax, ay);
    c.closePath();
    c.fill();
  }
  c.fillStyle = shade(col, 0.4);
  c.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 2, 2);
}

/** A drum standing up (fuel tanks, the water tank, a chimney): its side as rings from the foot up, then its top. */
function drum(p: P3, cx: number, cy: number, r: (z: number) => number, z0: number, z1: number, col: string, top: (p: P3, rt: number) => void, bands?: number[]): void {
  const c = p.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const d = Math.hypot(PX(p, cx, z1) - PX(p, cx, z0), PY(p, cy, z1) - PY(p, cy, z0));
  const n = Math.max(2, Math.min(60, Math.ceil(d / 1.2)));
  const r0 = r(z0) * p.ppm;
  const lit = c.createLinearGradient(-r0, 0, r0, 0);
  lit.addColorStop(0, shade(col, 0.18));
  lit.addColorStop(0.35, col);
  lit.addColorStop(1, shade(col, -0.45));
  for (let k = 0; k <= n; k++) {
    const z = z0 + ((z1 - z0) * k) / n;
    const s = sOf(p, z);
    const x = PX(p, cx, z), y = PY(p, cy, z), rr = r(z) * p.ppm * s;
    const band = bands?.some((b) => Math.abs(b - z) < (z1 - z0) / n / 2 + 0.01);
    c.setTransform(1, 0, 0, 1, x, y);
    c.fillStyle = band ? shade(col, -0.3) : lit;
    c.beginPath();
    c.arc(0, 0, Math.max(0.5, rr), 0, Math.PI * 2);
    c.fill();
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  top(p, r(z1));
}

/** An upright line from the ground to z (a pole, a leg). */
function pole(p: P3, x: number, y: number, z0: number, z1: number, col: string, w: number): void {
  const c = p.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.strokeStyle = col;
  c.lineWidth = Math.max(1, w * p.ppm);
  c.beginPath();
  c.moveTo(PX(p, x, z0), PY(p, y, z0));
  c.lineTo(PX(p, x, z1), PY(p, y, z1));
  c.stroke();
}

function seg3(p: P3, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  p.c.moveTo(PX(p, x0, z0), PY(p, y0, z0));
  p.c.lineTo(PX(p, x1, z1), PY(p, y1, z1));
}

// ---------------------------------------------------------------------------------------------- the scene

interface Item {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  top: number;
  draw: (p: P3, g: Game, it: Item) => void;
  /** Index into STRUCTS / FRONT_STRUCTS / TOWERS where it has one. */
  i: number;
  d: number;
}

let scene: Item[] | null = null;

function structItem(s: Struct, i: number): Item {
  const top = visualHeight(s);
  const it: Item = { x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, top, i, d: 0, draw: drawStruct };
  switch (s.kind) {
    case 'tank': it.draw = drawFuelTank; break;
    case 'stack': it.draw = drawStack; it.top = top + 20; break;
    case 'watertower': it.draw = drawWaterTower; break;
    case 'mast': case 'antenna': it.draw = drawMast; break;
    case 'flagpole': it.draw = drawFlagpole; break;
    case 'radar': it.draw = drawRadar; it.top = 52; break;
    case 'quonset': it.draw = drawQuonset; break;
    case 'command': it.draw = drawCommand; it.top = 92; break;
    case 'plant': it.draw = drawPlant; it.top = 52; break;
    case 'mess': it.draw = drawMess; break;
    default: break;
  }
  return it;
}

function buildScene(): Item[] {
  const out: Item[] = [];
  out.push({ x0: -HANGAR.w / 2 - 4, y0: -HANGAR.d / 2 - 4, x1: HANGAR.w / 2 + 4, y1: HANGAR.d / 2 + 4, top: HANGAR_APEX, i: 0, d: 0, draw: drawHangar });
  STRUCTS.forEach((s, i) => out.push(structItem(s, i)));
  FRONT_STRUCTS.forEach((s, i) => out.push({ x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, top: visualHeight(s), i, d: 0, draw: drawFront }));
  // The wall, in lengths between the towers (so each tower stands clear in front of its stretch).
  const C = COMPOUND;
  const cuts = (a: number, b: number, at: number[]): [number, number][] => {
    const pts = [a, ...at.filter((v) => v > a && v < b).sort((u, v) => u - v), b];
    const out2: [number, number][] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const s0 = pts[k], s1 = pts[k + 1];
      const n = Math.max(1, Math.round((s1 - s0) / 36));
      for (let j = 0; j < n; j++) out2.push([s0 + ((s1 - s0) * j) / n, s0 + ((s1 - s0) * (j + 1)) / n]);
    }
    return out2;
  };
  const tx = (y: number): number[] => TOWERS.filter((t) => Math.abs(t.y - y) < 1).flatMap((t) => [t.x - t.half, t.x + t.half]);
  const ty = (x: number): number[] => TOWERS.filter((t) => Math.abs(t.x - x) < 1).flatMap((t) => [t.y - t.half, t.y + t.half]);
  const inTower = (x: number, y: number): boolean => TOWERS.some((t) => Math.abs(t.x - x) < t.half && Math.abs(t.y - y) < t.half);
  const w = C.wall, hw = w / 2;
  const north = C.y0 + hw, south = C.y1 - hw, west = C.x0 + hw, east = C.x1 - hw;
  for (const [a, b] of cuts(C.x0, C.x1, tx(north))) if (!inTower((a + b) / 2, north)) out.push(wallItem(a, C.y0, b, C.y0 + w, 'n'));
  for (const [a, b] of cuts(C.x0, -C.gateHalf, tx(south))) if (!inTower((a + b) / 2, south)) out.push(wallItem(a, C.y1 - w, b, C.y1, 's'));
  for (const [a, b] of cuts(C.gateHalf, C.x1, tx(south))) if (!inTower((a + b) / 2, south)) out.push(wallItem(a, C.y1 - w, b, C.y1, 's'));
  for (const [a, b] of cuts(C.y0 + w, C.y1 - w, ty(west))) if (!inTower(west, (a + b) / 2)) out.push(wallItem(C.x0, a, C.x0 + w, b, 'w'));
  for (const [a, b] of cuts(C.y0 + w, C.y1 - w, ty(east))) if (!inTower(east, (a + b) / 2)) out.push(wallItem(C.x1 - w, a, C.x1, b, 'e'));
  TOWERS.forEach((t, i) => out.push({ x0: t.x - t.half, y0: t.y - t.half, x1: t.x + t.half, y1: t.y + t.half, top: t.gate ? GATE_TOWER_H + 6 : TOWER_H.peak, i, d: 0, draw: t.gate ? drawGateTower : drawTower }));
  // The gate's doors and the bridge over them.
  out.push({ x0: -C.gateHalf, y0: C.y1 - w, x1: C.gateHalf, y1: C.y1, top: 54, i: 0, d: 0, draw: drawGate });
  // Chain-link fences round the fuel farm, the gunship pads, the magazines and the power yard (gaps for the gates).
  FENCES.forEach(([x0, y0, x1, y1], i) => {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / 30));
    for (let k = 0; k < n; k++) {
      const a = k / n, b = (k + 1) / n;
      const fx0 = x0 + (x1 - x0) * a, fy0 = y0 + (y1 - y0) * a, fx1 = x0 + (x1 - x0) * b, fy1 = y0 + (y1 - y0) * b;
      out.push({ x0: Math.min(fx0, fx1), y0: Math.min(fy0, fy1), x1: Math.max(fx0, fx1) + 0.01, y1: Math.max(fy0, fy1) + 0.01, top: 4, i, d: 0, draw: drawFence });
    }
  });
  // The pines.
  PINES.forEach((t, i) => out.push({ x0: t.x - t.r, y0: t.y - t.r, x1: t.x + t.r, y1: t.y + t.r, top: t.h, i, d: 0, draw: drawPine }));
  return out;
}

/** Fence runs (metres from the Hangar), each a straight line with its gate gaps left out. */
const FENCES: [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [];
  const box = (x0: number, y0: number, x1: number, y1: number, gap: 'n' | 's' | 'e' | 'w', g0: number, g1: number): void => {
    const run = (ax: number, ay: number, bx: number, by: number, side: 'n' | 's' | 'e' | 'w'): void => {
      if (side !== gap) {
        out.push([ax, ay, bx, by]);
        return;
      }
      if (ay === by) {
        out.push([ax, ay, g0, by], [g1, ay, bx, by]);
      } else {
        out.push([ax, ay, bx, g0], [ax, g1, bx, by]);
      }
    };
    run(x0, y0, x1, y0, 'n');
    run(x0, y1, x1, y1, 's');
    run(x0, y0, x0, y1, 'w');
    run(x1, y0, x1, y1, 'e');
  };
  box(388, -424, 528, -372, 's', 446, 476);
  box(568, 196, 726, 360, 'w', 258, 300);
  box(388, 512, 568, 604, 'n', 466, 490);
  box(-344, -424, -48, -296, 's', -150, -116);
  return out;
})();

function drawFence(p: P3, _g: Game, it: Item): void {
  const c = p.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const horiz = it.x1 - it.x0 > it.y1 - it.y0;
  const ax = it.x0, ay = it.y0, bx = horiz ? it.x1 : it.x0, by = horiz ? it.y0 : it.y1;
  const H = 3.6;
  // The mesh, seen through.
  c.fillStyle = 'rgba(170,180,176,0.16)';
  c.beginPath();
  c.moveTo(PX(p, ax, 0), PY(p, ay, 0));
  c.lineTo(PX(p, bx, 0), PY(p, by, 0));
  c.lineTo(PX(p, bx, H), PY(p, by, H));
  c.lineTo(PX(p, ax, H), PY(p, ay, H));
  c.closePath();
  c.fill();
  // Posts and the top rail with its wire.
  c.strokeStyle = 'rgba(60,66,70,0.9)';
  c.lineWidth = 1;
  c.beginPath();
  const len = Math.hypot(bx - ax, by - ay);
  for (let t = 0; t <= len + 0.01; t += 5) {
    const x = ax + ((bx - ax) * t) / Math.max(1, len), y = ay + ((by - ay) * t) / Math.max(1, len);
    seg3(p, x, y, 0, x, y, H);
  }
  seg3(p, ax, ay, H, bx, by, H);
  c.stroke();
  c.strokeStyle = 'rgba(200,204,206,0.5)';
  c.beginPath();
  seg3(p, ax, ay, H + 0.6, bx, by, H + 0.6);
  c.stroke();
}

function wallItem(x0: number, y0: number, x1: number, y1: number, side: 'n' | 's' | 'e' | 'w'): Item {
  // Which way is out: that face is the outer wall, the opposite one the inner.
  return { x0, y0, x1, y1, top: WALL_H, i: ['n', 's', 'e', 'w'].indexOf(side), d: 0, draw: drawWall };
}

function screenBox(p: P3, it: Item): boolean {
  const zs = [0, it.top];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const z of zs) {
    const a = PX(p, it.x0, z), b = PX(p, it.x1, z), c = PY(p, it.y0, z), d = PY(p, it.y1, z);
    x0 = Math.min(x0, a, b);
    x1 = Math.max(x1, a, b);
    y0 = Math.min(y0, c, d);
    y1 = Math.max(y1, c, d);
  }
  return x1 >= -4 && y1 >= -4 && x0 <= p.w + 4 && y0 <= p.h + 4;
}

/** Fades a building that stands over your ship on the screen, so you never lose her behind it. */
function overShip(p: P3, it: Item): boolean {
  if (p.sr <= 0) return false;
  const z = it.top;
  const xa = Math.min(PX(p, it.x0, 0), PX(p, it.x0, z)), xb = Math.max(PX(p, it.x1, 0), PX(p, it.x1, z));
  const ya = Math.min(PY(p, it.y0, 0), PY(p, it.y0, z)), yb = Math.max(PY(p, it.y1, 0), PY(p, it.y1, z));
  return p.sx > xa - p.sr * 0.3 && p.sx < xb + p.sr * 0.3 && p.sy > ya - p.sr * 0.3 && p.sy < yb + p.sr * 0.3 && it.top > 6;
}

let crushed: Set<number> = new Set();
let hangarRoof = 1;
let lastT = 0;

/** Everything that stands up, far to near. */
export function drawBase3D(p: P3, g: Game, hx: number, hy: number): void {
  if (!scene) scene = buildScene();
  budget = 6;
  // Pines a hull has rolled over are down.
  for (const t of [g.player, ...g.compound.bases.map((b) => b.tank)]) {
    const r = Math.max(t.stats.length, t.stats.width) / 2;
    const lx = t.x - hx, ly = t.y - hy;
    if (lx < COMPOUND.x0 - 260 || lx > COMPOUND.x1 + 260 || ly < COMPOUND.y0 - 220 || ly > COMPOUND.y1 + 140) continue;
    if (lx > COMPOUND.x0 + 10 && lx < COMPOUND.x1 - 10 && ly > COMPOUND.y0 + 10 && ly < COMPOUND.y1 + 10) continue;
    PINES.forEach((pn, i) => {
      if (!crushed.has(i) && Math.abs(pn.x - lx) < r && Math.abs(pn.y - ly) < r) {
        const a = -t.rot, dx = pn.x - lx, dy = pn.y - ly;
        const u = dx * Math.cos(a) - dy * Math.sin(a), v = dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(u) < t.stats.length / 2 && Math.abs(v) < t.stats.width / 2 + 2) crushed.add(i);
      }
    });
  }
  // The Hangar's roof lifts away while your ship is under it.
  const pl = g.player;
  const inside = Math.abs(pl.x - hx) < HANGAR.w / 2 + 6 && Math.abs(pl.y - hy) < HANGAR.d / 2 + 30;
  const dt = Math.max(0, Math.min(0.1, p.time - lastT));
  lastT = p.time;
  hangarRoof += ((inside ? 0 : 1) - hangarRoof) * Math.min(1, dt * 3);
  if (Math.abs(hangarRoof - (inside ? 0 : 1)) < 0.01) hangarRoof = inside ? 0 : 1;
  const list: Item[] = [];
  for (const it of scene) {
    if (it.draw === drawPine && crushed.has(it.i)) continue;
    if (!screenBox(p, it)) continue;
    const dx = Math.max(it.x0 - p.camX, 0, p.camX - it.x1), dy = Math.max(it.y0 - p.camY, 0, p.camY - it.y1);
    it.d = Math.hypot(dx, dy) - it.top * 0.002;
    list.push(it);
  }
  list.sort((a, b) => b.d - a.d);
  const c = p.c;
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = p.ppm < ART_PX * 0.75;
  for (const it of list) {
    const fade = it.draw !== drawHangar && it.draw !== drawPine && overShip(p, it);
    if (fade) c.globalAlpha = 0.38;
    it.draw(p, g, it);
    if (fade) c.globalAlpha = 1;
  }
  c.imageSmoothingEnabled = smooth;
  c.setTransform(1, 0, 0, 1, 0, 0);
}

/** A building's sprite roof (or, while it waits to be painted, its colour). */
function spriteRoof(p: P3, s: Struct, i: number, z: number, front = false): void {
  const have = front || hasStructSprite(i);
  if (!have && budget-- <= 0) {
    flatTop(p, s.x0, s.y0, s.x1, s.y1, z, '#6e6c66');
    return;
  }
  const sp = front ? frontSprite(i) : structSprite(i);
  atZ(p, z);
  const w = (s.x1 - s.x0) * ART_PX, d = (s.y1 - s.y0) * ART_PX;
  p.c.drawImage(sp.c, 0, 0, w, d, s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
}

function drawStruct(p: P3, _g: Game, it: Item): void {
  const s = STRUCTS[it.i];
  const st = KIND_STYLE[s.kind] ?? 'plain';
  boxFaces(p, s.x0, s.y0, s.x1, s.y1, 0, it.top, allSides(st), it.i * 7, SIGN[s.kind] ?? null);
  spriteRoof(p, s, it.i, it.top);
  outline(p, s.x0, s.y0, s.x1, s.y1, it.top);
  for (const b of roofPlant(it.i)) {
    if (b.r) drum(p, b.x0, b.y0, () => b.r, it.top, it.top + b.h, b.col, (pp, rt) => {
      atZ(pp, it.top + b.h);
      pp.c.fillStyle = shade(b.col, 0.25);
      pp.c.beginPath();
      pp.c.arc(b.x0, b.y0, rt, 0, Math.PI * 2);
      pp.c.fill();
    });
    else miniBox(p, b.x0, b.y0, b.x1, b.y1, it.top, it.top + b.h, b.col);
  }
}

interface Plant {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  h: number;
  col: string;
  /** A tank (drum) of this radius instead of a box. */
  r: number;
}

const plantCache: Plant[][] = [];
const PLANT_KINDS = new Set<StructKind>(['barracks', 'workshop', 'bar', 'clinic', 'warehouse', 'garage', 'armory', 'depot', 'store', 'mess', 'plant', 'gatehouse']);

/** What stands on a building's roof: a stair housing, air handlers, a water tank, the odd vent stack. */
function roofPlant(i: number): Plant[] {
  if (plantCache[i]) return plantCache[i];
  const s = STRUCTS[i];
  const out: Plant[] = [];
  if (PLANT_KINDS.has(s.kind)) {
    const w = s.x1 - s.x0, d = s.y1 - s.y0;
    const n = Math.max(1, Math.min(4, Math.floor((w * d) / 2600)));
    const taken: [number, number, number, number][] = [];
    for (let k = 0; k < n * 3 && out.length < n; k++) {
      const t = hash2(i, k, 811);
      const kind = k === 0 ? 'stair' : t < 0.45 ? 'ac' : t < 0.7 ? 'tank' : 'ac';
      const bw = kind === 'stair' ? 9 : kind === 'ac' ? 7 + hash2(i, k, 812) * 5 : 6, bd = kind === 'stair' ? 7 : kind === 'ac' ? 5 : 6;
      if (bw > w - 8 || bd > d - 8) continue;
      const x0 = s.x0 + 4 + hash2(i, k, 813) * (w - bw - 8), y0 = s.y0 + 4 + hash2(i, k, 814) * (d - bd - 8);
      if (taken.some(([a, b, c2, d2]) => x0 < c2 + 3 && x0 + bw > a - 3 && y0 < d2 + 3 && y0 + bd > b - 3)) continue;
      taken.push([x0, y0, x0 + bw, y0 + bd]);
      if (kind === 'tank') out.push({ x0: x0 + 3, y0: y0 + 3, x1: 0, y1: 0, h: 5, col: '#8e969c', r: 3 });
      else out.push({ x0, y0, x1: x0 + bw, y1: y0 + bd, h: kind === 'stair' ? 4.5 : 2.6, col: kind === 'stair' ? '#6e706a' : '#8a9096', r: 0 });
    }
  }
  plantCache[i] = out;
  return out;
}

/** A small box in flat colours (rooftop plant, crates): its sides toward the eye, its top, an edge round it. */
function miniBox(p: P3, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, col: string): void {
  const c = p.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const quad = (pts: [number, number, number][], k: number): void => {
    c.fillStyle = shade(col, k);
    c.beginPath();
    pts.forEach(([x, y, z], j) => (j ? c.lineTo(PX(p, x, z), PY(p, y, z)) : c.moveTo(PX(p, x, z), PY(p, y, z))));
    c.closePath();
    c.fill();
  };
  if (p.camX > x1) quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], -0.35);
  else if (p.camX < x0) quad([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], -0.05);
  if (p.camY > y1) quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], -0.18);
  else if (p.camY < y0) quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], -0.25);
  quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0.12);
  c.strokeStyle = 'rgba(10,12,14,0.5)';
  c.lineWidth = 1;
  c.stroke();
  // A grille on its top.
  atZ(p, z1);
  c.fillStyle = shade(col, -0.25);
  const w = x1 - x0;
  for (let x = x0 + 1; x < x1 - 1; x += Math.max(1.2, w / 5)) c.fillRect(x, y0 + 1, 0.5, y1 - y0 - 2);
}

function drawFront(p: P3, g: Game, it: Item): void {
  const s = FRONT_STRUCTS[it.i];
  const h = g.gen.hangar;
  // Flattened by a Titan: gone.
  if (h && (s.kind === 'sandbag' || s.kind === 'hedgehog') && !g.map.getObs(Math.floor(h.x + (s.x0 + s.x1) / 2), Math.floor(h.y + (s.y0 + s.y1) / 2))) return;
  if (s.kind === 'hedgehog') {
    spriteRoof(p, s, it.i, 1.2, true);
    return;
  }
  if (s.kind === 'searchlight') {
    const x = (s.x0 + s.x1) / 2, y = (s.y0 + s.y1) / 2;
    pole(p, x - 1, y, 0, it.top, '#2a2c30', 0.9);
    pole(p, x + 1, y, 0, it.top, '#3a3d42', 0.9);
    atZ(p, it.top);
    p.c.fillStyle = '#2a2c30';
    p.c.fillRect(x - 2.5, y - 2, 5, 4);
    p.c.fillStyle = g.compound.alarm ? '#fffbe0' : '#8a8e94';
    p.c.fillRect(x - 1.5, y + 0.5, 3, 1.5);
    return;
  }
  boxFaces(p, s.x0, s.y0, s.x1, s.y1, 0, it.top, allSides(KIND_STYLE[s.kind] ?? 'bunker'), it.i * 5, null);
  spriteRoof(p, s, it.i, it.top, true);
  if (s.kind === 'bunker') {
    // Its twin gun on the roof, turned to its target.
    const gi = FRONT_GUNS.findIndex((gn) => gn.kind === 'bunker' && Math.abs(gn.x - (s.x0 + s.x1) / 2) < 1 && Math.abs(gn.y - (s.y0 + s.y1) / 2) < 1);
    const st = g.compound.front[gi];
    const gn = FRONT_GUNS[gi];
    if (gn) turret(p, gn.x, gn.y, it.top, st?.aim ?? Math.PI / 2, st?.flash ?? 0, 3, true);
  }
}

/** A gun turret at (x, y) on a roof z up: a ring, a turret, one or two barrels, the flash. */
function turret(p: P3, x: number, y: number, z: number, aim: number, flash: number, r: number, twin: boolean): void {
  atZ(p, z);
  const c = p.c;
  c.fillStyle = '#1a1c20';
  c.beginPath();
  c.arc(x, y, r + 0.8, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#56603e';
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#6e7a50';
  c.beginPath();
  c.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, Math.PI * 2);
  c.fill();
  const ca = Math.cos(aim), sa = Math.sin(aim);
  const k = p.ppm * sOf(p, z);
  c.setTransform(k * ca, k * sa, -k * sa, k * ca, PX(p, x, z), PY(p, y, z));
  c.fillStyle = '#22252b';
  if (twin) {
    c.fillRect(r * 0.4, -1.3, r + 5, 0.9);
    c.fillRect(r * 0.4, 0.4, r + 5, 0.9);
  } else c.fillRect(r * 0.4, -0.6, r + 6, 1.2);
  if (flash > 0) {
    c.fillStyle = 'rgba(255,200,80,0.55)';
    c.beginPath();
    c.arc(r + 6.5, 0, 2.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff2a0';
    c.fillRect(r + 5.4, -1.4, 2.2, 2.8);
  }
}

// ---------------------------------------------------------------------------------------------- the Hangar

function drawHangar(p: P3, g: Game): void {
  const W = HANGAR.w / 2, D = HANGAR.d / 2, T = 8, door = HANGAR.door / 2;
  const E = HANGAR_EAVE, A = HANGAR_APEX;
  const c = p.c;
  // Its walls as lengths (inner faces painted as the inside of a hall), far ones first.
  const parts: { x0: number; y0: number; x1: number; y1: number; z0: number; z1: number; f: BoxFaces }[] = [];
  const out = 'hangar', inn = 'hangarIn';
  const runX = (a: number, b: number, y0: number, y1: number, f: BoxFaces, z0 = 0, z1 = E): void => {
    const n = Math.max(1, Math.round((b - a) / 50));
    for (let k = 0; k < n; k++) parts.push({ x0: a + ((b - a) * k) / n, x1: a + ((b - a) * (k + 1)) / n, y0, y1, z0, z1, f });
  };
  const runY = (a: number, b: number, x0: number, x1: number, f: BoxFaces): void => {
    const n = Math.max(1, Math.round((b - a) / 50));
    for (let k = 0; k < n; k++) parts.push({ x0, x1, y0: a + ((b - a) * k) / n, y1: a + ((b - a) * (k + 1)) / n, z0: 0, z1: E, f });
  };
  runX(-W - T / 2, W + T / 2, -D - T / 2, -D + T / 2, { n: out, s: inn, e: out, w: out });
  runY(-D + T / 2, D - T / 2, -W - T / 2, -W + T / 2, { n: out, s: out, e: inn, w: out });
  runY(-D + T / 2, D - T / 2, W - T / 2, W + T / 2, { n: out, s: out, e: out, w: inn });
  // The front wall comes down to a stub while you're inside, so nothing stands between you and her.
  const front = E - (E - 10) * (1 - hangarRoof);
  runX(-W - T / 2, -door, D - T / 2, D + T / 2, { n: inn, s: out, e: 'door', w: out }, 0, front);
  runX(door, W + T / 2, D - T / 2, D + T / 2, { n: inn, s: out, e: out, w: 'door' }, 0, front);
  // The beam over the door.
  if (hangarRoof > 0.5) runX(-door, door, D - T / 2, D + T / 2, { n: inn, s: 'door', e: 'door', w: 'door' }, E - 9, E);
  parts.sort((a, b) => dist(p, b) - dist(p, a));
  for (const q of parts) {
    boxFaces(p, q.x0, q.y0, q.x1, q.y1, q.z0, q.z1, q.f, 41, null, false);
    if (hangarRoof < 1) flatTop(p, q.x0, q.y0, q.x1, q.y1, q.z1, '#6a7468');
  }
  // Under the roof: the gantry cranes riding their bays.
  if (hangarRoof < 0.999) {
    c.globalAlpha = 1 - hangarRoof;
    cranes(p);
    c.globalAlpha = 1;
  }
  if (hangarRoof <= 0.001) return;
  c.globalAlpha = hangarRoof;
  // The vault: a green barrel roof from the west eave over to the east, its ends arched.
  const half = W + T / 2;
  const zAt = (x: number): number => E + (A - E) * Math.sqrt(Math.max(0, 1 - (x / half) ** 2));
  const arch = (z: number): number => (z <= E ? half : half * Math.sqrt(Math.max(0, 1 - ((z - E) / (A - E)) ** 2)));
  if (p.camY > D + T / 2) faceNS(p, D + T / 2, -half, half, E, A, faceTex('gable', half * 2, A - E, 3, ['MEGA HANGAR', '#e8e4d0', '#2e3a2a'], false), '#566152', SIDE_DARK.s, arch);
  else if (p.camY < -D - T / 2) faceNS(p, -D - T / 2, -half, half, E, A, faceTex('gable', half * 2, A - E, 4, null, false), '#566152', SIDE_DARK.n, arch);
  const n = 44;
  const cols: { a: number; b: number; za: number; zb: number; k: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = -half + (2 * half * i) / n, b = -half + (2 * half * (i + 1)) / n;
    const za = zAt(a), zb = zAt(b);
    // Lit on the west (sun) slope, darker east.
    const slope = (zb - za) / (b - a);
    cols.push({ a, b, za, zb, k: Math.max(-0.42, Math.min(0.3, slope * 0.9 - 0.04)) });
  }
  cols.sort((u, v) => Math.abs((v.a + v.b) / 2 - p.camX) - Math.abs((u.a + u.b) / 2 - p.camX));
  c.setTransform(1, 0, 0, 1, 0, 0);
  const y0 = -D - T / 2, y1 = D + T / 2;
  for (const q of cols) {
    c.fillStyle = shade('#4f6b3a', q.k);
    c.beginPath();
    c.moveTo(PX(p, q.a, q.za), PY(p, y0, q.za));
    c.lineTo(PX(p, q.b, q.zb), PY(p, y0, q.zb));
    c.lineTo(PX(p, q.b, q.zb), PY(p, y1, q.zb));
    c.lineTo(PX(p, q.a, q.za), PY(p, y1, q.za));
    c.closePath();
    c.fill();
  }
  // Seams down the slope, arched ribs across it, a row of skylights along the ridge, the ridge vent.
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(20,30,16,0.35)';
  c.beginPath();
  for (let i = 0; i <= n; i += 2) {
    const x = -half + (2 * half * i) / n, z = zAt(x);
    seg3(p, x, y0, z, x, y1, z);
  }
  c.stroke();
  c.strokeStyle = 'rgba(20,28,16,0.6)';
  c.beginPath();
  for (let y = y0 + 6; y < y1; y += 35) {
    for (let i = 0; i <= n; i++) {
      const x = -half + (2 * half * i) / n, z = zAt(x);
      if (i === 0) c.moveTo(PX(p, x, z), PY(p, y, z));
      else c.lineTo(PX(p, x, z), PY(p, y, z));
    }
  }
  c.stroke();
  c.strokeStyle = 'rgba(170,200,140,0.35)';
  c.beginPath();
  for (let y = y0 + 7; y < y1; y += 35) {
    for (let i = 0; i <= n; i++) {
      const x = -half + (2 * half * i) / n, z = zAt(x) + 0.2;
      if (i === 0) c.moveTo(PX(p, x, z), PY(p, y + 1, z));
      else c.lineTo(PX(p, x, z), PY(p, y + 1, z));
    }
  }
  c.stroke();
  atZ(p, A);
  for (const sx of [-60, 40]) {
    for (let y = y0 + 20; y < y1 - 20; y += 35) {
      c.fillStyle = 'rgba(150,200,220,0.55)';
      c.fillRect(sx, y + 4, 20, 22);
      c.fillStyle = 'rgba(230,250,255,0.35)';
      c.fillRect(sx, y + 4, 20, 3);
    }
  }
  c.fillStyle = '#3a4a2c';
  c.fillRect(-6, y0, 12, y1 - y0);
  c.fillStyle = '#5a7046';
  c.fillRect(-6, y0, 12, 2);
  // Aircraft warning lamps along the ridge.
  const blink = Math.floor(p.time * 1.2) % 2 === 0;
  for (let y = y0 + 8; y < y1; y += 70) {
    c.fillStyle = blink ? '#ff3020' : '#5a1810';
    c.fillRect(-1.5, y, 3, 3);
  }
  c.globalAlpha = 1;
  void g;
}

function dist(p: P3, q: { x0: number; y0: number; x1: number; y1: number }): number {
  const dx = Math.max(q.x0 - p.camX, 0, p.camX - q.x1), dy = Math.max(q.y0 - p.camY, 0, p.camY - q.y1);
  return Math.hypot(dx, dy);
}

/** The gantry cranes in each bay, up under the roof. */
function cranes(p: P3): void {
  const D = HANGAR.d / 2, t = p.time, z = HANGAR_EAVE - 10, c = p.c;
  [-HANGAR.w * 0.3, 0, HANGAR.w * 0.3].forEach((bx, i) => {
    const y = -20 + 140 * Math.sin(t * 0.04 + i * 2.1);
    const tx = bx + 62 * Math.sin(t * 0.07 + i * 1.3);
    const yy = Math.max(-D + 40, Math.min(D - 70, y));
    atZ(p, z);
    c.fillStyle = '#d89a1c';
    c.fillRect(bx - 104, yy - 3, 208, 6);
    c.fillStyle = '#f0c040';
    c.fillRect(bx - 104, yy - 3, 208, 1.2);
    c.fillStyle = '#141414';
    for (let k = 0; k < 6; k++) {
      c.fillRect(bx - 104 + k * 3, yy - 3, 1.5, 6);
      c.fillRect(bx + 104 - k * 3 - 1.5, yy - 3, 1.5, 6);
    }
    c.fillStyle = '#44484e';
    c.fillRect(tx - 6, yy - 5, 12, 10);
    c.fillStyle = '#6a6f76';
    c.fillRect(tx - 6, yy - 5, 12, 1.4);
    // The hook hanging down from the trolley.
    pole(p, tx, yy, 18, z, 'rgba(30,30,30,0.8)', 0.3);
    atZ(p, 18);
    c.fillStyle = '#e0a020';
    c.fillRect(tx - 1.5, yy - 1.5, 3, 3);
  });
}

// ---------------------------------------------------------------------------------------------- the wall

function drawWall(p: P3, _g: Game, it: Item): void {
  const side = (['n', 's', 'e', 'w'] as const)[it.i];
  const f: BoxFaces = { n: 'wallIn', s: 'wallIn', e: 'wallIn', w: 'wallIn' };
  f[side] = 'wallOut';
  boxFaces(p, it.x0, it.y0, it.x1, it.y1, 0, WALL_H, f, 17, null, false);
  // The top: a walkway along the inside, a parapet with merlons along the outside, lamps.
  atZ(p, WALL_H);
  const c = p.c;
  c.fillStyle = '#7c7f86';
  c.fillRect(it.x0, it.y0, it.x1 - it.x0, it.y1 - it.y0);
  const along = it.x1 - it.x0 > it.y1 - it.y0;
  c.fillStyle = '#8c8f96';
  if (along) c.fillRect(it.x0, side === 'n' ? it.y0 + 3 : it.y0, it.x1 - it.x0, it.y1 - it.y0 - 3);
  else c.fillRect(side === 'w' ? it.x0 + 3 : it.x0, it.y0, it.x1 - it.x0 - 3, it.y1 - it.y0);
  c.fillStyle = '#5e6168';
  if (along) {
    const y = side === 'n' ? it.y0 : it.y1 - 2.5;
    for (let x = Math.ceil(it.x0 / 4) * 4; x < it.x1 - 1; x += 4) c.fillRect(x, y, 2.4, 2.5);
    c.fillStyle = '#ffd060';
    for (let x = Math.ceil(it.x0 / 30) * 30; x < it.x1; x += 30) c.fillRect(x, (it.y0 + it.y1) / 2, 1, 1);
  } else {
    const x = side === 'w' ? it.x0 : it.x1 - 2.5;
    for (let y = Math.ceil(it.y0 / 4) * 4; y < it.y1 - 1; y += 4) c.fillRect(x, y, 2.5, 2.4);
    c.fillStyle = '#ffd060';
    for (let y = Math.ceil(it.y0 / 30) * 30; y < it.y1; y += 30) c.fillRect((it.x0 + it.x1) / 2, y, 1, 1);
  }
}

/** A watchtower: a plinth as tall as the wall, a slim dark shaft, a gallery, a glazed cabin with its gun, a peaked roof. */
function drawTower(p: P3, g: Game, it: Item): void {
  const t: Tower = TOWERS[it.i];
  const x = t.x, y = t.y, hf = t.half;
  const { shaft, cabin, peak } = TOWER_H;
  boxFaces(p, x - hf, y - hf, x + hf, y + hf, 0, WALL_H, allSides('plinth'), 23, null);
  flatTop(p, x - hf, y - hf, x + hf, y + hf, WALL_H, '#70737a');
  boxFaces(p, x - 4.5, y - 4.5, x + 4.5, y + 4.5, WALL_H, shaft, allSides('shaft'), 29, null);
  // The gallery round the cabin, its rail, a searchlight on its corner.
  flatTop(p, x - 11, y - 11, x + 11, y + 11, shaft, '#3e4440');
  outline(p, x - 11, y - 11, x + 11, y + 11, shaft);
  boxFaces(p, x - 8.5, y - 8.5, x + 8.5, y + 8.5, shaft, cabin, allSides('cabin'), 31, null);
  const st = g.compound.towers[it.i];
  if (st) {
    // The gun pokes out of the cabin toward its target.
    const z = shaft + 4, k = p.ppm * sOf(p, z), ca = Math.cos(st.aim), sa = Math.sin(st.aim);
    p.c.setTransform(k * ca, k * sa, -k * sa, k * ca, PX(p, x, z), PY(p, y, z));
    p.c.fillStyle = '#16181c';
    p.c.fillRect(4, -1.1, 13, 2.2);
    p.c.fillStyle = '#3e4248';
    p.c.fillRect(4, -1.1, 13, 0.7);
    if (st.flash > 0) {
      p.c.fillStyle = 'rgba(255,200,80,0.6)';
      p.c.beginPath();
      p.c.arc(18.5, 0, 3.2, 0, Math.PI * 2);
      p.c.fill();
      p.c.fillStyle = '#fff2a0';
      p.c.fillRect(17, -1.6, 2.6, 3.2);
    }
  }
  pyramid(p, x, y, 12.5, cabin, peak, '#5a6644');
  // The eave's dark edge, a red lamp on the peak.
  outline(p, x - 12.5, y - 12.5, x + 12.5, y + 12.5, cabin);
  if (Math.floor(p.time * 1.4 + it.i) % 2 === 0) {
    atZ(p, peak);
    p.c.fillStyle = 'rgba(255,40,30,0.4)';
    p.c.beginPath();
    p.c.arc(x, y, 2.6, 0, Math.PI * 2);
    p.c.fill();
    p.c.fillStyle = '#ff3020';
    p.c.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
  }
}

function drawGateTower(p: P3, g: Game, it: Item): void {
  const t: Tower = TOWERS[it.i];
  const x = t.x, y = t.y, hf = t.half, H = GATE_TOWER_H;
  boxFaces(p, x - hf, y - hf, x + hf, y + hf, 0, H, allSides('gatetower'), 37, null);
  flatTop(p, x - hf, y - hf, x + hf, y + hf, H, '#77736a');
  atZ(p, H);
  const c = p.c;
  c.fillStyle = '#5a574e';
  for (let k = -hf; k < hf; k += 4) {
    c.fillRect(x + k, y - hf, 2.4, 2);
    c.fillRect(x + k, y + hf - 2, 2.4, 2);
    c.fillRect(x - hf, y + k, 2, 2.4);
    c.fillRect(x + hf - 2, y + k, 2, 2.4);
  }
  const st = g.compound.towers[it.i];
  turret(p, x, y, H, st?.aim ?? Math.PI / 2, st?.flash ?? 0, 4.5, true);
  // The gate lamp: red shut, amber moving, green open.
  const cs = g.compound;
  const moving = cs.gate.open > 0.02 && cs.gate.open < 0.98;
  const lamp = moving ? (Math.floor(p.time * 4) % 2 ? '#ffb020' : '#5a3a08') : cs.gate.open >= 0.98 ? '#40ff60' : '#ff3020';
  atZ(p, H + 2);
  c.fillStyle = '#101010';
  c.fillRect(x - 2.5, y + hf - 6, 5, 5);
  c.fillStyle = lamp;
  c.fillRect(x - 1.8, y + hf - 5.3, 3.6, 3.6);
}

/** The gate: two great doors sliding back into the wall, and the bridge between the gate towers above them. */
function drawGate(p: P3, g: Game): void {
  const cs = g.compound;
  const f = cs.gate.open;
  const C = COMPOUND;
  const y0 = C.y1 - C.wall, y1 = C.y1, half = C.gateHalf;
  for (const s of [-1, 1]) {
    const inner = half * f;
    if (half - inner < 0.5) continue;
    const xa = s < 0 ? GATE.x - half : GATE.x + inner, xb = s < 0 ? GATE.x - inner : GATE.x + half;
    if (cs.gate.breach > 0) {
      // Wrecked, slumped in the slot.
      boxFaces(p, xa, y0 + 1, xb, y1 - 1, 0, 9, allSides('door'), 43, null);
      flatTop(p, xa, y0 + 1, xb, y1 - 1, 9, '#3e424a');
      continue;
    }
    boxFaces(p, xa, y0 + 1, xb, y1 - 1, 0, 26, allSides('door'), 43, null);
    flatTop(p, xa, y0 + 1, xb, y1 - 1, 26, '#5c616b');
    atZ(p, 26);
    const ex = s < 0 ? xb - 4 : xa;
    for (let k = 0; k < 6; k++) {
      p.c.fillStyle = k % 2 ? '#141414' : '#f0b020';
      p.c.fillRect(ex, y0 + 1 + k, 4, 1);
    }
  }
  // The bridge.
  boxFaces(p, -half, y0 - 2, half, y1 + 2, 40, 54, { n: 'bridge', s: 'bridge', e: 'bridge', w: 'bridge' }, 47, ['MAIN GATE', '#ffd040', '#2a2c2e']);
  flatTop(p, -half, y0 - 2, half, y1 + 2, 54, '#6e7078');
  atZ(p, 54);
  p.c.fillStyle = '#5a5c62';
  for (let x = -half; x < half; x += 5) {
    p.c.fillRect(x, y0 - 2, 2.6, 1.6);
    p.c.fillRect(x, y1 + 0.4, 2.6, 1.6);
  }
}

// ---------------------------------------------------------------------------------------------- particular buildings

function drawFuelTank(p: P3, _g: Game, it: Item): void {
  const s = STRUCTS[it.i];
  const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, r = Math.min(s.x1 - s.x0, s.y1 - s.y0) / 2 - 1;
  drum(p, cx, cy, () => r, 0, it.top, '#b8bcbe', (pp, rt) => {
    atZ(pp, it.top);
    const c = pp.c;
    c.fillStyle = '#c8ccce';
    c.beginPath();
    c.arc(cx, cy, rt, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#dfe2e4';
    c.beginPath();
    c.arc(cx - rt * 0.15, cy - rt * 0.15, rt * 0.7, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#7a7e82';
    c.lineWidth = 0.6;
    c.beginPath();
    c.arc(cx, cy, rt - 0.8, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#5a5e62';
    c.fillRect(cx - 1, cy - 1, 2, 2);
    c.fillStyle = '#c03a2a';
    c.fillRect(cx + rt * 0.3, cy + rt * 0.2, 3, 1.4);
  }, [it.top * 0.33, it.top * 0.66]);
}

function drawStack(p: P3, _g: Game, it: Item): void {
  const s = STRUCTS[it.i];
  const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, r0 = Math.min(s.x1 - s.x0, s.y1 - s.y0) / 2 - 1;
  const H = 84;
  // A cooling tower: wide at the foot, waisted, flaring a little at the lip.
  const r = (z: number): number => r0 * (1 - 0.32 * Math.sin(Math.min(1, z / (H * 0.8)) * Math.PI * 0.62) + Math.max(0, z / H - 0.8) * 0.3);
  drum(p, cx, cy, r, 0, H, '#a6a298', (pp, rt) => {
    atZ(pp, H);
    const c = pp.c;
    c.fillStyle = '#8a867c';
    c.beginPath();
    c.arc(cx, cy, rt, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#1e2022';
    c.beginPath();
    c.arc(cx, cy, rt - 1.6, 0, Math.PI * 2);
    c.fill();
  }, [3, 4]);
  // Steam rolling off the top.
  const c = p.c;
  for (let k = 0; k < 7; k++) {
    const ph = (p.time * 0.08 + k / 7 + it.i * 0.31) % 1;
    const z = H + ph * 40;
    atZ(p, z);
    c.fillStyle = `rgba(236,238,240,${(0.42 * (1 - ph)).toFixed(3)})`;
    c.beginPath();
    c.arc(cx + ph * 22, cy + ph * 10, r0 * (0.55 + ph * 0.8), 0, Math.PI * 2);
    c.fill();
  }
}

function drawWaterTower(p: P3, _g: Game, it: Item): void {
  const s = STRUCTS[it.i];
  const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, r = (s.x1 - s.x0) / 2 + 2;
  const legTop = it.top * 0.72;
  const c = p.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.strokeStyle = '#3b3f45';
  c.lineWidth = Math.max(1, 0.7 * p.ppm);
  c.beginPath();
  const lg = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [lx, ly] of lg) seg3(p, cx + lx * r * 0.9, cy + ly * r * 0.9, 0, cx + lx * r * 0.6, cy + ly * r * 0.6, legTop);
  // Cross-bracing.
  for (let z = 8; z < legTop; z += 12) {
    for (let k = 0; k < 4; k++) {
      const a = lg[k], b = lg[(k + 1) % 4];
      const f0 = 0.9 - (0.3 * z) / legTop, f1 = 0.9 - (0.3 * (z + 12)) / legTop;
      seg3(p, cx + a[0] * r * f0, cy + a[1] * r * f0, z, cx + b[0] * r * f1, cy + b[1] * r * f1, Math.min(legTop, z + 12));
    }
  }
  c.stroke();
  drum(p, cx, cy, () => r * 0.75, legTop, it.top, '#4a8aa0', (pp, rt) => {
    atZ(pp, it.top);
    pp.c.fillStyle = '#5a9ab0';
    pp.c.beginPath();
    pp.c.arc(cx, cy, rt, 0, Math.PI * 2);
    pp.c.fill();
    pp.c.fillStyle = '#7ab4c8';
    pp.c.beginPath();
    pp.c.arc(cx - rt * 0.2, cy - rt * 0.2, rt * 0.45, 0, Math.PI * 2);
    pp.c.fill();
    pyramid(pp, cx, cy, rt * 0.8, it.top, it.top + 4, '#3a6a7a');
  }, [legTop + 2]);
}

/** A guyed lattice mast, red and white, lamps up it, wires down to the ground. */
function drawMast(p: P3, _g: Game, it: Item): void {
  const s = STRUCTS[it.i];
  const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, H = it.top;
  const c = p.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  // Guy wires.
  c.strokeStyle = 'rgba(210,214,220,0.4)';
  c.lineWidth = 1;
  c.beginPath();
  for (const [ax, ay] of [[-1, -0.6], [1, -0.6], [0, 1.1]]) for (const f of [0.4, 0.75]) seg3(p, cx + ax * H * 0.38, cy + ay * H * 0.38, 0, cx, cy, H * f);
  c.stroke();
  // The legs, in bands of red and white.
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const bands = 10;
  for (let b = 0; b < bands; b++) {
    const za = (H * b) / bands, zb = (H * (b + 1)) / bands;
    const wa = 3 - (2.2 * b) / bands, wb = 3 - (2.2 * (b + 1)) / bands;
    c.strokeStyle = b % 2 ? '#e8e4dc' : '#c0342a';
    c.lineWidth = Math.max(1, 0.5 * p.ppm);
    c.beginPath();
    for (const [lx, ly] of legs) seg3(p, cx + lx * wa, cy + ly * wa, za, cx + lx * wb, cy + ly * wb, zb);
    // Bracing.
    seg3(p, cx - wa, cy - wa, za, cx + wb, cy + wb, zb);
    seg3(p, cx + wa, cy - wa, za, cx - wb, cy + wb, zb);
    c.stroke();
  }
  // Dishes and a beacon.
  atZ(p, H * 0.62);
  c.fillStyle = '#d8dce0';
  c.beginPath();
  c.arc(cx + 2.5, cy + 1, 2.4, 0, Math.PI * 2);
  c.fill();
  atZ(p, H);
  const on = Math.floor(p.time * 1.4 + it.i) % 2 === 0;
  c.fillStyle = on ? 'rgba(255,40,30,0.45)' : 'rgba(80,10,8,0.3)';
  c.beginPath();
  c.arc(cx, cy, on ? 4 : 1.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = on ? '#ff3020' : '#6a1810';
  c.fillRect(cx - 0.8, cy - 0.8, 1.6, 1.6);
}

function drawFlagpole(p: P3, _g: Game, it: Item): void {
  const s = STRUCTS[it.i];
  const px = (s.x0 + s.x1) / 2, py = (s.y0 + s.y1) / 2, H = it.top;
  pole(p, px, py, 0, H, '#d8d8d0', 0.4);
  const c = p.c, t = p.time;
  atZ(p, H - 1);
  for (let k = 0; k < 12; k++) {
    const wv = Math.sin(t * 5 - k * 0.7) * 0.8;
    c.fillStyle = k < 4 ? '#2a4a8a' : '#b02020';
    c.fillRect(px + k, py + wv, 1.05, 4);
    if (k >= 4 && k % 2 === 0) {
      c.fillStyle = '#f0f0f0';
      c.fillRect(px + k, py + wv + 1.3, 1.05, 1.2);
    }
  }
}

function drawRadar(p: P3, _g: Game, it: Item): void {
  const s = STRUCTS[it.i];
  const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2, hb = 14, R0 = Math.min(s.x1 - s.x0, s.y1 - s.y0) / 2 - 3;
  boxFaces(p, s.x0, s.y0, s.x1, s.y1, 0, hb, allSides('radar'), 53, SIGN.radar ?? null);
  flatTop(p, s.x0, s.y0, s.x1, s.y1, hb, '#8a8c88');
  // The radome: a white sphere on the roof.
  drum(p, cx, cy, (z) => Math.sqrt(Math.max(0.5, R0 * R0 - (z - hb - R0 * 0.25) ** 2)), hb, hb + R0 * 1.2, '#dcdcd6', (pp) => {
    atZ(pp, hb + R0 * 1.2);
    pp.c.fillStyle = '#ecece6';
    pp.c.beginPath();
    pp.c.arc(cx - 2, cy - 2, 3, 0, Math.PI * 2);
    pp.c.fill();
  }, []);
}

/** A Quonset hut: a half-round of corrugated steel along its length, the ends filled with a door and windows. */
function drawQuonset(p: P3, _g: Game, it: Item): void {
  const s = STRUCTS[it.i];
  const H = it.top + 3;
  vault(p, s.x0, s.y0, s.x1, s.y1, 0, H, 'x', '#5e6a46', 10, 'quonset', it.i);
}

/**
 * A barrel roof down to (or on) walls zE high, rising to zE + rise: along x ('x', curved across y) or along y. Its
 * arched ends get a facade.
 */
function vault(p: P3, x0: number, y0: number, x1: number, y1: number, zE: number, zA: number, axis: 'x' | 'y', col: string, n: number, endStyle: string, seed: number): void {
  const c = p.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const rise = zA - zE;
  if (axis === 'x') {
    const half = (y1 - y0) / 2, mid = (y0 + y1) / 2;
    // The arched ends, facing east and west.
    const archZ = (y: number): number => zE + rise * Math.sqrt(Math.max(0, 1 - ((y - mid) / half) ** 2));
    const endX = p.camX > x1 ? x1 : p.camX < x0 ? x0 : null;
    if (endX !== null) {
      // Drawn as upright strips across the end, each as tall as the arch there.
      const m = 8;
      for (let k = 0; k < m; k++) {
        const ya = y0 + ((y1 - y0) * k) / m, yb = y0 + ((y1 - y0) * (k + 1)) / m;
        const z = archZ((ya + yb) / 2);
        c.fillStyle = shade(ST[endStyle]?.wall ?? col, endX === x1 ? -0.3 : -0.08);
        c.beginPath();
        c.moveTo(PX(p, endX, 0), PY(p, ya, 0));
        c.lineTo(PX(p, endX, 0), PY(p, yb, 0));
        c.lineTo(PX(p, endX, z), PY(p, yb, z));
        c.lineTo(PX(p, endX, z), PY(p, ya, z));
        c.closePath();
        c.fill();
      }
      // A door in the middle of the end.
      const dz = Math.min(3.2, rise * 0.45);
      c.fillStyle = '#2e2418';
      c.beginPath();
      c.moveTo(PX(p, endX, 0), PY(p, mid - 1.6, 0));
      c.lineTo(PX(p, endX, 0), PY(p, mid + 1.6, 0));
      c.lineTo(PX(p, endX, dz), PY(p, mid + 1.6, dz));
      c.lineTo(PX(p, endX, dz), PY(p, mid - 1.6, dz));
      c.closePath();
      c.fill();
    }
    const rows: { a: number; b: number; za: number; zb: number; k: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = y0 + ((y1 - y0) * i) / n, b = y0 + ((y1 - y0) * (i + 1)) / n;
      const za = archZ(a), zb = archZ(b);
      // Lit on the north slope.
      rows.push({ a, b, za, zb, k: Math.max(-0.45, Math.min(0.32, ((zb - za) / (b - a)) * 0.35 - 0.02)) });
    }
    rows.sort((u, v) => Math.abs((v.a + v.b) / 2 - p.camY) - Math.abs((u.a + u.b) / 2 - p.camY));
    for (const q of rows) {
      c.fillStyle = shade(col, q.k);
      c.beginPath();
      c.moveTo(PX(p, x0, q.za), PY(p, q.a, q.za));
      c.lineTo(PX(p, x1, q.za), PY(p, q.a, q.za));
      c.lineTo(PX(p, x1, q.zb), PY(p, q.b, q.zb));
      c.lineTo(PX(p, x0, q.zb), PY(p, q.b, q.zb));
      c.closePath();
      c.fill();
    }
    // Corrugation across the barrel.
    c.strokeStyle = 'rgba(20,24,14,0.28)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = x0 + 2; x < x1; x += 3) {
      for (let i = 0; i <= n; i++) {
        const y = y0 + ((y1 - y0) * i) / n, z = archZ(y);
        if (i === 0) c.moveTo(PX(p, x, z), PY(p, y, z));
        else c.lineTo(PX(p, x, z), PY(p, y, z));
      }
    }
    c.stroke();
    // A stove pipe and roof vents.
    atZ(p, zA);
    c.fillStyle = '#2a2c2e';
    c.fillRect(x0 + (x1 - x0) * 0.3, mid - 0.8, 1.6, 1.6);
    c.fillRect(x0 + (x1 - x0) * 0.7, mid - 0.8, 1.6, 1.6);
    void seed;
  }
}

/** The command post: a concrete block with its helipad roof, and the control tower rising off its corner. */
function drawCommand(p: P3, _g: Game, it: Item): void {
  const s = STRUCTS[it.i];
  const H = visualHeight(s);
  boxFaces(p, s.x0, s.y0, s.x1, s.y1, 0, H, allSides('command'), 61, SIGN.command ?? null);
  spriteRoof(p, s, it.i, H);
  outline(p, s.x0, s.y0, s.x1, s.y1, H);
  // The tower: a shaft, then a glazed flaring cab, a mast and the radar sweeping round.
  const tx = s.x0 + (s.x1 - s.x0) * 0.78, ty = s.y0 + (s.y1 - s.y0) * 0.32;
  boxFaces(p, tx - 8, ty - 8, tx + 8, ty + 8, H, 70, allSides('shaft'), 67, null);
  flatTop(p, tx - 13, ty - 13, tx + 13, ty + 13, 70, '#4a5058');
  boxFaces(p, tx - 12, ty - 12, tx + 12, ty + 12, 70, 80, allSides('cabin'), 71, null);
  flatTop(p, tx - 13, ty - 13, tx + 13, ty + 13, 80, '#5a6068');
  outline(p, tx - 13, ty - 13, tx + 13, ty + 13, 80);
  pole(p, tx + 6, ty - 6, 80, 96, '#c0c4c8', 0.4);
  atZ(p, 82);
  const a = p.time * 1.6, c = p.c;
  c.strokeStyle = '#2a3038';
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(tx - Math.cos(a) * 7, ty - Math.sin(a) * 7);
  c.lineTo(tx + Math.cos(a) * 7, ty + Math.sin(a) * 7);
  c.stroke();
  c.strokeStyle = '#d0d4d8';
  c.lineWidth = 0.8;
  c.stroke();
}

function drawPlant(p: P3, _g: Game, it: Item): void {
  const s = STRUCTS[it.i];
  const H = visualHeight(s);
  boxFaces(p, s.x0, s.y0, s.x1, s.y1, 0, H, allSides('plant'), 73, SIGN.plant ?? null);
  spriteRoof(p, s, it.i, H);
  outline(p, s.x0, s.y0, s.x1, s.y1, H);
  // Two chimneys, smoking.
  for (const [fx, fy] of [[0.2, 0.3], [0.32, 0.3]]) {
    const x = s.x0 + (s.x1 - s.x0) * fx, y = s.y0 + (s.y1 - s.y0) * fy;
    drum(p, x, y, () => 2.4, H, 52, '#8a6a58', (pp, rt) => {
      atZ(pp, 52);
      pp.c.fillStyle = '#1a1a1a';
      pp.c.beginPath();
      pp.c.arc(x, y, rt * 0.7, 0, Math.PI * 2);
      pp.c.fill();
    }, [48, 49]);
    smoke(p, x, y, 52, 0.3 + fx);
  }
}

function drawMess(p: P3, g: Game, it: Item): void {
  drawStruct(p, g, it);
  const s = STRUCTS[it.i];
  const w = s.x1 - s.x0, y = s.y0 + (s.y1 - s.y0) * 0.3;
  for (let j = 0; j < 3; j++) smoke(p, s.x0 + w * (0.25 + j * 0.25), y, it.top + 2, j * 0.37);
}

function smoke(p: P3, x: number, y: number, z0: number, ph0: number): void {
  const c = p.c;
  for (let k = 0; k < 6; k++) {
    const ph = (p.time * 0.22 + k / 6 + ph0) % 1;
    atZ(p, z0 + ph * 26);
    c.fillStyle = `rgba(200,200,195,${(0.32 * (1 - ph)).toFixed(3)})`;
    c.beginPath();
    c.arc(x + ph * 10 + Math.sin(ph * 6 + ph0) * 2, y + ph * 4, 2 + ph * 6, 0, Math.PI * 2);
    c.fill();
  }
}

// ---------------------------------------------------------------------------------------------- pines

const tierCache: HTMLCanvasElement[] = [];
const TIER_COL = ['#1d3424', '#26432c', '#305234', '#3d6340'];

/** A tier of pine boughs, seen from above: a jagged star, lit north-west. */
function tierSprite(i: number, v: number): HTMLCanvasElement {
  const key = i * 3 + v;
  if (tierCache[key]) return tierCache[key];
  const S = 32, cv = makeCanvas(S, S), c = ctx2d(cv);
  const col = TIER_COL[i];
  const pts = 9 + v;
  const path = (r: number, dx: number, dy: number): void => {
    c.beginPath();
    for (let k = 0; k < pts * 2; k++) {
      const a = (k / (pts * 2)) * Math.PI * 2 + v;
      const rr = k % 2 ? r * (0.62 + hash2(k, v, i) * 0.12) : r;
      const x = S / 2 + dx + Math.cos(a) * rr, y = S / 2 + dy + Math.sin(a) * rr;
      if (k === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  };
  c.fillStyle = '#0e1a12';
  path(15, 0.5, 0.5);
  c.fill();
  c.fillStyle = col;
  path(14, 0, 0);
  c.fill();
  c.fillStyle = shade(col, 0.22);
  path(8, -3, -3);
  c.fill();
  // Needle texture.
  for (let k = 0; k < 40; k++) {
    const x = hash2(k, v, 3 + i) * S, y = hash2(k, v, 5 + i) * S;
    if (Math.hypot(x - S / 2, y - S / 2) > 12) continue;
    c.fillStyle = hash2(k, v, 7) < 0.5 ? shade(col, -0.3) : shade(col, 0.35);
    c.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  }
  tierCache[key] = cv;
  return cv;
}

function drawPine(p: P3, _g: Game, it: Item): void {
  const t = PINES[it.i];
  const c = p.c;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const v = it.i % 3;
  const zs = [0.16, 0.4, 0.62, 0.84], rs = [1, 0.8, 0.56, 0.3];
  // The trunk at the foot.
  pole(p, t.x, t.y, 0, t.h * 0.2, '#3a2a1c', 0.8);
  c.setTransform(1, 0, 0, 1, 0, 0);
  for (let k = 0; k < 4; k++) {
    const z = t.h * zs[k];
    const r = t.r * rs[k] * p.ppm * sOf(p, z);
    if (r < 0.6) continue;
    c.drawImage(tierSprite(k, v), Math.round(PX(p, t.x, z) - r), Math.round(PY(p, t.y, z) - r), Math.round(r * 2), Math.round(r * 2));
  }
}

// ---------------------------------------------------------------------------------------------- the ground

/**
 * On the ground under it all: the sectors (a tint, painted borders, their letters and names stencilled big), the
 * forest floor round the walls, and every shadow, thrown south-east.
 */
export function drawBaseGround(c: CanvasRenderingContext2D, g: Game, near: (x: number, y: number, r: number) => boolean, hx: number, hy: number, ppm: number): void {
  // The forest floor.
  c.fillStyle = 'rgba(46,64,36,0.55)';
  const C = COMPOUND;
  c.beginPath();
  c.rect(C.x0 - 236, C.y0 - 206, C.x1 - C.x0 + 472, 186);
  c.rect(C.x1 + 20, C.y0 - 20, 216, C.y1 - C.y0 + 146);
  c.rect(C.x0 - 236, C.y0 - 20, 216, C.y1 - C.y0 + 146);
  c.fill();
  c.fillStyle = 'rgba(30,44,26,0.35)';
  c.beginPath();
  for (const t of PINES) c.rect(t.x - t.r * 1.4, t.y - t.r * 1.4, t.r * 2.8, t.r * 2.8);
  c.fill();
  // Sectors.
  for (const s of SECTORS) {
    if (!near(hx + (s.x0 + s.x1) / 2, hy + (s.y0 + s.y1) / 2, Math.max(s.x1 - s.x0, s.y1 - s.y0))) continue;
    c.fillStyle = s.tint;
    c.fillRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
    // A painted border, dashed.
    c.fillStyle = 'rgba(230,200,60,0.4)';
    for (let x = s.x0; x < s.x1; x += 10) {
      c.fillRect(x, s.y0, 6, 1);
      c.fillRect(x, s.y1 - 1, 6, 1);
    }
    for (let y = s.y0; y < s.y1; y += 10) {
      c.fillRect(s.x0, y, 1, 6);
      c.fillRect(s.x1 - 1, y, 1, 6);
    }
    if (ppm > 0.25) {
      // The letter in a box, the name beside it.
      const u = 3, bw = 7 * u, tw = miniWidth(s.name, 2);
      c.fillStyle = 'rgba(230,200,60,0.75)';
      c.fillRect(s.lx, s.ly, bw + 4, 5 * u + 4);
      pxMini(c, s.id, s.lx + 2 + (bw - miniWidth(s.id, u)) / 2, s.ly + 2, 'rgba(30,30,24,0.9)', 'left', null, u);
      c.fillStyle = 'rgba(20,20,16,0.35)';
      c.fillRect(s.lx + bw + 6, s.ly + 3, tw + 6, 14);
      pxMini(c, s.name, s.lx + bw + 9, s.ly + 5, 'rgba(240,232,200,0.8)', 'left', null, 2);
    }
  }
  // Shadows: every box swept south-east by its height, as one shape so they don't stack.
  if (!scene) scene = buildScene();
  c.fillStyle = 'rgba(6,10,18,0.3)';
  c.beginPath();
  for (const it of scene) {
    if (it.draw === drawPine) continue;
    if (!near(hx + (it.x0 + it.x1) / 2, hy + (it.y0 + it.y1) / 2, Math.max(it.x1 - it.x0, it.y1 - it.y0) / 2 + it.top)) continue;
    const z = it.draw === drawHangar ? HANGAR_EAVE + 20 : it.draw === drawMast || it.draw === drawFlagpole ? 0 : it.top;
    if (z <= 0.5) continue;
    let { x0, y0, x1, y1 } = it;
    if (it.draw === drawTower) {
      // A slimmer shaft above the wall.
      const t = TOWERS[it.i];
      x0 = t.x - 7;
      x1 = t.x + 7;
      y0 = t.y - 7;
      y1 = t.y + 7;
    }
    const dx = z * SHX, dy = z * SHY;
    c.moveTo(x0, y0);
    c.lineTo(x1, y0);
    c.lineTo(x1 + dx, y0 + dy);
    c.lineTo(x1 + dx, y1 + dy);
    c.lineTo(x0 + dx, y1 + dy);
    c.lineTo(x0, y1);
    c.closePath();
  }
  c.fill();
  // Masts, poles and pines throw thin shadows.
  c.strokeStyle = 'rgba(6,10,18,0.28)';
  c.lineCap = 'round';
  for (const it of scene) {
    if (it.draw !== drawMast && it.draw !== drawFlagpole) continue;
    const s = STRUCTS[it.i];
    const x = (s.x0 + s.x1) / 2, y = (s.y0 + s.y1) / 2;
    c.lineWidth = it.draw === drawMast ? 4 : 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + it.top * SHX, y + it.top * SHY);
    c.stroke();
  }
  c.lineWidth = 7;
  c.beginPath();
  PINES.forEach((t, i) => {
    if (crushed.has(i)) return;
    c.moveTo(t.x, t.y);
    c.lineTo(t.x + t.h * SHX * 0.7, t.y + t.h * SHY * 0.7);
  });
  c.stroke();
  c.lineCap = 'butt';
  // Felled pines lie where they went down.
  c.fillStyle = '#4a3a26';
  for (const i of crushed) {
    const t = PINES[i];
    c.fillRect(t.x - t.h * 0.3, t.y - 0.8, t.h * 0.6, 1.6);
  }
  void g;
}
