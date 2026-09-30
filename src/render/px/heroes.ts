import { hash2, rgb, type RGB } from './pixels';

/**
 * People, and the robots that work beside them, painted like 32-bit sprite art. Every figure is a posed skeleton
 * in 3D, true to life in its proportions (seven and a half heads tall, shoulders two heads across, arms to mid-thigh)
 * and projected for the view it's seen in: from the side for the cutaways and cards, a three-quarter turn toward
 * you, or from above at an angle for the tactical view, facing whichever way the person is going. Each part is a
 * shaded volume (light from the upper left, warm highlights, cool shadows, a thin dark rim), painted at three times
 * the size it's shown and scaled down smooth, then given a soft outline so it reads over busy ground.
 *
 *  - Kit by job: riflemen in helmets and plate carriers with packs and radios, power-armoured marines with glowing
 *    visors, heavy gunners with rotary guns, snipers in hoods, officers in peaked caps and long coats, engineers in
 *    hard hats and hi-vis, mechanics in overalls, medics, pilots, flag signallers with ear defenders, cooks, deckhands
 *    in hoodies, firefighters in bunker coats, traders in head wraps and ponchos, and the brass-and-steel builder
 *    robots with a boiler glowing in the chest.
 *  - Poses: standing (at port arms when armed), an eight-frame walk and six-frame run, aiming, flag signals, working,
 *    welding, carrying a crate, saluting, sitting, typing, hosing, cheering, binoculars, ducking, pointing, asleep.
 *
 * A person's build, skin, hair and face come from their seed; the uniform from their job, toned to their department.
 */

export type HeroRole =
  | 'rifleman' | 'marine' | 'heavy' | 'sniper' | 'officer' | 'engineer' | 'mechanic' | 'medic' | 'pilot' | 'signal'
  | 'cook' | 'deckhand' | 'firefighter' | 'trader' | 'crew' | 'robot';

export type HeroPose =
  | 'stand' | 'walk' | 'run' | 'aim' | 'wave' | 'work' | 'carry' | 'salute' | 'sit' | 'sleep' | 'hose' | 'weld'
  | 'type' | 'cheer' | 'look' | 'duck' | 'point';

export interface HeroSpec {
  role: HeroRole;
  seed: number;
  /** Department or unit colour (the uniform is a muted version of it). */
  color?: string;
}

/** Seen from the side (facing right, turned a little toward you), or from above facing a screen heading (radians). */
export type HeroView = 'side' | { heading: number };

type Head = 'helmet' | 'marine' | 'hardhat' | 'cap' | 'capback' | 'peaked' | 'hood' | 'chef' | 'medic' | 'pilot' | 'firehelm' | 'earmuff' | 'wrap' | 'robot' | 'none';
type Torso = 'jacket' | 'vest' | 'armor' | 'hivis' | 'coat' | 'overalls' | 'apron' | 'hoodie' | 'flight' | 'bunker' | 'poncho' | 'robot';
type Held = 'rifle' | 'minigun' | 'sniper' | 'wrench' | 'medkit' | 'flags' | 'clipboard' | 'none';

interface Kit {
  head: Head;
  torso: Torso;
  legs: string;
  boots: string;
  held: Held;
  pack?: 'pack' | 'ammo' | 'tank' | 'bag' | 'boiler';
  uni: string;
  glow?: string;
  /** Wider and deeper (armour, plate carriers). */
  bulk?: number;
  gloves?: boolean;
}

const KITS: Record<HeroRole, Kit> = {
  rifleman: { head: 'helmet', torso: 'vest', legs: '#55603f', boots: '#3a2e22', held: 'rifle', pack: 'pack', uni: '#5d6a45', bulk: 1.08, gloves: true },
  marine: { head: 'marine', torso: 'armor', legs: '#3c4652', boots: '#23272d', held: 'rifle', uni: '#4a5663', glow: '#ffa040', bulk: 1.22, gloves: true },
  heavy: { head: 'helmet', torso: 'armor', legs: '#4e5838', boots: '#2e261c', held: 'minigun', pack: 'ammo', uni: '#56603f', bulk: 1.28, gloves: true },
  sniper: { head: 'hood', torso: 'jacket', legs: '#4c4a3a', boots: '#3a2e22', held: 'sniper', pack: 'pack', uni: '#56553f' },
  officer: { head: 'peaked', torso: 'coat', legs: '#2a2e2a', boots: '#18140f', held: 'none', uni: '#3f4d3c' },
  engineer: { head: 'hardhat', torso: 'hivis', legs: '#4a4e3e', boots: '#4a3622', held: 'wrench', uni: '#ff8a1e', gloves: true },
  mechanic: { head: 'capback', torso: 'overalls', legs: '#3b5782', boots: '#2a2018', held: 'wrench', uni: '#3b5782' },
  medic: { head: 'medic', torso: 'jacket', legs: '#5a6048', boots: '#3a2e22', held: 'medkit', pack: 'bag', uni: '#dcdcd2' },
  pilot: { head: 'pilot', torso: 'flight', legs: '#6c7858', boots: '#2a2018', held: 'none', uni: '#6c7858' },
  signal: { head: 'earmuff', torso: 'hivis', legs: '#4a4e3e', boots: '#3a2e22', held: 'flags', uni: '#f2d020', gloves: true },
  cook: { head: 'chef', torso: 'apron', legs: '#2c2e34', boots: '#1e1a16', held: 'none', uni: '#f2f2ea' },
  deckhand: { head: 'none', torso: 'hoodie', legs: '#35507a', boots: '#e4e4dc', held: 'none', uni: '#8a2c3c' },
  firefighter: { head: 'firehelm', torso: 'bunker', legs: '#3e3628', boots: '#1e1a16', held: 'none', pack: 'tank', uni: '#443a2a', gloves: true },
  trader: { head: 'wrap', torso: 'poncho', legs: '#3a3228', boots: '#4a3622', held: 'none', uni: '#8c5c38' },
  crew: { head: 'none', torso: 'jacket', legs: '#3e4450', boots: '#2a2018', held: 'none', uni: '#4c5c6c' },
  robot: { head: 'robot', torso: 'robot', legs: '#7a7e84', boots: '#4a4e54', held: 'wrench', pack: 'boiler', uni: '#8a8e94', glow: '#ffb040', bulk: 1.15 },
};

const SKINS = ['#f1c7a1', '#e3b087', '#c98d5e', '#a86a42', '#7d4c2e', '#5c3620', '#f6d6bb'];
const HAIRS = ['#16120f', '#2f2119', '#5a3c26', '#8a5a2e', '#c8a468', '#7a2a18', '#2a2a2e', '#b8b4ac'];

/* ------------------------------------------------------------------ */
/* Vectors (body frame: x forward, y up, z to the person's right)       */
/* ------------------------------------------------------------------ */

type V = [number, number, number];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** a + Σ v·k */
const off = (a: V, ...t: [V, number][]): V => {
  const r: V = [a[0], a[1], a[2]];
  for (const [v, k] of t) {
    r[0] += v[0] * k;
    r[1] += v[1] * k;
    r[2] += v[2] * k;
  }
  return r;
};
/** Rotates v about the unit axis k by a (right-handed). */
function rot(v: V, k: V, a: number): V {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = cross(k, v), kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}
const UP: V = [0, 1, 0];

/** Two-bone reach: the elbow (or knee) for a hand (or foot) at `target`, bending toward `pole`. */
function reach(root: V, target: V, l1: number, l2: number, pole: V): [V, V] {
  const d = sub(target, root);
  let dist = Math.hypot(d[0], d[1], d[2]);
  const dn = norm(d);
  dist = Math.max(Math.abs(l1 - l2) + 0.01, Math.min((l1 + l2) * 0.998, dist));
  const ca = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  const pn = norm(sub(pole, mul(dn, dot(pole, dn))));
  return [off(root, [dn, l1 * ca], [pn, l1 * sa]), off(root, [dn, dist])];
}

/* ------------------------------------------------------------------ */
/* The person                                                          */
/* ------------------------------------------------------------------ */

interface Body {
  s: number;
  fem: boolean;
  sw: number;
  skin: RGB;
  hair: RGB;
  style: number;
  beard: boolean;
  robot: boolean;
}

function bodyOf(spec: HeroSpec, kit: Kit): Body {
  const r = (k: number): number => hash2(spec.seed, k, 911);
  const robot = spec.role === 'robot';
  const fem = !robot && r(5) < 0.34;
  const s = robot ? 0.86 : (fem ? 0.95 : 1) * (0.96 + r(6) * 0.08);
  return {
    s, fem, robot,
    sw: (fem ? 0.172 : 0.198) * (kit.bulk ?? 1),
    skin: rgb(SKINS[Math.floor(r(1) * SKINS.length)]),
    hair: rgb(HAIRS[Math.floor(r(2) * HAIRS.length)]),
    style: fem ? [2, 3, 5, 0][Math.floor(r(3) * 4)] : [0, 0, 1, 4, 5, 0][Math.floor(r(3) * 6)],
    beard: !fem && !robot && r(4) < 0.2,
  };
}

interface Leg {
  p: number;
  k: number;
  a?: number;
  f?: number;
}

type Prop = 'crate' | 'flags' | 'hose' | 'torch' | 'binos' | 'pistol';

interface Rig {
  pel: V;
  F: V;
  R: V;
  U: V;
  PF: V;
  PR: V;
  neck: V;
  head: V;
  HF: V;
  hip: [V, V];
  knee: [V, V];
  ank: [V, V];
  toe: [V, V];
  sh: [V, V];
  el: [V, V];
  wr: [V, V];
  gun?: { a: V; b: V };
  prop?: Prop;
  f: number;
  sit: boolean;
}

/** Frames in each pose's cycle. */
function framesOf(pose: HeroPose): number {
  return pose === 'walk' ? 8 : pose === 'run' ? 6 : pose === 'wave' || pose === 'work' || pose === 'weld' || pose === 'type' || pose === 'hose' || pose === 'cheer' ? 2 : 1;
}

