import type { Game } from '../game';
import type { Tank } from '../tank';
import { AREAS, COMPOUND, FORWARD, FRONT_GUNS, GATE, HELIPADS, inCompound, inFront, PADS, PARADE, TOWERS } from '../../shared/compound';
import { hardObs, OBS } from '../../shared/map';
import { threatAt } from '../../shared/mapgen';
import { ENEMIES } from '../enemyDefs';
import { buildRival } from '../templates';
import { damageEnemy } from './damage';
import { pickKind } from './world';

/**
 * Life in the Mega Hangar's compound (its layout is shared/compound.ts):
 *
 *  - THE GATE. The only way through the wall. Anyone who wants out or in (you, or a visiting base) asks Gate Control
 *    for clearance; they refuse while hostiles crowd the gate, otherwise the doors grind open, stay open while a hull
 *    is in the gateway, and close behind it. If a horde rushes an open gate with nobody in it, they slam it.
 *  - THE TOWERS. Every tower on the wall has a gun crew: they shoot anything hostile in reach, inside or out.
 *  - SIEGES. Now and then, while you're near home, a horde comes for the compound. They make for the gate and claw
 *    at it; the towers (and your guns, over the wall) cut them down. Open the gate on them and they pour in.
 *  - THE FRONT. Outside the gate, bunkers with twin guns and dug-in tanks hold the ground either side of the exit lane.
 *  - GUNSHIPS. Four sit on their pads by the parade ground. When a ship is cleared out of the gate, or a horde comes,
 *    they lift off: over the front to hold it, or out ahead of a departing Titan to clear its way, rockets and
 *    chain guns on anything in reach. When it's quiet again they come home and land.
 *  - PEOPLE. A squad drilling on the parade ground, pilots and mechanics on the pads and in the motor pool, workers
 *    on the apron, guards on the gate and walking the wall, sentries at the bunkers, and flag signallers at the gate
 *    waving the ships through. When the sirens go the others run for the Hangar and the soldiers bring their rifles
 *    up.
 *  - OTHER BASES. Crawler bases from other crews dock on the west pads; now and then one leaves (asking for
 *    clearance like you do) and another rolls in.
 *
 * Only simulated while you're within a few kilometres; the doors' tiles on the map follow the gate.
 */

export type PersonKind = 'civ' | 'trader' | 'mech' | 'guard' | 'worker' | 'soldier' | 'officer' | 'signal' | 'pilot' | 'sentry' | 'rifle';

export interface Resident {
  x: number;
  y: number;
  tx: number;
  ty: number;
  area: number;
  kind: PersonKind;
  uniform: string;
  hat: string;
  skin: number;
  wait: number;
  face: number;
  anim: number;
  walking: boolean;
  /** Guards: a post to stand at, or a stretch of wall to walk. */
  post?: { ax: number; ay: number; bx: number; by: number };
  /** Seconds left running out of a hull's path (they sprint for the side and wait for it to pass). */
  dodge?: number;
  /** The rifle line: seconds it keeps its rifle up after the last target. */
  aimT?: number;
}

/**
 * A war machine of the garrison: two-legged walkers nine metres tall pacing the front with twin autocannons, patrol
 * tanks crawling the line behind the sandbags, light mechs with rocket pods walking the lanes inside the wall, and an
 * APC running troops between the motor pool and the gate. Each walks or drives its loop (routes relative to the
 * Hangar), stops to fight anything hostile in reach and turns its guns on it, and waits for a hull in its way.
 */
export interface Machine {
  kind: 'walker' | 'mech' | 'tank' | 'apc';
  x: number;
  y: number;
  rot: number;
  speed: number;
  route: [number, number][];
  wp: number;
  cd: number;
  /** Where its guns point, the muzzle flash, the walk cycle, and seconds it stands its ground after firing. */
  aim: number;
  flash: number;
  anim: number;
  hold: number;
}

const MACHINE = {
  walker: { v: 3, range: 300, rate: 0.35, dmg: 0.8, splash: 0 },
  mech: { v: 4.2, range: 220, rate: 1.7, dmg: 1.6, splash: 5 },
  tank: { v: 5.5, range: 460, rate: 2.8, dmg: 3, splash: 9 },
  apc: { v: 8, range: 150, rate: 0.5, dmg: 0.45, splash: 0 },
} as const;

/** Their loops round the base (metres from the Hangar): the front line outside the gate, the lanes inside it. */
function machineRoutes(): { kind: Machine['kind']; route: [number, number][] }[] {
  const out: { kind: Machine['kind']; route: [number, number][] }[] = [];
  for (const sx of [-1, 1]) {
    out.push({ kind: 'walker', route: [[sx * 140, 1112], [sx * 455, 1112], [sx * 455, 1122], [sx * 140, 1122]] });
    out.push({ kind: 'tank', route: [[sx * 150, 1192], [sx * 450, 1192], [sx * 450, 1198], [sx * 150, 1198]] });
    out.push({ kind: 'mech', route: [[sx * 132, 320], [sx * 132, 940], [sx * 170, 940], [sx * 170, 320]] });
  }
  out.push({ kind: 'apc', route: [[470, 690], [300, 700], [150, 700], [150, 960], [300, 960], [300, 700]] });
  return out;
}

export interface GuestBase {
  tank: Tank;
  name: string;
  pad: number;
  state: 'docked' | 'waitOut' | 'leaving' | 'arriving' | 'waitIn' | 'entering';
  path: { x: number; y: number }[];
  /** Seconds until its next decision. */
  t: number;
}

export interface GateState {
  /** How open the doors are (0 shut, 1 wide open) and where they're going. */
  open: number;
  target: number;
  /** Seconds the gateway has been empty while open. */
  idle: number;
  /** A request being considered: who asked and how long until the answer. */
  req: { who: string; t: number } | null;
  /** Doors' open half-width last written to the map (tiles). */
  applied: number;
  /** When it last refused (seconds of cooldown before asking again). */
  deny: number;
  /** What's left of the doors (0..1): a horde clawing at them wears them down; crews patch them up after. */
  hp: number;
  /** Seconds since something last clawed at the doors (repairs wait for quiet). */
  clawT: number;
  /** Seconds left of a breach: the doors are wrecked and stuck open. */
  breach: number;
}

/** Hit points of the main gate's doors. */
export const GATE_HP = 6000;

/** A vehicle going round one of the compound's loops (forklifts at the docks, trucks in town, a jeep on the lane). */
export interface Car {
  route: number;
  /** The next corner of its loop. */
  i: number;
  x: number;
  y: number;
  rot: number;
  speed: number;
  kind: 'truck' | 'jeep' | 'forklift' | 'tanker';
  col: string;
}

/** The loops (metres from the Hangar's centre): the apron, round the town, round the pads, up and down the lane. */
export const CAR_ROUTES: [number, number][][] = [
  [[-150, 240], [150, 240], [150, 292], [-150, 292]],
  [[375, -345], [735, -345], [735, 160], [375, 160]],
  [[-488, -390], [-488, 740], [-632, 740], [-632, -390]],
  [[-90, 250], [-90, 960], [90, 960], [90, 250]],
];

/** Length and width of each kind of vehicle (metres) and its top speed. */
export const CAR_SIZE: Record<Car['kind'], { l: number; w: number; v: number }> = {
  truck: { l: 10, w: 3.6, v: 9 },
  jeep: { l: 5.5, w: 2.8, v: 12 },
  forklift: { l: 4, w: 2.2, v: 5 },
  tanker: { l: 12, w: 3.6, v: 8 },
};

/** A gunship: parked on its pad, lifting off, out on station, coming home, landing. */
export interface Gunship {
  pad: number;
  x: number;
  y: number;
  /** Height above the ground (m). */
  z: number;
  rot: number;
  vx: number;
  vy: number;
  state: 'parked' | 'up' | 'out' | 'home' | 'down';
  /** Orbit phase round its station. */
  ph: number;
  /** Chain gun and rocket cooldowns, muzzle flash, where the gun points, the rotor's turn. */
  cd: number;
  rcd: number;
  flash: number;
  aim: number;
  rotor: number;
}

