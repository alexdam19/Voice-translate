import { MODULES } from '../defs';
import type { Game } from '../game';
import { ROBOT_REPAIR } from './robots';
import { COMPARTMENTS, compName, SYSTEMS, TOROIDS, ZONES, type ArmorZone, type SysKey } from './titan';
import type { ModuleInst } from '../tank';
import { WEAPONS } from '../../shared/weapons';

/**
 * Crew operations: the reserve in the Barracks, and repair teams you send from the vitals screen.
 *
 * A team is six people. They come out of the reserve first, then off-watch hands, and failing both they're pulled
 * off their posts (up to a third of the crew; the posts they leave run short until they're back). With AUTO on,
 * damage control sends the next team to the worst open job as soon as one is free, so nothing waits on a click. They walk to the trouble (lifts and the Spine: longer to the bottom
 * decks and the roof), fix it far faster than the damage-control rota does, and walk home. Fires and flooding
 * cost nothing but time; crawlers, systems and armour take scrap.
 */

export type TeamKind = 'fire' | 'flood' | 'crawler' | 'toroid' | 'system' | 'zone' | 'gun';

export interface RepairTeam {
  id: number;
  kind: TeamKind;
  /** Compartment index, crawler index, subsystem key or armour zone. */
  key: string;
  n: number;
  /** How many of them came from the reserve (they go back there). */
  reserve: number;
  phase: 'going' | 'working' | 'back';
  /** Seconds of walking left in this phase, and the whole walk. */
  t: number;
  walk: number;
  /** How far along the job is, 0-1 (for the screens). */
  done: number;
  /** Where the job is, for the interior view: deck (0 roof .. 7) and section (0 bow, 1 midships, 2 stern). */
  deck: number;
  sec: number;
  /** Health (or fire / water) when they started. */
  start: number;
}

export const TEAM_SIZE = 6;
/** Where people bunk (Residential): every walk starts there. */
const HOME_DECK = 3;
/** Fire and water knocked back, and repair done, per second by a full team. */
const RATE: Record<TeamKind, number> = { fire: 0.1, flood: 0.07, crawler: 0.025, toroid: 0.022, system: 0.02, zone: 0.015, gun: 0.035 };
/** Scrap per whole point repaired. */
const SCRAP: Record<TeamKind, number> = { fire: 0, flood: 0, crawler: 20, toroid: 25, system: 20, zone: 30, gun: 18 };
let nextTeam = 1;

/** Reserve places: every Barracks keeps 16 people per level in reserve. */
export function reserveCap(g: Game): number {
  let n = 0;
  for (const m of g.player.modules) if (m.built && m.key === 'barracks') n += 16 * m.lvl;
  return n;
}

export function maxTeams(g: Game): number {
  let b = 0;
  for (const m of g.player.modules) if (m.built && m.key === 'barracks') b += m.lvl;
  return Math.min(8, 3 + b);
}

/** Share of the crew damage control may pull off their posts for repair teams. */
export const DRAFT_SHARE = 0.35;

/** People who could make up a team right now: the reserve, the off-watch crew, or failing that hands off posts. */
export function teamPool(g: Game): number {
  const p = g.player;
  const offWatch = Math.max(0, p.troops - p.detached - p.stats.crewManned);
  const onTeams = g.teams.reduce((a, t) => a + t.n - t.reserve, 0) + g.orders.reduce((a, o) => a + (o.phase === 'done' ? 0 : o.n - o.reserve), 0);
  const draft = Math.max(0, Math.min(p.troops - p.detached, Math.floor(p.troops * DRAFT_SHARE) - onTeams));
  return g.reserves + Math.max(offWatch, draft);
}

/** Where a job is aboard: deck (0 roof) and section. */
export function jobPlace(kind: TeamKind, key: string): { deck: number; sec: number } {
  switch (kind) {
    case 'fire':
    case 'flood': {
      const i = Number(key);
      return { deck: Math.floor(i / 3) + 1, sec: i % 3 };
    }
    case 'crawler': {
      const i = Number(key);
      return { deck: 7, sec: Math.min(2, Math.floor(((i % 4) * 3) / 4)) };
    }
    case 'toroid':
      return { deck: 6, sec: TOROIDS[Number(key)]?.fore ? 0 : 2 };
    case 'system': {
      const s = SYSTEMS.find((k) => k.key === key);
      return { deck: s?.deck ?? 4, sec: s?.section ?? 1 };
    }
    case 'zone':
      return { deck: key === 'roof' ? 0 : 4, sec: key === 'bow' ? 0 : key === 'stern' ? 2 : 1 };
    case 'gun':
      return { deck: 0, sec: 1 };
  }
}

