import './styles.css';
import { Game } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);

// Handy for debugging from the devtools console.
(window as unknown as { ironcrawl: Game }).ironcrawl = game;
