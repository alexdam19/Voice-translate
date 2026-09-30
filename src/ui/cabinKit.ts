import { hash2, rgb } from '../render/px/pixels';
import { pxMini } from './pixfont';

/**
 * The cab's pixel-art kit: riveted plates, bevels, discs, rings, push buttons, brackets, cracks, analog dials, CRT
 * screens and trend charts, shared by the cabin (cabin.ts) and its screens and gauges (cabinScreens.ts).
 */

export function shadeHex(hex: string, k: number): string {
  const [r, g, b] = rgb(hex);
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}

export function makeNoise(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const x = c.getContext('2d')!;
  const img = x.createImageData(64, 64);
  for (let i = 0; i < 64 * 64; i++) {
    const n = hash2(i % 64, Math.floor(i / 64), 17);
    const v = n < 0.08 ? 0 : n > 0.95 ? 255 : 128;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = v === 128 ? 0 : 40;
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** A metal plate: a flat colour with grain. */
export function plate(c: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, col: string, noise: HTMLCanvasElement): void {
  c.fillStyle = col;
  c.fillRect(x, y, w, hh);
  const pat = c.createPattern(noise, 'repeat');
  if (pat) {
    c.fillStyle = pat;
    c.fillRect(x, y, w, hh);
  }
}

export function bevel(c: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number): void {
  c.fillStyle = '#6a675f';
  c.fillRect(x, y, w, 1);
  c.fillRect(x, y, 1, hh);
  c.fillStyle = '#1e1d1a';
  c.fillRect(x, y + hh - 1, w, 1);
  c.fillRect(x + w - 1, y, 1, hh);
}

export function rivet(c: CanvasRenderingContext2D, x: number, y: number): void {
  c.fillStyle = '#1a1916';
  c.fillRect(x, y + 1, 2, 1);
  c.fillStyle = '#9a968a';
  c.fillRect(x, y, 1, 1);
  c.fillStyle = '#6a675f';
  c.fillRect(x + 1, y, 1, 1);
}

export function disc(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string): void {
  c.fillStyle = col;
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
    const t = (yy + 0.5 - cy) / r;
    if (Math.abs(t) > 1) continue;
    const hw = r * Math.sqrt(1 - t * t);
    const a = Math.round(cx - hw), b = Math.round(cx + hw);
    if (b > a) c.fillRect(a, yy, b - a, 1);
  }
}

export function ringPx(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string): void {
  c.fillStyle = col;
  const n = Math.max(12, Math.round(r * 6));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    c.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
}

export function button(c: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, label: string, col: string, pressed: boolean, ink: string): void {
  x = Math.round(x);
  y = Math.round(y);
  c.fillStyle = '#0a0a0a';
  c.fillRect(x, y, w, hh);
  c.fillStyle = pressed ? shadeHex(col, 0.7) : col;
  c.fillRect(x + 1, y + 1, w - 2, hh - 2);
  if (!pressed) {
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.fillRect(x + 1, y + 1, w - 2, 1);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x + 1, y + hh - 2, w - 2, 1);
  }
  pxMini(c, label, x + w / 2, y + Math.floor((hh - 5) / 2) + (pressed ? 1 : 0), ink, 'center');
}

export function bracket(c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string): void {
  c.fillStyle = col;
  const a = Math.round(x - s / 2), b = Math.round(y - s / 2), e = Math.round(s), k = Math.max(2, Math.round(s / 4));
  c.fillRect(a, b, k, 1);
  c.fillRect(a, b, 1, k);
  c.fillRect(a + e - k, b, k, 1);
  c.fillRect(a + e - 1, b, 1, k);
  c.fillRect(a, b + e - 1, k, 1);
  c.fillRect(a, b + e - k, 1, k);
  c.fillRect(a + e - k, b + e - 1, k, 1);
  c.fillRect(a + e - 1, b + e - k, 1, k);
}

