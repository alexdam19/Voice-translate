import type { CrewMember, CrewRole, StationKey } from './crew';
import type { Game } from './game';

/**
 * The Titan's stations: the jobs your named officers do. Put someone on a station and the system it runs gets
 * better, by how good that person is at it: the right trade counts most, then experience and rarity (a champion
 * is better still). Officers on a station get tired and hungry; off it they sleep and eat. A tired or hungry
 * officer does the job worse. Rotate them (or let the ship rotate them for you) to keep every station sharp.
 */

export interface StationDef {
  key: StationKey;
  name: string;
  icon: string;
  /** Who's best at it (first) and who's decent. */
  roles: CrewRole[];
  desc: string;
  /** What a skill of 1 does (for the UI). */
  effect: string;
  color: string;
}

export const STATIONS: StationDef[] = [
  { key: 'helm', name: 'Helm', icon: '🧭', roles: ['driver', 'quartermaster'], color: '#00e5ff', desc: 'Drives and steers the Titan.', effect: '+12% turning, +5% speed' },
  { key: 'gunnery', name: 'Gunnery Control', icon: '🎯', roles: ['gunner', 'marine'], color: '#ff9100', desc: 'Directs every gun on the roof.', effect: '+10% weapon damage' },
  { key: 'engines', name: 'Engine Room', icon: '⚙', roles: ['engineer', 'mechanic'], color: '#ffd740', desc: 'Runs the diesels and the reactors.', effect: '-20% fuel burn, +8% power' },
  { key: 'damage', name: 'Damage Control', icon: '🧯', roles: ['mechanic', 'engineer'], color: '#ff5252', desc: 'Fights fires and patches the hull.', effect: '+50% firefighting and repairs' },
  { key: 'sensors', name: 'Sensors', icon: '📡', roles: ['scientist', 'scavenger'], color: '#b388ff', desc: 'Radar, lookouts and the long view.', effect: '+15% sight range' },
  { key: 'medical', name: 'Medical Bay', icon: '✚', roles: ['medic', 'scientist'], color: '#76ff03', desc: 'Treats the injured and the exhausted.', effect: 'Injured recover 60% faster; officers rest 30% faster' },
  { key: 'galley', name: 'Galley', icon: '🍲', roles: ['quartermaster', 'medic'], color: '#ffcc80', desc: 'Feeds everyone aboard.', effect: '-20% rations eaten; officers eat 50% faster' },
  { key: 'logistics', name: 'Logistics', icon: '📦', roles: ['scavenger', 'quartermaster'], color: '#bcaaa4', desc: 'Drills, haulers and the salvage crews.', effect: '+15% harvesting, +8% loot' },
];

export const STATION: Record<StationKey, StationDef> = Object.fromEntries(STATIONS.map((s) => [s.key, s])) as Record<StationKey, StationDef>;

/** How good someone is at a station when fresh (0.35 for the wrong trade .. about 2 for a veteran champion in the right one). */
export function stationSkill(c: CrewMember, s: StationKey): number {
  const d = STATION[s];
  const fit = d.roles[0] === c.role ? 1 : d.roles.includes(c.role) ? 0.7 : 0.35;
  return fit * (1 + 0.08 * (c.level - 1)) * (1 + 0.12 * c.rarity) * (c.champion ? 1.25 : 1);
}

/** How well they're doing it right now (tired and hungry officers do it worse). */
export function stationOutput(c: CrewMember, s: StationKey): number {
  return stationSkill(c, s) * (1 - 0.6 * c.fatigue) * (1 - 0.5 * c.hunger);
}

export function bestStation(c: CrewMember): StationKey {
  let best: StationKey = 'helm', v = -1;
  for (const s of STATIONS) {
    const k = stationSkill(c, s.key);
    if (k > v) {
      v = k;
      best = s.key;
    }
  }
  return best;
}

/** One line on what someone brings to a station ("Helm: +14% turning, +6% speed"). */
export function stationLine(c: CrewMember, s: StationKey): string {
  const k = stationSkill(c, s);
  const pct = (v: number): string => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  switch (s) {
    case 'helm': return `${pct(0.12 * k)} turning, ${pct(0.05 * k)} speed`;
    case 'gunnery': return `${pct(0.1 * k)} weapon damage`;
    case 'engines': return `${pct(-0.2 * Math.min(1.5, k))} fuel burn, ${pct(0.08 * k)} power`;
    case 'damage': return `${pct(0.5 * k)} firefighting and repairs`;
    case 'sensors': return `${pct(0.15 * k)} sight range`;
    case 'medical': return `injured recover ${pct(0.6 * k)} faster`;
    case 'galley': return `${pct(-0.2 * Math.min(1.5, k))} rations eaten`;
    case 'logistics': return `${pct(0.15 * k)} harvesting, ${pct(0.08 * k)} loot`;
  }
}

/** What the stations add up to right now (all 1 with nobody on them). */
export interface StationMods {
  turn: number;
  speed: number;
  dmg: number;
  fuel: number;
  power: number;
  damage: number;
  vision: number;
  heal: number;
  rest: number;
  rations: number;
  eat: number;
  harvest: number;
  loot: number;
}

export const noStationMods = (): StationMods => ({ turn: 1, speed: 1, dmg: 1, fuel: 1, power: 1, damage: 1, vision: 1, heal: 1, rest: 1, rations: 1, eat: 1, harvest: 1, loot: 1 });

