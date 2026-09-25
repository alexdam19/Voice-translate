import { GRAVITY, MAX_FALL, TILE } from '../../shared/constants';
import { getItem, type ItemDef } from '../../shared/items';
import { CELL_LADDER, cellAt, moveBody, overlaps } from '../../shared/physics';
import { T, TILES } from '../../shared/tiles';
import { canAfford, payCost, scaleCost } from '../../shared/inventory';
import { EXTRACT_SECONDS } from '../../shared/protocol';
import type { Game, Interactable } from '../game';
import type { Rig } from '../rig';
import { RIG_TILES, RT } from '../rigDefs';

const approach = (v: number, t: number, s: number): number => (v < t ? Math.min(t, v + s) : Math.max(t, v - s));
const warned = new Map<string, number>();

function warnOnce(g: Game, msg: string, color = '#ffab40', ms = 2500): void {
  const now = performance.now();
  if ((warned.get(msg) ?? 0) + ms > now) return;
  warned.set(msg, now);
  g.toast(msg, color);
}

export function respawnPlayer(g: Game, penalty: boolean): void {
  const p = g.player;
  p.dead = false;
  p.hp = penalty ? p.maxHp * 0.6 : p.maxHp;
  p.invuln = 2;
  p.vx = p.vy = 0;
  p.driving = null;
  p.mining = null;
  const r = g.playerRig;
  if (g.sim.kind === 'world' && r) {
    const q = r.modules.find((m) => m.def.quarters) ?? r.modules.find((m) => m.def.key === 'cockpit');
    if (q) {
      p.x = r.x + (q.x + q.def.w / 2) * TILE - p.w / 2;
      p.y = r.y + (q.y + q.def.h) * TILE - p.h - 1;
    } else {
      p.x = r.cx - p.w / 2;
      p.y = r.y + (r.rows - 1) * TILE - p.h - 1;
    }
    return;
  }
  const sx = g.gen.spawnX + 20;
  p.x = sx * TILE;
  p.y = g.gen.world.skyTop[sx] * TILE - p.h - 1;
}

export function updatePlayer(g: Game, dt: number): void {
  const p = g.player;
  const inp = g.input;
  p.hurtFlash -= dt;
  p.invuln -= dt;
  p.fireCd -= dt;
  p.useCd -= dt;
  if (p.dead) {
    p.deadTimer -= dt;
    return;
  }
  p.energy = Math.min(p.maxEnergy, p.energy + 28 * dt);
  if (p.regenDelay > 0) p.regenDelay -= dt;
  else if (g.sim.kind === 'world') p.hp = Math.min(p.maxHp, p.hp + 0.6 * dt);

  for (let i = 0; i < 10; i++) if (inp.hit(`Digit${(i + 1) % 10}`)) p.selected = i;
  if (inp.mouse.wheel !== 0 && g.panel !== 'build') p.selected = (p.selected + inp.mouse.wheel + 10) % 10;

  const m = g.mouseWorld;
  p.aim = Math.atan2(m.y - (p.y + 10), m.x - p.cx);

  if (p.driving) {
    updateDriving(g, p.driving);
    return;
  }
  g.manualAim = null;
  g.manualFire = false;
  p.facing = m.x >= p.cx ? 1 : -1;
  move(g, dt);
  p.anim += dt * (Math.abs(p.vx) > 10 && p.grounded ? Math.abs(p.vx) / 40 : 0);

  if (g.panel !== 'build' && !inp.mouse.overUI) useItems(g, dt);
  else p.mining = null;
  findInteract(g);
  if (inp.hit('KeyF') && g.interact) g.interact.act();

  // Warzone extraction
  const s = g.sim;
  if (s.kind === 'warzone' && g.warzone) {
    const inside = s.extracts.some((e) => p.cx > e.x && p.cx < e.x + e.w && p.cy > e.y && p.cy < e.y + e.h);
    g.warzone.extractT = inside ? g.warzone.extractT + dt : 0;
    if (g.warzone.extractT >= EXTRACT_SECONDS) g.warzone.requestExtract();
  }
}