/** A gun module by id (for gun repair jobs). */
const gunMod = (g: Game, key: string): ModuleInst | undefined => g.player.modules.find((m) => m.id === Number(key));

export function jobName(kind: TeamKind, key: string, g?: Game): string {
  switch (kind) {
    case 'fire':
      return `Fire, ${compName(Number(key))}`;
    case 'flood':
      return `Flooding, ${compName(Number(key))}`;
    case 'crawler': {
      const i = Number(key);
      return `Crawler ${i < 4 ? 'L' : 'R'}${(i % 4) + 1}`;
    }
    case 'toroid':
      return TOROIDS[Number(key)]?.name ?? key;
    case 'system':
      return SYSTEMS.find((k) => k.key === key)?.name ?? key;
    case 'zone':
      return `${ZONES.find((z) => z.key === key)?.name ?? key} armour`;
    case 'gun': {
      const m = g ? gunMod(g, key) : undefined;
      return m?.weapon ? `${WEAPONS[m.weapon.key]?.name ?? 'Gun'} (roof)` : 'Roof gun';
    }
  }
}

/** The state of the thing a team works on: fire or water level (0 = done), or health (1 = done). */
function level(g: Game, kind: TeamKind, key: string): number {
  const s = g.titan;
  switch (kind) {
    case 'fire':
      return s.fire[Number(key)] ?? 0;
    case 'flood':
      return s.flood[Number(key)] ?? 0;
    case 'crawler':
      return s.crawlers[Number(key)] ?? 1;
    case 'toroid':
      return s.toroids[Number(key)] ?? 1;
    case 'system':
      return s.systems[key as SysKey] ?? 1;
    case 'zone':
      return s.zones[key as ArmorZone] ?? 1;
    case 'gun':
      return 1 - (gunMod(g, key)?.wreck ?? 0);
  }
}

function setLevel(g: Game, kind: TeamKind, key: string, v: number): void {
  const s = g.titan;
  switch (kind) {
    case 'fire':
      s.fire[Number(key)] = v;
      break;
    case 'flood':
      s.flood[Number(key)] = v;
      break;
    case 'crawler':
      s.crawlers[Number(key)] = v;
      break;
    case 'toroid':
      s.toroids[Number(key)] = v;
      break;
    case 'system':
      s.systems[key as SysKey] = v;
      break;
    case 'zone':
      s.zones[key as ArmorZone] = v;
      break;
    case 'gun': {
      const m = gunMod(g, key);
      if (m) m.wreck = Math.max(0, 1 - v);
      break;
    }
  }
}

const harmful = (kind: TeamKind): boolean => kind === 'fire' || kind === 'flood';

/** Is there anything for a team to do there? */
export function needsTeam(g: Game, kind: TeamKind, key: string): boolean {
  const v = level(g, kind, key);
  return harmful(kind) ? v > (kind === 'flood' ? 0.02 : 0) : v < 0.97;
}

export function teamOn(g: Game, kind: TeamKind, key: string): RepairTeam | undefined {
  return g.teams.find((t) => t.kind === kind && t.key === key);
}

/** Sends a repair team. Returns why not, or null when they're on their way. */
export function dispatchTeam(g: Game, kind: TeamKind, key: string): string | null {
  const p = g.player;
  if (!p.titan || p.dead) return 'No Titan to repair.';
  if (teamOn(g, kind, key)) return 'A team is already on it.';
  if (!needsTeam(g, kind, key)) return 'Nothing to fix there.';
  if (g.teams.filter((t) => t.phase !== 'back').length >= maxTeams(g)) return `All ${maxTeams(g)} teams are out (a Barracks level adds one). The job is queued.`;
  if (SCRAP[kind] > 0 && p.cargo.count('scrap') <= 0) return 'No scrap for repairs.';
  const pool = teamPool(g);
  if (pool < 2) return 'Nobody left to send: a third of the crew is already out on teams. Build Barracks for a reserve.';
  const n = Math.min(TEAM_SIZE, pool);
  const fromRes = Math.min(n, g.reserves);
  g.reserves -= fromRes;
  p.detached += n - fromRes;
  if (n - fromRes > 0) p.recalc();
  const { deck, sec } = jobPlace(kind, key);
  const walk = 5 + Math.abs(deck - HOME_DECK) * 1.5 + Math.abs(sec - 1) * 1.5;
  g.teams.push({ id: nextTeam++, kind, key, n, reserve: fromRes, phase: 'going', t: walk, walk, done: 0, deck, sec, start: level(g, kind, key) });
  g.hooks.sound('ui');
  return null;
}

