import { TILE } from '../../shared/constants';
import { HAZARD_INFO } from '../../shared/types';
import { ZONES, zoneIndexAt } from '../../shared/zones';
import type { Game } from '../game';
import { Rig, type ModuleInst } from '../rig';
import { DRIVES, RIG_TILES, RT } from '../rigDefs';
import { buildRaiderRig } from '../rigTemplates';
import { deployTrooper } from './enemies';

interface Brain {
  outpostId?: number;
  mode: 'patrol' | 'engage' | 'idle';
  dir: number;
  stuck: number;
  trooperTimer: number;
  timer: number;
}

type Aim = () => { x: number; y: number; flying: boolean } | null;
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
    // Shields recharge after a short delay.
    if (r.shieldMax > 0) {
      r.shieldDelay -= dt;
      if (r.shieldDelay <= 0) r.shield = Math.min(r.shieldMax, r.shield + 14 * dt * r.powerRatio);
    }
    assignCrew(r);
    updateTurrets(g, r, dt);
    if (r === g.playerRig) playerRigSystems(g, r, dt);
    else hostileRigSystems(g, r, dt);
  }
  if (s.kind === 'world') {
    raiderSpawner(g, dt);
    cleanup(g);
  }
}

/* ------------------------------------------------------------------ */
/* Crew & turrets                                                       */
/* ------------------------------------------------------------------ */

function assignCrew(r: Rig): void {
  const turrets = r.modules.filter((m) => m.def.turret);
  for (const m of r.modules) m.crewed = false;
  if (r.team === 'hostile') {
    if (r.crew.length) for (const t of turrets) t.crewed = true;
    return;
  }
  const others = r.modules.filter((m) => !m.def.turret && m.def.key !== 'cargo');
  r.crew.forEach((c, i) => {
    if (i < turrets.length) {
      turrets[i].crewed = true;
      c.post = turrets[i].id;
    } else {
      c.post = others.length ? others[(i - turrets.length) % others.length].id : -1;
    }
  });
}

function pivot(r: Rig, m: ModuleInst): { x: number; y: number } {
  return { x: r.x + (m.x + m.def.w / 2) * TILE, y: r.y + (m.y + m.def.h * 0.45) * TILE };
}

function pickTarget(g: Game, r: Rig, m: ModuleInst, from: { x: number; y: number }): Aim | null {
  const spec = m.def.turret!;
  const range = spec.range * TILE;
  const s = g.sim;
  let best: Aim | null = null;
  let bd = range;
  if (r.team === 'player') {
    for (const e of s.enemies) {
      if (e.dead) continue;
      let d = Math.hypot(e.cx - from.x, e.cy - from.y);
      if (spec.antiAir && e.flying) d *= 0.5;
      if (d < bd) {
        bd = d;
        best = () => (e.dead ? null : { x: e.cx, y: e.cy, flying: e.flying });
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
        best = () => (p.dead ? null : { x: p.cx, y: p.cy, flying: false });
      }
    }
  }
  // Enemy rigs: aim at a random module in range.
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
      best = () => (o.modules.includes(pick) && !o.wrecked ? { ...o.moduleCenter(pick), flying: false } : null);
    }
  }
  return best;
}

