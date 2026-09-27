import { DEPTS, MODULES, STAFF } from '../game/defs';
import { efficiency, shift } from '../game/systems/crewlife';
import { troopTrainTime } from '../game/systems/troops';
import { esc, h } from './dom';
import type { PanelCtx } from './panels';

/**
 * Who's doing what aboard: every department, how many of its posts are filled, who's resting, how fed and rested
 * the crew are. People go to the guns first and the hangar last.
 */
export function renderStations(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const p = g.player;
  const s = shift(g);
  const l = g.life;
  const eff = efficiency(l);
  const food = p.cargo.count('rations');
  const net = s.growPerMin - s.eatPerMin;
  const head = h('div', 'stations-head', `
    <div class="st-big"><b>${p.troops}</b><small>aboard / ${p.stats.bunks} bunks</small></div>
    <div class="st-big"><b>${s.onDuty}</b><small>on duty / ${p.stats.crewWanted} posts</small></div>
    <div class="st-big ${s.resting < s.needRest ? 'bad' : 'good'}"><b>${s.resting}</b><small>resting (need ${s.needRest})</small></div>
    <div class="st-big ${food < 5 ? 'bad' : ''}"><b>${food}</b><small>rations · ${net >= 0 ? '+' : ''}${net.toFixed(1)}/min</small></div>
    <div class="st-big ${eff < 0.8 ? 'bad' : 'good'}"><b>${Math.round(eff * 100)}%</b><small>efficiency</small></div>`);
  ctx.body.appendChild(head);
  const bars = (k: number, label: string, col: string): string => `<div class="st-bar"><span>${label}</span><div><i style="width:${Math.round(k * 100)}%;background:${col}"></i></div></div>`;
  ctx.body.appendChild(h('div', 'st-life', bars(1 - l.fatigue, `Rested ${Math.round((1 - l.fatigue) * 100)}%`, '#80d8ff') + bars(1 - l.hunger, `Fed ${Math.round((1 - l.hunger) * 100)}%`, '#ffcc80')));
  const hints: string[] = [];
  if (p.troops < p.stats.crewWanted) hints.push(`<b class="bad">Short-handed:</b> ${p.stats.crewWanted - p.troops} posts empty. Stations at the bottom of the list go unmanned first.`);
  if (s.resting < s.needRest) hints.push('<b class="bad">No one to relieve the shift:</b> fatigue builds up. Build Living Quarters and fill them (they sign on over time, faster with Barracks or camped; or hire at the Mothership).');
  if (net < 0 && food < 30) hints.push('<b class="bad">Eating more than you grow:</b> build Hydroponics (and staff a Mess Hall), trade at the Mothership, or cook biomass.');
  if (p.troops < p.stats.bunks) hints.push(`A new crew member signs on every ${Math.ceil(troopTrainTime(g))}s while there are free bunks.`);
  if (g.weather.phase === 'active') hints.push('A storm drove the soldiers off the roof: the nests are empty until it passes.');
  if (hints.length) ctx.body.appendChild(h('div', 'hint', hints.join('<br>')));
  const grid = h('div', 'dept-grid');
  for (const d of DEPTS) {
    const [on, need] = p.stats.depts[d.key] ?? [0, 0];
    if (!need && d.key !== 'gunnery') continue;
    const k = need ? on / need : 1;
    const posts = p.modules
      .filter((m) => m.built && (d.key === 'gunnery' ? m.weapon && MODULES[m.key].hardpoint : d.key === 'roof' ? MODULES[m.key].nest : STAFF[m.key]?.[0] === d.key))
      .map((m) => `<span class="${m.crew < p.crewNeeded(m) ? 'bad' : ''}">${esc(MODULES[m.key].name)} ${m.crew}/${p.crewNeeded(m)}</span>`);
    if (d.key === 'works' && p.buildCrew) posts.push(`<span class="${p.builderStaff < p.buildCrew ? 'bad' : ''}">Builders ${p.builderStaff}/${p.buildCrew}</span>`);
    const card = h('div', 'dept-card', `<div class="dc-t" style="color:${d.color}">${d.icon} ${esc(d.name)} <b>${on}/${need}</b> <small>${esc(d.staff)}</small></div>
      <div class="dc-bar"><i style="width:${Math.round(k * 100)}%;background:${k >= 1 ? '#76ff03' : k > 0.5 ? '#ffd740' : '#ff5252'}"></i></div>
      <div class="dc-d">${esc(d.desc)}</div><div class="dc-posts">${posts.join('') || '<span class="d">No stations yet.</span>'}</div>`);
    grid.appendChild(card);
  }
  ctx.body.appendChild(grid);
}
