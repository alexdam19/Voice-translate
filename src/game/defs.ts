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
  /** Built into the hull: placed automatically, never bought, moved or removed (weapon pads, main battery). */
  fixed?: boolean;
  /** Weapon sizes this hardpoint takes (default: exactly its own size). */
  mounts?: WeaponSize[];
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
  /** Fuel Drill: crude pumped per second on good ground (level 1). */
  oilDrill?: number;
  /** Automatic Refinery: crude cracked into fuel per second (level 1). */
  crudeRefine?: number;
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
  /** Tesla Coil: zaps creatures on or against the hull. */
  tesla?: boolean;
  mess?: boolean;
  /**
   * Which deck it goes on. The fortress is several stories tall: the roof is the battle deck (guns, nests, the
   * command tower), the stories below hold everything else. Default: interior.
   */
  deck?: 'roof' | 'interior' | 'any';
  /** Troop bunks: troops man the guns and the roof nests. */
  bunks?: number;
  /** A soldier nest on the roof: how many soldiers it holds and what they fight with. */
  nest?: NestKind;
  soldiers?: number;
}

export type NestKind = 'rifle' | 'grenade' | 'rocket' | 'flame';

const M = (d: ModuleDef): ModuleDef => d;

export const MODULES: Record<string, ModuleDef> = {};
const add = (d: ModuleDef): void => {
  MODULES[d.key] = d;
};

/* Command */
add(M({ key: 'bridge', name: 'Command Bridge', w: 4, h: 4, cat: 'command', cost: {}, height: 1.2, unique: true, required: true, maxLevel: 6, crew: 2, bunks: 6, vision: 26, power: 4, thrust: 3, desc: 'The bridge on top of your fortress and the heart of the whole facility. Upgrade it to grow the hull and raise every building\'s max level.' }));

/* Built into the hull */
add(M({ key: 'main_gun', name: 'Main Battery Turret', w: 4, h: 4, cat: 'weapon', cost: {}, height: 0.9, fixed: true, hardpoint: 'heavy', hp: 150, armor: 0.01, deck: 'roof', desc: "The fortress's great twin-barrelled turret. Takes a heavy weapon. A second one rises on the rear deck at Command Center level 4. Each level adds +15% damage." }));
add(M({ key: 'pad', name: 'Weapon Pad', w: 2, h: 2, cat: 'weapon', cost: {}, height: 0.5, fixed: true, hardpoint: 'medium', mounts: ['light', 'medium'], hp: 40, deck: 'roof', desc: 'An armored weapon pad built into the hull. Takes a light or medium weapon. Every corner has one, and more appear along the sides as the Command Center grows. Each level adds +15% damage.' }));

/* Turrets */
add(M({ key: 'hp_light', name: 'Light Turret Mount', w: 1, h: 1, cat: 'weapon', cost: { scrap: 15, iron_plate: 3 }, height: 0.5, hardpoint: 'light', limit: [3, 4, 5, 6, 8, 10], deck: 'roof', desc: 'Mounts one light weapon. Each level adds +15% damage.' }));
add(M({ key: 'hp_medium', name: 'Medium Turret Mount', w: 2, h: 2, cat: 'weapon', unlock: 4, cost: { iron_plate: 12, circuit: 2 }, height: 0.6, hardpoint: 'medium', limit: [1, 2, 2, 3, 4, 5], deck: 'roof', desc: 'Mounts one medium weapon. Each level adds +15% damage.' }));
add(M({ key: 'hp_heavy', name: 'Heavy Turret Mount', w: 3, h: 3, cat: 'weapon', cost: { iron_plate: 30, circuit: 4 }, height: 0.7, hardpoint: 'heavy', limit: [1, 1, 2, 2, 3, 4], deck: 'roof', desc: 'Mounts one heavy weapon. Each level adds +15% damage.' }));

