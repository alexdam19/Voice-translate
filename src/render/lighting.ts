import { TILE } from '../shared/constants';
import { TILES, WALLS } from '../shared/tiles';
import type { World } from '../shared/world';

export interface PointLight {
  x: number;
  y: number;
  v: number;
}

/**
 * Tile light map: open sky and emissive tiles seed light, which then spreads
 * through air and (much less) through solid ground. Rendered as a tiny
 * darkness texture scaled up with smoothing for soft falloff.
 */
export class Lighting {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private light = new Float32Array(0);
  private solid = new Uint8Array(0);
  private img: ImageData | null = null;
  private w = 0;
  private h = 0;
  private x0 = 0;
  private y0 = 0;

  compute(world: World, left: number, top: number, right: number, bottom: number, sky: number, lights: PointLight[], underground: boolean): void {
    const M = 10;
    const x0 = Math.floor(left / TILE) - M, y0 = Math.floor(top / TILE) - M;
    const w = Math.ceil((right - left) / TILE) + M * 2, h = Math.ceil((bottom - top) / TILE) + M * 2;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.canvas.width = w;
      this.canvas.height = h;
      this.light = new Float32Array(w * h);
      this.solid = new Uint8Array(w * h);
      this.img = this.ctx.createImageData(w, h);
    }
    this.x0 = x0;
    this.y0 = y0;
    const L = this.light, S = this.solid;
    for (let j = 0; j < h; j++) {
      const ty = y0 + j;
      for (let i = 0; i < w; i++) {
        const tx = x0 + i;
        const t = world.get(tx, ty);
        const d = TILES[t];
        const k = j * w + i;
        S[k] = d.solid ? 1 : 0;
        let v = 0;
        if (tx >= 0 && tx < world.w && ty < world.skyTop[tx] && !underground) v = sky;
        if (d.light > v) v = d.light;
        const wl = world.wall(tx, ty);
        if (wl && !d.solid && WALLS[wl].light * 0.8 > v) v = WALLS[wl].light * 0.8;
        L[k] = v;
      }
    }
    for (const p of lights) {
      const i = Math.floor(p.x / TILE) - x0, j = Math.floor(p.y / TILE) - y0;
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      const k = j * w + i;
      if (p.v > L[k]) L[k] = p.v;
    }
    const AIR = 0.9, SOLID = 0.74;
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < h; j++) {
        const row = j * w;
        for (let i = 1; i < w; i++) {
          const k = row + i;
          const v = L[k - 1] * (S[k] ? SOLID : AIR);
          if (v > L[k]) L[k] = v;
        }
        for (let i = w - 2; i >= 0; i--) {
          const k = row + i;
          const v = L[k + 1] * (S[k] ? SOLID : AIR);
          if (v > L[k]) L[k] = v;
        }
      }
      for (let i = 0; i < w; i++) {
        for (let j = 1; j < h; j++) {
          const k = j * w + i;
          const v = L[k - w] * (S[k] ? SOLID : AIR);
          if (v > L[k]) L[k] = v;
        }
        for (let j = h - 2; j >= 0; j--) {
          const k = j * w + i;
          const v = L[k + w] * (S[k] ? SOLID : AIR);
          if (v > L[k]) L[k] = v;
        }
      }
    }
    const data = this.img!.data;
    for (let k = 0; k < w * h; k++) {
      const v = L[k] > 1 ? 1 : L[k];
      const a = (1 - v) * 0.94;
      data[k * 4] = 3;
      data[k * 4 + 1] = 4;
      data[k * 4 + 2] = 12;
      data[k * 4 + 3] = a * 255;
    }
    this.ctx.putImageData(this.img!, 0, 0);
  }

  /** Draws the darkness overlay in world space (camera transform must be applied). */
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, 0, 0, this.w, this.h, (this.x0 - 0.5) * TILE, (this.y0 - 0.5) * TILE, this.w * TILE, this.h * TILE);
    ctx.imageSmoothingEnabled = false;
  }
}
