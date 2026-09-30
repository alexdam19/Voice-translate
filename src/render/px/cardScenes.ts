import { hero, type HeroPose, type HeroRole } from './heroes';
import { hash2, makeCanvas, mix, shade } from './pixels';

/**
 * The battle cards' illustrations as small pixel paintings (144 x 96): a sky in the school's colours over a
 * horizon (ruined skyline, mountains, dunes), dithered the way a pixel artist blends bands, the ground in the
 * foreground, and a scene for the card: the people from heroes.ts doing the thing (the artillery crew watching the
 * shells land, the gunner hosing tracer, the sniper's red line, the squad dropping in), the machines (jets,
 * gunships, tanks, the mech, the Titan itself) painted side on, and the effects (explosions in layers of smoke,
 * flame and white heat, lightning, beams from orbit, rockets and their trails, the dome, the rift, the black hole).
 */

export const CARD_W = 144, CARD_H = 96;
const GROUND = 74;

type C = CanvasRenderingContext2D;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x: number, y: number): number => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

const SKY: Record<string, [string, string, string]> = {
  iron: ['#2a0e0a', '#8a2e1a', '#e89a4a'],
  volt: ['#08142a', '#1a4a7a', '#6ab8e8'],
  rust: ['#10200c', '#3a5a22', '#b8c86a'],
  void: ['#0e0620', '#3e1a6a', '#a86ad8'],
  aegis: ['#1e1606', '#6a5212', '#e8c86a'],
};

function R(c: C, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/** A pixel disc, dithered at its edge. */
function disc(c: C, cx: number, cy: number, r: number, col: string, soft = true): void {
  c.fillStyle = col;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d > 1) continue;
      if (soft && d > 0.82 && bay(x, y) < (d - 0.82) / 0.18) continue;
      c.fillRect(x, y, 1, 1);
    }
  }
}

/** A dithered glow: denser toward the middle. */
function glow(c: C, cx: number, cy: number, r: number, col: string, k = 0.6): void {
  c.fillStyle = col;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d > 1) continue;
      if (bay(x, y) < (1 - d) * k) c.fillRect(x, y, 1, 1);
    }
  }
}

function line(c: C, x0: number, y0: number, x1: number, y1: number, col: string, w = 1): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  c.fillStyle = col;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    c.fillRect(Math.round(x0 + (x1 - x0) * t - (w - 1) / 2), Math.round(y0 + (y1 - y0) * t - (w - 1) / 2), w, w);
  }
}

/** The sky, the horizon and the ground. */
function backdrop(c: C, school: string, seed: number, horizon: 'city' | 'hills' | 'dunes' | 'none' = 'city'): void {
  const [top, mid, low] = SKY[school] ?? SKY.iron;
  for (let y = 0; y < GROUND; y++) {
    const t = y / GROUND;
    for (let x = 0; x < CARD_W; x++) {
      const a = t < 0.55 ? mix(top, mid, t / 0.55) : mix(mid, low, (t - 0.55) / 0.45);
      c.fillStyle = a;
      c.fillRect(x, y, 1, 1);
    }
  }
  // Dithered stripes between bands, and stars up top.
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(hash2(k, seed, 1) * CARD_W), y = Math.floor(hash2(seed, k, 2) * 26);
    R(c, x, y, 1, 1, shade(low, 0.3));
  }
  const far = shade(mid, -0.35), near = shade(mid, -0.55);
  if (horizon === 'city') {
    for (let x = 0; x < CARD_W; ) {
      const w = 5 + Math.floor(hash2(x, seed, 3) * 12), h = 8 + Math.floor(hash2(seed, x, 4) * 22);
      R(c, x, GROUND - h, w, h, far);
      if (hash2(x, seed, 5) > 0.5) R(c, x + 1, GROUND - h - 3, 1, 3, far);
      for (let wy = GROUND - h + 3; wy < GROUND - 2; wy += 4) for (let wx = x + 1; wx < x + w - 1; wx += 3) if (hash2(wx, wy, seed) > 0.8) R(c, wx, wy, 1, 1, shade(low, 0.1));
      x += w + Math.floor(hash2(x, 7, seed) * 4);
    }
  } else if (horizon === 'hills') {
    for (let x = 0; x < CARD_W; x++) {
      const h = 14 + Math.sin(x * 0.05 + seed) * 7 + Math.sin(x * 0.13 + seed * 2) * 4;
      R(c, x, GROUND - h, 1, h, far);
      const h2 = 7 + Math.sin(x * 0.08 + seed * 3) * 4;
      R(c, x, GROUND - h2, 1, h2, near);
    }
  } else if (horizon === 'dunes') {
    for (let x = 0; x < CARD_W; x++) {
      const h = 6 + Math.sin(x * 0.04 + seed) * 4 + Math.sin(x * 0.11) * 2;
      R(c, x, GROUND - h, 1, h, far);
    }
  }
  // The ground: dirt with a lit edge, pebbles and tufts.
  const g0 = school === 'rust' ? '#4a4228' : school === 'volt' ? '#34383e' : school === 'void' ? '#2e2436' : school === 'aegis' ? '#5a4a2c' : '#4a3226';
  for (let y = GROUND; y < CARD_H; y++) R(c, 0, y, CARD_W, 1, shade(g0, -((y - GROUND) / (CARD_H - GROUND)) * 0.35));
  R(c, 0, GROUND, CARD_W, 1, shade(g0, 0.25));
  for (let k = 0; k < 70; k++) {
    const x = Math.floor(hash2(k, seed, 8) * CARD_W), y = GROUND + 1 + Math.floor(hash2(seed, k, 9) * (CARD_H - GROUND - 1));
    R(c, x, y, 1 + (k % 3 === 0 ? 1 : 0), 1, hash2(k, 3, seed) > 0.5 ? shade(g0, 0.18) : shade(g0, -0.3));
  }
}

