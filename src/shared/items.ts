import type { DriveKey } from './types';

/**
 * Stackable goods: resources you harvest, materials you refine, consumables and
 * drive trains. Weapons are not stack items; they are unique WeaponItems (see weapons.ts).
 */
export type ItemKind = 'resource' | 'material' | 'consumable' | 'drive';

export type IconShape =
  | 'ore' | 'scrap' | 'plate' | 'wire' | 'alloy' | 'rod' | 'crystal' | 'core' | 'chip' | 'powder'
  | 'biomass' | 'explosive' | 'kit' | 'ration' | 'wheel' | 'track' | 'chain' | 'magtrack' | 'hover' | 'tech';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  maxStack: number;
  desc: string;
  icon: IconShape;
  c1: string;
  c2: string;
  value: number;
  drive?: DriveKey;
}

const ITEMS: Record<string, ItemDef> = {};

function item(id: string, name: string, kind: ItemKind, icon: IconShape, c1: string, c2: string, o: Partial<ItemDef> = {}): void {
  const maxStack = kind === 'drive' ? 1 : kind === 'consumable' ? 50 : 999;
  ITEMS[id] = { id, name, kind, icon, c1, c2, maxStack, desc: '', value: 1, ...o };
}

/* Raw resources, harvested from nodes or looted */
item('scrap', 'Scrap', 'resource', 'scrap', '#9a6a4a', '#6e7c86', { value: 1, desc: 'The currency of the wasteland. Used for almost everything.' });
item('iron_ore', 'Iron Ore', 'resource', 'ore', '#c86848', '#5e5b62', { value: 2, desc: 'Refine into Iron Plate.' });
item('copper_ore', 'Copper Ore', 'resource', 'ore', '#e28c40', '#5e5b62', { value: 2, desc: 'Refine into Copper Wire.' });
item('titanium_ore', 'Titanium Ore', 'resource', 'ore', '#c4d6ec', '#545460', { value: 5, desc: 'Found in the Dune Sea. Needs a Mk2 drill.' });
item('uranium_ore', 'Uranium Ore', 'resource', 'ore', '#a0ff50', '#464e46', { value: 8, desc: 'Hot. Found in the Glass Crater. Needs a Mk2 drill.' });
item('cryo_crystal', 'Cryo Crystal', 'resource', 'crystal', '#78faff', '#3c8cb4', { value: 8, desc: 'Grows in the Cryo Spires. Needs a Mk2 drill.' });
item('sulfur', 'Sulfur', 'resource', 'powder', '#ffe246', '#b89a20', { value: 5, desc: 'Vents in the Magma Rift. Needs a Mk2 drill.' });
item('xenite', 'Xenite', 'resource', 'crystal', '#ff3cdc', '#6a1c78', { value: 20, desc: 'Alien lattice from the Acid Marsh. Needs a Mk3 drill.' });
item('biomass', 'Biomass', 'resource', 'biomass', '#9a5ac8', '#5affc8', { value: 1, desc: 'Mutant fungus. Crew food.' });

/* Refined materials */
item('iron_plate', 'Iron Plate', 'material', 'plate', '#a4a8b0', '#6a6e76', { value: 4 });
item('copper_wire', 'Copper Wire', 'material', 'wire', '#e8904a', '#9a5a2a', { value: 2 });
item('titanium_alloy', 'Titanium Alloy', 'material', 'alloy', '#d8e6f8', '#8898b0', { value: 12 });
item('uranium_rod', 'Uranium Rod', 'material', 'rod', '#a8ff5a', '#4a6a3a', { value: 20 });
item('cryo_core', 'Cryo Core', 'material', 'core', '#8af6ff', '#2c6a8a', { value: 20 });
item('circuit', 'Circuit Board', 'material', 'chip', '#2ecc71', '#f1c40f', { value: 6 });
item('xeno_alloy', 'Xeno Alloy', 'material', 'alloy', '#ff6ae6', '#7a2a8a', { value: 45 });
item('explosive', 'Explosive Charge', 'material', 'explosive', '#e84a3a', '#ffe246', { value: 6 });
item('tech_parts', 'Salvaged Tech', 'material', 'tech', '#80d8ff', '#ff6e40', { value: 25, desc: 'Military components from raider tanks, outposts, titans and rune chests. Spent on the Tech Tree.' });

/* Consumables */
item('repair_kit', 'Repair Kit', 'consumable', 'kit', '#e8e8e8', '#ffb300', { value: 8, desc: 'Press 1: restores 25% hull over 3 seconds.' });
item('rations', 'Rations', 'consumable', 'ration', '#8a7a4a', '#d4c48a', { value: 2, desc: 'Crew food. Hiring costs rations; medics use them to revive the injured.' });

/* Drive trains (install from BASE > Chassis & Drive) */
item('drive_wheels', 'Standard Treads', 'drive', 'wheel', '#3a3a3a', '#9aa4ae', { drive: 'wheels', value: 10, desc: 'Fine on hard ground. Bogs in sand, slips on ice.' });
item('drive_tracks', 'Dune Tracks', 'drive', 'track', '#4a4036', '#d6b270', { drive: 'tracks', value: 80, desc: 'Wide tracks that float over sand and dunes.' });
item('drive_chains', 'Spiked Chains', 'drive', 'chain', '#3a3a44', '#c4d6ec', { drive: 'chains', value: 120, desc: 'Studded treads that bite into ice and snow.' });
item('drive_magma', 'Magma Treads', 'drive', 'magtrack', '#3a2a2a', '#ff6e28', { drive: 'magma', value: 250, desc: 'Ceramic treads. Cross lava rivers.' });
item('drive_hover', 'Hover Skirts', 'drive', 'hover', '#2c3440', '#6af0ff', { drive: 'hover', value: 400, desc: 'Ground-effect skirts. Glide over lava and acid.' });

export function getItem(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Unknown item: ${id}`);
  return d;
}

export function hasItem(id: string): boolean {
  return id in ITEMS;
}

export const ALL_ITEMS: readonly ItemDef[] = Object.values(ITEMS);

export const DRIVE_ITEM: Record<DriveKey, string> = {
  wheels: 'drive_wheels', tracks: 'drive_tracks', chains: 'drive_chains', magma: 'drive_magma', hover: 'drive_hover',
};
