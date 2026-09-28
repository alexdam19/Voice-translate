import { getItem } from '../shared/items';
import { HANGAR, REGION_INFO, type Region } from '../shared/mapgen';
import { ZONE } from '../shared/map';
import { CLASSES, type HullClass } from './classes';
import { CC_COMMANDER_LEVEL, chassisForCC } from './defs';
import type { Enemy } from './entities';
import { ENEMIES, MEGA, strongholdBoss, ZONE_ROSTER } from './enemyDefs';
import type { Game } from './game';
import { makeRecruit } from './crew';

/**
 * The goal. You captain a Titan out of the Mega Hangar. Six strongholds ring the Crater and each one's master
 * guards a core; bring them home and the Hangar's shipyard rebuilds your ship into anything. The sixth sits at the
 * bottom of the Divot, under the Crater Guardian. With all six the Ark Engine lights, and the World Eater comes.
 */

export type Part = 'pass' | 'ash' | 'rust' | 'lake' | 'spires' | 'divot';

export const PARTS: { key: Part; item: string; loc: string; zone: number; boss: string; reward: string }[] = [
  { key: 'pass', item: 'core_pass', loc: 'dead_mans_camp', zone: ZONE.PASS, boss: 'Road Hog', reward: 'Powers the shipyard: the Titan Mk III refit (the Recreation deck opens).' },
  { key: 'ash', item: 'core_ash', loc: 'blood_eagle', zone: ZONE.ASH, boss: 'Ash Titan', reward: 'Heavy plating: with a second core, the Mk IV refit and its rear battery.' },
  { key: 'rust', item: 'core_rust', loc: 'rustbolt_camp', zone: ZONE.RUSTBOLT, boss: 'The Forge', reward: 'Class Mark II; with a third core, the Mk V refit.' },
  { key: 'lake', item: 'core_lake', loc: 'black_lake_poi', zone: ZONE.LAKE, boss: 'The Drowned', reward: 'Class Mark III; with a fourth core, the Mk VI refit.' },
  { key: 'spires', item: 'core_spires', loc: 'broken_spires_poi', zone: ZONE.SPIRES, boss: 'The Spire', reward: 'Every refit and mark within reach, and one step from the Ark Engine.' },
  { key: 'divot', item: 'core_divot', loc: 'the_divot', zone: ZONE.DIVOT, boss: 'The Crater Guardian', reward: 'Lights the Ark Engine.' },
];

/** The enemy kind that guards a stronghold. */
export function partBoss(part: (typeof PARTS)[number]): string {
  return part.zone === ZONE.DIVOT ? MEGA[part.boss] : strongholdBoss(part.zone, part.boss);
}

export interface Campaign {
  /** Strongholds whose master is dead (region ids). */
  bossesDown: number[];
  /** Cores installed at the Mega Hangar. */
  installed: Part[];
  /** Came back to the Mega Hangar at least once. */
  visited: boolean;
  /** The last stand: the Ark Engine lights and the World Eater comes for the Hangar. */
  finale: 'none' | 'active' | 'won';
  finaleT: number;
  devourer: boolean;
}

export const newCampaign = (): Campaign => ({ bossesDown: [], installed: [], visited: false, finale: 'none', finaleT: 0, devourer: false });

/** Docking range: inside the Mega Hangar, or on its apron. */
export const DOCK_R = 520;
const FINALE_TIME = 360;

export function isDocked(g: Game): boolean {
  const m = g.gen.hangar;
  return !!m && g.mode === 'world' && !g.player.dead && Math.abs(g.player.x - m.x) < HANGAR.w / 2 + 120 && g.player.y > m.y - HANGAR.d / 2 - 60 && g.player.y < m.y + HANGAR.d / 2 + 320;
}

function regionOf(g: Game, loc: string): Region | undefined {
  return g.gen.regions.find((r) => r.key === loc);
}

/* ---------------------------------------------------------------------- */
/* The mission tracker                                                     */
/* ---------------------------------------------------------------------- */

export interface Mission {
  title: string;
  text: string;
  x?: number;
  y?: number;
  step: number;
  of: number;
}

