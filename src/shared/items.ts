import { T } from './tiles';
import type { Hazard } from './types';

export type ItemKind =
  | 'block' | 'resource' | 'material' | 'tool' | 'weapon' | 'ammo' | 'suit' | 'gadget'
  | 'consumable' | 'drive' | 'throwable';

export type ProjKind =
  | 'bullet' | 'pellet' | 'laser' | 'rail' | 'rocket' | 'grenade' | 'flak' | 'missile' | 'plasma' | 'spit' | 'melee';

export type IconShape =
  | 'block' | 'ore' | 'scrap' | 'plate' | 'wire' | 'alloy' | 'rod' | 'crystal' | 'core' | 'chip'
  | 'ammo' | 'rocket' | 'cutter' | 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'rail' | 'launcher'
  | 'baton' | 'grenade' | 'suit' | 'jetpack' | 'medkit' | 'ration' | 'stim' | 'wheel' | 'track'
  | 'chain' | 'hover' | 'magtrack' | 'biomass' | 'explosive' | 'powder';

export interface WeaponStats {
  dmg: number;
  /** Shots per second. */
  rate: number;
  speed: number;
  spread: number;
  pellets: number;
  ammo: string | null;
  energy: number;
  auto: boolean;
  /** Explosion radius in px (0 = none). */
  explosive: number;
  pierce: number;
  /** Projectile lifetime in seconds. */
  life: number;
  gravity: number;
  kind: ProjKind;
  knock: number;
  /** Damage dealt to terrain/rig tiles on hit. */
  tileDmg: number;
  color: string;
  sound: 'pistol' | 'smg' | 'shotgun' | 'laser' | 'rail' | 'rocket' | 'throw' | 'melee';
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  maxStack: number;
  desc: string;
  icon: IconShape;
  c1: string;
  c2: string;
  /** Rough value used by loot tables / warzone risk display. */
  value: number;
  place?: number;
  tool?: { power: number; tier: number; reach: number };
  weapon?: WeaponStats;
  suit?: { armor: number; protects: Hazard[]; body: string; trim: string };
  gadget?: { thrust: number; fuel: number; regen: number };
  heal?: number;
  drive?: string;
}

const ITEMS: Record<string, ItemDef> = {};

function item(id: string, name: string, kind: ItemKind, icon: IconShape, c1: string, c2: string, o: Partial<ItemDef> = {}): void {
  const stack = kind === 'block' || kind === 'resource' || kind === 'material' ? 999 : kind === 'ammo' ? 999 : kind === 'consumable' || kind === 'throwable' ? 50 : 1;
  ITEMS[id] = { id, name, kind, icon, c1, c2, maxStack: stack, desc: '', value: 1, ...o };
}

const W = (o: Partial<WeaponStats>): WeaponStats => ({
  dmg: 10, rate: 3, speed: 1000, spread: 0.03, pellets: 1, ammo: 'rounds', energy: 0, auto: false,
  explosive: 0, pierce: 0, life: 0.8, gravity: 0, kind: 'bullet', knock: 60, tileDmg: 0, color: '#ffd180', sound: 'pistol',
  ...o,
});

