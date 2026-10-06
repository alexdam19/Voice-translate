import { CHAPTERS } from '../game/story';
import { STREAK_ORDER, STREAKS, type StreakKind } from '../game/systems/streaks';
import { COLOSSI, colossusHealth } from '../game/systems/colossus';
import { ENEMIES } from '../game/enemyDefs';
import { ShipConsole } from './shipConsole';
import { TITAN } from '../game/systems/movement';
import { DRIVE_ITEM, getItem } from '../shared/items';
import { titanAlerts } from '../game/systems/titan';
import { RUNE_INFO, TIER_NAMES, threatAt, threatTier } from '../shared/mapgen';
import { RARITIES } from '../shared/rarity';
import { treePoints, WEAPONS } from '../shared/weapons';
import { ZONES } from '../shared/zones';
import { CARDS, HAND_SIZE, PACK_INFO } from '../game/cards';
import { PERK_BY_ID, perkText, ROLES } from '../game/crew';
import { buildBlock, upgradeBlock, upgradeCostOf } from '../game/actions';
import { chassisForCC, DRIVE_INFO, isShopBuilding, MODULE_LIST, MODULES } from '../game/defs';
import { DRIVE_LEVEL, DRIVES, driveScore, ownsDrive, setDrive } from '../game/systems/drives';
import { waveStatus } from '../game/systems/waves';

import type { DriveKey } from '../shared/types';
import type { Game } from '../game/game';
import { isDocked, mission } from '../game/campaign';
import { shift } from '../game/systems/crewlife';
import { STORMS } from '../game/systems/weather';
import { FEATURES, levelRoad, MAX_COMMANDER_LEVEL, type FeatureKey, type LevelReward } from '../game/progress';
import { SQUADS, squadSize, type SquadType } from '../game/squads';
import { forgeSpeed } from '../game/systems/arsenal';
import { cardBlock } from '../game/systems/cards';
import { OUTRIDER_COST } from '../game/systems/outrider';
import { activeSquads, setSquadOrder, squadBuilding, squadStatus, squadUnits } from '../game/systems/squads';
import type { TrackInfo } from '../game/systems/tracking';
import { itemIcon, moduleIcon, portrait } from '../render/icons';
import { cardEl } from './cardView';
import { button, esc, h, hideTip, isTouch, tooltip } from './dom';
import { Tossable } from './tossable';
import { buildRobot, ROBOT_REPAIR, ROBOT_TIME, robotBlocked, robotCap, robotsComing } from '../game/systems/robots';
import { agentFace } from './agents';
import { AGENTS } from '../game/systems/comms';
import { Joystick } from './joystick';
import { OBJECTIVES } from './objectives';
import { fmtTime } from './village';

/** Is there a building to put up or upgrade right now (free builder, unlocked, affordable)? */
function builderWork(g: Game): boolean {
  if (g.freeBuilders() <= 0) return false;
  for (const m of g.player.modules) if (!upgradeBlock(g, m.id) && g.canPay(upgradeCostOf(g, m.id))) return true;
  for (const d of MODULE_LIST) if (isShopBuilding(d) && !buildBlock(g, d.key) && g.canPay(d.cost) && g.player.findSpot(d.key)) return true;
  return false;
}

export interface HudActions {
  /** Call in a banked killstreak. */
  callStreak(kind: StreakKind): void;
  /** Focus every gun on a foe (the boss bar's button). */
  focusOn(id: number): void;
  openPanel(name: string, tab?: string): void;
  pickPerk(crewId: number, idx: number): void;
  useKit(): void;
  outrider(cmd: 'follow' | 'hold' | 'send' | 'launch'): void;
  minimapClick(x: number, y: number, right: boolean): void;
  /** Zoom the corner radar in (-1) or out (+1). */
  minimapZoom(d: number): void;
  /** Card drag: aim follows the pointer; drop plays it if released over the battlefield. */
  cardAim(slot: number, x: number, y: number, overUI: boolean): void;
  cardDrop(slot: number, x: number, y: number, overUI: boolean): void;
  cardTap(slot: number): void;
  squadAim(type: SquadType, x: number, y: number, overUI: boolean): void;
  squadDrop(type: SquadType, x: number, y: number, overUI: boolean): void;
  openPack(): void;
  village(on: boolean): void;
  trackClick(): void;
  untrack(): void;
  /** Set up camp / pack up. */
  camp(): void;
  /** The helm: throttle lever steps, all stop, overdrive. */
  helm(cmd: 'up' | 'down' | 'stop' | 'overdrive' | 'warp' | 'jaws' | 'focus' | 'gun'): void;
  /** Into the captain's cabin (first person). */
  cabin(): void;
  /** The all-decks interior cutaway. */
  interior(): void;
  /** Ask the Mega Hangar's Gate Control to open the main gate. */
  gate(): void;
  /** Bring the view back to the fortress after dragging it away. */
  recenter(): void;
}

function setText(el: HTMLElement, s: string): void {
  if (el.textContent !== s) el.textContent = s;
}

function setHTML(el: HTMLElement, s: string): void {
  if ((el as HTMLElement & { _h?: string })._h !== s) {
    (el as HTMLElement & { _h?: string })._h = s;
    el.innerHTML = s;
  }
}

/**
 * The top bar: five buttons. BASE and CARDS stand on their own; SHIP and WORLD open a short list each (every page
 * still has its own key), and the menu. Entries switch on as features unlock.
 */
type Hub = 'ship' | 'world';
const MENU: { key: string; label: string; sub: string; feature?: FeatureKey; cls?: string; hub?: Hub }[] = [
  { key: 'base', label: 'BASE', sub: 'B', cls: 'big base' },
  { key: 'cabin', label: 'CABIN', sub: 'F · cockpit', hub: 'ship' },
  { key: 'inside', label: 'INSIDE', sub: 'G · every deck', hub: 'ship' },
  { key: 'bridge', label: 'VITALS', sub: 'Y · damage & crews', hub: 'ship' },
  { key: 'arsenal', label: 'ARSENAL', sub: 'V · weapons', feature: 'arsenal', hub: 'ship' },
  { key: 'crew', label: 'CREW', sub: 'K · officers', feature: 'crew', hub: 'ship' },
  { key: 'cargo', label: 'CARGO', sub: 'I · hold & workshop', hub: 'ship' },
  { key: 'blueprint', label: 'BLUEPRINT', sub: 'N · analysis', hub: 'ship' },
  { key: 'camp', label: 'CAMP', sub: 'T · deploy here', hub: 'ship' },
  { key: 'cards', label: 'CARDS', sub: 'C', cls: 'big cards' },
  { key: 'map', label: 'MAP', sub: 'M · the Crater', hub: 'world' },
  { key: 'story', label: 'STORY', sub: 'the journal', hub: 'world' },
  { key: 'bounty', label: 'BOUNTY', sub: 'Mothership parts', hub: 'world' },
  { key: 'hangar', label: 'HANGAR', sub: 'airlift', hub: 'world' },
  { key: 'shipyard', label: 'SHIPYARD', sub: 'U · docked only', hub: 'world' },
  { key: 'help', label: 'HELP', sub: 'H · keys & tips', hub: 'world' },
  { key: 'menu', label: '☰', sub: 'Esc' },
];
const HUBS: Record<Hub, { label: string; sub: string; after: string }> = {
  ship: { label: 'SHIP ▾', sub: 'decks · crew · hold', after: 'base' },
  world: { label: 'WORLD ▾', sub: 'map · story', after: 'cards' },
};

