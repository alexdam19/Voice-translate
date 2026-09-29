import { AIRSHIP_SPEED, contactHangar, etaText, flightEta, hangarPos, MAX_FLIGHTS, orderAirlift, refitCost, refitLevel, REFITS, SUPPLIES } from '../game/systems/airlift';
import { button, costHTML, esc, h } from './dom';
import type { PanelCtx } from './panels';

/**
 * The MEGA HANGAR radio: raise the Hangar once, then order the airlift. Supplies (crew, fuel, water, rations,
 * materials, weapon crates, card packs) and refits for the Titan (armour, guns, drive, shields, reactor, cargo,
 * quarters, treads: every track endless, every level dearer) go out on heavy cargo airships that fly to wherever
 * you are and lower the crates onto the deck. The flights board shows who's in the air and how long they'll be.
 */
export function renderHangar(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const p = g.player;
  const body = ctx.body;
  const al = g.airlift;
  const h0 = hangarPos(g);
  const dist = Math.hypot(p.x - h0.x, p.y - h0.y);
  const eta = etaText(dist / AIRSHIP_SPEED);
  if (!al.contact) {
    const box = h('div', 'hl-call');
    box.innerHTML = al.calling > 0
      ? `<div class="hl-radio on">📡</div><div><b>CALLING THE MEGA HANGAR...</b><p>Raising them on the long-range set (${Math.ceil(al.calling)}s).</p></div>`
      : `<div class="hl-radio">📡</div><div><b>THE MEGA HANGAR'S AIRLIFT</b><p>Heavy cargo airships fly out from the Hangar with whatever you order: fresh crew, fuel and water, materials, weapon crates, card packs, and refits for the Titan that never run out. Raise the Hangar on the radio to open the line.</p></div>`;
    if (al.calling <= 0) {
      box.appendChild(button('RAISE THE HANGAR', () => {
        const r = contactHangar(g);
        if (r) ctx.msg(r, false);
        ctx.rerender();
      }, 'primary big'));
    }
    body.appendChild(box);
    return;
  }
  const flying = g.flights.filter((f) => f.phase !== 'back').length;
  body.appendChild(h('div', 'hl-status', `<span>📡 Line open</span><span>Hangar ${dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`} away · a flight takes about <b>${eta}</b></span><span>Airships out: <b>${flying}/${MAX_FLIGHTS}</b></span><span>Scrap: <b>${p.cargo.count('scrap')}</b></span>`));
  const order = (item: Parameters<typeof orderAirlift>[1]): void => {
    const r = orderAirlift(g, item);
    if (r) ctx.msg(r, false);
    else ctx.msg('Order placed. Watch the sky.', true);
    ctx.rerender();
  };
  if (ctx.tab === 'refits') {
    body.appendChild(h('div', 'd', 'Every refit can be raised again and again; each level costs about 15% more. The wasteland keeps getting stronger, so keep refitting.'));
    const grid = h('div', 'hl-grid');
    for (const r of REFITS) {
      const pending = g.flights.filter((f) => f.cargo.some((c) => c.refit === r.key)).length;
      const lvl = refitLevel(g, r.key);
      const cost = refitCost(r.key, lvl + pending);
      const el = h('div', 'hl-item refit');
      el.innerHTML = `<div class="hl-ic">${r.icon}</div><div class="hl-n">${esc(r.name)} <small>Mk ${lvl}${pending ? ` (+${pending} inbound)` : ''}</small></div>
        <div class="hl-d">${esc(r.per)} per level · now ${esc(refitNow(r.key, lvl))}</div><div class="hl-c">${costHTML(cost, [p.cargo])}</div>`;
      el.appendChild(button(`ORDER MK ${lvl + pending + 1}`, () => order({ refit: r.key }), g.canPay(cost) && flying < MAX_FLIGHTS ? 'small primary' : 'small disabled'));
      grid.appendChild(el);
    }
    body.appendChild(grid);
    return;
  }
  if (ctx.tab === 'flights') {
    if (!g.flights.length) body.appendChild(h('div', 'd', 'Nothing in the air. Order supplies or a refit and an airship takes off from the Hangar.'));
    for (const f of g.flights) {
      const state = f.phase === 'out' ? `inbound · ${etaText(flightEta(g, f))}` : f.phase === 'drop' ? `over the deck, lowering crates · ${Math.ceil(f.t)}s` : 'returning to the Hangar';
      body.appendChild(h('div', `hl-flight ${f.phase}`, `<b>✈ ${esc(f.label)}</b><span>${esc(state)}</span>`));
    }
    return;
  }
  const grid = h('div', 'hl-grid');
  for (const s of SUPPLIES) {
    const el = h('div', 'hl-item');
    el.innerHTML = `<div class="hl-ic">${s.icon}</div><div class="hl-n">${esc(s.name)}</div><div class="hl-d">${esc(s.desc)}</div><div class="hl-c">${costHTML({ scrap: s.cost }, [p.cargo])}</div>`;
    el.appendChild(button('ORDER', () => order({ supply: s.key }), g.canPay({ scrap: s.cost }) && flying < MAX_FLIGHTS ? 'small primary' : 'small disabled'));
    grid.appendChild(el);
  }
  body.appendChild(grid);
}

/** What a refit track adds at its current level, in words. */
function refitNow(key: string, lvl: number): string {
  if (!lvl) return 'stock';
  switch (key) {
    case 'plating': return `+${lvl * 8}% hull`;
    case 'guns': return `+${lvl * 6}% damage`;
    case 'engines': return `+${lvl * 5}% top speed`;
    case 'shields': return `+${lvl * 10}% shield`;
    case 'reactor': return `+${lvl * 8}% power`;
    case 'cargo': return `+${lvl * 10}% cargo`;
    case 'quarters': return `+${lvl * 16} bunks`;
    case 'treads': return `+${lvl * 4}% turning`;
    default: return `Mk ${lvl}`;
  }
}
