import { cap, ell, eye, line, paintSprite, plate, spike, tint, type Painter, type Tex } from './creaturesHD';
import { hash2, rgb, type RGB } from './pixels';

/**
 * The colossi as pixel art, top down (bow to the right), painted once into sprites with the same lit-volume painter
 * as the creatures: ramps of six tones, dithered light from the top left, dark rims, texture per material. The parts
 * that move (turrets, the worm's segments, legs, the walker's cannon) are separate sprites turned and placed every
 * frame. Every sprite is painted on a 32-unit square: `m` is how many metres one unit stands for.
 */

export interface Spr {
  img: HTMLCanvasElement;
  /** Metres per sprite pixel. */
  mpp: number;
}

const cache = new Map<string, Spr>();

function spr(key: string, metres: number, S: number, seed: number, draw: (p: Painter) => void): Spr {
  const hit = cache.get(key);
  if (hit) return hit;
  const img = paintSprite(S, seed, draw);
  const s = { img, mpp: metres / S };
  cache.set(key, s);
  return s;
}

/* ---------------------------------------------------------------------- */
/* Extra brushes                                                           */
/* ---------------------------------------------------------------------- */

function put(p: Painter, x: number, y: number, c: RGB, a = 255): void {
  if (x < 0 || y < 0 || x >= p.S || y >= p.S) return;
  const q = (y * p.S + x) * 4;
  const t = a / 255;
  p.d[q] = p.d[q] * (1 - t) + c[0] * t;
  p.d[q + 1] = p.d[q + 1] * (1 - t) + c[1] * t;
  p.d[q + 2] = p.d[q + 2] * (1 - t) + c[2] * t;
  p.d[q + 3] = Math.max(p.d[q + 3], a);
}

/**
 * A flat armour facet (any polygon, units): a base tone with grain, a dark rim, the edges facing the light picked
 * out and the far edges shaded, like the hull plates on the Titan's sheet.
 */
function facet(p: Painter, pts: [number, number][], col: RGB, k = 0, tex: Tex = 'metal'): void {
  const u = p.u;
  const P = pts.map(([x, y]) => [x * u, y * u]);
  const xs = P.map((q) => q[0]), ys = P.map((q) => q[1]);
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs)), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  const inside = (x: number, y: number): boolean => {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [xi, yi] = P[i], [xj, yj] = P[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const base = tint(col, k);
  const hi = tint(base, 0.28), lo = tint(base, -0.32), rim = tint(base, -0.72);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const up = !inside(x + 0.5, y - 0.5), left = !inside(x - 0.5, y + 0.5), down = !inside(x + 0.5, y + 1.5), right = !inside(x + 1.5, y + 0.5);
      let c: RGB;
      if (up || left || down || right) c = rim;
      else if (!inside(x + 0.5, y - 1.5) || !inside(x - 1.5, y + 0.5)) c = hi;
      else if (!inside(x + 0.5, y + 2.5) || !inside(x + 2.5, y + 0.5)) c = lo;
      else {
        const h = hash2(x, y, p.seed);
        const g = tex === 'metal' ? (h > 0.97 ? 0.12 : h < 0.03 ? -0.12 : 0) : tex === 'rock' || tex === 'chitin' ? (hash2(x >> 1, y >> 1, p.seed) - 0.5) * 0.18 : 0;
        c = tint(base, g);
      }
      put(p, x, y, c);
    }
  }
}

/** Panel seams across a facet (dark lines with a lit lip). */
function seam(p: Painter, x0: number, y0: number, x1: number, y1: number, col: RGB): void {
  line(p, x0, y0, x1, y1, tint(col, -0.6));
  const u = 1 / p.u;
  line(p, x0 + u, y0 + u, x1 + u, y1 + u, tint(col, 0.25));
}

