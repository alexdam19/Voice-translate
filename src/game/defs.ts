import type { Cost } from '../shared/inventory';
import type { Hazard } from '../shared/types';
import type { WeaponSize } from '../shared/weapons';

/**
 * Deck modules: everything you can bolt onto the fortress. Each takes a w x h
 * block of deck cells (w across the hull, h along it).
 */

export type ModuleCat = 'command' | 'power' | 'crew' | 'industry' | 'defense' | 'weapon' | 'utility' | 'facility' | 'arsenal' | 'ultimate';

export const CATEGORIES: { key: ModuleCat; name: string; color: string }[] = [
  { key: 'weapon', name: 'Weapons', color: '#ff7043' },
  { key: 'arsenal', name: 'Actives (1-4)', color: '#ff4081' },
  { key: 'ultimate', name: 'Ultimates (R)', color: '#ff1744' },
  { key: 'facility', name: 'Labs & Facilities', color: '#ffd54f' },
  { key: 'defense', name: 'Defense', color: '#80d8ff' },
  { key: 'power', name: 'Power & Drive', color: '#ffd740' },
  { key: 'crew', name: 'Crew', color: '#a5d6a7' },
  { key: 'industry', name: 'Industry', color: '#bcaaa4' },
  { key: 'utility', name: 'Hazard & Utility', color: '#ce93d8' },
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
  /** Visual height of the block on the deck (world units). */
  height: number;
  unique?: boolean;
  required?: boolean;
  tech?: string;
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
  /** Research speed added (Science Lab). */
  lab?: number;
  forge?: boolean;
  /** Passive crew XP per second (Training Grounds). */
  training?: number;
  sanctum?: boolean;
  /** Fire-rate bonus for ballistic, artillery and missile weapons. */
  depot?: number;
  /** Ultimate charge speed bonus. */
  uplink?: number;
  mess?: boolean;
  /** Arsenal active ability this module provides (keys 1-4). */
  active?: string;
  /** Ultimate this module provides (key R). */
  ult?: string;
  /** Highest module level (default 3). */
  maxLevel?: number;
}

const M = (d: ModuleDef): ModuleDef => d;

export const MODULES: Record<string, ModuleDef> = {};
const add = (d: ModuleDef): void => {
  MODULES[d.key] = d;
};

