/** Tiny pixel-art drawing helpers used by the procedural texture and sprite generators. */

export function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Multiplies a color's brightness (f > 1 lightens). */
export function shade(h: string, f: number): string {
  const [r, g, b] = hexToRgb(h);
  if (f >= 1) return rgbToHex(r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1));
  return rgbToHex(r * f, g * f, b * f);
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Pix {
  readonly ctx: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  rnd: () => number;

  constructor(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number, seed: number) {
    this.ctx = ctx;
    this.ox = ox;
    this.oy = oy;
    this.w = w;
    this.h = h;
    this.rnd = seeded(seed);
  }

  set(x: number, y: number, c: string): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(this.ox + x, this.oy + y, 1, 1);
  }

  /** Wrapping set (for tileable textures). */
  wset(x: number, y: number, c: string): void {
    this.set(((Math.floor(x) % this.w) + this.w) % this.w, ((Math.floor(y) % this.h) + this.h) % this.h, c);
  }

  rect(x: number, y: number, w: number, h: number, c: string): void {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(this.ox + Math.floor(x), this.oy + Math.floor(y), Math.max(0, Math.floor(w)), Math.max(0, Math.floor(h)));
  }

  fill(c: string): void {
    this.rect(0, 0, this.w, this.h, c);
  }

  /** Outlined rectangle. */
  frame(x: number, y: number, w: number, h: number, c: string): void {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c);
    this.rect(x + w - 1, y, 1, h, c);
  }

  circle(cx: number, cy: number, r: number, c: string): void {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c);
  }

  ring(cx: number, cy: number, r: number, c: string): void {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (Math.abs(d - r) < 0.6) this.set(x, y, c);
      }
    }
  }

  /** Tileable value-noise dither across a palette (dark to light). */
  ground(pal: string[], scale = 4, grain = 0.35): void {
    const g = Math.max(1, Math.floor(this.w / scale));
    const lat: number[] = [];
    for (let i = 0; i < g * g; i++) lat.push(this.rnd());
    const at = (x: number, y: number): number => lat[(((y % g) + g) % g) * g + (((x % g) + g) % g)];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const fx = x / scale, fy = y / scale;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = fx - ix, ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const v = at(ix, iy) * (1 - sx) * (1 - sy) + at(ix + 1, iy) * sx * (1 - sy) + at(ix, iy + 1) * (1 - sx) * sy + at(ix + 1, iy + 1) * sx * sy;
        const n = Math.max(0, Math.min(0.999, v * (1 - grain) + this.rnd() * grain));
        this.set(x, y, pal[Math.floor(n * pal.length)]);
      }
    }
  }

  speck(c: string, n: number, size = 1): void {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(this.rnd() * this.w), y = Math.floor(this.rnd() * this.h);
      for (let k = 0; k < size; k++) this.wset(x + (k % 2), y + Math.floor(k / 2), c);
    }
  }

  /** Random short crack lines. */
  cracks(c: string, n: number, len = 5): void {
    for (let i = 0; i < n; i++) {
      let x = this.rnd() * this.w, y = this.rnd() * this.h;
      let a = this.rnd() * Math.PI * 2;
      for (let k = 0; k < len; k++) {
        this.wset(x, y, c);
        a += (this.rnd() - 0.5) * 1.2;
        x += Math.cos(a);
        y += Math.sin(a);
      }
    }
  }

  /** Two-tone bevel on a rectangle: light top-left, dark bottom-right. */
  bevel(x: number, y: number, w: number, h: number, light: string, dark: string): void {
    this.rect(x, y, w, 1, light);
    this.rect(x, y, 1, h, light);
    this.rect(x, y + h - 1, w, 1, dark);
    this.rect(x + w - 1, y, 1, h, dark);
  }

  stripes(x: number, y: number, w: number, h: number, a: string, b: string, period = 4): void {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, Math.floor((xx + yy) / (period / 2)) % 2 ? a : b);
  }
}

/** Draws a pixel map: rows of characters, each mapped to a color (or '.' for transparent). */
export function pixmap(p: Pix, rows: string[], pal: Record<string, string>, ox = 0, oy = 0, flip = false): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c) p.set(ox + (flip ? row.length - 1 - x : x), oy + y, c);
    }
  }
}