export function mission(g: Game): Mission {
  const c = g.campaign;
  const cargo = (item: string): boolean => g.player.cargo.count(item) > 0;
  const hg = g.gen.hangar;
  const home = { x: hg?.x, y: hg?.y };
  const of = 9;
  if (c.finale === 'won') return { title: 'VICTORY', text: 'The World Eater is dead and the Ark Engine burns. The Crater is yours to roam: the hordes keep coming, stronger every time.', step: of, of };
  if (c.finale === 'active') return { title: 'THE LAST STAND', text: `Hold the Mega Hangar${c.devourer ? ' and kill the World Eater' : ''}: ${Math.ceil(Math.max(0, c.finaleT))}s.`, ...home, step: of, of };
  const first = PARTS[0];
  const pass = regionOf(g, first.loc);
  if (!c.installed.includes('pass')) {
    if (pass && !c.bossesDown.includes(pass.id) && !cargo(first.item)) return { title: `Break the warlord of ${pass.name}`, text: `Raiders hold the canyon road east of the Hangar. Their warlord drives the Road Hog, and its reactor is the core that powers the Mega Hangar's shipyard. Follow the road east and crush the camp.`, x: pass.x, y: pass.y, step: 1, of };
    return { title: 'Back to the Mega Hangar', text: `Take the ${getItem(first.item).name} home to the Mega Hangar (MAP: the blue hangar) and install it in the SHIPYARD.`, ...home, step: 2, of };
  }
  const four = PARTS.slice(1, 5);
  const missing = four.filter((k) => !c.installed.includes(k.key));
  if (missing.length) {
    // Carrying a core? Take it home. Otherwise point at the nearest stronghold still standing.
    const carrying = missing.find((k) => cargo(k.item));
    if (carrying) return { title: `Install the ${getItem(carrying.item).name}`, text: 'Bring it to the Mega Hangar and install it in the SHIPYARD.', ...home, step: 3 + (4 - missing.length), of };
    let best: { r: Region; part: (typeof PARTS)[number] } | undefined;
    for (const k of missing) {
      const r = regionOf(g, k.loc);
      if (r && !c.bossesDown.includes(r.id) && (!best || Math.hypot(r.x - g.player.x, r.y - g.player.y) < Math.hypot(best.r.x - g.player.x, best.r.y - g.player.y))) best = { r, part: k };
    }
    if (best) {
      const boss = ENEMIES[partBoss(best.part)]?.name ?? best.part.boss;
      return { title: `Take ${best.r.name}`, text: `${REGION_INFO[best.r.kind].title}: kill ${boss} in its heart for a Crater core. ${missing.length} of these four cores still out there.`, x: best.r.x, y: best.r.y, step: 3 + (4 - missing.length), of };
    }
  }
  if (!c.installed.includes('divot')) {
    const divot = regionOf(g, 'the_divot');
    if (cargo('core_divot')) return { title: "Install the Guardian's Heart", text: 'The last core. Take it home to the Mega Hangar.', ...home, step: 8, of };
    return { title: 'Descend into the Divot', text: 'The lost city at the bottom of the impact. The Crater Guardian sleeps in its heart: its core lights the Ark Engine.', x: divot?.x, y: divot?.y, step: 7, of };
  }
  return { title: 'Light the Ark Engine', text: 'All six cores are in. Dock at the Mega Hangar and press IGNITE in the SHIPYARD. Then hold the Hangar against everything.', ...home, step: 9, of };
}

/* ---------------------------------------------------------------------- */
/* Strongholds and the finale                                              */
/* ---------------------------------------------------------------------- */

export function updateCampaign(g: Game, dt: number): void {
  if (g.mode !== 'world') return;
  const p = g.player;
  const c = g.campaign;
  // Strongholds: the master waits in the heart of its region, with its guard.
  for (const part of PARTS) {
    const r = regionOf(g, part.loc);
    if (!r || c.bossesDown.includes(r.id) || p.dead) continue;
    const d = Math.hypot(p.x - r.x, p.y - r.y);
    if (d > Math.min(r.r, 2500) + 300) continue;
    if (g.enemies.some((e) => e.region === r.id && e.boss)) continue;
    const boss = g.spawnEnemy(partBoss(part), r.x, r.y, r.threat + 0.5);
    boss.region = r.id;
    boss.aggro = true;
    boss.homeX = r.x;
    boss.homeY = r.y;
    const roster = ZONE_ROSTER[part.zone]?.length ? ZONE_ROSTER[part.zone] : ZONE_ROSTER[ZONE.ASH];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const k = roster[i % 5 === 0 ? 3 : i % 3];
      const e = g.spawnEnemy(k, r.x + Math.cos(a) * 60, r.y + Math.sin(a) * 60, r.threat, i % 5 === 0);
      e.aggro = true;
    }
    g.hooks.toast(`${r.name}: ${boss.name} rules here. Kill it for a Crater core.`, REGION_INFO[r.kind].color);
    g.hooks.sound('roar');
  }
  if (!c.visited && isDocked(g) && g.time > 30) {
    c.visited = true;
    g.hooks.toast('Home: the MEGA HANGAR. Docked here you refuel, trade, hire, install cores and refit your Titan (SHIPYARD, U).', '#40c4ff');
  }
  if (c.finale === 'active') updateFinale(g, dt);
}

