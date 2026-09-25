import { CHUNK, TILE } from '../shared/constants';
import { hash2 } from '../shared/rng';
import { T, TILES } from '../shared/tiles';
import type { World } from '../shared/world';
import { ZONES, zoneIndexAt } from '../shared/zones';
import { tileArt, VARIANTS } from './tileArt';

interface Chunk {
  canvas: HTMLCanvasElement;
  dirty: boolean;
  ever: boolean;
  used: number;
}

const MAX_CHUNKS = 90;
const SIZE = CHUNK * TILE;

/** Caches pre-rendered 32x32-tile chunks of the world; re-renders only what changes. */
export class ChunkCache {
  private chunks = new Map<number, Chunk>();
  private frame = 0;
  private pool: HTMLCanvasElement[] = [];

  constructor(
    readonly world: World,
    private warzone: boolean,
  ) {
    world.onChange((x, y) => {
      this.invalidate(x, y);
      // Edge shading depends on neighbours.
      if (x % CHUNK === 0) this.invalidate(x - 1, y);
      if (x % CHUNK === CHUNK - 1) this.invalidate(x + 1, y);
      if (y % CHUNK === 0) this.invalidate(x, y - 1);
      if (y % CHUNK === CHUNK - 1) this.invalidate(x, y + 1);
    });
  }

  private key(cx: number, cy: number): number {
    return cy * 10000 + cx;
  }

  invalidate(x: number, y: number): void {
    const c = this.chunks.get(this.key(Math.floor(x / CHUNK), Math.floor(y / CHUNK)));
    if (c) c.dirty = true;
  }

  draw(ctx: CanvasRenderingContext2D, left: number, top: number, right: number, bottom: number): void {
    this.frame++;
    const cx0 = Math.max(0, Math.floor(left / SIZE)), cx1 = Math.min(Math.ceil(this.world.w / CHUNK) - 1, Math.floor(right / SIZE));
    const cy0 = Math.max(0, Math.floor(top / SIZE)), cy1 = Math.min(Math.ceil(this.world.h / CHUNK) - 1, Math.floor(bottom / SIZE));
    let rendered = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = this.key(cx, cy);
        let c = this.chunks.get(k);
        if (!c) {
          c = { canvas: this.pool.pop() ?? this.newCanvas(), dirty: true, ever: false, used: 0 };
          this.chunks.set(k, c);
        }
        c.used = this.frame;
        // Never-rendered chunks always render; stale ones refresh a few per frame.
        if (c.dirty && (!c.ever || rendered < 8)) {
          this.render(c, cx, cy);
          rendered++;
        }
        ctx.drawImage(c.canvas, cx * SIZE, cy * SIZE);
      }
    }
    if (this.chunks.size > MAX_CHUNKS) {
      const sorted = [...this.chunks].sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < sorted.length - MAX_CHUNKS; i++) {
        this.pool.push(sorted[i][1].canvas);
        this.chunks.delete(sorted[i][0]);
      }
    }
  }

  private newCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    return c;
  }

  private render(c: Chunk, cx: number, cy: number): void {
    const ctx = c.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    const art = tileArt();
    const w = this.world;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (let ly = 0; ly < CHUNK; ly++) {
      const ty = y0 + ly;
      if (ty >= w.h) break;
      for (let lx = 0; lx < CHUNK; lx++) {
        const tx = x0 + lx;
        if (tx >= w.w) break;
        const t = w.tiles[ty * w.w + tx];
        const d = TILES[t];
        const px = lx * TILE, py = ly * TILE;
        const v = Math.floor(hash2(tx, ty, 99) * VARIANTS);
        if (!d.solid) {
          const wall = w.walls[ty * w.w + tx];
          if (wall) ctx.drawImage(art.walls[wall][v], px, py);
          else if (ty > w.surface[tx] + 1) {
            const back = this.caveMaterial(tx, ty);
            ctx.drawImage(art.caves[back][v], px, py);
          }
        }
        if (t === T.AIR) continue;
        if (d.liquid) {
          const above = w.get(tx, ty - 1);
          if (!TILES[above].liquid) {
            ctx.drawImage(art.tiles[t][v], 0, 0, TILE, TILE - 4, px, py + 4, TILE, TILE - 4);
            ctx.fillStyle = t === T.LAVA ? 'rgba(255,230,140,0.9)' : 'rgba(220,255,160,0.8)';
            ctx.fillRect(px, py + 4, TILE, 1);
          } else {
            ctx.drawImage(art.tiles[t][v], px, py);
          }
          continue;
        }
        ctx.drawImage(art.tiles[t][v], px, py);
        if (!d.solid) continue;
        // Edge shading against open space.
        const open = (x: number, y: number): boolean => {
          const n = TILES[w.get(x, y)];
          return !n.solid;
        };
        if (open(tx, ty - 1)) {
          const top = t === T.SNOW || t === T.ICE ? 'rgba(255,255,255,0.55)' : t === T.SAND ? 'rgba(255,240,200,0.35)' : t === T.DIRT ? 'rgba(60,44,34,0.8)' : t === T.GLASS ? 'rgba(210,255,190,0.5)' : 'rgba(255,255,255,0.18)';
          ctx.fillStyle = top;
          ctx.fillRect(px, py, TILE, t === T.DIRT ? 3 : 2);
          if (t === T.DIRT) {
            ctx.fillStyle = 'rgba(150,120,80,0.6)';
            for (let i = 0; i < 4; i++) if (hash2(tx * 4 + i, ty, 7) > 0.5) ctx.fillRect(px + i * 4 + 1, py - 1, 1, 2);
          }
        }
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        if (open(tx, ty + 1)) ctx.fillRect(px, py + TILE - 2, TILE, 2);
        if (open(tx - 1, ty)) ctx.fillRect(px, py, 1, TILE);
        if (open(tx + 1, ty)) ctx.fillRect(px + TILE - 1, py, 1, TILE);
        if (open(tx - 1, ty) && open(tx, ty - 1)) ctx.clearRect(px, py, 2, 2);
        if (open(tx + 1, ty) && open(tx, ty - 1)) ctx.clearRect(px + TILE - 2, py, 2, 2);
      }
    }
    c.dirty = false;
    c.ever = true;
  }

  private caveMaterial(tx: number, ty: number): number {
    if (this.warzone) return T.ROCK;
    const z = ZONES[zoneIndexAt(tx)];
    const d = ty - this.world.surface[tx];
    return d < z.subDepth ? (z.sub === T.ICE ? T.ICE : z.sub) : z.deep;
  }
}