/** Rivets along a line. */
function rivets(p: Painter, x0: number, y0: number, x1: number, y1: number, n: number, col: RGB): void {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round((x0 + (x1 - x0) * t) * p.u), y = Math.round((y0 + (y1 - y0) * t) * p.u);
    put(p, x, y, tint(col, 0.45));
    put(p, x + 1, y + 1, tint(col, -0.5));
  }
}

/** Hazard stripes in a box. */
function hazard(p: Painter, x: number, y: number, w: number, h: number): void {
  const u = p.u;
  for (let yy = Math.round(y * u); yy < Math.round((y + h) * u); yy++) {
    for (let xx = Math.round(x * u); xx < Math.round((x + w) * u); xx++) {
      put(p, xx, yy, Math.floor((xx + yy) / 4) % 2 ? rgb('#1a1612') : rgb('#e0a81e'));
    }
  }
}

/** A glowing grille (vents, reactors): dark slots with light coming through. */
function grille(p: Painter, x: number, y: number, w: number, h: number, glow: RGB, open = 1): void {
  const u = p.u;
  plate(p, x, y, w, h, rgb('#2a2a30'));
  const n = Math.max(2, Math.round((w * u) / 5));
  for (let i = 0; i < n; i++) {
    const xx = Math.round((x + (w * (i + 0.5)) / n) * u);
    for (let yy = Math.round((y + 0.4) * u); yy < Math.round((y + h - 0.4) * u); yy++) {
      put(p, xx, yy, tint(glow, -0.3 + 0.5 * open));
      put(p, xx + 1, yy, tint(glow, -0.6 + 0.4 * open));
    }
  }
}

/** A round hatch or port (rim, dark well, a glint). */
function port(p: Painter, x: number, y: number, r: number, col: RGB, inner = rgb('#0c0c10')): void {
  ell(p, x, y, r, r, col, 'metal', 0.6);
  ell(p, x, y, r * 0.62, r * 0.62, inner, 'none', 0.2, 0, false);
  eye(p, x - r * 0.25, y - r * 0.25, tint(col, 0.6), Math.max(0.08, r * 0.08));
}

/* ---------------------------------------------------------------------- */
/* The Iron Behemoth                                                       */
/* ---------------------------------------------------------------------- */

const RUST = rgb('#9a4a26'), IRON = rgb('#4a4d55'), DARK = rgb('#26282e'), BRASS = rgb('#b08a3a'), TREAD = rgb('#2c2a28');

