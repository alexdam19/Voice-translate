import { describe, expect, it } from 'vitest';
import { CENTER, MAP_SIZE } from '../src/shared/constants';
import { CH, OBS, TER, TRACTION, ZONE } from '../src/shared/map';
import { generateWorld, RING, threatAt, threatTier } from '../src/shared/mapgen';
import { circleBlocked, findPath, losClear, moveCircle } from '../src/shared/motion';
import { game } from './helpers';

const gen = generateWorld(1234);
gen.focus(CENTER, CENTER);

describe('world generation', () => {
  it('is deterministic', () => {
    const b = generateWorld(1234);
    b.focus(CENTER, CENTER);
    expect(b.nodes.length).toBe(gen.nodes.length);
    expect(b.sites.map((s) => s.name)).toEqual(gen.sites.map((s) => s.name));
    expect(b.regions.map((r) => [r.kind, Math.round(r.x), Math.round(r.y)])).toEqual(gen.regions.map((r) => [r.kind, Math.round(r.x), Math.round(r.y)]));
    for (const [cx, cy] of [[160, 160], [161, 150], [120, 190]]) expect(Array.from(b.map.chunk(cx, cy).ter)).toEqual(Array.from(gen.map.chunk(cx, cy).ter));
  });

  it('is enormous: crossing it takes a good while even flat out', () => {
    const g = game();
    expect(MAP_SIZE).toBeGreaterThanOrEqual(10000);
    // Edge to edge through the middle, flat out on a highway.
    const secs = (RING.EDGE * 2) / (g.player.stats.topSpeed * 1.2);
    expect(secs / 60).toBeGreaterThan(8);
  });

  it('places camp, biomes and features', () => {
    const m = gen.map;
    expect(m.zoneAt(CENTER, CENTER)).toBe(ZONE.RUSTBELT);
    expect(gen.zoneOf(CENTER + 2500, CENTER)).toBe(ZONE.DUNES);
    expect(gen.zoneOf(CENTER, CENTER - 2500)).toBe(ZONE.CRYO);
    expect(gen.zoneOf(CENTER, CENTER + 2500)).toBe(ZONE.GLASS);
    expect(gen.zoneOf(CENTER - 2500, CENTER)).toBe(ZONE.MAGMA);
    expect(gen.zoneOf(CENTER + 4450, CENTER)).toBe(ZONE.ACID);
    expect(gen.zoneOf(CENTER + 5100, CENTER)).toBe(ZONE.EDGE);
    expect(gen.nodes.length).toBeGreaterThan(150);
    expect(gen.sites.length).toBeGreaterThanOrEqual(5);
    // The camp is clear of obstacles.
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) expect(m.solid(CENTER + dx, CENTER + dy)).toBe(false);
  });

  it('has a region of every kind and the Mothership at the edge of the world', () => {
    const kinds = new Set(gen.regions.map((r) => r.kind));
    for (const k of ['city', 'military', 'cyborg', 'zombie', 'necro', 'monster', 'mothership']) expect(kinds.has(k as never)).toBe(true);
    const ms = gen.mothership;
    const d = Math.hypot(ms.x - CENTER, ms.y - CENTER);
    expect(d).toBeGreaterThan(4200);
    expect(d).toBeLessThan(RING.EDGE);
    // Its landing field is clear deck plating.
    expect(gen.map.getTer(Math.floor(ms.x), Math.floor(ms.y))).toBe(TER.METAL);
    // The city is a city: tall buildings.
    const city = gen.regions.find((r) => r.kind === 'city')!;
    let tall = 0;
    for (let y = -30; y < 30; y++) for (let x = -30; x < 30; x++) if (gen.map.getObs(Math.floor(city.x) + x, Math.floor(city.y) + y) && gen.map.getOh(Math.floor(city.x) + x, Math.floor(city.y) + y) >= 14) tall++;
    expect(tall).toBeGreaterThan(20);
  });

  it('streams: far chunks are dropped unless something changed them', () => {
    const w = generateWorld(77);
    const m = w.map;
    m.chunk(10, 10);
    m.chunk(300, 300);
    m.chunk(300, 301).touched = true;
    const before = m.loaded;
    m.evict(300 * CH, 300 * CH, 100);
    expect(m.peek(10, 10)).toBeUndefined();
    expect(m.peek(300, 300)).toBeDefined();
    m.evict(10 * CH, 10 * CH, 100);
    expect(m.peek(300, 301)).toBeDefined();
    expect(m.loaded).toBeLessThan(before);
  });

  it('scales threat with distance from camp', () => {
    expect(threatAt(CENTER, CENTER)).toBe(1);
    expect(threatTier(threatAt(CENTER + 300, CENTER))).toBeLessThan(threatTier(threatAt(CENTER + 3000, CENTER)));
  });

  it('can reach nearby loot areas with a starter tank', () => {
    for (const s of gen.sites.filter((k) => Math.hypot(k.x - CENTER, k.y - CENTER) < 380)) {
      const p = findPath(gen.map, gen.spawn.x, gen.spawn.y, s.x, s.y, { radius: 2, mode: 'ground', traction: TRACTION.wheels, maxNodes: 250000 });
      expect(p, s.name).not.toBeNull();
    }
  });

  it('plans long trips in legs', () => {
    const p = findPath(gen.map, CENTER, CENTER, CENTER + 900, CENTER, { radius: 1, mode: 'crush', climb: true, maxNodes: 200000 });
    expect(p).not.toBeNull();
    const last = p![p!.length - 1];
    // The first leg ends part of the way there, heading the right way.
    expect(last.x).toBeGreaterThan(CENTER + 150);
    expect(last.x).toBeLessThan(CENTER + 900);
  });

  it('keeps acid impassable without hover skirts', () => {
    let found: [number, number] | null = null;
    for (let x = CENTER + 4200; x < CENTER + 4700 && !found; x++) for (let y = CENTER - 40; y < CENTER + 40 && !found; y++) if (gen.map.getTer(x, y) === TER.ACID && !gen.map.getObs(x, y)) found = [x, y];
    expect(found).not.toBeNull();
    const [x, y] = found!;
    expect(gen.map.blocked(x, y, 'ground')).toBe(true);
    expect(gen.map.blocked(x, y, 'magma')).toBe(true);
    expect(gen.map.blocked(x, y, 'hover')).toBe(false);
  });
});

