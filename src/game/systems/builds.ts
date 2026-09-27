import { chassisForCC, MODULES } from '../defs';
import type { BuildJob, Game } from '../game';
import { campBonus } from './camp';

/**
 * Builders at work. Each builder handles one job at a time: putting up a new building or upgrading one.
 * Jobs run in real time while you play. Buildings keep working while they are being upgraded.
 */

export function jobFor(g: Game, modId: number): BuildJob | undefined {
  return g.builds.find((b) => b.modId === modId);
}

export function updateBuilds(g: Game, dt: number): void {
  if (g.mode !== 'world' || !g.builds.length) return;
  // Builders work in crews of two: short-handed, jobs go slower. Camped, they go twice as fast.
  const p = g.player;
  const crew = p.buildCrew > 0 ? Math.max(0.25, p.builderStaff / p.buildCrew) : 1;
  dt *= crew * p.efficiency * campBonus(g).build;
  for (let i = g.builds.length - 1; i >= 0; i--) {
    const job = g.builds[i];
    const m = g.player.moduleById(job.modId);
    if (!m) {
      g.builds.splice(i, 1);
      continue;
    }
    job.t += dt;
    if (job.t < job.total) continue;
    g.builds.splice(i, 1);
    completeJob(g, job);
  }
}

export function completeJob(g: Game, job: BuildJob): void {
  const p = g.player;
  const m = p.moduleById(job.modId);
  if (!m) return;
  const d = MODULES[m.key];
  if (job.kind === 'build') {
    m.built = true;
    p.version++;
    g.hooks.toast(`${d.name} is finished!`, '#76ff03');
    g.objectiveCounters.built = (g.objectiveCounters.built ?? 0) + 1;
  } else {
    m.lvl = job.to;
    p.version++;
    if (d.required) {
      // A bigger Command Center means a bigger fortress.
      const ch = chassisForCC(m.lvl);
      if (ch.key !== p.chassis) p.setChassis(ch.key);
      // The bigger hull brings more weapon pads (and, later, a second main battery).
      const added = g.syncHull();
      if (added > 0) g.hooks.toast(`${added} new weapon mount${added > 1 ? 's' : ''} on the hull, armed and firing. Swap in better guns in the ARSENAL.`, '#ffd740');
      g.hooks.toast(`Command Center level ${m.lvl}! Your fortress grew into a ${ch.name}: more room, more of every building, higher levels.`, '#4dd0e1');
    } else g.hooks.toast(`${d.name} reached level ${m.lvl}.`, '#76ff03');
    g.objectiveCounters.upgraded = (g.objectiveCounters.upgraded ?? 0) + 1;
  }
  g.applyCrew();
  if (d.required || job.kind === 'build') p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.1);
  g.hooks.sound('finish');
}