/** Flames, smoke and white heat in layers, sparks and debris flung out. */
function boom(c: C, cx: number, cy: number, r: number, seed = 0): void {
  for (let k = 0; k < 6; k++) disc(c, cx + (hash2(k, seed, 1) - 0.5) * r * 1.4, cy - r * 0.4 + (hash2(seed, k, 2) - 0.5) * r * 0.8, r * (0.45 + hash2(k, k, seed) * 0.3), '#3a3230');
  disc(c, cx, cy, r, '#c83a10');
  disc(c, cx - r * 0.1, cy - r * 0.1, r * 0.75, '#ff8a1a');
  disc(c, cx - r * 0.15, cy - r * 0.18, r * 0.48, '#ffd24a');
  disc(c, cx - r * 0.2, cy - r * 0.22, r * 0.22, '#fff8e0');
  glow(c, cx, cy, r * 1.8, '#ffb040', 0.35);
  for (let k = 0; k < 10; k++) {
    const a = hash2(k, seed, 5) * Math.PI * 2, d = r * (1.1 + hash2(seed, k, 6) * 0.9);
    R(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 1, 1, k % 2 ? '#ffe080' : '#2a2220');
  }
}

function puff(c: C, cx: number, cy: number, r: number, col = '#8a8a86'): void {
  disc(c, cx, cy, r, shade(col, -0.25));
  disc(c, cx - r * 0.2, cy - r * 0.25, r * 0.75, col);
  disc(c, cx - r * 0.35, cy - r * 0.4, r * 0.35, shade(col, 0.25));
}

function beam(c: C, x0: number, y0: number, x1: number, y1: number, w: number, col: string): void {
  line(c, x0, y0, x1, y1, shade(col, -0.3), w + 4);
  line(c, x0, y0, x1, y1, col, w + 2);
  line(c, x0, y0, x1, y1, '#ffffff', Math.max(1, w - 1));
}

function bolt(c: C, x0: number, y0: number, x1: number, y1: number, col: string, seed: number): void {
  const n = 9;
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const nx = x0 + (x1 - x0) * t + (i < n ? (hash2(i, seed, 1) - 0.5) * 16 : 0), ny = y0 + (y1 - y0) * t;
    line(c, px, py, nx, ny, col, 3);
    line(c, px, py, nx, ny, '#ffffff', 1);
    if (hash2(i, seed, 2) > 0.6) line(c, nx, ny, nx + (hash2(seed, i, 3) - 0.5) * 18, ny + 8, col, 1);
    px = nx;
    py = ny;
  }
  glow(c, x1, y1, 10, col, 0.5);
}

function rocket(c: C, x: number, y: number, dx: number, dy: number, trail: number): void {
  const d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
  for (let k = 0; k < trail; k += 3) puff(c, x - ux * k, y - uy * k, 1.2 + k * 0.08, '#a8a8a4');
  line(c, x, y, x + ux * 5, y + uy * 5, '#d8dce0', 2);
  R(c, x + ux * 5, y + uy * 5, 1, 1, '#c02020');
  disc(c, x - ux * 1.5, y - uy * 1.5, 1.6, '#ffb040', false);
}

/** A fighter jet side on, nose to the right (or left). */
function jet(c: C, x: number, y: number, s: number, flip = false, col = '#8a96a6'): void {
  const X = (u: number): number => (flip ? x - u * s : x + u * s);
  const Y = (v: number): number => y + v * s;
  c.fillStyle = '#0c0e12';
  c.beginPath();
  c.moveTo(X(0), Y(0.2));
  c.lineTo(X(12), Y(-0.4));
  c.lineTo(X(16), Y(0.4));
  c.lineTo(X(12), Y(1.4));
  c.lineTo(X(0), Y(1.6));
  c.closePath();
  c.fill();
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(X(0.4), Y(0.4));
  c.lineTo(X(12), Y(-0.1));
  c.lineTo(X(15.3), Y(0.5));
  c.lineTo(X(12), Y(1.1));
  c.lineTo(X(0.4), Y(1.3));
  c.closePath();
  c.fill();
  R(c, Math.min(X(1), X(12)), Y(0.1), Math.abs(X(12) - X(1)), Math.max(1, s * 0.3), shade(col, 0.3));
  // Canopy, wing, fin, afterburner.
  c.fillStyle = '#5ab8e8';
  c.fillRect(Math.round(Math.min(X(10), X(12.5))), Math.round(Y(-0.5)), Math.round(2.5 * s), Math.max(1, Math.round(0.6 * s)));
  c.fillStyle = shade(col, -0.3);
  c.beginPath();
  c.moveTo(X(5), Y(1));
  c.lineTo(X(9), Y(1));
  c.lineTo(X(5), Y(3.2));
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(X(0.5), Y(0.4));
  c.lineTo(X(2.8), Y(0.3));
  c.lineTo(X(0.5), Y(-2.4));
  c.closePath();
  c.fill();
  disc(c, X(-0.8), Y(0.9), 1.4 * s, '#ff9a30', false);
  disc(c, X(-0.5), Y(0.9), 0.7 * s, '#fff0b0', false);
}