function move(g: Game, dt: number): void {
  const p = g.player;
  const inp = g.input;
  const left = inp.down('KeyA') || inp.down('ArrowLeft');
  const right = inp.down('KeyD') || inp.down('ArrowRight');
  const up = inp.down('KeyW') || inp.down('ArrowUp');
  const down = inp.down('KeyS') || inp.down('ArrowDown');
  const liquid = p.inLiquid !== 0;
  const maxSpd = 200 * (liquid ? 0.55 : 1);
  const dir = (right ? 1 : 0) - (left ? 1 : 0);
  if (dir !== 0) p.vx = approach(p.vx, dir * maxSpd, (p.grounded ? 2200 : 1300) * dt);
  else p.vx = approach(p.vx, 0, (p.grounded ? 2400 : 500) * dt);

  const grids = g.gridsNear(p);
  const ladder = cellAt(grids, p.cx, p.y + p.h * 0.5, p.team) === CELL_LADDER || cellAt(grids, p.cx, p.y + p.h - 3, p.team) === CELL_LADDER;
  if (ladder && (up || (down && !p.grounded))) p.climbing = true;
  if (!ladder) p.climbing = false;

  if (p.climbing) {
    p.vy = up ? -170 : down ? 170 : 0;
    p.vx *= 0.7;
    p.dropTimer = down ? 0.15 : p.dropTimer;
    if (inp.hit('Space')) {
      p.climbing = false;
      p.vy = -420;
    }
  } else {
    p.vy = Math.min(p.vy + GRAVITY * dt * (liquid ? 0.35 : 1), liquid ? 160 : MAX_FALL);
    if (p.grounded) p.coyote = 0.1;
    else p.coyote -= dt;
    const jumpPressed = inp.hit('Space') || (!ladder && (inp.hit('KeyW') || inp.hit('ArrowUp')));
    const jumpHeld = inp.down('Space') || up;
    if (jumpPressed && (p.coyote > 0 || liquid)) {
      p.vy = liquid ? -320 : -520;
      p.coyote = 0;
    }
    if (!jumpHeld && p.vy < -150) p.vy += GRAVITY * dt * 1.2;
    const gad = p.gadget ? getItem(p.gadget).gadget : undefined;
    p.jetting = false;
    if (gad) {
      if (p.grounded) p.fuel = Math.min(gad.fuel, p.fuel + gad.regen * 2 * dt);
      else if (!jumpHeld) p.fuel = Math.min(gad.fuel, p.fuel + gad.regen * 0.3 * dt);
      if (jumpHeld && !p.grounded && p.coyote <= 0 && p.vy > -280 && p.fuel > 0) {
        p.vy = Math.max(-320, p.vy - gad.thrust * dt);
        p.fuel -= dt;
        p.jetting = true;
        g.sim.particles.add({ x: p.cx - p.facing * 5, y: p.y + p.h - 6, vx: (Math.random() - 0.5) * 40, vy: 200 + Math.random() * 80, life: 0.3, size: 3, color: Math.random() < 0.5 ? '#ffab40' : '#6af0ff', glow: true });
        g.audio.play('jet', 0.6);
      }
    }
    if (down && p.grounded) p.dropTimer = 0.2;
  }

  moveBody(p, dt, grids);
  const world = g.sim.world;
  p.x = Math.max(0, Math.min(world.w * TILE - p.w, p.x));

  // Liquids
  const lt = world.get(Math.floor(p.cx / TILE), Math.floor((p.y + p.h - 4) / TILE));
  const d = TILES[lt];
  p.inLiquid = d.liquid ? lt : 0;
  if (d.contact) {
    const f = p.protects(d.contact.hazard) ? 0.2 : 1;
    g.hurtPlayer(d.contact.dps * f * dt, 'dot');
    if (Math.random() < 0.3) g.sim.particles.add({ x: p.cx + (Math.random() - 0.5) * 12, y: p.y + p.h - 6, vy: -60, life: 0.5, size: 3, color: lt === T.LAVA ? '#ff6e40' : '#b2ff59', glow: true });
  }
  if (p.y > world.h * TILE) g.hurtPlayer(999, 'void');
}

