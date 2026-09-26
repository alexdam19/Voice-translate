import type { Cost } from '../shared/inventory';
import type { Hazard } from '../shared/types';
import type { WeaponSize } from '../shared/weapons';

/**
 * Buildings: everything you can put inside the fortress. The fortress is a whole facility, run like a
 * village: each building takes a w x h block of deck cells (one cell = one world unit on your fortress),
 * is built and upgraded over time by builders, and is capped by the Command Center's level.
 */

export type ModuleCat = 'command' | 'weapon' | 'defense' | 'army' | 'crew' | 'resource' | 'power' | 'special' | 'utility';

export const CATEGORIES: { key: ModuleCat; name: string; color: string }[] = [
  { key: 'weapon', name: 'Turrets', color: '#ff7043' },
  { key: 'defense', name: 'Defense', color: '#80d8ff' },
  { key: 'army', name: 'Army & Squads', color: '#ff5252' },
  { key: 'crew', name: 'Crew', color: '#a5d6a7' },
  { key: 'resource', name: 'Resources', color: '#bcaaa4' },
  { key: 'power', name: 'Power & Drive', color: '#ffd740' },
  { key: 'special', name: 'Workshops & Labs', color: '#ffd54f' },
  { key: 'utility', name: 'Hazard Gear', color: '#ce93d8' },
  { key: 'command', name: 'Command', color: '#4dd0e1' },
];

export interface ModuleDef {
  key: string;
  name: string;
  w: number;
  h: number;
  cat: ModuleCat;
  cost: Cost;
  desc: string;
  /** Visual height of the block (model units; the fortress model is drawn at 2x). */
  height: number;
  unique?: boolean;
  required?: boolean;
  /** Commander level needed to build it. */
  unlock?: number;
  /** How many you may own at each Command Center level (index 0 = CC 1). */
  limit?: number[];
  /** Highest level (default 5; the Command Center goes to 6). */
  maxLevel?: number;
  /** Squad this building trains. */
  squad?: string;
  power?: number;
  use?: number;
  thrust?: number;
  crew?: number;
  cargo?: number;
  hp?: number;
  armor?: number;
  shield?: number;
  shieldRegen?: number;
  vision?: number;
  drill?: number;
  harvest?: number;
  protects?: Hazard[];
  hardpoint?: WeaponSize;
  repair?: number;
  medbay?: boolean;
  vault?: number;
  garage?: boolean;
  food?: number;
  refinery?: boolean;
  workshop?: boolean;
  radar?: number;
  /** Card Lab: card power and energy regen per level. */
  cards?: number;
  forge?: boolean;
  /** Passive crew XP per second (Training Grounds). */
  training?: number;
  sanctum?: boolean;
  /** Fire-rate bonus for ballistic, artillery and missile weapons. */
  depot?: number;
  mess?: boolean;
}

const M = (d: ModuleDef): ModuleDef => d;

export const MODULES: Record<string, ModuleDef> = {};
const add = (d: ModuleDef): void => {
  MODULES[d.key] = d;
};

/* Command */
add(M({ key: 'bridge', name: 'Command Center', w: 4, h: 4, cat: 'command', cost: {}, height: 1.2, unique: true, required: true, maxLevel: 6, crew: 2, vision: 26, power: 4, thrust: 3, desc: 'The heart of your facility. Upgrade it to grow the whole fortress and raise every building\'s max level.' }));

/* Turrets */
add(M({ key: 'hp_light', name: 'Light Turret Mount', w: 1, h: 1, cat: 'weapon', cost: { scrap: 15, iron_plate: 3 }, height: 0.5, hardpoint: 'light', limit: [3, 4, 5, 6, 8, 10], desc: 'Mounts one light weapon. Each level adds +15% damage.' }));
add(M({ key: 'hp_medium', name: 'Medium Turret Mount', w: 2, h: 2, cat: 'weapon', unlock: 4, cost: { iron_plate: 12, circuit: 2 }, height: 0.6, hardpoint: 'medium', limit: [1, 2, 2, 3, 4, 5], desc: 'Mounts one medium weapon. Each level adds +15% damage.' }));
add(M({ key: 'hp_heavy', name: 'Heavy Turret Mount', w: 3, h: 3, cat: 'weapon', cost: { iron_plate: 30, circuit: 4 }, height: 0.7, hardpoint: 'heavy', limit: [1, 1, 2, 2, 3, 4], desc: 'Mounts one heavy weapon. Each level adds +15% damage.' }));

