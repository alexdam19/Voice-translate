import { CREW_SCALE, MODULES, STAFF, TITAN_LIFTS, type Dept } from './defs';
import type { Game } from './game';
import type { ModuleInst } from './tank';

/**
 * Everyone aboard, one by one. The game counts crew by the head (so many gunners on this gun, so many engineers in
 * that engine room); this turns the counts into people you can watch: each has a place to be (a post, a bunk, a
 * seat in the mess, a spot on a repair job or a work order), walks there along the Spine, rides the lifts between
 * decks, and does what that place is for when they get there. It only drives what the interior views show; the
 * numbers that matter live in the game.
 *
 * Positions are in deck cells (x across the hull 0..cols, y bow to stern 0..rows); deck 0 is the roof.
 */

export type Act = 'work' | 'gun' | 'soldier' | 'engine' | 'console' | 'medic' | 'cook' | 'weld' | 'haul' | 'mechanic' | 'build' | 'sleep' | 'eat' | 'idle' | 'drill' | 'hose' | 'pump' | 'fix' | 'carry';

export interface Waypoint {
  deck: number;
  x: number;
  y: number;
  /** Ride the lift to this waypoint's deck. */
  ride?: boolean;
}

export interface Person {
  id: number;
  slot: string;
  deck: number;
  x: number;
  y: number;
  path: Waypoint[];
  /** What they do when they get there. */
  act: Act;
  /** Department colour. */
  color: string;
  /** Carrying a crate (work orders). */
  carry: string | null;
  /** Seconds left in a lift ride. */
  ride: number;
  /** Facing along the hull: +1 toward the stern, -1 toward the bow. */
  dir: number;
  /** Animation clock (desynchronised per person). */
  t: number;
  /** The module they're at (for the side view's room mapping), or 0. */
  mod: number;
}

/** Walking pace (cells per second) and lift time per deck (s). Shared with the work orders' timing. */
export const WALK = 1.25;
export const RIDE = 0.8;
/** The Spine: the corridor down the middle of every deck. */
export const SPINE_X = 9;

const DEPT_COL: Record<Dept | 'reserve' | 'off' | 'team' | 'order', string> = {
  gunnery: '#ff5a3c', roof: '#9ccc65', engine: '#ffc83c', command: '#40d0e8', medical: '#f0f0f0', galley: '#b08a6a', works: '#ff9a2a',
  science: '#d080ff', hangar: '#70b0ff', reserve: '#b8a878', off: '#8a9aaa', team: '#c6ff00', order: '#ff4fd8',
};

export function actForModule(m: ModuleInst): Act {
  const d = MODULES[m.key];
  if (d.hardpoint) return 'gun';
  if (d.nest) return 'soldier';
  switch (m.key) {
    case 'engine': case 'ion_engine': case 'reactor': case 'fission': case 'shield': return 'engine';
    case 'bridge': case 'radar': case 'science_lab': case 'arcane_sanctum': return 'console';
    case 'medbay': return 'medic';
    case 'mess_hall': case 'hydroponics': return 'cook';
    case 'workshop': case 'forge': case 'refinery': case 'repair_bay': case 'ammo_depot': return 'weld';
    case 'drill_mk2': case 'drill_mk3': return 'drill';
    case 'cargo': case 'vault': return 'haul';
    case 'garage': case 'drone_bay': case 'jet_hangar': case 'mech_bay': case 'tank_bay': return 'mechanic';
    case 'training_grounds': return 'idle';
    default: return 'work';
  }
}

function deptOf(m: ModuleInst): Dept {
  const d = MODULES[m.key];
  if (d.hardpoint) return 'gunnery';
  if (d.nest) return 'roof';
  return STAFF[m.key]?.[0] ?? 'works';
}

/** `n` spots spread over a building's floor (cells), in rows. */
export function spotsIn(m: ModuleInst, n: number): { x: number; y: number }[] {
  const d = MODULES[m.key];
  const out: { x: number; y: number }[] = [];
  if (n <= 0) return out;
  const cols = Math.max(1, Math.min(n, Math.round(d.w * 1.6)));
  const rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push({ x: m.cx + 0.3 + ((c + 0.5) / cols) * (d.w - 0.6), y: m.cy + 0.3 + ((r + 0.5) / rows) * (d.h - 0.6) });
  }
  return out;
}

