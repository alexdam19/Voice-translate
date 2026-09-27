import { MODULES } from '../defs';
import type { Game } from '../game';
import type { ModuleInst } from '../tank';

/**
 * Troops: the people who man your guns (one each, two on the heavies) and fight from the roof nests.
 * Bunks (Command Tower, Living Quarters, Barracks, Mess Hall) set how many you can carry. New troops sign on over
 * time (faster with Barracks, much faster in camp); they die when creatures board the roof or big hits land.
 */

/** Seconds per new troop. */
export function troopTrainTime(g: Game): number {
  const p = g.player;
  let barracks = 0;
  for (const m of p.modules) if (m.built && m.key === 'barracks') barracks += m.lvl;
  const inCamp = g.playerDistToCenter() < 30;
  return 14 / (1 + 0.35 * barracks) / (inCamp ? 4 : 1);
}

export function updateTroops(g: Game, dt: number): void {
  const p = g.player;
  if (p.dead) return;
  const cap = p.stats.bunks;
  if (p.troops > cap) {
    // Not enough bunks: the extras walk off (usually after tearing down quarters).
    p.troops = cap;
    p.recalc();
    return;
  }
  if (p.troops >= cap) {
    g.timers.troop = 0;
    return;
  }
  g.timers.troop += dt;
  const need = troopTrainTime(g);
  if (g.timers.troop < need) return;
  g.timers.troop -= need;
  const unmannedBefore = p.stats.crewManned < p.stats.crewWanted;
  p.troops++;
  p.recalc();
  if (unmannedBefore && p.stats.crewManned >= p.stats.crewWanted) g.hooks.toast('Every gun and nest is manned again.', '#76ff03');
}

/** Removes one troop. `from` prefers a roof soldier (boarders) or a gunner (a big hit). */
export function troopCasualty(g: Game, from: 'soldier' | 'gunner', why: string): boolean {
  const p = g.player;
  if (p.troops <= 0) return false;
  const pool = p.modules.filter((m) => m.crew > 0 && (from === 'soldier' ? !!MODULES[m.key].nest : !!MODULES[m.key].hardpoint));
  if (from === 'soldier' && !pool.length) return false;
  const m: ModuleInst | undefined = pool[Math.floor(Math.random() * pool.length)];
  p.troops--;
  p.recalc();
  const at = m ? p.moduleWorld(m) : { x: p.x, y: p.y };
  g.float(at.x, at.y, from === 'soldier' ? 'SOLDIER DOWN' : 'GUNNER DOWN', '#ff5252');
  g.stats.lost = (g.stats.lost ?? 0) + 1;
  // Don't flood the log in a big fight.
  if (g.time - lastWarn > 12) {
    lastWarn = g.time;
    g.hooks.toast(`${why} Troops ${p.troops}/${p.stats.bunks}: replacements sign on over time (faster in camp or with Barracks).`, '#ff8a80');
  }
  return true;
}
let lastWarn = -99;