/* Defense */
add(M({ key: 'armor', name: 'Armor Plate', w: 1, h: 1, cat: 'defense', cost: { iron_plate: 4 }, height: 0.4, hp: 80, armor: 0.008, limit: [8, 12, 16, 22, 28, 36], deck: 'any', desc: '+80 hull, +0.8% armor.' }));
add(M({ key: 'heavy_armor', name: 'Heavy Armor Plate', w: 1, h: 2, cat: 'defense', unlock: 10, cost: { titanium_alloy: 4, iron_plate: 4, explosive: 2 }, height: 0.5, hp: 220, armor: 0.02, limit: [0, 4, 6, 8, 12, 16], deck: 'any', desc: '+220 hull, +2% armor.' }));
add(M({ key: 'repair_bay', name: 'Repair Bay', w: 2, h: 2, cat: 'defense', unlock: 3, cost: { iron_plate: 12, circuit: 3 }, height: 0.8, repair: 4, use: 1, limit: [1, 1, 2, 2, 3, 3], desc: 'Repairs 4 hull per second.' }));
add(M({ key: 'shield', name: 'Shield Generator', w: 2, h: 2, cat: 'defense', unlock: 13, cost: { titanium_alloy: 8, uranium_rod: 2, circuit: 6 }, height: 1, shield: 320, shieldRegen: 20, use: 4, limit: [0, 1, 2, 2, 3, 3], deck: 'roof', desc: '+320 shield that recharges out of combat.' }));
add(M({ key: 'tesla', name: 'Tesla Coil', w: 1, h: 1, cat: 'defense', unlock: 3, cost: { copper_wire: 10, circuit: 2, iron_plate: 4 }, height: 1.1, tesla: true, use: 1, limit: [2, 3, 4, 5, 6, 8], deck: 'roof', desc: 'Arcs lightning into creatures climbing onto the hull or crowding against it: 3 at a time (+1 per level), about once a second. The answer to hordes.' }));
/* Soldier nests on the roof */
add(M({ key: 'nest_rifle', name: 'Rifle Nest', w: 2, h: 2, cat: 'army', cost: { scrap: 20, iron_plate: 4 }, height: 0.35, deck: 'roof', nest: 'rifle', soldiers: 2, limit: [2, 3, 4, 5, 6, 8], desc: 'A sandbagged firing step on the roof for 2 riflemen. They pick off anything climbing the hull or charging it. Each level: +20% damage.' }));
add(M({ key: 'nest_grenade', name: 'Grenadier Nest', w: 2, h: 2, cat: 'army', unlock: 2, cost: { scrap: 25, iron_plate: 6, explosive: 2 }, height: 0.35, deck: 'roof', nest: 'grenade', soldiers: 2, limit: [1, 2, 3, 4, 5, 6], desc: '2 grenadiers who lob explosives into the thick of a horde. Each level: +20% damage.' }));
add(M({ key: 'nest_rocket', name: 'Rocket Nest', w: 2, h: 2, cat: 'army', unlock: 6, cost: { iron_plate: 12, explosive: 6, circuit: 2 }, height: 0.35, deck: 'roof', nest: 'rocket', soldiers: 2, limit: [0, 1, 2, 3, 4, 5], desc: '2 rocketeers for big targets: bosses, brutes and enemy tanks. Each level: +20% damage.' }));
add(M({ key: 'nest_flame', name: 'Flamer Nest', w: 2, h: 2, cat: 'army', unlock: 9, cost: { iron_plate: 10, sulfur: 10, copper_wire: 6 }, height: 0.35, deck: 'roof', nest: 'flame', soldiers: 2, limit: [0, 1, 2, 3, 4, 5], desc: '2 flamers who hose the hull edges clean: anything climbing aboard burns. Each level: +20% damage.' }));

add(M({ key: 'radar', name: 'Radar Mast', w: 1, h: 1, cat: 'defense', unique: true, unlock: 5, cost: { copper_wire: 8, circuit: 2 }, height: 1.6, vision: 8, radar: 50, use: 1, deck: 'roof', desc: '+8 vision. Shows enemies within 50 units on the minimap.' }));

