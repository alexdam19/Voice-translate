import type { Stack } from '../shared/inventory';
import type { Rarity } from '../shared/rarity';
import type { PoolKind, ProjKind, Special, WeaponItem } from '../shared/weapons';
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
  /** Seconds of slow left, and how strong it is (0-0.9). */
  slow: number;
  slowAmt: number;
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

/** On-hit effects a shot carries (from the weapon, its tree and affixes). */
export interface ShotFx {
  slow: number;
  stun: number;
  stunTime: number;
  knock: number;
  pool?: PoolKind;
  split: number;
  pull: boolean;
  execute: boolean;
  volatile: boolean;
  specials: Special[];
  /** Damage of the original hit (fragments, pools and chain reactions scale from it). */
  base: number;
}

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
  fx?: ShotFx;
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

export type AllyKind = 'marine' | 'heavy' | 'drone' | 'jet' | 'mech' | 'dragon' | 'mine';

export interface Ally {
  id: number;
  kind: AllyKind;
  x: number;
  y: number;
  /** Height above ground (flyers). */
  z: number;
  /** Heading (radians) for vehicles and flyers. */
  rot: number;
  hp: number;
  maxHp: number;
  life: number;
  dmg: number;
  range: number;
  cd: number;
  /** Secondary cooldown (bombs, missiles, breath). */
  cd2: number;
  heavy: boolean;
  face: number;
  anim: number;
  targetId: number;
  /** Where it was sent (jets, dragon) or its home (mines). */
  tx: number;
  ty: number;
  /** Turret module that launched it (Hornet jets). */
  owner: number;
}

export type ZoneKind = 'fire' | 'well' | 'acid' | 'chrono' | 'rad' | 'frost' | 'smoke';

/** Burning ground, acid pools, time fields, gravity wells and radiation. */
export interface Zone {
  id: number;
  x: number;
  y: number;
  r: number;
  t: number;
  kind: ZoneKind;
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