/* Defense */
add(M({ key: 'armor', name: 'Armor Plate', w: 1, h: 1, cat: 'defense', cost: { iron_plate: 4 }, height: 0.4, hp: 80, armor: 0.008, limit: [8, 12, 16, 22, 28, 36], desc: '+80 hull, +0.8% armor.' }));
add(M({ key: 'heavy_armor', name: 'Heavy Armor Plate', w: 1, h: 2, cat: 'defense', unlock: 10, cost: { titanium_alloy: 4, iron_plate: 4, explosive: 2 }, height: 0.5, hp: 220, armor: 0.02, limit: [0, 4, 6, 8, 12, 16], desc: '+220 hull, +2% armor.' }));
add(M({ key: 'repair_bay', name: 'Repair Bay', w: 2, h: 2, cat: 'defense', unlock: 3, cost: { iron_plate: 12, circuit: 3 }, height: 0.8, repair: 4, use: 1, limit: [1, 1, 2, 2, 3, 3], desc: 'Repairs 4 hull per second.' }));
add(M({ key: 'shield', name: 'Shield Generator', w: 2, h: 2, cat: 'defense', unlock: 13, cost: { titanium_alloy: 8, uranium_rod: 2, circuit: 6 }, height: 1, shield: 320, shieldRegen: 20, use: 4, limit: [0, 1, 2, 2, 3, 3], desc: '+320 shield that recharges out of combat.' }));
add(M({ key: 'radar', name: 'Radar Mast', w: 1, h: 1, cat: 'defense', unique: true, unlock: 5, cost: { copper_wire: 8, circuit: 2 }, height: 1.6, vision: 8, radar: 50, use: 1, desc: '+8 vision. Shows enemies within 50 units on the minimap.' }));

/* Army & squads */
add(M({ key: 'barracks', name: 'Barracks', w: 3, h: 4, cat: 'army', unlock: 3, cost: { scrap: 40, iron_plate: 10 }, height: 0.9, crew: 5, squad: 'marines', limit: [1, 1, 2, 2, 2, 3], desc: 'Bunks 5 crew and trains a Marine squad that fights beside you. Upgrade it to upgrade the squad.' }));
add(M({ key: 'garage', name: 'Garage', w: 4, h: 4, cat: 'army', unique: true, unlock: 5, garage: true, squad: 'buggies', cost: { iron_plate: 30, circuit: 6, scrap: 60 }, height: 1.1, desc: 'Builds Scout Buggies that scavenge ahead and bring loot back, and the Outrider mini tank. Upgrade it to upgrade the buggies.' }));
add(M({ key: 'drone_bay', name: 'Drone Bay', w: 3, h: 3, cat: 'army', unique: true, unlock: 9, squad: 'drones', cost: { circuit: 10, copper_wire: 16, iron_plate: 10 }, height: 0.7, use: 1, desc: 'Launches Guard Drones: fast laser flyers, great at guarding an area.' }));
add(M({ key: 'jet_hangar', name: 'Jet Hangar', w: 3, h: 4, cat: 'army', unique: true, unlock: 14, squad: 'fighters', cost: { titanium_alloy: 12, circuit: 10, iron_plate: 16 }, height: 0.7, use: 1, desc: 'Keeps a wing of mini fighter jets in the air that strafe and bomb anything near you.' }));
add(M({ key: 'mech_bay', name: 'Mech Bay', w: 4, h: 4, cat: 'army', unique: true, unlock: 18, squad: 'walker', cost: { titanium_alloy: 30, uranium_rod: 6, circuit: 16 }, height: 1.2, desc: 'Builds a Walker Mech: a slow giant with a cannon and missile racks.' }));

