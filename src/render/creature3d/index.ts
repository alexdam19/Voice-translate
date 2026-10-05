import * as THREE from 'three';
import type { Enemy } from '../../game/entities';
import type { EnemyDef } from '../../game/enemyDefs';
import { archFor } from '../px/creatures2d';
import { SHIP_LEAN } from '../ship3d';
import { buildRig, type Built, type Rig, type Spec } from './rigs';

/**
 * Every creature and enemy machine drawn from a 3D model. Small things (the hordes) are baked once into a sheet of
 * eight facings by eight frames (six of the walk, two of the attack) through the same oblique lens as the ship and
 * the base, sun and shadow included, and drawn from it; giants and bosses are posed and rendered live every frame.
 */

const DIRS = 8, FRAMES = 8, WALK = 6;
const CANVAS = 1024;

interface Sheet {
  img: HTMLCanvasElement;
  cw: number;
  ch: number;
  /** Model units: footprint radius, the lens's reach and the tallest point. */
  R: number;
  top: number;
  /** Pixels per unit the sheet was baked at. */
  upx: number;
  fp: number;
}

let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
let scene: THREE.Scene;
let camera: THREE.Camera;
let ground: THREE.Mesh;
let sun: THREE.DirectionalLight;

function init(): boolean {
  if (renderer) return true;
  if (failed) return false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = CANVAS;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true });
    renderer.setSize(CANVAS, CANVAS, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.autoClear = false;
  } catch {
    failed = true;
    renderer = null;
    return false;
  }
  scene = new THREE.Scene();
  camera = new THREE.Camera();
  scene.add(new THREE.HemisphereLight('#d0dcec', '#4a4038', 2.2));
  sun = new THREE.DirectionalLight('#fff4e4', 3);
  sun.position.set(-4, 10, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(384, 384);
  sun.shadow.bias = -0.002;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#ffd0b0', 0.9);
  rim.position.set(5, 3, 6);
  scene.add(rim);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.45 }));
  ground.receiveShadow = true;
  ground.frustumCulled = false;
  scene.add(ground);
  return true;
}

// ------------------------------------------------------------------------------------------------ what each enemy is

const FACTION_GLOW: Record<string, string> = { zombie: '#c6ff00', necro: '#76ff9a', cyborg: '#40e0ff', military: '#ff4030', raider: '#ffb040', monster: '#ff3030' };

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k >= 0) c.lerp(new THREE.Color('#ffffff'), k);
  else c.multiplyScalar(1 + k);
  return `#${c.getHexString()}`;
}

const specCache = new Map<string, Spec | null>();

/** The model an enemy kind is drawn as. */
export function specFor(kind: string, def: EnemyDef | undefined): Spec | null {
  if (specCache.has(kind)) return specCache.get(kind)!;
  const s = makeSpec(kind, def);
  specCache.set(kind, s);
  return s;
}

