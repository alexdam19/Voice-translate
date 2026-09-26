import { ACTIVE_SLOTS, MAX_BASE_CREW, OFFICER_SLOTS } from '../shared/constants';
import { scaleCost } from '../shared/inventory';
import { DRIVE_ITEM, getItem } from '../shared/items';
import type { DriveKey } from '../shared/types';
import { canTakeNode, treeNode, WEAPONS, type WeaponItem } from '../shared/weapons';
import { nextRarity, scrapValue, STAR_TIME, starBlock, starCost } from './arsenal';
import { hireCost, pickPerk } from './crew';
import { chassisDef, levelCost, maxModuleLevel, MODULES, RECIPES, UPGRADE_CHASSIS, type Recipe } from './defs';
import type { Game, TreeKindJob } from './game';
import { canResearch, moduleUnlocked, researchCost, researchTime, TECH_BY_ID, weaponCraftable, type TreeKind } from './tech';
import { newWeapon } from './templates';
import { applyOutriderCrew, OUTRIDER_UPGRADE } from './systems/outrider';

export type Result = { ok: true; msg?: string } | { ok: false; msg: string };
const OK = (msg?: string): Result => ({ ok: true, msg });
const NO = (msg: string): Result => ({ ok: false, msg });

const bump = (g: Game, k: string): void => {
  g.objectiveCounters[k] = (g.objectiveCounters[k] ?? 0) + 1;
};

/* ---------------- base ---------------- */

export function buildModule(g: Game, key: string, cx: number, cy: number): Result {
  const d = MODULES[key];
  if (!d) return NO('Unknown module.');
  if (d.required) return NO('Only one of those.');
  if (!moduleUnlocked(g.tech, key)) return NO(`Research ${TECH_BY_ID.get(d.tech!)?.name ?? d.tech} first (RESEARCH, T).`);
  if (!g.player.canPlace(key, cx, cy)) return NO(d.unique && g.player.modules.some((m) => m.key === key) ? 'You can only have one.' : "Doesn't fit there.");
  if (!g.pay(d.cost)) return NO('Not enough materials.');
  g.player.addModule(key, cx, cy);
  g.applyCrew();
  bump(g, 'built');
  return OK(`${d.name} built.`);
}

export function removeModule(g: Game, id: number): Result {
  const p = g.player;
  const m = p.moduleById(id);
  if (!m) return NO('Nothing there.');
  const d = MODULES[m.key];
  if (d.required) return NO("The Command Bridge can't be removed.");
  if (d.crew) {
    const capAfter = Math.min(MAX_BASE_CREW, p.stats.crewCap - d.crew);
    if (g.mainCrew().length > capAfter) return NO('Your crew would have nowhere to sleep. Move or dismiss crew first.');
  }
  if (d.garage && g.outrider) return NO('The Outrider is using the Garage.');
  p.removeModule(id);
  if (m.weapon) g.armory.push(m.weapon);
  const refund = scaleCost(d.cost, 0.5);
  for (const [k, n] of Object.entries(refund)) g.give(k, n, true);
  g.applyCrew();
  return OK(`${d.name} removed (half the materials refunded).`);
}

export function moveModule(g: Game, id: number, cx: number, cy: number): Result {
  if (!g.player.moveModule(id, cx, cy)) return NO("Doesn't fit there.");
  return OK();
}

export function mountWeapon(g: Game, modId: number, uid: number): Result {
  const p = g.player;
  const m = p.moduleById(modId);
  const i = g.armory.findIndex((w) => w.uid === uid);
  if (!m || i < 0) return NO('Nothing to mount.');
  const hp = MODULES[m.key].hardpoint;
  const w = g.armory[i];
  if (!hp) return NO('That is not a hardpoint.');
  if (WEAPONS[w.key].size !== hp) return NO(`${WEAPONS[w.key].name} needs a ${WEAPONS[w.key].size} hardpoint.`);
  g.armory.splice(i, 1);
  if (m.weapon) g.armory.push(m.weapon);
  m.weapon = w;
  m.aim = p.rot;
  p.version++;
  g.applyCrew();
  bump(g, 'mounted');
  return OK(`${WEAPONS[w.key].name} mounted.`);
}

export function unmountWeapon(g: Game, modId: number): Result {
  const m = g.player.moduleById(modId);
  if (!m || !m.weapon) return NO('Nothing mounted.');
  g.armory.push(m.weapon);
  m.weapon = null;
  g.player.version++;
  g.applyCrew();
  return OK('Weapon moved to the armory.');
}

