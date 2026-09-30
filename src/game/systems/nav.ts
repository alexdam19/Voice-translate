import type { Game } from '../game';
import { mission } from '../campaign';

/**
 * The satnav. It plans a route from the Titan to where she's headed (the course you plotted, or the mission's next
 * objective): along the Crater's roads where they go the right way, straight across country where they don't. It
 * follows her along it, plans again when she strays, and keeps the navigator's next instruction ready: which way to
 * go, how far to the next bend and how far in all. The tactical view and the cab draw the route on the ground; the
 * navigator's face on the console reads the instructions out.
 */

export type Turn = 'ahead' | 'bear-left' | 'bear-right' | 'left' | 'right' | 'around' | 'arrive' | 'rejoin';

export interface NavCue {
  turn: Turn;
  /** What the navigator says. */
  text: string;
  /** To the next bend (0 when there's none ahead), and to the end. */
  next: number;
  left: number;
  /** The way to go relative to the bow (radians, + to starboard). */
  rel: number;
}

export interface Nav {
  kind: 'course' | 'mission';
  label: string;
  tx: number;
  ty: number;
  /** The route, the Titan's end first, and the distance along it at each point. */
  pts: { x: number; y: number }[];
  cum: number[];
  road: boolean;
  /** Segment she's on, how far along the route she is, how far off it. */
  seg: number;
  at: number;
  off: number;
  cue: NavCue;
  /** Bumped each time the instruction changes (the navigator speaks). */
  said: number;
  replanT: number;
  key: string;
}

