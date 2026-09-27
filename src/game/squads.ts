import type { Stack } from '../shared/inventory';
import type { AllyKind } from './entities';

/**
 * Squads: sub-units trained by buildings in your base. They follow the fortress, guard an area you
 * drag them onto, or scavenge ahead (harvest nodes and loot areas, then bring the haul back).
 * A squad's level is its building's level, so upgrading the building upgrades the squad.
 */

export type SquadType = 'marines' | 'buggies' | 'drones' | 'fighters' | 'walker' | 'minitanks';
export type SquadOrder = 'follow' | 'guard' | 'scavenge';

export interface SquadDef {
  key: SquadType;
  name: string;
  building: string;
  unit: AllyKind;
  desc: string;
  /** Units per squad level (index 0 = level 1). */
  sizes: number[];
  hp: number;
  dmg: number;
  range: number;
  /** Seconds to replace the whole squad. */
  respawn: number;
  canScavenge: boolean;
  color: string;
}

export const SQUADS: Record<SquadType, SquadDef> = {
  marines: { key: 'marines', name: 'Marine Squad', building: 'barracks', unit: 'marine', desc: 'Riflemen who fight beside the fortress. Can scavenge, slowly.', sizes: [3, 4, 5, 6, 8], hp: 110, dmg: 10, range: 9, respawn: 16, canScavenge: true, color: '#ff8a80' },
  buggies: { key: 'buggies', name: 'Scout Buggies', building: 'garage', unit: 'buggy', desc: 'Fast armed buggies. Best at scavenging ahead: they harvest nodes and loot areas and bring the haul home.', sizes: [2, 3, 3, 4, 5], hp: 180, dmg: 9, range: 10, respawn: 18, canScavenge: true, color: '#ffd740' },
  drones: { key: 'drones', name: 'Guard Drones', building: 'drone_bay', unit: 'drone', desc: 'Laser drones. Quick to respawn and great at guarding an area.', sizes: [3, 4, 5, 6, 7], hp: 120, dmg: 18, range: 10, respawn: 12, canScavenge: false, color: '#80d8ff' },
  fighters: { key: 'fighters', name: 'Fighter Wing', building: 'jet_hangar', unit: 'jet', desc: 'Mini fighter jets that patrol the sky, strafing and bombing. Enemies can\'t hit them.', sizes: [2, 2, 3, 3, 4], hp: 1, dmg: 36, range: 12, respawn: 20, canScavenge: false, color: '#90caf9' },
  minitanks: { key: 'minitanks', name: 'Mini Tanks', building: 'tank_bay', unit: 'minitank', desc: 'Small, fast escort tanks rolled out of the Tank Bay. They screen your flanks and hunt anything that gets close.', sizes: [1, 2, 2, 3, 4], hp: 900, dmg: 48, range: 14, respawn: 35, canScavenge: false, color: '#26c6da' },
  walker: { key: 'walker', name: 'Walker Mech', building: 'mech_bay', unit: 'mech', desc: 'A slow giant with a cannon and missile racks. Soaks up enormous damage.', sizes: [1, 1, 1, 2, 2], hp: 2200, dmg: 110, range: 16, respawn: 45, canScavenge: false, color: '#ffab40' },
};

export const SQUAD_LIST = Object.values(SQUADS);

export interface SquadState {
  type: SquadType;
  order: SquadOrder;
  /** Guard point. */
  gx: number;
  gy: number;
  /** Scavenging target: a resource node or a loot drop on the ground. */
  target: { kind: 'node' | 'loot'; id: number; x: number; y: number } | null;
  phase: 'going' | 'working' | 'returning';
  /** Seconds of work done at a loot area. */
  work: number;
  carry: Stack[];
  respawn: number;
}

export function newSquad(type: SquadType): SquadState {
  return { type, order: 'follow', gx: 0, gy: 0, target: null, phase: 'going', work: 0, carry: [], respawn: 1 };
}

export const squadSize = (d: SquadDef, level: number): number => d.sizes[Math.max(0, Math.min(d.sizes.length - 1, level - 1))];
export const carryCap = (level: number): number => 10 + level * 6;
