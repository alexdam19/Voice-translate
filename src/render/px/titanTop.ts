import { hash2, makeCanvas, mix, shade } from './pixels';
import { TOP_MARKS, TOP_PX, topScale } from './shipArt';
import { TOROID_SHEET } from './toroids';

/**
 * The Titan's top view, painted from code rather than cut from a picture, so it holds up at every zoom: the closer
 * the camera, the finer the detail it's painted with (panel seams, then walkway gratings and hand rails, then rivets,
 * weld lines, grime and scratches).
 *
 *  - Eight crawler banks, four a side, each under its armoured fender (their tread links are drawn moving, frame
 *    by frame, by the sprite painter), with suspension arms back to the hull.
 *  - The hull: armour skirts of slanted plates down both flanks, the deck in 5 m plates on the build grid, a
 *    walkway with hand rails down each side, the Spine (the long raised housing over the elevators) down the middle,
 *    broken round the main batteries' barbettes.
 *  - The bow: chevron armour stepping down to the nose, the dozer plough across it, and the bridge (the cabin you
 *    drive from) on the nose with its window band lit.
 *  - The stern: the engine house with its radiators and fans, a row of exhaust stacks (one per jet of the fitted
 *    engine), the engine pods running out to their nozzles, cargo containers and a deck crane.
 *  - The toroids' pylons (the rings themselves are drawn turning by the sprite painter), light strips in the class
 *    colour, lamps, hazard stripes, the hull number and a helipad.
 *
 * Nothing on it is a gun: every gun on the Titan is a real, working one, drawn where it's mounted, turned to its
 * target. Painted in hull metres (forward +x, starboard +y); cached per size, colours and detail level.
 */

export interface TopPal {
  d0: string; d1: string; d2: string; d3: string; d4: string; d5: string; d6: string; d7: string; hi: string;
  glow: string; red: string; amber: string; hazard: string; tread: string; rail: string; glass: string; rust: string;
}

export const PAL_PLAYER: TopPal = {
  d0: '#07090d', d1: '#11151c', d2: '#1a1f28', d3: '#252b36', d4: '#313946', d5: '#3e4757', d6: '#4f5a6d', d7: '#687790', hi: '#8fa3c2',
  glow: '#3ab4ff', red: '#ff3a30', amber: '#ffb13a', hazard: '#d8a820', tread: '#0c0d10', rail: '#c8a030', glass: '#9ae6ff', rust: '#6a3a22',
};
const PAL_RIVAL: TopPal = { ...PAL_PLAYER, d3: '#2c2124', d4: '#3a2a30', d5: '#48343b', d6: '#5a414a', d7: '#76545f', hi: '#a88290', glow: '#ff3b30', glass: '#ffb0a0' };
const PAL_WRECK: TopPal = {
  ...PAL_PLAYER, d3: '#1c1a19', d4: '#262320', d5: '#2e2a26', d6: '#3a3430', d7: '#4a423a', hi: '#5a5048', glow: '#000000', red: '#3a1a14', amber: '#3a2a14', hazard: '#4a3a1a', rail: '#4a3a20', glass: '#1a1a1a',
};
const CLASS_GLOW: Record<string, string> = { juggernaut: '#3ab4ff', bastion: '#ffd740', ark: '#76ff03', nightrunner: '#b388ff', dredge: '#ffab40' };

export function topPalette(kind: string, klass: string, dead: boolean): TopPal {
  if (dead) return PAL_WRECK;
  if (kind === 'rival') return PAL_RIVAL;
  if (kind === 'remote') return { ...PAL_PLAYER, glow: '#e040fb' };
  return { ...PAL_PLAYER, glow: CLASS_GLOW[klass] ?? PAL_PLAYER.glow };
}

/** Where each crawler bank is (hull metres): 0-3 port bow to stern, 4-7 starboard. `tread` is the outboard strip. */
export function crawlerRects(L: number, W: number): { x0: number; x1: number; y0: number; y1: number; ty0: number; ty1: number; i: number }[] {
  const hl = L / 2, hw = W / 2;
  const out: { x0: number; x1: number; y0: number; y1: number; ty0: number; ty1: number; i: number }[] = [];
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < 4; i++) {
      const xa = hl - (i + 1) * (L / 4) + 2, xb = hl - i * (L / 4) - 2;
      const y0 = s ? hw * 0.76 : -hw, y1 = s ? hw : -hw * 0.76;
      // The tread shows outboard of the fender.
      const ty0 = s ? hw * 0.85 : -hw, ty1 = s ? hw : -hw * 0.85;
      out.push({ x0: xa, x1: xb, y0, y1, ty0, ty1, i: s * 4 + i });
    }
  }
  return out;
}