const fmt = (m: number): string => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} KM` : `${Math.max(10, Math.round(m / 10) * 10)} M`);
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

function plan(g: Game, tx: number, ty: number): { pts: { x: number; y: number }[]; road: boolean } {
  const p = g.player;
  const straight = Math.hypot(tx - p.x, ty - p.y);
  const rr = straight > 1200 ? g.gen.roadRoute?.(p.x, p.y, tx, ty) : null;
  if (rr && rr.length > 1) {
    const legs = Math.hypot(rr[0].x - p.x, rr[0].y - p.y) + Math.hypot(rr[rr.length - 1].x - tx, rr[rr.length - 1].y - ty);
    let len = legs;
    for (let i = 1; i < rr.length; i++) len += Math.hypot(rr[i].x - rr[i - 1].x, rr[i].y - rr[i - 1].y);
    // Roads only when they don't take her far out of her way.
    if (len < straight * 1.5 && legs < straight * 0.45) return { pts: [{ x: p.x, y: p.y }, ...rr, { x: tx, y: ty }], road: true };
  }
  return { pts: [{ x: p.x, y: p.y }, { x: tx, y: ty }], road: false };
}

function build(g: Game, kind: Nav['kind'], label: string, tx: number, ty: number, key: string, said: number): Nav {
  const { pts, road } = plan(g, tx, ty);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { kind, label, tx, ty, pts, cum, road, seg: 0, at: 0, off: 0, cue: { turn: 'ahead', text: '', next: 0, left: cum[cum.length - 1], rel: 0 }, said: said + 1, replanT: 4, key };
}

/** A point `d` metres along the route (clamped to its ends), and the direction of travel there. */
export function routeAt(n: Nav, d: number): { x: number; y: number; a: number } {
  const last = n.pts.length - 1;
  d = Math.max(0, Math.min(n.cum[last], d));
  let i = Math.max(0, Math.min(last - 1, n.seg));
  while (i < last - 1 && n.cum[i + 1] < d) i++;
  while (i > 0 && n.cum[i] > d) i--;
  const a = n.pts[i], b = n.pts[i + 1] ?? a;
  const sl = n.cum[i + 1] - n.cum[i] || 1;
  const t = (d - n.cum[i]) / sl;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) };
}

export function updateNav(g: Game, dt: number): void {
  const p = g.player;
  if (g.mode !== 'world' || p.dead) {
    g.nav = null;
    return;
  }
  // Where to: a plotted course first, then the mission.
  let kind: Nav['kind'], label: string, tx: number, ty: number;
  if (p.goal) {
    kind = 'course';
    label = 'COURSE';
    tx = p.goal.x;
    ty = p.goal.y;
  } else {
    const m = mission(g);
    if (m.x === undefined || m.y === undefined) {
      g.nav = null;
      return;
    }
    kind = 'mission';
    label = m.title;
    tx = m.x;
    ty = m.y;
  }
  const key = `${kind}|${Math.round(tx)}|${Math.round(ty)}`;
  let n = g.nav;
  if (!n || n.key !== key) n = g.nav = build(g, kind, label, tx, ty, key, n?.said ?? 0);
  n.label = label;
  // Where she is on it: the nearest point on the segments round the one she was on.
  const last = n.pts.length - 1;
  let best = Infinity, bs = n.seg, bat = n.at;
  for (let i = Math.max(0, n.seg - 3); i < Math.min(last, n.seg + 40); i++) {
    const a = n.pts[i], b = n.pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
    if (d < best) {
      best = d;
      bs = i;
      bat = n.cum[i] + t * Math.sqrt(l2);
    }
  }
  n.seg = bs;
  n.at = bat;
  n.off = best;
  // Strayed off it: plan again from here (not too often).
  n.replanT -= dt;
  if ((n.off > Math.max(220, p.stats.length * 1.5) && n.replanT <= 0) || n.off > 1500) {
    const said = n.said;
    n = g.nav = build(g, kind, label, tx, ty, key, said - 1);
    n.replanT = 6;
  }
  const total = n.cum[last];
  const left = Math.max(0, total - n.at);
  // Which way now: toward a point a little way along the route.
  const look = routeAt(n, n.at + Math.min(left, Math.max(150, p.stats.length * 1.6)));
  const rel = left < 5 ? 0 : wrap(Math.atan2(look.y - p.y, look.x - p.x) - (p.speed < -0.5 ? p.rot + Math.PI : p.rot));
  // The next real bend ahead (roads meander: only a turn that holds counts).
  let next = 0, nextDir = 0;
  if (n.road) {
    const here = routeAt(n, n.at + 40).a;
    for (let s = 120; s < Math.min(left - 60, 2500); s += 60) {
      const a1 = routeAt(n, n.at + s).a, a2 = routeAt(n, n.at + s + 120).a;
      const turn = wrap(a2 - here), hold = wrap(a2 - a1);
      if (Math.abs(turn) > 0.7 && Math.abs(hold) < 0.5) {
        next = s;
        nextDir = Math.sign(turn);
        break;
      }
    }
  }
  const side = (r: number): string => (r > 0 ? 'RIGHT' : 'LEFT');
  let turn: Turn, text: string;
  const ar = Math.abs(rel);
  if (left < Math.max(120, p.stats.length)) {
    turn = 'arrive';
    text = kind === 'course' ? 'YOU HAVE ARRIVED' : 'OBJECTIVE AHEAD';
  } else if (n.off > 160 && n.road) {
    turn = 'rejoin';
    text = `BACK TO THE ROAD: ${side(rel)} ${Math.round((ar * 180) / Math.PI)}°`;
  } else if (ar > 2.3) {
    turn = 'around';
    text = 'TURN AROUND';
  } else if (ar > 0.95) {
    turn = rel > 0 ? 'right' : 'left';
    text = `TURN ${side(rel)}`;
  } else if (ar > 0.3) {
    turn = rel > 0 ? 'bear-right' : 'bear-left';
    text = `BEAR ${side(rel)}`;
  } else if (next > 0) {
    turn = 'ahead';
    text = `IN ${fmt(next)}, TURN ${nextDir > 0 ? 'RIGHT' : 'LEFT'}`;
  } else {
    turn = 'ahead';
    text = `STRAIGHT ON ${fmt(left)}`;
  }
  // The navigator speaks when the instruction changes (a bend's distance counts down in steps).
  const step = next > 0 ? (next < 250 ? 1 : next < 600 ? 2 : next < 1200 ? 3 : 4) : 0;
  const was = n.cue;
  const wasStep = was.next > 0 ? (was.next < 250 ? 1 : was.next < 600 ? 2 : was.next < 1200 ? 3 : 4) : 0;
  if (was.turn !== turn || wasStep !== step || !was.text) n.said++;
  n.cue = { turn, text, next, left, rel };
}
