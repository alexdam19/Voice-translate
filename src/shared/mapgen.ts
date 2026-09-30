import { MAP_SIZE } from './constants';
import { craterNoise, craterThreat, craterZone, DIVOT, inLake, LOCATIONS, locationById, RIVERS, ROAD_LINKS, ZONE_INFO } from './crater';
import { CH, GameMap, OBS, TER, ZONE, type MapChunk } from './map';
import { COMPOUND, compoundTile, inCompound } from './compound';
import { Perlin } from './noise';
import { RNG, hash2 } from './rng';

export type { Prop } from './map';

/* ---------------------------------------------------------------------- */
/* World features                                                          */
/* ---------------------------------------------------------------------- */
export type NodeType = 'scrap' | 'iron' | 'copper' | 'titanium' | 'uranium' | 'cryo' | 'sulfur' | 'xenite' | 'biomass';

export const NODE_INFO: Record<NodeType, { name: string; item: string; tier: number; amount: [number, number]; color: string }> = {
  scrap: { name: 'Scrap Heap', item: 'scrap', tier: 1, amount: [40, 80], color: '#9a7a5a' },
  iron: { name: 'Iron Deposit', item: 'iron_ore', tier: 1, amount: [30, 55], color: '#c86848' },
  copper: { name: 'Copper Deposit', item: 'copper_ore', tier: 1, amount: [30, 55], color: '#e28c40' },
  biomass: { name: 'Fungus Patch', item: 'biomass', tier: 1, amount: [20, 40], color: '#9a5ac8' },
  titanium: { name: 'Titanium Vein', item: 'titanium_ore', tier: 2, amount: [24, 44], color: '#c4d6ec' },
  uranium: { name: 'Uranium Seam', item: 'uranium_ore', tier: 2, amount: [18, 36], color: '#a0ff50' },
  cryo: { name: 'Cryo Cluster', item: 'cryo_crystal', tier: 2, amount: [18, 36], color: '#78faff' },
  sulfur: { name: 'Sulfur Vent', item: 'sulfur', tier: 2, amount: [24, 44], color: '#ffe246' },
  xenite: { name: 'Xenite Spire', item: 'xenite', tier: 3, amount: [14, 26], color: '#ff3cdc' },
};

export interface ResourceNode {
  id: number;
  x: number;
  y: number;
  type: NodeType;
  amount: number;
  max: number;
  /** Game time when a depleted node grows back (0 = active). */
  respawnAt: number;
}

export type SiteKind = 'ruins' | 'convoy' | 'bunker' | 'crash' | 'foundry' | 'hive';

export const SITE_INFO: Record<SiteKind, { title: string; names: string[] }> = {
  ruins: { title: 'Ruins', names: ['Old Depot', 'Rust Mall', 'Dead Refinery', 'Motor Pool', 'Scrapyard', 'Pump Station', 'Rail Yard', 'Market Ruins'] },
  convoy: { title: 'Lost Convoy', names: ['Sunken Convoy', 'Buried Hauler', 'Caravan Graves', 'Tanker Wreck', 'Sandbound Train', 'Salt Trucks'] },
  bunker: { title: 'Bunker', names: ['Frost Bunker', 'Listening Post', 'Cold Vault', 'Silo Nine', 'White Hangar', 'Ice Lab'] },
  crash: { title: 'Crash Site', names: ['Fallen Satellite', 'Gunship Crash', 'Glass Hangar', 'Reactor Shell', 'Orbital Debris', 'Downed Lifter'] },
  foundry: { title: 'Foundry', names: ['Slag Foundry', 'Cinder Works', 'Forge Pit', 'Smelter Nine', 'Iron Throat', 'Ember Mill'] },
  hive: { title: 'Hive', names: ['Spore Hive', 'Brood Pit', 'Xeno Garden', 'Rot Cathedral', 'Mother Nest', 'Green Maw'] },
};

export interface Site {
  id: number;
  x: number;
  y: number;
  kind: SiteKind;
  zone: number;
  threat: number;
  name: string;
  /** Game time when it can be scavenged again. */
  readyAt: number;
}

export type RuneKind = 'crimson' | 'azure' | 'verdant' | 'gilded';

export const RUNE_INFO: Record<RuneKind, { name: string; color: string; buff: string }> = {
  crimson: { name: 'Crimson Rune', color: '#ff3b3b', buff: '+25% weapon damage, shots burn' },
  azure: { name: 'Azure Rune', color: '#3fa9ff', buff: 'Card energy refills 35% faster' },
  verdant: { name: 'Verdant Rune', color: '#4cff72', buff: 'Hull regenerates 1.5% per second' },
  gilded: { name: 'Gilded Rune', color: '#ffd23f', buff: '+60% loot and harvest yield' },
};

export interface RuneAltar {
  id: number;
  x: number;
  y: number;
  rune: RuneKind;
  zone: number;
  threat: number;
  /** Game time when the guardians respawn and the rune can be claimed again. */
  readyAt: number;
}

export interface OutpostSpot {
  id: number;
  x: number;
  y: number;
  zone: number;
  threat: number;
  rot: number;
}

export type PropKind =
  | 'bones' | 'deadtree' | 'cactus' | 'crystal' | 'barrel' | 'wreckcar' | 'sign' | 'mushroom' | 'pipe' | 'spike'
  | 'skull' | 'tent' | 'antenna' | 'crate';

/* ---------------------------------------------------------------------- */
/* Regions: where the factions live                                        */

/* ---------------------------------------------------------------------- */
/* Regions: the Crater's places                                            */
/* ---------------------------------------------------------------------- */

export type Faction = 'monster' | 'zombie' | 'necro' | 'cyborg' | 'military' | 'raider';
/** Regions (towns, camps, factories) are laid out at this scale, so their buildings stand up to a Titan. */
export const REGION_SCALE = 2;

export type RegionKind =
  | 'hangar' | 'settlement' | 'raider' | 'divot' | 'lake' | 'spires'
  | 'town' | 'farm' | 'factory' | 'camp' | 'ruins' | 'hive';

export interface Region {
  id: number;
  kind: RegionKind;
  name: string;
  x: number;
  y: number;
  r: number;
  /** A named place from the Crater's map (the strongholds, settlements, the Divot, the Mega Hangar). */
  major: boolean;
  threat: number;
  zone: number;
  /** Location id (crater_world_1.json) for the named places. */
  key?: string;
}

export const REGION_INFO: Record<RegionKind, { title: string; color: string; hostile: boolean; desc: string; names: string[] }> = {
  hangar: { title: 'Mega Hangar', color: '#40c4ff', hostile: false, desc: 'Your home base: refit, trade and hire.', names: ['Mega Hangar'] },
  settlement: { title: 'Settlement', color: '#76ff03', hostile: false, desc: 'A safe zone: trade, refuel and hire.', names: ['Settlement'] },
  raider: { title: 'Raider Stronghold', color: '#ff5252', hostile: true, desc: 'Raider territory. Its warlord guards a core for the Mega Hangar.', names: ['Raider Camp'] },
  divot: { title: 'The Divot', color: '#ffd740', hostile: true, desc: 'A lost city at the impact centre. Radiation, loot and unknowns.', names: ['The Divot'] },
  lake: { title: 'The Black Lake', color: '#1de9b6', hostile: true, desc: 'Contaminated water and industrial ruins.', names: ['The Black Lake'] },
  spires: { title: 'The Broken Spires', color: '#e040fb', hostile: true, desc: 'Volcanic spires and anomalies.', names: ['The Broken Spires'] },
  town: { title: 'Abandoned Town', color: '#bcaaa4', hostile: true, desc: 'Empty streets and whatever moved in.', names: ['Hollow Creek', 'Saltwell', 'Graveton', 'Dry Fork', 'Last Stop', 'Mercy', 'Brandt', 'Kettle Hill'] },
  farm: { title: 'Farmstead', color: '#9ccc65', hostile: true, desc: 'Fields gone wild and barns full of something.', names: ['Oldfield Farm', 'Greenacre', 'The Mill', 'Harlan Homestead', 'Two Silos', 'Hayward'] },
  factory: { title: 'Factory Ruins', color: '#ffb300', hostile: true, desc: 'Machines still working their last shift.', names: ['Plant 12', 'The Stamping Works', 'Refinery Row', 'Smelter Yard', 'Assembly Hall C'] },
  camp: { title: 'Raider Camp', color: '#ff7043', hostile: true, desc: 'Scrap walls, fires and raiders.', names: ['Skull Rock', 'Tin Town', 'The Pit', 'Burnout', 'Chop Shop', 'Gallows'] },
  ruins: { title: 'Buried Ruins', color: '#a1887f', hostile: true, desc: 'Something older than the impact, half under the ground.', names: ['Sunken Temple', 'The Old Works', 'Pillar Field', 'Glass Tomb', 'The Stacks'] },
  hive: { title: 'Hive', color: '#ea80fc', hostile: true, desc: 'A nest. Stay mobile.', names: ['The Nest', 'Spawn Pits', 'The Warren', 'Brood Hollow'] },
};

