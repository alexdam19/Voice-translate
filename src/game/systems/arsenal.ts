import { ACTIVE_SLOTS } from '../../shared/constants';
import { nearestClear } from '../../shared/motion';
import { rollAffixes, WEAPONS } from '../../shared/weapons';
import { ACTIVES, ULTIMATES, type UltDef } from '../arsenal';
import { levelMult, MODULES } from '../defs';
import { eid, type Projectile } from '../entities';
import type { Game } from '../game';
import type { ModuleInst } from '../tank';
import { TECH_BY_ID, type TreeKind } from '../tech';
import { layMines, spawnDragon, spawnDrones, spawnJet, spawnMech } from './allies';
import { damageEnemy, damageTank, explode } from './damage';
import { resolveTank, tankNav } from './movement';
import { skyStrike } from './weapons';

/* ---------------------------------------------------------------------- */
/* Speeds                                                                  */
/* ---------------------------------------------------------------------- */

/** Research points per second: the bridge crew manage 0.5, Science Labs add the rest. */
export function researchSpeed(g: Game): number {
  const p = g.player;
  return (0.5 + p.stats.lab) * (1 + g.crewFx.researchSpeed) * (1 + p.crew.research * 0.5);
}

export function forgeSpeed(g: Game): number {
  const lvl = g.player.stats.forge;
  return lvl ? levelMult(lvl) * (1 + g.crewFx.forgeSpeed) : 0;
}

export function activeCooldown(g: Game, key: string): number {
  return (ACTIVES[key]?.cd ?? 20) * (1 - Math.min(0.55, g.player.crew.actcd));
}

export function armedUlt(g: Game): { m: ModuleInst; def: UltDef } | null {
  const m = g.ultModule ? g.player.moduleById(g.ultModule) : undefined;
  const key = m ? MODULES[m.key].ult : undefined;
  return m && key ? { m, def: ULTIMATES[key] } : null;
}

/* ---------------------------------------------------------------------- */
/* Per-frame upkeep                                                        */
/* ---------------------------------------------------------------------- */

export function updateArsenal(g: Game, dt: number): void {
  const p = g.player;
  // Active cooldowns.
  for (const m of p.modules) if (MODULES[m.key].active && m.cd > 0) m.cd = Math.max(0, m.cd - dt);
  // Ultimate charge: time plus damage dealt (damage can at most triple the rate).
  const u = armedUlt(g);
  if (u && !p.dead) {
    const bonus = 1 + p.crew.ult + p.stats.uplink;
    if (g.ultCharge < 1) {
      const per = u.def.charge * 30;
      const take = Math.min(g.ultBank / per, (dt * 2) / u.def.charge);
      g.ultBank -= take * per;
      g.ultCharge = Math.min(1, g.ultCharge + (dt / u.def.charge + take) * bonus);
      if (g.ultCharge >= 1) {
        g.hooks.toast(`${u.def.name} is ready! Press R.`, u.def.color);
        g.hooks.sound('levelup');
      }
    } else g.ultBank = 0;
  }
  if (g.timeStop > 0) g.timeStop = Math.max(0, g.timeStop - dt);
  updateOrbital(g, dt);
  updateStorm(g, dt);
  if (g.mode === 'world') {
    updateResearch(g, dt);
    updateForge(g, dt);
  }
}

function updateResearch(g: Game, dt: number): void {
  const speed = researchSpeed(g);
  for (const kind of ['military', 'personnel'] as TreeKind[]) {
    const job = g.research[kind];
    if (!job) continue;
    if (kind === 'personnel' && g.player.stats.lab <= 0) continue; // needs a Science Lab to keep going
    job.t += dt * speed;
    if (job.t < job.total) continue;
    g.research[kind] = null;
    const node = TECH_BY_ID.get(job.id);
    if (!node) continue;
    g.tech.add(node.id);
    g.applyCrew();
    g.syncArsenal();
    g.objectiveCounters.research = (g.objectiveCounters.research ?? 0) + 1;
    const what = node.unlocks?.length ? ` Now you can build: ${node.unlocks.map((k) => MODULES[k]?.name ?? WEAPONS[k]?.name ?? k).join(', ')}.` : '';
    g.hooks.toast(`Research complete: ${node.name}.${what}`, '#69f0ae');
    g.hooks.sound('levelup');
  }
}

function findWeapon(g: Game, uid: number) {
  return g.armory.find((w) => w.uid === uid) ?? g.player.modules.find((m) => m.weapon?.uid === uid)?.weapon ?? null;
}

function updateForge(g: Game, dt: number): void {
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
  g.hooks.toast(`Forged: ${WEAPONS[w.key].name} is now ${w.rarity + 1}★! It gained a tree point (ARSENAL, V).`, '#ffd740');
  g.hooks.sound(w.rarity >= 4 ? 'legendary' : 'chest');
}

