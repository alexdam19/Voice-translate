import { COMPOUND, FORWARD } from '../shared/compound';
import { drawTitan3D, ship3DActive, SHIP_LEAN, shipRoofAt } from './ship3d';
import { nozzleW } from './ship3d/model';
import { beginCreatures3D, drawCreature3D } from './creature3d';
import { drawCompoundGround, drawCompoundOverhead, drawCompoundPeople, drawCompoundTags, type CompoundView } from './px/compound2d';
import { CHEST_INFO } from '../game/chests';
import { MODULES, TITAN_DECK_INFO, TITAN_LIFTS, TITAN_SPINE } from '../game/defs';
import type { Enemy } from '../game/entities';
import { ENEMIES } from '../game/enemyDefs';
import type { FxEvent, Game } from '../game/game';
import { SITE_RADIUS } from '../game/systems/world';
import { STORMS } from '../game/systems/weather';
import type { Tank } from '../game/tank';
import { getItem } from '../shared/items';
import { Fog } from '../shared/fog';
import { TER } from '../shared/map';
import { NODE_INFO, RUNE_INFO } from '../shared/mapgen';
import { RARITIES } from '../shared/rarity';
import { DEAD_ZONE, ZONES } from '../shared/zones';
import { allySprite, archFor, creatureSprite, lookFor } from './px/creatures2d';
import { Fx2D, glowSprite, type ScreenMap } from './px/fx2d';
import { makeCanvas, mix, shade } from './px/pixels';
import { BLOCK, Terrain2D } from './px/terrain2d';
import { paintSmallTank, type HullLight } from './px/titan2d';
import { paintTitanHD } from './px/titanhd';
import { drawTitanSprite } from './px/titanSprite';
import { stackSpots } from './px/titanTop';
import { engineDef } from '../game/systems/engine';
import { airshipSprite, altarSprite, gateSprite, nodeSprite, siteSprite } from './px/decorArt';
import { drawOhv, ohvCanvas, ohvFlash, ohvFrame, ohvOneShot, ohvSheet, ohvSteps, preloadOhv } from './px/ohv';
import { ohvLookFor } from './px/ohvLooks';
import { drawColossus, type ColossusView } from './px/colossusDraw';
import { prewarmColossi } from './px/colossusArt';
import { visZ } from './px/fx2d';
import { hatFor, topPerson } from './px/people';
import { hero, heroFoot, heroIfPainted } from './px/heroes';
import { foeFor, foePose, type Foe } from './px/foes';
import { quantizeSize } from './px/creaturesHD';
import { speciesFor } from './px/monsters';
import type { Aboard } from '../game/aboard';

/**
 * The world from straight above, as pixel art: the Crater's ground baked a metre to the pixel, your Titan and
 * everything else at their real size (with a floor on how small a creature is drawn, so a horde of rats still
 * reads), effects, weather and the fog of war. Drawn into a low-resolution buffer that the page scales up with
 * hard pixel edges.
 *
 * It keeps the old 3D view's interface (camera, picking, markers), so the HUD, overlay and input don't care which
 * one is running. `cam.zoom` is how far back the camera sits; the view shows about `zoom x 1.8` metres top to
 * bottom (x 0.6 for the close-up base view).
 */

export function readShakeSetting(): boolean {
  try {
    return localStorage.getItem('ironcrawl-shake') === '1';
  } catch {
    return false;
  }
}

const TELE_ALPHA = 0.35;
const ZONE_COLOR: Record<string, string> = { fire: '#ff6d00', acid: '#76ff03', well: '#d500f9', chrono: '#18ffff', rad: '#c6ff00', frost: '#80deea', smoke: '#9e9e9e' };
const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/** Fog of war as a soft, low-resolution layer (4 m per pixel) around the camera. */
class FogLayer {
  static readonly N = 512;
  static readonly STEP = 4;
  readonly canvas = makeCanvas(FogLayer.N, FogLayer.N);
  private img = new ImageData(FogLayer.N, FogLayer.N);
  ox = 0;
  oy = 0;
  private t = 0;
  private ver = -1;

  update(g: Game, cx: number, cy: number, dt: number): void {
    this.t -= dt;
    const span = FogLayer.N * FogLayer.STEP;
    const far = Math.abs(cx - (this.ox + span / 2)) > span * 0.2 || Math.abs(cy - (this.oy + span / 2)) > span * 0.2;
    if (!far && (this.t > 0 || g.fogVersion === this.ver)) return;
    this.t = 0.25;
    this.ver = g.fogVersion;
    const S = FogLayer.STEP, N = FogLayer.N;
    this.ox = Math.floor((cx - span / 2) / 32) * 32;
    this.oy = Math.floor((cy - span / 2) / 32) * 32;
    const d = this.img.data;
    const fog = g.fog;
    const cps = Math.ceil(fog.size / 32);
    // Unexplored by default; explored chunk by chunk; then what's in sight.
    for (let i = 0; i < N * N; i++) {
      d[i * 4] = 7;
      d[i * 4 + 1] = 7;
      d[i * 4 + 2] = 11;
      d[i * 4 + 3] = 196;
    }
    const perChunk = 32 / S;
    for (let ky = 0; ky < N / perChunk; ky++) {
      const wy = this.oy + ky * 32;
      if (wy < 0 || wy >= fog.size) continue;
      for (let kx = 0; kx < N / perChunk; kx++) {
        const wx = this.ox + kx * 32;
        if (wx < 0 || wx >= fog.size) continue;
        const seen = fog.seen.get((wy >> 5) * cps + (wx >> 5));
        if (!seen) continue;
        for (let sy = 0; sy < perChunk; sy++) {
          for (let sx = 0; sx < perChunk; sx++) {
            if (!seen[((sy * S + 2) << 5) | (sx * S + 2)]) continue;
            d[((ky * perChunk + sy) * N + kx * perChunk + sx) * 4 + 3] = 95;
          }
        }
      }
    }
    const W = Fog.W;
    for (let vy = 0; vy < W; vy += S) {
      const py = Math.floor((fog.oy + vy - this.oy) / S);
      if (py < 0 || py >= N) continue;
      for (let vx = 0; vx < W; vx += S) {
        if (!fog.vis[vy * W + vx]) continue;
        const px = Math.floor((fog.ox + vx - this.ox) / S);
        if (px >= 0 && px < N) d[(py * N + px) * 4 + 3] = 0;
      }
    }
    for (const r of fog.lit) {
      const px0 = Math.max(0, Math.floor((r.x0 - this.ox) / S)), px1 = Math.min(N, Math.ceil((r.x1 - this.ox) / S));
      const py0 = Math.max(0, Math.floor((r.y0 - this.oy) / S)), py1 = Math.min(N, Math.ceil((r.y1 - this.oy) / S));
      for (let py = py0; py < py1; py++) for (let px = px0; px < px1; px++) d[(py * N + px) * 4 + 3] = 0;
    }
    this.canvas.getContext('2d')!.putImageData(this.img, 0, 0);
  }
}

/** How far up the screen one metre of height lifts things (hulls, shots, climbing creatures, particles). */
export const ZK = 0.4;

