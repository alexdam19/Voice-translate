import { NODE_INFO, RUNE_INFO, TIER_NAMES, threatTier } from '../shared/mapgen';
import type { Game } from '../game/game';
import { SITE_RADIUS, SITE_TIME } from '../game/systems/world';
import type { Tank } from '../game/tank';
import type { View } from './view';

/**
 * 2D overlay drawn over the 3D view: LoL-style health bars, damage numbers,
 * labels and channel progress rings.
 */
export class Overlay {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement, private view: View) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
  }

  private bar(x: number, y: number, w: number, frac: number, color: string, shield = 0, ticks = 0, h = 6): void {
    const c = this.ctx;
    x = Math.round(x - w / 2);
    y = Math.round(y);
    c.fillStyle = '#0b0b0e';
    c.fillRect(x - 1, y - 1, w + 2, h + 2);
    c.fillStyle = '#2a1414';
    c.fillRect(x, y, w, h);
    c.fillStyle = color;
    c.fillRect(x, y, Math.max(0, Math.round(w * Math.min(1, frac))), h);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(x, y, Math.max(0, Math.round(w * Math.min(1, frac))), 1);
    if (shield > 0) {
      const sw = Math.round(w * Math.min(1, shield));
      c.fillStyle = 'rgba(230,240,255,0.9)';
      c.fillRect(x, y + h - 2, sw, 2);
    }
    if (ticks > 1) {
      c.fillStyle = 'rgba(0,0,0,0.6)';
      for (let i = 1; i < ticks; i++) c.fillRect(x + Math.round((w * i) / ticks), y, 1, h * (i % 5 === 0 ? 1 : 0.6));
    }
  }

  private text(s: string, x: number, y: number, color: string, size = 10, align: CanvasTextAlign = 'center'): void {
    const c = this.ctx;
    c.font = `${size}px Silkscreen, "Pixelify Sans", monospace`;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.lineWidth = 3;
    c.strokeStyle = '#0b0b0e';
    c.strokeText(s, x, y);
    c.fillStyle = color;
    c.fillText(s, x, y);
  }

  private ring(x: number, y: number, r: number, frac: number, color: string): void {
    const c = this.ctx;
    c.lineWidth = 5;
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = color;
    c.beginPath();
    c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    c.stroke();
  }

  draw(g: Game, hoverId: number): void {
    const c = this.ctx;
    const v = this.view;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.imageSmoothingEnabled = false;
    const scale = 34 / v.cam.zoom;
    const onScreen = (p: { x: number; y: number; ok: boolean }): boolean => p.ok && p.x > -60 && p.y > -60 && p.x < v.width + 60 && p.y < v.height + 60;
    // Enemies
    for (const e of g.enemies) {
      if (e.burrowed || (g.mode === 'world' && !g.isVisible(e.x, e.y))) continue;
      if (e.titan) continue;
      const full = e.hp >= e.maxHp;
      if (full && !e.elite && e.id !== hoverId && e.kind !== 'guardian' && e.id !== g.player.focusId) continue;
      const p = v.worldToScreen(e.x, e.y, (e.flying ? 1.6 : 0) + e.r * 3.1 + 0.2);
      if (!onScreen(p)) continue;
      const w = Math.max(26, Math.min(70, e.r * 36 * scale));
      this.bar(p.x, p.y, w, e.hp / e.maxHp, e.elite ? '#ff40ff' : '#e53935', 0, 0, 4);
      if (e.kind === 'guardian' || e.id === hoverId || e.elite) this.text(`${e.elite ? 'Elite ' : ''}${e.name}`, p.x, p.y - 8, e.elite ? '#ff80ff' : '#ffcdd2', 9);
      if (e.id === g.player.focusId) this.text('▼', p.x, p.y - (e.id === hoverId ? 20 : 9), '#ff5252', 12);
    }
    // Tanks
    const tanks: Tank[] = [g.player, ...(g.outrider ? [g.outrider] : []), ...g.tanks];
    for (const t of tanks) {
      if (t.dead) continue;
      if (t.team === 'enemy' && g.mode === 'world' && !g.isVisible(t.x, t.y)) continue;
      const ext = Math.max(t.stats.length, t.stats.width) / 2;
      const p = v.worldToScreen(t.x, t.y - ext * 0.75, 2.2);
      if (!onScreen(p)) continue;
      const w = Math.max(50, Math.min(130, t.stats.length * 14 * scale));
      const col = t === g.player ? '#43d15a' : t.kind === 'outrider' ? '#26c6da' : '#e53935';
      const ticks = Math.min(40, Math.floor(t.stats.maxHp / 250));
      this.bar(p.x, p.y, w, t.hp / t.stats.maxHp, col, t.stats.shield > 0 ? t.shield / t.stats.maxHp : 0, ticks, t === g.player ? 8 : 6);
      const barrier = t.buff('barrier');
      if (barrier && barrier.v > 0) this.bar(p.x, p.y - 5, w * Math.min(1, barrier.v / t.stats.maxHp), 1, '#b3e5fc', 0, 0, 2);
      if (t.kind === 'remote') this.text(t.name, p.x, p.y - 9, '#e1bee7', 9);
      else if (t.team === 'enemy') this.text(`${t.kind === 'outpost' ? 'Outpost' : 'Raider Tank'} ${TIER_NAMES[threatTier(t.threat)]}`, p.x, p.y - 9, '#ffab91', 9);
      else if (t.kind === 'outrider') this.text('Outrider', p.x, p.y - 9, '#80deea', 9);
    }
    if (g.mode === 'world') {
      // Sites
      for (const s of g.gen.sites) {
        if (Math.abs(s.x - v.cam.x) > v.cam.zoom * 1.6 || Math.abs(s.y - v.cam.y) > v.cam.zoom * 1.3) continue;
        if (!g.explored[Math.floor(s.y) * g.map.size + Math.floor(s.x)]) continue;
        const p = v.worldToScreen(s.x, s.y, 3.2);
        if (!onScreen(p)) continue;
        const ready = s.readyAt <= g.time;
        this.text(s.name, p.x, p.y - 10, ready ? '#ffd740' : '#9e9e9e', 10);
        this.text(ready ? `LOOT AREA ${TIER_NAMES[threatTier(s.threat)]}` : `restocks in ${Math.ceil((s.readyAt - g.time) / 60)}m`, p.x, p.y + 3, ready ? '#fff8e1' : '#757575', 8);
        if (g.site.id === s.id) {
          const q = v.worldToScreen(s.x, s.y, 0);
          this.ring(q.x, q.y - 30, 18, g.site.t / SITE_TIME, '#76ff03');
          this.text('SCAVENGING', q.x, q.y - 58, '#b9f6ca', 9);
        }
        void SITE_RADIUS;
      }
      // Runes
      for (const r of g.gen.runes) {
        if (Math.abs(r.x - v.cam.x) > v.cam.zoom * 1.6 || Math.abs(r.y - v.cam.y) > v.cam.zoom * 1.3) continue;
        if (!g.explored[Math.floor(r.y) * g.map.size + Math.floor(r.x)]) continue;
        const p = v.worldToScreen(r.x, r.y, 3.4);
        if (!onScreen(p)) continue;
        const info = RUNE_INFO[r.rune];
        const ready = r.readyAt <= g.time;
        this.text(info.name, p.x, p.y - 10, ready ? info.color : '#757575', 10);
        const camp = g.runeCamps.get(r.id);
        const sub = !ready ? `returns in ${Math.ceil((r.readyAt - g.time) / 60)}m` : camp && camp.length ? `${camp.length} guardians` : 'Park beside it to claim';
        this.text(sub, p.x, p.y + 3, '#e0e0e0', 8);
        if (g.runeClaim.id === r.id) this.ring(p.x, p.y + 26, 16, g.runeClaim.t / 2, info.color);
      }
      // Harvest progress label
      if (g.harvestId) {
        const n = g.gen.nodes.find((k) => k.id === g.harvestId);
        if (n) {
          const p = v.worldToScreen(n.x, n.y, 1.6);
          this.bar(p.x, p.y, 40, n.amount / n.max, '#ffd740', 0, 0, 4);
          this.text(NODE_INFO[n.type].name, p.x, p.y - 8, '#fff8e1', 8);
        }
      }
    }
    for (const e of g.extracts) {
      const p = v.worldToScreen(e.x, e.y, 3);
      if (!onScreen(p)) continue;
      this.text('EXTRACTION', p.x, p.y - 10, '#b9f6ca', 11);
      if (g.extractProgress > 0 && Math.hypot(g.player.x - e.x, g.player.y - e.y) < e.r) this.ring(p.x, p.y + 20, 18, g.extractProgress / 6, '#76ff03');
    }
    // Floating text
    for (const f of g.floats) {
      const p = v.worldToScreen(f.x, f.y, f.z + 1);
      if (!onScreen(p)) continue;
      const a = f.t > 0.7 ? 1 - (f.t - 0.7) / 0.4 : 1;
      c.globalAlpha = Math.max(0, a);
      this.text(f.text, p.x, p.y, f.color, f.big ? 15 : 10);
      c.globalAlpha = 1;
    }
  }
}
