import { COMPOUND, FRONT_STRUCTS, STRUCTS, type Struct, type Tower } from '../../shared/compound';
import { pxMini } from '../../ui/pixfont';
import { ctx2d, hash2, makeCanvas, shade } from './pixels';

/**
 * Pixel art for the Mega Hangar's compound, painted once per building at two pixels a metre: a roof over the
 * footprint and the south wall under it (as tall as the ground renderer draws that obstacle's face, so the two agree).
 * Every kind has its own look: container homes with junk on their roofs, striped market awnings, fuel tanks, a water
 * tower on legs, saw-tooth workshops, the cantina's neon, the clinic's cross, greenhouses, the armory's sandbagged gun,
 * the HQ's helipad and radar. The wall gets its merlons and walkway, the towers their parapets.
 */

export const ART_PX = 2;

/** Tiles of south face the ground renderer gives an obstacle this tall (half-metre units). */
export const faceTiles = (h: number): number => Math.min(14, Math.round(h * 0.15));

export interface Sprite {
  c: HTMLCanvasElement;
  /** Top-left, metres from the Hangar's centre. */
  x: number;
  y: number;
}

type C = CanvasRenderingContext2D;

const R = (c: C, x: number, y: number, w: number, h: number, col: string): void => {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

function disc(c: C, cx: number, cy: number, r: number, col: string): void {
  c.fillStyle = col;
  c.beginPath();
  c.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2);
  c.fill();
}

function ring(c: C, cx: number, cy: number, r: number, w: number, col: string): void {
  c.strokeStyle = col;
  c.lineWidth = w;
  c.beginPath();
  c.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2);
  c.stroke();
}

