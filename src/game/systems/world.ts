import { getItem } from '../../shared/items';
import { rollDropRarity, rollWeaponKey } from '../../shared/loot';
import { TER, ZONE } from '../../shared/map';
import { liquidHurts } from './drives';
import { stormVision } from './weather';
import { NODE_INFO, RUNE_INFO, SITE_INFO, threatAt } from '../../shared/mapgen';
import { HAZARD_INFO } from '../../shared/types';
import { ZONES } from '../../shared/zones';
import { PACK_INFO } from '../cards';
import { makeRecruit } from '../crew';
import { rollChest } from '../chests';
import { isPack } from '../entities';
import type { Game } from '../game';
import type { Tank } from '../tank';
import { buildOutpost, newWeapon } from '../templates';
import { healPlayer, injureRandomCrew, damageTank } from './damage';

/* ---------------------------------------------------------------------- */
/* Harvesting                                                              */
/* ---------------------------------------------------------------------- */

const harvestTimer = { t: 0 };

/** The fortress drills any node it parks on or next to, without being told. */
function autoHarvest(g: Game): void {
  const p = g.player;
  // Not while driving somewhere you were sent: it would cancel the order to drive off a node.
  if (Math.abs(p.speed) > 1.2 || p.path.length) return;
  let best = 0;
  let bd = 1.5;
  for (const n of g.gen.nodes) {
    if (n.respawnAt > 0 || NODE_INFO[n.type].tier > p.stats.drill) continue;
    if (Math.abs(n.x - p.x) > p.stats.length || Math.abs(n.y - p.y) > p.stats.length) continue;
    // Under a 200 m hull several nodes can be at the edge at once: prefer the one nearest the middle.
    const d = p.edgeDist(n.x, n.y) + Math.hypot(n.x - p.x, n.y - p.y) * 0.001;
    if (d < bd) {
      bd = d;
      best = n.id;
    }
  }
  if (best && !Object.values(g.squads).some((s) => s?.target?.kind === 'node' && s.target.id === best)) g.harvestId = best;
}

export function updateHarvest(g: Game, dt: number): void {
  if (!g.harvestId) autoHarvest(g);
  if (!g.harvestId) return;
  const n = g.gen.nodes.find((k) => k.id === g.harvestId);
  if (!n || n.respawnAt > 0) {
    g.harvestId = 0;
    return;
  }
  const p = g.player;
  const info = NODE_INFO[n.type];
  if (p.edgeDist(n.x, n.y) > 3.2) {
    // Still driving there (ordered), or drove away from a node it was drilling on its own.
    if (!p.goal) g.harvestId = 0;
    return;
  }
  if (info.tier > p.stats.drill) {
    g.hooks.toast(`${info.name} needs a Mk${info.tier} Drill Rig (BASE > Shop > Resources).`, '#ff8a80');
    g.harvestId = 0;
    return;
  }
  if (p.path.length && p.edgeDist(n.x, n.y) < 1) {
    p.path = [];
    p.goal = null;
  }
  let rate = p.stats.harvest * g.statMods.harvest * (p.hasBuff('harvestUp') ? 1 + p.buff('harvestUp')!.v : 1);
  if (g.runeBuff?.rune === 'gilded') rate *= 1.3;
  harvestTimer.t += dt * rate;
  if (Math.random() < dt * 8) g.fx.push({ t: 'spark', x: n.x, y: n.y, color: info.color, n: 1 });
  if (harvestTimer.t < 0.55) return;
  harvestTimer.t = 0;
  const amt = Math.min(n.amount, info.tier === 1 ? 2 : 1);
  if (!p.cargo.canFit(info.item, amt)) {
    g.hooks.toast('Cargo hold is full!', '#ff8a80');
    g.harvestId = 0;
    return;
  }
  n.amount -= amt;
  g.give(info.item, amt);
  g.stats.harvested += amt;
  g.objectiveCounters.harvest = (g.objectiveCounters.harvest ?? 0) + amt;
  g.hooks.sound('harvest', n.x, n.y, 0.4);
  g.gainXp(0.3);
  if (n.amount <= 0) {
    n.respawnAt = g.time + 360;
    g.harvestId = 0;
    g.fx.push({ t: 'boom', x: n.x, y: n.y, r: 1, color: info.color });
  }
}

