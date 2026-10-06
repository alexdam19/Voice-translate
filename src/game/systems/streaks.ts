import type { Enemy } from '../entities';
import type { Game } from '../game';
import { damageEnemy, explode } from './damage';

/**
 * Killstreaks: every kill builds the streak (a swarm rat a little, an elite more, a giant a lot), and it bleeds away
 * when the killing stops. Reach a mark and its reward is banked, ready to call in: you take the controls on a
 * camera feed (the grainy, scan-lined VHS picture of a drone, a gunship or a satellite), aim with the pointer and
 * fire what it carries, each weapon with its own ammunition, until the ammunition or the time runs out. Losing the
 * Titan loses the streak (not what's banked).
 *
 *  - Hellfire Drone: ride one guided missile down from a drone high overhead, steer it, boost it in. One very big hole.
 *  - Gunship Overwatch: a gunship circles for half a minute: 25 mm, 40 mm and 105 mm cannons, shells taking a moment
 *    to land.
 *  - Orbital Lance: a satellite's laser, held on and dragged across the ground for as long as its charge lasts.
 */

export type StreakKind = 'hellfire' | 'gunship' | 'lance';

export interface StreakWeapon {
  name: string;
  ammo: number;
  /** Shots a second (the lance: charge spent a second). */
  rate: number;
  dmg: number;
  /** Blast radius (m). */
  r: number;
  /** Seconds from the trigger to the shell landing. */
  delay: number;
  /** Scatter (m). */
  spread: number;
  color: string;
  sound: string;
}

export interface StreakDef {
  name: string;
  /** Streak points to earn it. */
  pts: number;
  /** The camera's call sign on the feed. */
  cam: string;
  /** How long the feed lasts (s). */
  time: number;
  /** View width on the feed (m). */
  view: number;
  weapons: StreakWeapon[];
  desc: string;
  color: string;
}

export const STREAKS: Record<StreakKind, StreakDef> = {
  hellfire: {
    name: 'Hellfire Drone', pts: 30, cam: 'REAPER-2 · HELLFIRE', time: 12, view: 180, color: '#ffd740',
    weapons: [{ name: 'AGM HELLFIRE', ammo: 1, rate: 1, dmg: 2600, r: 26, delay: 0, spread: 0, color: '#ffab40', sound: 'bigboom' }],
    desc: 'A drone high overhead lets go of a guided missile and you ride it down on its camera: steer with the pointer, click to boost. One shot, one very big hole.',
  },
  gunship: {
    name: 'Gunship Overwatch', pts: 90, cam: 'SPECTRE-07 · TV', time: 35, view: 240, color: '#b2ff59',
    weapons: [
      { name: '25MM', ammo: 160, rate: 9, dmg: 60, r: 3, delay: 0.35, spread: 2.5, color: '#ffe082', sound: 'smg' },
      { name: '40MM', ammo: 30, rate: 1.6, dmg: 320, r: 7.5, delay: 0.75, spread: 3, color: '#ffab40', sound: 'cannon' },
      { name: '105MM', ammo: 6, rate: 0.4, dmg: 1700, r: 18, delay: 1.5, spread: 2, color: '#ff6d00', sound: 'bigboom' },
    ],
    desc: 'A gunship circles overhead for 35 s and you work its guns on the thermal camera: the 25 mm chain gun, the 40 mm Bofors and the 105 mm howitzer, each with its own ammunition. Shells take a moment to land.',
  },
  lance: {
    name: 'Orbital Lance', pts: 180, cam: 'SAT-LANCE · OPTICAL', time: 14, view: 300, color: '#40c4ff',
    weapons: [{ name: 'LANCE CHARGE', ammo: 100, rate: 12, dmg: 1100, r: 9, delay: 0, spread: 0, color: '#80d8ff', sound: 'laser' }],
    desc: 'A satellite\'s laser: hold the trigger and drag the beam across the ground for as long as its charge lasts. Nothing it crosses is left standing.',
  },
};

