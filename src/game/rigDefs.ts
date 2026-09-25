import type { Cost } from '../shared/inventory';
import type { Terrain } from '../shared/tiles';
import type { Hazard } from '../shared/types';

/* ---------------------------------------------------------------------- */
/* Rig structure tiles                                                     */
/* ---------------------------------------------------------------------- */

export const RT = { EMPTY: 0, HULL: 1, ARMOR: 2, PLATFORM: 3, WINDOW: 4, DOOR: 5, LADDER: 6, LAMP: 7, CHASSIS: 8 } as const;

export interface RigTileDef {
  id: number;
  key: string;
  name: string;
  /** Collision: 0 empty, 1 solid, 2 platform, 3 ladder. Doors are special-cased. */
  cell: number;
  hp: number;
  mass: number;
  cost: Cost;
  light: number;
  desc: string;
}

export const RIG_TILES: RigTileDef[] = [
  { id: 0, key: 'empty', name: 'Empty', cell: 0, hp: 0, mass: 0, cost: {}, light: 0, desc: '' },
  { id: 1, key: 'hull', name: 'Hull Plating', cell: 1, hp: 70, mass: 1, cost: { scrap: 1 }, light: 0, desc: 'Basic structural plating.' },
  { id: 2, key: 'armor', name: 'Armor Plating', cell: 1, hp: 200, mass: 2, cost: { titanium_alloy: 1 }, light: 0, desc: 'Heavy plating. Soaks cannon fire.' },
  { id: 3, key: 'platform', name: 'Deck Grating', cell: 2, hp: 30, mass: 0.4, cost: { scrap: 1 }, light: 0, desc: 'One-way floor. Jump through, S to drop.' },
  { id: 4, key: 'window', name: 'Viewport', cell: 1, hp: 40, mass: 0.6, cost: { glass: 1 }, light: 0, desc: 'Armored glass.' },
  { id: 5, key: 'door', name: 'Blast Door', cell: 1, hp: 90, mass: 1, cost: { iron_plate: 1 }, light: 0, desc: 'Opens for your crew, stops boarders.' },
  { id: 6, key: 'ladder', name: 'Ladder', cell: 3, hp: 20, mass: 0.3, cost: { scrap: 1 }, light: 0, desc: 'Climb with W / S.' },
  { id: 7, key: 'lamp', name: 'Cabin Light', cell: 0, hp: 10, mass: 0.1, cost: { copper_wire: 1 }, light: 0.9, desc: 'Keeps the dark out.' },
  { id: 8, key: 'chassis', name: 'Chassis Frame', cell: 1, hp: 9999, mass: 2, cost: {}, light: 0, desc: 'The spine of your rig.' },
];

export const BG = { NONE: 0, PANEL: 1 } as const;

/* ---------------------------------------------------------------------- */
/* Facility modules                                                        */
/* ---------------------------------------------------------------------- */

export type ModuleCategory = 'core' | 'crew' | 'industry' | 'defense' | 'environment';

export interface TurretSpec {
  range: number; // tiles
  dmg: number;
  rate: number;
  speed: number;
  spread: number;
  pellets: number;
  kind: 'bullet' | 'flak' | 'laser' | 'missile';
  explosive: number;
  antiAir: boolean;
}

export interface ModuleDef {
  key: string;
  name: string;
  w: number;
  h: number;
  cost: Cost;
  /** Positive = produces power, negative = consumes. */
  power: number;
  hp: number;
  category: ModuleCategory;
  desc: string;
  accent: string;
  unique?: boolean;
  station?: string;
  turret?: TurretSpec;
  protects?: Hazard[];
  thrust?: number;
  bunks?: number;
  cargo?: number;
  shield?: number;
  drill?: boolean;
  medbay?: boolean;
  quarters?: boolean;
  repair?: number;
  produces?: { item: string; every: number };
  radar?: number;
  light: number;
}

const M: Record<string, ModuleDef> = {};
function mod(d: Omit<ModuleDef, 'hp' | 'light'> & { hp?: number; light?: number }): void {
  M[d.key] = { hp: d.w * d.h * 30, light: 0.5, ...d };
}

