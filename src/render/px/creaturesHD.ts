import type { Arch } from '../../game/enemyDefs';
import { ctx2d, hash2, makeCanvas, rgb, type RGB } from './pixels';

/**
 * Creatures in high-resolution pixel art, from above, facing right. Every body is built from lit volumes: each
 * pixel of a body part is shaded as a point on a rounded 3D surface under the north-west sun (so a beast's flank
 * rolls from highlight to shadow, a boulder reads as a boulder), with a surface texture for what it's made of
 * (fur, scales, chitin, plate, rock, cloth), a darker occluded rim, specular glints, eyes that glow, and a dark
 * outline. Legs stride and wings beat over two frames. Painted on a 32-unit grid at the size it's shown.
 */

type Tex = 'none' | 'fur' | 'scales' | 'chitin' | 'metal' | 'rock' | 'cloth' | 'skin' | 'membrane' | 'glow';

interface Painter {
  S: number;
  u: number;
  d: Uint8ClampedArray;
  seed: number;
}

/** Toward the sun in sprite space (x right, y down, z up). */
const L = (() => {
  const v = [-0.55, -0.55, 0.63];
  const n = Math.hypot(v[0], v[1], v[2]);
  return v.map((k) => k / n);
})();

function put(p: Painter, x: number, y: number, c: RGB, a = 255): void {
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

function texK(p: Painter, tex: Tex, x: number, y: number, dx: number, dy: number): number {
  const h = hash2(x, y, p.seed);
  switch (tex) {
    case 'fur': return 0.9 + 0.2 * hash2(x, Math.floor(y / 2), p.seed + 1) + (h > 0.9 ? 0.08 : 0);
    case 'scales': {
      const g = Math.max(2, Math.round(p.u * 1.6));
      const sx = (x + (Math.floor(y / g) % 2) * (g >> 1)) % g, sy = y % g;
      // Overlapping scales: a dark lower rim on each, a light upper edge, a little jitter.
      return (sy === g - 1 ? 0.84 : sy === 0 ? 1.08 : 1) * (sx === 0 && h > 0.4 ? 0.92 : 1) * (0.95 + 0.1 * h);
    }
    case 'chitin': return 1 + (Math.abs(Math.sin(dx * 9)) < 0.18 ? -0.22 : 0) + (h - 0.5) * 0.06;
    case 'metal': {
      const g = Math.max(3, Math.round(p.u * 4));
      return x % g === 0 || y % g === 0 ? 0.8 : 1 + (h > 0.97 ? 0.25 : 0);
    }
    case 'rock': return 0.82 + 0.3 * hash2(Math.floor(x / 2), Math.floor(y / 2), p.seed + 3) + (h > 0.95 ? -0.2 : 0);
    case 'cloth': return 0.93 + 0.1 * hash2(Math.floor(x / 2), y, p.seed + 5);
    case 'skin': return 0.96 + 0.08 * h;
    case 'membrane': return 0.85 + 0.1 * Math.sin((dx + dy) * 6);
    default: return 1;
  }
}

/** A lit rounded volume (ellipsoid seen from above) in units; `lift` raises the dome (flatter < 1). */
function ell(p: Painter, cx: number, cy: number, rx: number, ry: number, col: RGB, tex: Tex = 'none', lift = 1, rot = 0): void {
  const u = p.u;
  const X = cx * u, Y = cy * u, RX = Math.max(0.6, rx * u), RY = Math.max(0.6, ry * u);
  const R = Math.max(RX, RY);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let y = Math.floor(Y - R); y <= Math.ceil(Y + R); y++) {
    for (let x = Math.floor(X - R); x <= Math.ceil(X + R); x++) {
      const ox = x + 0.5 - X, oy = y + 0.5 - Y;
      const lx = (ox * cr + oy * sr) / RX, ly = (-ox * sr + oy * cr) / RY;
      const d2 = lx * lx + ly * ly;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2) * lift;
      // Normal back into sprite axes.
      const nx = lx * cr - ly * sr, ny = lx * sr + ly * cr;
      const n = Math.hypot(nx, ny, nz) || 1;
      const lam = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / n);
      let k = (0.32 + 0.95 * lam) * texK(p, tex, x, y, lx, ly);
      if (d2 > 0.82) k *= 0.8;
      const spec = lam > 0.94 && tex !== 'fur' && tex !== 'cloth' ? (lam - 0.94) * 12 : 0;
      put(p, x, y, [
        Math.min(255, col[0] * k + 255 * spec),
        Math.min(255, col[1] * k + 255 * spec),
        Math.min(255, col[2] * k + 255 * spec),
      ]);
    }
  }
}

