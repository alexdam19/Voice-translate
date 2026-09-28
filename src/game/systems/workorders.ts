import { routeTime, SPINE_X } from '../aboard';
import { placeBuilding, upgradeBlock, upgradeBuilding, upgradeCostOf, buildBlock, craftRecipe } from '../actions';
import { MODULES, RECIPES, ROOF } from '../defs';
import type { Game } from '../game';
import type { ModuleInst } from '../tank';
import { getItem } from '../../shared/items';
import { reserveCap, teamPool } from './crewops';

/**
 * Work orders: jobs you hand a crew and they carry out step by step, walking the decks to do it.
 *
 *  - FETCH at a room: they pick up what the next steps need. At a Refinery (or a Workshop) they refine whatever's
 *    short from the ore in the hold first, so "fetch metal from the refinery" really makes the metal.
 *  - UPGRADE a room: they carry the materials there and do the upgrade themselves (no free builder needed).
 *  - BUILD a new building on a deck (the roof for turret mounts): they find the spot and put it up.
 *
 * A crew is four people from the Barracks reserve, or off the watch. A step that can't go ahead (short of
 * materials) waits and tries again; one that never can (the building is maxed out) ends the order.
 */

export type StepKind = 'fetch' | 'upgrade' | 'build';

export interface OrderStep {
  k: StepKind;
  /** The room (fetch from, upgrade). */
  mod?: number;
  /** What to build, and on which deck. */
  key?: string;
  deck?: number;
  /** What a fetch collects (filled in from the steps after it). */
  items?: Record<string, number>;
}

export interface WorkOrder {
  id: number;
  name: string;
  steps: OrderStep[];
  i: number;
  phase: 'walk' | 'work' | 'wait' | 'home' | 'done';
  /** Seconds left walking or loading. */
  t: number;
  walk: number;
  n: number;
  reserve: number;
  status: string;
  /** Where the crew is going (or standing), and the room there. */
  dest: { deck: number; x: number; y: number };
  destMod: number;
  /** Carrying a crate of this item (for the interior views). */
  carrying: string | null;
  /** The building whose construction they're on. */
  job: number;
  failed?: string;
}

export const ORDER_CREW = 4;
export const MAX_ORDERS = 3;
let nextOrder = 1;

/** A room's doorway spot (the middle of it). */
function roomSpot(m: ModuleInst): { deck: number; x: number; y: number } {
  const d = MODULES[m.key];
  return { deck: m.deck, x: m.cx + d.w / 2, y: m.cy + d.h / 2 };
}

/** Where crews start from and go home to: the Barracks, or else the Living Quarters, or else the Spine. */
function homeSpot(g: Game): { deck: number; x: number; y: number } {
  const p = g.player;
  const b = p.modules.find((m) => m.built && m.key === 'barracks') ?? p.modules.find((m) => m.built && m.key === 'quarters');
  return b ? roomSpot(b) : { deck: 3, x: SPINE_X, y: p.rows / 2 };
}

/** What a step costs (upgrades and builds). */
function stepCost(g: Game, s: OrderStep): Record<string, number> {
  if (s.k === 'upgrade' && s.mod) return { ...upgradeCostOf(g, s.mod) } as Record<string, number>;
  if (s.k === 'build' && s.key) return { ...(MODULES[s.key]?.cost ?? {}) } as Record<string, number>;
  return {};
}

/** Fills in what each fetch has to collect: everything the steps after it (up to the next fetch) will spend. */
export function planFetches(g: Game, steps: OrderStep[]): void {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].k !== 'fetch') continue;
    const need: Record<string, number> = {};
    for (let j = i + 1; j < steps.length && steps[j].k !== 'fetch'; j++) {
      for (const [k, n] of Object.entries(stepCost(g, steps[j]))) need[k] = (need[k] ?? 0) + n;
    }
    steps[i].items = need;
  }
}

export function stepLabel(g: Game, s: OrderStep): string {
  const m = s.mod ? g.player.moduleById(s.mod) : undefined;
  const name = m ? MODULES[m.key].name : '?';
  switch (s.k) {
    case 'fetch': {
      const it = Object.entries(s.items ?? {}).map(([k, n]) => `${n} ${getItem(k).name}`).join(', ');
      return `Fetch ${it || 'materials'} from the ${name}`;
    }
    case 'upgrade':
      return m ? `Upgrade the ${name} to level ${m.lvl + 1}` : 'Upgrade (gone)';
    case 'build':
      return `Build a ${MODULES[s.key ?? '']?.name ?? '?'} on the ${s.deck === ROOF ? 'roof' : `deck ${s.deck}`}`;
  }
}

