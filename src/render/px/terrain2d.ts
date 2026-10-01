import { CH, OBS, OBS_COLOR, TER, TERRAIN, ZONE, type GameMap, type MapChunk, type Prop } from '../../shared/map';
import { hash2, rgb, type RGB } from './pixels';
import { paintBuildings } from './buildingArt';
import { GROUND, loadWorldArt, NATURE, PROPS, propShare, type AtlasSprite } from './worldArt';

/**
 * The ground as pixel art, one pixel per metre tile, baked in 128 m blocks and seen in a slight 3/4 view:
 *
 *  - every ground type has its own texture (dune ripples, grass tufts and flowers, snow sparkle, ice cracks,
 *    lava crust, deck plating, cracked asphalt...) and rolls in low hills lit by a sun in the north-west;
 *  - cliffs, rocks, walls and buildings show their roofs bevelled against that sun and their south faces as
 *    walls (strata on rock, panels and lit windows on buildings), taller things taller;
 *  - they cast shadows to the south-east, darken the ground at their feet, and water gets a shoreline.
 *
 * Blocks are drawn scaled by the view; far-out zooms use half- and quarter-size copies so nothing shimmers.
 */

export const BLOCK = 128;
/** Margin read around a block: walls and shadows reach in from the north and west. */
const PAD = 16;
const W = BLOCK + PAD + 2;
const CPB = BLOCK / CH;

interface Block {
  lod: (HTMLCanvasElement | null)[];
  used: number;
  /** Baked colours and what's on each tile (with a one-tile border), for the high-resolution versions. */
  px: Uint8ClampedArray;
  tb: Uint8Array;
  ob: Uint8Array;
  /** High-resolution copies: 2 and 4 pixels per tile. */
  hd2: HTMLCanvasElement | null;
  hd4: HTMLCanvasElement | null;
  hdUsed: number;
  /** Something on it was crushed: redraw it when the frame has time (the old picture shows until then). */
  stale?: boolean;
  hdStale?: boolean;
}

/** How much each ground's colour varies pixel to pixel at high resolution. */
const GRAIN: number[] = [];
for (let i = 0; i < 24; i++) GRAIN[i] = 0.1;
GRAIN[TER.SAND] = 0.07;
GRAIN[TER.DUNE] = 0.06;
GRAIN[TER.SNOW] = 0.04;
GRAIN[TER.ICE] = 0.05;
GRAIN[TER.GRASS] = 0.2;
GRAIN[TER.MUD] = 0.12;
GRAIN[TER.ROAD] = 0.12;
GRAIN[TER.CONCRETE] = 0.09;
GRAIN[TER.METAL] = 0.06;
GRAIN[TER.WATER] = 0.05;
GRAIN[TER.LAVA] = 0.16;
GRAIN[TER.ASH] = 0.14;
GRAIN[TER.BASALT] = 0.16;

const TER_RGB: RGB[] = TERRAIN.map((t) => rgb(t.color));
const OBS_RGB: RGB[] = OBS_COLOR.map((c) => (c ? rgb(c) : [0, 0, 0]));

/** How much each ground rolls (hill shading). */
const RELIEF: number[] = [];
RELIEF[TER.DUNE] = 2.6;
RELIEF[TER.SAND] = 1.3;
RELIEF[TER.SNOW] = 1.8;
RELIEF[TER.ICE] = 0.7;
RELIEF[TER.ASH] = 1.2;
RELIEF[TER.BASALT] = 1.6;
RELIEF[TER.DIRT] = 1.1;
RELIEF[TER.RUST] = 1.1;
RELIEF[TER.GRASS] = 1.1;
RELIEF[TER.CRATER] = 1.5;
RELIEF[TER.MUD] = 0.5;
RELIEF[TER.GLASS] = 0.9;
RELIEF[TER.CAMP] = 0.6;

const PROP: Record<string, { c: RGB; hi: RGB; w: number; h: number }> = {
  deadtree: { c: rgb('#4a3a2c'), hi: rgb('#6e5842'), w: 1, h: 3 },
  barrel: { c: rgb('#a8551e'), hi: rgb('#e08a3a'), w: 1, h: 1 },
  sign: { c: rgb('#9a7a4a'), hi: rgb('#d0b080'), w: 2, h: 1 },
  crate: { c: rgb('#8a6434'), hi: rgb('#c49a5a'), w: 2, h: 2 },
  wreckcar: { c: rgb('#5e4e44'), hi: rgb('#8a7a6c'), w: 4, h: 2 },
  bones: { c: rgb('#cfc6ac'), hi: rgb('#f4eedc'), w: 2, h: 1 },
  skull: { c: rgb('#e2dccb'), hi: rgb('#ffffff'), w: 1, h: 1 },
  pipe: { c: rgb('#63666b'), hi: rgb('#9ea2a8'), w: 4, h: 1 },
  spike: { c: rgb('#2e2828'), hi: rgb('#5a5050'), w: 1, h: 2 },
  crystal: { c: rgb('#3fb6e0'), hi: rgb('#c8f6ff'), w: 1, h: 2 },
  cactus: { c: rgb('#3a7a30'), hi: rgb('#6ab85a'), w: 1, h: 3 },
  mushroom: { c: rgb('#8a3ca0'), hi: rgb('#e08ef0'), w: 2, h: 2 },
  antenna: { c: rgb('#7a7c80'), hi: rgb('#cfd2d6'), w: 1, h: 3 },
};

/** Props that stand on made ground (roads, decks, pavement) were cleared away. */
const onPavement = (t: number): boolean => t === TER.ROAD || t === TER.METAL || t === TER.CONCRETE;

/**
 * A prop's sprite (its kind and variant, snowed on over snow and ice), or '' to leave it as a few pixels of debris:
 * only a share of props get one, fewer the bigger the sprite.
 */
function propSpriteName(pr: Prop, t: number): string {
  let name = `${pr.kind}${pr.v & 3}`;
  if (!PROPS.has(name)) name = `${pr.kind}0`;
  if (!PROPS.has(name) || hash2(Math.floor(pr.x * 8), Math.floor(pr.y * 8), 97) >= propShare(name)) return '';
  if ((t === TER.SNOW || t === TER.ICE) && PROPS.has(`${name}s`)) return `${name}s`;
  return name;
}

/** A tree crown for a tree tile: broadleaf over grass (bushes in the hedgerows), snowy pines, conifers elsewhere. */
export function crownName(t: number, oh: number, h: number): string {
  if (t === TER.SNOW || t === TER.ICE) return h < 0.5 ? 'pine0s' : 'pine1s';
  if (t !== TER.GRASS) return h < 0.4 ? 'pine0' : h < 0.75 ? 'pine1' : 'bush0';
  if (oh < 8) return h < 0.45 ? 'bush0' : h < 0.62 ? 'bush1' : h < 0.95 ? 'oak1' : 'autumn1';
  return h < 0.3 ? 'oak0' : h < 0.55 ? 'oak2' : h < 0.74 ? 'oak1' : h < 0.9 ? 'birch0' : h < 0.96 ? 'autumn0' : 'autumn1';
}

