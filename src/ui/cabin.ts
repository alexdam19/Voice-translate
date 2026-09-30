import type { Game } from '../game/game';
import { ENEMIES } from '../game/enemyDefs';
import { isDocked } from '../game/campaign';
import { CLASSES } from '../game/classes';
import { CREW_SCALE, MODULES } from '../game/defs';
import { dumpHalon, fireSmoke, HALON_CD, HALON_WATER, HORN_CD, SAND_CD, setOverdrive, SMOKE_CD, soundHorn, throwSand } from '../game/systems/helm';
import { COMPARTMENTS, compIndex, compName, crawlersUp, damageState, FUEL_MAX, outsideTemp, SYSTEMS, TOROIDS, toroidOut, ZONES as ARMOR, type ArmorZone } from '../game/systems/titan';
import { DRIVE_MODES, driveSpec, specOf, type DriveMode } from '../game/systems/engine';
import { CRUDE_MAX, drillRate, fuelDrill, fuelRefinery, oilHere, refineRate, setDrill } from '../game/systems/fuel';
import { dispatchTeam, jobName, maxTeams, openJobs, stabilize, teamOn, type TeamKind } from '../game/systems/crewops';
import { clearMark, markTarget, orderMove } from '../game/systems/orders';
import { soldierSpots } from '../game/systems/soldiers';
import { AGENTS } from '../game/systems/comms';
import { mission } from '../game/campaign';
import { archFor, creatureSprite, lookFor } from '../render/px/creatures2d';
import { glowSprite } from '../render/px/fx2d';
import { hash2, rgb } from '../render/px/pixels';
import { paintTitan } from '../render/px/titan2d';
import { paintTitanFlat } from '../render/px/titanSprite';
import { shipView } from '../render/px/shipArt';
import { personSprite } from '../render/px/people';
import { OBS, OBS_COLOR, TER, TERRAIN } from '../shared/map';
import type { OpenWorld } from '../shared/mapgen';
import { oilWord } from '../shared/oil';
import { ZONES } from '../shared/zones';
import { h } from './dom';
import { pxMini } from './pixfont';
import { bevel, bracket, button, crack, dial, disc, makeNoise, plate, ringPx, rivet, shadeHex } from './cabinKit';
import { dialsModule, drawScreen, PAGES, reactorModule, supplyModule, type Page } from './cabinScreens';
import { buildHullShape, type HullShape } from './cabinHull';
import { tipFor } from './cabinTips';
import { agentImage } from './agents';

/**
 * The captain's cabin: the forward cab high on the Titan's bow, seen first person like the driving cab of a
 * locomotive or the bridge of a ship. In the middle is the windscreen, and the glass can show four things:
 *
 *  - VIEW   the wasteland out of the window (a voxel-space render of the real map: ground, rocks, cliffs,
 *           buildings, creatures, shell bursts, and your own ship round and below you: the deck, the turrets turning
 *           to their targets, the soldiers in their nests, the stacks with their flames, the toroids on their
 *           pylons). Drag to look round and to look down; with the GUNSIGHT armed a click marks a target.
 *  - DRONE  the spotter drone's live feed from overhead.
 *  - MAP    the whole Crater: zones, places, roads, the mission; click to plot a course.
 *  - DAMAGE CONTROL  the Titan's schematic, every part green to red; click one to send a repair team.
 *
 * Either side of the glass the analytics screens (click to turn their pages) over the fuel plant (drill lever,
 * refinery switch, crude and oil gauges) and the tactical box (glass mode, gunsight, smoke). Overhead: the compass,
 * the lamps and breakers and small dials, and the drive row: the drive-mode selector, the preheater, sanders, diff
 * lock and plough, the engine's CHARGE gauge and the INFO switch. Below: the console (radar, dials, systems panel,
 * toroids and brake, the three overdrive stages and ALL STOP, the throttle, supplies, reactor) and the steering
 * lever. Hovering anything (or tapping it with INFO on) puts a plate on the glass saying exactly what it does.
 *
 * At speed the cab shakes and the ground rushes past in streaks; the faster she goes the harder it rattles.
 */

export interface CabinActions {
  close(): void;
  vitals(): void;
  overdrive(): void;
  warp(): void;
  stop(): void;
  camp(): void;
  toast(text: string, color?: string): void;
  sound(name: string): void;
  /** The tactical view rendered for the drone camera (and how many screen pixels one of its pixels covers). */
  droneFeed(): { canvas: HTMLCanvasElement; scale: number } | null;
  /** Paints the whole Crater map into a square of `size` pixels. */
  drawWorldMap?(c: CanvasRenderingContext2D, size: number): void;
}

interface Hit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Flash {
  x: number;
  y: number;
  z: number;
  r: number;
  color: string;
  t: number;
  max: number;
}

const LIP = 16;
const MOD_H = 102;
/** The overhead panel: the compass and buttons, then status lamps, breakers and small dials, then the drive row. */
const HEAD = 44;
/** Console modules and their widths, in the order they're laid out (they wrap onto more rows on narrow screens). */
const MODS: [string, number][] = [['radar', 88], ['dials', 128], ['panel', 112], ['engines', 50], ['drive', 56], ['throttle', 48], ['supply', 84], ['reactor', 68]];
/** The fuel plant and tactical boxes: in the side wings, or among the modules when there are no wings. */
const BOXES: [string, number][] = [['fuel', 84], ['tact', 76]];
const SCR_H = 56;
const BOX_H = 82;

export type GlassMode = 'view' | 'cam' | 'map' | 'dc';

interface Layout {
  rows: [string, number][][];
  rowW: number;
  screens: number;
  scrH: number;
  dashH: number;
  /** Width of each side wing (0: no wings, the screens sit above the console). */
  wing: number;
  perWing: number;
}

function rowsFor(mods: [string, number][], W: number): { rows: [string, number][][]; rowW: number } | null {
  const rows: [string, number][][] = [];
  let cur: [string, number][] = [];
  let cw = 0;
  for (const m of mods) {
    const add = (cur.length ? 2 : 0) + m[1];
    if (cur.length && cw + add > W - 8) {
      rows.push(cur);
      cur = [];
      cw = 0;
    }
    cw += (cur.length ? 2 : 0) + m[1];
    cur.push(m);
  }
  rows.push(cur);
  const widths = rows.map((r) => r.reduce((a, [, w]) => a + w, 0) + (r.length - 1) * 2);
  const rowW = Math.max(...widths);
  return rowW > W - 8 ? null : { rows, rowW };
}

/**
 * Lays the cab out for a canvas W x H. Wide enough: side wings either side of the glass (screens stacked over the
 * fuel and tactical boxes) and one console row, so the glass is tall. Otherwise the screen bank sits over the
 * console and the boxes go in with the modules.
 */
function layoutFor(W: number, H: number): Layout | null {
  const bottom = rowsFor(MODS, W);
  if (bottom && bottom.rows.length === 1) {
    const dashH = LIP + MOD_H;
    const winH = H - HEAD - dashH;
    const wing = W >= 900 ? 150 : W >= 620 ? 124 : 0;
    const perWing = wing ? Math.floor((winH - BOX_H - 4) / (SCR_H + 3)) : 0;
    if (wing && perWing >= 1 && W - wing * 2 >= 300 && winH >= 170) return { rows: bottom.rows, rowW: bottom.rowW, screens: perWing * 2, scrH: SCR_H, dashH, wing, perWing };
  }
  const all = rowsFor([...MODS, ...BOXES], W);
  if (!all) return null;
  const screens = Math.max(1, Math.min(4, Math.floor((all.rowW + 2) / 118)));
  const scrH = H >= 400 ? 78 : 66;
  return { rows: all.rows, rowW: all.rowW, screens, scrH, dashH: LIP + scrH + all.rows.length * MOD_H, wing: 0, perWing: 0 };
}
/** How far the windscreen sees (m). */
const ZFAR = 1500;
/** Obstacles stand a little taller than the map says, so the skyline reads from the cab. */
const HX = 1.3;
const RADAR_RANGES = [600, 1200, 2400];

