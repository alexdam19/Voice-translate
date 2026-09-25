import { GRAVITY, TILE } from '../shared/constants';
import { Inventory, type Stack } from '../shared/inventory';
import { CELL_EMPTY, CELL_SOLID, type CollisionGrid } from '../shared/physics';
import { TILES, type Terrain } from '../shared/tiles';
import type { Hazard } from '../shared/types';
import type { World } from '../shared/world';
import { defaultBonus, normalizeCrew, type CrewMember, type RigBonus } from './crew';
import { ARMOR_TILES, BG, CHASSIS, DRIVES, MODULES, RIG_CLEARANCE, RIG_TILES, RT, type ModuleDef, type Traction } from './rigDefs';

export interface ModuleInst {
  id: number;
  def: ModuleDef;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  angle: number;
  cooldown: number;
  crewed: boolean;
  timer: number;
  anim: number;
}

export interface RigHooks {
  moduleDestroyed(rig: Rig, m: ModuleInst): void;
  tileDestroyed(rig: Rig, tx: number, ty: number, t: number): void;
  drilled(rig: Rig, drops: Stack[]): void;
  landed(rig: Rig, impact: number): void;
}

const noopHooks: RigHooks = { moduleDestroyed() {}, tileDestroyed() {}, drilled() {}, landed() {} };

const approach = (v: number, target: number, step: number): number =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step);

export class Rig implements CollisionGrid {
  static nextId = 1;
  static hooks: RigHooks = noopHooks;

  id = Rig.nextId++;
  name: string;
  team: 'player' | 'hostile';
  cols: number;
  rows: number;
  tiles: Uint8Array;
  bg: Uint8Array;
  hp: Float32Array;
  modules: ModuleInst[] = [];
  modAt: Int16Array;
  private nextModId = 1;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  prevX = 0;
  prevY = 0;
  chassis = 0;
  drive = 'wheels';
  cargo = new Inventory(0);
  crew: CrewMember[] = [];
  anchored = false;
  wrecked = false;
  throttle = 0;
  facing = 1;
  zoneIndex = 2;

  shield = 0;
  shieldDelay = 0;
  shieldFlash = 0;
  /** Bumped on any structural change so renderers can rebuild caches. */
  version = 0;

  // Derived stats (recalc()).
  mass = 1;
  thrust = 0;
  powerProd = 0;
  powerUse = 0;
  bunks = 0;
  shieldMax = 0;
  radar = 0;
  repairRate = 0;
  hasCockpit = false;
  drillL = false;
  drillR = false;
  protects = new Set<Hazard>();
  stations = new Set<string>();

  // Drive telemetry.
  terrain: Terrain = 'normal';
  traction: Traction = DRIVES.wheels.traction.normal;
  liquidTile = 0;
  blocked = false;
  bogged = false;
  straining = false;
  drillProgress = 0;
  drilling = false;
  wheelAngle = 0;
  groundTops: number[] = [];
  lastSafe = { x: 0, y: 0 };
  private safeTimer = 0;

  /** AI brain for hostile rigs (opaque to the rig itself). */
  ai: unknown = null;
  /** Crew + research effects (the game recomputes this for the player's rig). */
  bonus: RigBonus = defaultBonus();

  constructor(cols: number, rows: number, team: 'player' | 'hostile', name: string) {
    this.cols = cols;
    this.rows = rows;
    this.team = team;
    this.name = name;
    this.tiles = new Uint8Array(cols * rows);
    this.bg = new Uint8Array(cols * rows);
    this.hp = new Float32Array(cols * rows);
    this.modAt = new Int16Array(cols * rows).fill(-1);
    for (let x = 0; x < cols; x++) this.setTile(x, rows - 1, RT.CHASSIS);
  }

  /* ---------------- CollisionGrid ---------------- */

  get ox(): number {
    return this.x;
  }
  get oy(): number {
    return this.y;
  }

  cell(tx: number, ty: number, team: string): number {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return CELL_EMPTY;
    const t = this.tiles[ty * this.cols + tx];
    if (t === RT.DOOR) return team === this.team ? CELL_EMPTY : CELL_SOLID;
    return RIG_TILES[t].cell;
  }

  /* ---------------- Geometry ---------------- */

  get widthPx(): number {
    return this.cols * TILE;
  }
  get heightPx(): number {
    return this.rows * TILE;
  }
  get cx(): number {
    return this.x + this.widthPx / 2;
  }
  get cy(): number {
    return this.y + this.heightPx / 2;
  }