export interface CompoundState {
  inited: boolean;
  gate: GateState;
  towers: { cd: number; aim: number; flash: number }[];
  /** The front's guns (bunkers and tanks, see FRONT_GUNS). */
  front: { cd: number; aim: number; flash: number }[];
  air: Gunship[];
  /** Seconds the gunships stay out (a departure or a siege sends them up). */
  sortie: number;
  people: Resident[];
  cars: Car[];
  /** The garrison's war machines on patrol (see Machine). */
  machines: Machine[];
  bases: GuestBase[];
  /** Seconds to the next siege and to the next base movement. */
  siegeT: number;
  trafficT: number;
  chatterT: number;
  /** Hostiles near the walls right now (the sirens). */
  alarm: boolean;
  /** Seconds your hull has been wedged in the compound's structure. */
  stuckT: number;
  /** What to offer on the HUD: request clearance to leave or to come in. */
  prompt: 'exit' | 'enter' | null;
}

export const newCompound = (): CompoundState => ({
  inited: false,
  gate: { open: 0, target: 0, idle: 0, req: null, applied: -1, deny: 0, hp: 1, clawT: 0, breach: 0 },
  towers: [],
  front: [],
  air: [],
  sortie: 0,
  people: [],
  cars: [],
  machines: [],
  bases: [],
  siegeT: 150,
  trafficT: 70,
  chatterT: 40,
  alarm: false,
  stuckT: 0,
  prompt: null,
});

const BASE_NAMES = ['IRON TORTOISE', 'RUST MOTHER', 'NOMAD SIX', 'SALT ARK', 'GREY PILGRIM', 'OLD FAITHFUL', 'DUNE CATHEDRAL', 'MULE TRAIN', 'THE LANTERN', 'KETTLE BELLY'];
const CIV_COLS = ['#8a6a4a', '#5a7a9a', '#9a5a5a', '#6a8a5a', '#a08a5a', '#7a5a8a', '#5a6a6a', '#b07a4a'];
const HAIR = ['#2a1a10', '#5a3a20', '#b08040', '#d8d0c0', '#1a1a1a', '#8a3a20'];

/** The Hangar's centre, or null away from the open world. */
export function home(g: Game): { x: number; y: number } | null {
  return g.mode === 'world' && g.gen.hangar ? g.gen.hangar : null;
}

/** Is (x, y) solid wall or building of the compound (nothing gets through)? Cheap away from home. */
export function hardAt(g: Game, x: number, y: number): boolean {
  const h = home(g);
  if (!h || !(inCompound(x - h.x, y - h.y, 12) || inFront(x - h.x, y - h.y, 12))) return false;
  const tx = Math.floor(x), ty = Math.floor(y);
  return g.map.inside(tx, ty) && hardObs(g.map.getObs(tx, ty));
}

/** Would this hull, where it is now, overlap the compound's walls, its buildings or a docked base? */
export function hullBlocked(g: Game, t: Tank): boolean {
  const h = home(g);
  if (!h) return false;
  const L = t.stats.length / 2, W = t.stats.width / 2;
  if (!inCompound(t.x - h.x, t.y - h.y, L + 20) && !inFront(t.x - h.x, t.y - h.y, L + 20)) return false;
  const step = 5;
  for (let lx = -L; lx <= L + 0.01; lx += step) {
    for (const lz of [-W, W]) {
      const p = t.toWorld(lx, lz);
      if (hardAt(g, p.x, p.y)) return true;
    }
  }
  for (let lz = -W + step; lz < W; lz += step) {
    for (const lx of [-L, L]) {
      const p = t.toWorld(lx, lz);
      if (hardAt(g, p.x, p.y)) return true;
    }
  }
  // Visiting bases are as solid as the wall.
  for (const b of g.compound.bases) {
    const o = b.tank;
    if (o === t) continue;
    const dx = o.x - t.x, dy = o.y - t.y;
    if (Math.hypot(dx, dy) > L + o.stats.length / 2 + 4) continue;
    for (let lx = -L; lx <= L + 0.01; lx += step * 2) {
      for (const lz of [-W, 0, W]) {
        const p = t.toWorld(lx, lz);
        if (o.hits(p.x, p.y, 0)) return true;
      }
    }
  }
  return false;
}

/** The gate's centre in world metres. */
export function gateXY(g: Game): { x: number; y: number } | null {
  const h = home(g);
  return h ? { x: h.x + GATE.x, y: h.y + GATE.y } : null;
}

/** Hostiles crowding the gate (within 260 m of it, on the ground). */
function gateThreat(g: Game): number {
  const gp = gateXY(g);
  if (!gp) return 0;
  let n = 0;
  for (const e of g.enemies) if (e.hp > 0 && !e.colossus && Math.abs(e.x - gp.x) < 260 && Math.abs(e.y - gp.y) < 260) n++;
  return n;
}

/** Is a hull in the gateway (the doors mustn't close on it), or, with `reach`, that close to the gate on either side? */
function gatewayBusy(g: Game, reach = 40): boolean {
  const gp = gateXY(g);
  if (!gp) return false;
  const hulls: Tank[] = [g.player, ...g.compound.bases.map((b) => b.tank)];
  for (const t of hulls) {
    if (t.dead) continue;
    if (Math.abs(t.x - gp.x) < COMPOUND.gateHalf + t.stats.width + reach && Math.abs(t.y - gp.y) < t.stats.length / 2 + reach) return true;
  }
  return false;
}

/**
 * Ask Gate Control to open up. `who` is 'player' or a visiting base's name. Returns what they said (also on the
 * radio), or null if the gate is already open.
 */
export function requestClearance(g: Game, who: string): string | null {
  const cs = g.compound;
  const gate = cs.gate;
  const you = who === 'player';
  if (gate.target === 1) {
    if (you) g.hooks.toast('GATE CONTROL: Gate is open, Titan. Roll on through.', '#40c4ff');
    return null;
  }
  if (gate.req) {
    if (you) g.hooks.toast('GATE CONTROL: Stand by, we have a request in the queue.', '#40c4ff');
    return 'queued';
  }
  if (gate.breach > 0) {
    if (you) g.hooks.toast('GATE CONTROL: The doors are wrecked, Titan! Nothing to open. Hold the gateway!', '#ff8a80');
    return null;
  }
  if (you) g.hooks.toast(`TITAN to GATE CONTROL: requesting clearance through the main gate.`, '#b0bec5');
  gate.req = { who, t: 2.5 };
  return 'asked';
}

function answer(g: Game): void {
  const cs = g.compound;
  const gate = cs.gate;
  const req = gate.req!;
  gate.req = null;
  const you = req.who === 'player';
  const n = gateThreat(g);
  if (n > 3) {
    gate.deny = 12;
    const msg = `GATE CONTROL: Negative${you ? ', Titan' : `, ${req.who}`}. ${n} hostiles at the gate. Clear them and call again.`;
    if (you || Math.hypot(g.player.x - (home(g)?.x ?? 0), g.player.y - (home(g)?.y ?? 0)) < 2500) g.hooks.toast(msg, '#ff8a80');
    return;
  }
  gate.target = 1;
  gate.idle = 0;
  // The gunships go up to clear the way out.
  cs.sortie = Math.max(cs.sortie, 75);
  g.hooks.toast(you ? 'GATE CONTROL: Clearance granted, Titan. Opening the main gate: roll through, we close behind you.' : `GATE CONTROL: ${req.who}, cleared. Opening the gate.`, '#40c4ff');
  g.hooks.sound('alarm', g.player.x, g.player.y, 0.25);
}

