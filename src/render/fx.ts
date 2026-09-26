import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial,
  NormalBlending, Points, RingGeometry, ShaderMaterial, CircleGeometry, PlaneGeometry, type Object3D,
} from 'three';

/* ---------------------------------------------------------------------- */
/* Pixel particles                                                         */
/* ---------------------------------------------------------------------- */

const VERT = `
attribute float size;
attribute vec4 pcolor;
varying vec4 vColor;
uniform float pxScale;
void main() {
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, size * pxScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec4 vColor;
void main() {
  if (vColor.a < 0.02) discard;
  gl_FragColor = vColor;
}`;

interface P {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number;
  size: number; r: number; g: number; b: number; grav: number; drag: number; grow: number;
}

export class Particles {
  points: Points;
  private geo: BufferGeometry;
  private pos: Float32Array;
  private col: Float32Array;
  private sz: Float32Array;
  private list: P[] = [];
  mat: ShaderMaterial;

  constructor(private cap: number, additive: boolean) {
    this.geo = new BufferGeometry();
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.sz = new Float32Array(cap);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('pcolor', new BufferAttribute(this.col, 4));
    this.geo.setAttribute('size', new BufferAttribute(this.sz, 1));
    this.mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { pxScale: { value: 300 } }, transparent: true, depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  private cursor = 0;

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: Color, grav = 0, drag = 1, grow = 0): void {
    const p: P = { x, y, z, vx, vy, vz, life, max: life, size, r: color.r, g: color.g, b: color.b, grav, drag, grow };
    if (this.list.length < this.cap) this.list.push(p);
    else {
      // Full: overwrite a slot in rotation instead of shifting the whole list.
      this.cursor = (this.cursor + 1) % this.cap;
      this.list[this.cursor] = p;
    }
  }

  update(dt: number): void {
    const l = this.list;
    let w = 0;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vz -= p.grav * dt;
      const d = Math.pow(p.drag, dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z < 0.02) {
        p.z = 0.02;
        p.vz = 0;
      }
      p.size += p.grow * dt;
      l[w++] = p;
    }
    l.length = w;
    for (let i = 0; i < this.cap; i++) {
      if (i < l.length) {
        const p = l[i];
        this.pos[i * 3] = p.x;
        this.pos[i * 3 + 1] = p.z;
        this.pos[i * 3 + 2] = p.y;
        const a = Math.min(1, (p.life / p.max) * 1.6);
        this.col[i * 4] = p.r;
        this.col[i * 4 + 1] = p.g;
        this.col[i * 4 + 2] = p.b;
        this.col[i * 4 + 3] = a;
        this.sz[i] = p.size;
      } else {
        this.col[i * 4 + 3] = 0;
        this.sz[i] = 0;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    (this.geo.attributes.pcolor as BufferAttribute).needsUpdate = true;
    (this.geo.attributes.size as BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(1, l.length));
  }
}

/* ---------------------------------------------------------------------- */
/* Short-lived meshes: beams, bolts, flashes, rings                        */
/* ---------------------------------------------------------------------- */

interface Temp {
  obj: Object3D;
  life: number;
  max: number;
  kind: 'beam' | 'flash' | 'ring' | 'bolt';
  mat: MeshBasicMaterial | LineBasicMaterial;
  grow: number;
}

const boxGeo = new BoxGeometry(1, 1, 1);
const ringGeo = new RingGeometry(0.9, 1, 40);
ringGeo.rotateX(-Math.PI / 2);

export class Transients {
  group = new Group();
  private list: Temp[] = [];