add(M({ key: 'bridge', name: 'Command Bridge', w: 2, h: 2, cat: 'command', cost: {}, height: 1.1, unique: true, required: true, crew: 2, vision: 17, power: 2, thrust: 1, desc: 'The heart of the fortress. Houses 2 crew and your officers. Can\'t be removed.' }));
add(M({ key: 'reactor', name: 'Scrap Reactor', w: 2, h: 2, cat: 'power', cost: { scrap: 30, iron_plate: 6, copper_wire: 6 }, height: 0.8, power: 6, desc: '+6 power.' }));
add(M({ key: 'fission', name: 'Fission Core', w: 2, h: 2, cat: 'power', tech: 'fission', cost: { uranium_rod: 3, titanium_alloy: 6, circuit: 4 }, height: 0.9, power: 15, desc: '+15 power.' }));
add(M({ key: 'engine', name: 'Diesel Engine', w: 2, h: 2, cat: 'power', cost: { scrap: 30, iron_plate: 8 }, height: 0.7, thrust: 5, use: 1, desc: '+5 thrust. More thrust moves a heavier fortress faster.' }));
add(M({ key: 'ion_engine', name: 'Ion Drive', w: 2, h: 2, cat: 'power', tech: 'ion_drive', cost: { titanium_alloy: 8, cryo_core: 2, circuit: 4 }, height: 0.7, thrust: 11, use: 3, desc: '+11 thrust.' }));
add(M({ key: 'quarters', name: 'Living Quarters', w: 2, h: 2, cat: 'crew', cost: { scrap: 25, iron_plate: 4 }, height: 0.9, crew: 3, desc: 'Bunks for 3 crew. Injured crew recover faster.' }));
add(M({ key: 'barracks', name: 'Barracks', w: 2, h: 3, cat: 'crew', cost: { scrap: 40, iron_plate: 10 }, height: 0.9, crew: 5, desc: 'Racks for 5 crew.' }));
add(M({ key: 'medbay', name: 'Medbay', w: 2, h: 2, cat: 'crew', cost: { iron_plate: 8, circuit: 3, biomass: 6 }, height: 0.8, medbay: true, use: 1, desc: 'Injured crew recover 3x faster.' }));
add(M({ key: 'hydroponics', name: 'Hydroponics', w: 2, h: 2, cat: 'crew', cost: { scrap: 20, iron_plate: 4, biomass: 8 }, height: 0.6, food: 1, use: 1, desc: 'Grows a ration every 25 seconds.' }));
add(M({ key: 'cargo', name: 'Cargo Hold', w: 2, h: 2, cat: 'industry', cost: { scrap: 20, iron_plate: 4 }, height: 0.8, cargo: 12, desc: '+12 cargo slots.' }));
add(M({ key: 'vault', name: 'Secure Vault', w: 1, h: 1, cat: 'industry', cost: { titanium_alloy: 3, circuit: 2 }, height: 0.7, vault: 4, desc: 'Protects 4 cargo slots from being lost in the Dead Zone.' }));
add(M({ key: 'refinery', name: 'Refinery', w: 2, h: 2, cat: 'industry', unique: true, cost: { scrap: 30, iron_plate: 6, copper_wire: 4 }, height: 1, refinery: true, use: 1, desc: 'Refines ore into plates, wire, alloys and cores (CARGO > Workshop).' }));
add(M({ key: 'workshop', name: 'Workshop', w: 2, h: 2, cat: 'industry', unique: true, cost: { iron_plate: 12, circuit: 4, copper_wire: 6 }, height: 0.9, workshop: true, use: 1, desc: 'Builds weapons, drive trains and repair kits (CARGO > Workshop).' }));
add(M({ key: 'drill_mk2', name: 'Drill Rig Mk2', w: 2, h: 1, cat: 'industry', tech: 'drill_mk2', cost: { iron_plate: 16, circuit: 4, explosive: 2 }, height: 0.8, drill: 2, harvest: 1.3, use: 1, desc: 'Harvests tier 2 nodes (titanium, uranium, cryo, sulfur). +30% harvest speed.' }));
add(M({ key: 'drill_mk3', name: 'Drill Rig Mk3', w: 2, h: 2, cat: 'industry', tech: 'drill_mk3', cost: { titanium_alloy: 10, uranium_rod: 2, cryo_core: 2 }, height: 1, drill: 3, harvest: 1.6, use: 2, desc: 'Harvests Xenite. +60% harvest speed.' }));
add(M({ key: 'garage', name: 'Garage', w: 3, h: 3, cat: 'industry', unique: true, cost: { iron_plate: 30, titanium_alloy: 6, circuit: 6 }, height: 1.1, garage: true, desc: 'Builds and repairs the Outrider mini tank. Needs 15 crew aboard to launch it.' }));
add(M({ key: 'armor', name: 'Armor Plate', w: 1, h: 1, cat: 'defense', cost: { iron_plate: 4 }, height: 0.4, hp: 60, armor: 0.01, desc: '+60 hull, +1% armor.' }));
add(M({ key: 'heavy_armor', name: 'Reactive Armor', w: 1, h: 2, cat: 'defense', tech: 'reactive_armor', cost: { titanium_alloy: 4, iron_plate: 4, explosive: 2 }, height: 0.5, hp: 180, armor: 0.025, desc: '+180 hull, +2.5% armor.' }));
add(M({ key: 'shield', name: 'Shield Generator', w: 2, h: 2, cat: 'defense', tech: 'shield_gen', cost: { titanium_alloy: 8, uranium_rod: 2, circuit: 6 }, height: 1, shield: 240, shieldRegen: 16, use: 4, desc: '+240 shield that recharges out of combat.' }));
add(M({ key: 'repair_bay', name: 'Repair Bay', w: 2, h: 2, cat: 'defense', cost: { iron_plate: 12, circuit: 3 }, height: 0.8, repair: 3, use: 1, desc: 'Repairs 3 hull per second.' }));
add(M({ key: 'radar', name: 'Radar Mast', w: 1, h: 1, cat: 'utility', cost: { copper_wire: 8, circuit: 2 }, height: 1.6, vision: 7, radar: 40, use: 1, desc: '+7 vision. Shows enemies within 40 units on the minimap.' }));
add(M({ key: 'rad_baffles', name: 'Rad Baffles', w: 1, h: 2, cat: 'utility', cost: { iron_plate: 12, titanium_alloy: 3 }, height: 0.9, protects: ['rad'], desc: 'Shields the crew from radiation (Glass Crater).' }));
add(M({ key: 'thermal', name: 'Thermal Regulator', w: 1, h: 2, cat: 'utility', cost: { titanium_alloy: 6, copper_wire: 12, circuit: 3 }, height: 0.9, protects: ['heat', 'cold'], use: 1, desc: 'Protects against extreme heat and cold (Magma Rift, Cryo Spires).' }));
add(M({ key: 'sealant', name: 'Sealant Pumps', w: 1, h: 2, cat: 'utility', cost: { titanium_alloy: 6, sulfur: 10, cryo_core: 2 }, height: 0.9, protects: ['toxic'], use: 1, desc: 'Seals the hull against toxic fumes (Acid Marsh).' }));
/* Labs & facilities */
add(M({ key: 'science_lab', name: 'Science Lab', w: 2, h: 2, cat: 'facility', tech: 'science_lab', cost: { iron_plate: 12, circuit: 6, copper_wire: 8 }, height: 1, lab: 0.5, crew: 1, use: 1, desc: 'Research runs faster (+0.5 speed, more per level). Unlocks the Personnel tree. Bunks 1 scientist.' }));
add(M({ key: 'forge', name: 'Weapon Forge', w: 2, h: 2, cat: 'facility', tech: 'forging', unique: true, cost: { iron_plate: 20, scrap: 40, explosive: 4 }, height: 1.1, forge: true, use: 2, desc: 'Raises weapons to higher stars (ARSENAL, V). Each level works 50% faster.' }));
add(M({ key: 'training_grounds', name: 'Training Grounds', w: 2, h: 3, cat: 'facility', tech: 'drill_yards', unique: true, cost: { iron_plate: 16, scrap: 40 }, height: 0.35, training: 1.2, desc: 'Every crew member aboard earns experience over time (+1.2 XP/s, more per level).' }));
add(M({ key: 'mess_hall', name: 'Mess Hall', w: 2, h: 2, cat: 'facility', tech: 'drill_yards', unique: true, cost: { scrap: 30, iron_plate: 8, biomass: 6 }, height: 0.8, mess: true, food: 1, crew: 1, desc: 'Injured crew recover 50% faster. Cooks rations and bunks 1.' }));
add(M({ key: 'arcane_sanctum', name: 'Arcane Sanctum', w: 2, h: 2, cat: 'facility', tech: 'arcane_studies', unique: true, cost: { xenite: 6, cryo_core: 3, titanium_alloy: 8 }, height: 1.3, sanctum: true, use: 2, desc: 'Distils Mythic Essence (CARGO > Workshop). Arcane weapons +10% damage per level.' }));
add(M({ key: 'ammo_depot', name: 'Ammo Depot', w: 1, h: 2, cat: 'facility', tech: 'logistics_depot', cost: { iron_plate: 12, explosive: 6 }, height: 0.7, depot: 0.08, desc: 'Ballistic, artillery and missile weapons fire 8% faster (more per level, max +40%).' }));
add(M({ key: 'command_uplink', name: 'Command Uplink', w: 1, h: 1, cat: 'facility', tech: 'command_uplink', cost: { circuit: 8, copper_wire: 12 }, height: 1.5, uplink: 0.25, use: 1, desc: 'Your ultimate (R) charges 25% faster (more per level).' }));

