import { rollAffixes, WEAPONS } from '../../shared/weapons';
import { levelMult } from '../defs';
import type { Game } from '../game';

/** Forge speed: the Weapon Forge's level, plus Level Road crew upgrades. */
export function forgeSpeed(g: Game): number {
  const lvl = g.player.stats.forge;
  return lvl ? levelMult(lvl) * (1 + g.crewFx.forgeSpeed) : 0;
}

function findWeapon(g: Game, uid: number) {
  return g.armory.find((w) => w.uid === uid) ?? g.player.modules.find((m) => m.weapon?.uid === uid)?.weapon ?? null;
}

/** Ticks the Weapon Forge. */
export function updateArsenal(g: Game, dt: number): void {
  if (g.mode !== 'world') return;
  const job = g.forgeJob;
  if (!job) return;
  const sp = forgeSpeed(g);
  if (sp <= 0) return;
  job.t += dt * sp;
  if (job.t < job.total) return;
  g.forgeJob = null;
  const w = findWeapon(g, job.uid);
  if (!w) return;
  w.rarity = Math.min(5, job.to) as typeof w.rarity;
  w.affixes = rollAffixes(Math.random, w.key, w.rarity, w.affixes);
  g.applyCrew();
  g.player.version++;
  g.objectiveCounters.forged = (g.objectiveCounters.forged ?? 0) + 1;
  g.hooks.toast(`Forged: ${WEAPONS[w.key].name} is now ${w.rarity + 1}★! It gained an upgrade point.`, '#ffd740');
  g.hooks.sound(w.rarity >= 4 ? 'legendary' : 'chest');
}