/** Hands a crew a list of steps. Returns why not, or null. */
export function createOrder(g: Game, name: string, steps: OrderStep[]): string | null {
  const p = g.player;
  if (!p.titan || p.dead) return 'Work orders need your Titan.';
  if (!steps.length) return 'Add at least one step.';
  if (g.orders.filter((o) => o.phase !== 'done').length >= MAX_ORDERS) return `${MAX_ORDERS} work orders at once is the most the Works can run.`;
  const pool = teamPool(g);
  if (pool < 2) return 'Nobody free to take it: every hand is on a post. A Barracks keeps a reserve.';
  const n = Math.min(ORDER_CREW, pool);
  const fromRes = Math.min(n, g.reserves);
  g.reserves -= fromRes;
  p.detached += n - fromRes;
  if (n - fromRes > 0) p.recalc();
  planFetches(g, steps);
  const home = homeSpot(g);
  const o: WorkOrder = { id: nextOrder++, name, steps, i: 0, phase: 'walk', t: 0, walk: 0, n, reserve: fromRes, status: '', dest: home, destMod: 0, carrying: null, job: 0 };
  g.orders.push(o);
  headTo(g, o, home);
  return null;
}

/** The crew set off for the current step's place. */
function headTo(g: Game, o: WorkOrder, from: { deck: number; x: number; y: number }): void {
  const s = o.steps[o.i];
  const p = g.player;
  let to = from;
  let mod = 0;
  if (s.k === 'fetch' || s.k === 'upgrade') {
    const m = s.mod ? p.moduleById(s.mod) : undefined;
    if (!m) return fail(g, o, 'the room is gone');
    to = roomSpot(m);
    mod = m.id;
  } else if (s.k === 'build') {
    const spot = s.key ? p.findSpot(s.key, s.deck) : null;
    if (!spot) return fail(g, o, `no room for a ${MODULES[s.key ?? '']?.name ?? 'building'} there`);
    const d = MODULES[s.key!];
    to = { deck: spot[2], x: spot[0] + d.w / 2, y: spot[1] + d.h / 2 };
  }
  o.walk = o.t = routeTime(from.deck, from.x, from.y, to.deck, to.x, to.y);
  o.dest = to;
  o.destMod = mod;
  o.phase = 'walk';
  o.status = `Walking to ${stepLabel(g, s).replace(/^\w+ /, '').replace(/^.* (from|the) /, 'the ')}`;
}

function fail(g: Game, o: WorkOrder, why: string): void {
  o.failed = why;
  g.hooks.toast(`Work order "${o.name}" stopped: ${why}.`, '#ff8a80');
  goHome(g, o);
}

function goHome(g: Game, o: WorkOrder): void {
  const home = homeSpot(g);
  o.walk = o.t = routeTime(o.dest.deck, o.dest.x, o.dest.y, home.deck, home.x, home.y);
  o.dest = home;
  o.destMod = 0;
  o.carrying = null;
  o.phase = 'home';
  o.status = o.failed ? `Stopped: ${o.failed}. Heading back.` : 'Done. Heading back.';
}

/** Try the current step now that they're there. */
function doStep(g: Game, o: WorkOrder): void {
  const s = o.steps[o.i];
  const p = g.player;
  if (s.k === 'fetch') {
    const src = s.mod ? p.moduleById(s.mod) : undefined;
    const refines = src && (src.key === 'refinery' || src.key === 'workshop' || src.key === 'forge');
    const short: string[] = [];
    for (const [k, n] of Object.entries(s.items ?? {})) {
      let have = p.cargo.count(k);
      if (have < n && refines) {
        const r = RECIPES.find((q) => q.out === k && (q.station === 'refinery' || q.station === 'workshop' || q.station === 'none'));
        if (r) {
          const times = Math.ceil((n - have) / r.n);
          let made = 0;
          for (let t = 0; t < times; t++) if (craftRecipe(g, r, 1).ok) made++;
          if (made) g.hooks.toast(`${o.name}: refined ${made * r.n} ${getItem(k).name} at the ${MODULES[src!.key].name}.`, '#ffd740');
          have = p.cargo.count(k);
        }
      }
      if (have < n) short.push(`${n - have} more ${getItem(k).name}`);
    }
    if (short.length) {
      o.phase = 'wait';
      o.t = 3;
      o.status = `Waiting for ${short.join(', ')}.`;
      return;
    }
    o.carrying = Object.keys(s.items ?? {})[0] ?? 'scrap';
    o.phase = 'work';
    o.t = 3;
    o.status = 'Loading up.';
    return;
  }
  if (s.k === 'upgrade') {
    const m = s.mod ? p.moduleById(s.mod) : undefined;
    if (!m) return fail(g, o, 'the room is gone');
    const block = upgradeBlock(g, m.id, true);
    if (block) return fail(g, o, block.replace(/\.$/, '').toLowerCase());
    const r = upgradeBuilding(g, m.id, o.id);
    if (!r.ok) {
      o.phase = 'wait';
      o.t = 3;
      o.status = `Waiting for materials to upgrade the ${MODULES[m.key].name}.`;
      return;
    }
    o.carrying = null;
    o.job = m.id;
    o.phase = 'work';
    o.status = `Upgrading the ${MODULES[m.key].name}.`;
    return;
  }
  // Build.
  const key = s.key!;
  const block = buildBlock(g, key, true);
  if (block) return fail(g, o, block.replace(/\.$/, '').toLowerCase());
  const spot = p.findSpot(key, s.deck);
  if (!spot) return fail(g, o, 'no room left there');
  const r = placeBuilding(g, key, spot[0], spot[1], spot[2], o.id);
  if (!r.ok) {
    o.phase = 'wait';
    o.t = 3;
    o.status = `Waiting for materials for the ${MODULES[key].name}.`;
    return;
  }
  const m = p.modules[p.modules.length - 1];
  o.carrying = null;
  o.job = m.id;
  o.destMod = m.id;
  o.phase = 'work';
  o.status = `Building the ${MODULES[key].name}.`;
}