function updateTurrets(g: Game, r: Rig, dt: number): void {
  const manual = r === g.playerRig && g.player.driving === r && g.manualAim;
  const dmgScale = r.team === 'hostile' ? 0.75 + (ZONES[r.zoneIndex]?.difficulty ?? 1) * 0.1 : 1;
  for (const m of r.modules) {
    const spec = m.def.turret;
    if (!spec) continue;
    m.cooldown -= dt;
    m.timer -= dt;
    const from = pivot(r, m);
    let aim: { x: number; y: number; flying: boolean } | null = null;
    if (manual) {
      aim = { x: g.manualAim!.x, y: g.manualAim!.y, flying: false };
    } else {
      if (m.timer <= 0) {
        m.timer = 0.4 + Math.random() * 0.3;
        const t = pickTarget(g, r, m, from);
        if (t) targets.set(m, t);
        else targets.delete(m);
      }
      aim = targets.get(m)?.() ?? null;
      if (aim && Math.hypot(aim.x - from.x, aim.y - from.y) > spec.range * TILE * 1.1) aim = null;
    }
    if (!aim) {
      m.angle += (-Math.PI / 2 - m.angle) * Math.min(1, dt);
      continue;
    }
    const want = Math.atan2(aim.y - from.y, aim.x - from.x);
    let d = want - m.angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    m.angle += Math.max(-5 * dt, Math.min(5 * dt, d));
    const wantsFire = manual ? g.manualFire : true;
    if (!wantsFire || !m.crewed || m.cooldown > 0 || Math.abs(d) > 0.25 || r.powerRatio < 0.15) continue;
    m.cooldown = 1 / (spec.rate * (0.5 + 0.5 * r.powerRatio));
    const team = r.team === 'player' ? 'player' : 'hostile';
    const bx = from.x + Math.cos(m.angle) * 18, by = from.y + Math.sin(m.angle) * 18;
    const dist = Math.hypot(aim.x - from.x, aim.y - from.y);
    for (let i = 0; i < spec.pellets; i++) {
      const a = m.angle + (Math.random() - 0.5) * spec.spread * 2;
      g.spawnProjectile({
        x: bx, y: by, angle: a, speed: spec.speed, dmg: spec.dmg * dmgScale, team, kind: spec.kind,
        life: spec.kind === 'flak' ? Math.max(0.1, dist / spec.speed) + (Math.random() - 0.5) * 0.08 : (spec.range * TILE * 1.2) / spec.speed,
        explosive: spec.explosive, tileDmg: spec.kind === 'missile' ? 1.5 : 0,
        color: spec.kind === 'laser' ? '#ff4081' : spec.kind === 'missile' ? '#ff6e40' : team === 'player' ? '#ffd180' : '#ff8a80',
        knock: 80, homing: spec.kind === 'missile' ? { x: aim.x, y: aim.y } : null, sourceRig: r,
      });
    }
    g.sim.particles.burst(bx, by, 5, { color: '#ffd180', speed: 140, life: 0.12, glow: true, size: 3, angle: m.angle, spread: 0.7 });
    const camDist = Math.hypot(bx - g.camera.x, by - g.camera.y);
    if (camDist < 1400) g.audio.play(spec.kind === 'laser' ? 'laser' : spec.kind === 'missile' ? 'rocket' : 'cannon', Math.max(0.2, 1 - camDist / 1400));
  }
}

/* ------------------------------------------------------------------ */
/* Player rig                                                           */
/* ------------------------------------------------------------------ */

const rigState = { hazardT: 0, repairT: 0, crewT: 0, defendT: 0 };

