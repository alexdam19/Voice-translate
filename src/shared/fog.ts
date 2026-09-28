import { CH } from './map';

/**
 * Fog of war for a streamed world. What's in sight lives in a small window that follows the fortress; what's been
 * explored is kept per chunk (a bit per tile), so it costs nothing for the parts of the world you never visit.
 */
export class Fog {
  /** Visibility window (tiles per side). */
  static readonly W = 1100;
  ox = 0;
  oy = 0;
  readonly vis = new Uint8Array(Fog.W * Fog.W);
  /** Chunk index -> 1 byte per tile (0/1). */
  readonly seen = new Map<number, Uint8Array>();
  version = 0;

  constructor(readonly size: number) {}

  private get cps(): number {
    return Math.ceil(this.size / CH);
  }

  isVisible(x: number, y: number): boolean {
    const tx = Math.floor(x) - this.ox, ty = Math.floor(y) - this.oy;
    if (tx < 0 || ty < 0 || tx >= Fog.W || ty >= Fog.W) return false;
    return this.vis[ty * Fog.W + tx] === 1;
  }

  isExplored(x: number, y: number): boolean {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) return false;
    const c = this.seen.get((ty >> 5) * this.cps + (tx >> 5));
    return !!c && c[((ty & 31) << 5) | (tx & 31)] === 1;
  }

  /** How much of a chunk has been seen (0-1), for overview maps. */
  chunkSeen(cx: number, cy: number): number {
    const c = this.seen.get(cy * this.cps + cx);
    if (!c) return 0;
    let n = 0;
    for (let i = 0; i < c.length; i += 8) n += c[i];
    return n / (c.length / 8);
  }

  markExplored(tx: number, ty: number): void {
    if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) return;
    const k = (ty >> 5) * this.cps + (tx >> 5);
    let c = this.seen.get(k);
    if (!c) this.seen.set(k, (c = new Uint8Array(CH * CH)));
    c[((ty & 31) << 5) | (tx & 31)] = 1;
  }

  /** Reveals a disc for exploration only (Treasure Sense, map pings). */
  explore(x: number, y: number, r: number): void {
    for (let ty = Math.floor(y - r); ty <= y + r; ty++) {
      for (let tx = Math.floor(x - r); tx <= x + r; tx++) if ((tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2 <= r * r) this.markExplored(tx, ty);
    }
    this.version++;
  }

  /** Recomputes sight: every (x, y, r) disc is in view (and becomes explored). */
  update(cx: number, cy: number, discs: { x: number; y: number; r: number }[]): void {
    this.ox = Math.floor(cx) - Fog.W / 2;
    this.oy = Math.floor(cy) - Fog.W / 2;
    this.vis.fill(0);
    const cps = this.cps;
    for (const d of discs) {
      const r2 = d.r * d.r;
      for (let ty = Math.floor(d.y - d.r); ty <= d.y + d.r; ty++) {
        const wy = ty - this.oy;
        if (wy < 0 || wy >= Fog.W || ty < 0 || ty >= this.size) continue;
        const dy = ty + 0.5 - d.y;
        const half = Math.sqrt(Math.max(0, r2 - dy * dy));
        const x0 = Math.max(Math.ceil(d.x - half - 0.5), this.ox, 0), x1 = Math.min(Math.floor(d.x + half - 0.5), this.ox + Fog.W - 1, this.size - 1);
        if (x1 < x0) continue;
        this.vis.fill(1, wy * Fog.W + (x0 - this.ox), wy * Fog.W + (x1 - this.ox) + 1);
        // Explored, a chunk-row run at a time.
        let tx = x0;
        while (tx <= x1) {
          const k = (ty >> 5) * cps + (tx >> 5);
          let c = this.seen.get(k);
          if (!c) this.seen.set(k, (c = new Uint8Array(CH * CH)));
          const end = Math.min(x1, (tx | 31));
          const row = (ty & 31) << 5;
          c.fill(1, row + (tx & 31), row + (end & 31) + 1);
          tx = end + 1;
        }
      }
    }
    this.version++;
  }

  /** Explored bits as [chunk index, base64 bitmask] pairs. */
  serialize(): [number, string][] {
    const out: [number, string][] = [];
    for (const [k, c] of this.seen) {
      const bytes = new Uint8Array(c.length / 8);
      for (let i = 0; i < c.length; i++) if (c[i]) bytes[i >> 3] |= 1 << (i & 7);
      out.push([k, btoa(String.fromCharCode(...bytes))]);
    }
    return out;
  }

  load(data: [number, string][]): void {
    this.seen.clear();
    for (const [k, b] of data) {
      try {
        const bin = atob(b);
        const c = new Uint8Array(CH * CH);
        for (let i = 0; i < c.length; i++) c[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
        this.seen.set(k, c);
      } catch {
        /* ignore corrupt fog */
      }
    }
    this.version++;
  }
}
