import { MODULES } from '../../game/defs';
import type { Game } from '../../game/game';
import { compIndex } from '../../game/systems/titan';
import type { ModuleInst, Tank } from '../../game/tank';
import { RARITIES } from '../../shared/rarity';
import { WEAPONS } from '../../shared/weapons';
import { ctx2d, hash2, hex, makeCanvas, rgb } from './pixels';
import type { HullLight, Painted } from './titan2d';

/**
 * The Titan Crawler in high-resolution pixel art, after the reference sheets: a long, dark, faceted war machine.
 *
 *  - Seen from above in 3/4: it's painted as stacked layers (the crawler treads, the armoured hull sides, the
 *    deck, the raised citadel and the command block on top), and the view stacks them with height, so its flanks
 *    show: panel seams, a blue light band, lit windows.
 *  - The prow is a wedge of chevron armour plates flaring over the treads, around a raised nose with a glowing
 *    slot and a grille. Every facet is lit from the sun as the ship turns.
 *  - Blue light strips run down the flanks; red-lit missile boxes, antenna masts, hatches, vents; the stern has the
 *    radiator grille, the "07" number, exhaust stacks and two engine pods.
 *  - Roof guns are drawn where they're mounted, turn to their targets and recoil; the main battery's barrels run
 *    out over the nose with red laser sights.
 *
 * Painted in hull metres (forward +x, starboard +y) at the size it's shown; the static parts are cached per zoom,
 * facing and state, the moving parts drawn over them every frame.
 */

export interface StackBand {
  /** Height (m) this band starts at. */
  z: number;
  canvas: HTMLCanvasElement;
}

export interface StackLayer {
  z0: number;
  z1: number;
  /** The layer seen from above (drawn at z1). */
  top: HTMLCanvasElement;
  /** Side colour bands, bottom to top. */
  sides: StackBand[];
}

export interface PaintedHD extends Painted {
  layers: StackLayer[];
  /** Changes whenever the cached hull (and so its stacked sides) is rebuilt. */
  key: string;
  /** Full footprint silhouette for the ground shadow. */
  shadow: HTMLCanvasElement;
}

const PAD = 24;

interface Pal {
  d0: string; d1: string; d2: string; d3: string; d4: string; d5: string; d6: string; d7: string; hi: string; spec: string;
  glow: string; glowHi: string; red: string; amber: string; decal: string; tread: string; treadHi: string; glass: string;
}

const PLAYER: Pal = {
  d0: '#07090d', d1: '#11151c', d2: '#1a1f28', d3: '#252b36', d4: '#313946', d5: '#3e4757', d6: '#4f5a6d', d7: '#687790', hi: '#8fa3c2', spec: '#c8d8ee',
  glow: '#3ab4ff', glowHi: '#b8e8ff', red: '#ff3a30', amber: '#ffb13a', decal: '#d6dee8', tread: '#0b0c0f', treadHi: '#3a404a', glass: '#123040',
};
const RIVAL: Pal = { ...PLAYER, d3: '#2c2124', d4: '#3a2a30', d5: '#48343b', d6: '#5a414a', d7: '#76545f', hi: '#a88290', glow: '#ff3b30', glowHi: '#ffc0b8', decal: '#ffd0c8' };
const REMOTE: Pal = { ...PLAYER, glow: '#e040fb', glowHi: '#f8c8ff' };
const CLASS_GLOW: Record<string, string> = { juggernaut: '#3ab4ff', bastion: '#ffd740', ark: '#76ff03', nightrunner: '#b388ff', dredge: '#ffab40' };

/** Light from the north-west, fairly high: a unit vector toward the sun, in world axes (x east, y south, z up). */
const SUN = (() => {
  const v = [-0.5, -0.62, 0.6];
  const n = Math.hypot(v[0], v[1], v[2]);
  return v.map((k) => k / n);
})();

function scaleHex(c: string, k: number): string {
  const [r, g, b] = rgb(c);
  return hex([r * k, g * k, b * k]);
}

function mixHex(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

interface Cache {
  key: string;
  roof: HTMLCanvasElement;
  tracksSil: HTMLCanvasElement;
  bodySil: HTMLCanvasElement;
  citSil: HTMLCanvasElement;
  towerSil: HTMLCanvasElement;
  bands: { tracks: StackBand[]; body: StackBand[]; cit: StackBand[]; tower: StackBand[] };
  cit: HTMLCanvasElement;
  tower: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
}

const caches = new WeakMap<Tank, Cache>();
const frames = new WeakMap<Tank, { roof: HTMLCanvasElement; tracks: HTMLCanvasElement; tower: HTMLCanvasElement }>();

/** Heights (m): tread tops, the deck, the citadel roof, the command block roof. */
export const HULL_Z = { tracks: 14, deck: 38, citadel: 44, tower: 54 };

export function paintTitanHD(t: Tank, ppm: number, g: Game | null, time: number): PaintedHD {
  const L = t.stats.length, W = t.stats.width;
  const hl = L / 2, hw = W / 2;
  const cw = Math.ceil((L + PAD * 2) * ppm), chh = Math.ceil((W + PAD * 2) * ppm);
  const ox = (hl + PAD) * ppm, oy = (hw + PAD) * ppm;
  const base = t.kind === 'rival' ? RIVAL : t.kind === 'remote' ? REMOTE : PLAYER;
  const pal: Pal = t.kind === 'main' && CLASS_GLOW[t.klass] ? { ...base, glow: CLASS_GLOW[t.klass], glowHi: mixHex(CLASS_GLOW[t.klass], '#ffffff', 0.6) } : base;
  // The sun in hull axes.
  const c0 = Math.cos(t.rot), s0 = Math.sin(t.rot);
  const sun = [SUN[0] * c0 + SUN[1] * s0, -SUN[0] * s0 + SUN[1] * c0, SUN[2]];
  const hpB = Math.floor((t.hp / Math.max(1, t.stats.maxHp)) * 8);
  const rotB = Math.round((t.rot * 180) / Math.PI / 10);
  const zones = g && t === g.player ? Object.values(g.titan.zones).map((v) => Math.floor(v * 4)).join('') : '';
  const key = `${Math.round(ppm * 16)}|${t.version}|${t.klass}|${t.kind}|${hpB}|${rotB}|${zones}|${cw}x${chh}`;
  let cache = caches.get(t);
  if (!cache || cache.key !== key) {
    cache = buildStatic(t, ppm, g, pal, sun, key, cw, chh, ox, oy, hl, hw);
    caches.set(t, cache);
  }
  // Per frame: the treads, the guns, the lights and everything that moves, over the cached hull.
  let fr = frames.get(t);
  if (!fr) {
    fr = { roof: makeCanvas(cw, chh), tracks: makeCanvas(cw, chh), tower: makeCanvas(cw, chh) };
    frames.set(t, fr);
  }
  for (const c of [fr.roof, fr.tracks, fr.tower]) if (c.width !== cw || c.height !== chh) {
    c.width = cw;
    c.height = chh;
  }
  const lights: HullLight[] = [];
  paintTracks(fr.tracks, t, ppm, g, pal, ox, oy, hl, hw, time);
  const rx = ctx2d(fr.roof);
  rx.setTransform(1, 0, 0, 1, 0, 0);
  rx.clearRect(0, 0, cw, chh);
  rx.drawImage(cache.roof, 0, 0);
  paintDynamic(rx, t, ppm, g, pal, ox, oy, hl, hw, time, lights);
  const tx = ctx2d(fr.tower);
  tx.setTransform(1, 0, 0, 1, 0, 0);
  tx.clearRect(0, 0, cw, chh);
  tx.drawImage(cache.tower, 0, 0);
  towerDynamic(tx, t, ppm, pal, ox, oy, hl, hw, time, lights);
  // Hit flash / wreck tint over everything that's drawn per frame.
  if (t.hitFlash > 0 || t.dead) {
    for (const c of [fr.roof, fr.tracks, fr.tower]) {
      const x = ctx2d(c);
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = t.dead ? 'rgba(20,16,14,0.65)' : `rgba(255,255,255,${Math.min(0.45, t.hitFlash * 3)})`;
      x.fillRect(0, 0, cw, chh);
      x.globalCompositeOperation = 'source-over';
    }
  }
  const layers: StackLayer[] = [
    { z0: 0, z1: HULL_Z.tracks, top: fr.tracks, sides: cache.bands.tracks },
    { z0: HULL_Z.tracks, z1: HULL_Z.deck, top: fr.roof, sides: cache.bands.body },
    { z0: HULL_Z.deck, z1: HULL_Z.citadel, top: cache.cit, sides: cache.bands.cit },
    { z0: HULL_Z.citadel, z1: HULL_Z.tower, top: fr.tower, sides: cache.bands.tower },
  ];
  return { canvas: fr.roof, cx: ox, cy: oy, lights: t.dead ? [] : lights, layers, shadow: cache.shadow, key: cache.key };
}

/* ---------------------------------------------------------------------- */
/* Geometry                                                                */
/* ---------------------------------------------------------------------- */

type Pt = [number, number];

/** The hull's outline (fractions of half-length and half-width), port side bow to stern then starboard back. */
function bodyOutline(): Pt[] {
  const port: Pt[] = [[1.0, -0.16], [0.93, -0.46], [0.8, -0.74], [0.62, -0.88], [0.4, -0.7], [-0.9, -0.7], [-0.97, -0.62]];
  return [...port, ...port.slice().reverse().map(([x, y]) => [x, -y] as Pt)];
}

/** Treads: four units a side, from the bow shoulders to the stern. */
function trackUnits(L: number, W: number): { x0: number; len: number; y0: number; w: number; side: number; i: number }[] {
  const out = [];
  const len = L * 0.2, gap = (L * 0.86 - len * 4) / 3, w = W * 0.15;
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1, k = i % 4;
    const x0 = L * 0.4 - len - k * (len + gap);
    out.push({ x0, len, y0: side < 0 ? -W / 2 : W / 2 - w, w, side, i });
  }
  return out;
}

