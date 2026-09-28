import { stationMods } from './stations';
import { TRACTION } from '../shared/map';
import type { DriveKey } from '../shared/types';
import type { OpenWorld, RuneKind } from '../shared/mapgen';
import { sanitizeTree, WEAPONS, type WeaponItem } from '../shared/weapons';
import { CARDS, deckSlots, MAX_CARD_LEVEL, PACK_INFO, STARTER_DECK, type OwnedCard, type PackKind } from './cards';
import { normalizeCrew, type CrewMember } from './crew';
import { CC_CHASSIS, CC_COMMANDER_LEVEL, chassisForCC, MODULES } from './defs';
import { Game, type BuildJob, type ForgeJob, type GameStats, type Track } from './game';
import { MAX_COMMANDER_LEVEL, techsForLevel } from './progress';
import { SQUADS, type SquadOrder, type SquadType } from './squads';
import { TECH_BY_ID } from './tech';
import { Tank, type TankSave } from './tank';
import { bumpUid, peekUid } from './templates';
import { applyOutriderCrew, launchOutrider } from './systems/outrider';
import { newCampaign, type Campaign } from './campaign';
import { newCrewLife, type CrewLife } from './systems/crewlife';
import { loadTitanState, type TitanState } from './systems/titan';

export const SAVE_KEY = 'ironcrawl3d-save-v1';

export interface SaveData {
  v: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
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
  runeBuff: { rune: RuneKind; t: number } | null;
  nextUid: number;
  savedAt: number;
  forgeJob?: ForgeJob | null;
  tankControls?: boolean;
  /* v5 */
  commander?: { level: number; xp: number };
  cards?: Record<string, OwnedCard>;
  deck?: string[];
  relics?: string[];
  packs?: PackKind[];
  energy?: number;
  /** Build jobs, with module indexes instead of ids. */
  builds?: (Omit<BuildJob, 'modId'> & { mod: number })[];
  squads?: Partial<Record<SquadType, { order: SquadOrder; gx: number; gy: number }>>;
  tracked?: { kind: 'build'; key: string } | { kind: 'upgrade'; mod: number } | { kind: 'card'; id: string } | null;
  /* v6 */
  drives?: DriveKey[];
  autoDrive?: boolean;
  wave?: number;
  /* v7: the streamed world keeps exploration per chunk */
  fog?: [number, string][];
  campaign?: Campaign;
  life?: CrewLife;
  titan?: Partial<TitanState>;
  home?: { x: number; y: number } | null;
  /* v9: The Crater (a new 140 km world) and officer stations */
  autoRotate?: boolean;
  /* v10: a Titan's worth of crew (4x), the Barracks reserve */
  reserves?: number;
}

export function serialize(g: Game): SaveData {
  const idx = (id: number): number => g.player.modules.findIndex((m) => m.id === id);
  const squads: SaveData['squads'] = {};
  for (const [k, s] of Object.entries(g.squads)) if (s) squads[k as SquadType] = { order: s.order, gx: s.gx, gy: s.gy };
  const tr = g.tracked;
  return {
    v: 10, reserves: g.reserves, forgeJob: g.forgeJob, tankControls: g.tankControls, seed: g.seed, time: g.time, tank: g.player.serialize(), crew: g.crew, recruits: g.recruits,
    armory: g.armory, tech: [...g.tech], stats: g.stats, explored: '', fog: g.fog.serialize(),
    ...featureState(g),
    outpostsDown: [...g.outpostsDown], outriderLevel: g.outriderLevel, outrider: g.outrider && !g.outrider.dead ? g.outrider.serialize() : null,
    objective: g.objective, counters: g.objectiveCounters, runeBuff: g.runeBuff, nextUid: peekUid(), savedAt: Date.now(),
    commander: { ...g.commander }, cards: g.cards, deck: g.deck, relics: g.relics, packs: g.packs, energy: g.energy,
    builds: g.builds.map(({ modId, ...b }) => ({ ...b, mod: idx(modId) })).filter((b) => b.mod >= 0),
    squads,
    tracked: !tr ? null : tr.kind === 'upgrade' ? { kind: 'upgrade', mod: idx(tr.modId) } : tr,
    drives: [...g.drivesOwned], autoDrive: g.autoDrive, wave: g.wave.n, campaign: g.campaign, life: g.life, titan: g.titan, home: g.deploy.home,
    autoRotate: g.autoRotate,
  };
}

/**
 * Saves from before v5 had a small fortress (half-size cells) and a research tree. They come back as the
 * matching Command Center level, with every old building re-placed on the bigger deck and a commander
 * level that keeps everything they had unlocked.
 */