/* ---------------------------------------------------------------------- */
/* Arsenal actives (keys 1-4)                                              */
/* ---------------------------------------------------------------------- */

function clampTo(g: Game, x: number, y: number, range?: number): [number, number] {
  const p = g.player;
  if (!range) return [x, y];
  const d = Math.hypot(x - p.x, y - p.y);
  if (d <= range) return [x, y];
  const k = range / d;
  return [p.x + (x - p.x) * k, p.y + (y - p.y) * k];
}

export function castActive(g: Game, slot: number, ax: number, ay: number): boolean {
  if (slot < 0 || slot >= ACTIVE_SLOTS || g.player.dead) return false;
  const p = g.player;
  const m = g.activeSlots[slot] ? p.moduleById(g.activeSlots[slot]) : undefined;
  if (!m) {
    g.hooks.toast('No active in that slot. Build a Salvo Rack, Jet Hangar, Drone Bay... (BASE > Actives), research them first (T).', '#ff8a80');
    return false;
  }
  const key = MODULES[m.key].active!;
  const def = ACTIVES[key];
  if (m.cd > 0) return false;
  const [x, y] = clampTo(g, ax, ay, def.range);
  const P = levelMult(m.lvl);
  runActive(g, key, m, x, y, P);
  m.cd = activeCooldown(g, key);
  g.hooks.sound('ability');
  g.float(p.x, p.y - 0.6, def.name.toUpperCase(), def.color, true);
  g.objectiveCounters.actives = (g.objectiveCounters.actives ?? 0) + 1;
  return true;
}

function lob(g: Game, kind: Projectile['kind'], x0: number, y0: number, x: number, y: number, flight: number, dmg: number, splash: number, color: string, size: number, z0 = 1.4): void {
  g.projectiles.push({
    id: eid(), x: x0, y: y0, z: z0, vx: (x - x0) / flight, vy: (y - y0) / flight, vz: (9.8 * flight) / 2 - z0 / flight, team: 'player', kind, dmg, splash, pierce: 0,
    life: 0, maxLife: flight, color, homing: 0, targetId: 0, arc: true, tx: x, ty: y, burn: 0, crit: false, lifesteal: 0, srcTank: g.player.id, hit: [], flyer: 0,
    interceptable: false, hp: 1, size,
  });
}

/** A purely visual body falling from the sky (nuke, meteors). */
function fallFromSky(g: Game, kind: Projectile['kind'], x: number, y: number, t: number, color: string, size: number, z0 = 36): void {
  const ox = x - 4, oy = y - 6;
  g.projectiles.push({
    id: eid(), x: ox, y: oy, z: z0, vx: (x - ox) / t, vy: (y - oy) / t, vz: (4.9 * t * t - z0) / t, team: 'player', kind, dmg: 0, splash: 0, pierce: 0,
    life: 0, maxLife: t, color, homing: 0, targetId: 0, arc: true, tx: x, ty: y, burn: 0, crit: false, lifesteal: 0, srcTank: g.player.id, hit: [], flyer: 0,
    interceptable: false, hp: 1, size, visual: true,
  });
}