/** A limb or tail: a chain of small volumes from one point to another. */
function cap(p: Painter, x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, col: RGB, tex: Tex = 'none'): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(2, Math.ceil((len * p.u) / Math.max(1, Math.min(r0, r1) * p.u * 0.8)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = r0 + (r1 - r0) * t;
    ell(p, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r, col, tex);
  }
}

/** A flat bevelled plate (hulls, armour): lit top edge, shaded bottom edge, panel lines. */
function plate(p: Painter, x: number, y: number, w: number, h: number, col: RGB, tex: Tex = 'metal'): void {
  const u = p.u;
  const x0 = Math.round(x * u), y0 = Math.round(y * u), x1 = Math.round((x + w) * u), y1 = Math.round((y + h) * u);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      let k = texK(p, tex, xx, yy, 0, 0);
      if (yy === y0 || xx === x0) k *= 1.3;
      else if (yy === y1 - 1 || xx === x1 - 1) k *= 0.62;
      put(p, xx, yy, [Math.min(255, col[0] * k), Math.min(255, col[1] * k), Math.min(255, col[2] * k)]);
    }
  }
}

/** A glowing point (eyes, lamps) with a soft halo. */
function eye(p: Painter, x: number, y: number, col: RGB, r = 0.9): void {
  const u = p.u;
  const X = x * u, Y = y * u, R = Math.max(0.7, r * u);
  for (let yy = Math.floor(Y - R * 2.2); yy <= Math.ceil(Y + R * 2.2); yy++) {
    for (let xx = Math.floor(X - R * 2.2); xx <= Math.ceil(X + R * 2.2); xx++) {
      const dd = Math.hypot(xx + 0.5 - X, yy + 0.5 - Y) / R;
      if (dd <= 1) put(p, xx, yy, dd < 0.5 ? [255, 255, 235] : col);
      else if (dd < 2.2) put(p, xx, yy, col, Math.round(90 * (1 - (dd - 1) / 1.2)));
    }
  }
}

function tint(c: RGB, k: number): RGB {
  return k >= 0 ? [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k] : [c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)];
}

type Plan = (p: Painter, c: { body: RGB; dark: RGB; light: RGB; eye: RGB; metal: RGB }, f: number) => void;

