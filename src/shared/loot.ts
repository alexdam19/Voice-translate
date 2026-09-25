import { mergeStacks, type Stack } from './inventory';

interface LootEntry {
  id: string;
  min: number;
  max: number;
  w: number;
}

const L = (id: string, min: number, max: number, w: number): LootEntry => ({ id, min, max, w });

const COMMON: LootEntry[] = [L('scrap', 6, 20, 10), L('rounds', 20, 60, 6), L('rations', 1, 3, 4), L('medkit', 1, 2, 2), L('iron_plate', 2, 6, 4), L('copper_wire', 2, 8, 4)];

export const LOOT_TABLES: Record<string, LootEntry[]> = {
  cache_rustbelt: [...COMMON, L('circuit', 1, 3, 3), L('iron_ore', 4, 10, 4), L('scrap_smg', 1, 1, 0.4), L('jetpack1', 1, 1, 0.25), L('grenade', 1, 3, 1)],
  cache_dunes: [...COMMON, L('titanium_ore', 3, 8, 5), L('circuit', 1, 4, 3), L('scattergun', 1, 1, 0.4), L('glass', 4, 10, 2), L('grenade', 1, 3, 1)],
  cache_glass: [...COMMON, L('uranium_ore', 3, 8, 5), L('titanium_alloy', 1, 3, 3), L('rad_suit', 1, 1, 0.35), L('arc_rifle', 1, 1, 0.25), L('circuit', 2, 5, 3)],
  cache_cryo: [...COMMON, L('cryo_crystal', 3, 8, 5), L('titanium_alloy', 1, 3, 3), L('stim', 1, 2, 2), L('thermal_suit', 1, 1, 0.25), L('circuit', 2, 5, 3)],
  cache_magma: [...COMMON, L('sulfur', 4, 12, 5), L('explosive', 2, 5, 3), L('rockets', 3, 8, 2), L('rocket_tube', 1, 1, 0.25), L('cryo_core', 1, 2, 1)],
  cache_acid: [...COMMON, L('xenite', 2, 5, 5), L('uranium_rod', 1, 2, 2), L('hazmat_suit', 1, 1, 0.3), L('rail_lance', 1, 1, 0.2), L('xeno_alloy', 1, 2, 1)],
  wreck: [L('scrap', 15, 40, 10), L('iron_plate', 4, 10, 6), L('circuit', 1, 4, 5), L('copper_wire', 4, 10, 4), L('rounds', 30, 80, 5), L('medkit', 1, 2, 2), L('explosive', 1, 3, 2)],
  wreck_rare: [L('titanium_alloy', 2, 6, 5), L('uranium_rod', 1, 3, 2), L('cryo_core', 1, 3, 2), L('scattergun', 1, 1, 1), L('arc_rifle', 1, 1, 0.6), L('rocket_tube', 1, 1, 0.3), L('jetpack1', 1, 1, 0.6)],
  creature: [L('scrap', 1, 4, 10), L('biomass', 1, 2, 6), L('rounds', 4, 12, 4)],
  trooper: [L('scrap', 2, 6, 8), L('rounds', 8, 24, 8), L('medkit', 1, 1, 1.5), L('grenade', 1, 1, 1), L('circuit', 1, 1, 1.5)],
  supply_drop: [L('titanium_alloy', 3, 8, 6), L('uranium_rod', 1, 3, 4), L('cryo_core', 1, 3, 4), L('xenite', 2, 6, 4), L('xeno_alloy', 1, 3, 2), L('arc_rifle', 1, 1, 1.2), L('rail_lance', 1, 1, 0.6), L('rocket_tube', 1, 1, 0.8), L('warborn_exo', 1, 1, 0.25), L('jetpack2', 1, 1, 0.5), L('medkit', 2, 4, 3), L('stim', 1, 3, 3)],
  deadzone_scav: [L('scrap', 6, 18, 8), L('rounds', 20, 60, 8), L('titanium_alloy', 1, 3, 3), L('circuit', 1, 3, 4), L('medkit', 1, 2, 3), L('uranium_ore', 2, 5, 2), L('cryo_crystal', 2, 5, 2), L('scattergun', 1, 1, 0.5), L('scrap_smg', 1, 1, 0.7)],
};

export function rollLoot(table: string, rng: () => number, rolls: number): Stack[] {
  const entries = LOOT_TABLES[table] ?? LOOT_TABLES.cache_rustbelt;
  const total = entries.reduce((s, e) => s + e.w, 0);
  const out: Stack[] = [];
  for (let r = 0; r < rolls; r++) {
    let pick = rng() * total;
    for (const e of entries) {
      pick -= e.w;
      if (pick <= 0) {
        out.push({ id: e.id, n: e.min + Math.floor(rng() * (e.max - e.min + 1)) });
        break;
      }
    }
  }
  return mergeStacks(out);
}
