# IRONCRAWL

A top-down, high-resolution pixel-art wasteland game about commanding a **Titan Crawler**: a building that learned how to move. It is 200 m long, 90 m wide and 42 m tall, rides on **eight independent crawlers** and has **seven decks** inside, from the Command deck down to Engineering. The Titan is drawn straight from its design sheet (its main battery turns to its targets), and you can also run it from the **captain's cabin** in first person or look **inside** at every deck, Fallout Shelter style. It plays with mouse and keyboard or on a **phone** (touch stick, taps, drag-and-drop cards). It drives like 30,000 tonnes should: slow off the mark while the engine spools up, then faster and faster once she has way on (about 75 km/h stock, far more with a rebuilt engine and overdrive). It goes anywhere, crushing buildings, climbing cliffs and wading through lava, and its guns aim and fire on their own. **Hordes** of hundreds come at you in waves, World War Z style, and climb your hull. You fight with **battle cards** (drag one onto the battlefield, Clash Royale style), run the inside of your fortress **like a Clash of Clans village**, and level up by **killing things**.

The pieces:
- **Battle cards**, in the spirit of Magic: The Gathering. There are 42 cards in five schools (Iron, Volt, Rust, Void, Aegis) and six rarities, plus 12 permanent **relics**. You hold 4 cards from a deck of 8 and spend energy to play them: artillery, rocket salvos, drop squads, EMP, lightning storms, a dragon, a mech, a nuke. **Card packs** drop from elites, raider tanks, outposts, runes and titans. Duplicates level your cards up.
- **Hordes.** Every minute or so a warning says where the next wave comes from, then a wall of swarmers pours in, piles against the hull and climbs aboard. You can't just run them down: the hull throws them clear and the quick ones grab on and climb. Let the guns and roof soldiers work, build **Tesla Coils**, drive flat out to shake a few off. Every wave is bigger.
- **Engine Workshop.** Rebuild the drive in five parts from the shop: a bigger engine block (top speed, for more fuel and reactor draw), turbochargers (getting going), the gearbox (pull at speed), nitro injectors (overdrive) and radiators (how long overdrive runs before the engine overheats).
- **The Mega Hangar airlift.** Raise the Hangar on the radio and order supplies, crew and refits that never top out; heavy cargo airships fly them out and lower them onto your deck.
- **Rival dreadnoughts.** From commander level 6, enemy fortresses built like yours and as strong as yours hunt you across the map.
- **Go anywhere.** Nothing blocks the fortress. The right **drive train** (unlocked on the Level Road, swapped automatically on AUTO) makes each ground fast, and makes lava and acid safe.
- **Blueprint.** A technical drawing of your whole fortress with its firepower on each side, speed on each ground, and an assessment of its weak spots.
- **Your base is a moving city.** The Titan Crawler's deck plan is 18×38 cells of 5 m on each of seven decks plus the roof: +3 Command, +2 Recreation, +1 Residential, 0 Main Deck, -1 Hangar, -2 Logistics and -3 Engineering. **The Spine**, a 10 m corridor, runs down the middle of every deck, with three lifts beside it. Each **Command Center** refit (Titan Mk I-VI) adds mounts and opens decks. Inside, **builders** put up and upgrade buildings in real time, and you can watch the crew at work, asleep and walking the Spine.
- **It breaks like a building.** Five **armour zones** take hits separately. The **crawlers** can be lost, which costs speed and pulls the hull round. Six **subsystems** go Operational → Damaged → Degraded → Critical → Disabled. **Fires** and **flooding** spread compartment by compartment. You have to keep up **fuel, water, air and temperature**, and the Works crew keep it all running for scrap. The **bridge status display** (`Y`) shows everything.
- **A huge world.** It is 10 km across, 20-30 minutes of driving, streamed around you. There are faction strongholds (a ruined city, a military base, cyborgs, the dead, a necropolis and a monster nest), storms that drive the roof soldiers inside, and **the Mothership** at the world's edge, always under siege, where you install the parts you take from the strongholds, trade, hire and refit.
- **Two kinds of progress.** Materials and weapons come from combat and scavenging. **Commander XP** comes only from fighting (kills, loot areas, outposts, raider tanks, runes, titans). Each level adds hull and damage, gives a card pack, and unlocks buildings, weapons and features on the **Level Road**.
- **Squads.** Army buildings train sub-units: marines, scout buggies, guard drones, a fighter wing and a walker mech. They follow you, **guard a spot** (drag their badge onto the map), or **scavenge ahead** (collect loot drops and drill nodes, then drive the haul home).
- **Tracking.** Can't afford an upgrade? Press **TRACK**. A box lists what you still need, and a marker and beam of light point at the nearest place to get the first missing thing.
- When your fortress goes down, it's towed back to camp and comes back **fully repaired**.

