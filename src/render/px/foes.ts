import type { Enemy } from '../../game/entities';
import type { Arch, EnemyDef } from '../../game/enemyDefs';
import type { HeroPose, HeroRole } from './heroes';

/**
 * Hostile people as painted figures (the same posed-skeleton painter as the crew): the dead in their classes
 * (shamblers, runners, bloaters, brutes, skeletons), raiders, cultists, cyborgs and enemy soldiers, each moving the way
 * it should (the dead lurch with their arms out, runners sprint) and attacking with its own animation: a clawing swipe,
 * a brute's two-fisted smash, a gunner shouldering the rifle.
 */

export interface Foe {
  role: HeroRole;
  /** How much taller than a person. */
  scale: number;
  /** Clothes colour (the dead wear whatever they died in). */
  color?: string;
}

const RAGS = ['#5c5a4a', '#4a5a6a', '#6a4a3a', '#3a4a3a', '#6a6a5a', '#4a3a4a', '#7a6a4a', '#3a3e48', '#6a3a36', '#40505a'];

/** The figure for a humanoid enemy, or null for anything that isn't a person-shaped thing. */
export function foeFor(e: Enemy, def: EnemyDef | undefined, arch: Arch): Foe | null {
  if (!def) return null;
  const kind = e.kind;
  const n = `${kind} ${def.name}`.toLowerCase();
  const has = (...w: string[]): boolean => w.some((k) => n.includes(k));
  if (arch === 'bot') {
    if (kind.startsWith('cy_') && (def.r ?? 1) < 1.1 && !has('hound', 'dog')) return { role: 'cyborg', scale: has('enforcer') ? 1.2 : 1 };
    return null;
  }
  if (arch !== 'humanoid') return null;
  if (def.faction === 'zombie' || kind.startsWith('z_')) {
    const rag = RAGS[e.id % RAGS.length];
    if (has('brute', 'tank')) return { role: 'brute', scale: 1.45, color: rag };
    if (has('bloat')) return { role: 'bloater', scale: 1, color: rag };
    if (has('runner', 'sprint')) return { role: 'runner', scale: 1, color: rag };
    return { role: 'zombie', scale: 1, color: rag };
  }
  if (has('skel', 'bone', 'lich')) return { role: 'skeleton', scale: 1 };
  if (def.faction === 'necro' || has('necro', 'mage', 'witch', 'shaman', 'priest', 'cult', 'acolyte')) return { role: 'cultist', scale: 1 };
  if (def.faction === 'cyborg') return { role: 'cyborg', scale: 1 };
  if (def.faction === 'military') return { role: 'rifleman', scale: 1, color: '#4a4a52' };
  return { role: 'raider', scale: has('brute', 'heavy', 'ogre') ? 1.25 : 1 };
}

/** What it's doing: attacking (for half a second after each blow or shot), clinging to a hull, moving, or waiting. */
export function foePose(e: Enemy, f: Foe, def: EnemyDef | undefined): { pose: HeroPose; frame: number } {
  const ranged = !!def?.proj;
  const heavy = f.role === 'brute' || f.role === 'bloater';
  const t = e.atkT ?? 9;
  if (e.latch) return heavy ? { pose: 'slam', frame: Math.floor(e.anim * 1.2) } : { pose: 'claw', frame: Math.floor(e.anim * 1.8) };
  if (t < 0.5) {
    if (ranged) return { pose: 'aim', frame: 0 };
    return { pose: heavy ? 'slam' : 'claw', frame: Math.min(3, Math.floor((t / 0.5) * 4)) };
  }
  if (e.aim) return { pose: 'aim', frame: 0 };
  const v = Math.hypot(e.vx, e.vy);
  const dead = f.role === 'zombie' || f.role === 'bloater' || f.role === 'brute';
  if (v > 0.3) {
    if (dead) return { pose: v > 4 ? 'run' : 'shamble', frame: Math.floor(e.anim * 1.2) };
    if (f.role === 'runner') return { pose: 'run', frame: Math.floor(e.anim * 1.4) };
    return { pose: v > 3.2 ? 'run' : 'walk', frame: Math.floor(e.anim * 1.4) };
  }
  if (ranged) return { pose: 'aim', frame: 0 };
  return { pose: dead ? 'shamble' : 'stand', frame: 0 };
}
