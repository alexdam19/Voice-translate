import { OBS_COLOR, TERRAIN, ZONE } from '../shared/map';
import { NODE_INFO, REGION_INFO, RUNE_INFO, type OpenWorld } from '../shared/mapgen';
import { ZONES } from '../shared/zones';
import type { Game } from '../game/game';
import { hexToRgb } from './pixel';
import type { View2D as View } from './view2d';
import { shipArtFor, topScale, TOP_PX } from './px/shipArt';

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
  private worldFog = -1;
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

  /** A low-res picture of the whole world's biomes (computed once per world). */
  private composeWorld(g: Game, px: number): void {
    const gen = g.gen as OpenWorld;
    const size = g.map.size;
    if (this.worldFor !== gen || this.world.width !== px) {
      this.worldFor = gen;
      this.world.width = px;
      this.world.height = px;
      const img = this.wctx.createImageData(px, px);
      const cols: number[][] = [];
      for (const z of Object.values(ZONE)) cols[z] = z === ZONE.EDGE ? [28, 24, 22] : hexToRgb(ZONES[z].color).map((v) => v * 0.55);
      for (let y = 0; y < px; y++) {
        for (let x = 0; x < px; x++) {
          const z = gen.zoneOf(((x + 0.5) / px) * size, ((y + 0.5) / px) * size);
          const c = cols[z];
          const k = (y * px + x) * 4;
          img.data[k] = c[0];
          img.data[k + 1] = c[1];
          img.data[k + 2] = c[2];
          img.data[k + 3] = 255;
        }
      }
      this.wctx.putImageData(img, 0, 0);
      this.worldFog = -1;
    }
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
    const art = g.player.fortress ? shipArtFor('main', null, false) : null;
    const hullPx = g.player.stats.length * s;
    if (art && hullPx >= 16) {
      const [px, py] = P(g.player.x, g.player.y);
      const { kx, ky } = topScale(g.player.stats.length, g.player.stats.width);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(g.player.rot);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(art.top, -TOP_PX.cx * kx * s, -TOP_PX.cy * ky * s, TOP_PX.w * kx * s, TOP_PX.h * ky * s);
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

  private drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, g: Game): void {
    const size = g.map.size;
    const px = 320;
    this.composeWorld(g, px);
    const s = w / size;
    const P = (x: number, y: number): Pt => [x * s, y * s];
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.world, 0, 0, w, h);
    // Where you've been, brighter.
    if (this.worldFog !== g.fogVersion || true) {
      const cps = Math.ceil(size / 32);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (const k of g.fog.seen.keys()) {
        const cx = k % cps, cy = Math.floor(k / cps);
        ctx.fillRect(cx * 32 * s, cy * 32 * s, Math.max(1, 32 * s), Math.max(1, 32 * s));
      }
      this.worldFog = g.fogVersion;
    }
    // Highways.
    const gen = g.gen as OpenWorld;
    ctx.strokeStyle = 'rgba(40,40,46,0.9)';
    ctx.lineWidth = Math.max(1, w / 400);
    ctx.beginPath();
    for (const sg of gen.roadsNear(0, 0, size - 1, size - 1)) {
      ctx.moveTo(sg.ax * s, sg.ay * s);
      ctx.lineTo(sg.bx * s, sg.by * s);
    }
    ctx.stroke();
    ctx.font = '10px Silkscreen, monospace';
    ctx.textAlign = 'center';
    // Regions: majors always (their signals reach the whole wasteland), minors once you've seen them.
    for (const reg of g.gen.regions) {
      const [x, y] = P(reg.x, reg.y);
      const info = REGION_INFO[reg.kind];
      ring(ctx, x, y, Math.max(5, reg.r * s), info.color);
      if (reg.kind === 'hangar') diamond(ctx, x, y, 7, info.color);
      ctx.fillStyle = info.color;
      ctx.fillText(reg.name.toUpperCase(), x, y - Math.max(6, reg.r * s) - 3);
    }
    for (const t of g.tanks) {
      if (t.dead || t.kind !== 'rival') continue;
      const [x, y] = P(t.x, t.y);
      ring(ctx, x, y, 5, '#ff1744');
    }
    const p = g.player;
    arrow(ctx, ...P(p.x, p.y), p.rot, 1.3);
    if (p.goal) {
      const [gx, gy] = P(p.goal.x, p.goal.y);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#76ff03';
      ctx.beginPath();
      ctx.moveTo(...P(p.x, p.y));
      ctx.lineTo(gx, gy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
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