export class Hud {
  root: HTMLDivElement;
  private cmd = h('div', 'cmdr');
  private zone = h('div', 'zone-banner');
  private obj = h('div', 'objective');
  /** The main gate: shown near it while it's shut, to ask Gate Control for clearance. */
  private gateBtn = h('button', 'gate-btn');
  /** The intercom: the Mega Hangar agent's face and what they're saying. */
  /** Shown while the view has been dragged off the fortress. */
  private recenterBtn = h('button', 'recenter-btn', '⌖ BACK TO THE SHIP <small>Home</small>');
  private commBox = h('div', 'comm-box');
  private commBody = h('div', 'cb-body');
  private commKey = '';
  /** The boxes you can drag about, fold to the side or close once read. */
  private toss: Record<'cmd' | 'zone' | 'mission' | 'obj' | 'track' | 'jobs' | 'comm', Tossable>;
  private mission = h('div', 'mission');
  private stormBar = h('div', 'storm-bar');
  private track = h('div', 'tracker');
  private jobs = h('div', 'jobs');
  private res = h('div', 'resources');
  private menu = h('div', 'menu-buttons');
  private boss = h('div', 'bossbar');
  private bossInfo = h('div', 'bossinfo');
  private bossFocus = h('button', 'boss-focus');
  private bossTarget = 0;
  private streaks = h('div', 'streaks');
  private hubBtns = new Map<Hub, HTMLElement>();
  private streakKey = '';
  private waveBar = h('div', 'wave-bar');
  private buffs = h('div', 'buffbar');
  private toasts = h('div', 'toasts');
  private lvlBanner = h('div', 'lvl-banner');
  private hazard = h('div', 'hazard-warn');
  private hpBox = h('div', 'hp-box');
  private hpFill = h('div', 'fill');
  private shFill = h('div', 'shield');
  private hpText = h('div', 'txt');
  private tankInfo = h('div', 'tank-info');
  /** A Titan's drive readout: speed, the throttle you're asking for, and each crawler bank's speed. */
  private gauge = h('div', 'drive-gauge');
  private gaugeRead = h('div', 'dg-read');
  private gaugeCtl = h('div', 'dg-ctl');
  private odBtn: HTMLButtonElement | null = null;
  private warpBtn: HTMLButtonElement | null = null;
  private jawsBtn: HTMLButtonElement | null = null;
  private focusBtn: HTMLButtonElement | null = null;
  /** Whether the FOCUS button is armed (set by the app). */
  focusArmed: () => boolean = () => false;
  /** Fires, flooding, lost crawlers and failing systems (tap for the bridge status display). */
  private alerts = h('div', 'titan-alerts');
  private kitBtn = h('div', 'kit-btn');
  private driveChip = h('div', 'drive-chip');
  private drivePop = h('div', 'drive-pop');
  private driveKey = '';
  private hand = h('div', 'hand');
  private handSlots: HTMLDivElement[] = [];
  private handKeys: string[] = [];
  private nextCard = h('div', 'next-card');
  private energy = h('div', 'energy');
  private energyFill = h('div', 'en-fill');
  private energyNum = h('div', 'en-num');
  private packBtn = h('div', 'pack-btn');
  private squads = h('div', 'squads');
  private squadKey = '';
  private perkBox = h('div', 'perk-box');
  private perkKey = '';
  private tint = h('div', 'timestop-tint');
  /** Aiming a card: the world slows down (set by the app). */
  slowmo = false;
  private rider = h('div', 'rider-card');
  private hint = h('div', 'hover-hint');
  private death = h('div', 'death');
  private dragGhost = h('div', 'drag-ghost');
  private bottom = h('div', 'hud-bottom');
  /** The status bar along the bottom (cells, hull, the hand, the captain, armour, supplies). */
  private doom = new ShipConsole();
  minimap: HTMLCanvasElement;
  private mmWrap = h('div', 'minimap');
  /** Touch driving stick (bottom left, touch screens only). */
  joy: Joystick;
  private badges = new Map<string, HTMLDivElement>();
  private lastObjective = '';
  private game: Game | null = null;
  /** Hand slot armed by a tap (waiting for a tap on the battlefield). */
  armed = -1;
  private lvlT = 0;
  trackInfo: TrackInfo | null = null;
  private village = false;
  /** A free builder has something affordable to do (checked once a second). */
  private work = false;
  private workT = 0;