/** The lift nearest a row along the hull. */
export function nearestLift(y: number): { x: number; y: number } {
  let best = TITAN_LIFTS[0], bd = Infinity;
  for (const l of TITAN_LIFTS) {
    const d = Math.abs(l.cy + 1 - y);
    if (d < bd) {
      bd = d;
      best = l;
    }
  }
  return { x: best.cx + 1, y: best.cy + 1 };
}

/** The way from one place aboard to another: out to the Spine, along it, up or down a lift, and in. */
export function route(fromDeck: number, fx: number, fy: number, toDeck: number, tx: number, ty: number): Waypoint[] {
  if (fromDeck === toDeck) {
    if (Math.abs(fy - ty) < 2.5 && Math.abs(fx - tx) < 4) return [{ deck: toDeck, x: tx, y: ty }];
    return [{ deck: fromDeck, x: SPINE_X, y: fy }, { deck: fromDeck, x: SPINE_X, y: ty }, { deck: toDeck, x: tx, y: ty }];
  }
  const l = nearestLift((fy + ty) / 2);
  return [
    { deck: fromDeck, x: SPINE_X, y: fy }, { deck: fromDeck, x: SPINE_X, y: l.y }, { deck: fromDeck, x: l.x, y: l.y },
    { deck: toDeck, x: l.x, y: l.y, ride: true }, { deck: toDeck, x: SPINE_X, y: l.y }, { deck: toDeck, x: SPINE_X, y: ty }, { deck: toDeck, x: tx, y: ty },
  ];
}

/** How long that walk takes (the work orders use the same pace the people walk at). */
export function routeTime(fromDeck: number, fx: number, fy: number, toDeck: number, tx: number, ty: number): number {
  let t = 0, x = fx, y = fy;
  for (const w of route(fromDeck, fx, fy, toDeck, tx, ty)) {
    if (w.ride) t += Math.abs(toDeck - fromDeck) * RIDE;
    t += (Math.abs(w.x - x) + Math.abs(w.y - y)) / WALK;
    x = w.x;
    y = w.y;
  }
  return t;
}

/** Row at the middle of a section (bow, midships, stern) of a hull `rows` long. */
export const sectionRow = (sec: number, rows: number): number => ((sec + 0.5) / 3) * rows;

interface Slot {
  key: string;
  deck: number;
  x: number;
  y: number;
  act: Act;
  color: string;
  carry: string | null;
  mod: number;
}

let nextPerson = 1;

export class Aboard {
  people: Person[] = [];
  private syncT = 0;
  private forVersion = -1;

