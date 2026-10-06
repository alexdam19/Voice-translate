import { DEV, DEV_BUILD_SPEED } from '../devFlag';
import type { Game } from '../game';

/**
 * Builder robots: brass-and-steel machines with a boiler glowing in the chest, cheap and quick to make. Each one is
 * an extra builder (another building or upgrade going at once) and helps out round the
 * ship: every robot aboard makes the repair crews' work go a little faster. One tap and the workshop turns one out of
 * scrap in a few seconds; tap again and it queues more, up to what the Command Center has charging bays for.
 */

export const ROBOT_COST: Record<string, number> = { scrap: 20 };
export const ROBOT_TIME = 10;
/** Repair speed each robot adds (fraction). */
export const ROBOT_REPAIR = 0.06;

/** How many robots the hull has room and charging bays for. */
export function robotCap(g: Game): number {
  return 3 + g.player.stats.cc;
}

/** Robots aboard plus the ones the workshop is making or has queued. */
export function robotsComing(g: Game): number {
  return g.robots + (g.robotBuild ? 1 + (g.robotBuild.queue ?? 0) : 0);
}

/** Why a robot can't be ordered right now, or null. */
export function robotBlocked(g: Game): string | null {
  if (robotsComing(g) >= robotCap(g)) return `No room for more: the Command Center L${g.player.stats.cc} has ${robotCap(g)} charging bays.`;
  if (!g.canPay(ROBOT_COST)) return 'Not enough scrap (a robot takes 20).';
  return null;
}

/** Orders a robot: the workshop starts on it, or queues it behind the one it's making. */
export function buildRobot(g: Game): string | null {
  const why = robotBlocked(g);
  if (why) return why;
  g.pay(ROBOT_COST);
  if (g.robotBuild) g.robotBuild.queue = (g.robotBuild.queue ?? 0) + 1;
  else g.robotBuild = { t: 0 };
  return null;
}

export function updateRobots(g: Game, dt: number): void {
  const b = g.robotBuild;
  if (!b) return;
  b.t += dt * (DEV ? DEV_BUILD_SPEED : 1);
  if (b.t < ROBOT_TIME) return;
  const queued = b.queue ?? 0;
  g.robotBuild = queued > 0 ? { t: 0, queue: queued - 1 } : null;
  g.robots++;
  g.hooks.toast(`BUILDER ROBOT ${g.robots} online: one more builder, and the repair crews work ${Math.round(ROBOT_REPAIR * 100)}% faster.`, '#ffb040');
  g.hooks.sound('levelup');
}
