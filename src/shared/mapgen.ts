import { CENTER, MAP_SIZE } from './constants';
import { CH, GameMap, OBS, TER, ZONE, type MapChunk } from './map';
import { Perlin } from './noise';
import { RNG, hash2 } from './rng';
import { clamp } from './types';

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

export type Faction = 'monster' | 'zombie' | 'necro' | 'cyborg' | 'military' | 'raider';
/** Regions (cities, bases, towns) are laid out at this scale, so their buildings stand up to a Titan. */
export const REGION_SCALE = 2;

/** The Mothership is built at 1x and shown (and collides) at this scale: a ship the size of a city, dwarfing a Titan. */
export const MS_SCALE = 3;
/** Radius of its hull (collision) and of the ring of defense pylons around its landing field. */
export const MS_HULL_R = 62 * MS_SCALE;
export const MS_PYLON_R = 168 * MS_SCALE;

export type RegionKind = 'city' | 'military' | 'cyborg' | 'zombie' | 'necro' | 'monster' | 'mothership';

export interface Region {
  id: number;
  kind: RegionKind;
  name: string;
  x: number;
  y: number;
  r: number;
  /** Campaign regions have a stronghold with a boss and a part for the Mothership. */
  major: boolean;
  threat: number;
}

export const REGION_INFO: Record<RegionKind, { title: string; color: string; faction: Faction; desc: string; names: string[] }> = {
  city: { title: 'Ruined City', color: '#ffb74d', faction: 'raider', desc: 'Skyscrapers, gangs and the dead. Drive through the buildings: they come down.', names: ['Old Meridian', 'Rustholm', 'Sprawl 9', 'Ashgate', 'New Babel', 'Lower Carthage'] },
  military: { title: 'Abandoned Military Base', color: '#aed581', faction: 'military', desc: 'Hangars, bunkers and war machines still following their last orders.', names: ['Fort Hollow', 'Camp Iron Rain', 'Firebase Kestrel', 'Depot Seven', 'Outpost Tartarus'] },
  cyborg: { title: 'Cyborg Foundry', color: '#4dd0e1', faction: 'cyborg', desc: 'Where the machines rebuild the living into something else.', names: ['The Assembly', 'Chrome Reach', 'Neural Works', 'The Grafting Yards'] },
  zombie: { title: 'Zombie Quarantine', color: '#9ccc65', faction: 'zombie', desc: 'The fence failed a long time ago. Towns full of the dead.', names: ['Quarantine Zone Theta', 'Pale Hollow', 'The Rotting Towns', 'Saint Agnes Sprawl'] },
  necro: { title: 'Necropolis', color: '#b388ff', faction: 'necro', desc: 'Graveyards that do not stay buried. Necromancers raise the fallen.', names: ['The Bone Fields', 'Cathedral of Ash', 'Grimhold', 'The Lich Road'] },
  monster: { title: 'Monster Brood', color: '#ff5252', faction: 'monster', desc: 'Hives of the things that came from the acid. The hordes are born here.', names: ['The Brood Nest', 'Maw Hollows', 'The Writhing Deep', 'Spawnmire'] },
  mothership: { title: 'The Mothership', color: '#18ffff', faction: 'monster', desc: 'A ship the size of a city, at the edge of the world. Trade, hire and rebuild your fortress here. The hordes never stop trying to get in.', names: ['The Mothership'] },
};

/* ---------------------------------------------------------------------- */
/* Layout                                                                  */
/* ---------------------------------------------------------------------- */

/** Radii of the world's rings (the camp is at the centre). */
export const RING = { CAMP: 22, RUST: 1250, ACID: 4050, EDGE: 4800 };

/** Danger rating of a spot: 1 at camp, rising with distance. Tiers I-V. */
export function threatAt(x: number, y: number): number {
  const r = Math.hypot(x - CENTER, y - CENTER);
  return clamp(1 + Math.max(0, r - 60) / 640, 1, 8);
}

export function threatTier(t: number): number {
  return t < 2 ? 1 : t < 3.3 ? 2 : t < 4.6 ? 3 : t < 6 ? 4 : 5;
}

export const TIER_NAMES = ['', 'I', 'II', 'III', 'IV', 'V'];

/** Roads are polylines; a tile is road within ROAD_W of one. */
const ROAD_W = 2.6;
/** Features are generated per sector (SECTOR x SECTOR tiles). */
export const SECTOR = 256;

const SITE_KIND: Record<number, SiteKind> = {
  [ZONE.RUSTBELT]: 'ruins', [ZONE.DUNES]: 'convoy', [ZONE.CRYO]: 'bunker', [ZONE.GLASS]: 'crash', [ZONE.MAGMA]: 'foundry', [ZONE.ACID]: 'hive',
};

