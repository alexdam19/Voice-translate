import manifest from '../../assets/ohv/manifest.json';
import { rgb, type RGB } from './pixels';

/**
 * Sprites from OpenHV (Daniel Cook's Hard Vacuum art and the OpenHV team's; see src/assets/ohv/CREDITS.md),
 * imported by tools/import-openhv.mjs. Every sheet holds each facing pre-drawn (OpenRA order: north first, then
 * counter-clockwise), so a unit is shown by picking the frame for its heading and walk step, never by rotating
 * pixels. Team-colour pixels (marked in the import) are repainted per faction, and whole sheets can be tinted
 * toward a creature's colour. Scaled by whole numbers only.
 */

interface Seq { start: number; length: number | '*'; facings: number; tick: number; frames?: number[] }
interface Sheet { w: number; h: number; fw: number; fh: number; frames: number; cols: number; seq: Record<string, Seq> }

const SHEETS = manifest as unknown as Record<string, Sheet>;
const URLS = import.meta.glob('../../assets/ohv/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const imgs = new Map<string, HTMLImageElement>();
const painted = new Map<string, HTMLCanvasElement>();

function image(name: string): HTMLImageElement | null {
  let im = imgs.get(name);
  if (!im) {
    const url = URLS[`../../assets/ohv/${name}.png`];
    if (!url || typeof Image === 'undefined') return null;
    im = new Image();
    im.src = url;
    imgs.set(name, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}

export function ohvSheet(name: string): Sheet | undefined {
  return SHEETS[name];
}

/**
 * The sheet recoloured: team pixels in `team`'s ramp, everything else blended `tintK` of the way toward `tint`
 * (keeping each pixel's light). Null until the image has loaded.
 */
export function ohvCanvas(name: string, team: string, tint: string | null = null, tintK = 0): HTMLCanvasElement | null {
  const key = `${name}|${team}|${tint}|${tintK}`;
  const hit = painted.get(key);
  if (hit) return hit;
  const im = image(name);
  if (!im) return null;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const x = c.getContext('2d')!;
  x.drawImage(im, 0, 0);
  const id = x.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const T = rgb(team);
  const tn: RGB | null = tint ? rgb(tint) : null;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (!a) continue;
    if (a >= 250 && a < 255) {
      // Team colour: level 0-15, dark to light.
      const l = Math.max(0, Math.min(15, Math.round((d[i] - 8) / 16))) / 15;
      const k = 0.18 + 0.95 * l;
      d[i] = Math.min(255, T[0] * k + 60 * l * l);
      d[i + 1] = Math.min(255, T[1] * k + 60 * l * l);
      d[i + 2] = Math.min(255, T[2] * k + 60 * l * l);
      d[i + 3] = 255;
    } else if (tn && tintK > 0 && a === 255) {
      const lum = (d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15) / 160;
      d[i] = d[i] + (Math.min(255, tn[0] * lum) - d[i]) * tintK;
      d[i + 1] = d[i + 1] + (Math.min(255, tn[1] * lum) - d[i + 1]) * tintK;
      d[i + 2] = d[i + 2] + (Math.min(255, tn[2] * lum) - d[i + 2]) * tintK;
    }
  }
  x.putImageData(id, 0, 0);
  if (painted.size > 400) painted.clear();
  painted.set(key, c);
  return c;
}

/** A white silhouette of a sheet (for hit flashes). */
export function ohvFlash(name: string): HTMLCanvasElement | null {
  const key = `${name}|flash`;
  const hit = painted.get(key);
  if (hit) return hit;
  const im = image(name);
  if (!im) return null;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const x = c.getContext('2d')!;
  x.drawImage(im, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, c.width, c.height);
  painted.set(key, c);
  return c;
}

/**
 * Which frame shows sequence `seqName` of sheet `name` facing `angle` (radians, screen space: 0 east, y down) at
 * animation step `step`.
 */
export function ohvFrame(name: string, seqName: string, angle: number, step: number): number {
  const sh = SHEETS[name];
  if (!sh) return 0;
  const sq = sh.seq[`${name}.${seqName}`] ?? Object.entries(sh.seq).find(([k]) => k.endsWith(`.${seqName}`))?.[1] ?? Object.values(sh.seq)[0];
  if (!sq) return 0;
  const n = Math.max(1, sq.facings);
  // OpenRA facings: 0 is north, counting counter-clockwise.
  const ccw = (-Math.PI / 2 - angle) / ((Math.PI * 2) / n);
  const f = ((Math.round(ccw) % n) + n) % n;
  // The sheet decides: a length the sequence file overstates (a nested Combine leaking into it) is cut to fit.
  const fit = Math.max(1, Math.floor((sh.frames - sq.start) / n));
  const len = sq.length === '*' ? fit : Math.max(1, Math.min(fit, sq.length));
  if (sq.frames) return sq.frames[f % sq.frames.length] ?? 0;
  return sq.start + f * len + (Math.floor(step) % len);
}

/** How many animation steps the sequence has per facing (1 for a still pose). */
export function ohvSteps(name: string, seqName: string): number {
  const sh = SHEETS[name];
  const sq = sh?.seq[`${name}.${seqName}`];
  if (!sh || !sq) return 1;
  const fit = Math.max(1, Math.floor((sh.frames - sq.start) / Math.max(1, sq.facings)));
  return sq.length === '*' ? fit : Math.max(1, Math.min(fit, sq.length));
}

/** A one-shot animation (explosions, smoke): all of the sheet's frames in order; frame for progress 0-1. */
export function ohvOneShot(name: string, t: number): number {
  const sh = SHEETS[name];
  if (!sh) return 0;
  return Math.max(0, Math.min(sh.frames - 1, Math.floor(t * sh.frames)));
}

/**
 * Draws frame `frame` of a painted sheet centred at (x, y), scaled by a whole number `k` (nearest neighbour).
 * `flip` mirrors it (for one-facing sheets).
 */
export function drawOhv(c: CanvasRenderingContext2D, sheet: HTMLCanvasElement, name: string, frame: number, x: number, y: number, k: number, alpha = 1): void {
  const sh = SHEETS[name];
  if (!sh) return;
  const col = frame % sh.cols, row = Math.floor(frame / sh.cols);
  const w = sh.fw * k, h = sh.fh * k;
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = false;
  if (alpha < 1) c.globalAlpha = alpha;
  c.drawImage(sheet, col * sh.fw, row * sh.fh, sh.fw, sh.fh, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
  if (alpha < 1) c.globalAlpha = 1;
  c.imageSmoothingEnabled = smooth;
}

/** Starts loading every sheet (so the first horde doesn't pop in). */
export function preloadOhv(): void {
  for (const n of Object.keys(SHEETS)) image(n);
}
