import { engineDef, type EngineKey } from '../game/systems/engine';

/**
 * The engine room drawn to scale: the chosen power plant on its bed, a 25 m blue whale beside it for scale (and two
 * engineers at 1.8 m), a scale bar in metres, the overhead crane. Each kind of engine has its own machinery: the
 * diesels' banks of cylinder heads and turbochargers, the gas turbine's nacelles, the steam colossus's boiler, firebox
 * and driving wheels, the W48's four banks round the crankcase, the diesel-electric's generator and traction
 * cabinets, the geothermal engine's glowing exchanger coils, the ramjet pods, the tokamak's magnet ring.
 */

const WHALE_LEN = 25;

type Ctx = CanvasRenderingContext2D;

const R = (x: Ctx, a: number, b: number, w: number, h: number, c: string): void => {
  x.fillStyle = c;
  x.fillRect(Math.round(a), Math.round(b), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
};

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

/** A machined box: lit top, shaded side, outline. */
function block(x: Ctx, a: number, b: number, w: number, h: number, c: string): void {
  R(x, a - 1, b - 1, w + 2, h + 2, '#07090c');
  R(x, a, b, w, h, c);
  R(x, a, b, w, 2, shade(c, 0.3));
  R(x, a, b, 2, h, shade(c, 0.15));
  R(x, a + w - 2, b, 2, h, shade(c, -0.35));
  R(x, a, b + h - 2, w, 2, shade(c, -0.45));
}

function cyl(x: Ctx, a: number, b: number, w: number, h: number, c: string, horizontal = true): void {
  // A cylinder seen from the side: banded shading across its round face.
  const n = horizontal ? h : w;
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const k = 0.35 - Math.abs(t - 0.3) * 1.1;
    if (horizontal) R(x, a, b + i, w, 1, shade(c, k));
    else R(x, a + i, b, 1, h, shade(c, k));
  }
  R(x, horizontal ? a : a, horizontal ? b : b, horizontal ? 1 : w, horizontal ? h : 1, '#07090c');
}

function rivets(x: Ctx, a: number, b: number, w: number, step: number, c = '#8a929c'): void {
  for (let i = a + 2; i < a + w - 1; i += step) R(x, i, b, 1, 1, c);
}

