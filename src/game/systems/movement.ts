import { CHUNK } from '../../shared/constants';
import { crushable, navModeFor, OBS_COLOR, TER, TRACTION, type NavMode } from '../../shared/map';
import { findPath, moveCircle, resolveCircle } from '../../shared/motion';
import { NODE_INFO } from '../../shared/mapgen';
import { turnToward, wrapAngle } from '../../shared/types';
import type { Game } from '../game';
import type { Tank } from '../tank';
import { damageEnemy } from './damage';

export function tankNav(t: Tank): NavMode {
  return navModeFor(t.drive, t.crush);
}

/**
 * When the hull breaks through a building, the rest of it comes down: connected walls within a few tiles
 * collapse one after another over the next second (nearer ones first).
 */
function queueCollapse(g: Game, tx: number, ty: number, fromX: number, fromY: number): void {
  const map = g.map;
  const seen = new Set<number>();
  const q: [number, number, number][] = [[tx, ty, 0]];
  let n = 0;
  while (q.length && n < 36) {
    const [x, y, d] = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const k = ny * 20000 + nx;
      if (seen.has(k) || !map.inside(nx, ny)) continue;
      seen.add(k);
      const o = map.getObs(nx, ny);
      if (!crushable(o) || map.getOh(nx, ny) < 4 || d >= 5) continue;
      if (Math.random() < 0.25) continue;
      g.collapses.push({ tx: nx, ty: ny, t: g.time + 0.12 + d * 0.14 + Math.random() * 0.2, fx: fromX, fy: fromY });
      q.push([nx, ny, d + 1]);
      n++;
    }
  }
}

/** Brings down queued building sections: rubble falls on whatever is standing there. */
export function updateCollapses(g: Game): void {
  if (!g.collapses.length) return;
  const map = g.map;
  for (let i = g.collapses.length - 1; i >= 0; i--) {
    const c = g.collapses[i];
    if (c.t > g.time) continue;
    g.collapses.splice(i, 1);
    const o = map.getObs(c.tx, c.ty), h = map.getOh(c.tx, c.ty);
    if (!crushable(o) || !o) continue;
    map.crush(c.tx, c.ty);
    g.markDirty(c.tx, c.ty);
    g.navDirty = true;
    const x = c.tx + 0.5, y = c.ty + 0.5;
    g.fx.push({ t: 'debris', x, y, h: h * 0.5, color: OBS_COLOR[o] ?? '#8a8680', n: 3 + Math.min(6, Math.floor(h / 3)), fx: c.fx, fy: c.fy, push: 1 });
    if (Math.random() < 0.35) g.fx.push({ t: 'dust', x, y, color: '#9e9e9e' });
    // Falling rubble crushes creatures underneath.
    for (const e of g.enemiesNear(x, y, 1.6)) {
      if (e.flying || e.titan || e.latch || Math.hypot(e.x - x, e.y - y) > 1.4) continue;
      damageEnemy(g, e, 25 + h * 6, { silent: true });
    }
  }
  if (Math.random() < 0.3) g.hooks.sound('crunch', g.player.x, g.player.y, 0.5);
}

/**
 * Tiles to test for crushing. Small hulls scan their whole footprint; a Titan Crawler (200 m of hull) only scans a
 * band around its perimeter while moving, since that's the only ground it can newly reach in a frame.
 */
function crushTiles(t: Tank, full: boolean): number[] {
  const L = t.stats.length / 2, W = t.stats.width / 2;
  const out: number[] = [];
  if (full || !t.fortress) {
    const half = Math.hypot(L, W);
    for (let ty = Math.floor(t.y - half); ty <= Math.floor(t.y + half); ty++) for (let tx = Math.floor(t.x - half); tx <= Math.floor(t.x + half); tx++) out.push(tx, ty);
    return out;
  }
  const seen = new Set<number>();
  const band = 2.5 + Math.abs(t.speed) * 0.1 + Math.abs(t.yawRate) * L * 0.1;
  const add = (lx: number, lz: number): void => {
    const p = t.toWorld(lx, lz);
    const tx = Math.floor(p.x), ty = Math.floor(p.y);
    const k = ty * 20000 + tx;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(tx, ty);
  };
  for (let d = 0; d <= band; d += 0.7) {
    for (let lx = -L; lx <= L; lx += 0.7) {
      add(lx, -W + d);
      add(lx, W - d);
    }
    for (let lz = -W; lz <= W; lz += 0.7) {
      add(L - d, lz);
      add(-L + d, lz);
    }
  }
  return out;
}

