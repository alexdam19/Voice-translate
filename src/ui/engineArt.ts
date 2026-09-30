import { engineDef, type EngineKey } from '../game/systems/engine';
import { hash2 } from '../render/px/pixels';

/**
 * The engine room drawn to scale, in the ship's steampunk-future look: a riveted iron hall under a lattice of roof
 * trusses, brass lamps throwing cones of warm light, steam mains along the walls with their valves and gauges, a
 * porthole, a diamond-plate floor; the chosen power plant on its bed in brass, copper, blued steel and enamel, a
 * 25 m blue whale beside it for scale (and two engineers at 1.8 m), a scale bar in metres, the overhead crane. Each
 * kind of engine has its own machinery: the diesels' banks of brass cylinder heads and copper turbochargers, the gas
 * turbine's polished nacelles, the steam colossus's green-enamelled boiler, firebox and red driving wheels, the W48's
 * four finned banks round a banded crankcase drum, the diesel-electric's generator and traction cabinets, the
 * geothermal engine's glowing exchanger coils, the ramjet pods, the tokamak's magnet ring round its plasma.
 */

const WHALE_LEN = 25;

type Ctx = CanvasRenderingContext2D;

/** Materials, darkest to brightest: shadow, dark, base, lit, highlight, glint. */
export type Mat = 'steel' | 'blued' | 'brass' | 'copper' | 'iron' | 'enamel' | 'red' | 'paint';
export const MAT: Record<Mat, string[]> = {
  steel: ['#12161c', '#262e38', '#3a4552', '#566474', '#7c8ca0', '#b4c4d6'],
  blued: ['#0e1420', '#1c2840', '#2c3e5e', '#42587e', '#6480aa', '#9ab6de'],
  brass: ['#241606', '#523410', '#86591c', '#b8862e', '#e0b456', '#fff0b0'],
  copper: ['#240e06', '#52220e', '#86391a', '#b85a2c', '#e08a52', '#ffc8a0'],
  iron: ['#100e0c', '#221e1c', '#35302c', '#4a433e', '#665d56', '#948a80'],
  enamel: ['#0a1610', '#16301f', '#24482f', '#346443', '#4e8a5e', '#8ac49a'],
  red: ['#1c0806', '#4a120c', '#781e14', '#a82c1e', '#d44a32', '#ff9a80'],
  paint: ['#161410', '#2c2820', '#48402e', '#665a40', '#8a7a58', '#c0ac84'],
};

const R = (x: Ctx, a: number, b: number, w: number, h: number, c: string): void => {
  x.fillStyle = c;
  x.fillRect(Math.round(a), Math.round(b), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
};

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

/** A riveted plate: outline, lit top and left edges, shaded bottom and right, dithered light falling off downward. */
export function plate(x: Ctx, a: number, b: number, w: number, h: number, m: Mat, rivet = true): void {
  const p = MAT[m];
  a = Math.round(a);
  b = Math.round(b);
  w = Math.max(2, Math.round(w));
  h = Math.max(2, Math.round(h));
  R(x, a - 1, b - 1, w + 2, h + 2, '#07080a');
  R(x, a, b, w, h, p[2]);
  // Light from above: the top third a step lighter, dithered into the base.
  const band = Math.max(1, Math.round(h * 0.35));
  R(x, a, b, w, band, p[3]);
  for (let i = 0; i < w; i += 2) R(x, a + i + ((band >> 1) & 1), b + band, 1, 1, p[3]);
  R(x, a, b, w, 1, p[4]);
  R(x, a, b, 1, h, p[3]);
  R(x, a + w - 1, b + 1, 1, h - 1, p[1]);
  R(x, a, b + h - 1, w, 1, p[0]);
  if (rivet && w > 10 && h > 8) for (const [rx, ry] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) {
    R(x, a + rx, b + ry, 1, 1, p[5]);
    R(x, a + rx + 1, b + ry + 1, 1, 1, p[0]);
  }
}

/** A cylinder side on (horizontal: its axis along x): banded like turned metal, a glint line, flanged ends. */
export function drum(x: Ctx, a: number, b: number, w: number, h: number, m: Mat, horizontal = true, flange = true): void {
  const p = MAT[m];
  a = Math.round(a);
  b = Math.round(b);
  w = Math.max(2, Math.round(w));
  h = Math.max(2, Math.round(h));
  R(x, a - 1, b - 1, w + 2, h + 2, '#07080a');
  const n = horizontal ? h : w;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    // Lit near the top (or left), a glint, darkening round the far side.
    const s = t < 0.12 ? 3 : t < 0.22 ? 4 : t < 0.3 ? 5 : t < 0.5 ? 3 : t < 0.78 ? 2 : t < 0.92 ? 1 : 0;
    if (horizontal) R(x, a, b + i, w, 1, p[s]);
    else R(x, a + i, b, 1, h, p[s]);
  }
  if (flange) {
    const f = MAT.brass;
    if (horizontal) {
      for (const fx of [a, a + w - 3]) {
        R(x, fx, b - 1, 3, h + 2, f[2]);
        R(x, fx, b - 1, 1, h + 2, f[4]);
        for (let j = b + 1; j < b + h - 1; j += 4) R(x, fx + 1, j, 1, 1, f[5]);
      }
    } else {
      for (const fy of [b, b + h - 3]) {
        R(x, a - 1, fy, w + 2, 3, f[2]);
        R(x, a - 1, fy, w + 2, 1, f[4]);
      }
    }
  }
}

/** A pipe from (a, y) to (b, y), `t` px thick, with flanges every so often. */
function pipeH(x: Ctx, a: number, b: number, y: number, t: number, m: Mat, every = 48): void {
  drum(x, a, y, b - a, t, m, true, false);
  const f = MAT.brass;
  for (let i = a + every / 2; i < b - 3; i += every) {
    R(x, i, y - 1, 3, t + 2, f[2]);
    R(x, i, y - 1, 1, t + 2, f[4]);
  }
}