/** The hull (320 x 150 m on 32 units: 10 m a unit), without its turret and missile racks. */
export function behemothHull(): Spr {
  return spr('beh-hull', 320, 800, 71, (p) => {
    // Tracks down both sides: long black belts with grousers.
    for (const y of [8.4, 20.4]) {
      facet(p, [[1.4, y], [30.2, y], [30.9, y + 1.6], [30.2, y + 3.2], [1.4, y + 3.2], [0.8, y + 1.6]], TREAD, 0, 'none');
      for (let x = 1.6; x < 30.2; x += 0.42) seam(p, x, y + 0.25, x, y + 2.95, TREAD);
    }
    // Drive sprockets and road wheels showing between the skirts.
    for (const y of [9.95, 21.95]) {
      for (let x = 4.5; x < 28; x += 3.1) port(p, x, y, 0.85, IRON);
      ell(p, 2.6, y, 1.45, 1.45, BRASS, 'metal', 0.8);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        spike(p, 2.6 + Math.cos(a) * 1.1, y + Math.sin(a) * 1.1, 2.6 + Math.cos(a) * 1.75, y + Math.sin(a) * 1.75, 0.5, IRON);
      }
      ell(p, 2.6, y, 0.55, 0.55, DARK, 'metal', 0.5);
    }
    // Side skirts over the tracks, in rust with hazard ends.
    for (const [y0, y1] of [[10.9, 11.9], [20.1, 21.1]]) {
      facet(p, [[3.2, y0], [28.4, y0], [29.4, y1], [2.6, y1]], RUST, -0.05);
      rivets(p, 3.6, (y0 + y1) / 2, 28.2, (y0 + y1) / 2, 40, RUST);
    }
    // The main hull: a stepped armoured deck with a ram prow.
    facet(p, [[3, 11.6], [24.5, 11.6], [30.8, 14.2], [31.6, 16], [30.8, 17.8], [24.5, 20.4], [3, 20.4], [2.2, 16]], RUST);
    // The prow's facets and ram blades.
    facet(p, [[24.5, 11.6], [30.8, 14.2], [28.2, 15.1], [24.2, 13.4]], RUST, 0.16);
    facet(p, [[24.5, 20.4], [30.8, 17.8], [28.2, 16.9], [24.2, 18.6]], RUST, -0.18);
    facet(p, [[28.2, 15.1], [31.6, 16], [28.2, 16.9], [27.4, 16]], IRON, 0.1);
    for (const s of [-1, 1]) spike(p, 30.2, 16 + s * 1.9, 32, 16 + s * 2.6, 0.9, IRON);
    hazard(p, 26, 15.3, 1.2, 1.4);
    // Deck plating: panel seams and rivets.
    for (let x = 5; x < 24; x += 3.2) seam(p, x, 11.9, x, 20.1, RUST);
    seam(p, 3.4, 16, 24, 16, RUST);
    rivets(p, 3.4, 12.1, 24, 12.1, 50, RUST);
    rivets(p, 3.4, 19.9, 24, 19.9, 50, RUST);
    // The citadel: a raised iron block forward, the command bridge on it with its lit windows.
    facet(p, [[16.6, 13], [23.4, 13], [24.4, 14.2], [24.4, 17.8], [23.4, 19], [16.6, 19], [15.8, 17.8], [15.8, 14.2]], IRON, 0.05);
    facet(p, [[17.4, 14.2], [22, 14.2], [22.6, 15], [22.6, 17], [22, 17.8], [17.4, 17.8]], IRON, 0.18);
    // The turret ring (the turret itself is drawn on top and turns).
    ell(p, 19.7, 16, 2.55, 2.55, DARK, 'metal', 0.4);
    ell(p, 19.7, 16, 2.1, 2.1, IRON, 'metal', 0.3);
    // Missile rack beds (the launchers sit on them).
    for (const y of [11.4, 20.6]) plate(p, 11.2, y - 1.2, 4, 2.4, DARK);
    // The reactor: an armoured grille aft, glowing through its slots.
    facet(p, [[7.2, 13.6], [11.4, 13.6], [12.2, 14.6], [12.2, 17.4], [11.4, 18.4], [7.2, 18.4], [6.4, 17.4], [6.4, 14.6]], IRON, -0.05);
    grille(p, 7.3, 14.4, 4, 3.2, rgb('#ff7a1a'), 0.8);
    // Smokestacks and exhausts at the stern.
    for (const y of [13.2, 18.8]) {
      port(p, 4.6, y, 0.95, IRON, rgb('#1a1008'));
      port(p, 3.2, y - 0.2 + (y > 16 ? 0.4 : -0.4), 0.6, IRON, rgb('#1a1008'));
    }
    // Raider trimmings: spikes along the skirts, a skull plate, hazard bands, scrap welded on.
    for (let x = 5; x < 27; x += 2.6) {
      spike(p, x, 11, x - 0.4, 9.9, 0.55, IRON);
      spike(p, x, 21, x - 0.4, 22.1, 0.55, IRON);
    }
    hazard(p, 14.6, 12.2, 0.8, 7.6);
    ell(p, 25.8, 16, 0.85, 0.75, rgb('#d8d0bc'), 'none', 0.9);
    for (const s of [-1, 1]) ell(p, 25.6, 16 + s * 0.32, 0.18, 0.2, rgb('#1a1612'), 'none', 0.2, 0, false);
    for (let i = 0; i < 9; i++) {
      const x = 4 + hash2(i, 1, 9) * 19, y = 12.4 + hash2(i, 2, 9) * 7.2;
      plate(p, x, y, 0.6 + hash2(i, 3, 9), 0.4 + hash2(i, 4, 9) * 0.6, tint(RUST, (hash2(i, 5, 9) - 0.5) * 0.4));
    }
    // Lamps.
    for (const [x, y] of [[29.6, 14.9], [29.6, 17.1], [23.6, 12.3], [23.6, 19.7]] as [number, number][]) eye(p, x, y, rgb('#ffe9a8'), 0.22);
    for (const [x, y] of [[3.2, 12.1], [3.2, 19.9]] as [number, number][]) eye(p, x, y, rgb('#ff3020'), 0.2);
  });
}

