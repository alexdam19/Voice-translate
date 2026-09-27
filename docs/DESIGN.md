# IRONCRAWL design notes

## Pillars

1. **Easy to get into.** The first minutes ask for three things: drive with WASD, watch your guns fire on their own, drag a card onto the battlefield. Everything else switches on one feature at a time as your commander levels up (menu buttons appear when their feature unlocks), and a one-step-at-a-time goal box says what to try next.
2. **Your base is a facility, not a vehicle.** A land cruiser in the spirit of the P1000 Ratte, styled like the Tumbler Batmobile. One deck cell is one world unit, so the starting fortress is 14 units wide and 23 long and the biggest is 24 wide and 40 long. Nothing stops it: it rolls over rubble, climbs cliffs and wades through lava. Inside, it's run like a Clash of Clans village: a shop, builders, timed upgrades, and a Command Center that caps everything.
3. **Two kinds of progress, earned two ways.**
   - Things you **find**: materials, weapons, crew and card packs come from combat, harvesting and scavenging.
   - Things you **earn**: commander XP comes only from fighting. It's the only source of the Level Road's unlocks and its per-level hull and damage bonus.
4. **Cards are the verbs.** Instead of cooldown abilities on a dozen keys, you hold 4 cards and spend energy. Cards can be found, collected, leveled with duplicates and built into a deck, so they're also a collection game.
5. **Always know what to do next.** Tap TRACK on anything you can't afford. The tracker shows what's missing and points (marker, beam, edge arrow) at the nearest place to get the first missing thing, recursing through refinery recipes to the raw ore.
6. **Distance is difficulty.** Threat rises from the camp outward, and every zone asks for gear before it's comfortable.
7. **Losing is cheap in the open world.** Your fortress comes back at full health. The Dead Zone is where losses are real.
8. **Swarms, not skirmishes.** Hordes of hundreds come in waves and climb the hull; rival fortresses as strong as yours hunt you. The answers are movement, turrets on every side and the right buildings, and the blueprint says where you're weak.

## Loops

- **Minute to minute:** drive, play cards as energy allows, grab drops, park on nodes.
- **Session:** clear a loot area, take a rune, crack an outpost, open packs, start upgrades, drag squads onto spots worth holding.
- **Long term:** climb the Level Road to 30, grow the Command Center to level 6, level your cards, collect relics, fill the fortress, and take it into the Dead Zone.

## The fortress

- `Tank.cell` is world units per deck cell: 1 for your fortress and remote players, 0.75 for outposts, 0.6 for raiders and 0.5 for the Outrider. Hull size, turn rate, module positions and the model scale all read it.
- **Chassis follow the Command Center.** CC levels 1-6 map to Landkreuzer (12×20), Assault Landkreuzer (14×23), Siege Citadel (16×26), Land Dreadnought (18×29), Colossus (20×33) and Moving Citadel (22×37). When a CC upgrade finishes, `setChassis` grows the deck and centres the existing layout, then `Game.syncHull` places the built-in weapons.
- **Built-in weapons.** `fixedSpots(cc, cols, rows)` lists them: a 2×2 **Weapon Pad** on every corner and a 4×4 **Main Battery** at the front centre, then side pads at CC 2, 5 and 6 and a rear battery at CC 4. They're `fixed` modules: never bought, moved or removed. `Tank.ensureFixed` stamps them first and moves anything in their way to the nearest free spot (buildings that fit nowhere go back to the hold with half their cost). New mounts arrive armed (autocannons on pads, the 88mm on batteries). Pads take light or medium weapons (`mounts`), batteries heavy ones.
- **Save migration.** Hulls grew in v0.7. `TankSave` now records `cols`/`rows`; older saves use `LEGACY_DIMS` to centre their layout on the new deck, then `syncHull` adds and arms the pads and battery.
- **The model.** Fortress-class hulls (yours, rivals, other players) get the land-cruiser body: three tracks a side under stepped armored skirts with running lights, a sloped wedge nose with a chin plow and a visor light, a lit rim around the deck, and a tail with two swept fins, red tail lights and an afterburner block whose nozzles throw flame particles when moving. The main battery is a faceted turret with twin long barrels and muzzle brakes. The hull is 2.8 units longer than the deck to cover nose and tail.
- **Crushing.** The player's nav modes are `crush`, `crushMagma` and `crushHover`, where only cliffs, pillars, map edges and the wrong liquids block. `crushUnder` clears crushable obstacle tiles and marks props under the hull as `gone`. It runs every frame while moving and four times a second while parked (after a tow, a Blink card or a load). Each change marks its terrain chunk dirty, and the view rebuilds that chunk in the same frame. The non-crush clearance caches (used by enemy tanks) are invalidated at most every 3 s.
- **Death:** the fortress is towed to camp after 6 s and comes back at full hull and shields, with at least half energy.
- **Camera:** it always follows the fortress. Distance is `18 + 2.1 × hull length` (times the wheel or pinch zoom), and enemy spawn distances add half the hull length so fights start at the same distance from its edge.

