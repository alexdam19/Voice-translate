import { TILE } from '../../shared/constants';
import { HAZARD_INFO } from '../../shared/types';
import { ZONES, zoneIndexAt } from '../../shared/zones';
import { assignPosts, computeBonus, ROLES } from '../crew';
import type { Enemy } from '../entities';
import type { Game } from '../game';
import { Rig, type ModuleInst } from '../rig';
import { DRIVES, RT, type TurretSpec } from '../rigDefs';
import { buildRaiderRig } from '../rigTemplates';
import { DEFAULT_WEAPON_MODS, type WeaponMods } from '../tech';
import { deployTrooper } from './enemies';

interface Brain {
  outpostId?: number;
  mode: 'patrol' | 'engage' | 'idle';
  dir: number;
  stuck: number;
  trooperTimer: number;
  timer: number;
}

interface AimPoint {
  x: number;
  y: number;
  flying: boolean;
  enemy: Enemy | null;
  rig: Rig | null;
  mod: ModuleInst | null;
}

type Aim = () => AimPoint | null;
const targets = new WeakMap<ModuleInst, Aim>();
const warnAt = new Map<string, number>();

function warn(g: Game, key: string, msg: string, color: string, every: number): void {
  const now = g.sim.time;
  if ((warnAt.get(key) ?? -1e9) + every > now) return;
  warnAt.set(key, now);
  g.toast(msg, color);
}

export function updateRigs(g: Game, dt: number): void {
  const s = g.sim;
  for (const r of s.rigs) {
    r.driveStep(dt, s.world, s.rigs);
    r.shieldFlash = Math.max(0, r.shieldFlash - dt);
    for (const m of r.modules) m.anim += dt;
    if (r.overflow.length) {
      for (const st of r.overflow) g.dropItem(r.cx, r.y + r.heightPx - 20, st);
      r.overflow = [];
    }
    if (r.wrecked) {
      if (Math.random() < dt * 6) {
        const m = r.modules[Math.floor(Math.random() * r.modules.length)];
        const c = m ? r.moduleCenter(m) : { x: r.cx, y: r.cy };
        s.particles.add({ x: c.x + (Math.random() - 0.5) * 20, y: c.y, vx: (Math.random() - 0.5) * 10, vy: -30 - Math.random() * 20, life: 2.5, size: 8, color: 'rgba(30,28,30,0.55)', shrink: false });
      }
      continue;
    }
    if (r.shieldMax > 0) {
      r.shieldDelay -= dt;
      if (r.shieldDelay <= 0) r.shield = Math.min(r.shieldMax, r.shield + 14 * r.bonus.hull.shieldRegen * dt * r.powerRatio);
    }
    crewPosts(g, r, dt);
    updateTurrets(g, r, dt);
    if (r === g.playerRig) playerRigSystems(g, r, dt);
    else hostileRigSystems(g, r, dt);
  }
  for (const a of s.arcs) a.life -= dt;
  s.arcs = s.arcs.filter((a) => a.life > 0);
  if (s.kind === 'world') {
    raiderSpawner(g, dt);
    cleanup(g);
  }
}

/* ------------------------------------------------------------------ */
/* Crew posting & bonuses                                               */
/* ------------------------------------------------------------------ */

function crewPosts(g: Game, r: Rig, dt: number): void {
  const turrets = r.modules.filter((m) => m.def.turret);
  for (const m of r.modules) m.crewed = false;
  if (r.team === 'hostile') {
    if (r.crew.length) for (const t of turrets) t.crewed = true;
    return;
  }
  assignPosts(r.crew, r.modules);
  const posted = new Set(r.crew.map((c) => c.post));
  for (const t of turrets) t.crewed = posted.has(t.id);
  // Crew + research bonuses are cheap but not free; refresh a few times a second.
  g.timers.bonus -= dt;
  if (g.timers.bonus <= 0) {
    g.timers.bonus = 0.5;
    r.bonus = computeBonus(r.crew, r.modules, g.tech);
    r.recalc();
  }
}

/* ------------------------------------------------------------------ */
/* Turrets                                                              */
/* ------------------------------------------------------------------ */

function pivot(r: Rig, m: ModuleInst): { x: number; y: number } {
  const hy = m.def.turret?.size === 'heavy' ? 0.35 : 0.45;
  return { x: r.x + (m.x + m.def.w / 2) * TILE, y: r.y + (m.y + m.def.h * hy) * TILE };
}