function updateFinale(g: Game, dt: number): void {
  const c = g.campaign;
  const hg = g.gen.hangar!;
  const p = g.player;
  if (p.dead) {
    c.finale = 'none';
    g.hooks.toast('The Ark Engine sputtered out. Rebuild, return and IGNITE it once more.', '#ff8a80');
    return;
  }
  c.finaleT -= dt;
  // The Last Horde: from every side, without end, until the timer runs out.
  g.timers.finale -= dt;
  if (g.timers.finale <= 0 && c.finaleT > 0) {
    g.timers.finale = 0.25;
    const alive = g.enemies.filter((e) => e.horde).length;
    const room = Math.max(0, 700 - alive);
    const zone = g.map.zoneAt(p.x, p.y);
    const roster = ZONE_ROSTER[zone]?.length ? ZONE_ROSTER[zone] : ZONE_ROSTER[ZONE.DUNES];
    for (let i = 0; i < Math.min(room, 5); i++) {
      const a = Math.random() * Math.PI * 2;
      const d = p.stats.length / 2 + 110 + Math.random() * 60;
      const k = roster[Math.floor(Math.random() * Math.min(4, roster.length))];
      const e = g.spawnEnemy(k, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 7);
      e.horde = true;
      e.aggro = true;
    }
  }
  if (!c.devourer && c.finaleT < FINALE_TIME - 45) {
    c.devourer = true;
    const e = g.spawnEnemy(MEGA['The World Eater'], hg.x, hg.y - HANGAR.d / 2 - 1400, 8);
    e.aggro = true;
    e.region = -1;
    g.hooks.toast('THE WORLD EATER BREAKS THE GROUND NORTH OF THE HANGAR. Kill it before it reaches the Ark!', '#ff1744');
    g.hooks.sound('roar');
  }
  const eaterAlive = g.enemies.some((e) => e.kind === MEGA['The World Eater'] && e.hp > 0);
  if (c.finaleT <= 0 && c.devourer && !eaterAlive) {
    c.finale = 'won';
    for (const e of g.enemies) if (e.horde) e.hp = 0;
    g.stats.victory = g.time;
    g.hooks.victory?.();
    g.hooks.toast('VICTORY! The World Eater is dead and the Ark Engine burns. The Crater is yours.', '#76ff03');
    g.hooks.sound('legendary');
  }
}

/** A stronghold master died: its core drops. */
export function onBossKilled(g: Game, e: Enemy): void {
  g.stats.bosses = (g.stats.bosses ?? 0) + 1;
  if (!e.region || e.region < 0) return;
  const r = g.gen.regions.find((k) => k.id === e.region);
  if (!r) return;
  const c = g.campaign;
  if (!c.bossesDown.includes(r.id)) c.bossesDown.push(r.id);
  const part = PARTS.find((k) => k.loc === r.key);
  if (part) {
    g.dropStacks(e.x, e.y, [{ id: part.item, n: 1 }]);
    g.hooks.toast(`${e.name} is dead. It dropped the ${getItem(part.item).name}: take it home to the Mega Hangar!`, '#76ff03');
  }
  g.dropPickup(e.x, e.y, { kind: 'chest', chest: 'legendary_pack', chestThreat: e.threat });
  g.gainXp(400 + 60 * g.commander.level);
}

/* ---------------------------------------------------------------------- */
/* The shipyard                                                            */
/* ---------------------------------------------------------------------- */

type Result = { ok: true; msg?: string } | { ok: false; msg: string };
const OK = (msg?: string): Result => ({ ok: true, msg });
const NO = (msg: string): Result => ({ ok: false, msg });

