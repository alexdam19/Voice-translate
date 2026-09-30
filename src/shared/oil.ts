import { ZONE } from './map';
import { hash2 } from './rng';

/**
 * Crude oil under the Crater: how rich the ground is at a spot (0 = dry, 1 = a good field, up to 2 in the best
 * pockets). Each biome has its own baseline (the scorched flats and the Divot are soaked in it, the frost and the
 * spires are nearly dry), broad kilometre-wide swells on top, and here and there a rich pocket a few hundred metres
 * across where the drill really pays. Deterministic: the same spot always holds the same.
 */

const BASE: Record<number, number> = {
  [ZONE.SCORCHED]: 0.75, [ZONE.DIVOT]: 0.85, [ZONE.DUNES]: 0.6, [ZONE.LAKE]: 0.65, [ZONE.ASH]: 0.5, [ZONE.RUSTBOLT]: 0.5,
  [ZONE.PASS]: 0.4, [ZONE.VERDANT]: 0.35, [ZONE.WRAITH]: 0.3, [ZONE.FROST]: 0.25, [ZONE.SPIRES]: 0.2, [ZONE.EDGE]: 0.1,
};

function vnoise(x: number, y: number, cell: number, seed: number): number {
  const fx0 = x / cell, fy0 = y / cell;
  const gx = Math.floor(fx0), gy = Math.floor(fy0);
  const fx = fx0 - gx, fy = fy0 - gy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(gx, gy, seed), b = hash2(gx + 1, gy, seed), c = hash2(gx, gy + 1, seed), d = hash2(gx + 1, gy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Oil richness at (x, y) in a zone. */
export function oilAt(x: number, y: number, zone: number): number {
  const base = BASE[zone] ?? 0.4;
  const swell = 0.35 + 1.1 * vnoise(x, y, 900, 8101);
  const pocket = vnoise(x, y, 260, 8102);
  const rich = pocket > 0.7 ? ((pocket - 0.7) / 0.3) * 1.2 : 0;
  return Math.max(0, Math.min(2, base * swell + rich * (0.4 + base)));
}

/** A word for a richness (the survey readout). */
export const oilWord = (v: number): string => (v >= 1.4 ? 'GUSHER' : v >= 1 ? 'RICH' : v >= 0.6 ? 'FAIR' : v >= 0.3 ? 'THIN' : 'DRY');
