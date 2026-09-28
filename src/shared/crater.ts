import { MAP_SIZE } from './constants';
import { ZONE } from './map';
import { Perlin } from './noise';

/**
 * The Crater: a post-impact wasteland 140 km across (the reference map and crater_world_1.json). One asteroid
 * left a city-sized divot in the middle; ten regions ring it. The geography is fixed (every save has the same
 * map); the world seed only changes the details (features, ruins, noise).
 *
 * Positions are normalized 0-1 across the map (u = west to east, v = north to south) and scaled by MAP_SIZE.
 */

export const WORLD_KM = MAP_SIZE / 1000;
const S = MAP_SIZE;

/** Enemy entry: [name, min size m, max size m (null = or larger)]. */
export type RosterEntry = [string, number, number | null];

export interface ZoneInfo {
  key: string;
  name: string;
  label: string;
  danger: number;
  resources: number;
  hazards: string[];
  roster: RosterEntry[];
}

export const ZONE_INFO: Record<number, ZoneInfo> = {
  [ZONE.VERDANT]: {
    key: 'verdant_fields', name: 'Verdant Fields', label: 'Farms, forests, abandoned towns', danger: 1, resources: 1.2, hazards: [],
    roster: [['Rabbit Mutant', 1, 2], ['Feral Dog Pack', 2, 4], ['Rat Swarm', 0.5, 1.5], ['Raider Scout', 3, 5], ['Armored Boar', 4, 7], ['Forest Terror', 8, 12], ['Bandit War Rig', 12, 20]],
  },
  [ZONE.ASH]: {
    key: 'ash_fields', name: 'The Ash Fields', label: 'Impact debris, dead zone', danger: 2, resources: 0.5, hazards: ['ash_visibility'],
    roster: [['Ash Crawler', 1, 3], ['Scavenger', 2, 4], ['Debris Golem', 5, 8], ['Stalker', 6, 10], ['Radiant Worm', 10, 15], ['Impact Drone', 15, 25], ['Ash Titan', 20, 35]],
  },
  [ZONE.SCORCHED]: {
    key: 'scorched_basin', name: 'Scorched Basin', label: 'Radiation, mutation, fire', danger: 4, resources: 0.8, hazards: ['radiation', 'fire'],
    roster: [['Radiated Dog', 2, 4], ['Mutant Hound', 4, 6], ['Burner', 6, 10], ['Lava Beast', 10, 15], ['Radiation Giant', 18, 25], ['Scorch Tank', 20, 40], ['Fire Colossus', 30, 50]],
  },
  [ZONE.FROST]: {
    key: 'frost_ridge', name: 'Frost Ridge', label: 'Snow, ice, high altitude', danger: 3, resources: 1.0, hazards: ['cold'],
    roster: [['Ice Wolf', 2, 4], ['Frost Ravager', 4, 7], ['Snow Troll', 8, 12], ['Ice Spitter', 10, 15], ['Storm Behemoth', 20, 30], ['Frost Colossus', 35, 50], ['Ice Dragon', 50, 80]],
  },
  [ZONE.WRAITH]: {
    key: 'wraith_peaks', name: 'The Wraith Peaks', label: 'Mountains, cliffs, ruins', danger: 5, resources: 1.3, hazards: ['cold', 'steep_terrain'],
    roster: [['Mountain Goat', 2, 4], ['Rock Crawler', 5, 8], ['Cave Stalker', 8, 12], ['Sky Reaver', 12, 18], ['Stone Colossus', 25, 40], ['Wraith Wyrm', 40, 70], ['Ancient Guardian', 60, 100]],
  },
  [ZONE.DUNES]: {
    key: 'dune_wastes', name: 'The Dune Wastes', label: 'Sand, storms, buried ruins', danger: 2, resources: 0.6, hazards: ['sandstorm', 'heat'],
    roster: [['Sand Rat', 1, 3], ['Scorpion', 3, 6], ['Raider Bike', 5, 10], ['Sand Worm', 8, 15], ['Dune Behemoth', 20, 40], ['Sand Colossus', 50, 90], ['Pharaoh Unit', 100, null]],
  },
  [ZONE.LAKE]: {
    key: 'black_lake', name: 'The Black Lake', label: 'Toxic water, industrial ruins', danger: 4, resources: 1.1, hazards: ['toxic_water'],
    roster: [['Toxic Fish', 1, 3], ['Mutated Swimmer', 4, 8], ['Water Stalker', 8, 12], ['Sewer Leviathan', 15, 25], ['Abyssal Beast', 30, 50], ['Water Colossus', 60, 100], ['The Drowned', 120, null]],
  },
  [ZONE.SPIRES]: {
    key: 'broken_spires', name: 'The Broken Spires', label: 'Volcanic, anomalies, vertical terrain', danger: 5, resources: 1.2, hazards: ['anomalies', 'fire'],
    roster: [['Spire Crawler', 2, 4], ['Lava Imp', 5, 8], ['Anomaly Wolf', 10, 15], ['Crystal Beast', 15, 25], ['Obsidian Titan', 30, 50], ['The Spire', 70, 120], ['Void Entity', 150, null]],
  },
  [ZONE.PASS]: {
    key: 'dead_mans_pass', name: "Dead Man's Pass", label: 'Roads, canyons, raider territory', danger: 3, resources: 0.9, hazards: ['ambush'],
    roster: [['Raider Scav', 2, 4], ['Armored Truck', 5, 10], ['Road Hog', 10, 15], ['Death Worm', 20, 30], ['Canyon Titan', 40, 70], ['The Gatekeeper', 80, null], ['Raider War Barge', 120, null]],
  },
  [ZONE.RUSTBOLT]: {
    key: 'rustbolt', name: 'Rustbolt', label: 'Industrial, machinery, war machines', danger: 4, resources: 1.0, hazards: [],
    roster: [['Scrap Rat', 1, 2], ['Worker Bot', 3, 5], ['Mining Drone', 6, 10], ['Excavator Beast', 12, 20], ['Factory Colossus', 30, 50], ['Rust Behemoth', 70, 100], ['The Forge', 150, null]],
  },
  [ZONE.DIVOT]: {
    key: 'the_divot', name: 'The Divot', label: 'Lost city at the impact center', danger: 5, resources: 1.5, hazards: ['radiation'],
    roster: [],
  },
  [ZONE.EDGE]: { key: 'edge', name: 'The Crater Rim', label: 'The end of the world', danger: 5, resources: 0, hazards: [], roster: [] },
};