## Going anywhere

- `GameMap.blocked` returns false for the crush nav modes (fortress-class hulls), so nothing but the map edge stops them. A* (`findPath` with `climb`) still prefers good ground: tiles cost `1 / traction`, cliffs and pillars cost 3× and rubble 1.15×.
- `traction()` for crush hulls turns "impassable" into 0.35 (wading) and halves speed on cliffs and pillars (climbing). Lava hurts 2% max hull a second without Magma Treads or Hover Skirts, acid 1.4% without Hover Skirts.
- **Drive trains** (`systems/drives.ts`): owned once unlocked on the Level Road (Dune Tracks 3, Spiked Chains 5, Magma Treads 8, Hover Skirts 12) or crafted, and swapping is free. `driveScore` samples the ground under and ahead of the hull; with AUTO on, every half second it swaps to an owned drive that scores 12% better (with a 3 s cooldown). Picking one by hand turns AUTO off. The HUD drive chip opens the picker.

## Hordes

- **The director** (`systems/waves.ts`): calm (100 s the first time, then `max(38, 75 − 2.5n)` s), an 8 s warning with the direction (toast, alarm, HUD bar, red edge arrows), then a surge that spawns the wave over about 15 s along a ±0.55 rad front 42–56 units beyond the hull. Size is `(50 + 18n) × (0.7 + 0.22 × threat)`, ×0.75 in camp. Live horde units are capped at 340 (220 on touch devices). Mostly swarmers; leapers from wave 2, bombers from wave 4, a sprinkling of zone enemies and ~n% elites. Later waves get +6% hp per wave and faster swarmers. The wave ends when only 6% are left: stragglers scatter, and you get `20 + 8n` XP, `15 + 6n` scrap and a card pack every third wave. If the fortress dies, the horde disperses.
- **Swarm AI:** swarmers sprint straight at the nearest point of the hull, over anything, with grid-based separation. Pressed against a hull they claw for a grip (8% damage) and climb aboard at 1.4/s while there's room (`latchCap` = hull area / 14). Aboard, they stand on the deck (`latch` holds tank-local coordinates), crawl inward and chew for 80% of their damage per second. Driving above 55% top speed (or on Nitro) flings them off, stunned and hurt. Leapers jump the last few metres onto the deck.
- **Counters:** turrets target climbers like any enemy (splash never hurts your own hull), **Tesla Coils** arc into the 2 + level nearest climbers or crowding creatures about once a second, and moving at speed crushes the ones in front and sheds the ones aboard.
- **Performance:** `Game.indexEnemies` rebuilds an id map and a uniform grid (`EnemyGrid`) each step; separation, projectile hits and blasts query nearby cells (`enemiesNear`, plus titans whose parts reach far). The player's target list is built once per step. Horde deaths skip explosions, loot rolls and damage numbers. A wave-12 horde of 330 runs at about 0.2 ms per step.

## Rivals

- From commander level 6 (the Level Road lists it), every 200–290 s a **rival dreadnought** spawns out of sight if none is alive: an enemy `Tank` of kind `rival` built by `buildRival` at your Command Center level, with your hull class, built-in pads and battery, weapons from the families you've unlocked at about your average stars, and engines, reactors, armor, a repair bay and a shield to match. Its guns fire at `0.34 + 0.016 × level` of base damage (yours get the Level Road, crew and forge), and its hull is scaled to `0.62 + 0.012 × level`, so a same-level duel ends with both sides hurt.
- Rivals hunt you within 260 units, close in to the median range of their guns and circle. They show on the minimap with a pulsing ring and on the top bar within 110 units. The prize: an Epic pack (Legendary from level 20), 3 + level/4 Salvaged Tech, raider loot and their best gun.

