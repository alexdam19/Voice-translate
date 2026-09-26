import type { App } from '../app';
import { buildBlock, cancelBuild, countOf, placeBuilding, removeModule, trackBuild, trackUpgrade, upgradeBlock, upgradeBuilding, upgradeCostOf } from '../game/actions';
import { buildLimit, buildTime, CATEGORIES, CC_COMMANDER_LEVEL, chassisForCC, levelMult, levelTime, maxModuleLevel, MODULE_LIST, MODULES, type ModuleCat, type ModuleDef } from '../game/defs';
import type { Game } from '../game/game';
import { SQUADS, squadSize, type SquadType } from '../game/squads';
import { jobFor } from '../game/systems/builds';
import { setSquadOrder, squadStatus, squadUnits } from '../game/systems/squads';
import { WEAPONS } from '../shared/weapons';
import { moduleIcon, weaponIcon } from '../render/icons';
import { selectArsenalHardpoint, selectArsenalWeapon, starsHTML } from './arsenalPanel';
import { button, costHTML, esc, h, hideTip, tooltip } from './dom';

export function fmtTime(s: number): string {
  s = Math.ceil(s);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
}

/** One-line stats for a building at a level. */
export function moduleStats(d: ModuleDef, lvl = 1): string {
  const f = levelMult(lvl);
  const n = (v: number): string => String(Math.round(v * f * 10) / 10);
  const s: string[] = [];
  if (d.required) s.push(`fortress: ${chassisForCC(lvl).name} (${chassisForCC(lvl).cols}×${chassisForCC(lvl).rows})`);
  if (d.power) s.push(`+${n(d.power)} power`);
  if (d.use) s.push(`uses ${d.use} power`);
  if (d.thrust) s.push(`+${n(d.thrust)} thrust`);
  if (d.crew) s.push(`+${d.crew + lvl - 1} bunks`);
  if (d.cargo) s.push(`+${Math.round(d.cargo * f)} cargo`);
  if (d.hp) s.push(`+${n(d.hp)} hull`);
  if (d.armor) s.push(`+${Math.round(d.armor * f * 1000) / 10}% armor`);
  if (d.shield) s.push(`+${n(d.shield)} shield`);
  if (d.repair) s.push(`+${n(d.repair)} repair/s`);
  if (d.vision) s.push(`+${n(d.vision)} vision`);
  if (d.drill) s.push(`drill tier ${d.drill}`);
  if (d.protects) s.push(`protects: ${d.protects.join(', ')}`);
  if (d.hardpoint) s.push(`mounts 1 ${d.hardpoint} weapon · +${Math.round(15 * (lvl - 1))}% damage`);
  if (d.cards) s.push(`+${Math.round(d.cards * lvl * 100)}% card power, +${Math.round(d.cards * lvl * 200)}% energy regen`);
  if (d.forge) s.push(`forge speed ×${f.toFixed(2)}`);
  if (d.training) s.push(`+${n(d.training)} crew XP/s`);
  if (d.sanctum) s.push(`arcane weapons +${10 * lvl}% damage`);
  if (d.depot) s.push(`+${Math.round(d.depot * f * 100)}% fire rate (ballistic/artillery/missile)`);
  if (d.food) s.push(`grows rations`);
  if (d.squad) {
    const sq = SQUADS[d.squad as SquadType];
    s.push(`${sq.name}: ${squadSize(sq, lvl)} units`);
  }
  return s.join(' · ');
}

const CAT_HINT: Record<ModuleCat, string> = {
  weapon: 'Turret mounts carry the guns. Put them near the edges.',
  defense: 'Armor, repairs and shields keep your facility alive.',
  army: 'Army buildings train squads that fight, guard and scavenge for you.',
  crew: 'Bunks for crew, and places that heal and train them.',
  resource: 'Storage, drills and the refinery.',
  power: 'Reactors power buildings; engines move a heavier fortress faster.',
  special: 'Workshops, the Card Lab, the Forge and more.',
  utility: 'Gear that lets you survive the harsher zones.',
  command: '',
};

/**
 * The base, run like a village: tap a building to see it, upgrade it, track what it needs, or move it;
 * the SHOP places new buildings; builders work on one job each, in real time.
 */
export class VillageUI {
  root: HTMLDivElement;
  private top = h('div', 'v-top');
  private card = h('div', 'v-card');
  private shopBtn = h('div', 'v-shop-btn', '<b>SHOP</b><small>new buildings</small>');
  private shop = h('div', 'v-shop');
  private placeHint = h('div', 'v-place');
  active = false;
  selected = 0;
  /** Building key being placed from the shop, or module id being moved. */
  placing = '';
  moving = 0;
  /** Touch placement is two taps: the first previews the spot here, the second (or PLACE) builds. */
  pending: [number, number] | null = null;
  private cat: ModuleCat = 'weapon';
  private cardKey = '';
  private topKey = '';

