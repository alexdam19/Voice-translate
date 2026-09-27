import { CHUNK } from '../../shared/constants';
import { crushable, navModeFor, OBS_COLOR, TER, TRACTION, type NavMode } from '../../shared/map';
import { findPath, moveCircle, resolveCircle } from '../../shared/motion';
import { NODE_INFO } from '../../shared/mapgen';
import { turnToward, wrapAngle } from '../../shared/types';
import type { Game } from '../game';
import type { Tank } from '../tank';

export function tankNav(t: Tank): NavMode {
  return navModeFor(t.drive, t.crush);
}

/** The fortress rolls over rocks, ruins, wrecks and props, flattening them. */
export function crushUnder(g: Game, t: Tank): void {
  const map = g.map;
  const half = Math.hypot(t.stats.length, t.stats.width) / 2;
  const x0 = Math.floor(t.x - half), x1 = Math.floor(t.x + half), y0 = Math.floor(t.y - half), y1 = Math.floor(t.y + half);
  let n = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!map.inside(tx, ty)) continue;
      const o = map.getObs(tx, ty);
      if (!crushable(o) || !t.hits(tx + 0.5, ty + 0.5, 0.2)) continue;
      map.crush(tx, ty);
      g.markDirty(tx, ty);
      n++;
      if (n <= 6) {
        g.fx.push({ t: 'spark', x: tx + 0.5, y: ty + 0.5, color: OBS_COLOR[o] ?? '#8d6e63', n: 5 });
        g.fx.push({ t: 'dust', x: tx + 0.5, y: ty + 0.5, color: '#a1887f' });
      }
    }
  }
  // Props (bones, barrels, cacti...) just get squashed.
  for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
    for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
      for (const p of g.propsInChunk(cx, cy)) {
        if (p.gone || !t.hits(p.x, p.y, 0)) continue;
        p.gone = true;
        g.markDirty(Math.floor(p.x), Math.floor(p.y));
      }
    }
  }
  if (n > 0) {
    g.navDirty = true;
    t.speed *= Math.pow(t.kind === 'main' ? 0.994 : 0.985, Math.min(n, 12));
    if (Math.random() < 0.5) g.hooks.sound('crunch', t.x, t.y, Math.min(1, 0.3 + n * 0.1));
    if (n >= 4) g.fx.push({ t: 'shake', amt: 0.15 });
  }
}

/** Speed multiplier from the ground under the tank (worst of front/centre/back). */
export function traction(g: Game, t: Tank): number {
  const table = TRACTION[t.drive];
  const half = t.stats.length * 0.4;
  let worst = 2;
  for (const lx of [-half, 0, half]) {
    const p = t.toWorld(lx, 0);
    const ter = g.map.terAt(p.x, p.y);
    let v = table[ter] ?? 1;
    if (t === g.player && t.crew.terrainImmune && (ter === TER.SAND || ter === TER.DUNE || ter === TER.ICE || ter === TER.SNOW || ter === TER.MUD)) v = Math.max(v, 1);
    if (t.crush) {
      // Go-anywhere hulls wade through liquids the drive can't handle and climb cliffs, slowly.
      if (v <= 0) v = 0.35;
      const tx = Math.floor(p.x), ty = Math.floor(p.y);
      const o = g.map.inside(tx, ty) ? g.map.getObs(tx, ty) : 0;
      if (o && !crushable(o)) v *= 0.5;
    }
    if (v <= 0) v = 0.15; // stuck in something it shouldn't be in; let it crawl out
    worst = Math.min(worst, v);
  }
  return worst;
}

/** Plans a path for a tank. Returns false if nothing reachable. */
export function planPath(g: Game, t: Tank, x: number, y: number): boolean {
  const path = findPath(g.map, t.x, t.y, x, y, {
    radius: Math.max(0.8, t.stats.radius * 0.85),
    mode: tankNav(t),
    traction: TRACTION[t.drive],
    climb: t.crush,
    maxNodes: 90000,
  });
  if (!path || !path.length) {
    t.path = [];
    t.goal = null;
    return false;
  }
  t.path = path;
  t.goal = { x, y };
  return true;
}