const LOCATION_KIND: Record<string, RegionKind> = {
  mega_hangar: 'hangar', the_divot: 'divot', northridge: 'settlement', iron_hollow: 'settlement', verdant_town: 'settlement',
  blood_eagle: 'raider', rustbolt_camp: 'raider', dead_mans_camp: 'raider', black_lake_poi: 'lake', broken_spires_poi: 'spires',
};

/* ---------------------------------------------------------------------- */
/* Layout                                                                  */
/* ---------------------------------------------------------------------- */

/** Danger rating of a spot (1-8) from its zone. Tiers I-V. */
export function threatAt(x: number, y: number): number {
  return craterThreat(x, y);
}

export function threatTier(t: number): number {
  return t < 2 ? 1 : t < 3.3 ? 2 : t < 4.6 ? 3 : t < 6 ? 4 : 5;
}

export const TIER_NAMES = ['', 'I', 'II', 'III', 'IV', 'V'];

/** Roads are polylines; a tile is road within ROAD_W of one. The Crater's roads are wide enough for a Titan. */
const ROAD_W = 7;
/** Features are generated per sector (SECTOR x SECTOR tiles). */
export const SECTOR = 256;

const SITE_KIND: Record<number, SiteKind> = {
  [ZONE.VERDANT]: 'ruins', [ZONE.ASH]: 'crash', [ZONE.SCORCHED]: 'foundry', [ZONE.FROST]: 'bunker', [ZONE.WRAITH]: 'ruins', [ZONE.DUNES]: 'convoy',
  [ZONE.LAKE]: 'hive', [ZONE.SPIRES]: 'crash', [ZONE.PASS]: 'convoy', [ZONE.RUSTBOLT]: 'foundry', [ZONE.DIVOT]: 'ruins',
};

const NODE_WEIGHTS: Record<number, [NodeType, number][]> = {
  [ZONE.VERDANT]: [['biomass', 4], ['iron', 3], ['copper', 3], ['scrap', 2]],
  [ZONE.ASH]: [['scrap', 5], ['iron', 3], ['titanium', 1]],
  [ZONE.SCORCHED]: [['uranium', 4], ['sulfur', 3], ['scrap', 2]],
  [ZONE.FROST]: [['cryo', 5], ['iron', 2], ['titanium', 1]],
  [ZONE.WRAITH]: [['titanium', 4], ['iron', 3], ['cryo', 2], ['xenite', 0.3]],
  [ZONE.DUNES]: [['scrap', 4], ['titanium', 3], ['iron', 2], ['copper', 1]],
  [ZONE.LAKE]: [['biomass', 3], ['scrap', 3], ['copper', 3], ['xenite', 1]],
  [ZONE.SPIRES]: [['xenite', 3], ['sulfur', 3], ['uranium', 1]],
  [ZONE.PASS]: [['scrap', 5], ['iron', 3], ['copper', 2]],
  [ZONE.RUSTBOLT]: [['scrap', 5], ['iron', 4], ['copper', 3], ['titanium', 1]],
  [ZONE.DIVOT]: [['uranium', 3], ['xenite', 2], ['scrap', 3], ['titanium', 2]],
};

const PROPS: Record<number, PropKind[]> = {
  [ZONE.VERDANT]: ['deadtree', 'barrel', 'sign', 'crate', 'wreckcar', 'bones'],
  [ZONE.ASH]: ['bones', 'skull', 'pipe', 'wreckcar', 'spike'],
  [ZONE.SCORCHED]: ['spike', 'skull', 'barrel', 'bones'],
  [ZONE.FROST]: ['crystal', 'deadtree', 'spike', 'bones'],
  [ZONE.WRAITH]: ['bones', 'skull', 'spike', 'crystal'],
  [ZONE.DUNES]: ['bones', 'skull', 'cactus', 'wreckcar', 'cactus'],
  [ZONE.LAKE]: ['mushroom', 'barrel', 'pipe', 'wreckcar'],
  [ZONE.SPIRES]: ['crystal', 'spike', 'skull', 'crystal'],
  [ZONE.PASS]: ['wreckcar', 'sign', 'barrel', 'bones', 'skull'],
  [ZONE.RUSTBOLT]: ['pipe', 'barrel', 'wreckcar', 'crate', 'antenna'],
  [ZONE.DIVOT]: ['wreckcar', 'sign', 'pipe', 'barrel', 'crystal'],
};

const REGION_ZONE: Record<number, RegionKind[]> = {
  [ZONE.VERDANT]: ['farm', 'farm', 'town'],
  [ZONE.ASH]: ['ruins', 'camp'],
  [ZONE.SCORCHED]: ['ruins', 'hive'],
  [ZONE.FROST]: ['town', 'ruins'],
  [ZONE.WRAITH]: ['ruins', 'ruins', 'hive'],
  [ZONE.DUNES]: ['ruins', 'camp', 'town'],
  [ZONE.LAKE]: ['factory', 'hive'],
  [ZONE.SPIRES]: ['hive', 'ruins'],
  [ZONE.PASS]: ['camp', 'camp', 'town'],
  [ZONE.RUSTBOLT]: ['factory', 'factory', 'camp'],
};

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Half-width (rivers vary). */
  w: number;
}

interface Sector {
  nodes: ResourceNode[];
  sites: Site[];
  runes: RuneAltar[];
  outposts: OutpostSpot[];
  /** A minor region (a town, a hive...) or null. */
  region: Region | null;
}

/** Saved state of features, applied when their sector is generated. */
export interface FeatureState {
  nodes: Map<number, [number, number]>;
  sites: Map<number, number>;
  runes: Map<number, number>;
}

/** The Mega Hangar: a building 700 m wide and 420 m deep with a great door on its south side. */
export const HANGAR = { w: 700, d: 420, door: 300 } as const;

/**
 * The open world. Terrain streams in chunk by chunk (see GameMap); features stream in by sector around where you
 * are. `nodes`, `sites`, `runes` and `outposts` hold only the ones near the fortress (see `focus`).
 */