/* Blocks (placeable in the world) */
item('dirt', 'Wasteland Soil', 'block', 'block', '#684c3c', '#4e3a2c', { place: T.DIRT, desc: 'Dry, dead earth.' });
item('rock', 'Rock', 'block', 'block', '#5e5b62', '#3e3c42', { place: T.ROCK, desc: 'Common stone. Used by the Refinery.' });
item('sand', 'Sand', 'block', 'block', '#d6b270', '#b89050', { place: T.SAND, desc: 'Can be smelted into glass.' });
item('ice', 'Ice', 'block', 'block', '#96ceec', '#6aa6cc', { place: T.ICE });
item('snow', 'Snow', 'block', 'block', '#e2ecf8', '#b6c6d8', { place: T.SNOW });
item('ash', 'Ash Crust', 'block', 'block', '#484042', '#ff6e28', { place: T.ASH });
item('basalt', 'Basalt', 'block', 'block', '#34303a', '#221e28', { place: T.BASALT });
item('mud', 'Marsh Mud', 'block', 'block', '#403c28', '#2c2a1a', { place: T.MUD });
item('glass', 'Rad Glass', 'block', 'block', '#76bc6c', '#c8ffaa', { place: T.GLASS, desc: 'Faintly glowing fused sand.' });
item('concrete', 'Concrete', 'block', 'block', '#808084', '#606064', { place: T.CONCRETE });
item('metal_plate', 'Metal Plating', 'block', 'block', '#787e86', '#565c64', { place: T.PLATE, desc: 'Sturdy building block.' });
item('platform', 'Platform', 'block', 'block', '#967850', '#6a5238', { place: T.PLATFORM, desc: 'Jump through from below. Hold S to drop.' });
item('lamp', 'Glow Lamp', 'block', 'block', '#ffd68c', '#ffffff', { place: T.LAMP, desc: 'Lights up the dark.' });
item('neon', 'Neon Block', 'block', 'block', '#ff28c8', '#ffa0ee', { place: T.NEON, desc: 'Because the future is loud.' });

/* Raw resources */
item('scrap', 'Scrap', 'resource', 'scrap', '#9a6a4a', '#6e7c86', { value: 1, desc: 'The currency of the wasteland. Used everywhere.' });
item('iron_ore', 'Iron Ore', 'resource', 'ore', '#c86848', '#5e5b62', { value: 2, desc: 'Refine into Iron Plate.' });
item('copper_ore', 'Copper Ore', 'resource', 'ore', '#e28c40', '#5e5b62', { value: 2, desc: 'Refine into Copper Wire.' });
item('titanium_ore', 'Titanium Ore', 'resource', 'ore', '#c4d6ec', '#545460', { value: 5, desc: 'Found deep under the Dune Sea.' });
item('uranium_ore', 'Uranium Ore', 'resource', 'ore', '#a0ff50', '#464e46', { value: 8, desc: 'Hot. Found in the Glass Crater.' });
item('cryo_crystal', 'Cryo Crystal', 'resource', 'crystal', '#78faff', '#3c8cb4', { value: 8, desc: 'Grows in the Cryo Spires.' });
item('sulfur', 'Sulfur', 'resource', 'powder', '#ffe246', '#b89a20', { value: 5, desc: 'Mined in the Magma Rift. Explosive.' });
item('xenite', 'Xenite', 'resource', 'crystal', '#ff3cdc', '#6a1c78', { value: 20, desc: 'Alien lattice mineral. Acid Marsh & deep Magma Rift.' });
item('biomass', 'Biomass', 'resource', 'biomass', '#9a5ac8', '#5affc8', { value: 1, desc: 'Mutant fungus. Food, medicine, fuel.' });

/* Refined materials */
item('iron_plate', 'Iron Plate', 'material', 'plate', '#a4a8b0', '#6a6e76', { value: 4 });
item('copper_wire', 'Copper Wire', 'material', 'wire', '#e8904a', '#9a5a2a', { value: 2 });
item('titanium_alloy', 'Titanium Alloy', 'material', 'alloy', '#d8e6f8', '#8898b0', { value: 12 });
item('uranium_rod', 'Uranium Rod', 'material', 'rod', '#a8ff5a', '#4a6a3a', { value: 20 });
item('cryo_core', 'Cryo Core', 'material', 'core', '#8af6ff', '#2c6a8a', { value: 20 });
item('circuit', 'Circuit Board', 'material', 'chip', '#2ecc71', '#f1c40f', { value: 6 });
item('xeno_alloy', 'Xeno Alloy', 'material', 'alloy', '#ff6ae6', '#7a2a8a', { value: 45 });
item('explosive', 'Explosive Charge', 'material', 'explosive', '#e84a3a', '#ffe246', { value: 6 });

/* Ammo */
item('rounds', 'Scrap Rounds', 'ammo', 'ammo', '#d4a24a', '#8a6a3a', { value: 0.2, desc: 'Ammunition for ballistic weapons.' });
item('rockets', 'Rockets', 'ammo', 'rocket', '#e84a3a', '#c0c0c0', { value: 3, desc: 'Ammunition for the Rocket Tube.' });