/** Poses the skeleton: legs by angle, arms by angle or reaching for what they hold. */
function rigOf(pose: HeroPose, f: number, kit: Kit, b: Body): Rig {
  const s = b.s;
  const nf = framesOf(pose);
  const T = (f / nf) * Math.PI * 2;
  const long = kit.held === 'rifle' || kit.held === 'sniper' || kit.held === 'minigun';
  let lean = 0.03, twist = 0, headP = 0, headY = 0, drop = 0;
  let legs: [Leg, Leg] = [{ p: 0.03, k: 0.05, a: 0.05 }, { p: -0.02, k: 0.05, a: 0.05 }];
  let arms: [[number, number, number], [number, number, number]] = [[0.04, 0.16, 0.16], [0.04, 0.16, 0.16]];
  let gunMode: 'none' | 'port' | 'aim' | 'hip' = long ? (kit.held === 'minigun' ? 'hip' : 'port') : 'none';
  let prop: Prop | undefined;
  let sit = false;
  const hands: [((r: Rig) => [V, V]) | null, ((r: Rig) => [V, V]) | null] = [null, null];
  switch (pose) {
    case 'walk':
    case 'run': {
      const run = pose === 'run';
      const leg = (ph: number): Leg => run
        ? { p: 0.1 + 0.72 * Math.sin(ph), k: 0.3 + 1.5 * Math.max(0, Math.cos(ph - 0.5)) ** 1.3, a: 0.03, f: 0.3 * Math.max(0, Math.cos(ph)) - 0.4 * Math.max(0, -Math.sin(ph)) }
        : { p: 0.02 + 0.4 * Math.sin(ph), k: 0.07 + 0.9 * Math.max(0, Math.cos(ph - 0.35)) ** 1.6, a: 0.03, f: 0.22 * Math.max(0, Math.cos(ph)) - 0.25 * Math.max(0, -Math.sin(ph)) };
      legs = [leg(T), leg(T + Math.PI)];
      lean = run ? 0.24 : 0.05;
      twist = (run ? 0.14 : 0.07) * Math.sin(T);
      // Arms swing against the legs: the left arm forward with the right leg.
      const sw = run ? 0.7 : 0.34;
      arms = [
        [sw * Math.sin(T + Math.PI), 0.12, run ? 1.4 : 0.2 + 0.3 * Math.max(0, Math.sin(T + Math.PI))],
        [sw * Math.sin(T), 0.12, run ? 1.4 : 0.2 + 0.3 * Math.max(0, Math.sin(T))],
      ];
      if (long) gunMode = kit.held === 'minigun' ? 'hip' : 'port';
      break;
    }
    case 'aim':
      lean = 0.1;
      twist = -0.42;
      headY = 0.34;
      headP = 0.16;
      legs = [{ p: 0.3, k: 0.16, a: 0.1 }, { p: -0.24, k: 0.1, a: 0.12, f: -0.1 }];
      if (long) gunMode = kit.held === 'minigun' ? 'hip' : 'aim';
      else prop = 'pistol';
      break;
    case 'wave':
      legs = [{ p: 0.02, k: 0.04, a: 0.12 }, { p: -0.02, k: 0.04, a: 0.12 }];
      gunMode = 'none';
      if (kit.held === 'flags') {
        // Marshalling: the flags swing up and down in turn, out in front.
        arms = f ? [[2.7, 0.25, 0.05], [0.95, 0.2, 0.05]] : [[0.95, 0.2, 0.05], [2.7, 0.25, 0.05]];
        prop = 'flags';
      } else {
        // A hand raised, waving side to side.
        arms[1] = [2.5, f ? 0.55 : 0.15, 0.5];
        headP = -0.1;
      }
      break;
    case 'salute':
      gunMode = 'none';
      legs = [{ p: 0, k: 0.02, a: 0.03 }, { p: 0, k: 0.02, a: 0.03 }];
      arms[0] = [0, 0.1, 0.05];
      hands[1] = (r) => [off(r.head, [r.HF, 0.07], [r.R, 0.075], [UP, 0.035]), off(r.R, [r.F, 0.35], [UP, -0.2])];
      break;
    case 'work':
    case 'weld': {
      const weld = pose === 'weld';
      gunMode = 'none';
      lean = weld ? 0.42 : 0.22;
      headP = 0.3;
      drop = weld ? 0.26 : 0.03;
      legs = weld ? [{ p: 0.75, k: 1.35, a: 0.12 }, { p: 0.2, k: 1.3, a: 0.12, f: -0.2 }] : [{ p: 0.12, k: 0.12, a: 0.08 }, { p: -0.08, k: 0.1, a: 0.08 }];
      const up = f ? 0.1 : 0;
      hands[1] = (r) => [off(r.pel, [r.F, weld ? 0.5 : 0.46], [UP, (weld ? 0.1 : 0.34) + up], [r.R, 0.08]), off(r.R, [UP, -1])];
      hands[0] = (r) => [off(r.pel, [r.F, weld ? 0.44 : 0.4], [UP, weld ? 0.14 : 0.24], [r.R, -0.12]), off(r.R, [UP, -1], [r.R, -1.2])];
      if (weld) prop = 'torch';
      break;
    }
    case 'carry':
      gunMode = 'none';
      lean = -0.06;
      prop = 'crate';
      hands[0] = (r) => [off(r.pel, [r.F, 0.3], [UP, 0.2], [r.R, -0.2]), off(r.R, [UP, -1], [r.R, -0.8])];
      hands[1] = (r) => [off(r.pel, [r.F, 0.3], [UP, 0.2], [r.R, 0.2]), off(r.R, [UP, -1], [r.R, 0.8])];
      break;
    case 'hose':
      gunMode = 'none';
      lean = 0.16;
      prop = 'hose';
      legs = [{ p: 0.34, k: 0.26, a: 0.12 }, { p: -0.26, k: 0.1, a: 0.12 }];
      hands[1] = (r) => [off(r.pel, [r.F, 0.36 - (f ? 0.03 : 0)], [UP, 0.12], [r.R, 0.08]), off(r.R, [UP, -1], [r.R, 0.6])];
      hands[0] = (r) => [off(r.pel, [r.F, 0.58 - (f ? 0.03 : 0)], [UP, 0.2], [r.R, -0.02]), off(r.R, [UP, -1], [r.R, -1])];
      break;
    case 'cheer':
      gunMode = 'none';
      arms = [[0.3, 2.6 + (f ? 0.1 : -0.1), 0.35], [0.3, 2.6 - (f ? 0.1 : -0.1), 0.35]];
      headP = -0.2;
      break;
    case 'look':
      gunMode = long ? 'port' : 'none';
      headP = -0.05;
      prop = 'binos';
      if (!long) {
        hands[0] = (r) => [off(r.head, [r.HF, 0.13], [r.R, -0.05], [UP, -0.03]), off(r.R, [UP, -1], [r.R, -1])];
        hands[1] = (r) => [off(r.head, [r.HF, 0.13], [r.R, 0.05], [UP, -0.03]), off(r.R, [UP, -1], [r.R, 1])];
      }
      break;
    case 'duck':
      gunMode = 'none';
      lean = 0.45;
      headP = 0.35;
      drop = 0.3;
      legs = [{ p: 0.8, k: 1.4, a: 0.15 }, { p: 0.3, k: 1.35, a: 0.15, f: -0.25 }];
      hands[0] = (r) => [off(r.head, [UP, 0.1], [r.R, -0.08], [r.HF, 0.02]), off(r.R, [r.F, 1], [r.R, -1])];
      hands[1] = (r) => [off(r.head, [UP, 0.12], [r.R, 0.08], [r.HF, 0.04]), off(r.R, [r.F, 1], [r.R, 1])];
      break;
    case 'point':
      gunMode = long ? 'port' : 'none';
      if (!long) arms[1] = [1.4, 0.2, 0.04];
      headY = 0.1;
      break;
    case 'sit':
    case 'type':
      sit = true;
      gunMode = 'none';
      lean = pose === 'type' ? 0.12 : -0.04;
      legs = [{ p: 1.5, k: 1.45, a: 0.1 }, { p: 1.45, k: 1.42, a: 0.1 }];
      if (pose === 'type') {
        const tap = f ? 0.02 : 0;
        hands[0] = (r) => [off(r.pel, [r.F, 0.42], [UP, 0.28 + tap], [r.R, -0.12]), off(r.R, [UP, -1], [r.R, -1])];
        hands[1] = (r) => [off(r.pel, [r.F, 0.42], [UP, 0.3 - tap], [r.R, 0.12]), off(r.R, [UP, -1], [r.R, 1])];
      } else {
        hands[0] = (r) => [off(r.pel, [r.F, 0.3], [UP, 0.12], [r.R, -0.1]), off(r.R, [UP, -1], [r.R, -1])];
        hands[1] = (r) => [off(r.pel, [r.F, 0.32], [UP, 0.12], [r.R, 0.12]), off(r.R, [UP, -1], [r.R, 1])];
      }
      break;
    default:
      if (kit.head === 'peaked' && !long) {
        // Officers stand at ease, hands behind the back.
        hands[0] = (r) => [off(r.pel, [r.F, -0.16], [UP, 0.05], [r.R, -0.05]), off(r.R, [UP, -1], [r.R, -1], [r.F, -0.6])];
        hands[1] = (r) => [off(r.pel, [r.F, -0.16], [UP, 0.07], [r.R, 0.05]), off(r.R, [UP, -1], [r.R, 1], [r.F, -0.6])];
      }
  }

  // Pelvis and spine.
  const hipH = 0.935 * s;
  const PF: V = rot([1, 0, 0], UP, twist * 0.35), PR: V = rot([0, 0, 1], UP, twist * 0.35);
  const F0: V = rot([1, 0, 0], UP, twist), R: V = rot([0, 0, 1], UP, twist);
  const U = rot(UP, R, -lean);
  const F = norm(cross(U, R));
  let pel: V = [0, sit ? 0.5 * s : hipH - drop, 0];
  void F0;
  const hip: [V, V] = [off(pel, [PR, -(b.fem ? 0.1 : 0.088) * s]), off(pel, [PR, (b.fem ? 0.1 : 0.088) * s])];
  const thigh = 0.44 * s, shin = 0.43 * s;
  const legFK = (hp: V, L: Leg, side: number): [V, V, V] => {
    let d: V = [0, -1, 0];
    d = rot(d, PR, L.p);
    d = rot(d, PF, -side * (L.a ?? 0));
    const kn = off(hp, [d, thigh]);
    const d2 = rot(d, PR, -L.k);
    const an = off(kn, [d2, shin]);
    const fd = rot(PF, PR, L.f ?? 0);
    return [kn, an, off(an, [fd, 0.19 * s], [UP, -0.045 * s])];
  };
  let lk = legFK(hip[0], legs[0], -1), rk = legFK(hip[1], legs[1], 1);
  if (!sit) {
    // Stand on the lower foot.
    const low = Math.min(lk[1][1], rk[1][1], lk[2][1] + 0.045 * s, rk[2][1] + 0.045 * s);
    const dy = 0.075 * s - low;
    pel = off(pel, [UP, dy]);
    hip[0] = off(hip[0], [UP, dy]);
    hip[1] = off(hip[1], [UP, dy]);
    lk = legFK(hip[0], legs[0], -1);
    rk = legFK(hip[1], legs[1], 1);
  } else {
    // Feet flat on the floor in front of the seat.
    for (const k of [lk, rk]) {
      const dy = 0.075 * s - k[1][1];
      k[1] = off(k[1], [UP, dy]);
      k[2] = off(k[2], [UP, dy]);
    }
  }
  const sc = off(pel, [U, 0.47 * s]);
  const neck = off(pel, [U, 0.53 * s]);
  const HF = rot(rot(F, UP, headY), rot(R, UP, headY), -headP);
  const head = off(neck, [U, 0.1 * s], [UP, 0.05 * s], [HF, 0.012 * s]);
  const sh: [V, V] = [off(sc, [R, -(b.sw - 0.035) * s]), off(sc, [R, (b.sw - 0.035) * s])];
  const ua = 0.3 * s, fa = 0.26 * s;
  const armFK = (sp: V, a: [number, number, number], side: number): [V, V] => {
    let d: V = rot(mul(U, -1), R, a[0]);
    d = rot(d, F, -side * a[1]);
    const e = off(sp, [d, ua]);
    // The elbow bends the forearm forward and in.
    let d2 = rot(d, R, a[2]);
    d2 = rot(d2, F, side * a[2] * 0.15);
    return [e, off(e, [d2, fa])];
  };
  const r: Rig = {
    pel, F, R, U, PF, PR, neck, head, HF, hip, knee: [lk[0], rk[0]], ank: [lk[1], rk[1]], toe: [lk[2], rk[2]],
    sh, el: [sh[0], sh[1]], wr: [sh[0], sh[1]], prop, f, sit,
  };
  // The long gun, and the hands on it.
  if (gunMode === 'port') {
    const a = off(pel, [PR, 0.1 * s], [PF, 0.15 * s], [UP, 0.04 * s]);
    const d = norm(off([0, 0, 0], [F, 0.3], [U, 0.92], [R, -0.42]));
    r.gun = { a, b: off(a, [d, (kit.held === 'sniper' ? 1.15 : 0.95) * s]) };
    hands[1] = (q) => [off(q.gun!.a, [d, 0.27 * s], [F, 0.03]), off(q.R, [UP, -1], [q.R, 0.9])];
    hands[0] = (q) => [off(q.gun!.a, [d, 0.6 * s], [F, 0.03]), off(q.R, [UP, -1], [q.R, -0.6])];
  } else if (gunMode === 'aim') {
    const dir = norm([1, -0.03, 0.02]);
    const a = off(sh[1], [F, 0.07 * s], [UP, -0.03 * s], [R, -0.03 * s]);
    r.gun = { a, b: off(a, [dir, (kit.held === 'sniper' ? 1.15 : 0.95) * s]) };
    hands[1] = (q) => [off(q.gun!.a, [dir, 0.26 * s], [UP, -0.075 * s]), off(q.R, [UP, -0.6], [q.R, 1])];
    hands[0] = (q) => [off(q.gun!.a, [dir, 0.56 * s], [UP, -0.05 * s]), off(q.R, [UP, -1], [q.R, -0.4])];
  } else if (gunMode === 'hip') {
    const dir = norm([1, pose === 'aim' ? 0.02 : 0.05, 0]);
    const a = off(pel, [R, 0.2 * s], [F, -0.12 * s], [UP, 0.16 * s]);
    r.gun = { a, b: off(a, [dir, 1.0 * s]) };
    hands[1] = (q) => [off(q.gun!.a, [dir, 0.28 * s], [UP, -0.04 * s]), off(q.R, [UP, -1], [q.R, 1])];
    hands[0] = (q) => [off(q.gun!.a, [dir, 0.55 * s], [UP, 0.06 * s], [q.R, -0.06]), off(q.R, [UP, -1], [q.R, -0.5])];
  }
  if (pose === 'aim' && prop === 'pistol') {
    hands[1] = (q) => [off(q.sh[1], [q.F, 0.52 * s], [UP, 0.02 * s], [q.R, -0.12 * s]), off(q.R, [UP, -1], [q.R, 1])];
    hands[0] = (q) => [off(q.sh[1], [q.F, 0.47 * s], [UP, -0.02 * s], [q.R, -0.14 * s]), off(q.R, [UP, -1], [q.R, -1])];
  }
  for (const i of [0, 1] as const) {
    const side = i ? 1 : -1;
    const hf = hands[i];
    if (hf) {
      const [t, pole] = hf(r);
      const [e, w] = reach(sh[i], t, ua, fa, pole);
      r.el[i] = e;
      r.wr[i] = w;
    } else {
      const [e, w] = armFK(sh[i], arms[i], side);
      r.el[i] = e;
      r.wr[i] = w;
    }
  }
  return r;
}

