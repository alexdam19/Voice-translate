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
        <li>Command a <b>giant tank-base</b> from above: right-click to drive, your guns aim themselves.</li>
        <li>Every <b>officer</b> has an ability on <b>Q W E R D F</b>.</li>
        <li>Loot areas, <b>runes</b> and chests with <b>rarities</b>, champions and exclusive weapons.</li>
        <li>Upgrade your <b>BASE</b> and your <b>CREW</b>. Reach 15 crew to unlock the <b>Outrider</b>.</li>
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
