# Art sources (LibreSprite)

The world's props, tree crowns, boulders and ground details are painted with
[LibreSprite](https://github.com/LibreSprite/LibreSprite) 1.1, driven headless by scripts.

```
art/
  palettes/aap-64.gpl   the palette (Adigun A. Polack's AAP-64, from LibreSprite's palette folder)
  lib/paint.js          the brushes: ramps, lit shapes in a 3/4 view, dithering, rim light, outlines, atlas packing
  scripts/props.js      props: wrecks, dead trees, bones and skulls, barrels, signs, crates, pipes, spikes,
                        crystals, cacti, mushrooms, antennas, tents (4 designs each, some snowed on)
  scripts/nature.js     tree crowns (oak, birch, autumn, bush, pine, snowy pine) and boulders in four stones
  scripts/ground.js     ground details: tone (t_*) tufts, pebbles, cracks, drifts, ripples, puddles, rubble,
                        oil, scorch; colour (c_*) flowers, embers, glass, weeds, bone chips
  <atlas>@<scale>.ase   what LibreSprite saved: the editable indexed sprites (open in LibreSprite or Aseprite)
```

`tools/art/build.mjs` writes each atlas's sheet to `src/assets/px/<atlas>@<scale>.png` and its sprite rectangles to
`src/assets/px/<atlas>.json` (`[x, y, w, h, anchor x, anchor y, height]` per sprite; the anchor is where the sprite
stands on the ground).

## Painting

Each script describes its sprites in metres: a footprint `w x d` and a height `h`, and a `draw(cv)` that uses the
brushes in `lib/paint.js` (`box`, `obox`, `prism`, `cyl`, `blob`, `rod`, `mesh`, `pyramid`, `poly`, `line`,
`dot`, `light`, `stain`, `each`, `erase`). Shapes are lit by the game's north-west sun and painted into *ramps*
(AAP-64 colours ordered dark to light); each pixel's brightness picks a step of its ramp, with ordered dithering
only between two steps. A rim light and a selective outline (each edge in the darkest colour of its own ramp)
finish each sprite. `runAtlas(name, sprites, [hi, lo])` paints every sprite at two scales (pixels a metre),
packs them and has LibreSprite save the results.

## Building

Build LibreSprite 1.1 once (it needs CMake, Ninja, a C++ compiler and the SDL2, FreeType, libpng, zlib,
libjpeg, giflib, libarchive and pixman dev packages):

```
git clone --branch v1.1 --recursive https://github.com/LibreSprite/LibreSprite
cd LibreSprite && mkdir build && cd build && cmake -G Ninja -DCMAKE_BUILD_TYPE=Release .. && ninja libresprite
```

Then, from this repository:

```
LIBRESPRITE=/path/to/LibreSprite/build/bin/libresprite npm run art          # all atlases
LIBRESPRITE=... node tools/art/build.mjs props                              # just one
```

For each script the runner makes two LibreSprite batch runs (`libresprite -b --script …`): the first lays the
atlas out, the second paints it onto an indexed template of that size carrying the palette (index 0 transparent)
and saves the `.ase` and the `.png`. `tests/art.test.ts` checks the sheets are indexed AAP-64 and that everything
the renderer asks for was painted.

LibreSprite is GPL-2.0; it is only used as a tool, and none of its code, skins or data other than the AAP-64
palette file ship with the game. The sprites are original art made for this game.
