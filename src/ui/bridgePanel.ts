import { mountDps, coverage } from '../game/analysis';
import { CREW_SCALE, DEPTS, TITAN_DECK_INFO } from '../game/defs';
import type { Game } from '../game/game';
import { crewSummary, dispatchTeam, jobName, maxTeams, needsTeam, openJobs, stabilize, teamOn, type TeamKind } from '../game/systems/crewops';
import { efficiency, shift } from '../game/systems/crewlife';
import {
  comfort, COMPARTMENTS, compName, crawlersUp, damageControl, damageState, FUEL_MAX, fuelBurn, outsideTemp, SECTIONS, sysMult, SYSTEMS, titanMods, WATER_MAX, waterRates, ZONES, zoneMult,
} from '../game/systems/titan';
import { TERRAIN, TRACTION } from '../shared/map';
import { esc, h } from './dom';
import type { PanelCtx } from './panels';

/**
 * SHIP VITALS: every number the Titan has, live. Hull and armour, the eight crawlers, the six subsystems, the drive
 * and power budget, life support with rates and time-to-empty, all 21 compartments, the crew down to the department,
 * and the fight. Anything broken has a SEND TEAM button: six people from the Barracks reserve (or off the watch)
 * walk there and fix it far faster than the damage-control rota. STABILIZE sends teams to the worst of it.
 */