mod({ key: 'cockpit', name: 'Command Bridge', w: 4, h: 3, cost: { iron_plate: 10, circuit: 4 }, power: 0, hp: 500, category: 'core', unique: true, accent: '#00e5ff', desc: 'Drive the rig from here. If it is destroyed the rig is immobilized.' });
mod({ key: 'reactor', name: 'Scrap Reactor', w: 3, h: 3, cost: { iron_plate: 8, copper_wire: 6, scrap: 20 }, power: 16, category: 'core', accent: '#39ff14', desc: '+16 power. Burns salvage in a dirty little fusion loop.' });
mod({ key: 'fission', name: 'Fission Core', w: 3, h: 4, cost: { uranium_rod: 4, titanium_alloy: 8, circuit: 6 }, power: 40, category: 'core', accent: '#b2ff59', desc: '+40 power. Hot, heavy, worth it.' });
mod({ key: 'engine', name: 'Diesel-Arc Engine', w: 4, h: 3, cost: { iron_plate: 10, copper_wire: 4, scrap: 10 }, power: -3, thrust: 1, category: 'core', accent: '#ff9100', desc: '+1 thrust. More engines move heavier rigs faster.' });
mod({ key: 'ion_engine', name: 'Ion Drive', w: 4, h: 3, cost: { titanium_alloy: 8, cryo_core: 2, circuit: 4 }, power: -8, thrust: 3, category: 'core', accent: '#40c4ff', desc: '+3 thrust. Quiet, fast, power hungry.' });

mod({ key: 'barracks', name: 'Barracks', w: 6, h: 3, cost: { iron_plate: 6, scrap: 10 }, power: -1, bunks: 4, category: 'crew', accent: '#4fc3f7', desc: '+4 crew bunks. Crew man turrets and repel boarders.' });
mod({ key: 'quarters', name: 'Living Quarters', w: 5, h: 3, cost: { iron_plate: 6, biomass: 4, scrap: 10 }, power: -1, quarters: true, category: 'crew', accent: '#ffcc66', desc: 'Respawn point. Slowly heals you while inside. Keeps crew morale up.' });
mod({ key: 'medbay', name: 'Medbay', w: 3, h: 3, cost: { iron_plate: 6, circuit: 3, biomass: 6 }, power: -2, medbay: true, category: 'crew', accent: '#76ff03', desc: 'Rapidly heals you and your crew nearby.' });
mod({ key: 'hydroponics', name: 'Hydroponics Bay', w: 4, h: 3, cost: { iron_plate: 6, glass: 6, biomass: 8 }, power: -2, produces: { item: 'rations', every: 40 }, category: 'crew', accent: '#64dd17', desc: 'Grows rations for you and your crew.' });

mod({ key: 'cargo', name: 'Cargo Bay', w: 4, h: 3, cost: { iron_plate: 8, scrap: 10 }, power: 0, cargo: 24, category: 'industry', accent: '#b0bec5', desc: '+24 cargo slots.' });
mod({ key: 'fabricator', name: 'Fabricator', w: 3, h: 3, cost: { iron_plate: 8, copper_wire: 6, circuit: 2 }, power: -2, station: 'fabricator', category: 'industry', accent: '#00e5ff', desc: 'Crafts components, ammo, tools and gear.' });
mod({ key: 'refinery', name: 'Refinery', w: 4, h: 4, cost: { iron_plate: 10, rock: 20, copper_wire: 4 }, power: -3, station: 'refinery', category: 'industry', accent: '#ff5722', desc: 'Smelts ore into plates, wire, alloys and rods.' });
mod({ key: 'armory', name: 'Armory', w: 4, h: 3, cost: { iron_plate: 12, circuit: 2 }, power: -1, station: 'armory', category: 'industry', accent: '#ff1744', desc: 'Crafts weapons, explosives and suits.' });
mod({ key: 'garage', name: 'Drive Workshop', w: 6, h: 4, cost: { iron_plate: 16, circuit: 4, copper_wire: 8 }, power: -2, station: 'garage', category: 'industry', accent: '#ffd600', desc: 'Builds drive trains (tracks, chains, treads, hover) and chassis kits.' });
mod({ key: 'repair_bay', name: 'Repair Drones', w: 3, h: 3, cost: { iron_plate: 10, circuit: 4 }, power: -2, repair: 6, category: 'industry', accent: '#ffab40', desc: 'Automatically repairs damaged plating using scrap from cargo.' });
mod({ key: 'drill', name: 'Drill Ram', w: 3, h: 5, cost: { titanium_alloy: 10, iron_plate: 10, circuit: 3 }, power: -4, drill: true, category: 'industry', accent: '#cfd8dc', desc: 'Mount on the front or rear edge. Bores through terrain while driving; spoils go to cargo.' });