function pipeV(x: Ctx, a: number, y0: number, y1: number, t: number, m: Mat): void {
  drum(x, a, y0, t, y1 - y0, m, false, false);
}

/** A soft glow (a radial fade). */
function glow(x: Ctx, cx: number, cy: number, r: number, col: string, k: number): void {
  if (r <= 0) return;
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = k;
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
  x.globalAlpha = 1;
}

/** A pressure gauge: brass bezel, cream face, ticks, the needle, a glint on the glass. */
export function gauge(x: Ctx, cx: number, cy: number, r: number, v: number): void {
  const f = MAT.brass;
  x.fillStyle = '#07080a';
  x.beginPath();
  x.arc(cx, cy, r + 1, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = f[3];
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#e8dcc0';
  x.beginPath();
  x.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
  x.fill();
  if (r >= 4) for (let i = 0; i <= 6; i++) {
    const a = Math.PI * (0.8 + i * 0.233);
    R(x, cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.58, 1, 1, i > 4 ? '#c02010' : '#3a3228');
  }
  const a = Math.PI * (0.8 + Math.max(0, Math.min(1, v)) * 1.4);
  x.strokeStyle = '#a01810';
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(cx, cy);
  x.lineTo(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62);
  x.stroke();
  R(x, cx - r * 0.4, cy - r * 0.5, Math.max(1, r * 0.25), 1, '#ffffff');
}

/** A valve handwheel (red, spoked). */
function valve(x: Ctx, cx: number, cy: number, r: number): void {
  x.strokeStyle = '#07080a';
  x.lineWidth = 3;
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.stroke();
  x.strokeStyle = MAT.red[3];
  x.lineWidth = 2;
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.stroke();
  x.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4;
    x.beginPath();
    x.moveTo(cx, cy);
    x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    x.stroke();
  }
  R(x, cx - 1, cy - 1, 2, 2, MAT.brass[4]);
}

/** A wisp of steam: soft puffs rising and spreading. */
function steam(x: Ctx, cx: number, cy: number, s: number, seed: number): void {
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const px = cx + (hash2(seed, i, 3) - 0.5) * s * (0.4 + t * 1.6);
    const py = cy - t * s * 2.4;
    glow(x, px, py, s * (0.35 + t * 0.8), '#dfe8f0', 0.28 * (1 - t * 0.7));
  }
}

/** A blue whale in profile, facing left, `len` px long, its belly on y = base. */
function whale(x: Ctx, x0: number, base: number, len: number): void {
  const h = len * 0.16;
  const body = '#35587a', belly = '#8aa6c0', dark = '#1e3450';
  x.fillStyle = dark;
  x.beginPath();
  x.moveTo(x0, base - h * 0.45);
  x.bezierCurveTo(x0 + len * 0.05, base - h * 1.05, x0 + len * 0.45, base - h * 1.1, x0 + len * 0.78, base - h * 0.55);
  x.lineTo(x0 + len * 0.9, base - h * 0.45);
  // Flukes.
  x.lineTo(x0 + len, base - h * 1.0);
  x.lineTo(x0 + len * 0.97, base - h * 0.35);
  x.lineTo(x0 + len, base + h * 0.05);
  x.lineTo(x0 + len * 0.9, base - h * 0.2);
  x.lineTo(x0 + len * 0.78, base - h * 0.15);
  x.bezierCurveTo(x0 + len * 0.45, base + h * 0.1, x0 + len * 0.1, base + h * 0.05, x0, base - h * 0.45);
  x.fill();
  // Lit back, pale grooved belly, the eye, the flipper.
  x.fillStyle = body;
  x.beginPath();
  x.moveTo(x0 + len * 0.02, base - h * 0.5);
  x.bezierCurveTo(x0 + len * 0.08, base - h * 0.95, x0 + len * 0.45, base - h * 1.0, x0 + len * 0.76, base - h * 0.55);
  x.lineTo(x0 + len * 0.7, base - h * 0.35);
  x.bezierCurveTo(x0 + len * 0.4, base - h * 0.6, x0 + len * 0.1, base - h * 0.55, x0 + len * 0.02, base - h * 0.5);
  x.fill();
  x.fillStyle = belly;
  for (let i = 0; i < 6; i++) R(x, x0 + len * (0.06 + i * 0.03), base - h * 0.12 + i * 0.3, len * 0.18, 1, belly);
  R(x, x0 + len * 0.1, base - h * 0.55, 2, 2, '#0a0e14');
  x.fillStyle = dark;
  x.beginPath();
  x.moveTo(x0 + len * 0.22, base - h * 0.2);
  x.lineTo(x0 + len * 0.3, base + h * 0.35);
  x.lineTo(x0 + len * 0.27, base - h * 0.15);
  x.fill();
}

/** An engineer in overalls, hard hat and brass goggles. */
function person(x: Ctx, cx: number, base: number, px: number, col: string): void {
  const h = Math.max(6, px);
  R(x, cx - h * 0.12, base - h, h * 0.24, h * 0.22, '#d8b088');
  R(x, cx - h * 0.14, base - h * 1.02, h * 0.28, h * 0.1, '#ffd740');
  R(x, cx - h * 0.1, base - h * 0.92, h * 0.2, Math.max(1, h * 0.05), MAT.brass[4]);
  R(x, cx - h * 0.16, base - h * 0.78, h * 0.32, h * 0.42, col);
  R(x, cx - h * 0.16, base - h * 0.78, h * 0.32, Math.max(1, h * 0.05), shade(col, 0.3));
  R(x, cx - h * 0.15, base - h * 0.36, h * 0.12, h * 0.36, '#2a2a30');
  R(x, cx + h * 0.03, base - h * 0.36, h * 0.12, h * 0.36, '#2a2a30');
}

