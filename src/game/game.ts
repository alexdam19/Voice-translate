import { CENTER, MAP_SIZE, MAX_BASE_CREW, OFFICER_SLOTS } from '../shared/constants';
import { canAfford, payCost, type Cost, type Stack } from '../shared/inventory';
import { getItem } from '../shared/items';
import { rollLoot } from '../shared/loot';
import type { GameMap } from '../shared/map';
import { generateWorld, threatAt, type RuneKind, type WorldGen } from '../shared/mapgen';
import { RNG } from '../shared/rng';
import type { WeaponItem } from '../shared/weapons';
import { computeCrewBonus, giveXp, makeRecruit, type CrewMember } from './crew';
import { eid, type Ally, type ChestKind, type Enemy, type FloatText, type Pickup, type Projectile, type Reward, type Telegraph, type Zone } from './entities';
import { ENEMIES } from './enemyDefs';
import { freeTech } from './tech';
import { Tank } from './tank';
import { buildStarterTank, starterCrew } from './templates';

export type FxEvent =
  | { t: 'boom'; x: number; y: number; r: number; color: string; big?: boolean }
  | { t: 'muzzle'; x: number; y: number; a: number; color: string; size: number }
  | { t: 'spark'; x: number; y: number; color: string; n: number }
  | { t: 'beam'; x0: number; y0: number; x1: number; y1: number; color: string; w: number; life: number }
  | { t: 'bolt'; pts: { x: number; y: number }[]; color: string }
  | { t: 'ring'; x: number; y: number; r: number; color: string }
  | { t: 'dust'; x: number; y: number; color: string }
  | { t: 'heal'; x: number; y: number }
  | { t: 'shake'; amt: number };

export interface GameHooks {
  toast(text: string, color?: string): void;
  sound(name: string, x?: number, y?: number, vol?: number): void;
  chest(kind: ChestKind, rewards: Reward[], choice: boolean): void;
  died(): void;
  enterDeadZone(): void;
}

export interface GameStats {
  kills: number;
  titans: number;
  raiders: number;
  outposts: number;
  sites: number;
  runes: number;
  chests: number;
  harvested: number;
  deaths: number;
  time: number;
}

export type OutriderOrder = { mode: 'follow' } | { mode: 'hold'; x: number; y: number } | { mode: 'expedition'; kind: 'node' | 'site'; id: number; phase: 'going' | 'working' | 'returning'; t: number };

export interface Target {
  id: number;
  x: number;
  y: number;
  r: number;
  flying: boolean;
}