/** A colour packed for a Uint32 view of little-endian RGBA pixels. */
const pack = (r: number, g: number, b: number): number => (255 << 24) | (Math.max(0, Math.min(255, b | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, r | 0));
const mix = (a: number[], b: number[], t: number): number[] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const FOG_LV = 16;
const SHADES = 8;
/** Ground and obstacle colour index: terrain types first, then obstacles. */
const TER_N = TERRAIN.length;
const COL_N = TER_N + OBS_COLOR.length;

export class Cabin {
  readonly root: HTMLDivElement;
  isOpen = false;
  /** Steering from the console lever (-1 port .. 1 starboard); springs back when you let go. */
  steer = 0;
  private cv: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  private win = document.createElement('canvas');
  private wx = this.win.getContext('2d')!;
  private img: ImageData | null = null;
  private buf = new Uint32Array(0);
  private depth = new Float32Array(0);
  private W = 0;
  private H = 0;
  private lay: Layout = layoutFor(640, 400)!;
  /** The page each screen shows (click to turn it). */
  private pages: Page[] = [...PAGES];
  /** The lucky charm hanging from the roof: its swing (radians) and swing rate. */
  private charm = { a: 0, w: 0, lastSpeed: 0, lastYaw: 0 };
  private hits: Hit[] = [];
  private drag: { id: string; pid: number; x0: number; y0: number; v0: number; p0: number; moved: boolean } | null = null;
  private hoverId = '';
  /** Looking around from the cab (radians off the bow). */
  private look = 0;
  private radarI = 1;
  private hull: { d: Uint8ClampedArray; w: number; h: number; cx: number; cy: number; ppm: number; t: number } | null = null;
  private flashes: Flash[] = [];
  private time = 0;
  private press: Record<string, number> = {};
  /** Palette for the current zone: [colour index * FOG_LV * 3 + fog * 3 + (0 flat, 1 face, 2 edge)] per shade. */
  private pal = new Uint32Array(COL_N * SHADES * FOG_LV * 3);
  private palKey = '';
  private sky: number[] = [128, 128, 128];
  private fogC: number[] = [128, 128, 128];
  private sun: number[] = [255, 255, 255];
  private farCache = new Map<number, number>();
  private farFor: unknown = null;
  private ticker: { text: string; color: string; t: number }[] = [];
  private noise: HTMLCanvasElement;
  private spriteData = new WeakMap<HTMLCanvasElement, ImageData>();
  private hitT = 0;
  private lastHp = -1;
  /** What the glass shows: the view out, the drone camera, the map, damage control. */
  glass: GlassMode = 'view';
  /** The gunsight: armed, a click on the glass marks a target. */
  aimOn = false;
  /** INFO switch: taps explain the controls instead of working them. */
  infoOn = false;
  /** The drone camera's zoom (multiplies the tactical view's distance). */
  camZoom = 1.6;
  /** Looking down (px the horizon has risen). */
  private pitch = 0;
  private mouse = { x: -1, y: -1 };
  private hoverT = 0;
  /** An explanation plate put up by an INFO tap, and how long it stays. */
  private tipLock: { id: string; t: number } | null = null;
  private shape: HullShape | null = null;
  private shapeT = -1;
  /** CSS pixels per canvas pixel. */
  private scaleK = 1;
  private mapCanvas: HTMLCanvasElement | null = null;
  private mapT = -1;

  constructor(parent: HTMLElement, private act: CabinActions) {
    this.root = h('div', 'cabin');
    this.cv = document.createElement('canvas');
    this.x = this.cv.getContext('2d')!;
    this.root.appendChild(this.cv);
    parent.appendChild(this.root);
    this.noise = makeNoise();
    this.cv.addEventListener('pointerdown', (e) => this.down(e));
    this.cv.addEventListener('pointermove', (e) => this.move(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) this.cv.addEventListener(ev, (e) => this.up(e as PointerEvent));
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
    this.cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.glass === 'cam') this.camZoom = Math.max(0.6, Math.min(4, this.camZoom * (e.deltaY > 0 ? 1.12 : 1 / 1.12)));
    }, { passive: false });
    window.addEventListener('resize', () => this.isOpen && this.resize());
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.root.style.display = 'block';
    this.look = 0;
    this.resize();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.style.display = 'none';
    this.drag = null;
    this.steer = 0;
    this.flashes.length = 0;
  }

  /** A line on the teletype strip under the windscreen. */
  message(text: string, color = '#ffb030'): void {
    this.ticker.push({ text, color, t: 7 });
    while (this.ticker.length > 3) this.ticker.shift();
  }

  private resize(): void {
    const w = window.innerWidth, hh = window.innerHeight;
    // The biggest pixels that still fit the whole console with a decent windscreen above it.
    let s = 1;
    let lay: Layout | null = null;
    for (let k = 4; k >= 1; k--) {
      const L = layoutFor(Math.ceil(w / k), Math.ceil(hh / k));
      if (L && Math.ceil(hh / k) - HEAD - L.dashH >= Math.max(90, Math.ceil(hh / k) * 0.3)) {
        s = k;
        lay = L;
        break;
      }
    }
    if (!lay) lay = layoutFor(Math.ceil(w), Math.ceil(hh)) ?? { rows: [MODS], rowW: 628, screens: 0, scrH: 0, dashH: LIP + MOD_H, wing: 0, perWing: 0 };
    this.lay = lay;
    this.scaleK = s;
    this.W = Math.ceil(w / s);
    this.H = Math.ceil(hh / s);
    this.cv.width = this.W;
    this.cv.height = this.H;
    this.cv.style.width = `${this.W * s}px`;
    this.cv.style.height = `${this.H * s}px`;
    const wh = Math.max(20, this.winB - HEAD);
    this.win.width = this.VW;
    this.win.height = wh;
    this.img = this.wx.createImageData(this.VW, wh);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.depth = new Float32Array(this.VW * wh);
  }

  /** The glass: its left edge and width (between the side wings). */
  private get VX(): number {
    return this.lay.wing;
  }

  private get VW(): number {
    return this.W - this.lay.wing * 2;
  }

  private get dashH(): number {
    return this.lay.dashH;
  }

  /** Bottom of the windscreen. */
  private get winB(): number {
    return this.H - this.dashH;
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  private pt(e: PointerEvent): [number, number] {
    const r = this.cv.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * this.W, ((e.clientY - r.top) / r.height) * this.H];
  }

  private hitAt(px: number, py: number): Hit | null {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const k = this.hits[i];
      if (px >= k.x && py >= k.y && px < k.x + k.w && py < k.y + k.h) return k;
    }
    return null;
  }

  private game: Game | null = null;

  private down(e: PointerEvent): void {
    e.preventDefault();
    const g = this.game;
    if (!g) return;
    const [px, py] = this.pt(e);
    const k = this.hitAt(px, py);
    if (!k) return;
    this.press[k.id] = 0.18;
    // INFO on: a tap explains the control instead of working it.
    if (this.infoOn && k.id !== 'info' && k.id !== 'glass') {
      this.tipLock = { id: k.id, t: 7 };
      this.act.sound('ui');
      return;
    }
    if (k.id === 'throttle' || k.id === 'steer' || k.id === 'brake' || k.id === 'glass') {
      this.cv.setPointerCapture(e.pointerId);
      this.drag = { id: k.id, pid: e.pointerId, x0: px, y0: py, v0: this.look, p0: this.pitch, moved: false };
      if (k.id !== 'glass') this.dragTo(px, py);
      if (k.id === 'throttle') this.act.sound('ui');
      return;
    }
    this.click(k.id, g);
  }

  private move(e: PointerEvent): void {
    const [px, py] = this.pt(e);
    this.mouse = { x: px, y: py };
    if (this.drag && this.drag.pid === e.pointerId) {
      this.dragTo(px, py);
      return;
    }
    const k = this.hitAt(px, py);
    const id = k?.id ?? '';
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.hoverT = 0;
      this.cv.style.cursor = !id ? 'default' : id === 'glass' ? (this.aimOn && this.glass === 'view' ? 'crosshair' : this.glass === 'map' ? 'pointer' : 'grab') : 'pointer';
    }
  }

  private up(e: PointerEvent): void {
    if (!this.drag || this.drag.pid !== e.pointerId) return;
    const d = this.drag;
    if (d.id === 'steer') this.steer = 0;
    this.drag = null;
    if (d.id === 'glass' && !d.moved && this.game) this.glassClick(this.game, d.x0, d.y0);
  }

  private dragTo(px: number, py: number): void {
    const g = this.game;
    const d = this.drag;
    if (!g || !d) return;
    if (d.id === 'throttle') {
      const r = this.rects.throttleSlot;
      if (!r) return;
      let v = 1 - ((py - r.y) / r.h) * 1.5;
      v = Math.max(-0.5, Math.min(1, v));
      // Notches every quarter pull the lever in; stop has a proper detent.
      const q = Math.round(v * 4) / 4;
      if (Math.abs(v - q) < 0.045) v = q;
      if (Math.abs(v) < 0.07) v = 0;
      if (v !== g.helm.lever && Math.round(v * 4) !== Math.round(g.helm.lever * 4)) this.act.sound('ui');
      g.helm.lever = v;
      g.player.path = [];
      g.player.goal = null;
    } else if (d.id === 'brake') {
      const r = this.rects.brakeSlot;
      if (!r) return;
      let v = Math.max(0, Math.min(1, (px - r.x) / r.w));
      if (v < 0.08) v = 0;
      if (Math.round(v * 4) !== Math.round(g.helm.brake * 4)) this.act.sound('ui');
      g.helm.brake = v;
      g.helm.brakeSet = v > 0;
      // Brakes on cut the power (the lever drops to stop).
      if (v > 0 && g.helm.lever > 0) g.helm.lever = 0;
    } else if (d.id === 'steer') {
      const r = this.rects.steerSlot;
      if (!r) return;
      this.steer = Math.max(-1, Math.min(1, ((px - (r.x + r.w / 2)) / (r.w / 2)) * 1.15));
      if (Math.abs(this.steer) < 0.08) this.steer = 0;
    } else if (d.id === 'glass') {
      // Drag to look round (sideways) and up or down.
      if (Math.abs(px - d.x0) + Math.abs(py - d.y0) > 4) d.moved = true;
      if (!d.moved || this.glass !== 'view') return;
      this.look = d.v0 - ((px - d.x0) / this.VW) * 2.2;
      this.look = Math.atan2(Math.sin(this.look), Math.cos(this.look));
      const wh = this.winB - HEAD;
      this.pitch = Math.max(-wh * 0.12, Math.min(wh * 0.6, d.p0 - (py - d.y0)));
    }
  }

  private click(id: string, g: Game): void {
    const hm = g.helm;
    const p = g.player;
    switch (id) {
      case 'exit':
        this.act.close();
        return;
      case 'vitals':
        this.act.vitals();
        return;
      case 'lookL':
        this.look -= Math.PI / 2;
        break;
      case 'lookR':
        this.look += Math.PI / 2;
        break;
      case 'lookF':
        this.look = 0;
        break;
      case 'radar':
        this.radarI = (this.radarI + 1) % RADAR_RANGES.length;
        break;
      case 'scr0':
      case 'scr1':
      case 'scr2':
      case 'scr3': {
        // Turn the screen to the next page no other screen is showing.
        const i = Number(id.slice(3));
        const shown = new Set(this.pages.slice(0, this.lay.screens));
        let k = PAGES.indexOf(this.pages[i]);
        for (let n = 0; n < PAGES.length; n++) {
          k = (k + 1) % PAGES.length;
          if (!shown.has(PAGES[k])) break;
        }
        this.pages[i] = PAGES[k];
        break;
      }
      case 'lights':
        hm.lights = !hm.lights;
        this.act.toast(hm.lights ? 'FLOODLIGHTS ON: +12% sight range, a trickle of fuel.' : 'Floodlights off.', hm.lights ? '#fff59d' : '#b0bec5');
        break;
      case 'pumps':
        hm.pumps = !hm.pumps;
        this.act.toast(hm.pumps ? 'BILGE PUMPS BOOSTED: triple pumping, more fuel.' : 'Pumps back to normal.', hm.pumps ? '#40c4ff' : '#b0bec5');
        break;
      case 'arm':
        hm.safe = !hm.safe;
        this.act.toast(hm.safe ? 'MASTER ARM SAFE: the guns hold fire.' : 'MASTER ARM: WEAPONS FREE.', hm.safe ? '#ffab40' : '#76ff03');
        break;
      case 'divert':
        if (!hm.divert && p.stats.shield <= 0) {
          this.act.toast('No shield generator aboard to take power from.', '#ff8a80');
          this.act.sound('nope');
          return;
        }
        hm.divert = !hm.divert;
        this.act.toast(hm.divert ? 'SHIELD POWER TO THE DRIVE: +8% speed, the shield drains.' : 'Shield generator back online.', hm.divert ? '#18ffff' : '#b0bec5');
        break;
      case 'horn': {
        const n = soundHorn(g);
        if (n < 0) this.act.toast(`The horn's compressor is still charging (${Math.ceil(hm.hornCd)}s).`, '#ff8a80');
        else this.act.toast(n ? `AIR HORN: ${n} creature${n > 1 ? 's' : ''} flinched.` : 'AIR HORN. Nothing out there to scare.', '#ffd740');
        return;
      }
      case 'halon': {
        const n = dumpHalon(g);
        if (n === -1) this.act.toast(`Halon bottles refilling (${Math.ceil(hm.halonCd)}s).`, '#ff8a80');
        else if (n === -2) this.act.toast(`Halon needs ${HALON_WATER} water in the tanks.`, '#ff8a80');
        else this.act.toast(n ? `HALON DUMP: ${n} fire${n > 1 ? 's' : ''} smothered. The air is thinner.` : 'Halon dumped, but nothing was burning.', '#b3e5fc');
        return;
      }
      case 'camp':
        this.act.camp();
        return;
      case 'warp':
        this.act.warp();
        return;
      case 'od1':
      case 'od2':
      case 'od3': {
        const n = Number(id.slice(2));
        const r = setOverdrive(g, hm.overdrive && hm.odStage === n ? 0 : n);
        this.act.toast(r.msg, r.ok ? (hm.overdrive ? '#ff9100' : '#b0bec5') : '#ff8a80');
        this.act.sound(r.ok ? (hm.overdrive ? 'levelup' : 'ui') : 'nope');
        return;
      }
      case 'mode_eco':
      case 'mode_normal':
      case 'mode_sport':
      case 'mode_crawl': {
        hm.mode = id.slice(5) as DriveMode;
        if (hm.overdrive && driveSpec(g, p).odStages <= 0) hm.overdrive = false;
        const m = DRIVE_MODES.find((k) => k.key === hm.mode)!;
        this.message(`DRIVE MODE ${m.name}`, '#ffd740');
        break;
      }
      case 'preheat':
        hm.preheat = !hm.preheat;
        this.message(hm.preheat ? 'PREHEATER ON: THE BLOCK STAYS WARM' : 'PREHEATER OFF', hm.preheat ? '#ffb040' : '#b0bec5');
        break;
      case 'sand': {
        const r = throwSand(g);
        if (r < 0) this.act.toast(`The sand hoppers are refilling (${Math.ceil(hm.sandCd)}s).`, '#ff8a80');
        else this.message('SANDERS: SAND UNDER THE CRAWLERS', '#e0c080');
        break;
      }
      case 'diff':
        hm.diffLock = !hm.diffLock;
        this.message(hm.diffLock ? 'DIFF LOCK ON: MORE GRIP, WIDER TURNS' : 'DIFF LOCK OFF', '#ffd740');
        break;
      case 'plow':
        hm.plow = !hm.plow;
        this.message(hm.plow ? 'DOZER PLOUGH DOWN' : 'DOZER PLOUGH UP', '#ffd740');
        break;
      case 'smoke': {
        const n = fireSmoke(g);
        if (n < 0) this.act.toast(`Smoke dischargers reloading (${Math.ceil(hm.smokeCd)}s).`, '#ff8a80');
        else this.message(`SMOKE! ${n} LOST TRACK OF US`, '#cfd8dc');
        return;
      }
      case 'info':
        this.infoOn = !this.infoOn;
        this.tipLock = this.infoOn ? { id: 'info', t: 5 } : null;
        break;
      case 'aim':
        this.aimOn = !this.aimOn;
        if (this.aimOn) this.glass = 'view';
        this.message(this.aimOn ? 'GUNSIGHT ARMED: CLICK THE GLASS TO MARK A TARGET' : 'GUNSIGHT SAFE', this.aimOn ? '#ff5252' : '#b0bec5');
        break;
      case 'g_view':
      case 'g_cam':
      case 'g_map':
      case 'g_dc':
        this.glass = id.slice(2) as GlassMode;
        if (this.glass !== 'view') this.aimOn = false;
        this.mapT = -1;
        break;
      case 'camin':
        this.camZoom = Math.max(0.6, this.camZoom / 1.25);
        break;
      case 'camout':
        this.camZoom = Math.min(4, this.camZoom * 1.25);
        break;
      case 'clear':
        clearMark(g);
        break;
      case 'drill': {
        const r = setDrill(g, !g.titan.drillWant);
        this.act.toast(r.msg, r.ok ? '#ffd740' : '#ff8a80');
        if (!r.ok) {
          this.act.sound('nope');
          return;
        }
        break;
      }
      case 'refine':
        if (!fuelRefinery(g)) {
          this.act.toast('No Automatic Refinery aboard: build one in BASE > Shop > Resources.', '#ff8a80');
          this.act.sound('nope');
          return;
        }
        hm.refine = !hm.refine;
        this.message(hm.refine ? 'REFINERY AUTO: CRACKING CRUDE' : 'REFINERY OFF', '#ffd740');
        break;
      case 'dc_auto':
        g.autoRepair = !g.autoRepair;
        this.message(g.autoRepair ? 'DAMAGE CONTROL AUTO' : 'DAMAGE CONTROL MANUAL', '#b2ff59');
        break;
      case 'dc_stab': {
        const n = stabilize(g);
        this.act.toast(n ? `STABILIZE: ${n} team${n > 1 ? 's' : ''} sent.` : 'No teams free, or nothing to fix.', n ? '#b2ff59' : '#ff8a80');
        break;
      }
      case 'tor0':
      case 'tor1':
      case 'tor2':
      case 'tor3': {
        const i = Number(id.slice(3));
        hm.toroids[i] = !hm.toroids[i];
        this.message(`${TOROIDS[i].name.toUpperCase()} ${hm.toroids[i] ? 'LIT' : 'SHUT DOWN'}`, hm.toroids[i] ? '#80ffc0' : '#ff9060');
        break;
      }
      case 'stop':
        this.act.stop();
        this.act.sound('alarm');
        return;
      default:
        if (id.startsWith('dc:')) {
          const [, kind, key] = id.split(':');
          const why = dispatchTeam(g, kind as TeamKind, key);
          const name = jobName(kind as TeamKind, key, g);
          this.act.toast(why ? `${name}: ${why}` : `Damage control: team sent to ${name}.`, why ? '#ff8a80' : '#b2ff59');
          if (why) this.act.sound('nope');
          return;
        }
    }
    this.act.sound('ui');
  }

  /** A click on the glass (not a drag): mark a target through the gunsight, or plot a course on the map. */
  private glassClick(g: Game, px: number, py: number): void {
    if (this.glass === 'view' && this.aimOn) {
      const pt = this.pickGround(g, px, py);
      if (!pt) {
        this.act.sound('nope');
        return;
      }
      const d = markTarget(g, pt.x, pt.y);
      this.message(`TARGET MARKED ${Math.round(d)}M: ALL GUNS ON IT`, '#ff5252');
      this.act.sound('ui');
      return;
    }
    if (this.glass === 'map' && this.mapRect) {
      const r = this.mapRect;
      if (px < r.x || py < r.y || px >= r.x + r.s || py >= r.y + r.s) return;
      const size = g.map.size;
      const x = ((px - r.x) / r.s) * size, y = ((py - r.y) / r.s) * size;
      if (orderMove(g, x, y)) {
        this.message(`COURSE PLOTTED: ${Math.round(Math.hypot(x - g.player.x, y - g.player.y) / 100) / 10} KM`, '#40c4ff');
        this.act.sound('ui');
      }
    }
  }

  /** The world point behind a pixel of the glass (from the depth buffer), or null for sky and your own deck. */
  private pickGround(g: Game, px: number, py: number): { x: number; y: number } | null {
    const lx = Math.floor(px - this.VX), ly = Math.floor(py - HEAD);
    const WH = this.win.height;
    if (lx < 0 || ly < 0 || lx >= this.VW || ly >= WH) return null;
    const z = this.depth[ly * this.VW + lx];
    if (!(z < 1e8)) return null;
    const cam = this.camera(g);
    const f = this.focal();
    const k = (lx + 0.5 - this.VW / 2) / f;
    const fx = Math.cos(cam.yaw), fy = Math.sin(cam.yaw);
    const x = cam.x + (fx - fy * k) * z, y = cam.y + (fy + fx * k) * z;
    if (g.player.hits(x, y, 2)) return null;
    return { x, y };
  }

  private mapRect: { x: number; y: number; s: number } | null = null;

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  private rects: { throttleSlot?: Hit; steerSlot?: Hit; brakeSlot?: Hit } = {};

  render(g: Game, dt: number): void {
    if (!this.isOpen) return;
    if (this.game !== g) this.game = g;
    if (!this.img || this.cv.width !== this.W) this.resize();
    this.time += dt;
    this.hoverT += dt;
    for (const k of Object.keys(this.press)) this.press[k] -= dt;
    for (const m of this.ticker) m.t -= dt;
    this.ticker = this.ticker.filter((m) => m.t > 0);
    if (this.tipLock && (this.tipLock.t -= dt) <= 0) this.tipLock = null;
    // Take a hit: the cab lights flash red.
    const p = g.player;
    if (this.lastHp >= 0 && p.hp < this.lastHp - p.stats.maxHp * 0.004) this.hitT = 0.35;
    this.lastHp = p.hp;
    this.hitT = Math.max(0, this.hitT - dt);
    this.takeFx(g, dt);
    this.hits = [];
    this.rects = {};
    const c = this.x;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.W, this.H);
    const VX = this.VX, VW = this.VW, B = this.winB;
    // The glass first (its click target under everything drawn on it).
    this.hit('glass', VX, HEAD, VW, B - HEAD);
    c.save();
    c.beginPath();
    c.rect(VX, HEAD, VW, B - HEAD);
    c.clip();
    if (this.glass === 'view') {
      this.drawWorld(g);
      // At speed the cab rattles (more over rough ground) and the ground streams past.
      const v = Math.abs(p.speed);
      const rough = v > 3 ? Math.min(2, (v / 40) * (1.4 - Math.min(1, p.trac))) : 0;
      const shake = Math.round(Math.sin(this.time * 31) * rough + Math.sin(this.time * 13.3) * rough * 0.5);
      c.drawImage(this.win, VX, HEAD + shake);
      c.translate(VX, 0);
      if (v > 18 && Math.abs(this.look) < 0.6 && this.pitch < 40) this.streaks(v);
      this.drawNose(g);
      this.drawExhaust(g);
      this.drawFlashes(g);
      this.drawGlassHud(g);
      c.translate(-VX, 0);
      if (this.aimOn) this.drawReticle(g);
    } else if (this.glass === 'cam') this.drawDrone(g);
    else if (this.glass === 'map') this.drawMap(g);
    else this.drawDC(g);
    c.restore();
    this.drawFrame(g);
    this.drawComm(g);
    if (this.glass === 'view') {
      c.save();
      c.translate(VX, 0);
      this.cabDetails(g, dt);
      c.restore();
    }
    this.drawWings(g);
    this.drawDash(g);
    this.drawTip(g);
    if (this.hitT > 0) {
      c.fillStyle = `rgba(255,20,0,${(this.hitT / 0.35) * 0.22})`;
      c.fillRect(0, 0, this.W, this.H);
    }
  }

  /** Speed streaks: dashes flying out from the vanishing point along the ground, faster and thicker with speed. */
  private streaks(v: number): void {
    const c = this.x;
    const W = this.VW;
    const hz = this.horizon() + HEAD;
    const k = Math.min(1, (v - 18) / 50);
    const n = Math.round(10 + 26 * k);
    const vx = W / 2 - (this.look * W) / 2.2;
    for (let i = 0; i < n; i++) {
      const a = (hash2(i, 7, 3) - 0.5) * Math.PI * 0.9;
      const ph = (this.time * (0.6 + v / 40) + hash2(i, 3, 9)) % 1;
      const d0 = 8 + ph * ph * W * 0.7;
      const len = 3 + ph * 20 * k;
      const ca = Math.sin(a), sa = Math.cos(a);
      const x1 = vx + ca * d0, y1 = hz + sa * d0 * 0.45;
      if (y1 < hz + 2 || y1 > this.winB) continue;
      const x2 = vx + ca * (d0 + len), y2 = hz + sa * (d0 + len) * 0.45;
      c.strokeStyle = `rgba(255,244,220,${(0.18 + 0.5 * k) * ph})`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
      c.lineTo(Math.round(x2) + 0.5, Math.round(Math.min(this.winB, y2)) + 0.5);
      c.stroke();
    }
  }

  /** Explosions and flashes from the world's effect queue (the tactical view isn't drawing, so the cab eats them). */
  private takeFx(g: Game, dt: number): void {
    for (const e of g.fx) {
      if (e.t === 'boom') this.flashes.push({ x: e.x, y: e.y, z: 2, r: Math.max(3, e.r * 1.4), color: e.color.length === 7 ? e.color : '#ffab40', t: e.big ? 0.7 : 0.35, max: e.big ? 0.7 : 0.35 });
      else if (e.t === 'nuke') this.flashes.push({ x: e.x, y: e.y, z: 20, r: e.r * 1.2, color: '#fff3c4', t: 1.6, max: 1.6 });
      else if (e.t === 'strike') this.flashes.push({ x: e.x, y: e.y, z: 3, r: 6, color: e.color, t: 0.25, max: 0.25 });
      else if (e.t === 'muzzle' && Math.random() < 0.3) this.flashes.push({ x: e.x, y: e.y, z: 30, r: 2 + e.size, color: '#fff59d', t: 0.06, max: 0.06 });
      else if (e.t === 'shake') this.hitT = Math.max(this.hitT, Math.min(0.35, e.amt * 0.2));
    }
    g.fx.length = 0;
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
    if (this.flashes.length > 160) this.flashes.splice(0, this.flashes.length - 160);
  }

  /* ---------------------------------------------------------------- */
  /* The view out of the windscreen                                    */
  /* ---------------------------------------------------------------- */

  /** Camera: at the front of the bow cab, just above the roof line, looking out along the hull. */
  private camera(g: Game): { x: number; y: number; h: number; yaw: number; lx: number; roof: number } {
    const p = g.player;
    const lx = p.stats.length / 2 - 3;
    const c = p.toWorld(lx, 0);
    const roof = p.deckY(0);
    return { x: c.x, y: c.y, h: roof + 7, yaw: p.rot + this.look, lx, roof };
  }

  private focal(): number {
    return this.VW / 2 / Math.tan((47 * Math.PI) / 180);
  }

  private horizon(): number {
    return Math.round(this.win.height * 0.3) - Math.round(this.pitch);
  }

  /** Rebuilds the colour tables when the zone (sky, haze) or the weather changes. */
  private palette(g: Game): void {
    const z = ZONES[g.map.zoneAt(g.player.x, g.player.y)] ?? ZONES[0];
    const storm = g.weather.phase === 'active' ? 1 : 0;
    const key = `${z.key}|${storm}|${g.helm.lights ? 1 : 0}`;
    if (key === this.palKey) return;
    this.palKey = key;
    const dark = storm ? 0.62 : 1;
    this.sky = rgb(z.sky).map((v) => v * dark);
    this.fogC = rgb(z.fog).map((v) => v * dark);
    this.sun = rgb(z.sun);
    const pal = this.pal;
    for (let ci = 0; ci < COL_N; ci++) {
      const hex = ci < TER_N ? TERRAIN[ci]?.color : OBS_COLOR[ci - TER_N];
      const base = hex ? rgb(hex) : [90, 80, 70];
      for (let sh = 0; sh < SHADES; sh++) {
        const k = (0.86 + (sh / (SHADES - 1)) * 0.26) * dark;
        for (let f = 0; f < FOG_LV; f++) {
          const ft = Math.min(0.92, Math.pow(f / (FOG_LV - 1), 1.25) * 0.95);
          for (let kind = 0; kind < 3; kind++) {
            const m = kind === 1 ? 0.66 : kind === 2 ? 1.28 : 1;
            const c = mix(base.map((v) => v * k * m), this.fogC, ft);
            pal[((ci * SHADES + sh) * FOG_LV + f) * 3 + kind] = pack(c[0], c[1], c[2]);
          }
        }
      }
    }
  }

  /** Far away (chunk not in memory): the colour of the biome, from a coarse cached grid. */
  private farColour(g: Game, x: number, y: number): number {
    const gen = g.gen as OpenWorld;
    if (this.farFor !== gen) {
      this.farFor = gen;
      this.farCache.clear();
    }
    const kx = Math.floor(x / 48), ky = Math.floor(y / 48);
    const key = ky * 100000 + kx;
    let v = this.farCache.get(key);
    if (v === undefined) {
      const z = typeof gen.zoneOf === 'function' ? gen.zoneOf(kx * 48 + 24, ky * 48 + 24) : 0;
      const zc = ZONES[z]?.ground ?? '#4a3a2c';
      const c = rgb(zc);
      const n = 0.9 + hash2(kx, ky, 3) * 0.2;
      v = pack(c[0] * n, c[1] * n, c[2] * n);
      if (this.farCache.size > 20000) this.farCache.clear();
      this.farCache.set(key, v);
    }
    return v;
  }

  private drawWorld(g: Game): void {
    const p = g.player;
    const W = this.VW, WH = this.win.height;
    const buf = this.buf, dep = this.depth;
    this.palette(g);
    const cam = this.camera(g);
    const f = this.focal();
    const hz = this.horizon() + Math.round(Math.sin(this.time * 1.7) * (Math.abs(p.speed) > 1 ? 0.6 : 0));
    const fx = Math.cos(cam.yaw), fy = Math.sin(cam.yaw);
    const rx = -fy, ry = fx;
    // Sky: a gradient to the haze on the horizon, the sun, the crater rim far off.
    const top = this.sky.map((v) => v * 0.62);
    for (let y = 0; y < WH; y++) {
      const t = Math.min(1, Math.max(0, y / Math.max(1, hz)));
      const c = y < hz ? mix(top, this.fogC, t * t) : this.fogC;
      const col = pack(c[0], c[1], c[2]);
      buf.fill(col, y * W, y * W + W);
    }
    dep.fill(1e9);
    const sunA = -2.2;
    for (let i = 0; i < W; i++) {
      const a = cam.yaw + Math.atan((i + 0.5 - W / 2) / f);
      // The crater wall: two octaves of ridges on the far horizon.
      const m = 6 + Math.sin(a * 3) * 3 + Math.sin(a * 7.3 + 1) * 2.2 + Math.sin(a * 17.1) * 1.1 + Math.abs(Math.sin(a * 41.3)) * 1.4;
      const rim = Math.max(1, Math.round(m * (WH / 150)));
      const rc = mix(this.fogC, [46, 38, 34], 0.45);
      const rcol = pack(rc[0], rc[1], rc[2]);
      const rlit = pack(rc[0] * 1.15, rc[1] * 1.15, rc[2] * 1.15);
      for (let y = Math.max(0, hz - rim); y < hz && y < WH; y++) buf[y * W + i] = y === hz - rim ? rlit : rcol;
      // Clouds: soft bands of noise, drifting.
      if (g.weather.phase !== 'active') {
        const cy0 = Math.round(hz * 0.18), ch = Math.max(2, Math.round(hz * 0.4));
        for (let y = cy0; y < cy0 + ch && y < hz - rim - 1; y++) {
          const v = Math.sin(a * 5 + this.time * 0.01 + y * 0.35) * 0.5 + Math.sin(a * 13.7 - y * 0.8 + 2) * 0.3 + Math.sin(a * 2.1 + 4) * 0.4;
          if (v > 0.55) {
            const lt = y < cy0 + ch * 0.4 ? 1.08 : 0.96;
            const cc = mix(this.fogC, [240, 236, 228], 0.35 * lt);
            buf[y * W + i] = pack(cc[0] * lt, cc[1] * lt, cc[2] * lt);
          }
        }
      }
      // The sun, low in the south-west.
      const da = Math.atan2(Math.sin(a - sunA), Math.cos(a - sunA));
      if (Math.abs(da) < 0.05) {
        const sy = Math.round(hz * 0.35);
        const half = Math.round(Math.sqrt(Math.max(0, 1 - (da / 0.05) ** 2)) * (W / 60));
        for (let y = Math.max(0, sy - half); y <= sy + half && y < WH; y++) buf[y * W + i] = pack(this.sun[0], this.sun[1], this.sun[2]);
      }
    }
    // The ground, column by column, front to back.
    const map = g.map;
    const pc = Math.cos(p.rot), ps = Math.sin(p.rot);
    const hull = this.hullImage(g);
    if (!this.shape || this.time - this.shapeT > 0.25) {
      this.shapeT = this.time;
      this.shape = buildHullShape(g, hull, pack, cam.lx, this.time);
    }
    const shp = this.shape;
    const roofLo = cam.roof - 0.1, roofHi = cam.roof + 0.1;
    const pal = this.pal;
    const lights = g.helm.lights;
    let gen = 3;
    for (let i = 0; i < W; i++) {
      const k = (i + 0.5 - W / 2) / f;
      const dx = fx + rx * k, dy = fy + ry * k;
      let ybuf = WH;
      let z = 1.2, dz = 0.25, prevH = 0;
      while (z < ZFAR && ybuf > 0) {
        const wx = cam.x + dx * z, wy = cam.y + dy * z;
        let hgt = 0, col = 0, face = 0;
        // Your own ship: the deck, what's built on it, the stacks, the toroids (a height field, see cabinHull).
        const ox = wx - p.x, oy = wy - p.y;
        const lx = ox * pc + oy * ps, lz = -ox * ps + oy * pc;
        const six = Math.floor(lx - shp.x0), siz = Math.floor(lz - shp.z0);
        const sq = six >= 0 && siz >= 0 && six < shp.w && siz < shp.d ? siz * shp.w + six : -1;
        if (sq >= 0 && shp.h[sq] > 0) {
          hgt = shp.h[sq];
          col = shp.col[sq];
          // The bare deck close up: the paint job at full resolution, plate seams every 5 m, a little grain.
          if (hgt > roofLo && hgt < roofHi && z < 140) {
            const hx = Math.round(hull.cx + lx * hull.ppm), hy = Math.round(hull.cy + lz * hull.ppm);
            const q = (hy * hull.w + hx) * 4;
            if (hx >= 0 && hy >= 0 && hx < hull.w && hy < hull.h && hull.d[q + 3] > 0) {
              const gr = 0.94 + ((Math.imul(Math.floor(lx * 2), 73856093) ^ Math.imul(Math.floor(lz * 2), 19349663)) & 15) / 128;
              const seam = z < 70 && ((((lx % 5) + 5) % 5) < 0.14 || (((lz % 5) + 5) % 5) < 0.14) ? 0.7 : 1;
              col = pack(hull.d[q] * gr * seam, hull.d[q + 1] * gr * seam, hull.d[q + 2] * gr * seam);
            }
          }
          if (lights && z < 90) col = lighten(col);
          if (hgt > prevH + 0.6) {
            face = 3;
            col = darken(col);
          }
        } else {
          const tx = Math.floor(wx), ty = Math.floor(wy);
          let ch = map.peek(tx >> 5, ty >> 5);
          if (!ch && gen > 0 && z < 460 && map.inside(tx, ty)) {
            gen--;
            ch = map.chunk(tx >> 5, ty >> 5);
          }
          const fl = Math.min(FOG_LV - 1, Math.floor((z / ZFAR) * FOG_LV * (g.weather.phase === 'active' ? 2.2 : 1)));
          if (!ch) {
            col = this.farColour(g, wx, wy);
          } else {
            const ti = ((ty & 31) << 5) | (tx & 31);
            const o = ch.obs[ti];
            const sh = (Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663)) & 7;
            if (o) {
              hgt = ch.oh[ti] * 0.5 * HX;
              face = hgt > prevH + 0.8 ? 1 : 0;
              col = pal[(((TER_N + o) * SHADES + sh) * FOG_LV + fl) * 3 + face];
              // Buildings: rows of windows, a few of them lit.
              if (face && (o === OBS.WALL || o === OBS.RUIN)) face = 2;
            } else {
              const t = ch.ter[ti];
              hgt = t === TER.WATER || t === TER.ACID || t === TER.LAVA ? -0.3 : 0;
              col = pal[((t * SHADES + sh) * FOG_LV + fl) * 3];
              if (t === TER.LAVA && sh > 5) col = pack(255, 170, 60);
            }
          }
        }
        const sy = Math.floor(hz + ((cam.h - hgt) * f) / z);
        if (sy < ybuf) {
          const y0 = Math.max(0, sy);
          for (let y = y0; y < ybuf; y++) {
            const q = y * W + i;
            buf[q] = col;
            dep[q] = z;
          }
          if (face) {
            // The lip of a rock, roof or turret catches the light; building fronts get windows.
            if (y0 < ybuf && y0 === sy) buf[y0 * W + i] = lighten(col);
            if (face === 2 && z < 500) {
              const tx = Math.floor(wx), ty = Math.floor(wy);
              for (let y = y0 + 2; y < ybuf - 1; y += 3) if (((tx + ty) & 1) === 0) buf[y * W + i] = hash2(tx, ty + y, 5) > 0.8 ? pack(255, 206, 120) : pack(30, 40, 52);
            }
          }
          ybuf = y0;
        }
        prevH = hgt;
        z += dz;
        dz *= 1.018;
      }
    }
    // Creatures and hostile hulls, far to near, hidden behind anything closer.
    this.drawSprites(g, cam, f, hz);
    this.wx.putImageData(this.img!, 0, 0);
  }

  /** The hull as painted for the tactical view (a few times a second), sampled for the roof behind the cab. */
  private hullImage(g: Game): { d: Uint8ClampedArray; w: number; h: number; cx: number; cy: number; ppm: number } {
    const hl = this.hull;
    if (hl && this.time - hl.t < 0.4) return hl;
    const ppm = 3;
    const pt = paintTitanFlat(g.player, ppm, g, this.time) ?? paintTitan(g.player, ppm, g, this.time);
    const c = pt.canvas;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    this.hull = { d, w: c.width, h: c.height, cx: pt.cx, cy: pt.cy, ppm, t: this.time };
    return this.hull;
  }

  private spritePixels(c: HTMLCanvasElement): ImageData {
    let d = this.spriteData.get(c);
    if (!d) {
      d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
      this.spriteData.set(c, d);
    }
    return d;
  }

  private drawSprites(g: Game, cam: { x: number; y: number; h: number; yaw: number }, f: number, hz: number): void {
    const W = this.VW, WH = this.win.height;
    const fx = Math.cos(cam.yaw), fy = Math.sin(cam.yaw);
    const list: { z: number; sx: number; base: number; hpx: number; img: HTMLCanvasElement; flip: boolean }[] = [];
    for (const e of g.enemies) {
      if (e.burrowed || e.hp <= 0) continue;
      if (g.mode === 'world' && !g.isVisible(e.x, e.y) && !e.boss) continue;
      const dx = e.x - cam.x, dy = e.y - cam.y;
      const z = dx * fx + dy * fy;
      if (z < 4 || z > ZFAR) continue;
      const side = -dx * fy + dy * fx;
      const sx = W / 2 + (side * f) / z;
      const def = ENEMIES[e.kind];
      // A little bigger than life so they read at a distance; bosses loom.
      const size = e.r * 2 * (e.titan ? 1.5 : 2.2);
      const hpx = Math.max(2, (size * f) / z);
      if (sx < -hpx || sx > W + hpx) continue;
      const lift = e.flying ? 10 + e.z * 3 : 0;
      const base = hz + ((cam.h - lift) * f) / z;
      const px = Math.min(96, Math.round(hpx));
      const img = creatureSprite(archFor(e.kind, def?.arch), e.hitFlash > 0 ? '#ffffff' : def?.color ?? '#9e9e9e', px, Math.floor(e.anim * 2) & 1, e.boss ? 'boss' : e.elite ? 'elite' : 'normal', lookFor(e.kind, def?.faction));
      list.push({ z, sx, base, hpx, img, flip: e.vx * fy - e.vy * fx > 0 });
    }
    for (const t of g.tanks) {
      if (t.dead) continue;
      if (g.mode === 'world' && !g.isVisible(t.x, t.y) && t.kind !== 'rival') continue;
      const dx = t.x - cam.x, dy = t.y - cam.y;
      const z = dx * fx + dy * fy;
      if (z < 6 || z > ZFAR) continue;
      const side = -dx * fy + dy * fx;
      const sx = W / 2 + (side * f) / z;
      // A Titan shows the face it turns to you, from the design sheet: its bow, its stern or its flank.
      let view: HTMLCanvasElement | null = null;
      let flip = false;
      let size = Math.max(4, t.stats.width * 1.4);
      if (t.fortress) {
        const rel = Math.atan2(Math.sin(t.rot - Math.atan2(dy, dx)), Math.cos(t.rot - Math.atan2(dy, dx)));
        const which = Math.abs(rel) < Math.PI / 4 ? 'rear' : Math.abs(rel) > (3 * Math.PI) / 4 ? 'front' : 'side';
        view = shipView(which, t.kind);
        size = which === 'side' ? t.stats.length : t.stats.width;
        flip = which === 'side' && -Math.cos(t.rot) * fy + Math.sin(t.rot) * fx > 0;
      }
      const hpx = Math.max(3, (size * f) / z);
      if (sx < -hpx || sx > W + hpx) continue;
      list.push({ z, sx, base: hz + (cam.h * f) / z, hpx, img: view ?? tankSprite(t.kind === 'rival' ? '#5a2a2a' : '#4a4038', Math.min(128, Math.round(hpx))), flip });
    }
    // Your people on the deck below the cab: soldiers in the nests, a gunner by every manned gun.
    const p = g.player;
    if (!p.indoors) {
      const roof = p.deckY(0);
      for (const m of p.modules) {
        if (m.deck !== 0 || !m.built || m.crew <= 0) continue;
        const d = MODULES[m.key];
        const l = p.moduleLocal(m);
        const spots: { x: number; y: number; aim: boolean }[] = [];
        if (d.nest) {
          const n = Math.min(4, Math.max(1, Math.round(m.crew / CREW_SCALE)));
          for (let i = 0; i < n; i++) {
            const w = p.toWorld(l.lx + (i % 2 ? -2.4 : 2.4), l.lz + (i < 2 ? -1.8 : 1.8));
            spots.push({ ...w, aim: true });
          }
          void soldierSpots;
        } else if (m.weapon) spots.push({ ...p.toWorld(l.lx - 5, l.lz + 3.5), aim: false });
        for (const sp of spots) {
          const dx = sp.x - cam.x, dy = sp.y - cam.y;
          const z = dx * fx + dy * fy;
          if (z < 3 || z > 400) continue;
          const side = -dx * fy + dy * fx;
          const sx = W / 2 + (side * f) / z;
          const hpx = Math.max(2, (1.3 * f) / z);
          if (sx < -hpx || sx > W + hpx) continue;
          const pose = sp.aim ? (Math.floor(this.time * 2 + sp.x) % 5 === 0 ? 'stand' : 'aim') : Math.floor(this.time + sp.y) % 4 === 0 ? 'work' : 'stand';
          list.push({ z, sx, base: hz + ((cam.h - roof) * f) / z, hpx, img: personSprite(pose, d.nest ? '#4a5a3a' : '#5a6a7a', d.nest ? '#3a4a2a' : '#ffd740', m.id % 5, '#6a6a70'), flip: side > 0 });
        }
      }
    }
    list.sort((a, b) => b.z - a.z);
    const buf = this.buf, dep = this.depth;
    for (const s of list) {
      const d = this.spritePixels(s.img);
      const sw = s.img.width, sh = s.img.height;
      const dw = Math.max(1, Math.round(s.hpx)), dh = Math.max(1, Math.round((s.hpx * sh) / sw));
      const x0 = Math.round(s.sx - dw / 2), y0 = Math.round(s.base - dh);
      for (let yy = 0; yy < dh; yy++) {
        const y = y0 + yy;
        if (y < 0 || y >= WH) continue;
        const sy = Math.min(sh - 1, Math.floor((yy / dh) * sh));
        for (let xx = 0; xx < dw; xx++) {
          const x = x0 + xx;
          if (x < 0 || x >= W) continue;
          const q = y * W + x;
          if (dep[q] < s.z) continue;
          const sxp = Math.min(sw - 1, Math.floor(((s.flip ? dw - 1 - xx : xx) / dw) * sw));
          const k = (sy * sw + sxp) * 4;
          if (d.data[k + 3] < 128) continue;
          buf[q] = pack(d.data[k], d.data[k + 1], d.data[k + 2]);
          dep[q] = s.z;
        }
      }
    }
  }

  /** The Titan's bow below the glass, seen from the cab: armour plate, the class stripe, hazard chevrons, headlamps. */
  private drawNose(g: Game): void {
    const f = this.focal();
    const off = Math.tan(this.look) * f;
    if (Math.abs(this.look) > 0.9 || this.pitch > (this.winB - HEAD) * 0.5) return;
    const c = this.x;
    const W = this.VW, B = this.winB + Math.round(this.pitch * 0.9);
    const nh = Math.max(8, Math.round((B - HEAD) * 0.12));
    const cx = Math.round(W / 2 - off);
    const strip = CLASS_COL[g.player.klass] ?? '#38c8ff';
    for (let y = 0; y < nh; y++) {
      const k = y / nh;
      const half = Math.round(W * (0.18 + 0.34 * k));
      const yy = B - nh + y;
      c.fillStyle = y === 0 ? '#8a8e94' : k < 0.35 ? '#5a5e64' : '#4a4e54';
      c.fillRect(cx - half, yy, half * 2, 1);
      // Hazard chevrons along the leading edge, the class stripe down the middle.
      if (y >= 1 && y <= 3) for (let x = cx - half; x < cx + half; x += 6) {
        c.fillStyle = (Math.floor((x - cx + y * 2) / 6) & 1) ? '#141414' : '#e0b020';
        c.fillRect(x, yy, 6, 1);
      }
      c.fillStyle = strip;
      c.fillRect(cx - 1 - Math.round(k * 2), yy, 3 + Math.round(k * 4), 1);
    }
    // Plate seams and rivets.
    c.fillStyle = '#34373c';
    for (const fx of [-0.6, -0.3, 0.3, 0.6]) {
      const x0 = cx + Math.round(W * 0.18 * fx), x1 = cx + Math.round(W * 0.52 * fx);
      for (let y = 4; y < nh; y++) c.fillRect(Math.round(x0 + ((x1 - x0) * y) / nh), B - nh + y, 1, 1);
    }
    // Headlamps.
    const on = g.helm.lights;
    for (const sx of [-1, 1]) {
      const lx = cx + sx * Math.round(W * 0.2), ly = B - nh + 5;
      c.fillStyle = '#1a1a1a';
      c.fillRect(lx - 4, ly - 2, 9, 5);
      c.fillStyle = on ? '#fff8d0' : '#6a6a5a';
      c.fillRect(lx - 3, ly - 1, 7, 3);
      if (on) {
        const gl = glowSprite('#fff4c0', 40);
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.5;
        c.drawImage(gl, lx - gl.width / 2, ly - gl.height / 2);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }
    }
  }

  /** Bursts, muzzle flashes and shells in flight, glowing over the view (clipped to the glass). */
  private drawFlashes(g: Game): void {
    const c = this.x;
    const p = g.player;
    const cam = this.camera(g);
    const f = this.focal();
    const hz = this.horizon() + HEAD;
    const fx = Math.cos(cam.yaw), fy = Math.sin(cam.yaw);
    const proj = (x: number, y: number, hh: number): [number, number, number] | null => {
      const dx = x - cam.x, dy = y - cam.y;
      const z = dx * fx + dy * fy;
      if (z < 3) return null;
      const side = -dx * fy + dy * fx;
      return [this.VW / 2 + (side * f) / z, hz + ((cam.h - hh) * f) / z, z];
    };
    c.save();
    c.beginPath();
    c.rect(0, HEAD, this.VW, this.winB - HEAD);
    c.clip();
    c.globalCompositeOperation = 'lighter';
    for (const fl of this.flashes) {
      const q = proj(fl.x, fl.y, fl.z);
      if (!q) continue;
      const k = fl.t / fl.max;
      const r = Math.max(2, (fl.r * f) / q[2]) * (1.4 - k * 0.4);
      const gl = glowSprite(fl.color, r * 3);
      c.globalAlpha = Math.min(1, k * 1.3);
      c.drawImage(gl, q[0] - gl.width / 2, q[1] - gl.height / 2);
      const core = glowSprite('#ffffff', r);
      c.drawImage(core, q[0] - core.width / 2, q[1] - core.height / 2);
    }
    c.globalAlpha = 1;
    for (const pr of g.projectiles) {
      const q = proj(pr.x, pr.y, Math.max(1, pr.z * 2 + (pr.team === 'player' ? 8 : 2)));
      if (!q || q[2] > ZFAR) continue;
      const w = Math.max(1, Math.round(3 * (60 / q[2])));
      c.fillStyle = pr.color;
      c.fillRect(Math.round(q[0]), Math.round(q[1]), Math.min(3, w), Math.min(3, w));
    }
    c.globalCompositeOperation = 'source-over';
    // Floodlights: two pools of light on the ground ahead.
    if (g.helm.lights && Math.abs(this.look) < 1.2) {
      const gl = glowSprite('#fff8d0', this.VW * 0.5);
      c.globalAlpha = 0.16;
      c.globalCompositeOperation = 'lighter';
      c.drawImage(gl, this.VW * 0.3 - gl.width / 2, this.winB - gl.height * 0.35);
      c.drawImage(gl, this.VW * 0.7 - gl.width / 2, this.winB - gl.height * 0.35);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }
    // Weather on the glass.
    if (g.weather.phase === 'active') {
      c.fillStyle = 'rgba(210,220,230,0.35)';
      const n = 60;
      for (let i = 0; i < n; i++) {
        const x = (hash2(i, Math.floor(this.time * 20), 9) * this.VW) | 0;
        const y = HEAD + ((hash2(i, 3, Math.floor(this.time * 20)) * (this.winB - HEAD)) | 0);
        c.fillRect(x, y, 1, 3);
      }
    }
    c.restore();
    void p;
  }

  /** Green lines on the glass: the heading, the nearest threats bracketed, the teletype strip. */
  private drawGlassHud(g: Game): void {
    const c = this.x;
    const cam = this.camera(g);
    const f = this.focal();
    const hz = this.horizon() + HEAD;
    const fx = Math.cos(cam.yaw), fy = Math.sin(cam.yaw);
    const W = this.VW;
    // Threat brackets: the biggest and nearest few things ahead.
    const threats = g.enemies
      .filter((e) => e.hp > 0 && !e.burrowed && (e.titan || e.boss || e.elite) && (g.isVisible(e.x, e.y) || e.boss))
      .map((e) => ({ e, z: (e.x - cam.x) * fx + (e.y - cam.y) * fy }))
      .filter((k) => k.z > 5 && k.z < ZFAR)
      .sort((a, b) => a.z - b.z)
      .slice(0, 4);
    for (const { e, z } of threats) {
      const side = -(e.x - cam.x) * fy + (e.y - cam.y) * fx;
      const sx = W / 2 + (side * f) / z;
      const size = e.r * 2 * (e.titan ? 1.5 : 2.2);
      const hp = Math.max(6, (size * f) / z);
      const sy = hz + (cam.h * f) / z - hp / 2;
      if (sx < 0 || sx > W || sy < HEAD || sy > this.winB) continue;
      const col = e.boss ? '#ff3030' : e.titan ? '#ff8030' : '#d080ff';
      bracket(c, sx, sy, hp * 0.7 + 3, col);
      pxMini(c, `${e.name.toUpperCase().slice(0, 14)} ${Math.round(z)}M`, sx, sy - hp * 0.7 / 2 - 10, col, 'center');
    }
    // Look indicator.
    if (Math.abs(this.look) > 0.05) {
      const deg = Math.round((this.look * 180) / Math.PI);
      pxMini(c, `LOOK ${deg > 0 ? 'STBD' : 'PORT'} ${Math.abs(deg)}°`, W / 2, HEAD + 4, '#80ff90', 'center');
    }
    // Teletype: the latest messages, word-wrapped, newest at the bottom.
    const maxc = Math.max(20, Math.floor((W - 64) / 4));
    const lines: { t: string; old: boolean }[] = [];
    for (const m of this.ticker) {
      const words = m.text.toUpperCase().replace(/[^A-Z0-9%./:+\-<>!?()=#,' ]/g, '').split(' ');
      let cur = '';
      for (const w of words) {
        if ((cur + ' ' + w).trim().length > maxc) {
          lines.push({ t: cur, old: m.t < 1 });
          cur = w;
        } else cur = (cur + ' ' + w).trim();
      }
      if (cur) lines.push({ t: cur, old: m.t < 1 });
    }
    const room = Math.max(1, Math.min(6, Math.floor(((this.winB - HEAD) * 0.35) / 8)));
    let y = this.winB - 10 - (Math.min(room, lines.length) - 1) * 8;
    for (const ln of lines.slice(-room)) {
      const lw = ln.t.length * 4 + 4;
      c.fillStyle = 'rgba(8,10,8,0.6)';
      c.fillRect(Math.round(W / 2 - lw / 2), y - 2, lw, 8);
      pxMini(c, ln.t, W / 2, y, ln.old ? '#8a6a30' : '#ffb030', 'center', null);
      y += 8;
    }
  }

  /* ---------------------------------------------------------------- */
  /* On the glass                                                      */
  /* ---------------------------------------------------------------- */

  /** Flames from the stacks (straight up) and glow from the stern nozzles, when the engine is running. */
  private drawExhaust(g: Game): void {
    const shp = this.shape;
    const p = g.player;
    if (!shp) return;
    const c = this.x;
    const cam = this.camera(g);
    const f = this.focal();
    const hz = this.horizon() + HEAD;
    const fx = Math.cos(cam.yaw), fy = Math.sin(cam.yaw);
    const ds = driveSpec(g, p);
    const power = Math.max(0.12, p.spool * (0.3 + 0.7 * Math.abs(g.helm.lever)));
    const stage = ds.od ? ds.od.stage : 0;
    const WH = this.win.height;
    c.globalCompositeOperation = 'lighter';
    const flame = (lx: number, lz: number, z0: number, up: boolean): void => {
      const w = p.toWorld(lx, lz);
      const dx = w.x - cam.x, dy = w.y - cam.y;
      const zz = dx * fx + dy * fy;
      if (zz < 3) return;
      const sx = this.VW / 2 + ((-dx * fy + dy * fx) * f) / zz, sy = hz + ((cam.h - z0) * f) / zz;
      const ix = Math.round(sx), iy = Math.round(sy - HEAD);
      if (ix < 0 || ix >= this.VW || iy < 0 || iy >= WH) return;
      if (this.depth[iy * this.VW + ix] < zz - 4) return;
      const len = ds.flame.len * (up ? 0.45 : 0.3) * power * (1 + 0.6 * stage);
      const px = Math.max(3, (len * f) / zz);
      for (let k = 0; k < 4; k++) {
        const t = k / 4;
        const flick = 0.8 + 0.4 * Math.sin(this.time * 31 + k * 2 + lx);
        const r = px * (0.55 - t * 0.35) * flick;
        const gl = glowSprite(k < 2 ? ds.flame.core : ds.flame.outer, Math.max(2, r * 2));
        c.globalAlpha = 0.75 - t * 0.15;
        c.drawImage(gl, sx - gl.width / 2, (up ? sy - px * t : sy) - gl.height / 2);
      }
    };
    for (const st of shp.stacks) flame(st.lx, st.lz, st.z, true);
    for (const nz of shp.nozzles) flame(nz.lx, nz.lz, nz.z, false);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  /** The gunsight: a crosshair under the pointer with the range to what's under it, and the marked target. */
  private drawReticle(g: Game): void {
    const c = this.x;
    const { x, y } = this.mouse;
    const p = g.player;
    if (x >= this.VX && x < this.VX + this.VW && y >= HEAD && y < this.winB) {
      const pt = this.pickGround(g, x, y);
      const col = pt ? '#ff5252' : '#7a3a3a';
      c.fillStyle = col;
      c.fillRect(Math.round(x) - 9, Math.round(y), 6, 1);
      c.fillRect(Math.round(x) + 4, Math.round(y), 6, 1);
      c.fillRect(Math.round(x), Math.round(y) - 9, 1, 6);
      c.fillRect(Math.round(x), Math.round(y) + 4, 1, 6);
      ringPx(c, Math.round(x), Math.round(y), 12, col);
      pxMini(c, pt ? `${Math.round(Math.hypot(pt.x - p.x, pt.y - p.y))}M` : 'NO RANGE', x + 14, y - 12, col, 'left');
    }
    // The mark, where it is.
    const ap = p.aimPoint;
    if (ap) {
      const cam = this.camera(g);
      const f = this.focal();
      const fx = Math.cos(cam.yaw), fy = Math.sin(cam.yaw);
      const dx = ap.x - cam.x, dy = ap.y - cam.y;
      const z = dx * fx + dy * fy;
      if (z > 5) {
        const sx = this.VX + this.VW / 2 + ((-dx * fy + dy * fx) * f) / z, sy = this.horizon() + HEAD + (cam.h * f) / z;
        const r = 5 + Math.sin(this.time * 8) * 2;
        c.strokeStyle = '#ff3030';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(sx, sy - r);
        c.lineTo(sx + r, sy);
        c.lineTo(sx, sy + r);
        c.lineTo(sx - r, sy);
        c.closePath();
        c.stroke();
        pxMini(c, `MARK ${Math.round(Math.hypot(dx, dy))}M ${Math.ceil(ap.t)}S`, sx, sy + r + 3, '#ff3030', 'center');
      }
    }
  }

  /** The spotter drone's feed: the tactical view from overhead, with the drone's HUD on top. */
  private drawDrone(g: Game): void {
    const c = this.x;
    const VX = this.VX, VW = this.VW, B = this.winB, H = B - HEAD;
    const feed = this.act.droneFeed();
    if (!feed) {
      c.fillStyle = '#050805';
      c.fillRect(VX, HEAD, VW, H);
      pxMini(c, 'NO SIGNAL', VX + VW / 2, HEAD + H / 2, '#6aff7a', 'center');
      return;
    }
    const k = this.scaleK / feed.scale;
    const sw = VW * k, sh = H * k;
    const cx = feed.canvas.width / 2, cy = feed.canvas.height / 2;
    c.imageSmoothingEnabled = false;
    c.drawImage(feed.canvas, cx - sw / 2, cy - sh / 2, sw, sh, VX, HEAD, VW, H);
    // The drone's HUD: frame brackets, crosshair, altitude, REC, zoom buttons.
    const col = '#6aff7a';
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = HEAD; y < B; y += 3) c.fillRect(VX, y, VW, 1);
    for (const [bx, by, sx, sy] of [[VX + 6, HEAD + 6, 1, 1], [VX + VW - 7, HEAD + 6, -1, 1], [VX + 6, B - 7, 1, -1], [VX + VW - 7, B - 7, -1, -1]]) {
      c.fillStyle = col;
      c.fillRect(Math.min(bx, bx + sx * 12), by, 12, 1);
      c.fillRect(bx, Math.min(by, by + sy * 12), 1, 12);
    }
    const mx = VX + VW / 2, my = HEAD + H / 2;
    c.fillStyle = 'rgba(106,255,122,0.6)';
    c.fillRect(mx - 14, my, 10, 1);
    c.fillRect(mx + 5, my, 10, 1);
    c.fillRect(mx, my - 14, 1, 10);
    c.fillRect(mx, my + 5, 1, 10);
    pxMini(c, `SPOTTER DRONE  ALT ${Math.round(420 * this.camZoom)}M`, VX + 12, HEAD + 12, col);
    if (Math.floor(this.time * 2) % 2) {
      disc(c, VX + VW - 40, HEAD + 14, 2, '#ff3030');
      pxMini(c, 'REC', VX + VW - 35, HEAD + 12, '#ff3030');
    }
    button(c, VX + VW - 44, B - 20, 16, 12, '+', '#243a24', this.press.camin > 0, '#b0ffb0');
    this.hit('camin', VX + VW - 46, B - 22, 20, 16);
    button(c, VX + VW - 24, B - 20, 16, 12, '-', '#243a24', this.press.camout > 0, '#b0ffb0');
    this.hit('camout', VX + VW - 26, B - 22, 20, 16);
  }

  /** The whole Crater: the map, your course and the mission; click to plot a course there. */
  private drawMap(g: Game): void {
    const c = this.x;
    const VX = this.VX, VW = this.VW, B = this.winB, H = B - HEAD;
    c.fillStyle = '#060a10';
    c.fillRect(VX, HEAD, VW, H);
    const size = Math.max(40, Math.min(VW - 16, H - 16));
    if (!this.mapCanvas || this.mapCanvas.width !== size) {
      this.mapCanvas = document.createElement('canvas');
      this.mapCanvas.width = size;
      this.mapCanvas.height = size;
      this.mapT = -1;
    }
    if (this.mapT < 0 || this.time - this.mapT > 0.5) {
      this.mapT = this.time;
      this.act.drawWorldMap?.(this.mapCanvas.getContext('2d')!, size);
    }
    const x0 = Math.round(VX + (VW - size) / 2), y0 = Math.round(HEAD + (H - size) / 2);
    this.mapRect = { x: x0, y: y0, s: size };
    c.drawImage(this.mapCanvas, x0, y0);
    c.strokeStyle = '#2a4a6a';
    c.strokeRect(x0 - 0.5, y0 - 0.5, size + 1, size + 1);
    // The course plotted, the pointer's position in km.
    const p = g.player;
    const k = size / g.map.size;
    if (p.path.length) {
      c.strokeStyle = '#40c4ff';
      c.beginPath();
      c.moveTo(x0 + p.x * k, y0 + p.y * k);
      for (const wp of p.path) c.lineTo(x0 + wp.x * k, y0 + wp.y * k);
      c.stroke();
    }
    const { x, y } = this.mouse;
    if (x >= x0 && y >= y0 && x < x0 + size && y < y0 + size) {
      const wx = (x - x0) / k, wy = (y - y0) / k;
      c.fillStyle = '#ffd740';
      c.fillRect(Math.round(x) - 3, Math.round(y), 7, 1);
      c.fillRect(Math.round(x), Math.round(y) - 3, 1, 7);
      pxMini(c, `${(Math.hypot(wx - p.x, wy - p.y) / 1000).toFixed(1)} KM  CLICK: PLOT COURSE`, x + 6, y + 4, '#ffd740');
    }
    const m = mission(g);
    pxMini(c, `THE CRATER · ${m.title.toUpperCase().slice(0, 40)}`, VX + 8, HEAD + 6, '#ffb030');
  }

  /** Damage control: the Titan from above, every part green to red; click one to send a repair team. */
  private drawDC(g: Game): void {
    const c = this.x;
    const VX = this.VX, VW = this.VW, B = this.winB, H = B - HEAD;
    const s = g.titan;
    const p = g.player;
    const blink = Math.floor(this.time * 3) % 2 === 0;
    // Blueprint paper.
    c.fillStyle = '#071424';
    c.fillRect(VX, HEAD, VW, H);
    c.fillStyle = '#0c2238';
    for (let x = VX; x < VX + VW; x += 10) c.fillRect(x, HEAD, 1, H);
    for (let y = HEAD; y < B; y += 10) c.fillRect(VX, y, VW, 1);
    const col = (v: number): string => (v <= 0.1 ? (blink ? '#ff2010' : '#600808') : v < 0.35 ? '#ff5020' : v < 0.6 ? '#ffb020' : v < 0.85 ? '#d0e040' : '#40ff60');
    const teamRing = (kind: TeamKind, key: string, x: number, y: number, r: number): void => {
      const t = teamOn(g, kind, key);
      if (!t) return;
      c.strokeStyle = t.phase === 'working' ? '#ffffff' : '#80c0ff';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(x, y, r + 2 + Math.sin(this.time * 6) * 1, 0, Math.PI * 2);
      c.stroke();
      pxMini(c, t.phase === 'working' ? `${Math.round(t.done * 100)}%` : 'EN ROUTE', x, y + r + 4, '#ffffff', 'center');
    };
    // The hull, bow to the right, sized to the glass (the side panel takes the right third).
    const sideW = Math.min(150, Math.floor(VW * 0.34));
    const aw = VW - sideW - 24, ah = H - 34;
    const L = p.stats.length, Wd = p.stats.width;
    const k = Math.min(aw / (L * 1.12), ah / (Wd * 1.9));
    const cx = VX + 12 + aw / 2, cy = HEAD + 18 + ah / 2;
    const X = (lx: number): number => cx + lx * k, Y = (lz: number): number => cy + lz * k;
    pxMini(c, 'DAMAGE CONTROL · CLICK A PART TO SEND A TEAM', VX + 8, HEAD + 5, '#80c0ff');
    // Armour zones as the hull's outline: bow, stern, port and starboard sides, the roof in the middle.
    const zc = (z: ArmorZone): string => col(s.zones[z]);
    const hx0 = X(-L / 2), hx1 = X(L / 2), hy0 = Y(-Wd / 2), hy1 = Y(Wd / 2);
    const edge = Math.max(3, Math.round(Wd * k * 0.14));
    c.fillStyle = shadeHex(zc('roof'), 0.35);
    c.fillRect(hx0 + edge, hy0 + edge, hx1 - hx0 - edge * 2, hy1 - hy0 - edge * 2);
    c.fillStyle = zc('port');
    c.fillRect(hx0 + edge, hy0, hx1 - hx0 - edge * 2, edge);
    c.fillStyle = zc('starboard');
    c.fillRect(hx0 + edge, hy1 - edge, hx1 - hx0 - edge * 2, edge);
    c.fillStyle = zc('stern');
    c.fillRect(hx0, hy0, edge, hy1 - hy0);
    c.fillStyle = zc('bow');
    c.beginPath();
    c.moveTo(hx1 - edge, hy0);
    c.lineTo(hx1 + edge * 2, (hy0 + hy1) / 2);
    c.lineTo(hx1 - edge, hy1);
    c.closePath();
    c.fill();
    for (const z of ARMOR) {
      const zx = z.key === 'bow' ? hx1 : z.key === 'stern' ? hx0 : (hx0 + hx1) / 2;
      const zy = z.key === 'port' ? hy0 : z.key === 'starboard' ? hy1 : (hy0 + hy1) / 2;
      const hw = z.key === 'port' || z.key === 'starboard' ? 30 : z.key === 'roof' ? 24 : 10;
      this.hit(`dc:zone:${z.key}`, zx - hw, zy - 6, hw * 2, 12);
      if (z.key !== 'roof') pxMini(c, `${z.name.toUpperCase().slice(0, 5)} ${Math.round(s.zones[z.key] * 100)}%`, zx, z.key === 'port' ? hy0 - 8 : z.key === 'starboard' ? hy1 + 3 : zx === hx1 ? zy - 12 : zy - 12, '#c0d8f0', 'center');
      teamRing('zone', z.key, zx, zy, 6);
    }
    // The eight crawlers along the sides.
    const cw = (hx1 - hx0) / 4 - 3, chh = Math.max(4, edge + 2);
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, n = i % 4;
      const x = hx1 - (n + 1) * ((hx1 - hx0) / 4) + 1.5, y = side < 0 ? hy0 - chh - 2 : hy1 + 2;
      c.fillStyle = '#0a0c10';
      c.fillRect(x - 1, y - 1, cw + 2, chh + 2);
      c.fillStyle = col(s.crawlers[i]);
      c.fillRect(x, y, cw, chh);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      for (let t = 2; t < cw; t += 4) c.fillRect(x + t, y, 1, chh);
      this.hit(`dc:crawler:${i}`, x, y - 2, cw, chh + 4);
      teamRing('crawler', String(i), x + cw / 2, y + chh / 2, 5);
    }
    // The toroids at the corners.
    for (let i = 0; i < 4; i++) {
      const fore = TOROIDS[i].fore, port = TOROIDS[i].port;
      const x = fore ? hx1 - 12 : hx0 + 12, y = port ? hy0 - chh - 14 : hy1 + chh + 14;
      disc(c, x, y, 7, '#0a0c10');
      disc(c, x, y, 6, col(g.helm.toroids[i] ? s.toroids[i] : Math.min(s.toroids[i], 0.5)));
      disc(c, x, y, 3, '#071424');
      pxMini(c, TOROIDS[i].short, x, y - 2, '#ffffff', 'center', null);
      this.hit(`dc:toroid:${i}`, x - 8, y - 8, 16, 16);
      teamRing('toroid', String(i), x, y, 7);
    }
    // Every gun on the roof where it stands.
    for (const m of p.modules) {
      if (m.deck !== 0 || !m.weapon) continue;
      const l = p.moduleLocal(m);
      const x = X(l.lx), y = Y(l.lz);
      const v = 1 - (m.wreck ?? 0);
      const r = m.key === 'main_gun' ? 6 : 3.5;
      disc(c, x, y, r + 1, '#0a0c10');
      disc(c, x, y, r, col(v));
      const a = m.aim - p.rot;
      c.fillStyle = '#0a0c10';
      for (let d = r; d < r + 5; d++) c.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1);
      if (v < 1) this.hit(`dc:gun:${m.id}`, x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4);
      teamRing('gun', String(m.id), x, y, r);
    }
    // The side panel: subsystems, compartments burning or flooding, teams.
    const px0 = VX + VW - sideW - 6;
    let y = HEAD + 16;
    pxMini(c, 'SYSTEMS', px0, y, '#80c0ff');
    y += 8;
    for (const k2 of SYSTEMS) {
      const v = s.systems[k2.key];
      c.fillStyle = '#0a0c10';
      c.fillRect(px0, y, sideW, 9);
      c.fillStyle = col(v);
      c.fillRect(px0 + 1, y + 1, Math.round((sideW - 2) * v), 7);
      pxMini(c, `${k2.name.toUpperCase().slice(0, 14)} ${Math.round(v * 100)}%`, px0 + 3, y + 2, '#081018', 'left', null);
      this.hit(`dc:system:${k2.key}`, px0, y, sideW, 9);
      if (teamOn(g, 'system', k2.key)) pxMini(c, '⚒', px0 + sideW - 6, y + 2, '#ffffff', 'left', null);
      y += 11;
    }
    y += 2;
    pxMini(c, 'DECKS  BOW MID STERN', px0, y, '#80c0ff');
    y += 8;
    const cell = Math.max(6, Math.min(12, Math.floor((B - y - 30) / 7)));
    for (let d = 0; d < 7; d++) {
      for (let sec = 0; sec < 3; sec++) {
        const i = compIndex(d + 1, sec);
        const fi = s.fire[i] ?? 0, fl = s.flood[i] ?? 0;
        const x = px0 + 28 + sec * (cell + 10), yy = y + d * (cell + 1);
        c.fillStyle = fi > 0 ? (blink ? '#ff5020' : '#a02010') : fl > 0.05 ? '#2060c0' : '#1a3a2a';
        c.fillRect(x, yy, cell + 8, cell);
        if (fi > 0) this.hit(`dc:fire:${i}`, x, yy, cell + 8, cell);
        else if (fl > 0.05) this.hit(`dc:flood:${i}`, x, yy, cell + 8, cell);
        if (sec === 0) pxMini(c, `${3 - d > 0 ? '+' : ''}${3 - d}`, px0, yy + 1, '#6a8aa8', 'left', null);
      }
    }
    y += 7 * (cell + 1) + 4;
    const out = g.teams.filter((t) => t.phase !== 'back').length;
    pxMini(c, `TEAMS ${out}/${maxTeams(g)}  JOBS ${openJobs(g).length}`, px0, y, '#c0d8f0');
    button(c, px0, B - 18, 60, 12, g.autoRepair ? 'AUTO ON' : 'AUTO OFF', g.autoRepair ? '#206030' : '#403020', this.press.dc_auto > 0, '#ffffff');
    this.hit('dc_auto', px0, B - 20, 60, 16);
    button(c, px0 + 64, B - 18, 70, 12, 'STABILIZE', '#204060', this.press.dc_stab > 0, '#ffffff');
    this.hit('dc_stab', px0 + 64, B - 20, 70, 16);
    void compName;
  }

  /** The intercom: the Mega Hangar agent on the line, face and words, top left of the glass. */
  private drawComm(g: Game): void {
    const cm = g.comms.current;
    if (!cm) return;
    const c = this.x;
    const a = AGENTS[cm.agent];
    // Over the map and damage control: one line along the bottom of the glass, so it doesn't hide anything.
    if (this.glass === 'map' || this.glass === 'dc') {
      const y = this.winB - 11;
      c.fillStyle = 'rgba(4,10,16,0.9)';
      c.fillRect(this.VX + 4, y - 2, this.VW - 8, 10);
      const im = agentImage(cm.agent);
      if (im.complete && im.naturalWidth) c.drawImage(im, this.VX + 5, y - 2, 10, 10);
      const line = `${a.post}: ${cm.text.toUpperCase()}`.replace(/[^A-Z0-9%./:+\-<>!?()=#,' ]/g, '');
      pxMini(c, line.slice(0, Math.floor((this.VW - 30) / 4)), this.VX + 18, y, a.color, 'left', null);
      return;
    }
    const w = Math.min(230, this.VW - 20), x0 = this.VX + 8, y0 = HEAD + 16;
    const words = cm.text.toUpperCase().replace(/[^A-Z0-9%./:+\-<>!?()=#,' ]/g, '').split(' ');
    const lines: string[] = [];
    const maxc = Math.floor((w - 52) / 4);
    let cur = '';
    for (const wd of words) {
      if ((cur + ' ' + wd).trim().length > maxc) {
        lines.push(cur);
        cur = wd;
      } else cur = (cur + ' ' + wd).trim();
    }
    if (cur) lines.push(cur);
    const shown = lines.slice(0, 6);
    const hh = Math.max(46, 14 + shown.length * 7);
    c.fillStyle = 'rgba(4,10,16,0.88)';
    c.fillRect(x0, y0, w, hh);
    c.strokeStyle = a.color;
    c.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, hh - 1);
    const im = agentImage(cm.agent);
    c.fillStyle = '#02060a';
    c.fillRect(x0 + 3, y0 + 3, 40, 40);
    if (im.complete && im.naturalWidth) {
      c.imageSmoothingEnabled = false;
      c.drawImage(im, x0 + 3, y0 + 3, 40, 40);
    }
    // Scanlines over the face, a talk light.
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let yy = y0 + 3; yy < y0 + 43; yy += 2) c.fillRect(x0 + 3, yy, 40, 1);
    disc(c, x0 + 40, y0 + 6, 1.5, Math.floor(this.time * 5) % 2 ? a.color : '#102030');
    pxMini(c, `${a.post} · ${a.name}`.slice(0, maxc + 8), x0 + 47, y0 + 4, a.color, 'left', null);
    shown.forEach((ln, i) => pxMini(c, ln, x0 + 47, y0 + 12 + i * 7, '#d8e8f0', 'left', null));
  }

  /** The explanation plate: what the hovered control does (or the one tapped with INFO on). */
  private drawTip(g: Game): void {
    const id = this.tipLock?.id ?? (this.hoverT > 0.35 && this.hoverId && this.hoverId !== 'glass' ? this.hoverId : '');
    if (!id) return;
    const tip = tipFor(id, g);
    if (!tip) return;
    const c = this.x;
    const w = Math.min(this.VW - 16, 330);
    const maxc = Math.floor((w - 8) / 4);
    const lines: string[] = [];
    let cur = '';
    for (const wd of tip.body.toUpperCase().replace(/[^A-Z0-9%./:+\-<>!?()=#,' ]/g, '').split(' ')) {
      if ((cur + ' ' + wd).trim().length > maxc) {
        lines.push(cur);
        cur = wd;
      } else cur = (cur + ' ' + wd).trim();
    }
    if (cur) lines.push(cur);
    const shown = lines.slice(0, 8);
    const hh = 14 + shown.length * 7;
    const x0 = Math.round(this.VX + this.VW / 2 - w / 2), y0 = this.winB - hh - 30;
    c.fillStyle = 'rgba(10,8,4,0.92)';
    c.fillRect(x0, y0, w, hh);
    c.strokeStyle = '#ffb030';
    c.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, hh - 1);
    pxMini(c, tip.title.toUpperCase().slice(0, maxc), x0 + 4, y0 + 4, '#ffb030', 'left', null);
    shown.forEach((ln, i) => pxMini(c, ln, x0 + 4, y0 + 12 + i * 7, '#e8e0d0', 'left', null));
  }

  /* ---------------------------------------------------------------- */
  /* The cab itself                                                    */
  /* ---------------------------------------------------------------- */

  private hit(id: string, x: number, y: number, w: number, hh: number): Hit {
    const k = { id, x, y, w, h: hh };
    this.hits.push(k);
    return k;
  }

  private drawFrame(g: Game): void {
    const c = this.x;
    const W = this.W, B = this.winB, VX = this.VX, VW = this.VW;
    // Pillars between the three panes (only over the view out).
    if (this.glass === 'view') {
      for (const px of [Math.round(VX + VW * 0.26), Math.round(VX + VW * 0.74)]) {
        plate(c, px - 3, HEAD, 7, B - HEAD, '#34322e', this.noise);
        c.fillStyle = '#56534c';
        c.fillRect(px - 3, HEAD, 1, B - HEAD);
        c.fillStyle = '#1a1916';
        c.fillRect(px + 3, HEAD, 1, B - HEAD);
        for (let y = HEAD + 6; y < B - 4; y += 12) rivet(c, px, y);
      }
      // Glass: faint reflections.
      c.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 3; i++) {
        const x0 = Math.round(VX + VW * (0.08 + i * 0.3));
        for (let k = 0; k < 18; k++) c.fillRect(x0 + k, HEAD + 4 + k * 2, 2, 2);
      }
    }
    // Side frames round the glass.
    plate(c, VX, HEAD, 4, B - HEAD, '#34322e', this.noise);
    plate(c, VX + VW - 4, HEAD, 4, B - HEAD, '#34322e', this.noise);
    // A battered hull cracks the glass.
    const hp = g.player.hp / Math.max(1, g.player.stats.maxHp);
    if (hp < 0.35) crack(c, Math.round(VX + VW * 0.84), HEAD + 8, hp < 0.15 ? 5 : 3);
    // The overhead panel: the compass tape, the clock, the exit and vitals buttons; then lamps, breakers, dials;
    // then the drive row.
    plate(c, 0, 0, W, HEAD, '#2e2c28', this.noise);
    c.fillStyle = '#141311';
    c.fillRect(0, HEAD - 1, W, 1);
    c.fillStyle = '#1c1b18';
    c.fillRect(0, 12, W, 1);
    c.fillRect(0, 27, W, 1);
    c.fillStyle = '#46433c';
    c.fillRect(0, 13, W, 1);
    c.fillRect(0, 28, W, 1);
    this.compass(g, Math.round(W / 2 - 70), 2, 140, 8);
    button(c, W - 52, 1, 48, 10, 'EXIT  F', '#7a2a20', this.press.exit > 0, '#ffd0c0');
    this.hit('exit', W - 52, 0, 52, 12);
    button(c, 4, 1, 48, 10, 'VITALS Y', '#24402a', this.press.vitals > 0, '#b0ffb0');
    this.hit('vitals', 0, 0, 54, 12);
    if (W > 330) {
      const t = Math.floor(g.stats.time);
      pxMini(c, `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, W - 58, 4, '#ffb030', 'right');
    }
    this.overhead(g, 16);
    this.modesRow(g, 30);
    // Look buttons at the bottom corners of the glass.
    if (this.glass === 'view') {
      button(c, VX + 8, B - 22, 14, 10, '<', '#2a2a30', this.press.lookL > 0, '#c0c8ff');
      this.hit('lookL', VX + 6, B - 24, 18, 14);
      button(c, VX + VW - 22, B - 22, 14, 10, '>', '#2a2a30', this.press.lookR > 0, '#c0c8ff');
      this.hit('lookR', VX + VW - 24, B - 24, 18, 14);
      if (Math.abs(this.look) > 0.05 || Math.abs(this.pitch) > 4) {
        button(c, VX + VW / 2 - 14, B - 22, 28, 10, 'FWD', '#2a2a30', this.press.lookF > 0, '#c0c8ff');
        this.hit('lookF', VX + VW / 2 - 16, B - 24, 32, 14);
      }
    }
  }

  /**
   * The overhead drive row: the drive-mode selector, the preheater, sanders, diff lock and plough switches, the
   * engine's CHARGE gauge (how full, and how long to full) and the INFO switch.
   */
  private modesRow(g: Game, y: number): void {
    const c = this.x;
    const W = this.W;
    const hm = g.helm;
    const p = g.player;
    let x = 4;
    pxMini(c, 'DRIVE', x, y + 3, '#c0b8a8', 'left', null);
    x += 22;
    for (const m of DRIVE_MODES) {
      const on = hm.mode === m.key;
      const lab = m.key === 'normal' ? 'NORM' : m.name;
      const bw = lab.length * 4 + 6;
      c.fillStyle = '#0c0c0c';
      c.fillRect(x, y, bw, 11);
      c.fillStyle = on ? '#e0a020' : '#34322c';
      c.fillRect(x + 1, y + 1, bw - 2, 9);
      if (on) {
        c.fillStyle = '#ffe080';
        c.fillRect(x + 1, y + 1, bw - 2, 1);
      }
      pxMini(c, lab, x + bw / 2, y + 3, on ? '#1a1000' : '#9a927c', 'center', null);
      this.hit(`mode_${m.key}`, x, y - 1, bw, 13);
      x += bw + 1;
    }
    x += 6;
    const sw: [string, string, boolean, string, number][] = [
      ['preheat', 'PREHT', hm.preheat, '#ffb040', 0],
      ['sand', 'SAND', hm.sandT > 0, '#e0c080', hm.sandT > 0 ? 0 : hm.sandCd / SAND_CD],
      ['diff', 'DIFF', hm.diffLock, '#ffd740', 0],
      ['plow', 'PLOW', hm.plow, '#ff9040', 0],
    ];
    for (const [id, lab, on, col, cd] of sw) {
      const bw = 26;
      c.fillStyle = on ? col : '#1a1a1a';
      c.fillRect(x + 1, y + 1, 3, 3);
      c.fillStyle = '#141414';
      c.fillRect(x + 6, y, 8, 11);
      c.fillStyle = '#6a675f';
      c.fillRect(x + 7, y + 1, 6, 9);
      c.fillStyle = '#d8d0c0';
      c.fillRect(x + 9, on ? y + 1 : y + 6, 2, 4);
      if (cd > 0) {
        c.fillStyle = 'rgba(0,0,0,0.6)';
        c.fillRect(x + 6, y, 8, Math.round(11 * cd));
      }
      pxMini(c, lab, x + 16, y + 3, on ? col : '#9a927c', 'left', null);
      this.hit(id, x, y - 1, bw + 10, 13);
      x += bw + 12;
    }
    // CHARGE: the engine's charge like a boiler gauge, with seconds to full.
    const ds = driveSpec(g, p);
    const want = Math.max(hm.preheat ? 0.35 : 0, Math.abs(hm.lever));
    const secs = p.spool < want ? (want - p.spool) / Math.max(0.001, ds.spool) : 0;
    const gw = Math.min(110, W - x - 60);
    if (gw > 40) {
      pxMini(c, 'CHARGE', x, y + 3, '#c0b8a8', 'left', null);
      x += 26;
      c.fillStyle = '#0a0a0a';
      c.fillRect(x, y + 1, gw, 9);
      const fill = Math.round((gw - 2) * p.spool);
      for (let i = 0; i < fill; i++) {
        const k = i / (gw - 2);
        c.fillStyle = k < 0.5 ? '#3a8a3a' : k < 0.8 ? '#8ac040' : '#e0c030';
        c.fillRect(x + 1 + i, y + 2, 1, 7);
      }
      for (let i = 1; i < 10; i++) {
        c.fillStyle = '#0a0a0a';
        c.fillRect(x + Math.round(((gw - 2) * i) / 10), y + 2, 1, 7);
      }
      c.fillStyle = '#ff5030';
      c.fillRect(x + 1 + Math.round((gw - 2) * 0.8), y, 1, 11);
      pxMini(c, secs > 0.05 ? `${secs.toFixed(1)}S` : `${Math.round(p.spool * 100)}%`, x + gw + 3, y + 3, secs > 0.05 ? '#ffd740' : '#6aff7a', 'left', null);
      this.hit('charge', x - 26, y - 1, gw + 50, 13);
    }
    button(c, W - 18, y, 14, 11, '?', this.infoOn ? '#a07010' : '#2a2a30', this.infoOn || this.press.info > 0, '#ffffff');
    this.hit('info', W - 20, y - 1, 18, 13);
  }

  /** The side wings: analytics screens stacked over the fuel plant (left) and the tactical box (right). */
  private drawWings(g: Game): void {
    const L = this.lay;
    if (!L.wing) return;
    const c = this.x;
    const B = this.winB;
    for (const side of [0, 1]) {
      const x0 = side ? this.W - L.wing : 0;
      plate(c, x0, HEAD, L.wing, B - HEAD, '#3a3732', this.noise);
      c.fillStyle = '#1c1b18';
      c.fillRect(side ? x0 : x0 + L.wing - 1, HEAD, 1, B - HEAD);
      for (let i = 0; i < L.perWing; i++) {
        const idx = side * L.perWing + i;
        const sy = HEAD + 3 + i * (L.scrH + 3);
        drawScreen(c, g, this.pages[idx % this.pages.length], x0 + 3, sy, L.wing - 6, L.scrH, this.time, idx);
        this.hit(`scr${idx}`, x0 + 3, sy, L.wing - 6, L.scrH);
      }
      const by = B - BOX_H - 2;
      plate(c, x0 + 2, by, L.wing - 4, BOX_H, '#44423c', this.noise);
      bevel(c, x0 + 2, by, L.wing - 4, BOX_H);
      if (side === 0) this.fuelBox(g, x0 + 2, by, L.wing - 4, BOX_H);
      else this.tactBox(g, x0 + 2, by, L.wing - 4, BOX_H);
    }
  }

  /** The fuel plant: the drill lever, the crude and fuel tanks, the oil survey needle, the refinery's AUTO switch. */
  private fuelBox(g: Game, x0: number, y0: number, w: number, hh: number): void {
    const c = this.x;
    const s = g.titan;
    pxMini(c, 'FUEL PLANT', x0 + w / 2, y0 + 3, '#c0b8a8', 'center');
    const has = !!fuelDrill(g);
    // The drill lever: a slot, the handle down while it bores.
    const lx = x0 + 10, ly = y0 + 13, lh = hh - 30;
    c.fillStyle = '#0c0c0c';
    c.fillRect(lx - 2, ly, 5, lh);
    const hy = Math.round(ly + (s.drillWant ? 1 : 0) * (lh - 8) * Math.max(s.drill, 0.15) + (s.drillWant ? 0 : 0));
    c.fillStyle = '#0a0a0a';
    c.fillRect(lx - 6, hy - 1, 13, 9);
    c.fillStyle = has ? (s.drill >= 1 ? '#40a040' : s.drill > 0 ? '#c09020' : '#8a3a2a') : '#3a3a3a';
    c.fillRect(lx - 5, hy, 11, 7);
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fillRect(lx - 5, hy, 11, 1);
    pxMini(c, 'DRILL', lx, y0 + hh - 14, has ? '#c0b8a8' : '#6a665e', 'center');
    const st = !has ? 'NONE' : s.drillWant ? (s.drill >= 1 ? 'PUMP' : 'DOWN') : s.drill > 0 ? 'RAISE' : 'UP';
    pxMini(c, st, lx, y0 + hh - 7, s.drill >= 1 ? '#6aff7a' : '#ffb030', 'center');
    this.hit('drill', x0, y0 + 10, 22, hh - 10);
    // Tanks: crude and fuel.
    const tanks: [string, number, string][] = [['CRD', s.crude / CRUDE_MAX, '#a07840'], ['FUL', s.fuel / FUEL_MAX, '#ffb030']];
    tanks.forEach(([lab, v, col], i) => {
      const tx = x0 + 26 + i * 14, ty = y0 + 13, th = hh - 30;
      c.fillStyle = '#0a0a0a';
      c.fillRect(tx, ty, 9, th);
      c.fillStyle = col;
      c.fillRect(tx + 1, ty + th - 1 - Math.round((th - 2) * v), 7, Math.round((th - 2) * v));
      for (let k = 1; k < 4; k++) {
        c.fillStyle = '#0a0a0a';
        c.fillRect(tx + 1, ty + Math.round((th * k) / 4), 3, 1);
      }
      pxMini(c, lab, tx + 5, y0 + hh - 14, '#c0b8a8', 'center');
    });
    // Oil survey needle.
    const oil = oilHere(g);
    const dx = x0 + w - 24, dy = y0 + 26;
    dial(c, dx, dy, 11, Math.min(1, oil / 1.6), 'OIL', { ticks: 4, red: 0, face: '#e8e0c8' });
    pxMini(c, oilWord(oil), dx, dy + 14, oil >= 1 ? '#6aff7a' : oil >= 0.4 ? '#ffb030' : '#ff6040', 'center');
    // Rates.
    const dr = drillRate(g), rr = refineRate(g);
    pxMini(c, dr > 0 ? `+${dr.toFixed(1)}` : '', x0 + 58, y0 + 14, '#6aff7a');
    // Refinery AUTO switch.
    const ref = !!fuelRefinery(g);
    const on = ref && g.helm.refine;
    const sx = x0 + w - 36, sy = y0 + hh - 18;
    c.fillStyle = on && rr > 0 && s.crude > 0 && s.fuel < FUEL_MAX ? (Math.floor(this.time * 3) % 2 ? '#6aff7a' : '#2a6a30') : on ? '#3a8a3a' : '#202020';
    c.fillRect(sx, sy + 2, 3, 3);
    c.fillStyle = '#141414';
    c.fillRect(sx + 5, sy, 8, 12);
    c.fillStyle = '#6a675f';
    c.fillRect(sx + 6, sy + 1, 6, 10);
    c.fillStyle = '#d8d0c0';
    c.fillRect(sx + 8, on ? sy + 1 : sy + 6, 2, 5);
    pxMini(c, ref ? 'REFN' : 'NO RF', sx + 15, sy + 3, ref ? '#c0b8a8' : '#6a665e', 'left', null);
    this.hit('refine', sx - 2, sy - 2, 36, 16);
  }

  /** The tactical box: what the glass shows (view, drone, map, damage control), the gunsight, smoke, clear mark. */
  private tactBox(g: Game, x0: number, y0: number, w: number, hh: number): void {
    const c = this.x;
    const hm = g.helm;
    pxMini(c, 'GLASS', x0 + 4, y0 + 3, '#c0b8a8');
    const modes: [GlassMode, string][] = [['view', 'VIEW'], ['cam', 'DRONE'], ['map', 'MAP'], ['dc', 'DMG']];
    const bw = Math.floor((w - 10) / 2);
    modes.forEach(([m, lab], i) => {
      const bx = x0 + 4 + (i % 2) * (bw + 2), by = y0 + 11 + Math.floor(i / 2) * 14;
      const on = this.glass === m;
      button(c, bx, by, bw, 12, lab, on ? '#2a5a7a' : '#2a2a30', on || this.press[`g_${m}`] > 0, on ? '#e0f8ff' : '#a0a8b8');
      if (m === 'dc' && openJobs(g).length && Math.floor(this.time * 2) % 2) {
        c.fillStyle = '#ff4030';
        c.fillRect(bx + bw - 4, by + 1, 3, 3);
      }
      this.hit(`g_${m}`, bx, by, bw, 12);
    });
    const ry = y0 + 42;
    const sw = Math.floor((w - 12) / 3);
    const smokeCd = hm.smokeT > 0 ? 0 : hm.smokeCd / SMOKE_CD;
    const btns: [string, string, string, boolean, number][] = [
      ['aim', 'AIM', '#7a2020', this.aimOn, 0],
      ['smoke', 'SMOK', '#4a5058', hm.smokeT > 0, smokeCd],
      ['clear', 'CLR', '#3a3a30', false, 0],
    ];
    btns.forEach(([id, lab, col, on, cd], i) => {
      const bx = x0 + 4 + i * (sw + 2);
      button(c, bx, ry, sw, 13, lab, col, on || this.press[id] > 0, on ? '#ffffff' : '#d0d0d0');
      if (cd > 0) {
        c.fillStyle = 'rgba(0,0,0,0.6)';
        c.fillRect(bx, ry, Math.round(sw * cd), 13);
      }
      this.hit(id, bx, ry, sw, 13);
    });
    const ap = g.player.aimPoint;
    const p = g.player;
    pxMini(c, ap ? `MARK ${Math.round(Math.hypot(ap.x - p.x, ap.y - p.y))}M ${Math.ceil(ap.t)}S` : this.aimOn ? 'SIGHT ARMED' : 'NO MARK', x0 + w / 2, y0 + hh - 20, ap ? '#ff5252' : this.aimOn ? '#ffb030' : '#6a665e', 'center');
    const out = g.teams.filter((t) => t.phase !== 'back').length;
    pxMini(c, `TEAMS ${out}/${maxTeams(g)}`, x0 + w / 2, y0 + hh - 11, '#b2ff59', 'center');
  }

  private compass(g: Game, x0: number, y0: number, w: number, hh: number): void {
    const c = this.x;
    c.fillStyle = '#0a0c0a';
    c.fillRect(x0, y0, w, hh);
    // Bearing: 0 = north (up the map), clockwise.
    const yaw = g.player.rot + this.look;
    const brg = ((((yaw + Math.PI / 2) * 180) / Math.PI) % 360 + 360) % 360;
    const pxPerDeg = 1.4;
    c.save();
    c.beginPath();
    c.rect(x0, y0, w, hh);
    c.clip();
    for (let d = Math.floor(brg - w / 2 / pxPerDeg) - 1; d <= brg + w / 2 / pxPerDeg + 1; d++) {
      const dd = ((d % 360) + 360) % 360;
      const x = Math.round(x0 + w / 2 + (d - brg) * pxPerDeg);
      if (dd % 10 === 0) {
        c.fillStyle = '#3aaa50';
        c.fillRect(x, y0 + hh - 2, 1, 2);
      }
      if (dd % 45 === 0) {
        const lab = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][dd / 45];
        pxMini(c, lab, x, y0 + 1, dd === 0 ? '#ff5040' : '#6aff7a', 'center', null);
      }
    }
    c.restore();
    c.fillStyle = '#ffb030';
    c.fillRect(Math.round(x0 + w / 2), y0, 1, hh);
    pxMini(c, String(Math.round(brg) % 360).padStart(3, '0'), x0 + w + 4, y0 + 2, '#ffb030', 'left', null);
  }

  private drawDash(g: Game): void {
    const c = this.x;
    const W = this.W, H = this.H;
    const y0 = this.winB;
    const L = this.lay;
    // The console: a riveted slab below the glass, a darker top lip with the steering lever.
    plate(c, 0, y0, W, H - y0, '#3a3732', this.noise);
    c.fillStyle = '#1c1b18';
    c.fillRect(0, y0, W, 1);
    plate(c, 0, y0 + 1, W, LIP - 1, '#2a2825', this.noise);
    c.fillStyle = '#4a4740';
    c.fillRect(0, y0 + LIP - 1, W, 1);
    this.steerLever(g, y0);
    if (W > 300) pxMini(c, `TITAN CRAWLER ${CLASSES[g.player.klass]?.name.toUpperCase() ?? ''}`.slice(0, 28), 6, y0 + 6, '#8a8272');
    const x0 = Math.round((W - L.rowW) / 2);
    let y = y0 + LIP;
    // The screen bank on its glare shield (when there are no side wings): click a screen to turn its page.
    if (L.screens > 0 && !L.wing) {
      plate(c, x0 - 4, y, L.rowW + 8, L.scrH, '#22211d', this.noise);
      c.fillStyle = '#12110f';
      c.fillRect(x0 - 4, y + L.scrH - 1, L.rowW + 8, 1);
      const sw = Math.floor((L.rowW - (L.screens - 1) * 2) / L.screens);
      for (let i = 0; i < L.screens; i++) {
        const sx = x0 + i * (sw + 2);
        drawScreen(c, g, this.pages[i], sx, y + 1, sw, L.scrH - 3, this.time, i);
        this.hit(`scr${i}`, sx, y + 1, sw, L.scrH - 3);
      }
      y += L.scrH;
    }
    // The modules.
    for (const row of L.rows) {
      const rw = row.reduce((a, [, w]) => a + w, 0) + (row.length - 1) * 2;
      let x = Math.round((W - rw) / 2);
      for (const [id, w] of row) {
        plate(c, x, y + 1, w, MOD_H - 3, '#44423c', this.noise);
        bevel(c, x, y + 1, w, MOD_H - 3);
        rivet(c, x + 2, y + 3);
        rivet(c, x + w - 3, y + 3);
        rivet(c, x + 2, y + MOD_H - 5);
        rivet(c, x + w - 3, y + MOD_H - 5);
        switch (id) {
          case 'radar': this.radar(g, x, y + 1, w); break;
          case 'dials': dialsModule(c, g, x, y + 1, w, MOD_H - 3, this.time); break;
          case 'panel': this.panel(g, x, y + 1, w); break;
          case 'engines': this.engines(g, x, y + 1, w); break;
          case 'drive': this.driveBox(g, x, y + 1, w); break;
          case 'throttle': this.throttle(g, x, y + 1, w); break;
          case 'supply': supplyModule(c, g, x, y + 1, w, MOD_H - 3, this.time); break;
          case 'reactor': reactorModule(c, g, x, y + 1, w, MOD_H - 3, this.time); break;
          case 'fuel': this.fuelBox(g, x, y + 1, w, MOD_H - 3); break;
          case 'tact': this.tactBox(g, x, y + 1, w, MOD_H - 3); break;
        }
        x += w + 2;
      }
      y += MOD_H;
    }
    this.cabWalls(g, y0, x0 - 6, x0 + L.rowW + 6);
    void specOf;
  }

  /** Either side of the console, where there's room: pipes, the radio handset, a clipboard, a mug, the extinguisher. */
  private cabWalls(g: Game, y0: number, left: number, right: number): void {
    const c = this.x;
    const W = this.W, H = this.H;
    for (const [a, b] of [[0, left], [right, W]] as [number, number][]) {
      const w = b - a;
      if (w < 14) continue;
      // Conduits down the wall.
      for (let k = 0; k < Math.min(3, Math.floor(w / 10)); k++) {
        const px = a + 4 + k * 8;
        c.fillStyle = k === 1 ? '#3a4a5a' : '#5a3a26';
        c.fillRect(px, y0 + LIP + 2, 4, H - y0 - LIP - 4);
        c.fillStyle = k === 1 ? '#5a7088' : '#8a5a3a';
        c.fillRect(px, y0 + LIP + 2, 1, H - y0 - LIP - 4);
        c.fillStyle = '#1a1a1a';
        for (let yy = y0 + LIP + 10 + k * 7; yy < H - 6; yy += 24) c.fillRect(px - 1, yy, 6, 2);
      }
      if (w < 44) continue;
      const cx = a + Math.floor(w / 2) + 8;
      if (a === 0) {
        // The radio: a handset on its hook, a coiled cord, a frequency window.
        c.fillStyle = '#1e1e1c';
        c.fillRect(cx - 10, y0 + LIP + 8, 22, 30);
        c.fillStyle = '#0a0c0a';
        c.fillRect(cx - 7, y0 + LIP + 11, 16, 6);
        pxMini(c, '121.5', cx + 1, y0 + LIP + 12, '#ffb030', 'center', null);
        c.fillStyle = '#2a2a28';
        c.fillRect(cx - 8, y0 + LIP + 20, 6, 15);
        c.fillStyle = '#3a3a36';
        c.fillRect(cx - 8, y0 + LIP + 20, 6, 2);
        c.fillStyle = Math.floor(this.time * 2) % 2 && g.wave.phase !== 'calm' ? '#ff3020' : '#301008';
        c.fillRect(cx + 6, y0 + LIP + 22, 3, 3);
        c.fillStyle = '#141414';
        for (let k = 0; k < 7; k++) c.fillRect(cx - 5 + (k % 2), y0 + LIP + 36 + k * 2, 2, 1);
        // The route clipboard.
        if (H - y0 > 150) {
          c.fillStyle = '#6a4a2a';
          c.fillRect(cx - 10, y0 + LIP + 56, 22, 30);
          c.fillStyle = '#e8e0c8';
          c.fillRect(cx - 8, y0 + LIP + 60, 18, 24);
          c.fillStyle = '#8a8a8a';
          c.fillRect(cx - 3, y0 + LIP + 54, 8, 4);
          c.fillStyle = '#6a6a60';
          for (let k = 0; k < 6; k++) c.fillRect(cx - 6, y0 + LIP + 63 + k * 3, 10 + (k % 3) * 2, 1);
          c.fillStyle = '#c02010';
          c.fillRect(cx + 4, y0 + LIP + 70, 2, 2);
        }
      } else {
        // A tin mug that rattles at speed, and the extinguisher.
        const rattle = Math.abs(g.player.speed) > 20 ? Math.round(Math.sin(this.time * 40) * 0.6) : 0;
        c.fillStyle = '#5a6a7a';
        c.fillRect(cx - 5 + rattle, y0 + LIP + 12, 8, 9);
        c.fillStyle = '#8a9aaa';
        c.fillRect(cx - 5 + rattle, y0 + LIP + 12, 8, 1);
        c.fillStyle = '#2a1a10';
        c.fillRect(cx - 4 + rattle, y0 + LIP + 13, 6, 1);
        c.fillStyle = '#5a6a7a';
        c.fillRect(cx + 3 + rattle, y0 + LIP + 14, 2, 4);
        c.fillStyle = '#a01a10';
        c.fillRect(cx - 5, H - 44, 10, 30);
        c.fillStyle = '#e04030';
        c.fillRect(cx - 4, H - 43, 2, 28);
        c.fillStyle = '#222';
        c.fillRect(cx - 3, H - 48, 6, 4);
        pxMini(c, 'FIRE', cx, H - 32, '#ffe0d0', 'center', null);
      }
    }
  }

  /** The overhead panel's lower row: subsystem lamps, circuit breakers, and four small dials. */
  private overhead(g: Game, y: number): void {
    const c = this.x;
    const W = this.W;
    const s = g.titan;
    const blink = Math.floor(this.time * 3) % 2 === 0;
    const lamps: [string, number][] = [['PWR', s.systems.power], ['DRV', s.systems.propulsion], ['STR', s.systems.steering], ['GUN', s.systems.weapons], ['SEN', s.systems.sensors], ['LIF', s.systems.life]];
    lamps.forEach(([lab, v], i) => {
      const lx = 4 + i * 15;
      const st = damageState(v);
      const lit = v > 0.8 ? true : v <= 0.1 ? blink : true;
      c.fillStyle = '#0a0a0a';
      c.fillRect(lx, y, 14, 9);
      c.fillStyle = lit ? shadeHex(st.color, v > 0.8 ? 0.55 : 1) : '#1a1a1a';
      c.fillRect(lx + 1, y + 1, 12, 7);
      pxMini(c, lab, lx + 7, y + 2, '#0a0a00', 'center', null);
    });
    // Circuit breakers: tripped (down, red) when their system is disabled; some are the switches you've thrown.
    const hm = g.helm;
    const brk: [string, boolean][] = [['N', s.systems.sensors > 0.1], ['C', s.systems.sensors > 0.1], ['R', s.systems.sensors > 0.1], ['H', s.systems.life > 0.1], ['P', hm.pumps], ['L', hm.lights], ['G', !hm.safe], ['A', s.systems.power > 0.1]];
    const bx0 = Math.round(W / 2 - 44);
    if (W > 330) brk.forEach(([lab, on], i) => {
      const x = bx0 + i * 11;
      c.fillStyle = '#141412';
      c.fillRect(x, y - 1, 9, 8);
      c.fillStyle = on ? '#d8d0c0' : '#c03020';
      c.fillRect(x + 3, on ? y : y + 3, 3, 3);
      c.fillStyle = '#5a564c';
      c.fillRect(x + 2, y + 3, 5, 1);
      pxMini(c, lab, x + 4, y + 8, '#8a8272', 'center', null);
    });
    // Four small dials: oxygen, cabin temperature, outside temperature, hull.
    const p = g.player;
    const dials: [string, number, string][] = [
      ['O2', (s.oxygen - 0.15) / 0.07, `${(s.oxygen * 100).toFixed(0)}`],
      ['CAB', (s.temp + 20) / 70, `${Math.round(s.temp)}`],
      ['OUT', (outsideTemp(g) + 30) / 90, `${Math.round(outsideTemp(g))}`],
      ['HUL', p.hp / Math.max(1, p.stats.maxHp), `${Math.round((p.hp / Math.max(1, p.stats.maxHp)) * 100)}`],
    ];
    if (W > 250) dials.forEach(([lab, v, val], i) => {
      const dx = W - 4 - (4 - i) * 30;
      pxMini(c, lab, dx + 11, y + 1, '#c0b8a8', 'right', null);
      pxMini(c, val, dx + 11, y + 8, '#ffb030', 'right', null);
      dial(c, dx + 20, y + 6, 6, v, '', { ticks: 4, red: lab === 'HUL' ? 0 : 0.25 });
    });
  }

  /** The cab around the glass: sun visors, the wiper (it runs in a storm), the lucky charm swinging from the roof. */
  private cabDetails(g: Game, dt: number): void {
    const c = this.x;
    const W = this.VW, B = this.winB;
    // Sun visors over the side panes, one flipped down.
    for (const [x0, x1, down] of [[4, Math.round(W * 0.26) - 3, true], [Math.round(W * 0.74) + 4, W - 4, false]] as [number, number, boolean][]) {
      const vw = Math.round((x1 - x0) * 0.7), vx = x0 + Math.round((x1 - x0 - vw) / 2);
      const vh = down ? 9 : 3;
      c.fillStyle = '#1e1d1a';
      c.fillRect(vx, HEAD, vw, vh + 1);
      c.fillStyle = '#3a3630';
      c.fillRect(vx + 1, HEAD, vw - 2, vh);
      c.fillStyle = '#4e4a42';
      c.fillRect(vx + 1, HEAD + vh - 1, vw - 2, 1);
      rivet(c, vx + 2, HEAD + 1);
      rivet(c, vx + vw - 3, HEAD + 1);
    }
    // The wiper on the middle pane: parked, or sweeping through the storm.
    const px = Math.round(W * 0.5), py = B - 2;
    const storm = g.weather.phase === 'active';
    const a = storm ? -Math.PI / 2 + Math.sin(this.time * 3.2) * 1.1 : -0.12;
    const len = Math.round(Math.min(W * 0.2, (B - HEAD) * 0.6));
    c.fillStyle = '#141414';
    for (let d = 0; d < len; d++) c.fillRect(Math.round(px + Math.cos(a) * d), Math.round(py + Math.sin(a) * d), d > len * 0.25 ? 2 : 1, 1);
    c.fillStyle = '#2a2a2a';
    c.fillRect(px - 2, py - 1, 4, 3);
    // The charm: it swings when she turns, brakes and accelerates.
    const p = g.player;
    const ch = this.charm;
    const acc = dt > 0 ? (p.speed - ch.lastSpeed) / dt : 0;
    ch.lastSpeed = p.speed;
    const lat = p.yawRate * p.speed;
    ch.w += (-9 * Math.sin(ch.a) - 1.1 * ch.w - lat * 0.6 - acc * 0.04) * Math.min(0.05, dt);
    ch.a = Math.max(-1.2, Math.min(1.2, ch.a + ch.w * Math.min(0.05, dt)));
    const hx = Math.round(W * 0.42), L = 14;
    for (let d = 0; d < L; d++) {
      c.fillStyle = '#6a6458';
      c.fillRect(Math.round(hx + Math.sin(ch.a) * d), HEAD + Math.round(Math.cos(ch.a) * d), 1, 1);
    }
    const bxp = Math.round(hx + Math.sin(ch.a) * L), byp = HEAD + Math.round(Math.cos(ch.a) * L);
    // A little brass skull.
    c.fillStyle = '#5a3a10';
    c.fillRect(bxp - 2, byp, 5, 5);
    c.fillStyle = '#d8a040';
    c.fillRect(bxp - 2, byp, 5, 4);
    c.fillStyle = '#ffe080';
    c.fillRect(bxp - 1, byp, 2, 1);
    c.fillStyle = '#2a1a08';
    c.fillRect(bxp - 1, byp + 2, 1, 1);
    c.fillRect(bxp + 1, byp + 2, 1, 1);
    void ringPx;
  }

  private steerLever(g: Game, y0: number): void {
    const c = this.x;
    const W = this.W;
    const sw = Math.min(150, Math.round(W * 0.34));
    const sx = Math.round(W / 2 - sw / 2), sy = y0 + 7;
    pxMini(c, 'PORT', sx - 4, sy - 2, '#c0b8a8', 'right');
    pxMini(c, 'STBD', sx + sw + 4, sy - 2, '#c0b8a8');
    c.fillStyle = '#0c0c0c';
    c.fillRect(sx, sy, sw, 3);
    c.fillStyle = '#5a5850';
    c.fillRect(sx, sy + 3, sw, 1);
    for (let i = 0; i <= 8; i++) {
      c.fillStyle = i === 4 ? '#ffb030' : '#6a675f';
      c.fillRect(sx + Math.round((sw * i) / 8), sy - 3, 1, 2);
    }
    const di = g.driveInput;
    const v = this.steer || (di.active ? Math.max(-1, Math.min(1, di.x)) : 0);
    const kx = Math.round(sx + sw / 2 + (v * sw) / 2);
    c.fillStyle = '#111';
    c.fillRect(kx - 5, sy - 5, 11, 12);
    c.fillStyle = '#b8b0a0';
    c.fillRect(kx - 4, sy - 4, 9, 10);
    c.fillStyle = '#e8e0d0';
    c.fillRect(kx - 4, sy - 4, 9, 2);
    c.fillStyle = '#6a6458';
    c.fillRect(kx - 1, sy - 2, 3, 6);
    this.rects.steerSlot = this.hit('steer', sx - 8, y0 + 1, sw + 16, LIP - 2);
  }

  private radar(g: Game, x0: number, y0: number, w: number): void {
    const c = this.x;
    const p = g.player;
    const r = Math.min(w / 2 - 6, (MOD_H - 3) / 2 - 7);
    const cx = x0 + w / 2, cy = y0 + (MOD_H - 3) / 2 + 2;
    // Bezel and glass.
    disc(c, cx, cy, r + 3, '#1a1a18');
    disc(c, cx, cy, r + 2, '#5a5850');
    disc(c, cx, cy, r, '#041008');
    const range = RADAR_RANGES[this.radarI];
    const k = r / range;
    c.fillStyle = '#0c3a18';
    for (const f of [1 / 3, 2 / 3]) ringPx(c, cx, cy, r * f, '#0c3a18');
    c.fillRect(Math.round(cx - r), Math.round(cy), Math.round(r * 2), 1);
    c.fillRect(Math.round(cx), Math.round(cy - r), 1, Math.round(r * 2));
    // Heading up: everything turned so the bow points to the top of the scope.
    const a0 = -p.rot - Math.PI / 2;
    const ca = Math.cos(a0), sa = Math.sin(a0);
    const P = (x: number, y: number): [number, number] => {
      const dx = (x - p.x) * k, dy = (y - p.y) * k;
      return [cx + dx * ca - dy * sa, cy + dx * sa + dy * ca];
    };
    // The sweep and its fading trail.
    const sweep = (this.time * 2.2) % (Math.PI * 2);
    for (let i = 0; i < 14; i++) {
      const a = sweep - i * 0.05;
      c.fillStyle = `rgba(60,255,110,${0.3 * (1 - i / 14)})`;
      for (let d = 2; d < r; d += 1.5) c.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1);
    }
    const blipA = (x: number, y: number): number => {
      const a = Math.atan2(y - cy, x - cx);
      const d = ((sweep - a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      return 0.35 + 0.65 * Math.max(0, 1 - d / 4);
    };
    for (const e of g.enemies) {
      if (e.hp <= 0 || e.burrowed) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > range) continue;
      const [x, y] = P(e.x, e.y);
      const big = e.titan || e.boss;
      c.globalAlpha = blipA(x, y);
      c.fillStyle = e.boss ? '#ff4040' : big ? '#ffb030' : '#7aff8a';
      c.fillRect(Math.round(x) - (big ? 1 : 0), Math.round(y) - (big ? 1 : 0), big ? 3 : 1, big ? 3 : 1);
    }
    for (const t of g.tanks) {
      if (t.dead || Math.hypot(t.x - p.x, t.y - p.y) > range) continue;
      const [x, y] = P(t.x, t.y);
      c.globalAlpha = blipA(x, y);
      c.fillStyle = '#ff5050';
      c.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    }
    c.globalAlpha = 1;
    // Home (the Mega Hangar) on the rim when it's out of range.
    const hg = g.gen.hangar ?? g.gen.spawn;
    const hd = Math.hypot(hg.x - p.x, hg.y - p.y);
    const [hx, hy] = P(hd > range ? p.x + ((hg.x - p.x) / hd) * range * 0.95 : hg.x, hd > range ? p.y + ((hg.y - p.y) / hd) * range * 0.95 : hg.y);
    c.fillStyle = '#40c4ff';
    c.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 3, 3);
    // A horde on its way: the bearing it comes from.
    if (g.wave.phase !== 'calm') {
      const a = g.wave.dir + a0;
      c.fillStyle = Math.floor(this.time * 4) % 2 ? '#ff3030' : '#801010';
      for (let d = r - 6; d < r; d++) c.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 2, 2);
    }
    // Own ship in the middle, north on the rim.
    c.fillStyle = '#c8ffd0';
    c.fillRect(Math.round(cx) - 1, Math.round(cy) - 3, 3, 7);
    const na = -Math.PI / 2 + a0 + Math.PI / 2;
    pxMini(c, 'N', cx + Math.cos(na - Math.PI / 2) * (r - 4), cy + Math.sin(na - Math.PI / 2) * (r - 4) - 2, '#ff5040', 'center', null);
    // Scanlines.
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let yy = Math.round(cy - r); yy < cy + r; yy += 2) c.fillRect(Math.round(cx - r), yy, Math.round(r * 2), 1);
    pxMini(c, 'RADAR', x0 + 4, y0 + 3, '#c0b8a8');
    pxMini(c, `${range >= 1000 ? `${range / 1000}K` : range}M`, x0 + w - 4, y0 + MOD_H - 11, '#6aff7a', 'right');
    this.hit('radar', x0, y0, w, MOD_H - 3);
  }

  private panel(g: Game, x0: number, y0: number, w: number): void {
    const c = this.x;
    const p = g.player;
    const s = g.titan;
    const [l, r] = crawlersUp(s);
    const blink = Math.floor(this.time * 3) % 2 === 0;
    const fires = s.fire.some((f) => f > 0);
    const flood = s.flood.some((f) => f > 0.05);
    const lamps: [string, boolean, string][] = [
      ['FIRE', fires, '#ff3020'],
      ['FLOOD', flood, '#30a0ff'],
      ['TRACK', l + r < 8, '#ffa020'],
      ['FUEL', s.fuel < FUEL_MAX * 0.15, '#ffa020'],
      ['HULL', p.hp < p.stats.maxHp * 0.3, '#ff3020'],
      ['O-DRV', g.helm.overdrive, '#ffa020'],
      ['STORM', g.weather.phase !== 'none', '#e0e060'],
      ['HORDE', g.wave.phase !== 'calm', '#ff3020'],
      [isDocked(g) ? 'DOCK' : 'CAMP', isDocked(g) || g.deploy.state !== 'mobile', '#40ff60'],
    ];
    const lw = Math.floor((w - 8) / 3);
    lamps.forEach(([lab, on, col], i) => {
      const lx = x0 + 4 + (i % 3) * lw, ly = y0 + 4 + Math.floor(i / 3) * 10;
      const lit = on && (lab === 'HORDE' || lab === 'FIRE' || lab === 'HULL' ? blink : true);
      c.fillStyle = '#0a0a0a';
      c.fillRect(lx, ly, lw - 2, 9);
      c.fillStyle = lit ? col : shadeHex(col, 0.18);
      c.fillRect(lx + 1, ly + 1, lw - 4, 7);
      if (lit) {
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.fillRect(lx + 1, ly + 1, lw - 4, 1);
      }
      pxMini(c, lab, lx + (lw - 2) / 2, ly + 2, lit ? '#1a0a00' : shadeHex(col, 0.45), 'center', null);
    });
    // Toggle switches.
    const hm = g.helm;
    const toggles: [string, string, boolean, string][] = [
      ['lights', 'LIGHT', hm.lights, '#fff59d'],
      ['pumps', 'PUMP', hm.pumps, '#40c4ff'],
      ['arm', hm.safe ? 'SAFE' : 'ARMED', !hm.safe, '#76ff03'],
      ['divert', 'DIVRT', hm.divert, '#18ffff'],
    ];
    const tw = Math.floor((w - 8) / 4);
    toggles.forEach(([id, lab, on, col], i) => {
      const tx = x0 + 4 + i * tw + Math.floor(tw / 2), ty = y0 + 36;
      // LED, switch plate, the bat handle up or down.
      c.fillStyle = on ? col : '#202020';
      c.fillRect(tx - 1, ty, 3, 3);
      c.fillStyle = '#141414';
      c.fillRect(tx - 5, ty + 5, 11, 16);
      c.fillStyle = '#6a675f';
      c.fillRect(tx - 4, ty + 6, 9, 14);
      c.fillStyle = '#2a2826';
      c.fillRect(tx - 1, ty + 12, 3, 3);
      c.fillStyle = '#d8d0c0';
      if (on) {
        c.fillRect(tx - 1, ty + 5, 3, 8);
        c.fillRect(tx - 2, ty + 3, 5, 3);
      } else {
        c.fillRect(tx - 1, ty + 14, 3, 8);
        c.fillRect(tx - 2, ty + 20, 5, 3);
      }
      pxMini(c, lab, tx, ty + 25, '#c0b8a8', 'center');
      this.hit(id, tx - tw / 2, ty - 2, tw, 32);
    });
    // Push buttons, darkened while they recharge.
    const btns: [string, string, string, number][] = [
      ['horn', 'HORN', '#b08a20', hm.hornCd / HORN_CD],
      ['halon', 'HALON', '#2060a0', hm.halonCd / HALON_CD],
      ['camp', g.deploy.state === 'mobile' ? 'CAMP' : 'PACK', '#3a6a30', 0],
      ['warp', `WRP${g.warp}`, '#207080', 0],
    ];
    btns.forEach(([id, lab, col, cd], i) => {
      const bx = x0 + 4 + i * tw, by = y0 + 72;
      button(this.x, bx + 1, by, tw - 3, 13, lab, col, this.press[id] > 0, '#ffffff');
      if (cd > 0) {
        c.fillStyle = 'rgba(0,0,0,0.6)';
        c.fillRect(bx + 1, by, Math.round((tw - 3) * cd), 13);
      }
      this.hit(id, bx, by - 2, tw, 17);
    });
    pxMini(c, 'SYSTEMS', x0 + w / 2, y0 + MOD_H - 12, '#8a8272', 'center');
    void COMPARTMENTS;
  }

  /** The three overdrive stages (guarded push buttons, lit when running) and the ALL STOP mushroom. */
  private driveBox(g: Game, x0: number, y0: number, w: number): void {
    const c = this.x;
    const hm = g.helm;
    const ds = driveSpec(g, g.player);
    const cx = Math.round(x0 + w / 2);
    pxMini(c, 'OVERDRV', cx, y0 + 2, '#ffa020', 'center');
    for (let n = 1; n <= 3; n++) {
      const by = y0 + 10 + (n - 1) * 14;
      const lit = hm.overdrive && hm.odStage === n;
      const avail = n <= ds.odStages;
      // Hazard-striped guard, the button, its lamp.
      for (let i = 0; i < Math.floor((w - 6) / 4); i++) {
        c.fillStyle = i % 2 ? '#141414' : avail ? '#c09020' : '#4a4030';
        c.fillRect(x0 + 3 + i * 4, by, 4, 12);
      }
      const col = !avail ? '#2a2826' : lit ? (Math.floor(this.time * 6) % 2 ? '#ff6020' : '#ffb040') : '#5a2010';
      c.fillStyle = '#0a0a0a';
      c.fillRect(x0 + 6, by + 1, w - 12, 10);
      c.fillStyle = col;
      c.fillRect(x0 + 7, by + 2, w - 14, 8);
      pxMini(c, ['I', 'II', 'III'][n - 1], cx, by + 3, lit ? '#1a0800' : avail ? '#ffb080' : '#5a544c', 'center', null);
      this.hit(`od${n}`, x0 + 3, by, w - 6, 12);
    }
    // Engine heat under the buttons.
    c.fillStyle = '#0a0a0a';
    c.fillRect(x0 + 4, y0 + 53, w - 8, 3);
    c.fillStyle = hm.overheat ? '#ff3020' : hm.heat > 0.7 ? '#ffa020' : '#60c040';
    c.fillRect(x0 + 4, y0 + 53, Math.round((w - 8) * hm.heat), 3);
    // ALL STOP: the big red mushroom.
    const pr = this.press.stop > 0;
    const by = y0 + 62;
    c.fillStyle = '#e0b020';
    c.fillRect(cx - 14, by + 16, 28, 6);
    c.fillStyle = '#141414';
    c.fillRect(cx - 5, by + 12, 10, 8);
    disc(c, cx, by + 8 + (pr ? 2 : 0), 11, '#5a0a06');
    disc(c, cx, by + 7 + (pr ? 2 : 0), 10, '#d01a10');
    disc(c, cx - 3, by + 4 + (pr ? 2 : 0), 3.5, '#ff6a50');
    pxMini(c, 'STOP', cx, by + 25, '#ffd0c0', 'center');
    this.hit('stop', x0, by - 4, w, 36);
  }

  /** The toroid buttons (as the ship: fore pair on top) and the brake handle. */
  private engines(g: Game, x0: number, y0: number, w: number): void {
    const c = this.x;
    const s = g.titan;
    pxMini(c, 'TOROIDS', x0 + w / 2, y0 + 2, '#c0b8a8', 'center');
    // A little hull outline between the buttons.
    const cx = Math.round(x0 + w / 2);
    c.fillStyle = '#2a2824';
    c.fillRect(cx - 5, y0 + 14, 10, 50);
    c.fillStyle = '#5a564c';
    c.fillRect(cx - 3, y0 + 12, 6, 2);
    c.fillRect(cx - 4, y0 + 14, 1, 50);
    const bw = 20, bh = 20;
    for (let i = 0; i < 4; i++) {
      const bx = i % 2 === 0 ? x0 + 3 : x0 + w - 3 - bw;
      const by = y0 + 11 + (i < 2 ? 0 : bh + 4);
      const on = g.helm.toroids[i];
      const h = s.toroids[i];
      const out = toroidOut(s, g.helm.toroids, i);
      const pr = (this.press[`tor${i}`] ?? 0) > 0;
      c.fillStyle = '#141412';
      c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      c.fillStyle = on ? '#3a3e46' : '#26282c';
      c.fillRect(bx, by + (pr ? 1 : 0), bw, bh - 1);
      c.fillStyle = on ? '#5a606c' : '#34363a';
      c.fillRect(bx, by + (pr ? 1 : 0), bw, 1);
      // The lamp: lit green, hurt amber, dead red, off dark.
      const lamp = !on ? '#202020' : h <= 0.1 ? (Math.floor(this.time * 3) % 2 ? '#ff2010' : '#501008') : damageState(h).color;
      c.fillStyle = '#0a0a0a';
      c.fillRect(bx + bw / 2 - 4, by + 3 + (pr ? 1 : 0), 8, 6);
      c.fillStyle = lamp;
      c.fillRect(bx + bw / 2 - 3, by + 4 + (pr ? 1 : 0), 6, 4);
      pxMini(c, TOROIDS[i].short, bx + bw / 2, by + 11 + (pr ? 1 : 0), on ? '#e8e0d0' : '#707070', 'center', null);
      // Output bar.
      c.fillStyle = '#0a0a0a';
      c.fillRect(bx + 2, by + bh - 4, bw - 4, 2);
      c.fillStyle = '#18ffff';
      c.fillRect(bx + 2, by + bh - 4, Math.round((bw - 4) * out * (0.3 + 0.7 * g.player.spool)), 2);
      this.hit(`tor${i}`, bx, by, bw, bh);
    }
    // The brake handle: a notched quadrant, released on the left, full on the right.
    const ty = y0 + 72, tx = x0 + 6, tw = w - 12;
    pxMini(c, 'BRAKE', x0 + w / 2, ty - 8, g.helm.brake > 0 ? '#ff8060' : '#c0b8a8', 'center');
    c.fillStyle = '#0c0c0c';
    c.fillRect(tx, ty, tw, 3);
    for (let i = 0; i <= 4; i++) {
      c.fillStyle = i === 0 ? '#80c080' : '#ff6040';
      c.fillRect(tx + Math.round((tw * i) / 4), ty + 4, 1, 2);
    }
    const hx = Math.round(tx + g.helm.brake * tw);
    c.fillStyle = '#0a0a0a';
    c.fillRect(hx - 3, ty - 5, 7, 13);
    c.fillStyle = g.helm.brake > 0 ? '#c03020' : '#8a3a2a';
    c.fillRect(hx - 2, ty - 4, 5, 11);
    c.fillStyle = '#ff8a70';
    c.fillRect(hx - 2, ty - 4, 5, 2);
    pxMini(c, 'REL', tx, ty + 8, '#80c080', 'left', null);
    pxMini(c, 'FUL', tx + tw, ty + 8, '#ff8060', 'right', null);
    this.rects.brakeSlot = { id: 'slot', x: tx, y: ty, w: tw, h: 3 };
    this.hit('brake', x0, ty - 10, w, 24);
  }

  private throttle(g: Game, x0: number, y0: number, w: number): void {
    const c = this.x;
    const p = g.player;
    const top = y0 + 14, len = MOD_H - 26;
    const sx = x0 + w - 17;
    const yOf = (v: number): number => Math.round(top + ((1 - v) / 1.5) * len);
    pxMini(c, 'THROTTLE', x0 + w / 2, y0 + 2, '#c0b8a8', 'center');
    // Quadrant: the slot, the notches and their labels.
    c.fillStyle = '#0c0c0c';
    c.fillRect(sx - 2, top - 2, 5, len + 4);
    c.fillStyle = '#5a5850';
    c.fillRect(sx + 3, top - 2, 1, len + 4);
    const marks: [number, string][] = [[1, 'FUL'], [0.75, '3/4'], [0.5, '1/2'], [0.25, '1/4'], [0, 'STP'], [-0.25, 'R'], [-0.5, 'REV']];
    for (const [v, lab] of marks) {
      const y = yOf(v);
      c.fillStyle = v === 0 ? '#ffb030' : v < 0 ? '#ff6040' : '#8a8678';
      c.fillRect(sx - 6, y, 3, 1);
      pxMini(c, lab, sx - 8, y - 2, v === 0 ? '#ffb030' : v < 0 ? '#ff8060' : '#c0b8a8', 'right', null);
    }
    // Actual speed, a green needle on the scale.
    const sp = Math.max(-0.5, Math.min(1.05, p.speed / Math.max(1, p.stats.topSpeed)));
    c.fillStyle = '#6aff7a';
    c.fillRect(sx + 5, yOf(sp) - 1, 3, 3);
    // The handle.
    const y = yOf(g.helm.lever);
    c.fillStyle = '#0a0a0a';
    c.fillRect(sx - 9, y - 4, 19, 9);
    c.fillStyle = g.helm.lever < 0 ? '#a03020' : '#2a2a2a';
    c.fillRect(sx - 8, y - 3, 17, 7);
    c.fillStyle = g.helm.lever < 0 ? '#e06040' : '#707070';
    c.fillRect(sx - 8, y - 3, 17, 2);
    c.fillStyle = '#d8d0c0';
    c.fillRect(sx - 1, y - 1, 3, 3);
    this.rects.throttleSlot = { id: 'slot', x: sx, y: top, w: 1, h: len };
    this.hit('throttle', x0, y0, w, MOD_H - 3);
  }
}

/* ---------------------------------------------------------------------- */
/* Pixel helpers                                                           */
/* ---------------------------------------------------------------------- */

function darken(c: number): number {
  const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
  return pack(r * 0.62, g * 0.62, b * 0.66);
}

function lighten(c: number): number {
  const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
  return pack(r * 1.3 + 12, g * 1.3 + 12, b * 1.3 + 12);
}

const CLASS_COL: Record<string, string> = { juggernaut: '#38c8ff', bastion: '#ffd740', ark: '#76ff03', nightrunner: '#b388ff', dredge: '#ffab40' };

const tankSprites = new Map<string, HTMLCanvasElement>();

/** A hostile hull seen head-on: tracks, a sloped glacis, a turret, a gun. */
function tankSprite(col: string, px: number): HTMLCanvasElement {
  const S = Math.max(4, px);
  const key = `${col}|${S}`;
  let cv = tankSprites.get(key);
  if (cv) return cv;
  if (tankSprites.size > 200) tankSprites.clear();
  cv = document.createElement('canvas');
  cv.width = S;
  cv.height = Math.max(3, Math.round(S * 0.6));
  const x = cv.getContext('2d')!;
  const hh = cv.height;
  const R = (a: number, b: number, w: number, h2: number, c: string): void => {
    x.fillStyle = c;
    x.fillRect(Math.round(a * S), Math.round(b * hh), Math.max(1, Math.round(w * S)), Math.max(1, Math.round(h2 * hh)));
  };
  R(0, 0.55, 0.22, 0.45, '#1e1c1a');
  R(0.78, 0.55, 0.22, 0.45, '#1e1c1a');
  R(0.12, 0.35, 0.76, 0.5, col);
  R(0.12, 0.35, 0.76, 0.08, shadeHex(col, 1.5));
  R(0.3, 0.1, 0.4, 0.3, shadeHex(col, 0.8));
  R(0.46, 0, 0.08, 0.14, '#2a2a2a');
  R(0.2, 0.62, 0.08, 0.06, '#ff3020');
  R(0.72, 0.62, 0.08, 0.06, '#ff3020');
  return cv;
}
