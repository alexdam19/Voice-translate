import { getItem } from '../../shared/items';
import { LOOT_TABLES } from '../../shared/loot';
import { NODE_INFO } from '../../shared/mapgen';
import { buildBlock, upgradeBlock, upgradeCostOf } from '../actions';
import { CARDS, shardsNeeded, upgradeCost } from '../cards';
import { levelCost, MODULES, recipeFor } from '../defs';
import type { Game } from '../game';
import { bounties } from '../campaign';

/**
 * The objective tracker: pick something to build or upgrade (or a card to level up) and it shows what
 * you still need, and points at the nearest place to get the first missing thing.
 */

export interface TrackNeed {
  id: string;
  name: string;
  need: number;
  have: number;
}

export interface TrackTarget {
  x: number;
  y: number;
  label: string;
  kind: 'node' | 'site' | 'outpost' | 'rune' | 'base' | 'boss';
}

export interface TrackInfo {
  title: string;
  needs: TrackNeed[];
  /** Something other than materials in the way (commander level, builders...). */
  blocker: string | null;
  /** Everything is in the hold and nothing blocks it. */
  ready: boolean;
  hint: string;
  target: TrackTarget | null;
  /** Module to select when you open the base. */
  modId: number;
}

type Src = { hint: string; target: TrackTarget | null };