/** World events and the endgame: things bigger than your Titan. */
export const MEGA_ENEMIES: { name: string; size: number; trigger: string }[] = [
  { name: 'The Asteroid Worm', size: 300, trigger: 'rare_world_event' },
  { name: 'The Crater Guardian', size: 500, trigger: 'the_divot' },
  { name: 'The Fallen Colossus', size: 800, trigger: 'ancient_civilization_quest' },
  { name: 'The World Eater', size: 1500, trigger: 'endgame' },
];

export type LocationType = 'start' | 'settlement' | 'raider' | 'poi';

export interface CraterLocation {
  id: string;
  name: string;
  type: LocationType;
  zone: number;
  x: number;
  y: number;
  /** Footprint radius (m). */
  r: number;
  tags?: string[];
  desc: string;
}

const loc = (id: string, name: string, type: LocationType, zone: number, u: number, v: number, r: number, desc: string, tags?: string[]): CraterLocation => ({ id, name, type, zone, x: u * S, y: v * S, r, desc, tags });

export const LOCATIONS: CraterLocation[] = [
  loc('mega_hangar', 'Mega Hangar', 'start', ZONE.DUNES, 0.42, 0.73, 900, 'Your mobile home. Carries multiple bases and provides core support. Refit, trade and hire here.'),
  loc('the_divot', 'The Divot', 'poi', ZONE.DIVOT, 0.51, 0.42, 11000, 'A city-sized crater. Ruins, loot, radiation and unknowns. The Crater Guardian sleeps at its heart.', ['lost_city', 'radiation', 'loot']),
  loc('northridge', 'Northridge', 'settlement', ZONE.FROST, 0.59, 0.13, 550, 'A hardy settlement on the high ground. Trade, refuel and hire.'),
  loc('iron_hollow', 'Iron Hollow', 'settlement', ZONE.LAKE, 0.77, 0.43, 550, 'A walled settlement by the lake. Trade, refuel and hire.'),
  loc('verdant_town', 'Verdant Fields', 'settlement', ZONE.VERDANT, 0.16, 0.46, 550, 'Farm country: food, water and hands for hire.'),
  loc('blood_eagle', 'Blood Eagle Camp', 'raider', ZONE.ASH, 0.39, 0.2, 700, 'Raiders of the ash. They are not friendly.'),
  loc('rustbolt_camp', 'Rustbolt', 'raider', ZONE.RUSTBOLT, 0.91, 0.49, 800, 'A raider foundry town full of war machines.'),
  loc('dead_mans_camp', "Dead Man's Pass", 'raider', ZONE.PASS, 0.58, 0.7, 700, 'Raider territory: the canyon road east of the Mega Hangar.'),
  loc('black_lake_poi', 'The Black Lake', 'poi', ZONE.LAKE, 0.82, 0.3, 1500, 'Contaminated water and industrial ruins. Something is still alive down there.', ['contaminated']),
  loc('broken_spires_poi', 'The Broken Spires', 'poi', ZONE.SPIRES, 0.81, 0.68, 1500, 'Volcanic spires and anomalies. Hazardous.', ['anomalies']),
];