/** Writes the doors' state into the map: gate tiles closed beyond the open half-width. */
function applyGate(g: Game, force = false): void {
  const h = home(g);
  if (!h) return;
  const gate = g.compound.gate;
  // The doors' tiles flip in one go (the doors themselves are drawn sliding): open once they're nearly wide open.
  const half = gate.open >= 0.9 ? COMPOUND.gateHalf : 0;
  if (!force && half === gate.applied) return;
  gate.applied = half;
  const y0 = Math.floor(h.y + COMPOUND.y1 - COMPOUND.wall), y1 = Math.floor(h.y + COMPOUND.y1);
  const cx = Math.floor(h.x + GATE.x);
  for (let ty = y0; ty < y1; ty++) {
    for (let dx = -COMPOUND.gateHalf; dx < COMPOUND.gateHalf; dx++) {
      const tx = cx + dx;
      if (!g.map.inside(tx, ty)) continue;
      const shut = Math.abs(dx + 0.5) >= half;
      const want = shut ? OBS.BASTION : OBS.NONE;
      if (g.map.getObs(tx, ty) === want) continue;
      g.map.set(tx, ty, { obs: want, oh: shut ? 30 : 0 });
      g.markDirty(tx, ty);
    }
  }
  g.map.invalidateNavNear(cx, y0, COMPOUND.gateHalf + 40);
}

function init(g: Game): void {
  const cs = g.compound;
  const h = home(g)!;
  cs.inited = true;
  cs.towers = TOWERS.map(() => ({ cd: Math.random(), aim: Math.PI / 2, flash: 0 }));
  cs.front = FRONT_GUNS.map(() => ({ cd: Math.random() * 2, aim: Math.PI / 2, flash: 0 }));
  cs.air = HELIPADS.map((pd, i) => ({ pad: i, x: h.x + pd.x, y: h.y + pd.y, z: 0, rot: -Math.PI / 2, vx: 0, vy: 0, state: 'parked' as const, ph: i * 1.6, cd: 0, rcd: i, flash: 0, aim: 0, rotor: 0 }));
  // People, spread over the open ground by how many each place holds.
  let id = 0;
  AREAS.forEach((a, ai) => {
    if (a.kind === 'parade') return;
    for (let k = 0; k < a.n; k++) {
      const kind: PersonKind = a.kind === 'dock' || a.kind === 'motor' ? 'mech' : a.kind === 'apron' ? 'worker' : a.kind === 'pads' ? (k % 2 ? 'pilot' : 'mech') : k % 4 === 0 ? 'soldier' : 'civ';
      const x = h.x + a.x0 + Math.random() * (a.x1 - a.x0), y = h.y + a.y0 + Math.random() * (a.y1 - a.y0);
      cs.people.push(person(kind, x, y, ai, id++));
    }
  });
  const fixed = (kind: PersonKind, x: number, y: number, face: number): void => {
    const r = person(kind, x, y, -1, id++);
    r.post = { ax: x, ay: y, bx: x, by: y };
    r.face = face;
    cs.people.push(r);
  };
  // The drill squad on the parade ground, four ranks of six facing their sergeant under the flag.
  for (let rank = 0; rank < 4; rank++) for (let file = 0; file < 6; file++) fixed('soldier', h.x + PARADE.x0 + 44 + file * 13, h.y + PARADE.y0 + 46 + rank * 16, -1);
  fixed('officer', h.x + PARADE.x0 + 20, h.y + PARADE.y0 + 70, 1);
  // Flag signallers either side of the lane, inside the gate and out at the front.
  for (const sx of [-1, 1]) {
    fixed('signal', h.x + sx * 78, h.y + COMPOUND.y1 - 40, -sx);
    fixed('signal', h.x + sx * 80, h.y + COMPOUND.y1 + 34, -sx);
  }
  // Sentries at the bunkers.
  for (const gn of FRONT_GUNS) if (gn.kind === 'bunker') for (const sx of [-1, 1]) fixed('sentry', h.x + gn.x + sx * 15, h.y + gn.y + 4, gn.x < 0 ? -1 : 1);
  // The rifle line: a squad either side of the lane behind the sandbags, rifles out over them.
  for (const sx of [-1, 1]) for (let x = 140; x < 462; x += 20) fixed('rifle', h.x + sx * x, h.y + 1206, sx);
  // The war machines on their loops.
  cs.machines = machineRoutes().map(({ kind, route }, i) => {
    const at = i % route.length;
    const [ax, ay] = route[at], [bx, by] = route[(at + 1) % route.length];
    return { kind, x: h.x + (ax + bx) / 2, y: h.y + (ay + by) / 2, rot: Math.atan2(by - ay, bx - ax), speed: 0, route, wp: (at + 1) % route.length, cd: Math.random() * 2, aim: Math.atan2(by - ay, bx - ax), flash: 0, anim: Math.random() * 10, hold: 0 };
  });
  // Guards: at the gate, and walking the south and east walls.
  const gx = h.x + GATE.x, gy = h.y + GATE.y - 18;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const px = gx + s * (COMPOUND.gateHalf + 30 + k * 10), py = gy - k * 6;
      const r = person('guard', px, py, -1, id++);
      r.post = { ax: px, ay: py, bx: px, by: py };
      cs.people.push(r);
    }
  }
  const inner = COMPOUND.wall + 3;
  const walks: [number, number, number, number][] = [
    [COMPOUND.x0 + 40, COMPOUND.y1 - inner, -COMPOUND.gateHalf - 60, COMPOUND.y1 - inner],
    [COMPOUND.gateHalf + 60, COMPOUND.y1 - inner, COMPOUND.x1 - 40, COMPOUND.y1 - inner],
    [COMPOUND.x1 - inner, COMPOUND.y0 + 40, COMPOUND.x1 - inner, COMPOUND.y1 - 60],
    [COMPOUND.x0 + inner, COMPOUND.y0 + 40, COMPOUND.x0 + inner, COMPOUND.y1 - 60],
    [COMPOUND.x0 + 60, COMPOUND.y0 + inner, COMPOUND.x1 - 60, COMPOUND.y0 + inner],
  ];
  for (const [ax, ay, bx, by] of walks) {
    for (let k = 0; k < 2; k++) {
      const f = Math.random();
      const r = person('guard', h.x + ax + (bx - ax) * f, h.y + ay + (by - ay) * f, -1, id++);
      r.post = { ax: h.x + ax, ay: h.y + ay, bx: h.x + bx, by: h.y + by };
      cs.people.push(r);
    }
  }
  // Traffic round the loops.
  const fleet: [number, Car['kind'], number][] = [
    [0, 'forklift', 0], [0, 'truck', 2], [0, 'forklift', 3],
    [1, 'jeep', 0], [1, 'truck', 1], [1, 'tanker', 2],
    [2, 'forklift', 0], [2, 'forklift', 1], [2, 'tanker', 2],
    [3, 'jeep', 1], [3, 'truck', 3],
  ];
  fleet.forEach(([route, kind, at], k) => {
    const pts = CAR_ROUTES[route];
    const a = pts[at], b = pts[(at + 1) % pts.length];
    cs.cars.push({ route, i: (at + 1) % pts.length, x: h.x + (a[0] + b[0]) / 2, y: h.y + (a[1] + b[1]) / 2, rot: Math.atan2(b[1] - a[1], b[0] - a[0]), speed: 0, kind, col: ['#c8a030', '#b04a30', '#4a6a8a', '#6a7a4a', '#d0d0c8', '#8a5a9a'][k % 6] });
  });
  // Two bases in dock.
  for (const pad of [0, 2]) {
    const b = guest(g, pad);
    const P = PADS[pad];
    b.tank.x = h.x + P.x;
    b.tank.y = h.y + P.y;
    cs.bases.push(b);
  }
  // A hull already in the gateway (a save from mid-transit) keeps the doors open for it.
  if (gatewayBusy(g)) cs.gate.open = cs.gate.target = 1;
  applyGate(g, true);
  const inside = inCompound(g.player.x - h.x, g.player.y - h.y);
  g.hooks.toast(inside ? 'GATE CONTROL: Morning, Titan. The main gate is sealed. Roll down the lane and call us for clearance when you want out.' : 'GATE CONTROL: We have you on the scope, Titan. Call us from the gate when you want to come in.', '#40c4ff');
}

