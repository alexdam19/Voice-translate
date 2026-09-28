import type { Game } from '../game';
import { damageEnemy, damageFriendly, damageTank, healPlayer } from './damage';
import { planPath } from './movement';

/** Per-frame crew upkeep: cooldowns, injuries, food, bonuses. */
export function updateCrew(g: Game, dt: number): void {
  const p = g.player;
  let changed = false;
  const medicRate = g.statMods.heal * (1 + p.crew.recovery) + (p.stats.medbay ? 2 : 0) + (p.stats.mess ? 0.5 : 0) + (p.modules.some((m) => m.key === 'quarters') ? 0.5 : 0);
  for (const c of g.crew) {
    if (c.cd > 0) c.cd = Math.max(0, c.cd - dt);
    if (c.injured > 0) {
      c.injured = Math.max(0, c.injured - dt * medicRate);
      if (c.injured === 0) {
        changed = true;
        g.hooks.toast(`${c.name} is back on duty.`, '#a5d6a7');
      }
    }
    if (c.loc === 'away') {
      c.returnIn -= dt;
      if (c.returnIn <= 0) {
        const room = g.crewRoom();
        if (room) {
          c.loc = room;
          changed = true;
          g.hooks.toast(`${c.name} made it back to the fortress.`, '#a5d6a7');
        } else c.returnIn = 10;
      }
    }
  }
  // Rations from hydroponics.
  if (p.stats.food > 0) {
    g.timers.food += dt * p.stats.food;
    if (g.timers.food >= 25) {
      g.timers.food = 0;
      g.give('rations', 1, true);
    }
  }
  // Training Grounds: everyone aboard learns a little every second.
  if (p.stats.training > 0 && g.mode === 'world') {
    g.timers.train += dt;
    if (g.timers.train >= 2) {
      g.timers.train = 0;
      g.crewXp(p.stats.training * 2);
    }
  }
  g.timers.crew -= dt;
  if (changed || g.timers.crew <= 0) {
    g.timers.crew = 0.5;
    g.applyCrew();
  }
}

/** Buff timers and their per-second effects. */
export function updateBuffs(g: Game, dt: number): void {
  for (const t of [g.player, ...(g.outrider ? [g.outrider] : []), ...g.tanks]) {
    for (const [k, b] of t.buffs) {
      b.t -= dt;
      if (k === 'regen' && t === g.player) healPlayer(g, b.v * dt, false);
      if (b.t <= 0) t.buffs.delete(k);
    }
  }
  if (g.runeBuff) {
    g.runeBuff.t -= dt;
    if (g.runeBuff.rune === 'verdant') healPlayer(g, g.player.stats.maxHp * 0.015 * dt, false);
    if (g.runeBuff.t <= 0) {
      g.runeBuff = null;
      g.applyCrew();
    }
  }
}

/** Burning ground, acid pools, time fields, radiation and gravity wells. */
export function updateZones(g: Game, dt: number): void {
  for (let i = g.zones.length - 1; i >= 0; i--) {
    const z = g.zones[i];
    z.t -= dt;
    if (z.t <= 0) {
      g.zones.splice(i, 1);
      continue;
    }
    if (z.kind === 'smoke') continue;
    const slow = z.kind === 'chrono' ? 0.7 : z.kind === 'frost' ? 0.4 : 0;
    if (z.team === 'player') {
      for (const e of g.enemies) {
        if (e.hp <= 0) continue;
        const d = Math.hypot(e.x - z.x, e.y - z.y);
        if (d > z.r + e.r) continue;
        if (z.kind === 'well' && !e.titan && d > 0.5) {
          e.x += ((z.x - e.x) / d) * 6 * dt;
          e.y += ((z.y - e.y) / d) * 6 * dt;
        }
        if (slow) {
          e.slow = Math.max(e.slow, 0.3);
          e.slowAmt = Math.max(e.slowAmt, slow * (e.titan ? 0.5 : 1));
        }
        if (z.dps > 0) damageEnemy(g, e, z.dps * dt, { silent: true, srcTank: g.player.id });
      }
      for (const t of g.tanks) {
        if (t.dead || t.team !== 'enemy' || t.edgeDist(z.x, z.y) > z.r) continue;
        if (slow) t.addBuff('chill', 0.3, slow * 0.7);
        if (z.dps > 0) damageTank(g, t, z.dps * dt, { silent: true, acid: z.kind === 'acid', srcTank: g.player.id });
      }
    } else {
      for (const f of g.friendlies()) {
        if (g.friendlyEdgeDist(f.id, z.x, z.y) > z.r) continue;
        if (slow && f.id === g.player.id) g.player.addBuff('chill', 0.3, slow * 0.5);
        if (z.dps > 0) damageFriendly(g, f.id, z.dps * dt, { silent: true, acid: z.kind === 'acid' });
      }
    }
  }
}

export { planPath };