/** The main turret (triple heavy guns), pivot at the sprite centre, barrels toward +x. */
export function behemothTurret(): Spr {
  return spr('beh-turret', 100, 250, 72, (p) => {
    // Three barrels.
    for (const y of [14.4, 16, 17.6]) {
      plate(p, 16, y - 0.42, 14.5, 0.84, IRON);
      plate(p, 28.6, y - 0.6, 2, 1.2, DARK);
    }
    // The house: an angled armoured box.
    facet(p, [[8, 10.4], [19.6, 10.4], [22.4, 13], [22.4, 19], [19.6, 21.6], [8, 21.6], [6.4, 19.2], [6.4, 12.8]], RUST, 0.04);
    facet(p, [[10, 12.2], [18.6, 12.2], [20.4, 14], [20.4, 18], [18.6, 19.8], [10, 19.8]], RUST, 0.2);
    port(p, 11.6, 14.4, 1, IRON);
    grille(p, 13.8, 17.2, 4.4, 1.6, rgb('#ff7a1a'), 0.4);
    hazard(p, 7.2, 13, 0.7, 6);
    eye(p, 21.4, 16, rgb('#ff3020'), 0.3);
  });
}

/** A missile rack: a box launcher with two rows of tubes. */
export function behemothRack(): Spr {
  return spr('beh-rack', 44, 132, 73, (p) => {
    facet(p, [[6, 9], [26, 9], [27.5, 11], [27.5, 21], [26, 23], [6, 23], [4.5, 21], [4.5, 11]], IRON, 0.05);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) port(p, 8.4 + k * 3.3, 11.8 + r * 4.2, 1.25, DARK, rgb('#3a0a04'));
    hazard(p, 5, 9.4, 1, 13.2);
  });
}

/* ---------------------------------------------------------------------- */
/* The Sand Leviathan                                                      */
/* ---------------------------------------------------------------------- */

const SAND = rgb('#b48a58'), HIDE = rgb('#6e4e34'), BONE = rgb('#e2d6b8'), ACID = rgb('#9aff3a');

/** One body segment (about 18 x 70 m; the long axis across the body), lit from the top left. */
export function leviathanSegment(v: number): Spr {
  return spr(`lev-seg${v}`, 80, 200, 80 + v, (p) => {
    ell(p, 16, 16, 7.2, 14.2, HIDE, 'chitin', 0.9);
    ell(p, 16.4, 16, 5.6, 12.6, SAND, 'scales', 1);
    // Armour ridge down the back and the ring's plates.
    for (let y = 5; y <= 27; y += 3.1) facet(p, [[14.2, y], [18.4, y + 0.3], [18.8, y + 2.2], [14, y + 2.4]], tint(SAND, 0.12), 0, 'rock');
    for (const y of [9, 16, 23]) spike(p, 16.6, y, 19.6 + (v % 2), y - 0.8, 1.2, BONE);
    for (const s of [-1, 1]) spike(p, 16, 16 + s * 13.4, 15 + (v % 3) * 0.3, 16 + s * 15.8, 1.3, BONE);
  });
}