/* ------------------------------------------------------------------ */
/* Driving                                                              */
/* ------------------------------------------------------------------ */

function updateDriving(g: Game, r: Rig): void {
  const p = g.player;
  const inp = g.input;
  const cockpit = r.modules.find((m) => m.def.key === 'cockpit');
  if (!cockpit || !g.sim.rigs.includes(r)) {
    p.driving = null;
    r.throttle = 0;
    return;
  }
  p.x = r.x + (cockpit.x + cockpit.def.w / 2) * TILE - p.w / 2;
  p.y = r.y + (cockpit.y + cockpit.def.h) * TILE - p.h - 0.5;
  p.vx = p.vy = 0;
  p.facing = r.facing;
  const dir = (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0) - (inp.down('KeyA') || inp.down('ArrowLeft') ? 1 : 0);
  r.throttle = inp.down('KeyS') ? 0 : dir;
  g.manualAim = g.mouseWorld;
  g.manualFire = inp.mouse.left && !inp.mouse.overUI;
  if (r.bogged) warnOnce(g, `${r.traction.speed < 0.2 ? 'Bogged down' : 'Losing traction'} on ${r.terrain}! Your drive train is wrong for this terrain (see Rig panel, R).`, '#ffab40', 8000);
  if (r.blocked && dir !== 0 && !r.drilling) warnOnce(g, 'Too steep to climb. Back up, build a ramp, or fit a Drill Ram.', '#ffab40', 6000);
  if (inp.hit('KeyF')) {
    p.driving = null;
    r.throttle = 0;
    g.manualAim = null;
    g.manualFire = false;
  }
  g.interact = { label: 'Leave the wheel', x: p.cx, y: p.y, act: () => {} };
}

/* ------------------------------------------------------------------ */
/* Items                                                                */
/* ------------------------------------------------------------------ */

function useItems(g: Game, dt: number): void {
  const p = g.player;
  const inp = g.input;
  const st = p.held();
  const def = st ? getItem(st.id) : null;
  p.repairing = false;
  if (!def) {
    p.mining = null;
    return;
  }
  const L = inp.mouse.left, Lp = inp.mouse.leftPressed;
  switch (def.kind) {
    case 'tool':
      if (L) mine(g, def, dt);
      else p.mining = null;
      if (inp.mouse.right && !L) repair(g, def, dt);
      break;
    case 'weapon':
    case 'throwable':
      p.mining = null;
      if ((def.weapon!.auto ? L : Lp) && p.fireCd <= 0) fireWeapon(g, def);
      break;
    case 'block':
      p.mining = null;
      if (L && p.useCd <= 0) placeBlock(g, def);
      break;
    case 'consumable':
      if (Lp) consume(g, def);
      break;
    case 'suit':
      if (Lp) {
        const old = p.suit;
        p.suit = def.id;
        p.inv.slots[p.selected] = old ? { id: old, n: 1 } : null;
        g.toast(`Equipped ${def.name}.`, '#80deea');
        g.audio.play('craft');
      }
      break;
    case 'gadget':
      if (Lp) {
        const old = p.gadget;
        p.gadget = def.id;
        p.fuel = 0;
        p.inv.slots[p.selected] = old ? { id: old, n: 1 } : null;
        g.toast(`Equipped ${def.name}.`, '#80deea');
        g.audio.play('craft');
      }
      break;
    case 'drive':
      if (Lp) warnOnce(g, 'Install drive trains from the Rig panel (R) while near your rig.', '#80deea');
      break;
    default:
      p.mining = null;
  }
}

