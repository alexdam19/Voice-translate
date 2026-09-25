import { rollDropRarity, rollWeaponKey } from '../../shared/loot';
import { NODE_INFO } from '../../shared/mapgen';
import type { Enemy } from '../entities';
import type { Game } from '../game';
import type { Tank } from '../tank';
import { newWeapon } from '../templates';
import { onTankDestroyed } from './world';

export interface HitOpts {
  crit?: boolean;
  burn?: number;
  srcTank?: number;
  lifesteal?: number;
  /** Knockback strength. */
  knock?: number;
  kx?: number;
  ky?: number;
  silent?: boolean;
  wkey?: string;
  wr?: number;
}

/** Heals the player's fortress (all repair goes through here so healing bonuses apply). */
export function healPlayer(g: Game, amount: number, show = true): void {
  const t = g.player;
  if (t.dead || amount <= 0) return;
  const real = Math.min(t.stats.maxHp - t.hp, amount * t.crew.healMult);
  if (real <= 0) return;
  t.hp += real;
  g.onHeal?.(real, 0);
  if (show && real >= 5) g.float(t.x, t.y, `+${Math.round(real)}`, '#76ff03');
}

function lifesteal(g: Game, src: number | undefined, dealt: number, frac: number | undefined): void {
  if (!frac || !src || dealt <= 0) return;
  if (src === g.player.id) healPlayer(g, dealt * frac, false);
}

export function damageEnemy(g: Game, e: Enemy, dmg: number, o: HitOpts = {}): void {
  if (e.hp <= 0 || e.burrowed) return;
  const dealt = Math.min(e.hp, dmg);
  e.hp -= dmg;
  e.hitFlash = 0.12;
  e.aggro = true;
  if (o.srcTank) e.lastHitBy = o.srcTank;
  if (o.burn) {
    e.burn = 3;
    e.burnDps = Math.max(e.burnDps, o.burn);
  }
  if (o.knock && !e.titan) {
    e.vx += (o.kx ?? 0) * o.knock / Math.max(0.5, e.r * 2);
    e.vy += (o.ky ?? 0) * o.knock / Math.max(0.5, e.r * 2);
  }
  lifesteal(g, o.srcTank, dealt, o.lifesteal);
  if (!o.silent && g.isVisible(e.x, e.y)) g.float(e.x, e.y, String(Math.round(dmg)), o.crit ? '#ffea00' : '#ffffff', !!o.crit);
  if (e.hp <= 0) killEnemy(g, e);
}

export function killEnemy(g: Game, e: Enemy): void {
  e.hp = 0;
  g.stats.kills++;
  g.objectiveCounters.kills = (g.objectiveCounters.kills ?? 0) + 1;
  g.fx.push({ t: 'boom', x: e.x, y: e.y, r: e.r * 1.6, color: e.titan ? '#ff9100' : '#ffcc80', big: e.titan });
  g.hooks.sound(e.titan ? 'bigboom' : 'splat', e.x, e.y);
  const threat = e.threat;
  if (e.titan) {
    g.stats.titans++;
    g.dropLoot(e.x, e.y, 'titan', 4);
    g.dropPickup(e.x, e.y, { kind: 'weapon', weapon: newWeapon(rollWeaponKey(Math.random), rollDropRarity(Math.random, threat, 1.2, 2)) });
    g.dropPickup(e.x, e.y, { kind: 'chest', chest: 'titan', chestThreat: threat });
    g.hooks.toast(`${e.name} has fallen!`, '#ffab40');
    g.fx.push({ t: 'shake', amt: 1.2 });
  } else {
    g.dropLoot(e.x, e.y, e.loot, e.elite ? 2 : 1);
    if (e.elite) {
      g.dropLoot(e.x, e.y, 'elite', 1);
      if (Math.random() < 0.18) g.dropPickup(e.x, e.y, { kind: 'weapon', weapon: newWeapon(rollWeaponKey(Math.random), rollDropRarity(Math.random, threat, 0.3)) });
    }
  }
  g.crewXp(e.xp);
}