/** Every open problem, worst first. */
export function openJobs(g: Game): { kind: TeamKind; key: string; sev: number }[] {
  const s = g.titan;
  const out: { kind: TeamKind; key: string; sev: number }[] = [];
  for (let i = 0; i < COMPARTMENTS; i++) {
    if (s.fire[i] > 0) out.push({ kind: 'fire', key: String(i), sev: 3 + s.fire[i] });
    if (s.flood[i] > 0.02) out.push({ kind: 'flood', key: String(i), sev: 2 + s.flood[i] });
  }
  s.crawlers.forEach((v, i) => v < 0.97 && out.push({ kind: 'crawler', key: String(i), sev: v <= 0.1 ? 2.5 : 1 - v }));
  s.toroids.forEach((v, i) => v < 0.97 && out.push({ kind: 'toroid', key: String(i), sev: v <= 0.1 ? 2.4 : (1 - v) * 1.4 }));
  for (const k of SYSTEMS) if (s.systems[k.key] < 0.97) out.push({ kind: 'system', key: k.key, sev: (1 - s.systems[k.key]) * 1.6 });
  for (const z of ZONES) if (s.zones[z.key] < 0.97) out.push({ kind: 'zone', key: z.key, sev: (1 - s.zones[z.key]) * 1.2 });
  for (const m of g.player.modules) if ((m.wreck ?? 0) > 0.03) out.push({ kind: 'gun', key: String(m.id), sev: (m.wreck ?? 0) >= 1 ? 2.2 : (m.wreck ?? 0) * 1.5 });
  return out.sort((a, b) => b.sev - a.sev);
}

/** STABILIZE: teams to the worst problems until there are no more teams (or people). Returns how many went. */
export function stabilize(g: Game): number {
  let n = 0;
  for (const j of openJobs(g)) {
    if (teamOn(g, j.kind, j.key)) continue;
    if (dispatchTeam(g, j.kind, j.key)) {
      if (g.teams.filter((t) => t.phase !== 'back').length >= maxTeams(g) || teamPool(g) < 2) break;
      continue;
    }
    n++;
  }
  return n;
}

/** Scrap below which AUTO leaves repairs that cost scrap alone (fires and flooding still get teams). */
const AUTO_SCRAP = 10;

/**
 * AUTO damage control: every couple of seconds the worst open job without a team gets the next free one. Returns
 * the job sent to, if any.
 */
export function autoDispatch(g: Game, dt: number): string | null {
  const p = g.player;
  if (!g.autoRepair || !p.titan || p.dead) return null;
  g.autoT -= dt;
  if (g.autoT > 0) return null;
  g.autoT = 2;
  if (g.teams.filter((t) => t.phase !== 'back').length >= maxTeams(g) || teamPool(g) < 2) return null;
  for (const j of openJobs(g)) {
    if (teamOn(g, j.kind, j.key)) continue;
    if (SCRAP[j.kind] > 0 && p.cargo.count('scrap') < AUTO_SCRAP) continue;
    // Scuffed armour (above 85%) isn't worth a team while there's worse.
    if (j.kind === 'zone' && (g.titan.zones[j.key as ArmorZone] ?? 1) > 0.85) continue;
    if (!dispatchTeam(g, j.kind, j.key)) {
      const name = jobName(j.kind, j.key, g);
      g.hooks.toast(`Damage control: team sent to ${name}.`, '#b2ff59');
      return name;
    }
  }
  return null;
}

/** Why a job has no team yet (for the job queue). */
export function whyWaiting(g: Game, kind: TeamKind): string {
  if (g.teams.filter((t) => t.phase !== 'back').length >= maxTeams(g)) return 'all teams out';
  if (teamPool(g) < 2) return 'no hands free';
  if (SCRAP[kind] > 0 && g.player.cargo.count('scrap') < (g.autoRepair ? AUTO_SCRAP : 1)) return 'needs scrap';
  return g.autoRepair ? 'next up' : 'waiting for orders';
}

