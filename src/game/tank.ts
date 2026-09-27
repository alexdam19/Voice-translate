import { Inventory, type Slot } from '../shared/inventory';
import type { DriveKey, Hazard } from '../shared/types';
import { BASE_WEAPON_MODS, WEAPONS, weaponStats, type WeaponItem, type WeaponMods, type WeaponStats } from '../shared/weapons';
import { emptyBonus, type CrewBonus } from './crew';
import { classMods, type HullClass } from './classes';
import { chassisDef, crewNeed, DECK_OPEN_CC, defaultDeck, deckAllows, fixedSpots, LEGACY_DIMS, levelMult, MODULES, ROOF, STAFF, titanReserved, type Dept, type ModuleDef } from './defs';
import { hullMods, weaponMods, type HullMods } from './tech';

export type Team = 'player' | 'enemy';
export type TankKind = 'main' | 'outrider' | 'raider' | 'outpost' | 'remote' | 'rival';
export type FireMode = 'auto' | 'manual';

export const BASE_CARGO = 12;

/**
 * Guns on a 200 m Titan Crawler are ship's guns: they reach much further and their shells fly faster than the same
 * gun on a buggy. Outposts and raiders sit in between.
 */
export const WEAPON_SCALE: Record<TankKind, { range: number; speed: number; radius: number }> = {
  main: { range: 4, speed: 2.5, radius: 2 }, rival: { range: 4, speed: 2.5, radius: 2 }, remote: { range: 4, speed: 2.5, radius: 2 },
  outpost: { range: 2.5, speed: 1.8, radius: 1.5 }, raider: { range: 1.5, speed: 1.3, radius: 1.2 }, outrider: { range: 1.5, speed: 1.3, radius: 1.2 },
};

/**
 * Hull geometry in model units (the model is built at 0.5 units per deck cell, then scaled by cell / 0.5).
 * A fortress stands on its tracks with a hull base, then one story per deck up to the roof.
 */
export const HULL_BASE = 0.3;
export const STORY_H = 0.5;
/** A fortress-class hull (the Titan Crawler) has seven decks under its roof, Deck +3 down to Deck -3. */
export const TITAN_DECKS = 7;
/** Metres per deck cell on a fortress-class hull. */
export const TITAN_CELL = 5;
export const SMALL_DECK = 0.78;

export interface ModuleInst {
  id: number;
  key: string;
  cx: number;
  cy: number;
  /** Mounted weapon (hardpoints only). */
  weapon: WeaponItem | null;
  mode: FireMode;
  /** Turret angle in world space. */
  aim: number;
  cd: number;
  recoil: number;
  targetId: number;
  /** Cached final weapon stats (recalc). */
  stats: WeaponStats | null;
  /** Burst counter for volleys. */
  burst: number;
  /** Module level (1-3). */
  lvl: number;
  /** Shots fired (Overcharge counts every 4th). */
  shots: number;
  /** Ray Gun damage ramp (0-1) and the target it is locked on. */
  ramp: number;
  rampTarget: number;
  /** Twin-barrel cooldown. */
  cd2: number;
  /** False while builders are still putting it together. */
  built: boolean;
  /** Which deck it stands on (0 = the roof, 1.. = the stories below, top to bottom). */
  deck: number;
  /** Troops manning it right now (guns need 1-2, nests hold their soldiers). */
  crew: number;
}

export interface TankStats {
  maxHp: number;
  armor: number;
  shield: number;
  shieldRegen: number;
  power: number;
  use: number;
  powerRatio: number;
  thrust: number;
  mass: number;
  topSpeed: number;
  turnRate: number;
  cargo: number;
  crewCap: number;
  vision: number;
  drill: number;
  harvest: number;
  protects: Set<Hazard>;
  repair: number;
  vault: number;
  food: number;
  radar: number;
  refinery: boolean;
  workshop: boolean;
  garage: boolean;
  medbay: boolean;
  width: number;
  length: number;
  radius: number;
  crush: number;
  loot: number;
  /** Card Lab bonus (card power and energy regen). */
  cards: number;
  /** Forge level (0 = none). */
  forge: number;
  training: number;
  sanctum: number;
  depot: number;
  mess: boolean;
  /** Command Center level. */
  cc: number;
  /** Troop bunks (troops man the guns and the roof nests). */
  bunks: number;
  /** Troops the guns and nests want, and how many are manned. */
  crewWanted: number;
  crewManned: number;
  /** Per department: [on duty, needed]. */
  depts: Record<string, [number, number]>;
}

export interface Buff {
  t: number;
  v: number;
}

let nextTankId = 1;
export function newTankId(): number {
  return nextTankId++;
}

