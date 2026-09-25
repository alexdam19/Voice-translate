import type { Game } from '../game/game';

/** First-hour guided objectives: short, one at a time, each with a reward. */
export interface Objective {
  title: string;
  hint: string;
  done: (g: Game) => boolean;
  reward: Record<string, number>;
}

const C = (g: Game, k: string): number => g.objectiveCounters[k] ?? 0;

export const OBJECTIVES: Objective[] = [
  { title: 'Harvest a scrap heap', hint: 'Right-click a scrap heap near camp. Your fortress drives over and drills it.', done: (g) => C(g, 'harvest') >= 10, reward: { scrap: 40 } },
  { title: 'Clear some hostiles', hint: 'Right-click an enemy to focus fire. Your guns aim and shoot on their own.', done: (g) => C(g, 'kills') >= 6, reward: { iron_plate: 8 } },
  { title: 'Fire an officer ability', hint: 'Press Q, W, E or R. Each officer has an ability that goes on cooldown.', done: (g) => C(g, 'abilities') >= 1, reward: { repair_kit: 1 } },
  { title: 'Build something on your base', hint: 'Press B (BASE) > Deck. Pick a facility and click a free spot on the deck.', done: (g) => C(g, 'built') >= 1, reward: { scrap: 40 } },
  { title: 'Scavenge a loot area', hint: 'Yellow diamonds on the minimap. Park inside the ring until the timer fills.', done: (g) => C(g, 'sites') >= 1, reward: { circuit: 3 } },
  { title: 'Level up and pick a perk', hint: 'Press C (CREW). Officers with a star can pick one of three perks.', done: (g) => C(g, 'perks') >= 1, reward: { rations: 6 } },
  { title: 'Hire a new crew member', hint: 'CREW > Recruit. Bigger bases hold more people (max 15).', done: (g) => C(g, 'hired') >= 1, reward: { scrap: 60 } },
  { title: 'Claim a rune', hint: 'Colored circles on the minimap. Beat the guardians, park by the altar. Rune Chests can hold champions!', done: (g) => C(g, 'runes') >= 1, reward: { tech_parts: 2 } },
  { title: 'Destroy a raider tank', hint: 'Enemy bases on treads roam beyond camp. Wrecks drop Salvaged Tech for research.', done: (g) => C(g, 'raiders') >= 1, reward: { tech_parts: 2 } },
  { title: 'Research something', hint: 'Press T (TECH TREE). Spend Salvaged Tech to unlock new weapons and upgrades.', done: (g) => C(g, 'research') >= 1, reward: { explosive: 4 } },
  { title: 'Mount a better weapon', hint: 'BASE > Armory. Weapons have rarities: Common, Uncommon, Rare, Epic, Legendary.', done: (g) => C(g, 'mounted') >= 1, reward: { circuit: 4 } },
  { title: 'Take out an outpost', hint: 'Red fort icons on the map. Big loot, a This-or-That chest and a freed prisoner.', done: (g) => C(g, 'outposts') >= 1, reward: { tech_parts: 3 } },
  { title: 'Grow to 15 crew', hint: 'At 15 aboard you can build the Outrider: a mini tank of side crew you can send out for resources.', done: (g) => g.mainCrew().length >= 15, reward: { titanium_alloy: 6 } },
];