export class Game {
  gen: WorldGen;
  map: GameMap;
  mode: 'world' | 'raid' = 'world';
  time = 0;
  rng: RNG;
  player: Tank;
  outrider: Tank | null = null;
  outriderLevel = 0;
  outriderOrder: OutriderOrder = { mode: 'follow' };
  outriderRebuild = 0;
  tanks: Tank[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  allies: Ally[] = [];
  telegraphs: Telegraph[] = [];
  zones: Zone[] = [];
  floats: FloatText[] = [];
  fx: FxEvent[] = [];
  crew: CrewMember[];
  recruits: CrewMember[] = [];
  armory: WeaponItem[] = [];
  tech: Set<string>;
  explored: Uint8Array;
  visible: Uint8Array;
  fogVersion = 0;
  runeBuff: { rune: RuneKind; t: number } | null = null;
  /** Next chest rolls this many rarity tiers higher (Treasure Sense). */
  chestBonus = 0;
  outpostsDown = new Set<number>();
  outpostTanks = new Map<number, Tank>();
  /** Rune altar id -> ids of its living guardians. */
  runeCamps = new Map<number, number[]>();
  runeClaim = { id: 0, t: 0 };
  site = { id: 0, t: 0, wave: 0 };
  harvestId = 0;
  /** Where the player right-clicked to interact (site, rune, gate, pickup). */
  interact: { kind: 'site' | 'rune' | 'gate'; id: number } | null = null;
  stats: GameStats = { kills: 0, titans: 0, raiders: 0, outposts: 0, sites: 0, runes: 0, chests: 0, harvested: 0, deaths: 0, time: 0 };
  objective = 0;
  objectiveCounters: Record<string, number> = {};
  /** World point under the mouse. */
  aim = { x: 0, y: 0 };
  /** Manual weapons fire while this is held. */
  fireHeld = false;
  /** Global auto-fire toggle. When off, every weapon is manual. */
  autoFire = true;
  respawnIn = 0;
  deadZoneMode = false;
  timers = { spawn: 2, raider: 50, titan: 200, crew: 0, vision: 0, hazard: 0, food: 0, recruit: 0, save: 30 };
  hazardWarn: string | null = null;
  hooks: GameHooks = { toast: () => {}, sound: () => {}, chest: () => {}, died: () => {}, enterDeadZone: () => {} };
  revealAll = false;
  nextTitanName = 0;
  onPlayerDestroyed?: () => void;
  onOutriderDestroyed?: () => void;
  onRemoteHit?: (t: Tank, dmg: number, o: { crit?: boolean; wkey?: string; wr?: number }) => void;
  onHeal?: (hp: number, shield: number) => void;
  onFire?: (kind: string, x: number, y: number, a: number, color: string, speed: number, range: number, pellets: number) => void;
  /** Dead Zone extraction points and progress. */
  extracts: { x: number; y: number; r: number }[] = [];
  extractProgress = 0;

  constructor(seed: number, gen?: WorldGen) {
    this.gen = gen ?? generateWorld(seed);
    this.map = this.gen.map;
    this.rng = new RNG(seed ^ 0x9e3779b9);
    this.player = buildStarterTank(this.gen.spawn.x, this.gen.spawn.y);
    this.crew = starterCrew();
    this.tech = freeTech();
    this.explored = new Uint8Array(MAP_SIZE * MAP_SIZE);
    this.visible = new Uint8Array(MAP_SIZE * MAP_SIZE);
    this.applyCrew();
    this.player.hp = this.player.stats.maxHp;
    this.rollRecruits();
  }

  get seed(): number {
    return this.gen.seed;
  }

  /* ---------------------------------------------------------------- */
  /* Crew                                                              */
  /* ---------------------------------------------------------------- */

  mainCrew(): CrewMember[] {
    return this.crew.filter((c) => c.loc === 'main');
  }

  outriderCrew(): CrewMember[] {
    return this.crew.filter((c) => c.loc === 'outrider');
  }

  officers(): (CrewMember | null)[] {
    const out: (CrewMember | null)[] = new Array(OFFICER_SLOTS).fill(null);
    for (const c of this.crew) if (c.loc === 'main' && c.officer >= 0 && c.officer < OFFICER_SLOTS) out[c.officer] = c;
    return out;
  }

  crewCap(): number {
    return Math.min(MAX_BASE_CREW, this.player.stats.crewCap);
  }

  outriderCap(): number {
    return this.outriderLevel >= 3 ? 8 : this.outriderLevel >= 2 ? 6 : 5;
  }

  /** The Outrider unlocks once the fortress holds 15 crew. */
  outriderUnlocked(): boolean {
    return this.mainCrew().length >= MAX_BASE_CREW || this.outriderLevel > 0;
  }

  applyCrew(): void {
    const bonus = computeCrewBonus(this.crew);
    if (this.runeBuff?.rune === 'crimson') bonus.dmg += 0.25;
    if (this.runeBuff?.rune === 'gilded') {
      bonus.loot += 0.6;
      bonus.harvest += 0.6;
    }
    if (this.runeBuff?.rune === 'azure') bonus.cdr = Math.min(0.6, bonus.cdr + 0.35);
    this.player.applyBonuses(this.tech, bonus);
  }

  /** Space for one more crew member somewhere (fortress, then Outrider). */
  crewRoom(): 'main' | 'outrider' | null {
    if (this.mainCrew().length < this.crewCap()) return 'main';
    if (this.outriderLevel > 0 && this.outrider && this.outriderCrew().length < this.outriderCap()) return 'outrider';
    return null;
  }

  addCrew(c: CrewMember): boolean {
    const room = this.crewRoom();
    if (!room) return false;
    c.loc = room;
    c.officer = -1;
    if (room === 'main') {
      const used = new Set(this.crew.filter((x) => x.loc === 'main' && x.officer >= 0).map((x) => x.officer));
      for (let i = 0; i < OFFICER_SLOTS; i++) {
        if (!used.has(i)) {
          c.officer = i;
          break;
        }
      }
    }
    this.crew.push(c);
    this.applyCrew();
    return true;
  }

  crewXp(amount: number): void {
    for (const c of this.crew) {
      if (c.loc === 'away') continue;
      const mult = c.officer >= 0 ? 1.5 : 1;
      const ups = giveXp(c, amount * mult, () => this.rng.next());
      if (ups) {
        this.hooks.toast(`${c.name} reached level ${c.level}. Pick a perk in CREW (C).`, '#ffd740');
        this.hooks.sound('levelup');
      }
    }
  }

  rollRecruits(): void {
    const t = Math.max(1, threatAt(this.player.x, this.player.y));
    this.recruits = [0, 1, 2].map(() => makeRecruit(() => this.rng.next(), t));
  }

  /* ---------------------------------------------------------------- */
  /* Cargo helpers                                                     */
  /* ---------------------------------------------------------------- */

  canPay(cost: Cost): boolean {
    return canAfford([this.player.cargo], cost);
  }

  pay(cost: Cost): boolean {
    if (!this.canPay(cost)) return false;
    payCost([this.player.cargo], cost);
    return true;
  }

  /** Puts items in the fortress hold; returns what did not fit. */
  give(id: string, n: number, quiet = false): number {
    const left = this.player.cargo.add(id, n);
    if (!quiet && n - left > 0) this.float(this.player.x, this.player.y, `+${n - left} ${getItem(id).name}`, '#ffe082');
    if (left > 0 && !quiet) this.hooks.toast('Cargo hold is full! Build Cargo Holds or refine materials.', '#ff8a80');
    return left;
  }

  addWeapon(w: WeaponItem): void {
    this.armory.push(w);
  }

  /* ---------------------------------------------------------------- */
  /* Queries                                                           */
  /* ---------------------------------------------------------------- */

  enemyById(id: number): Enemy | undefined {
    for (const e of this.enemies) if (e.id === id) return e;
    return undefined;
  }

  tankById(id: number): Tank | undefined {
    if (this.player.id === id) return this.player;
    if (this.outrider?.id === id) return this.outrider;
    for (const t of this.tanks) if (t.id === id) return t;
    return undefined;
  }

  /** Something a player-side weapon can shoot. */
  hostileTarget(id: number): Target | null {
    const e = this.enemyById(id);
    if (e && e.hp > 0 && !e.burrowed) return { id: e.id, x: e.x, y: e.y, r: e.r, flying: e.flying };
    const t = this.tanks.find((k) => k.id === id);
    if (t && !t.dead) return { id: t.id, x: t.x, y: t.y, r: Math.min(t.stats.width, t.stats.length) / 2, flying: false };
    return null;
  }

  /** Something an enemy weapon can shoot. */
  friendlyTarget(id: number): Target | null {
    if (id === this.player.id && !this.player.dead) return { id, x: this.player.x, y: this.player.y, r: this.player.stats.width / 2, flying: false };
    if (this.outrider && id === this.outrider.id && !this.outrider.dead) return { id, x: this.outrider.x, y: this.outrider.y, r: this.outrider.stats.width / 2, flying: false };
    const a = this.allies.find((x) => x.id === id);
    if (a) return { id, x: a.x, y: a.y, r: 0.35, flying: false };
    return null;
  }

  /** All player-side things, for enemy targeting. */
  friendlies(): Target[] {
    const out: Target[] = [];
    if (!this.player.dead) out.push({ id: this.player.id, x: this.player.x, y: this.player.y, r: this.player.stats.width / 2, flying: false });
    if (this.outrider && !this.outrider.dead) out.push({ id: this.outrider.id, x: this.outrider.x, y: this.outrider.y, r: this.outrider.stats.width / 2, flying: false });
    for (const a of this.allies) out.push({ id: a.id, x: a.x, y: a.y, r: 0.35, flying: false });
    return out;
  }

  /** Distance from a point to the edge of a friendly target (tanks use their hull). */
  friendlyEdgeDist(id: number, x: number, y: number): number {
    const t = this.tankById(id);
    if (t) return t.edgeDist(x, y);
    const a = this.allies.find((k) => k.id === id);
    return a ? Math.max(0, Math.hypot(a.x - x, a.y - y) - 0.35) : Infinity;
  }

  isVisible(x: number, y: number): boolean {
    if (this.revealAll) return true;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= MAP_SIZE || ty >= MAP_SIZE) return false;
    return this.visible[ty * MAP_SIZE + tx] === 1;
  }

