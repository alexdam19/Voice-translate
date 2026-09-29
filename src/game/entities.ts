import type { Stack } from '../shared/inventory';
import type { Rarity } from '../shared/rarity';
import type { PoolKind, ProjKind, Special, WeaponItem } from '../shared/weapons';
import type { CrewMember } from './crew';

/** Enemy kind ids: the classic ones plus every zone's roster (generated in enemyDefs). */
export type EnemyKind = string;

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
  /** Part of a horde wave: always hunting you, never wanders off. */
  horde: boolean;
  /** Clinging to a hull (tank-local position and the tank's id) instead of walking. */
  latch: { tank: number; lx: number; lz: number } | null;
  /** Seconds until a moving hull can shove it again. */
  bumpT?: number;
  /** A boss (screen-wide health bar, 3D model, attack patterns). */
  boss?: boolean;
  /** Seconds until it summons again. */
  summonT?: number;
  /** Boss attack rotation counter. */
  moveN?: number;
  /** The major region whose stronghold this boss holds (-1: the Devourer). */
  region?: number;
  /** Throwing itself at the Mothership. */
  siege?: boolean;
  /** Aiming at a spot before firing (long-range units). */
  aim?: { x: number; y: number; t: number } | null;
  /** A weak point or the core of a colossus (its id): moved and animated by the colossus, not by its own AI. */
  colossus?: number;
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
  /** Fired by a gun that isn't a mounted weapon (roof soldiers): still a weapon hit. */
  gun?: boolean;
  fx?: ShotFx;
}

export type PickupKind = 'stack' | 'weapon' | 'chest';

export type ChestKind = 'supply' | 'rune' | 'choice' | 'titan' | 'pack' | 'rare_pack' | 'epic_pack' | 'legendary_pack';
export type PackChest = 'pack' | 'rare_pack' | 'epic_pack' | 'legendary_pack';
export const isPack = (k: ChestKind): k is PackChest => k === 'pack' || k === 'rare_pack' || k === 'epic_pack' || k === 'legendary_pack';

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
  | { type: 'tech'; n: number }
  | { type: 'card'; id: string };

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

export type AllyKind = 'marine' | 'heavy' | 'drone' | 'jet' | 'mech' | 'dragon' | 'mine' | 'buggy' | 'minitank';

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
  /** Squad it belongs to (permanent units that respawn). */
  squad?: string;
  /** Formation slot within its squad. */
  slot?: number;
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
