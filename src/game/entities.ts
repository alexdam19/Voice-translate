import { INV_SLOTS, SECURE_SLOTS } from '../shared/constants';
import { Inventory, type Stack } from '../shared/inventory';
import { getItem, type ProjKind } from '../shared/items';
import type { CollisionGrid } from '../shared/physics';
import type { NetCrate } from '../shared/protocol';
import type { Hazard, RGB } from '../shared/types';
import type { World } from '../shared/world';
import type { Rect } from '../shared/warzoneGen';
import { Particles } from '../render/particles';
import type { Rig } from './rig';

export class Player {
  x = 0;
  y = 0;
  w = 14;
  h = 30;
  vx = 0;
  vy = 0;
  grounded = false;
  groundGrid: CollisionGrid | null = null;
  dropTimer = 0;
  team = 'player';

  hp = 100;
  maxHp = 100;
  energy = 100;
  maxEnergy = 100;
  fuel = 0;
  inv = new Inventory(INV_SLOTS);
  secure = new Inventory(SECURE_SLOTS);
  suit: string | null = 'scav_jacket';
  gadget: string | null = null;
  selected = 0;
  facing = 1;
  aim = 0;
  fireCd = 0;
  useCd = 0;
  mining: { tx: number; ty: number; rig: Rig | null; progress: number } | null = null;
  repairing = false;
  invuln = 0;
  dead = false;
  deadTimer = 0;
  driving: Rig | null = null;
  climbing = false;
  inLiquid = 0;
  coyote = 0;
  anim = 0;
  hurtFlash = 0;
  jetting = false;
  exposure: Hazard | null = null;
  regenDelay = 0;

  get armor(): number {
    return this.suit ? getItem(this.suit).suit?.armor ?? 0 : 0;
  }

  protects(h: Hazard): boolean {
    return !!this.suit && !!getItem(this.suit).suit?.protects.includes(h);
  }

  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }

  held(): Stack | null {
    return this.inv.slots[this.selected] ?? null;
  }
}

export type EnemyKind = 'crawler' | 'gunner' | 'drone' | 'brute' | 'trooper';

export class Enemy {
  x = 0;
  y = 0;
  w = 16;
  h = 16;
  vx = 0;
  vy = 0;
  grounded = false;
  groundGrid: CollisionGrid | null = null;
  dropTimer = 0;
  team = 'hostile';

  hp = 30;
  maxHp = 30;
  dmg = 10;
  speed = 100;
  name = '';
  tint: RGB = [255, 255, 255];
  flying = false;
  fireCd = 1;
  jumpCd = 0;
  t = Math.random() * 10;
  hurtFlash = 0;
  facing = 1;
  aim = 0;
  dead = false;
  homeRig: Rig | null = null;
  loot = 'creature';
  stuck = 0;

  constructor(public kind: EnemyKind) {}

  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  dmg: number;
  team: string;
  kind: ProjKind;
  explosive: number;
  pierce: number;
  gravity: number;
  tileDmg: number;
  color: string;
  knock: number;
  /** Visual-only (remote players / server bots): never deals damage locally. */
  visual: boolean;
  hits: Set<unknown> | null;
  homing: { x: number; y: number } | null;
  sourceRig: Rig | null;
  weapon: string;
  dead: boolean;
}

export interface ItemDrop {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  grounded: boolean;
  groundGrid: CollisionGrid | null;
  dropTimer: number;
  team: string;
  stack: Stack;
  age: number;
}

export interface Cache {
  id: number;
  x: number;
  y: number;
  table: string;
  opened: boolean;
}

export interface RemotePlayer {
  id: number;
  name: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
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
  w: number;
  h: number;
  hurtFlash: number;
}

/** One simulated space: the open world, or a Warzone instance. */
export class Sim {
  rigs: Rig[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  drops: ItemDrop[] = [];
  caches: Cache[] = [];
  remotes = new Map<number, RemotePlayer>();
  crates = new Map<number, NetCrate>();
  extracts: Rect[] = [];
  particles = new Particles();
  time = 0;

  constructor(
    public kind: 'world' | 'warzone',
    public world: World,
  ) {}
}