/* Army & squads */
add(M({ key: 'barracks', name: 'Barracks', w: 3, h: 4, cat: 'army', unlock: 3, cost: { scrap: 40, iron_plate: 10 }, height: 0.9, crew: 5, squad: 'marines', limit: [1, 1, 2, 2, 2, 3], bunks: 8, desc: 'Bunks 5 officers and 32 troops (+16 per level), keeps a RESERVE of 16 more per level (they step in when someone falls and make up repair teams and work crews), and trains a Marine squad. Upgrade it to upgrade the squad.' }));
add(M({ key: 'garage', name: 'Garage', w: 4, h: 4, cat: 'army', unique: true, unlock: 5, garage: true, squad: 'buggies', cost: { iron_plate: 30, circuit: 6, scrap: 60 }, height: 1.1, desc: 'Builds Scout Buggies that scavenge ahead and bring loot back, and the Outrider mini tank. Upgrade it to upgrade the buggies.' }));
add(M({ key: 'drone_bay', name: 'Drone Bay', w: 3, h: 3, cat: 'army', unique: true, unlock: 9, squad: 'drones', cost: { circuit: 10, copper_wire: 16, iron_plate: 10 }, height: 0.7, use: 1, deck: 'roof', desc: 'Launches Guard Drones: fast laser flyers, great at guarding an area.' }));
add(M({ key: 'jet_hangar', name: 'Jet Hangar', w: 3, h: 4, cat: 'army', unique: true, unlock: 14, squad: 'fighters', cost: { titanium_alloy: 12, circuit: 10, iron_plate: 16 }, height: 0.7, use: 1, deck: 'roof', desc: 'Keeps a wing of mini fighter jets in the air that strafe and bomb anything near you.' }));
add(M({ key: 'tank_bay', name: 'Tank Bay', w: 4, h: 4, cat: 'army', unique: true, unlock: 7, squad: 'minitanks', cost: { iron_plate: 40, circuit: 10, titanium_alloy: 6 }, height: 1, desc: 'Machinery for building and launching Mini Tanks: small escort tanks that ride out through the rear ramp and fight beside the fortress. Upgrade it for more of them.' }));
add(M({ key: 'mech_bay', name: 'Mech Bay', w: 4, h: 4, cat: 'army', unique: true, unlock: 18, squad: 'walker', cost: { titanium_alloy: 30, uranium_rod: 6, circuit: 16 }, height: 1.2, desc: 'Builds a Walker Mech: a slow giant with a cannon and missile racks.' }));

/* Crew */
add(M({ key: 'quarters', name: 'Living Quarters', w: 2, h: 2, cat: 'crew', cost: { scrap: 25, iron_plate: 4 }, height: 0.9, crew: 3, limit: [3, 4, 5, 6, 7, 8], bunks: 8, desc: 'Bunks for 3 officers (+1 per level) and 32 crew (+16 per level): enough people to run every station in shifts, with some always asleep. Injured crew recover faster.' }));
add(M({ key: 'medbay', name: 'Medbay', w: 2, h: 2, cat: 'crew', unlock: 4, cost: { iron_plate: 8, circuit: 3, biomass: 6 }, height: 0.8, medbay: true, use: 1, limit: [1, 1, 1, 2, 2, 2], desc: 'Injured crew recover 3x faster.' }));
add(M({ key: 'hydroponics', name: 'Hydroponics', w: 2, h: 2, cat: 'crew', cost: { scrap: 20, iron_plate: 4, biomass: 8 }, height: 0.6, food: 1, use: 1, limit: [1, 2, 2, 3, 3, 4], desc: 'Grows a ration every 25 seconds (faster per level).' }));
add(M({ key: 'mess_hall', name: 'Mess Hall', w: 3, h: 3, cat: 'crew', unique: true, unlock: 8, cost: { scrap: 30, iron_plate: 8, biomass: 6 }, height: 0.8, mess: true, food: 1, crew: 1, bunks: 3, desc: 'Injured crew recover 50% faster. Cooks rations and bunks 1.' }));
add(M({ key: 'training_grounds', name: 'Training Grounds', w: 3, h: 4, cat: 'crew', unique: true, unlock: 10, cost: { iron_plate: 16, scrap: 40 }, height: 0.35, training: 1.2, desc: 'Every crew member aboard earns experience over time.' }));

