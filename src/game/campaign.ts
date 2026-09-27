import { getItem } from '../shared/items';
import { REGION_INFO, type Region, type RegionKind } from '../shared/mapgen';
import { CLASSES, type HullClass } from './classes';
import { CC_COMMANDER_LEVEL, chassisForCC } from './defs';
import type { Enemy } from './entities';
import { ENEMIES, FACTION_UNITS } from './enemyDefs';
import type { Game } from './game';
import { makeRecruit } from './crew';

/**
 * The goal. The Mothership sits at the edge of the world, dead in the water and besieged by the brood. Every
 * faction's stronghold boss guards one of its parts. Bring them to the ship, install them, and it rebuilds your
 * fortress into anything; install all six and it wakes, and the Last Horde comes for it.
 */

export type Part = 'city' | 'military' | 'zombie' | 'cyborg' | 'necro' | 'monster';

export const PARTS: { key: Part; item: string; region: RegionKind; boss: string; reward: string }[] = [
  { key: 'city', item: 'core_city', region: 'city', boss: 'boss_warlord', reward: 'Powers the shipyard: hull expansions to Command Center 3.' },
  { key: 'military', item: 'core_military', region: 'military', boss: 'boss_goliath', reward: 'Another story for your fortress (with a second part).' },
  { key: 'zombie', item: 'core_zombie', region: 'zombie', boss: 'boss_abomination', reward: 'Class Mark II and bigger hulls.' },
  { key: 'cyborg', item: 'core_cyborg', region: 'cyborg', boss: 'boss_overmind', reward: 'Bigger hulls and Class Mark III.' },
  { key: 'necro', item: 'core_necro', region: 'necro', boss: 'boss_lich', reward: 'A fourth story and the biggest hulls.' },
  { key: 'monster', item: 'core_monster', region: 'monster', boss: 'boss_queen', reward: 'Wakes the Mothership.' },
];

export interface Campaign {
  /** Major regions whose stronghold boss is dead. */
  bossesDown: number[];
  /** Parts installed in the Mothership. */
  installed: Part[];
  /** Reached the Mothership at least once. */
  visited: boolean;
  /** The last stand: the ship wakes and the Last Horde comes for it. */
  finale: 'none' | 'active' | 'won';
  finaleT: number;
  devourer: boolean;
}

export const newCampaign = (): Campaign => ({ bossesDown: [], installed: [], visited: false, finale: 'none', finaleT: 0, devourer: false });

/** Docking range around the Mothership. */
export const DOCK_R = 120;
const FINALE_TIME = 360;

export function isDocked(g: Game): boolean {
  const m = g.gen.mothership;
  return !!m && g.mode === 'world' && !g.player.dead && Math.hypot(g.player.x - m.x, g.player.y - m.y) < DOCK_R;
}

function regionOf(g: Game, kind: RegionKind): Region | undefined {
  return g.gen.regions.find((r) => r.major && r.kind === kind);
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
  const ms = g.gen.mothership;
  const of = 9;
  if (c.finale === 'won') return { title: 'VICTORY', text: 'The Mothership is awake. The wasteland is yours to roam: the hordes keep coming, stronger every time.', step: of, of };
  if (c.finale === 'active') return { title: 'THE LAST STAND', text: `Hold the Mothership against the Last Horde${c.devourer ? ' and kill the Devourer' : ''}: ${Math.ceil(Math.max(0, c.finaleT))}s.`, x: ms?.x, y: ms?.y, step: of, of };
  const city = regionOf(g, 'city');
  if (!c.installed.includes('city')) {
    if (city && !c.bossesDown.includes(city.id) && !cargo('core_city')) return { title: `Break the Warlord of ${city.name}`, text: `A ruined city to the south-west. Its Warlord holds a Fusion Core, the part that powers the Mothership's shipyard. Crash through the buildings; they come down.`, x: city.x, y: city.y, step: 1, of };
    return { title: 'Reach the Mothership', text: 'Take the Fusion Core to the Mothership at the edge of the world (MAP: the cyan ship). It is a long drive: set up camp on the way if you need to.', x: ms?.x, y: ms?.y, step: 2, of };
  }
  const four: Part[] = ['military', 'zombie', 'cyborg', 'necro'];
  const missing = four.filter((k) => !c.installed.includes(k));
  if (missing.length) {
    // Carrying a part? Take it home. Otherwise point at the nearest stronghold still standing.
    const carrying = missing.find((k) => cargo(PARTS.find((p) => p.key === k)!.item));
    if (carrying) return { title: `Install the ${getItem(PARTS.find((p) => p.key === carrying)!.item).name}`, text: 'Bring it to the Mothership and install it in the SHIPYARD.', x: ms?.x, y: ms?.y, step: 3 + (4 - missing.length), of };
    let best: Region | undefined;
    for (const k of missing) {
      const r = regionOf(g, PARTS.find((p) => p.key === k)!.region);
      if (r && !c.bossesDown.includes(r.id) && (!best || Math.hypot(r.x - g.player.x, r.y - g.player.y) < Math.hypot(best.x - g.player.x, best.y - g.player.y))) best = r;
    }
    if (best) {
      const boss = ENEMIES[FACTION_UNITS[REGION_INFO[best.kind].faction].boss].name;
      return { title: `Take the ${REGION_INFO[best.kind].title}`, text: `${best.name}: kill ${boss} in its heart for a Mothership part. ${missing.length} of the four parts still out there.`, x: best.x, y: best.y, step: 3 + (4 - missing.length), of };
    }
  }
  if (!c.installed.includes('monster')) {
    const nest = regionOf(g, 'monster');
    if (cargo('core_monster')) return { title: "Install the Queen's Heart", text: 'The last part. Take it to the Mothership.', x: ms?.x, y: ms?.y, step: 8, of };
    return { title: 'Kill the Brood Queen', text: `${nest?.name ?? 'The Brood Nest'}, deep in the Acid Marsh. The hordes are born there. Her heart wakes the Mothership.`, x: nest?.x, y: nest?.y, step: 7, of };
  }
  return { title: 'Wake the Mothership', text: 'All six parts are in. Dock at the Mothership and press AWAKEN in the SHIPYARD. Then hold it against everything.', x: ms?.x, y: ms?.y, step: 9, of };
}

