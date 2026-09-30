import { newCompound, type CompoundState } from './systems/compound';
import { newComms, type Comms } from './systems/comms';
import { newTelemetry, type Telemetry } from './telemetry';
import { CHUNK, MAX_BASE_CREW } from '../shared/constants';
import { Fog } from '../shared/fog';
import { canAfford, payCost, type Cost, type Stack } from '../shared/inventory';
import { getItem } from '../shared/items';
import { rollLoot } from '../shared/loot';
import type { GameMap } from '../shared/map';
import { generateWorld, threatAt, type Prop, type RuneKind, type WorldGen } from '../shared/mapgen';
import { RNG } from '../shared/rng';
import type { WeaponItem } from '../shared/weapons';
import type { DriveKey } from '../shared/types';
import { BASE_MAX_ENERGY, CARDS, deckSlots, ENERGY_REGEN, HAND_SIZE, levelPower, MAX_CARD_LEVEL, STARTER_DECK, type OwnedCard, type PackKind } from './cards';
import { computeCrewBonus, giveXp, makeRecruit, signatureCard, type CrewMember } from './crew';
import { eid, type Ally, type ChestKind, type Enemy, type FloatText, type Pickup, type Projectile, type Reward, type Telegraph, type Zone } from './entities';
import { ENEMIES } from './enemyDefs';
import { MODULES } from './defs';
import { EnemyGrid } from './systems/grid';
import { builderCount, levelBonus, levelRoad, MAX_COMMANDER_LEVEL, relicSlots, techsForLevel, xpToNext, type LevelReward } from './progress';
import type { SquadState, SquadType } from './squads';
import { crewFx, emptyCrewFx, type CrewFx } from './tech';
import type { HullClass } from './classes';
import { newCampaign, type Campaign } from './campaign';
import { autoAssign, noStationMods } from './stations';
import { newCrewLife, type CrewLife } from './systems/crewlife';
import { newStorm, type Storm } from './systems/weather';
import { newDeploy, type Deploy } from './systems/camp';
import { newTitanState, type TitanState } from './systems/titan';
import type { DriveMode } from './systems/engine';
import { COLOSSUS_TIMING, type Colossus } from './systems/colossus';
import type { RepairTeam } from './systems/crewops';
import type { WorkOrder } from './systems/workorders';
import { Tank } from './tank';
import { armFixed, buildStarterTank, newWeapon, starterCrew } from './templates';
import type { Flight } from './systems/airlift';

export type FxEvent =
  | { t: 'boom'; x: number; y: number; r: number; color: string; big?: boolean }
  | { t: 'muzzle'; x: number; y: number; a: number; color: string; size: number; z?: number }
  | { t: 'spark'; x: number; y: number; color: string; n: number }
  | { t: 'beam'; x0: number; y0: number; x1: number; y1: number; color: string; w: number; life: number }
  | { t: 'bolt'; pts: { x: number; y: number }[]; color: string }
  | { t: 'ring'; x: number; y: number; r: number; color: string }
  | { t: 'dust'; x: number; y: number; color: string }
  | { t: 'heal'; x: number; y: number }
  | { t: 'shake'; amt: number }
  | { t: 'nuke'; x: number; y: number; r: number }
  | { t: 'wave'; x: number; y: number; a: number; r: number; spread: number; color: string }
  | { t: 'strike'; x: number; y: number; color: string }
  | { t: 'teleport'; x: number; y: number }
  | { t: 'debris'; x: number; y: number; h: number; color: string; n: number; fx: number; fy: number; push: number };

/** A builder putting up a new building or upgrading one (Clash-of-Clans style, runs in real time). */
export interface BuildJob {
  modId: number;
  /** 'build': new building under construction. 'upgrade': going to level `to`. */
  kind: 'build' | 'upgrade';
  to: number;
  t: number;
  total: number;
  cost: Record<string, number>;
  /** A work order's crew is doing it (it doesn't take up one of your builders). */
  order?: number;
}

