import { DAY_LENGTH, TILE } from '../shared/constants';
import { mergeStacks, type Inventory, type Stack } from '../shared/inventory';
import { getItem, type ProjKind } from '../shared/items';
import { rollLoot } from '../shared/loot';
import type { CollisionGrid } from '../shared/physics';
import { hash1 } from '../shared/rng';
import { generateWorld, type GenResult } from '../shared/worldgen';
import { DEAD_ZONE, ZONES, zoneIndexAt, type ZoneDef } from '../shared/zones';
import { Minimap } from '../render/minimap';
import { Renderer } from '../render/renderer';
import { UI } from '../ui/ui';
import { Audio } from './audio';
import { giveXp, hireCost, makeCrew, normalizeCrew, randomRole, ROLES, type CrewMember } from './crew';
import { canResearch, freeTech, researchCost, TECH_BY_ID } from './tech';
import { canAfford, payCost } from '../shared/inventory';
import { Camera } from './camera';
import { Player, Sim, type Enemy, type ItemDrop, type Projectile } from './entities';
import { Input } from './input';
import { Rig } from './rig';
import { buildOutpost, buildStarterRig } from './rigTemplates';
import { clearSave, loadSave, writeSave, type SaveData } from './save';
import { updateBuild } from './systems/build';
import { explodeAt, updateProjectiles } from './systems/combat';
import { updateDrops } from './systems/drops';
import { updateEnemies } from './systems/enemies';
import { updateHazards } from './systems/hazards';
import { respawnPlayer, updatePlayer } from './systems/player';
import { updateRigs, wreckRig } from './systems/rigs';
import type { WarzoneClient } from './warzone';

export type Panel = null | 'inventory' | 'craft' | 'build' | 'rig' | 'map' | 'help' | 'pause' | 'loot' | 'confirm' | 'dead' | 'crew' | 'tech';

export interface BuildState {
  kind: 'tile' | 'module' | 'bg' | 'erase';
  id: string;
}

export interface Interactable {
  label: string;
  x: number;
  y: number;
  act: () => void;
}

export interface Settings {
  name: string;
  server: string;
  muted: boolean;
}

export class Game {
  readonly ctx: CanvasRenderingContext2D;
  readonly input: Input;
  readonly camera = new Camera();
  readonly audio = new Audio();
  readonly renderer: Renderer;
  readonly ui: UI;