/* ---------------------------------------------------------------------- */
/* Strongholds, the siege and the finale                                   */
/* ---------------------------------------------------------------------- */

export function updateCampaign(g: Game, dt: number): void {
  if (g.mode !== 'world') return;
  const p = g.player;
  const c = g.campaign;
  // Strongholds: the boss waits in the heart of its region.
  for (const r of g.gen.regions) {
    if (!r.major || r.kind === 'mothership' || c.bossesDown.includes(r.id)) continue;
    const d = Math.hypot(p.x - r.x, p.y - r.y);
    if (d > r.r + 40 || p.dead) continue;
    if (g.enemies.some((e) => e.region === r.id && e.boss)) continue;
    const kind = FACTION_UNITS[REGION_INFO[r.kind].faction].boss;
    const boss = g.spawnEnemy(kind, r.x, r.y, r.threat + 0.5);
    boss.region = r.id;
    boss.aggro = true;
    boss.homeX = r.x;
    boss.homeY = r.y;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const u = FACTION_UNITS[REGION_INFO[r.kind].faction];
      const k = i % 5 === 0 ? u.heavy[0] : u.common[i % u.common.length][0];
      const e = g.spawnEnemy(k, r.x + Math.cos(a) * 9, r.y + Math.sin(a) * 9, r.threat, i % 5 === 0);
      e.aggro = true;
    }
    g.hooks.toast(`${r.name}: ${boss.name} rules here. Kill it for a Mothership part.`, REGION_INFO[r.kind].color);
    g.hooks.sound('roar');
  }
  const ms = g.gen.mothership;
  if (!ms) return;
  const dMs = Math.hypot(p.x - ms.x, p.y - ms.y);
  if (!c.visited && dMs < DOCK_R && !p.dead) {
    c.visited = true;
    g.hooks.toast('You reached the MOTHERSHIP. Dock here to trade, hire, install parts and rebuild your fortress (SHIPYARD, U).', '#18ffff');
    g.hooks.sound('legendary');
  }
  updateSiege(g, dt, dMs);
  if (c.finale === 'active') updateFinale(g, dt);
}

/**
 * The Mothership is always under siege: brood creatures stream in from the marsh and throw themselves at its
 * hull while its pylons burn them down. You can help (and farm them).
 */
function updateSiege(g: Game, dt: number, dMs: number): void {
  const ms = g.gen.mothership!;
  if (dMs > 900) return;
  g.timers.siege -= dt;
  if (g.timers.siege <= 0) {
    g.timers.siege = 1.2;
    let n = 0;
    for (const e of g.enemies) if (e.siege) n++;
    if (n < 90) {
      // They come from the marsh side (away from the world's centre).
      const out = Math.atan2(ms.y - 5120, ms.x - 5120);
      for (let i = 0; i < 3; i++) {
        const a = out + (Math.random() - 0.5) * 2.4;
        const d = 240 + Math.random() * 40;
        const e = g.spawnEnemy(Math.random() < 0.8 ? 'swarmer' : 'leaper', ms.x + Math.cos(a) * d, ms.y + Math.sin(a) * d, 5);
        e.siege = true;
        e.aggro = false;
      }
    }
  }
  // The ship's pylons burn down anything that reaches its field.
  g.timers.pylon -= dt;
  if (g.timers.pylon <= 0) {
    g.timers.pylon = 0.35;
    for (const e of g.enemies) {
      if (!e.siege || e.hp <= 0 || Math.hypot(e.x - ms.x, e.y - ms.y) > 175) continue;
      const a = Math.atan2(e.y - ms.y, e.x - ms.x);
      g.fx.push({ t: 'beam', x0: ms.x + Math.cos(a) * 168, y0: ms.y + Math.sin(a) * 168, x1: e.x, y1: e.y, color: '#18ffff', w: 0.18, life: 0.15 });
      e.hp = 0;
      g.fx.push({ t: 'spark', x: e.x, y: e.y, color: '#18ffff', n: 3 });
      break;
    }
  }
}