function migrateTank(d: SaveData): { tank: Tank; cc: number } {
  const oldIdx = ['crawler', 'assault', 'siege', 'dread', 'colossus', 'citadel'].indexOf(d.tank.chassis);
  const cc = Math.max(1, Math.min(CC_CHASSIS.length, oldIdx + 1));
  const t = new Tank('player', 'main', chassisForCC(cc).key, 'Fortress');
  t.drive = d.tank.drive;
  t.x = d.tank.x;
  t.y = d.tank.y;
  t.rot = d.tank.rot;
  // Forward on +3 Command, clear of the Spine.
  const b = t.addModule('bridge', 2, 2, null, 1) ?? t.autoAdd('bridge');
  if (b) b.lvl = cc;
  // Turrets first so they get the outer spots, then everything else.
  const mods = [...d.tank.modules].filter((m) => MODULES[m.key] && m.key !== 'bridge');
  mods.sort((a, c) => (MODULES[c.key].hardpoint ? 1 : 0) - (MODULES[a.key].hardpoint ? 1 : 0));
  for (const m of mods) {
    const inst = t.autoAdd(m.key, m.weapon && WEAPONS[m.weapon.key] ? m.weapon : null);
    if (inst) inst.lvl = Math.max(1, Math.min(cc, Math.round(m.lvl ?? 1)));
  }
  t.recalc();
  return { tank: t, cc };
}

