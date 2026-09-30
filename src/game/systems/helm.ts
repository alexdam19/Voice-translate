import type { Game } from '../game';
import { damageEnemy } from './damage';
import { driveSpec, odStage, type DriveSpec } from './engine';
import { COMPARTMENTS, compName } from './titan';

/**
 * The switches on the captain's console that aren't the throttle: the air horn, the halon dump and the cooldowns
 * behind them. (Floodlights, the pump boost, the master arm and the power divert are read where they act: vision
 * and fuel in the Titan system, the guns and the shield in the world step.)
 */

export const HORN_CD = 12;
/** Sanders: seconds of sand on the crawlers, and the hoppers' refill. */
export const SAND_T = 25;
export const SAND_CD = 70;
/** Smoke dischargers: how long the cloud hangs, and the reload. */
export const SMOKE_T = 10;
export const SMOKE_CD = 45;
export const HALON_CD = 30;
export const HALON_WATER = 60;
/** How far the horn carries from the hull (m). */
export const HORN_RANGE = 260;

export function updateHelm(g: Game, dt: number): void {
  const h = g.helm;
  h.hornCd = Math.max(0, h.hornCd - dt);
  h.halonCd = Math.max(0, h.halonCd - dt);
}

/**
 * The air horn: everything small within earshot flinches (stunned for a moment and thrown back); elites shrug
 * most of it off and titans and bosses ignore it. Returns how many flinched, or -1 while it recharges.
 */
export function soundHorn(g: Game): number {
  const h = g.helm;
  const p = g.player;
  if (h.hornCd > 0 || p.dead) return -1;
  h.hornCd = HORN_CD;
  let n = 0;
  for (const e of g.enemiesNear(p.x, p.y, HORN_RANGE + p.stats.length / 2)) {
    if (e.hp <= 0 || e.titan || e.boss || e.burrowed) continue;
    const d = p.edgeDist(e.x, e.y);
    if (d > HORN_RANGE) continue;
    const k = 1 - d / HORN_RANGE;
    e.stun = Math.max(e.stun, (e.elite ? 0.4 : 1.4) * (0.4 + 0.6 * k));
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    const push = (e.elite ? 4 : 14) * k / Math.max(0.5, e.r);
    e.vx += Math.cos(a) * push;
    e.vy += Math.sin(a) * push;
    e.aggro = true;
    n++;
  }
  g.fx.push({ t: 'ring', x: p.x, y: p.y, r: HORN_RANGE + p.stats.length / 2, color: '#ffd740' });
  g.hooks.sound('roar', p.x, p.y, 0.8);
  return n;
}

/**
 * The halon dump: floods every burning compartment with suppressant. Knocks every fire far back (most go out), costs
 * water from the tanks and some of the air aboard. Returns how many fires it hit, or -1 while the bottles refill.
 */
export function dumpHalon(g: Game): number {
  const h = g.helm;
  const s = g.titan;
  if (h.halonCd > 0 || !g.player.titan) return -1;
  if (s.water < HALON_WATER) return -2;
  h.halonCd = HALON_CD;
  s.water -= HALON_WATER;
  let n = 0;
  for (let i = 0; i < COMPARTMENTS; i++) {
    if (s.fire[i] <= 0) continue;
    n++;
    s.fire[i] = Math.max(0, s.fire[i] - 0.7);
    if (s.fire[i] <= 0) g.hooks.toast(`Fire out: ${compName(i)}.`, '#b0bec5');
  }
  s.oxygen = Math.max(0.15, s.oxygen - 0.012 * Math.max(1, n));
  g.hooks.sound('tesla');
  return n;
}

/**
 * The drive's switches and the engine's perks, each step: the sanders and the smoke running down, sand and smoke
 * pouring off the hull, the Kraken's roar in overdrive, the Hellfire's afterburner scorching what's behind the stern,
 * the Megalodon's traction motors charging card energy under braking.
 */
export function updateHelmGear(g: Game, dt: number, ds: DriveSpec, stage: number): void {
  const h = g.helm;
  const p = g.player;
  h.sandT = Math.max(0, h.sandT - dt);
  h.sandCd = Math.max(0, h.sandCd - dt);
  h.smokeT = Math.max(0, h.smokeT - dt);
  h.smokeCd = Math.max(0, h.smokeCd - dt);
  const L = p.stats.length / 2, W = p.stats.width / 2;
  if (h.sandT > 0 && Math.abs(p.speed) > 0.5 && Math.random() < dt * 14) {
    const b = p.toWorld((Math.random() - 0.5) * p.stats.length * 0.9, (Math.random() < 0.5 ? -1 : 1) * W * 0.95);
    g.fx.push({ t: 'dust', x: b.x, y: b.y, color: '#d8c090' });
  }
  if (h.smokeT > 0 && Math.random() < dt * 24) {
    const a = Math.random() * Math.PI * 2, r = L * (0.6 + Math.random() * 0.8);
    g.fx.push({ t: 'dust', x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, color: '#9aa0a6' });
  }
  if (stage > 0 && ds.def.roar) {
    h.roarT -= dt;
    if (h.roarT <= 0) {
      h.roarT = 3;
      for (const e of g.enemiesNear(p.x, p.y, L + 50)) {
        if (e.hp <= 0 || e.titan || e.boss || e.burrowed || p.edgeDist(e.x, e.y) > 45) continue;
        e.stun = Math.max(e.stun, e.elite ? 0.4 : 1);
      }
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r: L + 45, color: '#ff7040' });
      g.hooks.sound('roar', p.x, p.y, 0.5);
    }
  } else h.roarT = 0;
  if (stage > 0 && ds.def.afterburn) {
    const len = ds.flame.len * (1 + 0.5 * stage);
    const dps = 30 * (1 + stage) * Math.max(1, g.escalation());
    const back = p.toWorld(-L - len / 2, 0);
    for (const e of g.enemiesNear(back.x, back.y, len)) {
      if (e.hp <= 0 || e.burrowed) continue;
      const l = p.toLocal(e.x, e.y);
      if (l.lx > -L || l.lx < -L - len || Math.abs(l.lz) > W * 0.5) continue;
      damageEnemy(g, e, dps * dt, { silent: true, burn: 4 });
    }
  }
  if (ds.def.regen && Math.abs(p.speed) > 8 && (h.brake > 0.2 || (g.driveInput.active && g.driveInput.y > 0.5 && h.lever === 0))) {
    g.energy = Math.min(g.maxEnergy(), g.energy + dt * 0.15);
  }
}

