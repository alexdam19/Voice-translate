import { describe, expect, it } from 'vitest';
import { chewPart } from '../src/game/systems/titan';
import { dispatchTeam, openJobs } from '../src/game/systems/crewops';
import { damageTank } from '../src/game/systems/damage';
import { deserialize, serialize } from '../src/game/save';
import { stepWorld } from '../src/game/systems/step';
import { compIndex, crawlersUp, damageState, FUEL_MAX, startFire, titanMods, updateTitan, zoneFrom } from '../src/game/systems/titan';
import { game } from './helpers';

describe('Titan systems', () => {
  it('hits land on the armour zone they come from, and a worn zone lets more through', () => {
    const g = game();
    const p = g.player;
    const bow = p.toWorld(p.stats.length / 2 + 20, 0), port = p.toWorld(0, -p.stats.width / 2 - 20);
    expect(zoneFrom(p, bow.x, bow.y)).toBe('bow');
    expect(zoneFrom(p, port.x, port.y)).toBe('port');
    const hp0 = p.hp;
    damageTank(g, p, 300, { at: bow });
    expect(g.titan.zones.bow).toBeLessThan(1);
    expect(g.titan.zones.stern).toBe(1);
    const first = hp0 - p.hp;
    g.titan.zones.bow = 0;
    const hp1 = p.hp;
    damageTank(g, p, 300, { at: bow });
    expect(hp1 - p.hp).toBeGreaterThan(first * 1.2);
  });

  it('subsystems go through five damage states and lost crawlers cost speed and pull the hull round', () => {
    expect([0.95, 0.7, 0.5, 0.2, 0.05].map((h) => damageState(h).name)).toEqual(['Operational', 'Damaged', 'Degraded', 'Critical', 'Disabled']);
    const g = game();
    const p = g.player;
    const top = p.stats.topSpeed;
    g.titan.crawlers[0] = 0;
    g.titan.crawlers[1] = 0;
    expect(crawlersUp(g.titan)).toEqual([2, 4]);
    const m = titanMods(g.titan);
    expect(m.speed).toBeLessThan(0.85);
    expect(m.pull).toBeGreaterThan(0);
    updateTitan(g, 0.1);
    expect(p.stats.topSpeed).toBeLessThan(top);
    g.titan.systems.weapons = 0.2;
    updateTitan(g, 0.1);
    expect(p.titanMods.weapons).toBeLessThan(0.5);
  });

  it('fires spread when left, and damage control puts them out', () => {
    const g = game();
    const p = g.player;
    const i = compIndex(4, 1);
    startFire(g, i, 0.9);
    // No crews, no sprinklers: it spreads.
    g.titan.systems.life = 0;
    for (let k = 0; k < 30 * 120; k++) {
      p.stats.depts.works = [0, 0];
      g.titan.systems.life = 0;
      updateTitan(g, 1 / 30);
    }
    expect(g.titan.fire.filter((f) => f > 0).length).toBeGreaterThan(1);
    // Crews and a working life support get on top of it (held working: a fire in its own compartment can burn it out).
    g.titan.systems.life = 1;
    p.stats.depts.works = [8, 8];
    for (let k = 0; k < 30 * 240 && g.titan.fire.some((f) => f > 0); k++) {
      p.stats.depts.works = [8, 8];
      g.titan.systems.life = 1;
      updateTitan(g, 1 / 30);
    }
    expect(g.titan.fire.every((f) => f === 0)).toBe(true);
  });

  it('burns fuel driving, runs slow when it is gone, and repairs itself for scrap', () => {
    const g = game();
    const p = g.player;
    g.driveInput = { x: 0, y: -1, active: true };
    for (let k = 0; k < 30 * 30; k++) stepWorld(g, 1 / 30);
    expect(g.titan.fuel).toBeLessThan(FUEL_MAX);
    const top = p.stats.topSpeed;
    g.titan.fuel = 0;
    p.cargo.take('scrap', p.cargo.count('scrap'));
    updateTitan(g, 0.1);
    expect(p.stats.topSpeed).toBeLessThan(top * 0.5);
    // Repairs.
    g.driveInput.active = false;
    p.cargo.add('scrap', 200);
    g.titan.systems.sensors = 0.5;
    const scrap = p.cargo.count('scrap');
    for (let k = 0; k < 30 * 60; k++) updateTitan(g, 1 / 30);
    expect(g.titan.systems.sensors).toBeGreaterThan(0.5);
    expect(p.cargo.count('scrap')).toBeLessThan(scrap);
  });

  it('saves and loads the Titan state', () => {
    const g = game();
    g.titan.crawlers[5] = 0.3;
    g.titan.fire[compIndex(7, 2)] = 0.5;
    g.titan.fuel = 777;
    g.player.engine.block = 3;
    g.player.engine.nitro = 2;
    g.player.engine.tracklinks = 4;
    g.player.enginesOwned.push('orca');
    g.player.engineKey = 'orca';
    g.titan.crude = 321;
    const d = deserialize(JSON.parse(JSON.stringify(serialize(g))));
    expect(d.titan.crawlers[5]).toBeCloseTo(0.3);
    expect(d.titan.fire[compIndex(7, 2)]).toBeCloseTo(0.5);
    expect(d.titan.fuel).toBeCloseTo(777);
    expect(d.titan.crude).toBeCloseTo(321);
    expect(d.player.engine).toMatchObject({ block: 3, turbo: 0, gearbox: 0, nitro: 2, radiator: 0, tracklinks: 4, flywheel: 0 });
    expect(d.player.engineKey).toBe('orca');
    expect(d.player.enginesOwned).toContain('orca');
  });
});

describe('boarders', () => {
  it('chew on every part: a wrecked gun goes quiet until a repair team fixes it', { timeout: 60000 }, () => {
    const g = game();
    const p = g.player;
    const gun = p.modules.find((m) => m.deck === 0 && m.weapon)!;
    const l = p.moduleLocal(gun);
    for (let i = 0; i < 1000 && (gun.wreck ?? 0) < 1; i++) chewPart(g, p, l.lx, l.lz, 20);
    expect(gun.wreck).toBe(1);
    expect(openJobs(g).some((j) => j.kind === 'gun')).toBe(true);
    // The crawler guards along the edge, the toroid at a corner.
    chewPart(g, p, p.stats.length * 0.22, -p.stats.width / 2 + 1, 400);
    expect(g.titan.crawlers.some((v) => v < 1)).toBe(true);
    chewPart(g, p, p.stats.length * 0.35, p.stats.width * 0.4, 400);
    expect(g.titan.toroids.some((v) => v < 1)).toBe(true);
    p.cargo.add('scrap', 400);
    g.autoRepair = false;
    expect(dispatchTeam(g, 'gun', String(gun.id))).toBeNull();
    for (let t = 0; t < 90 && (gun.wreck ?? 0) > 0; t += 1 / 30) stepWorld(g, 1 / 30);
    expect(gun.wreck ?? 0).toBe(0);
  });
});
