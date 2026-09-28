import { CREW_SCALE, MODULES } from '../defs';
import type { Game } from '../game';
import { campBonus } from './camp';
import { reserveCap, updateReserve } from './crewops';
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
  const inCamp = g.playerDistHome() < 500;
  return 14 / CREW_SCALE / (1 + 0.35 * barracks) / (inCamp ? 4 : campBonus(g).train);
}

export function updateTroops(g: Game, dt: number): void {
  const p = g.player;
  if (p.dead) return;
  const cap = p.stats.bunks;
  if (p.troops > cap) {
    // Not enough bunks: the extras go to the reserve if there's room, or walk off (usually after tearing down quarters).
    const extra = p.troops - cap;
    g.reserves = Math.min(reserveCap(g), g.reserves + extra);
    p.troops = cap;
    p.recalc();
    return;
  }
  updateReserve(g);
  const resCap = reserveCap(g);
  if (p.troops >= cap && g.reserves >= resCap) {
    g.timers.troop = 0;
    return;
  }
  g.timers.troop += dt;
  // With every bunk full, recruits go to the Barracks reserve (at half the pace).
  const need = troopTrainTime(g) * (p.troops >= cap ? 2 : 1);
  if (g.timers.troop < need) return;
  g.timers.troop -= need;
  if (p.troops >= cap) {
    g.reserves++;
    return;
  }
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
  // A reservist steps into the gap straight away.
  if (g.reserves > 0) g.reserves--;
  else p.troops--;
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