/* Crew */
add(M({ key: 'quarters', name: 'Living Quarters', w: 2, h: 2, cat: 'crew', cost: { scrap: 25, iron_plate: 4 }, height: 0.9, crew: 3, limit: [2, 3, 3, 4, 4, 5], desc: 'Bunks for 3 crew (+1 per level). Injured crew recover faster.' }));
add(M({ key: 'medbay', name: 'Medbay', w: 2, h: 2, cat: 'crew', unlock: 4, cost: { iron_plate: 8, circuit: 3, biomass: 6 }, height: 0.8, medbay: true, use: 1, limit: [1, 1, 1, 2, 2, 2], desc: 'Injured crew recover 3x faster.' }));
add(M({ key: 'hydroponics', name: 'Hydroponics', w: 2, h: 2, cat: 'crew', unlock: 3, cost: { scrap: 20, iron_plate: 4, biomass: 8 }, height: 0.6, food: 1, use: 1, limit: [1, 2, 2, 3, 3, 4], desc: 'Grows a ration every 25 seconds (faster per level).' }));
add(M({ key: 'mess_hall', name: 'Mess Hall', w: 3, h: 3, cat: 'crew', unique: true, unlock: 8, cost: { scrap: 30, iron_plate: 8, biomass: 6 }, height: 0.8, mess: true, food: 1, crew: 1, desc: 'Injured crew recover 50% faster. Cooks rations and bunks 1.' }));
add(M({ key: 'training_grounds', name: 'Training Grounds', w: 3, h: 4, cat: 'crew', unique: true, unlock: 10, cost: { iron_plate: 16, scrap: 40 }, height: 0.35, training: 1.2, desc: 'Every crew member aboard earns experience over time.' }));

/* Resources */
add(M({ key: 'cargo', name: 'Cargo Hold', w: 2, h: 2, cat: 'resource', cost: { scrap: 20, iron_plate: 4 }, height: 0.8, cargo: 12, limit: [2, 3, 4, 5, 6, 8], desc: '+12 cargo slots (more per level).' }));
add(M({ key: 'refinery', name: 'Refinery', w: 3, h: 3, cat: 'resource', unique: true, unlock: 2, refinery: true, use: 1, cost: { scrap: 30, iron_plate: 6, copper_wire: 4 }, height: 1, desc: 'Turns ore into plates, wire, alloys and cores. Tap it to refine.' }));
add(M({ key: 'drill_mk2', name: 'Drill Rig Mk2', w: 2, h: 2, cat: 'resource', unique: true, unlock: 7, cost: { iron_plate: 16, circuit: 4, explosive: 2 }, height: 0.8, drill: 2, harvest: 1.3, use: 1, desc: 'Harvests tier 2 nodes (titanium, uranium, cryo, sulfur). +30% harvest speed.' }));
add(M({ key: 'drill_mk3', name: 'Drill Rig Mk3', w: 2, h: 2, cat: 'resource', unique: true, unlock: 16, cost: { titanium_alloy: 10, uranium_rod: 2, cryo_core: 2 }, height: 1, drill: 3, harvest: 1.6, use: 2, desc: 'Harvests Xenite. +60% harvest speed.' }));
add(M({ key: 'vault', name: 'Secure Vault', w: 1, h: 1, cat: 'resource', unlock: 12, cost: { titanium_alloy: 3, circuit: 2 }, height: 0.7, vault: 4, maxLevel: 3, limit: [0, 1, 2, 3, 4, 5], desc: 'Protects 4 cargo slots from being lost in the Dead Zone.' }));