/** Where the exhaust stacks stand (hull metres): a row across the engine house, one per jet. */
export function stackSpots(L: number, W: number, jets: number): { x: number; y: number }[] {
  const n = Math.max(2, jets);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ x: -L / 2 + 16, y: ((i + 0.5) / n - 0.5) * (W / 2) * 1.1 });
  return out;
}

/** The engine pods' nozzles (hull metres), the big inner pair first. */
export function nozzleSpots(L: number, W: number): { x: number; y: number; big: boolean }[] {
  const { kx, ky } = topScale(L, W);
  return TOP_MARKS.nozzles.map(([px, py]) => ({ x: (px - TOP_PX.cx) * kx, y: (py - TOP_PX.cy) * ky, big: Math.abs(py - TOP_PX.cy) < 70 }));
}

type Pt = [number, number];

/** The hull's outline (not the crawlers): square stern with chamfered corners, straight flanks, the tapered bow. */
export function bodyOutline(L: number, W: number): Pt[] {
  const hl = L / 2, hw = W / 2;
  const half: Pt[] = [[-hl * 1.03, -hw * 0.7], [-hl * 1.03 + 5, -hw * 0.78], [hl * 0.6, -hw * 0.78], [hl * 0.93, -hw * 0.42], [hl * 1.06, -hw * 0.16]];
  return [...half, ...half.slice().reverse().map(([a, b]): Pt => [a, -b])];
}

