import { moving, type Aboard, type Person } from '../game/aboard';
import { upgradeBlock } from '../game/actions';
import { DECK_OPEN_CC, MODULES, ROOF, TITAN_DECK_INFO, TITAN_LIFTS } from '../game/defs';
import type { Game } from '../game/game';
import { crewSummary } from '../game/systems/crewops';
import { compIndex, FUEL_MAX } from '../game/systems/titan';
import { CRUDE_MAX, refineRate } from '../game/systems/fuel';
import { armRoofOrder, cancelOrder, createOrder, MAX_ORDERS, mountKinds, planFetches, refitOrder, stepLabel, upgradeOrder, type OrderStep } from '../game/systems/workorders';
import type { ModuleInst } from '../game/tank';
import { type PoseHD } from '../render/px/people';
import { hero, heroFoot, roleForAct } from '../render/px/heroes';

/** Crew figures aboard are painted this many pixels square. */
const HERO_S = 36;
import { discAt, drawCorridor, drawRoom, glowAt, IA, type Slots } from '../render/px/interiorArt';
import { SHIP_ART, shipView } from '../render/px/shipArt';
import { drawService } from '../render/px/deckArt';
import { hash2 } from '../render/px/pixels';
import { WEAPONS } from '../shared/weapons';
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
  /** Its span across the cutaway (px): the stern end, the bow end. */
  xa: number;
  xb: number;
}

const { CELL, DH, ROOF_H, SKY, KEEL } = IA;

/**
 * The cutaway's outline: the Titan's own side (bow to the right). A long hull, its armoured glacis raking back from
 * the nose over the lower decks and the stern sloping away under the engine decks; the three decks of the
 * superstructure stepping in above the main deck, the bridge's windows raked back on the top one; open deck with
 * rails on every ledge. Per deck (1-7): where its bow and stern walls are at its ceiling and its floor, as fractions of
 * the length from the bow.
 */
const SHAPE: [number, number, number, number][] = [
  [0, 0, 0, 0],
  [0.36, 0.33, 0.655, 0.66],
  [0.33, 0.3, 0.7, 0.7],
  [0.3, 0.27, 0.755, 0.76],
  [0.17, 0.12, 0.855, 0.87],
  [0.12, 0.06, 0.87, 0.9],
  [0.06, 0.025, 0.9, 0.935],
  [0.025, 0.045, 0.935, 0.955],
];
/** The ship's length across the cutaway (px), and the room either side of her. */
const LEN = 940, MARGIN = 40;
/** The lift shafts (TITAN_LIFTS, bow to stern): where each runs (fraction from the bow) and the highest deck it reaches. */
const SHAFTS = [{ f: 0.205, top: 4 }, { f: 0.49, top: 1 }, { f: 0.695, top: 3 }];

