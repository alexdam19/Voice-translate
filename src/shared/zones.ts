import { ZONE } from './map';
import type { DriveKey, Hazard } from './types';

export interface ZoneDef {
  id: number;
  key: string;
  name: string;
  /** Minimap / UI color. */
  color: string;
  /** Scene lighting. */
  sky: string;
  ground: string;
  sun: string;
  fog: string;
  hazard: Hazard | null;
  /** Deck module that protects against the hazard. */
  protect: string | null;
  /** Drive that handles the zone's terrain well. */
  drive: DriveKey | null;
  resource: string;
  desc: string;
  /** Short "what you need" line shown on the map and on entry. */
  need: string;
}

export const ZONES: ZoneDef[] = [];
ZONES[ZONE.RUSTBELT] = {
  id: ZONE.RUSTBELT, key: 'rustbelt', name: 'The Rustbelt', color: '#b0643c', sky: '#e8b48a', ground: '#5a3a2a', sun: '#ffe0b8', fog: '#c89a78',
  hazard: null, protect: null, drive: null, resource: 'Scrap, iron, copper',
  desc: 'Collapsed industrial sprawl around your camp. Scav gangs and scrap rats.', need: 'Nothing. Home turf.',
};
ZONES[ZONE.DUNES] = {
  id: ZONE.DUNES, key: 'dunes', name: 'The Dune Sea', color: '#e0b060', sky: '#ffd8a0', ground: '#8a6a40', sun: '#fff0c8', fog: '#e8c890',
  hazard: null, protect: null, drive: 'tracks', resource: 'Titanium',
  desc: 'Endless sand to the east. Stalkers burrow under the dunes.', need: 'Dune Tracks, or you crawl through the sand.',
};
ZONES[ZONE.CRYO] = {
  id: ZONE.CRYO, key: 'cryo', name: 'The Cryo Spires', color: '#9ad8f8', sky: '#d0ecff', ground: '#6a88a0', sun: '#e8f6ff', fog: '#b8d8f0',
  hazard: 'cold', protect: 'thermal', drive: 'chains', resource: 'Cryo crystal',
  desc: 'A frozen forest of ice spires to the north.', need: 'Spiked Chains for the ice, and a Thermal Regulator against the cold.',
};
ZONES[ZONE.GLASS] = {
  id: ZONE.GLASS, key: 'glass', name: 'The Glass Crater', color: '#78d060', sky: '#c8f0a0', ground: '#3a5a30', sun: '#e8ffc8', fog: '#9ac880',
  hazard: 'rad', protect: 'rad_baffles', drive: null, resource: 'Uranium',
  desc: 'A radioactive bomb crater to the south, fused into green glass.', need: 'Rad Baffles, or your crew get sick.',
};
ZONES[ZONE.MAGMA] = {
  id: ZONE.MAGMA, key: 'magma', name: 'The Magma Rift', color: '#ff6a28', sky: '#ff9a68', ground: '#3a2020', sun: '#ffc098', fog: '#8a4a38',
  hazard: 'heat', protect: 'thermal', drive: 'magma', resource: 'Sulfur',
  desc: 'Rivers of lava to the west. Bridges cross the worst of them.', need: 'A Thermal Regulator, and Magma Treads to cross lava.',
};
ZONES[ZONE.ACID] = {
  id: ZONE.ACID, key: 'acid', name: 'The Acid Marsh', color: '#8aff4a', sky: '#b0e090', ground: '#2a3a20', sun: '#d8ffb0', fog: '#6a8a50',
  hazard: 'toxic', protect: 'sealant', drive: 'hover', resource: 'Xenite',
  desc: 'The outer ring: an acid swamp full of alien things. Endgame.', need: 'Hover Skirts to cross acid, and Sealant Pumps against the fumes.',
};
ZONES[ZONE.EDGE] = {
  id: ZONE.EDGE, key: 'edge', name: 'The Wall', color: '#2a2420', sky: '#806a5a', ground: '#2a2420', sun: '#c8b0a0', fog: '#5a4a40',
  hazard: null, protect: null, drive: null, resource: '-', desc: 'Impassable mountains at the end of the world.', need: '-',
};

export const DEAD_ZONE: ZoneDef = {
  id: 99, key: 'deadzone', name: 'The Dead Zone', color: '#ff1744', sky: '#a06a6a', ground: '#3a2a2a', sun: '#ffd0c0', fog: '#704848',
  hazard: null, protect: null, drive: null, resource: 'Everything, for a price',
  desc: 'Multiplayer warzone. Die here and other players loot your cargo.', need: 'Nerve.',
};
