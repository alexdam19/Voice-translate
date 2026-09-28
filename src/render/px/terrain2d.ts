import { CH, OBS, OBS_COLOR, TER, TERRAIN, type GameMap } from '../../shared/map';
import { hash2, rgb, type RGB } from './pixels';

/**
 * The ground as pixel art, one pixel per metre tile, baked in 128 m blocks: terrain with its own texture (dune
 * ripples, deck plating, water glints, lava crust), obstacles bevelled against a sun in the north-west, and the
 * shadows they cast to the south-east (taller things throw longer shadows). Blocks are drawn scaled by the view;
 * far-out zooms use half- and quarter-size copies so the ground doesn't shimmer.
 */

export const BLOCK = 128;
const PAD = 14;
const CPB = BLOCK / CH;

interface Block {
  lod: (HTMLCanvasElement | null)[];
  used: number;
}

const TER_RGB: RGB[] = TERRAIN.map((t) => rgb(t.color));
const OBS_RGB: RGB[] = OBS_COLOR.map((c) => (c ? rgb(c) : [0, 0, 0]));

const PROP_RGB: Record<string, RGB> = {
  deadtree: rgb('#4a3a2c'), barrel: rgb('#b0662a'), sign: rgb('#b09060'), crate: rgb('#a07a44'), wreckcar: rgb('#6e5e54'), bones: rgb('#e4dcc4'),
  skull: rgb('#f2ecdc'), pipe: rgb('#7a7c80'), spike: rgb('#3e3636'), crystal: rgb('#8ae6ff'), cactus: rgb('#4e8e3c'), mushroom: rgb('#b464c8'), antenna: rgb('#9a9ca0'),
};

export class Terrain2D {
  private blocks = new Map<number, Block>();
  private tick = 0;
  private ter = new Uint8Array((BLOCK + PAD + 1) ** 2);
  private obs = new Uint8Array((BLOCK + PAD + 1) ** 2);
  private oh = new Uint8Array((BLOCK + PAD + 1) ** 2);
  private img: ImageData | null = null;
  /** Blocks built this frame (building is spread over frames). */
  private built = 0;

  constructor(private map: GameMap) {}

  setMap(map: GameMap): void {
    this.map = map;
    this.blocks.clear();
  }

  private key(bx: number, by: number): number {
    return by * 4096 + bx;
  }

  /** A map chunk changed (something was crushed): rebuild its block, and the one that takes its shadows. */
  invalidate(cx: number, cy: number): void {
    const bx = Math.floor(cx / CPB), by = Math.floor(cy / CPB);
    this.blocks.delete(this.key(bx, by));
    if ((cx + 1) % CPB === 0) this.blocks.delete(this.key(bx + 1, by));
    if ((cy + 1) % CPB === 0) this.blocks.delete(this.key(bx, by + 1));
  }

  beginFrame(): void {
    this.built = 0;
    this.tick++;
    // Forget blocks nobody has drawn for a while.
    if (this.blocks.size > 900) {
      for (const [k, b] of this.blocks) if (this.tick - b.used > 300) this.blocks.delete(k);
    }
  }

  /** The block's image at a level of detail (0 = 1 px per tile, 1 = half, 2 = quarter), or null if not ready. */
  get(bx: number, by: number, lod: number, budget: number): HTMLCanvasElement | null {
    const k = this.key(bx, by);
    let b = this.blocks.get(k);
    if (!b) {
      if (this.built >= budget) return null;
      this.built++;
      b = { lod: [this.build(bx, by), null, null], used: this.tick };
      this.blocks.set(k, b);
    }
    b.used = this.tick;
    if (lod > 0 && !b.lod[lod]) {
      const src = b.lod[lod - 1] ?? b.lod[0]!;
      const s = BLOCK >> lod;
      const c = document.createElement('canvas');
      c.width = s;
      c.height = s;
      const x = c.getContext('2d')!;
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'medium';
      x.drawImage(src, 0, 0, s, s);
      b.lod[lod] = c;
    }
    return b.lod[lod] ?? b.lod[0];
  }

  /** Copies the tiles of a block (plus a margin up and to the left for shadows) out of the map. */
  private read(x0: number, y0: number): void {
    const W = BLOCK + PAD + 1;
    const m = this.map;
    for (let ly = 0; ly < W; ly++) {
      const ty = y0 - PAD + ly;
      for (let lx = 0; lx < W; ) {
        const tx = x0 - PAD + lx;
        const i = ly * W + lx;
        if (!m.inside(tx, ty)) {
          this.ter[i] = TER.BASALT;
          this.obs[i] = OBS.CLIFF;
          this.oh[i] = 40;
          lx++;
          continue;
        }
        // Copy a run of tiles from the chunk they sit in.
        const c = m.chunk(tx >> 5, ty >> 5);
        const run = Math.min(W - lx, CH - (tx & 31));
        const base = ((ty & 31) << 5) | (tx & 31);
        for (let k = 0; k < run; k++) {
          this.ter[i + k] = c.ter[base + k];
          this.obs[i + k] = c.obs[base + k];
          this.oh[i + k] = c.oh[base + k];
        }
        lx += run;
      }
    }
  }

