import { TILE } from '../shared/constants';
import { hash2 } from '../shared/rng';
import { TILES, WALLS, W, type TileDef } from '../shared/tiles';
import type { RGB } from '../shared/types';

export const VARIANTS = 4;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

class Pix {
  data: Uint8ClampedArray;
  constructor(public img: ImageData) {
    this.data = img.data;
  }
  set(x: number, y: number, c: RGB, a = 255): void {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    const i = (y * TILE + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }
}

const sh = (c: RGB, d: number): RGB => [c[0] + d, c[1] + d, c[2] + d];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function paint(def: TileDef, v: number, p: Pix): void {
  const n = (x: number, y: number, s = 0): number => hash2(x + v * 17, y + s * 31, def.id * 7 + 3);
  const b = def.base, a = def.accent;
  const fill = (fn: (x: number, y: number) => RGB | null, alpha = 255): void => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const c = fn(x, y);
      if (c) p.set(x, y, c, alpha);
    }
  };
  const block = (x: number, y: number, size: number): number => n(Math.floor(x / size) + 50, Math.floor(y / size) + 50, 9);
  switch (def.style) {
    case 'soil':
      fill((x, y) => {
        let c = sh(b, (n(x, y) - 0.5) * 22 + (block(x, y, 4) - 0.5) * 14);
        if (n(x, y, 2) > 0.94) c = sh(b, -26);
        if (n(x, y, 3) > 0.97) c = [150, 130, 110];
        return c;
      });
      break;
    case 'rock':
    case 'bedrock':
      fill((x, y) => {
        let c = sh(b, (n(x, y) - 0.5) * 14 + (block(x, y, 5) - 0.5) * 20);
        if (def.style === 'bedrock' && n(x, y, 4) > 0.9) c = [70, 50, 90];
        return c;
      });
      {
        let cx = Math.floor(n(1, 1, 5) * 10) + 3, cy = 0;
        for (let i = 0; i < 12; i++) {
          p.set(cx, cy, sh(b, -30));
          cy++;
          cx += n(i, 9, 6) > 0.5 ? 1 : -1;
        }
      }
      break;
    case 'sand':
      fill((x, y) => sh(b, (n(x, y) - 0.5) * 16 + ((y + Math.floor(x / 5) + v) % 6 === 0 ? -12 : 0)));
      break;
    case 'sandstone':
      fill((x, y) => sh(b, (n(x, y) - 0.5) * 10 + (Math.floor((y + v * 2) / 4) % 2 ? 10 : -8)));
      break;
    case 'ice':
      fill((x, y) => {
        let c = sh(b, (n(x, y) - 0.5) * 10);
        if ((x + y + v * 3) % 9 === 0) c = mix(c, [255, 255, 255], 0.5);
        if (n(x, y, 2) > 0.97) c = [255, 255, 255];
        return c;
      });
      break;
    case 'snow':
      fill((x, y) => sh(b, (n(x, y) - 0.5) * 12 - (block(x, y, 4) > 0.8 ? 14 : 0)));
      break;
    case 'ash':
      fill((x, y) => (n(x, y, 2) > 0.975 ? a : sh(b, (n(x, y) - 0.5) * 20 + (block(x, y, 3) - 0.5) * 10)));
      break;
    case 'basalt':
      fill((x, y) => {
        const col = (x + Math.floor(n(0, 0, 3) * 3)) % 6;
        return sh(b, (n(x, y) - 0.5) * 10 + (col === 0 ? -14 : col === 1 ? 8 : 0));
      });
      break;
    case 'lava':
      fill((x, y) => {
        const t = (Math.sin((x + v * 4) * 0.7) + Math.cos((y - v * 3) * 0.6) + 2) / 4;
        return mix(b, a, t * 0.8 + n(x, y) * 0.2);
      });
      break;
    case 'acid':
      fill((x, y) => {
        const t = (Math.sin((x + v * 5) * 0.5 + y * 0.3) + 1) / 2;
        let c = mix(sh(b, -30), b, t);
        if (n(x, y, 2) > 0.96) c = a;
        return c;
      }, 235);
      break;
    case 'mud':
      fill((x, y) => {
        let c = sh(b, (n(x, y) - 0.5) * 14);
        if ((x * 2 + y + v) % 11 === 0) c = mix(c, a, 0.5);
        return c;
      });
      break;
    case 'glass':
      fill((x, y) => {
        const facet = (Math.floor((x + y) / 5) + Math.floor((x - y + 16) / 6) + v) % 3;
        let c = sh(b, facet * 12 - 10 + (n(x, y) - 0.5) * 8);
        if (n(x, y, 2) > 0.96) c = a;
        return c;
      });
      break;
    case 'scrap': {
      const pal: RGB[] = [[128, 82, 56], [104, 110, 118], [60, 110, 108], [70, 60, 56], [150, 110, 60]];
      fill((x, y) => {
        const cell = n(Math.floor(x / 5) + Math.floor(y / 4) * 7, 0, 4);
        let c = pal[Math.floor(cell * pal.length)];
        c = sh(c, (n(x, y) - 0.5) * 16);
        if (x % 5 === 0 || y % 4 === 0) c = sh(c, -22);
        return c;
      });
      break;
    }
    case 'ore':
      fill((x, y) => sh(b, (n(x, y) - 0.5) * 14 + (block(x, y, 5) - 0.5) * 16));
      for (let k = 0; k < 5; k++) {
        const cx = 2 + Math.floor(n(k, 0, 7) * 12), cy = 2 + Math.floor(n(k, 1, 7) * 12);
        const r = n(k, 2, 7) > 0.5 ? 2 : 1;
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
          if (x * x + y * y > r * r + 1) continue;
          p.set(cx + x, cy + y, sh(a, (n(cx + x, cy + y, 8) - 0.5) * 30));
        }
        p.set(cx - 1, cy - 1, mix(a, [255, 255, 255], 0.6));
      }
      break;
    case 'concrete':
      fill((x, y) => {
        let c = sh(b, (n(x, y) - 0.5) * 12);
        if (n(x, y, 2) > 0.95) c = sh(b, -30);
        if (n(x, y, 3) > 0.985) c = [150, 80, 50];
        if (y === 7 && v % 2 === 0) c = sh(b, -14);
        return c;
      });
      break;
    case 'girder':
      fill((x, y) => {
        const flange = y < 3 || y > 12;
        const web = x >= 6 && x <= 9;
        if (!flange && !web) return null;
        let c = sh(b, (n(x, y) - 0.5) * 20 + (flange && (y === 0 || y === 13) ? 16 : 0));
        if (web && !flange && y % 5 === 2) c = sh(b, -40);
        return c;
      });
      break;
    case 'platform':
      fill((x, y) => {
        if (y > 4) return x === 1 || x === 14 ? (y < 8 ? sh(b, -40) : null) : null;
        let c = sh(b, (y === 0 ? 20 : 0) + (n(x, y) - 0.5) * 16);
        if (y > 0 && y < 4 && x % 4 === 2) c = sh(b, -45);
        return c;
      });
      break;
    case 'plate':
      fill((x, y) => {
        const edge = x === 0 || y === 0 || x === 15 || y === 15;
        let c = sh(b, (edge ? -26 : 0) + (x + y < 10 ? 8 : 0) + (n(x, y) - 0.5) * 6);
        if ((x === 2 || x === 13) && (y === 2 || y === 13)) c = sh(b, 40);
        return c;
      });
      break;
    case 'lamp':
      fill((x, y) => {
        if (y < 3 && x >= 7 && x <= 8) return [70, 70, 76];
        if (y >= 3 && y <= 5 && x >= 4 && x <= 11) return [90, 88, 96];
        if (y >= 6 && y <= 9 && x >= 5 && x <= 10) return mix(b, [255, 255, 255], (9 - y) / 6);
        return null;
      });
      break;
    case 'fungus':
      fill((x, y) => {
        const cap = y >= 3 + (v % 2) && y <= 7 && Math.abs(x - 8) <= 6 - (y - 3) * 0.3;
        const stalk = y > 7 && x >= 7 && x <= 8;
        if (cap) return n(x, y) > 0.85 ? a : sh(b, (7 - y) * 6);
        if (stalk) return [200, 190, 170];
        if (y === 15 && Math.abs(x - 8) < 4) return [120, 100, 90];
        return null;
      });
      break;
    case 'neon':
      fill((x, y) => {
        if (x === 0 || y === 0 || x === 15 || y === 15) return [40, 20, 40];
        if (y >= 6 && y <= 9) return y === 7 || y === 8 ? [255, 220, 250] : b;
        return [60, 24, 60];
      });
      break;
    default:
      fill(() => b);
  }
}