/** The side-view sprite (bow on its left): its running gear (rows 120-162) goes under the cutaway. */
const SIDE = { w: 538, h: 162, keel: 120 } as const;

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
  /** The deck's own spaces drawn this frame (for their name plates). */
  private services: { deck: number; xa: number; xb: number; name: string }[] = [];
  /** The cutaway x of her bow; the deck's own spaces between the rooms, per deck; where walking people go, per deck. */
  private xBow = 0;
  /** The hover card, the crew as last drawn (for it), and a deck picked from the list, lit up for a moment. */
  private tip: HTMLDivElement;
  private ab: Aboard | null = null;
  private lit = { deck: -1, t: 0 };
  private spare: [number, number][][] = [];
  private walk: [number, number][][] = [];

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
    banner.style.transform = 'scaleX(-1)';
    banner.title = 'The whole ship (click to see all of her)';
    banner.style.cursor = 'pointer';
    banner.addEventListener('click', () => {
      this.zoom = 1;
      this.panX = this.panY = 0;
      this.act.sound('ui');
    });
    // Pick a deck in the list to go to it.
    this.secDecks.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-deck]');
      if (el) this.focusDeck(Number(el.dataset.deck));
    });
    this.tip = h('div', 'int-tip');
    this.panel.append(head, banner, this.secDecks, this.secRoom, this.secOrders, this.secDraft);
    this.root.append(this.cv, this.panel, this.tip);
    this.cv.addEventListener('pointerleave', () => {
      this.hover = 0;
      this.tip.style.display = 'none';
    });
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

  /* ---- The ship's shape ---- */

  /** The cutaway x a fraction `f` of her length from the bow. */
  private fx(f: number): number {
    return this.xBow - f * LEN;
  }

  /** Where a deck's bow (0) or stern (1) wall is at height `y` (its walls rake between its ceiling and floor). */
  private wall(deck: number, end: 0 | 1, y: number): number {
    const s = SHAPE[deck];
    const k = Math.max(0, Math.min(1, (y - this.deckTop(deck)) / DH));
    return this.fx(end === 0 ? s[0] + (s[1] - s[0]) * k : s[2] + (s[3] - s[2]) * k);
  }

  /** The stretch of a deck its rooms are laid along: [stern x, bow x], between its walls at half height. */
  private span(deck: number): [number, number] {
    const y = this.deckTop(deck) + DH / 2;
    return [this.wall(deck, 1, y), this.wall(deck, 0, y)];
  }

  /** Lift shaft `i` (bow to stern): [x0, x1]. */
  private shaft(i: number): [number, number] {
    const xb = Math.round(this.fx(SHAFTS[i].f));
    return [xb - 2 * CELL, xb];
  }

  private reaches(i: number, deck: number): boolean {
    return deck >= SHAFTS[i].top;
  }

  /** The top of the hull at `x`: the roof of the highest deck there (where the roof's guns and soldiers stand). */
  private roofAt(x: number): number {
    for (let d = 1; d <= 7; d++) {
      const y = this.deckTop(d);
      if (x >= this.wall(d, 1, y) - 0.5 && x <= this.wall(d, 0, y) + 0.5) return y;
    }
    return this.deckTop(7) + DH;
  }

  /** Her open decks: the top of the bridge deck and every ledge where the deck above steps in, as [x0, x1, y], bow first. */
  private ledges(): [number, number, number][] {
    const out: [number, number, number][] = [];
    for (let d = 1; d <= 7; d++) {
      const y = this.deckTop(d);
      const xs = this.wall(d, 1, y), xf = this.wall(d, 0, y);
      if (d === 1) {
        out.push([xs, xf, y]);
        continue;
      }
      const us = this.wall(d - 1, 1, y), uf = this.wall(d - 1, 0, y);
      if (xf - uf > 3) out.push([uf, xf, y]);
      if (us - xs > 3) out.push([xs, us, y]);
    }
    return out.sort((u, v) => v[1] - u[1]);
  }

  /** Where something `cy` cells from the bow on the roof is: along her open decks, bow to stern (never on a slope). */
  private roofX(cy: number, rows: number): number {
    const segs = this.ledges();
    const total = segs.reduce((sum, [a, b]) => sum + b - a, 0);
    let u = Math.max(0, Math.min(1, cy / rows)) * total;
    for (const [a, b] of segs) {
      if (u <= b - a) return b - u;
      u -= b - a;
    }
    return segs[segs.length - 1]?.[0] ?? this.fx(0.5);
  }

  /** Where someone walking a deck `cy` cells from the bow is drawn (following the rooms as they're laid out). */
  private walkX(deck: number, cy: number): number {
    const k = this.walk[deck];
    if (!k || k.length < 2) return this.fx(0.5);
    if (cy <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (cy <= k[i][0]) {
        const [c0, x0] = k[i - 1], [c1, x1] = k[i];
        return x0 + ((cy - c0) / (c1 - c0 || 1)) * (x1 - x0);
      }
    }
    return k[k.length - 1][1];
  }

  /** Her outline: up the bow deck by deck (ledges where the superstructure steps in), over the top, down the stern. */
  private hullPath(): Path2D {
    const path = new Path2D();
    const bot = (d: number): number => this.deckTop(d) + DH;
    path.moveTo(this.wall(7, 0, bot(7)), bot(7));
    for (let d = 7; d >= 1; d--) {
      path.lineTo(this.wall(d, 0, bot(d)), bot(d));
      path.lineTo(this.wall(d, 0, this.deckTop(d)), this.deckTop(d));
    }
    for (let d = 1; d <= 7; d++) {
      path.lineTo(this.wall(d, 1, this.deckTop(d)), this.deckTop(d));
      path.lineTo(this.wall(d, 1, bot(d)), bot(d));
    }
    path.closePath();
    return path;
  }

  /* ---------------------------------------------------------------- */
  /* Layout                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Lays the rooms out along each deck in the order they're built, bow to stern: they flow along the deck between her
   * walls, round the lift shafts that reach it, each as wide as its size allows (a Fallout-Shelter row of rooms
   * rather than a scale plan). What's left of a stretch is the deck's own space.
   */
  private layout(g: Game): void {
    const p = g.player;
    this.dio.width = LEN + MARGIN * 2;
    this.dio.height = SKY + ROOF_H + 7 * DH + KEEL;
    this.xBow = this.dio.width - MARGIN;
    this.placed.clear();
    this.roomsByDeck = [];
    this.spare = [];
    this.walk = [];
    const lifts = [...TITAN_LIFTS].sort((u, v) => u.cy - v.cy);
    for (let deck = 0; deck <= 7; deck++) {
      const mods = p.modules.filter((m) => m.deck === deck).sort((u, v) => u.cy - v.cy || u.cx - v.cx);
      const list: Placed[] = [];
      if (deck === ROOF) {
        for (const m of mods) {
          // The main battery's turret sits on top of the citadel, its gun out over the bow.
          if (m.key === 'main_gun') list.push({ m, xa: this.fx(0.5), xb: this.fx(0.4) });
          else list.push({ m, xa: this.roofX(m.cy + MODULES[m.key].h, p.rows), xb: this.roofX(m.cy, p.rows) });
        }
      } else {
        const [s0, s1] = this.span(deck);
        // The stretches between the shafts, bow first, as [x0, x1].
        const cuts = SHAFTS.map((_, i) => i).filter((i) => this.reaches(i, deck)).map((i) => this.shaft(i)).sort((u, v) => v[0] - u[0]);
        const segs: [number, number][] = [];
        let hi = s1;
        for (const [a, b] of cuts) {
          if (hi - b > 4) segs.push([b, hi]);
          hi = a;
        }
        if (hi - s0 > 4) segs.push([s0, hi]);
        const want = mods.map((m) => MODULES[m.key].h * CELL);
        const room = segs.reduce((sum, [a, b]) => sum + b - a, 0);
        const total = want.reduce((sum, w) => sum + w, 0) || 1;
        // Which stretch each room goes in, at a given scale (none if they don't all fit).
        const pack = (k: number): number[][] | null => {
          const out: number[][] = segs.map(() => []);
          let i = 0, x = segs[0]?.[1] ?? 0;
          for (let r = 0; r < want.length; r++) {
            const w = want[r] * k;
            while (i < segs.length && x - w < segs[i][0] - 0.5) {
              i++;
              x = segs[i]?.[1] ?? 0;
            }
            if (i >= segs.length) return null;
            out[i].push(r);
            x -= w;
          }
          return out;
        };
        let k = Math.min(3, room / total);
        let fit = pack(k);
        for (let tries = 0; !fit && tries < 60; tries++) fit = pack((k *= 0.95));
        const spare: [number, number][] = [];
        segs.forEach(([a, b], si) => {
          const rs = fit?.[si] ?? [];
          const used = rs.reduce((sum, r) => sum + want[r] * k, 0);
          // A sliver left over goes to the rooms; more is the deck's own space, astern of them.
          const kk = rs.length && b - a - used < 40 ? (b - a) / used : 1;
          let x = b;
          for (const r of rs) {
            const w = want[r] * k * kk;
            list.push({ m: mods[r], xa: x - w, xb: x });
            x -= w;
          }
          if (x - a >= 24) spare.push([a, x]);
        });
        this.spare[deck] = spare;
        // Walking the deck: from the cells people are at to the cutaway, through the rooms' and the shafts' places.
        const knots: [number, number][] = [[0, s1], [p.rows, s0]];
        for (const pl of list) knots.push([pl.m.cy + MODULES[pl.m.key].h / 2, (pl.xa + pl.xb) / 2]);
        lifts.forEach((l, i) => {
          if (!this.reaches(i, deck)) return;
          const [a, b] = this.shaft(i);
          knots.push([l.cy + 1, (a + b) / 2]);
        });
        knots.sort((u, v) => u[0] - v[0]);
        const mono: [number, number][] = [];
        for (const kn of knots) if (!mono.length || (kn[0] > mono[mono.length - 1][0] && kn[1] < mono[mono.length - 1][1])) mono.push(kn);
        this.walk[deck] = mono;
      }
      for (const pl of list) this.placed.set(pl.m.id, pl);
      this.roomsByDeck[deck] = list;
    }
    this.layoutFor = p.version;
    this.clampPan();
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
    if (!this.game) return 0;
    for (const pl of this.roomsByDeck[ROOF] ?? []) {
      const base = this.roofAt((pl.xa + pl.xb) / 2);
      if (dx >= pl.xa && dx < pl.xb && dy >= base - 34 && dy < base) return pl.m.id;
    }
    for (let deck = 1; deck <= 7; deck++) {
      const top = this.deckTop(deck);
      if (dy < top || dy >= top + DH) continue;
      for (const pl of this.roomsByDeck[deck] ?? []) if (dx >= pl.xa && dx < pl.xb) return pl.m.id;
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
    this.showTip(e.clientX, e.clientY);
  }

  /** The hover card for the room under the pointer: what it is, its crew, what they're doing, any work on it. */
  private showTip(cx: number, cy: number): void {
    const g = this.game;
    const m = this.hover && g ? g.player.moduleById(this.hover) : undefined;
    if (!g || !m) {
      this.tip.style.display = 'none';
      return;
    }
    const d = MODULES[m.key];
    const here = this.ab ? this.ab.people.filter((q) => q.mod === m.id && !moving(q)) : [];
    const acts: Record<string, number> = {};
    for (const q of here) acts[q.act] = (acts[q.act] ?? 0) + 1;
    const doing = Object.entries(acts).sort((u, v) => v[1] - u[1]).slice(0, 3).map(([a, n]) => `${n} ${ACT_NAME[a] ?? a}`).join(', ');
    const need = g.player.crewNeeded(m);
    const job = g.builds.find((b) => b.modId === m.id);
    const where = m.deck === ROOF ? 'Roof' : `${TITAN_DECK_INFO[m.deck].level} ${TITAN_DECK_INFO[m.deck].name}`;
    this.tip.innerHTML = `<b style="color:${CAT[d.cat] ?? '#b0bec5'}">${esc(d.name.toUpperCase())} L${m.lvl}</b><small>${esc(where)}</small>`
      + (need ? `<div><span>Staff</span>${m.crew} / ${need}</div>` : '')
      + `<div><span>Inside</span>${here.length ? esc(doing) : 'nobody right now'}</div>`
      + (m.weapon ? `<div><span>Gun</span>${esc(WEAPONS[m.weapon.key]?.name ?? m.weapon.key)} · ${esc(String(m.weapon.rarity))}</div>` : '')
      + (job ? `<div><span>Work</span>${job.order ? 'crew upgrading' : 'upgrading'} ${Math.round((job.t / job.total) * 100)}%</div>` : '')
      + '<em>Click for its orders</em>';
    this.tip.style.display = 'block';
    const w = this.tip.offsetWidth, hh = this.tip.offsetHeight;
    this.tip.style.left = `${Math.min(window.innerWidth - w - 8, cx + 16)}px`;
    this.tip.style.top = `${Math.min(window.innerHeight - hh - 8, cy + 14)}px`;
  }

  /** Zooms in on a deck and lights it up for a moment. */
  private focusDeck(deck: number): void {
    if (!this.game || !this.dio.width) return;
    const yc = deck === ROOF ? this.deckTop(1) - 20 : this.deckTop(deck) + DH / 2;
    const [a, b] = deck === ROOF ? [this.fx(0.95), this.fx(0.05)] : this.span(deck);
    this.zoom = 2;
    this.panX = (this.dio.width / 2 - (a + b) / 2) * this.zoom;
    this.panY = (this.dio.height / 2 - yc) * this.zoom;
    this.clampPan();
    this.lit = { deck, t: 1.8 };
    this.act.sound('ui');
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

  private bg: HTMLCanvasElement | null = null;

  /** The violet night behind the ship: a vertical gradient, a soft nebula and a pixel grid on the horizon. */
  private backdrop(): HTMLCanvasElement {
    if (this.bg && this.bg.width === this.W && this.bg.height === this.H) return this.bg;
    const b = document.createElement('canvas');
    b.width = this.W;
    b.height = this.H;
    const x = b.getContext('2d')!;
    const gr = x.createLinearGradient(0, 0, 0, this.H);
    gr.addColorStop(0, '#07051a');
    gr.addColorStop(0.55, '#1a0d3a');
    gr.addColorStop(1, '#2a0f4a');
    x.fillStyle = gr;
    x.fillRect(0, 0, this.W, this.H);
    for (const [cx, cy, r, col] of [[0.25, 0.3, 0.45, 'rgba(120,60,220,0.18)'], [0.75, 0.2, 0.35, 'rgba(40,160,255,0.12)'], [0.6, 0.8, 0.5, 'rgba(255,60,180,0.10)']] as [number, number, number, string][]) {
      const rg = x.createRadialGradient(cx * this.W, cy * this.H, 0, cx * this.W, cy * this.H, r * this.W);
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg;
      x.fillRect(0, 0, this.W, this.H);
    }
    // A perspective grid on the floor, fading up.
    const hz = Math.round(this.H * 0.78);
    x.strokeStyle = 'rgba(179,136,255,0.18)';
    x.lineWidth = 1;
    for (let k = 0; k < 10; k++) {
      const y = hz + Math.pow(k / 9, 1.8) * (this.H - hz);
      x.beginPath();
      x.moveTo(0, Math.round(y) + 0.5);
      x.lineTo(this.W, Math.round(y) + 0.5);
      x.stroke();
    }
    for (let k = -20; k <= 20; k++) {
      x.beginPath();
      x.moveTo(this.W / 2 + k * 30, hz);
      x.lineTo(this.W / 2 + k * 160, this.H);
      x.stroke();
    }
    this.bg = b;
    return b;
  }

  render(g: Game, ab: Aboard, dt: number): void {
    if (!this.isOpen) return;
    this.game = g;
    this.ab = ab;
    this.time += dt;
    this.lit.t = Math.max(0, this.lit.t - dt);
    const t0 = this.time;
    if (this.layoutFor !== g.player.version || !this.dio.width) this.layout(g);
    this.paint(g, ab);
    const c = this.x;
    c.imageSmoothingEnabled = false;
    // Backdrop: deep violet night with a drifting starfield and a nebula glow (the neon station-cutaway look).
    c.drawImage(this.backdrop(), 0, 0);
    for (let i = 0; i < 90; i++) {
      const sx = (hash2(i, 1, 5) * this.W + t0 * (2 + hash2(i, 2, 5) * 6)) % this.W;
      const sy = hash2(i, 3, 5) * this.H;
      const tw = Math.sin(t0 * (1 + hash2(i, 4, 5) * 3) + i) > 0.6;
      c.fillStyle = tw ? '#ffffff' : i % 3 ? '#8a7fd0' : '#5ad8ff';
      c.fillRect(Math.round(sx), Math.round(sy), i % 11 === 0 ? 2 : 1, i % 11 === 0 ? 2 : 1);
    }
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
    const W = this.dio.width, H = this.dio.height;
    const t = this.time;
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;
    const bottom = this.deckTop(7) + DH;
    this.slots.clear();
    this.services = [];
    const hull = this.hullPath();
    // The running gear under her, the dark of her insides, then every deck clipped to her outline.
    this.runningGear(c, g, bottom);
    c.fillStyle = '#0a0c11';
    c.fill(hull);
    c.save();
    c.clip(hull);

    /* ---- Decks: the Spine, the deck's own spaces, the rooms ---- */
    for (let deck = 1; deck <= 7; deck++) {
      const y0 = this.deckTop(deck);
      const info = TITAN_DECK_INFO[deck];
      const open = p.deckOpen(deck);
      const xl = Math.floor(Math.min(this.wall(deck, 1, y0), this.wall(deck, 1, y0 + DH))) - 6;
      const xr = Math.ceil(Math.max(this.wall(deck, 0, y0), this.wall(deck, 0, y0 + DH))) + 6;
      drawCorridor(c, xl, y0, xr - xl, DH, info.color, t, open);
      for (const [a, b] of this.spare[deck] ?? []) {
        const xa = Math.round(a) + 1, xb = Math.round(b) - 1;
        const name = drawService(c, deck, xa, y0, xb - xa, DH, t, deck * 5 + Math.round(a / CELL), info.color, open);
        if (open) this.services.push({ deck, xa, xb, name });
      }
      if (open) for (const pl of this.roomsByDeck[deck] ?? []) {
        const xa = Math.round(pl.xa) + 1, xb = Math.round(pl.xb) - 1;
        if (xb - xa < 6) continue;
        const d = MODULES[pl.m.key];
        const job = g.builds.find((b) => b.modId === pl.m.id);
        const sl = drawRoom({ c, m: pl.m, x0: xa, y0, w: xb - xa, h: DH, t, speed: p.speed, job: job ? { f: job.t / job.total, order: !!job.order } : null, accent: CAT[d.cat] ?? '#78909c', fuel: { drill: g.titan.drill, crude: g.titan.crude / CRUDE_MAX, refining: refineRate(g) > 0 && g.titan.crude > 0 && g.titan.fuel < FUEL_MAX } });
        this.slots.set(pl.m.id, sl);
        // Door frames either side.
        c.fillStyle = '#0b0d11';
        c.fillRect(xa - 1, y0, 1, DH);
        c.fillRect(xb, y0, 1, DH);
        c.fillStyle = '#3a4250';
        c.fillRect(xa - 2, y0, 1, DH);
        c.fillRect(xb + 1, y0, 1, DH);
      }
      // The deck slab under it, and the deck's colour on its stern bulkhead.
      c.fillStyle = '#10141a';
      c.fillRect(xl, y0 + DH - 1, xr - xl, 2);
      c.fillStyle = info.color;
      c.fillRect(Math.round(this.wall(deck, 1, y0 + DH / 2)) + 5, y0 + 5, 3, DH - 12);
      // Fire and flooding, by compartment (bow, midships, stern).
      const [sa, sb] = this.span(deck);
      for (let sec = 0; sec < 3; sec++) {
        const i = compIndex(deck, sec);
        const f = g.titan.fire[i] ?? 0, fl = g.titan.flood[i] ?? 0;
        const xa = sb - ((sec + 1) * (sb - sa)) / 3, xb = sb - (sec * (sb - sa)) / 3;
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
    // The lift shafts down through the decks they reach, the cars riding.
    SHAFTS.forEach((sh, i) => {
      const [xa, xb] = this.shaft(i);
      const top = this.deckTop(sh.top);
      c.fillStyle = '#07090c';
      c.fillRect(xa, top, xb - xa, bottom - top);
      c.fillStyle = '#2a303a';
      c.fillRect(xa, top, 2, bottom - top);
      c.fillRect(xb - 2, top, 2, bottom - top);
      c.fillStyle = '#3a4250';
      c.fillRect(Math.round((xa + xb) / 2), top, 1, bottom - top);
      for (let deck = sh.top; deck <= 7; deck++) {
        c.fillStyle = '#e0b020';
        c.fillRect(xa + 2, this.deckTop(deck) + DH - 3, xb - xa - 4, 1);
      }
      const ph = (Math.sin(t * 0.35 + i * 3.1) + 1) / 2;
      const cy = Math.round(top + ph * (bottom - top - DH));
      c.fillStyle = '#0b0d11';
      c.fillRect(xa + 2, cy + 1, xb - xa - 4, DH - 2);
      c.fillStyle = '#5a6270';
      c.fillRect(xa + 3, cy + 2, xb - xa - 6, DH - 4);
      c.fillStyle = '#2a3038';
      c.fillRect(xa + 5, cy + 6, xb - xa - 10, DH - 12);
      c.fillStyle = '#e0b020';
      c.fillRect(xa + 3, cy + 2, xb - xa - 6, 1);
      glowAt(c, (xa + xb) / 2, cy + 6, 12, '#ffe0a0', 0.3);
    });
    // Sealed decks say so.
    for (let deck = 1; deck <= 7; deck++) {
      if (p.deckOpen(deck)) continue;
      const y0 = this.deckTop(deck);
      const [sa, sb] = this.span(deck);
      const msg = `SEALED: OPENS WITH THE TITAN MK ${['I', 'II', 'III', 'IV', 'V', 'VI'][(DECK_OPEN_CC[deck] ?? 1) - 1]} REFIT`;
      const tw = msg.length * 4 + 8;
      c.fillStyle = '#0b0d11';
      c.fillRect(Math.round((sa + sb) / 2 - tw / 2), y0 + DH / 2 - 6, tw, 13);
      pxMini(c, msg, (sa + sb) / 2, y0 + DH / 2 - 2, '#8a8e96', 'center');
    }
    c.restore();

    /* ---- Her armour round the cut, the open decks, the guns on the roof ---- */
    this.drawHull(c, g, hull, bottom);

    /* ---- The crew, then the roof's guns in front of their crews ---- */
    this.drawCrew(c, g, ab);
    this.drawJourneys(c, g, ab);
    for (const pl of this.roomsByDeck[ROOF] ?? []) this.roofGun(c, g, pl, this.roofAt((pl.xa + pl.xb) / 2) - 4);

    // The deck's own spaces are named too (dimmer than your rooms).
    for (const sv of this.services) {
      const y = this.deckTop(sv.deck) + 7;
      if (sv.xb - sv.xa < sv.name.length * 4 + 8) continue;
      c.fillStyle = 'rgba(8,10,14,0.6)';
      c.fillRect(sv.xa + 2, y, sv.name.length * 4 + 3, 8);
      pxMini(c, sv.name, sv.xa + 4, y + 1, '#9aa8b8', 'left', null);
    }
    // Room name plates, and the selection.
    for (let deck = 1; deck <= 7; deck++) {
      if (!p.deckOpen(deck)) continue;
      for (const pl of this.roomsByDeck[deck] ?? []) {
        const xa = Math.round(pl.xa) + 1, xb = Math.round(pl.xb) - 1;
        const name = `${MODULES[pl.m.key].name.toUpperCase()} ${pl.m.lvl}`;
        const max = Math.floor((xb - xa - 6) / 4);
        if (max < 4) continue;
        const label = name.length > max ? name.slice(0, max) : name;
        c.fillStyle = 'rgba(8,10,14,0.75)';
        c.fillRect(xa + 2, this.deckTop(deck) + 7, label.length * 4 + 3, 8);
        pxMini(c, label, xa + 4, this.deckTop(deck) + 8, '#d8e4f0', 'left', null);
      }
    }
    if (this.lit.t > 0 && this.lit.deck >= 0) {
      const d = this.lit.deck;
      const on = Math.floor(this.lit.t * 6) % 2 === 0;
      c.strokeStyle = on ? TITAN_DECK_INFO[d].color : 'rgba(255,255,255,0.5)';
      c.lineWidth = 2;
      if (d === ROOF) for (const [a, b, y] of this.ledges()) c.strokeRect(Math.round(a) + 1, y - 44, Math.round(b - a) - 2, 42);
      else {
        const [a, b] = this.span(d);
        c.strokeRect(Math.round(a) + 1, this.deckTop(d) + 1, Math.round(b - a) - 2, DH - 2);
      }
    }
    for (const id of [this.hover, this.selected]) {
      const pl = id ? this.placed.get(id) : undefined;
      if (!pl) continue;
      const roof = pl.m.deck === ROOF;
      const y0 = roof ? this.roofAt((pl.xa + pl.xb) / 2) - 34 : this.deckTop(pl.m.deck), bh = roof ? 30 : DH;
      c.strokeStyle = id === this.selected ? '#ffd740' : 'rgba(255,255,255,0.7)';
      c.lineWidth = 1;
      c.strokeRect(Math.round(pl.xa) + 0.5, y0 + 0.5, Math.round(pl.xb - pl.xa) - 1, bh - 1);
    }
  }

  /**
   * Her hull round the cut: the heavy armour rim along her outline (thickest on the glacis), open deck on every ledge
   * where the superstructure steps in (plating, a neon strip, rails), the bridge's raked windows and the ports on the
   * decks below it, headlights and the grille on the nose, the exhausts at the stern, a mast with its beacon.
   */
  private drawHull(c: CanvasRenderingContext2D, g: Game, hull: Path2D, bottom: number): void {
    const p = g.player;
    const t = this.time;
    const top = (d: number): number => this.deckTop(d), bot = (d: number): number => this.deckTop(d) + DH;
    const R = (x: number, y: number, w: number, h: number, col: string): void => {
      c.fillStyle = col;
      c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    };
    const line = (x0: number, y0: number, x1: number, y1: number, w: number, col: string): void => {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    };
    c.save();
    c.lineJoin = 'miter';
    c.lineCap = 'butt';
    // The glacis: extra armour on the hull decks' bow walls, with plate seams across it.
    for (let d = 4; d <= 7; d++) {
      const xa = this.wall(d, 0, top(d)), xb = this.wall(d, 0, bot(d));
      line(xa + 3, top(d), xb + 3, bot(d), 10, '#06080c');
      line(xa + 3, top(d), xb + 3, bot(d), 7, '#343b47');
      line(xa + 6, top(d), xb + 6, bot(d), 1, '#5a6578');
      for (let k = 0.25; k < 1; k += 0.25) {
        const x = xa + (xb - xa) * k, y = top(d) + DH * k;
        line(x - 1, y, x + 7, y, 1, '#1a1e26');
      }
    }
    // The rim all round.
    for (const [w, col] of [[8, '#06080c'], [5, '#2c323d'], [2, '#4a5466']] as [number, string][]) {
      c.lineWidth = w;
      c.strokeStyle = col;
      c.stroke(hull);
    }
    c.restore();
    // Open deck on every ledge: plating, a neon strip that runs, rails.
    for (const [a, b, y] of this.ledges()) {
      R(a, y - 4, b - a, 4, '#313946');
      R(a, y - 4, b - a, 1, '#8fa3c2');
      for (let x = a + 3; x < b - 8; x += 14) R(x, y - 2, 8, 1, Math.floor(t * 4 - x * 0.05) % 9 ? '#3ab4ff' : '#1a4a6a');
      // Rails.
      R(a + 1, y - 10, b - a - 2, 1, '#5a6474');
      for (let x = a + 2; x < b - 1; x += 7) R(x, y - 10, 1, 6, '#48505e');
    }
    // The bridge's raked windows across the top deck's bow wall; ports on the decks below it.
    {
      const d = 1;
      const x0 = this.wall(d, 0, top(d) + 9), x1 = this.wall(d, 0, top(d) + 27);
      line(x0 + 1, top(d) + 9, x1 + 1, top(d) + 27, 5, '#0e1a22');
      line(x0 + 1, top(d) + 9, x1 + 1, top(d) + 27, 3, '#5ad0f0');
      for (let k = 1; k < 3; k++) {
        const y = top(d) + 9 + k * 6;
        R(this.wall(d, 0, y) - 2, y, 5, 1, '#0e1a22');
      }
      glowAt(c, (x0 + x1) / 2 + 6, top(d) + 18, 22, '#60d0ff', 0.35);
    }
    for (const d of [2, 3]) {
      const y = top(d) + DH / 2 - 3;
      const x = this.wall(d, 0, y);
      R(x - 2, y, 4, 5, '#0e1a22');
      R(x - 1, y + 1, 2, 3, '#ffd080');
      const xs = this.wall(d, 1, y);
      R(xs - 2, y, 4, 5, '#0e1a22');
      R(xs - 1, y + 1, 2, 3, '#ffd080');
    }
    // Headlights and the grille low on the nose; running lights.
    {
      const y = top(6) + 16;
      const x = this.wall(6, 0, y) + 5;
      for (const dy of [0, 8]) {
        R(x, y + dy, 4, 3, '#fff6d8');
        glowAt(c, x + 3, y + dy + 1, 14, '#fff3c4', 0.75);
      }
      const gy = top(7) + 10;
      const gx = this.wall(7, 0, gy) - 2;
      R(gx - 4, gy, 12, 18, '#06080c');
      for (let k = 0; k < 5; k++) R(gx - 3 + k * 2, gy + 1, 1, 16, '#48505e');
      const bl = Math.floor(t * 2) % 2 === 0;
      R(this.wall(4, 0, top(4) + 4) + 2, top(4) + 4, 2, 2, bl ? '#40ff80' : '#104020');
      R(this.wall(4, 1, top(4) + 4) - 4, top(4) + 4, 2, 2, bl ? '#ff3a30' : '#401010');
    }
    // Exhausts out of the stern, glowing when she's working.
    const hot = Math.abs(p.speed) > 1 || g.helm.overdrive;
    for (const d of [4, 5, 6]) {
      const y = top(d) + DH / 2;
      const x = this.wall(d, 1, y);
      R(x - 9, y - 3, 8, 6, '#06080c');
      R(x - 8, y - 2, 7, 4, '#3a3230');
      discAt(c, x - 9, y, 2.5, g.helm.overdrive ? (Math.sin(t * 30 + d) > 0 ? '#ffd060' : '#ff7a00') : hot ? '#ff8a30' : '#3a2010');
      if (hot) glowAt(c, x - 11, y, g.helm.overdrive ? 22 : 12, '#ff9100', g.helm.overdrive ? 0.9 : 0.5);
    }
    // A mast at the back of the bridge deck, its beacon, and an aerial by the bridge.
    {
      const y = top(1) - 4;
      const x = this.wall(1, 1, top(1)) + 26;
      R(x, y - 30, 1, 30, '#8a95a6');
      R(x - 5, y - 22, 11, 1, '#8a95a6');
      R(x - 3, y - 14, 7, 1, '#8a95a6');
      if (Math.floor(t * 1.5) % 2 === 0) {
        R(x, y - 31, 1, 1, '#ff3a30');
        glowAt(c, x, y - 31, 7, '#ff3a30', 0.8);
      }
      const ax = this.wall(1, 0, top(1)) - 14;
      R(ax, y - 18, 1, 18, '#6a7488');
      R(ax - 1, y - 19, 3, 1, '#9aa4b8');
    }
    void bottom;
  }

  /**
   * The running gear under her, from the side sprite (its three bogies, the road wheels, the skirts): the belts running
   * with her speed and the near-side toroids spinning in their neon rings. Plain treads until the sprite has loaded.
   */
  private runningGear(c: CanvasRenderingContext2D, g: Game, bottom: number): void {
    const p = g.player;
    const t = this.time;
    const img = shipView('side', 'main');
    const x0 = this.fx(0), kx = LEN / SIDE.w;
    if (img) {
      c.save();
      c.imageSmoothingEnabled = false;
      c.translate(Math.round(x0), 0);
      c.scale(-kx, 1);
      c.drawImage(img, 0, SIDE.keel - 3, SIDE.w, SIDE.h - SIDE.keel + 3, 0, bottom - 3, SIDE.w, KEEL + 3);
      c.restore();
    } else {
      c.fillStyle = '#07090d';
      c.fillRect(Math.round(this.fx(0.95)), bottom, Math.round(0.9 * LEN), KEEL - 10);
    }
    // Belts running (links sliding along the bottom run), faster with speed.
    const run = t * p.speed * 2.2;
    const yb = bottom + Math.round(((146 - SIDE.keel) / (SIDE.h - SIDE.keel)) * KEEL);
    const xa = x0 - 520 * kx, xb = x0 - 170 * kx;
    for (let x = xa + (((run % 6) + 6) % 6); x < xb; x += 6) {
      c.fillStyle = '#4a5466';
      c.fillRect(Math.round(x), yb, 3, 1);
    }
    // The near-side toroids (fore and aft), ringed in neon, spinning with their push.
    const hm = g.helm;
    for (const [i, xs] of [[0, 34], [2, 500]] as [number, number][]) {
      const x = x0 - xs * kx, y = bottom - 10;
      const on = hm.toroids[i] && g.titan.toroids[i] > 0.1;
      const k = on ? 0.35 + 0.65 * p.spool : 0;
      discAt(c, x, y, 13, '#0b0d14');
      discAt(c, x, y, 11, '#2a3040');
      discAt(c, x, y, 6, on ? '#18ffff' : '#301018');
      discAt(c, x, y, 3, on ? '#e8ffff' : '#200a10');
      for (let q = 0; q < 6; q++) {
        const a = t * (1 + 8 * k) + (q * Math.PI) / 3;
        c.fillStyle = '#6a7690';
        c.fillRect(Math.round(x + Math.cos(a) * 9), Math.round(y + Math.sin(a) * 9), 2, 2);
      }
      if (on) glowAt(c, x, y, 18 + 16 * k, '#18ffff', 0.35 + 0.4 * k);
    }
  }

  /** A roof gun or nest from the side. */
  private roofGun(c: CanvasRenderingContext2D, g: Game, pl: Placed, base: number): void {
    const p = g.player;
    const m = pl.m;
    const d = MODULES[m.key];
    const xa = pl.xa, xb = pl.xb;
    const cx = (xa + xb) / 2;
    if (d.hardpoint || m.key === 'pad' || m.key === 'main_gun') {
      const big = m.key === 'main_gun' ? 2.4 : d.hardpoint === 'heavy' ? 1.35 : d.hardpoint === 'medium' ? 1.05 : 0.8;
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
  /**
   * Work crews you've sent: each one picked out with a pulsing ring, and their way through the ship drawn ahead of
   * them, along the decks and up and down the lifts, to a marker on the job with what they're doing there.
   */
  private drawJourneys(c: CanvasRenderingContext2D, g: Game, ab: Aboard): void {
    const p = g.player;
    const rows = p.rows;
    const at = (deck: number, cx: number, cy: number): [number, number] => {
      void cx;
      const x = deck === ROOF ? this.roofX(cy, rows) : this.walkX(deck, cy);
      return [x, deck === ROOF ? this.roofAt(x) - 12 : this.deckTop(deck) + DH - 12];
    };
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    for (const o of g.orders) {
      const crew = ab.people.filter((q) => q.order === o.id);
      if (!crew.length) continue;
      const lead = crew[0];
      const col = '#ff4fd8';
      // The way ahead: from where the leader is now, waypoint by waypoint, to the job.
      const pts: [number, number][] = [at(lead.deck, lead.x, lead.y)];
      for (const w of lead.path) pts.push(at(w.deck, w.x, w.y));
      const end = at(o.dest.deck, o.dest.x, o.dest.y);
      if (Math.hypot(pts[pts.length - 1][0] - end[0], pts[pts.length - 1][1] - end[1]) > 2) pts.push(end);
      if (pts.length > 1) {
        c.save();
        c.strokeStyle = col;
        c.lineWidth = 2;
        c.setLineDash([5, 4]);
        c.lineDashOffset = -this.time * 18;
        c.shadowColor = col;
        c.shadowBlur = 6;
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          // Along a deck, or straight up or down a lift.
          if (Math.abs(pts[i][1] - pts[i - 1][1]) > 4) c.lineTo(pts[i - 1][0], pts[i][1]);
          c.lineTo(pts[i][0], pts[i][1]);
        }
        c.stroke();
        c.restore();
      }
      // The job: a marker and what they're at.
      c.save();
      c.fillStyle = col;
      c.globalAlpha = 0.6 + 0.4 * pulse;
      c.beginPath();
      c.moveTo(end[0], end[1] - 14);
      c.lineTo(end[0] + 5, end[1] - 8);
      c.lineTo(end[0], end[1] - 2);
      c.lineTo(end[0] - 5, end[1] - 8);
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
      const label = `${o.name.toUpperCase()} · ${o.status.toUpperCase()}`.slice(0, 58);
      c.fillStyle = 'rgba(10,6,14,0.85)';
      c.fillRect(Math.round(end[0] - label.length * 2.1 - 3), Math.round(end[1] - 26), Math.round(label.length * 4.2 + 6), 9);
      pxMini(c, label, end[0], end[1] - 25, col, 'center', null);
      // Each of the crew, ringed (a lift ride shows as a marker at the shaft).
      for (const q of crew) {
        const [x, y] = at(q.deck, q.x, q.y);
        c.strokeStyle = col;
        c.lineWidth = 1.5;
        c.globalAlpha = 0.5 + 0.5 * pulse;
        c.beginPath();
        c.ellipse(x, y + 9, 7 + pulse * 2, 3 + pulse, 0, 0, Math.PI * 2);
        c.stroke();
        if (q.ride > 0) pxMini(c, 'LIFT', x, y - 22, col, 'center', null);
      }
      c.globalAlpha = 1;
      const [lx, ly] = at(lead.deck, lead.x, lead.y);
      pxMini(c, `CREW ${o.n}`, lx, ly - 30, col, 'center', null);
      c.restore();
    }
  }

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
      const img = hero({ role: roleForAct(pr.act, pr.id), seed: pr.id, color: pr.color }, pose, Math.floor(pr.t * 7), HERO_S);
      const flip = pr.dir < 0;
      const ft = heroFoot(HERO_S);
      const dx = Math.round(flip ? x - (img.width - ft.x) : x - ft.x), dy = Math.round(floor - ft.y);
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
      const xa = Math.round(pl.xa) + 2, xb = Math.round(pl.xb) - 2;
      const floor = pl.m.deck === ROOF ? this.roofAt((pl.xa + pl.xb) / 2) - 4 : this.deckTop(pl.m.deck) + DH - 3;
      const sl = this.slots.get(id);
      const sleepers = list.filter((q) => q.act === 'sleep');
      const eaters = list.filter((q) => q.act === 'eat');
      const rest = list.filter((q) => q.act !== 'sleep' && q.act !== 'eat');
      sleepers.slice(0, sl?.beds.length ?? 0).forEach((q, i) => {
        const b = sl!.beds[i];
        const img = hero({ role: roleForAct('sleep', q.id), seed: q.id, color: q.color }, 'sleep', 0, HERO_S);
        c.drawImage(img, Math.round(b.x - img.width / 2), Math.round(b.y - img.height + 5));
        if (Math.floor(this.time * 0.7 + q.id) % 5 === 0) pxMini(c, 'z', b.x + 8, b.y - 12, '#b0c4de', 'left', null);
      });
      eaters.slice(0, sl?.seats.length ?? 0).forEach((q, i) => draw(q, sl!.seats[i].x, floor, 'sit'));
      // Everyone else across the room (at its machines first), as many as fit; the rest are a number on the door.
      const fit = Math.max(1, Math.floor((xb - xa) / 13));
      const shown = rest.slice(0, fit);
      shown.forEach((q, i) => {
        const post = sl?.posts[i];
        const x = post && i < (sl?.posts.length ?? 0) ? post.x : xa + ((i + 0.5) / shown.length) * (xb - xa);
        draw(q, x, floor, poseHD(q));
      });
      const hidden = rest.length - shown.length + Math.max(0, sleepers.length - (sl?.beds.length ?? 0)) + Math.max(0, eaters.length - (sl?.seats.length ?? 0));
      if (hidden > 0) {
        const lab = `+${hidden}`;
        const y0 = pl.m.deck === ROOF ? floor - 44 : this.deckTop(pl.m.deck) + 17;
        c.fillStyle = 'rgba(8,10,14,0.85)';
        c.fillRect(xb - lab.length * 4 - 4, y0, lab.length * 4 + 3, 8);
        pxMini(c, lab, xb - 2, y0 + 1, '#ffd740', 'right', null);
      }
    }
    for (const pr of loose) {
      if (pr.deck !== ROOF && !p.deckOpen(pr.deck)) continue;
      const x = pr.deck === ROOF ? this.roofX(pr.y, rows) : this.walkX(pr.deck, pr.y);
      const floor = pr.deck === ROOF ? this.roofAt(x) - 4 : this.deckTop(pr.deck) + DH - 3;
      draw(pr, x, floor, moving(pr) ? 'walk' : poseHD(pr));
    }
    // Off-duty hands in the deck's own spaces: one or two each, pottering about and pausing at things.
    const OFF = ['#5a7a9a', '#7a8a5a', '#8a6a5a', '#6a6a8a', '#9a8a6a', '#5a8a8a'];
    for (const sv of this.services) {
      const floor = this.deckTop(sv.deck) + DH - 3;
      const n = sv.xb - sv.xa > 110 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const seed = sv.deck * 31 + Math.round(sv.xa) + k * 7;
        const span = Math.max(4, sv.xb - sv.xa - 18);
        const ph = this.time * (0.12 + 0.08 * hash2(seed, 1)) + hash2(seed, 2) * 6.28;
        const x = sv.xa + 9 + ((Math.sin(ph) + 1) / 2) * span;
        const still = Math.abs(Math.cos(ph)) < 0.3;
        const pose: PoseHD = still ? (hash2(seed, 3) > 0.5 ? 'type' : 'stand') : 'walk';
        const img = hero({ role: seed % 3 === 0 ? 'deckhand' : 'crew', seed, color: OFF[seed % OFF.length] }, pose, Math.floor(this.time * 7 + seed), HERO_S);
        const ft = heroFoot(HERO_S);
        const left = Math.cos(ph) < 0;
        const dx = Math.round(left ? x - (img.width - ft.x) : x - ft.x), dy = Math.round(floor - ft.y);
        if (left) {
          c.save();
          c.translate(dx + img.width, dy);
          c.scale(-1, 1);
          c.drawImage(img, 0, 0);
          c.restore();
        } else c.drawImage(img, dx, dy);
      }
    }
    // The builder robots: hauling crates along the decks and stopping to work on things.
    const opn = this.services.filter((sv) => p.deckOpen(sv.deck));
    for (let i = 0; i < g.robots && opn.length; i++) {
      const sv = opn[(i * 3) % opn.length];
      const floor = this.deckTop(sv.deck) + DH - 3;
      const span = Math.max(4, sv.xb - sv.xa - 18);
      const ph = this.time * 0.16 + i * 1.9;
      const x = sv.xa + 9 + ((Math.sin(ph) + 1) / 2) * span;
      const still = Math.abs(Math.cos(ph)) < 0.25;
      const img = hero({ role: 'robot', seed: i * 5 + 1 }, still ? 'work' : 'carry', Math.floor(this.time * 7 + i), HERO_S);
      const ft = heroFoot(HERO_S);
      const left = Math.cos(ph) < 0;
      const dx = Math.round(left ? x - (img.width - ft.x) : x - ft.x), dy = Math.round(floor - ft.y);
      c.save();
      if (left) {
        c.translate(dx + img.width, dy);
        c.scale(-1, 1);
        c.drawImage(img, 0, 0);
      } else c.drawImage(img, dx, dy);
      c.restore();
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
      decks += `<div class="int-deck" data-deck="${deck}" title="Go to this deck"><i style="background:${info.color}"></i><span>${esc(info.level)} ${esc(info.name)}</span><b>${per[deck]}</b></div>`;
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