/** The raised citadel down the middle, and the command block on it. */
const CIT = { x0: -0.58, x1: 0.34, y: 0.2 };
const TOWER = { x0: -0.36, x1: -0.08, y: 0.24 };

/* ---------------------------------------------------------------------- */
/* Static parts (cached)                                                   */
/* ---------------------------------------------------------------------- */

function buildStatic(t: Tank, ppm: number, g: Game | null, pal: Pal, sun: number[], key: string, cw: number, chh: number, ox: number, oy: number, hl: number, hw: number): Cache {
  const L = hl * 2, W = hw * 2;
  const roof = makeCanvas(cw, chh);
  const x = ctx2d(roof);
  x.setTransform(ppm, 0, 0, ppm, ox, oy);
  const P = (fx: number, fy: number): Pt => [fx * hl, fy * hw];
  const px = 1 / ppm;
  /** A lit facet: base colour times the sun on its normal (with a cool rim when it catches the light). */
  const lit = (col: string, n: number[]): string => {
    const len = Math.hypot(n[0], n[1], n[2]);
    const d = (n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]) / len;
    const k = 0.42 + 1.0 * Math.max(0, d);
    const c = scaleHex(col, k);
    return k > 1.05 ? mixHex(c, pal.spec, Math.min(0.35, (k - 1.05) * 1.2)) : c;
  };
  const poly = (pts: Pt[], col: string): void => {
    x.fillStyle = col;
    x.beginPath();
    pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    x.closePath();
    x.fill();
  };
  const edge = (a: Pt, b: Pt, col: string, w = px): void => {
    x.strokeStyle = col;
    x.lineWidth = w;
    x.beginPath();
    x.moveTo(a[0], a[1]);
    x.lineTo(b[0], b[1]);
    x.stroke();
  };
  const R = (x0: number, y0: number, w: number, h: number, col: string): void => {
    x.fillStyle = col;
    x.fillRect(x0, y0, w, h);
  };
  const detail = ppm >= 1.2;
  const fine = ppm >= 2.2;

  /* ---- The hull body ---- */
  const outline = bodyOutline().map(([a, b]) => P(a, b));
  poly(outline, pal.d2);
  // Side armour slopes: segmented plates leaning outward, a blue strip along the outer edge.
  for (const side of [-1, 1]) {
    const seg = 9;
    for (let m = -0.9 * hl; m < 0.4 * hl; m += seg) {
      const a = Math.max(-0.9 * hl, m), b = Math.min(0.4 * hl, m + seg - 0.6);
      const k = hash2(Math.round(m), side, 11) * 0.08 - 0.04;
      const col = lit(scaleHex(pal.d5, 1 + k), [0, side * 0.7, 0.7]);
      poly([[a, side * 0.58 * hw], [b, side * 0.58 * hw], [b, side * 0.7 * hw], [a, side * 0.7 * hw]], col);
      if (detail) {
        R(a, side > 0 ? 0.7 * hw - px : -0.7 * hw, b - a, px, lit(pal.d6, [0, side, 0.3]));
        if (hash2(Math.round(m), side, 3) > 0.6) R(a + 2, side * 0.64 * hw - 0.6, 1.4, 1.2, pal.d1);
      }
    }
  }
  // The deck: plates in lanes, each a touch different, bevelled toward the sun.
  const flat = lit(pal.d5, [0, 0, 1]);
  const lanes = [-0.58, -0.4, -0.22, 0, 0.22, 0.4, 0.58];
  for (let li = 0; li < lanes.length - 1; li++) {
    const ya = lanes[li] * hw, yb = lanes[li + 1] * hw;
    const pl = li % 2 ? 11 : 14;
    for (let m = -0.62 * hl + (li % 2 ? 5 : 0); m < 0.4 * hl; m += pl) {
      const a = Math.max(-0.62 * hl, m), b = Math.min(0.4 * hl, m + pl);
      if (b - a < 1) continue;
      const v = hash2(Math.round(m * 3), li, t.id) * 0.1 - 0.05;
      const col = scaleHex(flat, 1 + v);
      R(a + 0.3, ya + 0.3, b - a - 0.6, yb - ya - 0.6, col);
      if (detail) {
        // Bevel: the edges facing the sun light up, the far ones fall into shadow.
        const lx = sun[0] > 0 ? b - 0.3 - px : a + 0.3, ly = sun[1] > 0 ? yb - 0.3 - px : ya + 0.3;
        R(a + 0.3, ly, b - a - 0.6, px, scaleHex(col, 1.35));
        R(lx, ya + 0.3, px, yb - ya - 0.6, scaleHex(col, 1.2));
        R(a + 0.3, sun[1] > 0 ? ya + 0.3 : yb - 0.3 - px, b - a - 0.6, px, scaleHex(col, 0.62));
        if (fine) for (const [rx, ry] of [[1, 1], [b - a - 1.8, 1], [1, yb - ya - 1.8], [b - a - 1.8, yb - ya - 1.8]]) R(a + rx, ya + ry, 0.5, 0.5, scaleHex(col, 0.6));
        // Weathering: grime streaks and the odd scorch.
        if (hash2(Math.round(m), li, 77) > 0.8) R(a + (b - a) * hash2(li, Math.round(m), 5), ya + 1, 0.5, (yb - ya) * 0.6, 'rgba(0,0,0,0.25)');
      }
    }
  }

  /* ---- The prow: chevron plates flaring over the treads, around the raised nose ---- */
  const prowFacets = (s: number): { pts: Pt[]; n: number[] }[] => [
    { pts: [P(0.4, -0.7 * s), P(0.62, -0.88 * s), P(0.64, -0.6 * s), P(0.4, -0.58 * s)], n: [0.15, -0.75 * s, 0.65] },
    { pts: [P(0.62, -0.88 * s), P(0.8, -0.74 * s), P(0.76, -0.54 * s), P(0.64, -0.6 * s)], n: [0.55, -0.55 * s, 0.6] },
    { pts: [P(0.4, -0.58 * s), P(0.64, -0.6 * s), P(0.62, -0.32 * s), P(0.4, -0.3 * s)], n: [0.1, -0.35 * s, 0.93] },
    { pts: [P(0.64, -0.6 * s), P(0.76, -0.54 * s), P(0.86, -0.32 * s), P(0.62, -0.32 * s)], n: [0.45, -0.3 * s, 0.84] },
    { pts: [P(0.8, -0.74 * s), P(0.93, -0.46 * s), P(0.86, -0.32 * s), P(0.76, -0.54 * s)], n: [0.8, -0.45 * s, 0.4] },
    { pts: [P(0.93, -0.46 * s), P(1.0, -0.16 * s), P(0.96, -0.15 * s), P(0.86, -0.32 * s)], n: [0.9, -0.2 * s, 0.35] },
    { pts: [P(0.4, -0.3 * s), P(0.62, -0.32 * s), P(0.6, -0.15 * s), P(0.4, -0.15 * s)], n: [0.05, -0.15 * s, 1] },
    { pts: [P(0.62, -0.32 * s), P(0.86, -0.32 * s), P(0.96, -0.15 * s), P(0.6, -0.15 * s)], n: [0.4, -0.12 * s, 0.9] },
  ];
  for (const s of [1, -1]) {
    for (const f of prowFacets(s)) {
      const col = lit(pal.d6, f.n);
      poly(f.pts, col);
      if (detail) {
        // Plate texture: a darker inset panel and a bright lip on the edge that faces the sun.
        const cx = f.pts.reduce((a, q) => a + q[0], 0) / f.pts.length, cy = f.pts.reduce((a, q) => a + q[1], 0) / f.pts.length;
        poly(f.pts.map(([a, b]) => [cx + (a - cx) * 0.62, cy + (b - cy) * 0.62] as Pt), scaleHex(col, 0.86));
        for (let i = 0; i < f.pts.length; i++) {
          const a = f.pts[i], b = f.pts[(i + 1) % f.pts.length];
          // Edge normal (outward in the plane) against the sun: lit lips, dark seams.
          const ex = b[0] - a[0], ey = b[1] - a[1];
          const nx = ey, ny = -ex;
          const facing = (nx * sun[0] + ny * sun[1]) * (cx - a[0] > 0 ? -1 : 1);
          edge(a, b, facing > 0 ? mixHex(col, pal.spec, 0.55) : pal.d0, px * (facing > 0 ? 1.2 : 1));
        }
      }
    }
    // Light slits on the plates, and a lit leading edge.
    if (detail) {
      edge(P(0.62, -0.88 * s), P(0.8, -0.74 * s), lit(pal.hi, [0.5, -0.5 * s, 0.7]), px * 1.5);
      for (const [fx, fy] of [[0.58, -0.66], [0.7, -0.58], [0.8, -0.44], [0.9, -0.3], [0.52, -0.42], [0.72, -0.36], [0.48, -0.22], [0.66, -0.22]]) {
        R(fx * hl - 1.3, fy * s * hw - 0.45, 2.6, 0.9, pal.glow);
        R(fx * hl - 0.6, fy * s * hw - 0.2, 1.2, 0.4, pal.glowHi);
      }
    }
  }
  // The nose: a raised block with a glowing slot and the grille.
  poly([P(0.52, -0.15), P(0.97, -0.15), P(1.02, -0.08), P(1.02, 0.08), P(0.97, 0.15), P(0.52, 0.15)], lit(pal.d6, [0.2, 0, 1]));
  if (detail) {
    R(0.54 * hl, -0.1 * hw, 0.24 * hl, 0.2 * hw, lit(pal.d5, [0, 0, 1]));
    for (const yy of [-0.1, 0.1]) R(0.54 * hl, yy * hw - 0.3, 0.42 * hl, 0.6, lit(pal.d7, [0, 0, 1]));
  }
  poly([P(0.97, -0.15), P(1.02, -0.08), P(1.02, 0.08), P(0.97, 0.15)], lit(pal.d4, [1, 0, 0.3]));
  if (detail) {
    R(0.8 * hl, -0.07 * hw, 0.14 * hl, 0.14 * hw, pal.d0);
    R(0.81 * hl, -0.012 * hw, 0.12 * hl, 0.024 * hw + px, pal.glow);
    for (let yy = -0.13; yy < 0.13; yy += 0.035) R(0.955 * hl, yy * hw, 0.05 * hl, px * 1.2, pal.d0);
    edge(P(0.52, -0.15), P(0.97, -0.15), lit(pal.hi, [0, -1, 0.5]), px);
    edge(P(0.52, 0.15), P(0.97, 0.15), lit(pal.hi, [0, 1, 0.5]), px);
  }
  // Headlight clusters on the cheeks.
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) R((0.9 - k * 0.02) * hl, s * (0.36 + k * 0.035) * hw - 0.45, 0.9, 0.9, '#fff6d8');

  /* ---- The stern: radiator grille, exhaust stacks, the "07", engine pods ---- */
  poly([P(-0.97, -0.62), P(-0.62, -0.62), P(-0.62, 0.62), P(-0.97, 0.62)], lit(pal.d4, [0, 0, 1]));
  R(-0.93 * hl, -0.42 * hw, 0.26 * hl, 0.84 * hw, pal.d1);
  if (detail) {
    for (let m = -0.925 * hl; m < -0.67 * hl; m += 1.3) R(m, -0.4 * hw, 0.55, 0.8 * hw, lit(pal.d5, [0.3, 0, 0.9]));
    R(-0.93 * hl, -0.42 * hw, 0.26 * hl, px, pal.d6);
  }
  // Engine pods: two long cylinders past the stern corners.
  for (const s of [-1, 1]) {
    const y0 = s * 0.52 * hw;
    for (let k = 0; k < 5; k++) {
      const f = k / 4;
      R(-1.1 * hl, y0 - 3 + f * 6 * (1 - 0.15), 0.18 * hl, 6 / 5 + 0.05, lit(pal.d5, [0, (f - 0.5) * 1.6, 0.8]));
    }
    R(-1.1 * hl, y0 - 3, 0.02 * hl, 6, pal.d0);
    if (detail) for (let m = -1.08 * hl; m < -0.93 * hl; m += 3) R(m, y0 - 3, 0.3, 6, pal.d1);
  }
  // Hull number, big on the stern deck and on the citadel.
  decal(x, '07', -0.58 * hl, 0.3 * hw, 9, pal.decal, true);

  /* ---- Deck furniture: hatches, vents, missile boxes, pipes ---- */
  if (detail) {
    for (const s of [-1, 1]) {
      // Missile boxes with their red lamps.
      for (const fx of [0.18, -0.14]) {
        const bx = fx * hl, by = s * 0.44 * hw;
        R(bx - 4.5, by - 3, 9, 6, pal.d1);
        R(bx - 4, by - 2.5, 8, 5, lit(pal.d5, [0, 0, 1]));
        R(bx - 4, by - 2.5, 8, px, pal.d7);
        for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) R(bx - 3.2 + a * 2, by - 1.8 + b * 1.4, 0.7, 0.7, a + b === 3 ? '#ff8a70' : pal.red);
      }
      // Pipes.
      R(-0.6 * hl, s * 0.52 * hw - 0.5, 0.95 * hl, 1, pal.d1);
      R(-0.6 * hl, s * 0.52 * hw - 0.5, 0.95 * hl, px, pal.d6);
      // Hatches.
      for (const fx of [-0.44, -0.02, 0.28]) {
        const hx = fx * hl, hy = s * 0.3 * hw;
        R(hx - 2.5, hy - 2.5, 5, 5, pal.d1);
        R(hx - 2, hy - 2, 4, 4, lit(pal.d5, [0, 0, 1]));
        if (fine) {
          R(hx - 0.2, hy - 2, 0.4, 4, pal.d2);
          R(hx - 2, hy - 0.2, 4, 0.4, pal.d2);
        }
      }
      // Vents.
      for (const fx of [-0.3, 0.1]) for (let k = 0; k < 4; k++) R(fx * hl + k * 1.4, s * 0.12 * hw - (s < 0 ? 4 : 0), 0.7, 4, pal.d0);
    }
  }

  /* ---- The citadel (raised spine) and the command block, as their own layers ---- */
  const cit = makeCanvas(cw, chh);
  const cx = ctx2d(cit);
  cx.setTransform(ppm, 0, 0, ppm, ox, oy);
  const cpoly = (pts: Pt[], col: string): void => {
    cx.fillStyle = col;
    cx.beginPath();
    pts.forEach(([a, b], i) => (i ? cx.lineTo(a, b) : cx.moveTo(a, b)));
    cx.closePath();
    cx.fill();
  };
  const cy0 = CIT.y * hw;
  cpoly([P(CIT.x1 + 0.04, 0), P(CIT.x1, -CIT.y), P(CIT.x0, -CIT.y), P(CIT.x0 - 0.02, 0), P(CIT.x0, CIT.y), P(CIT.x1, CIT.y)], lit(pal.d6, [0, 0, 1]));
  // Sloped sides of the citadel roof, lit or shaded.
  for (const s of [-1, 1]) {
    cx.fillStyle = lit(pal.d5, [0, s * 0.8, 0.6]);
    cx.fillRect(CIT.x0 * hl, s > 0 ? cy0 - 2.2 : -cy0, (CIT.x1 - CIT.x0) * hl, 2.2);
  }
  // The skylight down the Spine, and the octagonal hatch.
  cx.fillStyle = pal.glass;
  cx.fillRect(CIT.x0 * hl + 3, -0.1 * hw, (CIT.x1 - CIT.x0) * hl - 6, 0.2 * hw);
  if (detail) {
    cx.fillStyle = mixHex(pal.glass, pal.glowHi, 0.35);
    for (let m = CIT.x0 * hl + 5; m < CIT.x1 * hl - 4; m += 6) cx.fillRect(m, -0.08 * hw, 1.2, 0.16 * hw);
    cx.fillStyle = pal.d1;
    for (let m = CIT.x0 * hl + 3; m < CIT.x1 * hl - 3; m += 12) cx.fillRect(m, -0.1 * hw, 0.6, 0.2 * hw);
  }
  const octX = 0.06 * hl;
  const oct = (r: number): Pt[] => Array.from({ length: 8 }, (_, i) => [octX + Math.cos((i + 0.5) * Math.PI / 4) * r, Math.sin((i + 0.5) * Math.PI / 4) * r] as Pt);
  cpoly(oct(0.19 * hw), pal.d1);
  cpoly(oct(0.17 * hw), lit(pal.d6, [0, 0, 1]));
  cpoly(oct(0.1 * hw), lit(pal.d4, [0, 0, 1]));
  cpoly(oct(0.05 * hw), pal.d1);
  if (detail) {
    decalTo(cx, '07', 0.22 * hl, -0.02 * hw, 4.5, pal.decal, false);
    cx.fillStyle = pal.red;
    for (const [a, b] of [[CIT.x1 - 0.03, -0.16], [CIT.x1 - 0.03, 0.16], [CIT.x0 + 0.02, -0.16], [CIT.x0 + 0.02, 0.16]]) cx.fillRect(a * hl, b * hw - 0.4, 0.8, 0.8);
  }

  const tower = makeCanvas(cw, chh);
  const wx = ctx2d(tower);
  wx.setTransform(ppm, 0, 0, ppm, ox, oy);
  const tpoly = (pts: Pt[], col: string): void => {
    wx.fillStyle = col;
    wx.beginPath();
    pts.forEach(([a, b], i) => (i ? wx.lineTo(a, b) : wx.moveTo(a, b)));
    wx.closePath();
    wx.fill();
  };
  // The command block: an angular armoured box, its front sloped, a glazed band facing forward.
  tpoly([P(TOWER.x1 + 0.03, -TOWER.y * 0.6), P(TOWER.x1, -TOWER.y), P(TOWER.x0, -TOWER.y), P(TOWER.x0, TOWER.y), P(TOWER.x1, TOWER.y), P(TOWER.x1 + 0.03, TOWER.y * 0.6)], lit(pal.d6, [0, 0, 1]));
  tpoly([P(TOWER.x1, -TOWER.y), P(TOWER.x1 + 0.03, -TOWER.y * 0.6), P(TOWER.x1 + 0.03, TOWER.y * 0.6), P(TOWER.x1, TOWER.y)], lit(pal.d4, [0.8, 0, 0.6]));
  wx.fillStyle = lit(pal.d7, [0, 0, 1]);
  wx.fillRect((TOWER.x0 + 0.04) * hl, -TOWER.y * 0.7 * hw, (TOWER.x1 - TOWER.x0 - 0.08) * hl, TOWER.y * 1.4 * hw);
  wx.fillStyle = pal.glass;
  wx.fillRect((TOWER.x1 - 0.015) * hl, -TOWER.y * 0.8 * hw, 0.02 * hl, TOWER.y * 1.6 * hw);
  if (detail) {
    wx.fillStyle = pal.d1;
    for (let k = 0; k < 3; k++) wx.fillRect((TOWER.x0 + 0.06 + k * 0.07) * hl, -TOWER.y * 0.5 * hw, 3, TOWER.y * hw);
    wx.fillStyle = pal.glow;
    wx.fillRect((TOWER.x0 + 0.02) * hl, -TOWER.y * hw + 0.4, (TOWER.x1 - TOWER.x0 - 0.04) * hl, 0.5);
    wx.fillRect((TOWER.x0 + 0.02) * hl, TOWER.y * hw - 0.9, (TOWER.x1 - TOWER.x0 - 0.04) * hl, 0.5);
  }

  /* ---- Battle damage (worn zones crack, the hull scorches as it loses health) ---- */
  const hpFrac = Math.max(0, t.hp / Math.max(1, t.stats.maxHp));
  const scorch = Math.floor((1 - hpFrac) * 18);
  for (let k = 0; k < scorch; k++) {
    const sx = (-0.9 + hash2(k, t.id, 3) * 1.8) * hl, sy = (hash2(k, t.id, 5) - 0.5) * 1.2 * hw;
    const r = 2 + hash2(k, t.id, 9) * 6;
    x.fillStyle = 'rgba(10,8,6,0.5)';
    x.beginPath();
    x.ellipse(sx, sy, r, r * 0.7, k, 0, Math.PI * 2);
    x.fill();
    if (k % 3 === 0) {
      x.fillStyle = 'rgba(255,110,40,0.3)';
      x.fillRect(sx - r * 0.2, sy - r * 0.2, r * 0.4, r * 0.4);
    }
  }
  if (g && t === g.player) {
    const z = g.titan.zones;
    const crack = (x0: number, y0: number, x1: number, y1: number, worn: number): void => {
      if (worn > 0.5) return;
      x.strokeStyle = '#050403';
      x.lineWidth = px * 1.2;
      const n = Math.ceil((0.5 - worn) * 16);
      for (let k = 0; k < n; k++) {
        const a = x0 + hash2(k, 11) * (x1 - x0), b = y0 + hash2(k, 13) * (y1 - y0);
        x.beginPath();
        x.moveTo(a, b);
        x.lineTo(a + (hash2(k, 17) - 0.5) * 9, b + (hash2(k, 19) - 0.5) * 6);
        x.lineTo(a + (hash2(k, 23) - 0.5) * 14, b + (hash2(k, 29) - 0.5) * 9);
        x.stroke();
      }
    };
    crack(0.4 * hl, -0.8 * hw, hl, 0.8 * hw, z.bow);
    crack(-hl, -0.6 * hw, -0.6 * hl, 0.6 * hw, z.stern);
    crack(-0.9 * hl, -0.7 * hw, 0.4 * hl, -0.5 * hw, z.port);
    crack(-0.9 * hl, 0.5 * hw, 0.4 * hl, 0.7 * hw, z.starboard);
    crack(-0.6 * hl, -0.3 * hw, 0.3 * hl, 0.3 * hw, z.roof);
  }
  // A dark rim around the whole top so it reads against any ground.
  outline1(roof, pal.d0);

  /* ---- Silhouettes for the stacked sides and the shadow ---- */
  const sil = (draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement => {
    const c = makeCanvas(cw, chh);
    const k = ctx2d(c);
    k.setTransform(ppm, 0, 0, ppm, ox, oy);
    k.fillStyle = '#fff';
    draw(k);
    return c;
  };
  const polyOn = (k: CanvasRenderingContext2D, pts: Pt[]): void => {
    k.beginPath();
    pts.forEach(([a, b], i) => (i ? k.lineTo(a, b) : k.moveTo(a, b)));
    k.closePath();
    k.fill();
  };
  const units = trackUnits(L, W);
  const tracksSil = sil((k) => {
    for (const u of units) k.fillRect(u.x0, u.y0, u.len, u.w);
    k.fillRect(-0.86 * hl, -hw + 1, 1.26 * hl, W - 2);
  });
  const bodySil = sil((k) => polyOn(k, outline));
  const citSil = sil((k) => k.fillRect(CIT.x0 * hl, -CIT.y * hw, (CIT.x1 - CIT.x0) * hl, CIT.y * 2 * hw));
  const towerSil = sil((k) => k.fillRect(TOWER.x0 * hl, -TOWER.y * hw, (TOWER.x1 - TOWER.x0) * hl, TOWER.y * 2 * hw));
  const shadow = sil((k) => {
    polyOn(k, outline);
    for (const u of units) k.fillRect(u.x0, u.y0, u.len, u.w);
  });
  tint(shadow, '#000');
  /** A side band: the silhouette in a colour, with seams (diagonal stripes cross every edge) and optional lamps. */
  const band = (s: HTMLCanvasElement, col: string, seams: string | null, lamps: string | null = null, every = 7): HTMLCanvasElement => {
    const c = makeCanvas(cw, chh);
    const k = ctx2d(c);
    k.drawImage(s, 0, 0);
    k.globalCompositeOperation = 'source-in';
    k.fillStyle = col;
    k.fillRect(0, 0, cw, chh);
    // Everything after paints only where the silhouette is (and leaves the rest alone).
    k.globalCompositeOperation = 'source-atop';
    if (seams) {
      k.fillStyle = seams;
      const step = Math.max(4, Math.round(every * ppm));
      for (let d = -chh; d < cw; d += step) {
        k.beginPath();
        k.moveTo(d, 0);
        k.lineTo(d + 1, 0);
        k.lineTo(d + 1 + chh, chh);
        k.lineTo(d + chh, chh);
        k.fill();
      }
    }
    if (lamps) {
      k.fillStyle = lamps;
      const step = Math.max(5, Math.round(5 * ppm));
      for (let yy = 0; yy < chh; yy += 2) for (let xx = (yy * 3) % step; xx < cw; xx += step) k.fillRect(xx, yy, 2, 1);
    }
    k.globalCompositeOperation = 'source-over';
    return c;
  };
  const bands = {
    tracks: [
      { z: 0, canvas: band(tracksSil, pal.tread, pal.treadHi, null, 2.4) },
      { z: 10, canvas: band(tracksSil, pal.d2, pal.d0, null, 9) },
    ],
    body: [
      { z: HULL_Z.tracks, canvas: band(bodySil, pal.d1, null) },
      { z: 17, canvas: band(bodySil, pal.d3, pal.d1, null, 9) },
      { z: 27, canvas: band(bodySil, pal.glow, null) },
      { z: 27.8, canvas: band(bodySil, pal.d3, pal.d1, null, 9) },
      { z: 32, canvas: band(bodySil, pal.d4, pal.d2, null, 13) },
      { z: 36.8, canvas: band(bodySil, pal.d6, null) },
    ],
    cit: [
      { z: HULL_Z.deck, canvas: band(citSil, pal.d3, pal.d1, null, 6) },
      { z: 40.5, canvas: band(citSil, pal.d2, null, pal.amber) },
      { z: 41.5, canvas: band(citSil, pal.d4, pal.d2, null, 6) },
    ],
    tower: [
      { z: HULL_Z.citadel, canvas: band(towerSil, pal.d3, pal.d1, null, 5) },
      { z: 49, canvas: band(towerSil, pal.glass, null, pal.glowHi) },
      { z: 51, canvas: band(towerSil, pal.d4, pal.d2, null, 5) },
      { z: 53.4, canvas: band(towerSil, pal.d6, null) },
    ],
  };
  return { key, roof, tracksSil, bodySil, citSil, towerSil, bands, cit, tower, shadow };
}