function runActive(g: Game, key: string, m: ModuleInst, x: number, y: number, P: number): void {
  const p = g.player;
  const src = p.moduleWorld(m);
  switch (key) {
    case 'salvo':
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 4;
        lob(g, 'missile', src.x, src.y, x + Math.cos(a) * r, y + Math.sin(a) * r, 0.7 + i * 0.05, 45 * P, 1.8, '#ff9100', 0.22);
      }
      g.hooks.sound('rocket', src.x, src.y, 1);
      break;
    case 'smoke':
      p.addBuff('smoke', 5 * P);
      g.zones.push({ id: eid(), x: p.x, y: p.y, r: p.stats.length * 0.8, t: 5 * P, kind: 'smoke', dps: 0, team: 'player' });
      for (const e of g.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < 22) e.aggro = false;
      break;
    case 'drones':
      spawnDrones(g, Math.round(4 * P), 22 * P, 18, 120 * P);
      break;
    case 'mines':
      layMines(g, Math.round(8 * P), 120 * P);
      break;
    case 'jets': {
      const n = Math.round(2 * P);
      for (let i = 0; i < n; i++) spawnJet(g, src.x, src.y, p.rot + (i - (n - 1) / 2) * 0.4, x, y, 40 * P, 14);
      break;
    }
    case 'blink': {
      const need = Math.max(0.8, p.stats.radius * 0.85);
      const spot = nearestClear(g.map, x, y, need, tankNav(p), 10);
      if (!spot) {
        g.hooks.toast('No room to blink there.', '#ff8a80');
        m.cd = 1;
        return;
      }
      g.fx.push({ t: 'teleport', x: p.x, y: p.y });
      p.x = spot[0] + 0.5;
      p.y = spot[1] + 0.5;
      resolveTank(g, p);
      p.path = [];
      p.goal = null;
      g.fx.push({ t: 'teleport', x: p.x, y: p.y });
      for (const e of g.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < 6 + e.r) e.stun = Math.max(e.stun, 1.5 * P * (e.titan ? 0.3 : 1));
      explode(g, p.x, p.y, 6, 80 * P, 'player', { srcTank: p.id }, '#18ffff');
      break;
    }
    case 'dome':
      p.addBuff('dome', 4 * P);
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r: p.stats.length * 0.8, color: '#69f0ae' });
      break;
    case 'airstrike': {
      const n = Math.round(14 * P);
      const a = Math.atan2(y - p.y, x - p.x);
      const x0 = p.x + Math.cos(a) * 5, y0 = p.y + Math.sin(a) * 5;
      const len = Math.max(8, Math.hypot(x - x0, y - y0) + 6);
      spawnJet(g, x0 - Math.cos(a) * 10, y0 - Math.sin(a) * 10, a, x0 + Math.cos(a) * 60, y0 + Math.sin(a) * 60, 0, 3);
      for (let i = 0; i < n; i++) {
        const d = (i / Math.max(1, n - 1)) * len;
        const bx = x0 + Math.cos(a) * d + (Math.random() - 0.5) * 1.5, by = y0 + Math.sin(a) * d + (Math.random() - 0.5) * 1.5;
        g.telegraphs.push({ id: eid(), x: bx, y: by, shape: 'circle', r: 2.4, a: 0, len: 0, t: 0, total: 0.9 + i * 0.07, color: '#ff6e40', team: 'player', dmg: 0,
          onDone: () => explode(g, bx, by, 2.4, 90 * P, 'player', { srcTank: p.id }, '#ff6e40', i % 3 !== 0) });
      }
      break;
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Ultimates (key R)                                                       */
/* ---------------------------------------------------------------------- */

export function castUltimate(g: Game, ax: number, ay: number): boolean {
  const p = g.player;
  if (p.dead) return false;
  const u = armedUlt(g);
  if (!u) {
    g.hooks.toast('No ultimate. Research one (Nuclear Program, Mech Drop, Meteor Storm...) and build its module.', '#ff8a80');
    return false;
  }
  if (g.ultCharge < 1) {
    g.hooks.toast(`${u.def.name} is charging (${Math.floor(g.ultCharge * 100)}%). Deal damage to charge it faster.`, '#bdbdbd');
    return false;
  }
  const [x, y] = clampTo(g, ax, ay, u.def.range);
  const P = levelMult(u.m.lvl);
  g.ultCharge = 0;
  g.ultBank = 0;
  runUltimate(g, u.def.key, x, y, P);
  g.float(p.x, p.y - 0.8, u.def.name.toUpperCase(), u.def.color, true);
  g.objectiveCounters.ultimates = (g.objectiveCounters.ultimates ?? 0) + 1;
  return true;
}

function runUltimate(g: Game, key: string, x: number, y: number, P: number): void {
  const p = g.player;
  switch (key) {
    case 'nuke': {
      const R = 13, dmg = 2500 * P;
      g.hooks.toast('☢ NUCLEAR LAUNCH DETECTED ☢', '#ffea00');
      g.hooks.sound('alarm');
      setTimeout(() => g.hooks.sound('alarm'), 900);
      fallFromSky(g, 'nuke', x, y, 3.2, '#eceff1', 0.9, 48);
      g.telegraphs.push({ id: eid(), x, y, shape: 'circle', r: R, a: 0, len: 0, t: 0, total: 3.2, color: '#ffea00', team: 'player', dmg: 0,
        onDone: () => {
          g.fx.push({ t: 'nuke', x, y, r: R });
          g.fx.push({ t: 'shake', amt: 2.5 });
          g.hooks.sound('bigboom');
          explode(g, x, y, R, dmg, 'player', { srcTank: p.id, burn: 60 * P }, '#ffea00');
          g.zones.push({ id: eid(), x, y, r: R * 0.8, t: 12, kind: 'rad', dps: 60 * P, team: 'player' });
        } });
      break;
    }
    case 'mech':
      g.telegraphs.push({ id: eid(), x, y, shape: 'circle', r: 4, a: 0, len: 0, t: 0, total: 1.2, color: '#ffab40', team: 'player', dmg: 0, onDone: () => spawnMech(g, x, y, P) });
      fallFromSky(g, 'boulder', x, y, 1.2, '#ffab40', 1.2, 30);
      break;
    case 'orbital_laser':
      g.orbital = { x, y, t: 7, dps: 350 * P };
      g.hooks.sound('rail');
      break;
    case 'meteors': {
      const n = Math.round(20 * P);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 10;
        const mx = x + Math.cos(a) * r, my = y + Math.sin(a) * r;
        const t = 0.8 + (i / n) * 4;
        fallFromSky(g, 'meteor', mx, my, t, '#ff9100', 0.7, 26);
        g.telegraphs.push({ id: eid(), x: mx, y: my, shape: 'circle', r: 3, a: 0, len: 0, t: 0, total: t, color: '#ff9100', team: 'player', dmg: 0,
          onDone: () => {
            explode(g, mx, my, 3, 240 * P, 'player', { srcTank: p.id }, '#ff6d00', i % 2 === 1);
            if (i % 3 === 0) g.zones.push({ id: eid(), x: mx, y: my, r: 2.2, t: 4, kind: 'fire', dps: 40 * P, team: 'player' });
          } });
      }
      break;
    }
    case 'timestop': {
      const dur = 6 * P;
      g.timeStop = dur;
      for (const e of g.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < 45) e.stun = Math.max(e.stun, dur);
      for (const t of g.tanks) if (!t.dead && t.team === 'enemy' && Math.hypot(t.x - p.x, t.y - p.y) < 45) t.addBuff('stun', dur);
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r: 45, color: '#18ffff' });
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r: 20, color: '#18ffff' });
      g.hooks.toast('Time stands still...', '#18ffff');
      break;
    }
    case 'dragon':
      spawnDragon(g, x, y, P);
      g.hooks.toast('A dragon answers the call!', '#ff3d00');
      break;
    case 'cataclysm':
      g.storm = { t: 10, P, cd: 0 };
      g.hooks.toast('The sky splits open!', '#82b1ff');
      g.fx.push({ t: 'shake', amt: 1 });
      break;
  }
  g.hooks.sound('ability');
}

