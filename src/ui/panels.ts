import type { App } from '../app';
import { saveGame, clearSave } from '../game/save';
import { orderMove } from '../game/systems/orders';
import { ZONES } from '../shared/zones';
import { ZONE } from '../shared/map';
import { DRIVE_INFO } from '../game/defs';
import { button, esc, h, hideTip } from './dom';
import { renderBase } from './basePanel';
import { renderCrew } from './crewPanel';
import { renderTech } from './techPanel';
import { renderCargo } from './cargoPanel';
import { renderArsenal } from './arsenalPanel';
import { renderAbilities } from './abilitiesPanel';

const SWITCH: [string, string][] = [
  ['base', 'BASE · tank (B)'], ['arsenal', 'ARSENAL · weapons (V)'], ['crew', 'CREW · people (C)'], ['tech', 'RESEARCH (T)'], ['abilities', 'ABILITIES (K)'],
];

export interface PanelCtx {
  app: App;
  body: HTMLElement;
  tab: string;
  setTab(t: string): void;
  rerender(): void;
  msg(text: string, ok?: boolean): void;
}

interface PanelDef {
  title: string;
  sub: string;
  tabs?: [string, string][];
  render: (ctx: PanelCtx) => void;
  wide?: boolean;
  cls?: string;
}

export class Panels {
  root: HTMLDivElement;
  private win: HTMLDivElement;
  private current: string | null = null;
  private tab = '';
  private defs: Record<string, PanelDef>;
  private modal: HTMLDivElement;
  private msgEl: HTMLDivElement;
  pauses = true;

  constructor(parent: HTMLElement, private app: App) {
    this.root = h('div', 'panel-backdrop');
    this.win = h('div', 'panel');
    this.root.appendChild(this.win);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    parent.appendChild(this.root);
    this.modal = h('div', 'modal-backdrop');
    parent.appendChild(this.modal);
    this.msgEl = h('div', 'panel-msg');
    this.defs = {
      base: {
        title: 'BASE', sub: 'Upgrade your TANK: facilities, labs, weapons, actives, ultimates, hull and drive. Click a facility to level it up.',
        tabs: [['deck', 'Deck & Build'], ['chassis', 'Chassis & Drive']], render: renderBase, wide: true, cls: 'base',
      },
      arsenal: {
        title: 'ARSENAL', sub: 'Your weapons: forge them from 1★ to 6★, spend star points in each weapon\'s upgrade tree, mount and build them.',
        tabs: [['weapons', 'My Weapons'], ['codex', 'Codex & Workshop']], render: renderArsenal, wide: true, cls: 'arsenal',
      },
      crew: {
        title: 'CREW', sub: 'Upgrade your PEOPLE: officers with abilities, perks, recruits and the Outrider. Max 15 aboard the fortress.',
        tabs: [['officers', 'Officers (Q E F G Z X)'], ['roster', 'Roster'], ['recruit', 'Recruit'], ['outrider', 'Outrider']], render: renderCrew, wide: true, cls: 'crew',
      },
      tech: {
        title: 'RESEARCH', sub: 'Timed research. MILITARY unlocks gear and upgrades; PERSONNEL (needs a Science Lab) upgrades your crew. One project of each at a time.',
        tabs: [['military', 'Military'], ['personnel', 'Personnel']], render: renderTech, wide: true, cls: 'tech',
      },
      abilities: {
        title: 'ABILITIES', sub: 'Your loadout: officer abilities, arsenal actives (1-4) and your ultimate (R), plus how to unlock every one.',
        render: renderAbilities, wide: true, cls: 'abilities',
      },
      cargo: { title: 'CARGO', sub: 'Your hold, and the Workshop where ore becomes parts.', tabs: [['hold', 'Hold'], ['workshop', 'Workshop']], render: renderCargo, wide: true },
      map: { title: 'WORLD MAP', sub: 'Right-click to drive there. Zones further from camp are more dangerous and need special gear.', render: (c) => this.renderMap(c), wide: true },
      help: { title: 'HOW TO PLAY', sub: 'Commander\'s field manual', render: (c) => this.renderHelp(c), wide: true },
      menu: { title: 'PAUSED', sub: '', render: (c) => this.renderMenu(c) },
    };
  }

  get isOpen(): boolean {
    return this.current !== null || this.modal.style.display === 'flex';
  }

  toggle(name: string): void {
    if (this.current === name) this.close();
    else this.open(name);
  }