export class Tank {
  id = newTankId();
  team: Team;
  kind: TankKind;
  name: string;
  x = 0;
  y = 0;
  rot = 0;
  /** Forward speed (units/s). */
  speed = 0;
  /** Knockback / external push. */
  pushX = 0;
  pushY = 0;
  chassis: string;
  cols: number;
  rows: number;
  /** Stories below the roof (the Mothership can add more). */
  stories = TITAN_DECKS;
  /** Hull class and its Mothership mark (I-III). */
  klass: HullClass = 'juggernaut';
  classMk = 1;
  /** Troops aboard: they man the guns and the roof nests. Enemy hulls are always fully crewed. */
  troops = 0;
  drive: DriveKey = 'wheels';
  modules: ModuleInst[] = [];
  /** One layer of cols x rows cells per deck. */
  private grid: Int32Array;
  private nextModId = 1;
  hp = 1;
  shield = 0;
  shieldDelay = 0;
  stats!: TankStats;
  cargo: Inventory;
  /** Movement orders. */
  path: { x: number; y: number }[] = [];
  goal: { x: number; y: number } | null = null;
  /** Entity id this tank is ordered to attack (focus fire). */
  focusId = 0;
  buffs = new Map<string, Buff>();
  anchored = false;
  dead = false;
  /** Bumped whenever the layout changes (renderer rebuilds the model). */
  version = 0;
  hitFlash = 0;
  threat = 1;
  treadPhase = 0;
  /** Turn rate (rad/s), each side's crawler speed (m/s, left/right) and how far each side's tracks have run. */
  yawRate = 0;
  /** What the driver is asking for this frame (-0.5 reverse .. 1 full ahead). */
  throttle = 0;
  sideSpeed: [number, number] = [0, 0];
  sidePhase: [number, number] = [0, 0];
  /**
   * A Titan's eight crawlers (0-3 left, front to back; 4-7 right): how far each has ridden up on its suspension (m),
   * where it's heading, and bumps waiting to reach the crawlers behind.
   */
  susp = new Float32Array(8);
  suspT = new Float32Array(8);
  bumps: { c: number; at: number; h: number }[] = [];
  /** Metres driven since the last track mark. */
  markD = 0;
  /** What the Titan's damage, fuel and flooding do to it (set by the Titan systems; all 1 when intact). */
  titanMods = { power: 1, speed: 1, steering: 1, weapons: 1, sensors: 1, pull: 0 };
  lastHitAt = -99;
  /** Research and crew applied on recalc (player-side). */
  tech: Set<string> = new Set();
  crew: CrewBonus = emptyBonus();
  hull: HullMods = hullMods(new Set());
  /** Damage multiplier for enemy tanks (threat scaling). */
  dmgScale = 1;
  /** World units per deck cell: your fortress is a full facility (1 unit per cell); enemy rigs are smaller. */
  readonly cell: number;
  /** Rolls over rocks, ruins and wrecks instead of steering around them. */
  readonly crush: boolean;
  /** Seconds until a parked fortress checks for rubble under its hull again. */
  crushT = 0;
  /** Smoothed traction (0 = not sampled yet). */
  trac = 0;
  /** Turn-rate multiplier from the hull class. */
  handling = 1;
  /** Crew efficiency (1 = rested and fed; fatigue and hunger lower it). */
  efficiency = 1;
  /** How well the bridge is staffed (0-1). */
  commandFrac = 1;
  /** A storm drove everyone off the roof. */
  indoors = false;
  /** People the builders need right now (two per job), and how many are on it. */
  buildCrew = 0;
  builderStaff = 0;
  /** Ramming damage and Nitro multipliers, and roof soldiers' damage, from the hull class. */
  ram = 1;
  nitroMult = 1;
  soldierDmg = 1;

  constructor(team: Team, kind: TankKind, chassis: string, name = 'Fortress') {
    this.team = team;
    this.kind = kind;
    this.name = name;
    // One unit is one metre. The Titan Crawler is 200 m long; enemy rigs are the size of real tanks and forts.
    this.cell = kind === 'main' || kind === 'remote' || kind === 'rival' ? TITAN_CELL : kind === 'outrider' ? 1.2 : kind === 'raider' ? 1.4 : 3;
    this.crush = kind === 'main' || kind === 'rival';
    this.chassis = chassis;
    const c = chassisDef(chassis);
    this.cols = c.cols;
    this.rows = c.rows;
    if (kind !== 'main' && kind !== 'rival' && kind !== 'remote') this.stories = 1;
    this.grid = new Int32Array(this.cols * this.rows * (this.stories + 1)).fill(-1);
    this.cargo = new Inventory(BASE_CARGO);
    this.recalc();
    this.hp = this.stats.maxHp;
  }

  /* ---------------- layout ---------------- */

  /** Roof plus the stories below it. */
  get decks(): number {
    return this.stories + 1;
  }

  private gi(cx: number, cy: number, deck: number): number {
    return (deck * this.rows + cy) * this.cols + cx;
  }

