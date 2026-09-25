import { CELL_EMPTY, CELL_PLATFORM, CELL_SOLID, type CollisionGrid } from './physics';
import { T, TILES } from './tiles';

export type TileListener = (x: number, y: number, t: number) => void;

/** The tile map: a foreground tile layer plus a decorative background-wall layer. */
export class World implements CollisionGrid {
  readonly w: number;
  readonly h: number;
  readonly tiles: Uint8Array;
  readonly walls: Uint8Array;
  /** First non-air tile (solid or liquid) from the top of each column. */
  readonly skyTop: Int16Array;
  /** Generated ground height of each column (static; used for cave backdrops). */
  surface: Int16Array;
  readonly ox = 0;
  readonly oy = 0;
  /** When set, every change is recorded here (tile index -> tile) for saving. */
  mods: Map<number, number> | null = null;
  private listeners: TileListener[] = [];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.tiles = new Uint8Array(w * h);
    this.walls = new Uint8Array(w * h);
    this.skyTop = new Int16Array(w);
    this.surface = new Int16Array(w);
  }

  get cols(): number {
    return this.w;
  }
  get rows(): number {
    return this.h;
  }

  onChange(fn: TileListener): void {
    this.listeners.push(fn);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number {
    if (x < 0 || x >= this.w || y >= this.h) return T.BEDROCK;
    if (y < 0) return T.AIR;
    return this.tiles[y * this.w + x];
  }

  wall(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.walls[y * this.w + x];
  }

  /** Raw write used by generators: no listeners, no mod tracking. */
  setRaw(x: number, y: number, t: number): void {
    if (this.inBounds(x, y)) this.tiles[y * this.w + x] = t;
  }

  setWall(x: number, y: number, w: number): void {
    if (this.inBounds(x, y)) this.walls[y * this.w + x] = w;
  }

  set(x: number, y: number, t: number): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.w + x;
    if (this.tiles[i] === t) return;
    this.tiles[i] = t;
    if (this.mods) this.mods.set(i, t);
    const blocks = TILES[t].solid || TILES[t].liquid;
    if (blocks && y < this.skyTop[x]) this.skyTop[x] = y;
    else if (!blocks && y === this.skyTop[x]) this.recalcSkyTop(x);
    for (const fn of this.listeners) fn(x, y, t);
  }

  isSolid(x: number, y: number): boolean {
    return TILES[this.get(x, y)].solid;
  }

  isLiquid(x: number, y: number): boolean {
    return TILES[this.get(x, y)].liquid;
  }

  cell(tx: number, ty: number): number {
    const d = TILES[this.get(tx, ty)];
    return d.solid ? CELL_SOLID : d.platform ? CELL_PLATFORM : CELL_EMPTY;
  }

  recalcSkyTop(x: number): void {
    let y = 0;
    while (y < this.h) {
      const d = TILES[this.tiles[y * this.w + x]];
      if (d.solid || d.liquid) break;
      y++;
    }
    this.skyTop[x] = y;
  }

  finalize(): void {
    for (let x = 0; x < this.w; x++) this.recalcSkyTop(x);
  }

  /** Re-applies saved modifications (tile index -> tile id). */
  applyMods(mods: Iterable<[number, number]>): void {
    for (const [i, t] of mods) {
      if (i < 0 || i >= this.tiles.length || t >= TILES.length) continue;
      this.tiles[i] = t;
      this.mods?.set(i, t);
    }
    this.finalize();
  }
}
