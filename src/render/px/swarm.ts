/**
 * The swarm's fodder, drawn as crisp little silhouettes rather than shrunken models (which come out as blobs at a
 * handful of pixels): a skittering six-legged bug with a carapace ridge and mandibles, a shambling figure reaching
 * forward, a low four-legged runner, each with the faction's glowing eye. Every design is painted once at 32 px in
 * sixteen facings and four frames of its gait, and drawn from that sheet at whatever size the swarm is.
 */

export type SwarmShape = 'skitter' | 'shambler' | 'runner';

const RES = 32, DIRS = 16, FRAMES = 4;
const sheets = new Map<string, HTMLCanvasElement>();

/** Which silhouette a fodder kind is drawn as. */
export function swarmShape(kind: string, arch?: string): SwarmShape {
  const k = kind.toLowerCase();
  if (k.startsWith('z_') || k.includes('skel') || k.includes('zomb') || k.includes('ghoul') || k.includes('husk') || arch === 'humanoid') return 'shambler';
  if (k.includes('rat') || k.includes('hound') || k.includes('dog') || k.includes('wolf') || arch === 'canine' || arch === 'beast') return 'runner';
  return 'skitter';
}

const GLOW: Record<string, string> = { zombie: '#c6ff00', necro: '#76ff9a', cyborg: '#40e0ff', military: '#ff4030', raider: '#ffb040' };

