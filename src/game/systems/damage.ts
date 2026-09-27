import { troopCasualty } from './troops';
import { rollDropRarity, rollWeaponKey } from '../../shared/loot';
import { NODE_INFO } from '../../shared/mapgen';
import { eid, type Enemy, type ShotFx } from '../entities';
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
  /** On-hit effects (slow, stun, execute, chain reactions...). */
  fx?: ShotFx;
  /** Acid: ignores armor. */
  acid?: boolean;
}

/** On-hit effects of a shot against a creature. Returns the adjusted damage. */
function preHit(e: Enemy, dmg: number, fx: ShotFx | undefined): number {
  if (!fx) return dmg;
  if (fx.specials.includes('execute') && e.hp < e.maxHp * 0.3) dmg *= 2;
  if (fx.slow > 0) {
    e.slow = Math.max(e.slow, 2);
    e.slowAmt = Math.max(e.slowAmt, fx.slow * (e.titan ? 0.5 : 1));
  }
  if (fx.stun > 0 && Math.random() < fx.stun) e.stun = Math.max(e.stun, fx.stunTime * (e.titan ? 0.25 : 1));
  return dmg;
}

/** Effects that trigger after a hit lands (storm, singularity, hellfire, execute, chain reactions). */
function postHit(g: Game, e: Enemy, fx: ShotFx | undefined, o: HitOpts): void {
  if (!fx) return;
  if (fx.execute && e.hp > 0 && e.hp < e.maxHp * (e.titan ? 0.06 : 0.2)) {
    g.float(e.x, e.y + 0.5, 'ERASED', '#b388ff', true);
    e.hp = 0;
  }
  for (const sp of fx.specials) {
    if (sp === 'storm' && Math.random() < 0.2) {
      g.fx.push({ t: 'strike', x: e.x, y: e.y, color: '#82b1ff' });
      damageEnemy(g, e, fx.base * 0.6, { srcTank: o.srcTank, silent: o.silent });
    } else if (sp === 'singularity' && Math.random() < 0.25 && !g.zones.some((z) => z.kind === 'well' && Math.hypot(z.x - e.x, z.y - e.y) < 3)) {
      g.zones.push({ id: eid(), x: e.x, y: e.y, r: 3.2, t: 1.4, kind: 'well', dps: fx.base * 0.15, team: 'player' });
    } else if (sp === 'napalm' && Math.random() < 0.3) {
      g.zones.push({ id: eid(), x: e.x, y: e.y, r: 1.8, t: 3, kind: 'fire', dps: Math.max(6, fx.base * 0.3), team: 'player' });
    }
  }
}

function onKill(g: Game, e: Enemy, fx: ShotFx | undefined, o: HitOpts): void {
  if (!fx) return;
  if (fx.specials.includes('chain_react')) explode(g, e.x, e.y, 2.6, fx.base * 0.4, 'player', { srcTank: o.srcTank }, '#ff6e40', true);
  else if (fx.volatile) explode(g, e.x, e.y, 2, fx.base * 0.25, 'player', { srcTank: o.srcTank }, '#ffab40', true);
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
  dmg = preHit(e, dmg, o.fx);
  if (o.srcTank === g.player.id) {
    const c = g.player.crew;
    if (e.titan && c.titanDmg) dmg *= 1 + c.titanDmg;
    else if (e.elite && c.eliteDmg) dmg *= 1 + c.eliteDmg;
  }
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
  // Horde fodder doesn't get damage numbers (there'd be hundreds); crits still show.
  if (!o.silent && (!e.horde || o.crit) && g.isVisible(e.x, e.y)) g.float(e.x, e.y, String(Math.round(dmg)), o.crit ? '#ffea00' : '#ffffff', !!o.crit);
  if (e.hp > 0) postHit(g, e, o.fx, o);
  if (e.hp <= 0) {
    killEnemy(g, e);
    onKill(g, e, o.fx, o);
  }
}

