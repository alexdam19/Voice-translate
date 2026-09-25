import { ZONE_W } from './constants';
import { T } from './tiles';
import type { Hazard, RGB } from './types';

export type ParticleStyle = 'dust' | 'sand' | 'snow' | 'embers' | 'spores' | 'rad';

export interface ZoneDef {
  key: string;
  index: number;
  name: string;
  tagline: string;
  x0: number;
  x1: number;
  difficulty: number;
  hazard: Hazard | null;
  /** Drive trains that handle this zone's terrain. null = anything works. */
  drives: string[] | null;
  /** Human readable requirement shown when entering the zone. */
  requirement: string;
  surface: number;
  surfaceDepth: number;
  sub: number;
  subDepth: number;
  deep: number;
  sky: { top: RGB; mid: RGB; low: RGB };
  night: { top: RGB; low: RGB };
  haze: RGB;
  sun: RGB;
  silhouette: RGB;
  particles: ParticleStyle;
  accent: string;
  enemyTint: RGB;
  enemyNames: { crawler: string; gunner: string; drone: string; brute: string };
}

function zone(index: number, z: Omit<ZoneDef, 'index' | 'x0' | 'x1'>): ZoneDef {
  return { ...z, index, x0: index * ZONE_W, x1: (index + 1) * ZONE_W };
}