/** The hall: riveted wall plating, pilasters, roof trusses and the crane rail, steam mains with valves and gauges, a
 * porthole, brass lamps and their light, the diamond-plate floor with its hazard edge. */
function hall(x: Ctx, W: number, H: number, floor: number): void {
  // Wall: iron plates in courses, seams and rivets, darker toward the floor.
  const wall = x.createLinearGradient(0, 0, 0, floor);
  wall.addColorStop(0, '#0c1014');
  wall.addColorStop(1, '#171c22');
  x.fillStyle = wall;
  x.fillRect(0, 0, W, floor);
  const cw = 46, ch = 30;
  for (let j = 22, row = 0; j < floor; j += ch, row++) {
    for (let i = (row % 2) * (cw / 2) - cw; i < W; i += cw) {
      R(x, i, j, cw, 1, '#07090c');
      R(x, i, j + 1, cw, 1, '#232a33');
      R(x, i, j, 1, ch, '#07090c');
      R(x, i + 1, j, 1, ch, '#1e252d');
      for (const [rx, ry] of [[3, 4], [cw - 4, 4], [3, ch - 4], [cw - 4, ch - 4]]) {
        R(x, i + rx, j + ry, 1, 1, '#34404c');
        R(x, i + rx + 1, j + ry + 1, 1, 1, '#07090c');
      }
    }
  }
  // Pilasters with brass caps.
  for (let i = 60; i < W; i += 150) {
    plate(x, i, 20, 8, floor - 20, 'iron', false);
    R(x, i - 2, 20, 12, 4, MAT.brass[3]);
    R(x, i - 2, 20, 12, 1, MAT.brass[5]);
    R(x, i - 2, floor - 6, 12, 4, MAT.brass[2]);
  }
  // A porthole: the night outside, a cyan cast.
  {
    const px = W * 0.62, py = floor * 0.36, pr = Math.min(16, floor * 0.12);
    x.fillStyle = '#07080a';
    x.beginPath();
    x.arc(px, py, pr + 3, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = MAT.brass[3];
    x.beginPath();
    x.arc(px, py, pr + 2, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#0a1a26';
    x.beginPath();
    x.arc(px, py, pr, 0, Math.PI * 2);
    x.fill();
    glow(x, px, py, pr * 1.4, '#40c4ff', 0.25);
    for (let i = 0; i < 6; i++) R(x, px - pr + hash2(i, 1, 9) * pr * 2, py - pr * 0.6 + hash2(i, 2, 9) * pr, 1, 1, '#cfe8ff');
    R(x, px - pr * 0.5, py - pr * 0.55, pr * 0.4, 1, '#9ad8ff');
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      R(x, px + Math.cos(a) * (pr + 1), py + Math.sin(a) * (pr + 1), 1, 1, MAT.brass[5]);
    }
  }
  // Steam mains along the wall: a copper line and a steel one, a valve and a gauge.
  const py1 = Math.round(floor * 0.56), py2 = Math.round(floor * 0.64);
  pipeH(x, 0, W, py1, 6, 'copper', 70);
  pipeH(x, 0, W, py2, 4, 'steel', 56);
  for (const vx of [W * 0.3, W * 0.86]) {
    pipeV(x, vx, py1 + 6, py2, 4, 'copper');
    valve(x, vx + 2, py1 - 6, 5);
  }
  gauge(x, W * 0.44, py1 - 12, 7, 0.62);
  gauge(x, W * 0.47, py1 - 10, 4, 0.35);
  // Roof trusses: two chords and a lattice between them; the crane rail beneath.
  R(x, 0, 2, W, 3, MAT.iron[3]);
  R(x, 0, 2, W, 1, MAT.iron[5]);
  R(x, 0, 15, W, 3, MAT.iron[3]);
  R(x, 0, 15, W, 1, MAT.iron[4]);
  x.strokeStyle = MAT.iron[2];
  x.lineWidth = 1.5;
  for (let i = -12; i < W + 12; i += 24) {
    x.beginPath();
    x.moveTo(i, 5);
    x.lineTo(i + 12, 15);
    x.lineTo(i + 24, 5);
    x.stroke();
  }
  R(x, 0, 18, W, 3, MAT.steel[2]);
  R(x, 0, 21, W, 1, '#07090c');
  // Lamps: brass shades on their cords, the bulb, a cone of warm light down to the floor.
  for (let i = 0; i < 4; i++) {
    const lx = W * (0.14 + i * 0.25), ly = 30 + (i % 2) * 6;
    R(x, lx, 21, 1, ly - 21, '#2a2a2a');
    x.fillStyle = MAT.brass[3];
    x.beginPath();
    x.moveTo(lx - 7, ly + 5);
    x.lineTo(lx - 3, ly);
    x.lineTo(lx + 4, ly);
    x.lineTo(lx + 8, ly + 5);
    x.fill();
    R(x, lx - 7, ly + 5, 15, 1, MAT.brass[1]);
    R(x, lx - 2, ly, 4, 1, MAT.brass[5]);
    const cone = x.createLinearGradient(0, ly + 5, 0, floor);
    cone.addColorStop(0, 'rgba(255,200,120,0.16)');
    cone.addColorStop(1, 'rgba(255,200,120,0)');
    x.fillStyle = cone;
    x.beginPath();
    x.moveTo(lx - 6, ly + 5);
    x.lineTo(lx + 7, ly + 5);
    x.lineTo(lx + 60, floor);
    x.lineTo(lx - 59, floor);
    x.fill();
    R(x, lx - 1, ly + 5, 3, 2, '#fff4d0');
    glow(x, lx, ly + 7, 14, '#ffd89a', 0.7);
  }
  // Floor: diamond plate, a brass kick strip, the hazard edge.
  R(x, 0, floor, W, H - floor, '#1c2229');
  for (let j = floor + 3; j < H; j += 4) for (let i = (j >> 2) % 2 ? 2 : 0; i < W; i += 4) R(x, i, j, 2, 1, '#2c343e');
  R(x, 0, floor, W, 2, MAT.brass[3]);
  R(x, 0, floor, W, 1, MAT.brass[5]);
  for (let i = 0; i < W; i += 10) R(x, i, floor + 2, 5, 2, (i / 10) % 2 ? '#07090c' : '#e0b020');
}

/** Paints the engine room for an engine (to scale with the whale). */
export function paintEngineRoom(cv: HTMLCanvasElement, key: EngineKey): void {
  const x = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  const d = engineDef(key);
  x.imageSmoothingEnabled = false;
  const floor = H - 26;
  hall(x, W, H, floor);
  // Scale: px per metre fixed for every engine (the biggest one and the whale fit).
  const k = (W - 40) / (40 + WHALE_LEN + 8);
  const ex = 16, eLen = d.len * k, eH = d.tall * k;
  const top = floor - eH;
  // The crane over the engine: its brass trolley on the rail, the cable, the hook block.
  const hx = ex + eLen / 2;
  plate(x, hx - 12, 18, 24, 7, 'brass', false);
  R(x, hx - 8, 25, 3, 3, MAT.iron[2]);
  R(x, hx + 5, 25, 3, 3, MAT.iron[2]);
  R(x, hx, 25, 1, Math.max(0, top - 30), '#8a929c');
  plate(x, hx - 4, Math.max(26, top - 10), 9, 6, 'brass', false);
  // A shadow under it, the bed, the machine.
  x.fillStyle = 'rgba(0,0,0,0.45)';
  x.beginPath();
  x.ellipse(ex + eLen / 2, floor, eLen * 0.55, 5, 0, 0, Math.PI * 2);
  x.fill();
  paintMachine(x, d.kind, ex, top, eLen, eH, d.flame.outer, k, key);
  plate(x, ex - 4, floor - 5, eLen + 8, 5, 'iron', false);
  for (let i = ex; i < ex + eLen; i += 14) R(x, i, floor - 3, 2, 2, MAT.brass[4]);
  // Steam off the machine's top.
  steam(x, ex + eLen * 0.72, top - 2, Math.max(4, k * 0.9), 7);
  // The whale for scale, and two engineers.
  const wx = W - 12 - WHALE_LEN * k;
  whale(x, wx, floor - 4, WHALE_LEN * k);
  person(x, ex + eLen + 10, floor, 1.8 * k, '#ff9a3a');
  person(x, wx - 8, floor, 1.8 * k, '#3a8aff');
  // Scale bar in 5 m steps.
  const sy = H - 12;
  for (let m = 0; m <= 40; m += 5) R(x, 16 + m * k, sy, 1, m % 10 ? 3 : 5, '#c8b890');
  R(x, 16, sy, 40 * k, 1, '#c8b890');
  x.font = '9px monospace';
  x.fillStyle = '#c8b890';
  x.fillText('0', 14, sy + 11);
  x.fillText('20 m', 16 + 20 * k - 8, sy + 11);
  x.fillText('40 m', 16 + 40 * k - 10, sy + 11);
  x.fillStyle = '#8a9aa8';
  x.fillText(`BLUE WHALE ${WHALE_LEN} m (for scale)`, wx, floor + 14);
  // The name on a brass plate.
  const label = `${d.name.toUpperCase()}  ${d.len} m · ${d.mass.toLocaleString()} t · ${d.mw} MW`;
  x.font = 'bold 11px monospace';
  const tw = x.measureText(label).width;
  plate(x, 10, 26, tw + 14, 16, 'brass', true);
  x.fillStyle = MAT.brass[0];
  x.fillText(label, 17, 38);
  // Dark corners.
  const vg = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  x.fillStyle = vg;
  x.fillRect(0, 0, W, H);
}

/** The machinery itself, by kind. */
function paintMachine(x: Ctx, kind: string, ex: number, top: number, L: number, Hh: number, flame: string, k: number, key: EngineKey): void {
  const base = top + Hh;
  const kd = kind.toLowerCase();
  if (kd.includes('steam')) {
    // Green-enamelled boiler with brass bands, the firebox and its glowing grate, the stack, three red driving wheels.
    const bh = Hh * 0.5;
    drum(x, ex + L * 0.15, top + Hh * 0.18, L * 0.68, bh, 'enamel');
    for (let i = 1; i < 6; i++) {
      const bx = ex + L * 0.15 + (i * L * 0.68) / 6;
      R(x, bx, top + Hh * 0.18, 3, bh, MAT.brass[3]);
      R(x, bx, top + Hh * 0.18, 1, bh, MAT.brass[5]);
    }
    // Steam dome and safety valves on top.
    drum(x, ex + L * 0.45, top + Hh * 0.06, L * 0.08, Hh * 0.14, 'brass', false);
    drum(x, ex + L * 0.62, top + Hh * 0.1, L * 0.04, Hh * 0.1, 'brass', false);
    // The smokebox at the front and the stack.
    plate(x, ex + L * 0.8, top + Hh * 0.14, L * 0.12, Hh * 0.56, 'iron');
    drum(x, ex + L * 0.83, top - Hh * 0.16, L * 0.06, Hh * 0.32, 'iron', false);
    R(x, ex + L * 0.82, top - Hh * 0.17, L * 0.08, 3, MAT.brass[4]);
    // Firebox: iron, the door open on the fire.
    plate(x, ex, top + Hh * 0.05, L * 0.17, Hh * 0.7, 'iron');
    R(x, ex + L * 0.04, top + Hh * 0.42, L * 0.09, Hh * 0.2, '#200806');
    for (let i = 0; i < 6; i++) R(x, ex + L * 0.045 + i * L * 0.014, top + Hh * 0.46 + (i % 2) * 2, L * 0.01, Hh * 0.14, i % 2 ? '#ff8a20' : '#ffd060');
    glow(x, ex + L * 0.09, top + Hh * 0.52, Hh * 0.35, '#ff9030', 0.7);
    gauge(x, ex + L * 0.06, top + Hh * 0.22, Math.max(4, Hh * 0.07), 0.7);
    gauge(x, ex + L * 0.12, top + Hh * 0.22, Math.max(3, Hh * 0.05), 0.4);
    // Driving wheels, the coupling rod, the cylinder.
    for (let i = 0; i < 3; i++) wheel(x, ex + L * (0.3 + i * 0.2), base - Hh * 0.2, Hh * 0.2, 'red', 10);
    R(x, ex + L * 0.3, base - Hh * 0.24, L * 0.4, 3, MAT.steel[4]);
    R(x, ex + L * 0.3, base - Hh * 0.24, L * 0.4, 1, MAT.steel[5]);
    plate(x, ex + L * 0.76, top + Hh * 0.6, L * 0.18, Hh * 0.22, 'steel');
    R(x, ex + L * 0.7, top + Hh * 0.7, L * 0.08, 3, MAT.steel[5]);
    return;
  }
  if (kd.includes('turbine')) {
    // Two polished nacelles: brass intake bell, compressor rings, the copper combustor band, the exhaust cone.
    for (let n = 0; n < 2; n++) {
      const y = top + n * Hh * 0.5, h2 = Hh * 0.45;
      drum(x, ex + L * 0.08, y, L * 0.8, h2, n ? 'steel' : 'blued');
      for (let i = 0; i < 9; i++) R(x, ex + L * (0.12 + i * 0.05), y + 1, 1, h2 - 2, MAT.steel[0]);
      drum(x, ex + L * 0.6, y, L * 0.08, h2, 'copper', true, false);
      x.fillStyle = MAT.iron[2];
      x.beginPath();
      x.moveTo(ex + L * 0.88, y);
      x.lineTo(ex + L, y + h2 * 0.25);
      x.lineTo(ex + L, y + h2 * 0.75);
      x.lineTo(ex + L * 0.88, y + h2);
      x.fill();
      glow(x, ex + L, y + h2 / 2, h2 * 0.7, flame, 0.6);
      drum(x, ex, y + h2 * 0.05, L * 0.08, h2 * 0.9, 'brass', true, false);
      R(x, ex + 2, y + h2 * 0.3, L * 0.05, h2 * 0.4, '#07090c');
    }
    gauge(x, ex + L * 0.5, top + Hh * 0.47, Math.max(4, Hh * 0.06), 0.8);
    return;
  }
  if (kd.includes('ramjet')) {
    for (let n = 0; n < 2; n++) {
      const y = top + Hh * 0.08 + n * Hh * 0.48, h2 = Hh * 0.38;
      drum(x, ex + L * 0.15, y, L * 0.7, h2, 'steel');
      x.fillStyle = MAT.brass[3];
      x.beginPath();
      x.moveTo(ex, y + h2 / 2);
      x.lineTo(ex + L * 0.18, y);
      x.lineTo(ex + L * 0.18, y + h2);
      x.fill();
      R(x, ex + L * 0.02, y + h2 / 2 - 1, L * 0.15, 1, MAT.brass[5]);
      for (let i = 0; i < 6; i++) R(x, ex + L * (0.3 + i * 0.08), y + 2, 2, h2 - 4, MAT.copper[3]);
      glow(x, ex + L * 0.95, y + h2 / 2, h2 * 1.4, flame, 0.85);
      drum(x, ex + L * 0.85, y + h2 * 0.15, L * 0.12, h2 * 0.7, 'iron', true, false);
    }
    return;
  }
  if (kd.includes('fusion') || kd.includes('tokamak')) {
    // The torus side on in blued steel, brass magnet coils round it, the plasma glowing through, cryo lines.
    const cx = ex + L / 2, cy = top + Hh * 0.52, rx = L * 0.42, ry = Hh * 0.46;
    x.fillStyle = '#07080a';
    x.beginPath();
    x.ellipse(cx, cy, rx + 1, ry + 1, 0, 0, Math.PI * 2);
    x.fill();
    const tg = x.createLinearGradient(0, cy - ry, 0, cy + ry);
    tg.addColorStop(0, MAT.blued[4]);
    tg.addColorStop(0.4, MAT.blued[2]);
    tg.addColorStop(1, MAT.blued[0]);
    x.fillStyle = tg;
    x.beginPath();
    x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#060a10';
    x.beginPath();
    x.ellipse(cx, cy, rx * 0.45, ry * 0.3, 0, 0, Math.PI * 2);
    x.fill();
    glow(x, cx, cy, rx * 0.9, flame, 0.6);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      plate(x, cx + Math.cos(a) * rx * 0.78 - 4, cy + Math.sin(a) * ry * 0.78 - 6, 8, 12, 'brass', false);
    }
    for (let i = 0; i < 5; i++) R(x, cx - rx * 0.3 + i * rx * 0.15, cy - 2, rx * 0.06, 4, '#ffffff');
    pipeH(x, ex, ex + L, top + Hh * 0.06, 3, 'steel', 40);
    pipeH(x, ex, ex + L, base - 5, 3, 'steel', 40);
    R(x, ex, top + Hh * 0.06 + 1, L, 1, '#40c4ff');
    R(x, ex, base - 4, L, 1, '#40c4ff');
    return;
  }
  if (kd.includes('geo')) {
    // The exchanger in its iron housing, glowing coils through the grilles, brass risers to the steam mains.
    plate(x, ex, top + Hh * 0.3, L, Hh * 0.7, 'iron');
    for (let i = 0; i < 7; i++) {
      const cx = ex + L * (0.1 + i * 0.13);
      R(x, cx - 5, top + Hh * 0.36, 11, Hh * 0.56, '#140806');
      for (let j = 0; j < 5; j++) R(x, cx - 4, top + Hh * 0.38 + j * Hh * 0.11, 9, 2, j % 2 ? '#ff5a10' : '#ffa030');
    }
    glow(x, ex + L / 2, top + Hh * 0.62, L * 0.4, '#ff5010', 0.5);
    for (let i = 0; i < 3; i++) drum(x, ex + L * (0.15 + i * 0.3), top, L * 0.12, Hh * 0.3, 'brass', false);
    gauge(x, ex + L * 0.93, top + Hh * 0.42, Math.max(4, Hh * 0.06), 0.9);
    return;
  }
  if (kd.includes('radial') || kd.includes('w48')) {
    // Four banks of twelve finned cylinders round a banded crankcase drum, brass heads, a sight glass on the fire.
    drum(x, ex, top + Hh * 0.36, L, Hh * 0.36, 'blued');
    for (let i = 1; i < 8; i++) {
      const bx = ex + (i * L) / 8;
      R(x, bx, top + Hh * 0.36, 3, Hh * 0.36, MAT.brass[3]);
      R(x, bx, top + Hh * 0.36, 1, Hh * 0.36, MAT.brass[5]);
    }
    for (let bank = 0; bank < 4; bank++) {
      const up = bank < 2;
      const y = up ? top + bank * Hh * 0.17 : top + Hh * 0.74 + (bank - 2) * Hh * 0.12;
      const ch = up ? Hh * 0.15 : Hh * 0.11;
      for (let i = 0; i < 12; i++) {
        const cx = ex + L * (0.04 + i * 0.08), cw = L * 0.06;
        // The barrel with its cooling fins, the brass head on the outboard end.
        R(x, cx - 1, y - 1, cw + 2, ch + 2, '#07080a');
        R(x, cx, y, cw, ch, bank % 2 ? MAT.copper[2] : MAT.copper[3]);
        for (let f = y + 1; f < y + ch - 1; f += 2) R(x, cx, f, cw, 1, MAT.copper[bank % 2 ? 1 : 2]);
        R(x, cx, y, 1, ch, MAT.copper[4]);
        const hy = up ? y : y + ch - 3;
        R(x, cx, hy, cw, 3, MAT.brass[3]);
        R(x, cx, hy, cw, 1, MAT.brass[5]);
      }
    }
    // Sight glasses into the crankcase: the fire inside.
    for (let i = 0; i < 4; i++) {
      const gx = ex + L * (0.14 + i * 0.22), gy = top + Hh * 0.54;
      x.fillStyle = MAT.brass[3];
      x.beginPath();
      x.arc(gx, gy, Hh * 0.08, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#ff9030';
      x.beginPath();
      x.arc(gx, gy, Hh * 0.055, 0, Math.PI * 2);
      x.fill();
      glow(x, gx, gy, Hh * 0.16, '#ffa040', 0.6);
    }
    plate(x, ex - 6, top + Hh * 0.45, 6, Hh * 0.2, 'steel', false);
    return;
  }
  diesel(x, key, ex, top, L, Hh, k);
}

/** A flywheel (or any big wheel) side on: rim, spokes, hub, the rim lit along its top. */
export function wheel(x: Ctx, cx: number, cy: number, r: number, m: Mat, spokes = 6): void {
  const p = MAT[m];
  x.fillStyle = '#07090c';
  x.beginPath();
  x.arc(cx, cy, r + 1, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = p[3];
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = p[0];
  x.beginPath();
  x.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = p[2];
  x.lineWidth = Math.max(2, r * 0.12);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.3;
    x.beginPath();
    x.moveTo(cx, cy);
    x.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
    x.stroke();
  }
  x.fillStyle = MAT.brass[3];
  x.beginPath();
  x.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  x.fill();
  R(x, cx - 1, cy - 1, 2, 2, '#07090c');
  x.strokeStyle = p[5];
  x.lineWidth = 1;
  x.beginPath();
  x.arc(cx, cy, r - 1, Math.PI * 1.15, Math.PI * 1.75);
  x.stroke();
}

/** A gear wheel: teeth round a disc. */
export function gear(x: Ctx, cx: number, cy: number, r: number, m: Mat): void {
  const teeth = Math.max(10, Math.round(r * 0.9));
  x.fillStyle = MAT[m][1];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    x.save();
    x.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    x.rotate(a);
    x.fillRect(-2, -2, 4, 4);
    x.restore();
  }
  wheel(x, cx, cy, r - 1, m, 5);
}