export { scrapValue };

export function scrapWeapon(g: Game, uid: number): Result {
  const i = g.armory.findIndex((w) => w.uid === uid);
  if (i < 0) return NO('Not in the armory.');
  const w = g.armory[i];
  if (g.forgeJob?.uid === uid) return NO('That weapon is in the Forge.');
  g.armory.splice(i, 1);
  for (const [k, n] of Object.entries(scrapValue(w.rarity))) g.give(k, n, true);
  return OK(`Scrapped ${WEAPONS[w.key].name}.`);
}

export function craftWeapon(g: Game, key: string): Result {
  const d = WEAPONS[key];
  if (!d || d.exclusive) return NO('Cannot be built.');
  if (!g.player.stats.workshop) return NO('Build a Workshop on your deck first.');
  if (!weaponCraftable(g.tech, key)) return NO(`Research ${TECH_BY_ID.get(d.tech!)?.name ?? d.tech} first.`);
  if (!g.pay(d.cost)) return NO('Not enough materials.');
  g.armory.push(newWeapon(key, 0));
  return OK(`Built a Common ${d.name}. Mount it in BASE > Armory.`);
}

export function craftRecipe(g: Game, r: Recipe, times = 1): Result {
  if (r.station === 'refinery' && !g.player.stats.refinery) return NO('Needs a Refinery on your deck.');
  if (r.station === 'workshop' && !g.player.stats.workshop) return NO('Needs a Workshop on your deck.');
  if (r.station === 'sanctum' && !g.player.stats.sanctum) return NO('Needs an Arcane Sanctum on your deck.');
  if (r.tech && !g.tech.has(r.tech)) return NO(`Research ${TECH_BY_ID.get(r.tech)?.name ?? r.tech} first.`);
  let made = 0;
  for (let i = 0; i < times; i++) {
    if (!g.player.cargo.canFit(r.out, r.n)) break;
    if (!g.pay(r.cost)) break;
    g.player.cargo.add(r.out, r.n);
    made++;
  }
  if (!made) return NO('Not enough materials (or no cargo space).');
  return OK(`Made ${made * r.n} ${getItem(r.out).name}.`);
}

export function upgradeChassis(g: Game): Result {
  const i = UPGRADE_CHASSIS.findIndex((c) => c.key === g.player.chassis);
  const next = UPGRADE_CHASSIS[i + 1];
  if (!next) return NO('Already the biggest hull in the wasteland.');
  if (!g.canPay(next.cost)) return NO('Not enough materials.');
  g.pay(next.cost);
  g.player.setChassis(next.key);
  g.applyCrew();
  bump(g, 'built');
  return OK(`Upgraded to ${next.name}! More deck space.`);
}

export function installDrive(g: Game, drive: DriveKey): Result {
  const p = g.player;
  if (p.drive === drive) return NO('Already installed.');
  const item = DRIVE_ITEM[drive];
  if (drive !== 'wheels' && p.cargo.count(item) < 1) return NO(`Craft ${getItem(item).name} in CARGO > Workshop first.`);
  if (drive !== 'wheels') p.cargo.take(item, 1);
  if (p.drive !== 'wheels') p.cargo.add(DRIVE_ITEM[p.drive], 1);
  p.drive = drive;
  p.version++;
  p.path = [];
  return OK(`${getItem(item).name} installed.`);
}

/** Starts a timed research project (one military and one personnel at a time). */
export function research(g: Game, id: string): Result {
  const node = TECH_BY_ID.get(id);
  if (!node) return NO('Unknown research.');
  if (g.tech.has(id)) return NO('Already researched.');
  if (!canResearch(g.tech, node)) return NO('Research the connected nodes first.');
  const kind: TreeKind = node.tree;
  if (kind === 'personnel' && g.player.stats.lab <= 0) return NO('Personnel research needs a Science Lab on your deck (research it in INDUSTRY I).');
  const busy = g.research[kind];
  if (busy) return NO(`Already researching ${TECH_BY_ID.get(busy.id)?.name ?? busy.id}. Cancel it first or wait.`);
  const cost = researchCost(node, g.player.crew.research);
  if (!g.pay(cost)) return NO('Not enough materials.');
  g.research[kind] = { id, t: 0, total: researchTime(node), cost };
  bump(g, 'research_started');
  return OK(`Researching ${node.name}...`);
}