/* ------------------------------------------------------------------ */
/* Painting                                                            */
/* ------------------------------------------------------------------ */

type Mat = 'cloth' | 'skin' | 'metal' | 'leather' | 'glow' | 'hair' | 'brass';

const COOL: RGB = [26, 30, 62];
const WARM: RGB = [255, 244, 214];

/** A colour lit (k > 0) toward a warm highlight or shaded (k < 0) toward a cool dark. */
function tone(c: RGB, k: number, m: Mat = 'cloth'): string {
  let r: number, g: number, b: number;
  if (k >= 0) {
    const t = Math.min(1, k) * (m === 'metal' || m === 'brass' ? 0.75 : m === 'glow' ? 0.8 : 0.5);
    r = c[0] + (WARM[0] - c[0]) * t;
    g = c[1] + (WARM[1] - c[1]) * t;
    b = c[2] + (WARM[2] - c[2]) * t;
  } else {
    const t = Math.min(1, -k);
    const sh: RGB = m === 'skin' ? [96, 30, 34] : m === 'brass' ? [60, 30, 10] : COOL;
    const keep = 1 - 0.7 * t;
    r = c[0] * keep + sh[0] * 0.35 * t;
    g = c[1] * keep + sh[1] * 0.35 * t;
    b = c[2] * keep + sh[2] * 0.35 * t;
  }
  return `rgb(${Math.round(Math.max(0, Math.min(255, r)))},${Math.round(Math.max(0, Math.min(255, g)))},${Math.round(Math.max(0, Math.min(255, b)))})`;
}

/** Gradient stops across a round part, lit edge (0) to shadowed edge (1). */
function stops(c: RGB, m: Mat): [number, string][] {
  switch (m) {
    case 'metal':
      return [[0, tone(c, 0.2, m)], [0.16, tone(c, 0.95, m)], [0.3, tone(c, 0.15, m)], [0.62, tone(c, -0.35, m)], [0.88, tone(c, -0.6, m)], [1, tone(c, 0.05, m)]];
    case 'brass':
      return [[0, tone(c, 0.1, m)], [0.2, tone(c, 0.9, m)], [0.36, tone(c, 0.2, m)], [0.7, tone(c, -0.4, m)], [1, tone(c, -0.2, m)]];
    case 'leather':
      return [[0, tone(c, 0.25, m)], [0.22, tone(c, 0.5, m)], [0.45, tone(c, 0, m)], [0.8, tone(c, -0.5, m)], [1, tone(c, -0.65, m)]];
    case 'glow':
      return [[0, tone(c, 0.9, m)], [0.5, tone(c, 0.5, m)], [1, tone(c, 0, m)]];
    case 'skin':
      return [[0, tone(c, 0.3, m)], [0.35, tone(c, 0.12, m)], [0.62, tone(c, -0.12, m)], [0.9, tone(c, -0.42, m)], [1, tone(c, -0.5, m)]];
    case 'hair':
      return [[0, tone(c, 0.35, m)], [0.3, tone(c, 0.15, m)], [0.7, tone(c, -0.3, m)], [1, tone(c, -0.55, m)]];
    default:
      return [[0, tone(c, 0.3, m)], [0.35, tone(c, 0.12, m)], [0.62, tone(c, -0.12, m)], [0.9, tone(c, -0.48, m)], [1, tone(c, -0.62, m)]];
  }
}

/** Toward the light in screen space (upper left). */
const LX = -0.58, LY = -0.81;

interface Paint {
  x: CanvasRenderingContext2D;
  /** Pixels per metre (at the painting's scale). */
  k: number;
  /** Outline width (px at the painting's scale). */
  ow: number;
  ox: number;
  oy: number;
  cu: number;
  su: number;
  cp: number;
  sp: number;
  /** Detail level: 0 tiny, 1 small, 2 big (faces, stitching). */
  lod: number;
}

type P2 = [number, number, number];

function proj(P: Paint, v: V): P2 {
  const u = v[0] * P.cu + v[2] * P.su;
  const w = -v[0] * P.su + v[2] * P.cu;
  return [P.ox + u * P.k, P.oy + (-v[1] * P.cp + w * P.sp) * P.k, w * P.cp + v[1] * P.sp];
}

/** How much a direction faces the viewer (1 straight at you, -1 away). */
function facing(P: Paint, d: V): number {
  const w = -d[0] * P.su + d[2] * P.cu;
  return w * P.cp + d[1] * P.sp;
}

function capsule(P: Paint, A: P2, B: P2, ra: number, rb: number, c: RGB, m: Mat = 'cloth', outline = true): void {
  const x = P.x;
  let dx = B[0] - A[0], dy = B[1] - A[1];
  const L = Math.hypot(dx, dy);
  ra *= P.k;
  rb *= P.k;
  if (L < 0.01) {
    dx = 0;
    dy = 1;
  } else {
    dx /= L;
    dy /= L;
  }
  let nx = -dy, ny = dx;
  const ang = Math.atan2(ny, nx);
  x.beginPath();
  x.moveTo(A[0] + nx * ra, A[1] + ny * ra);
  x.lineTo(B[0] + nx * rb, B[1] + ny * rb);
  x.arc(B[0], B[1], rb, ang, ang - Math.PI, true);
  x.lineTo(A[0] - nx * ra, A[1] - ny * ra);
  x.arc(A[0], A[1], ra, ang + Math.PI, ang, true);
  x.closePath();
  if (nx * LX + ny * LY < 0) {
    nx = -nx;
    ny = -ny;
  }
  const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, r = (ra + rb) / 2;
  const gr = x.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r);
  for (const [o, col] of stops(c, m)) gr.addColorStop(o, col);
  x.fillStyle = gr;
  x.fill();
  if (outline) {
    x.strokeStyle = tone(c, -0.85, m);
    x.lineWidth = P.ow;
    x.stroke();
  }
}

function blob(P: Paint, C: P2, rx: number, ry: number, c: RGB, m: Mat = 'cloth', outline = true, rotA = 0): void {
  const x = P.x;
  rx *= P.k;
  ry *= P.k;
  x.beginPath();
  x.ellipse(C[0], C[1], Math.max(0.3, rx), Math.max(0.3, ry), rotA, 0, Math.PI * 2);
  const r = Math.max(rx, ry);
  const gr = x.createRadialGradient(C[0] + LX * r * 0.45, C[1] + LY * r * 0.45, r * 0.08, C[0], C[1], r * 1.08);
  const st = stops(c, m);
  for (const [o, col] of st) gr.addColorStop(o, col);
  x.fillStyle = gr;
  x.fill();
  if (outline) {
    x.strokeStyle = tone(c, -0.85, m);
    x.lineWidth = P.ow;
    x.stroke();
  }
}

/** A box on its own axes (half sizes along each), its faces toward you painted and lit. */
function box(P: Paint, c: V, ax: [V, V, V], hs: [number, number, number], col: RGB, m: Mat = 'cloth', outline = true): void {
  const x = P.x;
  const faces: [number, number][] = [];
  for (let i = 0; i < 3; i++) for (const sgn of [-1, 1]) faces.push([i, sgn]);
  const Lv: V = norm([-0.5, 0.72, 0.5]);
  for (const [i, sgn] of faces) {
    const n = mul(ax[i], sgn);
    const fw = facing(P, n);
    if (fw <= 0.001) continue;
    const j = (i + 1) % 3, k2 = (i + 2) % 3;
    const fc = off(c, [ax[i], sgn * hs[i]]);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, bb]) => proj(P, off(fc, [ax[j], a * hs[j]], [ax[k2], bb * hs[k2]])));
    // Light: the normal in view terms against a light up, left and toward you.
    const nu = n[0] * P.cu + n[2] * P.su, nw = -n[0] * P.su + n[2] * P.cu;
    const nd = nw * P.cp + n[1] * P.sp, ny = n[1] * P.cp - nw * P.sp;
    const lam = nu * Lv[0] + ny * Lv[1] + nd * Lv[2];
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (let q = 1; q < 4; q++) x.lineTo(pts[q][0], pts[q][1]);
    x.closePath();
    x.fillStyle = tone(col, Math.max(-0.75, Math.min(0.7, lam * 0.9 - 0.25)), m);
    x.fill();
    if (outline) {
      x.strokeStyle = tone(col, -0.85, m);
      x.lineWidth = P.ow * 0.8;
      x.lineJoin = 'round';
      x.stroke();
    }
  }
}