function paintWall(id: number, v: number, p: Pix): void {
  const def = WALLS[id];
  const b = def.base;
  const n = (x: number, y: number, s = 0): number => hash2(x + v * 13, y + s * 29, id * 11 + 5);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let c: RGB = sh(b, (n(x, y) - 0.5) * 10);
      switch (id) {
        case W.CONCRETE:
          if (y % 8 === 0 || (x + (Math.floor(y / 8) % 2) * 8) % 16 === 0) c = sh(b, -14);
          break;
        case W.METAL:
          if (x === 0 || y === 0) c = sh(b, -16);
          if ((x === 3 || x === 12) && (y === 3 || y === 12)) c = sh(b, 24);
          if (n(x, y, 3) > 0.9) c = [110, 60, 40];
          break;
        case W.WINDOWS: {
          const wx = x % 8, wy = y % 8;
          if (wx >= 2 && wx <= 5 && wy >= 2 && wy <= 5) {
            const lit = n(Math.floor(x / 8), Math.floor(y / 8), 4);
            c = lit > 0.72 ? [255, 206, 120] : lit > 0.62 ? [110, 220, 255] : lit > 0.58 ? [255, 90, 200] : [18, 22, 30];
          }
          break;
        }
        case W.NEON_PINK:
        case W.NEON_CYAN: {
          const tube: RGB = id === W.NEON_PINK ? [255, 70, 210] : [70, 240, 255];
          c = [24, 14, 26];
          if ((y + v) % 5 === 1 || (x + v * 2) % 7 === 0) c = tube;
          if ((y + v) % 5 === 1 && x % 3 === 0) c = [255, 255, 255];
          break;
        }
        case W.GIRDER:
          c = x === y || x === 15 - y || x < 2 || x > 13 ? sh(b, (n(x, y) - 0.5) * 14) : [0, 0, 0];
          if (c[0] === 0 && c[1] === 0) {
            p.set(x, y, c, 0);
            continue;
          }
          break;
        case W.PIPES:
          if (x % 8 >= 2 && x % 8 <= 5) c = sh([80, 96, 84], x % 8 === 3 ? 20 : 0);
          if (y % 16 === 4 && x % 8 >= 1 && x % 8 <= 6) c = [60, 64, 60];
          break;
        case W.HAZARD:
          c = (x + y) % 8 < 4 ? [200, 170, 40] : [30, 30, 30];
          break;
      }
      p.set(x, y, c);
    }
  }
}

