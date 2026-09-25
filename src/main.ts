import './styles.css';
import { App } from './app';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;

function boot(): void {
  try {
    const app = new App(canvas, overlay, ui);
    (window as unknown as { ironcrawl: App }).ironcrawl = app;
  } catch (e) {
    ui.innerHTML = `<div class="fatal"><h2>IRONCRAWL couldn't start</h2><p>Your browser needs WebGL 2 to run the 3D view.</p><pre>${String(e)}</pre></div>`;
    throw e;
  }
}

if (document.fonts && document.fonts.ready) {
  let started = false;
  const go = (): void => {
    if (started) return;
    started = true;
    boot();
  };
  void document.fonts.ready.then(go);
  setTimeout(go, 1500);
} else boot();