  constructor(parent: HTMLElement, private act: HudActions) {
    this.root = h('div', 'hud');
    parent.appendChild(this.root);
    // First, so every other HUD element sits on top of its touch area.
    this.joy = new Joystick(this.root);
    const tl = h('div', 'hud-tl');
    this.commBox.appendChild(this.commBody);
    this.recenterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      act.recenter();
    });
    this.toss = {
      cmd: new Tossable(this.cmd, 'cmd', 'COMMANDER', { noClose: true }),
      zone: new Tossable(this.zone, 'zone', 'ZONE'),
      mission: new Tossable(this.mission, 'mission', 'MISSION'),
      obj: new Tossable(this.obj, 'goal', 'GOAL'),
      track: new Tossable(this.track, 'track', 'TRACKING', { noClose: true }),
      jobs: new Tossable(this.jobs, 'jobs', 'BUILDERS', { noClose: true }),
      comm: new Tossable(this.commBox, 'comm', 'INTERCOM', { wrap: false, onClose: () => {
        if (this.game) this.game.comms.current = null;
      } }),
    };
    tl.append(this.toss.cmd.el, this.toss.zone.el, this.toss.mission.el, this.toss.obj.el, this.toss.track.el, this.toss.jobs.el);
    this.mission.addEventListener('click', (e) => {
      e.stopPropagation();
      act.openPanel('map');
    });
    this.cmd.addEventListener('click', (e) => {
      e.stopPropagation();
      act.openPanel('progress');
    });
    tooltip(this.cmd, () => this.cmdTip());
    this.track.addEventListener('click', (e) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).closest('.tr-x')) act.untrack();
      else act.trackClick();
    });
    this.jobs.addEventListener('click', (e) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).closest('[data-robot]') && this.game) {
        const why = buildRobot(this.game);
        const q = this.game.robotBuild?.queue ?? 0;
        this.toast(why ?? (q ? `Robot queued: ${q + 1} in the workshop.` : `The workshop is building a robot (${ROBOT_TIME}s).`), why ? '#ff8a80' : '#ffb040');
        return;
      }
      const t = (e.target as HTMLElement).closest('[data-open]') as HTMLElement | null;
      if (t?.dataset.open === 'base') act.village(true);
      else if (t) act.openPanel(t.dataset.open!, t.dataset.tab);
    });
    const tr = h('div', 'hud-tr');
    tr.append(this.menu, this.res);
    const tc = h('div', 'hud-tc');
    tc.append(this.waveBar, this.stormBar, this.lvlBanner, this.boss, this.buffs, this.hazard, this.toasts);
    this.boss.append(this.bossInfo, this.bossFocus);
    this.root.appendChild(this.streaks);
    this.streaks.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = (e.target as HTMLElement).closest('[data-ks]') as HTMLElement | null;
      if (b?.classList.contains('ready')) act.callStreak(b.dataset.ks as StreakKind);
    });
    this.bossFocus.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.bossTarget) act.focusOn(this.bossTarget);
    });
    this.lvlBanner.addEventListener('click', (e) => {
      e.stopPropagation();
      this.lvlT = 0;
      this.lvlBanner.style.display = 'none';
      act.openPanel('progress');
    });
    const drops = new Map<Hub, HTMLElement>();
    const closeDrops = (): void => {
      for (const d of drops.values()) d.parentElement!.classList.remove('open');
    };
    document.addEventListener('pointerdown', (e) => {
      if (!(e.target as HTMLElement).closest?.('.menu-btn.hub')) closeDrops();
    });
    const run = (key: string): void => {
      closeDrops();
      if (key === 'base') act.village(!this.village);
      else if (key === 'camp') act.camp();
      else if (key === 'cabin') act.cabin();
      else if (key === 'inside') act.interior();
      else act.openPanel(key);
    };
    for (const m of MENU) {
      if (m.hub) {
        let drop = drops.get(m.hub);
        if (!drop) {
          const hd = HUBS[m.hub];
          const hb = h('div', `menu-btn hub ${m.hub}`, `<b>${hd.label}</b><small>${hd.sub}</small>`);
          const hbadge = h('span', 'badge');
          hb.appendChild(hbadge);
          drop = h('div', 'menu-drop');
          hb.appendChild(drop);
          hb.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = !hb.classList.contains('open');
            closeDrops();
            hb.classList.toggle('open', open);
          });
          drops.set(m.hub, drop);
          this.hubBtns.set(m.hub, hb);
          this.menu.appendChild(hb);
        }
        const it = h('div', `menu-item mi-${m.key}`, `<b>${m.label}</b><small>${m.sub}</small>`);
        it.appendChild(h('span', 'badge'));
        it.addEventListener('click', (e) => {
          e.stopPropagation();
          run(m.key);
        });
        this.badges.set(m.key, it);
        drop.appendChild(it);
        continue;
      }
      const b = h('div', `menu-btn ${m.key} ${m.cls ?? ''}`, `<b>${m.label}</b><small>${m.sub}</small>`);
      b.title = `${m.label === '☰' ? 'MENU' : m.label} (${m.sub})`;
      const badge = h('span', 'badge');
      b.appendChild(badge);
      this.badges.set(m.key, b);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        run(m.key);
      });
      this.menu.appendChild(b);
    }
    // Bottom-left: the fortress.
    const hp = h('div', 'hp-bar');
    hp.append(this.hpFill, this.shFill, this.hpText);
    this.kitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      act.useKit();
    });
    tooltip(this.kitBtn, () => `<h4>Repair Kit <small>[5]</small></h4><div>Restore 25% hull over 3s.</div><div class="d">Make more in CARGO > Workshop.</div>`);
    this.hpBox.append(this.alerts, this.tankInfo, this.gauge, hp, this.kitBtn, this.driveChip, this.drivePop);
    this.gauge.append(this.gaugeRead, this.gaugeCtl);
    for (const [cmd, label, tip] of [['down', '−', 'Throttle down (S)'], ['stop', 'STOP', 'All stop (Space)'], ['up', '+', 'Throttle up (W)'], ['overdrive', 'OVERDRIVE', 'Overdrive (O): a big burst of speed for a lot of fuel, until the engine overheats (Engine Workshop parts change all three)'], ['warp', '⏩ ×1', 'Cruise warp (.): time runs 4x or 8x faster while nothing hostile is near'], ['jaws', 'JAWS', 'Compactor: open the bow\'s jaws and she eats whatever she drives into (buildings, walls, wrecks, small creatures), spitting it out of the stern as bales of scrap. 10% less top speed while open.'], ['focus', 'FOCUS', 'Focus fire: click a foe or a spot (on touch: press FOCUS, then tap) and every gun, battery and roof nest in reach turns on it for 12 s. Press again to lift it.'], ['gun', 'GUN', 'Take a gun (E): work one of the Titan\'s guns yourself on its camera. Aim with the pointer, fire with the button (hold for the light guns, a click a round for the heavies), R reloads, 1-9 or the wheel change guns, Esc gets off it. The helm still answers WASD.']] as const) {
      const b = button(label, (e) => {
        e.stopPropagation();
        act.helm(cmd);
      }, `dg-b ${cmd}`);
      b.title = tip;
      if (cmd === 'overdrive') this.odBtn = b;
      if (cmd === 'warp') this.warpBtn = b;
      if (cmd === 'jaws') this.jawsBtn = b;
      if (cmd === 'focus') this.focusBtn = b;
      this.gaugeCtl.appendChild(b);
    }
    this.alerts.addEventListener('click', (e) => {
      e.stopPropagation();
      act.openPanel('bridge');
    });
    this.driveChip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.drivePop.classList.toggle('open');
      this.driveKey = '';
    });
    this.drivePop.addEventListener('click', (e) => {
      e.stopPropagation();
      const g = this.game;
      const b = (e.target as HTMLElement).closest('[data-drive]') as HTMLElement | null;
      if (!g || !b) return;
      const k = b.dataset.drive!;
      if (k === 'auto') {
        g.autoDrive = !g.autoDrive;
        g.driveSwapT = 0;
        this.toast(g.autoDrive ? 'AUTO drive on: the fortress picks the best drive train for the ground.' : 'AUTO drive off.', '#ffd740');
      } else if (ownsDrive(g, k as DriveKey)) {
        // Picking one by hand turns AUTO off, or it would swap straight back.
        if (g.autoDrive) g.autoDrive = false;
        setDrive(g, k as DriveKey);
        this.drivePop.classList.remove('open');
      } else this.toast(`${DRIVE_INFO[k].name} unlocks at commander level ${DRIVE_LEVEL[k as DriveKey]}.`, '#ff8a80');
      this.driveKey = '';
    });
    tooltip(this.driveChip, () => `<h4>Drive train</h4><div>Every part of the map is drivable; the right drive train makes it fast, and makes lava and acid safe.</div><div class="d">Tap to switch. AUTO picks the best one for the ground by itself.</div>`);
    this.tankInfo.addEventListener('click', (e) => {
      e.stopPropagation();
      act.village(true);
    });
    // Bottom-center: the hand of cards and energy.
    const handWrap = h('div', 'hand-wrap');
    const handRow = h('div', 'hand-row');
    handRow.appendChild(this.nextCard);
    for (let i = 0; i < HAND_SIZE; i++) {
      const s = h('div', 'hand-slot');
      s.dataset.slot = String(i);
      this.bindCardDrag(s, i);
      this.handSlots.push(s);
      this.handKeys.push('');
      this.hand.appendChild(s);
    }
    handRow.appendChild(this.hand);
    this.energy.append(this.energyFill, this.energyNum);
    for (let i = 1; i < 10; i++) this.energy.appendChild(h('i', 'en-tick'));
    this.packBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      act.openPack();
    });
    handWrap.append(this.packBtn, handRow);
    // The hand sits in the middle of the status bar; the helm and hull readout above it on the left.
    this.doom.cards.appendChild(handWrap);
    this.bottom.append(this.hpBox);
    // Bottom-right: squads above the minimap.
    this.minimap = h('canvas');
    this.minimap.width = 220;
    this.minimap.height = 220;
    this.mmWrap.appendChild(this.minimap);
    this.mmWrap.appendChild(h('div', 'mm-hint', 'click: drive there'));
    this.minimap.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const r = this.minimap.getBoundingClientRect();
      act.minimapClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.button === 2);
    });
    this.minimap.addEventListener('contextmenu', (e) => e.preventDefault());
    this.minimap.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      act.minimapZoom(e.deltaY < 0 ? -1 : 1);
    }, { passive: false });
    const zoomBox = h('div', 'mm-zoom');
    for (const [lab, d] of [['+', -1], ['−', 1]] as const) {
      const b = h('button', '', lab);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        act.minimapZoom(d);
      });
      zoomBox.appendChild(b);
    }
    this.mmWrap.appendChild(zoomBox);
    this.root.append(this.tint, tl, tr, tc, this.perkBox, this.squads, this.rider, this.bottom, this.doom.root, this.mmWrap, this.hint, this.death, this.dragGhost, this.gateBtn, this.commBox, this.recenterBtn);
    this.gateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.act.gate();
    });
    for (const el of [tl, tr, this.bottom, this.doom.root, this.squads, this.perkBox, this.rider, this.mmWrap]) el.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  /**
   * Press on a HUD element and drag it out onto the battlefield (mouse or finger). A press that
   * doesn't travel is a tap.
   */
  private bindDrag(el: HTMLElement, o: { ok(e: PointerEvent): boolean; start(): void; move(x: number, y: number, over: boolean): void; drop(x: number, y: number, over: boolean): void; tap?(): void }): void {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !o.ok(e)) return;
      e.preventDefault();
      e.stopPropagation();
      hideTip();
      const id = e.pointerId, sx = e.clientX, sy = e.clientY;
      const slop = e.pointerType === 'mouse' ? 8 : 12;
      try {
        el.setPointerCapture(id);
      } catch {
        /* synthetic events can't be captured */
      }
      let dragging = false;
      const move = (ev: PointerEvent): void => {
        if (ev.pointerId !== id) return;
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > slop) {
          dragging = true;
          this.dragGhost.classList.toggle('finger', ev.pointerType !== 'mouse');
          o.start();
          this.dragGhost.style.display = 'block';
        }
        if (!dragging) return;
        this.dragGhost.style.left = `${ev.clientX}px`;
        this.dragGhost.style.top = `${ev.clientY}px`;
        const over = this.overUI(ev);
        this.dragGhost.classList.toggle('cancel', over);
        o.move(ev.clientX, ev.clientY, over);
      };
      const up = (ev: PointerEvent): void => {
        if (ev.pointerId !== id) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        this.dragGhost.style.display = 'none';
        if (dragging) o.drop(ev.clientX, ev.clientY, ev.type === 'pointercancel' || this.overUI(ev));
        else if (ev.type === 'pointerup') o.tap?.();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  }

  /* ---------------- drag and drop ---------------- */

  /** Drag a card out of the hand and drop it on the battlefield, Clash Royale style. Tap to arm it instead. */
  private bindCardDrag(el: HTMLDivElement, slot: number): void {
    this.bindDrag(el, {
      ok: () => !!this.game?.hand[slot],
      start: () => {
        const g = this.game!;
        this.armed = -1;
        this.dragGhost.innerHTML = '';
        this.dragGhost.appendChild(cardEl(g, g.hand[slot], { mini: true }));
        el.classList.add('dragging');
      },
      move: (x, y, over) => this.act.cardAim(slot, x, y, over),
      drop: (x, y, over) => {
        el.classList.remove('dragging');
        this.act.cardDrop(slot, x, y, over);
      },
      tap: () => this.act.cardTap(slot),
    });
    tooltip(el, () => {
      const g = this.game;
      const id = g?.hand[slot];
      if (!g || !id) return '';
      const d = CARDS[id];
      return `<h4>${esc(d.name)} <small>[${slot + 1}] · ${g.cardCost(id)} energy</small></h4><div class="d">${d.target === 'area' ? 'Drag it onto the battlefield (or tap it, then tap the ground).' : 'Tap it or drag it out to play it on your fortress.'}</div>`;
    });
  }

  private bindSquadDrag(el: HTMLDivElement, type: SquadType): void {
    this.bindDrag(el, {
      ok: (e) => !(e.target as HTMLElement).closest('button'),
      start: () => {
        this.dragGhost.innerHTML = `<div class="sq-ghost" style="border-color:${SQUADS[type].color}">⚑ ${esc(SQUADS[type].name)}<br><small>drop to guard here</small></div>`;
      },
      move: (x, y, over) => this.act.squadAim(type, x, y, over),
      drop: (x, y, over) => this.act.squadDrop(type, x, y, over),
    });
  }

  /** Is the pointer over HUD chrome rather than the battlefield? (The joystick's corner counts as battlefield.) */
  private overUI(ev: MouseEvent): boolean {
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    if (!el) return true;
    if (el.tagName === 'CANVAS' && !el.closest('.minimap')) return false;
    if (el.closest('.joy')) return false;
    return !!el.closest('.hud-bottom, .ship-console, .hud-tl, .hud-tr, .squads, .minimap, .perk-box, .panel-backdrop, .rider-card, .village .v-card, .village .v-top');
  }

  /* ---------------- messages ---------------- */

  /** Someone else who wants the messages too (the cabin's teletype). */
  onToast: ((text: string, color: string) => void) | null = null;

  toast(text: string, color = '#fff'): void {
    this.onToast?.(text, color);
    const t = h('div', 'toast', esc(text));
    t.style.borderLeftColor = color;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 4800);
  }

  setHint(s: string): void {
    setHTML(this.hint, s);
    this.hint.style.display = s ? 'block' : 'none';
  }

  /** Big "LEVEL UP" banner with what the level unlocked. */
  levelUp(r: LevelReward): void {
    const items: string[] = [];
    for (const f of r.features) items.push(`<span class="feat">★ ${esc(f.name)}</span>`);
    for (const m of r.modules) items.push(`<span><img src="${moduleIcon(m.key)}">${esc(m.name)}</span>`);
    for (const t of r.techs.slice(0, 3)) items.push(`<span>${esc(t.name)}</span>`);
    if (r.techs.length > 3) items.push(`<span>+${r.techs.length - 3} more</span>`);
    if (r.relicSlot) items.push('<span class="feat">◈ Relic slot</span>');
    if (r.builder) items.push('<span class="feat">🔨 Extra builder</span>');
    items.push(`<span style="color:${PACK_INFO[r.pack].color}">▣ ${esc(PACK_INFO[r.pack].name)}</span>`);
    this.lvlBanner.innerHTML = `<div class="lb-t">COMMANDER LEVEL ${r.level}!</div><div class="lb-s">+3% hull · +2% damage · fully repaired</div><div class="lb-i">${items.join('')}</div>${r.features.map((f) => `<div class="lb-f"><b>${esc(f.name)}:</b> ${esc(f.desc)}</div>`).join('')}<div class="lb-c">${isTouch() ? 'tap' : 'click'} for the Level Road</div>`;
    this.lvlBanner.style.display = 'block';
    this.lvlBanner.classList.remove('pop');
    void this.lvlBanner.offsetWidth;
    this.lvlBanner.classList.add('pop');
    this.lvlT = r.features.length ? 12 : 7;
  }

  private cmdTip(): string {
    const g = this.game;
    if (!g) return '';
    const c = g.commander;
    const next = levelRoad()[c.level];
    const lines = next ? [...next.features.map((f) => `★ ${f.name}`), ...next.modules.map((m) => m.name), ...next.techs.slice(0, 3).map((t) => t.name), PACK_INFO[next.pack].name] : [];
    return `<h4>Commander level ${c.level}</h4><div>Earn XP by killing enemies, clearing loot areas, outposts, raider tanks and runes.</div>${next ? `<div class="d">Level ${next.level} brings: ${lines.map(esc).join(', ')}</div>` : ''}`;
  }

  /* ---------------- per-frame ---------------- */

  /** Whether the view is dragged away from the fortress (shows the button back). */
  setPanned(on: boolean): void {
    this.recenterBtn.style.display = on ? 'block' : 'none';
  }

  update(g: Game, dt: number, village: boolean): void {
    this.game = g;
    this.village = village;
    const p = g.player;
    // Under way, the panels down the left fade back so they don't sit over her (they come back under the pointer).
    this.root.classList.toggle('moving', g.mode === 'world' && !village && Math.abs(p.speed) > 5);
    // The main gate's clearance button.
    const gp = g.compound.prompt;
    this.gateBtn.style.display = gp && !village ? 'block' : 'none';
    // The intercom.
    const cm = g.comms.current;
    this.commBox.style.display = cm && !village ? 'flex' : 'none';
    if (cm) {
      const key = `${cm.agent}|${cm.text}`;
      if (key !== this.commKey) {
        this.commKey = key;
        const a = AGENTS[cm.agent];
        setHTML(this.commBody, `<img src="${agentFace(cm.agent)}" alt=""><div><b style="color:${a.color}">${a.post} · ${a.name}</b><small>${cm.kind.toUpperCase()}</small><p>${esc(cm.text)}</p></div>`);
      }
    }
    this.toss.comm.setContent(cm ? this.commKey : '');
    if (gp) setHTML(this.gateBtn, `<b>MAIN GATE SEALED</b><span>${gp === 'exit' ? 'REQUEST CLEARANCE TO LEAVE' : 'REQUEST CLEARANCE TO ENTER'}</span>`);
    this.root.classList.toggle('in-village', village);
    // The shop and a building's card sit under the HUD: clear the left column while one is up.
    this.root.classList.toggle('shop-up', village && !!document.querySelector('.v-shop[style*="flex"]'));
    this.root.classList.toggle('in-raid', g.mode === 'raid');
    // Commander
    const c = g.commander;
    const next = levelRoad()[c.level];
    const nextTxt = next ? [...next.features.map((f) => f.name), ...next.modules.map((m) => m.name)].slice(0, 2).join(', ') || PACK_INFO[next.pack].name : 'MAX';
    setHTML(this.cmd, `<div class="cm-lvl">${c.level}</div><div class="cm-body"><div class="cm-t">COMMANDER <small>${c.level >= MAX_COMMANDER_LEVEL ? 'MAX LEVEL' : `next: ${esc(nextTxt)}`}</small></div><div class="cm-bar"><div style="width:${g.xpFrac() * 100}%"></div></div></div>`);
    // Zone
    const z = ZONES[g.map.zoneAt(p.x, p.y)];
    const threat = g.mode === 'raid' ? 4 : threatAt(p.x, p.y);
    const tier = threatTier(threat);
    const zoneName = g.mode === 'raid' ? 'THE DEAD ZONE' : z?.name ?? '';
    let warn = '';
    if (g.mode === 'world' && z) {
      if (z.drive && p.drive !== z.drive && p.drive !== 'hover') warn += `<div class="need">Terrain: ${DRIVE_INFO[z.drive].name} recommended</div>`;
      if (z.hazard && !p.stats.protects.has(z.hazard)) warn += `<div class="need bad">${esc(z.need)}</div>`;
    }
    setHTML(this.zone, `<span class="zn">${esc(zoneName)}</span> <span class="tier t${tier}">THREAT ${TIER_NAMES[tier]}</span>${warn}`);
    this.toss.zone.setContent(`${zoneName}|${tier}|${warn}`);
    // Objective
    if (g.mode === 'world' && g.objective < OBJECTIVES.length) {
      const o = OBJECTIVES[g.objective];
      const okey = `${g.objective}:${isTouch()}`;
      if (this.lastObjective !== okey) {
        this.lastObjective = okey;
        const rw = Object.entries(o.reward).map(([id, n]) => `<img src="${itemIcon(id)}">${n}`).join(' ');
        setHTML(this.obj, `<div class="ot">GOAL ${g.objective + 1}/${OBJECTIVES.length}</div><div class="on">${esc(o.title)}</div><div class="oh">${esc((isTouch() && o.touch) || o.hint)}</div><div class="or">Reward: ${rw}</div>`);
      }
      this.obj.style.display = 'block';
      this.toss.obj.setContent(okey);
    } else this.obj.style.display = 'none';
    this.updateTracker(g);
    this.updateJobs(g);
    // Resources
    const res = ['scrap', 'iron_plate', 'copper_wire', 'circuit', 'titanium_alloy', 'tech_parts'].map((id) => `<span title="${getItem(id).name}"><img src="${itemIcon(id)}">${p.cargo.count(id)}</span>`);
    const sh = shift(g);
    const l = g.life;
    const food = p.cargo.count('rations');
    const foodMins = sh.eatPerMin > sh.growPerMin ? food / Math.max(0.01, sh.eatPerMin - sh.growPerMin) : Infinity;
    res.push(`<span class="crewchip ${sh.resting < sh.needRest ? 'warn' : ''}" title="People aboard / bunks. On duty ${sh.onDuty} (of ${p.stats.crewWanted} posts), resting ${sh.resting} (need ${sh.needRest} resting to rotate shifts).">👥 ${p.troops}/${p.stats.bunks}</span>`);
    res.push(`<span class="${food < 5 || foodMins < 3 ? 'warn' : ''}" title="Rations: ${sh.eatPerMin.toFixed(1)}/min eaten, ${sh.growPerMin.toFixed(1)}/min grown${foodMins !== Infinity ? ` · runs out in ~${Math.ceil(foodMins)} min` : ''}"><img src="${itemIcon('rations')}">${food}</span>`);
    if (l.fatigue > 0.05 || l.hunger > 0.05) res.push(`<span class="warn" title="Crew fatigue and hunger slow every station and gun">${l.fatigue > 0.05 ? `😴${Math.round(l.fatigue * 100)}%` : ''}${l.hunger > 0.05 ? ` 🍽${Math.round(l.hunger * 100)}%` : ''}</span>`);
    setHTML(this.res, res.join(''));
    // The mission (the campaign goal).
    if (g.mode === 'world') {
      const ms = mission(g);
      const dist = ms.x !== undefined && ms.y !== undefined ? Math.hypot(ms.x - p.x, ms.y - p.y) : 0;
      const eta = dist > 0 ? Math.ceil(dist / Math.max(1, p.stats.topSpeed) / 60) : 0;
      const chap = CHAPTERS[Math.min(CHAPTERS.length - 1, g.story.chapter)];
      setHTML(this.mission, `<div class="mt" title="${esc(chap.title)}">${esc(chap.sub.toUpperCase())} · ${ms.step}/${ms.of}${dist > 0 ? ` · ${dist > 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`}${eta ? ` · ~${eta} min` : ''}` : ''}</div><div class="mn">${esc(ms.title)}</div><div class="mh">${esc(ms.text)}</div>`);
      this.mission.style.display = 'block';
      this.toss.mission.setContent(`${ms.title}|${ms.step}`);
    } else this.mission.style.display = 'none';
    // Storms.
    const w = g.weather;
    if (g.mode === 'world' && w.phase !== 'none' && w.kind) {
      const sd = STORMS[w.kind];
      this.stormBar.style.display = 'block';
      this.stormBar.style.setProperty('--sc', sd.color);
      setHTML(this.stormBar, w.phase === 'warning' ? `⚠ ${esc(sd.name.toUpperCase())} IN ${Math.ceil(w.t)}s` : `🌪 ${esc(sd.name.toUpperCase())} · ${Math.ceil(w.t)}s · soldiers inside`);
    } else this.stormBar.style.display = 'none';
    // Menu buttons (features appear as you level)
    for (const m of MENU) {
      const b = this.badges.get(m.key)!;
      const f = m.feature ? FEATURES.find((k) => k.key === m.feature) : undefined;
      b.style.display = !f || c.level >= f.level || (m.key === 'arsenal' && g.armory.length > 0) ? '' : 'none';
      b.classList.toggle('on', (m.key === 'base' && village) || (m.key === 'camp' && g.deploy.state !== 'mobile'));
      if (m.key === 'shipyard') b.style.display = g.mode === 'world' && isDocked(g) ? '' : 'none';
      if (m.key === 'bridge' || m.key === 'cabin' || m.key === 'inside' || m.key === 'hangar' || m.key === 'bounty') b.style.display = g.mode === 'world' && g.player.titan ? '' : 'none';
      if (m.key === 'camp') {
        b.style.display = g.mode === 'world' ? '' : 'none';
        setHTML(b.querySelector('b')!, g.deploy.state === 'up' ? 'PACK UP' : g.deploy.state === 'deploying' ? 'DEPLOYING' : g.deploy.state === 'packing' ? 'PACKING' : 'CAMP');
      }
    }
    const badge = (k: string, txt: string): void => {
      const s = this.badges.get(k)!.querySelector('.badge') as HTMLElement;
      s.style.display = txt ? 'block' : 'none';
      s.textContent = txt;
    };
    badge('crew', g.crew.some((k) => k.draft) ? '★' : '');
    const upCard = Object.entries(g.cards).some(([id, k]) => CARDS[id] && k.level < 10 && k.shards >= Math.ceil(k.level * [4, 3, 2, 2, 1, 1][CARDS[id].rarity]));
    badge('cards', g.packs.length ? String(g.packs.length) : upCard ? '⬆' : '');
    this.workT -= dt;
    if (this.workT <= 0) {
      this.workT = 1;
      this.work = g.mode === 'world' && builderWork(g);
    }
    badge('base', this.work ? '🔨' : '');
    const pts = [...g.armory, ...p.weapons().map((m) => m.weapon!)].some((w) => (w.tree ?? []).length < treePoints(w));
    const spare = g.armory.length > 0 && p.hardpoints().some((m) => !m.weapon && m.built);
    badge('arsenal', spare ? '!' : pts ? '★' : '');
    // A hub shows a mark when anything in its list wants attention.
    for (const [hub, hb] of this.hubBtns) {
      const flag = MENU.some((m) => m.hub === hub && this.badges.get(m.key)!.style.display !== 'none' && (this.badges.get(m.key)!.querySelector('.badge') as HTMLElement).style.display === 'block');
      (hb.querySelector(':scope > .badge') as HTMLElement).style.display = flag ? 'block' : 'none';
      (hb.querySelector(':scope > .badge') as HTMLElement).textContent = flag ? '!' : '';
    }
    // Horde wave
    const ws = waveStatus(g);
    if (ws) {
      this.waveBar.style.display = 'block';
      this.waveBar.classList.toggle('urgent', ws.urgent);
      setHTML(this.waveBar, `<div class="wb-t">${ws.urgent ? '☣ ' : ''}${esc(ws.label)}</div><div class="wb-b"><div style="width:${Math.round(Math.max(0, Math.min(1, ws.frac)) * 100)}%"></div></div>`);
    } else this.waveBar.style.display = 'none';
    // Boss bar
    // Measured to the hull: a Titan is 200 m long.
    const near = (e: { x: number; y: number }, r: number): boolean => p.edgeDist(e.x, e.y) < r;
    const titan = g.enemies.find((e) => e.boss && e.hp > 0 && near(e, 600)) ?? g.enemies.find((e) => e.titan && e.hp > 0 && near(e, 400));
    const rival = g.tanks.find((t) => t.kind === 'rival' && !t.dead && Math.hypot(t.x - p.x, t.y - p.y) < 700);
    const col = g.colossi.find((c) => c.dying <= 0 && Math.hypot(c.x - p.x, c.y - p.y) < 2500);
    if (col) {
      // A colossus: its health, how many weak points still stand, whether the core is open, and how far off it is.
      const d = COLOSSI[col.kind];
      const h = colossusHealth(g, col);
      const standing = col.parts.filter((id, i) => !d.weak[i].core && (g.enemies.find((e) => e.id === id)?.hp ?? 0) > 0).length;
      const total = d.weak.filter((w) => !w.core).length;
      this.boss.style.display = 'block';
      this.boss.classList.add('colossus');
      const core = col.parts.map((id) => g.enemies.find((e) => e.id === id)).find((e, i) => e && e.hp > 0 && (col.open ? d.weak[i].core : !d.weak[i].core));
      this.bossTarget = core?.id ?? 0;
      setHTML(this.bossInfo, `<div class="bn">☠ ${esc(d.name.toUpperCase())} <small>${esc(d.title)} · ${Math.round(Math.hypot(col.x - p.x, col.y - p.y))} m</small></div><div class="bb"><div style="width:${(h.hp / Math.max(1, h.max)) * 100}%"></div></div><div class="bw">WEAK POINTS ${standing}/${total} · CORE ${col.open ? '<b>OPEN: HIT IT</b>' : 'ARMOURED'}</div>`);
    } else if (rival) {
      this.boss.classList.remove('colossus');
      this.boss.style.display = 'block';
      const hp = (rival.hp + rival.shield) / (rival.stats.maxHp + rival.stats.shield);
      this.bossTarget = rival.id;
      setHTML(this.bossInfo, `<div class="bn">${esc(rival.name)} <small>RIVAL ${esc(chassisForCC(rival.stats.cc).name.toUpperCase())} · ${Math.round(Math.hypot(rival.x - p.x, rival.y - p.y))}m</small></div><div class="bb"><div style="width:${hp * 100}%"></div></div>`);
    } else if (titan) {
      this.boss.classList.remove('colossus');
      this.boss.style.display = 'block';
      this.bossTarget = titan.id;
      setHTML(this.bossInfo, `<div class="bn">${esc(titan.name)} <small>${titan.boss ? 'BOSS' : 'GIANT'} · ${Math.round(ENEMIES[titan.kind]?.size ?? titan.r * 2)} m</small></div><div class="bb"><div style="width:${(titan.hp / titan.maxHp) * 100}%"></div></div>`);
    } else {
      this.boss.style.display = 'none';
      this.bossTarget = 0;
    }
    if (this.bossTarget) {
      const ap = p.aimPoint;
      const on = !!ap && ap.id === this.bossTarget;
      this.bossFocus.classList.toggle('on', on);
      this.bossFocus.textContent = on ? `● ALL GUNS ON TARGET · ${Math.ceil(ap!.t)}s` : '◎ FOCUS ALL GUNS';
      this.bossFocus.style.display = 'block';
    } else this.bossFocus.style.display = 'none';
    // Killstreaks: the streak, what each reward needs, the ones banked and ready to call in.
    const st = g.streak;
    const showKs = g.mode === 'world' && !village && !st.active && (st.pts > 0 || st.ready.length > 0);
    this.streaks.style.display = showKs ? 'flex' : 'none';
    if (showKs) {
      const key = `${Math.floor(st.pts)}|${st.ready.join(',')}`;
      if (key !== this.streakKey) {
        this.streakKey = key;
        setHTML(this.streaks, `<div class="pts">KILLSTREAK ${Math.floor(st.pts)}</div>` + STREAK_ORDER.map((k) => {
          const d = STREAKS[k];
          const ready = st.ready.includes(k);
          return `<div class="ks ${ready ? 'ready' : ''}" data-ks="${k}" style="--kc:${d.color}" title="${esc(d.desc)}"><b>${esc(d.name.toUpperCase())}</b>${ready ? `READY · ${isTouch() ? 'TAP' : 'R / CLICK'}` : `${Math.floor(Math.min(st.pts, d.pts))}/${d.pts}`}<i style="width:${Math.min(1, st.pts / d.pts) * 100}%"></i></div>`;
        }).join(''));
      }
    }
    // Level banner timer
    if (this.lvlT > 0) {
      this.lvlT -= dt;
      if (this.lvlT <= 0) this.lvlBanner.style.display = 'none';
    }
    // Buffs
    const b: string[] = [];
    if (g.runeBuff) b.push(`<span style="color:${RUNE_INFO[g.runeBuff.rune].color}">◆ ${RUNE_INFO[g.runeBuff.rune].name} ${Math.ceil(g.runeBuff.t)}s</span>`);
    const names: Record<string, string> = {
      barrage: 'Barrage', nitro: 'Nitro', invuln: 'Invulnerable', deadeye: 'Deadeye', meltdown: 'Meltdown', armorUp: 'Nanites', barrier: 'Barrier', harvestUp: 'Fast Harvest',
      stun: 'STUNNED', chill: 'Slowed', regen: 'Repairing', dome: 'Aegis Dome', smoke: 'Smoke Screen', blitz: 'Blitz', frenzy: 'Salvage Frenzy', soul: 'Soul Harvest', scholar: 'Scholar',
    };
    for (const [k, v] of p.buffs) if (names[k]) b.push(`<span>${names[k]} ${Math.ceil(v.t)}s</span>`);
    if (g.chestBonus > 0) b.push('<span style="color:#ffd23f">Next chest +1 rarity</span>');
    if (g.timeStop > 0) b.push(`<span style="color:#18ffff">TIME STOP ${Math.ceil(g.timeStop)}s</span>`);
    if (g.orbital) b.push(`<span style="color:#ff1744">ORBITAL LASER ${Math.ceil(g.orbital.t)}s · steer with ${isTouch() ? 'your finger' : 'the mouse'}</span>`);
    if (g.storm) b.push(`<span style="color:#82b1ff">CATACLYSM ${Math.ceil(g.storm.t)}s</span>`);
    this.tint.style.display = g.timeStop > 0 || this.slowmo ? 'block' : 'none';
    this.tint.classList.toggle('aim', this.slowmo && g.timeStop <= 0);
    setHTML(this.buffs, b.join(''));
    if (g.hazardWarn) {
      this.hazard.style.display = 'block';
      setText(this.hazard, `⚠ ${g.hazardWarn}`);
    } else this.hazard.style.display = 'none';
    // Fortress
    const ch = chassisForCC(p.stats.cc);
    const al = g.mode === 'world' && !p.dead ? titanAlerts(g) : [];
    this.alerts.style.display = al.length ? '' : 'none';
    setHTML(this.alerts, al.map((a) => `<span style="color:${a.color};border-color:${a.color}">${esc(a.text)}</span>`).join(''));
    this.gauge.style.display = p.fortress && !p.dead ? '' : 'none';
    if (p.fortress && !p.dead) {
      const top = Math.max(1, Math.min(TITAN.cap, p.stats.topSpeed));
      const bar = (v: number): string => `<div class="dg-side"><i class="${v < -0.05 ? 'rev' : ''}" style="width:${Math.round(Math.min(1, Math.abs(v) / top) * 100)}%"></i></div>`;
      const thr = p.throttle;
      this.odBtn?.classList.toggle('on', g.helm.overdrive);
      if (this.warpBtn) {
        setText(this.warpBtn, `⏩ ×${g.warp}`);
        this.warpBtn.classList.toggle('on', g.warp > 1);
        if (this.jawsBtn) this.jawsBtn.classList.toggle('on', g.helm.plow);
        if (this.focusBtn) {
          const ap = g.player.aimPoint;
          this.focusBtn.classList.toggle('on', !!ap || this.focusArmed());
          this.focusBtn.textContent = ap ? `FOCUS ${Math.ceil(ap.t)}` : 'FOCUS';
        }
      }
      setHTML(this.gaugeRead, `<div class="dg-spd"><b>${Math.round(Math.abs(p.speed) * 3.6)}</b><small>km/h${p.speed < -0.05 ? ' R' : ''}</small></div>`
        + `<div class="dg-thr" title="Throttle"><i class="${thr < 0 ? 'rev' : ''}" style="height:${Math.round(Math.min(1, Math.abs(thr)) * 100)}%"></i></div>`
        + `<div class="dg-lr"><span>L</span>${bar(p.sideSpeed[0])}<span>R</span>${bar(p.sideSpeed[1])}</div>`
        // Engine revs (it has to spool up before she really pulls) and overdrive heat.
        + `<div class="dg-eng"><span>RPM</span><div class="dg-side"><i class="rpm${p.spool > 0.92 ? ' full' : ''}" style="width:${Math.round(p.spool * 100)}%"></i></div>`
        + `<span>HEAT</span><div class="dg-side"><i class="heat${g.helm.overheat ? ' trip' : ''}" style="width:${Math.round(g.helm.heat * 100)}%"></i></div></div>`
        + `<div class="dg-note">${p.anchored ? 'ANCHORED' : g.helm.overheat ? 'OVERHEATED: COOLING' : Math.abs(p.yawRate) > 0.01 ? (p.yawRate > 0 ? 'TURNING RIGHT' : 'TURNING LEFT') : Math.abs(p.speed) < 0.1 ? (thr ? 'SPOOLING UP' : 'STOPPED') : thr && p.spool < 0.9 ? 'SPOOLING UP' : thr === 0 ? 'COASTING' : 'UNDER WAY'}</div>`);
    }
    setHTML(this.tankInfo, `<b>${esc(ch.name)}</b> <span>CC L${p.stats.cc} · ${Math.round(Math.min(p.fortress ? TITAN.cap : 99, p.stats.topSpeed) * 3.6)} km/h max · ${Math.round(p.stats.armor * 100)}% armor${p.stats.powerRatio < 1 ? ' · <i class="bad">LOW POWER</i>' : ''}</span>`);
    this.hpFill.style.width = `${(p.hp / p.stats.maxHp) * 100}%`;
    const barrier = p.buff('barrier')?.v ?? 0;
    this.shFill.style.width = `${Math.min(100, ((p.shield + barrier) / p.stats.maxHp) * 100)}%`;
    setText(this.hpText, `${Math.ceil(p.hp)} / ${p.stats.maxHp}${p.stats.shield ? `  ⛨ ${Math.ceil(p.shield)}` : ''}${barrier > 0 ? `  +${Math.ceil(barrier)}` : ''}`);
    setHTML(this.kitBtn, `<img src="${itemIcon('repair_kit')}"><span class="k">5</span><span class="n">${p.cargo.count('repair_kit')}</span>`);
    this.updateDrive(g);
    this.updateHand(g);
    this.doom.update(g, dt);
    this.updateSquads(g);
    this.updatePerks(g);
    this.updateRider(g);
    if (p.dead && g.mode === 'world') {
      this.death.style.display = 'flex';
      setHTML(this.death, `<div><h2>FORTRESS DISABLED</h2><p>Your crew is towing it back to camp... ${Math.ceil(g.respawnIn)}</p><p class="d">It comes back fully repaired. You dropped a quarter of your scrap.</p></div>`);
    } else this.death.style.display = 'none';
  }

  /* ---------------- drive train ---------------- */

  private updateDrive(g: Game): void {
    const p = g.player;
    const open = this.drivePop.classList.contains('open');
    const best = DRIVES.filter((k) => ownsDrive(g, k)).reduce((a, k) => (driveScore(g, k) > driveScore(g, a) + 0.05 ? k : a), p.drive);
    const key = `${p.drive}:${g.autoDrive}:${open}:${best}:${DRIVES.map((k) => (ownsDrive(g, k) ? 1 : 0)).join('')}`;
    if (key === this.driveKey) return;
    this.driveKey = key;
    this.driveChip.classList.toggle('warn', best !== p.drive && !g.autoDrive);
    setHTML(this.driveChip, `<img src="${itemIcon(DRIVE_ITEM[p.drive])}"><span>${esc(DRIVE_INFO[p.drive].name)}</span>${g.autoDrive ? '<b>AUTO</b>' : ''}`);
    if (!open) return;
    const rows = DRIVES.map((k) => {
      const own = ownsDrive(g, k);
      return `<div class="dp-row ${p.drive === k ? 'on' : ''} ${own ? '' : 'locked'}" data-drive="${k}"><img src="${itemIcon(DRIVE_ITEM[k])}"><div><b>${esc(DRIVE_INFO[k].name)}</b>${k === best && k !== p.drive ? ' <span class="good">best here</span>' : ''}<small>${own ? esc(DRIVE_INFO[k].best) : `🔒 commander level ${DRIVE_LEVEL[k]}`}</small></div></div>`;
    }).join('');
    setHTML(this.drivePop, `<div class="dp-head">DRIVE TRAIN</div>${rows}<div class="dp-row auto ${g.autoDrive ? 'on' : ''}" data-drive="auto"><b>AUTO: ${g.autoDrive ? 'ON' : 'OFF'}</b><small>swap to the best one for the ground</small></div>`);
  }

  /* ---------------- cards ---------------- */

  private updateHand(g: Game): void {
    const max = g.maxEnergy();
    const e = g.energy;
    this.energyFill.style.width = `${(e / max) * 100}%`;
    setText(this.energyNum, String(Math.floor(e)));
    const ticks = this.energy.querySelectorAll('.en-tick');
    ticks.forEach((t, i) => ((t as HTMLElement).style.left = `${((i + 1) / max) * 100}%`));
    for (let i = 0; i < ticks.length; i++) (ticks[i] as HTMLElement).style.display = i + 1 < max ? '' : 'none';
    for (let i = 0; i < HAND_SIZE; i++) {
      const id = g.hand[i] ?? '';
      const s = this.handSlots[i];
      const key = `${id}:${g.cardLevel(id)}:${g.cardCost(id)}`;
      if (key !== this.handKeys[i]) {
        this.handKeys[i] = key;
        s.innerHTML = '';
        if (id) {
          const el = cardEl(g, id, { mini: true });
          el.appendChild(h('div', 'hk', String(i + 1)));
          el.appendChild(h('div', 'mc-need'));
          s.appendChild(el);
          s.classList.remove('drawn');
          void s.offsetWidth;
          s.classList.add('drawn');
        }
      }
      const block = id ? cardBlock(g, i) : 'empty';
      const cost = g.cardCost(id);
      s.classList.toggle('ready', !block);
      s.classList.toggle('armed', this.armed === i);
      const need = s.querySelector('.mc-need') as HTMLElement | null;
      if (need) need.style.height = block && cost > 0 ? `${Math.max(0, 1 - e / cost) * 100}%` : '0';
    }
    const nx = g.queue[0];
    setHTML(this.nextCard, nx ? `<small>NEXT</small>${cardEl(g, nx, { mini: true }).outerHTML}` : '');
    this.packBtn.style.display = g.packs.length ? 'block' : 'none';
    if (g.packs.length) setHTML(this.packBtn, `▣ ${g.packs.length} CARD PACK${g.packs.length > 1 ? 'S' : ''} <b>OPEN</b>`);
  }

  /* ---------------- squads ---------------- */

  private updateSquads(g: Game): void {
    const types = activeSquads(g);
    const key = types.map((t) => {
      const b = squadBuilding(g, t);
      return `${t}:${g.squads[t]?.order}:${squadUnits(g, t).length}:${b?.lvl}:${squadStatus(g, t)}`;
    }).join('|') + `|${g.mode}`;
    if (key === this.squadKey) return;
    this.squadKey = key;
    this.squads.innerHTML = '';
    if (!types.length || g.mode !== 'world') {
      this.squads.style.display = 'none';
      return;
    }
    this.squads.style.display = 'flex';
    for (const t of types) {
      const d = SQUADS[t];
      const b = squadBuilding(g, t)!;
      const sq = g.squads[t];
      const el = h('div', `sq-chip ${sq?.order ?? ''}`);
      el.style.borderColor = d.color;
      el.innerHTML = `<div class="sq-top"><img src="${moduleIcon(d.building)}"><div><b style="color:${d.color}">${esc(d.name)}</b><small>${squadUnits(g, t).length}/${squadSize(d, b.lvl)} · ${esc(squadStatus(g, t))}</small></div></div>`;
      const row = h('div', 'sq-btns');
      row.appendChild(button('⌂', () => setSquadOrder(g, t, 'follow'), `small ${sq?.order === 'follow' ? 'on' : ''}`));
      if (d.canScavenge) row.appendChild(button('SCAVENGE', () => setSquadOrder(g, t, 'scavenge'), `small ${sq?.order === 'scavenge' ? 'on' : ''}`));
      row.appendChild(h('span', 'sq-drag', '⚑ drag to guard'));
      el.appendChild(row);
      this.bindSquadDrag(el, t);
      tooltip(el, () => `<h4 style="color:${d.color}">${esc(d.name)}</h4><div>${esc(d.desc)}</div><div class="d">⌂ follow the fortress · drag the badge onto the map to guard that spot${d.canScavenge ? ' · SCAVENGE: collect loot drops and harvest nodes ahead, then bring the haul home' : ''}.<br>Upgrade the ${esc(MODULES[d.building].name)} for more and stronger units.</div>`);
      this.squads.appendChild(el);
    }
  }

  /* ---------------- tracker & jobs ---------------- */

  private updateTracker(g: Game): void {
    const t = this.trackInfo;
    if (!t || g.mode !== 'world') {
      this.track.style.display = 'none';
      return;
    }
    this.track.style.display = 'block';
    const rows = t.needs.map((n) => `<div class="tr-n ${n.have >= n.need ? 'ok' : ''}">${n.id === 'shards' ? '<span class="tr-card">▣</span>' : `<img src="${itemIcon(n.id)}">`}<span>${esc(n.name)}</span><b>${n.have}/${n.need}</b></div>`).join('');
    setHTML(this.track, `<div class="tr-h">◎ TRACKING <span class="tr-x" title="Stop tracking">✕</span></div><div class="tr-t">${esc(t.title)}</div>${rows}<div class="tr-hint ${t.ready ? 'good' : ''}">${esc(t.hint)}</div><div class="tr-c">${t.ready ? `${isTouch() ? 'Tap' : 'Click'} to open your base` : t.target && t.target.kind !== 'base' ? 'Follow the yellow marker' : ''}</div>`);
    this.track.classList.toggle('ready', t.ready);
  }

  private updateJobs(g: Game): void {
    if (g.mode !== 'world') {
      this.jobs.style.display = 'none';
      return;
    }
    const lines: string[] = [];
    for (const j of g.builds) {
      const m = g.player.moduleById(j.modId);
      if (!m) continue;
      lines.push(`<div class="rw" data-open="base"><small>${j.kind === 'build' ? '🔨 BUILDING' : `⬆ LEVEL ${j.to}`}</small> ${esc(MODULES[m.key].name)}<div class="bar"><div style="width:${(j.t / j.total) * 100}%"></div></div><small>${fmtTime(j.total - j.t)}</small></div>`);
    }
    const free = g.freeBuilders();
    if (free > 0 && !this.village) lines.push(`<div class="rw idle" data-open="base"><small>🔨 ${free} builder${free > 1 ? 's' : ''} free</small> tap to build or upgrade</div>`);
    // Builder robots: how many, the one being made, or a button to make one.
    const rb = g.robotBuild;
    const tip = `A robot: one more builder, and repair crews work ${Math.round(ROBOT_REPAIR * 100)}% faster. 20 scrap, ${ROBOT_TIME}s in the workshop. Tap again to queue more.`;
    if (rb) lines.push(`<div class="rw robot" data-robot="1" title="${tip}"><small>🤖 WORKSHOP${rb.queue ? ` +${rb.queue} QUEUED` : ''}</small> robot ${g.robots + 1} · tap: +1<div class="bar"><div style="width:${(rb.t / ROBOT_TIME) * 100}%"></div></div><small>${fmtTime(ROBOT_TIME - rb.t)}</small></div>`);
    else if (!this.village && robotsComing(g) < robotCap(g)) {
      const ok = !robotBlocked(g);
      lines.push(`<div class="rw robot ${ok ? '' : 'idle'}" data-robot="1" title="${tip}"><small>🤖 ${g.robots}/${robotCap(g)} ROBOTS</small> ${ok ? 'tap: build one (20 scrap)' : 'need 20 scrap'}</div>`);
    } else if (g.robots) lines.push(`<div class="rw idle"><small>🤖 ${g.robots} ROBOTS</small> at work</div>`);
    const job = g.forgeJob;
    if (job) {
      const w = [...g.armory, ...g.player.weapons().map((m) => m.weapon!)].find((k) => k.uid === job.uid);
      const sp = forgeSpeed(g);
      lines.push(`<div class="rw forge" data-open="arsenal" data-tab="weapons"><small>FORGE</small> ${esc(w ? WEAPONS[w.key].name : '?')} → ${job.to + 1}★<div class="bar"><div style="width:${(job.t / job.total) * 100}%"></div></div><small>${sp > 0 ? fmtTime((job.total - job.t) / sp) : 'no forge'}</small></div>`);
    }
    const html = lines.join('');
    setHTML(this.jobs, html);
    this.jobs.style.display = html ? 'block' : 'none';
  }

  /* ---------------- crew perks ---------------- */

  private updatePerks(g: Game): void {
    const c = g.mode === 'world' ? g.crew.find((k) => k.draft) : undefined;
    const pending = g.crew.filter((k) => k.draft).length;
    const key = c ? `${c.id}:${c.level}:${c.draft!.map((d) => `${d.id}${d.rarity}`).join(',')}:${pending}` : '';
    if (key === this.perkKey) return;
    this.perkKey = key;
    this.perkBox.innerHTML = '';
    if (!c) {
      this.perkBox.style.display = 'none';
      return;
    }
    this.perkBox.style.display = 'block';
    this.perkBox.appendChild(h('div', 'pk-head', `<img src="${portrait(c)}"><div><b>CREW LEVEL UP!</b><br>${esc(c.name)} <small>L${c.level} ${esc(ROLES[c.role].name)}</small><br><small>${isTouch() ? 'Tap' : 'Click'} a perk${pending > 1 ? ` · ${pending - 1} more waiting` : ''}</small></div>`));
    c.draft!.forEach((pk, i) => {
      const d = PERK_BY_ID.get(pk.id);
      if (!d) return;
      const card = h('div', `pk-card r${pk.rarity}`);
      card.style.borderColor = RARITIES[pk.rarity].color;
      card.innerHTML = `<div class="rk" style="color:${RARITIES[pk.rarity].color}">${RARITIES[pk.rarity].name}${d.minLevel ? (d.minLevel >= 8 ? ' · MASTER' : ' · VETERAN') : ''}</div><b>${esc(d.name)}</b><div>${esc(perkText(pk.id, pk.rarity))}</div>`;
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.act.pickPerk(c.id, i);
        this.perkKey = '';
      });
      this.perkBox.appendChild(card);
    });
  }

  /* ---------------- outrider ---------------- */

  private riderKey = '';

  private updateRider(g: Game): void {
    const t = g.outrider;
    let key = '';
    if (g.mode !== 'world' || g.commander.level < 12) key = 'none';
    else if (!g.outriderUnlocked()) key = 'none';
    else if (g.outriderLevel === 0 || !t) key = `build:${g.outriderLevel}:${Math.ceil(g.outriderRebuild)}:${g.player.stats.garage}`;
    else key = `live:${g.outriderOrder.mode}:${'phase' in g.outriderOrder ? g.outriderOrder.phase : ''}:${Math.round((t.hp / t.stats.maxHp) * 20)}:${g.outriderCrew().length}:${t.cargo.stacks().length}`;
    if (key === this.riderKey) return;
    this.riderKey = key;
    this.rider.innerHTML = '';
    if (key === 'none') {
      this.rider.style.display = 'none';
      return;
    }
    this.rider.style.display = 'block';
    if (key.startsWith('build')) {
      this.rider.innerHTML = `<div class="rt">OUTRIDER</div><div class="rd">${g.player.stats.garage ? g.outriderRebuild > 0 ? `Rebuilding... ${Math.ceil(g.outriderRebuild)}s` : 'Ready to launch from the Garage.' : 'Build a <b>Garage</b> first.'}</div>`;
      if (g.player.stats.garage && g.outriderRebuild <= 0) {
        const b = button(g.outriderLevel ? 'Rebuild' : 'Launch', () => this.act.outrider('launch'));
        tooltip(b, () => `Cost: ${Object.entries(OUTRIDER_COST).map(([k, n]) => `${n} ${getItem(k).name}`).join(', ')}`);
        this.rider.appendChild(b);
      }
      return;
    }
    const o = g.outriderOrder;
    const status = o.mode === 'expedition' ? `Expedition: ${o.phase}` : o.mode === 'hold' ? 'Holding position' : 'Following';
    this.rider.innerHTML = `<div class="rt">OUTRIDER <small>${esc(status)}</small></div><div class="hp-mini"><div style="width:${(t!.hp / t!.stats.maxHp) * 100}%"></div></div>`;
    const row = h('div', 'rbtns');
    row.append(button('Follow', () => this.act.outrider('follow')), button('Hold', () => this.act.outrider('hold')), button('Send (J)', () => this.act.outrider('send')));
    this.rider.appendChild(row);
  }
}
