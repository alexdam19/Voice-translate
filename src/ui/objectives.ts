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
  { title: 'Drive with WASD', hint: 'Hold W A S D (or the arrow keys) to drive. Right-click still works to path somewhere.', done: (g) => C(g, 'wasd') >= 1, reward: { scrap: 20 } },
  { title: 'Harvest a scrap heap', hint: 'Right-click a scrap heap near camp. Your fortress drives over and drills it.', done: (g) => C(g, 'harvest') >= 10, reward: { scrap: 40 } },
  { title: 'Clear some hostiles', hint: 'Right-click an enemy to focus fire. Your guns aim and shoot on their own.', done: (g) => C(g, 'kills') >= 6, reward: { iron_plate: 8 } },
  { title: 'Fire an officer ability', hint: 'Press Q, E, F or G, or click an ability at the bottom of the screen.', done: (g) => C(g, 'abilities') >= 1, reward: { repair_kit: 1 } },
  { title: 'Start a research project', hint: 'Press T (RESEARCH). Pick a node and click Start. Try Science Lab or Weapon Forge (INDUSTRY I).', done: (g) => C(g, 'research_started') >= 1 || C(g, 'research') >= 1, reward: { circuit: 4 } },
  { title: 'Build something on your base', hint: 'Press B (BASE) > Deck. Pick a facility and click a free spot on the deck.', done: (g) => C(g, 'built') >= 1, reward: { scrap: 40 } },
  { title: 'Level up and pick a perk', hint: 'When a crew member levels up, click one of the perk cards on the left of the screen.', done: (g) => C(g, 'perks') >= 1, reward: { rations: 6 } },
  { title: 'Scavenge a loot area', hint: 'Yellow diamonds on the minimap. Park inside the ring until the timer fills.', done: (g) => C(g, 'sites') >= 1, reward: { circuit: 3 } },
  { title: 'Upgrade a weapon', hint: 'Press V (ARSENAL): spend a star point in a weapon\'s upgrade tree, or forge it to more stars.', done: (g) => C(g, 'tree') >= 1 || C(g, 'forged') >= 1, reward: { iron_plate: 10 } },
  { title: 'Hire a new crew member', hint: 'CREW > Recruit. Barracks and Living Quarters hold more people (max 15).', done: (g) => C(g, 'hired') >= 1, reward: { scrap: 60 } },
  { title: 'Get an arsenal active', hint: 'Research Rocket Salvo (AVIATION I) or Smoke Launchers (DEFENSE I), build the module, then press 1.', done: (g) => C(g, 'actives') >= 1, reward: { explosive: 6 } },
  { title: 'Claim a rune', hint: 'Colored circles on the minimap. Beat the guardians, park by the altar. Rune Chests can hold champions!', done: (g) => C(g, 'runes') >= 1, reward: { tech_parts: 2 } },
  { title: 'Destroy a raider tank', hint: 'Enemy bases on treads roam beyond camp. Wrecks drop Salvaged Tech for research.', done: (g) => C(g, 'raiders') >= 1, reward: { tech_parts: 2 } },
  { title: 'Level up a facility', hint: 'BASE > Deck: click a facility and press Upgrade. Level 3 facilities are twice as strong.', done: (g) => C(g, 'upgraded') >= 1, reward: { tech_parts: 2 } },
  { title: 'Take out an outpost', hint: 'Red fort icons on the map. Big loot, a This-or-That chest and a freed prisoner.', done: (g) => C(g, 'outposts') >= 1, reward: { tech_parts: 3 } },
  { title: 'Launch an ultimate', hint: 'Deep research (tier V-VI): Nuclear Program, Mech Drop, Meteor Storm... Build its module, charge it, press R.', done: (g) => C(g, 'ultimates') >= 1, reward: { mythic_essence: 2 } },
  { title: 'Grow to 15 crew', hint: 'At 15 aboard you can build the Outrider: a mini tank of side crew you can send out for resources.', done: (g) => g.mainCrew().length >= 15, reward: { titanium_alloy: 6 } },
];
