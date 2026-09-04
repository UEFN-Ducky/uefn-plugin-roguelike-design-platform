---
name: sync-safety
description: Never double-spawn, always reconcile against the scene first, detect and resolve drift, never leave actors at the Outliner root. Read before any spawn or rebuild.
---

# sync-safety — keep the design and the scene as one

## 1. Reconcile before you spawn
- `rgd_get_scene_state()` → actors the plugin spawned.
- `rgd_get_sync_status()` → `{ inSync, missing, extra, intended, sceneActors,
  listener }`. `missing` = intended placements not yet in the scene; `extra` =
  scene actors the design no longer wants; `inSync:true` = exact match.

## 2. Never double-spawn
- `rgd_spawn_*_in_uefn` de-duplicates: an existing actor for the same
  entity+level+cell returns `{skipped:true, reason:"already spawned"}`.
- `rgd_build_level_in_uefn` is a **reconciling rebuild** (clears the level's prior
  actors first) → idempotent. Prefer it over hand-spawning a whole map, and over
  patching cells after large edits.

## 3. Resolve drift
- `missing > 0` (scene stale): rebuild the level, or spawn the missing cells.
- `extra > 0` (leftovers): `rgd_clear_level_in_uefn(level_id)` then rebuild.
- Hand-edited scene: `rgd_sync_from_uefn(level_id)` marks which plugin actors
  still exist (`present`) and refreshes listener status. The design stays the
  source of truth — it does not invent design from arbitrary actors.

## 4. Listener discipline
Every ACT tool checks the listener; offline → `{error:"UEFN listener offline"}`.
Report it and stop — do not retry in a loop. The UI's listener + sync chips and
the MCP / Live Sync tab (design vs scene + tool-call log) confirm outcomes.

## 5. Labelling & foldering are mandatory
The backend labels + folders every actor. If a spawn's `warnings` has a `label:`
or `folder:` failure, the actor exists but is mis-organised — re-label/re-folder
or clear+rebuild; never leave an actor at the Outliner root.

## 6. Verify, don't assume
Read every ACT return: check `error`, `warnings`, counts. Then confirm the whole
picture with `rgd_get_sync_status().inSync === true`. Only then is it done.