/** A gill vent on a segment: a glowing slit (when it's still there to shoot). */
export function leviathanGill(): Spr {
  return spr('lev-gill', 40, 100, 86, (p) => {
    ell(p, 16, 16, 7, 12, tint(HIDE, -0.2), 'membrane', 0.5);
    for (const d of [-4, 0, 4]) {
      facet(p, [[12, 16 + d - 0.6], [20, 16 + d - 1], [20.6, 16 + d + 0.3], [12.4, 16 + d + 0.8]], rgb('#1a2a10'), 0, 'none');
      line(p, 12.8, 16 + d, 19.8, 16 + d - 0.4, ACID);
    }
  });
}

/** The head: an armoured crown, mandibles, and the round maw with rings of teeth. */
export function leviathanHead(open: number): Spr {
  return spr(`lev-head${open}`, 100, 250, 88, (p) => {
    ell(p, 14, 16, 9, 12.5, HIDE, 'chitin', 0.9);
    // Crown plates.
    facet(p, [[6, 8], [16, 6.4], [20, 9], [18.6, 12.6], [8, 12.4]], tint(SAND, 0.1), 0, 'rock');
    facet(p, [[6, 24], [16, 25.6], [20, 23], [18.6, 19.4], [8, 19.6]], tint(SAND, -0.08), 0, 'rock');
    // Mandibles, parted as it opens.
    for (const s of [-1, 1]) {
      spike(p, 20, 16 + s * 6, 29.5, 16 + s * (2.2 + open * 3.5), 3.2, BONE);
      spike(p, 21, 16 + s * 4, 27, 16 + s * (1 + open * 2.2), 2, tint(BONE, -0.15));
    }
    // The maw.
    ell(p, 22.4, 16, 3.6 + open * 1.4, 5.2 + open * 1.8, rgb('#2a0a08'), 'none', 0.3);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      spike(p, 22.4 + Math.cos(a) * (3.4 + open), 16 + Math.sin(a) * (5 + open * 1.4), 22.4 + Math.cos(a) * 1.8, 16 + Math.sin(a) * 2.6, 0.6, BONE);
    }
    ell(p, 22.4, 16, 1.4, 2, rgb('#ff4a20'), 'glow', 0.4, 0, false);
    // Pits for eyes: a row of glowing dots.
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) eye(p, 12 + k * 1.6, 16 + s * (7.6 - k * 0.5), rgb('#ffb030'), 0.28);
  });
}

/** The tail: tapering, ending in a barbed spike. */
export function leviathanTail(): Spr {
  return spr('lev-tail', 100, 250, 89, (p) => {
    ell(p, 18, 16, 8, 7, HIDE, 'chitin', 0.9);
    ell(p, 18.4, 16, 6.4, 5.6, SAND, 'scales', 1);
    spike(p, 12, 16, 1, 16, 5, BONE);
    for (const s of [-1, 1]) spike(p, 9, 16 + s * 1.6, 5, 16 + s * 4.4, 1.6, BONE);
  });
}

/* ---------------------------------------------------------------------- */
/* The Hive Mother                                                         */
/* ---------------------------------------------------------------------- */

const CHITIN = rgb('#5e2e74'), PLUM = rgb('#8e4aa8'), SAC = rgb('#b8e04a'), GLAND = rgb('#62ff8a');