/** The fortress rolls over rocks, ruins, wrecks and props, flattening them. */
export function crushUnder(g: Game, t: Tank, full = false): void {
  const map = g.map;
  const tiles = crushTiles(t, full);
  let n = 0;
  let heavy = 0;
  for (let i = 0; i < tiles.length; i += 2) {
    const tx = tiles[i], ty = tiles[i + 1];
    if (!map.inside(tx, ty)) continue;
    const o = map.getObs(tx, ty);
    if (!crushable(o) || !t.hits(tx + 0.5, ty + 0.5, 0.2)) continue;
    const h = map.getOh(tx, ty);
    map.crush(tx, ty);
    g.markDirty(tx, ty);
    n++;
    heavy += h;
    if (n <= 6) {
      g.fx.push({ t: 'spark', x: tx + 0.5, y: ty + 0.5, color: OBS_COLOR[o] ?? '#8d6e63', n: 5 });
      g.fx.push({ t: 'dust', x: tx + 0.5, y: ty + 0.5, color: '#a1887f' });
    }
    // Tall things come down in chunks, and bring the rest of the building with them.
    if (h >= 4) {
      g.fx.push({ t: 'debris', x: tx + 0.5, y: ty + 0.5, h: h * 0.5, color: OBS_COLOR[o] ?? '#8a8680', n: 2 + Math.min(5, Math.floor(h / 4)), fx: t.x, fy: t.y, push: Math.abs(t.speed) });
      if (t === g.player && g.collapses.length < 300) queueCollapse(g, tx, ty, t.x, t.y);
    }
  }
  // Props (bones, barrels, cacti...) just get squashed.
  const half = Math.hypot(t.stats.length, t.stats.width) / 2;
  const x0 = Math.floor(t.x - half), x1 = Math.floor(t.x + half), y0 = Math.floor(t.y - half), y1 = Math.floor(t.y + half);
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
    // Rubble slows you a little; ploughing through a skyscraper slows you more. A Titan barely notices.
    if (t.fortress) t.speed *= Math.pow(0.9985, Math.min(n, 20)) * Math.max(0.96, 1 - heavy * 0.0002);
    else t.speed *= Math.pow(0.985, Math.min(n, 12)) * Math.max(0.8, 1 - heavy * 0.0015);
    if (Math.random() < 0.5) g.hooks.sound('crunch', t.x, t.y, Math.min(1, 0.3 + n * 0.1));
    if (n >= 4) g.fx.push({ t: 'shake', amt: t.fortress ? 0.08 : 0.15 });
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

/**
 * Titan Crawler handling: a 200 m building on eight crawlers. It builds speed slowly, takes a long time to stop and
 * turns in wide differential arcs (a slow pivot only when nearly stopped, on firm ground). Heavy, but readable:
 * the HUD shows the throttle, both crawler sides and the predicted path.
 */
export const TITAN = { accel: 0.55, brake: 1.1, reverseBrake: 1.6, yaw: 0.11, pivot: 0.045, cap: 9 } as const;

export function handling(t: Tank): { turn: number; accel: number; brake: number } {
  if (!t.fortress) {
    const accel = Math.max(4, t.stats.topSpeed * 1.6);
    return { turn: t.stats.turnRate, accel, brake: accel * 1.5 };
  }
  return { turn: TITAN.yaw * t.handling, accel: TITAN.accel * Math.sqrt(t.handling), brake: TITAN.brake };
}

/** Yaw rate a fortress can manage at `speed`: a slow pivot when stopped, up to the full rate once moving. */
export function titanYaw(t: Tank, speed: number, firm: boolean): number {
  const k = Math.min(1, Math.abs(speed) / 2.5);
  const pivot = firm ? TITAN.pivot : 0.01;
  return (pivot + (TITAN.yaw - pivot) * k) * t.handling;
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
  const top = Math.min(t.fortress ? TITAN.cap : 99, t.stats.topSpeed) * trac * speedMult;
  const target = top * throttle;
  const hd = handling(t);
  const rev = t.fortress && Math.sign(target) !== Math.sign(t.speed) && Math.abs(t.speed) > 0.05 && target !== 0;
  if (t.speed < target) t.speed = Math.min(target, t.speed + (t.speed < 0 ? hd.brake : hd.accel) * dt * (rev ? TITAN.reverseBrake / TITAN.brake : 1));
  else t.speed = Math.max(target, t.speed - (t.speed > 0 ? hd.brake : hd.accel) * dt * (rev ? TITAN.reverseBrake / TITAN.brake : 1));
  const rot0 = t.rot;
  if (!stunned && t.fortress) {
    const yaw = titanYaw(t, t.speed, trac > 0.7) * (speedMult > 1 ? 1.3 : 1);
    if (turnDir) t.rot = wrapAngle(t.rot + turnDir * yaw * (t.speed < -0.05 ? -1 : 1) * dt);
    else t.rot = turnToward(t.rot, wantRot, yaw * dt);
  } else if (!stunned) {
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
  const moving = Math.abs(t.speed) > 0.05 || Math.abs(t.pushX) + Math.abs(t.pushY) > 0.05;
  if (t.crush && (moving || (t.crushT -= dt) <= 0)) {
    const full = !moving || (t.crushT -= dt) <= 0;
    if (full) t.crushT = t.fortress ? 1 : 0.25;
    crushUnder(g, t, full);
  }
  t.treadPhase += t.speed * dt;
  // Each side's crawlers (left, right): the inside of a turn runs slower than the outside (rot grows clockwise).
  t.yawRate = dt > 0 ? wrapAngle(t.rot - rot0) / dt : 0;
  const halfW = t.stats.width / 2;
  t.sideSpeed[0] = t.speed + t.yawRate * halfW;
  t.sideSpeed[1] = t.speed - t.yawRate * halfW;
  t.sidePhase[0] += t.sideSpeed[0] * dt;
  t.sidePhase[1] += t.sideSpeed[1] * dt;
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
  // The Mothership's hull: nothing drives through it, not even a fortress.
  const ms = g.gen.mothership;
  if (ms) {
    for (const t of all) {
      if (Math.abs(t.x - ms.x) > 120 || Math.abs(t.y - ms.y) > 120) continue;
      for (const c of t.circles()) {
        const dx = c.x - ms.x, dy = c.y - ms.y, d = Math.hypot(dx, dy);
        const min = 62 + c.r;
        if (d >= min || d < 1e-6) continue;
        t.x += (dx / d) * (min - d);
        t.y += (dy / d) * (min - d);
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
