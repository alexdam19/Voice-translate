import { BufferAttribute, BufferGeometry, CanvasTexture, NearestFilter, NormalBlending, Points, ShaderMaterial, SRGBColorSpace } from 'three';
import { creatureCanvas } from './sprites';

/**
 * Every creature on screen in two draw calls: one batch of blob shadows and one batch of pixel sprites.
 * Sprite frames are drawn once into an atlas; each creature is a point sprite that looks up its frame there.
 * This is what lets a horde of hundreds run at full speed on a phone.
 */

const CELL = 32;
const GRID = 16;
const SIZE = CELL * GRID;

const VERT = `
attribute float size;
attribute vec3 cell;
uniform float pxScale;
varying vec3 vCell;
void main() {
  vCell = cell;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // Anchor at the feet, like a sprite with its centre near the bottom: shift up in view space.
  mv.y += size * 0.42 * cell.z;
  gl_PointSize = max(1.0, size * pxScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform sampler2D map;
varying vec3 vCell;
void main() {
  vec2 pc = gl_PointCoord;
  float idx = floor(vCell.x + 0.5);
  if (vCell.y > 0.5) pc.x = 1.0 - pc.x;
  vec2 cellXY = vec2(mod(idx, ${GRID}.0), floor(idx / ${GRID}.0));
  vec2 uv = (cellXY + pc) / ${GRID}.0;
  vec4 c = texture2D(map, vec2(uv.x, 1.0 - uv.y));
  if (c.a < 0.5) discard;
  gl_FragColor = c;
}`;

const SHADOW_FRAG = `
varying vec3 vCell;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  d.y *= 2.2;
  float r = dot(d, d) * 4.0;
  if (r > 1.0) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, 0.42 * (1.0 - r * 0.6));
}`;

class PointBatch {
  points: Points;
  mat: ShaderMaterial;
  private geo = new BufferGeometry();
  private pos: Float32Array;
  private size: Float32Array;
  private cell: Float32Array;
  n = 0;

  constructor(private cap: number, frag: string, uniforms: Record<string, { value: unknown }>, transparent: boolean) {
    this.pos = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.cell = new Float32Array(cap * 3);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('size', new BufferAttribute(this.size, 1));
    this.geo.setAttribute('cell', new BufferAttribute(this.cell, 3));
    this.mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, uniforms,
      transparent, depthWrite: !transparent, blending: NormalBlending,
    });
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  add(x: number, y: number, z: number, size: number, cell: number, flip: number, lift: number): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.size[i] = size;
    this.cell[i * 3] = cell;
    this.cell[i * 3 + 1] = flip;
    this.cell[i * 3 + 2] = lift;
  }

  flush(): void {
    for (const k of ['position', 'size', 'cell']) (this.geo.getAttribute(k) as BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
    this.n = 0;
  }
}

export class CreatureLayer {
  readonly sprites: PointBatch;
  readonly shadows: PointBatch;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private cells = new Map<string, number>();
  private dirty = false;

  constructor(cap = 1500) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.magFilter = NearestFilter;
    this.tex.minFilter = NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = SRGBColorSpace;
    const px = { value: 300 };
    this.sprites = new PointBatch(cap, FRAG, { map: { value: this.tex }, pxScale: px }, false);
    this.shadows = new PointBatch(cap, SHADOW_FRAG, { pxScale: px }, true);
    this.shadows.points.renderOrder = -1;
  }

  set pxScale(v: number) {
    this.sprites.mat.uniforms.pxScale.value = v;
  }

  /** Atlas slot for a creature frame (drawn the first time it's needed). */
  cellFor(kind: string, color: string, frame: number, variant: 'n' | 'flash' | 'elite'): number {
    const key = `${kind}|${color}|${frame}|${variant}`;
    let i = this.cells.get(key);
    if (i === undefined) {
      i = this.cells.size;
      if (i >= GRID * GRID) return 0;
      this.cells.set(key, i);
      this.ctx.drawImage(creatureCanvas(kind, color, frame, variant), (i % GRID) * CELL, Math.floor(i / GRID) * CELL);
      this.dirty = true;
    }
    return i;
  }

  /** One creature: world position (x, ground height, y), sprite size, atlas cell, facing. */
  add(x: number, y: number, h: number, size: number, cell: number, flip: boolean, shadowR: number, groundY = 0.04): void {
    this.sprites.add(x, h, y, size, cell, flip ? 1 : 0, 1);
    if (shadowR > 0) this.shadows.add(x, groundY, y, shadowR * 2.2, 0, 0, 0);
  }

  flush(): void {
    if (this.dirty) {
      this.tex.needsUpdate = true;
      this.dirty = false;
    }
    this.sprites.flush();
    this.shadows.flush();
  }
}