  constructor(parent: HTMLElement, private app: App) {
    this.root = h('div', 'village');
    this.root.append(this.top, this.card, this.shopBtn, this.shop, this.placeHint);
    // Under the HUD, so toasts and the level-up banner stay on top of the shop.
    parent.insertBefore(this.root, parent.firstChild);
    this.shopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleShop();
    });
    for (const el of [this.top, this.card, this.shop, this.shopBtn, this.placeHint]) el.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  private get touch(): boolean {
    return this.app.input.touchMode;
  }

  get game(): Game {
    return this.app.game;
  }

  enter(): void {
    this.active = true;
    this.root.style.display = 'block';
    this.shop.style.display = 'none';
    this.cardKey = '';
    this.topKey = '';
  }

  exit(): void {
    this.active = false;
    this.cancelPlace();
    this.selected = 0;
    this.root.style.display = 'none';
    hideTip();
  }

  get shopOpen(): boolean {
    return this.shop.style.display === 'flex';
  }

  cancelPlace(): boolean {
    const was = !!this.placing || !!this.moving;
    this.placing = '';
    this.moving = 0;
    this.pending = null;
    this.placeHint.style.display = 'none';
    this.root.classList.remove('placing');
    return was;
  }

  select(id: number): void {
    this.selected = id;
    this.cardKey = '';
    this.shop.style.display = 'none';
  }

  toggleShop(open?: boolean): void {
    const show = open ?? this.shop.style.display !== 'flex';
    this.cancelPlace();
    this.shop.style.display = show ? 'flex' : 'none';
    if (show) {
      this.selected = 0;
      this.renderShop();
    }
    this.app.sound('ui');
  }

  startPlace(key: string): void {
    this.placing = key;
    this.moving = 0;
    this.pending = null;
    this.shop.style.display = 'none';
    this.selected = 0;
    this.renderPlaceHint();
  }

  startMove(id: number): void {
    this.moving = id;
    this.placing = '';
    this.pending = null;
    this.renderPlaceHint();
  }

  /** The strip under the top bar while placing or moving: what to do, plus PLACE / CANCEL buttons. */
  private renderPlaceHint(): void {
    const key = this.placing || this.game.player.moduleById(this.moving)?.key;
    if (!key) return;
    const verb = this.placing ? 'Placing' : 'Moving';
    const g = this.pending ? this.ghost(this.pending) : null;
    const what = this.touch
      ? this.pending ? (g?.ok ? `tap PLACE (or the same spot again) to ${this.placing ? 'build' : 'move it'} here` : "<span class=\"bad\">doesn't fit there</span>: tap another spot") : 'tap a spot on your fortress to preview it'
      : `click a green spot on your fortress · right-click or Esc to cancel`;
    this.placeHint.style.display = 'flex';
    this.root.classList.add('placing');
    this.placeHint.innerHTML = `<span>${verb} <b>${esc(MODULES[key].name)}</b>: ${what}</span>`;
    if (this.pending && g?.ok) this.placeHint.appendChild(button('PLACE', () => this.click(this.pending![0], this.pending![1], true), 'primary'));
    this.placeHint.appendChild(button('CANCEL', () => this.cancelPlace(), 'small'));
  }

  /** A deck cell was clicked (tapped). */
  click(cx: number, cy: number, confirm = false): void {
    const g = this.game;
    const p = g.player;
    if ((this.placing || this.moving) && this.touch && !confirm) {
      // First tap previews; tapping inside the preview again confirms.
      const gh = this.pending ? this.ghost(this.pending) : null;
      const d = gh ? MODULES[gh.key] : null;
      const inside = gh && d && cx >= gh.cx && cy >= gh.cy && cx < gh.cx + d.w && cy < gh.cy + d.h;
      if (!inside || !gh?.ok) {
        this.pending = [cx, cy];
        this.renderPlaceHint();
        this.app.sound('ui');
        return;
      }
      [cx, cy] = this.pending!;
    }
    this.pending = null;
    if (this.placing) {
      const d = MODULES[this.placing];
      const ox = cx - Math.floor((d.w - 1) / 2), oy = cy - Math.floor((d.h - 1) / 2);
      const r = placeBuilding(g, this.placing, ox, oy);
      if (r.ok) {
        const m = p.modules[p.modules.length - 1];
        this.app.hud.toast(r.msg ?? '', '#76ff03');
        this.app.sound('build');
        // Keep placing walls and plates; everything else goes back to normal.
        if (d.w * d.h > 1 || buildBlock(g, this.placing)) {
          this.cancelPlace();
          this.select(m.id);
        }
      } else {
        this.app.hud.toast(r.msg, '#ff8a80');
        this.app.sound('error');
      }
      // Walls and plates keep placing.
      if (this.placing) this.renderPlaceHint();
      return;
    }
    if (this.moving) {
      const m = p.moduleById(this.moving);
      if (m) {
        const d = MODULES[m.key];
        const ox = cx - Math.floor((d.w - 1) / 2), oy = cy - Math.floor((d.h - 1) / 2);
        if (p.moveModule(m.id, ox, oy)) {
          this.app.sound('build');
          this.cancelPlace();
          this.select(m.id);
        } else {
          this.app.hud.toast("Doesn't fit there.", '#ff8a80');
          this.app.sound('error');
          this.renderPlaceHint();
        }
      }
      return;
    }
    const m = p.moduleAtCell(cx, cy);
    this.select(m ? m.id : 0);
    if (m) this.app.sound('ui');
  }

  /** Ghost for placing/moving at the hovered cell. */
  ghost(cell: [number, number] | null): { key: string; cx: number; cy: number; ok: boolean } | null {
    if (this.pending) cell = this.pending;
    if (!cell) return null;
    const p = this.game.player;
    const key = this.placing || (this.moving ? p.moduleById(this.moving)?.key : '');
    if (!key) return null;
    const d = MODULES[key];
    const cx = cell[0] - Math.floor((d.w - 1) / 2), cy = cell[1] - Math.floor((d.h - 1) / 2);
    return { key, cx, cy, ok: p.canPlace(key, cx, cy, this.moving || -1) };
  }

  update(): void {
    if (!this.active) return;
    const g = this.game;
    const p = g.player;
    const danger = g.enemies.some((e) => e.aggro && e.hp > 0 && p.edgeDist(e.x, e.y) < 16) || g.tanks.some((t) => !t.dead && t.team === 'enemy' && Math.hypot(t.x - p.x, t.y - p.y) < 40);
    const busy = g.builds.length;
    const topKey = `${p.chassis}:${p.stats.cc}:${busy}:${g.builders()}:${danger}`;
    if (topKey !== this.topKey) {
      this.topKey = topKey;
      const ch = chassisForCC(p.stats.cc);
      this.top.innerHTML = `<div class="vt-title">YOUR BASE <small>${esc(ch.name)} · Command Center L${p.stats.cc} · ${p.cols}×${p.rows} deck</small></div>
        <div class="vt-builders" title="Each builder works on one building at a time">🔨 Builders <b>${g.builders() - busy}/${g.builders()}</b> free</div>
        ${danger ? '<div class="vt-danger">⚠ UNDER ATTACK</div>' : ''}`;
      const exit = button('EXIT BASE (B)', () => this.app.setVillage(false), 'primary');
      this.top.appendChild(exit);
    }
    this.renderCard();
  }

  /* ---------------- building card ---------------- */

  private renderCard(): void {
    const g = this.game;
    const p = g.player;
    const m = this.selected ? p.moduleById(this.selected) : undefined;
    if (!m) {
      this.selected = 0;
      if (this.cardKey !== 'none') {
        this.cardKey = 'none';
        this.card.innerHTML = '<div class="vc-empty">Tap a building to see it and upgrade it. Tap <b>SHOP</b> for new buildings.</div>';
      }
      return;
    }
    const job = jobFor(g, m.id);
    const cost = upgradeCostOf(g, m.id);
    const key = `${m.id}:${m.lvl}:${m.built}:${job ? Math.floor(job.t) : -1}:${g.canPay(cost)}:${upgradeBlock(g, m.id)}:${m.weapon?.uid ?? 0}:${m.weapon?.rarity ?? 0}:${g.tracked?.kind === 'upgrade' && g.tracked.modId === m.id}:${squadKey(g, m.key)}`;
    if (key === this.cardKey) return;
    this.cardKey = key;
    const d = MODULES[m.key];
    this.card.innerHTML = '';
    const head = h('div', 'vc-head', `<img src="${moduleIcon(m.key)}"><div><div class="vc-name">${esc(d.name)} <span class="vc-lvl">Level ${m.lvl}${m.built ? '' : ' · under construction'}</span></div><div class="vc-desc">${esc(d.desc)}</div><div class="vc-stats">${moduleStats(d, m.lvl)}</div></div>`);
    this.card.appendChild(head);
    const row = h('div', 'vc-row');
    if (job) {
      const pct = job.t / job.total;
      row.appendChild(h('div', 'vc-job', `<div>${job.kind === 'build' ? 'Building' : `Upgrading to level ${job.to}`} · ${fmtTime(job.total - job.t)} left</div><div class="bar"><div style="width:${pct * 100}%"></div></div>`));
      row.appendChild(button('Cancel', () => {
        const r = cancelBuild(g, m.id);
        this.app.hud.toast(r.msg ?? '', r.ok ? '#bdbdbd' : '#ff8a80');
        if (!p.moduleById(m.id)) this.select(0);
        this.cardKey = '';
      }, 'small'));
    } else if (m.lvl < maxModuleLevel(d)) {
      const block = upgradeBlock(g, m.id);
      const hard = block && !/builders are busy/i.test(block);
      const afford = g.canPay(cost);
      const up = h('div', 'vc-up');
      up.innerHTML = `<div class="vc-next">Level ${m.lvl + 1}: <small>${moduleStats(d, m.lvl + 1)}</small></div><div>${costHTML(cost, [p.cargo])} <span class="d">⏱ ${fmtTime(levelTime(d, m.lvl))}</span></div>${block ? `<div class="bad">${esc(block)}</div>` : ''}`;
      row.appendChild(up);
      const b = button(`UPGRADE`, () => {
        const r = upgradeBuilding(g, m.id);
        this.app.hud.toast(r.msg ?? '', r.ok ? '#76ff03' : '#ff8a80');
        this.app.sound(r.ok ? 'build' : 'error');
        this.cardKey = '';
      }, block || !afford ? 'disabled big' : 'primary big');
      row.appendChild(b);
      if (hard || !afford) {
        const tracked = g.tracked?.kind === 'upgrade' && g.tracked.modId === m.id;
        row.appendChild(button(tracked ? '✔ TRACKING' : '◎ TRACK', () => {
          const r = trackUpgrade(g, m.id);
          this.app.hud.toast(r.msg ?? '', '#ffd740');
          this.cardKey = '';
        }, tracked ? 'on' : 'track'));
      }
    } else row.appendChild(h('div', 'good', 'MAX LEVEL'));
    this.card.appendChild(row);
    // What this building does, one tap away.
    const fn = h('div', 'vc-fn');
    const open = (label: string, panel: string, tab?: string, before?: () => void): void => {
      fn.appendChild(button(label, () => {
        before?.();
        this.app.panels.open(panel, tab);
      }));
    };
    if (d.hardpoint) {
      const w = m.weapon;
      fn.appendChild(h('div', 'vc-wpn', w ? `<img src="${weaponIcon(w.key, w.rarity)}"><span>${esc(WEAPONS[w.key].name)} ${starsHTML(w)}</span>` : `<i>No weapon mounted</i>`));
      open(w ? 'WEAPON' : 'MOUNT A WEAPON', 'arsenal', 'weapons', () => (w ? selectArsenalWeapon(w.uid) : selectArsenalHardpoint(m.id)));
    }
    if (d.refinery || d.workshop || d.sanctum) open('CRAFT', 'cargo', 'workshop');
    if (d.workshop) open('BUILD WEAPONS', 'arsenal', 'codex');
    if (d.forge) open('FORGE', 'arsenal', 'weapons');
    if (d.cards) open('CARDS', 'cards');
    if (d.crew || d.medbay || d.training) open('CREW', 'crew');
    if (d.crew && m.key === 'barracks') open('RECRUIT', 'crew', 'recruit');
    if (d.garage && g.outriderUnlocked()) open('OUTRIDER', 'crew', 'outrider');
    if (d.required) {
      open('DRIVE TRAIN', 'drive');
      const next = CC_COMMANDER_LEVEL[m.lvl];
      if (next) fn.appendChild(h('div', 'd', `Next: ${esc(chassisForCC(m.lvl + 1).name)} (${chassisForCC(m.lvl + 1).cols}×${chassisForCC(m.lvl + 1).rows}), needs commander level ${next}. Every other building is capped at the Command Center's level.`));
    }
    if (d.squad && m.built) {
      const type = d.squad as SquadType;
      const sq = g.squads[type];
      const def = SQUADS[type];
      const alive = squadUnits(g, type).length;
      fn.appendChild(h('div', 'vc-squad', `<b style="color:${def.color}">${esc(def.name)}</b> ${alive}/${squadSize(def, m.lvl)} · ${esc(squadStatus(g, type))}<div class="d">${esc(def.desc)}</div>`));
      if (sq) {
        fn.appendChild(button('FOLLOW', () => {
          setSquadOrder(g, type, 'follow');
          this.cardKey = '';
        }, sq.order === 'follow' ? 'on small' : 'small'));
        if (def.canScavenge) fn.appendChild(button('SCAVENGE', () => {
          setSquadOrder(g, type, 'scavenge');
          this.cardKey = '';
        }, sq.order === 'scavenge' ? 'on small' : 'small'));
        fn.appendChild(h('div', 'd', 'To guard a spot: leave the base and drag the squad badge (right side) onto the map.'));
      }
    }
    if (!d.required && !job) {
      fn.appendChild(button('MOVE', () => this.startMove(m.id), 'small'));
      fn.appendChild(button('REMOVE', () => this.app.panels.confirm(`Remove ${d.name}?`, 'You get half its build cost back.', 'Remove', () => {
        const r = removeModule(g, m.id);
        this.app.hud.toast(r.msg ?? '', r.ok ? '#bdbdbd' : '#ff8a80');
        if (r.ok) this.select(0);
      }), 'small danger'));
    }
    if (fn.children.length) this.card.appendChild(fn);
  }

  /* ---------------- shop ---------------- */

  renderShop(): void {
    const g = this.game;
    const p = g.player;
    this.shop.innerHTML = '';
    const head = h('div', 'vs-head', `<b>SHOP</b> <small>Builders free: ${g.freeBuilders()}/${g.builders()} · Command Center L${p.stats.cc}</small>`);
    head.appendChild(button('✕', () => this.toggleShop(false), 'close'));
    this.shop.appendChild(head);
    const tabs = h('div', 'vs-tabs');
    for (const c of CATEGORIES) {
      if (c.key === 'command') continue;
      const has = MODULE_LIST.some((d) => d.cat === c.key && (d.unlock ?? 1) <= g.commander.level);
      tabs.appendChild(button(c.name, () => {
        this.cat = c.key;
        this.renderShop();
      }, `tab ${this.cat === c.key ? 'on' : ''} ${has ? '' : 'dim'}`));
    }
    this.shop.appendChild(tabs);
    if (CAT_HINT[this.cat]) this.shop.appendChild(h('div', 'd', CAT_HINT[this.cat]));
    const grid = h('div', 'vs-grid');
    const list = MODULE_LIST.filter((d) => d.cat === this.cat && !d.required).sort((a, b) => (a.unlock ?? 1) - (b.unlock ?? 1));
    for (const d of list) {
      const locked = (d.unlock ?? 1) > g.commander.level;
      const lim = buildLimit(d, p.stats.cc);
      const have = countOf(g, d.key);
      const block = buildBlock(g, d.key);
      const afford = g.canPay(d.cost);
      const el = h('div', `vs-item ${locked ? 'locked' : block ? 'blocked' : afford ? '' : 'poor'}`);
      el.innerHTML = `<img src="${moduleIcon(d.key)}"><div class="vs-name">${esc(d.name)}</div>
        <div class="vs-meta">${d.w}×${d.h} · ⏱ ${fmtTime(buildTime(d))} · ${locked ? '' : `${have}/${lim === 99 ? '∞' : lim}`}</div>
        ${locked ? `<div class="vs-lock">🔒 Commander level ${d.unlock}</div>` : `<div>${costHTML(d.cost, [p.cargo])}</div>`}
        ${!locked && block ? `<div class="vs-why">${esc(block)}</div>` : ''}`;
      tooltip(el, () => `<h4>${esc(d.name)}</h4><div>${esc(d.desc)}</div><div class="d">${moduleStats(d, 1)}</div>`);
      if (!locked && !block) {
        el.addEventListener('click', () => {
          if (!g.canPay(d.cost)) {
            this.app.hud.toast('Not enough materials. Tap TRACK to find them.', '#ff8a80');
            this.app.sound('error');
            return;
          }
          hideTip();
          this.startPlace(d.key);
        });
      }
      if (!locked && (!afford || (block && /Command Center/.test(block)))) {
        const tb = button(g.tracked?.kind === 'build' && g.tracked.key === d.key ? '✔ TRACKING' : '◎ TRACK', () => {
          const r = trackBuild(g, d.key);
          this.app.hud.toast(r.msg ?? '', '#ffd740');
          this.renderShop();
        }, 'small track');
        el.appendChild(tb);
      }
      grid.appendChild(el);
    }
    this.shop.appendChild(grid);
  }
}

function squadKey(g: Game, key: string): string {
  const t = MODULES[key]?.squad as SquadType | undefined;
  if (!t) return '';
  const sq = g.squads[t];
  return `${sq?.order ?? ''}:${squadUnits(g, t).length}:${squadStatus(g, t)}`;
}