/** A hull wedged in the wall or a building (an old save, a tow gone wrong): the Hangar crews drag it into its bay. */
function unstick(g: Game, dt: number): void {
  const cs = g.compound;
  const p = g.player;
  if (p.dead || !p.fortress || !hullBlocked(g, p)) {
    cs.stuckT = 0;
    return;
  }
  cs.stuckT += dt;
  if (cs.stuckT < 2) return;
  cs.stuckT = 0;
  p.x = g.gen.spawn.x;
  p.y = g.gen.spawn.y;
  p.rot = g.gen.spawnRot ?? p.rot;
  p.speed = 0;
  p.pushX = p.pushY = 0;
  g.hooks.toast('HANGAR OPS: You were wedged in the structure, Titan. The tugs have dragged you back into your bay.', '#ffab40');
}

function person(kind: PersonKind, x: number, y: number, area: number, id: number): Resident {
  const civ = CIV_COLS[id % CIV_COLS.length];
  const uniform = kind === 'guard' || kind === 'soldier' || kind === 'sentry' || kind === 'rifle' ? '#4a5a3a' : kind === 'mech' ? '#d0a020' : kind === 'worker' ? '#c06a20' : kind === 'trader' ? '#8a4a8a' : civ;
  const hat = kind === 'guard' || kind === 'rifle' ? '#3a4a2a' : kind === 'mech' || kind === 'worker' ? '#ffd740' : HAIR[id % HAIR.length];
  return { x, y, tx: x, ty: y, area, kind, uniform, hat, skin: id % 5, wait: Math.random() * 4, face: id % 2 ? 1 : -1, anim: Math.random() * 10, walking: false };
}

function guest(g: Game, pad: number): GuestBase {
  const seed = Math.floor(Math.random() * 1e9);
  const name = BASE_NAMES[seed % BASE_NAMES.length];
  const t = buildRival(4 + (seed % 12), 1 + (seed % 3), seed, name);
  // Friendly crews: drawn in their class's colours (not a rival's red), never shot at, never in the battle.
  t.kind = 'main';
  t.team = 'player';
  t.rot = -Math.PI / 2;
  t.speed = 0;
  return { tank: t, name, pad, state: 'docked', path: [], t: 60 + Math.random() * 200 };
}

/** The way out from a pad (world points): round the Hangar's west side, along the lane, out of the gate and off. */
function pathOut(g: Game, pad: number): { x: number; y: number }[] {
  const h = home(g)!;
  const P = PADS[pad];
  const pts = [[P.x, P.y - 40], [-430, P.y - 40], [-430, 470], [0, 470], [0, COMPOUND.y1 - 60], [0, COMPOUND.y1 + 220], [500, COMPOUND.y1 + 900]];
  return pts.map(([x, y]) => ({ x: h.x + x, y: h.y + y }));
}

function pathIn(g: Game, pad: number): { x: number; y: number }[] {
  const h = home(g)!;
  const P = PADS[pad];
  const pts = [[0, COMPOUND.y1 - 60], [0, 470], [-430, 470], [-430, P.y], [P.x, P.y]];
  return pts.map(([x, y]) => ({ x: h.x + x, y: h.y + y }));
}

/** Drives a visiting base along its path; true when it has got there. */
function drive(g: Game, b: GuestBase, dt: number): boolean {
  const t = b.tank;
  const next = b.path[0];
  if (!next) return true;
  const dx = next.x - t.x, dy = next.y - t.y;
  const d = Math.hypot(dx, dy);
  if (d < 6) {
    b.path.shift();
    return b.path.length === 0;
  }
  const want = Math.atan2(dy, dx);
  let da = want - t.rot;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  t.rot += Math.max(-0.35 * dt, Math.min(0.35 * dt, da));
  // Slow for the corners, and wait for your hull if it's in the way.
  const ahead = t.toWorld(t.stats.length / 2 + 30, 0);
  // Hold short of a gate that isn't open (it may have been slammed on a horde).
  const gp = gateXY(g)!;
  const atGate = Math.abs(ahead.x - gp.x) < COMPOUND.gateHalf + 40 && Math.abs(ahead.y - gp.y) < 30 && g.compound.gate.open < 0.95;
  const blocked = atGate || (!g.player.dead && g.player.edgeDist(ahead.x, ahead.y) < 20);
  const target = blocked ? 0 : Math.abs(da) > 0.5 ? 3 : 9;
  t.speed += Math.max(-4 * dt, Math.min(2 * dt, target - t.speed));
  t.x += Math.cos(t.rot) * t.speed * dt;
  t.y += Math.sin(t.rot) * t.speed * dt;
  t.treadPhase += t.speed * dt;
  t.sideSpeed = [t.speed, t.speed];
  return false;
}

function updateBases(g: Game, dt: number): void {
  const cs = g.compound;
  const h = home(g)!;
  const gate = cs.gate;
  cs.trafficT -= dt;
  for (let i = cs.bases.length - 1; i >= 0; i--) {
    const b = cs.bases[i];
    const t = b.tank;
    switch (b.state) {
      case 'docked':
        t.speed = 0;
        t.sideSpeed = [0, 0];
        if (cs.trafficT <= 0 && !gate.req && gate.target === 0) {
          cs.trafficT = 150 + Math.random() * 150;
          b.state = 'waitOut';
          b.path = pathOut(g, b.pad);
          g.hooks.toast(`${b.name} to GATE CONTROL: requesting departure clearance.`, '#b0bec5');
          requestClearance(g, b.name);
        }
        break;
      case 'waitOut':
        // Roll up to the lane and wait there for the doors.
        if (gate.open > 0.95) b.state = 'leaving';
        else if (b.path.length > 3) drive(g, b, dt);
        else {
          t.speed = Math.max(0, t.speed - 4 * dt);
          if (!gate.req && gate.target === 0 && gate.deny <= 0) requestClearance(g, b.name);
        }
        break;
      case 'leaving':
        if (drive(g, b, dt)) {
          cs.bases.splice(i, 1);
          // Someone else is on the way in to take the pad.
          const n = guest(g, b.pad);
          n.state = 'arriving';
          n.tank.x = h.x + 700;
          n.tank.y = h.y + COMPOUND.y1 + 1100;
          n.path = [{ x: h.x, y: h.y + COMPOUND.y1 + 200 }];
          n.t = 0;
          cs.bases.push(n);
        }
        break;
      case 'arriving':
        if (drive(g, b, dt)) {
          b.state = 'waitIn';
          b.path = pathIn(g, b.pad);
          g.hooks.toast(`${b.name} to GATE CONTROL: requesting entry. We're low on water and good for trade.`, '#b0bec5');
          requestClearance(g, b.name);
        }
        break;
      case 'waitIn':
        t.speed = Math.max(0, t.speed - 4 * dt);
        if (gate.open > 0.95) b.state = 'entering';
        else if (!gate.req && gate.target === 0 && gate.deny <= 0) requestClearance(g, b.name);
        break;
      case 'entering':
        if (drive(g, b, dt)) {
          b.state = 'docked';
          t.speed = 0;
          t.rot = -Math.PI / 2;
        }
        break;
    }
  }
}

