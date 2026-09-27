import { DRIVE_ITEM, getItem } from '../../shared/items';
import { TER, TRACTION } from '../../shared/map';
import type { DriveKey } from '../../shared/types';
import { DRIVE_INFO } from '../defs';
import type { Game } from '../game';

/**
 * Drive trains. Every part of the map is drivable, but the right drive train makes it fast (and makes lava and
 * acid safe). You own a drive train once it's unlocked on the Level Road (or crafted), and swapping is free and
 * instant. With AUTO on, the fortress picks the best one for the ground ahead by itself.
 */

export const DRIVES: DriveKey[] = ['wheels', 'tracks', 'chains', 'magma', 'hover'];

/** Commander level that hands you each drive train. */
export const DRIVE_LEVEL: Record<DriveKey, number> = { wheels: 1, tracks: 3, chains: 5, magma: 8, hover: 12 };

export function ownsDrive(g: Game, k: DriveKey): boolean {
  return k === 'wheels' || g.player.drive === k || g.drivesOwned.has(k) || g.commander.level >= DRIVE_LEVEL[k] || g.player.cargo.count(DRIVE_ITEM[k]) > 0;
}

export function ownedDrives(g: Game): DriveKey[] {
  return DRIVES.filter((k) => ownsDrive(g, k));
}

/** Liquids burn or eat through a hull whose drive train can't cross them. */
export function liquidHurts(drive: DriveKey, ter: number): boolean {
  if (ter === TER.LAVA) return drive !== 'magma' && drive !== 'hover';
  if (ter === TER.ACID) return drive !== 'hover';
  return false;
}

/** How well a drive train handles the ground around the fortress and just ahead of it (higher is better). */
export function driveScore(g: Game, k: DriveKey): number {
  const p = g.player;
  const table = TRACTION[k];
  const ahead = Math.max(4, Math.abs(p.speed) * 1.5);
  let sum = 0, n = 0;
  for (const lx of [-p.stats.length * 0.35, 0, p.stats.length * 0.35, p.stats.length / 2 + ahead]) {
    for (const lz of [-p.stats.width * 0.3, p.stats.width * 0.3]) {
      const w = p.toWorld(lx, lz);
      const ter = g.map.terAt(w.x, w.y);
      let v = table[ter] ?? 1;
      if (v <= 0) v = 0.35;
      if (liquidHurts(k, ter)) v -= 0.6;
      sum += v;
      n++;
    }
  }
  return sum / n;
}

/** Swaps drive trains. Owned ones are free and instant. */
export function setDrive(g: Game, k: DriveKey, auto = false): boolean {
  const p = g.player;
  if (p.drive === k || !ownsDrive(g, k)) return false;
  // A crafted one is used up the first time; after that you own it.
  if (!g.drivesOwned.has(k) && g.commander.level < DRIVE_LEVEL[k] && k !== 'wheels' && p.cargo.count(DRIVE_ITEM[k]) > 0) p.cargo.take(DRIVE_ITEM[k], 1);
  g.drivesOwned.add(p.drive);
  g.drivesOwned.add(k);
  p.drive = k;
  p.version++;
  g.driveSwapT = 3;
  g.hooks.toast(`${auto ? 'Auto: ' : ''}${DRIVE_INFO[k].name} on (${DRIVE_INFO[k].best.toLowerCase()}).`, '#ffd740');
  g.hooks.sound('build');
  return true;
}

/** AUTO: every half second, switch to a clearly better drive train for the ground under and ahead of the hull. */
export function updateAutoDrive(g: Game, dt: number): void {
  g.driveSwapT -= dt;
  if (!g.autoDrive || g.player.dead || g.mode !== 'world') return;
  g.timers.drive -= dt;
  if (g.timers.drive > 0 || g.driveSwapT > 0) return;
  g.timers.drive = 0.5;
  const cur = driveScore(g, g.player.drive);
  let best = g.player.drive, bs = cur;
  for (const k of ownedDrives(g)) {
    const s = driveScore(g, k);
    if (s > bs + 0.001) {
      best = k;
      bs = s;
    }
  }
  if (best !== g.player.drive && bs > cur * 1.12 + 0.02) setDrive(g, best, true);
}

export const driveName = (k: DriveKey): string => DRIVE_INFO[k]?.name ?? getItem(DRIVE_ITEM[k]).name;
