import { describe, expect, it } from 'vitest';
import { driveSpec, ENGINES, engineDef, engineReadout, engineSpec, installEngine, newEngine, odStage } from '../src/game/systems/engine';
import { cycleOverdrive, setOverdrive } from '../src/game/systems/helm';
import { fuelBurn, FUEL_MAX } from '../src/game/systems/titan';
import { CRUDE_MAX, drillRate, oilHere, setDrill } from '../src/game/systems/fuel';
import { stepWorld } from '../src/game/systems/step';
import { build, game, levelTo, outside, rich } from './helpers';

const DT = 1 / 30;
const run = (g: ReturnType<typeof game>, secs: number): void => {
  for (let t = 0; t < secs; t += DT) stepWorld(g, DT);
};

describe('the engine room', () => {
  it('has a catalog of whale-sized engines: the bigger and stronger, the longer they take to charge up', () => {
    expect(ENGINES.length).toBeGreaterThanOrEqual(10);
    for (const e of ENGINES) {
      expect(e.len).toBeGreaterThanOrEqual(20);
      expect(e.perks.length).toBeGreaterThan(0);
      expect(engineSpec(newEngine(), e.key).spool).toBeCloseTo(1 / e.charge, 5);
    }
    // Among the combustion engines, more power means a longer charge-up.
    const mw = (k: Parameters<typeof engineDef>[0]): number => engineDef(k).mw;
    expect(mw('bluewhale')).toBeGreaterThan(mw('kraken'));
    expect(engineDef('bluewhale').charge).toBeGreaterThan(engineDef('kraken').charge);
    expect(engineDef('kraken').charge).toBeGreaterThan(engineDef('leviathan').charge);
    expect(engineDef('mastodon').charge).toBeGreaterThan(engineDef('leviathan').charge * 2);
  });

  it('installs a new engine (at its level, for its price): the numbers change', () => {
    const g = game();
    const p = g.player;
    const before = engineReadout(p, p.engine);
    expect(installEngine(g, 'kraken')).toMatch(/level/i);
    levelTo(g, 20);
    const b = p.modules.find((m) => m.key === 'bridge')!;
    b.lvl = 5;
    p.recalc();
    rich(g);
    for (const k of ['titanium_alloy', 'circuit', 'iron_plate', 'tech_parts', 'explosive']) p.cargo.add(k, 400);
    expect(installEngine(g, 'kraken')).toBeNull();
    expect(p.engineKey).toBe('kraken');
    expect(p.enginesOwned).toContain('kraken');
    const after = engineReadout(p, p.engine);
    expect(after.top).toBeGreaterThan(before.top * 1.2);
    expect(after.charge).toBeGreaterThan(before.charge);
    expect(after.stages).toBe(3);
    // Swapping back to one you own is free; it survives a save.
    expect(installEngine(g, 'leviathan')).toBeNull();
    expect(p.engineKey).toBe('leviathan');
    const s = p.serialize();
    expect(s.engines).toContain('kraken');
  });

  it('runs three overdrive stages, each faster, thirstier and hotter; II and III need a charged engine', () => {
    const spec = engineSpec(newEngine(), 'kraken');
    const [a, b, c] = [1, 2, 3].map((k) => odStage(spec, k));
    expect(b.speed).toBeGreaterThan(a.speed);
    expect(c.speed).toBeGreaterThan(b.speed);
    expect(c.fuel).toBeGreaterThan(b.fuel);
    expect(c.heat).toBeGreaterThan(b.heat);
    const g = outside(game());
    const p = g.player;
    // The Leviathan runs two stages; nitro Mk 4 opens the third.
    expect(driveSpec(g, p).odStages).toBe(2);
    expect(setOverdrive(g, 3).ok).toBe(false);
    p.spool = 0;
    expect(setOverdrive(g, 2).ok).toBe(false);
    expect(setOverdrive(g, 1).ok).toBe(true);
    p.spool = 1;
    expect(cycleOverdrive(g).ok).toBe(true);
    expect(g.helm.odStage).toBe(2);
    expect(cycleOverdrive(g).ok).toBe(true);
    expect(g.helm.overdrive).toBe(false);
    p.engine.nitro = 4;
    expect(driveSpec(g, p).odStages).toBe(3);
  });

  it('drive modes: ECO saves fuel and has no overdrive; CRAWL grips and turns', () => {
    const g = outside(game());
    const p = g.player;
    p.speed = p.stats.topSpeed * 0.7;
    const normal = fuelBurn(g);
    g.helm.mode = 'eco';
    expect(fuelBurn(g)).toBeLessThan(normal * 0.8);
    expect(setOverdrive(g, 1).ok).toBe(false);
    g.helm.mode = 'crawl';
    const d = driveSpec(g, p);
    expect(d.grip).toBeGreaterThan(0.2);
    expect(d.turn).toBeGreaterThan(1.2);
    expect(d.modeTop).toBeLessThan(0.5);
  });

  it('running gear: differentials turn tighter, track links wear slower, tensioners grip', () => {
    const e = newEngine();
    const a = engineSpec(e);
    e.differential = 5;
    e.tracklinks = 5;
    e.tensioners = 5;
    const b = engineSpec(e);
    expect(b.turn).toBeGreaterThan(a.turn * 1.3);
    expect(b.crawlerWear).toBeLessThan(a.crawlerWear * 0.6);
    expect(b.soft).toBeGreaterThan(a.soft + 0.15);
  });
});

describe('fuel from the ground', () => {
  it('drills crude while stopped, and the Automatic Refinery turns it into fuel', { timeout: 30000 }, () => {
    const g = outside(game());
    const p = g.player;
    p.speed = 0;
    expect(setDrill(g, true).ok).toBe(false);
    build(g, 'fuel_drill');
    // Find some decent ground.
    for (let k = 0; k < 40 && oilHere(g) < 0.5; k++) p.x += 97;
    expect(oilHere(g)).toBeGreaterThan(0.3);
    g.titan.fuel = FUEL_MAX * 0.3;
    expect(setDrill(g, true).ok).toBe(true);
    run(g, 12);
    expect(drillRate(g)).toBeGreaterThan(0);
    expect(g.titan.crude).toBeGreaterThan(3);
    expect(Math.abs(p.speed)).toBeLessThan(0.01);
    // No refinery: the crude just sits there.
    const fuel0 = g.titan.fuel;
    build(g, 'fuel_refinery');
    run(g, 5);
    expect(g.titan.fuel).toBeGreaterThan(fuel0);
    expect(g.titan.crude).toBeLessThan(CRUDE_MAX);
    // Open the throttle: the crew raise the drill first, then she moves.
    g.helm.lever = 0.5;
    run(g, 1);
    expect(g.titan.drillWant).toBe(false);
    run(g, 8);
    expect(g.titan.drill).toBe(0);
    expect(p.speed).toBeGreaterThan(0.1);
  });
});
