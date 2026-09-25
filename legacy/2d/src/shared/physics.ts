import { TILE } from './constants';

export const CELL_EMPTY = 0;
export const CELL_SOLID = 1;
export const CELL_PLATFORM = 2;
export const CELL_LADDER = 3;

/**
 * Anything made of tiles that bodies collide with: the world itself, or a rig
 * (a moving tile grid offset by its position). Grids only translate, never
 * rotate, which keeps collision a simple AABB-vs-tiles problem in local space.
 */
export interface CollisionGrid {
  readonly ox: number;
  readonly oy: number;
  readonly cols: number;
  readonly rows: number;
  cell(tx: number, ty: number, team: string): number;
}

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  grounded: boolean;
  groundGrid: CollisionGrid | null;
  /** While > 0 the body falls through platforms. */
  dropTimer: number;
  team: string;
}

export function makeBody(x: number, y: number, w: number, h: number, team: string): Body {
  return { x, y, w, h, vx: 0, vy: 0, grounded: false, groundGrid: null, dropTimer: 0, team };
}

/** Moves along X, pushing out of solid tiles. Returns top Y of the highest tile hit, or NaN. */
function sweepX(b: Body, dx: number, grids: CollisionGrid[]): number {
  let hitTop = NaN;
  for (const g of grids) {
    const lx = b.x - g.ox;
    const ly = b.y - g.oy;
    const ty0 = Math.floor(ly / TILE);
    const ty1 = Math.floor((ly + b.h - 0.01) / TILE);
    const tx = dx > 0 ? Math.floor((lx + b.w - 0.01) / TILE) : Math.floor(lx / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (g.cell(tx, ty, b.team) !== CELL_SOLID) continue;
      if (dx > 0) {
        const nx = g.ox + tx * TILE - b.w;
        if (nx < b.x) b.x = nx;
      } else {
        const nx = g.ox + (tx + 1) * TILE;
        if (nx > b.x) b.x = nx;
      }
      const top = g.oy + ty * TILE;
      if (Number.isNaN(hitTop) || top < hitTop) hitTop = top;
    }
  }
  return hitTop;
}

function sweepY(b: Body, dy: number, grids: CollisionGrid[], prevBottom: number): boolean {
  let hit = false;
  for (const g of grids) {
    const lx = b.x - g.ox;
    const ly = b.y - g.oy;
    const tx0 = Math.floor(lx / TILE);
    const tx1 = Math.floor((lx + b.w - 0.01) / TILE);
    if (dy > 0) {
      const ty = Math.floor((ly + b.h - 0.01) / TILE);
      const top = g.oy + ty * TILE;
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = g.cell(tx, ty, b.team);
        if (c === CELL_SOLID || (c === CELL_PLATFORM && b.dropTimer <= 0 && prevBottom <= top + 0.5)) {
          b.y = top - b.h;
          b.grounded = true;
          b.groundGrid = g;
          hit = true;
          break;
        }
      }
    } else if (dy < 0) {
      const ty = Math.floor(ly / TILE);
      for (let tx = tx0; tx <= tx1; tx++) {
        if (g.cell(tx, ty, b.team) === CELL_SOLID) {
          b.y = g.oy + (ty + 1) * TILE;
          hit = true;
          break;
        }
      }
    }
  }
  return hit;
}

export function boxHitsSolid(x: number, y: number, w: number, h: number, grids: CollisionGrid[], team: string): boolean {
  for (const g of grids) {
    const lx = x - g.ox, ly = y - g.oy;
    const tx0 = Math.floor(lx / TILE), tx1 = Math.floor((lx + w - 0.01) / TILE);
    const ty0 = Math.floor(ly / TILE), ty1 = Math.floor((ly + h - 0.01) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (g.cell(tx, ty, team) === CELL_SOLID) return true;
      }
    }
  }
  return false;
}

/** Returns the "strongest" cell type at a world point across grids. */
export function cellAt(grids: CollisionGrid[], x: number, y: number, team: string): number {
  let best = CELL_EMPTY;
  for (const g of grids) {
    const c = g.cell(Math.floor((x - g.ox) / TILE), Math.floor((y - g.oy) / TILE), team);
    if (c === CELL_SOLID) return c;
    if (c > best) best = c;
  }
  return best;
}

/**
 * Integrates velocity and resolves collisions against every grid. Grounded
 * bodies automatically step up single-tile ledges, Terraria style.
 */
export function moveBody(b: Body, dt: number, grids: CollisionGrid[], stepUp = true): void {
  const wasGrounded = b.grounded;
  b.grounded = false;
  b.groundGrid = null;
  if (b.dropTimer > 0) b.dropTimer -= dt;

  const dx = b.vx * dt;
  if (dx !== 0) {
    const n = Math.max(1, Math.ceil(Math.abs(dx) / 6));
    const sx = dx / n;
    for (let i = 0; i < n; i++) {
      const target = b.x + sx;
      b.x = target;
      const top = sweepX(b, sx, grids);
      if (!Number.isNaN(top)) {
        if (stepUp && wasGrounded) {
          const lift = b.y + b.h - top;
          if (lift > 0 && lift <= TILE + 0.5 && !boxHitsSolid(target, b.y - lift - 0.05, b.w, b.h, grids, b.team)) {
            b.x = target;
            b.y -= lift + 0.05;
            continue;
          }
        }
        b.vx = 0;
        break;
      }
    }
  }

  const dy = b.vy * dt;
  if (dy !== 0) {
    const n = Math.max(1, Math.ceil(Math.abs(dy) / 6));
    const sy = dy / n;
    for (let i = 0; i < n; i++) {
      const prevBottom = b.y + b.h;
      b.y += sy;
      if (sweepY(b, sy, grids, prevBottom)) {
        b.vy = 0;
        break;
      }
    }
  }
}

export function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