describe('motion', () => {
  /** An obstacle tile with open ground west of it, near camp. */
  function obstacleWithRoom(): [number, number] {
    const m = gen.map;
    const free = (a: number, b: number): boolean => !m.blocked(a, b, 'ground');
    for (let y = CENTER - 200; y < CENTER + 200; y++) {
      for (let x = CENTER - 200; x < CENTER + 200; x++) {
        if (m.getObs(x, y) && free(x - 1, y) && free(x - 2, y) && free(x - 3, y) && free(x - 2, y - 1) && free(x - 2, y + 1) && !m.solid(x + 3, y) && !m.solid(x - 3, y)) return [x, y];
      }
    }
    throw new Error('no obstacle found');
  }

  it('slides circles along walls and never ends inside one', () => {
    const m = gen.map;
    const [ox, oy] = obstacleWithRoom();
    const r = moveCircle(m, ox - 2.5, oy + 0.5, 0.4, 3, 0, 'ground');
    expect(r.hit).toBe(true);
    expect(circleBlocked(m, r.x, r.y, 0.39, 'ground')).toBe(false);
    expect(r.x).toBeLessThan(ox);
  });

  it('line of sight is blocked by obstacles', () => {
    const m = gen.map;
    const [x, y] = obstacleWithRoom();
    expect(losClear(m, x - 3 + 0.5, y + 0.5, x + 3 + 0.5, y + 0.5)).toBe(false);
    expect(losClear(m, CENTER - 5, CENTER, CENTER + 5, CENTER)).toBe(true);
    void OBS;
  });
});
