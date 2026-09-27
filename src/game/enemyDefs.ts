import { ZONE } from '../shared/map';
import type { ProjKind } from '../shared/weapons';
import type { EnemyKind } from './entities';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  r: number;
  speed: number;
  dmg: number;
  range: number;
  rate: number;
  flying?: boolean;
  proj?: ProjKind;
  projSpeed?: number;
  splash?: number;
  loot: string;
  xp: number;
  minThreat: number;
  /** Spawn weight per zone. */
  zones: Partial<Record<number, number>>;
  color: string;
}

const ALL = (w: number): Partial<Record<number, number>> => ({
  [ZONE.RUSTBELT]: w, [ZONE.DUNES]: w, [ZONE.CRYO]: w, [ZONE.GLASS]: w, [ZONE.MAGMA]: w, [ZONE.ACID]: w,
});

export const ENEMIES: Record<string, EnemyDef> = {
  rat: { kind: 'rat', name: 'Scrap Rat', hp: 26, r: 0.38, speed: 5.2, dmg: 5, range: 0.5, rate: 1.2, loot: 'creature', xp: 4, minThreat: 1, zones: { ...ALL(4), [ZONE.RUSTBELT]: 8 }, color: '#8d6e63' },
  drone: { kind: 'drone', name: 'Rust Drone', hp: 22, r: 0.42, speed: 4.2, flying: true, dmg: 4, range: 9, rate: 0.8, proj: 'bullet', projSpeed: 20, loot: 'creature', xp: 5, minThreat: 1, zones: ALL(3), color: '#90a4ae' },
  raider: { kind: 'raider', name: 'Scav Raider', hp: 40, r: 0.42, speed: 3.4, dmg: 6, range: 10, rate: 0.9, proj: 'bullet', projSpeed: 22, loot: 'trooper', xp: 6, minThreat: 1.2, zones: { ...ALL(3), [ZONE.RUSTBELT]: 6 }, color: '#ff7043' },
  bomber: { kind: 'bomber', name: 'Bomb Rat', hp: 30, r: 0.45, speed: 4.8, dmg: 38, range: 0.6, rate: 1, splash: 2.4, loot: 'creature', xp: 7, minThreat: 1.8, zones: ALL(2), color: '#ff5252' },
  buggy: { kind: 'buggy', name: 'Raider Buggy', hp: 110, r: 0.85, speed: 7, dmg: 9, range: 11, rate: 1.5, proj: 'bullet', projSpeed: 24, loot: 'trooper', xp: 14, minThreat: 2.1, zones: { ...ALL(2), [ZONE.DUNES]: 5 }, color: '#ffb74d' },
  stalker: { kind: 'stalker', name: 'Dune Stalker', hp: 150, r: 0.65, speed: 5.5, dmg: 22, range: 0.8, rate: 0.8, loot: 'creature', xp: 18, minThreat: 2.4, zones: { [ZONE.DUNES]: 6, [ZONE.GLASS]: 2, [ZONE.MAGMA]: 2, [ZONE.ACID]: 2 }, color: '#d7a860' },
  spitter: { kind: 'spitter', name: 'Acid Spitter', hp: 90, r: 0.55, speed: 2.6, dmg: 16, range: 13, rate: 0.5, proj: 'spit', projSpeed: 11, splash: 1.6, loot: 'creature', xp: 16, minThreat: 2.8, zones: { [ZONE.ACID]: 7, [ZONE.GLASS]: 4, [ZONE.MAGMA]: 2 }, color: '#76ff03' },
  wraith: { kind: 'wraith', name: 'Cryo Wraith', hp: 180, r: 0.6, speed: 5, flying: true, dmg: 18, range: 8, rate: 0.9, proj: 'plasma', projSpeed: 16, loot: 'creature', xp: 30, minThreat: 3.8, zones: { [ZONE.CRYO]: 7, [ZONE.ACID]: 2, [ZONE.GLASS]: 2 }, color: '#80d8ff' },
  brute: { kind: 'brute', name: 'Scrap Brute', hp: 420, r: 1, speed: 2.4, dmg: 38, range: 1.1, rate: 0.6, loot: 'trooper', xp: 40, minThreat: 3.5, zones: { ...ALL(2), [ZONE.MAGMA]: 4 }, color: '#a1887f' },
  rocketeer: { kind: 'rocketeer', name: 'Rocketeer', hp: 100, r: 0.45, speed: 3, dmg: 26, range: 15, rate: 0.4, proj: 'missile', projSpeed: 13, splash: 1.5, loot: 'trooper', xp: 20, minThreat: 3.4, zones: ALL(3), color: '#ef5350' },
  mech: { kind: 'mech', name: 'Walker Mech', hp: 900, r: 1.35, speed: 2.2, dmg: 16, range: 16, rate: 2.2, proj: 'bullet', projSpeed: 26, loot: 'elite', xp: 80, minThreat: 5, zones: ALL(1.5), color: '#78909c' },
  swarmer: { kind: 'swarmer', name: 'Swarmer', hp: 16, r: 0.32, speed: 6.2, dmg: 4, range: 0.4, rate: 1.4, loot: 'swarm', xp: 1.2, minThreat: 99, zones: {}, color: '#a5a58d' },
  leaper: { kind: 'leaper', name: 'Leaper', hp: 30, r: 0.36, speed: 5.2, dmg: 6, range: 0.4, rate: 1.2, loot: 'swarm', xp: 2.5, minThreat: 99, zones: {}, color: '#7cb342' },
  guardian: { kind: 'guardian', name: 'Rune Guardian', hp: 700, r: 1.25, speed: 3, dmg: 30, range: 1.4, rate: 0.7, loot: 'elite', xp: 60, minThreat: 99, zones: {}, color: '#b388ff' },
  titan_walker: { kind: 'titan_walker', name: 'Colossal Walker', hp: 6000, r: 3, speed: 2, dmg: 90, range: 6, rate: 0.3, loot: 'titan', xp: 400, minThreat: 99, zones: {}, color: '#8d8d8d' },
  titan_beast: { kind: 'titan_beast', name: 'Dread Behemoth', hp: 5000, r: 2.6, speed: 3.6, dmg: 70, range: 3.5, rate: 0.5, loot: 'titan', xp: 400, minThreat: 99, zones: {}, color: '#6d4c41' },
  titan_worm: { kind: 'titan_worm', name: 'Burrow Titan', hp: 7000, r: 2.1, speed: 6, dmg: 130, range: 4.5, rate: 0.25, loot: 'titan', xp: 450, minThreat: 99, zones: {}, color: '#c0a060' },
};

export const TITAN_STYLE: Record<number, EnemyKind> = {
  [ZONE.RUSTBELT]: 'titan_walker', [ZONE.DUNES]: 'titan_worm', [ZONE.CRYO]: 'titan_walker', [ZONE.GLASS]: 'titan_walker', [ZONE.MAGMA]: 'titan_beast', [ZONE.ACID]: 'titan_worm',
};

export const TITAN_NAMES: Record<string, string[]> = {
  titan_walker: ['Rustmother', 'The Iron Pilgrim', 'Glasswalker', 'Old Stompy'],
  titan_beast: ['Cinderjaw', 'The Slag Hound', 'Emberback'],
  titan_worm: ['Sandmaw', 'The Deep Throat', 'Acid Leviathan'],
};