export const STREAK_ORDER: StreakKind[] = ['hellfire', 'gunship', 'lance'];

export interface ActiveStreak {
  kind: StreakKind;
  /** Seconds left on the feed. */
  t: number;
  /** Selected weapon and the ammunition left in each. */
  w: number;
  ammo: number[];
  cd: number;
  /** The crosshair (world). */
  aim: { x: number; y: number };
  /** Where the camera looks (world) and how wide (m). */
  cam: { x: number; y: number; view: number };
  /** Shells on the way down. */
  shells: { x: number; y: number; t: number; w: number }[];
  /** The Hellfire itself: where it is over the ground, how high, boosting. */
  msl?: { x: number; y: number; h: number; boost: boolean };
  /** The lance's spot on the ground. */
  beam?: { x: number; y: number };
  /** Trigger held (the gunship's guns and the lance fire while it's down). */
  held: boolean;
  /** After the end: the feed holds on the impact for a moment. */
  over: number;
  kills: number;
}

export interface StreakState {
  pts: number;
  /** Seconds since the last kill. */
  idle: number;
  /** The best streak this run. */
  best: number;
  /** Rewards earned and waiting to be called in. */
  ready: StreakKind[];
  active: ActiveStreak | null;
}

export const newStreak = (): StreakState => ({ pts: 0, idle: 0, best: 0, ready: [], active: null });

/** Seconds of quiet before the streak starts bleeding, and how fast it bleeds. */
const GRACE = 15;
const BLEED = 3;

/** A kill builds the streak; crossing a mark banks its reward. */
export function streakKill(g: Game, e: Enemy): void {
  const s = g.streak;
  const pts = e.boss ? 30 : e.titan ? 20 : e.elite ? 4 : e.horde ? 0.25 : 1;
  if (s.active) s.active.kills++;
  const before = s.pts;
  s.pts += pts;
  s.idle = 0;
  s.best = Math.max(s.best, s.pts);
  for (const k of STREAK_ORDER) {
    const d = STREAKS[k];
    if (before < d.pts && s.pts >= d.pts && !s.ready.includes(k)) {
      s.ready.push(k);
      g.hooks.toast(`KILLSTREAK: ${d.name.toUpperCase()} READY · press K or tap it to call it in`, d.color);
      g.hooks.sound('streak');
    }
  }
}

/** The Titan lost: the streak goes with her (what's banked stays). */
export function streakReset(g: Game): void {
  g.streak.pts = 0;
  g.streak.idle = 0;
  if (g.streak.active) endStreak(g);
}

/** Why a reward can't be called in now, or null. */
export function streakBlocked(g: Game, kind: StreakKind): string | null {
  if (g.streak.active) return 'A killstreak is already running.';
  if (!g.streak.ready.includes(kind)) return `${STREAKS[kind].name} isn't earned yet (${Math.floor(g.streak.pts)}/${STREAKS[kind].pts}).`;
  if (g.player.dead || g.mode !== 'world') return 'Not now.';
  return null;
}

/** Calls in a banked reward: the camera feed takes over. */
export function startStreak(g: Game, kind: StreakKind): string | null {
  const why = streakBlocked(g, kind);
  if (why) return why;
  const d = STREAKS[kind];
  g.streak.ready = g.streak.ready.filter((k) => k !== kind);
  const p = g.player;
  // Start the crosshair on the thickest knot of hostiles near her, or ahead of her.
  const aim = hotSpot(g) ?? { x: p.x + Math.cos(p.rot) * 90, y: p.y + Math.sin(p.rot) * 90 };
  const a: ActiveStreak = {
    kind, t: d.time, w: 0, ammo: d.weapons.map((w) => w.ammo), cd: 0, aim: { ...aim }, cam: { x: aim.x, y: aim.y, view: d.view }, shells: [], held: false, over: 0, kills: 0,
  };
  if (kind === 'hellfire') a.msl = { x: p.x, y: p.y, h: 900, boost: false };
  if (kind === 'lance') a.beam = { ...aim };
  g.streak.active = a;
  g.hooks.toast(`${d.name.toUpperCase()}: ${kind === 'hellfire' ? 'steer it in with the pointer, click to boost' : kind === 'gunship' ? 'click to fire, 1/2/3 or the wheel to change guns' : 'hold to fire, drag the beam'} · Esc to leave`, d.color);
  g.hooks.sound('vhs');
  return null;
}