export interface WorldGen {
  seed: number;
  map: GameMap;
  spawn: { x: number; y: number };
  /** Which way you face at the start (the Mega Hangar's door is to the south). */
  spawnRot?: number;
  nodes: ResourceNode[];
  sites: Site[];
  runes: RuneAltar[];
  outposts: OutpostSpot[];
  gate: { x: number; y: number };
  regions: Region[];
  /** Your home base (the Mega Hangar), if this world has one. */
  hangar: { x: number; y: number; r: number } | null;
  /** Streams features around (x, y). Cheap to call often. */
  focus(x: number, y: number): void;
  /** Zone at a world point without generating anything (maps and overviews). */
  zoneOf(x: number, y: number): number;
  /** The region a point is in, if any (majors first). */
  regionAt(x: number, y: number): Region | null;
  roadsNear(x0: number, y0: number, x1: number, y1: number): Seg[];
}

class SegIndex {
  readonly segs: Seg[] = [];
  private index = new Map<number, number[]>();
  private readonly cps = Math.ceil(MAP_SIZE / CH);

  add(ax: number, ay: number, bx: number, by: number, w: number): void {
    const i = this.segs.length;
    this.segs.push({ ax, ay, bx, by, w });
    const m = w + 4;
    const c0x = Math.floor((Math.min(ax, bx) - m) / CH), c1x = Math.floor((Math.max(ax, bx) + m) / CH);
    const c0y = Math.floor((Math.min(ay, by) - m) / CH), c1y = Math.floor((Math.max(ay, by) + m) / CH);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        if (cx < 0 || cy < 0 || cx >= this.cps || cy >= this.cps) continue;
        const k = cy * this.cps + cx;
        let a = this.index.get(k);
        if (!a) this.index.set(k, (a = []));
        a.push(i);
      }
    }
  }

  near(x0: number, y0: number, x1: number, y1: number): Seg[] {
    const out = new Set<number>();
    for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) {
      for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) for (const i of this.index.get(cy * this.cps + cx) ?? []) out.add(i);
    }
    return [...out].map((i) => this.segs[i]);
  }
}

export class OpenWorld implements WorldGen {
  readonly seed: number;
  readonly map: GameMap;
  readonly spawn: { x: number; y: number };
  readonly spawnRot = Math.PI / 2;
  readonly gate: { x: number; y: number };
  nodes: ResourceNode[] = [];
  sites: Site[] = [];
  runes: RuneAltar[] = [];
  outposts: OutpostSpot[] = [];
  readonly regions: Region[] = [];
  readonly hangar: { x: number; y: number; r: number };
  readonly saved: FeatureState = { nodes: new Map(), sites: new Map(), runes: new Map() };
  private p: Perlin;
  private p2: Perlin;
  private p3: Perlin;
  private roads = new SegIndex();
  private rivers = new SegIndex();
  private sectors = new Map<number, Sector>();
  private focusKey = -1;
  private readonly sps = Math.ceil(MAP_SIZE / SECTOR);

  constructor(seed: number) {
    this.seed = seed;
    this.p = new Perlin(seed);
    this.p2 = new Perlin(seed ^ 0x5bd1e995);
    this.p3 = new Perlin(seed ^ 0x2c1b3c6d);
    for (const l of LOCATIONS) {
      const kind = LOCATION_KIND[l.id] ?? 'settlement';
      this.regions.push({ id: this.regions.length + 1, kind, name: l.name, x: l.x, y: l.y, r: l.r, major: true, threat: craterThreat(l.x, l.y), zone: l.zone, key: l.id });
    }
    const h = LOCATIONS[0];
    this.hangar = { x: h.x, y: h.y, r: h.r };
    // You start inside the Mega Hangar, facing the great door.
    this.spawn = { x: h.x, y: h.y + 20 };
    this.gate = { x: h.x + 1600, y: h.y + 500 };
    this.buildRoads();
    this.buildRivers();
    this.map = new GameMap(MAP_SIZE, (c) => this.fill(c));
  }

  /* ---------------- layout ---------------- */

  zoneOf(x: number, y: number): number {
    return craterZone(x, y);
  }

