---
name: entities
description: How NPC/Item/Weapon stats map to UEFN devices and how item modifiers apply. Read before authoring NPCs/items/weapons or wiring their behavior/stats.
---

# entities — how NPC/Item/Weapon stats map to UEFN

## Global stats drive everything
`rgd_list_stats` → `{id,name,def}`. Each stat becomes a **base-value field** on
every NPC (`npc.stats[statId]`) and a **modifier field** on every item
(`item.stats[statId]`, applied on pickup). `rgd_create_stat` back-fills the stat
onto all NPCs (at its default) and items (at `0`); `rgd_delete_stat` strips it
everywhere. Never set `entity.stats` for a stat id not in `rgd_list_stats` — it
is ignored and causes UI/data drift.

## NPCs / enemies / friendlies
`rgd_create_npc(id, name, type, role, symbol, color, behavior, stats, currency_drop)`.
- `type`: Enemy | Elite | Boss | Friendly — who they are.
  Friendly = people you talk to (Wizard Bob & friends), not fight.
  Legacy Merchant / NPC / Ally fold into Friendly on load.
- `role`: Melee | Ranged | Caster | Charger | Support | Civilian — how they fight
  (or don't). Inferred from `behavior` / range if omitted.
- `currency_drop`: `{ gold: 5 }` granted on kill (ids from currencies tab).
- `symbol`: single map character; `color`: grid/card colour (display only).
- `behavior`: freeform AI note (e.g. Melee Chaser, Friendly Caster).
- `stats`: base combat values `{ hp:120, attack:14, ... }`.

On spawn: backend spawns `DEFAULT_ASSETS["npc"]` (guard/AI spawner by default —
override with `level["assets"]["npc"]`). Feed stat values into the device's
editable fields (health, damage) or a Verse behavior component; keep that Verse
under `Content/Verse/<System>/` (one system per folder, never at Verse root).
`behavior` / `role` select the AI aggro/patrol config.

## Currencies
`rgd_list_currencies` / `rgd_create_currency` / `rgd_update_currency` / `rgd_delete_currency`.
Catalogue of money types (Gold / Gems / Keys by default). Everywhere money
moves references these ids:
- `item.currencyReward` / `npc.currencyDrop` = `{ gold: 5, gems: 1 }`
- `item.price` / `weapon.price` / `wizardry.price` = `{ currencyId, amount }`

## Progression (player levels + skill node tree)
`rgd_get_progression` / `rgd_preview_scaling` / `rgd_list_skill_nodes` /
`rgd_create_skill_node` / `rgd_update_skill_node` / `rgd_delete_skill_node` /
`rgd_set_progression_curve` / `rgd_set_level_points` / `rgd_set_scaling`.

- `levelTable[]` — per player level: `{ level, xp, points, notes }`. Level-ups
  grant skill points (`pointsPerLevel` default; override per row).
- `scaling[]` — curves for Health / Damage / Defense / Speed:
  `{ statId, label, base, perLevel, curve }` — preview with `rgd_preview_scaling(level)`.
- `tree.nodes[]` — skill nodes like a game tree. Each has `requires: [nodeId…]`
  (later branches stay locked until those nodes have rank ≥ 1), `maxRank`,
  `cost` (points per rank), `x`/`y` (panel drag layout), `statMods`, `effect`.

Starter tree: **Shield** (root) → Guard / Bulwark / Riposte → Aegis (needs
Guard+Bulwark) / Magic Find → Fortune / Crown. Spend points how you want; skip
deep nodes until you have enough levels.

Do not confuse with map Levels (`rgd_list_levels`) — those are dungeon grids.

## Drops (scrolls, buffs & currency pickups)
`rgd_create_item(id, name, category, symbol, color, desc, stats, currency_reward, price_*)`.
- `category`: Scroll | Health | Shield | Damage | Speed | Defense | Utility | Currency.
  Drops are scrolls, buffs, and currency pickups. Legacy labels
  (Consumable / Armor / Relic / Key) are folded into these on load.
- `stats` are **modifiers/deltas**: `{ hp:+25, speed:-50 }` (buff / penalty),
  applied to the player's live stats on pickup — NOT the item's own stats.
- `currency_reward`: `{ gold: 25 }` granted on pickup (ids from currencies tab).
- `price_*`: optional shop buy cost.

On spawn: `DEFAULT_ASSETS["item"]` (pickup device by default). On pickup apply
`player.stat += item.stats[statId]` in a Verse handler reading the same stat ids;
clamp where sensible.

## Player weapons
`rgd_list_weapons` / `rgd_get_weapon` / `rgd_create_weapon` / `rgd_update_weapon` / `rgd_delete_weapon`.

Each player weapon has:
- `uefnAsset` — path to the UEFN custom weapon (`FortWeaponRangedItemDefinition`), e.g. `/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol`
- `uefnIcon` — Texture2D icon under `/Roguelike/Weapons/Icons/T_Icon_*`
- `icon` — plugin panel SVG under `assets/weapons/*.svg`
- exactly **5 upgrades** (`upgrades[]` with `id`, `name`, `slot` 1–5, `maxLevel`, `level`)

Starter catalogue (ids): pistol, assault_rifle, smg, shotgun, bolt_sniper,
auto_sniper, rocket_launcher, bow, crossbow, minigun.

Grant via item granter / `weapon_granter_device` referencing the WID asset. Tune
upgrade progression in Verse using the same upgrade ids; the design panel is the
source of truth for which 5 upgrades each weapon exposes.

## Placing entities
Entities live in the design until placed on a grid cell (`cell.entity`). Place via
the UI (entity tool → click) or `rgd_set_grid_cell(level_id, x, y, "floor",
entity_kind, entity_id)` (auto-floors the cell). Then `rgd_build_level_in_uefn`
spawns them. Use `id` for logic; symbol/color are cosmetic.