export interface TopArt {
  top: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  /** Pixels per metre of `top` and `glow`. */
  d: number;
  dg: number;
  /** The metres the canvases cover: from (x0, y0), w by h. */
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export interface TopSil {
  shadow: HTMLCanvasElement;
  flash: HTMLCanvasElement;
  x0: number;
  y0: number;
  w: number;
  h: number;
}

const cache = new Map<string, TopArt>();
const sils = new Map<string, TopSil>();

function extent(L: number, W: number): { x0: number; y0: number; w: number; h: number } {
  const hl = L / 2, hw = W / 2;
  const x0 = -hl * 1.12 - 2, x1 = hl * 1.14 + 2;
  return { x0, y0: -hw - 4, w: x1 - x0, h: W + 8 };
}

/** The painted top at about `ppm` pixels per metre (in half-octave steps, capped so the canvas stays sane). */
export function titanTop(L: number, W: number, pal: TopPal, palKey: string, jets: number, rear: boolean, ppm: number): TopArt {
  const e = extent(L, W);
  const dmax = Math.min(8, 2600 / e.w);
  const d = Math.min(dmax, Math.max(0.7, Math.pow(2, Math.ceil(Math.log2(Math.max(0.1, ppm)) * 2) / 2)));
  const key = `${L}|${W}|${palKey}|${jets}|${rear}|${d.toFixed(3)}`;
  let a = cache.get(key);
  if (a) {
    // Most recently used last.
    cache.delete(key);
    cache.set(key, a);
    return a;
  }
  a = paint(L, W, pal, jets, rear, d, e);
  cache.set(key, a);
  while (cache.size > 10) cache.delete(cache.keys().next().value!);
  return a;
}

/** Black and white silhouettes of the whole footprint (for the drop shadow and the hit flash). */
export function titanSil(L: number, W: number): TopSil {
  const key = `${L}|${W}`;
  let s = sils.get(key);
  if (s) return s;
  const e = extent(L, W);
  const d = 1;
  const mk = (col: string): HTMLCanvasElement => {
    const cv = makeCanvas(e.w * d, e.h * d);
    const x = cv.getContext('2d')!;
    x.setTransform(d, 0, 0, d, -e.x0 * d, -e.y0 * d);
    x.fillStyle = col;
    poly(x, bodyOutline(L, W));
    x.fill();
    for (const r of crawlerRects(L, W)) x.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    for (const n of nozzleSpots(L, W)) x.fillRect(n.x, n.y - (n.big ? 3.5 : 2.5), -L * 0.46 - n.x, n.big ? 7 : 5);
    x.fillRect(L / 2 * 1.06, -W * 0.25, 4, W * 0.5);
    return cv;
  };
  s = { shadow: mk('#000'), flash: mk('#fff'), ...e };
  sils.set(key, s);
  return s;
}

function poly(x: CanvasRenderingContext2D, pts: Pt[]): void {
  x.beginPath();
  pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
  x.closePath();
}

function paint(L: number, W: number, P: TopPal, jets: number, rear: boolean, d: number, e: { x0: number; y0: number; w: number; h: number }): TopArt {
  const hl = L / 2, hw = W / 2;
  const cv = makeCanvas(e.w * d, e.h * d);
  const x = cv.getContext('2d')!;
  x.setTransform(d, 0, 0, d, -e.x0 * d, -e.y0 * d);
  x.imageSmoothingEnabled = false;
  const px = 1 / d;
  const dg = Math.min(d, 1.5);
  const gcv = makeCanvas(e.w * dg, e.h * dg);
  const gx = gcv.getContext('2d')!;
  gx.setTransform(dg, 0, 0, dg, -e.x0 * dg, -e.y0 * dg);
  const R = (a: number, b: number, w: number, h: number, c: string): void => {
    x.fillStyle = c;
    x.fillRect(a, b, w, h);
  };
  /** A raised block: face, lit (port/north-west) edges, shaded (starboard/aft) edges, outline. */
  const slab = (a: number, b: number, w: number, h: number, c: string, bev = 0.5): void => {
    R(a - px, b - px, w + 2 * px, h + 2 * px, P.d0);
    R(a, b, w, h, c);
    const bv = Math.max(px, bev);
    R(a, b, w, bv, shade(c, 0.28));
    R(a + w - bv, b, bv, h, shade(c, 0.14));
    R(a, b + h - bv, w, bv, shade(c, -0.4));
    R(a, b, bv, h, shade(c, -0.25));
  };
  const disc = (cx: number, cy: number, r: number, c: string): void => {
    x.fillStyle = c;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  };
  /** A light strip: on the hull and soft on the glow layer. */
  const strip = (a: number, b: number, a2: number, b2: number, col: string, wdt = 0.6): void => {
    x.strokeStyle = col;
    x.lineWidth = wdt;
    x.beginPath();
    x.moveTo(a, b);
    x.lineTo(a2, b2);
    x.stroke();
    gx.strokeStyle = col;
    gx.lineCap = 'round';
    for (const [lw, al] of [[wdt * 7, 0.12], [wdt * 4, 0.22], [wdt * 2, 0.45], [wdt, 0.9]] as const) {
      gx.globalAlpha = al;
      gx.lineWidth = lw;
      gx.beginPath();
      gx.moveTo(a, b);
      gx.lineTo(a2, b2);
      gx.stroke();
    }
    gx.globalAlpha = 1;
  };
  const lamp = (cx: number, cy: number, r: number, col: string): void => {
    disc(cx, cy, r, col);
    const g = gx.createRadialGradient(cx, cy, 0, cx, cy, r * 5);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    gx.fillStyle = g;
    gx.fillRect(cx - r * 5, cy - r * 5, r * 10, r * 10);
  };
  const H = (i: number, j: number, s: number): number => hash2(Math.floor(i), Math.floor(j), s);
  const body = bodyOutline(L, W);
  const bowX = hl * 0.6;
  const pivot: Pt = [0.0094 * L, 0.0151 * W];
  const barbR = L * 0.055;
  const rearX = -0.3 * L, rearR = barbR * 0.72;

  // ---------------------------------------------------------------- the crawler banks
  const crawlers = crawlerRects(L, W);
  for (const c of crawlers) {
    const port = c.i < 4;
    const cw = c.x1 - c.x0, ch = c.y1 - c.y0;
    // Suspension arms back to the hull.
    for (let k = 0; k < 4; k++) {
      const ax = c.x0 + cw * (0.14 + k * 0.24);
      R(ax - 0.8, port ? -hw * 0.8 : hw * 0.72, 1.6, hw * 0.08, P.d1);
    }
    // The track frame and the tread's dark bed (its links are drawn moving).
    R(c.x0 - px, c.y0 - px, cw + 2 * px, ch + 2 * px, P.d0);
    R(c.x0, c.y0, cw, ch, P.d1);
    R(c.x0, c.ty0, cw, c.ty1 - c.ty0, P.tread);
    // Sprocket and idler at the ends.
    for (const ex of [c.x0 + 1.4, c.x1 - 1.4]) {
      disc(ex, (c.ty0 + c.ty1) / 2, (c.ty1 - c.ty0) * 0.42, P.d3);
      if (d >= 2) disc(ex, (c.ty0 + c.ty1) / 2, (c.ty1 - c.ty0) * 0.15, P.d6);
    }
    // The fender over its inboard half.
    const fy0 = port ? -hw * 0.87 : hw * 0.76, fh = hw * 0.11;
    slab(c.x0 + 1, fy0, cw - 2, fh, P.d4, 0.5);
    if (d >= 1.4) for (let k = 1; k < 5; k++) R(c.x0 + 1 + ((cw - 2) * k) / 5, fy0 + 0.4, px, fh - 0.8, P.d2);
    if (d >= 3) for (let k = 0; k < cw - 3; k += 2.5) {
      R(c.x0 + 2 + k, fy0 + 0.5, 0.3, 0.3, P.d7);
      R(c.x0 + 2 + k, fy0 + fh - 0.8, 0.3, 0.3, P.d7);
    }
    // Hazard chevrons on the leading fender and an amber marker.
    if (c.i % 4 === 0 && d >= 1) {
      for (let k = 0; k < 4; k++) R(c.x1 - 5 + k * 1.2, fy0 + 0.3, 0.6, fh - 0.6, k % 2 ? P.d0 : P.hazard);
      lamp(c.x1 - 0.8, port ? -hw * 0.98 : hw * 0.98, 0.45, P.amber);
    }
    if (c.i % 4 === 3) lamp(c.x0 + 0.8, port ? -hw * 0.98 : hw * 0.98, 0.45, P.red);
  }

  // ---------------------------------------------------------------- the hull
  x.save();
  poly(x, body);
  x.fillStyle = P.d3;
  x.fill();
  x.lineWidth = Math.max(px, 0.35);
  x.strokeStyle = P.d0;
  x.stroke();
  x.clip();
  // The deck: 10 x 5 m steel plates laid staggered, each a slightly different tone.
  for (let row = Math.floor(-hw * 0.7 / 5); row * 5 < hw * 0.7; row++) {
    const b0 = row * 5;
    for (let a = Math.floor(-hl * 1.05 / 10) * 10 - (row & 1 ? 5 : 0); a < hl * 1.07; a += 10) {
      const k = H(a / 5, row, 3);
      const tone = mix(P.d4, P.d5, 0.2 + k * 0.4);
      if (d >= 1.2) {
        R(a, b0, 10, 5, P.d2);
        R(a + 0.15, b0 + 0.15, 9.7, 4.7, tone);
        R(a + 0.15, b0 + 0.15, 9.7, Math.max(px, 0.18), shade(tone, 0.12));
      } else R(a, b0, 10, 5, tone);
      // Weld beads and rivets up close.
      if (d >= 5) {
        for (let r = 0.6; r < 9.6; r += 0.8) R(a + r, b0 + 0.35, 0.16, 0.16, shade(tone, 0.25));
        for (let r = 0.6; r < 4.8; r += 0.8) R(a + 0.35, b0 + r, 0.16, 0.16, shade(tone, 0.25));
      }
      // Grime, rust and the odd scratch.
      if (d >= 2 && k > 0.7) {
        x.globalAlpha = 0.28;
        R(a + H(a, b0, 5) * 6, b0 + H(b0, a, 6) * 3, 2 + k * 2, 0.6 + k * 0.8, k > 0.9 ? P.rust : P.d1);
        x.globalAlpha = 1;
      }
      if (d >= 4 && k < 0.14) {
        x.globalAlpha = 0.4;
        R(a + 1 + k * 20, b0 + 1 + k * 18, 3.5, Math.max(px, 0.1), P.hi);
        x.globalAlpha = 1;
      }
    }
  }
  // The sun (from the north-west of the hull) warms the port side of the deck.
  const sunG = x.createLinearGradient(0, -hw * 0.7, 0, hw * 0.7);
  sunG.addColorStop(0, 'rgba(255,255,255,0.07)');
  sunG.addColorStop(1, 'rgba(0,0,0,0.14)');
  x.fillStyle = sunG;
  x.fillRect(-hl * 1.1, -hw * 0.7, L * 1.2, hw * 1.4);
  // Pipe runs along the deck from the engine house to the bow.
  if (d >= 1.2) for (const s of [-1, 1]) for (const [off, col] of [[0.24, P.d6], [0.27, P.rust]] as const) {
    R(-hl * 0.64, s * hw * off - 0.35, hl * 1.2, 0.7, P.d0);
    R(-hl * 0.64, s * hw * off - 0.3, hl * 1.2, 0.6, col);
    R(-hl * 0.64, s * hw * off - 0.3, hl * 1.2, Math.max(px, 0.15), shade(col, 0.3));
    if (d >= 3) for (let q = -hl * 0.6; q < hl * 0.55; q += 6) R(q, s * hw * off - 0.5, 0.4, 1, P.d7);
  }
  // The armour belt down both flanks: slanted plates falling away from the deck edge, the port (sunward) side lit.
  for (const s of [-1, 1]) {
    for (let a = -hl * 1.03 + 5; a < bowX; a += 7) {
      const w = Math.min(7, bowX - a) - 0.3;
      const y0 = s < 0 ? -hw * 0.78 : hw * 0.66, bh = hw * 0.12;
      const gr = x.createLinearGradient(0, y0, 0, y0 + bh);
      const lit = s < 0;
      const k = H(a, s, 8) * 0.1;
      gr.addColorStop(0, lit ? shade(P.d6, 0.1 + k) : shade(P.d4, -0.1 - k));
      gr.addColorStop(1, lit ? shade(P.d5, k) : shade(P.d3, -0.2 - k));
      x.fillStyle = gr;
      x.fillRect(a, y0, w, bh);
      // The deck-edge coping, lit.
      R(a, s < 0 ? -hw * 0.66 - 0.5 : hw * 0.66, w, 0.5, P.d7);
      R(a + w, y0, 0.3, bh, P.d1);
      if (d >= 3) for (let r = 1; r < w - 0.5; r += 1.6) {
        R(a + r, y0 + 0.7, 0.28, 0.28, P.d7);
        R(a + r, y0 + bh - 1, 0.28, 0.28, P.d7);
      }
    }
  }
  // The bow: chevron plates stepping down to the nose, lit on the port facets.
  for (let k = 0; k < 9; k++) {
    const a = bowX + k * ((hl * 1.06 - bowX) / 9);
    const t = (a - bowX) / (hl * 1.06 - bowX);
    const yw = hw * (0.78 - t * 0.62);
    const step = (hl * 1.06 - bowX) / 9;
    for (const s of [-1, 1]) {
      x.fillStyle = k % 2 ? (s < 0 ? P.d6 : P.d4) : s < 0 ? P.d5 : P.d3;
      x.beginPath();
      x.moveTo(a, s * yw);
      x.lineTo(a + step * 2.2, 0);
      x.lineTo(a + step * 3.2, 0);
      x.lineTo(a + step, s * yw);
      x.closePath();
      x.fill();
    }
  }
  // Hazard stripes along the nose.
  for (let b = -hw * 0.16; b < hw * 0.16; b += 1.2) R(hl * 1.06 - 1.1, b, 1.1, 0.6, Math.floor(b / 1.2) % 2 ? P.d0 : P.hazard);
  x.restore();

  // Walkways down both sides: steel grating between yellow hand rails, posts, and a line of deck bollards.
  for (const s of [-1, 1]) {
    const y0 = s * hw * 0.62 - 1.2, a0 = -hl * 0.9, a1 = bowX + 2;
    R(a0, y0, a1 - a0, 2.4, P.d2);
    if (d >= 3) {
      x.globalAlpha = 0.6;
      for (let a = a0; a < a1; a += 0.5) R(a, y0 + 0.1, Math.max(px, 0.1), 2.2, P.d1);
      x.globalAlpha = 1;
    }
    if (d >= 1.4) {
      R(a0, y0 - 0.1, a1 - a0, Math.max(px, 0.18), P.rail);
      R(a0, y0 + 2.4 - 0.08, a1 - a0, Math.max(px, 0.18), P.rail);
    }
    if (d >= 4) for (let a = a0; a < a1; a += 2.5) {
      R(a, y0 - 0.2, 0.3, 0.3, shade(P.rail, -0.3));
      R(a, y0 + 2.2, 0.3, 0.3, shade(P.rail, -0.3));
    }
  }

  // Barbettes: the rings the main batteries turn on.
  const barbette = (cx: number, cy: number, r: number): void => {
    disc(cx, cy, r + 0.6, P.d0);
    disc(cx, cy, r, P.d5);
    disc(cx, cy, r * 0.86, P.d2);
    if (d >= 1.5) for (let k = 0; k < 24; k++) {
      const an = (k / 24) * Math.PI * 2;
      R(cx + Math.cos(an) * r * 0.93 - 0.2, cy + Math.sin(an) * r * 0.93 - 0.2, 0.4, 0.4, P.d7);
    }
  };
  barbette(pivot[0], pivot[1], barbR);
  if (rear) barbette(rearX, 0, rearR);

  // The Spine: the long raised housing over the elevators, broken round the barbettes.
  const sw = Math.max(4, hw * 0.1);
  const spans: [number, number][] = [];
  let s0 = -hl * 0.62;
  const cuts = [[pivot[0] - barbR - 1, pivot[0] + barbR + 1], ...(rear ? [[rearX - rearR - 1, rearX + rearR + 1]] : [])].sort((a, b) => a[0] - b[0]);
  for (const [c0, c1] of cuts) {
    if (c0 > s0) spans.push([s0, c0]);
    s0 = Math.max(s0, c1);
  }
  if (hl * 0.55 > s0) spans.push([s0, hl * 0.55]);
  for (const [a, b] of spans) {
    // Its shadow on the deck (south-east), the lower tier, then the upper tier with its shadow on the lower.
    x.globalAlpha = 0.4;
    R(a + 1.5, -sw * 1.7 + 2.2, b - a, sw * 3.4, P.d0);
    x.globalAlpha = 1;
    slab(a, -sw * 1.7, b - a, sw * 3.4, P.d4, 0.6);
    if (d >= 1.2) for (let q = a + 4; q < b - 1; q += 8) R(q, -sw * 1.7 + 0.4, px * 1.5, sw * 3.4 - 0.8, P.d2);
    // Windows along both sides of the lower tier.
    if (d >= 2) for (let q = a + 1.5; q < b - 1.5; q += 2.2) {
      const on = H(q, 1, 12) > 0.35;
      R(q, -sw * 1.7 + 0.4, 1.1, 0.6, on ? shade(P.glass, -0.2) : P.d1);
      R(q, sw * 1.7 - 1, 1.1, 0.6, on && H(q, 2, 12) > 0.5 ? shade(P.glass, -0.35) : P.d1);
    }
    x.globalAlpha = 0.35;
    R(a + 3 + 0.8, -sw + 1.2, b - a - 6, sw * 2, P.d0);
    x.globalAlpha = 1;
    slab(a + 3, -sw, b - a - 6, sw * 2, P.d5, 0.6);
    // Roof hatches and vents along it.
    for (let q = a + 5; q < b - 6; q += 16) {
      slab(q, -sw * 0.6, 2.6, 2.6, P.d6, 0.3);
      if (d >= 2.5) {
        R(q + 0.5, -sw * 0.6 + 1.2, 1.6, 0.2, P.d2);
        R(q + 1.2, -sw * 0.6 + 0.5, 0.2, 1.6, P.d2);
      }
      if (d >= 1.5) for (let v = 0; v < 5; v++) R(q + 5 + v * 0.7, sw * 0.15, 0.35, sw * 0.6, P.d2);
    }
    // Elevator heads and an antenna mast with its red lamp.
    const mid = (a + b) / 2;
    if (b - a > 20) {
      slab(mid - 2.5, -sw * 1.7 - 1.5, 5, 3.2, P.d6, 0.4);
      slab(mid - 2.5, sw * 1.7 - 1.7, 5, 3.2, P.d6, 0.4);
      disc(mid + 6, 0, 0.8, P.d0);
      disc(mid + 6, 0, 0.6, P.d7);
      x.strokeStyle = P.d7;
      x.lineWidth = Math.max(px, 0.25);
      x.beginPath();
      x.moveTo(mid + 6, 0);
      x.lineTo(mid + 6 - 5, -3);
      x.stroke();
      lamp(mid + 1, -3, 0.35, P.red);
    }
    strip(a + 4, 0, b - 4, 0, P.glow, 0.35);
  }
  // Danger rings painted round the barbettes, lifeboats slung along the belt, vent towers, floodlight masts.
  if (d >= 1) {
    x.setLineDash([2, 1.4]);
    x.lineWidth = 0.5;
    x.strokeStyle = '#b8342a';
    for (const [cx, cy, r] of [[pivot[0], pivot[1], barbR + 2.5], ...(rear ? [[rearX, 0, rearR + 2]] : [])] as [number, number, number][]) {
      x.beginPath();
      x.arc(cx, cy, r, 0, Math.PI * 2);
      x.stroke();
    }
    x.setLineDash([]);
  }
  for (const s of [-1, 1]) {
    for (let a = -hl * 0.55; a < bowX - 8; a += 26) {
      const y0 = s * (hw * 0.62 + 2.2) - (s < 0 ? 1.8 : 0);
      x.fillStyle = P.d0;
      x.beginPath();
      x.roundRect(a - px, y0 - px, 6 + 2 * px, 1.8 + 2 * px, 0.9);
      x.fill();
      x.fillStyle = '#e8641a';
      x.beginPath();
      x.roundRect(a, y0, 6, 1.8, 0.9);
      x.fill();
      R(a + 0.6, y0 + 0.2, 4.8, Math.max(px, 0.3), '#ffa060');
      if (d >= 2.5) R(a + 2.6, y0 + 0.2, 0.8, 1.4, '#f0f0f0');
    }
  }
  for (const [vx, vy] of [[hl * 0.15, -hw * 0.45], [hl * 0.15, hw * 0.45], [-hl * 0.35, -hw * 0.2], [-hl * 0.35, hw * 0.2], [hl * 0.5, hw * 0.3]] as Pt[]) {
    x.globalAlpha = 0.35;
    R(vx - 1.4, vy - 1.4, 3.6, 3.6, P.d0);
    x.globalAlpha = 1;
    slab(vx - 2, vy - 2, 4, 4, P.d5, 0.35);
    disc(vx, vy, 1.4, P.d1);
    if (d >= 2) for (let k = 0; k < 4; k++) {
      const an = (k / 4) * Math.PI * 2 + 0.4;
      R(vx + Math.cos(an) * 0.7 - 0.15, vy + Math.sin(an) * 0.7 - 0.15, 0.3, 0.3, P.d6);
    }
  }
  for (const [mx, my] of [[bowX - 2, -hw * 0.6], [bowX - 2, hw * 0.6], [-hl * 0.62, -hw * 0.6], [-hl * 0.62, hw * 0.6]] as Pt[]) {
    disc(mx, my, 0.7, P.d0);
    disc(mx, my, 0.5, P.d7);
    lamp(mx + 0.9, my, 0.45, '#fff3c4');
  }

  // The engine house at the stern: radiators with their fans, the stacks, the hull number.
  const ex0 = -hl * 1.0, ex1 = -hl * 0.64, ey = hw * 0.56;
  x.globalAlpha = 0.35;
  R(ex0 + 1, -ey + 1.5, ex1 - ex0, ey * 2, P.d0);
  x.globalAlpha = 1;
  slab(ex0, -ey, ex1 - ex0, ey * 2, P.d4, 0.8);
  for (const s of [-1, 1]) {
    const ry0 = s < 0 ? -ey + 2 : ey * 0.22, rh = ey * 0.78 - 2, rx0 = -hl * 0.8, rw = hl * 0.13;
    R(rx0, ry0, rw, rh, P.d1);
    if (d >= 1.2) for (let q = ry0 + 0.5; q < ry0 + rh - 0.3; q += 0.9) R(rx0 + 0.3, q, rw - 0.6, Math.max(px, 0.3), P.d3);
    // Fans.
    const nf = Math.max(1, Math.floor(rh / (rw * 0.95)));
    for (let f = 0; f < nf; f++) {
      const fx = rx0 + rw / 2, fy = ry0 + (rh * (f + 0.5)) / nf, fr = Math.min(rw, rh / nf) * 0.42;
      disc(fx, fy, fr, P.d0);
      disc(fx, fy, fr * 0.9, P.d2);
      if (d >= 2) {
        x.strokeStyle = P.d6;
        x.lineWidth = Math.max(px, fr * 0.14);
        for (let bl = 0; bl < 5; bl++) {
          const an = (bl / 5) * Math.PI * 2 + f;
          x.beginPath();
          x.moveTo(fx, fy);
          x.lineTo(fx + Math.cos(an) * fr * 0.85, fy + Math.sin(an) * fr * 0.85);
          x.stroke();
        }
      }
      disc(fx, fy, fr * 0.2, P.d6);
    }
  }
  // Stacks: heat-stained collars round dark throats.
  for (const st of stackSpots(L, W, jets)) {
    disc(st.x, st.y, 3.3, P.d0);
    disc(st.x, st.y, 3.1, P.rust);
    disc(st.x, st.y, 2.4, P.d6);
    disc(st.x, st.y, 1.7, P.d0);
    if (d >= 2) disc(st.x - 0.5, st.y - 0.5, 0.6, '#2a1a12');
  }
  // The hull number on the engine house roof.
  if (d >= 0.9) {
    x.save();
    x.translate(-hl * 0.92, 0);
    x.rotate(Math.PI / 2);
    x.fillStyle = shade(P.hi, 0.2);
    x.globalAlpha = 0.85;
    x.font = `bold ${hw * 0.3}px monospace`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('07', 0, 0);
    x.restore();
    x.globalAlpha = 1;
  }

  // The engine pods out to their nozzles.
  for (const n of nozzleSpots(L, W)) {
    const r = n.big ? 3.5 : 2.5, a0 = -hl * 0.92;
    R(n.x, n.y - r - px, a0 - n.x, (r + px) * 2, P.d0);
    const bands = 5;
    for (let b = 0; b < bands; b++) R(n.x, n.y - r + (b * 2 * r) / bands, a0 - n.x, (2 * r) / bands, shade(P.d5, 0.25 - Math.abs(b - 1.3) * 0.18));
    if (d >= 1.5) for (let q = n.x + 3; q < a0; q += 4) R(q, n.y - r, Math.max(px, 0.3), 2 * r, P.d2);
    R(n.x - 1, n.y - r * 0.9, 1.4, r * 1.8, P.d1);
    R(n.x - 1, n.y - r * 0.55, 0.8, r * 1.1, '#2a1a12');
  }

  // Cargo containers and a deck crane aft of the Spine.
  const cc = ['#7a3a2a', '#2a4a6a', '#4a5a2a', '#6a5a2a'];
  for (let k = 0; k < 6; k++) {
    const s = k < 3 ? -1 : 1;
    const a = -hl * 0.6 + (k % 3) * 6.6, b = s < 0 ? -hw * 0.5 : hw * 0.5 - 2.6;
    const col = cc[Math.floor(H(k, 2, 9) * cc.length)];
    slab(a, b, 6, 2.6, col, 0.3);
    if (d >= 2.5) for (let q = a + 0.6; q < a + 5.6; q += 0.6) R(q, b + 0.2, Math.max(px, 0.12), 2.2, shade(col, -0.25));
  }
  disc(-hl * 0.56, hw * 0.3, 1.6, P.d0);
  disc(-hl * 0.56, hw * 0.3, 1.3, P.hazard);
  x.strokeStyle = P.hazard;
  x.lineWidth = 0.9;
  x.beginPath();
  x.moveTo(-hl * 0.56, hw * 0.3);
  x.lineTo(-hl * 0.56 + 14, hw * 0.3 - 6);
  x.stroke();
  if (d >= 2) {
    x.strokeStyle = P.d0;
    x.lineWidth = 0.2;
    for (let q = 1; q < 14; q += 1.4) {
      x.beginPath();
      x.moveTo(-hl * 0.56 + q, hw * 0.3 - (q * 6) / 14 - 0.4);
      x.lineTo(-hl * 0.56 + q + 0.7, hw * 0.3 - ((q + 0.7) * 6) / 14 + 0.4);
      x.stroke();
    }
  }

  // Helipad forward of the main battery.
  if (d >= 0.9) {
    const hx = hl * 0.38, hy = -hw * 0.3, hr = Math.min(7, hw * 0.16);
    disc(hx, hy, hr, P.d2);
    x.strokeStyle = P.hazard;
    x.lineWidth = 0.5;
    x.beginPath();
    x.arc(hx, hy, hr - 0.6, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = shade(P.hi, 0.3);
    x.font = `bold ${hr * 1.1}px monospace`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.save();
    x.translate(hx, hy);
    x.rotate(Math.PI / 2);
    x.fillText('H', 0, 0);
    x.restore();
  }

  // Toroid pylons out to each ring.
  const { kx, ky } = topScale(L, W);
  for (const [tx, ty] of TOROID_SHEET) {
    const lx = (tx - TOP_PX.cx) * kx, ly = (ty - TOP_PX.cy) * ky;
    const s = Math.sign(ly);
    const a = s < 0 ? ly : hw * 0.7, b = s < 0 ? -hw * 0.7 : ly;
    slab(lx - 2, a, 4, b - a, P.d4, 0.4);
    if (d >= 2) for (let q = a + 1; q < b - 0.5; q += 1.8) R(lx - 1.4, q, 2.8, Math.max(px, 0.2), P.d2);
  }

  // The dozer plough across the nose.
  x.fillStyle = P.d0;
  x.fillRect(hl * 1.06, -hw * 0.5 - px, 3.4 + px, hw + 2 * px);
  for (let b = -hw * 0.5; b < hw * 0.5; b += 2) R(hl * 1.06, b, 3.4, 1.9, b < 0 ? P.d6 : P.d5);
  R(hl * 1.06 + 2.6, -hw * 0.5, 0.8, hw, P.d7);
  for (let b = -hw * 0.5; b < hw * 0.5; b += 3) R(hl * 1.06 + 3.1, b, 0.5, 1.4, P.hazard);

  // The bridge on the nose: the cab you drive from, its windows lit, a radar dome and searchlights on the roof.
  const bx0 = hl * 0.84, bx1 = hl * 0.99, by = hw * 0.16;
  x.globalAlpha = 0.4;
  R(bx0 + 1, -by + 1.5, bx1 - bx0, by * 2, P.d0);
  x.globalAlpha = 1;
  slab(bx0, -by, bx1 - bx0, by * 2, P.d6, 0.6);
  R(bx0 + 1, -by + 1, (bx1 - bx0) * 0.55, by * 2 - 2, P.d5);
  disc(bx0 + (bx1 - bx0) * 0.3, 0, by * 0.45, P.d0);
  disc(bx0 + (bx1 - bx0) * 0.3, 0, by * 0.4, '#c8d0dc');
  if (d >= 2) disc(bx0 + (bx1 - bx0) * 0.3 - 0.4, -0.5, by * 0.15, '#ffffff');
  strip(bx1 - 0.3, -by + 0.8, bx1 - 0.3, by - 0.8, P.glass, 0.7);
  for (const s of [-1, 1]) {
    lamp(bx1 - 1.2, s * (by - 1.2), 0.5, '#fff3c4');
    if (d >= 2) {
      x.strokeStyle = P.d7;
      x.lineWidth = Math.max(px, 0.2);
      x.beginPath();
      x.moveTo(bx0 + 2, s * by * 0.7);
      x.lineTo(bx0 - 3, s * by * 1.1);
      x.stroke();
    }
  }

  // Light strips along the skirts and the bow facets, red lamps at the stern corners.
  for (const s of [-1, 1]) {
    for (let a = -hl * 0.9; a < bowX - 6; a += 9) strip(a, s * hw * 0.705, a + 6, s * hw * 0.705, P.glow, 0.45);
    strip(bowX + 2, s * hw * 0.72, hl * 0.9, s * hw * 0.45, P.glow, 0.4);
    lamp(-hl * 1.02, s * hw * 0.66, 0.6, P.red);
  }
  return { top: cv, glow: gcv, d, dg, ...e };
}