export function killEnemy(g: Game, e: Enemy): void {
  e.hp = 0;
  g.stats.kills++;
  g.objectiveCounters.kills = (g.objectiveCounters.kills ?? 0) + 1;
  const threat = e.threat;
  if (e.horde && !e.elite) {
    // Horde fodder: a splat, the odd scrap, a little XP.
    g.fx.push({ t: 'spark', x: e.x, y: e.y, color: e.kind === 'leaper' ? '#9ccc65' : '#8d6e63', n: 4 });
    if (Math.random() < 0.25) g.hooks.sound('splat', e.x, e.y, 0.5);
    if (Math.random() < 0.1) g.dropLoot(e.x, e.y, 'swarm', 1);
    g.gainXp(e.xp * (0.8 + 0.2 * threat));
    return;
  }
  g.fx.push({ t: 'boom', x: e.x, y: e.y, r: e.r * 1.6, color: e.titan ? '#ff9100' : '#ffcc80', big: e.titan });
  g.hooks.sound(e.titan ? 'bigboom' : 'splat', e.x, e.y);
  if (e.titan) {
    g.stats.titans++;
    g.dropLoot(e.x, e.y, 'titan', 4);
    g.dropPickup(e.x, e.y, { kind: 'weapon', weapon: newWeapon(rollWeaponKey(Math.random), rollDropRarity(Math.random, threat, 1.2, 2)) });
    g.dropPickup(e.x, e.y, { kind: 'chest', chest: 'titan', chestThreat: threat });
    g.dropPickup(e.x, e.y, { kind: 'chest', chest: threat >= 6 ? 'legendary_pack' : 'epic_pack', chestThreat: threat });
    g.hooks.toast(`${e.name} has fallen!`, '#ffab40');
    g.fx.push({ t: 'shake', amt: 1.2 });
  } else {
    g.dropLoot(e.x, e.y, e.loot, e.elite ? 2 : 1);
    if (e.elite) {
      g.dropLoot(e.x, e.y, 'elite', 1);
      if (Math.random() < 0.18) g.dropPickup(e.x, e.y, { kind: 'weapon', weapon: newWeapon(rollWeaponKey(Math.random), rollDropRarity(Math.random, threat, 0.3)) });
      // Elites carry card packs.
      const roll = Math.random();
      if (roll < 0.45) g.dropPickup(e.x, e.y, { kind: 'chest', chest: roll < 0.06 * threat * 0.5 ? 'rare_pack' : 'pack', chestThreat: threat });
    } else if (e.kind === 'guardian' && Math.random() < 0.5) {
      g.dropPickup(e.x, e.y, { kind: 'chest', chest: 'rare_pack', chestThreat: threat });
    } else if (Math.random() < 0.012) {
      // Now and then an ordinary enemy drops a pack too.
      g.dropPickup(e.x, e.y, { kind: 'chest', chest: 'pack', chestThreat: threat });
    }
  }
  g.gainXp(e.xp * (0.8 + 0.2 * threat));
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
  if (t.hasBuff('dome')) d *= 0.1;
  if (t.hasBuff('smoke')) d *= 0.5;
  // Slows and stuns from special weapons.
  if (o.fx) {
    if (o.fx.slow > 0) t.addBuff('chill', 2, o.fx.slow * (t.team === 'player' ? 0.5 : 0.7));
    if (o.fx.stun > 0 && Math.random() < o.fx.stun * (t.team === 'player' ? 0.3 : 0.6)) t.addBuff('stun', o.fx.stunTime * (t.team === 'player' ? 0.35 : 0.6));
  }
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
  if (!o.acid) d *= 1 - Math.min(0.75, armor);
  t.shieldDelay = 4;
  t.lastHitAt = g.time;
  if (o.burn && t.team === 'enemy') t.addBuff('burn', 3, o.burn);
  const dealt = Math.min(t.hp, d);
  t.hp -= d;
  // Ticking damage (hazards, burning ground) doesn't flash the whole hull.
  if (!o.silent) t.hitFlash = 0.1;
  lifesteal(g, o.srcTank, dealt, o.lifesteal);
  if (!o.silent && (t.team === 'enemy' || d >= 1)) g.float(t.x, t.y + 0.4, String(Math.round(d)), t.team === 'player' ? '#ff5252' : o.crit ? '#ffea00' : '#ffffff', !!o.crit);
  if (t === g.player && d > t.stats.maxHp * 0.07 && Math.random() < 0.35 * (1 - g.crewFx.injuryResist)) injureRandomCrew(g, 20 + Math.random() * 15);
  // A big hit can kill a gunner.
  if (t === g.player && d > t.stats.maxHp * 0.045 && Math.random() < 0.3) troopCasualty(g, 'gunner', 'A heavy hit killed a gunner.');
  if (t.hp <= 0 && t === g.player && t.crew.phoenix > 0 && g.phoenixCd <= 0) {
    // Phoenix Feather: rise from the ashes once every 3 minutes.
    g.phoenixCd = 180;
    t.hp = t.stats.maxHp * t.crew.phoenix;
    t.addBuff('invuln', 1.5);
    g.fx.push({ t: 'ring', x: t.x, y: t.y, r: t.stats.length, color: '#ff6d00' });
    g.float(t.x, t.y, 'PHOENIX!', '#ff9100', true);
    g.hooks.sound('legendary');
  }
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

/** Area damage centred at (x,y) against one side. `quiet` skips the shake and boom sound (fragments, strikes). */
export function explode(g: Game, x: number, y: number, r: number, dmg: number, team: 'player' | 'enemy', o: HitOpts = {}, color = '#ffab40', quiet = false): void {
  g.fx.push({ t: 'boom', x, y, r, color, big: r > 3 });
  if (!quiet) {
    if (r >= 2.5) g.fx.push({ t: 'shake', amt: Math.min(0.8, r * 0.12) });
    g.hooks.sound(r >= 2.5 ? 'bigboom' : 'boom', x, y, Math.min(1, 0.4 + r * 0.15));
  }
  if (team === 'player') {
    for (const e of g.enemiesNear(x, y, r + 2)) {
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