/** A boulder in the stone of its country (or of the ground under it). */
export function boulderName(t: number, zone: number, h: number): string {
  const stone =
    zone === ZONE.DUNES || zone === ZONE.PASS || t === TER.SAND || t === TER.DUNE ? 'sandstone'
    : zone === ZONE.ASH || zone === ZONE.SCORCHED || zone === ZONE.SPIRES || t === TER.BASALT || t === TER.LAVA ? 'basalt'
    : zone === ZONE.FROST || t === TER.SNOW || t === TER.ICE ? 'ice'
    : 'rock';
  return `boulder_${stone}${Math.floor(h * 3)}`;
}
/** How many boulders get a sprite (the rest stay small rocks baked into the ground). */
const BOULDER_SHARE = 0.2;

/**
 * Ground details by the ground they grow on: [family, share of tiles]. Tone details lighten and darken the soil
 * under them, colour ones are pasted.
 */
export const DETAILS: Partial<Record<number, [string, number][]>> = {
  [TER.GRASS]: [['t_tuft', 0.07], ['c_flower', 0.008]],
  [TER.DIRT]: [['t_pebble', 0.025], ['t_crack', 0.01], ['c_weed', 0.015], ['t_tuft', 0.012]],
  [TER.RUST]: [['t_pebble', 0.025], ['t_crack', 0.014]],
  [TER.CAMP]: [['t_pebble', 0.02], ['t_rubble', 0.008]],
  [TER.SAND]: [['t_ripple', 0.008], ['t_pebble', 0.008], ['c_weed', 0.005], ['c_bonebit', 0.002]],
  [TER.DUNE]: [['t_ripple', 0.01], ['c_bonebit', 0.0015]],
  [TER.SNOW]: [['t_drift', 0.01], ['t_pebble', 0.003]],
  [TER.ICE]: [['t_crack', 0.015]],
  [TER.ASH]: [['c_ember', 0.008], ['t_pebble', 0.015], ['t_scorch', 0.002], ['c_bonebit', 0.003]],
  [TER.BASALT]: [['t_pebble', 0.04], ['t_crack', 0.008]],
  [TER.CRATER]: [['t_scorch', 0.003], ['t_pebble', 0.025], ['t_rubble', 0.005]],
  [TER.MUD]: [['t_puddle', 0.012], ['t_tuft', 0.008]],
  [TER.ROAD]: [['t_crack', 0.015], ['t_oil', 0.003], ['t_rubble', 0.004]],
  [TER.CONCRETE]: [['t_crack', 0.015], ['t_rubble', 0.008]],
  [TER.GLASS]: [['c_shard', 0.03]],
};
const DETAIL_MAX = 0.08;

/** How much a tone pixel lightens or darkens the ground: mid grey leaves it, black halves it, white brightens it. */
const TONE = new Float32Array(256);
for (let l = 0; l < 256; l++) TONE[l] = l < 100 ? 0.45 + 0.55 * (l / 100) : 1 + ((l - 100) / 155) * 0.55;

/** The ground under a prop (it lives in the chunk that holds its tile). */
function terUnder(c: MapChunk, pr: Prop): number {
  return c.ter[(Math.floor(pr.y) - c.cy * CH) * CH + Math.floor(pr.x) - c.cx * CH];
}

/**
 * A field in the green country: ploughed earth in furrows (dark trough, lit ridge) or standing wheat in rows, the
 * furrows running one way or the other field to field (by the 70 x 50 m field grid).
 */
function fieldColour(t: number, tx: number, ty: number, r: number, g: number, b: number, n: number): [number, number, number] {
  const along = hash2(Math.floor(tx / 70), Math.floor(ty / 50), 61) < 0.5;
  const row = ((along ? ty : tx) % 3 + 3) % 3;
  if (t === TER.DIRT) {
    const k = row === 0 ? 0.74 : row === 1 ? 1.08 : 0.96;
    return [r * k, g * k, b * k];
  }
  // Wheat: gold heads over the stalks, a darker gap between rows, the odd poppy.
  if (n > 0.995) return [210, 60, 40];
  const w = vnoise(tx, ty, 6, 23);
  const base: [number, number, number] = [196 + w * 30, 164 + w * 26, 78 + w * 10];
  const k = row === 0 ? 0.78 : row === 1 ? 1.06 : 0.98;
  return [base[0] * k, base[1] * k, base[2] * k];
}