/* Tools */
item('cutter1', 'Plasma Cutter Mk1', 'tool', 'cutter', '#ff9a3c', '#606a74', { tool: { power: 1, tier: 1, reach: 6 }, value: 10, desc: 'Mines tier 1 materials. RMB repairs your rig (uses scrap).' });
item('cutter2', 'Plasma Cutter Mk2', 'tool', 'cutter', '#3cc8ff', '#606a74', { tool: { power: 1.9, tier: 2, reach: 7 }, value: 60, desc: 'Mines titanium, uranium, cryo crystal, sulfur.' });
item('cutter3', 'Plasma Cutter Mk3', 'tool', 'cutter', '#ff3cdc', '#3a3a44', { tool: { power: 3.2, tier: 3, reach: 8 }, value: 180, desc: 'Cuts anything, including Xenite.' });

/* Weapons */
item('rivet_pistol', 'Rivet Pistol', 'weapon', 'pistol', '#9aa4ae', '#d4a24a', {
  value: 8, desc: 'Reliable sidearm. Uses Scrap Rounds.',
  weapon: W({ dmg: 14, rate: 4, speed: 1150, spread: 0.03, sound: 'pistol' }),
});
item('scrap_smg', 'Scrap SMG', 'weapon', 'smg', '#7a848e', '#e8904a', {
  value: 30, desc: 'Sprays rivets fast. Uses Scrap Rounds.',
  weapon: W({ dmg: 8, rate: 11, speed: 1150, spread: 0.08, auto: true, sound: 'smg', knock: 30 }),
});
item('scattergun', 'Scattergun', 'weapon', 'shotgun', '#6a5a4a', '#c0c0c0', {
  value: 40, desc: 'Seven pellets of bad news. Uses Scrap Rounds.',
  weapon: W({ dmg: 9, rate: 1.4, speed: 950, spread: 0.22, pellets: 7, life: 0.38, kind: 'pellet', sound: 'shotgun', knock: 180, tileDmg: 0.2 }),
});
item('arc_rifle', 'Arc Rifle', 'weapon', 'rifle', '#3cc8ff', '#2c3440', {
  value: 90, desc: 'Energy weapon. No ammo; drains suit energy.',
  weapon: W({ dmg: 26, rate: 3, speed: 1800, spread: 0.01, ammo: null, energy: 9, auto: true, kind: 'laser', pierce: 1, color: '#6af0ff', sound: 'laser' }),
});
item('rail_lance', 'Rail Lance', 'weapon', 'rail', '#ff3cdc', '#2c2c38', {
  value: 220, desc: 'Hypervelocity slug. Pierces everything in a line.',
  weapon: W({ dmg: 95, rate: 0.8, speed: 3400, spread: 0, ammo: null, energy: 32, kind: 'rail', pierce: 6, life: 0.5, color: '#ff7af0', sound: 'rail', knock: 260 }),
});
item('rocket_tube', 'Rocket Tube', 'weapon', 'launcher', '#5a6a4a', '#e84a3a', {
  value: 140, desc: 'Explosive. Breaks terrain and rig plating.',
  weapon: W({ dmg: 70, rate: 0.9, speed: 620, spread: 0.02, ammo: 'rockets', kind: 'rocket', explosive: 44, life: 2.4, tileDmg: 3, color: '#ff8a3c', sound: 'rocket', knock: 240 }),
});
item('shock_baton', 'Shock Baton', 'weapon', 'baton', '#3c3c44', '#6af0ff', {
  value: 20, desc: 'Melee. No ammo required.',
  weapon: W({ dmg: 30, rate: 2.5, speed: 0, ammo: null, kind: 'melee', life: 0.12, sound: 'melee', knock: 220, color: '#6af0ff' }),
});
item('grenade', 'Frag Grenade', 'throwable', 'grenade', '#4a5a3a', '#e84a3a', {
  value: 6, desc: 'Throw with LMB. Explodes after a short fuse.',
  weapon: W({ dmg: 80, rate: 1.2, speed: 560, spread: 0, ammo: 'grenade', kind: 'grenade', explosive: 52, life: 1.7, gravity: 900, tileDmg: 3, sound: 'throw', knock: 260 }),
});

