import type { App } from '../app';
import { CARDS } from '../game/cards';
import { CLASS_LIST, type HullClass } from '../game/classes';
import { hangarRoster, HANGAR_PICKS, ROLES, signatureCard, type CrewMember } from '../game/crew';
import { bestStation, STATION, stationLine } from '../game/stations';
import { buildStarterTank } from '../game/templates';
import { paintTitan } from '../render/px/titan2d';
import { portrait } from '../render/icons';
import { RARITIES } from '../shared/rarity';
import { button, esc, h } from './dom';

/**
 * The start of a run, from the captain's point of view: the Mega Hangar. Five Titans stand in their berths; pick
 * the one you'll take out into the Crater. On the crew deck, ten people are waiting to sign on; pick the four who'll
 * be your officers. Then open the great door and ride out.
 */

const STORY = [
  'Forty years after the impact, the Crater is still a wound 140 kilometres wide. Everything that lives in it is bigger, hungrier and meaner than it was.',
  'You are the captain. The Mega Hangar is the last safe place in the south: it builds, refits and sends out the Titans, crawlers two hundred metres long that carry whole towns on their backs.',
  'Six strongholds hold the cores that could rebuild the Hangar\'s Ark Engine. The last one lies at the bottom of the Divot, under something nobody has come back to describe.',
  'Choose your ship. Choose your officers. The door opens at dawn.',
];

export class HangarScreen {
  private root: HTMLDivElement;
  private klass: HullClass | null = null;
  private roster: CrewMember[] = [];
  private picked = new Set<number>();
  private seed = 0;

  constructor(parent: HTMLElement, private app: App) {
    this.root = h('div', 'hangar-screen');
    this.root.style.display = 'none';
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  open(onBack: () => void): void {
    this.seed = Math.floor(Math.random() * 1e9);
    this.roster = hangarRoster(this.seed);
    this.klass = null;
    this.picked.clear();
    this.root.style.display = 'flex';
    this.render(onBack);
  }

  close(): void {
    this.root.style.display = 'none';
    this.root.innerHTML = '';
  }

  private render(onBack: () => void): void {
    const r = this.root;
    r.innerHTML = '';
    const card = h('div', 'hg-card');
    card.appendChild(h('div', 'hg-head', `<div class="hg-logo">THE MEGA HANGAR</div><div class="hg-sub">Captain's log · day one</div>`));
    card.appendChild(h('div', 'hg-story', STORY.map((p) => `<p>${esc(p)}</p>`).join('')));

    // The berths.
    card.appendChild(h('div', 'hg-step', `<b>1</b> Choose your Titan <small>Every class is the same 200 m hull, built for a different job. You can refit at the Hangar later.</small>`));
    const berths = h('div', 'hg-berths');
    for (const c of CLASS_LIST) {
      const el = h('div', `hg-berth ${this.klass === c.key ? 'on' : ''}`);
      el.style.setProperty('--cc', c.color);
      el.appendChild(this.shipPreview(c.key));
      el.appendChild(h('div', 'hb-txt', `<div class="hb-name" style="color:${c.color}">${esc(c.name)}</div><div class="hb-role">${esc(c.role)}</div>
        <div class="hb-perk">${esc(c.perk)}</div>
        <div class="hb-pros">${c.good.map((t) => `<span class="good">+ ${esc(t.replace(/^\+/, ''))}</span>`).join('')}${c.bad.map((t) => `<span class="bad">− ${esc(t.replace(/^-/, ''))}</span>`).join('')}</div>`));
      el.addEventListener('click', () => {
        this.klass = c.key;
        this.app.sound('ui');
        this.render(onBack);
      });
      berths.appendChild(el);
    }
    card.appendChild(berths);

    // The crew deck.
    card.appendChild(h('div', 'hg-step', `<b>2</b> Sign on your officers <small>${this.picked.size}/${HANGAR_PICKS} chosen. Each runs a station aboard, best at the one their trade fits; each brings a battle card.</small>`));
    const crew = h('div', 'hg-crew');
    for (const c of this.roster) {
      const on = this.picked.has(c.id);
      const st = bestStation(c);
      const cardId = signatureCard(c);
      const el = h('div', `hg-cm ${on ? 'on' : ''}`);
      el.style.setProperty('--rc', RARITIES[c.rarity].color);
      el.innerHTML = `<img class="hc-pt" src="${portrait(c)}"><div class="hc-t"><div class="hc-n">${esc(c.name)}</div>
        <div class="hc-r"><span style="color:${ROLES[c.role].color}">${esc(ROLES[c.role].name)}</span> · <span style="color:${RARITIES[c.rarity].color}">${esc(RARITIES[c.rarity].name)}</span> · L${c.level}</div>
        <div class="hc-s">${STATION[st].icon} Best at <b>${esc(STATION[st].name)}</b>: ${esc(stationLine(c, st))}</div>
        <div class="hc-c">Brings: ${esc(CARDS[cardId]?.name ?? cardId)} · ${esc(ROLES[c.role].passive)}</div></div>`;
      el.addEventListener('click', () => {
        if (on) this.picked.delete(c.id);
        else if (this.picked.size < HANGAR_PICKS) this.picked.add(c.id);
        else return;
        this.app.sound('ui');
        this.render(onBack);
      });
      crew.appendChild(el);
    }
    card.appendChild(crew);

    const ready = !!this.klass && this.picked.size === HANGAR_PICKS;
    const btns = h('div', 'hg-btns');
    btns.appendChild(button('Back', () => {
      this.close();
      onBack();
    }, 'small'));
    btns.appendChild(button(ready ? 'OPEN THE DOOR · RIDE OUT' : !this.klass ? 'Choose a Titan' : `Choose ${HANGAR_PICKS - this.picked.size} more officer${HANGAR_PICKS - this.picked.size > 1 ? 's' : ''}`, () => {
      if (!ready) return;
      const crew = this.roster.filter((c) => this.picked.has(c.id));
      this.close();
      this.app.newGame(this.klass!, undefined, crew);
    }, ready ? 'primary big' : 'disabled'));
    card.appendChild(btns);
    r.appendChild(card);
  }

  /** The class's Titan from above, nose up, in its berth. */
  private shipPreview(k: HullClass): HTMLCanvasElement {
    const t = buildStarterTank(0, 0, k);
    t.rot = 0;
    for (const m of t.modules) m.aim = -0.25 + ((m.id * 7) % 5) * 0.12;
    const ppm = 0.62;
    const p = paintTitan(t, ppm, null, 1.2);
    const c = document.createElement('canvas');
    c.width = p.canvas.height;
    c.height = p.canvas.width;
    const x = c.getContext('2d')!;
    x.imageSmoothingEnabled = false;
    x.translate(c.width / 2, c.height / 2);
    x.rotate(-Math.PI / 2);
    x.drawImage(p.canvas, -p.cx, -p.cy);
    c.className = 'hb-ship';
    return c;
  }
}