function glow(x: Ctx, cx: number, cy: number, r: number, col: string, k: number): void {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = k;
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
  x.globalAlpha = 1;
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

function person(x: Ctx, cx: number, base: number, px: number, col: string): void {
  const h = Math.max(6, px);
  R(x, cx - h * 0.12, base - h, h * 0.24, h * 0.22, '#d8b088');
  R(x, cx - h * 0.14, base - h * 1.02, h * 0.28, h * 0.1, '#ffd740');
  R(x, cx - h * 0.16, base - h * 0.78, h * 0.32, h * 0.42, col);
  R(x, cx - h * 0.15, base - h * 0.36, h * 0.12, h * 0.36, '#2a2a30');
  R(x, cx + h * 0.03, base - h * 0.36, h * 0.12, h * 0.36, '#2a2a30');
}

/** Paints the engine room for an engine (to scale with the whale). */
export function paintEngineRoom(cv: HTMLCanvasElement, key: EngineKey): void {
  const x = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  const d = engineDef(key);
  x.imageSmoothingEnabled = false;
  // The hall: dark plating, a grid, the floor with its hazard edge, the crane rail overhead.
  x.fillStyle = '#0c1016';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#131922';
  for (let i = 0; i < W; i += 16) x.fillRect(i, 0, 1, H);
  for (let j = 0; j < H; j += 16) x.fillRect(0, j, W, 1);
  const floor = H - 26;
  R(x, 0, floor, W, 26, '#1c222b');
  for (let i = 0; i < W; i += 10) R(x, i, floor, 10, 2, (i / 10) % 2 ? '#07090c' : '#e0b020');
  R(x, 0, 10, W, 4, '#3a4350');
  R(x, 0, 14, W, 1, '#07090c');
  // Scale: px per metre fixed for every engine (the biggest one and the whale fit).
  const k = (W - 40) / (40 + WHALE_LEN + 8);
  const ex = 16, eLen = d.len * k, eH = d.tall * k;
  const top = floor - eH;
  // The crane hook over the engine.
  const hx = ex + eLen / 2;
  R(x, hx - 10, 15, 20, 5, '#e0a020');
  R(x, hx, 20, 1, Math.max(0, top - 26), '#8a929c');
  R(x, hx - 3, Math.max(22, top - 8), 7, 4, '#e0a020');
  paintMachine(x, d.kind, ex, top, eLen, eH, d.flame.outer, k, key);
  // The bed under it.
  R(x, ex - 4, floor - 4, eLen + 8, 4, '#3a3632');
  // The whale for scale, and two engineers.
  const wx = W - 12 - WHALE_LEN * k;
  whale(x, wx, floor - 4, WHALE_LEN * k);
  person(x, ex + eLen + 10, floor, 1.8 * k, '#ff9a3a');
  person(x, wx - 8, floor, 1.8 * k, '#3a8aff');
  // Scale bar in 5 m steps.
  const sy = H - 12;
  for (let m = 0; m <= 40; m += 5) {
    R(x, 16 + m * k, sy, 1, m % 10 ? 3 : 5, '#8fa3c2');
  }
  R(x, 16, sy, 40 * k, 1, '#8fa3c2');
  x.font = '9px monospace';
  x.fillStyle = '#8fa3c2';
  x.fillText('0', 14, sy + 11);
  x.fillText('20 m', 16 + 20 * k - 8, sy + 11);
  x.fillText('40 m', 16 + 40 * k - 10, sy + 11);
  x.fillStyle = '#6f8494';
  x.fillText(`BLUE WHALE ${WHALE_LEN} m (for scale)`, wx, floor + 14);
  x.fillStyle = '#e8f4ff';
  x.font = 'bold 11px monospace';
  x.fillText(`${d.name.toUpperCase()}  ${d.len} m · ${d.mass.toLocaleString()} t · ${d.mw} MW`, 16, 32);
}

/** The machinery itself, by kind. */
function paintMachine(x: Ctx, kind: string, ex: number, top: number, L: number, Hh: number, flame: string, k: number, key: EngineKey): void {
  const base = top + Hh;
  const kd = kind.toLowerCase();
  if (kd.includes('steam')) {
    // Boiler drum, firebox, smokestack, cylinders and three driving wheels.
    const bh = Hh * 0.5;
    cyl(x, ex + L * 0.15, top + Hh * 0.18, L * 0.72, bh, '#3a4048');
    for (let i = 0; i < 8; i++) rivets(x, ex + L * 0.15, top + Hh * 0.18 + 2 + i * (bh / 8), L * 0.72, 5);
    block(x, ex, top + Hh * 0.05, L * 0.18, Hh * 0.7, '#4a3a30');
    R(x, ex + L * 0.04, top + Hh * 0.45, L * 0.1, Hh * 0.18, '#ff8a30');
    glow(x, ex + L * 0.09, top + Hh * 0.54, Hh * 0.3, '#ff9030', 0.6);
    block(x, ex + L * 0.8, top - Hh * 0.12, L * 0.08, Hh * 0.35, '#2a2e34');
    for (let i = 0; i < 3; i++) {
      const cx = ex + L * (0.3 + i * 0.2), r = Hh * 0.2;
      x.fillStyle = '#07090c';
      x.beginPath();
      x.arc(cx, base - r, r + 1, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#b02a20';
      x.beginPath();
      x.arc(cx, base - r, r, 0, Math.PI * 2);
      x.fill();
      for (let s = 0; s < 8; s++) {
        const a = (s * Math.PI) / 4;
        R(x, cx + Math.cos(a) * r * 0.6, base - r + Math.sin(a) * r * 0.6, 2, 2, '#e0e0e0');
      }
    }
    R(x, ex + L * 0.3, base - Hh * 0.22, L * 0.4, 3, '#c0c8d0');
    block(x, ex + L * 0.78, top + Hh * 0.55, L * 0.18, Hh * 0.2, '#50585f');
    return;
  }
  if (kd.includes('turbine')) {
    // Two nacelles: intake bell, compressor rings, the combustor band, the exhaust cone.
    for (let n = 0; n < 2; n++) {
      const y = top + n * Hh * 0.5, h2 = Hh * 0.45;
      cyl(x, ex + L * 0.08, y, L * 0.8, h2, n ? '#6a7480' : '#7a848e');
      for (let i = 0; i < 9; i++) R(x, ex + L * (0.12 + i * 0.05), y + 1, 1, h2 - 2, '#3a4048');
      R(x, ex + L * 0.6, y + 1, L * 0.08, h2 - 2, '#c87a3a');
      x.fillStyle = '#2a2e34';
      x.beginPath();
      x.moveTo(ex + L * 0.88, y);
      x.lineTo(ex + L, y + h2 * 0.25);
      x.lineTo(ex + L, y + h2 * 0.75);
      x.lineTo(ex + L * 0.88, y + h2);
      x.fill();
      glow(x, ex + L, y + h2 / 2, h2 * 0.6, flame, 0.5);
      R(x, ex, y + h2 * 0.1, L * 0.08, h2 * 0.8, '#1a1e24');
    }
    return;
  }
  if (kd.includes('ramjet')) {
    for (let n = 0; n < 2; n++) {
      const y = top + Hh * 0.08 + n * Hh * 0.48, h2 = Hh * 0.38;
      cyl(x, ex + L * 0.15, y, L * 0.7, h2, '#5a6068');
      x.fillStyle = '#9aa0a8';
      x.beginPath();
      x.moveTo(ex, y + h2 / 2);
      x.lineTo(ex + L * 0.18, y);
      x.lineTo(ex + L * 0.18, y + h2);
      x.fill();
      for (let i = 0; i < 6; i++) R(x, ex + L * (0.3 + i * 0.08), y + 2, 1, h2 - 4, '#3a3e44');
      glow(x, ex + L * 0.95, y + h2 / 2, h2 * 1.3, flame, 0.8);
      R(x, ex + L * 0.85, y + h2 * 0.2, L * 0.12, h2 * 0.6, '#1a1e24');
    }
    return;
  }
  if (kd.includes('fusion') || kd.includes('tokamak')) {
    // The torus seen from the side, its magnet coils, the plasma glowing through the windows, cryo lines.
    const cx = ex + L / 2, cy = top + Hh * 0.52, rx = L * 0.42, ry = Hh * 0.46;
    x.fillStyle = '#2a2e3a';
    x.beginPath();
    x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#0c1016';
    x.beginPath();
    x.ellipse(cx, cy, rx * 0.45, ry * 0.3, 0, 0, Math.PI * 2);
    x.fill();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      block(x, cx + Math.cos(a) * rx * 0.78 - 4, cy + Math.sin(a) * ry * 0.78 - 6, 8, 12, '#8a6a30');
    }
    glow(x, cx, cy, rx * 0.8, flame, 0.55);
    for (let i = 0; i < 5; i++) R(x, cx - rx * 0.3 + i * rx * 0.15, cy - 2, rx * 0.06, 4, '#ffffff');
    R(x, ex, top + Hh * 0.1, L, 2, '#40c4ff');
    R(x, ex, base - 4, L, 2, '#40c4ff');
    return;
  }
  if (kd.includes('geo')) {
    block(x, ex, top + Hh * 0.3, L, Hh * 0.7, '#3a3230');
    for (let i = 0; i < 7; i++) {
      const cx = ex + L * (0.1 + i * 0.13);
      for (let j = 0; j < 5; j++) R(x, cx - 4, top + Hh * 0.38 + j * Hh * 0.11, 9, 2, j % 2 ? '#ff5a10' : '#ffa030');
    }
    glow(x, ex + L / 2, top + Hh * 0.62, L * 0.4, '#ff5010', 0.45);
    for (let i = 0; i < 3; i++) cyl(x, ex + L * (0.15 + i * 0.3), top, L * 0.12, Hh * 0.3, '#5a4a40', false);
    return;
  }
  if (kd.includes('radial') || kd.includes('w48')) {
    // Four banks of twelve cylinders round a central crankcase, seen from the side as stacked rows.
    block(x, ex, top + Hh * 0.35, L, Hh * 0.4, '#3a3632');
    for (let bank = 0; bank < 4; bank++) {
      const y = bank < 2 ? top + bank * Hh * 0.17 : top + Hh * 0.75 + (bank - 2) * Hh * 0.12;
      for (let i = 0; i < 12; i++) {
        const cx = ex + L * (0.04 + i * 0.08);
        block(x, cx, y, L * 0.06, Hh * 0.14, bank % 2 ? '#6a707a' : '#7a808a');
      }
    }
    for (let i = 0; i < 4; i++) cyl(x, ex + L * (0.1 + i * 0.22), top + Hh * 0.42, L * 0.12, Hh * 0.2, '#c87a3a');
    R(x, ex - 6, top + Hh * 0.45, 6, Hh * 0.2, '#50585f');
    return;
  }
  diesel(x, key, ex, top, L, Hh, k);
}

/** A flywheel (or any big wheel) side on: rim, spokes, hub. */
function wheel(x: Ctx, cx: number, cy: number, r: number, rim: string, spokes = 6): void {
  x.fillStyle = '#07090c';
  x.beginPath();
  x.arc(cx, cy, r + 1, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = rim;
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = shade(rim, -0.55);
  x.beginPath();
  x.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = shade(rim, 0.15);
  x.lineWidth = Math.max(2, r * 0.12);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.3;
    x.beginPath();
    x.moveTo(cx, cy);
    x.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
    x.stroke();
  }
  x.fillStyle = shade(rim, 0.3);
  x.beginPath();
  x.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  x.fill();
  R(x, cx - 1, cy - 1, 2, 2, '#07090c');
  // Highlight on the rim's top edge.
  x.strokeStyle = shade(rim, 0.45);
  x.lineWidth = 1;
  x.beginPath();
  x.arc(cx, cy, r - 1, Math.PI * 1.15, Math.PI * 1.75);
  x.stroke();
}

/** A gear wheel: teeth round a disc. */
function gear(x: Ctx, cx: number, cy: number, r: number, c: string): void {
  const teeth = Math.max(10, Math.round(r * 0.9));
  x.fillStyle = shade(c, -0.3);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    x.save();
    x.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    x.rotate(a);
    x.fillRect(-2, -2, 4, 4);
    x.restore();
  }
  wheel(x, cx, cy, r - 1, c, 5);
}

