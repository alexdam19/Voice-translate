import { threatAt } from '../../shared/mapgen';
import { MAP_SIZE } from '../../shared/constants';
import { ZONE } from '../../shared/map';
import { rollDropRarity, rollWeaponKey } from '../../shared/loot';
import { eid, type Enemy, type Projectile } from '../entities';
import type { Game } from '../game';
import { newWeapon } from '../templates';
import { damageTank, explode } from './damage';
import { skyStrike } from './weapons';

/**
 * Colossi: things bigger than your Titan. A 320 m tracked super-fortress, a 420 m burrowing worm, a six-legged
 * brood mother, a tripod walker taller than a hill. Each one roams in from over the horizon every so often, fights
 * at its own range with heavy telegraphed attacks that really hurt (a broadside can take a fifth of your hull if you
 * sit still in it), and takes minutes to bring down.
 *
 * You can't just shoot the body: its armour turns everything but a scratch. What you kill are its weak points
 * (turrets, missile racks, gill vents, egg sacs, leg joints...), which your guns pick out like any other target;
 * each one you break takes out the attack it powered. With two thirds of them gone the armour over its core
 * splits, and killing the core brings the whole thing down, with the best loot in the Crater.
 */

export type ColossusKind = 'behemoth' | 'leviathan' | 'hivemother' | 'stormwalker';
type AttackKey = 'broadside' | 'missiles' | 'ram' | 'erupt' | 'acid' | 'sweep' | 'brood' | 'mortar' | 'stomp' | 'lance' | 'storm';

interface WeakDef {
  name: string;
  /** Where on the body: fractions of half-length (forward +) and half-width (starboard +). */
  fx: number;
  fz: number;
  /** Hit radius (m) and share of the colossus's health. */
  r: number;
  share: number;
  core?: boolean;
  /** The attack this part powers (broken: that attack stops). */
  powers?: AttackKey;
}

export interface ColossusDef {
  kind: ColossusKind;
  name: string;
  title: string;
  /** Length and width (m). */
  L: number;
  W: number;
  speed: number;
  turn: number;
  /** Health at threat 1 (all parts together). */
  hp: number;
  /** The gap it likes to keep between its body and your hull: close enough for your guns to reach its weak points. */
  ideal: number;
  /** Radius of its body along its length, for shoving and grinding against your hull. */
  bodyR: number;
  zones: number[];
  faction: 'raider' | 'monster' | 'cyborg';
  weak: WeakDef[];
  attacks: AttackKey[];
  color: string;
}