  threatHere(): number {
    return this.mode === 'raid' ? 4 : threatAt(this.player.x, this.player.y);
  }

  /* ---------------------------------------------------------------- */
  /* Effects                                                           */
  /* ---------------------------------------------------------------- */

  float(x: number, y: number, text: string, color: string, big = false): void {
    if (this.floats.length > 80) this.floats.shift();
    this.floats.push({ x: x + (Math.random() - 0.5) * 0.6, y, z: 1.5, text, color, t: 0, big });
  }

  /* ---------------------------------------------------------------- */
  /* Drops                                                             */
  /* ---------------------------------------------------------------- */

  dropStacks(x: number, y: number, stacks: Stack[]): void {
    for (const s of stacks) this.dropPickup(x, y, { kind: 'stack', stack: s });
  }

  dropPickup(x: number, y: number, p: Partial<Pickup> & Pick<Pickup, 'kind'>): Pickup {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 2.5;
    const pk: Pickup = {
      id: eid(), x, y, life: 240, delay: 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0.5, vz: 5 + Math.random() * 2, ...p,
    };
    this.pickups.push(pk);
    return pk;
  }

  dropLoot(x: number, y: number, table: string, rolls: number): void {
    const f = rolls * this.player.stats.loot;
    const n = Math.max(1, Math.floor(f) + (Math.random() < f % 1 ? 1 : 0));
    this.dropStacks(x, y, rollLoot(table, () => this.rng.next(), n));
  }

