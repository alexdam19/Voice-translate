import { TILE } from '../../shared/constants';
import { canAfford, payCost, scaleCost, type Cost } from '../../shared/inventory';
import type { Game } from '../game';
import { BG, MODULES, RIG_TILES, RT } from '../rigDefs';

export interface BuildHover {
  tx: number;
  ty: number;
  w: number;
  h: number;
  ok: boolean;
  reason: string;
}

export const buildHover: { cur: BuildHover | null } = { cur: null };
let lastWarn = 0;

function refund(g: Game, cost: Cost, f: number): void {
  const r = g.playerRig!;
  const back = f >= 1 ? cost : scaleCost(cost, f);
  for (const id in back) {
    let left = r.cargo.add(id, back[id]);
    if (left > 0) left = g.player.inv.add(id, left);
    if (left > 0) g.dropItem(g.player.cx, g.player.cy, { id, n: left });
  }
}

function tileIdByKey(key: string): number {
  return RIG_TILES.find((t) => t.key === key)?.id ?? RT.HULL;
}

export function updateBuild(g: Game, _dt: number): void {
  const r = g.playerRig;
  if (!r || !g.canBuild()) {
    g.setPanel(null);
    return;
  }
  const inp = g.input;
  const m = g.mouseWorld;
  const { tx, ty } = r.toTile(m.x, m.y);
  const b = g.build;
  const invs = g.craftInvs();

  let hover: BuildHover;
  if (b.kind === 'module') {
    const def = MODULES[b.id];
    const mx = tx - Math.floor(def.w / 2), my = ty - def.h + 1;
    const err = r.checkModule(def, mx, my);
    const afford = canAfford(invs, def.cost);
    hover = { tx: mx, ty: my, w: def.w, h: def.h, ok: !err && afford, reason: err ?? (afford ? '' : 'Not enough materials') };
  } else if (b.kind === 'tile') {
    const def = RIG_TILES[tileIdByKey(b.id)];
    const ok = r.canPlaceTile(tx, ty);
    const afford = canAfford(invs, def.cost);
    hover = { tx, ty, w: 1, h: 1, ok: ok && afford, reason: ok ? (afford ? '' : 'Not enough materials') : '' };
  } else {
    hover = { tx, ty, w: 1, h: 1, ok: r.inGrid(tx, ty), reason: '' };
  }
  buildHover.cur = r.inGrid(tx, ty) || b.kind === 'module' ? hover : null;
  if (inp.mouse.overUI) return;

  const warn = (msg: string): void => {
    if (performance.now() - lastWarn > 1500) {
      lastWarn = performance.now();
      g.toast(msg, '#ffab40');
      g.audio.play('error');
    }
  };

  // Right mouse always deconstructs.
  if (inp.mouse.right || (b.kind === 'erase' && inp.mouse.left)) {
    if (!r.inGrid(tx, ty)) return;
    const mod = r.moduleAt(tx, ty);
    if (mod) {
      if (!inp.mouse.rightPressed && !inp.mouse.leftPressed) return;
      if (mod.def.key === 'cockpit' && r.modules.filter((x) => x.def.key === 'cockpit').length === 1) {
        g.toast('Removed the Command Bridge: the rig cannot drive until you place another.', '#ffab40');
      }
      r.removeModule(mod);
      refund(g, mod.def.cost, 0.75 * (mod.hp / mod.maxHp));
      g.audio.play('break');
      g.sim.particles.burst(r.moduleCenter(mod).x, r.moduleCenter(mod).y, 14, { color: '#90a4ae', speed: 120, life: 0.5, gravity: 400, size: 3 });
      return;
    }
    const t = r.tileAt(tx, ty);
    if (t !== RT.EMPTY && t !== RT.CHASSIS) {
      r.setTile(tx, ty, RT.EMPTY);
      r.recalc();
      refund(g, RIG_TILES[t].cost, 1);
      g.audio.play('break', 0.5);
      return;
    }
    if (t === RT.EMPTY && r.bgAt(tx, ty) !== BG.NONE && (b.kind === 'bg' || b.kind === 'erase')) r.setBg(tx, ty, BG.NONE);
    return;
  }

  if (!inp.mouse.left) return;
  if (b.kind === 'bg') {
    if (r.inGrid(tx, ty) && ty < r.rows - 1) r.setBg(tx, ty, BG.PANEL);
    return;
  }
  if (b.kind === 'tile') {
    if (!r.canPlaceTile(tx, ty)) return;
    const id = tileIdByKey(b.id);
    const def = RIG_TILES[id];
    if (!canAfford(invs, def.cost)) {
      warn(`Need ${Object.entries(def.cost).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(', ')} for ${def.name}.`);
      return;
    }
    payCost(invs, def.cost);
    r.setTile(tx, ty, id);
    r.recalc();
    g.audio.play('build', 0.5);
    g.sim.particles.burst(r.x + (tx + 0.5) * TILE, r.y + (ty + 0.5) * TILE, 4, { color: '#ffd180', speed: 60, life: 0.25, glow: true, size: 2 });
    return;
  }
  if (b.kind === 'module' && inp.mouse.leftPressed) {
    const def = MODULES[b.id];
    if (hover.reason) {
      warn(hover.reason);
      return;
    }
    payCost(invs, def.cost);
    const mod = r.addModule(def, hover.tx, hover.ty);
    g.audio.play('craft');
    const c = r.moduleCenter(mod);
    g.sim.particles.burst(c.x, c.y, 24, { color: def.accent, speed: 140, life: 0.6, glow: true, size: 2 });
    g.toast(`${def.name} installed.`, def.accent);
    if (r.powerUse > r.powerProd) g.toast(`Power deficit: ${r.powerUse} used / ${r.powerProd} produced. Build a reactor.`, '#ffab40');
  }
}