/** The eye's glow for a faction. */
export function swarmGlow(faction?: string): string {
  return GLOW[faction ?? ''] ?? '#ff3a2a';
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number): number => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Paints one frame facing +x (the sheet turns it). */
function paint(c: CanvasRenderingContext2D, shape: SwarmShape, color: string, glow: string, f: number): void {
  const shell = mix(color, '#101216', 0.62), edge = mix(color, '#ffffff', 0.15), dark = '#07080a';
  const ph = (f / FRAMES) * Math.PI * 2;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (shape === 'skitter') {
    // Six legs in two tripods, each a knee and a foot, swinging alternately.
    c.strokeStyle = dark;
    c.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      for (const sd of [-1, 1]) {
        const tri = (i + (sd > 0 ? 1 : 0)) % 2 === 0 ? 1 : -1;
        const sw = Math.sin(ph) * 3 * tri;
        const bx = 2 - i * 4, kx = bx + 1 + sw * 0.5 - i * 1.2, fx = bx + 3 + sw - i * 2.6;
        c.beginPath();
        c.moveTo(bx, sd * 2.5);
        c.lineTo(kx, sd * 7.5);
        c.lineTo(fx, sd * 11);
        c.stroke();
      }
    }
    // Abdomen, thorax, head: a hard carapace with a lit ridge.
    c.fillStyle = shell;
    c.strokeStyle = dark;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-12, 0);
    c.lineTo(-7, -4.6);
    c.lineTo(-1, -3.4);
    c.lineTo(4, -3);
    c.lineTo(9, -1.8);
    c.lineTo(11, 0);
    c.lineTo(9, 1.8);
    c.lineTo(4, 3);
    c.lineTo(-1, 3.4);
    c.lineTo(-7, 4.6);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = edge;
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(-10, 0);
    c.lineTo(8, 0);
    c.stroke();
    c.strokeStyle = dark;
    c.beginPath();
    c.moveTo(-1, -3.4);
    c.lineTo(-1, 3.4);
    c.moveTo(4, -3);
    c.lineTo(4, 3);
    c.stroke();
    // Mandibles opening and closing, the eye.
    const m = 1.2 + Math.sin(ph * 2) * 0.8;
    c.strokeStyle = dark;
    c.lineWidth = 1.2;
    for (const sd of [-1, 1]) {
      c.beginPath();
      c.moveTo(10, sd * 1.4);
      c.lineTo(13.5, sd * (1.2 + m));
      c.lineTo(14.5, sd * 0.4);
      c.stroke();
    }
    c.fillStyle = glow;
    c.beginPath();
    c.arc(8.4, 0, 1.5, 0, Math.PI * 2);
    c.fill();
  } else if (shape === 'runner') {
    // Low and long: four legs galloping, a tail, the head forward.
    c.strokeStyle = dark;
    c.lineWidth = 1.8;
    for (const [bx, sd, o] of [[5, -1, 0], [5, 1, Math.PI], [-5, -1, Math.PI], [-5, 1, 0]] as const) {
      const sw = Math.sin(ph + o) * 3.5;
      c.beginPath();
      c.moveTo(bx, sd * 2.4);
      c.lineTo(bx + sw, sd * 7);
      c.stroke();
    }
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(-8, 0);
    c.quadraticCurveTo(-12, Math.sin(ph) * 3, -14, Math.sin(ph + 1) * 4);
    c.stroke();
    c.fillStyle = shell;
    c.strokeStyle = dark;
    c.lineWidth = 1.1;
    c.beginPath();
    c.ellipse(0, 0, 9, 3.6, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(8, -2.6);
    c.lineTo(13.5, -1.2);
    c.lineTo(14.5, 0);
    c.lineTo(13.5, 1.2);
    c.lineTo(8, 2.6);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = edge;
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(-6, 0);
    c.lineTo(6, 0);
    c.stroke();
    // Ears back, the eyes.
    c.fillStyle = dark;
    for (const sd of [-1, 1]) {
      c.beginPath();
      c.moveTo(9.5, sd * 1.8);
      c.lineTo(7, sd * 4.4);
      c.lineTo(8.8, sd * 2.4);
      c.fill();
    }
    c.fillStyle = glow;
    for (const sd of [-1, 1]) c.fillRect(11.6, sd * 1.1 - 0.6, 1.4, 1.2);
  } else {
    // A figure from above: shoulders hunched, arms reaching forward and clawing, the head down, legs shuffling.
    c.strokeStyle = dark;
    c.lineWidth = 2;
    for (const sd of [-1, 1]) {
      const st = Math.sin(ph + (sd > 0 ? Math.PI : 0)) * 3;
      c.beginPath();
      c.moveTo(-1, sd * 2.2);
      c.lineTo(-5 + st, sd * 3);
      c.stroke();
    }
    c.lineWidth = 1.7;
    for (const sd of [-1, 1]) {
      const reach = 8.5 + Math.sin(ph * 2 + (sd > 0 ? 1.4 : 0)) * 1.6;
      c.beginPath();
      c.moveTo(0.5, sd * 4.6);
      c.lineTo(5, sd * 4.4);
      c.lineTo(reach, sd * 2.6);
      c.stroke();
      c.fillStyle = dark;
      c.beginPath();
      c.arc(reach + 0.6, sd * 2.4, 1, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = shell;
    c.strokeStyle = dark;
    c.lineWidth = 1.1;
    c.beginPath();
    c.ellipse(0, 0, 3.4, 5.6, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = mix(color, '#d8c8a8', 0.35);
    c.beginPath();
    c.arc(2.6, 0, 2.6, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = glow;
    c.fillRect(4, -1.4, 1.2, 1);
    c.fillRect(4, 0.4, 1.2, 1);
  }
}

/** The sheet for a design in a colour: sixteen facings down, four frames across, RES px each. */
function sheet(shape: SwarmShape, color: string, glow: string): HTMLCanvasElement {
  const key = `${shape}|${color}|${glow}`;
  let cv = sheets.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = RES * FRAMES;
  cv.height = RES * DIRS;
  const c = cv.getContext('2d')!;
  for (let d = 0; d < DIRS; d++) {
    for (let f = 0; f < FRAMES; f++) {
      c.save();
      c.translate(f * RES + RES / 2, d * RES + RES / 2);
      c.rotate((d / DIRS) * Math.PI * 2);
      // A soft contact shadow under it first.
      c.fillStyle = 'rgba(0,0,0,0.28)';
      c.beginPath();
      c.ellipse(-1, 1.5, 11, 6, 0, 0, Math.PI * 2);
      c.fill();
      paint(c, shape, color, glow, f);
      c.restore();
    }
  }
  if (sheets.size > 40) sheets.delete(sheets.keys().next().value!);
  sheets.set(key, cv);
  return cv;
}

/**
 * Draws one of the swarm at (sx, sy) on screen, `size` px across, facing `a` (screen radians), at gait phase `phase`
 * (0-1). The hit flash brightens it.
 */
export function drawSwarm(c: CanvasRenderingContext2D, shape: SwarmShape, color: string, glow: string, sx: number, sy: number, size: number, a: number, phase: number, flash: boolean): void {
  const sh = sheet(shape, color, glow);
  const d = ((Math.round((a / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
  const f = Math.floor(((phase % 1) + 1) % 1 * FRAMES) % FRAMES;
  const s = Math.max(4, Math.round(size * 1.15));
  c.imageSmoothingEnabled = true;
  c.drawImage(sh, f * RES, d * RES, RES, RES, Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
  if (flash) {
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.6;
    c.drawImage(sh, f * RES, d * RES, RES, RES, Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
}
