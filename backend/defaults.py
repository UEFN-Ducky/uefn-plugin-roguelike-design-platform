"""Default Roguelike Design Platform content — stats, difficulties, NPCs, items, starter level."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .chunks import (
    DEFAULT_CHUNK_ASSETS,
    DEFAULT_CHUNKS,
    DEFAULT_GEN_TEMPLATES,
    LEGACY_FAKE_CHUNK_IDS,
    normalize_chunk,
    normalize_chunk_asset,
    normalize_template,
)


def _dmg_mult(attack: float, scale: float = 1.0) -> float:
    return round(max(0.1, attack / 20.0 * scale), 2)


def _speed_mult(speed: float, scale: float = 1.0) -> float:
    return round(max(0.5, speed / 300.0 * scale), 2)


def _enemy_block(
    hp: float,
    attack: float,
    sidestep: int,
    speed: float = 300.0,
    hp_scale: float = 1.0,
    dmg_scale: float = 1.0,
    dodge_delta: int = 0,
    speed_scale: float = 1.0,
    spawn_weight: int = 1,
) -> dict[str, Any]:
    return {
        "maxHealth": round(hp * hp_scale, 1),
        "damageMultiplier": _dmg_mult(attack, dmg_scale),
        "dodgeChance": max(0, min(100, sidestep + dodge_delta)),
        "moveSpeedMultiplier": _speed_mult(speed, speed_scale),
        "spawnWeight": spawn_weight,
    }


def difficulty_triplet(stats: dict[str, Any], spawn_weight: int = 1) -> list[dict[str, Any]]:
    """Easy / Normal / Hard blocks mirroring roguelike_enemy_stats in Verse."""
    hp = float(stats.get("hp", 100))
    attack = float(stats.get("attack", 20))
    sidestep = int(stats.get("sidestep", 35))
    speed = float(stats.get("speed", 300))
    w = spawn_weight
    return [
        _enemy_block(hp, attack, sidestep, speed, 0.75, 0.70, -10, 0.90, w),
        _enemy_block(hp, attack, sidestep, speed, 1.00, 1.00, 0, 1.00, w),
        _enemy_block(hp, attack, sidestep, speed, 1.50, 1.35, 15, 1.10, w),
    ]


DEFAULT_STATS: list[dict[str, Any]] = [
    {"id": "hp", "name": "Health", "def": 100},
    {"id": "attack", "name": "Attack Damage", "def": 20},
    {"id": "defense", "name": "Defense", "def": 5},
    {"id": "speed", "name": "Speed", "def": 300},
    {"id": "range", "name": "Attack Range (cm)", "def": 220},
    {"id": "cooldown", "name": "Attack Cooldown (s)", "def": 1.3},
    {"id": "chaserange", "name": "Max Chase Range (cm)", "def": 8000},
    {"id": "spread", "name": "Spread Distance (cm)", "def": 260},
    {"id": "sidestep", "name": "Sidestep Chance (%)", "def": 35},
]

DEFAULT_DIFFICULTIES: list[dict[str, Any]] = [
    {
        "id": "easy",
        "name": "Easy",
        "index": 0,
        "enemyCountPercent": 75,
        "description": "Fewer enemies, weaker stats — good for learning routes.",
    },
    {
        "id": "normal",
        "name": "Normal",
        "index": 1,
        "enemyCountPercent": 100,
        "description": "Designed wave counts and baseline enemy tuning.",
    },
    {
        "id": "hard",
        "name": "Hard",
        "index": 2,
        "enemyCountPercent": 150,
        "description": "More enemies, +50% HP, +35% damage, higher dodge.",
    },
]

# NPC taxonomy (same idea as drop categories):
#   type  = threat / affiliation: Enemy | Elite | Boss | Friendly
#   role  = combat style:        Melee | Ranged | Caster | Charger | Support | Civilian
NPC_TYPES = ("Enemy", "Elite", "Boss", "Friendly")
NPC_ROLES = ("Melee", "Ranged", "Caster", "Charger", "Support", "Civilian")


def _infer_npc_role(behavior: str = "", stats: dict[str, Any] | None = None) -> str:
    b = (behavior or "").lower()
    if any(k in b for k in ("cast", "mage", "wizard", "sorcer")):
        return "Caster"
    if any(k in b for k in ("charge", "rush", "bomb", "splod")):
        return "Charger"
    if any(k in b for k in ("range", "archer", "kite", "lob", "sniper", "gun")):
        return "Ranged"
    if any(k in b for k in ("heal", "buff", "support", "merchant", "shop", "vendor")):
        return "Support"
    if any(k in b for k in ("friend", "civilian", "quest", "ally", "npc")):
        return "Civilian"
    rng = (stats or {}).get("range")
    try:
        if float(rng) >= 1000:
            return "Ranged"
    except (TypeError, ValueError):
        pass
    return "Melee"


def _normalize_npc_type(type_val: str = "") -> str:
    t = (type_val or "Enemy").strip()
    if t in NPC_TYPES:
        return t
    # Legacy labels fold into Friendly (people you talk to, not fight).
    if t.lower() in ("merchant", "npc", "ally", "friendly", "quest", "vendor"):
        return "Friendly"
    if t.lower() == "elite":
        return "Elite"
    if t.lower() == "boss":
        return "Boss"
    return "Enemy"



def _drop_entry(
    item_id: str,
    chance: float = 100.0,
    weight: float = 1.0,
    qty_min: int = 1,
    qty_max: int = 1,
    guaranteed: bool = False,
) -> dict[str, Any]:
    qmin = max(0, int(qty_min))
    qmax = max(qmin, int(qty_max))
    return {
        "itemId": item_id,
        "chance": float(chance),
        "weight": float(weight if weight is not None else 1),
        "qtyMin": qmin,
        "qtyMax": qmax,
        "guaranteed": bool(guaranteed),
    }


def normalize_drop_entry(raw: Any) -> dict[str, Any] | None:
    """Coerce a loose entry dict into the canonical drop-entry shape."""
    if not isinstance(raw, dict):
        return None
    item_id = str(raw.get("itemId") or raw.get("item_id") or "").strip()
    if not item_id:
        return None
    chance = raw.get("chance")
    if chance is None:
        chance = 100.0
    weight = raw.get("weight")
    if weight is None:
        weight = 1.0
    qty_min = raw.get("qtyMin", raw.get("qty_min", 1))
    qty_max = raw.get("qtyMax", raw.get("qty_max", qty_min))
    try:
        qmin = max(0, int(qty_min))
    except (TypeError, ValueError):
        qmin = 1
    try:
        qmax = max(qmin, int(qty_max))
    except (TypeError, ValueError):
        qmax = qmin
    try:
        ch = float(chance)
    except (TypeError, ValueError):
        ch = 100.0
    try:
        wt = float(weight)
    except (TypeError, ValueError):
        wt = 1.0
    return {
        "itemId": item_id,
        "chance": ch,
        "weight": wt,
        "qtyMin": qmin,
        "qtyMax": qmax,
        "guaranteed": bool(raw.get("guaranteed")),
    }


def normalize_drop_entries(raw: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not isinstance(raw, list):
        return out
    for e in raw:
        ne = normalize_drop_entry(e)
        if ne:
            out.append(ne)
    return out


def _drop_table(
    id: str,
    name: str,
    color: str,
    desc: str,
    entries: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": id,
        "name": name,
        "color": color,
        "desc": desc,
        "entries": normalize_drop_entries(entries or []),
    }


DEFAULT_DROP_TABLES: list[dict[str, Any]] = [
    _drop_table(
        "dt_common_trash",
        "Common Trash",
        "#94a3b8",
        "Shared loot for basic enemies.",
        [
            _drop_entry("health_potion", chance=35, weight=3, qty_min=1, qty_max=1),
            _drop_entry("gold_purse", chance=60, weight=5, qty_min=1, qty_max=1),
            _drop_entry("swift_boots", chance=8, weight=1, qty_min=1, qty_max=1),
        ],
    ),
    _drop_table(
        "dt_elite_cache",
        "Elite Cache",
        "#f59e0b",
        "Richer shared table for elites.",
        [
            _drop_entry("damage_charm", chance=40, weight=2, qty_min=1, qty_max=1),
            _drop_entry("iron_shield", chance=35, weight=2, qty_min=1, qty_max=1),
            _drop_entry("health_potion", chance=70, weight=3, qty_min=1, qty_max=2),
            _drop_entry("gold_purse", chance=100, weight=4, qty_min=1, qty_max=2, guaranteed=True),
        ],
    ),
    _drop_table(
        "dt_boss_hoard",
        "Boss Hoard",
        "#ef4444",
        "Boss shared table — high value, often guaranteed.",
        [
            _drop_entry("damage_charm", chance=100, weight=2, qty_min=1, qty_max=1, guaranteed=True),
            _drop_entry("iron_shield", chance=80, weight=2, qty_min=1, qty_max=1),
            _drop_entry("gold_purse", chance=100, weight=3, qty_min=2, qty_max=4, guaranteed=True),
            _drop_entry("health_potion", chance=100, weight=2, qty_min=1, qty_max=3, guaranteed=True),
        ],
    ),
]


def _npc(
    id: str,
    name: str,
    symbol: str,
    color: str,
    behavior: str,
    stats: dict[str, Any],
    type: str = "Enemy",
    role: str = "",
    verse_class: str = "",
    spawn_weight: int = 1,
    currency_drop: dict[str, Any] | None = None,
    drop_table_ids: list[str] | None = None,
    bonus_drops: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    ntype = _normalize_npc_type(type)
    nrole = role if role in NPC_ROLES else _infer_npc_role(behavior, stats)
    # Friendlies default to Civilian unless a combat role was set on purpose.
    if ntype == "Friendly" and not role:
        nrole = "Civilian" if nrole == "Melee" else nrole
    rec: dict[str, Any] = {
        "id": id,
        "name": name,
        "type": ntype,
        "role": nrole,
        "symbol": symbol,
        "color": color,
        "behavior": behavior,
        "stats": stats,
        "difficultyStats": difficulty_triplet(stats, spawn_weight),
        "currencyDrop": dict(currency_drop or {}),
        "dropTableIds": list(drop_table_ids or []),
        "bonusDrops": normalize_drop_entries(bonus_drops or []),
    }
    if verse_class:
        rec["verseClass"] = verse_class
    return rec


DEFAULT_NPCS: list[dict[str, Any]] = [
    _npc(
        "corpse_default",
        "Corpse (Default)",
        "z",
        "#9ca3af",
        "Melee Chaser",
        {
            "hp": 100,
            "attack": 18,
            "defense": 5,
            "speed": 300,
            "range": 220,
            "cooldown": 1.3,
            "chaserange": 7500,
            "spread": 260,
            "sidestep": 35,
        },
        role="Melee",
        verse_class="roguelike_enemy_behavior",
    ),
    _npc(
        "melee_corpse",
        "Melee Corpse",
        "m",
        "#ef4444",
        "Melee Chaser",
        {
            "hp": 100,
            "attack": 20,
            "defense": 5,
            "speed": 300,
            "range": 220,
            "cooldown": 1.2,
            "chaserange": 7500,
            "spread": 260,
            "sidestep": 35,
        },
        role="Melee",
        verse_class="enemy_melee_behavior",
        currency_drop={"gold": 5},
    ),
    _npc(
        "sword_corpse",
        "Sword Corpse",
        "s",
        "#f97316",
        "Melee Flurry",
        {
            "hp": 110,
            "attack": 28,
            "defense": 5,
            "speed": 310,
            "range": 250,
            "cooldown": 0.85,
            "chaserange": 8500,
            "spread": 220,
            "sidestep": 40,
        },
        role="Melee",
        verse_class="enemy_sword_behavior",
    ),
    _npc(
        "spear_corpse",
        "Spear Corpse",
        "p",
        "#f59e0b",
        "Mid-Range Poker",
        {
            "hp": 105,
            "attack": 24,
            "defense": 5,
            "speed": 295,
            "range": 520,
            "cooldown": 1.5,
            "chaserange": 8000,
            "spread": 0,
            "sidestep": 45,
        },
        role="Melee",
        verse_class="enemy_spear_behavior",
    ),
    _npc(
        "charger",
        "Charger",
        "c",
        "#eab308",
        "Charger",
        {
            "hp": 120,
            "attack": 40,
            "defense": 8,
            "speed": 340,
            "range": 280,
            "cooldown": 2.2,
            "chaserange": 9000,
            "spread": 240,
            "sidestep": 30,
        },
        role="Charger",
        verse_class="enemy_charger_behavior",
    ),
    _npc(
        "large_charger",
        "Large Charger",
        "C",
        "#a16207",
        "Heavy Charger",
        {
            "hp": 180,
            "attack": 65,
            "defense": 12,
            "speed": 280,
            "range": 360,
            "cooldown": 3.0,
            "chaserange": 9500,
            "spread": 320,
            "sidestep": 25,
        },
        type="Elite",
        role="Charger",
        verse_class="enemy_large_charger_behavior",
        spawn_weight=2,
        currency_drop={"gold": 20, "gems": 1},
    ),
    _npc(
        "hooker",
        "Hooker",
        "h",
        "#ec4899",
        "Rusher",
        {
            "hp": 95,
            "attack": 25,
            "defense": 4,
            "speed": 360,
            "range": 240,
            "cooldown": 1.1,
            "chaserange": 8500,
            "spread": 200,
            "sidestep": 40,
        },
        role="Melee",
        verse_class="enemy_hooker_behavior",
    ),
    _npc(
        "sploder",
        "Sploder",
        "*",
        "#dc2626",
        "Suicide Bomber",
        {
            "hp": 80,
            "attack": 85,
            "defense": 2,
            "speed": 320,
            "range": 320,
            "cooldown": 0,
            "chaserange": 9000,
            "spread": 180,
            "sidestep": 25,
        },
        role="Charger",
        verse_class="enemy_sploder_behavior",
    ),
    _npc(
        "archer",
        "Archer",
        "a",
        "#22c55e",
        "Ranged Kiter",
        {
            "hp": 90,
            "attack": 15,
            "defense": 4,
            "speed": 290,
            "range": 2600,
            "cooldown": 1.6,
            "chaserange": 8000,
            "spread": 0,
            "sidestep": 40,
        },
        role="Ranged",
        verse_class="enemy_archer_behavior",
        currency_drop={"gold": 8},
    ),
    _npc(
        "mage",
        "Mage",
        "M",
        "#8b5cf6",
        "Caster",
        {
            "hp": 85,
            "attack": 22,
            "defense": 3,
            "speed": 280,
            "range": 2000,
            "cooldown": 2.0,
            "chaserange": 8000,
            "spread": 0,
            "sidestep": 40,
        },
        role="Caster",
        verse_class="enemy_mage_behavior",
    ),
    _npc(
        "grenadier",
        "Grenadier",
        "g",
        "#14b8a6",
        "Lobber",
        {
            "hp": 100,
            "attack": 28,
            "defense": 6,
            "speed": 285,
            "range": 2200,
            "cooldown": 2.4,
            "chaserange": 8500,
            "spread": 0,
            "sidestep": 35,
        },
        role="Ranged",
        verse_class="enemy_grenadier_behavior",
    ),
    _npc(
        "boss",
        "Boss",
        "B",
        "#b91c1c",
        "Boss Slam",
        {
            "hp": 500,
            "attack": 50,
            "defense": 15,
            "speed": 260,
            "range": 320,
            "cooldown": 2.0,
            "chaserange": 9500,
            "spread": 300,
            "sidestep": 30,
        },
        type="Boss",
        role="Melee",
        verse_class="enemy_boss_behavior",
        spawn_weight=5,
        currency_drop={"gold": 100, "gems": 5, "keys": 1},
    ),
    # Island NPCDefs (Content/Goblin, Paragon*, Enemies/*) — keep catalogue in sync.
    _npc(
        "toe_goblin",
        "Toe Goblin",
        "G",
        "#4ade80",
        "Goblin Skirmisher",
        {
            "hp": 90,
            "attack": 16,
            "defense": 4,
            "speed": 330,
            "range": 200,
            "cooldown": 1.2,
            "chaserange": 8000,
            "spread": 220,
            "sidestep": 45,
        },
        role="Melee",
        verse_class="enemy_goblin_behavior",
        currency_drop={"gold": 6},
    ),
    _npc(
        "hooker_boss",
        "Hooker Boss",
        "H",
        "#db2777",
        "Boss Rusher",
        {
            "hp": 650,
            "attack": 55,
            "defense": 14,
            "speed": 300,
            "range": 280,
            "cooldown": 1.6,
            "chaserange": 9500,
            "spread": 280,
            "sidestep": 35,
        },
        type="Boss",
        role="Melee",
        verse_class="enemy_boss_behavior",
        spawn_weight=5,
        currency_drop={"gold": 120, "gems": 4, "keys": 1},
    ),
    _npc(
        "sun_wukong",
        "Sun Wukong",
        "W",
        "#facc15",
        "Staff Boss",
        {
            "hp": 800,
            "attack": 60,
            "defense": 16,
            "speed": 340,
            "range": 300,
            "cooldown": 1.4,
            "chaserange": 10000,
            "spread": 260,
            "sidestep": 40,
        },
        type="Boss",
        role="Melee",
        verse_class="enemy_wukong_behavior",
        spawn_weight=5,
        currency_drop={"gold": 150, "gems": 6, "keys": 1},
    ),
    _npc(
        "sevarog",
        "Sevarog",
        "S",
        "#7c3aed",
        "Paragon Boss",
        {
            "hp": 900,
            "attack": 70,
            "defense": 20,
            "speed": 270,
            "range": 340,
            "cooldown": 1.8,
            "chaserange": 10000,
            "spread": 300,
            "sidestep": 25,
        },
        type="Boss",
        role="Melee",
        verse_class="enemy_sevarog_behavior",
        spawn_weight=5,
        currency_drop={"gold": 160, "gems": 7, "keys": 1},
    ),
    # Friendly NPCs — people you talk to / buy from, not fight.
    _npc(
        "wizard_bob",
        "Wizard Bob",
        "w",
        "#38bdf8",
        "Friendly Caster",
        {
            "hp": 120,
            "attack": 0,
            "defense": 8,
            "speed": 250,
            "range": 0,
            "cooldown": 0,
            "chaserange": 0,
            "spread": 0,
            "sidestep": 0,
        },
        type="Friendly",
        role="Support",
        verse_class="friendly_wizard_bob",
        spawn_weight=0,
    ),
]

# Currencies are a catalogue referenced everywhere money moves:
#   item.currencyReward  — granted on pickup (alongside stat mods)
#   item.price           — shop buy cost {currencyId, amount}
#   npc.currencyDrop     — granted on kill
#   weapon.price / wizardry.price — shop buy cost

# Attach starter shared tables to stock combat NPCs (designer can change anytime).
for _n in DEFAULT_NPCS:
    _n.setdefault("bonusDrops", [])
    if _n.get("dropTableIds"):
        continue
    if _n.get("type") == "Friendly":
        _n["dropTableIds"] = []
    elif _n.get("type") == "Boss" or _n.get("id") in ("boss", "hooker_boss", "sun_wukong", "sevarog"):
        _n["dropTableIds"] = ["dt_boss_hoard"]
    elif _n.get("type") == "Elite" or _n.get("id") in ("large_charger", "mage", "grenadier"):
        _n["dropTableIds"] = ["dt_elite_cache"]
    else:
        _n["dropTableIds"] = ["dt_common_trash"]


DEFAULT_CURRENCIES: list[dict[str, Any]] = [
    {
        "id": "gold",
        "name": "Gold",
        "symbol": "G",
        "color": "#fbbf24",
        "desc": "Common loot coin — enemy drops, chests, vendors.",
        "startingAmount": 0,
    },
    {
        "id": "gems",
        "name": "Gems",
        "symbol": "◆",
        "color": "#a78bfa",
        "desc": "Rare crystal — elite/boss rewards and premium shops.",
        "startingAmount": 0,
    },
    {
        "id": "keys",
        "name": "Keys",
        "symbol": "🔑",
        "color": "#38bdf8",
        "desc": "Unlocks chests and locked doors.",
        "startingAmount": 0,
    },
]


# Drops are scrolls, buffs, and currency pickups — every one carries a drop category
# (Scroll / Health / Shield / Damage / Speed / Defense / Utility / Currency).
DEFAULT_ITEMS: list[dict[str, Any]] = [
    {
        "id": "gold_purse",
        "name": "Gold Purse",
        "category": "Currency",
        "symbol": "G",
        "color": "#fbbf24",
        "desc": "A small purse of coins.",
        "stats": {
            "hp": 0,
            "attack": 0,
            "defense": 0,
            "speed": 0,
            "range": 0,
            "cooldown": 0,
            "chaserange": 0,
            "spread": 0,
            "sidestep": 0,
        },
        "currencyReward": {"gold": 25},
        "price": {"currencyId": "gold", "amount": 0},
    },
    {
        "id": "health_potion",
        "name": "Health Potion",
        "category": "Health",
        "symbol": "+",
        "color": "#ef4444",
        "desc": "Restore 25 HP on pickup.",
        "stats": {
            "hp": 25,
            "attack": 0,
            "defense": 0,
            "speed": 0,
            "range": 0,
            "cooldown": 0,
            "chaserange": 0,
            "spread": 0,
            "sidestep": 0,
        },
        "currencyReward": {},
        "price": {"currencyId": "gold", "amount": 15},
    },
    {
        "id": "damage_charm",
        "name": "Damage Charm",
        "category": "Damage",
        "symbol": "⚔",
        "color": "#f97316",
        "desc": "+5 attack damage for the rest of the run.",
        "stats": {
            "hp": 0,
            "attack": 5,
            "defense": 0,
            "speed": 0,
            "range": 0,
            "cooldown": 0,
            "chaserange": 0,
            "spread": 0,
            "sidestep": 0,
        },
    },
    {
        "id": "iron_shield",
        "name": "Iron Shield",
        "category": "Shield",
        "symbol": "🛡",
        "color": "#64748b",
        "desc": "+8 defense.",
        "stats": {
            "hp": 0,
            "attack": 0,
            "defense": 8,
            "speed": 0,
            "range": 0,
            "cooldown": 0,
            "chaserange": 0,
            "spread": 0,
            "sidestep": 0,
        },
    },
    {
        "id": "swift_boots",
        "name": "Swift Boots",
        "category": "Speed",
        "symbol": "»",
        "color": "#22c55e",
        "desc": "+40 move speed.",
        "stats": {
            "hp": 0,
            "attack": 0,
            "defense": 0,
            "speed": 40,
            "range": 0,
            "cooldown": 0,
            "chaserange": 0,
            "spread": 0,
            "sidestep": 0,
        },
    },
]


def _cell(terrain: str = "empty", entity: dict | None = None) -> dict[str, Any]:
    return {"terrain": terrain, "entity": entity}


def _make_grid(w: int, h: int, fill: str = "empty") -> list[list[dict[str, Any]]]:
    return [[_cell(fill) for _ in range(w)] for _ in range(h)]


JOURNEY_STEP_TYPES = ("wave", "boss", "travel", "timer")


def default_level_layers() -> dict[str, bool]:
    return {
        "terrain": True,
        "path": True,
        "npcs": True,
        "items": True,
        "spawns": True,
        "starts": True,
        "entrances": True,
    }


def default_level_include() -> dict[str, list[str]]:
    return {"npcIds": [], "itemIds": []}


def default_journey_loop() -> dict[str, Any]:
    return {
        "enabled": False,
        "count": 1,
        "dropTableId": "",
        "onComplete": "exit",  # exit | restart
    }


def default_step_rewards() -> dict[str, Any]:
    return {"itemIds": [], "dropTableIds": [], "currency": {}}


def default_journey() -> dict[str, Any]:
    """Legacy inline blob on a Level (empty after catalogue migrate)."""
    return {
        "name": "Journey",
        "teleportOnAdvance": True,
        "steps": [],
    }


def _new_step_id() -> str:
    import time

    return "js_%s" % hex(int(time.time() * 1000) & 0xFFFFFF)[2:]


def _str_ids(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(x) for x in raw if x]


# Verse roguelike_level_device.DifficultyIndex — 0 Easy / 1 Normal / 2 Hard.
_THREAT_TO_DIFFICULTY = {"Low": 0, "Medium": 1, "High": 2, "Boss": 2}
_DIFFICULTY_ENEMY_PCT = {0: 75, 1: 100, 2: 150}
# Verse objective_slot.ArenaRoleName defaults from Journey step type.
_STEP_ARENA_ROLE = {
    "wave": "Objective",
    "timer": "Objective",
    "boss": "Boss",
    "travel": "Room",
}


def normalize_journey_step(raw: Any, index: int = 0) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    stype = str(raw.get("type") or "wave").strip().lower()
    if stype not in JOURNEY_STEP_TYPES:
        stype = "wave"
    step: dict[str, Any] = {
        "id": str(raw.get("id") or ("step_%d" % index)),
        "type": stype,
        "name": str(raw.get("name") or stype.title()),
        "offerUpgrade": bool(raw.get("offerUpgrade")),
        "notes": str(raw.get("notes") or ""),
    }
    rew_in = raw.get("rewards") if isinstance(raw.get("rewards"), dict) else {}
    cur_in = rew_in.get("currency") if isinstance(rew_in.get("currency"), dict) else {}
    step["rewards"] = {
        "itemIds": _str_ids(rew_in.get("itemIds")),
        "dropTableIds": _str_ids(rew_in.get("dropTableIds")),
        "currency": {
            str(k): int(v)
            for k, v in cur_in.items()
            if str(k)
            and str(v).lstrip("-").isdigit()
            and int(v)
        },
    }
    if stype == "wave":
        try:
            step["waveCount"] = max(1, int(raw.get("waveCount") or 3))
        except (TypeError, ValueError):
            step["waveCount"] = 3
        pool = raw.get("enemyPoolNpcIds") or raw.get("enemyPool") or []
        step["enemyPoolNpcIds"] = _str_ids(pool)
    elif stype == "boss":
        step["bossNpcId"] = str(raw.get("bossNpcId") or "")
    elif stype == "travel":
        try:
            step["lengthHint"] = max(1, int(raw.get("lengthHint") or 2))
        except (TypeError, ValueError):
            step["lengthHint"] = 2
    elif stype == "timer":
        try:
            step["durationSec"] = max(5, int(raw.get("durationSec") or 60))
        except (TypeError, ValueError):
            step["durationSec"] = 60
        step["survive"] = bool(raw.get("survive", True))
        step["enemyPoolNpcIds"] = _str_ids(raw.get("enemyPoolNpcIds") or [])
    # Mirrors Verse objective_slot.ArenaRoleName → generation Slot_A/Slot_B role.
    role = str(raw.get("arenaRoleName") or "").strip()
    step["arenaRoleName"] = role or _STEP_ARENA_ROLE.get(stype, "Objective")
    return step


def normalize_journey(raw: Any) -> dict[str, Any]:
    """Normalize a legacy inline level.journey blob (steps only)."""
    base = default_journey()
    if not isinstance(raw, dict):
        return base
    base["name"] = str(raw.get("name") or base["name"])
    base["teleportOnAdvance"] = bool(raw.get("teleportOnAdvance", True))
    steps_in = raw.get("steps") if isinstance(raw.get("steps"), list) else []
    steps: list[dict[str, Any]] = []
    for i, s in enumerate(steps_in):
        ns = normalize_journey_step(s, i)
        if ns:
            steps.append(ns)
    base["steps"] = steps
    return base


def normalize_journey_record(raw: Any) -> dict[str, Any]:
    """First-class catalogue Journey (authored on Journeys tab)."""
    if not isinstance(raw, dict):
        raw = {}
    loop_in = raw.get("loop") if isinstance(raw.get("loop"), dict) else {}
    loop = default_journey_loop()
    loop["enabled"] = bool(loop_in.get("enabled", loop["enabled"]))
    try:
        loop["count"] = max(1, int(loop_in.get("count") or 1))
    except (TypeError, ValueError):
        loop["count"] = 1
    loop["dropTableId"] = str(loop_in.get("dropTableId") or "")
    oc = str(loop_in.get("onComplete") or "exit").lower()
    loop["onComplete"] = oc if oc in ("exit", "restart") else "exit"
    steps_in = raw.get("steps") if isinstance(raw.get("steps"), list) else []
    steps: list[dict[str, Any]] = []
    for i, s in enumerate(steps_in):
        ns = normalize_journey_step(s, i)
        if ns:
            steps.append(ns)
    jid = str(raw.get("id") or "").strip() or ("jny_%s" % _new_step_id())
    return {
        "id": jid,
        "name": str(raw.get("name") or "Journey"),
        "notes": str(raw.get("notes") or ""),
        "teleportOnAdvance": bool(raw.get("teleportOnAdvance", True)),
        "enemyPoolNpcIds": _str_ids(raw.get("enemyPoolNpcIds")),
        "rewardItemIds": _str_ids(raw.get("rewardItemIds")),
        "rewardDropTableIds": _str_ids(raw.get("rewardDropTableIds")),
        "loop": loop,
        "steps": steps,
    }


def resolve_journey_for_level(state: dict[str, Any], level: dict[str, Any] | None) -> dict[str, Any] | None:
    """Catalogue journey for a level, else legacy inline journey with steps."""
    if not isinstance(level, dict):
        return None
    jid = str(level.get("journeyId") or "").strip()
    if jid:
        for j in state.get("journeys") or []:
            if isinstance(j, dict) and j.get("id") == jid:
                return normalize_journey_record(j)
    inline = level.get("journey") if isinstance(level.get("journey"), dict) else None
    if inline and (inline.get("steps") or []):
        return normalize_journey_record(
            {
                "id": jid or ("jny_inline_%s" % level.get("id")),
                "name": inline.get("name") or "Journey",
                "teleportOnAdvance": inline.get("teleportOnAdvance", True),
                "steps": inline.get("steps") or [],
            }
        )
    return None


def journey_npc_ids(journey: dict[str, Any] | None) -> list[str]:
    """NPCs stamped at gen come from step enemy pools + boss picks (not a journey-wide list)."""
    if not isinstance(journey, dict):
        return []
    out: list[str] = []
    for step in journey.get("steps") or []:
        if not isinstance(step, dict):
            continue
        for nid in step.get("enemyPoolNpcIds") or []:
            s = str(nid or "").strip()
            if s and s not in out:
                out.append(s)
        bid = str(step.get("bossNpcId") or "").strip()
        if bid and bid not in out:
            out.append(bid)
    # Legacy: if steps never got enemies, fall back to old journey-wide pool once.
    if not out:
        for nid in journey.get("enemyPoolNpcIds") or []:
            s = str(nid or "").strip()
            if s and s not in out:
                out.append(s)
    return out


def item_ids_from_npc_loot(state: dict[str, Any], npc_ids: list[str]) -> list[str]:
    """Items stamped at gen come from drop tables / bonus loot attached on those NPCs."""
    if not npc_ids:
        return []
    tables = {
        str(t.get("id")): t
        for t in (state.get("dropTables") or [])
        if isinstance(t, dict) and t.get("id")
    }
    npcs_by_id = {
        str(n.get("id")): n
        for n in (state.get("npcs") or [])
        if isinstance(n, dict) and n.get("id")
    }
    out: list[str] = []

    def _add_item(iid: Any) -> None:
        s = str(iid or "").strip()
        if s and s not in out:
            out.append(s)

    for nid in npc_ids:
        n = npcs_by_id.get(str(nid))
        if not n:
            continue
        for tid in n.get("dropTableIds") or []:
            t = tables.get(str(tid))
            if not t:
                continue
            for e in t.get("entries") or []:
                if isinstance(e, dict):
                    _add_item(e.get("itemId"))
        for e in n.get("bonusDrops") or []:
            if isinstance(e, dict):
                _add_item(e.get("itemId"))
    return out


def include_from_journey(state: dict[str, Any], journey: dict[str, Any] | None) -> dict[str, list[str]]:
    """Build gen stamp pools: Journey NPCs + loot tables attached to those NPCs."""
    npc_ids = journey_npc_ids(journey)
    return {"npcIds": npc_ids, "itemIds": item_ids_from_npc_loot(state, npc_ids)}


def migrate_journeys_catalogue(state: dict[str, Any]) -> dict[str, Any]:
    """Pull inline level.journey.steps into state.journeys[]; Level keeps journeyId."""
    journeys_in = state.get("journeys") if isinstance(state.get("journeys"), list) else []
    journeys = [normalize_journey_record(j) for j in journeys_in if isinstance(j, dict)]
    by_id = {j["id"]: j for j in journeys}
    for lvl in state.get("levels") or []:
        if not isinstance(lvl, dict):
            continue
        jid = str(lvl.get("journeyId") or "").strip()
        if jid and jid in by_id:
            lvl["journeyId"] = jid
            lvl["journey"] = default_journey()
            continue
        inline = lvl.get("journey") if isinstance(lvl.get("journey"), dict) else {}
        steps = inline.get("steps") if isinstance(inline.get("steps"), list) else []
        if steps:
            nid = "jny_from_%s" % str(lvl.get("id") or "lvl")
            base_nid, n = nid, 2
            while nid in by_id:
                nid = "%s_%d" % (base_nid, n)
                n += 1
            rec = normalize_journey_record(
                {
                    "id": nid,
                    "name": inline.get("name") or ("%s Journey" % (lvl.get("name") or "Level")),
                    "teleportOnAdvance": inline.get("teleportOnAdvance", True),
                    "steps": steps,
                    "enemyPoolNpcIds": (lvl.get("include") or {}).get("npcIds") or [],
                    "rewardItemIds": (lvl.get("include") or {}).get("itemIds") or [],
                }
            )
            journeys.append(rec)
            by_id[rec["id"]] = rec
            lvl["journeyId"] = rec["id"]
            lvl["journey"] = default_journey()
        else:
            lvl.setdefault("journeyId", jid)
            lvl["journey"] = default_journey()
    if not journeys:
        journeys = [_starter_journey()]
    state["journeys"] = journeys
    return state


def normalize_level(raw: Any) -> dict[str, Any]:
    """Level Gen target: journeyId selects catalogue Journey; include/layers for preview stamp."""
    if not isinstance(raw, dict):
        raw = {}
    out = deepcopy(raw)
    out.setdefault("id", "lvl_unnamed")
    out.setdefault("name", "Level")
    out.setdefault("theme", "#6366f1")
    out.setdefault("threat", "Medium")
    threat = str(out.get("threat") or "Medium")
    if threat not in _THREAT_TO_DIFFICULTY:
        threat = "Medium"
        out["threat"] = threat
    # difficultyIndex owns Verse Level difficulty (menu can override at runtime).
    if "difficultyIndex" not in raw or raw.get("difficultyIndex") is None:
        out["difficultyIndex"] = _THREAT_TO_DIFFICULTY[threat]
    else:
        try:
            out["difficultyIndex"] = max(0, min(2, int(raw.get("difficultyIndex"))))
        except (TypeError, ValueError):
            out["difficultyIndex"] = _THREAT_TO_DIFFICULTY[threat]
    if "enemyCountPercent" not in raw or raw.get("enemyCountPercent") is None:
        out["enemyCountPercent"] = _DIFFICULTY_ENEMY_PCT.get(out["difficultyIndex"], 100)
    else:
        try:
            out["enemyCountPercent"] = max(1, int(raw.get("enemyCountPercent")))
        except (TypeError, ValueError):
            out["enemyCountPercent"] = _DIFFICULTY_ENEMY_PCT.get(out["difficultyIndex"], 100)
    try:
        out["w"] = max(4, int(out.get("w") or 16))
    except (TypeError, ValueError):
        out["w"] = 16
    try:
        out["h"] = max(4, int(out.get("h") or 12))
    except (TypeError, ValueError):
        out["h"] = 12
    ov = out.get("overlay") if isinstance(out.get("overlay"), dict) else {}
    out["overlay"] = {
        "file": str(ov.get("file") or ""),
        "opacity": float(ov.get("opacity") if ov.get("opacity") is not None else 0.55),
        "enabled": bool(ov.get("enabled")),
        "stretch": bool(ov.get("stretch", True)),
    }
    out["journeyId"] = str(out.get("journeyId") or "")
    # Keep legacy blob empty/normalized (authoring lives on state.journeys).
    out["journey"] = normalize_journey(out.get("journey"))
    inc = out.get("include") if isinstance(out.get("include"), dict) else {}
    out["include"] = {
        "npcIds": [str(x) for x in (inc.get("npcIds") or []) if x],
        "itemIds": [str(x) for x in (inc.get("itemIds") or []) if x],
    }
    layers = default_level_layers()
    raw_layers = out.get("layers") if isinstance(out.get("layers"), dict) else {}
    for k in layers:
        if k in raw_layers:
            layers[k] = bool(raw_layers[k])
    out["layers"] = layers
    return out


def _starter_journey() -> dict[str, Any]:
    return normalize_journey_record(
        {
            "id": "jny_training_gauntlet",
            "name": "Training Gauntlet",
            "notes": "Wave → travel → boss. Edit on Journeys tab; pick on Level Gen.",
            "teleportOnAdvance": True,
            "enemyPoolNpcIds": ["toe_goblin", "melee_corpse", "archer", "sword_corpse"],
            "rewardItemIds": ["health_potion", "damage_charm"],
            "rewardDropTableIds": ["dt_common_trash"],
            "loop": {"enabled": False, "count": 1, "dropTableId": "dt_elite_cache", "onComplete": "exit"},
            "steps": [
                {
                    "id": "step_wave_1",
                    "type": "wave",
                    "name": "Warm-up Waves",
                    "offerUpgrade": True,
                    "waveCount": 2,
                    "enemyPoolNpcIds": ["toe_goblin", "melee_corpse", "archer"],
                    "rewards": {"itemIds": ["health_potion"], "dropTableIds": [], "currency": {"gold": 10}},
                },
                {
                    "id": "step_travel_1",
                    "type": "travel",
                    "name": "Hall Run",
                    "lengthHint": 2,
                },
                {
                    "id": "step_boss_1",
                    "type": "boss",
                    "name": "Sun Wukong",
                    "bossNpcId": "sun_wukong",
                    "offerUpgrade": False,
                    "rewards": {
                        "itemIds": ["damage_charm"],
                        "dropTableIds": ["dt_boss_hoard"],
                        "currency": {"gold": 50},
                    },
                },
            ],
        }
    )


def _starter_level() -> dict[str, Any]:
    """Starter level — picks catalogue journey; layout from Level Gen."""
    w, h = 14, 10
    return normalize_level(
        {
            "id": "lvl_training_room",
            "name": "Training Room",
            "w": w,
            "h": h,
            "theme": "#6366f1",
            "threat": "Low",
            "grid": {"_sparse": True, "cells": {}},
            "journeyId": "jny_training_gauntlet",
            "include": {
                "npcIds": [
                    "toe_goblin",
                    "melee_corpse",
                    "archer",
                    "sword_corpse",
                    "sun_wukong",
                    "sevarog",
                    "hooker_boss",
                ],
                "itemIds": ["health_potion", "damage_charm"],
            },
        }
    )

DEFAULT_ELEMENTS: list[dict[str, Any]] = [
    {
        "id": "Fire",
        "name": "Fire",
        "color": "#ef4444",
        "stack": "Burn",
        "proc": "Ignite",
        "procDesc": "Damage over time that spreads to enemies standing close.",
        "charged": "Cinder Nova",
        "chargedDesc": "Ignites everything around you and doubles burn ticks for 6 seconds.",
    },
    {
        "id": "Ice",
        "name": "Ice",
        "color": "#38bdf8",
        "stack": "Chill",
        "proc": "Frozen",
        "procDesc": "Target locked in place and takes 2x crit damage until it breaks.",
        "charged": "Frost Field",
        "chargedDesc": "Zone that chills everything inside continuously.",
    },
    {
        "id": "Lightning",
        "name": "Lightning",
        "color": "#facc15",
        "stack": "Charge",
        "proc": "Overload",
        "procDesc": "Bursts and jumps to 3 nearby enemies, applying charge to them.",
        "charged": "Storm Call",
        "chargedDesc": "Strikes the 6 highest charge targets on screen.",
    },
    {
        "id": "Void",
        "name": "Void",
        "color": "#a855f7",
        "stack": "Decay",
        "proc": "Collapse",
        "procDesc": "Pulls nearby enemies toward the target and cuts their damage output.",
        "charged": "Singularity",
        "chargedDesc": "Throws a rift that pulls, holds, and drains everything caught.",
    },
    {
        "id": "Time",
        "name": "Time",
        "color": "#94a3b8",
        "stack": "",
        "proc": "",
        "procDesc": "Locked signature element — cannot be infused onto Time pistols.",
        "charged": "",
        "chargedDesc": "",
    },
]


def _power_slot_open(
    label: str = "Element Infusion",
    *,
    index: int = 1,
    slot_id: str = "slot_element",
) -> dict[str, Any]:
    accepts = ["charged", "element_infusion"] if slot_id == "slot_charged" else ["element_infusion", "charged"]
    return {
        "id": slot_id,
        "index": index,
        "kind": "open",
        "accepts": accepts,
        "rerollPolicy": "hub",
        "equippedPowerId": None,
        "label": label,
    }


def _power_slot_locked(power_id: str, label: str) -> dict[str, Any]:
    return {
        "id": "slot_signature",
        "index": 1,
        "kind": "locked",
        "accepts": [],
        "rerollPolicy": "none",
        "lockedPowerId": power_id,
        "equippedPowerId": power_id,
        "label": label,
    }


def _open_slots() -> list[dict[str, Any]]:
    return [
        _power_slot_open("Element Infusion", index=1, slot_id="slot_element"),
        _power_slot_open("Charged Scroll", index=2, slot_id="slot_charged"),
    ]


def _locked_slots(power_id: str, label: str) -> list[dict[str, Any]]:
    return [
        _power_slot_locked(power_id, label),
        _power_slot_open("Element Infusion", index=2, slot_id="slot_element"),
    ]


def _demo_skins(color: str) -> list[dict[str, Any]]:
    return [
        {"id": "default", "name": "Default", "color": color or "#9ca3af"},
        {"id": "midnight", "name": "Midnight", "color": "#6366f1"},
        {"id": "ember", "name": "Ember", "color": "#ef4444"},
        {"id": "glacier", "name": "Glacier", "color": "#38bdf8"},
    ]


DEFAULT_WEAPON_CLASS_TRAITS: dict[str, dict[str, str]] = {
    "Pistol": {
        "name": "Sidearm",
        "summary": "Flexible sidearms. Open slots take element infusions; locked slots are Time signatures.",
    },
    "Assault Rifle": {
        "name": "Suppression",
        "summary": "Eight continuous hits on the same target makes it flinch and cut its damage output. ARs keep a target locked down while the party sets up reactions.",
    },
    "Shotgun": {
        "name": "Saturation",
        "summary": "Every pellet applies element stacks individually. A full body hit up close procs a status instantly. Shotguns are the fastest status applier and start reactions for everyone else.",
    },
    "SMG": {
        "name": "Haste",
        "summary": "Sustained fire builds Haste stacks that raise movement and reload speed. SMGs are the only class that fires at full accuracy while sprinting or dashing.",
    },
}


# Armory detail bars (0–100). Display profile per weapon — not NPC combat stats.
WEAPON_ARMORY_STATS: dict[str, dict[str, int]] = {
    "service_pistol": {"damage": 42, "accuracy": 78, "range": 55, "mobility": 70, "fire_rate": 58},
    "hand_cannon": {"damage": 88, "accuracy": 62, "range": 60, "mobility": 48, "fire_rate": 28},
    "machine_pistol": {"damage": 48, "accuracy": 45, "range": 40, "mobility": 72, "fire_rate": 92},
    "paradox": {"damage": 55, "accuracy": 70, "range": 58, "mobility": 65, "fire_rate": 50},
    "hourglass": {"damage": 72, "accuracy": 68, "range": 52, "mobility": 55, "fire_rate": 40},
    "vanguard": {"damage": 62, "accuracy": 74, "range": 70, "mobility": 50, "fire_rate": 78},
    "tribeam": {"damage": 58, "accuracy": 80, "range": 68, "mobility": 52, "fire_rate": 60},
    "longshot": {"damage": 70, "accuracy": 90, "range": 95, "mobility": 40, "fire_rate": 35},
    "recursion": {"damage": 64, "accuracy": 72, "range": 72, "mobility": 48, "fire_rate": 70},
    "prophecy": {"damage": 66, "accuracy": 98, "range": 80, "mobility": 45, "fire_rate": 48},
    "breacher": {"damage": 85, "accuracy": 55, "range": 28, "mobility": 45, "fire_rate": 30},
    "flechette": {"damage": 60, "accuracy": 35, "range": 18, "mobility": 50, "fire_rate": 45},
    "ripper": {"damage": 72, "accuracy": 50, "range": 32, "mobility": 55, "fire_rate": 55},
    "echo": {"damage": 78, "accuracy": 48, "range": 30, "mobility": 42, "fire_rate": 40},
    "unmake": {"damage": 80, "accuracy": 52, "range": 26, "mobility": 40, "fire_rate": 32},
    "shred": {"damage": 50, "accuracy": 58, "range": 45, "mobility": 85, "fire_rate": 88},
    "splitfire": {"damage": 55, "accuracy": 62, "range": 50, "mobility": 80, "fire_rate": 82},
    "flux": {"damage": 58, "accuracy": 60, "range": 48, "mobility": 78, "fire_rate": 86},
    "tempo": {"damage": 52, "accuracy": 55, "range": 46, "mobility": 90, "fire_rate": 95},
    "revenant": {"damage": 60, "accuracy": 58, "range": 48, "mobility": 82, "fire_rate": 84},
}


def _weapon(
    id: str,
    name: str,
    symbol: str,
    color: str,
    desc: str,
    fire_identity: str,
    uefn_asset: str,
    slot_policy: str,
    power_slots: list[dict[str, Any]],
    suggested_elements: list[str] | None = None,
    starter: bool = False,
    icon: str = "assets/weapons/pistol.svg",
    category: str = "Pistol",
) -> dict[str, Any]:
    rec: dict[str, Any] = {
        "id": id,
        "name": name,
        "symbol": symbol,
        "color": color,
        "category": category,
        "desc": desc,
        "fireIdentity": fire_identity,
        "slotPolicy": slot_policy,
        "powerSlots": power_slots,
        "suggestedElements": suggested_elements or [],
        "starter": starter,
        "uefnAsset": uefn_asset,
        "uefnIcon": f"/Roguelike/Weapons/Icons/T_Icon_{id.title().replace('_', '')}",
        "icon": icon,
        "verseClass": f"weapon_{id}",
        "upgrades": [],
        "skins": _demo_skins(color),
    }
    if id in WEAPON_ARMORY_STATS:
        rec["stats"] = dict(WEAPON_ARMORY_STATS[id])
    return rec


DEFAULT_WEAPONS: list[dict[str, Any]] = [
    _weapon(
        "service_pistol",
        "Service Pistol",
        "S",
        "#f59e0b",
        "Starter semi-auto. Tapping beats spamming — free crits reward patience at hour ten.",
        "Semi auto. Any shot fired after a 0.4s pause is a guaranteed crit.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_Service",
        "infusable",
        _open_slots(),
        ["Ice"],
        starter=True,
    ),
    _weapon(
        "hand_cannon",
        "Hand Cannon",
        "H",
        "#ef4444",
        "Six shots, heavy damage, real knockback. Overpressure pierce after every reload.",
        "Every reload chambers one Overpressure round that pierces through a target and keeps going.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_HandCannon",
        "infusable",
        _open_slots(),
        ["Void"],
    ),
    _weapon(
        "machine_pistol",
        "Machine Pistol",
        "M",
        "#22c55e",
        "Full auto on a heat gauge. Hold longer for more damage, pay with wider accuracy.",
        "Full auto on a heat gauge. Accuracy widens as heat climbs but damage climbs with it.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_Machine",
        "infusable",
        _open_slots(),
        ["Fire", "Lightning"],
    ),
    _weapon(
        "paradox",
        "Paradox",
        "P",
        "#94a3b8",
        "Time signature pistol. Every shot echoes 1.5s later at the same point in space.",
        "Every shot fires twice — once now, and an echo 1.5 seconds later at the exact same point in space.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_Arc",
        "locked_power",
        _locked_slots("stasis_field", "Stasis Field"),
        [],
    ),
    _weapon(
        "hourglass",
        "Hourglass",
        "G",
        "#64748b",
        "Time signature pistol. Accelerates aging; kills chamber a round instantly.",
        "Damage scales with how much health the target is missing. Kills chamber a round instantly, no reload.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_Pistol_Reaper",
        "locked_power",
        _locked_slots("rewind", "Rewind"),
        [],
    ),
    # Assault Rifles — class trait: Suppression
    _weapon(
        "vanguard",
        "Vanguard",
        "V",
        "#f97316",
        "Class trait Suppression: eight continuous hits on the same target makes it flinch and cut its damage output. ARs keep a target locked down while the party sets up reactions.",
        "Full auto that tightens instead of widening. After one second of held fire, spread drops to zero and damage ramps.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Vanguard",
        "infusable",
        _open_slots(),
        ["Fire"],
        icon="assets/weapons/assault_rifle.svg",
        category="Assault Rifle",
    ),
    _weapon(
        "tribeam",
        "Tribeam",
        "T",
        "#38bdf8",
        "Class trait Suppression: eight continuous hits on the same target makes it flinch and cut its damage output. ARs keep a target locked down while the party sets up reactions.",
        "Three round burst. All three landing refunds the ammo and applies double element stacks.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Tribeam",
        "infusable",
        _open_slots(),
        ["Ice", "Void"],
        icon="assets/weapons/assault_rifle.svg",
        category="Assault Rifle",
    ),
    _weapon(
        "longshot",
        "Longshot",
        "L",
        "#facc15",
        "Class trait Suppression: eight continuous hits on the same target makes it flinch and cut its damage output. ARs keep a target locked down while the party sets up reactions.",
        "Semi auto marksman. Damage scales upward with distance to target.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Longshot",
        "infusable",
        _open_slots(),
        ["Lightning"],
        icon="assets/weapons/assault_rifle.svg",
        category="Assault Rifle",
    ),
    _weapon(
        "recursion",
        "Recursion",
        "R",
        "#94a3b8",
        "Time signature AR. Class trait Suppression still applies — keep targets locked while Loop replays your fire.",
        "Every sixth shot instantly replays the previous five shots at once.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Recursion",
        "locked_power",
        _locked_slots("loop", "Loop"),
        [],
        icon="assets/weapons/assault_rifle.svg",
        category="Assault Rifle",
    ),
    _weapon(
        "prophecy",
        "Prophecy",
        "Y",
        "#cbd5e1",
        "Time signature AR. Class trait Suppression still applies — never miss a moving enemy while the party sets up.",
        "Shots resolve half a second ahead, so they land where the target will be. Never misses a moving enemy.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_AR_Prophecy",
        "locked_power",
        _locked_slots("precognition", "Precognition"),
        [],
        icon="assets/weapons/assault_rifle.svg",
        category="Assault Rifle",
    ),
    # Shotguns — class trait: Saturation
    _weapon(
        "breacher",
        "Breacher",
        "B",
        "#a855f7",
        "Class trait Saturation: every pellet applies element stacks individually. A full body hit up close procs a status instantly. Shotguns are the fastest status applier and start reactions for everyone else.",
        "Pump action, tight cone, heavy stagger. Loads shell by shell so you can cancel the reload at any point.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Breacher",
        "infusable",
        _open_slots(),
        ["Void"],
        icon="assets/weapons/shotgun.svg",
        category="Shotgun",
    ),
    _weapon(
        "flechette",
        "Flechette",
        "F",
        "#ef4444",
        "Class trait Saturation: every pellet applies element stacks individually. A full body hit up close procs a status instantly. Shotguns are the fastest status applier and start reactions for everyone else.",
        "Very wide cone, very high pellet count. Useless past ten meters, instant max stacks inside it.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Flechette",
        "infusable",
        _open_slots(),
        ["Fire", "Ice"],
        icon="assets/weapons/shotgun.svg",
        category="Shotgun",
    ),
    _weapon(
        "ripper",
        "Ripper",
        "I",
        "#facc15",
        "Class trait Saturation: every pellet applies element stacks individually. A full body hit up close procs a status instantly. Shotguns are the fastest status applier and start reactions for everyone else.",
        "Semi auto, fewer pellets per shot. Consecutive hits tighten the cone toward a slug.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Ripper",
        "infusable",
        _open_slots(),
        ["Lightning"],
        icon="assets/weapons/shotgun.svg",
        category="Shotgun",
    ),
    _weapon(
        "echo",
        "Echo",
        "E",
        "#94a3b8",
        "Time signature shotgun. Class trait Saturation still applies — pellets stack status while Aftershock records your damage.",
        "One trigger pull, three blasts. The shot repeats twice more at the same point in space, half a second apart.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Echo",
        "locked_power",
        _locked_slots("aftershock", "Aftershock"),
        [],
        icon="assets/weapons/shotgun.svg",
        category="Shotgun",
    ),
    _weapon(
        "unmake",
        "Unmake",
        "U",
        "#64748b",
        "Time signature shotgun. Class trait Saturation still applies — strip defenses while Regression reverts elites.",
        "Each pellet strips one layer of armor, shield, or buff from what it hits.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_SG_Unmake",
        "locked_power",
        _locked_slots("regression", "Regression"),
        [],
        icon="assets/weapons/shotgun.svg",
        category="Shotgun",
    ),
    # SMGs — class trait: Haste
    _weapon(
        "shred",
        "Shred",
        "S",
        "#ef4444",
        "Class trait Haste: sustained fire builds Haste stacks that raise movement and reload speed. SMGs are the only class that fires at full accuracy while sprinting or dashing.",
        "Consecutive hits on the same target stack a damage bonus. Miss and the stacks decay.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Shred",
        "infusable",
        _open_slots(),
        ["Fire"],
        icon="assets/weapons/smg.svg",
        category="SMG",
    ),
    _weapon(
        "splitfire",
        "Splitfire",
        "P",
        "#facc15",
        "Class trait Haste: sustained fire builds Haste stacks that raise movement and reload speed. SMGs are the only class that fires at full accuracy while sprinting or dashing.",
        "Two streams that converge at a fixed distance. Standing at the convergence point doubles your damage.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Splitfire",
        "infusable",
        _open_slots(),
        ["Lightning"],
        icon="assets/weapons/smg.svg",
        category="SMG",
    ),
    _weapon(
        "flux",
        "Flux",
        "X",
        "#38bdf8",
        "Class trait Haste: sustained fire builds Haste stacks that raise movement and reload speed. SMGs are the only class that fires at full accuracy while sprinting or dashing.",
        "Damage climbs as the magazine empties. The last quarter of the mag hits hardest.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Flux",
        "infusable",
        _open_slots(),
        ["Ice", "Void"],
        icon="assets/weapons/smg.svg",
        category="SMG",
    ),
    _weapon(
        "tempo",
        "Tempo",
        "T",
        "#e2e8f0",
        "Time signature SMG. Class trait Haste still applies — fire rate climbs while Accelerate doubles your tempo.",
        "Fire rate climbs the longer you hold the trigger with no cap. Release and it resets to base.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Tempo",
        "locked_power",
        _locked_slots("accelerate", "Accelerate"),
        [],
        icon="assets/weapons/smg.svg",
        category="SMG",
    ),
    _weapon(
        "revenant",
        "Revenant",
        "V",
        "#475569",
        "Time signature SMG. Class trait Haste still applies — leave afterimages while Second Self mirrors your fire.",
        "Every tenth kill leaves an afterimage of you that fires one burst at the nearest enemy.",
        "/Roguelike/Weapons/PlayerWeapons/WID_Player_SMG_Revenant",
        "locked_power",
        _locked_slots("second_self", "Second Self"),
        [],
        icon="assets/weapons/smg.svg",
        category="SMG",
    ),
]


def _wizardry(
    id: str,
    name: str,
    element: str,
    kind: str,
    desc: str,
    color: str,
    symbol: str,
    *,
    stack_name: str = "",
    stack_threshold: int = 5,
    proc_name: str = "",
    proc_desc: str = "",
    charged_name: str = "",
    charged_desc: str = "",
    findable: bool = True,
    buyable: bool = True,
    reusable: bool = True,
    custom_item_id: str = "",
    verse_class: str = "",
) -> dict[str, Any]:
    cid = custom_item_id or f"scroll_{id}"
    return {
        "id": id,
        "name": name,
        "element": element,
        "kind": kind,
        "desc": desc,
        "color": color,
        "symbol": symbol,
        "stackName": stack_name,
        "stackThreshold": stack_threshold,
        "procName": proc_name,
        "procDesc": proc_desc,
        "chargedName": charged_name,
        "chargedDesc": charged_desc,
        "findable": findable,
        "buyable": buyable,
        "reusable": reusable,
        "customItemId": cid,
        "uefnCustomItem": "",
        "verseClass": verse_class or f"wizardry_{id}",
        "category": "Wizardry",
    }


DEFAULT_WIZARDRY: list[dict[str, Any]] = [
    _wizardry(
        "burn_infusion",
        "Burn Infusion",
        "Fire",
        "element_infusion",
        "On hit, apply Burn stacks. At 5 stacks: Ignite.",
        "#ef4444",
        "F",
        stack_name="Burn",
        proc_name="Ignite",
        proc_desc="Damage over time that spreads to enemies standing close.",
    ),
    _wizardry(
        "cinder_nova",
        "Cinder Nova",
        "Fire",
        "charged",
        "Charged ability: ignites everything around you and doubles burn ticks for 6 seconds.",
        "#f97316",
        "N",
        charged_name="Cinder Nova",
        charged_desc="Ignites everything around you and doubles burn ticks for 6 seconds.",
    ),
    _wizardry(
        "chill_infusion",
        "Chill Infusion",
        "Ice",
        "element_infusion",
        "On hit, apply Chill stacks. At 5 stacks: Frozen.",
        "#38bdf8",
        "I",
        stack_name="Chill",
        proc_name="Frozen",
        proc_desc="Target locked in place and takes 2x crit damage until it breaks.",
    ),
    _wizardry(
        "frost_field",
        "Frost Field",
        "Ice",
        "charged",
        "Charged ability: zone that chills everything inside continuously.",
        "#0ea5e9",
        "Z",
        charged_name="Frost Field",
        charged_desc="Zone that chills everything inside continuously.",
    ),
    _wizardry(
        "charge_infusion",
        "Charge Infusion",
        "Lightning",
        "element_infusion",
        "On hit, apply Charge stacks. At 5 stacks: Overload.",
        "#facc15",
        "L",
        stack_name="Charge",
        proc_name="Overload",
        proc_desc="Bursts and jumps to 3 nearby enemies, applying charge to them.",
    ),
    _wizardry(
        "storm_call",
        "Storm Call",
        "Lightning",
        "charged",
        "Charged ability: strikes the 6 highest charge targets on screen.",
        "#eab308",
        "K",
        charged_name="Storm Call",
        charged_desc="Strikes the 6 highest charge targets on screen.",
    ),
    _wizardry(
        "decay_infusion",
        "Decay Infusion",
        "Void",
        "element_infusion",
        "On hit, apply Decay stacks. At 5 stacks: Collapse.",
        "#a855f7",
        "V",
        stack_name="Decay",
        proc_name="Collapse",
        proc_desc="Pulls nearby enemies toward the target and cuts their damage output.",
    ),
    _wizardry(
        "singularity",
        "Singularity",
        "Void",
        "charged",
        "Charged ability: throws a rift that pulls, holds, and drains everything caught.",
        "#7c3aed",
        "Q",
        charged_name="Singularity",
        charged_desc="Throws a rift that pulls, holds, and drains everything caught.",
    ),
    # Time signatures — locked to Paradox / Hourglass, not findable scrolls
    _wizardry(
        "stasis_field",
        "Stasis Field",
        "Time",
        "locked_signature",
        "Time stops inside a zone. Enemies hold still; all damage dealt is stored and lands at once when the field drops.",
        "#94a3b8",
        "T",
        findable=False,
        buyable=False,
        reusable=False,
        custom_item_id="",
        charged_name="Stasis Field",
        charged_desc="Time stops inside a zone. Damage is stored and lands when the field drops.",
    ),
    _wizardry(
        "rewind",
        "Rewind",
        "Time",
        "locked_signature",
        "Your health, ammo, and position return to what they were 5 seconds ago.",
        "#64748b",
        "R",
        findable=False,
        buyable=False,
        reusable=False,
        custom_item_id="",
        charged_name="Rewind",
        charged_desc="Health, ammo, and position snap back 5 seconds.",
    ),
    _wizardry(
        "loop",
        "Loop",
        "Time",
        "locked_signature",
        "Records four seconds of your fire, then replays it on its own while you do something else.",
        "#94a3b8",
        "L",
        findable=False,
        buyable=False,
        reusable=False,
        custom_item_id="",
        charged_name="Loop",
        charged_desc="Records four seconds of your fire, then replays it on its own while you do something else.",
    ),
    _wizardry(
        "precognition",
        "Precognition",
        "Time",
        "locked_signature",
        "For six seconds nothing you can see can hit you.",
        "#cbd5e1",
        "P",
        findable=False,
        buyable=False,
        reusable=False,
        custom_item_id="",
        charged_name="Precognition",
        charged_desc="For six seconds nothing you can see can hit you.",
    ),
    _wizardry(
        "aftershock",
        "Aftershock",
        "Time",
        "locked_signature",
        "For five seconds everything you deal is recorded, then replays at the same spots three seconds later.",
        "#94a3b8",
        "A",
        findable=False,
        buyable=False,
        reusable=False,
        custom_item_id="",
        charged_name="Aftershock",
        charged_desc="For five seconds everything you deal is recorded, then replays at the same spots three seconds later.",
    ),
    _wizardry(
        "regression",
        "Regression",
        "Time",
        "locked_signature",
        "Reverts every enemy in front of you to an earlier state, removing shields, armor, and elite modifiers outright.",
        "#64748b",
        "G",
        findable=False,
        buyable=False,
        reusable=False,
        custom_item_id="",
        charged_name="Regression",
        charged_desc="Reverts every enemy in front of you to an earlier state, removing shields, armor, and elite modifiers outright.",
    ),
    _wizardry(
        "accelerate",
        "Accelerate",
        "Time",
        "locked_signature",
        "You move, shoot, and reload at double speed while the world runs normal.",
        "#e2e8f0",
        "C",
        findable=False,
        buyable=False,
        reusable=False,
        custom_item_id="",
        charged_name="Accelerate",
        charged_desc="You move, shoot, and reload at double speed while the world runs normal.",
    ),
    _wizardry(
        "second_self",
        "Second Self",
        "Time",
        "locked_signature",
        "A time clone appears and mirrors everything you fire for eight seconds.",
        "#475569",
        "2",
        findable=False,
        buyable=False,
        reusable=False,
        custom_item_id="",
        charged_name="Second Self",
        charged_desc="A time clone appears and mirrors everything you fire for eight seconds.",
    ),
]


def _scroll_item(power: dict[str, Any]) -> dict[str, Any]:
    """Reusable findable/buyable custom-item scroll linked to a wizardry power."""
    zeros = {s["id"]: 0 for s in DEFAULT_STATS}
    return {
        "id": power["customItemId"],
        "name": f"Scroll: {power['name']}",
        "category": "Scroll",
        "symbol": power.get("symbol", "?"),
        "color": power.get("color", "#a855f7"),
        "desc": f"Reusable scroll. Slot onto any open weapon power slot. {power.get('desc', '')}",
        "stats": zeros,
        "wizardryId": power["id"],
        "element": power["element"],
        "reusable": True,
        "uefnCustomItem": power.get("uefnCustomItem", ""),
        "verseClass": power.get("verseClass", ""),
    }


DEFAULT_SCROLL_ITEMS: list[dict[str, Any]] = [
    _scroll_item(p) for p in DEFAULT_WIZARDRY if p.get("findable") and p.get("customItemId")
]

OLD_STUB_WEAPON_IDS = {
    "pistol",
    "assault_rifle",
    "smg",
    "shotgun",
    "bolt_sniper",
    "auto_sniper",
    "rocket_launcher",
    "bow",
    "crossbow",
    "minigun",
}

def _progression_level_table(max_level: int = 30, points_per_level: int = 1) -> list[dict[str, Any]]:
    """One row per player level: XP threshold + skill points granted at that level."""
    rows: list[dict[str, Any]] = []
    xp = 0
    for lv in range(1, max_level + 1):
        # Mild quadratic XP so later levels feel heavier without a custom curve editor.
        xp += int(80 + lv * 35 + (lv * lv) * 2)
        rows.append({
            "level": lv,
            "xp": xp,
            "points": points_per_level if lv > 1 else 1,  # level 1 grants the first point
            "notes": "",
        })
    return rows


def _tree_node(
    id: str,
    name: str,
    x: float,
    y: float,
    *,
    max_rank: int = 1,
    cost: int = 1,
    requires: list[str] | None = None,
    icon: str = "sparkles",
    color: str = "#a855f7",
    desc: str = "",
    effect: str = "",
    stat_mods: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": id,
        "name": name,
        "x": x,
        "y": y,
        "maxRank": max_rank,
        "cost": cost,
        "requires": list(requires or []),
        "icon": icon,
        "color": color,
        "desc": desc,
        "effect": effect,
        "statMods": dict(stat_mods or {}),
    }


# Player progression: level curve (points per level) + skill node tree.
# Spend points on nodes; later nodes require earlier ones (skip until unlocked).
DEFAULT_PROGRESSION: dict[str, Any] = {
    "maxLevel": 30,
    "pointsPerLevel": 1,
    "levelTable": _progression_level_table(30, 1),
    "scaling": [
        {"statId": "hp", "label": "Health", "base": 100, "perLevel": 12, "curve": "linear"},
        {"statId": "attack", "label": "Damage", "base": 20, "perLevel": 2.5, "curve": "linear"},
        {"statId": "defense", "label": "Defense", "base": 5, "perLevel": 0.8, "curve": "linear"},
        {"statId": "speed", "label": "Speed", "base": 300, "perLevel": 2, "curve": "linear"},
    ],
    "tree": {
        "width": 900,
        "height": 520,
        "nodes": [
            # Tier 1 — root unlocks (Shield is the intended first pick)
            _tree_node(
                "shield", "Shield", 60, 200,
                max_rank=1, cost=1, icon="shield", color="#38bdf8",
                desc="Unlock your starting shield.",
                effect="Unlock Shield",
                stat_mods={"defense": 5},
            ),
            _tree_node(
                "vitality", "Vitality", 60, 80,
                max_rank=5, cost=1, icon="heart", color="#ef4444",
                desc="More max health per rank.",
                effect="+12 HP / rank",
                stat_mods={"hp": 12},
            ),
            _tree_node(
                "might", "Might", 60, 320,
                max_rank=5, cost=1, icon="swords", color="#f97316",
                desc="Flat damage per rank.",
                effect="+3 Attack / rank",
                stat_mods={"attack": 3},
            ),
            # Tier 2 — branches off Shield
            _tree_node(
                "guard", "Guard", 240, 120,
                max_rank=5, cost=1, requires=["shield"], icon="shield-check", color="#22d3ee",
                desc="Improve block strength.",
                effect="+2 Defense / rank",
                stat_mods={"defense": 2},
            ),
            _tree_node(
                "bulwark", "Bulwark", 240, 200,
                max_rank=3, cost=1, requires=["shield"], icon="brick-wall", color="#64748b",
                desc="Heavier shield — more defense, slower.",
                effect="+4 Defense / rank",
                stat_mods={"defense": 4, "speed": -5},
            ),
            _tree_node(
                "riposte", "Riposte", 240, 280,
                max_rank=5, cost=1, requires=["shield"], icon="swords", color="#eab308",
                desc="Counter after a block.",
                effect="+2 Attack / rank while shielded",
                stat_mods={"attack": 2},
            ),
            # Tier 3 — combine / deeper
            _tree_node(
                "aegis", "Aegis", 440, 160,
                max_rank=3, cost=1, requires=["guard", "bulwark"], icon="sparkles", color="#a855f7",
                desc="Combine Guard + Bulwark into a true aegis.",
                effect="+6 Defense / rank",
                stat_mods={"defense": 6},
            ),
            _tree_node(
                "magic_find", "Magic Find", 440, 280,
                max_rank=5, cost=1, requires=["riposte"], icon="clover", color="#4ade80",
                desc="Increases drop quantity.",
                effect="+1 Drop Quantity / rank",
            ),
            # Tier 4 — late unlocks (need more points — skip until later)
            _tree_node(
                "fortune", "Fortune", 660, 200,
                max_rank=10, cost=1, requires=["aegis", "magic_find"], icon="dices", color="#fbbf24",
                desc="Late-tree luck — skip until you have the points.",
                effect="+Luck / rank",
            ),
            _tree_node(
                "crown", "Crown", 660, 320,
                max_rank=3, cost=2, requires=["aegis"], icon="crown", color="#f59e0b",
                desc="Premium capstone. Costs 2 points per rank.",
                effect="+8 Attack & +8 Defense / rank",
                stat_mods={"attack": 8, "defense": 8},
            ),
        ],
    },
}


def default_state() -> dict[str, Any]:
    items = deepcopy(DEFAULT_ITEMS) + deepcopy(DEFAULT_SCROLL_ITEMS)
    return {
        "version": 8,
        "stats": deepcopy(DEFAULT_STATS),
        "difficulties": deepcopy(DEFAULT_DIFFICULTIES),
        "currencies": deepcopy(DEFAULT_CURRENCIES),
        "progression": deepcopy(DEFAULT_PROGRESSION),
        "npcs": deepcopy(DEFAULT_NPCS),
        "items": items,
        "dropTables": deepcopy(DEFAULT_DROP_TABLES),
        "weapons": deepcopy(DEFAULT_WEAPONS),
        "wizardry": deepcopy(DEFAULT_WIZARDRY),
        "elements": deepcopy(DEFAULT_ELEMENTS),
        "levels": [_starter_level()],
        "journeys": [_starter_journey()],
        "chunks": deepcopy(DEFAULT_CHUNKS),
        "chunkAssets": deepcopy(DEFAULT_CHUNK_ASSETS),
        "genTemplates": deepcopy(DEFAULT_GEN_TEMPLATES),
        "scene": {"actors": [], "lastSync": None, "listener": "unknown"},
        "log": [],
        "meta": {
            "activeLevelId": "lvl_training_room",
            "activeTab": "dashboard",
            "levelsSubtab": "gen",
            "infusionRerollPolicy": "hub",
            "weaponClassTraits": deepcopy(DEFAULT_WEAPON_CLASS_TRAITS),
        },
    }


def merge_defaults(existing: dict[str, Any]) -> dict[str, Any]:
    """Fill missing catalogue fields without wiping designer edits."""
    base = default_state()
    out = deepcopy(base)
    out.update({k: deepcopy(v) for k, v in existing.items() if k not in base})
    if existing.get("stats"):
        out["stats"] = existing["stats"]
    if existing.get("difficulties"):
        out["difficulties"] = existing["difficulties"]
    # Progression: keep designer tree/curve; seed full defaults if missing.
    if existing.get("progression") and isinstance(existing["progression"], dict):
        prog = deepcopy(existing["progression"])
        base_prog = deepcopy(DEFAULT_PROGRESSION)
        for k, v in base_prog.items():
            prog.setdefault(k, deepcopy(v))
        if not prog.get("levelTable"):
            prog["levelTable"] = _progression_level_table(
                int(prog.get("maxLevel") or 30),
                int(prog.get("pointsPerLevel") or 1),
            )
        tree = prog.setdefault("tree", {"nodes": []})
        if not isinstance(tree, dict):
            prog["tree"] = deepcopy(base_prog["tree"])
        elif not tree.get("nodes"):
            prog["tree"] = deepcopy(base_prog["tree"])
        out["progression"] = prog
    else:
        out["progression"] = deepcopy(DEFAULT_PROGRESSION)
    # Currencies: respect the designer list as-is (including deletions).
    # Only seed Gold/Gems/Keys when the project has no currencies yet.
    # meta.removedCurrencyIds is a tombstone list so deleted defaults cannot be
    # re-injected by a stale panel tab that still has them in memory.
    # Also union tombstones from the on-disk store — set_store hot-reloads this
    # module, so this runs even before the rest of the plugin process restarts.
    meta_in = existing.get("meta") if isinstance(existing.get("meta"), dict) else {}
    removed_ids = {
        str(x)
        for x in (meta_in.get("removedCurrencyIds") or [])
        if x
    }
    try:
        from .store_io import store_path, _read_file

        for snap_path in (store_path(), store_path().with_name("store.prev.json")):
            disk = _read_file(snap_path) or {}
            dmeta = disk.get("meta") if isinstance(disk.get("meta"), dict) else {}
            for x in dmeta.get("removedCurrencyIds") or []:
                if x:
                    removed_ids.add(str(x))
    except Exception:
        pass
    if removed_ids:
        out_meta = out.setdefault("meta", {})
        if not isinstance(out_meta, dict):
            out_meta = {}
            out["meta"] = out_meta
        prev = {str(x) for x in (out_meta.get("removedCurrencyIds") or []) if x}
        out_meta["removedCurrencyIds"] = sorted(prev | removed_ids)
    if existing.get("currencies") is not None:
        out["currencies"] = [
            deepcopy(c)
            for c in existing["currencies"]
            if isinstance(c, dict) and c.get("id") not in removed_ids
        ]
    else:
        out["currencies"] = [
            deepcopy(c) for c in DEFAULT_CURRENCIES if c["id"] not in removed_ids
        ]
    if existing.get("levels"):
        out["levels"] = [
            normalize_level(l) for l in existing["levels"] if isinstance(l, dict)
        ]
        if existing.get("meta", {}).get("activeLevelId"):
            out["meta"]["activeLevelId"] = existing["meta"]["activeLevelId"]
    else:
        out["levels"] = [normalize_level(l) for l in out.get("levels") or []]
    if existing.get("journeys") is not None:
        out["journeys"] = [
            normalize_journey_record(j) for j in existing["journeys"] if isinstance(j, dict)
        ]
    else:
        out["journeys"] = [
            normalize_journey_record(j) for j in (out.get("journeys") or []) if isinstance(j, dict)
        ]
    migrate_journeys_catalogue(out)
    # Collapse legacy nav tabs into Levels subtabs.
    meta_out = out.setdefault("meta", {})
    if not isinstance(meta_out, dict):
        meta_out = {}
        out["meta"] = meta_out
    legacy_tab = str(meta_out.get("activeTab") or existing.get("meta", {}).get("activeTab") or "")
    if legacy_tab in ("procgen", "chunks"):
        meta_out["activeTab"] = "levels"
        meta_out["levelsSubtab"] = "gen" if legacy_tab == "procgen" else "chunks"
    meta_out.setdefault("levelsSubtab", "gen")
    if meta_out.get("levelsSubtab") not in ("gen", "chunks", "journeys"):
        meta_out["levelsSubtab"] = "gen"
    if existing.get("items"):
        out["items"] = existing["items"]
        # Ensure scroll items + starter currency purse exist
        seen_items = {i.get("id") for i in out["items"]}
        for sc in DEFAULT_SCROLL_ITEMS:
            if sc["id"] not in seen_items:
                out["items"].append(deepcopy(sc))
        for it in DEFAULT_ITEMS:
            if it["id"] not in seen_items and it.get("category") == "Currency":
                out["items"].append(deepcopy(it))
        for it in out["items"]:
            if not isinstance(it, dict):
                continue
            it.setdefault("currencyReward", {})
            if "price" not in it or not isinstance(it.get("price"), dict):
                it["price"] = {"currencyId": "gold", "amount": 0}
    elif not existing.get("items"):
        out["items"] = deepcopy(DEFAULT_ITEMS) + deepcopy(DEFAULT_SCROLL_ITEMS)

    by_id = {n["id"]: n for n in DEFAULT_NPCS}
    merged_npcs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for npc in existing.get("npcs") or []:
        nid = npc.get("id")
        if not nid:
            continue
        seen.add(nid)
        rec = deepcopy(npc)
        template = by_id.get(nid)
        rec["type"] = _normalize_npc_type(rec.get("type") or (template or {}).get("type") or "Enemy")
        role = rec.get("role") or (template or {}).get("role") or ""
        if role not in NPC_ROLES:
            role = _infer_npc_role(rec.get("behavior") or "", rec.get("stats") or {})
            if rec["type"] == "Friendly" and role == "Melee":
                role = "Civilian"
        rec["role"] = role
        if not isinstance(rec.get("currencyDrop"), dict):
            if template and isinstance(template.get("currencyDrop"), dict):
                rec["currencyDrop"] = deepcopy(template["currencyDrop"])
            else:
                rec["currencyDrop"] = {}
        # Shared + bonus loot (v7)
        ids = rec.get("dropTableIds")
        if not isinstance(ids, list):
            if template and isinstance(template.get("dropTableIds"), list):
                rec["dropTableIds"] = list(template["dropTableIds"])
            else:
                # Sensible starter attachments for stock enemies
                if nid == "boss":
                    rec["dropTableIds"] = ["dt_boss_hoard"]
                elif nid in ("charger", "large_charger", "hooker", "sploder", "mage", "grenadier"):
                    rec["dropTableIds"] = ["dt_elite_cache"] if "elite" in str(rec.get("type") or "").lower() or nid in ("large_charger", "mage") else ["dt_common_trash"]
                elif rec.get("type") in ("Enemy", "Elite"):
                    rec["dropTableIds"] = ["dt_elite_cache"] if rec.get("type") == "Elite" else ["dt_common_trash"]
                else:
                    rec["dropTableIds"] = []
        else:
            rec["dropTableIds"] = [str(x) for x in ids if x]
        rec["bonusDrops"] = normalize_drop_entries(rec.get("bonusDrops"))
        if "difficultyStats" not in rec:
            if template and template.get("difficultyStats"):
                rec["difficultyStats"] = deepcopy(template["difficultyStats"])
            elif rec.get("stats"):
                weight = 2 if rec.get("type") == "Elite" else (5 if rec.get("type") == "Boss" else 1)
                rec["difficultyStats"] = difficulty_triplet(rec["stats"], weight)
        merged_npcs.append(rec)
    for npc in DEFAULT_NPCS:
        if npc["id"] not in seen:
            merged_npcs.append(deepcopy(npc))
    out["npcs"] = merged_npcs


    # Drop tables (v7): named shared loot pools NPCs can attach.
    if existing.get("dropTables") and isinstance(existing["dropTables"], list):
        by_dt = {t["id"]: t for t in DEFAULT_DROP_TABLES if t.get("id")}
        merged_dt: list[dict[str, Any]] = []
        seen_dt: set[str] = set()
        for t in existing["dropTables"]:
            if not isinstance(t, dict) or not t.get("id"):
                continue
            tid = t["id"]
            seen_dt.add(tid)
            rec = deepcopy(t)
            tpl = by_dt.get(tid)
            if tpl:
                for k, v in tpl.items():
                    if k == "entries":
                        continue
                    rec.setdefault(k, deepcopy(v) if isinstance(v, (dict, list)) else v)
            rec["entries"] = normalize_drop_entries(rec.get("entries"))
            merged_dt.append(rec)
        for t in DEFAULT_DROP_TABLES:
            if t["id"] not in seen_dt:
                merged_dt.append(deepcopy(t))
        out["dropTables"] = merged_dt
    else:
        out["dropTables"] = deepcopy(DEFAULT_DROP_TABLES)

    # Weapons: v4 replaces old stub catalogue; preserve non-stub designer weapons
    existing_weapons = existing.get("weapons") or []
    existing_ids = {w.get("id") for w in existing_weapons if w.get("id")}
    only_stubs = bool(existing_ids) and existing_ids.issubset(OLD_STUB_WEAPON_IDS)
    ver = int(existing.get("version") or 1)
    if ver < 4 or only_stubs or not existing_weapons:
        out["weapons"] = deepcopy(DEFAULT_WEAPONS)
    else:
        by_w = {w["id"]: w for w in DEFAULT_WEAPONS}
        merged_weapons: list[dict[str, Any]] = []
        seen_w: set[str] = set()
        for w in existing_weapons:
            wid = w.get("id")
            if not wid or wid in OLD_STUB_WEAPON_IDS:
                continue
            seen_w.add(wid)
            rec = deepcopy(w)
            tpl = by_w.get(wid)
            if tpl:
                for k in (
                    "fireIdentity",
                    "slotPolicy",
                    "powerSlots",
                    "suggestedElements",
                    "verseClass",
                    "starter",
                ):
                    if k not in rec or rec.get(k) in (None, "", []):
                        rec[k] = deepcopy(tpl[k])
                if not rec.get("uefnAsset"):
                    rec["uefnAsset"] = tpl.get("uefnAsset")
                if not rec.get("icon"):
                    rec["icon"] = tpl.get("icon")
            rec.setdefault("category", "Pistol")
            rec.setdefault("slotPolicy", "infusable")
            slots = rec.get("powerSlots")
            if not isinstance(slots, list) or len(slots) < 2:
                if tpl and isinstance(tpl.get("powerSlots"), list) and len(tpl["powerSlots"]) >= 2:
                    rec["powerSlots"] = deepcopy(tpl["powerSlots"])
                elif rec.get("slotPolicy") == "locked_power" and isinstance(slots, list) and slots:
                    rec["powerSlots"] = [deepcopy(slots[0]), _power_slot_open(index=2, slot_id="slot_element")]
                else:
                    rec["powerSlots"] = _open_slots()
            skins = rec.get("skins")
            if not isinstance(skins, list) or len(skins) < 4:
                rec["skins"] = deepcopy(tpl["skins"]) if tpl and isinstance(tpl.get("skins"), list) else _demo_skins(str(rec.get("color") or "#9ca3af"))
            if not (isinstance(rec.get("stats"), dict) and rec["stats"]):
                if wid in WEAPON_ARMORY_STATS:
                    rec["stats"] = dict(WEAPON_ARMORY_STATS[wid])
                elif tpl and isinstance(tpl.get("stats"), dict):
                    rec["stats"] = deepcopy(tpl["stats"])
            merged_weapons.append(rec)
        for w in DEFAULT_WEAPONS:
            if w["id"] not in seen_w:
                merged_weapons.append(deepcopy(w))
        out["weapons"] = merged_weapons

    # Wizardry + elements
    if ver < 4 or not existing.get("wizardry"):
        out["wizardry"] = deepcopy(DEFAULT_WIZARDRY)
    else:
        by_p = {p["id"]: p for p in DEFAULT_WIZARDRY}
        merged_p: list[dict[str, Any]] = []
        seen_p: set[str] = set()
        for p in existing.get("wizardry") or []:
            pid = p.get("id")
            if not pid:
                continue
            seen_p.add(pid)
            rec = deepcopy(p)
            tpl = by_p.get(pid)
            if tpl:
                for k, v in tpl.items():
                    rec.setdefault(k, deepcopy(v) if isinstance(v, (dict, list)) else v)
            merged_p.append(rec)
        for p in DEFAULT_WIZARDRY:
            if p["id"] not in seen_p:
                merged_p.append(deepcopy(p))
        out["wizardry"] = merged_p

    if ver < 4 or not existing.get("elements"):
        out["elements"] = deepcopy(DEFAULT_ELEMENTS)
    else:
        out["elements"] = existing["elements"]

    if existing.get("scene"):
        out["scene"] = existing["scene"]
    if existing.get("log"):
        out["log"] = existing["log"]
    if existing.get("meta"):
        out["meta"] = {**out.get("meta", {}), **existing["meta"]}
    # Re-apply after meta merge — existing.activeTab may still be procgen/chunks.
    meta_final = out.setdefault("meta", {})
    if isinstance(meta_final, dict):
        tab = str(meta_final.get("activeTab") or "")
        if tab in ("procgen", "chunks"):
            meta_final["levelsSubtab"] = "gen" if tab == "procgen" else "chunks"
            meta_final["activeTab"] = "levels"
        meta_final.setdefault("levelsSubtab", "gen")
        if meta_final.get("levelsSubtab") not in ("gen", "chunks", "journeys"):
            meta_final["levelsSubtab"] = "gen"
    out["meta"].setdefault("infusionRerollPolicy", "hub")
    out["meta"].setdefault("weaponClassTraits", deepcopy(DEFAULT_WEAPON_CLASS_TRAITS))
    # Fill any missing class-trait categories without wiping designer edits
    traits = out["meta"].setdefault("weaponClassTraits", {})
    for cat, trait in DEFAULT_WEAPON_CLASS_TRAITS.items():
        traits.setdefault(cat, deepcopy(trait))
    # Weapons / wizardry: ensure optional shop price shape exists.
    for w in out.get("weapons") or []:
        if isinstance(w, dict) and not isinstance(w.get("price"), dict):
            w["price"] = {"currencyId": "gold", "amount": 0}
    for p in out.get("wizardry") or []:
        if isinstance(p, dict) and not isinstance(p.get("price"), dict):
            p["price"] = {"currencyId": "gold", "amount": 0}

    # Chunks / gen templates (v8): seed defaults when missing; keep designer lists.
    # Content-align + footprint bump: known catalogue ids always take DEFAULT
    # size/path/sockets (rooms 4×4, boss 8×8). Custom (non-default) ids kept.
    if not isinstance(out.get("meta"), dict):
        out["meta"] = {}
    meta = out["meta"]
    default_by_id = {c.get("id"): c for c in DEFAULT_CHUNKS if c.get("id")}
    # v4: Egypt prefab folder + tags — refresh known catalogue ids; never keep EP_Chk_*.
    force_footprints = int(meta.get("chunksFootprintAlign") or 0) < 4
    if existing.get("chunks") and isinstance(existing["chunks"], list) and existing["chunks"]:
        kept: list[dict] = []
        seen: set[str] = set()
        for raw in existing["chunks"]:
            if not isinstance(raw, dict):
                continue
            cid = raw.get("id")
            if not cid or cid in LEGACY_FAKE_CHUNK_IDS or cid in seen:
                continue
            seen.add(str(cid))
            if cid in default_by_id:
                d = deepcopy(default_by_id[cid])
                raw_pp = str(raw.get("prefabPath") or "")
                def_pp = str(d.get("prefabPath") or "")
                # Prefer any Egypt path (DEFAULT or store) over stale EP_Chk_* / empty.
                if "/Egypt/" in raw_pp and "/Egypt/" not in def_pp:
                    d["prefabPath"] = raw_pp
                    if raw.get("tags") is not None:
                        d["tags"] = list(raw.get("tags") or [])
                    if raw.get("name"):
                        d["name"] = raw["name"]
                elif not force_footprints:
                    for k in ("weight", "minCount", "maxCount", "mirror"):
                        if raw.get(k) is not None:
                            d[k] = raw[k]
                # Stale host DEFAULT (EP_Chk / empty) must not clobber store Egypt.
                if "/Egypt/" not in str(d.get("prefabPath") or "") and "/Egypt/" in raw_pp:
                    d["prefabPath"] = raw_pp
                kept.append(normalize_chunk(d))
            else:
                kept.append(normalize_chunk(raw))
        for c in DEFAULT_CHUNKS:
            cid = c.get("id")
            if cid and cid not in seen:
                kept.append(deepcopy(c))
                seen.add(str(cid))
        out["chunks"] = kept
    else:
        out["chunks"] = deepcopy(DEFAULT_CHUNKS)
    meta["chunksFootprintAlign"] = 4
    # Kit + prop catalogue — upsert defaults by id; refresh kit_* fields once.
    default_assets = {a["id"]: a for a in DEFAULT_CHUNK_ASSETS if a.get("id")}
    force_kit = int(meta.get("chunksAssetsKitAlign") or 0) < 1
    if existing.get("chunkAssets") and isinstance(existing["chunkAssets"], list) and existing["chunkAssets"]:
        assets: list[dict] = []
        seen_a: set[str] = set()
        for raw in existing["chunkAssets"]:
            a = normalize_chunk_asset(raw)
            if not a or a["id"] in seen_a:
                continue
            seen_a.add(a["id"])
            if force_kit and a["id"] in default_assets:
                d = deepcopy(default_assets[a["id"]])
                # Keep designer rename; refresh Content path / preview / kind from kit defaults.
                if a.get("name") and a["name"] != a["id"]:
                    d["name"] = a["name"]
                assets.append(normalize_chunk_asset(d) or a)
            else:
                assets.append(a)
        for a in DEFAULT_CHUNK_ASSETS:
            if a["id"] not in seen_a:
                assets.append(normalize_chunk_asset(deepcopy(a)) or deepcopy(a))
                seen_a.add(a["id"])
        out["chunkAssets"] = [x for x in assets if x]
    else:
        out["chunkAssets"] = [
            normalize_chunk_asset(deepcopy(a)) or deepcopy(a) for a in DEFAULT_CHUNK_ASSETS
        ]
    meta["chunksAssetsKitAlign"] = 1
    if existing.get("genTemplates") and isinstance(existing["genTemplates"], list) and existing["genTemplates"]:
        tpls = [normalize_template(t) for t in existing["genTemplates"] if isinstance(t, dict)]
        seen_t = {t.get("id") for t in tpls if t.get("id")}
        for t in DEFAULT_GEN_TEMPLATES:
            tid = t.get("id")
            if tid and tid not in seen_t:
                tpls.append(normalize_template(deepcopy(t)))
                seen_t.add(tid)
        out["genTemplates"] = tpls
    else:
        out["genTemplates"] = deepcopy(DEFAULT_GEN_TEMPLATES)

    out["version"] = max(ver, 8)
    return out
