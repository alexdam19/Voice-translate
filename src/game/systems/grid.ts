import type { Enemy } from '../entities';

/**
 * A uniform grid over the live enemies, rebuilt every step, so crowds (hordes of hundreds) can find their
 * neighbours, and shots and blasts can find what they hit, without checking every enemy.
 */
export class EnemyGrid {
  private cell = 3;
  private x0 = 0;
  private y0 = 0;
  private w = 1;
  private h = 1;
  private head = new Int32Array(1);
  private next = new Int32Array(0);
  private list: Enemy[] = [];

  build(list: Enemy[]): void {
    this.list = list;
    const n = list.length;
    if (this.next.length < n) this.next = new Int32Array(Math.max(64, n * 2));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of list) {
      if (e.x < minX) minX = e.x;
      if (e.y < minY) minY = e.y;
      if (e.x > maxX) maxX = e.x;
      if (e.y > maxY) maxY = e.y;
    }
    if (!n) {
      this.w = this.h = 1;
      this.head[0] = -1;
      return;
    }
    // Keep the grid a sensible size even if enemies are spread over the whole map.
    this.cell = Math.max(3, Math.ceil(Math.max(maxX - minX, maxY - minY) / 160));
    this.x0 = minX - this.cell;
    this.y0 = minY - this.cell;
    this.w = Math.floor((maxX - this.x0) / this.cell) + 2;
    this.h = Math.floor((maxY - this.y0) / this.cell) + 2;
    const cells = this.w * this.h;
    if (this.head.length < cells) this.head = new Int32Array(cells * 2);
    this.head.fill(-1, 0, cells);
    for (let i = 0; i < n; i++) {
      const e = list[i];
      const c = this.cellOf(e.x, e.y);
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }

  private cellOf(x: number, y: number): number {
    const cx = Math.max(0, Math.min(this.w - 1, Math.floor((x - this.x0) / this.cell)));
    const cy = Math.max(0, Math.min(this.h - 1, Math.floor((y - this.y0) / this.cell)));
    return cy * this.w + cx;
  }

  /** Enemies whose centres are within `r` (plus the cell size) of (x, y). Reuses `out`. */
  near(x: number, y: number, r: number, out: Enemy[] = []): Enemy[] {
    out.length = 0;
    if (!this.list.length) return out;
    const c0x = Math.max(0, Math.floor((x - r - this.x0) / this.cell)), c1x = Math.min(this.w - 1, Math.floor((x + r - this.x0) / this.cell));
    const c0y = Math.max(0, Math.floor((y - r - this.y0) / this.cell)), c1y = Math.min(this.h - 1, Math.floor((y + r - this.y0) / this.cell));
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        for (let i = this.head[cy * this.w + cx]; i !== -1; i = this.next[i]) {
          const e = this.list[i];
          if (e) out.push(e);
        }
      }
    }
    return out;
  }
}