  open(name: string, tab?: string): void {
    const d = this.defs[name];
    if (!d || !this.app.game) return;
    this.current = name;
    this.tab = tab ?? (this.current === name && this.tab && d.tabs?.some((t) => t[0] === this.tab) ? this.tab : d.tabs?.[0][0] ?? '');
    this.pauses = this.app.game.mode === 'world';
    this.root.style.display = 'flex';
    this.render();
    this.app.sound('ui');
  }

  close(): void {
    this.current = null;
    this.root.style.display = 'none';
    hideTip();
    this.app.view.rangeR = 0;
    this.app.save();
  }

  tick(): void {
    /* panels re-render on actions; the game is paused while they're open */
  }

  render(): void {
    const name = this.current;
    if (!name) return;
    const d = this.defs[name];
    hideTip();
    this.win.className = `panel ${d.wide ? 'wide' : ''} ${d.cls ?? ''}`;
    this.win.innerHTML = '';
    const head = h('div', 'panel-head', `<div class="pt">${esc(d.title)}</div><div class="ps">${esc(d.sub)}</div>`);
    head.appendChild(button('✕', () => this.close(), 'close'));
    this.win.appendChild(head);
    if (SWITCH.some(([k]) => k === name)) {
      // Always show the upgrade switcher so every screen is one click away.
      const sw = h('div', 'switcher');
      for (const [k, label] of SWITCH) {
        const b = button(label, () => this.open(k), `sw ${k} ${name === k ? 'on' : ''}`);
        sw.appendChild(b);
      }
      this.win.appendChild(sw);
    }
    if (d.tabs) {
      const tabs = h('div', 'tabs');
      for (const [k, label] of d.tabs) {
        tabs.appendChild(button(label, () => {
          this.tab = k;
          this.render();
        }, `tab ${this.tab === k ? 'on' : ''}`));
      }
      this.win.appendChild(tabs);
    }
    const body = h('div', 'panel-body');
    this.win.appendChild(body);
    this.win.appendChild(this.msgEl);
    const ctx: PanelCtx = {
      app: this.app, body, tab: this.tab,
      setTab: (t) => {
        this.tab = t;
        this.render();
      },
      rerender: () => this.render(),
      msg: (text, ok = true) => this.msg(text, ok),
    };
    d.render(ctx);
  }

  msg(text: string, ok = true): void {
    this.msgEl.textContent = text;
    this.msgEl.className = `panel-msg show ${ok ? 'ok' : 'bad'}`;
    this.app.sound(ok ? 'build' : 'error');
    clearTimeout((this.msgEl as HTMLDivElement & { _t?: number })._t);
    (this.msgEl as HTMLDivElement & { _t?: number })._t = window.setTimeout(() => this.msgEl.classList.remove('show'), 2600);
  }

  /** In-page message with a single button. */
  notice(title: string, text: string, ok = 'OK'): void {
    this.modal.innerHTML = '';
    const box = h('div', 'modal', `<h3>${esc(title)}</h3><p>${esc(text)}</p>`);
    const row = h('div', 'row');
    row.append(button(ok, () => (this.modal.style.display = 'none'), 'primary'));
    box.appendChild(row);
    this.modal.appendChild(box);
    this.modal.style.display = 'flex';
  }

  /** In-page confirm dialog (browser confirm() is blocked in some embeds). */
  confirm(title: string, text: string, ok: string, onOk: () => void): void {
    this.modal.innerHTML = '';
    const box = h('div', 'modal', `<h3>${esc(title)}</h3><p>${esc(text)}</p>`);
    const row = h('div', 'row');
    row.append(
      button('Cancel', () => (this.modal.style.display = 'none')),
      button(ok, () => {
        this.modal.style.display = 'none';
        onOk();
      }, 'primary'),
    );
    box.appendChild(row);
    this.modal.appendChild(box);
    this.modal.style.display = 'flex';
  }

  /* ---------------- map ---------------- */