  beam(x0: number, y0: number, x1: number, y1: number, h: number, color: string, w: number, life: number): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const mat = new MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: AdditiveBlending, depthWrite: false });
    const m = new Mesh(boxGeo, mat);
    m.scale.set(len, w, w);
    m.position.set((x0 + x1) / 2, h, (y0 + y1) / 2);
    m.rotation.y = -Math.atan2(y1 - y0, x1 - x0);
    this.group.add(m);
    this.list.push({ obj: m, life, max: life, kind: 'beam', mat, grow: 0 });
    // Bright core
    const core = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 1, depthWrite: false });
    const c = new Mesh(boxGeo, core);
    c.scale.set(len, w * 0.35, w * 0.35);
    c.position.copy(m.position);
    c.rotation.copy(m.rotation);
    this.group.add(c);
    this.list.push({ obj: c, life: life * 0.7, max: life * 0.7, kind: 'beam', mat: core, grow: 0 });
  }

  /** Vertical orbital beam. */
  pillar(x: number, y: number, color: string, w: number, life: number): void {
    const mat = new MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: AdditiveBlending, depthWrite: false });
    const m = new Mesh(boxGeo, mat);
    m.scale.set(w, 40, w);
    m.position.set(x, 20, y);
    this.group.add(m);
    this.list.push({ obj: m, life, max: life, kind: 'beam', mat, grow: -w / life });
  }

  bolt(pts: { x: number; y: number }[], h: number, color: string): void {
    const verts: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const segs = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.8));
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const j = k === 0 || k === segs ? 0 : 0.35;
        verts.push(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j, h + (Math.random() - 0.5) * j, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * j);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    for (const c of [color, '#ffffff']) {
      const mat = new LineBasicMaterial({ color: c, transparent: true, depthWrite: false });
      const line = new Line(g, mat);
      if (c === '#ffffff') line.position.y = 0.02;
      this.group.add(line);
      this.list.push({ obj: line, life: 0.14, max: 0.14, kind: 'bolt', mat, grow: 0 });
    }
  }

  /** A jagged lightning bolt from the sky down to (x, y). */
  skyBolt(x: number, y: number, color: string): void {
    const verts: number[] = [];
    let px = x + (Math.random() - 0.5) * 3, pz = y + (Math.random() - 0.5) * 3;
    for (let h = 16; h >= 0; h -= 1.2) {
      const t = h / 16;
      px += (x - px) * 0.35 + (Math.random() - 0.5) * 0.9 * t;
      pz += (y - pz) * 0.35 + (Math.random() - 0.5) * 0.9 * t;
      verts.push(h <= 1.2 ? x : px, Math.max(0, h), h <= 1.2 ? y : pz);
    }
    verts.push(x, 0, y);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    for (const c of [color, '#ffffff']) {
      const mat = new LineBasicMaterial({ color: c, transparent: true, depthWrite: false });
      const line = new Line(g, mat);
      if (c === '#ffffff') line.position.x = 0.04;
      this.group.add(line);
      this.list.push({ obj: line, life: 0.22, max: 0.22, kind: 'bolt', mat, grow: 0 });
    }
  }

  flash(x: number, y: number, h: number, r: number, color: string, life = 0.18): void {
    const mat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
    const m = new Mesh(boxGeo, mat);
    m.position.set(x, h, y);
    m.scale.setScalar(r);
    m.rotation.set(0.6, 0.7, 0.2);
    this.group.add(m);
    this.list.push({ obj: m, life, max: life, kind: 'flash', mat, grow: r * 3 });
  }

  ring(x: number, y: number, r: number, color: string, life = 0.45): void {
    const mat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
    const m = new Mesh(ringGeo, mat);
    m.position.set(x, 0.15, y);
    m.scale.setScalar(r * 0.3);
    this.group.add(m);
    this.list.push({ obj: m, life, max: life, kind: 'ring', mat, grow: r });
  }

  update(dt: number): void {
    const l = this.list;
    let w = 0;
    for (const t of l) {
      t.life -= dt;
      const k = Math.max(0, t.life / t.max);
      if (t.life <= 0) {
        this.group.remove(t.obj);
        t.mat.dispose();
        if (t.kind === 'bolt') (t.obj as Line).geometry.dispose();
        continue;
      }
      t.mat.opacity = t.kind === 'ring' ? k : Math.min(1, k * 1.5);
      if (t.kind === 'flash') t.obj.scale.addScalar(t.grow * dt);
      if (t.kind === 'ring') {
        const s = t.obj.scale.x + t.grow * dt * 2.2;
        t.obj.scale.setScalar(s);
      }
      if (t.kind === 'beam' && t.grow) {
        t.obj.scale.x = Math.max(0.05, t.obj.scale.x + t.grow * dt);
        t.obj.scale.z = t.obj.scale.x;
      }
      l[w++] = t;
    }
    l.length = w;
  }
}

/* ---------------------------------------------------------------------- */
/* Ground decals (telegraphs, zones, markers)                              */
/* ---------------------------------------------------------------------- */

const discGeo = new CircleGeometry(1, 36);
discGeo.rotateX(-Math.PI / 2);
const planeGeo = new PlaneGeometry(1, 1);
planeGeo.rotateX(-Math.PI / 2);

export interface Decal {
  root: Group;
  fill: Mesh;
  edge: Mesh;
  fillMat: MeshBasicMaterial;
  edgeMat: MeshBasicMaterial;
}

const thinRing = new RingGeometry(0.97, 1, 64);
thinRing.rotateX(-Math.PI / 2);

export function makeDecal(shape: 'circle' | 'line', color: string, thin = false): Decal {
  const root = new Group();
  const fillMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false });
  const edgeMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
  let fill: Mesh, edge: Mesh;
  if (shape === 'circle') {
    fill = new Mesh(discGeo, fillMat);
    edge = new Mesh(thin ? thinRing : ringGeo, edgeMat);
  } else {
    fill = new Mesh(planeGeo, fillMat);
    edge = new Mesh(planeGeo, edgeMat);
    edgeMat.opacity = 0.25;
  }
  fill.position.y = 0.08;
  edge.position.y = 0.07;
  root.add(edge, fill);
  return { root, fill, edge, fillMat, edgeMat };
}

export function toLinear(hex: string): Color {
  return new Color(hex);
}