/* Resources */
add(M({ key: 'cargo', name: 'Cargo Hold', w: 2, h: 2, cat: 'resource', cost: { scrap: 20, iron_plate: 4 }, height: 0.8, cargo: 12, limit: [2, 3, 4, 5, 6, 8], desc: '+12 cargo slots (more per level).' }));
add(M({ key: 'refinery', name: 'Refinery', w: 3, h: 3, cat: 'resource', unique: true, unlock: 2, refinery: true, use: 1, cost: { scrap: 30, iron_plate: 6, copper_wire: 4 }, height: 1, desc: 'Turns ore into plates, wire, alloys and cores. Tap it to refine.' }));
add(M({ key: 'fuel_drill', name: 'Fuel Drill', w: 2, h: 3, cat: 'resource', unique: true, oilDrill: 3, use: 1, cost: { scrap: 40, iron_plate: 8, copper_wire: 4 }, height: 1.3, desc: 'A deep bore through the keel. Stop the Titan and lower it (DRILL in the cabin or on the HUD) to pump crude oil into the crude tank: 3 a second on good ground, +40% per level, more on rich ground (the OIL survey). She cannot move while it is down, and the pumps draw creatures in. An Automatic Refinery turns the crude into fuel.' }));
add(M({ key: 'fuel_refinery', name: 'Automatic Refinery', w: 3, h: 3, cat: 'resource', unique: true, crudeRefine: 2.4, use: 2, cost: { scrap: 50, iron_plate: 10, copper_wire: 8 }, height: 1.2, desc: 'Cracks crude oil from the crude tank into fuel on its own while its AUTO switch is on (cabin or HUD): 2.4 crude a second, +40% per level, at 85% yield. Draws 2 reactor power.' }));
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

/** Can this hardpoint take a weapon of that size? */
export function canMount(d: ModuleDef, size: WeaponSize): boolean {
  if (!d.hardpoint) return false;
  return (d.mounts ?? [d.hardpoint]).includes(size);
}

/** Buildings you can buy in the shop (not the Command Center or anything built into the hull). */
export const isShopBuilding = (d: ModuleDef): boolean => !d.required && !d.fixed;

/** Deck 0 is the roof; decks 1..stories are the stories below it, top to bottom. */
export const ROOF = 0;

export function deckKind(d: ModuleDef): 'roof' | 'interior' | 'any' {
  return d.deck ?? 'interior';
}

/** Can this building go on that deck? */
export function deckAllows(d: ModuleDef, deck: number, stories: number): boolean {
  if (deck < 0 || deck > stories) return false;
  const k = deckKind(d);
  return k === 'any' || (k === 'roof' ? deck === ROOF : deck >= 1);
}

/**
 * The Titan Crawler's decks, top to bottom (index 1..7 under the roof), with what belongs on each.
 */
export const TITAN_DECK_INFO: { name: string; level: string; color: string; desc: string }[] = [
  { name: 'Roof', level: 'Roof', color: '#90a4ae', desc: 'Guns, soldier nests, sensors and the defenses.' },
  { name: 'Command', level: '+3', color: '#4dd0e1', desc: 'The bridge, navigation, tactical command, communications and sensors.' },
  { name: 'Recreation', level: '+2', color: '#9ccc65', desc: 'Gym, recreation, lounges and observation.' },
  { name: 'Residential', level: '+1', color: '#fff176', desc: 'Rooms, bunks, showers, laundry.' },
  { name: 'Main Deck', level: '0', color: '#ffb74d', desc: 'The public deck: the Spine, dining hall, medical, workshops, classrooms.' },
  { name: 'Hangar', level: '-1', color: '#b0bec5', desc: 'Vehicle bays, drones, mini tanks, the rear ramp.' },
  { name: 'Logistics', level: '-2', color: '#b39ddb', desc: 'Warehouses, ammunition, food and water storage, spare parts.' },
  { name: 'Engineering', level: '-3', color: '#ef5350', desc: 'Power, propulsion, hydraulics, cooling: the loudest place aboard.' },
];

