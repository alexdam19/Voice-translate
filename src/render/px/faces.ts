import { FACE_PX, paintPixelFace, type PixelLook } from './pixelFace';

/**
 * Faces for every panel that shows one (the crew select, the crew and hangar panels, the intercom, the navigator on the
 * console): the 64 x 64 pixel-art portraits of pixelFace.ts, cached at each size they're shown at. For the comms
 * screens a face can talk (the mouth opens), look left or right, blink, grin or wince, like the face at the bottom of
 * an old shooter's status bar.
 */

export interface FaceSpec {
  seed: number;
  /** A story character's fixed looks (see pixelFace). */
  look?: Partial<PixelLook>;
  role: string;
  roleColor: string;
  rarityColor: string;
  /** Champions have their own hair colour and an accent (a badge on the collar). */
  hair?: string;
  accent?: string;
}

export interface FaceMood {
  /** 0 shut .. 1 wide open (talking). */
  mouth?: number;
  /** Eyes to the left (-1) or right (1). */
  look?: number;
  blink?: boolean;
  grin?: boolean;
  /** Hurt (0..1): a wince, a cut, blood. */
  hurt?: number;
}

const cache = new Map<string, HTMLCanvasElement>();

/** A face `size` px square. */
export function faceCanvas(spec: FaceSpec, size: number, mood: FaceMood = {}, panel = true): HTMLCanvasElement {
  const key = `${spec.seed}|${spec.role}|${spec.roleColor}|${spec.rarityColor}|${spec.hair ?? ''}|${spec.accent ?? ''}|${JSON.stringify(spec.look ?? {})}|${size}|${mood.mouth ?? 0}|${mood.look ?? 0}|${mood.blink ? 1 : 0}|${mood.grin ? 1 : 0}|${mood.hurt ?? 0}|${panel ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 600) cache.clear();
  // The portrait is pixel art at 64 x 64: scaled up by whole pixels (crisp), or down smoothly for the small icons.
  const art = paintPixelFace(spec, mood, panel);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = size < FACE_PX;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(art, 0, 0, size, size);
  cache.set(key, c);
  return c;
}

const urls = new Map<string, string>();

/** The face as an image URL (for the HTML panels). */
export function faceURL(spec: FaceSpec, size = 128, mood: FaceMood = {}): string {
  const key = `${spec.seed}|${spec.role}|${spec.roleColor}|${spec.rarityColor}|${spec.hair ?? ''}|${spec.accent ?? ''}|${size}|${JSON.stringify(mood)}`;
  let u = urls.get(key);
  if (!u) {
    u = faceCanvas(spec, size, mood).toDataURL();
    urls.set(key, u);
  }
  return u;
}

