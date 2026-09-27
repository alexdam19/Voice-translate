import { MODULE_LIST, type ModuleDef } from './defs';
import { TECH, type TechNode } from './tech';

/**
 * The Commander Level Road. You earn XP by killing enemies, clearing outposts, loot areas and runes.
 * Every level up gives an upgrade you can only get this way (+hull, +weapon damage), a card pack,
 * and unlocks: new buildings, weapons, weapon-family upgrades, crew upgrades and new features.
 * The deeper the reward sits on the road, the stronger it is.
 */

export const MAX_COMMANDER_LEVEL = 30;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number): number => Math.round(40 * Math.pow(level, 1.5));

export type FeatureKey = 'cards' | 'packs' | 'crew' | 'squads' | 'arsenal' | 'relics' | 'outrider' | 'deadzone' | 'tracks' | 'chains' | 'magma' | 'hover' | 'rivals';

export interface FeatureDef {
  key: FeatureKey;
  level: number;
  name: string;
  desc: string;
}

/** Game features switch on one at a time so there's never too much to learn at once. */
export const FEATURES: FeatureDef[] = [
  { key: 'cards', level: 1, name: 'Battle Cards', desc: 'Drag a card from your hand onto the battlefield to play it. Cards cost energy, which refills over time.' },
  { key: 'packs', level: 2, name: 'Card Collection', desc: 'Card Packs drop from elites, raider tanks, outposts and titans. Open CARDS (C) to build your deck of 8.' },
  { key: 'crew', level: 2, name: 'Crew', desc: 'Open CREW (K) to hire people. Each role gives a passive bonus, and they level up and pick perks.' },
  { key: 'tracks', level: 3, name: 'Dune Tracks', desc: 'A drive train for sand and dunes. AUTO swaps it on when the ground calls for it (tap the drive chip by your hull bar).' },
  { key: 'squads', level: 3, name: 'Squads', desc: 'Build a Barracks: it trains a Marine squad. Drag its badge onto the map to guard a spot. At level 5 the Garage adds Scout Buggies that scavenge ahead.' },
  { key: 'arsenal', level: 4, name: 'Arsenal', desc: 'Mount looted weapons on your turrets and spend star points in their upgrade trees (ARSENAL, V). A Weapon Forge (level 6) adds stars.' },
  { key: 'chains', level: 5, name: 'Spiked Chains', desc: 'A drive train for ice and snow.' },
  { key: 'relics', level: 6, name: 'Relics', desc: 'Relic cards are permanent: slot them in CARDS > Relics for always-on bonuses.' },
  { key: 'magma', level: 8, name: 'Magma Treads', desc: 'Cross lava without burning.' },
  { key: 'rivals', level: 6, name: 'Rival Dreadnoughts', desc: 'Enemy fortresses as big as yours now roam the wastes. Beat one for an Epic pack, Salvaged Tech and one of its guns.' },
  { key: 'deadzone', level: 8, name: 'The Dead Zone', desc: 'The multiplayer warzone north-east of camp is open. What you carry in there is at risk.' },
  { key: 'hover', level: 12, name: 'Hover Skirts', desc: 'Glide over everything, even acid.' },
  { key: 'outrider', level: 12, name: 'Outrider', desc: 'Your Garage can build the Outrider mini tank (needs 15 crew aboard).' },
];

export const featureLevel = (k: FeatureKey): number => FEATURES.find((f) => f.key === k)?.level ?? 1;

export interface LevelReward {
  level: number;
  techs: TechNode[];
  modules: ModuleDef[];
  features: FeatureDef[];
  /** Card pack for reaching this level. */
  pack: 'pack' | 'rare_pack' | 'epic_pack' | 'legendary_pack';
  relicSlot: boolean;
  builder: boolean;
}

/** Tech node id -> commander level it arrives at. Deeper tiers come later. */
const TECH_LEVEL = new Map<string, number>();
(() => {
  const nodes = TECH.filter((t) => !t.free).slice().sort((a, b) => a.tier - b.tier || (a.tree === b.tree ? 0 : a.tree === 'military' ? -1 : 1));
  const span = MAX_COMMANDER_LEVEL - 1;
  nodes.forEach((n, i) => TECH_LEVEL.set(n.id, 2 + Math.floor((i * span) / nodes.length)));
})();

export const techLevel = (id: string): number => TECH_LEVEL.get(id) ?? 1;

export const relicSlots = (level: number): number => (level >= 6 ? 1 : 0) + (level >= 14 ? 1 : 0) + (level >= 22 ? 1 : 0);
export const builderCount = (level: number): number => 2 + (level >= 10 ? 1 : 0) + (level >= 20 ? 1 : 0);

/** Upgrades that only XP gives. */
export function levelBonus(level: number): { hp: number; dmg: number } {
  return { hp: 0.03 * (level - 1), dmg: 0.02 * (level - 1) };
}

let road: LevelReward[] | null = null;

export function levelRoad(): LevelReward[] {
  if (road) return road;
  road = [];
  for (let level = 1; level <= MAX_COMMANDER_LEVEL; level++) {
    road.push({
      level,
      techs: TECH.filter((t) => !t.free && techLevel(t.id) === level),
      modules: MODULE_LIST.filter((m) => (m.unlock ?? 1) === level && !m.required && !m.fixed),
      features: FEATURES.filter((f) => f.level === level),
      pack: level % 10 === 0 ? 'legendary_pack' : level % 5 === 0 ? 'epic_pack' : level % 3 === 0 ? 'rare_pack' : 'pack',
      relicSlot: relicSlots(level) > relicSlots(level - 1),
      builder: builderCount(level) > builderCount(level - 1),
    });
  }
  return road;
}

/** Every tech node earned by a commander level. */
export function techsForLevel(level: number): string[] {
  return TECH.filter((t) => t.free || techLevel(t.id) <= level).map((t) => t.id);
}
