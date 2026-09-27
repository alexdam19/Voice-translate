import { CanvasTexture, NearestFilter, SpriteMaterial, SRGBColorSpace } from 'three';
import { Pix, shade } from './pixel';

/**
 * Billboard pixel sprites for creatures, marines and crew, drawn procedurally
 * (two animation frames each, plus a white hit-flash and an elite variant).
 */

type DrawFn = (p: Pix, frame: number, c: string) => void;

const S = 32;

const leg = (p: Pix, x: number, y: number, h: number, c: string): void => p.rect(x, y, 2, h, c);

const DRAW: Record<string, DrawFn> = {
  rat: (p, f, c) => {
    const d = shade(c, 0.6), l = shade(c, 1.3);
    p.rect(8, 16, 14, 7, c);
    p.rect(9, 15, 12, 1, l);
    p.rect(20, 13, 7, 7, c);
    p.rect(21, 12, 3, 2, d);
    p.set(24, 15, '#ff1744');
    p.set(27, 17, '#f8bbd0');
    p.rect(2, 18 + f, 6, 1, '#d7a0a0');
    leg(p, 10 + f * 2, 23, 3, d);
    leg(p, 18 - f * 2, 23, 3, d);
    p.rect(8, 22, 14, 1, d);
  },
  drone: (p, f, c) => {
    const d = shade(c, 0.6);
    p.rect(10, 12, 12, 8, c);
    p.rect(10, 12, 12, 1, shade(c, 1.3));
    p.rect(14, 15, 4, 3, '#ff1744');
    p.rect(15, 16, 2, 1, '#ffcdd2');
    p.rect(4, 9, 8, 1, d);
    p.rect(20, 9, 8, 1, d);
    p.rect(f ? 3 : 6, 8, 5, 1, '#e0e0e0');
    p.rect(f ? 24 : 21, 8, 5, 1, '#e0e0e0');
    p.rect(12, 20, 2, 3, d);
    p.rect(18, 20, 2, 3, d);
  },
  raider: (p, f, c) => {
    p.rect(13, 6, 6, 6, '#e0ac69');
    p.rect(12, 5, 8, 3, '#3e2723');
    p.rect(13, 8, 6, 2, '#212121');
    p.set(14, 9, '#ff5252');
    p.set(17, 9, '#ff5252');
    p.rect(11, 12, 10, 9, c);
    p.rect(11, 12, 10, 1, shade(c, 1.3));
    p.rect(12, 16, 8, 1, '#5d4037');
    p.rect(19, 13, 9, 2, '#424242');
    leg(p, 12 + f, 21, 7, '#37474f');
    leg(p, 18 - f, 21, 7, '#37474f');
  },
  bomber: (p, f, c) => {
    DRAW.rat(p, f, '#8d6e63');
    p.rect(11, 11, 8, 5, c);
    p.rect(14, 9, 2, 2, '#ffea00');
    if (f) p.set(15, 8, '#ffffff');
  },
  buggy: (p, f, c) => {
    const d = shade(c, 0.55);
    p.rect(4, 14, 24, 7, c);
    p.rect(4, 14, 24, 1, shade(c, 1.3));
    p.rect(10, 9, 10, 5, d);
    p.rect(11, 10, 8, 3, '#80deea');
    p.rect(20, 11, 8, 2, '#424242');
    p.circle(8, 22, 3.5, '#212121');
    p.circle(24, 22, 3.5, '#212121');
    p.set(8 + (f ? 1 : -1), 22, '#757575');
    p.set(24 + (f ? 1 : -1), 22, '#757575');
  },
  stalker: (p, f, c) => {
    const d = shade(c, 0.6);
    p.rect(6, 14, 18, 7, c);
    p.rect(22, 11, 7, 8, c);
    p.rect(27, 16, 3, 2, '#fff');
    p.set(25, 13, '#ff6f00');
    for (let i = 0; i < 4; i++) p.rect(7 + i * 4, 12, 2, 2, d);
    for (let i = 0; i < 3; i++) leg(p, 7 + i * 6 + (f ? 1 : -1), 21, 5, d);
    p.rect(1, 15 + f, 6, 2, d);
  },
  spitter: (p, f, c) => {
    const d = shade(c, 0.6);
    p.circle(16, 17, 8, c);
    p.circle(16, 14, 5, shade(c, 1.25));
    p.rect(12, 20, 8, 3, '#1b5e20');
    p.circle(13, 14, 1.5, '#fff');
    p.circle(19, 14, 1.5, '#fff');
    p.set(13, 14, '#000');
    p.set(19, 14, '#000');
    leg(p, 10 + f, 24, 5, d);
    leg(p, 20 - f, 24, 5, d);
    if (f) p.circle(16, 22, 1.5, '#c6ff00');
  },
  wraith: (p, f, c) => {
    const l = shade(c, 1.3);
    p.rect(11, 6, 10, 10, c);
    p.rect(12, 5, 8, 1, l);
    p.rect(13, 9, 2, 3, '#e1f5fe');
    p.rect(17, 9, 2, 3, '#e1f5fe');
    p.rect(9, 16, 14, 6, shade(c, 0.85));
    for (let i = 0; i < 5; i++) p.rect(9 + i * 3, 22, 2, 3 + ((i + f) % 2) * 3, shade(c, 0.7));
    p.rect(5, 12 + f, 5, 2, l);
    p.rect(22, 12 - f, 5, 2, l);
  },
  brute: (p, f, c) => {
    const d = shade(c, 0.6);
    p.rect(9, 3, 14, 8, '#8d6e63');
    p.rect(11, 6, 3, 2, '#ffeb3b');
    p.rect(18, 6, 3, 2, '#ffeb3b');
    p.rect(5, 11, 22, 11, c);
    p.rect(5, 11, 22, 1, shade(c, 1.3));
    p.rect(1, 12 + f, 5, 10, d);
    p.rect(26, 12 - f, 5, 10, d);
    p.rect(1, 21 + f, 6, 4, '#616161');
    p.rect(25, 21 - f, 6, 4, '#616161');
    leg(p, 9, 22, 8, d);
    leg(p, 11, 22, 8, d);
    leg(p, 19, 22, 8, d);
    leg(p, 21, 22, 8, d);
  },
  rocketeer: (p, f, c) => {
    DRAW.raider(p, f, c);
    p.rect(8, 8, 4, 12, '#546e7a');
    p.rect(8, 7, 4, 2, '#ff3d00');
  },
  mech: (p, f, c) => {
    const d = shade(c, 0.6);
    p.rect(7, 6, 18, 11, c);
    p.rect(7, 6, 18, 1, shade(c, 1.3));
    p.rect(12, 9, 8, 3, '#ff1744');
    p.rect(2, 9, 6, 3, '#37474f');
    p.rect(24, 9, 7, 3, '#37474f');
    p.rect(10, 17, 4, 6, d);
    p.rect(18, 17, 4, 6, d);
    p.rect(8 + f, 23, 7, 6, d);
    p.rect(17 - f, 23, 7, 6, d);
  },
  guardian: (p, f, c) => {
    const l = shade(c, 1.35), d = shade(c, 0.55);
    p.rect(10, 2, 12, 9, d);
    p.rect(12, 5, 8, 3, l);
    p.rect(6, 11, 20, 12, c);
    p.rect(14, 14, 4, 4, l);
    p.rect(2, 12 - f, 5, 12, d);
    p.rect(25, 12 + f, 5, 12, d);
    p.rect(10, 23, 4, 8, d);
    p.rect(18, 23, 4, 8, d);
    p.rect(2, 22 - f, 5, 3, l);
    p.rect(25, 22 + f, 5, 3, l);
  },
  swarmer: (p, f, c) => {
    // A gaunt runner, leaning in, arms out.
    const d = shade(c, 0.6), l = shade(c, 1.25);
    p.rect(15, 5, 5, 5, l);
    p.set(16, 7, '#ff1744');
    p.set(18, 7, '#ff1744');
    p.rect(16, 9, 3, 1, d);
    p.rect(12, 10, 7, 8, c);
    p.rect(12, 10, 7, 1, l);
    p.rect(19, 11 + f, 7, 2, c);
    p.rect(25, 12 + f, 2, 2, l);
    p.rect(18, 14 - f, 6, 2, d);
    p.rect(12, 17, 7, 2, '#4e342e');
    leg(p, 13 + f * 2, 19, 8, d);
    leg(p, 17 - f * 2, 19, 8, d);
  },
  leaper: (p, f, c) => {
    // Hunched, long-limbed, spined.
    const d = shade(c, 0.6), l = shade(c, 1.3);
    p.rect(9, 12, 12, 7, c);
    p.rect(9, 12, 12, 1, l);
    p.rect(19, 9, 7, 5, l);
    p.set(22, 11, '#ffea00');
    p.set(24, 11, '#ffea00');
    p.rect(24, 13, 3, 1, '#ffffff');
    for (let i = 0; i < 3; i++) p.set(11 + i * 3, 11, l);
    p.rect(20, 18, 2, 6 + f, d);
    p.rect(9, 18, 2, 7 - f, d);
    p.rect(6, 23 - f, 4, 2, d);
    p.rect(22, 24, 4, 2, d);
  },
  marine: (p, f, c) => {
    p.rect(13, 6, 6, 6, '#455a64');
    p.rect(14, 8, 4, 2, '#4fc3f7');
    p.rect(11, 12, 10, 9, c);
    p.rect(11, 12, 10, 1, shade(c, 1.3));
    p.rect(19, 14, 9, 2, '#212121');
    leg(p, 12 + f, 21, 7, '#263238');
    leg(p, 18 - f, 21, 7, '#263238');
  },
  heavy: (p, f, c) => {
    p.rect(11, 3, 10, 8, '#37474f');
    p.rect(13, 6, 6, 2, '#ff5252');
    p.rect(8, 11, 16, 11, c);
    p.rect(8, 11, 16, 1, shade(c, 1.3));
    p.rect(20, 14, 11, 3, '#212121');
    leg(p, 10 + f, 22, 8, '#263238');
    leg(p, 20 - f, 22, 8, '#263238');
  },
};