## Blueprint

`N`, the base view's top bar or the ☰ menu. A canvas technical drawing (top view, front up, with the triple tracks, nose, tail, deck cells and every building; hardpoints show their ring and barrel; tap one for details) and a side profile. `game/analysis.ts` computes each weapon's sustained DPS, a **coverage rose** (DPS that reaches a target 8 units off the hull in each of 8 directions, from each mount's actual position and range), a combat rating (`sqrt(DPS × effective hp) / 4`) and an assessment: power deficit, empty mounts, a weak side, no Tesla Coils, no shield, too slow to shake off climbers, unprotected hazards, a better drive train for this ground, unused deck. The panel also charts top speed on each ground with the current drive.

## The base view (village)

- `App.village` swings the camera to `1.95 × length + 10`, pitches it to 64° and turns it so the fortress's front points up the screen (`cam.yaw = tank.rot`). The world keeps running and the fortress parks. WASD leaves the base view and drives.
- Picking casts the pointer onto the plane at deck height and converts it to tank-local cell coordinates. The overlay canvas draws the grid, levels, builder progress, hover and selection, and the green/red placement ghost.
- **Build jobs** are `{ modId, kind: build | upgrade, to, t, total, cost }`, one per builder. New buildings exist from the moment they're placed (`built: false` until done) so the space is reserved; unbuilt modules don't count toward stats and render as scaffolding. Upgrades keep the building working.
- **Limits.** `buildLimit(def, cc)` gives counts per CC level. A building's level can't pass the CC's level, and the CC's own upgrades need commander levels `[1, 3, 7, 12, 18, 24]`. Costs scale by `[1, 1.5, 3, 5, 8, 12]` per level and add Salvaged Tech from level 3. Times are `[12, 40, 90, 180, 300]` s (1.6× for the CC). New buildings take `4 + 0.8 × area` seconds.

## Commander XP and the Level Road

- `xpToNext(L) = round(40 · L^1.5)`, up to level 30.
- **XP sources** (the crew get the same XP):

  | Source | XP |
  |---|---|
  | A kill | `enemy xp × (0.8 + 0.2 × threat)` (titans ~400) |
  | Loot area | `25 + 10 × threat` |
  | Rune | `50 + 15 × threat` |
  | Raider tank | `40 + 15 × threat` |
  | Outpost | `100 + 35 × threat` |
  | Harvesting | 0.3 per tick |

  The Scholar card and Scholar's Tome relic multiply it. The Dead Zone gives no commander XP.
- **Each level:** +3% hull and +2% weapon damage (cumulative), a full repair and a card pack.
- **Unlocks.** The old research tree's non-free nodes are sorted by tier and spread over levels 2-30 (`techLevel`), and they're granted automatically. Buildings carry their own `unlock` level. Features:

  | Level | Feature |
  |---|---|
  | 1 | Battle Cards |
  | 2 | Card Collection, Crew |
  | 3 | Squads |
  | 4 | Arsenal |
  | 6 | Relics |
  | 8 | The Dead Zone |
  | 12 | Outrider |

  Relic slots arrive at 6, 14 and 22, and extra builders at 10 and 20.

## Cards

- `CardDef` is `{ id, school, type (spell, summon, enchant, relic), cost, rarity, target (area or self), radius, text, flavor }`. Numbers in `{braces}` in the text scale with power.
- **Power** is `levelPower(level) × (1 + crew card power + Card Lab)`, with `levelPower = 1 + 0.1 × (level − 1)` and levels 1-10. Count-based effects (marines, bolts, meteors) are capped at 1.6-1.8× so high levels don't flood the screen.
- **Energy:** 10 max (+ relics), regenerating at `1/2.6` per second × (1 + crew + relics + 2 × Card Lab + Azure rune). Mana Crystal takes 1 off every cost, down to 1.
- **The cycle** (Clash Royale): the deck is shuffled into 4 in hand and 4 in a queue. A played card goes to the back and the front of the queue replaces it. `resetHand` reshuffles when the deck changes.
- **Levelling.** Copies from packs become shards. Levelling needs `ceil(level × [4, 3, 2, 2, 1, 1][rarity])` copies and some scrap (Salvaged Tech from level 4).
- **Packs:** Card Pack (3 cards), Rare (4, one Rare+), Epic (5, one Epic+) and Legendary (6, one Legendary+). Each slot has an 18% chance to roll from the relic pool. Picked-up packs go to a stash (a pulsing button above the hand) rather than interrupting the fight.

  | Source | Pack |
  |---|---|
  | Elites | 45% chance of a pack |
  | Rune guardians | 50% chance of a Rare pack |
  | Ordinary enemies | 1.2% chance |
  | Raider tanks | Always (Rare at higher threat) |
  | Outposts | Rare, or Epic at threat 5+ |
  | Runes | A Rare pack |
  | Titans | Epic, or Legendary at threat 6+ |
  | Loot areas | 35% chance |
  | Every commander level | One (see the Level Road) |

- **Crew bring their card.** Every recruit adds a copy of their role's card, and champions add their signature card.

## Squads

- Army buildings map to squad types, and the building's level sets the unit count (`sizes`) and stats (`levelMult`). Units are `Ally` entities with `life: Infinity` and a `squad` tag. A missing unit is replaced every `respawn / size` seconds, rolling out of the back of the fortress.
- **Anchors** decide where a unit wants to be and how far it will chase:

  | Order | Anchor | Engages within |
  |---|---|---|
  | Follow | A formation slot behind the hull | 18 of the fortress edge |
  | Guard | A spiral slot around the dropped point | 16 of the point |
  | Scavenge | The current target (from the squad state machine) | Its own range, while going or returning |

  Units far from their anchor move at double speed and hop over rubble.
- **Scavenging** (marines and buggies) is a state machine: pick the nearest loot drop within 70 (preferred) or a node the drill can handle, go, collect or drill (`carryCap = 10 + 6 × level`, 1.5× for buggies), return to the fortress, unload into the hold, repeat. Squads avoid targets another squad has claimed.

## Tracking

`Game.tracked` is a building to build, a building to upgrade or a card to level. `trackInfo` computes the needs (have/need per material, plus card copies), any blocker, a hint and a target:

- A missing refined material recurses through `recipeFor` to its raw input. If you already have the input, it points to your Refinery.
- Raw materials point to the nearest live node of the right type (noting a missing drill tier), then to loot areas whose tables carry it.
- Salvaged Tech and Mythic Essence point to the nearest standing outpost.
- Level-locked goals point to the nearest ready loot area, since XP is what's missing.

The view shows a beacon beam at the target, and the overlay adds a bobbing marker or an arrow at the screen edge. Clicking a ready tracker opens the base with the building selected.

## Movement and combat

- Tanks are capsules: a chain of circles along the hull, resolved against the tile grid. A* runs over per-nav-mode clearance fields (a 3-4 chamfer distance transform), and paths are string-pulled.
- Turrets track at their own traverse speed, keep targets briefly, prefer the focus target, lead moving enemies and check line of sight (artillery ignores it). All weapons auto-aim.
- Damage goes barrier → shield → armor → hull. Titan Bane and Hunter's Mark boost damage to titans and elites. Ticking damage (hazards, burning ground) doesn't flash the hull. Phoenix Feather turns a lethal hit into 30% hull once every 3 minutes.

## Arsenal

- **WeaponItem** is `{ uid, key, rarity (0-5 = 1★-6★), affixes, tree }`. Final stats are `base × rarity mult (1 → 2.25) × affixes × tree × Level Road family mods × crew × commander level bonus`.
- **Trees:** 3 branches × 3 tiers, one point per star. Tier-3 capstones are family `Special`s carried on each shot's `ShotFx`.
- **Forge:** one job at a time, 20 / 45 / 90 / 180 / 360 s. 4★, 5★ and 6★ need their Level Road nodes.

## Crew

- Each crew member has a role, rarity, level (1-10), perks and a location (fortress, Outrider, or walking back). Role passives, perks and exclusive traits sum into `CrewBonus`, which also carries the card, energy, XP and relic stats that `applyCrew` folds in.
- The 15-crew cap comes from bunks. Reaching 15 unlocks the Outrider (from commander level 12 in the HUD).

## Dead Zone networking

- JSON over one WebSocket (`/ws`), 10 Hz snapshots. `WarzoneServer` is transport-free: Node wires it to `ws`, and the browser runs it directly for offline raids.
- The server owns health, shields, deaths, wreck drops, crates, supply drops, extraction timing and bot AI. It caps each hit at the weapon's maximum, keeps a per-attacker damage budget, caps heals, and speed-limits movement. Player fortress sizes use one unit per cell, and bot fortresses crush rubble too.
- Your card deck, relics and energy come with you. Commander XP doesn't accrue there.

## Touch and small screens

- **Input** (`game/input.ts`) keeps the mouse on mouse events and handles touch and pen with pointer events on the battlefield canvas. A touch that lifts within 450 ms and 14 px is a **tap** (`mouse.tap`). A finger held longer or moved further is a **drag** (`mouse.drag`). Two fingers pinch into `mouse.wheel`. The first touch anywhere adds `touch` to `<html>`, and a coarse-pointer device starts that way.
- **Taps** reuse the mouse code. In the base view, with a card armed, or on your own hull, a tap is a left click; anywhere else it's the right click (move, attack, drill, interact). A drag on the ground re-orders a move toward the finger every 0.25 s, like holding the right button. Picking radii grow 1.7× for fingers. Touch has no hover, so the info line shows for 2.5 s after a tap, and tooltips are off.
- **The stick** (`ui/joystick.ts`) is a floating stick in the bottom-left corner that feeds `driveInput` like WASD. Deflection past a small dead zone scales the throttle (`manualDrive` multiplies by the input's magnitude, so keys stay at full speed). It hides in the base view and behind panels.
- **HUD drags** (cards, squad badges) use pointer events with pointer capture, so the same code serves mouse and fingers. On touch, the dragged card floats above the finger so the landing ring stays visible.
- **Base view placement** is two taps on touch: the first previews the ghost at that cell (`VillageUI.pending`), and the second tap inside it, or **PLACE**, builds. While placing, the hint strip takes the building card's place at the bottom, so the whole deck stays tappable.
- **Layout:** one compact breakpoint (`max-width: 900px` or `max-height: 560px`) shrinks the HUD, puts the hull bar over the hand, moves Cargo, Map and Help into the ☰ menu, and makes panels full-screen. Extra rules cover landscape phones (under 460 px tall) and portrait phones. Portrait stacks the menu buttons and materials down the right edge, and the camera pulls back by `clamp(√(1.3 / aspect), 1, 1.7)` so a tall, narrow screen still shows the fortress's surroundings. Safe-area insets keep controls clear of notches.
- **Rendering on phones:** about 300 rendered lines on the short side, with each game pixel a whole number of device pixels, and a 1024² shadow map instead of 2048².

## Rendering

- Low-resolution render target (1/2–1/4 of the screen) → post pass (1-pixel depth outlines, 4×4 Bayer dithering, posterize) → nearest-neighbour upscale.
- The camera has a yaw and a pitch, for the base view. The shadow camera's extent follows the zoom.
- Terrain is chunked (32×32 tiles), built lazily around the camera, and rebuilt in place when crushed.
- Tanks are voxel meshes regenerated when the layout changes, scaled by `cell`. Unbuilt buildings render as scaffolds.
- Creatures (everything but titans) are one batched `Points` draw from a sprite atlas (frames, hit-flash and elite variants drawn on first use; facing flips in the shader; anchored at the feet by a view-space offset), plus one batch of blob shadows. Squads still use individual sprites.
- Card art is generated per card: a school-coloured sky and a pixel motif.

## Roadmap

- Card synergies (school bonuses for a deck built around one or two colours) and a draft mode.
- Horde variety: armored brutes that pry plates off, spitters that stay back, and a boss that leads every tenth wave.
- Walls and gates as buildings.
- Day/night, music, gamepad support and key rebinding.
- Dead Zone matchmaking and leaderboards.
