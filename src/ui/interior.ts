import { moving, type Aboard, type Person } from '../game/aboard';
import { upgradeBlock } from '../game/actions';
import { DECK_OPEN_CC, MODULES, ROOF, TITAN_DECK_INFO, TITAN_LIFTS } from '../game/defs';
import type { Game } from '../game/game';
import { crewSummary } from '../game/systems/crewops';
import { compIndex } from '../game/systems/titan';
import { armRoofOrder, cancelOrder, createOrder, MAX_ORDERS, mountKinds, planFetches, refitOrder, stepLabel, upgradeOrder, type OrderStep } from '../game/systems/workorders';
import type { ModuleInst } from '../game/tank';
import { glowSprite } from '../render/px/fx2d';
import { hatFor, personSprite, poseFor } from '../render/px/people';
import { hash2, shade } from '../render/px/pixels';
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

const DH = 24;
const ROOF_H = 22;
const SKY = 18;
const KEEL = 34;
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
  private cell = 12;
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
    this.panel.append(head, this.secDecks, this.secRoom, this.secOrders, this.secDraft);
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
    this.s = Math.max(1, Math.round(hh / 430));
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
    const a = this.area();
    this.cell = Math.max(8, Math.min(14, Math.floor((a.w - 30) / (p.rows + 9))));
    this.dio.width = (p.rows + 9) * this.cell;
    this.dio.height = SKY + ROOF_H + 7 * DH + KEEL;
    this.placed.clear();
    this.roomsByDeck = [];
    const shafts = TITAN_LIFTS.map((l) => [l.cy, l.cy + 2]);
    for (let deck = 0; deck <= 7; deck++) {
      const mods = p.modules.filter((m) => m.deck === deck).sort((u, v) => u.cy - v.cy || u.cx - v.cx);
      const list: Placed[] = [];
      let cur = 0;
      for (const m of mods) {
        const len = MODULES[m.key].h;
        let at = deck === ROOF ? m.cy : Math.max(m.cy, cur);
        if (deck !== ROOF) {
          for (let guard = 0; guard < 4; guard++) {
            const hit = shafts.find(([s0, s1]) => at < s1 && at + len > s0);
            if (!hit) break;
            at = hit[1];
          }
        }
        const pl = { m, at, len };
        list.push(pl);
        this.placed.set(m.id, pl);
        cur = Math.max(cur, at + len);
      }
      // Too much for the deck: squeeze everything in.
      if (deck !== ROOF && cur > p.rows) for (const pl of list) {
        pl.at *= p.rows / cur;
        pl.len *= p.rows / cur;
      }
      this.roomsByDeck[deck] = list;
    }
    this.layoutFor = p.version;
    this.clampPan();
  }

  /** Cutaway x of a point `cy` cells from the bow (the bow is on the right). */
  private X(cy: number, rows: number): number {
    return (rows + 5 - cy) * this.cell;
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
    // Backdrop: the hangar-dark interior of the screen, a faint blueprint grid.
    c.fillStyle = '#07090c';
    c.fillRect(0, 0, this.W, this.H);
    c.fillStyle = '#0d141b';
    for (let gx = 0; gx < this.W; gx += 16) c.fillRect(gx, 0, 1, this.H);
    for (let gy = 0; gy < this.H; gy += 16) c.fillRect(0, gy, this.W, 1);
    const a = this.area();
    const ox = Math.round(a.x + a.w / 2 - (this.dio.width * this.zoom) / 2 + this.panX), oy = Math.round(a.y + a.h / 2 - (this.dio.height * this.zoom) / 2 + this.panY);
    c.drawImage(this.dio, ox, oy, this.dio.width * this.zoom, this.dio.height * this.zoom);
    this.panelT -= dt;
    if (this.panelT <= 0) {
      this.panelT = 0.4;
      this.renderPanel(g, ab);
    }
  }

  /** Paints the whole cutaway at 1:1 into the diorama canvas. */
  private paint(g: Game, ab: Aboard): void {
    const c = this.dx;
    const p = g.player;
    const rows = p.rows;
    const cell = this.cell;
    const W = this.dio.width, H = this.dio.height;
    const X = (cy: number): number => this.X(cy, rows);
    c.clearRect(0, 0, W, H);
    const hullL = X(rows + 1), hullR = X(-0.5);
    const top = SKY, bottom = SKY + ROOF_H + 7 * DH;
    // Sky strip with the haze.
    const sky = c.createLinearGradient(0, 0, 0, SKY + ROOF_H);
    sky.addColorStop(0, '#2a3848');
    sky.addColorStop(1, '#4a5058');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, SKY + ROOF_H);

    // Hull shell: armour around the section, the prow wedge, the stern.
    c.fillStyle = '#12151b';
    c.fillRect(hullL - 3, top + ROOF_H - 3, hullR - hullL + 6, bottom - top - ROOF_H + 6);
    // Prow: stacked faceted plates.
    for (let y = top + ROOF_H - 3; y < bottom + 3; y++) {
      const f = (y - (top + ROOF_H)) / (bottom - top - ROOF_H);
      const reach = cell * (3.2 - Math.abs(f - 0.55) * 3.4);
      const col = f < 0.2 ? '#4a5566' : f < 0.45 ? '#39424f' : f < 0.7 ? '#2c333d' : '#20252d';
      c.fillStyle = col;
      c.fillRect(hullR, y, Math.max(1, reach), 1);
      if (f > 0.35 && f < 0.72 && y % 2 === 0) {
        c.fillStyle = '#0c0e12';
        c.fillRect(hullR + 2, y, Math.max(1, reach - 5), 1);
      }
    }
    // The prow's headlights and light strip.
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 2.4);
    this.glow(c, hullR + cell * 1.6, top + ROOF_H + DH * 2.3, 16, '#fff3c4', 0.7);
    c.fillStyle = '#fff8d8';
    c.fillRect(Math.round(hullR + cell * 1.4), Math.round(top + ROOF_H + DH * 2.3) - 1, 3, 2);
    // Stern: the engine exhausts, bigger the bigger the engines.
    const engLv = p.modules.filter((m) => m.built && (m.key === 'engine' || m.key === 'ion_engine')).reduce((s, m) => s + m.lvl, 0);
    const stacks = Math.min(6, 2 + Math.floor(engLv / 2));
    for (let k = 0; k < stacks; k++) {
      const sy = bottom - DH * (1.1 + k * 0.55), sw = cell * (1.2 + engLv * 0.08);
      c.fillStyle = '#1a1d22';
      c.fillRect(Math.round(hullL - sw), Math.round(sy - 4), Math.round(sw), 8);
      c.fillStyle = '#2e333b';
      c.fillRect(Math.round(hullL - sw), Math.round(sy - 4), Math.round(sw), 2);
      const hot = Math.abs(p.speed) > 1 || g.helm.overdrive;
      c.fillStyle = g.helm.overdrive ? (Math.sin(this.time * 30 + k) > 0 ? '#ffcc40' : '#ff6d00') : hot ? '#7a3c1c' : '#1e1e22';
      c.fillRect(Math.round(hullL - sw) - 1, Math.round(sy - 2), 2, 4);
      if (hot) this.glow(c, hullL - sw, sy, g.helm.overdrive ? 18 : 8, '#ff9100', g.helm.overdrive ? 0.8 : 0.35);
    }

    // Decks.
    for (let deck = 1; deck <= 7; deck++) {
      const y0 = this.deckTop(deck);
      const info = TITAN_DECK_INFO[deck];
      const open = p.deckOpen(deck);
      // Corridor back wall (the Spine), tinted by the deck.
      c.fillStyle = open ? shade(mixHex('#1c2129', info.color, 0.1), 0) : '#0b0c0f';
      c.fillRect(hullL, y0, hullR - hullL, DH);
      if (open) {
        c.fillStyle = 'rgba(255,255,255,0.03)';
        for (let x = hullL + 4; x < hullR; x += cell) c.fillRect(Math.round(x), y0 + 2, 1, DH - 5);
        // Ceiling lights down the corridor.
        for (let x = hullL + cell / 2; x < hullR; x += cell * 2) {
          c.fillStyle = '#d8e8f0';
          c.fillRect(Math.round(x), y0 + 1, 3, 1);
        }
      } else {
        c.fillStyle = '#2a2d33';
        for (let x = hullL; x < hullR; x += 6) c.fillRect(Math.round(x), y0 + ((x / 6) % 2 ? 3 : 12), 3, 1);
      }
      for (const pl of this.roomsByDeck[deck] ?? []) this.room(c, g, pl, deck, y0);
      // Floor.
      c.fillStyle = '#343a44';
      c.fillRect(hullL, y0 + DH - 2, hullR - hullL, 2);
      c.fillStyle = '#4a525e';
      c.fillRect(hullL, y0 + DH - 2, hullR - hullL, 1);
      // Deck label on the stern bulkhead.
      c.fillStyle = info.color;
      c.fillRect(hullL - 3, y0 + 2, 2, DH - 6);
      // Fire and flooding by compartment (bow, midships, stern thirds).
      for (let sec = 0; sec < 3; sec++) {
        const i = compIndex(deck, sec);
        const f = g.titan.fire[i] ?? 0, fl = g.titan.flood[i] ?? 0;
        const xa = X((sec + 1) * (rows / 3)), xb = X(sec * (rows / 3));
        if (fl > 0.02) {
          const wh = Math.round(fl * (DH - 3));
          c.fillStyle = 'rgba(40,120,200,0.55)';
          c.fillRect(Math.round(xa), y0 + DH - 2 - wh, Math.round(xb - xa), wh);
          c.fillStyle = 'rgba(160,220,255,0.7)';
          for (let x = xa; x < xb; x += 3) c.fillRect(Math.round(x + Math.sin(this.time * 3 + x) * 1), y0 + DH - 2 - wh, 2, 1);
        }
        if (f > 0) {
          for (let k = 0; k < 6 + f * 14; k++) {
            const fx = xa + hash2(k, deck, sec) * (xb - xa);
            const fh = (3 + f * 12) * (0.6 + 0.4 * Math.sin(this.time * 12 + k * 1.7));
            c.fillStyle = k % 3 === 0 ? '#ffe082' : k % 3 === 1 ? '#ff9100' : '#ff3d00';
            c.fillRect(Math.round(fx), Math.round(y0 + DH - 2 - fh), 2, Math.round(fh));
          }
          this.glow(c, (xa + xb) / 2, y0 + DH - 6, (xb - xa) * 0.8, '#ff6d00', 0.35 + f * 0.3);
          c.fillStyle = 'rgba(20,20,22,0.45)';
          c.fillRect(Math.round(xa), y0, Math.round(xb - xa), 4);
        }
      }
    }
    // Lift shafts through every deck, with the cars.
    for (const l of TITAN_LIFTS) {
      const xa = X(l.cy + 2), xb = X(l.cy);
      c.fillStyle = '#0a0b0e';
      c.fillRect(Math.round(xa), top + ROOF_H - 2, Math.round(xb - xa), bottom - top - ROOF_H + 2);
      c.fillStyle = '#2a2e36';
      c.fillRect(Math.round(xa), top + ROOF_H - 2, 1, bottom - top - ROOF_H + 2);
      c.fillRect(Math.round(xb) - 1, top + ROOF_H - 2, 1, bottom - top - ROOF_H + 2);
      c.fillStyle = '#4a4f58';
      c.fillRect(Math.round((xa + xb) / 2), top + ROOF_H - 2, 1, bottom - top - ROOF_H + 2);
      for (let deck = 1; deck <= 7; deck++) {
        c.fillStyle = '#ffd740';
        c.fillRect(Math.round(xa) + 1, this.deckTop(deck) + DH - 3, Math.round(xb - xa) - 2, 1);
      }
      // The car rides between decks.
      const ph = (Math.sin(this.time * 0.35 + l.cy) + 1) / 2;
      const cy = top + ROOF_H + ph * (7 * DH - DH);
      c.fillStyle = '#5a616c';
      c.fillRect(Math.round(xa) + 2, Math.round(cy) + 2, Math.round(xb - xa) - 4, DH - 4);
      c.fillStyle = '#ffd740';
      c.fillRect(Math.round(xa) + 2, Math.round(cy) + 2, Math.round(xb - xa) - 4, 1);
      c.fillStyle = '#1a1d22';
      c.fillRect(Math.round(xa) + 4, Math.round(cy) + 5, Math.round(xb - xa) - 8, DH - 10);
    }

    // Sealed decks say so (over the shafts).
    for (let deck = 1; deck <= 7; deck++) {
      if (p.deckOpen(deck)) continue;
      const y0 = this.deckTop(deck);
      const msg = `SEALED: OPENS WITH THE TITAN MK ${['I', 'II', 'III', 'IV', 'V', 'VI'][(DECK_OPEN_CC[deck] ?? 1) - 1]} REFIT`;
      const tw = msg.length * 4 + 6;
      c.fillStyle = '#0b0c0f';
      c.fillRect(Math.round((hullL + hullR) / 2 - tw / 2), y0 + DH / 2 - 5, tw, 11);
      pxMini(c, msg, (hullL + hullR) / 2, y0 + DH / 2 - 2, '#7a7e86', 'center');
    }
    // The roof: armour line, the tower, every gun and nest in profile.
    const ry = SKY;
    c.fillStyle = '#2c333d';
    c.fillRect(hullL, ry + ROOF_H - 4, hullR - hullL, 4);
    c.fillStyle = '#56606e';
    c.fillRect(hullL, ry + ROOF_H - 4, hullR - hullL, 1);
    for (let x = hullL + 6; x < hullR - 6; x += cell * 1.5) {
      c.fillStyle = Math.floor(this.time * 2 + x) % 7 === 0 ? '#9ff0ff' : '#38c8ff';
      c.fillRect(Math.round(x), ry + ROOF_H - 2, Math.round(cell * 0.8), 1);
    }
    const tw = X(25), twR = X(21);
    c.fillStyle = '#20262e';
    c.fillRect(Math.round(tw), ry - 6, Math.round(twR - tw), ROOF_H + 2);
    c.fillStyle = '#3a4350';
    c.fillRect(Math.round(tw), ry - 6, Math.round(twR - tw), 2);
    c.fillStyle = '#7fe0ff';
    for (let x = tw + 3; x < twR - 3; x += 5) c.fillRect(Math.round(x), ry - 1, 3, 2);
    c.fillStyle = '#8a929c';
    c.fillRect(Math.round((tw + twR) / 2), ry - 14, 1, 8);
    c.fillStyle = Math.floor(this.time * 2) % 2 ? '#ff3030' : '#601010';
    c.fillRect(Math.round((tw + twR) / 2), ry - 15, 1, 1);
    for (const pl of this.roomsByDeck[ROOF] ?? []) this.roofThing(c, g, pl);

    // Keel and crawlers.
    const ky = bottom;
    c.fillStyle = '#161a20';
    c.fillRect(hullL, ky, hullR - hullL, 5);
    c.fillStyle = '#343c48';
    c.fillRect(hullL, ky, hullR - hullL, 1);
    const tread = this.time * p.speed * 2;
    for (let k = 0; k < 4; k++) {
      const a = rows * (0.02 + k * 0.245), len = rows * 0.22;
      const xa = X(a + len), xb = X(a);
      const hp = g.titan.crawlers[k] ?? 1;
      c.fillStyle = '#0c0d10';
      c.fillRect(Math.round(xa), ky + 5, Math.round(xb - xa), KEEL - 8);
      c.fillStyle = '#26292f';
      for (let x = xa + (((tread % 4) + 4) % 4); x < xb; x += 4) {
        c.fillRect(Math.round(x), ky + 5, 2, 2);
        c.fillRect(Math.round(x), ky + KEEL - 5, 2, 2);
      }
      const wheels = Math.max(3, Math.floor((xb - xa) / 9));
      for (let wv = 0; wv < wheels; wv++) {
        const wx = xa + ((wv + 0.5) / wheels) * (xb - xa), wy = ky + KEEL / 2 + 1;
        disc(c, wx, wy, 4, hp < 0.1 ? '#3a1a10' : '#3a3f48');
        disc(c, wx, wy, 2, '#1a1c20');
        const ang = tread * 0.6 + wv;
        c.fillStyle = '#6a707a';
        c.fillRect(Math.round(wx + Math.cos(ang) * 2.5), Math.round(wy + Math.sin(ang) * 2.5), 1, 1);
      }
      if (hp < 0.35) this.glow(c, (xa + xb) / 2, ky + KEEL / 2, 14, '#ff6d00', 0.3);
    }

    // The crew.
    const people = [...ab.people].sort((u, v) => (u.act === 'sleep' ? 0 : 1) - (v.act === 'sleep' ? 0 : 1));
    for (const pr of people) this.person(c, g, pr);

    // Selection.
    for (const id of [this.hover, this.selected]) {
      const pl = id ? this.placed.get(id) : undefined;
      if (!pl) continue;
      const y0 = this.deckTop(pl.m.deck), bh = pl.m.deck === ROOF ? ROOF_H : DH;
      c.strokeStyle = id === this.selected ? '#ffd740' : 'rgba(255,255,255,0.6)';
      c.lineWidth = 1;
      c.strokeRect(Math.round(X(pl.at + pl.len)) + 0.5, y0 + 0.5, Math.round(X(pl.at) - X(pl.at + pl.len)) - 1, bh - 1);
    }
    void pulse;
  }

  private glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, k: number): void {
    const gs = glowSprite(col, r * 2);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = Math.min(1, k);
    c.drawImage(gs, Math.round(x - gs.width / 2), Math.round(y - gs.height / 2));
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  /** A room on a deck, furnished for what it is. */
  private room(c: CanvasRenderingContext2D, g: Game, pl: Placed, deck: number, y0: number): void {
    const rows = g.player.rows;
    const m = pl.m;
    const d = MODULES[m.key];
    const xa = Math.round(this.X(pl.at + pl.len, rows)) + 1, xb = Math.round(this.X(pl.at, rows)) - 1;
    const w = xb - xa, bh = DH - 2;
    if (w < 3) return;
    const col = CAT[d.cat] ?? '#78909c';
    const wall = mixHex('#1a1e25', col, 0.18);
    c.fillStyle = '#0a0b0e';
    c.fillRect(xa - 1, y0, w + 2, bh);
    c.fillStyle = wall;
    c.fillRect(xa, y0 + 1, w, bh - 1);
    // Wall panels and a strip light.
    c.fillStyle = shade(wall, 0.08);
    for (let x = xa + 3; x < xb - 1; x += 7) c.fillRect(x, y0 + 3, 5, bh - 8);
    c.fillStyle = shade(col, 0.3);
    c.fillRect(xa + 2, y0 + 1, w - 4, 1);
    const t = this.time;
    const flo = y0 + bh - 1;
    if (!m.built) {
      // Under construction: scaffolding and hazard tape.
      c.fillStyle = '#6a5a3a';
      for (let x = xa + 2; x < xb; x += 6) c.fillRect(x, y0 + 3, 1, bh - 4);
      c.fillRect(xa + 1, y0 + 9, w - 2, 1);
      for (let x = xa; x < xb; x += 4) {
        c.fillStyle = Math.floor(x / 4) % 2 ? '#141414' : '#e0b020';
        c.fillRect(x, flo - 3, 4, 2);
      }
      if (Math.sin(t * 9 + m.id) > 0.3) this.glow(c, xa + w / 2 + Math.sin(t * 3) * w * 0.3, y0 + bh / 2, 6, '#ffe082', 0.8);
      return;
    }
    const lv = m.lvl;
    switch (m.key) {
      case 'quarters':
      case 'barracks':
        // Bunk beds, two high, with lockers.
        for (let x = xa + 2; x + 9 < xb; x += 11) {
          c.fillStyle = '#5a5046';
          c.fillRect(x, y0 + 5, 1, bh - 6);
          c.fillRect(x + 9, y0 + 5, 1, bh - 6);
          for (const by of [y0 + 7, flo - 5]) {
            c.fillStyle = '#39424e';
            c.fillRect(x + 1, by, 8, 2);
            c.fillStyle = m.key === 'barracks' ? '#6a7040' : '#6a8ab0';
            c.fillRect(x + 1, by - 1, 8, 1);
            c.fillStyle = '#e8e4d8';
            c.fillRect(x + 1, by - 1, 2, 1);
          }
        }
        c.fillStyle = '#4a5260';
        c.fillRect(xb - 4, y0 + 4, 3, bh - 5);
        break;
      case 'mess_hall':
        c.fillStyle = '#5a6068';
        c.fillRect(xa + 1, y0 + 6, 6, bh - 7);
        c.fillStyle = '#c0c8d0';
        c.fillRect(xa + 2, y0 + 5, 2, 1);
        this.glow(c, xa + 4, y0 + 6, 5, '#ffab40', 0.4);
        for (let x = xa + 10; x + 8 < xb; x += 12) {
          c.fillStyle = '#6a4a30';
          c.fillRect(x, flo - 6, 9, 2);
          c.fillRect(x + 1, flo - 4, 1, 3);
          c.fillRect(x + 7, flo - 4, 1, 3);
        }
        break;
      case 'hydroponics':
        for (let x = xa + 2; x + 4 < xb; x += 6) {
          for (const sy of [y0 + 5, y0 + 12]) {
            c.fillStyle = '#3a3f46';
            c.fillRect(x, sy + 4, 5, 1);
            c.fillStyle = hash2(x, sy) > 0.5 ? '#5aa040' : '#78c850';
            c.fillRect(x, sy + 1, 5, 3);
            c.fillStyle = '#b060ff';
            c.fillRect(x, sy - 1, 5, 1);
          }
        }
        this.glow(c, xa + w / 2, y0 + 6, w * 0.6, '#b060ff', 0.25);
        break;
      case 'engine':
      case 'ion_engine': {
        // An engine block that grows with its level: pistons pumping at the Titan's speed.
        const ew = Math.min(w - 4, 10 + lv * 5), eh = Math.min(bh - 3, 9 + lv * 2);
        const ex = xa + Math.round((w - ew) / 2), ey = flo - eh;
        const ion = m.key === 'ion_engine';
        c.fillStyle = ion ? '#2a3a5a' : '#3a3530';
        c.fillRect(ex, ey, ew, eh);
        c.fillStyle = ion ? '#4a6a9a' : '#5a524a';
        c.fillRect(ex, ey, ew, 2);
        const n = Math.max(2, Math.floor(ew / 5));
        const sp = 3 + Math.abs(g.player.speed) * 0.8;
        for (let k = 0; k < n; k++) {
          const px = ex + 2 + k * ((ew - 4) / n);
          const up = Math.round((Math.sin(t * sp + k * 1.9) + 1) * 1.5);
          c.fillStyle = '#9aa2ac';
          c.fillRect(Math.round(px), ey - 3 + up, 2, 4);
          c.fillStyle = '#2a2a2e';
          c.fillRect(Math.round(px), ey + 3, 2, eh - 5);
        }
        c.fillStyle = ion ? '#60c0ff' : '#ff9a40';
        c.fillRect(ex + 1, ey + eh - 3, ew - 2, 1);
        if (ion) this.glow(c, ex + ew / 2, ey + eh / 2, ew, '#40a0ff', 0.35);
        else if (Math.abs(g.player.speed) > 1) this.glow(c, ex + ew / 2, ey + eh - 2, ew * 0.8, '#ff9100', 0.25);
        // Pipes up the wall.
        c.fillStyle = '#6a5a3a';
        c.fillRect(xa + 1, y0 + 3, w - 2, 1);
        pxMini(c, `L${lv}`, xb - 2, y0 + 3, '#ffd740', 'right', null);
        break;
      }
      case 'reactor':
      case 'fission': {
        const r = Math.min(bh / 2 - 2, 4 + lv);
        const cx = xa + w / 2, cy = y0 + bh / 2 + 1;
        const k = 0.6 + 0.4 * Math.sin(t * 3 + m.id);
        c.fillStyle = '#20262e';
        c.fillRect(Math.round(cx - r - 3), y0 + 3, Math.round(r * 2 + 6), bh - 3);
        disc(c, cx, cy, r + 1, '#0a1a14');
        disc(c, cx, cy, r, m.key === 'fission' ? '#40ff90' : '#40e0ff');
        disc(c, cx, cy, r * 0.5, '#e0ffff');
        this.glow(c, cx, cy, r * 5, m.key === 'fission' ? '#40ff90' : '#40e0ff', 0.4 * k);
        c.fillStyle = '#5a6068';
        for (let yy = y0 + 4; yy < flo; yy += 4) c.fillRect(Math.round(cx - r - 3), yy, Math.round(r * 2 + 6), 1);
        break;
      }
      case 'bridge':
      case 'radar':
      case 'science_lab':
      case 'arcane_sanctum':
        // Consoles with screens.
        for (let x = xa + 2; x + 6 < xb; x += 9) {
          c.fillStyle = '#2a323e';
          c.fillRect(x, flo - 7, 7, 7);
          c.fillStyle = m.key === 'arcane_sanctum' ? '#d080ff' : m.key === 'science_lab' ? '#80ffb0' : '#60d0ff';
          c.fillRect(x + 1, flo - 6, 5, 3);
          c.fillStyle = '#ffffff';
          if (Math.floor(t * 3 + x) % 4 === 0) c.fillRect(x + 1 + ((t * 5) % 5), flo - 5, 1, 1);
        }
        if (m.key === 'bridge') {
          c.fillStyle = '#16323c';
          c.fillRect(xa + 2, y0 + 3, w - 4, 6);
          c.fillStyle = '#7fe0ff';
          for (let x = xa + 4; x < xb - 2; x += 6) c.fillRect(x, y0 + 4, 1, 1);
        }
        this.glow(c, xa + w / 2, flo - 5, w * 0.5, '#40c0ff', 0.2);
        break;
      case 'medbay':
        for (let x = xa + 2; x + 8 < xb; x += 11) {
          c.fillStyle = '#d8dce0';
          c.fillRect(x, flo - 4, 8, 2);
          c.fillStyle = '#8a929c';
          c.fillRect(x, flo - 2, 1, 2);
          c.fillRect(x + 7, flo - 2, 1, 2);
          c.fillRect(x + 9, flo - 10, 1, 8);
        }
        c.fillStyle = '#e03030';
        c.fillRect(xa + w / 2 - 1, y0 + 4, 3, 7);
        c.fillRect(xa + w / 2 - 3, y0 + 6, 7, 3);
        break;
      case 'workshop':
      case 'forge':
      case 'refinery':
      case 'repair_bay':
      case 'ammo_depot': {
        const furnace = m.key === 'forge' || m.key === 'refinery';
        if (furnace) {
          c.fillStyle = '#3a2a24';
          c.fillRect(xa + 2, flo - 12, 10, 12);
          c.fillStyle = Math.sin(t * 6) > 0 ? '#ff9100' : '#ff6d00';
          c.fillRect(xa + 4, flo - 7, 6, 4);
          this.glow(c, xa + 7, flo - 5, 14, '#ff9100', 0.5);
          c.fillStyle = '#5a5f68';
          c.fillRect(xa + 5, y0 + 1, 3, flo - 12 - y0);
        }
        // Workbench, crane hook, crates.
        c.fillStyle = '#5a4a3a';
        c.fillRect(xb - 12, flo - 5, 10, 2);
        c.fillStyle = '#7a808a';
        const hx = xa + w * 0.55 + Math.sin(t * 0.7 + m.id) * w * 0.2;
        c.fillRect(Math.round(hx), y0 + 2, 1, 8);
        c.fillRect(Math.round(hx) - 1, y0 + 10, 3, 1);
        if (m.key === 'ammo_depot') {
          c.fillStyle = '#b08a3a';
          for (let x = xa + 2; x < xb - 2; x += 3) c.fillRect(x, flo - 8, 2, 7);
        } else {
          c.fillStyle = '#7a5a34';
          c.fillRect(xb - 7, flo - 4, 4, 3);
        }
        break;
      }
      case 'cargo':
      case 'vault': {
        const cols = ['#5d6b3a', '#7a4a2e', '#46607a', '#6b5d3a'];
        for (let x = xa + 1, k = 0; x + 6 < xb; x += 7, k++) {
          const stack = 1 + Math.floor(hash2(k, m.id) * 3);
          for (let s = 0; s < stack; s++) {
            c.fillStyle = cols[(k + s) % 4];
            c.fillRect(x, flo - 6 * (s + 1), 6, 5);
            c.fillStyle = shade(cols[(k + s) % 4], 0.25);
            c.fillRect(x, flo - 6 * (s + 1), 6, 1);
          }
        }
        if (m.key === 'vault') {
          disc(c, xb - 7, y0 + bh / 2, 5, '#6a6f78');
          disc(c, xb - 7, y0 + bh / 2, 2, '#ffd740');
        }
        break;
      }
      case 'garage':
      case 'drone_bay':
      case 'jet_hangar':
      case 'mech_bay':
      case 'tank_bay': {
        // A vehicle on the pad.
        const vx = xa + w / 2;
        c.fillStyle = '#3a4a3a';
        c.fillRect(Math.round(vx - 8), flo - 7, 16, 5);
        c.fillStyle = '#4a5a4a';
        c.fillRect(Math.round(vx - 4), flo - 10, 8, 3);
        c.fillStyle = '#1a1a1a';
        c.fillRect(Math.round(vx), flo - 9, 9, 1);
        c.fillRect(Math.round(vx - 8), flo - 2, 16, 2);
        break;
      }
      case 'training_grounds':
        for (let x = xa + 3; x + 3 < xb; x += 8) {
          disc(c, x + 1, flo - 8, 3, '#e04040');
          disc(c, x + 1, flo - 8, 1.5, '#f0f0f0');
          c.fillStyle = '#6a5a4a';
          c.fillRect(x + 1, flo - 5, 1, 5);
        }
        break;
      default:
        c.fillStyle = shade(col, -0.3);
        c.fillRect(xa + 2, flo - 6, w - 4, 5);
        c.fillStyle = shade(col, 0.2);
        c.fillRect(xa + 3, flo - 5, 3, 1);
    }
    // Upgrading: a progress bar across the ceiling.
    const job = g.builds.find((b) => b.modId === m.id);
    if (job) {
      c.fillStyle = '#000';
      c.fillRect(xa + 1, y0 + 1, w - 2, 2);
      c.fillStyle = job.order ? '#ffd740' : '#76ff03';
      c.fillRect(xa + 1, y0 + 1, Math.round((w - 2) * Math.min(1, job.t / job.total)), 2);
    }
    if (w > 30 && this.zoom >= 2) pxMini(c, d.name.toUpperCase().slice(0, Math.floor(w / 4)), xa + 2, y0 + 3, 'rgba(255,255,255,0.55)', 'left', null);
    void deck;
  }

  /** A gun, nest or dish on the roof, in profile. */
  private roofThing(c: CanvasRenderingContext2D, g: Game, pl: Placed): void {
    const p = g.player;
    const m = pl.m;
    const d = MODULES[m.key];
    const xa = this.X(pl.at + pl.len, p.rows), xb = this.X(pl.at, p.rows);
    const base = SKY + ROOF_H - 4;
    const cx = (xa + xb) / 2;
    if (d.hardpoint || m.key === 'pad' || m.key === 'main_gun') {
      const big = m.key === 'main_gun' ? 1.6 : d.hardpoint === 'heavy' ? 1.3 : d.hardpoint === 'medium' ? 1 : 0.7;
      const tw = Math.round(8 * big), th = Math.round(5 * big);
      c.fillStyle = '#1c2129';
      c.fillRect(Math.round(cx - tw / 2), base - th, tw, th);
      c.fillStyle = '#4a5566';
      c.fillRect(Math.round(cx - tw / 2), base - th, tw, 1);
      c.fillStyle = '#38c8ff';
      c.fillRect(Math.round(cx - tw / 2) + 1, base - 2, tw - 2, 1);
      if (m.weapon) {
        // The barrel points where the gun aims: forward (right) or aft (left), elevated a little.
        const rel = Math.cos(m.aim - p.rot);
        const len = Math.round(10 * big);
        const dir = rel >= 0 ? 1 : -1;
        const recoil = Math.round(Math.min(0.35, m.recoil ?? 0) * len);
        c.fillStyle = '#12151a';
        for (let k = 0; k < len - recoil; k++) c.fillRect(Math.round(cx + dir * (tw / 2 - 1 + k)), base - th + 1 - Math.floor(k / 5), Math.max(1, Math.round(big)), 1 + (big > 1.2 ? 1 : 0));
        if ((m.recoil ?? 0) > 0.2) this.glow(c, cx + dir * (tw / 2 + len), base - th - len / 5, 8, '#fff59d', 0.9);
      }
    } else if (d.nest) {
      c.fillStyle = '#3a3a30';
      c.fillRect(Math.round(xa + 1), base - 3, Math.round(xb - xa - 2), 3);
      c.fillStyle = '#5a5a44';
      c.fillRect(Math.round(xa + 1), base - 3, Math.round(xb - xa - 2), 1);
    } else if (m.key === 'radar') {
      c.fillStyle = '#8a929c';
      c.fillRect(Math.round(cx), base - 10, 1, 10);
      const a = Math.sin(this.time * 2) * 4;
      c.fillRect(Math.round(cx - 4 + a / 2), base - 11, Math.round(8 - Math.abs(a)), 2);
    } else {
      c.fillStyle = '#2a323c';
      c.fillRect(Math.round(xa + 1), base - 5, Math.round(xb - xa - 2), 5);
      c.fillStyle = '#4a5566';
      c.fillRect(Math.round(xa + 1), base - 5, Math.round(xb - xa - 2), 1);
    }
  }

  /** One of the crew, in the room they're in or walking the deck. */
  private person(c: CanvasRenderingContext2D, g: Game, pr: Person): void {
    const p = g.player;
    const rows = p.rows;
    const walking = moving(pr);
    if (pr.ride > 0) return;
    let x: number;
    const pl = !walking && pr.mod ? this.placed.get(pr.mod) : undefined;
    if (pl && pl.m.deck === pr.deck) {
      const m = pl.m;
      const d = MODULES[m.key];
      const f = Math.max(0, Math.min(1, (pr.y - m.cy) / d.h));
      // Spread across the room by where they stand in it (across the hull as well as along it).
      const g2 = Math.max(0, Math.min(1, (pr.x - m.cx) / d.w));
      x = this.X(pl.at + f * pl.len, rows) + (g2 - 0.5) * 4;
    } else x = this.X(pr.y, rows);
    const y0 = this.deckTop(pr.deck);
    const floor = pr.deck === ROOF ? SKY + ROOF_H - 4 : y0 + DH - 2;
    const pose = poseFor(pr.act, walking, pr.t);
    const skin = pr.id % 4;
    const hat = hatFor(pr.act, pr.color, pr.id);
    const img = personSprite(pose, pr.color, hat, skin, pr.carry ? '#a07840' : '#a07840');
    const flip = pr.dir < 0;
    const bob = walking ? (Math.floor(pr.t * 6) % 2) : 0;
    const dx = Math.round(x - img.width / 2), dy = floor - img.height - bob + (pose === 'sleep' ? -Math.round((pr.id % 2) * 6 + 2) : 0);
    if (flip) {
      c.save();
      c.translate(dx + img.width, dy);
      c.scale(-1, 1);
      c.drawImage(img, 0, 0);
      c.restore();
    } else c.drawImage(img, dx, dy);
    // What they're doing: sparks from welders and builders, spray from hoses, Zs from sleepers.
    if (!walking) {
      if ((pr.act === 'weld' || pr.act === 'build' || pr.act === 'fix') && Math.sin(pr.t * 11) > 0.6) {
        c.fillStyle = '#fff59d';
        c.fillRect(dx + (flip ? -1 : img.width), dy + 6 + Math.floor(Math.random() * 3), 1, 1);
        this.glow(c, dx + (flip ? 0 : img.width), dy + 7, 5, '#ffe082', 0.6);
      } else if (pr.act === 'hose' || pr.act === 'pump') {
        c.fillStyle = pr.act === 'hose' ? '#b3e5fc' : '#4fc3f7';
        for (let k = 0; k < 4; k++) c.fillRect(dx + (flip ? -3 - k * 2 : img.width + 1 + k * 2), dy + 5 + ((k + Math.floor(pr.t * 10)) % 3), 1, 1);
      } else if (pr.act === 'sleep' && Math.floor(pr.t * 0.8 + pr.id) % 4 === 0) {
        pxMini(c, 'z', dx + img.width, dy - 5, '#b0c4de', 'left', null);
      }
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

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) + ((((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
  const gg = ((pa >> 8) & 255) + ((((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
  const bl = (pa & 255) + (((pb & 255) - (pa & 255)) * t);
  return `#${[r, gg, bl].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
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