/** How a siege creature moves: at the ship, unless you get close enough to be the better meal. */
export function siegeTarget(g: Game, e: Enemy): { x: number; y: number } | null {
  const ms = g.gen.mothership;
  if (!ms) return null;
  const p = g.player;
  if (!p.dead && p.edgeDist(e.x, e.y) < 14) return null;
  return { x: ms.x, y: ms.y };
}

function updateFinale(g: Game, dt: number): void {
  const c = g.campaign;
  const ms = g.gen.mothership!;
  const p = g.player;
  if (p.dead) {
    c.finale = 'none';
    g.hooks.toast('The Mothership fell silent again. Rebuild, return and AWAKEN it once more.', '#ff8a80');
    return;
  }
  c.finaleT -= dt;
  // The Last Horde: from every side, without end, until the timer runs out.
  g.timers.finale -= dt;
  if (g.timers.finale <= 0 && c.finaleT > 0) {
    g.timers.finale = 0.25;
    const alive = g.enemies.filter((e) => e.horde).length;
    const room = Math.max(0, 700 - alive);
    for (let i = 0; i < Math.min(room, 5); i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 90 + Math.random() * 30;
      const kinds = ['swarmer', 'swarmer', 'leaper', 'z_runner', 'skeleton', 'cy_hound', 'bat'];
      const e = g.spawnEnemy(kinds[Math.floor(Math.random() * kinds.length)], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 7);
      e.horde = true;
      e.aggro = true;
    }
  }
  if (!c.devourer && c.finaleT < FINALE_TIME - 45) {
    c.devourer = true;
    const a = Math.atan2(ms.y - 5120, ms.x - 5120);
    const e = g.spawnEnemy('boss_devourer', ms.x + Math.cos(a) * 200, ms.y + Math.sin(a) * 200, 8);
    e.aggro = true;
    e.region = -1;
    g.hooks.toast('THE DEVOURER RISES FROM THE MARSH. Kill it before it reaches the ship!', '#ff1744');
    g.hooks.sound('roar');
    g.fx.push({ t: 'shake', amt: 1.5 });
  }
  const devourerAlive = g.enemies.some((e) => e.kind === 'boss_devourer' && e.hp > 0);
  if (c.finaleT <= 0 && c.devourer && !devourerAlive) {
    c.finale = 'won';
    for (const e of g.enemies) if (e.horde) e.hp = 0;
    g.stats.victory = g.time;
    g.hooks.victory?.();
    g.hooks.toast('VICTORY! The Mothership is awake. The wasteland is yours.', '#76ff03');
    g.hooks.sound('legendary');
  }
}

