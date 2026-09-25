import { TILE, ZONE_W } from '../shared/constants';
import { getItem } from '../shared/items';
import { TILES, WALLS } from '../shared/tiles';
import { HAZARD_INFO } from '../shared/types';
import type { World } from '../shared/world';
import { DEAD_ZONE, ZONES, zoneIndexAt, type ZoneDef } from '../shared/zones';
import { Camera } from '../game/camera';
import type { Game } from '../game/game';
import { MODULES, RIG_CLEARANCE } from '../game/rigDefs';
import { buildHover } from '../game/systems/build';
import { Backdrop, daylight } from './background';
import { ChunkCache } from './chunks';
import { Lighting, type PointLight } from './lighting';
import { RigRenderer } from './rigArt';
import { drawCache, drawCheckpoint, drawCrate, drawDrop, drawEnemy, drawHuman, drawProjectile, lookForSuit } from './sprites';

export class Renderer {
  private chunkCaches = new WeakMap<World, ChunkCache>();
  private backdrop = new Backdrop();
  private lighting = new Lighting();
  private rigArt = new RigRenderer();
  private glowSprites = new Map<string, HTMLCanvasElement>();
  private vignette: HTMLCanvasElement | null = null;
  private titleCam = new Camera();
  private titleT = 0;
  private frameN = 0;

  constructor(private g: Game) {}

  private chunksFor(world: World, warzone: boolean): ChunkCache {
    let c = this.chunkCaches.get(world);
    if (!c) {
      c = new ChunkCache(world, warzone);
      this.chunkCaches.set(world, c);
    }
    return c;
  }