/** Officers aboard who can take a station (not away, not injured). */
export function onboard(g: Game): CrewMember[] {
  return g.crew.filter((c) => c.loc === 'main');
}

export function whoIsOn(g: Game, s: StationKey): CrewMember | undefined {
  return onboard(g).find((c) => c.station === s);
}

export function stationMods(g: Game): StationMods {
  const m = noStationMods();
  for (const c of onboard(g)) {
    if (!c.station || c.injured > 0) continue;
    const k = stationOutput(c, c.station);
    switch (c.station) {
      case 'helm':
        m.turn += 0.12 * k;
        m.speed += 0.05 * k;
        break;
      case 'gunnery':
        m.dmg += 0.1 * k;
        break;
      case 'engines':
        m.fuel *= 1 - 0.2 * Math.min(1.5, k);
        m.power += 0.08 * k;
        break;
      case 'damage':
        m.damage += 0.5 * k;
        break;
      case 'sensors':
        m.vision += 0.15 * k;
        break;
      case 'medical':
        m.heal += 0.6 * k;
        m.rest += 0.3 * k;
        break;
      case 'galley':
        m.rations *= 1 - 0.2 * Math.min(1.5, k);
        m.eat += 0.5 * k;
        break;
      case 'logistics':
        m.harvest += 0.15 * k;
        m.loot += 0.08 * k;
        break;
    }
  }
  return m;
}

/** Put someone on a station (or take them off with null). Whoever was there swaps to their old station. */
export function assignStation(g: Game, crewId: number, s: StationKey | null): string | null {
  const c = g.crew.find((k) => k.id === crewId);
  if (!c) return 'No such officer.';
  if (c.loc !== 'main') return `${c.name} isn't aboard.`;
  if (s && c.injured > 0) return `${c.name} is injured: the medics have them.`;
  const was = c.station;
  if (s) {
    const other = whoIsOn(g, s);
    if (other && other !== c) other.station = was;
  }
  c.station = s;
  g.statMods = stationMods(g);
  return null;
}

/** Everyone with no station goes to their best free one (a new crew, or after a rotation). */
export function autoAssign(g: Game): void {
  const free = new Set(STATIONS.map((s) => s.key).filter((k) => !whoIsOn(g, k)));
  const idle = onboard(g).filter((c) => !c.station && c.injured <= 0 && c.fatigue < 0.35 && c.hunger < 0.35);
  // Best matches first.
  const pairs: [CrewMember, StationKey, number][] = [];
  for (const c of idle) for (const k of free) pairs.push([c, k, stationSkill(c, k)]);
  pairs.sort((a, b) => b[2] - a[2]);
  const used = new Set<number>();
  for (const [c, k] of pairs) {
    if (used.has(c.id) || !free.has(k)) continue;
    c.station = k;
    used.add(c.id);
    free.delete(k);
  }
  g.statMods = stationMods(g);
}

/**
 * Change of shift: whoever is tired or hungry leaves their station to sleep and eat, and the best rested officer
 * takes it over. Returns how many changed over.
 */
export function rotateShifts(g: Game, threshold = 0.4): number {
  let n = 0;
  for (const c of onboard(g)) {
    if (!c.station) continue;
    if (c.fatigue > threshold || c.hunger > threshold || c.injured > 0) {
      const s = c.station;
      c.station = null;
      const fresh = onboard(g)
        .filter((k) => !k.station && k !== c && k.injured <= 0 && k.fatigue < 0.35 && k.hunger < 0.35)
        .sort((a, b) => stationOutput(b, s) - stationOutput(a, s))[0];
      if (fresh) fresh.station = s;
      n++;
    }
  }
  g.statMods = stationMods(g);
  return n;
}

/** Officers on a station tire and get hungry; off it they sleep and eat (rations permitting). */
export function updateStations(g: Game, dt: number): void {
  if (g.mode !== 'world') return;
  const m = g.statMods;
  const food = g.player.cargo.count('rations') > 0;
  let ate = 0;
  for (const c of onboard(g)) {
    if (c.station && c.injured > 0) c.station = null;
    if (c.station) {
      c.fatigue = Math.min(1, c.fatigue + dt / 900);
      c.hunger = Math.min(1, c.hunger + dt / 1300);
    } else {
      c.fatigue = Math.max(0, c.fatigue - (dt / 300) * m.rest);
      if (food && c.hunger > 0) {
        const d = Math.min(c.hunger, (dt / 150) * m.eat);
        c.hunger -= d;
        ate += d;
      } else c.hunger = Math.min(1, c.hunger + dt / 2400);
    }
  }
  // A full meal (hunger 1 -> 0) is two rations.
  g.officerMeals += ate * 2;
  while (g.officerMeals >= 1 && g.player.cargo.count('rations') > 0) {
    g.player.cargo.take('rations', 1);
    g.officerMeals -= 1;
  }
  g.stationT -= dt;
  if (g.stationT <= 0) {
    g.stationT = 5;
    if (g.autoRotate) {
      const n = rotateShifts(g, 0.7);
      if (n) g.hooks.toast(`Change of shift: ${n} officer${n > 1 ? 's' : ''} went to sleep and eat; rested ones took over.`, '#80d8ff');
      autoAssign(g);
    }
    g.statMods = stationMods(g);
  }
}