/** A turbocharger's snail shell, `r` px round, its outlet pointing up. */
function turbo(x: Ctx, cx: number, cy: number, r: number): void {
  R(x, cx - r * 0.35, cy - r * 1.6, r * 0.7, r * 0.9, '#6a7078');
  R(x, cx - r * 0.35, cy - r * 1.6, r * 0.7, 2, '#9aa2ac');
  wheel(x, cx, cy, r, '#8a929c', 8);
  x.strokeStyle = '#c87a3a';
  x.lineWidth = 2;
  x.beginPath();
  x.arc(cx, cy, r * 0.55, 0.2, Math.PI * 1.4);
  x.stroke();
}

/** Grated walkway with posts and a yellow hand rail from a to b at height y (the rail sits `rail` px above). */
function walkway(x: Ctx, a: number, b: number, y: number, rail: number): void {
  R(x, a, y, b - a, 3, '#3a4350');
  for (let i = a; i < b; i += 3) R(x, i, y + 1, 1, 1, '#1a1e24');
  R(x, a, y - rail, b - a, 2, '#e0b020');
  R(x, a, y - rail / 2, b - a, 1, '#a07a18');
  for (let i = a; i <= b; i += Math.max(8, rail * 1.2)) R(x, i, y - rail, 2, rail, '#a07a18');
}