  state: 'title' | 'playing' = 'title';
  sim!: Sim;
  openWorld: Sim | null = null;
  gen!: GenResult;
  seed = 0;
  player = new Player();
  playerRig: Rig | null = null;
  minimap: Minimap | null = null;
  worldMinimap: Minimap | null = null;
  dayTime = 0.3;
  opened = new Set<number>();
  cleared = new Set<number>();
  panel: Panel = null;
  build: BuildState = { kind: 'tile', id: 'hull' };
  mouseWorld = { x: 0, y: 0 };
  manualAim: { x: number; y: number } | null = null;
  manualFire = false;
  zone: ZoneDef = ZONES[2];
  private lastZone = -1;
  warzone: WarzoneClient | null = null;
  returnPos: { x: number; y: number } | null = null;
  interact: Interactable | null = null;
  stats = { kills: 0, rigs: 0, outposts: 0, extracts: 0, deaths: 0, playtime: 0, titans: 0 };
  /** Researched tech tree nodes. */
  tech = freeTech();
  /** Candidates on the recruitment board. */
  recruits: CrewMember[] = [];
  settings: Settings = { name: 'Drifter', server: '', muted: false };
  timers = { enemy: 4, raider: 70, save: 0, reveal: 0, titan: 120, bonus: 0 };
  weather = { kind: null as string | null, t: 60, strength: 0 };
  private lastTs = 0;
  private acc = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.input = new Input(canvas);
    this.renderer = new Renderer(this);
    this.ui = new UI(this);
    this.loadSettings();
    this.installRigHooks();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('beforeunload', () => {
      if (this.state === 'playing' && this.sim?.kind === 'world') this.save();
    });
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.resize(w, h, dpr);
  }

  private loadSettings(): void {
    try {
      const s = JSON.parse(localStorage.getItem('ironcrawl-settings') ?? '{}') as Partial<Settings>;
      this.settings = { ...this.settings, ...s };
    } catch {
      /* ignore */
    }
    this.audio.setMuted(this.settings.muted);
  }

  saveSettings(): void {
    try {
      localStorage.setItem('ironcrawl-settings', JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  hasSave(): boolean {
    return loadSave() !== null;
  }

  newGame(seed = (Math.random() * 1e9) | 0): void {
    clearSave();
    this.seed = seed;
    this.gen = generateWorld(seed);
    this.gen.world.mods = new Map();
    this.opened.clear();
    this.cleared.clear();
    this.stats = { kills: 0, rigs: 0, outposts: 0, extracts: 0, deaths: 0, playtime: 0, titans: 0 };
    this.tech = freeTech();
    this.recruits = this.rollRecruits();
    this.dayTime = 0.3;
    this.player = new Player();
    const p = this.player;
    p.inv.add('cutter1', 1);
    p.inv.add('rivet_pistol', 1);
    p.inv.add('platform', 30);
    p.inv.add('medkit', 3);
    p.inv.add('grenade', 3);
    p.inv.add('rounds', 150);
    p.inv.add('scrap', 60);
    p.inv.add('iron_plate', 20);
    p.inv.add('copper_wire', 12);
    p.inv.add('circuit', 4);
    p.inv.add('rations', 5);
    p.inv.add('lamp', 10);

    const rig = buildStarterRig();
    rig.placeOnGround(this.gen.world, this.gen.spawnX);
    this.playerRig = rig;
    this.setupWorldSim();
    respawnPlayer(this, false);
    this.timers = { enemy: 8, raider: 90, save: 0, reveal: 0, titan: 150, bonus: 0 };
    this.startPlaying();
    this.toast('Welcome to the wasteland, drifter. Press H for controls.', '#ffb74d');
    this.toast('Walk to the Command Bridge (front of the upper deck) and press F to drive.', '#80deea');
    this.save();
  }

  loadGame(): boolean {
    const data = loadSave();
    if (!data) return false;
    try {
      this.applySave(data);
    } catch (e) {
      console.error('Failed to load save', e);
      this.toast('Save file was corrupt; starting a new run.', '#ff5252');
      this.newGame();
      return true;
    }
    this.startPlaying();
    this.toast('Run resumed.', '#80deea');
    return true;
  }

  private applySave(d: SaveData): void {
    this.seed = d.seed;
    this.gen = generateWorld(d.seed);
    const world = this.gen.world;
    world.mods = new Map();
    const pairs: [number, number][] = [];
    for (let i = 0; i + 1 < d.mods.length; i += 2) pairs.push([d.mods[i], d.mods[i + 1]]);
    world.applyMods(pairs);
    this.opened = new Set(d.opened);
    this.cleared = new Set(d.cleared);
    this.stats = { ...this.stats, ...d.stats };
    this.tech = freeTech();
    for (const id of d.tech ?? []) if (TECH_BY_ID.has(id)) this.tech.add(id);
    this.recruits = d.recruits?.length ? d.recruits.map((c) => normalizeCrew(c)) : this.rollRecruits();
    this.dayTime = d.dayTime;
    this.player = new Player();
    const p = this.player;
    p.inv.slots = p.inv.slots.map((_, i) => d.player.inv[i] ?? null);
    p.secure.slots = p.secure.slots.map((_, i) => d.player.secure[i] ?? null);
    p.suit = d.player.suit;
    p.gadget = d.player.gadget;
    p.hp = Math.max(20, d.player.hp);
    p.x = d.player.x;
    p.y = d.player.y;
    this.playerRig = d.rig ? Rig.deserialize(d.rig) : null;
    this.setupWorldSim();
    if (d.explored && this.minimap) this.minimap.loadExplored(d.explored);
  }

  private setupWorldSim(): void {
    const sim = new Sim('world', this.gen.world);
    for (const c of this.gen.caches) {
      sim.caches.push({ id: c.id, x: c.x * TILE, y: (c.y + 1) * TILE, table: c.table, opened: this.opened.has(c.id) });
    }
    if (this.playerRig) sim.rigs.push(this.playerRig);
    for (const o of this.gen.outposts) {
      if (this.cleared.has(o.id)) continue;
      const r = buildOutpost(o.zone, this.seed + o.id * 97);
      r.x = o.x * TILE;
      r.y = r.restY(o.ground * TILE) + 10;
      r.prevX = r.x;
      r.prevY = r.y;
      r.ai = { outpostId: o.id, trooperTimer: 5, mode: 'idle', dir: 1, stuck: 0, timer: 0 };
      sim.rigs.unshift(r);
    }
    this.sim = sim;
    this.openWorld = null;
    this.minimap = new Minimap(this.gen.world, false);
    this.worldMinimap = this.minimap;
  }

  private startPlaying(): void {
    this.state = 'playing';
    this.panel = null;
    this.ui.showTitle(false);
    this.camera.targetZoom = this.camera.baseZoom() * this.camera.userZoom;
    this.camera.snap(this.player.cx, this.player.cy);
    this.lastZone = -1;
    this.audio.unlock();
  }

  quitToTitle(): void {
    if (this.sim?.kind === 'world') this.save();
    this.state = 'title';
    this.panel = null;
    this.ui.showTitle(true);
  }

  /**
   * Persists the open world. With `raid` set, the pack is saved empty: at-risk
   * items only come home through extraction, so closing the tab mid-raid can't
   * duplicate a pack the server already dropped.
   */
  save(raid = false): void {
    if (this.state !== 'playing' || !this.gen) return;
    const world = this.sim.kind === 'world' ? this.sim : this.openWorld;
    if (!world) return;
    const p = this.player;
    const pos = this.sim.kind === 'world' ? { x: p.x, y: p.y } : this.returnPos ?? { x: p.x, y: p.y };
    const mods: number[] = [];
    for (const [i, t] of this.gen.world.mods ?? []) mods.push(i, t);
    const data: SaveData = {
      v: 1,
      seed: this.seed,
      dayTime: this.dayTime,
      player: { x: pos.x, y: pos.y, hp: p.hp, inv: raid ? [] : p.inv.snapshot(), secure: p.secure.snapshot(), suit: p.suit, gadget: p.gadget },
      rig: this.playerRig ? this.playerRig.serialize() : null,
      mods,
      opened: [...this.opened],
      cleared: [...this.cleared],
      stats: this.stats,
      explored: this.worldMinimap?.saveExplored() ?? '',
      tech: [...this.tech],
      recruits: this.recruits.map((c) => ({ ...c })),
    };
    if (!writeSave(data)) this.toast('Could not write save (storage full or blocked).', '#ff5252');
  }

  /* ------------------------------------------------------------------ */
  /* Main loop                                                           */
  /* ------------------------------------------------------------------ */

  private frame(ts: number): void {
    const dtReal = Math.min(0.1, (ts - (this.lastTs || ts)) / 1000);
    this.lastTs = ts;
    let consumed = this.state !== 'playing';
    if (this.state === 'playing') {
      this.handleGlobalKeys();
      const step = 1 / 60;
      this.acc += dtReal;
      let n = 0;
      while (this.acc >= step && n < 4) {
        if (!this.isPaused()) this.update(step);
        this.acc -= step;
        n++;
        // Presses and clicks count once, even when several steps run this frame.
        if (!consumed) {
          this.input.endFrame();
          consumed = true;
        }
      }
      if (n === 4) this.acc = 0;
      this.renderer.render();
    } else {
      this.renderer.renderTitle(dtReal);
    }
    this.ui.update();
    // If no simulation step ran this frame, keep presses for the next one.
    if (consumed) this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  isPaused(): boolean {
    return this.sim.kind === 'world' && (this.panel === 'pause' || this.panel === 'confirm' || this.panel === 'help' || this.panel === 'map' || this.panel === 'tech' || this.panel === 'crew');
  }

  private handleGlobalKeys(): void {
    const inp = this.input;
    if (inp.consume('Escape')) {
      if (this.panel === 'dead') return;
      this.setPanel(this.panel ? null : 'pause');
    }
    if (this.panel === 'pause' || this.panel === 'confirm' || this.panel === 'dead') return;
    const toggle = (code: string, p: Panel): void => {
      if (inp.consume(code)) this.setPanel(this.panel === p ? null : p);
    };
    toggle('KeyI', 'inventory');
    toggle('Tab', 'inventory');
    toggle('KeyC', 'craft');
    toggle('KeyM', 'map');
    toggle('KeyH', 'help');
    toggle('F1', 'help');
    if (this.sim.kind === 'world') {
      if (inp.consume('KeyB')) {
        if (this.panel === 'build') this.setPanel(null);
        else if (this.canBuild()) this.setPanel('build');
        else this.toast('Get aboard (or next to) your rig to build.', '#ffab40');
      }
      toggle('KeyR', 'rig');
      toggle('KeyT', 'tech');
      toggle('KeyP', 'crew');
    }
    if (inp.consume('Minus')) this.camera.userZoom = Math.max(0.5, this.camera.userZoom / 1.15);
    if (inp.consume('Equal')) this.camera.userZoom = Math.min(2.5, this.camera.userZoom * 1.15);
    if (inp.consume('KeyN')) {
      this.settings.muted = !this.settings.muted;
      this.audio.setMuted(this.settings.muted);
      this.saveSettings();
      this.toast(this.settings.muted ? 'Sound off' : 'Sound on');
    }
  }

  setPanel(p: Panel): void {
    if (this.panel === 'dead' && p !== null) return;
    this.panel = p;
    this.ui.onPanel(p);
    this.audio.play('ui');
  }

  private update(dt: number): void {
    const s = this.sim;
    s.time += dt;
    this.stats.playtime += dt;
    this.mouseWorld = this.camera.screenToWorld(this.input.mouse.x, this.input.mouse.y);
    if (s.kind === 'world') this.dayTime = (this.dayTime + dt / DAY_LENGTH) % 1;

    updateRigs(this, dt);
    this.carryBodies();
    if (this.panel === 'build') updateBuild(this, dt);
    updatePlayer(this, dt);
    updateEnemies(this, dt);
    updateProjectiles(this, dt);
    updateDrops(this, dt);
    updateHazards(this, dt);
    this.warzone?.update(dt);
    this.updateWeather(dt);
    s.particles.update(dt);

    // Camera
    const p = this.player;
    const rig = p.driving;
    const base = this.camera.baseZoom() * this.camera.userZoom;
    if (rig) {
      const fit = Math.min(this.camera.viewW / (rig.widthPx * 1.9), this.camera.viewH / (rig.heightPx * 3.2));
      this.camera.targetZoom = Math.min(base, Math.max(0.35, fit));
      this.camera.follow(rig.cx + rig.vx * 0.6, rig.cy - rig.heightPx * 0.3, dt, s.world.w * TILE, s.world.h * TILE);
    } else {
      this.camera.targetZoom = base;
      this.camera.follow(p.cx, p.cy - 20, dt, s.world.w * TILE, s.world.h * TILE);
    }

    // Zone tracking
    if (s.kind === 'world') {
      const zi = zoneIndexAt(Math.floor(p.cx / TILE));
      this.zone = ZONES[zi];
      if (zi !== this.lastZone) {
        if (this.lastZone !== -1) this.ui.zoneBanner(this.zone);
        this.lastZone = zi;
      }
    } else {
      this.zone = DEAD_ZONE;
    }

    this.timers.reveal -= dt;
    if (this.timers.reveal <= 0 && this.minimap) {
      this.timers.reveal = 0.4;
      this.minimap.reveal(Math.floor(p.cx / TILE), Math.floor(p.cy / TILE), 34);
      const pr = this.playerRig;
      if (pr && s.kind === 'world' && pr.radar > 0 && pr.powerRatio > 0.5) {
        this.minimap.reveal(Math.floor(pr.cx / TILE), Math.floor(pr.cy / TILE), pr.radar);
      }
    }

    if (s.kind === 'world') {
      this.timers.save += dt;
      if (this.timers.save > 60) {
        this.timers.save = 0;
        this.save();
      }
    }
    const pr = this.playerRig;
    this.audio.engine(pr?.vx ?? 0, !!pr && s.kind === 'world' && !!p.driving);
  }

  private updateWeather(dt: number): void {
    const w = this.weather;
    if (this.sim.kind !== 'world') {
      w.kind = null;
      w.strength = 0;
      return;
    }
    w.t -= dt;
    if (w.t <= 0) {
      if (w.kind) {
        w.kind = null;
        w.t = 90 + Math.random() * 120;
      } else {
        const storms: Record<string, string> = { dunes: 'Sandstorm', glass: 'Rad Storm', cryo: 'Blizzard', magma: 'Ash Fall', acid: 'Toxic Fog', rustbelt: 'Dust Storm' };
        w.kind = storms[this.zone.key] ?? null;
        w.t = 40 + Math.random() * 40;
        if (w.kind) this.toast(`${w.kind} rolling in!`, this.zone.accent);
      }
    }
    const target = w.kind ? 1 : 0;
    w.strength += (target - w.strength) * Math.min(1, dt * 0.5);
  }

  /** Bodies riding on (or inside) a rig move with it. */
  private carryBodies(): void {
    const s = this.sim;
    const bodies: { x: number; y: number; w: number; h: number; groundGrid: CollisionGrid | null }[] = [this.player, ...s.enemies, ...s.drops];
    for (const r of s.rigs) {
      const dx = r.x - r.prevX, dy = r.y - r.prevY;
      if (dx === 0 && dy === 0) continue;
      for (const b of bodies) {
        if (b === this.player && this.player.driving) continue;
        if (b.groundGrid === r || r.contains(b.x + b.w / 2, b.y + b.h / 2)) {
          b.x += dx;
          b.y += dy;
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Shared helpers used by systems                                      */
  /* ------------------------------------------------------------------ */

  gridsNear(b: { x: number; y: number; w: number; h: number }, pad = 64): CollisionGrid[] {
    const out: CollisionGrid[] = [this.sim.world];
    for (const r of this.sim.rigs) {
      if (b.x + b.w + pad > r.x && b.x - pad < r.x + r.widthPx && b.y + b.h + pad > r.y && b.y - pad < r.y + r.heightPx) out.push(r);
    }
    return out;
  }

  rigAt(wx: number, wy: number): Rig | null {
    for (let i = this.sim.rigs.length - 1; i >= 0; i--) {
      const r = this.sim.rigs[i];
      if (wx >= r.x && wx < r.x + r.widthPx && wy >= r.y && wy < r.y + r.heightPx) return r;
    }
    return null;
  }

  /** The player's rig if the player is aboard it (inside its bounds). */
  aboardRig(): Rig | null {
    const r = this.playerRig;
    if (!r || this.sim.kind !== 'world' || !this.sim.rigs.includes(r)) return null;
    return r.contains(this.player.cx, this.player.cy, 8) ? r : null;
  }

  canBuild(): boolean {
    const r = this.playerRig;
    if (!r || this.sim.kind !== 'world') return false;
    return r.contains(this.player.cx, this.player.cy, 12 * TILE);
  }

  /** Inventories usable for crafting/building: pack first, then rig cargo when aboard. */
  craftInvs(): Inventory[] {
    const invs = [this.player.inv];
    const r = this.playerRig;
    if (r && this.sim.kind === 'world' && r.contains(this.player.cx, this.player.cy, 12 * TILE)) invs.push(r.cargo);
    return invs;
  }

  stations(): Set<string> {
    const set = new Set<string>(['hand']);
    const r = this.playerRig;
    if (r && this.sim.kind === 'world' && r.contains(this.player.cx, this.player.cy, 12 * TILE)) {
      for (const m of r.modules) if (m.def.station) set.add(m.def.station);
    }
    return set;
  }

  toast(msg: string, color = '#e0e0e0'): void {
    this.ui.toast(msg, color);
  }

  spawnProjectile(o: {
    x: number; y: number; angle: number; speed: number; dmg: number; team: string; kind: ProjKind;
    life?: number; explosive?: number; pierce?: number; gravity?: number; tileDmg?: number; color?: string;
    knock?: number; visual?: boolean; homing?: { x: number; y: number } | null; sourceRig?: Rig | null; weapon?: string;
    srcMod?: number; turn?: number;
  }): Projectile {
    const p: Projectile = {
      x: o.x, y: o.y, vx: Math.cos(o.angle) * o.speed, vy: Math.sin(o.angle) * o.speed,
      life: o.life ?? 1, maxLife: o.life ?? 1, dmg: o.dmg, team: o.team, kind: o.kind,
      explosive: o.explosive ?? 0, pierce: o.pierce ?? 0, gravity: o.gravity ?? 0, tileDmg: o.tileDmg ?? 0,
      color: o.color ?? '#ffd180', knock: o.knock ?? 60, visual: o.visual ?? false,
      hits: (o.pierce ?? 0) > 0 ? new Set() : null, homing: o.homing ?? null, sourceRig: o.sourceRig ?? null,
      srcMod: o.srcMod ?? -1, turn: o.turn ?? 1, weapon: o.weapon ?? '', dead: false,
    };
    this.sim.projectiles.push(p);
    return p;
  }

  explode(x: number, y: number, radius: number, dmg: number, team: string, tileDmg: number, visual = false): void {
    explodeAt(this, x, y, radius, dmg, team, tileDmg, visual);
  }

  /** Damages the local player. `source === 'dot'` is continuous damage (hazards, liquids): no knockback or hit effects. */
  hurtPlayer(dmg: number, source: string, knockX = 0): void {
    const p = this.player;
    if (p.dead || p.invuln > 0) return;
    if (this.sim.kind === 'warzone') return; // server-authoritative there
    let real = source === 'dot' || source === 'void' ? dmg : dmg * (20 / (20 + p.armor));
    const pr = this.playerRig;
    if (pr && source !== 'void' && Math.hypot(pr.cx - p.cx, pr.cy - p.cy) < 40 * TILE) real *= pr.bonus.playerDmgTaken;
    p.hp -= real;
    p.regenDelay = 4;
    if (source !== 'dot') {
      p.hurtFlash = 0.25;
      p.vx += knockX;
      this.audio.play('hurt');
      this.camera.addShake(Math.min(8, real * 0.3));
      this.sim.particles.burst(p.cx, p.cy, 6, { color: '#c62828', speed: 90, life: 0.4, gravity: 400, size: 2 });
    } else if (p.hurtFlash <= 0) {
      p.hurtFlash = 0.12;
    }
    if (p.hp <= 0) this.killPlayer();
  }

  killPlayer(): void {
    const p = this.player;
    p.hp = 0;
    p.dead = true;
    p.deadTimer = 4;
    if (p.driving) p.driving.throttle = 0;
    p.driving = null;
    this.stats.deaths++;
    this.sim.particles.burst(p.cx, p.cy, 30, { color: '#c62828', speed: 200, life: 0.8, gravity: 500, size: 3 });
    // Lose half your loose scrap in the open world, Terraria style.
    const scrap = Math.floor(p.inv.count('scrap') / 2);
    if (scrap > 0) {
      p.inv.take('scrap', scrap);
      this.dropItem(p.cx, p.cy, { id: 'scrap', n: scrap });
    }
    this.setPanel('dead');
  }

  damageEnemy(e: Enemy, dmg: number, knockX: number, knockY = -80): void {
    if (e.dead) return;
    e.hp -= dmg;
    e.hurtFlash = 0.15;
    const heavy = e.kind === 'titan' ? 0 : e.kind === 'brute' || e.elite ? 0.3 : 1;
    e.vx += knockX * heavy;
    if (!e.flying && e.kind !== 'titan') e.vy += knockY * 0.5;
    this.sim.particles.burst(e.cx, e.cy, 4, { color: e.kind === 'titan' ? e.titan!.def.glow : '#ffab40', speed: 80, life: 0.3, size: 2 });
    if (e.hp > 0) return;
    e.dead = true;
    this.stats.kills++;
    const big = e.kind === 'titan';
    this.sim.particles.burst(e.cx, e.cy, big ? 60 : 18, { color: '#90a4ae', speed: big ? 320 : 160, life: big ? 1.2 : 0.6, gravity: 400, size: big ? 5 : 3 });
    this.sim.particles.burst(e.cx, e.cy, big ? 30 : 10, { color: '#ffab40', speed: 120, life: 0.4, glow: true, size: 2 });
    if (big) {
      for (let i = 0; i < 6; i++) this.sim.particles.explosion(e.x + Math.random() * e.w, e.y + Math.random() * e.h, 40);
      this.camera.addShake(16);
      this.audio.play('explode');
    }
    const rolls = big ? 6 : e.kind === 'brute' ? 3 : 1;
    const loot = [...rollLoot(big ? 'titan' : e.loot, Math.random, rolls + (big ? this.extraRolls() : 0))];
    if (e.elite) loot.push(...rollLoot('elite', Math.random, 1));
    if (big) {
      loot.push({ id: 'tech_parts', n: 6 + Math.floor(e.threat) + (this.playerRig?.bonus.techBonus ?? 0) });
      this.stats.titans++;
      this.toast(`${e.name} has fallen! Its remains are rich with salvage.`, '#ffd740');
      this.crewXp(() => true, 60);
    }
    for (const st of mergeStacks(loot)) this.dropItem(e.cx, e.cy, st);
    // Gunner XP for the crew member who manned the killing turret.
    if (e.lastHitMod >= 0 && this.playerRig) {
      const xp = big ? 120 : e.elite ? 20 : 6;
      this.crewXp((c) => c.post === e.lastHitMod, xp);
    }
    this.audio.play('break');
  }

  dropItem(x: number, y: number, stack: Stack): ItemDrop {
    const d: ItemDrop = {
      x: x - 5, y: y - 5, w: 10, h: 10, vx: (Math.random() - 0.5) * 140, vy: -120 - Math.random() * 100,
      grounded: false, groundGrid: null, dropTimer: 0, team: 'drop', stack: { ...stack }, age: 0,
    };
    this.sim.drops.push(d);
    return d;
  }

  /** Puts items in the pack; anything that doesn't fit drops at the player's feet. */
  giveItem(id: string, n: number, announce = true): void {
    const left = this.player.inv.add(id, n);
    if (left > 0) this.dropItem(this.player.cx, this.player.cy, { id, n: left });
    if (announce && n - left > 0) this.ui.pickupNote(id, n - left);
  }

  openCache(id: number): void {
    const c = this.sim.caches.find((k) => k.id === id);
    if (!c || c.opened) return;
    c.opened = true;
    this.opened.add(id);
    const rng = (() => {
      let i = 0;
      return () => hash1(id * 131 + i++, this.seed);
    })();
    const loot = mergeStacks(rollLoot(c.table, rng, 3 + this.extraRolls()));
    for (const st of loot) this.dropItem(c.x + 12, c.y - 12, st);
    this.audio.play('craft');
    this.sim.particles.burst(c.x + 12, c.y - 10, 16, { color: '#ffd740', speed: 120, life: 0.6, glow: true, size: 2 });
    this.toast('Salvage cache cracked open.', '#ffd740');
  }

  onRigWrecked(r: Rig): void {
    const diff = ZONES[r.zoneIndex]?.difficulty ?? 1;
    const outpost = (r.ai as { outpostId?: number } | null)?.outpostId;
    const loot = [...rollLoot('wreck', Math.random, 3 + diff + this.extraRolls()), ...rollLoot('wreck_rare', Math.random, Math.max(1, Math.floor(diff / 2)))];
    const tech = (outpost ? 4 + diff : 1 + Math.floor(diff / 2)) + (this.playerRig?.bonus.techBonus ?? 0);
    loot.push({ id: 'tech_parts', n: tech });
    for (const st of mergeStacks(loot)) this.dropItem(r.cx, r.cy, st);
    if (outpost) {
      this.cleared.add(outpost);
      this.stats.outposts++;
      this.toast(`${r.name} has fallen! Loot scattered. Salvage the wreck with your cutter.`, '#ffd740');
    } else {
      this.stats.rigs++;
      this.toast(`Raider rig "${r.name}" wrecked! Salvage it with your cutter.`, '#ffd740');
    }
    this.crewXp(() => true, outpost ? 80 : 40);
    // Sometimes a prisoner is freed from the wreck and offers to join.
    if (Math.random() < (outpost ? 0.7 : 0.25)) {
      const pr = this.playerRig;
      const c = makeCrew(randomRole(), Math.random, Math.random() < 0.3 ? 2 : 1);
      if (pr && pr.crew.length < pr.bunks) {
        pr.crew.push(c);
        this.toast(`Freed prisoner ${c.name} (${ROLES[c.role].name}) joins your crew!`, '#69f0ae');
      } else {
        this.recruits.unshift(c);
        this.recruits = this.recruits.slice(0, 5);
        this.toast(`Freed prisoner ${c.name} (${ROLES[c.role].name}) is waiting on the recruitment board: build bunks to take them in.`, '#80deea');
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Crew & research                                                     */
  /* ------------------------------------------------------------------ */

  /** Extra loot rolls from scavengers (fractional part is a chance). */
  extraRolls(): number {
    const v = this.playerRig?.bonus.lootRolls ?? 0;
    return Math.floor(v) + (Math.random() < v % 1 ? 1 : 0);
  }

  rollRecruits(): CrewMember[] {
    return Array.from({ length: 3 }, () => {
      const r = Math.random();
      return makeCrew(randomRole(), Math.random, r < 0.05 ? 3 : r < 0.3 ? 2 : 1);
    });
  }

  /** Gives XP to the player's crew that match `who`; announces level-ups. */
  crewXp(who: (c: CrewMember) => boolean, amount: number): void {
    const r = this.playerRig;
    if (!r) return;
    for (const c of r.crew) {
      if (!who(c)) continue;
      if (giveXp(c, amount)) {
        this.toast(`${c.name} (${ROLES[c.role].name}) reached level ${c.level}! Pick a perk in the Crew panel (P).`, ROLES[c.role].color);
        this.audio.play('craft');
      }
    }
  }

  hire(index: number): boolean {
    const r = this.playerRig;
    const c = this.recruits[index];
    if (!r || !c) return false;
    if (r.crew.length >= r.bunks) {
      this.toast('No free bunks. Build another Barracks.', '#ff5252');
      return false;
    }
    const cost = hireCost(c);
    const invs = this.craftInvs();
    if (!canAfford(invs, cost)) {
      this.toast('Not enough scrap or rations to hire.', '#ff5252');
      return false;
    }
    payCost(invs, cost);
    this.recruits.splice(index, 1);
    r.crew.push(c);
    this.toast(`${c.name} the ${ROLES[c.role].name} joins your crew.`, ROLES[c.role].color);
    this.timers.bonus = 0;
    return true;
  }

  research(id: string): boolean {
    const node = TECH_BY_ID.get(id);
    const r = this.playerRig;
    if (!node || !r || !canResearch(this.tech, node)) return false;
    const cost = researchCost(node, r.bonus.researchDiscount);
    const invs = this.craftInvs();
    if (!this.canBuild()) {
      this.toast('Research happens aboard your rig. Get back to it first.', '#ffab40');
      return false;
    }
    if (!canAfford(invs, cost)) {
      this.toast('Not enough materials or Salvaged Tech.', '#ff5252');
      this.audio.play('error');
      return false;
    }
    payCost(invs, cost);
    this.tech.add(id);
    this.timers.bonus = 0;
    this.toast(`Research complete: ${node.name}.`, '#80d8ff');
    this.audio.play('craft');
    this.crewXp((c) => c.role === 'scientist', 30);
    return true;
  }

  private installRigHooks(): void {
    Rig.hooks = {
      moduleDestroyed: (rig, m) => {
        const c = { x: rig.x + (m.x + m.def.w / 2) * TILE, y: rig.y + (m.y + m.def.h / 2) * TILE };
        this.sim.particles.explosion(c.x, c.y, 24);
        this.audio.play('explode', 0.7);
        this.camera.addShake(rig === this.playerRig ? 8 : 4);
        if (rig === this.playerRig) {
          this.toast(`${m.def.name} destroyed!`, '#ff5252');
          this.audio.play('alarm');
          if (m.def.key === 'cockpit') this.toast('Command Bridge lost: the rig cannot drive until you rebuild one (B).', '#ff5252');
          if (this.player.driving === rig && m.def.key === 'cockpit') this.player.driving = null;
        } else if (m.def.key === 'cockpit' && !rig.wrecked) {
          wreckRig(this, rig);
        }
      },
      tileDestroyed: (rig, tx, ty) => {
        this.sim.particles.burst(rig.x + (tx + 0.5) * TILE, rig.y + (ty + 0.5) * TILE, 6, { color: '#8d6e63', speed: 120, life: 0.5, gravity: 500, size: 2 });
      },
      drilled: (rig, drops) => {
        for (const st of drops) {
          const left = rig.cargo.add(st.id, st.n);
          if (left > 0) this.dropItem(rig.cx, rig.y, { id: st.id, n: left });
        }
        const fx = rig.vx >= 0 || rig.facing > 0 ? rig.x + rig.widthPx : rig.x;
        this.sim.particles.burst(fx, rig.y + rig.heightPx * 0.6, 14, { color: '#8d6e63', speed: 180, life: 0.6, gravity: 500, size: 3 });
        this.audio.play('break', 0.6);
      },
      landed: (rig, impact) => {
        if (rig === this.playerRig) this.camera.addShake(Math.min(14, impact / 60));
        this.sim.particles.burst(rig.cx, rig.y + rig.heightPx + 20, 20, { color: 'rgba(160,140,120,0.6)', speed: 160, life: 0.8, size: 5, drag: 3, shrink: false });
      },
    };
  }

  /** Current weapon/tool definition for UI. */
  heldItemName(): string {
    const s = this.player.held();
    return s ? getItem(s.id).name : '';
  }
}
