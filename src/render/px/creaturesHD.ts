import type { Arch } from '../../game/enemyDefs';
import { ctx2d, hash2, makeCanvas, rgb, type RGB } from './pixels';

/**
 * Creatures in high-resolution pixel art (up to 128 px and beyond for the giants), from above, facing right.
 *
 * Painted the way a pixel artist shades: every body part is a lit volume, but its light is snapped to a
 * six-tone ramp for its colour (hue-shifted: shadows cool toward violet, highlights warm toward gold) with
 * ordered dithering where one tone gives way to the next. Every part carries its own dark rim, so a leg reads
 * against the body and the head against the shoulders; surfaces have a texture for what they're made of (fur,
 * scales, chitin, plate, rock, cloth, skin, membrane). Anatomy is built up from parts: jointed legs with claws,
 * heads with jaws, ears, horns and tusks, tails, wings with bone fingers, armour plates down the spine. Eyes and
 * lamps glow. Legs stride and wings beat over two frames. Painted on a 32-unit grid at the size it's shown.
 */

export type Tex = 'none' | 'fur' | 'scales' | 'chitin' | 'metal' | 'rock' | 'cloth' | 'skin' | 'membrane' | 'glow';

/** A creature's look within its archetype (humanoids: armed raider, shambling zombie, bare skeleton). */
export type Look = '' | 'zombie' | 'skeleton';

export interface Painter {
  S: number;
  u: number;
  d: Uint8ClampedArray;
  seed: number;
  /** Whole-pixel offset (for plans drawn at a larger scale about the centre). */
  ox?: number;
  oy?: number;
}

/** Toward the sun in sprite space (x right, y down, z up). */
const L = (() => {
  const v = [-0.55, -0.55, 0.63];
  const n = Math.hypot(v[0], v[1], v[2]);
  return v.map((k) => k / n);
})();

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
export const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

const ramps = new Map<string, RGB[]>();

/** Six tones for a colour: rim, deep shadow, shadow, base, light, highlight. */
function rampOf(c: RGB): RGB[] {
  const key = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
  let r = ramps.get(key);
  if (r) return r;
  r = [
    mixc(mul(c, 0.2), [16, 10, 30], 0.55),
    mixc(mul(c, 0.46), [42, 34, 88], 0.26),
    mixc(mul(c, 0.72), [66, 64, 112], 0.1),
    c,
    mixc(mul(c, 1.14), [255, 228, 170], 0.16),
    mixc(c, [255, 246, 222], 0.62),
  ].map((v) => [clamp(v[0]), clamp(v[1]), clamp(v[2])] as RGB);
  if (ramps.size > 600) ramps.clear();
  ramps.set(key, r);
  return r;
}

function put(p: Painter, x: number, y: number, c: RGB, a = 255): void {
  if (p.ox) {
    x += p.ox;
    y += p.oy!;
  }
  if (x < 0 || y < 0 || x >= p.S || y >= p.S) return;
  const q = (y * p.S + x) * 4;
  if (a >= 255) {
    p.d[q] = c[0];
    p.d[q + 1] = c[1];
    p.d[q + 2] = c[2];
    p.d[q + 3] = 255;
  } else {
    const t = a / 255;
    p.d[q] = p.d[q] * (1 - t) + c[0] * t;
    p.d[q + 1] = p.d[q + 1] * (1 - t) + c[1] * t;
    p.d[q + 2] = p.d[q + 2] * (1 - t) + c[2] * t;
    p.d[q + 3] = Math.max(p.d[q + 3], a);
  }
}

/** Surface texture as a nudge in ramp tones (+ lighter, - darker). */
function texT(p: Painter, tex: Tex, x: number, y: number, lx: number, ly: number): number {
  const h = hash2(x, y, p.seed);
  switch (tex) {
    case 'fur': {
      // Strands running back along the body, and the odd bright tuft.
      const s = hash2(Math.floor(x / 2), y, p.seed + 1);
      return (s - 0.5) * 0.9 + (h > 0.93 ? 0.7 : 0);
    }
    case 'scales': {
      const g = Math.max(2, Math.round(p.u * 1.6));
      const sx = (x + (Math.floor(y / g) % 2) * (g >> 1)) % g, sy = y % g;
      return sy === g - 1 ? -1 : sy === 0 ? 0.45 : sx === 0 && h > 0.5 ? -0.5 : 0;
    }
    case 'chitin': return (Math.abs(Math.sin(lx * 8.5)) < 0.16 ? -1.3 : 0) + (h - 0.5) * 0.2;
    case 'metal': {
      const g = Math.max(3, Math.round(p.u * 4));
      if (x % g === 0 || y % g === 0) return -1;
      return x % g === 1 && y % g === 1 ? 1 : 0;
    }
    case 'rock': {
      const b = hash2(Math.floor(x / 2), Math.floor(y / 2), p.seed + 3);
      return (b - 0.5) * 1.3 + (h > 0.95 ? -1.2 : 0);
    }
    case 'cloth': return (hash2(Math.floor(x / 2), y, p.seed + 5) - 0.5) * 0.7 + (Math.abs(Math.sin((lx + ly) * 5)) < 0.12 ? -0.6 : 0);
    case 'skin': return (h - 0.5) * 0.35;
    case 'membrane': return Math.abs(Math.sin((lx * 1.3 + ly) * 5)) < 0.14 ? -1 : 0;
    case 'glow': return 1.1;
    default: return 0;
  }
}

const SHINY: Partial<Record<Tex, boolean>> = { chitin: true, metal: true, scales: true, skin: true, glow: true };

