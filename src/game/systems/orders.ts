import { NODE_INFO } from '../../shared/mapgen';
import type { Game } from '../game';
import { planPath } from './movement';
import { SITE_RADIUS } from './world';

/** Right-click on the ground: drive there. */
export function orderMove(g: Game, x: number, y: number, quiet = false): boolean {
  g.harvestId = 0;
  g.interact = null;
  g.player.focusId = 0;
  const ok = planPath(g, g.player, x, y);
  if (!ok && !quiet) g.hooks.toast("Can't find a way there.", '#ff8a80');
  return ok;
}

/** Right-click an enemy: focus all guns on it and close to range. */
export function orderAttack(g: Game, id: number): void {
  g.harvestId = 0;
  g.interact = null;
  g.player.focusId = id;
  const t = g.hostileTarget(id);
  if (!t) return;
  const range = maxRange(g) * 0.8;
  if (Math.hypot(t.x - g.player.x, t.y - g.player.y) > range) planPath(g, g.player, t.x, t.y);
  else {
    g.player.path = [];
    g.player.goal = null;
  }
}

export function maxRange(g: Game): number {
  let r = 8;
  for (const m of g.player.weapons()) if (m.stats) r = Math.max(r, m.stats.range);
  return r;
}

/** Keeps chasing a focused target until it's in range. */
export function updateFocus(g: Game, dt: number): void {
  const p = g.player;
  if (!p.focusId) return;
  const t = g.hostileTarget(p.focusId);
  if (!t) {
    p.focusId = 0;
    return;
  }
  focusRepath -= dt;
  const d = Math.hypot(t.x - p.x, t.y - p.y);
  const range = maxRange(g) * 0.8;
  if (d <= range) {
    if (p.path.length && !p.goal) p.path = [];
    if (p.goal && Math.hypot(p.goal.x - t.x, p.goal.y - t.y) < 30) {
      p.path = [];
      p.goal = null;
    }
  } else if (focusRepath <= 0) {
    focusRepath = 0.8;
    planPath(g, p, t.x, t.y);
  }
}
let focusRepath = 0;

export function orderHarvest(g: Game, nodeId: number): void {
  const n = g.gen.nodes.find((k) => k.id === nodeId);
  if (!n) return;
  if (NODE_INFO[n.type].tier > g.player.stats.drill) {
    g.hooks.toast(`${NODE_INFO[n.type].name} needs a Mk${NODE_INFO[n.type].tier} Drill Rig.`, '#ff8a80');
    return;
  }
  g.player.focusId = 0;
  g.interact = null;
  g.harvestId = nodeId;
  if (g.player.edgeDist(n.x, n.y) > 3) planPath(g, g.player, n.x, n.y);
}

export function orderInteract(g: Game, kind: 'site' | 'rune' | 'gate', id: number, x: number, y: number): void {
  g.harvestId = 0;
  g.player.focusId = 0;
  g.interact = { kind, id };
  if (kind === 'site') planPath(g, g.player, x, y);
  else planPath(g, g.player, x, y + 0.01);
  void SITE_RADIUS;
}

export function updateInteract(g: Game): void {
  const it = g.interact;
  if (!it) return;
  const p = g.player;
  if (it.kind === 'gate') {
    if (Math.hypot(g.gen.gate.x - p.x, g.gen.gate.y - p.y) < p.stats.length / 2 + 6) {
      g.interact = null;
      p.path = [];
      p.goal = null;
      g.hooks.enterDeadZone();
    }
  } else if (it.kind === 'rune') {
    const r = g.gen.runes.find((k) => k.id === it.id);
    if (r && Math.hypot(r.x - p.x, r.y - p.y) < p.stats.length / 2 + 3.5) {
      p.path = [];
      p.goal = null;
      g.interact = null;
    }
  } else g.interact = null;
}
