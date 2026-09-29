import type { App } from '../app';
import { loadSave } from '../game/save';
import { button, h } from './dom';
import { HangarScreen } from './hangar';
import { SHIP_ART } from '../render/px/shipArt';

export class Title {
  root: HTMLDivElement;
  isOpen = true;
  private hangar: HangarScreen;

  constructor(parent: HTMLElement, private app: App) {
    this.root = h('div', 'title-screen');
    parent.appendChild(this.root);
    this.hangar = new HangarScreen(parent, app);
    this.render();
  }

  render(): void {
    const save = loadSave();
    this.root.innerHTML = `<div class="title-card">
      <div class="logo">IRONCRAWL</div>
      <div class="tag">Captain a 200 m Titan Crawler across The Crater</div>
      <img class="title-hero" src="${SHIP_ART.hero}" alt="The Titan Crawler">
      <ul class="pitch">
        <li>Your ship is a <b>Titan Crawler two hundred metres long</b>: seven decks, eight crawlers, guns and soldier nests on the roof. Your officers run its stations; they tire, eat and sleep in shifts.</li>
        <li><b>The Crater</b> is 140 km across: dune wastes, frozen ridges, a toxic lake, volcanic spires, raider canyons and a lost city at the bottom of the Divot. Every zone has its own creatures, from 1 m rats to 150 m war machines.</li>
        <li><b>Hordes</b> pour in, pile up against your hull and climb it. Storms drive your soldiers inside.</li>
        <li>The goal: take the six strongholds' cores home to the <b>Mega Hangar</b>, rebuild your Titan, light the Ark Engine and survive what comes for it.</li>
        <li><b>Battle cards</b>, <b>squads</b>, <b>mini tanks</b>, <b>rival Titans</b>, cruise warp for the long hauls.</li>
      </ul>
      <div class="title-btns"></div>
      <div class="foot">Mouse + keyboard or touch (turn your phone sideways). Progress saves in your browser.</div>
    </div>`;
    const btns = this.root.querySelector('.title-btns')!;
    if (save) {
      const mins = Math.floor(save.stats.time / 60);
      btns.appendChild(button(`Continue <small>${mins} min · ${save.crew.length} officers</small>`, () => this.app.continueGame(), 'primary'));
    }
    btns.appendChild(
      button(save ? 'New Run' : 'Start', () => {
        if (save) this.app.panels.confirm('Start a new run?', 'Your current fortress, crew and progress will be replaced.', 'New Run', () => this.pickClass());
        else this.pickClass();
      }, save ? '' : 'primary'),
    );
  }

  /** New run: the Mega Hangar, where you choose your Titan and your officers. */
  pickClass(): void {
    this.isOpen = true;
    this.root.style.display = 'none';
    this.hangar.open(() => {
      this.root.style.display = 'flex';
      this.render();
    });
  }

  hide(): void {
    this.isOpen = false;
    this.root.style.display = 'none';
    this.hangar.close();
  }

  show(): void {
    this.isOpen = true;
    this.render();
    this.root.style.display = 'flex';
  }
}