/* Arsenal actives (keys 1-4) */
add(M({ key: 'salvo_rack', name: 'Salvo Rack', w: 2, h: 1, cat: 'arsenal', tech: 'salvo', cost: { iron_plate: 12, explosive: 8 }, height: 0.6, active: 'salvo', desc: 'ACTIVE: 12 rockets slam into the area under the cursor.' }));
add(M({ key: 'smoke_launcher', name: 'Smoke Launchers', w: 1, h: 1, cat: 'arsenal', tech: 'smoke', cost: { iron_plate: 6, sulfur: 6 }, height: 0.5, active: 'smoke', desc: 'ACTIVE: a smoke screen halves incoming damage for 5s.' }));
add(M({ key: 'drone_bay', name: 'Drone Bay', w: 2, h: 2, cat: 'arsenal', tech: 'drone_bay', cost: { circuit: 10, copper_wire: 16, iron_plate: 10 }, height: 0.7, active: 'drones', use: 1, desc: 'ACTIVE: launches 4 laser drones that hunt nearby enemies.' }));
add(M({ key: 'mine_layer', name: 'Mine Layer', w: 1, h: 2, cat: 'arsenal', tech: 'mines', cost: { explosive: 10, iron_plate: 10 }, height: 0.5, active: 'mines', desc: 'ACTIVE: scatters 8 proximity mines around the fortress.' }));
add(M({ key: 'jet_hangar', name: 'Jet Hangar', w: 2, h: 3, cat: 'arsenal', tech: 'jet_fighters', cost: { titanium_alloy: 12, circuit: 10, iron_plate: 16 }, height: 0.7, active: 'jets', use: 1, desc: 'ACTIVE: scrambles mini fighter jets that strafe and bomb around the cursor.' }));
add(M({ key: 'teleporter', name: 'Blink Drive', w: 2, h: 2, cat: 'arsenal', tech: 'blink', cost: { cryo_core: 4, uranium_rod: 2, circuit: 8 }, height: 0.9, active: 'blink', use: 2, desc: 'ACTIVE: teleports the whole fortress to the cursor.' }));
add(M({ key: 'dome_projector', name: 'Dome Projector', w: 2, h: 2, cat: 'arsenal', tech: 'aegis', cost: { titanium_alloy: 10, cryo_core: 3, circuit: 8 }, height: 1, active: 'dome', use: 2, desc: 'ACTIVE: an energy dome blocks 90% of damage for 4s.' }));
add(M({ key: 'airstrike', name: 'Airstrike Beacon', w: 1, h: 1, cat: 'arsenal', tech: 'carpet_bomb', cost: { explosive: 16, circuit: 6 }, height: 1.4, active: 'airstrike', desc: 'ACTIVE: a bomber carpet-bombs a line toward the cursor.' }));

