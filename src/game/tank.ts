import { Inventory, type Slot } from '../shared/inventory';
import type { DriveKey, Hazard } from '../shared/types';
import { BASE_WEAPON_MODS, WEAPONS, weaponStats, type WeaponItem, type WeaponMods, type WeaponStats } from '../shared/weapons';
import { emptyBonus, type CrewBonus } from './crew';
import { chassisDef, levelMult, MODULES, type ModuleDef } from './defs';
import { hullMods, weaponMods, type HullMods } from './tech';

export type Team = 'player' | 'enemy';
export type TankKind = 'main' | 'outrider' | 'raider' | 'outpost' | 'remote';
export type FireMode = 'auto' | 'manual';

export const BASE_CARGO = 12;

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
  drive: DriveKey = 'wheels';
  modules: ModuleInst[] = [];
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

  constructor(team: Team, kind: TankKind, chassis: string, name = 'Fortress') {
    this.team = team;
    this.kind = kind;
    this.name = name;
    this.cell = kind === 'main' || kind === 'remote' ? 1 : kind === 'outrider' ? 0.5 : kind === 'raider' ? 0.6 : 0.75;
    this.crush = kind === 'main';
    this.chassis = chassis;
    const c = chassisDef(chassis);
    this.cols = c.cols;
    this.rows = c.rows;
    this.grid = new Int32Array(this.cols * this.rows).fill(-1);
    this.cargo = new Inventory(BASE_CARGO);
    this.recalc();
    this.hp = this.stats.maxHp;
  }

  /* ---------------- layout ---------------- */

  cellAt(cx: number, cy: number): number {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return -2;
    return this.grid[cy * this.cols + cx];
  }

  moduleById(id: number): ModuleInst | undefined {
    return this.modules.find((m) => m.id === id);
  }

  moduleAtCell(cx: number, cy: number): ModuleInst | undefined {
    const id = this.cellAt(cx, cy);
    return id >= 0 ? this.moduleById(id) : undefined;
  }

  canPlace(key: string, cx: number, cy: number, ignoreId = -1): boolean {
    const d = MODULES[key];
    if (!d) return false;
    if (cx < 0 || cy < 0 || cx + d.w > this.cols || cy + d.h > this.rows) return false;
    for (let y = cy; y < cy + d.h; y++) {
      for (let x = cx; x < cx + d.w; x++) {
        const c = this.grid[y * this.cols + x];
        if (c !== -1 && c !== ignoreId) return false;
      }
    }
    if (d.unique && this.modules.some((m) => m.key === key && m.id !== ignoreId)) return false;
    return true;
  }

  addModule(key: string, cx: number, cy: number, weapon: WeaponItem | null = null): ModuleInst | null {
    if (!this.canPlace(key, cx, cy)) return null;
    const d = MODULES[key];
    const m: ModuleInst = {
      id: this.nextModId++, key, cx, cy, weapon, mode: 'auto', aim: this.rot, cd: d.hardpoint ? Math.random() * 0.5 : 0, recoil: 0, targetId: 0, stats: null, burst: 0,
      lvl: 1, shots: 0, ramp: 0, rampTarget: 0, cd2: 0, built: true,
    };
    this.modules.push(m);
    for (let y = cy; y < cy + d.h; y++) for (let x = cx; x < cx + d.w; x++) this.grid[y * this.cols + x] = m.id;
    this.version++;
    this.recalc();
    return m;
  }

  removeModule(id: number): ModuleInst | null {
    const i = this.modules.findIndex((m) => m.id === id);
    if (i < 0) return null;
    const m = this.modules[i];
    if (MODULES[m.key].required) return null;
    this.modules.splice(i, 1);
    for (let k = 0; k < this.grid.length; k++) if (this.grid[k] === id) this.grid[k] = -1;
    this.version++;
    this.recalc();
    return m;
  }

  moveModule(id: number, cx: number, cy: number): boolean {
    const m = this.moduleById(id);
    if (!m || !this.canPlace(m.key, cx, cy, id)) return false;
    for (let k = 0; k < this.grid.length; k++) if (this.grid[k] === id) this.grid[k] = -1;
    const d = MODULES[m.key];
    m.cx = cx;
    m.cy = cy;
    for (let y = cy; y < cy + d.h; y++) for (let x = cx; x < cx + d.w; x++) this.grid[y * this.cols + x] = m.id;
    this.version++;
    return true;
  }

  /** First free spot for a module, scanning from the front. */
  findSpot(key: string): [number, number] | null {
    for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) if (this.canPlace(key, cx, cy)) return [cx, cy];
    return null;
  }

  autoAdd(key: string, weapon: WeaponItem | null = null): ModuleInst | null {
    const s = this.findSpot(key);
    return s ? this.addModule(key, s[0], s[1], weapon) : null;
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
    this.grid = new Int32Array(this.cols * this.rows).fill(-1);
    for (const m of this.modules) {
      const d = MODULES[m.key];
      if (ox >= 0 && oy >= 0 && m.cx + ox + d.w <= this.cols && m.cy + oy + d.h <= this.rows) {
        m.cx += ox;
        m.cy += oy;
      }
      for (let y = m.cy; y < m.cy + d.h; y++) for (let x = m.cx; x < m.cx + d.w; x++) this.grid[y * this.cols + x] = m.id;
    }
    this.version++;
    const frac = this.hp / Math.max(1, this.stats.maxHp);
    this.recalc();
    this.hp = Math.max(1, this.stats.maxHp * frac);
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
    let cards = 0, forge = 0, training = 0, sanctum = 0, depot = 0;
    const protects = new Set<Hazard>();
    let cc = 1;
    for (const m of this.modules) {
      const d: ModuleDef = MODULES[m.key];
      mass += d.w * d.h * 0.6 * this.cell * this.cell;
      if (d.required) cc = m.lvl;
      if (!m.built) continue;
      const f = levelMult(m.lvl);
      hp += (d.hp ?? 0) * f;
      armor += (d.armor ?? 0) * f;
      power += (d.power ?? 0) * f;
      use += d.use ?? 0;
      thrust += (d.thrust ?? 0) * f;
      cargo += Math.round((d.cargo ?? 0) * f);
      crewCap += d.crew ? d.crew + (m.lvl - 1) : 0;
      vision += (d.vision ?? 0) * f;
      drill = Math.max(drill, d.drill ?? 1);
      harvest *= 1 + ((d.harvest ?? 1) - 1) * f;
      repair += (d.repair ?? 0) * f;
      vault += d.vault ?? 0;
      food += (d.food ?? 0) * f;
      radar = Math.max(radar, (d.radar ?? 0) * f);
      shield += (d.shield ?? 0) * f;
      shieldRegen += (d.shieldRegen ?? 0) * f;
      refinery ||= !!d.refinery;
      workshop ||= !!d.workshop;
      garage ||= !!d.garage;
      medbay ||= !!d.medbay;
      mess ||= !!d.mess;
      cards += (d.cards ?? 0) * m.lvl;
      if (d.forge) forge = Math.max(forge, m.lvl);
      training += (d.training ?? 0) * f;
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
      const base: WeaponMods = this.team === 'player' ? weaponMods(this.tech, fam) : { ...BASE_WEAPON_MODS };
      const depotF = fam === 'ballistic' || fam === 'artillery' || fam === 'missile' ? Math.min(0.4, depot) : 0;
      const sanctumF = fam === 'arcane' && sanctum ? 0.1 * sanctum : 0;
      const mods: WeaponMods = {
        ...base,
        dmg: base.dmg * (1 + crew.dmg) * (1 + sanctumF) * (1 + 0.15 * (m.lvl - 1)) * this.dmgScale,
        rate: base.rate * (1 + crew.rate) * (1 + depotF),
        range: base.range * (1 + crew.range),
        crit: base.crit + crew.crit,
      };
      m.stats = weaponStats(m.weapon, mods);
      use += m.stats.power;
    }
    power *= 1 + crew.power;
    const powerRatio = use <= 0 ? 1 : Math.min(1, power / use);
    const width = this.cols * this.cell + this.cell * 2;
    const length = this.rows * this.cell + 0.3 * this.cell / 0.5;
    const ratio = Math.min(1.3, (thrust * 8) / mass);
    const topSpeed = this.anchored ? 0 : (2.2 + 3.6 * ratio) * (0.45 + 0.55 * powerRatio) * hull.speed * (1 + crew.speed);
    const turnRate = 1.9 * Math.sqrt(8 / ((this.rows + this.cols * 0.5) * this.cell / 0.5)) * (this.kind === 'main' ? 1.6 : 1);
    this.stats = {
      maxHp: Math.round(hp * hull.hp * (1 + crew.hp)),
      armor: Math.min(0.6, armor + hull.armor + crew.armor),
      shield: Math.round(shield * hull.shield * (1 + crew.shield)),
      shieldRegen: shieldRegen * hull.shieldRegen,
      power, use, powerRatio, thrust, mass, topSpeed, turnRate,
      cargo: Math.round(cargo + hull.cargo + crew.cargo),
      crewCap: Math.min(15, crewCap),
      vision: vision + crew.vision,
      drill, harvest: harvest * hull.harvest * (1 + crew.harvest),
      protects, repair: repair + crew.regen, vault, food, radar, refinery, workshop, garage, medbay,
      width, length, radius: width / 2, crush: hull.crush, loot: hull.loot * (1 + crew.loot),
      cards, forge, training, sanctum, depot, mess, cc,
    };
    if (this.cargo.size !== this.stats.cargo) this.cargo.resize(this.stats.cargo);
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.shield = Math.min(this.shield, this.stats.shield);
  }

  /** Applies research + crew bonuses (player tanks). */
  applyBonuses(tech: Set<string>, crew: CrewBonus): void {
    this.tech = tech;
    this.crew = crew;
    this.hull = hullMods(tech);
    this.recalc();
  }

  /* ---------------- geometry ---------------- */

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
      chassis: this.chassis, drive: this.drive, x: this.x, y: this.y, rot: this.rot, hp: this.hp, shield: this.shield,
      modules: this.modules.map((m) => ({ key: m.key, cx: m.cx, cy: m.cy, weapon: m.weapon, mode: m.mode, lvl: m.lvl > 1 ? m.lvl : undefined, b: m.built ? undefined : false })),
      cargo: this.cargo.snapshot(),
    };
  }

  static deserialize(s: TankSave, team: Team = 'player', kind: TankKind = 'main', name = 'Fortress'): Tank {
    const t = new Tank(team, kind, s.chassis, name);
    t.drive = s.drive;
    t.x = s.x;
    t.y = s.y;
    t.rot = s.rot;
    for (const m of s.modules) {
      if (!MODULES[m.key]) continue;
      const inst = t.addModule(m.key, m.cx, m.cy, m.weapon && WEAPONS[m.weapon.key] ? m.weapon : null);
      if (inst) {
        inst.mode = 'auto';
        inst.aim = t.rot;
        inst.lvl = Math.max(1, Math.min(6, Math.round(m.lvl ?? 1)));
        inst.built = m.b !== false;
      }
    }
    if (!t.modules.some((m) => m.key === 'bridge')) t.autoAdd('bridge');
    t.recalc();
    t.cargo = new Inventory(t.stats.cargo, s.cargo);
    t.hp = Math.min(t.stats.maxHp, s.hp);
    t.shield = s.shield ?? 0;
    return t;
  }
}

export interface TankSave {
  chassis: string;
  drive: DriveKey;
  x: number;
  y: number;
  rot: number;
  hp: number;
  shield?: number;
  modules: { key: string; cx: number; cy: number; weapon: WeaponItem | null; mode?: FireMode; lvl?: number; b?: boolean }[];
  cargo: Slot[];
}
