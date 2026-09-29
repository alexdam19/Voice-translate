#!/usr/bin/env node
/**
 * Imports sprites from OpenHV (https://github.com/OpenHV/OpenHV), the open-content remake of Daniel Cook's
 * Hard Vacuum, into src/assets/ohv/ for the game to use.
 *
 *   node tools/import-openhv.mjs [path/to/OpenHV]      (default: ../OpenHV)
 *
 * OpenHV sprites are 8-bit palette PNGs sharing one palette: index 255 is the transparent key, index 0 is a
 * half-transparent shadow, and indices 48-63 are the green "team colour" ramp that OpenRA remaps per player.
 * Each sprite becomes an RGBA PNG where the key is transparent, the shadow keeps its alpha, and team-colour
 * pixels are marked for the game to recolour: alpha 254 with the ramp level (0-15) in red (level * 16 + 8).
 * Frame sizes, frame counts, facings and animation sequences go into manifest.json, and every file's author and
 * licence (CC BY 3.0 US for the Hard Vacuum art, CC BY-SA 4.0 for the OpenHV team's, CC0) into CREDITS.md.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const ROOT = path.resolve(process.argv[2] ?? path.join(process.cwd(), '..', 'OpenHV'));
const BITS = path.join(ROOT, 'mods/hv/bits/sprites');
const SEQS = path.join(ROOT, 'mods/hv/sequences');
const OUT = path.join(process.cwd(), 'src/assets/ohv');

/** What to bring over: sprite file (under bits/sprites) and the name the game knows it by. */
const PICK = {
  // Creatures.
  beast: 'animals/beast.png', beast_die: 'animals/beast-die.png', bigbird: 'animals/bigbird.png', crow: 'animals/crow.png',
  worm: 'animals/worm.png', seed: 'animals/seed.png', seed_move: 'animals/seed-move.png', seamonster: 'animals/seamonster.png',
  // Infantry.
  rifleman: 'infantry/rifleman.png', rocketeer: 'infantry/rocketeer.png', mortar: 'infantry/mortar.png', flamer: 'infantry/flamer.png',
  sniper: 'infantry/sniper.png', blaster: 'infantry/blaster.png', shocker: 'infantry/shocker.png', technician: 'infantry/technician.png',
  jetpacker: 'infantry/jetpacker.png', pod_death: 'infantry/pod-death.png',
  // Aircraft.
  drone: 'aircraft/drone.png', drone2: 'aircraft/drone2.png', chopper: 'aircraft/chopper.png', copter: 'aircraft/copter.png',
  gunship: 'aircraft/gunship.png', jet: 'aircraft/jet.png', bomber: 'aircraft/bomber.png', banshee: 'aircraft/banshee.png',
  dropship: 'aircraft/dropship.png', cargoship: 'aircraft/cargoship.png', mothership: 'aircraft/mothership.png', saucer: 'aircraft/saucer.png',
  balloon: 'aircraft/balloon.png', turtle: 'aircraft/turtle.png',
  // Vehicles.
  buggy: 'vehicles/buggy.png', bike: 'vehicles/bike.png', apc: 'vehicles/apc.png', mbt: 'vehicles/mbt.png', mbt2: 'vehicles/mbt2.png',
  merctank: 'vehicles/merctank.png', dualmerctank: 'vehicles/dualmerctank.png', missiletank: 'vehicles/missiletank.png',
  railguntank: 'vehicles/railguntank.png', lightningtank: 'vehicles/lightningtank.png', artillery: 'vehicles/artillery.png',
  aatank: 'vehicles/aatank.png', tank4: 'vehicles/tank4.png', tank9: 'vehicles/tank9.png', tank14: 'vehicles/tank14.png',
  firetruck: 'vehicles/firetruck.png', tanker: 'vehicles/tanker.png', miner: 'vehicles/miner.png', repairtank: 'vehicles/repairtank.png',
  // Effects.
  explobig: 'effects/explobig.png', explobig2: 'effects/explobig2.png', explobig3: 'effects/explobig3.png', explosn: 'effects/explosn.png',
  explosn2: 'effects/explosn2.png', explosn3: 'effects/explosn3.png', exploplasma: 'effects/exploplasma.png', smoke: 'effects/smoke.png',
  large_smoke: 'effects/large_smoke.png', small_smoke: 'effects/small_smoke.png', muzzle: 'effects/muzzle.png', muzzle2: 'effects/muzzle2.png',
  sparks1: 'effects/sparks1.png', pixelsparks: 'effects/pixelsparks.png', debris1: 'effects/debris1.png', debris2: 'effects/debris2.png',
  blood1: 'effects/blood1.png',
};

/* ---------------- PNG in ---------------- */

