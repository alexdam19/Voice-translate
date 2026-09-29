import type { CrewMember } from './game/crew';
import { KIT_KEY } from './shared/constants';
import { NODE_INFO, RUNE_INFO, SITE_INFO } from './shared/mapgen';
import { wrapAngle } from './shared/types';
import { Audio } from './game/audio';
import { CARDS, HAND_SIZE, SCHOOLS } from './game/cards';
import type { ChestKind, Reward } from './game/entities';
import { Game } from './game/game';
import { Input } from './game/input';
import { deserialize, loadSave, saveGame } from './game/save';
import { choosePerk, openPack, untrack } from './game/actions';
import { featureLevel } from './game/progress';
import { SQUADS, type SquadType } from './game/squads';
import { castRange, cardBlock, clampCast, playCard } from './game/systems/cards';
import { orderAttack, orderHarvest, orderInteract, orderMove } from './game/systems/orders';
import { launchOutrider, OUTRIDER_COST, sendOutrider } from './game/systems/outrider';
import { setSquadOrder } from './game/systems/squads';
import { installHandlers, stepWorld, warpBlocked } from './game/systems/step';
import { trackInfo } from './game/systems/tracking';
import { Minimap } from './render/minimap';
import { deckHeight } from './render/models';
import type { HullClass } from './game/classes';
import { toggleDeploy } from './game/systems/camp';
import { isDocked, mission } from './game/campaign';
import { Overlay, type VillageState } from './render/overlay';
import { View2D } from './render/view2d';
import { Cabin } from './ui/cabin';
import { Interior } from './ui/interior';
import { Aboard } from './game/aboard';
import { ChestUI } from './ui/chest';
import { CURSORS, initCursors } from './ui/cursors';
import { hideTip } from './ui/dom';
import { Hud } from './ui/hud';
import { OBJECTIVES } from './ui/objectives';
import { Panels } from './ui/panels';
import { Title } from './ui/title';
import { VillageUI } from './ui/village';
import { DeadZoneClient } from './net/deadzone';
import { engineSpec } from './game/systems/engine';

const STEP = 1 / 60;

interface Hover {
  kind: 'enemy' | 'tank' | 'node' | 'site' | 'rune' | 'gate' | 'pickup' | 'ground';
  id: number;
  x: number;
  y: number;
  label: string;
}

/** Camera distance around a Titan Crawler (m): default, nearest and furthest. Phones sit a little closer. */
const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const TITAN_ZOOM = COARSE ? 300 : 360;
const TITAN_MIN = 110, TITAN_MAX = COARSE ? 1000 : 1400;

