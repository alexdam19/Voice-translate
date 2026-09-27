import { TITAN_DECK_INFO } from '../game/defs';
import { shift } from '../game/systems/crewlife';
import {
  COMPARTMENTS, compName, crawlersUp, damageControl, damageState, FUEL_MAX, outsideTemp, SECTIONS, SYSTEMS, WATER_MAX, ZONES, zoneMult,
} from '../game/systems/titan';
import { esc, h } from './dom';
import type { PanelCtx } from './panels';

const pct = (v: number): string => `${Math.round(v * 100)}%`;

function bar(label: string, frac: number, color: string, value: string): string {
  return `<div class="br-bar"><span>${esc(label)}</span><div><i style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%;background:${color}"></i></div><b>${value}</b></div>`;
}

/**
 * The bridge status display: everything about the Titan at a glance. Hull and armour zones, the eight crawlers,
 * every subsystem's damage state, power, fuel, water, food, air and temperature, fires and flooding compartment by
 * compartment, and who's aboard.
 */
export function renderBridge(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const p = g.player;
  if (!p.titan) {
    ctx.body.appendChild(h('div', 'big-lock', 'The bridge status display needs a Titan Crawler hull.'));
    return;
  }
  const s = g.titan;
  const grid = h('div', 'bridge-grid');

  // Hull and armour.
  const hullFrac = p.hp / Math.max(1, p.stats.maxHp);
  let html = `<div class="br-t">HULL</div>${bar('Structure', hullFrac, hullFrac > 0.5 ? '#76ff03' : hullFrac > 0.25 ? '#ffd740' : '#ff1744', `${Math.round(p.hp)} / ${p.stats.maxHp}`)}`;
  if (p.stats.shield > 0) html += bar('Shields', p.shield / p.stats.shield, '#40c4ff', `${Math.round(p.shield)}`);
  html += '<div class="br-st">Armour zones</div>';
  for (const z of ZONES) {
    const v = s.zones[z.key];
    const st = damageState(v);
    html += bar(z.name, v, st.color, `${pct(v)}${v < 0.95 ? ` <small>+${Math.round((zoneMult(s, z.key) - 1) * 100)}% dmg</small>` : ''}`);
  }
  grid.appendChild(h('div', 'br-card', html));

  // Crawlers: a plan view, bow up.
  const [l, r] = crawlersUp(s);
  let cr = `<div class="br-t">CRAWLERS <small>${l + r}/8 driving</small></div><div class="br-crawlers"><div class="brc-side">`;
  const cell = (i: number): string => {
    const st = damageState(s.crawlers[i]);
    return `<div class="brc" style="border-color:${st.color}" title="${st.name}"><b>${i < 4 ? 'L' : 'R'}${(i % 4) + 1}</b><small>${pct(s.crawlers[i])}</small></div>`;
  };
  for (let i = 0; i < 4; i++) cr += cell(i);
  cr += '</div><div class="brc-hull">▲ BOW<br><br>THE<br>SPINE<br><br>STERN</div><div class="brc-side">';
  for (let i = 4; i < 8; i++) cr += cell(i);
  cr += '</div></div>';
  if (l !== r) cr += `<div class="hint">Fewer crawlers driving on the ${l < r ? 'left' : 'right'}: the hull pulls ${l < r ? 'left' : 'right'}.</div>`;
  grid.appendChild(h('div', 'br-card', cr));

  // Subsystems.
  let sys = '<div class="br-t">SYSTEMS</div>';
  for (const k of SYSTEMS) {
    const v = s.systems[k.key];
    const st = damageState(v);
    sys += `<div class="br-sys" title="${esc(k.desc)}"><span>${esc(k.name)}</span><div><i style="width:${Math.round(v * 100)}%;background:${st.color}"></i></div><b style="color:${st.color}">${st.name.toUpperCase()}</b></div>`;
  }
  sys += `<div class="d">Works crew on duty repair the worst damage first, for scrap (3x while camped). Damage control: ${damageControl(g).toFixed(1)} crews (Works on duty, plus off-shift hands).</div>`;
  grid.appendChild(h('div', 'br-card', sys));

  // Supplies.
  const food = p.cargo.count('rations');
  const out = outsideTemp(g);
  const temp = s.temp;
  let sup = '<div class="br-t">SUPPLIES &amp; ENVIRONMENT</div>';
  sup += bar('Power', p.stats.powerRatio, p.stats.powerRatio >= 1 ? '#76ff03' : '#ff9100', `${Math.round(p.stats.power)} / ${Math.round(p.stats.use)}`);
  sup += bar('Fuel', s.fuel / FUEL_MAX, s.fuel < FUEL_MAX * 0.15 ? '#ff1744' : '#ffb300', `${Math.round(s.fuel)} / ${FUEL_MAX}`);
  sup += bar('Water', s.water / WATER_MAX, s.water < WATER_MAX * 0.15 ? '#ff1744' : '#40c4ff', `${Math.round(s.water)} / ${WATER_MAX}`);
  sup += bar('Food', Math.min(1, food / 60), food < 5 ? '#ff1744' : '#a1887f', `${food} rations`);
  sup += bar('Oxygen', (s.oxygen - 0.12) / 0.09, s.oxygen < 0.18 ? '#ff1744' : '#80deea', `${(s.oxygen * 100).toFixed(1)}%`);
  sup += bar('Temperature', (temp + 20) / 70, temp < 8 || temp > 32 ? '#ff9100' : '#80deea', `${Math.round(temp)}°C <small>(outside ${Math.round(out)}°C)</small>`);
  grid.appendChild(h('div', 'br-card', sup));

  // Fires and flooding by compartment.
  let comp = '<div class="br-t">COMPARTMENTS</div><div class="br-comp"><div class="bcp-h"></div>';
  for (const sec of SECTIONS) comp += `<div class="bcp-h">${sec.toUpperCase()}</div>`;
  for (let deck = 1; deck <= 7; deck++) {
    const info = TITAN_DECK_INFO[deck];
    comp += `<div class="bcp-d" style="border-left-color:${info.color}">${esc(info.level)} ${esc(info.name)}</div>`;
    for (let sec = 0; sec < 3; sec++) {
      const i = (deck - 1) * 3 + sec;
      const f = s.fire[i], w = s.flood[i];
      const txt = f > 0 ? `🔥 ${pct(f)}` : w > 0.05 ? `💧 ${pct(w)}` : '·';
      comp += `<div class="bcp ${f > 0 ? 'fire' : w > 0.05 ? 'flood' : ''}" title="${esc(compName(i))}">${txt}</div>`;
    }
  }
  comp += '</div>';
  const fires = s.fire.filter((f) => f > 0).length, floods = s.flood.filter((f) => f > 0.05).length;
  comp += `<div class="d">${fires ? `${fires} compartment${fires > 1 ? 's' : ''} burning. ` : 'No fires. '}${floods ? `${floods} flooding (pumps need engineers and power).` : 'Dry.'} ${COMPARTMENTS} compartments.</div>`;
  grid.appendChild(h('div', 'br-card', comp));

  // Population.
  const sh = shift(g);
  let pop = '<div class="br-t">POPULATION</div>';
  pop += `<div class="br-pop"><div><b>${p.troops}</b><small>aboard / ${p.stats.bunks} bunks</small></div><div><b>${sh.onDuty}</b><small>on duty / ${p.stats.crewWanted} posts</small></div><div><b>${sh.resting}</b><small>off shift</small></div><div><b>${g.mainCrew().length}</b><small>officers</small></div></div>`;
  const damaged = SYSTEMS.filter((k) => s.systems[k.key] <= 0.8).map((k) => `${k.name} (${damageState(s.systems[k.key]).name})`);
  const lost = s.crawlers.map((v, i) => [v, i] as const).filter(([v]) => v <= 0.1).map(([, i]) => `Crawler ${i < 4 ? 'L' : 'R'}${(i % 4) + 1}`);
  pop += `<div class="br-st">Damaged systems</div><div class="${damaged.length + lost.length ? 'bad' : 'good'}">${[...damaged, ...lost].map(esc).join(', ') || 'None: all systems operational.'}</div>`;
  grid.appendChild(h('div', 'br-card', pop));

  ctx.body.appendChild(grid);
}