function readPng(file) {
  const d = fs.readFileSync(file);
  let i = 8, w = 0, h = 0, depth = 0, type = 0, plte = null, trns = null;
  const idat = [];
  while (i < d.length) {
    const n = d.readUInt32BE(i), t = d.toString('latin1', i + 4, i + 8), c = d.subarray(i + 8, i + 8 + n);
    if (t === 'IHDR') { w = c.readUInt32BE(0); h = c.readUInt32BE(4); depth = c[8]; type = c[9]; if (c[12]) throw new Error(`${file}: interlaced`); }
    else if (t === 'PLTE') plte = c;
    else if (t === 'tRNS') trns = c;
    else if (t === 'IDAT') idat.push(c);
    i += 12 + n;
  }
  if (type !== 3 || depth !== 8) throw new Error(`${file}: not an 8-bit palette PNG (type ${type}, depth ${depth})`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h);
  let prev = Buffer.alloc(w);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (w + 1)], line = raw.subarray(y * (w + 1) + 1, (y + 1) * (w + 1));
    const cur = Buffer.alloc(w);
    for (let x = 0; x < w; x++) {
      const a = x ? cur[x - 1] : 0, b = prev[x], c = x ? prev[x - 1] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    cur.copy(px, y * w);
    prev = cur;
  }
  return { w, h, px, plte, trns };
}

/* ---------------- PNG out ---------------- */

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writeRgba(file, w, h, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

/* ---------------- metadata ---------------- */

/** OpenHV's per-file yaml: FrameSize, FrameAmount, Author, License. */
function readMeta(pngFile) {
  const f = pngFile.replace(/\.png$/, '.yaml');
  const m = {};
  if (!fs.existsSync(f)) return m;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const [k, ...v] = line.split(':');
    if (k && v.length) m[k.trim()] = v.join(':').trim();
  }
  return m;
}

/** Every animation sequence that uses a file: { actor.seq: { start, length, facings, tick, frames } }. */
function sequencesFor(file) {
  const base = path.basename(file);
  const out = {};
  for (const sf of fs.readdirSync(SEQS)) {
    const lines = fs.readFileSync(path.join(SEQS, sf), 'utf8').split('\n');
    let actor = '', seq = '', cur = null;
    const flush = () => { if (cur && cur.Filename === base) out[`${actor}.${seq}`] = { start: +(cur.Start ?? 0), length: cur.Length === '*' ? '*' : +(cur.Length ?? 1), facings: +(cur.Facings ?? 1), tick: +(cur.Tick ?? 40), frames: cur.Frames ? cur.Frames.split(',').map((s) => +s) : undefined }; };
    for (const line of lines) {
      if (/^\S[^:]*:\s*$/.test(line)) { flush(); cur = null; actor = line.replace(':', '').trim(); continue; }
      const m2 = /^\t(\S[^:]*):\s*$/.exec(line);
      if (m2) { flush(); seq = m2[1]; cur = {}; continue; }
      const m3 = /^\t\t(\w+):\s*(.*)$/.exec(line);
      if (m3 && cur) cur[m3[1]] = m3[2].trim();
    }
    flush();
  }
  return out;
}

/* ---------------- run ---------------- */

fs.mkdirSync(OUT, { recursive: true });
const manifest = {};
const credits = [];
for (const [name, rel] of Object.entries(PICK)) {
  const file = path.join(BITS, rel);
  if (!fs.existsSync(file)) { console.warn('missing', rel); continue; }
  const { w, h, px, plte } = readPng(file);
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = px[i], q = i * 4;
    if (v === 255) continue;
    if (v === 0) { rgba[q + 3] = 140; continue; }
    if (v >= 48 && v <= 63) { rgba[q] = (v - 48) * 16 + 8; rgba[q + 3] = 254; continue; }
    rgba[q] = plte[v * 3]; rgba[q + 1] = plte[v * 3 + 1]; rgba[q + 2] = plte[v * 3 + 2]; rgba[q + 3] = 255;
  }
  writeRgba(path.join(OUT, `${name}.png`), w, h, rgba);
  const meta = readMeta(file);
  const [fw, fh] = (meta.FrameSize ?? `${w},${h}`).split(',').map(Number);
  manifest[name] = { w, h, fw, fh, frames: +(meta.FrameAmount ?? 1), cols: Math.floor(w / fw), seq: sequencesFor(file) };
  credits.push(`| ${name}.png | ${rel} | ${meta.Author ?? 'OpenHV contributors'} | ${meta.License ?? 'see OpenHV'} |`);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(OUT, 'CREDITS.md'), `# Sprites from OpenHV

These sprites come from [OpenHV](https://github.com/OpenHV/OpenHV), an open-content game built on Daniel Cook's
[Hard Vacuum](https://lostgarden.home.blog/2005/03/27/game-post-mortem-hard-vacuum/) art. They were converted from
8-bit palette PNGs to RGBA by \`tools/import-openhv.mjs\` (transparency applied, team-colour pixels marked for
recolouring). Hard Vacuum art by Daniel Cook is under the Lost Garden License,
[CC BY 3.0 US](https://creativecommons.org/licenses/by/3.0/us/); art by the OpenHV team is
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (these converted files are shared under the same
licence); trivial pieces are [CC0](https://creativecommons.org/publicdomain/zero/1.0/).

| File | OpenHV source (mods/hv/bits/sprites/) | Author | Licence |
|---|---|---|---|
${credits.join('\n')}
`);
console.log(`imported ${Object.keys(manifest).length} sprites into ${path.relative(process.cwd(), OUT)}`);
