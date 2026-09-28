import type { Game } from '../game';
import { COMPARTMENTS, compName } from './titan';

/**
 * The switches on the captain's console that aren't the throttle: the air horn, the halon dump and the cooldowns
 * behind them. (Floodlights, the pump boost, the master arm and the power divert are read where they act: vision
 * and fuel in the Titan system, the guns and the shield in the world step.)
 */

export const HORN_CD = 12;
export const HALON_CD = 30;
export const HALON_WATER = 60;
/** How far the horn carries from the hull (m). */
export const HORN_RANGE = 260;

export function updateHelm(g: Game, dt: number): void {
  const h = g.helm;
  h.hornCd = Math.max(0, h.hornCd - dt);
  h.halonCd = Math.max(0, h.halonCd - dt);
}

/**
 * The air horn: everything small within earshot flinches (stunned for a moment and thrown back); elites shrug
 * most of it off and titans and bosses ignore it. Returns how many flinched, or -1 while it recharges.
 */
export function soundHorn(g: Game): number {
  const h = g.helm;
  const p = g.player;
  if (h.hornCd > 0 || p.dead) return -1;
  h.hornCd = HORN_CD;
  let n = 0;
  for (const e of g.enemiesNear(p.x, p.y, HORN_RANGE + p.stats.length / 2)) {
    if (e.hp <= 0 || e.titan || e.boss || e.burrowed) continue;
    const d = p.edgeDist(e.x, e.y);
    if (d > HORN_RANGE) continue;
    const k = 1 - d / HORN_RANGE;
    e.stun = Math.max(e.stun, (e.elite ? 0.4 : 1.4) * (0.4 + 0.6 * k));
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    const push = (e.elite ? 4 : 14) * k / Math.max(0.5, e.r);
    e.vx += Math.cos(a) * push;
    e.vy += Math.sin(a) * push;
    e.aggro = true;
    n++;
  }
  g.fx.push({ t: 'ring', x: p.x, y: p.y, r: HORN_RANGE + p.stats.length / 2, color: '#ffd740' });
  g.hooks.sound('roar', p.x, p.y, 0.8);
  return n;
}

/**
 * The halon dump: floods every burning compartment with suppressant. Knocks every fire far back (most go out), costs
 * water from the tanks and some of the air aboard. Returns how many fires it hit, or -1 while the bottles refill.
 */
export function dumpHalon(g: Game): number {
  const h = g.helm;
  const s = g.titan;
  if (h.halonCd > 0 || !g.player.titan) return -1;
  if (s.water < HALON_WATER) return -2;
  h.halonCd = HALON_CD;
  s.water -= HALON_WATER;
  let n = 0;
  for (let i = 0; i < COMPARTMENTS; i++) {
    if (s.fire[i] <= 0) continue;
    n++;
    s.fire[i] = Math.max(0, s.fire[i] - 0.7);
    if (s.fire[i] <= 0) g.hooks.toast(`Fire out: ${compName(i)}.`, '#b0bec5');
  }
  s.oxygen = Math.max(0.15, s.oxygen - 0.012 * Math.max(1, n));
  g.hooks.sound('tesla');
  return n;
}
