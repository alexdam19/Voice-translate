import { describe, expect, it } from 'vitest';
import { driveTank, manualDrive, TITAN } from '../src/game/systems/movement';
import { wrapAngle } from '../src/shared/types';
import { game } from './helpers';

const DT = 1 / 30;

/** Drives the player with tank-style input held for `secs`; returns when `done` first held. */
function hold(g: ReturnType<typeof game>, ix: number, iy: number, secs: number, done: () => boolean = () => false): number {
  for (let t = 0; t < secs; t += DT) {
    driveTank(g, g.player, DT, 1, manualDrive(g.player, ix, iy, true));
    if (done()) return t;
  }
  return Infinity;
}

describe('Titan Crawler handling: heavy but readable', () => {
  it('builds speed slowly to about 25 km/h and takes seconds to stop', () => {
    const g = game();
    const p = g.player;
    expect(Math.min(TITAN.cap, p.stats.topSpeed)).toBeGreaterThan(5);
    expect(Math.min(TITAN.cap, p.stats.topSpeed) * 3.6).toBeLessThan(33);
    const t = hold(g, 0, -1, 40, () => p.speed >= Math.min(TITAN.cap, p.stats.topSpeed) * 0.9 * p.trac);
    expect(t).toBeGreaterThan(6);
    expect(t).toBeLessThan(20);
    let stop = Infinity;
    for (let s = 0; s < 30; s += DT) {
      driveTank(g, p, DT, 1);
      if (Math.abs(p.speed) < 0.05) {
        stop = s;
        break;
      }
    }
    expect(stop).toBeGreaterThan(3);
    expect(stop).toBeLessThan(12);
  });

  it('turns in a wide arc with the inside crawlers slower than the outside', () => {
    const g = game();
    const p = g.player;
    const r0 = p.rot;
    hold(g, 0, -1, 15);
    const x0 = p.x, y0 = p.y;
    const t = hold(g, 1, -1, 60, () => Math.abs(wrapAngle(p.rot - r0)) > Math.PI / 2 - 0.02);
    expect(t).toBeGreaterThan(10);
    expect(t).toBeLessThan(40);
    expect(Math.hypot(p.x - x0, p.y - y0)).toBeGreaterThan(60);
    hold(g, 1, -1, 0.5);
    expect(p.sideSpeed[0]).toBeGreaterThan(p.sideSpeed[1]);
  });

  it('only pivots slowly when stopped', () => {
    const g = game();
    const p = g.player;
    const r0 = p.rot;
    hold(g, 1, 0, 5);
    const turned = Math.abs(wrapAngle(p.rot - r0));
    expect(turned).toBeGreaterThan(0.05);
    expect(turned).toBeLessThan(0.35);
  });
});
