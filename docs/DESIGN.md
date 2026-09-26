# IRONCRAWL design notes

## Pillars

1. **Your base is a tank.** It's one giant unit you command from above, MOBA-style. Its deck is a real grid of facilities: barracks, quarters, reactors, cargo and weapons. It grows from a 7×10 Light Crawler to a 13×21 Colossus.
2. **Upgrades split by what they touch, and every one is a click away.** A switcher inside every panel and red badges show what can be upgraded:

   | Panel | What it covers |
   |---|---|
   | **BASE** (`B`) | Facilities bolted to the tank |
   | **ARSENAL** (`V`) | Weapons: stars, trees, forge |
   | **CREW** (`C`) | People |
   | **RESEARCH** (`T`) | Timed military and personnel trees |
   | **ABILITIES** (`K`) | The loadout |

   Level-up perk cards pop up on the left of the screen, so the mouse alone can run the game.
3. **Two sets of hands.**
   - WASD drives the fortress directly (screen-relative, or tank-style from the menu). Right-click still paths, attacks and interacts, MOBA-style.
   - Officer abilities sit on Q E F G (Z X once researched), arsenal actives on 1-4 and the ultimate on R.
   - Weapons auto-aim by default. Each can be switched to manual: it aims at the cursor, and left mouse fires.
4. **Loot has rarity.**
   - Weapons, perks, recruits and chests roll Common → Legendary. Mythic comes from forging and rare perk rolls.
   - A weapon's rarity is its star level (1★-6★).
   - Deeper zones and luck bonuses shift the odds. This-or-That chests make you choose.
5. **Waiting pays.** The longer something takes to unlock, the stronger it is:
   - Research tiers go from 30 s (tier I) to 8 minutes (tier VI).
   - Forging a 6★ weapon takes 6 minutes.
   - Ultimates need 120-170 s of charge.
   - Veteran perks unlock at crew level 5, master perks at level 8.
6. **Distance is difficulty.** Threat rises from the camp outward. Every zone asks for gear (a drive train or a hazard module) before it's comfortable.
7. **Risk is a choice.** The open world forgives. In the Dead Zone other players take what you drop.

## Loops

- **Minute to minute:** drive, focus fire, time your abilities, harvest nodes, grab drops.
- **Session:** clear a loot area, take a rune, crack an outpost, bring back tech, research, build.
- **Long term:**
  - Grow the hull and the crew to 15.
  - Launch the Outrider.
  - Chase champions and exclusive weapons from rune chests.
  - Take your best tank into the Dead Zone.

## World

- 640×640 tiles, one world unit per tile. Zones are radial:
  - The Rustbelt sits in the middle.
  - Four sectors (Dunes, Cryo, Glass, Magma) are split by angle and warped by noise.
  - The Acid Marsh forms an outer ring.
  - A mountain wall runs around the edge.
- Terrain types carry traction per drive train. Lava and acid are impassable unless the drive handles them. Obstacles are raised voxel columns that block movement, bullets and sight.
- Features:

  | Feature | Count |
  |---|---|
  | Resource nodes (tiered: tier 2 needs a Mk2 drill, xenite needs Mk3) | ~1100 |
  | Loot areas | ~38 |
  | Rune altars with guardian camps | 19 |
  | Outposts | 17 |
  | Dead Zone gate | 1 |

  Roads and a ring road connect the zones, and bridges cross lava rivers.
- `threat = 1 + max(0, r − 18) / 48`, where `r` is the distance from camp. It maps to tiers I–V. Enemy health scales `0.6 + 0.4·threat` and damage scales `0.8 + 0.2·threat`. Elites roll from threat 2.5, and titans spawn from 3.4.

## Movement and combat

- Tanks are capsules: a chain of circles along the hull. They resolve against the tile grid by pushing each circle out and taking the largest correction per axis.
- Paths come from A* over a per-drive **clearance field** (a 3-4 chamfer distance transform). A tank only plans routes at least as wide as itself. Paths are string-pulled into straight runs.
- Steering pivots in place for sharp turns. Speed is `(2.2 + 3.6·min(1.3, thrust·8/mass)) · traction · power`, times research and crew bonuses.
- Each hardpoint turret tracks at its own traverse speed and fires once aligned. Auto weapons keep a target briefly, prefer the focus target, lead moving enemies and check line of sight (artillery ignores it). Point defense shoots down interceptable shells and missiles first.
- Damage goes barrier → shield → armor → hull. A big hit can injure a random crew member, which knocks their passive out. If they're an officer, it also locks their ability. Medics and a medbay heal them faster.

## Arsenal

- **WeaponItem** is `{ uid, key, rarity (0-5 = 1★-6★), affixes, tree }`.
  - Final stats multiply these factors: `base × rarity mult (1 → 2.25) × affixes × tree × research family mods × crew`.
  - Stars also add fire rate: `+35% of the rarity bonus`.
- **Trees.** There are 3 branches × 3 tiers, one point per star.
  - Tier 1-2 nodes are stat bumps. Tier 3 are family capstones (`Special`), carried on each shot's `ShotFx` along with slow, stun, pool, split, pull, execute and volatile.
  - `damageEnemy` applies `preHit` (slow, stun, execute bonus), `postHit` (storm strike, singularity well, napalm, void execute) and `onKill` (chain reaction, volatile). `detonate` handles pools, splits, gravity wells and cluster bomblets.
- **Forge.** One job at a time. Times are 20 / 45 / 90 / 180 / 360 s, and speed is `levelMult(forge level) × (1 + personnel bonus)`.
  - 4★, 5★ and 6★ each need Forge research (Forge Mastery, Legendary Forging, Mythic Forging).
  - A star-up rerolls missing trait slots and keeps existing traits.