function line(c: C, x0: number, y0: number, x1: number, y1: number, col: string, w = 1): void {
  c.strokeStyle = col;
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

const rnd = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

/** A flat roof with a parapet: lit on the north-west, shadowed south-east. */
function slab(c: C, x: number, y: number, w: number, h: number, col: string): void {
  R(c, x, y, w, h, col);
  R(c, x, y, w, 1, shade(col, 0.28));
  R(c, x, y, 1, h, shade(col, 0.18));
  R(c, x + w - 1, y, 1, h, shade(col, -0.25));
  R(c, x, y + h - 1, w, 1, shade(col, -0.4));
}

/** The south wall: darker toward the ground, with windows (some lit), doors and ribs. */
function face(c: C, w: number, d: number, f: number, col: string, o: { win?: string; lit?: number; doors?: number; door?: string; ribs?: number; seed: number }): void {
  if (f <= 0) return;
  R(c, 0, d, w, f, col);
  for (let k = 0; k < f; k++) {
    c.fillStyle = `rgba(0,0,0,${((k / f) * 0.28).toFixed(3)})`;
    c.fillRect(0, d + k, w, 1);
  }
  R(c, 0, d, w, 1, shade(col, -0.45));
  if (o.ribs) for (let x = o.ribs; x < w - 1; x += o.ribs) R(c, x, d + 1, 1, f - 1, shade(col, -0.18));
  if (o.win && f >= 4) {
    const wy = d + Math.max(1, Math.floor(f * 0.25)), wh = Math.max(1, Math.floor(f * 0.35));
    for (let x = 4; x + 3 < w - 3; x += 8) {
      const lit = hash2(x, d, o.seed) < (o.lit ?? 0.3);
      R(c, x, wy, 3, wh, lit ? '#ffd27a' : o.win);
      if (lit) R(c, x, wy, 3, 1, '#fff2c8');
    }
  }
  if (o.doors) {
    const dw = Math.max(4, Math.min(10, Math.floor(w / (o.doors * 3))));
    for (let k = 0; k < o.doors; k++) {
      const x = Math.round(((k + 0.5) / o.doors) * w - dw / 2);
      R(c, x, d + 1, dw, f - 1, o.door ?? shade(col, -0.5));
      R(c, x, d + 1, dw, 1, shade(col, 0.2));
    }
  }
  R(c, 0, d + f - 1, w, 1, shade(col, -0.55));
}

/** Corrugated sheet: stripes every `p` pixels across (vertical) or down (horizontal). */
function corrugate(c: C, x: number, y: number, w: number, h: number, col: string, p: number, vertical: boolean): void {
  const dk = shade(col, -0.16), lt = shade(col, 0.1);
  if (vertical) {
    for (let k = 0; k < w; k += p) {
      R(c, x + k, y, 1, h, dk);
      if (k + 1 < w) R(c, x + k + 1, y, 1, h, lt);
    }
  } else {
    for (let k = 0; k < h; k += p) {
      R(c, x, y + k, w, 1, dk);
      if (k + 1 < h) R(c, x, y + k + 1, w, 1, lt);
    }
  }
}

function vent(c: C, x: number, y: number, s = 4): void {
  R(c, x, y, s, s, '#5d6168');
  R(c, x, y, s, 1, '#8d939c');
  R(c, x + 1, y + 1, s - 2, s - 2, '#23262b');
}

function acUnit(c: C, x: number, y: number): void {
  R(c, x, y, 7, 6, '#9ea4ab');
  R(c, x, y, 7, 1, '#c8ced4');
  R(c, x, y + 5, 7, 1, '#62676d');
  disc(c, x + 3.5, y + 3, 2, '#3b3f45');
  R(c, x + 3, y + 2, 1, 2, '#9ea4ab');
}

function solar(c: C, x: number, y: number, w: number, h: number): void {
  R(c, x, y, w, h, '#1b2a48');
  for (let i = x + 3; i < x + w; i += 3) R(c, i, y, 1, h, '#34507e');
  for (let j = y + 3; j < y + h; j += 3) R(c, x, j, w, 1, '#34507e');
  R(c, x, y, w, 1, '#6a8cc0');
  R(c, x + w - 1, y, 1, h, '#101a30');
}

function crate(c: C, x: number, y: number, s: number, col = '#8a6a40'): void {
  R(c, x, y, s, s, col);
  R(c, x, y, s, 1, shade(col, 0.3));
  R(c, x, y + s - 1, s, 1, shade(col, -0.4));
  line(c, x + 0.5, y + 0.5, x + s - 0.5, y + s - 0.5, shade(col, -0.25));
}

function drum(c: C, x: number, y: number, col = '#b03a2a'): void {
  disc(c, x, y, 2.2, shade(col, -0.35));
  disc(c, x - 0.3, y - 0.3, 1.8, col);
  R(c, x - 1, y - 1, 1, 1, shade(col, 0.4));
}

function sandbags(c: C, x: number, y: number, w: number, h: number): void {
  const col = '#a89868';
  for (let i = 0; i < w; i += 3) {
    R(c, x + i, y, 3, 2, i % 6 ? col : shade(col, -0.1));
    R(c, x + i, y + h - 2, 3, 2, i % 6 ? shade(col, -0.1) : col);
  }
  for (let j = 0; j < h; j += 3) {
    R(c, x, y + j, 2, 3, j % 6 ? col : shade(col, -0.1));
    R(c, x + w - 2, y + j, 2, 3, j % 6 ? shade(col, -0.12) : col);
  }
}

/** Grime and weathering: a few darker stains and lighter patched plates. */
function weather(c: C, w: number, h: number, seed: number, n: number): void {
  const r = rnd(seed);
  for (let k = 0; k < n; k++) {
    const x = r() * w, y = r() * h, s = 3 + r() * 9;
    c.fillStyle = r() < 0.7 ? `rgba(30,20,10,${(0.08 + r() * 0.1).toFixed(2)})` : `rgba(255,250,235,${(0.05 + r() * 0.06).toFixed(2)})`;
    c.beginPath();
    c.ellipse(x, y, s, s * (0.4 + r() * 0.5), r() * 3, 0, Math.PI * 2);
    c.fill();
  }
}

/** Makes every pixel fully opaque or fully clear (crisp edges) and adds a little grain. */
function finish(cv: HTMLCanvasElement, seed: number, grain = 0.07): void {
  const c = cv.getContext('2d')!;
  const img = c.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (d[i + 3] < 110) {
        d[i + 3] = 0;
        continue;
      }
      const a = d[i + 3] / 255;
      const k = 1 + (hash2(x, y, seed) - 0.5) * grain;
      d[i] = Math.min(255, (d[i] / a) * k);
      d[i + 1] = Math.min(255, (d[i + 1] / a) * k);
      d[i + 2] = Math.min(255, (d[i + 2] / a) * k);
      d[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- the buildings

const CONTAINER = ['#a8452c', '#2f7f86', '#c8952c', '#3f5f9a', '#6f8a3a', '#8a3a5a', '#b8b4a8', '#c0602a'];
const AWNING = ['#c0392b', '#1f8a8a', '#d4a020', '#2a5aa0', '#8a3aa0', '#3a9a4a'];

function container(c: C, x: number, y: number, w: number, h: number, col: string): void {
  R(c, x, y, w, h, col);
  for (let k = 1; k < w - 1; k += 2) R(c, x + k, y + 1, 1, h - 2, shade(col, -0.14));
  R(c, x, y, w, 1, shade(col, 0.3));
  R(c, x, y + h - 1, w, 1, shade(col, -0.4));
  R(c, x, y, 1, h, shade(col, 0.15));
  // Door end, with its locking bars.
  R(c, x + w - 4, y + 1, 3, h - 2, shade(col, -0.3));
  R(c, x + w - 3, y + 2, 1, h - 4, shade(col, 0.2));
  R(c, x + w - 1, y, 1, h, shade(col, -0.45));
}

function paintHome(c: C, w: number, d: number, f: number, seed: number): void {
  const r = rnd(seed);
  R(c, 0, 0, w, d, '#8d887c');
  const a = CONTAINER[Math.floor(r() * CONTAINER.length)], b = CONTAINER[Math.floor(r() * CONTAINER.length)];
  const hA = Math.floor(d / 2) - 1;
  const off = r() < 0.5 ? 0 : Math.round((r() - 0.5) * 10);
  container(c, Math.max(0, off), 0, w - Math.abs(off), hA, a);
  container(c, Math.max(0, -off), hA + 2, w - Math.abs(off), d - hA - 2, b);
  // Life on the roofs.
  const items = 2 + Math.floor(r() * 3);
  for (let k = 0; k < items; k++) {
    const t = r();
    const x = 4 + r() * (w - 22), y = 3 + (r() < 0.5 ? 0 : hA + 2) + r() * (hA - 14);
    if (t < 0.28) solar(c, x, y, 14, 9);
    else if (t < 0.45) {
      disc(c, x + 5, y + 5, 5, '#6d7a86');
      disc(c, x + 4.5, y + 4.5, 3.6, '#8d9aa6');
      R(c, x + 3, y + 3, 2, 1, '#c8d4de');
    } else if (t < 0.58) {
      disc(c, x + 4, y + 4, 4, '#dedad2');
      disc(c, x + 4, y + 4, 1.5, '#55585c');
      line(c, x + 4, y + 4, x + 8, y + 1, '#8a8a8a');
    } else if (t < 0.72) {
      R(c, x, y, 12, 6, '#6a4a2a');
      for (let i = 0; i < 5; i++) disc(c, x + 1.5 + i * 2.2, y + 2.5 + (i % 2), 1.6, i % 3 ? '#4f9a3a' : '#7aba4a');
    } else if (t < 0.86) acUnit(c, x, y);
    else {
      // A washing line.
      line(c, x, y + 2, x + 18, y + 4, '#d0d0d0');
      for (let i = 0; i < 4; i++) R(c, x + 2 + i * 4, y + 2.5 + i * 0.5, 2, 3, ['#e05050', '#f0f0f0', '#4a7ad0', '#e0c040'][i]);
    }
  }
  weather(c, w, d, seed + 3, 3);
  face(c, w, d, f, shade(b, -0.25), { win: '#2a3440', lit: 0.45, doors: 1, door: '#3a2f28', ribs: 2, seed });
}

function paintStall(c: C, w: number, d: number, f: number, seed: number): void {
  const col = AWNING[seed % AWNING.length];
  for (let x = 0; x < w; x += 4) R(c, x, 0, 4, d, (x / 4) % 2 ? '#efe6d2' : col);
  R(c, 0, 0, w, 1, shade(col, 0.35));
  // Scalloped front edge.
  for (let x = 0; x < w; x += 4) R(c, x + 1, d - 2, 2, 2, (x / 4) % 2 ? '#d8cfbb' : shade(col, -0.2));
  R(c, 0, Math.floor(d / 2), w, 1, 'rgba(0,0,0,0.18)');
  R(c, 0, d, w, f, '#3a2a1c');
  const goods = ['#e8b030', '#c0392b', '#6ab04c', '#e67e22', '#9b59b6', '#ecf0f1'];
  for (let x = 1; x < w - 1; x += 2) R(c, x, d, 1, Math.max(1, f - 1), goods[Math.floor(hash2(x, seed, 7) * goods.length)]);
}

function paintTank(c: C, w: number, d: number, f: number, seed: number): void {
  R(c, 0, 0, w, d, '#8a8578');
  slab(c, 0, 0, w, d, '#8a8578');
  R(c, 0, d, w, f, '#5f5b52');
  const cx = w / 2, cy = d / 2 - 1, r = w / 2 - 5;
  const white = seed % 3 !== 1;
  const base = white ? '#d6d0c2' : '#b0653a';
  // The shell's side, lit from the left.
  for (let x = Math.floor(cx - r); x < cx + r; x++) {
    const t = (x - (cx - r)) / (2 * r);
    const col = shade(base, t < 0.3 ? 0.12 - t * 0.2 : -(t - 0.3) * 0.55);
    R(c, x, cy, 1, d + f - 2 - cy, col);
  }
  R(c, cx - r, d + f - 3, 2 * r, 1, 'rgba(0,0,0,0.35)');
  // Red band and FUEL on the side.
  R(c, cx - r, d - 2, 2 * r, 2, white ? '#a83228' : '#e0c050');
  pxMini(c, 'FUEL', cx, d + 1, white ? '#a83228' : '#1a1a1a', 'center', null);
  // The roof: rings, seams, a hatch, a catwalk to it.
  disc(c, cx, cy, r, shade(base, -0.1));
  disc(c, cx - 1, cy - 1, r - 2, base);
  ring(c, cx, cy, r - 7, 1, shade(base, -0.15));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    line(c, cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), shade(base, -0.08));
  }
  R(c, cx - 1.5, cy, 3, r, '#6d6d6d');
  R(c, cx - 2, cy, 1, r, '#9a9a9a');
  R(c, cx + 1, cy, 1, r, '#9a9a9a');
  disc(c, cx, cy, 4, '#3f4246');
  disc(c, cx - 0.5, cy - 0.5, 2.6, '#7a7e84');
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.beginPath();
  c.ellipse(cx - r * 0.4, cy - r * 0.4, r * 0.35, r * 0.2, -0.7, 0, Math.PI * 2);
  c.fill();
}

function paintWaterTower(c: C, w: number, d: number, f: number): void {
  const cx = w / 2, cy = d / 2 - 2, r = w / 2 - 3;
  // Legs and bracing, down to the ground at the bottom of the face.
  const foot = d + f - 1;
  const legs = [cx - r + 2, cx - r * 0.35, cx + r * 0.35, cx + r - 2];
  for (let i = 0; i < legs.length - 1; i++) {
    line(c, legs[i] + 0.5, cy + 6, legs[i + 1] + 0.5, foot, '#3b3f45');
    line(c, legs[i + 1] + 0.5, cy + 6, legs[i] + 0.5, foot, '#3b3f45');
  }
  for (const x of legs) R(c, x, cy, 2, foot - cy + 1, '#51565d');
  R(c, legs[0], foot - 1, legs[3] - legs[0] + 2, 2, '#77756c');
  // The tank body, then its roof.
  for (let x = Math.floor(cx - r); x < cx + r; x++) {
    const t = (x - (cx - r)) / (2 * r);
    R(c, x, cy, 1, 9, shade('#4a8aa0', t < 0.3 ? 0.1 : -(t - 0.3) * 0.6));
  }
  pxMini(c, 'H2O', cx, cy + 3, '#e8f4f8', 'center', null);
  disc(c, cx, cy, r, '#35687a');
  for (let k = r; k > 1; k -= 2) disc(c, cx - (r - k) * 0.12, cy - (r - k) * 0.12, k, shade('#4a8aa0', ((r - k) / r) * 0.35));
  disc(c, cx - 1, cy - 1, 1.5, '#dfe8ec');
}

function paintMast(c: C, w: number, d: number, f: number): void {
  const foot = d + f - 1;
  const cx = w / 2;
  // Guy wires out to the corners.
  for (const x of [0, w - 1]) line(c, cx, 3, x + 0.5, foot, 'rgba(200,200,200,0.55)');
  R(c, 2, foot - 2, w - 4, 3, '#77756c');
  // The lattice, narrowing to the top.
  for (let y = 2; y < foot; y++) {
    const half = 1 + ((y - 2) / (foot - 2)) * 3;
    R(c, cx - half, y, 1, 1, '#b0342a');
    R(c, cx + half - 1, y, 1, 1, (Math.floor(y / 3) % 2 ? '#e8e2d4' : '#b0342a'));
    if (y % 4 === 0) R(c, cx - half, y, half * 2, 1, '#8a8a8a');
  }
  R(c, cx - 3, 1, 6, 3, '#cfd2d6');
  R(c, cx - 0.5, 0, 1, 2, '#e0e0e0');
}

function paintBarracks(c: C, w: number, d: number, f: number, seed: number): void {
  const col = '#666a48';
  slab(c, 0, 0, w, d, col);
  corrugate(c, 2, 2, w - 4, d - 4, col, 3, true);
  R(c, 2, Math.floor(d / 2) - 1, w - 4, 2, shade(col, 0.22));
  R(c, 2, Math.floor(d / 2) + 1, w - 4, 1, shade(col, -0.3));
  for (let x = 14; x < w - 10; x += 26) vent(c, x, Math.floor(d / 2) - 6, 5);
  for (let x = 30; x < w - 10; x += 52) acUnit(c, x, d - 12);
  pxMini(c, `B${1 + (seed % 4)}`, 10, 6, 'rgba(235,230,210,0.55)', 'left', null, 3);
  weather(c, w, d, seed, Math.floor(w / 25));
  face(c, w, d, f, '#55563f', { win: '#28302a', lit: 0.4, doors: Math.max(2, Math.floor(w / 70)), ribs: 0, seed });
}

function paintWorkshop(c: C, w: number, d: number, f: number, seed: number): void {
  const metal = '#7a7e86';
  R(c, 0, 0, w, d, metal);
  // Saw-tooth: sloped sheet, then a band of north-light glazing.
  for (let y = 2; y < d - 2; y += 12) {
    for (let k = 0; k < 8 && y + k < d - 2; k++) R(c, 2, y + k, w - 4, 1, shade(metal, 0.18 - k * 0.05));
    for (let k = 8; k < 12 && y + k < d - 2; k++) R(c, 2, y + k, w - 4, 1, k === 8 ? '#9ad0ec' : '#3f7ea4');
    for (let x = 8; x < w - 4; x += 10) R(c, x, y + 8, 1, Math.min(4, d - 2 - y - 8), '#2a4a60');
  }
  R(c, 0, 0, w, 2, '#e07a20');
  R(c, 0, d - 2, w, 2, '#b85a10');
  R(c, 0, 0, 2, d, '#c86a18');
  R(c, w - 2, 0, 2, d, '#a85010');
  vent(c, w - 14, 6, 6);
  weather(c, w, d, seed, 4);
  face(c, w, d, f, '#5a5e66', { win: '#2a3440', lit: 0.3, ribs: 6, seed });
  // A big roll-up door with hazard stripes.
  const dw = Math.floor(w * 0.36), dx = Math.floor((w - dw) / 2);
  if (f >= 3) {
    R(c, dx - 2, d + 1, dw + 4, f - 1, '#1a1a1a');
    for (let x = dx - 2; x < dx + dw + 2; x += 2) R(c, x, d + 1, 1, 1, '#f0b020');
    for (let y = d + 2; y < d + f - 1; y += 2) R(c, dx, y, dw, 1, '#7d8189');
    R(c, dx + dw + 3, d + 1, 2, 2, '#ff9020');
  }
}

function paintBar(c: C, w: number, d: number, f: number, seed: number): void {
  const tile = '#7a4032';
  R(c, 0, 0, w, d, tile);
  for (let y = 0; y < d; y += 3) {
    R(c, 0, y, w, 1, shade(tile, -0.25));
    for (let x = (y / 3) % 2 ? 2 : 0; x < w; x += 4) R(c, x, y + 1, 1, 2, shade(tile, 0.12));
  }
  slab(c, 0, 0, w, 2, shade(tile, 0.1));
  // Roof terrace: a deck, umbrellas, string lights.
  const tx = Math.floor(w * 0.5), tw = w - tx - 4, ty = 4, th = d - 10;
  R(c, tx, ty, tw, th, '#8a6a44');
  for (let x = tx; x < tx + tw; x += 3) R(c, x, ty, 1, th, '#74583a');
  const um = ['#ff4fa0', '#40e0ff', '#ffd040', '#60ff90'];
  for (let k = 0; k < 4; k++) {
    const ux = tx + 8 + (k % 2) * (tw - 16), uy = ty + 8 + Math.floor(k / 2) * (th - 16);
    disc(c, ux, uy, 6, shade(um[k], -0.2));
    for (let a = 0; a < 6; a++) line(c, ux, uy, ux + Math.cos(a) * 6, uy + Math.sin(a) * 6, a % 2 ? um[k] : '#f4f0e8');
    disc(c, ux, uy, 1, '#2a2a2a');
  }
  for (let x = tx + 2; x < tx + tw - 2; x += 3) R(c, x, ty + th / 2 + Math.sin(x * 0.3) * 1.5, 1, 1, um[(x / 3) % 4 | 0]);
  acUnit(c, 8, 8);
  acUnit(c, 20, 8);
  weather(c, tx, d, seed, 3);
  face(c, w, d, f, '#4a2e2a', { win: '#402020', lit: 0.8, doors: 1, door: '#20100c', seed });
  // The neon sign, glowing.
  pxMini(c, 'CANTINA', w * 0.25, d - 8, '#ff4fa0', 'center', 'rgba(255,79,160,0.35)');
}

function paintClinic(c: C, w: number, d: number, f: number, seed: number): void {
  const col = '#d6d4ca';
  slab(c, 0, 0, w, d, col);
  R(c, 2, 2, w - 4, 2, '#3a7ac0');
  R(c, 2, d - 4, w - 4, 2, '#3a7ac0');
  const cx = w / 2, cy = d / 2;
  disc(c, cx, cy, Math.min(w, d) * 0.3, '#f4f2ea');
  ring(c, cx, cy, Math.min(w, d) * 0.3, 1, '#b8b4a8');
  const s = Math.min(w, d) * 0.08;
  R(c, cx - s * 3, cy - s, s * 6, s * 2, '#d02a2a');
  R(c, cx - s, cy - s * 3, s * 2, s * 6, '#d02a2a');
  acUnit(c, 8, 10);
  acUnit(c, 8, 20);
  acUnit(c, w - 16, 10);
  pxMini(c, 'CLINIC', cx, d - 12, '#d02a2a', 'center', null);
  weather(c, w, d, seed, 2);
  face(c, w, d, f, '#b0b0a8', { win: '#3a6aa0', lit: 0.5, doors: 1, door: '#6a8ab0', seed });
}

function paintWarehouse(c: C, w: number, d: number, f: number, seed: number): void {
  const base = '#8a9096';
  // A barrel-vault roof: light on the north slope, darker to the south eave.
  for (let y = 0; y < d; y++) {
    const t = y / d;
    R(c, 0, y, w, 1, shade(base, 0.25 * Math.cos(t * Math.PI * 0.9 + 0.35) - 0.08));
  }
  for (let x = 1; x < w; x += 3) R(c, x, 1, 1, d - 2, 'rgba(0,0,0,0.12)');
  const sk = Math.floor(d * 0.3);
  for (let x = 6; x < w - 6; x += 12) {
    R(c, x, sk, 9, 5, '#7ab8d8');
    R(c, x, sk, 9, 1, '#c8ecfa');
    R(c, x + 4, sk, 1, 5, '#3a6a88');
  }
  // Rust streaks.
  const r = rnd(seed);
  for (let k = 0; k < 10; k++) R(c, r() * w, r() * d * 0.6, 1 + r() * 2, 6 + r() * 20, 'rgba(140,70,30,0.25)');
  pxMini(c, `DEPOT ${1 + (seed % 9)}`, w / 2, d * 0.6, 'rgba(240,235,220,0.5)', 'center', null, 3);
  slab(c, 0, 0, w, 1, base);
  face(c, w, d, f, '#5c6168', { ribs: 3, seed });
  // Loading docks.
  const n = Math.max(2, Math.floor(w / 60));
  for (let k = 0; k < n; k++) {
    const x = Math.round(((k + 0.5) / n) * w - 11);
    R(c, x, d + 1, 22, f - 1, '#2e3136');
    for (let y = d + 2; y < d + f - 1; y += 2) R(c, x + 1, y, 20, 1, '#6d7178');
    R(c, x - 2, d + f - 3, 2, 3, '#f0b020');
    R(c, x + 22, d + f - 3, 2, 3, '#f0b020');
  }
}

function paintGreenhouse(c: C, w: number, d: number, f: number, seed: number): void {
  R(c, 0, 0, w, d, '#2f6a44');
  // Beds of plants under the glass.
  for (let y = 3; y < d - 3; y += 6) {
    R(c, 2, y, w - 4, 4, '#5a3e26');
    for (let x = 3; x < w - 3; x += 3) disc(c, x, y + 2, 1.7, hash2(x, y, seed) < 0.3 ? '#9ad05a' : hash2(x, y, seed + 1) < 0.1 ? '#e05a4a' : '#4f9a3a');
  }
  // The glazing: a tint, the frame, glints.
  c.fillStyle = 'rgba(170,230,220,0.28)';
  c.fillRect(0, 0, w, d);
  for (let x = 0; x < w; x += 8) R(c, x, 0, 1, d, '#d8e0da');
  for (let y = 0; y < d; y += 8) R(c, 0, y, w, 1, '#d8e0da');
  R(c, 0, Math.floor(d / 2), w, 2, '#e8eee8');
  for (let x = 4; x < w; x += 24) line(c, x, 2, x + 5, 7, 'rgba(255,255,255,0.7)');
  R(c, 0, 0, w, 1, '#f0f4f0');
  R(c, 0, d - 1, w, 1, '#8a9a90');
  R(c, 0, d, w, f, '#6aa090');
  R(c, 0, d, w, 1, '#d8e0da');
}

function paintGarage(c: C, w: number, d: number, f: number, seed: number): void {
  const col = '#56595f';
  slab(c, 0, 0, w, d, col);
  for (let x = 0; x < w; x += 20) R(c, x, 1, 1, d - 2, shade(col, -0.2));
  for (let y = 0; y < d; y += 20) R(c, 1, y, w - 2, 1, shade(col, -0.2));
  // Extractor fans.
  for (let k = 0; k < 3; k++) {
    const fx = 14 + k * ((w - 28) / 2), fy = 14;
    disc(c, fx, fy, 7, '#2f3237');
    ring(c, fx, fy, 7, 1, '#8a9098');
    for (let a = 0; a < 4; a++) line(c, fx, fy, fx + Math.cos(a * 1.57 + k) * 6, fy + Math.sin(a * 1.57 + k) * 6, '#6a7078', 2);
    disc(c, fx, fy, 1.5, '#b0b6be');
  }
  const r = rnd(seed);
  for (let k = 0; k < 6; k++) {
    c.fillStyle = 'rgba(10,10,10,0.22)';
    c.beginPath();
    c.ellipse(r() * w, 24 + r() * (d - 30), 3 + r() * 6, 2 + r() * 3, r() * 3, 0, Math.PI * 2);
    c.fill();
  }
  pxMini(c, 'MOTOR POOL', w / 2, d - 12, 'rgba(240,200,60,0.75)', 'center', null);
  face(c, w, d, f, '#44474d', { ribs: 0, seed });
  if (f >= 3) {
    const n = 3;
    for (let k = 0; k < n; k++) {
      const dw = Math.floor(w / 5), x = Math.round(((k + 0.5) / n) * w - dw / 2);
      R(c, x, d + 1, dw, f - 1, k === 1 ? '#121316' : '#34373c');
      if (k !== 1) for (let y = d + 2; y < d + f - 1; y += 2) R(c, x, y, dw, 1, '#5a5e64');
      else R(c, x + 3, d + f - 4, dw - 6, 3, '#8a6a2a');
      for (let y = d + 1; y < d + f; y += 2) {
        R(c, x - 2, y, 2, 1, '#f0b020');
        R(c, x + dw, y, 2, 1, '#f0b020');
      }
    }
  }
}

function paintArmory(c: C, w: number, d: number, f: number, seed: number): void {
  const col = '#4e5440';
  slab(c, 0, 0, w, d, col);
  for (let x = 0; x < w; x += 16) R(c, x, 1, 1, d - 2, shade(col, -0.22));
  for (let y = 0; y < d; y += 16) R(c, 1, y, w - 2, 1, shade(col, -0.22));
  // The sandbagged AA gun.
  const gx = w * 0.7, gy = d * 0.45;
  sandbags(c, gx - 16, gy - 14, 32, 28);
  disc(c, gx, gy, 7, '#2e3228');
  disc(c, gx, gy, 5, '#4a5040');
  R(c, gx, gy - 2.5, 14, 2, '#1e2018');
  R(c, gx, gy + 0.5, 14, 2, '#1e2018');
  // Ammunition.
  for (let k = 0; k < 8; k++) crate(c, 8 + (k % 4) * 9, 8 + Math.floor(k / 4) * 9, 7, '#5a6a3a');
  for (let k = 0; k < 5; k++) drum(c, 12 + k * 6, d - 10, '#7a8a4a');
  pxMini(c, 'ARMORY', w * 0.3, d * 0.62, '#e06a20', 'center', null, 2);
  face(c, w, d, f, '#3e4234', { seed });
  if (f >= 3) {
    const dw = Math.floor(w * 0.22), x = Math.floor(w * 0.39);
    for (let k = 0; k < dw; k++) R(c, x + k, d + 1, 1, f - 1, Math.floor((k + d) / 3) % 2 ? '#141414' : '#e0a020');
    R(c, x - 3, d + 1, 2, 2, '#ff3020');
  }
}

function paintGatehouse(c: C, w: number, d: number, f: number, seed: number): void {
  const col = '#7a776c';
  slab(c, 0, 0, w, d, col);
  R(c, 4, 4, w - 8, d - 8, shade(col, -0.12));
  // Parapet merlons.
  for (let x = 0; x < w; x += 6) {
    R(c, x, 0, 4, 3, shade(col, 0.2));
    R(c, x, d - 3, 4, 3, shade(col, 0.05));
  }
  for (let y = 0; y < d; y += 6) {
    R(c, 0, y, 3, 4, shade(col, 0.15));
    R(c, w - 3, y, 3, 4, shade(col, -0.05));
  }
  sandbags(c, 10, 10, 30, 20);
  // Searchlight and flag.
  disc(c, w - 18, 14, 5, '#2a2c30');
  disc(c, w - 18, 14, 3.4, '#fff4c0');
  R(c, w - 36, 8, 1, 14, '#c0c0c0');
  R(c, w - 35, 8, 9, 6, seed % 2 ? '#c0392b' : '#2a6ab0');
  R(c, w - 35, 10, 9, 2, '#f0f0e8');
  for (let k = 0; k < 4; k++) crate(c, 14 + k * 9, d - 16, 7, '#6a5a3a');
  face(c, w, d, f, '#57554c', { seed });
  for (let x = 6; x < w - 4; x += 10) R(c, x, d + 1, 3, 1, '#101010');
}

function paintCommand(c: C, w: number, d: number, f: number, seed: number): void {
  const col = '#3e4a5a';
  slab(c, 0, 0, w, d, col);
  // Edge lights.
  for (let x = 2; x < w - 2; x += 6) {
    R(c, x, 1, 2, 1, '#40e0ff');
    R(c, x, d - 2, 2, 1, '#40e0ff');
  }
  // Helipad.
  const hx = w * 0.32, hy = d * 0.5, hr = Math.min(w, d) * 0.3;
  disc(c, hx, hy, hr, '#2c3440');
  ring(c, hx, hy, hr - 1.5, 2, '#f0c030');
  const u = Math.max(2, Math.floor(hr / 5));
  R(c, hx - u * 2, hy - u * 2.5, u, u * 5, '#f0f0f0');
  R(c, hx + u, hy - u * 2.5, u, u * 5, '#f0f0f0');
  R(c, hx - u, hy - u * 0.5, u * 2, u, '#f0f0f0');
  // Radar dish and antennas.
  const rx = w * 0.78, ry = d * 0.32;
  disc(c, rx, ry, 9, '#8a9098');
  disc(c, rx - 0.5, ry - 0.5, 8, '#d4d8dc');
  ring(c, rx, ry, 5, 1, '#b0b6bc');
  disc(c, rx, ry, 1.5, '#3a3e44');
  for (let k = 0; k < 4; k++) {
    const ax = w * 0.66 + k * 7, ay = d * 0.75;
    R(c, ax, ay - 6, 1, 8, '#b8bec6');
    R(c, ax - 1, ay - 6, 3, 1, '#ff3030');
  }
  pxMini(c, 'HQ', w * 0.78, d * 0.62, '#40e0ff', 'center', null, 2);
  face(c, w, d, f, '#2e3846', { win: '#2a6a8a', lit: 0.6, doors: 1, door: '#1a2430', seed });
}

function paintDepot(c: C, w: number, d: number, f: number, seed: number): void {
  const col = '#7a7466';
  slab(c, 0, 0, w, d, col);
  const r = rnd(seed);
  // Tarps and stacks of stores.
  for (let k = 0; k < 4; k++) {
    const tw = 30 + r() * 40, th = 20 + r() * 30, tx = r() * (w - tw), ty = r() * (d - th);
    const tc = ['#4a6a4a', '#3a5a7a', '#6a5a3a', '#5a4a6a'][k];
    R(c, tx, ty, tw, th, tc);
    R(c, tx, ty, tw, 1, shade(tc, 0.3));
    line(c, tx, ty, tx + tw, ty + th, shade(tc, -0.2));
    line(c, tx + tw, ty, tx, ty + th, shade(tc, -0.2));
    for (const [cx, cy] of [[tx, ty], [tx + tw - 1, ty], [tx, ty + th - 1], [tx + tw - 1, ty + th - 1]]) R(c, cx, cy, 1, 1, '#d0d0c0');
  }
  for (let k = 0; k < 14; k++) crate(c, 4 + r() * (w - 12), 4 + r() * (d - 12), 6 + Math.floor(r() * 3), r() < 0.5 ? '#8a6a40' : '#6a7a4a');
  for (let k = 0; k < 8; k++) drum(c, 6 + r() * (w - 12), 6 + r() * (d - 12), r() < 0.5 ? '#b03a2a' : '#2a6ab0');
  face(c, w, d, f, '#5a554a', { doors: 3, door: '#1c1a16', seed });
}

function paintStore(c: C, w: number, d: number, f: number, seed: number): void {
  const col = '#7a5a3a';
  slab(c, 0, 0, w, d, col);
  corrugate(c, 2, 2, w - 4, d - 4, col, 4, false);
  R(c, 8, d / 2 - 8, w - 16, 16, '#2a2018');
  pxMini(c, 'SUPPLY', w / 2, d / 2 - 5, '#ffd040', 'center', null, 2);
  acUnit(c, 6, 6);
  acUnit(c, w - 14, 6);
  weather(c, w, d, seed, 4);
  face(c, w, d, f, '#5a4430', { win: '#304050', lit: 0.75, doors: 1, door: '#20160e', seed });
}

function paintMess(c: C, w: number, d: number, f: number, seed: number): void {
  const col = '#6a6a60';
  slab(c, 0, 0, w, d, col);
  corrugate(c, 2, 2, w - 4, d - 4, col, 3, true);
  for (let k = 0; k < 3; k++) {
    const x = w * (0.25 + k * 0.25), y = d * 0.3;
    disc(c, x, y, 4.5, '#3a3a36');
    disc(c, x, y, 3, '#141414');
    ring(c, x, y, 4.5, 1, '#8a8a80');
  }
  for (let x = 10; x < w - 10; x += 22) vent(c, x, d * 0.6, 5);
  pxMini(c, 'MESS', w / 2, d * 0.72, 'rgba(240,235,220,0.6)', 'center', null, 2);
  weather(c, w, d, seed, 5);
  face(c, w, d, f, '#4f4f47', { win: '#303830', lit: 0.7, doors: 2, seed });
}

function paintStatue(c: C, w: number, d: number, f: number): void {
  slab(c, 0, 0, w, d, '#8e8c84');
  R(c, 3, 3, w - 6, d - 6, '#a6a49a');
  const cx = w / 2, cy = d / 2;
  // A bronze figure, arm raised toward the gate.
  disc(c, cx, cy + 1, 4, '#5a4020');
  disc(c, cx - 0.5, cy + 0.5, 3.2, '#8a6a34');
  R(c, cx - 6, cy, 12, 2, '#7a5a2a');
  R(c, cx + 3, cy - 6, 2, 7, '#8a6a34');
  disc(c, cx, cy - 1, 2, '#9a7a44');
  R(c, cx - 1, cy - 2, 1, 1, '#d8b870');
  face(c, w, d, f, '#6e6c64', { seed: 1 });
  R(c, cx - 3, d + 1, 6, Math.max(1, f - 2), '#b89a50');
}

/** A Quonset hut: a half-cylinder of corrugated steel along its length, lit on its north slope, end walls and doors. */
function paintQuonset(c: C, w: number, d: number, f: number, seed: number): void {
  const r = rnd(seed);
  const base = ['#6a7048', '#5e6a50', '#707060', '#6a6250'][Math.floor(r() * 4)];
  for (let y = 0; y < d; y++) {
    const t = (y + 0.5) / d;
    // The curve: brightest a third of the way down from the north edge, dark at the south eave.
    const k = 0.55 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.25)) * (1.1 - t * 0.6) - (t > 0.85 ? 0.25 : 0);
    R(c, 0, y, w, 1, shade(base, Math.max(-0.5, Math.min(0.35, k - 0.8))));
  }
  for (let x = 2; x < w - 2; x += 3) R(c, x, 1, 1, d - 2, 'rgba(0,0,0,0.16)');
  R(c, 0, 0, 3, d, shade(base, -0.3));
  R(c, w - 3, 0, 3, d, shade(base, -0.35));
  R(c, 0, 0, w, 1, shade(base, 0.2));
  // Roof vents and a stove pipe.
  for (let k = 0; k < 2; k++) disc(c, w * (0.3 + k * 0.4), d * 0.32, 1.6, '#2a2c2e');
  R(c, w * 0.8, d * 0.2, 2, 2, '#3a3a3a');
  weather(c, w, d, seed, 3);
  face(c, w, d, f, shade(base, -0.25), { win: '#28323c', lit: 0.3, doors: 1, door: '#3a2a1c', ribs: 3, seed });
}

