import { callEscort, ESCORT_ORDER, ESCORTS, escortCap, escortUnits } from '../game/systems/reinforce';
import { button, esc, h } from './dom';
import type { PanelCtx } from './panels';

/**
 * Reinforcements: spend the war XP your kills have earned on escorts from the Hangar that stay at the Titan's side
 * (fireteams in powered armour, gunship drones, hover tanks, assault walkers). The panel keeps running the game.
 */
export function renderReinforce(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const units = escortUnits(g);
  const cap = escortCap(g);
  ctx.body.appendChild(h('div', 'hint', `<b>${Math.floor(g.warXp).toLocaleString()} war XP</b> earned by your kills. Escort <b>${units.length}/${cap}</b> units (another every 4 commander levels). Escorts keep pace with her at any speed and fight anything that comes near; they stay until they're destroyed.`));
  const grid = h('div', 'yard-grid escorts');
  for (const k of ESCORT_ORDER) {
    const d = ESCORTS[k];
    const have = units.filter((u) => u.kind === k).length;
    const card = h('div', `yard-card escort ${k}`, `<div class="yc-t">${esc(d.name.toUpperCase())}${have ? ` <small>×${have} with you</small>` : ''}</div><div class="yc-d">${esc(d.desc)}</div><div class="yc-stats"><span>Hull <b>${d.hp * d.count}</b></span><span>Damage <b>${d.dmg}</b></span><span>Range <b>${d.range} m</b></span>${d.count > 1 ? `<span>Bodies <b>${d.count}</b></span>` : ''}</div>`);
    const can = g.warXp >= d.cost && units.length < cap;
    card.appendChild(button(`CALL IN · ${d.cost} XP`, () => {
      const r = callEscort(g, k);
      ctx.msg(r.msg, r.ok);
      if (r.ok) ctx.app.sound('levelup');
      ctx.rerender();
    }, can ? 'primary' : 'disabled'));
    grid.appendChild(card);
  }
  ctx.body.appendChild(grid);
  if (units.length) {
    const list = h('div', 'escort-list', units.map((u) => `<div class="eu"><span>${esc(ESCORTS[u.kind].name)}</span><i><b style="width:${Math.round((u.hp / Math.max(1, u.maxHp)) * 100)}%"></b></i></div>`).join(''));
    ctx.body.appendChild(list);
  }
}
