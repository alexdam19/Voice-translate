import { OFFICER_LABELS, OFFICER_SLOTS } from '../../shared/constants';
import { abilityCooldown, abilityOf, abilityPower, type CrewMember } from '../crew';
import { eid } from '../entities';
import { spawnMarines } from './allies';
import type { Game } from '../game';
import { damageEnemy, damageFriendly, damageTank, explode, healPlayer } from './damage';
import { planPath, resolveTank } from './movement';
import { revealFeatures } from './world';

/** Per-frame crew upkeep: cooldowns, injuries, food, bonuses. */
export function updateCrew(g: Game, dt: number): void {
  const p = g.player;
  let changed = false;
  const medicRate = 1 + p.crew.recovery + (p.stats.medbay ? 2 : 0) + (p.stats.mess ? 0.5 : 0) + (p.modules.some((m) => m.key === 'quarters') ? 0.5 : 0);
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
          c.officer = -1;
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

/** Tries to fire the ability in officer slot `slot` at world point (x, y). */
export function castAbility(g: Game, slot: number, x: number, y: number): boolean {
  if (slot < 0 || slot >= OFFICER_SLOTS || g.player.dead) return false;
  if (slot >= g.officerSeats()) {
    g.hooks.toast(`Seat ${OFFICER_LABELS[slot]} is locked. Research ${slot === 4 ? 'Officer School' : 'Chain of Command'} (RESEARCH > Personnel > COMMAND).`, '#ff8a80');
    return false;
  }
  const c = g.officers()[slot];
  if (!c) {
    g.hooks.toast('No officer in that slot. Assign one in CREW (C).', '#ff8a80');
    return false;
  }
  if (c.injured > 0) {
    g.hooks.toast(`${c.name} is injured (${Math.ceil(c.injured)}s).`, '#ff8a80');
    return false;
  }
  if (c.cd > 0) return false;
  const a = abilityOf(c);
  if (a.target === 'point' && a.range) {
    const d = Math.hypot(x - g.player.x, y - g.player.y);
    if (d > a.range) {
      const k = a.range / d;
      x = g.player.x + (x - g.player.x) * k;
      y = g.player.y + (y - g.player.y) * k;
    }
  }
  runAbility(g, c, a.key, x, y);
  c.cd = abilityCooldown(c, g.player.crew.cdr);
  if (g.crewFx.blitz > 0) {
    g.player.addBuff('blitz', 5, 0.3);
    g.applyCrew();
  }
  g.crewXp(0);
  c.xp += 3;
  g.hooks.sound('ability');
  g.float(g.player.x, g.player.y - 0.6, a.name.toUpperCase(), a.color, true);
  g.objectiveCounters.abilities = (g.objectiveCounters.abilities ?? 0) + 1;
  return true;
}

function runAbility(g: Game, c: CrewMember, key: string, x: number, y: number): void {
  const p = g.player;
  const P = abilityPower(c, p.crew.abilityPower);
  const heal = (frac: number, over: number): void => {
    p.addBuff('regen', over, (p.stats.maxHp * frac) / over);
  };
  switch (key) {
    case 'barrage':
      p.addBuff('barrage', 5, 0.5 * P);
      break;
    case 'shield_surge':
      p.buffs.set('barrier', { t: 6, v: p.stats.maxHp * 0.18 * P });
      g.onHeal?.(0, p.stats.maxHp * 0.18 * P);
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r: p.stats.length * 0.7, color: '#40c4ff' });
      break;
    case 'weld':
      heal(0.22 * P, 3);
      break;
    case 'triage':
      for (const k of g.crew) k.injured = 0;
      p.buffs.delete('stun');
      p.buffs.delete('burn');
      p.buffs.delete('chill');
      heal(0.06 * P, 5);
      g.applyCrew();
      g.fx.push({ t: 'heal', x: p.x, y: p.y });
      break;
    case 'nitro':
      p.addBuff('nitro', 4, 0.7 * P);
      break;
    case 'magnet':
      p.addBuff('magnet', 1.5, 30);
      p.addBuff('harvestUp', 8, 0.6 * P);
      break;
    case 'artillery': {
      const dmg = 60 * P;
      for (let i = 0; i < 6; i++) {
        const ox = (Math.random() - 0.5) * 7, oy = (Math.random() - 0.5) * 7;
        g.telegraphs.push({ id: eid(), x: x + ox, y: y + oy, shape: 'circle', r: 2.2, a: 0, len: 0, t: 0, total: 1 + i * 0.12, color: '#ffab40', team: 'player', dmg,
          onDone: () => explode(g, x + ox, y + oy, 2.2, dmg, 'player', { srcTank: p.id }, '#ffab40') });
      }
      break;
    }
    case 'emp': {
      const r = 12;
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r, color: '#ea80fc' });
      for (const e of g.enemies) {
        if (Math.hypot(e.x - p.x, e.y - p.y) > r + e.r) continue;
        e.stun = Math.max(e.stun, Math.min(4, 2 * P) * (e.titan ? 0.4 : 1));
        damageEnemy(g, e, 40 * P, { srcTank: p.id });
      }
      for (const t of g.tanks) {
        if (t.dead || Math.hypot(t.x - p.x, t.y - p.y) > r + t.stats.radius) continue;
        t.addBuff('stun', 2 * P);
        t.shield = 0;
      }
      break;
    }
    case 'squad':
      spawnMarines(g, 3 + p.crew.extraMarines, false, 20, P);
      break;
    case 'deadeye':
      p.addBuff('deadeye', 6 * Math.min(1.6, P));
      break;
    case 'meltdown':
      p.shield = p.stats.shield;
      p.addBuff('meltdown', 7, 0.8 * P);
      break;
    case 'nanite':
      heal(0.45 * P, 5);
      p.addBuff('armorUp', 5, 0.3);
      break;
    case 'miracle':
      p.addBuff('invuln', 3 * Math.min(1.5, P));
      healPlayer(g, p.stats.maxHp * 0.25);
      for (const k of g.crew) k.injured = 0;
      p.buffs.delete('stun');
      p.buffs.delete('burn');
      g.applyCrew();
      g.fx.push({ t: 'heal', x: p.x, y: p.y });
      break;
    case 'charge': {
      const dx = x - p.x, dy = y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.rot = Math.atan2(dy, dx);
      const steps = Math.ceil(d / 0.5);
      const hit = new Set<number>();
      for (let i = 0; i < steps; i++) {
        p.x += (dx / d) * 0.5;
        p.y += (dy / d) * 0.5;
        if (resolveTank(g, p)) break;
        for (const e of g.enemies) {
          if (hit.has(e.id) || p.edgeDist(e.x, e.y) > e.r + 0.5) continue;
          hit.add(e.id);
          damageEnemy(g, e, 150 * P, { srcTank: p.id, knock: 14, kx: -dy / d, ky: dx / d });
        }
        for (const t of g.tanks) {
          if (hit.has(t.id) || t.dead || Math.hypot(t.x - p.x, t.y - p.y) > p.stats.radius + t.stats.radius) continue;
          hit.add(t.id);
          explode(g, t.x, t.y, 1, 150 * P, 'player', { srcTank: p.id });
        }
        if (i % 3 === 0) g.fx.push({ t: 'dust', x: p.x, y: p.y, color: '#18ffff' });
      }
      p.path = [];
      p.goal = null;
      g.fx.push({ t: 'shake', amt: 0.6 });
      break;
    }
    case 'treasure':
      p.addBuff('magnet', 2, 60);
      g.chestBonus = Math.max(g.chestBonus, 1);
      revealFeatures(g);
      g.hooks.toast('Every loot area and rune is now on your map (M). The next chest is one rarity better.', '#ffd23f');
      break;
    case 'orbital': {
      const dmg = 600 * P;
      g.telegraphs.push({ id: eid(), x, y, shape: 'circle', r: 6, a: 0, len: 0, t: 0, total: 1.2, color: '#ff3d00', team: 'player', dmg,
        onDone: () => {
          g.fx.push({ t: 'beam', x0: x, y0: y - 0.01, x1: x, y1: y, color: '#ff3d00', w: 3, life: 0.6 });
          explode(g, x, y, 6, dmg, 'player', { srcTank: p.id }, '#ff3d00');
          g.zones.push({ id: eid(), x, y, r: 5, t: 5, kind: 'fire', dps: 40 * P, team: 'player' });
        } });
      break;
    }
    case 'singularity':
      g.zones.push({ id: eid(), x, y, r: 9, t: 3, kind: 'well', dps: 60 * P, team: 'player' });
      g.telegraphs.push({ id: eid(), x, y, shape: 'circle', r: 5, a: 0, len: 0, t: 0, total: 3, color: '#d500f9', team: 'player', dmg: 250 * P,
        onDone: () => explode(g, x, y, 5, 250 * P, 'player', { srcTank: p.id }, '#d500f9') });
      break;
    case 'legion':
      spawnMarines(g, 5 + p.crew.extraMarines, true, 25, P);
      break;
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