  private glowSprite(color: string): HTMLCanvasElement {
    let c = this.glowSprites.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d')!;
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 64);
      this.glowSprites.set(color, c);
    }
    return c;
  }

  private glow = (x: number, y: number, r: number, color: string, a: number): void => {
    const ctx = this.g.ctx;
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.drawImage(this.glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  };

  private zoneBlend(cam: Camera): { a: ZoneDef; b: ZoneDef | null; t: number } {
    if (this.g.sim.kind === 'warzone') return { a: DEAD_ZONE, b: null, t: 0 };
    const tx = cam.x / TILE;
    const zi = zoneIndexAt(Math.floor(tx));
    const lx = tx - zi * ZONE_W;
    const B = 60;
    if (lx < B && zi > 0) return { a: ZONES[zi], b: ZONES[zi - 1], t: 0.5 - lx / (2 * B) };
    if (lx > ZONE_W - B && zi < ZONES.length - 1) return { a: ZONES[zi], b: ZONES[zi + 1], t: 0.5 - (ZONE_W - lx) / (2 * B) };
    return { a: ZONES[zi], b: null, t: 0 };
  }

  render(): void {
    const g = this.g;
    const ctx = g.ctx;
    const cam = g.camera;
    const s = g.sim;
    const world = s.world;
    const t = s.time;
    this.frameN++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const dayTime = s.kind === 'warzone' ? 0.8 : g.dayTime;
    const zb = this.zoneBlend(cam);
    const horizonCol = Math.max(0, Math.min(world.w - 1, Math.floor(cam.x / TILE)));
    this.backdrop.draw(ctx, cam, zb.a, zb.b, zb.t, dayTime, t, world.surface[horizonCol] * TILE);

    cam.apply(ctx);
    ctx.imageSmoothingEnabled = false;
    const L = cam.left, T = cam.top, Rr = cam.right, B = cam.bottom;
    this.chunksFor(world, s.kind === 'warzone').draw(ctx, L, T, Rr, B);

    if (s.kind === 'world') {
      const ck = g.gen.checkpoint;
      if (Math.abs(ck.x * TILE - cam.x) < 2000) drawCheckpoint(ctx, ck.x * TILE, ck.ground * TILE, t);
    }
    // Extraction zones
    for (const e of s.extracts) {
      const pulse = 0.4 + 0.3 * Math.sin(t * 3);
      ctx.fillStyle = `rgba(105,240,174,${pulse * 0.25})`;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.strokeStyle = `rgba(105,240,174,${pulse + 0.2})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(e.x, e.y, e.w, e.h);
      ctx.font = 'bold 11px "Share Tech Mono", monospace';
      ctx.fillStyle = '#69f0ae';
      ctx.textAlign = 'center';
      ctx.fillText(`EXTRACT // ${e.name}`, e.x + e.w / 2, e.y - 6);
      ctx.textAlign = 'left';
    }

    // Rigs: outposts first, the player's rig last (in front).
    const rigs = [...s.rigs].sort((a, b) => Number(!a.anchored) - Number(!b.anchored) || Number(a === g.playerRig) - Number(b === g.playerRig));
    for (const r of rigs) {
      if (r.x > Rr + 200 || r.x + r.widthPx < L - 200 || r.y > B + 200 || r.y + r.heightPx + RIG_CLEARANCE + 60 < T - 200) continue;
      this.rigArt.drawUnder(ctx, r, world, t);
      this.rigArt.drawBody(ctx, r);
      this.rigArt.drawDynamic(ctx, r, t, g);
    }

    for (const c of s.caches) if (c.x > L - 40 && c.x < Rr + 40 && c.y > T - 40 && c.y < B + 40) drawCache(ctx, c.x, c.y, c.opened, t);
    for (const c of s.crates.values()) drawCrate(ctx, c.x, c.y, c.kind, t);
    for (const d of s.drops) drawDrop(ctx, d.x, d.y, d.stack.id, t);
    for (const e of s.enemies) if (e.x > L - 60 && e.x < Rr + 60) drawEnemy(ctx, e, t);

    // Remote players
    ctx.font = '9px "Share Tech Mono", monospace';
    for (const r of s.remotes.values()) {
      const look = lookForSuit(r.suit, null, r.bot ? '#ff1744' : '#ffd740');
      if (r.bot) look.body = '#5a4040';
      drawHuman(ctx, r.x + r.w / 2, r.y + r.h, r.facing, r.aim, r.anim, look, r.weapon || null, {
        moving: Math.abs(r.vx) > 10, air: Math.abs(r.vy) > 30, climbing: false, hurt: r.hurtFlash > 0, jet: false,
      });
      ctx.textAlign = 'center';
      ctx.fillStyle = r.bot ? '#ff8a80' : '#ffd740';
      ctx.fillText(r.name, r.x + r.w / 2, r.y - 12);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(r.x - 4, r.y - 9, r.w + 8, 3);
      ctx.fillStyle = '#ff5252';
      ctx.fillRect(r.x - 4, r.y - 9, ((r.w + 8) * Math.max(0, r.hp)) / r.maxHp, 3);
      ctx.textAlign = 'left';
    }

    const p = g.player;
    if (!p.dead && !p.driving) {
      const held = p.held();
      const hdef = held ? getItem(held.id) : null;
      const showWeapon = hdef && (hdef.kind === 'weapon' || hdef.kind === 'tool' || hdef.kind === 'throwable') ? held!.id : null;
      if (p.invuln <= 0 || Math.floor(p.invuln * 10) % 2 === 0) {
        drawHuman(ctx, p.cx, p.y + p.h, p.facing, p.aim, p.anim, lookForSuit(p.suit, p.gadget), showWeapon, {
          moving: Math.abs(p.vx) > 10, air: !p.grounded, climbing: p.climbing, hurt: p.hurtFlash > 0.1, jet: p.jetting,
        });
      }
    }

    for (const pr of s.projectiles) drawProjectile(ctx, pr);
    s.particles.draw(ctx, false, { left: L, top: T, right: Rr, bottom: B });

    // Lighting
    const sky = s.kind === 'warzone' ? 0.6 : 0.42 + 0.58 * daylight(dayTime);
    const lights: PointLight[] = [];
    if (!p.dead) lights.push({ x: p.cx, y: p.cy, v: 0.72 });
    for (const r of s.rigs) if (r.x < Rr + 200 && r.x + r.widthPx > L - 200) this.rigArt.lights(r, lights);
    for (const pr of s.projectiles) lights.push({ x: pr.x, y: pr.y, v: pr.explosive ? 0.8 : 0.5 });
    for (const pa of s.particles.list) if (pa.glow && pa.size > 3) lights.push({ x: pa.x, y: pa.y, v: 0.6 });
    for (const e of s.extracts) lights.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, v: 0.8 });
    this.lighting.compute(world, L, T, Rr, B, sky, lights, false);
    this.lighting.draw(ctx);

    // Additive glow pass
    ctx.globalCompositeOperation = 'lighter';
    s.particles.draw(ctx, true, { left: L, top: T, right: Rr, bottom: B });
    for (const pr of s.projectiles) this.glow(pr.x, pr.y, pr.kind === 'rail' ? 22 : pr.explosive ? 18 : 10, pr.color, 0.6);
    for (const r of rigs) if (r.x < Rr + 200 && r.x + r.widthPx > L - 200) this.rigArt.drawGlow(ctx, r, t, this.glow);
    this.emissiveGlow(world, L, T, Rr, B, t);
    if (!p.dead && !p.driving) {
      this.glow(p.cx + p.facing * 2, p.y + 5, 8, '#6af0ff', 0.5);
      if (p.mining || p.repairing) {
        const m = g.mouseWorld;
        const hx = p.cx + Math.cos(p.aim) * 16, hy = p.y + 10 + Math.sin(p.aim) * 16;
        ctx.strokeStyle = p.repairing ? '#69f0ae' : '#ffab40';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        const mx = (hx + m.x) / 2 + (Math.random() - 0.5) * 6, my = (hy + m.y) / 2 + (Math.random() - 0.5) * 6;
        ctx.quadraticCurveTo(mx, my, m.x, m.y);
        ctx.stroke();
        this.glow(m.x, m.y, 14, p.repairing ? '#69f0ae' : '#ffab40', 0.8);
      }
    }
    for (const r of s.remotes.values()) this.glow(r.x + r.w / 2, r.y + 5, 8, r.bot ? '#ff1744' : '#ffd740', 0.5);
    for (const c of s.crates.values()) this.glow(c.x, c.y - 20, 24, c.kind === 'supply' ? '#ff1744' : '#ffd740', 0.4);
    ctx.globalCompositeOperation = 'source-over';

    this.overlays(ctx, t);
    this.screenEffects(ctx, cam, t);
    g.minimap?.flush();
    if (s.kind === 'world') this.ambient(zb.a, t);
  }

  private emissiveGlow(world: World, L: number, T: number, R: number, B: number, t: number): void {
    const x0 = Math.max(0, Math.floor(L / TILE)), x1 = Math.min(world.w - 1, Math.floor(R / TILE));
    const y0 = Math.max(0, Math.floor(T / TILE)), y1 = Math.min(world.h - 1, Math.floor(B / TILE));
    let n = 0;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * world.w + tx;
        const tile = world.tiles[i];
        const d = TILES[tile];
        if (d.light > 0.3) {
          if (d.liquid && world.tiles[i - world.w] === tile) continue;
          const lc = d.lightColor;
          this.glow((tx + 0.5) * TILE, (ty + 0.5) * TILE, d.liquid ? 28 : 22, `rgb(${lc[0]},${lc[1]},${lc[2]})`, d.liquid ? 0.18 + 0.06 * Math.sin(t * 2 + tx) : 0.3);
          if (++n > 400) return;
        } else if (tile === 0) {
          const w = world.walls[i];
          if (w && WALLS[w].light > 0.5 && (tx + ty) % 2 === 0) {
            const lc = WALLS[w].lightColor;
            this.glow((tx + 0.5) * TILE, (ty + 0.5) * TILE, 20, `rgb(${lc[0]},${lc[1]},${lc[2]})`, 0.18 * (Math.sin(t * 9 + tx * 0.3) > -0.95 ? 1 : 0.2));
            if (++n > 400) return;
          }
        }
      }
    }
  }

  private overlays(ctx: CanvasRenderingContext2D, t: number): void {
    const g = this.g;
    const r = g.playerRig;
    if (g.panel === 'build' && r) {
      ctx.strokeStyle = 'rgba(128,222,234,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= r.cols; x++) {
        ctx.moveTo(r.x + x * TILE + 0.5, r.y);
        ctx.lineTo(r.x + x * TILE + 0.5, r.y + r.heightPx);
      }
      for (let y = 0; y <= r.rows; y++) {
        ctx.moveTo(r.x, r.y + y * TILE + 0.5);
        ctx.lineTo(r.x + r.widthPx, r.y + y * TILE + 0.5);
      }
      ctx.stroke();
      const h = buildHover.cur;
      if (h) {
        const x = r.x + h.tx * TILE, y = r.y + h.ty * TILE;
        const color = g.build.kind === 'erase' ? '#ff5252' : h.ok ? '#69f0ae' : '#ff5252';
        ctx.fillStyle = color + '33';
        ctx.fillRect(x, y, h.w * TILE, h.h * TILE);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.5, y + 0.5, h.w * TILE - 1, h.h * TILE - 1);
        if (g.build.kind === 'module') {
          const def = MODULES[g.build.id];
          ctx.font = 'bold 8px monospace';
          ctx.fillStyle = def.accent;
          ctx.fillText(def.name.toUpperCase(), x + 2, y - 3);
        }
      }
    }
    const p = g.player;
    if (p.mining && !p.mining.rig) {
      const x = p.mining.tx * TILE, y = p.mining.ty * TILE;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y + TILE + 2, TILE, 3);
      ctx.fillStyle = '#ffab40';
      ctx.fillRect(x, y + TILE + 2, TILE * Math.min(1, p.mining.progress), 3);
    }
    // Hover tooltip for rig modules
    if (!p.driving && g.panel !== 'build') {
      const m = g.mouseWorld;
      const rig = g.rigAt(m.x, m.y);
      if (rig) {
        const { tx, ty } = rig.toTile(m.x, m.y);
        const mod = rig.moduleAt(tx, ty);
        if (mod) {
          const label = `${mod.def.name}  ${Math.ceil(mod.hp)}/${mod.maxHp}${mod.def.turret ? (mod.crewed ? '  [crewed]' : '  [no crew]') : ''}`;
          ctx.font = '9px "Share Tech Mono", monospace';
          const w = ctx.measureText(label).width + 8;
          ctx.fillStyle = 'rgba(8,10,14,0.85)';
          ctx.fillRect(m.x + 10, m.y - 18, w, 14);
          ctx.fillStyle = rig.team === 'player' ? mod.def.accent : '#ff8a80';
          ctx.fillText(label, m.x + 14, m.y - 8);
        }
      }
    }
    void t;
  }

  private screenEffects(ctx: CanvasRenderingContext2D, cam: Camera, t: number): void {
    const g = this.g;
    const W = cam.viewW, H = cam.viewH;
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    const w = g.weather;
    if (w.strength > 0.01 && g.sim.kind === 'world') {
      const tint: Record<string, string> = { dunes: '214,170,100', glass: '150,255,90', cryo: '220,235,255', magma: '90,60,60', acid: '90,200,110', rustbelt: '170,120,90' };
      ctx.fillStyle = `rgba(${tint[g.zone.key] ?? '150,150,150'},${w.strength * 0.28})`;
      ctx.fillRect(0, 0, W, H);
      const streak = g.zone.key === 'dunes' || g.zone.key === 'rustbelt';
      const n = Math.floor(w.strength * 60);
      ctx.fillStyle = g.zone.key === 'cryo' ? 'rgba(255,255,255,0.8)' : g.zone.key === 'magma' ? 'rgba(80,70,70,0.7)' : `rgba(${tint[g.zone.key]},0.5)`;
      for (let i = 0; i < n; i++) {
        const seed = i * 97.13;
        const x = ((seed * 13 + t * (streak ? 900 : 60)) % (W + 100)) - 50;
        const y = (seed * 7.7 + t * (streak ? 30 : 140) + Math.sin(t + i) * 20) % H;
        ctx.fillRect(x, y, streak ? 26 : 3, streak ? 1 : 3);
      }
    }
    const p = g.player;
    if (p.exposure) {
      const c = HAZARD_INFO[p.exposure].color;
      const a = 0.25 + 0.15 * Math.sin(t * 6);
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, c);
      ctx.globalAlpha = a;
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    const hurt = Math.max(p.hurtFlash > 0 ? p.hurtFlash * 2 : 0, p.hp < p.maxHp * 0.3 && !p.dead ? 0.25 + 0.1 * Math.sin(t * 5) : 0);
    if (hurt > 0) {
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(200,0,0,0.9)');
      ctx.globalAlpha = Math.min(0.7, hurt);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (!this.vignette || this.vignette.width !== Math.floor(W / 4)) {
      const v = document.createElement('canvas');
      v.width = Math.max(1, Math.floor(W / 4));
      v.height = Math.max(1, Math.floor(H / 4));
      const x = v.getContext('2d')!;
      const gr = x.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * 0.45, v.width / 2, v.height / 2, Math.max(v.width, v.height) * 0.75);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      x.fillStyle = gr;
      x.fillRect(0, 0, v.width, v.height);
      this.vignette = v;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.vignette, 0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
  }

  /** Drifting atmosphere particles appropriate to the zone. */
  private ambient(z: ZoneDef, t: number): void {
    const g = this.g;
    const s = g.sim;
    const cam = g.camera;
    const area = (cam.right - cam.left) * (cam.bottom - cam.top);
    const rate = (area / 400000) * (1 + g.weather.strength * 4);
    const n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const x = cam.left + Math.random() * (cam.right - cam.left);
      const y = cam.top + Math.random() * (cam.bottom - cam.top);
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (tx < 0 || tx >= s.world.w || ty >= s.world.skyTop[tx]) continue;
      switch (z.particles) {
        case 'dust':
          s.particles.add({ x, y, vx: 20 + Math.random() * 20, vy: (Math.random() - 0.5) * 10, life: 4, size: 1.5, color: 'rgba(210,170,130,0.5)', shrink: false });
          break;
        case 'sand':
          s.particles.add({ x, y, vx: 160 + Math.random() * 120, vy: 10, life: 2, size: 1.5, color: 'rgba(230,200,140,0.7)', shrink: false });
          break;
        case 'snow':
          s.particles.add({ x, y, vx: 15 + Math.sin(t) * 10, vy: 40 + Math.random() * 30, life: 5, size: 2, color: 'rgba(255,255,255,0.85)', shrink: false });
          break;
        case 'embers':
          s.particles.add({ x, y, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30, life: 3, size: 2, color: '#ff8a50', glow: true });
          break;
        case 'spores':
          s.particles.add({ x, y, vx: Math.sin(t + i) * 10, vy: -8, life: 5, size: 2, color: '#69f0ae', glow: true });
          break;
        case 'rad':
          s.particles.add({ x, y, vx: 0, vy: -5, life: 1.5, size: 1.5, color: '#c6ff00', glow: true });
          break;
      }
    }
  }

  renderTitle(dt: number): void {
    const g = this.g;
    const ctx = g.ctx;
    this.titleT += dt;
    const cam = this.titleCam;
    cam.resize(g.camera.viewW, g.camera.viewH, g.camera.dpr);
    cam.zoom = 1;
    cam.x = this.titleT * 50;
    cam.y = 150 * TILE - cam.viewH * 0.2;
    const period = 10;
    const k = this.titleT / period;
    const zi = Math.floor(k) % ZONES.length;
    const f = k % 1;
    const blend = f > 0.8 ? (f - 0.8) / 0.2 : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.backdrop.draw(ctx, cam, ZONES[zi], ZONES[(zi + 1) % ZONES.length], blend, 0.62 + Math.sin(this.titleT * 0.05) * 0.12, this.titleT, 150 * TILE);
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    const H = cam.viewH, W = cam.viewW;
    const gr = ctx.createLinearGradient(0, H * 0.55, 0, H);
    gr.addColorStop(0, 'rgba(5,6,10,0)');
    gr.addColorStop(1, 'rgba(5,6,10,0.95)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
  }
}