/** The Command Center level (Titan mark) at which each deck opens. Roof and five decks from the start. */
export const DECK_OPEN_CC = [1, 1, 3, 1, 1, 2, 1, 1];

/**
 * The Titan's fixed interior, in deck cells (5 m): the Spine, a 10 m corridor down the middle of every deck, three
 * elevator shafts beside it that run from Engineering to the roof, and on the roof the Spine's skylight and the
 * command tower. Nothing can be built on them.
 */
export const TITAN_SPINE = { c0: 8, c1: 9, r0: 1, r1: 36 } as const;
export const TITAN_LIFTS: { name: string; cx: number; cy: number }[] = [
  { name: 'Lift A', cx: 6, cy: 6 }, { name: 'Lift B', cx: 10, cy: 18 }, { name: 'Lift C', cx: 6, cy: 28 },
];
export const TITAN_SKYLIGHT = { c0: 8, c1: 9, r0: 7, r1: 29 } as const;
export const TITAN_TOWER = { c0: 7, c1: 10, r0: 21, r1: 25 } as const;

/** Is this cell part of the Titan's fixed structure on that deck (0 = roof)? */
export function titanReserved(cx: number, cy: number, deck: number): boolean {
  const inR = (r: { c0: number; c1: number; r0: number; r1: number }): boolean => cx >= r.c0 && cx <= r.c1 && cy >= r.r0 && cy <= r.r1;
  if (TITAN_LIFTS.some((l) => cx >= l.cx && cx < l.cx + 2 && cy >= l.cy && cy < l.cy + 2)) return true;
  return deck === ROOF ? inR(TITAN_SKYLIGHT) || inR(TITAN_TOWER) : inR(TITAN_SPINE);
}

/** Which deck each kind of building belongs on (by theme). */
const DECK_OF: Record<string, number> = {
  bridge: 1, science_lab: 1, radar: 0,
  training_grounds: 2, arcane_sanctum: 2,
  quarters: 3, barracks: 3,
  mess_hall: 4, medbay: 4, workshop: 4, forge: 4, hydroponics: 4, repair_bay: 4, ammo_depot: 4,
  garage: 5, drone_bay: 5, jet_hangar: 5, mech_bay: 5, tank_bay: 5,
  cargo: 6, vault: 6, refinery: 6, drill_mk2: 6, drill_mk3: 6, fuel_drill: 7, fuel_refinery: 6,
  reactor: 7, fission: 7, engine: 7, ion_engine: 7, rad_baffles: 7, thermal: 7, sealant: 7,
};

/** Where a building goes by default. */
export function defaultDeck(d: ModuleDef): number {
  const k = deckKind(d);
  if (k !== 'interior') return ROOF;
  return DECK_OF[d.key] ?? 4;
}

/** The name of a deck ("Deck +3 Command"). Small hulls just have a roof and a hold. */
export function deckName(deck: number, stories: number): string {
  if (deck === ROOF) return 'Roof';
  if (stories === 7) return `${TITAN_DECK_INFO[deck].level} ${TITAN_DECK_INFO[deck].name}`;
  return stories === 1 ? 'Hold' : `Deck ${deck}`;
}

/* ---------------------------------------------------------------------- */
/* Departments: who works where                                            */
/* ---------------------------------------------------------------------- */

export type Dept = 'gunnery' | 'roof' | 'engine' | 'command' | 'medical' | 'galley' | 'works' | 'science' | 'hangar';