/* Power & drive */
add(M({ key: 'reactor', name: 'Scrap Reactor', w: 2, h: 2, cat: 'power', cost: { scrap: 30, iron_plate: 6, copper_wire: 6 }, height: 0.8, power: 6, limit: [2, 3, 3, 4, 5, 6], desc: '+6 power (more per level).' }));
add(M({ key: 'fission', name: 'Fission Core', w: 2, h: 2, cat: 'power', unlock: 11, cost: { uranium_rod: 3, titanium_alloy: 6, circuit: 4 }, height: 0.9, power: 15, limit: [0, 1, 2, 2, 3, 3], desc: '+15 power.' }));
add(M({ key: 'engine', name: 'Diesel Engine', w: 2, h: 2, cat: 'power', cost: { scrap: 30, iron_plate: 8 }, height: 0.7, thrust: 6, use: 1, limit: [2, 3, 3, 4, 5, 6], desc: '+6 thrust. More thrust moves a heavier fortress faster.' }));
add(M({ key: 'ion_engine', name: 'Ion Drive', w: 2, h: 2, cat: 'power', unlock: 15, cost: { titanium_alloy: 8, cryo_core: 2, circuit: 4 }, height: 0.7, thrust: 13, use: 3, limit: [0, 1, 2, 3, 4, 4], desc: '+13 thrust.' }));

/* Workshops & labs */
add(M({ key: 'workshop', name: 'Workshop', w: 3, h: 3, cat: 'special', unique: true, unlock: 2, workshop: true, use: 1, cost: { iron_plate: 12, copper_wire: 6, scrap: 30 }, height: 0.9, desc: 'Builds weapons, drive trains and repair kits. Tap it to craft.' }));
add(M({ key: 'science_lab', name: 'Card Lab', w: 3, h: 3, cat: 'special', unique: true, unlock: 4, cards: 0.06, use: 1, cost: { iron_plate: 12, circuit: 6, copper_wire: 8 }, height: 1, desc: 'Studies your cards: +6% card power and +6% energy regen per level.' }));
add(M({ key: 'forge', name: 'Weapon Forge', w: 3, h: 3, cat: 'special', unique: true, unlock: 6, forge: true, use: 2, cost: { iron_plate: 20, scrap: 40, explosive: 4 }, height: 1.1, desc: 'Raises weapons to more stars. Higher levels forge faster and reach higher stars.' }));
add(M({ key: 'ammo_depot', name: 'Ammo Depot', w: 1, h: 2, cat: 'special', unlock: 11, cost: { iron_plate: 12, explosive: 6 }, height: 0.7, depot: 0.08, limit: [0, 1, 2, 2, 3, 3], desc: 'Ballistic, artillery and missile weapons fire 8% faster (more per level, max +40%).' }));
add(M({ key: 'arcane_sanctum', name: 'Arcane Sanctum', w: 3, h: 3, cat: 'special', unique: true, unlock: 15, sanctum: true, use: 2, cost: { xenite: 6, cryo_core: 3, titanium_alloy: 8 }, height: 1.3, desc: 'Distils Mythic Essence. Arcane weapons +10% damage per level.' }));

/* Hazard gear */
add(M({ key: 'rad_baffles', name: 'Rad Baffles', w: 1, h: 2, cat: 'utility', unique: true, unlock: 6, cost: { iron_plate: 12, titanium_alloy: 3 }, height: 0.9, protects: ['rad'], desc: 'Shields the crew from radiation (Glass Crater).' }));
add(M({ key: 'thermal', name: 'Thermal Regulator', w: 1, h: 2, cat: 'utility', unique: true, unlock: 8, cost: { titanium_alloy: 6, copper_wire: 12, circuit: 3 }, height: 0.9, protects: ['heat', 'cold'], use: 1, desc: 'Protects against extreme heat and cold (Magma Rift, Cryo Spires).' }));
add(M({ key: 'sealant', name: 'Sealant Pumps', w: 1, h: 2, cat: 'utility', unique: true, unlock: 12, cost: { titanium_alloy: 6, sulfur: 10, cryo_core: 2 }, height: 0.9, protects: ['toxic'], use: 1, desc: 'Seals the hull against toxic fumes (Acid Marsh).' }));

export const MODULE_LIST: readonly ModuleDef[] = Object.values(MODULES);

/* ---------------------------------------------------------------------- */
/* Levels, limits, costs and build times                                   */
/* ---------------------------------------------------------------------- */

export const maxModuleLevel = (d: ModuleDef): number => d.maxLevel ?? 5;

/** Effect multiplier for a building at a level: +35% per level above 1. */
export const levelMult = (lvl: number): number => 1 + 0.35 * (Math.max(1, lvl) - 1);

