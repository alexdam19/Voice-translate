import { countAcross, type Cost, type Inventory } from '../shared/inventory';
import { getItem } from '../shared/items';
import { itemIcon } from '../render/icons';

/** The UI is in touch mode (the first touch, or a phone/tablet at startup, sets it). */
export function isTouch(): boolean {
  return document.documentElement.classList.contains('touch');
}

/** "tap" on touch screens, "click" with a mouse. */
export function clickWord(cap = false): string {
  const w = isTouch() ? 'tap' : 'click';
  return cap ? w[0].toUpperCase() + w.slice(1) : w;
}

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

export function costHTML(cost: Cost, invs: Inventory[]): string {
  const parts = Object.entries(cost).map(([id, n]) => {
    const have = countAcross(invs, id);
    const cls = have >= n ? 'have' : 'lack';
    return `<span class="${cls}" title="${esc(getItem(id).name)} (you have ${have})"><img src="${itemIcon(id)}">${n}</span>`;
  });
  return `<span class="cost">${parts.join('') || '<span class="have">free</span>'}</span>`;
}

/* ---------------- tooltips ---------------- */

let tip: HTMLDivElement | null = null;

export function tooltip(el: HTMLElement, html: () => string): void {
  el.addEventListener('mouseenter', () => {
    // Touch screens have no hover; a tap would leave the tooltip stuck on screen.
    if (isTouch()) return;
    if (!tip) {
      tip = h('div', 'tooltip');
      document.body.appendChild(tip);
    }
    tip.innerHTML = html();
    tip.style.display = 'block';
  });
  el.addEventListener('mousemove', (e) => {
    if (!tip) return;
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    let x = e.clientX + 16, y = e.clientY + 16;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 12;
    if (y + hh > window.innerHeight - 8) y = e.clientY - hh - 12;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  });
  el.addEventListener('mouseleave', hideTip);
}

export function hideTip(): void {
  if (tip) tip.style.display = 'none';
}
