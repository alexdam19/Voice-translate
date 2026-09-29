import { MAX_BASE_CREW } from '../shared/constants';
import { scaleCost, type Cost } from '../shared/inventory';
import { DRIVE_ITEM, getItem } from '../shared/items';
import type { DriveKey } from '../shared/types';
import { canTakeNode, treeNode, WEAPONS, type WeaponItem } from '../shared/weapons';
import { nextRarity, scrapValue, STAR_TIME, starBlock, starCost } from './arsenal';
import { CARDS, MAX_CARD_LEVEL, rollPack, shardsNeeded, upgradeCost, type PackKind } from './cards';
import { hireCost, pickPerk } from './crew';
import { buildLimit, buildTime, canMount, CC_COMMANDER_LEVEL, chassisDef, CREW_SCALE, DECK_OPEN_CC, deckAllows, deckKind, deckName, defaultDeck, titanReserved, levelCost, levelTime, maxModuleLevel, MODULES, RECIPES, type Recipe } from './defs';
import type { Reward } from './entities';
import type { Game } from './game';
import { techLevel } from './progress';
import { completeJob, jobFor } from './systems/builds';
import { DRIVE_LEVEL, ownsDrive, setDrive } from './systems/drives';
import { weaponCraftable } from './tech';
import { partsForCC } from './campaign';
import { newWeapon } from './templates';
import { applyOutriderCrew, OUTRIDER_UPGRADE } from './systems/outrider';

export type Result = { ok: true; msg?: string } | { ok: false; msg: string };
const OK = (msg?: string): Result => ({ ok: true, msg });
const NO = (msg: string): Result => ({ ok: false, msg });

const bump = (g: Game, k: string): void => {
  g.objectiveCounters[k] = (g.objectiveCounters[k] ?? 0) + 1;
};

/* ---------------- base (village) ---------------- */

/** How many of a building you own (including ones under construction). */
export const countOf = (g: Game, key: string): number => g.player.modules.filter((m) => m.key === key).length;

/** Why a building can't be bought right now (ignores cost), or null. */
export function buildBlock(g: Game, key: string, crew = false): string | null {
  const d = MODULES[key];
  if (!d) return 'Unknown building.';
  if (d.required) return 'You only get one Command Center.';
  if (d.fixed) return 'Built into the hull: it comes with the Command Center.';
  if ((d.unlock ?? 1) > g.commander.level) return `Unlocks at commander level ${d.unlock}.`;
  const cc = g.player.stats.cc;
  const lim = buildLimit(d, cc);
  if (countOf(g, key) >= lim) {
    if (lim === 0 || (!d.unique && d.limit && lim < d.limit[d.limit.length - 1])) return `Upgrade the Command Center to build ${lim === 0 ? 'this' : 'more'}.`;
    return lim === 1 ? 'You can only have one.' : `You have the most allowed (${lim}).`;
  }
  // A work order brings its own crew.
  if (!crew && g.freeBuilders() <= 0) return 'All builders are busy.';
  return null;
}

function footprintReserved(key: string, cx: number, cy: number, deck: number): boolean {
  const d = MODULES[key];
  for (let y = cy; y < cy + d.h; y++) for (let x = cx; x < cx + d.w; x++) if (titanReserved(x, y, deck)) return true;
  return false;
}

/** Buys a building and places it; a builder puts it together over time. */
export function placeBuilding(g: Game, key: string, cx: number, cy: number, deck = defaultDeck(MODULES[key] ?? MODULES.armor), order = 0): Result {
  const block = buildBlock(g, key, order > 0);
  if (block) return NO(block);
  const d = MODULES[key];
  if (!deckAllows(d, deck, g.player.stories)) return NO(deckKind(d) === 'roof' ? 'That goes on the roof.' : 'That goes inside, on one of the decks below the roof.');
  if (!g.player.deckOpen(deck)) return NO(`${deckName(deck, g.player.stories)} opens with the Titan Mk ${['I', 'II', 'III', 'IV', 'V', 'VI'][(DECK_OPEN_CC[deck] ?? 1) - 1]} refit (Command Center level ${DECK_OPEN_CC[deck]}).`);
  if (!g.player.canPlace(key, cx, cy, -1, deck)) return NO(g.player.titan && footprintReserved(key, cx, cy, deck) ? 'The Spine and the lifts have to stay clear.' : "Doesn't fit there.");
  if (!g.pay(d.cost)) return NO('Not enough materials. Tap TRACK to see where to find them.');
  const m = g.player.addModule(key, cx, cy, null, deck);
  if (!m) return NO("Doesn't fit there.");
  m.built = false;
  m.aim = g.player.rot;
  g.player.version++;
  g.builds.push({ modId: m.id, kind: 'build', to: 1, t: 0, total: buildTime(d), cost: { ...d.cost }, ...(order ? { order } : {}) });
  if (g.tracked?.kind === 'build' && g.tracked.key === key) g.tracked = null;
  g.applyCrew();
  bump(g, 'placed');
  return OK(`Building ${d.name}...`);
}