- **Special mechanics** are fields on `WeaponDef`:
  - `twin`: the Ray-Rail's second barrel, on its own cooldown.
  - `sky`: telegraphed strikes around the target.
  - `jets`: the turret spawns jet allies, capped per turret.
  - `ramp`: the ray gun's lock-on damage, built while it holds a target.
  - `pool`, `split`, `pull`, `execute`, `knock`, `slow` and `stun`.
- **Actives and ultimates** come from deck modules (`ModuleDef.active` / `.ult`).
  - Actives bind to four slots and scale with module level (+50% per level).
  - One ultimate module is armed. Its charge rises at `1/charge` per second from time. Damage dealt goes into a bank that converts at up to 2× the time rate, so heavy combat charges up to 3× faster.
  - Summons (jets, drones, mechs, dragons, mines) are `Ally` entities with kind-specific AI. Jets and dragons can't be targeted.

## Research

- **Military tree:** 12 branches, tiers 0-VI, ~80 nodes. A node can unlock several items, upgrade a weapon family, or upgrade the hull.
- **Personnel tree:** 6 branches, tiers I-VI. It adds `CrewFx`: seats, ability power, cooldowns, a draft size of 4, forge and research speed, ultimate charge, and survival odds.
- **Jobs.** One job per tree runs at a time, paid up front and refunded on cancel.
  - `TIER_TIME = [0, 30, 60, 120, 210, 330, 480]` seconds at speed 1.
  - Speed is `(0.5 + Σ labs × levelMult) × (1 + personnel) × (1 + scientists × 0.5)`.
- **Module levels** (1-3) multiply a facility's numbers by `1 + 0.5·(lvl − 1)`, and bunks by `+1` per level.

## Crew model

- Each crew member has a role, a rarity, a level (1–10), perks and a location: the fortress, the Outrider, or away (walking back after an Outrider loss).
- **Officers** hold seats 0–5 (Q E F G Z X). Seats 4 and 5 are locked until Personnel research. Ability power scales with rarity, level and research, and cooldowns shrink with level and cooldown-reduction perks.
- **Perks.** Values come in six rarities. Some perks have several stats, and late ones (`minLevel` 5 or 8) are much stronger and show up in 60% of drafts once unlocked.
- `computeCrewBonus` sums the role passives, perks (value by rarity) and exclusive-character effects of everyone fit and aboard. Caps apply: +80% damage, +35% speed, 30% armor, −50% research cost and 45% cooldown reduction. `Tank.recalc` and the weapon stats read the result.
- The **15-crew cap** comes from bunks (Bridge 2, Quarters 3, Barracks 5) and is hard-capped at 15. Reaching 15 unlocks the **Outrider**. It holds 5–8 side crew, and its stats scale with their roles and levels. Expeditions drive, harvest or scavenge, then return and unload. When it's destroyed, each crew member aboard survives with probability `min(0.75, 0.35 + 0.15·medics)`. Survivors walk back injured.

## Chests

| Chest | Contents |
|---|---|
| **Supply** | Materials, 50% chance of a weapon |
| **Rune** | 7% champion, 13% exclusive character, 13% exclusive weapon, otherwise an Uncommon+ weapon. Always rune materials on top. |
| **This-or-That** | Two different categories among weapon, crew, big material bundle and Salvaged Tech. You pick one. |
| **Titan hoard** | A Rare+ weapon, titan materials and tech |

Luck from threat, Lucky Loretta and Treasure Sense pushes rarity up.

## Dead Zone networking

- JSON over one WebSocket (`/ws`), with 10 Hz snapshots. The `WarzoneServer` class knows nothing about transports: Node wires it to `ws`, and the browser runs it directly for offline raids.
- **Clients send:**
  - Their blueprint and stats on join.
  - Position, rotation and turret aims at 15 Hz.
  - Cosmetic shot events.
  - Hits they land, tagged with the weapon key and rarity.
  - Heal and shield amounts.
  - Cargo updates, loot requests and extraction intent.
- **The server owns** health, shields, armor mitigation, deaths, wreck drops, crate contents (first come, first served), supply drops, extraction timing and the bot AI.
- **Anti-cheat:**
  - Each hit is capped at that weapon's maximum. The cap is generous enough to cover 6★ weapons, trees, twin barrels and ramps.
  - Hit range is checked.
  - Each attacker has a per-second damage budget. Damage past it is dropped.
  - Heals are capped per 10 s window.
  - Movement is speed-limited: teleports are rejected, and dashes catch up a moment later.
  - Leaving mid-raid is treated as death. On deploy, the local save is rewritten without at-risk items.

## Rendering

- Low-resolution render target (1/2–1/4 of the screen) → post pass (1-pixel depth outlines, 4×4 Bayer dithering, posterize) → nearest-neighbour upscale.
- Terrain is chunked (32×32 tiles), built lazily around the camera, and uses one 16 px atlas. Liquids are separate scrolling meshes.
- Units:
  - Tanks: voxel meshes regenerated when the layout changes. Turrets are separate pivots.
  - Creatures: billboard sprites with 2 frames, a flash variant and an elite outline.
  - Titans: animated box models.
- Fog of war: a 640×640 data texture injected into every world material via `onBeforeCompile`.
- HUD bars and damage numbers are drawn on a 2D overlay canvas. Panels are DOM.

## Roadmap

- Rig-to-rig boarding and interior views.
- A day/night cycle with lit reactors and lava glow.
- More titan species per zone, plus zone bosses with bespoke arenas.
- Gamepad support, key rebinding, and music.
- Dead Zone matchmaking, persistent leaderboards, and server-side movement simulation.