/** Damage to any tank. Shields and armor soak first. Player tanks can injure crew on big hits. */
export function damageTank(g: Game, t: Tank, dmg: number, o: HitOpts = {}): void {
  if (t.dead || dmg <= 0) return;
  if (t.hasBuff('invuln')) {
    if (!o.silent) g.float(t.x, t.y, 'IMMUNE', '#b9f6ca');
    return;
  }
  if (t.kind === 'remote') {
    g.onRemoteHit?.(t, dmg, o);
    t.hitFlash = 0.1;
    if (!o.silent) g.float(t.x, t.y, String(Math.round(dmg)), o.crit ? '#ffea00' : '#ffffff', !!o.crit);
    return;
  }
  let d = dmg;
  const barrier = t.buff('barrier');
  if (barrier && barrier.v > 0) {
    const take = Math.min(barrier.v, d);
    barrier.v -= take;
    d -= take;
  }
  if (d > 0 && t.shield > 0) {
    const take = Math.min(t.shield, d);
    t.shield -= take;
    d -= take;
    g.fx.push({ t: 'ring', x: t.x, y: t.y, r: t.stats.length * 0.6, color: '#40c4ff' });
  }
  let armor = t.stats.armor;
  if (t.hasBuff('armorUp')) armor += t.buff('armorUp')!.v;
  if (t === g.player && t.speed > 1 && t.hasBuff('evasive')) armor += 0.1;
  d *= 1 - Math.min(0.75, armor);
  t.shieldDelay = 4;
  t.lastHitAt = g.time;
  if (o.burn && t.team === 'enemy') t.addBuff('burn', 3, o.burn);
  const dealt = Math.min(t.hp, d);
  t.hp -= d;
  t.hitFlash = 0.1;
  lifesteal(g, o.srcTank, dealt, o.lifesteal);
  if (!o.silent && (t.team === 'enemy' || d >= 1)) g.float(t.x, t.y + 0.4, String(Math.round(d)), t.team === 'player' ? '#ff5252' : o.crit ? '#ffea00' : '#ffffff', !!o.crit);
  if (t === g.player && d > t.stats.maxHp * 0.07 && Math.random() < 0.35) injureRandomCrew(g, 20 + Math.random() * 15);
  if (t.hp <= 0) {
    t.hp = 0;
    onTankDestroyed(g, t);
  }
}

export function injureRandomCrew(g: Game, seconds: number, reason = 'was hurt'): void {
  const fit = g.crew.filter((c) => c.loc === 'main' && c.injured <= 0);
  if (!fit.length) return;
  const c = fit[Math.floor(Math.random() * fit.length)];
  c.injured = seconds;
  g.hooks.toast(`${c.name} ${reason} and is out of action.`, '#ff8a80');
  g.applyCrew();
}

/** Damage to anything on the player side (fortress, outrider, marines). */
export function damageFriendly(g: Game, id: number, dmg: number, o: HitOpts = {}): void {
  const t = g.tankById(id);
  if (t && t.team === 'player') {
    damageTank(g, t, dmg, o);
    return;
  }
  const a = g.allies.find((x) => x.id === id);
  if (a) {
    a.hp -= dmg;
    if (a.hp <= 0) g.fx.push({ t: 'spark', x: a.x, y: a.y, color: '#ff5252', n: 6 });
  }
}

/** Area damage centred at (x,y) against one side. */
export function explode(g: Game, x: number, y: number, r: number, dmg: number, team: 'player' | 'enemy', o: HitOpts = {}, color = '#ffab40'): void {
  g.fx.push({ t: 'boom', x, y, r, color, big: r > 3 });
  if (r >= 2.5) g.fx.push({ t: 'shake', amt: Math.min(0.8, r * 0.12) });
  g.hooks.sound(r >= 2.5 ? 'bigboom' : 'boom', x, y, Math.min(1, 0.4 + r * 0.15));
  if (team === 'player') {
    for (const e of g.enemies) {
      if (e.hp <= 0 || e.burrowed) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.r;
      if (d > r) continue;
      const f = 1 - 0.5 * Math.max(0, d) / r;
      const len = Math.max(0.1, Math.hypot(e.x - x, e.y - y));
      damageEnemy(g, e, dmg * f, { ...o, knock: 3, kx: (e.x - x) / len, ky: (e.y - y) / len });
    }
    for (const t of g.tanks) {
      if (t.dead) continue;
      const d = t.edgeDist(x, y);
      if (d > r) continue;
      damageTank(g, t, dmg * (1 - 0.5 * d / r), o);
    }
  } else {
    for (const f of g.friendlies()) {
      const d = g.friendlyEdgeDist(f.id, x, y);
      if (d > r) continue;
      damageFriendly(g, f.id, dmg * (1 - 0.5 * d / r), o);
    }
  }
}

/** Where a harvest node sits (for weapons that shouldn't shoot it). */
export const nodeRadius = (type: keyof typeof NODE_INFO): number => (NODE_INFO[type].tier === 3 ? 1 : 0.85);