const cache = new Map<string, SpriteMaterial>();

function makeTex(draw: DrawFn, frame: number, color: string, variant: 'n' | 'flash' | 'elite'): CanvasTexture {
  const c = drawSprite(draw, frame, color, variant);
  const t = new CanvasTexture(c);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A creature sprite frame as a 32x32 canvas (for the batched creature atlas). */
export function creatureCanvas(kind: string, color: string, frame: number, variant: 'n' | 'flash' | 'elite'): HTMLCanvasElement {
  return drawSprite(DRAW[kind] ?? DRAW.rat, frame, color, variant);
}

function drawSprite(draw: DrawFn, frame: number, color: string, variant: 'n' | 'flash' | 'elite'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const p = new Pix(ctx, 0, 0, S, S, 1);
  draw(p, frame, color);
  if (variant !== 'n') {
    const img = ctx.getImageData(0, 0, S, S);
    const d = img.data;
    if (variant === 'flash') {
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) d[i] = d[i + 1] = d[i + 2] = 255;
      ctx.putImageData(img, 0, 0);
    } else {
      // Elite: magenta outline around the silhouette.
      const a = (x: number, y: number): number => (x < 0 || y < 0 || x >= S || y >= S ? 0 : d[(y * S + x) * 4 + 3]);
      const out: [number, number][] = [];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!a(x, y) && (a(x + 1, y) || a(x - 1, y) || a(x, y + 1) || a(x, y - 1))) out.push([x, y]);
      ctx.fillStyle = '#ff40ff';
      for (const [x, y] of out) ctx.fillRect(x, y, 1, 1);
    }
  } else {
    // Dark 1px outline for readability.
    const img = ctx.getImageData(0, 0, S, S);
    const d = img.data;
    const a = (x: number, y: number): number => (x < 0 || y < 0 || x >= S || y >= S ? 0 : d[(y * S + x) * 4 + 3]);
    const out: [number, number][] = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!a(x, y) && (a(x + 1, y) || a(x - 1, y) || a(x, y + 1) || a(x, y - 1))) out.push([x, y]);
    ctx.fillStyle = 'rgba(12,10,14,0.85)';
    for (const [x, y] of out) ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