export function cancelResearch(g: Game, kind: TreeKind): Result {
  const job: TreeKindJob | null = g.research[kind];
  if (!job) return NO('Nothing to cancel.');
  g.research[kind] = null;
  for (const [k, n] of Object.entries(job.cost ?? {})) g.give(k, n, true);
  return OK('Research cancelled; materials refunded.');
}

/** Finishes research instantly (tests and debugging). */
export function researchNow(g: Game, id: string): Result {
  const node = TECH_BY_ID.get(id);
  if (!node || !canResearch(g.tech, node)) return NO('Cannot research that.');
  g.tech.add(id);
  g.applyCrew();
  return OK();
}

/* ---------------- modules ---------------- */

export function upgradeModule(g: Game, modId: number): Result {
  const m = g.player.moduleById(modId);
  if (!m) return NO('Nothing there.');
  const d = MODULES[m.key];
  if (m.lvl >= maxModuleLevel(d)) return NO(`${d.name} is at its highest level.`);
  const cost = levelCost(d, m.lvl);
  if (!g.pay(cost)) return NO('Not enough materials.');
  m.lvl++;
  g.player.version++;
  g.applyCrew();
  bump(g, 'upgraded');
  return OK(`${d.name} upgraded to level ${m.lvl}.`);
}

export function setActiveSlot(g: Game, slot: number, modId: number): Result {
  if (slot < 0 || slot >= ACTIVE_SLOTS) return NO('Bad slot.');
  const m = modId ? g.player.moduleById(modId) : undefined;
  if (modId && (!m || !MODULES[m.key].active)) return NO('That module has no active ability.');
  const prev = g.activeSlots.indexOf(modId);
  if (modId && prev >= 0) g.activeSlots[prev] = g.activeSlots[slot];
  g.activeSlots[slot] = modId;
  return OK();
}

export function setUltimate(g: Game, modId: number): Result {
  const m = g.player.moduleById(modId);
  if (!m || !MODULES[m.key].ult) return NO('That module has no ultimate.');
  if (g.ultModule !== modId) g.ultCharge *= 0.5;
  g.ultModule = modId;
  return OK('Ultimate armed. It keeps half its charge when you switch.');
}

/* ---------------- arsenal: forge and trees ---------------- */

export function findWeapon(g: Game, uid: number): WeaponItem | null {
  return g.armory.find((w) => w.uid === uid) ?? g.player.modules.find((m) => m.weapon?.uid === uid)?.weapon ?? null;
}

export function startForge(g: Game, uid: number): Result {
  const w = findWeapon(g, uid);
  if (!w) return NO('Unknown weapon.');
  const block = starBlock(w, g.tech, g.player.stats.forge > 0);
  if (block) return NO(block);
  if (g.forgeJob) return NO('The Forge is busy. Wait for it or cancel.');
  const to = nextRarity(w);
  const cost = starCost(w, to);
  if (!g.pay(cost)) return NO('Not enough materials.');
  g.forgeJob = { uid, to, t: 0, total: STAR_TIME[to], cost };
  return OK(`Forging ${WEAPONS[w.key].name} to ${to + 1}★...`);
}

export function cancelForge(g: Game): Result {
  const job = g.forgeJob;
  if (!job) return NO('The Forge is idle.');
  g.forgeJob = null;
  for (const [k, n] of Object.entries(job.cost ?? {})) g.give(k, n, true);
  return OK('Forging cancelled; materials refunded.');
}

export function takeTreeNode(g: Game, uid: number, id: string): Result {
  const w = findWeapon(g, uid);
  if (!w) return NO('Unknown weapon.');
  const d = WEAPONS[w.key];
  const n = treeNode(d.family, id);
  if (!n) return NO('Unknown upgrade.');
  if (!canTakeNode(w, id)) {
    if ((w.tree ?? []).includes(id)) return NO('Already taken.');
    if ((w.tree ?? []).length >= w.rarity + 1) return NO('No points left. Forge it to more stars for more points.');
    return NO('Take the upgrade before it in that branch first.');
  }
  w.tree = [...(w.tree ?? []), id];
  g.applyCrew();
  g.player.version++;
  bump(g, 'tree');
  return OK(`${n.name} installed.`);
}

export const respecCost = (w: WeaponItem): Record<string, number> => ({ scrap: 20 * (w.rarity + 1) });

export function respecTree(g: Game, uid: number): Result {
  const w = findWeapon(g, uid);
  if (!w || !(w.tree ?? []).length) return NO('Nothing to reset.');
  if (!g.pay(respecCost(w))) return NO('Not enough scrap.');
  w.tree = [];
  g.applyCrew();
  return OK('Upgrade points refunded.');
}