/** An ammunition bunker: an earth-covered mound, a concrete headwall with a striped blast door. */
function paintAmmo(c: C, w: number, d: number, f: number, seed: number): void {
  for (let y = 0; y < d; y++) {
    const t = (y + 0.5) / d;
    const k = Math.sin(Math.PI * t);
    R(c, 2, y, w - 4, 1, shade('#6a7040', 0.25 * k - 0.15 - t * 0.12));
  }
  weather(c, w, d, seed, 6);
  const r = rnd(seed);
  for (let k = 0; k < w * 0.6; k++) R(c, 3 + r() * (w - 6), r() * (d - 2), 1, 1, r() < 0.5 ? '#8a9050' : '#4a5030');
  R(c, 0, d - 4, w, 4, '#8a8a84');
  R(c, 0, d - 4, w, 1, '#a8a8a2');
  face(c, w, d, f, '#6a6a64', { seed });
  const dw = Math.min(w * 0.4, 20);
  for (let k = 0; k < dw; k += 2) R(c, w / 2 - dw / 2 + k, d + 1, 2, Math.max(1, f - 1), Math.floor(k / 2) % 2 ? '#1a1a1a' : '#d8a020');
  R(c, w * 0.12, d + 1, 4, 2, '#c02020');
}

/** The flagpole's concrete base (the flag flies live overhead). */
function paintFlagpole(c: C, w: number, d: number): void {
  slab(c, 0, 0, w, d, '#9a9890');
  disc(c, w / 2, d / 2, 1.2, '#d8d8d0');
}