Near camp you meet scrap rats and scavengers. Deeper in you meet raider tanks, rival dreadnoughts, enemy outposts, elites and **titans**, and the hordes find you everywhere. North-east of camp is **the Dead Zone**, a multiplayer warzone where other players can loot your wreck.

![A mid-game dreadnought: squads, a summoned dragon and a meteor storm](docs/screenshots/hero.jpg)

| | |
|---|---|
| ![Drag a card onto the battlefield: the ring shows where it lands](docs/screenshots/drag-card.jpg) | ![Nuclear Launch](docs/screenshots/nuke.jpg) |
| ![Your base, run like a village: tap a building to upgrade it](docs/screenshots/base-view.jpg) | ![The shop: new buildings, counts and limits](docs/screenshots/shop.jpg) |
| ![Placing a building on the deck](docs/screenshots/placing.jpg) | ![Tracking an upgrade: what you need, and a marker to where it is](docs/screenshots/tracking.jpg) |
| ![Opening a card pack](docs/screenshots/card-pack.jpg) | ![Deck and collection](docs/screenshots/cards.jpg) |
| ![Commander level up](docs/screenshots/level-up.jpg) | ![The Level Road](docs/screenshots/level-road.jpg) |
| ![Drag a squad badge onto the map to guard a spot](docs/screenshots/squad-drag.jpg) | ![Squads guarding and scavenging](docs/screenshots/squads.jpg) |
| ![A titan in the Magma Rift](docs/screenshots/magma-titan.jpg) | ![The Arsenal: stars and upgrade trees](docs/screenshots/arsenal.jpg) |

## Quick start

```bash
npm install
npm run dev          # client (Vite, http://localhost:5173) + Dead Zone server (ws on :8787)
```

Open http://localhost:5173 and press **Start**. Single-player only needs the browser. If the Dead Zone can't reach a server (for example when the game is embedded as a single file), you still get an **offline raid against bots**, run in the browser with the same server code.

| Command | What it does |
|---|---|
| `npm run build` | Typecheck and build the client into `dist/` |
| `npm start` | One process for production: serves `dist/` **and** the Dead Zone on `PORT` (default 8787) |
| `npm test` | Unit tests (world gen, pathing, the base and builders, cards, the Level Road, squads, tracking, hordes, drive trains, rivals, the blueprint analysis, crew, chests, saves, arsenal, Dead Zone server rules) |
| `npm run typecheck` | `tsc --noEmit` |

Server environment variables: `PORT`, `WARZONE_SEED` (fixed arena), `WARZONE_BOTS` (AI raiders, default 5).

## Controls

Everything works with the mouse. The camera always follows your fortress.

