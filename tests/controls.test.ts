import { describe, expect, it } from 'vitest';
import { driveTank, TITAN, titanYaw } from '../src/game/systems/movement';
import { engineSpec } from '../src/game/systems/engine';
import { helmDrive, stepWorld, warpBlocked } from '../src/game/systems/step';
import { CH, OBS, TER } from '../src/shared/map';
import { wrapAngle } from '../src/shared/types';
import { game, outside } from './helpers';

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
  it('is slow off the mark, then very fast once she has way on; she coasts and brakes slowly', () => {
    const g = outside(game());
    const p = g.player;
    expect(top(g) * 3.6).toBeGreaterThan(230);
    expect(top(g) * 3.6).toBeLessThan(330);
    // W pushes the lever up; it stays there when you let go (cruise control).
    const t = hold(g, 0, -1, 30, () => g.helm.lever >= 1);
    expect(t).toBeLessThan(2);
    // The engine has to spool up: three seconds in she has barely begun to roll...
    hold(g, 0, 0, 3 - t);
    const v3 = p.speed;
    expect(v3).toBeLessThan(top(g) * 0.15);
    // ...then she pulls much harder over the next three, and is running fast inside half a minute.
    hold(g, 0, 0, 3);
    expect(p.speed - v3).toBeGreaterThan(v3 * 1.5);
    expect(p.spool).toBeGreaterThan(0.9);
    hold(g, 0, 0, 24);
    expect(p.speed).toBeGreaterThan(top(g) * 0.55 * p.trac);
    expect(p.speed * 3.6).toBeGreaterThan(120);
    // Down through 0% stops on the detent; let go and she coasts on a long way.
    hold(g, 0, 1, 1.3, () => g.helm.lever === 0);
    expect(g.helm.lever).toBe(0);
    const v0 = p.speed;
    hold(g, 0, 0, 8);
    expect(g.helm.brake).toBe(0);
    expect(p.speed).toBeGreaterThan(v0 * 0.6);
    // Holding S on zero works the brake: still a long stop, but a stop.
    let stop = Infinity;
    g.driveInput = { x: 0, y: 1, active: true };
    for (let s = 0; s < 60; s += DT) {
      driveTank(g, p, DT, 1, helmDrive(g, DT));
      if (Math.abs(p.speed) < 0.05) {
        stop = s;
        break;
      }
    }
    expect(stop).toBeGreaterThan(4);
    expect(stop).toBeLessThan(40);
  });

  it('turns ever wider as she gathers speed', () => {
    const g = game();
    const p = g.player;
    const slow = titanYaw(p, 6, true), fast = titanYaw(p, 60, true);
    expect(fast).toBeLessThan(slow * 0.4);
    // A quarter-mile radius or more at full tilt.
    expect(60 / fast).toBeGreaterThan(400);
  });

  it('a better engine: turbos get her rolling sooner, a bigger block goes faster', () => {
    const base = game();
    const turbo = game();
    turbo.player.engine.turbo = 6;
    const block = game();
    block.player.engine.block = 6;
    for (const g of [base, turbo, block]) g.player.recalc();
    expect(top(block)).toBeGreaterThan(top(base) * 1.5);
    for (const g of [base, turbo]) {
      hold(g, 0, -1, 30, () => g.helm.lever >= 1);
      hold(g, 0, 0, 3);
    }
    expect(turbo.player.speed).toBeGreaterThan(base.player.speed * 1.6);
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

  it('steers like a ship: the swing builds slowly and carries on after you let go', () => {
    const g = outside(game());
    const p = g.player;
    hold(g, 0, -1, 1.5);
    hold(g, 0, 0, 10);
    const r0 = p.rot;
    hold(g, 1, 0, 0.5);
    const early = Math.abs(p.turnVel);
    hold(g, 1, 0, 3);
    const full = Math.abs(p.turnVel);
    expect(early).toBeLessThan(full * 0.5);
    // Helm released: she keeps swinging for a while.
    const r1 = p.rot;
    hold(g, 0, 0, 1);
    expect(Math.abs(wrapAngle(p.rot - r1))).toBeGreaterThan(full * 0.3);
    expect(Math.abs(wrapAngle(p.rot - r0))).toBeGreaterThan(0.05);
  });

  it('pivots when stopped', () => {
    const g = game();
    const p = g.player;
    const r0 = p.rot;
    hold(g, 1, 0, 5);
    expect(Math.abs(wrapAngle(p.rot - r0))).toBeGreaterThan(0.4);
  });

  it('overdrive: faster, for about triple the fuel, until the engine overheats', { timeout: 30000 }, () => {
    const g = outside(game());
    const p = g.player;
    // A long straight slab out from the compound's gate, so the ground stays the same the whole run.
    for (let y = 0; y < 2600; y++) for (let x = -40; x <= 40; x++) g.map.set(Math.floor(p.x) + x, Math.floor(p.y) + y, { ter: TER.CONCRETE, obs: OBS.NONE });
    for (let y = 0; y < 2600; y += CH) for (let x = -40; x <= 40 + CH; x += CH) g.map.chunk(Math.floor((p.x + x) / CH), Math.floor((p.y + y) / CH)).touched = true;
    g.helm.lever = 1;
    for (let i = 0; i < 30 * 20; i++) stepWorld(g, DT);
    const normal = p.speed, fuel0 = g.titan.fuel;
    for (let i = 0; i < 30 * 5; i++) stepWorld(g, DT);
    const burnt = fuel0 - g.titan.fuel;
    g.helm.overdrive = true;
    for (let i = 0; i < 30 * 7; i++) stepWorld(g, DT);
    expect(p.speed).toBeGreaterThan(normal * (engineSpec(p.engine).odSpeed - 0.2));
    const fuel1 = g.titan.fuel;
    for (let i = 0; i < 30 * 5; i++) stepWorld(g, DT);
    expect(fuel1 - g.titan.fuel).toBeGreaterThan(burnt * 2.5);
    // Held too long, the engine overheats and trips it; it won't relight until it has cooled.
    for (let i = 0; i < 30 * 6 && g.helm.overdrive; i++) stepWorld(g, DT);
    expect(g.helm.overdrive).toBe(false);
    expect(g.helm.overheat).toBe(true);
    for (let i = 0; i < 30 * 30; i++) stepWorld(g, DT);
    expect(g.helm.overheat).toBe(false);
  });

  it('cruise warp only runs with nothing hostile near', () => {
    const g = game();
    expect(warpBlocked(g)).toBeNull();
    const e = g.spawnEnemy('d_sand_rat', g.player.x + 150, g.player.y, 1);
    e.aggro = true;
    expect(warpBlocked(g)).toMatch(/nearby/);
    e.hp = 0;
    g.wave.phase = 'warning';
    expect(warpBlocked(g)).toMatch(/horde/);
  });
});
