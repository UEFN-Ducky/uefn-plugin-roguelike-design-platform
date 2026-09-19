---
name: roguelike-design
description: Roguelike design platform — levels, NPCs, items, weapons, wizardry, live UEFN sync via rgd_* tools
license: MIT
metadata:
  label: Roguelike Design
  author: UEFN-Ducky
  copyright: Copyright 2026 Mindful Path Company, LLC
  allow_redistribute: true
  managed_by: uefn-ducky
  source_plugin_id: roguelike-design-platform
---

# Roguelike Game Design Platform — skill pack

Self-contained roguelike design platform. **No export step** — the plugin's
central state IS the product. Read every design value through the plugin's own
`rgd_*` MCP tools and build the live UEFN scene directly through them.

## Per-project storage (v1.2.0+)

Design data is saved **per UEFN project** at:
`<project>/.ducky/roguelike-design/store.json`

State version **4** seeds pistols + wizardry. Switching projects loads that
project's own stats, NPCs, items, weapons, wizardry, levels, difficulties, and
scene records.

## Layers (all inside this plugin)
1. UI panel — Dashboard, Levels, NPCs, Items, **Currencies**, **Progression**
   (player levels + drag skill-node tree), **Player Weapons**, **Wizardry**,
   Stats, Difficulties, MCP / Live Sync.
2. MCP tools — `backend/register.py`, registered as `rgd_*` (READ / WRITE / ACT).
3. Skills — this pack: see subskills `build-level`, `entities`, `sync-safety`.

## Weapons + Wizardry (v1.2)
- **Weapons** categorized (Pistols first). Each has `slotPolicy`:
  - `infusable` — open power slot; accepts element infusion / charged scrolls; **hub reroll**.
  - `locked_power` — permanent Time signature (Paradox / Hourglass).
- **Wizardry** nested by element: Fire / Ice / Lightning / Void (+ Time locked).
  Each findable power is a **reusable scroll** (`customItemId`) players can find/buy
  and slot onto any open weapon slot. `verseClass` + `uefnCustomItem` ready for
  Verse `@editable` wiring later. Individual powers only — no reactions in catalogue yet.

Starter pistols: Service (starter), Hand Cannon, Machine Pistol, Paradox, Hourglass.

## Single source of truth
```
stats / difficulties / npcs / items / levels / scene  (unchanged shapes)
weapons: [ { id, name, category, fireIdentity, slotPolicy, powerSlots[],
             suggestedElements[], uefnAsset, verseClass, ... } ]
wizardry: [ { id, name, element, kind, stackName, procName, chargedName,
              findable, reusable, customItemId, verseClass, uefnCustomItem } ]
elements: [ { id, stack, proc, charged, ... } ]
meta.infusionRerollPolicy: "hub"
```

## Tool map
| Goal | Tool |
|------|------|
| Read design | `rgd_list_levels`/`rgd_get_level`, `rgd_list_npcs`, `rgd_list_items`, `rgd_list_stats`, `rgd_get_state` |
| Progression | `rgd_get_progression`, `rgd_preview_scaling`, `rgd_list_skill_nodes`/`rgd_get_skill_node`, `rgd_create_skill_node`/`rgd_update_skill_node`/`rgd_delete_skill_node`, `rgd_set_progression_curve`, `rgd_set_level_points`, `rgd_set_scaling` |
| Currencies | `rgd_list_currencies`/`rgd_create_currency`/`rgd_update_currency`/`rgd_delete_currency` |
| Weapons | `rgd_list_weapons`/`rgd_get_weapon`/`rgd_create_weapon`/`rgd_update_weapon`/`rgd_delete_weapon`/`rgd_equip_weapon_power` |
| Wizardry | `rgd_list_wizardry`/`rgd_get_wizardry`/`rgd_list_elements`/`rgd_create_wizardry`/`rgd_update_wizardry`/`rgd_delete_wizardry` |
| Scene / drift | `rgd_get_scene_state`, `rgd_get_sync_status` |
| Stats | `rgd_create_stat`/`rgd_update_stat`/`rgd_delete_stat` |
| Entities | `rgd_create_npc`/`rgd_update_npc`/`rgd_delete_npc`, `rgd_create_item`/`rgd_update_item`/`rgd_delete_item` |
| Levels | `rgd_create_level`, `rgd_update_level` (journey_id / layers), `rgd_delete_level`, `rgd_generate_layout` |
| Overlay | `rgd_set_level_overlay`, `rgd_get_level_overlay` — reference image under generate preview |
| Chunks | `rgd_list_chunks`, import/update chunk catalogue (Levels → Chunks tab) |
| Spawn / build | `rgd_build_layout_in_uefn`, `rgd_spawn_npc_in_uefn`, `rgd_spawn_item_in_uefn`, `rgd_build_level_in_uefn` |
| Reconcile | `rgd_clear_level_in_uefn`, `rgd_sync_from_uefn` |