/** Pick a ramp tone for light `lam` (0-1) plus a texture nudge, dithered between tones. */
function tone(x: number, y: number, lam: number, t: number, shiny: boolean): number {
  if (shiny && lam > 0.955) return 5;
  const v = 1.15 + 3.3 * lam + t;
  const b = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
  return Math.max(1, Math.min(4, Math.floor(v + b * 0.85)));
}

/** A lit rounded volume (ellipsoid seen from above) in units; `lift` raises the dome (flatter < 1). */
export function ell(p: Painter, cx: number, cy: number, rx: number, ry: number, col: RGB, tex: Tex = 'none', lift = 1, rot = 0, rim = true): void {
  const u = p.u;
  const ramp = rampOf(col);
  const X = cx * u, Y = cy * u, RX = Math.max(0.6, rx * u), RY = Math.max(0.6, ry * u);
  const R = Math.max(RX, RY);
  const rp = Math.min(RX, RY);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  // The rim is about a pixel wide whatever the size (none on specks).
  const ring = rim && rp >= 2 ? 1 - Math.min(0.5, 1.15 / rp) * 2 : 2;
  const soft = rim && rp >= 1.2 && rp < 2;
  const shiny = !!SHINY[tex];
  for (let y = Math.floor(Y - R); y <= Math.ceil(Y + R); y++) {
    for (let x = Math.floor(X - R); x <= Math.ceil(X + R); x++) {
      const ox = x + 0.5 - X, oy = y + 0.5 - Y;
      const lx = (ox * cr + oy * sr) / RX, ly = (-ox * sr + oy * cr) / RY;
      const d2 = lx * lx + ly * ly;
      if (d2 > 1) continue;
      if (d2 > ring) {
        put(p, x, y, ramp[0]);
        continue;
      }
      const nz = Math.sqrt(1 - d2) * lift;
      const nx = lx * cr - ly * sr, ny = lx * sr + ly * cr;
      const n = Math.hypot(nx, ny, nz) || 1;
      const lam = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / n);
      let k = tone(x, y, lam, texT(p, tex, x, y, lx, ly), shiny);
      if (soft && d2 > 0.7) k = Math.min(k, 1);
      put(p, x, y, ramp[k]);
    }
  }
}

/** A limb or tail: a chain of small volumes from one point to another (drawn without inner rims). */
export function cap(p: Painter, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, col: RGB, tex: Tex = 'none'): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(2, Math.ceil((len * p.u) / Math.max(0.8, Math.min(r0, r1) * p.u * 0.7)));
  // The outline first, all along, then the fill over it: one clean outlined limb.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const r = r0 + (r1 - r0) * t;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (pass === 0) {
        const R = Math.max(0.7, r * p.u + 0.9);
        disc(p, x * p.u, y * p.u, R, rampOf(col)[0]);
      } else ell(p, x, y, r, r, col, tex, 1, 0, false);
    }
  }
}

function disc(p: Painter, X: number, Y: number, R: number, c: RGB): void {
  for (let y = Math.floor(Y - R); y <= Math.ceil(Y + R); y++) {
    for (let x = Math.floor(X - R); x <= Math.ceil(X + R); x++) {
      if (Math.hypot(x + 0.5 - X, y + 0.5 - Y) <= R) put(p, x, y, c);
    }
  }
}

/** A tapered horn, tusk, claw or spike from a base to a tip, lit down one side. */
export function spike(p: Painter, bx: number, by: number, tx: number, ty: number, w: number, col: RGB): void {
  const u = p.u;
  const ramp = rampOf(col);
  const X0 = bx * u, Y0 = by * u, X1 = tx * u, Y1 = ty * u;
  const len = Math.hypot(X1 - X0, Y1 - Y0);
  if (len < 0.5) return;
  const ax = (X1 - X0) / len, ay = (Y1 - Y0) / len;
  const W = Math.max(0.8, (w * u) / 2);
  // Which side faces the sun.
  const lit = -ay * L[0] + ax * L[1] < 0 ? 1 : -1;
  const x0 = Math.floor(Math.min(X0, X1) - W - 1), x1 = Math.ceil(Math.max(X0, X1) + W + 1);
  const y0 = Math.floor(Math.min(Y0, Y1) - W - 1), y1 = Math.ceil(Math.max(Y0, Y1) + W + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ox = x + 0.5 - X0, oy = y + 0.5 - Y0;
      const t = (ox * ax + oy * ay) / len;
      if (t < 0 || t > 1) continue;
      const lat = -ox * ay + oy * ax;
      const hw = W * (1 - t);
      if (Math.abs(lat) > hw + 0.35) continue;
      const edge = Math.abs(lat) > hw - 0.65;
      const k = edge ? 0 : t > 0.8 ? 5 : lat * lit > 0 ? 4 : 2;
      put(p, x, y, ramp[k]);
    }
  }
}

/** A flat bevelled plate (hulls, armour, guns): lit top edge, shaded bottom edge, panel lines, a dark rim. */
export function plate(p: Painter, x: number, y: number, w: number, h: number, col: RGB, tex: Tex = 'metal'): void {
  const u = p.u;
  const ramp = rampOf(col);
  const x0 = Math.round(x * u), y0 = Math.round(y * u), x1 = Math.max(x0 + 1, Math.round((x + w) * u)), y1 = Math.max(y0 + 1, Math.round((y + h) * u));
  const big = x1 - x0 >= 4 && y1 - y0 >= 4;
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      let k: number;
      if (big && (yy === y0 || xx === x0 || yy === y1 - 1 || xx === x1 - 1)) k = 0;
      else if (yy === y0 + (big ? 1 : 0) || xx === x0 + (big ? 1 : 0)) k = 4;
      else if (yy === y1 - (big ? 2 : 1) || xx === x1 - (big ? 2 : 1)) k = 2;
      else k = Math.max(1, Math.min(4, Math.round(3 + texT(p, tex, xx, yy, 0, 0))));
      put(p, xx, yy, ramp[k]);
    }
  }
}