export const COLOSSI: Record<ColossusKind, ColossusDef> = {
  behemoth: {
    kind: 'behemoth', name: 'The Iron Behemoth', title: 'RAIDER SUPER-FORTRESS · 320 m', L: 320, W: 150, speed: 13, turn: 0.16, hp: 14000, ideal: 20, bodyR: 70,
    zones: [ZONE.PASS, ZONE.RUSTBOLT, ZONE.ASH, ZONE.DUNES], faction: 'raider', color: '#c0552a', attacks: ['broadside', 'missiles', 'ram'],
    weak: [
      { name: 'Main turret', fx: 0.28, fz: 0, r: 22, share: 0.17, powers: 'broadside' },
      { name: 'Port missile rack', fx: -0.18, fz: -0.62, r: 14, share: 0.11, powers: 'missiles' },
      { name: 'Starboard missile rack', fx: -0.18, fz: 0.62, r: 14, share: 0.11, powers: 'missiles' },
      { name: 'Port drive sprocket', fx: -0.8, fz: -0.86, r: 15, share: 0.1, powers: 'ram' },
      { name: 'Starboard drive sprocket', fx: -0.8, fz: 0.86, r: 15, share: 0.1, powers: 'ram' },
      { name: 'Reactor core', fx: -0.42, fz: 0, r: 20, share: 0.41, core: true },
    ],
  },
  leviathan: {
    kind: 'leviathan', name: 'The Sand Leviathan', title: 'BURROWING WORM · 420 m', L: 420, W: 70, speed: 20, turn: 0.35, hp: 12500, ideal: 15, bodyR: 32,
    zones: [ZONE.DUNES, ZONE.SCORCHED, ZONE.DIVOT, ZONE.SPIRES], faction: 'monster', color: '#b08a58', attacks: ['erupt', 'acid', 'sweep'],
    weak: [
      { name: 'Maw', fx: 0.94, fz: 0, r: 20, share: 0.16, powers: 'erupt' },
      { name: 'Fore gill vent', fx: 0.5, fz: 0, r: 13, share: 0.12, powers: 'acid' },
      { name: 'Mid gill vent', fx: 0.1, fz: 0, r: 13, share: 0.12, powers: 'acid' },
      { name: 'Tail spike', fx: -0.9, fz: 0, r: 13, share: 0.14, powers: 'sweep' },
      { name: 'Heart', fx: -0.3, fz: 0, r: 18, share: 0.46, core: true },
    ],
  },
  hivemother: {
    kind: 'hivemother', name: 'The Hive Mother', title: 'BROOD COLOSSUS · 280 m', L: 280, W: 200, speed: 9, turn: 0.22, hp: 13000, ideal: 25, bodyR: 70,
    zones: [ZONE.VERDANT, ZONE.LAKE, ZONE.ASH, ZONE.WRAITH], faction: 'monster', color: '#7a3f8f', attacks: ['brood', 'mortar', 'stomp'],
    weak: [
      { name: 'Fore egg sac', fx: -0.35, fz: -0.35, r: 16, share: 0.12, powers: 'brood' },
      { name: 'Aft egg sac', fx: -0.7, fz: 0.25, r: 16, share: 0.12, powers: 'brood' },
      { name: 'Acid gland', fx: 0.35, fz: 0.3, r: 14, share: 0.13, powers: 'mortar' },
      { name: 'Stomping leg', fx: 0.2, fz: -0.85, r: 14, share: 0.13, powers: 'stomp' },
      { name: 'Brain', fx: 0.62, fz: 0, r: 18, share: 0.5, core: true },
    ],
  },
  stormwalker: {
    kind: 'stormwalker', name: 'The Storm Walker', title: 'TRIPOD WAR MACHINE · 300 m', L: 300, W: 300, speed: 11, turn: 0.2, hp: 15000, ideal: 35, bodyR: 45,
    zones: [ZONE.FROST, ZONE.WRAITH, ZONE.SPIRES, ZONE.PASS], faction: 'cyborg', color: '#3a7fb8', attacks: ['lance', 'storm', 'stomp'],
    weak: [
      { name: 'Lightning cannon', fx: 0.36, fz: 0, r: 17, share: 0.16, powers: 'lance' },
      { name: 'Storm coil', fx: -0.22, fz: 0, r: 14, share: 0.13, powers: 'storm' },
      { name: 'Fore leg joint', fx: 0.62, fz: 0, r: 13, share: 0.1, powers: 'stomp' },
      { name: 'Port leg joint', fx: -0.31, fz: -0.537, r: 13, share: 0.1 },
      { name: 'Starboard leg joint', fx: -0.31, fz: 0.537, r: 13, share: 0.1 },
      { name: 'Capacitor core', fx: 0, fz: 0, r: 20, share: 0.41, core: true },
    ],
  },
};

export interface ColossusAttack {
  key: AttackKey;
  t: number;
  total: number;
  x: number;
  y: number;
  a: number;
}

export interface Colossus {
  id: number;
  kind: ColossusKind;
  x: number;
  y: number;
  rot: number;
  speed: number;
  threat: number;
  /** Weak-point enemy ids, in the def's order. */
  parts: number[];
  atk: ColossusAttack | null;
  cd: number;
  /** Seconds alive, and animation clock. */
  t: number;
  anim: number;
  /** Under the sand (the Leviathan between eruptions). */
  burrowed: number;
  /** The worm's spine (world points, head first). */
  spine: { x: number; y: number }[];
  /** Past the core's armour. */
  open: boolean;
  dying: number;
  /** Seconds the player has been far away (it gives up and leaves). */
  lost: number;
  maxHp: number;
  hitFlash: number;
}

/** Seconds between colossi: the first comes a few minutes in. */
const FIRST = 480;
const EVERY: [number, number] = [480, 720];

export function colossusDef(c: Colossus): ColossusDef {
  return COLOSSI[c.kind];
}

/** Hull metres (forward, starboard) to the world. */
export function colossusToWorld(c: Colossus, lx: number, lz: number): { x: number; y: number } {
  const ca = Math.cos(c.rot), sa = Math.sin(c.rot);
  return { x: c.x + lx * ca - lz * sa, y: c.y + lx * sa + lz * ca };
}