  private renderMap(ctx: PanelCtx): void {
    const g = this.app.game;
    const wrap = h('div', 'map-wrap');
    const size = Math.min(640, Math.floor(Math.min(window.innerHeight * 0.68, window.innerWidth * 0.55)));
    const c = h('canvas', 'bigmap');
    c.width = size;
    c.height = size;
    const cx = c.getContext('2d')!;
    const draw = (): void => this.app.minimap.draw(cx, size, size, g, this.app.view, true);
    draw();
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      const r = c.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * g.map.size, y = ((e.clientY - r.top) / r.height) * g.map.size;
      if (e.button === 2) {
        if (orderMove(g, x, y)) {
          this.app.view.moveMarker(x, y);
          this.close();
        } else ctx.msg("Can't find a way there.", false);
      } else {
        this.app.camLocked = false;
        this.app.view.cam.x = x;
        this.app.view.cam.y = y;
        this.close();
      }
    });
    wrap.appendChild(c);
    const side = h('div', 'map-side');
    const zones = [ZONE.RUSTBELT, ZONE.DUNES, ZONE.CRYO, ZONE.GLASS, ZONE.MAGMA, ZONE.ACID].map((z) => {
      const d = ZONES[z];
      const ok = (!d.hazard || g.player.stats.protects.has(d.hazard)) && (!d.drive || g.player.drive === d.drive || g.player.drive === 'hover');
      return `<div class="zrow"><i style="background:${d.color}"></i><b>${esc(d.name)}</b> <span class="${ok ? 'good' : 'bad'}">${ok ? '✔ ready' : '✖ gear needed'}</span><div class="d">${esc(d.desc)} <br>Resource: ${esc(d.resource)}.<br><b>Needs:</b> ${esc(d.need)}${d.drive ? ` (${DRIVE_INFO[d.drive].name})` : ''}</div></div>`;
    });
    side.innerHTML = `<div class="legend"><span><i class="lg site"></i>Loot area</span><span><i class="lg rune"></i>Rune altar</span><span><i class="lg fort"></i>Outpost</span><span><i class="lg gate"></i>Dead Zone</span><span><i class="lg you"></i>You</span></div>${zones.join('')}<div class="d">Left-click: look there · Right-click: drive there</div>`;
    wrap.appendChild(side);
    ctx.body.appendChild(wrap);
  }

  /* ---------------- help ---------------- */

  private renderHelp(ctx: PanelCtx): void {
    ctx.body.innerHTML = `
<div class="help-grid">
  <div class="help-col">
    <h3>CONTROLS</h3>
    <table class="keys">
      <tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></td><td>Drive (or right-click to path there)</td></tr>
      <tr><td><kbd>Right-click</kbd></td><td>Drive / attack / harvest / interact</td></tr>
      <tr><td><kbd>Q</kbd><kbd>E</kbd><kbd>F</kbd><kbd>G</kbd><kbd>Z</kbd><kbd>X</kbd></td><td>Officer abilities</td></tr>
      <tr><td><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd></td><td>Arsenal actives (jets, drones, salvo...)</td></tr>
      <tr><td><kbd>R</kbd></td><td>ULTIMATE (nuke, dragon, mech...)</td></tr>
      <tr><td><kbd>5</kbd></td><td>Repair kit</td></tr>
      <tr><td><kbd>Left mouse</kbd></td><td>Fire weapons set to MANUAL</td></tr>
      <tr><td><kbd>Y</kbd></td><td>Auto-fire on/off</td></tr>
      <tr><td><kbd>L</kbd> / <kbd>Space</kbd></td><td>Lock camera / recenter · <kbd>Wheel</kbd> zoom</td></tr>
      <tr><td><kbd>B</kbd><kbd>V</kbd><kbd>C</kbd><kbd>T</kbd><kbd>K</kbd></td><td>Base · Arsenal · Crew · Research · Abilities</td></tr>
      <tr><td><kbd>I</kbd><kbd>M</kbd><kbd>J</kbd><kbd>Esc</kbd></td><td>Cargo · Map · send Outrider · Menu</td></tr>
    </table>
    <p class="d">Everything is also clickable: the buttons at the top right, the ability bar at the bottom and the perk cards on the left.</p>
  </div>
  <div class="help-col base">
    <h3>BASE <kbd>B</kbd> &amp; ARSENAL <kbd>V</kbd></h3>
    <ul>
      <li><b>Deck:</b> reactors, engines, <b>barracks</b>, <b>living quarters</b>, <b>science labs</b>, a <b>forge</b>, training grounds, mess hall, arcane sanctum, hardpoints, and modules for your actives and ultimate. Click a facility to <b>level it up</b> (L1-L3).</li>
      <li><b>Arsenal:</b> weapons go from <span class="r0">1★</span> to <span class="r5">6★ Mythic</span>. <b>Forge</b> them to add stars (takes time: 6★ takes 6 minutes). Every star is a point in that weapon's own <b>upgrade tree</b> (Firepower, Handling, Payload, with capstones like Double Tap or Chain Reaction).</li>
      <li>35 weapons: grenade launchers, flamethrowers, acid and plasma launchers, ray guns, a <b>Ray-Rail twin cannon</b>, hornet jet launchers, storm spires, gravity cannons, a phoenix launcher, the <b>Void Lance</b>...</li>
    </ul>
  </div>
  <div class="help-col crew">
    <h3>CREW <kbd>C</kbd> · RESEARCH <kbd>T</kbd> · ABILITIES <kbd>K</kbd></h3>
    <ul>
      <li><b>Officers</b> give abilities on <kbd>Q</kbd><kbd>E</kbd><kbd>F</kbd><kbd>G</kbd>; research unlocks seats <kbd>Z</kbd> and <kbd>X</kbd>.</li>
      <li><b>Level up</b> → click 1 of 3 perk cards (left side of the screen). Level 5 and 8 unlock veteran and master perks: much stronger.</li>
      <li><b>Research</b> is timed. Military tiers I-VI: 30s up to 8 minutes. The longer it takes, the stronger it is. <b>Science Labs</b> speed it up and unlock the <b>Personnel</b> tree.</li>
      <li><b>Actives</b> (1-4) and your <b>ultimate</b> (R) come from deck modules. The ultimate charges over time and faster when you deal damage.</li>
      <li><b>Max 15 aboard.</b> At 15 the <b>Outrider</b> mini tank unlocks.</li>
    </ul>
  </div>
  <div class="help-col">
    <h3>LOOT</h3>
    <ul>
      <li><b class="y">◆ Loot areas:</b> park inside the ring and hold. May drop a <b>This-or-That chest</b>.</li>
      <li><b style="color:#b388ff">● Runes:</b> beat the guardians, then park next to the altar for a buff and a <b>Rune Chest</b> (exclusive weapons, characters, champions).</li>
      <li><b class="bad">■ Outposts</b> and raider tanks drop Salvaged Tech. Titans and runes drop <b style="color:#ff4f7b">Mythic Essence</b>.</li>
      <li>Further from camp: bigger enemies, <b>titans</b> and better loot.</li>
      <li><b class="bad">Dead Zone</b> (NE of camp): multiplayer. Die there and others loot your cargo.</li>
    </ul>
  </div>
</div>`;
  }

  /* ---------------- menu ---------------- */

  private renderMenu(ctx: PanelCtx): void {
    const a = this.app;
    const col = h('div', 'menu-col');
    col.append(
      button('Resume', () => this.close(), 'primary'),
      button('How to play', () => this.open('help')),
      button('Save now', () => {
        if (a.game.mode === 'world' && saveGame(a.game)) ctx.msg('Saved.');
        else ctx.msg("Couldn't save here.", false);
      }),
      button(`Sound: ${a.audio.muted ? 'OFF' : 'ON'}`, () => {
        a.audio.setMuted(!a.audio.muted);
        this.render();
      }),
      button(`Pixel outlines: ${a.view.outlines ? 'ON' : 'OFF'}`, () => {
        a.view.outlines = !a.view.outlines;
        this.render();
      }),
      button(`Camera: ${a.camLocked ? 'LOCKED' : 'FREE'} (L)`, () => {
        a.camLocked = !a.camLocked;
        this.render();
      }),
      button(`WASD: ${a.game.tankControls ? 'TANK-STYLE (W/S throttle, A/D turn)' : 'SCREEN-RELATIVE (W = up)'}`, () => {
        a.game.tankControls = !a.game.tankControls;
        this.render();
      }),
      button('Quit to title', () => {
        a.save();
        a.running = false;
        this.close();
        a.title.show();
      }),
      button('Delete save', () => this.confirm('Delete your save?', 'This wipes your fortress, crew and progress from this browser.', 'Delete', () => {
        clearSave();
        a.running = false;
        this.close();
        a.title.show();
      }), 'danger'),
    );
    const g = a.game;
    const s = g.stats;
    ctx.body.appendChild(col);
    ctx.body.appendChild(h('div', 'stats', `Time ${Math.floor(s.time / 60)}m · Kills ${s.kills} · Raiders ${s.raiders} · Outposts ${s.outposts} · Titans ${s.titans} · Loot areas ${s.sites} · Runes ${s.runes} · Chests ${s.chests}`));
  }
}
