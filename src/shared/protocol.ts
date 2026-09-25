import type { Slot, Stack } from './inventory';
import type { DriveKey } from './types';
import type { WeaponItem } from './weapons';

/** How a tank looks and what it carries into the Dead Zone. */
export interface Blueprint {
  chassis: string;
  drive: DriveKey;
  modules: { key: string; cx: number; cy: number; weapon: WeaponItem | null }[];
}

export interface RosterEntry {
  id: number;
  name: string;
  bp: Blueprint;
  maxHp: number;
  bot: boolean;
}

/** Tank in a snapshot: [id, x, y, rot, hp, shield, dead, aims...] */
export type NetTank = number[];

export interface NetCrate {
  id: number;
  x: number;
  y: number;
  kind: 'crate' | 'supply' | 'wreck';
}

export type C2S =
  | { t: 'hello'; name: string; bp: Blueprint; maxHp: number; armor: number; shield: number; vault: number; cargo: Slot[]; spare: WeaponItem[] }
  | { t: 'state'; x: number; y: number; rot: number; aims: number[] }
  | { t: 'shot'; kind: string; x: number; y: number; a: number; color: string; speed: number; range: number; pellets: number }
  | { t: 'hit'; target: number; dmg: number; key: string; rarity: number }
  | { t: 'heal'; hp: number; shield: number }
  | { t: 'cargo'; cargo: Slot[]; spare: WeaponItem[]; mounted: WeaponItem[] }
  | { t: 'loot'; crate: number }
  | { t: 'extract'; on: boolean }
  | { t: 'leave' };

export type S2C =
  | { t: 'welcome'; id: number; seed: number; spawn: { x: number; y: number }; roster: RosterEntry[] }
  | { t: 'roster'; add?: RosterEntry; remove?: number }
  | { t: 'snap'; time: number; tanks: NetTank[]; crates: NetCrate[]; extracting: number }
  | { t: 'shot'; from: number; kind: string; x: number; y: number; a: number; color: string; speed: number; range: number; pellets: number; hit?: { x: number; y: number } }
  | { t: 'died'; by: string; dropped: { stacks: Stack[]; weapons: WeaponItem[] } }
  | { t: 'loot'; crate: number; stacks: Stack[]; weapons: WeaponItem[] }
  | { t: 'extracted' }
  | { t: 'event'; text: string; color: string };

export const NET_TICK_MS = 100;
export const EXTRACT_SECONDS = 6;