/** A stronghold boss (or the Devourer) died: its part drops. */
export function onBossKilled(g: Game, e: Enemy): void {
  g.stats.bosses = (g.stats.bosses ?? 0) + 1;
  if (!e.region || e.region < 0) return;
  const r = g.gen.regions.find((k) => k.id === e.region);
  if (!r) return;
  const c = g.campaign;
  if (!c.bossesDown.includes(r.id)) c.bossesDown.push(r.id);
  const part = PARTS.find((k) => k.region === r.kind);
  if (part) {
    g.dropStacks(e.x, e.y, [{ id: part.item, n: 1 }]);
    g.hooks.toast(`${e.name} is dead. It dropped the ${getItem(part.item).name}: take it to the Mothership!`, '#76ff03');
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
  if (!isDocked(g)) return NO('Dock at the Mothership first.');
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
  if (!isDocked(g)) return NO('Only the Mothership can raise another story.');
  const p = g.player;
  if (p.stories >= 4) return NO('Four stories is as tall as a fortress can go.');
  if (p.stories >= maxStories(g.campaign.installed.length)) return NO(`Install ${p.stories === 2 ? 2 : 5} parts to raise story ${p.stories + 1}.`);
  const cost = STORY_COST[p.stories];
  if (!g.pay(cost)) return NO('Not enough materials.');
  p.setStories(p.stories + 1);
  g.applyCrew();
  return OK(`A new story rises: your fortress is ${p.stories} stories tall. More room, more hull.`);
}

export const MARK_COST: Record<string, number>[] = [{}, {}, { titanium_alloy: 30, tech_parts: 12, circuit: 20 }, { xeno_alloy: 20, tech_parts: 24, mythic_essence: 2 }];

export function classMark(g: Game): Result {
  if (!isDocked(g)) return NO('Class marks are fitted at the Mothership.');
  const p = g.player;
  if (p.classMk >= 3) return NO('Already Mark III.');
  const need = p.classMk === 1 ? 1 : 3;
  if (g.campaign.installed.length < need) return NO(`Needs ${need} part${need > 1 ? 's' : ''} installed.`);
  if (!g.pay(MARK_COST[p.classMk + 1])) return NO('Not enough materials.');
  p.classMk++;
  g.applyCrew();
  return OK(`${CLASSES[p.klass].name} Mark ${p.classMk === 2 ? 'II' : 'III'}: its strengths grow.`);
}

export const REFIT_COST = { iron_plate: 80, circuit: 20, tech_parts: 6 };

export function refitClass(g: Game, k: HullClass): Result {
  if (!isDocked(g)) return NO('Refits happen at the Mothership.');
  const p = g.player;
  if (p.klass === k) return NO('That is your class already.');
  if (!g.pay(REFIT_COST)) return NO('Not enough materials.');
  p.klass = k;
  g.syncHull();
  return OK(`Refitted as a ${CLASSES[k].name}. ${CLASSES[k].perk}`);
}

/** Hull expansion at the Mothership: the next Command Center level, finished on the spot. */
export function expandHull(g: Game): Result {
  if (!isDocked(g)) return NO('Hull expansions are done at the Mothership.');
  const p = g.player;
  const b = p.modules.find((m) => m.key === 'bridge')!;
  if (b.lvl >= 6) return NO('Your hull is as big as they come.');
  const need = CC_COMMANDER_LEVEL[b.lvl];
  if (need && g.commander.level < need) return NO(`Reach commander level ${need} first.`);
  const parts = partsForCC(b.lvl + 1);
  if (g.campaign.installed.length < parts) return NO(`Install ${parts} Mothership part${parts > 1 ? 's' : ''} first.`);
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

/** The trading post: fixed swaps (the Mothership always has stock). */
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
  if (!isDocked(g)) return NO('Trade at the Mothership.');
  const t = TRADES[i];
  if (!t) return NO('No such trade.');
  if (!g.pay(t.give)) return NO('Not enough to trade.');
  for (const [k, n] of Object.entries(t.get)) g.give(k, n, true);
  return OK('Traded.');
}

export const TROOP_COST = 12;

/** Hire troops to fill empty bunks, straight away. */
export function hireTroops(g: Game, n: number): Result {
  if (!isDocked(g)) return NO('Hire at the Mothership.');
  const p = g.player;
  const room = p.stats.bunks - p.troops;
  if (room <= 0) return NO('Every bunk is full. Build Living Quarters or Barracks for more.');
  const k = Math.min(n, room);
  if (!g.pay({ scrap: k * TROOP_COST })) return NO(`Needs ${k * TROOP_COST} scrap.`);
  p.troops += k;
  p.recalc();
  return OK(`${k} troops signed on.`);
}

/** Veteran officers for hire at the Mothership (better than the wasteland's). */
export function hireOfficer(g: Game): Result {
  if (!isDocked(g)) return NO('Hire at the Mothership.');
  if (!g.crewRoom()) return NO('No bunks free for another officer.');
  if (!g.pay({ scrap: 150, rations: 10 })) return NO('Needs 150 scrap and 10 rations.');
  const c = makeRecruit(() => g.rng.next(), 6, 0.8);
  g.addCrew(c);
  return OK(`${c.name} joins your officers.`);
}

export function awaken(g: Game): Result {
  if (!isDocked(g)) return NO('Dock at the Mothership.');
  const c = g.campaign;
  if (c.finale !== 'none') return NO(c.finale === 'won' ? 'It is already awake.' : 'It is already waking.');
  if (c.installed.length < PARTS.length) return NO(`Install all six parts first (${c.installed.length}/6).`);
  c.finale = 'active';
  c.finaleT = FINALE_TIME;
  c.devourer = false;
  g.wave.phase = 'calm';
  g.wave.t = FINALE_TIME + 60;
  g.hooks.toast('THE MOTHERSHIP WAKES. Everything in the wasteland heard it. HOLD THE SHIP!', '#ff1744');
  g.hooks.sound('alarm');
  return OK();
}
