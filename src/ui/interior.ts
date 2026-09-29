import { moving, type Aboard, type Person } from '../game/aboard';
import { upgradeBlock } from '../game/actions';
import { DECK_OPEN_CC, MODULES, ROOF, TITAN_DECK_INFO, TITAN_LIFTS } from '../game/defs';
import type { Game } from '../game/game';
import { crewSummary } from '../game/systems/crewops';
import { compIndex } from '../game/systems/titan';
import { armRoofOrder, cancelOrder, createOrder, MAX_ORDERS, mountKinds, planFetches, refitOrder, stepLabel, upgradeOrder, type OrderStep } from '../game/systems/workorders';
import type { ModuleInst } from '../game/tank';
import { HAIRS_HD, hatKindFor, personHD, type Look, type PoseHD } from '../render/px/people';
import { discAt, drawCorridor, drawRoom, glowAt, IA, type Slots } from '../render/px/interiorArt';
import { SHIP_ART } from '../render/px/shipArt';
import type { Act } from '../game/aboard';
import { hash2 } from '../render/px/pixels';
import { esc, h } from './dom';
import { pxMini } from './pixfont';

/**
 * INSIDE THE TITAN: the whole ship cut open down its length, every deck at once, in the spirit of an ant farm.
 * Rooms sit along each deck in the order they're built bow to stern, drawn for what they are (bunks, the mess,
 * engine blocks that get bigger with every level, the reactor's glowing core, the bridge's screens...), the three
 * lifts run through every deck, and the crew live their lives in it: at their posts, asleep in their bunks, eating,
 * riding the lifts, running hoses to a fire, carrying crates for a work order.
 *
 * Click a room to see who's in it and to send a work crew to upgrade it; the side panel runs the work orders.
 * Wheel or +/- zooms, drag pans. G or Esc leaves.
 */

export interface InteriorActions {
  close(): void;
  toast(text: string, color?: string): void;
  sound(name: string): void;
}

interface Placed {
  m: ModuleInst;
  /** Cells from the bow where the room starts in the cutaway, and its length. */
  at: number;
  len: number;
}

const { CELL, DH, ROOF_H, SKY, KEEL } = IA;
/** Hat colours by what people are doing. */
const HAT_COL: Partial<Record<Act, string>> = { gun: '#5a646e', soldier: '#56663a', engine: '#f0b020', build: '#ff8a20', weld: '#ff8a20', drill: '#f0b020', mechanic: '#4a90d0', haul: '#f0b020', console: '#1c3048', hose: '#d02818', pump: '#d02818', fix: '#d02818' };

/** The high-res pose for what someone's doing where they are. */
function poseHD(pr: Person): PoseHD {
  switch (pr.act) {
    case 'gun': case 'soldier': return 'aim';
    case 'console': return 'type';
    case 'weld': case 'build': case 'fix': return 'weld';
    case 'engine': case 'medic': case 'cook': case 'mechanic': case 'drill': case 'work': return Math.floor(pr.t * 0.5 + pr.id) % 3 === 0 ? 'stand' : 'work';
    case 'hose': case 'pump': return 'hose';
    case 'carry': return 'carry';
    case 'haul': return Math.floor(pr.t * 0.3 + pr.id) % 2 ? 'carry' : 'stand';
    case 'eat': return 'sit';
    case 'sleep': return 'sleep';
    default: return 'stand';
  }
}
const CAT: Record<string, string> = {
  weapon: '#ef5350', defense: '#42a5f5', power: '#ffca28', crew: '#9ccc65', resource: '#8d6e63', army: '#ab47bc', command: '#26c6da', utility: '#78909c', special: '#ec407a',
};

export class Interior {
  readonly root: HTMLDivElement;
  isOpen = false;
  private cv: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  private dio = document.createElement('canvas');
  private dx = this.dio.getContext('2d')!;
  private panel: HTMLDivElement;
  private secDecks: HTMLDivElement;
  private secRoom: HTMLDivElement;
  private secOrders: HTMLDivElement;
  private secDraft: HTMLDivElement;
  private W = 0;
  private H = 0;
  private s = 2;
  private slots = new Map<number, Slots>();
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
  private selected = 0;
  private hover = 0;
  private placed = new Map<number, Placed>();
  private roomsByDeck: Placed[][] = [];
  private time = 0;
  private panelT = 0;
  private draft: OrderStep[] = [];
  private game: Game | null = null;
  private layoutFor = -1;

