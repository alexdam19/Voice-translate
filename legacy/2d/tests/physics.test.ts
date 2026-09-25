import { describe, expect, it } from 'vitest';
import { TILE } from '../src/shared/constants';
import { makeBody, moveBody } from '../src/shared/physics';
import { T } from '../src/shared/tiles';
import { World } from '../src/shared/world';

function flatWorld(): World {
  const w = new World(40, 30);
  for (let x = 0; x < 40; x++) for (let y = 20; y < 30; y++) w.setRaw(x, y, T.ROCK);
  w.finalize();
  return w;
}

function settle(b: ReturnType<typeof makeBody>, w: World, frames = 120): void {
  for (let i = 0; i < frames; i++) {
    b.vy += 1500 / 60;
    moveBody(b, 1 / 60, [w]);
  }
}

describe('physics', () => {
  it('lands on the ground and reports grounded', () => {
    const w = flatWorld();
    const b = makeBody(100, 50, 14, 30, 'p');
    settle(b, w);
    expect(b.grounded).toBe(true);
    expect(b.y + b.h).toBeCloseTo(20 * TILE, 3);
  });

  it('steps up single-tile ledges but not walls', () => {
    const w = flatWorld();
    w.set(10, 19, T.ROCK); // one-tile step
    for (let y = 16; y < 20; y++) w.set(20, y, T.ROCK); // wall
    const b = makeBody(5 * TILE, 19 * TILE - 30, 14, 30, 'p');
    settle(b, w, 10);
    for (let i = 0; i < 120; i++) {
      b.vx = 180;
      b.vy += 1500 / 60;
      moveBody(b, 1 / 60, [w]);
    }
    expect(b.x).toBeGreaterThan(11 * TILE);
    expect(b.x + b.w).toBeLessThanOrEqual(20 * TILE + 0.01);
  });

  it('treats platforms as one-way floors', () => {
    const w = flatWorld();
    for (let x = 0; x < 40; x++) w.set(x, 12, T.PLATFORM);
    const fromAbove = makeBody(100, 12 * TILE - 60, 14, 30, 'p');
    settle(fromAbove, w);
    expect(fromAbove.y + fromAbove.h).toBeCloseTo(12 * TILE, 3);
    const jumper = makeBody(100, 19 * TILE - 30, 14, 30, 'p');
    jumper.vy = -700;
    for (let i = 0; i < 20; i++) {
      jumper.vy += 1500 / 60;
      moveBody(jumper, 1 / 60, [w]);
    }
    expect(jumper.y).toBeLessThan(12 * TILE);
  });
});