/** In the order people are sent to them when there aren't enough to go round. */
export const DEPTS: { key: Dept; name: string; icon: string; color: string; staff: string; desc: string }[] = [
  { key: 'gunnery', name: 'Gunnery', icon: '🎯', color: '#ff7043', staff: 'gunners', desc: 'One gunner on every gun, two on the heavies. No gunner, no shooting.' },
  { key: 'roof', name: 'Roof Guard', icon: '🪖', color: '#c5e1a5', staff: 'soldiers', desc: 'Soldiers in the roof nests. Storms drive them inside.' },
  { key: 'engine', name: 'Engine Room', icon: '⚙', color: '#ffd740', staff: 'engineers', desc: 'Engines, reactors and shield generators run on engineers. Short-staffed, you lose power and speed.' },
  { key: 'command', name: 'Command', icon: '⭐', color: '#4dd0e1', staff: 'lieutenants', desc: 'The General\'s staff on the bridge: lieutenants, signals, attack command. Without them the fortress fights blind (less vision and range).' },
  { key: 'medical', name: 'Medical', icon: '✚', color: '#ef5350', staff: 'doctors', desc: 'Doctors heal the wounded and get people back on duty.' },
  { key: 'galley', name: 'Galley', icon: '🍲', color: '#a1887f', staff: 'cooks', desc: 'Cooks and growers. Hydroponics grows rations; a staffed Mess Hall makes them go further.' },
  { key: 'works', name: 'Works', icon: '🔧', color: '#ffca28', staff: 'mechanics & builders', desc: 'Mechanics, fabricators and builders. Builders need a crew of two per job.' },
  { key: 'science', name: 'Science', icon: '⚗', color: '#ea80fc', staff: 'scientists', desc: 'Scientists in the labs: card power, training and arcane work.' },
  { key: 'hangar', name: 'Hangar', icon: '🛩', color: '#90caf9', staff: 'pilots & drivers', desc: 'Pilots and drivers for the squads, drones, jets and mini tanks.' },
];

/** People each building needs on duty, and the department they belong to (guns and nests are counted separately). */
export const STAFF: Record<string, [Dept, number]> = {
  bridge: ['command', 3], radar: ['command', 1],
  engine: ['engine', 2], ion_engine: ['engine', 2], reactor: ['engine', 1], fission: ['engine', 2], shield: ['engine', 1],
  medbay: ['medical', 2], repair_bay: ['works', 1],
  hydroponics: ['galley', 1], mess_hall: ['galley', 2],
  workshop: ['works', 2], forge: ['works', 2], refinery: ['works', 1], drill_mk2: ['works', 1], drill_mk3: ['works', 1], ammo_depot: ['works', 1],
  fuel_drill: ['works', 1], fuel_refinery: ['works', 1],
  science_lab: ['science', 2], arcane_sanctum: ['science', 1], training_grounds: ['science', 1],
  garage: ['hangar', 2], drone_bay: ['hangar', 1], jet_hangar: ['hangar', 2], mech_bay: ['hangar', 2], tank_bay: ['hangar', 2], barracks: ['command', 1],
};

/**
 * A Titan carries a small town: every post in the tables above is a team of this many people, every bunk sleeps
 * this many. (Rations, water, repair and pumping rates are per team, so the balance is the same, just busier.)
 */
export const CREW_SCALE = 4;

/** Troops it takes to man a weapon of this size: a team each, two teams on the heavies. */
export function crewNeed(size: WeaponSize): number {
  return (size === 'heavy' ? 2 : 1) * CREW_SCALE;
}

/**
 * Where a Titan's main batteries turn, in hull metres (forward, starboard): the forward battery sits on the
 * citadel just ahead of amidships (where the design sheet has it), the rear one aft. Their barrels run
 * `batteryReach` past the pivot, so shots leave from the muzzles.
 */
export function batteryLocal(L: number, W: number, rear: boolean): [number, number] {
  return rear ? [-0.3 * L, 0] : [0.0094 * L, 0.0151 * W];
}

export function batteryReach(L: number, rear: boolean): number {
  return 0.279 * L * (rear ? 0.72 : 1);
}

/**
 * Where the hull's built-in weapons sit for a Command Center level: a pad on every corner, the main battery at
 * the front, then more pads along the sides and a second battery on the rear deck as the fortress grows.
 */
