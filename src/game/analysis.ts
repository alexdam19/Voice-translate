import { HAZARD_INFO } from '../shared/types';
import { WEAPONS } from '../shared/weapons';
import { ZONES } from '../shared/zones';
import { DRIVE_INFO, MODULES } from './defs';
import type { Game } from './game';
import { featureLevel } from './progress';
import { driveScore, ownedDrives } from './systems/drives';
import type { ModuleInst, Tank } from './tank';

/**
 * Fortress analysis for the blueprint: sustained firepower, how much of it reaches each side of the hull,
 * a single combat rating, and plain-language strengths and weaknesses.
 */

/** Sustained damage per second of a mounted weapon (final stats). */
export function mountDps(m: ModuleInst): number {
  const s = m.stats;
  if (!s || !m.weapon) return 0;
  const d = WEAPONS[m.weapon.key];
  const shots = d.jets ? d.jets * 2.2 : s.pellets * Math.max(1, s.sky);
  return s.dmg * shots * s.rate * (1 + s.crit) * (1 + s.splash * 0.25) + s.burn + s.twinDmg * s.twinRate;
}

/** DPS that can reach a target standing `gap` units off the hull in each of 8 directions (front first, clockwise). */
export function coverage(t: Tank, gap = 8): number[] {
  const out: number[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    // Local direction: 0 = forward (+lx), then clockwise toward the right side (+lz).
    const dx = Math.cos(a), dz = Math.sin(a);
    const hl = t.stats.length / 2, hw = t.stats.width / 2;
    const s = Math.min(Math.abs(dx) > 1e-6 ? hl / Math.abs(dx) : Infinity, Math.abs(dz) > 1e-6 ? hw / Math.abs(dz) : Infinity);
    const tx = dx * (s + gap), tz = dz * (s + gap);
    let dps = 0;
    for (const m of t.weapons()) {
      if (!m.stats) continue;
      const l = t.moduleLocal(m);
      const d = Math.hypot(tx - l.lx, tz - l.lz);
      if (d <= m.stats.range && d >= m.stats.minRange) dps += mountDps(m);
    }
    out.push(dps);
  }
  return out;
}

export interface Finding {
  good: boolean;
  text: string;
}

/** What the analysis says: strengths first, then weaknesses with what to do about them. */
export function assess(g: Game): Finding[] {
  const p = g.player;
  const s = p.stats;
  const f: Finding[] = [];
  const cov = coverage(p);
  const front = cov[0], rear = cov[4], left = cov[6], right = cov[2];
  const dps = p.weapons().reduce((a, m) => a + mountDps(m), 0);
  const empty = p.hardpoints().filter((m) => !m.weapon && m.built).length;
  const cells = p.cols * p.rows;
  const used = p.modules.reduce((a, m) => a + MODULES[m.key].w * MODULES[m.key].h, 0);
  if (s.powerRatio < 1) f.push({ good: false, text: `Power deficit: ${Math.round(s.power)} made, ${Math.round(s.use)} needed. Guns fire ${Math.round((1 - (0.35 + 0.65 * s.powerRatio)) * 100)}% slower. Build a Reactor.` });
  else f.push({ good: true, text: `Power is fine: ${Math.round(s.power)} made, ${Math.round(s.use)} used.` });
  if (empty) f.push({ good: false, text: `${empty} weapon mount${empty > 1 ? 's are' : ' is'} empty. Arm ${empty > 1 ? 'them' : 'it'} in the ARSENAL.` });
  const minSide = Math.min(front, rear, left, right), maxSide = Math.max(front, rear, left, right);
  if (maxSide > 0 && minSide < maxSide * 0.45) {
    const names = ['front', 'right', 'rear', 'left'];
    const weakest = names[[front, right, rear, left].indexOf(minSide)];
    f.push({ good: false, text: `Weak ${weakest}: ${Math.round(minSide)} DPS reaches there vs ${Math.round(maxSide)} at best. Put a turret mount near the ${weakest} edge.` });
  } else if (dps > 0) f.push({ good: true, text: 'Even coverage: every side is well defended.' });
  if (!p.modules.some((m) => MODULES[m.key].tesla) && g.commander.level >= (MODULES.tesla.unlock ?? 1)) f.push({ good: false, text: 'No Tesla Coils: horde climbers can chew on the deck freely. Build one or two (Defense).' });
  else if (p.modules.some((m) => MODULES[m.key].tesla)) f.push({ good: true, text: `${p.modules.filter((m) => MODULES[m.key].tesla).length} Tesla Coil(s) guard the deck against climbers.` });
  if (!s.shield && g.commander.level >= (MODULES.shield.unlock ?? 99)) f.push({ good: false, text: 'No shield generator: every hit goes straight to the hull.' });
  if (s.topSpeed < 4.2) f.push({ good: false, text: `Slow (${s.topSpeed.toFixed(1)}): hordes will catch you and climbers won't shake off. Add an Engine.` });
  else f.push({ good: true, text: `Fast enough (${s.topSpeed.toFixed(1)}) to outrun a horde and shake climbers off.` });
  const zone = ZONES[g.map.zoneAt(p.x, p.y)];
  if (zone?.hazard && !s.protects.has(zone.hazard)) f.push({ good: false, text: `${HAZARD_INFO[zone.hazard].name} here and no protection for it.` });
  const bestDrive = ownedDrives(g).reduce((a, k) => (driveScore(g, k) > driveScore(g, a) + 0.05 ? k : a), p.drive);
  if (bestDrive !== p.drive) f.push({ good: false, text: `${DRIVE_INFO[bestDrive].name} would be faster on this ground.` });
  if (used / cells < 0.55) f.push({ good: false, text: `${Math.round((1 - used / cells) * 100)}% of the deck is empty: room for ${Math.floor((cells - used) / 4)} more 2x2 buildings.` });
  if (g.commander.level >= featureLevel('rivals')) f.push({ good: true, text: `Rival dreadnoughts are about as strong as this fortress. Combat rating ${rating(g)}.` });
  return f;
}

/** A single number for how strong the fortress is (damage times toughness). */
export function rating(g: Game): number {
  const p = g.player;
  const dps = p.weapons().reduce((a, m) => a + mountDps(m), 0);
  const ehp = (p.stats.maxHp + p.stats.shield) / (1 - p.stats.armor);
  return Math.round(Math.sqrt(dps * ehp) / 4);
}