  /** Everyone's place right now, from the game's head-counts. */
  private slots(g: Game): Slot[] {
    const p = g.player;
    const out: Slot[] = [];
    const bunks: { m: ModuleInst; cap: number }[] = [];
    let mess: ModuleInst | null = null;
    const barracks: ModuleInst[] = [];
    // Builders at the buildings going up.
    const building = new Map<number, number>();
    if (g.builds.length && p.builderStaff > 0) {
      const each = Math.floor(p.builderStaff / g.builds.length);
      g.builds.forEach((b, i) => building.set(b.modId, each + (i < p.builderStaff % g.builds.length ? 1 : 0)));
    }
    for (const m of p.modules) {
      const d = MODULES[m.key];
      if (d.bunks) bunks.push({ m, cap: Math.round(d.bunks * CREW_SCALE * (1 + 0.5 * (m.lvl - 1))) });
      if (m.key === 'mess_hall' && m.built) mess = m;
      if (m.key === 'barracks' && m.built) barracks.push(m);
      const nb = building.get(m.id) ?? 0;
      if (nb > 0) {
        spotsIn(m, nb).forEach((s, i) => out.push({ key: `b${m.id}_${i}`, deck: m.deck, x: s.x, y: s.y, act: 'build', color: DEPT_COL.works, carry: null, mod: m.id }));
      }
      if (!m.built || m.crew <= 0) continue;
      const act = actForModule(m);
      const col = DEPT_COL[deptOf(m)];
      spotsIn(m, m.crew).forEach((s, i) => out.push({ key: `p${m.id}_${i}`, deck: m.deck, x: s.x, y: s.y, act, color: col, carry: null, mod: m.id }));
    }
    // Repair teams: at the job, or on the way home.
    const rows = p.rows;
    for (const t of g.teams) {
      const act: Act = t.kind === 'fire' ? 'hose' : t.kind === 'flood' ? 'pump' : 'fix';
      const home = barracks[0] ?? bunks[0]?.m;
      for (let i = 0; i < t.n; i++) {
        const back = t.phase === 'back';
        const hx = home ? home.cx + 1 : SPINE_X, hy = home ? home.cy + 1 : rows / 2;
        const jx = (i % 3) * 2.2 + (t.kind === 'crawler' ? (Number(t.key) < 4 ? 1.5 : p.cols - 6.5) : SPINE_X - 2.2);
        const jy = sectionRow(t.sec, rows) + Math.floor(i / 3) * 1.4 - 0.7;
        out.push({ key: `t${t.id}_${i}`, deck: back ? home?.deck ?? 3 : t.deck, x: back ? hx : jx, y: back ? hy : jy, act: back ? 'idle' : act, color: DEPT_COL.team, carry: null, mod: 0 });
      }
    }
    // Work crews.
    for (const o of g.orders) {
      for (let i = 0; i < o.n; i++) {
        const at = o.dest;
        out.push({ key: `o${o.id}_${i}`, deck: at.deck, x: at.x + (i % 2) * 1.1 - 0.5, y: at.y + Math.floor(i / 2) * 1.1 - 0.5, act: o.carrying ? 'carry' : o.phase === 'work' ? 'build' : 'idle', color: DEPT_COL.order, carry: o.carrying, mod: o.destMod });
      }
    }
    // Off watch: most asleep in the bunks (quarters first), the rest in the mess or about the ship; the reserve in the Barracks.
    const rank = (k: string): number => (k === 'quarters' ? 0 : k === 'barracks' ? 1 : k === 'mess_hall' ? 3 : 2);
    bunks.sort((a, b) => rank(a.m.key) - rank(b.m.key));
    const off = Math.max(0, p.troops - p.detached - p.stats.crewManned);
    const sleeping = Math.round(off * 0.65);
    let left = sleeping;
    let n = 0;
    for (const b of bunks) {
      if (left <= 0) break;
      if (!b.m.built) continue;
      const k = Math.min(left, Math.max(0, b.cap - (b.m.crew ?? 0)));
      spotsIn(b.m, k).forEach((s, i) => out.push({ key: `s${b.m.id}_${i}`, deck: b.m.deck, x: s.x, y: s.y, act: 'sleep', color: DEPT_COL.off, carry: null, mod: b.m.id }));
      left -= k;
      n += k;
    }
    const awake = off - n;
    if (mess) spotsIn(mess, Math.min(awake, 24)).forEach((s, i) => out.push({ key: `e${i}`, deck: mess!.deck, x: s.x, y: s.y, act: 'eat', color: DEPT_COL.off, carry: null, mod: mess!.id }));
    // The rest are about the ship: in the rooms of every open deck (checking the cargo, in the gym, in the bays).
    const idle = mess ? Math.max(0, awake - 24) : awake;
    const haunts = p.modules.filter((m) => m.built && m.deck >= 1 && p.deckOpen(m.deck) && !MODULES[m.key].bunks);
    for (let i = 0; i < Math.min(idle, 40); i++) {
      const m = haunts.length ? haunts[(i * 7) % haunts.length] : undefined;
      if (m) {
        const d = MODULES[m.key];
        out.push({ key: `i${i}`, deck: m.deck, x: m.cx + 0.4 + ((i * 0.37) % 1) * (d.w - 0.8), y: m.cy + 0.4 + ((i * 0.61) % 1) * (d.h - 0.8), act: m.key === 'cargo' || m.key === 'vault' ? 'haul' : 'idle', color: DEPT_COL.off, carry: null, mod: m.id });
      } else out.push({ key: `i${i}`, deck: 4, x: SPINE_X, y: 2 + ((i * 13) % (rows - 4)), act: 'idle', color: DEPT_COL.off, carry: null, mod: 0 });
    }
    let res = Math.min(g.reserves, 40 * Math.max(1, barracks.length));
    for (const b of barracks) {
      const k = Math.min(res, 40);
      spotsIn(b, k).forEach((s, i) => out.push({ key: `r${b.id}_${i}`, deck: b.deck, x: s.x, y: s.y, act: i % 3 ? 'idle' : 'sleep', color: DEPT_COL.reserve, carry: null, mod: b.id }));
      res -= k;
    }
    return out;
  }