const pct = (v: number, d = 0): string => `${(v * 100).toFixed(d)}%`;
const num = (v: number, d = 0): string => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const sign = (v: number, d = 1): string => `${v >= 0 ? '+' : '−'}${num(Math.abs(v), d)}`;
const mmss = (s: number): string => {
  if (!isFinite(s) || s > 359999) return '∞';
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

function bar(frac: number, color: string): string {
  return `<div class="vt-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%;background:${color}"></i></div>`;
}

function kv(rows: [string, string, string?][]): string {
  return `<table class="vt-kv">${rows.map(([k, v, c]) => `<tr><td>${esc(k)}</td><td${c ? ` style="color:${c}"` : ''}>${v}</td></tr>`).join('')}</table>`;
}

export function renderBridge(ctx: PanelCtx): void {
  const g = ctx.app.game;
  const p = g.player;
  if (!p.titan) {
    ctx.body.appendChild(h('div', 'big-lock', 'The vitals display needs a Titan Crawler hull.'));
    return;
  }
  const s = g.titan;
  const rerender = (): void => ctx.rerender();

  /** A SEND TEAM button (or the team's progress) for a job. */
  const teamBtn = (kind: TeamKind, key: string): HTMLElement => {
    const t = teamOn(g, kind, key);
    if (t) {
      const label = t.phase === 'going' ? `EN ROUTE ${Math.ceil(t.t)}s` : t.phase === 'working' ? `WORKING ${Math.round(t.done * 100)}%` : 'RETURNING';
      return h('span', `vt-team ${t.phase}`, `👷${t.n} ${label}`);
    }
    if (!needsTeam(g, kind, key)) return h('span', 'vt-ok', 'OK');
    const b = h('button', 'vt-send', 'SEND TEAM');
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const err = dispatchTeam(g, kind, key);
      if (err) ctx.app.hud.toast(err, '#ff8a80');
      else ctx.app.hud.toast(`Repair team dispatched: ${jobName(kind, key)}.`, '#b2ff59');
      rerender();
    });
    return b;
  };

  // Headline figures.
  const hpF = p.hp / Math.max(1, p.stats.maxHp);
  const burn = fuelBurn(g);
  const wr = waterRates(g);
  const net = wr.gain - wr.drink;
  const dps = p.weapons().reduce((a, m) => a + mountDps(m), 0);
  const eff = p.efficiency;
  const kpis: [string, string, string][] = [
    ['HULL', pct(hpF), hpF > 0.5 ? '#76ff03' : hpF > 0.25 ? '#ffd740' : '#ff1744'],
    ['SHIELD', p.stats.shield > 0 ? `${num(p.shield)}` : '—', g.helm.divert ? '#ff9100' : '#18ffff'],
    ['SPEED', `${num(Math.abs(p.speed) * 3.6)} km/h`, '#e6edf2'],
    ['FUEL ETA', mmss(s.fuel / Math.max(1e-6, burn)), s.fuel < FUEL_MAX * 0.15 ? '#ff1744' : '#ffb300'],
    ['WATER', net >= 0 ? `+${num(net * 60, 1)}/min` : mmss(s.water / -net), net >= 0 ? '#40c4ff' : s.water < WATER_MAX * 0.15 ? '#ff1744' : '#80d8ff'],
    ['CREW EFF', pct(eff), eff > 0.85 ? '#76ff03' : eff > 0.6 ? '#ffd740' : '#ff1744'],
    ['DPS', num(dps), '#ff7043'],
    ['THREAT', `×${g.escalation().toFixed(2)}`, '#ea80fc'],
  ];
  const top = h('div', 'vt-kpis');
  for (const [k, v, c] of kpis) top.appendChild(h('div', 'vt-kpi', `<small>${k}</small><b style="color:${c}">${v}</b>`));
  ctx.body.appendChild(top);

  // The action bar: stabilize, and who's free.
  const cs = crewSummary(g);
  const jobs = openJobs(g);
  const out = g.teams.filter((t) => t.phase !== 'back').length;
  const act = h('div', 'vt-act');
  const stab = h('button', `vt-stab ${jobs.length ? 'hot' : ''}`, jobs.length ? `⚠ STABILIZE (${jobs.length} issue${jobs.length > 1 ? 's' : ''})` : '✓ ALL SYSTEMS NOMINAL');
  stab.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!jobs.length) return;
    const n = stabilize(g);
    ctx.app.hud.toast(n ? `${n} repair team${n > 1 ? 's' : ''} dispatched to the worst damage.` : 'No teams free (all out, or nobody off watch). A Barracks keeps a reserve.', n ? '#b2ff59' : '#ff8a80');
    rerender();
  });
  act.appendChild(stab);
  act.appendChild(h('div', 'vt-actinfo', `TEAMS <b>${out}/${maxTeams(g)}</b> · RESERVE <b>${cs.reserves}/${cs.reserveCap}</b>${cs.reserveCap ? '' : ' <small>(build a Barracks)</small>'} · OFF WATCH <b>${cs.offWatch}</b> · AWAY <b>${cs.away}</b>`));
  ctx.body.appendChild(act);

  const grid = h('div', 'vt-grid');
  const card = (title: string, sub = ''): HTMLDivElement => {
    const c = h('div', 'vt-card', `<div class="vt-t">${title}${sub ? `<small>${sub}</small>` : ''}</div>`);
    grid.appendChild(c);
    return c;
  };
  /** A row: label, bar, figures, and the team button. */
  const row = (c: HTMLElement, label: string, frac: number, color: string, figs: string, kind?: TeamKind, key?: string): void => {
    const r = h('div', 'vt-row', `<span>${esc(label)}</span>${bar(frac, color)}<b>${figs}</b>`);
    r.appendChild(kind && key !== undefined ? teamBtn(kind, key) : h('span'));
    c.appendChild(r);
  };

  // Hull & armour.
  const hull = card('HULL & ARMOUR', `${num(p.stats.maxHp)} HP`);
  row(hull, 'Structure', hpF, hpF > 0.5 ? '#76ff03' : '#ff9100', `${num(p.hp)} · ${sign(p.stats.repair, 1)}/s`);
  if (p.stats.shield > 0) row(hull, g.helm.divert ? 'Shield (diverted)' : 'Shield', p.shield / p.stats.shield, g.helm.divert ? '#ff9100' : '#40c4ff', `${num(p.shield)}/${num(p.stats.shield)} · +${num(p.stats.shieldRegen, 1)}/s`);
  row(hull, 'Armour rating', p.stats.armor / 0.6, '#b0bec5', `${pct(p.stats.armor)} reduction`);
  for (const z of ZONES) {
    const v = s.zones[z.key];
    row(hull, z.name, v, damageState(v).color, `${pct(v, 1)} · ×${zoneMult(s, z.key).toFixed(2)} dmg`, 'zone', z.key);
  }

  // Crawlers.
  const [l, r] = crawlersUp(s);
  const tm = titanMods(s);
  const crawl = card('CRAWLERS', `${l + r}/8 DRIVING · DRIVE ×${Math.pow((l + r) / 8, 0.8).toFixed(2)} · PULL ${sign((tm.pull * 180) / Math.PI, 2)}°/s`);
  s.crawlers.forEach((v, i) => row(crawl, `${i < 4 ? 'L' : 'R'}${(i % 4) + 1} ${['fore', 'fwd-mid', 'aft-mid', 'aft'][i % 4]}`, v, damageState(v).color, `${pct(v, 1)} ${damageState(v).name.slice(0, 4).toUpperCase()}`, 'crawler', String(i)));

  // Systems.
  const sys = card('SUBSYSTEMS', `DAMAGE CONTROL ${damageControl(g).toFixed(2)} crews`);
  for (const k of SYSTEMS) {
    const v = s.systems[k.key];
    const st = damageState(v);
    row(sys, k.name, v, st.color, `${pct(v, 1)} · ×${sysMult(s, k.key).toFixed(2)} · D${TITAN_DECK_INFO[k.deck].level}`, 'system', k.key);
  }

  // Drive & power.
  const ter = g.map.terAt(p.x, p.y);
  const trac = TRACTION[p.drive]?.[ter] ?? 1;
  const hg = g.gen.hangar ?? g.gen.spawn;
  const drive = card('DRIVE & POWER', p.drive.toUpperCase());
  drive.insertAdjacentHTML('beforeend', kv([
    ['Speed', `${num(Math.abs(p.speed), 1)} m/s · ${num(Math.abs(p.speed) * 3.6)} km/h`],
    ['Top speed', `${num(p.stats.topSpeed, 1)} m/s · ${num(p.stats.topSpeed * 3.6)} km/h`],
    ['Throttle', `${sign(g.helm.lever * 100, 0)}%${g.helm.overdrive ? ' · OVERDRIVE' : ''}${g.warp > 1 ? ` · WARP ×${g.warp}` : ''}`, g.helm.overdrive ? '#ff9100' : undefined],
    ['Turn rate', `${num((p.stats.turnRate * 180) / Math.PI, 1)}°/s · steering ×${tm.steering.toFixed(2)}`],
    ['Traction', `×${trac.toFixed(2)} on ${TERRAIN[ter]?.name ?? '?'}`, trac < 0.6 ? '#ff9100' : undefined],
    ['Thrust / mass', `${num(p.stats.thrust, 1)} / ${num(p.stats.mass)} t`],
    ['Power', `${num(p.stats.power, 1)} gen / ${num(p.stats.use, 1)} use · ${pct(p.stats.powerRatio)}`, p.stats.powerRatio < 1 ? '#ff9100' : '#76ff03'],
    ['Fuel', `${num(s.fuel)} / ${FUEL_MAX} · −${num(burn * 60, 1)}/min`],
    ['Fuel to empty', mmss(s.fuel / Math.max(1e-6, burn)), s.fuel < FUEL_MAX * 0.15 ? '#ff1744' : undefined],
    ['Mega Hangar', `${num(Math.hypot(hg.x - p.x, hg.y - p.y) / 1000, 2)} km`],
  ]));

  // Life support.
  const sh = shift(g);
  const food = p.cargo.count('rations');
  const foodNet = sh.growPerMin - sh.eatPerMin;
  const life = card('LIFE SUPPORT', `COMFORT ${pct(comfort(g))}`);
  life.insertAdjacentHTML('beforeend', kv([
    ['Water', `${num(s.water)} / ${WATER_MAX} (${pct(s.water / WATER_MAX)})`],
    ['  condensers', `+${num(wr.gain * 60, 1)}/min`],
    ['  drinking', `−${num(wr.drink * 60, 1)}/min`],
    ['  net · to empty', `${sign(net * 60, 1)}/min · ${net >= 0 ? '—' : mmss(s.water / -net)}`, net < 0 && s.water < WATER_MAX * 0.2 ? '#ff1744' : undefined],
    ['Oxygen', `${(s.oxygen * 100).toFixed(2)}% (target 20.9%)`, s.oxygen < 0.18 ? '#ff1744' : undefined],
    ['Temperature', `${s.temp.toFixed(1)}°C in · ${num(outsideTemp(g))}°C out`, s.temp < 8 || s.temp > 32 ? '#ff9100' : undefined],
    ['Rations', `${food} · −${num(sh.eatPerMin, 2)} +${num(sh.growPerMin, 2)}/min`],
    ['  to empty', foodNet >= 0 ? '—' : mmss((food / -foodNet) * 60), food < 5 ? '#ff1744' : undefined],
    ['Fatigue · hunger', `${pct(g.life.fatigue)} · ${pct(g.life.hunger)}`, g.life.fatigue > 0.5 || g.life.hunger > 0.4 ? '#ff9100' : undefined],
    ['Crew efficiency', `${pct(efficiency(g.life))} × comfort ${pct(comfort(g))} = ${pct(eff)}`],
  ]));

  // Compartments.
  const comp = card('COMPARTMENTS', `${COMPARTMENTS} · TAP ONE TO SEND A TEAM`);
  const cg = h('div', 'vt-comp');
  cg.appendChild(h('div', 'vtc-h'));
  for (const sec of SECTIONS) cg.appendChild(h('div', 'vtc-h', sec.toUpperCase()));
  for (let deck = 1; deck <= 7; deck++) {
    const info = TITAN_DECK_INFO[deck];
    cg.appendChild(h('div', 'vtc-d', `<i style="background:${info.color}"></i>${esc(info.level)} ${esc(info.name)}`));
    for (let sec = 0; sec < 3; sec++) {
      const i = (deck - 1) * 3 + sec;
      const f = s.fire[i], w = s.flood[i];
      const kind: TeamKind | null = f > 0 ? 'fire' : w > 0.02 ? 'flood' : null;
      const t = kind ? teamOn(g, kind, String(i)) : undefined;
      const cell = h('div', `vtc ${f > 0 ? 'fire' : w > 0.02 ? 'flood' : ''} ${t ? 'team' : ''}`, f > 0 ? `🔥${pct(f)}` : w > 0.02 ? `💧${pct(w)}` : '·');
      cell.title = compName(i);
      if (t) cell.innerHTML += ' 👷';
      if (kind && !t) {
        cell.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const err = dispatchTeam(g, kind, String(i));
          ctx.app.hud.toast(err ?? `Team to ${compName(i)}.`, err ? '#ff8a80' : '#b2ff59');
          rerender();
        });
      }
      cg.appendChild(cell);
    }
  }
  comp.appendChild(cg);

  // Crew.
  const crew = card('CREW', `${cs.aboard} ABOARD · ${CREW_SCALE} PER TEAM`);
  crew.insertAdjacentHTML('beforeend', kv([
    ['Aboard / bunks', `${cs.aboard} / ${cs.bunks}`],
    ['On duty / posts', `${cs.onDuty} / ${cs.posts} (${pct(cs.posts ? cs.onDuty / cs.posts : 1)})`, cs.onDuty < cs.posts ? '#ff9100' : '#76ff03'],
    ['Off watch · resting', `${cs.offWatch} · need ${sh.needRest} to rotate`, cs.offWatch < sh.needRest ? '#ff9100' : undefined],
    ['Reserve (Barracks)', `${cs.reserves} / ${cs.reserveCap}`],
    ['Away on teams', `${cs.away}`],
    ['Officers', `${g.mainCrew().length} / ${g.crewCap()}`],
  ]));
  const dt = h('table', 'vt-depts');
  dt.innerHTML = `<tr><th></th><th>DEPT</th><th>ON</th><th>NEED</th><th>%</th></tr>${DEPTS.map((d) => {
    const v = p.stats.depts[d.key] ?? [0, 0];
    const f = v[1] ? v[0] / v[1] : 1;
    return v[1] ? `<tr><td>${d.icon}</td><td>${esc(d.name)}</td><td>${v[0]}</td><td>${v[1]}</td><td style="color:${f >= 1 ? '#76ff03' : f >= 0.5 ? '#ffd740' : '#ff1744'}">${pct(f)}</td></tr>` : '';
  }).join('')}`;
  crew.appendChild(dt);

  // Teams.
  const teams = card('REPAIR TEAMS', `${out}/${maxTeams(g)} OUT`);
  if (!g.teams.length) teams.appendChild(h('div', 'vt-dim', 'No teams out. SEND TEAM on anything damaged, or STABILIZE to send them to the worst of it.'));
  for (const t of g.teams) {
    const where = t.deck === 0 ? 'Roof' : `${TITAN_DECK_INFO[t.deck].level} ${TITAN_DECK_INFO[t.deck].name}`;
    const phase = t.phase === 'going' ? `walking, ${Math.ceil(t.t)}s` : t.phase === 'working' ? 'working' : `returning, ${Math.ceil(t.t)}s`;
    teams.appendChild(h('div', 'vt-trow', `<span>👷${t.n} ${esc(jobName(t.kind, t.key))}<small>${esc(where)} · ${phase}${t.reserve ? ` · ${t.reserve} reservists` : ''}</small></span>${bar(t.phase === 'going' ? 1 - t.t / t.walk : t.done, t.phase === 'back' ? '#607d8b' : '#b2ff59')}`));
  }

  // The fight.
  const cov = coverage(p);
  const kpm = g.stats.kills / Math.max(1, g.stats.time / 60);
  const fight = card('COMBAT', g.helm.safe ? 'MASTER ARM: SAFE' : 'WEAPONS FREE');
  fight.insertAdjacentHTML('beforeend', kv([
    ['Mounts armed', `${p.weapons().length}`],
    ['Total DPS', `${num(dps)} · fire control ×${tm.weapons.toFixed(2)}`],
    ['Coverage min / max', `${num(Math.min(...cov))} / ${num(Math.max(...cov))} DPS`],
    ['Kills · per minute', `${num(g.stats.kills)} · ${num(kpm, 1)}`],
    ['Enemy strength', `×${g.escalation().toFixed(3)} (+1.5%/min, +6%/horde)`, '#ea80fc'],
    ['Horde', `#${g.wave.n} · ${g.wave.phase.toUpperCase()}${g.wave.phase === 'calm' ? ` · next in ${mmss(g.wave.t)}` : ''}`, g.wave.phase !== 'calm' ? '#ff1744' : undefined],
    ['Time survived', mmss(g.stats.time)],
  ]));

  ctx.body.appendChild(grid);
  void jobs;
}

/** For the HUD alert chip: how many things need a team. */
export function issueCount(g: Game): number {
  return openJobs(g).length;
}