/* ---------------- crew ---------------- */

export function hire(g: Game, idx: number): Result {
  const c = g.recruits[idx];
  if (!c) return NO('Nobody there.');
  if (!g.crewRoom()) return NO('No bunks free. Build Quarters or Barracks (max 15 aboard).');
  const cost = hireCost(c);
  if (!g.pay(cost)) return NO('Not enough scrap or rations.');
  g.recruits.splice(idx, 1);
  g.addCrew(c);
  bump(g, 'hired');
  return OK(`${c.name} joined the crew.`);
}

export const REFRESH_COST = { scrap: 10 };

export function refreshRecruits(g: Game): Result {
  if (!g.pay(REFRESH_COST)) return NO('Not enough scrap.');
  g.rollRecruits();
  return OK();
}

export function setOfficer(g: Game, crewId: number, slot: number): Result {
  const c = g.crew.find((k) => k.id === crewId);
  if (!c) return NO('Unknown crew.');
  if (c.loc !== 'main') return NO('Only crew aboard the fortress can be officers.');
  if (slot < -1 || slot >= OFFICER_SLOTS) return NO('Bad seat.');
  if (slot >= g.officerSeats()) return NO('That seat is locked. Research Officer School / Chain of Command (RESEARCH > Personnel).');
  if (slot >= 0) {
    const cur = g.crew.find((k) => k.officer === slot && k.loc === 'main');
    if (cur) {
      cur.officer = c.officer;
      if (cur.officer >= 0) cur.cd = Math.max(cur.cd, 5);
    }
  }
  c.officer = slot;
  c.cd = Math.max(c.cd, 3);
  return OK();
}

export function dismiss(g: Game, crewId: number): Result {
  const i = g.crew.findIndex((k) => k.id === crewId);
  if (i < 0) return NO('Unknown crew.');
  const c = g.crew[i];
  g.crew.splice(i, 1);
  g.applyCrew();
  applyOutriderCrew(g);
  return OK(`${c.name} left the crew.`);
}

export function moveCrew(g: Game, crewId: number, to: 'main' | 'outrider'): Result {
  const c = g.crew.find((k) => k.id === crewId);
  if (!c) return NO('Unknown crew.');
  if (c.loc === to) return NO('Already there.');
  if (c.loc === 'away') return NO(`${c.name} is still making their way back.`);
  if (to === 'outrider') {
    if (!g.outrider) return NO('No Outrider launched.');
    if (c.officer >= 0) return NO('Officers stay on the fortress. Unseat them first.');
    if (c.champion || c.exclusive) return NO('Champions and exclusive characters are main crew: they stay aboard the fortress.');
    if (g.outriderCrew().length >= g.outriderCap()) return NO('The Outrider is full.');
  } else if (g.mainCrew().length >= g.crewCap()) return NO('No bunks free on the fortress.');
  c.loc = to;
  c.officer = -1;
  g.applyCrew();
  applyOutriderCrew(g);
  return OK();
}

export function choosePerk(g: Game, crewId: number, idx: number): Result {
  const c = g.crew.find((k) => k.id === crewId);
  if (!c || !c.draft) return NO('No perk to pick.');
  pickPerk(c, idx, () => g.rng.next(), g.draftChoices());
  g.applyCrew();
  bump(g, 'perks');
  return OK();
}

export function upgradeOutrider(g: Game): Result {
  if (g.outriderLevel < 1) return NO('Launch the Outrider first.');
  const cost = OUTRIDER_UPGRADE[g.outriderLevel - 1];
  if (!cost) return NO('Fully upgraded.');
  if (!g.pay(cost)) return NO('Not enough materials.');
  g.outriderLevel++;
  if (g.outrider) {
    const hpFrac = g.outrider.hp / g.outrider.stats.maxHp;
    if (g.outriderLevel >= 2 && !g.outrider.modules.some((m) => m.cx === 3 && m.cy === 0)) g.outrider.addModule('hp_light', 3, 0, newWeapon('autocannon', 1));
    applyOutriderCrew(g);
    g.outrider.hp = g.outrider.stats.maxHp * hpFrac;
  }
  return OK(`Outrider upgraded to Mk${g.outriderLevel}.`);
}

export function recipesFor(station: Recipe['station']): Recipe[] {
  return RECIPES.filter((r) => r.station === station);
}

export { chassisDef };