  constructor(parent: HTMLElement, private act: InteriorActions) {
    this.root = h('div', 'interior');
    this.cv = document.createElement('canvas');
    this.x = this.cv.getContext('2d')!;
    this.panel = h('div', 'int-panel');
    const head = h('div', 'int-head');
    head.innerHTML = '<div><b>INSIDE THE TITAN</b><small>wheel or ± to zoom, drag to pan, G to leave</small></div>';
    const close = h('button', 'int-x', '✕');
    close.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.act.close();
    });
    head.appendChild(close);
    const zoomRow = h('div', 'int-zoom');
    for (const [lab, dz] of [['−', -1], ['+', 1]] as const) {
      const b = h('button', '', lab);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.setZoom(this.zoom + dz);
      });
      zoomRow.appendChild(b);
    }
    head.appendChild(zoomRow);
    this.secDecks = h('div', 'int-sec int-decks');
    this.secRoom = h('div', 'int-sec int-room');
    this.secOrders = h('div', 'int-sec int-orders');
    this.secDraft = h('div', 'int-sec int-draft');
    // The ship from the design sheet, side on, over the deck list.
    const banner = h('img', 'int-banner') as HTMLImageElement;
    banner.src = SHIP_ART.side;
    banner.alt = 'Your Titan, side on';
    this.panel.append(head, banner, this.secDecks, this.secRoom, this.secOrders, this.secDraft);
    this.root.append(this.cv, this.panel);
    parent.appendChild(this.root);
    this.cv.addEventListener('pointerdown', (e) => this.down(e));
    this.cv.addEventListener('pointermove', (e) => this.move(e));
    this.cv.addEventListener('pointerup', (e) => this.up(e));
    this.cv.addEventListener('pointercancel', () => (this.drag = null));
    this.cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setZoom(this.zoom + (e.deltaY < 0 ? 1 : -1));
    }, { passive: false });
    this.panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    window.addEventListener('resize', () => this.isOpen && this.resize());
  }

  open(g: Game): void {
    this.game = g;
    this.isOpen = true;
    this.root.style.display = 'block';
    this.layoutFor = -1;
    this.resize();
    this.renderDraft();
  }

  close(): void {
    this.isOpen = false;
    this.root.style.display = 'none';
    this.drag = null;
  }

  private setZoom(z: number): void {
    this.zoom = Math.max(1, Math.min(4, z));
    this.clampPan();
    this.act.sound('ui');
  }

  private resize(): void {
    const w = window.innerWidth, hh = window.innerHeight;
    // Native resolution: the art is high-res and the zoom scales it by whole numbers.
    this.s = w * hh > 5000000 ? 2 : 1;
    this.W = Math.ceil(w / this.s);
    this.H = Math.ceil(hh / this.s);
    this.cv.width = this.W;
    this.cv.height = this.H;
    this.cv.style.width = `${this.W * this.s}px`;
    this.cv.style.height = `${this.H * this.s}px`;
    this.layoutFor = -1;
  }

  /** Room for the ship: the canvas minus the side panel (bottom on narrow screens). */
  private area(): { x: number; y: number; w: number; h: number } {
    const narrow = window.innerWidth < 800;
    const pw = narrow ? 0 : Math.ceil(this.panel.offsetWidth / this.s);
    const ph = narrow ? Math.ceil(this.panel.offsetHeight / this.s) : 0;
    return { x: 0, y: 0, w: this.W - pw, h: this.H - ph };
  }

  private clampPan(): void {
    const a = this.area();
    const w = this.dio.width * this.zoom, hh = this.dio.height * this.zoom;
    this.panX = w <= a.w ? 0 : Math.max(-(w - a.w) / 2, Math.min((w - a.w) / 2, this.panX));
    this.panY = hh <= a.h ? 0 : Math.max(-(hh - a.h) / 2, Math.min((hh - a.h) / 2, this.panY));
  }

  /* ---------------------------------------------------------------- */
  /* Layout                                                            */
  /* ---------------------------------------------------------------- */

  /** Lays the rooms out along each deck, bow to stern, keeping the lift shafts clear. */
  private layout(g: Game): void {
    const p = g.player;
    this.dio.width = (p.rows + 12) * CELL;
    this.dio.height = SKY + ROOF_H + 7 * DH + KEEL;
    this.placed.clear();
    this.roomsByDeck = [];
    // The decks run bow to stern in four stretches between the lift shafts. Rooms sit in the stretch they're
    // built in, in order, and widen to fill it (a Fallout-Shelter row of rooms rather than a scale plan).
    const shafts = TITAN_LIFTS.map((l) => [l.cy, l.cy + 2]).sort((u, v) => u[0] - v[0]);
    const stretches: [number, number][] = [];
    let from = 0;
    for (const [s0, s1] of shafts) {
      stretches.push([from, s0]);
      from = s1;
    }
    stretches.push([from, p.rows]);
    for (let deck = 0; deck <= 7; deck++) {
      const mods = p.modules.filter((m) => m.deck === deck).sort((u, v) => u.cy - v.cy || u.cx - v.cx);
      const list: Placed[] = [];
      if (deck === ROOF) {
        for (const m of mods) list.push({ m, at: m.cy, len: MODULES[m.key].h });
      } else {
        for (const [a, b] of stretches) {
          const here = mods.filter((m) => {
            const mid = m.cy + MODULES[m.key].h / 2;
            return mid >= a && (mid < b || (b === p.rows && mid <= b));
          });
          if (!here.length) continue;
          const total = here.reduce((sum, m) => sum + MODULES[m.key].h, 0);
          const k = Math.min(4, (b - a) / total);
          let at = a + ((b - a) - total * k) / 2;
          for (const m of here) {
            const len = MODULES[m.key].h * k;
            list.push({ m, at, len });
            at += len;
          }
        }
      }
      for (const pl of list) this.placed.set(pl.m.id, pl);
      this.roomsByDeck[deck] = list;
    }
    this.layoutFor = p.version;
    this.clampPan();
  }

  /** Stretches of a deck between the lifts with no rooms in them (cells from the bow). */
  private emptyStretches(deck: number, rows: number): [number, number][] {
    const shafts = TITAN_LIFTS.map((l) => [l.cy, l.cy + 2]).sort((u, v) => u[0] - v[0]);
    const out: [number, number][] = [];
    let from = 0;
    for (const [s0, s1] of [...shafts, [rows, rows]]) {
      if (!(this.roomsByDeck[deck] ?? []).some((pl) => pl.at < s0 && pl.at + pl.len > from)) out.push([from, s0]);
      from = s1;
    }
    return out;
  }

  /** Cutaway x of a point `cy` cells from the bow (the bow is on the right). */
  private X(cy: number, rows: number): number {
    return (rows + 6 - cy) * CELL;
  }

  private deckTop(deck: number): number {
    return deck === ROOF ? SKY : SKY + ROOF_H + (deck - 1) * DH;
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  private toDio(e: PointerEvent): [number, number] {
    const r = this.cv.getBoundingClientRect();
    const cx = ((e.clientX - r.left) / r.width) * this.W, cy = ((e.clientY - r.top) / r.height) * this.H;
    const a = this.area();
    const ox = a.x + a.w / 2 - (this.dio.width * this.zoom) / 2 + this.panX, oy = a.y + a.h / 2 - (this.dio.height * this.zoom) / 2 + this.panY;
    return [(cx - ox) / this.zoom, (cy - oy) / this.zoom];
  }

  private roomAt(dx: number, dy: number): number {
    const g = this.game;
    if (!g) return 0;
    const rows = g.player.rows;
    for (let deck = 0; deck <= 7; deck++) {
      const top = this.deckTop(deck), bh = deck === ROOF ? ROOF_H : DH;
      if (dy < top || dy >= top + bh) continue;
      for (const pl of this.roomsByDeck[deck] ?? []) {
        const x0 = this.X(pl.at + pl.len, rows), x1 = this.X(pl.at, rows);
        if (dx >= x0 && dx < x1) return pl.m.id;
      }
    }
    return 0;
  }

  private down(e: PointerEvent): void {
    this.cv.setPointerCapture(e.pointerId);
    this.drag = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY, moved: false };
  }

  private move(e: PointerEvent): void {
    if (this.drag) {
      const dx = (e.clientX - this.drag.x) / this.s, dy = (e.clientY - this.drag.y) / this.s;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      if (this.drag.moved) {
        this.panX = this.drag.px + dx;
        this.panY = this.drag.py + dy;
        this.clampPan();
      }
      return;
    }
    const [x, y] = this.toDio(e);
    this.hover = this.roomAt(x, y);
    this.cv.style.cursor = this.hover ? 'pointer' : this.zoom > 1 ? 'grab' : 'default';
  }

  private up(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved) return;
    const [x, y] = this.toDio(e);
    this.selected = this.roomAt(x, y);
    this.panelT = 0;
    if (this.selected) this.act.sound('ui');
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  render(g: Game, ab: Aboard, dt: number): void {
    if (!this.isOpen) return;
    this.game = g;
    this.time += dt;
    if (this.layoutFor !== g.player.version || !this.dio.width) this.layout(g);
    this.paint(g, ab);
    const c = this.x;
    c.imageSmoothingEnabled = false;
    // Backdrop: blueprint blue with its grid, like the design sheets.
    c.fillStyle = '#0c3a52';
    c.fillRect(0, 0, this.W, this.H);
    c.fillStyle = '#12485f';
    for (let gx = 0; gx < this.W; gx += 24) c.fillRect(gx, 0, 1, this.H);
    for (let gy = 0; gy < this.H; gy += 24) c.fillRect(0, gy, this.W, 1);
    c.fillStyle = '#1a5a74';
    for (let gx = 0; gx < this.W; gx += 120) c.fillRect(gx, 0, 1, this.H);
    for (let gy = 0; gy < this.H; gy += 120) c.fillRect(0, gy, this.W, 1);
    const a = this.area();
    const ox = Math.round(a.x + a.w / 2 - (this.dio.width * this.zoom) / 2 + this.panX), oy = Math.round(a.y + a.h / 2 - (this.dio.height * this.zoom) / 2 + this.panY);
    c.drawImage(this.dio, ox, oy, this.dio.width * this.zoom, this.dio.height * this.zoom);
    this.panelT -= dt;
    if (this.panelT <= 0) {
      this.panelT = 0.4;
      this.renderPanel(g, ab);
    }
  }

  /** Paints the whole cutaway at 1:1 (art pixels) into the diorama canvas. */
  private paint(g: Game, ab: Aboard): void {
    const c = this.dx;
    const p = g.player;
    const rows = p.rows;
    const W = this.dio.width, H = this.dio.height;
    const X = (cy: number): number => this.X(cy, rows);
    const t = this.time;
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;
    const hullL = X(rows + 0.5), hullR = X(-0.3);
    const roofY = SKY + ROOF_H;
    const bottom = roofY + 7 * DH;
    this.slots.clear();

    /* ---- Decks: the Spine, then the rooms ---- */
    for (let deck = 1; deck <= 7; deck++) {
      const y0 = this.deckTop(deck);
      const info = TITAN_DECK_INFO[deck];
      const open = p.deckOpen(deck);
      drawCorridor(c, hullL, y0, hullR - hullL, DH, info.color, t, open);
      // Empty stretches of an open deck are bays waiting for a room.
      if (open) for (const [a, b] of this.emptyStretches(deck, rows)) {
        const xa = Math.round(X(b)) + 3, xb = Math.round(X(a)) - 3;
        if (xb - xa < 30) continue;
        c.strokeStyle = 'rgba(120,170,210,0.35)';
        c.setLineDash([3, 3]);
        c.strokeRect(xa + 0.5, y0 + 8.5, xb - xa - 1, DH - 14);
        c.setLineDash([]);
        pxMini(c, 'EMPTY BAY', (xa + xb) / 2, y0 + DH / 2 - 2, 'rgba(150,190,220,0.6)', 'center', null);
      }
      if (open) for (const pl of this.roomsByDeck[deck] ?? []) {
        const xa = Math.round(X(pl.at + pl.len)) + 1, xb = Math.round(X(pl.at)) - 1;
        if (xb - xa < 6) continue;
        const d = MODULES[pl.m.key];
        const job = g.builds.find((b) => b.modId === pl.m.id);
        const sl = drawRoom({ c, m: pl.m, x0: xa, y0, w: xb - xa, h: DH, t, speed: p.speed, job: job ? { f: job.t / job.total, order: !!job.order } : null, accent: CAT[d.cat] ?? '#78909c' });
        this.slots.set(pl.m.id, sl);
        // Door frames either side.
        c.fillStyle = '#0b0d11';
        c.fillRect(xa - 1, y0, 1, DH);
        c.fillRect(xb, y0, 1, DH);
        c.fillStyle = '#3a4250';
        c.fillRect(xa - 2, y0, 1, DH);
        c.fillRect(xb + 1, y0, 1, DH);
      }
      // The deck slab under it, with the deck's colour on the stern bulkhead.
      c.fillStyle = '#10141a';
      c.fillRect(hullL, y0 + DH - 1, hullR - hullL, 2);
      c.fillStyle = info.color;
      c.fillRect(hullL - 4, y0 + 3, 3, DH - 8);
      // Fire and flooding, by compartment (bow, midships, stern).
      for (let sec = 0; sec < 3; sec++) {
        const i = compIndex(deck, sec);
        const f = g.titan.fire[i] ?? 0, fl = g.titan.flood[i] ?? 0;
        const xa = X((sec + 1) * (rows / 3)), xb = X(sec * (rows / 3));
        if (fl > 0.02) {
          const wh = Math.round(fl * (DH - 4));
          c.fillStyle = 'rgba(40,120,200,0.5)';
          c.fillRect(Math.round(xa), y0 + DH - 3 - wh, Math.round(xb - xa), wh);
          c.fillStyle = 'rgba(170,225,255,0.75)';
          for (let x = xa; x < xb; x += 3) c.fillRect(Math.round(x), Math.round(y0 + DH - 3 - wh + Math.sin(t * 3 + x * 0.3)), 2, 1);
        }
        if (f > 0) {
          for (let k = 0; k < 10 + f * 22; k++) {
            const fx = xa + hash2(k, deck, sec) * (xb - xa);
            const fh = (4 + f * 20) * (0.55 + 0.45 * Math.sin(t * 12 + k * 1.7));
            c.fillStyle = k % 3 === 0 ? '#ffe082' : k % 3 === 1 ? '#ff9100' : '#ff3d00';
            c.fillRect(Math.round(fx), Math.round(y0 + DH - 3 - fh), 2, Math.round(fh));
          }
          glowAt(c, (xa + xb) / 2, y0 + DH - 10, (xb - xa) * 0.7, '#ff6d00', 0.35 + f * 0.3);
          c.fillStyle = 'rgba(20,20,22,0.5)';
          c.fillRect(Math.round(xa), y0, Math.round(xb - xa), 6);
        }
      }
    }
    // Lift shafts through every deck, with the cars riding.
    for (const l of TITAN_LIFTS) {
      const xa = Math.round(X(l.cy + 2)), xb = Math.round(X(l.cy));
      c.fillStyle = '#07090c';
      c.fillRect(xa, roofY - 2, xb - xa, bottom - roofY + 2);
      c.fillStyle = '#2a303a';
      c.fillRect(xa, roofY - 2, 2, bottom - roofY + 2);
      c.fillRect(xb - 2, roofY - 2, 2, bottom - roofY + 2);
      c.fillStyle = '#3a4250';
      c.fillRect(Math.round((xa + xb) / 2), roofY - 2, 1, bottom - roofY + 2);
      for (let deck = 1; deck <= 7; deck++) {
        c.fillStyle = '#e0b020';
        c.fillRect(xa + 2, this.deckTop(deck) + DH - 3, xb - xa - 4, 1);
      }
      const ph = (Math.sin(t * 0.35 + l.cy) + 1) / 2;
      const cy = Math.round(roofY + ph * (6 * DH));
      c.fillStyle = '#0b0d11';
      c.fillRect(xa + 2, cy + 1, xb - xa - 4, DH - 2);
      c.fillStyle = '#5a6270';
      c.fillRect(xa + 3, cy + 2, xb - xa - 6, DH - 4);
      c.fillStyle = '#2a3038';
      c.fillRect(xa + 5, cy + 6, xb - xa - 10, DH - 12);
      c.fillStyle = '#e0b020';
      c.fillRect(xa + 3, cy + 2, xb - xa - 6, 1);
      glowAt(c, (xa + xb) / 2, cy + 6, 12, '#ffe0a0', 0.3);
    }
    // Sealed decks say so.
    for (let deck = 1; deck <= 7; deck++) {
      if (p.deckOpen(deck)) continue;
      const y0 = this.deckTop(deck);
      const msg = `SEALED: OPENS WITH THE TITAN MK ${['I', 'II', 'III', 'IV', 'V', 'VI'][(DECK_OPEN_CC[deck] ?? 1) - 1]} REFIT`;
      const tw = msg.length * 4 + 8;
      c.fillStyle = '#0b0d11';
      c.fillRect(Math.round((hullL + hullR) / 2 - tw / 2), y0 + DH / 2 - 6, tw, 13);
      pxMini(c, msg, (hullL + hullR) / 2, y0 + DH / 2 - 2, '#8a8e96', 'center');
    }

    this.exterior(c, g, hullL, hullR, roofY, bottom);

    /* ---- The crew ---- */
    this.drawCrew(c, g, ab);

    // Room name plates, and the selection.
    for (let deck = 1; deck <= 7; deck++) {
      if (!p.deckOpen(deck)) continue;
      for (const pl of this.roomsByDeck[deck] ?? []) {
        const xa = Math.round(X(pl.at + pl.len)) + 1, xb = Math.round(X(pl.at)) - 1;
        const name = `${MODULES[pl.m.key].name.toUpperCase()} ${pl.m.lvl}`;
        const max = Math.floor((xb - xa - 6) / 4);
        if (max < 4) continue;
        const label = name.length > max ? name.slice(0, max) : name;
        c.fillStyle = 'rgba(8,10,14,0.75)';
        c.fillRect(xa + 2, this.deckTop(deck) + 7, label.length * 4 + 3, 8);
        pxMini(c, label, xa + 4, this.deckTop(deck) + 8, '#d8e4f0', 'left', null);
      }
    }
    for (const id of [this.hover, this.selected]) {
      const pl = id ? this.placed.get(id) : undefined;
      if (!pl) continue;
      const y0 = this.deckTop(pl.m.deck), bh = pl.m.deck === ROOF ? ROOF_H : DH;
      c.strokeStyle = id === this.selected ? '#ffd740' : 'rgba(255,255,255,0.7)';
      c.lineWidth = 1;
      c.strokeRect(Math.round(X(pl.at + pl.len)) + 0.5, y0 + 0.5, Math.round(X(pl.at) - X(pl.at + pl.len)) - 1, bh - 1);
    }
  }

  /** The Titan's hull around the cutaway, from the side: superstructure and guns on top, the prow, the stern, the treads. */
  private exterior(c: CanvasRenderingContext2D, g: Game, hullL: number, hullR: number, roofY: number, bottom: number): void {
    const p = g.player;
    const rows = p.rows;
    const X = (cy: number): number => this.X(cy, rows);
    const t = this.time;
    const pal = { d0: '#07090d', d1: '#11151c', d2: '#1a1f28', d3: '#252b36', d4: '#313946', d5: '#3e4757', d6: '#4f5a6d', d7: '#687790', hi: '#8fa3c2', glow: '#3ab4ff' };
    const R2 = (x: number, y: number, w: number, h: number, col: string): void => {
      c.fillStyle = col;
      c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    };
    const poly = (pts: [number, number][], col: string): void => {
      c.fillStyle = col;
      c.beginPath();
      pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b)));
      c.closePath();
      c.fill();
    };
    // Frame around the decks.
    R2(hullL - 6, roofY - 4, 6, bottom - roofY + 8, pal.d3);
    R2(hullR, roofY - 4, 3, bottom - roofY + 8, pal.d3);
    for (let y = roofY; y < bottom; y += 10) {
      R2(hullL - 5, y, 1, 1, pal.d7);
      R2(hullR + 1, y, 1, 1, pal.d7);
    }
    // The roof deck line with its blue strip.
    R2(hullL - 6, roofY - 6, hullR - hullL + 9, 6, pal.d4);
    R2(hullL - 6, roofY - 6, hullR - hullL + 9, 1, pal.hi);
    for (let x = hullL; x < hullR - 8; x += 14) R2(x, roofY - 3, 8, 1, Math.floor(t * 4 - x * 0.05) % 9 ? pal.glow : '#1a4a6a');

    /* ---- Superstructure: the citadel down the Spine, the command block ---- */
    const cy0 = roofY - 6;
    const cx0 = X(30), cx1 = X(7);
    poly([[cx0, cy0], [cx0 + 6, cy0 - 16], [cx1 - 12, cy0 - 16], [cx1, cy0]], pal.d5);
    R2(cx0 + 6, cy0 - 16, cx1 - cx0 - 18, 1, pal.d7);
    R2(cx0 + 8, cy0 - 11, cx1 - cx0 - 24, 3, '#123040');
    for (let x = cx0 + 10; x < cx1 - 16; x += 7) R2(x, cy0 - 10, 3, 1, (Math.floor(x) % 3) ? '#ffb13a' : '#7fe0ff');
    for (let x = cx0 + 12; x < cx1 - 14; x += 22) R2(x, cy0 - 6, 1, 6, pal.d2);
    // "07".
    pxMini(c, '07', cx0 + 30, cy0 - 7, '#d6dee8', 'left', null, 1);
    const tx0 = X(25), tx1 = X(21);
    poly([[tx0, cy0 - 16], [tx0 + 3, cy0 - 38], [tx1 - 8, cy0 - 38], [tx1, cy0 - 30], [tx1, cy0 - 16]], pal.d6);
    R2(tx0 + 3, cy0 - 38, tx1 - tx0 - 11, 1, pal.hi);
    R2(tx0 + 5, cy0 - 30, tx1 - tx0 - 8, 4, '#123040');
    for (let x = tx0 + 6; x < tx1 - 3; x += 4) R2(x, cy0 - 29, 2, 2, '#9ff0ff');
    glowAt(c, (tx0 + tx1) / 2, cy0 - 28, 20, '#60d0ff', 0.25);
    // Masts and the beacon.
    R2(tx0 + 8, cy0 - 52, 1, 14, '#8a95a6');
    R2(tx0 + 14, cy0 - 47, 1, 9, '#8a95a6');
    R2(tx0 + 5, cy0 - 44, 7, 1, '#8a95a6');
    if (Math.floor(t * 1.5) % 2 === 0) {
      R2(tx0 + 8, cy0 - 53, 1, 1, '#ff3a30');
      glowAt(c, tx0 + 8, cy0 - 53, 6, '#ff3a30', 0.8);
    }
    // Guns and nests on the roof, in profile.
    for (const pl of this.roomsByDeck[ROOF] ?? []) this.roofGun(c, g, pl, cy0);

    /* ---- The prow (right): stacked armour facets, headlights, the grille ---- */
    const pr = hullR + 3;
    const top = roofY - 6, bot = bottom + 18;
    const hgt = bot - top;
    poly([[pr, top], [pr + 26, top + hgt * 0.18], [pr + 44, top + hgt * 0.55], [pr + 40, top + hgt * 0.8], [pr + 22, bot], [pr, bot]], pal.d4);
    poly([[pr, top], [pr + 26, top + hgt * 0.18], [pr + 22, top + hgt * 0.4], [pr, top + hgt * 0.34]], pal.d6);
    poly([[pr + 26, top + hgt * 0.18], [pr + 44, top + hgt * 0.55], [pr + 30, top + hgt * 0.6], [pr + 22, top + hgt * 0.4]], pal.d5);
    poly([[pr, top + hgt * 0.34], [pr + 22, top + hgt * 0.4], [pr + 30, top + hgt * 0.6], [pr, top + hgt * 0.62]], pal.d5);
    poly([[pr + 30, top + hgt * 0.6], [pr + 44, top + hgt * 0.55], [pr + 40, top + hgt * 0.8], [pr + 28, top + hgt * 0.78]], pal.d3);
    for (const [a, b] of [[pr + 8, top + hgt * 0.22], [pr + 30, top + hgt * 0.3], [pr + 12, top + hgt * 0.48], [pr + 34, top + hgt * 0.5]]) R2(a, b, 6, 2, pal.glow);
    // Grille and headlights low on the nose.
    R2(pr + 6, top + hgt * 0.66, 18, 12, pal.d0);
    for (let x = pr + 7; x < pr + 23; x += 2) R2(x, top + hgt * 0.66 + 1, 1, 10, pal.d5);
    R2(pr + 6, top + hgt * 0.66 - 2, 18, 1, pal.glow);
    for (const hy of [top + hgt * 0.64, top + hgt * 0.72]) {
      R2(pr + 30, hy, 3, 2, '#fff6d8');
      glowAt(c, pr + 32, hy + 1, 10, '#fff3c4', 0.7);
    }
    /* ---- The stern (left): engine block with glowing exhausts, tail lights, the number ---- */
    const sx = hullL - 6;
    poly([[sx, top], [sx - 22, top + 6], [sx - 26, bot - 14], [sx - 14, bot], [sx, bot]], pal.d4);
    R2(sx - 20, top + 10, 18, 1, pal.d7);
    const hot = Math.abs(p.speed) > 1 || g.helm.overdrive;
    for (let k = 0; k < 4; k++) {
      const ey = top + 18 + k * ((bot - top - 34) / 3);
      discAt(c, sx - 16, ey, 5, pal.d0);
      discAt(c, sx - 16, ey, 3.5, g.helm.overdrive ? (Math.sin(t * 30 + k) > 0 ? '#ffd060' : '#ff7a00') : hot ? '#ff8a30' : '#3a2010');
      if (hot) glowAt(c, sx - 16, ey, g.helm.overdrive ? 20 : 12, '#ff9100', g.helm.overdrive ? 0.9 : 0.5);
    }
    R2(sx - 24, top + 4, 3, 5, '#ff3a30');
    R2(sx - 24, bot - 18, 3, 5, '#ff3a30');
    pxMini(c, '07', sx - 12, bot - 16, '#d6dee8', 'center', null, 1);

    /* ---- The treads: skirts with the light strip, road wheels, the belt running ---- */
    const ky = bottom + 1;
    R2(hullL - 6, ky, hullR - hullL + 9, 8, pal.d4);
    R2(hullL - 6, ky, hullR - hullL + 9, 1, pal.d7);
    for (let x = hullL; x < hullR; x += 18) R2(x + 2, ky + 4, 10, 1, pal.glow);
    const belt = ky + 9;
    const bh = KEEL - 14;
    R2(hullL - 10, belt, hullR - hullL + 22, bh, pal.d0);
    const run = t * p.speed * 3;
    for (let x = hullL - 10 + (((run % 5) + 5) % 5); x < hullR + 12; x += 5) {
      R2(x, belt, 3, 2, '#2c313a');
      R2(x, belt + bh - 2, 3, 2, '#2c313a');
    }
    const wheels = Math.floor((hullR - hullL + 10) / 16);
    for (let k = 0; k < wheels; k++) {
      const wx = hullL - 4 + k * 16 + 8, wy = belt + bh / 2;
      const crawler = Math.min(3, Math.floor(((wx - hullL) / (hullR - hullL)) * 4));
      const hp = g.titan.crawlers[3 - crawler] ?? 1;
      discAt(c, wx, wy, 7, '#0b0d11');
      discAt(c, wx, wy, 6, hp < 0.1 ? '#3a1a10' : pal.d5);
      discAt(c, wx, wy, 3, pal.d2);
      const an = run * 0.4 + k;
      for (let s2 = 0; s2 < 3; s2++) R2(wx + Math.cos(an + s2 * 2.1) * 4.5, wy + Math.sin(an + s2 * 2.1) * 4.5, 1, 1, pal.d7);
      if (hp < 0.35 && Math.sin(t * 5 + k) > 0.7) glowAt(c, wx, wy - 4, 8, '#ff6d00', 0.5);
    }
  }

  /** A roof gun or nest from the side. */
  private roofGun(c: CanvasRenderingContext2D, g: Game, pl: Placed, base: number): void {
    const p = g.player;
    const m = pl.m;
    const d = MODULES[m.key];
    const xa = this.X(pl.at + pl.len, p.rows), xb = this.X(pl.at, p.rows);
    const cx = (xa + xb) / 2;
    if (d.hardpoint || m.key === 'pad' || m.key === 'main_gun') {
      const big = m.key === 'main_gun' ? 1.7 : d.hardpoint === 'heavy' ? 1.35 : d.hardpoint === 'medium' ? 1.05 : 0.8;
      const tw = Math.round(14 * big), th = Math.round(7 * big);
      c.fillStyle = '#0b0d11';
      c.fillRect(Math.round(cx - tw / 2) - 1, base - th - 1, tw + 2, th + 1);
      c.fillStyle = '#3e4757';
      c.beginPath();
      c.moveTo(cx - tw / 2, base);
      c.lineTo(cx - tw / 2 + 2, base - th);
      c.lineTo(cx + tw / 2 - 3, base - th);
      c.lineTo(cx + tw / 2, base - th / 2);
      c.lineTo(cx + tw / 2, base);
      c.closePath();
      c.fill();
      c.fillStyle = '#687790';
      c.fillRect(Math.round(cx - tw / 2 + 2), base - th, tw - 5, 1);
      c.fillStyle = '#3ab4ff';
      c.fillRect(Math.round(cx - tw / 2 + 2), base - 3, tw - 4, 1);
      if (m.weapon) {
        const rel = Math.cos(m.aim - p.rot);
        const dir = rel >= 0 ? 1 : -1;
        const len = Math.round(18 * big);
        const rec = Math.round(Math.min(0.35, m.recoil ?? 0) * len);
        const by = base - th + 2;
        for (const off of big > 1.3 ? [0, 3] : [0]) {
          c.fillStyle = '#12151a';
          c.fillRect(Math.round(dir > 0 ? cx + tw / 2 - 2 - rec : cx - tw / 2 - len + 2 + rec), by + off, len, Math.max(1, Math.round(big * 1.4)));
          c.fillStyle = '#4f5a6d';
          c.fillRect(Math.round(dir > 0 ? cx + tw / 2 - 2 - rec : cx - tw / 2 - len + 2 + rec), by + off, len, 1);
        }
        if (m.key === 'main_gun') {
          c.fillStyle = 'rgba(255,40,40,0.6)';
          c.fillRect(Math.round(dir > 0 ? cx + tw / 2 + len - 2 : cx - tw / 2 - len - 60), by + 1, 60, 1);
        }
        if ((m.recoil ?? 0) > 0.2) glowAt(c, dir > 0 ? cx + tw / 2 + len : cx - tw / 2 - len, by + 1, 10, '#fff59d', 0.9);
      }
    } else if (d.nest) {
      c.fillStyle = '#5a5244';
      c.fillRect(Math.round(xa + 2), base - 5, Math.round(xb - xa - 4), 5);
      c.fillStyle = '#7a7058';
      for (let x = xa + 2; x < xb - 3; x += 4) c.fillRect(Math.round(x), base - 5, 3, 2);
    } else if (m.key === 'radar') {
      c.fillStyle = '#8a929c';
      c.fillRect(Math.round(cx), base - 14, 1, 14);
      const a = Math.sin(this.time * 2) * 6;
      c.fillRect(Math.round(cx - 6 + a / 2), base - 16, Math.round(12 - Math.abs(a)), 2);
    } else {
      c.fillStyle = '#313946';
      c.fillRect(Math.round(xa + 2), base - 7, Math.round(xb - xa - 4), 7);
      c.fillStyle = '#4f5a6d';
      c.fillRect(Math.round(xa + 2), base - 7, Math.round(xb - xa - 4), 1);
    }
  }

  /** Everyone aboard, where they are and doing what they do (beds, benches, machines, the Spine, the lifts). */
  private drawCrew(c: CanvasRenderingContext2D, g: Game, ab: Aboard): void {
    const p = g.player;
    const rows = p.rows;
    const byRoom = new Map<number, Person[]>();
    const loose: Person[] = [];
    for (const pr of ab.people) {
      if (pr.ride > 0) continue;
      const pl = !moving(pr) && pr.mod ? this.placed.get(pr.mod) : undefined;
      if (pl && pl.m.deck === pr.deck && (pr.deck === ROOF || p.deckOpen(pr.deck))) {
        let l = byRoom.get(pr.mod);
        if (!l) byRoom.set(pr.mod, (l = []));
        l.push(pr);
      } else loose.push(pr);
    }
    const draw = (pr: Person, x: number, floor: number, pose: PoseHD): void => {
      const lk: Look = {
        uniform: pr.color, hat: hatKindFor(pr.act), hatCol: HAT_COL[pr.act] ?? '#5a646e', hair: HAIRS_HD[pr.id % HAIRS_HD.length], skin: pr.id % 4,
        stripe: pr.color === '#ff4fd8' || pr.color === '#c6ff00' || pr.act === 'build' ? '#e8f040' : undefined,
      };
      const img = personHD(pose, Math.floor(pr.t * 7), lk);
      const flip = pr.dir < 0;
      const dx = Math.round(x - img.width / 2), dy = Math.round(floor - img.height);
      if (flip) {
        c.save();
        c.translate(dx + img.width, dy);
        c.scale(-1, 1);
        c.drawImage(img, 0, 0);
        c.restore();
      } else c.drawImage(img, dx, dy);
      if ((pr.act === 'weld' || pr.act === 'build' || pr.act === 'fix') && Math.sin(pr.t * 11 + pr.id) > 0.5) glowAt(c, x + (flip ? -8 : 8), floor - 16, 6, '#fff2b0', 0.9);
      if (pr.act === 'hose' || pr.act === 'pump') {
        c.fillStyle = pr.act === 'hose' ? '#c8ecff' : '#60c8ff';
        for (let k = 0; k < 6; k++) c.fillRect(Math.round(x + (flip ? -10 - k * 2 : 10 + k * 2)), Math.round(floor - 17 + ((k + Math.floor(pr.t * 12)) % 3)), 1, 1);
      }
    };
    for (const [id, list] of byRoom) {
      const pl = this.placed.get(id)!;
      const xa = Math.round(this.X(pl.at + pl.len, rows)) + 2, xb = Math.round(this.X(pl.at, rows)) - 2;
      const floor = pl.m.deck === ROOF ? SKY + ROOF_H - 6 : this.deckTop(pl.m.deck) + DH - 3;
      const sl = this.slots.get(id);
      const sleepers = list.filter((q) => q.act === 'sleep');
      const eaters = list.filter((q) => q.act === 'eat');
      const rest = list.filter((q) => q.act !== 'sleep' && q.act !== 'eat');
      sleepers.slice(0, sl?.beds.length ?? 0).forEach((q, i) => {
        const b = sl!.beds[i];
        const img = personHD('sleep', 0, { uniform: q.color, hat: 'none', hatCol: '#000', hair: HAIRS_HD[q.id % HAIRS_HD.length], skin: q.id % 4 });
        c.drawImage(img, Math.round(b.x - img.width / 2), Math.round(b.y - img.height + 4));
        if (Math.floor(this.time * 0.7 + q.id) % 5 === 0) pxMini(c, 'z', b.x + 8, b.y - 12, '#b0c4de', 'left', null);
      });
      eaters.slice(0, sl?.seats.length ?? 0).forEach((q, i) => draw(q, sl!.seats[i].x, floor, 'sit'));
      // Everyone else across the room (at its machines first), as many as fit; the rest are a number on the door.
      const fit = Math.max(1, Math.floor((xb - xa) / 9));
      const shown = rest.slice(0, fit);
      shown.forEach((q, i) => {
        const post = sl?.posts[i];
        const x = post && i < (sl?.posts.length ?? 0) ? post.x : xa + ((i + 0.5) / shown.length) * (xb - xa);
        draw(q, x, floor, poseHD(q));
      });
      const hidden = rest.length - shown.length + Math.max(0, sleepers.length - (sl?.beds.length ?? 0)) + Math.max(0, eaters.length - (sl?.seats.length ?? 0));
      if (hidden > 0) {
        const lab = `+${hidden}`;
        const y0 = pl.m.deck === ROOF ? SKY + 2 : this.deckTop(pl.m.deck) + 17;
        c.fillStyle = 'rgba(8,10,14,0.85)';
        c.fillRect(xb - lab.length * 4 - 4, y0, lab.length * 4 + 3, 8);
        pxMini(c, lab, xb - 2, y0 + 1, '#ffd740', 'right', null);
      }
    }
    for (const pr of loose) {
      if (pr.deck !== ROOF && !p.deckOpen(pr.deck)) continue;
      const floor = pr.deck === ROOF ? SKY + ROOF_H - 6 : this.deckTop(pr.deck) + DH - 3;
      draw(pr, this.X(pr.y, rows), floor, moving(pr) ? 'walk' : poseHD(pr));
    }
  }

  /* ---------------------------------------------------------------- */
  /* Side panel                                                        */
  /* ---------------------------------------------------------------- */

  private renderPanel(g: Game, ab: Aboard): void {
    const p = g.player;
    const cs = crewSummary(g);
    const per = ab.perDeck();
    let decks = `<div class="int-t">DECKS <small>${cs.aboard} aboard · ${cs.reserves} reserve</small></div>`;
    for (let deck = 0; deck <= 7; deck++) {
      const info = TITAN_DECK_INFO[deck];
      decks += `<div class="int-deck"><i style="background:${info.color}"></i><span>${esc(info.level)} ${esc(info.name)}</span><b>${per[deck]}</b></div>`;
    }
    this.secDecks.innerHTML = decks;

    // The selected room.
    const m = this.selected ? p.moduleById(this.selected) : undefined;
    this.secRoom.innerHTML = '';
    if (!m) {
      this.secRoom.innerHTML = '<div class="int-t">ROOM</div><div class="int-dim">Click a room to see who is in it and to send a work crew.</div>';
    } else {
      const d = MODULES[m.key];
      const here = ab.people.filter((q) => q.mod === m.id && !moving(q));
      const acts: Record<string, number> = {};
      for (const q of here) acts[q.act] = (acts[q.act] ?? 0) + 1;
      const need = p.crewNeeded(m);
      const doing = Object.entries(acts).map(([a, n]) => `${n} ${ACT_NAME[a] ?? a}`).join(', ') || 'nobody right now';
      this.secRoom.innerHTML = `<div class="int-t">${esc(d.name.toUpperCase())} <small>L${m.lvl} · ${m.deck === ROOF ? 'Roof' : `${TITAN_DECK_INFO[m.deck].level} ${TITAN_DECK_INFO[m.deck].name}`}</small></div>
        <div class="int-kv"><span>Staff</span><b>${need ? `${m.crew} / ${need}` : '—'}</b></div>
        <div class="int-kv"><span>In the room</span><b>${esc(doing)}</b></div>
        <div class="int-dim">${esc(d.desc).slice(0, 180)}</div>`;
      const block = upgradeBlock(g, m.id, true);
      const b = h('button', 'int-btn', block ? `CAN'T UPGRADE: ${esc(block)}` : `⚒ SEND A CREW TO UPGRADE IT (L${m.lvl + 1})`);
      if (block) b.classList.add('off');
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (block) return;
        this.order(g, `Upgrade the ${d.name}`, upgradeOrder(g, m));
      });
      this.secRoom.appendChild(b);
      const add = h('button', 'int-btn ghost', '+ ADD TO CUSTOM ORDER');
      add.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.draft.push(m.key === 'refinery' || m.key === 'cargo' || m.key === 'workshop' || m.key === 'forge' || m.key === 'vault' ? { k: 'fetch', mod: m.id } : { k: 'upgrade', mod: m.id });
        this.renderDraft();
      });
      this.secRoom.appendChild(add);
    }

    // Work orders under way.
    let html = `<div class="int-t">WORK ORDERS <small>${g.orders.length}/${MAX_ORDERS}</small></div>`;
    if (!g.orders.length) html += '<div class="int-dim">No crews out. Give them a job below, or pick a room.</div>';
    this.secOrders.innerHTML = html;
    for (const o of g.orders) {
      const box = h('div', 'int-order');
      box.innerHTML = `<b>👷${o.n} ${esc(o.name)}</b><div class="int-status">${esc(o.status)}</div>${o.steps.map((s, i) => `<div class="int-step ${i < o.i ? 'done' : i === o.i && o.phase !== 'home' ? 'now' : ''}">${i < o.i ? '✔' : i === o.i && o.phase !== 'home' ? '▶' : '○'} ${esc(stepLabel(g, s))}</div>`).join('')}`;
      if (o.phase !== 'home') {
        const x = h('button', 'int-cancel', 'CANCEL');
        x.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          cancelOrder(g, o.id);
          this.panelT = 0;
        });
        box.appendChild(x);
      }
      this.secOrders.appendChild(box);
    }
    // Ready-made jobs.
    const quick = h('div', 'int-quick');
    const refit = refitOrder(g);
    const arm = armRoofOrder(g);
    const mk = (label: string, steps: OrderStep[], name: string, why: string): void => {
      const b = h('button', `int-btn ${steps.length ? '' : 'off'}`, steps.length ? label : `${label.split(':')[0]}: ${why}`);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (steps.length) this.order(g, name, steps);
      });
      quick.appendChild(b);
    };
    mk('⚙ REFIT: metal from the Refinery → upgrade the Command Center → a turret mount of each kind on the roof', refit, 'Refit and arm', 'nothing to refit right now');
    mk(`🎯 ARM THE ROOF: ${mountKinds(g).length || 'no'} new turret mount${mountKinds(g).length === 1 ? '' : 's'}`, arm, 'Arm the roof', 'no mounts to add (limits or unlocks)');
    this.secOrders.appendChild(quick);
  }

  /** The custom order being put together. */
  private renderDraft(): void {
    const g = this.game;
    const s = this.secDraft;
    s.innerHTML = '<div class="int-t">CUSTOM ORDER</div>';
    if (!g) return;
    const p = g.player;
    const list = h('div', 'int-draftlist');
    if (!this.draft.length) list.innerHTML = '<div class="int-dim">Chain steps: FETCH at a room, UPGRADE a room, BUILD on a deck. Fetch steps work out what to collect from the steps after them.</div>';
    planFetches(g, this.draft);
    this.draft.forEach((st, i) => {
      const row = h('div', 'int-step now', `${i + 1}. ${esc(stepLabel(g, st))}`);
      const x = h('button', 'int-del', '✕');
      x.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.draft.splice(i, 1);
        this.renderDraft();
      });
      row.appendChild(x);
      list.appendChild(row);
    });
    s.appendChild(list);
    // Step pickers.
    const rooms = p.modules.filter((m) => m.built && m.deck !== ROOF && !MODULES[m.key].fixed);
    const opt = (m: ModuleInst): string => `<option value="${m.id}">${esc(MODULES[m.key].name)} L${m.lvl} (${TITAN_DECK_INFO[m.deck].level})</option>`;
    const row1 = h('div', 'int-pick');
    row1.innerHTML = `<select class="f">${rooms.filter((m) => ['refinery', 'cargo', 'workshop', 'forge', 'vault'].includes(m.key)).map(opt).join('') || '<option value="">no storage rooms</option>'}</select>`;
    const bf = h('button', 'int-add', '+ FETCH');
    bf.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const v = Number((row1.querySelector('select') as HTMLSelectElement).value);
      if (v) this.draft.push({ k: 'fetch', mod: v });
      this.renderDraft();
    });
    row1.appendChild(bf);
    const row2 = h('div', 'int-pick');
    row2.innerHTML = `<select>${p.modules.filter((m) => m.built && !MODULES[m.key].fixed).map((m) => `<option value="${m.id}">${esc(MODULES[m.key].name)} L${m.lvl}</option>`).join('')}</select>`;
    const bu = h('button', 'int-add', '+ UPGRADE');
    bu.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const v = Number((row2.querySelector('select') as HTMLSelectElement).value);
      if (v) this.draft.push({ k: 'upgrade', mod: v });
      this.renderDraft();
    });
    row2.appendChild(bu);
    const row3 = h('div', 'int-pick');
    const kinds = Object.values(MODULES).filter((d) => !d.fixed && !d.required && (d.unlock ?? 1) <= g.commander.level);
    row3.innerHTML = `<select class="k">${kinds.map((d) => `<option value="${d.key}">${esc(d.name)}</option>`).join('')}</select><select class="d"><option value="0">Roof</option>${[1, 2, 3, 4, 5, 6, 7].map((k) => `<option value="${k}">${TITAN_DECK_INFO[k].level} ${TITAN_DECK_INFO[k].name}</option>`).join('')}</select>`;
    const bb = h('button', 'int-add', '+ BUILD');
    bb.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const key = (row3.querySelector('select.k') as HTMLSelectElement).value;
      const deck = Number((row3.querySelector('select.d') as HTMLSelectElement).value);
      this.draft.push({ k: 'build', key, deck });
      this.renderDraft();
    });
    row3.appendChild(bb);
    s.append(row1, row2, row3);
    const go = h('button', `int-btn ${this.draft.length ? '' : 'off'}`, `👷 SEND A CREW (${this.draft.length} step${this.draft.length === 1 ? '' : 's'})`);
    go.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (!this.draft.length) return;
      if (this.order(g, 'Custom order', this.draft)) {
        this.draft = [];
        this.renderDraft();
      }
    });
    s.appendChild(go);
  }

  private order(g: Game, name: string, steps: OrderStep[]): boolean {
    const err = createOrder(g, name, steps.map((s) => ({ ...s })));
    if (err) {
      this.act.toast(err, '#ff8a80');
      this.act.sound('nope');
      return false;
    }
    this.act.toast(`Work order: ${name}. A crew is on its way.`, '#ffd740');
    this.act.sound('build');
    this.panelT = 0;
    return true;
  }
}

const ACT_NAME: Record<string, string> = {
  work: 'working', gun: 'on the gun', soldier: 'on watch', engine: 'running the engines', console: 'at the consoles', medic: 'tending patients', cook: 'cooking',
  weld: 'fabricating', haul: 'hauling', mechanic: 'fixing vehicles', build: 'building', sleep: 'asleep', eat: 'eating', idle: 'off duty', drill: 'drilling',
  hose: 'fighting a fire', pump: 'pumping', fix: 'repairing', carry: 'carrying',
};
