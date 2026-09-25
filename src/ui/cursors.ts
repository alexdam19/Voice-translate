import { Pix } from '../render/pixel';

/** Pixel-art mouse cursors (LoL-style: arrow, attack, harvest, interact). */
function cur(draw: (p: Pix) => void, hx: number, hy: number): string {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  const p = new Pix(ctx, 0, 0, 32, 32, 1);
  draw(p);
  return `url(${c.toDataURL()}) ${hx} ${hy}, auto`;
}

const arrow = (fill: string, edge: string) => (p: Pix): void => {
  for (let y = 0; y < 18; y++) {
    const w = Math.min(y, 12 - Math.max(0, y - 12) * 2);
    for (let x = 0; x <= w; x++) p.set(x + 1, y + 1, x === 0 || x === w || y === 17 ? edge : fill);
  }
  p.rect(7, 16, 3, 7, edge);
  p.rect(8, 16, 1, 6, fill);
};

export const CURSORS = {
  default: '',
  attack: '',
  harvest: '',
  interact: '',
  send: '',
};

export function initCursors(): void {
  CURSORS.default = cur(arrow('#ffd54f', '#3e2723'), 1, 1);
  CURSORS.attack = cur((p) => {
    p.ring(12, 12, 8, '#b71c1c');
    p.ring(12, 12, 7, '#ff5252');
    p.rect(11, 0, 3, 8, '#ff5252');
    p.rect(11, 17, 3, 8, '#ff5252');
    p.rect(0, 11, 8, 3, '#ff5252');
    p.rect(17, 11, 8, 3, '#ff5252');
    p.rect(11, 11, 3, 3, '#ffffff');
  }, 12, 12);
  CURSORS.harvest = cur((p) => {
    for (let i = 0; i < 16; i++) p.rect(4 + i, 20 - i, 3, 3, i < 4 ? '#8d6e63' : '#6d4c41');
    p.rect(12, 2, 14, 4, '#ffd740');
    p.rect(22, 2, 4, 10, '#ffd740');
    p.rect(12, 2, 14, 1, '#fff59d');
  }, 4, 22);
  CURSORS.interact = cur((p) => {
    arrow('#4dd0e1', '#004d40')(p);
    p.circle(22, 22, 6, '#00e5ff');
    p.circle(22, 22, 3, '#004d40');
  }, 1, 1);
  CURSORS.send = cur((p) => {
    arrow('#26c6da', '#003040')(p);
    p.rect(16, 18, 12, 6, '#ffca28');
    p.rect(18, 16, 6, 2, '#ffca28');
  }, 1, 1);
}