function ladder(x: Ctx, a: number, y0: number, y1: number): void {
  R(x, a, y0, 1, y1 - y0, '#a07a18');
  R(x, a + 5, y0, 1, y1 - y0, '#a07a18');
  for (let j = y0 + 2; j < y1; j += 4) R(x, a, j, 6, 1, '#e0b020');
}

/** A gauge panel: dials and lamps. */
function panel(x: Ctx, a: number, b: number, w: number, h: number): void {
  block(x, a, b, w, h, '#2a313c');
  const n = Math.max(1, Math.floor((w - 4) / 9));
  for (let i = 0; i < n; i++) {
    const cx = a + 6 + i * 9, cy = b + h * 0.38;
    x.fillStyle = '#d8dde4';
    x.beginPath();
    x.arc(cx, cy, 3, 0, Math.PI * 2);
    x.fill();
    R(x, cx, cy - 2, 1, 2, '#c02010');
    R(x, cx - 1, b + h - 5, 2, 2, i % 3 ? '#76ff03' : '#ffb13a');
  }
}

/** The diesels: flywheel, crankcase with its inspection doors, the cylinder block, rows of heads under their rocker
 * covers (two banks on a V), the exhaust manifold into the turbochargers, air and coolant pipes, the walkway along the
 * top with its rail and a ladder, the control panel. The low-gear plant has its reduction gearbox open at the stern,
 * the opposed-piston engine two crankshafts with the cylinders between, the twin-crank two V16s into one gearbox, and
 * the diesel-electric its generator, traction cabinets and busbars. */