function consume(g: Game, def: ItemDef): void {
  const p = g.player;
  if (p.useCd > 0) return;
  if (p.hp >= p.maxHp && def.id !== 'stim') {
    warnOnce(g, 'Already at full health.', '#b0bec5', 1500);
    return;
  }
  const s = p.inv.slots[p.selected];
  if (!s) return;
  s.n--;
  if (s.n <= 0) p.inv.slots[p.selected] = null;
  const heal = def.heal ?? 0;
  if (g.sim.kind === 'warzone') g.warzone?.sendHeal(heal);
  else p.hp = Math.min(p.maxHp, p.hp + heal);
  if (def.id === 'stim') p.energy = p.maxEnergy;
  p.useCd = 0.5;
  g.audio.play('pickup');
  g.sim.particles.burst(p.cx, p.cy, 10, { color: '#76ff03', speed: 60, life: 0.6, glow: true, size: 2, gravity: -60 });
}

export function fireWeapon(g: Game, def: ItemDef): void {
  const p = g.player;
  const w = def.weapon!;
  if (w.ammo === 'grenade') {
    const s = p.inv.slots[p.selected];
    if (!s) return;
    s.n--;
    if (s.n <= 0) p.inv.slots[p.selected] = null;
  } else if (w.ammo) {
    if (p.inv.count(w.ammo) < 1) {
      warnOnce(g, `Out of ${getItem(w.ammo).name}! Craft more at a Fabricator.`, '#ff5252');
      p.fireCd = 0.3;
      g.audio.play('error');
      return;
    }
    p.inv.take(w.ammo, 1);
  }
  if (w.energy) {
    if (p.energy < w.energy) {
      p.fireCd = 0.15;
      return;
    }
    p.energy -= w.energy;
  }
  p.fireCd = 1 / w.rate;
  const ox = p.cx + Math.cos(p.aim) * 12;
  const oy = p.y + 10 + Math.sin(p.aim) * 12;
  g.audio.play(w.sound);

  if (w.kind === 'melee') {
    const hx = p.cx + p.facing * 20, hy = p.cy;
    for (const e of g.sim.enemies) if (!e.dead && Math.abs(e.cx - hx) < 26 && Math.abs(e.cy - hy) < 28) g.damageEnemy(e, w.dmg, p.facing * w.knock);
    for (const r of g.sim.remotes.values()) if (Math.abs(r.x + r.w / 2 - hx) < 26 && Math.abs(r.y + r.h / 2 - hy) < 28) g.warzone?.reportHit(r.id, w.dmg, def.id);
    for (const r of g.sim.rigs) if (r.team !== 'player' && !r.wrecked) r.damageAt(hx, hy, w.dmg * 0.5);
    g.sim.particles.burst(hx, hy, 8, { color: '#6af0ff', speed: 140, life: 0.2, glow: true, size: 2 });
    return;
  }

  for (let i = 0; i < w.pellets; i++) {
    const a = p.aim + (Math.random() - 0.5) * w.spread * 2;
    g.spawnProjectile({
      x: ox, y: oy, angle: a, speed: w.speed * (w.pellets > 1 ? 0.85 + Math.random() * 0.3 : 1), dmg: w.dmg, team: 'player',
      kind: w.kind, life: w.life, explosive: w.explosive, pierce: w.pierce, gravity: w.gravity, tileDmg: w.tileDmg,
      color: w.color, knock: w.knock, weapon: def.id,
    });
  }
  g.sim.particles.burst(ox, oy, 5, { color: w.color, speed: 160, life: 0.12, glow: true, size: 2, angle: p.aim, spread: 0.8 });
  p.vx -= Math.cos(p.aim) * w.knock * 0.15;
  if (g.sim.kind === 'warzone') g.warzone?.sendShoot(ox, oy, p.aim, def.id);
}