/** A gun bunker: a concrete pillbox under a camouflage net, sandbags round it, firing slits south (its twin gun turns
 * live on the roof). */
function paintBunker(c: C, w: number, d: number, f: number, seed: number): void {
  slab(c, 0, 0, w, d, '#7a786e');
  const r = rnd(seed);
  for (let k = 0; k < (w * d) / 40; k++) {
    c.fillStyle = r() < 0.5 ? 'rgba(70,82,44,0.55)' : 'rgba(96,78,46,0.5)';
    c.beginPath();
    c.ellipse(r() * w, r() * d, 3 + r() * 5, 2 + r() * 3, r() * 3, 0, Math.PI * 2);
    c.fill();
  }
  sandbags(c, 0, 0, w, d);
  disc(c, w / 2, d / 2, Math.min(w, d) * 0.3, '#3a3c3e');
  disc(c, w / 2, d / 2, Math.min(w, d) * 0.24, '#565a5e');
  face(c, w, d, f, '#5e5c54', { seed });
  for (let x = 6; x < w - 6; x += 10) R(c, x, d + Math.max(1, Math.floor(f * 0.35)), 6, Math.max(1, Math.floor(f * 0.2)), '#0e0e10');
}

function paintSandbag(c: C, w: number, d: number, f: number, seed: number): void {
  const col = '#a89868';
  for (let y = 0; y < d; y += 2) {
    for (let x = ((y / 2) % 2) * 1.5; x < w; x += 3) {
      R(c, x, y, 2.6, 1.8, hash2(x, y, seed) > 0.5 ? col : shade(col, -0.12));
      R(c, x, y, 2.6, 0.6, shade(col, 0.2));
    }
  }
  face(c, w, d, f, shade(col, -0.25), { seed });
}

