import type { Stack } from '../shared/inventory';
import type { Rarity } from '../shared/rarity';
import type { ProjKind, WeaponItem } from '../shared/weapons';
import type { CrewMember } from './crew';

export type EnemyKind =
  | 'rat' | 'drone' | 'raider' | 'bomber' | 'buggy' | 'stalker' | 'spitter' | 'brute' | 'rocketeer' | 'mech' | 'wraith' | 'guardian'
  | 'titan_walker' | 'titan_beast' | 'titan_worm';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  dmg: number;
  range: number;
  atkCd: number;
  atkRate: number;
  threat: number;
  elite: boolean;
  flying: boolean;
  state: string;
  stateT: number;
  targetId: number;
  /** Home position (camps leash back to it). */
  homeX: number;
  homeY: number;
  leash: number;
  /** Rune altar id for guardians. */
  camp: number;
  stun: number;
  slow: number;
  burn: number;
  burnDps: number;
  hitFlash: number;
  anim: number;
  burrowed: boolean;
  lastHitBy: number;
  aggro: boolean;
  /** Titan part circles (e.g. worm segments). */
  parts: { x: number; y: number; r: number }[];
  loot: string;
  xp: number;
  titan: boolean;
  name: string;
  z: number;
}

export type Team = 'player' | 'enemy';

export interface Projectile {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  team: Team;
  kind: ProjKind;
  dmg: number;
  splash: number;
  pierce: number;
  life: number;
  maxLife: number;
  color: string;
  homing: number;
  targetId: number;
  arc: boolean;
  /** Arc shots land here. */
  tx: number;
  ty: number;
  burn: number;
  crit: boolean;
  lifesteal: number;
  srcTank: number;
  /** Already-hit entity ids (pierce). */
  hit: number[];
  flyer: number;
  /** Can be shot down by point defense. */
  interceptable: boolean;
  hp: number;
  size: number;
  /** Weapon that fired it (for Dead Zone hit validation). */
  wkey?: string;
  wr?: number;
  /** Purely cosmetic (other players' shots in the Dead Zone). */
  visual?: boolean;
}

export type PickupKind = 'stack' | 'weapon' | 'chest';

export type ChestKind = 'supply' | 'rune' | 'choice' | 'titan';

export interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: PickupKind;
  stack?: Stack;
  weapon?: WeaponItem;
  chest?: ChestKind;
  chestThreat?: number;
  rarity?: Rarity;
  life: number;
  /** Seconds before it can be picked up (spawn animation). */
  delay: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
}

export type Reward =
  | { type: 'items'; stacks: Stack[] }
  | { type: 'weapon'; item: WeaponItem }
  | { type: 'crew'; crew: CrewMember }
  | { type: 'tech'; n: number };

export interface Telegraph {
  id: number;
  x: number;
  y: number;
  shape: 'circle' | 'line';
  r: number;
  /** For lines: angle and length. */
  a: number;
  len: number;
  t: number;
  total: number;
  color: string;
  team: Team;
  dmg: number;
  onDone?: () => void;
}

export interface Ally {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  life: number;
  dmg: number;
  range: number;
  cd: number;
  heavy: boolean;
  face: number;
  anim: number;
  targetId: number;
}

/** Burning ground and gravity wells. */
export interface Zone {
  id: number;
  x: number;
  y: number;
  r: number;
  t: number;
  kind: 'fire' | 'well' | 'acid';
  dps: number;
  team: Team;
}

export interface FloatText {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  t: number;
  big: boolean;
}

let nextId = 100000;
export function eid(): number {
  return nextId++;
}
