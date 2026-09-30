import { OBS_COLOR, TERRAIN, ZONE } from '../shared/map';
import { NODE_INFO, REGION_INFO, RUNE_INFO, type OpenWorld } from '../shared/mapgen';
import { ZONES } from '../shared/zones';
import type { Game } from '../game/game';
import { hexToRgb } from './pixel';
import type { View2D as View } from './view2d';
import { titanTop, topPalette } from './px/titanTop';
import { engineDef } from '../game/systems/engine';
import { nearestAAP } from './px/palette';

/** The corner radar's default reach (metres each way from the fortress): a Titan sees a long way. */
export const RADAR_R = 360;
/** Its zoom levels: reach each way, and how many tiles each radar pixel samples. */
const RADAR_LEVELS = [
  { R: 150, step: 1 },
  { R: 360, step: 2 },
  { R: 800, step: 4 },
  { R: 1800, step: 8 },
];

type Pt = [number, number];

/**
 * Two maps. The corner radar shows the ground around the fortress tile by tile. The world map is an overview of the
 * whole (enormous) world: biomes, highways, regions and the Mothership, dimmed where you haven't been.
 */
export class Minimap {
  private img = document.createElement('canvas');
  private ictx = this.img.getContext('2d')!;
  private data: ImageData | null = null;
  private origin: Pt = [-9999, -9999];
  private lastFog = -1;
  private world = document.createElement('canvas');
  private wctx = this.world.getContext('2d')!;
  private worldFor: unknown = null;
  /** Where each zone's name goes on the world map (its middle, in fractions of the map). */
  private zoneSpots: { z: number; x: number; y: number }[] = [];
  private ter = TERRAIN.map((t) => hexToRgb(t.color));
  /** Which radar zoom level is showing. */
  zoom = 1;
  private get R(): number {
    return RADAR_LEVELS[this.zoom].R;
  }

  /** Zooms the corner radar in (-1) or out (+1). */
  setZoom(z: number): void {
    const n = Math.max(0, Math.min(RADAR_LEVELS.length - 1, z));
    if (n === this.zoom) return;
    this.zoom = n;
    this.lastFog = -1;
  }
  private obs = OBS_COLOR.map((c) => (c ? hexToRgb(c) : [0, 0, 0]));

  /* ---------------- corner radar ---------------- */

  private composeLocal(g: Game): void {
    const { R: RR, step: RADAR_STEP } = RADAR_LEVELS[this.zoom];
    const n = (RR * 2) / RADAR_STEP;
    if (!this.data || this.data.width !== n) {
      this.img.width = n;
      this.img.height = n;
      this.data = this.ictx.createImageData(n, n);
    }
    const ox = Math.floor(g.player.x) - RR, oy = Math.floor(g.player.y) - RR;
    this.origin = [ox, oy];
    const d = this.data.data;
    const map = g.map;
    const world = g.mode === 'world';
    for (let y = 0; y < n; y++) {
      const ty = oy + y * RADAR_STEP;
      for (let x = 0; x < n; x++) {
        const tx = ox + x * RADAR_STEP;
        const k = (y * n + x) * 4;
        const c = map.inside(tx, ty) ? map.peek(tx >> 5, ty >> 5) : undefined;
        const seen = !world || g.revealAll || g.fog.isExplored(tx, ty);
        if (!c || !seen) {
          d[k] = 14;
          d[k + 1] = 12;
          d[k + 2] = 12;
          d[k + 3] = 255;
          continue;
        }
        const i = ((ty & 31) << 5) | (tx & 31);
        const o = c.obs[i];
        let col = o ? this.obs[o] : this.ter[c.ter[i]];
        if (c.zone[i] === ZONE.EDGE) col = [40, 34, 30];
        const lit = world && !g.isVisible(tx, ty) ? 0.62 : 1;
        const f = (o ? 0.75 : 1) * lit;
        d[k] = col[0] * f;
        d[k + 1] = col[1] * f;
        d[k + 2] = col[2] * f;
        d[k + 3] = 255;
      }
    }
    this.ictx.putImageData(this.data, 0, 0);
  }

  /* ---------------- world overview ---------------- */