mod({ key: 'autocannon', name: 'Autocannon', w: 2, h: 2, cost: { iron_plate: 8, circuit: 2 }, power: -1, category: 'defense', accent: '#ff9100',
  turret: { range: 34, dmg: 14, rate: 4, speed: 950, spread: 0.05, pellets: 1, kind: 'bullet', explosive: 0, antiAir: false }, desc: 'Crewed rapid-fire cannon.' });
mod({ key: 'flak', name: 'Flak Battery', w: 3, h: 2, cost: { iron_plate: 10, circuit: 3, copper_wire: 4 }, power: -2, category: 'defense', accent: '#ffd740',
  turret: { range: 30, dmg: 7, rate: 1.6, speed: 800, spread: 0.18, pellets: 5, kind: 'flak', explosive: 22, antiAir: true }, desc: 'Bursting shells. Shreds drones.' });
mod({ key: 'laser_turret', name: 'Laser Turret', w: 2, h: 2, cost: { titanium_alloy: 6, cryo_core: 2, circuit: 4 }, power: -5, category: 'defense', accent: '#ff4081',
  turret: { range: 42, dmg: 32, rate: 1.4, speed: 2600, spread: 0.01, pellets: 1, kind: 'laser', explosive: 0, antiAir: false }, desc: 'Long range beam. No ammo.' });
mod({ key: 'missile_pod', name: 'Missile Pod', w: 3, h: 2, cost: { titanium_alloy: 8, circuit: 4, explosive: 4 }, power: -3, category: 'defense', accent: '#ff3d00',
  turret: { range: 52, dmg: 60, rate: 0.45, speed: 480, spread: 0.3, pellets: 1, kind: 'missile', explosive: 40, antiAir: false }, desc: 'Homing missiles. Wrecks rigs.' });
mod({ key: 'shield', name: 'Shield Generator', w: 3, h: 3, cost: { titanium_alloy: 10, uranium_rod: 2, circuit: 6 }, power: -6, shield: 220, category: 'defense', accent: '#7c4dff', desc: 'Projects a bubble that absorbs 220 damage and recharges.' });
mod({ key: 'radar', name: 'Radar Mast', w: 2, h: 4, cost: { iron_plate: 6, circuit: 4, copper_wire: 6 }, power: -2, radar: 90, category: 'defense', accent: '#18ffff', desc: 'Reveals the map and hostiles in a wide radius.' });

mod({ key: 'rad_baffles', name: 'Rad Baffles', w: 3, h: 2, cost: { titanium_alloy: 6, iron_plate: 10, copper_wire: 6 }, power: -3, protects: ['rad'], category: 'environment', accent: '#c6ff00', desc: 'Shields the interior (and hull) from radiation.' });
mod({ key: 'thermal', name: 'Thermal Regulator', w: 3, h: 3, cost: { titanium_alloy: 8, copper_wire: 10, circuit: 4 }, power: -3, protects: ['heat', 'cold'], category: 'environment', accent: '#ff6e40', desc: 'Keeps the rig livable in extreme heat and cold.' });
mod({ key: 'sealant', name: 'Hull Sealant Pump', w: 3, h: 2, cost: { titanium_alloy: 6, sulfur: 12, circuit: 3 }, power: -3, protects: ['toxic'], category: 'environment', accent: '#00e676', desc: 'Seals the hull against toxic atmosphere and acid.' });

export const MODULES: Record<string, ModuleDef> = M;
export const MODULE_LIST: ModuleDef[] = Object.values(M);

export const CATEGORY_NAMES: Record<ModuleCategory, string> = {
  core: 'Core Systems', crew: 'Crew & Living', industry: 'Industry', defense: 'Defense', environment: 'Environmental',
};