  private stamp(m: ModuleInst): void {
    const d = MODULES[m.key];
    for (let y = m.cy; y < m.cy + d.h; y++) for (let x = m.cx; x < m.cx + d.w; x++) this.grid[this.gi(x, y, m.deck)] = m.id;
  }

  private unstamp(id: number): void {
    for (let k = 0; k < this.grid.length; k++) if (this.grid[k] === id) this.grid[k] = -1;
  }

  cellAt(cx: number, cy: number, deck = ROOF): number {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows || deck < 0 || deck > this.stories) return -2;
    return this.grid[this.gi(cx, cy, deck)];
  }

  moduleById(id: number): ModuleInst | undefined {
    return this.modules.find((m) => m.id === id);
  }

  moduleAtCell(cx: number, cy: number, deck = ROOF): ModuleInst | undefined {
    const id = this.cellAt(cx, cy, deck);
    return id >= 0 ? this.moduleById(id) : undefined;
  }

  canPlace(key: string, cx: number, cy: number, ignoreId = -1, deck = defaultDeck(MODULES[key] ?? MODULES.armor)): boolean {
    const d = MODULES[key];
    if (!d || !deckAllows(d, deck, this.stories) || !this.deckOpen(deck)) return false;
    if (cx < 0 || cy < 0 || cx + d.w > this.cols || cy + d.h > this.rows) return false;
    const titan = this.titan;
    for (let y = cy; y < cy + d.h; y++) {
      for (let x = cx; x < cx + d.w; x++) {
        const c = this.grid[this.gi(x, y, deck)];
        if (c !== -1 && c !== ignoreId) return false;
        if (titan && titanReserved(x, y, deck)) return false;
      }
    }
    if (d.unique && this.modules.some((m) => m.key === key && m.id !== ignoreId)) return false;
    return true;
  }

  private newInst(key: string, cx: number, cy: number, deck: number, weapon: WeaponItem | null): ModuleInst {
    const d = MODULES[key];
    return {
      id: this.nextModId++, key, cx, cy, weapon, mode: 'auto', aim: this.rot, cd: d.hardpoint ? Math.random() * 0.5 : 0, recoil: 0, targetId: 0, stats: null, burst: 0,
      lvl: 1, shots: 0, ramp: 0, rampTarget: 0, cd2: 0, built: true, deck, crew: 0,
    };
  }

  addModule(key: string, cx: number, cy: number, weapon: WeaponItem | null = null, deck = defaultDeck(MODULES[key] ?? MODULES.armor)): ModuleInst | null {
    if (!this.canPlace(key, cx, cy, -1, deck)) return null;
    const m = this.newInst(key, cx, cy, deck, weapon);
    this.modules.push(m);
    this.stamp(m);
    this.version++;
    this.recalc();
    return m;
  }

  removeModule(id: number): ModuleInst | null {
    const i = this.modules.findIndex((m) => m.id === id);
    if (i < 0) return null;
    const m = this.modules[i];
    if (MODULES[m.key].required || MODULES[m.key].fixed) return null;
    this.modules.splice(i, 1);
    this.unstamp(id);
    this.version++;
    this.recalc();
    return m;
  }

  moveModule(id: number, cx: number, cy: number, deck?: number): boolean {
    const m = this.moduleById(id);
    const to = deck ?? m?.deck ?? ROOF;
    if (!m || MODULES[m.key].fixed || !this.canPlace(m.key, cx, cy, id, to)) return false;
    this.unstamp(id);
    m.cx = cx;
    m.cy = cy;
    m.deck = to;
    this.stamp(m);
    this.version++;
    return true;
  }

  /** Decks a building may go on, its default first. */
  decksFor(key: string): number[] {
    const d = MODULES[key];
    if (!d) return [];
    const first = defaultDeck(d);
    const out = [first];
    for (let k = 0; k <= this.stories; k++) if (k !== first && deckAllows(d, k, this.stories)) out.push(k);
    return out;
  }

  /** First free spot for a module: on its default deck first, scanning from the front. */
  findSpot(key: string, onDeck?: number): [number, number, number] | null {
    for (const deck of onDeck === undefined ? this.decksFor(key) : [onDeck]) {
      for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) if (this.canPlace(key, cx, cy, -1, deck)) return [cx, cy, deck];
    }
    return null;
  }

  autoAdd(key: string, weapon: WeaponItem | null = null): ModuleInst | null {
    const s = this.findSpot(key);
    return s ? this.addModule(key, s[0], s[1], weapon, s[2]) : null;
  }

  /** Changes chassis, keeping the layout anchored at the top-left and centring it if the hull is wider. */
  setChassis(key: string): boolean {
    const c = chassisDef(key);
    if (this.modules.some((m) => m.cx + MODULES[m.key].w > c.cols || m.cy + MODULES[m.key].h > c.rows)) return false;
    const ox = Math.floor((c.cols - this.cols) / 2);
    const oy = Math.floor((c.rows - this.rows) / 2);
    this.chassis = key;
    this.cols = c.cols;
    this.rows = c.rows;
    this.grid = new Int32Array(this.cols * this.rows * this.decks).fill(-1);
    for (const m of this.modules) {
      const d = MODULES[m.key];
      if (ox >= 0 && oy >= 0 && m.cx + ox + d.w <= this.cols && m.cy + oy + d.h <= this.rows) {
        m.cx += ox;
        m.cy += oy;
      }
      this.stamp(m);
    }
    this.version++;
    const frac = this.hp / Math.max(1, this.stats.maxHp);
    this.recalc();
    this.hp = Math.max(1, this.stats.maxHp * frac);
    return true;
  }

  /** Adds (or removes) stories below the roof. New stories go at the bottom; buildings keep their decks. */
  setStories(n: number): boolean {
    n = Math.max(1, Math.min(TITAN_DECKS, Math.round(n)));
    if (n < this.stories && this.modules.some((m) => m.deck > n)) return false;
    this.stories = n;
    this.grid = new Int32Array(this.cols * this.rows * this.decks).fill(-1);
    for (const m of this.modules) this.stamp(m);
    this.version++;
    const frac = this.hp / Math.max(1, this.stats.maxHp);
    this.recalc();
    this.hp = Math.max(1, this.stats.maxHp * frac);
    return true;
  }

  /**
   * Puts the hull's built-in weapons (corner pads, side pads, main batteries) where the Command Center level says,
   * moving anything in the way to the nearest free spot. Returns buildings that no longer fit anywhere.
   */
  ensureFixed(): ModuleInst[] {
    const cc = this.modules.find((m) => MODULES[m.key].required)?.lvl ?? 1;
    const spots = fixedSpots(cc, this.cols, this.rows, this.klass === 'bastion');
    const have = { pad: this.modules.filter((m) => m.key === 'pad').sort((a, b) => a.id - b.id), main_gun: this.modules.filter((m) => m.key === 'main_gun').sort((a, b) => a.id - b.id) };
    const used = { pad: 0, main_gun: 0 };
    this.grid.fill(-1);
    const keep = new Set<ModuleInst>();
    for (const sp of spots) {
      let m = have[sp.key][used[sp.key]++];
      if (!m) {
        m = this.newInst(sp.key, sp.cx, sp.cy, ROOF, null);
        m.cd = Math.random() * 0.5;
        this.modules.push(m);
      }
      m.cx = sp.cx;
      m.cy = sp.cy;
      m.deck = ROOF;
      this.stamp(m);
      keep.add(m);
    }
    // Fixed weapons beyond this level's spots (shouldn't happen) are dropped with the rest below.
    const evicted: ModuleInst[] = [];
    const rest = this.modules.filter((m) => !keep.has(m));
    for (const m of rest) {
      if (MODULES[m.key].fixed) {
        evicted.push(m);
        continue;
      }
      if (this.canPlace(m.key, m.cx, m.cy, m.id, m.deck) || this.moveToFree(m)) this.stamp(m);
      else evicted.push(m);
    }
    if (evicted.length) this.modules = this.modules.filter((m) => !evicted.includes(m));
    this.version++;
    this.recalc();
    return evicted;
  }

  /** Moves a module (not yet on the grid) to the free spot nearest its current one, on any deck it may use. */
  private moveToFree(m: ModuleInst): boolean {
    const d = MODULES[m.key];
    let best: [number, number, number] | null = null;
    let bd = Infinity;
    for (const deck of this.decksFor(m.key)) {
      for (let cy = 0; cy + d.h <= this.rows; cy++) {
        for (let cx = 0; cx + d.w <= this.cols; cx++) {
          const dd = Math.abs(cx - m.cx) + Math.abs(cy - m.cy) + (deck === m.deck ? 0 : 1000);
          if (dd < bd && this.canPlace(m.key, cx, cy, m.id, deck)) {
            bd = dd;
            best = [cx, cy, deck];
          }
        }
      }
    }
    if (!best) return false;
    m.cx = best[0];
    m.cy = best[1];
    m.deck = best[2];
    return true;
  }

  hardpoints(): ModuleInst[] {
    return this.modules.filter((m) => MODULES[m.key].hardpoint);
  }

  weapons(): ModuleInst[] {
    return this.modules.filter((m) => m.weapon && MODULES[m.key].hardpoint);
  }

  /* ---------------- stats ---------------- */

  recalc(): void {
    const ch = chassisDef(this.chassis);
    const hull = this.hull;
    const crew = this.crew;
    let hp = ch.hp, armor = ch.armor, power = 0, use = 0, thrust = 0, mass = ch.mass, cargo = BASE_CARGO, crewCap = 0;
    let vision = 0, drill = 1, harvest = 1, repair = 0, vault = 0, food = 0, radar = 0, shield = 0, shieldRegen = 0;
    let refinery = false, workshop = false, garage = false, medbay = false, mess = false;
    let cards = 0, forge = 0, training = 0, sanctum = 0, depot = 0, bunks = 0;
    const protects = new Set<Hazard>();
    let cc = 1;
    const fortress = this.kind === 'main' || this.kind === 'rival' || this.kind === 'remote';
    const manning = this.man(this.kind === 'main' ? this.troops : Infinity);
    const cmdD = manning.depts.command;
    const cmdK = this.kind === 'main' && cmdD ? cmdD[0] / Math.max(1, cmdD[1]) : 1;
    const eff = this.kind === 'main' ? this.efficiency : 1;
    const cm = classMods(fortress ? this.klass : 'juggernaut', fortress ? this.classMk : 0);
    if (!fortress) Object.assign(cm, { hp: 1, armor: 0, speed: 1, turn: 1, range: 1, dmg: 1, mainDmg: 1, bunks: 1, soldierDmg: 1, cargo: 1, harvest: 1, repair: 0, ram: 1, nitro: 1 });
    // Every story past the second is more hull (and more weight).
    const extra = fortress ? Math.max(0, this.stories - 2) : 0;
    hp *= 1 + 0.22 * extra;
    mass *= 1 + 0.08 * extra;
    for (const m of this.modules) {
      const d: ModuleDef = MODULES[m.key];
      mass += d.w * d.h * 0.6 * this.cell * this.cell;
      if (d.required) cc = m.lvl;
      if (!m.built) continue;
      const f = levelMult(m.lvl);
      // Engines and reactors limp along on automation; everything else needs its people.
      const sf = this.staffFrac(m);
      const auto = 0.3 + 0.7 * sf;
      hp += (d.hp ?? 0) * f;
      armor += (d.armor ?? 0) * f;
      power += (d.power ?? 0) * f * auto;
      use += d.use ?? 0;
      thrust += (d.thrust ?? 0) * f * auto;
      cargo += Math.round((d.cargo ?? 0) * f);
      crewCap += d.crew ? d.crew + (m.lvl - 1) : 0;
      if (d.bunks) bunks += d.bunks * (1 + 0.5 * (m.lvl - 1));
      vision += (d.vision ?? 0) * f * (d.required ? 1 : sf);
      drill = Math.max(drill, sf > 0 || !STAFF[m.key] ? d.drill ?? 1 : 1);
      harvest *= 1 + ((d.harvest ?? 1) - 1) * f * sf;
      repair += (d.repair ?? 0) * f * sf;
      vault += d.vault ?? 0;
      food += (d.food ?? 0) * f * sf;
      radar = Math.max(radar, (d.radar ?? 0) * f * sf);
      shield += (d.shield ?? 0) * f * auto;
      shieldRegen += (d.shieldRegen ?? 0) * f * auto;
      refinery ||= !!d.refinery;
      workshop ||= !!d.workshop;
      garage ||= !!d.garage;
      medbay ||= !!d.medbay;
      mess ||= !!d.mess;
      cards += (d.cards ?? 0) * m.lvl * sf;
      if (d.forge && sf > 0) forge = Math.max(forge, m.lvl);
      training += (d.training ?? 0) * f * sf;
      if (d.sanctum) sanctum = Math.max(sanctum, m.lvl);
      depot += (d.depot ?? 0) * f;
      for (const h of d.protects ?? []) protects.add(h);
      if (m.weapon) {
        const wd = WEAPONS[m.weapon.key];
        mass += wd.size === 'heavy' ? 3 : wd.size === 'medium' ? 1.5 : 0.5;
      }
    }
    if (this.kind === 'main') mass = ch.mass + (mass - ch.mass) * 0.5;
    // Weapon stats (power use depends on them).
    for (const m of this.modules) {
      if (!m.weapon || !MODULES[m.key].hardpoint || !m.built) {
        m.stats = null;
        continue;
      }
      const fam = WEAPONS[m.weapon.key].family;
      const sc = WEAPON_SCALE[this.kind];
      const base: WeaponMods = this.team === 'player' ? weaponMods(this.tech, fam) : { ...BASE_WEAPON_MODS };
      const depotF = fam === 'ballistic' || fam === 'artillery' || fam === 'missile' ? Math.min(0.4, depot) : 0;
      const sanctumF = fam === 'arcane' && sanctum ? 0.1 * sanctum : 0;
      const mods: WeaponMods = {
        ...base,
        dmg: base.dmg * (1 + crew.dmg) * (1 + sanctumF) * (1 + 0.15 * (m.lvl - 1)) * this.dmgScale * cm.dmg * (m.key === 'main_gun' ? cm.mainDmg : 1),
        rate: base.rate * (1 + crew.rate) * (1 + depotF) * (0.55 + 0.45 * eff),
        range: base.range * (1 + crew.range) * cm.range * (0.88 + 0.12 * cmdK) * sc.range,
        speed: base.speed * sc.speed,
        radius: base.radius * sc.radius,
        crit: base.crit + crew.crit,
      };
      m.stats = weaponStats(m.weapon, mods);
      use += m.stats.power;
    }
    power *= (1 + crew.power) * this.titanMods.power;
    const powerRatio = use <= 0 ? 1 : Math.min(1, power / use);
    const width = this.cols * this.cell + (this.fortress ? 0 : this.cell * 2);
    // Fortress-class hulls carry a wedge nose and an afterburner tail past the deck.
    const dread = this.kind === 'main' || this.kind === 'rival' || this.kind === 'remote';
    const length = this.rows * this.cell + (dread ? 2 : 0.6) * this.cell;
    const ratio = Math.min(1.3, (thrust * 8) / mass);
    const topSpeed = this.anchored ? 0 : this.titanMods.speed * (this.fortress ? 5.2 + 1.8 * Math.min(1, ratio * 3) : 2.2 + 3.6 * ratio) * (0.45 + 0.55 * powerRatio) * hull.speed * (1 + crew.speed) * cm.speed;
    this.handling = cm.turn;
    this.ram = cm.ram;
    this.nitroMult = cm.nitro;
    this.soldierDmg = cm.soldierDmg;
    const bunkTotal = Math.round(bunks * cm.bunks);
    const turnRate = 1.9 * Math.sqrt(8 / ((this.rows + this.cols * 0.5) * this.cell / 0.5)) * (this.kind === 'main' ? 1.6 : 1);
    this.stats = {
      maxHp: Math.round(hp * hull.hp * (1 + crew.hp) * cm.hp),
      armor: Math.min(0.6, armor + hull.armor + crew.armor + cm.armor),
      shield: Math.round(shield * hull.shield * (1 + crew.shield)),
      shieldRegen: shieldRegen * hull.shieldRegen,
      power, use, powerRatio, thrust, mass, topSpeed, turnRate,
      cargo: Math.round((cargo + hull.cargo + crew.cargo) * cm.cargo),
      crewCap: Math.min(15, crewCap),
      vision: vision + crew.vision,
      drill, harvest: harvest * hull.harvest * (1 + crew.harvest) * cm.harvest,
      protects, repair: repair + crew.regen + cm.repair, vault, food, radar, refinery, workshop, garage, medbay,
      width, length, radius: width / 2, crush: hull.crush, loot: hull.loot * (1 + crew.loot),
      cards, forge, training, sanctum, depot, mess, cc,
      bunks: bunkTotal, crewWanted: manning.wanted, crewManned: manning.manned, depts: manning.depts,
    };
    // From 40 m up, a Titan's lookouts and sensors see five times as far.
    if (this.fortress) this.stats.vision = Math.max(120, this.stats.vision * 5) * (0.4 + 0.6 * this.titanMods.sensors);
    // A bridge without its officers fights half blind.
    if (this.kind === 'main') {
      this.stats.vision *= 0.6 + 0.4 * cmdK;
      this.commandFrac = cmdK;
    }
    if (this.cargo.size !== this.stats.cargo) this.cargo.resize(this.stats.cargo);
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.shield = Math.min(this.shield, this.stats.shield);
  }

  /**
   * Puts people on every station: gunners on the guns first (one each, two on the heavies), then soldiers in the
   * roof nests, then the engine room, command, medical, the galley, the works (and two builders per job), science and
   * the hangar. Stations without enough people run badly or not at all.
   */
  man(troops: number): { wanted: number; manned: number; depts: Record<string, [number, number]> } {
    const DEPT_ORDER: Dept[] = ['gunnery', 'roof', 'engine', 'command', 'medical', 'galley', 'works', 'science', 'hangar'];
    const gunOrder = (m: ModuleInst): number => (m.key === 'main_gun' ? 0 : m.key === 'hp_heavy' ? 1 : m.key === 'pad' ? 2 : 3);
    const posts: { m: ModuleInst | null; dept: Dept; need: number; o: number }[] = [];
    for (const m of this.modules) {
      m.crew = 0;
      if (!m.built) continue;
      const d = MODULES[m.key];
      if (m.weapon && d.hardpoint) posts.push({ m, dept: 'gunnery', need: crewNeed(WEAPONS[m.weapon.key]?.size ?? 'light'), o: gunOrder(m) });
      else if (d.nest) posts.push({ m, dept: 'roof', need: this.indoors ? 0 : d.soldiers ?? 2, o: 0 });
      else if (STAFF[m.key]) posts.push({ m, dept: STAFF[m.key][0], need: STAFF[m.key][1], o: 0 });
    }
    if (this.buildCrew > 0) posts.push({ m: null, dept: 'works', need: this.buildCrew, o: -1 });
    posts.sort((a, b) => DEPT_ORDER.indexOf(a.dept) - DEPT_ORDER.indexOf(b.dept) || a.o - b.o || (a.m?.id ?? 0) - (b.m?.id ?? 0));
    let left = troops, wanted = 0, manned = 0;
    const depts: Record<string, [number, number]> = {};
    this.builderStaff = 0;
    for (const p of posts) {
      const k = Math.max(0, Math.min(p.need, left));
      left -= k;
      wanted += p.need;
      manned += k;
      if (p.m) p.m.crew = k;
      else this.builderStaff = k;
      const d = (depts[p.dept] ??= [0, 0]);
      d[0] += k;
      d[1] += p.need;
    }
    return { wanted, manned, depts };
  }

  /** How well a building is staffed (1 = fully; buildings without staff needs always 1), times crew efficiency. */
  staffFrac(m: ModuleInst): number {
    if (this.kind !== 'main') return 1;
    const st = STAFF[m.key];
    if (!st) return 1;
    return Math.min(1, m.crew / st[1]) * this.efficiency;
  }

  /** Troops a gun or nest needs to be fully manned. */
  crewNeeded(m: ModuleInst): number {
    const d = MODULES[m.key];
    if (d.nest) return this.indoors ? 0 : d.soldiers ?? 2;
    if (STAFF[m.key]) return STAFF[m.key][1];
    return m.weapon && d.hardpoint ? crewNeed(WEAPONS[m.weapon.key]?.size ?? 'light') : 0;
  }

  /** Applies research + crew bonuses (player tanks). */
  applyBonuses(tech: Set<string>, crew: CrewBonus): void {
    this.tech = tech;
    this.crew = crew;
    this.hull = hullMods(tech);
    this.recalc();
  }

  /* ---------------- geometry ---------------- */

  /** A land-cruiser hull (yours, rivals, other players) with stories. */
  get fortress(): boolean {
    return this.kind === 'main' || this.kind === 'rival' || this.kind === 'remote';
  }

  /** A full Titan Crawler deck plan (with the Spine and lifts). */
  get titan(): boolean {
    return this.fortress && this.cols === 18 && this.rows === 38 && this.stories === TITAN_DECKS;
  }

  /** Command Center level (the Titan's mark). */
  get ccLevel(): number {
    return this.modules.find((m) => MODULES[m.key].required)?.lvl ?? 1;
  }

  /** Whether a deck is open for building yet (a Titan opens its decks as it's refitted). */
  deckOpen(deck: number): boolean {
    if (!this.titan || deck === ROOF) return true;
    return this.ccLevel >= (DECK_OPEN_CC[deck] ?? 1);
  }

  /** World height of a deck's floor (deck 0 = the roof top). */
  deckY(deck = 0): number {
    const k = this.cell / 0.5;
    if (!this.fortress) return SMALL_DECK * k;
    if (deck <= 0) return (HULL_BASE + this.stories * STORY_H) * k;
    return (HULL_BASE + (this.stories - deck) * STORY_H + 0.03) * k;
  }

  /** Local (forward, right) -> world. */
  toWorld(lx: number, lz: number): { x: number; y: number } {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return { x: this.x + c * lx - s * lz, y: this.y + s * lx + c * lz };
  }

  /** World -> local (forward, right). */
  toLocal(x: number, y: number): { lx: number; lz: number } {
    const dx = x - this.x, dy = y - this.y;
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return { lx: c * dx + s * dy, lz: -s * dx + c * dy };
  }

  moduleLocal(m: ModuleInst): { lx: number; lz: number } {
    const d = MODULES[m.key];
    return { lx: (this.rows / 2 - (m.cy + d.h / 2)) * this.cell, lz: (m.cx + d.w / 2 - this.cols / 2) * this.cell };
  }

  moduleWorld(m: ModuleInst): { x: number; y: number } {
    const l = this.moduleLocal(m);
    return this.toWorld(l.lx, l.lz);
  }

  /** Collision circles along the hull (world space). */
  circles(): { x: number; y: number; r: number }[] {
    const r = this.stats.width / 2;
    const half = Math.max(0, this.stats.length / 2 - r);
    const n = half <= 0.01 ? 1 : Math.ceil((half * 2) / r) + 1;
    const out: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < n; i++) {
      const lx = n === 1 ? 0 : -half + (2 * half * i) / (n - 1);
      const p = this.toWorld(lx, 0);
      out.push({ x: p.x, y: p.y, r });
    }
    return out;
  }

  /** Is a point (with radius pr) touching the hull rectangle? */
  hits(px: number, py: number, pr = 0): boolean {
    const l = this.toLocal(px, py);
    return Math.abs(l.lx) <= this.stats.length / 2 + pr && Math.abs(l.lz) <= this.stats.width / 2 + pr;
  }

  /** Distance from a point to the hull edge (0 if inside). */
  edgeDist(px: number, py: number): number {
    const l = this.toLocal(px, py);
    const dx = Math.max(0, Math.abs(l.lx) - this.stats.length / 2);
    const dz = Math.max(0, Math.abs(l.lz) - this.stats.width / 2);
    return Math.hypot(dx, dz);
  }

  buff(key: string): Buff | undefined {
    return this.buffs.get(key);
  }

  hasBuff(key: string): boolean {
    return this.buffs.has(key);
  }

  addBuff(key: string, t: number, v = 0): void {
    const b = this.buffs.get(key);
    if (b) {
      b.t = Math.max(b.t, t);
      b.v = Math.max(b.v, v);
    } else this.buffs.set(key, { t, v });
  }

  /* ---------------- persistence ---------------- */

  serialize(): TankSave {
    return {
      chassis: this.chassis, cols: this.cols, rows: this.rows, drive: this.drive, x: this.x, y: this.y, rot: this.rot, hp: this.hp, shield: this.shield,
      stories: this.stories, klass: this.klass, classMk: this.classMk, troops: this.troops,
      modules: this.modules.map((m) => ({ key: m.key, cx: m.cx, cy: m.cy, d: m.deck, weapon: m.weapon, mode: m.mode, lvl: m.lvl > 1 ? m.lvl : undefined, b: m.built ? undefined : false })),
      cargo: this.cargo.snapshot(),
    };
  }

  static deserialize(s: TankSave, team: Team = 'player', kind: TankKind = 'main', name = 'Fortress'): Tank {
    const t = new Tank(team, kind, s.chassis, name);
    if (s.klass) t.klass = s.klass;
    t.classMk = s.classMk ?? 1;
    // Saves from before the Titan Crawler had two or three stories: every building goes to its deck on the new hull.
    const oldHull = (s.stories ?? 0) < TITAN_DECKS && t.fortress;
    t.troops = s.troops ?? 0;
    t.drive = s.drive;
    t.x = s.x;
    t.y = s.y;
    t.rot = s.rot;
    // Layouts saved on an older, smaller deck move to the middle of the new one.
    const legacy = LEGACY_DIMS[s.chassis];
    const oldCols = s.cols ?? (legacy && kind === 'main' ? legacy[0] : t.cols), oldRows = s.rows ?? (legacy && kind === 'main' ? legacy[1] : t.rows);
    const ox = Math.max(0, Math.floor((t.cols - oldCols) / 2)), oy = Math.max(0, Math.floor((t.rows - oldRows) / 2));
    // The Command Center first: its level decides which decks are open for everything else.
    const saved = [...s.modules].sort((a, b) => (MODULES[b.key]?.required ? 1 : 0) - (MODULES[a.key]?.required ? 1 : 0));
    for (const m of saved) {
      if (!MODULES[m.key]) continue;
      // Saves from before the fortress had stories: guns and the tower go on the roof, the rest on the upper deck.
      const deck = m.d === undefined || (oldHull && m.d > 0) ? defaultDeck(MODULES[m.key]) : m.d;
      const w = m.weapon && WEAPONS[m.weapon.key] ? m.weapon : null;
      let inst = t.addModule(m.key, m.cx + ox, m.cy + oy, w, deck);
      if (!inst) {
        const spot = t.findSpot(m.key);
        if (spot) inst = t.addModule(m.key, spot[0], spot[1], w, spot[2]);
      }
      if (inst) {
        inst.mode = 'auto';
        inst.aim = t.rot;
        inst.lvl = Math.max(1, Math.min(6, Math.round(m.lvl ?? 1)));
        inst.built = m.b !== false;
      }
    }
    if (!t.modules.some((m) => m.key === 'bridge')) t.autoAdd('bridge');
    // Saves from before troops: everyone's aboard.
    if (s.troops === undefined) t.troops = kind === 'main' ? t.stats.bunks : 0;
    t.recalc();
    t.cargo = new Inventory(t.stats.cargo, s.cargo);
    t.hp = Math.min(t.stats.maxHp, s.hp);
    t.shield = s.shield ?? 0;
    return t;
  }
}

export interface TankSave {
  chassis: string;
  /** Deck size when saved (v0.7+); older saves used the smaller legacy decks. */
  cols?: number;
  rows?: number;
  drive: DriveKey;
  x: number;
  y: number;
  rot: number;
  hp: number;
  shield?: number;
  /** v0.8+: stories below the roof, hull class and mark, troops aboard. */
  stories?: number;
  klass?: HullClass;
  classMk?: number;
  troops?: number;
  modules: { key: string; cx: number; cy: number; d?: number; weapon: WeaponItem | null; mode?: FireMode; lvl?: number; b?: boolean }[];
  cargo: Slot[];
}