/** A sieging creature clawing at the shut doors: wears them down, and at nothing left they give way. */
export function clawGate(g: Game, dmg: number): void {
  const gate = g.compound.gate;
  if (gate.breach > 0 || gate.open > 0.3) return;
  gate.clawT = 3;
  gate.hp -= dmg / GATE_HP;
  if (gate.hp > 0) return;
  gate.hp = 0;
  gate.breach = 25;
  gate.req = null;
  g.hooks.toast('GATE CONTROL: THE MAIN GATE IS BREACHED! THEY\'RE COMING THROUGH! ALL GUNS ON THE GATEWAY!', '#ff1744');
  g.hooks.sound('alarm', g.player.x, g.player.y, 0.8);
  const gp = gateXY(g);
  if (gp) {
    g.fx.push({ t: 'boom', x: gp.x, y: gp.y, r: 30, color: '#ffab40', big: true });
    g.fx.push({ t: 'shake', amt: 0.6 });
  }
}

function updateGate(g: Game, dt: number): void {
  const cs = g.compound;
  const gate = cs.gate;
  gate.deny = Math.max(0, gate.deny - dt);
  gate.clawT = Math.max(0, gate.clawT - dt);
  // Breached: stuck open until the crews get the doors moving again.
  if (gate.breach > 0) {
    gate.breach -= dt;
    gate.open = gate.target = 1;
    gate.idle = 0;
    if (gate.breach <= 0) {
      gate.hp = 0.35;
      g.hooks.toast('GATE CONTROL: Gate crews have the doors running again. Get that gateway clear!', '#40c4ff');
    }
    applyGate(g);
    return;
  }
  // Patched up while nothing is clawing at them.
  if (gate.clawT <= 0) gate.hp = Math.min(1, gate.hp + dt * 0.008);
  if (gate.req) {
    gate.req.t -= dt;
    if (gate.req.t <= 0) answer(g);
  }
  const busy = gatewayBusy(g);
  if (gate.target === 1) {
    // Held open while the doors are still opening and while a hull is on its way through.
    gate.idle = busy || gate.open < 0.98 || gatewayBusy(g, 220) ? 0 : gate.idle + dt;
    const waiting = cs.bases.some((b) => b.state === 'waitOut' || b.state === 'waitIn' || b.state === 'leaving' || b.state === 'entering');
    // A rush on an open, empty gate: slam it.
    if (!busy && gateThreat(g) > 6) {
      gate.target = 0;
      g.hooks.toast('GATE CONTROL: HOSTILES AT THE GATE! CLOSING THE MAIN GATE!', '#ff5252');
      g.hooks.sound('alarm', g.player.x, g.player.y, 0.5);
    } else if (gate.idle > 8 && !waiting) {
      gate.target = 0;
      g.hooks.toast('GATE CONTROL: Gateway clear. Closing the main gate.', '#40c4ff');
    }
  }
  // The doors never close on a hull.
  const speed = 1 / 7;
  if (gate.open < gate.target) gate.open = Math.min(gate.target, gate.open + speed * dt);
  else if (gate.open > gate.target && !busy) gate.open = Math.max(gate.target, gate.open - speed * dt);
  applyGate(g);
}

/** How hard the garrison's guns hit here and now. */
function garrisonDmg(g: Game): number {
  const h = home(g)!;
  return 14 * (0.8 + 0.25 * threatAt(h.x, h.y)) * Math.max(1, g.escalation() * 0.8);
}

/** Tower gun crews: the nearest hostile in reach, a burst every half second or so. */
function updateTowers(g: Game, dt: number): void {
  const h = home(g)!;
  const cs = g.compound;
  // Enough to thin a horde at the gate, not to stop it dead: they get to the doors and claw at them.
  const dmg = garrisonDmg(g);
  TOWERS.forEach((tw, i) => {
    const st = cs.towers[i];
    st.flash = Math.max(0, st.flash - dt);
    st.cd -= dt;
    if (st.cd > 0) return;
    st.cd = (tw.gate ? 0.8 : 1.3) * (0.85 + Math.random() * 0.3);
    const x = h.x + tw.x, y = h.y + tw.y;
    let best = null as (typeof g.enemies)[number] | null, bd = 300;
    for (const e of g.enemies) {
      if (e.hp <= 0 || e.colossus || e.burrowed) continue;
      const dx = e.x - x, dy = e.y - y;
      if (Math.abs(dx) > bd || Math.abs(dy) > bd) continue;
      const d = Math.hypot(dx, dy);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) return;
    st.aim = Math.atan2(best.y - y, best.x - x);
    st.flash = 0.08;
    g.fx.push({ t: 'beam', x0: x, y0: y - 4, x1: best.x, y1: best.y, color: tw.gate ? '#ffab40' : '#ffe082', w: tw.gate ? 1.4 : 1, life: 0.07 });
    const hit = tw.gate ? dmg * 1.5 : dmg;
    // The gun crews' kills are theirs: you only get a little of the experience.
    if (best.hp <= hit) best.xp *= 0.25;
    damageEnemy(g, best, hit, { silent: true });
    if (Math.random() < 0.15) g.hooks.sound('smg', x, y, 0.12);
  });
}

/** The front's guns: bunker twin guns (quick bursts) and dug-in tanks (a heavy shell that bursts among them). */
function updateFront(g: Game, dt: number, dmg: number): void {
  const h = home(g)!;
  const cs = g.compound;
  FRONT_GUNS.forEach((gn, i) => {
    const st = cs.front[i];
    if (!st) return;
    st.flash = Math.max(0, st.flash - dt);
    st.cd -= dt;
    if (st.cd > 0) return;
    const tank = gn.kind === 'tank';
    st.cd = (tank ? 2.6 : 0.55) * (0.85 + Math.random() * 0.3);
    const x = h.x + gn.x, y = h.y + gn.y;
    const e = nearestHostile(g, x, y, tank ? 460 : 360);
    if (!e) return;
    st.aim = Math.atan2(e.y - y, e.x - x);
    st.flash = tank ? 0.14 : 0.07;
    if (tank) {
      g.fx.push({ t: 'beam', x0: x, y0: y, x1: e.x, y1: e.y, color: '#ffd080', w: 2, life: 0.06 });
      g.fx.push({ t: 'boom', x: e.x, y: e.y, r: 9, color: '#ffab40' });
      for (const o of g.enemiesNear(e.x, e.y, 10)) {
        if (o.hp <= 0) continue;
        const hit = dmg * 3.2;
        if (o.hp <= hit) o.xp *= 0.25;
        damageEnemy(g, o, hit, { silent: true });
      }
      if (Math.random() < 0.4) g.hooks.sound('cannon', x, y, 0.2);
    } else {
      for (const s of [-1, 1]) g.fx.push({ t: 'beam', x0: x + s * 1.2, y0: y - 3, x1: e.x, y1: e.y, color: '#ffe082', w: 1, life: 0.06 });
      const hit = dmg * 1.3;
      if (e.hp <= hit) e.xp *= 0.25;
      damageEnemy(g, e, hit, { silent: true });
      if (Math.random() < 0.12) g.hooks.sound('smg', x, y, 0.12);
    }
  });
}