/** The Titan side on: its crawlers, the long armoured hull, the citadel and the main battery. */
function titan(c: C, x: number, y: number, L: number, alpha = 1): void {
  c.globalAlpha = alpha;
  const H = L * 0.3;
  R(c, x, y - H * 0.35, L, H * 0.35, '#1a1c20');
  for (let k = 0; k < 8; k++) disc(c, x + L * (0.06 + k * 0.125), y - H * 0.18, H * 0.13, '#3a3e44', false);
  R(c, x, y - H * 0.36, L, 1, '#4a4e54');
  c.fillStyle = '#0c0e12';
  c.beginPath();
  c.moveTo(x - 2, y - H * 0.34);
  c.lineTo(x + L * 0.82, y - H * 0.34);
  c.lineTo(x + L + 3, y - H * 0.55);
  c.lineTo(x + L * 0.86, y - H);
  c.lineTo(x + 2, y - H);
  c.closePath();
  c.fill();
  c.fillStyle = '#3e4757';
  c.beginPath();
  c.moveTo(x, y - H * 0.38);
  c.lineTo(x + L * 0.82, y - H * 0.38);
  c.lineTo(x + L, y - H * 0.56);
  c.lineTo(x + L * 0.85, y - H * 0.96);
  c.lineTo(x + 3, y - H * 0.96);
  c.closePath();
  c.fill();
  R(c, x + 3, y - H * 0.96, L * 0.82, 1, '#6a7890');
  for (let k = 0; k < 10; k++) R(c, x + 4 + k * L * 0.08, y - H * 0.7, 2, 1, k % 3 ? '#3ab4ff' : '#ffd060');
  R(c, x + L * 0.3, y - H * 1.25, L * 0.3, H * 0.3, '#313946');
  R(c, x + L * 0.3, y - H * 1.25, L * 0.3, 1, '#687790');
  R(c, x + L * 0.45, y - H * 1.15, L * 0.5, 2, '#22262c');
  R(c, x + L * 0.45, y - H * 1.15, L * 0.5, 1, '#5a6272');
  c.globalAlpha = 1;
}

/** A tank side on, gun to the right. */
function tankSide(c: C, x: number, y: number, s: number): void {
  R(c, x, y - 4 * s, 18 * s, 4 * s, '#1a1c1e');
  for (let k = 0; k < 6; k++) disc(c, x + (1.8 + k * 2.9) * s, y - 2 * s, 1.3 * s, '#3a3e40', false);
  R(c, x + s, y - 7 * s, 16 * s, 3.4 * s, '#5a6a3a');
  R(c, x + s, y - 7 * s, 16 * s, s, '#7a8a50');
  R(c, x + 5 * s, y - 10 * s, 7 * s, 3.2 * s, '#4e5e34');
  R(c, x + 5 * s, y - 10 * s, 7 * s, s * 0.8, '#6e7e48');
  R(c, x + 12 * s, y - 9 * s, 10 * s, 1.2 * s, '#2a2e22');
}