function playerRigSystems(g: Game, r: Rig, dt: number): void {
  const s = g.sim;
  if (s.kind !== 'world') return;
  const zone = ZONES[zoneIndexAt(Math.floor(r.cx / TILE))];
  const drive = DRIVES[r.drive];

  // Environmental exposure of the rig itself.
  rigState.hazardT += dt;
  if (rigState.hazardT > 1.5) {
    rigState.hazardT = 0;
    const hz = zone.hazard;
    if (hz && !r.isProtected(hz)) {
      const lvl = 1 + g.weather.strength * 0.8;
      for (let i = 0; i < 3; i++) damageRandomTile(r, 6 * lvl);
      for (const c of r.crew) c.hp -= 3 * lvl;
      warn(g, `rig-${hz}`, `${HAZARD_INFO[hz].name} is eating your rig and crew! Build ${hz === 'rad' ? 'Rad Baffles' : hz === 'toxic' ? 'a Hull Sealant Pump' : 'a Thermal Regulator'} (and keep it powered).`, HAZARD_INFO[hz].color, 25);
    }
    if (r.terrain === 'liquid' && !drive.hover) {
      for (let x = 0; x < r.cols; x += 3) r.damageTile(x, r.rows - 2, 10);
      for (const m of r.modules) if (m.y + m.def.h >= r.rows - 1) r.damageModule(m, 8);
      warn(g, 'rig-liquid', 'Your rig is wading through liquid and corroding! Hover Skirts glide over it.', '#ff5252', 15);
    }
    if (r.terrain === 'ash' && !drive.heatproof) {
      for (let x = 0; x < r.cols; x += 5) r.damageTile(x, r.rows - 2, 4);
      warn(g, 'rig-ash', 'Your wheels are cooking on the ash crust. Magma Treads are heat-proof.', '#ff6e40', 20);
    }
    const dead = r.crew.filter((c) => c.hp <= 0);
    for (const c of dead) g.toast(`${c.name} has died.`, '#ff5252');
    if (dead.length) r.crew = r.crew.filter((c) => c.hp > 0);
  }

  // Crew heal slowly if there's a medbay or quarters.
  const heal = r.modules.some((m) => m.def.medbay) ? 4 : r.modules.some((m) => m.def.quarters) ? 1 : 0.2;
  for (const c of r.crew) c.hp = Math.min(100, c.hp + heal * dt);

  // Production.
  for (const m of r.modules) {
    const pr = m.def.produces;
    if (!pr) continue;
    m.timer += dt * r.powerRatio;
    if (m.timer >= pr.every) {
      m.timer = 0;
      if (r.cargo.add(pr.item, 1) > 0) g.dropItem(r.moduleCenter(m).x, r.moduleCenter(m).y, { id: pr.item, n: 1 });
    }
  }

  // Repair drones spend cargo scrap to patch plating.
  if (r.repairRate > 0) {
    rigState.repairT += dt;
    if (rigState.repairT > 1) {
      rigState.repairT = 0;
      let budget = r.repairRate * 5 * r.powerRatio;
      for (let i = 0; i < r.tiles.length && budget > 0; i++) {
        const t = r.tiles[i];
        if (t === RT.EMPTY || t === RT.CHASSIS) continue;
        const max = RIG_TILES[t].hp;
        if (r.hp[i] < max) {
          if (!r.cargo.remove('scrap', 1)) break;
          const h = Math.min(max - r.hp[i], 30);
          r.hp[i] += h;
          budget -= h;
          r.version++;
        }
      }
      for (const m of r.modules) {
        if (budget <= 0) break;
        if (m.hp < m.maxHp && r.cargo.remove('scrap', 1)) {
          const h = Math.min(m.maxHp - m.hp, 30);
          m.hp += h;
          budget -= h;
        }
      }
    }
  }

  // Crew repel boarders.
  rigState.defendT -= dt;
  if (rigState.defendT <= 0) {
    rigState.defendT = 0.7;
    const intruders = s.enemies.filter((e) => !e.dead && r.contains(e.cx, e.cy, 2 * TILE));
    const defenders = r.crew.filter((c) => !r.modules.some((m) => m.id === c.post && m.def.turret));
    for (const c of defenders) {
      if (!intruders.length) break;
      const e = intruders[Math.floor(Math.random() * intruders.length)];
      const post = r.modules.find((m) => m.id === c.post);
      const from = post ? { x: r.moduleCenter(post).x, y: r.y + (post.y + post.def.h) * TILE - 18 } : { x: r.cx, y: r.cy };
      const a = Math.atan2(e.cy - from.y, e.cx - from.x);
      g.spawnProjectile({ x: from.x, y: from.y, angle: a + (Math.random() - 0.5) * 0.1, speed: 900, dmg: 9, team: 'player', kind: 'bullet', life: 0.8, color: '#80deea' });
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

  // Crew shoot at a player who boards them.
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