export function deserialize(d: SaveData): Game {
  const g = new Game(d.seed);
  g.time = d.time;
  let cc = 1;
  if (d.v >= 5) {
    g.player = Tank.deserialize(d.tank, 'player', 'main', 'Fortress');
    cc = g.player.modules.find((m) => m.key === 'bridge')?.lvl ?? 1;
    // The hull always matches the Command Center.
    const want = chassisForCC(cc).key;
    if (g.player.chassis !== want) g.player.setChassis(want);
  } else {
    const m = migrateTank(d);
    g.player = m.tank;
    cc = m.cc;
  }
  const lvl = Math.max(1, Math.min(MAX_COMMANDER_LEVEL, Math.round(d.commander?.level ?? CC_COMMANDER_LEVEL[cc - 1] ?? 1)));
  g.commander = { level: lvl, xp: Math.max(0, d.commander?.xp ?? 0) };
  g.tech = new Set([...techsForLevel(lvl), ...d.tech.filter((t) => TECH_BY_ID.has(t))]);
  g.crew = d.crew.map((c) => normalizeCrew(c));
  g.recruits = (d.recruits ?? []).map((c) => normalizeCrew(c));
  g.armory = (d.armory ?? []).filter((w) => WEAPONS[w.key]);
  for (const w of [...g.armory, ...g.player.modules.map((m) => m.weapon).filter((w): w is WeaponItem => !!w)]) {
    w.rarity = Math.max(0, Math.min(5, Math.round(w.rarity))) as WeaponItem['rarity'];
    sanitizeTree(w);
  }
  // Cards.
  g.cards = {};
  for (const [id, c] of Object.entries(d.cards ?? {})) {
    if (!CARDS[id]) continue;
    g.cards[id] = { level: Math.max(1, Math.min(MAX_CARD_LEVEL, Math.round(c.level || 1))), shards: Math.max(0, Math.round(c.shards || 0)) };
  }
  for (const id of STARTER_DECK) if (!g.cards[id]) g.cards[id] = { level: 1, shards: 0 };
  const deck = (d.deck ?? STARTER_DECK).filter((id, i, a) => g.cards[id] && CARDS[id].type !== 'relic' && a.indexOf(id) === i).slice(0, deckSlots(g.commander.level, d.stats?.hordes ?? 0));
  g.deck = deck.length >= 4 ? deck : [...STARTER_DECK];
  g.relics = (d.relics ?? []).filter((id) => g.cards[id] && CARDS[id].type === 'relic').slice(0, g.relicSlots());
  g.packs = (d.packs ?? []).filter((k) => k in PACK_INFO);
  // Anyone coming from an old save gets a welcome pack for each Command Center level.
  if (d.v < 5) for (let i = 0; i < cc; i++) g.packs.push(i === 0 ? 'rare_pack' : 'pack');
  const at = (i: number): number => (i >= 0 ? g.player.modules[i]?.id ?? 0 : 0);
  g.builds = (d.builds ?? []).map(({ mod, ...b }) => ({ ...b, modId: at(mod) })).filter((b) => b.modId);
  for (const [k, s] of Object.entries(d.squads ?? {})) {
    if (!s || !(k in SQUADS)) continue;
    g.squads[k as SquadType] = { type: k as SquadType, order: s.order, gx: s.gx, gy: s.gy, target: null, phase: 'going', work: 0, carry: [], respawn: 1 };
  }
  const tr = d.tracked;
  const track: Track | null = !tr ? null : tr.kind === 'upgrade' ? (at(tr.mod) ? { kind: 'upgrade', modId: at(tr.mod) } : null) : tr;
  g.tracked = track;
  g.tankControls = (d.v ?? 0) >= 8 ? !!d.tankControls : true;
  g.drivesOwned = new Set<DriveKey>(['wheels', g.player.drive, ...(d.drives ?? []).filter((k) => k in TRACTION)]);
  g.autoDrive = d.autoDrive ?? true;
  g.wave.n = Math.max(0, Math.round(d.wave ?? 0));
  g.forgeJob = d.forgeJob ?? null;
  bumpUid(Math.max(d.nextUid ?? 1, ...g.armory.map((w) => w.uid), ...g.player.modules.map((m) => m.weapon?.uid ?? 0)));
  g.stats = { ...g.stats, ...d.stats };
  // v9 moved everything to The Crater: older saves keep their ship, crew and progress but start again at the Mega Hangar.
  if (d.v >= 9) {
    g.fog.load(d.fog ?? []);
    const w = g.gen as OpenWorld;
    if (w.saved) {
      for (const [id, amt, re] of d.nodes ?? []) w.saved.nodes.set(id, [amt, re]);
      for (const [id, t] of d.sites ?? []) w.saved.sites.set(id, t);
      for (const [id, t] of d.runes ?? []) w.saved.runes.set(id, t);
      w.applySaved();
    }
    g.outpostsDown = new Set(d.outpostsDown ?? []);
  } else {
    // The world is a different place now: the Titan rolls out of the Mega Hangar.
    g.player.x = g.gen.spawn.x;
    g.player.y = g.gen.spawn.y;
    g.player.rot = g.gen.spawnRot ?? -Math.PI / 2;
    g.outpostsDown = new Set();
  }
  g.outriderLevel = d.outriderLevel ?? 0;
  // The v5 tutorial is new: old saves start it at the part about the base.
  g.objective = d.v >= 5 ? d.objective ?? 0 : 3;
  // v0.7 added "Survive a horde" as the second goal and "Beat a rival dreadnought" before the outpost.
  if (d.v < 6) {
    const o = g.objective;
    if (o >= 1) g.objective++;
    if (o >= 16) g.objective++;
  }
  g.objectiveCounters = d.counters ?? {};
  g.runeBuff = d.runeBuff ?? null;
  // v0.7 hulls are bigger and come with weapon pads and a main battery; older fortresses get refitted.
  g.syncHull(d.v < 6);
  // Saves from before troops: every bunk comes filled.
  if (d.v < 7) {
    g.player.troops = g.player.stats.bunks;
    g.player.recalc();
  }
  g.player.hp = d.v >= 5 ? Math.min(g.player.stats.maxHp, d.tank.hp) : g.player.stats.maxHp;
  g.energy = Math.max(0, Math.min(g.maxEnergy(), d.energy ?? 5));
  g.resetHand();
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
  if (d.campaign && d.v >= 9) g.campaign = { ...newCampaign(), ...d.campaign, finale: d.campaign.finale === 'won' ? 'won' : 'none' };
  if (d.life) g.life = { ...newCrewLife(), ...d.life };
  g.titan = loadTitanState(d.titan);
  if (d.home && d.v >= 9) g.deploy.home = d.home;
  g.autoRotate = d.autoRotate ?? true;
  // v10 crews are four times the size: older saves come aboard with every bunk filled.
  if (d.v < 10) {
    g.player.troops = g.player.stats.bunks;
    g.player.recalc();
  }
  g.reserves = Math.max(0, d.reserves ?? 0);
  g.statMods = stationMods(g);
  g.gen.focus(g.player.x, g.player.y);
  return g;
}

/** Feature state worth saving, from every sector generated so far. */
function featureState(g: Game): Pick<SaveData, 'nodes' | 'sites' | 'runes'> {
  const out: Pick<SaveData, 'nodes' | 'sites' | 'runes'> = { nodes: [], sites: [], runes: [] };
  const w = g.gen as OpenWorld;
  const secs = typeof w.touchedFeatures === 'function' ? [...w.touchedFeatures()] : [{ nodes: g.gen.nodes, sites: g.gen.sites, runes: g.gen.runes }];
  for (const s of secs) {
    for (const n of s.nodes) if (n.respawnAt > 0 || n.amount < n.max) out.nodes.push([n.id, n.amount, n.respawnAt]);
    for (const x of s.sites) if (x.readyAt > g.time) out.sites.push([x.id, x.readyAt]);
    for (const r of s.runes) if (r.readyAt > g.time) out.runes.push([r.id, r.readyAt]);
  }
  return out;
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
    return d && d.v >= 3 && d.v <= 10 ? d : null;
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