/** Pushes every hull circle out of walls/liquids. */
export function resolveTank(g: Game, t: Tank): boolean {
  const mode = tankNav(t);
  let hit = false;
  for (let iter = 0; iter < 3; iter++) {
    let px = 0, py = 0;
    for (const c of t.circles()) {
      const r = resolveCircle(g.map, c.x, c.y, c.r * 0.92, mode);
      const dx = r.x - c.x, dy = r.y - c.y;
      if (Math.abs(dx) > Math.abs(px)) px = dx;
      if (Math.abs(dy) > Math.abs(py)) py = dy;
    }
    if (px === 0 && py === 0) break;
    hit = true;
    t.x += px;
    t.y += py;
  }
  return hit;
}

/**
 * Steers a tank along its path. Tanks pivot in place for sharp turns and slow on bad ground.
 * `speedMult` covers buffs like Nitro.
 */
export interface ManualDrive {
  /** -0.5 (reverse) to 1 (full ahead). */
  throttle: number;
  wantRot: number;
  /** Tank-style turning: -1 left, 1 right (overrides wantRot). */
  turn?: number;
}

/**
 * WASD / stick input -> manual drive command. Screen-relative by default: W is up the screen.
 * Analog input (the touch stick) scales the throttle; keys are always full throttle.
 */
export function manualDrive(t: Tank, ix: number, iy: number, tankStyle: boolean): ManualDrive {
  if (tankStyle) return { throttle: iy < 0 ? Math.min(1, -iy) : iy > 0 ? -0.5 * Math.min(1, iy) : 0, wantRot: t.rot, turn: Math.max(-1, Math.min(1, ix)) };
  const mag = Math.min(1, Math.hypot(ix, iy));
  const want = Math.atan2(iy, ix);
  return { throttle: arcThrottle(Math.abs(wrapAngle(want - t.rot))) * mag, wantRot: want };
}

/**
 * How much throttle to keep while turning `diff` radians: full ahead on gentle bends, a tight arc on a right angle,
 * and a slow pivot only when turning right around. Keeping way on through turns is what makes it feel responsive.
 */
export function arcThrottle(diff: number): number {
  if (diff < 0.5) return 1;
  if (diff < 1.7) return 1 - ((diff - 0.5) / 1.2) * 0.55;
  return Math.max(0.2, 0.45 - (diff - 1.7) * 0.2);
}

/** Your fortress handles like a vehicle, not a building: it turns quickly and stops when you let go. */
export function handling(t: Tank): { turn: number; accel: number; brake: number } {
  if (t.kind !== 'main') {
    const accel = Math.max(4, t.stats.topSpeed * 1.6);
    return { turn: t.stats.turnRate, accel, brake: accel * 1.5 };
  }
  const top = Math.max(3, t.stats.topSpeed);
  return { turn: Math.max(2.3, t.stats.turnRate * 1.9) * t.handling, accel: top * 2.4, brake: top * 3.4 };
}