/** What the objective tracker is following. */
export type Track =
  | { kind: 'build'; key: string }
  | { kind: 'upgrade'; modId: number }
  | { kind: 'card'; id: string }
  | { kind: 'part'; key: string };

export interface ForgeJob {
  uid: number;
  to: number;
  t: number;
  total: number;
  cost?: Record<string, number>;
}

export interface GameHooks {
  toast(text: string, color?: string): void;
  sound(name: string, x?: number, y?: number, vol?: number): void;
  chest(kind: ChestKind, rewards: Reward[], choice: boolean): void;
  levelUp(reward: LevelReward): void;
  died(): void;
  enterDeadZone(): void;
  victory?(): void;
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
  hordes?: number;
  colossi?: number;
  rivals?: number;
  /** Troops killed. */
  lost?: number;
  bosses?: number;
  /** Game time the Mothership woke for good. */
  victory?: number;
}

export type OutriderOrder = { mode: 'follow' } | { mode: 'hold'; x: number; y: number } | { mode: 'expedition'; kind: 'node' | 'site'; id: number; phase: 'going' | 'working' | 'returning'; t: number };

export interface Target {
  id: number;
  x: number;
  y: number;
  r: number;
  flying: boolean;
  /** A colossus's weak point: a target so big your guns engage it from further off (and their shots carry). */
  big?: boolean;
}