/** Why a building can't be upgraded right now (ignores cost), or null. */
export function upgradeBlock(g: Game, modId: number, crew = false): string | null {
  const m = g.player.moduleById(modId);
  if (!m) return 'Nothing there.';
  const d = MODULES[m.key];
  if (jobFor(g, modId)) return 'Builders are already working on it.';
  if (!m.built) return 'Still under construction.';
  if (m.lvl >= maxModuleLevel(d)) return `${d.name} is at its highest level.`;
  if (d.required) {
    const need = CC_COMMANDER_LEVEL[m.lvl];
    if (need && g.commander.level < need) return `Reach commander level ${need} to upgrade the Command Center.`;
    // Big hull changes need the Mothership's shipyard (and its parts).
    if (m.lvl >= 2) return `Hull expansions past level 2 are built at the Mothership: dock there and open the SHIPYARD (${partsForCC(m.lvl + 1)} part${partsForCC(m.lvl + 1) > 1 ? 's' : ''} installed needed).`;
  } else if (m.lvl >= g.player.stats.cc) return `Upgrade the Command Center to level ${m.lvl + 1} first.`;
  if (!crew && g.freeBuilders() <= 0) return 'All builders are busy.';
  return null;
}

export function upgradeCostOf(g: Game, modId: number): Cost {
  const m = g.player.moduleById(modId);
  if (!m) return {};
  const d = MODULES[m.key];
  const c = levelCost(d, m.lvl);
  const disc = Math.min(0.5, g.player.crew.research);
  return disc > 0 ? scaleCost(c, 1 - disc) : c;
}

export function upgradeBuilding(g: Game, modId: number, order = 0): Result {
  const block = upgradeBlock(g, modId, order > 0);
  if (block) return NO(block);
  const m = g.player.moduleById(modId)!;
  const d = MODULES[m.key];
  const cost = upgradeCostOf(g, modId);
  if (!g.pay(cost)) return NO('Not enough materials. Tap TRACK to see where to find them.');
  g.builds.push({ modId, kind: 'upgrade', to: m.lvl + 1, t: 0, total: levelTime(d, m.lvl), cost, ...(order ? { order } : {}) });
  if (g.tracked?.kind === 'upgrade' && g.tracked.modId === modId) g.tracked = null;
  bump(g, 'upgrade_started');
  return OK(`Upgrading ${d.name} to level ${m.lvl + 1}...`);
}

export function cancelBuild(g: Game, modId: number): Result {
  const i = g.builds.findIndex((b) => b.modId === modId);
  if (i < 0) return NO('Nothing to cancel.');
  const job = g.builds[i];
  g.builds.splice(i, 1);
  for (const [k, n] of Object.entries(job.cost)) g.give(k, n, true);
  if (job.kind === 'build') g.player.removeModule(modId);
  g.player.version++;
  g.applyCrew();
  return OK('Cancelled; materials refunded.');
}

/** Finishes a job right away (tests and debugging). */
export function finishNow(g: Game, modId: number): Result {
  const i = g.builds.findIndex((b) => b.modId === modId);
  if (i < 0) return NO('Nothing to finish.');
  const [job] = g.builds.splice(i, 1);
  completeJob(g, job);
  return OK();
}