/** Sprite material for a creature kind, frame, facing and variant. */
export function spriteMat(kind: string, color: string, frame: number, variant: 'n' | 'flash' | 'elite', flip: boolean): SpriteMaterial {
  const key = `${kind}|${color}|${frame}|${variant}|${flip ? 1 : 0}`;
  let m = cache.get(key);
  if (!m) {
    const draw = DRAW[kind] ?? DRAW.rat;
    const tex = makeTex(draw, frame, color, variant);
    if (flip) {
      tex.repeat.x = -1;
      tex.offset.x = 1;
    }
    m = new SpriteMaterial({ map: tex, alphaTest: 0.5, depthWrite: true });
    cache.set(key, m);
  }
  return m;
}

export function hasSprite(kind: string): boolean {
  return kind in DRAW;
}

/** Blob shadow texture shared by units. */
let shadowTex: CanvasTexture | null = null;
export function shadowTexture(): CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const p = new Pix(c.getContext('2d')!, 0, 0, 16, 16, 1);
  p.circle(8, 8, 7, 'rgba(0,0,0,0.45)');
  p.circle(8, 8, 5, 'rgba(0,0,0,0.25)');
  shadowTex = new CanvasTexture(c);
  shadowTex.magFilter = NearestFilter;
  shadowTex.minFilter = NearestFilter;
  shadowTex.generateMipmaps = false;
  return shadowTex;
}
