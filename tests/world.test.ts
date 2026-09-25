import { describe, expect, it } from 'vitest';
import { CENTER } from '../src/shared/constants';
import { TER, TRACTION, ZONE } from '../src/shared/map';
import { generateWorld, threatAt, threatTier } from '../src/shared/mapgen';
import { circleBlocked, findPath, losClear, moveCircle } from '../src/shared/motion';

const gen = generateWorld(1234);

describe('world generation', () => {
  it('is deterministic', () => {
    const b = generateWorld(1234);
    expect(b.nodes.length).toBe(gen.nodes.length);
    expect(b.sites.map((s) => s.name)).toEqual(gen.sites.map((s) => s.name));
    expect(Array.from(b.map.ter.slice(0, 5000))).toEqual(Array.from(gen.map.ter.slice(0, 5000)));
  });

  it('places camp, zones and features', () => {
    const m = gen.map;
    expect(m.zoneAt(CENTER, CENTER)).toBe(ZONE.RUSTBELT);
    expect(m.zoneAt(CENTER + 170, CENTER)).toBe(ZONE.DUNES);
    expect(m.zoneAt(CENTER, CENTER - 170)).toBe(ZONE.CRYO);
    expect(m.zoneAt(CENTER, CENTER + 170)).toBe(ZONE.GLASS);
    expect(m.zoneAt(CENTER - 170, CENTER)).toBe(ZONE.MAGMA);
    expect(m.zoneAt(CENTER + 270, CENTER)).toBe(ZONE.ACID);
    expect(gen.sites.length).toBeGreaterThanOrEqual(30);
    expect(gen.runes.length).toBeGreaterThanOrEqual(15);
    expect(gen.outposts.length).toBeGreaterThanOrEqual(12);
    expect(gen.nodes.length).toBeGreaterThan(500);
    // The camp is clear of obstacles.
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) expect(m.solid(CENTER + dx, CENTER + dy)).toBe(false);
  });

  it('scales threat with distance from camp', () => {
    expect(threatAt(CENTER, CENTER)).toBe(1);
    expect(threatTier(threatAt(CENTER + 60, CENTER))).toBeLessThan(threatTier(threatAt(CENTER + 280, CENTER)));
  });

  it('can reach every loot area outside the acid ring with a starter tank', () => {
    for (const s of gen.sites.filter((k) => k.zone !== ZONE.ACID)) {
      const p = findPath(gen.map, gen.spawn.x, gen.spawn.y, s.x, s.y, { radius: 2, mode: 'ground', traction: TRACTION.wheels, maxNodes: 250000 });
      expect(p, s.name).not.toBeNull();
      const last = p![p!.length - 1];
      expect(Math.hypot(last.x - s.x, last.y - s.y)).toBeLessThan(8);
    }
  });

  it('keeps acid impassable without hover skirts', () => {
    const i = gen.map.ter.findIndex((t) => t === TER.ACID);
    const x = i % gen.map.size, y = Math.floor(i / gen.map.size);
    expect(gen.map.blocked(x, y, 'ground')).toBe(true);
    expect(gen.map.blocked(x, y, 'magma')).toBe(true);
    expect(gen.map.blocked(x, y, 'hover')).toBe(false);
  });
});

describe('motion', () => {
  it('slides circles along walls and never ends inside one', () => {
    const m = gen.map;
    // Find an obstacle tile with free space west of it.
    let ox = -1, oy = -1;
    for (let i = 0; i < m.obs.length && ox < 0; i++) {
      const x = i % m.size, y = Math.floor(i / m.size);
      const free = (a: number, b: number): boolean => !m.blocked(a, b, 'ground');
      if (m.obs[i] && x > 3 && free(x - 1, y) && free(x - 2, y) && free(x - 3, y) && free(x - 2, y - 1) && free(x - 2, y + 1)) {
        ox = x;
        oy = y;
      }
    }
    const r = moveCircle(m, ox - 2.5, oy + 0.5, 0.4, 3, 0, 'ground');
    expect(r.hit).toBe(true);
    expect(circleBlocked(m, r.x, r.y, 0.39, 'ground')).toBe(false);
    expect(r.x).toBeLessThan(ox);
  });

  it('line of sight is blocked by obstacles', () => {
    const m = gen.map;
    const i = m.obs.findIndex((o, k) => o !== 0 && !m.solid((k % m.size) - 3, Math.floor(k / m.size)) && !m.solid((k % m.size) + 3, Math.floor(k / m.size)));
    const x = i % m.size, y = Math.floor(i / m.size);
    expect(losClear(m, x - 3 + 0.5, y + 0.5, x + 3 + 0.5, y + 0.5)).toBe(false);
    expect(losClear(m, CENTER - 5, CENTER, CENTER + 5, CENTER)).toBe(true);
  });
});
