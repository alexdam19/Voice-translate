import { turnToward, wrapAngle } from '../../shared/types';
import { WEAPONS, type WeaponDef, type WeaponStats } from '../../shared/weapons';
import type { Enemy } from '../entities';
import type { Game, Target } from '../game';
import { MODULES } from '../defs';
import type { ModuleInst, Tank } from '../tank';
import { fire } from './weapons';

/**
 * Gunner: you take one of the Titan's own guns and work it yourself, on its camera. The turret turns to your
 * crosshair (faster than its crew would bother to), the trigger fires its real rounds, and the gun has a magazine:
 * it runs dry, you reload (R, or it starts by itself when it clicks empty), and it kicks with every shot. Light guns
 * are full-auto while the trigger's held; the heavy ones fire a round a click. Every hit flashes the hit marker, every
 * kill is confirmed on the feed. The other guns stay on their crews' fire control, and the helm still answers WASD.
 */

export interface GunMag {
  mag: number;
  /** Seconds left on a reload (0: ready). */
  reload: number;
}

export interface Gunner {
  /** The gun (module id) you're on, and its weapon key (for hit markers). */
  id: number;
  wkey: string;
  /** The crosshair (world). */
  aim: { x: number; y: number };
  held: boolean;
  /** A fresh press, for the heavy guns' one-round-a-click. */
  fresh: boolean;
  /** The camera's kick (decays), the hit marker's flash, kills just confirmed. */
  kick: number;
  hitT: number;
  killT: number;
  hits: number;
  kills: number;
  shots: number;
  t: number;
}

/** Rounds in a magazine: a few big shells for the heavies, belts for the light guns. */
export function magSize(m: ModuleInst): number {
  const d = WEAPONS[m.weapon?.key ?? ''];
  const s = m.stats;
  if (!d || !s) return 0;
  if (m.key === 'main_gun') return 4;
  if (d.size === 'heavy') return Math.max(3, Math.min(12, Math.round(s.rate * 8)));
  if (d.size === 'medium') return Math.max(8, Math.min(40, Math.round(s.rate * 6)));
  return Math.max(20, Math.min(150, Math.round(s.rate * 10)));
}

export function reloadTime(m: ModuleInst): number {
  const d = WEAPONS[m.weapon?.key ?? ''];
  if (m.key === 'main_gun') return 4;
  return d?.size === 'heavy' ? 3.2 : d?.size === 'medium' ? 2.4 : 1.8;
}

/** Fires one round a click (the heavies), or keeps going while the trigger's held. */
function semiAuto(m: ModuleInst, d: WeaponDef): boolean {
  return m.key === 'main_gun' || d.size === 'heavy';
}

/** The guns you can take: armed, crewed, not wrecked; the main battery first. */
export function gunsOf(g: Game): ModuleInst[] {
  const p = g.player;
  return p.modules
    .filter((m) => m.weapon && m.stats && WEAPONS[m.weapon.key] && (m.wreck ?? 0) < 1 && (p.crewNeeded(m) <= 0 || m.crew > 0))
    .sort((a, b) => (a.key === 'main_gun' ? 0 : 1) - (b.key === 'main_gun' ? 0 : 1) || p.moduleLocal(b).lx - p.moduleLocal(a).lx);
}

const mags = new WeakMap<Game, Map<number, GunMag>>();

/** A gun's magazine (full the first time you take it). */
export function magOf(g: Game, m: ModuleInst): GunMag {
  let all = mags.get(g);
  if (!all) mags.set(g, (all = new Map()));
  let mg = all.get(m.id);
  if (!mg) all.set(m.id, (mg = { mag: magSize(m), reload: 0 }));
  return mg;
}

export function takeGun(g: Game, id?: number): string | null {
  const p = g.player;
  if (p.dead || g.mode !== 'world' || !p.fortress) return 'Not now.';
  if (g.streak.active) return 'On a killstreak feed.';
  const guns = gunsOf(g);
  const m = guns.find((k) => k.id === id) ?? guns[0];
  if (!m) return 'No crewed gun to take.';
  const pos = p.moduleWorld(m);
  const reach = Math.min(m.stats!.range * 0.6, 80);
  g.gunner = {
    id: m.id, wkey: m.weapon!.key, aim: { x: pos.x + Math.cos(m.aim) * reach, y: pos.y + Math.sin(m.aim) * reach },
    held: false, fresh: false, kick: 0, hitT: 0, killT: 0, hits: 0, kills: 0, shots: 0, t: 0,
  };
  magOf(g, m);
  g.hooks.sound('vhs');
  return null;
}

export function leaveGun(g: Game): void {
  if (!g.gunner) return;
  const gn = g.gunner;
  g.gunner = null;
  if (gn.kills) g.hooks.toast(`Off the gun · ${gn.kills} kill${gn.kills > 1 ? 's' : ''}, ${gn.shots ? Math.round((100 * gn.hits) / Math.max(gn.hits, gn.shots)) : 0}% on target.`, '#b0bec5');
}

export function gunAim(g: Game, x: number, y: number): void {
  const gn = g.gunner;
  if (!gn) return;
  const m = g.player.modules.find((k) => k.id === gn.id);
  if (!m?.stats) return;
  // As far as the gun reaches.
  const pos = g.player.moduleWorld(m);
  const dx = x - pos.x, dy = y - pos.y, d = Math.hypot(dx, dy), lim = m.stats.range;
  gn.aim.x = d > lim ? pos.x + (dx / d) * lim : x;
  gn.aim.y = d > lim ? pos.y + (dy / d) * lim : y;
}

export function gunTrigger(g: Game, down: boolean): void {
  const gn = g.gunner;
  if (!gn) return;
  if (down && !gn.held) gn.fresh = true;
  gn.held = down;
}

