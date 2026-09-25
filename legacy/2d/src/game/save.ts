import type { Slot } from '../shared/inventory';
import type { CrewMember } from './crew';
import type { RigSave } from './rig';

export interface SaveData {
  v: 1;
  seed: number;
  dayTime: number;
  player: { x: number; y: number; hp: number; inv: Slot[]; secure: Slot[]; suit: string | null; gadget: string | null };
  rig: RigSave | null;
  /** Flattened [tileIndex, tileId, ...] pairs of world modifications. */
  mods: number[];
  opened: number[];
  cleared: number[];
  stats: { kills: number; rigs: number; outposts: number; extracts: number; deaths: number; playtime: number; titans?: number };
  explored: string;
  tech?: string[];
  recruits?: CrewMember[];
}

const KEY = 'ironcrawl-save-v1';

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return d && d.v === 1 ? d : null;
  } catch {
    return null;
  }
}

export function writeSave(d: SaveData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