  contains(wx: number, wy: number, pad = 0): boolean {
    return wx >= this.x - pad && wx < this.x + this.widthPx + pad && wy >= this.y - pad && wy < this.y + this.heightPx + RIG_CLEARANCE + pad;
  }

  toTile(wx: number, wy: number): { tx: number; ty: number } {
    return { tx: Math.floor((wx - this.x) / TILE), ty: Math.floor((wy - this.y) / TILE) };
  }

  inGrid(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows;
  }

  tileAt(tx: number, ty: number): number {
    return this.inGrid(tx, ty) ? this.tiles[ty * this.cols + tx] : RT.EMPTY;
  }

  bgAt(tx: number, ty: number): number {
    return this.inGrid(tx, ty) ? this.bg[ty * this.cols + tx] : BG.NONE;
  }

  moduleAt(tx: number, ty: number): ModuleInst | null {
    if (!this.inGrid(tx, ty)) return null;
    const i = this.modAt[ty * this.cols + tx];
    return i >= 0 ? this.modules[i] : null;
  }

  moduleCenter(m: ModuleInst): { x: number; y: number } {
    return { x: this.x + (m.x + m.def.w / 2) * TILE, y: this.y + (m.y + m.def.h / 2) * TILE };
  }

  /** True when a world point sits in front of interior backdrop panels (i.e. "indoors"). */
  isInterior(wx: number, wy: number): boolean {
    const { tx, ty } = this.toTile(wx, wy);
    return this.bgAt(tx, ty) === BG.PANEL;
  }

  /* ---------------- Editing ---------------- */

  setTile(tx: number, ty: number, t: number): void {
    if (!this.inGrid(tx, ty)) return;
    const i = ty * this.cols + tx;
    this.tiles[i] = t;
    this.hp[i] = this.tileMax(t);
    this.version++;
  }

  /** Max health of a plating type, after armor research and crew perks. */
  tileMax(t: number): number {
    const base = RIG_TILES[t].hp;
    if (t === RT.CHASSIS || t === RT.EMPTY) return base;
    return Math.round(base * (ARMOR_TILES.has(t) ? this.bonus.armorHp * this.bonus.tileHp : this.bonus.tileHp));
  }

  setBg(tx: number, ty: number, b: number): void {
    if (!this.inGrid(tx, ty)) return;
    this.bg[ty * this.cols + tx] = b;
    this.version++;
  }