const PLANS: Record<Arch, Plan> = {
  swarm: (p, c, f) => {
    cap(p, 3, 16 + f, 9, 16, 0.6, 1, c.dark, 'skin');
    for (const [lx, ly, s] of [[12, 11.5, 1], [18, 11.5, -1], [12, 20.5, -1], [18, 20.5, 1]]) cap(p, lx, 16 + (ly - 16) * 0.6, lx + (f ? s : -s) * 1.5, ly, 0.8, 0.7, c.dark);
    ell(p, 15, 16, 7, 4.8, c.body, 'fur');
    ell(p, 23, 16, 4.2, 3.4, c.body, 'fur');
    ell(p, 21, 12.8, 1.5, 1.3, c.light, 'skin');
    ell(p, 21, 19.2, 1.5, 1.3, c.light, 'skin');
    ell(p, 27, 16, 1.2, 1, tint(c.body, -0.3), 'skin');
    eye(p, 24.8, 14.6, c.eye, 0.6);
    eye(p, 24.8, 17.4, c.eye, 0.6);
  },
  canine: (p, c, f) => {
    cap(p, 2, 16 + (f ? 2 : -2), 8, 16, 0.8, 1.4, c.body, 'fur');
    const st = f ? 2.5 : -2.5;
    for (const [lx, sd, ph] of [[10, -1, 1], [10, 1, -1], [20, -1, -1], [20, 1, 1]]) cap(p, lx, 16 + sd * 3, lx + st * ph, 16 + sd * 7.5, 1.3, 1, c.dark, 'fur');
    ell(p, 15, 16, 9, 4.8, c.body, 'fur');
    ell(p, 12, 14.5, 4, 1.6, c.light, 'fur', 0.5);
    ell(p, 25.5, 16, 4.6, 4, c.body, 'fur');
    ell(p, 29.5, 16, 2.6, 2, tint(c.body, 0.1), 'fur');
    for (const sd of [-1, 1]) cap(p, 24, 16 + sd * 3, 22.5, 16 + sd * 5.5, 1, 0.5, c.dark);
    eye(p, 27, 14.2, c.eye, 0.65);
    eye(p, 27, 17.8, c.eye, 0.65);
  },
  beast: (p, c, f) => {
    cap(p, 1.5, 16 + (f ? 1.5 : -1.5), 6, 16, 1, 2.4, c.dark, 'scales');
    const st = f ? 2 : -2;
    for (const [lx, sd, ph] of [[8, -1, 1], [8, 1, -1], [22, -1, -1], [22, 1, 1]]) ell(p, lx + st * ph, 16 + sd * 10, 3.2, 2.6, c.dark, 'scales');
    ell(p, 15, 16, 12.5, 9, c.body, 'scales');
    ell(p, 12, 12, 7, 3, c.light, 'scales', 0.5);
    for (let k = 0; k < 5; k++) ell(p, 6 + k * 4.2, 16, 1.2, 1.2, tint(c.light, 0.2), 'none', 1.5);
    ell(p, 28, 16, 4.6, 5.2, c.body, 'scales');
    for (const sd of [-1, 1]) cap(p, 29, 16 + sd * 3.5, 31.5, 16 + sd * 6.5, 1, 0.4, [226, 214, 190]);
    eye(p, 29.5, 13.8, c.eye, 0.8);
    eye(p, 29.5, 18.2, c.eye, 0.8);
  },
  humanoid: (p, c, f) => {
    const st = f ? 2.2 : -2.2;
    ell(p, 14 + st, 12, 2.2, 1.8, c.dark, 'cloth');
    ell(p, 14 - st, 20, 2.2, 1.8, c.dark, 'cloth');
    ell(p, 13, 16, 2.8, 3.4, tint(c.dark, 0.2), 'cloth');
    ell(p, 15.5, 16, 3.6, 6.8, c.body, 'cloth');
    ell(p, 14.5, 13, 1.6, 2.2, c.light, 'cloth', 0.5);
    cap(p, 16, 9.5, 22, 12.5, 1.4, 1.2, c.body, 'cloth');
    cap(p, 16, 22.5, 22, 19.5, 1.4, 1.2, c.body, 'cloth');
    plate(p, 20, 15, 10, 2, c.metal, 'metal');
    ell(p, 22, 12.5, 1.2, 1.2, [214, 170, 130], 'skin');
    ell(p, 22, 19.5, 1.2, 1.2, [214, 170, 130], 'skin');
    ell(p, 16.5, 16, 3.4, 3.4, tint(c.body, -0.35), 'cloth', 1.2);
    ell(p, 17.2, 16, 2.4, 2.6, tint(c.light, -0.1), 'skin', 1.2);
    eye(p, 19, 15, c.eye, 0.45);
    eye(p, 19, 17, c.eye, 0.45);
  },
  vehicle: (p, c, f) => {
    for (const [wx, wy] of [[7, 7], [7, 25], [24, 7], [24, 25]]) {
      ell(p, wx, wy, 3.4, 2.6, [22, 22, 26], 'none', 0.6);
      for (let k = 0; k < 3; k++) plate(p, wx - 3 + ((k * 2 + f) % 6), wy - 2.4, 0.6, 4.8, [48, 50, 56], 'none');
    }
    plate(p, 3, 8.5, 26, 15, c.body, 'metal');
    plate(p, 5, 10.5, 12, 11, tint(c.body, -0.2), 'metal');
    plate(p, 17, 11, 7, 10, [60, 110, 150], 'none');
    plate(p, 17.5, 11.5, 6, 2, [150, 210, 240], 'none');
    ell(p, 10, 16, 3.6, 3.6, tint(c.body, 0.15), 'metal');
    plate(p, 11, 15.3, 13, 1.4, c.metal, 'metal');
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
      ell(p, x, y, r, r, k % 2 ? c.body : tint(c.body, -0.12), 'chitin');
      ell(p, x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.4, c.light, 'none', 0.4);
    }
    ell(p, 27.5, 16, 4.4, 4.4, tint(c.body, -0.1), 'chitin');
    ell(p, 28.5, 16, 2.8, 2.8, [30, 8, 10], 'none', 0.3);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ell(p, 28.5 + Math.cos(a) * 2.6, 16 + Math.sin(a) * 2.6, 0.5, 0.5, [240, 230, 210], 'none');
    }
  },
  flyer: (p, c, f) => {
    const spread = f ? 1 : 0.62;
    for (const sd of [-1, 1]) {
      // Wing membrane: a fan of bones with skin between.
      for (let k = 0; k < 4; k++) {
        const tipX = 8 + k * 4, tipY = 16 + sd * (13 * spread - k * 1.2);
        cap(p, 16, 16 + sd * 2, tipX, tipY, 0.9, 0.5, tint(c.dark, 0.1), 'membrane');
      }
      ell(p, 13, 16 + sd * 8 * spread, 6, 5 * spread, tint(c.body, -0.2), 'membrane', 0.3);
      cap(p, 16, 16 + sd * 2, 8, 16 + sd * 13 * spread, 0.6, 0.4, c.dark);
    }
    ell(p, 15, 16, 5.5, 3.6, c.body, 'fur');
    ell(p, 20.5, 16, 3, 2.6, c.body, 'fur');
    eye(p, 22, 14.9, c.eye, 0.5);
    eye(p, 22, 17.1, c.eye, 0.5);
  },
  dragon: (p, c, f) => {
    const spread = f ? 1 : 0.7;
    cap(p, 1, 16 + (f ? 2 : -2), 9, 16, 0.7, 2.4, c.body, 'scales');
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 4; k++) cap(p, 15, 16 + sd * 3, 6 + k * 3.5, 16 + sd * (14 * spread - k * 1.4), 1, 0.5, tint(c.dark, 0.1), 'membrane');
      ell(p, 11, 16 + sd * 9 * spread, 7, 5.5 * spread, tint(c.body, -0.25), 'membrane', 0.3);
    }
    ell(p, 14, 16, 7.5, 5, c.body, 'scales');
    cap(p, 20, 16, 26, 16, 2.4, 1.8, c.body, 'scales');
    ell(p, 28.5, 16, 3.2, 2.6, c.body, 'scales');
    for (const sd of [-1, 1]) cap(p, 27, 16 + sd * 2, 24.5, 16 + sd * 4, 0.8, 0.3, [230, 220, 200]);
    for (let k = 0; k < 4; k++) ell(p, 9 + k * 3, 16, 0.9, 0.9, tint(c.light, 0.3), 'none', 1.5);
    eye(p, 29.8, 14.8, c.eye, 0.6);
    eye(p, 29.8, 17.2, c.eye, 0.6);
  },
  golem: (p, c, f) => {
    const stones: [number, number, number][] = [[9, 9, 4.2], [9, 23, 4.2], [22, 9, 4], [22, 23, 4], [6, 16, 4.5], [25, 16, 4.8]];
    stones.forEach(([x, y, r], i) => ell(p, x + (i % 2 ? f : -f) * 0.8, y, r, r * 0.9, tint(c.dark, 0.1), 'rock'));
    ell(p, 15.5, 16, 10, 8.5, c.body, 'rock');
    ell(p, 12.5, 12.5, 5, 3, c.light, 'rock', 0.4);
    // Glowing cracks.
    for (let k = 0; k < 14; k++) {
      const t = k / 13;
      eye(p, 9 + t * 13, 16 + Math.sin(t * 9) * 3, c.eye, 0.28);
    }
    eye(p, 24.5, 13.5, c.eye, 1);
    eye(p, 24.5, 18.5, c.eye, 1);
  },
  bot: (p, c, f) => {
    const st = f ? 1.8 : -1.8;
    for (const [lx, sd, ph] of [[9, -1, 1], [9, 1, -1], [21, -1, -1], [21, 1, 1]]) {
      cap(p, lx, 16 + sd * 4, lx + st * ph, 16 + sd * 11, 1.1, 1.1, c.metal, 'metal');
      ell(p, lx + st * ph, 16 + sd * 11.5, 2, 1.6, tint(c.metal, -0.3), 'metal');
    }
    plate(p, 7, 8, 18, 16, c.body, 'metal');
    plate(p, 9, 10, 14, 12, tint(c.body, 0.12), 'metal');
    ell(p, 16, 16, 4.5, 4.5, tint(c.body, -0.15), 'metal');
    plate(p, 17, 7, 10, 2, c.metal, 'metal');
    plate(p, 17, 23, 10, 2, c.metal, 'metal');
    for (let k = 0; k < 4; k++) eye(p, 22.5, 12.2 + k * 2.5, c.eye, 0.42);
  },
  fish: (p, c, f) => {
    for (const sd of [-1, 1]) cap(p, 14, 16 + sd * 4, 10, 16 + sd * 9, 1.4, 0.5, tint(c.body, -0.2), 'membrane');
    cap(p, 2, 16 + (f ? 3 : -3), 7, 16, 2.4, 1.2, tint(c.body, -0.15), 'membrane');
    ell(p, 16, 16, 10, 5.2, c.body, 'scales');
    ell(p, 14, 13.6, 6, 1.6, c.light, 'scales', 0.4);
    eye(p, 23.5, 14.3, c.eye, 0.7);
    eye(p, 23.5, 17.7, c.eye, 0.7);
  },
  entity: (p, c, f) => {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + f * 0.4;
      for (let s = 0; s < 6; s++) {
        const t = s / 5;
        eye(p, 16 + Math.cos(a + t * 0.8) * (5 + t * 9), 16 + Math.sin(a + t * 0.8) * (5 + t * 9), tint(c.body, -0.2), 0.9 - t * 0.5);
      }
    }
    ell(p, 16, 16, 8, 8, c.body, 'glow', 1.4);
    ell(p, 14, 14, 3, 3, tint(c.light, 0.4), 'none', 0.6);
    eye(p, 19, 14, c.eye, 1);
    eye(p, 19, 18, c.eye, 1);
  },
  insect: (p, c, f) => {
    const st = f ? 1.6 : -1.6;
    for (const [lx, sd, ph] of [[11, -1, 1], [11, 1, -1], [16, -1, -1], [16, 1, 1], [21, -1, 1], [21, 1, -1]]) {
      const kx = lx + st * ph, ky = 16 + sd * 8;
      cap(p, lx, 16 + sd * 2, kx, ky, 0.8, 0.7, c.dark, 'chitin');
      cap(p, kx, ky, kx + 2.5 * (lx > 15 ? 1 : -1), ky + sd * 3.5, 0.7, 0.4, c.dark, 'chitin');
    }
    ell(p, 9, 16, 7, 5.2, c.body, 'chitin');
    ell(p, 7.5, 14.2, 3.4, 1.4, c.light, 'none', 0.4);
    ell(p, 17.5, 16, 3.6, 3.3, tint(c.body, -0.1), 'chitin');
    ell(p, 23, 16, 3.2, 3, c.body, 'chitin');
    for (const sd of [-1, 1]) {
      cap(p, 25.5, 16 + sd * 1.6, 28.5, 16 + sd * 0.6, 0.7, 0.4, tint(c.dark, -0.2));
      cap(p, 24.5, 16 + sd * 2, 29.5, 16 + sd * 6, 0.25, 0.2, c.dark);
    }
    eye(p, 24.5, 14.2, c.eye, 0.6);
    eye(p, 24.5, 17.8, c.eye, 0.6);
  },
};

