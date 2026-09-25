import type { Cost } from '../shared/inventory';

export type Station = 'hand' | 'fabricator' | 'refinery' | 'armory' | 'garage';

export interface Recipe {
  out: string;
  n: number;
  station: Station;
  cost: Cost;
}

export const STATION_NAMES: Record<Station, string> = {
  hand: 'By hand',
  fabricator: 'Fabricator',
  refinery: 'Refinery',
  armory: 'Armory',
  garage: 'Drive Workshop',
};

const R = (out: string, n: number, station: Station, cost: Cost): Recipe => ({ out, n, station, cost });

export const RECIPES: Recipe[] = [
  // By hand
  R('platform', 4, 'hand', { scrap: 1 }),
  R('lamp', 2, 'hand', { scrap: 2, copper_ore: 1 }),
  R('rations', 1, 'hand', { biomass: 2 }),
  R('medkit', 1, 'hand', { biomass: 3, scrap: 2 }),
  R('metal_plate', 2, 'hand', { iron_plate: 1 }),
  R('neon', 4, 'hand', { glass: 1, copper_wire: 1 }),

  // Refinery
  R('iron_plate', 1, 'refinery', { iron_ore: 2 }),
  R('copper_wire', 2, 'refinery', { copper_ore: 1 }),
  R('titanium_alloy', 1, 'refinery', { titanium_ore: 2, iron_plate: 1 }),
  R('uranium_rod', 1, 'refinery', { uranium_ore: 3 }),
  R('cryo_core', 1, 'refinery', { cryo_crystal: 2, copper_wire: 2 }),
  R('xeno_alloy', 1, 'refinery', { xenite: 2, titanium_alloy: 1 }),
  R('glass', 1, 'refinery', { sand: 2 }),
  R('concrete', 2, 'refinery', { rock: 2 }),
  R('iron_plate', 1, 'refinery', { scrap: 4 }),

  // Fabricator
  R('circuit', 1, 'fabricator', { copper_wire: 2, scrap: 1 }),
  R('rounds', 30, 'fabricator', { scrap: 2 }),
  R('explosive', 2, 'fabricator', { sulfur: 2, scrap: 1 }),
  R('rockets', 4, 'fabricator', { explosive: 1, iron_plate: 1 }),
  R('stim', 1, 'fabricator', { biomass: 2, cryo_crystal: 1 }),
  R('cutter2', 1, 'fabricator', { titanium_alloy: 6, circuit: 3 }),
  R('cutter3', 1, 'fabricator', { uranium_rod: 3, cryo_core: 2, titanium_alloy: 6 }),
  R('jetpack1', 1, 'fabricator', { iron_plate: 6, circuit: 3, copper_wire: 4 }),
  R('jetpack2', 1, 'fabricator', { titanium_alloy: 6, cryo_core: 2, uranium_rod: 1 }),

  // Armory
  R('scrap_smg', 1, 'armory', { iron_plate: 8, circuit: 2 }),
  R('scattergun', 1, 'armory', { iron_plate: 10, copper_wire: 4 }),
  R('shock_baton', 1, 'armory', { iron_plate: 4, copper_wire: 6 }),
  R('grenade', 3, 'armory', { explosive: 1, scrap: 1 }),
  R('arc_rifle', 1, 'armory', { titanium_alloy: 6, circuit: 4, cryo_core: 1 }),
  R('rocket_tube', 1, 'armory', { titanium_alloy: 8, circuit: 3, explosive: 4 }),
  R('rail_lance', 1, 'armory', { xeno_alloy: 4, uranium_rod: 2, circuit: 6 }),
  R('scav_jacket', 1, 'armory', { scrap: 10, biomass: 4 }),
  R('rad_suit', 1, 'armory', { titanium_alloy: 4, iron_plate: 4, glass: 6 }),
  R('thermal_suit', 1, 'armory', { cryo_core: 2, titanium_alloy: 4, copper_wire: 8 }),
  R('hazmat_suit', 1, 'armory', { titanium_alloy: 6, uranium_rod: 1, glass: 6, biomass: 6 }),
  R('warborn_exo', 1, 'armory', { xeno_alloy: 10, uranium_rod: 4, cryo_core: 4, circuit: 8 }),

  // Drive Workshop
  R('drive_tracks', 1, 'garage', { iron_plate: 20, copper_wire: 10, scrap: 30 }),
  R('drive_chains', 1, 'garage', { titanium_alloy: 12, iron_plate: 20, circuit: 4 }),
  R('drive_magma', 1, 'garage', { titanium_alloy: 20, cryo_core: 6, circuit: 6 }),
  R('drive_hover', 1, 'garage', { uranium_rod: 8, cryo_core: 8, titanium_alloy: 20, circuit: 12 }),
  R('drive_wheels', 1, 'garage', { scrap: 20, iron_plate: 4 }),
];
