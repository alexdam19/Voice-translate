# IRONCRAWL design notes

## Pillars

1. **Easy to get into.** The first minutes ask for three things: drive with WASD, watch your guns fire on their own, drag a card onto the battlefield. Everything else switches on one feature at a time as your commander levels up (menu buttons appear when their feature unlocks), and a one-step-at-a-time goal box says what to try next.
2. **Your base is a facility, not a vehicle.** One deck cell is one world unit, so the starting fortress is 12 units wide and the biggest is 22 wide and 32 long. It rolls over rubble instead of steering around it. Inside, it's run like a Clash of Clans village: a shop, builders, timed upgrades, and a Command Center that caps everything.
3. **Two kinds of progress, earned two ways.**
   - Things you **find**: materials, weapons, crew and card packs come from combat, harvesting and scavenging.
   - Things you **earn**: commander XP comes only from fighting. It's the only source of the Level Road's unlocks and its per-level hull and damage bonus.
4. **Cards are the verbs.** Instead of cooldown abilities on a dozen keys, you hold 4 cards and spend energy. Cards can be found, collected, leveled with duplicates and built into a deck, so they're also a collection game.
5. **Always know what to do next.** Tap TRACK on anything you can't afford. The tracker shows what's missing and points (marker, beam, edge arrow) at the nearest place to get the first missing thing, recursing through refinery recipes to the raw ore.
6. **Distance is difficulty.** Threat rises from the camp outward, and every zone asks for gear before it's comfortable.
7. **Losing is cheap in the open world.** Your fortress comes back at full health. The Dead Zone is where losses are real.

## Loops

- **Minute to minute:** drive, play cards as energy allows, grab drops, park on nodes.
- **Session:** clear a loot area, take a rune, crack an outpost, open packs, start upgrades, drag squads onto spots worth holding.
- **Long term:** climb the Level Road to 30, grow the Command Center to level 6, level your cards, collect relics, fill the fortress, and take it into the Dead Zone.

## The fortress

- `Tank.cell` is world units per deck cell: 1 for your fortress and remote players, 0.75 for outposts, 0.6 for raiders and 0.5 for the Outrider. Hull size, turn rate, module positions and the model scale all read it.
- **Chassis follow the Command Center.** CC levels 1-6 map to Crawler Facility (10×14), Assault Facility (12×17), Siege Citadel (14×20), Land Dreadnought (16×23), Colossus (18×27) and Moving Citadel (20×31). When a CC upgrade finishes, `setChassis` grows the deck and centres the existing layout.
- **Crushing.** The player's nav modes are `crush`, `crushMagma` and `crushHover`, where only cliffs, pillars, map edges and the wrong liquids block. `crushUnder` clears crushable obstacle tiles and marks props under the hull as `gone`. It runs every frame while moving and four times a second while parked (after a tow, a Blink card or a load). Each change marks its terrain chunk dirty, and the view rebuilds that chunk in the same frame. The non-crush clearance caches (used by enemy tanks) are invalidated at most every 3 s.
- **Death:** the fortress is towed to camp after 6 s and comes back at full hull and shields, with at least half energy.
- **Camera:** it always follows the fortress. Distance is `20 + 2.4 × hull length` (times the wheel zoom), and enemy spawn distances add half the hull length so fights start at the same distance from its edge.

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

## Rendering

- Low-resolution render target (1/2–1/4 of the screen) → post pass (1-pixel depth outlines, 4×4 Bayer dithering, posterize) → nearest-neighbour upscale.
- The camera has a yaw and a pitch, for the base view. The shadow camera's extent follows the zoom.
- Terrain is chunked (32×32 tiles), built lazily around the camera, and rebuilt in place when crushed.
- Tanks are voxel meshes regenerated when the layout changes, scaled by `cell`. Unbuilt buildings render as scaffolds.
- Card art is generated per card: a school-coloured sky and a pixel motif.

## Roadmap

- Card synergies (school bonuses for a deck built around one or two colours) and a draft mode.
- Defending the base: raids that target your fortress while you're in the base view, and walls and gates as buildings.
- Day/night, music, gamepad support and key rebinding.
- Dead Zone matchmaking and leaderboards.