function partOf(g: Game, id: number): Enemy | undefined {
  return g.enemies.find((e) => e.id === id);
}

/** Health left (all parts), 0-1. */
export function colossusHealth(g: Game, c: Colossus): { hp: number; max: number } {
  let hp = 0;
  for (const id of c.parts) hp += Math.max(0, partOf(g, id)?.hp ?? 0);
  return { hp, max: c.maxHp };
}

/** Where a weak point is now (the worm's follow its spine). */
function weakPos(c: Colossus, w: WeakDef): { x: number; y: number } {
  const d = COLOSSI[c.kind];
  if (c.kind === 'leviathan' && c.spine.length > 1) {
    const f = (1 - w.fx) / 2;
    const i = Math.min(c.spine.length - 1, Math.max(0, Math.round(f * (c.spine.length - 1))));
    return c.spine[i];
  }
  return colossusToWorld(c, (w.fx * d.L) / 2, (w.fz * d.W) / 2);
}

/** Starts one over the horizon, from the direction of its home ground if it can. */
export function spawnColossus(g: Game, kind?: ColossusKind, at?: { x: number; y: number }): Colossus {
  const p = g.player;
  const zone = g.map.zoneAt(p.x, p.y);
  const pick = kind ?? ((Object.keys(COLOSSI) as ColossusKind[]).find((k) => COLOSSI[k].zones.includes(zone)) ?? 'behemoth');
  const d = COLOSSI[pick];
  const a = Math.random() * Math.PI * 2;
  const x = at?.x ?? Math.max(400, Math.min(MAP_SIZE - 400, p.x + Math.cos(a) * 1100));
  const y = at?.y ?? Math.max(400, Math.min(MAP_SIZE - 400, p.y + Math.sin(a) * 1100));
  const threat = Math.max(1, threatAt(x, y));
  const esc = g.mode === 'world' ? g.escalation() : 1;
  const scale = (0.6 + 0.4 * threat) * esc;
  const c: Colossus = {
    id: eid(), kind: pick, x, y, rot: Math.atan2(p.y - y, p.x - x), speed: 0, threat, parts: [], atk: null, cd: 6, t: 0, anim: 0, burrowed: 0,
    spine: [], open: false, dying: 0, lost: 0, maxHp: d.hp * scale, hitFlash: 0,
  };
  for (let i = 0; i < 24; i++) c.spine.push(colossusToWorld(c, d.L / 2 - (i / 23) * d.L, 0));
  for (const w of d.weak) {
    const pos = weakPos(c, w);
    const e = g.spawnEnemy('colossus_part', pos.x, pos.y, threat);
    e.maxHp = e.hp = d.hp * scale * w.share;
    e.r = w.r;
    e.name = `${w.name}`;
    e.colossus = c.id;
    e.titan = true;
    e.aggro = true;
    e.speed = 0;
    c.parts.push(e.id);
  }
  g.colossi.push(c);
  const dir = Math.atan2(y - p.y, x - p.x);
  const compass = ['EAST', 'SOUTH-EAST', 'SOUTH', 'SOUTH-WEST', 'WEST', 'NORTH-WEST', 'NORTH', 'NORTH-EAST'][((Math.round(dir / (Math.PI / 4)) % 8) + 8) % 8];
  g.hooks.toast(`⚠ COLOSSUS: ${d.name.toUpperCase()} is coming from the ${compass}. Break its weak points, then its core.`, '#ff3d00');
  g.hooks.sound('roar');
  g.hooks.sound('alarm');
  return c;
}