/** A Czech hedgehog: three steel beams welded across each other. */
function paintHedgehog(c: C, w: number, d: number, f: number): void {
  line(c, 0.5, 0.5, w - 0.5, d - 0.5, '#2a2c30', 1.6);
  line(c, w - 0.5, 0.5, 0.5, d - 0.5, '#3a3d42', 1.6);
  line(c, w / 2, 0, w / 2, d, '#4a4e54', 1.2);
  R(c, w / 2 - 0.5, d / 2 - 0.5, 1, 1, '#8a8e94');
  if (f > 0) R(c, w / 2 - 1, d, 2, f, '#2a2c30');
}

/** A searchlight mast's foot (the light and its beam are drawn live). */
function paintSearchlight(c: C, w: number, d: number, f: number): void {
  slab(c, 0, 0, w, d, '#4a4d54');
  disc(c, w / 2, d / 2, Math.min(w, d) * 0.4, '#2a2c30');
  if (f > 0) {
    R(c, w / 2 - 1, d, 2, f, '#3a3d42');
    for (let y = d + 2; y < d + f; y += 4) R(c, w / 2 - 2, y, 4, 1, '#5a5e66');
  }
}

const PAINT: Record<Struct['kind'], (c: C, w: number, d: number, f: number, seed: number) => void> = {
  home: paintHome, stall: paintStall, tank: paintTank, watertower: paintWaterTower, mast: paintMast, barracks: paintBarracks,
  workshop: paintWorkshop, bar: paintBar, clinic: paintClinic, warehouse: paintWarehouse, greenhouse: paintGreenhouse,
  garage: paintGarage, armory: paintArmory, gatehouse: paintGatehouse, command: paintCommand, depot: paintDepot,
  store: paintStore, mess: paintMess, statue: paintStatue, quonset: paintQuonset, ammo: paintAmmo, flagpole: paintFlagpole,
  bunker: paintBunker, sandbag: paintSandbag, hedgehog: paintHedgehog, searchlight: paintSearchlight,
};