function line2(P: Paint, A: P2, B: P2, col: string, w: number): void {
  const x = P.x;
  x.strokeStyle = col;
  x.lineWidth = w * P.k;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(A[0], A[1]);
  x.lineTo(B[0], B[1]);
  x.stroke();
}

function glow(P: Paint, C: P2, r: number, col: string): void {
  const x = P.x;
  const R = r * P.k;
  const gr = x.createRadialGradient(C[0], C[1], 0, C[0], C[1], R);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.25, col);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.fillStyle = gr;
  x.beginPath();
  x.arc(C[0], C[1], R, 0, Math.PI * 2);
  x.fill();
  x.restore();
}

const mute = (h: string, k = 0.42): RGB => {
  const c = rgb(h);
  const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return [c[0] + (l - c[0]) * k, c[1] + (l - c[1]) * k, c[2] + (l - c[2]) * k].map((v) => v * 0.82) as RGB;
};
const lift = (c: RGB, k: number): RGB => c.map((v) => Math.max(0, Math.min(255, v * (1 + k)))) as RGB;

/** Paints a posed figure. */
function paintFigure(P: Paint, spec: HeroSpec, pose: HeroPose, f: number, lying: boolean): void {
  const kit = KITS[spec.role];
  const b = bodyOf(spec, kit);
  const r = rigOf(pose, f, kit, b);
  const s = b.s;
  if (lying) {
    // Asleep on the back: the standing figure turned about its right-hand axis, head to the left.
    const pivot: V = [0, 0.15, 0];
    const t = (v: V): V => {
      const q = rot(sub(v, [0, 0.9 * s, 0]), [0, 0, 1], Math.PI / 2);
      return add(q, pivot);
    };
    for (const k of ['pel', 'neck', 'head'] as const) r[k] = t(r[k]);
    for (const k of ['hip', 'knee', 'ank', 'toe', 'sh', 'el', 'wr'] as const) r[k] = [t(r[k][0]), t(r[k][1])];
    r.F = rot(r.F, [0, 0, 1], Math.PI / 2);
    r.U = rot(r.U, [0, 0, 1], Math.PI / 2);
    r.HF = rot(r.HF, [0, 0, 1], Math.PI / 2);
    r.PF = rot(r.PF, [0, 0, 1], Math.PI / 2);
    r.gun = undefined;
  }
  const robot = b.robot;
  const uni: RGB = spec.color && (kit.torso === 'jacket' || kit.torso === 'overalls' || kit.torso === 'hoodie' || kit.torso === 'flight') ? mute(spec.color) : rgb(kit.uni);
  const legC: RGB = kit.torso === 'overalls' ? uni : rgb(kit.legs);
  const bootC = rgb(kit.boots);
  const skin = robot ? rgb('#9a9ea6') : b.skin;
  const skinM: Mat = robot ? 'metal' : 'skin';
  const sleeve: RGB = kit.torso === 'hivis' ? rgb(kit.legs) : kit.torso === 'apron' ? rgb('#f2f2ea') : kit.torso === 'bunker' ? rgb('#443a2a') : kit.torso === 'vest' ? lift(uni, 0.05) : uni;
  const clothM: Mat = robot ? 'metal' : 'cloth';
  const brass = rgb('#c8963a');
  const parts: { d: number; draw: () => void }[] = [];
  const pr = (v: V): P2 => proj(P, v);

  // Ground shadow first.
  if (!lying) {
    const g0 = pr([r.pel[0], 0, r.pel[2]]);
    const x = P.x;
    const rx = 0.36 * s * P.k, ry = Math.max(0.05, 0.36 * P.sp + 0.06) * s * P.k;
    const gr = x.createRadialGradient(g0[0], g0[1], 0, g0[0], g0[1], rx);
    gr.addColorStop(0, 'rgba(0,0,0,0.38)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.save();
    x.fillStyle = gr;
    x.translate(g0[0], g0[1]);
    x.scale(1, ry / rx);
    x.beginPath();
    x.arc(0, 0, rx, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }

  // Legs: thigh, shin, boot.
  for (const i of [0, 1] as const) {
    const H = pr(r.hip[i]), K = pr(r.knee[i]), A = pr(r.ank[i]), Tt = pr(r.toe[i]);
    const shade = i === 0 ? -0.1 : 0;
    const lc = lift(legC, shade);
    parts.push({
      d: (H[2] + K[2] + A[2]) / 3,
      draw: () => {
        capsule(P, H, K, 0.083 * s, 0.06 * s, lc, clothM);
        if (robot) blob(P, K, 0.055 * s, 0.055 * s, brass, 'brass');
        capsule(P, K, A, 0.058 * s, 0.043 * s, lc, clothM);
        if (kit.head === 'helmet' || kit.torso === 'armor') blob(P, pr(off(r.knee[i], [r.PF, 0.05 * s])), 0.05 * s, 0.045 * s, rgb('#2c3036'), 'leather');
        // Cargo pocket on the thigh.
        if (P.lod > 0 && (kit.legs === '#55603f' || kit.legs === '#4e5838' || kit.legs === '#4c4a3a') && !r.sit) {
          const mid = off(r.hip[i], [sub(r.knee[i], r.hip[i]), 0.55], [r.PR, (i ? 1 : -1) * 0.07 * s]);
          if (facing(P, mul(r.PR, i ? 1 : -1)) > 0) blob(P, pr(mid), 0.04 * s, 0.055 * s, lift(lc, -0.08), clothM, true);
        }
        // Boot: a shaft up the shin and the foot.
        const shaft = off(r.ank[i], [norm(sub(r.knee[i], r.ank[i])), 0.13 * s]);
        if (kit.boots !== '#e4e4dc') capsule(P, pr(shaft), A, 0.05 * s, 0.05 * s, bootC, 'leather');
        capsule(P, A, Tt, 0.05 * s, 0.042 * s, bootC, kit.boots === '#e4e4dc' ? 'cloth' : 'leather');
        if (P.lod > 0) {
          const sole = off(r.toe[i], [UP, -0.035 * s]), heel = off(r.ank[i], [UP, -0.055 * s], [r.PF, -0.04 * s]);
          line2(P, pr(heel), pr(sole), tone(bootC, -0.8), 0.022 * s);
        }
      },
    });
  }

  // Torso: cross-sections from the seat to the shoulders, joined into one shape.
  const bulk = kit.bulk ?? 1;
  const long = kit.torso === 'coat' || kit.torso === 'bunker' || kit.torso === 'poncho' || kit.torso === 'apron';
  const levels: [number, number, number][] = [
    // height above the pelvis, half width, half depth
    [-0.09, (b.fem ? 0.15 : 0.13) * bulk, 0.105],
    [0.02, (b.fem ? 0.172 : 0.158) * bulk, 0.112 * bulk],
    [0.2, (b.fem ? 0.128 : 0.145) * bulk, 0.1 * bulk],
    [0.34, (b.fem ? 0.15 : 0.172) * bulk, 0.118 * bulk],
    [0.45, b.sw * 0.98, 0.1 * bulk],
  ];
  const torsoC = off(r.pel, [r.U, 0.25 * s]);
  const tc = pr(torsoC);
  const outlineOf = (lv: [number, number, number][]): Path2D => {
    const pts = lv.map(([hh, a, dd]) => {
      const t = Math.max(0, Math.min(1, (hh + 0.1) / 0.55));
      const Rr = norm(add(mul(r.PR, 1 - t), mul(r.R, t)));
      const Ff = norm(add(mul(r.PF, 1 - t), mul(r.F, t)));
      const C = pr(off(r.pel, [r.U, hh * s]));
      const ru = Rr[0] * P.cu + Rr[2] * P.su, fu = Ff[0] * P.cu + Ff[2] * P.su;
      const rw = -Rr[0] * P.su + Rr[2] * P.cu, fw = -Ff[0] * P.su + Ff[2] * P.cu;
      const e = Math.hypot(a * ru, dd * fu) * s * P.k;
      // The shape leans with the spine in the picture: shift by the up vector's sideways component.
      const ev = Math.hypot(a * rw, dd * fw) * P.sp * s * P.k;
      return { x: C[0], y: C[1], e, ev };
    });
    const p = new Path2D();
    const n = pts.length;
    const bot = pts[0];
    p.moveTo(bot.x, bot.y + bot.ev + 0.02 * s * P.k);
    p.quadraticCurveTo(bot.x - bot.e, bot.y + bot.ev, bot.x - bot.e, bot.y);
    for (let i = 1; i < n; i++) {
      const a = pts[i - 1], c = pts[i];
      p.quadraticCurveTo(a.x - a.e, a.y, (a.x - a.e + c.x - c.e) / 2, (a.y + c.y) / 2);
    }
    const top = pts[n - 1];
    p.lineTo(top.x - top.e, top.y);
    p.ellipse(top.x, top.y, top.e, top.ev + 0.05 * s * P.k, 0, Math.PI, Math.PI * 2);
    for (let i = n - 1; i > 0; i--) {
      const a = pts[i], c = pts[i - 1];
      p.quadraticCurveTo(a.x + a.e, a.y, (a.x + a.e + c.x + c.e) / 2, (a.y + c.y) / 2);
    }
    p.lineTo(bot.x + bot.e, bot.y);
    p.quadraticCurveTo(bot.x + bot.e, bot.y + bot.ev, bot.x, bot.y + bot.ev + 0.02 * s * P.k);
    p.closePath();
    return p;
  };
  const tCol: RGB = kit.torso === 'apron' ? rgb('#f2f2ea') : kit.torso === 'bunker' ? rgb('#443a2a') : uni;
  const fillShape = (path: Path2D, col: RGB, m: Mat, x0: number, x1: number): void => {
    const x = P.x;
    const gr = x.createLinearGradient(x0, 0, x1, 0);
    for (const [o, c] of stops(col, m)) gr.addColorStop(o, c);
    x.fillStyle = gr;
    x.fill(path);
  };
  const frontFacing = facing(P, r.F);
  const torsoDraw = (): void => {
    const x = P.x;
    const path = outlineOf(levels);
    const span = b.sw * 1.15 * s * P.k;
    fillShape(path, tCol, clothM, tc[0] - span, tc[0] + span);
    x.save();
    x.clip(path);
    // Soft shade toward the waist, and the chest catching the light.
    const top = pr(off(r.pel, [r.U, 0.5 * s])), bot = pr(off(r.pel, [r.U, -0.1 * s]));
    const vg = x.createLinearGradient(0, top[1], 0, bot[1]);
    vg.addColorStop(0, 'rgba(255,240,210,0.16)');
    vg.addColorStop(0.45, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,12,30,0.3)');
    x.fillStyle = vg;
    x.fillRect(tc[0] - span * 2, top[1] - span, span * 4, bot[1] - top[1] + span * 2);
    const band = (hh: number, th: number, col: string): void => {
      const c0 = pr(off(r.pel, [r.U, hh * s]));
      x.fillStyle = col;
      x.fillRect(tc[0] - span * 2, c0[1] - (th * s * P.k) / 2, span * 4, th * s * P.k);
    };
    const onFront = (hh: number, side: number, depth = 1): V => off(r.pel, [r.U, hh * s], [r.F, 0.115 * bulk * s * depth], [r.R, side * s]);
    switch (kit.torso) {
      case 'vest': {
        // Plate carrier: darker panels front and back, straps, pouches across the front.
        const vc = rgb('#3f4832');
        const vp = outlineOf(levels.slice(1).map(([hh, a, dd]) => [hh, a * 1.04, dd * 1.1]));
        x.save();
        x.clip(vp);
        const t0 = pr(off(r.pel, [r.U, 0.44 * s])), t1 = pr(off(r.pel, [r.U, 0.06 * s]));
        x.fillStyle = tone(vc, -0.05);
        x.fillRect(tc[0] - span * 2, t0[1], span * 4, t1[1] - t0[1]);
        x.restore();
        band(0.36, 0.012, 'rgba(0,0,0,0.25)');
        break;
      }
      case 'hivis':
        band(0.25, 0.035, '#d9dde0');
        band(0.12, 0.035, '#d9dde0');
        band(0.25, 0.012, 'rgba(255,255,255,0.6)');
        break;
      case 'bunker':
        band(0.24, 0.04, '#e8d840');
        band(0.24, 0.016, '#cfd3d6');
        band(0.02, 0.04, '#e8d840');
        band(0.02, 0.016, '#cfd3d6');
        break;
      case 'armor': {
        // Plates: a moulded chest plate and the abdomen bands.
        band(0.2, 0.012, 'rgba(0,0,0,0.35)');
        band(0.12, 0.012, 'rgba(0,0,0,0.35)');
        break;
      }
      case 'overalls':
        band(0.3, 0.008, 'rgba(0,0,0,0.3)');
        break;
      case 'robot': {
        band(0.3, 0.018, 'rgba(0,0,0,0.3)');
        band(0.12, 0.018, 'rgba(0,0,0,0.3)');
        break;
      }
      default:
    }
    x.restore();
    x.strokeStyle = tone(tCol, -0.85);
    x.lineWidth = P.ow;
    x.stroke(path);
    // Front details, when the front is toward you.
    if (frontFacing > -0.15) {
      if (kit.torso === 'vest') {
        for (const side of [-0.075, 0, 0.075]) box(P, onFront(0.14, side, 1.15), [r.F, r.U, r.R], [0.025 * s, 0.045 * s, 0.03 * s], rgb('#4a5536'), 'cloth');
        if (P.lod > 0) box(P, onFront(0.36, 0.09, 1.1), [r.F, r.U, r.R], [0.02 * s, 0.035 * s, 0.025 * s], rgb('#2a2e30'), 'metal');
      } else if (kit.torso === 'armor') {
        blob(P, pr(onFront(0.33, 0, 0.95)), 0.13 * bulk * s, 0.1 * s, lift(uni, 0.12), 'metal');
        if (kit.glow) glow(P, pr(onFront(0.33, 0.04, 1.2)), 0.03 * s, kit.glow);
      } else if (kit.torso === 'coat') {
        for (let q = 0; q < 3; q++) {
          blob(P, pr(onFront(0.38 - q * 0.1, 0.035)), 0.012 * s, 0.012 * s, rgb('#e0c060'), 'brass', false);
          blob(P, pr(onFront(0.38 - q * 0.1, -0.035)), 0.012 * s, 0.012 * s, rgb('#e0c060'), 'brass', false);
        }
        if (P.lod > 0) for (let q = 0; q < 3; q++) blob(P, pr(onFront(0.34, -0.1 + q * 0.025)), 0.01 * s, 0.018 * s, rgb(['#c03030', '#3a8ad0', '#e0c060'][q]), 'cloth', false);
      } else if (kit.torso === 'overalls') {
        box(P, onFront(0.25, 0), [r.F, r.U, r.R], [0.01 * s, 0.08 * s, 0.1 * s], lift(uni, 0.1), 'cloth');
        for (const side of [-0.07, 0.07]) line2(P, pr(onFront(0.46, side * 1.1)), pr(onFront(0.3, side)), tone(uni, -0.5), 0.018 * s);
      } else if (kit.torso === 'apron') {
        box(P, onFront(0.12, 0, 1.05), [r.F, r.U, r.R], [0.01 * s, 0.22 * s, 0.13 * s], rgb('#f7f7f2'), 'cloth');
      } else if (kit.torso === 'hoodie') {
        box(P, onFront(0.1, 0), [r.F, r.U, r.R], [0.012 * s, 0.05 * s, 0.09 * s], lift(uni, -0.12), 'cloth');
        if (P.lod > 0) for (const side of [-0.03, 0.03]) line2(P, pr(onFront(0.44, side)), pr(onFront(0.34, side)), '#e8e8e0', 0.01 * s);
      } else if (kit.torso === 'flight') {
        for (const side of [-0.08, 0.08]) box(P, onFront(0.32, side, 1.05), [r.F, r.U, r.R], [0.02 * s, 0.1 * s, 0.035 * s], rgb('#d8a020'), 'cloth');
      } else if (kit.torso === 'poncho') {
        // Fringe.
      } else if (kit.torso === 'robot') {
        // The boiler window in the chest, glowing.
        blob(P, pr(onFront(0.3, 0, 1.02)), 0.065 * s, 0.065 * s, brass, 'brass');
        blob(P, pr(onFront(0.3, 0, 1.08)), 0.045 * s, 0.045 * s, rgb('#ff9a30'), 'glow', false);
        glow(P, pr(onFront(0.3, 0, 1.15)), 0.12 * s, 'rgba(255,150,40,0.8)');
        for (const side of [-0.1, 0.1]) blob(P, pr(onFront(0.42, side, 0.8)), 0.018 * s, 0.018 * s, brass, 'brass');
      } else if (P.lod > 0) {
        // Jacket: zip and a chest pocket.
        line2(P, pr(onFront(0.46, 0.01)), pr(onFront(0.0, 0.01)), tone(tCol, -0.55), 0.01 * s);
        box(P, onFront(0.34, 0.075, 1.02), [r.F, r.U, r.R], [0.006 * s, 0.035 * s, 0.035 * s], lift(tCol, -0.1), 'cloth');
      }
      if (kit.pack === 'bag') line2(P, pr(onFront(0.47, -0.12)), pr(onFront(0.02, 0.13)), '#4a3a2a', 0.022 * s);
      if (spec.color && P.lod > 0 && !robot) blob(P, pr(onFront(0.4, -0.11, 0.9)), 0.018 * s, 0.014 * s, rgb(spec.color), 'cloth', false);
    }
    // Belt.
    if (!long && kit.torso !== 'robot') {
      const bl = outlineOf([[0.0, levels[1][1] * 1.02, levels[1][2] * 1.04], [0.05, levels[1][1] * 1.0, levels[1][2] * 1.02]]);
      P.x.fillStyle = tone(rgb('#2e2418'), -0.1);
      P.x.fill(bl);
      if (frontFacing > 0) blob(P, pr(onFront(0.025, 0, 1.03)), 0.018 * s, 0.013 * s, rgb('#b89048'), 'brass', false);
      if ((spec.role === 'engineer' || spec.role === 'mechanic') && P.lod > 0) {
        for (const side of [-1, 1]) box(P, off(r.pel, [r.R, side * 0.15 * s], [r.F, 0.03 * s], [r.U, -0.02 * s]), [r.F, r.U, r.R], [0.04 * s, 0.05 * s, 0.025 * s], rgb('#6a4a2a'), 'leather');
      }
    }
  };
  parts.push({ d: tc[2], draw: torsoDraw });

  // Long garments hang over the front thigh too.
  if (long && !r.sit && !lying) {
    const coatC = kit.torso === 'apron' ? rgb('#f2f2ea') : tCol;
    const depth = Math.max(pr(r.knee[0])[2], pr(r.knee[1])[2]) + 0.001;
    parts.push({
      d: depth,
      draw: () => {
        const skirt: [number, number, number][] = kit.torso === 'apron'
          ? [[-0.42, 0.13, 0.12], [-0.1, 0.14, 0.12], [0.05, 0.15, 0.12]]
          : [[-0.44, 0.19, 0.15], [-0.25, 0.18, 0.14], [-0.05, 0.165, 0.125], [0.05, 0.16, 0.12]];
        const path = outlineOf(skirt);
        const span = 0.22 * s * P.k;
        fillShape(path, coatC, 'cloth', tc[0] - span, tc[0] + span);
        P.x.strokeStyle = tone(coatC, -0.85);
        P.x.lineWidth = P.ow;
        P.x.stroke(path);
        if (kit.torso === 'bunker') {
          P.x.save();
          P.x.clip(path);
          const c0 = pr(off(r.pel, [r.U, -0.3 * s]));
          P.x.fillStyle = '#e8d840';
          P.x.fillRect(tc[0] - span * 2, c0[1] - 0.02 * s * P.k, span * 4, 0.04 * s * P.k);
          P.x.restore();
        }
        if (kit.torso === 'coat' && frontFacing > 0 && P.lod > 0) line2(P, pr(off(r.pel, [r.F, 0.13 * s])), pr(off(r.pel, [r.F, 0.16 * s], [r.U, -0.42 * s])), tone(coatC, -0.6), 0.008 * s);
      },
    });
  }

  // On the back: pack, ammo box, air tank, boiler.
  if (kit.pack && kit.pack !== 'bag' && !r.sit) {
    const pc = off(r.pel, [r.U, 0.32 * s], [r.F, -(0.16 * bulk) * s]);
    const d = pr(pc)[2];
    parts.push({
      d,
      draw: () => {
        if (kit.pack === 'pack') {
          box(P, pc, [r.F, r.U, r.R], [0.07 * s, 0.17 * s, 0.13 * s], rgb('#4d4b33'), 'cloth');
          box(P, off(pc, [r.U, -0.2 * s], [r.F, 0.01 * s]), [r.F, r.U, r.R], [0.06 * s, 0.04 * s, 0.14 * s], rgb('#3e3c28'), 'cloth');
          if (P.lod > 0) capsule(P, pr(off(pc, [r.U, 0.14 * s], [r.R, 0.08 * s])), pr(off(pc, [r.U, 0.42 * s], [r.R, 0.09 * s], [r.F, -0.02])), 0.006 * s, 0.006 * s, rgb('#1a1a1a'), 'metal', false);
        } else if (kit.pack === 'ammo') box(P, pc, [r.F, r.U, r.R], [0.08 * s, 0.15 * s, 0.14 * s], rgb('#4a5a3a'), 'metal');
        else if (kit.pack === 'tank') {
          capsule(P, pr(off(pc, [r.U, -0.16 * s])), pr(off(pc, [r.U, 0.16 * s])), 0.075 * s, 0.075 * s, rgb('#c4c8cc'), 'metal');
        } else if (kit.pack === 'boiler') {
          capsule(P, pr(off(pc, [r.U, -0.14 * s])), pr(off(pc, [r.U, 0.16 * s])), 0.1 * s, 0.1 * s, brass, 'brass');
          capsule(P, pr(off(pc, [r.U, 0.18 * s], [r.R, 0.06 * s])), pr(off(pc, [r.U, 0.4 * s], [r.R, 0.06 * s])), 0.025 * s, 0.022 * s, rgb('#4a4e54'), 'metal');
        }
      },
    });
  }

  // Arms: upper arm, forearm, then the hand (after anything held).
  for (const i of [0, 1] as const) {
    const S0 = pr(r.sh[i]), E = pr(r.el[i]), W = pr(r.wr[i]);
    const sc = lift(sleeve, i === 0 ? -0.1 : 0);
    parts.push({
      d: (S0[2] + E[2] + W[2]) / 3 + (i === 1 ? 0.02 : 0),
      draw: () => {
        const bulky = kit.torso === 'armor' || kit.torso === 'bunker' || kit.torso === 'coat';
        capsule(P, S0, E, (bulky ? 0.064 : 0.056) * s * (b.fem ? 0.9 : 1), 0.046 * s, sc, clothM);
        if (robot) blob(P, E, 0.045 * s, 0.045 * s, brass, 'brass');
        capsule(P, E, W, 0.046 * s, 0.036 * s, kit.torso === 'hivis' || kit.torso === 'vest' ? lift(sc, -0.05) : sc, clothM);
        if (kit.torso === 'armor' || (robot && P.lod > 0)) blob(P, S0, 0.085 * s * (kit.bulk ?? 1), 0.07 * s, lift(uni, 0.08), robot ? 'brass' : 'metal');
        if (i === 1 && spec.role === 'medic' && P.lod > 0) {
          const m = pr(off(r.sh[1], [sub(r.el[1], r.sh[1]), 0.4]));
          blob(P, m, 0.045 * s, 0.03 * s, rgb('#f4f4ee'), 'cloth', false);
          line2(P, [m[0] - 0.02 * s * P.k, m[1], 0], [m[0] + 0.02 * s * P.k, m[1], 0], '#d02020', 0.012 * s);
          line2(P, [m[0], m[1] - 0.015 * s * P.k, 0], [m[0], m[1] + 0.015 * s * P.k, 0], '#d02020', 0.012 * s);
        }
      },
    });
    parts.push({
      d: W[2] + 0.06,
      draw: () => {
        const glove = kit.gloves || robot;
        const hc = off(r.wr[i], [norm(sub(r.wr[i], r.el[i])), 0.045 * s]);
        if (robot) {
          capsule(P, W, pr(off(hc, [r.F, 0.03 * s])), 0.02 * s, 0.014 * s, rgb('#4a4e54'), 'metal');
          capsule(P, W, pr(off(hc, [UP, -0.04 * s])), 0.02 * s, 0.014 * s, rgb('#4a4e54'), 'metal');
        } else blob(P, pr(hc), 0.045 * s, 0.05 * s, glove ? rgb('#2e2a26') : skin, glove ? 'leather' : skinM);
      },
    });
  }

  // Neck and head.
  const Hc = pr(r.head);
  parts.push({
    d: Hc[2] + 0.03,
    draw: () => paintHead(P, r, kit, b, spec, skin, skinM, uni),
  });

  // Whatever's in the hands.
  if (r.gun) {
    const A = r.gun.a, B = r.gun.b;
    const d = (pr(A)[2] + pr(B)[2]) / 2 + 0.03;
    parts.push({ d, draw: () => paintGun(P, A, B, r, kit.held, s) });
  }
  const item = paintItem(P, r, kit, s, pose, lying);
  if (item) parts.push(item);

  parts.sort((a, b2) => a.d - b2.d);
  for (const p of parts) p.draw();
}

function paintHead(P: Paint, r: Rig, kit: Kit, b: Body, spec: HeroSpec, skin: RGB, skinM: Mat, uni: RGB): void {
  const s = b.s;
  const pr = (v: V): P2 => proj(P, v);
  const x = P.x;
  const HR = norm(cross(r.HF, r.U));
  const hU = norm(cross(HR, r.HF));
  // Neck.
  capsule(P, pr(off(r.neck, [r.U, -0.04 * s])), pr(off(r.head, [hU, -0.07 * s], [r.HF, -0.01 * s])), 0.05 * s, 0.045 * s, kit.head === 'marine' ? rgb('#2c3036') : skin, kit.head === 'marine' ? 'metal' : skinM);
  // Collar.
  if (kit.torso !== 'robot' && P.lod > 0) {
    const cl = kit.torso === 'coat' || kit.torso === 'flight' || kit.torso === 'jacket' ? uni : kit.torso === 'hoodie' ? lift(uni, -0.15) : null;
    if (cl) capsule(P, pr(off(r.neck, [r.U, -0.035 * s], [r.R, -0.05 * s])), pr(off(r.neck, [r.U, -0.035 * s], [r.R, 0.05 * s])), 0.03 * s, 0.03 * s, cl, 'cloth');
  }
  const C = pr(r.head);
  const fw = facing(P, r.HF);
  const fu = r.HF[0] * P.cu + r.HF[2] * P.su;
  const hairC = b.hair;
  const rx = 0.098 * s, ry = (0.118 * P.cp + 0.098 * P.sp) * s;
  if (kit.head === 'marine') {
    // Full helmet: no face, a visor band glowing.
    blob(P, C, 0.135 * s, (0.13 * P.cp + 0.13 * P.sp) * s, lift(uni, 0.12), 'metal');
    if (fw > -0.3) {
      const vc = pr(off(r.head, [r.HF, 0.1 * s], [hU, 0.01 * s]));
      x.save();
      x.fillStyle = '#12161c';
      x.beginPath();
      x.ellipse(vc[0], vc[1], (0.055 + 0.03 * Math.abs(fw)) * s * P.k, 0.032 * s * P.k, 0, 0, Math.PI * 2);
      x.fill();
      x.restore();
      glow(P, vc, 0.06 * s, kit.glow ?? '#ffa040');
      x.fillStyle = kit.glow ?? '#ffa040';
      x.fillRect(vc[0] - 0.05 * s * P.k * Math.max(0.3, Math.abs(fw)), vc[1] - 0.008 * s * P.k, 0.1 * s * P.k * Math.max(0.3, Math.abs(fw)), 0.016 * s * P.k);
    }
    return;
  }
  if (kit.head === 'robot') {
    // A brass dome with a lamp-lit eye slit and an antenna.
    box(P, off(r.head, [hU, -0.01 * s]), [r.HF, hU, HR], [0.09 * s, 0.085 * s, 0.1 * s], rgb('#8a8e94'), 'metal');
    blob(P, pr(off(r.head, [hU, 0.08 * s])), 0.09 * s, (0.04 * P.cp + 0.09 * P.sp) * s, rgb('#c8963a'), 'brass');
    if (fw > -0.2) {
      const e = pr(off(r.head, [r.HF, 0.095 * s], [hU, 0.01 * s]));
      x.fillStyle = '#10161c';
      x.fillRect(e[0] - 0.06 * s * P.k * Math.max(0.35, fw), e[1] - 0.02 * s * P.k, 0.12 * s * P.k * Math.max(0.35, fw), 0.04 * s * P.k);
      glow(P, e, 0.07 * s, '#60e0ff');
      x.fillStyle = '#a8f4ff';
      x.fillRect(e[0] - 0.045 * s * P.k * Math.max(0.35, fw), e[1] - 0.008 * s * P.k, 0.09 * s * P.k * Math.max(0.35, fw), 0.016 * s * P.k);
    }
    const an = pr(off(r.head, [hU, 0.28 * s], [r.HF, -0.03 * s]));
    line2(P, pr(off(r.head, [hU, 0.12 * s])), an, '#3a3e44', 0.012 * s);
    glow(P, an, 0.035 * s, '#ff5040');
    return;
  }
  // Long hair falls behind the head.
  if (!b.robot && (b.style === 2 || b.style === 3) && kit.head !== 'hood' && kit.head !== 'chef') {
    const tail = b.style === 2 ? off(r.head, [hU, -0.2 * s], [r.HF, -0.07 * s]) : off(r.head, [hU, -0.14 * s], [r.HF, -0.13 * s]);
    capsule(P, pr(off(r.head, [r.HF, -0.05 * s])), pr(tail), 0.085 * s, b.style === 2 ? 0.07 * s : 0.03 * s, hairC, 'hair');
  }
  // Jaw and skull.
  blob(P, pr(off(r.head, [r.HF, 0.03 * s], [hU, -0.045 * s])), 0.07 * s, 0.07 * s, skin, skinM, true);
  blob(P, C, rx, ry, skin, skinM, true);
  // Ear.
  const earSide = facing(P, HR) >= 0 ? 1 : -1;
  if (Math.abs(facing(P, HR)) > 0.2 && P.lod > 0) blob(P, pr(off(r.head, [HR, earSide * 0.092 * s], [r.HF, -0.01 * s], [hU, -0.01 * s])), 0.022 * s, 0.03 * s, lift(skin, -0.08), skinM);
  // Face.
  if (fw > -0.25) {
    const eyeY = -0.005;
    const eyes = [-1, 1].map((sd) => off(r.head, [r.HF, 0.086 * s], [HR, sd * 0.034 * s], [hU, eyeY * s]));
    const vis = eyes.filter((e, i) => facing(P, norm(sub(e, r.head))) > 0.05 || (i === 1 && fw > 0.5));
    if (P.lod >= 2) {
      for (const e of vis) {
        const p = pr(e);
        x.fillStyle = '#f2ece4';
        x.beginPath();
        x.ellipse(p[0], p[1], 0.014 * s * P.k, 0.008 * s * P.k, 0, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = '#2a1e18';
        x.beginPath();
        x.arc(p[0] + fu * 0.004 * s * P.k, p[1], 0.0075 * s * P.k, 0, Math.PI * 2);
        x.fill();
        // Brow.
        line2(P, [p[0] - 0.016 * s * P.k, p[1] - 0.016 * s * P.k, 0], [p[0] + 0.016 * s * P.k, p[1] - 0.019 * s * P.k, 0], tone(hairC, -0.3), 0.009 * s);
      }
      const nose = pr(off(r.head, [r.HF, 0.108 * s], [hU, -0.03 * s]));
      blob(P, nose, 0.014 * s, 0.018 * s, lift(skin, 0.04), skinM, false);
      const mouth = pr(off(r.head, [r.HF, 0.093 * s], [hU, -0.068 * s]));
      line2(P, [mouth[0] - 0.018 * s * P.k * Math.max(0.3, fw), mouth[1], 0], [mouth[0] + 0.018 * s * P.k * Math.max(0.3, fw), mouth[1], 0], tone(skin, -0.6, 'skin'), 0.008 * s);
    } else {
      // Small: a brow shadow and the eyes as dark points.
      for (const e of vis) {
        const p = pr(e);
        x.fillStyle = 'rgba(40,20,20,0.85)';
        x.fillRect(p[0] - 0.012 * s * P.k, p[1] - 0.008 * s * P.k, 0.024 * s * P.k, 0.016 * s * P.k);
      }
    }
  }
  // Beard.
  if (b.beard && fw > -0.4) {
    x.save();
    x.globalAlpha = 0.9;
    blob(P, pr(off(r.head, [r.HF, 0.055 * s], [hU, -0.075 * s])), 0.065 * s, 0.05 * s, hairC, 'hair', false);
    x.restore();
  }
  // Hair on top (unless something covers it).
  const bare = kit.head === 'none' || kit.head === 'capback' || kit.head === 'earmuff';
  if (bare && b.style !== 4) {
    x.save();
    x.beginPath();
    x.ellipse(C[0], C[1], rx * P.k * 1.08, ry * P.k * 1.08, 0, 0, Math.PI * 2);
    x.clip();
    const big = b.style === 5 ? 1.25 : 1;
    const hc = pr(off(r.head, [hU, 0.045 * s * big], [r.HF, -0.035 * s]));
    const back = fw < -0.3;
    blob(P, back ? C : hc, 0.11 * s * big, (0.1 * P.cp + 0.11 * P.sp) * s * big * (back ? 1.3 : 1), b.style === 1 ? lift(hairC, 0.15) : hairC, 'hair', false);
    x.restore();
    if (b.style === 5) blob(P, pr(off(r.head, [hU, 0.06 * s], [r.HF, -0.03 * s])), 0.125 * s, (0.1 * P.cp + 0.125 * P.sp) * s, hairC, 'hair');
  }
  // Headgear.
  const brim = (h: number, rr: number, col: RGB, m: Mat, fwd = 0): void => {
    const c = pr(off(r.head, [hU, h * s], [r.HF, fwd * s]));
    blob(P, c, rr * s, Math.max(0.012, rr * P.sp) * s, col, m);
  };
  const dome = (h: number, rr: number, hh: number, col: RGB, m: Mat, clipAt: number): void => {
    const c = pr(off(r.head, [hU, h * s]));
    const cut = pr(off(r.head, [hU, clipAt * s]));
    x.save();
    x.beginPath();
    x.rect(c[0] - 1e3, c[1] - 1e3, 2e3, cut[1] - (c[1] - 1e3) + Math.max(0.012, rr * P.sp) * s * P.k);
    x.clip();
    blob(P, c, rr * s, (hh * P.cp + rr * P.sp) * s, col, m);
    x.restore();
  };
  switch (kit.head) {
    case 'helmet': {
      const hc = rgb('#56623c');
      brim(0.005, 0.125, lift(hc, -0.15), 'metal');
      dome(0.03, 0.118, 0.1, hc, 'metal', 0.005);
      if (P.lod > 0 && fw > -0.3) {
        // Goggles on the brow of the helmet.
        const gg = pr(off(r.head, [r.HF, 0.085 * s], [hU, 0.06 * s]));
        blob(P, gg, 0.05 * s * Math.max(0.4, Math.abs(fw)), 0.018 * s, rgb('#2a2e30'), 'metal', false);
        glow(P, gg, 0.02 * s, 'rgba(120,200,255,0.8)');
      }
      break;
    }
    case 'hardhat':
      brim(0.03, 0.13, rgb('#e0a818'), 'cloth');
      dome(0.05, 0.11, 0.085, rgb('#f2c422'), 'cloth', 0.03);
      break;
    case 'cap':
    case 'capback':
    case 'medic': {
      const cc = kit.head === 'medic' ? rgb('#f2f2ec') : kit.head === 'capback' ? rgb('#b03a2a') : lift(uni, -0.2);
      dome(0.04, 0.104, 0.07, cc, 'cloth', 0.035);
      const bill = off(r.head, [hU, 0.035 * s], [r.HF, (kit.head === 'capback' ? -0.12 : 0.12) * s]);
      capsule(P, pr(off(r.head, [hU, 0.035 * s])), pr(bill), 0.04 * s, 0.05 * s, lift(cc, -0.2), 'cloth');
      if (kit.head === 'medic' && P.lod > 0) {
        const m = pr(off(r.head, [hU, 0.09 * s], [r.HF, 0.05 * s]));
        line2(P, [m[0] - 0.02 * s * P.k, m[1], 0], [m[0] + 0.02 * s * P.k, m[1], 0], '#d02020', 0.014 * s);
        line2(P, [m[0], m[1] - 0.02 * s * P.k, 0], [m[0], m[1] + 0.02 * s * P.k, 0], '#d02020', 0.014 * s);
      }
      break;
    }
    case 'peaked': {
      dome(0.06, 0.1, 0.05, uni, 'cloth', 0.05);
      brim(0.1, 0.125, lift(uni, 0.06), 'cloth');
      const band = pr(off(r.head, [hU, 0.065 * s]));
      line2(P, [band[0] - 0.09 * s * P.k, band[1], 0], [band[0] + 0.09 * s * P.k, band[1], 0], '#c8a048', 0.014 * s);
      capsule(P, pr(off(r.head, [hU, 0.045 * s], [r.HF, 0.06 * s])), pr(off(r.head, [hU, 0.035 * s], [r.HF, 0.14 * s])), 0.035 * s, 0.04 * s, rgb('#141414'), 'leather');
      if (fw > 0 && P.lod > 0) blob(P, pr(off(r.head, [hU, 0.1 * s], [r.HF, 0.1 * s])), 0.018 * s, 0.018 * s, rgb('#e0c060'), 'brass', false);
      break;
    }
    case 'hood': {
      const hc = lift(uni, -0.15);
      blob(P, pr(off(r.head, [hU, 0.015 * s], [r.HF, -0.02 * s])), 0.128 * s, (0.13 * P.cp + 0.128 * P.sp) * s, hc, 'cloth');
      if (fw > -0.1) blob(P, pr(off(r.head, [r.HF, 0.07 * s], [hU, -0.01 * s])), 0.06 * s * Math.max(0.35, fw), 0.075 * s, lift(skin, -0.45), 'skin', false);
      break;
    }
    case 'chef':
      capsule(P, pr(off(r.head, [hU, 0.07 * s])), pr(off(r.head, [hU, 0.24 * s], [r.HF, -0.02 * s])), 0.1 * s, 0.12 * s, rgb('#f8f8f4'), 'cloth');
      break;
    case 'pilot': {
      dome(0.02, 0.122, 0.11, rgb('#c8ccd0'), 'metal', -0.02);
      if (fw > -0.2) blob(P, pr(off(r.head, [hU, 0.08 * s], [r.HF, 0.06 * s])), 0.08 * s, 0.03 * s, rgb('#3a6a9a'), 'metal', false);
      break;
    }
    case 'firehelm':
      brim(0.02, 0.15, rgb('#b88a10'), 'metal', -0.03);
      dome(0.05, 0.115, 0.09, rgb('#dcb420'), 'metal', 0.02);
      break;
    case 'earmuff': {
      const band = [-1, 1].map((sd) => off(r.head, [HR, sd * 0.1 * s], [hU, 0.0]));
      capsule(P, pr(band[0]), pr(off(r.head, [hU, 0.13 * s])), 0.012 * s, 0.012 * s, rgb('#e0b818'), 'cloth', false);
      capsule(P, pr(off(r.head, [hU, 0.13 * s])), pr(band[1]), 0.012 * s, 0.012 * s, rgb('#e0b818'), 'cloth', false);
      for (const bb of band) if (facing(P, norm(sub(bb, r.head))) > -0.2) blob(P, pr(bb), 0.035 * s, 0.045 * s, rgb('#e05a1a'), 'cloth');
      break;
    }
    case 'wrap':
      dome(0.035, 0.115, 0.1, rgb('#c8a060'), 'cloth', -0.01);
      capsule(P, pr(off(r.head, [hU, -0.02 * s], [r.HF, -0.09 * s])), pr(off(r.head, [hU, -0.18 * s], [r.HF, -0.12 * s])), 0.04 * s, 0.03 * s, rgb('#b08a50'), 'cloth');
      break;
    default:
  }
}

function paintGun(P: Paint, A: V, B: V, r: Rig, held: Held, s: number): void {
  const D = norm(sub(B, A));
  const Ug = norm(sub(r.U, mul(D, dot(r.U, D))));
  const Sg = norm(cross(D, Ug));
  const ax: [V, V, V] = [D, Ug, Sg];
  const L = Math.hypot(...sub(B, A));
  const at = (t: number, up = 0): V => off(A, [D, L * t], [Ug, up * s]);
  const metal = rgb('#2c3036'), poly = rgb('#3a3c34'), wood = rgb('#6a4a2a');
  if (held === 'minigun') {
    box(P, at(0.2, 0.0), ax, [L * 0.2, 0.07 * s, 0.07 * s], rgb('#3a3e44'), 'metal');
    for (const o of [-0.03, 0.03]) for (const q of [-0.03, 0.03]) {
      const a0 = off(at(0.4), [Ug, o * s], [Sg, q * s]), b0 = off(at(1), [Ug, o * s], [Sg, q * s]);
      capsule(P, proj(P, a0), proj(P, b0), 0.016 * s, 0.014 * s, rgb('#5a6068'), 'metal');
    }
    box(P, at(0.62), ax, [0.02 * s, 0.05 * s, 0.05 * s], rgb('#4a5058'), 'metal');
    box(P, at(0.96), ax, [0.02 * s, 0.05 * s, 0.05 * s], rgb('#3a3e44'), 'metal');
    // Ammo belt to the pack.
    const pk = off(r.pel, [r.U, 0.22 * s], [r.F, -0.15 * s]);
    const x = P.x;
    const a = proj(P, at(0.25, -0.05)), c = proj(P, pk);
    x.strokeStyle = '#c8a040';
    x.lineWidth = 0.035 * s * P.k;
    x.setLineDash([0.02 * s * P.k, 0.012 * s * P.k]);
    x.beginPath();
    x.moveTo(a[0], a[1]);
    x.quadraticCurveTo((a[0] + c[0]) / 2, Math.max(a[1], c[1]) + 0.12 * s * P.k, c[0], c[1]);
    x.stroke();
    x.setLineDash([]);
    return;
  }
  const sniper = held === 'sniper';
  // Stock, receiver, grip, magazine, handguard, barrel, sight.
  box(P, at(0.11, -0.02), ax, [L * 0.11, 0.035 * s, 0.02 * s], sniper ? wood : poly, sniper ? 'leather' : 'cloth');
  box(P, at(0.4, 0), ax, [L * 0.18, 0.038 * s, 0.024 * s], metal, 'metal');
  box(P, off(at(0.3, -0.07), [D, -0.01 * s]), [norm(add(D, mul(Ug, 0.4))), Ug, Sg], [0.018 * s, 0.045 * s, 0.018 * s], poly, 'cloth');
  box(P, off(at(0.47, -0.09), [D, 0.01 * s]), [norm(add(D, mul(Ug, -0.25))), Ug, Sg], [0.02 * s, 0.06 * s, 0.016 * s], rgb('#1e2226'), 'metal');
  box(P, at(sniper ? 0.62 : 0.66, -0.005), ax, [L * 0.09, 0.03 * s, 0.026 * s], sniper ? wood : poly, 'cloth');
  capsule(P, proj(P, at(0.72)), proj(P, at(1)), 0.012 * s, 0.01 * s, rgb('#4a5058'), 'metal');
  if (sniper) capsule(P, proj(P, at(0.3, 0.07)), proj(P, at(0.55, 0.07)), 0.022 * s, 0.022 * s, rgb('#1a1e22'), 'metal');
  else if (P.lod > 0) box(P, at(0.44, 0.05), ax, [0.03 * s, 0.015 * s, 0.012 * s], rgb('#1a1e22'), 'metal');
}

function paintItem(P: Paint, r: Rig, kit: Kit, s: number, pose: HeroPose, lying: boolean): { d: number; draw: () => void } | null {
  if (lying) return null;
  const pr = (v: V): P2 => proj(P, v);
  const hand = (i: 0 | 1): V => off(r.wr[i], [norm(sub(r.wr[i], r.el[i])), 0.045 * s]);
  const h1 = hand(1), h0 = hand(0);
  const held = (): Held | Prop | undefined => r.prop ?? (r.sit ? undefined : kit.held === 'rifle' || kit.held === 'sniper' || kit.held === 'minigun' ? undefined : kit.held);
  const what = held();
  if (!what || what === 'none') return null;
  const d1 = pr(h1)[2];
  switch (what) {
    case 'crate': {
      const c = off(r.pel, [r.F, 0.34 * s], [r.U, 0.2 * s]);
      return { d: pr(c)[2] + 0.02, draw: () => {
        box(P, c, [r.F, UP, r.R], [0.14 * s, 0.13 * s, 0.19 * s], rgb('#8a6a40'), 'leather');
        if (P.lod > 0) line2(P, pr(off(c, [r.F, 0.145 * s], [r.R, -0.18 * s])), pr(off(c, [r.F, 0.145 * s], [r.R, 0.18 * s])), '#5a4028', 0.012 * s);
      } };
    }
    case 'flags':
      return { d: Math.max(d1, pr(h0)[2]) + 0.05, draw: () => {
        for (const i of [0, 1] as const) {
          const h = hand(i);
          const dirA = norm(sub(r.wr[i], r.el[i]));
          const tip = off(h, [dirA, 0.42 * s]);
          line2(P, pr(h), pr(tip), '#6a5a3a', 0.014 * s);
          const w = r.f ? 0.03 : -0.03;
          const out = norm(add(mul(r.R, i ? 1 : -1), [0, w, 0]));
          const fl = [tip, off(tip, [out, 0.22 * s]), off(tip, [out, 0.22 * s], [dirA, -0.16 * s]), off(tip, [dirA, -0.16 * s])].map(pr);
          const x = P.x;
          x.beginPath();
          x.moveTo(fl[0][0], fl[0][1]);
          for (const q of fl.slice(1)) x.lineTo(q[0], q[1]);
          x.closePath();
          x.fillStyle = i ? '#e8401e' : '#f0c420';
          x.fill();
          x.strokeStyle = 'rgba(0,0,0,0.45)';
          x.lineWidth = P.ow;
          x.stroke();
        }
      } };
    case 'hose':
      return { d: d1 + 0.05, draw: () => {
        const noz = off(h0, [r.F, 0.12 * s]);
        capsule(P, pr(h1), pr(noz), 0.025 * s, 0.02 * s, rgb('#c8ccd0'), 'metal');
        const tail = off(r.pel, [r.F, -0.3 * s], [r.U, -0.9 * s]);
        const x = P.x;
        const a = pr(h1), c = pr(tail);
        x.strokeStyle = '#b02020';
        x.lineWidth = 0.035 * s * P.k;
        x.beginPath();
        x.moveTo(a[0], a[1]);
        x.quadraticCurveTo(a[0], c[1], c[0], c[1]);
        x.stroke();
      } };
    case 'torch':
      return { d: d1 + 0.05, draw: () => {
        const tip = off(h1, [r.F, 0.12 * s], [UP, -0.04 * s]);
        capsule(P, pr(h1), pr(tip), 0.018 * s, 0.012 * s, rgb('#8a929c'), 'metal');
        if (r.f) glow(P, pr(tip), 0.12 * s, 'rgba(180,230,255,0.95)');
        // Welding mask down over the face.
        const m = pr(off(r.head, [r.HF, 0.09 * s]));
        P.x.fillStyle = '#1a1e22';
        P.x.beginPath();
        P.x.ellipse(m[0], m[1], 0.05 * s * P.k, 0.08 * s * P.k, 0, 0, Math.PI * 2);
        P.x.fill();
      } };
    case 'binos': {
      const c = off(r.head, [r.HF, 0.15 * s], [UP, -0.01 * s]);
      return { d: pr(c)[2] + 0.02, draw: () => box(P, c, [r.HF, UP, norm(cross(r.HF, UP))], [0.04 * s, 0.03 * s, 0.06 * s], rgb('#1e2226'), 'metal') };
    }
    case 'pistol':
      return { d: d1 + 0.05, draw: () => box(P, off(h1, [r.F, 0.06 * s], [UP, 0.02 * s]), [r.F, UP, r.R], [0.08 * s, 0.03 * s, 0.015 * s], rgb('#26292e'), 'metal') };
    case 'wrench':
      if (pose === 'sit' || pose === 'type') return null;
      return { d: d1 + 0.05, draw: () => {
        const dir = pose === 'work' ? norm(add(r.F, [0, 0.6, 0])) : [0, -1, 0] as V;
        const tip = off(h1, [dir, 0.25 * s]);
        capsule(P, pr(h1), pr(tip), 0.014 * s, 0.014 * s, rgb('#9aa2ac'), 'metal');
        blob(P, pr(tip), 0.03 * s, 0.03 * s, rgb('#b8c0c8'), 'metal');
      } };
    case 'medkit':
      if (pose === 'sit' || pose === 'type') return null;
      return { d: d1 + 0.05, draw: () => {
        const c = off(h1, [UP, -0.09 * s]);
        box(P, c, [r.F, UP, r.R], [0.07 * s, 0.06 * s, 0.03 * s], rgb('#f0f0ea'), 'cloth');
        const m = pr(off(c, [r.R, 0.032 * s]));
        line2(P, [m[0] - 0.03 * s * P.k, m[1], 0], [m[0] + 0.03 * s * P.k, m[1], 0], '#d02020', 0.018 * s);
        line2(P, [m[0], m[1] - 0.03 * s * P.k, 0], [m[0], m[1] + 0.03 * s * P.k, 0], '#d02020', 0.018 * s);
      } };
    case 'clipboard':
      return { d: d1 + 0.05, draw: () => box(P, off(h1, [UP, 0.06 * s]), [r.F, UP, r.R], [0.008 * s, 0.1 * s, 0.08 * s], rgb('#c8b890'), 'cloth') };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Canvases                                                            */
/* ------------------------------------------------------------------ */

const cache = new Map<string, HTMLCanvasElement>();

/** Where a figure painted `S` px stands in its canvas: the point between its feet (pixels). */
export function heroFoot(S: number, view: HeroView = 'side'): { x: number; y: number } {
  return view === 'side' ? { x: Math.round(S * 0.4), y: Math.round(S * 0.955) } : { x: Math.round(S / 2), y: Math.round(S * 0.9) };
}

/** The view's heading snapped to one of sixteen (so the cache stays small). */
function headingKey(view: HeroView): number {
  if (view === 'side') return -1;
  const n = 16;
  return ((Math.round((view.heading / (Math.PI * 2)) * n) % n) + n) % n;
}

/**
 * A person painted into an `S`-pixel-square canvas (the figure stands about 0.86 S tall): from the side facing
 * right, or from above facing `view.heading`.
 */
export function hero(spec: HeroSpec, pose: HeroPose, frame: number, S: number, view: HeroView = 'side'): HTMLCanvasElement {
  const nf = framesOf(pose);
  const f = ((frame % nf) + nf) % nf;
  const hk = headingKey(view);
  const variant = spec.seed & 15;
  const key = `${spec.role}|${variant}|${spec.color ?? ''}|${pose}|${f}|${S}|${hk}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 4000) cache.clear();
  const lying = pose === 'sleep';
  const W = S, H = lying ? Math.ceil(S * 0.46) : S;
  const R = S >= 96 ? 2 : 3;
  const big = document.createElement('canvas');
  big.width = W * R;
  big.height = H * R;
  const x = big.getContext('2d')!;
  let psi: number, phi: number;
  if (view === 'side') {
    psi = -0.36;
    phi = lying ? 0.5 : 0.07;
  } else {
    const hd = (hk / 16) * Math.PI * 2;
    psi = -hd;
    phi = 0.62;
  }
  const k = ((S * 0.86) / 1.8) * R;
  const foot = heroFoot(S, view);
  const P: Paint = {
    x, k, ow: Math.max(1, R * 0.55), ox: lying ? W * R * 0.5 : foot.x * R, oy: lying ? H * R * 0.78 : foot.y * R,
    cu: Math.cos(psi), su: Math.sin(psi), cp: Math.cos(phi), sp: Math.sin(phi), lod: S >= 72 ? 2 : S >= 30 ? 1 : 0,
  };
  paintFigure(P, { ...spec, seed: variant * 97 + (spec.role === 'robot' ? 1 : 0) }, lying ? 'stand' : pose, f, lying);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(big, 0, 0, W, H);
  softOutline(c);
  cache.set(key, c);
  return c;
}

/** A soft dark rim round the figure so it reads against any ground. */
function softOutline(c: HTMLCanvasElement): void {
  const x = c.getContext('2d')!;
  const W = c.width, H = c.height;
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  const a = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) a[i] = d[i * 4 + 3];
  for (let y = 0; y < H; y++) {
    for (let xx = 0; xx < W; xx++) {
      const i = y * W + xx;
      if (a[i] > 90) continue;
      let m = 0;
      if (xx > 0) m = Math.max(m, a[i - 1]);
      if (xx < W - 1) m = Math.max(m, a[i + 1]);
      if (y > 0) m = Math.max(m, a[i - W]);
      if (y < H - 1) m = Math.max(m, a[i + W]);
      if (m < 140) continue;
      const q = i * 4;
      const na = Math.min(255, a[i] + 150);
      const t = a[i] / 255;
      d[q] = d[q] * t + 14 * (1 - t);
      d[q + 1] = d[q + 1] * t + 14 * (1 - t);
      d[q + 2] = d[q + 2] * t + 20 * (1 - t);
      d[q + 3] = na;
    }
  }
  x.putImageData(img, 0, 0);
}

/** The kit of a crew member aboard for what they're doing and their department's colour. */
export function roleForAct(act: string, id: number): HeroRole {
  switch (act) {
    case 'gun': return 'rifleman';
    case 'soldier': return id % 5 === 0 ? 'heavy' : id % 7 === 0 ? 'marine' : 'rifleman';
    case 'engine': case 'build': case 'drill': case 'haul': return 'engineer';
    case 'weld': case 'mechanic': return 'mechanic';
    case 'console': return id % 4 === 0 ? 'officer' : 'crew';
    case 'cook': return 'cook';
    case 'medic': return 'medic';
    case 'hose': case 'pump': case 'fix': return 'firefighter';
    default: return id % 6 === 0 ? 'deckhand' : 'crew';
  }
}