  /** Re-seats everyone (once a second, or when the layout changes): same place, keep going; new place, walk there. */
  sync(g: Game, instant = false): void {
    const slots = this.slots(g);
    const byKey = new Map(slots.map((s) => [s.key, s]));
    const keep: Person[] = [];
    const free: Person[] = [];
    for (const pr of this.people) {
      const s = byKey.get(pr.slot);
      if (s) {
        byKey.delete(pr.slot);
        this.assign(pr, s, false);
        keep.push(pr);
      } else free.push(pr);
    }
    for (const s of byKey.values()) {
      // The nearest spare person takes it (same deck first); otherwise someone new comes up a lift.
      let bi = -1, bd = Infinity;
      for (let i = 0; i < free.length; i++) {
        const f = free[i];
        const d = Math.abs(f.deck - s.deck) * 20 + Math.abs(f.y - s.y) + Math.abs(f.x - s.x);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      if (bi >= 0) {
        const pr = free.splice(bi, 1)[0];
        this.assign(pr, s, instant);
        keep.push(pr);
      } else {
        const l = nearestLift(s.y);
        const pr: Person = { id: nextPerson++, slot: s.key, deck: s.deck, x: instant ? s.x : l.x, y: instant ? s.y : l.y, path: [], act: s.act, color: s.color, carry: s.carry, ride: 0, dir: 1, t: Math.random() * 10, mod: s.mod };
        this.assign(pr, s, instant);
        keep.push(pr);
      }
    }
    this.people = keep;
  }

  private assign(pr: Person, s: Slot, instant: boolean): void {
    pr.slot = s.key;
    pr.act = s.act;
    pr.color = s.color;
    pr.carry = s.carry;
    pr.mod = s.mod;
    const end = pr.path.length ? pr.path[pr.path.length - 1] : { deck: pr.deck, x: pr.x, y: pr.y };
    if (end.deck === s.deck && Math.abs(end.x - s.x) < 0.05 && Math.abs(end.y - s.y) < 0.05) return;
    if (instant) {
      pr.deck = s.deck;
      pr.x = s.x;
      pr.y = s.y;
      pr.path = [];
      pr.ride = 0;
      return;
    }
    pr.path = route(pr.deck, pr.x, pr.y, s.deck, s.x, s.y);
  }

  /** Moves everyone along (call every frame while an interior view is showing). */
  update(g: Game, dt: number): void {
    if (!g.player.titan) {
      this.people = [];
      return;
    }
    this.syncT -= dt;
    if (this.syncT <= 0 || this.forVersion !== g.player.version) {
      const first = !this.people.length || this.forVersion === -1;
      this.syncT = 1;
      this.forVersion = g.player.version;
      this.sync(g, first);
    }
    for (const pr of this.people) {
      pr.t += dt;
      if (pr.ride > 0) {
        pr.ride -= dt;
        continue;
      }
      let step = WALK * dt;
      while (step > 0 && pr.path.length) {
        const w = pr.path[0];
        if (w.ride && w.deck !== pr.deck) {
          pr.ride = Math.abs(w.deck - pr.deck) * RIDE;
          pr.deck = w.deck;
          pr.path.shift();
          break;
        }
        const dx = w.x - pr.x, dy = w.y - pr.y;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dy) > 0.01) pr.dir = dy > 0 ? 1 : -1;
        if (d <= step) {
          pr.x = w.x;
          pr.y = w.y;
          pr.deck = w.deck;
          step -= d;
          pr.path.shift();
        } else {
          pr.x += (dx / d) * step;
          pr.y += (dy / d) * step;
          step = 0;
        }
      }
    }
  }

  /** How many are on each deck (0 roof .. 7), riding lifts excluded. */
  perDeck(): number[] {
    const n = new Array(8).fill(0);
    for (const pr of this.people) if (pr.ride <= 0) n[pr.deck]++;
    return n;
  }
}

/** Is this person walking (or riding) rather than at their place? */
export const moving = (pr: Person): boolean => pr.path.length > 0 || pr.ride > 0;
