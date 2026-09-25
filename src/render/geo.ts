import { BufferGeometry, Float32BufferAttribute } from 'three';

export interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Face mask bits for boxes. */
export const F = { TOP: 1, BOTTOM: 2, N: 4, S: 8, E: 16, W: 32, ALL: 63, SIDES: 60 } as const;

/**
 * Accumulates quads into one BufferGeometry. Coordinates are three.js (x right, y up, z south).
 */
export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  get empty(): boolean {
    return this.idx.length === 0;
  }

  /** Adds a quad from 4 corners (counter-clockwise when seen from the front). */
  quad(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number, uv: UVRect, r = 1, g = 1, b = 1, shadeBottom = 1,
  ): void {
    const base = this.pos.length / 3;
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    for (let i = 0; i < 4; i++) this.nor.push(nx, ny, nz);
    this.uv.push(uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1);
    // a,b are the "bottom" edge for side faces: darken them for fake AO.
    const s = shadeBottom;
    this.col.push(r * s, g * s, b * s, r * s, g * s, b * s, r, g, b, r, g, b);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Axis-aligned box. `top`/`side` are atlas rects. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: UVRect, side: UVRect, mask: number = F.ALL, r = 1, g = 1, b = 1, ao = 0.7): void {
    if (mask & F.TOP) this.quad(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, top, r, g, b);
    if (mask & F.BOTTOM) this.quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, side, r * 0.5, g * 0.5, b * 0.5);
    // South (+z)
    if (mask & F.S) this.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, side, r, g, b, ao);
    // North (-z)
    if (mask & F.N) this.quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, side, r * 0.8, g * 0.8, b * 0.8, ao);
    // East (+x)
    if (mask & F.E) this.quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, side, r * 0.92, g * 0.92, b * 0.92, ao);
    // West (-x)
    if (mask & F.W) this.quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, side, r * 0.86, g * 0.86, b * 0.86, ao);
  }

  /** Box centred at (cx, cz) with footprint w x d, from y0 to y1. */
  cbox(cx: number, cz: number, w: number, d: number, y0: number, y1: number, top: UVRect, side: UVRect, r = 1, g = 1, b = 1): void {
    this.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y1, cz + d / 2, top, side, F.ALL & ~F.BOTTOM, r, g, b);
  }

  /** Flat horizontal quad at height y. */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, uv: UVRect, r = 1, g = 1, b = 1): void {
    this.quad(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0, 0, 1, 0, uv, r, g, b);
  }

  /** A slanted wedge (ramp) rising toward -x... used for glacis plates. dir: +1 rises toward +x. */
  wedgeX(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, dir: 1 | -1, top: UVRect, side: UVRect, r = 1, g = 1, b = 1): void {
    const hiX = dir > 0 ? x1 : x0, loX = dir > 0 ? x0 : x1;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = (-(y1 - y0) / len) * -dir, ny = (x1 - x0) / len;
    // Slope
    if (dir > 0) this.quad(loX, y0, z1, hiX, y1, z1, hiX, y1, z0, loX, y0, z0, nx, ny, 0, top, r, g, b);
    else this.quad(hiX, y1, z1, loX, y0, z1, loX, y0, z0, hiX, y1, z0, nx, ny, 0, top, r, g, b);
    // Triangular sides (as degenerate quads)
    this.quad(loX, y0, z1, hiX, y0, z1, hiX, y1, z1, hiX, y1, z1, 0, 0, 1, side, r, g, b);
    this.quad(hiX, y0, z0, loX, y0, z0, hiX, y1, z0, hiX, y1, z0, 0, 0, -1, side, r * 0.8, g * 0.8, b * 0.8);
    // Tall end
    if (dir > 0) this.quad(hiX, y0, z1, hiX, y0, z0, hiX, y1, z0, hiX, y1, z1, 1, 0, 0, side, r, g, b);
    else this.quad(hiX, y0, z0, hiX, y0, z1, hiX, y1, z1, hiX, y1, z0, -1, 0, 0, side, r, g, b);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
