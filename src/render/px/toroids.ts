import { makeCanvas, rgb } from './pixels';

/**
 * The toroidal engines as pixel art: a heavy ring on a pylon, its segmented casing turning, and a neon core
 * glowing through the hole (brighter the harder it pushes; dark and still when off or wrecked). Frames are painted
 * once per colour and state and drawn at hull scale with no smoothing, so they stay crisp like the rest of the ship.
 */

export const TOROID_PX = 28;
const FRAMES = 6;
const cache = new Map<string, HTMLCanvasElement[]>();

/** Where the rings sit on the design sheet (pixels, bow right): outboard of each corner's sponson. */
export const TOROID_SHEET: [number, number][] = [[503, 6], [503, 256], [66, 14], [66, 248]];

/** The ring's frames in `core` colour; `dead` draws it scorched and dark. */
export function toroidFrames(core: string, dead: boolean): HTMLCanvasElement[] {
  const key = `${core}|${dead}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = TOROID_PX, c0 = S / 2;
  const [cr, cg, cb] = rgb(core);
  const out: HTMLCanvasElement[] = [];
  for (let f = 0; f < FRAMES; f++) {
    const cv = makeCanvas(S, S);
    const x = cv.getContext('2d')!;
    const img = x.createImageData(S, S);
    const d = img.data;
    const put = (i: number, j: number, r: number, g: number, b: number, a = 255): void => {
      const k = (j * S + i) * 4;
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
      d[k + 3] = a;
    };
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const dx = i + 0.5 - c0, dy = j + 0.5 - c0;
        const r = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        if (r > 13.5) continue;
        if (r > 12.5) {
          put(i, j, 10, 12, 18);
          continue;
        }
        if (r > 6.5) {
          // The casing: light from the top-left, twelve segments with dark seams, turning frame by frame.
          const lit = 0.55 + 0.45 * (-(dx + dy) / (r * 1.414));
          const seg = (((ang / (Math.PI * 2)) * 12 + f / FRAMES) % 1 + 1) % 1;
          const seam = seg < 0.12;
          const band = r > 11 ? 0.8 : r < 7.5 ? 0.7 : 1;
          let v = (dead ? 34 : 58 + 70 * lit) * band * (seam ? 0.45 : 1);
          if (!dead && r > 11.2 && lit > 0.8) v += 40;
          put(i, j, v * 0.92, v * 0.96, v * 1.08);
          // Bolt heads on every other segment.
          if (!seam && seg > 0.45 && seg < 0.55 && r > 9 && r < 10) put(i, j, dead ? 50 : 170, dead ? 44 : 176, dead ? 40 : 190);
          continue;
        }
        if (r > 5.5) {
          put(i, j, 14, 16, 24);
          continue;
        }
        // The core: hot white centre fading to the neon colour (a dull red glow when wrecked).
        const t = r / 5.5;
        if (dead) put(i, j, 60 - 30 * t, 18, 14);
        else {
          const w = Math.max(0, 1 - t * 1.6);
          const flick = (i + j + f) % 3 === 0 ? 0.88 : 1;
          put(i, j, (cr + (255 - cr) * w) * flick, (cg + (255 - cg) * w) * flick, (cb + (255 - cb) * w) * flick);
        }
      }
    }
    x.putImageData(img, 0, 0);
    out.push(cv);
  }
  cache.set(key, out);
  return out;
}

/** The pylon from the ring to the hull, and the ring. Drawn in hull metres (current transform), centred at (x, y). */
export function drawToroid(c: CanvasRenderingContext2D, x: number, y: number, size: number, frame: HTMLCanvasElement, inboard: number): void {
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = false;
  // Pylon: a dark strut back to the hull side.
  c.fillStyle = '#1a1d26';
  c.fillRect(x - size * 0.18, Math.min(y, y + inboard), size * 0.36, Math.abs(inboard));
  c.fillStyle = '#3a4050';
  c.fillRect(x - size * 0.18, Math.min(y, y + inboard), size * 0.08, Math.abs(inboard));
  c.drawImage(frame, x - size / 2, y - size / 2, size, size);
  c.imageSmoothingEnabled = smooth;
}

export const TOROID_FRAMES = FRAMES;