/** Fills everything drawn on a canvas with one colour. */
function tint(c: HTMLCanvasElement, col: string): void {
  const k = ctx2d(c);
  k.setTransform(1, 0, 0, 1, 0, 0);
  k.globalCompositeOperation = 'source-in';
  k.fillStyle = col;
  k.fillRect(0, 0, c.width, c.height);
  k.globalCompositeOperation = 'source-over';
}

let rimTmp: HTMLCanvasElement | null = null;

/** A one-pixel dark rim behind what's drawn. */
function outline1(c: HTMLCanvasElement, col: string): void {
  if (!rimTmp) rimTmp = document.createElement('canvas');
  rimTmp.width = c.width;
  rimTmp.height = c.height;
  const s = rimTmp.getContext('2d')!;
  s.drawImage(c, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = col;
  s.fillRect(0, 0, c.width, c.height);
  const k = ctx2d(c);
  k.setTransform(1, 0, 0, 1, 0, 0);
  k.globalCompositeOperation = 'destination-over';
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) k.drawImage(rimTmp, dx, dy);
  k.globalCompositeOperation = 'source-over';
}

const DIG: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
};

function decalTo(x: CanvasRenderingContext2D, s: string, cx: number, cy: number, h: number, col: string, sideways: boolean): void {
  const u = h / 5;
  x.fillStyle = col;
  for (let k = 0; k < s.length; k++) {
    const rows = DIG[s[k]];
    if (!rows) continue;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (rows[r][c] !== '1') continue;
      // Read from the side of the hull: the digits run along the hull, turned a quarter.
      if (sideways) x.fillRect(cx + (4 - r) * u - 2.5 * u, cy - s.length * 2 * u + k * 4 * u + c * u, u, u);
      else x.fillRect(cx - s.length * 2 * u + k * 4 * u + c * u, cy - 2.5 * u + r * u, u, u);
    }
  }
}
const decal = decalTo;

