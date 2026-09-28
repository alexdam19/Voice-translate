/** Small colour and hashing helpers for the pixel-art renderer. */

export type RGB = [number, number, number];

const cache = new Map<string, RGB>();

export function rgb(hex: string): RGB {
  let c = cache.get(hex);
  if (c) return c;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((k) => k + k).join('') : h.slice(0, 6), 16);
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  cache.set(hex, c);
  return c;
}

export function hex([r, g, b]: RGB): string {
  const k = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${k(r)}${k(g)}${k(b)}`;
}

/** Lighter (k > 0) or darker (k < 0) version of a colour, by a fraction of the way to white or black. */
export function shade(c: string, k: number): string {
  const [r, g, b] = rgb(c);
  if (k >= 0) return hex([r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k]);
  return hex([r * (1 + k), g * (1 + k), b * (1 + k)]);
}

export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Deterministic 0..1 hash of two integers. */
export function hash2(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  return x;
}

let silo: HTMLCanvasElement | null = null;

/** Rings whatever is drawn on a canvas with a 1 px outline (drawn behind it), so it stands off any ground. */
export function outlineCanvas(c: HTMLCanvasElement, color = '#07080a'): void {
  if (!silo) silo = document.createElement('canvas');
  if (silo.width !== c.width || silo.height !== c.height) {
    silo.width = c.width;
    silo.height = c.height;
  }
  const s = silo.getContext('2d')!;
  s.globalCompositeOperation = 'source-over';
  s.clearRect(0, 0, silo.width, silo.height);
  s.drawImage(c, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = color;
  s.fillRect(0, 0, silo.width, silo.height);
  const x = c.getContext('2d')!;
  x.globalCompositeOperation = 'destination-over';
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) x.drawImage(silo, dx, dy);
  x.globalCompositeOperation = 'source-over';
}
