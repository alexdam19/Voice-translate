import { bounties, type BountyStatus } from '../game/campaign';
import { trackPart, untrack } from '../game/actions';
import { ENEMIES } from '../game/enemyDefs';
import { archFor, creatureSprite, lookFor } from '../render/px/creatures2d';
import { ZONES } from '../shared/zones';
import { button, esc, h } from './dom';
import type { PanelCtx } from './panels';

/**
 * The BOUNTY board: the six Mothership parts (Crater cores, not the Mega Hangar's airlift refits), each with a
 * portrait of whoever holds it, where its stronghold is (zone, distance and bearing), its threat, what the part
 * does once installed, and what to do next. TRACK puts the marker on it.
 */

const STATUS: Record<BountyStatus, [string, string]> = {
  hunt: ['WANTED', '#ff4060'],
  dropped: ['DROPPED', '#ffd740'],
  carrying: ['IN HOLD', '#18ffff'],
  installed: ['INSTALLED', '#76ff03'],
};

const km = (m: number): string => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export function renderBounty(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const list = bounties(g);
  const done = list.filter((b) => b.status === 'installed').length;
  // The next one the campaign wants (the first not installed).
  const next = list.find((b) => b.status !== 'installed');
  ctx.body.appendChild(h('div', 'bn-head', `<b>${done}/6</b> Mothership parts installed · each is a <i>Crater core</i> held by a stronghold master: destroy it, pick up the core it drops, bring it home to the Mega Hangar SHIPYARD.`));
  const grid = h('div', 'bn-grid');
  list.forEach((b, i) => {
    const [label, col] = STATUS[b.status];
    const tracked = g.tracked?.kind === 'part' && g.tracked.key === b.part.key;
    const card = h('div', `bn-card ${b.status} ${b === next ? 'next' : ''} ${tracked ? 'tracked' : ''}`);
    // Portrait: the boss as it looks in the field, on a neon grid.
    const pic = h('div', 'bn-pic');
    const def = ENEMIES[b.bossKind];
    try {
      const cv = creatureSprite(archFor(b.bossKind, def?.arch), def?.color ?? '#9e9e9e', 72, 0, 'boss', lookFor(b.bossKind, def?.faction));
      cv.className = 'bn-cv';
      pic.appendChild(cv);
    } catch {
      pic.textContent = '☠';
    }
    if (b.status === 'installed' || b.status === 'carrying' || b.status === 'dropped') pic.appendChild(h('div', 'bn-x', b.status === 'installed' ? '✓' : '✕'));
    card.appendChild(pic);
    const zone = ZONES[b.zone]?.name ?? '';
    const info = h('div', 'bn-info', `
      <div class="bn-top"><span class="bn-n">#${i + 1}</span><span class="bn-st" style="color:${col};border-color:${col}">${label}</span>${b === next ? '<span class="bn-next">NEXT</span>' : ''}</div>
      <div class="bn-item">${esc(b.item)}</div>
      <div class="bn-boss">Held by <b>${esc(b.bossName)}</b> <small>${esc(b.faction)} · ${b.hp ? `${Math.round(b.hp).toLocaleString()} HP` : ''}</small></div>
      <div class="bn-where">📍 ${esc(b.place)} <small>${esc(zone)}</small> · <b>${km(b.dist)}</b> ${b.bearing} · threat ${b.threat.toFixed(1)}</div>
      <div class="bn-gives">⚙ ${esc(b.reward)}</div>
      <div class="bn-todo">${esc(b.todo)}</div>`);
    card.appendChild(info);
    if (b.status !== 'installed') {
      const row = h('div', 'bn-act');
      row.appendChild(button(tracked ? 'TRACKING ✓' : 'TRACK', () => {
        if (tracked) untrack(g);
        else {
          const r = trackPart(g, b.part.key);
          ctx.msg(r.msg ?? '', r.ok);
        }
        ctx.rerender();
      }, tracked ? 'good' : 'primary'));
      card.appendChild(row);
    }
    grid.appendChild(card);
  });
  ctx.body.appendChild(grid);
  ctx.body.appendChild(h('p', 'bn-foot', 'Not the same as the HANGAR airlift: the airlift sells refits for scrap; these six parts only come from killing their holders. The last core sits under the Crater Guardian at the bottom of the Divot.'));
}