function effective(r: Rig, m: ModuleInst, spec: TurretSpec): { wm: WeaponMods; dmg: number; rate: number; range: number } {
  if (r.team !== 'player') {
    const scale = 0.75 + (ZONES[r.zoneIndex]?.difficulty ?? 1) * 0.1;
    return { wm: DEFAULT_WEAPON_MODS, dmg: spec.dmg * scale, rate: spec.rate, range: spec.range };
  }
  const wm = r.bonus.weapon[spec.family];
  const mb = r.bonus.mod.get(m.id);
  return {
    wm,
    dmg: spec.dmg * wm.dmg * (mb?.dmg ?? 1),
    rate: spec.rate * wm.rate * (mb?.rate ?? 1),
    range: spec.range * wm.range * r.bonus.rangeMult,
  };
}

function pickTarget(g: Game, r: Rig, m: ModuleInst, from: { x: number; y: number }, range: number): Aim | null {
  const spec = m.def.turret!;
  const s = g.sim;
  let best: Aim | null = null;
  let bd = range;
  if (r.team === 'player') {
    for (const e of s.enemies) {
      if (e.dead || e.titan?.burrowed) continue;
      let d = Math.hypot(e.cx - from.x, e.cy - from.y);
      if (spec.antiAir && e.flying) d *= 0.5;
      if (e.kind === 'titan' && spec.family === 'artillery') d *= 0.6;
      if (d < bd) {
        bd = d;
        best = () => (e.dead || e.titan?.burrowed ? null : { x: e.cx, y: e.cy, flying: e.flying, enemy: e, rig: null, mod: null });
      }
    }
  } else {
    const p = g.player;
    const pr = g.playerRig;
    const inside = pr ? pr.isInterior(p.cx, p.cy) : false;
    if (!p.dead && !inside) {
      const d = Math.hypot(p.cx - from.x, p.cy - from.y);
      if (d < bd) {
        bd = d;
        best = () => (p.dead ? null : { x: p.cx, y: p.cy, flying: false, enemy: null, rig: null, mod: null });
      }
    }
  }
  for (const o of s.rigs) {
    if (o.team === r.team || o.wrecked || o.modules.length === 0) continue;
    const near = o.modules.filter((mm) => {
      const c = o.moduleCenter(mm);
      return Math.hypot(c.x - from.x, c.y - from.y) < range;
    });
    if (!near.length) continue;
    const pick = near[Math.floor(Math.random() * near.length)];
    const c = o.moduleCenter(pick);
    const d = Math.hypot(c.x - from.x, c.y - from.y) * 0.9;
    if (d < bd || (r.team === 'hostile' && best === null)) {
      bd = d;
      best = () => (o.modules.includes(pick) && !o.wrecked ? { ...o.moduleCenter(pick), flying: false, enemy: null, rig: o, mod: pick } : null);
    }
  }
  return best;
}

/** Launch angle for a lobbed shell (high arc), or null if out of reach. */
function lobAngle(dx: number, dy: number, v: number, g: number): number | null {
  const x = Math.abs(dx);
  const y = -dy;
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * x * x + 2 * y * v2);
  if (disc < 0 || x < 1) return null;
  const theta = Math.atan((v2 + Math.sqrt(disc)) / (g * x));
  return dx >= 0 ? -theta : Math.PI + theta;
}

const PD_TARGETS = new Set(['rocket', 'missile', 'shell', 'mortar', 'grenade', 'plasma', 'spit', 'boulder', 'flak']);