function updateOrbital(g: Game, dt: number): void {
  const o = g.orbital;
  if (!o) return;
  o.t -= dt;
  if (o.t <= 0 || g.player.dead) {
    g.orbital = null;
    return;
  }
  // The beam drifts toward the cursor.
  const dx = g.aim.x - o.x, dy = g.aim.y - o.y;
  const d = Math.hypot(dx, dy);
  const step = Math.min(d, 9 * dt);
  if (d > 0.01) {
    o.x += (dx / d) * step;
    o.y += (dy / d) * step;
  }
  const r = 3.5;
  for (const e of g.enemies) {
    if (e.hp <= 0 || e.burrowed || Math.hypot(e.x - o.x, e.y - o.y) > r + e.r) continue;
    damageEnemy(g, e, o.dps * dt, { srcTank: g.player.id, silent: Math.random() > dt * 4, burn: 30 });
  }
  for (const t of g.tanks) {
    if (t.dead || t.team !== 'enemy' || t.edgeDist(o.x, o.y) > r) continue;
    damageTank(g, t, o.dps * dt, { srcTank: g.player.id, silent: Math.random() > dt * 4 });
  }
  g.fx.push({ t: 'beam', x0: o.x, y0: o.y, x1: o.x, y1: o.y, color: '#ff1744', w: 2.2, life: 0.06 });
  if (Math.random() < dt * 6) g.zones.push({ id: eid(), x: o.x, y: o.y, r: 2, t: 2.5, kind: 'fire', dps: 25, team: 'player' });
  if (Math.random() < dt * 20) g.fx.push({ t: 'spark', x: o.x + (Math.random() - 0.5) * 3, y: o.y + (Math.random() - 0.5) * 3, color: '#ff5252', n: 3 });
}

function updateStorm(g: Game, dt: number): void {
  const s = g.storm;
  if (!s) return;
  s.t -= dt;
  s.cd -= dt;
  if (s.t <= 0 || g.player.dead) {
    g.storm = null;
    return;
  }
  const p = g.player;
  while (s.cd <= 0) {
    s.cd += 1 / 6;
    const near = g.enemies.filter((e) => e.hp > 0 && !e.burrowed && Math.hypot(e.x - p.x, e.y - p.y) < 24);
    const tanks = g.tanks.filter((t) => !t.dead && t.team === 'enemy' && Math.hypot(t.x - p.x, t.y - p.y) < 26);
    const pool = [...near.map((e) => ({ x: e.x, y: e.y })), ...tanks.map((t) => ({ x: t.x, y: t.y }))];
    const tgt = pool.length ? pool[Math.floor(Math.random() * pool.length)] : { x: p.x + (Math.random() - 0.5) * 30, y: p.y + (Math.random() - 0.5) * 30 };
    skyStrike(g, 'player', tgt.x, tgt.y, 200 * s.P, { srcTank: p.id, fx: { slow: 0, stun: 0.3, stunTime: 1, knock: 0, split: 0, pull: false, execute: false, volatile: false, specials: [], base: 200 * s.P } }, '#82b1ff', 1.8);
  }
}