export const locationById = (id: string): CraterLocation => LOCATIONS.find((l) => l.id === id)!;

/** The Divot: the crater in the middle. Inside `city` the lost city; the rim is a ring of mountains. */
export const DIVOT = { x: 0.51 * S, y: 0.42 * S, city: 0.085 * S, rimIn: 0.13 * S, rimOut: 0.168 * S };

/** Where the zones sit (points traced from the map; each tile belongs to the nearest one, with warped borders). */
const SEEDS: [number, number, number][] = [
  [ZONE.FROST, 0.46, 0.07], [ZONE.FROST, 0.55, 0.09], [ZONE.FROST, 0.65, 0.08], [ZONE.FROST, 0.59, 0.15], [ZONE.FROST, 0.72, 0.1],
  [ZONE.WRAITH, 0.8, 0.07], [ZONE.WRAITH, 0.88, 0.14], [ZONE.WRAITH, 0.94, 0.23], [ZONE.WRAITH, 0.83, 0.2],
  [ZONE.ASH, 0.26, 0.12], [ZONE.ASH, 0.33, 0.19], [ZONE.ASH, 0.21, 0.19], [ZONE.ASH, 0.38, 0.12],
  [ZONE.SCORCHED, 0.17, 0.29], [ZONE.SCORCHED, 0.25, 0.33], [ZONE.SCORCHED, 0.11, 0.25],
  [ZONE.VERDANT, 0.09, 0.43], [ZONE.VERDANT, 0.19, 0.47], [ZONE.VERDANT, 0.12, 0.55], [ZONE.VERDANT, 0.27, 0.52], [ZONE.VERDANT, 0.3, 0.41],
  [ZONE.DUNES, 0.14, 0.67], [ZONE.DUNES, 0.25, 0.72], [ZONE.DUNES, 0.17, 0.82], [ZONE.DUNES, 0.32, 0.84], [ZONE.DUNES, 0.42, 0.79], [ZONE.DUNES, 0.35, 0.64], [ZONE.DUNES, 0.45, 0.89],
  [ZONE.LAKE, 0.8, 0.32], [ZONE.LAKE, 0.73, 0.29], [ZONE.LAKE, 0.87, 0.37], [ZONE.LAKE, 0.76, 0.42], [ZONE.LAKE, 0.7, 0.2],
  [ZONE.RUSTBOLT, 0.91, 0.49], [ZONE.RUSTBOLT, 0.95, 0.55], [ZONE.RUSTBOLT, 0.88, 0.45],
  [ZONE.PASS, 0.58, 0.7], [ZONE.PASS, 0.63, 0.77], [ZONE.PASS, 0.53, 0.64], [ZONE.PASS, 0.66, 0.63], [ZONE.PASS, 0.54, 0.8],
  [ZONE.SPIRES, 0.8, 0.68], [ZONE.SPIRES, 0.86, 0.76], [ZONE.SPIRES, 0.75, 0.81], [ZONE.SPIRES, 0.91, 0.65], [ZONE.SPIRES, 0.72, 0.58],
];

/** The Black Lake itself (toxic water), as ellipse centres and radii (normalized). */
export const LAKE_BLOBS: [number, number, number, number][] = [[0.81, 0.31, 0.055, 0.045], [0.77, 0.35, 0.035, 0.03], [0.85, 0.27, 0.03, 0.03]];