/** Zones run west -> east. The player starts in the Rustbelt (index 2). */
export const ZONES: ZoneDef[] = [
  zone(0, {
    key: 'magma', name: 'MAGMA RIFT', tagline: 'The crust split open when the core taps ran dry.',
    difficulty: 4, hazard: 'heat', drives: ['magma', 'hover'],
    requirement: 'Magma Treads + Thermal Regulator',
    surface: T.ASH, surfaceDepth: 3, sub: T.BASALT, subDepth: 30, deep: T.BASALT,
    sky: { top: [26, 8, 12], mid: [96, 26, 16], low: [196, 74, 30] },
    night: { top: [8, 2, 6], low: [80, 22, 10] },
    haze: [150, 50, 24], sun: [255, 120, 60], silhouette: [40, 12, 12],
    particles: 'embers', accent: '#ff6e40', enemyTint: [255, 110, 60],
    enemyNames: { crawler: 'Cinder Hound', gunner: 'Slag Raider', drone: 'Ember Drone', brute: 'Magma Golem' },
  }),
  zone(1, {
    key: 'cryo', name: 'CRYO SPIRES', tagline: 'A climate engine failed here and froze the sky.',
    difficulty: 2, hazard: 'cold', drives: ['chains', 'magma', 'hover'],
    requirement: 'Spiked Chains + Thermal Regulator',
    surface: T.SNOW, surfaceDepth: 2, sub: T.ICE, subDepth: 16, deep: T.ROCK,
    sky: { top: [20, 28, 60], mid: [70, 110, 160], low: [180, 214, 236] },
    night: { top: [4, 6, 20], low: [30, 50, 90] },
    haze: [170, 200, 230], sun: [230, 245, 255], silhouette: [70, 96, 130],
    particles: 'snow', accent: '#40c4ff', enemyTint: [140, 210, 255],
    enemyNames: { crawler: 'Frost Stalker', gunner: 'Rime Raider', drone: 'Icicle Drone', brute: 'Glacier Hulk' },
  }),
  zone(2, {
    key: 'rustbelt', name: 'RUSTBELT FLATS', tagline: 'What is left of the old megacity sprawl.',
    difficulty: 1, hazard: null, drives: null,
    requirement: 'No special equipment required',
    surface: T.DIRT, surfaceDepth: 6, sub: T.ROCK, subDepth: 60, deep: T.ROCK,
    sky: { top: [34, 40, 58], mid: [150, 110, 90], low: [236, 164, 100] },
    night: { top: [6, 8, 18], low: [50, 36, 50] },
    haze: [200, 140, 100], sun: [255, 214, 150], silhouette: [58, 50, 58],
    particles: 'dust', accent: '#ffb74d', enemyTint: [220, 170, 120],
    enemyNames: { crawler: 'Rust Crawler', gunner: 'Scav Raider', drone: 'Scav Drone', brute: 'Junk Brute' },
  }),
  zone(3, {
    key: 'dunes', name: 'THE DUNE SEA', tagline: 'An ocean of sand swallowing the old highways.',
    difficulty: 2, hazard: null, drives: ['tracks', 'magma', 'hover'],
    requirement: 'Dune Tracks (standard wheels bog down)',
    surface: T.SAND, surfaceDepth: 16, sub: T.SANDSTONE, subDepth: 45, deep: T.ROCK,
    sky: { top: [40, 70, 120], mid: [200, 160, 110], low: [255, 214, 140] },
    night: { top: [8, 10, 24], low: [60, 50, 60] },
    haze: [240, 200, 140], sun: [255, 240, 200], silhouette: [150, 110, 80],
    particles: 'sand', accent: '#ffd54f', enemyTint: [230, 200, 130],
    enemyNames: { crawler: 'Dune Skitter', gunner: 'Sand Reaver', drone: 'Mirage Drone', brute: 'Burrow Titan' },
  }),
  zone(4, {
    key: 'glass', name: 'GLASS CRATER', tagline: 'Ground zero. The sand turned to glass and never cooled.',
    difficulty: 3, hazard: 'rad', drives: null,
    requirement: 'Rad Baffles (rig) / Rad Suit (on foot)',
    surface: T.GLASS, surfaceDepth: 3, sub: T.ROCK, subDepth: 60, deep: T.ROCK,
    sky: { top: [20, 36, 20], mid: [110, 140, 60], low: [210, 230, 120] },
    night: { top: [4, 10, 4], low: [30, 60, 20] },
    haze: [170, 220, 100], sun: [230, 255, 170], silhouette: [40, 60, 34],
    particles: 'rad', accent: '#c6ff00', enemyTint: [180, 255, 110],
    enemyNames: { crawler: 'Glow Mutant', gunner: 'Fallout Raider', drone: 'Geiger Drone', brute: 'Isotope Brute' },
  }),
  zone(5, {
    key: 'acid', name: 'ACID MARSH', tagline: 'Chemical runoff from a thousand dead factories.',
    difficulty: 5, hazard: 'toxic', drives: ['hover'],
    requirement: 'Hover Skirts + Hull Sealant Pump',
    surface: T.MUD, surfaceDepth: 5, sub: T.ROCK, subDepth: 60, deep: T.ROCK,
    sky: { top: [20, 16, 30], mid: [60, 70, 50], low: [120, 150, 80] },
    night: { top: [4, 4, 10], low: [20, 40, 20] },
    haze: [110, 150, 80], sun: [200, 255, 160], silhouette: [34, 40, 34],
    particles: 'spores', accent: '#00e676', enemyTint: [120, 255, 150],
    enemyNames: { crawler: 'Bog Lurker', gunner: 'Toxin Raider', drone: 'Spore Drone', brute: 'Sludge Behemoth' },
  }),
];

export function zoneIndexAt(tx: number): number {
  const i = Math.floor(tx / ZONE_W);
  return i < 0 ? 0 : i >= ZONES.length ? ZONES.length - 1 : i;
}

export function zoneAt(tx: number): ZoneDef {
  return ZONES[zoneIndexAt(tx)];
}

/** Stand-in zone used for the multiplayer Dead Zone map. */
export const DEAD_ZONE: ZoneDef = {
  ...ZONES[2],
  key: 'deadzone', index: -1, name: 'THE DEAD ZONE', tagline: 'No law. No insurance. What you drop is theirs.',
  difficulty: 3, hazard: null, requirement: 'Everything in your pack is at risk',
  sky: { top: [16, 10, 26], mid: [90, 40, 70], low: [200, 80, 90] },
  night: { top: [4, 2, 10], low: [60, 20, 40] },
  haze: [180, 70, 90], sun: [255, 120, 140], silhouette: [34, 20, 40],
  particles: 'embers', accent: '#ff1744',
};
