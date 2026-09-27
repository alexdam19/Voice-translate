import { finishNow, placeBuilding } from '../src/game/actions';
import { chassisForCC, MODULES } from '../src/game/defs';
import { Game } from '../src/game/game';
import { techsForLevel } from '../src/game/progress';
import { installHandlers } from '../src/game/systems/step';

export function game(seed = 91): Game {
  const g = new Game(seed);
  installHandlers(g);
  g.revealAll = true;
  return g;
}

export function rich(g: Game): void {
  for (const id of ['scrap', 'iron_plate', 'circuit', 'titanium_alloy', 'explosive', 'tech_parts', 'uranium_rod', 'cryo_core', 'xeno_alloy', 'copper_wire', 'sulfur', 'mythic_essence', 'xenite', 'rations', 'biomass']) {
    g.player.cargo.add(id, 400);
  }
}

/** Jumps the commander to a level (and everything it unlocks). */
export function levelTo(g: Game, level: number): void {
  g.commander.level = level;
  for (const id of techsForLevel(level)) g.tech.add(id);
  g.applyCrew();
}

/** Sets the Command Center level directly (and the hull that goes with it). */
export function ccTo(g: Game, cc: number): void {
  const b = g.player.modules.find((m) => m.key === 'bridge')!;
  b.lvl = cc;
  g.player.setChassis(chassisForCC(cc).key);
  g.syncHull();
}

/** Builds a finished building wherever it fits (raising levels as needed). Returns its id. */
export function build(g: Game, key: string): number {
  const d = MODULES[key];
  if ((d.unlock ?? 1) > g.commander.level) levelTo(g, d.unlock ?? 1);
  if (g.player.stats.cc < 6) ccTo(g, 6);
  rich(g);
  const s = g.player.findSpot(key);
  if (!s) throw new Error(`no room for ${key}`);
  const r = placeBuilding(g, key, s[0], s[1]);
  if (!r.ok) throw new Error(r.msg);
  const m = g.player.modules[g.player.modules.length - 1];
  finishNow(g, m.id);
  return m.id;
}