/** Rivers (normalized control points), fordable but slow. */
export const RIVERS: [number, number][][] = [
  [[0.61, 0.04], [0.63, 0.12], [0.66, 0.2], [0.7, 0.26], [0.75, 0.3]],
  [[0.36, 0.36], [0.29, 0.39], [0.22, 0.42], [0.14, 0.44], [0.04, 0.46]],
  [[0.6, 0.55], [0.63, 0.6], [0.67, 0.66], [0.72, 0.72], [0.79, 0.77]],
  [[0.78, 0.4], [0.75, 0.47], [0.72, 0.55], [0.68, 0.61]],
  [[0.45, 0.1], [0.41, 0.14], [0.36, 0.11], [0.29, 0.08]],
];

/** Roads between the locations (ids, or [u, v] waypoints), plus the rim road round the Divot. */
export const ROAD_LINKS: (string | [number, number])[][] = [
  ['mega_hangar', 'dead_mans_camp', 'broken_spires_poi', 'rustbolt_camp', 'iron_hollow', 'black_lake_poi', 'northridge', 'blood_eagle', 'verdant_town', 'mega_hangar'],
  ['mega_hangar', [0.45, 0.6]],
  ['dead_mans_camp', [0.6, 0.57]],
  ['iron_hollow', [0.68, 0.43]],
  ['blood_eagle', [0.45, 0.26]],
  ['verdant_town', [0.34, 0.44]],
  ['northridge', [0.57, 0.26]],
];

export const craterNoise = new Perlin(20260928);

/** Normalized "rounded square" radius from the map centre: the playable island ends at about 0.46. */
function edgeDist(u: number, v: number): number {
  const du = u - 0.5, dv = v - 0.5;
  const a = Math.atan2(dv, du);
  const rs = Math.pow(Math.abs(du) ** 4 + Math.abs(dv) ** 4, 0.25);
  const wobble = craterNoise.fbm2(Math.cos(a) * 3 + 11, Math.sin(a) * 3 - 7, 3) * 0.025 + craterNoise.noise2(a * 9, 3.3) * 0.006;
  return rs - (0.465 + wobble);
}

/** The zone at a world point. */
export function craterZone(x: number, y: number): number {
  const u = x / S, v = y / S;
  if (edgeDist(u, v) > 0) return ZONE.EDGE;
  const wu = craterNoise.fbm2(u * 7, v * 7, 3) * 0.03, wv = craterNoise.fbm2(u * 7 + 9.1, v * 7 - 4.7, 3) * 0.03;
  const dd = Math.hypot(u - DIVOT.x / S, v - DIVOT.y / S) + wu * 0.4;
  if (dd < DIVOT.rimOut / S) return ZONE.DIVOT;
  const pu = u + wu, pv = v + wv;
  let best: number = ZONE.DUNES, bd = 1e9;
  for (const [z, su, sv] of SEEDS) {
    const d = (pu - su) ** 2 + (pv - sv) ** 2;
    if (d < bd) {
      bd = d;
      best = z;
    }
  }
  return best;
}

/** How deep into the Divot a point is: 0 at the centre, 1 at the outside of the rim. */
export const divotDepth = (x: number, y: number): number => Math.hypot(x - DIVOT.x, y - DIVOT.y) / DIVOT.rimOut;

/** Is a point in the Black Lake's water? */
export function inLake(x: number, y: number): boolean {
  const u = x / S, v = y / S;
  const n = craterNoise.fbm2(u * 60, v * 60, 3) * 0.25;
  for (const [cu, cv, ru, rv] of LAKE_BLOBS) if (((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2 < 1 + n) return true;
  return false;
}

/** Danger of a spot: the zone's danger (1-5) as a threat level (1-8), easier right around the Mega Hangar. */
export function craterThreat(x: number, y: number): number {
  const z = craterZone(x, y);
  const danger = ZONE_INFO[z]?.danger ?? 1;
  let t = 1 + (danger - 1) * 1.5;
  // The lost city at the heart of the Divot is the worst place in the world.
  if (z === ZONE.DIVOT && divotDepth(x, y) < DIVOT.city / DIVOT.rimOut) t += 1;
  const h = LOCATIONS[0];
  const dh = Math.hypot(x - h.x, y - h.y);
  if (dh < 6000) t = Math.min(t, 1 + dh / 6000);
  return Math.max(1, Math.min(8, t));
}