export function driveTank(g: Game, t: Tank, dt: number, speedMult = 1, manual?: ManualDrive): void {
  if (t.anchored || t.dead) {
    t.speed = 0;
    return;
  }
  const stunned = t.hasBuff('stun');
  let throttle = 0;
  let wantRot = t.rot;
  let turnDir = 0;
  if (manual) {
    throttle = manual.throttle;
    wantRot = manual.wantRot;
    turnDir = manual.turn ?? 0;
  }
  while (!manual && t.path.length) {
    const wp = t.path[0];
    const d = Math.hypot(wp.x - t.x, wp.y - t.y);
    const last = t.path.length === 1;
    if (d < (last ? 0.6 : Math.max(1.4, t.stats.radius * 0.6))) {
      t.path.shift();
      if (!t.path.length) {
        // Long trips are planned in legs: plan the next one until we're there.
        const goal = t.goal;
        t.goal = null;
        if (goal && Math.hypot(goal.x - t.x, goal.y - t.y) > 6) planPath(g, t, goal.x, goal.y);
      }
      continue;
    }
    wantRot = Math.atan2(wp.y - t.y, wp.x - t.x);
    const diff = Math.abs(wrapAngle(wantRot - t.rot));
    throttle = t.kind === 'main' ? arcThrottle(diff) : diff > 1.1 ? 0.08 : Math.cos(diff) ** 2;
    if (last && d < 3) throttle *= Math.max(0.3, d / 3);
    break;
  }
  if (stunned) throttle = 0;
  // Ground changes ease in over a few tenths of a second instead of jolting the speed.
  const raw = traction(g, t);
  t.trac = t.trac <= 0 ? raw : t.trac + (raw - t.trac) * (1 - Math.exp(-dt * 6));
  const trac = t.trac;
  const top = t.stats.topSpeed * trac * speedMult;
  const target = top * throttle;
  const hd = handling(t);
  if (t.speed < target) t.speed = Math.min(target, t.speed + hd.accel * dt);
  else t.speed = Math.max(target, t.speed - hd.brake * dt);
  if (!stunned) {
    const turn = hd.turn * (t.kind === 'main' ? 0.8 + 0.2 * Math.min(1, trac) : 0.55 + 0.45 * Math.min(1, trac)) * (speedMult > 1 ? 1.3 : 1);
    if (turnDir) t.rot = wrapAngle(t.rot + turnDir * turn * dt);
    else t.rot = turnToward(t.rot, wantRot, turn * dt);
  }
  const dx = Math.cos(t.rot) * t.speed * dt + t.pushX * dt;
  const dy = Math.sin(t.rot) * t.speed * dt + t.pushY * dt;
  t.pushX *= Math.pow(0.02, dt);
  t.pushY *= Math.pow(0.02, dt);
  t.x += dx;
  t.y += dy;
  if (resolveTank(g, t)) t.speed *= 0.9;
  // Flatten whatever is under the hull: every frame while moving, a few times a second while parked
  // (it may have been towed, blinked or loaded on top of rubble).
  if (t.crush && (Math.abs(t.speed) > 0.05 || Math.abs(t.pushX) + Math.abs(t.pushY) > 0.05 || (t.crushT -= dt) <= 0)) {
    t.crushT = 0.25;
    crushUnder(g, t);
  }
  t.treadPhase += t.speed * dt;
}

/** Keeps tanks from overlapping each other, nodes and the rune altars. */
export function separateTanks(g: Game): void {
  const all: Tank[] = [g.player, ...(g.outrider ? [g.outrider] : []), ...g.tanks].filter((t) => !t.dead);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const rr = a.stats.length / 2 + b.stats.length / 2;
      if (Math.abs(a.x - b.x) > rr || Math.abs(a.y - b.y) > rr) continue;
      for (const ca of a.circles()) {
        for (const cb of b.circles()) {
          const dx = cb.x - ca.x, dy = cb.y - ca.y;
          const d = Math.hypot(dx, dy);
          const min = ca.r + cb.r;
          if (d >= min || d < 1e-6) continue;
          const push = (min - d) / d;
          const wa = a.anchored ? 0 : b.anchored ? 1 : 0.5;
          const wb = 1 - wa;
          a.x -= dx * push * wa;
          a.y -= dy * push * wa;
          b.x += dx * push * wb;
          b.y += dy * push * wb;
        }
      }
    }
  }
  // Solid features.
  const blockers: { x: number; y: number; r: number }[] = [];
  const px = g.player.x, py = g.player.y;
  for (const n of g.gen.nodes) if (n.respawnAt === 0 && Math.abs(n.x - px) < 30 && Math.abs(n.y - py) < 30) blockers.push({ x: n.x, y: n.y, r: NODE_INFO[n.type].tier === 3 ? 1 : 0.85 });
  for (const r of g.gen.runes) if (Math.abs(r.x - px) < 30 && Math.abs(r.y - py) < 30) blockers.push({ x: r.x, y: r.y, r: 1.2 });
  if (!blockers.length) return;
  for (const t of all) {
    if (t.anchored || t.crush) continue;
    for (const c of t.circles()) {
      for (const b of blockers) {
        const dx = c.x - b.x, dy = c.y - b.y;
        const d = Math.hypot(dx, dy);
        const min = c.r * 0.92 + b.r;
        if (d >= min || d < 1e-6) continue;
        t.x += (dx / d) * (min - d);
        t.y += (dy / d) * (min - d);
      }
    }
  }
}

/** Small circles (creatures) moving with wall sliding. */
export function moveSmall(g: Game, x: number, y: number, r: number, dx: number, dy: number, flying: boolean): { x: number; y: number; hit: boolean } {
  if (flying) return { x: x + dx, y: y + dy, hit: false };
  return moveCircle(g.map, x, y, r, dx, dy, 'ground');
}
