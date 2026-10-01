import { CARDS, MAX_CARD_LEVEL } from './cards';
import { DEV } from './devFlag';
import type { Game } from './game';
import { MAX_COMMANDER_LEVEL, techsForLevel } from './progress';
import { DRIVES } from './systems/drives';
import { ENGINES } from './systems/engine';

export { DEV, DEV_BUILD_SPEED } from './devFlag';

/** Stock shown in the hold (payments are free anyway). */
const STOCK = ['scrap', 'iron_plate', 'copper_wire', 'circuit', 'titanium_alloy', 'tech_parts', 'rations', 'repair_kit'];

/**
 * Unlocks everything in a game (new or loaded) when this is the dev build: the commander at the top of the Level Road
 * with every tech it brings, every card at its highest level, every engine and drive train owned, a full hold.
 */
export function applyDev(g: Game): void {
  if (!DEV) return;
  const c = g.commander;
  for (let l = 2; l <= MAX_COMMANDER_LEVEL; l++) for (const id of techsForLevel(l)) g.tech.add(id);
  c.level = MAX_COMMANDER_LEVEL;
  c.xp = 0;
  for (const id of Object.keys(CARDS)) g.cards[id] = { level: MAX_CARD_LEVEL, shards: g.cards[id]?.shards ?? 0 };
  for (const k of DRIVES) g.drivesOwned.add(k);
  g.player.enginesOwned = ENGINES.map((e) => e.key);
  for (const id of STOCK) if (g.player.cargo.count(id) < 500) g.give(id, 500 - g.player.cargo.count(id), true);
  g.applyCrew();
}