/** A walking mech side on: reverse-jointed legs, the armoured cockpit pod, an arm cannon and a missile box. */
function mechSide(c: C, x: number, y: number, s: number): void {
  const m = '#6a7482', d = shade(m, -0.35), l = shade(m, 0.3);
  const leg = (hx: number, f: number): void => {
    const kx = hx + 3 * s * f, ky = y - 9 * s;
    line(c, hx, y - 15 * s, kx, ky, '#0c0e12', Math.round(3.4 * s));
    line(c, hx, y - 15 * s, kx, ky, f > 0 ? m : d, Math.round(2.4 * s));
    line(c, kx, ky, hx - s, y - 1.5 * s, '#0c0e12', Math.round(3 * s));
    line(c, kx, ky, hx - s, y - 1.5 * s, f > 0 ? m : d, Math.round(2 * s));
    disc(c, kx, ky, 1.4 * s, '#2a2e34', false);
    R(c, hx - 4 * s, y - 1.5 * s, 6 * s, 1.5 * s, '#1a1c1e');
  };
  leg(x + 3 * s, -1);
  // The pod.
  c.fillStyle = '#0c0e12';
  c.beginPath();
  c.moveTo(x - 2 * s, y - 15 * s);
  c.lineTo(x + 12 * s, y - 15 * s);
  c.lineTo(x + 15 * s, y - 20 * s);
  c.lineTo(x + 10 * s, y - 25 * s);
  c.lineTo(x, y - 25 * s);
  c.lineTo(x - 3 * s, y - 20 * s);
  c.closePath();
  c.fill();
  c.fillStyle = m;
  c.beginPath();
  c.moveTo(x - 1.4 * s, y - 15.6 * s);
  c.lineTo(x + 11.6 * s, y - 15.6 * s);
  c.lineTo(x + 14.2 * s, y - 20 * s);
  c.lineTo(x + 9.6 * s, y - 24.4 * s);
  c.lineTo(x + 0.4 * s, y - 24.4 * s);
  c.lineTo(x - 2.2 * s, y - 20 * s);
  c.closePath();
  c.fill();
  R(c, x + 0.4 * s, y - 24.4 * s, 9 * s, s * 0.8, l);
  R(c, x - 1 * s, y - 17 * s, 12 * s, s, d);
  // Cockpit glass, missile box, arm cannon.
  R(c, x + 8 * s, y - 22.6 * s, 4.6 * s, 2 * s, '#ff9a30');
  R(c, x + 8 * s, y - 22.6 * s, 4.6 * s, 0.6 * s, '#ffe0a0');
  R(c, x - 5 * s, y - 27 * s, 6 * s, 6 * s, shade(m, -0.15));
  for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) disc(c, x - 3.6 * s + j * 2.6 * s, y - 25.6 * s + k * 1.9 * s, 0.6 * s, '#c02020', false);
  R(c, x + 6 * s, y - 16 * s, 3 * s, 4 * s, d);
  R(c, x + 8 * s, y - 14 * s, 11 * s, 1.8 * s, '#2a2e34');
  R(c, x + 8 * s, y - 14 * s, 11 * s, 0.6 * s, '#5a6068');
  leg(x + 8 * s, 1);
}

function drone(c: C, x: number, y: number): void {
  R(c, x - 4, y, 9, 1, '#2a2e34');
  R(c, x - 5, y - 1, 3, 1, '#8a929c');
  R(c, x + 3, y - 1, 3, 1, '#8a929c');
  R(c, x - 1, y - 1, 3, 3, '#4a5260');
  R(c, x, y + 2, 1, 1, '#40ff80');
}

function dragon(c: C, x: number, y: number): void {
  const b = '#6a2a1a', l = '#b04a2a';
  c.fillStyle = '#0c0808';
  c.beginPath();
  c.moveTo(x - 30, y + 4);
  c.quadraticCurveTo(x - 10, y - 2, x + 14, y - 6);
  c.lineTo(x + 26, y - 12);
  c.lineTo(x + 30, y - 8);
  c.lineTo(x + 20, y - 2);
  c.quadraticCurveTo(x + 4, y + 10, x - 30, y + 4);
  c.fill();
  c.fillStyle = b;
  c.beginPath();
  c.moveTo(x - 28, y + 3);
  c.quadraticCurveTo(x - 10, y - 1, x + 14, y - 5);
  c.lineTo(x + 25, y - 10);
  c.lineTo(x + 28, y - 8);
  c.lineTo(x + 19, y - 2);
  c.quadraticCurveTo(x + 4, y + 8, x - 28, y + 3);
  c.fill();
  // Wings.
  c.fillStyle = shade(b, -0.25);
  c.beginPath();
  c.moveTo(x - 6, y - 2);
  c.lineTo(x - 22, y - 30);
  c.lineTo(x - 12, y - 24);
  c.lineTo(x - 4, y - 32);
  c.lineTo(x + 2, y - 22);
  c.lineTo(x + 8, y - 26);
  c.lineTo(x + 6, y - 4);
  c.closePath();
  c.fill();
  line(c, x - 6, y - 2, x - 22, y - 30, l);
  line(c, x + 2, y - 4, x - 4, y - 32, l);
  R(c, x + 23, y - 10, 1, 1, '#ffe060');
}

function dome(c: C, cx: number, cy: number, r: number, col: string): void {
  for (let y = Math.floor(cy - r); y <= cy; y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d > 1) continue;
      const hex = (x + Math.floor(y / 3)) % 6 === 0 || y % 3 === 0;
      if (d > 0.92 || (hex && bay(x, y) < 0.35) || bay(x, y) < 0.12) R(c, x, y, 1, 1, d > 0.92 ? shade(col, 0.4) : col);
    }
  }
}