  regionAt(x: number, y: number): Region | null {
    // Smaller named places first (a settlement sits inside a bigger zone).
    let best: Region | null = null;
    for (const r of this.regions) if ((x - r.x) ** 2 + (y - r.y) ** 2 < r.r * r.r && (!best || r.r < best.r)) best = r;
    if (best && best.kind !== 'divot') return best;
    const sx = Math.floor(x / SECTOR), sy = Math.floor(y / SECTOR);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const reg = this.minorRegion(sx + dx, sy + dy);
        if (reg && (x - reg.x) ** 2 + (y - reg.y) ** 2 < reg.r * reg.r) return reg;
      }
    }
    return best;
  }

  /** A meandering polyline between two points (for roads and rivers). */
  private meander(ax: number, ay: number, bx: number, by: number, wiggle: number, salt: number): { x: number; y: number }[] {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.ceil(d / 60));
    const nx = -(by - ay) / (d || 1), ny = (bx - ax) / (d || 1);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const env = Math.sin(t * Math.PI);
      const off = (this.p3.fbm2(t * d / 2500, salt, 3) * wiggle + craterNoise.noise2(t * d / 400, salt + 0.5) * wiggle * 0.15) * env;
      pts.push({ x: ax + (bx - ax) * t + nx * off, y: ay + (by - ay) * t + ny * off });
    }
    return pts;
  }

  /** Highways between the named places, the rim road round the Divot and spokes into the lost city. */
  private buildRoads(): void {
    const pos = (p: string | [number, number]): { x: number; y: number } => (typeof p === 'string' ? locationById(p) : { x: p[0] * MAP_SIZE, y: p[1] * MAP_SIZE });
    let salt = 1;
    const line = (pts: { x: number; y: number }[]): void => {
      for (let i = 0; i + 1 < pts.length; i++) this.roads.add(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, ROAD_W);
    };
    for (const link of ROAD_LINKS) {
      for (let i = 0; i + 1 < link.length; i++) {
        const a = pos(link[i]), b = pos(link[i + 1]);
        line(this.meander(a.x, a.y, b.x, b.y, Math.min(1800, Math.hypot(b.x - a.x, b.y - a.y) * 0.08), salt++ * 3.7));
      }
    }
    // The rim road: a ring just outside the Divot's mountains, and four roads down into the city.
    const R = DIVOT.rimOut + 900;
    const ring: { x: number; y: number }[] = [];
    for (let i = 0; i <= 720; i++) {
      const a = (i / 720) * Math.PI * 2;
      const r = R + this.p3.noise2(a * 5, 77) * 700;
      ring.push({ x: DIVOT.x + Math.cos(a) * r, y: DIVOT.y + Math.sin(a) * r });
    }
    line(ring);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + 0.35;
      line(this.meander(DIVOT.x + Math.cos(a) * R, DIVOT.y + Math.sin(a) * R, DIVOT.x + Math.cos(a) * 1200, DIVOT.y + Math.sin(a) * 1200, 900, 50 + k));
    }
    // The Mega Hangar's apron road and the Dead Zone gate.
    const h = this.hangar;
    // Out through the compound's gate first.
    line([{ x: h.x, y: h.y + HANGAR.d / 2 }, { x: h.x, y: h.y + COMPOUND.y1 + 160 }]);
    line(this.meander(h.x, h.y + COMPOUND.y1 + 160, this.gate.x, this.gate.y, 200, 99));
  }

  private buildRivers(): void {
    let salt = 200;
    for (const river of RIVERS) {
      for (let i = 0; i + 1 < river.length; i++) {
        const ax = river[i][0] * MAP_SIZE, ay = river[i][1] * MAP_SIZE, bx = river[i + 1][0] * MAP_SIZE, by = river[i + 1][1] * MAP_SIZE;
        const pts = this.meander(ax, ay, bx, by, Math.hypot(bx - ax, by - ay) * 0.12, salt++ * 1.9);
        for (let k = 0; k + 1 < pts.length; k++) {
          const w = 16 + (this.p3.noise2(pts[k].x / 900, pts[k].y / 900) + 1) * 12;
          this.rivers.add(pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y, w);
        }
      }
    }
  }

  roadsNear(x0: number, y0: number, x1: number, y1: number): Seg[] {
    return this.roads.near(x0, y0, x1, y1);
  }

  /* ---------------- sectors: features ---------------- */

  private sectorRng(sx: number, sy: number, salt: number): RNG {
    return new RNG((hash2(sx, sy, this.seed + salt) * 4294967296) >>> 0);
  }

  /** Is a spot inside a named place that shouldn't have random features (the hangar, settlements, strongholds)? */
  private inNamed(x: number, y: number, pad: number): boolean {
    for (const m of this.regions) {
      if (m.kind === 'divot' || m.kind === 'lake' || m.kind === 'spires') continue;
      if (m.kind === 'hangar' ? inCompound(x - m.x, y - m.y, pad + 60) : Math.hypot(m.x - x, m.y - y) < m.r + pad) return true;
    }
    return false;
  }

  /** A minor region (town, farm, hive...) centred in a sector, or null. Deterministic. */
  private minorRegion(sx: number, sy: number): Region | null {
    if (sx < 0 || sy < 0 || sx >= this.sps || sy >= this.sps) return null;
    if (hash2(sx, sy, this.seed + 71) > 0.06) return null;
    const r = this.sectorRng(sx, sy, 72);
    const x = (sx + 0.3 + r.next() * 0.4) * SECTOR, y = (sy + 0.3 + r.next() * 0.4) * SECTOR;
    const z = this.zoneOf(x, y);
    const kinds = REGION_ZONE[z];
    if (!kinds || this.inNamed(x, y, 300)) return null;
    const kind = kinds[Math.floor(r.next() * kinds.length)];
    const info = REGION_INFO[kind];
    return {
      id: 1000 + sy * this.sps + sx, kind, name: info.names[Math.floor(r.next() * info.names.length)], x, y, r: (40 + r.next() * 34) * REGION_SCALE, major: false, threat: craterThreat(x, y), zone: z,
    };
  }

  private sector(sx: number, sy: number): Sector {
    const key = sy * this.sps + sx;
    let s = this.sectors.get(key);
    if (s) return s;
    s = { nodes: [], sites: [], runes: [], outposts: [], region: this.minorRegion(sx, sy) };
    this.sectors.set(key, s);
    const rng = this.sectorRng(sx, sy, 11);
    const x0 = sx * SECTOR, y0 = sy * SECTOR;
    const taken: { x: number; y: number; r: number }[] = [];
    const near = (x: number, y: number, r: number): boolean =>
      taken.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + r) || Math.hypot(x - this.gate.x, y - this.gate.y) < 14 + r || this.inNamed(x, y, r + 20);
    const spot = (clear: number): { x: number; y: number; z: number } | null => {
      for (let t = 0; t < 10; t++) {
        const x = x0 + 12 + rng.next() * (SECTOR - 24), y = y0 + 12 + rng.next() * (SECTOR - 24);
        const z = this.zoneOf(x, y);
        if (z === ZONE.EDGE || near(x, y, clear) || inLake(x, y)) continue;
        taken.push({ x, y, r: clear });
        return { x, y, z };
      }
      return null;
    };
    const base = key * 64;
    // Outposts: enemy forts, away from the Mega Hangar.
    if (rng.next() < 0.22) {
      const o = spot(26);
      if (o && Math.hypot(o.x - this.hangar.x, o.y - this.hangar.y) > 3000) s.outposts.push({ id: key * 2 + 1, x: o.x, y: o.y, zone: o.z, threat: craterThreat(o.x, o.y), rot: rng.next() * Math.PI * 2 });
    }
    // Loot areas.
    if (rng.next() < 0.7) {
      const o = spot(10);
      if (o) {
        const kind = SITE_KIND[o.z] ?? 'ruins';
        const names = SITE_INFO[kind].names;
        const id = key * 4 + 1;
        s.sites.push({ id, x: o.x, y: o.y, kind, zone: o.z, threat: craterThreat(o.x, o.y), name: names[Math.floor(rng.next() * names.length)], readyAt: this.saved.sites.get(id) ?? 0 });
      }
    }
    // Rune altars.
    if (rng.next() < 0.3) {
      const o = spot(9);
      if (o) {
        const RUNES: RuneKind[] = ['crimson', 'azure', 'verdant', 'gilded'];
        const id = key * 2 + 1;
        s.runes.push({ id, x: o.x, y: o.y, rune: RUNES[Math.floor(rng.next() * 4)], zone: o.z, threat: craterThreat(o.x, o.y), readyAt: this.saved.runes.get(id) ?? 0 });
      }
    }
    // Resource nodes: richer where the map says the zone is rich.
    const z0 = this.zoneOf(x0 + SECTOR / 2, y0 + SECTOR / 2);
    const want = Math.round(22 * (ZONE_INFO[z0]?.resources ?? 1));
    for (let k = 0, placed = 0; k < want * 3 && placed < want; k++) {
      const x = x0 + 3 + rng.next() * (SECTOR - 6), y = y0 + 3 + rng.next() * (SECTOR - 6);
      const z = this.zoneOf(x, y);
      const weights = NODE_WEIGHTS[z];
      if (!weights || near(x, y, 3) || inLake(x, y)) continue;
      if (s.nodes.some((n) => Math.abs(n.x - x) < 6 && Math.abs(n.y - y) < 6)) continue;
      const total = weights.reduce((a, w) => a + w[1], 0);
      let pick = rng.next() * total;
      let type: NodeType = weights[0][0];
      for (const [t, w] of weights) {
        pick -= w;
        if (pick <= 0) {
          type = t;
          break;
        }
      }
      this.addNode(s, base + placed, x, y, type, rng);
      placed++;
    }
    // A few easy scrap heaps and ore right outside the hangar door for the first minutes.
    const h = this.hangar;
    const ax = h.x, ay = h.y + HANGAR.d / 2 + 160;
    if (Math.floor(ax / SECTOR) === sx && Math.floor(ay / SECTOR) === sy) {
      const starter: NodeType[] = ['scrap', 'scrap', 'iron', 'copper', 'scrap', 'iron'];
      starter.forEach((type, k) => {
        const a = k * 1.05 + 0.4;
        this.addNode(s!, base + 50 + k, ax + Math.cos(a) * 110, ay + Math.sin(a) * 60, type, rng);
      });
    }
    return s;
  }

  private addNode(s: Sector, id: number, x: number, y: number, type: NodeType, rng: RNG): void {
    const info = NODE_INFO[type];
    const max = info.amount[0] + Math.floor(rng.next() * (info.amount[1] - info.amount[0] + 1));
    const st = this.saved.nodes.get(id);
    s.nodes.push({ id, x, y, type, amount: st ? st[0] : max, max, respawnAt: st ? st[1] : 0 });
  }

  /** Streams features around (x, y): the 3x3 sectors around it become the active lists. */
  focus(x: number, y: number): void {
    const sx = Math.floor(x / SECTOR), sy = Math.floor(y / SECTOR);
    const key = sy * this.sps + sx;
    if (key === this.focusKey) return;
    this.focusKey = key;
    const nodes: ResourceNode[] = [], sites: Site[] = [], runes: RuneAltar[] = [], outposts: OutpostSpot[] = [];
    // Two sectors each way: a Titan sees (and drives) a long way.
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const X = sx + dx, Y = sy + dy;
        if (X < 0 || Y < 0 || X >= this.sps || Y >= this.sps) continue;
        const s = this.sector(X, Y);
        nodes.push(...s.nodes);
        sites.push(...s.sites);
        runes.push(...s.runes);
        outposts.push(...s.outposts);
      }
    }
    this.nodes = nodes;
    this.sites = sites;
    this.runes = runes;
    this.outposts = outposts;
  }

  /** Forces the next `focus` to rebuild the lists (after loading saved state). */
  refocus(): void {
    this.focusKey = -1;
  }

  /** Applies loaded feature state to sectors that were generated before it was loaded. */
  applySaved(): void {
    for (const s of this.sectors.values()) {
      for (const n of s.nodes) {
        const st = this.saved.nodes.get(n.id);
        if (st) [n.amount, n.respawnAt] = st;
      }
      for (const x of s.sites) x.readyAt = this.saved.sites.get(x.id) ?? x.readyAt;
      for (const r of s.runes) r.readyAt = this.saved.runes.get(r.id) ?? r.readyAt;
    }
    this.refocus();
  }

  /** Every node/site/rune generated so far that has state worth saving. */
  *touchedFeatures(): IterableIterator<{ nodes: ResourceNode[]; sites: Site[]; runes: RuneAltar[] }> {
    for (const s of this.sectors.values()) yield s;
  }

  /* ---------------- chunk filler: terrain ---------------- */

  private fill(c: MapChunk): void {
    const seed = this.seed;
    const p = this.p, p2 = this.p2;
    const x0 = c.cx * CH, y0 = c.cy * CH;
    const mx = x0 + CH / 2, my = y0 + CH / 2;
    // What touches this chunk: regions, sector features, roads and rivers.
    const regions: Region[] = [];
    for (const r of this.regions) if (r.kind !== 'divot' && Math.abs(r.x - mx) < r.r + 40 && Math.abs(r.y - my) < r.r + 40) regions.push(r);
    const sx = Math.floor(mx / SECTOR), sy = Math.floor(my / SECTOR);
    const clears: { x: number; y: number; r: number; ter?: number; inner?: number; innerTer?: number; wall?: { rot: number; kind: number; gaps: number; rr: number } }[] = [];
    // Two sectors each way: a Titan sees (and drives) a long way.
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const X = sx + dx, Y = sy + dy;
        if (X < 0 || Y < 0 || X >= this.sps || Y >= this.sps) continue;
        const s = this.sector(X, Y);
        if (s.region) regions.push(s.region);
        for (const o of s.outposts) clears.push({ x: o.x, y: o.y, r: 26, inner: 18, innerTer: TER.METAL, wall: { rot: o.rot, kind: OBS.WALL, gaps: 3, rr: 23 } });
        for (const st of s.sites) clears.push({ x: st.x, y: st.y, r: 10, inner: 7, innerTer: st.kind === 'hive' ? TER.MUD : st.kind === 'foundry' ? TER.METAL : TER.CONCRETE, wall: { rot: (st.id * 1.7) % Math.PI, kind: st.kind === 'hive' ? OBS.FUNGUS : st.kind === 'convoy' || st.kind === 'crash' ? OBS.WRECK : OBS.RUIN, gaps: 4, rr: 8.6 } });
        for (const r of s.runes) clears.push({ x: r.x, y: r.y, r: 9, inner: 4, innerTer: TER.CONCRETE });
        for (const n of s.nodes) clears.push({ x: n.x, y: n.y, r: 2.5 });
      }
    }
    for (let k = clears.length - 1; k >= 0; k--) {
      const cl = clears[k];
      if (cl.x + cl.r + 1 < x0 || cl.x - cl.r - 1 > x0 + CH || cl.y + cl.r + 1 < y0 || cl.y - cl.r - 1 > y0 + CH) clears.splice(k, 1);
    }
    for (let k = regions.length - 1; k >= 0; k--) {
      const r = regions[k];
      if (r.x + r.r + 12 < x0 || r.x - r.r - 12 > x0 + CH || r.y + r.r + 12 < y0 || r.y - r.r - 12 > y0 + CH) regions.splice(k, 1);
    }
    const roads = this.roads.near(x0 - 10, y0 - 10, x0 + CH + 10, y0 + CH + 10);
    const rivers = this.rivers.near(x0 - 60, y0 - 60, x0 + CH + 60, y0 + CH + 60);
    // Zones sampled every 4 tiles (they change over kilometres; this saves most of the work).
    const zs = new Uint8Array(81);
    for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) zs[j * 9 + i] = this.zoneOf(x0 + i * 4, y0 + j * 4);
    const h = this.hangar;
    const nearHangar = Math.abs(mx - h.x) < COMPOUND.x1 + 60 && my - h.y > COMPOUND.y0 - 60 && my - h.y < COMPOUND.y1 + 60;
    const divD = Math.hypot(mx - DIVOT.x, my - DIVOT.y);
    for (let ly = 0; ly < CH; ly++) {
      for (let lx = 0; lx < CH; lx++) {
        const x = x0 + lx, y = y0 + ly;
        const i = ly * CH + lx;
        const z = zs[((ly + 2) >> 2) * 9 + ((lx + 2) >> 2)];
        c.zone[i] = z;
        const hs = hash2(x, y, seed);
        const n1 = p.fbm2(x / 24, y / 24, 3);
        const n2 = p2.fbm2(x / 13, y / 13, 3);
        const patch = this.p3.fbm2(x / 400, y / 400, 2);
        let t: number = TER.DIRT;
        let o = 0, oh = 0;
        switch (z) {
          case ZONE.VERDANT: {
            // A patchwork of fields with hedgerows, woods, and scrub between.
            const fx = Math.floor((x + p.noise2(y / 90, 3) * 20) / 70), fy = Math.floor((y + p.noise2(x / 90, 5) * 20) / 50);
            const field = hash2(fx, fy, seed + 5);
            t = field < 0.35 ? TER.GRASS : field < 0.6 ? TER.DIRT : field < 0.8 ? TER.GRASS : TER.RUST;
            const wood = p2.fbm2(x / 160, y / 160, 3);
            if (wood > 0.22 && hs < 0.45) {
              o = OBS.TREE;
              oh = 8 + Math.floor(hash2(x, y, seed + 9) * 10);
              t = TER.GRASS;
            } else if ((((x + 10000) % 70) === 0 || ((y + 10000) % 50) === 0) && hs < 0.5 && wood > -0.2) {
              o = OBS.TREE;
              oh = 4 + Math.floor(hs * 6);
            }
            break;
          }
          case ZONE.ASH:
            t = n1 > -0.05 ? TER.ASH : TER.CRATER;
            if (patch > 0.3) t = TER.RUST;
            if (n2 > 0.33) {
              o = n2 > 0.45 ? OBS.RUIN : OBS.ROCK;
              oh = 2 + Math.floor((n2 - 0.33) * 40);
            }
            break;
          case ZONE.SCORCHED: {
            t = n1 > 0.05 ? TER.BASALT : TER.ASH;
            if (patch > 0.25) t = TER.GLASS;
            const river = Math.abs(p2.fbm2(x / 180, y / 180, 3));
            if (river < 0.03 || p.fbm2(x / 60 + 90, y / 60, 2) > 0.42) t = TER.LAVA;
            else if (n2 > 0.36) {
              o = OBS.BASALT;
              oh = 3 + Math.floor((n2 - 0.36) * 40);
            }
            break;
          }
          case ZONE.FROST:
            t = p.fbm2(x / 60, y / 60 + 40, 3) > 0.05 ? TER.SNOW : TER.ICE;
            if (p2.fbm2(x / 20, y / 20, 2) > 0.34) {
              o = OBS.ICE_SPIRE;
              oh = 4 + Math.floor(hs * 10);
            } else if (patch > 0.35 && n2 > 0.15) {
              o = OBS.CLIFF;
              oh = 10 + Math.floor(n2 * 30);
            }
            break;
          case ZONE.WRAITH: {
            // Mountains: ridges of cliff you can only crawl over, snow on the heights.
            const ridge = 1 - Math.abs(p.fbm2(x / 700, y / 700, 4));
            t = ridge > 0.8 ? TER.SNOW : n1 > 0.1 ? TER.BASALT : TER.DIRT;
            if (ridge > 0.84 || (ridge > 0.72 && n2 > 0.1)) {
              o = OBS.CLIFF;
              oh = 12 + Math.floor((ridge - 0.7) * 120);
            } else if (n2 > 0.4) {
              o = hs < 0.2 ? OBS.RUIN : OBS.ROCK;
              oh = 3 + Math.floor(hs * 8);
            }
            break;
          }
          case ZONE.DUNES:
            t = p.fbm2(x / 80 + 11, y / 60, 3) > 0.02 ? TER.DUNE : TER.SAND;
            if (patch > 0.36) t = TER.RUST;
            if (n2 > 0.38) {
              o = patch < -0.3 ? OBS.RUIN : OBS.SANDSTONE;
              oh = 2 + Math.floor((n2 - 0.38) * 30);
            }
            break;
          case ZONE.LAKE:
            t = n1 > 0.1 ? TER.MUD : n1 > -0.2 ? TER.GRASS : TER.CONCRETE;
            if (inLake(x, y)) t = TER.ACID;
            else if (n2 > 0.36) {
              o = hs < 0.4 ? OBS.WRECK : OBS.RUIN;
              oh = 3 + Math.floor(hs * 10);
            }
            break;
          case ZONE.SPIRES: {
            t = n1 > 0 ? TER.BASALT : TER.ASH;
            if (p.fbm2(x / 50 + 30, y / 50, 2) > 0.4) t = TER.LAVA;
            const spire = p2.fbm2(x / 30, y / 30, 2);
            if (spire > 0.42 && hs < 0.6) {
              o = OBS.PILLAR;
              oh = 20 + Math.floor((spire - 0.42) * 400);
            } else if (n2 > 0.3) {
              o = OBS.SHARD;
              oh = 3 + Math.floor(hs * 8);
            }
            break;
          }
          case ZONE.PASS: {
            // Canyons: the roads run in the valleys between cliff walls.
            t = n1 > 0.05 ? TER.RUST : TER.DIRT;
            const canyon = Math.abs(p.fbm2(x / 500, y / 500, 3));
            if (canyon > 0.28 && n2 > -0.1) {
              o = OBS.CLIFF;
              oh = 15 + Math.floor(canyon * 40);
            } else if (n2 > 0.42) {
              o = hs < 0.3 ? OBS.WRECK : OBS.ROCK;
              oh = 2 + Math.floor(hs * 5);
            }
            break;
          }
          case ZONE.RUSTBOLT: {
            t = n1 > 0 ? TER.RUST : TER.METAL;
            const bx = Math.floor(x / 40), by = Math.floor(y / 40);
            const lot = hash2(bx, by, seed + 41);
            const ix = x - bx * 40, iy = y - by * 40;
            if (patch > 0.1 && lot < 0.45 && ix > 6 && ix < 34 && iy > 6 && iy < 34 && (ix === 7 || ix === 33 || iy === 7 || iy === 33)) {
              o = OBS.RUIN;
              oh = 10 + Math.floor(lot * 40);
              t = TER.CONCRETE;
            } else if (n2 > 0.4) {
              o = OBS.WRECK;
              oh = 3 + Math.floor(hs * 6);
            }
            break;
          }
          case ZONE.DIVOT: {
            const dd = Math.hypot(x - DIVOT.x, y - DIVOT.y) / DIVOT.rimOut + p.noise2(x / 300, y / 300) * 0.02;
            if (dd < DIVOT.city / DIVOT.rimOut) {
              const res = paintDivotCity(x, y, dd / (DIVOT.city / DIVOT.rimOut), seed, p2);
              t = res.t;
              o = res.o;
              oh = res.h;
            } else if (dd < DIVOT.rimIn / DIVOT.rimOut) {
              // The crater floor: fused glass, rubble and pools.
              t = n1 > 0.1 ? TER.GLASS : n1 > -0.25 ? TER.CRATER : TER.WATER;
              if (n2 > 0.4) {
                o = OBS.RUIN;
                oh = 3 + Math.floor(hs * 12);
              }
            } else {
              // The rim: a ring of mountains with passes worn through.
              const ridge = 1 - Math.abs(p.fbm2(x / 400, y / 400, 4));
              t = TER.BASALT;
              if (ridge > 0.62) {
                o = OBS.CLIFF;
                oh = 20 + Math.floor(ridge * 50);
              } else if (n2 > 0.35) {
                o = OBS.ROCK;
                oh = 4 + Math.floor(hs * 8);
              }
            }
            break;
          }
          case ZONE.EDGE:
            t = TER.BASALT;
            o = OBS.CLIFF;
            oh = 30 + Math.floor((p2.fbm2(x / 40, y / 40, 3) + 0.6) * 40);
            break;
        }
        if (!o && z !== ZONE.EDGE && hs < 0.003 && t !== TER.LAVA && t !== TER.ACID) {
          o = OBS.BOULDER;
          oh = 1 + Math.floor(hash2(x, y, seed + 3) * 3);
        }
        void divD;
        // Named places and minor regions paint over the zone.
        if (z !== ZONE.EDGE) {
          for (const reg of regions) {
            const d = Math.hypot(x + 0.5 - reg.x, y + 0.5 - reg.y) + p.noise2(x / 18, y / 18) * 10;
            if (d > reg.r) continue;
            if (reg.kind === 'hangar') break;
            const res = paintRegion(reg, Math.floor(x / REGION_SCALE), Math.floor(y / REGION_SCALE), d / REGION_SCALE, reg.r / REGION_SCALE, seed, p2);
            if (res.keep) break;
            t = res.t;
            o = res.o;
            oh = res.o ? res.h * REGION_SCALE : res.h;
            break;
          }
        }
        // Rivers (roads bridge them).
        if (rivers.length && z !== ZONE.EDGE) {
          for (const sg of rivers) {
            if (segDist(x + 0.5, y + 0.5, sg) <= sg.w) {
              t = TER.WATER;
              o = 0;
              oh = 0;
              break;
            }
          }
        }
        // Roads.
        if (roads.length && z !== ZONE.EDGE) {
          let best = 99;
          for (const sg of roads) {
            const d = segDist(x + 0.5, y + 0.5, sg);
            if (d < best) best = d;
          }
          if (best <= ROAD_W * 1.8) {
            if (o !== OBS.PILLAR) {
              o = 0;
              oh = 0;
            }
            if (best <= ROAD_W) t = TER.ROAD;
            else if (t === TER.LAVA || t === TER.ACID || t === TER.WATER) t = TER.BASALT;
          }
        }
        // The Mega Hangar's compound: its wall, towers and gate, the town, the docks, the lane.
        if (nearHangar) {
          const hx = x + 0.5 - h.x, hy = y + 0.5 - h.y;
          const W = HANGAR.w / 2, D = HANGAR.d / 2;
          const ct = compoundTile(x - h.x, y - h.y);
          if (ct) {
            t = ct.t === 'metal' ? TER.METAL : ct.t === 'road' ? TER.ROAD : TER.CONCRETE;
            o = ct.o === 'bastion' ? OBS.BASTION : ct.o === 'struct' ? OBS.STRUCT : 0;
            oh = ct.o ? ct.h : 0;
          }
          // The Hangar itself.
          if (Math.abs(hx) < W + 4 && Math.abs(hy) < D + 4) {
            o = 0;
            oh = 0;
            t = Math.abs(hx) < W && Math.abs(hy) < D ? TER.METAL : TER.CONCRETE;
            const wall = (Math.abs(Math.abs(hx) - W) < 4 && Math.abs(hy) < D) || (Math.abs(hy + D) < 4 && Math.abs(hx) < W) || (Math.abs(hy - D) < 4 && Math.abs(hx) < W && Math.abs(hx) > HANGAR.door / 2);
            if (wall) {
              o = OBS.PILLAR;
              oh = 60;
            } else if (Math.abs(hx) < W && Math.abs(hy) < D) {
              // Three service bays and their gantries inside.
              for (const bx of [-W * 0.6, 0, W * 0.6]) if (Math.abs(hx - bx) > 100 && Math.abs(hx - bx) < 104 && hy < D - 60 && hy > -D + 30) {
                o = OBS.PILLAR;
                oh = 40;
              }
            }
          }
        }
        // Dead Zone gate.
        const dg = Math.hypot(x + 0.5 - this.gate.x, y + 0.5 - this.gate.y);
        if (dg < 11) {
          o = 0;
          oh = 0;
          if (dg < 8) t = TER.METAL;
          for (const [ox, oy] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) {
            const gx = Math.floor(this.gate.x) + ox, gy = Math.floor(this.gate.y) + oy;
            if (x >= gx && x <= gx + 1 && y >= gy && y <= gy + 1) {
              o = OBS.PILLAR;
              oh = 9;
            }
          }
        }
        // Feature clearings (and their walls).
        for (const cl of clears) {
          const d = Math.hypot(x + 0.5 - cl.x, y + 0.5 - cl.y);
          if (d > cl.r + 1) continue;
          if (cl.wall) {
            const a = Math.atan2(y + 0.5 - cl.y, x + 0.5 - cl.x);
            const seg = (Math.PI * 2) / cl.wall.gaps;
            const rel = (((a - cl.wall.rot) % seg) + seg) % seg;
            if (Math.abs(d - cl.wall.rr) < 0.75 && rel > (cl.wall.gaps === 3 ? 0.75 : 1.05) && hash2(Math.floor(a * 20), cl.x | 0, seed) > 0.2) {
              o = cl.wall.kind;
              oh = cl.wall.kind === OBS.WALL ? 6 : 2 + Math.floor(hash2(Math.floor(a * 20), 7, seed) * 3);
              continue;
            }
          }
          if (d <= cl.r) {
            o = 0;
            oh = 0;
            if (cl.inner && d <= cl.inner) t = cl.innerTer ?? t;
            else if (t === TER.LAVA || t === TER.ACID) t = TER.ASH;
          }
        }
        c.ter[i] = t;
        c.obs[i] = o;
        c.oh[i] = oh;
      }
    }
    // Decorative props.
    for (let ly = 0; ly < CH; ly++) {
      for (let lx = 0; lx < CH; lx++) {
        const i = ly * CH + lx;
        const x = x0 + lx, y = y0 + ly;
        const z = c.zone[i];
        if (z === ZONE.EDGE || c.obs[i] || c.ter[i] === TER.LAVA || c.ter[i] === TER.ACID || c.ter[i] === TER.ROAD || c.ter[i] === TER.WATER || c.ter[i] === TER.METAL) continue;
        const hs = hash2(x, y, seed + 101);
        if (hs > 1 / 90) continue;
        const list = PROPS[z];
        if (!list) continue;
        const kind = list[Math.floor(hash2(x, y, seed + 102) * list.length)];
        c.props.push({ x: x + 0.2 + hash2(x, y, seed + 103) * 0.6, y: y + 0.2 + hash2(x, y, seed + 104) * 0.6, kind, s: 0.7 + hash2(x, y, seed + 105) * 0.6, rot: hash2(x, y, seed + 106) * Math.PI * 2, v: Math.floor(hash2(x, y, seed + 107) * 4) });
      }
    }
  }
}

