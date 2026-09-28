import { MODULES } from '../defs';
import type { Game } from '../game';
import { COMPARTMENTS, compName, SYSTEMS, ZONES, type ArmorZone, type SysKey } from './titan';

/**
 * Crew operations: the reserve in the Barracks, and repair teams you send from the vitals screen.
 *
 * A team is six people. They come out of the reserve first; without one they're pulled off the watch (the posts
 * they leave run short until they're back). They walk to the trouble (lifts and the Spine: longer to the bottom
 * decks and the roof), fix it far faster than the damage-control rota does, and walk home. Fires and flooding
 * cost nothing but time; crawlers, systems and armour take scrap.
 */

export type TeamKind = 'fire' | 'flood' | 'crawler' | 'system' | 'zone';

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
const RATE: Record<TeamKind, number> = { fire: 0.1, flood: 0.07, crawler: 0.025, system: 0.02, zone: 0.015 };
/** Scrap per whole point repaired. */
const SCRAP: Record<TeamKind, number> = { fire: 0, flood: 0, crawler: 20, system: 20, zone: 30 };
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
  return Math.min(6, 2 + b);
}

/** People who could make up a team right now: the reserve, and the off-watch crew. */
export function teamPool(g: Game): number {
  const p = g.player;
  const offWatch = Math.max(0, p.troops - p.detached - p.stats.crewManned);
  return g.reserves + offWatch;
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
    case 'system': {
      const s = SYSTEMS.find((k) => k.key === key);
      return { deck: s?.deck ?? 4, sec: s?.section ?? 1 };
    }
    case 'zone':
      return { deck: key === 'roof' ? 0 : 4, sec: key === 'bow' ? 0 : key === 'stern' ? 2 : 1 };
  }
}

export function jobName(kind: TeamKind, key: string): string {
  switch (kind) {
    case 'fire':
      return `Fire, ${compName(Number(key))}`;
    case 'flood':
      return `Flooding, ${compName(Number(key))}`;
    case 'crawler': {
      const i = Number(key);
      return `Crawler ${i < 4 ? 'L' : 'R'}${(i % 4) + 1}`;
    }
    case 'system':
      return SYSTEMS.find((k) => k.key === key)?.name ?? key;
    case 'zone':
      return `${ZONES.find((z) => z.key === key)?.name ?? key} armour`;
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
    case 'system':
      return s.systems[key as SysKey] ?? 1;
    case 'zone':
      return s.zones[key as ArmorZone] ?? 1;
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
    case 'system':
      s.systems[key as SysKey] = v;
      break;
    case 'zone':
      s.zones[key as ArmorZone] = v;
      break;
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
  if (g.teams.filter((t) => t.phase !== 'back').length >= maxTeams(g)) return `All ${maxTeams(g)} teams are out (a Barracks level adds one).`;
  if (SCRAP[kind] > 0 && p.cargo.count('scrap') <= 0) return 'No scrap for repairs.';
  const pool = teamPool(g);
  if (pool < 2) return 'Nobody free: every hand is on a post. Build Barracks for a reserve, or Living Quarters.';
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
  for (const k of SYSTEMS) if (s.systems[k.key] < 0.97) out.push({ kind: 'system', key: k.key, sev: (1 - s.systems[k.key]) * 1.6 });
  for (const z of ZONES) if (s.zones[z.key] < 0.97) out.push({ kind: 'zone', key: z.key, sev: (1 - s.zones[z.key]) * 1.2 });
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

export function updateTeams(g: Game, dt: number): void {
  const p = g.player;
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
    const rate = RATE[t.kind] * (t.n / TEAM_SIZE) * eff * dt;
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
        finish(g, t, `${jobName(t.kind, t.key)}: out of scrap, the team is coming back.`);
        continue;
      }
      setLevel(g, t.kind, t.key, v + fix);
      t.done = t.start < 1 ? (v + fix - t.start) / (1 - t.start) : 1;
      if (v + fix >= 0.999) {
        setLevel(g, t.kind, t.key, 1);
        finish(g, t, `${jobName(t.kind, t.key)} repaired.`);
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