export function installPart(g: Game, part: Part): Result {
  if (!isDocked(g)) return NO('Dock at the Mega Hangar first.');
  const def = PARTS.find((p) => p.key === part)!;
  if (g.campaign.installed.includes(part)) return NO('Already installed.');
  if (g.player.cargo.count(def.item) < 1) return NO(`You don't have the ${getItem(def.item).name}.`);
  g.player.cargo.take(def.item, 1);
  g.campaign.installed.push(part);
  g.gainXp(250);
  g.packs.push('epic_pack');
  return OK(`${getItem(def.item).name} installed. ${def.reward}`);
}

/** Parts needed before a hull expansion to Command Center level `to`. */
export function partsForCC(to: number): number {
  return to <= 2 ? 0 : to - 2;
}

/** Stories you can have for the parts installed. */
export function maxStories(installed: number): number {
  return installed >= 5 ? 4 : installed >= 2 ? 3 : 2;
}

export const STORY_COST: Record<string, number>[] = [{}, {}, { titanium_alloy: 40, iron_plate: 120, circuit: 30, tech_parts: 10 }, { titanium_alloy: 90, xeno_alloy: 20, circuit: 60, tech_parts: 24 }];

export function addStory(g: Game): Result {
  if (!isDocked(g)) return NO('Only the Mega Hangar can raise another story.');
  const p = g.player;
  if (p.stories >= 4) return NO('Four stories is as tall as a fortress can go.');
  if (p.stories >= maxStories(g.campaign.installed.length)) return NO(`Install ${p.stories === 2 ? 2 : 5} cores to raise story ${p.stories + 1}.`);
  const cost = STORY_COST[p.stories];
  if (!g.pay(cost)) return NO('Not enough materials.');
  p.setStories(p.stories + 1);
  g.applyCrew();
  return OK(`A new story rises: your fortress is ${p.stories} stories tall. More room, more hull.`);
}

export const MARK_COST: Record<string, number>[] = [{}, {}, { titanium_alloy: 30, tech_parts: 12, circuit: 20 }, { xeno_alloy: 20, tech_parts: 24, mythic_essence: 2 }];

export function classMark(g: Game): Result {
  if (!isDocked(g)) return NO('Class marks are fitted at the Mega Hangar.');
  const p = g.player;
  if (p.classMk >= 3) return NO('Already Mark III.');
  const need = p.classMk === 1 ? 1 : 3;
  if (g.campaign.installed.length < need) return NO(`Needs ${need} core${need > 1 ? 's' : ''} installed.`);
  if (!g.pay(MARK_COST[p.classMk + 1])) return NO('Not enough materials.');
  p.classMk++;
  g.applyCrew();
  return OK(`${CLASSES[p.klass].name} Mark ${p.classMk === 2 ? 'II' : 'III'}: its strengths grow.`);
}

export const REFIT_COST = { iron_plate: 80, circuit: 20, tech_parts: 6 };

export function refitClass(g: Game, k: HullClass): Result {
  if (!isDocked(g)) return NO('Refits happen at the Mega Hangar.');
  const p = g.player;
  if (p.klass === k) return NO('That is your class already.');
  if (!g.pay(REFIT_COST)) return NO('Not enough materials.');
  p.klass = k;
  g.syncHull();
  return OK(`Refitted as a ${CLASSES[k].name}. ${CLASSES[k].perk}`);
}

/** Hull expansion at the Mega Hangar: the next Command Center level, finished on the spot. */
export function expandHull(g: Game): Result {
  if (!isDocked(g)) return NO('Hull expansions are done at the Mega Hangar.');
  const p = g.player;
  const b = p.modules.find((m) => m.key === 'bridge')!;
  if (b.lvl >= 6) return NO('Your hull is as big as they come.');
  const need = CC_COMMANDER_LEVEL[b.lvl];
  if (need && g.commander.level < need) return NO(`Reach commander level ${need} first.`);
  const parts = partsForCC(b.lvl + 1);
  if (g.campaign.installed.length < parts) return NO(`Install ${parts} Crater core${parts > 1 ? 's' : ''} first.`);
  const cost = hullCost(b.lvl);
  if (!g.pay(cost)) return NO('Not enough materials.');
  b.lvl++;
  p.setChassis(chassisForCC(b.lvl).key);
  const added = g.syncHull();
  return OK(`Your fortress is now a ${chassisForCC(b.lvl).name}${added ? ` with ${added} new weapon mount${added > 1 ? 's' : ''}` : ''}.`);
}

