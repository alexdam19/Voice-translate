import { describe, expect, it } from 'vitest';
import { driveTank, manualDrive } from '../src/game/systems/movement';
import { wrapAngle } from '../src/shared/types';
import { game } from './helpers';

/** Drives the player with a held stick direction for `secs`; returns the time it took `done` to become true. */
function hold(g: ReturnType<typeof game>, ix: number, iy: number, secs: number, done: () => boolean): number {
  const dt = 1 / 60;
  for (let t = 0; t < secs; t += dt) {
    driveTank(g, g.player, dt, 1, manualDrive(g.player, ix, iy, false));
    if (done()) return t;
  }
  return Infinity;
}

describe('driving feel', () => {
  it('gets up to speed quickly and stops when you let go', () => {
    const g = game();
    const p = g.player;
    p.rot = -Math.PI / 2;
    const top = p.stats.topSpeed;
    const t = hold(g, 0, -1, 3, () => p.speed >= top * 0.9 * p.trac);
    expect(t).toBeLessThan(0.7);
    // Let go: it should stop within half a second.
    let stop = Infinity;
    for (let s = 0; s < 2; s += 1 / 60) {
      driveTank(g, p, 1 / 60, 1);
      if (Math.abs(p.speed) < 0.05) {
        stop = s;
        break;
      }
    }
    expect(stop).toBeLessThan(0.5);
  });

  it('turns a right angle in well under a second and keeps moving while it does', () => {
    const g = game();
    const p = g.player;
    p.rot = -Math.PI / 2;
    hold(g, 0, -1, 1.5, () => false);
    const x0 = p.x, y0 = p.y;
    const t = hold(g, 1, 0, 3, () => Math.abs(wrapAngle(p.rot - 0)) < 0.05);
    expect(t).toBeLessThan(0.8);
    // It carved an arc, not a pivot on the spot.
    expect(Math.hypot(p.x - x0, p.y - y0)).toBeGreaterThan(1.2);
  });

  it('turns right around in about a second', () => {
    const g = game();
    const p = g.player;
    p.rot = -Math.PI / 2;
    hold(g, 0, -1, 1, () => false);
    const t = hold(g, 0, 1, 3, () => Math.abs(wrapAngle(p.rot - Math.PI / 2)) < 0.05);
    expect(t).toBeLessThan(1.5);
  });
});