export function respawnNodes(g: Game): void {
  for (const n of g.gen.nodes) {
    if (n.respawnAt > 0 && g.time >= n.respawnAt) {
      n.respawnAt = 0;
      n.amount = n.max;
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Loot areas (sites)                                                      */
/* ---------------------------------------------------------------------- */

export const SITE_RADIUS = 7;
export const SITE_TIME = 10;

export function updateSites(g: Game, dt: number): void {
  const p = g.player;
  const s = g.gen.sites.find((k) => k.id === g.site.id);
  if (!s) {
    // Start scavenging when parked in a ready site.
    for (const k of g.gen.sites) {
      if (k.readyAt > g.time) continue;
      // Measured from the hull: a Titan parks right over a site.
      if (p.edgeDist(k.x, k.y) < SITE_RADIUS) {
        g.site = { id: k.id, t: 0, wave: 0 };
        g.hooks.toast(`Scavenging ${k.name}... hold position!`, '#ffd740');
        g.hooks.sound('alarm');
        break;
      }
    }
    return;
  }
  if (p.edgeDist(s.x, s.y) > SITE_RADIUS + 1 || p.dead) {
    g.site = { id: 0, t: 0, wave: 0 };
    g.hooks.toast('Scavenging interrupted. Drive back in to resume.', '#ff8a80');
    return;
  }
  g.site.t += dt;
  // Defenders pour in while you scavenge.
  const waveAt = [1, 4.5, 8];
  if (g.site.wave < waveAt.length && g.site.t >= waveAt[g.site.wave]) {
    g.site.wave++;
    const n = 1 + Math.floor(s.threat * 0.5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 5;
      spawnFor(g, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, s.threat, s.zone, true);
    }
  }
  if (g.site.t >= SITE_TIME) {
    g.site = { id: 0, t: 0, wave: 0 };
    s.readyAt = g.time + 420;
    g.stats.sites++;
    g.objectiveCounters.sites = (g.objectiveCounters.sites ?? 0) + 1;
    g.dropLoot(s.x, s.y, `site_${s.kind}`, 3 + Math.floor(s.threat / 2));
    if (Math.random() < 0.4) g.dropPickup(s.x, s.y, { kind: 'weapon', weapon: newWeapon(rollWeaponKey(Math.random), rollDropRarity(Math.random, s.threat, 0.2)) });
    const roll = Math.random();
    if (roll < 0.3) g.dropPickup(s.x, s.y, { kind: 'chest', chest: 'choice', chestThreat: s.threat });
    else if (roll < 0.55) g.dropPickup(s.x, s.y, { kind: 'chest', chest: 'supply', chestThreat: s.threat });
    if (Math.random() < 0.35) g.dropPickup(s.x, s.y, { kind: 'chest', chest: 'pack', chestThreat: s.threat });
    g.hooks.toast(`${s.name} scavenged!${roll < 0.3 ? ' A This-or-That chest turned up!' : ''}`, '#76ff03');
    g.hooks.sound('chest');
    g.gainXp(25 + s.threat * 10);
  }
}

/** Spawns an appropriate enemy for a zone. */
export function spawnFor(g: Game, x: number, y: number, threat: number, zone: number, aggro = false): void {
  const kind = pickKind(threat, zone);
  const elite = threat >= 2.5 && Math.random() < 0.08;
  const e = g.spawnEnemy(kind, x, y, threat, elite);
  e.aggro = aggro;
}

import { pickZoneKind } from '../enemyDefs';

/** A creature from the zone's roster that fits the spot's danger. */
export function pickKind(threat: number, zone: number): string {
  return pickZoneKind(zone, threat);
}

/* ---------------------------------------------------------------------- */
/* Rune altars                                                             */
/* ---------------------------------------------------------------------- */

export function updateRunes(g: Game, dt: number): void {
  const p = g.player;
  for (const r of g.gen.runes) {
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    if (r.readyAt > g.time) continue;
    const camp = g.runeCamps.get(r.id);
    if (!camp && (p.fortress ? p.edgeDist(r.x, r.y) < 70 : d < 34)) {
      // Spawn the guardian camp.
      const ids: number[] = [];
      const threat = r.threat + 0.4;
      const boss = g.spawnEnemy('guardian', r.x + 2, r.y, threat, true);
      boss.camp = r.id;
      boss.name = `${RUNE_INFO[r.rune].name} Guardian`;
      ids.push(boss.id);
      const n = 2 + Math.floor(r.threat / 1.5);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const e = g.spawnEnemy(pickKind(threat, r.zone), r.x + Math.cos(a) * 4, r.y + Math.sin(a) * 4, threat);
        e.camp = r.id;
        ids.push(e.id);
      }
      for (const id of ids) {
        const e = g.enemyById(id)!;
        e.homeX = e.x;
        e.homeY = e.y;
      }
      g.runeCamps.set(r.id, ids);
      continue;
    }
    if (!camp) continue;
    const alive = camp.filter((id) => g.enemyById(id));
    g.runeCamps.set(r.id, alive);
    if (alive.length) {
      if (g.runeClaim.id === r.id) g.runeClaim = { id: 0, t: 0 };
      continue;
    }
    // Camp cleared: park next to the altar to claim it.
    if (d < p.stats.length / 2 + 4.5) {
      if (g.runeClaim.id !== r.id) g.runeClaim = { id: r.id, t: 0 };
      g.runeClaim.t += dt;
      if (g.runeClaim.t >= 2) {
        g.runeClaim = { id: 0, t: 0 };
        r.readyAt = g.time + 300;
        g.runeCamps.delete(r.id);
        g.runeBuff = { rune: r.rune, t: 90 };
        g.applyCrew();
        g.stats.runes++;
        g.objectiveCounters.runes = (g.objectiveCounters.runes ?? 0) + 1;
        g.dropPickup(r.x, r.y, { kind: 'chest', chest: 'rune', chestThreat: r.threat });
        g.dropPickup(r.x, r.y, { kind: 'chest', chest: 'rare_pack', chestThreat: r.threat });
        g.hooks.toast(`${RUNE_INFO[r.rune].name} claimed: ${RUNE_INFO[r.rune].buff} for 90s. A Rune Chest dropped!`, RUNE_INFO[r.rune].color);
        g.hooks.sound('rune');
        g.fx.push({ t: 'ring', x: r.x, y: r.y, r: 8, color: RUNE_INFO[r.rune].color });
        g.gainXp(50 + r.threat * 15);
      }
    } else if (g.runeClaim.id === r.id) g.runeClaim = { id: 0, t: 0 };
  }
}

/* ---------------------------------------------------------------------- */
/* Outposts                                                                */
/* ---------------------------------------------------------------------- */

export function updateOutposts(g: Game): void {
  const p = g.player;
  for (const o of g.gen.outposts) {
    if (g.outpostsDown.has(o.id)) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    const live = g.outpostTanks.get(o.id);
    const on = g.player.fortress ? 280 : 75;
    if (!live && d < on) {
      const t = buildOutpost(o.threat, g.seed + o.id * 77);
      t.x = o.x;
      t.y = o.y;
      t.rot = o.rot;
      for (const m of t.modules) m.aim = t.rot;
      (t as Tank & { outpostId?: number }).outpostId = o.id;
      g.outpostTanks.set(o.id, t);
      g.tanks.push(t);
    } else if (live && d > on * 1.4 && !live.dead) {
      g.tanks = g.tanks.filter((t) => t !== live);
      g.outpostTanks.delete(o.id);
    }
  }
}

/** Called when any tank's hull hits zero. */
export function onTankDestroyed(g: Game, t: Tank): void {
  if (t.dead) return;
  t.dead = true;
  g.fx.push({ t: 'boom', x: t.x, y: t.y, r: t.stats.length * 0.6, color: '#ff6d00', big: true });
  g.fx.push({ t: 'shake', amt: 1 });
  g.hooks.sound('bigboom', t.x, t.y);
  if (t === g.player) {
    g.onPlayerDestroyed?.();
    return;
  }
  if (t === g.outrider) {
    g.onOutriderDestroyed?.();
    return;
  }
  if (t.kind === 'remote') return;
  const threat = t.threat;
  if (t.kind === 'rival') {
    // A rival dreadnought: the big prize.
    const lvl = g.commander.level;
    g.stats.rivals = (g.stats.rivals ?? 0) + 1;
    g.objectiveCounters.rivals = (g.objectiveCounters.rivals ?? 0) + 1;
    g.dropLoot(t.x, t.y, 'raider', 5 + Math.floor(lvl / 3));
    g.dropStacks(t.x, t.y, [{ id: 'tech_parts', n: 3 + Math.floor(lvl / 4) }]);
    g.dropPickup(t.x, t.y, { kind: 'chest', chest: lvl >= 20 ? 'legendary_pack' : 'epic_pack', chestThreat: threat });
    const best = t.weapons().sort((a, b) => (b.weapon?.rarity ?? 0) - (a.weapon?.rarity ?? 0))[0];
    if (best?.weapon) g.dropPickup(t.x, t.y, { kind: 'weapon', weapon: best.weapon });
    g.gainXp(150 + 40 * lvl);
    g.hooks.toast(`RIVAL DESTROYED: ${t.name}! Its best gun, an Epic pack and Salvaged Tech are yours.`, '#76ff03');
    g.hooks.sound('levelup');
    return;
  }
  if (t.kind === 'outpost') {
    const id = (t as Tank & { outpostId?: number }).outpostId ?? 0;
    g.outpostsDown.add(id);
    g.outpostTanks.delete(id);
    g.stats.outposts++;
    g.objectiveCounters.outposts = (g.objectiveCounters.outposts ?? 0) + 1;
    g.dropLoot(t.x, t.y, 'outpost', 4);
    g.dropPickup(t.x, t.y, { kind: 'chest', chest: 'choice', chestThreat: threat });
    g.dropPickup(t.x, t.y, { kind: 'chest', chest: threat >= 5 ? 'epic_pack' : 'rare_pack', chestThreat: threat });
    const ws = t.weapons().filter(() => Math.random() < 0.35);
    for (const m of ws) if (m.weapon) g.dropPickup(t.x, t.y, { kind: 'weapon', weapon: m.weapon });
    // A prisoner always escapes the outpost cells.
    const c = makeRecruit(Math.random, threat);
    c.level = Math.min(10, c.level + 1);
    if (g.addCrew(c)) g.hooks.toast(`Freed a prisoner: ${c.name} joins your crew!`, '#76ff03');
    g.hooks.toast('Outpost destroyed!', '#ffab40');
    g.gainXp(100 + threat * 35);
  } else {
    g.stats.raiders++;
    g.objectiveCounters.raiders = (g.objectiveCounters.raiders ?? 0) + 1;
    g.dropLoot(t.x, t.y, 'raider', 2 + Math.floor(threat / 2));
    if (threat >= 2 || Math.random() < 0.4) g.dropStacks(t.x, t.y, [{ id: 'tech_parts', n: 1 + Math.floor(threat / 2.5) }]);
    g.dropPickup(t.x, t.y, { kind: 'chest', chest: threat >= 4 && Math.random() < 0.4 ? 'rare_pack' : 'pack', chestThreat: threat });
    const ws = t.weapons();
    if (ws.length && Math.random() < 0.45) {
      const m = ws[Math.floor(Math.random() * ws.length)];
      if (m.weapon) g.dropPickup(t.x, t.y, { kind: 'weapon', weapon: m.weapon });
    }
    if (Math.random() < 0.25) {
      const c = makeRecruit(Math.random, threat);
      if (g.addCrew(c)) g.hooks.toast(`${c.name} climbed out of the wreck and joined you!`, '#76ff03');
    }
    g.gainXp(40 + threat * 15);
  }
}

/* ---------------------------------------------------------------------- */
/* Pickups                                                                 */
/* ---------------------------------------------------------------------- */

export function updatePickups(g: Game, dt: number): void {
  const p = g.player;
  const magnet = p.hasBuff('magnet') ? p.buff('magnet')!.v : 0;
  for (let i = g.pickups.length - 1; i >= 0; i--) {
    const k = g.pickups[i];
    k.life -= dt;
    k.delay -= dt;
    if (k.z > 0 || k.vz > 0) {
      k.vz -= 20 * dt;
      k.z = Math.max(0, k.z + k.vz * dt);
      if (k.z <= 0) k.vz = 0;
    }
    k.x += k.vx * dt;
    k.y += k.vy * dt;
    k.vx *= Math.pow(0.05, dt);
    k.vy *= Math.pow(0.05, dt);
    if (k.life <= 0) {
      g.pickups.splice(i, 1);
      continue;
    }
    if (k.delay > 0 || p.dead) continue;
    const edge = p.edgeDist(k.x, k.y);
    const range = 4 + magnet;
    if (edge < range) {
      const dx = p.x - k.x, dy = p.y - k.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = 14 + magnet;
      k.x += (dx / d) * pull * dt;
      k.y += (dy / d) * pull * dt;
    }
    if (edge < 0.6) {
      if (collect(g, k)) g.pickups.splice(i, 1);
    }
  }
}

function collect(g: Game, k: import('../entities').Pickup): boolean {
  if (k.kind === 'stack' && k.stack) {
    const left = g.player.cargo.add(k.stack.id, k.stack.n);
    const got = k.stack.n - left;
    if (got > 0) {
      g.float(g.player.x, g.player.y, `+${got} ${getItem(k.stack.id).name}`, k.stack.id === 'tech_parts' ? '#80d8ff' : '#ffe082');
      g.hooks.sound('pickup', k.x, k.y, 0.5);
    }
    if (left > 0) {
      k.stack.n = left;
      if (!g.timers.recruit) g.hooks.toast('Cargo hold is full!', '#ff8a80');
      k.delay = 3;
      return false;
    }
    return true;
  }
  if (k.kind === 'weapon' && k.weapon) {
    g.addWeapon(k.weapon);
    g.hooks.toast(`Got a weapon! Mount it in ARSENAL (V), or tap a turret in your base.`, '#ffd740');
    g.hooks.sound('chest');
    g.objectiveCounters.weapons = (g.objectiveCounters.weapons ?? 0) + 1;
    return true;
  }
  if (k.kind === 'chest' && k.chest && isPack(k.chest)) {
    // Card packs go to your stash: open them from the HUD when it suits you.
    g.packs.push(k.chest);
    g.stats.chests++;
    g.objectiveCounters.packs_found = (g.objectiveCounters.packs_found ?? 0) + 1;
    g.float(g.player.x, g.player.y, `+${PACK_INFO[k.chest].name}`, PACK_INFO[k.chest].color, true);
    g.hooks.sound('chest');
    return true;
  }
  if (k.kind === 'chest' && k.chest) {
    const rewards = rollChest(g, k.chest, k.chestThreat ?? g.threatHere());
    g.stats.chests++;
    g.objectiveCounters.chests = (g.objectiveCounters.chests ?? 0) + 1;
    g.hooks.chest(k.chest, rewards, k.chest === 'choice');
    return true;
  }
  return true;
}

/* ---------------------------------------------------------------------- */
/* Hazards and vision                                                      */
/* ---------------------------------------------------------------------- */

export function updateHazards(g: Game, dt: number): void {
  const p = g.player;
  g.timers.hazard -= dt;
  // Wading through lava or acid without the drive train for it.
  const ter = g.map.terAt(p.x, p.y);
  if (liquidHurts(p.drive, ter)) {
    const lava = ter === TER.LAVA;
    damageTank(g, p, p.stats.maxHp * (lava ? 0.02 : 0.014) * dt, { silent: true });
    g.hazardWarn = lava ? 'Lava! Magma Treads or Hover Skirts cross it safely.' : 'Acid! Only Hover Skirts cross it safely.';
    if (Math.random() < dt * 8) g.fx.push({ t: 'spark', x: p.x + (Math.random() - 0.5) * p.stats.width, y: p.y + (Math.random() - 0.5) * p.stats.length, color: lava ? '#ff6d00' : '#76ff03', n: 2 });
    return;
  }
  const zone = ZONES[g.map.zoneAt(p.x, p.y)];
  const hz = zone?.hazard;
  if (!hz || p.stats.protects.has(hz)) {
    g.hazardWarn = null;
    return;
  }
  g.hazardWarn = `${HAZARD_INFO[hz].name}! Build ${zone.protect === 'thermal' ? 'a Thermal Regulator' : zone.protect === 'rad_baffles' ? 'Rad Baffles' : 'Sealant Pumps'}.`;
  if (hz === 'heat' || hz === 'toxic') damageTank(g, p, p.stats.maxHp * (hz === 'heat' ? 0.012 : 0.015) * dt, { silent: true });
  if (hz === 'rad') damageTank(g, p, p.stats.maxHp * 0.004 * dt, { silent: true });
  if (g.timers.hazard <= 0) {
    g.timers.hazard = hz === 'cold' ? 6 : 4;
    if (Math.random() < 0.5) injureRandomCrew(g, 25, hz === 'rad' ? 'got radiation sickness' : hz === 'cold' ? 'has frostbite' : hz === 'toxic' ? 'breathed the fumes' : 'collapsed from the heat');
  }
  if (hz === 'cold') p.addBuff('chill', 0.3, 0.35);
}

export function updateVision(g: Game): void {
  const eyes: { x: number; y: number; r: number }[] = [];
  if (!g.player.dead) eyes.push({ x: g.player.x, y: g.player.y, r: g.player.stats.vision * stormVision(g) });
  if (g.outrider && !g.outrider.dead) eyes.push({ x: g.outrider.x, y: g.outrider.y, r: 12 });
  g.fog.update(g.player.x, g.player.y, eyes);
}

/** Marks every loot area and rune nearby as explored (Treasure Sense). */
export function revealFeatures(g: Game): void {
  for (const f of [...g.gen.sites, ...g.gen.runes]) g.fog.explore(f.x, f.y, 8);
}

export function zoneName(g: Game): string {
  const z = g.map.zoneAt(g.player.x, g.player.y);
  return z === ZONE.EDGE ? 'The Wall' : ZONES[z]?.name ?? '';
}

export { SITE_INFO, threatAt, healPlayer };