  fillTiles(x0: number, y0: number, w: number, h: number, t: number): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.setTile(x, y, t);
  }

  fillBg(x0: number, y0: number, w: number, h: number, b: number): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.setBg(x, y, b);
  }

  canPlaceTile(tx: number, ty: number): boolean {
    return this.inGrid(tx, ty) && ty < this.rows - 1 && this.tileAt(tx, ty) === RT.EMPTY && !this.moduleAt(tx, ty);
  }

  /** Validates module placement. Returns an error message or null. */
  checkModule(def: ModuleDef, tx: number, ty: number): string | null {
    if (tx < 0 || ty < 0 || tx + def.w > this.cols || ty + def.h > this.rows - 1) return 'Out of bounds';
    if (def.unique && this.modules.some((m) => m.def.key === def.key)) return 'Only one allowed';
    for (let y = ty; y < ty + def.h; y++) {
      for (let x = tx; x < tx + def.w; x++) {
        if (this.moduleAt(x, y)) return 'Overlaps a module';
        const t = this.tileAt(x, y);
        if (t !== RT.EMPTY && t !== RT.LAMP) return 'Blocked by plating';
      }
    }
    let support = 0;
    for (let x = tx; x < tx + def.w; x++) {
      const c = RIG_TILES[this.tileAt(x, ty + def.h)].cell;
      if (c === 1 || c === 2) support++;
    }
    if (support < Math.ceil(def.w / 2)) return 'Needs a floor underneath';
    if (def.drill && tx !== 0 && tx + def.w !== this.cols) return 'Must touch the front or rear edge';
    return null;
  }

  addModule(def: ModuleDef, tx: number, ty: number): ModuleInst {
    for (let y = ty; y < ty + def.h; y++) for (let x = tx; x < tx + def.w; x++) if (this.tileAt(x, y) === RT.LAMP) this.setTile(x, y, RT.EMPTY);
    const m: ModuleInst = {
      id: this.nextModId++, def, x: tx, y: ty, hp: def.hp, maxHp: def.hp,
      angle: def.turret?.size === 'heavy' ? -0.06 : -Math.PI / 2, cooldown: Math.random(), crewed: false, timer: 0, anim: Math.random() * 10,
    };
    this.modules.push(m);
    this.rebuildModAt();
    this.recalc();
    return m;
  }

  removeModule(m: ModuleInst): void {
    const i = this.modules.indexOf(m);
    if (i < 0) return;
    this.modules.splice(i, 1);
    for (const c of this.crew) if (c.post === m.id) c.post = -1;
    this.rebuildModAt();
    this.recalc();
  }

  private rebuildModAt(): void {
    this.modAt.fill(-1);
    this.modules.forEach((m, i) => {
      for (let y = m.y; y < m.y + m.def.h; y++) for (let x = m.x; x < m.x + m.def.w; x++) this.modAt[y * this.cols + x] = i;
    });
    this.version++;
  }

  /** Grows the grid to a bigger chassis, keeping everything anchored to the bottom-left. */
  resize(cols: number, rows: number): void {
    const dy = rows - this.rows;
    const old = { tiles: this.tiles, bg: this.bg, hp: this.hp, cols: this.cols, rows: this.rows };
    this.cols = cols;
    this.rows = rows;
    this.tiles = new Uint8Array(cols * rows);
    this.bg = new Uint8Array(cols * rows);
    this.hp = new Float32Array(cols * rows);
    this.modAt = new Int16Array(cols * rows).fill(-1);
    for (let y = 0; y < old.rows; y++) {
      for (let x = 0; x < old.cols; x++) {
        const oi = y * old.cols + x;
        const ni = (y + dy) * cols + x;
        this.tiles[ni] = old.tiles[oi];
        this.bg[ni] = old.bg[oi];
        this.hp[ni] = old.hp[oi];
      }
    }
    for (let x = 0; x < cols; x++) this.setTile(x, rows - 1, RT.CHASSIS);
    for (const m of this.modules) m.y += dy;
    this.y -= dy * TILE;
    this.rebuildModAt();
    this.recalc();
  }

  /* ---------------- Stats ---------------- */

  recalc(): void {
    let mass = 0;
    for (let i = 0; i < this.tiles.length; i++) mass += RIG_TILES[this.tiles[i]].mass;
    let thrust = 0, prod = 0, use = 0, bunks = 0, cargo = 0, shield = 0, radar = 0, repair = 0;
    let cockpit = false;
    const b = this.bonus;
    this.drillL = this.drillR = false;
    this.protects.clear();
    this.stations.clear();
    for (const m of this.modules) {
      const d = m.def;
      mass += d.w * d.h * 0.6;
      const mb = b.mod.get(m.id);
      if (d.power > 0) prod += d.power * (mb?.power ?? 1);
      else use -= d.power * (d.turret ? b.weapon[d.turret.family].power : 1);
      thrust += (d.thrust ?? 0) * (mb?.thrust ?? 1);
      bunks += d.bunks ?? 0;
      cargo += d.cargo ?? 0;
      shield += d.shield ?? 0;
      radar = Math.max(radar, d.radar ?? 0);
      repair += d.repair ?? 0;
      if (d.key === 'cockpit') cockpit = true;
      if (d.station) this.stations.add(d.station);
      if (d.protects) for (const h of d.protects) this.protects.add(h);
      if (d.drill) {
        if (m.x === 0) this.drillL = true;
        else this.drillR = true;
      }
    }
    use -= DRIVES[this.drive].power;
    if (cargo > 0) cargo += b.cargoBonus;
    this.mass = mass;
    this.thrust = thrust * b.hull.thrust;
    this.powerProd = Math.round(prod * b.powerProdMult);
    this.powerUse = Math.round(use * b.powerUseMult);
    this.bunks = bunks;
    this.shieldMax = Math.round(shield * b.hull.shield);
    this.shield = Math.min(this.shield, shield);
    this.radar = radar;
    this.repairRate = repair;
    this.hasCockpit = cockpit;
    if (this.cargo.size !== cargo) {
      const overflow = this.cargo.resize(cargo);
      this.overflow.push(...overflow);
    }
  }

  /** Items that no longer fit after cargo shrank; the game drops them in the world. */
  overflow: Stack[] = [];

  get powerRatio(): number {
    if (this.powerUse <= 0) return 1;
    return Math.min(1, this.powerProd / this.powerUse);
  }

  isProtected(h: Hazard): boolean {
    return this.protects.has(h) && this.powerRatio >= 0.5;
  }

  get chassisDef() {
    return CHASSIS[this.chassis];
  }

  integrity(): number {
    let cur = 0, max = 0;
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      if (t === RT.EMPTY || t === RT.CHASSIS) continue;
      cur += Math.min(this.hp[i], this.tileMax(t));
      max += this.tileMax(t);
    }
    for (const m of this.modules) {
      cur += m.hp;
      max += m.maxHp;
    }
    return max > 0 ? cur / max : 1;
  }

  /* ---------------- Damage ---------------- */

  /** Applies damage at a world point. Returns true if it struck something solid. */
  /** Incoming damage after evasive driving. */
  private mitigate(dmg: number): number {
    return Math.abs(this.vx) > 40 ? dmg * (1 - this.bonus.evasive) : dmg;
  }

  damageAt(wx: number, wy: number, dmgIn: number): boolean {
    const dmg = this.mitigate(dmgIn);
    const { tx, ty } = this.toTile(wx, wy);
    if (!this.inGrid(tx, ty)) return false;
    const m = this.moduleAt(tx, ty);
    if (m) {
      this.damageModule(m, dmg);
      return true;
    }
    const i = ty * this.cols + tx;
    const t = this.tiles[i];
    if (t === RT.EMPTY || RIG_TILES[t].cell !== CELL_SOLID) return false;
    this.damageTile(tx, ty, dmg);
    return true;
  }

  damageTile(tx: number, ty: number, dmg: number): void {
    if (!this.inGrid(tx, ty)) return;
    const i = ty * this.cols + tx;
    const t = this.tiles[i];
    if (t === RT.EMPTY || t === RT.CHASSIS) return;
    this.hp[i] -= dmg;
    if (this.hp[i] <= 0) {
      this.tiles[i] = RT.EMPTY;
      this.hp[i] = 0;
      this.version++;
      this.recalcMassOnly();
      Rig.hooks.tileDestroyed(this, tx, ty, t);
    }
  }

  damageModule(m: ModuleInst, dmg: number): void {
    if (m.hp <= 0) return;
    m.hp -= dmg;
    if (m.hp <= 0) {
      m.hp = 0;
      this.removeModule(m);
      Rig.hooks.moduleDestroyed(this, m);
    }
  }

  /** Radial damage to everything within radius (world px). */
  explode(wx: number, wy: number, radius: number, dmgIn: number): void {
    const dmg = this.mitigate(dmgIn);
    const r = Math.ceil(radius / TILE);
    const c = this.toTile(wx, wy);
    const hitMods = new Set<ModuleInst>();
    for (let ty = c.ty - r; ty <= c.ty + r; ty++) {
      for (let tx = c.tx - r; tx <= c.tx + r; tx++) {
        if (!this.inGrid(tx, ty)) continue;
        const px = this.x + (tx + 0.5) * TILE, py = this.y + (ty + 0.5) * TILE;
        const d = Math.hypot(px - wx, py - wy);
        if (d > radius) continue;
        const f = 1 - (d / radius) * 0.6;
        const m = this.moduleAt(tx, ty);
        if (m) {
          if (!hitMods.has(m)) {
            hitMods.add(m);
            this.damageModule(m, dmg * f);
          }
        } else {
          this.damageTile(tx, ty, dmg * f);
        }
      }
    }
  }

  private recalcMassOnly(): void {
    let mass = 0;
    for (let i = 0; i < this.tiles.length; i++) mass += RIG_TILES[this.tiles[i]].mass;
    for (const m of this.modules) mass += m.def.w * m.def.h * 0.6;
    this.mass = mass;
  }

  /* ---------------- Driving ---------------- */

  private columnGround(world: World, wtx: number, fromTy: number, hover: boolean): { top: number; tile: number } {
    const limit = fromTy + this.rows + 48;
    for (let ty = fromTy; ty < limit; ty++) {
      const t = world.get(wtx, ty);
      const d = TILES[t];
      if (d.solid) return { top: ty * TILE, tile: t };
      if (d.liquid) return { top: ty * TILE + (hover ? 0 : 8), tile: t };
    }
    return { top: limit * TILE, tile: 0 };
  }

  /** Samples the ground under the footprint at a given x. Returns the highest ground (min top). */
  private sampleGround(world: World, x: number, hover: boolean): { rest: number; terrain: Terrain; liquid: number } {
    const c0 = Math.floor(x / TILE);
    const c1 = Math.floor((x + this.widthPx - 1) / TILE);
    const fromTy = Math.floor(this.y / TILE) - 1;
    let rest = Infinity;
    const counts: Record<Terrain, number> = { normal: 0, sand: 0, ice: 0, ash: 0, mud: 0, liquid: 0 };
    let liquid = 0;
    this.groundTops.length = 0;
    for (let c = c0; c <= c1; c++) {
      const g = this.columnGround(world, c, fromTy, hover);
      this.groundTops.push(g.top);
      if (g.top < rest) rest = g.top;
      const d = TILES[g.tile];
      counts[d.terrain]++;
      if (d.liquid) liquid = g.tile;
    }
    // The worst terrain that covers a meaningful share of the footprint wins.
    const n = c1 - c0 + 1;
    let terrain: Terrain = 'normal';
    for (const k of ['liquid', 'sand', 'ice', 'ash', 'mud'] as Terrain[]) {
      if (counts[k] / n >= 0.3) {
        terrain = k;
        break;
      }
    }
    return { rest, terrain, liquid };
  }

  /** Top speed on ideal ground in px/s. Tanks are heavy: thrust has to move mass. */
  topSpeed(): number {
    if (!this.hasCockpit || this.wrecked || this.thrust <= 0) return 0;
    const thrustF = Math.min(1.3, (this.thrust * 100) / Math.max(60, this.mass));
    return (30 + 200 * thrustF) * (0.35 + 0.65 * this.powerRatio) * this.bonus.speedMult;
  }

  restY(ground: number): number {
    return ground - RIG_CLEARANCE - this.heightPx - (DRIVES[this.drive].hover ? 8 : 0);
  }

  /** Places the rig resting on the ground at column tx. */
  placeOnGround(world: World, tx: number): void {
    this.x = tx * TILE;
    this.y = 0;
    const s = this.sampleGround(world, this.x, DRIVES[this.drive].hover);
    this.y = this.restY(s.rest);
    this.prevX = this.x;
    this.prevY = this.y;
    this.lastSafe = { x: this.x, y: this.y };
  }

  driveStep(dt: number, world: World, others: Rig[]): void {
    this.prevX = this.x;
    this.prevY = this.y;
    if (this.anchored) return;
    const def = DRIVES[this.drive];
    const cur = this.sampleGround(world, this.x, def.hover);
    this.terrain = cur.terrain;
    this.liquidTile = cur.liquid;
    const base = def.traction[this.terrain];
    const trc: Traction = {
      speed: base.speed < 0.4 ? Math.min(0.4, base.speed * this.bonus.bogMult) : base.speed,
      climb: base.climb + this.bonus.climbBonus,
      accel: base.accel,
    };
    this.traction = trc;

    const maxV = this.topSpeed() * trc.speed;
    if (this.throttle !== 0 && maxV > 0) {
      this.vx = approach(this.vx, this.throttle * maxV, 150 * trc.accel * dt);
      this.facing = this.throttle > 0 ? 1 : -1;
    } else {
      const slippery = this.terrain === 'ice' && trc.accel < 0.5;
      this.vx = approach(this.vx, 0, (slippery ? 25 : 240) * dt);
    }

    this.blocked = false;
    this.straining = false;
    this.drilling = false;
    if (Math.abs(this.vx) > 0.01) {
      const dx = this.vx * dt;
      const nx = this.x + dx;
      const lead = dx > 0 ? Math.floor((nx + this.widthPx - 1) / TILE) : Math.floor(nx / TILE);
      const curLead = dx > 0 ? Math.floor((this.x + this.widthPx - 1) / TILE) : Math.floor(this.x / TILE);
      let ok = true;
      if (lead !== curLead) {
        const fromTy = Math.floor(this.y / TILE) - 1;
        const g = this.columnGround(world, lead, fromTy, def.hover);
        const rise = (cur.rest - g.top) / TILE;
        const allowance = trc.climb + (trc.speed >= 0.5 ? 1 : 0);
        if (rise > allowance + 0.01) {
          ok = false;
          const hasDrill = dx > 0 ? this.drillR : this.drillL;
          if (hasDrill && this.powerRatio > 0.3) this.drill(world, lead, fromTy, cur.rest - trc.climb * TILE, dt);
        } else if (rise > trc.climb + 0.01) {
          this.straining = true;
        }
      }
      if (ok) {
        for (const o of others) {
          if (o === this || o.anchored || o.wrecked) continue;
          const ox0 = o.x, ox1 = o.x + o.widthPx;
          const overlapY = this.y < o.y + o.heightPx && this.y + this.heightPx > o.y;
          const overlapsNow = this.x < ox1 && this.x + this.widthPx > ox0;
          const overlapsNext = nx < ox1 && nx + this.widthPx > ox0;
          if (overlapY && overlapsNext && !overlapsNow) ok = false;
        }
      }
      if (ok) {
        this.x = this.straining ? this.x + dx * 0.4 : nx;
        this.wheelAngle += (this.x - this.prevX) / 18;
      } else {
        this.vx = 0;
        this.blocked = true;
      }
    }
    if (!this.drilling) this.drillProgress = Math.max(0, this.drillProgress - dt);

    const after = this.sampleGround(world, this.x, def.hover);
    const ry = this.restY(after.rest);
    if (this.y > ry + 0.5) {
      this.y = Math.max(ry, this.y - 200 * dt);
      this.vy = 0;
    } else if (this.y < ry - 0.5) {
      this.vy = Math.min(this.vy + GRAVITY * dt, 900);
      this.y += this.vy * dt;
      if (this.y >= ry) {
        const impact = this.vy;
        this.y = ry;
        this.vy = 0;
        if (impact > 350) Rig.hooks.landed(this, impact);
      }
    } else {
      this.y = ry;
      this.vy = 0;
    }

    this.bogged = trc.speed < 0.4 && this.throttle !== 0;
    this.safeTimer += dt;
    if (this.safeTimer > 4 && this.terrain === 'normal' && this.vy === 0 && !this.blocked) {
      this.safeTimer = 0;
      this.lastSafe = { x: this.x, y: this.y };
    }
  }

  private drill(world: World, col: number, fromTy: number, maxTop: number, dt: number): void {
    this.drilling = true;
    const targets: number[] = [];
    let hardest = 0;
    const endTy = Math.floor((maxTop - 1) / TILE);
    for (let ty = fromTy; ty <= endTy; ty++) {
      const t = world.get(col, ty);
      const d = TILES[t];
      if (!d.solid) continue;
      if (d.indestructible) return;
      targets.push(ty);
      hardest = Math.max(hardest, d.hardness);
    }
    if (!targets.length) return;
    this.drillProgress += dt * 1.4 * this.powerRatio;
    if (this.drillProgress < Math.min(2.5, 0.4 + hardest)) return;
    this.drillProgress = 0;
    const drops: Stack[] = [];
    for (const ty of targets) {
      const d = TILES[world.get(col, ty)];
      if (d.drop) drops.push({ id: d.drop, n: d.dropN });
      world.set(col, ty, 0);
    }
    Rig.hooks.drilled(this, drops);
  }

  /* ---------------- Serialization ---------------- */

  serialize(): RigSave {
    return {
      name: this.name, cols: this.cols, rows: this.rows, chassis: this.chassis, drive: this.drive,
      x: this.x, y: this.y,
      tiles: Array.from(this.tiles), bg: Array.from(this.bg), hp: Array.from(this.hp, (v) => Math.round(v)),
      modules: this.modules.map((m) => ({ key: m.def.key, x: m.x, y: m.y, hp: Math.round(m.hp) })),
      cargo: this.cargo.snapshot(), crew: this.crew.map((c) => ({ ...c })),
      shield: this.shield,
    };
  }

  static deserialize(s: RigSave): Rig {
    const r = new Rig(s.cols, s.rows, 'player', s.name);
    r.chassis = s.chassis;
    r.drive = s.drive in DRIVES ? s.drive : 'wheels';
    r.tiles.set(s.tiles);
    r.bg.set(s.bg);
    r.hp.set(s.hp);
    for (const m of s.modules) {
      const def = MODULES[m.key];
      if (!def) continue;
      const inst = r.addModule(def, m.x, m.y);
      inst.hp = Math.min(inst.maxHp, m.hp);
    }
    r.recalc();
    r.cargo = new Inventory(r.cargo.size, s.cargo);
    r.crew = s.crew.map((c) => normalizeCrew(c));
    r.x = s.x;
    r.y = s.y;
    r.prevX = r.x;
    r.prevY = r.y;
    r.lastSafe = { x: r.x, y: r.y };
    r.shield = s.shield ?? 0;
    r.version++;
    return r;
  }
}

export interface RigSave {
  name: string;
  cols: number;
  rows: number;
  chassis: number;
  drive: string;
  x: number;
  y: number;
  tiles: number[];
  bg: number[];
  hp: number[];
  modules: { key: string; x: number; y: number; hp: number }[];
  cargo: (Stack | null)[];
  crew: (Partial<CrewMember> & { name: string })[];
  shield: number;
}
