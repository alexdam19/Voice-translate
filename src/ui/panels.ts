import type { App } from '../app';
import { saveGame, clearSave } from '../game/save';
import { orderMove } from '../game/systems/orders';
import { PLAY_ZONES, ZONES } from '../shared/zones';
import { DRIVE_ITEM, getItem } from '../shared/items';
import type { DriveKey } from '../shared/types';
import { installDrive } from '../game/actions';
import { DRIVE_INFO, MODULES } from '../game/defs';
import { FEATURES } from '../game/progress';
import { itemIcon } from '../render/icons';
import { button, esc, h, hideTip, isTouch } from './dom';
import { renderCrew } from './crewPanel';
import { renderCargo } from './cargoPanel';
import { renderArsenal } from './arsenalPanel';
import { renderCards } from './cardsPanel';
import { renderProgress } from './progressPanel';
import { renderBlueprint } from './blueprintPanel';
import { renderShipyard } from './shipyardPanel';
import { renderBridge } from './bridgePanel';

const SWITCH: [string, string, string][] = [
  ['cards', 'CARDS (C)', ''], ['arsenal', 'ARSENAL (V)', 'arsenal'], ['crew', 'CREW (K)', 'crew'], ['progress', 'LEVEL ROAD (L)', ''],
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
  /** Live: the game keeps running and the body redraws twice a second. */
  live?: boolean;
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
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    parent.appendChild(this.root);
    this.modal = h('div', 'modal-backdrop');
    parent.appendChild(this.modal);
    this.msgEl = h('div', 'panel-msg');
    this.defs = {
      cards: {
        title: 'BATTLE CARDS', sub: 'Your deck of 8 and your collection. Duplicates from card packs level cards up.',
        tabs: [['deck', 'Deck & Collection'], ['relics', 'Relics'], ['packs', 'Card Packs']], render: renderCards, wide: true, cls: 'cards',
      },
      progress: {
        title: 'LEVEL ROAD', sub: 'Everything you unlock by earning commander XP. XP comes from fighting.',
        render: renderProgress, wide: true, cls: 'progress',
      },
      arsenal: {
        title: 'ARSENAL', sub: 'Your weapons: mount them on turrets, forge them from 1★ to 6★ and spend star points in each weapon\'s upgrade tree.',
        tabs: [['weapons', 'My Weapons'], ['codex', 'Codex & Workshop']], render: renderArsenal, wide: true, cls: 'arsenal',
      },
      crew: {
        title: 'CREW', sub: 'Stations: everyone aboard and where they work. Officers: your named crew with bonuses and perks (max 15).',
        tabs: [['stations', 'Stations'], ['roster', 'Officers'], ['recruit', 'Recruit'], ['outrider', 'Outrider']], render: renderCrew, wide: true, cls: 'crew',
      },
      shipyard: {
        title: 'MOTHERSHIP SHIPYARD', sub: 'Install the parts from the strongholds, rebuild your fortress, trade and hire.',
        tabs: [['parts', 'Parts'], ['refit', 'Rebuild'], ['trade', 'Trade'], ['hire', 'Hire']], render: renderShipyard, wide: true, cls: 'shipyard',
      },
      bridge: {
        title: 'SHIP VITALS', sub: 'Every number the Titan has, live (the game keeps running). SEND TEAM puts six people on a problem; STABILIZE sends teams to the worst of it.',
        render: renderBridge, wide: true, cls: 'bridge vitals', live: true,
      },
      drive: { title: 'DRIVE TRAIN', sub: 'Different treads for different ground. Craft them at a Workshop (CARGO > Workshop).', render: (c) => this.renderDrive(c), wide: true },
      cargo: { title: 'CARGO', sub: 'Your hold, and the Refinery and Workshop where ore becomes parts.', tabs: [['hold', 'Hold'], ['workshop', 'Refine & Craft']], render: renderCargo, wide: true },
      map: { title: 'WORLD MAP', sub: 'The Crater, 140 km across. Click to drive there. Each zone has its own creatures and dangers; some need special gear.', render: (c) => this.renderMap(c), wide: true },
      help: { title: 'HOW TO PLAY', sub: 'Commander\'s field manual', render: (c) => this.renderHelp(c), wide: true },
      menu: { title: 'PAUSED', sub: '', render: (c) => this.renderMenu(c) },
      blueprint: { title: 'BLUEPRINT', sub: 'A technical drawing of your whole fortress, and an analysis of what it can do.', render: renderBlueprint, wide: true, cls: 'blueprint' },
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
    this.pauses = this.app.game.mode === 'world' && !d.live;
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

  private liveAt = 0;

  /** Live panels redraw their body twice a second (the others re-render on actions; the game is paused under them). */
  tick(): void {
    if (!this.current || !this.defs[this.current].live || !this.body) return;
    const now = performance.now();
    if (now - this.liveAt < 500) return;
    this.liveAt = now;
    this.refreshBody();
  }

  private body: HTMLElement | null = null;
  private ctx: PanelCtx | null = null;

  /** Redraws just the body, keeping the scroll position. */
  private refreshBody(): void {
    const b = this.body, c = this.ctx;
    if (!b || !c || !this.current) return;
    const top = b.scrollTop;
    b.innerHTML = '';
    this.defs[this.current].render(c);
    b.scrollTop = top;
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
      // A switcher so every screen is one click away (features you haven't unlocked stay hidden).
      const sw = h('div', 'switcher');
      const lvl = this.app.game.commander.level;
      for (const [k, label, feat] of SWITCH) {
        const f = FEATURES.find((x) => x.key === feat);
        if (f && lvl < f.level) continue;
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
      rerender: () => (d.live ? this.refreshBody() : this.render()),
      msg: (text, ok = true) => this.msg(text, ok),
    };
    this.body = body;
    this.ctx = ctx;
    this.liveAt = performance.now();
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
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * g.map.size, y = ((e.clientY - r.top) / r.height) * g.map.size;
      if (orderMove(g, x, y)) {
        this.app.view.moveMarker(x, y);
        this.close();
      } else ctx.msg("Can't find a way there.", false);
    });
    wrap.appendChild(c);
    const side = h('div', 'map-side');
    const zones = PLAY_ZONES.map((z) => {
      const d = ZONES[z];
      const ok = (!d.hazard || g.player.stats.protects.has(d.hazard)) && (!d.drive || g.player.drive === d.drive || g.player.drive === 'hover');
      return `<div class="zrow"><i style="background:${d.color}"></i><b>${esc(d.name)}</b> <span class="${ok ? 'good' : 'bad'}">${ok ? '✔ ready' : '✖ gear needed'}</span><div class="d">${esc(d.desc)} <br>Resource: ${esc(d.resource)}.<br><b>Needs:</b> ${esc(d.need)}${d.drive ? ` (${DRIVE_INFO[d.drive].name})` : ''}</div></div>`;
    });
    side.innerHTML = `<div class="legend"><span><i class="lg site"></i>Loot area</span><span><i class="lg rune"></i>Rune altar</span><span><i class="lg fort"></i>Outpost</span><span><i class="lg gate"></i>Dead Zone</span><span><i class="lg you"></i>You</span></div>${zones.join('')}<div class="d">${isTouch() ? 'Tap' : 'Click'} anywhere to drive there.</div>`;
    wrap.appendChild(side);
    ctx.body.appendChild(wrap);
  }

  /* ---------------- help ---------------- */

  private renderHelp(ctx: PanelCtx): void {
    ctx.body.innerHTML = `
<div class="help-grid">
  <div class="help-col">
    <h3>THE BASICS</h3>
    <ul>
      ${isTouch()
        ? '<li>You command a <b>Titan Crawler</b>: 200 m of armoured city on eight crawlers. <b>Stick up/down</b> is the throttle, <b>left/right</b> steers. It builds speed slowly (top speed about 25 km/h), takes seconds to stop and turns wide; the dashed lane shows where it is going. <b>Tap the ground</b> to drive there. <b>Pinch</b> to zoom.</li>'
        : '<li>You command a <b>Titan Crawler</b>: 200 m of armoured city on eight crawlers. <kbd>W</kbd>/<kbd>S</kbd> is the throttle, <kbd>A</kbd>/<kbd>D</kbd> steers. It builds speed slowly (top speed about 25 km/h), takes seconds to stop and turns wide; the dashed lane ahead shows where it is going. Right-click drives there. Mouse wheel zooms.</li>'}
      <li>Your guns <b>aim and fire on their own</b>: a pad on every corner and the main battery up front, with more as the Command Center grows.</li>
      <li><b>Nothing stops you</b>: you crush rubble, climb cliffs and wade through lava. The right <b>drive train</b> makes it fast (and lava safe); tap the drive chip by your hull bar, or leave it on AUTO.</li>
      <li><b>Park on a resource node</b> to drill it.</li>
      <li>If your fortress goes down, it's towed to camp and comes back <b>fully repaired</b>.</li>
    </ul>
    <h3>BRIDGE STATUS <kbd>Y</kbd></h3>
    <ul>
      <li>Hits wear down the <b>armour zone</b> they land on (bow, stern, flanks, roof); a worn zone lets more through. Flank hits damage the <b>crawlers</b>: each one lost costs speed, and losing more on one side pulls the hull that way.</li>
      <li>Six <b>systems</b> (power, propulsion, steering, fire control, sensors, life support) go <b>Operational → Damaged → Degraded → Critical → Disabled</b>. Big hits start <b class="bad">fires</b>; a breached hull in mud or acid <b style="color:#40c4ff">floods</b> the lowest decks.</li>
      <li>Keep up <b>fuel</b> (a Refinery turns scrap into it), <b>water</b> (drive over snow, ice or mud, or camp), air and temperature. The Mothership tops you up. The Works crew repair everything for scrap, faster in camp.</li>
    </ul>
    <h3>CARDS <kbd>C</kbd></h3>
    <ul>
      <li>You hold <b>4 cards</b> from a deck of 8. <b>Drag one onto the battlefield</b> to play it there (or tap it, then tap the ground${isTouch() ? '' : '; keys <kbd>1</kbd>-<kbd>4</kbd>'}).</li>
      <li>Cards cost <b>energy</b> (the purple bar), which refills over time. Played cards go to the back of the deck.</li>
      <li><b>Card packs</b> drop from elites, raider tanks, outposts, runes and titans. Duplicates level cards up. <b>Relics</b> are permanent bonuses.</li>
    </ul>
  </div>
  <div class="help-col base">
    <h3>YOUR BASE <kbd>B</kbd></h3>
    <ul>
      <li>Your fortress is a whole facility, run like a village. Tap a building to see it and <b>upgrade</b> it; tap <b>SHOP</b> to place new ones.</li>
      <li>Seven <b>decks</b> under the roof, <b>+3 Command</b> down to <b>-3 Engineering</b>; switch with the elevator panel. The <b>Spine</b> (a 10 m corridor) and <b>Lifts A-C</b> run through every deck and stay clear. The Hangar opens at Titan Mk II, Recreation at Mk III.</li>
      <li><b>Builders</b> each work on one job at a time, in real time, while you play.</li>
      <li>The <b>Command Center</b> is the Titan's mark: it sets how many mounts and decks you have, how many of each building and how high they can go.</li>
      <li>Can't afford something? Press <b>TRACK</b>: a box shows what you need and a <b class="y">yellow marker</b> points to where to get it.</li>
    </ul>
  </div>
  <div class="help-col crew">
    <h3>LEVELS &amp; SQUADS</h3>
    <ul>
      <li><b>Commander XP</b> comes from kills, loot areas, outposts, raider tanks and runes. Each level gives <b>+hull and +damage</b>, a card pack, and unlocks buildings, weapons and features (<kbd>L</kbd>: Level Road).</li>
      <li><b>Squads</b> come from army buildings (Barracks, Garage, Drone Bay...). They follow you; <b>drag their badge onto the map</b> to guard a spot, or send Marines and Buggies to <b>SCAVENGE</b> ahead.</li>
      <li><b>Crew</b> give passive bonuses and pick perks as they level.</li>
    </ul>
  </div>
  <div class="help-col">
    <h3>HORDES &amp; RIVALS</h3>
    <ul>
      <li><b class="bad">Hordes</b> come in waves. A warning and a red arrow show where from; then hundreds pour in and climb your hull. Drive hard to shake them off; <b>Tesla Coils</b> zap climbers.</li>
      <li><b class="bad">Rival dreadnoughts</b> (level 6+) are fortresses as strong as yours, hunting you. Big prize: an Epic pack and their best gun.</li>
      <li><b>BLUEPRINT</b> (${isTouch() ? '☰ menu or the base' : '<kbd>N</kbd>'}) shows your whole fortress, its firepower on each side and its weak spots.</li>
    </ul>
    <h3>LOOT</h3>
    <ul>
      <li><b class="y">◆ Loot areas:</b> park inside the ring and hold.</li>
      <li><b style="color:#b388ff">● Runes:</b> beat the guardians, park by the altar: a buff, a Rune Chest and a card pack.</li>
      <li><b class="bad">■ Outposts</b> and raider tanks drop Salvaged Tech and card packs. Titans drop Mythic Essence.</li>
      <li>Further from camp: tougher enemies and better loot. The <b class="bad">Dead Zone</b> (NE) is multiplayer.</li>
    </ul>
    ${isTouch() ? '<p class="d">Tap your own fortress to open the base. ☰ (top right) has Cargo, the Map, this page and fullscreen.</p>' : '<p class="d"><kbd>V</kbd> Arsenal · <kbd>K</kbd> Crew · <kbd>I</kbd> Cargo · <kbd>M</kbd> Map · <kbd>5</kbd> Repair kit · <kbd>Esc</kbd> Menu</p>'}
  </div>
</div>`;
  }

  /* ---------------- drive train ---------------- */

  private renderDrive(ctx: PanelCtx): void {
    const g = this.app.game;
    const p = g.player;
    const wrap = h('div', 'chassis-wrap');
    const drv = h('div', 'chassis-col');
    drv.appendChild(h('div', 'cat', 'DRIVE TRAIN'));
    for (const k of ['wheels', 'tracks', 'chains', 'magma', 'hover'] as DriveKey[]) {
      const item = DRIVE_ITEM[k];
      const have = k === 'wheels' || p.cargo.count(item) > 0;
      const el = h('div', `ch-item ${p.drive === k ? 'cur' : have ? 'next' : 'later'}`);
      el.innerHTML = `<img src="${itemIcon(item)}"> <b>${esc(DRIVE_INFO[k].name)}</b><div class="d">${esc(getItem(item).desc)} Best on: ${esc(DRIVE_INFO[k].best)}.</div>`;
      if (p.drive === k) el.innerHTML += '<div class="good">Installed</div>';
      else if (have) el.appendChild(button('Install', () => {
        const r = installDrive(g, k);
        ctx.msg(r.msg ?? '', r.ok);
        ctx.rerender();
      }, 'primary'));
      else el.innerHTML += '<div class="d">Not built yet: craft it in CARGO > Refine &amp; Craft (needs a Workshop).</div>';
      drv.appendChild(el);
    }
    const zones = h('div', 'chassis-col');
    zones.appendChild(h('div', 'cat', 'WHAT EACH ZONE NEEDS'));
    for (const z of PLAY_ZONES.filter((k) => ZONES[k].hazard || ZONES[k].drive)) {
      const d = ZONES[z];
      const hazOk = !d.hazard || p.stats.protects.has(d.hazard);
      const drvOk = !d.drive || p.drive === d.drive || p.drive === 'hover';
      zones.appendChild(h('div', 'ch-item', `<b style="color:${d.color}">${esc(d.name)}</b><div class="d">${esc(d.need)}</div><div>${d.drive ? `<span class="${drvOk ? 'good' : 'bad'}">${drvOk ? '✔' : '✖'} ${DRIVE_INFO[d.drive].name}</span> ` : ''}${d.protect ? `<span class="${hazOk ? 'good' : 'bad'}">${hazOk ? '✔' : '✖'} ${esc(MODULES[d.protect].name)}</span>` : ''}</div>`));
    }
    wrap.append(drv, zones);
    ctx.body.appendChild(wrap);
  }

  /* ---------------- menu ---------------- */

  private renderMenu(ctx: PanelCtx): void {
    const a = this.app;
    const col = h('div', 'menu-col');
    // Screens that don't have their own HUD button on a phone.
    const quick = h('div', 'menu-quick');
    quick.append(
      button('BLUEPRINT', () => this.open('blueprint')),
      button('CARGO', () => this.open('cargo')),
      button('MAP', () => this.open('map')),
      button('LEVEL ROAD', () => this.open('progress')),
      button('HELP', () => this.open('help')),
    );
    col.append(button('Resume', () => this.close(), 'primary'), quick);
    const doc = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (document.fullscreenEnabled || doc.webkitRequestFullscreen) {
      const full = !!document.fullscreenElement;
      col.append(button(full ? 'Exit fullscreen' : 'Fullscreen', () => {
        if (full) void document.exitFullscreen?.();
        else {
          const p = doc.requestFullscreen?.() ?? (doc.webkitRequestFullscreen?.(), undefined);
          // Phones play best sideways; not every browser allows locking it.
          void p?.then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')).catch(() => undefined);
        }
        setTimeout(() => this.render(), 300);
      }));
    }
    col.append(
      button('Save now', () => {
        if (a.game.mode === 'world' && saveGame(a.game)) ctx.msg('Saved.');
        else ctx.msg("Couldn't save here.", false);
      }),
      button(`Sound: ${a.audio.muted ? 'OFF' : 'ON'}`, () => {
        a.audio.setMuted(!a.audio.muted);
        this.render();
      }),
      button(`Screen shake: ${a.view.shakeOn ? 'ON' : 'OFF'}`, () => {
        a.view.shakeOn = !a.view.shakeOn;
        try {
          localStorage.setItem('ironcrawl-shake', a.view.shakeOn ? '1' : '0');
        } catch {
          /* private mode */
        }
        this.render();
      }),
      button(`Pixel outlines: ${a.view.outlines ? 'ON' : 'OFF'}`, () => {
        a.view.outlines = !a.view.outlines;
        this.render();
      }),
      button(`${a.touch ? 'Stick' : 'WASD'}: ${a.game.tankControls ? `TANK-STYLE (${a.touch ? 'up/down throttle, left/right turn' : 'W/S throttle, A/D turn'})` : `SCREEN-RELATIVE (${a.touch ? 'push where you want to go' : 'W = up'})`}`, () => {
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