const structCache: (Sprite | undefined)[] = [];

/** Has STRUCTS[i]'s sprite been painted yet? */
export const hasStructSprite = (i: number): boolean => !!structCache[i];

/** The sprite for STRUCTS[i] (painted the first time it's needed). */
export function structSprite(i: number): Sprite {
  const have = structCache[i];
  if (have) return have;
  const sp = paintStruct(STRUCTS[i], i);
  structCache[i] = sp;
  return sp;
}

const frontCache: (Sprite | undefined)[] = [];

/** The sprite for FRONT_STRUCTS[i], the works outside the gate. */
export function frontSprite(i: number): Sprite {
  const have = frontCache[i];
  if (have) return have;
  const sp = paintStruct(FRONT_STRUCTS[i], 500 + i);
  frontCache[i] = sp;
  return sp;
}

function paintStruct(s: Struct, i: number): Sprite {
  const w = (s.x1 - s.x0) * ART_PX, d = (s.y1 - s.y0) * ART_PX, f = faceTiles(s.h) * ART_PX;
  const cv = makeCanvas(w, d + f);
  const c = ctx2d(cv);
  const seed = (Math.floor(s.x0 * 7 + s.y0 * 13) >>> 0) + i;
  PAINT[s.kind](c, w, d, f, seed);
  finish(cv, seed, s.kind === 'greenhouse' ? 0.03 : 0.07);
  return { c: cv, x: s.x0, y: s.y0 };
}

