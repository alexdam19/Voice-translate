import topUrl from '../../assets/ship/titan_top.png';
import gunUrl from '../../assets/ship/titan_gun.png';
import sideUrl from '../../assets/ship/titan_side.png';
import frontUrl from '../../assets/ship/titan_front.png';
import rearUrl from '../../assets/ship/titan_rear.png';
import heroUrl from '../../assets/ship/titan_hero.png';
import { hex, rgb } from './pixels';

/**
 * The Titan's art, cut from the design sheet: the top view (the in-game sprite, bow toward +x) with its main turret
 * lifted off into a sprite of its own so it can turn, and the side, front, rear and three-quarter views for the
 * screens. Loaded once; the painters fall back to drawing the hull themselves until the art is ready.
 */

export const SHIP_ART = { top: topUrl, gun: gunUrl, side: sideUrl, front: frontUrl, rear: rearUrl, hero: heroUrl };

/** The top view's size and the hull centre on it (pixels), and how far the art runs past the deck grid. */
export const TOP_PX = { w: 635, h: 262, cx: 317.5, cy: 131, over: 1.08, wide: 0.99 };

/**
 * The main turret sprite: two bands of `band` rows, the housing (octagon and mantlet) on top and the twin barrels
 * below, sharing a pivot. `muzzle` is the barrel tips' x, `twin` the barrels' offsets from the pivot row.
 */
export const GUN_PX = { band: 58, px: 35, py: 29, barrels: 106, muzzle: 199, twin: [-7, 8] as const };

/**
 * Landmarks on the top view (pixels, bow to the right): the main turret's pivot, the engine pods' nozzles and the
 * forward lamps.
 */
export const TOP_MARKS = {
  mainPivot: [323, 135] as const,
  nozzles: [[22, 84], [22, 180], [3, 55], [3, 208]] as [number, number][],
  lamps: [[600, 86], [557, 208], [563, 131]] as [number, number][],
};

export interface ShipArt {
  top: HTMLCanvasElement;
  gun: HTMLCanvasElement;
  /** The lights on their own, blurred: drawn additively, pulsing. */
  glow: HTMLCanvasElement;
  /** Black silhouettes for the drop shadows. */
  shadow: HTMLCanvasElement;
  gunShadow: HTMLCanvasElement;
  /** White silhouette for the hit flash. */
  flash: HTMLCanvasElement;
}

let topImg: HTMLImageElement | null = null;
let gunImg: HTMLImageElement | null = null;
let loaded = 0;
const sets = new Map<string, ShipArt>();

function load(): void {
  if (topImg || typeof Image === 'undefined') return;
  topImg = new Image();
  gunImg = new Image();
  topImg.onload = () => {
    TOP_PX.w = topImg!.naturalWidth;
    TOP_PX.h = topImg!.naturalHeight;
    TOP_PX.cx = TOP_PX.w / 2;
    TOP_PX.cy = TOP_PX.h / 2;
    loaded++;
  };
  gunImg.onload = () => loaded++;
  topImg.src = topUrl;
  gunImg.src = gunUrl;
}

/** Has the art loaded? */
export function shipArtReady(): boolean {
  load();
  return loaded >= 2;
}

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Is this pixel one of the hull's lights (the sheet's lamps and strips are all blue-white)? */
const isLight = (r: number, g: number, b: number): boolean => b > r + 30 && b > g + 5 && b > 90;

/**
 * Repaints a sprite: the lights take `light` (keeping how bright each pixel was), the plating is warmed by `warm`
 * (0 = as drawn), and a wreck (`dead`) goes dark and burnt with its lights out.
 */
function recolour(src: HTMLImageElement, light: string | null, warm: number, dead: boolean): HTMLCanvasElement {
  const c = canvasOf(src.naturalWidth, src.naturalHeight);
  const x = c.getContext('2d')!;
  x.drawImage(src, 0, 0);
  if (!light && !warm && !dead) return c;
  const id = x.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const L = light ? rgb(light) : [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (dead) {
      const v = (r * 0.3 + g * 0.5 + b * 0.2) * 0.42;
      d[i] = v * 1.18 + 6;
      d[i + 1] = v * 0.98 + 3;
      d[i + 2] = v * 0.82;
      continue;
    }
    if (light && isLight(r, g, b)) {
      const k = b / 255;
      const w = Math.max(0, (Math.min(r, g) - 120) / 135);
      d[i] = Math.min(255, L[0] * k * 1.1 + 255 * w * 0.6);
      d[i + 1] = Math.min(255, L[1] * k * 1.1 + 255 * w * 0.6);
      d[i + 2] = Math.min(255, L[2] * k * 1.1 + 255 * w * 0.6);
    } else if (warm) {
      d[i] = Math.min(255, r * (1 + 0.14 * warm) + 5 * warm);
      d[i + 1] = g * (1 - 0.07 * warm);
      d[i + 2] = b * (1 - 0.1 * warm);
    }
  }
  x.putImageData(id, 0, 0);
  return c;
}