| Input | Action |
|---|---|
| **W A S D** / arrows | Drive: **W/S throttle, A/D steer** (tank-style, the default). Screen-relative steering is in the menu. |
| **Drag a card** onto the battlefield | Play it there. Or tap a card (or press **1-4**), then tap the ground. Self cards play on a tap. |
| **Right-click** | Drive there. On an enemy: focus fire. On a resource node: drill it. On a rune, loot area or the gate: go and use it. |
| **Drag a squad badge** onto the map | That squad guards the spot. ⌂ calls it back; SCAVENGE sends marines or buggies out. |
| **B**, or click your fortress | Your base (the village view). WASD drives off and leaves it. |
| **C** / **V** / **K** / **L** | Cards · Arsenal · Crew · Level Road |
| **I** / **M** / **H** / **Esc** | Cargo, Refinery & Workshop · World map · Help · Menu |
| **N** | Blueprint: the whole fortress drawn out, with an analysis |
| **Y** | Ship vitals: hull, armour zones, crawlers, systems, supplies, fires and flooding, population; send repair teams |
| **F** / **G** | The captain's cabin (first person, levers and switches) · Inside the Titan (every deck, the crew, work orders) |
| **O** / **Space** / **.** | Overdrive (until the engine overheats) · All stop · Cruise warp |
| **HANGAR** button | The Mega Hangar airlift: supplies, crew and endless refits by airship |
| **T** / **U** | Set up or pack up camp · Mothership shipyard (while docked) |
| **5** | Repair kit |
| **Wheel** | Zoom (over the corner radar: zoom the radar, 150 m to 1.8 km) |
| **J** | Send the Outrider to the node or loot area under the cursor |

Menu buttons only appear once their feature unlocks, so there's never much to learn at once.

### On a phone or tablet

![Playing on a phone: the stick bottom left, a card being dragged out of the hand](docs/screenshots/phone.jpg)

The first touch switches the game to touch controls (phones and tablets start in them). Sideways is best, but portrait works too. On small screens the HUD compacts: smaller cards, a hull bar above the hand, and full-screen panels.

| Touch | Action |
|---|---|
| **Stick** (bottom left) | Drive. Press anywhere in that corner and the stick centres under your thumb. How far you push it sets the speed. |
| **Tap** the battlefield | What right-click does: drive there, focus fire on an enemy, drill a node, use a rune, loot area or the gate. |
| **Hold a finger** on the ground | Keep steering toward it. |
| **Drag a card** out of the hand | Play it where you let go. Or tap the card, then tap the ground (tap the card again to cancel). |
| **Pinch** | Zoom |
| **Tap your fortress** or **BASE** | The base view. Tap a building to see it. To place one, tap a spot to preview it, then tap **PLACE** (or the same spot again). |
| **☰** | The menu: Blueprint, Cargo, Map, Level Road, Help, fullscreen, sound. |
| **Drive chip** (left of the hull bar) | Pick a drive train, or leave AUTO on. |
| **Drag a squad badge** | Guard that spot. |

## How it plays

### Fight

- Your turrets pick their own targets. Drive toward trouble, or away from it.
- **Hordes** arrive in waves: a calm spell, a warning with the direction (and a red arrow at the screen edge), then the surge. Swarmers sprint, pile against the hull and climb aboard, where they chew on it until they're shot, zapped by a **Tesla Coil**, or flung off when you drive at speed. Leapers jump straight onto the deck. Beat a wave for XP and scrap (and a card pack every third wave); the next one is bigger.
- **Rival dreadnoughts** (commander level 6+) are enemy fortresses with the same hull, the same size and about the same guns as yours. They hunt you (a red ring on the minimap, a bar at the top when close). Destroy one for an Epic pack (Legendary from level 20), Salvaged Tech and its best gun.
- **Energy** (the purple bar) refills over time, 10 max. Every card has a cost. Play a card and the next one in your deck slides in, and the played card goes to the back.
- Area cards land where you drop them (up to 70 units from the fortress). Self cards (repairs, shields, speed, buffs) affect your fortress.