/** Where the hostiles are thickest within reach of the Titan (for a starting aim), or null. */
function hotSpot(g: Game): { x: number; y: number } | null {
  const p = g.player;
  let best: { x: number; y: number } | null = null, bn = 0;
  const near = g.enemiesNear(p.x, p.y, 400);
  for (let i = 0; i < near.length; i += Math.max(1, Math.floor(near.length / 40))) {
    const e = near[i];
    if (e.hp <= 0 || e.colossus) continue;
    let n = 0;
    for (const f of near) if (Math.abs(f.x - e.x) < 25 && Math.abs(f.y - e.y) < 25) n += f.titan || f.boss ? 10 : 1;
    if (n > bn) {
      bn = n;
      best = { x: e.x, y: e.y };
    }
  }
  return best;
}

export function streakAim(g: Game, x: number, y: number): void {
  const a = g.streak.active;
  if (!a || a.over > 0) return;
  // The feed can't look further than its platform can see from over the Titan.
  const p = g.player;
  const lim = a.kind === 'hellfire' ? 600 : 420;
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
  a.aim.x = d > lim ? p.x + (dx / d) * lim : x;
  a.aim.y = d > lim ? p.y + (dy / d) * lim : y;
}

export function streakSwitch(g: Game, w: number): void {
  const a = g.streak.active;
  if (!a) return;
  const n = STREAKS[a.kind].weapons.length;
  a.w = ((w % n) + n) % n;
  a.cd = Math.max(a.cd, 0.25);
}

/** The trigger: pressed (true) or released (false). A press fires once at once; holding keeps firing. */
export function streakTrigger(g: Game, down: boolean): void {
  const a = g.streak.active;
  if (!a || a.over > 0) return;
  a.held = down;
  if (down && a.kind === 'hellfire' && a.msl) {
    if (!a.msl.boost) {
      a.msl.boost = true;
      a.ammo[0] = 0;
      g.hooks.sound('rocket');
    }
  } else if (down) fireOnce(g, a);
}

function fireOnce(g: Game, a: ActiveStreak): void {
  const wd = STREAKS[a.kind].weapons[a.w];
  if (a.kind === 'lance' || a.cd > 0 || a.ammo[a.w] <= 0) return;
  a.ammo[a.w]--;
  a.cd = 1 / wd.rate;
  const sx = a.aim.x + (Math.random() - 0.5) * 2 * wd.spread, sy = a.aim.y + (Math.random() - 0.5) * 2 * wd.spread;
  a.shells.push({ x: sx, y: sy, t: wd.delay, w: a.w });
  g.hooks.sound(wd.sound === 'bigboom' ? 'cannon' : wd.sound, g.player.x, g.player.y, 0.5);
  // When every gun is dry, the feed holds for the last shells to land, then cuts.
  if (a.ammo.every((n) => n <= 0)) a.t = Math.min(a.t, Math.max(...STREAKS[a.kind].weapons.map((w) => w.delay)) + 1.2);
}

export function endStreak(g: Game): void {
  const a = g.streak.active;
  if (!a) return;
  g.streak.active = null;
  g.hooks.toast(`${STREAKS[a.kind].name}: feed lost${a.kills ? ` · ${a.kills} kill${a.kills > 1 ? 's' : ''}` : ''}.`, '#b0bec5');
}