/** The war machines: walk or drive the loop, stop and fight whatever comes in reach, give way to a hull. */
function updateMachines(g: Game, dt: number, dmg: number): void {
  const h = home(g)!;
  const cs = g.compound;
  const hulls: Tank[] = [g.player, ...cs.bases.map((b) => b.tank)];
  for (const m of cs.machines) {
    const spec = MACHINE[m.kind];
    m.flash = Math.max(0, m.flash - dt);
    m.hold = Math.max(0, m.hold - dt);
    m.cd -= dt;
    // Fight: the nearest hostile in reach.
    const e = m.cd <= 0 || m.hold > 0 ? nearestHostile(g, m.x, m.y, spec.range) : null;
    if (e) {
      m.aim = Math.atan2(e.y - m.y, e.x - m.x);
      m.hold = 1.6;
      if (m.cd <= 0) {
        m.cd = spec.rate * (0.85 + Math.random() * 0.3);
        m.flash = 0.1;
        const hit = dmg * spec.dmg;
        if (m.kind === 'walker') {
          for (const sd of [-1, 1]) g.fx.push({ t: 'beam', x0: m.x - Math.sin(m.aim) * sd * 4, y0: m.y + Math.cos(m.aim) * sd * 4, x1: e.x, y1: e.y, color: '#ffd080', w: 1.3, life: 0.06 });
        } else g.fx.push({ t: 'beam', x0: m.x, y0: m.y - (m.kind === 'mech' ? 3 : 1), x1: e.x, y1: e.y, color: m.kind === 'mech' ? '#ff9a50' : '#ffe0a0', w: m.kind === 'tank' ? 2 : 1, life: 0.07 });
        if (spec.splash) {
          g.fx.push({ t: 'boom', x: e.x, y: e.y, r: Math.min(spec.splash, 3.5), color: '#ffab40' });
          for (const o of g.enemiesNear(e.x, e.y, spec.splash)) {
            if (o.hp <= 0) continue;
            if (o.hp <= hit) o.xp *= 0.25;
            damageEnemy(g, o, hit, { silent: true });
          }
        } else {
          if (e.hp <= hit) e.xp *= 0.25;
          damageEnemy(g, e, hit, { silent: true });
        }
        if (Math.random() < 0.25) g.hooks.sound(m.kind === 'tank' ? 'cannon' : 'smg', m.x, m.y, 0.15);
      }
    }
    // Walk the loop (standing its ground while it's fighting).
    const [tx, ty] = m.route[m.wp];
    const dx = h.x + tx - m.x, dy = h.y + ty - m.y, d = Math.hypot(dx, dy);
    if (d < 2) {
      m.wp = (m.wp + 1) % m.route.length;
      continue;
    }
    const want = Math.atan2(dy, dx);
    let da = want - m.rot;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    m.rot += Math.max(-dt * 0.9, Math.min(dt * 0.9, da));
    let stop = m.hold > 0 || Math.abs(da) > 0.6;
    const ax = m.x + Math.cos(m.rot) * 8, ay = m.y + Math.sin(m.rot) * 8;
    for (const t of hulls) if (!t.dead && Math.abs(t.x - ax) < t.stats.length && Math.abs(t.y - ay) < t.stats.length && t.edgeDist(ax, ay) < 10) stop = true;
    const v = stop ? 0 : Math.min(spec.v, d);
    m.speed += Math.max(-4 * dt, Math.min(2 * dt, v - m.speed));
    m.x += Math.cos(m.rot) * m.speed * dt;
    m.y += Math.sin(m.rot) * m.speed * dt;
    m.anim += dt * m.speed * (m.kind === 'walker' ? 0.55 : 1);
    if (!e && m.hold <= 0) m.aim += Math.atan2(Math.sin(m.rot - m.aim), Math.cos(m.rot - m.aim)) * Math.min(1, dt * 2);
  }
}

/** The rifle line at the front and the bunkers' sentries: a round each at the nearest hostile in reach. */
function updateRifles(g: Game, dt: number, dmg: number): void {
  for (const r of g.compound.people) {
    if (r.kind !== 'rifle' && r.kind !== 'sentry') continue;
    r.wait -= dt;
    if (r.wait > 0) continue;
    const e = nearestHostile(g, r.x, r.y, 230);
    r.aimT = e ? 2 : Math.max(0, (r.aimT ?? 0) - dt);
    if (!e) {
      r.wait = 0.5;
      continue;
    }
    r.wait = 0.7 + Math.random() * 0.6;
    r.face = e.x < r.x ? -1 : 1;
    g.fx.push({ t: 'beam', x0: r.x, y0: r.y + 0.6, x1: e.x, y1: e.y, color: '#fff0b0', w: 0.6, life: 0.05 });
    if (Math.random() < 0.5) g.fx.push({ t: 'muzzle', x: r.x, y: r.y + 0.6, a: Math.atan2(e.y - r.y, e.x - r.x), size: 1, color: '#ffd54f' });
    const hit = dmg * 0.35;
    if (e.hp <= hit) e.xp *= 0.25;
    damageEnemy(g, e, hit, { silent: true });
  }
}