/** How many of a building the Command Center level allows. */
export function buildLimit(d: ModuleDef, cc: number): number {
  if (d.unique || d.required) return 1;
  if (!d.limit) return 99;
  return d.limit[Math.max(0, Math.min(d.limit.length - 1, cc - 1))];
}

/** Buildings can't go past the Command Center's level (the Command Center itself needs commander levels). */
export const CC_COMMANDER_LEVEL = [1, 3, 7, 12, 18, 24];

const LEVEL_FACTOR = [1, 1.5, 3, 5, 8, 12];

/** What it costs to raise a building from `lvl` to `lvl + 1`. */
export function levelCost(d: ModuleDef, lvl: number): Cost {
  if (d.key === 'bridge') return CC_COST[lvl] ?? {};
  const base: Cost = Object.keys(d.cost).length ? d.cost : { iron_plate: 20, circuit: 6 };
  const f = LEVEL_FACTOR[Math.min(LEVEL_FACTOR.length - 1, lvl)];
  const out: Cost = {};
  for (const [k, n] of Object.entries(base)) out[k] = Math.ceil(n * f);
  const tp = [0, 0, 1, 2, 4, 6][Math.min(5, lvl)];
  if (tp) out.tech_parts = (out.tech_parts ?? 0) + tp;
  return out;
}

/** Command Center upgrade costs (index = current level). */
const CC_COST: Cost[] = [
  {},
  { scrap: 150, iron_plate: 40, circuit: 6 },
  { scrap: 250, iron_plate: 70, circuit: 14, titanium_alloy: 10, tech_parts: 3 },
  { iron_plate: 100, titanium_alloy: 30, circuit: 24, uranium_rod: 4, tech_parts: 8 },
  { titanium_alloy: 60, xeno_alloy: 8, circuit: 36, cryo_core: 8, tech_parts: 14 },
  { titanium_alloy: 90, xeno_alloy: 20, mythic_essence: 3, tech_parts: 24 },
];

/** Seconds to raise a building from `lvl` to `lvl + 1`. Deeper levels take longer. */
export function levelTime(d: ModuleDef, lvl: number): number {
  const t = [0, 12, 40, 90, 180, 300][Math.min(5, lvl)];
  return d.key === 'bridge' ? t * 1.6 : t;
}

/** Seconds to build a new one. */
export const buildTime = (d: ModuleDef): number => Math.round(4 + d.w * d.h * 0.8);

/* ---------------------------------------------------------------------- */
/* Hulls: the Command Center's level sets the fortress size                */
/* ---------------------------------------------------------------------- */

export interface ChassisDef {
  key: string;
  name: string;
  cols: number;
  rows: number;
  hp: number;
  mass: number;
  armor: number;
  desc: string;
  /** Enemy or special hulls. */
  hidden?: boolean;
}

export const CHASSIS: ChassisDef[] = [
  { key: 'crawler', name: 'Crawler Facility', cols: 10, rows: 14, hp: 1200, mass: 40, armor: 0.04, desc: 'A rolling camp.' },
  { key: 'assault', name: 'Assault Facility', cols: 12, rows: 17, hp: 1800, mass: 50, armor: 0.06, desc: 'Room for a real army.' },
  { key: 'siege', name: 'Siege Citadel', cols: 14, rows: 20, hp: 2600, mass: 62, armor: 0.08, desc: 'A rolling fortress.' },
  { key: 'dread', name: 'Land Dreadnought', cols: 16, rows: 23, hp: 3600, mass: 76, armor: 0.1, desc: 'A town on treads.' },
  { key: 'colossus', name: 'Colossus', cols: 18, rows: 27, hp: 4800, mass: 92, armor: 0.12, desc: 'The largest thing that moves in the wasteland.' },
  { key: 'citadel', name: 'Moving Citadel', cols: 20, rows: 31, hp: 6400, mass: 110, armor: 0.14, desc: 'A city that walks.' },
  { key: 'scout', name: 'Raider Buggy-Tank', cols: 5, rows: 7, hp: 260, mass: 16, armor: 0.02, desc: '', hidden: true },
  { key: 'outrider', name: 'Outrider', cols: 4, rows: 6, hp: 420, mass: 12, armor: 0.05, desc: 'Mini tank crewed by side crew.', hidden: true },
  { key: 'outpost', name: 'Outpost', cols: 12, rows: 12, hp: 2400, mass: 999, armor: 0.1, desc: '', hidden: true },
];