/** A solid-colour silhouette. */
function silhouette(src: HTMLCanvasElement, col: string): HTMLCanvasElement {
  const c = canvasOf(src.width, src.height);
  const x = c.getContext('2d')!;
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = col;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** The lights alone, spread into a soft glow (shrunk and grown back: a blur that works everywhere), kept small. */
function glowOf(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const m = canvasOf(w, h);
  const mx = m.getContext('2d')!;
  mx.drawImage(src, 0, 0);
  const id = mx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lit = d[i + 3] && (Math.max(r, g, b) > 150 && Math.max(r, g, b) - Math.min(r, g, b) > 60);
    if (!lit) d[i + 3] = 0;
  }
  mx.putImageData(id, 0, 0);
  const s = canvasOf(Math.ceil(w / 6), Math.ceil(h / 6));
  const sx = s.getContext('2d')!;
  sx.imageSmoothingEnabled = true;
  sx.imageSmoothingQuality = 'high';
  sx.drawImage(m, 0, 0, s.width, s.height);
  const out = canvasOf(Math.ceil(w / 3), Math.ceil(h / 3));
  const ox = out.getContext('2d')!;
  ox.imageSmoothingEnabled = true;
  ox.imageSmoothingQuality = 'high';
  ox.globalCompositeOperation = 'lighter';
  ox.drawImage(s, 0, 0, out.width, out.height);
  ox.drawImage(m, 0, 0, out.width, out.height);
  return out;
}

/** A small copy (soft things like shadows don't need the full sheet). */
function shrink(src: HTMLCanvasElement, k: number): HTMLCanvasElement {
  const c = canvasOf(Math.ceil(src.width / k), Math.ceil(src.height / k));
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const scaled = new WeakMap<object, { q: number; canvas: HTMLCanvasElement }>();

/**
 * The art shrunk (once, carefully) to about the size it's shown at: `spx` screen pixels per sheet pixel, in
 * quarter-octave steps. Drawing a big sheet small every frame would alias or cost a resample each time.
 */
export function scaledTo(src: HTMLCanvasElement, spx: number): HTMLCanvasElement {
  const q = Math.min(1, Math.pow(2, Math.ceil(Math.log2(spx) * 4) / 4));
  let e = scaled.get(src);
  if (!e || e.q !== q) {
    const c = canvasOf(Math.max(1, Math.round(src.width * q)), Math.max(1, Math.round(src.height * q)));
    const x = c.getContext('2d')!;
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, c.width, c.height);
    e = { q, canvas: c };
    scaled.set(src, e);
  }
  return e.canvas;
}

/**
 * The art for a hull: yours with your class's light colour, a rival's burning red on warmer plating, another
 * player's magenta, or a burnt-out wreck. Null until the images have loaded.
 */
export function shipArtFor(kind: string, light: string | null, dead: boolean): ShipArt | null {
  if (!shipArtReady()) return null;
  const warm = kind === 'rival' ? 1 : 0;
  const col = kind === 'rival' ? '#ff3b30' : kind === 'remote' ? '#e040fb' : light && light !== '#3ab4ff' ? light : null;
  const key = dead ? 'dead' : `${warm}|${col}`;
  let s = sets.get(key);
  if (s) return s;
  const top = recolour(topImg!, col, warm, dead);
  const gun = recolour(gunImg!, col, warm, dead);
  s = { top, gun, glow: glowOf(top), shadow: shrink(silhouette(top, '#000'), 4), gunShadow: silhouette(gun, '#000'), flash: shrink(silhouette(top, '#fff'), 2) };
  sets.set(key, s);
  return s;
}

const viewImgs: Partial<Record<string, HTMLImageElement>> = {};
const views = new Map<string, HTMLCanvasElement>();

/**
 * The sheet's other views (side with the bow to the left, front, rear, three-quarter), coloured for whose hull it
 * is. Null until that picture has loaded.
 */
export function shipView(which: 'side' | 'front' | 'rear' | 'hero', kind: string): HTMLCanvasElement | null {
  if (typeof Image === 'undefined') return null;
  let img = viewImgs[which];
  if (!img) {
    img = new Image();
    img.src = SHIP_ART[which];
    viewImgs[which] = img;
  }
  if (!img.complete || !img.naturalWidth) return null;
  const k = kind === 'rival' || kind === 'remote' ? kind : 'main';
  const key = `${which}|${k}`;
  let c = views.get(key);
  if (!c) {
    c = recolour(img, k === 'rival' ? '#ff3b30' : k === 'remote' ? '#e040fb' : null, k === 'rival' ? 1 : 0, false);
    views.set(key, c);
  }
  return c;
}

/** Metres per top-view pixel along the hull (x) and across it (y). */
export function topScale(L: number, W: number): { kx: number; ky: number } {
  return { kx: (L * TOP_PX.over) / TOP_PX.w, ky: (W * TOP_PX.wide) / TOP_PX.h };
}

/** A point on the top view (pixels) in hull metres (forward, starboard). */
export function topToHull(px: number, py: number, L: number, W: number): [number, number] {
  const { kx, ky } = topScale(L, W);
  return [(px - TOP_PX.cx) * kx, (py - TOP_PX.cy) * ky];
}

/** Where a Titan's main batteries turn (hull metres): the forward one on the citadel, the rear one aft. */
export function batteryPivot(L: number, W: number, rear: boolean): [number, number] {
  if (rear) return [-0.3 * L, 0];
  return topToHull(TOP_MARKS.mainPivot[0], TOP_MARKS.mainPivot[1], L, W);
}

/** How far the main battery's barrels reach past its pivot (metres). */
export function batteryReach(L: number, rear: boolean): number {
  return (GUN_PX.muzzle - GUN_PX.px) * topScale(L, 1).kx * (rear ? 0.72 : 1);
}

/** A few pixels of the sheet's colour, for when something wants to match the hull. */
export const HULL_TONES = { dark: hex([22, 26, 33]), mid: hex([58, 66, 80]), light: hex([98, 108, 124]) };