function makeSpec(kind: string, def: EnemyDef | undefined): Spec | null {
  if (!def || kind.includes('part')) return null;
  const n = `${kind} ${def.name}`.toLowerCase();
  const has = (...w: string[]): boolean => w.some((k) => n.includes(k));
  const arch = archFor(kind, def.arch);
  const color = def.color ?? '#9e9e9e';
  const fac = def.faction ?? '';
  const glow = FACTION_GLOW[fac] ?? (has('frost', 'ice', 'snow', 'cryo') ? '#80e8ff' : has('lava', 'fire', 'scorch', 'burn', 'magma', 'radia') ? '#ff8a20' : has('spire', 'crystal', 'void', 'anomaly') ? '#e040fb' : '#ff4a3a');
  const s: Spec = {
    rig: 'biped', body: color, dark: shade(color, -0.5), accent: shade(color, 0.3), glow, skin: color, build: 'normal', head: 'human', weapon: 'none',
    zombie: false, bones: false, robe: false, armor: 'none', spikes: false, heads: 1, shield: false, quad: 'beast', bug: 'beetle', serpent: 'worm', veh: 'buggy',
    rotor: 'drone', elem: 'fire', float: false,
  };
  const set = (o: Partial<Spec>): Spec => Object.assign(s, o);
  const elem = has('storm') ? 'storm' : has('water', 'drowned', 'lake') ? 'water' : has('sand', 'dune') ? 'sand' : has('frost', 'ice', 'snow') ? 'frost' : 'fire';
  // Bosses first, by name.
  if (has('warlord')) return set({ build: 'hulk', head: 'horned', weapon: 'axe', armor: 'heavy', spikes: true, accent: '#6a6e78', skin: '#a07050' });
  if (has('goliath')) return set({ rig: 'mech', glow: '#ff3030' });
  if (has('abomination')) return set({ build: 'hulk', zombie: true, heads: 3, skin: '#b08070', body: '#9a6a5a', spikes: true });
  if (has('overmind')) return set({ rig: 'brain', glow: '#e040fb' });
  if (has('lich')) return set({ robe: true, head: 'crown', bones: true, weapon: 'staff', body: '#3a2a5a', glow: '#76ff9a' });
  if (has('queen', 'brood')) return set({ rig: 'bug', bug: 'queen' });
  if (has('devourer', 'world eater')) return set({ rig: 'maw' });
  if (has('the_spire', 'the spire')) return set({ rig: 'crystal', glow: '#e040fb' });
  if (has('pharaoh', 'colossal walker', 'titan_walker')) return set({ rig: 'mech', body: has('pharaoh') ? '#c8a050' : color });
  // Machines.
  if (kind === 'mech' || has('walker mech')) return set({ rig: 'mech' });
  if (has('gunship')) return set({ rig: 'rotor', rotor: 'gunship' });
  if (has('reaver')) return set({ rig: 'rotor', rotor: 'reaver' });
  if (has('drone')) return set({ rig: 'rotor', rotor: 'drone' });
  if (has('mil_bot', 'sentry bot', 'unit', 'forge bot')) return set({ rig: 'treadbot' });
  if (has('mil_artillery', 'mortar', 'tank')) return set({ rig: 'vehicle', veh: 'tank' });
  if (has('bike')) return set({ rig: 'vehicle', veh: 'bike' });
  if (has('barge')) return set({ rig: 'vehicle', veh: 'barge' });
  if (has('war rig', 'road hog', 'hog')) return set({ rig: 'vehicle', veh: 'rig' });
  if (has('truck')) return set({ rig: 'vehicle', veh: 'truck' });
  if (has('buggy') || arch === 'vehicle') return set({ rig: 'vehicle', veh: 'buggy' });
  // Spirits and oddities.
  if (has('wraith', 'phantom', 'void', 'drowned', 'entity') && !has('wyrm')) return set({ rig: 'wraith', body: shade(color, -0.25) });
  if (has('dragon')) return set({ rig: 'dragon' });
  if (has('bat')) return set({ rig: 'bat' });
  // Serpents.
  if (has('wyrm')) return set({ rig: 'serpent', serpent: 'wyrm' });
  if (has('leviathan', 'eel')) return set({ rig: 'serpent', serpent: 'eel' });
  if (has('fish')) return set({ rig: 'serpent', serpent: 'fish' });
  if (has('worm') || arch === 'worm') return set({ rig: 'serpent', serpent: 'worm' });
  // Giants.
  if (has('colossus') && (elem === 'storm' || elem === 'water' || elem === 'sand')) return set({ rig: 'elemental', elem, glow: elem === 'storm' ? '#b8e0ff' : elem === 'water' ? '#60e0f0' : '#ffc860' });
  if (has('behemoth', 'beast', 'terror')) return set({ rig: 'quad', quad: has('crystal') ? 'beast' : 'behemoth', accent: shade(color, -0.2) });
  if (has('guardian', 'gatekeeper', 'crater guard', 'obsidian', 'ancient') || (has('colossus') && has('stone'))) return set({ build: 'hulk', head: 'stone', armor: 'stone', weapon: 'blade', shield: true, body: has('obsidian') ? '#2a2630' : color, glow: has('obsidian') ? '#ff8a20' : '#60ffd0' });
  if (has('troll')) return set({ build: 'knuckle', armor: 'fur', head: 'horned', weapon: 'claws' });
  if (has('bone_golem', 'bone colossus')) return set({ build: 'hulk', head: 'skull', armor: 'stone', body: '#d8ccb0', spikes: true, weapon: 'claws', glow: '#76ff9a' });
  if (has('giant', 'golem', 'brute') && !has('colossus')) return set({ build: kind === 'brute' || has('debris') ? 'knuckle' : 'hulk', head: 'horned', armor: has('debris', 'scrap') ? 'heavy' : 'none', spikes: true, weapon: 'claws', zombie: kind === 'z_brute' });
  if (has('colossus', 'titan')) return set({ build: 'hulk', head: 'horned', armor: 'heavy', weapon: has('fire', 'lava') ? 'hammer' : has('frost') ? 'axe' : 'cannon', spikes: true });
  // The dead.
  if (fac === 'zombie' || kind.startsWith('z_')) {
    if (kind === 'z_bloater') return set({ zombie: true, build: 'hulk', head: 'human', skin: '#a8b060', body: '#8a8a40' });
    return set({ zombie: true, build: kind === 'z_runner' ? 'thin' : 'normal', skin: '#8a9a6b', body: kind === 'z_runner' ? '#5a4a3a' : '#4a5060', dark: '#2a2a28' });
  }
  if (has('skeleton', 'skel_')) return set({ bones: true, build: 'thin', weapon: has('archer') ? 'bow' : 'blade', glow: '#76ff9a' });
  if (has('necromancer')) return set({ robe: true, head: 'hood', weapon: 'staff', body: '#3a2a4a', dark: '#1a1020', glow: '#b388ff' });
  // Cyborgs.
  if (kind === 'cy_hound' || has('chrome hound')) return set({ rig: 'quad', quad: 'hound' });
  if (kind === 'cy_enforcer') return set({ build: 'hulk', armor: 'chrome', head: 'visor', weapon: 'cannon', accent: '#9ab8c8' });
  if (kind.startsWith('cy_')) return set({ armor: 'chrome', head: 'visor', weapon: kind === 'cy_sniper' ? 'rifle' : 'plasma', build: kind === 'cy_sniper' ? 'thin' : 'normal', accent: '#9ab8c8', skin: '#c8ccd4' });
  // People.
  if (arch === 'humanoid' || has('raider', 'scav', 'scout', 'rocketeer', 'burner', 'swimmer')) {
    const head = has('burner') ? 'gasmask' : has('rocketeer') ? 'helmet' : has('scout') ? 'helmet' : kind.length % 2 ? 'mohawk' : 'gasmask';
    return set({ head, weapon: has('rocketeer') ? 'rocket' : has('burner') ? 'flamer' : 'rifle', armor: 'light', skin: '#c8906a', body: shade(color, -0.2), accent: '#6a5a44' });
  }
  // Animals.
  if (has('rat', 'rabbit') || kind === 'bomber') return set({ rig: 'quad', quad: 'rat' });
  if (has('dog', 'wolf', 'hound')) return set({ rig: 'quad', quad: 'dog' });
  if (has('boar')) return set({ rig: 'quad', quad: 'boar' });
  if (has('goat')) return set({ rig: 'quad', quad: 'goat' });
  if (has('stalker', 'ravager', 'imp', 'lizard')) return set({ rig: 'quad', quad: has('imp', 'lizard') ? 'lizard' : 'beast' });
  // Bugs.
  if (has('scorpion')) return set({ rig: 'bug', bug: 'scorpion' });
  if (has('spitter')) return set({ rig: 'bug', bug: 'spitter', glow: has('ice') ? '#80e8ff' : '#9cff40' });
  if (has('leaper')) return set({ rig: 'bug', bug: 'leaper' });
  if (has('crawler')) return set({ rig: 'bug', bug: has('spire', 'rock') ? 'spider' : 'crawler' });
  if (has('swarm', 'swarmer') || arch === 'swarm' || arch === 'insect') return set({ rig: 'bug', bug: 'beetle' });
  if (arch === 'canine') return set({ rig: 'quad', quad: 'dog' });
  if (arch === 'flyer') return set({ rig: 'rotor', rotor: 'drone' });
  if (arch === 'fish') return set({ rig: 'serpent', serpent: 'fish' });
  if (arch === 'entity') return set({ rig: 'wraith' });
  if (arch === 'golem') return set({ build: 'hulk', head: 'horned', spikes: true, weapon: 'claws' });
  if (arch === 'bot') return set({ rig: 'treadbot' });
  return set({ rig: 'quad', quad: 'beast' });
}