/* ---------------------------------------------------------------------- */
/* Per frame                                                               */
/* ---------------------------------------------------------------------- */

function paintTracks(c: HTMLCanvasElement, t: Tank, ppm: number, g: Game | null, pal: Pal, ox: number, oy: number, hl: number, hw: number, time: number): void {
  const x = ctx2d(c);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, c.width, c.height);
  x.setTransform(ppm, 0, 0, ppm, ox, oy);
  const L = hl * 2, W = hw * 2;
  const px = 1 / ppm;
  // The belly between the treads (seen from above only where the hull doesn't cover it: the bow and stern).
  x.fillStyle = pal.d1;
  x.fillRect(-0.86 * hl, -hw + 1, 1.26 * hl, W - 2);
  for (const u of trackUnits(L, W)) {
    const health = g && t === g.player ? g.titan.crawlers[u.i] : 1;
    x.fillStyle = pal.tread;
    x.fillRect(u.x0, u.y0, u.len, u.w);
    // Grousers slide back as the side drives; broken ones stop.
    const pitch = 2.2;
    const ph = (((t.sidePhase[u.side < 0 ? 0 : 1] ?? 0) % pitch) + pitch) % pitch;
    if (health > 0.1 && ppm * pitch >= 1.5) {
      for (let m = u.x0 + u.len - ph; m > u.x0 + 0.2; m -= pitch) {
        x.fillStyle = pal.treadHi;
        x.fillRect(m, u.y0 + 0.3, Math.max(px, pitch * 0.45), u.w - 0.6);
        x.fillStyle = '#4a515c';
        x.fillRect(m, u.y0 + 0.3, Math.max(px, pitch * 0.45), px);
      }
    }
    // Inner armoured skirt over a third of the tread, with the light strip.
    const sy = u.side < 0 ? u.y0 + u.w * 0.62 : u.y0;
    x.fillStyle = pal.d3;
    x.fillRect(u.x0 + 1, sy, u.len - 2, u.w * 0.38);
    x.fillStyle = pal.d6;
    x.fillRect(u.x0 + 1, u.side < 0 ? sy : sy + u.w * 0.38 - px, u.len - 2, px);
    x.fillStyle = pal.glow;
    for (let m = u.x0 + 3; m < u.x0 + u.len - 5; m += 8) x.fillRect(m, sy + u.w * 0.16, 3.5, 0.6);
    // Sprockets.
    x.fillStyle = pal.d0;
    x.fillRect(u.x0, u.y0 + 1, 1.2, u.w - 2);
    x.fillRect(u.x0 + u.len - 1.2, u.y0 + 1, 1.2, u.w - 2);
    if (health < 0.35) {
      x.fillStyle = health <= 0.1 ? '#2a1208' : '#5a2a14';
      x.fillRect(u.x0 + u.len * 0.3, u.y0 + u.w * 0.2, u.len * 0.4, u.w * 0.5);
    }
  }
  void time;
}