/* Ultimates (key R) */
add(M({ key: 'nuke_silo', name: 'Nuclear Silo', w: 3, h: 3, cat: 'ultimate', tech: 'nuclear_program', unique: true, cost: { uranium_rod: 12, titanium_alloy: 20, xeno_alloy: 4 }, height: 0.5, ult: 'nuke', desc: 'ULTIMATE: launch a tactical nuke at the cursor.' }));
add(M({ key: 'mech_bay', name: 'Mech Bay', w: 3, h: 3, cat: 'ultimate', tech: 'mech_drop', unique: true, cost: { titanium_alloy: 30, uranium_rod: 6, circuit: 16 }, height: 1.2, ult: 'mech', desc: 'ULTIMATE: drop a giant battle mech that fights for 30s.' }));
add(M({ key: 'orbital', name: 'Orbital Uplink', w: 2, h: 2, cat: 'ultimate', tech: 'orbital_laser', unique: true, cost: { xeno_alloy: 8, cryo_core: 6, circuit: 16 }, height: 1.4, ult: 'orbital_laser', desc: 'ULTIMATE: a laser from orbit follows your cursor for 7s.' }));
add(M({ key: 'obelisk', name: 'Star Obelisk', w: 2, h: 2, cat: 'ultimate', tech: 'meteor_storm', unique: true, cost: { mythic_essence: 3, xeno_alloy: 6, xenite: 10 }, height: 1.8, ult: 'meteors', desc: 'ULTIMATE: a storm of meteors around the cursor.' }));
add(M({ key: 'chrono_engine', name: 'Chrono Engine', w: 2, h: 2, cat: 'ultimate', tech: 'time_stop', unique: true, cost: { mythic_essence: 3, cryo_core: 8, circuit: 12 }, height: 1.2, ult: 'timestop', desc: 'ULTIMATE: stop time for every enemy for 6s.' }));
add(M({ key: 'dragon_roost', name: 'Dragon Roost', w: 3, h: 3, cat: 'ultimate', tech: 'dragon_pact', unique: true, cost: { mythic_essence: 6, sulfur: 40, xeno_alloy: 8 }, height: 0.9, ult: 'dragon', desc: 'ULTIMATE: summon a fire-breathing dragon for 25s.' }));
add(M({ key: 'storm_engine', name: 'Storm Engine', w: 3, h: 3, cat: 'ultimate', tech: 'cataclysm', unique: true, cost: { mythic_essence: 6, cryo_core: 10, copper_wire: 60 }, height: 1.6, ult: 'cataclysm', desc: 'ULTIMATE: a 10s lightning cataclysm around the fortress.' }));