function plateArt(c: C, x: number, y: number, w: number, h: number): void {
  R(c, x - 1, y - 1, w + 2, h + 2, '#101216');
  R(c, x, y, w, h, '#4a5260');
  R(c, x, y, w, 2, '#6a7280');
  for (let k = 12; k < w; k += 12) R(c, x + k, y + 2, 1, h - 2, '#343a44');
  for (let k = 4; k < w; k += 6) {
    R(c, x + k, y + 3, 1, 1, '#9aa2ac');
    R(c, x + k, y + h - 3, 1, 1, '#9aa2ac');
  }
  R(c, x, y + h - 2, w, 2, '#2a3038');
}

type Fig = [HeroRole, HeroPose, number, number, number?, boolean?];

/** Figures standing on the ground: [role, pose, x of feet, size, frame, facing left]. */
function figs(c: C, list: Fig[], seed: number): void {
  list.forEach(([role, pose, x, S, frame, left], i) => {
    const img = hero({ role, seed: seed * 7 + i * 13 }, pose, frame ?? 0, S);
    const fx = Math.round(12.4 * (S / 32)) + 1, fy = Math.round(30.9 * (S / 32)) + 1;
    const y = GROUND + 6 - fy;
    if (left) {
      c.save();
      c.translate(Math.round(x + (img.width - fx)), y);
      c.scale(-1, 1);
      c.drawImage(img, 0, 0);
      c.restore();
    } else c.drawImage(img, Math.round(x - fx), y);
  });
}

const cache = new Map<string, HTMLCanvasElement>();

