import type { Slot, Stack } from './inventory';

/** Wire format for the Dead Zone (JSON over WebSocket). */

export interface NetPlayer {
  id: number;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  aim: number;
  weapon: string;
  hp: number;
  maxHp: number;
  suit: string | null;
  bot: boolean;
  anim: number;
}

export interface NetCrate {
  id: number;
  x: number;
  y: number;
  items: Stack[];
  kind: 'body' | 'supply';
  label: string;
}

export interface NetExtract {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
}

export type C2S =
  | { t: 'join'; name: string; inv: Slot[]; suit: string | null; hp: number; maxHp: number; armor: number }
  | { t: 'state'; x: number; y: number; vx: number; vy: number; facing: number; aim: number; weapon: string; anim: number }
  | { t: 'inv'; inv: Slot[] }
  | { t: 'shoot'; x: number; y: number; a: number; w: string }
  | { t: 'hit'; target: number; dmg: number; w: string }
  | { t: 'tile'; x: number; y: number; tile: number }
  | { t: 'take'; crate: number; index: number }
  | { t: 'heal'; amount: number }
  | { t: 'extract' }
  | { t: 'chat'; msg: string };

export type S2C =
  | {
      t: 'welcome';
      id: number;
      seed: number;
      spawn: { x: number; y: number };
      players: NetPlayer[];
      crates: NetCrate[];
      edits: [number, number][];
      hp: number;
      maxHp: number;
    }
  | { t: 'snap'; players: NetPlayer[] }
  | { t: 'shot'; id: number; x: number; y: number; a: number; w: string }
  | { t: 'hp'; id: number; hp: number }
  | { t: 'killed'; victim: number; victimName: string; killerName: string }
  | { t: 'you_died'; by: string; lost: Stack[] }
  | { t: 'crate'; crate: NetCrate }
  | { t: 'crate_gone'; id: number }
  | { t: 'took'; crate: number; stack: Stack }
  | { t: 'tile'; x: number; y: number; tile: number }
  | { t: 'extracted' }
  | { t: 'msg'; text: string; color?: string }
  | { t: 'left'; id: number };

export const NET_TICK_MS = 50;
export const EXTRACT_SECONDS = 6;