/** A turbocharger's snail shell in copper, `r` px round, its outlet pointing up. */
function turbo(x: Ctx, cx: number, cy: number, r: number): void {
  drum(x, cx - r * 0.35, cy - r * 1.6, r * 0.7, r * 0.9, 'copper', false, true);
  wheel(x, cx, cy, r, 'copper', 8);
  x.strokeStyle = MAT.brass[4];
  x.lineWidth = 2;
  x.beginPath();
  x.arc(cx, cy, r * 0.55, 0.2, Math.PI * 1.4);
  x.stroke();
}

/** Grated walkway with posts and a brass hand rail from a to b at height y (the rail sits `rail` px above). */
function walkway(x: Ctx, a: number, b: number, y: number, rail: number): void {
  R(x, a, y, b - a, 3, MAT.steel[2]);
  for (let i = a; i < b; i += 3) R(x, i, y + 1, 1, 1, '#1a1e24');
  R(x, a, y - rail, b - a, 2, MAT.brass[4]);
  R(x, a, y - rail, b - a, 1, MAT.brass[5]);
  R(x, a, y - rail / 2, b - a, 1, MAT.brass[2]);
  for (let i = a; i <= b; i += Math.max(8, rail * 1.2)) R(x, i, y - rail, 2, rail, MAT.brass[2]);
}