function paintDynamic(x: CanvasRenderingContext2D, t: Tank, ppm: number, g: Game | null, pal: Pal, ox: number, oy: number, hl: number, hw: number, time: number, lights: HullLight[]): void {
  x.setTransform(ppm, 0, 0, ppm, ox, oy);
  const px = 1 / ppm;
  const pulse = 0.6 + 0.4 * Math.sin(time * 2.4);
  const detail = ppm >= 1.2;
  // Running lights down both flanks (they pulse), and their glow.
  for (const s of [-1, 1]) {
    for (let m = -0.86 * hl; m < 0.38 * hl; m += 10) {
      const on = Math.floor(time * 4 - m * 0.05) % 9 !== 0;
      x.fillStyle = on ? pal.glow : mixHex(pal.glow, '#000000', 0.6);
      x.fillRect(m, s * 0.69 * hw - (s < 0 ? 0 : 0.8), 5, 0.8);
      if (on && Math.round(m) % 30 === 0) lights.push({ x: m + 2.5, y: s * 0.69 * hw, r: 6, color: pal.glow, k: 0.3 * pulse, z: HULL_Z.deck });
    }
  }
  // Headlights and the nose slot.
  for (const s of [-1, 1]) lights.push({ x: 0.9 * hl, y: s * 0.38 * hw, r: 8, color: '#fff3c4', k: 0.6, z: HULL_Z.deck - 4 }, { x: hl + 20, y: s * 0.5 * hw, r: 24, color: '#fff3c4', k: 0.1, z: 0 });
  lights.push({ x: 0.87 * hl, y: 0, r: 7, color: pal.glow, k: 0.5 * pulse, z: HULL_Z.deck });
  // Missile box lamps.
  for (const s of [-1, 1]) for (const fx of [0.18, -0.14]) lights.push({ x: fx * hl, y: s * 0.44 * hw, r: 4, color: pal.red, k: 0.35 + 0.2 * pulse, z: HULL_Z.deck });
  // The stern: radiator fans and exhausts.
  const moving = Math.min(1, Math.abs(t.speed) / 8);
  const od = g && t === g.player && g.helm.overdrive;
  for (const s of [-1, 1]) {
    const fx = -0.8 * hl, fy = s * 0.2 * hw, fr = 0.17 * hw;
    x.fillStyle = pal.d0;
    x.beginPath();
    x.arc(fx, fy, fr, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = pal.d3;
    x.beginPath();
    x.arc(fx, fy, fr - 0.8, 0, Math.PI * 2);
    x.fill();
    const spin = time * (3 + moving * 16) * s;
    x.strokeStyle = pal.d6;
    x.lineWidth = 1.1;
    for (let b = 0; b < 6; b++) {
      const a = spin + (b * Math.PI) / 3;
      x.beginPath();
      x.moveTo(fx, fy);
      x.lineTo(fx + Math.cos(a) * (fr - 1.2), fy + Math.sin(a) * (fr - 1.2));
      x.stroke();
    }
    x.fillStyle = pal.d7;
    x.beginPath();
    x.arc(fx, fy, 1.2, 0, Math.PI * 2);
    x.fill();
  }
  for (const s of [-1, 1]) {
    // Engine pod nozzles.
    const nx = -1.1 * hl, ny = s * 0.52 * hw;
    x.fillStyle = od ? (Math.sin(time * 30 + s) > 0 ? '#ffd060' : '#ff7a00') : moving > 0.2 ? '#8a3a14' : '#1a1a1c';
    x.fillRect(nx - 0.8, ny - 2, 1.6, 4);
    if (moving > 0.2 || od) lights.push({ x: nx - 1, y: ny, r: od ? 12 : 6, color: '#ff9100', k: od ? 0.9 : 0.4, z: HULL_Z.deck - 8 });
    // Tail lights.
    x.fillStyle = pal.red;
    x.fillRect(-0.975 * hl, s * 0.58 * hw - 1.5, 1.2, 3);
    lights.push({ x: -0.97 * hl, y: s * 0.58 * hw, r: 5, color: pal.red, k: 0.55, z: HULL_Z.deck - 2 });
  }

  /* ---- Everything built on the roof ---- */
  const cell = t.cell;
  const cellX = (cy: number): number => (t.rows / 2 - cy) * cell;
  const cellY = (cx: number): number => (cx - t.cols / 2) * cell;
  for (const m of t.modules) {
    if (m.deck !== 0) continue;
    const d = MODULES[m.key];
    const x0 = cellX(m.cy + d.h), y0 = cellY(m.cx), mw = d.h * cell, mh = d.w * cell;
    if (d.hardpoint || m.key === 'pad' || m.key === 'main_gun') turret(x, t, m, x0, y0, mw, mh, pal, ppm, time, lights);
    else roofBlock(x, t, m, x0, y0, mw, mh, pal, ppm, time, pulse);
  }

  // Fires in burning compartments show through the deck.
  if (g && t === g.player) {
    for (let deck = 1; deck <= 7; deck++) {
      for (let s = 0; s < 3; s++) {
        const f = g.titan.fire[compIndex(deck, s)] ?? 0;
        if (f <= 0.02) continue;
        const fx = (1 - s) * 0.6 * hl + (hash2(deck, s, 1) - 0.5) * 20, fy = ((deck % 3) - 1) * 0.5 * hw;
        const n = 4 + Math.floor(f * 10);
        for (let k = 0; k < n; k++) {
          const flick = Math.sin(time * 14 + k * 3.1 + deck) * 0.5 + 0.5;
          const r = (1.2 + f * 3.2) * (0.6 + flick * 0.6);
          x.fillStyle = k % 3 === 0 ? '#ffe082' : k % 3 === 1 ? '#ff9100' : '#ff3d00';
          x.beginPath();
          x.arc(fx + (hash2(k, deck, s) - 0.5) * 10 * f, fy + (hash2(k, s, deck) - 0.5) * 8 * f, r, 0, Math.PI * 2);
          x.fill();
        }
        lights.push({ x: fx, y: fy, r: 8 + f * 10, color: '#ff6d00', k: 0.35 + f * 0.4, z: HULL_Z.deck });
      }
    }
  }
  void detail;
  void px;
}

/** A roof gun on a pad or mount in the hull's colours, for painters that draw the hull some other way. */
export function roofGun(x: CanvasRenderingContext2D, t: Tank, m: ModuleInst, x0: number, y0: number, mw: number, mh: number, ppm: number, time: number, lights: HullLight[]): void {
  const pal = t.kind === 'rival' ? RIVAL : t.kind === 'remote' ? REMOTE : PLAYER;
  turret(x, t, m, x0, y0, mw, mh, pal, ppm, time, lights);
}

/** A roof gun: an angular armoured turret on a ring, turned to its target, barrels recoiling, a rarity band. */
function turret(x: CanvasRenderingContext2D, t: Tank, m: ModuleInst, x0: number, y0: number, mw: number, mh: number, pal: Pal, ppm: number, time: number, lights: HullLight[]): void {
  const main = m.key === 'main_gun';
  const cx = x0 + mw / 2, cy = y0 + mh / 2;
  const rr = Math.min(mw, mh) * (main ? 0.44 : 0.38);
  // The barbette ring.
  x.fillStyle = pal.d0;
  x.beginPath();
  x.arc(cx, cy, rr * 1.12, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = pal.d3;
  x.beginPath();
  x.arc(cx, cy, rr * 1.02, 0, Math.PI * 2);
  x.fill();
  if (!m.weapon) return;
  const wd = WEAPONS[m.weapon.key];
  const size = wd?.size ?? 'medium';
  const a = m.aim - t.rot;
  const ca = Math.cos(a), sa = Math.sin(a);
  const len = main ? t.stats.length * 0.17 : size === 'heavy' ? 17 : size === 'medium' ? 11 : 7.5;
  const back = Math.min(0.35, m.recoil ?? 0) * len;
  const bw = main ? 1.6 : size === 'heavy' ? 1.35 : size === 'medium' ? 1 : 0.75;
  const twin = main ? [-1.2, 1.2] : size === 'heavy' ? [-1, 1] : size === 'medium' ? [-0.6, 0.6] : [0];
  x.save();
  x.translate(cx, cy);
  x.rotate(a);
  // Barrels with a muzzle brake, a highlight along the top.
  for (const k of twin) {
    const off = k * bw * 1.3;
    x.fillStyle = pal.d0;
    x.fillRect(rr * 0.3 - back, off - bw / 2 - 0.2, len + 0.4, bw + 0.4);
    x.fillStyle = pal.d4;
    x.fillRect(rr * 0.3 - back, off - bw / 2, len, bw);
    x.fillStyle = pal.d7;
    x.fillRect(rr * 0.3 - back, off - bw / 2, len, Math.max(1 / ppm, bw * 0.25));
    x.fillStyle = pal.d1;
    x.fillRect(rr * 0.3 - back + len - 1.8, off - bw * 0.75, 1.8, bw * 1.5);
    x.fillRect(rr * 0.3 - back + len * 0.4, off - bw * 0.62, 0.8, bw * 1.24);
  }
  // The turret housing: faceted, sloped front, darker flanks.
  const tl = rr * 1.25, tw = rr * 0.95;
  const hull: Pt[] = [[tl * 0.9, -tw * 0.55], [tl * 0.9, tw * 0.55], [tl * 0.45, tw], [-tl * 0.8, tw], [-tl * 0.95, tw * 0.7], [-tl * 0.95, -tw * 0.7], [-tl * 0.8, -tw], [tl * 0.45, -tw]];
  x.fillStyle = pal.d0;
  x.beginPath();
  hull.forEach(([p, q], i) => (i ? x.lineTo(p * 1.08, q * 1.08) : x.moveTo(p * 1.08, q * 1.08)));
  x.closePath();
  x.fill();
  x.fillStyle = pal.d5;
  x.beginPath();
  hull.forEach(([p, q], i) => (i ? x.lineTo(p, q) : x.moveTo(p, q)));
  x.closePath();
  x.fill();
  x.fillStyle = pal.d6;
  x.fillRect(-tl * 0.6, -tw * 0.62, tl * 1.1, tw * 1.24);
  x.fillStyle = pal.d4;
  x.fillRect(tl * 0.45, -tw * 0.55, tl * 0.45, tw * 1.1);
  x.fillStyle = pal.d7;
  x.fillRect(-tl * 0.6, -tw * 0.62, tl * 1.1, 1 / ppm);
  // Hatch, sensor and the rarity band.
  x.fillStyle = pal.d2;
  x.fillRect(-tl * 0.5, -tw * 0.3, tw * 0.5, tw * 0.5);
  x.fillStyle = RARITIES[m.weapon.rarity]?.color ?? '#b8c0c8';
  x.fillRect(-tl * 0.8, -tw * 0.85, tl * 0.22, tw * 1.7);
  x.fillStyle = pal.red;
  x.fillRect(tl * 0.55, -tw * 0.1, 0.7, 0.7);
  x.restore();
  // The main battery paints its target with red laser sights.
  if (main) {
    x.strokeStyle = 'rgba(255,40,40,0.55)';
    x.lineWidth = 1 / ppm;
    for (const k of [-1.2, 1.2]) {
      const sx = cx + ca * (len + rr) - sa * k * bw * 1.3, sy = cy + sa * (len + rr) + ca * k * bw * 1.3;
      x.beginPath();
      x.moveTo(sx, sy);
      x.lineTo(sx + ca * 60, sy + sa * 60);
      x.stroke();
    }
  }
  if ((m.recoil ?? 0) > 0.25) lights.push({ x: cx + ca * (len + rr), y: cy + sa * (len + rr), r: main ? 10 : 5, color: '#fff3a0', k: 0.9, z: HULL_Z.deck + 2 });
  void time;
}

function roofBlock(x: CanvasRenderingContext2D, t: Tank, m: ModuleInst, x0: number, y0: number, mw: number, mh: number, pal: Pal, ppm: number, time: number, pulse: number): void {
  const px = 1 / ppm;
  const cx = x0 + mw / 2, cy = y0 + mh / 2;
  x.fillStyle = pal.d0;
  x.fillRect(x0 + 0.4, y0 + 0.4, mw - 0.8, mh - 0.8);
  x.fillStyle = m.built ? pal.d4 : pal.d2;
  x.fillRect(x0 + 1, y0 + 1, mw - 2, mh - 2);
  x.fillStyle = pal.d6;
  x.fillRect(x0 + 1, y0 + 1, mw - 2, px);
  if (!m.built) {
    // Going up: hazard tape round the edge.
    for (let k = 0; k < (mw + mh) * 2; k += 2) {
      x.fillStyle = Math.floor(k / 2) % 2 ? '#141414' : '#e0b020';
      if (k < mw) x.fillRect(x0 + k, y0, 2, 0.8);
    }
    return;
  }
  if (m.key.startsWith('nest')) {
    // A sandbagged ring with the soldiers in it.
    x.strokeStyle = '#6a6250';
    x.lineWidth = 1.4;
    x.strokeRect(x0 + 1.4, y0 + 1.4, mw - 2.8, mh - 2.8);
    if (!t.indoors) for (let k = 0; k < 4; k++) {
      const sx = x0 + 2.5 + (k % 2) * (mw - 5), sy = y0 + 2.5 + Math.floor(k / 2) * (mh - 5);
      x.fillStyle = '#56663a';
      x.beginPath();
      x.arc(sx, sy, 0.8, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#3a4428';
      x.fillRect(sx - 0.2, sy, 1.6, 0.35);
    }
  } else if (m.key === 'radar') {
    const a = time * 2;
    x.strokeStyle = '#d0dce8';
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(cx - Math.cos(a) * mw * 0.4, cy - Math.sin(a) * mh * 0.4);
    x.lineTo(cx + Math.cos(a) * mw * 0.4, cy + Math.sin(a) * mh * 0.4);
    x.stroke();
  } else if (m.key === 'tesla') {
    x.fillStyle = Math.sin(time * 9) > 0 ? '#ea80fc' : '#7c4dff';
    x.beginPath();
    x.arc(cx, cy, Math.min(mw, mh) * 0.25, 0, Math.PI * 2);
    x.fill();
  } else if (m.key === 'shield') {
    x.fillStyle = mixHex('#40c4ff', '#000000', 0.4 - 0.3 * pulse);
    x.beginPath();
    x.arc(cx, cy, Math.min(mw, mh) * 0.3, 0, Math.PI * 2);
    x.fill();
  } else {
    // Vents and a hatch.
    x.fillStyle = pal.d1;
    for (let k = 0; k < 3; k++) x.fillRect(x0 + 2 + k * (mw - 4) / 3, y0 + 2, 0.6, mh - 4);
  }
}

function towerDynamic(x: CanvasRenderingContext2D, t: Tank, ppm: number, pal: Pal, ox: number, oy: number, hl: number, hw: number, time: number, lights: HullLight[]): void {
  x.setTransform(ppm, 0, 0, ppm, ox, oy);
  // Antenna masts with a blinking red tip, and the radar dish.
  const mx = (TOWER.x0 + 0.05) * hl;
  x.strokeStyle = '#8a95a6';
  x.lineWidth = 0.6;
  for (const [a, b] of [[mx, -TOWER.y * 0.6 * hw], [mx + 5, TOWER.y * 0.55 * hw]]) {
    x.beginPath();
    x.moveTo(a, b);
    x.lineTo(a - 6, b);
    x.stroke();
  }
  const blink = Math.floor(time * 1.5) % 2 === 0;
  x.fillStyle = blink ? pal.red : '#4a0e0a';
  x.fillRect(mx - 6.4, -TOWER.y * 0.6 * hw - 0.4, 0.8, 0.8);
  if (blink) lights.push({ x: mx - 6, y: -TOWER.y * 0.6 * hw, r: 4, color: pal.red, k: 0.8, z: HULL_Z.tower + 6 });
  const ra = time * 1.4;
  const rx = (TOWER.x0 + 0.16) * hl;
  x.strokeStyle = '#cfd8e4';
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(rx - Math.cos(ra) * 4, -Math.sin(ra) * 4);
  x.lineTo(rx + Math.cos(ra) * 4, Math.sin(ra) * 4);
  x.stroke();
  void t;
}
