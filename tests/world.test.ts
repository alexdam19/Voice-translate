import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../src/shared/constants';
import { craterZone, DIVOT, LOCATIONS, locationById, WORLD_KM } from '../src/shared/crater';
import { CH, OBS, TER, TRACTION, ZONE } from '../src/shared/map';
import { generateWorld, HANGAR, threatAt, threatTier } from '../src/shared/mapgen';
import { circleBlocked, findPath, losClear, moveCircle } from '../src/shared/motion';
import { game } from './helpers';

const gen = generateWorld(1234);
const H = gen.hangar!;
gen.focus(H.x, H.y);

describe('The Crater', () => {
  it('is deterministic', () => {
    const b = generateWorld(1234);
    b.focus(H.x, H.y);
    expect(b.nodes.length).toBe(gen.nodes.length);
    expect(b.sites.map((s) => s.name)).toEqual(gen.sites.map((s) => s.name));
    expect(b.regions.map((r) => [r.kind, Math.round(r.x), Math.round(r.y)])).toEqual(gen.regions.map((r) => [r.kind, Math.round(r.x), Math.round(r.y)]));
    const cx = Math.floor(H.x / CH), cy = Math.floor(H.y / CH);
    for (const [dx, dy] of [[0, 0], [3, 5], [-4, 12]]) expect(Array.from(b.map.chunk(cx + dx, cy + dy).ter)).toEqual(Array.from(gen.map.chunk(cx + dx, cy + dy).ter));
  });

  it('is 140 km across: crossing it is a long drive even flat out on overdrive', () => {
    const g = game();
    expect(MAP_SIZE).toBe(140000);
    expect(WORLD_KM).toBe(140);
    const secs = (MAP_SIZE * 0.9) / (g.player.stats.topSpeed * 1.45);
    expect(secs / 60).toBeGreaterThan(15);
  });

  it('puts every place from the map in its zone', () => {
    const want: Record<string, number> = {
      mega_hangar: ZONE.DUNES, the_divot: ZONE.DIVOT, northridge: ZONE.FROST, iron_hollow: ZONE.LAKE, verdant_town: ZONE.VERDANT,
      blood_eagle: ZONE.ASH, rustbolt_camp: ZONE.RUSTBOLT, dead_mans_camp: ZONE.PASS, black_lake_poi: ZONE.LAKE, broken_spires_poi: ZONE.SPIRES,
    };
    for (const l of LOCATIONS) expect(craterZone(l.x, l.y), l.id).toBe(want[l.id]);
    // The Wraith Peaks sit in the north-east corner, the Scorched Basin in the west; the wall rings it all.
    expect(craterZone(0.86 * MAP_SIZE, 0.12 * MAP_SIZE)).toBe(ZONE.WRAITH);
    expect(craterZone(0.18 * MAP_SIZE, 0.3 * MAP_SIZE)).toBe(ZONE.SCORCHED);
    expect(craterZone(0.02 * MAP_SIZE, 0.5 * MAP_SIZE)).toBe(ZONE.EDGE);
    expect(craterZone(0.5 * MAP_SIZE, 0.985 * MAP_SIZE)).toBe(ZONE.EDGE);
    expect(craterZone(DIVOT.x, DIVOT.y)).toBe(ZONE.DIVOT);
  });

  it('starts you inside the Mega Hangar, facing an open door', () => {
    const m = gen.map;
    const hg = locationById('mega_hangar');
    expect(Math.abs(H.x - hg.x)).toBeLessThan(1);
    expect(Math.abs(gen.spawn.x - H.x)).toBeLessThan(HANGAR.w / 2);
    expect(Math.abs(gen.spawn.y - H.y)).toBeLessThan(HANGAR.d / 2);
    // The floor where the Titan parks is clear.
    for (let dy = -100; dy <= 100; dy += 3) for (let dx = -45; dx <= 45; dx += 3) expect(m.solid(Math.floor(gen.spawn.x + dx), Math.floor(gen.spawn.y + dy))).toBe(false);
    // Walls on the north side; the south door is open.
    let wall = 0;
    for (let x = -200; x <= 200; x += 5) if (m.getObs(Math.floor(H.x + x), Math.floor(H.y - HANGAR.d / 2))) wall++;
    expect(wall).toBeGreaterThan(60);
    for (let x = -HANGAR.door / 2 + 10; x <= HANGAR.door / 2 - 10; x += 5) expect(m.solid(Math.floor(H.x + x), Math.floor(H.y + HANGAR.d / 2))).toBe(false);
  });

  it('has the named places as regions and features around the hangar', () => {
    const keys = new Set(gen.regions.map((r) => r.key));
    for (const l of LOCATIONS) expect(keys.has(l.id)).toBe(true);
    expect(gen.regions.find((r) => r.key === 'mega_hangar')!.kind).toBe('hangar');
    expect(gen.regions.filter((r) => r.kind === 'raider').length).toBe(3);
    expect(gen.nodes.length).toBeGreaterThan(20);
  });

  it('streams: far chunks are dropped unless something changed them', () => {
    const w = generateWorld(77);
    const m = w.map;
    const bx = Math.floor(H.x / CH), by = Math.floor(H.y / CH);
    m.chunk(bx, by);
    m.chunk(bx + 300, by);
    m.chunk(bx + 300, by + 1).touched = true;
    const before = m.loaded;
    m.evict((bx + 300) * CH, by * CH, 100);
    expect(m.peek(bx, by)).toBeUndefined();
    expect(m.peek(bx + 300, by)).toBeDefined();
    m.evict(bx * CH, by * CH, 100);
    expect(m.peek(bx + 300, by + 1)).toBeDefined();
    expect(m.loaded).toBeLessThan(before);
  });

  it('gets more dangerous toward the Divot and the far zones', () => {
    expect(threatTier(threatAt(gen.spawn.x, gen.spawn.y))).toBe(1);
    const pass = locationById('dead_mans_camp');
    expect(threatAt(pass.x, pass.y)).toBeGreaterThan(threatAt(gen.spawn.x, gen.spawn.y));
    expect(threatTier(threatAt(DIVOT.x, DIVOT.y))).toBeGreaterThanOrEqual(4);
  });

  it('drives out of the hangar door and plans long trips in legs', () => {
    const out = findPath(gen.map, gen.spawn.x, gen.spawn.y, H.x, H.y + HANGAR.d / 2 + 200, { radius: 2, mode: 'ground', traction: TRACTION.wheels, maxNodes: 250000 });
    expect(out).not.toBeNull();
    const sx = H.x, sy = H.y + HANGAR.d / 2 + 300;
    const p = findPath(gen.map, sx, sy, sx + 900, sy, { radius: 1, mode: 'crush', climb: true, maxNodes: 200000 });
    expect(p).not.toBeNull();
    const last = p![p!.length - 1];
    expect(last.x).toBeGreaterThan(sx + 150);
    expect(last.x).toBeLessThanOrEqual(sx + 900);
  });

  it('fills the Black Lake with toxic water only hover skirts cross', () => {
    const lk = locationById('black_lake_poi');
    gen.focus(lk.x, lk.y);
    let found: [number, number] | null = null;
    for (let r = 0; r < 3000 && !found; r += 7) {
      for (let a = 0; a < 6.28 && !found; a += 0.3) {
        const x = Math.floor(lk.x + Math.cos(a) * r), y = Math.floor(lk.y + Math.sin(a) * r);
        if (gen.map.getTer(x, y) === TER.ACID && !gen.map.getObs(x, y)) found = [x, y];
      }
    }
    expect(found).not.toBeNull();
    const [x, y] = found!;
    expect(gen.map.blocked(x, y, 'ground')).toBe(true);
    expect(gen.map.blocked(x, y, 'hover')).toBe(false);
    gen.focus(H.x, H.y);
  });
});

describe('motion', () => {
  /** An obstacle tile with open ground west of it, near the hangar. */
  function obstacleWithRoom(): [number, number] {
    const m = gen.map;
    const free = (a: number, b: number): boolean => !m.blocked(a, b, 'ground');
    const x0 = Math.floor(H.x), y0 = Math.floor(H.y + HANGAR.d / 2 + 400);
    for (let y = y0 - 400; y < y0 + 400; y++) {
      for (let x = x0 - 400; x < x0 + 400; x++) {
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
    expect(losClear(m, gen.spawn.x - 5, gen.spawn.y, gen.spawn.x + 5, gen.spawn.y)).toBe(true);
    void OBS;
  });
});