function nearest<T extends { x: number; y: number }>(list: T[], x: number, y: number): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const k of list) {
    const d = (k.x - x) ** 2 + (k.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

/** Where to get an item: a node to drill, a loot area to scavenge, an outpost to raid, or the refinery. */
export function sourceFor(g: Game, id: string, depth = 0): Src {
  const p = g.player;
  const name = getItem(id).name;
  // Refined materials: refine them if you can, otherwise chase the raw input.
  const r = recipeFor(id);
  if (r && depth < 3 && r.station !== 'sanctum') {
    const station = r.station === 'refinery' ? p.stats.refinery : r.station === 'workshop' ? p.stats.workshop : true;
    if (!station) return { hint: `${name} is made at a ${r.station === 'refinery' ? 'Refinery' : 'Workshop'}. Build one in your base.`, target: { x: p.x, y: p.y, label: 'Your base', kind: 'base' } };
    const missing = Object.entries(r.cost).find(([k, n]) => p.cargo.count(k) < n);
    if (!missing) return { hint: `Refine ${name} at your ${r.station === 'refinery' ? 'Refinery' : 'Workshop'} (tap it in BASE).`, target: { x: p.x, y: p.y, label: 'Your base', kind: 'base' } };
    const sub = sourceFor(g, missing[0], depth + 1);
    return { hint: `${name} is refined from ${getItem(missing[0]).name}. ${sub.hint}`, target: sub.target };
  }
  if (id === 'tech_parts' || id === 'mythic_essence') {
    const outs = g.gen.outposts.filter((o) => !g.outpostsDown.has(o.id));
    const o = nearest(outs, p.x, p.y);
    const extra = id === 'mythic_essence' ? 'Titans, rune chests and deep outposts drop it.' : 'Raider tanks, elites and outposts drop it.';
    if (o) return { hint: `${extra} Nearest outpost marked.`, target: { x: o.x, y: o.y, label: 'Enemy outpost', kind: 'outpost' } };
    const ru = nearest(g.gen.runes.filter((k) => k.readyAt <= g.time), p.x, p.y);
    return { hint: extra, target: ru ? { x: ru.x, y: ru.y, label: 'Rune altar', kind: 'rune' } : null };
  }
  // Raw resources: the nearest node you can drill (or one you'll need a better drill for).
  const types = (Object.keys(NODE_INFO) as (keyof typeof NODE_INFO)[]).filter((t) => NODE_INFO[t].item === id);
  if (types.length) {
    const nodes = g.gen.nodes.filter((n) => types.includes(n.type) && n.respawnAt === 0);
    const n = nearest(nodes, p.x, p.y);
    if (n) {
      const info = NODE_INFO[n.type];
      const drill = info.tier > p.stats.drill ? ` Needs a Mk${info.tier} Drill Rig.` : ' Park the fortress on it to drill, or send a scavenging squad.';
      return { hint: `Harvest ${info.name}.${drill}`, target: { x: n.x, y: n.y, label: info.name, kind: 'node' } };
    }
  }
  // Loot areas whose tables carry it.
  const kinds = Object.entries(LOOT_TABLES).filter(([k, t]) => k.startsWith('site_') && t.some((e) => e.id === id)).map(([k]) => k.slice(5));
  if (kinds.length) {
    const sites = g.gen.sites.filter((s) => kinds.includes(s.kind) && s.readyAt <= g.time);
    const s = nearest(sites, p.x, p.y);
    if (s) return { hint: `Scavenge loot areas like ${s.name}: park inside the ring and hold.`, target: { x: s.x, y: s.y, label: s.name, kind: 'site' } };
  }
  return { hint: `Enemies and loot areas drop ${name}.`, target: null };
}

function needsOf(g: Game, cost: Record<string, number>): TrackNeed[] {
  return Object.entries(cost).map(([id, need]) => ({ id, name: getItem(id).name, need, have: Math.min(need, g.player.cargo.count(id)) }));
}

/** Something to do that earns commander XP (for level-locked goals). */
function xpSource(g: Game): TrackTarget | null {
  const p = g.player;
  const s = nearest(g.gen.sites.filter((k) => k.readyAt <= g.time), p.x, p.y);
  return s ? { x: s.x, y: s.y, label: s.name, kind: 'site' } : null;
}

export function trackInfo(g: Game): TrackInfo | null {
  const tr = g.tracked;
  if (!tr) return null;
  const p = g.player;
  let title = '';
  let cost: Record<string, number> = {};
  let blocker: string | null = null;
  let modId = 0;
  let extraNeed: TrackNeed | null = null;
  if (tr.kind === 'part') {
    const b = bounties(g).find((k) => k.part.key === tr.key);
    if (!b || b.status === 'installed') return null;
    const hg = g.gen.hangar ?? g.gen.spawn;
    const home = b.status === 'carrying';
    return {
      title: `Part: ${b.item}`, needs: [], blocker: null, ready: false, hint: b.todo, modId: 0,
      target: home ? { x: hg.x, y: hg.y, label: 'Mega Hangar', kind: 'site' } : { x: b.x, y: b.y, label: b.status === 'dropped' ? `${b.item}` : `${b.bossName} (${b.place})`, kind: 'boss' },
    };
  }
  if (tr.kind === 'build') {
    const d = MODULES[tr.key];
    if (!d) return null;
    title = `Build: ${d.name}`;
    cost = d.cost;
    blocker = buildBlock(g, tr.key);
  } else if (tr.kind === 'upgrade') {
    const m = p.moduleById(tr.modId);
    if (!m) return null;
    const d = MODULES[m.key];
    title = `Upgrade: ${d.name} to level ${m.lvl + 1}`;
    cost = upgradeCostOf(g, m.id);
    blocker = upgradeBlock(g, m.id);
    modId = m.id;
    if (!Object.keys(cost).length) cost = levelCost(d, m.lvl);
  } else {
    const d = CARDS[tr.id];
    const c = g.cards[tr.id];
    if (!d || !c) return null;
    title = `Level up: ${d.name} to level ${c.level + 1}`;
    cost = upgradeCost(d, c.level);
    const need = shardsNeeded(d, c.level);
    extraNeed = { id: 'shards', name: 'Card copies', need, have: Math.min(need, c.shards) };
  }
  const needs = needsOf(g, cost);
  if (extraNeed) needs.unshift(extraNeed);
  // Builders being busy isn't something to go and find.
  const hard = blocker && !/builders are (busy|already)/i.test(blocker) ? blocker : null;
  const missing = needs.find((n) => n.have < n.need);
  let hint = '';
  let target: TrackTarget | null = null;
  if (hard && /commander level/i.test(hard)) {
    hint = `${hard} Earn XP by killing enemies, clearing loot areas, outposts and runes.`;
    target = xpSource(g);
  } else if (hard) {
    hint = hard;
    target = { x: p.x, y: p.y, label: 'Your base', kind: 'base' };
  } else if (missing?.id === 'shards') {
    const o = nearest(g.gen.outposts.filter((k) => !g.outpostsDown.has(k.id)), p.x, p.y);
    hint = 'Copies come from card packs: elites, raider tanks, outposts, runes and titans drop them.';
    target = o ? { x: o.x, y: o.y, label: 'Enemy outpost', kind: 'outpost' } : xpSource(g);
  } else if (missing) {
    const src = sourceFor(g, missing.id);
    hint = `Need ${missing.need - missing.have} more ${missing.name}. ${src.hint}`;
    target = src.target;
  } else {
    hint = blocker ? `${blocker} Everything else is ready.` : 'Everything is in the hold. Open BASE and start it!';
    target = { x: p.x, y: p.y, label: 'Your base', kind: 'base' };
  }
  return { title, needs, blocker, ready: !missing && !blocker, hint, target, modId };
}