function diesel(x: Ctx, key: EngineKey, ex: number, top: number, L: number, Hh: number, k: number): void {
  const base = top + Hh;
  const fr = Hh * 0.36;
  const bx = ex + fr * 1.7;
  // How much of the length the engine block takes; the rest is the gearbox, generator or second engine.
  const tail = key === 'tortoise' ? 0.28 : key === 'megalodon' ? 0.36 : 0;
  const endX = ex + L * (1 - tail);
  // One engine block (from a to b): crankcase, cylinder block, heads, manifold. Returns its heads' top.
  const engine = (a: number, b: number, banks: number, turbos: number): void => {
    const len = b - a;
    const ccTop = top + Hh * 0.52, cbTop = top + Hh * 0.3;
    // Crankcase and sump.
    block(x, a, ccTop, len, base - ccTop - 2, '#3e434c');
    R(x, a + 3, base - 6, len - 6, 3, '#23272e');
    const cylN = Math.max(6, Math.round(len / (2.1 * k)));
    const pitch = (len - 6) / cylN;
    for (let i = 0; i < cylN; i += 2) {
      const dx = a + 3 + i * pitch + 2, dw = pitch * 2 - 5, dh = (base - ccTop) * 0.45;
      block(x, dx, ccTop + 5, dw, dh, '#4e545e');
      R(x, dx + 1, ccTop + 6, 1, 1, '#a0a8b2');
      R(x, dx + dw - 2, ccTop + 6, 1, 1, '#a0a8b2');
      R(x, dx + 1, ccTop + 3 + dh, 1, 1, '#a0a8b2');
      R(x, dx + dw - 2, ccTop + 3 + dh, 1, 1, '#a0a8b2');
    }
    // Coolant and fuel lines along the crankcase.
    R(x, a, ccTop + (base - ccTop) * 0.62, len, 2, '#c87a3a');
    R(x, a, ccTop + (base - ccTop) * 0.62, len, 1, '#f0a868');
    R(x, a, ccTop + (base - ccTop) * 0.72, len, 1, '#e0b020');
    // Cylinder block with a rib per cylinder.
    block(x, a + 2, cbTop, len - 4, ccTop - cbTop, '#565d68');
    for (let i = 1; i < cylN; i++) R(x, a + 3 + i * pitch, cbTop + 2, 1, ccTop - cbTop - 3, '#3a4048');
    // Heads under their rocker covers: the far bank higher and darker, the near bank in front.
    for (let bank = banks - 1; bank >= 0; bank--) {
      const hy = cbTop - Hh * (0.12 + bank * 0.07), hh = Hh * 0.13;
      for (let i = 0; i < cylN; i++) {
        const cx = a + 4 + i * pitch + (bank ? pitch * 0.35 : 0);
        if (cx + pitch - 2 > b - 2) continue;
        block(x, cx, hy, pitch - 2, hh, bank ? '#6a2a20' : i % 2 ? '#8a3a2a' : '#9a4232');
        R(x, cx + 1, hy + hh * 0.45, pitch - 4, 1, bank ? '#4a1e18' : '#c0604a');
        if (!bank) R(x, cx + pitch / 2 - 2, hy - 2, 2, 2, '#9aa2ac');
      }
    }
    // Exhaust manifold with lagging bands, running to the turbochargers at the stern end.
    const my = cbTop - Hh * (0.2 + (banks - 1) * 0.07);
    cyl(x, a + 4, my - 5, len - 12 - turbos * fr * 0.5, 6, '#8a8278');
    for (let i = a + 8; i < b - 12 - turbos * fr * 0.5; i += 10) R(x, i, my - 5, 2, 6, '#6a625a');
    for (let t = 0; t < turbos; t++) turbo(x, b - 10 - t * fr * 0.7, my - 2 - (t % 2) * 4, Math.max(6, fr * 0.3));
    // Charge-air duct back along the far side.
    R(x, a + 6, cbTop + 3, len - 14, 3, '#5a7a9a');
  };
  if (key === 'humpback') {
    // Opposed pistons: an upper and a lower crankcase with the cylinders standing between them.
    const a = bx, b = endX;
    const len = b - a;
    const cylN = Math.max(6, Math.round(len / (2.4 * k)));
    const pitch = (len - 6) / cylN;
    block(x, a, top + Hh * 0.08, len, Hh * 0.22, '#3e434c');
    block(x, a, base - Hh * 0.3, len, Hh * 0.28, '#3e434c');
    for (let i = 0; i < cylN; i++) {
      const cx = a + 3 + i * pitch;
      block(x, cx + 1, top + Hh * 0.3, pitch - 3, Hh * 0.4, '#5a616c');
      // The two pistons meeting in the middle.
      R(x, cx + pitch / 2 - 2, top + Hh * 0.32, 3, Hh * 0.15, '#c0c8d0');
      R(x, cx + pitch / 2 - 2, top + Hh * 0.53, 3, Hh * 0.15, '#c0c8d0');
      R(x, cx + 2, top + Hh * 0.49, pitch - 5, 2, '#ff8a30');
    }
    // The two crankshafts' ends and the timing gear train between them at the flywheel end.
    gear(x, a + 2, top + Hh * 0.19, Hh * 0.1, '#7a8088');
    gear(x, a + 2, base - Hh * 0.16, Hh * 0.1, '#7a8088');
    R(x, a - 2, top + Hh * 0.19, 3, base - top - Hh * 0.35, '#5a6068');
    // Ports ring and turbos on top.
    cyl(x, a + 6, top + Hh * 0.02, len - 30, 5, '#8a8278');
    turbo(x, b - 12, top + Hh * 0.1, Math.max(6, fr * 0.3));
    walkway(x, a + 4, b - 22, top + Hh * 0.02 - 1, 7);
  } else if (key === 'cachalot') {
    // Two V16s into one combining gearbox in the middle.
    const mid = bx + (endX - bx) / 2;
    engine(bx, mid - Hh * 0.22, 2, 2);
    engine(mid + Hh * 0.22, endX, 2, 2);
    block(x, mid - Hh * 0.24, top + Hh * 0.35, Hh * 0.48, Hh * 0.65, '#3a4048');
    gear(x, mid, top + Hh * 0.6, Hh * 0.18, '#8a929c');
    walkway(x, bx + 4, endX - 6, top + Hh * 0.02, 7);
  } else {
    engine(bx, endX, key === 'leviathan' ? 2 : 1, key === 'tortoise' ? 1 : 2);
    walkway(x, bx + 4, endX - 20, top + Hh * 0.0, 7);
  }
  // Flywheel with its guard.
  wheel(x, ex + fr, base - fr - 2, fr, '#6a7078', 6);
  x.strokeStyle = '#e0b020';
  x.lineWidth = 2;
  x.beginPath();
  x.arc(ex + fr, base - fr - 2, fr + 3, Math.PI * 1.05, Math.PI * 1.95);
  x.stroke();
  ladder(x, bx + 1, top + Hh * 0.02, base - 2);
  if (key === 'tortoise') {
    // The reduction gearbox, its cover off: a train of gears stepping the speed down to crawling.
    const gx = endX + 2, gw = ex + L - gx;
    block(x, gx, top + Hh * 0.18, gw, Hh * 0.82, '#3a4048');
    R(x, gx + 3, top + Hh * 0.24, gw - 6, Hh * 0.7, '#1a1e24');
    gear(x, gx + gw * 0.3, top + Hh * 0.45, Hh * 0.14, '#8a929c');
    gear(x, gx + gw * 0.62, top + Hh * 0.62, Hh * 0.26, '#a0a8b0');
    gear(x, gx + gw * 0.28, top + Hh * 0.78, Hh * 0.1, '#7a8088');
    R(x, gx + gw - 3, top + Hh * 0.6, 8, 4, '#5a6068');
    panel(x, gx + 4, top + Hh * 0.18 - 14, Math.min(40, gw - 8), 12);
  } else if (key === 'megalodon') {
    // The generator (copper windings under the casing bands), three traction cabinets, and busbars to the crawlers.
    const gx = endX + 4, gw = (ex + L - gx) * 0.5;
    cyl(x, gx, top + Hh * 0.2, gw, Hh * 0.78, '#3a5a8a', false);
    for (let i = 1; i < 6; i++) R(x, gx + (i * gw) / 6, top + Hh * 0.2, 2, Hh * 0.78, '#c87a3a');
    glow(x, gx + gw / 2, top + Hh * 0.6, Hh * 0.5, '#40c4ff', 0.3);
    const cx0 = gx + gw + 4, cw = ex + L - cx0;
    for (let i = 0; i < 3; i++) {
      block(x, cx0, top + Hh * (0.05 + i * 0.32), cw, Hh * 0.28, '#2a3a4a');
      R(x, cx0 + 3, top + Hh * (0.09 + i * 0.32), 3, 3, i === 1 ? '#ffb13a' : '#40c4ff');
      for (let j = 0; j < 4; j++) R(x, cx0 + 8 + j * 4, top + Hh * (0.08 + i * 0.32), 2, Hh * 0.2, '#1a2430');
    }
    R(x, gx, base - 5, ex + L - gx, 3, '#c87a3a');
    R(x, gx - 8, top + Hh * 0.32, 10, 3, '#c87a3a');
  } else {
    panel(x, endX - 34, base - Hh * 0.46, 30, 14);
  }
}
