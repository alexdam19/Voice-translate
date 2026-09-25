import { CENTER, MAP_SIZE } from './constants';
import { GameMap, OBS, TER, ZONE } from './map';
import { Perlin } from './noise';
import { RNG, hash2 } from './rng';
import { clamp } from './types';

/* ---------------------------------------------------------------------- */
/* World features                                                          */
/* ---------------------------------------------------------------------- */

export type NodeType = 'scrap' | 'iron' | 'copper' | 'titanium' | 'uranium' | 'cryo' | 'sulfur' | 'xenite' | 'biomass';

export const NODE_INFO: Record<NodeType, { name: string; item: string; tier: number; amount: [number, number]; color: string }> = {
  scrap: { name: 'Scrap Heap', item: 'scrap', tier: 1, amount: [30, 60], color: '#9a7a5a' },
  iron: { name: 'Iron Deposit', item: 'iron_ore', tier: 1, amount: [20, 40], color: '#c86848' },
  copper: { name: 'Copper Deposit', item: 'copper_ore', tier: 1, amount: [20, 40], color: '#e28c40' },
  biomass: { name: 'Fungus Patch', item: 'biomass', tier: 1, amount: [15, 30], color: '#9a5ac8' },
  titanium: { name: 'Titanium Vein', item: 'titanium_ore', tier: 2, amount: [18, 34], color: '#c4d6ec' },
  uranium: { name: 'Uranium Seam', item: 'uranium_ore', tier: 2, amount: [14, 28], color: '#a0ff50' },
  cryo: { name: 'Cryo Cluster', item: 'cryo_crystal', tier: 2, amount: [14, 28], color: '#78faff' },
  sulfur: { name: 'Sulfur Vent', item: 'sulfur', tier: 2, amount: [18, 34], color: '#ffe246' },
  xenite: { name: 'Xenite Spire', item: 'xenite', tier: 3, amount: [10, 20], color: '#ff3cdc' },
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
  azure: { name: 'Azure Rune', color: '#3fa9ff', buff: 'Officer abilities recharge 35% faster' },
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

export interface Prop {
  x: number;
  y: number;
  kind: PropKind;
  s: number;
  rot: number;
  /** Tint variant 0..3. */
  v: number;
}

export interface WorldGen {
  seed: number;
  map: GameMap;
  spawn: { x: number; y: number };
  nodes: ResourceNode[];
  sites: Site[];
  runes: RuneAltar[];
  outposts: OutpostSpot[];
  gate: { x: number; y: number };
  props: Prop[];
}

/** Danger rating of a spot: 1 at camp, rising with distance. Tiers I-V. */
export function threatAt(x: number, y: number): number {
  const r = Math.hypot(x - CENTER, y - CENTER);
  return clamp(1 + Math.max(0, r - 18) / 48, 1, 8);
}

export function threatTier(t: number): number {
  return t < 2 ? 1 : t < 3.3 ? 2 : t < 4.6 ? 3 : t < 6 ? 4 : 5;
}

export const TIER_NAMES = ['', 'I', 'II', 'III', 'IV', 'V'];

/* ---------------------------------------------------------------------- */
/* Generation                                                              */
/* ---------------------------------------------------------------------- */

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

export function generateWorld(seed: number): WorldGen {
  const size = MAP_SIZE;
  const map = new GameMap(size);
  const p = new Perlin(seed);
  const p2 = new Perlin(seed ^ 0x5bd1e995);
  const rng = new RNG(seed ^ 0x2545f491);
  const C = CENTER;

  const setObs = (x: number, y: number, o: number, h: number): void => {
    if (!map.inside(x, y)) return;
    const i = y * size + x;
    map.obs[i] = o;
    map.oh[i] = h;
  };

  /* Zones and base terrain */
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = x - C, dy = y - C;
      const r = Math.hypot(dx, dy) + p.fbm2(x / 70, y / 70, 3) * 26;
      let z: number;
      if (r > 296) z = ZONE.EDGE;
      else if (r > 244) z = ZONE.ACID;
      else if (r < 92) z = ZONE.RUSTBELT;
      else {
        let a = Math.atan2(dy, dx) + p.fbm2(x / 110 + 50, y / 110 - 30, 2) * 0.45;
        if (a > Math.PI) a -= Math.PI * 2;
        if (a < -Math.PI) a += Math.PI * 2;
        const q = Math.PI / 4;
        if (a >= -3 * q && a < -q) z = ZONE.CRYO;
        else if (a >= -q && a < q) z = ZONE.DUNES;
        else if (a >= q && a < 3 * q) z = ZONE.GLASS;
        else z = ZONE.MAGMA;
      }
      map.zone[i] = z;
      const n1 = p.fbm2(x / 24, y / 24, 3);
      const n2 = p2.fbm2(x / 13, y / 13, 3);
      const hs = hash2(x, y, seed);
      let t: number = TER.DIRT;
      let o = 0, h = 0;
      switch (z) {
        case ZONE.RUSTBELT: {
          t = n1 > 0.15 ? TER.DIRT : n1 < -0.22 ? TER.GRASS : TER.RUST;
          const city = p2.fbm2(x / 44 + 7, y / 44 - 3, 2);
          if (city > 0.2) {
            t = TER.CONCRETE;
            const bx = Math.floor(x / 10), by = Math.floor(y / 10);
            const onX = x % 10 === 0, onY = y % 10 === 0;
            if ((onX && hash2(bx, by * 3 + 1, seed) > 0.45) || (onY && hash2(bx * 3 + 2, by, seed) > 0.45)) {
              o = OBS.RUIN;
              h = 3 + Math.floor(hash2(bx, by, seed + 9) * 4);
            }
          } else if (n2 > 0.36) {
            o = OBS.ROCK;
            h = 2 + Math.floor((n2 - 0.36) * 20);
          }
          break;
        }
        case ZONE.DUNES:
          t = p.fbm2(x / 30 + 11, y / 30, 3) > 0.02 ? TER.DUNE : TER.SAND;
          if (n2 > 0.35) {
            o = OBS.SANDSTONE;
            h = 2 + Math.floor((n2 - 0.35) * 26);
          }
          break;
        case ZONE.CRYO:
          t = p.fbm2(x / 26, y / 26 + 40, 3) > 0 ? TER.ICE : TER.SNOW;
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
      map.ter[i] = t;
      map.obs[i] = o;
      map.oh[i] = h;
    }
  }

  /* Carving helpers */
  const disc = (cx: number, cy: number, r: number, fn: (x: number, y: number, d: number) => void): void => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (!map.inside(x, y)) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) fn(x, y, d);
      }
    }
  };
  const clearDisc = (cx: number, cy: number, r: number, solidGround?: number): void => {
    disc(cx, cy, r, (x, y) => {
      const i = y * size + x;
      if (map.zone[i] === ZONE.EDGE) return;
      map.obs[i] = 0;
      map.oh[i] = 0;
      if (solidGround !== undefined) map.ter[i] = solidGround;
    });
  };
  const groundFor = (z: number): number =>
    z === ZONE.MAGMA ? TER.ASH : z === ZONE.ACID ? TER.MUD : z === ZONE.CRYO ? TER.SNOW : z === ZONE.DUNES ? TER.SAND : z === ZONE.GLASS ? TER.CRATER : TER.DIRT;

  /* Roads: four spokes and a ring. Bridges cross lava. */
  const roadAt = (cx: number, cy: number): void => {
    disc(cx, cy, 5.2, (x, y, d) => {
      const i = y * size + x;
      if (map.zone[i] === ZONE.EDGE || map.zone[i] === ZONE.ACID) return;
      map.obs[i] = 0;
      map.oh[i] = 0;
      if (d <= 2.6) map.ter[i] = TER.ROAD;
      else if (map.ter[i] === TER.LAVA) map.ter[i] = TER.BASALT;
    });
  };
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const fx = Math.cos(a), fy = Math.sin(a);
    for (let t = 0; t < 240; t += 0.7) {
      const off = p.noise2(t / 40, k * 10.3) * 22 * Math.min(1, t / 40);
      roadAt(C + fx * t - fy * off, C + fy * t + fx * off);
    }
  }
  for (let a = 0; a < Math.PI * 2; a += 0.004) {
    const r = 104 + p.noise2(a * 3, 77) * 12;
    roadAt(C + Math.cos(a) * r, C + Math.sin(a) * r);
  }

  /* Camp at the centre */
  const spawn = { x: C + 0.5, y: C + 0.5 };
  clearDisc(C, C, 18);
  disc(C, C, 11, (x, y) => {
    map.ter[y * size + x] = TER.CAMP;
  });
  disc(C, C, 3.2, (x, y) => {
    map.ter[y * size + x] = TER.CONCRETE;
  });

  /* Spot placement */
  const taken: { x: number; y: number; r: number }[] = [{ x: C, y: C, r: 24 }];
  const place = (zone: number, count: number, minDist: number, clear: number): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let tries = 0; tries < count * 400 && out.length < count; tries++) {
      const x = 20 + rng.next() * (size - 40), y = 20 + rng.next() * (size - 40);
      const tx = Math.floor(x), ty = Math.floor(y);
      if (map.zone[ty * size + tx] !== zone) continue;
      // Keep the whole clearing inside the zone.
      let ok = true;
      for (let a = 0; a < 8 && ok; a++) {
        const sx = Math.floor(x + Math.cos(a * 0.785) * clear), sy = Math.floor(y + Math.sin(a * 0.785) * clear);
        if (!map.inside(sx, sy) || map.zone[sy * size + sx] !== zone) ok = false;
      }
      if (!ok) continue;
      if (taken.some((s) => Math.hypot(s.x - x, s.y - y) < Math.max(minDist, s.r + clear))) continue;
      taken.push({ x, y, r: clear });
      out.push({ x, y });
    }
    return out;
  };

  /* Dead Zone gate, north-east edge of the Rustbelt */
  const ga = -Math.PI / 4;
  const gate = { x: C + Math.cos(ga) * 70, y: C + Math.sin(ga) * 70 };
  clearDisc(gate.x, gate.y, 11);
  disc(gate.x, gate.y, 8, (x, y) => {
    map.ter[y * size + x] = TER.METAL;
  });
  for (const [ox, oy] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) {
    for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) setObs(Math.floor(gate.x) + ox + xx, Math.floor(gate.y) + oy + yy, OBS.PILLAR, 9);
  }
  taken.push({ x: gate.x, y: gate.y, r: 12 });
  // A road from the ring to the gate.
  for (let t = 0; t <= 1; t += 0.01) {
    const a2 = ga;
    const r = 70 + t * 34;
    roadAt(C + Math.cos(a2) * r, C + Math.sin(a2) * r);
  }

  const ZONE_LIST = [ZONE.RUSTBELT, ZONE.DUNES, ZONE.CRYO, ZONE.GLASS, ZONE.MAGMA, ZONE.ACID];

  /* Outposts (enemy fortresses) */
  const outposts: OutpostSpot[] = [];
  let oid = 1;
  for (const z of ZONE_LIST) {
    const n = z === ZONE.RUSTBELT ? 2 : 3;
    for (const s of place(z, n, 60, 13)) {
      clearDisc(s.x, s.y, 13, groundFor(z));
      disc(s.x, s.y, 9, (x, y) => {
        map.ter[y * size + x] = TER.METAL;
      });
      // Perimeter wall with three gates.
      const rot = rng.next() * Math.PI * 2;
      for (let a = 0; a < Math.PI * 2; a += 0.03) {
        const rel = ((a - rot) % ((Math.PI * 2) / 3) + (Math.PI * 2) / 3) % ((Math.PI * 2) / 3);
        if (rel < 0.75) continue;
        setObs(Math.floor(s.x + Math.cos(a) * 11.5), Math.floor(s.y + Math.sin(a) * 11.5), OBS.WALL, 4);
      }
      outposts.push({ id: oid++, x: s.x, y: s.y, zone: z, threat: threatAt(s.x, s.y), rot });
    }
  }

  /* Loot areas */
  const sites: Site[] = [];
  let sid = 1;
  for (const z of ZONE_LIST) {
    const n = z === ZONE.ACID ? 8 : 6;
    const kind = SITE_KIND[z];
    const names = [...SITE_INFO[kind].names];
    for (const s of place(z, n, 42, 10)) {
      clearDisc(s.x, s.y, 10, groundFor(z));
      disc(s.x, s.y, 7, (x, y) => {
        map.ter[y * size + x] = kind === 'hive' ? TER.MUD : kind === 'foundry' ? TER.METAL : TER.CONCRETE;
      });
      const rot = rng.next() * Math.PI;
      const wallType = kind === 'hive' ? OBS.FUNGUS : kind === 'convoy' || kind === 'crash' ? OBS.WRECK : OBS.RUIN;
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        const rel = (((a - rot) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
        if (rel < 1.05) continue;
        if (hash2(Math.floor(a * 20), sid, seed) < 0.25) continue;
        setObs(Math.floor(s.x + Math.cos(a) * 8.6), Math.floor(s.y + Math.sin(a) * 8.6), wallType, 2 + Math.floor(hash2(Math.floor(a * 20), sid + 7, seed) * 3));
      }
      const name = names.length ? names.splice(Math.floor(rng.next() * names.length), 1)[0] : SITE_INFO[kind].title;
      sites.push({ id: sid++, x: s.x, y: s.y, kind, zone: z, threat: threatAt(s.x, s.y), name, readyAt: 0 });
    }
  }

  /* Rune altars */
  const runes: RuneAltar[] = [];
  const RUNES: RuneKind[] = ['crimson', 'azure', 'verdant', 'gilded'];
  let rid = 1;
  for (const z of ZONE_LIST) {
    const n = z === ZONE.ACID ? 4 : 3;
    for (const s of place(z, n, 34, 9)) {
      clearDisc(s.x, s.y, 9, groundFor(z));
      disc(s.x, s.y, 4, (x, y) => {
        map.ter[y * size + x] = TER.CONCRETE;
      });
      runes.push({ id: rid++, x: s.x, y: s.y, rune: RUNES[(rid + Math.floor(rng.next() * 4)) % 4], zone: z, threat: threatAt(s.x, s.y), readyAt: 0 });
    }
  }

  /* Resource nodes */
  const nodes: ResourceNode[] = [];
  let nid = 1;
  const nodeFree = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (map.blocked(Math.floor(x) + dx, Math.floor(y) + dy, 'hover')) return false;
    return true;
  };
  const addNode = (x: number, y: number, type: NodeType): void => {
    const info = NODE_INFO[type];
    const amount = info.amount[0] + Math.floor(rng.next() * (info.amount[1] - info.amount[0] + 1));
    nodes.push({ id: nid++, x, y, type, amount, max: amount, respawnAt: 0 });
  };
  // A few easy scrap heaps and ore near camp for the first minutes.
  const starter: NodeType[] = ['scrap', 'scrap', 'iron', 'copper', 'scrap', 'iron'];
  starter.forEach((type, k) => {
    const a = k * 1.05 + 0.4;
    const r = 15.5 + (k % 2) * 2;
    const x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
    clearDisc(x, y, 2.5);
    addNode(x, y, type);
  });
  const area: Record<number, number> = {};
  for (let i = 0; i < map.zone.length; i++) area[map.zone[i]] = (area[map.zone[i]] ?? 0) + 1;
  for (const z of ZONE_LIST) {
    const count = Math.floor((area[z] ?? 0) / 230);
    const weights = NODE_WEIGHTS[z];
    const total = weights.reduce((s, w) => s + w[1], 0);
    let placed = 0;
    for (let tries = 0; tries < count * 30 && placed < count; tries++) {
      const x = 4 + rng.next() * (size - 8), y = 4 + rng.next() * (size - 8);
      if (map.zone[Math.floor(y) * size + Math.floor(x)] !== z) continue;
      if (!nodeFree(x, y)) continue;
      if (Math.hypot(x - C, y - C) < 30) continue;
      if (taken.some((s) => Math.hypot(s.x - x, s.y - y) < s.r + 2)) continue;
      if (nodes.some((nd) => Math.abs(nd.x - x) < 5 && Math.abs(nd.y - y) < 5)) continue;
      let pick = rng.next() * total;
      let type: NodeType = weights[0][0];
      for (const [t, w] of weights) {
        pick -= w;
        if (pick <= 0) {
          type = t;
          break;
        }
      }
      addNode(x, y, type);
      placed++;
    }
  }

  /* Decorative props */
  const props: Prop[] = [];
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      const i = y * size + x;
      const z = map.zone[i];
      if (z === ZONE.EDGE || map.obs[i] || TERRAIN_LIQUID(map.ter[i])) continue;
      const hs = hash2(x, y, seed + 101);
      if (hs > 1 / 75) continue;
      if (map.ter[i] === TER.ROAD || map.ter[i] === TER.CAMP) continue;
      const list = PROPS[z];
      const kind = list[Math.floor(hash2(x, y, seed + 102) * list.length)];
      props.push({ x: x + 0.2 + hash2(x, y, seed + 103) * 0.6, y: y + 0.2 + hash2(x, y, seed + 104) * 0.6, kind, s: 0.7 + hash2(x, y, seed + 105) * 0.6, rot: hash2(x, y, seed + 106) * Math.PI * 2, v: Math.floor(hash2(x, y, seed + 107) * 4) });
    }
  }
  // Camp dressing.
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.3;
    props.push({ x: C + Math.cos(a) * 13.5, y: C + Math.sin(a) * 13.5, kind: k % 3 === 0 ? 'antenna' : k % 3 === 1 ? 'tent' : 'crate', s: 1.1, rot: a, v: k % 4 });
  }

  return { seed, map, spawn, nodes, sites, runes, outposts, gate, props };
}

function TERRAIN_LIQUID(t: number): boolean {
  return t === TER.LAVA || t === TER.ACID;
}
