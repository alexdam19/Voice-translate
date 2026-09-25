/** Loot rarity tiers shared by weapons, perks, crew and chests. Stronger things are rarer. */
export type Rarity = 0 | 1 | 2 | 3 | 4;

export interface RarityDef {
  key: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  name: string;
  color: string;
  /** Stat multiplier applied to weapons with this rarity. */
  mult: number;
  /** Base drop weight. */
  weight: number;
}

export const RARITIES: RarityDef[] = [
  { key: 'common', name: 'Common', color: '#b8c0c8', mult: 1, weight: 58 },
  { key: 'uncommon', name: 'Uncommon', color: '#5ee06a', mult: 1.15, weight: 27 },
  { key: 'rare', name: 'Rare', color: '#45a6ff', mult: 1.32, weight: 10.5 },
  { key: 'epic', name: 'Epic', color: '#c45cff', mult: 1.52, weight: 3.6 },
  { key: 'legendary', name: 'Legendary', color: '#ffa726', mult: 1.8, weight: 0.9 },
];

export const rarityName = (r: Rarity): string => RARITIES[r].name;
export const rarityColor = (r: Rarity): string => RARITIES[r].color;

export function clampRarity(n: number): Rarity {
  return Math.max(0, Math.min(4, Math.round(n))) as Rarity;
}

/**
 * Rolls a rarity. `luck` (0 = normal) multiplies each tier's weight by (1+luck)^tier,
 * so higher luck shifts drops toward rarer tiers.
 */
export function rollRarity(rng: () => number, luck = 0, min: Rarity = 0, max: Rarity = 4): Rarity {
  let total = 0;
  const w: number[] = [];
  for (let i = min; i <= max; i++) {
    const v = RARITIES[i].weight * Math.pow(1 + Math.max(0, luck), i);
    w.push(v);
    total += v;
  }
  let pick = rng() * total;
  for (let i = 0; i < w.length; i++) {
    pick -= w[i];
    if (pick <= 0) return (min + i) as Rarity;
  }
  return max;
}
