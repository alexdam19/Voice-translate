import { NODE_INFO, RUNE_INFO, TIER_NAMES, threatTier } from '../shared/mapgen';
import { MODULES } from '../game/defs';
import type { Game } from '../game/game';
import { SQUADS, type SquadType } from '../game/squads';
import { jobFor } from '../game/systems/builds';
import type { TrackTarget } from '../game/systems/tracking';
import { SITE_RADIUS, SITE_TIME } from '../game/systems/world';
import type { Tank } from '../game/tank';
import { deckHeight } from './models';
import type { View } from './view';

/** What the base (village) view is showing. */
export interface VillageState {
  hover: [number, number] | null;
  selected: number;
  /** Deck being viewed (0 = roof). */
  deck: number;
  /** Building being placed or moved. */
  ghost: { key: string; cx: number; cy: number; ok: boolean } | null;
}

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

  private deckTank: Tank | null = null;
  private deckView = 0;

  /** Screen position of a point on the deck, in deck cells. */
  private deckPt(t: Tank, cx: number, cy: number): { x: number; y: number; ok: boolean } {
    const w = t.toWorld((t.rows / 2 - cy) * t.cell, (cx - t.cols / 2) * t.cell);
    return this.view.worldToScreen(w.x, w.y, deckHeight(t, t === this.deckTank ? this.deckView : 0) + 0.02);
  }

  private deckRect(t: Tank, cx: number, cy: number, w: number, h: number, stroke: string | null, fill: string | null, lw = 1): void {
    const c = this.ctx;
    const a = this.deckPt(t, cx, cy), b = this.deckPt(t, cx + w, cy), d = this.deckPt(t, cx + w, cy + h), e = this.deckPt(t, cx, cy + h);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.lineTo(d.x, d.y);
    c.lineTo(e.x, e.y);
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.lineWidth = lw;
      c.strokeStyle = stroke;
      c.stroke();
    }
  }

  /** The base view: deck grid, building levels, builders at work and the placement ghost. */
  drawVillage(g: Game, vs: VillageState): void {
    const c = this.ctx;
    const t = g.player;
    // Grid
    c.globalAlpha = 0.28;
    c.lineWidth = 1;
    c.strokeStyle = '#b3e5fc';
    c.beginPath();
    for (let x = 0; x <= t.cols; x++) {
      const a = this.deckPt(t, x, 0), b = this.deckPt(t, x, t.rows);
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
    }
    for (let y = 0; y <= t.rows; y++) {
      const a = this.deckPt(t, 0, y), b = this.deckPt(t, t.cols, y);
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
    }
    c.stroke();
    c.globalAlpha = 1;
    this.deckRect(t, 0, 0, t.cols, t.rows, '#4dd0e1', null, 2);
    const front = this.deckPt(t, t.cols / 2, -0.8);
    this.text('▲ FRONT', front.x, front.y, '#80deea', 9);
    // Buildings
    this.deckTank = t;
    this.deckView = vs.deck;
    for (const m of t.modules) {
      const d = MODULES[m.key];
      if (m.deck !== vs.deck) continue;
      const sel = m.id === vs.selected;
      const hov = vs.hover && vs.hover[0] >= m.cx && vs.hover[0] < m.cx + d.w && vs.hover[1] >= m.cy && vs.hover[1] < m.cy + d.h;
      if (sel || hov) this.deckRect(t, m.cx, m.cy, d.w, d.h, sel ? '#ffea00' : '#ffffff', sel ? 'rgba(255,234,0,0.12)' : 'rgba(255,255,255,0.06)', sel ? 3 : 1.5);
      const mid = this.deckPt(t, m.cx + d.w / 2, m.cy + d.h / 2);
      const job = jobFor(g, m.id);
      if (job) {
        const left = Math.max(0, job.total - job.t);
        this.bar(mid.x, mid.y - 16, Math.max(40, d.w * 16), job.t / job.total, job.kind === 'build' ? '#ffb300' : '#40c4ff', 0, 0, 6);
        this.text(`${job.kind === 'build' ? '🔨' : `⬆ L${job.to}`} ${left >= 60 ? `${Math.floor(left / 60)}m ${Math.ceil(left % 60)}s` : `${Math.ceil(left)}s`}`, mid.x, mid.y - 26, '#fff8e1', 9);
      }
      if (m.built && (d.w * d.h >= 4 || sel || hov)) {
        const corner = this.deckPt(t, m.cx + 0.35, m.cy + 0.35);
        this.text(String(m.lvl), corner.x, corner.y, '#ffe57f', 10);
      }
      if (sel || hov) this.text(d.name, mid.x, mid.y + 10, sel ? '#ffea00' : '#ffffff', 10);
    }
    // Hovered empty cell
    if (vs.hover && !vs.ghost && t.cellAt(vs.hover[0], vs.hover[1], vs.deck) === -1) this.deckRect(t, vs.hover[0], vs.hover[1], 1, 1, 'rgba(255,255,255,0.6)', null, 1);
    // Placement ghost
    if (vs.ghost) {
      const d = MODULES[vs.ghost.key];
      const col = vs.ghost.ok ? 'rgba(118,255,3,' : 'rgba(255,23,68,';
      this.deckRect(t, vs.ghost.cx, vs.ghost.cy, d.w, d.h, `${col}0.95)`, `${col}0.28)`, 2.5);
      const mid = this.deckPt(t, vs.ghost.cx + d.w / 2, vs.ghost.cy + d.h / 2);
      this.text(vs.ghost.ok ? `${d.name} · ${document.documentElement.classList.contains('touch') ? 'tap PLACE' : 'click to place'}` : "Doesn't fit here", mid.x, mid.y, vs.ghost.ok ? '#ccff90' : '#ff8a80', 10);
    }
  }

  /** Squad guard points and the tracked target (with an arrow at the screen edge when it is off screen). */
  drawMarkers(g: Game, target: TrackTarget | null, label: string): void {
    const v = this.view;
    const c = this.ctx;
    for (const [k, sq] of Object.entries(g.squads)) {
      if (!sq || sq.order !== 'guard') continue;
      const p = v.worldToScreen(sq.gx, sq.gy, 0.1);
      if (!p.ok) continue;
      const col = SQUADS[k as SquadType].color;
      c.strokeStyle = col;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x, p.y - 26);
      c.stroke();
      c.fillStyle = col;
      c.fillRect(p.x, p.y - 26, 12, 8);
      this.text(`${SQUADS[k as SquadType].name}`, p.x, p.y - 34, col, 8);
    }
    if (!target || target.kind === 'base') return;
    const p = v.worldToScreen(target.x, target.y, 2.5);
    const dist = Math.round(Math.hypot(target.x - g.player.x, target.y - g.player.y));
    const inside = p.ok && p.x > 40 && p.y > 60 && p.x < v.width - 40 && p.y < v.height - 200;
    const bob = Math.sin(performance.now() / 180) * 4;
    if (inside) {
      this.text('▼', p.x, p.y - 12 + bob, '#ffd740', 18);
      this.text(`${label} · ${dist}m`, p.x, p.y - 32 + bob, '#fff8e1', 10);
      return;
    }
    this.edgeArrow(target.x, target.y, '#ffd740', `${label} · ${dist}m`, bob);
  }

  /** Warning arrows toward an incoming horde (and red ticks at the screen edge while it's pouring in). */
  drawHorde(g: Game): void {
    const w = g.wave;
    if (g.mode !== 'world' || g.player.dead || (w.phase !== 'warning' && w.phase !== 'surge')) return;
    if (w.phase === 'surge' && w.spawned >= w.total) return;
    const p = g.player;
    const R = p.stats.length / 2 + 60;
    const x = p.x + Math.cos(w.dir) * R, y = p.y + Math.sin(w.dir) * R;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 110);
    const col = pulse > 0.5 ? '#ff1744' : '#ff8a80';
    this.edgeArrow(x, y, col, w.phase === 'warning' ? `HORDE in ${Math.ceil(w.t)}s` : 'HORDE', pulse * 6, 1.6);
    if (this.view.width > 900) for (const s of [-0.45, 0.45]) this.edgeArrow(p.x + Math.cos(w.dir + s) * R, p.y + Math.sin(w.dir + s) * R, col, '', pulse * 4, 1);
  }

  /** An arrow at the edge of the play area pointing toward a world point. */
  /** The campaign target: a cyan arrow at the screen edge pointing the way (targets can be kilometres off). */
  drawMission(g: Game, x: number, y: number, label: string): void {
    const p = g.player;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < 1) return;
    const q = this.view.worldToScreen(x, y, 0);
    const onScreen = q.ok && q.x > 40 && q.y > 40 && q.x < this.view.width - 40 && q.y < this.view.height - 40;
    if (onScreen && d < 200) {
      this.text(`▼ ${label}`, q.x, q.y - 30, '#18ffff', 11);
      return;
    }
    // Aim at a point on the way, so the direction is right however far away it is.
    const k = Math.min(1, (p.stats.length / 2 + 60) / d);
    this.edgeArrow(p.x + (x - p.x) * k, p.y + (y - p.y) * k, '#18ffff', `${label} · ${d > 1000 ? `${(d / 1000).toFixed(1)}km` : `${Math.round(d)}m`}`, Math.sin(performance.now() / 250) * 3, 1.1);
  }

  private edgeArrow(wx: number, wy: number, color: string, label: string, bob = 0, scale = 1): void {
    const v = this.view;
    const c = this.ctx;
    const cx = v.width / 2, cy = v.height / 2;
    const q = v.worldToScreen(wx, wy, 0);
    let dx = q.x - cx, dy = q.y - cy;
    if (!q.ok) {
      dx = -dx;
      dy = -dy;
    }
    const a = Math.atan2(dy, dx);
    // Keep the arrow inside the play area: clear of the top bar and the card hand at the bottom.
    const x0 = 60, x1 = v.width - 60, y0 = Math.min(110, v.height * 0.2), y1 = Math.max(y0 + 40, v.height - Math.min(240, v.height * 0.38));
    const ca = Math.cos(a), sa = Math.sin(a);
    const kx = ca > 0 ? (x1 - cx) / ca : ca < 0 ? (x0 - cx) / ca : Infinity;
    const ky = sa > 0 ? (y1 - cy) / sa : sa < 0 ? (y0 - cy) / sa : Infinity;
    const k = Math.max(0, Math.min(kx, ky));
    const ax = cx + ca * k, ay = cy + sa * k;
    c.save();
    c.translate(ax, ay);
    c.rotate(a);
    c.scale(scale, scale);
    c.fillStyle = color;
    c.strokeStyle = '#0b0b0e';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(18 + bob, 0);
    c.lineTo(-6 + bob, -12);
    c.lineTo(-2 + bob, 0);
    c.lineTo(-6 + bob, 12);
    c.closePath();
    c.stroke();
    c.fill();
    c.restore();
    if (label) this.text(label, ax - Math.cos(a) * 30, ay - Math.sin(a) * 22, '#fff8e1', 10);
  }

  /**
   * Where the Titan is going: the lane its hull will sweep over the next ~25 s at the current speed and turn rate,
   * so a slow, heavy machine is still easy to steer.
   */
  private drawDrivePath(g: Game): void {
    const t = g.player;
    const v = this.view;
    const c = this.ctx;
    const speed = Math.abs(t.speed) > 0.3 ? t.speed : t.throttle * 1.5;
    if (Math.abs(speed) < 0.3 && Math.abs(t.yawRate) < 0.005) return;
    const dir = speed >= 0 ? 1 : -1;
    const L = t.stats.length / 2, W = t.stats.width / 2;
    let x = t.x, y = t.y, a = t.rot;
    const edges: { x: number; y: number; ok: boolean }[][] = [[], []];
    let run = 0;
    for (let k = 0; k <= 50 && run < 260; k++) {
      // Start at the bow (or the stern in reverse) and walk the arc forward in half-second steps.
      const fx = x + Math.cos(a) * L * dir, fy = y + Math.sin(a) * L * dir;
      for (const [i, s] of [[0, -1], [1, 1]] as const) edges[i].push(v.worldToScreen(fx - Math.sin(a) * W * s, fy + Math.cos(a) * W * s, 0.2));
      const step = speed * 0.5;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      a += t.yawRate * 0.5;
      run += Math.abs(step);
    }
    c.save();
    c.lineWidth = 2;
    c.setLineDash([10, 8]);
    for (const line of edges) {
      c.beginPath();
      let started = false;
      for (const p of line) {
        if (!p.ok) continue;
        if (!started) c.moveTo(p.x, p.y);
        else c.lineTo(p.x, p.y);
        started = true;
      }
      c.strokeStyle = dir > 0 ? 'rgba(143, 166, 186, 0.75)' : 'rgba(255, 171, 0, 0.75)';
      c.stroke();
    }
    // Where it ends up: a bar across the lane.
    const a0 = edges[0][edges[0].length - 1], a1 = edges[1][edges[1].length - 1];
    if (a0?.ok && a1?.ok) {
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(a0.x, a0.y);
      c.lineTo(a1.x, a1.y);
      c.stroke();
    }
    c.restore();
  }

  draw(g: Game, hoverId: number): void {
    const c = this.ctx;
    const v = this.view;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.imageSmoothingEnabled = false;
    const scale = 34 / v.cam.zoom;
    const onScreen = (p: { x: number; y: number; ok: boolean }): boolean => p.ok && p.x > -60 && p.y > -60 && p.x < v.width + 60 && p.y < v.height + 60;
    if (g.mode === 'world' && g.player.fortress && !g.player.dead) this.drawDrivePath(g);
    // Enemies
    for (const e of g.enemies) {
      if (e.burrowed || (g.mode === 'world' && !g.isVisible(e.x, e.y))) continue;
      if (e.titan) continue;
      const full = e.hp >= e.maxHp;
      const picked = e.id === hoverId || e.id === g.player.focusId;
      // Horde fodder gets no bars (there are hundreds); its elites get a small one, no name.
      if (e.horde && !picked && !e.elite) continue;
      if (full && !e.elite && !picked && e.kind !== 'guardian') continue;
      const p = v.worldToScreen(e.x, e.y, (e.flying ? 1.6 : 0) + e.z + e.r * 3.1 + 0.2);
      if (!onScreen(p)) continue;
      const w = Math.max(e.horde ? 16 : 26, Math.min(70, e.r * 36 * scale));
      this.bar(p.x, p.y, w, e.hp / e.maxHp, e.elite ? '#ff40ff' : '#e53935', 0, 0, e.horde ? 3 : 4);
      if (e.kind === 'guardian' || e.id === hoverId || (e.elite && !e.horde)) this.text(`${e.elite ? 'Elite ' : ''}${e.name}`, p.x, p.y - 8, e.elite ? '#ff80ff' : '#ffcdd2', 9);
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
        if (!g.isExplored(s.x, s.y)) continue;
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
        if (!g.isExplored(r.x, r.y)) continue;
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
