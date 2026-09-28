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
const z = (id: number, d: Omit<ZoneDef, 'id'>): void => {
  ZONES[id] = { id, ...d };
};
z(ZONE.VERDANT, {
  key: 'verdant', name: 'Verdant Fields', color: '#6fae4a', sky: '#cfe8b0', ground: '#3f5a2a', sun: '#f4ffd8', fog: '#a8c890',
  hazard: null, protect: null, drive: null, resource: 'Food, wood, water',
  desc: 'Farms, forests and abandoned towns on the west side of the Crater. Mutant rabbits, dog packs and raider scouts.', need: 'Nothing. The gentlest ground in the Crater.',
});
z(ZONE.ASH, {
  key: 'ash', name: 'Ash Fields', color: '#8c8a86', sky: '#b8b4ae', ground: '#46443f', sun: '#e0dcd4', fog: '#8e8a84',
  hazard: null, protect: null, drive: null, resource: 'Scrap (thin pickings)',
  desc: 'Impact debris and grey dead ground north of the Divot. Ash cuts how far you see. Blood Eagle raiders camp here.', need: 'Nothing, but keep your eyes open: the ash hides things.',
});
z(ZONE.SCORCHED, {
  key: 'scorched', name: 'Scorched Basin', color: '#d0582a', sky: '#f0a070', ground: '#4a2618', sun: '#ffd0a8', fog: '#a8583a',
  hazard: 'rad', protect: 'rad_baffles', drive: null, resource: 'Uranium, sulfur',
  desc: 'Radiation, mutation and fire south-west of the Divot.', need: 'Rad Baffles, or your crew get sick.',
});
z(ZONE.FROST, {
  key: 'frost', name: 'Frost Ridge', color: '#cfe6f4', sky: '#e4f2ff', ground: '#8aa4b8', sun: '#f4fbff', fog: '#c8dcec',
  hazard: 'cold', protect: 'thermal', drive: 'chains', resource: 'Cryo crystal, water',
  desc: 'Snow and ice across the high north. Northridge shelters under the ridge.', need: 'Spiked Chains for the ice, and a Thermal Regulator against the cold.',
});
z(ZONE.WRAITH, {
  key: 'wraith', name: 'Wraith Peaks', color: '#6a6478', sky: '#a8a4b8', ground: '#34303e', sun: '#dcd8ec', fog: '#77728a',
  hazard: 'cold', protect: 'thermal', drive: 'chains', resource: 'Titanium, relics',
  desc: 'Mountains, cliffs and old ruins in the north-west. Rich, cold and very dangerous.', need: 'Spiked Chains for the slopes and a Thermal Regulator.',
});
z(ZONE.DUNES, {
  key: 'dunes', name: 'Dune Wastes', color: '#d8b070', sky: '#ffdca8', ground: '#8a6a40', sun: '#fff0c8', fog: '#e8c890',
  hazard: null, protect: null, drive: 'tracks', resource: 'Titanium, buried scrap',
  desc: 'Sand, storms and buried ruins across the south. The Mega Hangar stands here.', need: 'Tracks help in the sand.',
});
z(ZONE.LAKE, {
  key: 'lake', name: 'Black Lake', color: '#2e4a5a', sky: '#8aa0a8', ground: '#1e2a2e', sun: '#c8d8dc', fog: '#4a6068',
  hazard: 'toxic', protect: 'sealant', drive: 'hover', resource: 'Oil, xenite',
  desc: 'Toxic water and industrial ruins in the north-east. Iron Hollow trades on the shore.', need: 'Sealant Pumps against the fumes; Hover Skirts to cross the water.',
});
z(ZONE.SPIRES, {
  key: 'spires', name: 'Broken Spires', color: '#b04a6a', sky: '#e09aa8', ground: '#3a1a24', sun: '#ffc8d0', fog: '#8a4a5a',
  hazard: 'heat', protect: 'thermal', drive: 'magma', resource: 'Crystal, sulfur',
  desc: 'Volcanic ground, anomalies and vertical rock in the south-east.', need: 'A Thermal Regulator, and Magma Treads for the lava.',
});
z(ZONE.PASS, {
  key: 'pass', name: "Dead Man's Pass", color: '#a07048', sky: '#e8c0a0', ground: '#5a3a24', sun: '#ffe0c0', fog: '#b08a6a',
  hazard: null, protect: null, drive: null, resource: 'Fuel, scrap',
  desc: 'Roads and canyons east of the Mega Hangar. Raider territory: expect ambushes.', need: 'Guns. Nothing else.',
});
z(ZONE.RUSTBOLT, {
  key: 'rustbolt', name: 'Rustbolt', color: '#b0643c', sky: '#e8b48a', ground: '#5a3a2a', sun: '#ffe0b8', fog: '#c89a78',
  hazard: null, protect: null, drive: null, resource: 'Iron, copper, machine parts',
  desc: 'Industrial sprawl and war machines on the far east rim.', need: 'Heavy armour: the machines hit hard.',
});
z(ZONE.DIVOT, {
  key: 'divot', name: 'The Divot', color: '#5a4a6a', sky: '#a898b0', ground: '#2a2230', sun: '#e0d0e8', fog: '#6a5a78',
  hazard: 'rad', protect: 'rad_baffles', drive: null, resource: 'Everything: the lost city',
  desc: 'The impact centre: a lost city at the bottom of a crater inside the Crater. Radiation, loot and the Crater Guardian.', need: 'Rad Baffles and the strongest ship you can build. Endgame.',
});
z(ZONE.EDGE, {
  key: 'edge', name: 'The Crater Wall', color: '#2a2420', sky: '#806a5a', ground: '#2a2420', sun: '#c8b0a0', fog: '#5a4a40',
  hazard: null, protect: null, drive: null, resource: '-', desc: 'The impassable wall of the Crater.', need: '-',
});

/** The playable zones, in rough order of danger. */
export const PLAY_ZONES: number[] = [ZONE.VERDANT, ZONE.DUNES, ZONE.ASH, ZONE.FROST, ZONE.PASS, ZONE.SCORCHED, ZONE.LAKE, ZONE.RUSTBOLT, ZONE.WRAITH, ZONE.SPIRES, ZONE.DIVOT];

export const DEAD_ZONE: ZoneDef = {
  id: 99, key: 'deadzone', name: 'The Dead Zone', color: '#ff1744', sky: '#a06a6a', ground: '#3a2a2a', sun: '#ffd0c0', fog: '#704848',
  hazard: null, protect: null, drive: null, resource: 'Everything, for a price',
  desc: 'Multiplayer warzone. Die here and other players loot your cargo.', need: 'Nerve.',
};