/** The body: a bloated abdomen with the egg sacs, the thorax, and the head with its mandibles (legs drawn apart). */
export function hiveBody(): Spr {
  return spr('hive-body', 300, 780, 91, (p) => {
    // Abdomen (aft), banded.
    ell(p, 11, 16, 9.4, 8.2, CHITIN, 'chitin', 1);
    for (let k = 0; k < 5; k++) {
      const x = 4.6 + k * 2.6;
      facet(p, [[x, 10 + Math.abs(k - 2) * 0.5], [x + 1.4, 9.4 + Math.abs(k - 2) * 0.5], [x + 1.4, 22.6 - Math.abs(k - 2) * 0.5], [x, 22 - Math.abs(k - 2) * 0.5]], PLUM, 0, 'chitin');
    }
    // Thorax.
    ell(p, 20.4, 16, 4.4, 5.4, CHITIN, 'chitin', 1.1);
    facet(p, [[17.6, 13], [23, 12.6], [24.2, 16], [23, 19.4], [17.6, 19]], PLUM, 0.1, 'chitin');
    for (const s of [-1, 1]) spike(p, 20.4, 16 + s * 4.4, 21.6, 16 + s * 6.4, 1.2, tint(CHITIN, 0.3));
    // Head: crown, eyes, mandibles.
    ell(p, 26.4, 16, 2.8, 3.6, CHITIN, 'chitin', 1);
    for (const s of [-1, 1]) {
      spike(p, 27.8, 16 + s * 2, 31.4, 16 + s * 0.5, 1.6, tint(PLUM, 0.35));
      for (let k = 0; k < 3; k++) eye(p, 26.4 + k * 0.7, 16 + s * (1.2 + k * 0.5), rgb('#ff3a5a'), 0.25);
    }
    // Spiracles down the abdomen, breathing a little green.
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) eye(p, 6 + k * 3, 16 + s * 6.6, rgb('#7aff5a'), 0.2);
  });
}

/** An egg sac: translucent, glowing, with the brood curled inside. */
export function hiveSac(): Spr {
  return spr('hive-sac', 40, 100, 93, (p) => {
    ell(p, 16, 16, 12, 11, SAC, 'membrane', 0.8);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      ell(p, 16 + Math.cos(a) * 5, 16 + Math.sin(a) * 4.6, 2.6, 2, tint(SAC, -0.35), 'skin', 0.6, a);
    }
    eye(p, 13, 12, rgb('#f6ffcc'), 0.8);
  });
}

/** The acid gland: a swollen bladder, bright and ready to spit. */
export function hiveGland(): Spr {
  return spr('hive-gland', 32, 96, 94, (p) => {
    ell(p, 16, 16, 11, 10, GLAND, 'membrane', 0.8);
    ell(p, 16, 16, 5, 4.5, tint(GLAND, 0.4), 'glow', 0.6, 0, false);
  });
}

/** A leg segment (long axis toward +x), jointed: the thigh or the shin with its hooked foot. */
export function hiveLeg(foot: boolean): Spr {
  return spr(`hive-leg${foot ? 1 : 0}`, 110, 240, foot ? 95 : 96, (p) => {
    cap(p, 3, 16, 27, 16, 2.2, foot ? 1.3 : 1.9, CHITIN, 'chitin');
    for (let k = 0; k < 4; k++) spike(p, 7 + k * 5, 15, 8.4 + k * 5, 13.4, 0.8, tint(PLUM, 0.3));
    if (foot) spike(p, 26, 16, 31, 17.4, 2, tint(PLUM, 0.4));
    else ell(p, 27, 16, 2.4, 2.4, PLUM, 'chitin', 1);
  });
}

/* ---------------------------------------------------------------------- */
/* The Storm Walker                                                        */
/* ---------------------------------------------------------------------- */

const STEEL = rgb('#5a6e82'), NAVY = rgb('#243448'), CYAN = rgb('#40e0ff'), WHITE = rgb('#e8f6ff');

/** The hub (120 m across), seen from above: armour petals round a capacitor ring. */
export function walkerHub(): Spr {
  return spr('walk-hub', 140, 420, 101, (p) => {
    ell(p, 16, 16, 13, 13, NAVY, 'metal', 0.8);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.2;
      const pts: [number, number][] = [];
      for (const [r, da] of [[5.6, -0.42], [12.4, -0.3], [13.4, 0], [12.4, 0.3], [5.6, 0.42]] as [number, number][]) pts.push([16 + Math.cos(a + da) * r, 16 + Math.sin(a + da) * r]);
      facet(p, pts, STEEL, k % 2 ? 0.08 : -0.04);
      seam(p, 16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, STEEL);
    }
    // The capacitor ring: bright coils round the core well.
    ell(p, 16, 16, 5.4, 5.4, rgb('#101820'), 'metal', 0.3);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      eye(p, 16 + Math.cos(a) * 4.6, 16 + Math.sin(a) * 4.6, CYAN, 0.35);
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      eye(p, 16 + Math.cos(a) * 12.2, 16 + Math.sin(a) * 12.2, rgb('#ffb030'), 0.22);
    }
  });
}

