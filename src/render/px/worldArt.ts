import propsMeta from '../../assets/px/props.json';
import props8 from '../../assets/px/props@8.png';
import props4 from '../../assets/px/props@4.png';
import natureMeta from '../../assets/px/nature.json';
import nature6 from '../../assets/px/nature@6.png';
import nature3 from '../../assets/px/nature@3.png';
import groundMeta from '../../assets/px/ground.json';
import ground6 from '../../assets/px/ground@6.png';
import ground3 from '../../assets/px/ground@3.png';

/**
 * The world's pixel art painted in LibreSprite (art/scripts/*.js, built by tools/art/build.mjs into indexed AAP-64
 * atlases at two scales each):
 *
 *  - PROPS: wrecks, dead trees, skeletons, barrels, crystals, tents... (8 and 4 px a metre: twice life size, so they
 *    read next to a Titan);
 *  - NATURE: tree crowns and boulders (6 and 3 px a metre);
 *  - GROUND: tufts, pebbles, cracks, drifts, puddles, embers (6 and 3), mostly painted in tone.
 *
 * The ground stamps them into its high-resolution blocks: an atlas's larger scale into the 4 px-a-metre blocks, the
 * smaller into the 2 px ones. Standing things get a shadow: their silhouette laid on the ground away from the
 * north-west sun, taller parts reaching further.
 */

interface Sheet {
  w: number;
  h: number;
  /** name -> [x, y, w, h, anchor x, anchor y, height px] */
  sprites: Record<string, number[]>;
}
interface Meta {
  scales: Record<string, Sheet>;
}

export interface AtlasSprite {
  sheet: CanvasImageSource;
  sx: number;
  sy: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  /** Its shadow on the ground (opaque black, in the sprite's coordinates: draw at low alpha). */
  shadow: HTMLCanvasElement | null;
}

/** A sprite's pixels, for details blended into the ground a pixel at a time. */
export interface AtlasPixels {
  w: number;
  h: number;
  ax: number;
  ay: number;
  data: Uint8ClampedArray;
}

export class SpriteAtlas {
  private images: Record<number, HTMLImageElement> = {};
  private cache = new Map<string, AtlasSprite | null>();
  private pix = new Map<string, AtlasPixels | null>();
  private state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private waiting: (() => void)[] = [];
  private families = new Map<string, string[]>();

  constructor(
    private meta: Meta,
    private urls: Record<number, string>,
    /** The scale stamped into 4 px-a-metre ground, and the one for 2 px. */
    readonly hi: number,
    readonly lo: number,
    private shadows: boolean,
  ) {}

  get ready(): boolean {
    return this.state === 'ready';
  }

  load(done?: () => void): void {
    if (this.state === 'ready') {
      done?.();
      return;
    }
    if (done) this.waiting.push(done);
    if (this.state !== 'idle' || typeof Image === 'undefined') return;
    this.state = 'loading';
    const keys = Object.keys(this.urls).map(Number);
    let left = keys.length;
    for (const k of keys) {
      const img = new Image();
      img.onload = () => {
        this.images[k] = img;
        if (--left === 0) {
          this.state = 'ready';
          for (const f of this.waiting.splice(0)) f();
        }
      };
      img.onerror = () => {
        this.state = 'failed';
      };
      img.src = this.urls[k];
    }
  }

  has(name: string): boolean {
    return !!this.meta.scales[this.hi]?.sprites[name];
  }

  /** Width x height at the larger scale (0 if unknown). */
  area(name: string): number {
    const r = this.meta.scales[this.hi]?.sprites[name];
    return r ? r[2] * r[3] : 0;
  }

  /** Every sprite whose name is `prefix` plus a number (a family of variants), in order. */
  family(prefix: string): string[] {
    let f = this.families.get(prefix);
    if (!f) {
      const re = new RegExp(`^${prefix}\\d+$`);
      f = Object.keys(this.meta.scales[this.hi]?.sprites ?? {}).filter((n) => re.test(n)).sort();
      this.families.set(prefix, f);
    }
    return f;
  }

  private scaleFor(f: number): number {
    return f >= 4 ? this.hi : this.lo;
  }

  /** A sprite for ground drawn at `f` pixels a metre, or null (unknown, or not loaded yet). */
  sprite(name: string, f: number): AtlasSprite | null {
    if (this.state !== 'ready') return null;
    const scale = this.scaleFor(f);
    const key = `${name}@${scale}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const r = this.meta.scales[scale]?.sprites[name];
    const img = this.images[scale];
    let spr: AtlasSprite | null = null;
    if (r && img) {
      const [sx, sy, w, h, ax, ay] = r;
      spr = { sheet: img, sx, sy, w, h, ax, ay, shadow: this.shadows ? castShadow(img, sx, sy, w, h, ay) : null };
    }
    this.cache.set(key, spr);
    return spr;
  }

  /** A sprite's RGBA pixels at `f` pixels a metre. */
  pixels(name: string, f: number): AtlasPixels | null {
    if (this.state !== 'ready') return null;
    const scale = this.scaleFor(f);
    const key = `${name}@${scale}`;
    const hit = this.pix.get(key);
    if (hit !== undefined) return hit;
    const r = this.meta.scales[scale]?.sprites[name];
    const img = this.images[scale];
    let out: AtlasPixels | null = null;
    if (r && img) {
      const [sx, sy, w, h, ax, ay] = r;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d')!;
      x.drawImage(img, sx, sy, w, h, 0, 0, w, h);
      out = { w, h, ax, ay, data: x.getImageData(0, 0, w, h).data };
    }
    this.pix.set(key, out);
    return out;
  }
}

/**
 * A sprite's shadow on the ground, in the sprite's own coordinates: everything above the anchor line stands up from
 * it, so a pixel `z` above the line lands `z` further along the sun's direction (south-east, flattened onto the
 * ground); the footprint below the line just shifts a pixel.
 */
function castShadow(img: HTMLImageElement, sx: number, sy: number, w: number, h: number, ay: number): HTMLCanvasElement {
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sc = src.getContext('2d')!;
  sc.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  const d = sc.getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w + Math.ceil(ay * 0.85) + 3;
  out.height = Math.max(h, ay + Math.ceil(ay * 0.5)) + 3;
  const oc = out.getContext('2d')!;
  oc.fillStyle = '#000';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] < 128) continue;
      const z = ay - y;
      if (z > 0) oc.fillRect(Math.round(x + 1 + z * 0.8), Math.round(ay + 1 + z * 0.45), 2, 2);
      else oc.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  return out;
}

export const PROPS = new SpriteAtlas(propsMeta as Meta, { 8: props8, 4: props4 }, 8, 4, true);
export const NATURE = new SpriteAtlas(natureMeta as Meta, { 6: nature6, 3: nature3 }, 6, 3, true);
export const GROUND = new SpriteAtlas(groundMeta as Meta, { 6: ground6, 3: ground3 }, 6, 3, false);

/** Loads every atlas; `done` runs once each time one arrives (so the ground can redraw with it). */
export function loadWorldArt(done: () => void): void {
  for (const a of [PROPS, NATURE, GROUND]) a.load(done);
}

/**
 * How often a prop of this design is drawn as its sprite (the rest stay a few pixels of debris): small things are
 * common, a wrecked bus or a beast's skeleton is a rare landmark (the share falls with the sprite's area).
 */
export function propShare(name: string): number {
  const a = PROPS.area(name);
  return a ? Math.min(0.18, 140 / a) : 0;
}
