import { DEV, DEV_BUILD_SPEED } from '../devFlag';
import type { Game } from '../game';

/**
 * Builder robots: brass-and-steel machines with a boiler glowing in the chest, cheap and quick to make. Each one is
 * an extra builder (another building or upgrade going at once) and helps out round the ship: every robot aboard makes
 * the repair crews' work go a little faster. The workshop turns one out in half a minute from scrap, a few iron
 * plates and a couple of circuits; the Command Center's size caps how many she can carry.
 */

export const ROBOT_COST: Record<string, number> = { scrap: 30, iron_plate: 4, circuit: 2 };
export const ROBOT_TIME = 30;
/** Repair speed each robot adds (fraction). */
export const ROBOT_REPAIR = 0.06;

/** How many robots the hull has room and charging bays for. */
export function robotCap(g: Game): number {
  return 2 + g.player.stats.cc;
}

/** Why a robot can't be started right now, or null. */
export function robotBlocked(g: Game): string | null {
  if (g.robotBuild) return 'The workshop is already building one.';
  if (g.robots >= robotCap(g)) return `No room for more: the Command Center L${g.player.stats.cc} carries ${robotCap(g)}.`;
  if (!g.canPay(ROBOT_COST)) return 'Not enough materials (30 scrap, 4 iron plate, 2 circuits).';
  return null;
}

/** Starts the workshop on a robot. */
export function buildRobot(g: Game): string | null {
  const why = robotBlocked(g);
  if (why) return why;
  g.pay(ROBOT_COST);
  g.robotBuild = { t: 0 };
  return null;
}

export function updateRobots(g: Game, dt: number): void {
  const b = g.robotBuild;
  if (!b) return;
  b.t += dt * (DEV ? DEV_BUILD_SPEED : 1);
  if (b.t < ROBOT_TIME) return;
  g.robotBuild = null;
  g.robots++;
  g.hooks.toast(`BUILDER ROBOT ${g.robots} online: one more builder, and the repair crews work ${Math.round(ROBOT_REPAIR * 100)}% faster.`, '#ffb040');
  g.hooks.sound('levelup');
}