/** The capacitor core, open (a bright cell) or shut (an armoured iris). */
export function walkerCore(open: boolean): Spr {
  return spr(`walk-core${open ? 1 : 0}`, 40, 120, 102, (p) => {
    if (open) {
      ell(p, 16, 16, 12, 12, CYAN, 'glow', 0.8);
      ell(p, 16, 16, 6, 6, WHITE, 'glow', 0.6, 0, false);
    } else {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        facet(p, [[16, 16], [16 + Math.cos(a) * 12.5, 16 + Math.sin(a) * 12.5], [16 + Math.cos(a + 0.78) * 12.5, 16 + Math.sin(a + 0.78) * 12.5]], STEEL, k % 2 ? 0.1 : -0.1);
      }
      eye(p, 16, 16, CYAN, 0.8);
    }
  });
}

/** A leg (long axis toward +x): a girder with hydraulics, the knee joint, and the foot pad. */
export function walkerLeg(): Spr {
  return spr('walk-leg', 200, 400, 103, (p) => {
    plate(p, 2, 14.6, 26, 2.8, STEEL);
    plate(p, 4, 15.4, 22, 1.2, NAVY);
    for (let x = 5; x < 26; x += 2.6) line(p, x, 14.8, x + 1.3, 17.2, tint(STEEL, 0.3));
    cap(p, 6, 13.6, 20, 13.8, 0.7, 0.6, rgb('#c0c8d0'), 'metal');
    ell(p, 28.4, 16, 3, 3, NAVY, 'metal', 0.9);
    ell(p, 28.4, 16, 1.6, 1.6, STEEL, 'metal', 0.6);
  });
}

/** The lightning cannon (pivot at the centre, barrel toward +x): coils and a forked emitter. */
export function walkerCannon(): Spr {
  return spr('walk-cannon', 90, 270, 104, (p) => {
    facet(p, [[6, 11.4], [16, 10.4], [19, 13], [19, 19], [16, 21.6], [6, 20.6], [4.6, 16]], STEEL, 0.05);
    plate(p, 16, 14.4, 11.6, 3.2, NAVY);
    for (let x = 17; x < 27; x += 1.6) ell(p, x, 16, 0.6, 2.2, rgb('#c08030'), 'metal', 0.8);
    for (const s of [-1, 1]) spike(p, 26.6, 16 + s * 1.4, 31, 16 + s * 2.4, 1.1, WHITE);
    eye(p, 27.4, 16, CYAN, 0.6);
  });
}

/** The storm coil on the back (a tesla tower seen from above). */
export function walkerCoil(): Spr {
  return spr('walk-coil', 40, 120, 105, (p) => {
    for (let r = 12; r > 3; r -= 2.6) ell(p, 16, 16, r, r, r % 5 < 2.6 ? rgb('#c08030') : STEEL, 'metal', 0.7);
    eye(p, 16, 16, CYAN, 1.4);
  });
}

/** Everything painted up front (so the first colossus doesn't hitch the frame when it arrives). */
export function prewarmColossi(): void {
  behemothHull();
  behemothTurret();
  behemothRack();
  for (let v = 0; v < 3; v++) leviathanSegment(v);
  leviathanGill();
  leviathanHead(0);
  leviathanHead(1);
  leviathanTail();
  hiveBody();
  hiveSac();
  hiveGland();
  hiveLeg(false);
  hiveLeg(true);
  walkerHub();
  walkerCore(false);
  walkerCore(true);
  walkerLeg();
  walkerCannon();
  walkerCoil();
}