function ladder(x: Ctx, a: number, y0: number, y1: number): void {
  R(x, a, y0, 1, y1 - y0, MAT.brass[2]);
  R(x, a + 5, y0, 1, y1 - y0, MAT.brass[2]);
  for (let j = y0 + 2; j < y1; j += 4) R(x, a, j, 6, 1, MAT.brass[4]);
}

/** A control panel: brass gauges and lamps on an enamelled board. */
function panel(x: Ctx, a: number, b: number, w: number, h: number): void {
  plate(x, a, b, w, h, 'enamel');
  const n = Math.max(1, Math.floor((w - 4) / 9));
  for (let i = 0; i < n; i++) {
    const cx = a + 6 + i * 9, cy = b + h * 0.38;
    gauge(x, cx, cy, 3, 0.3 + (i % 3) * 0.25);
    R(x, cx - 1, b + h - 5, 2, 2, i % 3 ? '#76ff03' : '#ffb13a');
  }
}

/** The diesels: flywheel, crankcase with its inspection doors, the cylinder block, rows of brass heads under their
 * rocker covers (two banks on a V), the copper exhaust manifold into the turbochargers, air and coolant pipes, the
 * walkway along the top with its rail and a ladder, the control panel. The low-gear plant has its reduction gearbox
 * open at the stern, the opposed-piston engine two crankshafts with the cylinders between, the twin-crank two V16s into
 * one gearbox, and the diesel-electric its generator, traction cabinets and busbars. */