function segDist(px: number, py: number, s: Seg): number {
  const vx = s.bx - s.ax, vy = s.by - s.ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - s.ax) * vx + (py - s.ay) * vy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s.ax + vx * t), py - (s.ay + vy * t));
}

/**
 * The lost city in the Divot: 60 m blocks, 16 m avenues; towers rise toward the impact point (up to 150 m), and the
 * very centre is a blast pit of glass. `k` is 0 at the centre and 1 at the city's edge.
 */
function paintDivotCity(x: number, y: number, k: number, seed: number, p2: Perlin): { t: number; o: number; h: number } {
  if (k < 0.06) return { t: k < 0.03 ? TER.WATER : TER.GLASS, o: 0, h: 0 };
  const B = 60, S2 = 16;
  const bx = Math.floor(x / B), by = Math.floor(y / B);
  const ix = x - bx * B, iy = y - by * B;
  const hs = hash2(x, y, seed + 7);
  if (ix < S2 || iy < S2) return { t: TER.ROAD, o: hs < 0.004 ? OBS.WRECK : 0, h: 3 };
  const lot = hash2(bx, by, seed + 5);
  if (lot < 0.1) return { t: TER.GRASS, o: hs < 0.03 ? OBS.TREE : 0, h: 6 };
  if (lot < 0.24) return { t: TER.CONCRETE, o: hs < 0.4 ? OBS.RUIN : 0, h: 2 + Math.floor(hs * 10) };
  const near = 1 - k;
  const tall = Math.floor(12 + near * near * 110 + hash2(bx, by, seed + 6) * 30 * (0.3 + near));
  const edge = ix === S2 || iy === S2 || ix === B - 1 || iy === B - 1;
  if (edge) return { t: TER.CONCRETE, o: hs < 0.1 ? 0 : OBS.RUIN, h: Math.max(4, tall - Math.floor(hs * 10)) };
  const inner = (ix - S2) % 8 === 4 && (iy - S2) % 8 === 4;
  void p2;
  return { t: TER.CONCRETE, o: inner ? OBS.RUIN : 0, h: inner ? tall : 0 };
}