/** A glowing point (eyes, lamps) with a soft halo. */
export function eye(p: Painter, x: number, y: number, col: RGB, r = 0.9): void {
  const u = p.u;
  const X = x * u, Y = y * u, R = Math.max(0.7, r * u);
  for (let yy = Math.floor(Y - R * 2.2); yy <= Math.ceil(Y + R * 2.2); yy++) {
    for (let xx = Math.floor(X - R * 2.2); xx <= Math.ceil(X + R * 2.2); xx++) {
      const dd = Math.hypot(xx + 0.5 - X, yy + 0.5 - Y) / R;
      if (dd <= 1) put(p, xx, yy, dd < 0.5 ? [255, 255, 235] : col);
      else if (dd < 2.2) put(p, xx, yy, col, Math.round(80 * (1 - (dd - 1) / 1.2)));
    }
  }
}

/** A thin line (whiskers, stitches, antennae, cables). */
export function line(p: Painter, x0: number, y0: number, x1: number, y1: number, col: RGB): void {
  const u = p.u;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * u));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    put(p, Math.floor((x0 + (x1 - x0) * t) * u), Math.floor((y0 + (y1 - y0) * t) * u), col);
  }
}

export function tint(c: RGB, k: number): RGB {
  return k >= 0 ? [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k] : [c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)];
}

interface Pal {
  body: RGB;
  dark: RGB;
  light: RGB;
  eye: RGB;
  metal: RGB;
  bone: RGB;
  skin: RGB;
  claw: RGB;
}

type Plan = (p: Painter, c: Pal, f: number, look: Look) => void;

/** Claws on a paw or foot, pointing along `a`. */
function claws(p: Painter, x: number, y: number, a: number, n: number, len: number, col: RGB): void {
  for (let k = 0; k < n; k++) {
    const s = (k - (n - 1) / 2) * 0.45;
    const bx = x + Math.cos(a + s) * len * 0.5, by = y + Math.sin(a + s) * len * 0.5;
    spike(p, bx, by, bx + Math.cos(a + s * 0.6) * len, by + Math.sin(a + s * 0.6) * len, 0.55, col);
  }
}