/** Sanders: sand on the crawlers for SAND_T seconds (+25% grip on bad ground). Returns -1 while they refill. */
export function throwSand(g: Game): number {
  const h = g.helm;
  if (h.sandCd > 0 || g.player.dead) return -1;
  h.sandT = SAND_T;
  h.sandCd = SAND_CD;
  g.hooks.sound('ui');
  return SAND_T;
}

/**
 * Smoke dischargers: a cloud round the hull for SMOKE_T seconds. Hits land a third softer inside it, and anything
 * that isn't already on the hull or part of a horde loses track of her. Returns how many lost track, or -1 reloading.
 */
export function fireSmoke(g: Game): number {
  const h = g.helm;
  const p = g.player;
  if (h.smokeCd > 0 || p.dead) return -1;
  h.smokeT = SMOKE_T;
  h.smokeCd = SMOKE_CD;
  p.addBuff('smoke', SMOKE_T, 1);
  let n = 0;
  for (const e of g.enemiesNear(p.x, p.y, p.stats.length / 2 + 400)) {
    if (e.hp <= 0 || e.latch || e.horde || e.boss || e.titan) continue;
    if (p.edgeDist(e.x, e.y) < 30) continue;
    if (e.aggro) n++;
    e.aggro = false;
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.fx.push({ t: 'dust', x: p.x + Math.cos(a) * p.stats.length * 0.6, y: p.y + Math.sin(a) * p.stats.length * 0.6, color: '#b0b6bc' });
  }
  g.hooks.sound('boom', p.x, p.y, 0.4);
  return n;
}

const ROMAN = ['', 'I', 'II', 'III'];

/**
 * Sets the overdrive stage (0 = off). Stage I lights any time; II and III need the engine charged to 80% first (a
 * cold engine can't take it). Returns what happened, for the toast, and whether it worked.
 */
export function setOverdrive(g: Game, stage: number): { ok: boolean; msg: string } {
  const h = g.helm;
  const p = g.player;
  if (!p.titan || p.dead) return { ok: false, msg: 'Overdrive needs a Titan.' };
  if (stage <= 0) {
    const was = h.overdrive;
    h.overdrive = false;
    return { ok: was, msg: 'Overdrive off.' };
  }
  const ds = driveSpec(g, p);
  if (ds.odStages <= 0) return { ok: false, msg: `No overdrive in ${h.mode.toUpperCase()} mode: switch the drive mode to NORMAL or SPORT.` };
  if (stage > ds.odStages) return { ok: false, msg: `The ${ds.def.name} runs ${ds.odStages} overdrive stage${ds.odStages > 1 ? 's' : ''}. Nitro Injectors Mk 4 or a bigger engine open stage ${ROMAN[stage]}.` };
  if (g.titan.fuel <= 0) return { ok: false, msg: 'No fuel for overdrive.' };
  if (h.overheat) return { ok: false, msg: `The engine is still too hot for overdrive (${Math.round(h.heat * 100)}%, relights at ${Math.round(ds.relight * 100)}%).` };
  if (stage >= 2 && p.spool < 0.8) return { ok: false, msg: `Overdrive ${ROMAN[stage]} needs the engine charged to 80% (${Math.round(p.spool * 100)}% now). Open the throttle and let it build.` };
  h.overdrive = true;
  h.odStage = stage;
  const od = odStage(ds, stage);
  const secs = Math.round((1 - h.heat) / (ds.heat * od.heat));
  return { ok: true, msg: `OVERDRIVE ${ROMAN[stage]}: +${Math.round((od.speed - 1) * 100)}% speed, ${od.fuel.toFixed(1)}x fuel burn, about ${secs}s before it overheats.` };
}

/** The overdrive key: off, I, II, III (as far as the engine goes), then off again. */
export function cycleOverdrive(g: Game): { ok: boolean; msg: string } {
  const h = g.helm;
  const max = driveSpec(g, g.player).odStages;
  if (!h.overdrive) return setOverdrive(g, 1);
  if (h.odStage >= max) return setOverdrive(g, 0);
  const r = setOverdrive(g, h.odStage + 1);
  // Couldn't step up (not charged enough): stay where we are rather than drop out.
  return r.ok ? r : { ok: false, msg: r.msg };
}
