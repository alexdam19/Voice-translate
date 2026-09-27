import { OBS_COLOR, TERRAIN, ZONE, type GameMap } from '../shared/map';
import { NODE_INFO, RUNE_INFO } from '../shared/mapgen';
import type { Game } from '../game/game';
import { hexToRgb } from './pixel';
import type { View } from './view';

/** Terrain colors per tile, computed once per map. */
function baseImage(map: GameMap): Uint8ClampedArray {
  const n = map.size;
  const out = new Uint8ClampedArray(n * n * 4);
  const ter = TERRAIN.map((t) => hexToRgb(t.color));
  const obs = OBS_COLOR.map((c) => (c ? hexToRgb(c) : [0, 0, 0]));
  for (let i = 0; i < n * n; i++) {
    const o = map.obs[i];
    let c = o ? obs[o] : ter[map.ter[i]];
    if (map.zone[i] === ZONE.EDGE) c = [40, 34, 30];
    const k = o ? 0.75 : 1;
    out[i * 4] = c[0] * k;
    out[i * 4 + 1] = c[1] * k;
    out[i * 4 + 2] = c[2] * k;
    out[i * 4 + 3] = 255;
  }
  return out;
}

export class Minimap {
  private base: Uint8ClampedArray | null = null;
  private img: HTMLCanvasElement;
  private imgCtx: CanvasRenderingContext2D;
  private data: ImageData | null = null;
  private lastCompose = -1;
  private mapRef: GameMap | null = null;

  constructor() {
    this.img = document.createElement('canvas');
    this.imgCtx = this.img.getContext('2d')!;
  }

  private compose(g: Game): void {
    if (this.mapRef !== g.map || !this.base) {
      this.mapRef = g.map;
      this.base = baseImage(g.map);
      this.img.width = g.map.size;
      this.img.height = g.map.size;
      this.data = this.imgCtx.createImageData(g.map.size, g.map.size);
    }
    const d = this.data!.data;
    const b = this.base;
    const world = g.mode === 'world';
    for (let i = 0; i < g.map.size * g.map.size; i++) {
      const e = !world || g.revealAll || g.explored[i];
      const k = e ? (world && !g.visible[i] ? 0.62 : 1) : 0.08;
      d[i * 4] = b[i * 4] * k;
      d[i * 4 + 1] = b[i * 4 + 1] * k;
      d[i * 4 + 2] = b[i * 4 + 2] * k;
      d[i * 4 + 3] = 255;
    }
    this.imgCtx.putImageData(this.data!, 0, 0);
  }

  /** Draws the whole map scaled into `ctx` (w x h css px). */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, g: Game, view: View, big: boolean): void {
    if (g.fogVersion !== this.lastCompose || this.mapRef !== g.map) {
      if (this.lastCompose < 0 || g.fogVersion - this.lastCompose >= 2 || this.mapRef !== g.map || big) {
        this.compose(g);
        this.lastCompose = g.fogVersion;
      }
    }
    const n = g.map.size;
    const s = w / n;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.img, 0, 0, w, h);
    const P = (x: number, y: number): [number, number] => [x * s, y * s];
    const explored = (x: number, y: number): boolean => g.mode !== 'world' || g.revealAll || g.explored[Math.floor(y) * n + Math.floor(x)] === 1;
    if (g.mode === 'world') {
      if (big) {
        for (const nd of g.gen.nodes) {
          if (nd.respawnAt || !explored(nd.x, nd.y)) continue;
          const [x, y] = P(nd.x, nd.y);
          ctx.fillStyle = NODE_INFO[nd.type].color;
          ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        }
      }
      for (const o of g.gen.outposts) {
        if (g.outpostsDown.has(o.id) || !explored(o.x, o.y)) continue;
        const [x, y] = P(o.x, o.y);
        ctx.fillStyle = '#0b0b0e';
        ctx.fillRect(x - 5, y - 5, 10, 10);
        ctx.fillStyle = '#ff1744';
        ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.fillStyle = '#0b0b0e';
        ctx.fillRect(x - 2, y - 4, 1, 3);
        ctx.fillRect(x + 1, y - 4, 1, 3);
      }
      for (const st of g.gen.sites) {
        if (!explored(st.x, st.y)) continue;
        const [x, y] = P(st.x, st.y);
        const ready = st.readyAt <= g.time;
        ctx.fillStyle = '#0b0b0e';
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 6, y);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x - 6, y);
        ctx.fill();
        ctx.fillStyle = ready ? '#ffd740' : '#757575';
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 4, y);
        ctx.fill();
      }
      for (const r of g.gen.runes) {
        if (!explored(r.x, r.y)) continue;
        const [x, y] = P(r.x, r.y);
        ctx.fillStyle = '#0b0b0e';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = r.readyAt <= g.time ? RUNE_INFO[r.rune].color : '#616161';
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const [gx, gy] = P(g.gen.gate.x, g.gen.gate.y);
      ctx.strokeStyle = '#ff1744';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, gy, 6, 0, Math.PI * 2);
      ctx.stroke();
      if (big) {
        ctx.fillStyle = '#ff8a80';
        ctx.font = '11px Silkscreen, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DEAD ZONE', gx, gy - 10);
      }
    }
    // Enemies in sight (or radar range).
    const radar = g.player.stats.radar;
    for (const e of g.enemies) {
      const seen = g.mode !== 'world' || g.isVisible(e.x, e.y) || (radar > 0 && Math.hypot(e.x - g.player.x, e.y - g.player.y) < radar);
      if (!seen || e.burrowed) continue;
      const [x, y] = P(e.x, e.y);
      ctx.fillStyle = e.titan ? '#ff1744' : '#e53935';
      const r = e.titan ? 4 : 1.5;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (const t of g.tanks) {
      // Rivals are always on the map: they're hunting you, and you should be able to hunt them back.
      if (t.dead || (t.kind !== 'rival' && g.mode === 'world' && !g.isVisible(t.x, t.y) && Math.hypot(t.x - g.player.x, t.y - g.player.y) > radar)) continue;
      const [x, y] = P(t.x, t.y);
      ctx.fillStyle = t.kind === 'remote' ? '#e040fb' : '#ff5252';
      const s = t.kind === 'rival' ? 5 : 3;
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
      if (t.kind === 'rival') {
        ctx.strokeStyle = '#ff1744';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, s + 3 + (Math.sin(performance.now() / 200) + 1) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const k of g.pickups) {
      if (k.kind !== 'chest' && k.kind !== 'weapon') continue;
      const [x, y] = P(k.x, k.y);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    if (g.outrider && !g.outrider.dead) {
      const [x, y] = P(g.outrider.x, g.outrider.y);
      ctx.fillStyle = '#0b0b0e';
      ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
      ctx.fillStyle = '#26c6da';
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    }
    // Player arrow
    const p = g.player;
    const [px, py] = P(p.x, p.y);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.rot);
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
    // Camera frame
    const c0 = view.screenToWorld(0, 0), c1 = view.screenToWorld(view.width, 0), c2 = view.screenToWorld(view.width, view.height), c3 = view.screenToWorld(0, view.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(...P(c0.x, c0.y));
    ctx.lineTo(...P(c1.x, c1.y));
    ctx.lineTo(...P(c2.x, c2.y));
    ctx.lineTo(...P(c3.x, c3.y));
    ctx.closePath();
    ctx.stroke();
  }
}