/** Smooth value noise (0..1) on a grid of `cell` tiles. */
export function vnoise(x: number, y: number, cell: number, seed: number): number {
  const fx0 = x / cell, fy0 = y / cell;
  const gx = Math.floor(fx0), gy = Math.floor(fy0);
  const fx = fx0 - gx, fy = fy0 - gy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(gx, gy, seed), b = hash2(gx + 1, gy, seed), c = hash2(gx, gy + 1, seed), d = hash2(gx + 1, gy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const isBuilding = (o: number): boolean => o === OBS.WALL || o === OBS.RUIN || o === OBS.PILLAR || o === OBS.WRECK;

/** A block of ground for the cab's 3D view (see Terrain2D.ground3D). */
export interface Ground3D {
  canvas: HTMLCanvasElement;
  /** Surface heights (m) at the tile corners, (BLOCK + 1) square. */
  h: Float32Array;
  ter: Uint8Array;
  obs: Uint8Array;
  /** Obstacle heights (half-metres). */
  oh: Uint8Array;
  zone: Uint8Array;
}

/** Obstacles the 3D view raises into the ground itself (the rest it builds as things standing on it). */
const RAISED: boolean[] = [];
for (const o of [OBS.ROCK, OBS.SANDSTONE, OBS.BASALT, OBS.CLIFF, OBS.WRECK, OBS.WALL, OBS.RUIN, OBS.BASTION, OBS.STRUCT]) RAISED[o] = true;
/** Made things: raised square-edged (unless the 3D view builds them as buildings). */
export const SHARP: boolean[] = [];
for (const o of [OBS.WALL, OBS.RUIN, OBS.BASTION, OBS.STRUCT, OBS.WRECK]) SHARP[o] = true;
const CORNER: [number, number][] = [[-1, -1], [0, -1], [-1, 0], [0, 0]];

/** Height of the open ground (m) at a point: the rolling hills of the hill shading, made real for the 3D view. */
export function groundLevel(x: number, y: number): number {
  return (vnoise(x, y, 150, 10) * 7 + vnoise(x, y, 46, 11) * 3 + vnoise(x, y, 15, 12) * 1.1) * 0.8;
}
const isLiquid = (t: number): boolean => t === TER.WATER || t === TER.ACID || t === TER.LAVA;

export class Terrain2D {
  private blocks = new Map<number, Block>();
  private tick = 0;
  private ter = new Uint8Array(W * W);
  private obs = new Uint8Array(W * W);
  private oh = new Uint8Array(W * W);
  private zn = new Uint8Array(W * W);
  private hgt = new Float32Array(W * W);
  private img: ImageData | null = null;
  /** Blocks built this frame (building is spread over frames). */
  private built = 0;
  private builtHD = 0;
  private hdCount = 0;

  constructor(private map: GameMap) {
    // The prop sprites come from an image: once it's in, redraw the close-up ground with them.
    loadWorldArt(() => {
      for (const b of this.blocks.values()) if (b.hd2 || b.hd4) b.hdStale = true;
    });
  }

  setMap(map: GameMap): void {
    this.map = map;
    this.blocks.clear();
  }

  private key(bx: number, by: number): number {
    return by * 4096 + bx;
  }

  /** A map chunk changed (something was crushed): rebuild its block, and the ones its walls and shadows reach. */
  invalidate(cx: number, cy: number): void {
    const bx = Math.floor(cx / CPB), by = Math.floor(cy / CPB);
    // A Titan at speed crushes something every frame: mark the blocks and redraw a couple a frame rather than all of
    // them at once.
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) {
      const b = this.blocks.get(this.key(bx + dx, by + dy));
      if (b) b.stale = true;
    }
  }

  beginFrame(): void {
    this.built = 0;
    this.builtHD = 0;
    this.tick++;
    // High-resolution copies are big: keep only the ones in use lately.
    if (this.hdCount > 48) {
      for (const b of this.blocks.values()) if ((b.hd2 || b.hd4) && this.tick - b.hdUsed > 90) {
        b.hd2 = b.hd4 = null;
        this.hdCount--;
      }
    }
    // Forget blocks nobody has drawn for a while.
    if (this.blocks.size > 700) {
      for (const [k, b] of this.blocks) if (this.tick - b.used > 240) this.blocks.delete(k);
    }
  }

  /** The block's image at a level of detail (0 = 1 px per tile, 1 = half, 2 = quarter), or null if not ready. */
  get(bx: number, by: number, lod: number, budget: number): HTMLCanvasElement | null {
    const k = this.key(bx, by);
    let b = this.blocks.get(k);
    if (!b) {
      if (this.built >= budget) return null;
      this.built++;
      const built = this.build(bx, by);
      b = { lod: [built.canvas, null, null], used: this.tick, px: built.px, tb: built.tb, ob: built.ob, hd2: null, hd4: null, hdUsed: 0 };
      this.blocks.set(k, b);
    } else if (b.stale && this.built < Math.min(budget, 1)) {
      this.built++;
      const built = this.build(bx, by);
      b.lod = [built.canvas, null, null];
      b.px = built.px;
      b.tb = built.tb;
      b.ob = built.ob;
      b.stale = false;
      b.hdStale = true;
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

  /** Copies the tiles of a block (plus the margin) out of the map. */
  private read(x0: number, y0: number): void {
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
          this.zn[i] = ZONE.EDGE;
          lx++;
          continue;
        }
        const c = m.chunk(tx >> 5, ty >> 5);
        const run = Math.min(W - lx, CH - (tx & 31));
        const base = ((ty & 31) << 5) | (tx & 31);
        for (let k = 0; k < run; k++) {
          this.ter[i + k] = c.ter[base + k];
          this.zn[i + k] = c.zone[base + k];
          this.obs[i + k] = c.obs[base + k];
          this.oh[i + k] = c.oh[base + k];
        }
        lx += run;
      }
    }
    // Rolling ground: broad hills, then three finer octaves of smooth noise.
    for (let ly = 0; ly < W; ly++) {
      const ty = y0 - PAD + ly;
      for (let lx = 0; lx < W; lx++) {
        const tx = x0 - PAD + lx;
        this.hgt[ly * W + lx] = vnoise(tx, ty, 150, 10) * 7 + vnoise(tx, ty, 46, 11) * 3 + vnoise(tx, ty, 15, 12) * 1.1 + vnoise(tx, ty, 5, 13) * 0.35;
      }
    }
  }

  /** A stretch of ground (world tiles) drawn flat: no faces or shadows (its buildings stand up on their own). */
  flat: { x0: number; y0: number; x1: number; y1: number } | null = null;

  /** How many tiles of south-facing wall an obstacle shows. */
  private wallLen(i: number): number {
    const o = this.obs[i];
    if (!o || o === OBS.TREE || o === OBS.FUNGUS) return 0;
    return Math.min(PAD - 2, Math.round(this.oh[i] * 0.5 * 0.3));
  }

  /** The block at 2 or 4 pixels a tile: its colours with fine grain, dithered edges between grounds and bevelled rocks. */
  getHD(bx: number, by: number, f: 2 | 4, budget: number): HTMLCanvasElement | null {
    const b = this.blocks.get(this.key(bx, by));
    if (!b) return null;
    b.used = this.tick;
    b.hdUsed = this.tick;
    const have = f === 4 ? b.hd4 : b.hd2;
    if (have && !b.hdStale) return have;
    if (this.builtHD >= (have ? Math.min(budget, 1) : budget)) return have;
    this.builtHD++;
    const c = this.buildHD(b, bx, by, f);
    const before = (b.hd2 ? 1 : 0) + (b.hd4 ? 1 : 0);
    // Redrawn after a crush: the other resolution is out of date too.
    if (have) b.hd2 = b.hd4 = null;
    if (f === 4) b.hd4 = c;
    else b.hd2 = c;
    b.hdStale = false;
    this.hdCount += (b.hd2 ? 1 : 0) + (b.hd4 ? 1 : 0) - before;
    return c;
  }

  private buildHD(b: Block, bx: number, by: number, f: number): HTMLCanvasElement {
    const S = BLOCK * f;
    const img = this.upscale(b.px, b.tb, b.ob, bx, by, f);
    const out = document.createElement('canvas');
    out.width = S;
    out.height = S;
    const ctx = out.getContext('2d')!;
    ctx.putImageData(img, 0, 0);
    paintBuildings(ctx, this.map, bx * BLOCK, by * BLOCK, BLOCK, f);
    this.stampDebris(ctx, bx, by, f);
    this.stampSprites(ctx, bx, by, f);
    return out;
  }

  /** A block's tile colours blown up to `f` pixels a tile: smooth within a ground, crisp and dithered between. */
  private upscale(px: Uint8ClampedArray, tb: Uint8Array, ob: Uint8Array, bx: number, by: number, f: number): ImageData {
    const S = BLOCK * f;
    const img = new ImageData(S, S);
    const d = img.data;
    const B2 = BLOCK + 2;
    const gx0 = bx * BLOCK * f, gy0 = by * BLOCK * f;
    for (let ty = 0; ty < BLOCK; ty++) {
      for (let tx = 0; tx < BLOCK; tx++) {
        const i = (ty * BLOCK + tx) * 4;
        const r0 = px[i];
        const j = (ty + 1) * B2 + tx + 1;
        const t = tb[j], o = ob[j];
        const amp = o ? 0.16 : GRAIN[t] ?? 0.1;
        const nb = (dx: number, dy: number): number => {
          const x = tx + dx, y = ty + dy;
          return x < 0 || y < 0 || x >= BLOCK || y >= BLOCK ? i : (y * BLOCK + x) * 4;
        };
        const iL = nb(-1, 0), iR = nb(1, 0), iU = nb(0, -1), iD = nb(0, 1);
        const oU = ob[j - B2], oD = ob[j + B2], oL = ob[j - 1], oR = ob[j + 1];
        for (let sy = 0; sy < f; sy++) {
          for (let sx = 0; sx < f; sx++) {
            const gx = gx0 + tx * f + sx, gy = gy0 + ty * f + sy;
            const hh = hash2(gx, gy, 71);
            // Within one kind of open ground the colour flows smoothly from tile to tile (bilinear); where
            // grounds meet, or at rocks and walls, the edge stays crisp and dithers.
            const ux = (sx + 0.5) / f - 0.5, uy = (sy + 0.5) / f - 0.5;
            const nx = ux < 0 ? -1 : 1, ny = uy < 0 ? -1 : 1;
            const jx = j + nx, jy = j + ny * B2, jxy = jy + nx;
            let r: number, gg: number, bb: number;
            if (!o && !ob[jx] && !ob[jy] && !ob[jxy] && tb[jx] === t && tb[jy] === t && tb[jxy] === t) {
              const ix = nb(nx, 0), iy = nb(0, ny), ixy = nb(nx, ny);
              const wx = Math.abs(ux), wy = Math.abs(uy);
              const w0 = (1 - wx) * (1 - wy), w1 = wx * (1 - wy), w2 = (1 - wx) * wy, w3 = wx * wy;
              r = px[i] * w0 + px[ix] * w1 + px[iy] * w2 + px[ixy] * w3;
              gg = px[i + 1] * w0 + px[ix + 1] * w1 + px[iy + 1] * w2 + px[ixy + 1] * w3;
              bb = px[i + 2] * w0 + px[ix + 2] * w1 + px[iy + 2] * w2 + px[ixy + 2] * w3;
            } else {
              let src = i;
              if (hh < 0.4) {
                if (sx === 0 && px[iL] !== r0) src = iL;
                else if (sx === f - 1 && px[iR] !== r0) src = iR;
                else if (sy === 0 && px[iU] !== r0) src = iU;
                else if (sy === f - 1 && px[iD] !== r0) src = iD;
              }
              r = px[src];
              gg = px[src + 1];
              bb = px[src + 2];
            }
            let k = 1 + (hh - 0.5) * amp * 1.6;
            if (o) {
              // Rock and roof tops: bevelled edges catch the light or fall into shadow.
              if (sy === 0 && !oU) k *= 1.22;
              else if (sy === f - 1 && !oD) k *= 0.7;
              if (sx === 0 && !oL) k *= 1.1;
              else if (sx === f - 1 && !oR) k *= 0.84;
              k *= 0.92 + 0.16 * hash2(gx >> 1, gy >> 1, 5);
            } else if (t === TER.DUNE || t === TER.SAND) k += Math.sin(gx * 0.45 + gy * 0.18 + Math.sin(gy * 0.02) * 3) * 0.045;
            else if (t === TER.GRASS && hh > 0.84) k *= 0.7;
            else if (t === TER.WATER && hh > 0.985) k += 0.35;
            else if (t === TER.SNOW && hh > 0.992) k += 0.2;
            else if ((t === TER.DIRT || t === TER.RUST || t === TER.ASH) && hh > 0.97) k *= 0.75;
            const q = ((ty * f + sy) * S + tx * f + sx) * 4;
            d[q] = r * k;
            d[q + 1] = gg * k;
            d[q + 2] = bb * k;
            d[q + 3] = 255;
          }
        }
      }
    }
    this.stampDetails(d, bx, by, f, tb, ob);
    return img;
  }

  /**
   * A block for the cab's 3D view: its ground at `f` pixels a metre without roofs, walls, trees or props (the 3D
   * view builds those as solid things standing on it), the heights of its surface at the tile corners (rolling
   * ground, rock and cliffs raised to their height, liquids sunk), and its tiles.
   */
  ground3D(bx: number, by: number, f: number, built: (tx: number, ty: number) => boolean): Ground3D {
    const x0 = bx * BLOCK, y0 = by * BLOCK;
    this.read(x0, y0);
    const { ter, obs, oh, zn } = this;
    const N = BLOCK, B2 = BLOCK + 2;
    const px = new Uint8ClampedArray(N * N * 4);
    const tb = new Uint8Array(B2 * B2), ob = new Uint8Array(B2 * B2);
    const T = new Uint8Array(N * N), O = new Uint8Array(N * N), OH = new Uint8Array(N * N), Z = new Uint8Array(N * N);
    const rock = (i: number, tx: number, ty: number): boolean => {
      const o = obs[i];
      return !!o && !!RAISED[o] && !(SHARP[o] && built(tx, ty));
    };
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = (y + PAD) * W + x + PAD;
        const tx = x0 + x, ty = y0 + y;
        const t = ter[i], o = obs[i];
        const q = y * N + x;
        T[q] = t;
        O[q] = o;
        OH[q] = oh[i];
        Z[q] = zn[i];
        const n = hash2(tx, ty);
        let r: number, g: number, b: number;
        if (rock(i, tx, ty) && !SHARP[o]) {
          const c = OBS_RGB[o];
          const k = 0.92 + (n - 0.5) * 0.18 + (vnoise(tx, ty, 3, 21) - 0.5) * 0.3;
          r = c[0] * k;
          g = c[1] * k;
          b = c[2] * k;
        } else {
          [r, g, b] = this.groundColour(t, tx, ty, n);
          if (zn[i] === ZONE.VERDANT && (t === TER.DIRT || t === TER.RUST)) [r, g, b] = fieldColour(t, tx, ty, r, g, b, n);
          const tn = ter[i - W], tw = ter[i - 1], ts = ter[i + W], te = ter[i + 1];
          if (isLiquid(t) && (!isLiquid(tn) || !isLiquid(tw) || !isLiquid(ts) || !isLiquid(te))) {
            const foam = t === TER.LAVA ? [60, 20, 10] : t === TER.ACID ? [200, 255, 170] : [210, 236, 240];
            r = r * 0.55 + foam[0] * 0.45;
            g = g * 0.55 + foam[1] * 0.45;
            b = b * 0.55 + foam[2] * 0.45;
          } else if (tn !== t || tw !== t || ts !== t || te !== t) {
            r *= 0.9;
            g *= 0.9;
            b *= 0.9;
          }
          // Darker at the foot of anything standing on the ground.
          if (obs[i - W] || obs[i - 1] || obs[i + 1] || obs[i + W]) {
            r *= 0.8;
            g *= 0.8;
            b *= 0.84;
          }
        }
        const l = r * 0.3 + g * 0.59 + b * 0.11;
        px[q * 4] = l + (r - l) * 1.12;
        px[q * 4 + 1] = l + (g - l) * 1.12;
        px[q * 4 + 2] = l + (b - l) * 1.12;
        px[q * 4 + 3] = 255;
      }
    }
    for (let y = 0; y < B2; y++) for (let x = 0; x < B2; x++) {
      const i = (y + PAD - 1) * W + x + PAD - 1;
      tb[y * B2 + x] = ter[i];
      ob[y * B2 + x] = rock(i, x0 + x - 1, y0 + y - 1) ? 1 : 0;
    }
    // Heights at the corners: the ground's roll, and what's raised on the four tiles round each corner.
    const H1 = N + 1;
    const h = new Float32Array(H1 * H1);
    for (let j = 0; j <= N; j++) {
      for (let i2 = 0; i2 <= N; i2++) {
        const tx = x0 + i2, ty = y0 + j;
        let mx = 0, sum = 0, sharp = false, wet = 0;
        for (const [dx, dy] of CORNER) {
          const q = (j + dy + PAD) * W + i2 + dx + PAD;
          if (isLiquid(ter[q])) wet++;
          if (!rock(q, tx + dx, ty + dy)) continue;
          const o = obs[q];
          const rz = oh[q] * 0.5 * (SHARP[o] ? 1 : 0.75 + 0.45 * vnoise(tx, ty, 4, 5));
          if (SHARP[o]) sharp = true;
          if (rz > mx) mx = rz;
          sum += rz;
        }
        h[j * H1 + i2] = groundLevel(tx, ty) + (sharp ? mx : (mx + sum / 4) / 2) - (wet ? 0.25 + wet * 0.2 : 0);
      }
    }
    const img = this.upscale(px, tb, ob, bx, by, f);
    const canvas = document.createElement('canvas');
    canvas.width = N * f;
    canvas.height = N * f;
    canvas.getContext('2d')!.putImageData(img, 0, 0);
    return { canvas, h, ter: T, obs: O, oh: OH, zone: Z };
  }

  /**
   * Scatters small details over a high-resolution block's open ground (tufts on grass, pebbles and cracks on dirt,
   * drifts on snow, embers in ash...), each tile's by its own hash so neighbouring blocks agree on the ones across
   * their edge. Tone details shade the soil under them; colour ones replace it.
   */
  private stampDetails(d: Uint8ClampedArray, bx: number, by: number, f: number, tb: Uint8Array, ob: Uint8Array): void {
    if (!GROUND.ready) return;
    const S = BLOCK * f, B2 = BLOCK + 2, M = 4;
    const x0 = bx * BLOCK, y0 = by * BLOCK;
    for (let ty = -M; ty < BLOCK + M; ty++) {
      for (let tx = -M; tx < BLOCK + M; tx++) {
        const wx = x0 + tx, wy = y0 + ty;
        const h = hash2(wx, wy, 131);
        if (h >= DETAIL_MAX) continue;
        const inner = tx >= -1 && ty >= -1 && tx <= BLOCK && ty <= BLOCK;
        const t = inner ? tb[(ty + 1) * B2 + tx + 1] : this.map.getTer(wx, wy);
        const list = DETAILS[t];
        if (!list) continue;
        if (inner ? ob[(ty + 1) * B2 + tx + 1] : this.map.getObs(wx, wy)) continue;
        let fam = '';
        let acc = 0;
        for (const [name, p] of list) {
          acc += p;
          if (h < acc) {
            fam = name;
            break;
          }
        }
        if (!fam) continue;
        const names = GROUND.family(fam);
        if (!names.length) continue;
        const px = GROUND.pixels(names[Math.floor(hash2(wx, wy, 137) * names.length)], f);
        if (!px) continue;
        const tone = fam.startsWith('t_');
        const ox = Math.round((tx + hash2(wx, wy, 139)) * f) - px.ax, oy = Math.round((ty + hash2(wx, wy, 141)) * f) - px.ay;
        const src = px.data;
        for (let yy = 0; yy < px.h; yy++) {
          const y = oy + yy;
          if (y < 0 || y >= S) continue;
          for (let xx = 0; xx < px.w; xx++) {
            const x = ox + xx;
            if (x < 0 || x >= S) continue;
            const i = (yy * px.w + xx) * 4;
            if (src[i + 3] < 128) continue;
            const q = (y * S + x) * 4;
            if (tone) {
              const k = TONE[(src[i] * 77 + src[i + 1] * 150 + src[i + 2] * 29) >> 8];
              d[q] *= k;
              d[q + 1] *= k;
              d[q + 2] *= k;
            } else {
              d[q] = src[i];
              d[q + 1] = src[i + 1];
              d[q + 2] = src[i + 2];
            }
          }
        }
      }
    }
  }

  /**
   * Stamps the sprites standing on a high-resolution block, with their shadows, south over north: the props, a tree
   * crown for every few metres of wood or hedgerow, a boulder on each boulder tile. Those just outside whose sprites
   * reach in are drawn too (the neighbouring block draws the rest).
   */
  private stampSprites(x: CanvasRenderingContext2D, bx: number, by: number, f: number): void {
    const x0 = bx * BLOCK, y0 = by * BLOCK, S = BLOCK * f;
    const list: { px: number; py: number; s: AtlasSprite }[] = [];
    const add = (wx: number, wy: number, s: AtlasSprite | null): void => {
      if (!s) return;
      const px = Math.round((wx - x0) * f), py = Math.round((wy - y0) * f);
      const w = s.shadow ? s.shadow.width : s.w, h = s.shadow ? s.shadow.height : s.h;
      if (px - s.ax > S || py - s.ay > S || px - s.ax + w < 0 || py - s.ay + h < 0) return;
      list.push({ px, py, s });
    };
    // The biggest prop reaches about 12 m either way at 4 pixels a metre (twice that at 2).
    if (PROPS.ready) {
      const M = Math.ceil(48 / f) + 2;
      for (let cy = Math.floor((y0 - M) / CH); cy <= Math.floor((y0 + BLOCK + M) / CH); cy++) {
        for (let cx = Math.floor((x0 - M) / CH); cx <= Math.floor((x0 + BLOCK + M) / CH); cx++) {
          if (!this.map.inside(cx * CH, cy * CH)) continue;
          const c = this.map.chunk(cx, cy);
          for (const pr of c.props) {
            if (pr.gone) continue;
            const t = terUnder(c, pr);
            if (onPavement(t)) continue;
            const name = propSpriteName(pr, t);
            if (name) add(pr.x, pr.y, PROPS.sprite(name, f));
          }
        }
      }
    }
    if (NATURE.ready) {
      // Trees: in every 4 m cell of the wood, the tile with the lowest hash carries a crown.
      const M = 16, C = 4;
      const m = this.map;
      for (let gy = Math.floor((y0 - M) / C); gy <= Math.floor((y0 + BLOCK + M) / C); gy++) {
        for (let gx = Math.floor((x0 - M) / C); gx <= Math.floor((x0 + BLOCK + M) / C); gx++) {
          // A cell lies inside one chunk (its size divides the chunk's): read the chunk's tiles directly.
          if (!m.inside(gx * C, gy * C)) continue;
          const c = m.chunk((gx * C) >> 5, (gy * C) >> 5);
          let best = 2, bxT = 0, byT = 0;
          for (let k = 0; k < C * C; k++) {
            const tx = gx * C + (k % C), ty = gy * C + Math.floor(k / C);
            const o = c.obs[((ty & 31) << 5) | (tx & 31)];
            if (o === OBS.BOULDER) {
              const hb = hash2(tx, ty, 151);
              if (hb < BOULDER_SHARE) add(tx + 0.5, ty + 0.7, NATURE.sprite(boulderName(m.getTer(tx, ty), m.getZone(tx, ty), hb / BOULDER_SHARE), f));
            }
            if (o !== OBS.TREE) continue;
            const h = hash2(tx, ty, 149);
            if (h < best) {
              best = h;
              bxT = tx;
              byT = ty;
            }
          }
          if (best > 1) continue;
          const h2 = hash2(bxT, byT, 153);
          add(bxT + 0.5, byT + 0.5, NATURE.sprite(crownName(m.getTer(bxT, byT), m.getOh(bxT, byT), h2), f));
        }
      }
    }
    if (!list.length) return;
    list.sort((a, b) => a.py - b.py || a.px - b.px);
    x.globalAlpha = 0.32;
    for (const { px, py, s } of list) if (s.shadow) x.drawImage(s.shadow, px - s.ax, py - s.ay);
    x.globalAlpha = 1;
    for (const { px, py, s } of list) x.drawImage(s.sheet, s.sx, s.sy, s.w, s.h, px - s.ax, py - s.ay, s.w, s.h);
  }

  private build(bx: number, by: number): { canvas: HTMLCanvasElement; px: Uint8ClampedArray; tb: Uint8Array; ob: Uint8Array } {
    const x0 = bx * BLOCK, y0 = by * BLOCK;
    this.read(x0, y0);
    if (!this.img) this.img = new ImageData(BLOCK, BLOCK);
    const d = this.img.data;
    const { ter, obs, oh, hgt } = this;
    for (let y = 0; y < BLOCK; y++) {
      for (let x = 0; x < BLOCK; x++) {
        const i = (y + PAD) * W + x + PAD;
        const tx = x0 + x, ty = y0 + y;
        const t = ter[i];
        const o = obs[i];
        const n = hash2(tx, ty);
        let r: number, g: number, b: number;
        // A wall face: some obstacle up to the north stands tall enough to hide this tile behind its south face.
        let face = 0, faceK = 0, faceLen = 0;
        const fl = this.flat;
        const flat = !!fl && tx >= fl.x0 && tx < fl.x1 && ty >= fl.y0 && ty < fl.y1;
        if (!flat && (!o || this.wallLen(i) === 0)) {
          for (let k = 1; k < PAD - 1; k++) {
            const j = i - k * W;
            if (!obs[j]) continue;
            const len = this.wallLen(j);
            if (len >= k) {
              face = j;
              faceK = k;
              faceLen = len;
            }
            break;
          }
        }
        if (face) {
          const fo = obs[face];
          const c = OBS_RGB[fo];
          // Lit from above: brightest at the top edge, darker toward the ground.
          let k = 0.62 - (faceK / Math.max(1, faceLen)) * 0.16 + (n - 0.5) * 0.06;
          if (isBuilding(fo)) {
            if (tx % 4 === 0) k -= 0.1;
            if (tx % 4 === 2 && faceK % 3 === 2 && faceK < faceLen) {
              // Windows: mostly dark glass, a few lit.
              const lit = hash2(tx, ty - faceK, 5) > 0.82;
              r = lit ? 255 : 38;
              g = lit ? 206 : 52;
              b = lit ? 120 : 70;
              this.put(d, x, y, r, g, b);
              continue;
            }
          } else if (fo === OBS.ICE_SPIRE) k += 0.1 + (faceK % 2) * 0.05;
          else if (faceK % 2 === 0) k -= 0.07;
          if (faceK === 1) k += 0.12;
          r = c[0] * k;
          g = c[1] * k;
          b = c[2] * k;
        } else if (o) {
          // A roof or rock top: bevelled against the sun, with a hint of what it's made of.
          const c = OBS_RGB[o];
          const h = oh[i];
          let k = 1.02 + (n - 0.5) * 0.14 + Math.min(0.2, h * 0.003);
          if (!obs[i - W] || !obs[i - 1]) k += 0.26;
          else if (!obs[i + W] || !obs[i + 1]) k -= 0.2;
          if (o === OBS.TREE) {
            // Canopy: dark rim, lighter crown, leaf speckle.
            const edge = !obs[i - 1] || !obs[i + 1] || !obs[i - W] || !obs[i + W];
            k = edge ? 0.72 : 1 + n * 0.45;
            if (!edge && (!obs[i - W - 1] || !obs[i - 2 * W])) k += 0.25;
          } else if (isBuilding(o) && h >= 12) {
            // Rooftops: seams, vents, the odd aerial or skylight.
            if (tx % 6 === 0 || ty % 7 === 0) k -= 0.12;
            if (n > 0.985) k += 0.4;
            else if (n < 0.012) k -= 0.35;
          } else if (o === OBS.CLIFF || o === OBS.BASALT || o === OBS.ROCK) {
            k += (vnoise(tx, ty, 3, 21) - 0.5) * 0.25;
          } else if (o === OBS.SHARD || o === OBS.ICE_SPIRE) {
            if (n > 0.9) k += 0.4;
          }
          r = c[0] * k;
          g = c[1] * k;
          b = c[2] * k;
        } else {
          [r, g, b] = this.groundColour(t, tx, ty, n);
          // Farmland in the green country: ploughed fields in furrows, the ochre ones standing wheat in rows.
          if (this.zn[i] === ZONE.VERDANT && (t === TER.DIRT || t === TER.RUST)) [r, g, b] = fieldColour(t, tx, ty, r, g, b, n);
          // Hill shading: faces toward the sun (north-west) lighter, the far sides darker.
          const relief = RELIEF[t] ?? 0;
          if (relief) {
            // Slopes facing the sun lit, the far sides in shade; hollows a touch darker than the crests.
            const s = (hgt[i + W + 1] - hgt[i - W - 1]) * relief * 0.62;
            const k = (1 + Math.max(-0.34, Math.min(0.34, s))) * (0.94 + Math.min(1, hgt[i] / 11) * 0.12);
            r *= k;
            g *= k;
            b *= k;
          }
          // Edges between different ground (road verges, field borders), and shorelines.
          const tn = ter[i - W], tw = ter[i - 1], ts = ter[i + W], te = ter[i + 1];
          if (isLiquid(t) && (!isLiquid(tn) || !isLiquid(tw) || !isLiquid(ts) || !isLiquid(te))) {
            const foam = t === TER.LAVA ? [60, 20, 10] : t === TER.ACID ? [200, 255, 170] : [210, 236, 240];
            r = r * 0.45 + foam[0] * 0.55;
            g = g * 0.45 + foam[1] * 0.55;
            b = b * 0.45 + foam[2] * 0.55;
          } else if (tn !== t || tw !== t) {
            r *= 0.86;
            g *= 0.86;
            b *= 0.86;
          }
          // Shadow from anything tall up-sun, and darker ground at the foot of walls.
          let shade = 1;
          for (let s = 1; s < PAD - 1 && !flat; s++) {
            const j = i - s * W - Math.round(s * 0.8);
            if (obs[j] && oh[j] * 0.5 * 0.55 >= s) {
              shade = 0.6;
              break;
            }
          }
          if (shade === 1 && !flat && (obs[i - W] || obs[i - 1] || obs[i + 1] || obs[i - 2 * W])) shade = 0.82;
          r *= shade;
          g *= shade;
          b *= shade * (shade < 1 ? 1.08 : 1);
        }
        this.put(d, x, y, r, g, b);
      }
    }
    // Debris props are baked in for every view; the sprite props only as dots in the far view (up close the
    // high-resolution blocks stamp their sprites over clean ground).
    // (The high-resolution copies start from the ground without them and paint the debris crisp themselves.)
    const ground = new Uint8ClampedArray(d);
    this.drawProps(d, bx, by, x0, y0, false);
    this.drawProps(d, bx, by, x0, y0, true);
    const out = document.createElement('canvas');
    out.width = BLOCK;
    out.height = BLOCK;
    const octx = out.getContext('2d')!;
    octx.putImageData(this.img, 0, 0);
    paintBuildings(octx, this.map, x0, y0, BLOCK, 1);
    // Keep what the high-resolution copies need: the colours, and the tiles with a one-tile border.
    const B2 = BLOCK + 2;
    const tb = new Uint8Array(B2 * B2), ob = new Uint8Array(B2 * B2);
    for (let y = 0; y < B2; y++) for (let x = 0; x < B2; x++) {
      const i = (y + PAD - 1) * W + x + PAD - 1;
      tb[y * B2 + x] = ter[i];
      ob[y * B2 + x] = obs[i] && obs[i] !== OBS.TREE ? 1 : 0;
    }
    return { canvas: out, px: ground, tb, ob };
  }

  /** Writes a pixel with a little extra saturation and contrast (the wasteland should pop, not wash out). */
  private put(d: Uint8ClampedArray, x: number, y: number, r: number, g: number, b: number): void {
    const l = r * 0.3 + g * 0.59 + b * 0.11;
    r = l + (r - l) * 1.18;
    g = l + (g - l) * 1.18;
    b = l + (b - l) * 1.18;
    r = (r - 128) * 1.06 + 128;
    g = (g - 128) * 1.06 + 128;
    b = (b - 128) * 1.06 + 128;
    const p = (y * BLOCK + x) * 4;
    d[p] = r;
    d[p + 1] = g;
    d[p + 2] = b;
    d[p + 3] = 255;
  }

  /** The texture of each kind of ground. */
  private groundColour(t: number, tx: number, ty: number, n: number): [number, number, number] {
    const c = TER_RGB[t] ?? TER_RGB[0];
    const patch = vnoise(tx, ty, 9, 3) - 0.5;
    let k = 1 + (n - 0.5) * 0.12 + patch * 0.14;
    let r = c[0], g = c[1], b = c[2];
    switch (t) {
      case TER.DUNE:
        k += Math.sin(tx * 0.55 + ty * 0.22 + Math.sin(ty * 0.05) * 2) * 0.08;
        break;
      case TER.SAND:
        k += Math.sin(tx * 0.3 + ty * 0.12 + patch * 4) * 0.04;
        if (n > 0.985) k -= 0.3;
        else if (n < 0.02) k += 0.18;
        break;
      case TER.GRASS: {
        // Three greens, tufts and the odd flower.
        const v = vnoise(tx, ty, 4, 7);
        r = r * (0.85 + v * 0.3);
        g = g * (0.9 + v * 0.35);
        // Meadows: broad swathes of yellow-green and deep green across the country.
        const m = vnoise(tx, ty, 38, 29) - 0.5;
        r += m * 38;
        g += m * 16;
        b -= m * 8;
        if (n > 0.93) k -= 0.22;
        else if (n > 0.9) k += 0.2;
        if (n < 0.006) return hash2(tx, ty, 9) > 0.5 ? [240, 220, 90] : [235, 235, 240];
        break;
      }
      case TER.DIRT:
      case TER.RUST:
      case TER.CAMP:
        if (n > 0.97) k -= 0.28;
        else if (n < 0.03) k += 0.2;
        // Cracks.
        if (Math.abs(vnoise(tx, ty, 13, 17) - 0.5) < 0.012) k -= 0.25;
        break;
      case TER.ASH:
        if (n > 0.992) return [255, 120, 40];
        if (n > 0.95) k -= 0.2;
        break;
      case TER.SNOW:
        k += n > 0.97 ? 0.12 : n < 0.05 ? -0.06 : 0;
        k += Math.sin(tx * 0.35 - ty * 0.6) * 0.025;
        break;
      case TER.ICE:
        k += Math.sin((tx + ty) * 0.45) * 0.04 + (n > 0.96 ? 0.22 : 0);
        if (Math.abs(vnoise(tx, ty, 8, 23) - 0.5) < 0.015) return [236, 248, 255];
        break;
      case TER.ROAD:
        k -= 0.05;
        if (n > 0.975) k -= 0.18;
        else if (n < 0.012) k += 0.3;
        if (Math.abs(vnoise(tx, ty, 11, 29) - 0.5) < 0.01) k -= 0.22;
        break;
      case TER.WATER:
        k += Math.sin(tx * 0.5 - ty * 0.35 + patch * 6) * 0.07 + (n > 0.97 ? 0.35 : 0);
        break;
      case TER.ACID:
        k += Math.sin(tx * 0.4 + ty * 0.3) * 0.06;
        if (n > 0.97) return [220, 255, 160];
        break;
      case TER.LAVA: {
        // Glowing rivers under a dark crust of plates.
        const cr = vnoise(tx, ty, 5, 31);
        if (cr > 0.62) return [70 + n * 20, 28, 20];
        k += (0.62 - cr) * 0.6 + (n > 0.9 ? 0.3 : 0);
        return [Math.min(255, 255 * k), Math.min(255, 120 * k), 30 * k];
      }
      case TER.BASALT:
        if (Math.abs(vnoise(tx, ty, 6, 37) - 0.5) < 0.02) k -= 0.3;
        k += n > 0.97 ? 0.25 : 0;
        break;
      case TER.GLASS:
        if (n > 0.96) return [200, 255, 200];
        k += Math.sin(tx * 0.7 + ty * 0.2) * 0.06;
        break;
      case TER.CRATER:
        if (n > 0.95) k -= 0.25;
        else if (n < 0.04) k += 0.2;
        break;
      case TER.MUD:
        if (vnoise(tx, ty, 6, 41) > 0.7) {
          // Puddles.
          r = r * 0.7 + 30;
          g = g * 0.7 + 34;
          b = b * 0.7 + 40;
        }
        break;
      case TER.METAL:
        if (tx % 10 === 0 || ty % 10 === 0) k -= 0.16;
        else if ((tx % 10 === 1 || tx % 10 === 9) && (ty % 10 === 1 || ty % 10 === 9)) k += 0.25;
        else if (tx % 10 === 1 || ty % 10 === 1) k += 0.07;
        k -= patch * 0.08;
        break;
      case TER.CONCRETE:
        if (tx % 8 === 0 || ty % 8 === 0) k -= 0.12;
        if (n > 0.985) k -= 0.28;
        if (vnoise(tx, ty, 7, 43) > 0.78) k -= 0.1;
        break;
    }
    return [r * k, g * k, b * k];
  }

  /** Props as a few shaded pixels each, with a shadow: the debris ones, or (far view) the ones with sprites. */
  /**
   * The debris without a sprite (barrels, crates, bones, pipes, wrecked cars, cacti, stumps...) painted crisp on a
   * high-resolution block: a shadow to the south-east, a dark outline, the body lit on its north-west edges and
   * shaded on the far ones, and a detail for what it is.
   */
  private stampDebris(x: CanvasRenderingContext2D, bx: number, by: number, f: number): void {
    const x0 = bx * BLOCK, y0 = by * BLOCK;
    const R = (a: number, b: number, w: number, h: number, c: string): void => {
      x.fillStyle = c;
      x.fillRect(Math.round(a), Math.round(b), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    };
    const hex = (c: RGB, k = 1): string => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;
    for (let cy = -1; cy <= CPB; cy++) {
      for (let cx = -1; cx <= CPB; cx++) {
        const c = this.map.peek(bx * CPB + cx, by * CPB + cy);
        if (!c) continue;
        for (const pr of c.props) {
          if (pr.gone) continue;
          const p = PROP[pr.kind];
          if (!p) continue;
          const t = terUnder(c, pr);
          if (onPavement(t) || propSpriteName(pr, t)) continue;
          const s = Math.max(1, Math.round(pr.s));
          const w = p.w * s * f, h = p.h * s * f;
          const px = (pr.x - x0) * f - w / 2, py = (pr.y - y0) * f - h / 2;
          if (px > BLOCK * f || py > BLOCK * f || px + w < 0 || py + h < 0) continue;
          const o = Math.max(1, Math.round(f / 3));
          x.globalAlpha = 0.35;
          R(px + o * 2, py + o * 2, w, h, '#000');
          x.globalAlpha = 1;
          const round = pr.kind === 'barrel' || pr.kind === 'skull' || pr.kind === 'mushroom';
          if (round) {
            const cxp = px + w / 2, cyp = py + h / 2, rr = Math.max(w, h) / 2;
            x.fillStyle = '#0c0a08';
            x.beginPath();
            x.arc(cxp, cyp, rr + o * 0.7, 0, Math.PI * 2);
            x.fill();
            x.fillStyle = hex(p.c);
            x.beginPath();
            x.arc(cxp, cyp, rr, 0, Math.PI * 2);
            x.fill();
            x.fillStyle = hex(p.hi);
            x.beginPath();
            x.arc(cxp - rr * 0.3, cyp - rr * 0.3, rr * 0.45, 0, Math.PI * 2);
            x.fill();
            if (pr.kind === 'barrel') {
              x.strokeStyle = hex(p.c, 0.6);
              x.lineWidth = Math.max(1, o * 0.6);
              x.beginPath();
              x.arc(cxp, cyp, rr * 0.65, 0, Math.PI * 2);
              x.stroke();
            } else if (pr.kind === 'skull') {
              R(cxp - rr * 0.45, cyp - rr * 0.1, rr * 0.3, rr * 0.3, '#1a1612');
              R(cxp + rr * 0.15, cyp - rr * 0.1, rr * 0.3, rr * 0.3, '#1a1612');
            }
            continue;
          }
          R(px - o, py - o, w + o * 2, h + o * 2, '#0c0a08');
          R(px, py, w, h, hex(p.c));
          R(px, py, w, o, hex(p.hi));
          R(px, py, o, h, hex(p.hi, 0.92));
          R(px, py + h - o, w, o, hex(p.c, 0.62));
          R(px + w - o, py, o, h, hex(p.c, 0.75));
          switch (pr.kind) {
            case 'crate':
              R(px + w / 2 - o / 2, py + o, o, h - o * 2, hex(p.c, 0.65));
              R(px + o, py + h / 2 - o / 2, w - o * 2, o, hex(p.c, 0.65));
              break;
            case 'wreckcar':
              R(px + w * 0.3, py + o, w * 0.3, h - o * 2, '#2a3440');
              R(px + w * 0.32, py + o * 1.5, w * 0.1, h * 0.25, '#6a8aa0');
              R(px + w * 0.75, py + o, o, h - o * 2, hex(p.c, 0.6));
              for (const wx of [px + w * 0.15, px + w * 0.8]) {
                R(wx, py - o, w * 0.12, o * 1.5, '#141414');
                R(wx, py + h - o * 0.5, w * 0.12, o * 1.5, '#141414');
              }
              break;
            case 'pipe':
              R(px + w - o * 2, py - o * 0.5, o * 2, h + o, hex(p.c, 0.8));
              R(px, py + h / 2 - o / 2, w, Math.max(1, o * 0.6), hex(p.c, 0.7));
              break;
            case 'bones':
              R(px - o, py - o * 0.5, o * 2, h + o, hex(p.hi));
              R(px + w - o, py - o * 0.5, o * 2, h + o, hex(p.hi));
              break;
            case 'cactus':
              R(px - w * 0.6, py + h * 0.35, w * 0.6, o, hex(p.c));
              R(px - w * 0.6, py + h * 0.15, o, h * 0.25, hex(p.c));
              R(px + w, py + h * 0.5, w * 0.6, o, hex(p.c));
              R(px + w * 1.6 - o, py + h * 0.3, o, h * 0.25, hex(p.c));
              break;
            case 'deadtree':
              R(px - w, py + h * 0.2, w, o, hex(p.c, 0.9));
              R(px + w, py + h * 0.45, w * 1.2, o, hex(p.c, 0.9));
              break;
            case 'sign':
              R(px + w / 2 - o / 2, py + h, o, h, '#3a2a1a');
              R(px + o, py + h * 0.4, w - o * 2, Math.max(1, o * 0.5), '#3a2a1a');
              break;
            case 'crystal':
              R(px + o, py + o, Math.max(1, o), h - o * 2, '#ffffff');
              break;
            case 'antenna':
              R(px + w / 2 - o / 2, py - h * 0.3, o, h * 0.3, hex(p.hi));
              R(px + w / 2 - o, py - h * 0.35, o * 2, o, '#ff3020');
              break;
            default:
          }
        }
      }
    }
  }

  private drawProps(d: Uint8ClampedArray, bx: number, by: number, x0: number, y0: number, sprites: boolean): void {
    const set = (qx: number, qy: number, c: RGB | [number, number, number], mul = 1): void => {
      if (qx < 0 || qy < 0 || qx >= BLOCK || qy >= BLOCK) return;
      const q = (qy * BLOCK + qx) * 4;
      d[q] = c[0] * mul;
      d[q + 1] = c[1] * mul;
      d[q + 2] = c[2] * mul;
    };
    const darken = (qx: number, qy: number): void => {
      if (qx < 0 || qy < 0 || qx >= BLOCK || qy >= BLOCK) return;
      const q = (qy * BLOCK + qx) * 4;
      d[q] *= 0.65;
      d[q + 1] *= 0.65;
      d[q + 2] *= 0.7;
    };
    for (let cy = 0; cy < CPB; cy++) {
      for (let cx = 0; cx < CPB; cx++) {
        const c = this.map.peek(bx * CPB + cx, by * CPB + cy);
        if (!c) continue;
        for (const pr of c.props) {
          if (pr.gone) continue;
          const p = PROP[pr.kind];
          if (!p) continue;
          const t = terUnder(c, pr);
          if (onPavement(t) || !!propSpriteName(pr, t) !== sprites) continue;
          const px = Math.floor(pr.x) - x0, py = Math.floor(pr.y) - y0;
          const s = Math.max(1, Math.round(pr.s));
          const w = p.w * s, h = p.h * s;
          for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) darken(px + xx + 1, py + yy + 1);
          for (let yy = 0; yy < h; yy++) {
            for (let xx = 0; xx < w; xx++) set(px + xx, py + yy, yy === 0 || xx === 0 ? p.hi : p.c);
          }
        }
      }
    }
  }
}