add(M({ key: 'hp_light', name: 'Light Hardpoint', w: 1, h: 1, cat: 'weapon', cost: { scrap: 15, iron_plate: 3 }, height: 0.5, hardpoint: 'light', desc: 'Mounts one light weapon.' }));
add(M({ key: 'hp_medium', name: 'Medium Hardpoint', w: 2, h: 2, cat: 'weapon', cost: { iron_plate: 12, circuit: 2 }, height: 0.6, hardpoint: 'medium', desc: 'Mounts one medium weapon.' }));
add(M({ key: 'hp_heavy', name: 'Heavy Hardpoint', w: 3, h: 3, cat: 'weapon', cost: { iron_plate: 30, circuit: 4 }, height: 0.7, hardpoint: 'heavy', desc: 'Mounts one heavy weapon.' }));

export const MODULE_LIST: readonly ModuleDef[] = Object.values(MODULES);

/* ---------------------------------------------------------------------- */
/* Module levels (1-3)                                                     */
/* ---------------------------------------------------------------------- */

export const maxModuleLevel = (d: ModuleDef): number => d.maxLevel ?? (d.hardpoint || d.key === 'vault' ? 1 : 3);

/** Effect multiplier for a module at a level: +50% per level above 1. */
export const levelMult = (lvl: number): number => 1 + 0.5 * (Math.max(1, lvl) - 1);

/** What it costs to raise a module from `lvl` to `lvl + 1`. */
export function levelCost(d: ModuleDef, lvl: number): Cost {
  const base: Cost = Object.keys(d.cost).length ? d.cost : { iron_plate: 20, circuit: 6 };
  const f = lvl <= 1 ? 1.2 : 2.4;
  const out: Cost = {};
  for (const [k, n] of Object.entries(base)) out[k] = Math.ceil(n * f);
  out.tech_parts = (out.tech_parts ?? 0) + (lvl <= 1 ? 1 : 3);
  return out;
}

export interface ChassisDef {
  key: string;
  name: string;
  cols: number;
  rows: number;
  hp: number;
  mass: number;
  armor: number;
  cost: Cost;
  desc: string;
  /** Not offered as an upgrade (enemy or special hulls). */
  hidden?: boolean;
}

export const CHASSIS: ChassisDef[] = [
  { key: 'crawler', name: 'Light Crawler', cols: 7, rows: 10, hp: 700, mass: 30, armor: 0.04, cost: {}, desc: 'Where everyone starts.' },
  { key: 'assault', name: 'Assault Landship', cols: 8, rows: 12, hp: 1100, mass: 42, armor: 0.06, cost: { iron_plate: 40, scrap: 120, circuit: 6 }, desc: 'Room for a real barracks and a second big gun.' },
  { key: 'siege', name: 'Siege Landship', cols: 10, rows: 14, hp: 1600, mass: 58, armor: 0.08, cost: { titanium_alloy: 20, iron_plate: 50, circuit: 10, tech_parts: 4 }, desc: 'A rolling fortress.' },
  { key: 'dread', name: 'Land Dreadnought', cols: 11, rows: 17, hp: 2300, mass: 76, armor: 0.1, cost: { titanium_alloy: 40, uranium_rod: 6, circuit: 16, tech_parts: 8 }, desc: 'A town on treads.' },
  { key: 'colossus', name: 'Colossus', cols: 13, rows: 21, hp: 3200, mass: 100, armor: 0.12, cost: { xeno_alloy: 12, titanium_alloy: 60, cryo_core: 8, tech_parts: 14 }, desc: 'The largest thing that moves in the wasteland.' },
  { key: 'scout', name: 'Raider Buggy-Tank', cols: 5, rows: 7, hp: 260, mass: 16, armor: 0.02, cost: {}, desc: '', hidden: true },
  { key: 'outrider', name: 'Outrider', cols: 4, rows: 6, hp: 420, mass: 12, armor: 0.05, cost: {}, desc: 'Mini tank crewed by side crew.', hidden: true },
  { key: 'outpost', name: 'Outpost', cols: 12, rows: 12, hp: 2400, mass: 999, armor: 0.1, cost: {}, desc: '', hidden: true },
];

export const UPGRADE_CHASSIS = CHASSIS.filter((c) => !c.hidden);

export function chassisDef(key: string): ChassisDef {
  return CHASSIS.find((c) => c.key === key) ?? CHASSIS[0];
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
  tech?: string;
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
  { id: 's_essence_cheap', out: 'mythic_essence', n: 1, cost: { xenite: 4, xeno_alloy: 1, cryo_core: 1 }, station: 'sanctum', tech: 'essence_tap' },
];