/** The hull for each Command Center level. */
export const CC_CHASSIS = CHASSIS.filter((c) => !c.hidden);
export const UPGRADE_CHASSIS = CC_CHASSIS;

export function chassisDef(key: string): ChassisDef {
  return CHASSIS.find((c) => c.key === key) ?? CHASSIS[0];
}

export function chassisForCC(level: number): ChassisDef {
  return CC_CHASSIS[Math.max(0, Math.min(CC_CHASSIS.length - 1, level - 1))];
}

export const DRIVE_INFO: Record<string, { name: string; best: string }> = {
  wheels: { name: 'Standard Treads', best: 'Roads, rust and dirt' },
  tracks: { name: 'Dune Tracks', best: 'Sand and dunes' },
  chains: { name: 'Spiked Chains', best: 'Ice and snow' },
  magma: { name: 'Magma Treads', best: 'Crosses lava' },
  hover: { name: 'Hover Skirts', best: 'Everything, even acid' },
};

/** Workshop and refinery recipes. */
export interface Recipe {
  id: string;
  out: string;
  n: number;
  cost: Cost;
  station: 'refinery' | 'workshop' | 'sanctum' | 'none';
  /** Commander level needed. */
  unlock?: number;
}

export const RECIPES: Recipe[] = [
  { id: 'r_iron', out: 'iron_plate', n: 1, cost: { iron_ore: 2 }, station: 'refinery' },
  { id: 'r_copper', out: 'copper_wire', n: 2, cost: { copper_ore: 2 }, station: 'refinery' },
  { id: 'r_ti', out: 'titanium_alloy', n: 1, cost: { titanium_ore: 3 }, station: 'refinery' },
  { id: 'r_u', out: 'uranium_rod', n: 1, cost: { uranium_ore: 3 }, station: 'refinery' },
  { id: 'r_cryo', out: 'cryo_core', n: 1, cost: { cryo_crystal: 3 }, station: 'refinery' },
  { id: 'r_expl', out: 'explosive', n: 2, cost: { sulfur: 2, scrap: 2 }, station: 'refinery' },
  { id: 'r_circ', out: 'circuit', n: 1, cost: { scrap: 6, copper_wire: 2 }, station: 'refinery' },
  { id: 'r_xeno', out: 'xeno_alloy', n: 1, cost: { xenite: 2, titanium_alloy: 1 }, station: 'refinery' },
  { id: 'r_ration', out: 'rations', n: 2, cost: { biomass: 2 }, station: 'none' },
  { id: 'r_kit', out: 'repair_kit', n: 1, cost: { scrap: 20, iron_plate: 2 }, station: 'none' },
  { id: 'd_tracks', out: 'drive_tracks', n: 1, cost: { iron_plate: 20, copper_wire: 10, scrap: 40 }, station: 'workshop' },
  { id: 'd_chains', out: 'drive_chains', n: 1, cost: { titanium_alloy: 6, iron_plate: 10 }, station: 'workshop' },
  { id: 'd_magma', out: 'drive_magma', n: 1, cost: { titanium_alloy: 10, cryo_core: 3, uranium_rod: 1 }, station: 'workshop' },
  { id: 'd_hover', out: 'drive_hover', n: 1, cost: { uranium_rod: 3, cryo_core: 3, titanium_alloy: 10, sulfur: 10 }, station: 'workshop' },
  { id: 's_essence', out: 'mythic_essence', n: 1, cost: { xenite: 8, xeno_alloy: 2, cryo_core: 2 }, station: 'sanctum' },
];

/** Where refined materials come from (for tracking). */
export function recipeFor(item: string): Recipe | undefined {
  return RECIPES.find((r) => r.out === item);
}