export function removeModule(g: Game, id: number): Result {
  const p = g.player;
  const m = p.moduleById(id);
  if (!m) return NO('Nothing there.');
  const d = MODULES[m.key];
  if (d.required) return NO("The Command Center can't be removed.");
  if (d.fixed) return NO("It's built into the hull.");
  if (jobFor(g, id)) return NO('Builders are working on it. Cancel the job first.');
  if (d.crew) {
    const capAfter = Math.min(MAX_BASE_CREW, p.stats.crewCap - d.crew);
    if (g.mainCrew().length > capAfter) return NO('Your crew would have nowhere to sleep. Move or dismiss crew first.');
  }
  if (d.garage && g.outrider) return NO('The Outrider is using the Garage.');
  if (d.bunks) {
    const lost = Math.max(0, p.troops - (p.stats.bunks - Math.round(d.bunks * CREW_SCALE * (1 + 0.5 * (m.lvl - 1)))));
    if (lost > 0) g.hooks.toast(`${lost} troop${lost > 1 ? 's' : ''} lost their bunk and left.`, '#ffab40');
  }
  p.removeModule(id);
  if (m.weapon) g.armory.push(m.weapon);
  const refund = scaleCost(d.cost, 0.5);
  for (const [k, n] of Object.entries(refund)) g.give(k, n, true);
  g.applyCrew();
  return OK(`${d.name} removed (half the materials refunded).`);
}

export function moveModule(g: Game, id: number, cx: number, cy: number, deck?: number): Result {
  if (!g.player.moveModule(id, cx, cy, deck)) return NO("Doesn't fit there.");
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
  if (!canMount(MODULES[m.key], WEAPONS[w.key].size)) return NO(`${WEAPONS[w.key].name} needs a ${WEAPONS[w.key].size} hardpoint.`);
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
  if (!g.player.stats.workshop) return NO('Build a Workshop in your base first.');
  if (!weaponCraftable(g.tech, key)) return NO(`Unlocks at commander level ${d.tech ? techLevel(d.tech) : 1}.`);
  if (!g.pay(d.cost)) return NO('Not enough materials.');
  g.armory.push(newWeapon(key, 0));
  return OK(`Built a Common ${d.name}. Mount it on a turret in ARSENAL (My Weapons).`);
}