/* Suits (armor + hazard protection) */
item('scav_jacket', 'Scav Jacket', 'suit', 'suit', '#7a5a3a', '#ffb74d', { value: 5, suit: { armor: 3, protects: [], body: '#6e5236', trim: '#ffb74d' }, desc: 'Patched leather and plate. No hazard protection.' });
item('rad_suit', 'Rad Suit', 'suit', 'suit', '#d8c83a', '#3a3a3a', { value: 60, suit: { armor: 4, protects: ['rad'], body: '#c8b82a', trim: '#2c2c2c' }, desc: 'Protects against radiation.' });
item('thermal_suit', 'Thermal Suit', 'suit', 'suit', '#e8743a', '#3ac8ff', { value: 90, suit: { armor: 5, protects: ['heat', 'cold'], body: '#c8602a', trim: '#6ae0ff' }, desc: 'Protects against extreme heat and cold.' });
item('hazmat_suit', 'Hazmat Suit', 'suit', 'suit', '#3ac86a', '#2c2c2c', { value: 120, suit: { armor: 5, protects: ['toxic', 'rad'], body: '#2aa85a', trim: '#1c1c1c' }, desc: 'Protects against toxic atmosphere and radiation.' });
item('warborn_exo', 'Warborn Exo', 'suit', 'suit', '#2c2c38', '#ff3cdc', { value: 400, suit: { armor: 14, protects: ['rad', 'heat', 'cold', 'toxic'], body: '#23232e', trim: '#ff3cdc' }, desc: 'Sealed power armor. Immune to all hazards.' });

/* Gadgets */
item('jetpack1', 'Jump Jet', 'gadget', 'jetpack', '#8a949e', '#ff9a3c', { value: 40, gadget: { thrust: 2100, fuel: 1.1, regen: 0.7 }, desc: 'Short bursts of flight. Hold jump in the air.' });
item('jetpack2', 'Ion Jetpack', 'gadget', 'jetpack', '#3a4a5a', '#6af0ff', { value: 150, gadget: { thrust: 2400, fuel: 3, regen: 1.3 }, desc: 'Sustained flight.' });

/* Consumables */
item('medkit', 'Medkit', 'consumable', 'medkit', '#e8e8e8', '#e84a3a', { heal: 60, value: 6, desc: 'Restores 60 health. Use with LMB.' });
item('rations', 'Rations', 'consumable', 'ration', '#8a7a4a', '#d4c48a', { heal: 20, value: 2, desc: 'Restores 20 health. Crew eat these too.' });
item('stim', 'Cryo Stim', 'consumable', 'stim', '#6af0ff', '#e8e8e8', { heal: 35, value: 10, desc: 'Restores 35 health and refills energy.' });

/* Rig drive trains (install from the Rig panel) */
item('drive_wheels', 'Standard Wheels', 'drive', 'wheel', '#3a3a3a', '#9aa4ae', { drive: 'wheels', value: 10, desc: 'Fine on hard ground. Bogs in sand, slips on ice.' });
item('drive_tracks', 'Dune Tracks', 'drive', 'track', '#4a4036', '#d6b270', { drive: 'tracks', value: 80, desc: 'Wide tracks that float over sand.' });
item('drive_chains', 'Spiked Chains', 'drive', 'chain', '#3a3a44', '#c4d6ec', { drive: 'chains', value: 120, desc: 'Studded tires that bite into ice.' });
item('drive_magma', 'Magma Treads', 'drive', 'magtrack', '#3a2a2a', '#ff6e28', { drive: 'magma', value: 250, desc: 'Heat-proof ceramic treads. Good on most terrain.' });
item('drive_hover', 'Hover Skirts', 'drive', 'hover', '#2c3440', '#6af0ff', { drive: 'hover', value: 400, desc: 'Ground-effect skirts. Glides over acid and lava.' });

export function getItem(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Unknown item: ${id}`);
  return d;
}

export function hasItem(id: string): boolean {
  return id in ITEMS;
}

export const ALL_ITEMS: readonly ItemDef[] = Object.values(ITEMS);