/**
 * Architecture for one tile of a region, `d` tiles from its centre (all at half resolution, see REGION_SCALE).
 * `keep` leaves the zone's own terrain (open ground inside a big region).
 */
function paintRegion(reg: Region, x: number, y: number, d: number, R: number, seed: number, p2: Perlin): { t: number; o: number; h: number; keep?: boolean } {
  const k = 1 - d / R;
  const hs = hash2(x, y, seed + reg.id);
  switch (reg.kind) {
    case 'settlement': {
      // A walled town: a wall with four gates, a market square, houses on a grid.
      if (Math.abs(d - (R - 6)) < 1.2) {
        const a = Math.atan2(y - reg.y / REGION_SCALE, x - reg.x / REGION_SCALE);
        const gate = Math.abs(Math.sin(2 * a)) < 0.08;
        return { t: TER.CONCRETE, o: gate ? 0 : OBS.WALL, h: 8 };
      }
      if (d < R * 0.18) return { t: TER.CONCRETE, o: 0, h: 0 };
      const gx = Math.floor((x + 1000) / 14), gy = Math.floor((y + 1000) / 12);
      const lx = (x + 1000) % 14, ly = (y + 1000) % 12;
      if (lx < 3 || ly < 3) return { t: TER.ROAD, o: 0, h: 0 };
      const house = hash2(gx, gy, seed + 81);
      if (house < 0.7 && (lx === 3 || lx === 13 || ly === 3 || ly === 11)) return { t: TER.CONCRETE, o: OBS.WALL, h: 3 + Math.floor(house * 5) };
      return { t: house < 0.7 ? TER.CONCRETE : TER.GRASS, o: 0, h: 0 };
    }
    case 'raider': {
      // A scrap-wall stronghold: spiked wreck walls, watchtowers, shacks round a yard.
      if (Math.abs(d - (R - 8)) < 2) return { t: TER.RUST, o: hs < 0.06 ? 0 : OBS.WRECK, h: 6 + Math.floor(hs * 6) };
      if (Math.abs(d - (R - 8)) < 4 && hs > 0.985) return { t: TER.RUST, o: OBS.PILLAR, h: 16 };
      if (d < R * 0.25) return { t: TER.DIRT, o: hs < 0.01 ? OBS.WRECK : 0, h: 3 };
      const gx = Math.floor((x + 2000) / 11), gy = Math.floor((y + 2000) / 9);
      const lx = (x + 2000) % 11, ly = (y + 2000) % 9;
      const shack = hash2(gx, gy, seed + 91);
      if (shack < 0.55 && lx >= 2 && lx < 9 && ly >= 2 && ly < 7 && (lx === 2 || lx === 8 || ly === 2 || ly === 6)) return { t: TER.RUST, o: OBS.RUIN, h: 3 + Math.floor(shack * 5) };
      return { t: hs < 0.5 ? TER.DIRT : TER.RUST, o: hs < 0.012 ? OBS.WRECK : 0, h: 2 };
    }
    case 'lake': {
      // Industrial ruins round the water: stacks, tanks and slabs of plating.
      const gx = Math.floor((x + 3000) / 24), gy = Math.floor((y + 3000) / 24);
      const lx = (x + 3000) % 24, ly = (y + 3000) % 24;
      const kind = hash2(gx, gy, seed + 31);
      if (kind < 0.3 && lx >= 4 && lx < 20 && ly >= 4 && ly < 20 && (lx === 4 || lx === 19 || ly === 4 || ly === 19)) return { t: TER.METAL, o: OBS.RUIN, h: 8 + Math.floor(kind * 20) };
      if (kind > 0.85 && lx === 12 && ly === 12) return { t: TER.METAL, o: OBS.PILLAR, h: 30 };
      return { t: TER.METAL, o: 0, h: 0, keep: hs > 0.4 || k < 0.2 };
    }
    case 'spires': {
      if (hs > 0.992) return { t: TER.BASALT, o: OBS.PILLAR, h: 30 + Math.floor(k * 50) };
      if (hs > 0.96) return { t: TER.BASALT, o: OBS.SHARD, h: 6 + Math.floor(hs * 10) };
      return { t: TER.BASALT, o: 0, h: 0, keep: true };
    }
    case 'factory': {
      const perim = Math.abs(d - (R - 6)) < 0.8;
      if (perim) return { t: TER.CONCRETE, o: hs < 0.08 ? 0 : OBS.WALL, h: 5 };
      const gx = Math.floor((x + 2000) / 30), gy = Math.floor((y + 2000) / 22);
      const lx = (x + 2000) % 30, ly = (y + 2000) % 22;
      const kind = hash2(gx, gy, seed + 31);
      if (kind < 0.35 && lx >= 4 && lx < 24 && ly >= 4 && ly < 16) {
        const shell = lx === 4 || lx === 23 || ly === 4 || ly === 15;
        return { t: TER.METAL, o: shell && !(ly === 15 && lx > 10 && lx < 18) ? OBS.RUIN : 0, h: 9 };
      }
      if (kind > 0.9 && lx === 15 && ly === 11) return { t: TER.METAL, o: OBS.PILLAR, h: 16 };
      return { t: hs < 0.5 ? TER.CONCRETE : TER.METAL, o: hs < 0.015 ? OBS.WRECK : 0, h: 3 };
    }
    case 'town': {
      const gx = Math.floor((x + 1000) / 11), gy = Math.floor((y + 1000) / 11);
      const lx = (x + 1000) % 11, ly = (y + 1000) % 11;
      const house = hash2(gx, gy, seed + 51);
      if (house < 0.55 && lx >= 3 && lx < 9 && ly >= 3 && ly < 8) {
        const shell = lx === 3 || lx === 8 || ly === 3 || ly === 7;
        return { t: TER.CONCRETE, o: shell && hs > 0.15 ? OBS.RUIN : 0, h: 3 + Math.floor(house * 5) };
      }
      if (lx === 0 || ly === 0) return { t: TER.ROAD, o: hs < 0.03 ? OBS.WRECK : 0, h: 2 };
      return { t: TER.GRASS, o: hs < 0.01 ? OBS.WRECK : 0, h: 2, keep: true };
    }
    case 'farm': {
      // A farmyard: barns and silos in the middle of the fields.
      if (d < R * 0.35) {
        const gx = Math.floor((x + 1000) / 12), gy = Math.floor((y + 1000) / 9);
        const lx = (x + 1000) % 12, ly = (y + 1000) % 9;
        const barn = hash2(gx, gy, seed + 61);
        if (barn < 0.5 && lx >= 2 && lx < 10 && ly >= 2 && ly < 7 && (lx === 2 || lx === 9 || ly === 2 || ly === 6)) return { t: TER.DIRT, o: OBS.RUIN, h: 4 + Math.floor(barn * 4) };
        if (barn > 0.9 && lx === 6 && ly === 4) return { t: TER.DIRT, o: OBS.PILLAR, h: 12 };
        return { t: TER.DIRT, o: 0, h: 0 };
      }
      return { t: TER.GRASS, o: 0, h: 0, keep: true };
    }
    case 'camp': {
      if (Math.abs(d - (R - 4)) < 1) return { t: TER.RUST, o: hs < 0.15 ? 0 : OBS.WRECK, h: 4 };
      const shack = hash2(Math.floor(x / 8), Math.floor(y / 8), seed + 71);
      const lx = ((x % 8) + 8) % 8, ly = ((y % 8) + 8) % 8;
      if (shack < 0.4 && lx >= 1 && lx < 6 && ly >= 1 && ly < 5 && (lx === 1 || lx === 5 || ly === 1 || ly === 4)) return { t: TER.RUST, o: OBS.RUIN, h: 3 };
      return { t: TER.DIRT, o: hs < 0.01 ? OBS.WRECK : 0, h: 2 };
    }
    case 'ruins': {
      const gx = Math.floor((x + 1000) / 24), gy = Math.floor((y + 1000) / 24);
      const cx = (x + 1000) % 24, cy = (y + 1000) % 24;
      const crypt = hash2(gx, gy, seed + 61);
      if (crypt < 0.35 && cx >= 6 && cx < 18 && cy >= 6 && cy < 18 && (cx === 6 || cx === 17 || cy === 6 || cy === 17) && !(cy === 17 && cx === 11)) return { t: TER.CONCRETE, o: OBS.RUIN, h: 4 + Math.floor(crypt * 10) };
      if (crypt > 0.85 && cx === 12 && cy === 12) return { t: TER.CONCRETE, o: OBS.PILLAR, h: 18 };
      return { t: TER.CONCRETE, o: 0, h: 0, keep: hs > 0.3 };
    }
    case 'hive':
      return { t: p2.noise2(x / 12, y / 12) > 0.15 ? TER.ACID : TER.MUD, o: hs < 0.05 ? OBS.FUNGUS : 0, h: 3 + Math.floor(hs * 60) % 6 };
    default:
      return { t: TER.METAL, o: 0, h: 0, keep: true };
  }
}

export function generateWorld(seed: number): OpenWorld {
  return new OpenWorld(seed);
}

/** A world that isn't streamed (the Dead Zone arena): fixed lists, no regions. */
export function staticWorld(seed: number, map: GameMap, spawn: { x: number; y: number }): WorldGen {
  return {
    seed, map, spawn, nodes: [], sites: [], runes: [], outposts: [], gate: { x: -999, y: -999 }, regions: [], hangar: null,
    focus: () => {},
    zoneOf: (x, y) => map.zoneAt(x, y),
    regionAt: () => null,
    roadsNear: () => [],
  };
}
