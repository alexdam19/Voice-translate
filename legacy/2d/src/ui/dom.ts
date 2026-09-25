import { countAcross, type Cost, type Inventory, type Stack } from '../shared/inventory';
import { getItem } from '../shared/items';
import { iconURL } from '../render/icons';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function button(label: string, onClick: (e: MouseEvent) => void, cls = ''): HTMLButtonElement {
  const b = h('button', `btn ${cls}`, label);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(e);
  });
  return b;
}

export function slotEl(stack: Stack | null, extra = ''): HTMLDivElement {
  const d = h('div', `slot ${extra}`);
  if (stack) {
    const img = h('img');
    img.src = iconURL(stack.id);
    d.appendChild(img);
    if (stack.n > 1) d.appendChild(h('span', 'n', String(stack.n)));
    d.dataset.item = stack.id;
  }
  return d;
}

export function costHTML(cost: Cost, invs: Inventory[]): string {
  const parts = Object.entries(cost).map(([id, n]) => {
    const have = countAcross(invs, id);
    const cls = have >= n ? 'have' : 'lack';
    return `<span class="${cls}"><img src="${iconURL(id)}">${n} ${esc(getItem(id).name)} <small>(${have})</small></span>`;
  });
  return `<div class="cost">${parts.join('') || '<span>free</span>'}</div>`;
}

export function itemTooltip(id: string): string {
  const d = getItem(id);
  const lines: string[] = [`<h4>${esc(d.name)}</h4>`];
  if (d.weapon) {
    const w = d.weapon;
    lines.push(`<div>${Math.round(w.dmg)}${w.pellets > 1 ? ` x${w.pellets}` : ''} dmg · ${w.rate}/s${w.explosive ? ' · explosive' : ''}${w.pierce ? ` · pierce ${w.pierce}` : ''}</div>`);
    lines.push(`<div class="d">${w.ammo ? `Ammo: ${w.ammo === 'grenade' ? 'itself' : esc(getItem(w.ammo).name)}` : w.energy ? `Energy: ${w.energy}/shot` : 'No ammo'}</div>`);
  }
  if (d.tool) lines.push(`<div>Mining power ${d.tool.power} · tier ${d.tool.tier} · reach ${d.tool.reach}</div>`);
  if (d.suit) lines.push(`<div>Armor ${d.suit.armor}${d.suit.protects.length ? ` · protects: ${d.suit.protects.join(', ')}` : ''}</div>`);
  if (d.gadget) lines.push(`<div>Thrust ${d.gadget.thrust} · fuel ${d.gadget.fuel}s</div>`);
  if (d.heal) lines.push(`<div>Heals ${d.heal}</div>`);
  if (d.desc) lines.push(`<div class="d">${esc(d.desc)}</div>`);
  return lines.join('');
}