/** How many crawler track marks stay on the ground (each a 4 m stretch of one crawler bank). */
export const TRACK_MARKS = 5000;

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
  /** Colossi out there (bigger than your Titan), and seconds until the next one comes. */
  colossi: Colossus[] = [];
  colossusT = COLOSSUS_TIMING.FIRST;
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
  /** Unlocks earned on the Level Road (weapon families, crew upgrades, drives...). */
  tech: Set<string>;
  /** What's in sight and what's been explored (streamed with the world). */
  fog: Fog;
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
  /** World point under the mouse (steers the Orbital Laser). */
  aim = { x: 0, y: 0 };
  respawnIn = 0;
  deadZoneMode = false;
  timers = { spawn: 2, raider: 50, titan: 200, crew: 0, vision: 0, hazard: 0, food: 0, recruit: 0, save: 30, train: 0, nav: 0, drive: 0, rival: 150, troop: 0, evict: 6, siege: 0, pylon: 0, finale: 0 };
  hazardWarn: string | null = null;
  hooks: GameHooks = { toast: () => {}, sound: () => {}, chest: () => {}, levelUp: () => {}, died: () => {}, enterDeadZone: () => {} };
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
  forgeJob: ForgeJob | null = null;
  /** Seconds of Time Stop left. */
  timeStop = 0;
  /** Orbital laser being steered by the cursor. */
  orbital: { x: number; y: number; t: number; dps: number } | null = null;
  /** Cataclysm storm around the fortress. */
  storm: { t: number; P: number; cd: number } | null = null;
  /** Level Road crew upgrades. */
  crewFx: CrewFx = emptyCrewFx();
  /** WASD drive input (screen-relative unit vector, or tank-style throttle/turn). */
  driveInput = { x: 0, y: 0, active: false };
  /**
   * The helm: a throttle lever that stays where you set it (-0.5 full astern .. 1 full ahead), the overdrive switch,
   * the brake handle (0-1; with the lever off and no brake she coasts a long way), and whether the lever is resting on the 0% detent (you have to let go and press again to go past it). The
   * captain's cabin adds switches: floodlights, the bilge pump boost, the master arm (guns safe), power diverted from
   * the shield generator to the drive, and cooldowns on the horn and the halon fire suppression. Then the drive mode
   * (eco, normal, sport, crawl), the overdrive stage (I-III), the engine preheater, the sanders (seconds of sand
   * left, and their recharge), the diff lock, the dozer plough, the smoke dischargers, and the refinery's AUTO switch;
   * the bridge's armour shutters, the roof searchlight, the deck floods and the amber beacons.
   */
  helm = {
    lever: 0, brake: 0, brakeSet: false, toroids: [true, true, true, true], overdrive: false, detent: false, lights: false, pumps: false, safe: false, divert: false, hornCd: 0, halonCd: 0, heat: 0, overheat: false,
    mode: 'normal' as DriveMode, odStage: 1, preheat: false, sandT: 0, sandCd: 0, diffLock: false, plow: false, smokeT: 0, smokeCd: 0, refine: true, roarT: 0,
    shutters: false, search: false, deckLights: false, beacons: false,
  };
  /** Damage control sends repair teams on its own (the vitals screen's AUTO switch), and its next check. */
  autoRepair = true;
  autoT = 0;
  /** Hull the repair crews can still put back right now (see HEAL_CAP). */
  healRoom = 0;
  /** Cruise time-warp (1, 4 or 8): the Crater is 140 km across. Drops to 1 when anything hostile comes near. */
  warp = 1;
  /** People held in reserve in the Barracks (they step in for casualties and make up repair teams and work crews). */
  reserves = 0;
  /** Repair teams out on jobs. */
  teams: RepairTeam[] = [];
  /** Work orders being carried out. */
  orders: WorkOrder[] = [];
  /** The Mega Hangar's airlift: whether you've raised it on the radio (and the call in progress), and the airships out. */
  airlift = { contact: false, calling: 0 };
  flights: Flight[] = [];
  /** What the officers on the stations add up to, whether shifts change on their own, and the officers' meal tab. */
  statMods = noStationMods();
  autoRotate = true;
  stationT = 0;
  officerMeals = 0;
  /** Tank-style controls: W/S throttle, A/D turn. Off = screen-relative. */
  tankControls = true;
  /**
   * Horde waves (World War Z style): calm, a warning with the direction, then a surge that pours in from there.
   * `n` is the wave number (it only goes up), `total`/`spawned` count this wave's horde.
   */
  wave = { n: 0, phase: 'calm' as 'calm' | 'warning' | 'surge', t: 100, dir: 0, total: 0, spawned: 0, batchT: 0, zone: 5 as number, rate: 0, dur: 0, elapsed: 0, bossDone: false };
  /** Neighbour lookups for the crowd (rebuilt each step). */
  grid = new EnemyGrid();
  private enemyIndex = new Map<number, Enemy>();
  private titans: Enemy[] = [];
  /** Targets for the player's guns, built once per step. */
  targetCache: { at: number; list: Target[] } = { at: -1, list: [] };
  /** The goal: strongholds, Mothership parts and the last stand. */
  campaign: Campaign = newCampaign();
  /** The Mega Hangar's compound: its gate, towers, people and visiting bases. */
  compound: CompoundState = newCompound();
  /** The intercom to the Mega Hangar (news, objectives, briefings). */
  comms: Comms = newComms();
  /** The flight recorder (cabin trend screens). */
  telemetry: Telemetry = newTelemetry();
  /** Life aboard: fatigue, hunger. */
  life: CrewLife = newCrewLife();
  /** The Titan Crawler's armour zones, crawlers, subsystems, fires, flooding and supplies. */
  titan: TitanState = newTitanState();
  /** The weather (storms). */
  weather: Storm = newStorm();
  /** Setting up camp. */
  deploy: Deploy = newDeploy();
  /** Drive trains you own (swapping between them is free). */
  drivesOwned = new Set<DriveKey>(['wheels']);
  /** Pick the best owned drive train for the ground by itself. */
  autoDrive = true;
  /** Seconds before AUTO may swap again. */
  driveSwapT = 0;

  /* ---------------- Commander (XP and the Level Road) ---------------- */
  commander = { level: 1, xp: 0 };

  /* ---------------- Battle cards ---------------- */
  /** Your collection: card id -> level and spare duplicates. */
  cards: Record<string, OwnedCard> = {};
  /** The 8 cards you fight with. */
  deck: string[] = [...STARTER_DECK];
  /** Slotted relics (permanent cards). */
  relics: string[] = [];
  /** The 4 cards you can play right now, and the rest of the cycle. */
  hand: string[] = [];
  queue: string[] = [];
  energy = 5;
  /** Unopened card packs. */
  packs: PackKind[] = [];
  /** Seconds until Phoenix Feather can save you again. */
  phoenixCd = 0;

  /* ---------------- Base (village) ---------------- */
  builds: BuildJob[] = [];
  /** Squad orders, per squad building type. Units live in `allies`. */
  squads: Partial<Record<SquadType, SquadState>> = {};
  /** The upgrade the objective tracker follows. */
  tracked: Track | null = null;
  /** Terrain chunks the fortress flattened something in (renderer rebuilds them). */
  dirtyChunks = new Set<number>();
  /** Chunks changed by crushing, newest last (a rolling log), and how many there have been in all. */
  edits: number[] = [];
  editCount = 0;
  navDirty = false;
  /** Building sections coming down after the fortress broke through them (tile, when, height). */
  collapses: { tx: number; ty: number; t: number; fx: number; fy: number }[] = [];
  /** Crawler track marks pressed into the ground: a ring buffer of (x, y, heading), newest at `head - 1`. */
  trackMarks = { buf: new Float32Array(TRACK_MARKS * 3), n: 0, head: 0, ver: 0 };

  constructor(seed: number, gen?: WorldGen, klass: HullClass = 'juggernaut', crew?: CrewMember[]) {
    this.gen = gen ?? generateWorld(seed);
    this.map = this.gen.map;
    this.rng = new RNG(seed ^ 0x9e3779b9);
    this.player = buildStarterTank(this.gen.spawn.x, this.gen.spawn.y, klass);
    this.player.rot = this.gen.spawnRot ?? this.player.rot;
    for (const m of this.player.modules) m.aim = this.player.rot;
    this.gen.focus(this.player.x, this.player.y);
    // Your main crew, picked in the Mega Hangar (or the default four).
    this.crew = crew?.length ? crew : starterCrew();
    this.tech = new Set(techsForLevel(1));
    for (const id of STARTER_DECK) this.cards[id] = { level: 1, shards: 0 };
    // Everyone you signed on brings their card.
    for (const c of this.crew) if (CARDS[signatureCard(c)] && !this.cards[signatureCard(c)]) this.cards[signatureCard(c)] = { level: 1, shards: 0 };
    this.fog = new Fog(this.map.size);
    this.applyCrew();
    this.player.hp = this.player.stats.maxHp;
    this.rollRecruits();
    this.resetHand();
    autoAssign(this);
  }

  get seed(): number {
    return this.gen.seed;
  }

  /* ---------------------------------------------------------------- */
  /* Commander XP                                                      */
  /* ---------------------------------------------------------------- */

  /** Kills, outposts, loot areas and runes give XP to the commander and the crew. */
  gainXp(amount: number, crewShare = 1): void {
    if (amount <= 0 || this.mode !== 'world') {
      if (amount > 0 && crewShare > 0) this.crewXp(amount * crewShare);
      return;
    }
    const scholar = this.player.buff('scholar');
    const mult = 1 + this.player.crew.cmdXp + (scholar ? scholar.v : 0);
    const c = this.commander;
    if (c.level < MAX_COMMANDER_LEVEL) {
      c.xp += amount * mult;
      while (c.level < MAX_COMMANDER_LEVEL && c.xp >= xpToNext(c.level)) {
        c.xp -= xpToNext(c.level);
        c.level++;
        this.onLevelUp(c.level);
      }
      if (c.level >= MAX_COMMANDER_LEVEL) c.xp = 0;
    }
    if (crewShare > 0) this.crewXp(amount * crewShare);
  }

  private onLevelUp(level: number): void {
    const reward = levelRoad()[level - 1];
    for (const id of techsForLevel(level)) this.tech.add(id);
    this.packs.push(reward.pack);
    // Level ups don't repair the fortress: the hull keeps its damage (as a share of the new maximum).
    const frac = this.player.hp / Math.max(1, this.player.stats.maxHp);
    this.applyCrew();
    this.player.hp = Math.max(1, this.player.stats.maxHp * frac);
    this.hooks.sound('levelup');
    this.hooks.levelUp(reward);
  }

  /** Progress to the next commander level, 0-1. */
  xpFrac(): number {
    const c = this.commander;
    return c.level >= MAX_COMMANDER_LEVEL ? 1 : c.xp / xpToNext(c.level);
  }

  builders(): number {
    return builderCount(this.commander.level);
  }

  freeBuilders(): number {
    return this.builders() - this.builds.filter((b) => !b.order).length;
  }

  relicSlots(): number {
    return relicSlots(this.commander.level);
  }

  /* ---------------------------------------------------------------- */
  /* Cards                                                             */
  /* ---------------------------------------------------------------- */

  /** How many cards your deck holds right now (it grows as you play). */
  deckSize(): number {
    return deckSlots(this.commander.level, this.stats.hordes ?? 0);
  }

  cardLevel(id: string): number {
    return this.cards[id]?.level ?? 0;
  }

  /** How strong a card is when you play it. */
  cardPower(id: string): number {
    return levelPower(this.cardLevel(id) || 1) * (1 + this.player.crew.cardPower + this.player.stats.cards);
  }

  cardCost(id: string): number {
    const d = CARDS[id];
    if (!d || d.type === 'relic') return 0;
    return Math.max(1, d.cost - this.player.crew.discount);
  }

  maxEnergy(): number {
    return BASE_MAX_ENERGY + this.player.crew.maxEnergy;
  }

  /** Energy per second. */
  energyRate(): number {
    const azure = this.runeBuff?.rune === 'azure' ? 0.35 : 0;
    return ENERGY_REGEN * (1 + this.player.crew.energy + this.player.stats.cards * 2 + azure);
  }

  /** Adds a card to the collection: new cards arrive at level 1, duplicates become shards. */
  ownCard(id: string, n = 1): 'new' | 'dupe' {
    const c = this.cards[id];
    if (!c) {
      this.cards[id] = { level: 1, shards: Math.max(0, n - 1) };
      // Fill an empty deck slot automatically so new players see their new card right away.
      if (CARDS[id].type !== 'relic' && this.deck.length < this.deckSize()) {
        this.deck.push(id);
        this.queue.push(id);
      }
      if (CARDS[id].type === 'relic' && this.relics.length < this.relicSlots()) {
        this.relics.push(id);
        this.applyCrew();
      }
      return 'new';
    }
    if (c.level < MAX_CARD_LEVEL) c.shards += n;
    return 'dupe';
  }

  /** Shuffles the deck into a fresh cycle and draws a hand. */
  resetHand(): void {
    const deck = this.deck.filter((id) => CARDS[id] && CARDS[id].type !== 'relic' && this.cards[id]);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    this.hand = deck.slice(0, HAND_SIZE);
    this.queue = deck.slice(HAND_SIZE);
  }

  /** The card in hand slot `slot` was played: it goes to the back of the cycle and the next card comes in. */
  cycleCard(slot: number): void {
    const id = this.hand[slot];
    if (!id) return;
    this.queue.push(id);
    const next = this.queue.shift();
    this.hand[slot] = next ?? id;
    if (!next) this.queue.pop();
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

  /** Perk choices per level-up (3, or 4 with Legendary Leadership). */
  draftChoices(): number {
    return 3 + this.crewFx.draft;
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

  /**
   * Puts the hull's built-in weapon mounts where the Command Center says. Anything that no longer fits goes back to
   * you: weapons to the armory, half the build cost to the hold.
   */
  syncHull(arm = true): number {
    const empty = (): number => this.player.modules.filter((m) => MODULES[m.key].fixed && !m.weapon).length;
    const before = this.player.modules.filter((m) => MODULES[m.key].fixed).length;
    const evicted = this.player.ensureFixed();
    const added = this.player.modules.filter((m) => MODULES[m.key].fixed).length - before;
    // New mounts come armed: autocannons on pads, the 88mm on a battery.
    if (arm && added > 0 && empty() > 0) armFixed(this.player, (k) => newWeapon(k));
    for (const m of evicted) {
      if (m.weapon) this.armory.push(m.weapon);
      const d = MODULES[m.key];
      for (const [k, n] of Object.entries(d.cost)) this.give(k, Math.ceil(n / 2), true);
    }
    if (evicted.length) this.hooks.toast(`${evicted.length} building${evicted.length > 1 ? 's' : ''} didn't fit and went back to the hold.`, '#ffab40');
    this.applyCrew();
    return added;
  }

  applyCrew(): void {
    this.crewFx = crewFx(this.tech);
    const bonus = computeCrewBonus(this.crew);
    const fx = this.crewFx;
    const lb = levelBonus(this.commander.level);
    bonus.dmg += fx.dmg + lb.dmg;
    bonus.rate += fx.rate;
    bonus.crit += fx.crit;
    bonus.range += fx.range;
    bonus.recovery += fx.recovery;
    bonus.regen += fx.regen;
    bonus.hp += fx.hp + lb.hp;
    bonus.armor += fx.armor;
    bonus.shield += fx.shield;
    bonus.power += fx.power;
    bonus.cargo += fx.cargo;
    bonus.energy += fx.energy;
    bonus.cardPower += fx.cardPower;
    bonus.cmdXp += fx.cmdXp;
    bonus.xp += fx.xp;
    for (const id of this.relics) {
      const r = CARDS[id]?.relic;
      if (!r) continue;
      const v = r.value * levelPower(this.cardLevel(id) || 1);
      switch (r.stat) {
        case 'energy': bonus.energy += v; break;
        case 'lifesteal': bonus.lifesteal += v; break;
        case 'loot': bonus.loot += v; break;
        case 'chestLuck': bonus.chestLuck += v; break;
        case 'titanDmg': bonus.titanDmg += v; break;
        case 'cmdXp': bonus.cmdXp += v; break;
        case 'armor': bonus.armor += v; break;
        case 'maxEnergy': bonus.maxEnergy += Math.round(v); break;
        case 'phoenix': bonus.phoenix = Math.max(bonus.phoenix, Math.min(0.6, v)); break;
        case 'discount': bonus.discount += 1; break;
        case 'eliteDmg': bonus.eliteDmg += v; break;
        case 'harvest': bonus.harvest += v; break;
      }
    }
    const blitz = this.player.buff('blitz');
    if (blitz) {
      bonus.dmg += blitz.v;
      bonus.rate += blitz.v;
    }
    if (this.runeBuff?.rune === 'crimson') bonus.dmg += 0.25;
    if (this.runeBuff?.rune === 'gilded') {
      bonus.loot += 0.6;
      bonus.harvest += 0.6;
    }
    bonus.energy = Math.min(1.2, bonus.energy);
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
    this.crew.push(c);
    this.applyCrew();
    return true;
  }

  crewXp(amount: number): void {
    const bonus = 1 + this.player.crew.xp;
    const ups: string[] = [];
    for (const c of this.crew) {
      if (c.loc === 'away') continue;
      if (giveXp(c, amount * bonus, () => this.rng.next(), this.draftChoices())) ups.push(`${c.name} (L${c.level})`);
    }
    if (!ups.length) return;
    // Big fights level people up in bursts: one toast every few seconds is plenty.
    if (this.time - this.lastLevelToast < 6) return;
    this.lastLevelToast = this.time;
    const who = ups.length > 3 ? `${ups.slice(0, 3).join(', ')} and ${ups.length - 3} more` : ups.join(', ');
    this.hooks.toast(`Crew level up: ${who}. Pick a perk card on the left.`, '#ffd740');
  }
  private lastLevelToast = -99;

  rollRecruits(): void {
    const t = Math.max(1, threatAt(this.player.x, this.player.y));
    this.recruits = [0, 1, 2].map(() => makeRecruit(() => this.rng.next(), t, this.crewFx.recruitLuck));
  }

  /* ---------------------------------------------------------------- */
  /* Crushing (the fortress flattens obstacles and props)              */
  /* ---------------------------------------------------------------- */

  markDirty(tx: number, ty: number): void {
    const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
    this.dirtyChunks.add(cy * 8192 + cx);
    // The cab's 3D view keeps its own copy of the ground: it reads this log of what changed.
    this.edits.push(cy * 8192 + cx);
    if (this.edits.length > 4096) this.edits.splice(0, 2048);
    this.editCount++;
    // Obstacles on a chunk border also change the neighbour's side faces.
    if (tx % CHUNK === 0 && cx > 0) this.dirtyChunks.add(cy * 8192 + cx - 1);
    if (tx % CHUNK === CHUNK - 1) this.dirtyChunks.add(cy * 8192 + cx + 1);
    if (ty % CHUNK === 0 && cy > 0) this.dirtyChunks.add((cy - 1) * 8192 + cx);
    if (ty % CHUNK === CHUNK - 1) this.dirtyChunks.add((cy + 1) * 8192 + cx);
  }

  /** Props in a chunk (they're generated with the chunk). */
  propsInChunk(cx: number, cy: number): Prop[] {
    return this.map.peek(cx, cy)?.props ?? [];
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
    const e = this.enemyIndex.get(id);
    if (e && e.hp > 0) return e;
    for (const k of this.enemies) if (k.id === id) return k;
    return undefined;
  }

  /** Rebuilds the enemy lookups (once per step, before the crowd moves). */
  indexEnemies(): void {
    this.enemyIndex.clear();
    this.titans.length = 0;
    for (const e of this.enemies) {
      this.enemyIndex.set(e.id, e);
      if (e.titan) this.titans.push(e);
    }
    this.grid.build(this.enemies);
  }

  /** Enemies that might be within `r` of (x, y): the crowd grid plus titans (whose parts reach far). */
  enemiesNear(x: number, y: number, r: number): Enemy[] {
    // A fresh list: a hit can kill, and a kill can set off another blast that asks again.
    const out = this.grid.near(x, y, r, []);
    for (const t of this.titans) if (!out.includes(t)) out.push(t);
    // Enemies spawned since the grid was built this step.
    for (let i = this.enemies.length - 1; i >= 0 && i >= this.enemies.length - 8; i--) {
      const e = this.enemies[i];
      if (!out.includes(e) && Math.abs(e.x - x) < r + 2 && Math.abs(e.y - y) < r + 2) out.push(e);
    }
    return out;
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
    if (e && e.hp > 0 && !e.burrowed) return e.colossus ? { id: e.id, x: e.x, y: e.y, r: e.r + 55, flying: false, big: true } : { id: e.id, x: e.x, y: e.y, r: e.r, flying: e.flying };
    const t = this.tanks.find((k) => k.id === id);
    if (t && !t.dead) return { id: t.id, x: t.x, y: t.y, r: Math.min(t.stats.width, t.stats.length) / 2, flying: false };
    return null;
  }

  /** Something an enemy weapon can shoot. */
  friendlyTarget(id: number): Target | null {
    if (id === this.player.id && !this.player.dead) return { id, x: this.player.x, y: this.player.y, r: this.player.stats.width / 2, flying: false };
    if (this.outrider && id === this.outrider.id && !this.outrider.dead) return { id, x: this.outrider.x, y: this.outrider.y, r: this.outrider.stats.width / 2, flying: false };
    const a = this.allies.find((x) => x.id === id);
    if (a && a.kind !== 'jet' && a.kind !== 'dragon' && a.kind !== 'mine') return { id, x: a.x, y: a.y, r: a.kind === 'mech' ? 1.2 : a.kind === 'minitank' ? 0.9 : 0.35, flying: a.kind === 'drone' };
    return null;
  }

  /** All player-side things, for enemy targeting. */
  friendlies(): Target[] {
    const out: Target[] = [];
    if (!this.player.dead) out.push({ id: this.player.id, x: this.player.x, y: this.player.y, r: this.player.stats.width / 2, flying: false });
    if (this.outrider && !this.outrider.dead) out.push({ id: this.outrider.id, x: this.outrider.x, y: this.outrider.y, r: this.outrider.stats.width / 2, flying: false });
    for (const a of this.allies) if (a.kind !== 'jet' && a.kind !== 'dragon' && a.kind !== 'mine') out.push({ id: a.id, x: a.x, y: a.y, r: a.kind === 'mech' ? 1.2 : a.kind === 'minitank' ? 0.9 : 0.35, flying: a.kind === 'drone' });
    return out;
  }

  /** Distance from a point to the edge of a friendly target (tanks use their hull). */
  friendlyEdgeDist(id: number, x: number, y: number): number {
    const t = this.tankById(id);
    if (t) return t.edgeDist(x, y);
    const a = this.allies.find((k) => k.id === id);
    return a ? Math.max(0, Math.hypot(a.x - x, a.y - y) - (a.kind === 'mech' ? 1.2 : a.kind === 'minitank' ? 0.9 : 0.35)) : Infinity;
  }

  isVisible(x: number, y: number): boolean {
    if (this.revealAll) return true;
    return this.fog.isVisible(x, y);
  }

  isExplored(x: number, y: number): boolean {
    return this.revealAll || this.mode !== 'world' || this.fog.isExplored(x, y);
  }

  get fogVersion(): number {
    return this.fog.version;
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
    const f = rolls * this.player.stats.loot * this.statMods.loot;
    const n = Math.max(1, Math.floor(f) + (Math.random() < f % 1 ? 1 : 0));
    this.dropStacks(x, y, rollLoot(table, () => this.rng.next(), n));
  }

  /* ---------------------------------------------------------------- */
  /* Enemies                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * The longer you survive, the stronger everything gets: +1.5% per minute played and +6% per horde repelled.
   * Enemy health takes it all; damage takes 60% of it.
   */
  escalation(): number {
    return 1 + (0.015 * this.stats.time) / 60 + 0.06 * (this.stats.hordes ?? 0);
  }

  spawnEnemy(kind: string, x: number, y: number, threat: number, elite = false): Enemy {
    const d = ENEMIES[kind];
    const esc = this.mode === 'world' ? this.escalation() : 1;
    const hpScale = (0.6 + 0.4 * threat) * (elite ? 2.2 : 1) * esc;
    const dmgScale = (0.8 + 0.2 * threat) * (elite ? 1.35 : 1) * (1 + (esc - 1) * 0.6);
    const e: Enemy = {
      id: eid(), kind: d.kind, x, y, vx: 0, vy: 0, face: 1, hp: d.hp * hpScale, maxHp: d.hp * hpScale, r: d.r * (elite ? 1.2 : 1),
      speed: d.speed * (elite ? 1.1 : 1), dmg: d.dmg * dmgScale, range: d.range, atkCd: 1 + Math.random(), atkRate: d.rate, threat, elite,
      flying: !!d.flying, state: 'idle', stateT: 0, targetId: 0, homeX: x, homeY: y, leash: 0, camp: 0, stun: 0, slow: 0, slowAmt: 0, burn: 0, burnDps: 0,
      hitFlash: 0, anim: Math.random() * 10, burrowed: false, lastHitBy: 0, aggro: false, parts: [], loot: d.loot, xp: d.xp * (elite ? 2 : 1),
      titan: kind.startsWith('titan') || !!d.titanStyle || !!d.boss, boss: !!d.boss, name: d.name, z: d.flying ? 1.6 : 0, horde: false, latch: null,
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

  /** How far the player is from the Mega Hangar (from the arena's middle in the Dead Zone). */
  playerDistHome(): number {
    const h = this.gen.hangar ?? this.gen.spawn;
    return Math.hypot(this.player.x - h.x, this.player.y - h.y);
  }
}