/** Another gun: by offset (the wheel) or, from 100 up, by its place in the list (1-9). */
export function gunSwitch(g: Game, i: number): void {
  const gn = g.gunner;
  if (!gn) return;
  const guns = gunsOf(g);
  if (!guns.length) return;
  const at = Math.max(0, guns.findIndex((m) => m.id === gn.id));
  const next = i >= 100 ? guns[Math.min(guns.length - 1, i - 100)] : guns[(((at + i) % guns.length) + guns.length) % guns.length];
  if (!next || next.id === gn.id) return;
  gn.id = next.id;
  gn.wkey = next.weapon!.key;
  gn.held = false;
  magOf(g, next);
  g.hooks.sound('ui');
}

/** Pulls the magazine and slaps a fresh one in. */
export function gunReload(g: Game): void {
  const gn = g.gunner;
  if (!gn) return;
  const m = g.player.modules.find((k) => k.id === gn.id);
  if (!m) return;
  const mg = magOf(g, m);
  if (mg.reload > 0 || mg.mag >= magSize(m)) return;
  mg.reload = reloadTime(m);
  g.hooks.sound('reload');
}

/** A hit from the gun you're on (the hit marker), or the kill. */
export function gunnerHit(g: Game, e: Enemy, killed: boolean): void {
  const gn = g.gunner;
  if (!gn || Math.hypot(e.x - gn.aim.x, e.y - gn.aim.y) > 30 + e.r) return;
  gn.hits++;
  gn.hitT = 0.16;
  if (killed) {
    gn.kills++;
    gn.killT = 1.1;
  }
}

/** Each step: the reloads, the kick settling, and off the gun when there's no gun or no ship. */
export function updateGunner(g: Game, dt: number): void {
  const all = mags.get(g);
  if (all) {
    for (const m of g.player.modules) {
      const mg = all.get(m.id);
      if (!mg || mg.reload <= 0) continue;
      mg.reload -= dt;
      if (mg.reload <= 0) {
        mg.reload = 0;
        mg.mag = magSize(m);
        if (g.gunner?.id === m.id) g.hooks.sound('lockon');
      }
    }
  }
  const gn = g.gunner;
  if (!gn) return;
  gn.t += dt;
  gn.kick = Math.max(0, gn.kick - dt * 5);
  gn.hitT = Math.max(0, gn.hitT - dt);
  gn.killT = Math.max(0, gn.killT - dt);
  const p = g.player;
  const m = p.modules.find((k) => k.id === gn.id);
  if (p.dead || g.mode !== 'world' || g.streak.active || !m || !m.weapon || (m.wreck ?? 0) >= 1) leaveGun(g);
}

/** The gun you're on, each step (called from the weapons loop in place of its fire control). */
export function manualGun(g: Game, t: Tank, m: ModuleInst, d: WeaponDef, s: WeaponStats, pos: { x: number; y: number }, dt: number): void {
  const gn = g.gunner!;
  const mg = magOf(g, m);
  const want = Math.atan2(gn.aim.y - pos.y, gn.aim.x - pos.x);
  m.aim = turnToward(m.aim, want, Math.max(1.2, s.turn * 1.8) * dt);
  if (!gn.held || m.cd > 0 || mg.reload > 0) return;
  if (semiAuto(m, d) && !gn.fresh) return;
  if (mg.mag <= 0) {
    gunReload(g);
    return;
  }
  if (Math.abs(wrapAngle(want - m.aim)) > (d.arc || d.homing > 0 || s.speed === 0 ? 0.25 : 0.12)) return;
  const dist = Math.hypot(gn.aim.x - pos.x, gn.aim.y - pos.y);
  if (dist < s.minRange) return;
  // Whatever's under the crosshair is the target (homing rounds and hitscan beams need one).
  let target: Target | null = null, bd = 9;
  for (const e of g.enemiesNear(gn.aim.x, gn.aim.y, 9)) {
    if (e.hp <= 0 || e.burrowed) continue;
    const dd = Math.hypot(e.x - gn.aim.x, e.y - gn.aim.y) - e.r;
    if (dd < bd) {
      bd = dd;
      target = { id: e.id, x: e.x, y: e.y, r: e.r, flying: !!e.flying };
    }
  }
  m.cd = 1 / s.rate;
  m.recoil = 1;
  m.shots++;
  fire(g, t, m, d, s, pos.x, pos.y, Math.min(dist, s.range), target);
  mg.mag--;
  gn.fresh = false;
  gn.shots++;
  gn.kick = Math.min(1.4, gn.kick + (m.key === 'main_gun' ? 1.2 : d.size === 'heavy' ? 0.8 : d.size === 'medium' ? 0.35 : 0.14));
  if (m.key === 'main_gun' || d.size === 'heavy') g.fx.push({ t: 'shake', amt: m.key === 'main_gun' ? 0.6 : 0.3 });
  if (mg.mag <= 0) gunReload(g);
}

/** What the feed shows about the gun you're on. */
export function gunInfo(g: Game): { m: ModuleInst; name: string; mag: number; size: number; reload: number; reloadOf: number } | null {
  const gn = g.gunner;
  if (!gn) return null;
  const m = g.player.modules.find((k) => k.id === gn.id);
  if (!m || !m.weapon) return null;
  const mg = magOf(g, m);
  const d = WEAPONS[m.weapon.key];
  return { m, name: m.key === 'main_gun' ? d.name : `${MODULES[m.key]?.name ?? 'GUN'} · ${d.name}`, mag: mg.mag, size: magSize(m), reload: mg.reload, reloadOf: reloadTime(m) };
}