function updateTurrets(g: Game, r: Rig, dt: number): void {
  const manual = r === g.playerRig && g.player.driving === r && g.manualAim;
  const team = r.team === 'player' ? 'player' : 'hostile';
  for (const m of r.modules) {
    const spec = m.def.turret;
    if (!spec) continue;
    m.cooldown -= dt;
    m.timer -= dt;
    const from = pivot(r, m);
    const eff = effective(r, m, spec);
    const rangePx = eff.range * TILE;

    if (spec.kind === 'pd') {
      pointDefense(g, r, m, from, rangePx, eff.rate, dt);
      continue;
    }

    let aim: AimPoint | null = null;
    if (manual && spec.kind !== 'tesla') {
      aim = { x: g.manualAim!.x, y: g.manualAim!.y, flying: false, enemy: null, rig: null, mod: null };
    } else {
      if (m.timer <= 0) {
        m.timer = 0.4 + Math.random() * 0.3;
        const t = pickTarget(g, r, m, from, rangePx);
        if (t) targets.set(m, t);
        else targets.delete(m);
      }
      aim = targets.get(m)?.() ?? null;
      if (aim && Math.hypot(aim.x - from.x, aim.y - from.y) > rangePx * 1.1) aim = null;
    }
    if (!aim) {
      // At rest heavy guns point down the hull; light mounts angle up and forward.
      const rest = spec.size === 'heavy' ? (r.facing > 0 ? -0.06 : Math.PI + 0.06) : -Math.PI / 2 + r.facing * 0.7;
      let dr = rest - m.angle;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      m.angle += dr * Math.min(1, dt * 1.5);
      continue;
    }
    let want = Math.atan2(aim.y - from.y, aim.x - from.x);
    if (spec.kind === 'mortar') {
      const lob = lobAngle(aim.x - from.x, aim.y - from.y, spec.speed * eff.wm.speed, spec.gravity ?? 700);
      if (lob === null) continue;
      want = lob;
    }
    let d = want - m.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const turn = spec.size === 'heavy' ? 2.2 : 5;
    m.angle += Math.max(-turn * dt, Math.min(turn * dt, d));
    const wantsFire = manual ? g.manualFire : true;
    if (!wantsFire || !m.crewed || m.cooldown > 0 || Math.abs(d) > 0.25 || r.powerRatio < 0.15) continue;
    m.cooldown = 1 / (eff.rate * (0.5 + 0.5 * r.powerRatio));
    const srcMod = r === g.playerRig ? m.id : -1;

    if (spec.kind === 'tesla') {
      teslaStrike(g, r, from, aim, eff.dmg, spec.chain ?? 3, srcMod);
      continue;
    }

    const barrel = spec.size === 'heavy' ? 46 : 18;
    const bx = from.x + Math.cos(m.angle) * barrel, by = from.y + Math.sin(m.angle) * barrel;
    const dist = Math.hypot(aim.x - from.x, aim.y - from.y);
    const pellets = spec.pellets + (spec.family === 'missile' ? eff.wm.pellets : 0);
    const speed = spec.speed * eff.wm.speed;
    for (let i = 0; i < pellets; i++) {
      const a = m.angle + (Math.random() - 0.5) * spec.spread * 2;
      const life = spec.kind === 'flak' ? Math.max(0.1, dist / speed) + (Math.random() - 0.5) * 0.08 : spec.kind === 'mortar' ? 8 : (rangePx * 1.25) / speed;
      g.spawnProjectile({
        x: bx, y: by, angle: a, speed, dmg: eff.dmg, team, kind: spec.kind,
        life, explosive: spec.explosive * eff.wm.radius, gravity: spec.gravity ?? 0,
        pierce: (spec.pierce ?? 0) + eff.wm.pierce, tileDmg: spec.kind === 'missile' || spec.kind === 'shell' || spec.kind === 'mortar' ? 1.5 : 0,
        color: turretColor(spec.kind, team), knock: spec.size === 'heavy' ? 260 : 80,
        homing: spec.kind === 'missile' ? { x: aim.x, y: aim.y } : null, sourceRig: r, srcMod, turn: eff.wm.turn,
      });
    }
    const big = spec.size === 'heavy';
    g.sim.particles.burst(bx, by, big ? 14 : 5, { color: '#ffd180', speed: big ? 260 : 140, life: big ? 0.25 : 0.12, glow: true, size: big ? 5 : 3, angle: m.angle, spread: 0.7 });
    if (big) {
      g.sim.particles.burst(bx, by, 10, { color: 'rgba(90,86,80,0.5)', speed: 120, life: 1.2, size: 10, angle: m.angle, spread: 1.2, drag: 2, shrink: false });
      if (r === g.playerRig) g.camera.addShake(3);
    }
    const camDist = Math.hypot(bx - g.camera.x, by - g.camera.y);
    if (camDist < 1600) {
      const snd = spec.kind === 'laser' ? 'laser' : spec.kind === 'rail' ? 'rail' : spec.kind === 'missile' ? 'rocket' : spec.kind === 'shell' || spec.kind === 'mortar' ? 'explode' : 'cannon';
      g.audio.play(snd, Math.max(0.2, (1 - camDist / 1600) * (snd === 'explode' ? 0.45 : 1)));
    }
  }
}