function diesel(x: Ctx, key: EngineKey, ex: number, top: number, L: number, Hh: number, k: number): void {
  const base = top + Hh;
  const fr = Hh * 0.36;
  const bx = ex + fr * 1.7;
  // How much of the length the engine block takes; the rest is the gearbox, generator or second engine.
  const tail = key === 'tortoise' ? 0.28 : key === 'megalodon' ? 0.36 : 0;
  const endX = ex + L * (1 - tail);
  // One engine block (from a to b): crankcase, cylinder block, heads, manifold.
  const engine = (a: number, b: number, banks: number, turbos: number): void => {
    const len = b - a;
    const ccTop = top + Hh * 0.52, cbTop = top + Hh * 0.3;
    // Crankcase in blued steel, brass-framed inspection doors, the sump.
    plate(x, a, ccTop, len, base - ccTop - 2, 'blued');
    R(x, a + 3, base - 6, len - 6, 3, MAT.blued[0]);
    const cylN = Math.max(6, Math.round(len / (2.1 * k)));
    const pitch = (len - 6) / cylN;
    for (let i = 0; i < cylN; i += 2) {
      const dx = a + 3 + i * pitch + 2, dw = pitch * 2 - 5, dh = (base - ccTop) * 0.45;
      plate(x, dx, ccTop + 5, dw, dh, 'brass');
      R(x, dx + dw / 2 - 1, ccTop + 5 + dh / 2 - 1, 3, 2, MAT.brass[1]);
    }
    // Coolant and fuel lines along the crankcase.
    pipeH(x, a, b, ccTop + (base - ccTop) * 0.6, 3, 'copper', 36);
    R(x, a, ccTop + (base - ccTop) * 0.74, len, 1, MAT.brass[4]);
    // Cylinder block with a rib per cylinder.
    plate(x, a + 2, cbTop, len - 4, ccTop - cbTop, 'steel', false);
    for (let i = 1; i < cylN; i++) R(x, a + 3 + i * pitch, cbTop + 2, 1, ccTop - cbTop - 3, MAT.steel[1]);
    // Heads under their rocker covers: the far bank higher and darker, the near bank in front.
    for (let bank = banks - 1; bank >= 0; bank--) {
      const hy = cbTop - Hh * (0.12 + bank * 0.07), hh = Hh * 0.13;
      for (let i = 0; i < cylN; i++) {
        const cx = a + 4 + i * pitch + (bank ? pitch * 0.35 : 0);
        if (cx + pitch - 2 > b - 2) continue;
        plate(x, cx, hy, pitch - 2, hh, bank ? 'copper' : 'brass', false);
        R(x, cx + 1, hy + hh * 0.5, pitch - 4, 1, bank ? MAT.copper[1] : MAT.brass[1]);
        if (!bank) R(x, cx + pitch / 2 - 2, hy - 2, 2, 2, MAT.steel[4]);
      }
    }
    // Exhaust manifold in copper with lagging bands, running to the turbochargers at the stern end.
    const my = cbTop - Hh * (0.2 + (banks - 1) * 0.07);
    drum(x, a + 4, my - 5, len - 12 - turbos * fr * 0.5, 6, 'copper', true, false);
    for (let i = a + 8; i < b - 12 - turbos * fr * 0.5; i += 10) R(x, i, my - 5, 2, 6, '#d8ccb0');
    for (let t = 0; t < turbos; t++) turbo(x, b - 10 - t * fr * 0.7, my - 2 - (t % 2) * 4, Math.max(6, fr * 0.3));
    // Charge-air duct back along the far side.
    R(x, a + 6, cbTop + 3, len - 14, 3, MAT.blued[3]);
    R(x, a + 6, cbTop + 3, len - 14, 1, MAT.blued[5]);
  };
  if (key === 'humpback') {
    // Opposed pistons: an upper and a lower crankcase with the cylinders standing between them.
    const a = bx, b = endX;
    const len = b - a;
    const cylN = Math.max(6, Math.round(len / (2.4 * k)));
    const pitch = (len - 6) / cylN;
    plate(x, a, top + Hh * 0.08, len, Hh * 0.22, 'blued');
    plate(x, a, base - Hh * 0.3, len, Hh * 0.28, 'blued');
    for (let i = 0; i < cylN; i++) {
      const cx = a + 3 + i * pitch;
      plate(x, cx + 1, top + Hh * 0.3, pitch - 3, Hh * 0.4, 'steel', false);
      // The two pistons meeting in the middle.
      R(x, cx + pitch / 2 - 2, top + Hh * 0.32, 3, Hh * 0.15, MAT.steel[5]);
      R(x, cx + pitch / 2 - 2, top + Hh * 0.53, 3, Hh * 0.15, MAT.steel[5]);
      R(x, cx + 2, top + Hh * 0.49, pitch - 5, 2, '#ff8a30');
    }
    // The two crankshafts' ends and the timing gear train between them at the flywheel end.
    gear(x, a + 2, top + Hh * 0.19, Hh * 0.1, 'brass');
    gear(x, a + 2, base - Hh * 0.16, Hh * 0.1, 'brass');
    R(x, a - 2, top + Hh * 0.19, 3, base - top - Hh * 0.35, MAT.steel[3]);
    // Ports ring and turbos on top.
    drum(x, a + 6, top + Hh * 0.02, len - 30, 5, 'copper', true, false);
    turbo(x, b - 12, top + Hh * 0.1, Math.max(6, fr * 0.3));
    walkway(x, a + 4, b - 22, top + Hh * 0.02 - 1, 7);
  } else if (key === 'cachalot') {
    // Two V16s into one combining gearbox in the middle.
    const mid = bx + (endX - bx) / 2;
    engine(bx, mid - Hh * 0.22, 2, 2);
    engine(mid + Hh * 0.22, endX, 2, 2);
    plate(x, mid - Hh * 0.24, top + Hh * 0.35, Hh * 0.48, Hh * 0.65, 'iron');
    gear(x, mid, top + Hh * 0.6, Hh * 0.18, 'brass');
    walkway(x, bx + 4, endX - 6, top + Hh * 0.02, 7);
  } else {
    engine(bx, endX, key === 'leviathan' ? 2 : 1, key === 'tortoise' ? 1 : 2);
    walkway(x, bx + 4, endX - 20, top + Hh * 0.0, 7);
  }
  // Flywheel with its guard.
  wheel(x, ex + fr, base - fr - 2, fr, 'iron', 6);
  x.strokeStyle = MAT.brass[4];
  x.lineWidth = 2;
  x.beginPath();
  x.arc(ex + fr, base - fr - 2, fr + 3, Math.PI * 1.05, Math.PI * 1.95);
  x.stroke();
  ladder(x, bx + 1, top + Hh * 0.02, base - 2);
  if (key === 'tortoise') {
    // The reduction gearbox, its cover off: a train of brass gears stepping the speed down to crawling.
    const gx = endX + 2, gw = ex + L - gx;
    plate(x, gx, top + Hh * 0.18, gw, Hh * 0.82, 'iron');
    R(x, gx + 3, top + Hh * 0.24, gw - 6, Hh * 0.7, '#0e1014');
    gear(x, gx + gw * 0.3, top + Hh * 0.45, Hh * 0.14, 'brass');
    gear(x, gx + gw * 0.62, top + Hh * 0.62, Hh * 0.26, 'brass');
    gear(x, gx + gw * 0.28, top + Hh * 0.78, Hh * 0.1, 'copper');
    R(x, gx + gw - 3, top + Hh * 0.6, 8, 4, MAT.steel[3]);
    panel(x, gx + 4, top + Hh * 0.18 - 14, Math.min(40, gw - 8), 12);
  } else if (key === 'megalodon') {
    // The generator (copper windings under the casing bands), three traction cabinets, and busbars to the crawlers.
    const gx = endX + 4, gw = (ex + L - gx) * 0.5;
    drum(x, gx, top + Hh * 0.2, gw, Hh * 0.78, 'blued', false);
    for (let i = 1; i < 6; i++) R(x, gx + (i * gw) / 6, top + Hh * 0.2, 2, Hh * 0.78, MAT.copper[3]);
    glow(x, gx + gw / 2, top + Hh * 0.6, Hh * 0.5, '#40c4ff', 0.3);
    const cx0 = gx + gw + 4, cw = ex + L - cx0;
    for (let i = 0; i < 3; i++) {
      plate(x, cx0, top + Hh * (0.05 + i * 0.32), cw, Hh * 0.28, 'enamel');
      R(x, cx0 + 3, top + Hh * (0.09 + i * 0.32), 3, 3, i === 1 ? '#ffb13a' : '#40c4ff');
      for (let j = 0; j < 4; j++) R(x, cx0 + 8 + j * 4, top + Hh * (0.08 + i * 0.32), 2, Hh * 0.2, MAT.enamel[0]);
    }
    R(x, gx, base - 5, ex + L - gx, 3, MAT.copper[3]);
    R(x, gx - 8, top + Hh * 0.32, 10, 3, MAT.copper[3]);
  } else {
    panel(x, endX - 34, base - Hh * 0.46, 30, 14);
  }
}
