---
name: build-level
description: Grid → real UEFN level. Read before spawning entities or calling rgd_build_level_in_uefn — covers grid→world mapping, wall/door/entity construction, idempotent reconciling rebuild, and resize safety.
---

# build-level — grid → real UEFN level (golden path)

## 1. Grid → world mapping (WORLD_STEP = 512)
```
world.x = (x - w/2) * 512
world.y = (y - h/2) * 512
world.z = 0
```
Grid is centred on the origin. A 16×12 level spans ~±4096 × ±3072 uu. Change
`WORLD_STEP` in `backend/register.py` for a different footprint — never offset
actors by hand.

## 2. What each cell becomes
- `wall` → wall prop under `<Level>/Geometry/Walls`, label `Wall_x_y`.
- `door` → door prop under `<Level>/Geometry/Doors`, label `Door_x_y`.
- `floor`/`empty` → nothing (floor is the play surface).
- `cell.entity {kind,id}` → NPC/Item at that cell under `<Level>/Enemies` or
  `<Level>/Loot`, label `<Name>_x_y`.

Assets come from `DEFAULT_ASSETS` (Creative content, read only). Override per
level via `level["assets"]={wall,door,npc,item}`. Unresolved asset → a per-cell
**warning** (never a silent skip). Fix the path and rebuild.

## 3. Building
- One entity: `rgd_spawn_npc_in_uefn(npc_id, level_id, x, y)` /
  `rgd_spawn_item_in_uefn(item_id, level_id, x, y)`.
- Whole map: `rgd_build_level_in_uefn(level_id)` — a **reconciling rebuild**: it
  clears the level's prior plugin actors first, then spawns fresh, so it is
  **idempotent**. Each spawn does `spawn_actor` → `set_actor_label` →
  `set_actor_folder` → `set_actor_transform` (location/rotation; **scale only on
  props**, never on Fortnite Creative devices).

## 4. Resize / rebuild safety
- Resizing (`rgd_update_level` w/h) preserves overlapping cells, drops the rest;
  the scene is then stale — rebuild to reconcile.
- Offline listener → `build_level_in_uefn` returns `{error:"UEFN listener
  offline"}`. Surface it; do not retry blindly.
- After building, check counts (`walls,doors,entities,actors`) and that
  `warnings` is empty, then `rgd_get_sync_status().inSync === true`.

## 5. Typical flow (Journey NPCs + NPC loot tables → Level Gen → build)
```
# Attach loot on NPCs (Drop Tables), not on the level/journey:
rgd_update_npc("melee_corpse", drop_table_ids=["dt_common_trash"])
rgd_update_npc("boss", drop_table_ids=["dt_boss_loot"])

rgd_create_journey(id="jny_crypt", name="Crypt Run", journey={
  "teleportOnAdvance": True,
  "enemyPoolNpcIds": ["melee_corpse","archer","boss"],
  "loop": {"enabled": False, "count": 1, "onComplete": "exit"},
  "steps": [
    {"id":"s1","type":"wave","name":"Waves","waveCount":3,"offerUpgrade":True},
    {"id":"s2","type":"travel","name":"Hall","lengthHint":2},
    {"id":"s3","type":"boss","name":"Boss","bossNpcId":"boss"}
  ]})
rgd_create_level(id="l1", name="Crypt", threat="High", journey_id="jny_crypt")
rgd_generate_layout(level_id="l1", template_id="gen_crypt", seed=1337)
rgd_build_layout_in_uefn(level_id="l1")
rgd_get_sync_status()
```

Author journeys on the **Journeys** tab (NPCs only); Level Gen only selects `journeyId`. Gen stamps Journey enemies + items from those NPCs’ attached drop tables. Do **not** hand-paint Start/End — generator bookends entrance/exit from Journey.

## 6. Chunk layout + Verse devices

Chunk build path: `rgd_generate_layout` (reads catalogue Journey via `level.journeyId`) → `rgd_build_layout_in_uefn`.

Chunks are **Tetris-style polyominoes**, not only 2×2 boxes: L/J/T/S/Z/I/O (+ larger wings).
Footprint `grid` may include `empty` notches; only solid cells occupy space. Join via perimeter
`ports` (`door`/`open` in/outs) that must match opposing faces. Author in Levels → Chunks
(paint empty / shape presets) or `rgd_update_chunk(..., grid=..., ports=[...])`.

When authoring chunk prefabs, name child markers:
- `Slot_A` — player / journey arena entry (`StartProps` / `ArenaStartProps`)
- `Slot_B` — enemy arena (`SpawnPoints` / `EnemySlotProps`)
- `Socket_N0_Door` (etc.) — in/out ports on the solid perimeter

Runtime Verse wiring (later pass — panel first):
1. Place Generation + Reward; wire into Level.
2. Fill Generation `Chunks[]` from catalogue.
3. Level `StartProps[]` from generated Slot_A (no EndProps — win → hub).
4. Per objective: `ArenaStartProps` + combat `SpawnPoints` from Slot_B.
5. Journey `TeleportOnObjectiveAdvance` chains arenas.