export class App {
  game!: Game;
  view: View2D;
  overlay: Overlay;
  minimap = new Minimap();
  input: Input;
  audio = new Audio();
  hud: Hud;
  panels: Panels;
  chest: ChestUI;
  title: Title;
  villageUI: VillageUI;
  /** The captain's cabin (first person, at the bow). */
  cabin: Cabin;
  /** Inside the Titan: every deck cut open, with the crew. */
  interior: Interior;
  /** Everyone aboard, one by one (for the interior views). */
  aboard = new Aboard();
  /** Inside the base (the village view). */
  village = false;
  paused = false;
  /** Wheel zoom on top of the automatic zoom. */
  private zoomMul = 1;
  private packHint = false;
  /** Camera look-ahead in the driving direction. */
  private camLead = { x: 0, y: 0 };
  private villageZoomMul = 1;
  private vstate: VillageState = { hover: null, selected: 0, ghost: null, deck: 0 };
  private trackT = 0;
  private acc = 0;
  private last = 0;
  private hover: Hover | null = null;
  private rmbT = 0;
  /** Touch: how long the info line for the last tapped thing stays up. */
  private tapHintT = 0;
  sendMode = false;
  private objT = 0;
  private saveT = 30;
  running = false;
  dz: DeadZoneClient | null = null;
  private mapCtx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    initCursors();
    this.view = new View2D(canvas);
    this.overlay = new Overlay(overlayCanvas, this.view);
    this.input = new Input(canvas);
    this.hud = new Hud(uiRoot, {
      openPanel: (n, t) => this.panels.open(n, t),
      pickPerk: (crewId, idx) => this.pickPerk(crewId, idx),
      useKit: () => this.useKit(),
      outrider: (c) => this.outriderCmd(c),
      minimapClick: (x, y, right) => this.minimapClick(x, y, right),
      minimapZoom: (d) => this.minimap.setZoom(this.minimap.zoom + d),
      cardAim: (slot, x, y, over) => this.cardAim(slot, x, y, over),
      cardDrop: (slot, x, y, over) => this.cardDrop(slot, x, y, over),
      cardTap: (slot) => this.cardTap(slot),
      squadAim: (t, x, y, over) => this.squadAim(t, x, y, over),
      squadDrop: (t, x, y, over) => this.squadDrop(t, x, y, over),
      openPack: () => this.openNextPack(),
      village: (on) => this.setVillage(on),
      trackClick: () => this.trackClick(),
      untrack: () => this.game && untrack(this.game),
      camp: () => this.toggleCamp(),
      helm: (cmd) => {
        const h = this.game.helm;
        if (cmd === 'overdrive') this.toggleOverdrive();
        else if (cmd === 'warp') this.cycleWarp();
        else if (cmd === 'stop') this.allStop();
        else {
          h.lever = Math.max(-0.5, Math.min(1, Math.round((h.lever + (cmd === 'up' ? 0.25 : -0.25)) * 4) / 4));
          this.game.player.path = [];
          this.game.player.goal = null;
        }
      },
      cabin: () => this.toggleCabin(),
      interior: () => this.toggleInterior(),
    });
    this.mapCtx = this.hud.minimap.getContext('2d')!;
    this.villageUI = new VillageUI(uiRoot, this);
    this.cabin = new Cabin(uiRoot, {
      close: () => this.toggleCabin(false),
      vitals: () => this.panels.open('bridge'),
      overdrive: () => this.toggleOverdrive(),
      warp: () => this.cycleWarp(),
      stop: () => this.allStop(),
      camp: () => this.toggleCamp(),
      toast: (t, c) => this.hud.toast(t, c),
      sound: (n) => this.sound(n),
    });
    this.hud.onToast = (t, c) => this.cabin.isOpen && this.cabin.message(t, c);
    this.interior = new Interior(uiRoot, {
      close: () => this.toggleInterior(false),
      toast: (t, c) => this.hud.toast(t, c),
      sound: (n) => this.sound(n),
    });
    this.panels = new Panels(uiRoot, this);
    this.chest = new ChestUI(uiRoot, this);
    this.title = new Title(uiRoot, this);
    window.addEventListener('resize', () => {
      this.view.resize();
      this.overlay.resize();
    });
    window.addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    // Browsers only start audio from a user gesture (iOS wants touchend).
    for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, () => this.audio.unlock(), true);
    requestAnimationFrame((t) => this.frame(t));
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  newGame(klass: HullClass = 'juggernaut', seed = Math.floor(Math.random() * 1e9), crew?: CrewMember[]): void {
    this.start(new Game(seed, undefined, klass, crew));
    this.hud.toast(`Captain, the Hangar door is open. ${this.touch ? 'Push the throttle up with the stick (bottom left) or tap the ground' : 'W pushes the throttle lever up, A and D steer'}. Your guns fire on their own; your officers run the stations (CREW).`, '#ffd740');
  }

  continueGame(): boolean {
    const d = loadSave();
    if (!d) return false;
    this.start(deserialize(d));
    this.hud.toast('Welcome back, Commander.', '#ffd740');
    return true;
  }

  start(g: Game): void {
    this.game = g;
    installHandlers(g);
    g.hooks = {
      toast: (t, c) => this.hud.toast(t, c),
      sound: (n, x, y, v) => this.sound(n, x, y, v),
      chest: (k, r, choice) => this.openChest(k, r, choice),
      levelUp: (r) => this.hud.levelUp(r),
      died: () => {
        this.sound('alarm');
        this.setVillage(false);
      },
      enterDeadZone: () => this.enterDeadZone(),
      victory: () => this.showVictory(),
    };
    this.view.setWorld(g);
    this.view.cam.x = g.player.x;
    this.view.cam.y = g.player.y;
    this.view.cam.zoom = this.autoZoom();
    this.setVillage(false);
    this.running = true;
    this.title.hide();
    this.saveT = 30;
  }

  /** The Mothership woke: the end credits of the campaign (the world keeps going). */
  showVictory(): void {
    const g = this.game;
    let el = document.querySelector('.victory') as HTMLDivElement | null;
    if (!el) {
      el = document.createElement('div');
      el.className = 'victory';
      document.body.appendChild(el);
    }
    const mins = Math.round(g.stats.time / 60);
    el.innerHTML = `<div class="vc"><h1>THE MOTHERSHIP WAKES</h1><p>You held it against the Last Horde and the Devourer. ${mins} minutes, ${g.stats.kills} kills, ${g.stats.hordes ?? 0} hordes survived, ${g.stats.bosses ?? 0} bosses.</p><p>The wasteland is still out there, and the hordes still come, stronger every time. Keep going.</p></div>`;
    const b = document.createElement('button');
    b.className = 'btn primary';
    b.textContent = 'KEEP PLAYING';
    b.addEventListener('click', () => {
      el!.style.display = 'none';
      this.paused = false;
    });
    el.querySelector('.vc')!.appendChild(b);
    el.style.display = 'flex';
    this.paused = true;
    this.save();
  }

  save(): void {
    if (this.running && this.game && this.game.mode === 'world') saveGame(this.game);
  }

  sound(name: string, x?: number, y?: number, vol = 1): void {
    let v = vol;
    if (x !== undefined && y !== undefined) {
      const d = Math.hypot(x - this.view.cam.x, y - this.view.cam.y);
      v *= Math.max(0, Math.min(1, 1 - (d - 18) / 45));
    }
    this.audio.play(name, v);
  }

  openChest(kind: ChestKind, rewards: Reward[], choice: boolean): void {
    this.chest.show(kind, rewards, choice);
  }

  /** Playing with a touch screen (set by the first touch, or a phone/tablet at startup). */
  get touch(): boolean {
    return this.input.touchMode;
  }

  get uiBlocking(): boolean {
    return this.panels.isOpen || this.chest.isOpen || this.title.isOpen;
  }

  /** Enters or leaves the base (village) view. The world keeps running; the fortress parks. */
  setVillage(on: boolean): void {
    const g = this.game;
    if (on && (!g || g.mode !== 'world' || g.player.dead)) {
      if (g?.mode === 'raid') this.hud.toast("You can't build in the Dead Zone.", '#ff8a80');
      return;
    }
    if (on === this.village) return;
    this.village = on;
    this.cancelArmed();
    if (on) {
      g.resetOrders();
      g.driveInput.active = false;
      this.panels.close();
      this.villageUI.enter();
      this.sound('ui');
    } else this.villageUI.exit();
    this.view.aim = null;
  }

  /** Automatic camera distance: a bigger fortress needs a wider view, and so does a tall narrow (portrait) screen. */
  private autoZoom(): number {
    const p = this.game.player;
    const aspect = this.view.width / Math.max(1, this.view.height);
    const narrow = Math.max(1, Math.min(1.7, Math.sqrt(1.3 / aspect)));
    if (this.village) return (p.stats.length * 1.95 + 10) * this.villageZoomMul * narrow;
    // A Titan: far enough back to see the whole hull and the ground around it (the wheel zooms in and out).
    if (p.fortress) return TITAN_ZOOM * this.zoomMul * narrow;
    return (18 + p.stats.length * 2.1) * this.zoomMul * narrow;
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  /* ---------------- cards ---------------- */

  private cardColor(id: string): string {
    return SCHOOLS[CARDS[id]?.school ?? 'iron'].color;
  }

  /** While a card is being aimed, time crawls (so you can pick your spot even in a horde). */
  aiming = false;

  /** Shows where the card in `slot` would land. */
  cardAim(slot: number, sx: number, sy: number, overUI: boolean): void {
    const g = this.game;
    const id = g?.hand[slot];
    this.aiming = !!id;
    if (!id || overUI) {
      this.view.aim = null;
      return;
    }
    const d = CARDS[id];
    if (d.target === 'self') {
      this.view.aim = { x: g.player.x, y: g.player.y, r: g.player.stats.length * 0.6, color: this.cardColor(id) };
      return;
    }
    const w = this.view.screenToWorld(sx, sy);
    const [x, y] = clampCast(g, w.x, w.y);
    this.view.aim = { x, y, r: Math.max(1.5, d.radius), color: cardBlock(g, slot) ? '#9e9e9e' : this.cardColor(id) };
  }

  cardDrop(slot: number, sx: number, sy: number, overUI: boolean): void {
    this.view.aim = null;
    this.aiming = false;
    if (overUI) return;
    const w = this.view.screenToWorld(sx, sy);
    this.play(slot, w.x, w.y);
  }

  /** Tapping a card: self cards play right away; area cards wait for a tap on the battlefield. */
  cardTap(slot: number): void {
    const g = this.game;
    const id = g?.hand[slot];
    if (!id) return;
    if (CARDS[id].target === 'self') {
      this.play(slot, g.player.x, g.player.y);
      return;
    }
    if (this.hud.armed === slot) {
      this.cancelArmed();
      return;
    }
    const block = cardBlock(g, slot);
    if (block) {
      this.hud.toast(block, '#ff8a80');
      this.sound('nope');
      return;
    }
    this.hud.armed = slot;
    this.aiming = true;
    this.hud.toast(`${CARDS[id].name}: tap the battlefield to play it (${this.touch ? 'tap the card again' : 'right-click'} to cancel).`, this.cardColor(id));
    this.sound('draw');
  }

  cancelArmed(): void {
    this.hud.armed = -1;
    this.view.aim = null;
    this.aiming = false;
  }

  private play(slot: number, x: number, y: number): void {
    const g = this.game;
    if (!g) return;
    if (this.village) this.setVillage(false);
    const id = g.hand[slot];
    const r = playCard(g, slot, x, y);
    this.cancelArmed();
    if (!r.ok) {
      this.hud.toast(r.msg, '#ff8a80');
      this.sound('nope');
      return;
    }
    if (id && CARDS[id].target === 'area') {
      const [cx, cy] = clampCast(g, x, y);
      this.view.moveMarker(cx, cy, this.cardColor(id));
    }
  }

  /* ---------------- squads ---------------- */

  squadAim(type: SquadType, sx: number, sy: number, overUI: boolean): void {
    if (overUI || !this.game) {
      this.view.aim = null;
      return;
    }
    const w = this.view.screenToWorld(sx, sy);
    this.view.aim = { x: w.x, y: w.y, r: 5, color: SQUADS[type].color };
  }

  squadDrop(type: SquadType, sx: number, sy: number, overUI: boolean): void {
    this.view.aim = null;
    if (overUI || !this.game) return;
    const w = this.view.screenToWorld(sx, sy);
    const err = setSquadOrder(this.game, type, 'guard', w.x, w.y);
    if (err) this.hud.toast(err, '#ff8a80');
    else {
      this.view.moveMarker(w.x, w.y, SQUADS[type].color);
      this.hud.toast(`${SQUADS[type].name} will guard that spot. Tap ⌂ on its badge to call it back.`, SQUADS[type].color);
      this.sound('ui');
    }
  }

  openNextPack(): void {
    const g = this.game;
    if (!g) return;
    const r = openPack(g, 0);
    if (r) this.openChest(r.kind, r.rewards, false);
  }

  /** Clicking the tracker box: jump to where the tracked thing gets built or levelled. */
  trackClick(): void {
    const t = this.hud.trackInfo;
    const tr = this.game?.tracked;
    if (!t || !tr) return;
    if (tr.kind === 'card') {
      if (t.ready) this.panels.open('cards');
      return;
    }
    if (!t.ready && t.target?.kind !== 'base') return;
    this.setVillage(true);
    if (t.modId) this.villageUI.select(t.modId);
    else this.villageUI.toggleShop(true);
  }

  pickPerk(crewId: number, idx: number): void {
    const r = choosePerk(this.game, crewId, idx);
    if (r.ok) this.sound('levelup');
    else this.hud.toast(r.msg, '#ff8a80');
  }

  useKit(): void {
    const p = this.game.player;
    if (p.dead) return;
    if (p.cargo.count('repair_kit') <= 0) {
      this.hud.toast('No repair kits (5). Craft them in CARGO > Workshop.', '#ff8a80');
      return;
    }
    if (p.hp >= p.stats.maxHp) return;
    p.cargo.take('repair_kit', 1);
    p.addBuff('regen', 3, (p.stats.maxHp * 0.25) / 3);
    this.game.fx.push({ t: 'heal', x: p.x, y: p.y });
    this.sound('craft');
  }

  outriderCmd(c: 'follow' | 'hold' | 'send' | 'launch'): void {
    const g = this.game;
    if (c === 'launch') {
      if (!g.outriderUnlocked()) return;
      if (!g.pay(OUTRIDER_COST)) {
        this.hud.toast('Not enough materials to build the Outrider.', '#ff8a80');
        return;
      }
      if (g.outriderLevel === 0) g.outriderLevel = 1;
      launchOutrider(g);
      this.hud.toast('Outrider launched! Assign side crew in CREW > Outrider, then send it for resources.', '#76ff03');
      this.sound('build');
      return;
    }
    if (!g.outrider) return;
    if (c === 'follow') g.outriderOrder = { mode: 'follow' };
    else if (c === 'hold') g.outriderOrder = { mode: 'hold', x: g.outrider.x, y: g.outrider.y };
    else {
      this.sendMode = true;
      this.hud.toast(`${this.touch ? 'Tap' : 'Right-click'} a resource node or loot area to send the Outrider there.`, '#26c6da');
    }
  }

  minimapClick(fx: number, fy: number, _right: boolean): void {
    const g = this.game;
    if (!g || g.player.dead) return;
    const { x, y } = this.minimap.radarPoint(fx, fy);
    this.setVillage(false);
    if (orderMove(g, x, y)) this.view.moveMarker(x, y);
  }

  enterDeadZone(): void {
    const need = featureLevel('deadzone');
    if (this.game.commander.level < need) {
      this.hud.toast(`The Dead Zone opens at commander level ${need}. Keep fighting!`, '#ff8a80');
      return;
    }
    this.panels.confirm(
      'Enter the Dead Zone?',
      'Multiplayer warzone. If your fortress is destroyed there, you drop your cargo hold (except Vault slots), all spare weapons in your armory and one mounted weapon for other players to loot. Extract to keep everything you find.',
      'Deploy',
      () => {
        this.save();
        this.dz = new DeadZoneClient(this);
        void this.dz.start();
      },
    );
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    if (!this.running || !this.game) {
      this.input.endFrame();
      return;
    }
    const g = this.game;
    this.handleKeys();
    this.input.update();
    this.readDrive();
    if (this.cabin.isOpen && (g.player.dead || g.mode !== 'world' || !g.player.titan)) this.toggleCabin(false);
    if (this.interior.isOpen && (g.mode !== 'world' || !g.player.titan)) this.toggleInterior(false);
    const firstPerson = this.cabin.isOpen || this.interior.isOpen;
    if (!this.uiBlocking && !firstPerson) this.handleMouse(dt);
    if (!firstPerson) this.handleZoom();
    const paused = this.paused || (this.panels.isOpen && this.panels.pauses) || this.chest.isOpen;
    if (!paused) {
      this.checkWarp();
      const warp = this.dz ? 1 : this.aiming ? 0.25 : g.warp;
      this.acc += dt * warp;
      let steps = 0;
      while (this.acc >= STEP && steps < 5 * warp) {
        if (this.dz) this.dz.step(STEP);
        else stepWorld(g, STEP);
        this.acc -= STEP;
        steps++;
        if (steps === 1) this.input.endFrame();
      }
      if (steps === 0) this.input.endFrame();
      if (this.acc > STEP * 5 * warp) this.acc = 0;
    } else this.input.endFrame();
    if (this.village && (g.player.dead || g.mode !== 'world')) this.setVillage(false);
    this.updateCamera(dt);
    // Objective tracker: what's still needed, and where to get it.
    this.trackT -= dt;
    if (this.trackT <= 0) {
      this.trackT = 0.3;
      this.hud.trackInfo = g.mode === 'world' ? trackInfo(g) : null;
      const tgt = this.hud.trackInfo?.target;
      this.view.beacon = tgt && tgt.kind !== 'base' ? { x: tgt.x, y: tgt.y, color: '#ffd740' } : null;
    }
    this.view.deckView = this.village ? this.villageUI.deck : 0;
    if (this.village && g.player.titan) {
      this.aboard.update(g, paused ? 0 : dt);
      this.view.aboard = this.aboard;
    } else this.view.aboard = null;
    if (this.interior.isOpen) {
      // Inside: the cutaway of every deck; the world outside keeps going but isn't drawn.
      this.aboard.update(g, paused ? 0 : dt);
      this.interior.render(g, this.aboard, paused ? 0 : dt);
      g.fx.length = 0;
      this.hud.update(g, dt, this.village);
      this.panels.tick();
      this.audio.engine(g.player.speed, !g.player.dead && !paused);
      this.autosave(dt);
      return;
    }
    if (this.cabin.isOpen) {
      // In the cab the world is drawn from the bow; the tactical view and its overlay rest.
      this.cabin.render(g, paused ? 0 : dt);
      this.hud.slowmo = false;
      this.hud.update(g, dt, this.village);
      this.panels.tick();
      this.audio.engine(g.player.speed, !g.player.dead && !paused);
      this.autosave(dt);
      return;
    }
    this.view.render(g, paused ? 0 : dt);
    this.overlay.draw(g, this.hover?.kind === 'enemy' ? this.hover.id : 0);
    if (this.village) {
      this.vstate.selected = this.villageUI.selected;
      this.vstate.deck = this.villageUI.deck;
      this.vstate.ghost = this.villageUI.ghost(this.vstate.hover);
      this.overlay.drawVillage(g, this.vstate);
    } else if (g.mode === 'world') this.overlay.drawMarkers(g, this.hud.trackInfo?.target ?? null, this.hud.trackInfo?.target?.label ?? '');
    this.overlay.drawHorde(g);
    if (g.mode === 'world' && !this.village) {
      const ms = mission(g);
      if (ms.x !== undefined && ms.y !== undefined) this.overlay.drawMission(g, ms.x, ms.y, ms.title.length > 26 ? `${ms.title.slice(0, 24)}…` : ms.title);
    }
    this.minimap.draw(this.mapCtx, 220, 220, g, this.view, false);
    this.hud.slowmo = this.aiming;
    this.hud.update(g, dt, this.village);
    this.villageUI.update();
    this.panels.tick();
    this.audio.engine(g.player.speed, !g.player.dead && !paused);
    this.autosave(dt);
  }

  /** Objectives and the autosave. */
  private autosave(dt: number): void {
    const g = this.game;
    this.objT -= dt;
    if (this.objT <= 0 && g.mode === 'world') {
      this.objT = 0.5;
      const o = OBJECTIVES[g.objective];
      if (o && o.done(g)) {
        for (const [id, n] of Object.entries(o.reward)) g.give(id, n, true);
        this.hud.toast(`Objective complete: ${o.title}!`, '#76ff03');
        this.sound('levelup');
        g.objective++;
      }
    }
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 30;
      this.save();
    }
  }

  /** Mouse wheel or pinch: zoom on top of the automatic distance (read before the input frame ends). */
  private handleZoom(): void {
    const m = this.input.mouse;
    if (!m.wheel || m.overUI || this.uiBlocking) return;
    if (this.village) this.villageZoomMul = Math.max(0.55, Math.min(1.6, this.villageZoomMul + m.wheel * 0.08));
    else this.zoomMul = Math.max(this.game.player.fortress ? TITAN_MIN / TITAN_ZOOM : 0.6, Math.min(this.game.player.fortress ? TITAN_MAX / TITAN_ZOOM : 1.5, this.zoomMul * (1 + m.wheel * 0.08)));
  }

  /** The camera always follows your fortress; inside the base it turns so the front is up. */
  private updateCamera(dt: number): void {
    const g = this.game;
    const v = this.view;
    const p = g.player;
    const k = 1 - Math.pow(0.002, dt);
    let tx = p.x, ty = p.y;
    // Look a little ahead of where you're driving, so you see what you're about to hit.
    const lead = p.fortress ? Math.max(-20, Math.min(40, p.speed * 5)) : Math.max(-2, Math.min(6, p.speed * 0.9));
    this.camLead.x += (Math.cos(p.rot) * lead - this.camLead.x) * (1 - Math.pow(0.05, dt));
    this.camLead.y += (Math.sin(p.rot) * lead - this.camLead.y) * (1 - Math.pow(0.05, dt));
    if (!this.village) {
      tx += this.camLead.x;
      ty += this.camLead.y;
    }
    if (this.village) {
      // Nudge the view so the building card at the bottom doesn't cover the fortress.
      const back = p.toWorld(p.stats.length * 0.06, 0);
      tx = back.x;
      ty = back.y;
    }
    v.cam.x += (tx - v.cam.x) * (this.village ? k : 1 - Math.pow(0.0005, dt));
    v.cam.y += (ty - v.cam.y) * (this.village ? k : 1 - Math.pow(0.0005, dt));
    v.cam.zoom += (this.autoZoom() - v.cam.zoom) * k;
    v.cam.fov = !this.village && g.player.fortress ? 45 : 32;
    v.snap = !this.village && Math.abs(this.zoomMul - 1) < 0.01;
    const wantYaw = this.village ? p.rot : -Math.PI / 2;
    v.cam.yaw = wrapAngle(v.cam.yaw + wrapAngle(wantYaw - v.cam.yaw) * k);
    v.cam.pitch += ((this.village ? 64 : 56) - v.cam.pitch) * k;
  }

  /** Overdrive: more speed for a lot more fuel and wear on the drive. */
  toggleOverdrive(): void {
    const g = this.game;
    if (!g.player.titan || g.player.dead) return;
    if (!g.helm.overdrive && g.titan.fuel <= 0) {
      this.hud.toast('No fuel for overdrive.', '#ff8a80');
      return;
    }
    if (!g.helm.overdrive && g.helm.overheat) {
      this.hud.toast(`The engine is still too hot for overdrive (${Math.round(g.helm.heat * 100)}%).`, '#ff8a80');
      this.sound('error');
      return;
    }
    g.helm.overdrive = !g.helm.overdrive;
    const spec = engineSpec(g.player.engine);
    this.hud.toast(g.helm.overdrive ? `OVERDRIVE: +${Math.round((spec.odSpeed - 1) * 100)}% speed, ${spec.odFuel.toFixed(1)}x fuel burn, about ${Math.round((1 - g.helm.heat) / spec.heat)}s before it overheats.` : 'Overdrive off.', g.helm.overdrive ? '#ff9100' : '#b0bec5');
    this.sound(g.helm.overdrive ? 'levelup' : 'ui');
  }

  /** Cruise warp: 1x, 4x, 8x. Only while nothing hostile is near. */
  cycleWarp(): void {
    const g = this.game;
    const next = g.warp === 1 ? 4 : g.warp === 4 ? 8 : 1;
    const why = next > 1 ? warpBlocked(g) : null;
    if (why) {
      this.hud.toast(`Can't warp: ${why}.`, '#ff8a80');
      return;
    }
    g.warp = next;
    this.hud.toast(next > 1 ? `CRUISE WARP ×${next}: time runs faster until something hostile comes near.` : 'Warp off.', next > 1 ? '#18ffff' : '#b0bec5');
    this.sound('ui');
  }

  /** Warp drops out the moment anything hostile turns up. */
  private checkWarp(): void {
    const g = this.game;
    if (g.warp === 1) return;
    const why = warpBlocked(g);
    if (!why) return;
    g.warp = 1;
    this.hud.toast(`Warp off: ${why}.`, '#ffab40');
    this.sound('alarm');
  }

  /** Inside the Titan (the all-decks cutaway), or back out. */
  toggleInterior(on = !this.interior.isOpen): void {
    const g = this.game;
    if (on) {
      if (!g || g.mode !== 'world' || !g.player.titan) {
        this.hud.toast('The interior view is for a Titan Crawler in the open world.', '#ff8a80');
        return;
      }
      if (this.cabin.isOpen) this.cabin.close();
      this.panels.close();
      this.cancelArmed();
      this.interior.open(g);
    } else this.interior.close();
    this.sound('ui');
  }

  /** Into the captain's cabin at the bow (first person), or back out to the tactical view. */
  toggleCabin(on = !this.cabin.isOpen): void {
    const g = this.game;
    if (on) {
      if (!g || g.mode !== 'world' || g.player.dead || !g.player.titan) {
        this.hud.toast('The cabin is aboard a Titan Crawler, in the open world.', '#ff8a80');
        return;
      }
      if (this.village) this.setVillage(false);
      if (this.interior.isOpen) this.interior.close();
      this.panels.close();
      this.cancelArmed();
      this.cabin.open();
      this.hud.toast('CAPTAIN ON THE BRIDGE. Drag the THROTTLE lever and the STEER lever, or W/S and A/D. Drag the glass to look around. F or EXIT to leave.', '#ffd740');
    } else this.cabin.close();
    this.sound('ui');
  }

  /** All stop: the throttle lever back to zero. */
  allStop(): void {
    this.game.helm.lever = 0;
    this.game.player.path = [];
    this.game.player.goal = null;
  }

  /** WASD / arrow keys / the touch stick drive the fortress (screen-relative, or tank-style from the menu). */
  private readDrive(): void {
    const g = this.game;
    const i = this.input;
    const di = g.driveInput;
    const joy = this.hud.joy;
    joy.visible = this.touch && !this.village && !this.uiBlocking && !g.player.dead && !this.cabin.isOpen && !this.interior.isOpen;
    if (this.uiBlocking || g.player.dead) {
      di.active = false;
      return;
    }
    let x = (i.down('KeyD') || i.down('ArrowRight') ? 1 : 0) - (i.down('KeyA') || i.down('ArrowLeft') ? 1 : 0);
    let y = (i.down('KeyS') || i.down('ArrowDown') ? 1 : 0) - (i.down('KeyW') || i.down('ArrowUp') ? 1 : 0);
    if (!x && !y && joy.active) {
      x = joy.x;
      y = joy.y;
    }
    if (!x && this.cabin.isOpen && this.cabin.steer) x = this.cabin.steer;
    // Camped: packing up comes first.
    if ((x || y) && g.deploy.state !== 'mobile') {
      if (!this.packHint) this.hud.toast(g.deploy.state === 'packing' ? 'Packing up...' : 'You are camped: press T (CAMP) to pack up before you drive.', '#ffab40');
      this.packHint = true;
      di.active = false;
      return;
    }
    this.packHint = false;
    // Driving off leaves the base view.
    if (this.village) {
      if (x || y) this.setVillage(false);
      else {
        di.active = false;
        return;
      }
    }
    di.x = x;
    di.y = y;
    const was = di.active;
    di.active = x !== 0 || y !== 0;
    if (di.active && !was) {
      g.harvestId = 0;
      this.objCounters('wasd');
    }
  }

  /** Set up camp here, or pack it up. */
  toggleCamp(): void {
    const g = this.game;
    if (!g || g.mode !== 'world') return;
    this.hud.toast(toggleDeploy(g), '#ffd740');
  }

  private objCounters(k: string): void {
    this.game.objectiveCounters[k] = (this.game.objectiveCounters[k] ?? 0) + 1;
  }

  private handleKeys(): void {
    const i = this.input;
    if (i.consume('Escape')) {
      if (this.sendMode) this.sendMode = false;
      else if (this.cabin.isOpen && !this.panels.isOpen && !this.chest.isOpen) this.toggleCabin(false);
      else if (this.interior.isOpen && !this.panels.isOpen && !this.chest.isOpen) this.toggleInterior(false);
      else if (this.chest.isOpen) this.chest.escape();
      else if (this.panels.isOpen) this.panels.close();
      else if (this.hud.armed >= 0) this.cancelArmed();
      else if (this.village && this.villageUI.cancelPlace()) {
        /* placement cancelled */
      } else if (this.village && this.villageUI.shopOpen) this.villageUI.toggleShop(false);
      else if (this.village) this.setVillage(false);
      else this.panels.open('menu');
    }
    if (this.chest.isOpen) return;
    if (i.consume('KeyB')) {
      if (this.panels.isOpen) this.panels.close();
      this.setVillage(!this.village);
    }
    if (i.consume('KeyT')) this.toggleCamp();
    if (i.consume('KeyF')) this.toggleCabin();
    if (i.consume('KeyG')) this.toggleInterior();
    if (i.consume('KeyU') && this.game && isDocked(this.game)) this.panels.toggle('shipyard');
    const panelKeys: [string, string][] = [
      ['KeyC', 'cards'], ['KeyV', 'arsenal'], ['KeyK', 'crew'], ['KeyL', 'progress'], ['KeyI', 'cargo'], ['KeyM', 'map'], ['KeyH', 'help'], ['F1', 'help'], ['KeyN', 'blueprint'], ['KeyY', 'bridge'],
    ];
    for (const [k, p] of panelKeys) if (i.consume(k)) this.panels.toggle(p);
    if (this.panels.isOpen) return;
    for (let s = 0; s < HAND_SIZE; s++) if (i.consume(`Digit${s + 1}`)) this.cardTap(s);
    if (i.consume(KIT_KEY)) this.useKit();
    if (i.consume('KeyP')) this.paused = !this.paused;
    if (i.consume('KeyJ')) {
      if (this.hover && (this.hover.kind === 'node' || this.hover.kind === 'site')) this.trySend(this.hover);
      else this.outriderCmd('send');
    }
    if (i.consume('F8')) this.view.outlines = !this.view.outlines;
    if (i.consume('KeyO')) this.toggleOverdrive();
    if (i.consume('Period')) this.cycleWarp();
    if (i.consume('Space')) this.allStop();
  }

  private trySend(hv: Hover): void {
    if (!this.game.outrider) {
      this.hud.toast('You need an Outrider (unlocks at 15 crew, built at a Garage).', '#ff8a80');
      return;
    }
    if (sendOutrider(this.game, hv.kind === 'node' ? 'node' : 'site', hv.id)) this.view.moveMarker(hv.x, hv.y, '#26c6da');
    this.sendMode = false;
  }

  private pick(wx: number, wy: number): Hover {
    const g = this.game;
    const v = this.view;
    const m = this.input.mouse;
    const scale = 34 / v.cam.zoom;
    // Fingers are less precise than a mouse pointer.
    const slop = this.touch ? 1.7 : 1;
    let best: Hover | null = null;
    let bd = Infinity;
    for (const e of g.enemies) {
      if (e.burrowed || (g.mode === 'world' && !g.isVisible(e.x, e.y))) continue;
      const hgt = (e.flying ? 1.6 : 0) + e.r * 1.4;
      const p = v.worldToScreen(e.x, e.y, hgt);
      const r = Math.max(16 * slop, e.r * 42 * scale);
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < r && d < bd) {
        bd = d;
        best = { kind: 'enemy', id: e.id, x: e.x, y: e.y, label: `${e.elite ? 'Elite ' : ''}${e.name}` };
      }
    }
    if (best) return best;
    for (const t of g.tanks) {
      if (t.dead || (g.mode === 'world' && !g.isVisible(t.x, t.y))) continue;
      if (t.hits(wx, wy, 0.6 * slop)) return { kind: 'tank', id: t.id, x: t.x, y: t.y, label: t.kind === 'outpost' ? 'Outpost' : t.name };
    }
    for (const k of g.pickups) if (k.kind !== 'stack' && Math.hypot(k.x - wx, k.y - wy) < 1.4 * slop) return { kind: 'pickup', id: k.id, x: k.x, y: k.y, label: k.kind === 'chest' ? 'Chest' : 'Weapon crate' };
    if (g.mode === 'world') {
      for (const n of g.gen.nodes) {
        if (n.respawnAt || Math.abs(n.x - wx) > 1.6 * slop || Math.abs(n.y - wy) > 1.6 * slop) continue;
        if (Math.hypot(n.x - wx, n.y - wy) < 1.5 * slop) return { kind: 'node', id: n.id, x: n.x, y: n.y, label: NODE_INFO[n.type].name };
      }
      for (const r of g.gen.runes) if (Math.hypot(r.x - wx, r.y - wy) < 2.6 * slop) return { kind: 'rune', id: r.id, x: r.x, y: r.y, label: RUNE_INFO[r.rune].name };
      if (Math.hypot(g.gen.gate.x - wx, g.gen.gate.y - wy) < 6) return { kind: 'gate', id: 0, x: g.gen.gate.x, y: g.gen.gate.y, label: 'Dead Zone Gate' };
      for (const s of g.gen.sites) if (Math.hypot(s.x - wx, s.y - wy) < 7.5) return { kind: 'site', id: s.id, x: s.x, y: s.y, label: s.name };
    }
    return { kind: 'ground', id: 0, x: wx, y: wy, label: '' };
  }

  /** Base view: hover and tap deck cells. */
  private handleVillageMouse(): void {
    const g = this.game;
    const m = this.input.mouse;
    const p = g.player;
    this.hud.setHint('');
    if (m.overUI) {
      this.vstate.hover = null;
      this.canvas.style.cursor = CURSORS.default;
      return;
    }
    const w = this.view.screenToPlane(m.x, m.y, deckHeight(p, this.villageUI.deck));
    const l = p.toLocal(w.x, w.y);
    const cx = Math.floor(l.lz / p.cell + p.cols / 2), cy = Math.floor(p.rows / 2 - l.lx / p.cell);
    const inside = cx >= 0 && cy >= 0 && cx < p.cols && cy < p.rows;
    // Touch has no hover; the placement preview comes from the pending tap instead.
    this.vstate.hover = inside && !this.touch ? [cx, cy] : null;
    this.canvas.style.cursor = inside ? CURSORS.interact : CURSORS.default;
    if (m.rightPressed) {
      if (!this.villageUI.cancelPlace()) this.villageUI.select(0);
      return;
    }
    if (m.leftPressed) {
      if (inside) this.villageUI.click(cx, cy);
      else if (!this.villageUI.placing && !this.villageUI.moving) this.villageUI.select(0);
    }
  }

  private handleMouse(dt: number): void {
    const g = this.game;
    const m = this.input.mouse;
    const w = this.view.screenToWorld(m.x, m.y);
    g.aim.x = w.x;
    g.aim.y = w.y;
    if (m.tap) {
      // A tap is a left click in the base, with a card armed, or on your own fortress (opens the base);
      // anywhere else it's the right-click: drive there, attack, drill, interact.
      if (this.village || this.hud.armed >= 0 || (g.mode === 'world' && !g.player.dead && g.player.hits(w.x, w.y, 0.5))) m.leftPressed = true;
      else m.rightPressed = true;
      this.tapHintT = 2.5;
    }
    if (this.village) {
      this.handleVillageMouse();
      return;
    }
    // A tapped card follows the pointer until you tap the battlefield.
    if (this.hud.armed >= 0) {
      this.cardAim(this.hud.armed, m.x, m.y, m.overUI);
      if (!m.overUI && m.leftPressed) {
        this.play(this.hud.armed, w.x, w.y);
        return;
      }
      if (m.rightPressed) {
        this.cancelArmed();
        return;
      }
    }
    if (m.overUI) {
      this.hover = null;
      this.canvas.style.cursor = CURSORS.default;
      this.hud.setHint('');
      return;
    }
    if (m.leftPressed && this.hud.armed < 0 && !g.player.dead && g.mode === 'world' && g.player.hits(w.x, w.y, 0.5)) {
      // Tapping your own fortress opens the base.
      this.setVillage(true);
      return;
    }
    const hv = this.pick(w.x, w.y);
    this.hover = hv;
    const own = g.mode === 'world' && g.player.hits(w.x, w.y, 0.5);
    this.canvas.style.cursor = this.hud.armed >= 0 ? CURSORS.attack : this.sendMode ? CURSORS.send : hv.kind === 'enemy' || hv.kind === 'tank' ? CURSORS.attack : hv.kind === 'node' ? CURSORS.harvest : own ? CURSORS.interact : hv.kind === 'ground' ? CURSORS.default : CURSORS.interact;
    // Touch has no hover: the line describes what you just tapped, for a moment.
    this.tapHintT -= dt;
    if (this.touch && (this.tapHintT <= 0 || m.drag)) this.hud.setHint('');
    else if (own && hv.kind === 'ground') this.hud.setHint(`<b>Your fortress</b> · ${this.touch ? 'tap' : 'click'} to open your base${this.touch ? '' : ' (B)'}`);
    else this.hud.setHint(this.hintFor(hv));
    if (m.rightPressed) {
      this.rmbT = 0.25;
      hideTip();
      if (this.sendMode) {
        if (hv.kind === 'node' || hv.kind === 'site') this.trySend(hv);
        else {
          this.sendMode = false;
          this.hud.toast('Send cancelled.', '#bdbdbd');
        }
        return;
      }
      if (g.player.dead) return;
      switch (hv.kind) {
        case 'enemy':
        case 'tank':
          orderAttack(g, hv.id);
          this.view.moveMarker(hv.x, hv.y, '#ff1744');
          break;
        case 'node':
          orderHarvest(g, hv.id);
          this.view.moveMarker(hv.x, hv.y, '#ffd740');
          break;
        case 'rune':
          orderInteract(g, 'rune', hv.id, hv.x + 3.5, hv.y);
          this.view.moveMarker(hv.x, hv.y, '#ea80fc');
          break;
        case 'gate':
          orderInteract(g, 'gate', 0, hv.x, hv.y);
          this.view.moveMarker(hv.x, hv.y, '#ff1744');
          break;
        case 'site':
          if (orderMove(g, hv.x, hv.y)) this.view.moveMarker(hv.x, hv.y, '#ffd740');
          break;
        default:
          if (orderMove(g, hv.x, hv.y)) {
            this.view.moveMarker(hv.x, hv.y);
            this.objCounters('wasd');
          } else this.view.moveMarker(hv.x, hv.y, '#ff5252');
      }
    } else if ((m.right || (m.drag && this.hud.armed < 0 && !this.sendMode)) && hv.kind === 'ground' && !g.player.dead) {
      // Hold the right button (or a finger) on the ground to keep steering toward it.
      this.rmbT -= dt;
      if (this.rmbT <= 0) {
        this.rmbT = 0.25;
        if (orderMove(g, hv.x, hv.y, true)) this.view.moveMarker(hv.x, hv.y);
      }
    }
  }

  private hintFor(hv: Hover): string {
    const g = this.game;
    const rc = this.touch ? 'tap' : 'right-click';
    if (this.sendMode) return hv.kind === 'node' || hv.kind === 'site' ? `${this.touch ? 'Tap' : 'Right-click'}: send Outrider to <b>${hv.label}</b>` : `Pick a resource node or loot area for the Outrider${this.touch ? '' : ' (Esc cancels)'}`;
    switch (hv.kind) {
      case 'enemy':
      case 'tank':
        return `<b class="bad">${hv.label}</b> · ${rc}: focus fire`;
      case 'node': {
        const n = g.gen.nodes.find((k) => k.id === hv.id)!;
        const info = NODE_INFO[n.type];
        const ok = info.tier <= g.player.stats.drill;
        return `<b>${info.name}</b> (${n.amount} left) · ${ok ? `park on it or ${rc} to drill` : `<span class="bad">needs Mk${info.tier} Drill Rig</span>`}${g.outrider && !this.touch ? ' · J: send Outrider' : ''}`;
      }
      case 'site': {
        const s = g.gen.sites.find((k) => k.id === hv.id)!;
        return `<b>${hv.label}</b> (${SITE_INFO[s.kind].title}) · ${s.readyAt <= g.time ? 'drive inside the ring and hold position to scavenge' : 'already scavenged, restocking'}`;
      }
      case 'rune': {
        const r = g.gen.runes.find((k) => k.id === hv.id)!;
        return `<b style="color:${RUNE_INFO[r.rune].color}">${hv.label}</b> · ${RUNE_INFO[r.rune].buff} + a Rune Chest. Defeat its guardians, then park beside it.`;
      }
      case 'gate':
        return `<b class="bad">Dead Zone Gate</b> · ${rc} to enter the multiplayer warzone`;
      case 'pickup':
        return `<b>${hv.label}</b> · drive over it to collect`;
      default:
        return '';
    }
  }

  /** Called by the Dead Zone client when a raid ends. */
  endRaid(): void {
    this.dz = null;
    this.view.setWorld(this.game);
    this.panels.close();
  }

  centerOnPlayer(): void {
    this.view.cam.x = this.game.player.x;
    this.view.cam.y = this.game.player.y;
  }

  get castRange(): number {
    return castRange(this.game);
  }

  /** Screen position of the middle of a deck cell (tests and tooling). */
  cellScreen(cx: number, cy: number): { x: number; y: number } {
    const p = this.game.player;
    const w = p.toWorld((p.rows / 2 - (cy + 0.5)) * p.cell, (cx + 0.5 - p.cols / 2) * p.cell);
    return this.view.worldToScreen(w.x, w.y, deckHeight(p, this.village ? this.villageUI.deck : 0));
  }
}