const PLANS: Record<Arch, Plan> = {
  swarm: (p, c, f) => {
    const st = f ? 1 : -1;
    // A long bare tail, curling as it runs.
    for (let k = 0; k <= 7; k++) {
      const t = k / 7;
      ell(p, 9.5 - t * 8, 16 + Math.sin(t * 3.2 + f * 1.6) * 2 * t, 0.95 - t * 0.5, 0.95 - t * 0.5, c.skin, 'skin', 1, 0, k === 7);
    }
    for (const [lx, sd, ph] of [[11, -1, 1], [11, 1, -1], [19.5, -1, -1], [19.5, 1, 1]]) {
      const x = lx + st * ph * 1.3, y = 16 + sd * 5.3;
      cap(p, lx, 16 + sd * 3, x, y, 0.9, 0.8, c.dark, 'fur');
      claws(p, x, y, lx > 15 ? 0.3 * sd : Math.PI - 0.3 * sd, 2, 1.2, c.claw);
    }
    ell(p, 14.5, 16, 7.4, 5.1, c.body, 'fur');
    ell(p, 13.5, 16, 5.6, 1.5, c.dark, 'fur', 0.6, 0, false);
    ell(p, 22.2, 16, 4.2, 3.6, c.body, 'fur');
    ell(p, 20.2, 12.4, 1.8, 1.5, c.skin, 'skin');
    ell(p, 20.2, 19.6, 1.8, 1.5, c.skin, 'skin');
    ell(p, 26.4, 16, 2.3, 1.8, tint(c.body, 0.12), 'fur');
    ell(p, 28.5, 16, 0.85, 0.8, [40, 24, 30], 'skin');
    for (const sd of [-1, 1]) {
      line(p, 27, 16 + sd * 1.2, 30.5, 16 + sd * 3.2, tint(c.light, 0.3));
      line(p, 27, 16 + sd * 1.4, 29.8, 16 + sd * 4.2, tint(c.light, 0.2));
    }
    eye(p, 24.3, 14.3, c.eye, 0.55);
    eye(p, 24.3, 17.7, c.eye, 0.55);
  },
  canine: (p, c, f) => {
    const st = f ? 1 : -1;
    // A bushy tail.
    for (let k = 0; k <= 7; k++) {
      const t = k / 7;
      ell(p, 8 - t * 6.5, 16 + Math.sin(f * 1.4 + t * 2) * 2.4 * t, 1.9 - t * 0.9, 1.7 - t * 0.8, k > 5 ? c.light : c.body, 'fur', 1, 0, k === 0 || k === 7);
    }
    // Hind legs (thigh, shin, paw), then the forelegs.
    for (const sd of [-1, 1]) {
      const ph = sd * st;
      ell(p, 10.5, 16 + sd * 3.8, 3, 2.2, c.body, 'fur', 1, 0.3 * sd);
      const px = 8.3 + ph * 2.6, py = 16 + sd * 8.2;
      cap(p, 10, 16 + sd * 5, px, py, 1.1, 0.8, c.dark, 'fur');
      ell(p, px, py, 1.3, 1.05, c.dark, 'fur');
      claws(p, px, py, Math.PI * 0.5 * sd + (ph > 0 ? -0.6 : 0.6) * sd, 2, 1, c.claw);
    }
    for (const sd of [-1, 1]) {
      const ph = -sd * st;
      ell(p, 20.2, 16 + sd * 3.6, 2.5, 2, c.body, 'fur');
      const px = 22.8 + ph * 2.6, py = 16 + sd * 7.7;
      cap(p, 20.6, 16 + sd * 4.6, px, py, 1, 0.8, c.dark, 'fur');
      ell(p, px, py, 1.25, 1, c.dark, 'fur');
      claws(p, px, py, 0.4 * sd, 3, 1.1, c.claw);
    }
    ell(p, 13, 16, 6.3, 4.4, c.body, 'fur');
    ell(p, 19.2, 16, 5.6, 5, c.body, 'fur');
    ell(p, 15.5, 16, 7.6, 1.7, c.dark, 'fur', 0.5, 0, false);
    // The ruff at the neck.
    for (let k = 0; k < 4; k++) spike(p, 22.6, 16 + (k - 1.5) * 2.2, 19.6, 16 + (k - 1.5) * 3.3, 1.7, c.dark);
    ell(p, 25, 16, 3.7, 3.5, c.body, 'fur');
    cap(p, 26.6, 16, 30, 16, 1.95, 1.35, tint(c.body, 0.1), 'fur');
    ell(p, 30.4, 16, 0.9, 0.8, [34, 26, 30], 'skin');
    spike(p, 30, 14.9, 30.9, 14.3, 0.7, c.bone);
    spike(p, 30, 17.1, 30.9, 17.7, 0.7, c.bone);
    spike(p, 23.7, 13.6, 20.8, 11.2, 2.2, c.dark);
    spike(p, 23.7, 18.4, 20.8, 20.8, 2.2, c.dark);
    eye(p, 27, 14.3, c.eye, 0.62);
    eye(p, 27, 17.7, c.eye, 0.62);
  },
  beast: (p, c, f) => {
    const st = f ? 1 : -1;
    // A heavy tail ending in a bony club.
    const ty = 16 + (f ? 1.5 : -1.5);
    cap(p, 5.5, 16, 2, ty, 2.2, 1.3, c.dark, 'scales');
    ell(p, 1.8, ty, 1.7, 1.7, c.bone, 'rock');
    // Four pillar legs with claws.
    for (const [lx, sd, ph] of [[8, -1, 1], [8, 1, -1], [22, -1, -1], [22, 1, 1]]) {
      const x = lx + st * ph * 1.6, y = 16 + sd * 8.4;
      cap(p, lx, 16 + sd * 4.5, x, y, 2.3, 2, c.dark, 'scales');
      ell(p, x, y, 3, 2.4, c.dark, 'scales');
      claws(p, x + 1.6, y + sd * 0.4, sd * 0.3, 3, 1.3, c.claw);
    }
    ell(p, 15, 16, 12.6, 7.4, c.body, 'scales');
    ell(p, 13, 16, 9, 3.4, c.light, 'scales', 0.45, 0, false);
    // A ridge of horn down the spine, biggest over the shoulders, and a hump of muscle.
    ell(p, 19, 16, 5, 5.4, tint(c.body, 0.08), 'scales', 1.1, 0, false);
    for (let k = 0; k < 7; k++) {
      const x = 4.5 + k * 3.1;
      const h = 1.6 + Math.sin((k / 6) * Math.PI) * 1.8;
      spike(p, x + h * 0.6, 16, x - h, 16, 1.2 + h * 0.5, tint(c.bone, -0.12));
    }
    ell(p, 27, 16, 4.6, 4.6, c.body, 'scales');
    ell(p, 29.9, 16, 2.5, 2.8, tint(c.body, 0.1), 'skin');
    // Tusks forward, horns swept back.
    spike(p, 29.6, 13.3, 31.9, 11, 1.7, c.bone);
    spike(p, 29.6, 18.7, 31.9, 21, 1.7, c.bone);
    spike(p, 25.8, 12.3, 22.4, 9, 2.1, c.bone);
    spike(p, 25.8, 19.7, 22.4, 23, 2.1, c.bone);
    eye(p, 29.4, 13.9, c.eye, 0.75);
    eye(p, 29.4, 18.1, c.eye, 0.75);
  },
  humanoid: (p0, c, f, look) => {
    // Drawn a size up on the grid (people are small; they need the pixels).
    const k = 1.16;
    const p: Painter = { ...p0, u: p0.u * k, ox: Math.round(-16 * p0.u * (k - 1)), oy: Math.round(-16 * p0.u * (k - 1)) };
    const st = f ? 2 : -2;
    const zombie = look === 'zombie', skel = look === 'skeleton';
    const cloth = zombie ? tint(mixc(c.body, [96, 90, 80], 0.6), -0.3) : skel ? [70, 58, 52] as RGB : c.body;
    const skin = zombie ? c.body : skel ? c.bone : [214, 170, 130] as RGB;
    // Boots out ahead and behind (walking), seen from above.
    ell(p, 15 + st, 13.3, 2.3, 1.55, skel ? c.bone : [44, 40, 38], skel ? 'rock' : 'cloth');
    ell(p, 15 - st, 18.7, 2.3, 1.55, skel ? c.bone : [44, 40, 38], skel ? 'rock' : 'cloth');
    if (skel) {
      // A ribcage and spine under rags.
      ell(p, 15, 16, 3.3, 6, cloth, 'cloth');
      for (let k = 0; k < 4; k++) line(p, 13 + k * 1.2, 11.4, 13 + k * 1.2, 20.6, c.bone);
      line(p, 12.5, 16, 17.8, 16, c.bone);
    } else {
      ell(p, 15, 16, 3.7, 6.5, cloth, 'cloth');
      if (!zombie) {
        // Pack and webbing.
        plate(p, 10.8, 13, 3.4, 6, tint(cloth, -0.35), 'cloth');
        line(p, 12.6, 10.6, 17.2, 21.4, tint(cloth, -0.45));
      } else {
        // Torn clothes, bare skin showing.
        ell(p, 14, 13.4, 1.5, 1.2, skin, 'skin');
        ell(p, 15.6, 19, 1.3, 1.1, skin, 'skin');
      }
    }
    if (zombie || skel) {
      // Arms out in front, reaching; clawed hands.
      const reach = zombie ? 23 : 21.5;
      cap(p, 15.5, 10.6, reach, 12.2 + st * 0.25, skel ? 0.75 : 1.25, skel ? 0.6 : 1.05, skin, skel ? 'rock' : 'skin');
      cap(p, 15.5, 21.4, reach - 0.8, 19.8 - st * 0.25, skel ? 0.75 : 1.25, skel ? 0.6 : 1.05, skin, skel ? 'rock' : 'skin');
      claws(p, reach, 12.2 + st * 0.25, -0.2, 3, 1, c.claw);
      claws(p, reach - 0.8, 19.8 - st * 0.25, 0.2, 3, 1, c.claw);
    } else {
      // Both hands on a rifle.
      cap(p, 15.5, 10, 20.8, 14.4, 1.35, 1.1, cloth, 'cloth');
      cap(p, 15.5, 22, 19.4, 17.6, 1.35, 1.1, cloth, 'cloth');
      plate(p, 18, 15, 10.5, 2, c.metal, 'metal');
      plate(p, 20.5, 16.8, 1.6, 2.4, tint(c.metal, -0.3), 'metal');
      plate(p, 27.5, 15.3, 1.4, 1.4, [30, 30, 34], 'metal');
      ell(p, 20.9, 14.5, 1.05, 1.05, skin, 'skin');
      ell(p, 19.4, 17.5, 1.05, 1.05, skin, 'skin');
    }
    // The head: helmet, rotten scalp or skull.
    if (skel) {
      ell(p, 16, 16, 2.9, 2.8, c.bone, 'rock');
      ell(p, 17.2, 14.9, 0.8, 0.8, [20, 10, 14], 'none', 0.2, 0, false);
      ell(p, 17.2, 17.1, 0.8, 0.8, [20, 10, 14], 'none', 0.2, 0, false);
      eye(p, 17.3, 14.9, [255, 60, 40], 0.35);
      eye(p, 17.3, 17.1, [255, 60, 40], 0.35);
    } else if (zombie) {
      ell(p, 16, 16, 2.9, 2.9, skin, 'skin');
      for (let k = 0; k < 4; k++) ell(p, 14.8 + hash2(k, 3) * 2, 14.6 + hash2(k, 5) * 3, 0.7, 0.6, [40, 32, 28], 'fur', 1, 0, false);
      eye(p, 18, 14.9, c.eye, 0.42);
      eye(p, 18, 17.1, c.eye, 0.42);
    } else {
      ell(p, 15.7, 16, 3, 3, tint(mixc(cloth, [60, 66, 72], 0.5), -0.1), 'metal');
      plate(p, 17.4, 14.6, 1.4, 2.8, [30, 34, 40], 'none');
      eye(p, 18.2, 15.3, c.eye, 0.38);
      eye(p, 18.2, 16.7, c.eye, 0.38);
    }
  },
  vehicle: (p, c, f) => {
    // Four big wheels with tread lugs turning.
    for (const [wx, wy] of [[7, 7], [7, 25], [24, 7], [24, 25]]) {
      ell(p, wx, wy, 3.6, 2.7, [26, 26, 30], 'none', 0.6);
      for (let k = 0; k < 4; k++) plate(p, wx - 3.2 + ((k * 2 + f) % 7), wy - 2.4, 0.5, 4.8, [58, 60, 66], 'none');
    }
    plate(p, 3, 8.5, 26, 15, c.body, 'metal');
    // Side armour with rivets, a roll cage, the driver, a rear gun.
    plate(p, 5, 8.2, 12, 2, tint(c.body, -0.3), 'metal');
    plate(p, 5, 21.8, 12, 2, tint(c.body, -0.3), 'metal');
    for (let k = 0; k < 5; k++) {
      eye(p, 6 + k * 2.4, 9.2, tint(c.light, 0.3), 0.18);
      eye(p, 6 + k * 2.4, 22.8, tint(c.light, 0.3), 0.18);
    }
    plate(p, 17, 11, 7, 10, [56, 100, 140], 'none');
    plate(p, 17.5, 11.5, 6, 2, [150, 210, 240], 'none');
    line(p, 16.5, 10.5, 24.5, 10.5, [30, 30, 34]);
    line(p, 16.5, 21.5, 24.5, 21.5, [30, 30, 34]);
    ell(p, 19.5, 16, 1.6, 1.6, [60, 50, 40], 'cloth');
    ell(p, 10, 16, 3.8, 3.8, tint(c.body, 0.12), 'metal');
    plate(p, 11, 15.3, 13, 1.4, c.metal, 'metal');
    // A ram of spikes on the bumper.
    for (let k = 0; k < 4; k++) spike(p, 29, 10.5 + k * 3.7, 31.8, 10.5 + k * 3.7, 1.2, c.bone);
    eye(p, 29, 10.5, [255, 250, 220], 0.7);
    eye(p, 29, 21.5, [255, 250, 220], 0.7);
    eye(p, 3.5, 10, [255, 60, 40], 0.5);
    eye(p, 3.5, 22, [255, 60, 40], 0.5);
  },
  worm: (p, c, f) => {
    const seg = 8;
    for (let k = 0; k < seg; k++) {
      const t = k / (seg - 1);
      const x = 3 + t * 22, y = 16 + Math.sin(t * 5 + f * 1.4) * 4 * (1 - t * 0.6);
      const r = 3.2 + Math.sin(t * Math.PI) * 2.6;
      ell(p, x, y, r, r, k % 2 ? c.body : tint(c.body, -0.14), 'chitin');
      ell(p, x - r * 0.25, y, r * 0.55, r * 0.9, tint(c.light, 0.05), 'chitin', 0.5, 0, false);
      if (k % 2 && k < seg - 1) {
        spike(p, x, y - r * 0.8, x - 1.6, y - r - 1.4, 1.2, c.bone);
        spike(p, x, y + r * 0.8, x - 1.6, y + r + 1.4, 1.2, c.bone);
      }
    }
    // The maw: a ring of teeth around a red throat.
    ell(p, 27.6, 16, 4.5, 4.5, tint(c.body, -0.1), 'chitin');
    ell(p, 28.6, 16, 2.9, 2.9, [70, 10, 16], 'skin', 0.3);
    ell(p, 28.8, 16, 1.4, 1.4, [20, 4, 6], 'none', 0.2, 0, false);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      spike(p, 28.6 + Math.cos(a) * 3, 16 + Math.sin(a) * 3, 28.6 + Math.cos(a) * 1.5, 16 + Math.sin(a) * 1.5, 0.9, c.bone);
    }
  },
  flyer: (p, c, f) => {
    const spread = f ? 1 : 0.62;
    for (const sd of [-1, 1]) {
      // Wing membrane between bone fingers.
      ell(p, 12.5, 16 + sd * 8 * spread, 6.5, 5.4 * spread, tint(c.body, -0.25), 'membrane', 0.3);
      ell(p, 9, 16 + sd * 11 * spread, 3.4, 2.6 * spread, tint(c.body, -0.3), 'membrane', 0.3, 0, false);
      for (let k = 0; k < 4; k++) {
        const tipX = 7 + k * 4, tipY = 16 + sd * (13.5 * spread - k * 1.4);
        cap(p, 16, 16 + sd * 2, tipX, tipY, 0.6, 0.35, tint(c.dark, 0.15), 'skin');
      }
      claws(p, 16, 16 + sd * 2.4, -Math.PI / 2 * sd, 1, 1.2, c.claw);
    }
    ell(p, 15, 16, 5.6, 3.7, c.body, 'fur');
    ell(p, 20.6, 16, 3.1, 2.7, c.body, 'fur');
    spike(p, 20, 14.2, 18.4, 11.6, 1.6, c.dark);
    spike(p, 20, 17.8, 18.4, 20.4, 1.6, c.dark);
    spike(p, 22.8, 15.3, 23.6, 15.1, 0.5, c.bone);
    spike(p, 22.8, 16.7, 23.6, 16.9, 0.5, c.bone);
    eye(p, 22, 14.9, c.eye, 0.5);
    eye(p, 22, 17.1, c.eye, 0.5);
  },
  dragon: (p, c, f) => {
    const spread = f ? 1 : 0.7;
    const ty = 16 + (f ? 2.2 : -2.2);
    cap(p, 1.5, ty, 9, 16, 0.7, 2.4, c.body, 'scales');
    spike(p, 1.8, ty, -0.2, ty - 1.4, 1.6, c.dark);
    spike(p, 1.8, ty, -0.2, ty + 1.4, 1.6, c.dark);
    for (const sd of [-1, 1]) {
      ell(p, 11, 16 + sd * 9 * spread, 7.2, 5.6 * spread, tint(c.body, -0.28), 'membrane', 0.3);
      for (let k = 0; k < 4; k++) cap(p, 15, 16 + sd * 3, 6 + k * 3.5, 16 + sd * (14.5 * spread - k * 1.4), 0.8, 0.4, tint(c.dark, 0.1), 'scales');
    }
    ell(p, 14, 16, 7.6, 5.1, c.body, 'scales');
    ell(p, 13, 16, 5.6, 2.4, c.light, 'scales', 0.5, 0, false);
    cap(p, 20, 16, 26, 16, 2.4, 1.8, c.body, 'scales');
    for (let k = 0; k < 6; k++) spike(p, 7 + k * 3, 16, 5.4 + k * 3, 16, 1.3, c.bone);
    ell(p, 28.5, 16, 3.3, 2.7, c.body, 'scales');
    spike(p, 27, 14.2, 24.2, 11.6, 1.3, c.bone);
    spike(p, 27, 17.8, 24.2, 20.4, 1.3, c.bone);
    eye(p, 29.8, 14.8, c.eye, 0.6);
    eye(p, 29.8, 17.2, c.eye, 0.6);
  },
  golem: (p, c, f) => {
    const stones: [number, number, number][] = [[9, 8.5, 4.3], [9, 23.5, 4.3], [22, 8.5, 4.1], [22, 23.5, 4.1], [5.5, 16, 4.5], [25.5, 16, 4.9]];
    stones.forEach(([x, y, r], i) => ell(p, x + (i % 2 ? f : -f) * 0.8, y, r, r * 0.9, tint(c.dark, 0.12), 'rock'));
    ell(p, 15.5, 16, 10.2, 8.6, c.body, 'rock');
    ell(p, 12.5, 12.5, 5.2, 3, c.light, 'rock', 0.4, 0, false);
    // Glowing seams through the stone, and crystal spikes.
    for (let k = 0; k < 16; k++) {
      const t = k / 15;
      eye(p, 8.5 + t * 14, 16 + Math.sin(t * 9) * 3.2, c.eye, 0.26);
    }
    for (let k = 0; k < 3; k++) spike(p, 11 + k * 4, 11 + k, 9.5 + k * 4, 7.5 + k, 1.6, tint(c.eye, -0.2));
    eye(p, 24.8, 13.5, c.eye, 1);
    eye(p, 24.8, 18.5, c.eye, 1);
  },
  bot: (p, c, f) => {
    const st = f ? 1.8 : -1.8;
    // Jointed legs: hip, a knee plate, a foot.
    for (const [lx, sd, ph] of [[9, -1, 1], [9, 1, -1], [21, -1, -1], [21, 1, 1]]) {
      const kx = lx + st * ph * 0.5, ky = 16 + sd * 8;
      const fx = lx + st * ph, fy = 16 + sd * 11.5;
      cap(p, lx, 16 + sd * 4, kx, ky, 1.1, 1, c.metal, 'metal');
      cap(p, kx, ky, fx, fy, 1, 0.8, tint(c.metal, -0.15), 'metal');
      ell(p, kx, ky, 1.5, 1.5, tint(c.body, -0.1), 'metal');
      ell(p, fx, fy + sd * 0.3, 2, 1.5, tint(c.metal, -0.35), 'metal');
    }
    plate(p, 7, 8, 18, 16, c.body, 'metal');
    plate(p, 9, 10, 14, 12, tint(c.body, 0.14), 'metal');
    // Hazard stripes, vents, the sensor dome, twin guns.
    for (let k = 0; k < 4; k++) plate(p, 8 + k * 2.2, 22, 1, 1.4, k % 2 ? [30, 30, 30] : [224, 176, 32], 'none');
    for (let k = 0; k < 3; k++) line(p, 10, 12 + k * 1.2, 14, 12 + k * 1.2, tint(c.body, -0.45));
    ell(p, 16, 16, 4.6, 4.6, tint(c.body, -0.18), 'metal');
    ell(p, 16.8, 16, 2.4, 2.4, [30, 34, 44], 'chitin');
    eye(p, 17.6, 16, c.eye, 0.9);
    plate(p, 20, 11.5, 9, 1.8, c.metal, 'metal');
    plate(p, 20, 18.7, 9, 1.8, c.metal, 'metal');
    plate(p, 28, 11.3, 1.4, 2.2, [26, 26, 30], 'none');
    plate(p, 28, 18.5, 1.4, 2.2, [26, 26, 30], 'none');
    for (let k = 0; k < 3; k++) eye(p, 23, 13.5 + k * 2.5, c.eye, 0.3);
  },
  fish: (p, c, f) => {
    for (const sd of [-1, 1]) {
      ell(p, 12, 16 + sd * 6.5, 3.4, 2, tint(c.body, -0.2), 'membrane', 0.4, 0.5 * sd);
      spike(p, 14, 16 + sd * 4, 10, 16 + sd * 9.5, 2.6, tint(c.body, -0.25));
    }
    const ty = f ? 3 : -3;
    spike(p, 6.5, 16, 1.5, 16 + ty - 3, 3.4, tint(c.body, -0.15));
    spike(p, 6.5, 16, 1.5, 16 + ty + 3, 3.4, tint(c.body, -0.15));
    ell(p, 16, 16, 10.2, 5.3, c.body, 'scales');
    ell(p, 14, 13.8, 6.4, 1.7, c.light, 'scales', 0.4, 0, false);
    for (let k = 0; k < 5; k++) spike(p, 9 + k * 3, 16, 7.6 + k * 3, 16, 1, tint(c.dark, 0.1));
    spike(p, 25.6, 14.5, 27.8, 14.9, 0.6, c.bone);
    spike(p, 25.6, 17.5, 27.8, 17.1, 0.6, c.bone);
    eye(p, 23.5, 14.2, c.eye, 0.72);
    eye(p, 23.5, 17.8, c.eye, 0.72);
  },
  entity: (p, c, f) => {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + f * 0.4;
      for (let s = 0; s < 7; s++) {
        const t = s / 6;
        eye(p, 16 + Math.cos(a + t * 0.9) * (5 + t * 9.5), 16 + Math.sin(a + t * 0.9) * (5 + t * 9.5), tint(c.body, -0.15 - t * 0.2), 0.95 - t * 0.55);
      }
    }
    ell(p, 16, 16, 8.2, 8.2, c.body, 'glow', 1.4);
    ell(p, 16, 16, 5, 5, tint(c.light, 0.2), 'glow', 1.2, 0, false);
    ell(p, 14, 14, 2.6, 2.6, tint(c.light, 0.5), 'none', 0.6, 0, false);
    eye(p, 19, 14, c.eye, 1);
    eye(p, 19, 18, c.eye, 1);
  },
  insect: (p, c, f) => {
    const st = f ? 1.6 : -1.6;
    // Six two-jointed legs with hooked feet.
    for (const [lx, sd, ph] of [[11, -1, 1], [11, 1, -1], [16, -1, -1], [16, 1, 1], [21, -1, 1], [21, 1, -1]]) {
      const kx = lx + st * ph, ky = 16 + sd * 8;
      const fx = kx + 2.6 * (lx > 15 ? 1 : -1), fy = ky + sd * 3.6;
      cap(p, lx, 16 + sd * 2, kx, ky, 0.8, 0.7, c.dark, 'chitin');
      cap(p, kx, ky, fx, fy, 0.7, 0.4, c.dark, 'chitin');
      spike(p, fx, fy, fx + (lx > 15 ? 1 : -1), fy + sd * 0.8, 0.5, c.claw);
    }
    // Abdomen with bands, wing cases, thorax, head.
    ell(p, 8.6, 16, 7.2, 5.3, c.body, 'chitin');
    for (let k = 0; k < 3; k++) line(p, 5 + k * 2.6, 11.5, 5 + k * 2.6, 20.5, tint(c.dark, -0.2));
    ell(p, 11, 13.9, 5, 2.3, tint(c.light, -0.1), 'chitin', 0.7, -0.15);
    ell(p, 11, 18.1, 5, 2.3, tint(c.light, -0.1), 'chitin', 0.7, 0.15);
    ell(p, 17.6, 16, 3.7, 3.4, tint(c.body, -0.1), 'chitin');
    ell(p, 23, 16, 3.3, 3.1, c.body, 'chitin');
    for (const sd of [-1, 1]) {
      spike(p, 25.4, 16 + sd * 1.8, 29, 16 + sd * 0.4, 1.3, tint(c.dark, -0.1));
      line(p, 24.6, 16 + sd * 2.2, 30, 16 + sd * 6.8, c.dark);
    }
    eye(p, 24.6, 14.2, c.eye, 0.62);
    eye(p, 24.6, 17.8, c.eye, 0.62);
  },
};