| School | Style | Examples |
|---|---|---|
| **Iron** | Explosions and fire | Artillery Call, Rocket Salvo, Fireball, Carpet Bomb, Meteor Storm, **Nuclear Launch** |
| **Volt** | Lightning, orbit and time | EMP, Lightning Storm, Orbital Lance, steerable **Orbital Laser**, **Time Stop**, Blink Drive, Cataclysm |
| **Rust** | Repair, acid and salvage | Weld Crew, Nanite Cloud, Acid Rain, Magnet Sweep, Salvage Frenzy, Minefield, Kraken's Grasp |
| **Void** | Gravity, drain and monsters | Singularity, Soul Harvest, Void Rift, Deadeye Salvo, **Summon Dragon** |
| **Aegis** | Shields and troops | Shield Surge, Aegis Dome, Drop Squad, Iron Legion, **Mech Drop**, Miracle Protocol, Juggernaut Charge |

**Relics** are permanent cards you slot for always-on bonuses (faster energy, lifesteal, a lethal-hit save, +2 max energy, every card costs 1 less...). You get relic slots at commander levels 6, 14 and 22.

### The Titan Crawler

- **Driving.** The throttle lever stays where you set it. The engine has to spool up before she pulls (three seconds in she has barely begun to roll), then she pulls harder the faster she goes, reaching about 75 km/h stock on firm ground; she brakes over several seconds and turns in wide differential arcs, where the inside crawlers run slower than the outside. Overdrive adds a big burst of speed for a lot of fuel until the engine overheats and trips it. The HUD gauge (and the cabin dash) shows km/h, the throttle, RPM, engine heat and each crawler bank's speed.
- **Engine Workshop** (the shop's ENGINE tab). Five parts, each up to Mk 8 (the Command Center caps them): Engine Block, Turbochargers, Gearbox, Nitro Injectors, Radiators. The bench drawing grows with each part, and hovering one previews its effect on top speed, time to cruise, overdrive speed and time, fuel burn and reactor draw.
- **Inside** (`G`). Every deck in cutaway: your rooms, the deck's own furnished spaces between them (operations and comms, the lounge and bar, washrooms and laundry, the armory, the motor pool, the stores, the boiler and turbine rooms), sealed decks mothballed, and the crew at work, asleep and walking the Spine. Send work crews on chains of jobs from here.
- **Terrain.** Each crawler rides its own suspension over rubble, cliffs and dunes, and the hull pitches and rolls with them. It leaves persistent track marks and ploughs through buildings, which collapse around it.
- **Decks.** The roof carries the guns, the soldier nests, the Spine's skylight and the command tower. Below it are seven decks, each with its own purpose (Command, Recreation, Residential, the public Main Deck, Hangar, Logistics, Engineering). The elevator panel in the base view switches between them. The Spine and Lifts A-C are fixed structure. Mk I opens the roof and five decks; the Hangar opens at Mk II and Recreation at Mk III.
- **Damage and upkeep.** Hits land on the armour zone they come from; a worn zone lets up to 40% more through. Flank hits damage crawlers, and hits pass on to the systems behind that armour. Big hits start fires that grow and spread (the magazine can cook off); damage control and the sprinklers fight them. A breached hull in mud or acid floods the lowest decks until the pumps catch up. Fuel burns as you drive (Refineries turn scrap into fuel); the crew drink water (recycled by life support and condensed from snow, ice and mud); life support keeps the air and temperature right. Everything wears, and the Works crew repair the worst damage first for scrap, three times as fast in camp.

### Level up (commander XP)

- XP comes from **killing enemies** (tougher enemies give more), clearing **loot areas**, destroying **outposts** and **raider tanks**, claiming **runes** and felling **titans**.
- Every level: **+3% hull, +2% weapon damage**, a full repair and a card pack (Rare every 3 levels, Epic every 5, Legendary every 10).
- The **Level Road** (`L`) shows what each of the 30 levels unlocks: buildings, weapon families and upgrades, crew upgrades, extra builders (levels 10 and 20), relic slots, and features (Crew, Squads, Arsenal, Relics, the Dead Zone, the Outrider).

### Build (the base, `B`)

- The camera swings in and turns so the front of your fortress points up. **Tap a building** to see it and upgrade it, move it or remove it, or jump to what it does (mount a weapon, refine ore, craft, forge, hire crew, command its squad, change the drive train).
- **SHOP:** every building by category, with its footprint, build time, cost and how many you have of the Command Center's limit. Pick one, then tap a green spot on the deck.
- **Builders:** 2 at the start (3 at level 10, 4 at level 20). Each works on one job at a time, in real time, while you drive and fight. Buildings keep working while they're being upgraded.
- **Command Center:** its level (1-6) is the Titan's mark, and it sets the mounts, the open decks and the cap on everything else. Upgrading it needs commander levels 3, 7, 12, 18 and 24.

  | Command Center | Refit | Decks open | Built-in weapons |
  |---|---|---|---|
  | 1 | Titan Crawler Mk I | Roof, +3, +1, 0, -2, -3 | 4 corner pads, 2 side pads, main battery |
  | 2 | Titan Crawler Mk II | + Hangar (-1) | +2 side pads |
  | 3 | Titan Crawler Mk III | + Recreation (+2) | |
  | 4 | Titan Crawler Mk IV | | +rear main battery |
  | 5 | Titan Crawler Mk V | | +2 side pads |
  | 6 | Titan Crawler Mk VI | | +2 side pads |

  Pads take a light or medium weapon; main batteries take a heavy one. New mounts arrive armed. On top of these you can build as many turret mounts as the Command Center allows.

- **Buildings:**

  | Group | Buildings |
  |---|---|
  | Turrets | Light, medium and heavy turret mounts (each level +15% damage) |
  | Defense | Armor Plate, Heavy Armor Plate, Repair Bay, Shield Generator, **Tesla Coil** (zaps climbers), Radar Mast |
  | Army & squads | Barracks (marines), Garage (scout buggies, the Outrider), Drone Bay, Jet Hangar, Mech Bay |
  | Crew | Living Quarters, Medbay, Hydroponics, Mess Hall, Training Grounds |
  | Resources | Cargo Hold, Refinery, Mk2/Mk3 drill rigs, Secure Vault |
  | Power & drive | Scrap Reactor, Fission Core, Diesel Engine, Ion Drive |
  | Workshops & labs | Workshop, **Card Lab** (card power and energy regen), Weapon Forge, Ammo Depot, Arcane Sanctum |
  | Hazard gear | Rad Baffles, Thermal Regulator, Sealant Pumps |

### Squads

| Squad | Building | Good at |
|---|---|---|
| Marine Squad | Barracks | Fighting beside you; can scavenge slowly |
| Scout Buggies | Garage | Scavenging ahead and hauling loot home |
| Guard Drones | Drone Bay | Guarding a spot |
| Fighter Wing | Jet Hangar | Strafing and bombing; can't be shot down |
| Walker Mech | Mech Bay | Soaking damage, cannon and missiles |

The building's level sets the squad's size and strength. Fallen units are replaced over time.

### Loot

- **Weapons** go from **1★ to 6★ Mythic**. Mount them on turret mounts in the **Arsenal** (`V`). Each star is a point in that weapon's own upgrade tree, and a **Weapon Forge** adds stars over time. There are 35 weapons: ray guns, acid and plasma launchers, a Ray-Rail twin cannon, a turret that launches mini fighter jets, storm spires, gravity cannons, the Void Lance.
- **Park on a resource node** and your fortress drills it by itself. Refine ore at a **Refinery** (CARGO > Refine & Craft).
- **Loot areas** (yellow ◆): park inside the ring and hold while defenders attack.
- **Runes** (colored ●): beat the guardians, then park beside the altar for a 90 s buff, a **Rune Chest** (exclusive weapons, exclusive characters, champions) and a card pack.
- **Crew** give passive bonuses, pick perk cards as they level, and each brings their signature card. Max 15 aboard; at 15 you can launch the **Outrider** mini tank.

### The wasteland

The world is 10,240 m across (one tile is one metre), streamed in chunks around you, in six zones with faction regions and roads between them. Danger rises with distance from camp, in tiers I–V, and with how long you've survived. Every tile is drivable; the gear below makes it fast or safe:

| Zone | Direction | What you need |
|---|---|---|
| **Rustbelt** | Center | Home turf |
| **Dune Sea** | East | Dune Tracks (level 3), or you crawl |
| **Cryo Spires** | North | Spiked Chains (level 5) and a Thermal Regulator |
| **Glass Crater** | South | Rad Baffles |
| **Magma Rift** | West | A Thermal Regulator, plus Magma Treads (level 8) so lava doesn't burn |
| **Acid Marsh** | Outer ring | Hover Skirts (level 12) and Sealant Pumps |

### The Dead Zone (multiplayer, commander level 8)

Drive into the gate north-east of camp. Loot crates and supply drops, fight other commanders and AI raiders, and hold position at a green **extraction** beacon for 6 seconds to keep what you found. Your cards come with you. If your fortress is destroyed there, you drop your cargo hold (except Vault slots), every spare weapon and one mounted weapon as a wreck anyone can loot. The server owns health, damage, deaths, crates and extraction, and caps reported hits and damage per second.

## Tech

- **TypeScript + Vite**, a **Canvas 2D** pixel-art renderer, **ws** for the server, **Vitest** for tests. The Titan is drawn from its design sheet (`src/assets/ship/`: the top view with the main turret cut out so it can turn, plus side, front, rear and 3/4 views for the cabin, title and screens; inlined into the single-file build). Everything else (creatures, props, terrain, interiors, portraits, card art, icons, sound) is generated at startup.
- **Pixel art:** sprites are painted at the size they're shown in six-tone hue-shifted ramps with ordered dithering and dark outlines, and scaled by whole steps; the view renders at native resolution.
- **Simulation:** fixed 60 Hz steps.
  - One world unit is one metre; a Titan's deck cell is 5 m (enemy rigs use smaller cells), and its guns reach four times as far as the same gun on a buggy. Nothing blocks it: A* weighs terrain by the drive train's traction and makes cliffs cost more, and it flattens obstacles and props under its hull. The terrain chunks it touches are rebuilt in the same frame.
  - Hordes of 300+ run on a uniform enemy grid (neighbours, hits and blasts look up nearby cells instead of every enemy) and render as two batched point-sprite draws from a sprite atlas.
  - Squads and summons are `Ally` entities with anchors: follow the fortress, guard a point, or scavenge a target.
- **Save:** localStorage (`ironcrawl3d-save-v1`, format v11: engine parts, refits and the airlift included), autosaved every 30 s. Older saves load and move onto the Titan's decks automatically.

```
src/shared/   map (with crush nav), world + arena generation, collision & A*, items, weapons, rarity, loot, protocol, Dead Zone server sim
src/game/     Game state, tank, cards, progress (Level Road), squads, crew, arsenal (forge), chests, actions, save, and systems/
              (movement + crushing, weapons, projectiles, cards, squads, builds, tracking, allies, AI, world, crew, outrider, spawns)
src/render/   three.js view (camera follow, base view, aim ring, beacon), pixel post pass, terrain chunks, voxel models, sprites, particles,
              fog of war, overlay (bars, base grid, tracking arrow), minimap, icons and card art
src/ui/       HUD (commander, hand, energy, squads, tracker, horde bar, drive chip, touch stick), base view, BLUEPRINT / CARDS / LEVEL ROAD / ARSENAL /
              CREW / CARGO / MAP panels, chests, title
src/net/      Dead Zone client (WebSocket with an in-browser fallback)
server/       Node host for the Dead Zone (serves dist/ too)
legacy/2d/    the original side-view 2D prototype, kept for reference
```

See [docs/DESIGN.md](docs/DESIGN.md) for the design notes.