function turretColor(kind: string, team: string): string {
  switch (kind) {
    case 'laser': return '#ff4081';
    case 'rail': return '#ea80fc';
    case 'missile': return '#ff6e40';
    case 'shell': return '#ffab40';
    case 'mortar': return '#ffd54f';
    default: return team === 'player' ? '#ffd180' : '#ff8a80';
  }
}

function pointDefense(g: Game, r: Rig, m: ModuleInst, from: { x: number; y: number }, range: number, rate: number, dt: number): void {
  let best: (typeof g.sim.projectiles)[number] | null = null;
  let bd = range;
  for (const p of g.sim.projectiles) {
    if (p.dead || p.visual || p.team === (r.team === 'player' ? 'player' : 'hostile') || !PD_TARGETS.has(p.kind)) continue;
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  if (!best) {
    m.angle += (-Math.PI / 2 - m.angle) * Math.min(1, dt);
    return;
  }
  m.angle = Math.atan2(best.y - from.y, best.x - from.x);
  if (!m.crewed || m.cooldown > 0 || r.powerRatio < 0.15) return;
  m.cooldown = 1 / rate;
  g.sim.arcs.push({ x1: from.x, y1: from.y, x2: best.x, y2: best.y, life: 0.06, color: '#80d8ff', jag: false });
  if (Math.random() < 0.6) {
    best.dead = true;
    g.sim.particles.burst(best.x, best.y, 8, { color: '#80d8ff', speed: 120, life: 0.25, glow: true, size: 2 });
  }
  g.audio.play('smg', 0.25);
}

function teslaStrike(g: Game, r: Rig, from: { x: number; y: number }, aim: AimPoint, dmg: number, chain: number, srcMod: number): void {
  const hit = new Set<Enemy>();
  let px = from.x, py = from.y;
  let tx = aim.x, ty = aim.y;
  let current: Enemy | null = aim.enemy;
  for (let i = 0; i < chain; i++) {
    g.sim.arcs.push({ x1: px, y1: py, x2: tx, y2: ty, life: 0.18, color: '#b388ff', jag: true });
    if (current) {
      hit.add(current);
      current.lastHitMod = srcMod;
      g.damageEnemy(current, dmg * (1 - i * 0.15), 0, -40);
    } else if (aim.rig && aim.mod && i === 0) {
      aim.rig.damageModule(aim.mod, dmg);
    } else if (r.team === 'hostile' && i === 0) {
      const p = g.player;
      if (Math.hypot(p.cx - tx, p.cy - ty) < 20) g.hurtPlayer(dmg, 'tesla');
    }
    g.sim.particles.burst(tx, ty, 6, { color: '#b388ff', speed: 100, life: 0.2, glow: true, size: 2 });
    // jump to the nearest unhit enemy within 8 tiles
    let next: Enemy | null = null;
    let nd = 8 * TILE;
    if (r.team === 'player') {
      for (const e of g.sim.enemies) {
        if (e.dead || hit.has(e)) continue;
        const d = Math.hypot(e.cx - tx, e.cy - ty);
        if (d < nd) {
          nd = d;
          next = e;
        }
      }
    }
    if (!next) break;
    px = tx;
    py = ty;
    tx = next.cx;
    ty = next.cy;
    current = next;
  }
  g.audio.play('laser', 0.5);
}

/* ------------------------------------------------------------------ */
/* Player rig                                                           */
/* ------------------------------------------------------------------ */

const rigState = { hazardT: 0, repairT: 0, dutyT: 0, defendT: 0, driven: 0, repairDebt: 0 };

function playerRigSystems(g: Game, r: Rig, dt: number): void {
  const s = g.sim;
  if (s.kind !== 'world') return;
  const zone = ZONES[zoneIndexAt(Math.floor(r.cx / TILE))];
  const drive = DRIVES[r.drive];
  const b = r.bonus;

  // Environmental exposure of the rig itself.
  rigState.hazardT += dt;
  if (rigState.hazardT > 1.5) {
    rigState.hazardT = 0;
    const hz = zone.hazard;
    if (hz && !r.isProtected(hz)) {
      const lvl = 1 + g.weather.strength * 0.8;
      for (let i = 0; i < 3; i++) damageRandomTile(r, 6 * lvl);
      for (const c of r.crew) {
        c.hp -= 3 * lvl * (c.trait === 'iron_lungs' ? 0.5 : 1);
        if (b.crewSafe) c.hp = Math.max(1, c.hp);
      }
      warn(g, `rig-${hz}`, `${HAZARD_INFO[hz].name} is eating your rig and crew! Build ${hz === 'rad' ? 'Rad Baffles' : hz === 'toxic' ? 'a Hull Sealant Pump' : 'a Thermal Regulator'} (and keep it powered).`, HAZARD_INFO[hz].color, 25);
    }
    if (r.terrain === 'liquid' && !drive.hover) {
      for (let x = 0; x < r.cols; x += 3) r.damageTile(x, r.rows - 2, 10);
      for (const m of r.modules) if (m.y + m.def.h >= r.rows - 1) r.damageModule(m, 8);
      warn(g, 'rig-liquid', 'Your rig is wading through liquid and corroding! Hover Skirts glide over it.', '#ff5252', 15);
    }
    if (r.terrain === 'ash' && !drive.heatproof) {
      for (let x = 0; x < r.cols; x += 5) r.damageTile(x, r.rows - 2, 4);
      warn(g, 'rig-ash', 'Your treads are cooking on the ash crust. Magma Treads are heat-proof.', '#ff6e40', 20);
    }
    const dead = r.crew.filter((c) => c.hp <= 0);
    for (const c of dead) g.toast(`${c.name} (${ROLES[c.role].name}) has died.`, '#ff5252');
    if (dead.length) r.crew = r.crew.filter((c) => c.hp > 0);
  }

  // Healing: medics, medbay, quarters.
  const baseHeal = r.modules.some((m) => m.def.medbay) ? 4 : r.modules.some((m) => m.def.quarters) ? 1 : 0.2;
  for (const c of r.crew) c.hp = Math.min(c.maxHp, c.hp + (baseHeal + b.healHps) * dt);
  const p = g.player;
  if (b.healHps > 0 && !p.dead) {
    const near = r.contains(p.cx, p.cy, 8) || (b.healRange > 0 && Math.hypot(p.cx - r.cx, p.cy - r.cy) < b.healRange * TILE);
    if (near) p.hp = Math.min(p.maxHp, p.hp + b.healHps * dt);
  }

  // Production.
  for (const m of r.modules) {
    const pr = m.def.produces;
    if (!pr) continue;
    m.timer += dt * r.powerRatio * b.rationMult;
    if (m.timer >= pr.every) {
      m.timer = 0;
      if (r.cargo.add(pr.item, 1) > 0) g.dropItem(r.moduleCenter(m).x, r.moduleCenter(m).y, { id: pr.item, n: 1 });
    }
  }

  // Repairs: drones + mechanics spend cargo scrap; Hot Swap regenerates facilities for free.
  rigState.repairT += dt;
  if (rigState.repairT > 1) {
    rigState.repairT = 0;
    let budget = (r.repairRate * 5 + b.repairHps) * r.powerRatio;
    let spent = 0;
    for (let i = 0; i < r.tiles.length && budget > 0; i++) {
      const t = r.tiles[i];
      if (t === RT.EMPTY || t === RT.CHASSIS) continue;
      const max = r.tileMax(t);
      if (r.hp[i] < max) {
        const h = Math.min(max - r.hp[i], budget, 30);
        r.hp[i] += h;
        budget -= h;
        spent += h;
        r.version++;
      }
    }
    for (const m of r.modules) {
      if (m.hp < m.maxHp) {
        const h = Math.min(m.maxHp - m.hp, budget + b.moduleRegen);
        m.hp += h;
        budget -= Math.max(0, h - b.moduleRegen);
        spent += Math.max(0, h - b.moduleRegen);
      }
    }
    rigState.repairDebt += spent;
    while (rigState.repairDebt >= 40) {
      rigState.repairDebt -= 40;
      if (!r.cargo.remove('scrap', 1)) {
        warn(g, 'repair-scrap', 'Your mechanics are out of scrap in cargo to patch the hull.', '#ffab40', 60);
        rigState.repairDebt = 0;
        break;
      }
    }
    if (spent > 0) g.crewXp((c) => c.role === 'mechanic', 1);
  }

  // Duty XP and driving XP.
  rigState.dutyT += dt;
  if (rigState.dutyT > 10) {
    rigState.dutyT = 0;
    g.crewXp(() => true, 2);
    if (r.powerProd > 0) g.crewXp((c) => c.role === 'engineer', 1);
  }
  rigState.driven += Math.abs(r.x - r.prevX) / TILE;
  if (rigState.driven > 25) {
    rigState.driven = 0;
    g.crewXp((c) => c.role === 'driver', 2);
  }

  // Crushing: the tank rolls over anything small in its path.
  if (Math.abs(r.vx) > 30) {
    const lead = r.vx > 0 ? r.x + r.widthPx : r.x;
    for (const e of s.enemies) {
      if (e.dead || e.kind === 'titan' || e.flying) continue;
      const inFront = r.vx > 0 ? e.x + e.w > lead - 12 && e.x < lead + 10 : e.x < lead + 12 && e.x + e.w > lead - 10;
      const low = e.y + e.h > r.y + r.heightPx * 0.4 && e.y < r.y + r.heightPx + 30;
      if (inFront && low) {
        g.damageEnemy(e, Math.abs(r.vx) * 0.25 * b.hull.crush * dt * 4, Math.sign(r.vx) * 200, -120);
      }
    }
  }

  // Crew repel boarders (marines hit hardest).
  rigState.defendT -= dt;
  if (rigState.defendT <= 0) {
    rigState.defendT = 0.7 / b.defenderRate;
    const reach = b.overwatch ? 14 * TILE : 2 * TILE;
    const intruders = s.enemies.filter((e) => !e.dead && e.kind !== 'titan' && r.contains(e.cx, e.cy, reach));
    const defenders = r.crew.filter((c) => c.role === 'marine' || !r.modules.some((m) => m.id === c.post && m.def.turret));
    for (const c of defenders) {
      if (!intruders.length) break;
      const e = intruders[Math.floor(Math.random() * intruders.length)];
      const post = r.modules.find((m) => m.id === c.post);
      const from = post ? { x: r.moduleCenter(post).x, y: r.y + (post.y + post.def.h) * TILE - 18 } : { x: r.cx, y: r.cy };
      const a = Math.atan2(e.cy - from.y, e.cx - from.x);
      const dmg = 9 * (c.role === 'marine' ? b.defenderDmg : 1);
      g.spawnProjectile({ x: from.x, y: from.y, angle: a + (Math.random() - 0.5) * 0.1, speed: 900, dmg, team: 'player', kind: 'bullet', life: 1, color: c.role === 'marine' ? '#ff8a80' : '#80deea' });
    }
  }
}

function damageRandomTile(r: Rig, dmg: number): void {
  for (let tries = 0; tries < 20; tries++) {
    const i = Math.floor(Math.random() * r.tiles.length);
    const t = r.tiles[i];
    if (t !== RT.EMPTY && t !== RT.CHASSIS) {
      r.damageTile(i % r.cols, Math.floor(i / r.cols), dmg);
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Hostile rigs                                                         */
/* ------------------------------------------------------------------ */

function hostileRigSystems(g: Game, r: Rig, dt: number): void {
  const b = r.ai as Brain | null;
  if (!b) return;
  const p = g.player;
  const pr = g.playerRig && g.sim.rigs.includes(g.playerRig) ? g.playerRig : null;
  const useRig = pr && (g.aboardRig() || p.dead || Math.abs(pr.cx - p.cx) < 40 * TILE);
  const tgtX = useRig ? pr!.cx : p.cx;
  const tgtHalf = useRig ? pr!.widthPx / 2 : 0;
  const dx = tgtX - r.cx;
  const gap = (Math.abs(dx) - tgtHalf - r.widthPx / 2) / TILE;
  const diff = ZONES[r.zoneIndex].difficulty;
  b.trooperTimer -= dt;

  const cap = 2 + Math.floor(diff / 2);
  const deploy = (): void => {
    const mine = g.sim.enemies.filter((e) => e.homeRig === r && !e.dead).length;
    if (mine < cap && r.modules.some((m) => m.def.key === 'barracks')) {
      deployTrooper(g, r, tgtX);
      b.trooperTimer = 11 + Math.random() * 6;
    } else {
      b.trooperTimer = 4;
    }
  };

  if (!p.dead && r.contains(p.cx, p.cy) && r.crew.length) {
    b.timer -= dt;
    if (b.timer <= 0) {
      b.timer = 0.9;
      const m = r.modules[Math.floor(Math.random() * r.modules.length)];
      if (m) {
        const c = r.moduleCenter(m);
        const a = Math.atan2(p.cy - c.y, p.cx - c.x);
        g.spawnProjectile({ x: c.x, y: c.y, angle: a + (Math.random() - 0.5) * 0.15, speed: 800, dmg: 6 + diff * 2, team: 'hostile', kind: 'bullet', life: 0.8, color: '#ff5252' });
      }
    }
  }

  if (r.anchored) {
    if (gap < 40 && b.trooperTimer <= 0 && !p.dead) deploy();
    if (gap < 60) warn(g, `outpost-${r.id}`, `${r.name} has spotted you!`, '#ff5252', 120);
    return;
  }

  const zone = ZONES[r.zoneIndex];
  if (gap < 75 && !p.dead) {
    if (b.mode !== 'engage') {
      g.toast(`Raider rig "${r.name}" is moving to engage!`, '#ff5252');
      g.audio.play('alarm');
    }
    b.mode = 'engage';
  } else if (gap > 120 || p.dead) {
    b.mode = 'patrol';
  }
  if (b.mode === 'engage') {
    const sgn = Math.sign(dx);
    r.throttle = gap > 28 ? sgn : gap < 12 ? -sgn * 0.7 : 0;
    if (gap < 45 && b.trooperTimer <= 0) deploy();
  } else {
    r.throttle = b.dir * 0.5;
    if (r.blocked) {
      b.stuck += dt;
      if (b.stuck > 1.5) {
        b.dir *= -1;
        b.stuck = 0;
      }
    }
  }
  const zx0 = zone.x0 * TILE + 30 * TILE, zx1 = zone.x1 * TILE - 30 * TILE;
  if (r.x < zx0) b.dir = 1;
  if (r.x + r.widthPx > zx1) b.dir = -1;
  if ((r.x < zx0 && r.throttle < 0) || (r.x + r.widthPx > zx1 && r.throttle > 0)) r.throttle = 0;
}

export function wreckRig(g: Game, r: Rig): void {
  r.wrecked = true;
  r.throttle = 0;
  r.vx = 0;
  r.crew = [];
  r.shield = 0;
  for (let i = 0; i < 5; i++) {
    const m = r.modules[Math.floor(Math.random() * r.modules.length)];
    if (!m) break;
    const c = r.moduleCenter(m);
    g.sim.particles.explosion(c.x, c.y, 30);
    if (Math.random() < 0.4) r.removeModule(m);
  }
  g.camera.addShake(10);
  g.audio.play('explode');
  g.onRigWrecked(r);
}

function raiderSpawner(g: Game, dt: number): void {
  g.timers.raider -= dt;
  if (g.timers.raider > 0) return;
  g.timers.raider = 110 + Math.random() * 90;
  const s = g.sim;
  const p = g.player;
  if (p.dead) return;
  const anchor = g.playerRig && s.rigs.includes(g.playerRig) ? g.playerRig : null;
  const ax = anchor ? anchor.cx : p.cx;
  const zi = zoneIndexAt(Math.floor(ax / TILE));
  const zone = ZONES[zi];
  if (Math.abs(ax / TILE - g.gen.spawnX) < 150) return;
  const live = s.rigs.filter((r) => r.team === 'hostile' && !r.anchored && !r.wrecked).length;
  if (live >= (zone.difficulty >= 4 ? 2 : 1)) return;
  let side = Math.random() < 0.5 ? -1 : 1;
  for (let attempt = 0; attempt < 2; attempt++) {
    const tx = Math.floor(ax / TILE + side * (95 + Math.random() * 30));
    if (tx > zone.x0 + 20 && tx < zone.x1 - 80) {
      const r = buildRaiderRig(zi, (Math.random() * 1e9) | 0, side > 0);
      r.placeOnGround(s.world, tx);
      r.ai = { mode: 'patrol', dir: -side, stuck: 0, trooperTimer: 6, timer: 0 } satisfies Brain;
      s.rigs.push(r);
      g.toast(`Raider rig "${r.name}" spotted to the ${side > 0 ? 'east' : 'west'}!`, '#ff5252');
      g.audio.play('alarm');
      return;
    }
    side = -side;
  }
}

function cleanup(g: Game): void {
  const s = g.sim;
  const px = g.player.cx;
  s.rigs = s.rigs.filter((r) => {
    if (r === g.playerRig || r.anchored) return true;
    const far = Math.abs(r.cx - px) > (r.wrecked ? 260 : 320) * TILE;
    return !far;
  });
}