export class View2D {
  /** Camera target, distance, heading of "up the screen" (radians), and (kept for the 3D view) pitch and fov. */
  cam = { x: 320, y: 320, zoom: 38, yaw: -Math.PI / 2, pitch: 56, fov: 32 };
  aim: { x: number; y: number; r: number; color: string } | null = null;
  beacon: { x: number; y: number; color: string } | null = null;
  width = 1;
  height = 1;
  rw = 1;
  rh = 1;
  pixelScale = 3;
  time = 0;
  rangeR = 0;
  /** Dark outlines round creatures (they're always on in 2D; kept for the menu toggle). */
  outlines = true;
  /** Which deck of your fortress the base view shows (0 = roof; lower decks are drawn as a cutaway). */
  deckView = 0;
  /** Screen shake is off unless you turn it on in the menu: the view holds steady on the ship. */
  /** Everyone aboard (the base view draws them on the deck being shown). */
  aboard: Aboard | null = null;
  shakeOn = readShakeSetting();
  private ctx: CanvasRenderingContext2D;
  private terrain: Terrain2D | null = null;
  private fx = new Fx2D(COARSE ? 1800 : 3500);
  private fog = new FogLayer();
  private shakeAmt = 0;
  private shx = 0;
  private shy = 0;
  private marker: { x: number; y: number; color: string; t: number } | null = null;
  private heading = new Map<number, { x: number; y: number; a: number }>();
  private headT = 0;
  private stormK = 0;
  private silhouette = makeCanvas(4, 4);
  /** Cached per-frame transform. */
  private th = 0;
  private ct = 1;
  private st = 0;
  private camX = 0;
  private camY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.resize();
    preloadOhv();
    // Paint the colossi now, not in the frame one first walks in.
    setTimeout(() => prewarmColossi(), 1500);
  }

  /* ---------------- camera maths ---------------- */

  /** Metres from the top of the screen to the bottom. */
  get visibleH(): number {
    return Math.max(20, this.cam.zoom * (this.cam.fov > 40 ? 1.3 : 0.8));
  }

  /** Snap to a pixel-perfect scale (half, one or two pixels per metre) when the zoom is near one. */
  snap = false;

  /** Buffer pixels per metre. */
  get ppm(): number {
    const raw = this.rh / this.visibleH;
    if (this.snap) for (const n of [0.5, 1, 2, 3]) if (raw / n > 0.72 && raw / n < 1.38) return n;
    return raw;
  }

  /** Screen (CSS) pixels per metre. */
  get cssPpm(): number {
    return this.ppm * (this.height / this.rh);
  }

  /** Ground radius around the camera that can be on screen. */
  get groundR(): number {
    return Math.hypot(this.rw, this.rh) / this.ppm / 2 + 20;
  }

  /** Kept for callers of the old view; 2D draws small things at a minimum size instead. */
  get unitScale(): number {
    return 1;
  }

  private setupTransform(): void {
    this.th = -Math.PI / 2 - this.cam.yaw;
    // North-up views snap to whole pixels so nothing swims; rotated (base) views don't need to.
    if (Math.abs(Math.sin(this.th)) < 1e-6 && Math.cos(this.th) > 0) this.th = 0;
    this.ct = Math.cos(this.th);
    this.st = Math.sin(this.th);
    const ppm = this.ppm;
    this.camX = this.th === 0 ? Math.round(this.cam.x * ppm) / ppm : this.cam.x;
    this.camY = this.th === 0 ? Math.round(this.cam.y * ppm) / ppm : this.cam.y;
  }

  /** World -> buffer pixel. */
  private bx(x: number, y: number): number {
    const dx = x - this.camX, dy = y - this.camY;
    return this.rw / 2 + (dx * this.ct - dy * this.st) * this.ppm + this.shx;
  }

  private by(x: number, y: number): number {
    const dx = x - this.camX, dy = y - this.camY;
    return this.rh / 2 + (dx * this.st + dy * this.ct) * this.ppm + this.shy;
  }

  private map: ScreenMap = {
    sx: (x, y) => this.bx(x, y),
    sy: (x, y) => this.by(x, y),
    ppm: 1,
  };

  /** Screen (CSS px) -> ground point (heights don't matter from straight above). */
  screenToPlane(sx: number, sy: number, _h: number): { x: number; y: number } {
    this.setupTransform();
    const k = this.rw / this.width;
    const px = (sx * k - this.rw / 2 - this.shx) / this.ppm, py = (sy * k - this.rh / 2 - this.shy) / this.ppm;
    return { x: this.camX + px * this.ct + py * this.st, y: this.camY - px * this.st + py * this.ct };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return this.screenToPlane(sx, sy, 0);
  }

  /** World -> screen (CSS px). */
  worldToScreen(x: number, y: number, _h = 0): { x: number; y: number; ok: boolean } {
    const k = this.width / this.rw;
    return { x: this.bx(x, y) * k, y: this.by(x, y) * k, ok: true };
  }

  /* ---------------- setup ---------------- */

  setWorld(g: Game): void {
    if (!this.terrain) this.terrain = new Terrain2D(g.map);
    else this.terrain.setMap(g.map);
    // The Mega Hangar's compound stands up in 2.5D on its own (compound2d); the ground under it stays flat.
    const h = g.mode === 'world' ? g.gen.hangar : null;
    this.terrain.flat = h ? { x0: h.x + COMPOUND.x0 - 30, y0: h.y + COMPOUND.y0 - 30, x1: h.x + COMPOUND.x1 + 30, y1: h.y + FORWARD.y1 + 20 } : null;
    this.heading.clear();
  }

  /** The canvas the view is drawn into (the cabin's drone camera borrows it). */
  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w;
    this.height = h;
    // High-resolution pixel art: one art pixel to the screen pixel (two on very big screens).
    const ps = w * h > 5000000 ? 2 : 1;
    this.pixelScale = ps;
    this.rw = Math.max(64, Math.floor(w / ps));
    this.rh = Math.max(64, Math.floor(h / ps));
    this.canvas.width = this.rw;
    this.canvas.height = this.rh;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.style.imageRendering = 'pixelated';
    this.ctx.imageSmoothingEnabled = false;
  }

  shake(a: number): void {
    if (!this.shakeOn) return;
    this.shakeAmt = Math.min(1.5, this.shakeAmt + a * 0.5);
  }

  moveMarker(x: number, y: number, color = '#76ff03'): void {
    this.marker = { x, y, color, t: 0.5 };
  }

  /* ---------------- frame ---------------- */

  render(g: Game, dt: number): void {
    this.time += dt;
    this.shakeAmt *= Math.pow(0.02, dt);
    this.shx = this.shakeAmt > 0.02 ? Math.round((Math.random() - 0.5) * this.shakeAmt * 6) : 0;
    this.shy = this.shakeAmt > 0.02 ? Math.round((Math.random() - 0.5) * this.shakeAmt * 6) : 0;
    this.setupTransform();
    this.map.ppm = this.ppm;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = false;
    const zd = g.mode === 'raid' ? DEAD_ZONE : ZONES[g.map.zoneAt(this.cam.x, this.cam.y)] ?? ZONES[0];
    c.fillStyle = zd.ground;
    c.fillRect(0, 0, this.rw, this.rh);
    if (g.dirtyChunks.size) {
      for (const k of g.dirtyChunks) this.terrain?.invalidate(k % 8192, Math.floor(k / 8192));
      g.dirtyChunks.clear();
    }
    for (const e of g.fx) this.handleFx(e);
    g.fx.length = 0;
    this.drawTerrain(g);
    this.drawTrackMarks(g);
    this.fx.drawGround(c, this.map, this.rw, this.rh);
    this.drawDecals(g);
    this.drawFeatures(g);
    drawCompoundGround(this.cview(), g);
    this.drawPickups(g);
    drawCompoundPeople(this.cview(), g);
    this.drawTanks(g);
    drawCompoundOverhead(this.cview(), g);
    drawCompoundTags(this.cview(), g);
    this.drawColossi(g);
    if (this.deckView > 0 && g.player.titan) this.drawDeckCutaway(g.player, this.deckView);
    this.drawEnemies(g, false);
    this.drawAllies(g, false);
    this.drawProjectiles(g);
    this.drawEnemies(g, true);
    this.drawAllies(g, true);
    this.drawAirships(g);
    this.shipEffects(g, dt);
    this.fx.update(dt);
    this.fx.draw(c, this.map, this.rw, this.rh);
    this.drawSpriteFx(dt);
    this.drawWeather(g, dt);
    if (g.mode === 'world' && !g.revealAll) this.drawFog(g, dt);
    this.drawMarkers(g, dt);
    this.drawVignette();
  }

  private vignette: HTMLCanvasElement | null = null;

  /** Darkened corners pull the eye to the ship in the middle. */
  private drawVignette(): void {
    if (!this.vignette || this.vignette.width !== this.rw || this.vignette.height !== this.rh) {
      const v = makeCanvas(this.rw, this.rh);
      const x = v.getContext('2d')!;
      const g = x.createRadialGradient(this.rw / 2, this.rh / 2, Math.min(this.rw, this.rh) * 0.35, this.rw / 2, this.rh / 2, Math.hypot(this.rw, this.rh) * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.45)');
      x.fillStyle = g;
      x.fillRect(0, 0, this.rw, this.rh);
      this.vignette = v;
    }
    this.ctx.drawImage(this.vignette, 0, 0);
  }

  /* ---------------- ground ---------------- */

  private drawTerrain(g: Game): void {
    const t = this.terrain;
    if (!t) return;
    t.beginFrame();
    const c = this.ctx;
    const ppm = this.ppm;
    const R = this.groundR;
    const x0 = Math.floor((this.cam.x - R) / BLOCK), x1 = Math.floor((this.cam.x + R) / BLOCK);
    const y0 = Math.floor((this.cam.y - R) / BLOCK), y1 = Math.floor((this.cam.y + R) / BLOCK);
    const lod = ppm >= 0.7 ? 0 : ppm >= 0.35 ? 1 : 2;
    // Shrinking a block is smoothed (no shimmer); blowing one up keeps hard pixels.
    c.imageSmoothingEnabled = ppm < 1 / (1 << lod) - 1e-6;
    // Blocks nearest the middle first, so the budget goes where you're looking.
    const list: [number, number, number][] = [];
    for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) list.push([bx, by, Math.hypot((bx + 0.5) * BLOCK - this.cam.x, (by + 0.5) * BLOCK - this.cam.y)]);
    list.sort((a, b) => a[2] - b[2]);
    const budget = list.length > 40 ? 5 : 8;
    const rot = this.th !== 0;
    if (rot) c.setTransform(this.ct * ppm, this.st * ppm, -this.st * ppm, this.ct * ppm, this.bx(0, 0), this.by(0, 0));
    for (const [bx, by] of list) {
      if (bx < 0 || by < 0 || bx * BLOCK >= g.map.size || by * BLOCK >= g.map.size) continue;
      let img = t.get(bx, by, lod, budget);
      // Close in, the high-resolution copy (two or four pixels a tile) once it's ready.
      if (img && lod === 0 && ppm >= 1.4) img = t.getHD(bx, by, ppm >= 3 ? 4 : 2, 2) ?? img;
      const wx = bx * BLOCK, wy = by * BLOCK;
      if (rot) {
        if (img) c.drawImage(img, wx - 0.25, wy - 0.25, BLOCK + 0.5, BLOCK + 0.5);
        else {
          c.fillStyle = ZONES[g.map.zoneAt(wx + 64, wy + 64)]?.ground ?? '#333';
          c.fillRect(wx, wy, BLOCK, BLOCK);
        }
        continue;
      }
      const sx0 = Math.round(this.bx(wx, wy)), sy0 = Math.round(this.by(wx, wy));
      const sx1 = Math.round(this.bx(wx + BLOCK, wy)), sy1 = Math.round(this.by(wx, wy + BLOCK));
      if (sx1 < 0 || sy1 < 0 || sx0 > this.rw || sy0 > this.rh) continue;
      if (img) c.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0);
      else {
        c.fillStyle = ZONES[g.map.zoneAt(wx + 64, wy + 64)]?.ground ?? '#333';
        c.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
  }

  private drawTrackMarks(g: Game): void {
    const tm = g.trackMarks;
    const c = this.ctx;
    const ppm = this.ppm;
    const R = this.groundR;
    c.fillStyle = '#000';
    const cap = tm.buf.length / 3;
    for (let k = 0; k < tm.n; k++) {
      const i = (tm.head - 1 - k + cap) % cap;
      const x = tm.buf[i * 3], y = tm.buf[i * 3 + 1], r = tm.buf[i * 3 + 2];
      if (Math.abs(x - this.cam.x) > R || Math.abs(y - this.cam.y) > R) continue;
      // Older marks fade.
      c.globalAlpha = 0.22 * (1 - k / cap);
      const a = r + this.th;
      c.setTransform(Math.cos(a) * ppm, Math.sin(a) * ppm, -Math.sin(a) * ppm, Math.cos(a) * ppm, this.bx(x, y), this.by(x, y));
      c.fillRect(-5, -2.1, 10, 4.2);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
  }

  /** Circles and lines on the ground in world metres (the view's rotation applied). */
  private worldPath(): void {
    const ppm = this.ppm;
    this.ctx.setTransform(this.ct * ppm, this.st * ppm, -this.st * ppm, this.ct * ppm, this.bx(0, 0), this.by(0, 0));
  }

  private drawDecals(g: Game): void {
    const c = this.ctx;
    const ppm = this.ppm;
    this.worldPath();
    for (const t of g.telegraphs) {
      const k = Math.min(1, t.t / t.total);
      c.globalAlpha = TELE_ALPHA;
      c.fillStyle = t.color;
      c.strokeStyle = t.color;
      c.lineWidth = 1.5 / ppm;
      if (t.shape === 'circle') {
        c.beginPath();
        c.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        c.globalAlpha = 0.9;
        c.stroke();
        c.globalAlpha = 0.18 + 0.3 * k;
        c.beginPath();
        c.arc(t.x, t.y, Math.max(0.1, t.r * k), 0, Math.PI * 2);
        c.fill();
      } else {
        c.save();
        c.translate(t.x, t.y);
        c.rotate(t.a);
        c.globalAlpha = 0.9;
        c.strokeRect(0, -t.r, t.len, t.r * 2);
        c.globalAlpha = 0.18 + 0.3 * k;
        c.fillRect(0, -t.r, t.len * k, t.r * 2);
        c.restore();
      }
    }
    for (const z of g.zones) {
      const col = ZONE_COLOR[z.kind] ?? '#d500f9';
      c.globalAlpha = (z.kind === 'well' || z.kind === 'rad' ? 0.14 : 0.22) + 0.06 * Math.sin(this.time * 10 + z.id);
      c.fillStyle = col;
      c.beginPath();
      c.arc(z.x, z.y, z.r * (1 + 0.04 * Math.sin(this.time * 8)), 0, Math.PI * 2);
      c.fill();
      if (Math.random() < 0.4) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * z.r;
        this.fx.emit(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r, 0, 0, 0, 2, 0.6, Math.max(0.4, z.r * 0.08), col, { add: z.kind !== 'smoke', alpha: 0.8 });
      }
    }
    // Loot areas and extraction zones: rings on the ground.
    if (g.mode === 'world') {
      for (const s of g.gen.sites) {
        if (!this.near(s.x, s.y, 40) || !g.isExplored(s.x, s.y)) continue;
        const ready = s.readyAt <= g.time;
        c.globalAlpha = ready ? 0.5 : 0.25;
        c.strokeStyle = ready ? '#ffd740' : '#9e9e9e';
        c.lineWidth = Math.max(1 / ppm, 0.4);
        c.setLineDash([2, 1.5]);
        c.beginPath();
        c.arc(s.x, s.y, SITE_RADIUS * 2.5, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
      }
    }
    for (const e of g.extracts) {
      c.globalAlpha = 0.35 + 0.1 * Math.sin(this.time * 4);
      c.strokeStyle = '#76ff03';
      c.lineWidth = Math.max(1 / ppm, 0.6);
      c.beginPath();
      c.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 0.08;
      c.fillStyle = '#76ff03';
      c.fill();
    }
    if (this.rangeR > 0 && !g.player.dead) {
      c.globalAlpha = 0.08;
      c.fillStyle = '#4dd0e1';
      c.beginPath();
      c.arc(g.player.x, g.player.y, this.rangeR, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 0.4;
      c.strokeStyle = '#4dd0e1';
      c.lineWidth = 1 / ppm;
      c.stroke();
    }
    c.globalAlpha = 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  private near(x: number, y: number, pad: number): boolean {
    const R = this.groundR + pad;
    return Math.abs(x - this.cam.x) < R && Math.abs(y - this.cam.y) < R;
  }

  private drawFeatures(g: Game): void {
    if (g.mode !== 'world') return;
    const c = this.ctx;
    const ppm = this.ppm;
    // Resource nodes: ore boulders with veins, crystal clusters, scrap heaps, vents, fungus beds.
    for (const n of g.gen.nodes) {
      if (n.respawnAt > 0 || !this.near(n.x, n.y, 12) || !g.isExplored(n.x, n.y)) continue;
      const info = NODE_INFO[n.type];
      const fill = n.amount / n.max;
      const s = Math.max(10, Math.round((6 + fill * 4) * ppm));
      const img = nodeSprite(n.type, info.color, s, fill, n.id);
      const x = Math.round(this.bx(n.x, n.y)), y = Math.round(this.by(n.x, n.y));
      c.drawImage(img, x - img.width / 2, y - img.height / 2);
      if (g.harvestId === n.id) {
        c.strokeStyle = '#ffd740';
        c.lineWidth = 1;
        c.strokeRect(x - s / 2 - 2.5, y - s / 2 - 2.5, s + 5, s + 5);
      }
    }
    // Loot areas: a wreck or a ruin, with a lit crate while there's something in it.
    for (const st of g.gen.sites) {
      if (!this.near(st.x, st.y, 20) || !g.isExplored(st.x, st.y)) continue;
      const ready = st.readyAt <= g.time;
      const img = siteSprite(st.name, Math.max(14, Math.round(16 * ppm)), ready, st.id);
      c.drawImage(img, Math.round(this.bx(st.x, st.y) - img.width / 2), Math.round(this.by(st.x, st.y) - img.height / 2));
    }
    // Rune altars: a ring of standing stones and a crystal, a column of light while charged.
    for (const r of g.gen.runes) {
      if (!this.near(r.x, r.y, 20) || !g.isExplored(r.x, r.y)) continue;
      const info = RUNE_INFO[r.rune];
      const ready = r.readyAt <= g.time;
      const img = altarSprite(r.rune, info.color, Math.max(12, Math.round(10 * ppm)), ready, this.time);
      const x = Math.round(this.bx(r.x, r.y)), y = Math.round(this.by(r.x, r.y));
      c.drawImage(img, x - img.width / 2, y - img.height / 2);
      if (ready) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.3 + 0.2 * Math.sin(this.time * 3 + r.id);
        c.fillStyle = info.color;
        const hgt = Math.min(y, Math.max(12, 40 * ppm));
        c.fillRect(x - 1, y - hgt, 2, hgt);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }
    }
    // The Dead Zone gate: a stone ring round a turning rift.
    const gt = g.gen.gate;
    if (this.near(gt.x, gt.y, 20)) {
      const img = gateSprite(Math.max(20, Math.round(16 * ppm)), this.time);
      c.drawImage(img, Math.round(this.bx(gt.x, gt.y) - img.width / 2), Math.round(this.by(gt.x, gt.y) - img.height / 2));
    }
  }

  private drawPickups(g: Game): void {
    const c = this.ctx;
    for (const k of g.pickups) {
      if (!this.near(k.x, k.y, 5)) continue;
      const bob = Math.round(Math.sin(this.time * 4 + k.id) * 1 - visZ(k.z) * this.ppm * ZK);
      const x = Math.round(this.bx(k.x, k.y)), y = Math.round(this.by(k.x, k.y)) + bob;
      let col = '#bdbdbd', s = 3;
      if (k.kind === 'chest') {
        col = CHEST_INFO[k.chest ?? 'supply']?.color ?? '#ffd740';
        s = 5;
      } else if (k.kind === 'weapon' && k.weapon) {
        col = RARITIES[k.weapon.rarity].color;
        s = 4;
      } else if (k.stack) {
        try {
          col = getItem(k.stack.id).c1;
        } catch {
          col = '#bdbdbd';
        }
      }
      c.fillStyle = '#0b0b0e';
      c.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2);
      c.fillStyle = col;
      c.fillRect(x - s / 2, y - s / 2, s, s);
      c.fillStyle = '#ffffff';
      c.fillRect(x - s / 2, y - s / 2, 1, 1);
      if (k.kind !== 'stack') {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.3 + 0.2 * Math.sin(this.time * 5 + k.id);
        c.fillRect(x - s, y - s, s * 2, s * 2);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }
    }
  }

  /* ---------------- hulls ---------------- */

  /** Colossi (bigger than a Titan): drawn over the hulls, under the creatures and the air. */
  private drawColossi(g: Game): void {
    if (!g.colossi.length) return;
    const v: ColossusView = { c: this.ctx, sx: (x, y) => this.bx(x, y), sy: (x, y) => this.by(x, y), th: this.th, ppm: this.ppm, time: this.time };
    for (const col of g.colossi) {
      if (!this.near(col.x, col.y, 500)) continue;
      drawColossus(v, g, col);
      // Dust off its feet, belts and belly while it moves.
      if (col.speed > 2 && Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        this.fx.emit(col.x + Math.cos(a) * 80, col.y + Math.sin(a) * 60, 0.5, 0, 0, 1, 1.4, 8, '#a08a6a', { grow: 6, alpha: 0.35 });
      }
    }
  }

  /** What the compound's painters need of the view. */
  private cview(): CompoundView {
    return { c: this.ctx, ppm: this.ppm, ct: this.ct, st: this.st, th: this.th, time: this.time, cx: this.rw / 2 + this.shx, cy: this.rh / 2 + this.shy, bx: (x, y) => this.bx(x, y), by: (x, y) => this.by(x, y), near: (x, y, r) => this.near(x, y, r) };
  }

  private drawTanks(g: Game): void {
    // Visiting bases in the compound first (they sit under everything else).
    const list: Tank[] = [...g.compound.bases.map((b) => b.tank), ...g.tanks];
    if (g.outrider) list.push(g.outrider);
    list.push(g.player);
    const c = this.ctx;
    const ppm = this.ppm;
    for (const t of list) {
      const ext = Math.max(t.stats.length, t.stats.width);
      if (!this.near(t.x, t.y, ext)) continue;
      if (t.team === 'enemy' && g.mode === 'world' && !g.isVisible(t.x, t.y)) continue;
      if (t !== g.player && t.dead && t.kind !== 'raider') continue;
      const sx = Math.round(this.bx(t.x, t.y)), sy = Math.round(this.by(t.x, t.y));
      // A Titan is drawn from the design sheet's top view (once the art has loaded).
      if (t.fortress) {
        const lights = drawTitan3D(c, t, g, this.time, sx, sy, t.rot + this.th, ppm) ?? drawTitanSprite(c, t, g, this.time, sx, sy, t.rot + this.th, ppm);
        if (lights) {
          this.hullExtras(t, lights);
          if (t === g.player) this.drawMouth(g);
          continue;
        }
      }
      // Until then, painted at quarter-octave zoom steps and scaled the rest of the way (so zooming doesn't repaint).
      const q = Math.pow(2, Math.round(Math.log2(ppm) * 4) / 4);
      const sc = ppm / q;
      const hd = t.fortress ? paintTitanHD(t, q, g, this.time) : null;
      const p = hd ?? paintSmallTank(t, ppm, this.time);
      const a = t.rot + this.th;
      const ca = Math.cos(a), sa = Math.sin(a);
      // Drop shadow to the south-east.
      const sh = hd ? hd.shadow : this.shadowOf(p.canvas);
      const off = Math.max(1, Math.round((t.fortress ? 7 : 1.2) * ppm));
      const k = hd ? sc : 1;
      c.globalAlpha = 0.42;
      c.setTransform(ca * k, sa * k, -sa * k, ca * k, sx + off, sy + off * 0.8);
      c.drawImage(sh, -p.cx, -p.cy);
      c.globalAlpha = 1;
      if (hd) {
        // Flat, straight down: each layer's top in turn.
        for (const L of hd.layers) {
          c.setTransform(ca * sc, sa * sc, -sa * sc, ca * sc, sx, sy);
          c.drawImage(L.top, -p.cx, -p.cy);
        }
      } else {
        c.setTransform(ca, sa, -sa, ca, sx, sy);
        c.drawImage(p.canvas, -p.cx, -p.cy);
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
      this.hullExtras(t, p.lights ?? []);
    }
  }

  /** A hull's lights (strips, headlights and their beams on the ground, stacks, fires), shield bubble, invulnerability. */
  private hullExtras(t: Tank, lights: HullLight[]): void {
    const c = this.ctx;
    const ppm = this.ppm;
    if (lights.length) {
      c.globalCompositeOperation = 'lighter';
      for (const l of lights) {
        const w = t.toWorld(l.x, l.y);
        const gs = glowSprite(l.color, l.r * 2 * ppm);
        c.globalAlpha = Math.min(1, l.k);
        c.drawImage(gs, Math.round(this.bx(w.x, w.y) - gs.width / 2), Math.round(this.by(w.x, w.y) - gs.height / 2));
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    // Shield bubble.
    if (t.shield > 0 && !t.dead) {
      this.worldPath();
      c.globalAlpha = 0.18 + (t.hitFlash > 0 ? 0.25 : 0) + 0.05 * Math.sin(this.time * 4);
      c.strokeStyle = '#40c4ff';
      c.lineWidth = Math.max(1 / ppm, 0.8);
      c.beginPath();
      c.ellipse(t.x, t.y, t.stats.length * 0.58, t.stats.width * 0.62, t.rot, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (t.hasBuff('invuln')) {
      this.worldPath();
      c.globalAlpha = 0.3;
      c.strokeStyle = '#ffd740';
      c.lineWidth = 1.5 / ppm;
      c.beginPath();
      c.ellipse(t.x, t.y, t.stats.length * 0.6, t.stats.width * 0.65, t.rot, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  /**
   * The compactor's mouth at the bow: two armoured jaws hinged at the corners of the nose swing open into a V as wide
   * as the hull; between them the throat glows, and a row of grinder teeth churns across it.
   */
  private drawMouth(g: Game): void {
    const t = g.player;
    const m = g.helm.mouth;
    if (m <= 0.01 || t.dead) return;
    const c = this.ctx;
    const L = t.stats.length / 2, W = t.stats.width / 2;
    const hx = L - 5, open = m * 0.5, jl = W * 0.62;
    const sx = this.bx(t.x, t.y), sy = this.by(t.x, t.y);
    const a = t.rot + this.th, k = this.ppm;
    c.save();
    c.setTransform(Math.cos(a) * k, Math.sin(a) * k, -Math.sin(a) * k, Math.cos(a) * k, sx, sy);
    // The throat.
    const tip = (sd: number): [number, number] => [hx + Math.cos(open) * jl, sd * (W * 0.46 + Math.sin(open) * jl)];
    const [tx0, ty0] = tip(-1), [tx1, ty1] = tip(1);
    c.fillStyle = '#140a06';
    c.beginPath();
    c.moveTo(hx - 2, -W * 0.46);
    c.lineTo(tx0, ty0);
    c.lineTo(tx1, ty1);
    c.lineTo(hx - 2, W * 0.46);
    c.closePath();
    c.globalAlpha = Math.min(1, m * 1.4);
    c.fill();
    const gr = c.createRadialGradient(hx, 0, 1, hx, 0, W * 0.55);
    gr.addColorStop(0, `rgba(255,130,40,${0.75 * m})`);
    gr.addColorStop(0.5, `rgba(200,50,20,${0.35 * m})`);
    gr.addColorStop(1, 'rgba(120,20,10,0)');
    c.fillStyle = gr;
    c.fill();
    // Grinder teeth churning across the throat.
    const ph = (this.time * 14) % 3;
    c.fillStyle = '#9aa0a8';
    for (let y = -W * 0.44 + ph; y < W * 0.44; y += 3) {
      c.beginPath();
      c.moveTo(hx - 1.5, y);
      c.lineTo(hx + 1.2, y + 0.8);
      c.lineTo(hx - 1.5, y + 1.6);
      c.fill();
    }
    // The jaws: steel plates with hazard stripes along their edges and teeth along their lips.
    for (const sd of [-1, 1]) {
      c.save();
      c.translate(hx, sd * W * 0.46);
      c.rotate(sd * open);
      c.fillStyle = '#3e434b';
      c.fillRect(0, sd > 0 ? 0 : -3.2, jl, 3.2);
      c.fillStyle = '#5a616c';
      c.fillRect(0, sd > 0 ? 0 : -1, jl, 1);
      for (let x = 0; x < jl; x += 2.4) {
        c.fillStyle = Math.floor(x / 2.4) % 2 ? '#1a1a1a' : '#e8b820';
        c.fillRect(x, sd > 0 ? 2.4 : -3.2, 2.4, 0.8);
      }
      c.fillStyle = '#c8ccd2';
      for (let x = 1; x < jl - 1; x += 2) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x + 1, -sd * 1.4);
        c.lineTo(x + 2, 0);
        c.fill();
      }
      c.restore();
    }
    c.restore();
  }

  /** A black copy of a sprite, for its shadow. */
  private shadowOf(src: HTMLCanvasElement): HTMLCanvasElement {
    const s = this.silhouette;
    if (s.width !== src.width || s.height !== src.height) {
      s.width = src.width;
      s.height = src.height;
    }
    const x = s.getContext('2d')!;
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, s.width, s.height);
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#000';
    x.fillRect(0, 0, s.width, s.height);
    x.globalCompositeOperation = 'source-over';
    return s;
  }

  /**
   * A deck of your Titan as a cutaway plan: the deck's floor in its colour, the Spine down the middle, the three
   * lifts, and every building on that deck as a block in its category's colour.
   */
  private drawDeckCutaway(t: Tank, deck: number): void {
    const c = this.ctx;
    const ppm = this.ppm;
    const a = t.rot + this.th;
    c.setTransform(Math.cos(a) * ppm, Math.sin(a) * ppm, -Math.sin(a) * ppm, Math.cos(a) * ppm, this.bx(t.x, t.y), this.by(t.x, t.y));
    const cell = t.cell;
    const X = (cy: number): number => (t.rows / 2 - cy) * cell;
    const Y = (cx: number): number => (cx - t.cols / 2) * cell;
    const info = TITAN_DECK_INFO[deck];
    const floor = mix('#20242b', info?.color ?? '#90a4ae', 0.14);
    c.fillStyle = '#0d0e11';
    c.fillRect(X(t.rows) - 1.5, Y(0) - 1.5, t.rows * cell + 3, t.cols * cell + 3);
    c.fillStyle = floor;
    c.fillRect(X(t.rows), Y(0), t.rows * cell, t.cols * cell);
    // Floor tiles.
    c.fillStyle = shade(floor, 0.05);
    for (let r = 0; r < t.rows; r++) for (let k = r % 2; k < t.cols; k += 2) c.fillRect(X(r + 1), Y(k), cell, cell);
    const sp = TITAN_SPINE;
    c.fillStyle = shade(info?.color ?? '#90a4ae', -0.45);
    c.fillRect(X(sp.r1 + 1), Y(sp.c0), (sp.r1 + 1 - sp.r0) * cell, (sp.c1 + 1 - sp.c0) * cell);
    for (const l of TITAN_LIFTS) {
      c.fillStyle = '#1b1d22';
      c.fillRect(X(l.cy + 2), Y(l.cx), cell * 2, cell * 2);
      c.fillStyle = '#ffd740';
      c.fillRect(X(l.cy + 1) - 1, Y(l.cx + 1) - 1, 2, 2);
    }
    const CAT: Record<string, string> = {
      weapon: '#ef5350', defense: '#42a5f5', power: '#ffca28', crew: '#9ccc65', resource: '#8d6e63', army: '#ab47bc', command: '#26c6da', utility: '#78909c', special: '#ec407a',
    };
    for (const m of t.modules) {
      if (m.deck !== deck) continue;
      const d = MODULES[m.key];
      const col = CAT[d.cat] ?? '#78909c';
      const x0 = X(m.cy + d.h), y0 = Y(m.cx), w = d.h * cell, h = d.w * cell;
      c.fillStyle = '#0b0c0f';
      c.fillRect(x0 + 0.4, y0 + 0.4, w - 0.8, h - 0.8);
      c.fillStyle = m.built ? shade(col, -0.35) : shade(col, -0.65);
      c.fillRect(x0 + 1, y0 + 1, w - 2, h - 2);
      c.fillStyle = m.built ? shade(col, 0.05) : shade(col, -0.4);
      c.fillRect(x0 + 1, y0 + 1, w - 2, 1);
      // A little furniture so rooms read as rooms.
      c.fillStyle = shade(col, -0.55);
      for (let k = 1; k < d.w * 2; k++) c.fillRect(x0 + 2, y0 + (k * h) / (d.w * 2) - 0.3, Math.max(1, w * 0.25), 0.6);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    // The crew on this deck, from above: at their posts, asleep, walking the Spine.
    const ab = this.aboard;
    if (!ab) return;
    const big = ppm * cell >= 14;
    for (const pr of ab.people) {
      if (pr.deck !== deck || pr.ride > 0) continue;
      const w = t.toWorld(X(pr.y), Y(pr.x));
      const img = topPerson(pr.color, hatFor(pr.act, pr.color, pr.id), big);
      c.drawImage(img, Math.round(this.bx(w.x, w.y) - img.width / 2), Math.round(this.by(w.x, w.y) - img.height / 2));
    }
  }

  /** Smoke from the stacks, dust off the crawlers, bow wake in rivers, smoke from fires and broken crawlers. */
  private shipEffects(g: Game, dt: number): void {
    const t = g.player;
    if (!t.fortress || t.dead || !this.near(t.x, t.y, 100) || dt <= 0) return;
    const L = t.stats.length, W = t.stats.width;
    const v = Math.abs(t.speed);
    const od = g.helm.overdrive;
    // Exhaust: from the four nozzles in the stern plate (lifted to their height on the 3D hull), or the stacks.
    const lift = ship3DActive() ? SHIP_LEAN : 0;
    if (Math.random() < dt * (4 + v * 0.6)) {
      let w: { x: number; y: number };
      if (lift) {
        const i = Math.floor(Math.random() * 4);
        w = t.toWorld(-L / 2 - 2.5, (i % 2 ? 1 : -1) * W * nozzleW(t.frame));
        w.y -= lift * t.deckY(0) * (i < 2 ? 0.38 : 0.56);
      } else {
        const spots = stackSpots(L, W, engineDef(t.engineKey).flame.jets);
        const st = spots[Math.floor(Math.random() * spots.length)];
        w = t.toWorld(st.x, st.y);
      }
      const back = -(1 + v * 0.3);
      this.fx.emit(w.x, w.y, 4, Math.cos(t.rot) * back, Math.sin(t.rot) * back, 1.5, 2.5 + v * 0.05, 3, od ? '#546e7a' : '#2e2e30', { grow: 3, alpha: 0.6 });
      if (od) this.fx.emit(w.x, w.y, 4, Math.cos(t.rot) * back * 2, Math.sin(t.rot) * back * 2, 0.5, 0.25, 2, Math.random() < 0.5 ? '#ff9100' : '#40c4ff', { add: true });
    }
    // Dust or spray behind each bank of crawlers.
    const ter = g.map.terAt(t.x, t.y);
    const dusty = ter === TER.SAND || ter === TER.DUNE || ter === TER.ASH || ter === TER.SNOW || ter === TER.DIRT || ter === TER.RUST;
    const wet = ter === TER.WATER || ter === TER.ACID || ter === TER.MUD;
    if ((dusty || wet) && v > 2 && Math.random() < dt * v * 0.8) {
      for (const s of [-1, 1]) {
        const w = t.toWorld(-L * 0.5, s * W * 0.42);
        const col = wet ? (ter === TER.ACID ? '#9cff57' : '#9fd3e6') : ter === TER.SNOW ? '#eef3f8' : '#b89a70';
        this.fx.emit(w.x + (Math.random() - 0.5) * 6, w.y + (Math.random() - 0.5) * 6, 1, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 1, 1.8, 4, col, { grow: 3, alpha: 0.45, low: true });
      }
    }
    if (t.titan) {
      // Smoke from compartments on fire, and from broken crawlers.
      g.titan.fire.forEach((f, ci) => {
        if (f <= 0.02 || Math.random() > f * dt * 6) return;
        const sec = ci % 3;
        const w = t.toWorld((1 - sec) * L * 0.3 + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * W * 0.5);
        w.y -= lift * t.deckY(0);
        this.fx.emit(w.x, w.y, 10, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 2, 3.5, 5 + f * 4, '#232326', { grow: 4, alpha: 0.7 });
        this.fx.emit(w.x, w.y, 8, 0, 0, 3, 0.5, 2, Math.random() < 0.5 ? '#ff6d00' : '#ffab40', { add: true });
      });
      g.titan.crawlers.forEach((h, i) => {
        if (h >= 0.35 || Math.random() > dt * 2) return;
        const k = i % 4, side = i < 4 ? -1 : 1;
        const w = t.toWorld(L * 0.37 - k * L * 0.245, side * W * 0.42);
        w.y -= lift * t.deckY(0) * 0.3;
        this.fx.emit(w.x, w.y, 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 2, 2.5, 4, h <= 0.1 ? '#1e1e20' : '#4a4a4c', { grow: 3, alpha: 0.7 });
        if (h <= 0.1 && Math.random() < 0.4) this.fx.emit(w.x, w.y, 3, 0, 0, 3, 0.4, 1.4, '#ffab40', { add: true, grav: 4 });
      });
    }
    if (t.hp < t.stats.maxHp * 0.35 && Math.random() < dt * 3) this.fx.emit(t.x + (Math.random() - 0.5) * L * 0.6, t.y + (Math.random() - 0.5) * W * 0.4 - lift * t.deckY(0), 8, 0, 0, 2, 2.5, 5, '#3a3a3a', { grow: 3, alpha: 0.6 });
  }

  /* ---------------- creatures ---------------- */

  /** Heading from how a thing has been moving (creatures only know left/right). */
  private headingOf(id: number, x: number, y: number, fallback: number): number {
    let h = this.heading.get(id);
    if (!h) {
      h = { x, y, a: fallback };
      this.heading.set(id, h);
      return h.a;
    }
    const dx = x - h.x, dy = y - h.y;
    if (dx * dx + dy * dy > 0.0025) {
      const want = Math.atan2(dy, dx);
      let d = want - h.a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      h.a += d * 0.35;
      h.x = x;
      h.y = y;
    }
    return h.a;
  }

  /** Figures painted this frame (a new crowd is painted a couple of dozen at a time). */
  private foeBudget = 0;

  /**
   * A hostile person as a painted figure, facing the way it's going, in its pose (lurching, running, clawing,
   * smashing, aiming). False if it isn't painted yet and the frame's painting is used up (the caller draws the old
   * sprite this once).
   */
  private drawFoe(e: Enemy, f: Foe, heading: number): boolean {
    const c = this.ctx;
    const def = ENEMIES[e.kind];
    const S = Math.max(e.horde ? 24 : 28, Math.min(128, Math.round((1.8 * f.scale * this.ppm * 1.25) / 0.86 / 4) * 4)) * (f.scale > 1.1 ? 1.3 : 1);
    const Sq = Math.round(S / 4) * 4;
    const view = { heading };
    const spec = { role: f.role, seed: e.id % 6, color: f.color };
    const { pose, frame } = foePose(e, f, def);
    let img = heroIfPainted(spec, pose, frame, Sq, view);
    if (!img && this.foeBudget > 0) {
      this.foeBudget--;
      img = hero(spec, pose, frame, Sq, view);
    }
    img ??= heroIfPainted(spec, pose, 0, Sq, view) ?? heroIfPainted(spec, 'stand', 0, Sq, view);
    if (!img) return false;
    const ft = heroFoot(Sq, view);
    const gx = Math.round(this.bx(e.x, e.y)), gy = Math.round(this.by(e.x, e.y));
    const lift = e.flying ? Math.max(2, (1.6 + visZ(e.z)) * this.ppm * ZK * 1.3) : visZ(e.z) * this.ppm * ZK;
    this.hostileRing(gx, gy, Sq * 0.2, Sq * 0.12, e.boss, e.elite);
    c.drawImage(img, gx - ft.x, Math.round(gy - ft.y - lift));
    if (e.hitFlash > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = Math.min(0.6, e.hitFlash * 4);
      c.drawImage(img, gx - ft.x, Math.round(gy - ft.y - lift));
      c.restore();
    }
    if (e.burn > 0 && Math.random() < 0.3) this.fx.emit(e.x, e.y, e.r, 0, 0, 2, 0.4, Math.max(0.5, e.r * 0.5), '#ff6d00', { add: true });
    if (e.aim) this.drawAimLine(e);
    return true;
  }

  private drawEnemies(g: Game, air: boolean): void {
    const c = this.ctx;
    const ppm = this.ppm;
    const R = this.groundR + 30;
    const p = g.player;
    if (!air) {
      this.foeBudget = 24;
      beginCreatures3D();
    }
    this.headT -= 1;
    if (this.headT <= 0) {
      this.headT = 300;
      const live = new Set(g.enemies.map((e) => e.id));
      for (const id of this.heading.keys()) if (!live.has(id) && id < 1e9) this.heading.delete(id);
    }
    for (const e of g.enemies) {
      if (e.flying !== air || e.colossus) continue;
      if (Math.abs(e.x - this.cam.x) > R || Math.abs(e.y - this.cam.y) > R) continue;
      if (g.mode === 'world' && !g.isVisible(e.x, e.y) && !e.boss) continue;
      if (e.burrowed) {
        if (Math.random() < 0.25) this.fx.emit(e.x, e.y, 0.2, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 1.5, 0.6, Math.max(0.6, e.r * 0.5), '#a08050', { alpha: 0.7 });
        const s = Math.max(2, Math.round(e.r * 1.2 * ppm));
        c.fillStyle = 'rgba(40,28,18,0.5)';
        c.fillRect(Math.round(this.bx(e.x, e.y) - s / 2), Math.round(this.by(e.x, e.y) - s / 3), s, Math.max(1, Math.round(s * 0.66)));
        continue;
      }
      const def = ENEMIES[e.kind];
      const arch = archFor(e.kind, def?.arch);
      // Drawn a little larger than life, and never too small to read at full resolution.
      const real = e.r * 2 * ppm * (arch === 'worm' || arch === 'dragon' ? 1.7 : 1.5);
      const min = e.boss ? 48 : e.titan ? 34 : e.elite ? 22 : e.horde ? 13 : 16;
      const size = Math.max(min, real);
      const toP = Math.atan2(p.y - e.y, p.x - e.x);
      const a = this.headingOf(e.id, e.x, e.y, toP) + this.th;
      // A 3D model where there is one: baked sheets for the crowds, live for giants and bosses.
      {
        const atkO = (e.atkT ?? 9) < 0.5 ? Math.sin((Math.PI * (e.atkT ?? 9)) / 0.5) * size * 0.18 : 0;
        const gx = this.bx(e.x, e.y) + Math.cos(a) * atkO, gy = this.by(e.x, e.y) + Math.sin(a) * atkO;
        let lift = e.flying ? Math.max(2, (1.6 + visZ(e.z)) * ppm * ZK * 1.3) : visZ(e.z) * ppm * ZK;
        // Aboard a hull: up on its roof.
        if (e.latch && e.latch.tank === p.id) lift += shipRoofAt(p, e.latch.lx, e.latch.lz) * SHIP_LEAN * ppm;
        if (!e.latch) this.hostileRing(gx, this.by(e.x, e.y), size * 0.5, size * 0.36, e.boss, e.elite);
        if (e.flying) {
          const so = Math.max(3, size * 0.4);
          c.fillStyle = 'rgba(0,0,0,0.28)';
          c.beginPath();
          c.ellipse(gx + so, this.by(e.x, e.y) + so, size * 0.4, size * 0.22, 0, 0, Math.PI * 2);
          c.fill();
        }
        if (drawCreature3D(c, e, def, gx, gy - lift, size, a, e.titan || !!e.boss)) {
          if (e.burn > 0 && Math.random() < 0.3) this.fx.emit(e.x, e.y, e.r, 0, 0, 2, 0.4, Math.max(0.5, e.r * 0.5), '#ff6d00', { add: true });
          if (e.slow > 0 && Math.random() < 0.1) this.fx.emit(e.x, e.y, e.r, 0, 0, 0.5, 0.5, Math.max(0.4, e.r * 0.4), '#80deea', { add: true });
          if (e.titan && !e.flying && Math.random() < 0.15) this.fx.emit(e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * e.r, 0.5, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1, 1.4, Math.max(1, e.r * 0.3), '#8d7a62', { grow: 2, alpha: 0.5 });
          if (e.aim) this.drawAimLine(e);
          continue;
        }
      }
      // People (the dead, raiders, cultists, cyborgs) are painted figures.
      const foe = !e.titan && !e.boss ? foeFor(e, def, arch) : null;
      if (foe && this.drawFoe(e, foe, a)) continue;
      // Hard Vacuum sprites (OpenHV) for everything short of the giants: the facing drawn for its heading.
      const look = !e.titan && !e.boss ? ohvLookFor(e.kind, def, arch) : null;
      const sheet = look ? (e.hitFlash > 0 ? ohvFlash(look.sheet) : ohvCanvas(look.sheet, look.team, look.tint, look.tintK)) : null;
      if (look && sheet) {
        const sh = ohvSheet(look.sheet)!;
        const k = Math.max(3, Math.round(size / (sh.fw * 0.6)));
        const atkO = (e.atkT ?? 9) < 0.5 ? Math.sin((Math.PI * (e.atkT ?? 9)) / 0.5) * size * 0.25 : 0;
        const gx = Math.round(this.bx(e.x, e.y) + Math.cos(a) * atkO);
        const lift = e.flying ? Math.max(2, (1.6 + visZ(e.z)) * ppm * ZK * 1.3) : visZ(e.z) * ppm * ZK;
        const gy = Math.round(this.by(e.x, e.y) + Math.sin(a) * atkO - lift);
        c.fillStyle = 'rgba(0,0,0,0.3)';
        const so = e.flying ? Math.max(3, size * 0.4) : 1;
        c.beginPath();
        c.ellipse(gx + so, this.by(e.x, e.y) + so + sh.fh * k * 0.18, sh.fw * k * 0.26, sh.fh * k * 0.12, 0, 0, Math.PI * 2);
        c.fill();
        this.hostileRing(gx, this.by(e.x, e.y) + sh.fh * k * 0.18, sh.fw * k * 0.3, sh.fh * k * 0.14, e.boss, e.elite);
        if (e.elite) {
          c.strokeStyle = '#d500f9';
          c.lineWidth = 1;
          c.beginPath();
          c.ellipse(gx, this.by(e.x, e.y) + sh.fh * k * 0.18, sh.fw * k * 0.34, sh.fh * k * 0.16, 0, 0, Math.PI * 2);
          c.stroke();
        }
        // A pose drawn once per facing gets a stride instead: a pixel hop in step with the walk.
        const hop = ohvSteps(look.sheet, look.move) === 1 && !e.flying && Math.hypot(e.vx, e.vy) > 0.3 ? (Math.floor(e.anim * 2) & 1) * Math.max(1, k >> 1) : 0;
        drawOhv(c, sheet, look.sheet, ohvFrame(look.sheet, look.move, a, e.anim * 1.2), gx, gy - hop, k);
        if (e.burn > 0 && Math.random() < 0.3) this.fx.emit(e.x, e.y, e.r, 0, 0, 2, 0.4, Math.max(0.5, e.r * 0.5), '#ff6d00', { add: true });
        if (e.aim) this.drawAimLine(e);
        continue;
      }
      const frame = Math.floor(e.anim * (e.titan ? 1 : 2)) & 1;
      const variant = e.boss ? 'boss' : e.elite ? 'elite' : 'normal';
      // Painted at quantised sizes and scaled the rest of the way (zooming doesn't repaint every creature).
      const q = quantizeSize(size);
      const ks = size / q;
      const img = creatureSprite(arch, e.hitFlash > 0 ? '#ffffff' : def?.color ?? '#9e9e9e', q, frame, variant, arch === 'humanoid' ? lookFor(e.kind, def?.faction) : '', arch === 'humanoid' ? null : speciesFor(e.kind, def?.name, arch));
      // An attack: it lunges into the blow (a giant's lands with a shockwave in the dust).
      const atk = (e.atkT ?? 9) < 0.55 ? (e.atkT ?? 9) / 0.55 : 0;
      const lg = Math.sin(Math.PI * atk) * size * 0.22;
      const sx = Math.round(this.bx(e.x, e.y) + Math.cos(a) * lg), sy = Math.round(this.by(e.x, e.y) + Math.sin(a) * lg - (e.flying ? Math.max(2, (1.6 + visZ(e.z)) * ppm * ZK * 1.3) : visZ(e.z) * ppm * ZK));
      if (atk > 0.45 && (e.titan || size > 40) && !e.flying) {
        const k2 = (atk - 0.45) / 0.55;
        const fx0 = this.bx(e.x, e.y) + Math.cos(a) * size * 0.45, fy0 = this.by(e.x, e.y) + Math.sin(a) * size * 0.45;
        c.strokeStyle = `rgba(230,200,150,${0.7 * (1 - k2)})`;
        c.lineWidth = Math.max(1.5, size * 0.04 * (1 - k2));
        c.beginPath();
        c.ellipse(fx0, fy0, size * (0.15 + k2 * 0.6), size * (0.1 + k2 * 0.4), 0, 0, Math.PI * 2);
        c.stroke();
        if (Math.random() < 0.4) this.fx.emit(e.x + Math.cos(a - this.th) * e.r, e.y + Math.sin(a - this.th) * e.r, 0.3, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0.8, 1.2, Math.max(1, e.r * 0.4), '#9a8a6a', { grow: 2, alpha: 0.55 });
      }
      // Shadow on the ground (flyers' is further off).
      const so = e.flying ? Math.max(3, size * 0.4) : Math.max(1, size * 0.08);
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(Math.round(sx - size * 0.35 + so), Math.round(this.by(e.x, e.y) - size * 0.25 + so), Math.round(size * 0.7), Math.round(size * 0.5));
      this.hostileRing(sx, this.by(e.x, e.y), size * 0.5, size * 0.36, e.boss, e.elite);
      const ca = Math.cos(a), sa = Math.sin(a);
      c.setTransform(ca * ks, sa * ks, -sa * ks, ca * ks, sx, sy);
      c.drawImage(img, -img.width / 2, -img.height / 2);
      c.setTransform(1, 0, 0, 1, 0, 0);
      // Burning, slowed and stunned creatures show it.
      if (e.burn > 0 && Math.random() < 0.3) this.fx.emit(e.x, e.y, e.r, 0, 0, 2, 0.4, Math.max(0.5, e.r * 0.5), '#ff6d00', { add: true });
      if (e.slow > 0 && Math.random() < 0.1) this.fx.emit(e.x, e.y, e.r, 0, 0, 0.5, 0.5, Math.max(0.4, e.r * 0.4), '#80deea', { add: true });
      // Giants shake the dust up as they walk.
      if (e.titan && !e.flying && Math.random() < 0.15) this.fx.emit(e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * e.r, 0.5, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1, 1.4, Math.max(1, e.r * 0.3), '#8d7a62', { grow: 2, alpha: 0.5 });
      if (e.aim) this.drawAimLine(e);
    }
  }

  /**
   * A ring on the ground under everything hostile, so a creature reads against any ground and at any zoom: red, a
   * dark edge outside it, magenta for elites and bosses.
   */
  private hostileRing(x: number, y: number, rx: number, ry: number, boss?: boolean, elite?: boolean): void {
    const c = this.ctx;
    rx = Math.max(4, rx);
    ry = Math.max(2.5, ry);
    c.beginPath();
    c.ellipse(Math.round(x) + 0.5, Math.round(y) + 0.5, rx + 1, ry + 1, 0, 0, Math.PI * 2);
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(10,0,0,0.45)';
    c.stroke();
    c.lineWidth = boss ? 2 : 1.3;
    c.strokeStyle = boss ? '#ff40ff' : elite ? '#e040fb' : 'rgba(255,58,38,0.95)';
    c.stroke();
  }

  /** The Mega Hangar's airships: high overhead (their shadows far below), lowering crates on cables over the deck. */
  private drawAirships(g: Game): void {
    if (!g.flights.length) return;
    const c = this.ctx;
    const ppm = this.ppm;
    const L = 90;
    const px = Math.max(40, Math.round(L * ppm));
    const lift = Math.max(40, 60 * ppm);
    for (const f of g.flights) {
      if (!this.near(f.x, f.y, L)) continue;
      const img = airshipSprite(px, Math.floor(this.time * 12), f.phase !== 'back');
      const gx = Math.round(this.bx(f.x, f.y)), gy = Math.round(this.by(f.x, f.y));
      const sx = gx, sy = gy - Math.round(lift);
      const a = f.a + this.th;
      // Its shadow on the ground.
      c.globalAlpha = 0.28;
      c.fillStyle = '#000';
      c.beginPath();
      c.ellipse(gx + lift * 0.35, gy + lift * 0.2, px * 0.45, px * 0.18, a, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
      if (f.phase === 'drop') {
        // Cables down to the deck, and the crates on their way.
        const k = 1 - Math.max(0, f.t) / 4;
        c.strokeStyle = 'rgba(220,220,200,0.7)';
        c.lineWidth = 1;
        for (const o of [-6, 6]) {
          c.beginPath();
          c.moveTo(sx + o, sy);
          c.lineTo(gx + o, gy);
          c.stroke();
        }
        const cy = sy + (gy - sy) * k;
        const cs = Math.max(6, Math.round(4 * ppm));
        c.fillStyle = '#0b0d11';
        c.fillRect(gx - cs - 1, cy - cs / 2 - 1, cs * 2 + 2, cs + 2);
        c.fillStyle = '#c8962e';
        c.fillRect(gx - cs, cy - cs / 2, cs * 2, cs);
        c.fillStyle = '#7a5418';
        c.fillRect(gx - cs, cy - 1, cs * 2, 2);
      }
      c.setTransform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), sx, sy);
      c.drawImage(img, -img.width / 2, -img.height / 2);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  /** Long-range units show where they're aiming before they fire. */
  private drawAimLine(e: Enemy): void {
    const c = this.ctx;
    const a = e.aim!;
    c.strokeStyle = '#ff1744';
    c.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 20);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(this.bx(e.x, e.y), this.by(e.x, e.y));
    c.lineTo(this.bx(a.x, a.y), this.by(a.x, a.y));
    c.stroke();
    c.globalAlpha = 1;
  }

  private drawAllies(g: Game, air: boolean): void {
    const c = this.ctx;
    const ppm = this.ppm;
    for (const a of g.allies) {
      const flyer = a.kind === 'jet' || a.kind === 'drone' || a.kind === 'dragon' || a.z > 0.5;
      if (flyer !== air || !this.near(a.x, a.y, 10)) continue;
      const real = a.kind === 'dragon' ? 14 : a.kind === 'mech' ? 5 : a.kind === 'minitank' ? 6 : a.kind === 'buggy' ? 4 : a.kind === 'jet' ? 8 : a.kind === 'drone' ? 2 : a.kind === 'mine' ? 1 : 1.2;
      const size = Math.max(a.kind === 'mine' ? 6 : 10, real * ppm * 1.4);
      if (a.kind === 'marine' || a.kind === 'heavy') {
        // Soldiers are painted figures, upright, facing the way they're going (rifles up when they have a target).
        const S = Math.max(24, Math.min(112, Math.round((ppm * 1.8 * 1.6) / 0.86 / 4) * 4));
        const moving = this.headingOf(a.id + 1e9, a.x, a.y, a.rot);
        const pose = a.targetId > 0 && a.cd < 0.6 ? 'aim' : 'walk';
        const img = hero({ role: a.kind === 'heavy' ? 'heavy' : a.id % 3 === 0 ? 'rifleman' : 'marine', seed: a.id }, pose, Math.floor(a.anim * 7), S, { heading: moving + this.th });
        const ft = heroFoot(S, { heading: 0 });
        const sx = Math.round(this.bx(a.x, a.y)), sy = Math.round(this.by(a.x, a.y));
        c.drawImage(img, sx - ft.x, sy - ft.y);
        continue;
      }
      const vehicle = a.kind === 'buggy' || a.kind === 'minitank' || a.kind === 'jet' || a.kind === 'drone' || a.kind === 'dragon';
      const rot = vehicle ? a.rot : this.headingOf(a.id + 1e9, a.x, a.y, a.rot);
      const img = allySprite(a.kind, size, Math.floor(a.anim));
      const sx = Math.round(this.bx(a.x, a.y)), sy = Math.round(this.by(a.x, a.y) - visZ(a.z) * ppm * ZK);
      if (flyer) {
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(Math.round(sx - size * 0.3 + size * 0.5), Math.round(this.by(a.x, a.y) + size * 0.4), Math.round(size * 0.6), Math.round(size * 0.4));
      }
      const an = rot + this.th;
      c.setTransform(Math.cos(an), Math.sin(an), -Math.sin(an), Math.cos(an), sx, sy);
      c.drawImage(img, -img.width / 2, -img.height / 2);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  private drawProjectiles(g: Game): void {
    const c = this.ctx;
    const ppm = this.ppm;
    c.globalCompositeOperation = 'lighter';
    for (const p of g.projectiles) {
      if (!this.near(p.x, p.y, 10)) continue;
      const x = this.bx(p.x, p.y), y = this.by(p.x, p.y) - visZ(p.z) * ppm * ZK;
      const sp = Math.hypot(p.vx, p.vy);
      const len = Math.max(2, Math.min(24, sp * 0.035 * ppm));
      const vx = sp > 0 ? p.vx / sp : 1, vy = sp > 0 ? p.vy / sp : 0;
      const dx = (vx * this.ct - vy * this.st) * len, dy = (vx * this.st + vy * this.ct) * len;
      const big = p.size > 0.3 || p.splash > 1.5;
      const gs = glowSprite(p.color.length === 7 ? p.color : '#ffcc80', big ? 14 : 8);
      c.globalAlpha = 0.55;
      c.drawImage(gs, Math.round(x - gs.width / 2), Math.round(y - gs.height / 2));
      c.globalAlpha = 1;
      c.strokeStyle = p.color;
      c.lineWidth = big ? 2 : 1;
      c.beginPath();
      c.moveTo(Math.round(x - dx), Math.round(y - dy));
      c.lineTo(Math.round(x), Math.round(y));
      c.stroke();
      c.fillStyle = '#ffffff';
      c.fillRect(Math.round(x) - (big ? 1 : 0), Math.round(y) - (big ? 1 : 0), big ? 2 : 1, big ? 2 : 1);
      if (p.arc && p.z > 0.5) {
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(Math.round(x), Math.round(this.by(p.x, p.y)), 2, 1);
        c.globalCompositeOperation = 'lighter';
      }
    }
    c.globalCompositeOperation = 'source-over';
  }

  /* ---------------- weather, fog, markers ---------------- */

  private drawWeather(g: Game, dt: number): void {
    const w = g.mode === 'world' ? g.weather : null;
    const on = !!w && w.phase === 'active' && !!w.kind;
    this.stormK += ((on ? 1 : 0) - this.stormK) * Math.min(1, dt * 0.8);
    if (this.stormK < 0.02 || !w?.kind) return;
    const c = this.ctx;
    const col = STORMS[w.kind].color;
    c.globalAlpha = 0.22 * this.stormK;
    c.fillStyle = col;
    c.fillRect(0, 0, this.rw, this.rh);
    c.globalAlpha = 1;
    // Streaks blowing across the screen.
    const n = Math.round(this.rw * this.rh * 0.0015 * this.stormK);
    const t = this.time;
    c.fillStyle = w.kind === 'blizzard' ? '#ffffff' : w.kind === 'fire' ? '#ffab40' : w.kind === 'acid' ? '#b2ff59' : w.kind === 'ion' ? '#d1c4e9' : '#e8d3a8';
    for (let i = 0; i < n; i++) {
      const s = (i * 7919) % 1000;
      const speed = w.kind === 'acid' ? 90 : w.kind === 'blizzard' ? 60 : 160;
      const x = (((s * 13.7 + t * speed * (0.6 + (s % 7) / 10)) % (this.rw + 40)) + this.rw + 40) % (this.rw + 40) - 20;
      const y = (((s * 7.3 + (w.kind === 'acid' ? t * 140 : t * 12 * Math.sin(s))) % this.rh) + this.rh) % this.rh;
      c.globalAlpha = 0.35 + (s % 5) / 12;
      if (w.kind === 'acid') c.fillRect(Math.round(x), Math.round(y), 1, 3);
      else c.fillRect(Math.round(x), Math.round(y), w.kind === 'blizzard' ? 1 : 3, 1);
    }
    c.globalAlpha = 1;
    if (w.kind === 'ion' && Math.random() < dt * 2) {
      const x = this.cam.x + (Math.random() - 0.5) * this.groundR, y = this.cam.y + (Math.random() - 0.5) * this.groundR;
      this.fx.flash(x, y, 30, '#b388ff', 0.15);
    }
  }

  private drawFog(g: Game, dt: number): void {
    const f = this.fog;
    f.update(g, this.cam.x, this.cam.y, dt);
    const c = this.ctx;
    this.worldPath();
    c.imageSmoothingEnabled = true;
    const span = FogLayer.N * FogLayer.STEP;
    c.drawImage(f.canvas, f.ox, f.oy, span, span);
    c.imageSmoothingEnabled = false;
    // Beyond the fog layer: unexplored.
    c.fillStyle = 'rgba(7,7,11,0.77)';
    const R = this.groundR * 1.5;
    c.fillRect(this.cam.x - R, this.cam.y - R, R * 2, f.oy - (this.cam.y - R));
    c.fillRect(this.cam.x - R, f.oy + span, R * 2, this.cam.y + R - (f.oy + span));
    c.fillRect(this.cam.x - R, f.oy, f.ox - (this.cam.x - R), span);
    c.fillRect(f.ox + span, f.oy, this.cam.x + R - (f.ox + span), span);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawMarkers(g: Game, dt: number): void {
    const c = this.ctx;
    const ppm = this.ppm;
    // Focused fire: a red reticle on the mark (riding on the foe it's locked to), the area the guns rake, the time left.
    const ap = g.player.aimPoint;
    if (ap && g.mode === 'world') {
      const foe = ap.id ? g.enemyById(ap.id) : null;
      const lift = foe ? (foe.flying ? 1.6 : 0) + foe.r * 0.9 : 0;
      const x = this.bx(ap.x, ap.y), y = this.by(ap.x, ap.y) - lift * SHIP_LEAN * ppm;
      const r = Math.max(14, ((foe ? foe.r : 0) + 5) * ppm);
      const spin = this.time * 1.6;
      c.save();
      c.lineWidth = 2;
      c.strokeStyle = '#ff1744';
      c.shadowColor = '#ff1744';
      c.shadowBlur = 8;
      for (let i = 0; i < 4; i++) {
        const a = spin + (i * Math.PI) / 2;
        c.beginPath();
        c.arc(x, y, r, a - 0.42, a + 0.42);
        c.stroke();
        c.beginPath();
        c.moveTo(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6));
        c.lineTo(x + Math.cos(a) * (r - 7), y + Math.sin(a) * (r - 7));
        c.stroke();
      }
      c.shadowBlur = 0;
      c.fillStyle = '#ff1744';
      c.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      if (!ap.id) {
        // The ground mark: the area every gun rakes.
        c.globalAlpha = 0.35 + 0.15 * Math.sin(this.time * 5);
        c.setLineDash([6, 6]);
        c.lineWidth = 1;
        c.beginPath();
        c.arc(x, y, Math.max(r + 8, 25 * ppm), 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
      }
      c.font = 'bold 11px "Silkscreen", monospace';
      c.textAlign = 'center';
      c.fillStyle = '#000';
      c.fillText(`FOCUS ${Math.ceil(ap.t)}s`, x + 1, y - r - 9);
      c.fillStyle = '#ff5252';
      c.fillText(`FOCUS ${Math.ceil(ap.t)}s`, x, y - r - 10);
      c.restore();
    }
    if (this.marker) {
      this.marker.t -= dt;
      if (this.marker.t <= 0) this.marker = null;
      else {
        const m = this.marker;
        c.strokeStyle = m.color;
        c.lineWidth = 1;
        const r = Math.max(2, m.t * 2 * 12);
        c.beginPath();
        c.arc(this.bx(m.x, m.y), this.by(m.x, m.y), r, 0, Math.PI * 2);
        c.stroke();
      }
    }
    if (this.aim) {
      const a = this.aim;
      c.strokeStyle = a.color;
      c.fillStyle = a.color;
      c.lineWidth = 1;
      const r = Math.max(3, a.r * ppm) * (1 + Math.sin(this.time * 8) * 0.03);
      const ax = this.bx(a.x, a.y), ay = this.by(a.x, a.y);
      c.beginPath();
      c.arc(ax, ay, r, 0, Math.PI * 2);
      c.globalAlpha = 0.18;
      c.fill();
      c.globalAlpha = 1;
      c.lineWidth = 3;
      c.strokeStyle = '#000';
      c.stroke();
      c.lineWidth = 1.5;
      c.strokeStyle = a.color;
      c.stroke();
      // A rotating crosshair at the middle.
      const t = this.time * 2;
      for (let k = 0; k < 4; k++) {
        const an = t + (k * Math.PI) / 2;
        c.beginPath();
        c.moveTo(ax + Math.cos(an) * r * 0.82, ay + Math.sin(an) * r * 0.82);
        c.lineTo(ax + Math.cos(an) * r * 1.12, ay + Math.sin(an) * r * 1.12);
        c.stroke();
      }
      c.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 3, 3);
    }
    if (this.beacon) {
      const b = this.beacon;
      const x = Math.round(this.bx(b.x, b.y)), y = Math.round(this.by(b.x, b.y));
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.25 + 0.1 * Math.sin(this.time * 3);
      c.fillStyle = b.color;
      c.fillRect(x - 1, Math.max(0, y - 80), 3, Math.min(80, y));
      c.globalAlpha = 0.6;
      c.strokeStyle = b.color;
      c.beginPath();
      c.arc(x, y, 4 + 2 * Math.sin(this.time * 4), 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
  }

  /* ---------------- effects from the simulation ---------------- */

  /** Hand-drawn explosion and smoke animations (OpenHV sheets) playing out in the world. */
  private sprFx: { x: number; y: number; sheet: string; t: number; dur: number; m: number }[] = [];

  /** Starts one: `m` is how wide it should look, in metres. */
  private spriteFx(x: number, y: number, sheet: string, dur: number, m: number): void {
    if (this.sprFx.length > 60) this.sprFx.shift();
    this.sprFx.push({ x, y, sheet, t: 0, dur, m });
  }

  private drawSpriteFx(dt: number): void {
    const c = this.ctx;
    const ppm = this.ppm;
    for (const f of this.sprFx) {
      f.t += dt;
      const sh = ohvSheet(f.sheet);
      const img = sh ? ohvCanvas(f.sheet, '#ff9100') : null;
      if (!sh || !img || !this.near(f.x, f.y, f.m)) continue;
      const k = Math.max(1, Math.round((f.m * ppm) / sh.fw));
      const add = !f.sheet.includes('smoke');
      if (add) c.globalCompositeOperation = 'lighter';
      drawOhv(c, img, f.sheet, ohvOneShot(f.sheet, f.t / f.dur), Math.round(this.bx(f.x, f.y)), Math.round(this.by(f.x, f.y)), k, add ? 1 : 0.8);
      if (add) c.globalCompositeOperation = 'source-over';
    }
    this.sprFx = this.sprFx.filter((f) => f.t < f.dur);
  }

  private handleFx(e: FxEvent): void {
    const f = this.fx;
    switch (e.t) {
      case 'debris':
        if (!this.near(e.x, e.y, 30)) return;
        for (let i = 0; i < Math.min(24, e.n); i++) {
          const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4;
          f.emit(e.x, e.y, e.h * 0.5, Math.cos(a) * s + e.fx * e.push, Math.sin(a) * s + e.fy * e.push, 3, 1 + Math.random(), 0.8 + Math.random() * 1.2, e.color, { grav: 9 });
        }
        f.emit(e.x, e.y, e.h * 0.5, 0, 0, 1, 2.5, 3 + e.h * 0.3, '#8a8680', { grow: 3, alpha: 0.5 });
        return;
      case 'boom': {
        if (!this.near(e.x, e.y, 30)) return;
        const n = Math.min(40, 6 + Math.floor(e.r * 6));
        f.flash(e.x, e.y, Math.max(1.2, e.r * 0.9), e.color, 0.18);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, s = (1 + Math.random() * 4) * Math.max(0.6, e.r);
          f.emit(e.x, e.y, 0.4, Math.cos(a) * s, Math.sin(a) * s, 2 + Math.random() * 4, 0.25 + Math.random() * 0.3, Math.max(0.3, e.r * 0.2), Math.random() < 0.3 ? '#fff3c4' : e.color, { add: true, grav: 6 });
          if (i % 2 === 0) f.emit(e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * e.r, 0.5, Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3, 1, 0.9 + Math.random() * 0.8, Math.max(0.6, e.r * 0.4), '#3e3a36', { grow: Math.max(0.5, e.r * 0.5), alpha: 0.6 });
        }
        if (e.r >= 1.5) f.scorch(e.x, e.y, e.r * 0.7);
        if (e.big) f.ring(e.x, e.y, e.r * 1.6, '#ffcc80', 0.5);
        // The drawn fireball on top: bigger blasts get the bigger sheets.
        {
          const big = e.big || e.r >= 3;
          const sheet = big ? ['explobig', 'explobig2', 'explobig3'][Math.floor(Math.random() * 3)] : e.r >= 1.2 ? ['explosn2', 'explosn3'][Math.floor(Math.random() * 2)] : 'explosn';
          this.spriteFx(e.x, e.y, sheet, big ? 0.9 : 0.55, Math.max(3, e.r * 2.6));
          if (big) this.spriteFx(e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * e.r, 'smoke', 1.2, Math.max(4, e.r * 2));
        }
        break;
      }
      case 'muzzle':
        if (!this.near(e.x, e.y, 30)) return;
        f.flash(e.x, e.y, 0.35 * e.size + 0.6, '#fff59d', 0.06, e.z ?? 0);
        for (let i = 0; i < 2 * e.size; i++) {
          const a = e.a + (Math.random() - 0.5) * 0.5, s = 5 + Math.random() * 8;
          f.emit(e.x, e.y, e.z ?? 1, Math.cos(a) * s, Math.sin(a) * s, 0, 0.1 + Math.random() * 0.08, 0.35, e.color, { add: true });
        }
        break;
      case 'spark':
        if (!this.near(e.x, e.y, 30)) return;
        for (let i = 0; i < e.n; i++) {
          const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 6;
          f.emit(e.x, e.y, 0.8, Math.cos(a) * s, Math.sin(a) * s, 1 + Math.random() * 3, 0.2 + Math.random() * 0.2, 0.3, e.color, { add: true, grav: 10 });
        }
        break;
      case 'beam':
        if (e.x0 === e.x1 && Math.abs(e.y0 - e.y1) < 0.1) f.pillar(e.x1, e.y1, Math.max(1, e.w * 2), e.color, e.life);
        else f.beam(e.x0, e.y0, e.x1, e.y1, e.w, e.color, e.life);
        break;
      case 'bolt':
        f.bolt(e.pts, e.color);
        break;
      case 'ring':
        f.ring(e.x, e.y, e.r, e.color);
        break;
      case 'dust':
        f.emit(e.x, e.y, 0.2, Math.random() - 0.5, Math.random() - 0.5, 0.8, 0.8, 1, e.color, { grow: 1.5, alpha: 0.5 });
        break;
      case 'heal':
        for (let i = 0; i < 24; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * 3;
          f.emit(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 0.5, 0, 0, 2 + Math.random() * 2, 0.8, 0.5, '#76ff03', { add: true });
        }
        break;
      case 'shake':
        this.shake(e.amt);
        break;
      case 'strike':
        f.pillar(e.x, e.y, 2, e.color, 0.25);
        f.flash(e.x, e.y, 3, e.color, 0.15);
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 4;
          f.emit(e.x, e.y, 0.3, Math.cos(a) * sp, Math.sin(a) * sp, 2, 0.3, 0.4, e.color, { add: true, grav: 8 });
        }
        break;
      case 'wave':
        for (let i = 0; i < 26; i++) {
          const a = e.a + (Math.random() - 0.5) * 2 * e.spread, sp = e.r * (1.6 + Math.random());
          f.emit(e.x, e.y, 1, Math.cos(a) * sp, Math.sin(a) * sp, 0, 0.35, 0.8, e.color, { add: true, grow: 1.2 });
        }
        break;
      case 'teleport':
        f.pillar(e.x, e.y, 4, '#18ffff', 0.5);
        f.ring(e.x, e.y, 8, '#18ffff', 0.5);
        break;
      case 'nuke':
        f.flash(e.x, e.y, e.r * 0.8, '#ffffff', 0.4);
        f.flash(e.x, e.y, e.r * 0.55, '#ffea00', 0.8);
        f.ring(e.x, e.y, e.r * 2.2, '#ffd740', 1.1);
        f.ring(e.x, e.y, e.r * 1.4, '#ff6d00', 0.8);
        f.scorch(e.x, e.y, e.r * 0.8);
        for (let i = 0; i < 220; i++) {
          const a = Math.random() * Math.PI * 2, sp = Math.random() * e.r * 0.6;
          const fire = ['#ffea00', '#ff9100', '#ff3d00', '#fff3c4'][i % 4];
          f.emit(e.x, e.y, 1, Math.cos(a) * sp, Math.sin(a) * sp, 1, 0.8 + Math.random(), 1.2 + Math.random() * 2, fire, { add: true, grow: 1 });
          if (i % 2 === 0) f.emit(e.x, e.y, 2, Math.cos(a) * sp * 0.5, Math.sin(a) * sp * 0.5, 1, 2.5 + Math.random() * 2, 2 + Math.random() * 2, '#8d6e63', { grow: 2, alpha: 0.7 });
        }
        this.shake(2.5);
        break;
    }
  }
}
