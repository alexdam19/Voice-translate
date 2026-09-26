import type { Cost } from '../shared/inventory';
import type { Rarity } from '../shared/rarity';
import { WEAPONS, type WeaponItem } from '../shared/weapons';
import { techLevel } from './progress';
import { forgeCap } from './tech';

/* ---------------------------------------------------------------------- */
/* Forge: raising weapons to more stars                                    */
/* ---------------------------------------------------------------------- */

/** Forge time (seconds) to reach a star level, indexed by the new rarity (1 = 2★ ... 5 = 6★). */
export const STAR_TIME = [0, 20, 45, 90, 180, 360];

const STAR_COST: Cost[] = [
  {},
  { scrap: 40, iron_plate: 8 },
  { titanium_alloy: 6, circuit: 6, tech_parts: 2 },
  { titanium_alloy: 12, uranium_rod: 3, tech_parts: 5 },
  { xeno_alloy: 4, cryo_core: 4, tech_parts: 10 },
  { xeno_alloy: 10, mythic_essence: 3, tech_parts: 20 },
];

/** Cost to forge a weapon up to rarity `to`. Heavy weapons cost more. */
export function starCost(w: WeaponItem, to: number): Cost {
  const base = STAR_COST[to] ?? {};
  const size = WEAPONS[w.key]?.size;
  const f = size === 'heavy' ? 1.5 : size === 'medium' ? 1.2 : 1;
  const out: Cost = {};
  for (const [k, n] of Object.entries(base)) out[k] = k === 'mythic_essence' ? n : Math.ceil(n * f);
  return out;
}

/** Why a weapon can't be forged to the next star, or null if it can. */
export function starBlock(w: WeaponItem, tech: Set<string>, hasForge: boolean): string | null {
  if (w.rarity >= 5) return 'Already 6★ Mythic: as strong as it gets.';
  if (!hasForge) return 'Build a Weapon Forge in your base (BASE > Shop > Workshops & Labs).';
  const next = w.rarity + 2;
  const cap = forgeCap(tech);
  if (next > cap) {
    const node = next === 4 ? 'forge_mastery' : next === 5 ? 'legendary_forging' : 'mythic_forging';
    return `Reach commander level ${techLevel(node)} to forge ${next}★ weapons.`;
  }
  return null;
}

export const nextRarity = (w: WeaponItem): Rarity => Math.min(5, w.rarity + 1) as Rarity;

/** Scrap value of a weapon: better weapons give back more, including essence for 5★+. */
export function scrapValue(rarity: number): Record<string, number> {
  const out: Record<string, number> = { scrap: 12 * (rarity + 1) * (rarity + 1) };
  if (rarity >= 2) out.tech_parts = rarity - 1;
  if (rarity >= 4) out.mythic_essence = rarity - 3;
  return out;
}