/** The painting for a card. */
export function cardScene(id: string, school: string): HTMLCanvasElement {
  const key = `${id}|${school}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = makeCanvas(CARD_W, CARD_H);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 997;
  const horizon: 'city' | 'hills' | 'dunes' | 'none' = seed % 3 === 0 ? 'hills' : seed % 3 === 1 ? 'city' : 'dunes';
  backdrop(c, school, seed, horizon);
  const Y = GROUND;
  switch (id) {
    case 'artillery':
      for (let k = 0; k < 3; k++) boom(c, 70 + k * 26, Y - 6 - (k % 2) * 4, 7, k);
      for (let k = 0; k < 3; k++) line(c, 60 + k * 26, 6 + k * 3, 66 + k * 26, 18 + k * 3, '#d8d8d0');
      tankSide(c, 58, Y + 3, 1.3);
      disc(c, 88, Y - 9, 3, '#fff2a0');
      figs(c, [['officer', 'look', 14, 44], ['rifleman', 'stand', 34, 40], ['heavy', 'stand', 50, 40, 0, true]], seed);
      break;
    case 'salvo':
      for (let k = 0; k < 6; k++) rocket(c, 40 + k * 14, 50 - k * 6, 3, -1.2, 24);
      boom(c, 126, 60, 9, 1);
      figs(c, [['heavy', 'aim', 22, 48]], seed);
      break;
    case 'fireball':
      disc(c, 96, 30, 18, '#c82a0a');
      disc(c, 93, 27, 13, '#ff7a1a');
      disc(c, 90, 24, 8, '#ffd24a');
      disc(c, 88, 22, 4, '#fff8e0');
      glow(c, 94, 28, 30, '#ff9a30', 0.35);
      for (let k = 0; k < 8; k++) disc(c, 120 + k * 3, 6 - k * 1.5, 3 - k * 0.3, '#ff9a30');
      figs(c, [['officer', 'aim', 24, 46]], seed);
      break;
    case 'carpet_bomb':
      jet(c, 18, 14, 1.4);
      jet(c, 58, 8, 1.1);
      for (let k = 0; k < 6; k++) {
        R(c, 30 + k * 16, 26 + k * 4, 2, 3, '#2a2c2e');
        boom(c, 20 + k * 22, Y - 4, 7 + (k % 2) * 2, k);
      }
      break;
    case 'barrage':
      for (let k = 0; k < 7; k++) line(c, 48, 50 - k * 1.5, 140, 30 + k * 6, k % 2 ? '#ffe082' : '#ffab40');
      for (let k = 0; k < 4; k++) boom(c, 118 + (k % 2) * 12, 40 + k * 10, 4, k);
      figs(c, [['heavy', 'aim', 24, 52]], seed);
      break;
    case 'meltdown':
      glow(c, 90, 44, 40, '#ff6d00', 0.5);
      disc(c, 90, 44, 16, '#ff6d00');
      disc(c, 90, 44, 11, '#ffd24a');
      disc(c, 90, 44, 5, '#ffffff');
      for (let r = 20; r < 44; r += 8) for (let a = 0; a < Math.PI * 2; a += 0.08) if (bay(Math.round(a * 20), r) < 0.5) R(c, 90 + Math.cos(a) * r, 44 + Math.sin(a) * r * 0.7, 1, 1, '#ffab40');
      figs(c, [['firefighter', 'walk', 26, 46, 1]], seed);
      break;
    case 'jets':
      jet(c, 14, 44, 1.6);
      jet(c, 54, 26, 1.3);
      jet(c, 92, 12, 1.1);
      for (let k = 0; k < 40; k++) R(c, 4 + k, 47 + k * 0.1, 1, 1, '#e8e8e0');
      break;
    case 'meteor':
      for (let k = 0; k < 4; k++) {
        const x = 30 + k * 30, y = 14 + (k % 2) * 16;
        line(c, x - 22, y - 16, x, y, '#ff9a30', 3);
        line(c, x - 22, y - 16, x, y, '#ffe080', 1);
        disc(c, x, y, 4, '#5a3a2a');
        disc(c, x - 1, y - 1, 2, '#ff9a30');
      }
      boom(c, 72, Y - 4, 10, 3);
      break;
    case 'nuke':
      glow(c, 90, 40, 60, '#ffcc80', 0.5);
      R(c, 84, 36, 12, Y - 36, '#c8a07a');
      R(c, 86, 36, 3, Y - 36, '#e8c8a0');
      disc(c, 90, 30, 20, '#e89a5a');
      disc(c, 88, 27, 15, '#ffcc80');
      disc(c, 86, 24, 8, '#fff2d0');
      for (let k = 0; k < 20; k++) disc(c, 70 + k * 2, Y - 2, 4, '#b8906a');
      figs(c, [['rifleman', 'look', 18, 40], ['marine', 'stand', 34, 40]], seed);
      break;
    case 'emp':
      for (let r = 8; r < 60; r += 9) for (let a = 0; a < Math.PI * 2; a += 0.05) if (bay(Math.round(a * 30), r) < 0.6) R(c, 84 + Math.cos(a) * r, 40 + Math.sin(a) * r * 0.6, 1, 1, r % 2 ? '#ea80fc' : '#8ad8ff');
      disc(c, 84, 40, 5, '#ffffff');
      drone(c, 110, 24);
      drone(c, 60, 30);
      figs(c, [['engineer', 'stand', 20, 44]], seed);
      break;
    case 'lightning':
      for (let x = 0; x < CARD_W; x += 6) disc(c, x, 6 + (x % 12 ? 2 : 0), 8, '#2a3040');
      bolt(c, 60, 4, 70, Y, '#82b1ff', 1);
      bolt(c, 110, 6, 104, Y, '#82b1ff', 2);
      figs(c, [['marine', 'aim', 24, 48]], seed);
      break;
    case 'orbital':
      R(c, 96, 2, 6, 3, '#b0bec5');
      beam(c, 99, 5, 99, Y - 2, 4, '#ff5252');
      boom(c, 99, Y - 4, 10, 2);
      figs(c, [['officer', 'look', 26, 44]], seed);
      break;
    case 'orbital_laser':
      R(c, 10, 6, 14, 6, '#b0bec5');
      R(c, 4, 8, 6, 2, '#40c4ff');
      R(c, 24, 8, 6, 2, '#40c4ff');
      beam(c, 22, 12, 110, Y - 2, 2, '#ff1744');
      boom(c, 110, Y - 4, 8, 4);
      break;
    case 'timestop':
      boom(c, 96, 42, 14, 5);
      c.globalAlpha = 0.5;
      R(c, 0, 0, CARD_W, CARD_H, '#40a0c0');
      c.globalAlpha = 1;
      for (let a = 0; a < 12; a++) R(c, 50 + Math.cos((a / 12) * Math.PI * 2) * 22, 38 + Math.sin((a / 12) * Math.PI * 2) * 22, 2, 2, '#e0f7fa');
      line(c, 50, 38, 50, 22, '#ffffff', 2);
      line(c, 50, 38, 62, 42, '#ffffff', 2);
      figs(c, [['marine', 'walk', 118, 44, 1, true]], seed);
      break;
    case 'blink':
      titan(c, 6, Y + 6, 52, 0.25);
      titan(c, 32, Y + 6, 52, 0.5);
      titan(c, 70, Y + 6, 60, 1);
      for (let k = 0; k < 12; k++) R(c, 4 + k * 5, 40 + (k % 4) * 6, 10, 1, '#8ad8ff');
      break;
    case 'drones':
      for (let k = 0; k < 8; k++) drone(c, 50 + (k % 4) * 22, 16 + Math.floor(k / 4) * 16 + (k % 2) * 5);
      figs(c, [['engineer', 'look', 22, 46]], seed);
      break;
    case 'cataclysm':
      for (let k = 0; k < 5; k++) {
        line(c, 10 + k * 28, Y + 2, 24 + k * 28, CARD_H, '#ff5a10', 2);
        boom(c, 20 + k * 26, Y - 8 - (k % 2) * 10, 8, k);
      }
      break;
    case 'nitro':
      titan(c, 40, Y + 6, 90, 1);
      for (let k = 0; k < 3; k++) {
        disc(c, 36 - k * 8, Y - 10, 6 - k, '#40a0ff');
        disc(c, 36 - k * 8, Y - 10, 3 - k * 0.6, '#e0f8ff');
      }
      for (let k = 0; k < 10; k++) R(c, 2, 30 + k * 4, 26 - k, 1, '#8ad8ff');
      break;
    case 'weld':
      plateArt(c, 60, 40, 60, 30);
      for (let k = 0; k < 14; k++) R(c, 56 + hash2(k, 1, 7) * 20, 52 + hash2(k, 2, 7) * 10, 1, 1, k % 2 ? '#fff2b0' : '#ffab40');
      glow(c, 58, 56, 10, '#bfe8ff', 0.7);
      figs(c, [['mechanic', 'weld', 36, 48, 1]], seed);
      break;
    case 'nanite':
      plateArt(c, 70, 44, 50, 26);
      for (let k = 0; k < 90; k++) R(c, 50 + hash2(k, 3, 9) * 90, 20 + hash2(k, 4, 9) * 50, 1, 1, k % 3 ? '#76ff03' : '#ccff90');
      figs(c, [['engineer', 'work', 26, 46, 1]], seed);
      break;
    case 'acid_rain':
      for (let k = 0; k < 70; k++) R(c, hash2(k, 5, 1) * CARD_W, hash2(k, 6, 1) * Y, 1, 3, '#9cff57');
      for (let k = 0; k < 4; k++) disc(c, 30 + k * 30, Y + 4, 6, '#4a8a1a');
      figs(c, [['firefighter', 'stand', 110, 42, 0, true]], seed);
      break;
    case 'magnet':
      c.fillStyle = '#c02020';
      c.fillRect(70, 14, 8, 30);
      c.fillRect(96, 14, 8, 30);
      c.fillRect(70, 14, 34, 8);
      R(c, 70, 38, 8, 6, '#d8dce0');
      R(c, 96, 38, 8, 6, '#d8dce0');
      for (let k = 0; k < 10; k++) R(c, 60 + hash2(k, 1, 3) * 60, 50 + hash2(k, 2, 3) * 20, 3, 2, '#8a929c');
      for (let r = 10; r < 30; r += 6) for (let a = 0; a < Math.PI; a += 0.1) R(c, 87 + Math.cos(a) * r, 46 + Math.sin(a) * r * 0.5, 1, 1, '#8ad8ff');
      figs(c, [['engineer', 'stand', 24, 44]], seed);
      break;
    case 'frenzy':
      for (let k = 0; k < 6; k++) R(c, 70 + k * 8, Y - 6 - (k % 3) * 5, 8, 6, k % 2 ? '#8a6a40' : '#6a7078');
      for (let k = 0; k < 12; k++) R(c, 70 + hash2(k, 8, 2) * 60, 20 + hash2(k, 9, 2) * 30, 1, 1, '#ffe060');
      figs(c, [['engineer', 'carry', 22, 44], ['mechanic', 'carry', 44, 44]], seed);
      break;
    case 'mines':
      for (let k = 0; k < 6; k++) {
        disc(c, 20 + k * 22, Y + 6 + (k % 2) * 6, 4, '#2a2c2e', false);
        R(c, 20 + k * 22, Y + 5 + (k % 2) * 6, 1, 1, '#ff3020');
      }
      boom(c, 88, Y - 2, 12, 6);
      break;
    case 'kraken':
      for (let k = 0; k < 5; k++) {
        const bx = 20 + k * 26;
        for (let s = 0; s < 30; s++) disc(c, bx + Math.sin(s * 0.3 + k) * 6, Y + 4 - s * 1.6, 4 - s * 0.1, s % 4 ? '#6a3a8a' : '#9a6aba', false);
      }
      break;
    case 'singularity':
      for (let r = 34; r > 8; r -= 2) for (let a = 0; a < Math.PI * 2; a += 0.04) if (bay(Math.round(a * 40), r) < 0.3 + (34 - r) / 60) R(c, 80 + Math.cos(a + r * 0.2) * r, 40 + Math.sin(a + r * 0.2) * r * 0.45, 1, 1, r % 4 ? '#b388ff' : '#ea80fc');
      disc(c, 80, 40, 9, '#050208', false);
      break;
    case 'soul_harvest':
      disc(c, 90, 26, 12, '#6a3aa8');
      disc(c, 88, 24, 7, '#b388ff');
      for (let k = 0; k < 8; k++) {
        const x = 30 + k * 14;
        for (let s = 0; s < 12; s++) R(c, x + Math.sin(s * 0.8 + k) * 2, Y - s * 3, 1, 2, '#d0b0ff');
      }
      break;
    case 'dragon':
      dragon(c, 72, 36);
      for (let k = 0; k < 10; k++) disc(c, 104 + k * 3, 30 + k * 3, 2 + k * 0.4, k % 2 ? '#ff9a30' : '#ffd24a');
      boom(c, 132, Y - 6, 8, 7);
      break;
    case 'void_rift':
      for (let y = 10; y < 70; y++) {
        const w = Math.sin(((y - 10) / 60) * Math.PI) * 10;
        R(c, 90 - w + Math.sin(y * 0.3) * 3, y, w * 2, 1, y % 3 ? '#1a0a2a' : '#6a1aa8');
        R(c, 90 - w + Math.sin(y * 0.3) * 3, y, 1, 1, '#ea80fc');
      }
      glow(c, 90, 40, 30, '#b388ff', 0.4);
      figs(c, [['marine', 'aim', 30, 46]], seed);
      break;
    case 'scholar':
      R(c, 80, 30, 30, 20, '#e8dcb8');
      R(c, 95, 30, 1, 20, '#8a7a5a');
      for (let k = 0; k < 6; k++) R(c, 83, 34 + k * 3, 10, 1, '#8a7a5a');
      glow(c, 95, 40, 24, '#ffd740', 0.5);
      figs(c, [['officer', 'stand', 40, 48]], seed);
      break;
    case 'deadeye':
      line(c, 48, 50, 124, 40, '#ff3030');
      for (let a = 0; a < Math.PI * 2; a += 0.3) R(c, 124 + Math.cos(a) * 6, 40 + Math.sin(a) * 6, 1, 1, '#ff3030');
      R(c, 117, 40, 14, 1, '#ff3030');
      R(c, 124, 33, 1, 14, '#ff3030');
      figs(c, [['sniper', 'aim', 24, 50]], seed);
      break;
    case 'shield_surge':
      dome(c, 60, Y + 4, 34, '#40c4ff');
      figs(c, [['marine', 'stand', 60, 48]], seed);
      break;
    case 'dome':
      dome(c, 72, Y + 6, 60, '#ffd740');
      figs(c, [['rifleman', 'stand', 46, 40], ['medic', 'stand', 66, 40], ['heavy', 'stand', 88, 40, 0, true]], seed);
      break;
    case 'squad':
      R(c, 40, 6, 60, 10, '#3a4430');
      R(c, 40, 6, 60, 2, '#5a6448');
      R(c, 30, 8, 12, 3, '#2a3020');
      for (let k = 0; k < 3; k++) line(c, 56 + k * 12, 16, 56 + k * 12, 40, '#1a1a1a');
      figs(c, [['rifleman', 'aim', 36, 42], ['marine', 'stand', 60, 42], ['heavy', 'aim', 84, 42]], seed);
      break;
    case 'legion':
      figs(c, [['rifleman', 'walk', 14, 36, 0], ['rifleman', 'walk', 38, 38, 1], ['marine', 'walk', 62, 40, 2], ['rifleman', 'walk', 88, 38, 3], ['heavy', 'walk', 114, 36, 0]], seed);
      break;
    case 'mech':
      mechSide(c, 64, Y + 5, 2.2);
      for (let k = 0; k < 5; k++) puff(c, 60 + k * 12, Y, 5, '#8a8070');
      break;
    case 'miracle':
      for (let x = 60; x < 88; x++) for (let y = 0; y < Y; y++) if (bay(x, y) < 0.35 - Math.abs(x - 74) * 0.02) R(c, x, y, 1, 1, '#fff2b0');
      for (let k = 0; k < 16; k++) R(c, 56 + hash2(k, 1, 4) * 36, 10 + hash2(k, 2, 4) * 60, 1, 1, '#ffffff');
      figs(c, [['medic', 'cheer', 74, 48]], seed);
      break;
    case 'treasure':
      glow(c, 96, Y - 18, 26, '#ffd740', 0.45);
      R(c, 83, Y - 13, 26, 16, '#1a1008');
      R(c, 84, Y - 12, 24, 14, '#6a4a22');
      for (let k = 0; k < 3; k++) R(c, 84, Y - 10 + k * 4, 24, 1, '#4a3014');
      R(c, 84, Y - 17, 24, 5, '#8a6a32');
      R(c, 84, Y - 17, 24, 1, '#b08a4a');
      R(c, 94, Y - 13, 4, 5, '#e8c040');
      for (let k = 0; k < 8; k++) disc(c, 87 + k * 3, Y - 18, 1.8, k % 2 ? '#ffd740' : '#fff0a0');
      figs(c, [['sniper', 'look', 30, 46]], seed);
      break;
    case 'charge':
      titan(c, 30, Y + 6, 100, 1);
      for (let k = 0; k < 8; k++) puff(c, 26 - k * 3, Y - 2 - (k % 2) * 3, 5, '#a08a6a');
      for (let k = 0; k < 6; k++) R(c, 2, 20 + k * 6, 24, 1, '#ffe8b0');
      break;
    case 'smoke':
      for (let k = 0; k < 14; k++) puff(c, 6 + k * 10, 38 + (k % 3) * 6, 12 + (k % 2) * 3, '#a8a8a2');
      figs(c, [['rifleman', 'walk', 50, 42, 1], ['heavy', 'walk', 76, 42, 2]], seed);
      for (let k = 0; k < 8; k++) puff(c, 4 + k * 20, Y + 8 + (k % 2) * 3, 7, '#b8b8b2');
      break;
    default:
      figs(c, [['rifleman', 'stand', 40, 44], ['engineer', 'stand', 70, 44]], seed);
  }
  // A dark frame line so the painting sits in its card.
  R(c, 0, 0, CARD_W, 1, '#000');
  R(c, 0, CARD_H - 1, CARD_W, 1, '#000');
  cache.set(key, cv);
  return cv;
}
