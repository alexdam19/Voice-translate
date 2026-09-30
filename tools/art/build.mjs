#!/usr/bin/env node
/**
 * Paints the game's pixel-art atlases with LibreSprite.
 *
 *   LIBRESPRITE=/path/to/libresprite node tools/art/build.mjs [atlas...]
 *
 * For every art/scripts/<atlas>.js it runs LibreSprite headless (batch mode) with art/lib/paint.js + the script:
 * first to lay the atlas out, then, on indexed templates of the right size carrying the AAP-64 palette, to paint
 * it. LibreSprite saves the editable source to art/<atlas>@<scale>.ase and the sheet to src/assets/px/; the sprite
 * rectangles go to src/assets/px/<atlas>.json. See art/README.md.
 */
import { spawnSync } from 'node:child_process';
import { deflateSync, crc32 } from 'node:zlib';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ART = join(ROOT, 'art');
const OUT = join(ROOT, 'src/assets/px');
const BIN = process.env.LIBRESPRITE || 'libresprite';

/** AAP-64 from the .gpl, behind a transparent index 0. */
function palette() {
  const cols = [[0, 0, 0]];
  for (const ln of readFileSync(join(ART, 'palettes/aap-64.gpl'), 'utf8').split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)/.exec(ln);
    if (m) cols.push([+m[1], +m[2], +m[3]]);
  }
  if (cols.length !== 65) throw new Error(`expected 64 colours, got ${cols.length - 1}`);
  return cols;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

/** An empty indexed PNG with the palette (index 0 transparent): LibreSprite opens it as an indexed sprite. */
function template(path, w, h, pal) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const raw = Buffer.alloc((w + 1) * h);
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(pal.flat())),
    chunk('tRNS', Buffer.from([0])),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

function run(script, cfg, tmp, tag) {
  const file = join(tmp, `${tag}.js`);
  writeFileSync(file, `var CFG = ${JSON.stringify(cfg)};\n${readFileSync(join(ART, 'lib/paint.js'), 'utf8')}\n${script}`);
  const r = spawnSync(BIN, ['-b', '--script', file], {
    encoding: 'utf8',
    env: { ...process.env, SDL_VIDEODRIVER: 'dummy' },
    maxBuffer: 64 << 20,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.error) throw r.error;
  if (r.status !== 0 || /\bError:/.test(out)) throw new Error(`LibreSprite failed (${tag}, exit ${r.status}):\n${out}`);
  return out;
}

const pal = palette();
const want = process.argv.slice(2);
const scripts = readdirSync(join(ART, 'scripts')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).filter((n) => !want.length || want.includes(n));
const tmp = mkdtempSync(join(tmpdir(), 'art-'));
mkdirSync(OUT, { recursive: true });
for (const name of scripts) {
  const src = readFileSync(join(ART, 'scripts', `${name}.js`), 'utf8');
  const t0 = Date.now();
  const layout = run(src, { mode: 'layout' }, tmp, `${name}-layout`);
  const cfg = { mode: 'paint', templates: {}, ase: {}, png: {} };
  for (const m of layout.matchAll(/^@@LAYOUT (.*)$/gm)) {
    const { key, w, h } = JSON.parse(m[1]);
    cfg.templates[key] = join(tmp, `${key}.png`);
    template(cfg.templates[key], w, h, pal);
    cfg.ase[key] = join(ART, `${key}.ase`);
    cfg.png[key] = join(OUT, `${key}.png`);
  }
  const out = run(src, cfg, tmp, name);
  const meta = /^@@META (.*)$/m.exec(out);
  if (!meta) throw new Error(`no atlas data from ${name}:\n${out}`);
  writeFileSync(join(OUT, `${name}.json`), `${JSON.stringify(JSON.parse(meta[1]))}\n`);
  for (const ln of out.split('\n')) if (ln.startsWith('saved ')) console.log(`  ${ln}`);
  console.log(`${name}: ${Date.now() - t0} ms`);
}
