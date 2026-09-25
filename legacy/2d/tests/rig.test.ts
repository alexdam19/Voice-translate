import { describe, expect, it } from 'vitest';
import { TILE } from '../src/shared/constants';
import { T } from '../src/shared/tiles';
import { World } from '../src/shared/world';
import { Rig } from '../src/game/rig';
import { MODULES, RT } from '../src/game/rigDefs';
import { buildOutpost, buildRaiderRig, buildStarterRig } from '../src/game/rigTemplates';

function strip(material: number, len = 400): World {
  const w = new World(len, 80);
  for (let x = 0; x < len; x++) {
    const top = 60 - Math.floor(Math.max(0, x - 120) / 3); // flat, then a gentle 1-in-3 slope
    for (let y = Math.max(20, top); y < 80; y++) w.setRaw(x, y, material);
  }
  w.finalize();
  return w;
}

function drive(r: Rig, w: World, seconds: number): number {
  const x0 = r.x;
  r.throttle = 1;
  for (let i = 0; i < seconds * 60; i++) r.driveStep(1 / 60, w, [r]);
  return (r.x - x0) / TILE;
}

describe('rigs', () => {
  it('starter rig is a tank: glacis hull, main battery, crew with roles', () => {
    const r = buildStarterRig();
    expect(r.cols).toBe(48);
    expect(r.modules.some((m) => m.def.key === 'main_battery')).toBe(true);
    expect([...r.tiles].filter((t) => t === RT.GLACIS_L || t === RT.GLACIS_R).length).toBe(8);
    expect(r.crew.map((c) => c.role).sort()).toEqual(['driver', 'engineer', 'gunner', 'gunner']);
  });

  it('starter rig is complete and powered', () => {
    const r = buildStarterRig();
    expect(r.hasCockpit).toBe(true);
    expect(r.powerProd).toBeGreaterThanOrEqual(r.powerUse);
    expect(r.bunks).toBeGreaterThanOrEqual(r.crew.length);
    expect(r.cargo.size).toBe(48);
    expect(r.stations.has('refinery')).toBe(true);
  });

  it('drives and climbs on hard ground', () => {
    const w = strip(T.ROCK);
    const r = buildStarterRig();
    r.placeOnGround(w, 10);
    const y0 = r.y;
    const moved = drive(r, w, 20);
    expect(moved).toBeGreaterThan(80);
    expect(r.y).toBeLessThan(y0); // climbed the slope
  });

  it('bogs down in sand on wheels but not on dune tracks', () => {
    const wheels = buildStarterRig();
    const w1 = strip(T.SAND);
    wheels.placeOnGround(w1, 10);
    const slow = drive(wheels, w1, 10);
    const tracks = buildStarterRig();
    tracks.drive = 'tracks';
    tracks.recalc();
    const w2 = strip(T.SAND);
    tracks.placeOnGround(w2, 10);
    const fast = drive(tracks, w2, 10);
    expect(wheels.terrain).toBe('sand');
    expect(fast).toBeGreaterThan(slow * 4);
  });

  it('validates module placement', () => {
    const r = buildStarterRig();
    const garage = MODULES.garage;
    expect(r.checkModule(garage, 30, 11)).toBeNull();
    expect(r.checkModule(MODULES.autocannon, 14, 0)).toBe('Needs a floor underneath');
    expect(r.checkModule(garage, 20, 2)).toBe('Overlaps a module');
    expect(r.checkModule(MODULES.cockpit, 28, 10)).toBe('Only one allowed');
    expect(r.checkModule(MODULES.drill, 20, 8)).not.toBeNull();
  });

  it('destroying the bridge fires the hook and chassis is indestructible', () => {
    const r = buildRaiderRig(2, 7, false);
    const destroyed: string[] = [];
    Rig.hooks = { ...Rig.hooks, moduleDestroyed: (_r, m) => destroyed.push(m.def.key) };
    const c = r.modules.find((m) => m.def.key === 'cockpit')!;
    r.damageModule(c, 1e6);
    expect(destroyed).toContain('cockpit');
    expect(r.hasCockpit).toBe(false);
    r.damageTile(0, r.rows - 1, 1e6);
    expect(r.tileAt(0, r.rows - 1)).toBe(RT.CHASSIS);
  });

  it('round-trips through save data', () => {
    const r = buildStarterRig();
    r.cargo.add('xenite', 3);
    r.x = 1234;
    const copy = Rig.deserialize(JSON.parse(JSON.stringify(r.serialize())));
    expect(copy.modules.map((m) => m.def.key)).toEqual(r.modules.map((m) => m.def.key));
    expect(copy.cargo.count('xenite')).toBe(3);
    expect(copy.x).toBe(1234);
  });

  it('builds outposts for every zone', () => {
    for (let z = 0; z < 6; z++) {
      const o = buildOutpost(z, 11 + z);
      expect(o.anchored).toBe(true);
      expect(o.modules.some((m) => m.def.key === 'cockpit')).toBe(true);
    }
  });
});
