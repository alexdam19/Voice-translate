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
        title: 'BASE', sub: 'Upgrade your TANK: facilities, weapons, hull and drive. Everything here is bolted to the fortress.',
        tabs: [['deck', 'Deck & Build'], ['armory', 'Armory'], ['chassis', 'Chassis & Drive']], render: renderBase, wide: true, cls: 'base',
      },
      crew: {
        title: 'CREW', sub: 'Upgrade your PEOPLE: officers with abilities, perks, recruits and the Outrider. Max 15 aboard the fortress.',
        tabs: [['officers', 'Officers (Q W E R D F)'], ['roster', 'Roster'], ['recruit', 'Recruit'], ['outrider', 'Outrider']], render: renderCrew, wide: true, cls: 'crew',
      },
      tech: { title: 'TECH TREE', sub: 'Spend Salvaged Tech (from raider tanks, outposts, titans and chests) to unlock and upgrade military equipment.', render: renderTech, wide: true, cls: 'tech' },
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
    if (name === 'tech' && this.current === 'base') tab = undefined;
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
    if (name === 'base' || name === 'crew' || name === 'tech') {
      // Always show the BASE vs CREW switcher so the split is obvious.
      const sw = h('div', 'switcher');
      for (const [k, label] of [['base', 'BASE · tank upgrades (B)'], ['crew', 'CREW · character upgrades (C)'], ['tech', 'TECH TREE (T)']] as [string, string][]) {
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
      <tr><td><kbd>Right-click</kbd></td><td>Drive / attack / harvest / interact</td></tr>
      <tr><td><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd><kbd>D</kbd><kbd>F</kbd></td><td>Officer abilities (cooldowns)</td></tr>
      <tr><td><kbd>Left mouse</kbd></td><td>Fire weapons set to MANUAL</td></tr>
      <tr><td><kbd>Z</kbd></td><td>Auto-fire on/off for all weapons</td></tr>
      <tr><td><kbd>S</kbd></td><td>Stop</td></tr>
      <tr><td><kbd>1</kbd></td><td>Repair kit</td></tr>
      <tr><td><kbd>Y</kbd> / <kbd>Space</kbd></td><td>Lock camera / recenter</td></tr>
      <tr><td><kbd>Wheel</kbd></td><td>Zoom</td></tr>
      <tr><td><kbd>G</kbd></td><td>Send the Outrider</td></tr>
      <tr><td><kbd>M</kbd> <kbd>I</kbd> <kbd>Esc</kbd></td><td>Map · Cargo · Menu</td></tr>
    </table>
  </div>
  <div class="help-col base">
    <h3>UPGRADE YOUR BASE <kbd>B</kbd></h3>
    <p class="d">Things bolted to the tank.</p>
    <ul>
      <li><b>Deck:</b> build facilities: reactors, engines, quarters, barracks, cargo, medbay, drills, hazard gear.</li>
      <li><b>Armory:</b> mount weapons on hardpoints. Weapons come in <span class="r1">Uncommon</span>, <span class="r2">Rare</span>, <span class="r3">Epic</span> and <span class="r4">Legendary</span>. Rarer = stronger, with bonus traits.</li>
      <li><b>Chassis & Drive:</b> a bigger hull means more deck space. Tracks, chains and hover skirts open new zones.</li>
      <li><b>Tech Tree <kbd>T</kbd>:</b> unlock new weapons and whole-family upgrades.</li>
    </ul>
  </div>
  <div class="help-col crew">
    <h3>UPGRADE YOUR CREW <kbd>C</kbd></h3>
    <p class="d">Your people.</p>
    <ul>
      <li><b>Officers</b> (main crew) sit in 6 seats: each gives an ability on <kbd>Q</kbd>–<kbd>F</kbd> that goes on cooldown.</li>
      <li><b>Side crew</b> give passive bonuses by role.</li>
      <li><b>Level up</b> to pick 1 of 3 <b>perks</b>. Perks have rarities too.</li>
      <li><b>Max 15 aboard.</b> At 15 you can build the <b>Outrider</b>: a mini tank crewed by side crew that follows you or goes out for resources. Crew aboard may die if it's destroyed.</li>
      <li><b>Champions</b> (Legendary) and <b>exclusive characters</b> (Epic) only come from Rune Chests.</li>
    </ul>
  </div>
  <div class="help-col">
    <h3>LOOT</h3>
    <ul>
      <li><b class="y">◆ Loot areas:</b> park inside the ring and hold. Defenders attack. May drop a <b>This-or-That chest</b>: pick one of two rewards.</li>
      <li><b style="color:#b388ff">● Runes:</b> beat the guardians, then park next to the altar for a buff and a <b>Rune Chest</b>. It can hold an exclusive weapon, an exclusive character or a champion.</li>
      <li><b class="bad">■ Outposts</b> and raider tanks are enemy bases. Their wrecks drop Salvaged Tech.</li>
      <li>Further from camp: bigger enemies, <b>titans</b> and better loot.</li>
      <li><b class="bad">Dead Zone</b> (NE of camp): multiplayer. If you die there, other players can loot your cargo.</li>
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
      button(`Camera: ${a.camLocked ? 'LOCKED' : 'FREE'} (Y)`, () => {
        a.camLocked = !a.camLocked;
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