## Levels UI (plugin)

One nav entry **Levels** with tabs **Level Gen** | **Chunks** | **Journeys**. No map paint — layouts are generated.

**Ownership (hard):**
- **NPCs** → Journey enemy pool / step enemies (Journeys tab)
- **Items** → drop tables / bonus loot **attached on those NPCs** (NPCs & Enemies / Drop Tables)
- **Not** per-level “Include in gen” checkboxes, and not journey-wide item reward lists

**Journeys** (catalogue — author here):
- `state.journeys[]` — steps (Wave/Boss/Travel/Timer), enemy pools, optional loop count
- Create / duplicate / delete on the Journeys tab

**Level Gen** (select only):
- `level.journeyId` → picks a catalogue Journey
- `layers` — preview draw key only
- `gen` / `layout` / `grid` — last generation result (Save persists this)
- Gen stamps Journey NPCs + items resolved from those NPCs’ loot tables

Generation expands selected Journey → spine with **auto entrance + exit** (never hand Start/End):
- wave/timer → large `objective` arenas
- boss → `boss` (fallback large objective)
- travel → `connector`×lengthHint + short `room`

```
rgd_create_journey(id, name, journey={steps:[...], enemyPoolNpcIds:[...], loop:{...}})
rgd_update_npc(id, drop_table_ids=["dt_common_trash"])  # loot on the NPC
rgd_update_level(id, journey_id="jny_…")
rgd_generate_layout(level_id=id, template_id="gen_crypt", seed=1337)
rgd_build_layout_in_uefn(level_id=id)
```

Overlay still loads under the preview:
```
rgd_set_level_overlay(level_id="lvl_egypt", image_path="C:/path/map.png", opacity=0.55, enabled=True, stretch=True)
```

Subskills: `build-level`, `entities`, `sync-safety`.

## Verse devices (Roguelike island — runtime contract)

Placeable devices under `Content/Verse/GameDevices/Gameplay/RoguelikeGame/`:

| Device | Owns |
|--------|------|
| `roguelike_level_device` | Card, Journey, Reward, Generation, `StartProps[]`, **`DifficultyIndex` + `EnemyCountPercent`** (source of truth → Journey → NPC Easy/Normal/Hard). No EndProps — win → hub |
| `roguelike_reward_device` | Clear loot (granter + currency) |
| `roguelike_generation_device` | Seed/space/branches, `Chunks[]` (`rgd_chunk_entry`); roles include **Boss** |
| `roguelike_journey_device` | Ordered objectives; `ArenaRoleName` → gen Slot_A/Slot_B; BossObjective defaults to Boss chunks |

**RGD Slot convention (`Slot_A` / `Slot_B`):**
- **Slot_A** → `StartProps` / `ArenaStartProps` / travel A
- **Slot_B** → wave/boss/timer `SpawnPoints` (bound from generation by step role)

Roles: entrance, exit, room, connector, objective, **boss**, deadend, cap, filler.

Plugin Level fields: `difficultyIndex` (0/1/2), `enemyCountPercent`; Journey step `arenaRoleName` (wave/timer→Objective, boss→Boss, travel→Room).

Editor: `rgd_generate_layout` (Journey-aware) → `rgd_build_layout_in_uefn`.

## Drop tables (v1.8)

Named shared loot pools in dropTables[]. NPCs link via dropTableIds[] and per-enemy bonusDrops[].
Entry shape: {itemId, chance, weight, qtyMin, qtyMax, guaranteed}. Currency on kill stays on npc.currencyDrop.

| Goal | Tool |
|------|------|
| List/get tables | `rgd_list_drop_tables` / `rgd_get_drop_table` |
| CRUD tables | `rgd_create_drop_table` / `rgd_update_drop_table` / `rgd_delete_drop_table` |
| Attach/detach | `rgd_attach_drop_table` / `rgd_detach_drop_table` |
| NPC loot fields | `rgd_create_npc` / `rgd_update_npc` (drop_table_ids, bonus_drops, currency_drop) |

Panel: **Drop Tables** tab + NPC modal (tables + bonus + $) + Drop modal reverse links.

## Verify

`rgd_*` read-back plus `changeset_list`. Never restart UEFN-Ducky — applies on next start.