/** Footprint radius (model units) each body plan stands in, so it's drawn the size the game thinks it is. */
function footprint(s: Spec): number {
  const k: Record<Rig, number> = { biped: 1.15, quad: 1.35, bug: 1.25, serpent: 1.9, bat: 1.3, dragon: 2.2, rotor: 1.2, wraith: 1, vehicle: 1.3, treadbot: 0.9, mech: 1.25, elemental: 1.5, brain: 1.4, maw: 1.5, crystal: 1.4 };
  let f = k[s.rig];
  if (s.rig === 'biped' && (s.build === 'hulk' || s.build === 'knuckle')) f = 1.55;
  if (s.rig === 'quad' && s.quad === 'behemoth') f = 1.8;
  if (s.rig === 'bug' && s.bug === 'queen') f = 2.6;
  if (s.rig === 'bug' && s.bug === 'spider') f = 1.6;
  if (s.rig === 'rotor' && s.rotor === 'gunship') f = 1.9;
  if (s.rig === 'vehicle' && (s.veh === 'rig' || s.veh === 'barge')) f = 1.7;
  return f;
}

// ------------------------------------------------------------------------------------------------ the lens

/** Sets the oblique lens over a box R units round the model and `top` high (heights lean up the screen). */
function lens(R: number, top: number): void {
  const hh = R + (SHIP_LEAN * top) / 2, cy = -(SHIP_LEAN * top) / 2, D = R * SHIP_LEAN + top + 4;
  const pm = new THREE.Matrix4().set(
    1 / R, 0, 0, 0,
    0, SHIP_LEAN / hh, -1 / hh, cy / hh,
    0, -1 / D, -SHIP_LEAN / D, 0,
    0, 0, 0, 1,
  );
  camera.projectionMatrix.copy(pm);
  camera.projectionMatrixInverse.copy(pm).invert();
  ground.scale.set(R * 3, 1, R * 3);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = sc.bottom = -R * 1.6;
  sc.right = sc.top = R * 1.6;
  sc.near = 0.1;
  sc.far = 60;
  sc.updateProjectionMatrix();
  sun.position.set(-R * 1.2, R * 2 + top, -R * 1.1);
}