export function craftRecipe(g: Game, r: Recipe, times = 1): Result {
  if (r.station === 'refinery' && !g.player.stats.refinery) return NO('Needs a Refinery in your base.');
  if (r.station === 'workshop' && !g.player.stats.workshop) return NO('Needs a Workshop in your base.');
  if (r.station === 'sanctum' && !g.player.stats.sanctum) return NO('Needs an Arcane Sanctum in your base.');
  if (r.unlock && g.commander.level < r.unlock) return NO(`Unlocks at commander level ${r.unlock}.`);
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

export function installDrive(g: Game, drive: DriveKey): Result {
  const p = g.player;
  if (p.drive === drive) return NO('Already installed.');
  if (!ownsDrive(g, drive)) return NO(`${getItem(DRIVE_ITEM[drive]).name} unlocks at commander level ${DRIVE_LEVEL[drive]} (or craft it in CARGO > Workshop).`);
  setDrive(g, drive);
  return OK(`${getItem(DRIVE_ITEM[drive]).name} installed.`);
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
  if (!g.crewRoom()) return NO('No bunks free. Build Living Quarters or a Barracks (max 15 aboard).');
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

/* ---------------- cards ---------------- */

/** Adds a card to the deck, or takes it out. */
export function toggleDeck(g: Game, id: string): Result {
  const d = CARDS[id];
  if (!d || !g.cards[id]) return NO("You don't own that card.");
  if (d.type === 'relic') return toggleRelic(g, id);
  const i = g.deck.indexOf(id);
  if (i >= 0) {
    if (g.deck.length <= 4) return NO('Keep at least 4 cards in your deck.');
    g.deck.splice(i, 1);
  } else {
    if (g.deck.length >= g.deckSize()) return NO(`Your deck is full (${g.deckSize()}). Take a card out first, or play on: slots open up with levels and hordes survived.`);
    g.deck.push(id);
  }
  g.resetHand();
  bump(g, 'deck');
  return OK();
}

/** Swaps a collection card into the deck in place of `out`. */
export function swapDeck(g: Game, out: string, inn: string): Result {
  const i = g.deck.indexOf(out);
  if (i < 0 || !g.cards[inn] || g.deck.includes(inn) || CARDS[inn]?.type === 'relic') return NO("Can't swap those.");
  g.deck[i] = inn;
  g.resetHand();
  bump(g, 'deck');
  return OK();
}

export function toggleRelic(g: Game, id: string): Result {
  const d = CARDS[id];
  if (!d || d.type !== 'relic' || !g.cards[id]) return NO("You don't own that relic.");
  const i = g.relics.indexOf(id);
  if (i >= 0) g.relics.splice(i, 1);
  else {
    const slots = g.relicSlots();
    if (slots <= 0) return NO('Relic slots unlock at commander level 6.');
    if (g.relics.length >= slots) return NO(`All ${slots} relic slots are full. Take one out first.`);
    g.relics.push(id);
  }
  g.applyCrew();
  return OK();
}

export function canUpgradeCard(g: Game, id: string): string | null {
  const c = g.cards[id];
  const d = CARDS[id];
  if (!c || !d) return "You don't own that card.";
  if (c.level >= MAX_CARD_LEVEL) return 'Max level.';
  const need = shardsNeeded(d, c.level);
  if (c.shards < need) return `Needs ${need} copies (you have ${c.shards}). Copies come from card packs.`;
  return null;
}

export function upgradeCard(g: Game, id: string): Result {
  const block = canUpgradeCard(g, id);
  if (block) return NO(block);
  const c = g.cards[id];
  const d = CARDS[id];
  const cost = upgradeCost(d, c.level);
  if (!g.pay(cost)) return NO('Not enough materials.');
  c.shards -= shardsNeeded(d, c.level);
  c.level++;
  if (d.type === 'relic') g.applyCrew();
  bump(g, 'card_up');
  return OK(`${d.name} is now level ${c.level}!`);
}

/** Opens an unopened card pack; returns the cards as rewards for the reveal screen. */
/** Opens every pack at once: all the cards go straight into the collection. Returns what came out. */
export function openAllPacks(g: Game): { id: string; isNew: boolean }[] {
  const out: { id: string; isNew: boolean }[] = [];
  while (g.packs.length) {
    const res = openPack(g, 0);
    if (!res) break;
    for (const r of res.rewards) {
      if (r.type !== 'card') continue;
      const isNew = !g.cards[r.id];
      g.ownCard(r.id);
      out.push({ id: r.id, isNew });
    }
  }
  return out;
}

/** Upgrades every card that has enough copies and materials. Returns how many levels were gained. */
export function upgradeAllCards(g: Game): number {
  let n = 0;
  for (let pass = 0; pass < 12; pass++) {
    let any = false;
    for (const id of Object.keys(g.cards)) {
      if (canUpgradeCard(g, id)) continue;
      const r = upgradeCard(g, id);
      if (r.ok) {
        n++;
        any = true;
      }
    }
    if (!any) break;
  }
  return n;
}

/** Fills the deck with your strongest cards (highest level, then rarity), keeping a spread of costs. */
export function autoDeck(g: Game): void {
  const owned = Object.keys(g.cards).filter((id) => CARDS[id] && CARDS[id].type !== 'relic');
  owned.sort((a, b) => g.cardLevel(b) - g.cardLevel(a) || CARDS[b].rarity - CARDS[a].rarity || CARDS[a].cost - CARDS[b].cost);
  g.deck = owned.slice(0, g.deckSize());
  g.resetHand();
}

export function openPack(g: Game, idx = 0): { kind: PackKind; rewards: Reward[] } | null {
  const kind = g.packs[idx];
  if (!kind) return null;
  g.packs.splice(idx, 1);
  const ids = rollPack(() => g.rng.next(), kind, g.player.crew.chestLuck + g.chestBonus * 0.8);
  g.chestBonus = 0;
  bump(g, 'packs');
  return { kind, rewards: ids.map((id) => ({ type: 'card', id })) };
}

/* ---------------- tracking ---------------- */

export function trackBuild(g: Game, key: string): Result {
  if (!MODULES[key]) return NO('Unknown building.');
  g.tracked = { kind: 'build', key };
  bump(g, 'tracked');
  return OK(`Tracking ${MODULES[key].name}. Follow the marker.`);
}

export function trackUpgrade(g: Game, modId: number): Result {
  const m = g.player.moduleById(modId);
  if (!m) return NO('Nothing there.');
  g.tracked = { kind: 'upgrade', modId };
  bump(g, 'tracked');
  return OK(`Tracking the ${MODULES[m.key].name} upgrade. Follow the marker.`);
}

export function trackCard(g: Game, id: string): Result {
  if (!CARDS[id]) return NO('Unknown card.');
  g.tracked = { kind: 'card', id };
  bump(g, 'tracked');
  return OK(`Tracking the ${CARDS[id].name} upgrade.`);
}

export function trackPart(g: Game, key: string): Result {
  g.tracked = { kind: 'part', key };
  bump(g, 'tracked');
  return OK('Tracking that Mothership part. Follow the marker.');
}

export function untrack(g: Game): void {
  g.tracked = null;
}