const NODE_WEIGHTS: Record<number, [NodeType, number][]> = {
  [ZONE.RUSTBELT]: [['scrap', 5], ['iron', 3], ['copper', 3], ['biomass', 1]],
  [ZONE.DUNES]: [['titanium', 5], ['scrap', 3], ['iron', 2], ['copper', 1]],
  [ZONE.CRYO]: [['cryo', 5], ['scrap', 2], ['iron', 2], ['copper', 1]],
  [ZONE.GLASS]: [['uranium', 5], ['scrap', 2], ['copper', 2], ['iron', 1]],
  [ZONE.MAGMA]: [['sulfur', 5], ['iron', 2], ['scrap', 2], ['xenite', 0.5]],
  [ZONE.ACID]: [['xenite', 4], ['biomass', 3], ['scrap', 2], ['uranium', 0.5]],
};

const PROPS: Record<number, PropKind[]> = {
  [ZONE.RUSTBELT]: ['bones', 'barrel', 'wreckcar', 'sign', 'pipe', 'deadtree', 'crate'],
  [ZONE.DUNES]: ['bones', 'skull', 'cactus', 'wreckcar', 'cactus'],
  [ZONE.CRYO]: ['crystal', 'deadtree', 'spike', 'bones'],
  [ZONE.GLASS]: ['crystal', 'barrel', 'skull', 'wreckcar'],
  [ZONE.MAGMA]: ['spike', 'bones', 'pipe', 'skull'],
  [ZONE.ACID]: ['mushroom', 'bones', 'crystal', 'mushroom'],
};

const REGION_ZONE: Record<number, RegionKind[]> = {
  [ZONE.RUSTBELT]: ['city', 'zombie', 'city'],
  [ZONE.DUNES]: ['military', 'city', 'military'],
  [ZONE.CRYO]: ['zombie', 'zombie', 'military'],
  [ZONE.GLASS]: ['cyborg', 'cyborg', 'military'],
  [ZONE.MAGMA]: ['necro', 'necro', 'cyborg'],
  [ZONE.ACID]: ['monster', 'monster', 'necro'],
};

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
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

/**
 * The open world. Terrain streams in chunk by chunk (see GameMap); features stream in by sector around where you
 * are. `nodes`, `sites`, `runes` and `outposts` hold only the ones near the fortress (see `focus`).
 */
export interface WorldGen {
  seed: number;
  map: GameMap;
  spawn: { x: number; y: number };
  nodes: ResourceNode[];
  sites: Site[];
  runes: RuneAltar[];
  outposts: OutpostSpot[];
  gate: { x: number; y: number };
  regions: Region[];
  mothership: { x: number; y: number; r: number } | null;
  /** Streams features around (x, y). Cheap to call often. */
  focus(x: number, y: number): void;
  /** Biome at a world point without generating anything (maps and overviews). */
  zoneOf(x: number, y: number): number;
  /** The region a point is in, if any (majors first). */
  regionAt(x: number, y: number): Region | null;
  roadsNear(x0: number, y0: number, x1: number, y1: number): Seg[];
}

export class OpenWorld implements WorldGen {
  readonly seed: number;
  readonly map: GameMap;
  readonly spawn: { x: number; y: number };
  readonly gate: { x: number; y: number };
  nodes: ResourceNode[] = [];
  sites: Site[] = [];
  runes: RuneAltar[] = [];
  outposts: OutpostSpot[] = [];
  readonly regions: Region[] = [];
  readonly mothership: { x: number; y: number; r: number };
  readonly saved: FeatureState = { nodes: new Map(), sites: new Map(), runes: new Map() };
  private p: Perlin;
  private p2: Perlin;
  private p3: Perlin;
  private segs: Seg[] = [];
  private segIndex = new Map<number, number[]>();
  private sectors = new Map<number, Sector>();
  private focusKey = -1;
  private readonly sps = Math.ceil(MAP_SIZE / SECTOR);

  constructor(seed: number) {
    this.seed = seed;
    this.p = new Perlin(seed);
    this.p2 = new Perlin(seed ^ 0x5bd1e995);
    this.p3 = new Perlin(seed ^ 0x2c1b3c6d);
    const rng = new RNG(seed ^ 0x2545f491);
    const C = CENTER;
    this.spawn = { x: C + 0.5, y: C + 0.5 };
    const ga = -Math.PI / 4;
    this.gate = { x: C + Math.cos(ga) * 70, y: C + Math.sin(ga) * 70 };
    /* Major regions: one of each, further out the harder they are. */
    const major = (kind: RegionKind, a: number, dist: number, r: number): Region => {
      const reg: Region = { id: this.regions.length + 1, kind, name: REGION_INFO[kind].names[Math.floor(rng.next() * REGION_INFO[kind].names.length)], x: C + Math.cos(a) * dist, y: C + Math.sin(a) * dist, r, major: true, threat: 0 };
      reg.threat = threatAt(reg.x, reg.y);
      this.regions.push(reg);
      return reg;
    };
    const jit = (): number => (rng.next() - 0.5) * 0.7;
    major('city', Math.PI * 0.75 + jit(), 820, 115 * REGION_SCALE);
    major('military', 0 + jit(), 1650, 120 * REGION_SCALE);
    major('zombie', -Math.PI / 2 + jit(), 1950, 130 * REGION_SCALE);
    major('cyborg', Math.PI / 2 + jit(), 2350, 120 * REGION_SCALE);
    major('necro', Math.PI + jit(), 2750, 130 * REGION_SCALE);
    const nestA = Math.PI * 0.25 + jit();
    major('monster', nestA, 4250, 150 * REGION_SCALE);
    // The Mothership: at the very edge of the world, opposite the brood it's at war with.
    const ma = -Math.PI * 0.75 + jit() * 0.5;
    const ms = major('mothership', ma, 4520 - 190 * (MS_SCALE - 1) * 0.55, 190 * MS_SCALE);
    this.mothership = { x: ms.x, y: ms.y, r: 70 * MS_SCALE };
    this.buildRoads(rng);
    this.map = new GameMap(MAP_SIZE, (c) => this.fill(c));
  }