  private build(bx: number, by: number): HTMLCanvasElement {
    const x0 = bx * BLOCK, y0 = by * BLOCK;
    this.read(x0, y0);
    const W = BLOCK + PAD + 1;
    if (!this.img) this.img = new ImageData(BLOCK, BLOCK);
    const d = this.img.data;
    const ter = this.ter, obs = this.obs, oh = this.oh;
    for (let y = 0; y < BLOCK; y++) {
      for (let x = 0; x < BLOCK; x++) {
        const i = (y + PAD) * W + x + PAD;
        const tx = x0 + x, ty = y0 + y;
        const t = ter[i];
        const o = obs[i];
        let r: number, g: number, b: number;
        const n = hash2(tx, ty);
        const patch = hash2(tx >> 3, ty >> 3, 7) - 0.5;
        if (o) {
          // Obstacles: lit from the north-west, darker on the south-east faces; tall ones read as roofs.
          const c = OBS_RGB[o];
          const h = oh[i];
          let k = 1 + (n - 0.5) * 0.12 + Math.min(0.25, h * 0.004);
          const nw = obs[i - W - 1], se = obs[i + W + 1];
          if (!nw || oh[i - W - 1] + 2 < h) k += 0.28;
          else if (!se || oh[i + W + 1] + 2 < h) k -= 0.3;
          if (o === OBS.TREE) {
            const edge = !obs[i - 1] || !obs[i + 1] || !obs[i - W] || !obs[i + W];
            k = edge ? 0.8 : 1.05 + n * 0.3;
          } else if ((o === OBS.WALL || o === OBS.RUIN || o === OBS.PILLAR) && h >= 16) {
            // Building roofs: vents and panel seams.
            if ((tx % 7 === 0 || ty % 9 === 0) && k < 1.2) k -= 0.1;
            if (n > 0.97) k += 0.35;
          }
          r = c[0] * k;
          g = c[1] * k;
          b = c[2] * k;
        } else {
          const c = TER_RGB[t] ?? TER_RGB[0];
          let k = 1 + (n - 0.5) * 0.1 + patch * 0.08;
          switch (t) {
            case TER.DUNE:
              k += Math.sin(tx * 0.55 + ty * 0.22 + Math.sin(ty * 0.05) * 2) * 0.07;
              break;
            case TER.SAND:
              k += Math.sin(tx * 0.3 + ty * 0.12) * 0.03;
              break;
            case TER.METAL:
              if (tx % 10 === 0 || ty % 10 === 0) k -= 0.14;
              else if ((tx % 10 === 1 && ty % 10 === 1) || (tx % 10 === 9 && ty % 10 === 9)) k += 0.2;
              break;
            case TER.CONCRETE:
              if (tx % 8 === 0 || ty % 8 === 0) k -= 0.1;
              if (n > 0.985) k -= 0.25;
              break;
            case TER.ROAD:
              k -= 0.04;
              if (n > 0.97) k -= 0.15;
              else if (n < 0.012) k += 0.35;
              break;
            case TER.WATER:
            case TER.ACID:
              k += (n > 0.94 ? 0.3 : 0) + Math.sin(tx * 0.4 - ty * 0.3) * 0.05;
              break;
            case TER.LAVA:
              k += n > 0.8 ? 0.35 : n < 0.25 ? -0.45 : 0;
              break;
            case TER.SNOW:
              k += n > 0.93 ? -0.08 : 0.02;
              break;
            case TER.ICE:
              k += Math.sin((tx + ty) * 0.5) * 0.05 + (n > 0.96 ? 0.2 : 0);
              break;
            case TER.GRASS:
              k += n > 0.8 ? -0.18 : n < 0.08 ? 0.15 : 0;
              break;
          }
          r = c[0] * k;
          g = c[1] * k;
          b = c[2] * k;
          // Shadows from anything tall up-sun (north-west).
          for (let s = 1; s <= PAD - 1; s++) {
            const j = i - s * W - Math.round(s * 0.8);
            const o2 = obs[j];
            if (o2 && oh[j] * 0.5 * 0.55 >= s) {
              r *= 0.62;
              g *= 0.62;
              b *= 0.68;
              break;
            }
          }
        }
        const p = (y * BLOCK + x) * 4;
        d[p] = r > 255 ? 255 : r;
        d[p + 1] = g > 255 ? 255 : g;
        d[p + 2] = b > 255 ? 255 : b;
        d[p + 3] = 255;
      }
    }
    // Props: a few pixels each.
    for (let cy = 0; cy < CPB; cy++) {
      for (let cx = 0; cx < CPB; cx++) {
        const c = this.map.peek(bx * CPB + cx, by * CPB + cy);
        if (!c) continue;
        for (const pr of c.props) {
          if (pr.gone) continue;
          const col = PROP_RGB[pr.kind];
          if (!col) continue;
          const px = Math.floor(pr.x) - x0, py = Math.floor(pr.y) - y0;
          // Nothing lying about on roads and plating (the hangar floor and its apron are swept).
          if (px >= 0 && py >= 0 && px < BLOCK && py < BLOCK) {
            const t = this.ter[(py + PAD) * (BLOCK + PAD + 1) + px + PAD];
            if (t === TER.ROAD || t === TER.METAL || t === TER.CONCRETE) continue;
          }
          const s = Math.max(1, Math.round(pr.s * (pr.kind === 'wreckcar' ? 2.2 : pr.kind === 'deadtree' || pr.kind === 'cactus' ? 1.4 : 1)));
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s + (pr.kind === 'wreckcar' || pr.kind === 'pipe' ? s : 0); dx++) {
              const qx = px + dx, qy = py + dy;
              if (qx < 0 || qy < 0 || qx >= BLOCK || qy >= BLOCK) continue;
              const q = (qy * BLOCK + qx) * 4;
              const k = dx === 0 || dy === 0 ? 1.15 : 0.9;
              d[q] = Math.min(255, col[0] * k);
              d[q + 1] = Math.min(255, col[1] * k);
              d[q + 2] = Math.min(255, col[2] * k);
            }
          }
        }
      }
    }
    const out = document.createElement('canvas');
    out.width = BLOCK;
    out.height = BLOCK;
    out.getContext('2d')!.putImageData(this.img, 0, 0);
    return out;
  }
}