/** The nearest live hostile to (x, y) within `r` (none underground). */
function nearestHostile(g: Game, x: number, y: number, r: number): Game['enemies'][number] | null {
  let best: Game['enemies'][number] | null = null, bd = r;
  for (const e of g.enemies) {
    if (e.hp <= 0 || e.burrowed) continue;
    const dx = e.x - x, dy = e.y - y;
    if (Math.abs(dx) > bd || Math.abs(dy) > bd) continue;
    const d = Math.hypot(dx, dy);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** Where a gunship out on a sortie holds: ahead of your Titan while it's heading out, otherwise over the front. */
function station(g: Game, a: Gunship, i: number): { x: number; y: number } {
  const h = home(g)!;
  const p = g.player;
  const gy = h.y + COMPOUND.y1;
  const out = !p.dead && p.y > gy - 40 && Math.abs(p.x - h.x) < 2400 && p.y - gy < 2400;
  if (out) {
    const L = p.stats.length / 2;
    const f = L + 140 + (i >> 1) * 70, lat = (i % 2 ? 1 : -1) * (60 + (i >> 1) * 40);
    return { x: p.x + Math.cos(p.rot) * f - Math.sin(p.rot) * lat, y: p.y + Math.sin(p.rot) * f + Math.cos(p.rot) * lat };
  }
  const spots: [number, number][] = [[-150, 300], [150, 300], [-280, 440], [280, 440]];
  const [sx, sy] = spots[i % spots.length];
  return { x: h.x + sx, y: gy + sy };
}

function fly(a: Gunship, tx: number, ty: number, dt: number, top: number): number {
  const dx = tx - a.x, dy = ty - a.y;
  const d = Math.hypot(dx, dy);
  const sp = Math.min(top, d * 0.9);
  const wx = d > 0.01 ? (dx / d) * sp : 0, wy = d > 0.01 ? (dy / d) * sp : 0;
  const k = Math.min(1, dt * 2.2);
  a.vx += (wx - a.vx) * k;
  a.vy += (wy - a.vy) * k;
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  if (Math.hypot(a.vx, a.vy) > 3) {
    const want = Math.atan2(a.vy, a.vx);
    let da = want - a.rot;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    a.rot += Math.max(-2.2 * dt, Math.min(2.2 * dt, da));
  }
  return d;
}

/** The gunships: lift off for a sortie, hold their station firing on anything near, come home and land. */
function updateAir(g: Game, dt: number, dmg: number): void {
  const h = home(g)!;
  const cs = g.compound;
  cs.sortie = Math.max(0, cs.sortie - dt);
  if (cs.alarm) cs.sortie = Math.max(cs.sortie, 25);
  cs.air.forEach((a, i) => {
    const pd = HELIPADS[a.pad];
    const px = h.x + pd.x, py = h.y + pd.y;
    a.flash = Math.max(0, a.flash - dt);
    if (a.state !== 'parked') a.rotor += dt * 26;
    switch (a.state) {
      case 'parked':
        a.x = px;
        a.y = py;
        a.z = 0;
        // They go up one after another.
        if (cs.sortie > 0 && (i === 0 || cs.air[i - 1].state !== 'parked' || cs.air[i - 1].z > 8)) a.state = 'up';
        break;
      case 'up':
        a.rotor += dt * 10;
        a.z = Math.min(30, a.z + 9 * dt);
        if (a.z >= 30) a.state = 'out';
        break;
      case 'out': {
        const st = station(g, a, i);
        a.ph += dt * 0.55;
        const ox = Math.cos(a.ph + i) * 70, oy = Math.sin(a.ph + i) * 46;
        fly(a, st.x + ox, st.y + oy, dt, 72);
        a.z = 30 + Math.sin(a.ph * 2 + i) * 2;
        const e = nearestHostile(g, a.x, a.y, 300);
        if (e) {
          a.aim = Math.atan2(e.y - a.y, e.x - a.x);
          a.cd -= dt;
          a.rcd -= dt;
          if (a.cd <= 0) {
            a.cd = 0.22;
            a.flash = 0.06;
            g.fx.push({ t: 'beam', x0: a.x, y0: a.y - 10, x1: e.x + (Math.random() - 0.5) * 3, y1: e.y + (Math.random() - 0.5) * 3, color: '#ffe082', w: 1, life: 0.05 });
            const hit = dmg * 0.8;
            if (e.hp <= hit) e.xp *= 0.25;
            damageEnemy(g, e, hit, { silent: true });
          }
          if (a.rcd <= 0) {
            a.rcd = 3.2 + Math.random();
            // A pair of rockets into the thick of them.
            for (const s of [-1, 1]) {
              const tx = e.x + s * 5, ty = e.y + (Math.random() - 0.5) * 6;
              g.fx.push({ t: 'beam', x0: a.x + s * 3, y0: a.y - 10, x1: tx, y1: ty, color: '#ff9100', w: 1.6, life: 0.12 });
              g.fx.push({ t: 'boom', x: tx, y: ty, r: 8, color: '#ff9100' });
              for (const o of g.enemiesNear(tx, ty, 9)) {
                if (o.hp <= 0) continue;
                const hit = dmg * 2.2;
                if (o.hp <= hit) o.xp *= 0.25;
                damageEnemy(g, o, hit, { silent: true });
              }
            }
            if (Math.random() < 0.5) g.hooks.sound('rocket', a.x, a.y, 0.2);
          }
        } else a.aim += (a.rot - a.aim) * Math.min(1, dt * 2);
        if (cs.sortie <= 0 && !nearestHostile(g, st.x, st.y, 380)) a.state = 'home';
        break;
      }
      case 'home':
        if (cs.sortie > 0) {
          a.state = 'out';
          break;
        }
        a.z += (30 - a.z) * Math.min(1, dt);
        if (fly(a, px, py, dt, 60) < 3) a.state = 'down';
        break;
      case 'down':
        a.vx = a.vy = 0;
        a.x += (px - a.x) * Math.min(1, dt * 2);
        a.y += (py - a.y) * Math.min(1, dt * 2);
        a.rot += Math.atan2(Math.sin(-Math.PI / 2 - a.rot), Math.cos(-Math.PI / 2 - a.rot)) * Math.min(1, dt * 1.5);
        a.z = Math.max(0, a.z - 7 * dt);
        if (a.z <= 0) a.state = cs.sortie > 0 ? 'up' : 'parked';
        break;
    }
  });
}

/** A horde comes for the compound: out of the wastes to the south (east, south or west of the gate), making for it. */
function spawnSiege(g: Game): void {
  const h = home(g)!;
  const a = Math.PI * (0.12 + Math.random() * 0.76);
  const d = 480 + Math.random() * 200;
  const cx = h.x + GATE.x + Math.cos(a) * d, cy = h.y + GATE.y + Math.sin(a) * d;
  if (!g.map.inside(Math.floor(cx), Math.floor(cy))) return;
  const zone = g.map.zoneAt(cx, cy);
  const threat = threatAt(cx, cy);
  const n = Math.round((60 + 12 * Math.min(12, g.stats.hordes ?? 0)) * Math.min(2.5, g.escalation()));
  let made = 0;
  for (let i = 0; i < n * 3 && made < n; i++) {
    const kind = pickKind(threat, zone);
    const def = ENEMIES[kind];
    if (!def || (def.size ?? 1) >= 8 || def.still) continue;
    const e = g.spawnEnemy(kind, cx + (Math.random() - 0.5) * 220, cy + (Math.random() - 0.5) * 160, threat);
    e.horde = true;
    e.aggro = true;
    e.siege = true;
    if (!def.flying) e.speed *= 1.25;
    made++;
  }
  const dirs = ['EAST', 'SOUTH-EAST', 'SOUTH', 'SOUTH-WEST', 'WEST', 'NORTH-WEST', 'NORTH', 'NORTH-EAST'];
  const dir = dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  g.compound.sortie = Math.max(g.compound.sortie, 140);
  g.hooks.toast(`GATE CONTROL: HORDE SIGHTED TO THE ${dir}, ${(d / 1000).toFixed(1)} KM, ${made} STRONG. SIRENS ON, TOWERS WEAPONS FREE.`, '#ff5252');
  g.hooks.sound('alarm', g.player.x, g.player.y, 0.6);
}

/** Where a sieging creature heads: the gate, while you're inside the wall (null: hunt as usual). */
export function siegeGoal(g: Game, x: number, y: number, seed = 0): { x: number; y: number } | null {
  const h = home(g);
  if (!h) return null;
  const p = g.player;
  if (!inCompound(p.x - h.x, p.y - h.y)) return null;
  const gx = h.x + GATE.x, gy = h.y + GATE.y;
  // Through an open gate they go for you.
  if (g.compound.gate.open > 0.3 && Math.abs(x - gx) < COMPOUND.gateHalf + 30 && y > gy - 60 && y < gy + 90) return null;
  if (inCompound(x - h.x, y - h.y)) return null;
  // Each makes for its own stretch of the doors (so they spread along them rather than pile on one spot).
  return { x: gx + ((((seed * 7919) % 97) + 97) % 97 / 97 - 0.5) * COMPOUND.gateHalf * 1.7, y: gy + 12 + ((seed * 31) % 7) * 2 };
}

/** Drives the compound's traffic round its loops, stopping for hulls and for each other. */
function updateCars(g: Game, dt: number): void {
  const h = home(g)!;
  const cs = g.compound;
  const hulls: Tank[] = [g.player, ...cs.bases.map((b) => b.tank)];
  for (const car of cs.cars) {
    const pts = CAR_ROUTES[car.route];
    const [tx, ty] = pts[car.i];
    const dx = h.x + tx - car.x, dy = h.y + ty - car.y;
    const d = Math.hypot(dx, dy);
    if (d < 3) {
      car.i = (car.i + 1) % pts.length;
      continue;
    }
    const size = CAR_SIZE[car.kind];
    let da = Math.atan2(dy, dx) - car.rot;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    car.rot += Math.max(-1.3 * dt, Math.min(1.3 * dt, da));
    // Something in the way: a hull (yours or a visiting base's) or the car in front.
    const ax = car.x + Math.cos(car.rot) * (size.l / 2 + 5), ay = car.y + Math.sin(car.rot) * (size.l / 2 + 5);
    let stop = false;
    for (const t of hulls) if (!t.dead && Math.abs(t.x - ax) < t.stats.length && Math.abs(t.y - ay) < t.stats.length && t.edgeDist(ax, ay) < 9) stop = true;
    for (const o of cs.cars) if (o !== car && Math.abs(o.x - ax) < 7 && Math.abs(o.y - ay) < 7) stop = true;
    const want = stop ? 0 : Math.abs(da) > 0.4 ? size.v * 0.35 : Math.min(size.v, d * 0.8 + 1.5);
    car.speed += Math.max(-8 * dt, Math.min(3 * dt, want - car.speed));
    car.x += Math.cos(car.rot) * car.speed * dt;
    car.y += Math.sin(car.rot) * car.speed * dt;
  }
}

/**
 * A hull bearing down on someone: they sprint for the nearer side, out past its flank, and stay there till it's by.
 * They see it coming a few seconds out (twice as far when your beacons are turning). True while they're dodging.
 */
function dodgeHulls(g: Game, r: Resident, hulls: Tank[], dt: number): boolean {
  if ((r.dodge ?? 0) > 0) {
    r.dodge = Math.max(0, r.dodge! - dt);
    const dx = r.tx - r.x, dy = r.ty - r.y, d = Math.hypot(dx, dy);
    if (d > 0.4) {
      r.x += (dx / d) * Math.min(d, 4.4 * dt);
      r.y += (dy / d) * Math.min(d, 4.4 * dt);
      r.face = dx >= 0 ? 1 : -1;
      r.walking = true;
    } else r.walking = false;
    if (r.dodge === 0) {
      // Back to it: a guard to their post, anyone else to their patch after a moment.
      r.wait = r.post ? 0 : 1.5;
      if (r.post) {
        r.tx = r.post.ax;
        r.ty = r.post.ay;
      }
    }
    return true;
  }
  for (const t of hulls) {
    if (t.dead || Math.abs(t.speed) < 0.6) continue;
    const L = t.stats.length / 2, W = t.stats.width / 2;
    const reach = (Math.abs(t.speed) * 5 + 25) * (t === g.player && g.helm.beacons ? 2 : 1);
    if (Math.abs(r.x - t.x) > L + reach + W || Math.abs(r.y - t.y) > L + reach + W) continue;
    const l = t.toLocal(r.x, r.y);
    const along = l.lx * Math.sign(t.speed);
    if (along < -L || along > L + reach || Math.abs(l.lz) > W + 10) continue;
    const side = l.lz >= 0 ? 1 : -1;
    const out = t.toWorld(l.lx, side * (W + 16 + ((r.anim * 7) % 10)));
    r.tx = out.x;
    r.ty = out.y;
    // Long enough to get there and wait for the hull to pass.
    r.dodge = Math.hypot(out.x - r.x, out.y - r.y) / 4.4 + 2 + Math.min(6, (L * 2) / Math.max(1, Math.abs(t.speed)));
    r.wait = 0;
    return true;
  }
  return false;
}

function updatePeople(g: Game, dt: number): void {
  const h = home(g)!;
  const cs = g.compound;
  const run = cs.alarm;
  const apron = AREAS.findIndex((a) => a.kind === 'apron');
  const hulls: Tank[] = [g.player, ...cs.bases.map((b) => b.tank)];
  for (const r of cs.people) {
    r.anim += dt;
    if (dodgeHulls(g, r, hulls, dt)) continue;
    if (r.post) {
      // Guards: walk their stretch of wall, or stand their post (facing out, rifles up in a siege).
      if (r.post.ax === r.post.bx && r.post.ay === r.post.by) {
        // (Walking back to it after getting out of a hull's way.)
        const bd = Math.hypot(r.post.ax - r.x, r.post.ay - r.y);
        if (bd > 0.5) {
          r.x += ((r.post.ax - r.x) / bd) * Math.min(bd, 1.6 * dt);
          r.y += ((r.post.ay - r.y) / bd) * Math.min(bd, 1.6 * dt);
          r.tx = r.post.ax;
          r.ty = r.post.ay;
          r.walking = true;
          continue;
        }
        r.walking = false;
        if (r.kind === 'guard') r.face = r.x < h.x ? -1 : 1;
        continue;
      }
      const dx = r.tx - r.x, dy = r.ty - r.y, d = Math.hypot(dx, dy);
      if (d < 1) {
        const f = Math.random();
        r.tx = r.post.ax + (r.post.bx - r.post.ax) * f;
        r.ty = r.post.ay + (r.post.by - r.post.ay) * f;
        r.wait = run ? 0 : 3 + Math.random() * 6;
      }
      if (r.wait > 0) {
        r.wait -= dt;
        r.walking = false;
        continue;
      }
      const sp = run ? 2.4 : 1.1;
      r.x += (dx / (d || 1)) * Math.min(d, sp * dt);
      r.y += (dy / (d || 1)) * Math.min(d, sp * dt);
      r.face = dx >= 0 ? 1 : -1;
      r.walking = true;
      continue;
    }
    // Everyone else: potter about their patch; when the sirens go, run for the Hangar.
    const areaI = run && r.kind !== 'mech' ? apron : r.area;
    const a = AREAS[areaI];
    const dx = r.tx - r.x, dy = r.ty - r.y, d = Math.hypot(dx, dy);
    if (d < 0.6 || (run && r.area !== areaI && !(r.tx >= h.x + a.x0 && r.tx <= h.x + a.x1 && r.ty >= h.y + a.y0 && r.ty <= h.y + a.y1))) {
      if (r.wait > 0 && !(run && r.area !== areaI && d > 0.6)) {
        r.wait -= dt;
        r.walking = false;
        continue;
      }
      r.tx = h.x + a.x0 + Math.random() * (a.x1 - a.x0);
      r.ty = h.y + a.y0 + Math.random() * (a.y1 - a.y0);
      r.wait = run ? 0.5 : 2 + Math.random() * 8;
      continue;
    }
    const sp = run ? 3.2 : r.kind === 'trader' ? 0.8 : 1.3;
    r.x += (dx / d) * Math.min(d, sp * dt);
    r.y += (dy / d) * Math.min(d, sp * dt);
    r.face = dx >= 0 ? 1 : -1;
    r.walking = true;
  }
}

const CHATTER = [
  'MARKET: Fresh water in from Northridge. Rations for scrap, two to one.',
  'GATE CONTROL: Tower six, relief is on the way up. Stay sharp.',
  'CLINIC: Two more from the east road patrol. Anyone with O-negative, come see us.',
  'HANGAR OPS: Bay three is clear. Next hull in, sound off.',
  'WATCH: Dust on the horizon, south-south-west. Probably nothing. Probably.',
  'MARKET: The noodle stall is open again. Don\'t ask what\'s in the broth.',
  'DOCKS: Somebody tell the Rust Mother crew their crane is leaking again.',
  'ARMORY: Rifle drill at the gatehouse at the top of the hour.',
];

export function updateCompound(g: Game, dt: number): void {
  const h = home(g);
  const cs = g.compound;
  if (!h) return;
  const p = g.player;
  const dist = Math.hypot(p.x - h.x, p.y - (h.y + 280));
  if (dist > 4000) {
    cs.prompt = null;
    if (g.fog.lit.length) {
      g.fog.lit = [];
      g.fog.version++;
    }
    return;
  }
  // The towers watch the compound and the ground round it: always in sight while you're near home.
  if (!g.fog.lit.length) {
    const pad = 260;
    g.fog.lit = [{ x0: h.x + COMPOUND.x0 - pad, y0: h.y + COMPOUND.y0 - pad, x1: h.x + COMPOUND.x1 + pad, y1: h.y + FORWARD.y1 + pad }];
    g.fog.version++;
  }
  if (!cs.inited) init(g);
  unstick(g, dt);
  updateGate(g, dt);
  updateTowers(g, dt);
  updateFront(g, dt, garrisonDmg(g));
  updateMachines(g, dt, garrisonDmg(g));
  updateRifles(g, dt, garrisonDmg(g));
  updateAir(g, dt, garrisonDmg(g));
  updateBases(g, dt);
  updateCars(g, dt);
  // The sirens: hostiles near the wall.
  let near = 0;
  for (const e of g.enemies) if (e.hp > 0 && inCompound(e.x - h.x, e.y - h.y, 220)) near++;
  cs.alarm = near > 4;
  updatePeople(g, dt);
  // Sieges come while you're about.
  if (dist < 2200 && g.campaign.finale !== 'active') {
    cs.siegeT -= dt;
    if (cs.siegeT <= 0) {
      cs.siegeT = 170 + Math.random() * 120;
      spawnSiege(g);
    }
  }
  // Radio chatter while you're inside.
  const inside = inCompound(p.x - h.x, p.y - h.y);
  if (inside) {
    cs.chatterT -= dt;
    if (cs.chatterT <= 0) {
      cs.chatterT = 70 + Math.random() * 80;
      g.hooks.toast(CHATTER[Math.floor(Math.random() * CHATTER.length)], '#90a4ae');
    }
  }
  // The HUD offers to ask for clearance near the gate while it's shut.
  const gp = gateXY(g)!;
  const nearGate = Math.abs(p.x - gp.x) < 420 && Math.abs(p.y - gp.y) < 420;
  cs.prompt = !p.dead && nearGate && cs.gate.target === 0 && !cs.gate.req ? (p.y < gp.y ? 'exit' : 'enter') : null;
}