export function fixedSpots(cc: number, cols: number, rows: number, twinBattery = false): { key: 'pad' | 'main_gun'; cx: number; cy: number }[] {
  const out: { key: 'pad' | 'main_gun'; cx: number; cy: number }[] = [
    { key: 'main_gun', cx: Math.floor(cols / 2) - 2, cy: 1 },
    { key: 'pad', cx: 0, cy: 0 },
    { key: 'pad', cx: cols - 2, cy: 0 },
    { key: 'pad', cx: 0, cy: rows - 2 },
    { key: 'pad', cx: cols - 2, cy: rows - 2 },
  ];
  const side = (f: number): void => {
    const cy = Math.max(2, Math.min(rows - 4, Math.round(rows * f) - 1));
    out.push({ key: 'pad', cx: 0, cy }, { key: 'pad', cx: cols - 2, cy });
  };
  // A 200 m hull carries a pad amidships on each side from the start, and more with every refit.
  if (cc >= (rows >= 30 ? 1 : 2)) side(0.5);
  if (rows >= 30 && cc >= 2) side(0.28);
  // The Bastion gets its rear battery right away; everyone else at Command Center level 4.
  if (cc >= (twinBattery ? 1 : 4)) out.push({ key: 'main_gun', cx: Math.floor(cols / 2) - 2, cy: rows - 6 });
  if (cc >= 5) side(rows >= 30 ? 0.72 : 0.28);
  if (cc >= 6) side(rows >= 30 ? 0.86 : 0.72);
  return out;
}

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

/**
 * The Titan Crawler: 200 m long, 90 m wide, 42 m tall, on eight crawler assemblies. The hull never changes size;
 * every Command Center level is a refit of the same machine: more armor, more decks opened up, more gun mounts.
 */
export const CHASSIS: ChassisDef[] = [
  { key: 'crawler', name: 'Titan Crawler Mk I', cols: 18, rows: 38, hp: 1600, mass: 44, armor: 0.05, desc: 'A 200-metre armoured city on eight crawlers. The roof and five of its seven decks are open.' },
  { key: 'assault', name: 'Titan Crawler Mk II', cols: 18, rows: 38, hp: 2300, mass: 55, armor: 0.07, desc: 'The Hangar deck (-1) opens for vehicle bays, drones and mini tanks; more mounts.' },
  { key: 'siege', name: 'Titan Crawler Mk III', cols: 18, rows: 38, hp: 3200, mass: 68, armor: 0.09, desc: 'The Recreation deck (+2) opens; more mounts.' },
  { key: 'dread', name: 'Titan Crawler Mk IV', cols: 18, rows: 38, hp: 4300, mass: 82, armor: 0.11, desc: 'A rear main battery and heavier armour.' },
  { key: 'colossus', name: 'Titan Crawler Mk V', cols: 18, rows: 38, hp: 5600, mass: 98, armor: 0.13, desc: 'More mounts down the flanks.' },
  { key: 'citadel', name: 'Titan Crawler Mk VI', cols: 18, rows: 38, hp: 7200, mass: 116, armor: 0.15, desc: 'Every deck, every mount: a city that rolls.' },
  { key: 'scout', name: 'Raider Buggy-Tank', cols: 5, rows: 7, hp: 260, mass: 16, armor: 0.02, desc: '', hidden: true },
  { key: 'outrider', name: 'Outrider', cols: 4, rows: 6, hp: 420, mass: 12, armor: 0.05, desc: 'Mini tank crewed by side crew.', hidden: true },
  { key: 'outpost', name: 'Outpost', cols: 12, rows: 12, hp: 2400, mass: 999, armor: 0.1, desc: '', hidden: true },
];

/** Deck sizes before v0.7, for moving old layouts onto the bigger hulls. */
export const LEGACY_DIMS: Record<string, [number, number]> = {
  crawler: [10, 14], assault: [12, 17], siege: [14, 20], dread: [16, 23], colossus: [18, 27], citadel: [20, 31],
};

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