/** When it's time, sends one; moves, fights and cleans up the ones out there. */
export function updateColossi(g: Game, dt: number): void {
  if (g.mode !== 'world') return;
  const p = g.player;
  if (!g.colossi.length) {
    g.colossusT -= dt;
    const hg = g.gen.hangar;
    const home = hg ? Math.hypot(p.x - hg.x, p.y - hg.y) < 1600 : false;
    if (g.colossusT <= 0 && !p.dead && !home && g.campaign.finale === 'none') {
      spawnColossus(g);
      g.colossusT = EVERY[0] + Math.random() * (EVERY[1] - EVERY[0]);
    } else if (g.colossusT <= 0) g.colossusT = 30;
  }
  for (const c of g.colossi) updateOne(g, c, dt);
  const gone = g.colossi.filter((c) => c.dying > 4 || c.lost > 90);
  if (gone.length) {
    for (const c of gone) {
      if (c.lost > 90 && c.dying <= 0) {
        g.hooks.toast(`${COLOSSI[c.kind].name} lost your trail.`, '#ffab40');
        for (const id of c.parts) {
          const e = partOf(g, id);
          if (e) e.hp = 0;
        }
      }
    }
    g.colossi = g.colossi.filter((c) => !gone.includes(c));
    g.enemies = g.enemies.filter((e) => !(e.colossus && gone.some((c) => c.id === e.colossus)));
  }
}

