import { TILES, WALLS } from '../shared/tiles';
import type { World } from '../shared/world';

const B = 4; // explored-mask block size in tiles

/** A 1-pixel-per-tile map of the world that fills in as you explore. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private explored: Uint8Array;
  private bw: number;
  private bh: number;
  private dirty = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };

  constructor(
    private world: World,
    revealAll: boolean,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = world.w;
    this.canvas.height = world.h;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(world.w, world.h);
    this.bw = Math.ceil(world.w / B);
    this.bh = Math.ceil(world.h / B);
    this.explored = new Uint8Array(this.bw * this.bh);
    world.onChange((x, y) => {
      if (this.explored[Math.floor(y / B) * this.bw + Math.floor(x / B)]) {
        this.paint(x, y);
        this.mark(x, y, x, y);
      }
    });
    if (revealAll) {
      this.explored.fill(1);
      for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) this.paint(x, y);
      this.ctx.putImageData(this.img, 0, 0);
    }
  }

  private paint(x: number, y: number): void {
    const w = this.world;
    const t = w.tiles[y * w.w + x];
    const d = TILES[t];
    const i = (y * w.w + x) * 4;
    const px = this.img.data;
    if (t !== 0) {
      px[i] = d.map[0];
      px[i + 1] = d.map[1];
      px[i + 2] = d.map[2];
      px[i + 3] = 255;
      return;
    }
    const wall = w.walls[y * w.w + x];
    if (wall) {
      const c = WALLS[wall].base;
      px[i] = c[0] * 0.8;
      px[i + 1] = c[1] * 0.8;
      px[i + 2] = c[2] * 0.8;
      px[i + 3] = 255;
    } else if (y > w.surface[x] + 1) {
      px[i] = 22;
      px[i + 1] = 20;
      px[i + 2] = 26;
      px[i + 3] = 255;
    } else {
      px[i] = 40;
      px[i + 1] = 52;
      px[i + 2] = 70;
      px[i + 3] = 120;
    }
  }

  private mark(x0: number, y0: number, x1: number, y1: number): void {
    const d = this.dirty;
    d.x0 = Math.min(d.x0, x0);
    d.y0 = Math.min(d.y0, y0);
    d.x1 = Math.max(d.x1, x1);
    d.y1 = Math.max(d.y1, y1);
  }

  reveal(tx: number, ty: number, r: number): void {
    const bx0 = Math.max(0, Math.floor((tx - r) / B)), bx1 = Math.min(this.bw - 1, Math.floor((tx + r) / B));
    const by0 = Math.max(0, Math.floor((ty - r) / B)), by1 = Math.min(this.bh - 1, Math.floor((ty + r) / B));
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const k = by * this.bw + bx;
        if (this.explored[k]) continue;
        if (Math.hypot(bx * B + B / 2 - tx, by * B + B / 2 - ty) > r) continue;
        this.explored[k] = 1;
        for (let y = by * B; y < Math.min(this.world.h, by * B + B); y++) for (let x = bx * B; x < Math.min(this.world.w, bx * B + B); x++) this.paint(x, y);
        this.mark(bx * B, by * B, bx * B + B - 1, by * B + B - 1);
      }
    }
  }

  flush(): void {
    const d = this.dirty;
    if (d.x1 < 0) return;
    const x0 = Math.max(0, d.x0), y0 = Math.max(0, d.y0);
    const x1 = Math.min(this.world.w - 1, d.x1), y1 = Math.min(this.world.h - 1, d.y1);
    this.ctx.putImageData(this.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    this.dirty = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
  }

  isExplored(tx: number, ty: number): boolean {
    const bx = Math.floor(tx / B), by = Math.floor(ty / B);
    if (bx < 0 || by < 0 || bx >= this.bw || by >= this.bh) return false;
    return this.explored[by * this.bw + bx] === 1;
  }

  saveExplored(): string {
    // Run-length encode: alternating run lengths starting with unexplored.
    const runs: number[] = [];
    let cur = 0, n = 0;
    for (let i = 0; i < this.explored.length; i++) {
      if (this.explored[i] === cur) n++;
      else {
        runs.push(n);
        cur = this.explored[i];
        n = 1;
      }
    }
    runs.push(n);
    return runs.join(',');
  }

  loadExplored(s: string): void {
    if (!s) return;
    const runs = s.split(',').map(Number);
    let i = 0, cur = 0;
    for (const n of runs) {
      for (let k = 0; k < n && i < this.explored.length; k++) {
        if (cur) {
          this.explored[i] = 1;
          const bx = i % this.bw, by = Math.floor(i / this.bw);
          for (let y = by * B; y < Math.min(this.world.h, by * B + B); y++) for (let x = bx * B; x < Math.min(this.world.w, bx * B + B); x++) this.paint(x, y);
        }
        i++;
      }
      cur = 1 - cur;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