/* ---------------------------------------------------------------------- */
/* Drive trains                                                            */
/* ---------------------------------------------------------------------- */

export interface Traction {
  speed: number;
  climb: number;
  accel: number;
}

export interface DriveDef {
  key: string;
  name: string;
  item: string;
  traction: Record<Terrain, Traction>;
  hover: boolean;
  heatproof: boolean;
  power: number;
}

const tr = (speed: number, climb: number, accel = 1): Traction => ({ speed, climb, accel });
const BOG = tr(0.1, 1, 0.3);

export const DRIVES: Record<string, DriveDef> = {
  wheels: {
    key: 'wheels', name: 'Standard Wheels', item: 'drive_wheels', hover: false, heatproof: false, power: 0,
    traction: { normal: tr(1, 2), sand: BOG, ice: tr(0.35, 0, 0.15), ash: tr(0.45, 1, 0.6), mud: tr(0.3, 1, 0.5), liquid: tr(0.08, 1, 0.3) },
  },
  tracks: {
    key: 'tracks', name: 'Dune Tracks', item: 'drive_tracks', hover: false, heatproof: false, power: 0,
    traction: { normal: tr(0.9, 3), sand: tr(0.95, 3), ice: tr(0.35, 0, 0.15), ash: tr(0.5, 1, 0.6), mud: tr(0.5, 2, 0.6), liquid: tr(0.08, 1, 0.3) },
  },
  chains: {
    key: 'chains', name: 'Spiked Chains', item: 'drive_chains', hover: false, heatproof: false, power: 0,
    traction: { normal: tr(0.95, 3), sand: BOG, ice: tr(1, 3), ash: tr(0.5, 1, 0.6), mud: tr(0.4, 1, 0.5), liquid: tr(0.08, 1, 0.3) },
  },
  magma: {
    key: 'magma', name: 'Magma Treads', item: 'drive_magma', hover: false, heatproof: true, power: 0,
    traction: { normal: tr(0.9, 3), sand: tr(0.85, 3), ice: tr(0.8, 3), ash: tr(1, 3), mud: tr(0.55, 2, 0.6), liquid: tr(0.12, 1, 0.3) },
  },
  hover: {
    key: 'hover', name: 'Hover Skirts', item: 'drive_hover', hover: true, heatproof: true, power: -6,
    traction: { normal: tr(1, 2, 0.7), sand: tr(1, 2, 0.7), ice: tr(1, 2, 0.7), ash: tr(0.95, 2, 0.7), mud: tr(1, 2, 0.7), liquid: tr(0.95, 2, 0.7) },
  },
};

export const TERRAIN_NAMES: Record<Terrain, string> = {
  normal: 'Hardpan', sand: 'Sand', ice: 'Ice', ash: 'Ash Crust', mud: 'Mud', liquid: 'Liquid',
};

/* ---------------------------------------------------------------------- */
/* Chassis tiers                                                           */
/* ---------------------------------------------------------------------- */

export interface ChassisDef {
  tier: number;
  name: string;
  w: number;
  h: number;
  wheels: number;
  cost: Cost;
  desc: string;
}

export const CHASSIS: ChassisDef[] = [
  { tier: 0, name: 'Scav Crawler', w: 40, h: 14, wheels: 6, cost: {}, desc: 'A two-deck crawler cobbled together from a mining hauler.' },
  { tier: 1, name: 'Road Hauler', w: 56, h: 18, wheels: 8, cost: { iron_plate: 40, circuit: 8, scrap: 80 }, desc: 'Longer frame, a third deck, room for a real crew.' },
  { tier: 2, name: 'Behemoth', w: 76, h: 22, wheels: 10, cost: { titanium_alloy: 40, circuit: 16, iron_plate: 60 }, desc: 'A rolling fortress. Needs serious engines.' },
  { tier: 3, name: 'Leviathan', w: 100, h: 28, wheels: 14, cost: { xeno_alloy: 20, uranium_rod: 10, titanium_alloy: 60 }, desc: 'A mobile city-state.' },
];

export const WHEEL_R = 18;
/** Distance from the rig grid's bottom edge to the ground when resting. */
export const RIG_CLEARANCE = 26;