export function updateStreaks(g: Game, dt: number): void {
  const s = g.streak;
  s.idle += dt;
  if (s.idle > GRACE && !s.active) s.pts = Math.max(0, s.pts - BLEED * dt);
  const a = s.active;
  if (!a) return;
  const d = STREAKS[a.kind];
  if (g.player.dead || g.mode !== 'world') {
    endStreak(g);
    return;
  }
  // Shells on the way down.
  for (let i = a.shells.length - 1; i >= 0; i--) {
    const sh = a.shells[i];
    sh.t -= dt;
    if (sh.t > 0) continue;
    const wd = d.weapons[sh.w];
    explode(g, sh.x, sh.y, wd.r, wd.dmg, 'player', {}, wd.color, wd.r < 4);
    a.shells.splice(i, 1);
  }
  if (a.over > 0) {
    a.over -= dt;
    if (a.over <= 0) endStreak(g);
    return;
  }
  a.t -= dt;
  a.cd = Math.max(0, a.cd - dt);
  if (a.kind === 'hellfire' && a.msl) {
    // The missile falls toward the ground, sliding toward the crosshair; boosted it falls three times as fast.
    const m = a.msl;
    const fall = m.boost ? 380 : 120, slide = m.boost ? 90 : 55;
    m.h -= fall * dt;
    const dx = a.aim.x - m.x, dy = a.aim.y - m.y, dd = Math.hypot(dx, dy);
    const step = Math.min(dd, slide * dt);
    if (dd > 0.01) {
      m.x += (dx / dd) * step;
      m.y += (dy / dd) * step;
    }
    a.cam.x = m.x;
    a.cam.y = m.y;
    a.cam.view = 60 + m.h * 0.22;
    if (m.h <= 0 || a.t <= 0) {
      const wd = d.weapons[0];
      explode(g, m.x, m.y, wd.r, wd.dmg, 'player', {}, wd.color);
      g.fx.push({ t: 'shake', amt: 1.4 });
      a.ammo[0] = 0;
      a.msl = undefined;
      a.over = 1.4;
    }
    return;
  }
  if (a.kind === 'lance' && a.beam) {
    // The beam drags after the crosshair; while the trigger is held it burns, spending charge.
    const b = a.beam;
    const dx = a.aim.x - b.x, dy = a.aim.y - b.y, dd = Math.hypot(dx, dy);
    const step = Math.min(dd, 45 * dt);
    if (dd > 0.01) {
      b.x += (dx / dd) * step;
      b.y += (dy / dd) * step;
    }
    const wd = d.weapons[0];
    if (a.held && a.ammo[0] > 0) {
      a.ammo[0] = Math.max(0, a.ammo[0] - wd.rate * dt);
      for (const e of g.enemiesNear(b.x, b.y, wd.r + 2)) {
        if (e.hp <= 0 || e.burrowed) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) - e.r > wd.r) continue;
        damageEnemy(g, e, wd.dmg * dt, { silent: true });
      }
      g.fx.push({ t: 'beam', x0: b.x, y0: b.y - 60, x1: b.x, y1: b.y, color: wd.color, w: 2.2, life: 0.06 });
      if (Math.random() < dt * 12) g.fx.push({ t: 'boom', x: b.x + (Math.random() - 0.5) * wd.r, y: b.y + (Math.random() - 0.5) * wd.r, r: 3, color: '#b3e5fc', big: false });
      if (a.ammo[0] <= 0) a.t = Math.min(a.t, 0.6);
    }
    a.cam.x += (b.x - a.cam.x) * Math.min(1, dt * 3);
    a.cam.y += (b.y - a.cam.y) * Math.min(1, dt * 3);
  } else {
    // The gunship: the trigger held keeps the selected gun going; the camera eases after the crosshair.
    if (a.held) fireOnce(g, a);
    a.cam.x += (a.aim.x - a.cam.x) * Math.min(1, dt * 2.2);
    a.cam.y += (a.aim.y - a.cam.y) * Math.min(1, dt * 2.2);
  }
  if (a.t <= 0) {
    a.over = a.shells.length ? Math.max(...a.shells.map((s2) => s2.t)) + 0.4 : 0.3;
  }
}