export function crack(c: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  c.fillStyle = 'rgba(230,240,255,0.55)';
  for (let k = 0; k < n; k++) {
    let px = x, py = y;
    const a = 1.2 + k * 0.7;
    for (let i = 0; i < 26; i++) {
      px += Math.cos(a + (hash2(k, i, 2) - 0.5) * 1.4) * 2;
      py += Math.sin(a + (hash2(k, i, 3) - 0.5) * 1.4) * 2;
      c.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
  }
}


/** An analog dial: a bezel, a face with ticks (the top `red` fraction in red), a needle at v (0..1) and a label. */
export function dial(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, v: number, label: string, opt: { red?: number; face?: string; ink?: string; needle?: string; ticks?: number; value?: string; lamp?: string | null } = {}): void {
  disc(c, cx, cy, r + 2, '#141412');
  disc(c, cx, cy, r + 1, '#8a8678');
  disc(c, cx, cy, r, opt.face ?? '#e8e0c8');
  const a0 = Math.PI * 0.75, span = Math.PI * 1.5, n = opt.ticks ?? 8, red = opt.red ?? 0;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (span * i) / n;
    c.fillStyle = red > 0 && i / n >= 1 - red ? '#c02010' : (opt.ink ?? '#202020');
    const inner = i % 2 === 0 ? r - Math.max(2, r * 0.22) : r - Math.max(1, r * 0.12);
    for (let d = inner; d < r - 0.5; d += 0.8) c.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1);
  }
  if (label) pxMini(c, label, cx, Math.round(cy + r * 0.28), opt.ink ?? '#505050', 'center', null);
  if (opt.value) pxMini(c, opt.value, cx, Math.round(cy - r * 0.55), opt.ink ?? '#505050', 'center', null);
  const na = a0 + span * Math.max(-0.02, Math.min(1.02, v));
  c.fillStyle = opt.needle ?? '#d01808';
  for (let d = 0; d < r - 2; d += 0.6) c.fillRect(Math.round(cx + Math.cos(na) * d), Math.round(cy + Math.sin(na) * d), 1, 1);
  disc(c, cx, cy, Math.max(1, r * 0.12), '#202020');
  if (opt.lamp) {
    c.fillStyle = opt.lamp;
    c.fillRect(Math.round(cx + r * 0.45), Math.round(cy + r * 0.45), 2, 2);
  }
}

/** A CRT screen set in a bezel: returns the inner rectangle. The glass glows faintly and has scanlines. */
export function crt(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tint = '#06140c'): { x: number; y: number; w: number; h: number } {
  c.fillStyle = '#0c0c0b';
  c.fillRect(x, y, w, h);
  c.fillStyle = '#3a3833';
  c.fillRect(x + 1, y + 1, w - 2, h - 2);
  c.fillStyle = '#58554d';
  c.fillRect(x + 1, y + 1, w - 2, 1);
  c.fillStyle = '#1c1b18';
  c.fillRect(x + 1, y + h - 2, w - 2, 1);
  const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6;
  c.fillStyle = '#000';
  c.fillRect(ix - 1, iy - 1, iw + 2, ih + 2);
  c.fillStyle = tint;
  c.fillRect(ix, iy, iw, ih);
  return { x: ix, y: iy, w: iw, h: ih };
}

/** Scanlines and a corner glare over a screen's inner rectangle (drawn after its content). */
export function crtGlass(c: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }): void {
  c.fillStyle = 'rgba(0,0,0,0.22)';
  for (let yy = r.y + 1; yy < r.y + r.h; yy += 2) c.fillRect(r.x, yy, r.w, 1);
  c.fillStyle = 'rgba(255,255,255,0.05)';
  for (let k = 0; k < 6; k++) c.fillRect(r.x + 2 + k, r.y + 2, 1, 6 - k);
}

/** A trend line: samples scaled into a box, with its range and a fill under the line. */
export function spark(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vals: number[], col: string, lo?: number, hi?: number): void {
  if (vals.length < 2) return;
  let mn = lo ?? Infinity, mx = hi ?? -Infinity;
  if (lo === undefined || hi === undefined) {
    for (const v of vals) {
      if (lo === undefined) mn = Math.min(mn, v);
      if (hi === undefined) mx = Math.max(mx, v);
    }
  }
  if (mx - mn < 1e-6) mx = mn + 1;
  const n = vals.length;
  let py = -1;
  for (let i = 0; i < w; i++) {
    const v = vals[Math.min(n - 1, Math.floor((i / Math.max(1, w - 1)) * (n - 1)))];
    const yy = Math.round(y + h - 1 - ((v - mn) / (mx - mn)) * (h - 1));
    c.fillStyle = shadeHex(col, 0.3);
    c.fillRect(x + i, yy, 1, y + h - yy);
    c.fillStyle = col;
    if (py >= 0 && Math.abs(yy - py) > 1) c.fillRect(x + i, Math.min(yy, py), 1, Math.abs(yy - py));
    else c.fillRect(x + i, yy, 1, 1);
    py = yy;
  }
}

/** A horizontal bar with a dark track. */
export function hbar(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, col: string): void {
  c.fillStyle = '#0a0a0a';
  c.fillRect(x, y, w, h);
  c.fillStyle = col;
  c.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, v))), h);
}