  /**
   * The whole world as a pixel-art relief map (computed once per world): each zone's ground with its own texture
   * (dune ripples, snowfields, forest, dark water, scorched cracks, ash craters, factory blocks, rock spires,
   * mountains, the Divot's bowl), shaded from the north-west by a height field, snapped to the AAP-64 palette.
   */
  private composeWorld(g: Game, px: number): void {
    const gen = g.gen as OpenWorld;
    const size = g.map.size;
    if (this.worldFor === gen && this.world.width === px) return;
    this.worldFor = gen;
    this.world.width = px;
    this.world.height = px;
    const img = this.wctx.createImageData(px, px);
    const zoneAt = new Uint8Array(px * px);
    const sums = new Map<number, [number, number, number]>();
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        const z = gen.zoneOf(((x + 0.5) / px) * size, ((y + 0.5) / px) * size);
        zoneAt[y * px + x] = z;
        const sm = sums.get(z) ?? [0, 0, 0];
        sm[0] += x;
        sm[1] += y;
        sm[2]++;
        sums.set(z, sm);
      }
    }
    this.zoneSpots = [...sums].filter(([z, sm]) => z !== ZONE.EDGE && sm[2] > px * px * 0.004).map(([z, sm]) => ({ z, x: sm[0] / sm[2] / px, y: sm[1] / sm[2] / px }));
    // The landscape is the same whatever the size it's drawn at: noise cells scale with it.
    const ks = px / 320;
    const hash = (x: number, y: number, s: number): number => {
      let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const vnoise = (x: number, y: number, cell: number, s: number): number => {
      const fx = x / cell, fy = y / cell, gx = Math.floor(fx), gy = Math.floor(fy), tx = fx - gx, ty = fy - gy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = hash(gx, gy, s), b = hash(gx + 1, gy, s), c = hash(gx, gy + 1, s), d = hash(gx + 1, gy + 1, s);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    };
    const rough: Partial<Record<number, number>> = { [ZONE.WRAITH]: 1.6, [ZONE.FROST]: 1.2, [ZONE.SPIRES]: 1.4, [ZONE.PASS]: 1.1, [ZONE.EDGE]: 1.8, [ZONE.LAKE]: 0.4, [ZONE.DUNES]: 0.7 };
    const height = (x: number, y: number): number => {
      const z = zoneAt[Math.max(0, Math.min(px - 1, y)) * px + Math.max(0, Math.min(px - 1, x))];
      const k = rough[z] ?? 0.8;
      let hgt = (vnoise(x, y, 24 * ks, 1) * 0.58 + vnoise(x, y, 9 * ks, 2) * 0.28 + vnoise(x, y, 4 * ks, 3) * 0.1 + vnoise(x, y, 1.6 * ks, 11) * 0.04) * k;
      if (z === ZONE.DIVOT) {
        const dx = x / px - 0.47, dy = y / px - 0.44;
        hgt -= Math.max(0, 0.22 - Math.hypot(dx, dy)) * 5;
      }
      return hgt;
    };
    const H = new Float32Array(px * px);
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) H[y * px + x] = height(x, y);
    const at = (x: number, y: number): number => H[Math.max(0, Math.min(px - 1, y)) * px + Math.max(0, Math.min(px - 1, x))];
    const base: number[][] = [];
    for (const z of Object.values(ZONE)) base[z] = z === ZONE.EDGE ? [52, 44, 40] : hexToRgb(ZONES[z].ground);
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        const z = zoneAt[y * px + x];
        const c = base[z] ?? [60, 50, 40];
        // Light from the north-west.
        const shade = (at(x - 1, y - 1) - at(x + 1, y + 1)) * 2.4;
        let k = 1 + shade;
        let [r, gg, b] = c;
        const hh = hash(x, y, 7);
        // Texture in world terms (the pixel coordinates at the 320 px scale the textures were made for).
        const X = Math.floor(x / ks), Y = Math.floor(y / ks);
        switch (z) {
          case ZONE.DUNES:
            if (Math.sin((x * 0.55 + y * 0.22) / ks + vnoise(x, y, 12 * ks, 4) * 9) > 0.72) k += 0.16;
            break;
          case ZONE.FROST:
          case ZONE.WRAITH:
            if (at(x, y) > 0.7 || hh > 0.93) [r, gg, b] = [226, 232, 240];
            break;
          case ZONE.VERDANT:
            if (vnoise(x, y, 7 * ks, 5) > 0.58 && hh > 0.35) {
              [r, gg, b] = [30, 70, 34];
              if (hash(x - 1, y - 1, 7) < 0.35) k += 0.35;
            }
            break;
          case ZONE.LAKE:
            if (at(x, y) < 0.42) {
              [r, gg, b] = [20, 40, 58];
              if ((X + Y * 3) % 7 === 0 && hh > 0.6) k += 0.4;
            }
            break;
          case ZONE.SCORCHED:
            if (Math.abs(Math.sin(vnoise(x, y, 10 * ks, 6) * 22)) < 0.09) [r, gg, b] = [250, 106, 10];
            break;
          case ZONE.ASH:
            if (hash(X >> 3, Y >> 3, 8) > 0.8 && Math.hypot((X & 7) - 3.5, (Y & 7) - 3.5) < 2.2) k -= 0.28;
            break;
          case ZONE.RUSTBOLT:
            if (hash(X >> 2, Y >> 2, 9) > 0.62 && (X & 3) && (Y & 3)) {
              [r, gg, b] = [113, 65, 59];
              if ((Y & 3) === 1) k += 0.25;
            }
            break;
          case ZONE.SPIRES:
            if (hh > 0.9) {
              [r, gg, b] = [188, 74, 155];
              k += 0.3;
            }
            break;
          case ZONE.DIVOT:
            k -= 0.1;
            break;
          case ZONE.EDGE:
            k *= 0.8;
            break;
        }
        // Contour lines on the high ground, and a dark seam where one zone meets another.
        if ((rough[z] ?? 0.8) >= 1.1) {
          const lv = Math.floor(at(x, y) * 9);
          if (lv !== Math.floor(at(x + 1, y) * 9) || lv !== Math.floor(at(x, y + 1) * 9)) k -= 0.16;
        }
        if (x + 1 < px && y + 1 < px && (zoneAt[y * px + x + 1] !== z || zoneAt[(y + 1) * px + x] !== z)) k *= 0.62;
        // A touch of ordered dither so flat ground isn't flat.
        k += ((((x & 1) ^ (y & 1)) ? 1 : -1) * 0.025) + (hh - 0.5) * 0.06;
        const q = nearestAAP(r * k, gg * k, b * k);
        const i = (y * px + x) * 4;
        img.data[i] = q[0];
        img.data[i + 1] = q[1];
        img.data[i + 2] = q[2];
        img.data[i + 3] = 255;
      }
    }
    this.wctx.putImageData(img, 0, 0);
  }

  /** World point under a click on the corner radar (fractions of its width and height). */
  radarPoint(fx: number, fy: number): { x: number; y: number } {
    return { x: this.origin[0] + fx * this.R * 2, y: this.origin[1] + fy * this.R * 2 };
  }

  /** Draws the map into `ctx` (w x h css px). The corner radar, or (`big`) the whole-world overview. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, g: Game, view: View, big: boolean): void {
    if (big && g.mode === 'world') {
      this.drawWorld(ctx, w, h, g);
      return;
    }
    const RR = this.R;
    const moved = Math.abs(g.player.x - (this.origin[0] + RR)) > RR / 15 || Math.abs(g.player.y - (this.origin[1] + RR)) > RR / 15;
    if (moved || g.fogVersion - this.lastFog >= 3 || this.lastFog < 0) {
      this.composeLocal(g);
      this.lastFog = g.fogVersion;
    }
    const n = RR * 2;
    const s = w / n;
    const [ox, oy] = this.origin;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.img, 0, 0, w, h);
    const P = (x: number, y: number): Pt => [(x - ox) * s, (y - oy) * s];
    const onMap = (x: number, y: number): boolean => x > ox && y > oy && x < ox + n && y < oy + n;
    const explored = (x: number, y: number): boolean => g.isExplored(x, y);
    if (g.mode === 'world') {
      for (const o of g.gen.outposts) {
        if (g.outpostsDown.has(o.id) || !onMap(o.x, o.y) || !explored(o.x, o.y)) continue;
        const [x, y] = P(o.x, o.y);
        ctx.fillStyle = '#0b0b0e';
        ctx.fillRect(x - 5, y - 5, 10, 10);
        ctx.fillStyle = '#ff1744';
        ctx.fillRect(x - 4, y - 4, 8, 8);
      }
      for (const st of g.gen.sites) {
        if (!onMap(st.x, st.y) || !explored(st.x, st.y)) continue;
        const [x, y] = P(st.x, st.y);
        diamond(ctx, x, y, 5, st.readyAt <= g.time ? '#ffd740' : '#757575');
      }
      for (const r of g.gen.runes) {
        if (!onMap(r.x, r.y) || !explored(r.x, r.y)) continue;
        const [x, y] = P(r.x, r.y);
        dot(ctx, x, y, 4, r.readyAt <= g.time ? RUNE_INFO[r.rune].color : '#616161');
      }
      for (const nd of g.gen.nodes) {
        if (nd.respawnAt || !onMap(nd.x, nd.y) || !explored(nd.x, nd.y)) continue;
        const [x, y] = P(nd.x, nd.y);
        ctx.fillStyle = NODE_INFO[nd.type].color;
        const ns = Math.max(1, Math.min(4, 4 * s));
        ctx.fillRect(x - ns, y - ns, ns * 2, ns * 2);
      }
      if (onMap(g.gen.gate.x, g.gen.gate.y)) {
        const [gx, gy] = P(g.gen.gate.x, g.gen.gate.y);
        ring(ctx, gx, gy, 6, '#ff1744');
      }
      // Regions and the Mothership just off the radar get an arrow on the rim.
      for (const reg of g.gen.regions) {
        const [x, y] = P(reg.x, reg.y);
        const inside = onMap(reg.x, reg.y);
        const col = REGION_INFO[reg.kind].color;
        if (inside) ring(ctx, x, y, Math.max(6, reg.r * s), col);
        else if (Math.hypot(reg.x - g.player.x, reg.y - g.player.y) < RR * 3) {
          const a = Math.atan2(reg.y - g.player.y, reg.x - g.player.x);
          dot(ctx, w / 2 + Math.cos(a) * (w / 2 - 6), h / 2 + Math.sin(a) * (h / 2 - 6), 3.5, col);
        }
      }
    }
    // Enemies in sight (or radar range).
    const radar = g.player.stats.radar;
    // Colossi: always on the radar, a pulsing skull-red diamond (an arrow on the rim when off the map).
    for (const c of g.colossi) {
      if (c.dying > 0) continue;
      const pulse = 5 + (Math.sin(performance.now() / 180) + 1) * 2;
      if (onMap(c.x, c.y)) {
        const [x, y] = P(c.x, c.y);
        ctx.fillStyle = '#ff1744';
        ctx.beginPath();
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x + 7, y);
        ctx.lineTo(x, y + 7);
        ctx.lineTo(x - 7, y);
        ctx.closePath();
        ctx.fill();
        ring(ctx, x, y, pulse + 4, '#ff1744');
      } else {
        const a = Math.atan2(c.y - g.player.y, c.x - g.player.x);
        const x = w / 2 + Math.cos(a) * (w / 2 - 8), y = h / 2 + Math.sin(a) * (h / 2 - 8);
        ctx.fillStyle = '#ff1744';
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
        ctx.lineTo(x + Math.cos(a + 2.4) * 6, y + Math.sin(a + 2.4) * 6);
        ctx.lineTo(x + Math.cos(a - 2.4) * 6, y + Math.sin(a - 2.4) * 6);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const e of g.enemies) {
      if (e.colossus || !onMap(e.x, e.y)) continue;
      const seen = g.mode !== 'world' || g.isVisible(e.x, e.y) || (radar > 0 && Math.hypot(e.x - g.player.x, e.y - g.player.y) < radar);
      if (!seen || e.burrowed) continue;
      const [x, y] = P(e.x, e.y);
      ctx.fillStyle = e.titan ? '#ff1744' : '#e53935';
      const r = Math.max(e.titan ? 4 : 1.2, Math.min(8, e.r * s * 1.5));
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (const t of g.tanks) {
      if (t.dead || !onMap(t.x, t.y)) continue;
      if (t.kind !== 'rival' && g.mode === 'world' && !g.isVisible(t.x, t.y) && Math.hypot(t.x - g.player.x, t.y - g.player.y) > radar) continue;
      const [x, y] = P(t.x, t.y);
      ctx.fillStyle = t.kind === 'remote' ? '#e040fb' : '#ff5252';
      const sz = t.kind === 'rival' ? 5 : 3;
      ctx.fillRect(x - sz, y - sz, sz * 2, sz * 2);
      if (t.kind === 'rival') ring(ctx, x, y, sz + 3 + (Math.sin(performance.now() / 200) + 1) * 2, '#ff1744');
    }
    for (const k of g.pickups) {
      if ((k.kind !== 'chest' && k.kind !== 'weapon') || !onMap(k.x, k.y)) continue;
      const [x, y] = P(k.x, k.y);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    if (g.outrider && !g.outrider.dead && onMap(g.outrider.x, g.outrider.y)) {
      const [x, y] = P(g.outrider.x, g.outrider.y);
      ctx.fillStyle = '#26c6da';
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    }
    // The Mega Hangar's airships.
    for (const f of g.flights) {
      if (!onMap(f.x, f.y)) continue;
      const [x, y] = P(f.x, f.y);
      dot(ctx, x, y, 3, '#40c4ff');
      ring(ctx, x, y, 6, 'rgba(64,196,255,0.6)');
    }
    // Close in, your hull is drawn to scale from its sheet (farther out, an arrow).
    const pl = g.player;
    const art = pl.fortress ? titanTop(pl.stats.length, pl.stats.width, topPalette('main', pl.klass, false), `main|${pl.klass}|false`, engineDef(pl.engineKey).flame.jets, false, 0.7) : null;
    const hullPx = g.player.stats.length * s;
    if (art && hullPx >= 16) {
      const [px, py] = P(g.player.x, g.player.y);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(g.player.rot);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(art.top, art.x0 * s, art.y0 * s, art.w * s, art.h * s);
      ctx.imageSmoothingEnabled = false;
      ctx.restore();
    } else arrow(ctx, ...P(g.player.x, g.player.y), g.player.rot, 1);
    // Camera frame
    const c0 = view.screenToWorld(0, 0), c1 = view.screenToWorld(view.width, 0), c2 = view.screenToWorld(view.width, view.height), c3 = view.screenToWorld(0, view.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(...P(c0.x, c0.y));
    ctx.lineTo(...P(c1.x, c1.y));
    ctx.lineTo(...P(c2.x, c2.y));
    ctx.lineTo(...P(c3.x, c3.y));
    ctx.closePath();
    ctx.stroke();
  }

  /**
   * The world map, drawn like a chart: the relief (painted once, at the map's own size), the ground you've covered
   * warmed a touch, a 10 km grid with its letters and numbers, the highways cased like roads, each zone's name across
   * it, every place by what it is (the Hangar's fortress, settlements, raider camps, towns, farms, factories, ruins,
   * hives) on a name plate, loot areas, rune altars and outposts you've found, the colossi and rival Titans, you and
   * the satnav's route, a compass rose and a scale bar.
   */
  private drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, g: Game): void {
    const size = g.map.size;
    const px = Math.max(320, Math.min(1024, Math.round(w)));
    this.composeWorld(g, px);
    const s = w / size;
    const P = (x: number, y: number): Pt => [x * s, y * s];
    const gen = g.gen as OpenWorld;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.world, 0, 0, w, h);
    // Where you've been, warmed a touch.
    {
      const cps = Math.ceil(size / 32);
      ctx.fillStyle = 'rgba(255,236,200,0.12)';
      for (const k of g.fog.seen.keys()) {
        const cx = k % cps, cy = Math.floor(k / cps);
        ctx.fillRect(cx * 32 * s, cy * 32 * s, Math.max(1, 32 * s), Math.max(1, 32 * s));
      }
    }
    // The grid: every 10 km, lettered along the top and numbered down the side.
    const step = 10000;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let v = step; v < size; v += step) {
      ctx.moveTo(Math.round(v * s) + 0.5, 0);
      ctx.lineTo(Math.round(v * s) + 0.5, h);
      ctx.moveTo(0, Math.round(v * s) + 0.5);
      ctx.lineTo(w, Math.round(v * s) + 0.5);
    }
    ctx.stroke();
    ctx.font = '9px Silkscreen, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i * step < size; i++) {
      const c = (i + 0.5) * step * s;
      if (c > w - 4) break;
      plateText(ctx, String.fromCharCode(65 + i), c, 7, 'rgba(210,220,230,0.75)', 'rgba(0,0,0,0.45)');
      plateText(ctx, String(i + 1), 7, c, 'rgba(210,220,230,0.75)', 'rgba(0,0,0,0.45)');
    }
    // Highways: a dark casing and a pale road.
    const roads = gen.roadsNear(0, 0, size - 1, size - 1);
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const [lw, col] of [[Math.max(2.5, w / 220), 'rgba(20,18,16,0.85)'], [Math.max(1, w / 520), 'rgba(222,206,170,0.9)']] as [number, string][]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (const sg of roads) {
        ctx.moveTo(sg.ax * s, sg.ay * s);
        ctx.lineTo(sg.bx * s, sg.by * s);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    // Each zone's name across its middle, spaced out and faint.
    ctx.font = `${Math.round(Math.max(9, w / 60))}px Silkscreen, monospace`;
    // (Boxes already taken: the big places' name plates, then each zone name as it goes down.)
    const taken: [number, number, number, number][] = g.gen.regions.filter((r) => r.major).map((r) => {
      const [x, y] = P(r.x, r.y);
      return [x - 55, y - 26, x + 55, y + 8];
    });
    const free = (x0: number, y0: number, x1: number, y1: number): boolean => !taken.some(([a, b, c, d]) => x0 < c && x1 > a && y0 < d && y1 > b);
    for (const sp of this.zoneSpots) {
      const label = ZONES[sp.z].name.toUpperCase().split('').join(' ');
      const tw = ctx.measureText(label).width;
      const lx = Math.max(tw / 2 + 12, Math.min(w - tw / 2 - 12, sp.x * w));
      // Just under the middle, or a little above or below that if something's in the way.
      const ly = [sp.y * h + 16, sp.y * h - 12, sp.y * h + 40, sp.y * h - 36].find((y) => free(lx - tw / 2, y - 8, lx + tw / 2, y + 8));
      if (ly === undefined) continue;
      taken.push([lx - tw / 2, ly - 8, lx + tw / 2, ly + 8]);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(label, lx + 1, ly + 1);
      ctx.fillStyle = 'rgba(255,248,230,0.55)';
      ctx.fillText(label, lx, ly);
    }
    // What you've found out there: outposts, loot areas, rune altars.
    const explored = (x: number, y: number): boolean => g.isExplored(x, y);
    for (const o of gen.outposts) {
      if (g.outpostsDown.has(o.id) || !explored(o.x, o.y)) continue;
      const [x, y] = P(o.x, o.y);
      ctx.fillStyle = '#0b0b0e';
      ctx.fillRect(x - 4, y - 4, 8, 8);
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    for (const st of gen.sites) {
      if (!explored(st.x, st.y)) continue;
      const [x, y] = P(st.x, st.y);
      diamond(ctx, x, y, 4, st.readyAt <= g.time ? '#ffd740' : '#757575');
    }
    for (const r of gen.runes) {
      if (!explored(r.x, r.y)) continue;
      const [x, y] = P(r.x, r.y);
      dot(ctx, x, y, 3, r.readyAt <= g.time ? RUNE_INFO[r.rune].color : '#616161');
    }
    // Places: an icon for what each is, its name on a plate (the big ones always; the small ones once you know them).
    ctx.font = '10px Silkscreen, monospace';
    for (const reg of g.gen.regions) {
      const [x, y] = P(reg.x, reg.y);
      const info = REGION_INFO[reg.kind];
      const big = reg.kind === 'divot' || reg.kind === 'lake' || reg.kind === 'spires';
      if (big) ring(ctx, x, y, Math.max(6, reg.r * s), info.color);
      else placeIcon(ctx, reg.kind, x, y, info.color);
      plateText(ctx, reg.name.toUpperCase(), x, y - (big ? Math.max(6, reg.r * s) : 9) - 7, info.color, 'rgba(6,8,12,0.72)');
    }
    // Colossi on the prowl, rival Titans.
    for (const c of g.colossi) {
      if (c.dying > 0) continue;
      const [x, y] = P(c.x, c.y);
      diamond(ctx, x, y, 8, '#ff1744');
      ring(ctx, x, y, 12, '#ff1744');
      plateText(ctx, 'COLOSSUS', x, y - 20, '#ff5a6a', 'rgba(6,8,12,0.72)');
    }
    for (const t of g.tanks) {
      if (t.dead || t.kind !== 'rival') continue;
      const [x, y] = P(t.x, t.y);
      ring(ctx, x, y, 5, '#ff1744');
    }
    const p = g.player;
    // The satnav's route (a plotted course in green, the mission in cyan), along the roads it takes.
    const n = g.nav;
    if (n) {
      ctx.setLineDash([4, 3]);
      ctx.lineDashOffset = -((performance.now() / 60) % 7);
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3.5;
      const route = (): void => {
        ctx.beginPath();
        ctx.moveTo(...P(p.x, p.y));
        for (let i = n.seg + 1; i < n.pts.length; i++) ctx.lineTo(...P(n.pts[i].x, n.pts[i].y));
        ctx.stroke();
      };
      route();
      ctx.strokeStyle = n.kind === 'course' ? '#76ff03' : '#18ffff';
      ctx.lineWidth = 1.5;
      route();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      const [tx, ty] = P(n.tx, n.ty);
      ring(ctx, tx, ty, 5, n.kind === 'course' ? '#76ff03' : '#18ffff');
    } else if (p.goal) {
      const [gx, gy] = P(p.goal.x, p.goal.y);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#76ff03';
      ctx.beginPath();
      ctx.moveTo(...P(p.x, p.y));
      ctx.lineTo(gx, gy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // You: a halo so you're easy to find, and the arrow.
    {
      const [x, y] = P(p.x, p.y);
      const pulse = 7 + ((performance.now() / 90) % 10);
      ctx.strokeStyle = `rgba(118,255,3,${0.8 - (pulse - 7) / 12})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, pulse, 0, Math.PI * 2);
      ctx.stroke();
      arrow(ctx, x, y, p.rot, 1.3);
    }
    // Compass rose and scale bar.
    compass(ctx, w - 28, 44, 14);
    {
      const km = 10;
      const len = km * 1000 * s;
      const x0 = 26, y0 = h - 14;
      ctx.fillStyle = 'rgba(6,8,12,0.7)';
      ctx.fillRect(x0 - 4, y0 - 12, len + 8, 20);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 ? '#1a1a1a' : '#e8e0cc';
        ctx.fillRect(x0 + (i * len) / 5, y0, len / 5, 3);
      }
      ctx.fillStyle = '#e8e0cc';
      ctx.font = '9px Silkscreen, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('0', x0, y0 - 5);
      ctx.textAlign = 'right';
      ctx.fillText(`${km} KM`, x0 + len, y0 - 5);
    }
    // A frame.
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    ctx.strokeStyle = 'rgba(224,200,150,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(4.5, 4.5, w - 9, h - 9);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

/** Text on a dark plate (centred on x, y). */
function plateText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, col: string, back: string): void {
  const ta = ctx.textAlign, tb = ctx.textBaseline;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = back;
  ctx.fillRect(Math.round(x - tw / 2 - 3), Math.round(y - 6), Math.round(tw + 6), 12);
  ctx.fillStyle = col;
  ctx.fillText(text, Math.round(x), Math.round(y) + 0.5);
  ctx.textAlign = ta;
  ctx.textBaseline = tb;
}

/** A little pixel icon for a kind of place: a fortress, houses, a barn and silo, a factory, a flag, broken pillars, a nest. */
function placeIcon(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, col: string): void {
  const X = Math.round(x), Y = Math.round(y);
  const R = (a: number, b: number, w: number, h: number, c: string): void => {
    ctx.fillStyle = c;
    ctx.fillRect(X + a, Y + b, w, h);
  };
  const dark = '#0a0b0e';
  switch (kind) {
    case 'hangar':
      // A walled fortress: towers at the corners, the great arched hangar in the middle.
      R(-8, -6, 17, 13, dark);
      R(-7, -5, 15, 11, '#1e4a60');
      R(-7, -5, 15, 1, col);
      for (const [a, b] of [[-8, -7], [6, -7], [-8, 4], [6, 4]]) {
        R(a, b, 3, 4, dark);
        R(a + 1, b + 1, 1, 2, col);
      }
      R(-3, -2, 7, 5, '#9ad8ff');
      R(-3, -2, 7, 1, '#ffffff');
      break;
    case 'settlement':
    case 'town':
      for (const [a, b] of [[-6, -1], [0, -4], [2, 1]]) {
        R(a - 1, b - 1, 6, 6, dark);
        R(a, b + 1, 4, 3, kind === 'settlement' ? '#c8b890' : '#8a8078');
        R(a, b, 4, 1, kind === 'settlement' ? col : '#6a4a3a');
      }
      if (kind === 'settlement') R(-1, -7, 1, 3, col);
      break;
    case 'farm':
      R(-6, -3, 8, 7, dark);
      R(-5, -1, 6, 4, '#a83a2a');
      R(-5, -2, 6, 1, '#d8c090');
      R(3, -6, 4, 10, dark);
      R(4, -5, 2, 8, '#c8c8c0');
      break;
    case 'factory':
      R(-7, -2, 14, 7, dark);
      R(-6, -1, 12, 5, '#6a5a4a');
      R(3, -8, 3, 7, dark);
      R(4, -7, 1, 6, '#8a7a6a');
      R(-4, 0, 2, 2, col);
      R(0, 0, 2, 2, col);
      break;
    case 'raider':
    case 'camp':
      // A spiked palisade and a red flag.
      for (let i = -6; i <= 5; i += 2) {
        R(i, -2, 2, 6, dark);
        R(i, -1, 1, 4, '#7a5a3a');
      }
      R(0, -9, 1, 7, dark);
      R(1, -9, 4, 3, col);
      break;
    case 'ruins':
      for (const [a, hgt] of [[-5, 7], [-1, 4], [3, 6]]) {
        R(a - 1, 4 - hgt - 1, 3, hgt + 1, dark);
        R(a, 4 - hgt, 1, hgt, '#b0a090');
      }
      break;
    case 'hive':
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(X, Y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6a2a7a';
      ctx.beginPath();
      ctx.arc(X, Y, 5, 0, Math.PI * 2);
      ctx.fill();
      R(-2, -1, 1, 1, col);
      R(1, -1, 1, 1, col);
      R(-1, 2, 2, 1, col);
      break;
    default:
      ring(ctx, x, y, 5, col);
  }
}

/** A compass rose: the north needle in red. */
function compass(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = 'rgba(6,8,12,0.65)';
  ctx.beginPath();
  ctx.arc(x, y, r + 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(224,200,150,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.stroke();
  for (const [a, col] of [[-Math.PI / 2, '#ff3d2e'], [Math.PI / 2, '#e8e0cc'], [0, '#8a8478'], [Math.PI, '#8a8478']] as [number, string][]) {
    const long = a === -Math.PI / 2 || a === Math.PI / 2 ? r : r * 0.6;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * long, y + Math.sin(a) * long);
    ctx.lineTo(x + Math.cos(a + Math.PI / 2) * 3, y + Math.sin(a + Math.PI / 2) * 3);
    ctx.lineTo(x + Math.cos(a - Math.PI / 2) * 3, y + Math.sin(a - Math.PI / 2) * 3);
    ctx.fill();
  }
  ctx.fillStyle = '#ff3d2e';
  ctx.font = '9px Silkscreen, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', x, y - r - 9);
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string): void {
  ctx.fillStyle = '#0b0b0e';
  ctx.beginPath();
  ctx.arc(x, y, r + 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string): void {
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string): void {
  ctx.fillStyle = '#0b0b0e';
  ctx.beginPath();
  ctx.moveTo(x, y - r - 1);
  ctx.lineTo(x + r + 1, y);
  ctx.lineTo(x, y + r + 1);
  ctx.lineTo(x - r - 1, y);
  ctx.fill();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(x, y - r + 1);
  ctx.lineTo(x + r - 1, y);
  ctx.lineTo(x, y + r - 1);
  ctx.lineTo(x - r + 1, y);
  ctx.fill();
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, k: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(k, k);
  ctx.fillStyle = '#0b0b0e';
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-6, -6);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#43d15a';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.5, -4.5);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-4.5, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