/* ------------------------------------------------------------------ */
/* Mining, salvage, repair                                              */
/* ------------------------------------------------------------------ */

const SALVAGE: Record<number, { id: string; n: number }> = {
  [RT.HULL]: { id: 'scrap', n: 1 },
  [RT.ARMOR]: { id: 'titanium_alloy', n: 1 },
  [RT.PLATFORM]: { id: 'scrap', n: 1 },
  [RT.WINDOW]: { id: 'glass', n: 1 },
  [RT.DOOR]: { id: 'iron_plate', n: 1 },
  [RT.LADDER]: { id: 'scrap', n: 1 },
  [RT.LAMP]: { id: 'copper_wire', n: 1 },
};

function mine(g: Game, def: ItemDef, dt: number): void {
  const p = g.player;
  const tool = def.tool!;
  const m = g.mouseWorld;
  if (Math.hypot(m.x - p.cx, m.y - p.cy) > tool.reach * TILE) {
    p.mining = null;
    return;
  }
  const rig = g.rigAt(m.x, m.y);
  if (rig && rig !== g.playerRig) {
    const { tx, ty } = rig.toTile(m.x, m.y);
    const mod = rig.moduleAt(tx, ty);
    const t = rig.tileAt(tx, ty);
    if (mod || (t !== RT.EMPTY && t !== RT.CHASSIS)) {
      sparks(g, m.x, m.y, '#ffab40');
      if (!rig.wrecked) {
        // Sabotage a live rig from up close.
        rig.damageAt(m.x, m.y, 45 * tool.power * dt);
        p.mining = null;
        return;
      }
      if (!p.mining || p.mining.rig !== rig || p.mining.tx !== tx || p.mining.ty !== ty) p.mining = { tx, ty, rig, progress: 0 };
      const need = mod ? 2.2 : t === RT.ARMOR ? 1.2 : 0.45;
      p.mining.progress += (dt * tool.power) / need;
      if (p.mining.progress >= 1) {
        p.mining = null;
        if (mod) {
          const yieldCost = scaleCost(mod.def.cost, 0.45);
          if (!Object.keys(yieldCost).length) yieldCost.scrap = 3;
          for (const id in yieldCost) g.dropItem(m.x, m.y, { id, n: yieldCost[id] });
          rig.removeModule(mod);
        } else {
          const sv = SALVAGE[t];
          if (sv) g.dropItem(m.x, m.y, { ...sv });
          rig.setTile(tx, ty, RT.EMPTY);
        }
        g.audio.play('break');
        if (rig.modules.length === 0 && countTiles(rig) < 8) g.sim.rigs.splice(g.sim.rigs.indexOf(rig), 1);
      }
      return;
    }
  }
  if (rig === g.playerRig && rig) {
    const { tx, ty } = rig.toTile(m.x, m.y);
    if (rig.moduleAt(tx, ty) || rig.tileAt(tx, ty) !== RT.EMPTY) {
      p.mining = null;
      return;
    }
  }
  const world = g.sim.world;
  const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
  const t = world.get(tx, ty);
  const d = TILES[t];
  if (t === T.AIR || d.liquid || d.indestructible) {
    p.mining = null;
    return;
  }
  if (d.tier > tool.tier) {
    warnOnce(g, `${d.name} needs a Plasma Cutter Mk${d.tier}.`, '#ffab40');
    p.mining = null;
    return;
  }
  if (!p.mining || p.mining.rig || p.mining.tx !== tx || p.mining.ty !== ty) p.mining = { tx, ty, rig: null, progress: 0 };
  p.mining.progress += (dt * tool.power) / Math.max(0.05, d.hardness);
  if (Math.random() < 0.5) sparks(g, (tx + Math.random()) * TILE, (ty + Math.random()) * TILE, `rgb(${d.base.join(',')})`);
  g.audio.play('mine');
  if (p.mining.progress >= 1) {
    p.mining = null;
    breakTile(g, tx, ty, true);
  }
}

