import type { App } from '../app';
import { loadSave } from '../game/save';
import { button, h } from './dom';

export class Title {
  root: HTMLDivElement;
  isOpen = true;

  constructor(parent: HTMLElement, private app: App) {
    this.root = h('div', 'title-screen');
    parent.appendChild(this.root);
    this.render();
  }

  render(): void {
    const save = loadSave();
    this.root.innerHTML = `<div class="title-card">
      <div class="logo">IRONCRAWL</div>
      <div class="tag">A rolling fortress in a tech-punk wasteland</div>
      <ul class="pitch">
        <li>Your base is a <b>whole facility on treads</b>. Drive it with <b>WASD</b>; it rolls over rocks and ruins, and its guns aim themselves.</li>
        <li><b>Battle cards</b>: drag a card onto the battlefield to call artillery, drop marines, summon a dragon or launch a nuke. Find new cards in packs.</li>
        <li>Inside, run it like a village: <b>builders</b>, a <b>shop</b>, timed upgrades, and a <b>tracker</b> that points you to whatever you're missing.</li>
        <li>Kill things for <b>XP</b>: every commander level unlocks something new. Train <b>squads</b> that guard, fight and scavenge for you.</li>
      </ul>
      <div class="title-btns"></div>
      <div class="foot">Best with mouse + keyboard. Progress saves in your browser.</div>
    </div>`;
    const btns = this.root.querySelector('.title-btns')!;
    if (save) {
      const mins = Math.floor(save.stats.time / 60);
      btns.appendChild(button(`Continue <small>${mins} min · ${save.crew.length} crew</small>`, () => this.app.continueGame(), 'primary'));
    }
    btns.appendChild(
      button(save ? 'New Run' : 'Start', () => {
        if (save) this.app.panels.confirm('Start a new run?', 'Your current fortress, crew and progress will be replaced.', 'New Run', () => this.app.newGame());
        else this.app.newGame();
      }, save ? '' : 'primary'),
    );
  }

  hide(): void {
    this.isOpen = false;
    this.root.style.display = 'none';
  }

  show(): void {
    this.isOpen = true;
    this.render();
    this.root.style.display = 'flex';
  }
}