function updateOne(g: Game, c: Colossus, dt: number): void {
  const d = COLOSSI[c.kind];
  const p = g.player;
  c.t += dt;
  c.hitFlash = Math.max(0, c.hitFlash - dt);
  if (c.dying > 0) {
    c.dying += dt;
    // It comes apart in a chain of blasts along the body.
    if (Math.random() < dt * 9) {
      const at = colossusToWorld(c, (Math.random() - 0.5) * d.L, (Math.random() - 0.5) * d.W);
      g.fx.push({ t: 'boom', x: at.x, y: at.y, r: 8 + Math.random() * 14, color: Math.random() < 0.5 ? '#ff9100' : '#ffd740', big: true });
      if (Math.random() < 0.3) g.hooks.sound('bigboom', at.x, at.y, 1);
    }
    return;
  }
  const far = Math.hypot(p.x - c.x, p.y - c.y);
  c.lost = far > 3200 ? c.lost + dt : 0;
  // The gap between its body and your hull: what it steers by.
  const dist = bodyGap(g, c);
  if (g.timeStop > 0) return;
  // Steer: close to its fighting range, then circle there (the ram and the worm come right in).
  const want = Math.atan2(p.y - c.y, p.x - c.x);
  const charging = c.atk?.key === 'ram' && c.atk.t > 1.2;
  const inside = dist < d.ideal * 0.6;
  // Circle the way it's already turning (no dithering between sides).
  const side = Math.sin(c.rot - want) >= 0 ? 1 : -1;
  const heading = charging ? want : dist > d.ideal * 1.4 ? want : want + side * (inside ? Math.PI * 0.65 : Math.PI / 2);
  const da = Math.atan2(Math.sin(heading - c.rot), Math.cos(heading - c.rot));
  c.rot += Math.max(-d.turn * dt, Math.min(d.turn * dt, da)) * (charging ? 2.5 : 1);
  const tracks = brokenCount(g, c, 'ram');
  const target = (charging ? d.speed * 3 : dist > d.ideal * 1.4 ? d.speed : d.speed * 0.55) * (1 - 0.3 * tracks) * (c.burrowed > 0 ? 1.6 : 1);
  c.speed += (target - c.speed) * Math.min(1, dt * 0.6);
  c.x += Math.cos(c.rot) * c.speed * dt;
  c.y += Math.sin(c.rot) * c.speed * dt;
  c.x = Math.max(200, Math.min(MAP_SIZE - 200, c.x));
  c.y = Math.max(200, Math.min(MAP_SIZE - 200, c.y));
  c.anim += dt * (0.4 + c.speed * 0.08);
  // The worm's body follows its head.
  if (c.kind === 'leviathan') {
    const head = colossusToWorld(c, d.L / 2, 0);
    c.spine[0] = head;
    const seg = d.L / (c.spine.length - 1);
    for (let i = 1; i < c.spine.length; i++) {
      const a = c.spine[i - 1], b = c.spine[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      c.spine[i] = { x: a.x + (dx / len) * seg, y: a.y + (dy / len) * seg };
    }
    // Its centre is the middle of the body (for the body collision below).
  }
  if (c.burrowed > 0) c.burrowed = Math.max(0, c.burrowed - dt);
  // The weak points ride on the body.
  const alive = c.parts.map((id) => partOf(g, id));
  d.weak.forEach((w, i) => {
    const e = alive[i];
    if (!e || e.hp <= 0) return;
    const pos = weakPos(c, w);
    e.x = pos.x;
    e.y = pos.y;
    e.burrowed = c.burrowed > 0;
    e.anim = c.anim;
    if (e.hitFlash > 0) c.hitFlash = 0.08;
  });
  // The core opens once two thirds of the rest are broken.
  const nonCore = d.weak.filter((w) => !w.core).length;
  const broken = d.weak.filter((w, i) => !w.core && !(alive[i] && alive[i]!.hp > 0)).length;
  if (!c.open && broken >= Math.ceil((nonCore * 2) / 3)) {
    c.open = true;
    g.hooks.toast(`${d.name}: the armour over its ${d.weak.find((w) => w.core)!.name.toLowerCase()} splits open. Hit it!`, '#ffea00');
    g.hooks.sound('alarm');
  }
  const coreI = d.weak.findIndex((w) => w.core);
  const core = alive[coreI];
  if (!core || core.hp <= 0) {
    die(g, c);
    return;
  }
  // Crushing contact with your hull: it shoves you and grinds the plating.
  bodyContact(g, c, dt);
  // Attacks.
  if (c.atk) {
    c.atk.t += dt;
    stepAttack(g, c, dt);
    if (c.atk && c.atk.t >= c.atk.total) c.atk = null;
  } else if (!p.dead && dist < d.ideal + 260) {
    c.cd -= dt;
    if (c.cd <= 0) {
      const ready = d.attacks.filter((k) => !powerLost(g, c, k));
      if (ready.length) startAttack(g, c, ready[Math.floor(Math.random() * ready.length)]);
      c.cd = 5.5 + Math.random() * 3 - (c.open ? 1.5 : 0);
    }
  }
}

/** How many of the parts powering an attack are broken. */
function brokenCount(g: Game, c: Colossus, key: AttackKey): number {
  const d = COLOSSI[c.kind];
  let n = 0;
  d.weak.forEach((w, i) => {
    if (w.powers !== key) return;
    const e = partOf(g, c.parts[i]);
    if (!e || e.hp <= 0) n++;
  });
  return n;
}

/** An attack is gone once every part powering it is broken. */
function powerLost(g: Game, c: Colossus, key: AttackKey): boolean {
  const d = COLOSSI[c.kind];
  const powering = d.weak.filter((w) => w.powers === key).length;
  return powering > 0 && brokenCount(g, c, key) >= powering;
}

/** Damage scale: threat, and the colossus is angrier with its core open. */
const hit = (c: Colossus, base: number): number => base * (0.8 + 0.2 * c.threat) * (c.open ? 1.25 : 1);

function startAttack(g: Game, c: Colossus, key: AttackKey): void {
  const p = g.player;
  const d = COLOSSI[c.kind];
  const lead = 1.6;
  const tx = p.x + Math.cos(p.rot) * p.speed * lead, ty = p.y + Math.sin(p.rot) * p.speed * lead;
  const a = Math.atan2(ty - c.y, tx - c.x);
  const total: Record<AttackKey, number> = { broadside: 3.2, missiles: 3, ram: 5, erupt: 6, acid: 2.5, sweep: 2.4, brood: 2, mortar: 3, stomp: 2.2, lance: 3.2, storm: 3.5 };
  c.atk = { key, t: 0, total: total[key], x: tx, y: ty, a };
  const say: Partial<Record<AttackKey, string>> = {
    broadside: 'BROADSIDE! Get moving!', ram: 'It is charging!', erupt: 'It dived under the sand...', lance: 'LIGHTNING LANCE charging!', brood: 'The brood is hatching!', storm: 'The sky crackles around you!',
  };
  if (say[key]) g.hooks.toast(`${d.name}: ${say[key]}`, '#ff6d00');
  switch (key) {
    case 'broadside':
      // Six heavy shells walked across where you'll be.
      for (let i = 0; i < 6; i++) {
        const ox = (Math.random() - 0.5) * 200, oy = (Math.random() - 0.5) * 140;
        telegraph(g, tx + ox, ty + oy, 24, 1.8 + i * 0.14, hit(c, 75), '#ff3d00');
      }
      g.hooks.sound('bigboom', c.x, c.y, 0.8);
      break;
    case 'mortar':
      for (let i = 0; i < 6; i++) {
        const ox = (Math.random() - 0.5) * 140, oy = (Math.random() - 0.5) * 100;
        const x = tx + ox, y = ty + oy;
        telegraph(g, x, y, 22, 2 + i * 0.15, hit(c, 100), '#76ff03', () => {
          explode(g, x, y, 22, hit(c, 100), 'enemy', {}, '#76ff03');
          g.zones.push({ id: eid(), x, y, r: 20, t: 6, kind: 'acid', dps: hit(c, 25), team: 'enemy' });
        });
      }
      break;
    case 'erupt':
      c.burrowed = 4.5;
      break;
    case 'lance':
      g.telegraphs.push({ id: eid(), x: c.x, y: c.y, shape: 'line', r: 22, a, len: Math.hypot(tx - c.x, ty - c.y) + 200, t: 0, total: 2.2, color: '#40c4ff', team: 'enemy', dmg: 0 });
      break;
    case 'sweep': {
      const side = Math.random() < 0.5 ? -1 : 1;
      const sa = c.rot + side * Math.PI / 2;
      g.telegraphs.push({ id: eid(), x: c.x, y: c.y, shape: 'line', r: 60, a: sa, len: 200, t: 0, total: 1.8, color: '#ff1744', team: 'enemy', dmg: 0 });
      c.atk.a = sa;
      break;
    }
    case 'stomp': {
      const pos = colossusToWorld(c, d.L * 0.25, (Math.random() < 0.5 ? -1 : 1) * d.W * 0.45);
      c.atk.x = p.edgeDist(pos.x, pos.y) < 120 ? pos.x : tx;
      c.atk.y = p.edgeDist(pos.x, pos.y) < 120 ? pos.y : ty;
      telegraph(g, c.atk.x, c.atk.y, 70, 1.8, hit(c, 300), '#ff1744');
      break;
    }
    case 'storm':
      for (let i = 0; i < 12; i++) {
        const x = tx + (Math.random() - 0.5) * 220, y = ty + (Math.random() - 0.5) * 160;
        telegraph(g, x, y, 18, 1.4 + i * 0.16, 0, '#82b1ff', () => skyStrike(g, 'enemy', x, y, hit(c, 75), {}, '#82b1ff', 18));
      }
      break;
    default:
      break;
  }
}

function stepAttack(g: Game, c: Colossus, dt: number): void {
  const a = c.atk!;
  const p = g.player;
  const d = COLOSSI[c.kind];
  const once = (at: number): boolean => a.t >= at && a.t - dt < at;
  switch (a.key) {
    case 'missiles':
      // Two ripples of homing missiles (point defence can shoot them down).
      if (once(0.4) || once(1.6)) {
        for (let i = 0; i < 8; i++) {
          const side = i % 2 ? 1 : -1;
          const from = colossusToWorld(c, -d.L * 0.09, side * d.W * 0.31);
          missile(g, from.x, from.y, c.rot + side * (Math.PI / 2) + (Math.random() - 0.5) * 0.6, hit(c, 40));
        }
        g.hooks.sound('rocket', c.x, c.y, 0.9);
      }
      break;
    case 'ram':
      if (once(1.2)) g.hooks.sound('roar', c.x, c.y, 1);
      break;
    case 'erupt':
      // Underground it tracks you; then the ground opens where you are.
      if (once(3)) {
        a.x = p.x;
        a.y = p.y;
        telegraph(g, a.x, a.y, 85, 1.6, 0, '#ffab40', () => {
          explode(g, a.x, a.y, 85, hit(c, 450), 'enemy', {}, '#d7a860');
          g.fx.push({ t: 'shake', amt: 2 });
          // It comes up there, head first.
          c.x = a.x - Math.cos(c.rot) * COLOSSI.leviathan.L * 0.5;
          c.y = a.y - Math.sin(c.rot) * COLOSSI.leviathan.L * 0.5;
          c.burrowed = 0;
        });
      }
      break;
    case 'acid':
      if (once(0.6) || once(1.2) || once(1.8)) {
        for (let i = 0; i < 4; i++) {
          const x = p.x + (Math.random() - 0.5) * 150, y = p.y + (Math.random() - 0.5) * 110;
          const from = colossusToWorld(c, d.L * 0.3, 0);
          lob(g, from.x, from.y, x, y, hit(c, 50), '#76ff03');
        }
      }
      break;
    case 'sweep':
      if (once(1.8)) lineDamage(g, c.x, c.y, a.a, 200, 60, hit(c, 260), '#ff1744');
      break;
    case 'lance':
      if (once(2.2)) {
        lineDamage(g, c.x, c.y, a.a, Math.hypot(a.x - c.x, a.y - c.y) + 200, 22, hit(c, 550), '#40c4ff');
        g.fx.push({ t: 'beam', x0: c.x, y0: c.y, x1: c.x + Math.cos(a.a) * 900, y1: c.y + Math.sin(a.a) * 900, color: '#82b1ff', w: 16, life: 0.5 });
        g.hooks.sound('rail', c.x, c.y, 1);
      }
      break;
    case 'brood':
      if (once(1)) {
        const from = colossusToWorld(c, -d.L * 0.45, 0);
        for (let i = 0; i < 26; i++) {
          const e = g.spawnEnemy(i % 5 === 0 ? 'stalker' : 'z_runner', from.x + (Math.random() - 0.5) * 80, from.y + (Math.random() - 0.5) * 80, c.threat);
          e.horde = true;
          e.aggro = true;
          e.speed *= 1.4;
        }
        g.hooks.sound('roar', c.x, c.y, 0.8);
      }
      break;
    default:
      break;
  }
}

/** Its body sample points (world), for the gap to your hull and for contact. */
function bodyPoints(c: Colossus): { x: number; y: number }[] {
  const d = COLOSSI[c.kind];
  if (c.kind === 'leviathan') return c.spine.filter((_, i) => i % 3 === 0);
  if (c.kind === 'stormwalker') return [{ x: c.x, y: c.y }];
  return [colossusToWorld(c, d.L * 0.28, 0), { x: c.x, y: c.y }, colossusToWorld(c, -d.L * 0.28, 0)];
}

/** Metres between its body and your hull (negative: touching). */
export function bodyGap(g: Game, c: Colossus): number {
  const d = COLOSSI[c.kind];
  let best = Infinity;
  for (const q of bodyPoints(c)) best = Math.min(best, g.player.edgeDist(q.x, q.y) - d.bodyR);
  return best;
}

/** The hull grinds against yours: a shove apart and damage to the plating (a charge hits much harder). */
function bodyContact(g: Game, c: Colossus, dt: number): void {
  const p = g.player;
  if (p.dead || c.burrowed > 0) return;
  const d = COLOSSI[c.kind];
  const pts = bodyPoints(c);
  const rr = d.bodyR;
  for (const q of pts) {
    const edge = p.edgeDist(q.x, q.y);
    if (edge > rr) continue;
    const dx = p.x - q.x, dy = p.y - q.y;
    const len = Math.hypot(dx, dy) || 1;
    const push = (rr - edge) * 2;
    p.pushX += (dx / len) * push * dt * 6;
    p.pushY += (dy / len) * push * dt * 6;
    const ram = c.atk?.key === 'ram' && c.atk.t > 1.2;
    explodeless(g, hit(c, ram ? 0 : 50) * dt, q);
    if (ram) {
      c.atk!.t = c.atk!.total;
      g.fx.push({ t: 'shake', amt: 2.5 });
      g.hooks.sound('bigboom', q.x, q.y, 1);
      damageTank(g, p, hit(c, 500), { at: q });
    }
    break;
  }
}

function explodeless(g: Game, dmg: number, at: { x: number; y: number }): void {
  damageTank(g, g.player, dmg, { silent: true, at });
}

function die(g: Game, c: Colossus): void {
  const d = COLOSSI[c.kind];
  c.dying = 0.01;
  c.atk = null;
  for (const id of c.parts) {
    const e = partOf(g, id);
    if (e) e.hp = 0;
  }
  g.hooks.toast(`${d.name.toUpperCase()} IS DOWN!`, '#76ff03');
  g.hooks.sound('legendary');
  g.fx.push({ t: 'shake', amt: 3 });
  g.stats.titans++;
  g.stats.colossi = (g.stats.colossi ?? 0) + 1;
  // The best loot in the Crater, spilled across the wreck.
  const th = c.threat + 1;
  for (let i = 0; i < 6; i++) {
    const at = colossusToWorld(c, (Math.random() - 0.5) * d.L * 0.6, (Math.random() - 0.5) * d.W * 0.5);
    g.dropLoot(at.x, at.y, 'titan', 4);
  }
  g.dropStacks(c.x, c.y, [{ id: 'xeno_alloy', n: 6 + Math.round(c.threat * 2) }, { id: 'titanium_alloy', n: 20 }, { id: 'tech_parts', n: 6 }, { id: 'scrap', n: 400 }]);
  for (let i = 0; i < 2; i++) g.dropPickup(c.x + i * 20, c.y, { kind: 'weapon', weapon: newWeapon(rollWeaponKey(Math.random), rollDropRarity(Math.random, th, 2, 3)) });
  g.dropPickup(c.x, c.y + 20, { kind: 'chest', chest: 'legendary_pack', chestThreat: th });
  g.dropPickup(c.x, c.y - 20, { kind: 'chest', chest: 'titan', chestThreat: th });
  g.gainXp(1500 + 150 * g.commander.level);
}

/** A weak point broke. */
export function onColossusPart(g: Game, e: Enemy): void {
  const c = g.colossi.find((k) => k.id === e.colossus);
  if (!c) return;
  const d = COLOSSI[c.kind];
  const i = c.parts.indexOf(e.id);
  const w = d.weak[i];
  if (!w || w.core) return;
  g.hooks.toast(`${w.name.toUpperCase()} DESTROYED${w.powers && powerLost(g, c, w.powers) ? ` · no more ${w.powers.toUpperCase()}` : ''}`, '#ffd740');
  g.fx.push({ t: 'boom', x: e.x, y: e.y, r: w.r * 1.6, color: '#ff9100', big: true });
  g.fx.push({ t: 'shake', amt: 1.2 });
  g.hooks.sound('bigboom', e.x, e.y, 1);
  g.dropLoot(e.x, e.y, 'titan', 1);
  g.gainXp(120);
}

/** Can guns touch this part yet? The core is armoured until it opens. */
export function colossusShielded(g: Game, e: Enemy): boolean {
  const c = g.colossi.find((k) => k.id === e.colossus);
  if (!c) return false;
  const i = c.parts.indexOf(e.id);
  return !!COLOSSI[c.kind].weak[i]?.core && !c.open;
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

function telegraph(g: Game, x: number, y: number, r: number, total: number, dmg: number, color: string, onDone?: () => void): void {
  g.telegraphs.push({ id: eid(), x, y, shape: 'circle', r, a: 0, len: 0, t: 0, total, color, team: 'enemy', dmg, onDone });
}

/** Damage along a strip (beams, tail sweeps): whatever of your hull lies in it. */
function lineDamage(g: Game, x0: number, y0: number, a: number, len: number, w: number, dmg: number, color: string): void {
  const p = g.player;
  for (let s = 0; s <= len; s += 10) {
    const x = x0 + Math.cos(a) * s, y = y0 + Math.sin(a) * s;
    if (p.edgeDist(x, y) < w) {
      damageTank(g, p, dmg, { at: { x, y } });
      g.fx.push({ t: 'boom', x, y, r: w * 0.6, color, big: true });
      return;
    }
  }
}

function missile(g: Game, x: number, y: number, a: number, dmg: number): void {
  const sp = 70;
  g.projectiles.push({
    id: eid(), x, y, z: 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0, team: 'enemy', kind: 'missile', dmg, splash: 10, pierce: 0,
    life: 0, maxLife: 9, color: '#ff6d00', homing: 2.2, targetId: g.player.id, arc: false, tx: 0, ty: 0, burn: 0, crit: false, lifesteal: 0, srcTank: 0,
    hit: [], flyer: 0, interceptable: true, hp: 1, size: 1.2,
  } as Projectile);
}

function lob(g: Game, x0: number, y0: number, x: number, y: number, dmg: number, color: string): void {
  const flight = 1.6;
  const z0 = 20;
  g.projectiles.push({
    id: eid(), x: x0, y: y0, z: z0, vx: (x - x0) / flight, vy: (y - y0) / flight, vz: (9.8 * flight) / 2 - z0 / flight, team: 'enemy', kind: 'acid', dmg, splash: 16,
    pierce: 0, life: 0, maxLife: flight, color, homing: 0, targetId: 0, arc: true, tx: x, ty: y, burn: 0, crit: false, lifesteal: 0, srcTank: 0, hit: [], flyer: 0,
    interceptable: false, hp: 1, size: 2,
  } as Projectile);
}

export const COLOSSUS_TIMING = { FIRST, EVERY };