export function updateTeams(g: Game, dt: number): void {
  const p = g.player;
  autoDispatch(g, dt);
  if (!g.teams.length) return;
  if (p.dead || !p.titan) {
    for (const t of g.teams) home(g, t);
    g.teams.length = 0;
    return;
  }
  const eff = Math.max(0.3, p.efficiency);
  for (const t of g.teams) {
    if (t.phase === 'going') {
      t.t -= dt;
      if (t.t <= 0) t.phase = 'working';
      continue;
    }
    if (t.phase === 'back') {
      t.t -= dt;
      continue;
    }
    const v = level(g, t.kind, t.key);
    // Builder robots lend a hand to every team.
    const rate = RATE[t.kind] * (t.n / TEAM_SIZE) * eff * (1 + g.robots * ROBOT_REPAIR) * dt;
    if (harmful(t.kind)) {
      const nv = Math.max(0, v - rate);
      setLevel(g, t.kind, t.key, nv);
      t.done = t.start > 0 ? 1 - nv / t.start : 1;
      if (nv <= (t.kind === 'flood' ? 0.01 : 0)) {
        setLevel(g, t.kind, t.key, 0);
        finish(g, t, t.kind === 'fire' ? `Fire out: ${compName(Number(t.key))}. Team heading back.` : `Pumped dry: ${compName(Number(t.key))}.`);
      }
    } else {
      const fix = Math.min(rate, 1 - v);
      const scrap = fix * SCRAP[t.kind];
      g.titan.owed += scrap;
      while (g.titan.owed >= 1 && p.cargo.count('scrap') > 0) {
        p.cargo.take('scrap', 1);
        g.titan.owed -= 1;
      }
      if (g.titan.owed >= 1) {
        finish(g, t, `${jobName(t.kind, t.key, g)}: out of scrap, the team is coming back.`);
        continue;
      }
      setLevel(g, t.kind, t.key, v + fix);
      t.done = t.start < 1 ? (v + fix - t.start) / (1 - t.start) : 1;
      if (v + fix >= 0.999) {
        setLevel(g, t.kind, t.key, 1);
        finish(g, t, `${jobName(t.kind, t.key, g)} repaired.`);
      }
    }
  }
  const gone = g.teams.filter((t) => t.phase === 'back' && t.t <= 0);
  if (gone.length) {
    for (const t of gone) home(g, t);
    g.teams = g.teams.filter((t) => !(t.phase === 'back' && t.t <= 0));
  }
}

function finish(g: Game, t: RepairTeam, msg: string): void {
  t.phase = 'back';
  t.t = t.walk;
  t.done = 1;
  g.hooks.toast(msg, '#b2ff59');
}

/** The team is back: reservists to the Barracks, the rest to their posts. */
function home(g: Game, t: RepairTeam): void {
  const p = g.player;
  g.reserves = Math.min(reserveCap(g), g.reserves + t.reserve);
  const crew = t.n - t.reserve;
  if (crew > 0) {
    p.detached = Math.max(0, p.detached - crew);
    p.recalc();
  }
}

/* ---------------------------------------------------------------------- */
/* The reserve                                                             */
/* ---------------------------------------------------------------------- */

/** Reservists step up to empty bunks at once; the reserve itself fills (slower) once every bunk is taken. */
export function updateReserve(g: Game): void {
  const p = g.player;
  const cap = reserveCap(g);
  if (g.reserves > cap) g.reserves = cap;
  const room = p.stats.bunks - p.troops;
  if (room > 0 && g.reserves > 0) {
    const k = Math.min(room, g.reserves);
    g.reserves -= k;
    p.troops += k;
    p.recalc();
  }
}

/** How the crew stand, for the screens. */
export function crewSummary(g: Game): { aboard: number; bunks: number; onDuty: number; posts: number; offWatch: number; reserves: number; reserveCap: number; away: number } {
  const p = g.player;
  const away = g.teams.reduce((a, t) => a + t.n, 0);
  return {
    aboard: p.troops, bunks: p.stats.bunks, onDuty: Math.min(p.troops - p.detached, p.stats.crewManned), posts: p.stats.crewWanted,
    offWatch: Math.max(0, p.troops - p.detached - p.stats.crewManned), reserves: g.reserves, reserveCap: reserveCap(g), away,
  };
}

/** A Barracks in the hull? (The reserve needs one.) */
export const hasBarracks = (g: Game): boolean => g.player.modules.some((m) => m.built && MODULES[m.key].key === 'barracks');
