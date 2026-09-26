import { MAP_SIZE } from '../shared/constants';
import type { RuneKind } from '../shared/mapgen';
import { sanitizeTree, WEAPONS, type WeaponItem } from '../shared/weapons';
import { normalizeCrew, type CrewMember } from './crew';
import { Game, type ForgeJob, type GameStats, type ResearchJob } from './game';
import { freeTech, TECH_BY_ID } from './tech';
import { Tank, type TankSave } from './tank';
import { bumpUid, peekUid } from './templates';
import { applyOutriderCrew, launchOutrider } from './systems/outrider';

export const SAVE_KEY = 'ironcrawl3d-save-v1';

export interface SaveData {
  v: 3 | 4;
  seed: number;
  time: number;
  tank: TankSave;
  crew: CrewMember[];
  recruits: CrewMember[];
  armory: WeaponItem[];
  tech: string[];
  stats: GameStats;
  explored: string;
  nodes: [number, number, number][];
  sites: [number, number][];
  runes: [number, number][];
  outpostsDown: number[];
  outriderLevel: number;
  outrider: TankSave | null;
  objective: number;
  counters: Record<string, number>;
  autoFire: boolean;
  runeBuff: { rune: RuneKind; t: number } | null;
  nextUid: number;
  savedAt: number;
  /* v4 */
  research?: { military: ResearchJob | null; personnel: ResearchJob | null };
  forgeJob?: ForgeJob | null;
  /** Deck-module indexes (not ids) bound to keys 1-4, -1 = empty. */
  activeSlots?: number[];
  ultModule?: number;
  ultCharge?: number;
  tankControls?: boolean;
}

function packBits(a: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(a.length / 8));
  for (let i = 0; i < a.length; i++) if (a[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function unpackBits(s: string, out: Uint8Array): void {
  try {
    const bin = atob(s);
    for (let i = 0; i < out.length; i++) out[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
  } catch {
    /* ignore corrupt fog */
  }
}

export function serialize(g: Game): SaveData {
  const idx = (id: number): number => (id ? g.player.modules.findIndex((m) => m.id === id) : -1);
  return {
    v: 4, research: g.research, forgeJob: g.forgeJob, activeSlots: g.activeSlots.map(idx), ultModule: idx(g.ultModule), ultCharge: g.ultCharge,
    tankControls: g.tankControls, seed: g.seed, time: g.time, tank: g.player.serialize(), crew: g.crew, recruits: g.recruits, armory: g.armory,
    tech: [...g.tech], stats: g.stats, explored: packBits(g.explored),
    nodes: g.gen.nodes.filter((n) => n.respawnAt > 0 || n.amount < n.max).map((n) => [n.id, n.amount, n.respawnAt]),
    sites: g.gen.sites.filter((s) => s.readyAt > g.time).map((s) => [s.id, s.readyAt]),
    runes: g.gen.runes.filter((r) => r.readyAt > g.time).map((r) => [r.id, r.readyAt]),
    outpostsDown: [...g.outpostsDown], outriderLevel: g.outriderLevel, outrider: g.outrider && !g.outrider.dead ? g.outrider.serialize() : null,
    objective: g.objective, counters: g.objectiveCounters, autoFire: g.autoFire, runeBuff: g.runeBuff, nextUid: peekUid(), savedAt: Date.now(),
  };
}

export function deserialize(d: SaveData): Game {
  const g = new Game(d.seed);
  g.time = d.time;
  g.tech = new Set([...freeTech(), ...d.tech.filter((t) => TECH_BY_ID.has(t))]);
  // Saves from before the officer-seat research keep all six seats.
  if (d.v === 3) {
    g.tech.add('officer_school');
    g.tech.add('chain_of_command');
  }
  g.player = Tank.deserialize(d.tank, 'player', 'main', 'Fortress');
  g.crew = d.crew.map((c) => normalizeCrew(c));
  g.recruits = (d.recruits ?? []).map((c) => normalizeCrew(c));
  g.armory = (d.armory ?? []).filter((w) => WEAPONS[w.key]);
  for (const w of [...g.armory, ...g.player.modules.map((m) => m.weapon).filter((w): w is WeaponItem => !!w)]) {
    w.rarity = Math.max(0, Math.min(5, Math.round(w.rarity))) as WeaponItem['rarity'];
    sanitizeTree(w);
  }
  const at = (i: number | undefined): number => (i !== undefined && i >= 0 ? g.player.modules[i]?.id ?? 0 : 0);
  if (d.activeSlots) g.activeSlots = g.activeSlots.map((_, k) => at(d.activeSlots![k]));
  g.ultModule = at(d.ultModule);
  g.ultCharge = Math.max(0, Math.min(1, d.ultCharge ?? 0));
  g.tankControls = !!d.tankControls;
  const job = (j: ResearchJob | null | undefined): ResearchJob | null => (j && TECH_BY_ID.has(j.id) && !g.tech.has(j.id) ? j : null);
  g.research = { military: job(d.research?.military), personnel: job(d.research?.personnel) };
  g.forgeJob = d.forgeJob ?? null;
  bumpUid(Math.max(d.nextUid ?? 1, ...g.armory.map((w) => w.uid), ...g.player.modules.map((m) => m.weapon?.uid ?? 0)));
  g.stats = { ...g.stats, ...d.stats };
  unpackBits(d.explored, g.explored);
  const nodes = new Map(g.gen.nodes.map((n) => [n.id, n]));
  for (const [id, amt, re] of d.nodes ?? []) {
    const n = nodes.get(id);
    if (n) {
      n.amount = amt;
      n.respawnAt = re;
    }
  }
  for (const [id, t] of d.sites ?? []) {
    const s = g.gen.sites.find((k) => k.id === id);
    if (s) s.readyAt = t;
  }
  for (const [id, t] of d.runes ?? []) {
    const r = g.gen.runes.find((k) => k.id === id);
    if (r) r.readyAt = t;
  }
  g.outpostsDown = new Set(d.outpostsDown ?? []);
  g.outriderLevel = d.outriderLevel ?? 0;
  // The v4 objective list added new steps: map old progress onto it.
  const V3_OBJECTIVES = [1, 2, 3, 5, 7, 6, 9, 11, 12, 4, 8, 14, 16, 17];
  g.objective = d.v === 3 ? V3_OBJECTIVES[Math.min(V3_OBJECTIVES.length - 1, d.objective ?? 0)] : d.objective ?? 0;
  g.objectiveCounters = d.counters ?? {};
  g.autoFire = d.autoFire ?? true;
  g.runeBuff = d.runeBuff ?? null;
  g.applyCrew();
  g.player.hp = Math.min(g.player.stats.maxHp, d.tank.hp);
  if (g.outriderLevel > 0 && d.outrider) {
    launchOutrider(g);
    if (g.outrider) {
      g.outrider.x = d.outrider.x;
      g.outrider.y = d.outrider.y;
      g.outrider.hp = Math.min(g.outrider.stats.maxHp, d.outrider.hp);
      for (const s of d.outrider.cargo) if (s) g.outrider.cargo.add(s.id, s.n);
      applyOutriderCrew(g);
    }
  }
  if (g.explored.length !== MAP_SIZE * MAP_SIZE) g.explored = new Uint8Array(MAP_SIZE * MAP_SIZE);
  return g;
}

export function saveGame(g: Game): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(g)));
    return true;
  } catch {
    return false;
  }
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return d && (d.v === 3 || d.v === 4) ? d : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
