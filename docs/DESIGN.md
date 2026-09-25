# IRONCRAWL design notes

## Pillars

1. **Your base is a tank.** The fortress isn't a menu. It's a tile grid on treads that you walk through, build in, arm, defend and drive. It's big on purpose: barracks, living quarters, an armory, workshops, a gun deck and a hold full of loot all have to fit.
2. **People and hardware grow together.** Crew specialists make the stations they work at better. The tech tree makes every gun of a family better, and unlocks new ones.
3. **Distance is difficulty.** Threat rises smoothly away from camp and underground, so you choose how far to push.
4. **The world pushes back on your equipment.** Each zone asks a question your rig has to answer: a drive train for the terrain, a sealed module for the hazard, and a suit for when you step outside.
5. **Risk is a choice.** The open world is persistent and forgiving. The Dead Zone is where you gamble your gear against other players for the best loot.

## Core loops

- **Minute to minute:** mine, fight, loot caches, repair plating, drive.
- **Session:** push into a new zone. Harvest its signature resource. Craft the part that unlocks the next zone.
- **Long term:** grow the chassis, fill it with facilities and crew, and take the best gear into the Dead Zone.

## Progression web

```
Rustbelt (iron, copper, scrap)
  └─ Dune Tracks ──► Dune Sea (titanium)
                       ├─ Rad Baffles / Rad Suit ──► Glass Crater (uranium)
                       ├─ Spiked Chains ──────────► Cryo Spires (cryo crystal)
                       │    └─ Thermal Regulator/Suit, Magma Treads ──► Magma Rift (sulfur)
                       └─ (uranium + crystal) Hover Skirts + (sulfur) Sealant ──► Acid Marsh (xenite)
                                                                              └─ Xeno Alloy endgame
Dead Zone: shortcut to any tier, for a price
```

Mining tiers gate the same web. The Mk1 cutter handles tier 1 (iron, copper, basalt, concrete). Mk2 needs titanium alloy and cuts tier 2 (titanium, uranium, cryo crystal, sulfur). Mk3 needs uranium rods and cryo cores and cuts xenite.

## Rig model

- The grid has foreground tiles (collision), a backdrop layer (it marks "indoors") and multi-tile modules.
- It moves by translation only. It never rotates, so collision stays an AABB-vs-tiles check in grid space. Anything standing on or inside the rig is carried along by its motion each frame.
- It rests on the highest ground under its footprint, so it bridges gaps narrower than itself. The wheels draw on suspension down to the real ground.
- For each new column of ground it enters, the leading edge can climb `traction.climb` tiles, plus one "strain" tile at reduced speed on good traction. Anything taller blocks it, unless a Drill Ram on that edge bores through, dumping the spoils into cargo.
- Terrain under the footprint picks a traction row from the installed drive train. The worst terrain covering 30% or more of the footprint wins.
- `speed = (30 + 200 · min(1.3, thrust·160/mass)) · traction · (0.35 + 0.65 · powerRatio)` px/s.

## Crew and research model

- Every half second the game re-posts the player's crew and recomputes a `RigBonus`. Posting goes: manual pins first, then each role's preferred stations, then spare hands and marines onto any silent guns.
- The bonus is a pure function of crew (role, level, perks, trait, post) plus researched tech. `Rig.recalc()` reads it for power, thrust, cargo, shields and plating health. Turrets read it for damage, rate and range.
- Tech nodes either `unlock` modules (Build mode hides locked ones) or apply multiplicative per-family weapon mods and hull mods. The tree is a DAG, so any node can be reached from the free roots. The tests check this.
- The research currency is Salvaged Tech. It drops only from military sources, which ties the tree to combat.

## Threat and titans

- `threat = 1 + |x - spawn| / 300 + depth / 70` (capped at 10). Enemy health scales `0.6 + 0.4·threat` and damage scales `0.8 + 0.2·threat`. Spawn weights move from crawlers toward gunners and brutes as threat rises. Elites roll from threat 2.5.
- Titans spawn one at a time from threat 2.2, every few minutes, 70–90 tiles from your tank. They follow the ground rather than tile collision, so giants stride over terrain.
  - **Walkers** stomp and lob boulders.
  - **Beasts** stalk, charge and ram.
  - **Worms** burrow and can't be hit underground, then erupt in an arc through the target. Their segments are extra hit circles.

## Combat

- Projectiles are simulated with substeps. They hit world tiles, hostile rig tiles and modules (friendly hulls are ignored), creatures, and remote players (reported to the server).
- Shields are an ellipse. They only absorb shots that cross the bubble from outside, so boarders get through.
- A turret needs a crew member assigned to it. Crew fill turrets first, then act as defenders who shoot intruders inside the hull.
- Destroying a raider's bridge wrecks the rig: it drops loot (plus Salvaged Tech) and the hull stays behind to salvage. Sometimes a prisoner is freed and joins your crew.
- Standing inside your own hull (in front of backdrop) cuts splash damage from blasts outside it by 85%.

## Dead Zone networking

- JSON over a single WebSocket (`/ws`), with a 20 Hz server tick and snapshots.
- Clients send their position, their inventory whenever it changes, shots (for visuals) and hits they land.
- The server owns HP, armor mitigation, deaths, pack drops, crate contents and pickups (first come, first served), supply drops, extraction validation and bot AI. Bots use the same shared physics code as the client.
- Anti-cheat is basic: damage capped per weapon, a distance check, a damage-per-second cap and input clamping. Full server-authoritative movement is on the roadmap.

## Roadmap

- **Rigs in the Dead Zone:** sync rig blueprints and positions so fortress-vs-fortress PvP is possible.
- Server-authoritative movement with client prediction.
- Flowing liquids, deeper cave biomes, and bosses per zone (a Burrow Titan in the Dune Sea).
- Friendly trader convoys, crew traits and morale, and rig-to-rig boarding ramps.
- Gamepad support, key rebinding, and an audio mixer with music.
- IndexedDB saves and multiple save slots.