export function updateOrders(g: Game, dt: number): void {
  if (!g.orders.length) return;
  const p = g.player;
  if (p.dead || !p.titan) {
    for (const o of g.orders) disband(g, o);
    g.orders.length = 0;
    return;
  }
  for (const o of g.orders) {
    if (o.phase === 'done') continue;
    if (o.phase === 'walk' || o.phase === 'home') {
      o.t -= dt * Math.max(0.5, p.efficiency);
      if (o.t > 0) continue;
      if (o.phase === 'home') {
        o.phase = 'done';
        disband(g, o);
        if (!o.failed) g.hooks.toast(`Work order done: ${o.name}.`, '#76ff03');
        continue;
      }
      doStep(g, o);
      continue;
    }
    if (o.phase === 'wait') {
      o.t -= dt;
      if (o.t <= 0) doStep(g, o);
      continue;
    }
    // Working: loading a fetch runs on a timer; building runs until the job is finished.
    if (o.job) {
      if (g.builds.some((b) => b.modId === o.job)) continue;
      o.job = 0;
    } else {
      o.t -= dt;
      if (o.t > 0) continue;
    }
    next(g, o);
  }
  g.orders = g.orders.filter((o) => o.phase !== 'done');
}

function next(g: Game, o: WorkOrder): void {
  o.i++;
  if (o.i >= o.steps.length) {
    goHome(g, o);
    return;
  }
  headTo(g, o, o.dest);
}

function disband(g: Game, o: WorkOrder): void {
  const p = g.player;
  g.reserves = Math.min(reserveCap(g), g.reserves + o.reserve);
  const crew = o.n - o.reserve;
  if (crew > 0) {
    p.detached = Math.max(0, p.detached - crew);
    p.recalc();
  }
  o.reserve = 0;
  o.n = 0;
}

export function cancelOrder(g: Game, id: number): void {
  const o = g.orders.find((k) => k.id === id);
  if (!o || o.phase === 'home' || o.phase === 'done') return;
  o.failed = 'cancelled';
  goHome(g, o);
}

/* ---------------------------------------------------------------------- */
/* Ready-made orders                                                       */
/* ---------------------------------------------------------------------- */

/** Where to fetch from: the Refinery if there is one (it can make what's short), else a Cargo Hold, else the room itself. */
export function bestSource(g: Game, fallback?: ModuleInst): ModuleInst | undefined {
  const p = g.player;
  return p.modules.find((m) => m.built && m.key === 'refinery') ?? p.modules.find((m) => m.built && m.key === 'cargo') ?? fallback;
}

/** "Fetch the materials, then upgrade this room." */
export function upgradeOrder(g: Game, mod: ModuleInst): OrderStep[] {
  const src = bestSource(g, mod);
  return [{ k: 'fetch', mod: src!.id }, { k: 'upgrade', mod: mod.id }];
}

/** The turret mounts you could put up on the roof right now, one of each kind. */
export function mountKinds(g: Game): string[] {
  return ['hp_light', 'hp_medium', 'hp_heavy'].filter((k) => !buildBlock(g, k, true));
}

/** "Fetch the metal, then put one of every turret mount on the roof." */
export function armRoofOrder(g: Game): OrderStep[] {
  const src = bestSource(g);
  const kinds = mountKinds(g);
  if (!kinds.length) return [];
  const steps: OrderStep[] = src ? [{ k: 'fetch', mod: src.id }] : [];
  for (const k of kinds) steps.push({ k: 'build', key: k, deck: ROOF });
  return steps;
}

/** The user-style chain: metal from the Refinery, upgrade the Command Center, then arm the roof. */
export function refitOrder(g: Game): OrderStep[] {
  const p = g.player;
  const cc = p.modules.find((m) => MODULES[m.key].required);
  const src = bestSource(g);
  const steps: OrderStep[] = [];
  if (src) steps.push({ k: 'fetch', mod: src.id });
  if (cc && !upgradeBlock(g, cc.id, true)) steps.push({ k: 'upgrade', mod: cc.id });
  for (const k of mountKinds(g)) steps.push({ k: 'build', key: k, deck: ROOF });
  return steps.length > 1 ? steps : [];
}