const cache = new Map<string, HTMLCanvasElement>();

/** Quarter-step sizes the sprites are painted at (the view scales between them). */
export function quantizeSize(px: number): number {
  return Math.max(6, Math.round(Math.pow(2, Math.round(Math.log2(Math.max(6, px)) * 5) / 5)));
}

export function creatureHD(arch: Arch, color: string, px: number, frame: number, kind: 'normal' | 'elite' | 'boss'): HTMLCanvasElement {
  const S = Math.max(6, Math.min(512, Math.round(px)));
  const key = `${arch}|${color}|${S}|${frame}|${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 900) cache.clear();
  const body = rgb(color);
  const glowEye: RGB = arch === 'bot' || arch === 'vehicle' ? [255, 70, 30] : arch === 'entity' ? [220, 255, 255] : kind === 'boss' ? [255, 60, 40] : [255, 220, 60];
  const pal = { body, dark: tint(body, -0.45), light: tint(body, 0.35), eye: glowEye, metal: [92, 98, 110] as RGB };
  const inner = makeCanvas(S, S);
  const x = ctx2d(inner);
  const img = x.createImageData(S, S);
  let seed = 0;
  for (let i = 0; i < color.length; i++) seed = (seed * 31 + color.charCodeAt(i)) | 0;
  const p: Painter = { S, u: S / 32, d: img.data, seed };
  (PLANS[arch] ?? PLANS.beast)(p, pal, frame & 1);
  x.putImageData(img, 0, 0);
  // Outline (magenta for elites, red for bosses), and a faint aura on bosses.
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