  /* ---------------- layout ---------------- */

  zoneOf(x: number, y: number): number {
    const dx = x - CENTER, dy = y - CENTER;
    const r = Math.hypot(dx, dy) + this.p.fbm2(x / 900, y / 900, 3) * 380;
    if (r > RING.EDGE) return ZONE.EDGE;
    if (r > RING.ACID) return ZONE.ACID;
    if (r < RING.RUST) return ZONE.RUSTBELT;
    let a = Math.atan2(dy, dx) + this.p.fbm2(x / 1400 + 50, y / 1400 - 30, 2) * 0.45;
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    const q = Math.PI / 4;
    if (a >= -3 * q && a < -q) return ZONE.CRYO;
    if (a >= -q && a < q) return ZONE.DUNES;
    if (a >= q && a < 3 * q) return ZONE.GLASS;
    return ZONE.MAGMA;
  }

  regionAt(x: number, y: number): Region | null {
    for (const r of this.regions) if ((x - r.x) ** 2 + (y - r.y) ** 2 < r.r * r.r) return r;
    const sx = Math.floor(x / SECTOR), sy = Math.floor(y / SECTOR);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const reg = this.minorRegion(sx + dx, sy + dy);
        if (reg && (x - reg.x) ** 2 + (y - reg.y) ** 2 < reg.r * reg.r) return reg;
      }
    }
    return null;
  }

  /** Highways: eight spokes out of camp, three ring roads, and spurs to every region and the Mothership. */
  private buildRoads(rng: RNG): void {
    const C = CENTER;
    const line = (pts: { x: number; y: number }[]): void => {
      for (let i = 0; i + 1 < pts.length; i++) this.addSeg(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    };
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + 0.12;
      const fx = Math.cos(a), fy = Math.sin(a);
      const pts: { x: number; y: number }[] = [];
      for (let t = 0; t <= RING.EDGE - 160; t += 16) {
        const off = this.p3.noise2(t / 600, k * 10.3) * 260 * Math.min(1, t / 400);
        pts.push({ x: C + fx * t - fy * off, y: C + fy * t + fx * off });
      }
      line(pts);
    }
    for (const R of [700, 1900, 3200]) {
      const pts: { x: number; y: number }[] = [];
      const n = Math.ceil((Math.PI * 2 * R) / 18);
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = R + this.p3.noise2(a * 4, R) * 120;
        pts.push({ x: C + Math.cos(a) * r, y: C + Math.sin(a) * r });
      }
      line(pts);
    }
    // A short road to the Dead Zone gate.
    line([{ x: C, y: C }, this.gate]);
    // Spurs: from the nearest ring road point straight into each region.
    for (const reg of this.regions) {
      const a = Math.atan2(reg.y - C, reg.x - C);
      const d = Math.hypot(reg.x - C, reg.y - C);
      const from = Math.max(0, d - 420 - rng.next() * 200);
      const pts: { x: number; y: number }[] = [];
      for (let t = from; t <= d; t += 16) {
        const off = this.p3.noise2(t / 300, reg.id * 7.7) * 60 * Math.min(1, (t - from) / 200) * Math.min(1, (d - t) / 150);
        pts.push({ x: C + Math.cos(a) * t - Math.sin(a) * off, y: C + Math.sin(a) * t + Math.cos(a) * off });
      }
      line(pts);
    }
  }

  private addSeg(ax: number, ay: number, bx: number, by: number): void {
    const i = this.segs.length;
    this.segs.push({ ax, ay, bx, by });
    const m = ROAD_W + 4;
    const c0x = Math.floor((Math.min(ax, bx) - m) / CH), c1x = Math.floor((Math.max(ax, bx) + m) / CH);
    const c0y = Math.floor((Math.min(ay, by) - m) / CH), c1y = Math.floor((Math.max(ay, by) + m) / CH);
    const cps = Math.ceil(MAP_SIZE / CH);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        if (cx < 0 || cy < 0 || cx >= cps || cy >= cps) continue;
        const k = cy * cps + cx;
        let a = this.segIndex.get(k);
        if (!a) this.segIndex.set(k, (a = []));
        a.push(i);
      }
    }
  }

  roadsNear(x0: number, y0: number, x1: number, y1: number): Seg[] {
    const cps = Math.ceil(MAP_SIZE / CH);
    const out = new Set<number>();
    for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) {
      for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) for (const i of this.segIndex.get(cy * cps + cx) ?? []) out.add(i);
    }
    return [...out].map((i) => this.segs[i]);
  }

  /* ---------------- sectors: features ---------------- */

  private sectorRng(sx: number, sy: number, salt: number): RNG {
    return new RNG((hash2(sx, sy, this.seed + salt) * 4294967296) >>> 0);
  }

  /** A minor region (town, hive, graveyard...) centred in a sector, or null. Deterministic. */
  private minorRegion(sx: number, sy: number): Region | null {
    if (sx < 0 || sy < 0 || sx >= this.sps || sy >= this.sps) return null;
    if (hash2(sx, sy, this.seed + 71) > 0.075) return null;
    const r = this.sectorRng(sx, sy, 72);
    const x = (sx + 0.3 + r.next() * 0.4) * SECTOR, y = (sy + 0.3 + r.next() * 0.4) * SECTOR;
    const z = this.zoneOf(x, y);
    if (z === ZONE.EDGE || Math.hypot(x - CENTER, y - CENTER) < 260) return null;
    for (const m of this.regions) if (Math.hypot(m.x - x, m.y - y) < m.r + 160) return null;
    const kinds = REGION_ZONE[z];
    const kind = kinds[Math.floor(r.next() * kinds.length)];
    const info = REGION_INFO[kind];
    return {
      id: 1000 + sy * this.sps + sx, kind, name: info.names[Math.floor(r.next() * info.names.length)], x, y, r: (36 + r.next() * 30) * REGION_SCALE, major: false, threat: threatAt(x, y),
    };
  }

  private sector(sx: number, sy: number): Sector {
    const key = sy * this.sps + sx;
    let s = this.sectors.get(key);
    if (s) return s;
    s = { nodes: [], sites: [], runes: [], outposts: [], region: this.minorRegion(sx, sy) };
    this.sectors.set(key, s);
    const rng = this.sectorRng(sx, sy, 11);
    const C = CENTER;
    const x0 = sx * SECTOR, y0 = sy * SECTOR;
    const taken: { x: number; y: number; r: number }[] = [];
    const near = (x: number, y: number, r: number): boolean =>
      taken.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + r) || Math.hypot(x - C, y - C) < RING.CAMP + r + 4 || Math.hypot(x - this.gate.x, y - this.gate.y) < 14 + r || this.inMothership(x, y, r) ||
      (r > 3 && this.regions.some((m) => m.kind !== 'mothership' && Math.hypot(m.x - x, m.y - y) < m.r + r));
    const spot = (clear: number): { x: number; y: number; z: number } | null => {
      for (let t = 0; t < 12; t++) {
        const x = x0 + 12 + rng.next() * (SECTOR - 24), y = y0 + 12 + rng.next() * (SECTOR - 24);
        const z = this.zoneOf(x, y);
        if (z === ZONE.EDGE || near(x, y, clear)) continue;
        // The whole clearing stays in one zone.
        let ok = true;
        for (let a = 0; a < 4 && ok; a++) if (this.zoneOf(x + Math.cos(a * 1.57) * clear, y + Math.sin(a * 1.57) * clear) !== z) ok = false;
        if (!ok) continue;
        taken.push({ x, y, r: clear });
        return { x, y, z };
      }
      return null;
    };
    const base = key * 64;
    // Outposts: enemy forts, away from the start.
    if (rng.next() < 0.3) {
      const o = spot(13);
      if (o && Math.hypot(o.x - C, o.y - C) > 300) s.outposts.push({ id: key * 2 + 1, x: o.x, y: o.y, zone: o.z, threat: threatAt(o.x, o.y), rot: rng.next() * Math.PI * 2 });
    }
    // Loot areas.
    const nSites = 1 + (rng.next() < 0.6 ? 1 : 0);
    for (let k = 0; k < nSites; k++) {
      const o = spot(10);
      if (!o) continue;
      const kind = SITE_KIND[o.z];
      const names = SITE_INFO[kind].names;
      const id = key * 4 + k + 1;
      s.sites.push({ id, x: o.x, y: o.y, kind, zone: o.z, threat: threatAt(o.x, o.y), name: names[Math.floor(rng.next() * names.length)], readyAt: this.saved.sites.get(id) ?? 0 });
    }
    // Rune altars.
    if (rng.next() < 0.45) {
      const o = spot(9);
      if (o) {
        const RUNES: RuneKind[] = ['crimson', 'azure', 'verdant', 'gilded'];
        const id = key * 2 + 1;
        s.runes.push({ id, x: o.x, y: o.y, rune: RUNES[Math.floor(rng.next() * 4)], zone: o.z, threat: threatAt(o.x, o.y), readyAt: this.saved.runes.get(id) ?? 0 });
      }
    }
    // Resource nodes.
    const want = 34;
    for (let k = 0, placed = 0; k < want * 3 && placed < want; k++) {
      const x = x0 + 3 + rng.next() * (SECTOR - 6), y = y0 + 3 + rng.next() * (SECTOR - 6);
      const z = this.zoneOf(x, y);
      if (z === ZONE.EDGE || near(x, y, 3)) continue;
      if (s.nodes.some((n) => Math.abs(n.x - x) < 6 && Math.abs(n.y - y) < 6)) continue;
      const weights = NODE_WEIGHTS[z];
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
    // A few easy scrap heaps and ore right next to camp for the first minutes.
    if (Math.floor(C / SECTOR) === sx && Math.floor(C / SECTOR) === sy) {
      const starter: NodeType[] = ['scrap', 'scrap', 'iron', 'copper', 'scrap', 'iron'];
      starter.forEach((type, k) => {
        const a = k * 1.05 + 0.4;
        const r = 15.5 + (k % 2) * 2;
        this.addNode(s!, base + 50 + k, C + Math.cos(a) * r, C + Math.sin(a) * r, type, rng);
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

  private inMothership(x: number, y: number, r: number): boolean {
    const m = this.mothership;
    return !!m && Math.hypot(x - m.x, y - m.y) < 190 * MS_SCALE + r;
  }

  /** Streams features around (x, y): the 3x3 sectors around it become the active lists. */
  focus(x: number, y: number): void {
    const sx = Math.floor(x / SECTOR), sy = Math.floor(y / SECTOR);
    const key = sy * this.sps + sx;
    if (key === this.focusKey) return;
    this.focusKey = key;
    const nodes: ResourceNode[] = [], sites: Site[] = [], runes: RuneAltar[] = [], outposts: OutpostSpot[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
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
    const C = CENTER;
    // What touches this chunk: regions, sector features and roads.
    const regions: Region[] = [];
    for (const r of this.regions) if (r.kind !== 'mothership' && Math.abs(r.x - (x0 + 16)) < r.r + 40 && Math.abs(r.y - (y0 + 16)) < r.r + 40) regions.push(r);
    const sx = Math.floor((x0 + 16) / SECTOR), sy = Math.floor((y0 + 16) / SECTOR);
    const clears: { x: number; y: number; r: number; ter?: number; inner?: number; innerTer?: number; wall?: { rot: number; kind: number; gaps: number; rr: number } }[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const X = sx + dx, Y = sy + dy;
        if (X < 0 || Y < 0 || X >= this.sps || Y >= this.sps) continue;
        const s = this.sector(X, Y);
        if (s.region) regions.push(s.region);
        for (const o of s.outposts) clears.push({ x: o.x, y: o.y, r: 13, inner: 9, innerTer: TER.METAL, wall: { rot: o.rot, kind: OBS.WALL, gaps: 3, rr: 11.5 } });
        for (const st of s.sites) clears.push({ x: st.x, y: st.y, r: 10, inner: 7, innerTer: st.kind === 'hive' ? TER.MUD : st.kind === 'foundry' ? TER.METAL : TER.CONCRETE, wall: { rot: (st.id * 1.7) % Math.PI, kind: st.kind === 'hive' ? OBS.FUNGUS : st.kind === 'convoy' || st.kind === 'crash' ? OBS.WRECK : OBS.RUIN, gaps: 4, rr: 8.6 } });
        for (const r of s.runes) clears.push({ x: r.x, y: r.y, r: 9, inner: 4, innerTer: TER.CONCRETE });
        for (const n of s.nodes) clears.push({ x: n.x, y: n.y, r: 2.5 });
      }
    }
    // Only the clearings that reach into this chunk.
    for (let k = clears.length - 1; k >= 0; k--) {
      const cl = clears[k];
      if (cl.x + cl.r + 1 < x0 || cl.x - cl.r - 1 > x0 + CH || cl.y + cl.r + 1 < y0 || cl.y - cl.r - 1 > y0 + CH) clears.splice(k, 1);
    }
    for (let k = regions.length - 1; k >= 0; k--) {
      const r = regions[k];
      if (r.x + r.r + 12 < x0 || r.x - r.r - 12 > x0 + CH || r.y + r.r + 12 < y0 || r.y - r.r - 12 > y0 + CH) regions.splice(k, 1);
    }
    const roads = this.roadsNear(x0 - 6, y0 - 6, x0 + CH + 6, y0 + CH + 6);
    const ms = this.mothership;
    const nearMs = Math.abs(ms.x - (x0 + 16)) < 200 * MS_SCALE && Math.abs(ms.y - (y0 + 16)) < 200 * MS_SCALE;
    for (let ly = 0; ly < CH; ly++) {
      for (let lx = 0; lx < CH; lx++) {
        const x = x0 + lx, y = y0 + ly;
        const i = ly * CH + lx;
        const z = this.zoneOf(x + 0.5, y + 0.5);
        c.zone[i] = z;
        const n1 = p.fbm2(x / 24, y / 24, 3);
        const n2 = p2.fbm2(x / 13, y / 13, 3);
        const hs = hash2(x, y, seed);
        let t: number = TER.DIRT;
        let o = 0, h = 0;
        // Big patches of different ground so long drives don't look the same.
        const patch = this.p3.fbm2(x / 180, y / 180, 2);
        switch (z) {
          case ZONE.RUSTBELT: {
            t = n1 > 0.15 ? TER.DIRT : n1 < -0.22 ? TER.GRASS : TER.RUST;
            const city = p2.fbm2(x / 44 + 7, y / 44 - 3, 2);
            if (city > 0.28) {
              t = TER.CONCRETE;
              const bx = Math.floor(x / 10), by = Math.floor(y / 10);
              const onX = x % 10 === 0, onY = y % 10 === 0;
              if ((onX && hash2(bx, by * 3 + 1, seed) > 0.45) || (onY && hash2(bx * 3 + 2, by, seed) > 0.45)) {
                o = OBS.RUIN;
                h = 3 + Math.floor(hash2(bx, by, seed + 9) * 5);
              }
            } else if (n2 > 0.36) {
              o = OBS.ROCK;
              h = 2 + Math.floor((n2 - 0.36) * 20);
            }
            break;
          }
          case ZONE.DUNES:
            t = p.fbm2(x / 30 + 11, y / 30, 3) > 0.02 ? TER.DUNE : TER.SAND;
            if (patch > 0.32) t = TER.RUST;
            if (n2 > 0.35) {
              o = OBS.SANDSTONE;
              h = 2 + Math.floor((n2 - 0.35) * 26);
            }
            break;
          case ZONE.CRYO:
            t = p.fbm2(x / 26, y / 26 + 40, 3) > 0 ? TER.ICE : TER.SNOW;
            if (patch > 0.3) t = TER.SNOW;
            if (p2.fbm2(x / 9, y / 9, 2) > 0.33) {
              o = OBS.ICE_SPIRE;
              h = 4 + Math.floor(hs * 6);
            }
            break;
          case ZONE.GLASS:
            t = n1 > -0.1 ? TER.GLASS : TER.CRATER;
            if (p2.fbm2(x / 8, y / 8, 2) > 0.35) {
              o = OBS.SHARD;
              h = 2 + Math.floor(hs * 5);
            }
            break;
          case ZONE.MAGMA: {
            t = n1 > 0.08 ? TER.BASALT : TER.ASH;
            const river = Math.abs(p2.fbm2(x / 55, y / 55, 3));
            if (river < 0.035 || p.fbm2(x / 20 + 90, y / 20, 2) > 0.38) t = TER.LAVA;
            else if (n2 > 0.34) {
              o = OBS.BASALT;
              h = 3 + Math.floor((n2 - 0.34) * 30);
            }
            break;
          }
          case ZONE.ACID:
            t = p.fbm2(x / 22 + 31, y / 22, 3) > -0.02 ? TER.ACID : TER.MUD;
            if (t === TER.MUD && p2.fbm2(x / 7, y / 7, 2) > 0.38) {
              o = OBS.FUNGUS;
              h = 3 + Math.floor(hs * 4);
            }
            break;
          case ZONE.EDGE:
            t = TER.DIRT;
            o = OBS.CLIFF;
            h = 6 + Math.floor((p2.fbm2(x / 12, y / 12, 3) + 0.6) * 8);
            break;
        }
        if (!o && z !== ZONE.EDGE && hs < 0.004 && t !== TER.LAVA && t !== TER.ACID) {
          o = z === ZONE.RUSTBELT ? OBS.ROCK : OBS.BOULDER;
          h = 1 + Math.floor(hash2(x, y, seed + 3) * 2);
        }
        // Regions paint over the biome.
        if (z !== ZONE.EDGE) {
          for (const reg of regions) {
            const d = Math.hypot(x + 0.5 - reg.x, y + 0.5 - reg.y) + p.noise2(x / 18, y / 18) * 10;
            if (d > reg.r) continue;
            // Architecture is laid out at half resolution and built twice as tall: city blocks a Titan can plough into.
            const res = paintRegion(reg, Math.floor(x / REGION_SCALE), Math.floor(y / REGION_SCALE), d / REGION_SCALE, reg.r / REGION_SCALE, seed, p2);
            t = res.t;
            o = res.o;
            h = res.o ? res.h * REGION_SCALE : res.h;
            break;
          }
        }
        // The Mothership's landing field: flat deck plating ringed by defense pylons.
        if (nearMs) {
          const d = Math.hypot(x + 0.5 - ms.x, y + 0.5 - ms.y);
          if (d < 185 * MS_SCALE) {
            t = d < 150 * MS_SCALE ? TER.METAL : TER.CONCRETE;
            o = 0;
            h = 0;
            const ring = Math.abs(d - MS_PYLON_R);
            if (ring < 2.4 && hash2(Math.floor(Math.atan2(y - ms.y, x - ms.x) * 30 * MS_SCALE), 7, seed) < 0.35) {
              o = OBS.PILLAR;
              h = 30;
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
          if (best <= ROAD_W * 2) {
            if (o !== OBS.PILLAR) {
              o = 0;
              h = 0;
            }
            if (best <= ROAD_W) t = TER.ROAD;
            else if (t === TER.LAVA || t === TER.ACID) t = z === ZONE.ACID ? TER.MUD : TER.BASALT;
          }
        }
        // Camp at the centre.
        const dc = Math.hypot(x + 0.5 - C, y + 0.5 - C);
        if (dc < 18) {
          o = 0;
          h = 0;
          if (dc < 11) t = dc < 3.2 ? TER.CONCRETE : TER.CAMP;
        }
        // Dead Zone gate.
        const dg = Math.hypot(x + 0.5 - this.gate.x, y + 0.5 - this.gate.y);
        if (dg < 11) {
          o = 0;
          h = 0;
          if (dg < 8) t = TER.METAL;
          for (const [ox, oy] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) {
            const gx = Math.floor(this.gate.x) + ox, gy = Math.floor(this.gate.y) + oy;
            if (x >= gx && x <= gx + 1 && y >= gy && y <= gy + 1) {
              o = OBS.PILLAR;
              h = 9;
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
              h = cl.wall.kind === OBS.WALL ? 4 : 2 + Math.floor(hash2(Math.floor(a * 20), 7, seed) * 3);
              continue;
            }
          }
          if (d <= cl.r) {
            o = 0;
            h = 0;
            if (cl.inner && d <= cl.inner) t = cl.innerTer ?? t;
            else if (t === TER.LAVA || t === TER.ACID) t = z === ZONE.ACID ? TER.MUD : TER.ASH;
          }
        }
        c.ter[i] = t;
        c.obs[i] = o;
        c.oh[i] = h;
      }
    }
    // Decorative props.
    for (let ly = 0; ly < CH; ly++) {
      for (let lx = 0; lx < CH; lx++) {
        const i = ly * CH + lx;
        const x = x0 + lx, y = y0 + ly;
        const z = c.zone[i];
        if (z === ZONE.EDGE || c.obs[i] || c.ter[i] === TER.LAVA || c.ter[i] === TER.ACID || c.ter[i] === TER.ROAD || c.ter[i] === TER.CAMP || c.ter[i] === TER.METAL) continue;
        const hs = hash2(x, y, seed + 101);
        if (hs > 1 / 75) continue;
        const list = PROPS[z];
        const kind = list[Math.floor(hash2(x, y, seed + 102) * list.length)];
        c.props.push({ x: x + 0.2 + hash2(x, y, seed + 103) * 0.6, y: y + 0.2 + hash2(x, y, seed + 104) * 0.6, kind, s: 0.7 + hash2(x, y, seed + 105) * 0.6, rot: hash2(x, y, seed + 106) * Math.PI * 2, v: Math.floor(hash2(x, y, seed + 107) * 4) });
      }
    }
    // Camp dressing.
    if (Math.abs(x0 + 16 - C) < 40 && Math.abs(y0 + 16 - C) < 40) {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + 0.3;
        const px = C + Math.cos(a) * 13.5, py = C + Math.sin(a) * 13.5;
        if (Math.floor(px / CH) !== c.cx || Math.floor(py / CH) !== c.cy) continue;
        c.props.push({ x: px, y: py, kind: k % 3 === 0 ? 'antenna' : k % 3 === 1 ? 'tent' : 'crate', s: 1.1, rot: a, v: k % 4 });
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
 * Region architecture for one tile, `d` tiles from the region centre. Cities get street grids with skyscrapers that
 * rise toward downtown; bases get hangars, bunkers and a perimeter; necropolises get grave rows and obelisks.
 */
function paintRegion(reg: Region, x: number, y: number, d: number, R: number, seed: number, p2: Perlin): { t: number; o: number; h: number } {
  const k = 1 - d / R;
  const hs = hash2(x, y, seed + reg.id);
  switch (reg.kind) {
    case 'city': {
      // 14-tile blocks with 4-wide streets; buildings get taller toward the middle and some have collapsed.
      const B = 14, S = 4;
      const bx = Math.floor((x + 1000) / B), by = Math.floor((y + 1000) / B);
      const ix = (x + 1000) % B, iy = (y + 1000) % B;
      const street = ix < S || iy < S;
      if (street) return { t: ix < S && iy < S ? TER.CONCRETE : TER.ROAD, o: hs < 0.012 ? OBS.WRECK : 0, h: 2 };
      const lot = hash2(bx, by, seed + 5);
      if (lot < 0.12) return { t: TER.GRASS, o: hs < 0.02 ? OBS.RUIN : 0, h: 2 };
      // Collapsed buildings leave rubble mounds.
      if (lot < 0.24) return { t: TER.CONCRETE, o: hs < 0.35 ? OBS.RUIN : 0, h: 1 + Math.floor(hs * 6) };
      const tall = 5 + Math.floor(k * k * 22 + hash2(bx, by, seed + 6) * 8 * (0.4 + k));
      // Hollow shells: walls round the lot, an empty floor inside, broken windows.
      const edge = ix === S || iy === S || ix === B - 1 || iy === B - 1;
      if (edge) return { t: TER.CONCRETE, o: hs < 0.12 ? 0 : OBS.RUIN, h: Math.max(2, tall - Math.floor(hs * 4)) };
      const inner = (ix - S) % 4 === 2 && (iy - S) % 4 === 2;
      return { t: TER.CONCRETE, o: inner ? OBS.RUIN : 0, h: inner ? tall : 0 };
    }
    case 'military': {
      const perim = Math.abs(d - (R - 6)) < 0.8;
      if (perim) return { t: TER.CONCRETE, o: hs < 0.08 ? 0 : OBS.WALL, h: 5 };
      // Hangars (big long blocks), bunkers, runway strips and wrecked vehicles.
      const gx = Math.floor((x + 2000) / 30), gy = Math.floor((y + 2000) / 22);
      const lx = (x + 2000) % 30, ly = (y + 2000) % 22;
      const kind = hash2(gx, gy, seed + 31);
      if (kind < 0.3 && lx >= 4 && lx < 24 && ly >= 4 && ly < 16) {
        const shell = lx === 4 || lx === 23 || ly === 4 || ly === 15;
        return { t: TER.METAL, o: shell && !(ly === 15 && lx > 10 && lx < 18) ? OBS.RUIN : 0, h: 9 };
      }
      if (kind < 0.55 && lx >= 10 && lx < 16 && ly >= 8 && ly < 14) return { t: TER.CONCRETE, o: OBS.RUIN, h: 4 };
      if (Math.abs(ly - 11) < 3 && kind > 0.8) return { t: TER.ROAD, o: 0, h: 0 };
      return { t: hs < 0.5 ? TER.CONCRETE : TER.SAND, o: hs < 0.015 ? OBS.WRECK : hs > 0.992 ? OBS.PILLAR : 0, h: hs > 0.992 ? 6 : 3 };
    }
    case 'cyborg': {
      const gx = Math.floor((x + 3000) / 18), gy = Math.floor((y + 3000) / 18);
      const lx = (x + 3000) % 18, ly = (y + 3000) % 18;
      const kind = hash2(gx, gy, seed + 41);
      if (kind < 0.45 && lx >= 3 && lx < 15 && ly >= 3 && ly < 15) {
        const shell = lx === 3 || lx === 14 || ly === 3 || ly === 14;
        return { t: TER.METAL, o: shell ? OBS.RUIN : lx % 4 === 1 && ly % 4 === 1 ? OBS.SHARD : 0, h: 8 + Math.floor(k * 10) };
      }
      if (kind > 0.9 && lx === 9 && ly === 9) return { t: TER.METAL, o: OBS.PILLAR, h: 16 };
      return { t: hs < 0.6 ? TER.METAL : TER.GLASS, o: hs < 0.02 ? OBS.SHARD : 0, h: 3 };
    }
    case 'zombie': {
      // A dead town: small houses on a loose grid, abandoned cars, fences.
      const gx = Math.floor((x + 1000) / 11), gy = Math.floor((y + 1000) / 11);
      const lx = (x + 1000) % 11, ly = (y + 1000) % 11;
      const house = hash2(gx, gy, seed + 51);
      if (house < 0.55 && lx >= 3 && lx < 9 && ly >= 3 && ly < 8) {
        const shell = lx === 3 || lx === 8 || ly === 3 || ly === 7;
        return { t: TER.CONCRETE, o: shell && hs > 0.15 ? OBS.RUIN : 0, h: 3 + Math.floor(house * 5) };
      }
      if (lx === 0 || ly === 0) return { t: TER.ROAD, o: hs < 0.03 ? OBS.WRECK : 0, h: 2 };
      return { t: p2.noise2(x / 9, y / 9) > 0 ? TER.MUD : TER.GRASS, o: hs < 0.01 ? OBS.WRECK : 0, h: 2 };
    }
    case 'necro': {
      // Grave rows, crypts and obelisks on ash.
      const ly = (y + 1000) % 5, lx = (x + 1000) % 3;
      const gx = Math.floor((x + 1000) / 24), gy = Math.floor((y + 1000) / 24);
      const crypt = hash2(gx, gy, seed + 61);
      const cx = (x + 1000) % 24, cy = (y + 1000) % 24;
      if (crypt < 0.25 && cx >= 8 && cx < 16 && cy >= 8 && cy < 16 && (cx === 8 || cx === 15 || cy === 8 || cy === 15) && !(cy === 15 && cx === 11)) return { t: TER.BASALT, o: OBS.WALL, h: 6 };
      if (crypt > 0.85 && cx === 12 && cy === 12) return { t: TER.BASALT, o: OBS.PILLAR, h: 18 };
      if (ly === 0 && lx === 1 && hs > 0.25) return { t: TER.ASH, o: OBS.ROCK, h: 1 };
      return { t: hs < 0.3 ? TER.BASALT : TER.ASH, o: hs > 0.994 ? OBS.SHARD : 0, h: 4 };
    }
    case 'monster':
      return { t: p2.noise2(x / 12, y / 12) > 0.15 ? TER.ACID : TER.MUD, o: hs < 0.05 ? OBS.FUNGUS : 0, h: 3 + Math.floor(hs * 60) % 6 };
    default:
      return { t: TER.METAL, o: 0, h: 0 };
  }
}

export function generateWorld(seed: number): OpenWorld {
  return new OpenWorld(seed);
}

/** A world that isn't streamed (the Dead Zone arena): fixed lists, no regions. */
export function staticWorld(seed: number, map: GameMap, spawn: { x: number; y: number }): WorldGen {
  return {
    seed, map, spawn, nodes: [], sites: [], runes: [], outposts: [], gate: { x: -999, y: -999 }, regions: [], mothership: null,
    focus: () => {},
    zoneOf: (x, y) => map.zoneAt(x, y),
    regionAt: () => null,
    roadsNear: () => [],
  };
}