// ---------------------------------------------------------------- the wall and its towers

let wallCache: Sprite[] | null = null;

/** The wall's four sides (the south one in two halves either side of the gate). */
export function wallSprites(): Sprite[] {
  if (wallCache) return wallCache;
  const C = COMPOUND;
  const f = faceTiles(30) * ART_PX, t = C.wall * ART_PX;
  const out: Sprite[] = [];
  const horiz = (x0: number, x1: number, y: number, outerTop: boolean, seed: number): void => {
    const w = (x1 - x0) * ART_PX;
    const cv = makeCanvas(w, t + f);
    const c = ctx2d(cv);
    const top = '#7c7f86';
    R(c, 0, 0, w, t, top);
    // The walkway (inner side), the parapet (outer side) with its merlons.
    const walk = outerTop ? [6, t - 6] : [0, t - 6];
    R(c, 0, walk[0], w, walk[1], shade(top, 0.08));
    for (let x = 0; x < w; x += 20) R(c, x, walk[0], 1, walk[1], shade(top, -0.18));
    const py = outerTop ? 0 : t - 5;
    R(c, 0, py, w, 5, shade(top, -0.2));
    for (let x = 0; x < w; x += 7) {
      R(c, x, py + (outerTop ? 0 : 1), 4, 4, shade(top, 0.22));
      R(c, x, py + (outerTop ? 3 : 4), 4, 1, shade(top, -0.3));
    }
    for (let x = 12; x < w; x += 60) R(c, x, outerTop ? t - 2 : 1, 2, 1, '#ffd060');
    R(c, 0, t - 1, w, 1, shade(top, -0.45));
    face(c, w, t, f, '#50535a', { ribs: 10, seed });
    weather(c, w, t + f, seed, Math.floor(w / 30));
    finish(cv, seed, 0.05);
    out.push({ c: cv, x: x0, y });
  };
  const vert = (x: number, outerLeft: boolean, seed: number): void => {
    const h = (C.y1 - C.y0) * ART_PX;
    const cv = makeCanvas(t, h);
    const c = ctx2d(cv);
    const top = '#7c7f86';
    R(c, 0, 0, t, h, top);
    const px = outerLeft ? 0 : t - 5;
    R(c, outerLeft ? 6 : 0, 0, t - 6, h, shade(top, 0.08));
    for (let y = 0; y < h; y += 20) R(c, outerLeft ? 6 : 0, y, t - 6, 1, shade(top, -0.18));
    R(c, px, 0, 5, h, shade(top, -0.2));
    for (let y = 0; y < h; y += 7) {
      R(c, px + (outerLeft ? 0 : 1), y, 4, 4, shade(top, 0.22));
      R(c, px + (outerLeft ? 0 : 1), y + 3, 4, 1, shade(top, -0.3));
    }
    for (let y = 12; y < h; y += 60) R(c, outerLeft ? t - 2 : 1, y, 1, 2, '#ffd060');
    R(c, outerLeft ? t - 1 : 0, 0, 1, h, shade(top, outerLeft ? -0.35 : 0.2));
    weather(c, t, h, seed, Math.floor(h / 30));
    finish(cv, seed, 0.05);
    out.push({ c: cv, x, y: C.y0 });
  };
  horiz(C.x0, C.x1, C.y0, true, 11);
  horiz(C.x0, -C.gateHalf, C.y1 - C.wall, false, 12);
  horiz(C.gateHalf, C.x1, C.y1 - C.wall, false, 13);
  vert(C.x0, true, 14);
  vert(C.x1 - C.wall, false, 15);
  wallCache = out;
  return out;
}