function countTiles(r: Rig): number {
  let n = 0;
  for (let i = 0; i < r.tiles.length; i++) if (r.tiles[i] !== RT.EMPTY && r.tiles[i] !== RT.CHASSIS) n++;
  return n;
}

function sparks(g: Game, x: number, y: number, color: string): void {
  g.sim.particles.add({ x, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 160, life: 0.3, size: 2, color, gravity: 500 });
  if (Math.random() < 0.4) g.sim.particles.add({ x, y, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, life: 0.15, size: 2, color: '#ffe0b2', glow: true });
}

/** Removes a world tile, dropping its item. Also knocks loose anything that was resting on it. */
export function breakTile(g: Game, tx: number, ty: number, drop: boolean): void {
  const world = g.sim.world;
  const d = TILES[world.get(tx, ty)];
  if (d.indestructible) return;
  world.set(tx, ty, T.AIR);
  if (g.sim.kind === 'warzone') g.warzone?.sendTile(tx, ty, T.AIR);
  if (drop && d.drop) g.dropItem((tx + 0.5) * TILE, (ty + 0.5) * TILE, { id: d.drop, n: d.dropN });
  g.sim.particles.burst((tx + 0.5) * TILE, (ty + 0.5) * TILE, 8, { color: `rgb(${d.base.join(',')})`, speed: 120, life: 0.5, gravity: 500, size: 3 });
  g.audio.play('break', 0.6);
  const above = world.get(tx, ty - 1);
  if (above === T.FUNGUS || above === T.LAMP) breakTile(g, tx, ty - 1, drop);
}

let repairDebt = 0;

function repair(g: Game, def: ItemDef, dt: number): void {
  const p = g.player;
  const r = g.playerRig;
  const m = g.mouseWorld;
  if (!r || g.sim.kind !== 'world' || Math.hypot(m.x - p.cx, m.y - p.cy) > def.tool!.reach * TILE) return;
  const { tx, ty } = r.toTile(m.x, m.y);
  if (!r.inGrid(tx, ty)) return;
  const amount = 60 * def.tool!.power * dt;
  const mod = r.moduleAt(tx, ty);
  let healed = 0;
  if (mod && mod.hp < mod.maxHp) {
    healed = Math.min(amount, mod.maxHp - mod.hp);
    mod.hp += healed;
  } else {
    const i = ty * r.cols + tx;
    const t = r.tiles[i];
    const max = RIG_TILES[t].hp;
    if (t !== RT.EMPTY && t !== RT.CHASSIS && r.hp[i] < max) {
      healed = Math.min(amount, max - r.hp[i]);
      r.hp[i] += healed;
      r.version++;
    }
  }
  if (healed <= 0) return;
  p.repairing = true;
  repairDebt += healed;
  if (repairDebt >= 25) {
    repairDebt -= 25;
    const invs = g.craftInvs();
    if (!canAfford(invs, { scrap: 1 })) {
      warnOnce(g, 'Repairs need scrap.', '#ff5252');
      return;
    }
    payCost(invs, { scrap: 1 });
  }
  if (Math.random() < 0.5) g.sim.particles.add({ x: m.x, y: m.y, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 80, life: 0.3, size: 2, color: '#69f0ae', glow: true });
}