/** Model reach and height over its gait and attack. */
function extent(b: Built): { R: number; top: number } {
  let R = 0.5, top = 0.5;
  const box = new THREE.Box3();
  for (const [p, a] of [[0, 0], [0.25, 0], [0.5, 0.5], [0.75, 1]]) {
    b.pose(p, a);
    b.root.updateMatrixWorld(true);
    box.setFromObject(b.root);
    R = Math.max(R, Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
    top = Math.max(top, box.max.y);
  }
  // Facing any way, the corners swing out.
  return { R: R * 1.12 + 0.1, top: top + 0.1 };
}

// ------------------------------------------------------------------------------------------------ baking

const sheets = new Map<string, Sheet>();
const models = new Map<string, Built>();
let bakesLeft = 0;

function modelFor(kind: string, s: Spec): Built {
  let b = models.get(kind);
  if (!b) {
    b = buildRig(s);
    b.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    models.set(kind, b);
  }
  return b;
}

function bake(kind: string, s: Spec, upxWant: number): Sheet | null {
  if (!init() || !renderer) return null;
  const b = modelFor(kind, s);
  const { R, top } = extent(b);
  const Hc = 2 * R + SHIP_LEAN * top;
  // Cells must fit eight across the canvas.
  const upx = Math.max(4, Math.min(upxWant, Math.floor(CANVAS / DIRS / Hc), Math.floor(CANVAS / FRAMES / (2 * R))));
  const cw = Math.ceil(2 * R * upx), ch = Math.ceil(Hc * upx);
  lens(R, top);
  ground.visible = !s.float && s.rig !== 'bat' && s.rig !== 'dragon' && s.rig !== 'rotor' && s.rig !== 'wraith' && s.rig !== 'brain';
  scene.add(b.root);
  renderer.setScissorTest(true);
  renderer.setScissor(0, 0, CANVAS, CANVAS);
  renderer.clear();
  for (let d = 0; d < DIRS; d++) {
    b.root.rotation.y = -(d / DIRS) * Math.PI * 2;
    for (let f = 0; f < FRAMES; f++) {
      if (f < WALK) b.pose(f / WALK, 0);
      else b.pose(0, f === WALK ? 0.3 : 0.6);
      // The canvas's origin is bottom-left; rows of facings from the top.
      const x = f * cw, y = CANVAS - (d + 1) * ch;
      renderer.setViewport(x, y, cw, ch);
      renderer.setScissor(x, y, cw, ch);
      renderer.render(scene, camera);
    }
  }
  renderer.setScissorTest(false);
  scene.remove(b.root);
  const img = document.createElement('canvas');
  img.width = cw * FRAMES;
  img.height = ch * DIRS;
  img.getContext('2d')!.drawImage(renderer.domElement, 0, 0, img.width, img.height, 0, 0, img.width, img.height);
  return { img, cw, ch, R, top, upx, fp: footprint(s) };
}

/** Starts a frame's drawing: a few sheets may be baked per frame (the rest wait their turn with the old art). */
export function beginCreatures3D(): void {
  bakesLeft = (window as unknown as { __bakes?: number }).__bakes ?? 1;
}

const UPX = [8, 12, 18, 26, 38, 56];

function sheetFor(kind: string, s: Spec, upx: number): Sheet | null {
  const want = UPX.find((u) => u >= upx * 0.9) ?? UPX[UPX.length - 1];
  const key = `${kind}|${want}`;
  const have = sheets.get(key);
  if (have) {
    sheets.delete(key);
    sheets.set(key, have);
    return have;
  }
  // Anything already baked at another size will do while this one waits.
  if (bakesLeft <= 0) {
    for (const u of UPX) {
      const o = sheets.get(`${kind}|${u}`);
      if (o) return o;
    }
    return null;
  }
  bakesLeft--;
  const sh = bake(kind, s, want);
  if (sh) {
    // One size per kind, and only so many kinds kept (the least lately drawn go first).
    for (const u of UPX) sheets.delete(`${kind}|${u}`);
    sheets.set(key, sh);
    if (sheets.size > 48) sheets.delete(sheets.keys().next().value!);
  }
  return sh;
}

// ------------------------------------------------------------------------------------------------ drawing

/**
 * Draws an enemy from its model. `size` is the width it should stand (px), `a` its facing on screen, (sx, sy) where
 * its feet are. False if there's no model for it (or no WebGL), and the caller draws the old art.
 */
export function drawCreature3D(c: CanvasRenderingContext2D, e: Enemy, def: EnemyDef | undefined, sx: number, sy: number, size: number, a: number, live: boolean): boolean {
  const s = specFor(e.kind, def);
  if (!s) return false;
  const fp = footprint(s);
  const upx = size / 2 / fp;
  const atk = (e.atkT ?? 9) < 0.5 ? (e.atkT ?? 9) / 0.5 : 0;
  const moving = true;
  const phase = (((e.anim ?? 0) * (s.rig === 'rotor' || s.rig === 'bat' ? 2 : 0.9)) % 1 + 1) % 1;
  if (live) return drawLive(c, e.kind, s, sx, sy, upx, a, moving ? phase : 0, atk, e.hitFlash > 0);
  const sh = sheetFor(e.kind, s, upx);
  if (!sh) return false;
  const dir = ((Math.round(a / ((Math.PI * 2) / DIRS)) % DIRS) + DIRS) % DIRS;
  const frame = atk > 0 ? (atk < 0.5 ? WALK : WALK + 1) : moving ? Math.floor(phase * WALK) % WALK : 0;
  const k = upx / sh.upx;
  const dw = sh.cw * k, dh = sh.ch * k;
  const dx = sx - sh.R * upx, dy = sy - (sh.R + SHIP_LEAN * sh.top) * upx;
  c.imageSmoothingEnabled = k < 0.98 || k > 1.3;
  c.drawImage(sh.img, frame * sh.cw, dir * sh.ch, sh.cw, sh.ch, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
  if (e.hitFlash > 0) {
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.55;
    c.drawImage(sh.img, frame * sh.cw, dir * sh.ch, sh.cw, sh.ch, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  return true;
}

/** A giant or a boss, posed for this very frame. */
function drawLive(c: CanvasRenderingContext2D, kind: string, s: Spec, sx: number, sy: number, upx: number, a: number, phase: number, atk: number, flash: boolean): boolean {
  if (!init() || !renderer) return false;
  const b = modelFor(kind, s);
  let ext = extents.get(kind);
  if (!ext) {
    ext = extent(b);
    extents.set(kind, ext);
  }
  const { R, top } = ext;
  const Hc = 2 * R + SHIP_LEAN * top;
  const u = Math.min(upx, CANVAS / Hc, CANVAS / (2 * R));
  const cw = Math.ceil(2 * R * u), ch = Math.ceil(Hc * u);
  lens(R, top);
  ground.visible = !(s.rig === 'bat' || s.rig === 'dragon' || s.rig === 'rotor' || s.rig === 'wraith' || s.rig === 'brain');
  b.pose(phase, atk);
  b.root.rotation.y = -a;
  scene.add(b.root);
  renderer.setScissorTest(true);
  renderer.setViewport(0, CANVAS - ch, cw, ch);
  renderer.setScissor(0, CANVAS - ch, cw, ch);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setScissorTest(false);
  scene.remove(b.root);
  const k = upx / u;
  const dx = sx - R * upx, dy = sy - (R + SHIP_LEAN * top) * upx;
  c.imageSmoothingEnabled = true;
  c.drawImage(renderer.domElement, 0, 0, cw, ch, Math.round(dx), Math.round(dy), Math.round(cw * k), Math.round(ch * k));
  if (flash) {
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.5;
    c.drawImage(renderer.domElement, 0, 0, cw, ch, Math.round(dx), Math.round(dy), Math.round(cw * k), Math.round(ch * k));
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  return true;
}

const extents = new Map<string, { R: number; top: number }>();