const towerCache = new Map<string, HTMLCanvasElement>();

/** A tower's roof and face (its gun is drawn live on top). */
export function towerSprite(tw: Tower): Sprite {
  const key = tw.gate ? 'g' : 't';
  let cv = towerCache.get(key);
  if (!cv) {
    const s = tw.half * 2 * ART_PX, f = faceTiles(tw.gate ? 64 : 48) * ART_PX;
    cv = makeCanvas(s, s + f);
    const c = ctx2d(cv);
    const top = tw.gate ? '#6c6a62' : '#686b72';
    slab(c, 0, 0, s, s, top);
    R(c, 4, 4, s - 8, s - 8, shade(top, -0.22));
    for (let k = 0; k < s; k += 6) {
      R(c, k, 0, 4, 3, shade(top, 0.25));
      R(c, 0, k, 3, 4, shade(top, 0.18));
      R(c, s - 3, k, 3, 4, shade(top, -0.1));
      R(c, k, s - 3, 4, 3, shade(top, -0.05));
    }
    sandbags(c, 5, 5, s - 10, s - 10);
    R(c, 7, s - 12, 4, 4, '#2a2c30');
    R(c, 7, s - 12, 4, 1, '#8a8e94');
    face(c, s, s, f, tw.gate ? '#4e4c46' : '#4a4d54', { seed: 5 });
    R(c, s / 2 - 1, s + 3, 2, 4, '#101010');
    R(c, s / 2 - 1, s + 2, 2, 1, '#ffd060');
    if (tw.gate) for (let x = 0; x < s; x++) R(c, x, s + f - 5, 1, 3, Math.floor(x / 3) % 2 ? '#141414' : '#e0a020');
    finish(cv, tw.gate ? 21 : 22, 0.05);
    towerCache.set(key, cv);
  }
  return { c: cv, x: tw.x - tw.half, y: tw.y - tw.half };
}
