import { mergeStacks, type Stack } from './inventory';
import { rollRarity, type Rarity } from './rarity';
import { STANDARD_WEAPONS, type WeaponDef } from './weapons';

interface LootEntry {
  id: string;
  min: number;
  max: number;
  w: number;
}

const L = (id: string, min: number, max: number, w: number): LootEntry => ({ id, min, max, w });

const COMMON: LootEntry[] = [L('scrap', 10, 28, 10), L('iron_plate', 2, 6, 4), L('copper_wire', 2, 8, 4), L('rations', 1, 3, 3), L('repair_kit', 1, 1, 1.5)];

export const LOOT_TABLES: Record<string, LootEntry[]> = {
  site_ruins: [...COMMON, L('circuit', 1, 3, 3), L('iron_ore', 6, 14, 4), L('copper_ore', 6, 14, 3), L('explosive', 1, 3, 2)],
  site_convoy: [...COMMON, L('titanium_ore', 4, 10, 5), L('circuit', 1, 4, 3), L('titanium_alloy', 1, 3, 2), L('explosive', 2, 4, 2)],
  site_bunker: [...COMMON, L('cryo_crystal', 4, 10, 5), L('titanium_alloy', 1, 3, 3), L('circuit', 2, 5, 3), L('cryo_core', 1, 2, 1)],
  site_crash: [...COMMON, L('uranium_ore', 4, 10, 5), L('titanium_alloy', 1, 3, 3), L('circuit', 2, 5, 3), L('uranium_rod', 1, 2, 1)],
  site_foundry: [...COMMON, L('sulfur', 6, 14, 5), L('explosive', 3, 6, 3), L('titanium_alloy', 2, 4, 2), L('cryo_core', 1, 2, 1)],
  site_hive: [...COMMON, L('xenite', 3, 7, 5), L('biomass', 6, 14, 4), L('uranium_rod', 1, 2, 2), L('xeno_alloy', 1, 2, 1)],
  creature: [L('scrap', 2, 6, 10), L('biomass', 1, 2, 4)],
  swarm: [L('scrap', 1, 4, 10), L('biomass', 1, 1, 3), L('iron_ore', 1, 3, 2)],
  trooper: [L('scrap', 3, 8, 10), L('rations', 1, 1, 2), L('circuit', 1, 1, 1), L('explosive', 1, 1, 1)],
  elite: [L('tech_parts', 1, 1, 5), L('scrap', 10, 20, 6), L('circuit', 1, 3, 4), L('repair_kit', 1, 1, 2)],
  raider: [L('scrap', 20, 45, 10), L('iron_plate', 4, 10, 6), L('circuit', 1, 4, 5), L('copper_wire', 4, 10, 4), L('explosive', 1, 3, 3), L('repair_kit', 1, 2, 2), L('titanium_alloy', 1, 3, 2)],
  outpost: [L('mythic_essence', 1, 1, 0.6), L('tech_parts', 2, 4, 6), L('titanium_alloy', 3, 8, 6), L('circuit', 3, 8, 6), L('explosive', 3, 8, 4), L('uranium_rod', 1, 3, 2), L('cryo_core', 1, 3, 2), L('repair_kit', 1, 3, 3)],
  titan: [L('mythic_essence', 1, 2, 3), L('tech_parts', 3, 6, 10), L('titanium_alloy', 4, 10, 6), L('uranium_rod', 2, 4, 4), L('cryo_core', 2, 4, 4), L('xenite', 3, 8, 4), L('xeno_alloy', 1, 3, 2), L('repair_kit', 2, 4, 3)],
  rune: [L('mythic_essence', 1, 1, 2.5), L('tech_parts', 2, 4, 8), L('titanium_alloy', 3, 8, 5), L('uranium_rod', 1, 3, 3), L('cryo_core', 1, 3, 3), L('xeno_alloy', 1, 2, 2), L('circuit', 3, 8, 4)],
  dz_crate: [L('scrap', 20, 50, 8), L('titanium_alloy', 2, 5, 5), L('circuit', 2, 6, 5), L('uranium_rod', 1, 2, 3), L('cryo_core', 1, 2, 3), L('xenite', 2, 5, 3), L('tech_parts', 1, 2, 4), L('repair_kit', 1, 2, 3)],
  dz_supply: [L('mythic_essence', 1, 2, 3), L('tech_parts', 3, 6, 6), L('xeno_alloy', 1, 3, 4), L('uranium_rod', 2, 4, 4), L('cryo_core', 2, 4, 4), L('titanium_alloy', 4, 10, 5)],
};

export function rollLoot(table: string, rng: () => number, rolls: number): Stack[] {
  const entries = LOOT_TABLES[table] ?? LOOT_TABLES.site_ruins;
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

const SIZE_WEIGHT: Record<string, number> = { light: 5, medium: 3, heavy: 1.6 };

/** Picks a random standard (non-exclusive) weapon; bigger guns and arcane gear are rarer. */
export function rollWeaponKey(rng: () => number, filter?: (d: WeaponDef) => boolean): string {
  const pool = STANDARD_WEAPONS.filter((d) => !filter || filter(d));
  const weight = (d: WeaponDef): number => SIZE_WEIGHT[d.size] * (d.family === 'arcane' ? 0.45 : 1) * (d.jets ? 0.6 : 1);
  const total = pool.reduce((s, d) => s + weight(d), 0);
  let pick = rng() * total;
  for (const d of pool) {
    pick -= weight(d);
    if (pick <= 0) return d.key;
  }
  return pool[0].key;
}

/** Luck for rarity rolls from threat: deeper = better drops. */
export function threatLuck(threat: number): number {
  return Math.max(0, (threat - 1) * 0.28);
}

export function rollDropRarity(rng: () => number, threat: number, bonus = 0, min: Rarity = 0): Rarity {
  return rollRarity(rng, threatLuck(threat) + bonus, min);
}
