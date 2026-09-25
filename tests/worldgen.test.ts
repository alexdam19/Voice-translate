import { describe, expect, it } from 'vitest';
import { TILES } from '../src/shared/tiles';
import { generateWarzone } from '../src/shared/warzoneGen';
import { generateWorld, SPAWN_X, CHECKPOINT_X } from '../src/shared/worldgen';
import { ZONES } from '../src/shared/zones';

function hash(a: Uint8Array): number {
  let h = 2166136261;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619);
  return h >>> 0;
}

describe('world generation', () => {
  const g = generateWorld(4242);

  it('is deterministic for a seed', () => {
    const again = generateWorld(4242);
    expect(hash(again.world.tiles)).toBe(hash(g.world.tiles));
    expect(hash(generateWorld(4243).world.tiles)).not.toBe(hash(g.world.tiles));
  });

  it('has six zones covering the whole world', () => {
    expect(ZONES).toHaveLength(6);
    expect(ZONES[0].x0).toBe(0);
    expect(ZONES[ZONES.length - 1].x1).toBe(g.world.w);
  });

  it('flattens the spawn and checkpoint so a rig can park there', () => {
    const top = (x: number) => g.world.skyTop[x];
    for (const center of [SPAWN_X + 20, CHECKPOINT_X]) {
      const tops = Array.from({ length: 30 }, (_, i) => top(center - 15 + i));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
    }
  });

  it('places caches in open air above solid ground', () => {
    expect(g.caches.length).toBeGreaterThan(50);
    for (const c of g.caches.slice(0, 40)) expect(TILES[g.world.get(c.x, c.y)].solid).toBe(false);
  });

  it('seeds zone-specific ores', () => {
    const count = (key: string, x0: number, x1: number): number => {
      let n = 0;
      for (let x = x0; x < x1; x++) for (let y = 0; y < g.world.h; y++) if (TILES[g.world.get(x, y)].key === key) n++;
      return n;
    };
    expect(count('titanium_vein', ZONES[3].x0, ZONES[3].x1)).toBeGreaterThan(100);
    expect(count('uranium_vein', ZONES[4].x0, ZONES[4].x1)).toBeGreaterThan(100);
    expect(count('cryo_vein', ZONES[1].x0, ZONES[1].x1)).toBeGreaterThan(100);
  });

  it('builds the Dead Zone with spawns and extraction points', () => {
    const wz = generateWarzone(99);
    expect(wz.spawns.length).toBeGreaterThan(3);
    expect(wz.extracts.map((e) => e.name)).toContain('METRO EXFIL');
  });
});