  /* ---------------------------------------------------------------- */
  /* Enemies                                                           */
  /* ---------------------------------------------------------------- */

  spawnEnemy(kind: string, x: number, y: number, threat: number, elite = false): Enemy {
    const d = ENEMIES[kind];
    const hpScale = (0.6 + 0.4 * threat) * (elite ? 2.2 : 1);
    const dmgScale = (0.8 + 0.2 * threat) * (elite ? 1.35 : 1);
    const e: Enemy = {
      id: eid(), kind: d.kind, x, y, vx: 0, vy: 0, face: 1, hp: d.hp * hpScale, maxHp: d.hp * hpScale, r: d.r * (elite ? 1.2 : 1),
      speed: d.speed * (elite ? 1.1 : 1), dmg: d.dmg * dmgScale, range: d.range, atkCd: 1 + Math.random(), atkRate: d.rate, threat, elite,
      flying: !!d.flying, state: 'idle', stateT: 0, targetId: 0, homeX: x, homeY: y, leash: 0, camp: 0, stun: 0, slow: 0, burn: 0, burnDps: 0,
      hitFlash: 0, anim: Math.random() * 10, burrowed: false, lastHitBy: 0, aggro: false, parts: [], loot: d.loot, xp: d.xp * (elite ? 2 : 1),
      titan: kind.startsWith('titan'), name: d.name, z: d.flying ? 1.6 : 0,
    };
    this.enemies.push(e);
    return e;
  }

  /* ---------------------------------------------------------------- */
  /* Orders                                                            */
  /* ---------------------------------------------------------------- */

  resetOrders(): void {
    this.player.path = [];
    this.player.goal = null;
    this.player.focusId = 0;
    this.harvestId = 0;
    this.interact = null;
  }

  stop(): void {
    this.resetOrders();
  }

  newWorldTimeUpdate(dt: number): void {
    this.time += dt;
    this.stats.time += dt;
  }

  playerDistToCenter(): number {
    return Math.hypot(this.player.x - CENTER, this.player.y - CENTER);
  }
}