/** Procedurally painted tile textures: VARIANTS per tile, plus wall and cave backdrops. */
export class TileArt {
  tiles: HTMLCanvasElement[][] = [];
  walls: HTMLCanvasElement[][] = [];
  caves: HTMLCanvasElement[][] = [];

  constructor() {
    for (const def of TILES) {
      const arr: HTMLCanvasElement[] = [];
      for (let v = 0; v < VARIANTS; v++) {
        const c = canvas(TILE, TILE);
        const ctx = c.getContext('2d')!;
        const img = ctx.createImageData(TILE, TILE);
        if (def.style !== 'air') paint(def, v, new Pix(img));
        ctx.putImageData(img, 0, 0);
        arr.push(c);
      }
      this.tiles.push(arr);
      // Darkened copy used behind caves.
      const cav: HTMLCanvasElement[] = [];
      for (let v = 0; v < VARIANTS; v++) {
        const c = canvas(TILE, TILE);
        const ctx = c.getContext('2d')!;
        ctx.drawImage(arr[v], 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(8,6,10,0.68)';
        ctx.fillRect(0, 0, TILE, TILE);
        cav.push(c);
      }
      this.caves.push(cav);
    }
    for (const wd of WALLS) {
      const arr: HTMLCanvasElement[] = [];
      for (let v = 0; v < VARIANTS; v++) {
        const c = canvas(TILE, TILE);
        const ctx = c.getContext('2d')!;
        const img = ctx.createImageData(TILE, TILE);
        if (wd.id !== 0) paintWall(wd.id, v, new Pix(img));
        ctx.putImageData(img, 0, 0);
        const neon = wd.id === W.NEON_PINK || wd.id === W.NEON_CYAN || wd.id === W.WINDOWS;
        if (!neon) {
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(10,8,14,0.35)';
          ctx.fillRect(0, 0, TILE, TILE);
        }
        arr.push(c);
      }
      this.walls.push(arr);
    }
  }
}

let shared: TileArt | null = null;
export function tileArt(): TileArt {
  if (!shared) shared = new TileArt();
  return shared;
}
