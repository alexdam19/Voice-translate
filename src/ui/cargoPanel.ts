import { getItem } from '../shared/items';
import { craftRecipe, recipesFor } from '../game/actions';
import { itemIcon } from '../render/icons';
import { button, costHTML, esc, h, tooltip } from './dom';
import type { PanelCtx } from './panels';

export function renderCargo(ctx: PanelCtx): void {
  if (ctx.tab === 'workshop') return renderWorkshop(ctx);
  const g = ctx.app.game;
  const inv = g.player.cargo;
  const used = inv.slots.filter(Boolean).length;
  ctx.body.appendChild(h('div', 'hint', `Cargo hold: <b>${used} / ${inv.size}</b> slots. Build Cargo Holds (BASE) for more room. ${g.player.stats.vault ? `Secure Vault protects ${g.player.stats.vault} slots in the Dead Zone.` : ''}`));
  const grid = h('div', 'hold-grid');
  inv.slots.forEach((s, i) => {
    const el = h('div', `slot ${s ? '' : 'empty'} ${i < g.player.stats.vault ? 'vault' : ''}`);
    if (s) {
      el.innerHTML = `<img src="${itemIcon(s.id)}"><span class="n">${s.n}</span>`;
      tooltip(el, () => {
        const d = getItem(s.id);
        return `<h4>${esc(d.name)}</h4><div class="d">${esc(d.desc || d.kind)}</div>`;
      });
    }
    grid.appendChild(el);
  });
  ctx.body.appendChild(grid);
}

function renderWorkshop(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const s = g.player.stats;
  const sections: [string, 'refinery' | 'workshop' | 'none', boolean, string][] = [
    ['REFINERY: ore into parts', 'refinery', s.refinery, 'Build a Refinery on your deck (BASE).'],
    ['WORKSHOP: drive trains', 'workshop', s.workshop, 'Build a Workshop on your deck (BASE). Weapons are built in BASE > Armory.'],
    ['FIELD KITCHEN & KITS', 'none', true, ''],
  ];
  for (const [title, station, ok, need] of sections) {
    ctx.body.appendChild(h('div', 'cat', `${title} ${ok ? '' : `<small class="bad">${esc(need)}</small>`}`));
    const grid = h('div', 'recipe-grid');
    for (const r of recipesFor(station)) {
      const out = getItem(r.out);
      const el = h('div', `recipe ${ok ? '' : 'locked'}`);
      el.innerHTML = `<img src="${itemIcon(r.out)}"><div><b>${r.n > 1 ? `${r.n}× ` : ''}${esc(out.name)}</b> <small>(have ${g.player.cargo.count(r.out)})</small><br>${costHTML(r.cost, [g.player.cargo])}</div>`;
      tooltip(el, () => `<h4>${esc(out.name)}</h4><div class="d">${esc(out.desc || '')}</div>`);
      if (ok) {
        const row = h('div', 'row');
        row.appendChild(button('Make', () => {
          const res = craftRecipe(g, r, 1);
          ctx.msg(res.msg ?? '', res.ok);
          if (res.ok) ctx.app.sound('craft');
          ctx.rerender();
        }, 'small'));
        if (out.maxStack > 1) row.appendChild(button('×5', () => {
          const res = craftRecipe(g, r, 5);
          ctx.msg(res.msg ?? '', res.ok);
          ctx.rerender();
        }, 'small'));
        el.appendChild(row);
      }
      grid.appendChild(el);
    }
    ctx.body.appendChild(grid);
  }
}
