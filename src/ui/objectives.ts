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
  { title: 'Drive your fortress', hint: 'Hold W A S D to drive. It rolls right over rocks and ruins. Your guns aim and fire on their own.', done: (g) => C(g, 'wasd') >= 1, reward: { scrap: 20 } },
  { title: 'Destroy 5 enemies', hint: 'Drive toward hostiles. Kills give XP: every commander level unlocks something new.', done: (g) => C(g, 'kills') >= 5, reward: { iron_plate: 6 } },
  { title: 'Play a battle card', hint: 'Drag a card from the bottom of the screen onto the battlefield and let go. Cards cost energy (the purple bar).', done: (g) => C(g, 'cards') >= 1, reward: { scrap: 30 } },
  { title: 'Build something in your base', hint: 'Press B (or the BASE button). Tap SHOP, pick a building and tap an empty spot on your fortress.', done: (g) => C(g, 'placed') >= 1, reward: { scrap: 40 } },
  { title: 'Drill a resource node', hint: 'Park your fortress on or next to a scrap heap or ore deposit. It drills by itself.', done: (g) => C(g, 'harvest') >= 10, reward: { iron_plate: 8 } },
  { title: 'Reach commander level 2', hint: 'Keep fighting. The XP bar is at the top left. Click it to see the Level Road.', done: (g) => g.commander.level >= 2, reward: { copper_wire: 8 } },
  { title: 'Open a card pack', hint: 'Elites, raider tanks and outposts drop card packs. Click the PACKS button above your hand to open one.', done: (g) => C(g, 'packs') >= 1, reward: { scrap: 40 } },
  { title: 'Track an upgrade', hint: 'In BASE, tap a building and press TRACK. A box shows what you still need and a marker points to where to get it.', done: (g) => C(g, 'tracked') >= 1, reward: { circuit: 3 } },
  { title: 'Upgrade a building', hint: 'In BASE, tap a building and press UPGRADE. A builder works on it while you play.', done: (g) => C(g, 'upgrade_started') >= 1, reward: { iron_plate: 10 } },
  { title: 'Scavenge a loot area', hint: 'Yellow diamonds on the minimap. Park inside the ring until the timer fills.', done: (g) => C(g, 'sites') >= 1, reward: { circuit: 3 } },
  { title: 'Send a squad to guard', hint: 'Build a Barracks (level 3). Then drag the squad badge (bottom right) onto the map.', done: (g) => C(g, 'squad_guard') >= 1, reward: { rations: 6 } },
  { title: 'Level up a card', hint: 'Duplicate cards from packs level them up. Open CARDS (C) and press UPGRADE on a card.', done: (g) => C(g, 'card_up') >= 1, reward: { scrap: 60 } },
  { title: 'Destroy a raider tank', hint: 'Enemy fortresses roam beyond camp. They always drop a card pack.', done: (g) => C(g, 'raiders') >= 1, reward: { tech_parts: 2 } },
  { title: 'Upgrade the Command Center', hint: 'Needs commander level 3. It grows your whole fortress and lets you build more.', done: (g) => g.player.stats.cc >= 2, reward: { tech_parts: 3 } },
  { title: 'Send a squad scavenging', hint: 'Build a Garage (level 5) for Scout Buggies, then tap SCAVENGE on their badge.', done: (g) => C(g, 'squad_scavenge') >= 1, reward: { titanium_alloy: 4 } },
  { title: 'Claim a rune', hint: 'Colored circles on the minimap. Beat the guardians, park by the altar. Rune Chests can hold champions!', done: (g) => C(g, 'runes') >= 1, reward: { tech_parts: 2 } },
  { title: 'Take out an outpost', hint: 'Red fort icons on the map. Big loot, a card pack and a freed prisoner.', done: (g) => C(g, 'outposts') >= 1, reward: { tech_parts: 3 } },
];
