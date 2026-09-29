import type { Game } from '../game/game';
import { ENEMIES } from '../game/enemyDefs';
import { isDocked } from '../game/campaign';
import { CLASSES } from '../game/classes';
import { dumpHalon, HALON_CD, HALON_WATER, HORN_CD, soundHorn } from '../game/systems/helm';
import { COMPARTMENTS, crawlersUp, FUEL_MAX, WATER_MAX } from '../game/systems/titan';
import { archFor, creatureSprite } from '../render/px/creatures2d';
import { glowSprite } from '../render/px/fx2d';
import { hash2, rgb } from '../render/px/pixels';
import { paintTitan } from '../render/px/titan2d';
import { paintTitanFlat } from '../render/px/titanSprite';
import { shipView } from '../render/px/shipArt';
import { OBS, OBS_COLOR, TER, TERRAIN } from '../shared/map';
import type { OpenWorld } from '../shared/mapgen';
import { ZONES } from '../shared/zones';
import { h } from './dom';
import { pxMini, pxText } from './pixfont';

/**
 * The captain's cabin: the forward cab at the Titan's bow, seen first person like the driving cab of a locomotive
 * or the inside of a tank. The top of the screen is the windscreen onto the wasteland (a voxel-space render of the
 * real map: ground, rocks, cliffs, buildings, your own hull behind you, creatures and shell bursts); the bottom is
 * the console, all pixel art and all of it live:
 *
 *  - the THROTTLE lever (drag it: full ahead to full astern, with a detent at stop) and the STEER lever;
 *  - a radar scope, a speed dial, a readout block and six supply gauges;
 *  - a panel of warning lamps, toggle switches (floodlights, bilge pumps, master arm, shield power to the drive)
 *    and push buttons (air horn, halon dump, camp, cruise warp);
 *  - the guarded OVERDRIVE switch and the ALL STOP mushroom.
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

const DASH_H = 118;
const LIP = 16;
const MOD_H = DASH_H - LIP;
const HEAD = 12;
/** Module widths, left to right. */
const MODS: [string, number][] = [['radar', 92], ['gauges', 104], ['panel', 116], ['drive', 38], ['throttle', 50]];
const ROW_W = MODS.reduce((a, [, w]) => a + w, 0) + (MODS.length - 1) * 2;
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
  private two = false;
  private hits: Hit[] = [];
  private drag: { id: string; pid: number; x0: number; v0: number } | null = null;
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
    this.cv.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
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
    const coarse = matchMedia('(pointer: coarse)').matches;
    let s = Math.max(1, Math.min(Math.floor(w / (ROW_W + 4)), Math.floor((hh * (coarse ? 0.62 : 0.5)) / DASH_H)));
    let two = false;
    if (Math.floor(w / s) < ROW_W + 4) {
      two = true;
      s = Math.max(1, Math.min(Math.floor(w / 240), Math.floor((hh * 0.5) / (LIP + MOD_H * 2))));
    }
    this.two = two;
    this.W = Math.ceil(w / s);
    this.H = Math.ceil(hh / s);
    this.cv.width = this.W;
    this.cv.height = this.H;
    this.cv.style.width = `${this.W * s}px`;
    this.cv.style.height = `${this.H * s}px`;
    const wh = Math.max(20, this.winB - HEAD);
    this.win.width = this.W;
    this.win.height = wh;
    this.img = this.wx.createImageData(this.W, wh);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.depth = new Float32Array(this.W * wh);
  }

  private get dashH(): number {
    return this.two ? LIP + MOD_H * 2 : DASH_H;
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
    if (k.id === 'throttle' || k.id === 'steer' || k.id === 'glass') {
      this.cv.setPointerCapture(e.pointerId);
      this.drag = { id: k.id, pid: e.pointerId, x0: px, v0: k.id === 'glass' ? this.look : 0 };
      this.dragTo(px, py);
      if (k.id === 'throttle') this.act.sound('ui');
      return;
    }
    this.click(k.id, g);
  }

  private move(e: PointerEvent): void {
    const [px, py] = this.pt(e);
    if (this.drag && this.drag.pid === e.pointerId) {
      this.dragTo(px, py);
      return;
    }
    const k = this.hitAt(px, py);
    const id = k?.id ?? '';
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.cv.style.cursor = !id ? 'default' : id === 'glass' ? 'grab' : 'pointer';
    }
  }

  private up(e: PointerEvent): void {
    if (!this.drag || this.drag.pid !== e.pointerId) return;
    if (this.drag.id === 'steer') this.steer = 0;
    this.drag = null;
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
    } else if (d.id === 'steer') {
      const r = this.rects.steerSlot;
      if (!r) return;
      this.steer = Math.max(-1, Math.min(1, ((px - (r.x + r.w / 2)) / (r.w / 2)) * 1.15));
      if (Math.abs(this.steer) < 0.08) this.steer = 0;
    } else if (d.id === 'glass') {
      this.look = d.v0 - ((px - d.x0) / this.W) * 2.2;
      this.look = Math.atan2(Math.sin(this.look), Math.cos(this.look));
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
      case 'odrive':
        this.act.overdrive();
        return;
      case 'stop':
        this.act.stop();
        this.act.sound('alarm');
        return;
    }
    this.act.sound('ui');
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  private rects: { throttleSlot?: Hit; steerSlot?: Hit } = {};

  render(g: Game, dt: number): void {
    if (!this.isOpen) return;
    if (this.game !== g) this.game = g;
    if (!this.img || this.cv.width !== this.W) this.resize();
    this.time += dt;
    for (const k of Object.keys(this.press)) this.press[k] -= dt;
    for (const m of this.ticker) m.t -= dt;
    this.ticker = this.ticker.filter((m) => m.t > 0);
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
    this.drawWorld(g);
    c.drawImage(this.win, 0, HEAD);
    this.drawNose(g);
    this.drawFlashes(g);
    this.drawGlassHud(g);
    this.drawFrame(g);
    this.drawDash(g);
    if (this.hitT > 0) {
      c.fillStyle = `rgba(255,20,0,${(this.hitT / 0.35) * 0.22})`;
      c.fillRect(0, 0, this.W, this.H);
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
    return { x: c.x, y: c.y, h: roof + 5, yaw: p.rot + this.look, lx, roof };
  }

  private focal(): number {
    return this.W / 2 / Math.tan((50 * Math.PI) / 180);
  }

  private horizon(): number {
    return Math.round(this.win.height * 0.3);
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
    const W = this.W, WH = this.win.height;
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
    const L2 = p.stats.length / 2, W2 = p.stats.width / 2;
    const hull = this.hullImage(g);
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
        // Your own hull.
        const ox = wx - p.x, oy = wy - p.y;
        const lx = ox * pc + oy * ps, lz = -ox * ps + oy * pc;
        if (lx > -L2 && lx < L2 && lz > -W2 && lz < W2) {
          hgt = lx > cam.lx ? cam.roof - 3 - (lx - cam.lx) * 4 : cam.roof;
          const hx = Math.round(hull.cx + lx * hull.ppm), hy = Math.round(hull.cy + lz * hull.ppm);
          const q = (hy * hull.w + hx) * 4;
          const lit = lights && z < 90 ? 1.25 : 1;
          if (hx >= 0 && hy >= 0 && hx < hull.w && hy < hull.h && hull.d[q + 3] > 0) col = pack(hull.d[q] * lit, hull.d[q + 1] * lit, hull.d[q + 2] * lit);
          else col = pack(70, 72, 76);
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
            // The lip of a rock or roof catches the light; building fronts get windows.
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
    const ppm = 1.5;
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
    const W = this.W, WH = this.win.height;
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
      const img = creatureSprite(archFor(e.kind, def?.arch), e.hitFlash > 0 ? '#ffffff' : def?.color ?? '#9e9e9e', px, Math.floor(e.anim * 2) & 1, e.boss ? 'boss' : e.elite ? 'elite' : 'normal');
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
    if (Math.abs(this.look) > 0.9) return;
    const c = this.x;
    const W = this.W, B = this.winB;
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
      return [this.W / 2 + (side * f) / z, hz + ((cam.h - hh) * f) / z, z];
    };
    c.save();
    c.beginPath();
    c.rect(0, HEAD, this.W, this.winB - HEAD);
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
      const gl = glowSprite('#fff8d0', this.W * 0.5);
      c.globalAlpha = 0.16;
      c.globalCompositeOperation = 'lighter';
      c.drawImage(gl, this.W * 0.3 - gl.width / 2, this.winB - gl.height * 0.35);
      c.drawImage(gl, this.W * 0.7 - gl.width / 2, this.winB - gl.height * 0.35);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }
    // Weather on the glass.
    if (g.weather.phase === 'active') {
      c.fillStyle = 'rgba(210,220,230,0.35)';
      const n = 60;
      for (let i = 0; i < n; i++) {
        const x = (hash2(i, Math.floor(this.time * 20), 9) * this.W) | 0;
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
    const W = this.W;
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
  /* The cab itself                                                    */
  /* ---------------------------------------------------------------- */

  private hit(id: string, x: number, y: number, w: number, hh: number): Hit {
    const k = { id, x, y, w, h: hh };
    this.hits.push(k);
    return k;
  }

  private drawFrame(g: Game): void {
    const c = this.x;
    const W = this.W, B = this.winB;
    this.hit('glass', 0, HEAD, W, B - HEAD);
    // Pillars between the three panes.
    for (const px of [Math.round(W * 0.26), Math.round(W * 0.74)]) {
      plate(c, px - 3, HEAD, 7, B - HEAD, '#34322e', this.noise);
      c.fillStyle = '#56534c';
      c.fillRect(px - 3, HEAD, 1, B - HEAD);
      c.fillStyle = '#1a1916';
      c.fillRect(px + 3, HEAD, 1, B - HEAD);
      for (let y = HEAD + 6; y < B - 4; y += 12) rivet(c, px, y);
    }
    // Side frames and the sill.
    plate(c, 0, HEAD, 4, B - HEAD, '#34322e', this.noise);
    plate(c, W - 4, HEAD, 4, B - HEAD, '#34322e', this.noise);
    // Glass: faint reflections.
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 3; i++) {
      const x0 = Math.round(W * (0.08 + i * 0.3));
      for (let k = 0; k < 18; k++) c.fillRect(x0 + k, HEAD + 4 + k * 2, 2, 2);
    }
    // A battered hull cracks the glass.
    const hp = g.player.hp / Math.max(1, g.player.stats.maxHp);
    if (hp < 0.35) crack(c, Math.round(W * 0.84), HEAD + 8, hp < 0.15 ? 5 : 3);
    // Ceiling: riveted plate, the compass tape, and the exit and vitals buttons.
    plate(c, 0, 0, W, HEAD, '#2e2c28', this.noise);
    c.fillStyle = '#141311';
    c.fillRect(0, HEAD - 1, W, 1);
    this.compass(g, Math.round(W / 2 - 70), 2, 140, 8);
    button(c, W - 52, 1, 48, 10, 'EXIT  F', '#7a2a20', this.press.exit > 0, '#ffd0c0');
    this.hit('exit', W - 52, 0, 52, HEAD);
    button(c, 4, 1, 48, 10, 'VITALS Y', '#24402a', this.press.vitals > 0, '#b0ffb0');
    this.hit('vitals', 0, 0, 54, HEAD);
    // Look buttons at the bottom corners of the glass.
    button(c, 8, B - 22, 14, 10, '<', '#2a2a30', this.press.lookL > 0, '#c0c8ff');
    this.hit('lookL', 6, B - 24, 18, 14);
    button(c, W - 22, B - 22, 14, 10, '>', '#2a2a30', this.press.lookR > 0, '#c0c8ff');
    this.hit('lookR', W - 24, B - 24, 18, 14);
    if (Math.abs(this.look) > 0.05) {
      button(c, W / 2 - 14, B - 22, 28, 10, 'FWD', '#2a2a30', this.press.lookF > 0, '#c0c8ff');
      this.hit('lookF', W / 2 - 16, B - 24, 32, 14);
    }
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
    // The console: a riveted slab below the glass, a darker top lip with the steering lever.
    plate(c, 0, y0, W, H - y0, '#3a3732', this.noise);
    c.fillStyle = '#1c1b18';
    c.fillRect(0, y0, W, 1);
    plate(c, 0, y0 + 1, W, LIP - 1, '#2a2825', this.noise);
    c.fillStyle = '#4a4740';
    c.fillRect(0, y0 + LIP - 1, W, 1);
    this.steerLever(g, y0);
    // Plaque and the clock on the lip.
    if (W > 300) {
      pxMini(c, `TITAN CRAWLER ${CLASSES[g.player.klass]?.name.toUpperCase() ?? ''}`.slice(0, 28), 6, y0 + 6, '#8a8272');
      const t = Math.floor(g.stats.time);
      pxMini(c, `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, W - 6, y0 + 6, '#ffb030', 'right');
    }
    // Modules.
    const rows: [string, number][][] = this.two ? [[MODS[0], MODS[1], MODS[3]], [MODS[2], MODS[4]]] : [MODS];
    let y = y0 + LIP;
    for (const row of rows) {
      const rw = row.reduce((a, [, w]) => a + w, 0) + (row.length - 1) * 2;
      let x = Math.round((W - rw) / 2);
      for (const [id, w] of row) {
        plate(c, x, y + 1, w, MOD_H - 3, '#44423c', this.noise);
        bevel(c, x, y + 1, w, MOD_H - 3);
        rivet(c, x + 2, y + 3);
        rivet(c, x + w - 3, y + 3);
        rivet(c, x + 2, y + MOD_H - 5);
        rivet(c, x + w - 3, y + MOD_H - 5);
        if (id === 'radar') this.radar(g, x, y + 1, w);
        else if (id === 'gauges') this.gauges(g, x, y + 1, w);
        else if (id === 'panel') this.panel(g, x, y + 1, w);
        else if (id === 'drive') this.driveBox(g, x, y + 1, w);
        else this.throttle(g, x, y + 1, w);
        x += w + 2;
      }
      y += MOD_H;
    }
    // Beside the console: pipes and a fire extinguisher, where there's room.
    const side = Math.floor((W - (this.two ? 240 : ROW_W)) / 2);
    if (side >= 22) {
      for (const sx of [6, W - 18]) {
        c.fillStyle = '#5a3a26';
        c.fillRect(sx, y0 + LIP + 4, 4, H - y0 - LIP - 8);
        c.fillStyle = '#8a5a3a';
        c.fillRect(sx, y0 + LIP + 4, 1, H - y0 - LIP - 8);
        c.fillStyle = '#2a2a2a';
        for (let yy = y0 + LIP + 12; yy < H - 8; yy += 22) c.fillRect(sx - 1, yy, 6, 2);
      }
      const ex = side >= 40 ? 14 : 0;
      if (ex) {
        c.fillStyle = '#a01a10';
        c.fillRect(ex, H - 42, 10, 30);
        c.fillStyle = '#e04030';
        c.fillRect(ex + 1, H - 41, 2, 28);
        c.fillStyle = '#222';
        c.fillRect(ex + 2, H - 46, 6, 4);
        pxMini(c, 'FIRE', ex + 5, H - 30, '#ffe0d0', 'center', null);
      }
    }
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

  private gauges(g: Game, x0: number, y0: number, w: number): void {
    const c = this.x;
    const p = g.player;
    const s = g.titan;
    // The speed dial.
    const kmh = Math.abs(p.speed) * 3.6;
    const max = Math.max(40, Math.ceil((p.stats.topSpeed * 3.6 * 1.6) / 20) * 20);
    const cx = x0 + 26, cy = y0 + 28, r = 21;
    disc(c, cx, cy, r + 2, '#1a1a18');
    disc(c, cx, cy, r + 1, '#8a8678');
    disc(c, cx, cy, r, '#e8e0c8');
    const a0 = Math.PI * 0.75, span = Math.PI * 1.5;
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (span * i) / 8;
      c.fillStyle = i >= 7 ? '#c02010' : '#202020';
      for (let d = r - 4; d < r - 1; d++) c.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1);
    }
    // The tachometer ring inside it: the engine's revs (she barely pulls until it has spooled up).
    for (let i = 0; i < 24; i++) {
      const a = a0 + (span * (i + 0.5)) / 24;
      const on = (i + 0.5) / 24 <= p.spool;
      c.fillStyle = on ? (p.spool > 0.92 ? '#20a030' : '#2080d0') : '#c8c0a8';
      c.fillRect(Math.round(cx + Math.cos(a) * (r - 7)), Math.round(cy + Math.sin(a) * (r - 7)), 1, 1);
    }
    pxMini(c, 'KMH', cx, cy + 7, '#505050', 'center', null);
    const na = a0 + span * Math.min(1.02, kmh / max);
    c.fillStyle = '#d01808';
    for (let d = 0; d < r - 3; d += 0.7) c.fillRect(Math.round(cx + Math.cos(na) * d), Math.round(cy + Math.sin(na) * d), 1, 1);
    disc(c, cx, cy, 2, '#202020');
    pxText(c, String(Math.round(kmh)).padStart(3, ' '), cx, y0 + 52, 1, 'amber', 'center');
    // Readouts.
    const hg = g.gen.hangar ?? g.gen.spawn;
    const dist = Math.hypot(hg.x - p.x, hg.y - p.y);
    const brg = ((((p.rot + Math.PI / 2) * 180) / Math.PI) % 360 + 360) % 360;
    const lines: [string, string, string][] = [
      ['HDG', String(Math.round(brg) % 360).padStart(3, '0'), '#ffb030'],
      ['THR', `${g.helm.lever >= 0 ? '+' : ''}${Math.round(g.helm.lever * 100)}%`, g.helm.lever < 0 ? '#ff6040' : '#ffb030'],
      ['RPM', `${Math.round(p.spool * 100)}%`, p.spool > 0.92 ? '#6aff7a' : '#40a8ff'],
      ['HOT', g.helm.overheat ? 'TRIP' : `${Math.round(g.helm.heat * 100)}%`, g.helm.overheat || g.helm.heat > 0.8 ? '#ff6040' : g.helm.heat > 0.5 ? '#ffb030' : '#6aff7a'],
      ['HNG', dist >= 1000 ? `${(dist / 1000).toFixed(1)}K` : `${Math.round(dist)}M`, '#40c4ff'],
    ];
    c.fillStyle = '#0a0c0a';
    c.fillRect(x0 + 52, y0 + 5, w - 57, 50);
    lines.forEach(([k, v, col], i) => {
      pxMini(c, k, x0 + 55, y0 + 8 + i * 9, '#6a8a70', 'left', null);
      pxMini(c, v, x0 + w - 8, y0 + 8 + i * 9, col, 'right', null);
    });
    // Six supply gauges.
    const bars: [string, number, string][] = [
      ['FUL', s.fuel / FUEL_MAX, '#ffb030'],
      ['H2O', s.water / WATER_MAX, '#40c4ff'],
      ['O2', Math.max(0, (s.oxygen - 0.15) / 0.06), '#b0f0ff'],
      ['TMP', Math.max(0, Math.min(1, (s.temp + 20) / 70)), s.temp > 32 || s.temp < 8 ? '#ff6040' : '#ffd740'],
      ['HUL', p.hp / Math.max(1, p.stats.maxHp), '#76ff03'],
      ['SHD', p.stats.shield > 0 ? p.shield / p.stats.shield : 0, '#18ffff'],
    ];
    const bw = Math.floor((w - 8) / 6);
    bars.forEach(([lab, v, col], i) => {
      const bx = x0 + 5 + i * bw, by = y0 + 60;
      const bh = 26;
      c.fillStyle = '#0a0a0a';
      c.fillRect(bx, by, bw - 4, bh);
      const low = lab !== 'TMP' && lab !== 'SHD' && v < 0.15;
      const fh = Math.round(Math.max(0, Math.min(1, v)) * (bh - 2));
      c.fillStyle = low && Math.floor(this.time * 3) % 2 ? '#ff2010' : col;
      c.fillRect(bx + 1, by + bh - 1 - fh, bw - 6, fh);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      for (let t = by + 5; t < by + bh; t += 5) c.fillRect(bx + 1, t, bw - 6, 1);
      pxMini(c, lab, bx + (bw - 4) / 2, by + bh + 3, '#c0b8a8', 'center');
    });
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

  private driveBox(g: Game, x0: number, y0: number, w: number): void {
    const c = this.x;
    const on = g.helm.overdrive;
    const cx = Math.round(x0 + w / 2);
    pxMini(c, 'O-DRV', cx, y0 + 38, '#ffa020', 'center');
    // A guarded switch: hazard-striped base, red flip cover (open when armed).
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? '#141414' : '#e0b020';
      c.fillRect(cx - 12 + i * 4, y0 + 11, 4, 22);
    }
    c.fillStyle = '#1a1a1a';
    c.fillRect(cx - 7, y0 + 14, 14, 16);
    c.fillStyle = on ? '#ffd0a0' : '#8a8a8a';
    if (on) c.fillRect(cx - 1, y0 + 15, 3, 8);
    else c.fillRect(cx - 1, y0 + 21, 3, 8);
    c.fillStyle = on ? 'rgba(200,30,20,0.45)' : 'rgba(200,30,20,0.85)';
    if (on) c.fillRect(cx - 8, y0 + 8, 16, 4);
    else c.fillRect(cx - 8, y0 + 13, 16, 18);
    c.fillStyle = on && Math.floor(this.time * 4) % 2 ? '#ffa020' : '#301a08';
    c.fillRect(cx - 2, y0 + 4, 5, 3);
    this.hit('odrive', x0, y0, w, 42);
    // ALL STOP: the big red mushroom.
    const pr = this.press.stop > 0;
    const by = y0 + 50;
    c.fillStyle = '#e0b020';
    c.fillRect(cx - 14, by + 16, 28, 6);
    c.fillStyle = '#141414';
    c.fillRect(cx - 5, by + 12, 10, 8);
    disc(c, cx, by + 8 + (pr ? 2 : 0), 12, '#5a0a06');
    disc(c, cx, by + 7 + (pr ? 2 : 0), 11, '#d01a10');
    disc(c, cx - 3, by + 4 + (pr ? 2 : 0), 4, '#ff6a50');
    pxMini(c, 'STOP', cx, by + 26, '#ffd0c0', 'center');
    this.hit('stop', x0, by - 6, w, 42);
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

function lighten(c: number): number {
  const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
  return pack(r * 1.3 + 12, g * 1.3 + 12, b * 1.3 + 12);
}

function shadeHex(hex: string, k: number): string {
  const [r, g, b] = rgb(hex);
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}

function makeNoise(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const x = c.getContext('2d')!;
  const img = x.createImageData(64, 64);
  for (let i = 0; i < 64 * 64; i++) {
    const n = hash2(i % 64, Math.floor(i / 64), 17);
    const v = n < 0.08 ? 0 : n > 0.95 ? 255 : 128;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = v === 128 ? 0 : 40;
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** A metal plate: a flat colour with grain. */
function plate(c: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, col: string, noise: HTMLCanvasElement): void {
  c.fillStyle = col;
  c.fillRect(x, y, w, hh);
  const pat = c.createPattern(noise, 'repeat');
  if (pat) {
    c.fillStyle = pat;
    c.fillRect(x, y, w, hh);
  }
}

function bevel(c: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number): void {
  c.fillStyle = '#6a675f';
  c.fillRect(x, y, w, 1);
  c.fillRect(x, y, 1, hh);
  c.fillStyle = '#1e1d1a';
  c.fillRect(x, y + hh - 1, w, 1);
  c.fillRect(x + w - 1, y, 1, hh);
}

function rivet(c: CanvasRenderingContext2D, x: number, y: number): void {
  c.fillStyle = '#1a1916';
  c.fillRect(x, y + 1, 2, 1);
  c.fillStyle = '#9a968a';
  c.fillRect(x, y, 1, 1);
  c.fillStyle = '#6a675f';
  c.fillRect(x + 1, y, 1, 1);
}

function disc(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string): void {
  c.fillStyle = col;
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
    const t = (yy + 0.5 - cy) / r;
    if (Math.abs(t) > 1) continue;
    const hw = r * Math.sqrt(1 - t * t);
    const a = Math.round(cx - hw), b = Math.round(cx + hw);
    if (b > a) c.fillRect(a, yy, b - a, 1);
  }
}

function ringPx(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string): void {
  c.fillStyle = col;
  const n = Math.max(12, Math.round(r * 6));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    c.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
}

function button(c: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, label: string, col: string, pressed: boolean, ink: string): void {
  x = Math.round(x);
  y = Math.round(y);
  c.fillStyle = '#0a0a0a';
  c.fillRect(x, y, w, hh);
  c.fillStyle = pressed ? shadeHex(col, 0.7) : col;
  c.fillRect(x + 1, y + 1, w - 2, hh - 2);
  if (!pressed) {
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.fillRect(x + 1, y + 1, w - 2, 1);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(x + 1, y + hh - 2, w - 2, 1);
  }
  pxMini(c, label, x + w / 2, y + Math.floor((hh - 5) / 2) + (pressed ? 1 : 0), ink, 'center');
}

function bracket(c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string): void {
  c.fillStyle = col;
  const a = Math.round(x - s / 2), b = Math.round(y - s / 2), e = Math.round(s), k = Math.max(2, Math.round(s / 4));
  c.fillRect(a, b, k, 1);
  c.fillRect(a, b, 1, k);
  c.fillRect(a + e - k, b, k, 1);
  c.fillRect(a + e - 1, b, 1, k);
  c.fillRect(a, b + e - 1, k, 1);
  c.fillRect(a, b + e - k, 1, k);
  c.fillRect(a + e - k, b + e - 1, k, 1);
  c.fillRect(a + e - 1, b + e - k, 1, k);
}

function crack(c: CanvasRenderingContext2D, x: number, y: number, n: number): void {
  c.fillStyle = 'rgba(230,240,255,0.55)';
  for (let k = 0; k < n; k++) {
    let px = x, py = y;
    const a = 1.2 + k * 0.7;
    for (let i = 0; i < 26; i++) {
      px += Math.cos(a + (hash2(k, i, 2) - 0.5) * 1.4) * 2;
      py += Math.sin(a + (hash2(k, i, 3) - 0.5) * 1.4) * 2;
      c.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
  }
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