function placeBlock(g: Game, def: ItemDef): void {
  const p = g.player;
  const m = g.mouseWorld;
  const world = g.sim.world;
  const tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
  if (Math.hypot((tx + 0.5) * TILE - p.cx, (ty + 0.5) * TILE - p.cy) > 7 * TILE) return;
  const cur = world.get(tx, ty);
  if (cur !== T.AIR && !TILES[cur].liquid) return;
  const box = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
  const place = def.place!;
  if (TILES[place].solid) {
    if (overlaps(box, p)) return;
    for (const e of g.sim.enemies) if (overlaps(box, e)) return;
  }
  for (const r of g.sim.rigs) {
    if (overlaps(box, { x: r.x, y: r.y, w: r.widthPx, h: r.heightPx + 26 })) {
      warnOnce(g, 'Can\'t place blocks inside a rig. Use Build mode (B) for your rig.', '#ffab40');
      return;
    }
  }
  const neighbors = [world.get(tx - 1, ty), world.get(tx + 1, ty), world.get(tx, ty - 1), world.get(tx, ty + 1)];
  const anchored = neighbors.some((n) => TILES[n].solid || TILES[n].platform || TILES[n].liquid) || world.wall(tx, ty) !== 0;
  if (!anchored) return;
  const s = p.inv.slots[p.selected];
  if (!s) return;
  s.n--;
  if (s.n <= 0) p.inv.slots[p.selected] = null;
  world.set(tx, ty, place);
  if (g.sim.kind === 'warzone') g.warzone?.sendTile(tx, ty, place);
  p.useCd = 0.1;
  g.audio.play('build', 0.6);
}

/* ------------------------------------------------------------------ */
/* Interaction                                                          */
/* ------------------------------------------------------------------ */

function findInteract(g: Game): void {
  const p = g.player;
  const s = g.sim;
  let best: Interactable | null = null;
  let bd = Infinity;
  const consider = (it: Interactable): void => {
    const d = Math.hypot(it.x - p.cx, it.y - p.cy);
    if (d < bd) {
      bd = d;
      best = it;
    }
  };

  const r = g.playerRig;
  if (r && s.kind === 'world' && s.rigs.includes(r)) {
    const c = r.modules.find((m) => m.def.key === 'cockpit');
    if (c) {
      const x0 = r.x + (c.x - 1) * TILE, x1 = r.x + (c.x + c.def.w + 1) * TILE;
      const y0 = r.y + (c.y - 1) * TILE, y1 = r.y + (c.y + c.def.h) * TILE;
      if (p.cx > x0 && p.cx < x1 && p.cy > y0 && p.cy < y1) {
        consider({
          label: 'Take the wheel', x: p.cx, y: p.cy,
          act: () => {
            p.driving = r;
            p.mining = null;
            g.audio.play('door');
            g.toast('Driving: A/D throttle, S brake, mouse aims turrets (LMB fires), F to get up.', '#80deea');
          },
        });
      }
    }
    const { tx, ty } = r.toTile(p.cx, p.cy);
    const mod = r.moduleAt(tx, ty);
    if (mod?.def.station) consider({ label: `Use ${mod.def.name}`, x: p.cx + 1, y: p.cy, act: () => g.setPanel('craft') });
    else if (mod?.def.key === 'garage' || mod?.def.key === 'barracks') consider({ label: 'Rig management', x: p.cx + 1, y: p.cy, act: () => g.setPanel('rig') });
  }

  for (const c of s.caches) {
    if (c.opened) continue;
    const cx = c.x + 12, cy = c.y - 8;
    if (Math.abs(cx - p.cx) < 30 && Math.abs(cy - p.cy) < 30) consider({ label: 'Crack salvage cache', x: cx, y: cy, act: () => g.openCache(c.id) });
  }

  if (s.kind === 'world') {
    const ck = g.gen.checkpoint;
    const gx = ck.x * TILE;
    const gy = ck.ground * TILE;
    if (Math.abs(p.cx - gx) < 14 * TILE && p.cy > gy - 20 * TILE && p.cy < gy + TILE) {
      consider({ label: 'Enter THE DEAD ZONE (multiplayer)', x: gx, y: gy - 40, act: () => g.ui.confirmWarzone() });
    }
  } else {
    for (const c of s.crates.values()) {
      if (Math.abs(c.x - p.cx) < 36 && Math.abs(c.y - 10 - p.cy) < 36) {
        consider({ label: `Search ${c.label}`, x: c.x, y: c.y, act: () => g.ui.openLoot(c.id) });
      }
    }
  }
  g.interact = best;
}