export function hullCost(lvl: number): Record<string, number> {
  return ([{}, { scrap: 200, iron_plate: 60, circuit: 10 }, { scrap: 320, iron_plate: 100, circuit: 20, titanium_alloy: 16, tech_parts: 5 }, { iron_plate: 140, titanium_alloy: 44, circuit: 32, uranium_rod: 6, tech_parts: 10 }, { titanium_alloy: 80, xeno_alloy: 12, circuit: 48, cryo_core: 10, tech_parts: 18 }, { titanium_alloy: 120, xeno_alloy: 28, mythic_essence: 4, tech_parts: 30 }] as Record<string, number>[])[lvl] ?? {};
}

/** The trading post: fixed swaps (the Mega Hangar always has stock). */
export const TRADES: { give: Record<string, number>; get: Record<string, number> }[] = [
  { give: { scrap: 60 }, get: { iron_plate: 10 } },
  { give: { scrap: 80 }, get: { copper_wire: 12 } },
  { give: { iron_plate: 20 }, get: { circuit: 4 } },
  { give: { scrap: 150 }, get: { titanium_alloy: 6 } },
  { give: { circuit: 10, iron_plate: 10 }, get: { tech_parts: 3 } },
  { give: { biomass: 20 }, get: { rations: 30 } },
  { give: { scrap: 200 }, get: { explosive: 12 } },
  { give: { titanium_alloy: 20 }, get: { uranium_rod: 4 } },
  { give: { titanium_alloy: 20 }, get: { cryo_core: 4 } },
  { give: { xenite: 10 }, get: { xeno_alloy: 4 } },
  { give: { tech_parts: 12 }, get: { mythic_essence: 1 } },
];

export function trade(g: Game, i: number): Result {
  if (!isDocked(g)) return NO('Trade at the Mega Hangar or a settlement.');
  const t = TRADES[i];
  if (!t) return NO('No such trade.');
  if (!g.pay(t.give)) return NO('Not enough to trade.');
  for (const [k, n] of Object.entries(t.get)) g.give(k, n, true);
  return OK('Traded.');
}

export const TROOP_COST = 3;

/** Hire troops to fill empty bunks, straight away. */
export function hireTroops(g: Game, n: number): Result {
  if (!isDocked(g)) return NO('Hire at the Mega Hangar.');
  const p = g.player;
  const room = p.stats.bunks - p.troops;
  if (room <= 0) return NO('Every bunk is full. Build Living Quarters or Barracks for more.');
  const k = Math.min(n, room);
  if (!g.pay({ scrap: k * TROOP_COST })) return NO(`Needs ${k * TROOP_COST} scrap.`);
  p.troops += k;
  p.recalc();
  return OK(`${k} troops signed on.`);
}

/** Veteran officers for hire at the Mega Hangar (better than the wasteland's). */
export function hireOfficer(g: Game): Result {
  if (!isDocked(g)) return NO('Hire at the Mega Hangar.');
  if (!g.crewRoom()) return NO('No bunks free for another officer.');
  if (!g.pay({ scrap: 150, rations: 10 })) return NO('Needs 150 scrap and 10 rations.');
  const c = makeRecruit(() => g.rng.next(), 6, 0.8);
  g.addCrew(c);
  return OK(`${c.name} joins your officers.`);
}

export function awaken(g: Game): Result {
  if (!isDocked(g)) return NO('Dock at the Mega Hangar.');
  const c = g.campaign;
  if (c.finale !== 'none') return NO(c.finale === 'won' ? 'The Ark Engine already burns.' : 'It is already lighting.');
  if (c.installed.length < PARTS.length) return NO(`Install all six cores first (${c.installed.length}/6).`);
  c.finale = 'active';
  c.finaleT = FINALE_TIME;
  c.devourer = false;
  g.wave.phase = 'calm';
  g.wave.t = FINALE_TIME + 60;
  g.hooks.toast('THE ARK ENGINE LIGHTS. Everything in the Crater heard it. HOLD THE HANGAR!', '#ff1744');
  g.hooks.sound('alarm');
  return OK();
}
