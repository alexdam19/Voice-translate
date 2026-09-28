import { describe, expect, it } from 'vitest';
import { driveTank, OVERDRIVE, TITAN } from '../src/game/systems/movement';
import { helmDrive, stepWorld } from '../src/game/systems/step';
import { CH, OBS, TER } from '../src/shared/map';
import { wrapAngle } from '../src/shared/types';
import { game } from './helpers';

const DT = 1 / 30;

/** Holds keys (tank-style input) for `secs` through the helm; returns when `done` first held. */
function hold(g: ReturnType<typeof game>, ix: number, iy: number, secs: number, done: () => boolean = () => false): number {
  g.driveInput = { x: ix, y: iy, active: ix !== 0 || iy !== 0 };
  for (let t = 0; t < secs; t += DT) {
    driveTank(g, g.player, DT, 1, helmDrive(g, DT));
    if (done()) return t;
  }
  return Infinity;
}

const top = (g: ReturnType<typeof game>): number => Math.min(TITAN.cap, g.player.stats.topSpeed);

describe('Titan Crawler handling', () => {
  it('reaches 50-65 km/h in about ten seconds and the lever holds its speed', () => {
    const g = game();
    const p = g.player;
    expect(top(g) * 3.6).toBeGreaterThan(48);
    expect(top(g) * 3.6).toBeLessThan(66);
    // W pushes the lever up; it stays there when you let go (cruise control).
    const t = hold(g, 0, -1, 30, () => g.helm.lever >= 1);
    expect(t).toBeLessThan(2);
    hold(g, 0, 0, 12);
    expect(p.speed).toBeGreaterThan(top(g) * 0.85 * p.trac);
    // Down through 0% stops on the detent.
    hold(g, 0, 1, 3);
    expect(g.helm.lever).toBe(0);
    let stop = Infinity;
    for (let s = 0; s < 20; s += DT) {
      driveTank(g, p, DT, 1, helmDrive(g, DT));
      if (Math.abs(p.speed) < 0.05) {
        stop = s;
        break;
      }
    }
    expect(stop).toBeLessThan(8);
  });

  it('turns briskly, with the inside crawlers slower than the outside', () => {
    const g = game();
    const p = g.player;
    const r0 = p.rot;
    hold(g, 0, -1, 1.5);
    hold(g, 0, 0, 6);
    const t = hold(g, 1, 0, 30, () => Math.abs(wrapAngle(p.rot - r0)) > Math.PI / 2 - 0.02);
    expect(t).toBeLessThan(7);
    expect(p.sideSpeed[0]).toBeGreaterThan(p.sideSpeed[1]);
  });

  it('pivots when stopped', () => {
    const g = game();
    const p = g.player;
    const r0 = p.rot;
    hold(g, 1, 0, 5);
    expect(Math.abs(wrapAngle(p.rot - r0))).toBeGreaterThan(0.4);
  });

  it('overdrive: faster, for triple the fuel', { timeout: 20000 }, () => {
    const g = game();
    const p = g.player;
    // A long straight slab out of the hangar door, so the ground stays the same the whole run.
    for (let y = 0; y < 2600; y++) for (let x = -40; x <= 40; x++) g.map.set(Math.floor(p.x) + x, Math.floor(p.y) + y, { ter: TER.CONCRETE, obs: OBS.NONE });
    for (let y = 0; y < 2600; y += CH) for (let x = -40; x <= 40 + CH; x += CH) g.map.chunk(Math.floor((p.x + x) / CH), Math.floor((p.y + y) / CH)).touched = true;
    g.helm.lever = 1;
    for (let i = 0; i < 30 * 20; i++) stepWorld(g, DT);
    const normal = p.speed, fuel0 = g.titan.fuel;
    for (let i = 0; i < 30 * 5; i++) stepWorld(g, DT);
    const burnt = fuel0 - g.titan.fuel;
    g.helm.overdrive = true;
    for (let i = 0; i < 30 * 20; i++) stepWorld(g, DT);
    expect(p.speed).toBeGreaterThan(normal * (OVERDRIVE.speed - 0.2));
    const fuel1 = g.titan.fuel;
    for (let i = 0; i < 30 * 5; i++) stepWorld(g, DT);
    expect(fuel1 - g.titan.fuel).toBeGreaterThan(burnt * 2.5);
  });
});