const cache = new Map<string, HTMLCanvasElement>();

/** Quarter-step sizes the sprites are painted at (the view scales between them). */
export function quantizeSize(px: number): number {
  return Math.max(6, Math.round(Math.pow(2, Math.round(Math.log2(Math.max(6, px)) * 5) / 5)));
}

export function creatureHD(arch: Arch, color: string, px: number, frame: number, kind: 'normal' | 'elite' | 'boss', look: Look = ''): HTMLCanvasElement {
  const S = Math.max(6, Math.min(512, Math.round(px)));
  const key = `${arch}|${color}|${S}|${frame}|${kind}|${look}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 900) cache.clear();
  const body = rgb(color);
  const glowEye: RGB = arch === 'bot' || arch === 'vehicle' ? [255, 70, 30] : arch === 'entity' ? [220, 255, 255] : kind === 'boss' ? [255, 60, 40] : look === 'zombie' ? [230, 240, 90] : [255, 214, 60];
  const pal: Pal = {
    body,
    dark: tint(body, -0.45),
    light: tint(body, 0.32),
    eye: glowEye,
    metal: [96, 102, 116],
    bone: [226, 214, 190],
    skin: mixc(body, [200, 140, 140], 0.55),
    claw: [232, 226, 210],
  };
  const inner = makeCanvas(S, S);
  const x = ctx2d(inner);
  const img = x.createImageData(S, S);
  let seed = 0;
  for (let i = 0; i < color.length; i++) seed = (seed * 31 + color.charCodeAt(i)) | 0;
  const p: Painter = { S, u: S / 32, d: img.data, seed };
  (PLANS[arch] ?? PLANS.beast)(p, pal, frame & 1, look);
  x.putImageData(img, 0, 0);
  // Outline (magenta for elites, red for bosses), and a second ring on elites and bosses.
  const out = makeCanvas(S + 2, S + 2);
  const o = ctx2d(out);
  const sil = makeCanvas(S, S);
  const s = ctx2d(sil);
  s.drawImage(inner, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = kind === 'boss' ? '#c01818' : kind === 'elite' ? '#d500f9' : '#0b0a0e';
  s.fillRect(0, 0, S, S);
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) o.drawImage(sil, dx, dy);
  if (kind !== 'normal' && S >= 16) for (const [dx, dy] of [[0, 0], [2, 2], [0, 2], [2, 0]]) o.drawImage(sil, dx, dy);
  o.drawImage(inner, 1, 1);
  cache.set(key, out);
  return out;
}

/**
 * Paints any sprite in the creatures' style on the same 32-unit grid: `draw` builds it from the same parts, and it
 * gets the same dark outline.
 */
export function paintSprite(S: number, seed: number, draw: (p: Painter) => void, outline = '#0b0a0e'): HTMLCanvasElement {
  const inner = makeCanvas(S, S);
  const x = ctx2d(inner);
  const img = x.createImageData(S, S);
  const p: Painter = { S, u: S / 32, d: img.data, seed };
  draw(p);
  x.putImageData(img, 0, 0);
  const out = makeCanvas(S + 2, S + 2);
  const o = ctx2d(out);
  const sil = makeCanvas(S, S);
  const s = ctx2d(sil);
  s.drawImage(inner, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = outline;
  s.fillRect(0, 0, S, S);
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) o.drawImage(sil, dx, dy);
  o.drawImage(inner, 1, 1);
  return out;
}
